/*
 * one_over_m.js — the 1/M startup plot (PWR approach-to-criticality tool).
 *
 * A DRAGGABLE window (the first in the app — RD.makeDraggable is exported for
 * reuse): the operator's inverse-multiplication scratchpad. Procedure:
 *   1. Shut down, before pulling rods: press PLOT — the baseline count C0 is
 *      captured from the source-range INSTRUMENT (HR1) and plotted as 1.0 at
 *      the current rod position.
 *   2. Withdraw a few steps, stop, wait for the count rate to stabilize, press
 *      PLOT again: the point (rod steps withdrawn, C0/C) lands and — with two or
 *      more points — a line through the LATEST points extrapolates to y = 0.
 *   3. Repeat as you approach: where the line meets zero is the predicted
 *      critical rod position. It tightens each plot — extrapolate from the
 *      newest points and re-plot in small steps, never the whole history (see
 *      fit(): early low-worth points would bias the prediction to the danger
 *      side, overstating your margin to criticality).
 *
 * Session tool by design: the table is the operator's scratchpad, not plant
 * state — it is NOT in save files, and it clears itself on plant change,
 * reset, or rewind past the last captured point. Works while paused (reads
 * the latest snapshot).
 *
 * Attaches RD.OneOverM ({ init, open, close, tick }) and RD.makeDraggable.
 */
