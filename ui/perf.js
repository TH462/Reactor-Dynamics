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
  /* PACING, from the snapshot's own block (#631). The verdict below needs to know which tier
   * produced these samples and what the physics was ALLOWED to spend: on WARP the service is
   * handed 70 of the 100 ms deliberately, so "the physics used 70 % of the interval" is the
   * designed state there and a fault everywhere else. Last-known-good — a broadcast that
   * carries no pacing block (an older snapshot, a service without the tier) leaves them as
   * they were rather than silently reading as PLAY. */
  var tier = null;                  // 'play' | 'warp' | null (never reported)
  var stepBudgetMs = 0;             // the EFFECTIVE budget for that tier, 0 = none armed

  function now() {
    return (G.performance && G.performance.now) ? G.performance.now() : Date.now();
  }

  /* ---- generic percentile over a plain array (nulls/negatives dropped) ------------------- */
  function pctl(arr, p) {
    var s = [];
    for (var i = 0; i < arr.length; i++) { if (typeof arr[i] === 'number' && arr[i] >= 0) s.push(arr[i]); }
    if (!s.length) return null;
    s.sort(function (a, b) { return a - b; });
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
  }

  /* #613 wave 3: the bundle used to carry only the app's OWN paint cadence, which cannot
   * tell "the compositor is back-pressured" (our board is expensive to paint) apart from
   * "the browser is withholding frames from this tab" (occluded/minimised/throttled/
   * software-rendered). Four more blocks, each aimed at one of those causes. */

  /* ---- env: a machine descriptor. The CHEAP fields are collected lazily and once — never
   * per broadcast. The WebGL renderer string is a SEPARATE, more expensive probe: creating a
   * WebGL context spins up GPU-process state, tens of ms, on a page that may never otherwise
   * touch WebGL — paying that at boot (first broadcast) taxes every session for a value only
   * a bug report reads. So it runs lazily on the FIRST summary() call only (never at
   * broadcast() time), is cached after that, and the context is released the moment the
   * string is read. */
  var envCache = null;
  function collectEnv() {
    if (envCache) return envCache;
    var e = { user_agent: null, device_pixel_ratio: null, viewport: null, screen: null,
      hardware_concurrency: null, device_memory: null, gl_renderer: null, software_gl: false };
    try { e.user_agent = (G.navigator && G.navigator.userAgent) || null; } catch (x) {}
    try { e.device_pixel_ratio = G.devicePixelRatio || null; } catch (x) {}
    try { e.viewport = { w: G.innerWidth || null, h: G.innerHeight || null }; } catch (x) {}
    try { if (G.screen) e.screen = { w: G.screen.width || null, h: G.screen.height || null }; } catch (x) {}
    try { e.hardware_concurrency = (G.navigator && G.navigator.hardwareConcurrency) || null; } catch (x) {}
    try { e.device_memory = (G.navigator && G.navigator.deviceMemory) || null; } catch (x) {}
    envCache = e;
    return e;
  }
  // Taken exactly once, from summary() — never from broadcast(). A throwaway canvas, never
  // attached to the DOM. UNMASKED_RENDERER_WEBGL is the one JS-visible signal for "this
  // machine has no real GPU path" — a software rasterizer names itself in the string
  // (SwiftShader, llvmpipe, "Basic Render Driver").
  var glProbed = false;
  function probeGl() {
    if (glProbed) return;
    glProbed = true;
    var e = collectEnv();
    try {
      var canvas = (G.document && G.document.createElement) ? G.document.createElement('canvas') : null;
      var gl = canvas && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
      if (gl) {
        var ext = gl.getExtension('WEBGL_debug_renderer_info');
        var renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        if (renderer) {
          e.gl_renderer = String(renderer);
          e.software_gl = /swiftshader|software|llvmpipe|basic render/i.test(e.gl_renderer);
        }
        // The probe exists to read one string. Holding a live WebGL context around for the
        // rest of the session is GPU-process state nothing else here needs — release it.
        var lc = gl.getExtension('WEBGL_lose_context');
        if (lc) lc.loseContext();
      }
    } catch (x) {}
  }

  /* ---- visibility: session-scoped counters; listeners registered ONCE at module load ------
   * `hiddenSince`/`blurredSince` are NULL when not currently hidden/blurred — not 0. A
   * falsy-zero sentinel here would silently drop the whole interval if the tab went hidden
   * in the first tick of the session, when `now()` can legitimately BE 0 (caught by
   * run_perf_summary.js firing visibilitychange at t=0 before the fix). */
  var sessionStart = now();
  var hiddenMs = 0, hiddenSince = null, hiddenCount = 0;
  var blurredMs = 0, blurredSince = null, blurredCount = 0;
  function initVisibility() {
    try {
      if (G.document && typeof G.document.addEventListener === 'function') {
        G.document.addEventListener('visibilitychange', function () {
          if (G.document.hidden) { hiddenSince = now(); hiddenCount++; }
          else if (hiddenSince !== null) { hiddenMs += now() - hiddenSince; hiddenSince = null; }
        });
      }
      if (typeof G.addEventListener === 'function') {
        G.addEventListener('blur', function () { blurredSince = now(); blurredCount++; });
        G.addEventListener('focus', function () {
          if (blurredSince !== null) { blurredMs += now() - blurredSince; blurredSince = null; }
        });
      }
    } catch (x) {}
  }
  function visibilitySummary() {
    var t = now();
    var hasFocus = null;
    try { hasFocus = (G.document && typeof G.document.hasFocus === 'function') ? G.document.hasFocus() : null; } catch (x) {}
    return {
      hidden_count: hiddenCount, hidden_ms: hiddenMs + (hiddenSince !== null ? (t - hiddenSince) : 0),
      blurred_count: blurredCount, blurred_ms: blurredMs + (blurredSince !== null ? (t - blurredSince) : 0),
      session_ms: t - sessionStart, has_focus: hasFocus,
    };
  }

  /* ---- raf: a rAF cadence sample INDEPENDENT of the app's own paint loop ------------------
   * `fps` above is the cadence of the app's OWN rAF callback, which only fires when render()
   * asks for one. This burst asks for rAF on its own, back to back, so a browser withholding
   * frames from the PAGE (occluded, backgrounded, energy saver) shows up here even across a
   * broadcast where the app never requested a paint. The last COMPLETED burst is stored so
   * summary() returns synchronously; summary() also kicks off the next one. */
  var RAF_BURST_N = 30;
  var RAF_BURST_INTERVAL_MS = 30000;    // re-sample at most ~2x/min — cheap, not free
  var lastRafBurst = null;              // { median_ms, n, at }
  var rafBurstRunning = false, rafBurstAt = 0;
  function runRafBurst() {
    if (rafBurstRunning || typeof G.requestAnimationFrame !== 'function') return;
    rafBurstRunning = true;
    var samples = [], prev = null, n = 0;
    function step(t) {
      var ts = (typeof t === 'number') ? t : now();
      if (prev !== null) samples.push(ts - prev);
      prev = ts; n++;
      if (n < RAF_BURST_N) { try { G.requestAnimationFrame(step); } catch (x) { finish(); } }
      else finish();
    }
    function finish() {
      rafBurstRunning = false; rafBurstAt = now();
      var med = pctl(samples, 0.5);
      if (med !== null) lastRafBurst = { median_ms: med, n: samples.length, at: rafBurstAt };
    }
    try { G.requestAnimationFrame(step); } catch (x) { rafBurstRunning = false; }
  }
  function maybeStartRafBurst() {
    try {
      if (!lastRafBurst || (now() - rafBurstAt) > RAF_BURST_INTERVAL_MS) runRafBurst();
    } catch (x) {}
  }

  /* ---- loaf: long-animation-frame — the only style/layout/paint-recording cost JS can see
   * AT ALL. Raster and compositing never reach a PerformanceObserver; this entry type is the
   * JS-side ceiling on what can be diagnosed without a Performance-panel trace (see
   * tools/perf_trace.js for that). `buffered: true` picks up entries recorded before this
   * listener attached. */
  var LOAF_RING_N = 60;
  var loafSupported = false, loafRing = [];
  function initLoaf() {
    try {
      if (typeof G.PerformanceObserver === 'function' &&
          G.PerformanceObserver.supportedEntryTypes &&
          G.PerformanceObserver.supportedEntryTypes.indexOf('long-animation-frame') !== -1) {
        loafSupported = true;
        var obs = new G.PerformanceObserver(function (list) {
          var entries = list.getEntries ? list.getEntries() : [];
          for (var i = 0; i < entries.length; i++) {
            var en = entries[i];
            var scriptRender = null, styleLayout = null;
            try {
              if (en.renderStart > 0 && en.styleAndLayoutStart >= en.renderStart) {
                scriptRender = en.styleAndLayoutStart - en.renderStart;
              }
              if (en.styleAndLayoutStart > 0) {
                // NOT style+layout alone — this window runs from styleAndLayoutStart to the
                // frame's END (startTime+duration), so it also contains paint recording. The
                // LoAF spec draws no finer line than this; keep the key name (`style_layout_ms`)
                // but never describe it to a reader as style+layout only.
                styleLayout = (en.startTime + en.duration) - en.styleAndLayoutStart;
                if (styleLayout < 0) styleLayout = null;
              }
            } catch (x) {}
            loafRing.push({ duration: en.duration, blocking_ms: en.blockingDuration,
              script_render_ms: scriptRender, style_layout_ms: styleLayout });
            if (loafRing.length > LOAF_RING_N) loafRing.shift();
          }
        });
        obs.observe({ type: 'long-animation-frame', buffered: true });
      }
    } catch (x) { loafSupported = false; }
  }
  /* `style_layout_p50`/`style_layout_p95`: percentiles of styleAndLayoutStart -> frame end,
   * i.e. style + layout + PAINT RECORDING (the LoAF spec draws no finer line than this — see
   * the comment on `styleLayout` above). Key names unchanged; read them as that wider window. */
  function loafSummary() {
    if (!loafSupported) return null;
    var durations = [], styleLayouts = [];
    for (var i = 0; i < loafRing.length; i++) {
      durations.push(loafRing[i].duration);
      if (loafRing[i].style_layout_ms !== null) styleLayouts.push(loafRing[i].style_layout_ms);
    }
    return {
      n: loafRing.length,
      duration_p50: pctl(durations, 0.5), duration_p95: pctl(durations, 0.95),
      style_layout_p50: pctl(styleLayouts, 0.5), style_layout_p95: pctl(styleLayouts, 0.95),
    };
  }
  initVisibility();
  initLoaf();

  var Perf = {
    /* Called by the app on every broadcast, before rendering. `stepsMs` is what the
     * service measured for its own physics loop, or null if it did not report. `pacing` is
     * the snapshot's `metadata.pacing` block (#631) — optional; see `tier` above. */
    broadcast: function (stepsMsValue, nominal, pacing) {
      var t = now();
      if (lastBroadcast) interval.push(t - lastBroadcast);
      lastBroadcast = t;
      broadcasts++;
      if (typeof stepsMsValue === 'number') stepMs.push(stepsMsValue);
      if (nominal > 0) nominalMs = nominal;
      if (pacing) {
        if (pacing.tier) tier = pacing.tier;
        stepBudgetMs = pacing.step_budget_ms > 0 ? pacing.step_budget_ms : 0;
      }
      if (!envCache) { try { collectEnv(); } catch (x) {} }
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
      maybeStartRafBurst();
      try { probeGl(); } catch (x) {}
      var out = {
        broadcasts: broadcasts, paints: paints, coalesced: coalesced,
        nominal_ms: nominalMs,
        tier: tier, step_budget_ms: stepBudgetMs,
        step_ms: st, render_ms: rn, interval_ms: iv,
        fps: (fr && fr.p50 > 0) ? (1000 / fr.p50) : null,
        budget_pct: budget,
        env: collectEnv(),
        visibility: visibilitySummary(),
        raf: { last: lastRafBurst, paint_broadcast_ratio: broadcasts > 0 ? (paints / broadcasts) : null },
        loaf: loafSummary(),
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
   * separates CAUSES, it does not grade performance, and a precise-looking threshold
   * would imply an accuracy the sampling does not have.
   *
   * The old "PAINTS ARE BEING DROPPED" verdict lumped two very different browser
   * behaviours (back-pressured compositor vs. the browser withholding frames outright)
   * under one sentence. It now splits on what env/visibility/loaf can actually tell apart,
   * falling through to the original blunt sentence when none of them explain it — which is
   * still true and still the case a Performance-panel trace is for (tools/perf_trace.js). */
  var HIDDEN_SHARE_WARN = 0.3;        // >=30% of the session spent HIDDEN (not merely unfocused):
                                       // the browser's own background-tab throttling is a plausible
                                       // DOMINANT cause. Chrome/Edge throttle rAF for hidden/occluded
                                       // tabs, not for a window that simply lost focus — the owner
                                       // routinely types in another window while the sim keeps
                                       // running, and a blur-inclusive share would misattribute a
                                       // real raster problem to "the tab". `blurred_*` is still
                                       // reported in the `visibility` block; it is deliberately left
                                       // OUT of this share.
  var LOAF_STYLE_LAYOUT_MS_WARN = 8;  // half of a 16.7 ms (60 Hz) rAF frame budget spent in
                                       // style+layout+paint-recording alone leaves less than half
                                       // for script+raster+composite
  /* How far a broadcast may overshoot its step budget and still be READ as spending it (#631).
   * Two honest sources of overshoot: the loop only reads its clock every 25 steps, so it can
   * run up to 25 steps past the cut; and `_perfStepMs` spans a little more than the loop (the
   * final protection evaluation). 1.4x of a 70 ms budget is 98 ms — past that the physics is
   * not spending a budget, it is missing one, and the blunt verdict is the right one. */
  var BUDGET_OVERSHOOT = 1.4;
  function verdict(s) {
    if (!s.step_ms || !s.render_ms) return 'not enough samples yet';
    var stepShare = s.step_ms.p95 / s.nominal_ms;
    var renderShare = s.render_ms.p95 / s.nominal_ms;
    var slipping = s.interval_ms && s.interval_ms.p95 > s.nominal_ms * 1.6;

    if (stepShare > 0.6 && stepShare >= renderShare) {
      /* WARP IS SUPPOSED TO LOOK LIKE THIS (#631). The tier is handed 70 of the 100 ms on
       * purpose — it runs only on a quiet plant and lets go the moment one moves — so a WARP
       * broadcast sitting inside that budget is the feature working, not a machine falling
       * behind, and painting it as a problem is how a warning colour stops being read. The
       * discriminator is the BUDGET, not the tier alone: physics well past what it was
       * allowed falls through to the sentence below, on WARP as anywhere else. */
      if (s.tier === 'warp' && s.step_budget_ms > 0 && s.step_ms.p95 <= s.step_budget_ms * BUDGET_OVERSHOOT) {
        return 'COMPUTE-BOUND — SPENDING THE WARP BUDGET — the physics is using ' +
          Math.round(stepShare * 100) + '% of the broadcast interval, which is the ' +
          s.step_budget_ms + ' ms WARP is given on a quiet plant. Expected; lower the speed setting for more headroom.';
      }
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
      var vis = s.visibility;
      var hiddenShare = (vis && vis.session_ms > 0) ? (vis.hidden_ms / vis.session_ms) : 0;
      if (hiddenShare >= HIDDEN_SHARE_WARN) {
        return 'PAINTS ARE BEING DROPPED — TAB WAS BACKGROUNDED — hidden for ' +
          Math.round(hiddenShare * 100) + '% of this session; the browser throttles paints there, not this app.';
      }
      if (s.env && s.env.software_gl) {
        return 'PAINTS ARE BEING DROPPED — SOFTWARE RENDERING — the GPU reports "' + s.env.gl_renderer +
          '", a software rasterizer; expect this on every page on this machine, not just this one.';
      }
      if (s.loaf && s.loaf.style_layout_p95 !== null && s.loaf.style_layout_p95 > LOAF_STYLE_LAYOUT_MS_WARN) {
        return 'PAINTS ARE BEING DROPPED — LAYOUT-BOUND — style+layout+paint recording is costing ' +
          s.loaf.style_layout_p95.toFixed(1) + ' ms p95, over half a 60 Hz frame budget; the DOM is expensive to lay out.';
      }
      return 'PAINTS ARE BEING DROPPED — the compositor cannot paint the board at the rate broadcasts ' +
        'arrive with both stages inside budget; raster/GPU cost, which this timer cannot see — a ' +
        'Performance-panel trace is the instrument.';
    }
    return 'healthy — both stages comfortably inside the broadcast budget';
  }

  RD.Perf = Perf;
}(typeof globalThis !== 'undefined' ? globalThis : this));
