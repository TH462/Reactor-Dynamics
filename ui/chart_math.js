/* ui/chart_math.js — the held-axis policy, once (#393).
 *
 * The strip chart at the bottom of the board and the six vital tiles at the top show the
 * SAME quantities, 12 px apart on screen, and both auto-range with a 1-2-5 ladder held by
 * a dwell counter. That policy existed TWICE — `drawChart()` in ui/app.js and `paint()` in
 * ui/diagram/board/components/comp_indicator_panel.js, the second behind a
 * "KEEP IN SYNC WITH ui/app.js" marker, which is a comment where a function should be. A
 * divergence between them is not subtle: it reads as "the tile jumped and the chart did
 * not", on two surfaces the eye crosses in one movement.
 *
 * POLICY HERE, PLACEMENT AT THE CALLER. `holdRange` decides what the band should be and
 * whether this frame re-fitted; what the caller does with that is its own business — the
 * strip chart slides the band onto a lane, the tile does nothing, and #440's lane stack
 * will ask for a rung instead. That split is what lets one function serve all of them
 * without any caller inheriting another's geometry.
 *
 * PURE. No `document`, no DOM at load or at call time, so a Node runner can require() it
 * and drive it directly — which is the point of extracting it rather than leaving two
 * copies that only a browser can exercise.
 */
(function (G) {
  'use strict';
  var RD = G.RD = G.RD || {};

  /* A "nice" axis step — 1, 2, 5 or 10 times a power of ten. Axis numbers land on values a
   * human reads without decoding, and the same input always gives the same step, so a band
   * does not shift by a pixel because the data moved by a hair. */
  function niceStep(raw) {
    if (!(raw > 0) || !isFinite(raw)) return 1;
    var e = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), m = raw / e;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e;
  }

  /* Hold a vertical band across frames, expanding at once and shrinking only after a dwell.
   *
   * `held` is the caller's own state object (or null for "fit fresh"); it is returned in the
   * result and the caller stores it back. Passing it in rather than keeping it here is what
   * lets one module serve many independent axes — six tiles and N chart series — with no
   * registry and no keys to collide.
   *
   *   vmin/vmax  the data's extent this frame
   *   opts.minSpan     never fit tighter than this (a flat trace still gets a readable band)
   *   opts.headroom    multiplier on the needed span; 1.3 = 30 % air (default)
   *   opts.shrinkFrames  consecutive quiet frames before zooming back in
   *   opts.shrinkFactor  how much smaller the data must be to count as quiet (default 1.6)
   *   opts.clampLo/clampHi  the instrument's own scale — a PREFERENCE, never a clip
   *
   * Returns { lo, hi, held, shrinkFor, refit, small }.
   *
   * THE EXPAND IS IMMEDIATE AND THE SHRINK IS NOT, deliberately and asymmetrically: a trace
   * leaving the band is the event you are watching for and must never be clipped, while a
   * band that snaps tighter the moment a transient passes throws the shape of what just
   * happened away. Symmetry here would be a bug, not a tidiness.
   *
   * THE CLAMP IS A PREFERENCE THAT MUST NEVER WIN. Preferring the instrument's own scale
   * keeps a level axis from running to −50 %, which reads as a broken gauge — but if the
   * data is outside that scale, the data wins. When the clamp could win, the trace drew
   * OUTSIDE its card (owner screenshot, 2026-08-06: a cold-shutdown plant at 355 °F against
   * an at-power Tavg band, the sparkline running down across the board beneath it).
   */
  function holdRange(held, vmin, vmax, opts) {
    opts = opts || {};
    var minSpan = opts.minSpan || 0;
    var headroom = opts.headroom || 1.3;
    var shrinkFrames = opts.shrinkFrames == null ? 40 : opts.shrinkFrames;
    var shrinkFactor = opts.shrinkFactor || 1.6;
    var shrinkFor = opts.shrinkFor || 0;
    var dLo = vmin, dHi = vmax;
    var lo = vmin, hi = vmax, small = false, refit = false;

    var fits = held && lo >= held.lo && hi <= held.hi;
    if (fits) {
      small = (hi - lo) * shrinkFactor < (held.hi - held.lo);
      shrinkFor = small ? shrinkFor + 1 : 0;
      if (shrinkFor < shrinkFrames) { lo = held.lo; hi = held.hi; }
      else { held = null; shrinkFor = 0; }
    } else { held = null; shrinkFor = 0; }

    if (!held) {
      refit = true;
      var need = Math.max(hi - lo, minSpan) * headroom;
      var step = niceStep(need / 4);
      var c = (hi + lo) / 2;
      lo = Math.floor((c - need / 2) / step) * step;
      hi = Math.ceil((c + need / 2) / step) * step;
      if (opts.clampLo != null && lo < opts.clampLo) { hi += (opts.clampLo - lo); lo = opts.clampLo; }
      if (opts.clampHi != null && hi > opts.clampHi) {
        lo -= (hi - opts.clampHi); hi = opts.clampHi;
        if (opts.clampLo != null && lo < opts.clampLo) lo = opts.clampLo;
      }
      if (dLo < lo) lo = dLo;          // the preference never beats the data — see above
      if (dHi > hi) hi = dHi;
      held = { lo: lo, hi: hi };
    }
    return { lo: lo, hi: hi, held: held, shrinkFor: shrinkFor, refit: refit, small: small };
  }

  RD.ChartMath = { niceStep: niceStep, holdRange: holdRange };
}(typeof globalThis !== 'undefined' ? globalThis : this));
