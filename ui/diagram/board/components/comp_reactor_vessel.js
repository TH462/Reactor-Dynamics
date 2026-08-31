/* comp_reactor_vessel.js — 'Reactor Vessel v2' ported from
 * inbox/design_import/Reactor Vessel v2.dc.html per PORTING_CONTRACT.md.
 *
 * Vessel art only: the final diagram uses showControls:false, so the CONTROL/
 * SHUTDOWN GROUP hold-button pods, SCRAM cover, debug panel and telemetry
 * callback were not ported (external panels exist elsewhere on the board).
 * The internal rod-worth/power rAF loop is stripped — update() drives display:
 *   update({ regFrac, shutFrac, power, coreInv, boil, glow, showFlow })
 * Rod motion arrives at snapshot cadence, so rod position is applied as a CSS
 * transform (transition 0.3s linear) on moving groups instead of per-frame
 * geometry rebuilds; bubble rise / flow dashes are pausable CSS keyframes.
 */
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};
  RD.BoardComps = RD.BoardComps || {};
  RD.BoardComps['Reactor Vessel v2'] = { build: build };

  // Geometry constants — verbatim from the design source.
  var coreL = 186, coreR = 374, coreTop = 276, coreBot = 454;
  /* THE CORE FLUID COLUMN'S OWN EXTENTS (#516 item 5, owner playtest 2026-08-29). The pool and
   * its upflow were authored 269..456 while the fuel rods run coreTop..coreBot = 276..454, so
   * the water started 7 px ABOVE the rods — and 276 is exactly where the upper-plenum fluid
   * (`hotresFullBot = coreTop`) ENDS, which is why the two overlapped instead of meeting.
   * The bottom now reaches the lower support plate's flow-hole blocks (authored y 455, height
   * 17), so the column runs from the top of the fuel to the bottom of the blocks beneath it,
   * which is what the owner asked for and what the drawn internals actually show. */
  var poolTop = coreTop, poolBot = 472, poolH = poolBot - poolTop;   /* 276..472, 196 */
  var coreW = coreR - coreL, coreH = coreBot - coreTop, cx = 280;
  var barrelL = 180, barrelR = 380;
  var stripBottom = 216, stripH = 216, tubeTop = -20, tubeW = 26;
  var hotresFullTop = 160, hotresFullBot = coreTop, hotresFullH = hotresFullBot - hotresFullTop; // 116
  var barrelTop = 150, dcTop = 244, legGapTop = 203, legGapBot = 226;

  function ensureStyles() {
    if (document.getElementById('bd-reactorvessel-styles')) return;
    var s = document.createElement('style');
    s.id = 'bd-reactorvessel-styles';
    s.textContent =
      '@keyframes flowmove{to{stroke-dashoffset:-24}}' +
      '@keyframes bubbleRiseS{0%{transform:translateY(0);opacity:0}14%{opacity:1}82%{opacity:1}100%{transform:translateY(-80px);opacity:0}}' +
      '@keyframes bubbleRiseM{0%{transform:translateY(0);opacity:0}12%{opacity:1}85%{opacity:1}100%{transform:translateY(-130px);opacity:0}}' +
      '@keyframes bubbleRiseL{0%{transform:translateY(0);opacity:0}10%{opacity:1}88%{opacity:1}100%{transform:translateY(-180px);opacity:0}}' +
      '@keyframes cherBreathe{0%,100%{opacity:0.82}50%{opacity:1}}';
    (document.head || document.documentElement).appendChild(s);
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function mixArr(a, b, t) {
    t = clamp(t, 0, 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function rgbStr(c) { return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }

  function build(cfg, env) {
    ensureStyles();
    var h = env.h;
    var gid = env.uid('rv');
    var ids = {
      steel: gid + 'Steel', cflow: gid + 'Cflow', cdash: gid + 'Cdash', pool: gid + 'Pool', strip: gid + 'Strip',
      fuel: gid + 'Fuel', ctrl: gid + 'Ctrl', coreClip: gid + 'CoreClip',
      poolClip: gid + 'PoolClip', stripClip: gid + 'StripClip', glow: gid + 'Glow', glow2: gid + 'Glow2',
      cher: gid + 'Cher', cherCore: gid + 'CherCore'
    };
    var R = {};   // refs to dynamic elements
    var st = { regFrac: 0.8333, shutFrac: 0.8333, power: 1, coreInv: 100, boil: 45, glow: true, showFlow: true, tcold: 290, thot: 320, cherenkov: 70 };
    var last = {};
    var lastBoil = -1;

    // ---- defs (all ids per-instance unique) ----
    var defs = h('defs', null,
      h('linearGradient', { id: ids.steel, x1: '0', y1: '0', x2: '0', y2: '1' },
        h('stop', { offset: '0', stopColor: '#2a3844' }), h('stop', { offset: '1', stopColor: '#0c141c' })),
      h('linearGradient', { id: ids.cflow, gradientUnits: 'userSpaceOnUse', x1: '0', y1: coreBot, x2: '0', y2: coreTop },
        R.cflow0 = h('stop', { offset: '0' }), R.cflow1 = h('stop', { offset: '0.5' }), R.cflow2 = h('stop', { offset: '1' })),
      // The core upflow DASH runs the same inlet→exit temperature sweep as the channel it
      // sits in, but in the darker of the two colours — the pipes' convention since #350
      // item 20. It needs its own gradient because the channel fill under it uses the
      // BRIGHT one, and a dash painted with its own background is not a dash.
      h('linearGradient', { id: ids.cdash, gradientUnits: 'userSpaceOnUse', x1: '0', y1: coreBot, x2: '0', y2: coreTop },
        R.cdash0 = h('stop', { offset: '0' }), R.cdash1 = h('stop', { offset: '0.5' }), R.cdash2 = h('stop', { offset: '1' })),
      h('linearGradient', { id: ids.pool, gradientUnits: 'userSpaceOnUse', x1: '0', y1: 244, x2: '0', y2: 585 },
        R.pool0 = h('stop', { offset: '0' }), R.pool1 = h('stop', { offset: '0.55' }), R.pool2 = h('stop', { offset: '1' })),
      h('linearGradient', { id: ids.strip, x1: '0', y1: '1', x2: '0', y2: '0' },
        h('stop', { offset: '0', stopColor: '#0a3542' }), h('stop', { offset: '1', stopColor: '#2193a9' })),
      h('linearGradient', { id: ids.fuel, x1: '0', y1: '0', x2: '1', y2: '0' },
        R.fuel0 = h('stop', { offset: '0' }), R.fuel1 = h('stop', { offset: '0.5' }), R.fuel2 = h('stop', { offset: '1' })),
      h('linearGradient', { id: ids.ctrl, x1: '0', y1: '0', x2: '1', y2: '0' },
        h('stop', { offset: '0', stopColor: '#1c232a' }), h('stop', { offset: '0.5', stopColor: '#48535e' }), h('stop', { offset: '1', stopColor: '#1c232a' })),
      h('clipPath', { id: ids.coreClip }, h('rect', { x: coreL, y: coreTop, width: coreW, height: coreH })),
      h('clipPath', { id: ids.poolClip }, R.poolClipRect = h('rect', { x: coreL, y: poolTop, width: coreW, height: poolH })),
      // stripClip: clip windows for the two moving indicator fills (one rect per bank tube)
      h('clipPath', { id: ids.stripClip },
        h('rect', { x: 225, y: 0, width: tubeW, height: stripH }),
        h('rect', { x: 309, y: 0, width: tubeW, height: stripH })),
      h('filter', { id: ids.glow, x: '-40%', y: '-40%', width: '180%', height: '180%' }, h('feGaussianBlur', { stdDeviation: '9' })),
      h('filter', { id: ids.glow2, x: '-60%', y: '-60%', width: '220%', height: '220%' }, h('feGaussianBlur', { stdDeviation: '11' })),
      // CHERENKOV: electric-blue radiance from the core. Both gradients keep the default
      // objectBoundingBox units so they stretch with the ellipse they fill — that way the
      // falloff stays a true width-wise oval instead of a circle clipped to an oval.
      // (The design source defines cherCoreGrad twice, the second time in userSpaceOnUse;
      // url(#id) resolves to the FIRST match, so that second block is dead and is not ported.)
      h('radialGradient', { id: ids.cher },
        h('stop', { offset: '0', stopColor: '#a6e2ff', stopOpacity: 0.16 }),
        h('stop', { offset: '0.46', stopColor: '#86d2ff', stopOpacity: 0.22 }),
        h('stop', { offset: '0.6', stopColor: '#55b8ff', stopOpacity: 0.46 }),
        h('stop', { offset: '0.71', stopColor: '#33a0ff', stopOpacity: 0.62 }),
        h('stop', { offset: '0.82', stopColor: '#2286ff', stopOpacity: 0.46 }),
        h('stop', { offset: '0.91', stopColor: '#1d74f7', stopOpacity: 0.3 }),
        h('stop', { offset: '0.97', stopColor: '#1b6bf5', stopOpacity: 0.13 }),
        h('stop', { offset: '1', stopColor: '#1b6bf5', stopOpacity: 0 })),
      h('radialGradient', { id: ids.cherCore },
        h('stop', { offset: '0', stopColor: '#cdefff', stopOpacity: 0.5 }),
        h('stop', { offset: '0.45', stopColor: '#7fd0ff', stopOpacity: 0.3 }),
        h('stop', { offset: '1', stopColor: '#5ab8ff', stopOpacity: 0 }))
    );

    // ---- rod bank group (statics + CSS-transform moving parts) ----
    // The design resized the indicator fill / absorber rects per frame; here the
    // dynamic parts live in translated groups with 'transition: transform 0.3s
    // linear' so snapshot-cadence updates glide.
    function rodGroup(rodXs, cxs) {
      var stripL = cxs - (tubeW / 2 - 1);
      var trans = { transition: 'transform 0.3s linear' };
      var els = [];
      // penetration standpipe — grounds the drive tube onto the vessel head dome
      els.push(h('rect', { x: cxs - 15, y: 8, width: 30, height: 58, rx: 3, fill: '#141f29', stroke: '#2c3f4c', strokeWidth: 1 }));
      els.push(h('rect', { x: cxs - 19, y: 58, width: 38, height: 9, rx: 3, fill: '#22323e', stroke: '#1d2a33', strokeWidth: 1 }));
      // outer casing tube
      els.push(h('rect', { x: stripL - 1, y: tubeTop, width: tubeW, height: stripBottom - tubeTop, rx: 6, fill: '#0a131a', stroke: '#2c3f4c', strokeWidth: 1.3 }));
      // top cap
      els.push(h('rect', { x: cxs - 8, y: tubeTop - 12, width: 16, height: 14, rx: 4, fill: '#20303a', stroke: '#425863', strokeWidth: 1 }));
      // coil-stack ridges
      [0, 1].forEach(function (ri) {
        els.push(h('rect', { x: stripL - 1, y: tubeTop + 4 + ri * 8, width: tubeW, height: 4, rx: 1, fill: '#0d151b', stroke: '#2c3d47', strokeWidth: 0.6 }));
      });
      // vessel-head penetration flange
      els.push(h('rect', { x: cxs - 19, y: 0, width: 38, height: 11, rx: 2, fill: '#3c505c', stroke: '#232f37', strokeWidth: 1 }));
      // travel scale ticks
      [0, 0.25, 0.5, 0.75, 1].forEach(function (f, ti) {
        var y = stripBottom - f * stripH; var lng = (ti % 2 === 0);
        els.push(h('line', { x1: stripL - 1 + tubeW, y1: y, x2: stripL - 1 + tubeW + (lng ? 7 : 4), y2: y, stroke: '#3b4f5e', strokeWidth: 1 }));
      });
      // guide shafts (static full span; the source redrew them identically each frame)
      rodXs.forEach(function (x) {
        els.push(h('line', { x1: x, y1: stripBottom, x2: x, y2: coreTop, stroke: '#5d6d79', strokeWidth: 3, strokeLinecap: 'round' }));
      });
      // position fill — full-travel rect anchored at the w=0 position, clipped to the
      // tube window; translating by -w*stripH reproduces the variable-height fill
      // with the bright leading edge always under the knob.
      var mvFill = h('g', { style: trans },
        h('rect', { x: stripL + 1.5, y: stripBottom, width: tubeW - 5, height: stripH, rx: 4, fill: 'url(#' + ids.strip + ')' }));
      els.push(h('g', { clipPath: 'url(#' + ids.stripClip + ')' }, mvFill));
      var mvKnob = h('g', { style: trans },
        h('rect', { x: stripL - 5, y: stripBottom - 4, width: tubeW + 8, height: 8, rx: 3, fill: '#7deeff', stroke: '#2ab5cc', strokeWidth: 1 }));
      els.push(mvKnob);
      // absorbers — drawn at the fully-withdrawn reference (bottom edge at coreTop)
      // and translated down by (1-w)*coreH; clipped to the core so nothing shows
      // above the upper plate. Tip rings ride unclipped so they overlay the lower
      // plate at full insertion, like the source.
      var abs = [], tips = [];
      rodXs.forEach(function (x) {
        abs.push(h('rect', { x: x - 7, y: coreTop - coreH, width: 14, height: coreH, rx: 3, fill: 'url(#' + ids.ctrl + ')', stroke: '#141a20', strokeWidth: 1 }));
        tips.push(h('circle', { cx: x, cy: coreTop, r: 6, fill: '#26333d', stroke: '#3ec7dd', strokeWidth: 1.2 }));
      });
      var mvAbs = h('g', { style: trans }, abs);
      var mvTips = h('g', { style: trans }, tips);
      els.push(h('g', { clipPath: 'url(#' + ids.coreClip + ')' }, mvAbs));
      els.push(mvTips);
      var moveInd = [mvFill, mvKnob], moveCore = [mvAbs, mvTips];
      return {
        el: h('g', null, els),
        setW: function (w) {
          var dyI = (-w * stripH).toFixed(2), dyC = ((1 - w) * coreH).toFixed(2);
          moveInd.forEach(function (g) { g.style.transform = 'translate(0px,' + dyI + 'px)'; });
          moveCore.forEach(function (g) { g.style.transform = 'translate(0px,' + dyC + 'px)'; });
        }
      };
    }

    var bankA = rodGroup([217, 259], 238);
    var bankB = rodGroup([301, 343], 322);

    // ---- static vessel scene, in source paint order ----
    var svgKids = [defs];
    // vessel shells
    svgKids.push(h('path', { d: 'M138,160 A142 96 0 0 1 422 160 L422 540 A142 60 0 0 1 138 540 Z', fill: 'url(#' + ids.steel + ')', stroke: '#46596a', strokeWidth: 2.4 }));
    svgKids.push(h('path', { d: 'M151,161 A129 84 0 0 1 409 161 L409 539 A129 52 0 0 1 151 539 Z', fill: '#0b141d', stroke: '#1b2a36', strokeWidth: 1 }));
    // bolted head closure — flange tabs where the dome meets the shell
    svgKids.push(h('g', null,
      h('rect', { x: 128, y: 149, width: 27, height: 7, rx: 2, fill: '#384c58', stroke: '#1c2830', strokeWidth: 0.8 }),
      h('rect', { x: 128, y: 158, width: 27, height: 7, rx: 2, fill: '#2c3d48', stroke: '#1c2830', strokeWidth: 0.8 }),
      h('rect', { x: 405, y: 149, width: 27, height: 7, rx: 2, fill: '#384c58', stroke: '#1c2830', strokeWidth: 0.8 }),
      h('rect', { x: 405, y: 158, width: 27, height: 7, rx: 2, fill: '#2c3d48', stroke: '#1c2830', strokeWidth: 0.8 })));
    // neutron-flux glow, tightened to the barrel extent
    svgKids.push(R.fluxglow = h('rect', { x: barrelL - 8, y: 142, width: (barrelR - barrelL) + 16, height: 331, rx: 22, fill: '#22d8c4', opacity: 0.04, filter: 'url(#' + ids.glow2 + ')' }));
    svgKids.push(h('rect', { x: barrelL, y: 150, width: barrelR - barrelL, height: 315, rx: 14, fill: '#0a161f', stroke: '#223543', strokeWidth: 1.2 }));
    // thermal glow behind core
    svgKids.push(R.glowr = h('rect', { x: coreL - 8, y: coreTop - 12, width: coreW + 16, height: coreH + 24, rx: 12, filter: 'url(#' + ids.glow + ')' }));
    // hot reservoir above the core
    svgKids.push(R.hotresSteam = h('rect', { x: barrelL + 6, y: hotresFullTop, width: barrelR - barrelL - 12, height: hotresFullH, rx: 10, fill: '#d7e0e5', opacity: 0.16 }));
    svgKids.push(R.hotres = h('rect', { x: barrelL + 6, y: hotresFullTop, width: barrelR - barrelL - 12, height: hotresFullH, rx: 10, stroke: '#3a2320', strokeWidth: 1 }));
    // downcomer + lower plenum: one continuous water body (evenodd cut removes the barrel footprint)
    svgKids.push(h('path', {
      fillRule: 'evenodd', fill: 'url(#' + ids.pool + ')',
      d: 'M155,244 L155,538 A125 50 0 0 0 405,538 L405,244 Z M177,244 L177,465 Q177,471 183,471 L377,471 Q383,471 383,465 L383,244 Z'
    }));
    // outer casing liner, broken only at the cold-leg inlet on the right
    svgKids.push(h('path', { d: 'M152,240 L152,539 A128 51 0 0 0 408,539 L408,309 M408,281 L408,240', fill: 'none', stroke: '#2c3f4c', strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    // inner (core-barrel) walls, ending at the lower support plate
    function barrelWall(xc) {
      return h('g', null,
        h('rect', { x: xc - 2.5, y: dcTop - 3, width: 5, height: 460 - (dcTop - 3), rx: 2.5, fill: '#2c3f4c', stroke: '#46596a', strokeWidth: 0.9 }),
        h('line', { x1: xc - 0.6, y1: dcTop, x2: xc - 0.6, y2: 456, stroke: '#5a7183', strokeWidth: 0.8, opacity: 0.7 }));
    }
    svgKids.push(h('g', null, barrelWall(180), barrelWall(380)));
    // hot-side casing framing the upper plenum, with the hot-leg opening on the right
    var hotTop = barrelTop + 4, hotBot = dcTop - 3;
    function hotSeg(xc, y0, y1) {
      return h('g', null,
        h('rect', { x: xc - 2.5, y: y0, width: 5, height: y1 - y0, rx: 2.5, fill: '#2c3f4c', stroke: '#46596a', strokeWidth: 0.9 }),
        h('line', { x1: xc - 0.6, y1: y0 + 3, x2: xc - 0.6, y2: y1 - 3, stroke: '#5a7183', strokeWidth: 0.8, opacity: 0.7 }));
    }
    svgKids.push(h('g', null,
      hotSeg(180, hotTop, hotBot),
      hotSeg(380, hotTop, legGapTop),
      hotSeg(380, legGapBot, hotBot),
      h('rect', { x: 377, y: legGapTop - 3, width: 22, height: 4, rx: 1.5, fill: '#39505f' }),
      h('rect', { x: 377, y: legGapBot - 1, width: 22, height: 4, rx: 1.5, fill: '#39505f' }),
      h('rect', { x: 176, y: barrelTop - 3, width: 208, height: 8, rx: 4, fill: '#2c3f4c', stroke: '#46596a', strokeWidth: 0.9 })));
    // hot-leg throat: carries the hot-side coolant color out to the flange face
    svgKids.push(R.hotThroat = h('rect', { x: 380, y: legGapTop, width: 42, height: legGapBot - legGapTop, stroke: '#3a2320', strokeWidth: 1 }));
    // downcomer channel caps
    svgKids.push(h('g', null,
      h('rect', { x: 149, y: 239, width: 35, height: 6, rx: 2.5, fill: '#2c3f4c', stroke: '#46596a', strokeWidth: 0.9 }),
      h('rect', { x: 377, y: 239, width: 35, height: 6, rx: 2.5, fill: '#2c3f4c', stroke: '#46596a', strokeWidth: 0.9 })));
    // core plates: upper plate + lower support plate with flow holes
    svgKids.push(h('rect', { x: barrelL + 4, y: coreTop - 7, width: barrelR - barrelL - 8, height: 7, rx: 2, fill: '#2b3d4a' }));
    var slotXs = [217, 259, 301, 343];
    svgKids.push(h('g', null,
      h('rect', { x: 177, y: 456, width: 206, height: 15, rx: 4, fill: '#2c3f4c', stroke: '#46596a', strokeWidth: 0.9 }),
      slotXs.map(function (x) {
        return h('rect', { x: x - 10, y: 455, width: 20, height: 17, rx: 3, fill: 'url(#' + ids.pool + ')', stroke: '#1a2833', strokeWidth: 0.8 });
      })));
    svgKids.push(h('rect', { x: coreL, y: coreTop, width: coreW, height: coreH, fill: '#07121a' }));
    // core steam space (visible as inventory drains below 50%)
    svgKids.push(R.coreSteam = h('g', { clipPath: 'url(#' + ids.coreClip + ')' },
      h('rect', { x: coreL, y: 276, width: coreW, height: 180, fill: '#d7e0e5', opacity: 0.14 })));
    // core channel water + upflow, clipped to the (dynamic) core pool level
    R.wideflow = h('line', {
      x1: cx, y1: poolBot, x2: cx, y2: poolTop, stroke: 'url(#' + ids.cdash + ')', strokeWidth: coreW,
      strokeLinecap: 'butt', strokeDasharray: '15 9', opacity: 0.94,
      // .flowwide from the source, applied inline (dasharray 15 9 + flowmove 1.5s)
      style: { animation: 'flowmove 1.5s linear infinite' }
    });
    svgKids.push(h('g', { clipPath: 'url(#' + ids.poolClip + ')' },
      h('rect', { x: coreL, y: poolTop, width: coreW, height: poolH, fill: 'url(#' + ids.cflow + ')', opacity: 0.45 }),
      h('line', { x1: cx, y1: poolBot, x2: cx, y2: poolTop, stroke: 'url(#' + ids.cflow + ')', strokeWidth: coreW, strokeLinecap: 'butt', opacity: 0.78 }),
      R.wideflow));
    // fuel rods
    var fuelXs = [196, 238, 280, 322, 364];
    svgKids.push(R.fuelglow = h('rect', { x: coreL - 6, y: coreTop - 8, width: coreW + 12, height: coreH + 16, rx: 10, filter: 'url(#' + ids.glow + ')' }));
    R.fuelRods = fuelXs.map(function (x) {
      return h('rect', { x: x - 7, y: coreTop, width: 14, height: coreH, rx: 3, fill: 'url(#' + ids.fuel + ')', strokeWidth: 0.6 });
    });
    svgKids.push(h('g', null, R.fuelRods));
    // ---- standardized connectors + uniform circulation flow ----
    // Drawn inside a scale(1/s) group with coordinates pre-multiplied by s, so every
    // diameter/dash renders at constant canvas px (watchScale pattern from the source).
    var connsG = h('g');
    svgKids.push(connsG);
    // data-port markers (hot-out / cold-in) — positions and attrs verbatim
    svgKids.push(h('circle', { cx: 422, cy: 214, r: 0.75, fill: 'none', 'data-port': 'hot-out', 'data-fluid': 'hotLeg', 'data-dir': 'right', 'data-size': 'large', 'data-out': '1' }));
    svgKids.push(h('circle', { cx: 422, cy: 295, r: 0.75, fill: 'none', 'data-port': 'cold-in', 'data-fluid': 'coldLeg', 'data-dir': 'right', 'data-size': 'large', 'data-out': '0' }));
    // control rod banks
    svgKids.push(bankA.el);
    svgKids.push(bankB.el);
    // boiling bubbles, clipped to core water (children rebuilt when boil changes)
    svgKids.push(R.bubbleG = h('g', { clipPath: 'url(#' + ids.poolClip + ')' }));
    // ---- CHERENKOV RADIANCE (overlay, on top of the core art) ----
    // FISSION RATE sets the intensity, not transient reactivity: at zero power there is no
    // glow at all, and it grows and widens toward rated power. `cherenkov` is a gain on top.
    // Two nested groups on purpose: the breathing keyframes animate opacity, so they must sit
    // on the INNER group — on the outer one they would overwrite the intensity opacity and
    // the gain would collapse to on/off. Nested, the two opacities multiply.
    R.cherHeart = h('ellipse', { cx: cx, cy: 365, fill: 'url(#' + ids.cherCore + ')' });
    R.cherHalo = h('ellipse', { cx: cx, cy: 365, fill: 'url(#' + ids.cher + ')' });
    R.cherWash = h('ellipse', { cx: cx, cy: 365, fill: 'url(#' + ids.cher + ')', opacity: 0.42 });
    R.cherG = h('g', { style: { mixBlendMode: 'screen', pointerEvents: 'none' } },
      h('g', { style: { animation: 'cherBreathe 4.2s ease-in-out infinite' } },
        R.cherWash,      // widest, faintest wash — carries the light sideways past the casing
        R.cherHalo,      // main lens, laid width-wise across the core
        R.cherHeart));   // bright heart, same aspect so it never reads as a circle
    svgKids.push(R.cherG);

    // compact (vessel-only) frame from the source (showControls:false path)
    var svg = h('svg', { viewBox: '100 -110 362 715', width: '100%', height: '100%', style: { overflow: 'visible' } }, svgKids);
    var root = h('div', { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, svg);

    // ---- dynamic appliers (cache last-applied; only touch DOM on change) ----
    function show(elm, on) {
      if (on) elm.removeAttribute('display');
      else elm.setAttribute('display', 'none');
    }

    function applyRods(force) {
      if (force || last.regFrac !== st.regFrac) { last.regFrac = st.regFrac; bankA.setW(st.regFrac); }
      if (force || last.shutFrac !== st.shutFrac) { last.shutFrac = st.shutFrac; bankB.setW(st.shutFrac); }
    }

    // Fuel rods + glows track POWER (heat being generated / Cherenkov). The coolant water
    // color tracks TEMPERATURE (see applyFluidTemp) — the fuel glowing hot in a hot-but-
    // low-power state, or a cool pool at power, is exactly the intended reading.
    function applyColors(force) {
      if (!force && last.power === st.power && last.glow === st.glow) return;
      last.power = st.power; last.glow = st.glow;
      var p = st.power, glowOn = st.glow;
      var COOL = [44, 88, 152], HOT = [176, 56, 34];
      var cTopA = mixArr(COOL, HOT, p * 1.05);
      var cTop = rgbStr(cTopA);   // hot-side power tone — only the thermal glow behind the core uses it now
      var fuelBrown = [61, 38, 22], fuelOrange = [255, 140, 26], fuelYellow = [255, 226, 90], fuelWhite = [255, 255, 255];
      var fuelBaseArr;
      if (p <= 1) fuelBaseArr = mixArr(fuelBrown, fuelOrange, p);
      else if (p <= 1.25) fuelBaseArr = mixArr(fuelOrange, fuelYellow, (p - 1) / 0.25);
      else fuelBaseArr = mixArr(fuelYellow, fuelWhite, Math.min(1, (p - 1.25) / 0.25));
      var fuelBase = rgbStr(fuelBaseArr);
      var fuelGlowOpacity = clamp((p - 0.03) / 0.5, 0, 1);
      var fuelEdge = rgbStr(mixArr(fuelBaseArr, [0, 0, 0], 0.48));
      var fuelMid = rgbStr(mixArr(fuelBaseArr, [255, 226, 175], Math.min(0.55, 0.1 + p * 0.5)));
      R.fuel0.setAttribute('stop-color', fuelEdge);
      R.fuel1.setAttribute('stop-color', fuelMid);
      R.fuel2.setAttribute('stop-color', fuelEdge);
      R.fuelRods.forEach(function (r) { r.setAttribute('stroke', fuelEdge); });
      // glow prop = master enable for Cherenkov/thermal glows (learning mode);
      // the source gated only the thermal glow — here it also gates the flux and
      // fuel halos per the board's glow semantics.
      R.fluxglow.setAttribute('opacity', String(Math.min(0.58, 0.04 + p * 0.58)));
      show(R.fluxglow, glowOn);
      R.glowr.setAttribute('fill', cTop);
      R.glowr.setAttribute('opacity', String(Math.min(0.42, p * 0.5)));
      show(R.glowr, glowOn && p > 0.02);
      R.fuelglow.setAttribute('fill', fuelBase);
      R.fuelglow.setAttribute('opacity', String(fuelGlowOpacity * 0.28));
      show(R.fuelglow, glowOn && fuelGlowOpacity > 0.01);
      applyCherenkov(p, glowOn);
    }

    // Cherenkov intensity AND size both track fission rate, so the glow grows out of the core
    // as power comes up rather than switching on. Gated by `glow` with the other halos.
    function applyCherenkov(p, glowOn) {
      var pf = clamp(p, 0, 1);
      var amt = (clamp(st.cherenkov, 0, 100) / 100) * pf;
      var on = glowOn && amt > 0.004;
      show(R.cherG, on);
      if (!on) return;
      R.cherG.setAttribute('opacity', String(Math.min(1, amt)));
      R.cherWash.setAttribute('rx', String(118 + 52 * pf));
      R.cherWash.setAttribute('ry', String(128 + 66 * pf));
      R.cherHalo.setAttribute('rx', String(110 + 50 * pf));
      R.cherHalo.setAttribute('ry', String(90 + 45 * pf));
      R.cherHeart.setAttribute('rx', String(68 + 25 * pf));
      R.cherHeart.setAttribute('ry', String(56 + 26 * pf));
    }

    // Coolant water color = TEMPERATURE, via the same global ramp as the pipes/valves.
    // Downcomer + lower plenum pool = cold-leg temp (Tcold); the core channel upflow runs
    // Tcold (inlet, bottom) → Thot (core exit, top); the hot reservoir / hot-leg throat = Thot.
    function applyFluidTemp(force) {
      if (!force && last.tcold === st.tcold && last.thot === st.thot) return;
      last.tcold = st.tcold; last.thot = st.thot;
      var cold = env.StdPipe.phaseTempColor('water', st.tcold);
      var hot = env.StdPipe.phaseTempColor('water', st.thot);
      var mid = env.StdPipe.phaseTempColor('water', (st.tcold + st.thot) / 2);
      // Since #350 item 20 the kit's `bore` is the fluid colour at full strength and `flow`
      // is the darker dash. WATER BODIES take bore; anything that MOVES takes flow.
      // core channel (gradient bottom offset 0 = inlet/cold, top offset 1 = exit/hot)
      R.cflow0.setAttribute('stop-color', cold.bore);
      R.cflow1.setAttribute('stop-color', mid.bore);
      R.cflow2.setAttribute('stop-color', hot.bore);
      R.cdash0.setAttribute('stop-color', cold.flow);
      R.cdash1.setAttribute('stop-color', mid.flow);
      R.cdash2.setAttribute('stop-color', hot.flow);
      // Downcomer + lower plenum: cold-leg water, FLAT *(OWNER DIRECTIVE, 2026-08-04: "the
      // cold side of the reactor should not show a gradient. currently its darker on the
      // bottom.")*, #350 item 22. The bottom stop used to be the dark `bore`, which shaded
      // the plenum as though the water down there were colder — it is the same water, and a
      // temperature-coded board must not spend its colour scale on depth. All three stops
      // are one colour now; the gradient element stays so the three refs keep working.
      R.pool0.setAttribute('stop-color', cold.bore);
      R.pool1.setAttribute('stop-color', cold.bore);
      R.pool2.setAttribute('stop-color', cold.bore);
      // hot reservoir above the core + hot-leg throat: hot-leg water
      R.hotres.setAttribute('fill', hot.bore);
      R.hotThroat.setAttribute('fill', hot.bore);
      // Downcomer circulation streaks — item 12. These were a hard-coded '#7fb0dd', the one
      // water surface on the whole board that did NOT track temperature, so the cold leg read
      // pale blue whether the plant was at 68 F or 550 F while the pipe feeding it swept the
      // whole ramp. Painted from the same cold-leg colour as those pipes' dashes.
      (R.connFlows || []).forEach(function (l) { l.setAttribute('stroke', cold.flow); });
    }

    function applyInventory(force) {
      if (!force && last.coreInv === st.coreInv) return;
      last.coreInv = st.coreInv;
      var inv = clamp(st.coreInv, 0, 100) / 100;
      var hotresFrac = inv <= 0.5 ? 0 : (inv - 0.5) / 0.5;
      var corePoolFrac = inv >= 0.5 ? 1 : inv / 0.5;
      var hotresH = hotresFullH * hotresFrac;
      show(R.hotresSteam, hotresFrac < 0.999);
      show(R.hotres, hotresH > 0.5);
      R.hotres.setAttribute('y', String(hotresFullBot - hotresH));
      R.hotres.setAttribute('height', String(hotresH));
      R.hotres.setAttribute('rx', String(Math.min(10, hotresH / 2)));
      show(R.coreSteam, corePoolFrac < 0.999);
      R.poolClipRect.setAttribute('y', String(poolBot - poolH * corePoolFrac));
      R.poolClipRect.setAttribute('height', String(poolH * corePoolFrac));
    }

    function applyBubbles(force) {
      // Quantised to 5 % of boil, not 1 % (2026-08-06) — `st.boil` is
      // `max(voidFrac * 400, -subcool * 3)` (pwr_board_wiring.js), a 400x gain on void
      // fraction, so one integer is 0.0025 of void and the field flipped continuously
      // through any transient that voids the core.
      var bq = Math.round(clamp(st.boil, 0, 100) / 5) * 5;
      if (!force && bq === lastBoil) return;
      lastBoil = bq;
      // POOLED, not torn down. The teardown-and-re-append was 733 childList mutations per
      // 10 s of transient and the largest single source on the board after the SG's — and a
      // teardown is what the owner's "brief blank" looks like when the compositor presents
      // a frame mid-rebuild (see ui/app.js's rAF note). Reused circles also KEEP their
      // running animation, so the field stops snapping back to phase 0.
      var boil = bq / 100;
      var want = boil <= 0.02 ? 0 : Math.round(4 + boil * 48);
      var rises = ['bubbleRiseS', 'bubbleRiseM', 'bubbleRiseL'];
      var kids = R.bubbleG.childNodes;
      for (var i = 0; i < want; i++) {
        var x = coreL + 8 + ((i * 41 + (i % 5) * 17) % (coreW - 16));
        var startY = 450 - ((i * 53) % 150);
        var dur = (2.6 - boil * 1.3 + (i % 4) * 0.32).toFixed(2);
        var delay = (i * 0.23).toFixed(2);
        var r = (1.1 + (i % 3) * 0.5 + boil * 3.3).toFixed(2);
        var op = Math.min(0.92, 0.12 + boil * 2.1);
        var el = kids[i];
        if (!el) {
          el = h('circle', { fill: '#bdf1ff',
            style: { transformBox: 'fill-box', transformOrigin: 'center' } });
          R.bubbleG.appendChild(el);
        }
        if (el.getAttribute('cx') !== String(x)) el.setAttribute('cx', x);
        if (el.getAttribute('cy') !== String(startY)) el.setAttribute('cy', startY);
        if (el.getAttribute('r') !== r) el.setAttribute('r', r);
        if (el.getAttribute('opacity') !== String(op)) el.setAttribute('opacity', op);
        // Set once. Element i always draws the same keyframe name (i % 3), so a reused
        // circle never needs its animation reassigned — only re-timed.
        if (!el.__anim) {
          el.style.animation = rises[i % 3] + ' ' + dur + 's linear infinite';
          el.style.animationDelay = delay + 's';
          el.__anim = true;
        } else if (el.style.animationDuration !== dur + 's') {
          el.style.animationDuration = dur + 's';
        }
      }
      while (R.bubbleG.childNodes.length > want) R.bubbleG.removeChild(R.bubbleG.lastChild);
    }

    function applyFlow(force) {
      if (!force && last.showFlow === st.showFlow) return;
      last.showFlow = st.showFlow;
      var ps = st.showFlow ? 'running' : 'paused';
      R.wideflow.style.animationPlayState = ps;
      (R.connFlows || []).forEach(function (l) { l.style.animationPlayState = ps; });
    }

    function applyAll(force) {
      applyRods(force);
      applyColors(force);
      applyFluidTemp(force);
      applyInventory(force);
      applyBubbles(force);
      applyFlow(force);
    }

    // ---- scale-compensated flange + circulation group (watchScale pattern) ----
    var K = env.StdPipe.createKit(h);
    var curS = 0.65;
    function rebuildConns() {
      var s = curS, kP = 1 / s, D = 12; // 'large' standard bore, canvas px
      while (connsG.firstChild) connsG.removeChild(connsG.firstChild);
      connsG.setAttribute('transform', 'scale(' + kP.toFixed(4) + ')');
      // Internal circulation streaks are hand-drawn (no casing/bore), but they must sit on the
      // SAME dash grid and timebase as every K.pipe run or they drift out of phase with the
      // cold-leg pipe that joins them — and hard-coding a duration silently breaks whenever
      // the kit's period changes. Take both from the kit (#233).
      var CYC = K.DASH_CYCLE_S || 1.04;
      function flowLine(pts) {
        var scaled = pts.map(function (q) { return [q[0] * s, q[1] * s]; });
        var ph = K.dashPhase ? K.dashPhase(scaled, 1, CYC) : { pts: scaled, dir: 1, offset: 0, delay: 0, t: 0 };
        return h('polyline', {
          points: ph.pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' '),
          fill: 'none', stroke: env.StdPipe.phaseTempColor('water', st.tcold).flow,
          strokeWidth: D * 0.42, strokeLinecap: 'round', strokeLinejoin: 'round',
          strokeDasharray: '10 15', strokeDashoffset: ph.offset, opacity: 0.9,
          // Driven by StdPipe's shared ~12 Hz dash clock (std_pipe.js flowTick), not a CSS
          // animation — same contract as every K.pipe run, same grid, same timebase.
          'data-dash-t': ph.t.toFixed(6), 'data-dash-dir': String(ph.dir),
          'data-dash-cyc': CYC.toFixed(4), 'data-dash-sign': String(ph.dir)
        });
      }
      // hot leg / cold leg: bare mating flanges at the vessel wall (no protruding stub);
      // the modular pipe in the full diagram connects straight to these.
      connsG.appendChild(K.flange({ x: 422 * s, y: 214 * s, angle: 0, d: D }));
      connsG.appendChild(K.flange({ x: 422 * s, y: 295 * s, angle: 0, d: D }));
      // uniform-width circulation: down both downcomer channels into the lower plenum pool
      R.connFlows = [
        flowLine([[394, 301], [394, 500], [316, 536]]),
        flowLine([[166, 250], [166, 500], [246, 536]])
      ];
      R.connFlows.forEach(function (l) { connsG.appendChild(l); });
      applyFlow(true);
    }

    applyAll(true);
    rebuildConns();
    var unwatch = env.StdPipe.watchScale(svg, function (s) {
      if (Math.abs(s - curS) / s > 0.015) { curS = s; rebuildConns(); }
    });

    function update(props) {
      if (!props) return;
      if (props.regFrac != null) st.regFrac = clamp(props.regFrac, 0, 1);
      if (props.shutFrac != null) st.shutFrac = clamp(props.shutFrac, 0, 1);
      if (props.power != null) st.power = clamp(props.power, 0, 1.5);
      if (props.coreInv != null) st.coreInv = clamp(props.coreInv, 0, 100);
      if (props.boil != null) st.boil = clamp(props.boil, 0, 100);
      if (props.glow != null) st.glow = !!props.glow;
      if (props.showFlow != null) st.showFlow = !!props.showFlow;
      if (props.tcold != null) st.tcold = props.tcold;
      if (props.thot != null) st.thot = props.thot;
      if (props.cherenkov != null) st.cherenkov = clamp(props.cherenkov, 0, 100);
      applyAll(false);
    }

    function destroy() {
      if (unwatch) { unwatch(); unwatch = null; }
    }

    return { el: root, update: update, destroy: destroy };
  }
})();
