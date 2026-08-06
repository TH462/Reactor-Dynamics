/* comp_atmospheric_dump.js — steam relief to ATMOSPHERE, ported from the builder's
 * "Atmospheric Dump.dc.html" (#371). Board mount only: the builder mounts it with
 * show-label={{false}} and clickable={{false}} (the ADV is driven from its board card,
 * not by poking the schematic), so the label and hit target are not ported.
 *
 * This is the discharge END of the ADV path — the valve upstream of it is an ordinary
 * throttling Valve. Everything here is about showing steam LEAVING THE PLANT: a
 * silencer stack, an exit lip, the two atmosphere tick marks, and a plume whose size
 * and speed scale with discharge rate, so one part covers a cracked relief and a
 * full-open dump without a second drawing.
 *
 * openFrac/contents/temp arrive via update(); the plume is gated on openFrac so a shut
 * valve draws nothing above the mouth.
 */
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};
  RD.BoardComps = RD.BoardComps || {};
  RD.BoardComps['Atmospheric Dump'] = { build: build };

  var CYAN = '#4fe3ff';
  var FLANGE = '#4a5f6e', FLANGE_DK = '#243642';

  function ensureStyles() {
    if (document.getElementById('bd-adv-styles')) return;
    var s = document.createElement('style');
    s.id = 'bd-adv-styles';
    // A puff leaves the throat, expands and thins as it climbs; the jet is the tight
    // choked core at the mouth before the plume breaks up.
    s.textContent =
      '@keyframes advPuff{0%{transform:translate(0,0) scale(0.35);opacity:0}' +
      '14%{opacity:0.85}60%{opacity:0.42}' +
      '100%{transform:translate(var(--adv-dx,0px),-70px) scale(1.9);opacity:0}}' +
      '@keyframes advJet{0%{transform:scaleY(0.72);opacity:0.28}' +
      '50%{transform:scaleY(1);opacity:0.6}100%{transform:scaleY(0.72);opacity:0.28}}';
    (document.head || document.documentElement).appendChild(s);
  }

  function build(cfg, env) {
    ensureStyles();
    var h = env.h;
    var K = env.StdPipe.createKit(h);

    var fluidKey = cfg.fluid != null ? cfg.fluid : 'steam';
    var psize = cfg.psize || 'medium';
    var sizeD = (K.SIZES && K.SIZES[psize]) || 8;
    var silencer = cfg.silencer !== false;
    var glowOn = cfg.glow !== false;
    // Inlet on TOP, discharge pointing DOWN: the scene is mirrored about the horizontal
    // centreline so the plume keyframes (which climb in local space) fall in screen space
    // with no second set of animations.
    var pointDown = cfg.pointDown !== false;

    var cx = 60, MOUTH = 82;
    var bore = sizeD;

    var st = {
      openFrac: 0,
      contents: cfg.contents != null ? cfg.contents : 'steam',
      temp: cfg.temp != null ? cfg.temp : 250,
      fl: null
    };

    var gid = env.uid('adv');
    var STEEL = 'advSteel' + gid, PLUME = 'advPlume' + gid,
        GLOW = 'advGlow' + gid, SOFT = 'advSoft' + gid;

    var defs = h('defs', null, [
      h('linearGradient', { id: STEEL, x1: '0', y1: '0', x2: '1', y2: '0' }, [
        h('stop', { offset: '0', stopColor: '#0c141c' }),
        h('stop', { offset: '0.45', stopColor: '#3a4c58' }),
        h('stop', { offset: '1', stopColor: '#0c141c' })]),
      h('linearGradient', { id: PLUME, x1: '0', y1: '1', x2: '0', y2: '0' }, [
        h('stop', { offset: '0', stopColor: '#e8f2f8', stopOpacity: 0.30 }),
        h('stop', { offset: '0.55', stopColor: '#cfdce6', stopOpacity: 0.13 }),
        h('stop', { offset: '1', stopColor: '#cfdce6', stopOpacity: 0 })]),
      h('filter', { id: GLOW, x: '-80%', y: '-80%', width: '260%', height: '260%' },
        [h('feGaussianBlur', { stdDeviation: '5' })]),
      h('filter', { id: SOFT, x: '-60%', y: '-60%', width: '220%', height: '220%' },
        [h('feGaussianBlur', { stdDeviation: '3.2' })])
    ]);

    // ---- plume, drawn BEFORE the hardware so puffs read as leaving the mouth ----
    var coneEl = h('polygon', { points: '', fill: 'url(#' + PLUME + ')', filter: 'url(#' + SOFT + ')' });
    var puffEls = [], NPUFF = 7;
    for (var i = 0; i < NPUFF; i++) {
      puffEls.push(h('ellipse', {
        cx: cx + (i % 3 - 1) * 3.5, cy: MOUTH - 6,
        rx: 8.5 + (i % 3) * 2.5, ry: 7 + (i % 2) * 2,
        fill: '#dfe8ee', filter: 'url(#' + SOFT + ')',
        style: { transformBox: 'fill-box', transformOrigin: '50% 100%', opacity: 0 }
      }));
    }
    var jetEl = h('polygon', {
      points: '', fill: '#f2f8fb',
      style: { animation: 'advJet 0.5s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '50% 100%' }
    });
    var plumeG = h('g', { style: { pointerEvents: 'none' } }, coneEl, jetEl);
    puffEls.forEach(function (p) { plumeG.appendChild(p); });

    // ---- hardware ----
    var hw = [];
    hw.push(h('rect', { x: cx - 11, y: 118, width: 22, height: 44, fill: 'url(#' + STEEL + ')', stroke: '#46596a', strokeWidth: 2 }));
    var riserBore = h('rect', { x: cx - bore / 2, y: 118, width: bore, height: 44, fill: '#16222c', opacity: 0.9 });
    hw.push(riserBore);
    // diffuser cone opening out to the exit
    hw.push(h('polygon', { points: [cx - 11, 120, cx + 11, 120, cx + 22, 96, cx - 22, 96].join(' '), fill: 'url(#' + STEEL + ')', stroke: '#46596a', strokeWidth: 2 }));
    if (silencer) {
      hw.push(h('rect', { x: cx - 26, y: MOUTH + 2, width: 52, height: 16, rx: 3, fill: 'url(#' + STEEL + ')', stroke: '#46596a', strokeWidth: 2 }));
      [-18, -10, -2, 6, 14].forEach(function (dx) {
        hw.push(h('line', { x1: cx + dx, y1: MOUTH + 5, x2: cx + dx, y2: MOUTH + 15, stroke: '#1b2933', strokeWidth: 2, strokeLinecap: 'round' }));
      });
    }
    // exit lip — the ring the steam actually leaves through
    hw.push(h('rect', { x: cx - 22, y: MOUTH - 6, width: 44, height: 9, rx: 2.5, fill: FLANGE, stroke: FLANGE_DK, strokeWidth: 1.2 }));
    var mouthEl = h('ellipse', { cx: cx, cy: MOUTH - 6, rx: 15, ry: 3.6, fill: '#0a1017', stroke: '#3d5162', strokeWidth: 1.6, style: { transition: 'stroke 0.4s ease' } });
    hw.push(mouthEl);
    var mglowEl = h('ellipse', { cx: cx, cy: MOUTH - 6, rx: 20, ry: 8, fill: '#ffffff', opacity: 0, filter: 'url(#' + GLOW + ')', style: { pointerEvents: 'none' } });
    if (glowOn) hw.push(mglowEl);
    // open/shut pip on the riser
    var pipEl = h('circle', { cx: cx + 20, cy: 138, r: 3.4, fill: '#2a3a46', stroke: '#121b23', strokeWidth: 1 });
    hw.push(pipEl);
    // ATMOSPHERE tick marks — the universal "discharges to air" mark
    hw.push(h('g', { stroke: '#4a5f6e', strokeWidth: 1.6, strokeLinecap: 'round', opacity: 0.8 }, [
      h('line', { x1: cx - 34, y1: MOUTH - 16, x2: cx - 27, y2: MOUTH - 22 }),
      h('line', { x1: cx + 27, y1: MOUTH - 22, x2: cx + 34, y2: MOUTH - 16 })
    ]));

    var hwG = h('g', null, hw);
    // Inlet flange is redrawn on scale change so it keeps a constant on-screen size.
    var flangeG = h('g', null);

    var art = h('g', pointDown ? { transform: 'translate(0,170) scale(1,-1)' } : null, plumeG, hwG, flangeG);

    var portEl = h('circle', {
      cx: cx, cy: pointDown ? 170 - 164 : 164, r: 0.75, fill: 'none',
      'data-port': 'in', 'data-fluid': fluidKey, 'data-dir': pointDown ? 'up' : 'down',
      'data-size': psize, 'data-out': '0', 'data-active': '0', 'data-phase': 'steam', 'data-temp': ''
    });

    var svg = h('svg', {
      viewBox: '0 0 120 170',
      style: { width: '100%', height: '100%', display: 'block', overflow: 'visible' }
    }, defs, art, portEl);

    var scale = 1;
    function rebuildFlange() {
      while (flangeG.firstChild) flangeG.removeChild(flangeG.firstChild);
      var sc = scale || 1, k = (1 / sc).toFixed(4);
      var g = h('g', { transform: 'translate(' + cx + ' 162) scale(' + k + ') translate(' + (-cx) + ' -162)' },
        K.flange({ x: cx, y: 162, angle: 90, d: bore }));
      flangeG.appendChild(g);
    }

    var applied = {};
    function applyState(force) {
      var f = Math.max(0, Math.min(1, st.openFrac));
      if (!force && applied.f === f && applied.contents === st.contents && applied.temp === st.temp) return;
      applied.f = f; applied.contents = st.contents; applied.temp = st.temp;

      var fl = st.contents ? K.phaseTempColor(st.contents, st.temp) : (K.FLUIDS[fluidKey] || K.FLUIDS.steam);
      st.fl = fl;
      var open = f > 0.02;

      riserBore.setAttribute('fill', open ? fl.bore : '#16222c');
      mouthEl.setAttribute('stroke', open ? CYAN : '#3d5162');
      pipEl.setAttribute('fill', open ? CYAN : '#2a3a46');
      mglowEl.setAttribute('fill', fl.flow);
      mglowEl.setAttribute('opacity', String(open ? 0.16 * (0.4 + f) : 0));

      if (open) {
        plumeG.style.display = '';
        var spread = 20 + 26 * f;
        coneEl.setAttribute('points', [cx - 13, MOUTH, cx + 13, MOUTH,
          cx + spread, MOUTH - 76 * f - 8, cx - spread, MOUTH - 76 * f - 8].join(' '));
        jetEl.setAttribute('points', [cx - 9, MOUTH + 2, cx + 9, MOUTH + 2,
          cx + 5, MOUTH - 26 * f - 6, cx - 5, MOUTH - 26 * f - 6].join(' '));
        // Alternating drift so the plume looks turbulent rather than pulsing in step.
        puffEls.forEach(function (p, i) {
          var dur = (1.35 - 0.5 * f) * (1 + (i % 3) * 0.16);
          var drift = ((i % 2 ? 1 : -1) * (3 + (i % 4) * 4)) * (0.5 + f);
          p.style.setProperty('--adv-dx', drift.toFixed(1) + 'px');
          p.style.animation = 'advPuff ' + dur.toFixed(2) + 's linear infinite';
          p.style.animationDelay = (i * (dur / NPUFF)).toFixed(2) + 's';
        });
      } else {
        plumeG.style.display = 'none';
        puffEls.forEach(function (p) { p.style.animation = 'none'; });
      }

      portEl.setAttribute('data-phase', st.contents || '');
      portEl.setAttribute('data-temp', st.contents != null ? String(st.temp) : '');
      portEl.setAttribute('data-active', open ? '1' : '0');
    }

    rebuildFlange();
    applyState(true);

    var unwatch = env.StdPipe.watchScale(svg, function (s) {
      if (!scale || Math.abs(s - scale) / s > 0.015) { scale = s; rebuildFlange(); }
    });

    function update(props) {
      if (!props) return;
      if (props.openFrac != null) st.openFrac = props.openFrac;
      if (props.contents != null) st.contents = props.contents;
      if (props.temp != null) st.temp = props.temp;
      applyState(false);
    }
    function destroy() { if (unwatch) { unwatch(); unwatch = null; } }

    return { el: svg, update: update, destroy: destroy };
  }
})();
