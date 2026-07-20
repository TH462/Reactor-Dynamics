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
      '@keyframes sgBubbleRise{' +
        '0%{transform:translateY(0);opacity:0}' +
        '12%{opacity:1}' +
        '88%{opacity:1}' +
        '100%{transform:translateY(-150px);opacity:0}}';
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
      tube: env.uid('sgTube'), clip: env.uid('sgClip'), waterclip: env.uid('sgWClip'),
      glow: env.uid('sgGlow'), steamblur: env.uid('sgSBlur')
    };

    // ---- geometry (verbatim from the design source) ----
    var cx = 210;
    var shellTop = 110, shellBot = 460, domeRy = 80, botRy = 90;
    var outer = 'M110,' + shellTop + ' A100 ' + domeRy + ' 0 0 1 310,' + shellTop +
      ' L310,' + shellBot + ' A100 ' + botRy + ' 0 0 1 110,' + shellBot + ' Z';
    var inner = 'M123,' + (shellTop + 1) + ' A87 ' + (domeRy - 12) + ' 0 0 1 297,' + (shellTop + 1) +
      ' L297,' + (shellBot - 1) + ' A87 ' + (botRy - 8) + ' 0 0 1 123,' + (shellBot - 1) + ' Z';
    var bendY = 314, legBot = 470, tubeSheetY = 440;
    var waterBot = tubeSheetY - 5;

    function mix(a, b, t) {
      t = Math.max(0, Math.min(1, t));
      return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
        Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
    }
    var COOL = [44, 88, 152], HOT = [176, 56, 34];

    // ---- defs (dynamic stops kept as refs) ----
    var waterStops = [h('stop', { offset: '0' }), h('stop', { offset: '1' })];
    var steamStops = [h('stop', { offset: '0' }), h('stop', { offset: '1' })];
    var tubeStops = [h('stop', { offset: '0' }), h('stop', { offset: '0.5', stopColor: '#7a5a9a' }), h('stop', { offset: '1' })];
    var steamGrad = h('linearGradient', { id: ids.steam, gradientUnits: 'userSpaceOnUse', x1: '0', y1: 195, x2: '0', y2: shellTop }, steamStops);
    var waterClipRect = h('rect', { x: 124, y: bendY, width: 172, height: waterBot - bendY });
    var defs = h('defs', null,
      h('linearGradient', { id: ids.steel, x1: '0', y1: '0', x2: '0', y2: '1' },
        h('stop', { offset: '0', stopColor: '#2a3844' }), h('stop', { offset: '1', stopColor: '#0c141c' })),
      h('linearGradient', { id: ids.water, x1: '0', y1: '0', x2: '0', y2: '1' }, waterStops),
      steamGrad,
      h('linearGradient', { id: ids.tube, x1: '0', y1: '0', x2: '1', y2: '0' }, tubeStops),
      h('clipPath', { id: ids.clip }, h('path', { d: inner })),
      h('clipPath', { id: ids.waterclip }, waterClipRect),
      h('filter', { id: ids.glow, x: '-40%', y: '-40%', width: '180%', height: '180%' }, h('feGaussianBlur', { stdDeviation: '8' })),
      h('filter', { id: ids.steamblur, x: '-60%', y: '-60%', width: '220%', height: '220%' }, h('feGaussianBlur', { stdDeviation: '4' })));

    // ---- shell + secondary side ----
    var steamRect = h('rect', {
      x: 110, y: 20, width: 200, height: 0, fill: 'url(#' + ids.steam + ')', opacity: 0.5,
      style: { transition: 'height 0.5s ease' }
    });
    var waterRect = h('rect', {
      x: 110, y: waterBot, width: 200, height: 40, fill: 'url(#' + ids.water + ')', opacity: 0.72,
      style: { transition: 'y 0.5s ease, height 0.5s ease' }
    });
    var surfLine = h('line', {
      x1: 124, y1: 0, x2: 296, y2: 0, stroke: '#bdf1ff', strokeWidth: 2, opacity: 0.5,
      strokeDasharray: '22 12', style: { transition: 'transform 0.5s ease' }
    });
    var flowEls = [surfLine];

    var glowRect = h('rect', {
      x: 138, y: bendY - 16, width: 144, height: tubeSheetY - (bendY - 16), rx: 48,
      filter: 'url(#' + ids.glow + ')', style: { display: 'none' }
    });
    var hotcRect = h('rect', { x: 110, y: tubeSheetY + 10, width: 100, height: 90, opacity: 0.85 });
    var coldcRect = h('rect', { x: cx, y: tubeSheetY + 10, width: 100, height: 90, opacity: 0.85 });

    var tubeGroups = [14, 26, 38, 50, 62].map(function (g) {
      var d = 'M' + (cx - g) + ',' + legBot + ' L' + (cx - g) + ',' + bendY +
        ' A' + g + ' ' + g + ' 0 0 1 ' + (cx + g) + ',' + bendY + ' L' + (cx + g) + ',' + legBot;
      var flowPath = h('path', { d: d, fill: 'none', stroke: '#eaf4fb', strokeWidth: 1.6, strokeLinecap: 'round', opacity: 0.55, strokeDasharray: '10 16' });
      flowEls.push(flowPath);
      return h('g', null,
        h('path', { d: d, fill: 'none', stroke: 'url(#' + ids.tube + ')', strokeWidth: 4, strokeLinecap: 'round' }),
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
      connsGroup.appendChild(K.flange({ key: 'fwFl', x: 310 * s, y: 245 * s, angle: 0, d: 8 }));
      connsGroup.appendChild(K.flange({ key: 'stFl', x: 210 * s, y: 55 * s, angle: 90, d: 8 }));
    }
    rebuildConns();

    // NARROW-RANGE level gauge — a fixed instrument band (NOT the full vessel height); its
    // top/bottom are the ends of the narrow operating range, not 0/100% of actual water.
    // The engine's sg_level IS this narrow (working) range, so both the marker AND the
    // vessel water surface are driven off pctY() on THIS scale — they line up, and the
    // surface reads against the correct zone. (A true wide-range water column would need a
    // separate engine value; we don't have one, so the visible water tracks the narrow range.)
    // Zones match the PWR SG-level setpoints (pwr_control.js): red = trip (lo-lo 17 % scram /
    // hi 90 % P-14), yellow = alarm (low 30 % / high 75 %), green = normal band.
    var gx = 88, gw = 15, gTop = 100, gBot = 230, gH = gBot - gTop;
    function pctY(pct) { return gBot - (clampN(pct, 0, 100) / 100) * gH; }
    var zones = [[0, 17, '#ef4d2e'], [17, 30, '#f0a53b'], [30, 75, '#43d17a'], [75, 90, '#f0a53b'], [90, 100, '#ef4d2e']];
    var gEls = [h('rect', { x: gx - 2, y: gTop - 2, width: gw + 4, height: gH + 4, rx: 4, fill: '#0b1119', stroke: '#25333e', strokeWidth: 1 })];
    zones.forEach(function (z) {
      gEls.push(h('rect', { x: gx, y: pctY(z[1]), width: gw, height: pctY(z[0]) - pctY(z[1]), fill: z[2], opacity: 0.85 }));
    });
    [0, 25, 50, 75, 100].forEach(function (pct) {
      gEls.push(h('line', { x1: gx + gw, y1: pctY(pct), x2: gx + gw + 4, y2: pctY(pct), stroke: '#3b4f5e', strokeWidth: 1 }));
    });
    var markerGroup = h('g', { style: { transition: 'transform 0.5s ease' } },
      h('polygon', { points: (gx - 2) + ',0 ' + (gx - 9) + ',-5 ' + (gx - 9) + ',5', fill: '#eaf4fb', stroke: '#0b1119', strokeWidth: 0.6 }),
      h('line', { x1: gx, y1: 0, x2: gx + gw, y2: 0, stroke: '#eaf4fb', strokeWidth: 1.6 }));
    gEls.push(markerGroup);
    gEls.push(h('text', { x: gx + gw / 2, y: gTop - 10, textAnchor: 'middle', fill: '#5b93b8', fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.08em' }, 'LVL'));

    // ---- root svg (tight, controls-hidden viewBox crop) ----
    var svg = h('svg', {
      viewBox: '69 20 244 535', preserveAspectRatio: 'xMidYMid meet',
      style: { width: '100%', height: '100%', overflow: 'visible', display: 'block' }
    },
      defs,
      h('path', { d: outer, fill: 'url(#' + ids.steel + ')', stroke: '#46596a', strokeWidth: 2.4 }),
      h('path', { d: inner, fill: '#0b141d', stroke: '#1b2a36', strokeWidth: 1 }),
      h('g', { clipPath: 'url(#' + ids.clip + ')' }, steamRect, waterRect, surfLine),
      [bendY + 40, bendY + 80, bendY + 120].map(function (y) {
        return h('rect', { x: 146, y: y - 3, width: 128, height: 6, fill: '#1c2830', opacity: 0.85 });
      }),
      h('rect', { x: 138, y: bendY - 16, width: 144, height: tubeSheetY - (bendY - 16), rx: 48, fill: 'none', stroke: '#2c3d47', strokeWidth: 1.4, opacity: 0.7 }),
      glowRect,
      h('rect', { x: 131, y: tubeSheetY, width: 158, height: 10, rx: 2, fill: '#2b3d4a' }),
      h('g', { clipPath: 'url(#' + ids.clip + ')' },
        hotcRect, coldcRect,
        h('rect', { x: cx - 2, y: tubeSheetY + 10, width: 4, height: 90, fill: '#0e1620' })),
      tubeGroups,
      bubbleGroup,
      h('circle', { cx: 310, cy: 245, r: 0.75, fill: 'none', 'data-port': 'fw-in', 'data-fluid': 'coolWater', 'data-dir': 'right', 'data-size': 'medium', 'data-out': '0' }),
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

    function rebuildBubbles(sgBoil, levelY) {
      clearEl(bubbleGroup);
      if (sgBoil <= 0.02) return;
      var bubbleCount = Math.round(4 + sgBoil * 40);
      var submergedTop = Math.max(bendY, levelY);
      for (var i = 0; i < bubbleCount; i++) {
        var x = 132 + ((i * 37 + (i % 5) * 13) % 156);
        var startY = waterBot - ((i * 43) % Math.max(1, (waterBot - submergedTop)));
        var dur = (2.4 - sgBoil * 1.2 + (i % 4) * 0.3).toFixed(2);
        var delay = (i * 0.21).toFixed(2);
        var r = (1 + (i % 3) * 0.45 + sgBoil * 2.6).toFixed(2);
        bubbleGroup.appendChild(h('circle', {
          cx: x, cy: startY, r: r, fill: '#bdf1ff', opacity: Math.min(0.9, 0.12 + sgBoil * 2),
          style: { animation: 'sgBubbleRise ' + dur + 's linear infinite', animationDelay: delay + 's', transformBox: 'fill-box', transformOrigin: 'center' }
        }));
      }
    }

    // ---- update: cache last-applied values, only touch DOM on change ----
    var last = {};
    function update(props) {
      props = props || {};
      var power = clampN(num(props.power, 100), 0, 150);
      var level = clampN(num(props.level, 62), 0, 100);
      var boil = clampN(num(props.boil, 55), 0, 100);
      var temp = num(props.temp, 285);
      var showFlow = props.showFlow !== false;
      var glowOn = props.glow !== false;

      if (temp !== last.temp) {
        // secondary fluid color follows the same global temperature ramp as the pipes
        var waterC = StdPipe.phaseTempColor('water', temp);
        var steamC = StdPipe.phaseTempColor('steam', temp);
        waterStops[0].setAttribute('stop-color', waterC.flow);
        waterStops[1].setAttribute('stop-color', waterC.bore);
        steamStops[0].setAttribute('stop-color', steamC.flow);
        steamStops[1].setAttribute('stop-color', steamC.bore);
        last.temp = temp;
      }

      var p = power / 100;
      if (power !== last.power || glowOn !== last.glowOn) {
        var tubeHot = mix(COOL, HOT, p * 1.05);
        var tubeCold = mix(COOL, HOT, p * 0.18);
        tubeStops[0].setAttribute('stop-color', tubeHot);
        tubeStops[2].setAttribute('stop-color', tubeCold);
        hotcRect.setAttribute('fill', tubeHot);
        coldcRect.setAttribute('fill', tubeCold);
        hotNoz.setAttribute('fill', tubeHot);
        coldNoz.setAttribute('fill', tubeCold);
        glowRect.setAttribute('fill', tubeHot);
        glowRect.setAttribute('opacity', String(Math.min(0.3, p * 0.22)));
        glowRect.style.display = (glowOn && p > 0.1) ? '' : 'none';
        last.power = power; last.glowOn = glowOn;
      }

      // Water surface tracks the narrow (working) range on the gauge's own scale, so the
      // surface in the vessel image lines up exactly with the gauge marker and both read
      // against the correct alarm/trip zone.
      var levelY = pctY(level);
      if (level !== last.level) {
        steamRect.setAttribute('height', String(Math.max(0, levelY - 20)));
        waterRect.setAttribute('y', String(levelY));
        waterRect.setAttribute('height', String(Math.max(0, waterBot + 40 - levelY)));
        surfLine.style.transform = 'translate(0px,' + levelY.toFixed(2) + 'px)';
        steamGrad.setAttribute('y1', String(levelY));
        var clipTop = Math.max(bendY, levelY);
        waterClipRect.setAttribute('y', String(clipTop));
        waterClipRect.setAttribute('height', String(Math.max(0, waterBot - clipTop)));
        markerGroup.style.transform = 'translate(0px,' + levelY.toFixed(2) + 'px)';
        last.level = level;
      }

      var bubbleKey = Math.round(boil) + '|' + Math.round(levelY / 3);
      if (bubbleKey !== last.bubbleKey) {
        rebuildBubbles(boil / 100, levelY);
        last.bubbleKey = bubbleKey;
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
