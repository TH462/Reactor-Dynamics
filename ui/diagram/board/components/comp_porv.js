/* comp_porv.js — PORV (spring-bonnet angle relief valve), ported from
 * inbox/design_import/PORV.dc.html per ui/diagram/board/PORTING_CONTRACT.md.
 *
 * update({ open, showLabel }) — `open` drives the stem/disc lift, vent plume,
 * body-stroke glow and port data-active. The body click only emits
 * env.onControl('toggle', !openProp); visual state changes only via update().
 * The draggable indication card (cardDx/cardDy/onCardMove) is stripped.
 */
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};
  RD.BoardComps = RD.BoardComps || {};
  RD.BoardComps['PORV'] = { build: build };

  function ensureStyles() {
    if (document.getElementById('bd-porv-styles')) return;
    var s = document.createElement('style');
    s.id = 'bd-porv-styles';
    s.textContent =
      '.porv-hit:hover + .porv-hoverring{opacity:0.75}' +
      '.porv-hit:active + .porv-hoverring{opacity:1}' +
      '@keyframes porvVent{' +
        '0%{transform:translate(0,0);opacity:0}' +
        '16%{opacity:.8}' +
        '100%{transform:translate(-46px,-12px);opacity:0}' +
      '}';
    (document.head || document.documentElement).appendChild(s);
  }

  function build(cfg, env) {
    ensureStyles();
    var h = env.h;
    var K = env.StdPipe.createKit(h);

    var CYAN = '#4fe3ff';
    var FLANGE = '#4a5f6e', FLANGE_DK = '#243642';
    var cx = 85;
    var fluidKey = cfg.fluid || 'steam';
    var portSize = cfg.psize || 'small';
    var glowOn = cfg.glow == null ? true : !!cfg.glow;
    var fl = K.FLUIDS[fluidKey] || K.FLUIDS.steam;
    var STEEL = env.uid('porvSteel'), GLOW = env.uid('porvGlow');

    var openProp = false;   // last `open` received from update() — click emits its inverse
    var appliedOpen = null; // last value applied to the DOM

    var flD = (K.SIZES && K.SIZES[portSize]) || 4;
    var sc = 1;
    function flTransform(fx, fy) {
      return 'translate(' + fx + ' ' + fy + ') scale(' + (1 / sc).toFixed(4) +
        ') translate(' + (-fx) + ' ' + (-fy) + ')';
    }

    var defs = h('defs', { key: 'defs' }, [
      h('linearGradient', { key: 'steel', id: STEEL, x1: '0', y1: '0', x2: '0', y2: '1' }, [
        h('stop', { key: 0, offset: '0', stopColor: '#3a4c58' }), h('stop', { key: 1, offset: '1', stopColor: '#0c141c' })]),
      h('filter', { key: 'glow', id: GLOW, x: '-80%', y: '-80%', width: '260%', height: '260%' }, [h('feGaussianBlur', { key: 0, stdDeviation: '6' })])
    ]);

    // ---- discharge vent when the valve is lifted (steam vents right at the flange
    // face). Built once, shown/hidden by update(); animations only run while shown. ----
    var vent = [
      h('polygon', { key: 'plume', points: '53,115 53,133 17,141 17,107', fill: '#c7d0d6', opacity: 0.12 })
    ];
    for (var i = 0; i < 5; i++) {
      vent.push(h('circle', { key: 'pv' + i, cx: 51, cy: 124, r: 3 + (i % 3), fill: '#d7dde1', opacity: 0.78,
        style: { animation: 'porvVent ' + (0.9 + (i % 3) * 0.25).toFixed(2) + 's linear infinite', animationDelay: (i * 0.16).toFixed(2) + 's', transformBox: 'fill-box' } }));
    }
    var ventG = h('g', { key: 'vent', style: { display: 'none' } }, vent);

    // status glow behind body when open
    var glowC = h('circle', { key: 'oglow', cx: cx, cy: 124, r: 40, fill: fl.flow, opacity: 0.2, filter: 'url(#' + GLOW + ')', style: { display: 'none' } });

    // ---- angle valve body (bottom inlet, left outlet) ----
    var bodyRect = h('rect', { key: 'body', x: 58, y: 100, width: 54, height: 48, rx: 16, fill: 'url(#' + STEEL + ')', stroke: '#46596a', strokeWidth: 2.4, style: { transition: 'stroke 0.4s ease' } });

    // ---- spring bonnet stack ----
    var bonnet = [
      h('rect', { key: 'bnf', x: 64, y: 90, width: 42, height: 12, rx: 3, fill: FLANGE, stroke: FLANGE_DK, strokeWidth: 1 }),       // bonnet base flange
      h('rect', { key: 'bonnet', x: 72, y: 40, width: 26, height: 52, rx: 6, fill: 'url(#' + STEEL + ')', stroke: '#46596a', strokeWidth: 2.4 })  // spring housing
    ];
    [48, 56, 64, 72, 80].forEach(function (yy, ri) {                                                                                 // spring coils
      bonnet.push(h('line', { key: 'rib' + ri, x1: 74, y1: yy, x2: 96, y2: yy, stroke: '#56707f', strokeWidth: 2, opacity: 0.75, strokeLinecap: 'round' }));
    });
    bonnet.push(h('rect', { key: 'cap', x: 69, y: 28, width: 32, height: 12, rx: 4, fill: FLANGE, stroke: FLANGE_DK, strokeWidth: 1 }));      // cap
    bonnet.push(h('rect', { key: 'screw', x: 78, y: 14, width: 14, height: 14, rx: 3, fill: '#39505f', stroke: '#223543', strokeWidth: 1 })); // adjusting screw
    bonnet.push(h('line', { key: 'lever', x1: cx, y1: 24, x2: 52, y2: 12, stroke: '#39505f', strokeWidth: 3, strokeLinecap: 'round' }));      // test lever
    bonnet.push(h('circle', { key: 'leverk', cx: 50, cy: 11, r: 4.5, fill: '#39505f', stroke: '#223543', strokeWidth: 1 }));

    // ---- stem + seat disc (lifts when open) ----
    var plugG = h('g', { key: 'plug', style: { transform: 'translateY(16px)', transition: 'transform 0.4s ease' } }, [
      h('line', { key: 'stem', x1: cx, y1: 94, x2: cx, y2: 122, stroke: '#566672', strokeWidth: 4, strokeLinecap: 'round' }),
      h('ellipse', { key: 'disc', cx: cx, cy: 123, rx: 14, ry: 5, fill: '#566672', stroke: '#10191f', strokeWidth: 1 })
    ]);

    // ---- flanges (mating faces) — constant canvas px, sized by port ----
    var inFlG = h('g', { key: 'inFl', transform: flTransform(cx, 152) }, K.flange({ key: 'f', x: cx, y: 152, angle: 90, d: flD }));  // inlet: vertical pipe (down)
    var outFlG = h('g', { key: 'outFl', transform: flTransform(54, 124) }, K.flange({ key: 'f', x: 54, y: 124, angle: 0, d: flD })); // outlet: horizontal pipe (left)

    // ---- connection ports (read by the board's scanPorts) — right at the flange face ----
    var portIn = h('circle', { key: 'pIn', cx: cx, cy: 154, r: 0.75, fill: 'none', 'data-port': 'in', 'data-fluid': fluidKey, 'data-dir': 'down', 'data-size': portSize, 'data-out': '0', 'data-active': '0' });
    var portOut = h('circle', { key: 'pOut', cx: 52, cy: 124, r: 0.75, fill: 'none', 'data-port': 'out', 'data-fluid': fluidKey, 'data-dir': 'left', 'data-size': portSize, 'data-out': '1', 'data-active': '0' });

    // ---- click target + hover ring (hit must stay the adjacent sibling before the ring) ----
    var hit = h('circle', { key: 'hit', className: 'porv-hit', cx: cx, cy: 118, r: 46, fill: 'rgba(0,0,0,0)', style: { cursor: 'pointer' },
      onClick: function () { env.onControl('toggle', !openProp); } });
    var hoverring = h('circle', { key: 'hoverring', className: 'porv-hoverring', cx: cx, cy: 124, r: 30, fill: 'none', stroke: CYAN, strokeWidth: 5, opacity: 0, filter: 'url(#' + GLOW + ')', style: { pointerEvents: 'none' } });

    // Fill the tile (like every other component) so the item's authored box sets the
    // on-canvas size and the data-port markers land where the builder placed them — a
    // fixed-px svg centered in a smaller tile put the ports ~60px low and bent the pipes.
    var svg = h('svg', { viewBox: '44 5 70 152', preserveAspectRatio: 'xMidYMid meet', style: { width: '100%', height: '100%', overflow: 'visible', display: 'block' } },
      h('g', { key: 'porvScene' }, [defs, ventG, glowC, bodyRect, bonnet, plugG, inFlG, outFlG, portIn, portOut, hit, hoverring]));

    var unwatch = env.StdPipe.watchScale(svg, function (s) {
      if (Math.abs(s - sc) / s > 0.015) {
        sc = s;
        inFlG.setAttribute('transform', flTransform(cx, 152));
        outFlG.setAttribute('transform', flTransform(54, 124));
      }
    });

    function update(props) {
      props = props || {};
      var open = !!props.open;
      openProp = open;
      if (open !== appliedOpen) {
        appliedOpen = open;
        ventG.style.display = open ? '' : 'none';
        glowC.style.display = (glowOn && open) ? '' : 'none';
        bodyRect.setAttribute('stroke', open ? CYAN : '#46596a');
        plugG.style.transform = open ? 'translateY(0px)' : 'translateY(16px)';
        portIn.setAttribute('data-active', open ? '1' : '0');
        portOut.setAttribute('data-active', open ? '1' : '0');
      }
      // showLabel is accepted for API parity, but the design source declares the
      // label/showLabel props without drawing any label geometry — nothing to toggle.
    }

    function destroy() {
      if (unwatch) { unwatch(); unwatch = null; }
    }

    return { el: svg, update: update, destroy: destroy };
  }
})();
