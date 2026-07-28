/* comp_tee.js — pipe tee / branch fitting, ported from the Claude Design project's
 * "Tee.dc.html" (project 6ad9a164, read 2026-07-27).
 *
 * Three legs: A and B on the straight run, C on the branch. Each leg is independently
 * 'in' (feeds the fitting), 'out' (fed by it) or 'off' (isolated), so one leg can be
 * shut while the other two still carry flow.
 *
 * Board mount is ART ONLY — the design source's LEGS cycle buttons and the rate slider
 * are editor affordances and are not ported, so the tile uses the embedded crop
 * viewBox '60 60 20 20': every port sits at R=10 from centre, which puts all three
 * flange faces exactly on the tile edges so they land on grid lines like the valves.
 * ('Tee' is registered in NUDGE_KINDS for the same reason.)
 *
 * Item props on the board differ in name from the design editor's: psize (not size),
 * teeOrient (not orientation), flow (not rate). Both spellings are accepted.
 */
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};
  RD.BoardComps = RD.BoardComps || {};
  RD.BoardComps['Tee'] = { build: build };

  var DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  var CX = 70, CY = 70, R = 10;

  function build(cfg, env) {
    var h = env.h;
    var K = env.StdPipe.createKit(h);

    var orient = DIRV[cfg.teeOrient] ? cfg.teeOrient : (DIRV[cfg.orientation] ? cfg.orientation : 'up');
    var mainSize = cfg.psize || cfg.size || 'medium';
    var branchSize = cfg.branchSize || 'medium';
    var dM = (K.SIZES && K.SIZES[mainSize]) || 8;
    var dB = (K.SIZES && K.SIZES[branchSize]) || 8;

    function legProp(id) {
      var p = cfg['leg' + id.toUpperCase()];
      if (p === 'in' || p === 'out' || p === 'off') return p;
      return id === 'a' ? 'in' : 'out';
    }
    var st = {
      contents: cfg.contents != null ? cfg.contents : 'water',
      temp: cfg.temp != null ? +cfg.temp : 290,
      rate: Math.max(0, Math.min(100, cfg.flow != null ? +cfg.flow : (cfg.rate != null ? +cfg.rate : 100))),
      speedMul: Math.max(0.1, Math.min(4, +(cfg.speed != null ? cfg.speed : 1) || 1)),
      a: legProp('a'), b: legProp('b'), c: legProp('c')
    };

    // branch vector, and the straight run perpendicular to it
    var bv = DIRV[orient];
    var mv = (orient === 'up' || orient === 'down') ? [1, 0] : [0, 1];
    var LEGS = [
      { id: 'a', v: [-mv[0], -mv[1]], d: dM, size: mainSize, dir: mv[0] ? 'left' : 'up' },
      { id: 'b', v: mv, d: dM, size: mainSize, dir: mv[0] ? 'right' : 'down' },
      { id: 'c', v: bv, d: dB, size: branchSize, dir: orient }
    ];
    function legOf(id) { for (var i = 0; i < LEGS.length; i++) if (LEGS[i].id === id) return LEGS[i]; return null; }
    var authoredRate = st.rate;   // the diagram's flow slider — see update()

    var geomG = h('g', null);
    var portEls = {};
    LEGS.forEach(function (L) {
      portEls[L.id] = h('circle', {
        cx: CX + L.v[0] * R, cy: CY + L.v[1] * R, r: 0.75, fill: 'none',
        'data-port': L.id, 'data-dir': L.dir, 'data-size': L.size,
        'data-phase': st.contents, 'data-temp': String(st.temp),
        'data-out': '0', 'data-active': '0'
      });
    });

    var svg = h('svg', {
      viewBox: '60 60 20 20',
      style: { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }
    }, geomG, portEls.a, portEls.b, portEls.c);

    var scale = null;

    function legDir(id) { return st[id] === 'out' ? 1 : (st[id] === 'in' ? -1 : 0); }

    function rebuild() {
      var sc = scale || 1, kP = 1 / sc;
      var fl = K.phaseTempColor(st.contents, st.temp);
      var isEmpty = !!fl.empty;
      var anyIn = st.a === 'in' || st.b === 'in' || st.c === 'in';
      var anyOut = st.a === 'out' || st.b === 'out' || st.c === 'out';
      // flow only moves when something feeds the fitting AND something takes it away
      var moving = st.rate > 2 && !isEmpty && anyIn && anyOut;
      // Shared with the board's pipe runs — see StdPipe.dashSpeed (#231). The design
      // source's own curve (0.45 + 1.1 * rate/100) put a full-flow tee at 1.55x, so its
      // dashes visibly stepped against the 1.0x pipes either side of the joint.
      var speed = K.dashSpeed(st.rate, st.speedMul);
      var stubFluid = { phase: st.contents, temp: st.temp };

      function pt(L) { return [(CX + L.v[0] * R) * sc, (CY + L.v[1] * R) * sc]; }

      var geom = [];
      function drawLeg(id) {
        var L = legOf(id), p = pt(L), fd = legDir(id);
        geom.push(K.pipe({
          x1: CX * sc, y1: CY * sc, x2: p[0], y2: p[1], d: L.d,
          fluid: fd === 0 ? { phase: 'empty' } : stubFluid,
          flow: moving && fd !== 0, dir: fd >= 0 ? 1 : -1, speed: speed
        }));
      }
      // branch first so the straight run paints over the joint
      drawLeg('c');
      // when flow runs straight through A→B (or B→A) the run is ONE pipe, so its dashes
      // are a single continuous pattern instead of two legs meeting out of phase
      var thru = (st.a === 'in' && st.b === 'out') || (st.b === 'in' && st.a === 'out');
      if (thru) {
        var pa = pt(legOf('a')), pb = pt(legOf('b'));
        geom.push(K.pipe({
          x1: pa[0], y1: pa[1], x2: pb[0], y2: pb[1], d: dM,
          fluid: stubFluid, flow: moving, dir: st.a === 'in' ? 1 : -1, speed: speed
        }));
      } else {
        drawLeg('a'); drawLeg('b');
      }
      ['c', 'a', 'b'].forEach(function (id) {
        var L = legOf(id), p = pt(L);
        geom.push(K.flange({ x: p[0], y: p[1], angle: L.v[0] ? 0 : 90, d: L.d }));
      });

      RD.BoardH.clear(geomG);
      // no junction disc: at this size the three stubs simply meet, like a plain fitting
      geomG.appendChild(h('g', { transform: 'scale(' + kP.toFixed(4) + ')' }, geom));

      LEGS.forEach(function (L) {
        var fd = legDir(L.id);
        portEls[L.id].setAttribute('data-phase', st.contents);
        portEls[L.id].setAttribute('data-temp', String(st.temp));
        portEls[L.id].setAttribute('data-out', fd > 0 ? '1' : '0');
        portEls[L.id].setAttribute('data-active', (isEmpty || fd === 0) ? '0' : '1');
      });
    }

    rebuild();

    var unwatch = env.StdPipe.watchScale(svg, function (s) {
      if (!scale || Math.abs(s - scale) / s > 0.015) { scale = s; rebuild(); }
    });

    function update(props) {
      if (!props) return;
      if (props.contents != null) st.contents = props.contents;
      if (props.temp != null && isFinite(+props.temp)) st.temp = +props.temp;
      // `flowing` gates the AUTHORED rate; `flow` overrides it outright. Prefer `flowing`:
      // the diagram's flow sliders exist so connected components can be matched for a
      // uniform dash speed, and a driver that writes a flat 100 throws that away. The
      // driver knows whether the line is moving; the diagram knows how fast it should look.
      if (props.flowing != null) st.rate = props.flowing ? authoredRate : 0;
      if (props.flow != null) st.rate = Math.max(0, Math.min(100, +props.flow));
      ['a', 'b', 'c'].forEach(function (id) {
        var v = props['leg' + id.toUpperCase()];
        if (v === 'in' || v === 'out' || v === 'off') st[id] = v;
      });
      rebuild();
    }

    function destroy() { if (unwatch) { unwatch(); unwatch = null; } }

    return { el: svg, update: update, destroy: destroy };
  }
})();
