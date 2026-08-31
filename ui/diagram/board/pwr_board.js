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
  // Components whose ports must land ON grid lines, so the pipe runs drawn between
  // them stay straight. The Tee joins the list for the V2 diagram: all three of its
  // flange faces sit at R=10 from centre, i.e. exactly on its tile edges.
  var NUDGE_KINDS = { 'Pump': 1, 'Valve': 1, 'Valve Horizontal': 1, 'Valve Vertical': 1, 'Tee': 1, 'Cross': 1 };
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

     fitColumns measures that dead space and hands it to the simulator column (as the
     --simcol-w maximum the grid template reads), up to SIMCOL_MAX past which the column
     is just whitespace itself. Handing width away narrows the diagram track by the same
     amount, so the next pass measures ~0 slack and settles; the 1.5px deadband keeps the
     ResizeObserver from chattering. Negative slack (the column holds width the board now
     needs) flows back the same way. Since the V2 board there is no middle column — the
     trend/alarm strip lives under the diagram — so it is the only recipient. */
  // Two columns since the V2 board: diagram (with the trend/alarm strip beneath it) and the
  // simulator panel. The middle alarms/chart column is gone, so ALL of the letterbox slack
  // now goes to the sim column — see fitColumns.
  // SIMCOL_MAX was 900, which let the sim column swallow most of a wide window. Nothing in
  // that panel needs 900 px — past ~560 it is whitespace, and every pixel past it comes off
  // the diagram (see the feedback loop described on .bottom-row in shell.css). The operator
  // can still drag past this: the cap governs the AUTOMATIC fit, not the manual one.
  var SIMCOL_BASE = 360, SIMCOL_MAX = 560;   // simulator / tools / instructor / scanner
  var SIMCOL_DRAG_MAX = 900, BOTTOM_MIN = 150, BOTTOM_MAX = 520;

  // ---- manual panel sizing (splitters) ---------------------------------------------
  // Once the operator drags an edge, that axis is THEIRS: fitColumns must stop moving it,
  // or the next relayout would silently undo the drag. Persisted so the board opens the way
  // they left it.
  var SPLIT_KEY = 'RD_BOARD_SPLIT';
  var manual = (function () {
    try { return JSON.parse(localStorage.getItem(SPLIT_KEY) || '{}') || {}; } catch (e) { return {}; }
  })();
  function saveManual() {
    try { localStorage.setItem(SPLIT_KEY, JSON.stringify(manual)); } catch (e) {}
  }
  var splitV = null, splitH = null;

  function cssPx(app, name, fallback) {
    var v = parseFloat(app.style.getPropertyValue(name));
    return isFinite(v) ? v : fallback;
  }

  // The board scales to fit its column's HEIGHT, so a wide viewport leaves dead space to
  // the left and right of the diagram — it cannot use the extra width. Measure that slack
  // and hand it to the simulator column instead, which grows until either the slack is
  // gone (diagram now fills its column edge to edge) or the column hits SIMCOL_MAX.
  function fitColumns(app, r, b) {
    if (app.classList.contains('sim-hidden')) return;   // ⛶ — no column to give it to
    if (manual.simW != null) return;                    // operator dragged it; hands off
    var sim = Math.min(SIMCOL_MAX, Math.max(SIMCOL_BASE, cssPx(app, '--simcol-w', SIMCOL_BASE)));
    var slack = r.width - r.height * (b.w / b.h);
    var want = Math.round(Math.min(SIMCOL_MAX, Math.max(SIMCOL_BASE, sim + slack)));
    if (Math.abs(want - sim) > 1.5) app.style.setProperty('--simcol-w', want + 'px');
  }

  // Create the two drag handles once, and keep them sitting on the edges they resize.
  // They live on .app (not inside the diagram) because they straddle two grid tracks.
  function ensureSplitters(app) {
    if (!splitV) {
      splitV = h('div', { className: 'bd-split bd-split-v', title: 'Drag to resize the simulator panel — double-click to reset' });
      splitV.addEventListener('pointerdown', function (e) { beginDrag(e, app, 'v'); });
      splitV.addEventListener('dblclick', function () { resetSplit(app, 'v'); });
      app.appendChild(splitV);
    }
    if (!splitH) {
      splitH = h('div', { className: 'bd-split bd-split-h', title: 'Drag to resize the trend / alarm strip — double-click to reset' });
      splitH.addEventListener('pointerdown', function (e) { beginDrag(e, app, 'h'); });
      splitH.addEventListener('dblclick', function () { resetSplit(app, 'h'); });
      app.appendChild(splitH);
    }
  }

  function positionSplitters(app) {
    if (!splitV || !splitH) return;
    var ar = app.getBoundingClientRect();
    var right = app.querySelector('.right-col');
    if (right) {
      var rr = right.getBoundingClientRect();
      splitV.style.left = (rr.left - ar.left - 4.5) + 'px';
    }
    var bottom = app.querySelector('.plant-area > .bottom-row');
    if (bottom) {
      var br = bottom.getBoundingClientRect();
      splitH.style.top = (br.top - ar.top - 4.5) + 'px';
      splitH.style.left = (br.left - ar.left) + 'px';
      splitH.style.width = br.width + 'px';
    }
  }

  function beginDrag(e, app, axis) {
    e.preventDefault();
    var el = axis === 'v' ? splitV : splitH;
    el.classList.add('bd-dragging');
    el.setPointerCapture(e.pointerId);
    var ar = app.getBoundingClientRect();
    var startSim = cssPx(app, '--simcol-w', SIMCOL_BASE);
    var startBot = cssPx(app, '--bottomrow-h', 230);
    var x0 = e.clientX, y0 = e.clientY;
    function move(ev) {
      if (axis === 'v') {
        // Dragging LEFT widens the sim column (its inner edge moves left), so the delta
        // is inverted relative to pointer motion.
        var w = Math.max(320, Math.min(SIMCOL_DRAG_MAX, startSim - (ev.clientX - x0)));
        w = Math.min(w, ar.width - 420);      // never squeeze the diagram out of existence
        manual.simW = Math.round(w);
        app.style.setProperty('--simcol-w', manual.simW + 'px');
      } else {
        var hgt = Math.max(BOTTOM_MIN, Math.min(BOTTOM_MAX, startBot - (ev.clientY - y0)));
        hgt = Math.min(hgt, ar.height - 260);
        manual.bottomH = Math.round(hgt);
        app.style.setProperty('--bottomrow-h', manual.bottomH + 'px');
      }
      layout();
      /* the strip chart's lane split reads the live plot height — tell it the geometry
       * moved (app.js's debounced resize listener redraws; #509 item 4) */
      window.dispatchEvent(new Event('resize'));
    }
    function up(ev) {
      el.classList.remove('bd-dragging');
      try { el.releasePointerCapture(ev.pointerId); } catch (err) {}
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      saveManual();
      layout();
    }
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  /* CLAMP ON LOAD, not just on drag (#445). A persisted split is a number written by an
   * older layout: the right column lost the Scanner panel in #439 and the bottom row gained
   * the lane stack and the SOE ribbon in #440/#442, so a value saved before those is a
   * geometry that no longer exists. Re-clamping to the current bounds costs nothing and
   * turns "the board opened wrong after an update" into "the board opened at the nearest
   * legal size". */
  function applyManual(app) {
    if (manual.simW != null) {
      var w = Math.max(320, Math.min(SIMCOL_DRAG_MAX, manual.simW));
      if (w !== manual.simW) { manual.simW = w; saveManual(); }
      app.style.setProperty('--simcol-w', w + 'px');
    }
    if (manual.bottomH != null) {
      var hgt = Math.max(BOTTOM_MIN, Math.min(BOTTOM_MAX, manual.bottomH));
      if (hgt !== manual.bottomH) { manual.bottomH = hgt; saveManual(); }
      app.style.setProperty('--bottomrow-h', hgt + 'px');
    }
  }
  /* DOUBLE-CLICK RESETS THE AXIS (#445). Users will drag themselves into a corner — a
   * 900 px sim column, or a bottom strip taller than the board — and the way back has to be
   * obvious. Clearing the manual value also hands the axis back to fitColumns, which is the
   * state the board shipped in, not merely a remembered size. */
  function resetSplit(app, axis) {
    if (axis === 'v') { delete manual.simW; app.style.removeProperty('--simcol-w'); }
    else { delete manual.bottomH; app.style.removeProperty('--bottomrow-h'); }
    saveManual();
    layout();
    window.dispatchEvent(new Event('resize'));   /* chart lane split re-reads its height (#509 item 4) */
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
        ensureSplitters(app);
        applyManual(app);
        fitColumns(app, r, b);
        r = wrap.getBoundingClientRect();               // re-measure after the reflow
        positionSplitters(app);
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
    // marginTop clears the SCRAM word above it — the flex `gap` alone left the small caps
    // crowding the descender line of the big label, which read as one cramped block.
    var subEl = h('span', { style: { fontSize: '9px', letterSpacing: '0.16em', opacity: 0.85, marginTop: '3px' } }, 'PRESS TO ARM');
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
    // While SCRAMMED the sub-caption is the RPS-reset permissive (#75): whether pressing
    // will actually reset, or which condition is holding it. rec.note comes from the
    // driver each render; absent one the old unconditional "PRESS TO RESET" stands, which
    // is what every non-PWR board still gets.
    var note = fired ? (rec.note || null) : null;
    rec.labelEl.textContent = fired ? 'SCRAMMED' : (armed ? 'CONFIRM' : (it.label || 'SCRAM'));
    rec.subEl.textContent = fired ? (note ? note.text : 'PRESS TO RESET')
                                  : (armed ? 'PRESS AGAIN TO TRIP' : 'PRESS TO ARM');
    rec.btn.style.background = fired ? '#3a0e0e' : (armed ? '#5a1408' : '#0a2417');
    rec.btn.style.border = '3px solid ' + (fired ? '#ff5a4d' : (armed ? '#ffb400' : '#3d7a58'));
    rec.btn.style.color = fired ? '#ff7a6a' : (armed ? '#ffd166' : '#5a9575');
    rec.btn.style.animation = armed ? 'bdScramPulse 0.8s ease-in-out infinite' : 'none';
    // A blocked reset is dimmed rather than hidden — the operator can still press it and
    // get the full reason in the scanner bar, which is how they learn what to wait for.
    rec.subEl.style.opacity = (note && !note.ready) ? '0.6' : '0.85';
  }

  function buildNumber(it) {
    var el = tileBase(it, 'nohgt');
    var labEl = null;
    if (it.label) {
      var lab = h('div', null, it.label);
      // letter-spacing 0.06em, not 0.14em: at fontSize 14 the wide tracking alone put the
      // DUMP SETPOINT hint "29-1350 psi" ~7 px past its authored box (#235 finding 5)
      lab.style.cssText = 'color:#6b8598;font-family:' + MONO + ';font-size:' + (it.fontSize || 10) + 'px;letter-spacing:0.06em;margin-bottom:3px;white-space:nowrap';
      el.appendChild(lab);
      labEl = lab;
    }
    var d0 = driver();
    var digits = it.digits == null ? 0 : it.digits;
    if (d0 && d0.numberDigits) { var dgo = d0.numberDigits(it); if (dgo != null) digits = dgo; }
    var editable = it.editable !== false;
    var input = h('input', { type: 'text', inputMode: 'decimal' });
    input.style.color = it.color || '#4fe3ff';
    input.style.fontSize = (it.fontSize || 10) + 'px';
    if (!editable) { input.readOnly = true; input.style.cursor = 'default'; }
    input.value = (it.value == null ? 0 : it.value).toFixed(digits);
    var rec = { input: input, item: it, editing: false, digits: digits, labelEl: labEl };
    numberEls[it.id] = rec;
    // The ▲▼ step is read PER PRESS, not captured here: the display-unit layer (#238) can
    // change it under a mounted board when the operator switches units, and a captured step
    // would go on nudging 1 psi through a box now reading MPa.
    function stepSize() {
      var d = driver();
      var so = (d && d.stepFor) ? d.stepFor(it) : null;
      return so != null ? so : (it.step == null ? 1 : it.step);
    }

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
      input.value = v.toFixed(rec.digits);
      if (d && d.onNumber) d.onNumber(it, v);
    }
    input.addEventListener('focus', function () { rec.editing = true; rec.preEdit = input.value; });
    input.addEventListener('blur', function () { commit(parseFloat(input.value)); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') input.blur(); });

    var stepBox = h('div', { className: 'bd-num-steps' },
      h('button', { type: 'button', onClick: function () { commit((parseFloat(input.value) || 0) + stepSize()); } }, '▲'),
      h('button', { type: 'button', onClick: function () { commit((parseFloat(input.value) || 0) - stepSize()); } }, '▼'));

    var frame = h('div', { className: 'bd-num-frame' }, input);
    // The unit span is built when the item declares one, and it is a LIVE text node from
    // #238 on: the render loop rewrites it from driver.numberUnit so a units change reaches
    // the setpoint boxes and not only the readouts.
    if (it.unit) {
      var u = h('span', { className: 'bd-num-unit' }, it.unit);
      u.style.fontSize = Math.max(8, Math.round((it.fontSize || 10) * 0.9)) + 'px';
      frame.appendChild(u);
      rec.unitEl = u;
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

  // A `readout` is a labelled value: the caption and the reading travel as ONE item
  // instead of a `text` tile placed next to a `value` tile. Introduced by the V2
  // diagram for the three indications that sit away from their control card (steam
  // dump %, charging gpm, letdown gpm), where a separately-positioned caption would
  // drift if either tile moved. It registers in valueEls with the same record shape
  // as buildValue, so the driver drives it through VALUES with no special casing —
  // note `el` is the READING line, not the outer tile, so a driver-supplied colour
  // lands on the number and leaves the caption muted.
  function buildReadout(it) {
    var el = tileBase(it, 'nohgt');
    el.className += ' bd-readout';
    var labelEl = h('div', { className: 'bd-ro-label' }, it.label || '');
    // The caption is derived from the reading size, EXCEPT where an item overrides it.
    // `labelSize` exists for #350 item 27: the CVCS flow captions had to reach the 14 px of
    // the BORON STATUS caption beside them without the reading growing to 21 px to get there.
    labelEl.style.fontSize = (it.labelSize != null ? it.labelSize
      : Math.max(8, Math.round((it.fontSize || 16) * 0.66))) + 'px';

    var readEl = h('div', { className: 'bd-ro-read' });
    readEl.style.color = it.color || '#4fe3ff';
    readEl.style.fontSize = (it.fontSize || 16) + 'px';
    var valEl = document.createTextNode(it.value == null ? '' : String(it.value));
    var unitEl = h('span', { className: 'bd-unit' }, it.unit || '');
    unitEl.style.fontSize = Math.max(8, Math.round((it.fontSize || 16) * 0.68)) + 'px';
    readEl.appendChild(valEl);
    readEl.appendChild(document.createTextNode(' '));
    readEl.appendChild(unitEl);

    el.appendChild(labelEl);
    el.appendChild(readEl);
    valueEls[it.id] = { el: readEl, valEl: valEl, unitEl: unitEl, item: it };
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
    number: buildNumber, value: buildValue, readout: buildReadout, component: buildComponent
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
      // The authored `speed` was dropped here entirely before #231, which is half of why
      // fittings and pipes disagreed. Canvas pipes are already in world coordinates, so
      // they need no phaseX/phaseY — StdPipe anchors their dash grid directly.
      var el = K.pipe({ points: pts, d: d, fluid: fluidArg, dir: flowDir, speed: p.speed });
      underSvg.appendChild(el);
      if (a.junction) underSvg.appendChild(K.junction({ x: a.x, y: a.y, d: d, fluid: fluidArg }));
      if (b.junction) underSvg.appendChild(K.junction({ x: b.x, y: b.y, d: d, fluid: fluidArg }));
      var flowEl = el.lastChild && el.lastChild.getAttribute && el.lastChild.getAttribute('stroke-dasharray') ? el.lastChild : null;
      pipeFlow.push({
        id: p.id || null,
        fromKey: typeof p.from === 'string' ? p.from : null,
        toKey: typeof p.to === 'string' ? p.to : null,
        flowEl: flowEl
      });
      // A pipe with an id whose driver supplies a live temp gets its fluid color
      // (bore = static fill, flow = moving line) repainted each snapshot. bore is the
      // 2nd stacked-stroke polyline (case, bore, flow) — see StdPipe.pipe().
      if (p.id && p.phase) {
        var boreEl = el.childNodes && el.childNodes[1] ? el.childNodes[1] : null;
        if (boreEl) pipeTempEls.push({ id: p.id, phase: p.phase, boreEl: boreEl, flowEl: flowEl });
      }
    });
    updatePipeFlowStates(lastSnap);
    if (lastSnap) updatePipeTemps(lastSnap);
  }

  // Repaint live-temperature pipes: driver.pipeTemp(id, s) → °C → StdPipe color ramp.
  //
  // The PHASE can also be live (#350 item 6): a pipe whose driver reports one takes it over
  // the authored `p.phase`, so the PORV relief run paints steam while the pressurizer has a
  // bubble and water once it goes solid. Falls back to the authored phase, so a pipe with no
  // live phase behaves exactly as before.
  function updatePipeTemps(s) {
    if (!s || !pipeTempEls.length || !window.StdPipe || !window.StdPipe.phaseTempColor) return;
    var d = driver();
    if (!d || !d.pipeTemp) return;
    for (var i = 0; i < pipeTempEls.length; i++) {
      var rec = pipeTempEls[i];
      var t = d.pipeTemp(rec.id, s);
      if (t == null || isNaN(t)) continue;
      var lf = (d.pipeFlow && rec.id) ? d.pipeFlow(rec.id, s) : null;
      var phase = (lf && lf.phase) ? lf.phase : rec.phase;
      var c = window.StdPipe.phaseTempColor(phase, t);
      if (rec.boreEl) rec.boreEl.setAttribute('stroke', c.bore);
      if (rec.flowEl) rec.flowEl.setAttribute('stroke', c.flow);
    }
  }

  // Stop/start a pipe's dashes with animation-PLAY-STATE. Since 2026-08-31 there is no CSS
  // animation behind it — StdPipe's shared ~24 Hz clock reads this inline style as the
  // per-line hold flag (and pipeFlowState() below reads it back), so the property is still
  // the one true switch. Pausing leaves the dashes where they stopped; resuming rejoins the
  // SHARED clock, so a resumed line lands back on the #233 world grid rather than a private
  // phase. The board-wide freeze (.bd-frozen) holds the whole clock instead.
  //
  // Since #350 a pipe can ALSO be stilled, re-timed or reversed by its own driver entry
  // (`pipeFlow`), independently of the components at its ends. The two gates are ANDed: a
  // line is only running when both ends are active AND its own system is carrying flow.
  // That is what closes items 9 and 14 — the AFW-tee-to-SG segment and the circulating-water
  // runs both sit between two ports that report active while the train behind them is dead,
  // so the port gate alone could never still them.
  function updatePipeFlowStates(s) {
    var d = driver();
    var live = !!(d && d.pipeFlow && s);
    pipeFlow.forEach(function (rec) {
      if (!rec.flowEl) return;
      var active = (!rec.fromKey || portActive(rec.fromKey)) && (!rec.toKey || portActive(rec.toKey));
      var lf = (live && rec.id) ? d.pipeFlow(rec.id, s) : null;
      if (lf) {
        // AUTHORITATIVE, not merely ANDed with the port gate. The driver's entry is that
        // line's OWN measured flow (one system per run — see PIPE_SYSTEM), which is strictly
        // better evidence than "the fitting at each end thinks it is passing something".
        // It has to replace the port gate rather than join it, because item 18 is exactly the
        // case where they disagree and the driver is right: with the RCPs stopped the pump art
        // correctly reads STOPPED and pulls its ports down, while `rcs_flow` still measures
        // 4.5 % of buoyancy-driven flow through those same pipes.
        active = !!lf.active;
        // Re-time only when the band actually moved. setFlowSpeed rewrites the delay, and
        // doing that every snapshot on an unchanged speed would re-seat the phase ~10x a
        // second — cheap, but it makes the dashes stand still under time acceleration.
        var key = lf.speed + '|' + (lf.dir < 0 ? 'r' : 'f');
        if (key !== rec.flowKey) {
          rec.flowKey = key;
          if (lf.speed > 0) window.StdPipe.setFlowSpeed(rec.flowEl, lf.speed, lf.dir < 0);
        }
      }
      rec.flowEl.style.animationPlayState = active ? 'running' : 'paused';
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
    // Absolute geometry corrections to the generated doc, applied before anything is built.
    // See the driver's DOC_PATCHES for why these live in code rather than in board_data.
    if (drv0 && drv0.docPatches) drv0.docPatches(doc);
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
    var LIFT = { button: 1, value: 1, readout: 1, text: 1, number: 1, scram: 1 };
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

    /* THE "SIMULATION PAUSED" VEIL WAS REMOVED 2026-08-11 *(OWNER DIRECTIVE: "Remove the
     * sim paused popup at the start. Sim should start running not paused. The plant
     * selection menu has replaced its function.")*.
     *
     * It was a full-board curtain that existed because the plant used to load stopped and
     * needed to say so. The plant now loads RUNNING, and the Plant & Mission window is
     * what a cold load opens on, so the veil's whole job is done by something else. Its
     * two affordances survive elsewhere and are NOT lost: click-to-resume is the ▶ button
     * (which now flashes while paused, so the cue moved rather than vanished), and the
     * quick tour is on the Help menu, which is where it was always also offered.
     *
     * `pausedEl` stays declared and null. Every reference to it is guarded, and a null is
     * a smaller change than deleting a variable five call sites read. */
    pausedEl = null;
    wrap.appendChild(stage);
    // (the paused veil used to be appended here — removed 2026-08-11, see above)
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
    // The splitters are parented to .app, not to host, so host.innerHTML='' below does not
    // reach them — remove them explicitly or a plant switch leaves dead handles behind.
    [splitV, splitH].forEach(function (el) { if (el && el.parentNode) el.parentNode.removeChild(el); });
    splitV = null; splitH = null;
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

  /* Freeze/unfreeze the board. Split out of render() 2026-08-11 because the thing that
   * needs it most — a pause — is precisely when render() stops being called. `.bd-frozen`
   * carries `animation-play-state: paused !important` across the whole stage subtree, so
   * one class settles every animation including the SVG pipe dashes, which set their own
   * inline play state and would otherwise win. */
  function setRunning(running) {
    if (!stage) return;
    if (pausedEl) pausedEl.className = 'pwr-board-paused' + (running ? '' : ' on');
    if (running) stage.classList.remove('bd-frozen'); else stage.classList.add('bd-frozen');
  }

  function render(s) {
    if (!stage || !s) return;
    lastSnap = s;
    var d = driver();

    // Pause freeze. Snapshot-driven, and NOT the only driver: a pause stops the
    // broadcast, so this path never runs at the moment it matters most. The shell
    // pushes setRunning() directly on every play/pause. See setRunning below.
    setRunning(!(s.metadata && s.metadata.running === false));

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
        // Amber (driver.numberWarn, #358) outranks both: the demand in the box is not being
        // delivered by the plant, which matters more than who is allowed to type it.
        var auto = d.numberAuto ? d.numberAuto(rec.item, s) : false;
        var warn = d.numberWarn ? d.numberWarn(rec.item, s) : null;
        var col = warn || (auto ? BD_NUM_AUTO_COLOR : (rec.item.color || '#4fe3ff'));
        if (rec._appliedCol !== col) { rec.input.style.color = col; rec._appliedCol = col; }
        // Disabled outranks everything: the running engine has no machinery behind this box
        // (#506 — the mirror of buttonDisabled below; same honest-absent rule).
        var ndis = d.numberDisabled ? !!d.numberDisabled(rec.item, s) : false;
        if (rec.input.disabled !== ndis) rec.input.disabled = ndis;
        // Display unit, resolution and range hint (#238). Driven every frame like the value
        // itself, because a units change is not an event the board is told about — it just
        // renders again. All three are no-ops in US, where the driver hands back exactly what
        // the item was authored with. Resolution is applied even mid-edit (it only changes
        // how the NEXT reflected value is formatted), the value itself is not.
        if (d.numberDigits) {
          var dg = d.numberDigits(rec.item);
          if (dg != null && dg !== rec.digits) rec.digits = dg;
        }
        if (rec.unitEl && d.numberUnit) {
          var nu = d.numberUnit(rec.item);
          if (nu != null && rec.unitEl.textContent !== nu) rec.unitEl.textContent = nu;
        }
        if (rec.labelEl && d.numberHint) {
          var nh = d.numberHint(rec.item);
          if (nh != null && rec.labelEl.textContent !== nh) rec.labelEl.textContent = nh;
        }
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
        // Actuated (amber) state (#512, owner design) — a PROTECTION latch is holding this
        // system: distinct from bd-warn ("needs attention") and bd-active (a selection).
        // The panel's own securing click is the unlatch, refused while the signal is live.
        var act = d.buttonActuated ? !!d.buttonActuated(it, s) : false;
        btn.classList.toggle('bd-actuated', act);
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
        // The reset permissive can change WITHOUT the fired state changing — rods seating,
        // a trip signal clearing — so the note is compared on its own. Repainting only on
        // a state transition would freeze the caption at whatever it read the instant the
        // scram latched, which is exactly the case the operator is waiting on.
        var note = (fired && d.scramResetNote) ? d.scramResetNote(s) : null;
        var noteKey = note ? note.text + '|' + note.ready : '';
        if (want !== rec.state || noteKey !== rec.noteKey) {
          rec.state = want; rec.note = note; rec.noteKey = noteKey;
          paintScram(rec, rec.item);
        }
      });
      if (d.afterRender) d.afterRender(s);
    }
    updatePipeFlowStates(s);
    updatePipeTemps(s);
  }

  RD.PwrBoard = {
    mount: mount,
    unmount: unmount,
    render: render,
    isMounted: function () { return !!stage; },
    // The shell pushes play/pause here — see setRunning's header for why render() cannot.
    setRunning: setRunning,
    // Programmatic momentary rod drive (keyboard ↑/↓) — delegates to the plant driver's
    // tap-or-hold machine so speed (S/M/F), tap-vs-hold and the pressed cue all match a click.
    driveRod: function (group, direction, down) { var d = driver(); return !!(d && d.driveRod && d.driveRod(group, direction, down)); },
    refreshLayout: function () { layout(); if (scanPorts()) buildPipes(); },
    rescanPorts: function () { if (scanPorts()) buildPipes(); },
    ports: function () { return ports; },
    // A pipe's dash animation state ('running' | 'paused') by pipe id, for the
    // board_check pins — #236's findings all rendered as PASS while the harness
    // asserted existence but never animation-vs-plant-state.
    pipeFlowState: function (id) {
      for (var i = 0; i < pipeFlow.length; i++) {
        if (pipeFlow[i].id === id && pipeFlow[i].flowEl) {
          return pipeFlow[i].flowEl.style.animationPlayState || 'running';
        }
      }
      return null;
    },
    lastSnapshot: function () { return lastSnap; },
    // A mounted component's own instance, for harnesses that need to drive one directly
    // rather than through a snapshot. Added 2026-08-06 for board_check's vital-gauge
    // sparkline pins: those assert the TRACE MATHS (bucket decimation, rigid scrolling,
    // held axis, behaviour at 3600x), and going through `render()` would make the input a
    // moving plant and every assertion timing-dependent. Same category as `ports()` and
    // `lastSnapshot()` — a read accessor for the test harness, not a control path.
    componentInstance: function (id) {
      var rec = comps[id];
      return rec ? rec.inst : null;
    },
    // Instructor-highlight hooks. The driver owns the control-label vocabulary;
    // the renderer resolves it to a board tile to glow.
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
    highlightLabels: (function () { var d = RD.PwrBoardDriver; return d && d.controlLabels ? d.controlLabels() : []; })(),

    // ---- inspection (#96) ------------------------------------------------
    // What an item IS, for the inspection block. The driver owns the copy (it is
    // plant knowledge); the renderer only resolves elements to item ids.
    inspect: function (id) { var d = driver(); return (d && d.inspectItem) ? d.inspectItem(id) : null; },
    // Live automation-channel status for an item (#214), or null. Unlike inspect(),
    // this is a function of the SNAPSHOT, so the caller has to re-ask it per broadcast
    // — a value resolved once on pointer-over would freeze the moment the pointer did.
    liveNote: function (id, s) { var d = driver(); return (d && d.liveNote) ? d.liveNote(id, s) : null; },
    // The item id under a DOM node, or null. Tiles carry data-item, so a click
    // target anywhere inside a control resolves to the control it belongs to.
    itemIdFor: function (el) {
      if (!el || !stage || !el.closest) return null;
      var tile = el.closest('[data-item]');
      return (tile && stage.contains(tile)) ? tile.getAttribute('data-item') : null;
    },
    // Geometric hit test, in client coordinates → item id. The DOM cannot answer
    // for every object on the board: the reactor vessel is deliberately
    // pointer-events:none so the rod buttons it overlaps stay clickable
    // (buildStage), and it is the single most inspectable thing on the mimic.
    // Resolve those by geometry instead, honouring the same paint order the
    // stage uses (authored z, then authoring order) so the topmost item wins.
    itemIdAt: function (clientX, clientY) {
      var ss = stage && stageScale();
      if (!ss) return null;
      var x = (clientX - ss.rect.left) / ss.scale, y = (clientY - ss.rect.top) / ss.scale;
      if (x < 0 || y < 0 || x > CANVAS_W || y > CANVAS_H) return null;
      var best = null, bestKey = -Infinity, list = (doc && doc.items) || [];
      for (var i = 0; i < list.length; i++) {
        var it = list[i], w = it.width || 0, hgt = it.height || 0;
        if (!w || !hgt) continue;                        // text/value tiles are auto-sized
        if (x < it.left || x > it.left + w || y < it.top || y > it.top + hgt) continue;
        var el = tiles[it.id];
        var z = el && el.style.zIndex ? parseFloat(el.style.zIndex) : 0;
        var key = z * 1e4 + i;                           // paint order: z first, then authoring order
        if (key > bestKey) { bestKey = key; best = it.id; }
      }
      return best;
    },
    // The tile element for an item id — the thing the inspection glow goes on.
    tileFor: function (id) { return (id && tiles[id]) || null; }
  };
})();
