/* comp_pressurizer.js — Pressurizer board component.
 * Ported from inbox/design_import/Pressurizer.dc.html per PORTING_CONTRACT.md.
 * Used with showControls:false — the AUTO/ON/OFF heater & spray control cards are NOT
 * ported (dedicated SPRAY / HEATER panels live elsewhere on the board). Vessel art only,
 * fixed viewBox "10 90 220 466".
 *
 * Porting decision: the design derived water level from a `power` prop
 * (level = 58 + (p-1)*10, clamped 20-90). Here level is a DIRECT prop (0-100, the actual
 * pressurizer level %), mapped onto the vessel's FULL internal height — waterTop=106 (inner
 * dome apex) -> 100%, waterBot=541 (inner dish floor) -> 0%. The design mapped it onto the
 * LVL strip's 160..470 span instead, which made the cutaway read as a copy of the gauge
 * rather than as the vessel (issue #192); the strip keeps 160..470 as its own instrument span.
 * update({ level, heaterPower, heaterOn, spray, temp, glow, showFlow })
 */
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};
  RD.BoardComps = RD.BoardComps || {};
  RD.BoardComps['Pressurizer'] = { build: build };

  function ensureStyles() {
    if (document.getElementById('bd-pressurizer-styles')) return;
    var s = document.createElement('style');
    s.id = 'bd-pressurizer-styles';
    s.textContent =
      '@keyframes flowmove{to{stroke-dashoffset:-24}}' +
      '.flow{stroke-dasharray:9 15;animation:flowmove 1.1s linear infinite}' +
      '@keyframes sprayFall{0%{transform:translateY(0);opacity:0}12%{opacity:1}100%{transform:translateY(72px);opacity:0}}' +
      // Per-bubble rise distance *(OWNER DIRECTIVE, 2026-08-04: "Pressurizer bubbles should
      // travel to the top of the water level. (but not into the steam above it)")*, #350
      // item 25. The flat -150 px carried heater bubbles straight up through the water line
      // and into the steam space — the one place in a pressurizer a bubble cannot be, since
      // reaching the surface IS the bubble ceasing to exist. `--pzr-rise` is the distance
      // from that bubble's start to the surface, so they all stop there.
      '@keyframes pzrBubbleRise{0%{transform:translateY(0);opacity:0}12%{opacity:1}88%{opacity:1}100%{transform:translateY(calc(-1 * var(--pzr-rise, 150px)));opacity:0}}';
    (document.head || document.documentElement).appendChild(s);
  }

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clearEl(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function mix(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }

  function build(cfg, env) {
    ensureStyles();
    var h = env.h;
    var StdPipe = env.StdPipe;
    var K = StdPipe.createKit(h);
    var MONO = "'IBM Plex Mono',monospace";

    var ids = {
      steel: env.uid('pzrSteel'), water: env.uid('pzrWater'), steam: env.uid('pzrSteam'),
      heat: env.uid('pzrHeat'), clip: env.uid('pzrClip'), glow: env.uid('pzrGlow')
    };

    // ---- geometry (verbatim from the design source) ----
    var cx = 100;
    var shellTop = 150, domeRy = 55, shellBot = 480, botRy = 70;
    var apex = shellTop - domeRy;
    var outer = 'M40,' + shellTop + ' A60 ' + domeRy + ' 0 0 1 160,' + shellTop +
      ' L160,' + shellBot + ' A60 ' + botRy + ' 0 0 1 40,' + shellBot + ' Z';
    var inner = 'M50,' + (shellTop + 1) + ' A50 ' + (domeRy - 10) + ' 0 0 1 150,' + (shellTop + 1) +
      ' L150,' + (shellBot - 1) + ' A50 ' + (botRy - 8) + ' 0 0 1 50,' + (shellBot - 1) + ' Z';
    // Water band spans the FULL INTERNAL cavity — 100 % is the crown of the inner
    // dome, 0 % the floor of the inner dish (issue #192). These are derived from the
    // `inner` path above, so they track the vessel art if the shell geometry moves.
    // The LVL strip beside the vessel is a separate gauge with its own span (see
    // barTop/barBot below); the two are deliberately NOT the same pixels any more.
    var waterTop = shellTop + 1 - (domeRy - 10);   // 106 — inner dome apex
    var waterBot = shellBot - 1 + (botRy - 8);     // 541 — inner dish floor
    var HBROWN = [61, 38, 22], HORANGE = [255, 138, 58];
    var spx = cx, spyMouth = 147;
    var hwR = 150, hL = 58;
    // Heater bundle sits low in the straight shell. Authored against the design's
    // 470 water floor; kept as absolute pixels so widening the water band (#192)
    // does not drag the heaters down into the bottom dish.
    var heaterBase = 470;
    var hys = [heaterBase - 48, heaterBase - 36, heaterBase - 24, heaterBase - 12];

    // ---- defs (dynamic stops kept as refs) ----
    var waterStops = [h('stop', { offset: '0' }), h('stop', { offset: '1' })];
    var steamStops = [h('stop', { offset: '0' }), h('stop', { offset: '1' })];
    var heatStops = [h('stop', { offset: '0' }), h('stop', { offset: '0.5' }), h('stop', { offset: '1' })];
    var steamGrad = h('linearGradient', { id: ids.steam, gradientUnits: 'userSpaceOnUse', x1: '0', y1: waterTop, x2: '0', y2: 100 }, steamStops);
    var defs = h('defs', null,
      h('linearGradient', { id: ids.steel, x1: '0', y1: '0', x2: '0', y2: '1' },
        h('stop', { offset: '0', stopColor: '#2a3844' }), h('stop', { offset: '1', stopColor: '#0c141c' })),
      h('linearGradient', { id: ids.water, x1: '0', y1: '0', x2: '0', y2: '1' }, waterStops),
      steamGrad,
      h('linearGradient', { id: ids.heat, x1: '0', y1: '0', x2: '1', y2: '0' }, heatStops),
      h('clipPath', { id: ids.clip }, h('path', { d: inner })),
      h('filter', { id: ids.glow, x: '-60%', y: '-60%', width: '220%', height: '220%' }, h('feGaussianBlur', { stdDeviation: '7' })));

    // ---- vessel contents (dynamic) ----
    var steamRect = h('rect', { x: 40, y: 96, width: 120, height: 0, fill: 'url(#' + ids.steam + ')', opacity: 0.5 });
    var waterRect = h('rect', { x: 40, y: waterTop, width: 120, height: 0, fill: 'url(#' + ids.water + ')', opacity: 0.72,
      style: { transition: 'y 0.5s ease, height 0.5s ease' } });
    var surfLine = h('line', { x1: 52, y1: 0, x2: 148, y2: 0, stroke: '#bdf1ff', strokeWidth: 2, opacity: 0.5,
      strokeDasharray: '18 10', style: { transition: 'transform 0.5s ease' } });

    // ---- heater elements ----
    var heatGlow = h('rect', { x: hL - 8, y: hys[0] - 9, width: (hwR - hL) + 14, height: (hys[3] - hys[0]) + 18, rx: 10,
      filter: 'url(#' + ids.glow + ')', style: { display: 'none' } });
    var heaterRods = hys.map(function (yy) {
      return [
        h('rect', { x: hL, y: yy - 2.4, width: hwR - hL, height: 4.8, rx: 2.4, fill: 'url(#' + ids.heat + ')' }),
        h('circle', { cx: hL, cy: yy, r: 3, fill: '#26333d', stroke: '#46596a', strokeWidth: 1 })
      ];
    });
    var heaterBubbles = h('g', { clipPath: 'url(#' + ids.clip + ')' });

    // ---- spray header + nozzle (art is static; drops/fan/glow toggle with spray) ----
    var sprayFan = h('polygon', { points: (spx - 4) + ',' + spyMouth + ' ' + (spx + 4) + ',' + spyMouth + ' ' + (spx + 30) + ',' + (spyMouth + 72) + ' ' + (spx - 30) + ',' + (spyMouth + 72), fill: '#5aa0e6', opacity: 0.1, style: { display: 'none' } });
    var sprayNozGlow = h('circle', { cx: spx, cy: spyMouth - 6, r: 13, fill: '#3d82d8', opacity: 0.3, filter: 'url(#' + ids.glow + ')', style: { display: 'none' } });
    var sprayDrops = h('g', { clipPath: 'url(#' + ids.clip + ')', style: { display: 'none' } });

    // ---- spray pipework (scale-compensated StdPipe, rebuilt on scale / spray change) ----
    var sprayConns = h('g', null);
    var lastS = null, lastSprayOn = null, lastShowFlow = null, lastSprayTemp = null;
    function rebuildSprayPipes(s, sprayOn, showFlow) {
      var kP = 1 / (s || 0.55);
      sprayConns.setAttribute('transform', 'scale(' + kP.toFixed(4) + ')');
      clearEl(sprayConns);
      var flow = showFlow && sprayOn;
      function S(x, y) { return [x * (s || 0.55), y * (s || 0.55)]; }
      // Live spray-water colour (#237, owner: "check the sprayers internal pipe color"):
      // the spray carries COLD-LEG water, so these internal runs take the same live
      // temperature the external spray pipe renders (sprayTemp prop = tcold) instead of
      // the static cold-blue preset — the colour no longer jumps at the vessel boundary.
      var sprayFluid = lastSprayTemp != null ? { phase: 'water', temp: lastSprayTemp } : 'coldLeg';
      sprayConns.appendChild(K.pipe({ d: 4, fluid: sprayFluid, flow: flow, dir: 1, points: [S(34, 124), S(52, 124)] }));
      sprayConns.appendChild(K.pipe({ d: 4, fluid: sprayFluid, flow: flow, dir: 1, points: [S(50, 124), S(140, 124)] }));
      sprayConns.appendChild(K.pipe({ d: 4, fluid: sprayFluid, flow: flow, dir: 1, points: [S(spx, 124), S(spx, 133)] }));
    }
    rebuildSprayPipes(null, false, true);

    // ---- level gauge (LVL bar, red top/bottom zones, marker at level) ----
    // The gauge keeps the design's original 160..470 span — it is an instrument
    // strip, not a cutaway, so it no longer shares pixels with the water band.
    var barX = 21, barW = 9, barTop = 160, barBot = 470, barH = barBot - barTop;
    function wlY(pct) { return barBot - (pct / 100) * barH; }
    var gEls = [h('rect', { x: barX - 2, y: barTop - 2, width: barW + 4, height: barH + 4, rx: 3, fill: '#0b1119', stroke: '#25333e', strokeWidth: 1 })];
    [[0, 12, '#ef4d2e'], [12, 88, '#43d17a'], [88, 100, '#ef4d2e']].forEach(function (z) {
      gEls.push(h('rect', { x: barX, y: wlY(z[1]), width: barW, height: wlY(z[0]) - wlY(z[1]), fill: z[2], opacity: 0.82 }));
    });
    [0, 50, 100].forEach(function (pct) {
      gEls.push(h('line', { x1: barX + barW, y1: wlY(pct), x2: barX + barW + 4, y2: wlY(pct), stroke: '#3b4f5e', strokeWidth: 1 }));
    });
    var wlMarker = h('g', { style: { transition: 'transform 0.5s ease' } },
      h('polygon', { points: (barX - 3) + ',0 ' + (barX - 12) + ',-6 ' + (barX - 12) + ',6', fill: '#eaf4fb', stroke: '#0b1119', strokeWidth: 0.6 }),
      h('line', { x1: barX - 3, y1: 0, x2: barX + barW + 7, y2: 0, stroke: '#eaf4fb', strokeWidth: 1.4, strokeDasharray: '4 3' }));
    gEls.push(wlMarker);
    gEls.push(h('text', { x: barX + barW / 2, y: barTop - 8, textAnchor: 'middle', fill: '#5b93b8', fontSize: 10, fontFamily: MONO, letterSpacing: '0.08em' }, 'LVL'));
    // OFF by default on the V2 board (owner, 2026-07-27) — pressurizer level is a
    // vital-parameter tile in the top strip now, so this strip duplicated it beside the
    // vessel. Behind a flag rather than deleted; wlMarker stays live either way.
    if (cfg.showGauge !== true) gEls = [];

    // ---- ports ----
    var sprayPort = h('circle', { cx: 32, cy: 124, r: 0.75, fill: 'none', 'data-port': 'spray-in', 'data-fluid': 'coldLeg', 'data-dir': 'left', 'data-size': 'small', 'data-out': '0', 'data-active': '0' });

    // ---- root svg (controls hidden) ----
    // The vessel keeps its full size and is translated DOWN (not shrunk) so it sits near
    // the bottom of its panel card (the box behind it extends below the item tile), leaving
    // the authored PORV/relief valves above the dome with a short connecting pipe. Overflow
    // is visible, so the lowered vessel simply extends into the card area below the tile.
    //
    // translateX(6px) — the vessel's AXIS ALIGNMENT (#231). Measured on the V2 board: the
    // three centreline ports (relief-out / pressure-tap / surge, all at viewBox x=100)
    // scanned at world x 1049, while BOTH fittings they join — the surge tee's branch
    // (ims2kt7fu64/c) and the PORV block valve (imrppb3kuav/b) — sit at 1055. The surge
    // line and the PORV tap therefore each ran 6 px out of plumb between two horizontal
    // flange bars, which is the "pressurizer sits a little left" the owner reported.
    // The 6 px is two authored errors compounding: the design's crop puts the vessel axis
    // 10 px LEFT of the tile centre (viewBox spans 10..230, centre 120, vessel cx 100),
    // and the tile itself (left 1005, width 108, centre 1059) sits 4 px RIGHT of the 1055
    // axis its neighbours share. Both are diagram-side, and the board is generated, so the
    // correction lives here as one measured offset in CANVAS px (a CSS transform on the
    // tile's own pixel space, exactly like the translateY above). board_check.html pins the
    // result, so a re-export that moves either tile turns that check red instead of
    // silently restoring the jog — if it does, re-measure, don't just bump this number.
    var svg = h('svg', {
      viewBox: '10 90 220 466', preserveAspectRatio: 'xMidYMid meet',
      style: { width: '100%', height: '100%', overflow: 'visible', display: 'block', transform: 'translate(6px,84px)' }
    },
      defs,
      h('path', { d: outer, fill: 'url(#' + ids.steel + ')', stroke: '#46596a', strokeWidth: 2.4 }),
      h('path', { d: inner, fill: '#0b141d', stroke: '#1b2a36', strokeWidth: 1 }),
      h('g', { clipPath: 'url(#' + ids.clip + ')' }, steamRect, waterRect, surfLine),
      heatGlow,
      h('rect', { x: 146, y: hys[0] - 5, width: 6, height: (hys[3] - hys[0]) + 10, rx: 2, fill: '#26333d', stroke: '#46596a', strokeWidth: 1 }),
      h('g', null, heaterRods),
      heaterBubbles,
      // spray boss / cap / nozzle (static art)
      h('rect', { x: 44, y: 119, width: 9, height: 10, rx: 2, fill: '#39505f', stroke: '#223543', strokeWidth: 1 }),
      h('rect', { x: 136, y: 120, width: 6, height: 8, rx: 2, fill: '#39505f', stroke: '#223543', strokeWidth: 1 }),
      h('polygon', { points: (spx - 8) + ',132 ' + (spx + 8) + ',132 ' + spx + ',' + spyMouth, fill: '#39505f', stroke: '#223543', strokeWidth: 1 }),
      sprayFan, sprayNozGlow, sprayDrops,
      sprayConns,
      // surge nozzle (bottom)
      h('rect', { x: cx - 13, y: shellBot + botRy - 22, width: 26, height: 18, rx: 4, fill: '#2f6bb0', stroke: '#1d3c60', strokeWidth: 1 }),
      // ports
      sprayPort,
      h('circle', { cx: cx, cy: apex, r: 0.75, fill: 'none', 'data-port': 'relief-out', 'data-fluid': 'steam', 'data-dir': 'up', 'data-size': 'small', 'data-out': '1' }),
      h('circle', { cx: cx, cy: shellBot + botRy - 4, r: 0.75, fill: 'none', 'data-port': 'surge', 'data-fluid': 'hotWater', 'data-dir': 'down', 'data-size': 'medium', 'data-out': '0' }),
      h('circle', { cx: cx, cy: 108, r: 0.75, fill: 'none', 'data-port': 'pressure-tap', 'data-fluid': 'steam', 'data-dir': 'right', 'data-size': 'small', 'data-out': '0', 'data-no-stub': '1' }),
      h('g', null, gEls));

    var unwatch = StdPipe.watchScale(svg, function (s) {
      if (!lastS || Math.abs(s - lastS) / s > 0.015) { lastS = s; rebuildSprayPipes(s, !!lastSprayOn, lastShowFlow !== false); }
    });

    function rebuildHeaterBubbles(hFrac, surfY) {
      clearEl(heaterBubbles);
      if (hFrac <= 0.02) return;
      var span = (hwR - hL) - 14;
      var count = Math.round(3 + hFrac * 32);
      for (var i = 0; i < count; i++) {
        var x = hL + 8 + ((i * 19 + (i % 5) * 7) % span);
        var startY = hys[0] - 3 - ((i * 13) % 22);
        var dur = (2.2 - hFrac * 1.3 + (i % 4) * 0.28).toFixed(2);
        var delay = (i * 0.19).toFixed(2);
        var r = (1 + (i % 3) * 0.4 + hFrac * 2.4).toFixed(2);
        // A bubble that starts ABOVE the surface (level below the heaters — the plant is
        // draining) gets no travel at all rather than a negative one.
        var rise = Math.max(0, startY - (surfY == null ? startY - 150 : surfY));
        heaterBubbles.appendChild(h('circle', {
          cx: x, cy: startY, r: r, fill: '#bdf1ff', opacity: Math.min(0.9, 0.12 + hFrac * 2),
          style: { animation: 'pzrBubbleRise ' + dur + 's linear infinite', animationDelay: delay + 's',
                   transformBox: 'fill-box', transformOrigin: 'center', '--pzr-rise': rise.toFixed(1) + 'px' }
        }));
      }
    }

    function rebuildSprayDrops(sprayFrac) {
      clearEl(sprayDrops);
      var N = Math.round(12 + sprayFrac * 18);
      for (var i = 0; i < N; i++) {
        var dx = -26 + (i * (52 / N));
        var delay = (i * 0.055).toFixed(2);
        var dur = (0.5 + (i % 3) * 0.1).toFixed(2);
        var r = 2 + (i % 3) * 0.6;
        sprayDrops.appendChild(h('circle', { cx: spx + dx * 0.75, cy: spyMouth, r: r, fill: '#5aa0e6', opacity: 0.95,
          style: { animation: 'sprayFall ' + dur + 's linear infinite', animationDelay: delay + 's', transformBox: 'fill-box' } }));
      }
    }

    // ---- update ----
    var last = {};
    function update(props) {
      props = props || {};
      var level = clampN(num(props.level, 58), 0, 100);
      var heaterOn = props.heaterOn !== false && props.heaterOn !== undefined ? !!props.heaterOn : (props.heaterOn === undefined ? true : false);
      // treat missing heaterOn as "auto on" so a bare temp/level update still shows heaters
      if (props.heaterOn === undefined) heaterOn = true;
      var heaterPower = heaterOn ? clampN(num(props.heaterPower, 35), 0, 100) : 0;
      var spray = !!props.spray;
      var temp = num(props.temp, 345);
      var glowOn = props.glow !== false;
      var showFlow = props.showFlow !== false;

      if (temp !== last.temp) {
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

      // levelY = the water surface in the vessel (full-cavity span);
      // wlY(level) = the same reading on the LVL strip, which has its own span.
      var levelY = waterBot - (level / 100) * (waterBot - waterTop);
      if (level !== last.level) {
        steamRect.setAttribute('height', String(Math.max(0, levelY - 96)));
        waterRect.setAttribute('y', String(levelY));
        waterRect.setAttribute('height', String(Math.max(0, waterBot + 20 - levelY)));
        surfLine.style.transform = 'translate(0px,' + levelY.toFixed(2) + 'px)';
        steamGrad.setAttribute('y1', String(levelY));
        wlMarker.style.transform = 'translate(0px,' + wlY(level).toFixed(2) + 'px)';
        last.level = level;
      }

      // The bubble field also has to be rebuilt when the LEVEL moves, because the surface is
      // now what sets each bubble's travel. Quantised to ~3 px of surface movement so a
      // steady plant's level noise does not restart the animation every broadcast (#233).
      var surfKey = Math.round(levelY / 3);
      if (heaterPower !== last.heaterPower || glowOn !== last.glowOn || surfKey !== last.surfKey) {
        var hFrac = heaterPower / 100;
        last.surfKey = surfKey;
        heatStops[0].setAttribute('stop-color', mix(HBROWN, HORANGE, hFrac * 0.6));
        heatStops[1].setAttribute('stop-color', mix(HBROWN, HORANGE, hFrac));
        heatStops[2].setAttribute('stop-color', mix(HBROWN, HORANGE, hFrac * 0.6));
        heatGlow.setAttribute('fill', mix(HBROWN, HORANGE, hFrac));
        heatGlow.setAttribute('opacity', String(Math.min(0.42, 0.05 + hFrac * 0.42)));
        heatGlow.style.display = (glowOn && heaterPower > 4) ? '' : 'none';
        rebuildHeaterBubbles(hFrac, levelY);
        last.heaterPower = heaterPower; last.glowOn = glowOn;
      }

      // live spray-water temperature (tcold from the wiring) — repaint the internal
      // spray runs IN PLACE when it moves materially (≥1 °C). A rebuild would restart
      // the dash animation (#233); stroke writes don't. rebuildSprayPipes reads
      // lastSprayTemp itself, so scale/spray rebuilds keep the live colour too.
      var sprayTemp = props.sprayTemp;
      if (sprayTemp != null && isFinite(sprayTemp) && (lastSprayTemp == null || Math.abs(sprayTemp - lastSprayTemp) >= 1)) {
        lastSprayTemp = sprayTemp;
        var sc = StdPipe.phaseTempColor('water', sprayTemp);
        for (var pi = 0; pi < sprayConns.childNodes.length; pi++) {
          var pg = sprayConns.childNodes[pi].childNodes;   // [case, bore, flow?]
          if (pg[1]) pg[1].setAttribute('stroke', sc.bore);
          if (pg[2]) pg[2].setAttribute('stroke', sc.flow);
        }
      }
      if (spray !== last.spray) {
        var sprayFrac = spray ? 1 : 0;
        sprayFan.style.display = spray ? '' : 'none';
        sprayNozGlow.style.display = spray ? '' : 'none';
        sprayDrops.style.display = spray ? '' : 'none';
        if (spray) { sprayFan.setAttribute('opacity', String(0.1 + 0.14 * sprayFrac)); rebuildSprayDrops(sprayFrac); }
        sprayPort.setAttribute('data-active', spray ? '1' : '0');
        lastSprayOn = spray;
        rebuildSprayPipes(lastS, spray, showFlow);
        last.spray = spray;
      }
      if (showFlow !== last.showFlow) {
        lastShowFlow = showFlow;
        rebuildSprayPipes(lastS, !!lastSprayOn, showFlow);
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
