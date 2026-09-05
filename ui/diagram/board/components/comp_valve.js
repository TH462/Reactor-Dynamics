/* comp_valve.js — V-port throttling valve, ported from inbox/design_import/Valve.dc.html.
 * Board mount only: the builder mounts with throttle={{false}} and show-label={{false}},
 * so the THROTTLE slider box and label are not ported and the svg uses the embedded
 * crop viewBox '40 40 60 60' (ports at ±R from centre land on the tile edges).
 * openFrac/contents/temp arrive via update(); a body click only emits onControl.
 */
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};
  RD.BoardComps = RD.BoardComps || {};
  RD.BoardComps['Valve'] = { build: build };

  var CYAN = '#4fe3ff';

  function ensureStyles() {
    if (document.getElementById('bd-valve-styles')) return;
    var s = document.createElement('style');
    s.id = 'bd-valve-styles';
    s.textContent =
      '@keyframes flowmove{to{stroke-dashoffset:-24}}' +
      '.flow{stroke-dasharray:9 15;animation:flowmove 1.1s linear infinite}' +
      '.cv-hit:hover + .cv-hoverring{opacity:0.75}' +
      '.cv-hit:active + .cv-hoverring{opacity:1}';
    (document.head || document.documentElement).appendChild(s);
  }

  function build(cfg, env) {
    ensureStyles();
    var h = env.h;
    var K = env.StdPipe.createKit(h);

    var clickable = !!cfg.clickable;
    var orient = (cfg.orientation === 'vertical') ? 'vertical' : 'horizontal';
    var fluidKey = cfg.fluid != null ? cfg.fluid : 'coolWater';
    var flowDir = (cfg.flowDir === 'reverse') ? -1 : 1;
    var vsize = cfg.psize || 'medium';
    var sizeD = (K.SIZES && K.SIZES[vsize]) || 8;

    // Same ball-valve family (round casing + ball + hub + flanges) but this is a
    // V-port throttling valve: the fluid opening is a wedge whose area scales with
    // openFrac, and a graduated needle gauge shows the modulating position.
    var cx = 70, cy = 70, R = 30, Rc = 21, Rb = 17;
    var bore = vsize === 'small' ? 11 : vsize === 'large' ? 20 : 15;
    var rTick = Rb - 2.5, rNeed = Rb - 5.5, D2R = Math.PI / 180;

    // live display state — authoritative values come from update(); no local toggling
    var st = {
      openFrac: 1,
      contents: cfg.contents != null ? cfg.contents : (cfg.fluid != null ? null : 'steam'),
      temp: cfg.temp != null ? cfg.temp : 220,
      flow: true,   // false = valve open but NOT flowing (no downstream animation)
      fl: null, wet: false
    };

    // Unique per-instance def ids: SVG resolves url(#id) to the FIRST matching id in
    // the whole document, so shared ids would paint every valve with the first
    // valve's gradient. env.uid keeps these unique per instance.
    var gid = env.uid('cv');
    var STEEL = 'cvSteel' + gid, BALL = 'cvBall' + gid, FLUID = 'cvFluid' + gid, GLOW = 'cvGlow' + gid;

    var fluidStopA, fluidStopB, vportEl, streakEl, needleEl, sigEl;
    var portEls = {}, neckRefs = [];

    var defs = h('defs', null, [
      h('linearGradient', { id: STEEL, x1: '0', y1: '0', x2: '0', y2: '1' }, [
        h('stop', { offset: '0', stopColor: '#485c69' }), h('stop', { offset: '1', stopColor: '#0e171e' })]),
      h('radialGradient', { id: BALL, cx: '0.38', cy: '0.34', r: '0.8' }, [
        h('stop', { offset: '0', stopColor: '#6b7f8c' }), h('stop', { offset: '1', stopColor: '#26323b' })]),
      h('radialGradient', { id: FLUID, cx: '0.42', cy: '0.38', r: '0.72' }, [
        h('stop', { ref: function (el) { fluidStopA = el; }, offset: '0', stopColor: '#ffffff' }),
        h('stop', { ref: function (el) { fluidStopB = el; }, offset: '1', stopColor: '#000000' })]),
      h('filter', { id: GLOW, x: '-60%', y: '-60%', width: '220%', height: '220%' }, [h('feGaussianBlur', { stdDeviation: '6' })])
    ]);

    var sym = [];
    // steel casing
    sym.push(h('circle', { cx: cx, cy: cy, r: Rc, fill: 'url(#' + STEEL + ')', stroke: '#46596a', strokeWidth: 2.4 }));
    // ball
    sym.push(h('circle', { cx: cx, cy: cy, r: Rb, fill: 'url(#' + BALL + ')', stroke: '#0c141c', strokeWidth: 1 }));
    // flow channel across the ball (dark seat), always visible so the bore reads
    sym.push(h('rect', { x: cx - Rb, y: cy - bore / 2, width: Rb * 2, height: bore, rx: bore / 2, fill: '#141d24', stroke: '#0c141c', strokeWidth: 0.8 }));
    // V-port fluid wedge — opening area proportional to openFrac (the variable signal)
    /* `fill`, NOT `all` (#613 wave 3). A modulating valve rewrites `points` on every broadcast,
     * and `all 0.35s ease` put every animatable property of that write under a 350 ms transition
     * that the next broadcast restarted. Only the wet/dry fill swap is a discrete event. */
    vportEl = h('polygon', { points: '', fill: '#4a5866', stroke: 'none', style: { transition: 'fill 0.35s ease' } });
    sym.push(vportEl);
    // flow streak scaled by opening
    streakEl = h('line', {
      x1: cx - Rb + 3, y1: cy, x2: cx + Rb - 3, y2: cy, stroke: '#f2fbff',
      strokeWidth: 1.6, strokeLinecap: 'round', opacity: 0.8, className: 'flow',
      style: { animationDirection: flowDir < 0 ? 'reverse' : 'normal' }
    });
    sym.push(streakEl);

    // graduated position gauge on the top arc — ticks + a needle that sweeps with openFrac
    var gauge = [];
    for (var i = 0; i <= 4; i++) {
      var a = 180 * (1 - i / 4) * D2R; // 180° (left=closed) → 0° (right=open)
      gauge.push(h('line', {
        x1: cx + Math.cos(a) * (rTick - 2), y1: cy - Math.sin(a) * (rTick - 2),
        x2: cx + Math.cos(a) * rTick, y2: cy - Math.sin(a) * rTick,
        stroke: '#8fa3b2', strokeWidth: i === 0 || i === 4 ? 1.4 : 0.9, opacity: 0.7
      }));
    }
    /* `stroke`, NOT `all` (#613 wave 3) — the needle's x2/y2 sweep with openFrac every broadcast;
     * only the open/closed colour is a discrete event. */
    needleEl = h('line', { x1: cx, y1: cy, x2: cx + rNeed, y2: cy, stroke: CYAN, strokeWidth: 2.2, strokeLinecap: 'round', style: { transition: 'stroke 0.35s ease' } });
    gauge.push(needleEl);
    sym.push(h('g', null, gauge));

    // stem hub (echoes the ball-valve hub)
    sym.push(h('circle', { cx: cx, cy: cy, r: 3.4, fill: '#3a4550', stroke: '#141a20', strokeWidth: 1.2 }));
    // short stem + drive flat pointing away from the flow, marking this as a driven valve
    sym.push(h('rect', { x: cx - 2, y: cy - Rc - 6, width: 4, height: 8, rx: 1, fill: '#8fa3b2', stroke: '#0c141c', strokeWidth: 0.7 }));
    sym.push(h('rect', { x: cx - 6, y: cy - Rc - 12, width: 12, height: 7, rx: 1.5, fill: '#3a4c58', stroke: '#0c141c', strokeWidth: 1 }));
    sigEl = h('circle', { cx: cx, cy: cy - Rc - 8.5, r: 1.7, fill: CYAN });
    sym.push(sigEl);

    // wrap symbol; rotate 90° for vertical orientation
    var rot = orient === 'vertical' ? 90 : 0;
    var symG = h('g', { transform: 'rotate(' + rot + ' ' + cx + ' ' + cy + ')' }, sym);

    // ---- connection necks + flanges + ports (computed per orientation, upright) ----
    var along = orient === 'vertical' ? [0, 1] : [1, 0]; // unit vector of the pipe run
    function dirFor(s) { return orient === 'vertical' ? (s < 0 ? 'up' : 'down') : (s < 0 ? 'left' : 'right'); }

    var connG = h('g', null); // scale-compensated stub group, filled by rebuildConns
    var scale = 1;

    function mkPort(id, s) {
      var el = h('circle', {
        cx: cx + along[0] * s * R, cy: cy + along[1] * s * R, r: 0.75, fill: 'none',
        'data-port': id, 'data-fluid': fluidKey, 'data-phase': '', 'data-temp': '',
        'data-dir': dirFor(s), 'data-size': vsize, 'data-out': (s * flowDir > 0 ? '1' : '0'), 'data-active': '1'
      });
      portEls[id] = el;
      return el;
    }

    // click target + hover ring (upright, centered on body)
    var hit = h('circle', {
      className: clickable ? 'cv-hit' : undefined, cx: cx, cy: cy, r: R - 2, fill: 'rgba(0,0,0,0)',
      style: { cursor: clickable ? 'pointer' : 'default', pointerEvents: clickable ? 'auto' : 'none' },
      onClick: clickable ? function () { env.onControl('toggle', st.openFrac < 0.5 ? 1 : 0); } : undefined
    });
    var hoverring = h('circle', { className: 'cv-hoverring', cx: cx, cy: cy, r: Rc, fill: 'none', stroke: CYAN, strokeWidth: 5, opacity: 0, filter: 'url(#' + GLOW + ')', style: { pointerEvents: 'none' } });

    var svg = h('svg', {
      viewBox: '40 40 60 60',
      style: { width: '100%', height: '100%', display: 'block', overflow: 'visible' }
    }, defs, symG, connG, mkPort('a', -1), mkPort('b', 1), hit, hoverring);

    // Necks are rebuilt only on scale change (so the dash animation never restarts);
    // fluid recolor + flow show/hide are cheap in-place mutations via colorizeConns.
    function rebuildConns() {
      var sc = scale || 1, kP = 1 / sc;
      connG.setAttribute('transform', 'scale(' + kP.toFixed(4) + ')');
      while (connG.firstChild) connG.removeChild(connG.firstChild);
      neckRefs.length = 0;
      [-1, 1].forEach(function (sg) {
        var ex = (cx + along[0] * sg * (Rc - 1)) * sc, ey = (cy + along[1] * sg * (Rc - 1)) * sc;
        var px = (cx + along[0] * sg * R) * sc, py = (cy + along[1] * sg * R) * sc;
        var pg = K.pipe({ x1: ex, y1: ey, x2: px, y2: py, d: sizeD, fluid: { bore: '#000000', flow: '#ffffff' }, flow: true, dir: sg * flowDir > 0 ? 1 : -1 });
        neckRefs.push({ bore: pg.childNodes[1], flow: pg.childNodes[2] });
        connG.appendChild(pg);
        connG.appendChild(K.flange({ x: px, y: py, angle: orient === 'vertical' ? 90 : 0, d: sizeD }));
      });
      colorizeConns();
    }

    function colorizeConns() {
      var fl = st.fl;
      if (!fl) return;
      neckRefs.forEach(function (r) {
        r.bore.setAttribute('stroke', fl.bore);
        r.flow.setAttribute('stroke', fl.flow);
        r.flow.style.display = st.wet ? '' : 'none';
      });
    }

    var applied = {};
    function applyState(force) {
      var openFrac = Math.max(0, Math.min(1, st.openFrac));
      if (!force && applied.openFrac === openFrac && applied.contents === st.contents && applied.temp === st.temp && applied.flow === st.flow) return;
      applied.openFrac = openFrac; applied.contents = st.contents; applied.temp = st.temp; applied.flow = st.flow;

      var fl = st.contents ? K.phaseTempColor(st.contents, st.temp) : (K.FLUIDS[fluidKey] || K.FLUIDS.coolWater);
      var isEmpty = !!fl.empty;
      var open = openFrac > 0.02; // source: flow > 2 (%)
      var wet = open && !isEmpty && st.flow;   // flowing (streak + downstream pipe); st.flow gates a "open but not flowing" valve
      st.fl = fl; st.wet = wet;

      // Valve-body fluid gradient — a BODY, so it takes bore at the bright end since the
      // #350 item 20 inversion. The bore/flow pair above is a K.pipe stroke stack and is
      // correct as written (case, bore, flow).
      fluidStopA.setAttribute('stop-color', fl.bore);
      fluidStopB.setAttribute('stop-color', fl.flow);

      // V-port wedge — height proportional to openFrac; greyed when empty
      var ho = (bore / 2 - 0.5) * openFrac;
      if (openFrac > 0.01) {
        vportEl.style.display = '';
        vportEl.setAttribute('points', (cx - Rb + 1) + ',' + cy + ' ' + (cx + Rb - 1) + ',' + (cy - ho) + ' ' + (cx + Rb - 1) + ',' + (cy + ho));
        vportEl.setAttribute('fill', wet ? ('url(#' + FLUID + ')') : '#4a5866');
      } else {
        vportEl.style.display = 'none';
      }

      // flow streak scaled by opening
      // The moving streak takes the FLUID'S DASH COLOUR, not a fixed near-white (#357). It was
      // hardcoded '#f2fbff', so every valve on the board showed a pale streak while the pipe it
      // sits in showed the fluid — the one place on the plant where a fitting disagreed with its
      // own line, and the owner's "valves STILL have the light colored dashes" after #350.
      // `fl.flow` is the DARKER of the pair since #350 item 20 inverted the convention, and it is
      // exactly what the adjoining pipe's dashes use, so a dash crosses the valve unchanged.
      if (wet) {
        streakEl.style.display = '';
        streakEl.setAttribute('stroke', fl.flow);
        streakEl.setAttribute('stroke-width', String(Math.max(1.6, bore * 0.24 * openFrac + 0.6)));
        streakEl.setAttribute('opacity', String(0.4 + 0.4 * openFrac));
      } else {
        streakEl.style.display = 'none';
      }

      // gauge needle sweep: 180° (closed) → 0° (open)
      var aN = 180 * (1 - openFrac) * D2R;
      needleEl.setAttribute('x2', String(cx + Math.cos(aN) * rNeed));
      needleEl.setAttribute('y2', String(cy - Math.sin(aN) * rNeed));
      needleEl.setAttribute('stroke', open ? CYAN : '#6b8598');
      sigEl.setAttribute('fill', open ? CYAN : '#4a5b67');

      // ports — data-active gates downstream pipe animation on open AND non-empty
      // (source only checked empty; the board rule adds openFrac > 0)
      var pTag = st.contents || '';
      var pTemp = st.contents != null ? String(st.temp) : '';
      var active = (openFrac > 0 && !isEmpty && st.flow) ? '1' : '0';
      ['a', 'b'].forEach(function (id) {
        portEls[id].setAttribute('data-phase', pTag);
        portEls[id].setAttribute('data-temp', pTemp);
        portEls[id].setAttribute('data-active', active);
      });

      colorizeConns();
    }

    rebuildConns();
    applyState(true);

    var unwatch = env.StdPipe.watchScale(svg, function (s) {
      if (!scale || Math.abs(s - scale) / s > 0.015) { scale = s; rebuildConns(); }
    });

    function update(props) {
      if (!props) return;
      if (props.openFrac != null) st.openFrac = props.openFrac;
      if (props.contents != null) st.contents = props.contents;
      if (props.temp != null) st.temp = props.temp;
      if (props.flow != null) st.flow = !!props.flow;
      applyState(false);
    }

    function destroy() {
      if (unwatch) { unwatch(); unwatch = null; }
    }

    return { el: svg, update: update, destroy: destroy };
  }
})();
