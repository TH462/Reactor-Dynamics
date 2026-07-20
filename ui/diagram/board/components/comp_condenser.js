/* comp_condenser.js — ported from inbox/design_import/Condenser.dc.html
 *
 * update({ steamLoad, hotwellLevel, coolingFlow, temp, vacuumInHg, hotwellTempC })
 *   steamLoad / hotwellLevel / coolingFlow: 0..100, temp: deg C (design props).
 *   vacuumInHg / hotwellTempC: optional overrides for the internal computed readouts —
 *   if provided they are displayed instead of the computed values (the sim has a real
 *   vacuum instrument). Readouts live on the control panel, which is only drawn when
 *   cfg.showControls is true (the board uses showControls:false); sliders emit
 *   env.onControl('steamLoad'|'hotwellLevel'|'coolingFlow', value).
 */
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};
  RD.BoardComps = RD.BoardComps || {};
  RD.BoardComps['Condenser'] = { build: build };

  function ensureStyles() {
    if (document.getElementById('bd-condenser-styles')) return;
    var s = document.createElement('style');
    s.id = 'bd-condenser-styles';
    s.textContent =
      '@keyframes flowmove{to{stroke-dashoffset:-24}}' +
      '.flow{stroke-dasharray:9 15;animation:flowmove 1.1s linear infinite}';
    (document.head || document.documentElement).appendChild(s);
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function num(v, d) { return v == null || isNaN(v) ? d : +v; }

  function build(cfg, env) {
    ensureStyles();
    var h = env.h;
    var gid = env.uid('cd');
    var K = env.StdPipe.createKit(h);
    var flowOn = true, glowOn = true;
    var showControls = !!cfg.showControls;

    var mix = function (a, b, t) { t = clamp(t, 0, 1); return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')'; };
    var COOL = [44, 88, 152], HOT = [176, 56, 34];
    var steamColor = '#bcd7e6';
    var coolSupplyColor = mix(COOL, HOT, 0.04);
    var CYAN = '#4fe3ff';

    // hotwell (the sump below the tube bundle); shell / u-tube geometry verbatim
    var shellL = 230, shellR = 530, shellTop = 185, shellBot = 362;
    var innerL = shellL + 13, innerR = shellR - 13, innerTop = shellTop + 13, innerBot = shellBot - 13;
    var waterTop = 204, waterBot = 354;
    var cy = 262, bendX = 304, rightX = 479;
    var radii = [15, 26, 37];

    // dynamic element refs
    var waterStops = [], steamStops = [], steamGradEl, tubeStops = [];
    var shellGlowEl, steamRect, waterRect, surfLine, outcRect, incRect;
    var tubeFlowEls = [];
    var panelG = null, slInputs = {}, slVals = {}, roVals = {};

    var C = [];
    C.push(h('defs', { key: 'defs' }, [
      h('linearGradient', { key: 'steel', id: gid + 'SteelGrad', x1: '0', y1: '0', x2: '0', y2: '1' }, [
        h('stop', { key: 0, offset: '0', stopColor: '#2a3844' }), h('stop', { key: 1, offset: '1', stopColor: '#0c141c' })]),
      h('linearGradient', { key: 'water', id: gid + 'WaterGrad', x1: '0', y1: '0', x2: '0', y2: '1' }, [
        h('stop', { key: 0, offset: '0', ref: function (el) { waterStops[0] = el; } }),
        h('stop', { key: 1, offset: '1', ref: function (el) { waterStops[1] = el; } })]),
      steamGradEl = h('linearGradient', { key: 'steam', id: gid + 'SteamGrad', gradientUnits: 'userSpaceOnUse', x1: '0', y1: waterBot, x2: '0', y2: innerTop }, [
        h('stop', { key: 0, offset: '0', ref: function (el) { steamStops[0] = el; } }),
        h('stop', { key: 1, offset: '1', ref: function (el) { steamStops[1] = el; } })]),
      h('linearGradient', { key: 'tube', id: gid + 'TubeGrad', x1: '0', y1: '0', x2: '1', y2: '0' }, [
        h('stop', { key: 0, offset: '0', stopColor: '#1a3f72', ref: function (el) { tubeStops[0] = el; } }),
        h('stop', { key: 1, offset: '0.5', stopColor: '#4a90d9', ref: function (el) { tubeStops[1] = el; } }),
        h('stop', { key: 2, offset: '1', stopColor: '#1a3f72', ref: function (el) { tubeStops[2] = el; } })]),
      h('clipPath', { key: 'clip', id: gid + 'InnerClip' }, [h('rect', { key: 0, x: innerL, y: innerTop, width: innerR - innerL, height: innerBot - innerTop, rx: 6 })]),
      h('filter', { key: 'glow', id: gid + 'Glow', x: '-60%', y: '-60%', width: '220%', height: '220%' }, [h('feGaussianBlur', { key: 0, stdDeviation: '9' })])
    ]));

    // shell
    shellGlowEl = h('rect', { key: 'shellGlow', x: shellL - 10, y: shellTop - 10, width: shellR - shellL + 20, height: shellBot - shellTop + 20, rx: 16, fill: steamColor, opacity: 0.14, filter: 'url(#' + gid + 'Glow)', style: { display: 'none' } });
    C.push(shellGlowEl);
    C.push(h('rect', { key: 'outer', x: shellL, y: shellTop, width: shellR - shellL, height: shellBot - shellTop, rx: 12, fill: 'url(#' + gid + 'SteelGrad)', stroke: '#46596a', strokeWidth: 2.4 }));
    C.push(h('rect', { key: 'inner', x: innerL, y: innerTop, width: innerR - innerL, height: innerBot - innerTop, rx: 6, fill: '#0b141d', stroke: '#1b2a36', strokeWidth: 1 }));

    steamRect = h('rect', { key: 'steam', x: innerL, y: innerTop, width: innerR - innerL, height: 0, fill: 'url(#' + gid + 'SteamGrad)', opacity: 0.45 });
    waterRect = h('rect', { key: 'water', x: innerL, y: waterBot, width: innerR - innerL, height: 0, fill: 'url(#' + gid + 'WaterGrad)', opacity: 0.72 });
    surfLine = h('line', { key: 'surf', x1: innerL, y1: waterBot, x2: innerR, y2: waterBot, stroke: '#bdf1ff', strokeWidth: 2, opacity: 0.5, className: flowOn ? 'flow' : null, strokeDasharray: '22 12' });
    C.push(h('g', { key: 'contents', clipPath: 'url(#' + gid + 'InnerClip)' }, [steamRect, waterRect, surfLine]));

    // tube bundle — cooling water makes a single U-pass: in the bottom legs, around the
    // bend on the left, back out the top legs
    radii.forEach(function (g, i) {
      var d = 'M' + rightX + ',' + (cy - g) + ' L' + bendX + ',' + (cy - g) + ' A' + g + ' ' + g + ' 0 0 0 ' + bendX + ',' + (cy + g) + ' L' + rightX + ',' + (cy + g);
      C.push(h('path', { key: 'tube' + i, d: d, fill: 'none', stroke: 'url(#' + gid + 'TubeGrad)', strokeWidth: 6, strokeLinecap: 'round' }));
      var f = h('path', { key: 'tubeFlow' + i, d: d, fill: 'none', stroke: '#bdf1ff', strokeWidth: 2, strokeLinecap: 'round', opacity: 0.6, strokeDasharray: '10 16', style: { animationDirection: 'reverse' } });
      tubeFlowEls.push(f);
      C.push(f);
    });
    // tube sheet + supply/return chambers
    C.push(h('rect', { key: 'sheet', x: rightX, y: cy - 43, width: 6, height: 86, rx: 2, fill: '#2b3d4a' }));
    outcRect = h('rect', { key: 'outc', x: rightX + 6, y: cy - 43, width: 32, height: 43, fill: mix(COOL, HOT, 0.1), opacity: 0.85 });
    incRect = h('rect', { key: 'inc', x: rightX + 6, y: cy, width: 32, height: 43, fill: coolSupplyColor, opacity: 0.85 });
    C.push(h('g', { key: 'chambers', clipPath: 'url(#' + gid + 'InnerClip)' }, [
      outcRect,
      incRect,
      h('rect', { key: 'divider', x: rightX + 6, y: cy - 2, width: 32, height: 4, fill: '#0e1620' })
    ]));

    // ---- standardized connection stubs + port markers ----
    // Bare mating flanges at each nozzle, in a scale(1/s) group with coords pre-multiplied
    // by s so they render at constant canvas-px size no matter how the tile is resized.
    var connWrap = h('g', { key: 'stdConns' });
    C.push(connWrap);
    function renderConns(s) {
      while (connWrap.firstChild) connWrap.removeChild(connWrap.firstChild);
      var kP = 1 / s;
      connWrap.appendChild(h('g', { transform: 'scale(' + kP.toFixed(4) + ')' }, [
        K.flange({ key: 'stFl', x: 506 * s, y: shellTop * s, angle: 90, d: 8 }),
        K.flange({ key: 'st2Fl', x: 254 * s, y: shellTop * s, angle: 90, d: 8 }),
        K.flange({ key: 'bpFl', x: shellL * s, y: 229 * s, angle: 0, d: 8 }),
        K.flange({ key: 'retFl', x: shellR * s, y: (cy - 23) * s, angle: 0, d: 4 }),
        K.flange({ key: 'supFl', x: shellR * s, y: (cy + 23) * s, angle: 0, d: 4 }),
        K.flange({ key: 'cdFl', x: 455 * s, y: shellBot * s, angle: 90, d: 8 })
      ]));
    }
    // port markers (picked up by the board's standard outward stubs)
    C.push(h('circle', { key: 'pmSteam', cx: 506, cy: shellTop, r: 0.75, fill: 'none', 'data-port': 'steam-in', 'data-fluid': 'wetSteam', 'data-dir': 'up', 'data-size': 'medium', 'data-out': '0' }));
    C.push(h('circle', { key: 'pmSteam2', cx: 254, cy: shellTop, r: 0.75, fill: 'none', 'data-port': 'steam-in-2', 'data-fluid': 'wetSteam', 'data-dir': 'up', 'data-size': 'medium', 'data-out': '0' }));
    C.push(h('circle', { key: 'pmBypass', cx: shellL, cy: 229, r: 0.75, fill: 'none', 'data-port': 'bypass-in', 'data-fluid': 'wetSteam', 'data-dir': 'left', 'data-size': 'medium', 'data-out': '0' }));
    C.push(h('circle', { key: 'pmRet', cx: shellR, cy: cy - 23, r: 0.75, fill: 'none', 'data-port': 'cw-return', 'data-fluid': 'warmWater', 'data-dir': 'right', 'data-size': 'small', 'data-out': '1' }));
    C.push(h('circle', { key: 'pmSup', cx: shellR, cy: cy + 23, r: 0.75, fill: 'none', 'data-port': 'cw-supply', 'data-fluid': 'coldWater', 'data-dir': 'right', 'data-size': 'small', 'data-out': '0' }));
    C.push(h('circle', { key: 'pmCond', cx: 455, cy: shellBot, r: 0.75, fill: 'none', 'data-port': 'condensate-out', 'data-fluid': 'condensate', 'data-dir': 'down', 'data-size': 'medium', 'data-out': '1' }));

    // control panel (design keeps it when showControls; sliders emit onControl,
    // readouts render from update() props / overrides — no local authoritative state)
    if (showControls) {
      var px = 140, py = 640, pw = 480, ph = 150;
      var ctl = [];
      ctl.push(h('rect', { key: 'cbg', x: px, y: py, width: pw, height: ph, rx: 10, fill: '#0e1620', stroke: '#25333e', strokeWidth: 1.4 }));
      var sliderRow = function (key, lbl, action, y) {
        return [
          h('text', { key: key + 'l', x: px + 16, y: y + 4, fill: '#6b8598', fontSize: 9, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.1em' }, lbl),
          h('foreignObject', { key: key + 's', x: px + 150, y: y - 9, width: pw - 220, height: 18 },
            h('input', {
              type: 'range', min: 0, max: 100, step: 1, value: 0,
              onInput: function (e) { env.onControl(action, +e.target.value); },
              ref: function (el) { slInputs[action] = el; },
              style: { width: '100%', accentColor: CYAN, cursor: 'pointer', pointerEvents: 'auto' }
            })),
          h('text', { key: key + 'v', x: px + pw - 16, y: y + 4, textAnchor: 'end', fill: CYAN, fontSize: 12, fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace", ref: function (el) { slVals[action] = el; } }, '')
        ];
      };
      ctl = ctl.concat(sliderRow('sl', 'STEAM LOAD', 'steamLoad', py + 22));
      ctl = ctl.concat(sliderRow('hl', 'HOTWELL LEVEL', 'hotwellLevel', py + 46));
      ctl = ctl.concat(sliderRow('cf', 'COOLING FLOW', 'coolingFlow', py + 70));
      var ry = py + 108;
      [['VACUUM', 'vacuum', CYAN], ['HOTWELL TEMP', 'hwTemp', '#dfe8ef']].forEach(function (col, i) {
        var cx0 = px + (pw / 2) * i + (pw / 2) / 2;
        ctl.push(h('text', { key: 'cl' + i, x: cx0, y: ry, textAnchor: 'middle', fill: '#6b8598', fontSize: 9, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.12em' }, col[0]));
        ctl.push(h('text', { key: 'cv' + i, x: cx0, y: ry + 24, textAnchor: 'middle', fill: col[2], fontSize: 16, fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace", ref: function (el) { roVals[col[1]] = el; } }, ''));
      });
      panelG = h('g', { key: 'controls' }, ctl);
      C.push(panelG);
    }

    // crop the viewBox tight to the vessel when the control panel is hidden (as in the
    // diagram builders); keep the full frame when controls show
    var vb = showControls ? '0 0 820 800' : '214 168 332 212';
    var svgEl = h('svg', { viewBox: vb, style: { width: '100%', height: '100%', overflow: 'visible' } }, h('g', { key: 'cdScene' }, C));
    var root = h('div', { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, svgEl);

    // measured layout scale keeps flanges at standard canvas-px sizes and the panel a
    // fixed on-screen size (kU), matching the design's watchScale behavior
    var curS = 0.84;
    renderConns(curS);
    function applyScale(s) {
      renderConns(s);
      if (panelG) {
        var kU = 0.85 / s;
        panelG.setAttribute('transform', 'translate(' + (380 * (1 - kU)).toFixed(2) + ',' + (640 * (1 - kU)).toFixed(2) + ') scale(' + kU.toFixed(4) + ')');
      }
    }
    applyScale(curS);
    var unwatch = env.StdPipe.watchScale(svgEl, function (s) {
      if (Math.abs(s - curS) / s > 0.015) { curS = s; applyScale(s); }
    });

    // ---- dynamic state application ----
    var last = {};
    function update(props) {
      props = props || {};
      var steamLoad = clamp(num(props.steamLoad, 70), 0, 100);
      var level = clamp(num(props.hotwellLevel, 55), 0, 100);
      var coolingFlow = clamp(num(props.coolingFlow, 80), 0, 100);
      var cdTemp = num(props.temp, 40);
      var loadFrac = steamLoad / 100, coolFrac = coolingFlow / 100;
      var steamOn = steamLoad > 2, coolOn = coolingFlow > 2;
      var i;

      // hotwell fluid + steam space follow the same global temperature ramp as the pipes
      if (cdTemp !== last.temp) {
        last.temp = cdTemp;
        var waterC = env.StdPipe.phaseTempColor('water', cdTemp);
        var steamC = env.StdPipe.phaseTempColor('steam', cdTemp);
        waterStops[0].setAttribute('stop-color', waterC.flow);
        waterStops[1].setAttribute('stop-color', waterC.bore);
        steamStops[0].setAttribute('stop-color', steamC.flow);
        steamStops[1].setAttribute('stop-color', steamC.bore);
      }
      if (level !== last.level) {
        last.level = level;
        var levelY = waterBot - (level / 100) * (waterBot - waterTop);
        steamGradEl.setAttribute('y1', levelY);
        steamRect.setAttribute('height', Math.max(0, levelY - innerTop));
        waterRect.setAttribute('y', levelY);
        waterRect.setAttribute('height', Math.max(0, innerBot - levelY));
        surfLine.setAttribute('y1', levelY);
        surfLine.setAttribute('y2', levelY);
      }
      if (steamOn !== last.steamOn) {
        last.steamOn = steamOn;
        shellGlowEl.style.display = (glowOn && steamOn) ? '' : 'none';
      }
      if (coolOn !== last.coolOn) {
        last.coolOn = coolOn;
        for (i = 0; i < tubeFlowEls.length; i++) tubeFlowEls[i].setAttribute('class', (flowOn && coolOn) ? 'flow' : '');
      }
      if (loadFrac !== last.loadFrac) {
        last.loadFrac = loadFrac;
        // Circulating cooling water on the SAME global water ramp as every other pool/pipe:
        // cold at the inlet chamber, warmer at the outlet as it picks up the condensing heat.
        var cwSupply = 25, cwReturn = 25 + loadFrac * 14;
        var supC = env.StdPipe.phaseTempColor('water', cwSupply);
        var retC = env.StdPipe.phaseTempColor('water', cwReturn);
        var avgC = env.StdPipe.phaseTempColor('water', (cwSupply + cwReturn) / 2);
        outcRect.setAttribute('fill', retC.flow);
        if (incRect) incRect.setAttribute('fill', supC.flow);
        if (tubeStops[0]) {
          tubeStops[0].setAttribute('stop-color', avgC.bore);
          tubeStops[1].setAttribute('stop-color', avgC.flow);
          tubeStops[2].setAttribute('stop-color', avgC.bore);
        }
      }

      if (showControls) {
        var vacuum = props.vacuumInHg != null ? +props.vacuumInHg : clamp(27 + coolFrac * 2.2 - loadFrac * 2.4, 24, 29.6);
        var hwTemp = props.hotwellTempC != null ? +props.hotwellTempC : clamp(34 + loadFrac * 24 - coolFrac * 9, 25, 65);
        var vals = { steamLoad: steamLoad, hotwellLevel: level, coolingFlow: coolingFlow };
        for (var a in vals) {
          if (vals[a] !== last['sl_' + a]) {
            last['sl_' + a] = vals[a];
            slInputs[a].value = vals[a];
            slVals[a].textContent = vals[a].toFixed(0) + '%';
          }
        }
        var vTxt = vacuum.toFixed(1) + ' inHg', tTxt = hwTemp.toFixed(0) + ' °C';
        if (vTxt !== last.vTxt) { last.vTxt = vTxt; roVals.vacuum.textContent = vTxt; }
        if (tTxt !== last.tTxt) { last.tTxt = tTxt; roVals.hwTemp.textContent = tTxt; }
      }
    }

    function destroy() { if (unwatch) { unwatch(); unwatch = null; } }

    return { el: root, update: update, destroy: destroy };
  }
})();
