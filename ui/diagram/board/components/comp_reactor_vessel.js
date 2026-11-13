/* comp_reactor_vessel.js — 'Reactor Vessel v2' ported from
 * inbox/design_import/Reactor Vessel v2.dc.html per PORTING_CONTRACT.md.
 *
 * Vessel art only: the final diagram uses showControls:false, so the CONTROL/
 * SHUTDOWN GROUP hold-button pods, SCRAM cover, debug panel and telemetry
 * callback were not ported (external panels exist elsewhere on the board).
 * The internal rod-worth/power rAF loop is stripped — update() drives display:
 *   update({ regFrac, shutFrac, power, coreInv, boil, glow, showFlow })
 * CORE DAMAGE (2026-11-12, OWNER: "add a core melting animation to the diagram"), all four
 * read off the plant and none of them latched or advanced here, so the drawing cannot show
 * a melt the plant is not having (rewind the plant and the drawing rewinds with it):
 *   update({ cladC, oxFrac, damaged, melted })
 *   cladC    peak cladding temperature, degC. Above 400 the rods take a heat colour of their
 *            own (dull red -> orange -> yellow-white by 1850) whatever the fission power is,
 *            and an overheat halo grows behind them.
 *   oxFrac   fraction of the cladding thickness oxidised, 0..1. ONCE `damaged` IS SET (never
 *            before) the rods lose their shape as it approaches 0.17, the 10 CFR 50.46 embrittlement criterion the engine carries:
 *            they shorten from the top and a debris bed builds on the lower core plate.
 *   damaged  the engine's fuel-damage latch (cladding past 2200 degF): the halo pulses.
 *   melted   the engine's fuel-melt latch: the rods are stubs and a molten pool lies in the
 *            core and the lower plenum.
 * Rod motion arrives at snapshot cadence, so rod position is applied as a CSS
 * transform on moving groups instead of per-frame geometry rebuilds; bubble
 * rise / flow dashes are pausable CSS keyframes. The transform carried a
 * `transition: transform 0.3s linear` "so snapshot-cadence updates glide" until
 * #613 wave 3 measured what it cost — see the rodGroup comment and the rule in
 * std_pipe.js's tickAnimations block.
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
   * The bottom now reaches the lower support plate's flow-hole blocks (now derived — see
   * floorTop/floorBot below — rather than the authored y 455, height 17 this was written
   * against), so the column runs from the top of the fuel to the bottom of the blocks beneath
   * it, which is what the owner asked for and what the drawn internals actually show. */
  /* #825 (owner playtest 2026-11-03: "the water flowing up between the rods never quite reaches the upper hot side
   * water ... the moving water should extend up to this water above it"): the column now runs up through the upper
   * plate's flow holes (plateTop = coreTop - 7) to the plenum fluid, instead of stopping 7 px under a solid plate. */
  var plateTop = coreTop - 7;
  var poolTop = plateTop, poolBot = 472, poolH = poolBot - poolTop;   /* 269..472, 203 */
  var coreW = coreR - coreL, coreH = coreBot - coreTop, cx = 280;
  var barrelL = 180, barrelR = 380;
  var stripBottom = 216, stripH = 216, tubeTop = -20, tubeW = 26;
  var hotresFullTop = 160, hotresFullBot = coreTop, hotresFullH = hotresFullBot - hotresFullTop; // 116
  var barrelTop = 150, dcTop = 244, legGapTop = 203, legGapBot = 226;
  var fuelXs = [196, 238, 280, 322, 364];              // fuel-rod x centers (5)
  var ctrlXs = [217, 259, 301, 343];                    // control-rod x centers, 2 per bank (4)
  /* THE CORE-BOTTOM FLOW-CHANNEL BLOCKS (#809 item 5, owner playtest 2026-09-27): "small
   * blocks similar color to the casing under the rods, both control and fuel ... simulate the
   * water channels at the bottom of the core ... extend from the bottom of the rods to the
   * bottom of the moving water column." One block per rod (9 = 5 fuel + 4 control), running
   * from coreBot (bottom of the active fuel/absorber length) to poolBot (bottom of the
   * animated core water column) — both already-authored constants above, no new magic
   * numbers. Drawn casing-colored; see the paint-order note where they're pushed, below,
   * for why they sit between the water wash and the animated upflow dashes. */
  var floorTop = coreBot, floorBot = poolBot, floorH = floorBot - floorTop;

  function ensureStyles() {
    if (document.getElementById('bd-reactorvessel-styles')) return;
    var s = document.createElement('style');
    s.id = 'bd-reactorvessel-styles';
    s.textContent =
      '@keyframes flowmove{to{stroke-dashoffset:-24}}' +
      '@keyframes bubbleRiseS{0%{transform:translateY(0);opacity:0}14%{opacity:1}82%{opacity:1}100%{transform:translateY(-80px);opacity:0}}' +
      '@keyframes bubbleRiseM{0%{transform:translateY(0);opacity:0}12%{opacity:1}85%{opacity:1}100%{transform:translateY(-130px);opacity:0}}' +
      '@keyframes bubbleRiseL{0%{transform:translateY(0);opacity:0}10%{opacity:1}88%{opacity:1}100%{transform:translateY(-180px);opacity:0}}' +
      '@keyframes cherBreathe{0%,100%{opacity:0.82}50%{opacity:1}}' +
      '@keyframes corePulse{0%,100%{opacity:0.7}50%{opacity:1}}' +
      '@media (prefers-reduced-motion: reduce){.rv-core-pulse{animation:none!important}}';
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
    var st = { regFrac: 0.8333, shutFrac: 0.8333, power: 1, coreInv: 100, boil: 45, glow: true, showFlow: true, tcold: 290, thot: 320, cherenkov: 70,
               cladC: 300, oxFrac: 0, damaged: false, melted: false, froth: false, steamHead: false };
    var last = {};
    var lastBoil = -1;
    /* filter-free halos (#613 wave 4) — see RD.BoardH.softGlow. `glow` used to be ONE blur
     * shared by the thermal and fuel halos; a gradient carries its own colour, so the two
     * now hold one gradient each and `fuelGlow` is a third id. */
    var gFlux = RD.BoardH.softGlow(ids.glow2, '#22d8c4');
    var gTherm = RD.BoardH.softGlow(ids.glow, 'rgb(44,88,152)');
    var gFuel = RD.BoardH.softGlow(gid + 'FuelGlow', 'rgb(61,38,22)');
    var gMelt = RD.BoardH.softGlow(gid + 'MeltGlow', 'rgb(255,96,30)');   // the overheat halo (core damage)

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
      /* the downcomer + lower-plenum water body is clipped to the SOLID-water surface (owner 2026-11-13: a drained vessel read as full
       * because this body was always drawn to the brim). `bodyClipRect` is moved by applyInventory; `bodyTopClipRect` bounds the
       * froth/steam tint over the same shape, from the brim down to that surface. */
      h('clipPath', { id: gid + 'BodyClip' }, R.bodyClipRect = h('rect', { x: 150, y: 240, width: 260, height: 350 })),
      h('clipPath', { id: gid + 'BodyTopClip' }, R.bodyTopClipRect = h('rect', { x: 150, y: 240, width: 260, height: 0 })),
      h('clipPath', { id: ids.poolClip }, R.poolClipRect = h('rect', { x: coreL, y: poolTop, width: coreW, height: poolH })),
      // stripClip: clip windows for the two moving indicator fills (one rect per bank tube)
      h('clipPath', { id: ids.stripClip },
        h('rect', { x: 225, y: 0, width: tubeW, height: stripH }),
        h('rect', { x: 309, y: 0, width: tubeW, height: stripH })),
      /* The three halos below were solid rects behind an feGaussianBlur (stdDeviation 9 and 11)
       * until #613 wave 4. They are now radial-gradient fills grown by ~2*stdDeviation, which
       * is where the blur's light actually reached — RD.BoardH.softGlow carries the numbers.
       * The thermal and fuel halos recolour through setColor(); writing `fill` on the rect
       * would now paint over the gradient reference and kill the glow outright. */
      gFlux.def, gTherm.def, gFuel.def, gMelt.def,
      h('linearGradient', { id: gid + 'Corium', x1: '0', y1: '0', x2: '0', y2: '1' },
        h('stop', { offset: '0', stopColor: '#ffe9a8' }), h('stop', { offset: '0.35', stopColor: '#ff9a2e' }), h('stop', { offset: '1', stopColor: '#a8260f' })),
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
    // dynamic parts live in translated groups, so a rod step is one `transform`
    // write instead of a geometry rebuild.
    // NO CSS TRANSITION on those groups (#613 wave 3). They carried
    // 'transition: transform 0.3s linear' "so snapshot-cadence updates glide" — but rods move
    // continuously during a startup and under automatic rod control, so the transition was
    // restarted by every broadcast and never idle. See std_pipe.js's tickAnimations comment for
    // the rule and the measurement.
    function rodGroup(rodXs, cxs) {
      var stripL = cxs - (tubeW / 2 - 1);
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
      var mvFill = h('g', null,
        h('rect', { x: stripL + 1.5, y: stripBottom, width: tubeW - 5, height: stripH, rx: 4, fill: 'url(#' + ids.strip + ')' }));
      els.push(h('g', { clipPath: 'url(#' + ids.stripClip + ')' }, mvFill));
      var mvKnob = h('g', null,
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
      var mvAbs = h('g', null, abs);
      var mvTips = h('g', null, tips);
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
    svgKids.push(R.fluxglow = h('rect', { x: barrelL - 30, y: 120, width: (barrelR - barrelL) + 60, height: 375, rx: 44, fill: gFlux.paint, opacity: 0.04 }));
    svgKids.push(h('rect', { x: barrelL, y: 150, width: barrelR - barrelL, height: 315, rx: 14, fill: '#0a161f', stroke: '#223543', strokeWidth: 1.2 }));
    // thermal glow behind core
    svgKids.push(R.glowr = h('rect', { x: coreL - 26, y: coreTop - 30, width: coreW + 52, height: coreH + 60, rx: 30, fill: gTherm.paint }));
    // hot reservoir above the core
    svgKids.push(R.hotresSteam = h('rect', { x: barrelL + 6, y: hotresFullTop, width: barrelR - barrelL - 12, height: hotresFullH, rx: 10, fill: '#d7e0e5', opacity: 0.16 }));
    svgKids.push(R.hotres = h('rect', { x: barrelL + 6, y: hotresFullTop, width: barrelR - barrelL - 12, height: hotresFullH, rx: 10, stroke: '#3a2320', strokeWidth: 1 }));
    // downcomer + lower plenum: one continuous water body (evenodd cut removes the barrel footprint)
    var bodyD = 'M155,244 L155,538 A125 50 0 0 0 405,538 L405,244 Z M177,244 L177,465 Q177,471 183,471 L377,471 Q383,471 383,465 L383,244 Z';
    svgKids.push(h('path', { fillRule: 'evenodd', fill: 'url(#' + ids.pool + ')', clipPath: 'url(#' + gid + 'BodyClip)', d: bodyD }));
    /* above the solid-water surface in the downcomer: froth (pale) when the pumps are pushing a mixture, steam (grey) otherwise */
    svgKids.push(R.bodyTint = h('path', { fillRule: 'evenodd', clipPath: 'url(#' + gid + 'BodyTopClip)', d: bodyD, fill: '#cfeaf0', opacity: 0.4, display: 'none' }));
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
    // core plates: upper plate + lower support plate
    /* the upper plate is drawn AFTER the core water (see the flow holes below), so the upflow can reach the plenum */
    svgKids.push(h('rect', { x: 177, y: 456, width: 206, height: 15, rx: 4, fill: '#2c3f4c', stroke: '#46596a', strokeWidth: 0.9 }));
    svgKids.push(h('rect', { x: coreL, y: coreTop, width: coreW, height: coreH, fill: '#07121a' }));
    // core steam space (visible as inventory drains below 50%)
    svgKids.push(R.coreSteam = h('g', { clipPath: 'url(#' + ids.coreClip + ')' },
      R.coreSteamRect = h('rect', { x: coreL, y: 276, width: coreW, height: 180, fill: '#d7e0e5', opacity: 0.14 })));
    /* FROTH (owner 2026-11-13: "the reactor vessel does not show steam inside it"). Pumps turning with a mostly-void core is a
     * two-phase MIXTURE, not water: it is drawn paler and foamed, over the part of the core above the solid-water surface
     * (applyInventory sizes it), so a vessel at 26 % inventory cannot read as full. Drawn BEFORE the rods, the heat glow, the
     * debris and the corium (all added below), so none of the damage art is ever under it. */
    var foam = [];
    for (var fi = 0; fi < 26; fi++) {
      foam.push(h('circle', { cx: coreL + 8 + ((fi * 47 + (fi % 4) * 19) % (coreW - 16)), cy: coreTop + 6 + ((fi * 29) % (coreH - 12)),
        r: (2 + (fi % 4) * 1.4).toFixed(1), fill: 'none', stroke: '#eefafc', strokeWidth: 1, opacity: 0.7 }));
    }
    svgKids.push(R.froth = h('g', { clipPath: 'url(#' + ids.coreClip + ')', 'data-rv-froth': '1', display: 'none' },
      R.frothRect = h('rect', { x: coreL, y: coreTop, width: coreW, height: coreH, fill: '#cfeaf0', opacity: 0.55 }), foam));
    // core channel water + upflow, clipped to the (dynamic) core pool level
    R.wideflow = h('line', {
      x1: cx, y1: poolBot, x2: cx, y2: poolTop, stroke: 'url(#' + ids.cdash + ')', strokeWidth: coreW,
      strokeLinecap: 'butt', strokeDasharray: '15 9', opacity: 0.94,
      // .flowwide from the source, applied inline (dasharray 15 9 + flowmove 1.5s)
      style: { animation: 'flowmove 1.5s linear infinite' }
    });
    svgKids.push(h('g', { clipPath: 'url(#' + ids.poolClip + ')' },
      h('rect', { x: coreL, y: poolTop, width: coreW, height: poolH, fill: 'url(#' + ids.cflow + ')', opacity: 0.45 }),
      h('line', { x1: cx, y1: poolBot, x2: cx, y2: poolTop, stroke: 'url(#' + ids.cflow + ')', strokeWidth: coreW, strokeLinecap: 'butt', opacity: 0.78 })));
    /* #809 item 5 (owner playtest 2026-09-27): the core-bottom flow-channel blocks, one per
     * rod — see floorTop/floorBot up top. Drawn OVER the base water wash above (so they read
     * as solid casing-colored structure rather than washing out under the tint — measured:
     * at .78 opacity the wash left only 22% of a block painted BEFORE it) but BEFORE the
     * animated upflow dashes (R.wideflow, next), which still pass in front through their own
     * dash gaps — "must not cover... the water animation's moving parts". NOT wrapped in the
     * poolClip group: this is STRUCTURE, and it does not empty when the water does (the clip
     * shrinks from the top on falling inventory, coreBot..poolBot is always its bottom edge —
     * but a drained core should still show the metal, not have it vanish with the water). */
    svgKids.push(h('g', null,
      fuelXs.concat(ctrlXs).map(function (x) {
        return h('rect', { x: x - 7, y: floorTop, width: 14, height: floorH, rx: 2, fill: '#2c3f4c', stroke: '#46596a', strokeWidth: 0.8 });
      })));
    svgKids.push(h('g', { clipPath: 'url(#' + ids.poolClip + ')' }, R.wideflow));
    /* UPPER CORE PLATE WITH FLOW HOLES (#825): solid over each rod's footprint and at the barrel edges, open in the 7 px
     * gap between neighbouring rods, so the animated upflow visibly passes through into the hot plenum water above. */
    (function () {
      var xs = fuelXs.concat(ctrlXs).sort(function (a, b) { return a - b; }), x0 = barrelL + 4, x1 = barrelR - 4;
      var plate = [[x0, xs[0] - 7]];
      xs.forEach(function (x) { plate.push([x - 7, x + 7]); });
      plate.push([xs[xs.length - 1] + 7, x1]);
      svgKids.push(h('g', null, plate.map(function (r, i) {
        return h('rect', { key: 'plate' + i, x: r[0], y: plateTop, width: Math.max(0, r[1] - r[0]), height: 7, rx: 2, fill: '#2b3d4a' });
      })));
    }());
    // fuel rods (fuelXs is the module-level array, above)
    svgKids.push(R.fuelglow = h('rect', { x: coreL - 24, y: coreTop - 26, width: coreW + 48, height: coreH + 52, rx: 28, fill: gFuel.paint }));
    /* CORE DAMAGE, behind the rods: the overheat halo, then (in front, below) the debris bed and the pool */
    svgKids.push(R.meltGlow = h('rect', { 'class': 'rv-core-pulse', x: coreL - 30, y: coreTop - 30, width: coreW + 60, height: coreH + 70, rx: 30,
      fill: gMelt.paint, opacity: 0, display: 'none', style: { pointerEvents: 'none' } }));
    R.fuelRods = fuelXs.map(function (x) {
      return h('rect', { x: x - 7, y: coreTop, width: 14, height: coreH, rx: 3, fill: 'url(#' + ids.fuel + ')', strokeWidth: 0.6 });
    });
    svgKids.push(h('g', null, R.fuelRods));
    /* the debris bed on the lower core plate and the molten pool in the lower plenum, drawn OVER the rods' feet */
    svgKids.push(R.debris = h('path', { 'class': 'rv-core-pulse', fill: 'url(#' + gid + 'Corium)', stroke: '#5a1a0c', strokeWidth: 1, display: 'none', style: { pointerEvents: 'none' } }));
    svgKids.push(R.corium = h('ellipse', { 'class': 'rv-core-pulse', cx: cx, cy: 549, rx: 0, ry: 0, fill: 'url(#' + gid + 'Corium)', stroke: '#5a1a0c', strokeWidth: 1, display: 'none', style: { pointerEvents: 'none' } }));
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
      var heat = heatOf(st.cladC);
      if (!force && last.power === st.power && last.glow === st.glow && last.heat === heat) return;
      last.power = st.power; last.glow = st.glow; last.heat = heat;
      var p = st.power, glowOn = st.glow;
      var COOL = [44, 88, 152], HOT = [176, 56, 34];
      var cTopA = mixArr(COOL, HOT, p * 1.05);
      var cTop = rgbStr(cTopA);   // hot-side power tone — only the thermal glow behind the core uses it now
      var fuelBrown = [61, 38, 22], fuelOrange = [255, 140, 26], fuelYellow = [255, 226, 90], fuelWhite = [255, 255, 255];
      var fuelBaseArr;
      if (p <= 1) fuelBaseArr = mixArr(fuelBrown, fuelOrange, p);
      else if (p <= 1.25) fuelBaseArr = mixArr(fuelOrange, fuelYellow, (p - 1) / 0.25);
      else fuelBaseArr = mixArr(fuelYellow, fuelWhite, Math.min(1, (p - 1.25) / 0.25));
      /* HEAT OF ITS OWN (core damage): an overheated rod glows whatever the fission power -- a
       * tripped, uncovered core is at zero power and climbing. Dull red, orange, yellow-white. */
      if (heat > 0) {
        var hot = heat < 0.5 ? mixArr([150, 34, 22], [255, 122, 30], heat / 0.5) : mixArr([255, 122, 30], [255, 240, 190], (heat - 0.5) / 0.5);
        fuelBaseArr = mixArr(fuelBaseArr, hot, Math.min(1, 0.35 + heat * 1.3));
      }
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
      gTherm.setColor(cTop);
      R.glowr.setAttribute('opacity', String(Math.min(0.42, p * 0.5)));
      show(R.glowr, glowOn && p > 0.02);
      gFuel.setColor(fuelBase);
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
      if (!force && last.coreInv === st.coreInv && last.froth === st.froth && last.steamHead === st.steamHead) return;
      last.coreInv = st.coreInv; last.froth = st.froth; last.steamHead = st.steamHead;
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
      /* the three states of the space above the solid water: steam (grey, the pipes' steam language), froth (pale, foamed),
       * or nothing special. `steamHead` is the hot-leg void latch the pipes share; `froth` is pumps-turning + core void. */
      var waterY = poolBot - poolH * corePoolFrac;          /* solid-water surface, canvas y */
      var bodyY = corePoolFrac >= 0.999 ? 240 : Math.max(240, Math.min(590, waterY));
      R.bodyClipRect.setAttribute('y', String(bodyY));
      R.bodyClipRect.setAttribute('height', String(590 - bodyY));
      R.bodyTopClipRect.setAttribute('height', String(Math.max(0, bodyY - 240)));
      show(R.bodyTint, bodyY > 244 && (!!st.froth || !!st.steamHead));
      R.bodyTint.setAttribute('fill', st.froth ? '#cfeaf0' : '#aab4ba');
      R.bodyTint.setAttribute('opacity', st.froth ? '0.45' : '0.5');
      var surfY = Math.max(coreTop, Math.min(coreBot, waterY));
      var frothH = coreBot - coreTop - (coreBot - surfY);
      show(R.froth, !!st.froth && frothH > 2);
      R.frothRect.setAttribute('height', String(Math.max(0, frothH)));
      var steamy = !!st.steamHead && !st.froth;
      R.coreSteamRect.setAttribute('fill', steamy ? '#aab4ba' : '#d7e0e5');
      R.coreSteamRect.setAttribute('opacity', steamy ? '0.5' : '0.14');
      R.hotresSteam.setAttribute('fill', st.steamHead ? '#aab4ba' : '#d7e0e5');
      R.hotresSteam.setAttribute('opacity', st.steamHead ? '0.5' : '0.16');
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

    /* 0 below 400 degC (normal cladding peaks near 350), 1 at 1850 degC -- the display's own scale */
    function heatOf(c) { return c > 400 ? clamp((c - 400) / 1450, 0, 1) : 0; }
    /* CORE DAMAGE GEOMETRY. `slump` 0..1 is the oxidised fraction against the 0.17 embrittlement
     * criterion; `melted` takes the rods to stubs. Each rod loses a slightly different height (a
     * fixed pattern, no randomness: the same plant state always draws the same core). */
    function applyDamage(force) {
      var heat = heatOf(st.cladC);
      var melted = !!st.melted, dmg = !!st.damaged;
      /* NO SHAPE CHANGE BEFORE THE PLANT SAYS DAMAGE (critic round 2, M4a). The oxidised fraction only ever rises,
       * and MEASURED on a ride that never latches (accumulators in service) it reaches 7.6 % in five plant-hours:
       * keyed on it alone the drawing lost a quarter of its rods on a core the plant calls intact. Before the
       * latch, heat shows as colour and halo only. */
      var slump = (dmg || melted) ? clamp(st.oxFrac / 0.17, 0, 1) : 0;
      var key = Math.round(heat * 50) + '|' + Math.round(slump * 50) + '|' + (melted ? 1 : 0) + '|' + (dmg ? 1 : 0);
      if (!force && last.dmgKey === key) return;
      last.dmgKey = key;
      var haloOp = Math.min(0.85, heat * 1.1);
      show(R.meltGlow, haloOp > 0.02);
      R.meltGlow.setAttribute('opacity', haloOp.toFixed(3));
      R.meltGlow.style.animation = (dmg || melted) ? 'corePulse 1.6s ease-in-out infinite' : '';
      var coreBotY = coreTop + coreH;
      R.fuelRods.forEach(function (r, i) {
        var lose = melted ? 0.82 + 0.05 * ((i * 7) % 3) : slump * (0.34 + 0.09 * ((i * 5) % 4));
        var hh = coreH * (1 - clamp(lose, 0, 0.94));
        r.setAttribute('y', String(coreBotY - hh));
        r.setAttribute('height', String(hh));
      });
      /* the debris bed: a mound across the core's floor, as tall as what the rods lost on average */
      var bedH = coreH * (melted ? 0.2 : slump * 0.16);
      if (bedH > 1) {
        var x0 = coreL + 2, x1 = coreL + coreW - 2, yB = coreBotY, yT = yB - bedH, xm = (x0 + x1) / 2;
        R.debris.setAttribute('d', 'M' + x0 + ',' + yB + ' L' + x0 + ',' + (yT + bedH * 0.45).toFixed(1) +
          ' Q' + ((x0 + xm) / 2).toFixed(1) + ',' + (yT - bedH * 0.15).toFixed(1) + ' ' + xm.toFixed(1) + ',' + (yT + bedH * 0.1).toFixed(1) +
          ' Q' + ((xm + x1) / 2).toFixed(1) + ',' + (yT + bedH * 0.3).toFixed(1) + ' ' + x1 + ',' + (yT + bedH * 0.5).toFixed(1) + ' L' + x1 + ',' + yB + ' Z');
        /* hot debris glows and pulses; quenched debris is slag -- the damage stays, the light does not */
        var bedHot = heat > 0.08 || melted;
        R.debris.setAttribute('fill', bedHot ? 'url(#' + gid + 'Corium)' : '#3b2b24');
        R.debris.style.animation = bedHot ? 'corePulse 2.2s ease-in-out infinite' : '';
      }
      show(R.debris, bedH > 1);
      /* the pool in the lower plenum: only on the engine's melt latch */
      show(R.corium, melted);
      if (melted) { R.corium.setAttribute('rx', '84'); R.corium.setAttribute('ry', '20'); R.corium.style.animation = 'corePulse 2.8s ease-in-out infinite'; }
    }

    function applyAll(force) {
      applyDamage(force);
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
      if (props.cladC != null && isFinite(props.cladC)) st.cladC = props.cladC;
      if (props.oxFrac != null && isFinite(props.oxFrac)) st.oxFrac = clamp(props.oxFrac, 0, 1);
      if (props.damaged != null) st.damaged = !!props.damaged;
      if (props.melted != null) st.melted = !!props.melted;
      if (props.froth != null) st.froth = !!props.froth;
      if (props.steamHead != null) st.steamHead = !!props.steamHead;
      applyAll(false);
    }

    function destroy() {
      if (unwatch) { unwatch(); unwatch = null; }
    }

    return { el: root, update: update, destroy: destroy };
  }
})();
