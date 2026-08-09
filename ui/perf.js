/* perf.js — where does the frame time go?
 *
 * Attached as RD.Perf. Plain global-namespace script (CLAUDE.md, "Code conventions").
 *
 * WHY. Reported 2026-08-08: "on some PCs I get flickering of some elements during big
 * transients." Flicker has at least three unrelated causes and they need different fixes,
 * so guessing is expensive:
 *
 *   COMPUTE-BOUND  the physics cannot finish a broadcast inside its interval, the main
 *                  thread is busy, and rAF cannot paint. The service's own header does the
 *                  arithmetic: `engine.step` is 18.80 µs, and a 3600x cycle is 18 000 steps
 *                  = 338 ms of stepping against a 100 ms broadcast. Compute-bound at high
 *                  acceleration is not a hypothesis, it is the expected case.
 *   RENDER-BOUND   the DOM pass is heavy — the strip chart re-emits its whole SVG via
 *                  innerHTML — so paints are late even when the physics is cheap.
 *   NEITHER        both are inside budget and it still stutters: compositing, GPU, a
 *                  throttled background tab, or an extension. Nothing in this code will fix
 *                  that, and knowing so is worth as much as a fix.
 *
 * The three leave different fingerprints, which is the entire point of measuring rather
 * than tuning. Alpha 1.2.2 already fixed one flicker cause (elements rebuilt every frame
 * whether or not their values changed); this exists so the NEXT report starts with numbers.
 *
 * COST. Two `performance.now()` calls per broadcast and per paint, and a push into a fixed
 * ring. Statistics are computed only when something asks — the panel at 1 Hz, or a bug
 * report. A profiler that shows up in its own measurements would be worse than none.
 */
;(function (G) {
  'use strict';
  var RD = G.RD = G.RD || {};

  var N = 120;                      // ~12 s at 10 Hz — long enough to cover a transient
  function Ring() { this.a = []; this.i = 0; }
  Ring.prototype.push = function (v) {
    if (!(v >= 0)) return;          // NaN/undefined guard: a bad sample must not poison a stat
    if (this.a.length < N) this.a.push(v); else { this.a[this.i] = v; this.i = (this.i + 1) % N; }
  };
  Ring.prototype.stats = function () {
    var a = this.a;
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var sum = 0;
    for (var i = 0; i < a.length; i++) sum += a[i];
    return {
      n: a.length,
      avg: sum / a.length,
      p50: s[Math.floor(s.length * 0.50)],
      p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))],
      max: s[s.length - 1],
    };
  };

  var stepMs = new Ring();          // physics: one broadcast's worth of engine.step
  var renderMs = new Ring();        // DOM: one paint
  var interval = new Ring();        // wall ms between broadcasts actually received
  var frameMs = new Ring();         // wall ms between paints — the inverse is real fps

  var lastBroadcast = 0, lastFrame = 0;
  var broadcasts = 0, paints = 0, coalesced = 0;
  var nominalMs = 100;              // the service's target; updated from the snapshot

  function now() {
    return (G.performance && G.performance.now) ? G.performance.now() : Date.now();
  }

  var Perf = {
    /* Called by the app on every broadcast, before rendering. `stepsMs` is what the
     * service measured for its own physics loop, or null if it did not report. */
    broadcast: function (stepsMsValue, nominal) {
      var t = now();
      if (lastBroadcast) interval.push(t - lastBroadcast);
      lastBroadcast = t;
      broadcasts++;
      if (typeof stepsMsValue === 'number') stepMs.push(stepsMsValue);
      if (nominal > 0) nominalMs = nominal;
    },
    /* Called around the actual DOM pass. */
    renderStart: function () { return now(); },
    renderEnd: function (t0) {
      var t = now();
      renderMs.push(t - t0);
      if (lastFrame) frameMs.push(t - lastFrame);
      lastFrame = t;
      paints++;
    },
    /* A broadcast that never got its own paint because another arrived first. Directly
     * flicker-relevant: it means the UI is showing fewer states than the plant produced. */
    dropped: function () { coalesced++; },

    summary: function () {
      var st = stepMs.stats(), rn = renderMs.stats(), iv = interval.stats(), fr = frameMs.stats();
      var budget = null;
      if (st && rn && nominalMs > 0) budget = ((st.p50 + rn.p50) / nominalMs) * 100;
      var out = {
        broadcasts: broadcasts, paints: paints, coalesced: coalesced,
        nominal_ms: nominalMs,
        step_ms: st, render_ms: rn, interval_ms: iv,
        fps: (fr && fr.p50 > 0) ? (1000 / fr.p50) : null,
        budget_pct: budget,
      };
      out.verdict = verdict(out);
      return out;
    },
    reset: function () {
      stepMs = new Ring(); renderMs = new Ring(); interval = new Ring(); frameMs = new Ring();
      lastBroadcast = lastFrame = 0; broadcasts = paints = coalesced = 0;
    },
  };

  /* The judgement the numbers are for. Thresholds are deliberately coarse — this
   * separates three CAUSES, it does not grade performance, and a precise-looking
   * threshold would imply an accuracy the sampling does not have. */
  function verdict(s) {
    if (!s.step_ms || !s.render_ms) return 'not enough samples yet';
    var stepShare = s.step_ms.p95 / s.nominal_ms;
    var renderShare = s.render_ms.p95 / s.nominal_ms;
    var slipping = s.interval_ms && s.interval_ms.p95 > s.nominal_ms * 1.6;

    if (stepShare > 0.6 && stepShare >= renderShare) {
      return 'COMPUTE-BOUND — the physics is using ' + Math.round(stepShare * 100) +
        '% of the broadcast budget. Lower the speed setting; this is expected at high acceleration.';
    }
    if (renderShare > 0.4) {
      return 'RENDER-BOUND — the DOM pass is using ' + Math.round(renderShare * 100) +
        '% of the budget while the physics is fine.';
    }
    if (slipping) {
      return 'THE LOOP IS SLIPPING — broadcasts are arriving later than they are scheduled, ' +
        'but neither physics nor rendering accounts for it. Something else is holding the main thread.';
    }
    if (s.fps !== null && s.fps < 20 && s.coalesced > s.paints) {
      return 'PAINTS ARE BEING DROPPED — more broadcasts than frames, with both stages inside ' +
        'budget. Usually compositing, a throttled background tab, or an extension.';
    }
    return 'healthy — both stages comfortably inside the broadcast budget';
  }

  RD.Perf = Perf;
}(typeof globalThis !== 'undefined' ? globalThis : this));
