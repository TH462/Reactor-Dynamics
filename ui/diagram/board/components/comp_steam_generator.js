/* comp_steam_generator.js — Steam Generator board component.
 * Ported from inbox/design_import/Steam Generator.dc.html per PORTING_CONTRACT.md.
 * Used with showControls:false — the LEVEL/BOIL slider card is not ported and the
 * TIGHT viewBox crop ('69 20 244 535') is used.
 * update({ power, level, boil, temp, showFlow, glow })
 */
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};
  RD.BoardComps = RD.BoardComps || {};
  RD.BoardComps['Steam Generator'] = { build: build };

  function ensureStyles() {
    if (document.getElementById('bd-steamgenerator-styles')) return;
    var s = document.createElement('style');
    s.id = 'bd-steamgenerator-styles';
    s.textContent =
      '@keyframes flowmove{to{stroke-dashoffset:-24}}' +
      '.flow{stroke-dasharray:9 15;animation:flowmove 1.1s linear infinite}' +
      // The rise DISTANCE is per bubble *(OWNER DIRECTIVE, 2026-08-04: "SG bubbles should
      // travel to the top of the water level. (but not into the steam above it)")*, #350
      // item 24. It used to be a flat -150 px for every bubble whatever the level, so a bubble
      // starting low stopped well short of the surface and one starting high ran into the
      // clip and vanished mid-column. `--sg-rise` is set per element to exactly the distance
      // from that bubble's start to the water line, so every one of them surfaces and none
      // crosses into the steam space.
      '@keyframes sgBubbleRise{' +
        '0%{transform:translateY(0);opacity:0}' +
        '12%{opacity:1}' +
        '88%{opacity:1}' +
        '100%{transform:translateY(calc(-1 * var(--sg-rise, 150px)));opacity:0}}';
    (document.head || document.documentElement).appendChild(s);
  }

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clearEl(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function build(cfg, env) {
    ensureStyles();
    var h = env.h;
    var StdPipe = env.StdPipe;
    var K = StdPipe.createKit(h);

    // per-instance unique ids for every gradient / clipPath / filter
    var ids = {
      steel: env.uid('sgSteel'), water: env.uid('sgWater'), steam: env.uid('sgSteam'),
      tube: env.uid('sgTube'), tubeDash: env.uid('sgTubeDash'), clip: env.uid('sgClip'), waterclip: env.uid('sgWClip'),
      glow: env.uid('sgGlow'), steamblur: env.uid('sgSBlur')
    };

    // ---- geometry (verbatim from the design source) ----
    var cx = 210;
    var shellTop = 110, shellBot = 460, domeRy = 80, botRy = 90;
    var outer = 'M110,' + shellTop + ' A100 ' + domeRy + ' 0 0 1 310,' + shellTop +
      ' L310,' + shellBot + ' A100 ' + botRy + ' 0 0 1 110,' + shellBot + ' Z';
    var inner = 'M123,' + (shellTop + 1) + ' A87 ' + (domeRy - 12) + ' 0 0 1 297,' + (shellTop + 1) +
      ' L297,' + (shellBot - 1) + ' A87 ' + (botRy - 8) + ' 0 0 1 123,' + (shellBot - 1) + ' Z';
    var tubeSheetY = 440;
    // Tube legs end at the BOTTOM of the tube sheet (its 10 px slab), not 30 px below it —
    // they used to run to y=470, deep into the channel-head reservoirs, which read as extra
    // water column ("the U-tubes go deep into the bottom reservoirs", #509 item 8).
    var legBot = tubeSheetY + 10;
    // Whole-vessel WIDE-range water column: wide 0 % = tube sheet, 100 % = up in the dome.
    var waterBot = tubeSheetY - 5, waterTopFull = 48;
    function fullY(wr) { return waterBot - (clampN(wr, 0, 100) / 100) * (waterBot - waterTopFull); }
    // The narrow (working) range is a zoomed window of the wide scale — MUST match the
    // engine's sg_level_wide mapping (pwr_engine.js SG_WR_LO/HI): narrow 0–100 % ⇒ wide
    // SG_WR_LO..SG_WR_HI. The gauge is physically placed over that window so its marker
    // (narrow level) lines up with the wide-range water surface it zooms into.
    var SG_WR_LO = 30, SG_WR_HI = 75;
    // U-tube bundle height is PINNED to the engine's SG dryout threshold — pwr_config.js
    // sg_dryout_wide_pct = 30 % wide, which equals SG_WR_LO (narrow 0 %). The tallest
    // U-bend apex sits at that wide-range level, so the animated water surface reaches the
    // tube tops exactly as the engine begins tube-bundle uncovery (heat transfer collapse).
    // Below it the tubes progressively emerge — the dryout the operator sees IS the dryout
    // the engine models. bendY = where the straight legs end and the bends arc up to the top.
    // FOUR tubes, not five, and each one fatter *(OWNER DIRECTIVE, 2026-08-04: "Make the SG
    // u-tubes largeer to more easily see the flow. remove one tube if needed.")*, #350 item 11.
    // The primary-flow dashes inside them were 1.6 px on a 4 px tube — invisible at board
    // scale, which is the whole complaint. `tubeMaxR` STAYS 62: it sets bendY, and bendY is
    // pinned to the engine's SG dryout threshold (see below), so widening the bundle would
    // move the water surface off the level at which the engine actually uncovers the tubes.
    var tubeRadii = [17, 32, 47, 62], tubeMaxR = 62;
    var tubeTopY = fullY(SG_WR_LO);                                   // outer bend apex = 30 % wide (= gBot)
    var bendY = tubeTopY + tubeMaxR;
    var bundleTopY = tubeTopY - 6, bundleBoxH = tubeSheetY - bundleTopY;   // glow + outline bounds (enclose the bends)

    function mix(a, b, t) {
      t = Math.max(0, Math.min(1, t));
      return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
        Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
    }
    var COOL = [44, 88, 152], HOT = [176, 56, 34];

    // ---- defs (dynamic stops kept as refs) ----
    var waterStops = [h('stop', { offset: '0' }), h('stop', { offset: '1' })];
    var steamStops = [h('stop', { offset: '0' }), h('stop', { offset: '1' })];
    // TWO tube gradients now, both running hot-leg side → cold-leg side (#357). `tube` is the
    // tube BODY and already carries the full-strength fluid colour since #350 item 20 inverted
    // the convention; `tubeDash` is new and carries the DARKER dash colour for the moving flow
    // line, which was a flat near-white '#eaf4fb' — the one primary-coolant path on the board
    // that did not look like a pipe, and what the owner asked to match.
    // The mid stop was a hardcoded '#7a5a9a' purple — a blend that made sense when the legs
    // rendered red and blue, and stale since #237 put them at orange-red and green. Computed
    // from the mean leg temperature now, which is also what the fluid does along the tube.
    var tubeStops = [h('stop', { offset: '0' }), h('stop', { offset: '0.5' }), h('stop', { offset: '1' })];
    var tubeDashStops = [h('stop', { offset: '0' }), h('stop', { offset: '0.5' }), h('stop', { offset: '1' })];
    var steamGrad = h('linearGradient', { id: ids.steam, gradientUnits: 'userSpaceOnUse', x1: '0', y1: 195, x2: '0', y2: shellTop }, steamStops);
    var waterClipRect = h('rect', { x: 124, y: bendY, width: 172, height: waterBot - bendY });
    var defs = h('defs', null,
      h('linearGradient', { id: ids.steel, x1: '0', y1: '0', x2: '0', y2: '1' },
        h('stop', { offset: '0', stopColor: '#2a3844' }), h('stop', { offset: '1', stopColor: '#0c141c' })),
      h('linearGradient', { id: ids.water, x1: '0', y1: '0', x2: '0', y2: '1' }, waterStops),
      steamGrad,
      h('linearGradient', { id: ids.tube, x1: '0', y1: '0', x2: '1', y2: '0' }, tubeStops),
      h('linearGradient', { id: ids.tubeDash, x1: '0', y1: '0', x2: '1', y2: '0' }, tubeDashStops),
      h('clipPath', { id: ids.clip }, h('path', { d: inner })),
      h('clipPath', { id: ids.waterclip }, waterClipRect),
      h('filter', { id: ids.glow, x: '-40%', y: '-40%', width: '180%', height: '180%' }, h('feGaussianBlur', { stdDeviation: '8' })),
      h('filter', { id: ids.steamblur, x: '-60%', y: '-60%', width: '220%', height: '220%' }, h('feGaussianBlur', { stdDeviation: '4' })));

    // ---- shell + secondary side ----
    /* NO CSS TRANSITION on the three level elements below (#613 wave 3). These are rewritten on
     * every broadcast, so a 150 ms transition restarts before the previous one finishes and the
     * compositor never goes idle: measured 6-7 running CSSTransitions at EVERY sampled instant
     * and 870 compositor draws per 15 s (60 Hz) against 298 app paints. Removing exactly this
     * set took frames to 339, -61 %. The rule and the gate are in std_pipe.js's tickAnimations
     * comment. */
    var steamRect = h('rect', {
      x: 110, y: 20, width: 200, height: 0, fill: 'url(#' + ids.steam + ')', opacity: 0.5
    });
    var waterRect = h('rect', {
      x: 110, y: waterBot, width: 200, height: tubeSheetY - waterBot,   /* ends at the tube sheet (#509 item 8) */
      fill: 'url(#' + ids.water + ')', opacity: 0.72
    });
    var surfLine = h('line', {
      x1: 124, y1: 0, x2: 296, y2: 0, stroke: '#bdf1ff', strokeWidth: 2, opacity: 0.5,
      strokeDasharray: '22 12'
    });
    var flowEls = [surfLine];

    var glowRect = h('rect', {
      x: 138, y: bundleTopY, width: 144, height: bundleBoxH, rx: 48,
      filter: 'url(#' + ids.glow + ')', style: { display: 'none' }
    });
    var hotcRect = h('rect', { x: 110, y: tubeSheetY + 10, width: 100, height: 90, opacity: 0.85 });
    var coldcRect = h('rect', { x: cx, y: tubeSheetY + 10, width: 100, height: 90, opacity: 0.85 });

    var tubeGroups = tubeRadii.map(function (g) {
      var d = 'M' + (cx - g) + ',' + legBot + ' L' + (cx - g) + ',' + bendY +
        ' A' + g + ' ' + g + ' 0 0 1 ' + (cx + g) + ',' + bendY + ' L' + (cx + g) + ',' + legBot;
      var flowPath = h('path', { d: d, fill: 'none', stroke: 'url(#' + ids.tubeDash + ')', strokeWidth: 3.2, strokeLinecap: 'round', opacity: 0.85, strokeDasharray: '10 16' });
      flowEls.push(flowPath);
      return h('g', null,
        h('path', { d: d, fill: 'none', stroke: 'url(#' + ids.tube + ')', strokeWidth: 8, strokeLinecap: 'round' }),
        flowPath);
    });

    var bubbleGroup = h('g', { clipPath: 'url(#' + ids.waterclip + ')' });

    // hot-side inlet nozzle -- extended inward so the hot coolant reservoir reaches the flange face
    var hotNoz = h('rect', { x: 107, y: 485, width: 58, height: 20, rx: 3, stroke: '#3a2320', strokeWidth: 1 });
    var coldNoz = h('rect', { x: 249, y: 515, width: 16, height: 28, rx: 3, stroke: '#16324f', strokeWidth: 1 });

    // ---- standardized connectors: bare mating flanges at each nozzle, scale-compensated ----
    var connsGroup = h('g', null);
    var lastS = null;
    function rebuildConns() {
      var s = lastS || 0.95;
      var kP = 1 / s;
      connsGroup.setAttribute('transform', 'scale(' + kP.toFixed(4) + ')');
      clearEl(connsGroup);
      connsGroup.appendChild(K.flange({ key: 'hotFl', x: 107 * s, y: 495 * s, angle: 0, d: 12 }));
      connsGroup.appendChild(K.flange({ key: 'coldFl', x: 257 * s, y: 543 * s, angle: 90, d: 12 }));
      // fw-in dropped 245 → 269 (world y ≈ 436) so the feed line runs LEVEL with the
      // feed tee it comes from instead of climbing ~15 px into the vessel (#237, owner)
      connsGroup.appendChild(K.flange({ key: 'fwFl', x: 310 * s, y: 269 * s, angle: 0, d: 8 }));
      connsGroup.appendChild(K.flange({ key: 'stFl', x: 210 * s, y: 55 * s, angle: 90, d: 8 }));
    }
    rebuildConns();

    // NARROW-RANGE level gauge — the working range, physically spanning the wide-range
    // SG_WR_LO..SG_WR_HI window on the vessel so the marker (narrow level) lines up with
    // the wide-range water surface. gTop = narrow 100 %, gBot = narrow 0 %. Zones match the
    // PWR SG-level setpoints (pwr_control.js): red = trip (lo-lo 17 % scram / hi 90 % P-14),
    // yellow = alarm (low 30 % / high 75 %), green = normal band.
    var gx = 88, gw = 15, gTop = fullY(SG_WR_HI), gBot = fullY(SG_WR_LO), gH = gBot - gTop;
    function pctY(pct) { return gBot - (clampN(pct, 0, 100) / 100) * gH; }
    var zones = [[0, 17, '#ef4d2e'], [17, 30, '#f0a53b'], [30, 75, '#43d17a'], [75, 90, '#f0a53b'], [90, 100, '#ef4d2e']];
    var gEls = [h('rect', { x: gx - 2, y: gTop - 2, width: gw + 4, height: gH + 4, rx: 4, fill: '#0b1119', stroke: '#25333e', strokeWidth: 1 })];
    zones.forEach(function (z) {
      gEls.push(h('rect', { x: gx, y: pctY(z[1]), width: gw, height: pctY(z[0]) - pctY(z[1]), fill: z[2], opacity: 0.85 }));
    });
    [0, 25, 50, 75, 100].forEach(function (pct) {
      gEls.push(h('line', { x1: gx + gw, y1: pctY(pct), x2: gx + gw + 4, y2: pctY(pct), stroke: '#3b4f5e', strokeWidth: 1 }));
    });
    var markerGroup = h('g', null,   /* no transition — broadcast-cadence transform, #613 */
      h('polygon', { points: (gx - 2) + ',0 ' + (gx - 9) + ',-5 ' + (gx - 9) + ',5', fill: '#eaf4fb', stroke: '#0b1119', strokeWidth: 0.6 }),
      h('line', { x1: gx, y1: 0, x2: gx + gw, y2: 0, stroke: '#eaf4fb', strokeWidth: 1.6 }));
    gEls.push(markerGroup);
    gEls.push(h('text', { x: gx + gw / 2, y: gTop - 10, textAnchor: 'middle', fill: '#5b93b8', fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.08em' }, 'LVL'));
    // OFF by default on the V2 board (owner, 2026-07-27): SG narrow-range level is a
    // vital-parameter tile in the top strip now, so the strip beside the vessel was a
    // second copy of the same reading crowding the mimic. Kept behind a flag rather than
    // deleted — the vessel cutaway shows WIDE range, so the narrow-range gauge is the only
    // place the trip/alarm zones are drawn, and a layout that drops the tiles wants it back.
    // markerGroup stays live either way; moving a detached node is harmless.
    if (cfg.showGauge !== true) gEls = [];

    // ---- root svg (tight, controls-hidden viewBox crop) ----
    var svg = h('svg', {
      viewBox: '69 20 244 535', preserveAspectRatio: 'xMidYMid meet',
      style: { width: '100%', height: '100%', overflow: 'visible', display: 'block' }
    },
      defs,
      h('path', { d: outer, fill: 'url(#' + ids.steel + ')', stroke: '#46596a', strokeWidth: 2.4 }),
      h('path', { d: inner, fill: '#0b141d', stroke: '#1b2a36', strokeWidth: 1 }),
      h('g', { clipPath: 'url(#' + ids.clip + ')' }, steamRect, waterRect, surfLine),
      [bendY + 18, bendY + 40].map(function (y) {
        return h('rect', { x: 146, y: y - 3, width: 128, height: 6, fill: '#1c2830', opacity: 0.85 });
      }),
      h('rect', { x: 138, y: bundleTopY, width: 144, height: bundleBoxH, rx: 48, fill: 'none', stroke: '#2c3d47', strokeWidth: 1.4, opacity: 0.7 }),
      glowRect,
      // the tube sheet spans wall to wall (inner shell 123..297) — at 131..289 it left an
      // ~8 px water-painted gap each side and "looked like water can pass by it" (#509 item 8)
      h('rect', { x: 123, y: tubeSheetY, width: 174, height: 10, rx: 2, fill: '#2b3d4a' }),
      h('g', { clipPath: 'url(#' + ids.clip + ')' },
        hotcRect, coldcRect,
        h('rect', { x: cx - 2, y: tubeSheetY + 10, width: 4, height: 90, fill: '#0e1620' })),
      tubeGroups,
      // TWO clips, and both are needed. The inner one (`waterclip`, on bubbleGroup itself)
      // is the water body and now ends at the surface; this outer one is the vessel's inner
      // shell — nested clipPaths INTERSECT, so a bubble is drawn only where the water and
      // the shell agree. Without the shell clip, a high level puts the water surface at
      // fullY(100) = 48, well above the dome springline at y≈111, and circles would paint
      // outside the vessel. The water and steam bodies at :217 have always been shell-
      // clipped; the bubble field was the one thing in the boiler that was not.
      h('g', { clipPath: 'url(#' + ids.clip + ')' }, bubbleGroup),
      h('circle', { cx: 310, cy: 269, r: 0.75, fill: 'none', 'data-port': 'fw-in', 'data-fluid': 'coolWater', 'data-dir': 'right', 'data-size': 'medium', 'data-out': '0' }),
      h('rect', { x: 180, y: 55, width: 60, height: 30, rx: 6, fill: '#20303a', stroke: '#425863', strokeWidth: 1 }),
      h('circle', { cx: 210, cy: 55, r: 0.75, fill: 'none', 'data-port': 'steam-out', 'data-fluid': 'steam', 'data-dir': 'up', 'data-size': 'medium', 'data-out': '1' }),
      hotNoz,
      h('circle', { cx: 107, cy: 495, r: 0.75, fill: 'none', 'data-port': 'hot-in', 'data-fluid': 'hotLeg', 'data-dir': 'left', 'data-size': 'large', 'data-out': '0' }),
      coldNoz,
      h('circle', { cx: 257, cy: 543, r: 0.75, fill: 'none', 'data-port': 'cold-out', 'data-fluid': 'coldLeg', 'data-dir': 'down', 'data-size': 'large', 'data-out': '1' }),
      connsGroup,
      h('g', null, gEls));

    var unwatch = StdPipe.watchScale(svg, function (s) {
      if (!lastS || Math.abs(s - lastS) / s > 0.015) { lastS = s; rebuildConns(); }
    });

    // Re-aim the EXISTING bubbles at a moved water surface without rebuilding them.
    // A CSS custom property write does not restart an animation; replacing the element
    // does. Each circle's `cy` is its fixed birth point, so the new travel is the same
    // cy − levelY the rebuild computes. This is what keeps the LEVEL out of the rebuild
    // key below — an SG whose level is moving would otherwise pop continuously.
    function retargetBubbles(levelY) {
      for (var n = bubbleGroup.firstChild; n; n = n.nextSibling) {
        if (n.nodeType !== 1) continue;
        var rise = Math.max(4, (+n.getAttribute('cy')) - levelY);
        n.style.setProperty('--sg-rise', rise.toFixed(1) + 'px');
      }
    }

    function rebuildBubbles(sgBoil, levelY) {
      // POOLED, not torn down (2026-08-06). This used to clearEl() and re-append every
      // circle, which is a teardown of ~44 animated elements — and the owner reports the
      // flicker as a brief BLANK, which is what a teardown looks like if the compositor
      // presents a frame mid-rebuild (ui/app.js's rAF note documents that happening on
      // real GPUs while headless looks fine). MEASURED: 733 childList mutations per 10 s
      // of transient, the largest single source left on the board.
      //
      // Reusing the circles removes the empty intermediate state entirely AND stops the
      // animation restarting, because a surviving element keeps its running animation —
      // only the delta in COUNT touches the DOM at all. Same idiom as
      // comp_indicator_panel's poolAt/poolTrim.
      var want = sgBoil <= 0.02 ? 0 : Math.round(4 + sgBoil * 40);
      // WHERE BUBBLES ARE BORN is not WHERE THEY GO, and conflating the two is the bug this
      // replaced. Steam is generated on the tube bundle, so the birth zone is the bundle —
      // or the water surface instead, once the level has fallen BELOW the bundle top, since
      // nothing boils where there is no water. In SVG coords a larger y is LOWER on screen,
      // so `Math.max` of two y values is the lower of the two, and max(bendY, levelY) is
      // exactly that rule. It is correct here and was wrong as the travel target below.
      var birthTop = Math.max(bendY, levelY);
      var kids = bubbleGroup.childNodes;
      for (var i = 0; i < want; i++) {
        var x = 132 + ((i * 37 + (i % 5) * 13) % 156);
        var startY = waterBot - ((i * 43) % Math.max(1, (waterBot - birthTop)));
        // Travel to the WATER SURFACE and fade there (the keyframe ends at opacity 0), which
        // is what the owner asked for: up the column, never on into the steam space.
        //
        // This used to target `birthTop`, described in a comment as "the water line clamped
        // to the top of the bundle" — but max() picks the LOWER point, so above ~14 % wide it
        // returned bendY (380.9) and never the water line at all. Measured at a normal 59 %
        // level, levelY is 206.7: bubbles lived in a 54 px strip at the bottom of a 387 px
        // column and stopped dead 174 px short of the surface. #350 item 24 had already
        // fixed the older fixed-distance version; this is the clamp it left behind.
        var rise = Math.max(4, startY - levelY);
        var dur = (2.4 - sgBoil * 1.2 + (i % 4) * 0.3).toFixed(2);
        var delay = (i * 0.21).toFixed(2);
        var r = (1 + (i % 3) * 0.45 + sgBoil * 2.6).toFixed(2);
        var op = Math.min(0.9, 0.12 + sgBoil * 2);
        var el = kids[i];
        if (!el) {
          el = h('circle', { fill: '#bdf1ff',
            style: { transformBox: 'fill-box', transformOrigin: 'center' } });
          bubbleGroup.appendChild(el);
        }
        if (el.getAttribute('cx') !== String(x)) el.setAttribute('cx', x);
        if (el.getAttribute('cy') !== String(startY)) el.setAttribute('cy', startY);
        if (el.getAttribute('r') !== r) el.setAttribute('r', r);
        if (el.getAttribute('opacity') !== String(op)) el.setAttribute('opacity', op);
        // The animation is set ONCE per element. Re-assigning the shorthand or the delay
        // restarts it, which is the whole thing this is avoiding — a reused circle keeps
        // the flight it was already on, and `dur` only re-times it.
        if (!el.__anim) {
          el.style.animation = 'sgBubbleRise ' + dur + 's linear infinite';
          el.style.animationDelay = delay + 's';
          el.__anim = true;
        } else if (el.style.animationDuration !== dur + 's') {
          el.style.animationDuration = dur + 's';
        }
        el.style.setProperty('--sg-rise', rise.toFixed(1) + 'px');
      }
      while (bubbleGroup.childNodes.length > want) bubbleGroup.removeChild(bubbleGroup.lastChild);
    }

    // ---- update: cache last-applied values, only touch DOM on change ----
    var last = {};
    function update(props) {
      props = props || {};
      var power = clampN(num(props.power, 100), 0, 150);
      // level = WIDE range (whole-vessel water column). narrowLevel = the working range
      // shown on the LVL gauge; defaults to the wide value if not supplied separately.
      var level = clampN(num(props.level, 59), 0, 100);
      var narrowLevel = clampN(num(props.narrowLevel, 62), 0, 100);
      var boil = clampN(num(props.boil, 55), 0, 100);
      var temp = num(props.temp, 285);
      // primary-side leg temperatures for the U-tubes + channel-head reservoirs
      var thot = num(props.thot, 320), tcold = num(props.tcold, 290);
      var showFlow = props.showFlow !== false;
      var glowOn = props.glow !== false;

      if (temp !== last.temp) {
        // secondary fluid color follows the same global temperature ramp as the pipes
        var waterC = StdPipe.phaseTempColor('water', temp);
        var steamC = StdPipe.phaseTempColor('steam', temp);
        // #350 item 20 inverted the kit: `bore` is now the fluid colour at full strength
        // and `flow` is the darker dash. These stops are a WATER/STEAM BODY shaded with
        // depth, so they take bore at the surface and flow below — which reproduces the
        // shading this component has always had, rather than turning it upside down.
        waterStops[0].setAttribute('stop-color', waterC.bore);
        waterStops[1].setAttribute('stop-color', waterC.flow);
        steamStops[0].setAttribute('stop-color', steamC.bore);
        steamStops[1].setAttribute('stop-color', steamC.flow);
        last.temp = temp;
      }

      var p = power / 100;
      // U-tubes + the hot/cold channel-head reservoirs carry PRIMARY coolant, so they take
      // the leg temperatures (hot-leg side / cold-leg side) on the same ramp as the pipes —
      // not power. The tube-bundle thermal glow stays power-gated (heat transferred).
      if (thot !== last.thot || tcold !== last.tcold) {
        var hotFl = StdPipe.phaseTempColor('water', thot);
        var coldFl = StdPipe.phaseTempColor('water', tcold);
        var midFl = StdPipe.phaseTempColor('water', (thot + tcold) / 2);
        var hotC = hotFl.bore, coldC = coldFl.bore;
        tubeStops[0].setAttribute('stop-color', hotC);          // body, hot-leg side
        tubeStops[1].setAttribute('stop-color', midFl.bore);    // body, mid-tube
        tubeStops[2].setAttribute('stop-color', coldC);         // body, cold-leg side
        tubeDashStops[0].setAttribute('stop-color', hotFl.flow);   // dash, hot-leg side
        tubeDashStops[1].setAttribute('stop-color', midFl.flow);   // dash, mid-tube
        tubeDashStops[2].setAttribute('stop-color', coldFl.flow);  // dash, cold-leg side
        hotcRect.setAttribute('fill', hotC);
        coldcRect.setAttribute('fill', coldC);
        hotNoz.setAttribute('fill', hotC);
        coldNoz.setAttribute('fill', coldC);
        glowRect.setAttribute('fill', hotC);
        last.thot = thot; last.tcold = tcold;
      }
      if (power !== last.power || glowOn !== last.glowOn) {
        glowRect.setAttribute('opacity', String(Math.min(0.3, p * 0.22)));
        glowRect.style.display = (glowOn && p > 0.1) ? '' : 'none';
        last.power = power; last.glowOn = glowOn;
      }

      // Vessel water surface = WIDE range over the full column. The narrow gauge marker =
      // NARROW range mapped through the same window (pctY), so at steady state it sits on
      // the surface; in a transient the faster narrow reading leads it slightly (realistic).
      var levelY = fullY(level);
      if (level !== last.level) {
        steamRect.setAttribute('height', String(Math.max(0, levelY - 20)));
        waterRect.setAttribute('y', String(levelY));
        // the water body ends AT the tube sheet — the old +40 slab painted water past the
        // sheet into the channel-head side gaps (#509 item 8)
        waterRect.setAttribute('height', String(Math.max(0, tubeSheetY - levelY)));
        surfLine.style.transform = 'translate(0px,' + levelY.toFixed(2) + 'px)';
        steamGrad.setAttribute('y1', String(levelY));
        // The bubble clip is the WATER, so it ends at the water surface — same correction as
        // the rise target in rebuildBubbles(). Clipping to max(bendY, levelY) put a second,
        // independent ceiling at the tube bundle, so even a corrected rise would have been
        // cut off at the bends. Above the surface belongs to the steam space.
        waterClipRect.setAttribute('y', String(levelY));
        waterClipRect.setAttribute('height', String(Math.max(0, waterBot - levelY)));
        last.level = level;
      }
      if (narrowLevel !== last.narrowLevel) {
        markerGroup.style.transform = 'translate(0px,' + pctY(narrowLevel).toFixed(2) + 'px)';
        last.narrowLevel = narrowLevel;
      }

      // THE KEY IS THE BUBBLE POPULATION, NOT ITS AIM (2026-08-06). A rebuild restarts
      // every circle's CSS animation from t=0, so it must be triggered only by what
      // actually changes the set of circles.
      //
      // `boil` quantised to 5, not 1: it is `steam_flow * 85` (pwr_board_wiring.js), an
      // 85x gain on a NOISY normalized instrument, so `Math.round` flipped on sensor noise
      // alone at steady state and swept dozens of integers through any secondary
      // transient. One integer of `boil` is 0.0118 of rated flow — far below what ~44
      // circles can show.
      //
      // The LEVEL term is now only the part of the level that changes the BIRTH zone.
      // Travel is re-aimed in place (retargetBubbles) so it needs no rebuild at all, and
      // birth is `max(bendY, levelY)` — identically bendY while the water is above the
      // tube bundle, which is every normal level. So this term is a constant 0 until the
      // generator drains into the bundle, and only then does it step. Keying on the raw
      // levelY instead (the old `levelY / 3`) rebuilt continuously on any moving level,
      // which is most of a transient.
      var bubbleKey = Math.round(boil / 5) + '|' + Math.round(Math.max(0, levelY - bendY) / 12);
      if (bubbleKey !== last.bubbleKey) {
        rebuildBubbles(boil / 100, levelY);
        last.bubbleKey = bubbleKey;
        last.bubbleSurfY = levelY;
      } else if (levelY !== last.bubbleSurfY) {
        retargetBubbles(levelY);
        last.bubbleSurfY = levelY;
      }

      if (showFlow !== last.showFlow) {
        for (var i = 0; i < flowEls.length; i++) flowEls[i].setAttribute('class', showFlow ? 'flow' : '');
        last.showFlow = showFlow;
      }
    }

    update({});

    return {
      el: svg,
      update: update,
      destroy: function () { if (unwatch) { unwatch(); unwatch = null; } }
    };
  }
})();
