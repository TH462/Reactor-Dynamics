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
  var BD_NUM_AUTO_COLOR = '#6b7d8a';   // greyed number = auto-driven (not operator-editable); cyan = editable

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
  var pipeTempEls = [];  // [{id, phase, boreEl, flowEl}] — pipes whose fluid color tracks live temp
  var ro = null, scanTimer = null, lastSnap = null;
  var releaseHandler = null;   // board-wide pointerup/cancel/blur → ends any held momentary button

  function driver() { return RD.PwrBoardDriver || null; }
  function h() { return RD.BoardH.h.apply(null, arguments); }

  // ---------------------------------------------------------------- layout --
  // A tile's world-space footprint. `value` tiles are RIGHT-anchored (CSS
  // translateX(-100%)) and auto-width — their doc `width` is a builder hint, not
  // their footprint — so measure the rendered box (offset* ignores the stage's
  // scale transform, so it is already in world units) and fall back to the doc
  // geometry before the first paint.
  function itemBox(it) {
    var el = tiles[it.id];
    var w = it.width || 120, hh = it.height || 40;
    if (el && el.offsetWidth) { w = el.offsetWidth; hh = el.offsetHeight || hh; }
    return it.kind === 'value'
      ? { l: it.left - w, t: it.top, r: it.left, b: it.top + hh }
      : { l: it.left, t: it.top, r: it.left + w, b: it.top + hh };
  }

  function contentBounds() {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    (doc.items || []).forEach(function (it) {
      var q = itemBox(it);
      if (q.l < minX) minX = q.l;
      if (q.t < minY) minY = q.t;
      if (q.r > maxX) maxX = q.r;
      if (q.b > maxY) maxY = q.b;
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

  /* --------------------------------------------- elastic PWR grid columns --
     In the 3-column PWR layout the diagram track is `1fr`, so on a short-and-wide
     window (2560x1080, any un-maximized landscape window) the board fits to HEIGHT
     and letterboxes — hundreds of px of dead space beside it while the alarms/trend
     and simulator columns stay pinned at their base widths.

     fitColumns measures that dead space and hands it to those two columns (as the
     --midcol-w / --simcol-w maxima the grid template reads), up to a cap past which
     they are just whitespace themselves. Handing width away narrows the diagram
     track by the same amount, so the next pass measures ~0 slack and settles; the
     1.5px deadband keeps the ResizeObserver from chattering. Negative slack (the
     columns hold width the board now needs) flows back the same way. */
  var MIDCOL_BASE = 340, MIDCOL_MAX = 860;             // alarms + strip chart
  var MIDCOL_SOLO_BASE = 700, MIDCOL_SOLO_MAX = 1200;  // …when ⛶ hides the simulator column
  var SIMCOL_BASE = 360, SIMCOL_MAX = 520;             // simulator / tools / instructor / scanner
  var MIDCOL_SHARE = 0.55;   // the trend/alarm column gets the larger half

  function cssPx(app, name, fallback) {
    var v = parseFloat(app.style.getPropertyValue(name));
    return isFinite(v) ? v : fallback;
  }

  function fitColumns(app, r, b) {
    var solo = app.classList.contains('sim-hidden');   // ⛶ — no simulator column
    var midBase = solo ? MIDCOL_SOLO_BASE : MIDCOL_BASE;
    var midMax = solo ? MIDCOL_SOLO_MAX : MIDCOL_MAX;
    var simBase = solo ? 0 : SIMCOL_BASE;
    var simMax = solo ? 0 : SIMCOL_MAX;
    // clamp the carried-over values to THIS mode's range — ⛶ swaps the bases, so
    // the width the other mode parked in the var may be out of range here
    var mid = Math.min(midMax, Math.max(midBase, cssPx(app, '--midcol-w', midBase)));
    var sim = Math.min(SIMCOL_MAX, Math.max(SIMCOL_BASE, cssPx(app, '--simcol-w', SIMCOL_BASE)));
    // dead space beside the board once it is scaled to the available height
    var slack = r.width - r.height * (b.w / b.h);
    var total = Math.max(midBase + simBase,
                Math.min(midMax + simMax, mid + (solo ? 0 : sim) + slack));
    var grow = total - (midBase + simBase);
    var gSim = Math.min(simMax - simBase, grow * (1 - MIDCOL_SHARE));
    var gMid = Math.min(midMax - midBase, grow - gSim);
    gSim = Math.min(simMax - simBase, grow - gMid);   // hand back what mid capped out on
    var wantMid = Math.round(midBase + gMid), wantSim = Math.round(SIMCOL_BASE + gSim);
    if (Math.abs(wantMid - mid) > 1.5) app.style.setProperty('--midcol-w', wantMid + 'px');
    if (!solo && Math.abs(wantSim - sim) > 1.5) app.style.setProperty('--simcol-w', wantSim + 'px');
  }

  function layout() {
    if (!wrap || !stage) return;
    // Lock the left column to the diagram: the board fills the available HEIGHT
    // and the plant-area is squeezed to the width the diagram needs at that
    // height, so there's no horizontal letterbox — the freed width flows to the
    // (stretching) right column. Skip when the columns stack on narrow screens
    // (max-width:860px) so the CSS width:100% wins there.
    var plant = wrap.closest('.plant-area');
    var stacked = typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 860px)').matches;
    var b = contentBounds();
    var r = wrap.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    if (plant && stacked) {
      if (plant.style.width) plant.style.width = '';   // revert to stacked CSS
    } else if (plant && plant.closest('.app.pwr-synoptic')) {
      // The PWR layout grids the columns explicitly — don't lock the plant width
      // to the diagram (that inline width would overflow the neighbouring
      // columns). Instead give the letterbox slack to the other two grid tracks.
      if (plant.style.width) { plant.style.width = ''; r = wrap.getBoundingClientRect(); }
      var app = plant.closest('.app.pwr-synoptic');
      if (!(typeof window.matchMedia === 'function' &&
            window.matchMedia('(max-width: 1200px)').matches)) {   // not the stacked template
        fitColumns(app, r, b);
        r = wrap.getBoundingClientRect();               // re-measure after the reflow
      }
    } else if (plant) {
      var wantW = r.height * (b.w / b.h);                     // diagram width at full height
      var chromeW = plant.getBoundingClientRect().width - r.width;  // padding/siblings
      var target = Math.round(wantW + chromeW);
      var cur = parseFloat(plant.style.width);
      if (target > 40 && (isNaN(cur) || Math.abs(cur - target) > 0.5)) {
        plant.style.width = target + 'px';
        r = wrap.getBoundingClientRect();               // re-measure after the resize
      }
    }
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

  // Show/hide a small count badge on a button. `val` null/''/0 → no badge.
  function setBadge(btn, val) {
    var show = val != null && val !== '' && val !== 0;
    var b = btn._bdBadge;
    if (!show) { if (b) b.style.display = 'none'; return; }
    if (!b) { b = h('span', { className: 'bd-badge' }); btn._bdBadge = b; btn.appendChild(b); }
    var txt = String(val);
    if (b.textContent !== txt) b.textContent = txt;
    b.style.display = '';
  }

  function buildButton(it) {
    var btn = h('button', { className: 'bd-btn' }, it.label || 'BUTTON');
    // The authored item color is the ACTIVE-state color; a button renders grey when
    // inactive (CSS default) and adopts --bd-color when selected (.bd-active) or pressed.
    btn.style.setProperty('--bd-color', it.color || '#4fe3ff');
    btn.style.fontSize = (it.fontSize || 11) + 'px';
    var d0 = driver();
    if (d0 && d0.buttonMomentary && d0.buttonMomentary(it)) {
      // Press-and-hold (momentary) button, e.g. the rod drive: pointerdown/keydown
      // begin the press; release is caught board-wide (see mount) so dragging off the
      // button still ends it. No click handler — that would double-fire on release.
      var down = function (e) {
        if (e) e.preventDefault();
        btn.classList.add('bd-pressed');
        var d = driver();
        if (d && d.onButtonDown) d.onButtonDown(it, btn);
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('keydown', function (e) {
        if (e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return;
        down(e);
      });
      btn.addEventListener('keyup', function (e) {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        endMomentary();
      });
    } else {
      btn.addEventListener('click', function () {
        var d = driver();
        if (d && d.onButton) d.onButton(it, btn);
      });
    }
    buttonEls[it.id] = btn;
    var el = tileBase(it);
    el.appendChild(btn);
    return el;
  }

  // Board-wide release for momentary (hold) buttons: a rod drive must stop on release
  // no matter where the pointer goes, so the up/cancel/blur listeners live on the
  // document (added in mount, removed in unmount), not on the button itself.
  function endMomentary() {
    Object.keys(buttonEls).forEach(function (k) { buttonEls[k].classList.remove('bd-pressed'); });
    var d = driver();
    if (d && d.onButtonUp) d.onButtonUp();
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
    var d0 = driver();
    if (d0 && d0.stepFor) { var so = d0.stepFor(it); if (so != null) step = so; }
    var editable = it.editable !== false;
    var input = h('input', { type: 'text', inputMode: 'decimal' });
    input.style.color = it.color || '#4fe3ff';
    input.style.fontSize = (it.fontSize || 10) + 'px';
    if (!editable) { input.readOnly = true; input.style.cursor = 'default'; }
    input.value = (it.value == null ? 0 : it.value).toFixed(digits);
    var rec = { input: input, item: it, editing: false, digits: digits };
    numberEls[it.id] = rec;

    function commit(v) {
      var d = driver();
      if (isNaN(v)) {                                    // empty / non-numeric: revert, don't command
        rec.editing = false;
        if (rec.preEdit != null) input.value = rec.preEdit;
        return;
      }
      // Clamp to the control's valid range and auto-correct an out-of-bounds entry to the
      // nearest acceptable value (both min and max). Bounds come from the plant driver.
      var b = d && d.boundsFor && d.boundsFor(it);
      if (b) { if (v < b[0]) v = b[0]; else if (v > b[1]) v = b[1]; }
      rec.editing = false;
      input.value = v.toFixed(digits);
      if (d && d.onNumber) d.onNumber(it, v);
    }
    input.addEventListener('focus', function () { rec.editing = true; rec.preEdit = input.value; });
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
    // Some pumps have dedicated control buttons/panels elsewhere on the board, so their
    // built-in control box is redundant AND its reserved space shifts the pump art (and
    // its ports) up, bending the connected pipes. The driver names those; render them
    // art-only by overriding showControls to false.
    var d0 = driver();
    if (d0 && d0.suppressBuiltInControls && d0.suppressBuiltInControls(it.id) && it.showControls !== false) {
      var clone = {}; for (var k in it) clone[k] = it[k];
      clone.showControls = false;
      it = clone;
    }
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
    pipeTempEls = [];
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
      // A pipe with an id whose driver supplies a live temp gets its fluid color
      // (bore = static fill, flow = moving line) repainted each snapshot. bore is the
      // 2nd stacked-stroke polyline (case, bore, flow) — see StdPipe.pipe().
      if (p.id && p.phase) {
        var boreEl = el.childNodes && el.childNodes[1] ? el.childNodes[1] : null;
        if (boreEl) pipeTempEls.push({ id: p.id, phase: p.phase, boreEl: boreEl, flowEl: flowEl });
      }
    });
    updatePipeFlowStates();
    if (lastSnap) updatePipeTemps(lastSnap);
  }

  // Repaint live-temperature pipes: driver.pipeTemp(id, s) → °C → StdPipe color ramp.
  function updatePipeTemps(s) {
    if (!s || !pipeTempEls.length || !window.StdPipe || !window.StdPipe.phaseTempColor) return;
    var d = driver();
    if (!d || !d.pipeTemp) return;
    for (var i = 0; i < pipeTempEls.length; i++) {
      var rec = pipeTempEls[i];
      var t = d.pipeTemp(rec.id, s);
      if (t == null || isNaN(t)) continue;
      var c = window.StdPipe.phaseTempColor(rec.phase, t);
      if (rec.boreEl) rec.boreEl.setAttribute('stroke', c.bore);
      if (rec.flowEl) rec.flowEl.setAttribute('stroke', c.flow);
    }
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
    // Driver-injected control tiles (kept in driver code so they survive board_data.js
    // regeneration). Appended once, deduped by id — mutating the shared doc is safe because
    // a second mount finds them already present. Must run before tiles are built below.
    var drv0 = driver();
    if (drv0 && drv0.extraItems) {
      var extra = drv0.extraItems() || [];
      for (var ei = 0; ei < extra.length; ei++) {
        if (!itemById(extra[ei].id)) doc.items.push(extra[ei]);
      }
    }
    host.innerHTML = '';
    wrap = h('div', { className: 'pwr-board-wrap' });
    stage = h('div', { className: 'pwr-board-stage' });
    underSvg = document.createElementNS(RD.BoardH.svgNS, 'svg');
    underSvg.setAttribute('width', CANVAS_W);
    underSvg.setAttribute('height', CANVAS_H);
    underSvg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none';
    stage.appendChild(underSvg);

    // Panel contents must sit above their (opaque) box regardless of authoring order —
    // e.g. the AFW box is authored AFTER its START/STOP/AUTO buttons and would paint over
    // them. Boxes stay at their base z (pipeTop -1, else 0) and components at 0 (so a
    // control panel authored over a vessel edge still covers it); buttons/values/text/
    // numbers/scram lift to z-index 1.
    var LIFT = { button: 1, value: 1, text: 1, number: 1, scram: 1 };
    (doc.items || []).forEach(function (it) {
      var b = BUILDERS[it.kind];
      if (!b) return;
      var el = b(it);
      // Lift lifted kinds AND clickable components (e.g. the accumulator isolation valve,
      // which sits inside the reactor-vessel tile's box) so a larger neighboring component's
      // transparent tile can't swallow their clicks.
      if (LIFT[it.kind] || (it.kind === 'component' && it.clickable)) el.style.zIndex = '1';
      // The reactor vessel is authored to sit IN FRONT of the CONTROL/SHUTDOWN GROUP rod
      // panels it overlaps (the vessel/CRDM art reads over them, not under). Lift it above
      // the panel contents; it has no interactive controls (showControls:false), so make it
      // click-through — the rod hold-buttons beneath it stay reachable.
      if (it.id === 'reactorVessel') { el.style.zIndex = '2'; el.style.pointerEvents = 'none'; }
      tiles[it.id] = el;
      stage.appendChild(el);
    });

    pausedEl = h('div', { className: 'pwr-board-paused' },
      h('div', { className: 'pwr-paused-box' }, [
        h('div', { className: 'pwr-paused-main' }, 'SIMULATION PAUSED'),
        h('div', { className: 'pwr-paused-sub' }, 'Press ▶ Play to start')
      ]));
    wrap.appendChild(stage);
    wrap.appendChild(pausedEl);
    host.appendChild(wrap);

    var d = driver();
    if (d && d.onMount) d.onMount(doc, ctx, { tiles: tiles, buttons: buttonEls, numbers: numberEls, values: valueEls, comps: comps, stage: stage, wrap: wrap });

    // Board-wide release for hold buttons — see endMomentary/buildButton.
    releaseHandler = function () { endMomentary(); };
    document.addEventListener('pointerup', releaseHandler);
    document.addEventListener('pointercancel', releaseHandler);
    window.addEventListener('blur', releaseHandler);

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
    // Release the diagram-locked width so the plant-area reverts to its flex sizing
    // (e.g. for the legacy RBMK/BWR views).
    if (wrap) { var pa = wrap.closest('.plant-area'); if (pa) pa.style.width = ''; }
    if (ro) { ro.disconnect(); ro = null; }
    if (releaseHandler) {
      document.removeEventListener('pointerup', releaseHandler);
      document.removeEventListener('pointercancel', releaseHandler);
      window.removeEventListener('blur', releaseHandler);
      releaseHandler = null;
    }
    if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
    Object.keys(scramEls).forEach(function (k) { clearTimeout(scramEls[k].timer); });
    Object.keys(comps).forEach(function (k) {
      var inst = comps[k].inst;
      if (inst && inst.destroy) { try { inst.destroy(); } catch (e) {} }
    });
    if (host) host.innerHTML = '';
    host = null; wrap = null; stage = null; underSvg = null; pausedEl = null;
    comps = {}; tiles = {}; valueEls = {}; buttonEls = {}; numberEls = {}; scramEls = {};
    ports = {}; nudge = {}; pipeFlow = []; pipeTempEls = []; lastSnap = null;
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
        // Cyan = the operator can type here; grey = the box is AUTO-driven right now, so a
        // manual entry would just be overwritten by the controller (see driver.numberAuto).
        var auto = d.numberAuto ? d.numberAuto(rec.item, s) : false;
        var col = auto ? BD_NUM_AUTO_COLOR : (rec.item.color || '#4fe3ff');
        if (rec._appliedCol !== col) { rec.input.style.color = col; rec._appliedCol = col; }
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
        // Warning (yellow) state — independent of the authored active color, for genuine
        // "needs attention" conditions on the green/yellow/red scale.
        var warn = d.buttonWarn ? !!d.buttonWarn(it, s) : false;
        btn.classList.toggle('bd-warn', warn);
        // Informational (grey) state — a neutral standing condition the operator set, e.g.
        // TRIP BLOCKS: grey (with a count badge) while trips are intentionally blocked.
        var info = d.buttonInfo ? !!d.buttonInfo(it, s) : false;
        btn.classList.toggle('bd-info', info);
        var badge = d.buttonBadge ? d.buttonBadge(it, s) : null;
        setBadge(btn, badge);
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
    updatePipeTemps(s);
  }

  RD.PwrBoard = {
    mount: mount,
    unmount: unmount,
    render: render,
    isMounted: function () { return !!stage; },
    // Programmatic momentary rod drive (keyboard ↑/↓) — delegates to the plant driver's
    // tap-or-hold machine so speed (S/M/F), tap-vs-hold and the pressed cue all match a click.
    driveRod: function (group, direction, down) { var d = driver(); return !!(d && d.driveRod && d.driveRod(group, direction, down)); },
    refreshLayout: function () { layout(); if (scanPorts()) buildPipes(); },
    rescanPorts: function () { if (scanPorts()) buildPipes(); },
    ports: function () { return ports; },
    lastSnapshot: function () { return lastSnap; },
    // Instructor-highlight hooks (parity with RD.PwrSynoptic). The driver owns the
    // control-label vocabulary; the renderer resolves it to a board tile to glow.
    revealControl: function (label) {
      var d = driver();
      if (!d || !d.controlLabelItem) return null;
      var id = d.controlLabelItem(label);
      return (id && tiles[id]) ? tiles[id] : null;
    },
    // The maintenance-tag prop (TMI-2): show/hide a TAGGED badge over the AFW valve tile.
    setTag: function (tagId, visible) {
      var d = driver();
      var id = d && d.tagItem ? d.tagItem() : null;
      var host = id && tiles[id];
      if (!host) return;
      var tag = host.querySelector('.bd-maint-tag');
      if (!!(tagId && visible)) {
        if (!tag) {
          tag = h('div', { className: 'bd-maint-tag bd-mono' }, 'TAGGED');
          host.appendChild(tag);
        }
        tag.style.display = '';
      } else if (tag) {
        tag.style.display = 'none';
      }
    },
    // Labels revealControl can resolve — every PWR beat highlight must name one.
    highlightLabels: (function () { var d = RD.PwrBoardDriver; return d && d.controlLabels ? d.controlLabels() : []; })()
  };
})();
