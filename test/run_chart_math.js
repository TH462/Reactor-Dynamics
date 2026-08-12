/*
 * run_chart_math.js — THE HELD-AXIS POLICY GATE (#393).
 *
 *   node test/run_chart_math.js
 *
 * WHY IT EXISTS
 * -------------
 * The 1-2-5 ladder and the held-band dwell were duplicated in ui/app.js `drawChart()` and
 * in ui/diagram/board/components/comp_indicator_panel.js `paint()`, the second behind a
 * "KEEP IN SYNC WITH ui/app.js" comment — a comment doing a function's job. The two
 * surfaces sit 12 px apart showing the same six quantities, so a divergence reads directly
 * as "the tile jumped and the chart did not". They now share ui/chart_math.js.
 *
 * A refactor's only claim is "nothing changed", and the way that claim fails is that the
 * new code is subtly kinder in some case nobody drives. So the ORIGINAL implementations are
 * PINNED HERE VERBATIM and replayed against the extracted one frame by frame. They are
 * deliberately dead code: their whole job is to remember what the behaviour was, and a
 * check that only exercised the new function would agree with whatever it does.
 *
 * The last block covers the two behaviours the original file's own comments record as
 * having cost real bugs: the clamp beating the data (which drew a trace outside its card,
 * owner screenshot 2026-08-06) and the dwell snapping on a single quiet frame.
 *
 * LAYER: static/pure. No DOM, no plant — chart_math.js is a pure module, which is most of
 * the reason it is worth extracting.
 */
'use strict';
require(require('path').join(__dirname, '..', 'ui', 'chart_math.js'));
var CM = globalThis.RD.ChartMath;

var pass = 0, fail = 0;
function ck(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  ' + detail : '')); }
}

// ---- the ORIGINAL implementations, copied verbatim from the two files ----------
function oldNiceStepApp(raw) {                       // ui/app.js
  if (!(raw > 0) || !isFinite(raw)) return 1;
  var e = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / e;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e;
}
function oldNiceStepTile(raw) {                      // comp_indicator_panel.js
  if (!(raw > 0) || !isFinite(raw)) return 1;
  var e = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
}
// The tile's held-axis block, verbatim, as a function of its own state.
function oldTileHold(held, shrinkFor, lo, hi, floorSpan, stMin, stMax, SHRINK_FRAMES) {
  var dLo = lo, dHi = hi;
  var fits = held && lo >= held.lo && hi <= held.hi;
  if (fits) {
    var small = (hi - lo) * 1.6 < (held.hi - held.lo);
    shrinkFor = small ? shrinkFor + 1 : 0;
    if (shrinkFor < SHRINK_FRAMES) { lo = held.lo; hi = held.hi; }
    else { held = null; shrinkFor = 0; }
  } else { held = null; shrinkFor = 0; }
  if (!held) {
    var need = Math.max(hi - lo, floorSpan) * 1.3;
    var step = oldNiceStepTile(need / 4);
    var c = (hi + lo) / 2;
    lo = Math.floor((c - need / 2) / step) * step;
    hi = Math.ceil((c + need / 2) / step) * step;
    if (lo < stMin) { hi += (stMin - lo); lo = stMin; }
    if (hi > stMax) { lo -= (hi - stMax); hi = stMax; if (lo < stMin) lo = stMin; }
    if (dLo < lo) lo = dLo;
    if (dHi > hi) hi = dHi;
    held = { lo: lo, hi: hi };
  }
  return { lo: lo, hi: hi, held: held, shrinkFor: shrinkFor };
}

// ---- niceStep over four decades, both old forms ----------------------------------
(function () {
  var bad = [];
  for (var e = -4; e <= 6; e++) {
    for (var m = 1; m < 10; m += 0.13) {
      var raw = m * Math.pow(10, e);
      var got = CM.niceStep(raw);
      if (got !== oldNiceStepApp(raw) || got !== oldNiceStepTile(raw)) bad.push(raw);
    }
  }
  ck('niceStep matches BOTH old forms across 1e-4..1e6 (' + (11 * 70) + ' inputs)', bad.length === 0,
     bad.slice(0, 3).join(', '));
  ck('niceStep guards non-positive and non-finite',
     CM.niceStep(0) === 1 && CM.niceStep(-5) === 1 && CM.niceStep(NaN) === 1 && CM.niceStep(Infinity) === 1);
}());