;(function (RD) {
  'use strict';

  // ---- generic draggable-window helper (pointer capture; viewport clamped) ----
  function makeDraggable(win, handle) {
    var sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    handle.style.cursor = 'move';
    handle.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) return;   // titlebar buttons still click
      dragging = true;
      var r = win.getBoundingClientRect();
      ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var x = ox + (e.clientX - sx), y = oy + (e.clientY - sy);
      x = Math.max(0, Math.min(window.innerWidth - 80, x));
      y = Math.max(0, Math.min(window.innerHeight - 40, y));
      win.style.left = x + 'px'; win.style.top = y + 'px';
      win.style.right = 'auto'; win.style.bottom = 'auto';
    });
    function release() { dragging = false; }
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
  }

  // ------------------------------------------------------------------ state
  var getSnap = null;        // () => latest snapshot
  var win = null, svg = null, msgEl = null;
  var points = [];           // [{ x: rod fraction withdrawn 0–1, counts, y: C0/counts }]
  var C0 = null;
  var maxSteps = 912;        // control-group full-withdrawal steps (for the steps axis; self-updates from the snapshot on plot)
  var lastPlant = null, lastCaptureT = null;

  // Plot geometry (viewBox units).
  var W = 340, H = 240, L = 40, R = 12, T = 14, B = 30;
  function px(x) { return L + x * (W - L - R); }               // x: 0..1 fraction withdrawn
  function py(y) { return T + (1.1 - y) / 1.1 * (H - T - B); } // y: 0..1.1 (C0/C)

  function controlGroup(s) {
    var gs = (s.control_state && s.control_state.rod_groups) || [];
    for (var i = 0; i < gs.length; i++) if (gs[i].function === 'control') return gs[i];
    return null;
  }

  // Least squares over the TRAILING window (the points nearest criticality) →
  // { a, b, x0 } for y = a + b·x, where x0 is the leading point of the window.
  //
  // Real 1/M practice extrapolates from the LATEST points, not the whole
  // history. The early points sit where the rods are barely withdrawn — the flat
  // toe of the S-shaped rod-worth curve, where differential worth ≈ 0 and 1/M
  // hardly moves. Averaging them into the fit flattens the slope and throws the
  // predicted critical position far PAST actual (the danger side: it tells the
  // operator they have ~2× the margin they really do). Fitting only the trailing
  // window tracks the local slope and tightens toward the true point each plot.
  var FIT_WINDOW = 3;
  function fit() {
    if (points.length < 2) return null;
    var pts = points.slice(Math.max(0, points.length - FIT_WINDOW));
    var n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach(function (p) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; });
    var mx = sx / n, my = sy / n;
    var den = sxx - n * mx * mx;
    if (Math.abs(den) < 1e-9) return null;
    var b = (sxy - n * mx * my) / den;
    return { a: my - b * mx, b: b, x0: pts[0].x };
  }

  function setMsg(text, warn) {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.classList.toggle('warn', !!warn);
  }

  // ------------------------------------------------------------------ render
  function render() {
    if (!svg) return;
    var h = '';
    // frame + gridlines
    h += '<rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '" class="oom-frame"/>';
    [0.25, 0.5, 0.75, 1.0].forEach(function (g) {
      h += '<line x1="' + px(g) + '" y1="' + T + '" x2="' + px(g) + '" y2="' + (H - B) + '" class="oom-grid"/>';
      h += '<text x="' + px(g) + '" y="' + (H - B + 12) + '" class="oom-tick" text-anchor="middle">' + Math.round(g * maxSteps) + '</text>';
    });
    [0.25, 0.5, 0.75, 1.0].forEach(function (g) {
      h += '<line x1="' + L + '" y1="' + py(g) + '" x2="' + (W - R) + '" y2="' + py(g) + '" class="oom-grid"/>';
      h += '<text x="' + (L - 4) + '" y="' + (py(g) + 3) + '" class="oom-tick" text-anchor="end">' + g.toFixed(2) + '</text>';
    });
    // zero line (the criticality axis)
    h += '<line x1="' + L + '" y1="' + py(0) + '" x2="' + (W - R) + '" y2="' + py(0) + '" class="oom-zero"/>';
    h += '<text x="' + (L - 4) + '" y="' + (py(0) + 3) + '" class="oom-tick" text-anchor="end">0</text>';
    // axis labels
    h += '<text x="' + ((L + W - R) / 2) + '" y="' + (H - 4) + '" class="oom-lab" text-anchor="middle">rod position (steps withdrawn)</text>';
    h += '<text x="10" y="' + ((T + H - B) / 2) + '" class="oom-lab" text-anchor="middle" transform="rotate(-90 10 ' + ((T + H - B) / 2) + ')">1/M  (C₀/C)</text>';

    // fit line, extrapolated to y=0
    var f = fit(), pred = null;
    if (f && f.b < -1e-6) {
      var xc = -f.a / f.b;
      var xEnd = Math.min(Math.max(xc, points[points.length - 1].x), 1.0);
      h += '<line x1="' + px(f.x0) + '" y1="' + py(f.a + f.b * f.x0) + '" x2="' + px(xEnd) + '" y2="' + py(f.a + f.b * xEnd) + '" class="oom-fit"/>';
      if (xc > points[points.length - 1].x - 1e-9 && xc <= 1.2) {
        pred = xc;
        if (xc <= 1.0) {
          h += '<line x1="' + px(xc) + '" y1="' + T + '" x2="' + px(xc) + '" y2="' + (H - B) + '" class="oom-crit"/>';
          h += '<text x="' + px(Math.min(xc, 0.88)) + '" y="' + (T + 10) + '" class="oom-critlab" text-anchor="middle">critical ' + Math.round(xc * maxSteps) + '</text>';
        }
      }
    }
    // points (baseline square, later captures circles)
    points.forEach(function (p, i) {
      h += i === 0
        ? '<rect x="' + (px(p.x) - 3) + '" y="' + (py(p.y) - 3) + '" width="6" height="6" class="oom-pt"/>'
        : '<circle cx="' + px(p.x) + '" cy="' + py(p.y) + '" r="3.2" class="oom-pt"/>';
    });
    svg.innerHTML = h;

    // prediction readout
    var predEl = win.querySelector('#oomPred');
    if (predEl) {
      if (pred != null) {
        var steps = Math.round(pred * maxSteps);
        predEl.textContent = 'predicted criticality ≈ step ' + steps + ' (' + (pred * 100).toFixed(1) + '% withdrawn)';
      } else {
        predEl.textContent = points.length >= 2 ? 'insufficient trend — keep plotting' : '';
      }
    }
  }

  // ------------------------------------------------------------------ actions
  function plotPoint() {
    var s = getSnap && getSnap();
    if (!s) return;
    if (s.metadata.plant_id !== 'pwr') { setMsg('PWR only', true); return; }
    var ins = s.instruments || {};
    if (!ins.sr_energized) { setMsg('SR detector is de-energized — no counts to plot', true); return; }
    var counts = ins.source_range;
    if (counts == null || !isFinite(counts) || counts < 1) { setMsg('no source-range reading', true); return; }
    if (counts > 9e5) { setMsg('SR pegged near full scale — past 1/M territory', true); return; }
    var g = controlGroup(s);
    if (!g) return;
    if (g.max_steps) maxSteps = g.max_steps;
    var x = (g.position_pct || 0) / 100;
    if (points.length === 0) {
      C0 = counts;
      points.push({ x: x, counts: counts, y: 1.0 });
      setMsg('baseline C₀ = ' + Math.round(counts) + ' cps at ' + (x * 100).toFixed(1) + '% withdrawn');
    } else {
      points.push({ x: x, counts: counts, y: C0 / counts });
      points.sort(function (a, b) { return a.x - b.x; });
      setMsg('C = ' + Math.round(counts) + ' cps → 1/M = ' + (C0 / counts).toFixed(3));
    }
    lastCaptureT = s.metadata.sim_time;
    render();
  }

  function clearAll(msg) {
    points = []; C0 = null; lastCaptureT = null;
    setMsg(msg || '');
    render();
  }

  // ------------------------------------------------------------------ lifecycle
  function build() {
    win = document.createElement('div');
    win.id = 'oomWin';
    win.className = 'oom-win';
    win.hidden = true;
    win.innerHTML =
      '<div class="oom-head" data-scanner-hint="1/M startup plot — drag to move. Plot inverse count-rate points against rod position; the line’s zero crossing predicts the critical rod position.">' +
      '<span>1/M Startup Plot</span><button class="btn oom-x" data-oom="close" title="Close">✕</button></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="oom-svg"></svg>' +
      '<div class="oom-foot">' +
      '<button class="btn" data-oom="plot" data-scanner-hint="Capture the current source-range count rate at the current rod position. First press = the shutdown baseline (plotted as 1.0).">Plot point</button>' +
      '<button class="btn" data-oom="clear" data-scanner-hint="Clear all plotted points (new baseline on the next plot).">Clear</button>' +
      '<span class="oom-pred" id="oomPred"></span></div>' +
      '<div class="oom-msg" id="oomMsg"></div>';
    document.body.appendChild(win);
    svg = win.querySelector('svg');
    msgEl = win.querySelector('#oomMsg');
    makeDraggable(win, win.querySelector('.oom-head'));
    win.addEventListener('click', function (e) {
      var b = e.target.closest('[data-oom]');
      if (!b) return;
      var op = b.getAttribute('data-oom');
      if (op === 'close') win.hidden = true;
      else if (op === 'plot') plotPoint();
      else if (op === 'clear') clearAll();
    });
  }

  var OneOverM = {
    init: function (opts) { getSnap = opts.getSnap; if (!win) build(); },
    open: function () {
      if (!win) build();
      win.hidden = false;
      render();
    },
    close: function () { if (win) win.hidden = true; },
    // Per-broadcast: self-clear when the world the points describe is gone —
    // plant change, reset, or a rewind to before the last captured point.
    tick: function (s) {
      if (!s || !s.metadata) return;
      var plant = s.metadata.plant_id;
      if (plant !== lastPlant) {
        lastPlant = plant;
        if (points.length) clearAll('plant changed — plot cleared');
        if (win && plant !== 'pwr') win.hidden = true;
        return;
      }
      if (lastCaptureT != null && s.metadata.sim_time < lastCaptureT - 1e-6) {
        clearAll('time rewound — plot cleared');
      }
    },
  };

  RD.makeDraggable = makeDraggable;
  RD.OneOverM = OneOverM;

})(globalThis.RD || (globalThis.RD = {}));
