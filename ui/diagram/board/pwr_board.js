/* pwr_board.js — PWR learning-board synoptic renderer.
 *
 * Renders the diagram document in window.RD_PWR_BOARD_DOC (exported from the
 * Claude Design "PWR Reactor" builder) as the sole PWR plant display. This file
 * is the display/runtime half: item tiles, component mounting, port scanning,
 * pipe routing (StdPipe kit) and the pause freeze. Everything sim-specific —
 * which command a button sends, what a value shows, what props a component
 * gets from a snapshot — lives in the driver (pwr_board_wiring.js), reached
 * through RD.PwrBoardDriver.
 *
 * Port scanning + gridNudge + pipe drawing replicate the builder
 * (inbox/design_import/Diagram Building Tools.dc.html) so routes land exactly
 * where they were authored:
 *   - components expose [data-port] markers; their world position is the
 *     marker's client-rect center divided by the stage scale
 *   - Pump/Valve tiles get a sub-grid translate ("nudge") so flange faces sit
 *     on the grid lines the pipes follow
 *   - user-attached flanges on boxes come from item.ports (edge + offset)
 *   - each pipe = StdPipe stacked-stroke polyline through
 *     [from, ...waypoints, to]; flow direction from the out-flagged port,
 *     overridable by pipe.flowDir; paused when either port is data-active="0"
 */
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};

  var CANVAS_W = 2400, CANVAS_H = 1600;
  var STD_SIZES = { small: 4, medium: 8, large: 12 };
  var NUDGE_KINDS = { 'Pump': 1, 'Valve': 1, 'Valve Horizontal': 1, 'Valve Vertical': 1 };
  var MONO = '"IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace';
  var SANS = 'ui-sans-serif, "Segoe UI", system-ui, sans-serif';

  var host = null, wrap = null, stage = null, underSvg = null, pausedEl = null;
  var doc = null, ctx = null;
  var comps = {};        // itemId -> { item, inst, bodyEl }
  var tiles = {};        // itemId -> root tile element
  var valueEls = {};     // itemId -> { valEl, unitEl }
  var buttonEls = {};    // itemId -> button element
  var numberEls = {};    // itemId -> { input, item, editing }
  var scramEls = {};     // itemId -> { btn, labelEl, subEl, state, timer }
  var ports = {};        // "itemId/port" -> port record (world coords)
  var nudge = {};        // itemId -> {dx,dy}
  var pipeFlow = [];     // [{fromKey,toKey,flowEl,dir,dur}]
  var ro = null, scanTimer = null, lastSnap = null;

  function driver() { return RD.PwrBoardDriver || null; }
  function h() { return RD.BoardH.h.apply(null, arguments); }

  // ---------------------------------------------------------------- layout --
  function contentBounds() {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    (doc.items || []).forEach(function (it) {
      var w = it.width || 120, hh = it.height || 40;
      var l = it.kind === 'value' ? it.left - w : it.left; // values are right-anchored
      if (l < minX) minX = l;
      if (it.top < minY) minY = it.top;
      if (it.left + w > maxX) maxX = it.left + w;
      if (it.top + hh > maxY) maxY = it.top + hh;
    });
    (doc.pipes || []).forEach(function (p) {
      (p.waypoints || []).forEach(function (q) {
        if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0];
        if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1];
      });
    });
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = CANVAS_W; maxY = CANVAS_H; }
    var pad = 18;
    return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
  }

  function layout() {
    if (!wrap || !stage) return;
    var r = wrap.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    var b = contentBounds();
    var s = Math.min(r.width / b.w, r.height / b.h);
    var ox = (r.width - b.w * s) / 2 - b.x * s;
    var oy = (r.height - b.h * s) / 2 - b.y * s;
    stage.style.transform = 'translate(' + ox.toFixed(2) + 'px,' + oy.toFixed(2) + 'px) scale(' + s.toFixed(5) + ')';
  }

  function stageScale() {
    var r = stage.getBoundingClientRect();
    return r.width > 2 ? { rect: r, scale: r.width / CANVAS_W } : null;
  }

  // ----------------------------------------------------------------- tiles --
  function tileBase(it, extra) {
    var el = h('div', { className: 'bd-tile', 'data-item': it.id });
    el.style.left = it.left + 'px';
    el.style.top = it.top + 'px';
    if (it.width != null) el.style.width = it.width + 'px';
    if (it.height != null && extra !== 'nohgt') el.style.height = it.height + 'px';
    return el;
  }

  function buildBox(it) {
    var el = tileBase(it);
    el.style.background = it.bg || '#0e1620';
    el.style.border = '1px solid ' + (it.border || '#25333e');
    el.style.borderRadius = (it.radius == null ? 8 : it.radius) + 'px';
    if (it.pipeTop) el.style.zIndex = '-1';
    if (it.title) {
      var t = h('div', { className: 'bd-box-title' }, it.title);
      t.style.fontSize = (it.fontSize || 10) + 'px';
      el.appendChild(t);
    }
    return el;
  }

  function buildText(it) {
    var el = tileBase(it, 'nohgt');
    el.className += ' bd-text';
    var inner = h('div', null, it.text || '');
    inner.style.color = it.color || '#9fb3c4';
    inner.style.fontFamily = it.mono === false ? SANS : MONO;
    inner.style.fontSize = (it.fontSize || 16) + 'px';
    inner.style.fontWeight = String(it.weight || 600);
    el.appendChild(inner);
    return el;
  }

  function buildButton(it) {
    var btn = h('button', { className: 'bd-btn' }, it.label || 'BUTTON');
    btn.style.border = '1px solid ' + (it.color || '#4fe3ff');
    btn.style.color = it.color || '#4fe3ff';
    btn.style.fontSize = (it.fontSize || 11) + 'px';
    btn.addEventListener('click', function () {
      var d = driver();
      if (d && d.onButton) d.onButton(it, btn);
    });
    buttonEls[it.id] = btn;
    var el = tileBase(it);
    el.appendChild(btn);
    return el;
  }

  function buildScram(it) {
    var labelEl = h('span', { style: { fontSize: (it.fontSize || 20) + 'px', fontWeight: 700, letterSpacing: '0.14em', lineHeight: 1 } }, it.label || 'SCRAM');
    var subEl = h('span', { style: { fontSize: '9px', letterSpacing: '0.16em', opacity: 0.85 } }, 'PRESS TO ARM');
    var btn = h('button', { className: 'bd-scram' }, labelEl, subEl);
    var rec = { btn: btn, labelEl: labelEl, subEl: subEl, item: it, state: 'idle', timer: null };
    paintScram(rec, it);
    btn.addEventListener('click', function () {
      var d = driver();
      if (rec.state === 'fired') { if (d && d.onScramReset) d.onScramReset(it); return; }
      if (rec.state === 'idle') {
        rec.state = 'armed';
        clearTimeout(rec.timer);
        rec.timer = setTimeout(function () { if (rec.state === 'armed') { rec.state = 'idle'; paintScram(rec, it); } }, 3000);
        paintScram(rec, it);
        return;
      }
      // armed -> fire
      clearTimeout(rec.timer);
      rec.state = 'idle'; // snapshot will move it to 'fired'
      if (d && d.onScram) d.onScram(it);
      paintScram(rec, it);
    });
    scramEls[it.id] = rec;
    var el = tileBase(it);
    el.appendChild(btn);
    return el;
  }

  function paintScram(rec, it) {
    var st = rec.state;
    var fired = st === 'fired', armed = st === 'armed';
    rec.labelEl.textContent = fired ? 'SCRAMMED' : (armed ? 'CONFIRM' : (it.label || 'SCRAM'));
    rec.subEl.textContent = fired ? 'PRESS TO RESET' : (armed ? 'PRESS AGAIN TO TRIP' : 'PRESS TO ARM');
    rec.btn.style.background = fired ? '#3a0e0e' : (armed ? '#5a1408' : '#0a2417');
    rec.btn.style.border = '3px solid ' + (fired ? '#ff5a4d' : (armed ? '#ffb400' : '#3d7a58'));
    rec.btn.style.color = fired ? '#ff7a6a' : (armed ? '#ffd166' : '#5a9575');
    rec.btn.style.animation = armed ? 'bdScramPulse 0.8s ease-in-out infinite' : 'none';
  }

  function buildNumber(it) {
    var el = tileBase(it, 'nohgt');
    if (it.label) {
      var lab = h('div', null, it.label);
      lab.style.cssText = 'color:#6b8598;font-family:' + MONO + ';font-size:' + (it.fontSize || 10) + 'px;letter-spacing:0.14em;margin-bottom:3px;white-space:nowrap';
      el.appendChild(lab);
    }
    var digits = it.digits == null ? 0 : it.digits;
    var step = it.step == null ? 1 : it.step;
    var editable = it.editable !== false;
    var input = h('input', { type: 'text', inputMode: 'decimal' });
    input.style.color = it.color || '#4fe3ff';
    input.style.fontSize = (it.fontSize || 10) + 'px';
    if (!editable) { input.readOnly = true; input.style.cursor = 'default'; }
    input.value = (it.value == null ? 0 : it.value).toFixed(digits);
    var rec = { input: input, item: it, editing: false, digits: digits };
    numberEls[it.id] = rec;

    function commit(v) {
      if (isNaN(v)) { rec.editing = false; return; }
      rec.editing = false;
      input.value = v.toFixed(digits);
      var d = driver();
      if (d && d.onNumber) d.onNumber(it, v);
    }
    input.addEventListener('focus', function () { rec.editing = true; });
    input.addEventListener('blur', function () { commit(parseFloat(input.value)); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') input.blur(); });

    var stepBox = h('div', { className: 'bd-num-steps' },
      h('button', { type: 'button', onClick: function () { commit((parseFloat(input.value) || 0) + step); } }, '▲'),
      h('button', { type: 'button', onClick: function () { commit((parseFloat(input.value) || 0) - step); } }, '▼'));

    var frame = h('div', { className: 'bd-num-frame' }, input);
    if (it.unit) {
      var u = h('span', { className: 'bd-num-unit' }, it.unit);
      u.style.fontSize = Math.max(8, Math.round((it.fontSize || 10) * 0.9)) + 'px';
      frame.appendChild(u);
    }
    frame.appendChild(stepBox);
    el.appendChild(frame);
    return el;
  }

  function buildValue(it) {
    var el = tileBase(it, 'nohgt');
    el.className += ' bd-value';
    el.style.width = '';
    el.style.color = it.color || '#4fe3ff';
    el.style.fontSize = (it.fontSize || 22) + 'px';
    var valEl = document.createTextNode(it.value == null ? '' : String(it.value));
    var unitEl = h('span', { className: 'bd-unit' }, it.unit || '');
    unitEl.style.fontSize = Math.max(8, Math.round((it.fontSize || 22) * 0.68)) + 'px';
    el.appendChild(valEl);
    el.appendChild(document.createTextNode(' '));
    el.appendChild(unitEl);
    valueEls[it.id] = { el: el, valEl: valEl, unitEl: unitEl, item: it };
    return el;
  }

  function buildComponent(it) {
    var el = tileBase(it);
    el.style.overflow = 'visible';
    var body = h('div', { style: { position: 'absolute', inset: 0, overflow: 'visible' } });
    el.appendChild(body);
    var reg = RD.BoardComps && RD.BoardComps[it.comp];
    if (reg && reg.build) {
      var env = {
        h: RD.BoardH.h,
        uid: RD.BoardH.uid,
        StdPipe: window.StdPipe,
        onControl: function (action, value) {
          var d = driver();
          if (d && d.onControl) d.onControl(it, action, value);
        }
      };
      try {
        var inst = reg.build(it, env);
        if (inst && inst.el) body.appendChild(inst.el);
        comps[it.id] = { item: it, inst: inst, bodyEl: body };
      } catch (e) {
        comps[it.id] = { item: it, inst: null, bodyEl: body, error: e };
        if (window.console && console.error) console.error('[pwr_board] build failed for ' + it.comp, e);
      }
    } else {
      // placeholder frame so the board still lays out if a module is missing
      body.appendChild(h('div', {
        style: { position: 'absolute', inset: 0, border: '1px dashed #3a4c58', borderRadius: '6px',
                 color: '#6b8598', fontFamily: MONO, fontSize: '10px', display: 'flex',
                 alignItems: 'center', justifyContent: 'center' }
      }, it.comp || 'component'));
      comps[it.id] = { item: it, inst: null, bodyEl: body, missing: true };
    }
    return el;
  }

  var BUILDERS = {
    box: buildBox, text: buildText, button: buildButton, scram: buildScram,
    number: buildNumber, value: buildValue, component: buildComponent
  };

  // ----------------------------------------------------------------- ports --
  function portXY(it, p) {
    if (p.edge === 'left') return { x: it.left, y: it.top + p.off, dir: 'left' };
    if (p.edge === 'right') return { x: it.left + it.width, y: it.top + p.off, dir: 'right' };
    if (p.edge === 'top') return { x: it.left + p.off, y: it.top, dir: 'up' };
    return { x: it.left + p.off, y: it.top + it.height, dir: 'down' };
  }

  function gridNudge(entries, g) {
    function res(c) { var m = ((c % g) + g) % g; if (m > g / 2) m -= g; return m; }
    function mean(a) { var s = 0; a.forEach(function (v) { s += v; }); return s / a.length; }
    return {
      dx: -mean(entries.map(function (e) { return res(e.rawx); })),
      dy: -mean(entries.map(function (e) { return res(e.rawy); }))
    };
  }

  function itemById(id) {
    var items = doc.items || [];
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  function scanPorts() {
    var m = stageScale();
    if (!m) return false;
    var g = doc.grid || 20;
    var found = {};
    var byItem = {};
    stage.querySelectorAll('[data-port]').forEach(function (el) {
      var t = el.closest('[data-item]');
      if (!t) return;
      var itemId = t.getAttribute('data-item');
      var r = el.getBoundingClientRect();
      var sx = ((r.left + r.right) / 2 - m.rect.left) / m.scale;
      var sy = ((r.top + r.bottom) / 2 - m.rect.top) / m.scale;
      var ap = nudge[itemId] || { dx: 0, dy: 0 };
      (byItem[itemId] = byItem[itemId] || []).push({
        key: itemId + '/' + el.getAttribute('data-port'),
        el: el,
        rawx: sx - ap.dx, rawy: sy - ap.dy,
        dir: el.getAttribute('data-dir') || 'right',
        size: el.getAttribute('data-size') || 'medium',
        phase: el.getAttribute('data-phase') || null,
        temp: el.getAttribute('data-temp') ? +el.getAttribute('data-temp') : null,
        fluid: el.getAttribute('data-fluid') || 'coldWater',
        out: el.getAttribute('data-out') === '1'
      });
    });
    var nextNudge = {};
    Object.keys(byItem).forEach(function (itemId) {
      var entries = byItem[itemId];
      var it = itemById(itemId);
      var nud = (it && NUDGE_KINDS[it.comp]) ? gridNudge(entries, g) : { dx: 0, dy: 0 };
      nextNudge[itemId] = nud;
      var rec = comps[itemId];
      if (rec && rec.bodyEl) {
        rec.bodyEl.style.transform = (Math.abs(nud.dx) < 0.05 && Math.abs(nud.dy) < 0.05)
          ? 'none' : 'translate(' + nud.dx.toFixed(2) + 'px,' + nud.dy.toFixed(2) + 'px)';
      }
      entries.forEach(function (e) {
        var bx = Math.round(e.rawx + nud.dx), by = Math.round(e.rawy + nud.dy);
        found[e.key] = { x: bx, y: by, dir: e.dir, size: e.size, phase: e.phase, temp: e.temp, fluid: e.fluid, out: e.out, el: e.el };
      });
    });
    nudge = nextNudge;
    (doc.items || []).forEach(function (it) {
      (it.ports || []).forEach(function (p) {
        var q = portXY(it, p);
        found[it.id + '/~' + p.id] = {
          x: q.x, y: q.y, dir: q.dir, size: p.size || 'medium',
          phase: p.phase || 'water', temp: p.temp == null ? 60 : p.temp,
          fluid: 'coolWater', out: !!p.out, el: null, user: true
        };
      });
    });
    var changed = JSON.stringify(strip(found)) !== JSON.stringify(strip(ports));
    ports = found;
    return changed;

    function strip(o) {
      var r = {};
      Object.keys(o).forEach(function (k) {
        var p = o[k];
        r[k] = [p.x, p.y, p.dir, p.size, p.out];
      });
      return r;
    }
  }

  // ----------------------------------------------------------------- pipes --
  function endPt(e) {
    if (typeof e === 'string') { var p = ports[e]; return p ? { x: p.x, y: p.y, port: p, key: e } : null; }
    return (e && typeof e === 'object') ? { x: e.x, y: e.y, junction: true } : null;
  }

  function portActive(key) {
    var p = ports[key];
    if (!p) return true;
    if (!p.el) return true;
    return p.el.getAttribute('data-active') !== '0';
  }

  function buildPipes() {
    if (!window.StdPipe) return;
    RD.BoardH.clear(underSvg);
    pipeFlow = [];
    var K = window.StdPipe.createKit(RD.BoardH.h);
    Object.keys(ports).forEach(function (key) {
      var p = ports[key];
      var fAng = (p.dir === 'up' || p.dir === 'down') ? 90 : 0;
      underSvg.appendChild(K.flange({ x: p.x, y: p.y, angle: fAng, d: STD_SIZES[p.size] || 8 }));
    });
    (doc.pipes || []).forEach(function (p) {
      var a = endPt(p.from), b = endPt(p.to);
      if (!a || !b) return;
      var pts = [[a.x, a.y]].concat(p.waypoints || []).concat([[b.x, b.y]]);
      var ap = a.port, bp = b.port;
      var flowDir = 1;
      if (ap && ap.out === true) flowDir = 1;
      else if (bp && bp.out === true) flowDir = -1;
      else if (ap && ap.out === false) flowDir = -1;
      if (p.flowDir === 'fwd') flowDir = 1;
      else if (p.flowDir === 'rev') flowDir = -1;
      var size = p.size || (ap && ap.size) || 'medium';
      var d = STD_SIZES[size] || 8;
      var fluidArg = p.phase ? { phase: p.phase, temp: p.temp } : p.fluid;
      var el = K.pipe({ points: pts, d: d, fluid: fluidArg, dir: flowDir });
      underSvg.appendChild(el);
      if (a.junction) underSvg.appendChild(K.junction({ x: a.x, y: a.y, d: d, fluid: fluidArg }));
      if (b.junction) underSvg.appendChild(K.junction({ x: b.x, y: b.y, d: d, fluid: fluidArg }));
      var flowEl = el.lastChild && el.lastChild.getAttribute && el.lastChild.getAttribute('stroke-dasharray') ? el.lastChild : null;
      pipeFlow.push({
        fromKey: typeof p.from === 'string' ? p.from : null,
        toKey: typeof p.to === 'string' ? p.to : null,
        flowEl: flowEl,
        anim: flowEl ? flowEl.style.animation : ''
      });
    });
    updatePipeFlowStates();
  }

  function updatePipeFlowStates() {
    pipeFlow.forEach(function (rec) {
      if (!rec.flowEl) return;
      var active = (!rec.fromKey || portActive(rec.fromKey)) && (!rec.toKey || portActive(rec.toKey));
      var want = active ? rec.anim : 'none';
      if (rec.flowEl.style.animation !== want) rec.flowEl.style.animation = want;
      rec.flowEl.style.opacity = active ? 0.92 : 0.25;
    });
  }

  // ------------------------------------------------------------ mount/api --
  function mount(hostEl, context) {
    unmount();
    host = hostEl;
    ctx = context || {};
    doc = window.RD_PWR_BOARD_DOC;
    if (!doc) return;
    host.innerHTML = '';
    wrap = h('div', { className: 'pwr-board-wrap' });
    stage = h('div', { className: 'pwr-board-stage' });
    underSvg = document.createElementNS(RD.BoardH.svgNS, 'svg');
    underSvg.setAttribute('width', CANVAS_W);
    underSvg.setAttribute('height', CANVAS_H);
    underSvg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none';
    stage.appendChild(underSvg);

    // stable z-ordering: boxes first (pipeTop boxes go under pipes via z-index -1),
    // then pipes svg (already appended), then everything else in doc order
    (doc.items || []).forEach(function (it) {
      var b = BUILDERS[it.kind];
      if (!b) return;
      var el = b(it);
      tiles[it.id] = el;
      stage.appendChild(el);
    });

    pausedEl = h('div', { className: 'pwr-board-paused' }, h('span', null, 'SIMULATION PAUSED'));
    wrap.appendChild(stage);
    wrap.appendChild(pausedEl);
    host.appendChild(wrap);

    var d = driver();
    if (d && d.onMount) d.onMount(doc, ctx, { tiles: tiles, buttons: buttonEls, numbers: numberEls, values: valueEls, comps: comps, stage: stage, wrap: wrap });

    ro = new ResizeObserver(function () { layout(); });
    ro.observe(wrap);
    layout();

    // Ports need the DOM laid out; scan on the next frame, re-scan shortly after
    // (fonts/flange scale settle), rebuild pipes when positions change.
    requestAnimationFrame(function () {
      scanPorts();
      buildPipes();
      scanTimer = setTimeout(function () {
        if (scanPorts()) buildPipes();
        scanTimer = null;
      }, 350);
    });
  }

  function unmount() {
    if (ro) { ro.disconnect(); ro = null; }
    if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
    Object.keys(scramEls).forEach(function (k) { clearTimeout(scramEls[k].timer); });
    Object.keys(comps).forEach(function (k) {
      var inst = comps[k].inst;
      if (inst && inst.destroy) { try { inst.destroy(); } catch (e) {} }
    });
    if (host) host.innerHTML = '';
    host = null; wrap = null; stage = null; underSvg = null; pausedEl = null;
    comps = {}; tiles = {}; valueEls = {}; buttonEls = {}; numberEls = {}; scramEls = {};
    ports = {}; nudge = {}; pipeFlow = []; lastSnap = null;
  }

  function render(s) {
    if (!stage || !s) return;
    lastSnap = s;
    var d = driver();

    // pause freeze
    var running = !(s.metadata && s.metadata.running === false);
    pausedEl.className = 'pwr-board-paused' + (running ? '' : ' on');
    if (running) stage.classList.remove('bd-frozen'); else stage.classList.add('bd-frozen');

    if (d) {
      // values
      Object.keys(valueEls).forEach(function (id) {
        var rec = valueEls[id];
        var out = d.valueFor ? d.valueFor(rec.item, s) : null;
        if (out == null) return;
        var text = typeof out === 'object' ? out.text : out;
        if (rec.valEl.nodeValue !== text) rec.valEl.nodeValue = text;
        if (typeof out === 'object') {
          if (out.unit != null && rec.unitEl.textContent !== out.unit) rec.unitEl.textContent = out.unit;
          if (out.color && rec.el.style.color !== out.color) rec.el.style.color = out.color;
        }
      });
      // numbers reflect sim state unless being edited
      Object.keys(numberEls).forEach(function (id) {
        var rec = numberEls[id];
        if (rec.editing) return;
        var v = d.numberFor ? d.numberFor(rec.item, s) : null;
        if (v == null || isNaN(v)) return;
        var str = v.toFixed(rec.digits);
        if (rec.input.value !== str) rec.input.value = str;
      });
      // button select/disable states
      Object.keys(buttonEls).forEach(function (id) {
        var btn = buttonEls[id];
        var it = itemById(id);
        var on = d.buttonActive ? !!d.buttonActive(it, s) : false;
        btn.classList.toggle('bd-active', on);
        var dis = d.buttonDisabled ? !!d.buttonDisabled(it, s) : false;
        if (btn.disabled !== dis) btn.disabled = dis;
      });
      // components
      Object.keys(comps).forEach(function (id) {
        var rec = comps[id];
        if (!rec.inst || !rec.inst.update) return;
        var props = d.compProps ? d.compProps(rec.item, s) : null;
        if (props) rec.inst.update(props);
      });
      // scram buttons: fired state tracks the plant
      Object.keys(scramEls).forEach(function (id) {
        var rec = scramEls[id];
        var fired = d.scramFired ? !!d.scramFired(s) : false;
        var want = fired ? 'fired' : (rec.state === 'fired' ? 'idle' : rec.state);
        if (want !== rec.state) { rec.state = want; paintScram(rec, rec.item); }
      });
      if (d.afterRender) d.afterRender(s);
    }
    updatePipeFlowStates();
  }

  RD.PwrBoard = {
    mount: mount,
    unmount: unmount,
    render: render,
    isMounted: function () { return !!stage; },
    refreshLayout: function () { layout(); if (scanPorts()) buildPipes(); },
    rescanPorts: function () { if (scanPorts()) buildPipes(); },
    ports: function () { return ports; },
    lastSnapshot: function () { return lastSnap; }
  };
})();
