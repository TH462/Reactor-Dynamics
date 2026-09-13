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
   * W AND H ARE BOTH FIXED. They were briefly adaptive, for a docked form that had to fill a CSS
   * grid cell of someone else's shape (#713 / #724 item 7); the owner has since ruled the window
   * floating again (see the header), and a floating window sizes ITSELF — `width: 100%` on the svg
   * with no height given, so the rendered height follows this aspect. There is no foreign cell to
   * match and nothing to letterbox. */
  var W_BASE = 340, H = 240, L = 35, R = 9, T = 4, B = 25;
  var W = W_BASE;
  function px(x) { return L + x * (W - L - R); }               // x: 0..1 fraction withdrawn
  function py(y) { return T + (1.1 - y) / 1.1 * (H - T - B); } // y: 0..1.1 (C0/C)

  /* THE WINDOW IS FLOATING AND DRAGGABLE, ALWAYS *(OWNER RULING, 2026-09-13: "let's make the
   * card floating and dragable like it was originally")*.
   *
   * THIS SUPERSEDES #724 ITEM 7's LAYOUT, AND THE RULING IS RECORDED HERE BECAUSE THE ITEM IS NOT.
   * That playtest note reads *"lets put it below the right hand column in the corner"*, and an
   * agent who finds it without this line will re-implement the dock — the same trap as the 1/M fit
   * at FIT_WINDOW below. The dock existed for one day: it docked into `.right-col`, and before
   * that (#660 item 13) into `.bottom-row`. Both are gone.
   *
   * WHAT THE OWNER WAS ACTUALLY COMPLAINING ABOUT SURVIVES, because the dock was only ever the
   * means. Item 7's other two sentences — *"The 1/m plot is too small"* and *"make the predicted
   * criticality text large enough to read and obvious"* — are answered by the panel's own layout
   * and are unchanged by this ruling: the buttons stay a ROW ABOVE the plot, the readout keeps its
   * size and weight, and the plot is LARGER floating than it ever was docked (measured: the
   * plotted-data rect is 308x220 px floating against 321x160 docked — 68,000 px^2 against 51,000,
   * because a floating window's height is its own and is not a share of somebody's column).
   *
   * There is nothing to resolve and nothing to re-home: build() appends to document.body once, and
   * the window stays there. No dock target, no breakpoint, no parent that another rule is allowed
   * to hide — which also retires, by construction, the board-focus defect the #724 quality pass
   * found (the dock lived in `.right-col`, and the board-focus button hides that column, so an open
   * plot went to 0x0 while still believing itself open). */

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
  //
  /* CHALLENGED AND RE-AFFIRMED, WITH THE MEASUREMENT THAT SETTLED IT (#725, GitHub issue #724
   * item 8 of the RC19 playtest). The owner asked for the all-points fit, on the stated premise
   * that the curvature above is gone: *"make the 1/m plot best fit line use all points not just
   * the last three. using the last three was a bandaid for a larger problem where the points were
   * curved but with the current streight line we can use all points."* The premise is checkable,
   * so it was checked before anything was changed — and it is false.
   *
   * MEASURED on the authored `pwr_startup` route (full stack, PWR2, `hot_zero_power`, seed 7, 10×,
   * the checklist's own 94 / 63 / 31 / 14 / 9-step bursts, each plotted after its authored hold;
   * harness in this lane's inbox/724/item8_fit.js). Control group full travel 627 steps, TRUE
   * critical step 208 (first tick with `true_state.reactivity_pcm >= 0`, +5.6 pcm, t = 784 s):
   *
   *   pt  rod step  SOURCE RANGE   1/M      trailing-3      all-points
   *    1     0        503.1 cps   1.0000        —                —
   *    2    94        733.9       0.6855      298.9            298.9
   *    3   157      1,422.6       0.3537      251.2            251.2
   *    4   188      3,435.0       0.1465      216.1  (+8.1)    231.9  (+23.9)
   *    5   202      8,660.4       0.0581      210.6  (+2.6)    224.2  (+16.2)
   *    6   211     31,838.2       0.0158      213.1  (+5.1)    220.9  (+12.9)
   *
   * A prediction HIGHER than true critical is the danger side — it tells the operator they have
   * more margin than they have — and all-points is 8 to 24 steps further out at every point where
   * the two differ. The toe is still flat: per-step slope of 1/M runs −0.00334 (pt1→2), −0.00527,
   * −0.00668, −0.00631, −0.00470, so the first segment is HALF the slope of the steepest.
   *
   * The owner's own figure corroborates the trailing fit rather than the proposal — in the same
   * playtest he reported withdrawing to "the position the 1/m plot tells me to (216 steps)", which
   * is what trailing-3 reads over points 4–6. All-points would have sent him to 224–232.
   *
   * *(OWNER RULING, 2026-09-13, on the measurement above and a recommendation to keep the
   * trailing fit: "725 leave as is")*. So FIT_WINDOW stays 3. **Do not re-open this on the
   * strength of the 2026-09-12 request alone** — it was made against a premise that has been
   * measured and disproved, and re-running the harness above is the price of re-arguing it. */
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
      '<div class="oom-head" data-scanner-hint="1/M startup plot, a draggable window — drag its title bar to move it. Plot inverse count-rate points against rod position; the line’s zero crossing predicts the critical rod position.">' +
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
    /* TWO LISTENERS, WATCHING TWO DIFFERENT THINGS. Read them together — the older comment here
     * said "NOT a ResizeObserver", and there is now one thirty lines below, which reads as a
     * contradiction until you see that they answer different questions.
     *
     *   `resize` (here)            — the WINDOW changed, so the column, the breakpoint or the
     *                                board's splitter did. It is the event pwr_board.js already
     *                                dispatches on every splitter pointermove and reset
     *                                (beginDrag/resetSplit), and that ui/app.js now dispatches
     *                                when ⛶ hides the column. A ResizeObserver would not be
     *                                wrong here, merely redundant.
     *   `ResizeObserver` (below)   — the WINDOW did not change and the plot's cell moved anyway,
     *                                because a SIBLING ROW grew a line. No window event exists
     *                                for that, which is the whole reason it is there.
     *
     * Both coalesce onto one animation frame, so a drag redraws ~20 svg nodes once per frame
     * rather than once per event, and both skip entirely when the panel is closed. render()
     * dispatches nothing, so neither can re-enter.
     *
     * The `resize` handler runs for the FLOATING window too — not because that one letterboxes
     * (it cannot), but so a window that was docked and is no longer gets W_BASE back rather than
     * keeping the last cell's aspect, and so it re-homes across the dock/float boundary. */
    var rafPending = 0;
    /* THE READOUT-HEIGHT OBSERVER IS GONE WITH THE DOCK, and that is a deletion worth explaining
     * rather than a tidy-up. Docked, the svg sat in a CSS grid cell between two `auto` rows, so
     * every line the prediction or the message gained came straight OUT OF THE PLOT — measured at
     * its worst, svg box 354x171 against a viewBox of 390x240, 77 px of dead width, a fifth of the
     * plot, silently. A ResizeObserver on those two rows was the answer because no window event
     * fires when a sibling grows a line.
     *
     * FLOATING, THE ARITHMETIC RUNS THE OTHER WAY: the svg's height is its own (width 100 %, no
     * height, so it follows the viewBox aspect) and a longer readout makes the WINDOW taller
     * instead of the plot shorter. There is no cell to lose, so there is nothing to observe.
     *
     * WHAT REPLACES IT IS A DIFFERENT GUARD FOR A DIFFERENT HAZARD. A floating window keeps the
     * position the player dragged it to, in viewport coordinates — and a viewport can shrink out
     * from under it. Drag it to the right-hand side of a wide screen, then narrow the window, and
     * it is off-screen with no handle left to drag back: the same class of defect as the -296 px
     * left edge the #724 quality pass found, arriving by a different route. So `resize` re-clamps
     * a DRAGGED window back inside the viewport, using makeDraggable's own bounds so the two
     * cannot disagree, and touches nothing when the window has never been dragged (no inline
     * `left`, so the stylesheet still owns its position).
     *
     * Coalesced onto one animation frame, skipped while the panel is closed, and it re-renders
     * NOTHING — the drawing is viewport-independent now, so a resize cannot change it. */
    if (typeof window.addEventListener === 'function' && typeof requestAnimationFrame === 'function') {
      window.addEventListener('resize', function () {
        if (rafPending || !win || win.hidden || !win.style || !win.style.left) return;
        rafPending = requestAnimationFrame(function () {
          rafPending = 0;
          if (!win || win.hidden || !win.style.left) return;
          var r = win.getBoundingClientRect();
          if (!r || !isFinite(r.left) || !r.width) return;
          /* A RESIZE CLAMPS HARDER THAN A DRAG DOES, and the asymmetry is deliberate. Dragging
           * allows the window part-way off the edge — makeDraggable keeps only 80 px of it on
           * screen — because the player put it there and can put it back. A shrinking viewport is
           * not a choice, so this pulls the window FULLY into view whenever it still fits.
           *
           * MEASURED with the drag's own looser bound used here instead: dragged to left 504 on a
           * 1500 px screen, then narrowed to 700 px, the window sat at 504..860 — 160 px of it,
           * including a third of the plot, hanging off the right edge, and only the 80 px rule
           * stopping it being worse. `innerWidth - width` puts it at 344..700 instead.
           *
           * The outer Math.max(0, …) is for the case where the window is WIDER than the viewport:
           * pin its left edge to 0 rather than computing a negative target. */
          var x = Math.min(Math.max(0, r.left), Math.max(0, window.innerWidth - r.width));
          var y = Math.min(Math.max(0, r.top), Math.max(0, window.innerHeight - r.height));
          win.style.left = x + 'px'; win.style.top = y + 'px';
        });
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
