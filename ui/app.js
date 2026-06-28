/* ============================================================================
 * app.js — Reactor⚛️Dynamics control-room UI (alpha), wired to the live stack.
 *
 * Builds the SimulationService (M5) over the PWR engine + Control & Failure
 * Layer + placeholder Instructor, subscribes to its broadcast, and renders each
 * snapshot: gauges and the numeric placeholder read snapshot.instruments (HR1),
 * controls issue commands down the stack (HR5), alarms render from
 * snapshot.alarms, the strip chart trends selected parameters, and the
 * true-state overlay reads snapshot.true_state on request.
 *
 * Alpha scope: PWR only (the UI profile below is PWR-specific); data-driven
 * generalization to RBMK/BWR follows when those engines land.
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
    series: { power: true, tavg: true, pressure: true, sg_level: true },
    initState: 'hot_full_power',
  };
  var service, latest = null;
  var chartBuf = [];        // { t, ins, ts }
  var gaugeHist = {};       // id -> [display values]

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

  // ----------------------------------------------------------- plant profile (PWR)
  function gridMatch(s) {
    var d = s.control_state.steam_demand_mwe || 0;
    if (d <= 1) return 0;
    return Math.min(100, (s.true_state.mwe_output / d) * 100);
  }
  // Each gauge: native instrument range (for the needle) + display conversion.
  var GAUGES = [
    { id: 'power',   label: 'Reactor Power', lead: true, raw: function (s) { return s.instruments.power_range; }, dim: null, units: '%', min: 0, max: 120, caution: 108, danger: 118, dp: 1 },
    { id: 'grid',    label: 'Grid Match',    lead: true, raw: function (s) { return gridMatch(s); }, dim: null, units: '%', min: 0, max: 100, dp: 1 },
    { id: 'press',   label: 'Primary Press', raw: function (s) { return s.instruments.primary_pressure; }, dim: 'pressure', min: 0, max: 20.7, caution: 16.2, danger: 16.44, dp: 0 },
    { id: 'tavg',    label: 'Tavg',          raw: function (s) { return s.instruments.tavg; }, dim: 'temp', min: 250, max: 343, caution: 312, danger: 335, dp: 0 },
    { id: 'pzr',     label: 'PZR Level',     raw: function (s) { return s.instruments.pzr_level; }, dim: null, units: '%', min: 0, max: 100, dp: 0 },
    { id: 'sg',      label: 'SG Level',      raw: function (s) { return s.instruments.sg_level; }, dim: null, units: '%', min: 0, max: 100, dp: 0 },
    { id: 'subcool', label: 'Subcool',       raw: function (s) { return s.instruments.subcooling_margin; }, dim: 'tempdiff', min: -28, max: 83, dp: 0 },
  ];

  // Numeric placeholder columns. inst: instrument value (shown by default, HR1);
  // truth: true value (shown when overlay on); bool kinds render on/off styling.
  function bool(v, onWord, offWord) { return { b: !!v, t: v ? (onWord || 'yes') : (offWord || 'no') }; }
  var NUMERIC = [
    { title: 'Reactor / Core', rows: [
      { k: 'Power', inst: function (s) { return s.instruments.power_range.toFixed(1) + ' %'; }, truth: function (s) { return s.true_state.power_pct.toFixed(1) + ' %'; } },
      { k: 'Fuel Temp', inst: null, truth: function (s) { return dispT(s.true_state.fuel_temp_c); } },
      { k: 'Decay Heat', inst: null, truth: function (s) { return s.true_state.decay_heat_pct.toFixed(1) + ' %'; } },
      { k: 'Control Bank', inst: function (s) { return rodSteps(s, 'control') + ' steps'; } },
      { k: 'Shutdown Bank', inst: function (s) { return rodSteps(s, 'shutdown') + ' steps'; } },
      { k: 'Scrammed', inst: function (s) { return bool(s.rps_state.scrammed, 'YES', 'no'); } },
    ] },
    { title: 'Primary & PZR', rows: [
      { k: 'Pressure', inst: function (s) { return dispP(s.instruments.primary_pressure); }, truth: function (s) { return dispP(s.true_state.pressure_mpa); } },
      { k: 'Tavg', inst: function (s) { return dispT(s.instruments.tavg); }, truth: function (s) { return dispT(s.true_state.tavg_c); } },
      { k: 'T-hot / T-cold', inst: function (s) { return dispT(s.instruments.thot) + ' / ' + dispT(s.instruments.tcold); } },
      { k: 'PZR Level', inst: function (s) { return s.instruments.pzr_level.toFixed(0) + ' %'; }, truth: function (s) { return s.true_state.pzr_level_pct.toFixed(0) + ' %'; } },
      { k: 'Subcooling', inst: function (s) { return dispTd(s.instruments.subcooling_margin); }, truth: function (s) { return dispTd(s.true_state.subcooling_c); } },
      { k: 'PORV', inst: function (s) { return bool(s.instruments.porv_indicator === 'open', 'OPEN', 'closed'); }, truth: function (s) { return bool(s.true_state.porv_open, 'OPEN', 'closed'); } },
      { k: 'Boron', inst: null, truth: function (s) { return s.true_state.boron_ppm.toFixed(0) + ' ppm'; } },
    ] },
    { title: 'Steam Generators', rows: [
      { k: 'SG Level', inst: function (s) { return s.instruments.sg_level.toFixed(0) + ' %'; }, truth: function (s) { return s.true_state.sg_level_pct.toFixed(0) + ' %'; } },
      { k: 'Steam Flow', inst: function (s) { return (s.instruments.steam_flow * 100).toFixed(0) + ' %'; } },
      { k: 'Feedwater Flow', inst: function (s) { return (s.instruments.fw_flow * 100).toFixed(0) + ' %'; } },
      { k: 'AFW', inst: function (s) { return bool(s.true_state.afw_active, 'on', 'off'); } },
    ] },
    { title: 'Turbine / Condenser', rows: [
      { k: 'Output', inst: function (s) { return s.instruments.mwe_output.toFixed(0) + ' MW'; } },
      { k: 'Turbine RPM', inst: function (s) { return s.instruments.turbine_rpm.toFixed(0); } },
      { k: 'Cond. Vacuum', inst: function (s) { return dispV(s.instruments.condenser_vacuum); } },
      { k: 'Main Breaker', inst: function (s) { return bool(s.control_state.steam_demand_mwe > 1, 'closed', 'open'); } },
    ] },
    { title: 'Emergency & Inventory', rows: [
      { k: 'Core Inventory', inst: null, truth: function (s) { return s.true_state.core_inventory_pct.toFixed(0) + ' %'; } },
      { k: 'RCP', inst: function (s) { return bool(s.instruments.rcp_running, 'running', 'STOPPED'); } },
      { k: 'HPI / ECCS', inst: function (s) { return bool(s.instruments.hpi_active, 'active', 'standby'); } },
      { k: 'Station Blackout', inst: function (s) { return bool(s.instruments.station_blackout, 'YES', 'no'); } },
    ] },
  ];
  function dispP(mpa) { return mpa == null ? '—' : conv(mpa, 'pressure').toFixed(0) + ' ' + unit('pressure'); }
  function dispT(c) { return c == null ? '—' : conv(c, 'temp').toFixed(0) + ' ' + unit('temp'); }
  function dispTd(c) { return c == null ? '—' : conv(c, 'tempdiff').toFixed(0) + ' ' + unit('tempdiff'); }
  function dispV(kpa) { return kpa == null ? '—' : conv(kpa, 'vacuum').toFixed(1) + ' ' + unit('vacuum'); }
  function rodSteps(s, fn) { var g = s.control_state.rod_groups.filter(function (x) { return x.function === fn; })[0]; return g ? g.steps : 0; }
  function rodGroup(s, fn) { return s.control_state.rod_groups.filter(function (x) { return x.function === fn; })[0]; }

  // Strip-chart series: read raw instrument values from a buffered copy, plotted
  // against a FIXED range each (so steady state reads flat and real transients
  // show true movement — auto-scaling would amplify noise to full height).
  var SERIES = [
    { id: 'power',    label: 'Power %',  color: '#FB923C', get: function (i) { return i.power_range; }, range: [0, 120] },
    { id: 'tavg',     label: 'Tavg',     color: '#67E8F9', get: function (i) { return i.tavg; }, range: [270, 330] },
    { id: 'pressure', label: 'Pressure', color: '#22D3EE', get: function (i) { return i.primary_pressure; }, range: [10, 17] },
    { id: 'sg_level', label: 'SG Level', color: '#F472B6', get: function (i) { return i.sg_level; }, range: [0, 100] },
    { id: 'pzr_level',label: 'PZR Level',color: '#A855F7', get: function (i) { return i.pzr_level; }, range: [0, 100] },
    { id: 'subcool',  label: 'Subcool',  color: '#2DD4BF', get: function (i) { return i.subcooling_margin; }, range: [-10, 60] },
    { id: 'mwe',      label: 'Output MW',color: '#22C55E', get: function (i) { return i.mwe_output; }, range: [0, 1100] },
  ];

  // Map an alarm to a system category (alpha: UI-side; later from the profile).
  function alarmCategory(id) {
    if (/flux|power|rod/.test(id)) return 'reactivity';
    if (/press|subcool|pzr|rcp/.test(id)) return 'coolant';
    if (/sg|turbine|cond|tavg/.test(id)) return 'power';
    if (/sensor|indicator/.test(id)) return 'instrument';
    return 'safety_system';
  }

  // ============================================================ build static DOM
  function buildGauges() {
    var strip = $('gaugeStrip');
    strip.innerHTML = '';
    GAUGES.forEach(function (g) {
      var el = document.createElement('div');
      el.className = 'gauge' + (g.lead ? ' lead' : '');
      el.setAttribute('data-scanner-hint', g.label + ' — reads the instrument (lagged/noisy/fallible), not the true value.');
      el.innerHTML =
        '<div class="g-label"><span>' + g.label + '</span><span class="g-trend trend-flat" data-trend></span></div>' +
        '<div class="g-value" data-val>—</div>' +
        '<svg class="g-spark" viewBox="0 0 100 14" preserveAspectRatio="none"><polyline data-spark fill="none" stroke="' + (g.lead ? '#FB923C' : '#67E8F9') + '" stroke-width="1.5"/></svg>' +
        '<div class="g-band"><span class="needle" data-needle style="left:0%"></span></div>';
      el.id = 'gauge-' + g.id;
      strip.appendChild(el);
      gaugeHist[g.id] = [];
    });
  }

  function buildNumeric() {
    var grid = $('numericGrid');
    grid.innerHTML = '';
    NUMERIC.forEach(function (col, ci) {
      var c = document.createElement('div');
      c.className = 'num-col';
      var html = '<h4>' + col.title + '</h4>';
      col.rows.forEach(function (r, ri) {
        html += '<div class="num-line" data-num="' + ci + '-' + ri + '"><span class="nk">' + r.k + '</span><span class="nv" data-nv>—</span></div>';
      });
      c.innerHTML = html;
      grid.appendChild(c);
    });
  }

  function buildGraphParams() {
    var box = $('graphParams');
    box.innerHTML = '';
    SERIES.forEach(function (s) {
      var row = document.createElement('label');
      row.className = 'param-row';
      row.innerHTML = '<input type="checkbox" data-series="' + s.id + '"' + (ui.series[s.id] ? ' checked' : '') + '>' +
        '<i style="background:' + s.color + '"></i>' + s.label;
      box.appendChild(row);
    });
    box.addEventListener('change', function (e) {
      var cb = e.target.closest('input[data-series]');
      if (!cb) return;
      ui.series[cb.getAttribute('data-series')] = cb.checked;
      drawChart();
    });
  }

  function buildFailures() {
    var list = $('failList');
    list.innerHTML = '';
    var cat = service.layer.getFailureCatalog();
    cat.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'fail-row';
      row.id = 'fail-' + f.id;
      var catShort = f.category === 'safety_system' ? 'safety' : f.category;
      var html = '<div class="fail-head">' +
        '<button class="fail-toggle" data-fail="' + f.id + '">Inject</button>' +
        '<span class="fail-name">' + f.display + '</span>' +
        '<span class="fail-cat ' + f.category + '">' + catShort + '</span></div>';
      if (f.severity_meta) {
        var m = f.severity_meta;
        html += '<div class="fail-slider"><input type="range" min="0" max="100" value="' +
          Math.round((m.default - m.min) / (m.max - m.min) * 100) + '" data-sevfor="' + f.id + '">' +
          '<span class="sv mono" data-svlabel="' + f.id + '">' + m.label + ': ' + m.default + ' ' + m.unit + '</span></div>';
        row.setAttribute('data-meta', JSON.stringify(m));
      }
      row.innerHTML = html;
      list.appendChild(row);
    });
  }

  // ============================================================ render snapshot
  function render(s) {
    latest = s;
    // clock
    $('clock').textContent = 'T+' + hms(s.metadata.sim_time);
    $('simElapsed').textContent = 'T+' + hms(s.metadata.sim_time);
    $('clock').classList.toggle('running', s.metadata.running);
    $('clock').classList.toggle('accel', s.metadata.time_acceleration > 1);

    renderGauges(s);
    renderNumeric(s);
    renderControls(s);
    renderAlarms(s);
    renderInstructor(s);
    renderFailures(s);

    // strip-chart buffer — copy the instrument VALUES (getInstruments returns the
    // engine's live, mutated reading object, so we must not hold the reference).
    chartBuf.push({ t: s.metadata.sim_time, ins: Object.assign({}, s.instruments) });
    var cutoff = s.metadata.sim_time - ui.window;
    while (chartBuf.length > 2 && chartBuf[0].t < cutoff) chartBuf.shift();
    drawChart();
  }

  function renderGauges(s) {
    GAUGES.forEach(function (g) {
      var root = $('gauge-' + g.id);
      var raw = g.raw(s);
      var disp = g.dim ? conv(raw, g.dim) : raw;
      var units = g.dim ? unit(g.dim) : g.units;
      root.querySelector('[data-val]').innerHTML = disp.toFixed(g.dp) + '<span class="g-units"> ' + units + '</span>';
      // needle from native range
      var frac = (raw - g.min) / (g.max - g.min);
      root.querySelector('[data-needle]').style.left = (Math.max(0, Math.min(1, frac)) * 100) + '%';
      // trend + sparkline (history of raw)
      var h = gaugeHist[g.id]; h.push(raw); if (h.length > 40) h.shift();
      var tr = root.querySelector('[data-trend]');
      if (h.length > 4) {
        var d = h[h.length - 1] - h[h.length - 5];
        tr.textContent = d > Math.abs(g.max - g.min) * 0.002 ? '▲' : d < -Math.abs(g.max - g.min) * 0.002 ? '▼' : '▶';
        tr.className = 'g-trend ' + (d > 0 ? 'trend-up' : d < 0 ? 'trend-down' : 'trend-flat');
      }
      var mn = Math.min.apply(null, h), mx = Math.max.apply(null, h), rng = (mx - mn) || 1;
      var pts = h.map(function (v, i) { return (i / Math.max(1, h.length - 1) * 100).toFixed(1) + ',' + (13 - (v - mn) / rng * 12).toFixed(1); }).join(' ');
      root.querySelector('[data-spark]').setAttribute('points', pts);
    });
  }

  function renderNumeric(s) {
    var showInst = ui.overlay === 'instruments' || ui.overlay === 'both';
    var showTruth = ui.overlay === 'true' || ui.overlay === 'both';
    NUMERIC.forEach(function (col, ci) {
      col.rows.forEach(function (r, ri) {
        var line = document.querySelector('[data-num="' + ci + '-' + ri + '"]');
        var nv = line.querySelector('[data-nv]');
        var instVal = r.inst ? r.inst(s) : null;
        var truthVal = r.truth ? r.truth(s) : null;
        var parts = [], cls = '';
        // primary value: instrument by default (HR1); true-only rows show truth
        if (instVal != null && showInst) {
          if (instVal.b !== undefined) { parts.push(instVal.t); cls = boolClass(instVal.t); }
          else parts.push(instVal);
        }
        if (truthVal != null && (showTruth || (instVal == null && showInst))) {
          var tstr = truthVal.b !== undefined ? truthVal.t : truthVal;
          if (instVal == null) { parts = [tstr]; if (truthVal.b !== undefined) cls = boolClass(truthVal.t); }
          else parts.push('<span class="true-tag">true ' + tstr + '</span>');
        }
        if (instVal == null && truthVal == null) parts = ['—'];
        // true-only field while overlay is off → hidden from the operator
        if (instVal == null && truthVal != null && !showTruth) parts = ['<span class="hidden-true">— overlay —</span>'];
        nv.innerHTML = parts.join(' ');
        nv.className = 'nv ' + cls;
      });
    });
  }
  // Red for abnormal states, green for normal-active, gray otherwise.
  function boolClass(word) {
    if (/^(OPEN|STOPPED|YES)$/.test(word)) return 'bool-bad';
    if (/^(running|active|closed|on)$/i.test(word)) return 'bool-on';
    return 'bool-off';
  }

  function renderControls(s) {
    var cg = rodGroup(s, 'control'), sg = rodGroup(s, 'shutdown');
    if (cg) {
      $('rodControlReadout').textContent = cg.steps + ' / ' + cg.max_steps;
      $('rodControlFill').style.width = cg.position_pct + '%';
      $('rodControlFill').style.background = cg.at_insertion_limit ? 'var(--critical)' : 'var(--normal)';
      if (cg.insertion_limit_steps != null) $('rodControlLimit').style.left = (cg.insertion_limit_steps / cg.max_steps * 100) + '%';
    }
    if (sg) { $('rodShutdownReadout').textContent = sg.steps + ' / ' + sg.max_steps; $('rodShutdownFill').style.width = sg.position_pct + '%'; }
    $('boronReadout').textContent = s.true_state.boron_ppm.toFixed(0) + ' ppm';
    $('feedReadout').textContent = (s.control_state.feedwater_flow_pct || 0).toFixed(0) + ' %';
    $('mweReadout').textContent = (s.instruments.mwe_output).toFixed(0) + ' MW';
    // scram button reflects the actual reactor state (manual scram isn't an RPS trip)
    var btn = $('scramBtn');
    if (s.true_state.scrammed) { btn.classList.add('fired'); btn.textContent = 'SCRAMMED'; }
    else { btn.classList.remove('fired'); btn.textContent = 'SCRAM'; }
    // alarm tint
    var anyUnack = s.alarms.some(function (a) { return a.state === 'active_unacknowledged'; });
    $('gaugeStrip').classList.toggle('alarm-tint', anyUnack);
  }

  function renderAlarms(s) {
    var stack = $('alarmStack');
    var active = s.alarms.filter(function (a) { return a.state !== 'clear'; });
    // sort: critical first, then priority, then keep order
    var prio = { critical: 0, warning: 1, caution: 2, status: 3 };
    active.sort(function (a, b) { return (prio[a.priority] - prio[b.priority]); });
    if (!active.length) { stack.innerHTML = '<div class="alarm-empty">— no active alarms —</div>'; return; }
    stack.innerHTML = active.map(function (a) {
      var cat = alarmCategory(a.id);
      var sev = a.priority === 'critical' ? 'crit' : a.priority === 'warning' ? 'warn' : '';
      var unack = a.state === 'active_unacknowledged' ? ' unack' : '';
      var glyph = a.priority === 'critical' ? '⚠' : a.priority === 'warning' ? '△' : '●';
      return '<div class="alarm-tile ' + sev + unack + ' cat-' + cat + '" data-ack="' + a.id +
        '" data-scanner-hint="' + a.tile_label + ' — ' + a.priority + ' alarm (' + cat + '). Reads the instrument; click to acknowledge.">' +
        '<div class="bar"></div><div class="body"><div class="label">' + a.tile_label +
        '</div><div class="meta">' + cat + ' · ' + a.priority + ' · ' + a.state.replace('active_', '') + '</div></div>' +
        '<div class="glyph">' + glyph + '</div></div>';
    }).join('');
  }

  function renderInstructor(s) {
    var cur = $('instrCurrent');
    if (s.instructor && s.instructor.message) { cur.textContent = s.instructor.message; cur.classList.remove('instr-standby'); }
    else { cur.textContent = 'Standing by…'; cur.classList.add('instr-standby'); }
  }

  // Active rows come from the snapshot (never optimistic, §10.1).
  function renderFailures(s) {
    var act = {}; s.active_failures.forEach(function (f) { act[f.id] = f; });
    document.querySelectorAll('.fail-row').forEach(function (row) {
      var id = row.id.replace('fail-', '');
      var on = !!act[id];
      row.classList.toggle('active', on);
      var btn = row.querySelector('.fail-toggle'); if (btn) btn.textContent = on ? 'Clear' : 'Inject';
      // sync slider from the reported severity (restored runs, live changes elsewhere)
      var sl = row.querySelector('[data-sevfor]');
      if (sl && on && act[id].severity != null && document.activeElement !== sl) {
        var m = JSON.parse(row.getAttribute('data-meta'));
        sl.value = Math.round(act[id].severity * 100);
        row.querySelector('[data-svlabel="' + id + '"]').textContent = m.label + ': ' + Math.round(m.min + act[id].severity * (m.max - m.min)) + ' ' + m.unit;
      }
    });
  }

  // ============================================================ strip chart
  function drawChart() {
    var svg = $('chartCanvas'), W = 400, H = 120;
    var active = SERIES.filter(function (s) { return ui.series[s.id]; });
    // legend
    $('chartLegend').innerHTML = active.map(function (s) { return '<span><i style="background:' + s.color + '"></i>' + s.label + '</span>'; }).join('');
    if (chartBuf.length < 2) { svg.innerHTML = ''; return; }
    var t0 = chartBuf[0].t, t1 = chartBuf[chartBuf.length - 1].t, span = (t1 - t0) || 1;
    var html = '';
    [30, 60, 90].forEach(function (y) { html += '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y + '" stroke="#23272d"/>'; });
    active.forEach(function (ser) {
      var lo = ser.range[0], hi = ser.range[1], rng = (hi - lo) || 1;
      var pts = chartBuf.map(function (b) {
        var x = (b.t - t0) / span * W;
        var f = Math.max(0, Math.min(1, (ser.get(b.ins) - lo) / rng));
        var y = H - 8 - f * (H - 16);
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
      html += '<polyline points="' + pts + '" fill="none" stroke="' + ser.color + '" stroke-width="1.5"/>';
    });
    svg.innerHTML = html;
    // low-profile x-axis: time ticks across the window
    var ax = $('chartXAxis'); ax.innerHTML = '';
    var ticks = 5;
    for (var i = 0; i <= ticks; i++) {
      var tt = t0 + span * i / ticks;
      var rel = tt - t1; // seconds relative to now (≤0)
      var span2 = document.createElement('span');
      span2.textContent = rel === 0 ? '0' : Math.round(rel) + 's';
      ax.appendChild(span2);
    }
    $('chartWindowLbl').textContent = '−' + hms(ui.window).slice(3);
  }

  // ============================================================ commands
  function cmd(c) { service.handleCommand(c); if (!service.running) { latest = service.assembleSnapshot(); render(latest); } }

  var ACTS = {
    scram: function () { cmd({ action: 'scram' }); },
    'ack-all': function () { cmd({ action: 'acknowledge_all_alarms' }); },
    'rod-raise': function () { cmd({ action: 'rod_start', group_id: 'control_rods', direction: 1, speed: ui.rodSpeed }); },
    'rod-lower': function () { cmd({ action: 'rod_start', group_id: 'control_rods', direction: -1, speed: ui.rodSpeed }); },
    'rod-stop': function () { cmd({ action: 'rod_stop', group_id: 'control_rods' }); },
    'rod-nudge-out': function () { cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: 1 }); },
    'rod-nudge-in': function () { cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -1 }); },
    'rcp-run': function () { cmd({ action: 'clear_failure', failure_id: 'rcp_trip' }); },
    'rcp-stop': function () { cmd({ action: 'inject_failure', failure_id: 'rcp_trip', severity: 1 }); },
    'borate': function () { cmd({ action: 'set_charging_flow', normalized: 0.15 }); cmd({ action: 'set_letdown_flow', normalized: 0 }); },
    'dilute': function () { cmd({ action: 'set_letdown_flow', normalized: 0.15 }); cmd({ action: 'set_charging_flow', normalized: 0 }); },
    'boron-off': function () { cmd({ action: 'set_charging_flow', normalized: 0 }); cmd({ action: 'set_letdown_flow', normalized: 0 }); },
    'eccs-on': function () { cmd({ action: 'set_hpi', active: true }); },
    'eccs-off': function () { cmd({ action: 'set_hpi', active: false }); },
    'eccs-auto': function () { /* auto-actuation in M4 handles it */ },
    'heat-on': function () { cmd({ action: 'set_heater', power_pct: 100 }); },
    'heat-off': function () { cmd({ action: 'set_heater', power_pct: 0 }); },
    'heat-auto': function () { /* engine auto control */ },
    'spray-open': function () { cmd({ action: 'set_spray', open: true }); },
    'spray-auto': function () { cmd({ action: 'set_spray', open: false }); },
    'feed-start': function () { cmd({ action: 'set_feedwater_flow', pct: 100 }); },
    'feed-stop': function () { cmd({ action: 'set_feedwater_flow', pct: 0 }); },
    'feed-set': function () { cmd({ action: 'set_feedwater_flow', pct: +$('feedSet').value }); },
    'afw-start': function () { cmd({ action: 'set_afw', active: true }); },
    'afw-stop': function () { cmd({ action: 'set_afw', active: false }); },
    'breaker-close': function () { cmd({ action: 'set_steam_demand', mwe: 1000 }); },
    'breaker-open': function () { if (confirm('Open the main breaker (disconnect from grid)?')) cmd({ action: 'set_steam_demand', mwe: 0 }); },
    'mwe-set': function () { cmd({ action: 'set_steam_demand', mwe: +$('mweSet').value }); },
    'save': function () { downloadSave(); },
    'load': function () { $('loadFile').click(); },
    'reset': function () { doReset(); },
    'export-csv': function () { exportCsv(); },
  };

  function bindCommands() {
    document.body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (b && ACTS[b.getAttribute('data-act')]) { ACTS[b.getAttribute('data-act')](); return; }
      var ack = e.target.closest('[data-ack]');
      if (ack) { cmd({ action: 'acknowledge_alarm', alarm_id: ack.getAttribute('data-ack') }); }
    });
    // rod speed selection
    $('rodSpeed').addEventListener('click', function (e) { var b = e.target.closest('[data-rodspeed]'); if (b) ui.rodSpeed = b.getAttribute('data-rodspeed'); });
    // failure inject/clear toggles
    $('failList').addEventListener('click', function (e) {
      var b = e.target.closest('.fail-toggle'); if (!b) return;
      var id = b.getAttribute('data-fail'), row = $('fail-' + id);
      var active = row.classList.contains('active');
      if (active) { cmd({ action: 'clear_failure', failure_id: id }); }
      else {
        var sev = sevOf(id);
        cmd({ action: 'inject_failure', failure_id: id, severity: sev });
      }
    });
    $('failList').addEventListener('input', function (e) {
      var sl = e.target.closest('[data-sevfor]'); if (!sl) return;
      var id = sl.getAttribute('data-sevfor'), row = $('fail-' + id), m = JSON.parse(row.getAttribute('data-meta'));
      var eng = m.min + (+sl.value / 100) * (m.max - m.min);
      row.querySelector('[data-svlabel="' + id + '"]').textContent = m.label + ': ' + Math.round(eng) + ' ' + m.unit;
      if (row.classList.contains('active')) cmd({ action: 'inject_failure', failure_id: id, severity: sevOf(id) });
    });
  }
  function sevOf(id) {
    var sl = document.querySelector('[data-sevfor="' + id + '"]');
    if (!sl) return 1;
    var m = JSON.parse($('fail-' + id).getAttribute('data-meta'));
    var sev = +sl.value / 100;
    return m.invert ? sev : sev; // wire stays 0–1; invert is a display concern
  }

  // ============================================================ lifecycle/UI
  function bindUI() {
    // tabs (do not resize the tools box — tab-body scrolls; CSS holds the split)
    $('tabbar').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tab]'); if (!b) return;
      $('tabbar').querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      document.querySelectorAll('.tabpane').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-pane') === b.getAttribute('data-tab')); });
    });
    // generic segmented active state
    document.querySelectorAll('.seg').forEach(function (seg) {
      seg.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); });
    });
    // play/pause
    $('playBtn').addEventListener('click', function () {
      if (service.running) { service.stop(); $('playBtn').textContent = '▶'; $('playBtn').classList.add('paused'); }
      else { service.start(); $('playBtn').textContent = '⏸'; $('playBtn').classList.remove('paused'); }
    });
    // speed
    $('speed').addEventListener('click', function (e) {
      var b = e.target.closest('[data-speed]'); if (!b) return;
      var v = +b.getAttribute('data-speed');
      cmd({ action: 'set_speed', value: v });
      var fast = v >= 600; $('ffBadge').style.display = fast ? 'block' : 'none'; if (fast) $('ffBadge').textContent = '⚡ ' + v + '×';
    });
    // overlay (two copies: diagram head + settings)
    ['overlaySeg', 'overlaySeg2'].forEach(function (sid) {
      var seg = $(sid); if (!seg) return;
      seg.addEventListener('click', function (e) { var b = e.target.closest('[data-overlay]'); if (!b) return; ui.overlay = b.getAttribute('data-overlay'); syncSeg('[data-overlay]', ui.overlay, 'overlay'); if (latest) renderNumeric(latest); });
    });
    // register
    $('registerSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-register]'); if (!b) return; ui.register = b.getAttribute('data-register'); cmd({ action: 'set_register', value: ui.register }); });
    // units
    $('unitsSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-units]'); if (!b) return; ui.units = b.getAttribute('data-units'); if (latest) render(latest); });
    // graph window
    $('graphWindow').addEventListener('click', function (e) { var b = e.target.closest('[data-win]'); if (!b) return; ui.window = +b.getAttribute('data-win'); drawChart(); });
    // init-state select
    $('initState').addEventListener('change', function () { ui.initState = $('initState').value; });
    // load file
    $('loadFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return; var r = new FileReader();
      r.onload = function () { try { var st = JSON.parse(r.result); service.loadState(st); latest = service.assembleSnapshot(); render(latest); } catch (err) { alert('Bad save file'); } };
      r.readAsText(f);
    });
    // SCRAM guard cover
    setupScramCover();
    // scanner hover
    document.body.addEventListener('mouseover', function (e) {
      var el = e.target.closest('[data-scanner-hint]'); if (!el) return;
      var hint = el.getAttribute('data-scanner-hint'), dash = hint.indexOf(' — ');
      $('scanner').innerHTML = dash > -1 ? '<strong>' + hint.slice(0, dash) + '</strong>' + hint.slice(dash) : hint;
    });
  }
  function syncSeg(sel, val, attr) {
    document.querySelectorAll(sel).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-' + attr) === val); });
  }

  function setupScramCover() {
    var wrap = $('scramWrap'), cover = $('scramCover'), btn = $('scramBtn'), arc = null, timer = null;
    function disarm() { wrap.classList.remove('open'); if (arc) { arc.remove(); arc = null; } if (timer) { clearTimeout(timer); timer = null; } }
    cover.addEventListener('click', function () { if (btn.classList.contains('fired')) return; wrap.classList.add('open'); arc = document.createElement('div'); arc.className = 'scram-arc'; wrap.appendChild(arc); timer = setTimeout(disarm, 3000); });
    btn.addEventListener('click', function () { if (!wrap.classList.contains('open')) return; disarm(); /* command via data-act */ });
  }

  function doReset() {
    if (!confirm('Reset to ' + ui.initState + '? Current run is lost.')) return;
    service.stop();
    service.handleCommand({ action: 'reset', plant_id: 'pwr', initial_state: ui.initState });
    chartBuf = []; Object.keys(gaugeHist).forEach(function (k) { gaugeHist[k] = []; });
    $('playBtn').textContent = '▶'; $('playBtn').classList.add('paused');
    latest = service.assembleSnapshot(); render(latest);
    buildFailures();
  }
  function downloadSave() {
    var data = JSON.stringify(service.saveState(), null, 2);
    var url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    var a = document.createElement('a'); a.href = url; a.download = 'reactor_save.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function exportCsv() {
    var cols = SERIES.filter(function (s) { return ui.series[s.id]; });
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

  // ============================================================ init
  function init() {
    service = new RD.SimulationService({ seed: 0x1234 });
    service.subscribe(render);
    buildGauges(); buildNumeric(); buildGraphParams(); bindUI(); bindCommands();
    service.selectPlant('pwr', ui.initState, null);  // broadcasts the initial snapshot → render
    buildFailures();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
