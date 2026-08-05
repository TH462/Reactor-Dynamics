/* comp_valve_vertical.js — ball valve on a vertical run, ported from
 * inbox/design_import/Valve Vertical.dc.html.
 * Board mount only: the builder mounts with throttle={{false}} and show-label={{false}},
 * so the FLOW slider box and label are not ported and the svg uses the embedded crop
 * viewBox '41 41 58 58' (ports at cy±R = 41 & 99 land on the tile edges).
 * openFrac/contents/temp arrive via update(); a body click only emits onControl.
 * Pose is binary: openFrac >= 0.5 reads as open (bore along the pipe), with the
 * source's 0.4s rotation transition.
 */
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};
  RD.BoardComps = RD.BoardComps || {};
  RD.BoardComps['Valve Vertical'] = { build: build };

  var CYAN = '#4fe3ff';
  var OPEN_ANG = 90; // bore orientation when OPEN. 90 = along the vertical pipe.

  function ensureStyles() {
    if (document.getElementById('bd-valve-vertical-styles')) return;
    var s = document.createElement('style');
    s.id = 'bd-valve-vertical-styles';
    s.textContent =
      '@keyframes flowmove{to{stroke-dashoffset:-24}}' +
      '.flow{stroke-dasharray:9 15;animation:flowmove 1.1s linear infinite}' +
      '.vlv-hit:hover + .vlv-hoverring{opacity:0.75}' +
      '.vlv-hit:active + .vlv-hoverring{opacity:1}';
    (document.head || document.documentElement).appendChild(s);
  }

  function build(cfg, env) {
    ensureStyles();
    var h = env.h;
    var K = env.StdPipe.createKit(h);

    var clickable = !!cfg.clickable;
    var fluidKey = cfg.fluid != null ? cfg.fluid : 'coldWater';
    var flowDir = (cfg.flowDir === 'reverse') ? -1 : 1;
    var vsize = cfg.psize || 'medium';
    var sizeD = (K.SIZES && K.SIZES[vsize]) || 8;

    var cx = 70, cy = 70, R = 29, Rc = 21, Rb = 17;
    var bore = vsize === 'small' ? 10 : vsize === 'large' ? 20 : 15;

    // live display state — authoritative values come from update(); no local toggling
    var st = {
      openFrac: 1,
      contents: cfg.contents != null ? cfg.contents : (cfg.fluid != null ? null : 'water'),
      temp: cfg.temp != null ? cfg.temp : 290,
      flow: true,   // false = open + water-filled but NOT flowing (e.g. check valve holds it shut)
      fl: null, wet: false
    };

    // Unique per-instance def ids: SVG resolves url(#id) to the FIRST matching id in
    // the whole document, so shared ids would paint every valve with the first
    // valve's gradient. env.uid keeps these unique per instance.
    var gid = env.uid('vlv');
    var STEEL = 'vlvSteel' + gid, BALL = 'vlvBall' + gid, FLUID = 'vlvFluid' + gid, GLOW = 'vlvGlow' + gid;

    var fluidStopA, fluidStopB, boreRect, streakEl, ballRotG;
    var portEls = {}, neckRefs = [];

    var defs = h('defs', null, [
      h('linearGradient', { id: STEEL, x1: '0', y1: '0', x2: '0', y2: '1' }, [
        h('stop', { offset: '0', stopColor: '#3a4c58' }), h('stop', { offset: '1', stopColor: '#0c141c' })]),
      h('radialGradient', { id: BALL, cx: '0.38', cy: '0.32', r: '0.8' }, [
        h('stop', { offset: '0', stopColor: '#566672' }), h('stop', { offset: '1', stopColor: '#10191f' })]),
      h('radialGradient', { id: FLUID, cx: '0.42', cy: '0.4', r: '0.7' }, [
        h('stop', { ref: function (el) { fluidStopA = el; }, offset: '0', stopColor: '#ffffff' }),
        h('stop', { ref: function (el) { fluidStopB = el; }, offset: '1', stopColor: '#000000' })]),
      h('filter', { id: GLOW, x: '-60%', y: '-60%', width: '220%', height: '220%' }, [h('feGaussianBlur', { stdDeviation: '6' })])
    ]);

    // connection stubs out to the port faces — the ball is smaller than the port
    // radius R, so the stubs + flanges always read, and the ports stay at ±R so the
    // pipe geometry in every diagram is unchanged.
    var connG = h('g', null); // scale-compensated stub group, filled by rebuildConns
    var scale = 1;

    // steel casing — same family as the RCP casing
    var casing = h('circle', { cx: cx, cy: cy, r: Rc, fill: 'url(#' + STEEL + ')', stroke: '#46596a', strokeWidth: 2.4 });

    // the ball + bore, rotating as a unit (bore drawn horizontal, posed by rotation)
    boreRect = h('rect', { x: cx - Rb, y: cy - bore / 2, width: Rb * 2, height: bore, rx: bore / 2, fill: '#5a6874', stroke: '#0c141c', strokeWidth: 1, style: { transition: 'fill 0.4s ease' } });
    streakEl = h('line', {
      x1: cx - Rb + 4, y1: cy, x2: cx + Rb - 4, y2: cy, stroke: '#f2fbff',
      strokeWidth: bore * 0.26, strokeLinecap: 'round', opacity: 0.7, className: 'flow',
      style: { animationDirection: flowDir < 0 ? 'reverse' : 'normal' }
    });
    var ballbg = h('circle', { cx: cx, cy: cy, r: Rb, fill: 'url(#' + BALL + ')', stroke: '#0c141c', strokeWidth: 1 });
    ballRotG = h('g', {
      style: { transform: 'rotate(' + OPEN_ANG + 'deg)', transformBox: 'view-box', transformOrigin: cx + 'px ' + cy + 'px', transition: 'transform 0.4s ease' }
    }, boreRect, streakEl);

    // stem pivot hub (echoes the RCP hub)
    var hub = h('circle', { cx: cx, cy: cy, r: 4, fill: '#3a4550', stroke: '#141a20', strokeWidth: 1.2 });

    // connection ports (inline on a vertical run) — read by the board to route pipes
    portEls.a = h('circle', { cx: cx, cy: cy - R, r: 0.75, fill: 'none', 'data-port': 'a', 'data-fluid': fluidKey, 'data-phase': '', 'data-temp': '', 'data-dir': 'up', 'data-size': vsize, 'data-out': flowDir < 0 ? '1' : '0', 'data-active': '1' });
    portEls.b = h('circle', { cx: cx, cy: cy + R, r: 0.75, fill: 'none', 'data-port': 'b', 'data-fluid': fluidKey, 'data-phase': '', 'data-temp': '', 'data-dir': 'down', 'data-size': vsize, 'data-out': flowDir < 0 ? '0' : '1', 'data-active': '1' });

    // click target + hover ring
    var hit = h('circle', {
      className: clickable ? 'vlv-hit' : undefined, cx: cx, cy: cy, r: R + 4, fill: 'rgba(0,0,0,0)',
      style: { cursor: clickable ? 'pointer' : 'default', pointerEvents: clickable ? 'auto' : 'none' },
      onClick: clickable ? function () { env.onControl('toggle', st.openFrac < 0.5 ? 1 : 0); } : undefined
    });
    var hoverring = h('circle', { className: 'vlv-hoverring', cx: cx, cy: cy, r: Rc, fill: 'none', stroke: CYAN, strokeWidth: 5, opacity: 0, filter: 'url(#' + GLOW + ')', style: { pointerEvents: 'none' } });

    var svg = h('svg', {
      viewBox: '41 41 58 58',
      style: { width: '100%', height: '100%', display: 'block', overflow: 'visible' }
    }, defs, connG, casing, ballbg, ballRotG, hub, portEls.a, portEls.b, hit, hoverring);

    // Stubs are rebuilt only on scale change (so the dash animation never restarts);
    // fluid recolor + flow show/hide are cheap in-place mutations via colorizeConns.
    function rebuildConns() {
      var sc = scale || 1, kP = 1 / sc;
      connG.setAttribute('transform', 'scale(' + kP.toFixed(4) + ')');
      while (connG.firstChild) connG.removeChild(connG.firstChild);
      neckRefs.length = 0;
      [-1, 1].forEach(function (s) {
        var pg = K.pipe({ x1: cx * sc, y1: (cy + s * Rc) * sc, x2: cx * sc, y2: (cy + s * R) * sc, d: sizeD, fluid: { bore: '#000000', flow: '#ffffff' }, flow: true, dir: s * flowDir > 0 ? 1 : -1 });
        neckRefs.push({ bore: pg.childNodes[1], flow: pg.childNodes[2] });
        connG.appendChild(pg);
        connG.appendChild(K.flange({ x: cx * sc, y: (cy + s * R) * sc, angle: 90, d: sizeD }));
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

      var fl = st.contents ? K.phaseTempColor(st.contents, st.temp) : (K.FLUIDS[fluidKey] || K.FLUIDS.coldWater);
      var isEmpty = !!fl.empty;
      var open = openFrac >= 0.5; // binary pose (source used flow > 2%)
      var filled = open && !isEmpty;     // valve open on a water-filled line (bore reads wet)
      var wet = filled && st.flow;       // actually flowing (drives the streak + downstream pipe)
      st.fl = fl; st.wet = wet;

      // Valve-body fluid gradient — a BODY, so it takes bore at the bright end since the
      // #350 item 20 inversion. The bore/flow pair above is a K.pipe stroke stack and is
      // correct as written (case, bore, flow).
      fluidStopA.setAttribute('stop-color', fl.bore);
      fluidStopB.setAttribute('stop-color', fl.flow);

      // ball pose: bore along the pipe when open, across it when closed (0.4s transition)
      ballRotG.style.transform = 'rotate(' + (open ? OPEN_ANG : OPEN_ANG + 90) + 'deg)';
      // bore shows fluid when open+filled (even if not flowing); grey when closed or empty
      boreRect.setAttribute('fill', filled ? ('url(#' + FLUID + ')') : '#5a6874');
      streakEl.style.display = wet ? '' : 'none';

      // ports — data-active gates downstream pipe animation on open, non-empty AND flowing
      var pTag = st.contents || '';
      var pTemp = st.contents != null ? String(st.temp) : '';
      var active = wet ? '1' : '0';
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
