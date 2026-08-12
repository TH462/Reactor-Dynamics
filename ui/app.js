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

  // WRITE ONLY WHAT CHANGED. `el.textContent = s` and `el.innerHTML = s` DESTROY and
  // recreate the element's child nodes even when the string is byte-identical — the DOM
  // has no idea the value is the same. The render pass runs once per broadcast, which is
  // 10 Hz normally and 20 Hz in a transient, and it was doing this unconditionally right
  // across the right-hand column.
  //
  // MEASURED on the real shell during a scram + large LOCA, childList mutations in 10 s:
  // 3960 on the failure list's buttons (24 rows x every frame, and the text only changes
  // when a failure toggles), 990 on the vital gauge values, 1155 on the chart x-axis,
  // 866 on the trend arrows. Thousands of node replacements a second, none of them
  // carrying new information — and these are exactly the elements the owner reported
  // flickering (2026-08-06: "vital gauges, bottom strip chart, alarm box, time stamp").
  //
  // Cheap to compare, so the guard is always worth it: a string compare against the
  // property is far less work than the node churn it avoids.
  function txt(el, s) { if (el && el.textContent !== s) el.textContent = s; }
  function setHTML(el, s) { if (el && el.__h !== s) { el.__h = s; el.innerHTML = s; } }

  // ----------------------------------------------------------- UI state
  var ui = {
    units: 'US',            // 'US' | 'SI'
    register: 'learning',   // 'learning' | 'industry'
    overlay: 'instruments', // 'instruments' | 'true' | 'both'
    diagMode: 'learning',   // synoptic: 'learning' (M8 Education) | 'realistic'
    physOverlay: false,     // synoptic: Physics Overlay toggle (Learning only)
    rodSpeed: 'normal',
    window: 300,            // strip-chart seconds
    series: {},             // per-plant; defaults set on plant load — "is it plotted at all"
    /* WHICH SIDE(S) each plotted channel traces (#454): id -> 'ind' | 'phys' | 'both'.
     * ABSENT MEANS "follow the global Learning/Realistic rule", which is why this starts
     * empty and is never pre-filled — a pre-filled map would freeze every channel against
     * the diagMode that happened to be set when the plant loaded, and the Settings switch
     * would then appear to do nothing. See sideOf().
     *
     * Deliberately NOT persisted, unlike the panel state: it would save the SIDES of channel
     * selections that are themselves forgotten on reload. Reset wherever `series` is. */
    seriesSide: {},
    plant: 'pwr',           // active plant_id
    engineKey: 'pwr',       // active engine selector key
    // The SHIPPED starting point *(OWNER, 2026-08-08: "the plant should start with the 50%
    // power preset")*. Kept in step with ENGINES.pwr.init below — this one seeds the very
    // first render, that one is what a plant switch and Reset go back to, and a mismatch
    // shows up as a board that changes under you one broadcast in.
    initState: '50_percent',
    view: 'diagram',        // plant-display active view
    pdAck: {},              // operator-acknowledged auto-actuations (ECCS/AFW → green)
    pdOp: {},               // operator-initiated systems (start green directly)
    ctlVals: {},            // last value typed into each control-bar number input (id → value), so the shared bar doesn't revert on view switch
    manualSection: 'overview', // active section in the Operator's Manual overlay
    follow: null,           // { id, idx } — a procedure being followed in the Instructor block
    inspectExpanded: false, // Scanner grown to show the full description (owner, 2026-08-11)
    indFilter: 'all',       // merged list row-type chip: all | paired | ind | phys (#439)
    indTruth: null,         // HR1 truth column: null = follow the mode default (off in missions)
  };
  var service, latest = null, lastScrammed = false;
  // Operator automation now lives IN-STACK (layers/control/control_kernel.js);
  // the Automate tab is a pure face over snapshot.automation, issuing
  // set_auto_channel / set_auto_setpoint commands like any operator action.
  // { t, v:Float64Array, tv:Float64Array } — one COLUMN per series in the profile, indexed
  // by `serCol` below. Values that do not exist on a side (a `ctl` series has no truth, a
  // truth-only series has no channel) are NaN, which every consumer already rejects through
  // its `isFinite` guard.
  //
  // PACKED, NOT id-KEYED, AND THAT IS A CAPACITY DECISION, not tidiness. The rows used to be
  // `{ v: { serId: num } }`, whose cost is per stored PROPERTY. MEASURED at the shipped
  // CHART_ROW_BUDGET of 9000 rows, both sides populated:
  //     series     id-keyed objects     Float64Array
  //         40           39.5 MB            9.6 MB
  //         51           68.9 MB           11.1 MB
  //        110          137.8 MB           19.2 MB
  // The Indications tab (2026-08-08) makes every plant channel plottable, which takes the
  // PWR registry past 100 — unaffordable in the old shape and cheaper in this one than 40
  // series used to be. The earlier fix for the same growth was the CHART_SAMPLE_SEC decimation
  // below; this is the other half, and it is why the row budget can stay where it is.
  var chartBuf = [];
  // series id → its column in a packed row. Rebuilt whenever the plant changes, because the
  // column order IS the profile's series order — see buildSeriesIndex.
  var serCol = {}, serCols = 0;
  // Sub-broadcast rows drained from the service but not yet folded into chartBuf. They are
  // held rather than consumed on the spot because the drain now happens EARLY in renderNow
  // (the board's vital tiles need them before it) while the chart's own sample-grid gate may
  // skip the frame. See the drain site in renderNow.
  var pendingFine = null;
  // The other two shares of the same drain. `pendingTiles` is the board's, held until a paint
  // actually happens; `pendingDiagFine` is the bug-report recorder's, consumed on its own
  // subscriber tick. Separate variables because the three have different lifetimes — see
  // drainFine().
  var pendingTiles = null;
  var pendingDiagFine = null;
  var chartRange = {};      // id -> { lo, hi } — peak-hold auto-range (expands fast, re-tightens slow)
  var gaugeHist = {};       // id -> [{ t, v }]
  var gaugeTrend = {};      // id -> -1|0|1 — latched trend-arrow state (#237 hysteresis)
  // Fraction of the strip-chart plot width the traces occupy; the remaining right
  // gutter holds the per-lane value column (see drawChart / drawLanes / rewindPickClick).
  var CHART_PLOT_FRAC = 0.86;
  // WINDOWS SCALE WITH TIME ACCELERATION *(OWNER: "Can you also extend the time window
  // automatically when choosing faster time warps? At 3600 it's going to zoom past 30 minutes
  // really fast. Maybe have the time window buttons dynamically change depending on the speed
  // setting.")*. The fixed 1m/5m/10m/30m ladder is right at 1× and useless at 3600×, where
  // 30 minutes of plant passes in half a second of wall clock — the window empties and
  // refills faster than it can be read. Each rung is chosen so its WALL-CLOCK duration is
  // roughly what the 1× ladder gives: divide by the speed and you get back 1/5/10/30 minutes.
  // CAPPED AT 12 h, NOT SCALED BY THE SPEED NUMBER — and the cap is the whole lesson here.
  // The first cut simply divided by the requested acceleration, which produced a 27-DAY
  // widest rung at 3600×. MEASURED against it: 20 s of wall at a requested 3600× filled about
  // 5 % of an 18 h window, i.e. roughly 3200 s of sim — an ACHIEVED rate near 160×, nowhere
  // near the requested 3600. The requested number is a target the engine does not have to
  // meet (18000 physics steps per broadcast at 3600×), so sizing a window from it produces
  // rungs that can never fill.
  //
  // A shift is the longest span worth reading on a strip chart, so 12 h caps the ladder at
  // every speed and the rungs below it stay proportionate. Anything wider is a job for the
  // CSV export, not the plot.
  var CHART_WINDOWS = {
    1:    [60, 300, 600, 1800],
    10:   [300, 900, 3600, 10800],
    60:   [900, 3600, 10800, 43200],
    600:  [3600, 10800, 21600, 43200],
    3600: [3600, 10800, 21600, 43200],
  };
  function chartWindowsFor(spd) { return CHART_WINDOWS[spd] || CHART_WINDOWS[1]; }
  // Retention follows the WIDEST window on offer at the current speed, so switching rungs
  // never shows an empty axis. It is a sim-time span, and at 3600× that span is enormous —
  // which is exactly why the row budget below is enforced by THINNING rather than by a
  // shorter memory: the alternative is a 27-day buffer at 0.2 s resolution.
  var CHART_RECORD_SEC = 1800;   // recomputed from the speed; the chart DISPLAYS only ui.window
  var CHART_ROW_BUDGET = 9000;   // rows retained, regardless of how much sim time they span
  var CHART_SAMPLE_SEC = 0.2;    // …at most one row per 0.2 s of SIM time — see the record path
  var CHART_SHRINK_FRAMES = 40;  // frames a trace must sit well inside its band before the axis zooms in (~4 s)
  var smoothed = {};        // id -> display-damped instrument value

  // ----------------------------------------------------------- unit conversion
  // ONE RCS flow scale for the whole shell: gpm = frac/s × 7,500 gal × 60 s/min (#408
  // wave 1). Same number as `GPM_RCS_PER_FRAC`/`GPM_CHARGING` in pwr_board_wiring.js —
  // named here because it had already been written out four times as a bare 450000 in
  // this file alone, and a display currency spelled as a literal is the drift `run_manual_units`
  // exists to catch on the board side.
  var GPM_PER_FRAC = 450000;
  function conv(v, dim) {
    if (v == null) return v;
    // FLOW IS THE EXCEPTION AND IT IS DELIBERATE: its base unit is US, not SI. The gpm
    // figures are an authored display scale over normalized engine internals, so gpm is
    // the identity side and m³/h is the converted one — backwards from every other family
    // here (CLAUDE.md, and the same convention the board's `flow` family uses). It
    // therefore converts on the SI branch, where the others pass through.
    if (dim === 'flow') return ui.units === 'SI' ? v * 0.2271247 : v;   // gpm → m³/h
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
    var si = { pressure: 'MPa', temp: '°C', tempdiff: '°C', vacuum: 'kPa', flow: 'm³/h' };
    var us = { pressure: 'psi', temp: '°F', tempdiff: '°F', vacuum: 'inHg', flow: 'gpm' };
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
  // Containment pressure reads in GAUGE units (#386): the sourced setpoints are
  // psig (3.5 psig SI, 30 psig spray) and a building at atmospheric must read 0,
  // not 14.7. Subtract one atmosphere, then scale as a DIFFERENCE — no offset.
  function physPg(mpa) {
    if (mpa == null) return '—';
    var g = mpa - 0.1013;
    if (Math.abs(g) < 0.005) g = 0;
    return ui.units === 'SI' ? (g * 1000).toFixed(0) + ' kPa g' : (g * 145.038).toFixed(1) + ' psig';
  }
  // Temperature DIFFERENCE without the "-0" artefact. A subcooling margin sitting
  // a hundredth of a degree below saturation is 0, not "-0 °F" — the minus sign is
  // the only thing on that line, and it is noise.
  function physTd(c) {
    if (c == null) return '—';
    var v = conv(c, 'tempdiff');
    return (Math.abs(v) < 0.5 ? 0 : v).toFixed(0) + ' ' + unit('tempdiff');
  }
  // An RCS flow the engine carries as frac/s, in the unit an operator actually reads
  // *(OWNER, 2026-08-08: "in the physcs tab it shows primary leak flow as a percentage, it
  // should also show the real flow rate in an appropriate unit.")*. A fraction-per-second
  // is a modelling currency, not a rate anyone can size a leak against: 0.02 frac/s is
  // 9,000 gpm, and nothing on the row said so.
  function physFlow(fracPerSec) {
    if (fracPerSec == null || !isFinite(fracPerSec)) return '—';
    var f = conv(fracPerSec * GPM_PER_FRAC, 'flow');
    // Sub-gpm leaks are the interesting small end (a 1 gpm identified leak is a Tech Spec
    // limit), so keep a decimal until the number is big enough not to need one.
    return (Math.abs(f) < 10 ? f.toFixed(1) : f.toFixed(0)) + ' ' + unit('flow');
  }
  // % of rated thermal → MW. The rating lives in ONE place (identity.mwt_rated);
  // read it rather than restating it, or this is the next number to drift.
  function mwtOf(pctRated) {
    var id = RD.PWR_CONFIG && RD.PWR_CONFIG.identity;
    return ((pctRated || 0) / 100) * ((id && id.mwt_rated) || 0);
  }
  // The pressurizer node's level BEFORE the gauge clips it. `pzr_mass_frac` is the node's
  // content in RCS-mass-fraction units and `level_per_mass` is the geometry slope that maps
  // it back to level points (pwr_pressurizer.js: `pzr_mass_frac = pzrNodeLevel / level_per_mass`,
  // and `pzr_level_pct = clip(that, 0, 100)`) — so the two are the SAME NUMBER on span and
  // part company only past the ends.
  //
  // MEASURED, and the first version of this row was WRONG because it was not: it claimed a
  // mass-only backbone that would diverge from the gauge whenever the void credit lifted
  // level. It does not — the credit is already inside `pzr_mass_frac`. Full stack, difference
  // between node and gauge:
  //   all four presets                                     0.0
  //   stuck-open PORV, indicated 35.0 → 46.6 % over 20 min  0.0 throughout
  //   overfill to solid (max charging, letdown isolated)   +0.4 at the peg, and the pressure
  //                                                         steps 15.41 → 16.15 MPa there
  //   large LOCA sev 0.6, gauge resting on 0.0 %          −105 at 100 s, −172 at 400 s
  // So the off-scale reading is the whole of what this row knows that the gauge does not —
  // and at 1.7 spans below zero it is a lot.
  function pzrNodePct(t) {
    if (!t || t.pzr_mass_frac == null) return null;
    var pz = (RD.PWR_CONFIG && RD.PWR_CONFIG.pressurizer) || {};
    return t.pzr_mass_frac * (pz.level_per_mass || 776);
  }
  // Combined ECCS rated injection in gpm — the SAME derivation as the board's GPM_HPI
  // (pwr_board_wiring.js), read from config so a retune moves both.
  function eccsRatedGpm() {
    var em = (RD.PWR_CONFIG && RD.PWR_CONFIG.emergency) || {};
    return ((em.hpi_flow_max || 2.0e-4) +
            (em.lpi_flow_max || 1.0) * (em.lpi_inventory_gain || 5.2e-4)) * GPM_PER_FRAC;
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
    // 50 % power, not full *(OWNER, 2026-08-08: "the plant should start with the 50% power
    // preset")* — there is somewhere to go in both directions from it. `ui.initState` above
    // carries the same value for the first render.
    pwr:       { plant: 'pwr',  dv: null,              init: '50_percent',
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

  // ---- series builders for the two repetitive channel classes ---------------------------
  // Both exist because the Indications tab lists EVERY channel the plant publishes (2026-08-08),
  // and 34 of the PWR's are status booleans whose entries would otherwise be 34 lines of the
  // same shape — the kind of block where a typo in one accessor hides for months.
  //
  // A STATUS series plots the boolean as a 0/1 STEP. That is not a novelty: laid under a
  // continuous trace it answers "when did that happen" exactly, which is the question a
  // post-transient review is actually asking, and no gauge on the board records it. The value
  // lands in the packed row through Float64Array coercion (true → 1, false → 0), and the
  // per-series auto-range draws it as a clean step between the ends of its own band.
  //   ins   the instrument key (what the board reads — an HR1 channel, so it can fail)
  //   tru   the true_state key, when the plant publishes one. Where both exist this is a
  //         genuine instrument-vs-truth pair and the chart traces whichever the mode selects,
  //         so a failed status channel separates from the plant on the plot.
  //   alarm 'on'  → emphasise while the state is TRUE  (scrammed, blackout, cavitating)
  //         'off' → emphasise while it is FALSE        (cooling available, AC available)
  //         omitted → no emphasis, which is right for most of them; a chart where every
  //         status trace is bold has no emphasis at all.
  function stat(o) {
    var s = { id: o.id, grp: o.grp, label: o.label, c: o.c, range: [0, 1],
              instr: o.ins, hint: o.hint, detail: o.detail,
              fmt: function (v) { return v > 0.5 ? o.on : o.off; } };
    if (o.ins) s.get = function (i) { return i[o.ins] ? 1 : 0; };
    if (o.tru) s.tru = function (t) { return t[o.tru] ? 1 : 0; };
    if (o.alarm === 'on') s.dHi = 1;
    if (o.alarm === 'off') s.dLo = 0;
    return s;
  }
  // A LOG-SCALE nuclear channel, plotted as its EXPONENT. Source range spans 1 to 10^6 counts
  // per second and the intermediate range spans 10^-11 to 10^-3 amps; on the chart's linear
  // axis the raw value is a flat line on the floor for all but the top decade, which is the
  // whole reason a startup is read on a log meter in the first place. Storing log10 makes one
  // decade one division — the shape an operator is trained to read — and `fmt` puts the real
  // number back on the chip, so nothing on screen is in log units the label does not admit.
  function logSer(o) {
    return { id: o.id, grp: o.grp, label: o.label, c: o.c, range: o.range,
             instr: o.ins, hint: o.hint, detail: o.detail,
             get: function (i) { var x = i[o.ins]; return (x > 0) ? Math.log10(x) : o.range[0]; },
             tru: o.tru ? function (t) { var x = t[o.tru]; return (x > 0) ? Math.log10(x) : o.range[0]; } : undefined,
             fmt: function (v) { return Math.pow(10, v).toExponential(1) + ' ' + o.u; } };
  }

  // ====================================================================== profiles
  // Each plant supplies: gauges (vital strip), numeric (diagram grid), series
  // (strip-chart), controls (tabbed control strip), initStates, and a scram label.
  var PROFILES = {

    // ------------------------------------------------------------------ PWR
    pwr: {
      scram: 'REACTOR SCRAM', scramShort: 'SCRAM',
      /* EVERY starting condition names its MODE *(OWNER DIRECTIVE, 2026-08-11: "In the
       * plant and mission menu show mode next to the two free play options without
       * mode.")*. Two of the four carried one and two did not, which read as though the
       * unlabelled pair were not in a mode at all. MEASURED, not assumed — the engine
       * reports plant_mode 1 for both at 100.0 % and 50.0 % power (Mode 1 is At Power,
       * i.e. above the low-power threshold, which is why two different powers share it). */
      initStates: [['hot_full_power', 'Hot Full Power (Mode 1)'], ['50_percent', '50 % Power (Mode 1)'], ['hot_zero_power', 'Hot Standby (Mode 3)'], ['cold_shutdown', 'Cold Shutdown (Mode 5)']],
      /* THE DEFAULT SET TEACHES A COUPLING (#440, spec §8). It was Power / Tavg / Pressure /
       * SG Level — four independent state variables that demonstrate nothing between them
       * and duplicate the vital gauge row above the board.
       *
       * Turbine Load, Reactor Power, Tavg teaches the plant's most counterintuitive
       * behaviour: THE REACTOR FOLLOWS THE TURBINE. Newcomers assume the reverse. Load
       * steps, power climbs after it, and Tavg dips in between as moderator feedback does
       * the work. Turbine load is not on the gauge row, so nothing is duplicated, and
       * changing load is among the most likely first actions in free play at 50 %.
       *
       * `mwe` IS the turbine-load channel here — there is no separate series for it
       * (OWNER SELECTION 2026-08-10, from the options presented: "mwe = Turbine Load"). */
      defaultSeries: { mwe: true, power: true, tavg: true },
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
        { id: 'power',    instr: 'power_range', grp: 'Reactor core', label: 'Power %',  c: '#6a90b0', get: function (i) { return i.power_range; }, tru: function (t) { return t.power_pct; }, range: [0, 120], dHi: 118, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'sur',      instr: 'startup_rate', grp: 'Reactor core', label: 'Startup Rate', c: '#c0913e', get: function (i) { return i.startup_rate; }, tru: function (t) { return t.startup_rate_dpm; }, range: [-2, 3], fmt: function (v) { return v.toFixed(1) + ' DPM'; } },
        // Net reactivity has no instrument — the board shows it as a true-state teaching
        // quantity beside the period, and this is the same number over time.
        { id: 'rho',      grp: 'Reactor core', label: 'Reactivity', c: '#d08fc0', tru: function (t) { return t.reactivity_pcm; }, range: [-500, 500], fmt: function (v) { return v.toFixed(0) + ' pcm'; } },
        // Xenon has no instrument at all — true state in both modes, which `seriesTruth`
        // already delivers for any series with `tru` and no `get`. It used to declare a `get`
        // reading `i.xenon_pct_eq`, a key no instrument publishes, with `chartSample` copying
        // the true value into the instruments dict per sample to feed it. That was a
        // no-instrument series wearing a channel's clothes, and the Indications tab is what
        // exposed it: the row listed itself as something the plant reads and rendered an
        // em-dash, because outside chartSample's private copy the key does not exist.
        { id: 'xenon',    grp: 'Reactor core', label: 'Xenon',    c: '#b05a8a', tru: function (t) { return t.xenon_pct_eq; }, range: [0, 250], fmt: function (v) { return v.toFixed(0) + '% eq'; } },
        // Boron trend (RCS boron reading). Re-added as a plottable graph option
        // 2026-07-24 (owner request); the board itself still shows boron via the
        // chemistry SAMPLE mechanic, not a live boronometer.
        { id: 'boron',    instr: 'boron_analyzer', grp: 'Reactor core', label: 'Boron',    c: '#9a7ab8', get: function (i) { return i.boron_analyzer; }, tru: function (t) { return t.boron_ppm; }, range: [0, 1400], fmt: function (v) { return v.toFixed(0) + ' ppm'; } },
        { id: 'fuel_temp',grp: 'Reactor core', label: 'Fuel Temp (Doppler)', c: '#c07850', tru: function (t) { return t.fuel_temp_c; }, range: [200, 1300], fmt: function (v) { return conv(v, 'temp').toFixed(0) + unit('temp'); } },
        { id: 'decay',    grp: 'Reactor core', label: 'Decay Heat', c: '#a08850', tru: function (t) { return t.decay_heat_pct; }, range: [0, 8], fmt: function (v) { return v.toFixed(2) + '%'; } },
        // TOTAL core heat, not fission — the two are equal by construction at steady
        // power and diverge completely after a scram (#315). Plotting it against `power`
        // is the clearest way to see that.
        { id: 'core_heat',grp: 'Reactor core', label: 'Total Core Heat', c: '#8a7040', tru: function (t) { return t.core_heat_pct; }, range: [0, 120], fmt: function (v) { return v.toFixed(1) + '%'; } },
        // Startup nuclear instrumentation — the two log channels that cover the nine decades
        // below the power range, plus the detector's own energization state (a de-energized
        // source-range detector reads the range floor, which looks exactly like a shut-down
        // core; that is the point of having the status beside the count).
        logSer({ id: 'sr_cps', grp: 'Reactor core', label: 'Source Range', c: '#7ac0a8', ins: 'source_range', tru: 'sr_counts_cps', range: [0, 6], u: 'cps' }),
        logSer({ id: 'ir_amps',grp: 'Reactor core', label: 'Intermediate Range', c: '#60a890', ins: 'intermediate_range', tru: 'ir_amps', range: [-11, -2.7], u: 'A' }),
        stat({ id: 'sr_on',   grp: 'Reactor core', label: 'SR Detector Energized', c: '#4a9078', ins: 'sr_energized', tru: 'sr_energized', on: 'on', off: 'OFF', hint: 'whether the source-range detector is powered up.', detail: 'The startup counter is only energized at low power — it is withdrawn or blocked above the intermediate range so the detector is not destroyed by flux it was never built for. That means a de-energized detector reads the bottom of its range, which looks exactly like a shut-down core. Check this before believing a very low count rate.' }),
        // Chemistry. `boron` above is the analyzer trend; this is the discrete SAMPLE the
        // board's chemistry mechanic returns, which is what an operator actually acts on.
        { id: 'boron_smp',instr: 'boron_sample', grp: 'Reactor core', label: 'Boron Sample', c: '#8868a8', get: function (i) { return i.boron_sample; }, range: [0, 2500], fmt: function (v) { return v.toFixed(0) + ' ppm'; }, hint: 'the boron concentration returned by the last chemistry sample, in parts per million.', detail: 'The number the operator actually acts on. Boron is the slow, plant-wide reactivity control: it holds down the excess reactivity of fresh fuel so the rods can stay nearly withdrawn and available. Adding boron is negative reactivity, adding pure water is positive, and both take minutes to hours to work through the volume control system.' },
        stat({ id: 'boron_pend', grp: 'Reactor core', label: 'Boron Sample Pending', c: '#6a5490', ins: 'boron_sample_pending', on: 'PENDING', off: 'idle', hint: 'whether a boron sample has been drawn and is still being analysed.', detail: 'Boron concentration is not a live instrument on this plant, it is a chemistry sample: you request one, it takes time in the lab, and the number you get is how the plant was when the sample was drawn. PENDING means the figure beside it is the PREVIOUS result. Boration and dilution are slow, so a stale sample is usually close — but not during an active dilution.' }),
        { id: 'boron_seq',instr: 'boron_sample_seq', grp: 'Reactor core', label: 'Boron Sample Count', c: '#584878', get: function (i) { return i.boron_sample_seq; }, range: [0, 50], fmt: function (v) { return v.toFixed(0); }, hint: 'how many chemistry samples have been drawn this run.', detail: 'A counter, not a plant quantity — it exists so a new result can be told from a repeat of the old one. Useful mainly as a trace: a flat count during a boration means you are reading a number the plant has moved past.' },
        // Reactor state.
        stat({ id: 'scrammed', grp: 'Reactor core', label: 'Reactor Scrammed', c: '#d04a4a', ins: 'rps_scrammed', tru: 'scrammed', on: 'SCRAM', off: 'no', alarm: 'on', hint: 'whether the reactor protection system has tripped the rods in.', detail: 'The trip breakers are open and every control rod has been released to gravity. Fission power collapses in seconds; decay heat does not, which is why the plant still needs a heat sink afterwards and why "scrammed" is the beginning of a transient rather than the end of one. It latches until the operator resets it.' }),
        stat({ id: 'rods_in',  grp: 'Reactor core', label: 'Rods Fully Inserted', c: '#a05858', ins: 'rods_fully_in', on: 'IN', off: 'no', hint: 'whether every rod bank has reached the bottom of its travel.', detail: 'Distinct from the scram signal beside it: the signal says the rods were RELEASED, this says they arrived. A rod that hangs up on its way in leaves reactivity in the core that the trip was counting on removing, so the two disagreeing is a serious condition rather than a timing artefact.' }),
        stat({ id: 'above_p9', grp: 'Reactor core', label: 'Above P-9', c: '#909858', ins: 'above_p9', on: 'above', off: 'below', hint: 'whether reactor power is above the P-9 permissive.', detail: 'P-9 is the power level above which a turbine trip also trips the reactor. Below it the plant is expected to ride out the loss of load on the steam dump; above it there is too much heat for the dump to carry and the reactor is tripped with the turbine. It is the one permissive that decides whether losing the turbine is an event or an accident.' }),
        { id: 'plant_mode',instr: 'plant_mode', grp: 'Reactor core', label: 'Plant Mode', c: '#788ca0', get: function (i) { return i.plant_mode; }, tru: function (t) { return t.plant_mode; }, range: [1, 6], fmt: function (v) { return 'Mode ' + v.toFixed(0); }, hint: 'the commercial operating mode the plant is currently in, 1 through 5.', detail: 'Mode 1 is at power, Mode 2 startup, Mode 3 hot standby, Mode 4 hot shutdown and Mode 5 cold shutdown. The mode sets which Technical Specifications apply, which equipment must be available and which procedures are legal — it is the plant\'s legal state as much as its physical one, and most procedures are written to move it deliberately from one to the next.' },

        // ---------------------------------------------------------------- core damage
        // Core exit before the cladding, matching the Physics tab: it is first in the damage
        // chain and the only one of these with an instrument (the post-TMI channel).
        { id: 'core_exit',instr: 'core_exit_temp', grp: 'Core damage', label: 'Core Exit Temp', c: '#e09060', get: function (i) { return i.core_exit_temp; }, tru: function (t) { return t.t_core_exit_c; }, range: [93, 982], dHi: 371, fmt: function (v) { return conv(v, 'temp').toFixed(0) + unit('temp'); } },
        { id: 'clad_temp',grp: 'Core damage', label: 'Peak Clad Temp', c: '#d05a3e', tru: function (t) { return t.clad_temp_c; }, range: [200, 1400], dHi: 1200, fmt: function (v) { return conv(v, 'temp').toFixed(0) + unit('temp'); } },
        { id: 'core_void',grp: 'Core damage', label: 'Core Void', c: '#8fb0d0', tru: function (t) { return t.core_void_fraction * 100; }, range: [0, 100], fmt: function (v) { return v.toFixed(1) + '%'; } },
        { id: 'uncovered',grp: 'Core damage', label: 'Core Uncovered', c: '#c04a6a', tru: function (t) { return t.core_uncovered_frac * 100; }, range: [0, 100], dHi: 1, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'zirc',     grp: 'Core damage', label: 'Zr Oxidation Heat', c: '#e07030', tru: function (t) { return t.zirc_heat_pct; }, range: [0, 5], dHi: 0.01, fmt: function (v) { return v.toFixed(2) + '%'; } },

        // ---------------------------------------------------------------- primary coolant
        { id: 'tavg',     instr: 'tavg', grp: 'Primary coolant', label: 'Tavg',     c: '#b07830', get: function (i) { return i.tavg; }, tru: function (t) { return t.tavg_c; }, range: [270, 330], dHi: 335, fmt: function (v) { return conv(v, 'temp').toFixed(0) + unit('temp'); } },
        { id: 'thot',     instr: 'thot', grp: 'Primary coolant', label: 'Hot Leg',  c: '#c0563e', get: function (i) { return i.thot; }, tru: function (t) { return t.thot_c; }, range: [270, 335], fmt: function (v) { return conv(v, 'temp').toFixed(0) + unit('temp'); } },
        { id: 'tcold',    instr: 'tcold', grp: 'Primary coolant', label: 'Cold Leg', c: '#4a86c0', get: function (i) { return i.tcold; }, tru: function (t) { return t.tcold_c; }, range: [260, 320], fmt: function (v) { return conv(v, 'temp').toFixed(0) + unit('temp'); } },
        // Loop ΔT. INSTRUMENTED (both legs are), so it keeps a `get` — and #315 is
        // exactly why it is worth plotting: the indicated split put the cold leg above
        // the hot leg in 48.3 % of post-trip samples before that fix.
        { id: 'loop_dt',  grp: 'Primary coolant', label: 'Loop ΔT',  c: '#9a6ab0', get: function (i) { return i.thot - i.tcold; }, tru: function (t) { return t.thot_c - t.tcold_c; }, range: [0, 45], fmt: function (v) { return conv(v, 'tempdiff').toFixed(1) + unit('tempdiff'); }, hint: 'the temperature the coolant picks up crossing the core, hot leg minus cold leg.', detail: 'For a fixed flow this is directly proportional to core power, which is why it is the input to the Overtemperature and Overpower Delta-T trips. It runs about 59 degrees Fahrenheit (33 Celsius) at full power and near zero on a shut-down plant with the pumps running. Lose flow and it OPENS even though power has not changed, which is the whole reason those trips watch it.' },
        { id: 'pressure', instr: 'primary_pressure', grp: 'Primary coolant', label: 'Pressure', c: '#507048', get: function (i) { return i.primary_pressure; }, tru: function (t) { return t.pressure_mpa; }, range: [10, 17], dHi: 16.44, fmt: function (v) { return conv(v, 'pressure').toFixed(0) + ' ' + unit('pressure'); } },
        { id: 'subcool',  instr: 'subcooling_margin', grp: 'Primary coolant', label: 'Subcool',  c: '#707060', get: function (i) { return i.subcooling_margin; }, tru: function (t) { return t.subcooling_c; }, range: [-10, 60], dLo: 0, fmt: function (v) { return conv(v, 'tempdiff').toFixed(0) + unit('tempdiff'); } },
        { id: 'pzr_level',instr: 'pzr_level', grp: 'Primary coolant', label: 'PZR Level',c: '#507878', get: function (i) { return i.pzr_level; }, tru: function (t) { return t.pzr_level_pct; }, range: [0, 100], dLo: 12, fmt: function (v) { return v.toFixed(0) + '%'; } },
        // RCS loop flow (#247). The PWR was the only plant with no flow trend at all —
        // RBMK has Channel Flow and BWR has Recirc Flow — which is what an unbuilt
        // instrument looks like from the UI side. dLo marks the low-flow trip setpoint.
        { id: 'rcs_flow', instr: 'rcs_flow', grp: 'Primary coolant', label: 'RCS Flow', c: '#5a8a9a', get: function (i) { return i.rcs_flow; }, tru: function (t) { return t.pump_flow_pct; }, range: [0, 120], dLo: 90, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'inventory',grp: 'Primary coolant', label: 'RCS Inventory', c: '#4a9a70', tru: function (t) { return t.core_inventory_pct; }, range: [0, 105], dLo: 90, fmt: function (v) { return v.toFixed(1) + '%'; } },
        { id: 'loop_void',grp: 'Primary coolant', label: 'Loop Void', c: '#7090b8', tru: function (t) { return t.primary_void_fraction * 100; }, range: [0, 100], dHi: 1, fmt: function (v) { return v.toFixed(1) + '%'; } },
        // Leak flow traces GPM, not the fraction-per-second the engine carries. The physics
        // row prints both and the chart has to agree with it *(OWNER, 2026-08-08: "it should
        // also show the real flow rate in an appropriate unit")* — a "%" axis for a break was
        // the same currency problem #408 fixed on the CVCS boxes, which plotted the real flow
        // as a flat line at 0.007 %. `dHi` is 1 gpm: the Technical Specification unidentified-
        // leakage limit, i.e. "any leak worth the name", where 0.01 % meant 45 gpm.
        // Leak flow is an INSTRUMENT PAIR — `primary_leak_flow` is a real channel and can be
        // failed, so the chart must be able to trace the reading as well as the truth.
        { id: 'leak',     instr: 'primary_leak_flow', grp: 'Primary coolant', label: 'Leak Flow', c: '#b8604a', get: function (i) { return i.primary_leak_flow * GPM_PER_FRAC; }, tru: function (t) { return t.leak_flow * GPM_PER_FRAC; }, range: [0, 2000], dHi: 1, fmt: function (v) { return conv(v, 'flow').toFixed(0) + ' ' + unit('flow'); } },
        { id: 'pzr_dev',  instr: 'pzr_level_dev', grp: 'Primary coolant', label: 'PZR Level Deviation', c: '#68a0a0', get: function (i) { return i.pzr_level_dev; }, range: [-40, 40], dLo: -10, fmt: function (v) { return sgnFix(v, 1) + '%'; } },
        stat({ id: 'rcp_run',   grp: 'Primary coolant', label: 'RCPs Running', c: '#5a9ab8', ins: 'rcp_running', tru: 'pump_running', on: 'RUN', off: 'stopped', alarm: 'off', hint: 'whether the reactor coolant pumps are turning.', detail: 'The pumps are what make full power possible: they push rated flow through the core so the coolant only picks up about 59 degrees Fahrenheit (33 Celsius) crossing it. Stop them and flow does not go to zero — buoyancy keeps a few percent circulating, enough for decay heat and nothing like enough for power. They also need alternating-current power, so a blackout takes them whether or not anyone asked.' }),
        stat({ id: 'rcp_secured',grp: 'Primary coolant', label: 'RCPs Secured', c: '#487890', ins: 'rcp_secured', on: 'SECURED', off: 'no', hint: 'whether the pumps have been deliberately secured rather than merely stopped.', detail: 'Securing is an operator action with a reason behind it — cavitation, a loss of subcooling, or a procedure step that wants natural circulation established before something else happens. The distinction from simply stopped matters because a secured pump is not coming back without a decision.' }),
        stat({ id: 'rcp_cav',   grp: 'Primary coolant', label: 'RCP Cavitating', c: '#d0704a', ins: 'rcp_cavitating', tru: 'rcp_cavitating', on: 'CAVITATING', off: 'no', alarm: 'on', hint: 'whether the pumps are passing steam bubbles instead of solid water.', detail: 'Pump suction is the lowest pressure anywhere in the primary, so it is the first place the coolant can flash. Bubbles collapsing against the impeller destroy it, flow falls off, and procedures call for tripping the pumps and going to natural circulation rather than running them to destruction. It is the earliest mechanical consequence of losing subcooling.' }),
        { id: 'pzr_node', grp: 'Primary coolant', label: 'PZR Level (off-scale)', c: '#3f9a94', tru: function (t) { return pzrNodePct(t); }, range: [0, 100], dLo: 12, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'accum_vol',grp: 'Primary coolant', label: 'Accumulator Inventory', c: '#9ab060', tru: function (t) { return t.accumulator_volume_pct; }, range: [0, 105], dLo: 1, fmt: function (v) { return v.toFixed(0) + '%'; } },
        // Heatup / cooldown rate — the number the Mode 5↔1 procedures are written around
        // (the 100 °F/hr technical-specification class limit, and #310's ramped cooldown).
        // #375: the channel has an INSTRUMENT now (derived from indicated tavg, damped) —
        // `get` reads it; `tru` keeps the true-state trace for the divergence view.
        { id: 'tavg_rate',instr: 'tavg_rate', grp: 'Primary coolant', label: 'Heatup Rate', c: '#c8a050', get: function (i) { return i.tavg_rate; }, tru: function (t) { return t.tavg_rate_c_per_hr; }, range: [-60, 60], dHi: 55.6, dLo: -55.6, fmt: function (v) { return conv(v, 'tempdiff').toFixed(0) + unit('tempdiff') + '/hr'; } },

        // ---------------------------------------------------------------- loop pressure
        // There is ONE pressure instrument and it reads the hot-leg/pressurizer datum, so
        // the whole three-node split is true-state only. It is why the cold leg reaches an
        // ECCS setpoint before the gauge does, and why the pump suction cavitates first.
        { id: 'p_hot',    grp: 'Loop pressure', label: 'Hot Leg Press', c: '#88b8d8', tru: function (t) { return t.p_hotleg; }, range: [0, 18], fmt: function (v) { return conv(v, 'pressure').toFixed(0) + ' ' + unit('pressure'); } },
        { id: 'p_cold',   grp: 'Loop pressure', label: 'Cold Leg Press', c: '#6aa0c8', tru: function (t) { return t.p_coldleg; }, range: [0, 18], fmt: function (v) { return conv(v, 'pressure').toFixed(0) + ' ' + unit('pressure'); } },
        { id: 'p_suct',   grp: 'Loop pressure', label: 'Pump Suction Press', c: '#4a7090', tru: function (t) { return t.p_pumpsuction; }, range: [0, 18], fmt: function (v) { return conv(v, 'pressure').toFixed(0) + ' ' + unit('pressure'); } },
        { id: 'suct_sub', grp: 'Loop pressure', label: 'Suction Subcool', c: '#8a9070', tru: function (t) { return t.suction_subcool_c; }, range: [-10, 80], dLo: 0, fmt: function (v) { return conv(v, 'tempdiff').toFixed(0) + unit('tempdiff'); } },
        { id: 'cavit',    grp: 'Loop pressure', label: 'RCP Cavitation', c: '#d0704a', tru: function (t) { return t.rcp_cavitation_frac * 100; }, range: [0, 100], dHi: 0.01, fmt: function (v) { return v.toFixed(0) + '%'; } },

        // ---------------------------------------------------------------- protection & limits
        // The Overtemperature/Overpower ΔT limit lines and the margin to each — the trips that
        // decide whether a transient is survivable, and the only ones whose SETPOINT MOVES with
        // the plant (they are computed from Tavg and pressure, so the limit comes down to meet
        // you). Plotting a margin beside the ΔT that is eating it is the clearest thing the
        // chart can say about an overpower event, and none of these has a board readout.
        { id: 'loop_dt_pct',instr: 'loop_delta_t', grp: 'Protection & limits', label: 'Loop ΔT (% ref)', c: '#9a6ab0', get: function (i) { return i.loop_delta_t; }, range: [0, 150], fmt: function (v) { return v.toFixed(1) + '%'; } },
        { id: 'otdt_sp',  instr: 'otdt_setpoint', grp: 'Protection & limits', label: 'OTΔT Setpoint', c: '#c86868', get: function (i) { return i.otdt_setpoint; }, range: [0, 150], fmt: function (v) { return v.toFixed(1) + '%'; } },
        { id: 'otdt_mar', instr: 'otdt_margin', grp: 'Protection & limits', label: 'OTΔT Margin', c: '#e08888', get: function (i) { return i.otdt_margin; }, range: [-20, 60], dLo: 0, fmt: function (v) { return sgnFix(v, 1) + '%'; } },
        { id: 'opdt_sp',  instr: 'opdt_setpoint', grp: 'Protection & limits', label: 'OPΔT Setpoint', c: '#c89868', get: function (i) { return i.opdt_setpoint; }, range: [0, 150], fmt: function (v) { return v.toFixed(1) + '%'; } },
        { id: 'opdt_mar', instr: 'opdt_margin', grp: 'Protection & limits', label: 'OPΔT Margin', c: '#e0b088', get: function (i) { return i.opdt_margin; }, range: [-20, 60], dLo: 0, fmt: function (v) { return sgnFix(v, 1) + '%'; } },
        { id: 'rod_margin',instr: 'rod_limit_margin', grp: 'Protection & limits', label: 'Rod Limit Margin', c: '#7ac098', get: function (i) { return i.rod_limit_margin; }, range: [0, 912], dLo: 0, fmt: function (v) { return v.toFixed(0) + ' st'; } },
        stat({ id: 'rod_limit', grp: 'Protection & limits', label: 'Rods At Limit', c: '#c0a050', ins: 'rod_at_limit', on: 'AT LIMIT', off: 'no', alarm: 'on', hint: 'whether the control bank has reached its insertion limit.', detail: 'The rod insertion limit preserves enough rod worth above the bank to shut the reactor down from any condition. Driving into it does not stop the plant working, it removes the margin that makes a trip effective — so the correct response is to borate, which brings the bank back out, rather than to keep inserting.' }),

        // ---------------------------------------------------------------- pressure boundary
        // The relief path. Two of these are BOOLEAN traces and that is deliberate: a step
        // line for "the valve was open from here to here", laid under the pressure trace, is
        // the single most useful thing a strip chart can say about a TMI-shaped event, and it
        // is information no gauge on the board carries. A boolean lands in the packed row as
        // 1 or 0 (Float64Array coercion), and the per-series auto-range draws it as a clean
        // step between the top and bottom of its own band.
        // THE Three Mile Island CHANNEL, and the reason it carries both sides. `get` reads
        // `porv_indicator`, which reports the DEMAND signal sent to the valve; `tru` reads the
        // valve. On an intact plant they are the same trace. With the valve stuck they are not,
        // and because the chart picks its side by mode (physics in Teaching, instruments in
        // Realistic), plotting this in Realistic shows the operator exactly the lie TMI-2's
        // control room was shown for two hours and twenty minutes.
        // AUTHORED hint, overriding the manual's own first sentence. `measures` opens with
        // "Relief-valve indicator." and only says the load-bearing part — that the light shows
        // the COMMANDED position — in its second sentence, which the summary tier drops. On
        // every other row losing the tail is fine; on this one the tail is the whole lesson.
        { id: 'porv',     instr: 'porv_indicator', grp: 'Pressure boundary', label: 'PORV Open', c: '#e08050',
          hint: 'the relief-valve position LIGHT, which shows the commanded position and not the valve.',
          get: function (i) { return i.porv_indicator === 'open' ? 1 : 0; }, tru: function (t) { return t.porv_open ? 1 : 0; }, range: [0, 1], dHi: 1, fmt: function (v) { return v > 0.5 ? 'OPEN' : 'shut'; } },
        // NO SERIES for `block_valve_open`, `porv_stuck` or `spray_stuck`, deliberately. All
        // three are true-state-only, so they are absent from the Indications list by its own
        // rule (channels and commands), and the Physics rows that own them already print
        // their state in the row text rather than binding a separate trace. Series existed
        // for them briefly and nothing could tick any of them — a packed column each, dead.
        // `run_inspect` now fails on an unreachable series so that cannot come back quietly.
        stat({ id: 'relief_act',  grp: 'Pressure boundary', label: 'Safety/Relief Active', c: '#d09060', ins: 'safety_relief_active', on: 'ACTIVE', off: 'no', alarm: 'on', hint: 'whether any pressurizer relief or safety valve is currently passing.', detail: 'Covers the power-operated relief valve and the spring-loaded code safeties together — anything venting the primary to the quench tank. Brief lifts during a pressure transient are the system working. A reading that stays active is a leak path out of the reactor coolant system that no break was injected to create.' }),
        { id: 'tailpipe', instr: 'porv_tailpipe_temp', grp: 'Pressure boundary', label: 'PORV Tailpipe Temp', c: '#c86a4a', get: function (i) { return i.porv_tailpipe_temp; }, tru: function (t) { return t.porv_tailpipe_temp_c; }, range: [0, 250], dHi: 150, fmt: function (v) { return conv(v, 'temp').toFixed(0) + unit('temp'); } },
        { id: 'spray_flow',instr: 'pzr_spray_flow', grp: 'Pressure boundary', label: 'PZR Spray Flow', c: '#68b8e0', get: function (i) { return i.pzr_spray_flow; }, tru: function (t) { return t.spray_flow_pct; }, range: [0, 110], fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'sg_safety',instr: 'sg_safety_open', grp: 'Pressure boundary', label: 'SG Safeties Lifting', c: '#d8a040', get: function (i) { return i.sg_safety_open ? 1 : 0; }, tru: function (t) { return t.sg_safety_open ? 1 : 0; }, range: [0, 1], dHi: 1, fmt: function (v) { return v > 0.5 ? 'LIFT' : 'seated'; }, hint: 'whether the secondary code safety valves are lifting.', detail: 'Pure spring-loaded mechanics: no signal, no power, no operator. They lift on steam pressure alone and reseat when it falls back. Lifting is not itself a fault — it means the steam generator has nowhere else to send its heat, which is normal on a loss of heat sink and is what keeps the secondary below its design pressure. The steam goes to atmosphere, so it is an inventory loss the condenser never sees.' },
        // The two steam reliefs that are OPERATED rather than sprung: the turbine bypass to the
        // condenser, and the atmospheric dump that is the only cooldown path once the condenser
        // is gone. Instrument pairs — the `dump`/`adv` entries under Controls are the DEMAND.
        { id: 'dump_valve',instr: 'steam_dump_valve', grp: 'Pressure boundary', label: 'Steam Dump Valve', c: '#a8c060', get: function (i) { return i.steam_dump_valve; }, tru: function (t) { return t.steam_dump_valve_pct; }, range: [0, 100], fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'adv_valve', instr: 'adv_valve', grp: 'Pressure boundary', label: 'Atmospheric Dump (ADV)', c: '#c0b070', get: function (i) { return i.adv_valve; }, tru: function (t) { return t.adv_valve_pct; }, range: [0, 100], fmt: function (v) { return v.toFixed(0) + '%'; } },

        // ---------------------------------------------------------------- containment
        // #386. Building pressure traces in GAUGE units, like the physics row and the board —
        // the sourced setpoints are psig and an intact building must read 0, not 14.7.
        { id: 'ctmt_p',   instr: 'containment_pressure', grp: 'Containment', label: 'Containment Press', c: '#a878c0', get: function (i) { return i.containment_pressure; }, tru: function (t) { return t.containment_pressure_mpa; }, range: [0.1, 0.55], dHi: 0.3081, fmt: function (v) { return physPg(v); } },
        { id: 'ctmt_t',   instr: 'containment_temp', grp: 'Containment', label: 'Containment Temp', c: '#c08890', get: function (i) { return i.containment_temp; }, tru: function (t) { return t.containment_temp_c; }, range: [20, 200], dHi: 100, fmt: function (v) { return conv(v, 'temp').toFixed(0) + unit('temp'); } },
        { id: 'ctmt_sump',instr: 'containment_sump_level', grp: 'Containment', label: 'Containment Sump', c: '#7898c0', get: function (i) { return i.containment_sump_level; }, tru: function (t) { return t.containment_sump_pct; }, range: [0, 100], dHi: 0.1, fmt: function (v) { return v.toFixed(1) + '%'; } },
        { id: 'ctmt_h2',  instr: 'ctmt_h2', grp: 'Containment', label: 'Containment H₂', c: '#d05070', get: function (i) { return i.ctmt_h2; }, tru: function (t) { return t.ctmt_h2_pct; }, range: [0, 10], dHi: 4.1, fmt: function (v) { return v.toFixed(2) + '% vol'; } },
        stat({ id: 'ctmt_spray', grp: 'Containment', label: 'Containment Spray', c: '#88a8d0', ins: 'ctmt_spray_active', tru: 'ctmt_spray_active', on: 'SPRAY', off: 'off', alarm: 'on', hint: 'whether containment spray is running.', detail: 'Sprays water into the building atmosphere to condense steam and knock pressure down, starting automatically on the high-high containment pressure signal. It is a big hammer: it works, and it floods the building floor. Running spray is unambiguous evidence that containment pressure reached the actuation point.' }),
        stat({ id: 'ctmt_fans',  grp: 'Containment', label: 'Fan Coolers (safety)', c: '#7898b0', ins: 'ctmt_fan_active', tru: 'ctmt_fan_active', on: 'SI MODE', off: 'normal', hint: 'whether the fan coolers have realigned to their safety mode.', detail: 'The fan coolers run all the time for ordinary building heat, and realign to a slower, higher-capacity safety lineup on any safety injection signal. Unlike spray they need no water and leave nothing behind, so they carry the long tail of containment heat removal after the initial pressure spike is over.' }),
        stat({ id: 'ctmt_recomb',grp: 'Containment', label: 'H₂ Recombiners', c: '#b06888', ins: 'ctmt_recomb_active', tru: 'ctmt_recomb_active', on: 'RUN', off: 'idle', hint: 'whether the hydrogen recombiners are running.', detail: 'Recombiners burn hydrogen back to water catalytically and slowly, over hours. They start automatically on rising concentration and secure themselves once it is back down. They are sized for the slow accumulation a small leak produces, not for a rapidly oxidizing core — against a real core-damage hydrogen source they cannot keep up.' }),
        stat({ id: 'ctmt_burn',  grp: 'Containment', label: 'H₂ Burn Occurred', c: '#e04060', ins: 'ctmt_h2_burned', tru: 'ctmt_h2_burned', on: 'BURNED', off: 'no', alarm: 'on', hint: 'whether a hydrogen deflagration has already happened in the building.', detail: 'Latches forever, because a burn is a one-time event: it consumes most of the hydrogen inventory in seconds and leaves a sharp pressure spike the containment is designed to survive. At Three Mile Island the spike was recorded at 9 hours 50 minutes and the operators first read it as electrical noise.' }),

        // ---------------------------------------------------------------- steam & feed
        { id: 'steam_p',  instr: 'steam_pressure', grp: 'Steam & feed', label: 'Steam P',  c: '#60789a', get: function (i) { return i.steam_pressure; }, tru: function (t) { return t.steam_pressure_mpa; }, range: [0, 10], dHi: 8.0, fmt: function (v) { return conv(v, 'pressure').toFixed(0) + ' ' + unit('pressure'); } },
        { id: 'sg_level', instr: 'sg_level', grp: 'Steam & feed', label: 'SG Level', c: '#806890', get: function (i) { return i.sg_level; }, tru: function (t) { return t.sg_level_pct; }, range: [0, 100], dLo: 12, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'steam_flow',instr: 'steam_flow', grp: 'Steam & feed', label: 'Steam Flow',c: '#8a9a5a', get: function (i) { return i.steam_flow * 100; }, tru: function (t) { return t.steam_flow_normalized * 100; }, range: [0, 120], fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'fw_flow',  instr: 'fw_flow', grp: 'Steam & feed', label: 'Feed Flow',c: '#4a8a86', get: function (i) { return i.fw_flow * 100; }, tru: function (t) { return t.fw_flow_normalized * 100; }, range: [0, 120], fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'afw_flow', instr: 'afw_flow', grp: 'Steam & feed', label: 'AFW Flow', c: '#5aa8a0', get: function (i) { return i.afw_flow * 100; }, tru: function (t) { return t.afw_flow_normalized * 100; }, range: [0, 40], fmt: function (v) { return v.toFixed(1) + '%'; } },
        // The SG's own mass balance: steam out (turbine + dump + safeties) minus TOTAL
        // feed (main + AFW). Positive means the level is on its way down, which is the
        // thing a level trace only tells you after it has already happened.
        { id: 'sg_bal',   grp: 'Steam & feed', label: 'Steam − Feed', c: '#b09050', tru: function (t) { return (t.steam_out_total - t.fw_flow_normalized) * 100; }, range: [-30, 30], fmt: function (v) { return v.toFixed(1) + '%'; } },
        // The heat sink's own two state variables — the whole-vessel mass ledger (#418) and
        // the saturation temperature the primary is dumping into. Neither has an instrument:
        // the level gauge is a NARROW-RANGE tap that pegs outside its band, which is why a
        // flat-lined level trace and a still-falling mass trace are both true at once.
        { id: 'sg_mass',  grp: 'Steam & feed', label: 'SG Inventory', c: '#9a78a8', tru: function (t) { return t.sg_mass_frac * 100; }, range: [0, 105], dLo: 20, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'psg_dt',   grp: 'Steam & feed', label: 'Primary → SG ΔT', c: '#c07068', tru: function (t) { return t.t_sg_c == null ? null : t.tavg_c - t.t_sg_c; }, range: [0, 45], dLo: 3, fmt: function (v) { return conv(v, 'tempdiff').toFixed(1) + unit('tempdiff'); } },
        // WIDE-RANGE level and TOTAL SG draw. `sg_level` above is the narrow-range tap, which
        // pegs outside its band — during a transient the two traces are the difference between
        // "level is off the bottom of the gauge" and knowing where it actually is. `sg_steam_flow`
        // is the transmitter that sees the dump as well as the turbine, which is why it stays up
        // when `steam_flow` reads zero on an offline turbine (#206).
        { id: 'sg_wide',  instr: 'sg_level_wide', grp: 'Steam & feed', label: 'SG Level (wide range)', c: '#9080a8', get: function (i) { return i.sg_level_wide; }, tru: function (t) { return t.sg_level_wide_pct; }, range: [0, 100], dLo: 20, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'sg_draw',  instr: 'sg_steam_flow', grp: 'Steam & feed', label: 'Total SG Steam Draw', c: '#a0b070', get: function (i) { return i.sg_steam_flow * 100; }, tru: function (t) { return t.steam_out_total * 100; }, range: [0, 200], fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'cond_flow',instr: 'condensate_flow', grp: 'Steam & feed', label: 'Condensate Flow', c: '#68a898', get: function (i) { return i.condensate_flow * 100; }, tru: function (t) { return t.condensate_flow_normalized * 100; }, range: [0, 120], fmt: function (v) { return v.toFixed(0) + '%'; } },
        stat({ id: 'msiv',      grp: 'Steam & feed', label: 'MSIV Open', c: '#8090a8', ins: 'msiv_open', tru: 'msiv_open', on: 'OPEN', off: 'SHUT', alarm: 'off', hint: 'whether the main steam isolation valve is open.', detail: 'The boundary between the steam generator and everything downstream of it. Shutting it isolates a steam line break outside containment and stops the generator being blown down through it — at the cost of the turbine, the dump valves and the condenser all at once, leaving the atmospheric dump and the code safeties as the only heat removal path.' }),
        stat({ id: 'mfw_iso',   grp: 'Steam & feed', label: 'Main Feed Isolated', c: '#a06868', ins: 'mfw_isolated', on: 'ISOLATED', off: 'no', alarm: 'on', hint: 'whether main feedwater has been isolated from the steam generator.', detail: 'Main feed is isolated automatically on a safety injection and on high steam generator level. It is the right action — cold feed into a depressurizing generator makes things worse — but it means the only water going in is auxiliary feedwater, at a small fraction of the flow, so level will fall for a while and that is expected.' }),
        stat({ id: 'cond_pump', grp: 'Steam & feed', label: 'Condensate Pump', c: '#588880', ins: 'condensate_pump_running', tru: 'condensate_pump_running', on: 'RUN', off: 'stopped', hint: 'whether the condensate pump is running.', detail: 'Condensate is the first stage of the feed path: it takes water out of the condenser hotwell and sends it toward the feed pumps. No condensate means no main feedwater however the feed pumps are lined up, which is why this reading and the feed flow beside it should be read together.' }),
        stat({ id: 'afw_act',   grp: 'Steam & feed', label: 'AFW Actuated', c: '#5ab0a8', ins: 'afw_active', tru: 'afw_active', on: 'ACTUATED', off: 'no', hint: 'whether the auxiliary feedwater system has been actuated.', detail: 'The signal, not the flow. Auxiliary feedwater is the backup water supply to the steam generators for when main feed is gone, and it actuates automatically on a reactor trip. Actuated with no flow beside it is normal: this plant\'s auxiliary feed is level-controlled and delivers nothing until generator level falls into its band.' }),
        stat({ id: 'afw_pump',  grp: 'Steam & feed', label: 'AFW Pump Running', c: '#48908a', ins: 'afw_pump_running', tru: 'afw_pump_running', on: 'RUN', off: 'stopped', hint: 'whether an auxiliary feedwater pump is turning.', detail: 'Distinct from the actuation signal above: this says a pump is actually running. It matters most in a blackout, where the electric pumps are gone and only steam-driven capability remains — the demand can stand while nothing is delivering.' }),
        stat({ id: 'afw_block', grp: 'Steam & feed', label: 'AFW Block Valve', c: '#3a7870', ins: 'afw_block_open', on: 'OPEN', off: 'SHUT', hint: 'whether the auxiliary feedwater block valve is open.', detail: 'The flow path downstream of the pump. A running pump against a shut block valve delivers nothing, and the two readings are separate here precisely so that combination is visible rather than hidden inside one "auxiliary feedwater OK" light.' }),
        stat({ id: 'sg_imbal',  grp: 'Steam & feed', label: 'SG Level Imbalance', c: '#b09068', ins: 'sg_imbalance_active', tru: 'sg_imbalance_active', on: 'ACTIVE', off: 'no', alarm: 'on', hint: 'whether the steam generator level control has gone out of balance.', detail: 'Flags the feed controller failing to hold level against the steam being drawn — the mismatch that precedes both an overfill and a boil-down. Read it against the steam-minus-feed row on the Physics tab, which is the number it is computed from.' }),

        // ---------------------------------------------------------------- turbine & output
        { id: 'mwe',      instr: 'mwe_output', grp: 'Turbine & output', label: 'Output MW',c: '#506880', get: function (i) { return i.mwe_output; }, tru: function (t) { return t.mwe_output; }, range: [0, 110], fmt: function (v) { return v.toFixed(0) + ' MWe'; } },
        { id: 'demand',   grp: 'Turbine & output', label: 'Steam Demand MW', c: '#7a90a8', tru: function (t) { return t.steam_demand_mwe; }, range: [0, 110], fmt: function (v) { return v.toFixed(0) + ' MWe'; } },
        { id: 'gov',      instr: 'governor_valve', grp: 'Turbine & output', label: 'Governor Valve', c: '#90a860', get: function (i) { return i.governor_valve; }, tru: function (t) { return t.governor_valve_pct; }, range: [0, 100], fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'rpm',      instr: 'turbine_rpm', grp: 'Turbine & output', label: 'Turbine RPM', c: '#a09070', get: function (i) { return i.turbine_rpm; }, tru: function (t) { return t.turbine_rpm; }, range: [0, 2000], fmt: function (v) { return v.toFixed(0) + ' rpm'; } },
        stat({ id: 'turb_trip', grp: 'Turbine & output', label: 'Turbine Tripped', c: '#c06850', ins: 'turbine_tripped', tru: 'turbine_tripped', on: 'TRIPPED', off: 'no', alarm: 'on', hint: 'whether the turbine has tripped.', detail: 'The stop valves have shut and steam to the turbine is gone. Above the P-9 permissive this also trips the reactor; below it the steam dump is expected to carry the plant and the reactor rides through. A turbine trip is the most common way a real plant ends up in an unplanned shutdown.' }),
        stat({ id: 'demand_lo', grp: 'Turbine & output', label: 'Steam Demand Low', c: '#a08860', ins: 'steam_demand_low', on: 'LOW', off: 'no', hint: 'whether steam demand has fallen below the level the plant is making heat for.', detail: 'The mismatch signal behind the load-rejection response: the turbine wants less steam than the reactor is producing, so the surplus has to go somewhere — the dump valves, then the atmospheric dump, then the code safeties. It is the cue that primary temperature is about to rise unless something takes the load.' }),
        // Gross electrical over TOTAL core heat — the honest denominator (#315), not
        // fission power, or the number goes to infinity after a scram.
        { id: 'eff',      grp: 'Turbine & output', label: 'Cycle Efficiency', c: '#8a8a5a', tru: function (t) { var q = mwtOf(t.core_heat_pct); return q > 1 ? t.mwe_output / q * 100 : null; }, range: [0, 45], fmt: function (v) { return v.toFixed(1) + '%'; } },
        { id: 'vacuum',   instr: 'condenser_vacuum', grp: 'Turbine & output', label: 'Condenser Vacuum', c: '#6080a0', get: function (i) { return i.condenser_vacuum; }, tru: function (t) { return t.condenser_vacuum_kpa; }, range: [0, 100], dLo: 74.5, fmt: function (v) { return v.toFixed(1) + ' kPa'; } },

        // ---------------------------------------------------------------- support systems
        // Why the pumps stopped, and what is putting water back. `ac_avail` is a boolean
        // trace for the same reason the PORV one is: the moment power goes is the moment
        // every motor load's behaviour changes, and a step line marks it exactly.
        { id: 'ac_avail', grp: 'Support systems', label: 'AC Available', c: '#e0c060', tru: function (t) { return t.ac_available ? 1 : 0; }, range: [0, 1], dLo: 0, fmt: function (v) { return v > 0.5 ? 'available' : 'LOST'; } },
        stat({ id: 'sbo',       grp: 'Support systems', label: 'Station Blackout', c: '#e08040', ins: 'station_blackout', tru: 'station_blackout', on: 'SBO', off: 'no', alarm: 'on', hint: 'whether the plant has lost both offsite power and its emergency diesels.', detail: 'A station blackout takes every motor at once: reactor coolant pumps, main feed pumps, charging, and emergency injection. What is left is whatever runs on steam, gravity or stored pressure. It is what happened at Fukushima Daiichi, and it is the condition every passive system on the plant exists for.' }),
        { id: 'eccs_flow',grp: 'Support systems', label: 'ECCS Injection', c: '#50c090', tru: function (t) { return ((t.hpi_flow_normalized || 0) + (t.accumulator_flow_normalized || 0)) * eccsRatedGpm(); }, range: [0, 400], fmt: function (v) { return conv(v, 'flow').toFixed(0) + ' ' + unit('flow'); } },
        // The individual injection paths and the heads behind them. The merged HPI/LPI line and
        // the passive accumulators arrive at very different pressures, so the discharge-pressure
        // traces are what say WHY a path is or is not delivering.
        { id: 'hpi_flow', instr: 'hpi_flow', grp: 'Support systems', label: 'HPI/LPI Flow', c: '#48b088', get: function (i) { return i.hpi_flow * 100; }, tru: function (t) { return t.hpi_flow_normalized * 100; }, range: [0, 120], fmt: function (v) { return v.toFixed(1) + '%'; } },
        { id: 'accum_flow',instr: 'accumulator_flow', grp: 'Support systems', label: 'Accumulator Flow', c: '#88c070', get: function (i) { return i.accumulator_flow * 100; }, tru: function (t) { return t.accumulator_flow_normalized * 100; }, range: [0, 120], fmt: function (v) { return v.toFixed(1) + '%'; } },
        { id: 'hpi_dp',   instr: 'hpi_discharge_pressure', grp: 'Support systems', label: 'HPI Discharge Press', c: '#409878', get: function (i) { return i.hpi_discharge_pressure; }, tru: function (t) { return t.hpi_discharge_pressure_mpa; }, range: [0, 18], fmt: function (v) { return conv(v, 'pressure').toFixed(0) + ' ' + unit('pressure'); } },
        { id: 'afw_dp',   instr: 'afw_discharge_pressure', grp: 'Support systems', label: 'AFW Discharge Press', c: '#38887e', get: function (i) { return i.afw_discharge_pressure; }, tru: function (t) { return t.afw_discharge_pressure_mpa; }, range: [0, 12], fmt: function (v) { return conv(v, 'pressure').toFixed(0) + ' ' + unit('pressure'); } },
        stat({ id: 'hpi_on',    grp: 'Support systems', label: 'HPI Actuated', c: '#50c0a0', ins: 'hpi_active', tru: 'hpi_active', on: 'ACTUATED', off: 'no', hint: 'whether high-pressure injection has been actuated.', detail: 'The pumped emergency injection path, and the only one that works against a nearly intact primary. It actuates automatically on low pressure or on high containment pressure. Actuated does not mean delivering — at normal operating pressure the pumps can barely overcome the system, which is why the flow row beside it is the one to read.' }),
        stat({ id: 'htr_shed',  grp: 'Support systems', label: 'PZR Heaters Shed', c: '#c08850', ins: 'pzr_heaters_shed', tru: 'pzr_heaters_shed', on: 'SHED', off: 'no', alarm: 'on', hint: 'whether the pressurizer heaters have been taken off the bus by a safety injection or a loss of offsite power.', detail: 'The heaters are a large non-safety load, so a safety injection signal automatically drops them off the emergency buses to leave room for equipment that matters more. They do not come back on their own — someone has to put them back deliberately. Read this row whenever heater power sits at zero and you did not put it there: it separates a load shed, which you can undo with one button, from a low-level cutoff or a dead bus, which you cannot.' }),
        stat({ id: 'accum_disch',grp: 'Support systems', label: 'Accumulators Discharging', c: '#98c860', ins: 'accumulators_discharging', tru: 'accumulators_discharging', on: 'DISCHARGING', off: 'no', hint: 'whether the passive accumulators are dumping into the cold leg.', detail: 'The accumulators are nitrogen-pressurized tanks behind check valves: no power, no signal, no operator. They fire on their own the moment primary pressure falls below them and they empty in minutes. They fire once, so a discharging accumulator is a clock running down.' }),
        stat({ id: 'accum_valve',grp: 'Support systems', label: 'Accumulator Valve', c: '#78a850', ins: 'accum_valve_open', tru: 'accumulator_valve_open', on: 'OPEN', off: 'SHUT', hint: 'whether the accumulator isolation valve is open.', detail: 'Shut, the passive injection cannot happen at all whatever the pressure does. The valves are deliberately shut during a controlled cooldown so the tanks do not dump into a depressurizing plant that does not need them — and leaving them shut afterwards is the way that protection gets quietly lost.' }),
        stat({ id: 'rhr_on',    grp: 'Support systems', label: 'RHR Active', c: '#60a8c0', ins: 'rhr_active', tru: 'rhr_active', on: 'ACTIVE', off: 'no', hint: 'whether residual heat removal is in service.', detail: 'The low-pressure, long-term cooling path: it takes suction from the hot leg and rejects core heat through its own heat exchangers, which is what carries a shut-down plant for days. It is interlocked to pressure and cannot be placed in service until the primary is well down, so getting to it is the object of most of a cooldown.' }),
        stat({ id: 'rhr_valve', grp: 'Support systems', label: 'RHR Suction Valve', c: '#4888a0', ins: 'rhr_valve_open', tru: 'rhr_valve_open', on: 'OPEN', off: 'SHUT', hint: 'whether the residual heat removal suction valve is open.', detail: 'The interlocked valve that admits hot leg water to the low-pressure system. The interlock exists because the residual heat removal piping is not rated for full primary pressure — opening it too early is one of the ways a plant is destroyed from the control room.' }),
        { id: 'cw_temp',  instr: 'cw_inlet_temp', grp: 'Support systems', label: 'CW Inlet Temp', c: '#7ab0b8', get: function (i) { return i.cw_inlet_temp; }, tru: function (t) { return t.cw_inlet_temp_c; }, range: [0, 45], fmt: function (v) { return conv(v, 'temp').toFixed(0) + unit('temp'); } },
        stat({ id: 'cond_avail',grp: 'Support systems', label: 'Condenser Available', c: '#6890a8', ins: 'condenser_cooling_available', tru: 'condenser_cooling_available', on: 'available', off: 'LOST', alarm: 'off', hint: 'whether the condenser can still take steam.', detail: 'The steam dump only works while the condenser can condense, which needs circulating water and vacuum. Lose either and the dump valves are useless: the secondary\'s heat has to go to atmosphere through the relief valves instead, which wastes treated water and is an inventory loss with no return.' }),

        // ---------------------------------------------------------------- controls
        // COMMANDED positions, not readings. Plotted against everything above them, these
        // are what turn a trend into a cause: rod steps beside Tavg, spray and heater
        // beside pressure, dump beside steam flow.
        { id: 'rod_steps',grp: 'Controls', label: 'Control Rod Steps', c: '#5ac0a0', ctl: function (c) { var g = rodGrp(c, 'control_rods'); return g ? g.steps : null; }, range: [0, 912], fmt: function (v) { return v.toFixed(0) + ' st'; }, hint: 'where the control bank is, in steps withdrawn.', detail: 'The operator\'s fast reactivity control, and the only one that acts in seconds. Withdrawing adds reactivity and raises power; inserting does the reverse. Plot it against average coolant temperature and the whole rod-control loop becomes visible — the bank chasing the temperature program rather than power directly.' },
        { id: 'sd_steps', grp: 'Controls', label: 'Shutdown Rod Steps', c: '#3a8070', ctl: function (c) { var g = rodGrp(c, 'shutdown_rods'); return g ? g.steps : null; }, range: [0, 912], fmt: function (v) { return v.toFixed(0) + ' st'; }, hint: 'where the shutdown bank is, in steps withdrawn.', detail: 'The shutdown bank is parked fully out during power operation and exists to be dropped. Its worth is the margin that makes a trip effective, which is why it is withdrawn first during a startup and why an insertion limit on the control bank is enforced separately.' },
        { id: 'heater',   grp: 'Controls', label: 'PZR Heater', c: '#d09040', ctl: function (c) { return c.heater_power_pct; }, range: [0, 100], fmt: function (v) { return v.toFixed(0) + '%'; }, hint: 'how hard the pressurizer heaters are being driven, as a percentage.', detail: 'Heaters are the slow way UP in pressure: they boil water in the pressurizer steam space over minutes, where spray drops pressure in seconds. They also need alternating-current power, so pressure control is asymmetric in a blackout — and a safety injection or a loss of offsite power SHEDS them off the bus until you put them back — you can still spray, but you cannot heat.' },
        { id: 'spray',    grp: 'Controls', label: 'PZR Spray', c: '#50a8d0', ctl: function (c) { return c.spray_valve_pct; }, range: [0, 100], fmt: function (v) { return v.toFixed(0) + '%'; }, hint: 'how far the pressurizer spray valve has been commanded open.', detail: 'Spray is the fast way DOWN in pressure: cold leg water sprayed into the steam space condenses steam and drops pressure in seconds. It is drawn from the reactor coolant pump discharge, so it needs a running pump to work at all — losing the pumps costs the pressure control you are most likely to want.' },
        { id: 'dump',     grp: 'Controls', label: 'Steam Dump', c: '#a0b850', ctl: function (c) { return c.steam_dump_pct; }, range: [0, 100], fmt: function (v) { return v.toFixed(0) + '%'; }, hint: 'how far the steam dump valves have been commanded open.', detail: 'The turbine bypass: steam routed straight to the condenser instead of the turbine. It is what lets the plant survive a load rejection without tripping, and it only works while the condenser is available. Plot it against steam pressure to see the pressure control loop working.' },
        { id: 'feed_pump',grp: 'Controls', label: 'Feed Pump Speed', c: '#40988a', ctl: function (c) { return c.feed_pump_speed_pct; }, range: [0, 120], fmt: function (v) { return v.toFixed(0) + '%'; }, hint: 'the commanded feed pump speed, as a percentage.', detail: 'The demand behind main feedwater flow. The three-element controller sets it from level, steam flow and feed flow together, which is what lets it anticipate a load change instead of chasing level after the fact. Commanded speed and delivered flow part company whenever the suction side cannot supply it.' },
        // Charging and letdown are INSTRUMENTED (both have flow indications on the CVCS
        // card), so they keep a `get` — they sit here because the operator sets them.
        // gpm = frac/s × 450,000 (the declared 7,500 gal RCS, #408 — same constant as
        // GPM_CHARGING/GPM_LETDOWN in pwr_board_wiring.js; the old ×100 "%" plotted the
        // real currency as a flat-line at 0.007 %).
        { id: 'charging', instr: 'charging_flow', grp: 'Controls', label: 'Charging Flow', c: '#7ab0d8', get: function (i) { return i.charging_flow * GPM_PER_FRAC; }, tru: function (t) { return t.charging_flow_actual * GPM_PER_FRAC; }, range: [0, 120], fmt: function (v) { return v.toFixed(0) + ' gpm'; } },
        { id: 'letdown',  instr: 'letdown_flow', grp: 'Controls', label: 'Letdown Flow', c: '#b87a90', get: function (i) { return i.letdown_flow * GPM_PER_FRAC; }, tru: function (t) { return t.letdown_flow_actual * GPM_PER_FRAC; }, range: [0, 120], fmt: function (v) { return v.toFixed(0) + ' gpm'; } },
        { id: 'load_tgt', grp: 'Controls', label: 'Load Target MW', c: '#8898b8', ctl: function (c) { return c.load_target_mwe; }, range: [0, 110], fmt: function (v) { return v.toFixed(0) + ' MWe'; }, hint: 'the electrical output the turbine has been asked to make.', detail: 'The secondary side sets the pace on a pressurized water reactor: raise this and the extra steam draw cools the primary, average temperature falls, and the negative moderator coefficient raises reactor power on its own. The reactor follows the turbine, not the other way round.' },
        { id: 'press_sp', grp: 'Controls', label: 'Pressure Setpoint', c: '#70a070', ctl: function (c) { return c.pressure_setpoint; }, range: [0, 18], fmt: function (v) { return conv(v, 'pressure').toFixed(0) + ' ' + unit('pressure'); }, hint: 'the pressure the pressurizer control system is holding to.', detail: 'Moving this setpoint is how a cooldown is driven: the heaters and spray chase it, so lowering it walks the plant down in a controlled way instead of letting pressure fall wherever the temperature takes it. The relief and safety valve setpoints do NOT move with it.' },
        { id: 'dump_sp',  grp: 'Controls', label: 'Dump Setpoint', c: '#a0a860', ctl: function (c) { return c.steam_dump_setpoint; }, range: [0, 10], fmt: function (v) { return conv(v, 'pressure').toFixed(0) + ' ' + unit('pressure'); }, hint: 'the steam pressure the dump valves are controlling to.', detail: 'Lowering it opens the dump and cools the secondary, which cools the primary through the tubes — this is the steam-side half of a cooldown, and the rate limit on it is what keeps the vessel inside its 100 degree Fahrenheit per hour (55.6 Celsius per hour) heatup and cooldown limit.' },
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
          { k: 'Net reactivity', ser: 'rho',
            hint: 'the net excess reactivity of the core, in per cent mille (pcm) — hundred-thousandths of a reactivity unit.',
            detail: 'Zero is critical: power is steady. Positive and power is climbing, negative and it is falling, and how FAST depends on how far from zero — which is what the PERIOD readout on the board turns into seconds. This is a computed diagnostic, not a plant instrument; a real plant infers reactivity from rate meters and rod worth curves.',      v: function (t) { return sgnFix(t.reactivity_pcm, 0) + ' pcm'; } },
          { k: 'Fuel temp (Doppler)', ser: 'fuel_temp',
            hint: 'average fuel pellet temperature, the input to the Doppler reactivity feedback.',
            detail: 'Fuel runs far hotter than the coolant around it because the heat has to cross the pellet, the gap and the cladding to get out. As it heats, resonance absorption in uranium-238 broadens and swallows more neutrons — the Doppler effect — which is prompt negative feedback and the first thing that arrests a power excursion, acting in milliseconds, long before the moderator or the operator can.', v: function (t) { return dispT(t.fuel_temp_c); } },
          { k: 'Xenon', ser: 'xenon',
            hint: 'xenon-135 poisoning, as a percentage of its equilibrium worth at the current power.',
            detail: 'Xenon-135 is the strongest neutron absorber the core makes. It builds from iodine-135 decay and burns out under flux, so it lags power by hours: after a power reduction it PEAKS several hours later, and if it out-runs your available rod and boron worth the reactor cannot be restarted until it decays — the xenon precluded window. 100 % means it has settled at the value that power sustains.',               v: function (t) { return t.xenon_pct_eq.toFixed(0) + ' % eq'; } },
          { k: 'RCS boron', ser: 'boron',
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
          { k: 'Fission power', ser: 'power',
            hint: 'heat from fission alone, in megawatts thermal (MWt).',
            detail: 'This is what the nuclear instruments read and what the reactor trip acts on — and it is NOT the total heat the core is making. The moment the rods drop, fission collapses in seconds while the decay tail keeps going, so immediately after a scram this number reads far BELOW the decay heat row underneath it. Anything treating reactor power as core thermal power is wrong from the instant of the trip.',      v: function (t) { return mwtOf(t.power_pct).toFixed(1) + ' MWt'; } },
          { k: 'Decay heat', ser: 'decay',
            hint: 'heat from the decay of fission products, as a percentage of rated and in megawatts thermal (MWt).',
            detail: 'The heat you cannot switch off. Immediately after a trip from full power it is about 6–7 % of rated, falls to a few per cent within minutes and to around 1 % after a day — but it never reaches zero, which is why a shut-down core still needs a heat sink and why losing one is a real accident rather than an inconvenience.',         v: function (t) { return t.decay_heat_pct.toFixed(2) + ' % · ' + mwtOf(t.decay_heat_pct).toFixed(1) + ' MWt'; } },
          { k: 'Total core heat', ser: 'core_heat',
            hint: 'fission plus decay heat — the heat the coolant actually has to carry away, in megawatts thermal (MWt).',
            detail: 'This is the honest denominator for cycle efficiency and the number the loop temperature split is computed from. At steady power it is equal to fission power by construction, which is exactly why the difference is invisible in normal operation and matters enormously after a trip.',    v: function (t) { return mwtOf(t.core_heat_pct).toFixed(1) + ' MWt'; } },
          { k: 'Core void (boiling)', ser: 'core_void',
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
          // FIRST in the group because it is first in the CHAIN: the core exit is where
          // inadequate core cooling becomes visible, before the cladding node has moved.
          // On a covered core it equals the bulk exactly (the instrument's lag is matched
          // to `tavg` for that reason — see core_exit_temp in pwr_config), so the number
          // worth reading is the SEPARATION from Tavg, which is what this row prints.
          { k: 'Core exit temp', ser: 'core_exit',
            hint: 'coolant temperature leaving the top of the core, and how far it has separated from the loop average.',
            detail: 'The post-Three-Mile-Island inadequate-core-cooling channel — real plants were required to add it after TMI-2 precisely because the operators had no direct way to see that the core was uncovering. On a covered core it is the bulk average and the separation reads zero. Once the water level falls below the top of the fuel the steam leaving the core superheats, so this climbs away from average coolant temperature while the loop instruments still look ordinary. The separation, not the absolute number, is the cue.',
            v: function (t) {
              if (t.t_core_exit_c == null) return '—';
              var d = t.t_core_exit_c - t.tavg_c;
              return dispT(t.t_core_exit_c) + ' · ' + sgnFix(conv(d, 'tempdiff'), 0) + ' ' + unit('tempdiff') + ' vs Tavg';
            },
            cls: function (t) {
              if (t.t_core_exit_c == null) return '';
              var d = t.t_core_exit_c - t.tavg_c;
              return d > 50 ? 'q-alarm' : d > 5 ? 'q-caution' : 'q-ok';
            } },
          // MEASURED: on a covered core `stepCladding` floors the hot node at the
          // fuel temperature, so clad == fuel at power (both 693 °C / 1280 °F at
          // HFP) and sits far above the hot leg — a "clad above coolant" rule
          // cautions the whole time. The node only SEPARATES from the fuel once
          // uncovery starts (#213), which is the state worth marking; the alarm
          // step is checkDamage's own criterion, fuel_damage_c.
          { k: 'Peak clad temp', ser: 'clad_temp',
            hint: 'the hottest fuel cladding temperature in the core, at the top of the hot channel.',
            detail: 'While the core is covered the cladding sits at the fuel temperature and this tracks it. Once the water level falls below the top of the core the uncovered part is cooled by steam instead of water, the cladding separates from the fuel node and runs away upward. This is the number core damage is judged on, because damage is local before it is average.',     v: function (t) { return dispT(t.clad_temp_c); },
            cls: function (t) { return t.clad_temp_c >= fuelDamageC() ? 'q-alarm' : t.clad_temp_c > t.fuel_temp_c + 1 ? 'q-caution' : 'q-ok'; } },
          { k: 'Core uncovered', ser: 'uncovered',
            hint: 'the fraction of the core the model treats as steam-cooled rather than water-cooled.',
            detail: 'Zero while the Reactor Coolant System (RCS) inventory keeps the core covered. It ramps up as inventory falls past the top of the active fuel and reaches 100 % at significant uncovery. It is the first link in the damage chain: uncovery, then zirconium oxidation heat, then a cladding temperature excursion.',     v: function (t) { return pctOf(t.core_uncovered_frac, 1); }, cls: nzCls('core_uncovered_frac') },
          { k: 'Zr oxidation heat', ser: 'zirc',
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
          { k: 'Core ΔT (hot − cold)', ser: 'loop_dt',
            hint: 'the temperature rise the coolant picks up crossing the core — hot leg minus cold leg.',
            detail: 'For a fixed flow this is directly proportional to the heat the core is making, which is why it is the input to the Overtemperature and Overpower Delta-T reactor trips. It runs about 59 °F (33 °C) at full power and near zero on a shut-down plant with the pumps running. Lose flow and it OPENS even though power has not changed.',   v: function (t) { return physTd(t.thot_c - t.tcold_c); } },
          { k: 'Subcooling margin', ser: 'subcool',
            hint: 'how far the coolant is below its own boiling point at the current pressure.',
            detail: 'The single most important number on a Pressurized Water Reactor (PWR) during an accident, and the one that tells you whether you still have a solid water loop. Positive means liquid; zero means the coolant is at saturation and will flash to steam anywhere pressure dips. Emergency procedures are written around keeping it, and losing it is what turns a leak into a loss-of-coolant accident.',      v: function (t) { return physTd(t.subcooling_c) + (t.subcooling_c <= 0 ? ' · SATURATED' : ''); },
            cls: function (t) { return t.subcooling_c < 11.1 ? 'q-alarm' : t.subcooling_c < 22.2 ? 'q-caution' : 'q-ok'; } },
          { k: 'Heatup / cooldown rate', ser: 'tavg_rate',
            hint: 'the rate average coolant temperature is moving, per hour.',
            detail: 'Limited by the Reactor Pressure Vessel (RPV) itself: the thick steel wall heats and cools from the inside first, so a fast change puts the inner surface in tension against the outer. Technical Specifications cap it at 100 °F/hr (55.6 °C/hr) in each direction, and a controlled cooldown is spent holding that number, not chasing it.', v: function (t) { return sgnFix(conv(t.tavg_rate_c_per_hr, 'tempdiff'), 0) + ' ' + unit('tempdiff') + '/hr'; } },
          { k: 'RCS inventory', ser: 'inventory',
            hint: 'how much water is in the Reactor Coolant System (RCS), as a percentage of the normal full mass.',
            detail: 'The mass balance behind everything else. Above 100 % the plant is being over-filled and heads toward going solid; below it the pressurizer level and then the subcooling margin follow it down. It is TRUE mass, not a gauge — there is no plant instrument that reads it, which is exactly why pressurizer level has to be inferred from and cross-checked against everything else.',          v: function (t) { return t.core_inventory_pct.toFixed(1) + ' %'; },
            cls: function (t) { return t.core_inventory_pct < 90 ? 'q-alarm' : t.core_inventory_pct < 99 ? 'q-caution' : 'q-ok'; } },
          { k: 'Loop void (inventory)', ser: 'loop_void',
            hint: 'the steam fraction in the loop as a whole, outside the core channel.',
            detail: 'Zero on an intact plant. Steam in the loop breaks natural circulation, defeats the Reactor Coolant Pumps (RCPs) and makes pressurizer level lie — a voiding primary pushes water UP into the pressurizer, so level rises while the plant is losing inventory. That is the deception at the heart of the Three Mile Island accident.',  v: function (t) { return pctOf(t.primary_void_fraction, 1); }, cls: nzCls('primary_void_fraction') },
          // The flow NUMBER and the flow MODE on one line. They are the same fact and reading
          // them apart is what makes a blackout confusing: 3 % is either a dying pump or a
          // healthy natural-circulation loop, and only the mode says which.
          { k: 'RCS loop flow', ser: 'rcs_flow',
            hint: 'coolant flow through the loop as a percentage of rated, and whether it is pumped or buoyancy-driven.',
            detail: '100 % with the Reactor Coolant Pumps (RCPs) running. Stop them and it does not fall to zero: buoyancy between the hot and cold legs keeps a few per cent circulating — natural circulation — which is enough to carry decay heat to the steam generator but nothing like enough for power operation. It only works while the loop is full of liquid, so it is the first thing voiding takes away, and the mode word here is the difference between a loop that is coasting down and one that has established a standing circuit.',
            v: function (t) {
              var mode = t.pump_running ? 'FORCED' : (t.natural_circulation ? 'NATURAL CIRC' : 'STAGNANT');
              return t.pump_flow_pct.toFixed(0) + ' % · ' + mode;
            },
            cls: function (t) { return t.pump_running ? 'q-ok' : (t.natural_circulation ? 'q-caution' : 'q-alarm'); } },
          // The pressurizer's OWN water mass (#385). Level is what the board shows and it is
          // a geometry function of three separate terms (mass, void credit, Tavg); this is
          // the mass term alone, which is the one an inventory loss actually moves.
          { k: 'Pressurizer level (off-scale)', ser: 'pzr_node',
            hint: 'what the pressurizer level model reads before the gauge clips it to its 0–100 % span.',
            detail: 'A level gauge stops at the ends of its span, and the plant does not. Once the pressurizer goes solid the indication sits at 100 % and stays there however far past full the loop is being pushed — so the operator loses the one signal that says how hard the relief valves are about to be worked. At the other end an indication resting on 0 % says nothing about how much water a recovery has to put back before level even reappears on the gauge. On span this reads exactly what the gauge reads; the number only becomes news when the gauge has run out of scale.',
            v: function (t) {
              var p = pzrNodePct(t);
              if (p == null) return '—';
              if (p > 100) return p.toFixed(0) + ' % · SOLID, ' + (p - 100).toFixed(0) + ' pts past full';
              if (p < 0) return p.toFixed(0) + ' % · ' + (-p).toFixed(0) + ' pts below span';
              return p.toFixed(0) + ' % · on span';
            },
            cls: function (t) {
              var p = pzrNodePct(t);
              // Same low bands as the pzr_level gauge (caution_lo 25 / danger_lo 12); off
              // either end of the span is an alarm in its own right, because that is the
              // state the gauge beside it can no longer report.
              return p == null ? '' : ((p > 100 || p < 12) ? 'q-alarm' : p < 25 ? 'q-caution' : 'q-ok');
            } },
          // The passive shot, and how much of it is left. The ECCS card shows HPI flow,
          // discharge pressure and alignment; nothing anywhere shows accumulator
          // inventory, so a player who has dumped the tanks has no way to know it.
          { k: 'Accumulator inventory', ser: 'accum_vol',
            hint: 'water remaining in the passive accumulator tanks, and their nitrogen pressure.',
            detail: 'The accumulators are the passive shot: nitrogen-pressurized tanks that dump into the cold leg on their own the moment Reactor Coolant System (RCS) pressure falls below their check valves, with no power, no signal and no operator. They fire once. Once they are empty the core is on pumped Emergency Core Cooling System (ECCS) injection alone, and nothing else on the board says how much is left.',  v: function (t) { return t.accumulator_volume_pct.toFixed(0) + ' % · ' + physP(t.accumulator_pressure_mpa); },
            cls: function (t) { return t.accumulator_volume_pct < 1 ? 'q-alarm' : t.accumulator_volume_pct < 99 ? 'q-caution' : 'q-ok'; } },
        ] },
        // There are no per-node pressure GAUGES on this plant — the one
        // primary_pressure instrument reads the hot-leg/pressurizer datum. The
        // split is why the cold leg reaches an ECCS setpoint before the gauge does
        // and why the pump suction cavitates first.
        { title: 'Loop pressure', rows: [
          { k: 'Hot leg (pzr datum)', ser: 'p_hot',
            hint: 'pressure at the hot leg, where the pressurizer connects — the datum the one pressure gauge reads.',
            detail: 'The plant has a single primary pressure instrument and it reads here. Every other pressure below is computed from this one plus the pump head and the loop losses, and none of them has a gauge.',     v: function (t) { return physP(t.p_hotleg); } },
          { k: 'Cold leg (pump disch)', ser: 'p_cold',
            hint: 'pressure at the Reactor Coolant Pump (RCP) discharge, the high point of the loop.',
            detail: 'The pump adds head, so the cold leg sits above the pressurizer datum by roughly the pump differential. It matters because Emergency Core Cooling System (ECCS) injection and the accumulator check valves see THIS pressure, not the one on the gauge — so injection can start or stop at a pressure the board never displays.',   v: function (t) { return physP(t.p_coldleg); } },
          { k: 'Pump suction', ser: 'p_suct',
            hint: 'pressure at the Reactor Coolant Pump (RCP) suction, the low point of the loop.',
            detail: 'The lowest pressure anywhere in the primary, which makes it the first place the coolant can flash. If pressure falls here to the saturation pressure of the water arriving, the pump cavitates.',            v: function (t) { return physP(t.p_pumpsuction); } },
          { k: 'Suction subcooling', ser: 'suct_sub',
            hint: 'how far the water arriving at the Reactor Coolant Pump (RCP) is below boiling, at the suction pressure.',
            detail: 'The margin that actually protects the pumps, and it is always smaller than the loop subcooling margin above, because the suction is the lowest pressure in the system. It reaches zero before the bulk coolant does — the pumps are the first thing a depressurization threatens.',      v: function (t) { return physTd(t.suction_subcool_c); },
            cls: function (t) { return t.suction_subcool_c <= 0 ? 'q-alarm' : t.suction_subcool_c < 11.1 ? 'q-caution' : 'q-ok'; } },
          { k: 'RCP cavitation', ser: 'cavit',
            hint: 'how badly the Reactor Coolant Pumps (RCPs) are cavitating, as a fraction.',
            detail: 'Zero on a healthy plant. Above zero the pumps are passing steam bubbles that collapse violently against the impeller: flow falls off, the pumps are being damaged, and procedures call for tripping them and going to natural circulation rather than running them to destruction.',          v: function (t) { return pctOf(t.rcp_cavitation_frac, 0); }, cls: nzCls('rcp_cavitation_frac') },
          { k: 'Primary leak flow', ser: 'leak',
            hint: 'coolant leaving the Reactor Coolant System (RCS) through a break or a leak, as a fraction of inventory per second and as a real flow rate.',
            detail: 'Zero on an intact plant. The percentage is the fraction of the whole Reactor Coolant System (RCS) inventory leaving every second, which is the modelling currency; the gallons per minute beside it is what an operator sizes a leak against — a Technical Specification unidentified-leakage limit is 1 gpm, makeup can hold tens of gpm, and a large break is thousands. Discharge is not fixed: a break is an AREA, so flow falls as the system depressurizes, which is why a large break is violent early and slows as it empties.',
            v: function (t) { return pctOf(t.leak_flow, 2) + ' · ' + physFlow(t.leak_flow); }, cls: nzCls('leak_flow') },
        ] },
        // ------------------------------------------------ pressure boundary (2026-08-08)
        // The relief path, which is literally between Loop pressure and Containment on the
        // energy-path spine: this is the route the primary's mass takes to get there.
        //
        // It is also the tab's single biggest omission, and the reason is worth stating.
        // Everything above reads a quantity with no instrument; these rows read quantities
        // whose INSTRUMENT DISAGREES WITH THEM. `porv_indicator` reports the DEMAND signal,
        // not the valve — which is the Three Mile Island accident in one channel, and the
        // Physics tab is the sanctioned place to show what the demand light cannot (HR1).
        { title: 'Pressure boundary', rows: [
          { k: 'Pressurizer relief (PORV)', ser: 'porv',
            hint: 'what the power-operated relief valve is actually doing, as opposed to what it has been told to do.',
            detail: 'At Three Mile Island Unit 2 the relief valve stuck open and the control room indication showed it shut — because the light was wired to the SIGNAL sent to the valve, not to the valve stem. The plant drained through an open relief path for two hours and twenty minutes with the board reporting a closed valve. This row reads the valve. The block valve beside it is the operator remedy: shutting it isolates a stuck relief valve, which is what finally stopped the TMI-2 leak.',
            v: function (t) {
              var s = t.porv_open ? 'OPEN' : 'shut';
              if (t.porv_stuck) s += ' · STUCK';
              if (t.block_valve_open === false) s += ' · block valve SHUT';
              return s;
            },
            cls: function (t) { return t.porv_stuck ? 'q-alarm' : (t.porv_open ? 'q-caution' : 'q-ok'); } },
          { k: 'PORV tailpipe temp', ser: 'tailpipe',
            hint: 'temperature of the discharge line downstream of the relief valve.',
            detail: 'The unalarmed indication that reveals a stuck-open relief valve. Steam passing the seat heats the pipe on the way to the quench tank, so a hot tailpipe with the valve indicating shut means the valve is not shut. At Three Mile Island the reading was available and elevated, and it was discounted — the shift believed a leaking valve could explain it. It sits near the containment temperature on an intact plant and climbs toward the primary saturation temperature when relief is passing.',
            v: function (t) { return dispT(t.porv_tailpipe_temp_c); },
            cls: function (t) {
              if (t.porv_tailpipe_temp_c == null) return '';
              return t.porv_tailpipe_temp_c > 150 ? 'q-alarm' : t.porv_tailpipe_temp_c > 100 ? 'q-caution' : 'q-ok';
            } },
          { k: 'Pressurizer spray', ser: 'spray_flow',
            hint: 'spray valve flow, and whether the valve is stuck.',
            detail: 'Spray is the fast way DOWN in pressure: cold leg water sprayed into the steam space condenses steam and drops pressure in seconds, where the heaters take minutes to raise it. It is drawn from the reactor coolant pump discharge, so it needs a running pump to work at all — losing the pumps costs you the pressure control you are most likely to want. A stuck-open spray valve depressurizes the plant toward saturation with no leak anywhere.',
            v: function (t) {
              var f = t.spray_flow_pct == null ? 0 : t.spray_flow_pct;
              return (f < 0.05 ? '0' : f.toFixed(0)) + ' %' + (t.spray_stuck ? ' · STUCK' : '');
            },
            cls: function (t) { return t.spray_stuck ? 'q-alarm' : ((t.spray_flow_pct || 0) > 0.05 ? 'q-caution' : 'q-ok'); } },
          { k: 'Steam generator safeties', ser: 'sg_safety',
            hint: 'whether the secondary code safety valves are lifting.',
            detail: 'The last line on the steam side, and unlike the relief valve they are pure spring-loaded mechanics — no signal, no power, no operator. They lift on steam pressure alone and reseat when it falls back. Lifting is not itself a fault: it means the steam generator has nowhere else to send its heat, which is normal on a loss of heat sink and is what keeps the secondary below its design pressure. Steam leaving here goes to atmosphere, so it is an inventory loss the condenser never sees.',
            v: function (t) { return t.sg_safety_open ? 'LIFTING' : 'seated'; },
            cls: function (t) { return t.sg_safety_open ? 'q-caution' : 'q-ok'; } },
        ] },
        // Containment (#386 stage 1) — the receiving volume the break and relief
        // discharge into. Sits after Loop pressure on the energy-path spine: it is
        // where the primary's mass and energy END UP when the boundary is open.
        { title: 'Containment', rows: [
          { k: 'Containment pressure', ser: 'ctmt_p',
            hint: 'building pressure above atmospheric, in gauge units — 0 on a healthy plant.',
            detail: 'The receiving volume for a primary break or an open relief valve. Hot discharge partly flashes to steam and pressurizes the building, so rising containment pressure is the direct evidence of a high-energy line break inside it — a real plant starts safety injection on it at 3.5 pounds per square inch gauge (psig). An intact plant reads exactly 0, and a steam generator tube rupture ALSO reads 0, because that break discharges into the steam generator instead: the one leak containment cannot see.',
            v: function (t) { return physPg(t.containment_pressure_mpa); },
            cls: function (t) {
              // Thresholds from config (#386 stage 2): caution at the sourced 3.5 psig
              // SI-backup signal, alarm at the 30 psig spray/hi-hi point.
              var c = (RD.PWR_CONFIG || {}).containment || {};
              var amb = c.ambient_pressure_mpa != null ? c.ambient_pressure_mpa : 0.1013;
              var hihi = c.spray_hihi_pressure_mpa != null ? c.spray_hihi_pressure_mpa : 0.3081;
              var hi = c.si_hi_pressure_mpa != null ? c.si_hi_pressure_mpa : 0.1254;
              var p = t.containment_pressure_mpa != null ? t.containment_pressure_mpa : amb;
              return p >= hihi ? 'q-alarm' : (p >= hi ? 'q-caution' : 'q-ok');
            } },
          { k: 'Heat removal',
            hint: 'which containment heat-removal trains are running — sprays and safety-realigned fan coolers.',
            detail: 'Automatic in this build: containment spray starts on the 30 psig high-high signal (two 100 % trains at the reference plant), and the fan coolers realign to their safety mode on any safety injection. Normal-mode fan cooling is part of the passive heat sink. PASSIVE here is the healthy reading; a blackout stops both trains even with the signals standing.',
            v: function (t) {
              var s = t.ctmt_spray_active ? 'SPRAY' : null, f = t.ctmt_fan_active ? 'FANS-SI' : null;
              return s && f ? 'SPRAY + FANS-SI' : (s || f || 'PASSIVE');
            },
            cls: function (t) { return t.ctmt_spray_active ? 'q-alarm' : (t.ctmt_fan_active ? 'q-caution' : 'q-ok'); } },
          { k: 'Containment temperature', ser: 'ctmt_t',
            hint: 'atmosphere temperature inside the building.',
            detail: 'Rides the steam content: a steam and air mixture sits at the saturation temperature of its steam fraction, so temperature and pressure rise together during a blowdown and fall together as the passive heat sinks condense steam out onto the structures. Around 100 °F (38 °C) on a healthy plant.',
            v: function (t) { return conv(t.containment_temp_c, 'temp').toFixed(0) + ' ' + unit('temp'); },
            cls: function (t) { return t.containment_temp_c > 100 ? 'q-alarm' : t.containment_temp_c > 45 ? 'q-caution' : 'q-ok'; } },
          { k: 'Containment sump level', ser: 'ctmt_sump',
            hint: 'water collected on the building floor, as a percentage of the sump reference volume.',
            detail: 'Every pound the primary loses to the building ends up here — spilled liquid directly, flashed steam after the structures condense it back out. A climbing sump with steady pressure is the signature of a small cold leak, which is exactly the diagnosis the alarm-response procedures send you here for. Indication only: this plant models no recirculation from the sump.',
            v: function (t) { return (t.containment_sump_pct != null ? t.containment_sump_pct : 0).toFixed(1) + ' %'; },
            cls: nzCls('containment_sump_pct') },
          // Hydrogen (#386 stage 3). One concentration row + a status row; the burn
          // annunciator (A41) carries the event, this is the trend the operator watches.
          { k: 'Containment hydrogen', ser: 'ctmt_h2',
            hint: 'hydrogen concentration in the building atmosphere, volume percent — 0 unless the core has been oxidizing.',
            detail: 'Hydrogen comes from one place: overheated zirconium cladding burning in steam (the same reaction that accelerates a melting core). It reaches the building through whatever opening the primary is discharging through, so a tube-rupture accident sends its hydrogen into the steam generator instead and this reads 0. The lower flammability limit is 4.1 volume percent; at TMI-2 the building averaged about 7.9 percent when it ignited, 9 hours 50 minutes in — a single sharp pressure spike the operators first read as electrical noise. Recombiners work the concentration back down over many hours; they cannot keep up with a rapidly oxidizing core.',
            v: function (t) { return (t.ctmt_h2_pct != null ? t.ctmt_h2_pct : 0).toFixed(2) + ' % vol'; },
            cls: function (t) {
              var c = (RD.PWR_CONFIG || {}).containment || {};
              var flam = c.h2_flammability_pct != null ? c.h2_flammability_pct : 4.1;
              var ign = c.h2_ignition_pct != null ? c.h2_ignition_pct : 8.0;
              var h = t.ctmt_h2_pct || 0;
              return h >= ign ? 'q-alarm' : (h >= flam ? 'q-caution' : 'q-ok'); } },
          { k: 'Hydrogen control',
            hint: 'recombiner status, and whether a hydrogen burn has occurred.',
            detail: 'The recombiners start automatically on rising hydrogen in this build and secure themselves once the concentration is back down. BURNED latches forever: a hydrogen deflagration is a one-time event — it consumes most of the inventory in seconds and leaves a pressure spike the containment is designed to survive.',
            v: function (t) {
              if (t.ctmt_h2_burned) return t.ctmt_recomb_active ? 'BURNED + RECOMB' : 'BURNED';
              return t.ctmt_recomb_active ? 'RECOMBINERS' : 'IDLE';
            },
            cls: function (t) { return t.ctmt_h2_burned ? 'q-alarm' : (t.ctmt_recomb_active ? 'q-caution' : 'q-ok'); } },
        ] },
        // fw_flow_normalized is TOTAL feed (main + AFW — pwr_steam_generator.js:83),
        // and steam_out_total is everything leaving the SG (turbine + dump + safeties),
        // so the difference is the SG's mass balance: positive = boiling off faster
        // than it is being fed, i.e. the level is going down.
        { title: 'Heat sink & output', rows: [
          // The heat sink's own two state variables, neither of which has an instrument.
          // `sg_level` is a NARROW-RANGE tap on one part of the vessel; this is the mass
          // ledger the level is computed from (#418), and the saturation temperature is the
          // temperature the primary is actually dumping into.
          { k: 'Steam generator inventory', ser: 'sg_mass',
            hint: 'water mass in the steam generator, as a percentage of its normal contents.',
            detail: 'The narrow-range level gauge on the board watches a band around the normal operating level and pegs outside it; this is the whole vessel. During a transient the two part company badly — a level indication that has bottomed out says nothing about whether there is a thousand pounds of water left or none, which is the difference between a heat sink and a dry steam generator. Boiling one dry is what removes the primary\'s only way to reject heat with the reactor coolant pumps running.',
            v: function (t) { return t.sg_mass_frac == null ? '—' : (t.sg_mass_frac * 100).toFixed(0) + ' %'; },
            cls: function (t) {
              if (t.sg_mass_frac == null) return '';
              var m = t.sg_mass_frac * 100;
              return m < 20 ? 'q-alarm' : m < 60 ? 'q-caution' : 'q-ok';
            } },
          { k: 'Primary → secondary ΔT', ser: 'psg_dt',
            hint: 'how much hotter the primary coolant is than the boiling water in the steam generator — the gradient that moves the heat.',
            detail: 'Heat only crosses the tubes because of this difference, and the transfer is roughly proportional to it. That is the whole coupling behind Pressurizer Water Reactor behaviour: open the turbine valves, steam pressure falls, the secondary boils colder, the gradient widens, more heat leaves the primary, average coolant temperature drops and the negative moderator coefficient raises reactor power — with nobody touching a rod. Watch this rather than power to understand why the reactor follows the turbine. It collapses toward zero when the steam generator loses its ability to take heat.',
            v: function (t) {
              if (t.t_sg_c == null) return '—';
              return physTd(t.tavg_c - t.t_sg_c) + ' · SG sat ' + dispT(t.t_sg_c);
            },
            cls: function (t) {
              if (t.t_sg_c == null) return '';
              return (t.tavg_c - t.t_sg_c) < 3 ? 'q-alarm' : (t.tavg_c - t.t_sg_c) < 8 ? 'q-caution' : 'q-ok';
            } },
          { k: 'Steam − feed mismatch', ser: 'sg_bal',
            hint: 'steam leaving the steam generator minus feedwater going in, as a percentage of rated.',
            detail: 'The steam generator mass balance in one number. Positive means it is boiling off faster than it is being fed and level is falling; negative means it is filling. It is element 2 and 3 of the three-element feedwater controller and the reason that controller can anticipate a load change instead of chasing level after the fact.', v: function (t) { return sgnFix((t.steam_out_total - t.fw_flow_normalized) * 100, 1) + ' %'; } },
          { k: 'Turbine steam demand', ser: 'demand',
            hint: 'what the turbine is asking the steam generator for, in megawatts electric (MWe).',
            detail: 'The secondary side sets the pace on a Pressurized Water Reactor (PWR): open the turbine valves and the extra steam draw cools the primary, average temperature falls, and the negative moderator coefficient raises reactor power on its own. The reactor follows the turbine, not the other way round.',  v: function (t) { return t.steam_demand_mwe.toFixed(1) + ' MWe'; } },
          { k: 'Gross electrical', ser: 'mwe',
            hint: 'generator output in megawatts electric (MWe), before station loads.',
            detail: 'What the machine is actually putting on the grid. It reads the TURBINE, not the core — the two diverge whenever the generator breaker is open or steam is going to the dump valves instead of the turbine.',      v: function (t) { return t.mwe_output.toFixed(1) + ' MWe'; } },
          { k: 'Cycle efficiency', ser: 'eff',
            hint: 'electrical output divided by total core heat.',
            detail: 'About a third on a Pressurized Water Reactor (PWR) — saturated steam at roughly 1000 pounds per square inch (psi) simply cannot do better, which is why a plant making around 100 megawatts electric (MWe) is burning three times that in the core. It collapses after a trip because the core keeps making decay heat with nothing taking load off it.',      v: function (t) { var q = mwtOf(t.core_heat_pct); return q > 1 ? (t.mwe_output / q * 100).toFixed(1) + ' %' : '—'; } },
        ] },
        // ------------------------------------------------- support systems (2026-08-08)
        // LAST, because everything above depends on these and none of them is a reactor
        // quantity. They are the answers to "why did that stop working": AC power is the
        // question every motor load asks, the emergency injection is the only thing that
        // adds inventory back, and the condenser is where the secondary's heat goes when
        // it is not going to atmosphere.
        { title: 'Support systems', rows: [
          { k: 'AC power', ser: 'ac_avail',
            hint: 'whether alternating-current power is available to the plant\'s motor loads.',
            detail: 'Every pump on the plant is a motor, and a motor with no power is a closed valve however its control switch is set. This is the question each of them asks. A station blackout is the loss of both offsite power and the emergency diesels at once — it is what happened at Fukushima Daiichi, and it takes the reactor coolant pumps, the main feed pumps, the charging pumps and the emergency injection together, leaving only what runs on steam, gravity or stored pressure.',
            v: function (t) { return t.station_blackout ? 'STATION BLACKOUT' : (t.ac_available ? 'available' : 'LOST'); },
            cls: function (t) { return (t.station_blackout || !t.ac_available) ? 'q-alarm' : 'q-ok'; } },
          { k: 'Emergency injection', ser: 'eccs_flow',
            hint: 'which emergency core cooling path is delivering, and how much water it is putting in.',
            detail: 'The only thing on the plant that ADDS inventory during a loss-of-coolant accident. High-pressure injection works against a nearly intact primary and delivers little; the passive accumulators fire on their own when pressure falls below their check valves and empty in minutes; residual heat removal takes over at low pressure and can carry the plant indefinitely. The mode word says which regime you are in, and the flow says whether it is keeping up with the leak — compare it against the primary leak flow row.',
            v: function (t) {
              var g = ((t.hpi_flow_normalized || 0) + (t.accumulator_flow_normalized || 0)) * eccsRatedGpm();
              var m = String(t.eccs_mode || 'off').toUpperCase();
              if (t.rhr_active) m += ' + RHR';
              return m + ' · ' + conv(g, 'flow').toFixed(0) + ' ' + unit('flow');
            },
            cls: function (t) {
              if (t.eccs_mode && t.eccs_mode !== 'off') return 'q-caution';
              return t.rhr_active ? 'q-caution' : 'q-ok';
            } },
          { k: 'Condenser heat sink', ser: 'vacuum',
            hint: 'whether the condenser can take steam, and the cooling water temperature it is rejecting heat to.',
            detail: 'The steam dump can only carry the plant while the condenser can condense, and that needs circulating water and vacuum. Lose either and the dump valves are useless — the secondary\'s heat has to go to atmosphere through the relief valves instead, which is noisy, wastes treated water and is an inventory loss with no return. Cooling water inlet temperature is the ultimate heat sink the whole cycle rejects into: a hot river in summer costs real megawatts, which is why plants de-rate in a heatwave.',
            v: function (t) {
              return (t.condenser_cooling_available ? 'available' : 'LOST') +
                     ' · vac ' + dispV(t.condenser_vacuum_kpa) + ' · CW ' + dispT(t.cw_inlet_temp_c);
            },
            cls: function (t) { return t.condenser_cooling_available ? 'q-ok' : 'q-alarm'; } },
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
  // The GENERATED instrument tier — what a channel measures, its indicating range, its lag and
  // the alarms it drives, straight out of RD.MANUAL and the plant's own protection table.
  // Extracted from gaugeDetail 2026-08-09 so the Indications tab shares it: one channel
  // described two different ways on two surfaces is the drift this whole pattern exists to
  // prevent, and hand-authoring 50 range/lag figures would be a second copy of numbers that
  // already exist and go stale on the next retune.
  function indicationFacts(instr) {
    var ind = instr ? manualIndication(instr) : null, bits = [];
    if (!ind) return bits;
    if (ind.measures) bits.push(ind.measures);
    if (ind.range) bits.push('Indicating range ' + fmtInstrValue(ind.range[0], ind.unit, instr) +
                             ' to ' + fmtInstrValue(ind.range[1], ind.unit, instr) + '.');
    if (ind.lag_s) bits.push('About ' + ind.lag_s + ' s of instrument lag — it trails the plant.');
    if (ind.alarms && ind.alarms.length) {
      bits.push('Drives ' + ind.alarms.map(function (id) {
        var sp = alarmSpec(id);
        return sp ? (sp.label_industry || sp.label_learning || id) : id;
      }).join(', ') + '.');
    }
    return bits;
  }
  function gaugeDetail(g) {
    var bits = indicationFacts(g.instr);
    bits.push('The coloured bands are the alarm and trip setpoints. The needle reads the ' +
              'instrument, which can be stuck, drifting or dead while the plant behind it is ' +
              'fine — and the reverse (HR1).');
    return bits.join(' ');
  }
  // One Indications row's copy. THREE SOURCES, in this order, and the order is the point:
  //   1. `s.detail`  — authored context, where nothing can generate it. That is the 34 status
  //      channels (the manual reference describes analog instruments, not indicator lights)
  //      and the commanded positions, which are not measurements at all.
  //   2. the generated facts above, for the 50 analog channels the manual covers.
  //   3. a closing line naming what KIND of number the row is. Every indication row ends by
  //      saying it is the channel rather than the plant, because that is the tab's whole
  //      premise and the reason the Physics tab exists beside it (HR1).
  // `hint` prefers authored copy, then the manual's own one-line `measures`.
  function indicationCopy(s) {
    var ind = s.instr ? manualIndication(s.instr) : null;
    var bits = [];
    if (s.detail) bits.push(s.detail);
    bits = bits.concat(indicationFacts(s.instr));
    bits.push(s.ctl
      ? 'This is a COMMANDED position, not a measurement — what the operator or an automation ' +
        'channel asked for. What the plant did about it is a different row.'
      : 'This is the CHANNEL, not the plant: it lags, it can carry noise, and it can be failed ' +
        'from the Inject Failure tab. The quantity behind it is on the Physics tab.');
    return { hint: s.hint || firstSentence(ind && ind.measures) || null, detail: bits.join(' ') };
  }
  // The SUMMARY tier is one sentence by definition — it is what shows before the player asks
  // for more. Several `measures` entries in the manual reference run to a paragraph (the OTΔT
  // margin one is three sentences and explains the whole protection rack), which is right for
  // the detail tier and wrong for a one-line summary. The rest is not lost: `indicationCopy`
  // puts the FULL text at the head of the detail, so expanding the row continues the sentence
  // the summary started. Splits only on a full stop followed by a capital, so "4.1 volume
  // percent" and "0.1 s" do not read as sentence ends.
  function firstSentence(t) {
    if (!t) return t;
    var m = /^(.*?[.!?])\s+[A-Z(]/.exec(t);
    return m ? m[1] : t;
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

  // The packed chart row's column map: series id → its index, which IS its position in
  // `prof().series`. Rebuilt on every plant change, next to the buffer clear that goes with
  // it — a stale index does not read as missing data, it reads as somebody else's trace.
  // `RD.ChartCols` publishes it for the board's vital tiles, which pull fine sub-samples out
  // of the same rows through the RD side channel (see TILE_SERIES in pwr_board_wiring.js).
  function buildSeriesIndex() {
    serCol = {}; serCols = 0;
    prof().series.forEach(function (s) { serCol[s.id] = serCols++; });
    RD.ChartCols = serCol;
  }

  // ---- the PLOT COLUMN, shared by the Physics and Indications lists ---------------------
  // *(OWNER, 2026-08-08: "I would like a column to the left of the lables with a checkbox for
  // the strip chart. when you check this box it puts this value on the chart.")*
  //
  // One cell renderer for both lists, so a quantity that appears on both (Tavg is an
  // indication AND a physics row) toggles the SAME series and cannot end up half-ticked. A
  // row with no series id renders an EMPTY cell of the same width rather than no cell: the
  // composite rows — "intact · 507 °F to damage", "SPRAY + FANS-SI", "BURNED" — are text, not
  // traces, and losing the column on those rows would step every label in the group sideways.
  function plotCell(serId) {
    if (!serId) return '<span class="plot-cell"></span>';
    var s = seriesById(serId), on = !!ui.series[serId];
    return '<span class="plot-cell"><input type="checkbox" data-series="' + serId + '"' +
           (on ? ' checked' : '') + ' title="Plot on the strip chart">' +
           (on && s ? '<i class="ser-swatch" style="background:' + s.c + '"></i>' : '') + '</span>';
  }
  function seriesById(id) {
    var a = prof().series;
    for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  }
  // A series toggled anywhere has to show as toggled EVERYWHERE — the Graph/Indications list
  // and the Physics list are two views of one `ui.series` map, and the swatch appears or
  // disappears with the tick. Re-rendered rather than diffed because the cells are cheap and
  // this runs on a click, not on a broadcast.
  function syncPlotCells() {
    document.querySelectorAll('.plot-cell input[data-series]').forEach(function (cb) {
      var id = cb.getAttribute('data-series'), on = !!ui.series[id];
      cb.checked = on;
      var cell = cb.parentNode, sw = cell.querySelector('.ser-swatch');
      if (on && !sw) {
        var s = seriesById(id);
        if (s) { sw = document.createElement('i'); sw.className = 'ser-swatch'; sw.style.background = s.c; cell.appendChild(sw); }
      } else if (!on && sw) { cell.removeChild(sw); }
    });
  }

  // ---- the INDICATIONS tab -------------------------------------------------------------
  // *(OWNER, 2026-08-08: "Lets change the graph tab to 'Indications' and this tells us all
  // the indications in the plant, categorized like the physcs tab. it should also have a
  // checkbox column to add it to the graph.")*
  //
  // Every channel the plant publishes, grouped by `series[].grp` — the same energy-path
  // spine the Physics tab and the Inject Failure list use, so all three read alike. Group
  // order is first-seen order in the profile, so the array IS the display order and there is
  // no second list to keep in step; `run_inspect` fails if an instrument exists with no
  // series, so the array cannot fall behind the engine either.
  //
  // WHAT IS LISTED HERE vs on Physics — the split is HR1's, not an arbitrary one. A series
  // with `get` is a CHANNEL (lag, noise, failable) and belongs here; a series with `ctl` is a
  // COMMANDED position, which the board displays and the operator reads, so it belongs here
  // too under its own group. A series with only `tru` has no channel at all — decay heat,
  // voiding, the loop pressure split — and its home is the Physics tab, where every one of
  // them has a row. A plant with NO physics panel (RBMK/BWR, on hold) lists everything, so
  // nothing becomes unreachable on those.
  var indRows = [];   // [{ el, ser }] in profile order — element refs cached at build time
  /* ONE LIST OF PAIRED ROWS (#439, spec §3) — indicated and true on the same line.
   *
   * It was two tabs. Side-by-side was never possible: Indications is ~93 rows, and two
   * tables in a ~360 px column is ~170 px each, unreadable at 1280 px. But the deciding
   * argument is not width — it is that DIVERGENCE IS NOW COMPUTED RATHER THAN SPOTTED. A
   * stuck valve used to announce itself only to somebody who thought to compare the right
   * pair of rows across two panels; here the software flags it.
   *
   * WHY THE DATA DID NOT MOVE. `PROFILES.pwr.series` (119 entries) and `prof().physics`
   * (46 curated rows, 43 of them bound to a series by `ser:`) both stay exactly where they
   * are, in the same order, under the same marker comments. `test/run_inspect.js` parses
   * ui/app.js AS TEXT between `'      series: ['` and `'------ Physics tab'`; moving or
   * reindenting either block silently empties that slice and the gate then passes on
   * nothing. This is a RENDERING merge, not a data merge — which is also why the physics
   * rows keep their hand-written `v()` prose for the true column: it is better than
   * `tru()` + `fmt()` (it prints "3.12 % · 9.4 MWt", not "3"), and it is already gated.
   *
   * HR1 guard: a view showing truth beside indication is a DEBUG view. The truth column is
   * suppressible and defaults OFF in mission and campaign modes — HR1 only teaches if the
   * operator is genuinely fooled.
   */
  var indPhysIdx = null;      // series id -> its curated physics row, if any
  function buildPhysIndex() {
    indPhysIdx = {};
    var groups = prof().physics || [];
    groups.forEach(function (g) {
      g.rows.forEach(function (r) { if (r.ser && !indPhysIdx[r.ser]) indPhysIdx[r.ser] = r; });
    });
  }
  // What KIND of row is this? The three the spec names, as filter chips:
  //   paired — an instrument and a true value both exist; they can disagree.
  //   ind    — derived or commanded channels with no true counterpart.
  //   phys   — true state with no instrument. This category IS a teaching artifact:
  //            it is the list of things the operator can never see.
  function rowType(s) {
    var hasInd = !!(s.get || s.ctl);
    var hasTru = !!(s.tru || (indPhysIdx && indPhysIdx[s.id]));
    return hasInd && hasTru ? 'paired' : hasInd ? 'ind' : 'phys';
  }
  function buildIndications() {
    var box = $('indicationsList'); if (!box) return;
    indRows = [];
    buildPhysIndex();
    // EVERY series now, not just the instrumented ones: the physics-only rows are the
    // third row type, and dropping them would lose exactly the channels the merge exists
    // to show. (RBMK/BWR have no `physics` block at all — they land as ind/phys rows and
    // render as a plain list, which is what they had before.)
    var rows = prof().series.slice();
    var html = '', grp = null;
    rows.forEach(function (s) {
      if (s.grp !== grp) {
        if (grp !== null) html += '</div>';
        grp = s.grp;
        html += '<div class="ind-grp">' + (grp ? '<h4>' + grp + '</h4>' : '');
      }
      // Same two-tier scanner copy the Physics rows carry (#350 item 3), and needed here for
      // the same reason: this is the densest list in the shell and rows like "OPΔT Margin" or
      // "Above P-9" are unreadable from the label alone. The block splits the summary on
      // ' — ', so the row label becomes its title.
      var cp = indicationCopy(s);
      var attrs = (cp.hint ? ' data-scanner-hint="' + esc(s.label + ' — ' + cp.hint) + '"' : '') +
                  (cp.hint && cp.detail ? ' data-scanner-detail="' + esc(cp.detail) + '"' : '');
      var ty = rowType(s);
      html += '<div class="num-line" data-rowtype="' + ty + '"' + attrs + '>' + plotCell(s.id) +
              '<span class="nk">' + s.label + '</span>' +
              '<span class="nv">—</span>' +
              '<span class="nv-true">—</span>' +
              '<span class="nv-warn" title="The instrument disagrees with the plant">⚠</span>' +
              '</div>';
    });
    if (grp !== null) html += '</div>';
    box.innerHTML = html;
    var lines = box.querySelectorAll('.num-line'), n = 0;
    rows.forEach(function (s) {
      var el = lines[n++];
      indRows.push({ line: el, el: el.querySelector('.nv'), tel: el.querySelector('.nv-true'),
                     ser: s, phys: indPhysIdx[s.id] || null, type: rowType(s) });
    });
    applyIndFilter();
    applyTruthMode();
  }
  // The true side of a row, formatted. Prefers the curated physics prose where one exists
  // for this series — see the note above.
  function seriesTrue(r, snap) {
    if (!snap || !snap.true_state) return null;
    try {
      if (r.phys && r.phys.v) return r.phys.v(snap.true_state, snap);
      if (r.ser.tru) return r.ser.fmt(r.ser.tru(snap.true_state));
    } catch (e) { /* a field this plant does not publish */ }
    return null;
  }
  /* Does the instrument disagree with the plant? (spec §3.)
   *
   * MEASURED FIRST, because a threshold is a claim that what it excludes is harmless.
   * At hot full power with nothing injected, 92 rows are comparable and the spread runs:
   *
   *     Cold Leg           551 °F   vs 550 °F     0.18 %   <- lag. not a disagreement
   *     Steam P            826 psi  vs 825 psi    0.12 %   <- lag
   *     Primary -> SG dT    29.3 °F vs 29 °F      1.02 %   <- rounding
   *     Letdown Flow        23 gpm  vs 31 gpm    25.81 %   <- a REAL disagreement
   *     Intermediate Range 2.0e-3 A vs 8.3e-3 A  75.90 %   <- a REAL disagreement
   *
   * A plain string comparison — the first version of this — flagged all five, permanently,
   * on a plant doing nothing wrong. A flag that is always lit teaches the player to ignore
   * it, which costs more than not having it. It also flagged `-0.0 DPM` against `0.0 DPM`,
   * which is the same number.
   *
   * So: relative, with a floor at the DISPLAYED precision. The band has to sit above lag
   * (0.18 %) and below the spec's own worked example — core exit 618 °F indicated against
   * 623 °F true, which is 0.8 % and must flag. 0.5 % is the middle of that gap, and the
   * floor ("more than one unit in the last digit you can see") means a reading can never be
   * flagged for a difference the player could not have seen on the board.
   *
   * Rows whose true side is curated physics prose are EXEMPT: "3.12 % · 9.4 MWt" against
   * "3 %" is a different rendering, not a different value.
   */
  var IND_DIV_REL = 0.005;                 // 0.5 % — see the measurements above
  function indNum(str) {
    if (str == null) return null;
    var m = String(str).replace(/,/g, '').match(/-?\d+(\.\d+)?(e[-+]?\d+)?/i);
    return m ? parseFloat(m[0]) : null;
  }
  /* The RAW pair behind a row: the number the instrument publishes and the number the
   * plant has. Compared instead of the rendered text, because the rendered text is where
   * this went wrong the first time: the PORV row displays `shut` against the curated prose
   * `OPEN · STUCK` — the spec's own headline example of a divergence — and a rule that
   * exempted every row with curated prose flagged nothing on it. Prose is for READING; the
   * comparison belongs on the values.
   *
   * AVERAGED OVER A SHORT WINDOW, NOT SAMPLED (#449). An instantaneous comparison flags a
   * noisy channel for ever. Measured over 300 s at hot full power: charging flow indicates
   * 30.45 ± 1.81 gpm against a true 30.64 ± 0.13 — a MEAN gap of 0.6 %, but individual
   * samples land 7 gpm out, which is 23 % and four times the threshold. Both charging and
   * letdown were flagged permanently on a healthy plant for exactly that reason.
   *
   * The window comes from `chartBuf`, which already carries both sides per sample, so this
   * reconstructs nothing: rebuilding the engine's signal-tapered noise model in the UI to
   * derive a per-channel sigma would be a second copy of a truth that already exists, which
   * is the shape #432 was. "Is it still off?" is also what an operator asks. */
  /* HOW FAR APART IS "FURTHER APART THAN THIS GAUGE WANDERS"? (#449.)
   *
   * A fixed relative band cannot answer that, and the first two attempts both failed on the
   * same channel. Measured, 300 s at hot full power, full stack:
   *
   *     charging flow   indicated 30.45 ± 1.81 gpm   true 30.64 ± 0.13   mean gap 0.6 %
   *
   * The MEAN gap is 0.6 % — the instrument is fine — but single samples land 7 gpm out,
   * which is 23 % and four times a 0.5 % threshold, so charging and letdown were flagged
   * permanently on a healthy plant. Averaging over 6 s did not help either: the noise is an
   * OU process with `noise_tau` = 8 s, so a window shorter than its own correlation time
   * averages almost nothing.
   *
   * Reading the declared sigma out of the config was the next idea and is worse: it comes to
   * 0.58 gpm against a measured 1.81, so the UI would encode a number that disagrees with
   * the instrument it describes — a second, wrong copy of a truth the data already carries.
   *
   * So the spread is MEASURED FROM THE DATA. `sd(indicated − true)` over the window IS the
   * channel's noise, because the true side is smooth; it self-calibrates to whatever the
   * instrument actually does, needs no config, and stays right if the noise model is ever
   * retuned. A row is diverged when the mean gap exceeds twice that spread — which is the
   * question an operator asks: "is it further off than this gauge normally wanders?"
   *
   * A STUCK instrument still flags fast: its reading stops moving while the plant does not,
   * so the gap grows while the spread does not. A saturated one (the intermediate range at
   * power, pegged at its 2e-3 A over-range ceiling) has sd = 0 and flags on any gap at all,
   * which is correct — it IS disagreeing, prototypically, and the row saying so is the
   * lesson. And a STATUS channel never reaches this code: a word against a word is compared
   * directly, so the PORV reading `shut` over an open valve flags on the instant.
   */
  var IND_AVG_SEC = 60;                  // 7.5 x the 8 s noise correlation time
  var IND_SPREAD_K = 2;                  // gap must exceed this many spreads
  function seriesRawPair(r, snap) {
    var s = r.ser, i = null, t = null;
    try { if (s.get && snap.instruments) i = s.get(snap.instruments); } catch (e) { /* not on this plant */ }
    try { if (s.tru && snap.true_state) t = s.tru(snap.true_state); } catch (e) { /* not on this plant */ }
    if (!(typeof i === 'number' && typeof t === 'number' && isFinite(i) && isFinite(t))) return null;
    var col = RD.ChartCols ? RD.ChartCols[s.id] : null;
    if (col != null && chartBuf.length > 4) {
      var t1 = chartBuf[chartBuf.length - 1].t, si = 0, st = 0, n = 0, d = [];
      for (var k = chartBuf.length - 1; k >= 0 && chartBuf[k].t >= t1 - IND_AVG_SEC; k--) {
        var row = chartBuf[k];
        var a = row.v ? row.v[col] : NaN, b = row.tv ? row.tv[col] : NaN;
        if (!isFinite(a) || !isFinite(b)) continue;
        si += a; st += b; d.push(a - b); n++;
      }
      if (n >= 5) {
        var md = d.reduce(function (x, y) { return x + y; }, 0) / n;
        var sd = Math.sqrt(d.reduce(function (x, y) { return x + (y - md) * (y - md); }, 0) / n);
        return { i: si / n, t: st / n, sd: sd, n: n };
      }
    }
    return { i: i, t: t, sd: 0, n: 1 };
  }
  function indLastDigit(str) {
    var s = String(str);
    var dec = s.match(/\.(\d+)/);
    var step = dec ? Math.pow(10, -dec[1].length) : 1;
    var exp = s.match(/e([-+]?\d+)/i);
    return exp ? step * Math.pow(10, parseInt(exp[1], 10)) : step;
  }
  function indDiverged(r, snap, shownInd) {
    var raw = seriesRawPair(r, snap);
    if (!raw) return false;                    // nothing to compare: not a paired row
    var d = Math.abs(raw.i - raw.t);
    if (d === 0) return false;
    // A STATUS channel is a 0/1 word, and there is no "close" for it — a light reading SHUT
    // over an open valve is the whole PORV lesson, so any difference is the divergence.
    // Detected by the RENDERING rather than by a flag on the series: `fmt` returning a word
    // instead of a number IS the definition of a status row here.
    if (indNum(shownInd) == null) return true;
    if (d <= indLastDigit(shownInd)) return false;       // invisible at the shown precision
    // Further apart than this gauge wanders — see seriesRawPair for the measurements.
    if (raw.sd > 0) return d > IND_SPREAD_K * raw.sd;
    // No history yet (or a dead-steady channel): fall back to the relative band.
    return d > IND_DIV_REL * Math.max(Math.abs(raw.i), Math.abs(raw.t));
  }
  function renderIndications(s) {
    if (!indRows.length || !paneVisible('indications')) return;
    var showTrue = indTruth();
    indRows.forEach(function (r) {
      var txt = seriesLive(r.ser, s);
      var missing = (txt == null || txt === '—' || /NaN|Infinity/.test(txt));
      var shown = missing ? '—' : txt;
      if (r.el.textContent !== shown) r.el.textContent = shown;
      if (!showTrue) return;                       // HR1: nothing about truth is computed
      var tv = seriesTrue(r, s);
      var tshown = (tv == null || /NaN|Infinity/.test(tv)) ? '—' : tv;
      if (r.tel.textContent !== tshown) r.tel.textContent = tshown;
      var div = missing ? false : indDiverged(r, s, txt);
      if (r.line.classList.contains('diverged') !== div) r.line.classList.toggle('diverged', div);
    });
  }
  // ---- filter chips + the HR1 truth switch ---------------------------------------
  function applyIndFilter() {
    var box = $('indicationsList'); if (!box) return;
    box.setAttribute('data-filter', ui.indFilter || 'all');
    document.querySelectorAll('#indFilters [data-indfilter]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-indfilter') === (ui.indFilter || 'all'));
    });
  }
  /* Truth OFF by default in mission and campaign modes (HR1, spec §3). Free play is where
   * the debug view belongs: exploring is when "what is it really doing?" is the question.
   * Inside instructed content the whole point is that the operator is genuinely fooled, so
   * a truth column beside every instrument would hand back the answer the lesson is asking
   * for — and it would do it silently, which is worse than not having the feature. */
  function indTruthDefault() { return !(ui.scenario || ui.follow); }
  function indTruth() { return ui.indTruth == null ? indTruthDefault() : ui.indTruth; }
  /* The "True values: shown" BUTTON was removed 2026-08-11 (owner, quoted in shell.html).
   *
   * What went is the manual override, NOT the HR1 rule underneath it: indTruthDefault()
   * still hides the physics column inside a scenario or a walkthrough, because handing the
   * operator the answer is the one thing instructed content cannot do. In free play — where
   * "what is it really doing?" is the whole question — both columns are simply always on,
   * which is what the headed layout is for. The column header follows the same switch, so a
   * mission shows a two-column list with two headings rather than an empty third track. */
  function applyTruthMode() {
    var box = $('indicationsList'); if (box) box.classList.toggle('show-true', indTruth());
    var h = $('indColHead'); if (h) h.classList.toggle('show-true', indTruth());
  }
  // One row's live reading, in the same words the chart chip uses — `fmt` is the series' own
  // formatter, so a value can never disagree with its trace. Reads the side the row IS: the
  // channel for an instrument, the demand for a commanded position, truth only when the
  // series has nothing else (the RBMK/BWR list-everything case).
  function seriesLive(s, snap) {
    try {
      if (s.get && snap.instruments) return s.fmt(s.get(snap.instruments));
      if (s.ctl && snap.control_state) return s.fmt(s.ctl(snap.control_state));
      if (s.tru && snap.true_state) return s.fmt(s.tru(snap.true_state));
    } catch (e) { /* a channel this plant does not publish */ }
    return null;
  }
  // ------------------------------------------------- physics tab (MERGED, #439)
  // The Physics tab is gone; its rows render as the TRUE column of the merged list
  // (buildIndications above). The DATA is untouched — PROFILES[plant].physics keeps its
  // 46 curated rows, their authored v() prose and their scanner copy, and run_inspect
  // still parses the same block between the same marker comments. What is retired is the
  // second pane that showed them, and physRows with it.
  //
  // The three builders stay as no-ops rather than chasing down their call sites, exactly
  // as the Automate tab's did.
  function buildPhysics() {}

  // Is a Tools-block tab actually on screen? Generalised from physicsVisible() on
  // 2026-08-06 so renderAutomate can use the same test — a pane that is behind another
  // tab, or inside a collapsed card, is DOM nobody can see, and writing to it every
  // broadcast is pure cost. Matters most at the 20 Hz transient cadence, which is
  // exactly when the frame budget is tight.
  /* Visible == this pane is the selected tab. The `toolsCard.collapsed` half of this test
   * went with the accordion on 2026-08-11 (the Instructor became a tab): there is one strip
   * and one visible pane, so a pane cannot be both selected and hidden. */
  function paneVisible(name) {
    var pane = document.querySelector('.tabpane[data-pane="' + name + '"]');
    return !!(pane && pane.classList.contains('on'));
  }
  function physicsVisible() { return paneVisible('indications'); }   // the merged pane (#439)
  /* The performance readout, throttled to 1 Hz and only while the tab is open. It reads
   * ring buffers that are always filling, so the numbers are live whether or not anyone is
   * looking — but computing percentiles on every frame would put the profiler into its own
   * measurement, which is the one thing it must not do. */
  var _perfPaintedAt = 0;
  function renderPerf() {
    var box = $('perfRows'); if (!box || !RD.Perf) return;
    var now = Date.now();
    if (now - _perfPaintedAt < 1000) return;
    _perfPaintedAt = now;

    var p = RD.Perf.summary();
    var ms = function (st) { return st ? st.p50.toFixed(1) + ' / ' + st.p95.toFixed(1) + ' / ' + st.max.toFixed(1) : '—'; };
    var rows = [
      ['Physics', ms(p.step_ms) + ' ms', 'one broadcast of engine stepping (median / p95 / worst)'],
      ['Rendering', ms(p.render_ms) + ' ms', 'one DOM pass (median / p95 / worst)'],
      ['Budget used', p.budget_pct === null ? '—' : Math.round(p.budget_pct) + ' %', 'of the ' + p.nominal_ms + ' ms broadcast interval'],
      ['Broadcast gap', ms(p.interval_ms) + ' ms', 'actual spacing; well over nominal means the loop is slipping'],
      ['Frames', (p.fps === null ? '—' : p.fps.toFixed(0) + ' fps'), p.paints + ' painted, ' + p.coalesced + ' broadcasts merged into another frame'],
    ];
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      html += '<div class="set-row"><span class="k" title="' + rows[i][2] + '">' + rows[i][0] +
        '</span><span class="mono">' + rows[i][1] + '</span></div>';
    }
    box.innerHTML = html;
    var v = $('perfVerdict');
    if (v) {
      txt(v, p.verdict);
      v.className = 'perf-verdict' +
        (/COMPUTE-BOUND/.test(p.verdict) ? ' warn' :
         /RENDER-BOUND|SLIPPING|DROPPED/.test(p.verdict) ? ' bad' :
         /healthy/.test(p.verdict) ? ' ok' : '');
    }
  }

  // renderPhysics is now the PERF READOUT only — the plant rows it used to paint are the
  // merged list's true column (#439). Kept as an entry point because renderPerf has to run
  // on the same cadence and from the same three call sites it always did.
  function renderPhysics() { if (paneVisible('indications')) renderPerf(); }

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

  /* DRAIN THE FINE SUB-SAMPLES — and split them THREE ways.
   *
   * `takeFine()` CLEARS the service's buffer and has exactly ONE caller, which is this
   * function. Do not add a second: whoever calls it again gets the rows and the strip chart
   * silently loses them, and nothing would go red.
   *
   * IT RUNS SYNCHRONOUSLY WITH THE BROADCAST, not inside the rAF paint, and that is
   * load-bearing (#432). It used to sit at the top of renderNow, one animation frame later
   * than the broadcast that produced the rows — which is fine for the chart, whose rows carry
   * their own timestamps and are simply drawn late. It is NOT fine for the recorder, which is
   * a separate subscriber running in the same synchronous pass: it saw broadcast N's fine rows
   * during broadcast N+1, i.e. AFTER it had already recorded a sample at N's later timestamp,
   * so every one of them was older than the grid position and none could emit. Measured
   * before the move: `diagTick` received 1475 fine rows and the bundle came out with 35
   * samples, all from the broadcast fallback. Rows in, nothing recorded — the exact shape of
   * the bug being fixed, one layer up.
   *
   * The three consumers have different lifetimes, which is why this is a split and not a
   * shared variable. The strip chart may skip a frame (its own sample-grid gate) and must KEEP
   * the rows until it draws, so they accumulate in `pendingFine`. The board's vital tiles are
   * driven from a snapshot they cannot reach `service` from, so they get it through an RD side
   * channel — the house pattern for cross-file reach (RD.PWR_CONTROL, RD.PwrBoardInspect) —
   * and it accumulates in `pendingTiles` until a paint actually happens, since a coalesced
   * broadcast would otherwise overwrite a batch no frame had shown yet. The recorder consumes
   * and clears its own share on its own tick.
   */
  function drainFine() {
    var f = (service && service.takeFine) ? service.takeFine() : null;
    if (!f || !f.length) return;
    pendingFine = pendingFine ? pendingFine.concat(f) : f;
    pendingTiles = pendingTiles ? pendingTiles.concat(f) : f.slice();
    pendingDiagFine = pendingDiagFine ? pendingDiagFine.concat(f) : f.slice();
  }
  function render(s) {
    latest = s;
    _renderSnap = s;
    /* THE SNAPSHOT'S `running` FLAG IS STAMPED AT ASSEMBLY AND CAN BE STALE BY THE TIME IT
     * IS DRAWN. Re-stamp it from the live service here, which is the one place every
     * renderer downstream reads it from.
     *
     * Without this the board un-freezes itself: syncPlayBtn pushes setRunning(false) the
     * instant the player pauses, and then any re-render of a snapshot ASSEMBLED WHILE
     * RUNNING — a tab switch, a pane reveal, a queued broadcast still in flight — calls
     * setRunning(true) again off `metadata.running` and the animations resume behind a
     * paused clock. Measured: `.bd-frozen` present 200 ms after the pause and absent a
     * second later, with 105 board animations running. The push was right and a stale
     * snapshot was overwriting it. */
    if (s && s.metadata && service) s.metadata.running = !!service.running;
    drainFine();
    // Perf sampling (ui/perf.js). The service measured its own physics loop and left it on
    // the instance; pair it here with the render cost so the two stages can be told apart —
    // which is the only way to answer "is the flicker compute or something else".
    if (RD.Perf) {
      try {
        RD.Perf.broadcast(service._perfStepMs,
          (s.metadata && s.metadata.broadcast_ms) || service.broadcastMs);
      } catch (e) { /* a profiler must never break the sim */ }
    }
    if (_renderRaf) {
      // A paint is already queued and will use the newer snapshot — so this broadcast
      // never gets a frame of its own. Worth counting: it means the screen is showing
      // fewer plant states than the plant produced, which is what "flicker" often is.
      if (RD.Perf) { try { RD.Perf.dropped(); } catch (e) {} }
      return;
    }
    _renderRaf = _raf(function () {
      _renderRaf = 0;
      var snap = _renderSnap; _renderSnap = null;
      if (!snap) return;
      if (!RD.Perf) { renderNow(snap); return; }
      var t0 = RD.Perf.renderStart();
      try { renderNow(snap); } finally { RD.Perf.renderEnd(t0); }
    });
  }
  function renderNow(s) {
    // `rawIns` used to mean "captured BEFORE display damping". There is no damping
    // any more (#217), so it is simply the instruments — kept as a named local
    // because the chart paths below read it a few times (#158).
    var rawIns = s.instruments;
    txt($('clock'), 'T+' + hms(s.metadata.sim_time));
    $('clock').classList.toggle('running', s.metadata.running);
    $('clock').classList.toggle('accel', s.metadata.time_acceleration > 1);

    // Cross-plant transition guard: when a scenario switches the plant (e.g.
    // a ?scenario= deep link), the new plant's first snapshots can land while
    // ui.plant / the gauge-chart profile still describe the old one — every
    // profile-bound reader would throw on the foreign instrument set. Catch
    // up the UI instead of rendering the mismatch.
    var snapPlant = s.metadata.plant_id;
    if (snapPlant && ui.plant && snapPlant !== ui.plant) {
      // An old plant's sub-samples must not reach a new one — and since #432 that means all
      // three shares, not just the tiles'. The recorder's row is packed over the OLD plant's
      // field list, so a leaked row would write one plant's numbers into another's columns.
      RD.ChartFine = null; pendingTiles = null; pendingDiagFine = null;
      afterPlantChange(); return;
    }

    // The fine sub-samples were drained in `render`, synchronously with the broadcast — see
    // drainFine(). The board's vital tiles read this frame's share here.
    RD.ChartFine = pendingTiles;
    pendingTiles = null;

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
    renderIndications(s);   // both panes no-op unless they are actually on screen
    // The chart-settings window's live values (#454). Same no-op-unless-visible rule, and
    // the same reason it is here rather than on a timer: it must move when the plant moves.
    // The window pauses the plant, so in practice it shows the reading the plant was at
    // when it opened — which IS the current value, and the point of pausing.
    renderChartSettings(s);
    // INSIDE the rAF, not as their own subscribers (2026-08-06). The rationale above says
    // a DOM write off the paint cycle "let the compositor present a frame mid-rebuild on
    // real GPUs ... dispersing and reappearing ... while software-rendered headless looked
    // fine" — which is exactly the blank/blink the owner reports, and exactly why no
    // headless probe in this repo could reproduce it. Only `render` was ever wrapped;
    // these two kept writing straight from the broadcast's setTimeout.
    renderAutomate(s);
    inspectLiveTick(s);
    // diagTick's ACCUMULATION stays a synchronous subscriber — it diffs alarm states and
    // must not miss a broadcast. Only its readout belongs in the paint cycle.
    diagReadout();
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
    //   · this gate — one row per CHART_SAMPLE_SEC of SIM time rather than one per
    //     broadcast. It is keyed on sim time, not on a broadcast COUNT, so it is invariant
    //     under timeAcceleration and under the 100→50 ms transient cadence: at any
    //     acceleration where the sim advances more than one interval per broadcast nothing
    //     is dropped at all.
    //
    //     RATE 0.5 → 0.2 s ON 2026-08-05 *(OWNER: "the current polling rate is too slow")*,
    //     so the cap is 9000 rows rather than 3600 and the trace advances 5× a second
    //     instead of twice. COST, and it is an EXTRAPOLATION rather than a fresh
    //     measurement — say so rather than implying otherwise: the recorded figure below is
    //     8.8 MB for 3600 rows at 51 series, which is linear in rows, so 9000 rows is about
    //     **22 MB**. That is well under the 75.8 MB this decimation was introduced to avoid,
    //     but it is three times the previous budget. I could not reproduce the 51-series
    //     worst case headlessly (the series toggles are not addressable from outside the
    //     board), so if the buffer is ever suspected again, measure it there before assuming
    //     this line is still true.
    //   · chartSample only writing the sides a series actually HAS (see there).
    // Re-measured after both: **8.8 MB** for 51 series — LESS than the 10.2 MB the old
    // 16-series buffer cost, with three times the quantities. The resolution cost is nil
    // in practice: the widest window is 1800 s across ~400 px of plot, so 2 Hz is still
    // ~9x oversampled, and the preseed writes at 5 s intervals either way.
    // SAMPLE TIMES ARE QUANTISED TO THE GRID, not taken as whatever sim_time happened to
    // cross the gate (2026-08-05). The old form stamped the row with the raw `sim_time` of
    // the first broadcast past the interval, so spacing was irregular — at 1x the broadcast
    // is 0.1 s of sim time, but the transient cadence is 0.05 s and any acceleration makes
    // the step arbitrary — and `t1` (hence the whole x-axis, `t0 = t1 - window`) advanced by
    // a DIFFERENT amount each time. That is the second half of the owner's report: "the
    // polling shifted with time so it shows different polled times of the line each polling
    // time." On the grid, t1 advances in exact CHART_SAMPLE_SEC steps and the window scrolls
    // evenly.
    var gridT = Math.floor(s.metadata.sim_time / CHART_SAMPLE_SEC) * CHART_SAMPLE_SEC;
    var lastT = chartBuf.length ? chartBuf[chartBuf.length - 1].t : null;
    if (lastT != null && gridT - lastT < CHART_SAMPLE_SEC - 1e-9) { drawChart(); return; }
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
      for (var pt = gridT - CHART_RECORD_SEC; pt < gridT; pt += 5) {
        chartBuf.push({ t: pt, v: sv, tv: stv });
      }
      ensurePreseed(s.metadata.sim_time);
    }
    // FINE SUB-SAMPLES FIRST, then the broadcast instant. The service samples the plant on a
    // fixed SIM-time interval inside its step loop (see setFineSampler there), so the chart's
    // resolution stops depending on time acceleration: at 60× a broadcast carries 6 s of sim
    // and hands over ~30 samples instead of the single one it used to. Each carries its own
    // sim time and is quantised onto the same grid as the broadcast row, so they interleave
    // with the existing history rather than forming a second series.
    //
    // Guarded against going backwards: a rewind or a reset clears the service's buffer, but a
    // sample that predates the newest row would still splice the plant onto the wrong time.
    var fine = pendingFine; pendingFine = null;
    if (fine) {
      for (var fi = 0; fi < fine.length; fi++) {
        var fg = Math.floor(fine[fi].t / CHART_SAMPLE_SEC) * CHART_SAMPLE_SEC;
        var fLast = chartBuf.length ? chartBuf[chartBuf.length - 1].t : null;
        if (fLast != null && fg - fLast < CHART_SAMPLE_SEC - 1e-9) continue;
        if (fg >= gridT) continue;                       // the broadcast row below owns that instant
        var fr = fine[fi];
        // lo/hi are the EXTREMES over the sub-interval the service folded, so a transient
        // between fine samples still leaves a mark (see CHART_SUB_MAX there). Carried onto
        // the row; drawChart bands them.
        chartBuf.push({ t: fg, v: fr.v, tv: fr.tv, lo: fr.lo, hi: fr.hi, tlo: fr.tlo, thi: fr.thi });
      }
    }
    chartBuf.push({ t: gridT, v: sv, tv: stv });
    var cutoff = gridT - CHART_RECORD_SEC;   // retain the widest window on offer at this speed
    while (chartBuf.length > 2 && chartBuf[0].t < cutoff) chartBuf.shift();
    // THIN THE OLD HALF rather than shortening the memory. Retention has to cover the widest
    // window the current speed offers — 27 days of sim at 3600× — and at 0.2 s that is
    // millions of rows. Recent history stays at full resolution and the older half is halved
    // whenever the budget is exceeded, which is what a strip chart's paper does anyway: the
    // part you are reading is fine, the part scrolling away is coarse. Cost is bounded at
    // CHART_ROW_BUDGET rows at ANY acceleration or window.
    while (chartBuf.length > CHART_ROW_BUDGET) {
      var keep = [], half = chartBuf.length >> 1;
      for (var ti = 0; ti < chartBuf.length; ti++) {
        if (ti >= half || (ti & 1) === 0) keep.push(chartBuf[ti]);
      }
      if (keep.length === chartBuf.length) break;   // cannot thin further — bail rather than spin
      chartBuf = keep;
    }
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
  // A SIDE THAT DOES NOT EXIST IS NaN, not an absent key — that is what the packing changed.
  // In the id-keyed shape, leaving a key out was the saving (a stored `null` cost exactly as
  // much as a real number); in a fixed-width row every column exists and NaN is the "no
  // sample" marker. Every reader already rejects it, because they all guard on `isFinite`
  // rather than on `!= null`. A `ctl` series lands in `v` alone — a demanded valve position
  // has no instrument-vs-truth split to preserve, and `seriesTruth` returns false for it
  // because it declares no `tru`.
  function chartSample(rawIns, trueState, ctlState) {
    // RAW instruments — no display smoothing on the chart. This used to clone the dict per
    // sample to graft `xenon_pct_eq` in, which was propping up a `get` on a series that has
    // no instrument; the series dropped its `get` (see there) and `seriesTruth` already
    // traces truth in both modes for any channel-less series, so the clone is gone with it —
    // one fewer object allocation in the sampler, which runs up to 240 times a broadcast.
    var chartIns = rawIns;
    var v = new Float64Array(serCols), tv = new Float64Array(serCols);
    v.fill(NaN); tv.fill(NaN);
    prof().series.forEach(function (ser, i) {
      if (ser.ctl) {
        if (ctlState) { try { var c = ser.ctl(ctlState); if (c != null) v[i] = c; } catch (e0) { /* NaN */ } }
        return;
      }
      if (ser.get) { try { var a = ser.get(chartIns); if (a != null) v[i] = a; } catch (e) { /* NaN */ } }
      if (ser.tru && trueState) { try { var b = ser.tru(trueState); if (b != null) tv[i] = b; } catch (e2) { /* NaN */ } }
    });
    // THIRD SIDE: the bug-report recorder's fields, in RAW true-state units (#432). It cannot
    // read `tv` instead — two series here scale for DISPLAY (`steam_flow`/`fw_flow` are
    // `* 100`), so riding those columns would silently change the bundle's units and make an
    // old report and a new one disagree by 100× on the same quantity. Ten doubles beside two
    // 96-wide arrays; the cost in this function is the call, not the packing.
    return { v: v, tv: tv, dv: RD.DiagRecorder.pack(ui.plant, trueState) };
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

  // Held between frames, per gauge: the LATCHED band, so a reading parked on a setpoint
  // cannot toggle the class at the broadcast rate. `.gauge.alarm .g-value` carries a
  // `gauge-alarm-flash` animation and `.warn`/`.alarm` swap the bar colour, so a class
  // that flips 20x a second in a transient reads as an irregular strobe on the vital
  // strip — the owner's 2026-08-06 report, of which this is one contributor.
  //
  // Same latch-with-release-deadband the strip chart already uses (`seriesAlarmed`, below):
  // once in a band you stay in it until the reading comes 5 % of full scale back OUT.
  // Entry thresholds are untouched, so nothing annunciates later than it did.
  var gaugeBand = {};
  function gaugeState(g, raw) {
    var full = Math.abs((g.max != null ? g.max : 1) - (g.min != null ? g.min : 0)) || 1;
    var dead = full * 0.05;
    var was = gaugeBand[g.id] || 'normal';
    function hit(hi, lo, band) {
      // widen by the deadband only for the band we are ALREADY in — that is what makes
      // it a release hysteresis rather than a lowered setpoint
      var slack = (was === band) ? dead : 0;
      if (hi != null && raw >= hi - slack) return true;
      if (lo != null && raw <= lo + slack) return true;
      return false;
    }
    var st = hit(g.danger, g.danger_lo, 'alarm') ? 'alarm'
           : hit(g.caution, g.caution_lo, 'warn') ? 'warn'
           : 'normal';
    gaugeBand[g.id] = st;
    return st;
  }
  function renderGauges(s) {
    prof().gauges.forEach(function (g) {
      var root = $('gauge-' + g.id); if (!root) return;
      var raw;
      // A cross-plant transition (e.g. a ?scenario= deep link that switches
      // the plant) can deliver one snapshot from the NEW plant to the OLD
      // profile's gauges — read defensively or the whole render pass dies.
      try { raw = g.raw(s); } catch (e) { raw = null; }
      if (raw == null || isNaN(raw)) { txt(root.querySelector('[data-val]'), '—'); return; }
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
      setHTML(root.querySelector('[data-val]'), disp.toFixed(g.dp) + '<span class="g-units"> ' + units + '</span>');
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
        // textContent replaces the text node even when the glyph is identical, and the
        // trend only changes when the arrow flips — measured 875 replacements in 10 s.
        txt(tr, t1 > 0 ? '▲' : t1 < 0 ? '▼' : '▶');
        var trCls = 'g-trend ' + (t1 > 0 ? 'trend-up' : t1 < 0 ? 'trend-down' : 'trend-flat');
        if (tr.className !== trCls) tr.className = trCls;
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
  // Last rendered tile set, as a key. The stack is a wholesale `innerHTML` rebuild, and
  // rebuilding it on an UNCHANGED alarm list is what produced the transient flicker the
  // owner reported (2026-08-06): `.alarm-tile.unack.crit` carries a 0.9 s
  // `alarmCritFlash` animation, and destroying the element restarts that animation from
  // t=0. At the 20 Hz transient broadcast cadence the flash never advanced past its first
  // step — it strobed. Two more things rode on the same line: `.alarm-stack` has
  // `overflow:auto`, so `innerHTML =` reset `scrollTop` 20 times a second and the list
  // could not be scrolled during a flood; and a `click` only fires on the nearest common
  // ancestor of its mousedown and mouseup, so any ACK press that straddled a rebuild
  // resolved to `#alarmStack` — which carries no `[data-ack]` — and was silently DROPPED.
  // That last one is the "delay when clicking controls" half of the report, and it was a
  // LOST input rather than a slow one.
  // Same idiom as renderChecklist and updateSimSummary.
  var lastAlarmKey = null;
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
    txt(title, nUnack ? 'Alarms (' + nUnack + ')' : 'Alarms');

    // Everything below this line is DOM the tile markup depends on, so the key has to
    // carry all of it: order, state, both priorities, the annunciation stamp, and the
    // first-out trip reason (the one alarm whose LABEL changes without its id changing).
    // Anything rendered but not keyed would freeze on screen — which is the failure mode
    // a dirty-check trades for the flicker, so it is the thing to get right.
    var tripCause = tripCauseLabel(s.rps_state && s.rps_state.last_trip_reason) || '';
    var key = active.length ? (tripCause + '\u0002' + active.map(function (a) {
      return a.id + '\u0001' + a.state + '\u0001' + a.priority + '\u0001' +
        (a.base_priority || '') + '\u0001' + (alarmSeen[a.id] || 0);
    }).join('\u0002')) : '';
    if (key === lastAlarmKey) return;
    lastAlarmKey = key;

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
    syncChartWindows(v);
  }

  // Re-label the strip-chart window buttons for the current speed, and keep the SAME RUNG
  // selected rather than the same number of seconds — the player picked "the short one", not
  // "60 seconds", and at 3600× sixty seconds of plant is a sixtieth of a second of watching.
  // Retention follows the widest rung so switching to it never shows an empty axis.
  var lastWinSpeed = null;
  function syncChartWindows(spd) {
    var seg = $('graphWindow');
    if (!seg) return;
    var wins = chartWindowsFor(spd);
    var btns = seg.querySelectorAll('[data-win]');
    if (btns.length !== wins.length) return;
    var rung = 0;
    for (var i = 0; i < btns.length; i++) if (btns[i].classList.contains('on')) rung = i;
    for (var j = 0; j < btns.length; j++) {
      btns[j].setAttribute('data-win', wins[j]);
      btns[j].textContent = chartWinLabel(wins[j]);
    }
    CHART_RECORD_SEC = wins[wins.length - 1];
    if (lastWinSpeed !== spd) {
      lastWinSpeed = spd;
      ui.window = wins[rung];
      chartRange = {};
      drawChart();
    }
  }
  function chartWinLabel(sec) {
    if (sec < 3600) return Math.round(sec / 60) + 'm';
    if (sec < 86400) { var h = sec / 3600; return (h < 10 ? h.toFixed(h % 1 ? 1 : 0) : Math.round(h)) + 'h'; }
    return Math.round(sec / 86400) + 'd';
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
    /* F11 IS THE FIRST LINE *(OWNER DIRECTIVE, 2026-08-11: "I would like the helpful hints
     * list that shows in the instructor during free play to mention F11 makes the screen
     * fullscreen and it plays better that way.")*. It goes first because it changes how
     * everything else on this list is read: the board is the one panel that grows with the
     * window, so the hint is worth most before the player has arranged anything. */
    '<li><b>F11</b> goes fullscreen — the plant diagram gets the extra room, and it plays better that way.</li>' +
    '<li><b>Play</b> starts the clock (the ▶ button flashes whenever the plant is stopped).</li>' +
    '<li><b>System Scanner</b> (the line under the board) — hover anything for what it is.</li>' +
    '<li><b>Checklists</b> (second tab above) — interactive procedures that check themselves off the instruments.</li>' +
    '<li><b>Manual</b> — full operator reference and written procedures.</li>' +
    '<li><b>Plant &amp; Mission</b> (the bar under the clock) — starting condition, courses and reset.</li>' +
    '</ol>' +
    '<p class="instr-idle-more">More help: <button type="button" class="btn linkish" data-open-help="1">Help</button> · ' +
    '<button type="button" class="btn linkish" data-open-tour="1">Quick tour</button> · ' +
    'advanced failures under <b>Inject Failure</b>.</p>' +
    '</div>';
  /* IN FREE PLAY THE INSTRUCTOR HOSTS THE CHECKLIST LAUNCHER (#443, spec §9).
   *
   * It is the default open panel and it had nothing to say when no module is running, so it
   * showed static quick-tour text — help copy occupying the most valuable real estate in the
   * shell. Giving it a real job solves checklist discoverability without adding a surface,
   * and it matches the stated priority: the manual serves users who want depth, the average
   * user wants a checklist to follow. */
  function idleLauncherHtml() {
    if (!flagOn('checklists')) return '';
    var ranked = rankedProcedures().filter(function (r) { return r.score >= 100; }).slice(0, 4);
    if (!ranked.length) return '';
    return '<div class="instr-launch"><div class="instr-launch-t">Pick a procedure to follow</div>' +
      ranked.map(function (r) {
        return '<button class="btn" data-ckl-start="' + mesc(r.id) + '">' +
               '<span class="ckl-cat">' + mesc(r.category || '') + '</span>' + mesc(r.title) + '</button>';
      }).join('') +
      '<div class="instr-launch-more"><button type="button" class="btn linkish" data-open-ckl="1">All checklists…</button></div></div>';
  }
  function showIdleInstructor() {
    setInstrRole('Instructor');
    var cur = $('instrCurrent');
    if (!cur) return;
    cur.classList.add('instr-standby');
    cur.innerHTML = (idleLauncherHtml() + IDLE_INSTR_HTML);
  }
  /* WRAPPED, NOT APPENDED TO. renderInstructor dispatches to renderFollow / renderChat /
   * renderChecklist / renderLevelComplete and RETURNS from each — five early returns — so
   * a call placed at the end of its body runs only on the idle path. Measured: walkthrough
   * step text advancing correctly ("Set up the heat sink..." -> "Set the 1/M baseline..."
   * -> "First burst: withdraw...") with the transcript frozen at 0 messages the whole way,
   * because the fold-in was on the one branch that never fires during a walkthrough. */
  function renderInstructor(s) {
    renderInstructorInner(s);
    instrLogTick(s);
  }
  function renderInstructorInner(s) {
    // Rewind is live whenever a checkpoint exists (beats / follow steps / sandbox).
    var noCp = !(service && service.checkpoints && service.checkpoints.length);
    document.querySelectorAll('[data-fnav="rewind"]').forEach(function (rw) { rw.disabled = noCp; });
    var crw = $('chartRewindBtn');
    if (crw) crw.disabled = noCp;
    syncSpeedUI(s);
    renderHighlight(s);
    updateSimSummary();   // status line follows scenario/walkthrough transitions (change-guarded)
    instrGateOpen(s);     // a step that blocks progress opens the card, once per beat (#439)
    // Follow state is derived FROM the snapshot (the Instructor owns it); ui.follow
    // is just a synced mirror. This survives start_follow's internal plant reset,
    // save/load restores, and anything else that broadcasts mid-transition.
    // Checklist picker row: free play only — anything instructed owns the card.
    /* THE TAB ALWAYS SHOWS THE LIST *(OWNER DIRECTIVE, 2026-08-11: "The checklist tab
     * should always show the list of checklists... Currently when a checklist is running
     * this tab is empty.")*. It used to hide the whole picker whenever the Instructor was
     * busy — which is exactly when a player most wants to see what else there is, or to
     * switch. Nothing about showing the list starts anything; picking one does, and that
     * was always allowed. */
    var cklRow = $('instrCklRow');
    if (cklRow) {
      cklRow.hidden = !flagOn('checklists');
      var running = !!(s.instructor && s.instructor.checklist);
      var cklNote = $('cklBusyNote');
      if (cklNote) {
        cklNote.hidden = !running;
        if (running) txt(cklNote, 'A checklist is running in the Instructor below. Pick another to switch.');
      }
      if (!cklRow.hidden) toggleCklMenu();      // keeps the list current; no-op when unchanged
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
    // Precondition verdicts join the render key (#392's lesson: a banner outside
    // the key never repaints). Observed values are keyed ROUNDED so the banner
    // tracks a dilution at ~whole-unit granularity instead of rebuilding the DOM
    // every broadcast on analog noise.
    var pcKey = (ck.preconditions || []).map(function (p) {
      return (p.met ? 'y' : 'n') + (p.met ? '' : Math.round(p.obs != null ? p.obs : -1));
    }).join(',');
    var key = [ck.procedure_id, (ck.steps_done || []).map(function (d) { return d ? 1 : 0; }).join(''),
      ck.step_index, ck.acc_met ? 1 : 0, ck.graded_by || '', ck.complete ? 1 : 0, pcKey, ui.register].join('|');
    if (key === cklState.key) return;
    var firstBuild = !cklState.key;
    cklState.key = key;
    card.classList.add('chat-mode');
    cur.classList.remove('instr-standby');
    var h = '<div class="ckl-log" id="cklLog">';
    h += '<div class="ckl-head"><b>' + mesc(pr.title) + '</b>' +
      '<div class="m-note">Auto-checklist — steps check themselves off the instruments while you operate.</div></div>';
    // Precondition banner (#395) — WARN, NEVER BLOCK: unmet rows are listed with
    // measured-vs-expected and everything below still runs. Row text comes from
    // the procedure artifact (`precond[i].text`); the snapshot ships verdicts only.
    var pc = ck.preconditions;
    if (pc && pr.precond && pc.some(function (p) { return !p.met; })) {
      h += '<div class="m-caution"><b>Prerequisites not met — nothing is blocked, but steps may not verify:</b>';
      for (var pj = 0; pj < pc.length && pj < pr.precond.length; pj++) {
        if (pc[pj].met) continue;
        var pd = pr.precond[pj];
        h += '<div>✗ ' + mesc(pd.text || pd.p) + ' <span class="muted">— wants ' + mesc(pd.p) + ' ' +
          (OPSYM[pd.op] || pd.op) + ' ' + mesc(pd.v) + ', reads ' + fmtPcObs(pc[pj].obs) +
          (pc[pj].graded_by === 'true_state' ? ' (true value)' : '') + '</span></div>';
      }
      h += '</div>';
    }
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
        // NO MANUAL TICK *(OWNER DIRECTIVE, 2026-08-11: "Checklists are supposed to be
        // automatically checked off by the sim when complete. Remove the user clickable
        // step complete button.")*. Every step now completes on evidence: an `acc`
        // predicate, a `saw` latch, the step's own command, or — for a pure observation
        // with none of those — a dwell, added in instructor_layer so omitting a predicate
        // can never soft-lock a procedure. The `checklist_check` COMMAND survives; only
        // its button is gone.
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
    // SPLIT, not take-the-column: the Checklists tab has to stay visible while a checklist
    // runs (owner, 2026-08-11), and setFocus('instructor') collapses the tools card. This
    // is the second of the two places that did it — startChecklist was the obvious one and
    // this render-path call is the one that put it back a frame later.
    if (firstBuild) applyFocus(true, true);
  }
  // Observed value for the precondition banner: whole units above 100 (ppm, °C
  // near operating point), one decimal below (fractions, small margins).
  function fmtPcObs(v) {
    if (v == null || isNaN(v)) return '—';
    return String(Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
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
  /* THE LAUNCHER, ORDERED BY RELEVANCE (#443, spec §9).
   *
   * SORT, DO NOT FILTER. Inapplicable procedures are demoted into a collapsed group and
   * LABELLED WITH THEIR GATING CONDITION — "Requires RCS temperature below 95" — which
   * turns the demotion into instruction: a beginner learns which mode gates which
   * evolution just by scanning. Hiding them would break the mental model, because a player
   * who saw a checklist yesterday and cannot find it today assumes a bug, and someone at
   * power may legitimately want to read ahead about an evolution they will do later.
   *
   * The scoring is `RD.InstructorLayer.prototype.rankProcedures`, NOT a copy here: the
   * preconditions it reads are already graded in that layer, instrument-first per HR1, and
   * a second evaluator in this file would be the two-samplers-of-one-truth shape #432 was.
   *
   * RECOMPUTED ON EVENTS, NOT CONTINUOUSLY (see cklRelevanceKey). During a heatup the plant
   * crosses mode boundaries; a live-recomputing sort would reshuffle the list under the
   * cursor at exactly the busiest moments.
   */
  function rankedProcedures() {
    var procs = ((RD.MANUAL_PROCEDURES || {})[ui.engineKey] || []).filter(function (x) {
      return !x.narrative && flagOn('procedure:' + x.id);
    });
    if (!procs.length || !latest || !RD.InstructorLayer) return procs.map(function (p) {
      return { id: p.id, category: p.category, title: p.title, score: 0, ready: true, gate: null };
    });
    var active = latest.instructor && latest.instructor.checklist
      ? latest.instructor.checklist.procedure_id : null;
    return RD.InstructorLayer.prototype.rankProcedures.call(
      { _grade: RD.InstructorLayer.prototype._grade, _predMet: RD.InstructorLayer.prototype._predMet },
      latest, procs, active);
  }
  /* The list is ALWAYS on screen in its tab (owner, 2026-08-11) — there is no open/close
   * any more, so `toggleCklMenu` only means "make sure it is current". Kept under its old
   * name because three call sites reach it (the idle launcher's "All checklists…", the
   * mission window, and the tour) and renaming it would be churn for nothing.
   *
   * Rebuilt on a KEY, not every broadcast: the order is stable now, so a per-frame
   * innerHTML would be pure cost on the densest list in the shell. */
  var cklMenuKey = null;
  function toggleCklMenu(force) {
    var menu = $('cklMenu'); if (!menu) return;
    menu.hidden = false;
    var key = ui.engineKey + '|' + (latest && latest.instructor && latest.instructor.checklist
      ? latest.instructor.checklist.procedure_id : '');
    if (force === 'force' || key !== cklMenuKey) { cklMenuKey = key; menu.innerHTML = cklMenuHtml(); }
  }
  /* A STANDARD ORDER *(OWNER DIRECTIVE, 2026-08-11: "They should stay in a standard
   * order.")*. This supersedes the relevance SORT: the list is now always in the same
   * order — category first, on the sequence an operator would name them (startup, power,
   * control, shutdown, emergency, accident), then title. A list that rearranges itself is
   * a list you have to re-read every time, and muscle memory is worth more here than
   * putting the most likely item on top.
   *
   * The relevance SCORING is kept and still earns its place, because it is what produces
   * the gating labels ("Requires reactor power above 10") and what the free-play
   * Instructor's short launcher picks its four from. What is retired is the reordering,
   * not the knowledge. */
  var CKL_CAT_ORDER = ['startup', 'power', 'control', 'shutdown', 'emergency', 'accident'];
  function cklMenuHtml() {
    var ranked = rankedProcedures();
    if (!ranked.length) return '<div class="m-note">No procedures for this plant.</div>';
    var stable = ranked.slice().sort(function (a, b) {
      var ai = CKL_CAT_ORDER.indexOf(a.category || ''), bi = CKL_CAT_ORDER.indexOf(b.category || '');
      if (ai < 0) ai = CKL_CAT_ORDER.length;
      if (bi < 0) bi = CKL_CAT_ORDER.length;
      if (ai !== bi) return ai - bi;
      return (a.title || '').localeCompare(b.title || '');
    });
    return stable.map(function (r) {
      return '<button data-ckl-start="' + mesc(r.id) + '"' + (r.gate ? ' class="ckl-gated"' : '') + '>' +
             '<span class="ckl-cat">' + mesc(r.category || '') + '</span>' + mesc(r.title) +
             (r.gate ? '<span class="ckl-gate">' + mesc(r.gate) + '</span>' : '') + '</button>';
    }).join('');
  }
  /* NEVER REORDER AN OPEN LIST (spec §9), and the way to guarantee that is to have no
   * refresh path at all: the menu is rebuilt when it OPENS and not again. A first version
   * of this had a `refreshCklRelevance` that recomputed on every event — with the guard
   * inverted, so it fired only while the menu was open, which is exactly the case the spec
   * forbids. The list reshuffling under the cursor during a heatup is the failure; a list
   * that is stale-but-stable until the next time you open it is the specified behaviour,
   * and it needs no state to achieve. */
  function startChecklist(id) {
    cmd({ action: 'start_checklist', procedure_id: id });
    /* SPLIT, do not take the column *(OWNER DIRECTIVE, 2026-08-11: "The checklist tab
     * should always show the list of checklists.")*. `setFocus('instructor')` collapses the
     * tools card, which left the list present in the DOM and invisible on screen — the
     * directive is about what the player can SEE, so rendering it is not enough. Both cards
     * stay open: the running checklist in the Instructor, the list still above it. */
    applyFocus(true, true);
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
      '<div class="lc-actions">' + btns + '</div>' +
      // Ask at endpoints, not only from a button (#438, spec §10): a completion point is
      // when the user has an opinion and no task in flight. A quiet offer, not a modal.
      '<div class="fb-hint lc-fb">Something read wrong, or an idea? ' +
      '<button class="btn" data-lc="feedback">Send feedback</button></div></div>';
    setFocus('instructor');
  }
  function levelCompleteAction(a) {
    // Feedback offer on the completion card (#438) — opens the form and leaves the
    // card standing, so Continue/Retry are still there when the form closes.
    if (a === 'feedback') { openFeedback(); return; }
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
  var resetArmT = null;                  // the Reset arm's self-disarm timer (#443)
  /* The window PAUSES, and closing it resumes *(OWNER DIRECTIVE, 2026-08-11: "The menu
   * should freeze the plant but when you close the menu it should unfreeze the plant.")*.
   *
   * I briefly made it run behind the window, reading "the sim should not start paused" as
   * being about the load moment. That was wrong and the owner corrected it: freeze while
   * the menu is up, unfreeze on close. openModal/closeModal already express exactly that —
   * closeModal releases this hold and restarts the plant when no other hold is standing. */
  function openMissionSelect() {
    msel.engine = ui.engineKey;
    msel.init = ui.initState;
    renderMissionSelect();
    openModal('missionOverlay');
  }
  /* A FEW SECONDS, then gone *(OWNER DIRECTIVE, 2026-08-11: "a tooltip should point to the
   * button that opens it again. The tooltip should only show up for a few seconds.")*.
   * Armed only by the on-load open, so it fires once per session and never interrupts a
   * player who opened the window deliberately and knows where it is. */
  var missionTipArmed = false, missionTipT = null;
  function closeMissionSelect() {
    closeModal('missionOverlay');
    if (!missionTipArmed) return;
    missionTipArmed = false;
    var tip = $('simStatusTip'); if (!tip) return;
    tip.hidden = false;
    clearTimeout(missionTipT);
    missionTipT = setTimeout(function () { tip.hidden = true; }, 6000);
    markSeen('session');
  }
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
    // Step 4 — the session footer. OUTSIDE #mpContent deliberately: that element is "the
    // selected mode's content", and Reset is neither a mode nor content — it is session
    // management, offered on every channel and every tab. Putting it inside also rebuilt
    // it on every tab switch, and tripped verify_flags_ui's "public: campaign offers
    // nothing to start", which counts buttons in #mpContent as things you can start. That
    // check was right and reads correctly again with the footer where it belongs.
    setHTML($('mpSession'),
      '<div class="m-note">Reset returns the plant to ' + mesc(ui.initState) +
      ' and ends anything the Instructor is running.</div>' +
      '<button class="btn mp-reset" data-mreset="arm">↺ Reset the plant</button>');
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

  // THE SELECTION SCREEN IS GONE *(OWNER DIRECTIVE, 2026-08-11: "The plant and mission menu
  // should be up when the sim page is loaded.")*. It asked which plant and which activity,
  // then handed off to the Plant & Mission window for everything except free play — so the
  // window now does the whole job and the extra surface is removed rather than left
  // unreachable. Its one genuinely new idea, Resume-for-a-returning-visitor, is not lost:
  // the window opens on the plant and mode the player last used, because `msel` is seeded
  // from `ui` in openMissionSelect().

  /* Coach marks — PERSISTENT unvisited dots, not a timed tour (#443, spec §9).
   * A tooltip that fades gets dismissed by the click the user was already making
   * and is then gone for ever; a dot waits until they are curious and retires
   * itself the first time they open the thing. Exactly three, by ruling: the
   * session bar, Checklists, and Feedback. */
  /* Panel state across sessions (#439, spec §14-7 — OWNER SELECTION 2026-08-10 from the
   * options presented: "Persist panel state"). Which tab was open and whether the
   * Instructor was folded are the player's arrangement of their own control room, and
   * re-making it every launch is the same class of annoyance as re-dragging a splitter
   * (which HAS been persisted since the board's splitters landed). Deliberately NOT
   * persisted: plant state, which has never been autosaved, and the tools/instructor
   * split while content is live — a scenario decides that. */
  var PANEL_KEY = 'rd_panel_state';
  function savePanelState() {
    try {
      var tab = document.querySelector('#tabbar button.on');
      var card = $('instructorCard');
      localStorage.setItem(PANEL_KEY, JSON.stringify({
        tab: tab ? tab.getAttribute('data-tab') : null,
        instr: !card ? null : card.classList.contains('mini') ? 'mini'
          : card.classList.contains('expanded') ? 'expanded' : 'collapsed'
      }));
    } catch (e) { /* private mode */ }
  }
  function restorePanelState() {
    /* THE STARTING STATE IS APPLIED FIRST AND UNCONDITIONALLY. It used to sit after an
     * `if (!st) return`, so a visitor with nothing saved — a first visit, a cleared
     * browser — never reached it and got the markup's default, which is `collapsed`. The
     * one case the directive is about was the one case that skipped it. */
    applyFocus(true, true);
    var st;
    try { st = JSON.parse(localStorage.getItem(PANEL_KEY) || 'null'); } catch (e) { return; }
    if (!st) return;
    if (st.tab) {
      var b = document.querySelector('#tabbar [data-tab="' + st.tab + '"]');
      // A tab that no longer exists is not an error — the strip was restructured in
      // #439 and a saved 'operate' or 'settings' must fall back, not throw.
      if (b && !b.classList.contains('on')) b.click();
    }
    /* THE INSTRUCTOR STARTS FULL SIZE *(OWNER DIRECTIVE, 2026-08-11: "The instructor block
     * should start full size when free play is started.")*. A remembered fold is not
     * restored on a fresh start: the block is where free play's coaching and the checklist
     * launcher live, and opening folded hides the one surface that tells a new player what
     * to do next. The tab choice is still restored — that is a preference; this is a
     * starting state. */
  }

  var SEEN_KEY = 'rd_seen_';
  // The Checklists mark points at the LIST now — its open button is gone, because the
  // list is always on screen (owner, 2026-08-11).
  var COACH = { session: 'simStatus', checklists: 'cklMenu', feedback: 'fbHeaderBtn' };
  function seenCoach(k) {
    try { return localStorage.getItem(SEEN_KEY + k) === '1'; } catch (e) { return true; }
  }
  function markSeen(k) {
    if (seenCoach(k)) return;
    try { localStorage.setItem(SEEN_KEY + k, '1'); } catch (e) { /* private mode */ }
    applyCoachMarks();
  }
  function applyCoachMarks() {
    Object.keys(COACH).forEach(function (k) {
      var el = $(COACH[k]);
      if (el) el.classList.toggle('unvisited', !seenCoach(k));
    });
  }

  // ============================================== Features window (#241)
  // The development toggle board: every flag in site/flags.js, its stage, and
  // what this browser currently resolves it to. Toggles write localStorage
  // OVERRIDES — they change what you see, never what the site ships; the stage
  // column is the shipped answer and only a code edit moves it.
  //
  // "View as" re-resolves the whole app against another channel, which is the
  // one thing worth doing before a release: look at develop as the public will.
  function openFeaturePanel() { renderFeaturePanel(); openModal('featureOverlay'); }
  function closeFeaturePanel() { closeModal('featureOverlay'); }
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
    pauseSim('content');
    service.handleCommand({ action: 'start_scenario', scenario_id: id });
    afterPlantChange();          // the scenario may have switched the plant
    // (M5's start_scenario starts from a clean automation board and applies the
    // authored auto_channels preset itself — the channel runtime is in-stack.)
    diagReset('scenario', { scenario_id: id });
    resetInstrFlow();            // fresh mission → fresh commentary queue
    resetChat();                 // fresh transcript state (chat-mode scenarios)
    setFocus('instructor', true);
    service.handleCommand({ action: 'play' });
    resumeSim();                 // the scenario runs it: clears the 'content' hold above
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
      // The REASON is load-bearing beyond the freeze — #441 forbids the lanes
      // rescaling during rewind review, and `pausedFor('rewind')` is how it asks.
      pauseSim('rewind');
      latest = service.assembleSnapshot(); render(latest);
    } else { clearPause('rewind'); if (latest) drawChart(); }
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
  // them). A ROUTINE message never expands the card: while collapsed it cues the
  // header badge and a brief glow instead (instrAttention), and while expanded but
  // scrolled away it marks "new below" inside the panel.
  //
  // A GATING step is the exception and DOES open the card (#439, spec §4 — see
  // instrGateOpen for the ruling and the per-beat dismissal rule). Instruction that
  // blocks progress cannot be allowed to arrive somewhere the player is not looking.
  // setFocus is also the CONTENT-TRANSITION entry point — scenario / walkthrough /
  // checklist start, level-complete, strict-gate feedback — where
  // the named card taking the column is what the player's own action asked for.
  // Invariant (applyFocus): at least one card is always expanded.
  function isLive() { return !!(ui.scenario || ui.follow || chatState.sid || cklState.key); }
  /* ONE TAB STRIP, ONE VISIBLE PANE *(OWNER DIRECTIVE, 2026-08-11: "Make the instructor
   * block a tab. Make it the leftmost tab.")*.
   *
   * This replaces the two-card accordion (instructor card above, tools card below, exactly
   * one expanded in free play and a 50/50 split allowed while instructed content ran). That
   * model needed applyFocus, focusTools, toggleInstructorCard, a minimize LADDER and a
   * persisted split, all to answer one question the tab strip answers by construction:
   * which of these am I looking at.
   *
   * applyFocus keeps its signature because ~20 call sites pass it, and its meaning survives
   * the translation intact: "give the instructor the column" is now "select the Instructor
   * tab", and "give the tools the column" is "select some other tab". */
  function selectTab(name) {
    var bar = $('tabbar'); if (!bar) return;
    var btn = bar.querySelector('[data-tab="' + name + '"]'); if (!btn) return;
    bar.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === btn); });
    document.querySelectorAll('.tabpane').forEach(function (p) {
      p.classList.toggle('on', p.getAttribute('data-pane') === name);
    });
    if (name === 'instructor') clearInstrAttention();
    // The transcript scrolls itself; every other pane is scrolled by .tab-body. See the
    // .instr-mode rule in shell.css for what goes wrong without this.
    var tb = document.querySelector('.tab-body');
    if (tb) tb.classList.toggle('instr-mode', name === 'instructor');
    // A pane that skips its work while hidden shows whatever it last painted, and on a
    // PAUSED plant no broadcast is coming to correct it. Repaint on reveal.
    if (latest) { renderPhysics(latest); renderIndications(latest); renderAutomate(latest); }
    scrollInstrLog();
    if (typeof savePanelState === 'function') savePanelState();
  }
  function currentTab() {
    var b = document.querySelector('#tabbar button.on');
    return b ? b.getAttribute('data-tab') : 'instructor';
  }
  // Where "hand it back to the tools" goes. Remembers the last non-instructor tab so
  // dismissing the Instructor returns you to what you were doing, not to a fixed default.
  var lastToolsTab = 'checklists';
  function applyFocus(iExp, tExp) {
    if (iExp) { selectTab('instructor'); return; }
    if (tExp) { selectTab(currentTab() === 'instructor' ? lastToolsTab : currentTab()); }
  }

  function setFocus(which) {
    applyFocus(which === 'instructor', which !== 'instructor');
  }
  // Persona header: the always-visible collapse/expand affordance (it survives
  // chat mode now). Collapsing hands the column to the tools; expanding splits
  // while live and takes the column in free play (accordion).
  // The persona header still toggles, but between TABS: press it on the Instructor tab to
  // go back to what you were doing, press it anywhere else to come here.
  function toggleInstructorCard() {
    if (currentTab() === 'instructor') selectTab(lastToolsTab); else selectTab('instructor');
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
  // Re-clicking the active tab used to collapse the card. There is nothing to collapse
  // now — every tab shows a pane — so a second click is simply the tab you are on.
  function focusTools(activeAgain) { /* handled by the tab strip itself */ }
  // #237 attention cue: new instructor content while the card is collapsed gets a
  // count badge + glow on the header (same grammar as the board's TRIP BLOCKS
  // badge) instead of stealing the column. Cleared when the player expands.
  var instrUnseen = 0;
  function instrAttention() {
    var card = $('instructorCard'); if (!card) return;
    // OPEN BUT SCROLLED AWAY gets a quiet "new below" marker inside the panel, not a
    // header flash (#439, spec §4). The message is on screen — it is just not the part
    // of the screen being read — and flashing the header for something already visible
    // spends the signal on nothing.
    // The Instructor is a tab now: when it is not the selected tab, the cue belongs on
    // its BUTTON, which is the thing the player would have to press. `expanded` reads as
    // "this pane is on screen".
    if (card.classList.contains('on')) {
      var log = $('instrLog');
      var away = log && (log.scrollHeight - log.scrollTop - log.clientHeight) > 24;
      var nb = $('instrNewBelow'); if (nb) nb.hidden = !away;
      return;
    }
    instrUnseen++;
    var b = $('instrBadge');
    if (b) { b.hidden = false; b.textContent = instrUnseen > 9 ? '9+' : String(instrUnseen); }
    // The badge lives inside the pane, which is not on screen — so the count also goes on
    // the TAB BUTTON, the only part of the Instructor a player can see right now.
    var tb = document.querySelector('#tabbar [data-tab="instructor"]');
    if (tb) {
      tb.setAttribute('data-unseen', instrUnseen > 9 ? '9+' : String(instrUnseen));
      tb.classList.remove('tab-attn');
      void tb.offsetWidth;   // restart the pulse for each new line
      tb.classList.add('tab-attn');
    }
  }
  function clearInstrAttention() {
    instrUnseen = 0;
    var b = $('instrBadge'); if (b) b.hidden = true;
    var card = $('instructorCard'); if (card) card.classList.remove('instr-attn');
    var nb = $('instrNewBelow'); if (nb) nb.hidden = true;
    var tb = document.querySelector('#tabbar [data-tab="instructor"]');
    if (tb) { tb.classList.remove('tab-attn'); tb.removeAttribute('data-unseen'); }
  }

  /* ================================================ THE TRANSCRIPT (item 7, 2026-08-11)
   * "like teams messages ... persistent and scrollable only cleared when the user changes
   * what that instructor block is showing".
   *
   * TWO KEYS, and the distinction is the whole design:
   *
   *   TOPIC  — which walkthrough / checklist / scenario / chat is being shown. A change
   *            here CLEARS the log, because it is the player changing the subject, which
   *            is the one clearing condition the directive names.
   *   MESSAGE — the identity of the current message inside that topic. A change here
   *            FREEZES the live bubble into the transcript and starts a new one.
   *
   * The message key is the FIRST LINE only, deliberately. Every renderer rebuilds
   * #instrCurrent on each broadcast to update live acceptance status ("…not yet" -> "met"),
   * so keying on the whole text would append a near-duplicate bubble several times a
   * second. The first line is the step text, which is stable for exactly as long as the
   * message is the same message. */
  var instrLog = { topic: null, key: null, html: '' };
  /* THE TOPIC COMES FROM THE SNAPSHOT, NOT FROM `ui`. renderInstructor's own header says
   * it: "Follow state is derived FROM the snapshot (the Instructor owns it); ui.follow is
   * just a synced mirror." The mirror is not cleared when a walkthrough stops, so keying on
   * it left the topic reading `flw:pwr_startup` after the panel had already returned to the
   * idle launcher — measured: Stop pressed, nav hidden, idle content on screen, and the log
   * still growing (5 -> 6) instead of clearing. */
  function instrTopic(s) {
    var i = (s && s.instructor) || {};
    if (i.checklist && i.checklist.procedure_id) return 'ckl:' + i.checklist.procedure_id;
    if (i.follow && i.follow.procedure_id) return 'flw:' + i.follow.procedure_id;
    if (i.chat && (i.chat.sid || i.chat.id)) return 'cht:' + (i.chat.sid || i.chat.id);
    if (ui.scenario) return 'scn:' + (ui.scenario.id || ui.scenario);
    return 'idle';
  }
  function scrollInstrLog() {
    var log = $('instrLog'); if (log) log.scrollTop = log.scrollHeight;
  }
  function clearInstrLog() {
    var log = $('instrLog'), cur = $('instrCurrent');
    if (!log || !cur) return;
    var msgs = log.querySelectorAll('.instr-msg');
    for (var i = 0; i < msgs.length; i++) log.removeChild(msgs[i]);
    instrLog.key = null; instrLog.html = '';
  }
  function instrLogTick(s) {
    var cur = $('instrCurrent'), log = $('instrLog');
    if (!cur || !log) return;
    var topic = instrTopic(s);
    if (topic !== instrLog.topic) { instrLog.topic = topic; clearInstrLog(); }
    /* A CHECKLIST IS ALREADY THE THING THIS FEATURE ASKS FOR and must not be folded in.
     * It renders its WHOLE step list into the bubble at once — persistent and scrollable
     * by construction — so there is no outgoing message to freeze, and its first line is
     * the checklist title, which never changes. Measured: the key sat on "Post-trip
     * response — Mode 1, At Power -> Mode 3, Hot Sta" for eight consecutive samples while
     * the steps underneath it advanced. Accumulating here would either do nothing (as it
     * did) or, on a full-text key, duplicate the entire list on every acceptance flicker.
     *
     * What DOES accumulate is the message-shaped content the directive names: instructor
     * guidance, scenario commentary, and walkthrough steps — each a discrete message that
     * used to be overwritten by the next one. */
    if (cklState.key) { instrLog.key = null; instrLog.html = ''; return; }
    var first = (cur.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!first) return;
    if (first === instrLog.key) { instrLog.html = cur.innerHTML; return; }  // same message, live
    if (instrLog.key) {
      var d = document.createElement('div');
      d.className = 'instr-msg';
      d.innerHTML = instrLog.html;
      log.insertBefore(d, cur);
    }
    instrLog.key = first; instrLog.html = cur.innerHTML;
    // Only follow the tail if the reader is already at it — yanking the view away from
    // something being read is exactly what the "new below" marker exists to avoid.
    var away = (log.scrollHeight - log.scrollTop - log.clientHeight) > 40;
    if (!away) scrollInstrLog();
  }
  /* AUTO-OPEN ON A GATING STEP (#439, spec §4).
   *
   * OWNER SELECTION 2026-08-10 (from the options presented: "Adopt spec's auto-open"),
   * reversing the removal this section's own note used to record. What made auto-open
   * intolerable before was that it repeated: close it, and the next broadcast opened it
   * again, so reading Physics during a mission was impossible. The rule that fixes it is
   * per-STEP, not per-message — a dismissal stands for the beat it was made on, and the
   * card comes back on the NEXT beat. That is why the key is `current_beat_id` and why it
   * is set BEFORE the focus call rather than after: a re-render inside the same beat must
   * find it already claimed.
   */
  var lastGateBeat = null;
  function instrGateOpen(s) {
    var inst = s && s.instructor;
    if (!inst || !inst.gated) return;
    var key = inst.current_beat_id || inst.scenario_id;
    if (!key || key === lastGateBeat) return;
    lastGateBeat = key;
    setFocus('instructor');
  }

  function renderFailures(s) {
    var act = {}; s.active_failures.forEach(function (f) { act[f.id] = f; });
    document.querySelectorAll('.fail-row').forEach(function (row) {
      var id = row.id.replace('fail-', ''), on = !!act[id];
      row.classList.toggle('active', on);
      var btn = row.querySelector('.fail-toggle'); txt(btn, on ? 'Clear' : 'Inject');
      var sl = row.querySelector('[data-sevfor]');
      if (sl && on && act[id].severity != null && document.activeElement !== sl) {
        var m = JSON.parse(row.getAttribute('data-meta'));
        sl.value = Math.round(act[id].severity * 100);
        txt(row.querySelector('[data-svlabel="' + id + '"]'), m.label + ': ' + Math.round(m.min + act[id].severity * (m.max - m.min)) + ' ' + m.unit);
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
  // Since #454 that rule is the DEFAULT rather than the whole story — see sideOf below.
  /* WHICH SIDE(S) A CHANNEL TRACES — PER SERIES SINCE #454 *(OWNER DIRECTIVE, 2026-08-11:
   * "You should be able to choose the indication or the physics value for each. Put a radial
   * next to each value to let the user choose so they could even choose both the indication
   * and physics if they want.")*.
   *
   * TWO MAPS, NOT ONE, and the split is load-bearing. `ui.series[id]` still means exactly
   * what it meant before — "is this channel plotted at all" — because it is shared with the
   * Indications tab and the board's plot cells through syncPlotCells(). `ui.seriesSide[id]`
   * is the NEW question and only ever refines an already-plotted channel.
   *
   * THE FALLBACK IS THE OLD GLOBAL RULE, VERBATIM. A series nobody has overridden traces
   * whatever `chartTruth()` says, so an untouched plant charts identically to before and the
   * Settings Learning/Realistic switch keeps moving every series it used to move. Writing the
   * default as `(chartTruth() || !ser.get)` rather than as "whichever side exists" is
   * deliberate: they differ for a `ctl` series that also carries `tru`, and taking the
   * convenient form would have silently changed such a channel in Realistic mode. There is no
   * such series on any plant today — which is exactly why it had to be checked rather than
   * assumed, since the first one added would have inherited the bug. */
  function sideAvail(ser) {
    return { ind: !!(ser.get || ser.ctl), phys: !!ser.tru };
  }
  function sideOf(ser, ignorePlotted) {
    if (!ignorePlotted && !ui.series[ser.id]) return null;
    var av = sideAvail(ser), want = ui.seriesSide[ser.id];
    // An override is honoured only for a side this series HAS. A physics-only quantity
    // (decay heat, void, reactivity) cannot be forced to 'ind' and a demand cannot be
    // forced to 'phys' — the toggle for the missing side is disabled in the overlay, and
    // this is the second half of that so a stale map entry cannot produce a blank lane.
    if (want === 'both' && av.ind && av.phys) return 'both';
    if (want === 'ind' && av.ind) return 'ind';
    if (want === 'phys' && av.phys) return 'phys';
    return (!!ser.tru && (chartTruth() || !ser.get)) ? 'phys' : 'ind';
  }
  // The SOLID trace's side, and the DASHED twin's — 'both' is one lane with two traces, so
  // every drawing site asks these two rather than branching on the string three times.
  function sideSolid(side) { return side === 'phys' ? 'phys' : 'ind'; }
  function sideDashed(side) { return side === 'both' ? 'phys' : null; }
  // Rows are PACKED (see chartBuf): a column index, not a key, and an absent reading is NaN
  // rather than undefined. `isFinite` rejects both, so the guard is unchanged — but a series
  // whose id is not in the current index must return null rather than read column
  // `undefined`, which on a Float64Array is undefined and would slip past a `!= null` test.
  // `side` is 'ind' or 'phys' — ONE side, resolved by the caller. 'both' never reaches here:
  // it is two traces, so the caller asks twice. Defaulting it keeps the handful of callers
  // that only ever want the primary reading (the value chip, the numeric row) short.
  function seriesVal(ser, sample, side) {
    var i = serCol[ser.id]; if (i == null) return null;
    if (side == null) side = sideSolid(sideOf(ser, true));
    var src = (side === 'phys') ? sample.tv : sample.v;
    var v = src ? src[i] : null;
    return (v == null || !isFinite(v)) ? null : v;
  }
  // The EXTREMES this sample covers, on whichever side is being plotted. Fine rows carry
  // the min/max the service folded over their sub-interval (see setFineSampler there);
  // broadcast rows and the preseed carry none, and collapse to the point value — which is
  // correct, they represent one instant rather than a span.
  function seriesExt(ser, sample, val, side) {
    var i = serCol[ser.id]; if (i == null) return [val, val];
    var t = (side == null ? sideSolid(sideOf(ser, true)) : side) === 'phys';
    var l = t ? sample.tlo : sample.lo, h = t ? sample.thi : sample.hi;
    var a = l ? l[i] : null, b = h ? h[i] : null;
    return [(a == null || !isFinite(a)) ? val : a, (b == null || !isFinite(b)) ? val : b];
  }
  // Alarm emphasis on a trace. Latching with a release deadband (5 % of the distance
  // back into the band): a value sitting exactly on its setpoint used to strobe the
  // whole polyline once per frame.
  var seriesHot = {};   // id -> bool, held between frames
  function seriesAlarmed(ser) {
    if (!latest) return false;
    var v = null;
    try {
      // Follows the SOLID trace's side — the emphasis belongs to the line the eye is on.
      // For a 'both' lane that is the instrument, which is also the prototypical answer:
      // alarms read instruments (HR1), so a channel showing both sides lights on the one
      // the protection system is actually watching.
      if (ser.ctl) v = ser.ctl(latest.control_state || {});
      else if (sideSolid(sideOf(ser, true)) === 'phys' && latest.true_state) v = ser.tru(latest.true_state);
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
  /* ONE LANE PER INDICATION (#440, spec §8) — real stacked bands, not offsets inside one
   * plot. `laneOf` used to slide each series' held band up or down a shared vertical space
   * so the traces did not sit on top of each other; that is what the spec calls the
   * false-correlation problem, and it is why per-lane autoscale used to mislead. Traces are
   * no longer overlaid, so each lane owns its own vertical extent outright.
   *
   * The geometry is in the SVG's own viewBox units (H below), and the pixel numbers the
   * spec fixes — 44-56 px lane, 36 px floor, 2/4 px padding, 1 px hairline — live in
   * ui/shell.css and in the hand-built reference at ui/test_panel/lane_reference.html,
   * which measures itself against the ~220 px budget. Do not re-derive them here.
   *
   * TEXT NEVER GOES IN THE SVG. The canvas is `preserveAspectRatio="none"` over a fixed
   * 400x120 box, so it stretches non-uniformly with the panel — a <text> in it would be
   * squashed at exactly the widths the density budget is fighting for. Names, ranges and
   * values are HTML in the overlay layer, which is what `#chartFloats` already was. */
  /* THE SHARED TIME CURSOR (#440, spec §8) — what turns a stack of lanes into a
   * RELATIONSHIP display. Hovering places one vertical line across EVERY lane and each
   * lane's value column shows its reading at that instant: "at this moment, load was here,
   * power was here, Tavg was here." Without it the viewer is eyeballing vertical alignment
   * between traces and the teaching claim goes soft — which is the whole reason the stack
   * replaced an overlaid plot.
   *
   * `frac` is the pointer's position along the PLOT, 0..1, or null for live. Stored as a
   * fraction rather than a time so it survives the window scrolling under it: the cursor
   * belongs to the chart, not to a moment that slides off the left edge while the pointer
   * sits still. */
  var chartCursor = { frac: null };
  var LANE_GAP = 1.5;                   // viewBox units between lanes — the hairline
  var LANE_FLOOR_PX = 36;               // the spec's HARD floor; below it a trace is not a trace
  function laneBand(i, n, H) {
    var h = H / Math.max(1, n);
    return { top: i * h + LANE_GAP, bot: (i + 1) * h - LANE_GAP, h: h };
  }
  /* HOW MANY TRACE LANES FIT, and what happens to the rest (#440, §14-7a).
   *
   * OWNER SELECTION 2026-08-10, from the options presented: "max trace lanes = what fits at
   * the 36 px floor; when a lesson or the user pins more than fit, the excess renders as
   * numeric rows (never squeezed lanes), newest-pinned demoted first."
   *
   * Measured before this existed: six pinned channels in the shipped 168 px plot gave 28 px
   * lanes — under the floor, and a 28 px trace is a smear that says less than the number
   * beside it would. Dividing the space further is the one thing the stack must not do.
   *
   * Read from the LIVE element, not from a constant: the splitters (#445) make the region's
   * height the operator's to choose, so the lane count has to follow it. */
  var NUM_ROW_PX = 18;                  // a demoted channel's numeric row, per the reference
  var LANE_TARGET_PX = 56;              // the top of the spec's 44-56 band
  /* The split is JOINTLY constrained and has to be solved as one: every channel demoted to a
   * numeric row TAKES 18 px from the lanes above it, so "how many lanes fit" depends on how
   * many were demoted, which depends on how many fit. Computing the lane count first and
   * dropping the rows underneath is what the first version did, and it drew the numeric rows
   * straight over the bottom lane — visible in the screenshot, invisible to every check
   * that only counted elements.
   *
   * Walk d upward until the remaining lanes clear the floor. Bounded by n, and the last
   * iteration (one lane, everything else a number) always terminates. */
  function laneSplit(n, px) {
    if (!px) return { lanes: Math.min(n, 4), rows: Math.max(0, n - 4), px: 0 };
    for (var d = 0; d < n; d++) {
      var lanes = n - d;
      var avail = px - d * NUM_ROW_PX;
      if (avail / lanes >= LANE_FLOOR_PX) {
        /* EXTRA SPACE ADDS ROWS, IT DOES NOT INFLATE THEM (#445, spec §8). Dragging the
         * strip taller with three channels pinned must not give three enormous traces —
         * "which is nobody's intent". Lanes stop growing at the target height and the
         * surplus is simply not used by the stack; it becomes room for the next channel
         * the operator pins, which is the point of having dragged. */
        var used = Math.min(avail, lanes * LANE_TARGET_PX);
        return { lanes: lanes, rows: d, px: used };
      }
    }
    return { lanes: 1, rows: n - 1, px: Math.max(LANE_FLOOR_PX, px - (n - 1) * NUM_ROW_PX) };
  }
  /* Pin order, oldest first. `ui.series` is an object and JS preserves string-key insertion
   * order, so a newly ticked channel lands at the end — which is exactly "newest pinned".
   * Demotion takes from that end, so the channels someone has been watching all along keep
   * their traces and the one just added is the one that arrives as a number. */
  function pinOrder() {
    return Object.keys(ui.series).filter(function (k) { return ui.series[k]; });
  }

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
      // Pick mode frames the CHECKPOINTS, not the selected window — in BOTH directions.
      // It used to only widen (`if (oldest < t0)`), which was safe while the window was
      // a fixed 5 min. Now that the ladder follows time acceleration, a fast speed
      // selects a window far longer than the run, and every mark squeezes into a few
      // pixels at the right edge — measured on CI, the T+13 s mark and the T+0 s mark
      // resolved to the same click. The margin keeps the oldest mark off the axis.
      t0 = oldest - (t1 - oldest) * 0.04;
    }
    if (t1 - t0 < 1e-6) t0 = t1 - 1;
    return { t0: t0, t1: t1, span: t1 - t0 };
  }

  function drawChart() {
    var svg = $('chartCanvas'), floats = $('chartFloats'), W = 400, H = 120;
    var active = prof().series.filter(function (s) { return ui.series[s.id]; });
    if (chartBuf.length < 2) {
      chartRange = {};   // no data → forget held ranges so the next fit starts clean
      // Nothing plotted yet: name the pinned channels in their lanes so the stack reads as
      // "waiting" rather than as empty. Their declared range stands in for the fitted one.
      setHTML($('chartLegend'), '');
      svg.innerHTML = '';
      drawLanes(active.map(function (s, i) {
        var b = laneBand(i, active.length, H);
        return { ser: s, top: b.top / H * 100, mid: (b.top + b.bot) / 2 / H * 100,
                 lo: s.range[0], hi: s.range[1], val: null, hot: false };
      }));
      return;
    }
    var ext = chartExtent(), t1 = ext.t1, t0 = ext.t0, span = ext.span;
    var PW = W * CHART_PLOT_FRAC;   // traces stop short of the right edge; value chips live in the gutter
    var html = '';
    // Downsample the VISIBLE window [t0, t1] into fixed TIME buckets — one per plot
    // pixel. chartBuf holds up to 30 min but only ui.window shows; bucketing keeps
    // drawChart O(pixels), and averaging the sub-pixel samples per bucket makes a noisy
    // trace readable — this is pixel-resolution downsampling, NOT temporal smoothing
    // (there's no lag).
    //
    // THE GRID IS ANCHORED IN ABSOLUTE TIME, and until 2026-08-05 it was not — which is
    // why already-plotted history visibly crawled and deformed *(OWNER: "sometimes the
    // lines that have already been plotted shift and move and it's not the auto fit of the
    // unit range … the polling shifted with time so it shows different polled times of the
    // line each polling time.")*. The comment that stood here claimed the opposite — "a
    // sample stays in the same time bucket, so the line doesn't change shape as it moves
    // left" — and that was FALSE by construction: the index was
    // `floor((t − t0)/span·NB)` with `t0 = t1 − window`, so the whole grid slid every time
    // a new sample landed. MEASURED with the shipped constants (344 buckets, 300 s window,
    // 0.87 s per bucket): one FIXED sample at t = 1000 s moves bucket 114 → 113 → 112 → 111
    // as t1 advances 1200 → 1203 s, i.e. it crosses a boundary about every 0.9 s. Each
    // crossing changes that bucket's membership, and therefore both its mean VALUE and its
    // mean TIME — which is exactly what gets plotted. Measured in the browser, points that
    // should translate rigidly instead spread by up to 1.0 px per frame.
    //
    // Anchoring the grid to absolute multiples of the bucket width fixes it: a sample keeps
    // its bucket for as long as the bucket width is unchanged, so the trace translates
    // rigidly and only hops when the grid origin advances a whole bucket — one pixel, all
    // points together. The plotted time is the bucket's OWN grid time rather than the mean
    // of whatever samples currently fall in it, so x cannot wobble as membership changes at
    // the edges; a bucket IS a pixel, so nothing is lost by quantising to its centre.
    var startI = 0;
    while (startI < chartBuf.length - 1 && chartBuf[startI].t < t0) startI++;
    var NB = Math.max(2, Math.round(PW));   // one bucket per plot pixel
    var ranges = {}, seriesMeans = {}, seriesDash = {};
    // Realistic traces the raw instrument, so it still carries sensor noise. Bucket
    // averaging alone thins out at short windows (fewer samples per bucket), so smooth
    // over a FIXED TIME width instead — the trace reads the same at 1 min and 30 min.
    // Truth needs none of this: the physics has no noise to remove.
    var secPerBucket = span / NB;
    var bOrigin = Math.floor(t0 / secPerBucket);   // absolute grid index of the left edge
    var SMOOTH_SEC = 3;
    /* SMOOTHING IS PER SIDE, NOT PER CHART (#454). It used to key on `chartTruth()`, which
     * was right while every trace on the chart came from the same side; a 'both' lane draws
     * an instrument and the physics TOGETHER, and running the 3-second centred average over
     * the true side would smooth a signal that has no noise in it — inventing a difference
     * between the two traces at exactly the moment the player put them side by side to
     * compare them. The comment above ("Truth needs none of this") was already the rule; it
     * simply had nowhere per-trace to live. */
    var kInd = Math.min(12, Math.floor(SMOOTH_SEC / Math.max(1e-6, secPerBucket) / 2));
    function smoothFor(side) { return side === 'phys' ? 0 : kInd; }
    /* ONE SIDE'S BUCKETED MEANS. Extracted from the loop below so a lane can ask for two of
     * them; the arithmetic is unchanged, including that the BAND is never smoothed. */
    function bucketSide(ser, side) {
      var sum = {}, cnt = {}, blo = {}, bhi = {};   // sparse per-bucket accumulators
      for (var j = startI; j < chartBuf.length; j++) {
        var val = seriesVal(ser, chartBuf[j], side);
        if (val == null || !isFinite(val)) continue;
        var bk = Math.floor(chartBuf[j].t / secPerBucket) - bOrigin;
        if (bk < 0) bk = 0; else if (bk >= NB) bk = NB - 1;
        if (cnt[bk] === undefined) { sum[bk] = 0; cnt[bk] = 0; blo[bk] = Infinity; bhi[bk] = -Infinity; }
        sum[bk] += val; cnt[bk] += 1;
        var ex = seriesExt(ser, chartBuf[j], val, side);
        if (ex[0] < blo[bk]) blo[bk] = ex[0];
        if (ex[1] > bhi[bk]) bhi[bk] = ex[1];
      }
      var means = [];
      for (var bk2 = 0; bk2 < NB; bk2++) {
        if (cnt[bk2] === undefined) continue;
        // the bucket's OWN time, not the mean of its members — see the grid note above
        means.push({ t: (bOrigin + bk2 + 0.5) * secPerBucket, v: sum[bk2] / cnt[bk2],
                     lo: blo[bk2], hi: bhi[bk2] });
      }
      // centred moving average — zero net lag, unlike an EWMA (a drifting or stuck
      // sensor survives it untouched; only the per-sample jitter goes)
      var kSmooth = smoothFor(side);
      if (kSmooth > 0 && means.length > 2 * kSmooth) {
        var sm = new Array(means.length);
        for (var m = 0; m < means.length; m++) {
          var a = Math.max(0, m - kSmooth), z = Math.min(means.length - 1, m + kSmooth), acc = 0;
          for (var q = a; q <= z; q++) acc += means[q].v;
          // the BAND is not smoothed — it is an envelope, and averaging it would shrink
          // the very excursions it exists to show
          sm[m] = { t: means[m].t, v: acc / (z - a + 1), lo: means[m].lo, hi: means[m].hi };
        }
        means = sm;
      }
      return means;
    }
    active.forEach(function (ser, si) {
      var side = sideOf(ser);
      var means = bucketSide(ser, sideSolid(side));
      var dashSide = sideDashed(side);
      var dashMeans = dashSide ? bucketSide(ser, dashSide) : null;
      var vmin = Infinity, vmax = -Infinity;
      // the BAND sets the range, not the line — otherwise a transient the band exists to
      // reveal would be drawn outside the axis and clipped away
      /* ONE SCALE FOR BOTH TRACES *(OWNER RULING, 2026-08-11, selecting "One lane, dashed
       * twin" from the options presented)*. The fit spans the UNION of the two sides, which
       * is the whole point: two independently-fitted axes would put an indicated 549 °F and
       * a true 551 °F on the same pixel and draw the disagreement as agreement. */
      function grow(list) {
        list.forEach(function (p) {
          var a2 = (p.lo != null && isFinite(p.lo)) ? p.lo : p.v;
          var b2 = (p.hi != null && isFinite(p.hi)) ? p.hi : p.v;
          if (a2 < vmin) vmin = a2; if (b2 > vmax) vmax = b2;
        });
      }
      grow(means);
      if (dashMeans) grow(dashMeans);
      seriesMeans[ser.id] = means;
      seriesDash[ser.id] = dashMeans;
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
      if (!isFinite(vmin) || !isFinite(vmax)) {
        ranges[ser.id] = h ? [h.lo, h.hi] : [ser.range[0], ser.range[1]];
        return;
      }
      /* THE POLICY IS RD.ChartMath.holdRange (#393) — the same call the vital tiles make,
       * so the two cannot drift; it was duplicated here behind a KEEP-IN-SYNC comment.
       *
       * AND THE LANE SLIDE IS GONE (#440). This block used to shift each fitted band up or
       * down in VALUE so the trace would land at its allotted height inside one shared
       * plot — the reason `laneOf` existed. With one lane per indication there is nothing
       * to dodge: each trace owns its own vertical band outright, so the fit is just a fit
       * and the geometry is the lane's. That also retires the subtlety the old comment
       * here had to warn about (measure the shift from where the trace ACTUALLY sits, not
       * from the band centre, or traces land in the wrong lane).
       *
       * The clamp preference — don't spend height on values the quantity cannot take, a
       * level axis running to -50 % reads as broken — moves into holdRange's clampLo/Hi,
       * which is careful never to let it beat the data. */
      var rLo = Math.min(ser.range[0], ser.range[1]), rHi = Math.max(ser.range[0], ser.range[1]);
      var hr = RD.ChartMath.holdRange(h && { lo: h.lo, hi: h.hi }, vmin, vmax, {
        minSpan: minSpan, shrinkFrames: CHART_SHRINK_FRAMES, shrinkFor: h ? (h.small || 0) : 0,
        clampLo: rLo, clampHi: rHi
      });
      h = { lo: hr.lo, hi: hr.hi, small: hr.shrinkFor };
      chartRange[ser.id] = h;
      ranges[ser.id] = [h.lo, h.hi];
    });
    // NO LEGEND BLOCK (#440, spec §8). It carried a swatch, a name and the fitted range
    // for every trace — exactly the three things that now sit INSIDE each lane, where they
    // name the trace they belong to instead of asking the eye to match a colour. Removing
    // it is one of the structural savings the ~220 px budget is made of; trimming padding
    // alone does not get there. The strip keeps its own header for the window ladder.
    setHTML($('chartLegend'), '');
    // ---- ONE LANE PER INDICATION (#440, spec §8) --------------------------------
    // Each series gets its own vertical band. Traces are no longer overlaid, so per-lane
    // autoscale stops misleading — the false-correlation problem existed only because two
    // traces shared one vertical space. A 1 px hairline separates lanes; there is no gap,
    // no card, no shadow (the spec states that as a prohibition because it otherwise
    // returns every time this file is regenerated).
    // Split the pinned set into what gets a TRACE and what arrives as a NUMBER. Same list,
    // two renderings — pin once, and the stack decides which form fits rather than
    // shrinking every lane until none of them reads.
    var canvasEl = $('chartCanvas');
    var plotPx = (canvasEl && canvasEl.clientHeight) || 0;
    var split = laneSplit(active.length, plotPx);
    // The lanes get the space the numeric rows do NOT take. In viewBox units, since that is
    // what the trace geometry is in.
    var laneH = plotPx ? (H * split.px / plotPx) : H;
    var order = pinOrder();
    var demoted = {};
    if (split.rows > 0) {
      var over = split.rows;
      for (var oi = order.length - 1; oi >= 0 && over > 0; oi--) {
        if (!ui.series[order[oi]]) continue;
        demoted[order[oi]] = true; over--;
      }
    }
    var traced = active.filter(function (s) { return !demoted[s.id]; });
    var numeric = active.filter(function (s) { return demoted[s.id]; });
    var N = traced.length;
    var lastY = [], laneChrome = [], numRows = [];
    traced.forEach(function (ser, si) {
      var bnd = laneBand(si, N, laneH);
      var r = ranges[ser.id], lo = r[0], hi = r[1], rng = (hi - lo) || 1;
      var yOf = function (v) {
        var f = Math.max(0, Math.min(1, (v - lo) / rng));
        return bnd.bot - f * (bnd.bot - bnd.top);
      };
      // Hairline between lanes, under everything.
      if (si > 0) html += '<line x1="0" y1="' + (bnd.top - LANE_GAP).toFixed(1) + '" x2="' + W +
        '" y2="' + (bnd.top - LANE_GAP).toFixed(1) + '" stroke="#1e2831" stroke-width="0.6" vector-effect="non-scaling-stroke"/>';
      var mmB = seriesMeans[ser.id];
      // MIN/MAX BAND, drawn UNDER the line. Each bucket knows the extremes the plant
      // reached over the sim time it covers, so a transient shorter than the sample
      // interval still shows — at 3600x a bucket spans several seconds of plant and the
      // line alone would step straight over a relief lift inside it. Emitted only where
      // the band is wider than the stroke: at 1x it collapses onto the line.
      var wide = false, up = [], dn = [];
      for (var bi = 0; bi < mmB.length; bi++) {
        var m2 = mmB[bi];
        if (m2.lo == null || !isFinite(m2.lo) || m2.hi == null || !isFinite(m2.hi)) continue;
        var xb = ((m2.t - t0) / span * PW).toFixed(1);
        var yh = yOf(m2.hi), yl = yOf(m2.lo);
        if (yl - yh > 1.0) wide = true;
        up.push(xb + ',' + yh.toFixed(1));
        dn.push(xb + ',' + yl.toFixed(1));
      }
      var hot = seriesAlarmed(ser);
      if (wide && up.length > 1) {
        html += '<polygon points="' + up.concat(dn.reverse()).join(' ') + '" fill="' + ser.c +
          '" fill-opacity="0.22" stroke="none"/>';
      }
      var ly = bnd.bot;
      var pts = mmB.map(function (m) {
        var x = (m.t - t0) / span * PW;
        var y = yOf(m.v); ly = y;
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
      html += '<polyline points="' + pts + '" fill="none" stroke="' + (hot ? lighten(ser.c) : ser.c) +
              '" stroke-width="' + (hot ? 2.2 : 1.4) + '" vector-effect="non-scaling-stroke"/>';
      /* THE DASHED TWIN — the physics side of a channel set to 'both' (#454). SAME HUE,
       * deliberately *(OWNER RULING, 2026-08-11, from the options presented)*: a second
       * colour would read as two unrelated channels sharing a box, where the dash reads as
       * "the same quantity, the other side" — which is the comparison the feature exists to
       * make. It also spends no second slot from a palette that already has 120 claimants.
       *
       * SAME HUE, LIGHTENED — and the lightening is not decoration, it is the whole reason
       * the twin is visible. MEASURED, or rather reasoned from the geometry and then seen in
       * a screenshot: on a healthy plant the two sides agree, so the twin's polyline lands on
       * the SAME PIXELS as the solid one. Painting colour X over colour X changes nothing —
       * a dash pattern is invisible when the thing showing through the gaps is the identical
       * colour. Tavg set to 'both' at hot full power drew exactly one visible line, so the
       * feature looked switched off at the moment it was most switched on. Lightening the
       * stroke makes the dashes read against the solid line where they coincide, and the two
       * still read as one quantity rather than as two unrelated channels.
       *
       * Drawn AFTER the solid line so the dashes sit on top. Only the solid trace gets the
       * min/max band: two overlapping 0.22-opacity polygons in one hue is mud, and the
       * physics side has no noise envelope worth the second draw. */
      var dashB = seriesDash[ser.id];
      if (dashB && dashB.length > 1) {
        html += '<polyline class="trace-phys" points="' + dashB.map(function (m) {
          return ((m.t - t0) / span * PW).toFixed(1) + ',' + yOf(m.v).toFixed(1);
        }).join(' ') + '" fill="none" stroke="' + lighten(ser.c) +
                '" stroke-width="1.1" stroke-dasharray="3,2.5"' +
                ' vector-effect="non-scaling-stroke"/>';
      }
      // Cursor value, not live value, while the pointer is over the plot. Nearest bucket
      // rather than an interpolation: a bucket IS a pixel, so the nearest one is what is
      // under the cursor, and inventing a value between two samples would be a reading the
      // plant never produced.
      var val = mmB.length ? mmB[mmB.length - 1].v : seriesVal(ser, chartBuf[chartBuf.length - 1], sideSolid(sideOf(ser)));
      var dval = dashB && dashB.length ? dashB[dashB.length - 1].v : null;
      var atCursor = false;
      if (chartCursor.frac != null && mmB.length) {
        var tc = t0 + chartCursor.frac * span;
        var best = null, bd = Infinity;
        for (var ci = 0; ci < mmB.length; ci++) {
          var d = Math.abs(mmB[ci].t - tc);
          if (d < bd) { bd = d; best = mmB[ci]; }
        }
        if (best) { val = best.v; atCursor = true; }
        // The twin follows the SAME cursor — a shared cursor that moved one of two traces
        // in one lane would be worse than none.
        if (dashB && dashB.length) {
          var db = null, dd = Infinity;
          for (var di = 0; di < dashB.length; di++) {
            var d2 = Math.abs(dashB[di].t - tc);
            if (d2 < dd) { dd = d2; db = dashB[di]; }
          }
          if (db) dval = db.v;
        }
      }
      lastY.push({ ser: ser, y: ly, hot: hot, val: val });
      // In-lane chrome: NAME top-left, RANGE top-right, VALUE in the fixed column. Each
      // lane prints its current range, so no lane's amplitude is ambiguous — which is what
      // makes per-lane autoscale honest. Emitted as HTML, not SVG: see laneBand.
      laneChrome.push({ ser: ser, top: bnd.top / H * 100, mid: (bnd.top + bnd.bot) / 2 / H * 100,
                        lo: lo, hi: hi, val: val, dval: dval, hot: hot, cursor: atCursor });
    });
    // The demoted channels, as numeric rows under the lanes. ~18 px each against a 44-56 px
    // lane, so a stack that cannot hold another trace can still hold several more numbers.
    numeric.forEach(function (ser) {
      var last = chartBuf[chartBuf.length - 1], sd = sideOf(ser), dsd = sideDashed(sd);
      // A demoted 'both' channel keeps BOTH figures. It is the same pinned channel in a
      // different rendering, so dropping the second side here would silently answer the
      // player's comparison with one number the moment the stack ran out of lanes.
      numRows.push({ ser: ser, val: seriesVal(ser, last, sideSolid(sd)),
                     dval: dsd ? seriesVal(ser, last, dsd) : null, hot: seriesAlarmed(ser) });
    });
    // Rewind-pick mode: mark every checkpoint inside the window as a jump target. FULL
    // HEIGHT across every lane, which is also the tier-1 event style #442 will use — a
    // plant-defining moment crosses the whole stack by construction.
    if (ui.rewindPick && service && service.checkpoints) {
      service.checkpoints.forEach(function (cp) {
        var t = cp.metadata.sim_time;
        if (t < t0 || t > t1) return;
        var x = ((t - t0) / span * PW).toFixed(1);
        html += '<line class="cp-mark" x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '" stroke="#7ab0ff" stroke-width="1" stroke-dasharray="3,3" vector-effect="non-scaling-stroke"/>' +
                '<circle cx="' + x + '" cy="6" r="2.5" fill="#7ab0ff"/>';
      });
    }
    // TIER-1 EVENTS: full height across every lane (#442, spec §8). A scram, a turbine trip,
    // a safety injection or a mode change is plant-defining — it is context for every lane
    // at once, so it crosses all of them. Tier 2 goes in the ribbon below; tier 3 is off.
    var soe = (RD.Events && RD.Events.inWindow(t0, t1)) || [];
    soe.forEach(function (ev) {
      if (ev.tier !== 1) return;
      var x = ((ev.t - t0) / span * PW).toFixed(1);
      var col = ev.actor === 'operator' ? '#5BB3C4' : '#D9A441';
      html += '<line class="soe-t1" x1="' + x + '" y1="0" x2="' + x + '" y2="' + H +
              '" stroke="' + col + '" stroke-width="1" stroke-opacity="0.55"' +
              (ev.actor === 'operator' ? ' stroke-dasharray="2,2"' : '') +
              ' vector-effect="non-scaling-stroke"/>';
    });
    /* WHERE THE RUN BEGAN — sim time zero *(OWNER, 2026-08-11: "The strip chart should have
     * a line to show the start of the sim at time=0.")*.
     *
     * IT IS A REAL BOUNDARY, NOT THE LEFT EDGE. The chart opens already holding 30 minutes
     * of trend, because a preset start is preseeded with a genuinely-run trace laid at
     * NEGATIVE sim time (applyPreseed: rows land on [t0 − CHART_RECORD_SEC, t0)). Measured
     * at T+10 s on a fresh load with the default 5-minute window: 290 s of the plot is that
     * synthetic history and 10 s is the run you are driving, with nothing marking the join.
     * This line is the join.
     *
     * Distinct from every other full-height mark by construction: checkpoints are blue
     * `3,3`, tier-1 events amber (plant) or cyan `2,2` (operator), the cursor solid white.
     * This is a neutral slate `6,3` — it is not an event and nobody did it, it is where the
     * record starts. Drawn UNDER the cursor so hovering still reads cleanly over it.
     *
     * Only when zero is actually in frame. Past the first `window` seconds of a run it
     * scrolls off the left, which is correct — it is a moment, not a permanent axis. */
    var zeroPct = null;
    if (t0 <= 0 && t1 >= 0) {
      var zx = ((0 - t0) / span * PW);
      zeroPct = zx / W * 100;
      html += '<line class="run-start" x1="' + zx.toFixed(1) + '" y1="0" x2="' + zx.toFixed(1) +
              '" y2="' + H + '" stroke="#8fa0ae" stroke-width="1" stroke-opacity="0.55"' +
              ' stroke-dasharray="6,3" vector-effect="non-scaling-stroke"/>';
    }
    // ONE line across every lane. Lanes are pixel-aligned on x by construction — they share
    // this viewBox and the same t0/span — so a single full-height line IS the shared cursor.
    if (chartCursor.frac != null) {
      var cx = (chartCursor.frac * PW).toFixed(1);
      html += '<line class="cursor-line" x1="' + cx + '" y1="0" x2="' + cx + '" y2="' + H +
              '" stroke="rgba(255,255,255,.30)" stroke-width="1" vector-effect="non-scaling-stroke"/>';
    }
    setHTML(svg, html);
    drawLanes(laneChrome, numRows, zeroPct);
    // low-profile x-axis
    // Seconds read fine over a 30-min window; a rewind-pick span can be many hours
    // of sim, where "−72000s" is unreadable. Switch to h:mm:ss past ten minutes.
    // Built as a STRING behind the changed-only guard: this used to clear and re-append
    // six <span>s EVERY frame, for labels that only change when the window scrolls past
    // a tick.
    // ROUND FIRST, THEN TEST FOR ZERO — the right-hand tick used to read `rel === 0` on a
    // float that is only zero in exact arithmetic. `t0 + span` reconstructs `t1` bit-exactly
    // whenever `t0` and `t1` are within a factor of two (Sterbenz), which is why this looks
    // fine on a long run and is broken for the first `window` seconds of every one: while
    // sim time is under the window `t0` is NEGATIVE, `span` carries a ~1e-13 residue, and the
    // test misses. Both signs then print "−0s" — a WIDER label than "0" — so the whole flex
    // row of ticks slid sideways as it flipped. MEASURED on the default 300 s window over a
    // fresh run: 749 of the first 3200 frames read "−0s" and the label flipped 424 times;
    // on the 1800 s window, 4790 of 18200 and 1552 flips. The rounded value is what the
    // label SHOWS, so it is what the zero test has to read. Round rather than let hms()
    // floor, too, or the same residue prints a 360 s tick as 00:05:59.
    var axLong = span > 600, axHtml = '';
    for (var i = 0; i <= 5; i++) {
      var rel = Math.max(0, t1 - (t0 + span * i / 5));   // seconds BEFORE now, never negative
      var relR = Math.round(rel);   // ROUND, not hms()'s floor — 359.99999999999994 is a 6:00 tick
      axHtml += '<span>' + (relR === 0 ? '0' : '−' + (axLong ? hms(relR) : relR + 's')) + '</span>';
    }
    setHTML($('chartXAxis'), axHtml);
    // (`chartWindowLbl` went with the scrubber strip on 2026-08-11 — it printed the window
    //  span a second time, one line under the x-axis that already ends in that number.)
    drawSoe(soe, t0, span);
  }

  /* THE SOE RIBBON (#442, spec §8) — tier-2 component events on the shared time axis.
   *
   * CLUSTERING IS THE FEATURE, not a refinement. A trip cascade fires a dozen events inside
   * two seconds — turbine trip, reactor trip, MSIV shut, AFW start — and in a 30-minute
   * window that is one pixel. Drawn individually they overlap into a single illegible mark
   * that says "something happened" and nothing else. Collapsed into a counted badge they say
   * "twelve things happened here", which is the readable form of the same truth, and they
   * separate on their own as the window narrows. This is the detail that decides whether the
   * feature survives a real transient.
   *
   * OPERATOR ACTIONS ARE VISUALLY DISTINCT FROM PLANT RESPONSES. The spec calls this the most
   * valuable teaching distinction the timeline can carry: a student reads their own hand in
   * the record and sees cause and effect directly rather than being told about it afterwards.
   * Cyan for what you did, amber for what the plant did — and the actor is stamped at
   * emission (#437), never inferred here from proximity.
   */
  var CLUSTER_PX = 6;                    // marks closer than this collapse into one badge
  function drawSoe(events, t0, span) {
    var host = $('soeRibbon'); if (!host) return;
    var t2 = events.filter(function (e) { return e.tier === 2; });
    if (!t2.length) { setHTML(host, ''); return; }
    var w = host.clientWidth || 400;
    var plotW = w * CHART_PLOT_FRAC;
    var clusters = [], cur = null;
    t2.forEach(function (ev) {
      var x = (ev.t - t0) / span * plotW;
      if (cur && x - cur.x <= CLUSTER_PX) { cur.n++; cur.evs.push(ev); if (ev.actor === 'operator') cur.op = true; }
      else { cur = { x: x, n: 1, evs: [ev], op: ev.actor === 'operator' }; clusters.push(cur); }
    });
    setHTML(host, clusters.map(function (c) {
      var label = c.evs.slice(0, 6).map(function (e) { return soeLabel(e); }).join(', ') +
                  (c.evs.length > 6 ? ' +' + (c.evs.length - 6) + ' more' : '');
      var pct = (c.x / w * 100).toFixed(2);
      // The cluster's component ref is the first one IN IT that has a ref, not the first
      // event's. A trip cascade leads with alarms, which carry none — taking evs[0].ref
      // blindly meant a badge containing a PORV open and an MSIV shut pointed at nothing,
      // and the highlight bus had nothing to light. Measured: every marker after a scram
      // came back with ref=null.
      var ref = null;
      for (var ri = 0; ri < c.evs.length && !ref; ri++) ref = c.evs[ri].ref || null;
      return '<span class="soe-mark' + (c.op ? ' op' : '') + (c.n > 1 ? ' many' : '') +
             '" style="left:' + pct + '%" title="' + esc(label) + '"' +
             ' data-soe-t="' + c.evs[0].t + '"' +
             (ref ? ' data-soe-ref="' + esc(ref) + '"' : '') +
             '>' + (c.n > 1 ? c.n : '') + '</span>';
    }).join(''));
  }
  // Event type -> the words an operator would use. Falls back to the raw type rather than
  // hiding an event nobody has named yet — an unlabelled mark still says WHEN.
  var SOE_WORDS = {
    scram: 'Reactor trip', turbine_trip: 'Turbine trip', safety_injection: 'Safety injection',
    station_blackout: 'Station blackout', ac_restored: 'AC restored', mode_change: 'Mode change',
    accumulator_discharge: 'Accumulators discharging', hydrogen_burn: 'Hydrogen burn',
    porv_open: 'PORV open', porv_shut: 'PORV shut', msiv_shut: 'MSIV shut',
    rcp_start: 'RCP start', rcp_stop: 'RCP stop', afw_start: 'AFW start', afw_stop: 'AFW stop',
    rhr_in_service: 'RHR in service', rhr_secured: 'RHR secured',
    ctmt_spray_start: 'Containment spray', ctmt_spray_stop: 'Containment spray off',
    condenser_lost: 'Condenser lost', alarm: 'Alarm', alarm_clear: 'Alarm clear'
  };
  function soeLabel(ev) {
    var w = SOE_WORDS[ev.type] || (ev.type.indexOf('cmd_') === 0 ? ev.type.slice(4).replace(/_/g, ' ') : ev.type);
    if (ev.type === 'alarm' && ev.detail && ev.detail.id) w = 'Alarm: ' + ev.detail.id;
    if (ev.type === 'mode_change' && ev.detail) w = 'Mode ' + ev.detail.from + ' → ' + ev.detail.to;
    return hms(Math.max(0, ev.t)) + '  ' + w + (ev.actor === 'operator' ? '  (you)' : '');
  }

  /* LANE CHROME — name, range and value, as HTML over the SVG (#440, spec §8).
   *
   * This replaces the floating value chips and their collision-spread. With traces
   * overlaid in one plot, chips had to be pushed apart so two lines close together did not
   * stack their numbers; there was a whole spreading algorithm for it, including a
   * measured chip height because a fixed percentage separated chips that still overlapped.
   * With one lane per indication the value belongs at the LANE's centre and two values can
   * never collide, so the algorithm is not simplified — it is unnecessary.
   *
   * FIXED-WIDTH NUMERIC COLUMN, TABULAR FIGURES (in shell.css). Otherwise values shift
   * horizontally as digit counts change and the whole stack jitters; on a display watched
   * for an hour that is worse than it sounds.
   *
   * Labels and values live INSIDE the lane, and the time axis is drawn once for the stack
   * — no title row, no per-lane axis, no legend block with swatches. Those are the
   * STRUCTURAL savings the ~220 px budget is made of; trimming padding alone does not get
   * there. The measured geometry is ui/test_panel/lane_reference.html.
   */
  function drawLanes(lanes, numRows, zeroPct) {
    var host = $('chartFloats'); if (!host) return;
    numRows = numRows || [];
    if (!lanes.length && !numRows.length) { setHTML(host, ''); return; }
    /* The run-start line's LABEL. Without it the line is one more unexplained vertical among
     * checkpoints, tier-1 events and the cursor — and the x-axis cannot disambiguate it,
     * because those ticks read seconds BEFORE NOW ("−300s … 0"), so the axis's own "0" is the
     * right-hand edge and means the opposite of this mark. HTML, in the floats layer, for the
     * reason stated on drawLanes: the SVG is preserveAspectRatio="none" over a fixed 400x120
     * box, so any <text> in it is squashed non-uniformly with the panel. */
    // …and it is DROPPED when channels have been demoted to numeric rows, because those
    // occupy the bottom strip it would otherwise sit in. The LINE still draws — only its
    // label goes, which is the right half to lose: the mark stays, the collision does not.
    var zeroTag = (zeroPct == null || numRows.length) ? '' :
      '<div class="run-start-tag" style="left:' + zeroPct.toFixed(2) + '%">T+0</div>';
    var h = lanes.map(function (L) {
      var s = L.ser;
      /* A 'both' lane prints BOTH readings in the one value column — the instrument first
       * and the physics under it, styled to match its dashed trace. The pair is the point
       * of the setting: overlapping traces tell you the two agree, but only the two numbers
       * tell you BY HOW MUCH, which is the question #449 raised (three steady-state
       * disagreements 20-400x larger than instrument lag). */
      return '<div class="lane-chrome' + (L.hot ? ' hot' : '') + '" data-ser="' + esc(s.id) +
               '" style="top:' + L.top.toFixed(2) + '%">' +
               '<span class="lane-name" style="color:' + s.c + '">' + mesc(s.label) + '</span>' +
               '<span class="lane-rng">' + mesc(s.fmt(L.lo)) + ' – ' + mesc(s.fmt(L.hi)) + '</span>' +
             '</div>' +
             '<div class="lane-value' + (L.hot ? ' hot' : '') + (L.cursor ? ' at-cursor' : '') +
               (L.dval == null ? '' : ' paired') + '" style="top:' + L.mid.toFixed(2) +
               '%;--cf:' + s.c + '">' + mesc(L.val == null ? '—' : s.fmt(L.val)) +
               (L.dval == null ? '' : '<span class="lane-value-phys">' + mesc(s.fmt(L.dval)) + '</span>') +
             '</div>';
    }).join('');
    // The numeric rows sit under the lanes in their own strip. They are the SAME pinned
    // list rendered differently, not a second feature — which is why they share this host
    // and the value column's alignment.
    if (numRows.length) {
      h += '<div class="lane-nums">' + numRows.map(function (R) {
        return '<div class="lane-num' + (R.hot ? ' hot' : '') + '" style="--cf:' + R.ser.c + '">' +
                 '<span class="lane-name" style="color:' + R.ser.c + '">' + mesc(R.ser.label) + '</span>' +
                 '<span class="lane-numv">' + mesc(R.val == null ? '—' : R.ser.fmt(R.val)) +
                   (R.dval == null ? '' : ' <span class="lane-value-phys">' + mesc(R.ser.fmt(R.dval)) + '</span>') +
                 '</span>' +
               '</div>';
      }).join('') + '</div>';
    }
    setHTML(host, h + zeroTag);
  }

  /* ==================================== CHART SETTINGS WINDOW (#454, 2026-08-11) ========
   * *(OWNER DIRECTIVE: "The strip chart option menu should be like the plant selection
   * menu. It should be large and pause the sim. … It should list all the indications you
   * can put on the chart with their current values. You should be able to choose the
   * indication or the physics value for each. Put a radial next to each value to let the
   * user choose so they could even choose both the indication and physics if they want.")*
   *
   * IT PAUSES, reversing the anchored popover this replaces. That panel argued you change
   * how you are watching a transient WHILE it runs; the argument does not survive the
   * change of size, because a full-screen overlay covers the board and that is precisely
   * the case openModal's hold exists for. Routing through openModal/closeModal also means
   * the resume is correct for free: closing releases only the `modal` hold, so a plant the
   * player had already stopped with ⏸ stays stopped.
   *
   * ONE SOURCE OF TRUTH, still. `ui.series` is written here exactly as the Indications tab
   * writes it, and syncPlotCells() carries the change back — the side is the only NEW
   * state, and it lives in `ui.seriesSide` where sideOf() reads it.
   *
   * Module level, not inside bindUI(): render() has to reach renderChartSettings the same
   * way it reaches renderIndications. Only the listeners live in bindUI. */
  var csRows = [];                 // { ser, row, iv, pv, ib, pb } — node refs, built once
  function csOpen() { return !$('chartOverlay').hidden; }
  function buildChartSettings() {
    var list = $('coList'); if (!list) return;
    csRows = [];
    // Mirror the live window ladder rather than hard-coding rungs: the labels change with
    // time acceleration (syncChartWindows rewrites them), so a static copy would go stale.
    var src = $('graphWindow'), dst = $('chartOptsWin');
    if (src && dst) dst.innerHTML = src.innerHTML;
    var soe = $('coSoe'); if (soe) soe.checked = !ui.soeOff;
    var grp = null, html = '';
    prof().series.forEach(function (ser) {
      if (ser.grp !== grp) {
        if (grp !== null) html += '</div>';
        grp = ser.grp;
        html += '<div class="cs-grp"><h5>' + esc(grp || '') + '</h5>';
      }
      var av = sideAvail(ser);
      // A side this series does not have gets a DISABLED selector and a dash, not a
      // missing cell: the column has to stay readable down the list, and "this channel
      // has no instrument" is itself worth seeing — it is how the physics-only quantities
      // (decay heat, void, reactivity) announce themselves.
      html += '<div class="cs-row" data-cs="' + esc(ser.id) +
              '" data-cs-label="' + esc((ser.label || '').toLowerCase()) + '">' +
              '<span class="cs-name">' + esc(ser.label) + '</span>' +
              csPick(ser, 'ind', av.ind) + csPick(ser, 'phys', av.phys) +
              '</div>';
    });
    if (grp !== null) html += '</div>';
    setHTML(list, html);
    list.querySelectorAll('.cs-row').forEach(function (row) {
      var id = row.getAttribute('data-cs'), ser = seriesById(id);
      if (!ser) return;
      csRows.push({ ser: ser, row: row,
        ib: row.querySelector('[data-cs-side="ind"]'), pb: row.querySelector('[data-cs-side="phys"]'),
        iv: row.querySelector('[data-cs-val="ind"]'), pv: row.querySelector('[data-cs-val="phys"]') });
    });
    syncChartSettings();
    applyCsFilter();
    if (latest) renderChartSettings(latest);
  }
  function csPick(ser, side, avail) {
    return '<label class="cs-pick' + (avail ? '' : ' na') + '">' +
           '<input type="checkbox" data-cs-side="' + side + '"' + (avail ? '' : ' disabled') + '>' +
           '<span class="cs-val" data-cs-val="' + side + '">—</span></label>';
  }
  /* The selectors are DERIVED from (ui.series, ui.seriesSide) through sideOf, never held
   * separately. That is what keeps this window agreeing with the Indications tab's plain
   * tickbox: ticking a channel there gives it its default side, and this reads that back
   * rather than remembering something of its own. */
  function syncChartSettings() {
    csRows.forEach(function (r) {
      var side = sideOf(r.ser);
      var on = { ind: side === 'ind' || side === 'both', phys: side === 'phys' || side === 'both' };
      if (r.ib) r.ib.checked = !!on.ind;
      if (r.pb) r.pb.checked = !!on.phys;
      r.row.classList.toggle('on', !!side);
    });
    var n = Object.keys(ui.series).filter(function (k) { return ui.series[k]; }).length;
    txt($('coCount'), n + (n === 1 ? ' channel plotted' : ' channels plotted'));
  }
  /* THE VALUES, LIVE — requirement 3. They come from the Indications tab's OWN functions
   * rather than from anything written here, because "matches the Indications tab" is the
   * requirement and a second formatter is how two surfaces start disagreeing about the
   * same channel. seriesLive() reads the instrument (or the demand, or truth where a
   * series has nothing else); seriesTrue() prefers the curated physics prose. */
  function renderChartSettings(s) {
    if (!csRows.length || !csOpen()) return;
    csRows.forEach(function (r) {
      var av = sideAvail(r.ser);
      // `title` as well as text: a curated physics reading can be two facts long and the
      // column ellipsises the tail, so hovering has to be able to give it back.
      if (r.iv && av.ind) {
        var iv = seriesLive(r.ser, s);
        var ishown = (iv == null || /NaN|Infinity/.test(iv)) ? '—' : iv;
        if (r.iv.textContent !== ishown) { r.iv.textContent = ishown; r.iv.title = ishown; }
      }
      if (r.pv && av.phys) {
        var pv = seriesTrue({ ser: r.ser, phys: indPhysIdx[r.ser.id] || null }, s);
        var pshown = (pv == null || /NaN|Infinity/.test(pv)) ? '—' : pv;
        if (r.pv.textContent !== pshown) { r.pv.textContent = pshown; r.pv.title = pshown; }
      }
    });
  }
  function applyCsFilter() {
    var q = (($('coFilter') || {}).value || '').trim().toLowerCase();
    var list = $('coList'); if (!list) return;
    var rows = list.querySelectorAll('[data-cs-label]');
    for (var i = 0; i < rows.length; i++) {
      rows[i].style.display = (!q || rows[i].getAttribute('data-cs-label').indexOf(q) !== -1) ? '' : 'none';
    }
    // A group whose every row is filtered out should not leave its heading behind.
    var grps = list.querySelectorAll('.cs-grp');
    for (var g = 0; g < grps.length; g++) {
      var any = grps[g].querySelectorAll('[data-cs-label]'), vis = 0;
      for (var k = 0; k < any.length; k++) if (any[k].style.display !== 'none') vis++;
      grps[g].style.display = vis ? '' : 'none';
    }
  }
  function openChartSettings() { buildChartSettings(); openModal('chartOverlay'); }
  function closeChartSettings() { closeModal('chartOverlay'); }

  // ============================================================ pause / resume
  /* ONE way to stop the plant, and it remembers WHY (#439, spec §1).
   *
   * There used to be four copies of `service.stop(); playBtn.textContent='▶';
   * playBtn.classList.add('paused')` — scenario start, rewind pick, plant switch and
   * reset — and every new pausing surface was a fifth. Worse, none of them recorded a
   * REASON, and two downstream rules need one: a modal must not resume a plant the
   * player had already paused by hand, and the chart must not rescale during rewind
   * review (#441) — both are questions about why we are stopped, not whether.
   *
   * CLOSING A MODAL NEVER RESUMES (spec §13). `clearPause` drops the reason and leaves
   * the plant stopped; the play button is the only thing that starts it. That is
   * deliberate: coming back from Settings into a running plant you stopped looking at
   * is how an unwatched transient happens, and the button is one click away.
   */
  var pauseWhy = {};                     // reason -> true, for anything currently holding the plant
  function syncPlayBtn() {
    var b = $('playBtn'); if (!b) return;
    var run = !!service.running;
    b.textContent = run ? '⏸' : '▶';
    b.classList.toggle('paused', !run);
    if (run) b.classList.remove('attention');
    /* THE BOARD HAS TO BE TOLD, because pausing is exactly the moment it stops being
     * told anything *(OWNER DIRECTIVE, 2026-08-11: "All animations should stop when the
     * sim is paused.")*.
     *
     * The freeze used to ride on render(), reading `metadata.running` off the snapshot.
     * But pausing STOPS THE BROADCAST, so no snapshot arrives and render() never runs:
     * the board kept its last running frame and animated on. MEASURED, paused: 106 of
     * 112 running animations, 105 of them inside the board stage that `.bd-frozen` is
     * supposed to cover — the rule was right and nothing ever added the class. The one
     * place it appeared to work was startup, where an unrelated first paint happened to
     * carry running:false.
     *
     * A pause is a UI event, not a plant event, so it is pushed here rather than waited
     * for. render() still sets it too — that path is correct when a snapshot does arrive. */
    try {
      var B = window.RD && RD.PwrBoard;
      if (B && B.setRunning && B.isMounted && B.isMounted()) B.setRunning(run);
    } catch (e) {}
  }
  function pauseSim(reason) {
    pauseWhy[reason || 'user'] = true;
    if (service.running) service.stop();
    syncPlayBtn();
  }
  function clearPause(reason) { delete pauseWhy[reason || 'user']; }   // NOT a resume — see above
  function pausedFor(reason) { return !!pauseWhy[reason]; }
  function resumeSim() {
    pauseWhy = {};                       // the player said go: every hold is released
    if (!service.running) service.start();
    syncPlayBtn();
  }
  /* MODAL class (spec §1): covers the board, so it pauses. One reason for all of them —
   * they are mutually exclusive in practice, and since closing never resumes, a shared
   * key cannot leak a hold. Use these instead of touching `.hidden` directly, or the
   * next modal added will be the one that forgets. */
  function openModal(id) {
    var wasRunning = service.running;
    pauseSim('modal');
    // Repaint once on the way down, or the board behind the modal keeps the last
    // running frame and the veil that says PAUSED never appears — which is the only
    // cue, when the modal closes, that the plant is stopped and waiting for ▶.
    if (wasRunning) { latest = service.assembleSnapshot(); render(latest); }
    $(id).hidden = false;
  }
  /* Closing releases THIS hold, and resumes only if no other hold is left
   * *(OWNER DIRECTIVE, 2026-08-11: "Sim should start running not paused.")*.
   *
   * This reverses the old "closing never resumes" rule, which existed to protect a
   * paused-at-start plant that no longer exists. The reversal is SAFE BECAUSE THE HOLDS
   * ARE NAMED: an explicit ▶/⏸ press sets `user`, a modal sets `modal`, so closing a
   * modal over a plant the player deliberately paused finds `user` still standing and
   * leaves it stopped. A single boolean could not tell those apart, which is why the
   * reason map is what makes this rule expressible at all. */
  function closeModal(id) {
    $(id).hidden = true;
    releaseHold('modal');
  }
  /* RELEASE A HOLD AND START IF NOTHING ELSE IS STANDING — closeModal's tail, extracted
   * *(OWNER, 2026-08-11: "When i close the plant menu after starting the sim the sim should
   * start playing. it currently starts paused.")*.
   *
   * THE HOLDS SPLIT IN TWO AND ONLY ONE KIND WAS EVER RELEASED. `modal`, `plant_change` and
   * `reset` are TRANSIENT and mechanical — they cover a window being up or a rebuild being
   * half done, and they should end when that does. `user` and `content` are DELIBERATE:
   * someone (the player, or a scenario) decided the plant should be stopped, and only they
   * may lift it. Only `modal` was ever released; the other two were taken with pauseSim()
   * and then cleared by nothing except the ▶ button, which wipes the whole map.
   * (`rewind` is left on plain clearPause deliberately — cancelling the picker returning you
   * to a running plant is a separate behaviour question nobody has asked for.)
   *
   * That is the reported bug, and it is an ORDERING one. Free Play runs
   * `closeMissionSelect(); switchEngine(...)`: the close correctly releases `modal` and
   * starts the plant, and the switch immediately takes `plant_change` for the rebuild and
   * keeps it for ever. The plant ran for a few milliseconds and then stopped for good, so
   * the modal logic looked broken when it was working perfectly.
   *
   * Extracted rather than copied to the three call sites: a hold whose release is spelled
   * out at each site is a hold that will be taken somewhere new and not released, which is
   * exactly how this one got here. */
  function releaseHold(reason) {
    clearPause(reason);
    if (!Object.keys(pauseWhy).length && !service.running) { service.start(); syncPlayBtn(); }
  }

  // ============================================================ commands
  function cmd(c) {
    // A chat interaction click (e.g. the maintenance tag) is the player acting —
    // release the transcript's reading dwell so the exchange answers promptly.
    if (c && c.action === 'instructor_interact') chatState.nextAt = 0;
    var r = service.handleCommand(c);
    var cmdT = latest && latest.metadata ? latest.metadata.sim_time : 0;
    diag.command(cmdT, c, !!(r && r.type === 'blocked'), !!(r && r.type === 'error'));
    // The operator half of the SOE stream (#437). Actor is KNOWN here, not inferred:
    // this is the player acting. Blocked commands are dropped inside command().
    if (RD.Events) RD.Events.command(cmdT, c, !!(r && r.type === 'blocked') || !!(r && r.type === 'error'));
    TEL.command(c, !!(r && r.type === 'blocked'));
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

  // ====================================================== automation-channel readers
  // Small readers over snapshot.automation (the in-stack channel runtime in the Control
  // Layer). Still used by the 1/M panel and the rod AUTO/MANUAL actions; what is gone is
  // the tab that was the only thing they were written for — see below.
  function autoSnap() { return latest || service.assembleSnapshot(); }
  function autoChans(s) { return (s && s.automation && s.automation.channels) || []; }
  function autoChan(s, id) {
    var ch = autoChans(s);
    for (var i = 0; i < ch.length; i++) if (ch[i].id === id) return ch[i];
    return null;
  }

  // THE AUTOMATE TAB IS GONE (#439). buildAutomate/renderAutomate/bindAutomate lived here
  // for ~150 lines behind a pane that shell.html never had: no tab button, no #autoList, so
  // buildAutomate returned on its first line every time it was called and the other two were
  // unreachable. The automation channels themselves are alive and are operated from the BOARD
  // (the AUTO buttons on each card); this was a second, dead face over the same snapshot.
  //
  // The three call sites stay as no-ops rather than being hunted down — see the stubs below.
  function buildAutomate() {}
  function renderAutomate() {}
  function bindAutomate() {}

  // ============================================================ session diagnosis (Dev tab)
  // Records the session — sampled true state, alarm transitions, scram edges and every
  // issued command; "Diagnosis JSON" bundles it with a full service.saveState() so an AI
  // (or a human) can replay what happened, and the in-sim bug report posts the same thing.
  //
  // THE RECORDER ITSELF LIVES IN ui/diag_recorder.js (RD.DiagRecorder), not here. This file
  // is browser-only, so while the recorder was in it nothing in test/ could reach the code
  // — which is how #432 shipped: sampling once per BROADCAST, i.e. one row per 180 s at
  // 3600×, under a manifest hardcoded to `sample_hz: 1`. What stays here is the wiring:
  // subscribing it, the Dev-tab readout, and gathering the ids and objects only the UI can
  // reach. `test/run_diag_bundle.js` drives the other file directly.
  var diag = RD.DiagRecorder.create({
    onEvent: function (t, type, detail) {
      // Every recorded scram passes through the recorder, so hooking it here covers each
      // site that reports one without a second call to keep in step.
      if (type === 'scram') TEL.milestone('scram', t);
      // …and the SAME hook feeds the sequence-of-events stream (#437). The recorder is
      // the only detector of alarm and scram edges in the app; RD.Events subscribes to
      // it rather than diffing `s.alarms` a second time, which is precisely the
      // two-samplers-of-one-truth shape that #432 was.
      if (RD.Events) RD.Events.fromRecorder(t, type, detail);
    }
  });
  // ======================================================== usage data (aggregate)
  // The adapter for site/telemetry.js. It exists so the emit points scattered through
  // this file stay one-line calls and all the state — what has already been reported,
  // when the session started — lives in one place.
  //
  // EVERY METHOD IS A NO-OP unless the player granted consent AND a deploy stamped an
  // endpoint; telemetry.js enforces that, and this layer never second-guesses it. It
  // also never throws: usage data is the least important thing in this application and
  // must not be able to interrupt the plant, so every call is wrapped.
  //
  // It rides the EXISTING session recorder rather than adding a second set of probes.
  // diagEvent/diagReset/diagTick already sit at exactly the moments worth reporting,
  // and a parallel set of hooks would be a second thing to keep in step with the first.
  var TEL = (function () {
    // A ONE-SHOT LATCH MUST LIVE IN THE SAME STORAGE AS THE IDENTITY IT IS ONE-SHOT FOR.
    // These were plain variables — scoped to a page LOAD — while the session id they are
    // reported against lives in sessionStorage and is scoped to the TAB. A reload therefore
    // re-armed every milestone and re-emitted it under an UNCHANGED session id. Measured
    // 2026-08-09 in a browser: reloading re-fires plant_mode(1) and on_grid, session id
    // identical; the live data carried on_grid twice for one real session. That makes
    // "how many sessions reached the grid" uncountable, which is the only thing the
    // milestone is for. Same storage, same lifetime, and the duplicate cannot recur.
    //
    // sessionStorage refusal is not an error here: the catch falls back to in-memory, which
    // is exactly the old behaviour, and a browser that refuses storage has no stable session
    // id to double-count against anyway.
    var SEEN_KEY = 'rd_telemetry_seen', MODE_KEY = 'rd_telemetry_lastmode';
    function ssGet(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
    function ssSet(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) { /* memory only */ } }
    function loadSeen() { try { return JSON.parse(ssGet(SEEN_KEY) || '{}') || {}; } catch (e) { return {}; } }

    var seen = loadSeen();    // one-shot milestones, latched for the life of the SESSION ID
    var lastMode = (function () { var v = ssGet(MODE_KEY); return v === null ? null : Number(v); }());
    var lastPanel = null;
    var startedAt = 0, mission = null, ended = false;
    // session_start fires during BOOT, which on a first visit is before the consent
    // prompt has been answered — so it would be dropped, and first visits are exactly
    // the sessions worth having. Hold the facts locally (the app knows them anyway)
    // and emit once an answer exists. Nothing is queued inside telemetry.js while
    // consent is undecided, so its invariant is untouched.
    var pendingStart = null;

    function api() { try { return (window.RD && RD.Telemetry) || null; } catch (e) { return null; } }
    // Returns whether the event was ACCEPTED, which the held session_start depends on:
    // clearing it on a refusal would silently lose the row it exists to preserve.
    function ev(name, props) {
      var t = api(); if (!t) return false;
      try { return t.event(name, props) === true; } catch (e) { return false; }   // never break the sim
    }
    function since(ms) { return Math.max(0, Math.round((Date.now() - ms) / 1000)); }

    return {
      sessionStart: function (reason, meta) {
        // `seen` and `lastMode` are DELIBERATELY NOT reset here. They latch against the
        // session ID, and this function does not change it — a reload calls sessionStart
        // while the id in sessionStorage stays put, so clearing them here is exactly what
        // emitted on_grid a second time under one session. A plant reset inside one tab is
        // not a new visitor either: "sessions that reached the grid" has to count each
        // session once, or the number means nothing.
        mission = null; ended = false;
        startedAt = Date.now();
        pendingStart = {
          plant: ui.plant,
          initial_state: (meta && meta.initial_state) || ui.initState || 'unknown',
          channel: (typeof window.RD_CHANNEL === 'string') ? window.RD_CHANNEL : 'dev',
        };
        this.consentAnswered();                   // a no-op until an answer exists
        if (reason === 'scenario' && meta && meta.scenario_id) {
          mission = { id: meta.scenario_id, at: Date.now() };
          ev('mission_start', { id: meta.scenario_id });
        }
      },

      // Called by sessionStart and again by the consent prompt when it is answered.
      // Emitting is idempotent: the held facts are cleared on the first success.
      consentAnswered: function () {
        var t = api();
        if (!pendingStart || !t) return;
        try { if (!t.granted()) return; } catch (e) { return; }
        // Latched on the INITIAL STATE, not merely on the session. A reload re-runs
        // sessionStart and would file a second identical row under the same session id;
        // deliberately switching to a different starting condition is a fact worth keeping,
        // and still records. Same sessionStorage lifetime as the milestone latch, same
        // reason. NOTE for queries: count sessions with count(DISTINCT blob4), never
        // count(session_start) — one session can legitimately carry several.
        var k = 'start:' + pendingStart.initial_state;
        if (seen[k]) { pendingStart = null; return; }
        if (ev('session_start', pendingStart)) {
          seen[k] = true;
          ssSet(SEEN_KEY, JSON.stringify(seen));
          pendingStart = null;
        }
      },

      // Action NAME only, never its value: "set_rod_position" is a usage fact,
      // "set_rod_position 143" is a recording of what someone did.
      command: function (c, blocked) {
        if (!c || !c.action) return;
        ev('command', { action: String(c.action), blocked: !!blocked });
      },

      panel: function (id) {
        if (!id || id === lastPanel) return;      // a re-click is not a visit
        lastPanel = id;
        ev('panel_open', { panel: String(id) });
      },

      milestone: function (name, simT) {
        if (seen[name]) return;                   // latched: first crossing only
        seen[name] = true;
        ssSet(SEEN_KEY, JSON.stringify(seen));    // survives a reload; see SEEN_KEY above
        ev('milestone', { name: name, sim_seconds: Math.round(simT || 0) });
      },

      // Driven from diagTick, so it sees every snapshot the recorder does.
      tick: function (s) {
        if (!s || !s.true_state) return;
        var ts = s.true_state, t = (s.metadata && s.metadata.sim_time) || 0;

        // THE FUNNEL. plant_mode is the engine's own derived commercial mode (1-6),
        // so "how far did they get" carries no threshold of mine.
        if (typeof ts.plant_mode === 'number' && ts.plant_mode !== lastMode) {
          lastMode = ts.plant_mode;
          ssSet(MODE_KEY, String(lastMode));      // same reason as SEEN_KEY: survive a reload
          ev('plant_mode', { mode: ts.plant_mode, sim_seconds: Math.round(t) });
        }
        if (typeof ts.mwe_output === 'number' && ts.mwe_output > 0) this.milestone('on_grid', t);
        if (ts.fuel_damaged) this.milestone('core_damage', t);   // engine-latched, not inferred

        if (mission && s.instructor && s.instructor.level_complete) {
          ev('mission_complete', { id: mission.id, seconds: since(mission.at) });
          mission = null;
        }
      },

      // Called once, from pagehide. sendBeacon is the only transport that survives
      // the page going away, and session_end is the most useful row in the set.
      end: function () {
        if (ended) return;
        ended = true;
        if (mission) ev('mission_abandon', { id: mission.id, seconds: since(mission.at), beat: 0 });
        // sim_seconds > 0 IS "they pressed play" — the clock only advances while
        // running, so no separate flag is needed (and the one that was here read
        // false on a session that had obviously run: play is not a dispatched command).
        ev('session_end', {
          seconds: startedAt ? since(startedAt) : 0,
          sim_seconds: Math.round((latest && latest.metadata && latest.metadata.sim_time) || 0),
          last_panel: lastPanel || 'none',
        });
        var t = api(); if (t) { try { t.flush(true); } catch (e) {} }
      },
    };
  }());

  function diagReset(reason, meta) {
    var t = latest && latest.metadata ? latest.metadata.sim_time : 0;
    diag.reset(reason, meta, t, ui.plant);
    // The SOE stream is per-plant for the same reason the recording is: the watch table
    // and the seeded edge state are the plant's, so carrying either across a plant change
    // would compare one reactor's booleans against another's.
    if (RD.Events) RD.Events.reset(t, ui.plant);
    TEL.sessionStart(reason, meta);
  }
  function diagTick(s) {
    TEL.tick(s);          // before the early return: usage data does not depend on the recorder
    // `pendingDiagFine` is this broadcast's share of the fine sub-samples, set in the
    // three-way split in renderNow. Consumed here and cleared, so a broadcast that never
    // reached the render path cannot hand the same rows over twice.
    var fine = pendingDiagFine; pendingDiagFine = null;
    diag.tick(s, fine);
    // Plant-state edges for the SOE stream (#437) ride this same synchronous subscriber:
    // it sees every broadcast the recorder does, and it is NOT inside the rAF paint —
    // the seam #432 was fixed on. `diag.tick` runs first so a rewind truncation lands
    // before this broadcast's edges are compared against it.
    if (RD.Events) RD.Events.observe(s);
  }
  // The readout half of diagTick, called from renderNow so it lands inside the paint
  // cycle with every other DOM write.
  function diagReadout() {
    var r = diag.readout();
    if (!r) return;
    txt($('diagSessionInfo'), r.plant + ' · ' + r.reason + ' · ' +
      r.t.toFixed(0) + ' s · ' + r.samples + ' samples');
  }
  // Everything the recorder cannot reach on its own: the ids the UI holds, the seed, the
  // perf summary and the save state. The SCHEMA is in ui/diag_recorder.js, where a Node
  // gate can see it; this is the reaching-around.
  function buildDiagBundle() {
    if (!diag.active()) return null;
    var s = latest || service.assembleSnapshot();
    var notesEl = $('diagNotes'), notes = notesEl && notesEl.value.trim();
    return diag.build({
      snapshot: s,
      design_version: s.metadata.design_version || null,
      engine_key: ui.engineKey, initial_state: ui.initState,
      scenario_id: (s.instructor && s.instructor.scenario_id) || null,
      follow_procedure_id: (s.instructor && s.instructor.follow && s.instructor.follow.procedure_id) || null,
      seed: service.seed,
      // PERFORMANCE RIDES ALONG (2026-08-08). "It flickers on some PCs" is unanswerable
      // without it — compute-bound, render-bound and neither-of-those look identical to the
      // person reporting, and the machine it happened on is the only place the numbers
      // exist. Cheap to carry: one object of percentiles, not a trace.
      performance: (function () { try { return RD.Perf ? RD.Perf.summary() : null; } catch (e) { return null; } }()),
      snapshot_end: service.saveState(),
      notes: notes || null
    });
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
  // Open the feedback form (#438) — callable from the header button, the Settings entry,
  // and the level-complete prompt. Fills the build stamp and the attachment DISCLOSURE:
  // the concrete contents of what "Attach this session's recording" would send, read from
  // the recorder at open time so the numbers describe the session being reported.
  function openFeedback() {
    $('fbStatus').textContent = '';
    $('fbVer').textContent = (typeof window.RD_VERSION === 'string' && window.RD_VERSION)
      ? 'Build ' + window.RD_VERSION + ' — quoting this in a bug report says exactly which version you were on.'
      : '';
    var ro = diag && diag.readout && diag.readout();
    if (ro && ro.samples) {
      txt($('fbAttachSum'),
        'Attached: ' + String(ro.plant || '').toUpperCase() + ' session — T+' + hms(ro.t) +
        ' of plant readings (' + ro.samples + ' samples), ' + ro.events + ' alarm/plant events, ' +
        ro.commands + ' commands you issued, and an end-of-session snapshot. Nothing about you ' +
        'or your device. Untick it to send just your message.');
    }
    openModal('feedbackOverlay');
  }
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
    // gpm → frac/s on the declared 7,500 gal (#408). The old /1000 was the retired
    // currency: typing 30 gpm commanded 0.03 frac/s ≈ 13,500 gpm, unclamped (see issue).
    'charge-set': function () { cmd({ action: 'set_charging_flow', normalized: inputVal('chargeSet') / GPM_PER_FRAC }); },
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
    'save': function () { downloadSave(); }, 'load': function () { $('loadFile').click(); }, 'reset': function () { doReset(); }, 'export-csv': function () { exportCsv(); exportSoe(); },
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
      var name = b.getAttribute('data-tab');
      if (name !== 'instructor') lastToolsTab = name;   // where the Instructor hands back to
      selectTab(name);
      TEL.panel(name);   // which parts of the board get used at all
      // (the repaint-on-reveal and the state save both live in selectTab now)
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
    $('instructorCard').addEventListener('click', function (e) {
      var c = $('instructorCard');
      // "New message below" (#439): scroll to it and clear the marker.
      if (e.target.closest && e.target.closest('#instrNewBelow')) {
        var cur = $('instrCurrent');
        if (cur) cur.scrollTop = cur.scrollHeight;
        $('instrNewBelow').hidden = true;
        return;
      }
      if (c.classList.contains('mini')) { restoreInstructor(); return; }
      if (c.classList.contains('collapsed')) toggleInstructorCard();
    });
    // Reading down to the newest line clears the marker without a click on it.
    var instrCur = $('instrCurrent');
    if (instrCur) instrCur.addEventListener('scroll', function () {
      if ((instrCur.scrollHeight - instrCur.scrollTop - instrCur.clientHeight) <= 24) {
        var nb = $('instrNewBelow'); if (nb) nb.hidden = true;
      }
    });
    // generic segmented active state (delegated so rebuilt controls keep working)
    document.body.addEventListener('click', function (e) {
      var btn = e.target.closest('.seg button'); if (!btn) return;
      var seg = btn.closest('.seg'); seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); }); btn.classList.add('on');
    });
    $('playBtn').addEventListener('click', function () {
      if (service.running) pauseSim('user'); else resumeSim();
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
    // ONE delegated handler for every plot checkbox in the Tools block, wherever it lives —
    // the plot list, the Physics tab's column, the Indications tab's column. Bound on the
    // tab body rather than on each pane because those panes are rebuilt on a plant change
    // and a per-pane listener would be re-attached (or silently lost) each time.
    var tabBody = document.querySelector('.tab-body');
    if (tabBody) tabBody.addEventListener('change', function (e) {
      var cb = e.target.closest('input[data-series]'); if (!cb) return;
      var sid = cb.getAttribute('data-series');
      ui.series[sid] = cb.checked;
      // UNTICKING ANYWHERE CLEARS THE SIDE (#454). The plain tickbox here and the two
      // selectors in the chart-settings window are two ways to reach one setting, so they
      // must leave the same state behind: "not plotted" means no side, and re-ticking gives
      // the channel its default rather than silently restoring a choice made in the other
      // surface an hour ago. Ticking sets nothing — an absent side IS the default.
      if (!cb.checked) delete ui.seriesSide[sid];
      syncPlotCells();     // the same series may be listed on more than one tab
      drawChart();
    });
    // The row carries the System Scanner hint, and the checkbox sits inside the row — so a
    // click meant for the tickbox would also open the inspector over the panel you are
    // ticking. Stop it at the cell.
    if (tabBody) tabBody.addEventListener('click', function (e) {
      if (e.target.closest('.plot-cell')) e.stopPropagation();
    }, true);
    $('graphWindow').addEventListener('click', function (e) { var b = e.target.closest('[data-win]'); if (!b) return; ui.window = +b.getAttribute('data-win'); chartRange = {}; drawChart(); });

    $('chartOptsBtn').addEventListener('click', function () { openChartSettings(); });
    $('chartOptsClose').addEventListener('click', closeChartSettings);
    $('chartOverlay').addEventListener('click', function (e) {
      if (e.target === $('chartOverlay')) closeChartSettings();
    });
    $('coFilter').addEventListener('input', applyCsFilter);
    $('chartOptsWin').addEventListener('click', function (e) {
      var b = e.target.closest('[data-win]'); if (!b) return;
      ui.window = +b.getAttribute('data-win');
      chartRange = {};
      // Keep the on-chart ladder in step — they are two views of one setting.
      var src = $('graphWindow').querySelectorAll('[data-win]');
      for (var i = 0; i < src.length; i++) src[i].classList.toggle('on', src[i].getAttribute('data-win') === b.getAttribute('data-win'));
      var dst = $('chartOptsWin').querySelectorAll('[data-win]');
      for (var j = 0; j < dst.length; j++) dst[j].classList.toggle('on', dst[j].getAttribute('data-win') === b.getAttribute('data-win'));
      drawChart();
    });
    $('chartOverlay').addEventListener('change', function (e) {
      var box = e.target.closest('input[data-cs-side]');
      if (box) {
        var row = box.closest('.cs-row'), ser = seriesById(row.getAttribute('data-cs'));
        if (!ser) return;
        /* READ BOTH BOXES AND DERIVE — do not try to mutate the side by name from the one
         * that changed. Neither ticked is "not plotted", which has to clear `ui.series` as
         * well as the side, and only looking at the pair can tell that from "the other one
         * is still on". */
        var wantInd = !!(row.querySelector('[data-cs-side="ind"]') || {}).checked;
        var wantPhys = !!(row.querySelector('[data-cs-side="phys"]') || {}).checked;
        if (!wantInd && !wantPhys) {
          ui.series[ser.id] = false;
          delete ui.seriesSide[ser.id];
        } else {
          ui.series[ser.id] = true;
          ui.seriesSide[ser.id] = (wantInd && wantPhys) ? 'both' : wantInd ? 'ind' : 'phys';
        }
        syncPlotCells();
        syncChartSettings();
        chartRange = {};    // the union fit changes when a side is added or dropped
        drawChart();
        return;
      }
      if (e.target.id === 'coSoe') {
        ui.soeOff = !e.target.checked;
        var rib = $('soeRibbon'); if (rib) rib.hidden = !!ui.soeOff;
        drawChart();
      }
    });
    /* THE HIGHLIGHT BUS's consumers (#444, spec §7). Each surface says what it is pointing
     * at; the bus decides what lights. NONE of them lights the element under the pointer —
     * that is the ruling, and it is also what makes hover teach the control/indication
     * distinction for free: nothing lights under the cursor means "this is a readout".  */
    var indList = $('indicationsList');
    if (indList) {
      indList.addEventListener('mouseover', function (e) {
        var row = e.target.closest('.num-line'); if (!row) return;
        var cb = row.querySelector('input[data-series]'); if (!cb) return;
        RD.Highlight.enter(RD.Highlight.forSeries(cb.getAttribute('data-series')));
      });
      indList.addEventListener('mouseleave', function () { RD.Highlight.clearHover(); });
      indList.addEventListener('click', function (e) {
        var row = e.target.closest('.num-line'); if (!row) return;
        if (e.target.closest('.plot-cell')) return;        // the checkbox is its own gesture
        var cb = row.querySelector('input[data-series]'); if (!cb) return;
        RD.Highlight.pin(RD.Highlight.forSeries(cb.getAttribute('data-series')));
      });
      /* THE UI RELATION (spec §7): hovering a trend checkbox highlights what it CHANGES —
       * the chart. And when the channel is already plotted it highlights THAT LANE rather
       * than the whole chart, because once several are up "which line is this one" is the
       * more useful answer. */
      indList.addEventListener('mouseover', function (e) {
        var cell = e.target.closest('.plot-cell'); if (!cell) return;
        var cb = cell.querySelector('input[data-series]'); if (!cb) return;
        var id = cb.getAttribute('data-series');
        var lane = ui.series[id] ? document.querySelector('.lane-chrome[data-ser="' + id + '"]') : null;
        var chart = document.querySelector('.strip-chart');
        if (lane) lane.classList.add('hl-lane');
        else if (chart) chart.classList.add('hl-lane');
      });
      indList.addEventListener('mouseout', function (e) {
        if (!e.target.closest('.plot-cell')) return;
        document.querySelectorAll('.hl-lane').forEach(function (x) { x.classList.remove('hl-lane'); });
      });
    }
    // The chart's own lanes, and the SOE markers, point back at the board.
    var floatsEl = $('chartFloats');
    if (floatsEl) {
      floatsEl.addEventListener('mouseover', function (e) {
        var l = e.target.closest('[data-ser]'); if (!l) return;
        RD.Highlight.enter(RD.Highlight.forSeries(l.getAttribute('data-ser')));
      });
      floatsEl.addEventListener('mouseleave', function () { RD.Highlight.clearHover(); });
    }
    var ribbonEl = $('soeRibbon');
    if (ribbonEl) {
      ribbonEl.addEventListener('mouseover', function (e) {
        var m = e.target.closest('[data-soe-ref]'); if (!m) return;
        RD.Highlight.enter([m.getAttribute('data-soe-ref')]);
      });
      ribbonEl.addEventListener('mouseleave', function () { RD.Highlight.clearHover(); });
    }
    // Merged-list chips + the HR1 truth switch (#439).
    var indF = $('indFilters');
    if (indF) indF.addEventListener('click', function (e) {
      var b = e.target.closest('[data-indfilter]'); if (!b) return;
      ui.indFilter = b.getAttribute('data-indfilter');
      applyIndFilter();
    });
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
    // Auto-checklists. `data-ckl-start` is now delegated at the BODY, because the launcher
    // appears in two places since #443 — the Checklists tab and the free-play Instructor
    // slot — and binding per host is how the second one would silently do nothing.
    document.body.addEventListener('click', function (e) {
      var st = e.target.closest('[data-ckl-start]');
      if (!st) return;
      toggleCklMenu(false);
      startChecklist(st.getAttribute('data-ckl-start'));
    });
    $('instructorCard').addEventListener('click', function (e) {
      var mk = e.target.closest('[data-ckl-check]');
      if (mk) { cmd({ action: 'checklist_check', index: +mk.getAttribute('data-ckl-check') }); return; }
      if (e.target.closest('[data-ckl-stop]')) cmd({ action: 'stop_checklist' });
    });
    // Plant & Mission window: plant / mode / start-condition picks re-render in
    // place; the start buttons close the window and launch.
    // The session bar is now the ONLY entry point (#439/#443) — the Operate tab that
    // carried a "Plant & Mission…" button is dissolved.
    $('simStatus').addEventListener('click', openMissionSelect);
    $('missionClose').addEventListener('click', closeMissionSelect);
    // Settings — a pausing modal off the header (#439, spec §1).
    $('settingsBtn').addEventListener('click', function () { openModal('settingsOverlay'); });
    $('settingsClose').addEventListener('click', function () { closeModal('settingsOverlay'); });
    $('settingsOverlay').addEventListener('click', function (e) {
      if (e.target === $('settingsOverlay')) closeModal('settingsOverlay');
    });
    initFeaturePanel();          // Features — development toggles (#241)
    // Help + quick tour. (The paused veil used to offer the tour too; it was removed
    // 2026-08-11 and Help is now the only route to it.)
    $('helpBtn').addEventListener('click', function () { $('helpOverlay').hidden = false; });
    $('helpClose').addEventListener('click', function () { $('helpOverlay').hidden = true; });
    $('helpOverlay').addEventListener('click', function (e) { if (e.target === $('helpOverlay')) $('helpOverlay').hidden = true; });
    if ($('helpTourBtn')) $('helpTourBtn').addEventListener('click', function () {
      $('helpOverlay').hidden = true; openTour(0);
    });
    initTour();
    // Contact (email) overlay — status line resets each open. RD_VERSION is stamped
    // at deploy time and may be absent when opened straight off disk.
    // session_end, and the only chance to send it. `pagehide` fires where
    // `beforeunload` is unreliable (mobile, bfcache), and TEL.end() is idempotent, so
    // firing on both costs nothing and missing the row costs the most useful signal
    // in the set — where people stop.
    window.addEventListener('pagehide', function () { TEL.end(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { var t = window.RD && RD.Telemetry; if (t) { try { t.flush(true); } catch (e) {} } }
    });

    // ---- the launch consent prompt lived here; REMOVED 2026-08-09 ----------------
    // *(OWNER, 2026-08-09: "Can we get rid of the convent popup and just divulge that we
    // collect telemetry in the privacy tab?")*. With it goes its watchdog, which existed
    // only to report that the prompt had been hidden by a content blocker — the overlay was
    // `id="consentOverlay"`, which cosmetic filter lists target by name, and the measured
    // symptom was `hidden:false` with computed `display:none`. Collection is now on by
    // default and disclosed on privacy.html; Settings below is the opt-out. `RD.diagnose()`
    // survives and still reports the live state. See site/telemetry.js for the reasoning.

    /* One call that answers "is any of this working?" — RD.diagnose() in the console.
     * Every failure mode here is silent by design, so without this the only way to tell an
     * opted-out visitor from a broken build is to read the source.
     *
     * The prompt_* fields are GONE with the prompt (2026-08-09). They existed to catch a
     * content blocker hiding the overlay, which is the failure this removal retires; keeping
     * them would report `prompt_in_dom: false` for ever and read like a defect. */
    window.RD = window.RD || {};
    window.RD.diagnose = function () {
      var T = window.RD && RD.Telemetry;
      var out = { telemetry_client_loaded: !!T };
      if (T && T.diagnose) { var d = T.diagnose(); for (var k in d) out[k] = d[k]; }
      // storage_writable is NOT fatal any more: the default is "collecting", so a browser
      // that refuses localStorage simply cannot record an opt-OUT. That is worth saying
      // plainly rather than reporting as healthy.
      out.verdict =
        !out.telemetry_client_loaded ? 'client did not load — check site/telemetry.js is served' :
        !out.endpoint_set ? 'no endpoint stamped — RD_TELEMETRY_ENDPOINT is unset in the build' :
        out.consent === 'denied' ? 'opted out — nothing is collected, as asked' :
        !out.storage_writable ? 'collecting, but localStorage is NOT writable — an opt-out could not persist' :
        'collecting';
      return out;
    };

    // ---- the consent toggle: REMOVED 2026-08-11 -----------------------------------
    // Owner instruction, in two steps: first out of the options menu, then removed
    // altogether. There is no user-facing opt-out control anywhere in the app or on the
    // site. The wiring went with the row (`#telemetryRow` / `#telSeg` no longer exist),
    // so what stood here would have been a no-op reaching for two missing ids on boot.
    //
    // `RD.Telemetry.setConsent` IS DELIBERATELY LEFT IN PLACE and still honoured. It is
    // what enforces invariant (a) — an opt-out drops the queue rather than holding it —
    // and removing the API would take that guarantee with it. Nothing in the shipped UI
    // calls it; it remains reachable from the console for support and for RD.diagnose().
    //
    // RD.diagnose()'s verdict is now a bare 'collecting': a diagnostic that names a
    // control which does not exist sends the next reader hunting for a menu item.

    // ---- send a bug report, with the session attached ------------------------
    (function () {
      var T = window.RD && RD.Telemetry;
      var block = $('fbSendBlock'), btn = $('fbSend');
      if (!block || !btn || !T || !T.enabled()) return;   // no endpoint: email route only
      block.hidden = false;
      btn.addEventListener('click', function () {
        var note = ($('fbNote').value || '').trim();
        var attach = $('fbAttach').checked;
        if (!note && !attach) { showToast('Add a message, or attach the session.', 'error'); return; }
        var bundle = attach ? buildDiagBundle() : { kind: 'reactor_dynamics_note_only' };
        btn.disabled = true;
        txt($('fbStatus'), 'Sending…');
        T.sendBundle(bundle, note).then(function (r) {
          btn.disabled = false;
          if (r && r.ok) {
            // THE REFERENCE IS THE ONLY HANDLE ON THE REPORT (#431). The Worker names the
            // stored object and hands the id back for exactly this; the id is also the only
            // way a follow-up conversation can say WHICH report, since two sent the same
            // evening are otherwise told apart by upload time alone.
            txt($('fbStatus'), r.id ? ('Sent — thank you. Reference ' + r.id) : 'Sent — thank you.');
            $('fbNote').value = '';
          } else {
            // Never a dead end: the address above still works, and the download
            // button beside it produces the same bundle as a file.
            txt($('fbStatus'), 'Could not send — please email instead.');
          }
        });
      });
    }());

    $('fbBtn').addEventListener('click', openFeedback);
    $('fbHeaderBtn').addEventListener('click', openFeedback);
    $('fbClose').addEventListener('click', function () { closeModal('feedbackOverlay'); });
    $('feedbackOverlay').addEventListener('click', function (e) { if (e.target === $('feedbackOverlay')) closeModal('feedbackOverlay'); });
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
        openModal('docOverlay');
      }
      function closeSiteDoc() { closeModal('docOverlay'); }
      var settingsPane = $('settingsOverlay');    // Settings is a modal now (#439)
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
      if (e.target.closest('[data-open-ckl]')) {
        e.preventDefault();
        var t = document.querySelector('#tabbar [data-tab="checklists"]');
        if (t) t.click();
        toggleCklMenu(true);
        markSeen('checklists');
        return;
      }
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
    // Coach marks retire on first use of the thing they point at (#443).
    $('simStatus').addEventListener('click', function () { markSeen('session'); });
    $('fbHeaderBtn').addEventListener('click', function () { markSeen('feedback'); });
    $('cklMenu').addEventListener('click', function () { markSeen('checklists'); });

    $('missionOverlay').addEventListener('click', function (e) {
      if (e.target === $('missionOverlay')) { closeMissionSelect(); return; }
      // Reset lives here because reset is "restart what the session bar describes"
      // (#443, spec §9) — and it is a two-press arm rather than a browser confirm(),
      // which blocks the headless drive and cannot be styled or read by the tour.
      var rs = e.target.closest('[data-mreset]');
      if (rs) {
        if (rs.getAttribute('data-mreset') === 'arm') {
          rs.setAttribute('data-mreset', 'go');
          rs.classList.add('mp-reset-armed');
          txt(rs, '⚠ Confirm reset — the current run is lost');
          clearTimeout(resetArmT);
          resetArmT = setTimeout(function () { renderMissionSelect(); }, 6000);   // disarms itself
        } else {
          clearTimeout(resetArmT);
          closeMissionSelect(); doReset(true);
        }
        return;
      }
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
        if (!$('chartOverlay').hidden) closeChartSettings();
        if (!$('helpOverlay').hidden) $('helpOverlay').hidden = true;
        if (tourOn) closeTour();
        if (!$('featureOverlay').hidden) closeFeaturePanel();
        if (!$('feedbackOverlay').hidden) closeModal('feedbackOverlay');
        if ($('docOverlay') && !$('docOverlay').hidden) closeModal('docOverlay');
        if (RD.Highlight && RD.Highlight.hasPin()) RD.Highlight.clearPin();
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
    // Strip-chart rewind: the ⏪ (now left of the window buttons) + click-to-pick on the
    // plot. The scrubber track was the same affordance and was removed with the strip —
    // a second control for one action, and the only one of the two that looked draggable
    // without being draggable.
    $('chartRewindBtn').addEventListener('click', function () { rewindPressed(); });
    document.querySelector('.chart-plot').addEventListener('click', rewindPickClick);
    /* CLICKING A MARKER JUMPS REWIND TO THAT INSTANT (#442) — the event record becomes
     * navigation, and a debrief becomes clicking through the sequence. Zero extra cost:
     * rewind already exists.
     *
     * IT LANDS ON THE NEAREST CHECKPOINT, NOT THE EXACT INSTANT, and the copy says so.
     * The service rewinds to checkpoints (~20 s of real time apart in free play, one per
     * beat in a scenario), so an event between two of them cannot be reached exactly. A
     * marker that silently landed somewhere else would be worse than one that says where
     * it can go. */
    var ribbon = $('soeRibbon');
    if (ribbon) ribbon.addEventListener('click', function (e) {
      var m = e.target.closest('[data-soe-t]'); if (!m) return;
      var t = +m.getAttribute('data-soe-t');
      var cps = (service && service.checkpoints) || [];
      if (!cps.length) { showToast('No checkpoint to rewind to yet.', 'error'); return; }
      var best = 0, bd = Infinity;
      for (var i = 0; i < cps.length; i++) {
        var d = Math.abs(cps[i].metadata.sim_time - t);
        if (d < bd) { bd = d; best = i; }
      }
      cmd({ action: 'rewind', steps: cps.length - 1 - best, exact: true });
    });
    // The shared cursor (#440). Redraw on a frame rather than per mousemove: a pointer can
    // fire far faster than the chart's own cadence, and drawChart rebuilds the whole SVG.
    (function () {
      var plot = document.querySelector('.chart-plot'); if (!plot) return;
      var pending = false;
      function schedule() {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () { pending = false; if (chartBuf.length > 1) drawChart(); });
      }
      plot.addEventListener('mousemove', function (e) {
        var r = plot.getBoundingClientRect();
        var f = (e.clientX - r.left) / (r.width * CHART_PLOT_FRAC);
        chartCursor.frac = (f < 0 || f > 1) ? null : f;
        schedule();
      });
      plot.addEventListener('mouseleave', function () {
        if (chartCursor.frac == null) return;
        chartCursor.frac = null; schedule();
      });
    }());
    // System Scanner / inspection block — hover OR tap (touch devices have no
    // hover; a click on any hinted element also explains it, alongside whatever
    // the click does). See the inspect* helpers below for the two tiers.
    document.body.addEventListener('mouseover', function (e) { inspectAt(e); });
    document.body.addEventListener('click', function (e) { inspectAt(e); });
    var sp = $('scannerPanel');
    if (sp) sp.addEventListener('click', function (e) {
      var m = e.target.closest && e.target.closest('[data-scan-doc]');
      if (m) { openManualAt(m.getAttribute('data-scan-doc'), m.getAttribute('data-scan-sec')); return; }
      // Only the button toggles — the line sits under the board, so a click anywhere on it
      // would fire while reaching for the diagram.
      if (e.target.closest('#scannerToggle')) inspectExpand();
    });
    inspectExpand(loadInspectExpanded());        // restore the operator's last choice
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
  var inspectCur = null;        // the entry the line is describing
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
    if (!it) { box.innerHTML = '<span class="idle">Hover or tap anything on the board to see what it does.</span>'; return; }
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
    // Expanded: the full description, the card note, and the manual link, all IN THE LINE.
    if (ui.inspectExpanded) {
      if (it.detail) h += '<span class="scan-detail">' + mesc(it.detail) + '</span>';
      var meta = [];
      // An inherited entry describes the CARD, not the part under the cursor. Say so — a
      // group summary read as a per-item one is a quiet lie about coverage.
      if (it.inherited) meta.push('<span class="scan-hint">Describes this card as a whole.</span>');
      if (it.doc) {
        meta.push('<button class="scan-manual" data-scan-doc="' + esc(it.doc) + '" data-scan-sec="' +
                  esc(it.sec || '') + '">Manual' + (it.sec ? ' §' + mesc(it.sec) : '') + '</button>');
      }
      if (meta.length) h += '<span class="scan-meta">' + meta.join('') + '</span>';
    }
    box.innerHTML = h;
    // The Full-description button only means anything when there IS one; a dead control
    // on a 26 px line is worse than no control (#439).
    var tg = $('scannerToggle');
    if (tg) tg.hidden = !(it.detail || it.doc);
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
  /* FULL DESCRIPTION GROWS THE LINE IN PLACE *(OWNER DIRECTIVE, 2026-08-11: "The scanner
   * full description should make the scanner larger so the full description is visible. It
   * should not open another box or window.")*.
   *
   * It was a pausing modal, on the reasoning that reading a paragraph is not operating. The
   * directive is the stronger argument: a modal covers the board you are asking about, and
   * the whole reason the Scanner moved under the diagram was to put the description next to
   * the thing it describes. A window undoes that.
   *
   * The height is CONTENT-DRIVEN but capped, and the cap is not decoration — a growing
   * panel that pushes its neighbours around on every hover is the exact complaint the fixed
   * 74 px geometry was introduced for (owner, 2026-07-28: "the jumping up and down when
   * moving the mouse over things is annoying"). Expanded it takes a fixed, generous box and
   * scrolls anything longer; collapsed it is the 26 px line. It only changes size when the
   * player asks, never on hover. */
  function inspectExpand(force) {
    ui.inspectExpanded = force != null ? !!force : !ui.inspectExpanded;
    var p = $('scannerPanel'); if (p) p.classList.toggle('expanded', ui.inspectExpanded);
    var b = $('scannerToggle');
    if (b) {
      b.textContent = ui.inspectExpanded ? 'Summary only' : 'Full description';
      b.setAttribute('aria-expanded', String(ui.inspectExpanded));
    }
    try { localStorage.setItem('rd_inspect_expanded', ui.inspectExpanded ? '1' : '0'); } catch (e) { /* private mode */ }
    inspectRender();
  }
  function loadInspectExpanded() {
    try { return localStorage.getItem('rd_inspect_expanded') === '1'; } catch (e) { return false; }
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
    // ANCHOR FIRST (#443): md_render now emits `id="s7-3"` from the section number, which
    // is the stable part — the number is what the manual's own cross-references, the
    // Scanner's deep links and the checklist "why" links all cite.
    var byId = content.querySelector('#s' + String(sec).replace(/\./g, '-'));
    if (byId) { byId.scrollIntoView({ block: 'start' }); return; }
    // The heading-TEXT scan stays as the fallback, for content that predates the ids or
    // carries an unnumbered heading. Whole-segment matched: "9.1" must not land on "9.10".
    var hs = content.querySelectorAll('h1,h2,h3,h4,h5');
    for (var i = 0; i < hs.length; i++) {
      var txt = hs[i].textContent.trim();
      if (txt.indexOf(sec) !== 0) continue;
      if (/^\s*$/.test(txt.charAt(sec.length))) { hs[i].scrollIntoView({ block: 'start' }); return; }
    }
  }
  /* Manual SEARCH (#443, spec §11). The manual is large and a wall of it intimidates
   * exactly the users checklists exist to serve, so it is the depth layer: reached in small
   * pieces, by anchor, from a step's "why". Search is the other way in for someone who does
   * know what they are looking for.
   *
   * Over the PACKED markdown rather than the rendered DOM: the DOM only holds the document
   * currently open, so a DOM search would silently only ever find what you were already
   * reading — which looks like a working search returning nothing. */
  function manualSearch(q) {
    q = String(q || '').trim().toLowerCase();
    if (q.length < 3) return [];
    var docs = mdManual() || {};
    var hits = [];
    Object.keys(docs).forEach(function (docId) {
      var lines = String(docs[docId] || '').split('\n');
      var sec = null;
      for (var i = 0; i < lines.length && hits.length < 40; i++) {
        var hm = /^#{1,6}\s+(.*)$/.exec(lines[i]);
        if (hm) { sec = hm[1].replace(/\s*#+\s*$/, ''); continue; }
        var low = lines[i].toLowerCase();
        if (low.indexOf(q) === -1) continue;
        var at = low.indexOf(q);
        hits.push({ doc: docId, sec: sec,
                    num: (sec && /^(\d+(?:\.\d+)*)\s/.exec(sec) || [])[1] || null,
                    snippet: lines[i].slice(Math.max(0, at - 40), at + 80).trim() });
      }
    });
    return hits;
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
      title: 'The reference tabs',
      body: '<p><b>Checklists</b> to follow a procedure. <b>Indications</b> and ' +
        '<b>Physics</b> for every reading the plant produces and the true state behind ' +
        'them. <b>Inject Failure</b> when you are ready for casualties. None of them ' +
        'stops the plant.</p>',
      prep: function () {
        var t = document.querySelector('#tabbar [data-tab="checklists"]');
        if (t) t.click();
      }
    },
    {
      sel: '#cklMenu',
      place: 'left',
      title: 'Checklists',
      body: '<p>Interactive procedures that check themselves off the instruments. ' +
        'Best next step after this tour — hover a step to glow the controls it names.</p>',
      prep: function () {
        // Checklists is its own tab since #439, and the list is always on screen since
        // 2026-08-11 — there is nothing to un-hide, only a tab to select.
        applyFocus(false, true);
        var t = document.querySelector('#tabbar [data-tab="checklists"]');
        if (t && !t.classList.contains('on')) t.click();
        toggleCklMenu('force');
      },
      // If checklists are gated off on this channel, point at the strip instead.
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
      place: 'top',
      title: 'System Scanner',
      body: '<p>The line under the board. Hover anything and it says what that is; ' +
        '<b>Full description</b> opens the detail and a Manual link.</p>'
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
    // #408 real currency: these three are inventory-frac/s, not 0–1 normalized — render
    // gpm on the declared 7,500 gal (× 450,000, the board's GPM_CHARGING scale).
    if (/^(leak_flow|charging_flow_actual|letdown_flow_actual)$/.test(f)) return Math.round(x * GPM_PER_FRAC) + ' gpm';
    if (/_normalized$/.test(f) || f === 'steam_to_turbine' ||
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
    ui.seriesSide = {};                    // sides follow the selections they refine (#454)
    pauseSim('plant_change');
    service.handleCommand({ action: 'reset', plant_id: e.plant, initial_state: ui.initState, design_version: e.dv });
    rebuildPlantUI();
    diagReset('plant_change', { engine_key: key, initial_state: ui.initState });
    // The hold covered the swap; the swap is done. It does NOT resume a plant the player
    // had stopped themselves — `user` is a separate hold and releaseHold leaves it standing.
    releaseHold('plant_change');
  }

  function rebuildPlantUI() {
    // BEFORE chartBuf can take a row: the packed row width and the column of every series
    // come from the incoming plant's profile, and a sample taken against the old index
    // would be silently misfiled rather than empty.
    buildSeriesIndex();
    chartBuf = []; smoothed = {}; seriesHot = {};
    // …and the UNDRAINED sub-samples, all three shares. The comment above says a sample taken
    // against the old index would be "silently misfiled rather than empty" — that is exactly
    // what a pending row from the previous plant is, and until #432 none of these were
    // cleared here. The recorder's share matters most: its columns are the old plant's field
    // list, so a leaked row writes one plant's numbers under another's names.
    pendingFine = null; pendingTiles = null; pendingDiagFine = null; RD.ChartFine = null;
    syncUnitsScope();
    buildGauges(); buildIndications(); buildPhysics(); updateSimSummary(); buildFailures();
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
    ui.seriesSide = {};                    // sides follow the selections they refine (#454)
    rebuildPlantUI();
  }

  // `armed` = the caller already took a confirmation (the session-footer two-press in
  // the Plant & Mission window, #443). The legacy Operate-tab button has no such step,
  // so it still raises the browser confirm; that button goes away with the tab in #439.
  function doReset(armed) {
    if (!armed && !confirm('Reset to ' + ui.initState + '? Current run is lost.')) return;
    ui.scenario = null; ui.follow = null;   // a plant reset ends instructed content
    pauseSim('reset');
    service.handleCommand({ action: 'reset', plant_id: ui.plant, initial_state: ui.initState, design_version: ENGINES[ui.engineKey].dv });
    rebuildPlantUI();
    // Same transient hold, same release *(OWNER SELECTION, 2026-08-11, from the options
    // presented: "Fix both")*. A reset lands you on a running plant at the chosen initial
    // condition, rather than on a stopped one that needs ▶ before anything happens.
    releaseHold('reset');
  }
  function downloadSave() {
    var data = JSON.stringify(service.saveState(), null, 2);
    var url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    var a = document.createElement('a'); a.href = url; a.download = 'reactor_save.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast('State saved — reactor_save.json');
  }
  function exportCsv() {
    /* ONE COLUMN PER TRACE, not per channel (#454). A channel set to 'both' is two traces,
     * so it exports two columns — `id_ind` and `id_phys` — because the export's whole
     * contract is that it carries what the chart is showing. A single-side channel keeps
     * the BARE id it has always had, so an existing worksheet built on `tavg` does not
     * break; the suffix appears only where there is genuinely a pair to tell apart. */
    var cols = [];
    prof().series.forEach(function (s) {
      var side = sideOf(s); if (!side) return;
      if (side === 'both') {
        cols.push({ ser: s, side: 'ind', name: s.id + '_ind' });
        cols.push({ ser: s, side: 'phys', name: s.id + '_phys' });
      } else cols.push({ ser: s, side: side, name: s.id });
    });
    var head = ['sim_time'].concat(cols.map(function (c) { return c.name; })).join(',');
    // export what the chart is actually showing (seriesVal), so the CSV and the trace agree
    var rows = chartBuf.map(function (b) { return [b.t.toFixed(2)].concat(cols.map(function (c) { var v = seriesVal(c.ser, b, c.side); return (v == null || !isFinite(v)) ? '' : v.toFixed(3); })).join(','); });
    var url = URL.createObjectURL(new Blob([head + '\n' + rows.join('\n')], { type: 'text/csv' }));
    var a = document.createElement('a'); a.href = url; a.download = 'reactor_trend.csv'; a.click();
  }
  /* The SOE exports ALONGSIDE the trace CSV (#442) — it is the artifact a classroom
   * worksheet is built from, and a trace without its events is a shape with no story. A
   * separate file rather than extra columns: one row per event against one row per sample
   * are different tables, and jamming them together makes both awkward to read. */
  function exportSoe() {
    var evs = (RD.Events && RD.Events.all()) || [];
    if (!evs.length) { showToast('No events recorded yet.', 'error'); return; }
    var rows = ['sim_time_s,clock,tier,actor,type,detail'];
    evs.forEach(function (e) {
      var det = '';
      try { det = e.detail ? JSON.stringify(e.detail).replace(/"/g, "'") : ''; } catch (x) { det = ''; }
      rows.push([e.t.toFixed(2), hms(Math.max(0, e.t)), e.tier, e.actor, e.type, '"' + det + '"'].join(','));
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    a.download = 'reactor_soe.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
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
        // #237 (owner): the paused veil was clickable to resume. The veil was removed
        // 2026-08-11; this hook is kept because the board API still declares it. Route
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
    ui.seriesSide = {};                    // sides follow the selections they refine (#454)
    service = new RD.SimulationService({ seed: 0x1234 });
    // Fine strip-chart sampling. The service calls this on a fixed SIM-time interval inside
    // its step loop, so the chart sees the plant between broadcasts and its resolution stops
    // depending on time acceleration. It returns the same shape `chartSample` produces for
    // the broadcast row, so the two interleave in chartBuf with no special case downstream.
    // Registered here rather than on demand because the cost is already bounded service-side
    // (CHART_FINE_MAX per broadcast) and a sampler that comes and goes would leave gaps in
    // the history whenever the chart tab was closed.
    if (service.setFineSampler) {
      service.setFineSampler(function (ins, truth, ctl) { return chartSample(ins, truth, ctl); });
    }
    service.subscribe(render);
    service.subscribe(diagTick);
    // renderAutomate and inspectLiveTick are called from renderNow instead, so every DOM
    // write for one broadcast happens inside the same rAF frame. Subscribing them here put
    // them on the broadcast's setTimeout, off the paint cycle — see renderNow.
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
    ui.seriesSide = {};                    // sides follow the selections they refine (#454)
    buildSeriesIndex();   // must precede the first chartSample — see rebuildPlantUI
    syncUnitsScope();
    buildGauges(); buildIndications(); buildPhysics(); updateSimSummary();
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
    // `physics` and `operate` were MISSING from this list — the deep link silently did
    // nothing for two of the five tabs, which matters because a pane that is not on screen
    // does not render at all (paneVisible), so `?tab=physics` opened a tab that stayed
    // blank and looked like a broken panel rather than a broken link. `sim` stays as the
    // legacy alias for `operate`.
    var tbm = /[?&]tab=(failures|graph|indications|physics|checklists|operate|sim|settings|training)/.exec(location.search || '');
    if (tbm) {
      // Three of these no longer name a TAB (#439) and route to what replaced them:
      // `training` and `operate`/`sim` to the Plant & Mission window, `settings` to the
      // Settings modal. They stay accepted because they are pasted into issues and
      // screenshots — a dead deep link is a broken bug report, not a tidy-up.
      var a = tbm[1];
      if (a === 'training' || a === 'operate' || a === 'sim') openMissionSelect();
      else if (a === 'settings') openModal('settingsOverlay');
      else {
        var tabId = a === 'graph' ? 'indications' : a;      // `graph` is the old Indications
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
    if (/[?&]run=1/.test(location.search || '')) resumeSim();
    // optional ?follow=<procId> deep-link — loads a procedure into the Instructor block
    var fm = /[?&]follow=([a-z0-9_]+)/.exec(location.search || '');
    if (fm) followProcedure(fm[1]);
    refreshMissionSelect();
    // optional ?scenario=<id> deep-link — starts an M6 scenario directly
    var scm = /[?&]scenario=([a-z0-9_]+)/.exec(location.search || '');
    if (scm && RD.SCENARIOS && RD.SCENARIOS[scm[1]]) { startScenario(scm[1]); refreshMissionSelect(); }
    // Free-play Instructor idle coaching (Help / Checklists / tour pointers).
    showIdleInstructor();
    applyCoachMarks();
    restorePanelState();       // the player's own arrangement of the right column (#439)
    // The selection screen (#443) — but NOT when the URL already made the choice.
    // Every dev deep-link and both browser gates arrive with one of these, and a
    // screen asking "which plant?" over a link that named the plant is a wall, not
    // a front door.
    /* THE PLANT & MISSION WINDOW OPENS ON EVERY LOAD, UNCONDITIONALLY *(OWNER DIRECTIVE,
     * 2026-08-11: "The plant and mission menu should be up when the sim page is loaded.";
     * narrowed the same day after it did not appear: "It should show up every time the sim
     * is loaded it should not keep from loading if the player has sent before. It should
     * always the the first thing someone sees when loading the sim.")*.
     *
     * THE DEEP-LINK BYPASS THAT USED TO GUARD THIS IS WHY IT NEVER FIRED FOR ANYONE. The
     * list included `engine=`, and index.html links the simulator as
     * `ui/shell.html?engine=pwr` — from BOTH entry points — so every visitor arriving the
     * normal way matched the bypass and never saw the window. My check for it passed
     * because it loaded a bare `ui/shell.html`, a URL only a developer types. A test that
     * reaches the feature by a path no user takes cannot see a defect that lives on the
     * path they all take.
     *
     * There is now no bypass at all, which is what "always" means. Anything automated —
     * a gate, a dev deep link — dismisses the window rather than being exempted from it,
     * so the thing under test is the thing players get. */
    openMissionSelect();
    missionTipArmed = true;            // the NEXT close is the one that needs the pointer
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
