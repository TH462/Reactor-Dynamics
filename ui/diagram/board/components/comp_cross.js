/* comp_cross.js — pipe cross / four-way fitting, ported from the Claude Design project's
 * "Cross.dc.html" (project 6ad9a164, read 2026-07-27).
 *
 * Same family as comp_tee.js with one more leg: A and B on the horizontal run, C (up) and
 * D (down) on the vertical run. Every leg is independently 'in' (feeds the fitting), 'out'
 * (fed by it) or 'off' (isolated), so any one branch can be shut while the other three
 * still carry flow. A cross is symmetric, so unlike the Tee there is NO orientation prop:
 * psize/size sizes the horizontal run, branchSize the vertical.
 *
 * The V2 board uses exactly one, on the cold-leg header where two branches tap the same
 * point: the pressurizer spray line up (leg C) and the ECCS pump discharge in (leg D).
 *
 * Board mount is ART ONLY — the design source's LEGS cycle buttons and rate slider are
 * editor affordances and are not ported, so the tile uses the embedded crop viewBox
 * '60 60 20 20': all four ports sit at R=10 from centre, putting every flange face on a
 * tile edge. ('Cross' is in NUDGE_KINDS for the same reason as the Tee and the valves.)
 */
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};
  RD.BoardComps = RD.BoardComps || {};
  RD.BoardComps['Cross'] = { build: build };

  var LEGV = { a: [-1, 0], b: [1, 0], c: [0, -1], d: [0, 1] };
  var LEGDIR = { a: 'left', b: 'right', c: 'up', d: 'down' };
  var LEG_DEFAULT = { a: 'in', b: 'out', c: 'off', d: 'out' };
  var IDS = ['a', 'b', 'c', 'd'];
  var CX = 70, CY = 70, R = 10;

  function build(cfg, env) {
    var h = env.h;
    var K = env.StdPipe.createKit(h);

    var runSize = cfg.psize || cfg.size || 'medium';
    var branchSize = cfg.branchSize || 'medium';
    var dM = (K.SIZES && K.SIZES[runSize]) || 8;
    var dB = (K.SIZES && K.SIZES[branchSize]) || 8;
    function sizeOf(id) { return (id === 'c' || id === 'd') ? dB : dM; }
    function sizeName(id) { return (id === 'c' || id === 'd') ? branchSize : runSize; }

    function legProp(id) {
      var p = cfg['leg' + id.toUpperCase()];
      if (p === 'in' || p === 'out' || p === 'off') return p;
      return LEG_DEFAULT[id];
    }
    var st = {
      contents: cfg.contents != null ? cfg.contents : 'water',
      temp: cfg.temp != null ? +cfg.temp : 290,
      rate: Math.max(0, Math.min(100, cfg.flow != null ? +cfg.flow : (cfg.rate != null ? +cfg.rate : 100))),
      speedMul: Math.max(0.1, Math.min(4, +(cfg.speed != null ? cfg.speed : 1) || 1))
    };
    IDS.forEach(function (id) { st[id] = legProp(id); });
    var authoredRate = st.rate;   // the diagram's flow slider — see update()

    var geomG = h('g', null);
    var portEls = {};
    IDS.forEach(function (id) {
      portEls[id] = h('circle', {
        cx: CX + LEGV[id][0] * R, cy: CY + LEGV[id][1] * R, r: 0.75, fill: 'none',
        'data-port': id, 'data-dir': LEGDIR[id], 'data-size': sizeName(id),
        'data-phase': st.contents, 'data-temp': String(st.temp),
        'data-out': '0', 'data-active': '0'
      });
    });

    var svg = h('svg', {
      viewBox: '60 60 20 20',
      style: { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }
    }, geomG, portEls.a, portEls.b, portEls.c, portEls.d);

    var scale = null;
    var livePipes = [];   // K.pipe groups whose colour repaint() may update in place

    function legDir(id) { return st[id] === 'out' ? 1 : (st[id] === 'in' ? -1 : 0); }

    function rebuild() {
      var sc = scale || 1, kP = 1 / sc;
      var fl = K.phaseTempColor(st.contents, st.temp);
      var isEmpty = !!fl.empty;
      var anyIn = false, anyOut = false;
      IDS.forEach(function (id) { if (st[id] === 'in') anyIn = true; if (st[id] === 'out') anyOut = true; });
      // flow only moves when something feeds the fitting AND something takes it away
      var moving = st.rate > 2 && !isEmpty && anyIn && anyOut;
      // See comp_tee.js: dash velocity tracks SPEED only, `rate` only gates whether flow
      // moves at all, and the phase anchor is world-space (#231/#233).
      var speed = st.speedMul;
      var stubFluid = { phase: st.contents, temp: st.temp };
      var phaseX = (cfg.left || 0) - 60 * sc;
      var phaseY = (cfg.top || 0) - 60 * sc;

      function pt(id) { return [(CX + LEGV[id][0] * R) * sc, (CY + LEGV[id][1] * R) * sc]; }

      var geom = [];
      livePipes = [];
      function drawLeg(id) {
        var p = pt(id), fd = legDir(id);
        // See comp_tee.js: an 'off' leg is secured, not drained — full colour, still dashes
        // (#509 item 2).
        var g = K.pipe({
          x1: CX * sc, y1: CY * sc, x2: p[0], y2: p[1], d: sizeOf(id), phaseX: phaseX, phaseY: phaseY,
          fluid: stubFluid,
          flow: moving && fd !== 0, dir: fd >= 0 ? 1 : -1, speed: speed
        });
        geom.push(g);
        livePipes.push(g);   // off legs repaint too — they carry live fluid colour now
      }
      // A run whose two ends are in→out is drawn as ONE pipe so its dashes form a single
      // continuous pattern instead of two legs meeting out of phase at the joint.
      function drawRun(p, q, d) {
        var thru = (st[p] === 'in' && st[q] === 'out') || (st[q] === 'in' && st[p] === 'out');
        if (!thru) { drawLeg(p); drawLeg(q); return; }
        var a = pt(p), b = pt(q);
        var gr = K.pipe({
          x1: a[0], y1: a[1], x2: b[0], y2: b[1], d: d, phaseX: phaseX, phaseY: phaseY,
          fluid: stubFluid, flow: moving, dir: st[p] === 'in' ? 1 : -1, speed: speed
        });
        geom.push(gr); livePipes.push(gr);
      }
      // vertical run first so the horizontal run paints over the joint
      drawRun('c', 'd', dB);
      drawRun('a', 'b', dM);
      ['c', 'd', 'a', 'b'].forEach(function (id) {
        var p = pt(id);
        geom.push(K.flange({ x: p[0], y: p[1], angle: LEGV[id][0] ? 0 : 90, d: sizeOf(id) }));
      });

      RD.BoardH.clear(geomG);
      geomG.appendChild(h('g', { transform: 'scale(' + kP.toFixed(4) + ')' }, geom));

      IDS.forEach(function (id) {
        var fd = legDir(id);
        portEls[id].setAttribute('data-phase', st.contents);
        portEls[id].setAttribute('data-temp', String(st.temp));
        portEls[id].setAttribute('data-out', fd > 0 ? '1' : '0');
        // Ports follow `moving` — see comp_tee.js: a fitting driven to flowing:false
        // must stop the pipes joined to it, not just its interior dashes (#236).
        portEls[id].setAttribute('data-active', (isEmpty || fd === 0 || !moving) ? '0' : '1');
      });
    }

    rebuild();

    var unwatch = env.StdPipe.watchScale(svg, function (s) {
      if (!scale || Math.abs(s - scale) / s > 0.015) { scale = s; rebuild(); }
    });

    // See comp_tee.js for both halves of this: colour is repainted in place, and the geometry
    // is only rebuilt when something it depends on changed — rebuilding on every snapshot
    // restarted the dash animation and made the dashes jitter instead of flow (#233).
    function repaint() {
      var c = K.phaseTempColor(st.contents, st.temp);
      for (var i = 0; i < livePipes.length; i++) {
        var kids = livePipes[i].childNodes;
        if (kids[1]) kids[1].setAttribute('stroke', c.bore);
        if (kids[2]) kids[2].setAttribute('stroke', c.flow);
      }
      IDS.forEach(function (id) { portEls[id].setAttribute('data-temp', String(st.temp)); });
    }

    // Live dash VELOCITY (#350 item 10) — see comp_tee.js retime() for why this never
    // rebuilds and why the speed is a property of the SYSTEM rather than of this fitting.
    function retime() {
      for (var i = 0; i < livePipes.length; i++) {
        var fe = livePipes[i].childNodes[2];
        if (fe) K.setFlowSpeed(fe, st.speedMul);
      }
    }

    function geomDirty(props) {
      if (props.contents != null && props.contents !== st.contents) return true;
      var rate = st.rate;
      if (props.flowing != null) rate = props.flowing ? authoredRate : 0;
      if (props.flow != null) rate = Math.max(0, Math.min(100, +props.flow));
      if (rate !== st.rate) return true;
      for (var i = 0; i < IDS.length; i++) {
        var v = props['leg' + IDS[i].toUpperCase()];
        if ((v === 'in' || v === 'out' || v === 'off') && v !== st[IDS[i]]) return true;
      }
      return false;
    }

    function update(props) {
      if (!props) return;
      var rebuildNeeded = geomDirty(props);
      if (props.contents != null) st.contents = props.contents;
      var tempMoved = false;
      if (props.temp != null && isFinite(+props.temp) && +props.temp !== st.temp) {
        st.temp = +props.temp; tempMoved = true;
      }
      // See comp_tee.js: `flowing` gates the AUTHORED rate so the diagram's flow sliders
      // (which exist to match dash speed across connected components) survive.
      if (props.flowing != null) st.rate = props.flowing ? authoredRate : 0;
      if (props.flow != null) st.rate = Math.max(0, Math.min(100, +props.flow));
      var speedMoved = false;
      if (props.speed != null && isFinite(+props.speed)) {
        var sp = Math.max(0.1, Math.min(4, +props.speed || 1));
        if (sp !== st.speedMul) { st.speedMul = sp; speedMoved = true; }
      }
      IDS.forEach(function (id) {
        var v = props['leg' + id.toUpperCase()];
        if (v === 'in' || v === 'out' || v === 'off') st[id] = v;
      });
      if (rebuildNeeded) rebuild();
      else {
        if (tempMoved) repaint();
        if (speedMoved) retime();
      }
    }

    function destroy() { if (unwatch) { unwatch(); unwatch = null; } }

    return { el: svg, update: update, destroy: destroy };
  }
})();
