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
      if (win.classList.contains('oom-docked')) return;   // docked in the bottom row: not a floating window
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
  var sendCmd = null;        // (cmd) => dispatch through the service (HR5)
  var win = null, svg = null, msgEl = null;
  var points = [];           // [{ x: rod fraction withdrawn 0–1, counts, y: C0/counts }]
  var C0 = null;
  var maxSteps = 912;        // control-group full-withdrawal steps (for the steps axis; self-updates from the snapshot on plot)
  var lastPlant = null, lastCaptureT = null;

  /* Plot geometry (viewBox units).
   *
   * THE GUTTERS ARE MEASURED, NOT GUESSED (#713 pass 2). L/R/T/B are the margins the axis
   * ticks and labels live in, and they were costing 15.3 % of the width and 18.3 % of the
   * height. getBBox() of every text node the plot emits (scratchpad probe, Chromium, viewBox
   * units) says what each one actually needs:
   *   R — the last x tick ("912") is CENTRED on px(1.0) and its bbox ended at 335.58 of 340,
   *       i.e. 4.4 spare. Half the tick's 14.05-unit width plus a hair -> 9.
   *   L — the rotated y-axis label occupies x 0.51..12.71 after its rotate(-90 10 y) (that
   *       span is the text's HEIGHT, so it cannot be moved left: x >= 9.49 or it clips), and
   *       the y ticks ("0.25") are 17.14 wide ending at L-2.9. 12.71 + 17.14 + 2.9 + a 2-unit
   *       gap -> 35.
   *   T — NOTHING is drawn above the frame; the topmost text was the "1.00" tick at y 26.68,
   *       inside it. T was pure margin -> 4 (a point at the 1.1 ceiling has r=3.2).
   *   B — the x ticks and the "rod position" label stack under the frame. Pulling the tick
   *       baseline to H-B+10 and the label to H-3 (bbox bottom H-0.29) leaves >=1 unit of
   *       clearance at every seam at B=25.
   * Net: the plotted-data rectangle goes from 84.7 % x 81.7 % of the viewBox to 87.5 % x 87.9 %.
   *
   * W IS ADAPTIVE WHEN DOCKED — see syncViewBox(). H stays 240 so the rendered TEXT SIZE does
   * not move (the docked cell is height-bound, so the scale factor is cellH/H either way). */
  var W_BASE = 340, H = 240, L = 35, R = 9, T = 4, B = 25;
  var W = W_BASE;
  /* Aspect clamp for the adaptive viewBox. The low end is where the x-axis label (120.68
   * units wide, measured) stops fitting the plot area: 0.80 -> W 192 -> 148 units of plot.
   * The high end covers the 150px --bottomrow-h floor, where the cell measures 324 x 97 (3.34)
   * and a tighter clamp would put back the letterbox this exists to remove. */
  var AR_MIN = 0.80, AR_MAX = 3.60;
  function px(x) { return L + x * (W - L - R); }               // x: 0..1 fraction withdrawn
  function py(y) { return T + (1.1 - y) / 1.1 * (H - T - B); } // y: 0..1.1 (C0/C)

  /* THE LETTERBOX (#713 pass 2). The docked form puts the svg in a CSS grid cell and stretches
   * it (width/height 100%), so the cell's aspect ratio is the ROW HEIGHT's and the dock's — it
   * has nothing to do with the viewBox's. With the default preserveAspectRatio ("xMidYMid
   * meet") the browser then fits a 340x240 (1.417) drawing into whatever shape that is and
   * pads the rest: measured 33.2px of dead width at the default --bottomrow-h of 230px, and
   * 96.5px of dead HEIGHT at 350px — the binding dimension FLIPS as the operator drags. That
   * is also why pass 1's extra dock width did not all reach the plot, and why simply widening
   * the dock again would not either.
   *
   * So the viewBox follows the cell instead: H fixed, W = H x the cell's aspect. Then "meet"
   * has nothing to letterbox and the drawing fills the box at every row height.
   *
   * DO NOT MEASURE THE SVG'S OWN BOX — THAT ONE REALLY DOES FEED BACK. The first cut of this
   * read svg.clientWidth/clientHeight, on the reasoning that a viewBox cannot change the box
   * the CSS grid gives it. True only while that box is DEFINITE. At --bottomrow-h 150px the
   * dock's content is taller than the dock (head + msg + plot = 205px in a 148px box), so the
   * `1fr` svg track stops resolving to a length and content-sizes instead — and an svg with
   * `height:100%` against an indefinite height falls back to its INTRINSIC size, which is the
   * viewBox aspect. W then determines the measurement that determines W: every value is a
   * fixed point, and it froze wherever it happened to drift. Measured at row-150: viewBox
   * 748x240 for a cell whose real aspect was 2.105.
   *
   * So it measures the DOCK, whose width is its flex-basis and whose height is the row's, both
   * definite at every row height, and subtracts the sibling tracks (the button column, the
   * head/msg/help rows) — all of them ordinary boxes whose size owes nothing to the viewBox.
   * A side effect worth having: the plot is now sized to the space that EXISTS at the 150px
   * floor rather than overflowing the dock into a scrollbar, which is what it did before.
   *
   * No observer is added; render() already runs on open/plot/clear, and the one new trigger is
   * the `resize` event the splitter drag ALREADY dispatches (pwr_board.js beginDrag /
   * resetSplit).
   *
   * FLOATING KEEPS W_BASE, deliberately. That window has `width:100%` and no height, so its
   * height is DERIVED from the viewBox aspect — there is no letterbox there to remove, and
   * adapting to a box the viewBox itself sizes is the circularity above by construction. */
  function syncViewBox() {
    var w = W_BASE;
    /* EVERY DOM READ HERE IS OPTIONAL. run_oneoverm.js drives this module through a hand-rolled
     * fake DOM with no classList and no layout at all (that is the point of it — the panel must
     * not need a browser to be testable), so a bare `win.classList.contains` threw and took the
     * whole gate down. Layout is a browser-only refinement: without it, W stays where it was. */
    var docked = !!(win && win.classList && typeof win.classList.contains === 'function' &&
      win.classList.contains('oom-docked'));
    if (docked && !win.hidden && svg) {
      var foot = win.querySelector('.oom-foot');
      var head = win.querySelector('.oom-head');
      var msg = win.querySelector('.oom-msg');
      var pred = win.querySelector('.oom-pred');
      var help = win.querySelector('.oom-help');
      function boxH(el) { return el && isFinite(el.offsetHeight) ? el.offsetHeight : 0; }
      /* EVERY SIBLING IS NOW A ROW (#713 / #724 item 7). In the bottom-row dock the button bar
       * was a side COLUMN, so its width came off `cw` and its height off nothing. In the right
       * column the buttons sit ABOVE the plot (the owner's layout), so the bar costs HEIGHT and
       * costs no width at all, and the prediction readout is a row of its own besides.
       *
       * Get this wrong in the obvious direction — leave the foot subtracted from the width —
       * and nothing throws and nothing looks broken: the viewBox simply comes out ~94 units
       * narrower than the cell, "meet" letterboxes the difference, and the plot quietly gives
       * back a quarter of the width this move was made to win. That is the same silent failure
       * the header's letterbox note is about, arriving through the other axis. */
      var cw = (isFinite(win.clientWidth) ? win.clientWidth : 0);
      var ch = (isFinite(win.clientHeight) ? win.clientHeight : 0) -
        boxH(head) - boxH(foot) - boxH(pred) - boxH(msg) -
        (help && !help.hidden ? boxH(help) : 0);
      if (cw > 0 && ch > 0) {
        var ar = Math.max(AR_MIN, Math.min(AR_MAX, cw / Math.max(60, ch)));
        w = Math.round(H * ar);
      } else {
        w = W;          // not laid out yet — keep what we had rather than snapping to W_BASE
      }
    }
    W = w;
    if (svg && svg.getAttribute('viewBox') !== '0 0 ' + W + ' ' + H) {
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    }
  }

  /* WHERE THE WINDOW LIVES — resolved on every open AND on every resize, not once (#713 /
   * #724 item 7).
   *
   * DOCKED at the foot of the right-hand column on the wide PWR control-room layout, and
   * FLOATING everywhere else. "Everywhere else" now includes the STACKED layout below 1201 px,
   * and that is a measurement, not a preference: at 1100x900 the stacked simulator column is a
   * 260 px grid track holding the 159 px time controls plus #toolsCard, so a 200 px dock left
   * #toolsCard measuring **2 px** — the walkthrough card, reduced to a hairline, by a panel the
   * player opened to help them work that walkthrough. The floating window costs the column
   * nothing and the player can drag it clear of whatever it covers.
   *
   * 1201 px is the shell's own stacking breakpoint (`@media (max-width: 1200px)` in shell.css);
   * duplicating the number is deliberate — CSS cannot move a node between parents and JS cannot
   * read a media query it was not told about, so the two halves of one layout decision have to
   * name the same boundary. Change one, change the other.
   *
   * EVERY DOM AND WINDOW READ IS OPTIONAL, for the same reason syncViewBox's are: run_oneoverm
   * drives this module through a hand-rolled shim with no matchMedia, no `contains` on
   * classList and a `document.querySelector` that returns null. No matchMedia means no dock,
   * which is the floating window the shim already expects. */
  var DOCK_MIN_W = 1201;      // keep in step with shell.css's @media (max-width: 1200px)
  function dockTarget() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
    if (!window.matchMedia('(min-width: ' + DOCK_MIN_W + 'px)').matches) return null;
    return document.querySelector('.app.pwr-synoptic > .right-col');
  }
  function placeWindow() {
    if (!win) return;
    var col = dockTarget();
    var host = col || (document.body || null);
    if (host && win.parentNode !== host) host.appendChild(win);
    if (win.classList && typeof win.classList.add === 'function') {
      if (col) win.classList.add('oom-docked'); else win.classList.remove('oom-docked');
    }
    /* Undocking has to clear the inline left/top a drag left behind, or the floating window
     * comes back pinned wherever it was last dragged — which after a dock/undock cycle is
     * wherever the DOCK happened to sit, i.e. off in a corner with no memory of being put
     * there. Docked, the inline values are inert (`position: static`). */
    if (!col && win.style) { win.style.left = ''; win.style.top = ''; win.style.right = ''; win.style.bottom = ''; }
  }

  function controlGroup(s) {
    var gs = (s.control_state && s.control_state.rod_groups) || [];
    for (var i = 0; i < gs.length; i++) if (gs[i].function === 'control') return gs[i];
    return null;
  }

  /* WHICH PLANTS THIS TOOL WORKS ON (#598 item 2). It used to ask `plant_id === 'pwr'`,
   * and PWR2 — the plant the site actually runs — publishes 'pwr2'. The window opened,
   * the next broadcast hid it again, and `pwr_startup`'s six 1/M steps could not be done
   * on the shipped plant. ui/app.js has a fold for exactly this seam (uiPlantOf), but the
   * honest test is the CAPABILITY, not the name: 1/M needs a source-range count and a
   * control group to plot it against, and any plant publishing both can use the tool.
   * That also means a future plant gains it by publishing the instrument, not by being
   * added to a list here. */
  function supported(s) {
    var ins = (s && s.instruments) || {};
    return ins.source_range !== undefined && !!controlGroup(s || {});
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

    /* THE READOUT IS WRITTEN BEFORE THE GEOMETRY IS MEASURED (#713 / #724 item 7).
     *
     * It used to be the LAST thing render() did, after `svg.innerHTML = h`. That was harmless
     * while the readout shared a row with the buttons; it is not harmless now that it owns a
     * grid row of its own that is `auto`-height and `display:none` while empty. The order was:
     * measure the cell (readout empty, so the svg row is ~29 px TALLER than it is about to be)
     * -> compute W from that cell -> draw -> write the readout -> the row appears, the svg row
     * shrinks, and `preserveAspectRatio` letterboxes the difference off the WIDTH. Nothing
     * throws; the plot is simply narrower than its cell for ever after.
     *
     * MEASURED at 1500x950 with the write last: viewBox 403x240 into a 354 px-wide cell, plot
     * rect 272.62x160.23. With the write first: 315.54x160.16 — 43 px of width the old order
     * threw away, on the axis this whole relocation was made to win.
     *
     * The fit is pure arithmetic on `points` and owes the layout nothing, so there is no
     * circularity in computing it first — which is exactly why it can be hoisted and the cell
     * measurement cannot. */
    var f = fit(), pred = null, xc = null;
    if (f && f.b < -1e-6) {
      xc = -f.a / f.b;
      if (xc > points[points.length - 1].x - 1e-9 && xc <= 1.2) pred = xc;
    }
    var predEl = win && win.querySelector ? win.querySelector('#oomPred') : null;
    if (predEl) {
      predEl.textContent = pred != null
        ? 'predicted criticality ≈ step ' + Math.round(pred * maxSteps) +
          ' (' + (pred * 100).toFixed(1) + '% withdrawn)'
        : (points.length >= 2 ? 'insufficient trend — keep plotting' : '');
    }

    syncViewBox();          // W may move with the docked cell's aspect — do it before px()
    var h = '';
    // frame + gridlines
    h += '<rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '" class="oom-frame"/>';
    [0.25, 0.5, 0.75, 1.0].forEach(function (g) {
      h += '<line x1="' + px(g) + '" y1="' + T + '" x2="' + px(g) + '" y2="' + (H - B) + '" class="oom-grid"/>';
      h += '<text x="' + px(g) + '" y="' + (H - B + 10) + '" class="oom-tick" text-anchor="middle">' + Math.round(g * maxSteps) + '</text>';
    });
    [0.25, 0.5, 0.75, 1.0].forEach(function (g) {
      h += '<line x1="' + L + '" y1="' + py(g) + '" x2="' + (W - R) + '" y2="' + py(g) + '" class="oom-grid"/>';
      h += '<text x="' + (L - 4) + '" y="' + (py(g) + 3) + '" class="oom-tick" text-anchor="end">' + g.toFixed(2) + '</text>';
    });
    // zero line (the criticality axis)
    h += '<line x1="' + L + '" y1="' + py(0) + '" x2="' + (W - R) + '" y2="' + py(0) + '" class="oom-zero"/>';
    h += '<text x="' + (L - 4) + '" y="' + (py(0) + 3) + '" class="oom-tick" text-anchor="end">0</text>';
    // axis labels
    h += '<text x="' + ((L + W - R) / 2) + '" y="' + (H - 3) + '" class="oom-lab" text-anchor="middle">rod position (steps withdrawn)</text>';
    h += '<text x="10" y="' + ((T + H - B) / 2) + '" class="oom-lab" text-anchor="middle" transform="rotate(-90 10 ' + ((T + H - B) / 2) + ')">1/M  (C₀/C)</text>';

    // fit line, extrapolated to y=0 (`f`/`xc`/`pred` computed above, before the measurement)
    if (f && f.b < -1e-6) {
      var xEnd = Math.min(Math.max(xc, points[points.length - 1].x), 1.0);
      h += '<line x1="' + px(f.x0) + '" y1="' + py(f.a + f.b * f.x0) + '" x2="' + px(xEnd) + '" y2="' + py(f.a + f.b * xEnd) + '" class="oom-fit"/>';
      if (pred != null && xc <= 1.0) {
        h += '<line x1="' + px(xc) + '" y1="' + T + '" x2="' + px(xc) + '" y2="' + (H - B) + '" class="oom-crit"/>';
        h += '<text x="' + px(Math.min(xc, 0.88)) + '" y="' + (T + 10) + '" class="oom-critlab" text-anchor="middle">critical ' + Math.round(xc * maxSteps) + '</text>';
      }
    }
    // points (baseline square, later captures circles)
    points.forEach(function (p, i) {
      h += i === 0
        ? '<rect x="' + (px(p.x) - 3) + '" y="' + (py(p.y) - 3) + '" width="6" height="6" class="oom-pt"/>'
        : '<circle cx="' + px(p.x) + '" cy="' + py(p.y) + '" r="3.2" class="oom-pt"/>';
    });
    svg.innerHTML = h;
  }

  // ------------------------------------------------------------------ actions
  function plotPoint() {
    var s = getSnap && getSnap();
    if (!s) return;
    if (!supported(s)) { setMsg('no source-range channel on this plant', true); return; }
    var ins = s.instruments || {};
    /* The refusal says what it MEANS, not only what it is (#641): the source range secures
     * itself above 1e5 cps on this plant, so a de-energized channel here is the player past
     * the approach, not a switch to find. The live checklist marks its plot steps overtaken on
     * the same condition. */
    if (!ins.sr_energized) { setMsg('Source range de-energized — the approach is past 1/M territory; nothing to plot. Watch the startup rate and the intermediate range.', true); return; }
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
    // Announce the reading downstream so a live checklist step that says "plot a
    // point" checks itself off (#202 item 1). The points themselves stay UI-side;
    // this carries no data, it just marks that the operator took the sample. Sent
    // only on a point that was actually recorded — the early returns above bail
    // first, so a refused press (SR de-energized, no counts) does not count.
    if (sendCmd) sendCmd({ action: 'plot_1m_point' });
    render();
  }

  function clearAll(msg) {
    points = []; C0 = null; lastCaptureT = null;
    setMsg(msg || '');
    render();
  }

  /* THE HELP PANEL *(OWNER, 2026-09-03, #619 item 23: "Add a HELP button to the 1/M plot that
   * explains it in a concise but approachable way.")*.
   *
   * IT GROWS THE WINDOW IN PLACE rather than opening a modal, which is the idiom the owner
   * already chose once for the Scanner *(OWNER DIRECTIVE, 2026-08-11: "The scanner full
   * description should make the scanner larger so the full description is visible. It should not
   * open another box or window.")*. The reasoning transfers exactly: a modal would cover the plot
   * the player is asking about. It is also why this is not routed into the global Help modal.
   *
   * WHAT IT SAYS IS SCOPED BY WHAT THE STEPS NOW SAY. #619 wave 1 made the startup steps name the
   * SOURCE RANGE indication, state that its 7.0e2 is 700 counts per second, give the bursts a
   * size, and point at the panel's own predicted position. So this does not repeat any of that —
   * it carries the part a step cannot: what the ratio IS, why the early prediction reads high,
   * and why you never withdraw straight to the number. Four short blocks, the same standard the
   * step details are held to.
   *
   * The "reads high" paragraph is the load-bearing one: the fit is deliberately the trailing
   * three points (FIT_WINDOW above), and a player who does not know that reads a number that
   * keeps moving as a broken instrument rather than as the method working. */
  var HELP_HTML =
    '<div class="oom-help" hidden>' +
    '<p><b>What it is.</b> 1/M is the shutdown count rate divided by the current count rate. ' +
    'Subcritical, the core multiplies the source neutrons; the closer to critical, the bigger ' +
    'that multiplication, so the count rate climbs and 1/M falls toward zero.</p>' +
    '<p><b>How to read it.</b> Each point is one settled count rate at one rod position. Where ' +
    'the line through them crosses zero is the rod position where the core would go critical. ' +
    'That crossing is the number to work toward.</p>' +
    '<p><b>Why it keeps moving.</b> The early prediction always reads HIGH — too far out. Low in ' +
    'the bank the rods are worth little per step, so the line they draw is shallow and crosses ' +
    'zero well past the truth. The fit uses the latest three points for that reason, and the ' +
    'estimate walks in as you add more. A moving number is the method working, not a fault.</p>' +
    '<p><b>The rule.</b> Never withdraw straight to the predicted position. Creep up on it in ' +
    'small bursts, letting the count rate settle before each plot — a point taken mid-rise reads ' +
    'low. Reading a little high is the safe side.</p>' +
    '</div>';

  // ------------------------------------------------------------------ lifecycle
  function build() {
    win = document.createElement('div');
    win.id = 'oomWin';
    win.className = 'oom-win';
    win.hidden = true;
    win.innerHTML =
      '<div class="oom-head" data-scanner-hint="1/M startup plot, docked at the foot of the right-hand column. Plot inverse count-rate points against rod position; the line’s zero crossing predicts the critical rod position.">' +
      '<span>1/M Startup Plot</span><button class="btn oom-x" data-oom="close" title="Close">✕</button></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="oom-svg"></svg>' +
      '<div class="oom-foot">' +
      '<button class="btn" data-oom="plot" data-scanner-hint="Capture the current source-range count rate at the current rod position. First press = the shutdown baseline (plotted as 1.0).">Plot point</button>' +
      '<button class="btn" data-oom="clear" data-scanner-hint="Clear all plotted points (new baseline on the next plot).">Clear</button>' +
      '<button class="btn oom-help-btn" data-oom="help" aria-expanded="false" ' +
        'data-scanner-hint="What 1/M is and how to read this plot.">Help</button>' +
      '</div>' +
      /* THE PREDICTION IS ITS OWN LINE, NOT A TAIL ON THE BUTTON BAR *(OWNER, #724 item 7:
       * "make the predicted criticality text large enough to read and obvious")*. It was an
       * 11 px span sharing a row with three buttons, which is both the smallest type in the
       * panel and the least prominent slot in it — for the one number the whole tool exists to
       * produce. As a sibling it gets a row of its own in the docked grid and can be sized and
       * wrapped independently of the bar. #713.
       *
       * THE WORDING IS UNCHANGED on purpose: `run_oneoverm.js` asserts
       * /predicted criticality|insufficient trend/ against this element's textContent, and this
       * is a move plus a type size, not a rewrite — a reworded readout would have made the gate
       * agree with whatever I typed instead of with what it was written to check. */
      '<div class="oom-pred" id="oomPred"></div>' +
      '<div class="oom-msg" id="oomMsg"></div>' + HELP_HTML;
    document.body.appendChild(win);
    svg = win.querySelector('svg');
    msgEl = win.querySelector('#oomMsg');
    makeDraggable(win, win.querySelector('.oom-head'));
    /* Re-fit the viewBox when the docked cell changes shape (#713 pass 2). NOT a
     * ResizeObserver: `resize` is the event pwr_board.js's splitter drag already dispatches
     * on every pointermove and on a double-click reset (beginDrag/resetSplit), which is
     * exactly when --bottomrow-h moves; a real window resize fires it too. Coalesced onto one
     * animation frame so a drag redraws ~20 svg nodes once per frame rather than per event,
     * and skipped entirely when the panel is closed. render() dispatches nothing, so this
     * cannot re-enter. It runs for the FLOATING window too — not because that one letterboxes
     * (it cannot), but so a window that was docked and is no longer gets W_BASE back rather
     * than keeping the last cell's aspect. */
    var rafPending = 0;
    /* THE READOUT'S HEIGHT IS A SECOND INPUT TO THE PLOT'S BOX, AND IT MOVES ON ITS OWN
     * (#713 / #724 item 7). The prediction and the message sit in `auto` grid rows above and
     * below the `1fr` svg row, so every line either of them gains comes straight out of the
     * plot — and both change length while the panel is open: the readout goes from empty
     * (`:empty { display:none }`, zero rows) to one line to TWO when the string wraps, which at
     * 15 px in a 354 px column is what the longest form does, and the message line does the same
     * on a refusal.
     *
     * render() writes the readout BEFORE it measures, so the panel's own path is consistent. An
     * observer is for the changes render() is not the author of: a wrap that happens because the
     * step count grew a digit, a font that loads late, and a caller writing the element directly
     * (verify_e2e_ui does exactly that, to force the longest string render() can emit). MEASURED
     * with neither guard: svg box 354x171 against a viewBox of 390x240 — 77 px of dead width,
     * a fifth of the plot, silently.
     *
     * A `resize` listener cannot see this: the window has not resized. That is why it is an
     * observer here and NOT one for the dock itself, where the header's note explains that the
     * splitter already dispatches `resize`.
     *
     * IT CANNOT LOOP. The callback re-renders ONLY when the measured aspect actually moves W,
     * and a re-render writes the readout the same text it already holds — so the second pass
     * changes no box and the observer does not fire again. */
    var roPending = 0;
    if (typeof ResizeObserver === 'function' && typeof requestAnimationFrame === 'function') {
      var ro = new ResizeObserver(function () {
        if (roPending || !win || win.hidden) return;
        roPending = requestAnimationFrame(function () {
          roPending = 0;
          var before = W;
          syncViewBox();
          if (W !== before) render();
        });
      });
      [win.querySelector('.oom-pred'), win.querySelector('.oom-msg')].forEach(function (el) {
        if (el && el.getBoundingClientRect) { try { ro.observe(el); } catch (e) { /* shim */ } }
      });
    }
    if (typeof window.addEventListener === 'function' && typeof requestAnimationFrame === 'function') {
      window.addEventListener('resize', function () {
        if (rafPending || !win || win.hidden) return;
        /* placeWindow() FIRST (#724 item 7): a resize can cross the 1201 px stacking
         * breakpoint, and the window has to change parent before its new cell is measured —
         * measuring the old parent and then moving is how it would end up sized for a box it
         * is no longer in. */
        rafPending = requestAnimationFrame(function () { rafPending = 0; placeWindow(); render(); });
      });
    }
    win.addEventListener('click', function (e) {
      var b = e.target.closest('[data-oom]');
      if (!b) return;
      var op = b.getAttribute('data-oom');
      if (op === 'close') win.hidden = true;
      else if (op === 'plot') plotPoint();
      else if (op === 'clear') clearAll();
      else if (op === 'help') {
        var panel = win.querySelector('.oom-help');
        var open = panel.hidden;
        panel.hidden = !open;
        b.setAttribute('aria-expanded', String(open));
        b.classList.toggle('on', open);
      }
    });
  }

  var OneOverM = {
    init: function (opts) { getSnap = opts.getSnap; sendCmd = opts.cmd || null; if (!win) build(); },
    open: function () {
      if (!win) build();
      /* DOCKED AT THE FOOT OF THE RIGHT-HAND COLUMN *(OWNER, #724 item 7, verbatim: "The 1/m
       * plot is too small where it is next to the alarm panel. lets put it below the right hand
       * column in the corner. I know its far from the rod control buttons but theres not many
       * good places to put it where it wont obsure other things.")*. #713.
       *
       * IT USED TO JOIN THE BOTTOM ROW (#660 item 13), and three passes of #713 went into
       * widening it there — 300 -> 380 -> 420 -> 370 px — each one taken out of the strip chart
       * or the alarm panel, and pass 3 had to give 50 px back because the alarm panel's content
       * floor is 412 px under CI's fonts and only 378 px under Windows'. THE ROW WAS NEVER GOING
       * TO FIT THREE PANELS; the owner's call ends that argument by moving the plot out of the
       * row entirely, and the strip chart and alarm panel get the whole row back (see the
       * flex-grow note in shell.css).
       *
       * THE OWNER NAMED THE COST HIMSELF — it is far from the rod buttons. That is the trade,
       * not an oversight, and it is why this is a layout instruction rather than a proposal.
       *
       * Any other layout (RBMK/BWR, the non-synoptic shell) keeps the floating window: the
       * selector fails, nothing is appended, and `oom-docked` is never added. */
      placeWindow();
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
        if (win && !supported(s)) win.hidden = true;
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
