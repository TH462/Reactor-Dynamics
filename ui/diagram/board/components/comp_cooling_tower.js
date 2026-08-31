/* comp_cooling_tower.js — Cooling Tower board component.
 * Ported from inbox/design_import/Cooling Tower.dc.html per PORTING_CONTRACT.md.
 * Used with showControls:false — the HEAT LOAD / COOLING FLOW slider + readout panel is
 * NOT ported; tight viewBox crop '196 6 152 246'. No StdPipe use (matches the source).
 * update({ heatLoad, coolingFlow, showFlow, glow })
 */
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};
  RD.BoardComps = RD.BoardComps || {};
  RD.BoardComps['Cooling Tower'] = { build: build };

  function ensureStyles() {
    if (document.getElementById('bd-coolingtower-styles')) return;
    var s = document.createElement('style');
    s.id = 'bd-coolingtower-styles';
    s.textContent =
      '@keyframes flowmove{to{stroke-dashoffset:-24}}' +
      '.flow{stroke-dasharray:9 15;animation:flowmove 1.1s linear infinite}' +
      '@keyframes raindown{to{stroke-dashoffset:-26}}' +
      '.rain{animation:raindown 1.6s linear infinite}' +
      '@keyframes plumerise{0%{opacity:0;transform:translateY(10px) scale(0.9)}30%{opacity:1}100%{opacity:0;transform:translateY(-18px) scale(1.25)}}';
    (document.head || document.documentElement).appendChild(s);
  }

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mix(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }

  function build(cfg, env) {
    ensureStyles();
    var h = env.h;
    var ids = { shell: env.uid('ctShell'), shellx: env.uid('ctShellX'), water: env.uid('ctWater'), steel: env.uid('ctSteel'), clip: env.uid('ctClip'), glow: env.uid('ctGlow') };
    var COOL = [44, 88, 152], HOT = [176, 56, 34];

    // ---- compact hyperbolic profile (verbatim geometry) ----
    var cx = 272, yTop = 70, yWaist = 129, yBase = 199;
    function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
    function hwAt(y) {
      if (y <= yWaist) { var t = (y - yTop) / (yWaist - yTop); return 35 + (24 - 35) * smooth(t); }
      var t2 = (y - yWaist) / (yBase - yWaist); return 24 + (56 - 24) * smooth(t2);
    }
    var leftPts = [], rightPts = [], y;
    for (y = yTop; y <= yBase; y += 4) { leftPts.push([cx - hwAt(y), y]); rightPts.push([cx + hwAt(y), y]); }
    var shellPts = leftPts.concat(rightPts.reverse()).map(function (p) { return p.map(function (n) { return n.toFixed(1); }).join(','); }).join(' ');

    // ---- dynamic refs ----
    var waterTopStop = h('stop', { offset: '0' }), waterBotStop = h('stop', { offset: '1' });
    var defs = h('defs', null,
      h('linearGradient', { id: ids.shell, x1: '0', y1: '0', x2: '0', y2: '1' },
        h('stop', { offset: '0', stopColor: '#485763' }), h('stop', { offset: '0.12', stopColor: '#3a4855' }), h('stop', { offset: '1', stopColor: '#1c262e' })),
      h('linearGradient', { id: ids.shellx, x1: '0', y1: '0', x2: '1', y2: '0' },
        h('stop', { offset: '0', stopColor: '#000', stopOpacity: '0.35' }), h('stop', { offset: '0.4', stopColor: '#fff', stopOpacity: '0.10' }),
        h('stop', { offset: '0.62', stopColor: '#fff', stopOpacity: '0.03' }), h('stop', { offset: '1', stopColor: '#000', stopOpacity: '0.38' })),
      h('linearGradient', { id: ids.water, x1: '0', y1: '0', x2: '0', y2: '1' }, waterTopStop, waterBotStop),
      h('linearGradient', { id: ids.steel, x1: '0', y1: '0', x2: '0', y2: '1' },
        h('stop', { offset: '0', stopColor: '#3a4c58' }), h('stop', { offset: '1', stopColor: '#0c141c' })),
      h('clipPath', { id: ids.clip }, h('polygon', { points: shellPts })),
      h('filter', { id: ids.glow, x: '-80%', y: '-80%', width: '260%', height: '260%' }, h('feGaussianBlur', { stdDeviation: '4' })));

    // plume puffs (fixed geometry, CSS-animated; group toggles with evap)
    var puffs = [[cx - 10, 54, 13], [cx + 9, 46, 15], [cx, 38, 18], [cx - 7, 28, 17], [cx + 8, 26, 15]];
    var plumeGroup = h('g', { style: { display: 'none' } }, puffs.map(function (p, i) {
      return h('ellipse', { cx: p[0], cy: p[1], rx: p[2], ry: p[2] * 0.72, fill: '#cfe0ea', filter: 'url(#' + ids.glow + ')',
        style: { opacity: 0.2, animation: 'plumerise ' + (3.4 + i * 0.5).toFixed(1) + 's ease-in-out ' + (i * 0.6).toFixed(1) + 's infinite', transformBox: 'fill-box', transformOrigin: 'center' } });
    }));

    var shellGlow = h('polygon', { points: shellPts, fill: HOT, opacity: 0, filter: 'url(#' + ids.glow + ')', style: { display: 'none' } });
    var shell = h('polygon', { points: shellPts, fill: 'url(#' + ids.shell + ')', stroke: '#5a6d7c', strokeWidth: 1.6, strokeLinejoin: 'round' });

    // structural ribs (static)
    var ribs = [];
    [-0.72, -0.4, 0.4, 0.72].forEach(function (f) {
      var pl = [];
      for (y = yTop + 2; y <= yBase - 2; y += 4) pl.push((cx + f * hwAt(y)).toFixed(1) + ',' + y);
      ribs.push(h('polyline', { points: pl.join(' '), fill: 'none', stroke: '#0f181f', strokeWidth: 0.8, opacity: 0.35 }));
    });
    for (y = yTop + 16; y < yBase; y += 18) {
      var w = hwAt(y);
      ribs.push(h('line', { x1: cx - w, y1: y, x2: cx + w, y2: y, stroke: '#0f181f', strokeWidth: 0.8, opacity: 0.28 }));
    }

    // interior
    var headerY = 95, headerHalf = hwAt(headerY) - 5, basinWaterTop = 182;
    var haze = h('polygon', { points: shellPts, fill: HOT, opacity: 0.06 });
    var fillLines = [];
    for (y = 122; y <= 168; y += 5) { var fw = hwAt(y) - 3; fillLines.push(h('line', { x1: cx - fw, y1: y, x2: cx + fw, y2: y, stroke: '#5b6f7d', strokeWidth: 1.4, opacity: 0.32 })); }
    var rainLines = [];
    [-0.62, -0.38, -0.15, 0.12, 0.36, 0.6].forEach(function (f) {
      var x = cx + f * 21;
      rainLines.push(h('line', { x1: x, y1: headerY + 5, x2: x, y2: basinWaterTop - 2, stroke: '#bdf1ff', strokeWidth: 1.6, strokeLinecap: 'round', strokeDasharray: '4 10', opacity: 0.4 }));
    });
    var header = h('rect', { x: cx - headerHalf, y: headerY, width: headerHalf * 2, height: 6, rx: 2, fill: 'url(#' + ids.steel + ')', stroke: '#223543', strokeWidth: 0.8 });
    var nozzles = [];
    for (var nx = cx - headerHalf + 6; nx <= cx + headerHalf - 4; nx += 9) nozzles.push(h('polygon', { points: nx + ',' + (headerY + 6) + ' ' + (nx - 2) + ',' + (headerY + 10) + ' ' + (nx + 2) + ',' + (headerY + 10), fill: '#2b3d4a' }));
    var basinW = h('rect', { x: cx - hwAt(basinWaterTop), y: basinWaterTop, width: hwAt(basinWaterTop) * 2, height: yBase - basinWaterTop, fill: 'url(#' + ids.water + ')', opacity: 0.85 });
    var basinSurf = h('line', { x1: cx - hwAt(basinWaterTop), y1: basinWaterTop, x2: cx + hwAt(basinWaterTop), y2: basinWaterTop, stroke: '#bdf1ff', strokeWidth: 1.4, opacity: 0.45, strokeDasharray: '12 8' });
    var innerGroup = h('g', { clipPath: 'url(#' + ids.clip + ')' }, haze, fillLines, rainLines, header, nozzles, basinW, basinSurf);

    // basin trough (static)
    var btX = cx - 62, btW = 124;
    var trough = h('path', { d: 'M' + btX + ',' + (yBase - 3) + ' L' + (btX - 4) + ',' + (yBase + 16) + ' L' + (btX + btW + 4) + ',' + (yBase + 16) + ' L' + (btX + btW) + ',' + (yBase - 3) + ' Z', fill: 'url(#' + ids.steel + ')', stroke: '#46596a', strokeWidth: 1.6 });
    var troughW = h('rect', { x: btX + 2, y: yBase + 1, width: btW - 4, height: 10, fill: 'url(#' + ids.water + ')', opacity: 0.8 });

    var svg = h('svg', {
      viewBox: '196 6 152 246', preserveAspectRatio: 'xMidYMid meet',
      style: { width: '100%', height: '100%', overflow: 'visible', display: 'block' }
    },
      defs, plumeGroup, shellGlow, shell,
      h('g', { clipPath: 'url(#' + ids.clip + ')' }, ribs),
      h('polygon', { points: shellPts, fill: 'url(#' + ids.shellx + ')', clipPath: 'url(#' + ids.clip + ')' }),
      innerGroup,
      h('ellipse', { cx: cx, cy: yTop, rx: hwAt(yTop), ry: 7, fill: '#0b141d', stroke: '#5a6d7c', strokeWidth: 1.6 }),
      h('ellipse', { cx: cx, cy: yTop + 1, rx: hwAt(yTop) - 4, ry: 5, fill: '#060b10', opacity: 0.9 }),
      trough, troughW,
      h('rect', { x: 240, y: 96, width: 12, height: 10, rx: 2, fill: 'url(#' + ids.steel + ')', stroke: '#223543', strokeWidth: 1 }),
      h('circle', { cx: 238, cy: 101, r: 0.75, fill: 'none', 'data-port': 'hot-in', 'data-fluid': 'hotWater', 'data-dir': 'left', 'data-size': 'small', 'data-out': '0' }),
      h('rect', { x: 210, y: 202, width: 12, height: 10, rx: 2, fill: 'url(#' + ids.steel + ')', stroke: '#223543', strokeWidth: 1 }),
      h('circle', { cx: 208, cy: 207, r: 0.75, fill: 'none', 'data-port': 'cold-out', 'data-fluid': 'coldWater', 'data-dir': 'left', 'data-size': 'small', 'data-out': '1' }));

    // ---- update ----
    var last = {};
    function update(props) {
      props = props || {};
      var heatLoad = clampN(num(props.heatLoad, 70), 0, 100);
      var coolingFlow = clampN(num(props.coolingFlow, 80), 0, 100);
      var showFlow = props.showFlow !== false;
      var glowOn = props.glow !== false;
      var loadFrac = heatLoad / 100, coolFrac = coolingFlow / 100, coolOn = coolingFlow > 2;
      var key = heatLoad + '|' + coolingFlow + '|' + showFlow + '|' + glowOn;
      if (key === last.key) return;
      last.key = key;

      var hotColor = mix(COOL, HOT, 0.32 + loadFrac * 0.34);
      var wetBulb = 24, inletTemp = 38 + loadFrac * 12;
      var coolRange = coolOn ? Math.max(2, 5 + coolFrac * 9 - loadFrac * 2) : 0.5;
      var outletTemp = Math.max(wetBulb + 2, inletTemp - coolRange);
      var evap = Math.max(0, Math.min(1, loadFrac * 0.6 + coolFrac * 0.4 - 0.05));

      // Basin/circulating water uses the SAME global water temperature ramp as every other
      // pipe/pool on the board (cool basin water at the outlet temperature); the falling
      // rain is the warmer water entering at the inlet temperature. The plume/haze/glow are
      // heat-rejection vapor, not liquid water, so they keep their own tint.
      var basinC = env.StdPipe.phaseTempColor('water', outletTemp);
      var rainC = env.StdPipe.phaseTempColor('water', inletTemp).bore;
      waterTopStop.setAttribute('stop-color', basinC.bore);
      waterBotStop.setAttribute('stop-color', basinC.flow);

      plumeGroup.style.display = evap > 0.04 ? '' : 'none';
      var puffOpacity = 0.12 + evap * 0.22;
      var kids = plumeGroup.childNodes;
      for (var i = 0; i < kids.length; i++) kids[i].style.opacity = String(puffOpacity);

      shellGlow.setAttribute('fill', hotColor);
      shellGlow.style.display = (glowOn && evap > 0.05) ? '' : 'none';
      shellGlow.setAttribute('opacity', String(0.10 + evap * 0.06));

      haze.setAttribute('fill', hotColor);
      haze.setAttribute('opacity', String(0.05 + evap * 0.05));

      var rainOpacity = coolOn ? (0.22 + coolFrac * 0.5) : 0.08;
      var rainCls = (showFlow && coolOn) ? 'rain' : '';
      for (var j = 0; j < rainLines.length; j++) {
        rainLines[j].setAttribute('opacity', String(rainOpacity));
        rainLines[j].setAttribute('class', rainCls);
        rainLines[j].setAttribute('stroke', rainC);
      }
      basinSurf.setAttribute('class', showFlow ? 'flow' : '');
    }

    update({});

    return { el: svg, update: update };
  }
})();
