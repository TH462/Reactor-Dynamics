/* comp_indicator_panel.js — vital-parameter tile, ported from the Claude Design
 * project's "Indicator Panel.dc.html" (project 6ad9a164, read 2026-07-27).
 *
 * Six of these form the strip across the top of the board: reactor power, Tavg,
 * subcooling margin, primary pressure, pressurizer level, SG level. Each shows a
 * label, the current value + unit, a trend arrow, a region-coloured sparkline of
 * recent history, and a full-scale gauge band with a marker at the present value.
 *
 * TWO DELIBERATE DEPARTURES FROM THE DESIGN SOURCE:
 *
 * 1. NO SYNTHETIC HISTORY. The design seeds the buffer with 44 jittered samples and
 *    ticks a random walk on a 500 ms setInterval so the card looks alive in the
 *    editor. Here the buffer is fed the REAL instrument value on each update() —
 *    i.e. at the board's render cadence — and seeds FLAT at the first sample. A
 *    sparkline is an instrument trace; inventing 44 samples of history the plant
 *    never had would be fabricating instrument data (HR1). The trace starts as a
 *    flat line and fills in honestly.
 *
 * 2. REGION BOUNDS COME FROM THE DRIVER. The design falls back to fractions of the
 *    scale (normal = 25–75 % of span), which is meaningless for a plant parameter —
 *    it would paint 100 % reactor power in the grey "acceptable" band. The driver
 *    passes real normLo/normHi/alarmLo/alarmHi/tripLo/tripHi from plant setpoints;
 *    the fractional defaults survive only so an unconfigured tile still renders.
 *
 * Geometry, colours and the region model are otherwise verbatim from the source.
 */
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};
  RD.BoardComps = RD.BoardComps || {};
  RD.BoardComps['Indicator Panel'] = { build: build };

  // Operating regions, low side to high side:
  //   trip (red) | alarm (yellow) | acceptable (grey) | NORMAL (green) | acceptable | alarm | trip
  var REGION_COLORS = { normal: '#74dc9c', ok: '#7f95a5', alarm: '#ffd166', trip: '#ff6a4d' };

  var W = 240, H = 36, PAD = 5;   // sparkline viewBox
  var GW = W - 4;                 // gauge inner width
  // Trace window: the last 3 minutes of SIM time, sampled evenly. Sampling on sim time
  // rather than per render matters — the board renders at whatever rate the browser gives
  // it, and the sim runs at up to 3600×, so a per-render buffer would cover three minutes
  // of wall clock at 1× and about three seconds of it at speed. One sample every
  // WINDOW_S / HIST_MAX seconds keeps the window honest at any time acceleration.
  // Sample EVERY update — the same cadence the strip chart runs at — so the trace responds
  // as fast as the plant does. The earlier 1-sample-per-2s window guaranteed exactly three
  // minutes at any time acceleration, but at 1× it made the tiles feel dead: a rod pull
  // took three samples to show. Fidelity wins; the buffer is sized to hold roughly three
  // minutes at the normal render rate instead of enforcing it.
  var HIST_MAX = 360;
  // Smallest vertical window the sparkline will auto-scale to, as a fraction of full scale.
  // Caps how far instrument noise can be magnified — see paint().
  var MIN_WINDOW = 0.15;

  function num(v, d) { var n = +v; return isFinite(n) ? n : d; }

  function build(cfg, env) {
    var h = env.h;

    var st = {
      label: cfg.label || '',
      unit: cfg.unit || '',
      value: num(cfg.value, 0),
      decimals: Math.max(0, Math.round(num(cfg.digits != null ? cfg.digits : cfg.decimals, 1))),
      min: num(cfg.min, 0),
      max: num(cfg.max, 100),
      normLo: null, normHi: null, alarmLo: null, alarmHi: null, tripLo: null, tripHi: null
    };
    var hist = [];
    var lastT = null;   // sim time of the last committed sample (see update())

    var padX = num(cfg.padX, 8), padY = num(cfg.padY, 7), gap = num(cfg.gap, 5);
    var labelSize = num(cfg.labelSize, 13), valueSize = num(cfg.valueSize, 28);
    var unitSize = Math.max(9, Math.round(valueSize * 0.4));

    // ------------------------------------------------------------- structure --
    var accentBar = h('div', { style: {
      position: 'absolute', left: 0, top: 0, right: 0, height: '2px', opacity: 0.55
    } });

    var labelEl = h('div', { style: {
      flex: 'none', color: '#96abbb', fontFamily: "'IBM Plex Sans',system-ui,sans-serif",
      fontSize: labelSize + 'px', fontWeight: 500, letterSpacing: '0.01em', lineHeight: 1.1,
      overflowWrap: 'break-word'
    } }, st.label);

    var valEl = h('span', { style: {
      fontFamily: "'IBM Plex Sans',system-ui,sans-serif", fontSize: valueSize + 'px',
      fontWeight: 700, lineHeight: 0.9, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums'
    } }, '—');
    var unitEl = h('span', { style: {
      color: '#9ab0c0', fontFamily: "'IBM Plex Sans',system-ui,sans-serif",
      fontSize: unitSize + 'px', fontWeight: 500
    } }, st.unit);
    var trendEl = h('div', { style: {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '22px', height: '22px', flex: 'none', fontSize: '15px', lineHeight: 1
    } }, '–');

    var readRow = h('div', { style: {
      flex: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px'
    } },
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '5px', minWidth: 0 } }, valEl, unitEl),
      trendEl);

    // sparkline: bands + area + per-region trace segments + current-sample dot
    var chartBandsG = h('g', null);
    var areaEl = h('path', { d: '', fill: REGION_COLORS.normal, opacity: 0.07 });
    var segsG = h('g', null);
    var dotEl = h('circle', { cx: W - PAD, cy: H / 2, r: 2.4, fill: REGION_COLORS.normal });
    var sparkSvg = h('svg', {
      viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none',
      style: { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }
    }, chartBandsG, areaEl, segsG, dotEl);
    var sparkWrap = h('div', { style: { flex: 1, minHeight: 0, position: 'relative' } }, sparkSvg);

    // gauge: static track + static full-scale region bands + moving marker
    var gaugeBandsG = h('g', null);
    var markerEl = h('rect', { x: 0, y: -1, width: 3, height: 10, rx: 1.5, fill: '#eef6fb' });
    var gaugeSvg = h('svg', {
      viewBox: '0 0 ' + W + ' 8', preserveAspectRatio: 'none',
      style: { flex: 'none', width: '100%', height: '8px', overflow: 'visible' }
    },
      h('rect', { x: 0, y: 2, width: W, height: 4, rx: 2, fill: '#182634' }),
      gaugeBandsG, markerEl);

    var root = h('div', { style: {
      width: '100%', height: '100%', padding: padY + 'px ' + padX + 'px',
      background: '#0e1620', border: '1px solid #22323e', borderRadius: '12px',
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: gap + 'px',
      fontFamily: "'IBM Plex Sans',system-ui,sans-serif"
    } }, accentBar, labelEl, readRow, sparkWrap, gaugeSvg);

    // ---------------------------------------------------------------- regions --
    function regions() {
      var span = (st.max - st.min) || 1;
      function at(f) { return st.min + f * span; }
      var tripLo = st.tripLo != null ? st.tripLo : at(0.05);
      var alarmLo = st.alarmLo != null ? st.alarmLo : at(0.12);
      var normLo = st.normLo != null ? st.normLo : at(0.25);
      var normHi = st.normHi != null ? st.normHi : at(0.75);
      var alarmHi = st.alarmHi != null ? st.alarmHi : at(0.88);
      var tripHi = st.tripHi != null ? st.tripHi : at(0.95);
      return [
        { lo: -Infinity, hi: tripLo, key: 'trip' },
        { lo: tripLo, hi: alarmLo, key: 'alarm' },
        { lo: alarmLo, hi: normLo, key: 'ok' },
        { lo: normLo, hi: normHi, key: 'normal' },
        { lo: normHi, hi: alarmHi, key: 'ok' },
        { lo: alarmHi, hi: tripHi, key: 'alarm' },
        { lo: tripHi, hi: Infinity, key: 'trip' }
      ];
    }
    function regionAt(REG, v) {
      for (var i = 0; i < REG.length; i++) if (v < REG[i].hi) return REG[i];
      return REG[REG.length - 1];
    }

    // Gauge bands span the full authored scale, so they only change if min/max or
    // the region bounds change — rebuilt from setBands(), not every frame.
    function rebuildGaugeBands() {
      RD.BoardH.clear(gaugeBandsG);
      var REG = regions(), span = (st.max - st.min) || 1;
      REG.forEach(function (r) {
        var a = Math.max(st.min, isFinite(r.lo) ? r.lo : st.min);
        var b = Math.min(st.max, isFinite(r.hi) ? r.hi : st.max);
        if (b <= a) return;
        var x0 = ((a - st.min) / span) * GW, x1 = ((b - st.min) / span) * GW;
        gaugeBandsG.appendChild(h('rect', {
          x: x0.toFixed(1), y: 2, width: (x1 - x0).toFixed(1), height: 4,
          fill: REGION_COLORS[r.key], opacity: 0.75
        }));
      });
    }

    // ------------------------------------------------------------------ paint --
    function paint() {
      if (!hist.length) return;
      var REG = regions();
      var n = hist.length, cur = hist[n - 1];

      // Sparkline window auto-scales to what is visible, but with a FLOOR of MIN_WINDOW of
      // the tile's full scale. Without the floor a dead-steady plant fills the whole 36 px
      // with instrument noise: primary pressure sitting at 2235 ±1 psi drew a trace that
      // looked like a transient. Magnifying sub-resolution noise to full height is not
      // showing the operator more information, it is showing them alarm where there is
      // none. With the floor, noise renders as the small wiggle it actually is and a real
      // excursion is the thing that moves the line.
      var lo = Math.min.apply(null, hist), hi = Math.max.apply(null, hist);
      var floorSpan = (st.max - st.min) * MIN_WINDOW;
      if ((hi - lo) < floorSpan) {
        var mid = (hi + lo) / 2;
        lo = mid - floorSpan / 2; hi = mid + floorSpan / 2;
      }
      function xs(i) { return n < 2 ? W - PAD : PAD + (i / (n - 1)) * (W - 2 * PAD); }
      function ys(v) { return PAD + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD); }
      function colorAt(v) { return REGION_COLORS[regionAt(REG, v).key]; }

      var curColor = colorAt(cur);
      valEl.style.color = curColor;
      valEl.textContent = cur.toFixed(st.decimals);
      unitEl.textContent = st.unit;
      accentBar.style.background = 'linear-gradient(90deg,transparent,' + curColor + ',transparent)';
      areaEl.setAttribute('fill', curColor);
      dotEl.setAttribute('fill', curColor);

      // trace, split into one polyline per run of samples in the same region so the
      // line changes colour where it crosses a band edge; each run is extended one
      // sample so consecutive runs stay visually joined
      RD.BoardH.clear(segsG);
      var runStart = 0, runKey = regionAt(REG, hist[0]).key;
      for (var i = 1; i <= n; i++) {
        var k = i < n ? regionAt(REG, hist[i]).key : null;
        if (k === runKey) continue;
        var end = Math.min(n - 1, i), seg = [];
        for (var j = runStart; j <= end; j++) seg.push(xs(j).toFixed(1) + ',' + ys(hist[j]).toFixed(1));
        segsG.appendChild(h('polyline', {
          points: seg.join(' '), fill: 'none', stroke: REGION_COLORS[runKey],
          strokeWidth: 1.6, strokeLinejoin: 'round', strokeLinecap: 'round',
          opacity: 0.9, vectorEffect: 'non-scaling-stroke'
        }));
        runStart = i; runKey = k;
      }

      // faint region shading behind the trace — tracks the auto-scaled window
      RD.BoardH.clear(chartBandsG);
      REG.forEach(function (r) {
        var top = isFinite(r.hi) ? r.hi : hi, bot = isFinite(r.lo) ? r.lo : lo;
        var y0 = Math.max(0, Math.min(H, ys(Math.min(top, hi))));
        var y1 = Math.max(0, Math.min(H, ys(Math.max(bot, lo))));
        if (y1 - y0 <= 0.3) return;
        chartBandsG.appendChild(h('rect', {
          x: 0, y: y0.toFixed(1), width: W, height: (y1 - y0).toFixed(1),
          fill: REGION_COLORS[r.key], opacity: 0.09
        }));
      });

      var area = 'M' + xs(0).toFixed(1) + ',' + (H - PAD);
      for (var a = 0; a < n; a++) area += ' L' + xs(a).toFixed(1) + ',' + ys(hist[a]).toFixed(1);
      area += ' L' + xs(n - 1).toFixed(1) + ',' + (H - PAD) + ' Z';
      areaEl.setAttribute('d', area);
      dotEl.setAttribute('cx', xs(n - 1).toFixed(1));
      dotEl.setAttribute('cy', ys(cur).toFixed(1));

      // gauge marker
      var pct = Math.max(0, Math.min(1, (cur - st.min) / ((st.max - st.min) || 1)));
      markerEl.setAttribute('x', (pct * GW).toFixed(1));

      // trend from the slope of the recent window against the one before it
      var kk = Math.min(8, Math.floor(n / 2)) || 1;
      var recent = hist.slice(-kk), older = hist.slice(-2 * kk, -kk);
      function avg(arr) { var s = 0; for (var q = 0; q < arr.length; q++) s += arr[q]; return s / (arr.length || 1); }
      var ra = avg(recent), oa = older.length ? avg(older) : ra;
      var slope = (ra - oa) / ((hi - lo) || 1);
      if (slope > 0.03) { trendEl.textContent = '▲'; trendEl.style.color = '#6fe0a8'; }
      else if (slope < -0.03) { trendEl.textContent = '▼'; trendEl.style.color = '#e8975a'; }
      else { trendEl.textContent = '–'; trendEl.style.color = '#5c7182'; }
    }

    // ----------------------------------------------------------------- update --
    // Called once per board render with the live instrument value. One sample in,
    // one sample onto the trace — no interpolation, no invented intermediate points.
    function update(props) {
      if (!props) return;
      var bandsChanged = false;
      ['min', 'max', 'normLo', 'normHi', 'alarmLo', 'alarmHi', 'tripLo', 'tripHi'].forEach(function (k) {
        if (props[k] != null && props[k] !== st[k]) { st[k] = +props[k]; bandsChanged = true; }
      });
      if (props.label != null && props.label !== st.label) { st.label = props.label; labelEl.textContent = st.label; }
      if (props.unit != null) st.unit = props.unit;
      if (props.decimals != null) st.decimals = Math.max(0, Math.round(+props.decimals));
      if (bandsChanged) rebuildGaugeBands();

      // A missing/failed instrument must not push a fabricated sample onto the trace.
      if (props.value == null || !isFinite(+props.value)) { valEl.textContent = '—'; return; }
      st.value = +props.value;

      // Sample on SIM time so the window is a true 3 minutes at any speed. A rewind (or a
      // reload to an earlier state) moves sim time BACKWARDS — drop the stale tail rather
      // than splicing a pre-rewind trace onto a post-rewind plant.
      // A rewind (or a reload to an earlier state) moves sim time BACKWARDS — drop the
      // stale tail rather than splicing a pre-rewind trace onto a post-rewind plant.
      var t = (props.t != null && isFinite(+props.t)) ? +props.t : null;
      if (t != null && lastT != null && t < lastT) hist.length = 0;
      if (t != null) lastT = t;
      hist.push(st.value);
      if (hist.length > HIST_MAX) hist.splice(0, hist.length - HIST_MAX);
      paint();
    }

    // Discard history — used when the sim rewinds or reloads, so the trace does not
    // splice a pre-rewind tail onto a post-rewind plant.
    function reset() { hist.length = 0; lastT = null; valEl.textContent = '—'; }

    rebuildGaugeBands();
    if (cfg.value != null && isFinite(+cfg.value)) update({ value: +cfg.value });

    return { el: root, update: update, reset: reset, destroy: function () {} };
  }
})();