// ---- holdRange vs the tile's original block, replayed over a synthetic transient ---
(function () {
  var SF = 40, stMin = 0, stMax = 100, floorSpan = (stMax - stMin) * 0.15;
  // A ramp up, an excursion outside the band, then a long quiet spell — the sequence the
  // dwell exists for. Plus a stretch OUTSIDE the declared scale, which is the case where
  // the clamp used to draw the trace off the card.
  var series = [];
  var i;
  for (i = 0; i < 60; i++) series.push([50 + i * 0.1, 52 + i * 0.1]);       // slow drift
  for (i = 0; i < 15; i++) series.push([20 - i, 90 + i]);                    // excursion
  for (i = 0; i < 120; i++) series.push([55, 56]);                           // quiet: dwell fires
  for (i = 0; i < 20; i++) series.push([-30 - i, -10]);                      // BELOW the scale
  for (i = 0; i < 20; i++) series.push([120, 160 + i]);                      // ABOVE the scale

  var oldH = null, oldS = 0, newH = null, newS = 0, diffs = [], refits = 0;
  for (i = 0; i < series.length; i++) {
    var lo = series[i][0], hi = series[i][1];
    var o = oldTileHold(oldH, oldS, lo, hi, floorSpan, stMin, stMax, SF);
    var n = CM.holdRange(newH, lo, hi, { minSpan: floorSpan, shrinkFrames: SF, shrinkFor: newS,
                                         clampLo: stMin, clampHi: stMax });
    oldH = o.held; oldS = o.shrinkFor; newH = n.held; newS = n.shrinkFor;
    if (n.refit) refits++;
    if (Math.abs(o.lo - n.lo) > 1e-9 || Math.abs(o.hi - n.hi) > 1e-9 || o.shrinkFor !== n.shrinkFor) {
      diffs.push('frame ' + i + ': old [' + o.lo + ',' + o.hi + '] s=' + o.shrinkFor +
                 '  new [' + n.lo + ',' + n.hi + '] s=' + n.shrinkFor);
    }
  }
  ck('holdRange reproduces the tile block frame-for-frame over ' + series.length + ' frames',
     diffs.length === 0, diffs.slice(0, 3).join(' | '));
  ck('…and the replay actually exercised re-fits (' + refits + ')', refits > 3);
}());

// ---- the two behaviours the comments say cost real bugs ---------------------------
(function () {
  var o = CM.holdRange(null, -40, -10, { minSpan: 15, clampLo: 0, clampHi: 100 });
  ck('the clamp NEVER beats the data (trace below the declared scale stays inside the band)',
     o.lo <= -40 && o.hi >= -10, 'got [' + o.lo + ',' + o.hi + ']');
  var held = { lo: 0, hi: 100 }, s = 0, res;
  for (var i = 0; i < 39; i++) { res = CM.holdRange(held, 49, 51, { minSpan: 1, shrinkFrames: 40, shrinkFor: s }); held = res.held; s = res.shrinkFor; }
  ck('one quiet spell short of the dwell does NOT re-fit', res.lo === 0 && res.hi === 100 && !res.refit,
     'got [' + res.lo + ',' + res.hi + '] refit=' + res.refit);
  res = CM.holdRange(held, 49, 51, { minSpan: 1, shrinkFrames: 40, shrinkFor: s });
  ck('…and the frame that completes it does', res.refit && res.hi - res.lo < 100);
  res = CM.holdRange({ lo: 0, hi: 100 }, 40, 140, { minSpan: 1, shrinkFrames: 40, shrinkFor: 0 });
  ck('leaving the band re-fits IMMEDIATELY (never clipped)', res.refit && res.hi >= 140);
}());

console.log('\n' + pass + ' passed / ' + fail + ' failed');
process.exit(fail ? 1 : 0);
