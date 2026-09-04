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
 * 1. NO SEED AT ALL — neither the design's random walk nor a flat preload. The design
 *    seeds the buffer with 44 jittered samples and ticks a random walk on a 500 ms
 *    setInterval so the card looks alive in the editor. That stays out — a sparkline is
 *    an instrument trace, and inventing excursions the plant never had is fabricating
 *    instrument data (HR1). A FLAT preload (a window of identical samples at the first
 *    real reading) was in from 2026-07-28 to 2026-08-21 *(OWNER RULING, 2026-07-28: "I
 *    want the 6 vital gauges at the top to start with the full amount of data on the
 *    graph starting from a preload… It should be flat")* and was then REMOVED with the
 *    rest of the chart seeds *(OWNER RULING, 2026-08-21: selected "All flat seeds
 *    everywhere" [be removed] from options an agent wrote — #501)*: the trace now fills
 *    live from the right of its fixed time axis, like the strip chart underneath. Known
 *    cosmetic consequence, accepted: for the first window the trace is a stub against
 *    the right-hand edge and the (opacity 0.07) area fill's left edge rises vertically
 *    at the trace's left end.
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
  // Trace window: the last WINDOW_S of SIM time. Sampling on SIM time rather than per
  // render is what keeps the window honest — the board renders at whatever rate the
  // browser gives it (~10 Hz) while the sim can run at up to 3600x, so a per-render buffer
  // showed ~36 s of plant and called it three minutes. Position by TIME, not by index:
  // index positioning made the whole trace slide and compress while the buffer filled.
  /* FIXED AT THREE MINUTES AT EVERY SPEED *(OWNER, 2026-09-03, #619 item 17: "Dont change the
   * 6 vital indication strip chart time window when time warping.")*.
   *
   * It used to widen with time acceleration — a TILE_WINDOWS ladder running 180 s at 1x out to
   * 3600 s at 600x — and that ladder existed for a real reason which HAS SINCE BEEN RETIRED. It
   * was added when a tile got ONE sample per broadcast: at 3600x a broadcast covers 360 s of
   * plant, so a fixed 180 s window held a single vertex and the six vital gauges were simply
   * BLANK above ~600x (the note in pwr_board_wiring.js tile() records it).
   *
   * The tiles were LATER given the service's fine sub-samples (`props.fine`, drained below),
   * and that is what makes a fixed window honest again. Computed from the service's own
   * constants — CHART_FINE_SEC 0.2 s, CHART_FINE_MAX 60 per broadcast, PHYSICS_DT 0.02,
   * broadcast 100 ms — the fine cadence is `max(0.2, simPerBroadcast / 60)`, so a fixed 180 s
   * window holds:
   *
   *      1x-60x   a sample every 0.20 s   900 samples
   *      600x     every 1.00 s            180
   *      3600x    every 6.00 s             30      (60 at the 50 ms transient broadcast)
   *
   * Thirty samples across a ~100 px trace is about one per three pixels. The ladder is not
   * needed and was costing the player the thing the tile is for: a window that means the same
   * three minutes whatever the clock is doing.
   *
   * ⚠ THIS IS NOT THE STRIP CHART. The chart under the board sizes its own window from the
   * speed on purpose *(OWNER, 2026-08-11: "Can you also extend the time window automatically
   * when choosing faster time warps?")* — see CHART_WINDOWS in ui/app.js. Two independent
   * mechanisms; only the tiles are pinned here. */
  var WINDOW_S = 180;
  // One bucket per plot pixel — the decimation unit. See paint().
  var NB = W - 2 * PAD;
  // Retention. Thin the older half rather than truncating the oldest rows: at the 20 Hz
  // transient cadence a flat count silently SHORTENS the window (a 2400-row cap turned
  // "3 minutes" into ~2.4 during exactly the events worth watching). Same idiom as
  // ui/app.js's CHART_ROW_BUDGET.
  var ROW_BUDGET = 1200;
  // Smallest vertical window the sparkline will auto-scale to, as a fraction of full scale.
  // Caps how far instrument noise can be magnified — see paint().
  var MIN_WINDOW = 0.15;
  // Auto-range dwell: how many consecutive paints the data must sit well inside the held
  // band before the axis is allowed to zoom back in. Mirrors CHART_SHRINK_FRAMES.
  var SHRINK_FRAMES = 40;

  function num(v, d) { var n = +v; return isFinite(n) ? n : d; }

  // Write only what changed. `el.textContent = s` replaces the text node even when the
  // string is byte-identical, and paint() runs once per board render (10 Hz, 20 Hz in a
  // transient). MEASURED before this: 330 childList mutations per tile per 10 s of
  // transient — 2000 across the six-tile strip, none carrying new information. The unit
  // never changes at all, and the value only changes when the rounded reading does.
  function txt(el, v) { if (el && el.textContent !== v) el.textContent = v; }
  function sty(el, k, v) { if (el && el.style[k] !== v) el.style[k] = v; }

  // The 1-2-5 ladder and the held-axis policy now live in ui/chart_math.js (#393). They
  // were duplicated here behind a "KEEP IN SYNC WITH ui/app.js" marker — a comment doing
  // a function's job, on two surfaces 12 px apart showing the same six quantities, where
  // a divergence reads directly as "the tile jumped and the chart did not".
  function chartMath() { return (typeof RD !== 'undefined' && RD.ChartMath) || null; }

  function build(cfg, env) {
    var h = env.h;

    var st = {
      label: cfg.label || '',
      unit: cfg.unit || '',
      value: num(cfg.value, 0),
      decimals: Math.max(0, Math.round(num(cfg.digits != null ? cfg.digits : cfg.decimals, 1))),
      min: num(cfg.min, 0),
      max: num(cfg.max, 100),
      note: '', noteKind: 'trip',
      normLo: null, normHi: null, alarmLo: null, alarmHi: null, tripLo: null, tripHi: null
    };
    var hist = [];
    var lastT = null;   // sim time of the last committed sample (see update())
    var seeded = false; // has build()'s untimed placeholder sample been dropped? (see update())
    // Held vertical axis + its zoom-in dwell counter. Null means "re-fit on the next
    // paint" — which is also how a band change, a rewind and reset() invalidate it.
    var held = null, shrinkFor = 0;
    var winS = WINDOW_S;   // the trace window — fixed at every speed, see WINDOW_S
    var unitKey = null;    // display unit the buffer was recorded in

    var padX = num(cfg.padX, 8), padY = num(cfg.padY, 7), gap = num(cfg.gap, 5);
    var labelSize = num(cfg.labelSize, 13), valueSize = num(cfg.valueSize, 28);
    var unitSize = Math.max(9, Math.round(valueSize * 0.4));

    // ------------------------------------------------------------- structure --
    var accentBar = h('div', { style: {
      position: 'absolute', left: 0, top: 0, right: 0, height: '2px', opacity: 0.55
    } });

    var labelEl = h('div', { style: {
      minWidth: 0, color: '#96abbb', fontFamily: "'IBM Plex Sans',system-ui,sans-serif",
      fontSize: labelSize + 'px', fontWeight: 500, letterSpacing: '0.01em', lineHeight: 1.1,
      overflowWrap: 'break-word'
    } }, st.label);

    // EXCEPTION NOTE (#267) — a short right-aligned annotation naming the limit the reading
    // is currently working to, shown only when that limit is NOT the tile's at-power default.
    // A coloured region says "there is a boundary there"; it cannot say WHICH trip, and the
    // operator has no other way to find out without opening the trip-blocks popover. Hidden
    // when empty, so a tile with nothing exceptional to report is unchanged — this is an
    // exception marker, not a permanent caption, and a caption on every tile every second is
    // one nobody reads. It sits in the label row rather than on its own line because the tile
    // is 114 px tall and the sparkline is what would have paid for the extra row.
    // `noteKind` picks the colour from the same region palette the bands use, because the note
    // is not always a warning: a limit you can hit is `trip` (red), whereas protection that is
    // deliberately bypassed for the plant mode you are in is `ok` (grey-blue) — the control
    // layer already reclassifies those alarms to `status` priority when cold, and painting the
    // tile red for the expected state would contradict its own annunciator.
    var noteEl = h('div', { style: {
      flex: 'none', display: 'none', color: REGION_COLORS.trip,
      fontFamily: "'IBM Plex Sans',system-ui,sans-serif",
      fontSize: Math.max(9, labelSize - 2) + 'px', fontWeight: 700, letterSpacing: '0.02em',
      lineHeight: 1.1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums'
    } }, '');
    var labelRow = h('div', { style: {
      flex: 'none', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px'
    } }, labelEl, noteEl);

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
    // Per-bucket min/max envelope, drawn UNDER the trace — one polygon per region run, so
    // it inherits the trace's own colour segmentation instead of inventing a second one.
    var envG = h('g', null);
    var segsG = h('g', null);
    var dotEl = h('circle', { cx: W - PAD, cy: H / 2, r: 2.4, fill: REGION_COLORS.normal });
    var sparkSvg = h('svg', {
      viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none',
      style: { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }
    }, chartBandsG, areaEl, envG, segsG, dotEl);
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
    } }, accentBar, labelRow, readRow, sparkWrap, gaugeSvg);

    // Reuse SVG children instead of clear-and-append. The tile repaints ~10x a second and
    // rebuilt its band rects and trace polylines from scratch each time; app.js already
    // documents that mutating markup off the paint cycle lets the compositor present a
    // half-built frame, which is what the vital strip's flicker was — worst during a
    // transient, when the bands move as well. Pooling means an update is attribute writes
    // on elements that already exist, so there is never an empty intermediate state.
    function poolAt(g, i, tag) {
      var el = g.childNodes[i];
      if (!el) { el = document.createElementNS(RD.BoardH.svgNS, tag); g.appendChild(el); }
      return el;
    }
    function poolTrim(g, n) { while (g.childNodes.length > n) g.removeChild(g.lastChild); }
    function setAttrs(el, a) { for (var k in a) el.setAttribute(k, a[k]); }

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

    // ---- the CURRENT reading's region, with hysteresis (#350 item 16) ----------------
    // A reading parked ON a band edge crosses it on instrument noise alone, and the tile
    // repaints the value colour, the accent bar, the area fill and the trace dot from that
    // region every render — so the whole strip strobes. MEASURED, board driven headless:
    // reactor power at STEADY hot full power changed region **49 times in 40 sim-seconds**
    // (~1.2 Hz) with nothing wrong with the plant, because 100.0 % sits on a boundary and the
    // NIS channel's own sigma is 0.21 %. This is #306's alarm chatter one layer up, and the
    // remedy is the one a real indicator has: the reading must get CLEAR of the edge before
    // the tile agrees that it crossed.
    //
    // Hysteresis is 1 % of the displayed span, applied only to the edge being crossed — so a
    // genuine excursion still repaints the instant it is unambiguous, and only dither is held.
    // It is NOT applied to the trace segmentation below: those are historical samples, each
    // one a fact about where the reading was, and a stateful classifier would rewrite history
    // differently depending on which order the points happened to arrive in.
    var heldRegion = null;
    function currentRegion(REG, v) {
      var r = regionAt(REG, v);
      if (heldRegion) {
        var hy = 0.01 * ((st.max - st.min) || 1);
        // Still inside the held region once its edges are relaxed outward by hy? Stay.
        var lo = isFinite(heldRegion.lo) ? heldRegion.lo - hy : -Infinity;
        var hi = isFinite(heldRegion.hi) ? heldRegion.hi + hy : Infinity;
        if (v >= lo && v < hi) return heldRegion;
      }
      heldRegion = r;
      return r;
    }

    // Gauge bands span the full authored scale, so they only change if min/max or
    // the region bounds change — rebuilt from setBands(), not every frame.
    function rebuildGaugeBands() {
      // The held region (see currentRegion) is an object off the OLD band table; once the
      // bands move it describes bounds the tile no longer has, so drop it and re-classify.
      heldRegion = null;
      var REG = regions(), span = (st.max - st.min) || 1, used = 0;
      REG.forEach(function (r) {
        var a = Math.max(st.min, isFinite(r.lo) ? r.lo : st.min);
        var b = Math.min(st.max, isFinite(r.hi) ? r.hi : st.max);
        if (b <= a) return;
        var x0 = ((a - st.min) / span) * GW, x1 = ((b - st.min) / span) * GW;
        setAttrs(poolAt(gaugeBandsG, used++, 'rect'), {
          x: x0.toFixed(1), y: 2, width: (x1 - x0).toFixed(1), height: 4,
          fill: REGION_COLORS[r.key], opacity: 0.75
        });
      });
      poolTrim(gaugeBandsG, used);
    }

    // ------------------------------------------------------------------ paint --
    function paint() {
      if (!hist.length) return;
      var REG = regions();
      var n = hist.length, cur = hist[n - 1].v;

      // x by TIME across a fixed WINDOW_S, so the trace scrolls at a constant rate instead
      // of stretching to fill the width while the buffer fills.
      var tNow = hist[n - 1].t, tHave = hist[0].t;
      var useTime = (tNow != null && tHave != null && tNow > tHave);
      var t0 = useTime ? Math.min(tHave, tNow - winS) : 0;
      var tSpan = useTime ? (tNow - t0) : 1;

      // ---- DECIMATION: absolute-grid time buckets carrying min/max, one bucket per pixel.
      //
      // This replaced an INDEX STRIDE (`for q += ceil(n/DRAW_MAX)`), which had two faults
      // that the strip chart underneath had already been fixed for (ui/app.js drawChart,
      // 2026-08-05) and this tile had not:
      //
      //  1. A stride DROPS EXTREMES. A spike between two sampled indices simply vanished —
      //     from a VITAL gauge. Bucketing keeps each bucket's min and max, so a transient
      //     can be thinned but not hidden.
      //  2. The bucket grid was effectively anchored to a moving origin, so points shifted
      //     WITHIN the trace as it scrolled and old history kept changing shape. The grid
      //     here is absolute (`floor(t / secPerBucket)`), and each point is plotted at its
      //     bucket's OWN grid time rather than the mean of whatever members it currently
      //     holds — so a drawn point never moves once drawn.
      var secPerBucket = tSpan / NB;
      var bOrigin = Math.floor(t0 / secPerBucket);
      var pts;
      if (!useTime || n <= 2) {
        pts = hist.map(function (r) { return { t: r.t, v: r.v, lo: r.v, hi: r.v }; });
      } else {
        var sum = {}, cnt = {}, blo = {}, bhi = {};
        for (var q = 0; q < n; q++) {
          var rv = hist[q].v;
          if (rv == null || !isFinite(rv)) continue;
          var bk = Math.floor(hist[q].t / secPerBucket) - bOrigin;
          if (bk < 0) bk = 0; else if (bk >= NB) bk = NB - 1;
          if (cnt[bk] === undefined) { sum[bk] = 0; cnt[bk] = 0; blo[bk] = Infinity; bhi[bk] = -Infinity; }
          sum[bk] += rv; cnt[bk] += 1;
          // A fine row already carries the EXTREMES the service folded over its own
          // sub-interval, so fold those rather than just its mean — otherwise the
          // sub-sampling buys resolution and throws the excursions away again.
          var rlo = (hist[q].lo != null && isFinite(hist[q].lo)) ? hist[q].lo : rv;
          var rhi = (hist[q].hi != null && isFinite(hist[q].hi)) ? hist[q].hi : rv;
          if (rlo < blo[bk]) blo[bk] = rlo;
          if (rhi > bhi[bk]) bhi[bk] = rhi;
        }
        pts = [];
        for (var bk2 = 0; bk2 < NB; bk2++) {
          if (cnt[bk2] === undefined) continue;
          pts.push({ t: (bOrigin + bk2 + 0.5) * secPerBucket, v: sum[bk2] / cnt[bk2],
                     lo: blo[bk2], hi: bhi[bk2] });
        }
      }
      var m = pts.length;
      if (!m) return;

      // ---- RANGE. Two rules, and the order matters.
      //
      // (a) THE BAND SETS IT, NOT THE LINE. Otherwise the excursion the envelope exists to
      //     reveal gets drawn outside the axis and clipped away.
      // (b) A FLOOR of MIN_WINDOW of full scale. Without it a dead-steady plant fills the
      //     whole 36 px with instrument noise: primary pressure sitting at 2235 ±1 psi drew
      //     a trace that looked like a transient. Magnifying sub-resolution noise is not
      //     showing the operator more, it is showing them alarm where there is none.
      var lo = Infinity, hi = -Infinity;
      for (var w = 0; w < m; w++) {
        if (pts[w].lo < lo) lo = pts[w].lo;
        if (pts[w].hi > hi) hi = pts[w].hi;
      }
      // The real data extremes used to be kept here so the clamp below could not exclude
      // the trace. holdRange owns that guarantee now (#393) — it re-expands to contain the
      // data after applying the clamp preference — so there is nothing left to carry.
      var floorSpan = (st.max - st.min) * MIN_WINDOW;
      if ((hi - lo) < floorSpan) {
        var mid = (hi + lo) / 2;
        lo = mid - floorSpan / 2; hi = mid + floorSpan / 2;
      }
      // ---- HOLD the axis on a 1-2-5 ladder instead of re-fitting every paint.
      // Re-fitting each frame re-projects the WHOLE trace each frame: history that had
      // already been drawn kept sliding and changing shape, which reads as the tile
      // breathing and contributed to the transient flicker reported 2026-08-06. Between
      // re-fits every drawn point is frozen.
      //
      // The policy is RD.ChartMath.holdRange (#393) — the same call the strip chart makes,
      // so the two cannot drift. What stays here is PLACEMENT: this tile applies none, the
      // chart slides the band onto a lane. `st.min`/`st.max` go in as a clamp PREFERENCE,
      // which holdRange is careful never to let beat the data — see the 2026-08-06
      // trace-drew-outside-the-card note there, which is this tile's own bug.
      var cm = chartMath();
      if (cm) {
        var hr = cm.holdRange(held, lo, hi, {
          minSpan: floorSpan, shrinkFrames: SHRINK_FRAMES, shrinkFor: shrinkFor,
          clampLo: st.min, clampHi: st.max
        });
        lo = hr.lo; hi = hr.hi; held = hr.held; shrinkFor = hr.shrinkFor;
      }
      if (hi - lo < 1e-9) hi = lo + 1;
      function xs(i) {
        if (m < 2) return W - PAD;
        if (!useTime) return PAD + (i / (m - 1)) * (W - 2 * PAD);
        return PAD + ((pts[i].t - t0) / tSpan) * (W - 2 * PAD);
      }
      // HARD GUARD. The range logic above should always contain the data, but a value
      // plotted outside the viewBox escapes the card entirely (overflow:visible), so a
      // range bug becomes a board-wide visual defect rather than a clipped trace. Pinned
      // to the edge it reads as "off scale", which is honest and stays inside the tile.
      function ys(v) {
        var y = PAD + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD);
        return y < 0 ? 0 : y > H ? H : y;
      }
      function colorAt(v) { return REGION_COLORS[regionAt(REG, v).key]; }

      // currentRegion, not regionAt — this is the live reading and it carries the hysteresis.
      var curColor = REGION_COLORS[currentRegion(REG, cur).key];
      sty(valEl, 'color', curColor);
      txt(valEl, cur.toFixed(st.decimals));
      txt(unitEl, st.unit);
      sty(accentBar, 'background', 'linear-gradient(90deg,transparent,' + curColor + ',transparent)');
      areaEl.setAttribute('fill', curColor);
      dotEl.setAttribute('fill', curColor);

      // trace, split into one polyline per run of samples in the same region so the
      // line changes colour where it crosses a band edge; each run is extended one
      // sample so consecutive runs stay visually joined.
      //
      // The min/max ENVELOPE is emitted from the SAME run boundaries, one translucent
      // polygon per run, which is what keeps the two in step by construction — a single
      // envelope in the current colour would be wrong wherever it straddles a band edge.
      // Only where the band is actually wider than the stroke (~1.2 px), so a steady
      // trace does not get a permanent grey halo.
      var segUsed = 0, envUsed = 0;
      var runStart = 0, runKey = regionAt(REG, pts[0].v).key;
      for (var i = 1; i <= m; i++) {
        var k = i < m ? regionAt(REG, pts[i].v).key : null;
        if (k === runKey) continue;
        var end = Math.min(m - 1, i), seg = [], top = [], bot = [], wide = false;
        for (var j = runStart; j <= end; j++) {
          var x = xs(j), yl = ys(pts[j].lo), yh = ys(pts[j].hi);
          seg.push(x.toFixed(1) + ',' + ys(pts[j].v).toFixed(1));
          top.push(x.toFixed(1) + ',' + yh.toFixed(1));
          bot.push(x.toFixed(1) + ',' + yl.toFixed(1));
          if (yl - yh > 1.2) wide = true;
        }
        setAttrs(poolAt(segsG, segUsed++, 'polyline'), {
          points: seg.join(' '), fill: 'none', stroke: REGION_COLORS[runKey],
          'stroke-width': 1.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
          opacity: 0.9, 'vector-effect': 'non-scaling-stroke'
        });
        if (wide) {
          bot.reverse();
          setAttrs(poolAt(envG, envUsed++, 'polygon'), {
            points: top.concat(bot).join(' '), fill: REGION_COLORS[runKey],
            stroke: 'none', opacity: 0.22
          });
        }
        runStart = i; runKey = k;
      }
      poolTrim(segsG, segUsed);
      poolTrim(envG, envUsed);

      // faint region shading behind the trace — tracks the auto-scaled window
      var bandUsed = 0;
      REG.forEach(function (r) {
        var top = isFinite(r.hi) ? r.hi : hi, bot = isFinite(r.lo) ? r.lo : lo;
        var y0 = Math.max(0, Math.min(H, ys(Math.min(top, hi))));
        var y1 = Math.max(0, Math.min(H, ys(Math.max(bot, lo))));
        if (y1 - y0 <= 0.3) return;
        setAttrs(poolAt(chartBandsG, bandUsed++, 'rect'), {
          x: 0, y: y0.toFixed(1), width: W, height: (y1 - y0).toFixed(1),
          fill: REGION_COLORS[r.key], opacity: 0.09
        });
      });
      poolTrim(chartBandsG, bandUsed);

      var area = 'M' + xs(0).toFixed(1) + ',' + (H - PAD);
      for (var a = 0; a < m; a++) area += ' L' + xs(a).toFixed(1) + ',' + ys(pts[a].v).toFixed(1);
      area += ' L' + xs(m - 1).toFixed(1) + ',' + (H - PAD) + ' Z';
      areaEl.setAttribute('d', area);
      dotEl.setAttribute('cx', xs(m - 1).toFixed(1));
      dotEl.setAttribute('cy', ys(cur).toFixed(1));

      // gauge marker
      var pct = Math.max(0, Math.min(1, (cur - st.min) / ((st.max - st.min) || 1)));
      markerEl.setAttribute('x', (pct * GW).toFixed(1));

      // Trend from the slope of the recent window against the one before it. Measured over
      // a fixed span of SAMPLES, which is now ~10 per second — so compare tens of seconds,
      // not the handful of samples the old slower buffer held.
      var kk = Math.min(120, Math.floor(n / 2)) || 1;
      var recent = hist.slice(-kk), older = hist.slice(-2 * kk, -kk);
      function avg(arr) { var s = 0; for (var q = 0; q < arr.length; q++) s += arr[q].v; return s / (arr.length || 1); }
      var ra = avg(recent), oa = older.length ? avg(older) : ra;
      var slope = (ra - oa) / ((hi - lo) || 1);
      if (slope > 0.03) { txt(trendEl, '▲'); sty(trendEl, 'color', '#6fe0a8'); }
      else if (slope < -0.03) { txt(trendEl, '▼'); sty(trendEl, 'color', '#e8975a'); }
      else { txt(trendEl, '–'); sty(trendEl, 'color', '#5c7182'); }
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
      // `note` is tri-state on purpose: undefined leaves it alone (a driver that never sets
      // it is unaffected), null/'' clears it, a string shows it.
      if (props.note !== undefined) {
        var note = props.note || '';
        var kind = REGION_COLORS[props.noteKind] ? props.noteKind : 'trip';
        if (note !== st.note || kind !== st.noteKind) {
          st.note = note; st.noteKind = kind;
          noteEl.textContent = note;
          noteEl.style.color = REGION_COLORS[kind];
          noteEl.style.display = note ? '' : 'none';
        }
      }
      if (props.unit != null) st.unit = props.unit;
      if (props.decimals != null) st.decimals = Math.max(0, Math.round(+props.decimals));
      // A band change is a SCALE change, so the held axis no longer describes this tile.
      if (bandsChanged) { rebuildGaugeBands(); held = null; shrinkFor = 0; }

      // A DISPLAY-UNIT FLIP invalidates the whole buffer. st.min/st.max arrive already
      // converted but `hist` holds readings in the previous unit, so keeping it would
      // splice °F onto °C — a step discontinuity in the middle of the trace, and a held
      // axis fitted to the wrong numbers. Drop it and restart the trace, the same thing a
      // rewind does. Only the three convertible tiles ever see this; the rest never change key.
      if (props.unitKey != null && props.unitKey !== unitKey) {
        if (unitKey !== null) { hist.length = 0; lastT = null; seeded = false; held = null; shrinkFor = 0; }
        unitKey = props.unitKey;
      }

      // Window follows the speed setting. Changing it does NOT clear the buffer — the rows
      // are timestamped, so widening simply exposes more of what is already there and
      // narrowing trims on the next pass. A widen therefore leaves the trace occupying the
      // right-hand fraction of the card until the plant fills it, which is DELIBERATE:
      // back-filling flat history for a stretch the tile watched and knows was not flat
      // would be fabricating instrument data (HR1, and departure 1 in the file header).
      /* `props.speed` is no longer read — the window is fixed (see WINDOW_S). The prop is
       * still delivered by pwr_board_wiring.js tile() and is deliberately left unused rather
       * than removed: board_check and the lane_reference golden artifact both build these
       * props, and dropping a key from that shape is a wider change than this item. It is
       * inert, not dark: nothing downstream reads it, so nothing can silently depend on it. */

      // A missing/failed instrument must not push a fabricated sample onto the trace.
      if (props.value == null || !isFinite(+props.value)) { txt(valEl, '—'); return; }
      st.value = +props.value;

      // Sample on SIM time so the window is a true 3 minutes at any speed. A rewind (or a
      // reload to an earlier state) moves sim time BACKWARDS — drop the stale tail rather
      // than splicing a pre-rewind trace onto a post-rewind plant.
      var t = (props.t != null && isFinite(+props.t)) ? +props.t : null;
      if (t != null && lastT != null && t < lastT) {
        hist.length = 0; lastT = null; seeded = false;
        held = null; shrinkFor = 0;   // the held axis described the abandoned future
      }
      // NO PRELOAD (see departure 1 in the file header — the 2026-07-28 flat preload was
      // removed 2026-08-21 with the rest of the #501 seeds; the trace fills live from the
      // right). The `seeded` latch still has one job: build() calls update() once with the
      // authored config value and NO `t` — that untimed sample is a placeholder, not
      // history, so the first timed sample drops it rather than letting it anchor the trace.
      if (!seeded && t != null) {
        seeded = true;
        hist.length = 0;
      }
      // SUB-BROADCAST SAMPLES FIRST, then the broadcast instant. Without them the trace has
      // one vertex per broadcast, and sim-seconds per broadcast is accel x 0.1 — so at 600x
      // a 3600 s window holds 6 points across 230 px. The service already folds these on a
      // fixed SIM-time interval, so vertex density stops depending on speed.
      //
      // `t <= lastT` is dropped, which does double duty: it keeps the buffer monotonic, and
      // it makes a RE-DELIVERED batch a no-op. PwrBoard.render() can legitimately be called
      // twice with the same snapshot — a display-unit flip does exactly that, and
      // board_check does it ~20 times — so without the guard those rows would be appended
      // twice. No sequence bookkeeping needed.
      //
      // Absent `props.fine` is a clean no-op: board_check never loads app.js, so nothing
      // sets RD.ChartFine there and the tile simply falls back to broadcast-rate sampling.
      if (props.fine && props.fine.length && t != null) {
        for (var fi = 0; fi < props.fine.length; fi++) {
          var fr = props.fine[fi];
          if (fr.t == null || !isFinite(fr.t)) continue;
          if (lastT != null && fr.t <= lastT) continue;
          if (fr.t >= t) continue;                  // the broadcast row below owns that instant
          hist.push({ t: fr.t, v: fr.v, lo: fr.lo, hi: fr.hi });
          lastT = fr.t;
        }
      }
      // One sample per update. The board renders once per broadcast, and paint() decimates
      // to one bucket per pixel, so there is no interval gate here and no need for one.
      // (Three comments used to describe committing "every SAMPLE_S of SIM time". There is
      // no SAMPLE_S — it was named in prose only, never declared, and no gate existed. They
      // were leftovers of a superseded design, and self-contradictory: the same blocks went
      // on to say "Sample EVERY update … position the trace by TIME, not by index".)
      lastT = t;
      hist.push({ t: t, v: st.value });
      // Drop by TIME, not by count, so the window is honest at any acceleration.
      if (t != null) {
        var cut = t - winS, d = 0;
        while (d < hist.length && hist[d].t != null && hist[d].t < cut) d++;
        if (d) hist.splice(0, d);
      }
      // Over budget: THIN the older half rather than truncating the oldest rows. Truncating
      // silently shortens the window exactly when it matters — at the 20 Hz transient
      // cadence the old flat cap turned a "3 minute" trace into ~2.4 minutes mid-event.
      // Halving the old half keeps the full span at lower resolution, and the buckets it
      // feeds carry min/max, so thinning cannot hide a spike either.
      if (hist.length > ROW_BUDGET) {
        var halfway = hist.length >> 1, kept = [];
        for (var z = 0; z < halfway; z += 2) kept.push(hist[z]);
        hist = kept.concat(hist.slice(halfway));
      }
      paint();
    }

    // Discard history — used when the sim rewinds or reloads, so the trace does not
    // splice a pre-rewind tail onto a post-rewind plant.
    function reset() {
      hist.length = 0; lastT = null; seeded = false; heldRegion = null;
      held = null; shrinkFor = 0;
      txt(valEl, '—');
    }

    rebuildGaugeBands();
    if (cfg.value != null && isFinite(+cfg.value)) update({ value: +cfg.value });

    return { el: root, update: update, reset: reset, destroy: function () {} };
  }
})();
