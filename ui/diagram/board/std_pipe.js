/*
 * Standardized pipe kit for the PWR reactor components.
 * Single source of truth for pipe geometry, flanges, connection stubs and fluid colors,
 * so every component (pumps, valves, vessels, headers) draws pipes and ports identically.
 *
 * Load once per component:  <script src="./pipes.js"></script>   (inside <helmet>)
 * Then in a logic class:     const K = window.StdPipe.createKit(React.createElement);
 *                            C.push(K.pipe({ key:'p1', x1, y1, x2, y2, d:14, fluid:'hotLeg' }));
 *
 * RENDERING MODEL — "stacked stroke":
 *   each run is 3 overlaid polylines on one centerline:
 *     casing  strokeWidth = d + 2*wall   (pipe walls)
 *     bore    strokeWidth = d            (static fluid fill, color = fluid.bore)
 *     flow    strokeWidth = ~0.42*d      (dashed + animated, color = fluid.flow)
 *   -> scales with a single `d`; round joins handle elbows; identical everywhere.
 */
(function () {
  var WALL = '#3b4f5e';      // pipe wall / casing
  var FLANGE = '#4a5f6e';    // flange bar face
  var FLANGE_DK = '#243642'; // flange / wall outline

  // Fluid presets — bore = static fill inside the pipe, flow = moving dashed line.
  // Temperature + phase encoded as color, per the plant's convention.
  var FLUIDS = {
    coldWater:  { bore: '#12314c', flow: '#5aa0e6', label: 'COLD WATER' },   // blue  - cold
    coldLeg:    { bore: '#12314c', flow: '#5aa0e6', label: 'RCS COLD LEG' },
    coolWater:  { bore: '#123a45', flow: '#3fd0d0', label: 'FEEDWATER' },    // teal  - cool/feed
    condensate: { bore: '#123a45', flow: '#7fe0d0', label: 'CONDENSATE' },
    warmWater:  { bore: '#2b2f2a', flow: '#c9d15a', label: 'WARM WATER' },   // amber-ish - warm
    hotWater:   { bore: '#3a1512', flow: '#ff6a4d', label: 'HOT WATER' },    // red   - hot
    hotLeg:     { bore: '#3a1512', flow: '#ff6a4d', label: 'RCS HOT LEG' },
    steam:      { bore: '#c7d0d6', flow: '#ffffff', label: 'STEAM' },        // light grey - dry/hot steam
    wetSteam:   { bore: '#7f8a91', flow: '#cfd6db', label: 'WET STEAM' },    // med grey  - near saturation
    empty:      { bore: '#101a22', flow: '#101a22', label: 'ISOLATED', empty: true }
  };

  // ---------------------------------------------------------------------------
  // GLOBAL TEMPERATURE + PHASE COLOR MODEL
  // One gradient, shared by every pipe and valve, so a given temperature always
  // paints the same color anywhere in the plant. Pass fluid as { phase, temp }:
  //   phase 'water' -> aqua -> blue -> purple -> red, with full RED anchored at
  //         WATER_MAX_C = the hottest liquid water in a PWR (pressurizer, saturated
  //         at operating pressure ~155 bar => ~345 C).
  //   phase 'steam' -> light/medium grey (cool) -> medium-dark grey (hot).
  //   phase 'empty' -> isolated (dark, no flow).
  // ---------------------------------------------------------------------------
  var TEMP_MIN_C = 15;     // coldest rendered temperature
  var WATER_MAX_C = 345;   // hottest liquid water in a PWR -> full red
  // Heat-map ramp: hue varies continuously cold→hot (blue→cyan→green→yellow→orange→red) so
  // ADJACENT temperatures differ in hue, not just brightness — you can read a ~30 °C hot-leg /
  // cold-leg split at a glance and watch a transient sweep colors. Paired with the operating-
  // band expansion below (rampT) so the 200–345 °C band the plant lives in spans most of the ramp.
  var WATER_RAMP = [
    [0.00, [0x2b, 0x66, 0xd8]],  // cold — blue
    [0.20, [0x2a, 0xac, 0xe4]],  // azure
    [0.38, [0x2c, 0xd0, 0xc0]],  // teal
    [0.54, [0x49, 0xcb, 0x60]],  // green
    [0.68, [0xc6, 0xd6, 0x3a]],  // lime
    [0.80, [0xf2, 0xc0, 0x33]],  // yellow
    [0.90, [0xef, 0x8a, 0x2e]],  // orange
    [1.00, [0xd8, 0x33, 0x26]]   // hot — red
  ];
  // Operating-band expansion. A PWR lives at ~280–345 °C, a thin slice of 15–345 that on a
  // linear scale all reads near-red. Give everything ABOVE OP_LO the majority of the ramp
  // (from OP_KNEE up), compressing the rarely-seen cold band below it — like a plant HMI whose
  // temperature scale is centered on the operating range, so hot-leg reads red and cold-leg green.
  var OP_LO = 200, OP_KNEE = 0.35;
  function rampT(tempC) {
    if (tempC <= OP_LO) return clamp01((tempC - TEMP_MIN_C) / (OP_LO - TEMP_MIN_C)) * OP_KNEE;
    return OP_KNEE + clamp01((tempC - OP_LO) / (WATER_MAX_C - OP_LO)) * (1 - OP_KNEE);
  }
  var STEAM_RAMP = [
    [0.00, [0x5a, 0x64, 0x6b]],  // medium-dark grey  (cooler steam)
    [1.00, [0xd8, 0xde, 0xe2]]   // medium/light grey (hotter steam)
  ];
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function hex2(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16); }
  function toHex(a) { return '#' + hex2(a[0]) + hex2(a[1]) + hex2(a[2]); }
  function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function sampleRamp(ramp, t) {
    t = clamp01(t);
    for (var i = 0; i < ramp.length - 1; i++) {
      var p0 = ramp[i], p1 = ramp[i + 1];
      if (t <= p1[0]) { var span = (p1[0] - p0[0]) || 1; return mix3(p0[1], p1[1], (t - p0[0]) / span); }
    }
    return ramp[ramp.length - 1][1];
  }
  // Map a phase + temperature (deg C) to { bore, flow } (+ empty flag).
  //   bore = darker static fill inside the pipe;  flow = bright moving line.
  function phaseTempColor(phase, tempC) {
    if (phase === 'empty') return { bore: '#101a22', flow: '#101a22', empty: true, phase: 'empty', temp: tempC };
    var t = rampT(tempC);
    if (phase === 'steam') {
      var s = sampleRamp(STEAM_RAMP, t);
      return { bore: toHex(mix3(s, [0x10, 0x17, 0x1d], 0.52)), flow: toHex(s), phase: 'steam', temp: tempC };
    }
    var w = sampleRamp(WATER_RAMP, t);
    return { bore: toHex(mix3(w, [0x06, 0x0a, 0x0e], 0.74)), flow: toHex(w), phase: 'water', temp: tempC };
  }

  // THE THREE STANDARD PIPE SIZES (bore diameter, canvas px). Every connection stub
  // and every inter-component run must use one of these -- no custom diameters.
  // STUB_LEN is the fixed stub length per size (base to flange face, canvas px).
  var SIZES = { small: 4, medium: 8, large: 12 };
  var STUB_LEN = { small: 20, medium: 26, large: 32 };

  // Dash period is fixed (10+15=25) so the shared keyframe (-250 = 10 periods) loops seamlessly
  // at every diameter; only the flow-line THICKNESS scales with d.
  function ensureStyles() {
    if (document.getElementById('std-pipe-styles')) return;
    var s = document.createElement('style');
    s.id = 'std-pipe-styles';
    s.textContent =
      '@keyframes stdPipeFlow{to{stroke-dashoffset:-250}}' +
      '@keyframes stdPipeFlowRev{to{stroke-dashoffset:250}}';
    (document.head || document.documentElement).appendChild(s);
  }

  function pointsOf(o) {
    if (o.points) return o.points.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
    return o.x1 + ',' + o.y1 + ' ' + o.x2 + ',' + o.y2;
  }
  function resolveFluid(f) {
    if (f && typeof f === 'object') {
      // { phase, temp } -> global gradient;  { bore, flow } -> used as-is
      if (f.phase) return phaseTempColor(f.phase, f.temp == null ? WATER_MAX_C : f.temp);
      return f;
    }
    return (typeof f === 'string' ? FLUIDS[f] : null) || FLUIDS.coldWater;
  }

  function createKit(h) {
    ensureStyles();

    // A pipe run. o: { key, (x1,y1,x2,y2 | points:[[x,y]..]), d, fluid, flow, dir, speed, wall }
    //   d     pipe (bore) diameter        default 12
    //   fluid preset name or {bore,flow}  default coldWater
    //   flow  false to disable animation  default true
    //   dir   +1 forward / -1 reverse     default +1
    //   speed relative flow speed         default 1
    function pipe(o) {
      var d = o.d || 12;
      var fl = resolveFluid(o.fluid);
      var wall = o.wall == null ? Math.max(1.5, d * 0.2) : o.wall;
      var pts = pointsOf(o);
      var kids = [
        h('polyline', { key: 'case', points: pts, fill: 'none', stroke: WALL, strokeWidth: d + wall * 2, strokeLinecap: 'butt', strokeLinejoin: 'round' }),
        h('polyline', { key: 'bore', points: pts, fill: 'none', stroke: fl.bore, strokeWidth: d, strokeLinecap: 'butt', strokeLinejoin: 'round' })
      ];
      if (o.flow !== false && !fl.empty) {
        var dir = o.dir == null ? 1 : o.dir;
        var dur = (10.4 / (o.speed || 1)).toFixed(2);
        kids.push(h('polyline', {
          key: 'flow', points: pts, fill: 'none', stroke: fl.flow,
          strokeWidth: Math.max(2, d * 0.42), strokeLinecap: 'round', strokeLinejoin: 'round',
          strokeDasharray: '10 15', opacity: 0.92,
          style: o.paused ? {} : { animation: (dir < 0 ? 'stdPipeFlowRev ' : 'stdPipeFlow ') + dur + 's linear infinite' }
        }));
      }
      return h('g', { key: o.key }, kids);
    }

    // Flange bar centered at (x,y), with a standard bolt pair. angle = pipe direction in degrees.
    function flange(o) {
      var d = o.d || 12;
      var over = o.over == null ? Math.max(4, d * 0.4) : o.over;
      var t = o.t == null ? Math.max(3.5, d * 0.32) : o.t;
      var len = d + over * 2;
      var bx = d / 2 + over / 2;   // bolt offset toward each flange end
      return h('g', {
        key: o.key,
        transform: 'translate(' + o.x + ',' + o.y + ') rotate(' + (90 - (o.angle || 0)) + ')'
      }, [
        h('rect', { key: 'bar', x: -len / 2, y: -t / 2, width: len, height: t, rx: 1.5, fill: FLANGE, stroke: FLANGE_DK, strokeWidth: 1 }),
        h('circle', { key: 'b1', cx: -bx, cy: 0, r: 1.5, fill: '#93a4b1' }),
        h('circle', { key: 'b2', cx: bx, cy: 0, r: 1.5, fill: '#93a4b1' })
      ]);
    }

    // Connection stub on a component edge: a short pipe + a flange at its free (mating) end.
    // dir points AWAY from the component: 'up' | 'down' | 'left' | 'right'.
    // out: true = fluid flows OUT of the component, false = INTO it (overrides default).
    // Returns { el, tip:[x,y] } so callers know exactly where the mating pipe should land.
    function stub(o) {
      var d = o.d || 12, len = o.len == null ? d + 8 : o.len;
      var x = o.x, y = o.y, ex = x, ey = y, ang = 0, fdir = 1;
      if (o.dir === 'up') { ey = y - len; ang = 90; fdir = -1; }
      else if (o.dir === 'down') { ey = y + len; ang = 90; fdir = 1; }
      else if (o.dir === 'left') { ex = x - len; ang = 0; fdir = -1; }
      else { ex = x + len; ang = 0; fdir = 1; }
      if (o.out != null) fdir = o.out ? 1 : -1;
      var el = h('g', { key: o.key }, [
        pipe({ key: 'p', x1: x, y1: y, x2: ex, y2: ey, d: d, fluid: o.fluid, flow: o.flow, dir: fdir, speed: o.speed }),
        flange({ key: 'f', x: ex, y: ey, angle: ang, d: d })
      ]);
      return { el: el, tip: [ex, ey] };
    }

    // Tee/junction marker where a pipe taps into another pipe. o: { key, x, y, d, fluid }
    function junction(o) {
      var d = o.d || 12;
      var fl = resolveFluid(o.fluid);
      var wall = Math.max(1.5, d * 0.2);
      return h('g', { key: o.key }, [
        h('circle', { key: 'o', cx: o.x, cy: o.y, r: d / 2 + wall + 1, fill: WALL, stroke: FLANGE_DK, strokeWidth: 1 }),
        h('circle', { key: 'i', cx: o.x, cy: o.y, r: d / 2, fill: fl.bore }),
        h('circle', { key: 'c', cx: o.x, cy: o.y, r: Math.max(1.4, d * 0.18), fill: fl.flow, opacity: 0.9 })
      ]);
    }

    return { pipe: pipe, flange: flange, stub: stub, junction: junction, FLUIDS: FLUIDS, SIZES: SIZES, STUB_LEN: STUB_LEN, phaseTempColor: phaseTempColor, TEMP_MIN_C: TEMP_MIN_C, WATER_MAX_C: WATER_MAX_C };
  }

  // watchScale(svgEl, onChange): reports the svg's LAYOUT scale (CSS px per viewBox
  // unit, min of both axes -- matches preserveAspectRatio 'meet'). Uses computed
  // style, so canvas pan/zoom transforms do NOT affect it. Components use this to
  // draw controls/connectors at a fixed on-screen size regardless of tile resizing.
  // Returns a cleanup function.
  function watchScale(svgEl, onChange) {
    function compute() {
      if (!svgEl || !svgEl.isConnected) return;
      var vb = svgEl.viewBox && svgEl.viewBox.baseVal;
      if (!vb || !vb.width || !vb.height) return;
      var cs = getComputedStyle(svgEl);
      var w = parseFloat(cs.width), hh = parseFloat(cs.height);
      if (!w || !hh) return;
      var s = Math.min(w / vb.width, hh / vb.height);
      if (s > 0.01 && isFinite(s)) onChange(s);
    }
    var ro = new ResizeObserver(function () { compute(); });
    ro.observe(svgEl);
    compute();
    return function () { ro.disconnect(); };
  }

  window.StdPipe = { createKit: createKit, watchScale: watchScale, FLUIDS: FLUIDS, SIZES: SIZES, STUB_LEN: STUB_LEN, phaseTempColor: phaseTempColor, TEMP_MIN_C: TEMP_MIN_C, WATER_MAX_C: WATER_MAX_C };
})();
