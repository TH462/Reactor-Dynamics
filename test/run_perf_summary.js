/* run_perf_summary.js — THE bug-bundle PERFORMANCE BLOCKS (#613 wave 3, stream 2).
 *
 *   node test/run_perf_summary.js
 *
 * WHY. `ui/perf.js` used to report only the app's OWN paint cadence (`fps`, the gap between
 * successive `renderEnd()` calls). A rAF firing slowly while the main thread is idle has at
 * least two very different causes — the compositor is back-pressured by raster/GPU work
 * (our board is expensive to paint), or the BROWSER is withholding frames outright (an
 * occluded/minimised/backgrounded tab, energy saver, a software GPU driver) — and the old
 * bundle carried nothing that told those apart. `RD.Perf.summary()` now also carries `env`
 * (machine descriptor + a WebGL software-renderer probe), `visibility` (hidden/blurred time
 * over the session), `raf` (a rAF cadence sample independent of the app's own paint loop),
 * and `loaf` (long-animation-frame style+layout cost — the only style/layout number JS can
 * see at all; raster/composite never reach a PerformanceObserver, which is why
 * `tools/perf_trace.js` exists for the cases none of this can explain).
 *
 * `ui/perf.js` is a plain global-namespace IIFE with no module system (CLAUDE.md, "Code
 * conventions") — there is no jsdom in this tree, so the DOM/browser globals it touches are
 * hand-rolled here, following the pattern `run_telemetry.js` already uses for `site/
 * telemetry.js`: stub `globalThis` properties with `Object.defineProperty` (Node 24 defines
 * `navigator`/`performance` as getter-only, so a plain assignment throws), then load the
 * module fresh. Because `ui/perf.js` keeps module-level state (env cache, visibility
 * counters, the loaf ring) that is set up ONCE when the file runs, each scenario here
 * re-evaluates the source from scratch via indirect `eval` — the same technique
 * `run_warp_tier.js` uses to run a mutated copy of `simulation_service.js` — rather than
 * `require()`, so a scenario can never see another scenario's leftover state.
 *
 * WHAT IT ASSERTS
 *   1. Every LEGACY key `summary()` returned before this change is still present, with the
 *      same shape (a stats object or a plain number/string).
 *   2. Each NEW block (env/visibility/raf/loaf) appears, and degrades to null/absent rather
 *      than throwing when the API behind it does not exist (no WebGL, no
 *      PerformanceObserver, no deviceMemory, no document at all).
 *   3. The verdict still picks the four ORIGINAL branches (compute-bound, render-bound,
 *      slipping, healthy) under the old conditions, and picks each of the new
 *      "PAINTS ARE BEING DROPPED" sub-branches (backgrounded / software-rendered /
 *      layout-bound / the original blunt fallback) under the conditions that define it —
 *      including which one WINS when two conditions are true at once.
 *   4. Verified by INJECTION (HR10's own rule: a check beside its own fix isn't green until
 *      it has been made to go red) — three mutations, each defanging one new branch's
 *      condition, must redden the check that depends on it.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var PERF_PATH = path.join(ROOT, 'ui', 'perf.js');
var PERF_SRC = fs.readFileSync(PERF_PATH, 'utf8').replace(/\r\n/g, '\n');

var GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', RST = '\x1b[0m', BOLD = '\x1b[1m';
var nPass = 0, nFail = 0;
function ck(name, ok, detail) {
  if (ok) { nPass++; console.log('  ' + GREEN + 'PASS' + RST + '  ' + name + (detail !== undefined ? DIM + '  (' + detail + ')' + RST : '')); }
  else { nFail++; console.log('  ' + RED + 'FAIL' + RST + '  ' + name + (detail !== undefined ? '  ' + RED + detail + RST : '')); }
}
function head(s) { console.log('\n' + BOLD + s + RST); }

/* ============================================================== fake browser plumbing ==== */

// A single controllable clock. `performance.now` always reads it, so every scenario is
// deterministic — no wall-clock flakiness, no dependency on how fast this machine is.
var clockState = { t: 0 };

// requestAnimationFrame: enqueue-only. The test drains the queue by hand (`pumpRaf`), which
// is what lets a scenario simulate "the browser never grants a frame" by simply not pumping.
var rafQueue = [];
function fakeRAF(cb) { rafQueue.push(cb); }
function pumpRaf(maxSteps, frameMs) {
  var n = 0;
  while (rafQueue.length && n < maxSteps) {
    var cb = rafQueue.shift();
    clockState.t += frameMs;
    cb(clockState.t);
    n++;
  }
}

// window-level addEventListener (blur/focus) — a separate registry from document's.
var winListeners = {};
function winAddEventListener(type, cb) { (winListeners[type] = winListeners[type] || []).push(cb); }
function winFire(type) { (winListeners[type] || []).forEach(function (cb) { cb(); }); }

// PerformanceObserver: records the callback so the test can hand it synthetic
// long-animation-frame entries whenever it wants.
function FakePO(cb) { this._cb = cb; FakePO.instances.push(this); }
FakePO.supportedEntryTypes = ['long-animation-frame'];
FakePO.instances = [];
FakePO.prototype.observe = function (opts) { this._opts = opts; };
FakePO.fireLast = function (entries) {
  var inst = FakePO.instances[FakePO.instances.length - 1];
  if (inst) inst._cb({ getEntries: function () { return entries; } });
};

// A synthetic long-animation-frame entry. renderStart/styleAndLayoutStart/duration are
// chosen so the style+layout figure perf.js derives comes out to EXACTLY `styleLayoutMs`:
// duration = 20 + styleLayoutMs, styleAndLayoutStart = startTime + 20, so
// (startTime+duration) - styleAndLayoutStart === styleLayoutMs.
function mkLoafEntry(startTime, styleLayoutMs) {
  return {
    startTime: startTime,
    renderStart: startTime + 10,
    styleAndLayoutStart: startTime + 20,
    duration: 20 + styleLayoutMs,
    blockingDuration: Math.min(20 + styleLayoutMs, 50),
  };
}

// A throwaway <canvas> stub. `mode` picks what its WebGL context reports:
//   'hardware' — a real GPU string, not flagged as software
//   'software' — a SwiftShader string, flagged as software
//   'none'     — getContext returns null (no WebGL at all)
// `glStats`, when given, is mutated so a test can observe the probe's TIMING and LIFECYCLE:
// `.contextsCreated` counts getContext('webgl'|'experimental-webgl') calls (must stay 0 until
// the first summary(), then never exceed 1 — the probe runs once and is cached), and
// `.lost` records whether WEBGL_lose_context.loseContext() was actually called.
function makeCanvas(mode, glStats) {
  return {
    getContext: function (type) {
      if (type !== 'webgl' && type !== 'experimental-webgl') return null;
      if (glStats) glStats.contextsCreated++;
      if (mode === 'none') return null;
      return {
        getExtension: function (name) {
          if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_RENDERER_WEBGL: 'UNMASKED_RENDERER_WEBGL' };
          if (name === 'WEBGL_lose_context') return { loseContext: function () { if (glStats) glStats.lost = true; } };
          return null;
        },
        getParameter: function (key) {
          if (key === 'UNMASKED_RENDERER_WEBGL') {
            return mode === 'software'
              ? 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'
              : 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)';
          }
          if (key === 'RENDERER') return 'WebKit WebGL';
          return null;
        },
      };
    },
  };
}
function makeDocument(glMode, glStats) {
  var listeners = {};
  return {
    hidden: false,
    _focused: true,
    addEventListener: function (type, cb) { (listeners[type] = listeners[type] || []).push(cb); },
    removeEventListener: function () {},
    hasFocus: function () { return this._focused; },
    createElement: function (tag) { return tag === 'canvas' ? makeCanvas(glMode, glStats) : {}; },
    _fire: function (type) { (listeners[type] || []).forEach(function (cb) { cb(); }); },
  };
}

// Every globalThis property `ui/perf.js` touches. Every scenario stubs ALL of them —
// explicitly to `undefined` when not supplied — so a scenario is never at the mercy of
// whatever this particular Node version happens to define on globalThis (Node 24 already
// ships real `navigator`/`performance`/`PerformanceObserver` objects; a test that relied on
// their absence would be testing this Node version, not perf.js).
var ALL_PROPS = ['navigator', 'performance', 'document', 'screen', 'devicePixelRatio',
  'innerWidth', 'innerHeight', 'requestAnimationFrame', 'addEventListener', 'PerformanceObserver'];
function stubGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value: value, writable: true, configurable: true });
}
function installStubs(props) {
  ALL_PROPS.forEach(function (name) {
    if (name === 'performance') { stubGlobal('performance', { now: function () { return clockState.t; } }); return; }
    stubGlobal(name, Object.prototype.hasOwnProperty.call(props, name) ? props[name] : undefined);
  });
}

/* Loads a fresh copy of perf.js into globalThis.RD.Perf. `srcOverride` runs a MUTATED copy
 * of the source text instead of the real file — used only by the injection self-test. */
function loadPerf(props, srcOverride) {
  clockState.t = props.t0 || 0;
  rafQueue = [];
  winListeners = {};
  FakePO.instances = [];
  installStubs(props);
  globalThis.RD = {};
  (0, eval)(srcOverride || PERF_SRC);           // eslint-disable-line no-eval -- indirect eval, global scope, same technique run_warp_tier.js uses on simulation_service.js
  return globalThis.RD.Perf;
}

/* A rich, fully-populated browser environment by default; pass a key (even `undefined`) in
 * `overrides` to replace or remove any one piece of it. `glMode` picks the default
 * document's canvas behaviour when `document` itself isn't overridden; `glStats`, likewise,
 * is threaded through to that default document's canvas so a test can watch the WebGL
 * probe's timing/lifecycle (see `makeCanvas`). */
function scenario(overrides) {
  overrides = overrides || {};
  var doc = ('document' in overrides) ? overrides.document : makeDocument(overrides.glMode || 'hardware', overrides.glStats);
  var props = {
    t0: overrides.t0 || 0,
    navigator: ('navigator' in overrides) ? overrides.navigator :
      { userAgent: 'TestAgent/1.0 (perf-gate)', hardwareConcurrency: 8, deviceMemory: 16 },
    document: doc,
    screen: ('screen' in overrides) ? overrides.screen : { width: 1920, height: 1080 },
    devicePixelRatio: ('devicePixelRatio' in overrides) ? overrides.devicePixelRatio : 2,
    innerWidth: ('innerWidth' in overrides) ? overrides.innerWidth : 1280,
    innerHeight: ('innerHeight' in overrides) ? overrides.innerHeight : 800,
    requestAnimationFrame: ('requestAnimationFrame' in overrides) ? overrides.requestAnimationFrame : fakeRAF,
    addEventListener: ('addEventListener' in overrides) ? overrides.addEventListener : winAddEventListener,
    PerformanceObserver: ('PerformanceObserver' in overrides) ? overrides.PerformanceObserver : FakePO,
  };
  return { perf: loadPerf(props, overrides.src), doc: doc };
}

// Drives n broadcast/render cycles with fixed timings, so the ring statistics land exactly
// where a scenario needs them to. `opts.pacing` is the snapshot's `metadata.pacing` block
// (#631) — omitted, the broadcast carries none, which is what an older snapshot looks like.
function feed(perf, opts, n) {
  for (var i = 0; i < n; i++) {
    clockState.t += opts.intervalMs;
    perf.broadcast(opts.stepMs, opts.nominal || 100, opts.pacing);
    var t0 = perf.renderStart();
    clockState.t += opts.renderMs;
    perf.renderEnd(t0);
  }
}

// The shared precondition for every "PAINTS ARE BEING DROPPED" sub-branch: both stages
// cheap (small step/render shares), the loop not slipping, fps < 20, more coalesced
// broadcasts than painted frames.
function dropConditionFeed(perf) {
  feed(perf, { intervalMs: 58, stepMs: 3, renderMs: 2, nominal: 100 }, 20);  // cycle 60ms -> ~16.7 fps
  for (var i = 0; i < 25; i++) perf.dropped();                              // 25 coalesced > 20 painted
}

/* ============================================================== 1. legacy shape ========== */
head('legacy keys: unchanged in name, type and shape');
(function () {
  var sc = scenario();
  feed(sc.perf, { intervalMs: 100, stepMs: 5, renderMs: 2, nominal: 100 }, 5);
  var s = sc.perf.summary();
  ['broadcasts', 'paints', 'coalesced', 'nominal_ms', 'step_ms', 'render_ms', 'interval_ms',
    'fps', 'budget_pct', 'verdict'].forEach(function (k) {
    ck('legacy key "' + k + '" present', Object.prototype.hasOwnProperty.call(s, k), typeof s[k]);
  });
  ck('step_ms is a {n,avg,p50,p95,max} stats object', !!s.step_ms && typeof s.step_ms.p50 === 'number' && typeof s.step_ms.max === 'number');
  ck('render_ms is a stats object', !!s.render_ms && typeof s.render_ms.p50 === 'number');
  ck('interval_ms is a stats object', !!s.interval_ms && typeof s.interval_ms.p50 === 'number');
  ck('fps is a number', typeof s.fps === 'number', s.fps);
  ck('budget_pct is a number', typeof s.budget_pct === 'number', s.budget_pct);
  ck('verdict is a string', typeof s.verdict === 'string');
  ck('broadcasts/paints/coalesced are the raw counts', s.broadcasts === 5 && s.paints === 5 && s.coalesced === 0,
    JSON.stringify({ b: s.broadcasts, p: s.paints, c: s.coalesced }));
})();

/* ============================================================== 2. graceful degradation == */
head('new blocks: present and degrade to null/absent, never throw, with nothing but a clock');
(function () {
  var sc;
  try {
    sc = scenario({ navigator: undefined, document: undefined, screen: undefined, devicePixelRatio: undefined,
      innerWidth: undefined, innerHeight: undefined, requestAnimationFrame: undefined,
      addEventListener: undefined, PerformanceObserver: undefined });
    ck('loadPerf() does not throw with every browser API absent', true);
  } catch (e) { ck('loadPerf() does not throw with every browser API absent', false, e.message); return; }
  var s;
  try { s = sc.perf.summary(); ck('summary() does not throw', true); }
  catch (e) { ck('summary() does not throw', false, e.message); return; }

  ck('env present', !!s.env);
  ck('env.user_agent null (no navigator)', s.env.user_agent === null);
  ck('env.device_pixel_ratio null', s.env.device_pixel_ratio === null);
  ck('env.screen null (no screen)', s.env.screen === null);
  ck('env.hardware_concurrency null', s.env.hardware_concurrency === null);
  ck('env.device_memory null', s.env.device_memory === null);
  ck('env.gl_renderer null (no document/canvas)', s.env.gl_renderer === null);
  ck('env.software_gl false', s.env.software_gl === false);
  ck('visibility present', !!s.visibility);
  ck('visibility.hidden_ms 0, hidden_count 0', s.visibility.hidden_ms === 0 && s.visibility.hidden_count === 0);
  ck('visibility.has_focus null (no document)', s.visibility.has_focus === null);
  ck('raf present', !!s.raf);
  ck('raf.last null (no requestAnimationFrame)', s.raf.last === null);
  ck('raf.paint_broadcast_ratio null (no broadcasts yet)', s.raf.paint_broadcast_ratio === null);
  ck('loaf null (no PerformanceObserver)', s.loaf === null);
})();

head('env: WebGL probe degrades without throwing when the canvas has no WebGL context');
(function () {
  var sc = scenario({ glMode: 'none' });
  var s = sc.perf.summary();
  ck('gl_renderer null when getContext returns null', s.env.gl_renderer === null);
  ck('software_gl false when there is no WebGL', s.env.software_gl === false);
})();

head('env: deviceMemory missing (older Firefox/Safari) degrades to null, not undefined');
(function () {
  var sc = scenario({ navigator: { userAgent: 'X', hardwareConcurrency: 4 } });   // no deviceMemory field
  var s = sc.perf.summary();
  ck('device_memory is null, not undefined (JSON round-trip safety)', s.env.device_memory === null,
    JSON.stringify(s.env.device_memory));
  ck('hardware_concurrency still reported', s.env.hardware_concurrency === 4);
})();

head('env: the WebGL probe is deferred to the first summary() call, cached, and released');
(function () {
  var glStats = { contextsCreated: 0, lost: false };
  var doc = makeDocument('hardware', glStats);
  var sc = scenario({ document: doc, t0: 0 });
  feed(sc.perf, { intervalMs: 100, stepMs: 5, renderMs: 2, nominal: 100 }, 3);
  ck('no WebGL context is created by broadcast() alone', glStats.contextsCreated === 0, glStats.contextsCreated);
  var s1 = sc.perf.summary();
  ck('the probe runs on the first summary() call', glStats.contextsCreated === 1, glStats.contextsCreated);
  ck('gl_renderer is populated once the probe has run', !!s1.env.gl_renderer, s1.env.gl_renderer);
  ck('the context is released immediately (WEBGL_lose_context.loseContext() called)', glStats.lost === true);
  sc.perf.summary(); sc.perf.summary();
  ck('later summary() calls do not re-probe (cached)', glStats.contextsCreated === 1, glStats.contextsCreated);
})();

/* ============================================================== 3a. env: GPU string ====== */
head('env: hardware vs. software GPU strings are told apart');
(function () {
  var hw = scenario({ glMode: 'hardware' }).perf.summary();
  ck('hardware renderer NOT flagged as software', hw.env.software_gl === false, hw.env.gl_renderer);
  var sw = scenario({ glMode: 'software' }).perf.summary();
  ck('software renderer string is captured', /swiftshader/i.test(sw.env.gl_renderer || ''), sw.env.gl_renderer);
  ck('software renderer IS flagged as software', sw.env.software_gl === true);
})();

/* ============================================================== 3b. visibility =========== */
head('visibility: hidden/blurred time and counts are measured over the session');
(function () {
  var sc = scenario({ t0: 0 });
  var perf = sc.perf, doc = sc.doc;
  doc.hidden = true; doc._fire('visibilitychange');            // hidden from t=0
  clockState.t = 500;
  doc.hidden = false; doc._fire('visibilitychange');           // -> 500 ms hidden, 1x
  clockState.t = 1000; winFire('blur');                        // unfocused from t=1000
  clockState.t = 1300; winFire('focus');                       // -> 300 ms blurred, 1x
  var s = perf.summary();
  ck('hidden_ms measured', s.visibility.hidden_ms === 500, s.visibility.hidden_ms);
  ck('hidden_count measured', s.visibility.hidden_count === 1);
  ck('blurred_ms measured', s.visibility.blurred_ms === 300, s.visibility.blurred_ms);
  ck('blurred_count measured', s.visibility.blurred_count === 1);
  ck('session_ms spans from module load to now', s.visibility.session_ms === 1300, s.visibility.session_ms);
  ck('has_focus reflects document.hasFocus()', s.visibility.has_focus === true);
})();

/* ============================================================== 3c. raf burst ============= */
head('raf: an independent cadence sample is taken and cached synchronously');
(function () {
  var sc = scenario({ t0: 0 });
  var s1 = sc.perf.summary();                          // kicks the burst off; nothing done yet
  ck('raf.last null before the burst completes', s1.raf.last === null);
  pumpRaf(40, 16.7);                                    // drain the 30-callback burst at ~60 Hz
  var s2 = sc.perf.summary();
  ck('raf.last populated once the burst completes', !!s2.raf.last);
  ck('raf.last.median_ms matches the simulated frame time', Math.abs(s2.raf.last.median_ms - 16.7) < 0.01, s2.raf.last.median_ms);
  ck('raf.last.n is 29 (30 callbacks -> 29 intervals)', s2.raf.last.n === 29, s2.raf.last.n);
  feed(sc.perf, { intervalMs: 50, stepMs: 1, renderMs: 1, nominal: 100 }, 3);
  var s3 = sc.perf.summary();
  ck('paint_broadcast_ratio reflects paints/broadcasts once both exist', s3.raf.paint_broadcast_ratio === 1, s3.raf.paint_broadcast_ratio);
})();

/* ============================================================== 3d. loaf percentiles ====== */
head('loaf: style+layout percentiles are computed from observed long-animation-frame entries');
(function () {
  var sc = scenario({ t0: 0 });
  var entries = [];
  [5, 6, 7, 5, 6].forEach(function (sl, i) { entries.push(mkLoafEntry(1000 + i * 20, sl)); });
  [40, 45, 50].forEach(function (sl, i) { entries.push(mkLoafEntry(1200 + i * 20, sl)); });
  FakePO.fireLast(entries);
  var s = sc.perf.summary();
  ck('loaf present when PerformanceObserver supports the entry type', !!s.loaf);
  ck('loaf.n counts the observed entries', s.loaf.n === entries.length, s.loaf.n);
  ck('loaf.style_layout_p95 reflects the heavy frames', s.loaf.style_layout_p95 >= 40, s.loaf.style_layout_p95);
  ck('loaf.duration_p50 is a number', typeof s.loaf.duration_p50 === 'number');
})();
head('loaf: the ring caps at the last 60 entries');
(function () {
  var sc = scenario({ t0: 0 });
  var many = [];
  for (var i = 0; i < 65; i++) many.push(mkLoafEntry(1000 + i * 20, 5));
  FakePO.fireLast(many);
  var s = sc.perf.summary();
  ck('n caps at 60', s.loaf.n === 60, s.loaf.n);
})();

/* ============================================================== 4. verdict: old branches == */
head('verdict: the four ORIGINAL branches still fire under the old conditions');
(function () {
  var s0 = scenario({ t0: 0 }).perf.summary();
  ck('"not enough samples yet" before any broadcast/render', s0.verdict === 'not enough samples yet', s0.verdict);

  var compute = scenario({ t0: 0 }).perf;
  feed(compute, { intervalMs: 100, stepMs: 70, renderMs: 2, nominal: 100 }, 20);
  ck('COMPUTE-BOUND when physics dominates the budget', /^COMPUTE-BOUND/.test(compute.summary().verdict), compute.summary().verdict);

  var render = scenario({ t0: 0 }).perf;
  feed(render, { intervalMs: 100, stepMs: 2, renderMs: 50, nominal: 100 }, 20);
  ck('RENDER-BOUND when the DOM pass dominates', /^RENDER-BOUND/.test(render.summary().verdict), render.summary().verdict);

  var slip = scenario({ t0: 0 }).perf;
  feed(slip, { intervalMs: 198, stepMs: 2, renderMs: 2, nominal: 100 }, 20);
  ck('THE LOOP IS SLIPPING when broadcasts arrive late with both stages cheap', /^THE LOOP IS SLIPPING/.test(slip.summary().verdict), slip.summary().verdict);

  var healthy = scenario({ t0: 0 }).perf;
  feed(healthy, { intervalMs: 38, stepMs: 2, renderMs: 2, nominal: 100 }, 20);
  ck('healthy when everything is cheap and on time', /^healthy/.test(healthy.summary().verdict), healthy.summary().verdict);
})();

/* ============================================================== 4a2. verdict: WARP budget = */
/* #631. The WARP tier is handed 70 of the 100 ms broadcast deliberately — it runs only on a
 * quiet plant and drops to 60x the moment one moves — so a WARP broadcast sitting inside that
 * budget is the feature working. The OLD verdict called it COMPUTE-BOUND and told the player to
 * lower the speed, which is the "warn on every machine at the top rung" failure the achieved-rate
 * ruling names. The DISCRIMINATOR is deliberate: the same numbers on PLAY must still read as the
 * plain sentence, and WARP physics well PAST its budget must too. */
var WARP_PACING = { tier: 'warp', step_budget_ms: 70 };
var PLAY_PACING = { tier: 'play', step_budget_ms: 40 };
/* PLAY configured with the WARP figure — not what ships, but the ONLY fixture in which `tier`
 * is the single differing field. With the shipped 40 a PLAY broadcast costing 68 ms is already
 * over its own budget, so it falls through for the SECOND reason and a mutation that deletes
 * the tier test entirely stays green. That is the hollow-check shape, and it was: the first cut
 * of this section used PLAY_PACING here and the mutation came back BLIND. */
var PLAY_AT_WARP_BUDGET = { tier: 'play', step_budget_ms: 70 };
head('verdict: WARP spending its own step budget is not a fault (#631)');
(function () {
  var warp = scenario({ t0: 0 }).perf;
  feed(warp, { intervalMs: 100, stepMs: 68, renderMs: 2, nominal: 100, pacing: WARP_PACING }, 20);
  var vWarp = warp.summary().verdict;
  ck('WARP inside its budget says so', /^COMPUTE-BOUND — SPENDING THE WARP BUDGET/.test(vWarp), vWarp);
  ck('…and keeps the COMPUTE-BOUND prefix (ui/app.js renderPerf regexes it)', /^COMPUTE-BOUND/.test(vWarp));
  ck('…and names the budget it is spending', /70 ms WARP/.test(vWarp), vWarp);
  var sw = warp.summary();
  ck('summary carries the tier', sw.tier === 'warp', sw.tier);
  ck('summary carries the effective step budget', sw.step_budget_ms === 70, sw.step_budget_ms);

  // THE DISCRIMINATOR: identical timings AND an identical budget, PLAY tier. Only `tier` differs.
  var play = scenario({ t0: 0 }).perf;
  feed(play, { intervalMs: 100, stepMs: 68, renderMs: 2, nominal: 100, pacing: PLAY_AT_WARP_BUDGET }, 20);
  var vPlay = play.summary().verdict;
  ck('the same timings and the same budget on PLAY read as the plain COMPUTE-BOUND fault', /^COMPUTE-BOUND — the physics/.test(vPlay), vPlay);

  // …and the SHIPPED PLAY budget (40 ms) over-run, which is a genuine fault on that tier.
  var playShipped = scenario({ t0: 0 }).perf;
  feed(playShipped, { intervalMs: 100, stepMs: 68, renderMs: 2, nominal: 100, pacing: PLAY_PACING }, 20);
  ck('PLAY over its shipped 40 ms budget is the plain fault too', /^COMPUTE-BOUND — the physics/.test(playShipped.summary().verdict), playShipped.summary().step_budget_ms);

  // WARP physics well past what it was allowed is not "spending a budget", it is missing one.
  var over = scenario({ t0: 0 }).perf;
  feed(over, { intervalMs: 100, stepMs: 140, renderMs: 2, nominal: 100, pacing: WARP_PACING }, 20);
  var vOver = over.summary().verdict;
  ck('WARP at 2x its budget falls through to the plain sentence', /^COMPUTE-BOUND — the physics/.test(vOver), vOver);

  // An older snapshot carries no pacing block at all — the branch must not fire on a guess.
  var bare = scenario({ t0: 0 }).perf;
  feed(bare, { intervalMs: 100, stepMs: 68, renderMs: 2, nominal: 100 }, 20);
  var vBare = bare.summary().verdict;
  ck('no pacing block on the broadcast: the plain sentence, and tier null', /^COMPUTE-BOUND — the physics/.test(vBare) && bare.summary().tier === null, vBare);

  // A WARP broadcast that is cheap is still healthy — the branch is inside the compute test.
  var quiet = scenario({ t0: 0 }).perf;
  feed(quiet, { intervalMs: 38, stepMs: 2, renderMs: 2, nominal: 100, pacing: WARP_PACING }, 20);
  ck('a cheap WARP broadcast is still "healthy", not a budget sentence', /^healthy/.test(quiet.summary().verdict), quiet.summary().verdict);
})();

/* ============================================================== 4b. verdict: new branches = */
head('verdict: PAINTS ARE BEING DROPPED splits into the causes the new data can tell apart');
(function () {
  // (a) tab backgrounded — dominates even when other causes are ALSO true (priority order)
  var bg = scenario({ t0: 0, glMode: 'software' });    // also software-rendered, on purpose
  dropConditionFeed(bg.perf);
  bg.doc.hidden = true; bg.doc._fire('visibilitychange');
  clockState.t += 600;                                  // >=30% of the session hidden
  bg.doc.hidden = false; bg.doc._fire('visibilitychange');
  var vBg = bg.perf.summary().verdict;
  ck('TAB WAS BACKGROUNDED fires when hidden share crosses the threshold', /^PAINTS ARE BEING DROPPED — TAB WAS BACKGROUNDED/.test(vBg), vBg);
  ck('…and wins over software rendering, which is ALSO true here', !/SOFTWARE RENDERING/.test(vBg), vBg);

  // (a2) the window loses FOCUS (blur) for a large share of the session but the tab is never
  // HIDDEN — review fix (#613 wave 3 stream 2): Chrome/Edge throttle rAF for hidden/occluded
  // tabs, not for a window that merely lost focus, and the owner routinely types in another
  // window while the sim keeps running. A blur-inclusive share would misattribute a real
  // raster problem to "the tab"; this must fall through to another cause instead.
  var blurOnly = scenario({ t0: 0, glMode: 'hardware' });
  dropConditionFeed(blurOnly.perf);
  winFire('blur');
  clockState.t += 600;                                  // would be >=30% by the OLD hidden+blurred share
  winFire('focus');
  var vBlur = blurOnly.perf.summary().verdict;
  ck('a long window BLUR alone does NOT read as TAB WAS BACKGROUNDED', !/TAB WAS BACKGROUNDED/.test(vBlur), vBlur);
  ck('…falls through to the generic compositor sentence (no software/layout cause here either)',
    /^PAINTS ARE BEING DROPPED — the compositor cannot paint/.test(vBlur), vBlur);

  // (b) software rendering, no backgrounding
  var sw = scenario({ t0: 0, glMode: 'software' });
  dropConditionFeed(sw.perf);
  var vSw = sw.perf.summary().verdict;
  ck('SOFTWARE RENDERING fires when the GPU is software and the tab was never hidden', /^PAINTS ARE BEING DROPPED — SOFTWARE RENDERING/.test(vSw), vSw);

  // (c) software rendering wins over layout-bound when both are true
  var swLayout = scenario({ t0: 0, glMode: 'software' });
  dropConditionFeed(swLayout.perf);
  FakePO.fireLast([mkLoafEntry(1000, 40), mkLoafEntry(1050, 45), mkLoafEntry(1100, 50)]);
  var vSwLayout = swLayout.perf.summary().verdict;
  ck('SOFTWARE RENDERING wins over layout-bound when both are true', /^PAINTS ARE BEING DROPPED — SOFTWARE RENDERING/.test(vSwLayout), vSwLayout);

  // (d) layout-bound alone (hardware GPU, not hidden)
  var layout = scenario({ t0: 0, glMode: 'hardware' });
  dropConditionFeed(layout.perf);
  FakePO.fireLast([mkLoafEntry(1000, 40), mkLoafEntry(1050, 45), mkLoafEntry(1100, 50)]);
  var vLayout = layout.perf.summary().verdict;
  ck('LAYOUT-BOUND fires when style+layout p95 exceeds the threshold', /^PAINTS ARE BEING DROPPED — LAYOUT-BOUND/.test(vLayout), vLayout);

  // (e) none of the three explain it -> the original blunt fallback sentence, unchanged claim
  var none = scenario({ t0: 0, glMode: 'hardware' });
  dropConditionFeed(none.perf);
  var vNone = none.perf.summary().verdict;
  ck('falls through to the original compositor/GPU sentence when nothing else explains it',
    /^PAINTS ARE BEING DROPPED — the compositor cannot paint/.test(vNone), vNone);
})();

/* ============================================================== 5. injection self-test ==== */
head('injection self-test — each mutation MUST redden the check it defangs');

function backgroundedVerdict(src) {
  var sc = scenario({ t0: 0, src: src });
  dropConditionFeed(sc.perf);
  sc.doc.hidden = true; sc.doc._fire('visibilitychange');
  clockState.t += 600;
  sc.doc.hidden = false; sc.doc._fire('visibilitychange');
  return sc.perf.summary().verdict;
}
function softwareVerdict(src) {
  var sc = scenario({ t0: 0, glMode: 'software', src: src });
  dropConditionFeed(sc.perf);
  return sc.perf.summary().verdict;
}
// A long window BLUR with the tab never hidden. `picksIntended` here means the FIX holds —
// blur alone must never read as TAB WAS BACKGROUNDED (review fix, #613 wave 3 stream 2).
function blurOnlyVerdict(src) {
  var sc = scenario({ t0: 0, glMode: 'hardware', src: src });
  dropConditionFeed(sc.perf);
  winFire('blur');
  clockState.t += 600;
  winFire('focus');
  return sc.perf.summary().verdict;
}

// #631: the WARP-budget branch, run on the two cases that define its edges.
function playAtWarpCostVerdict(src) {
  var sc = scenario({ t0: 0, src: src });
  feed(sc.perf, { intervalMs: 100, stepMs: 68, renderMs: 2, nominal: 100, pacing: PLAY_AT_WARP_BUDGET }, 20);
  return sc.perf.summary().verdict;
}
function warpOverBudgetVerdict(src) {
  var sc = scenario({ t0: 0, src: src });
  feed(sc.perf, { intervalMs: 100, stepMs: 140, renderMs: 2, nominal: 100, pacing: WARP_PACING }, 20);
  return sc.perf.summary().verdict;
}

var MUTATIONS = [
  {
    name: 'the WARP-budget branch stops checking the TIER (PLAY gets the excuse too)',
    anchor: "if (s.tier === 'warp' && s.step_budget_ms > 0",
    replace: 'if (s.step_budget_ms > 0',
    run: playAtWarpCostVerdict,
    picksIntended: function (v) { return /^COMPUTE-BOUND — the physics/.test(v); },
  },
  {
    name: 'BUDGET_OVERSHOOT raised until no overrun can fall through (the branch excuses anything)',
    anchor: 'var BUDGET_OVERSHOOT = 1.4;',
    replace: 'var BUDGET_OVERSHOOT = 99;',
    run: warpOverBudgetVerdict,
    picksIntended: function (v) { return /^COMPUTE-BOUND — the physics/.test(v); },
  },
  {
    name: 'HIDDEN_SHARE_WARN raised past 1.0 (unreachable — hiddenShare is a fraction <= 1)',
    anchor: 'var HIDDEN_SHARE_WARN = 0.3;',
    replace: 'var HIDDEN_SHARE_WARN = 1.1;',
    run: backgroundedVerdict,
    picksIntended: function (v) { return /^PAINTS ARE BEING DROPPED — TAB WAS BACKGROUNDED/.test(v); },
  },
  {
    name: 'software_gl regex defanged to a marker that never appears',
    anchor: "e.software_gl = /swiftshader|software|llvmpipe|basic render/i.test(e.gl_renderer);",
    replace: "e.software_gl = /nonexistent-marker-xyz/i.test(e.gl_renderer);",
    run: softwareVerdict,
    picksIntended: function (v) { return /^PAINTS ARE BEING DROPPED — SOFTWARE RENDERING/.test(v); },
  },
  {
    name: 'hiddenShare re-widened to include blurred_ms (misattributes a mere window blur to the tab)',
    anchor: 'var hiddenShare = (vis && vis.session_ms > 0) ? (vis.hidden_ms / vis.session_ms) : 0;',
    replace: 'var hiddenShare = (vis && vis.session_ms > 0) ? ((vis.hidden_ms + vis.blurred_ms) / vis.session_ms) : 0;',
    run: blurOnlyVerdict,
    picksIntended: function (v) { return !/TAB WAS BACKGROUNDED/.test(v); },
  },
];

var blind = 0;
MUTATIONS.forEach(function (m) {
  if (PERF_SRC.indexOf(m.anchor) === -1) {
    ck('anchor found in ui/perf.js: ' + m.name, false, 'anchor text missing — perf.js changed shape, update this gate');
    blind++;
    return;
  }
  var before = m.run(PERF_SRC);
  ck('unmutated: ' + m.name, m.picksIntended(before), before);

  var mutatedSrc = PERF_SRC.split(m.anchor).join(m.replace);
  var after = m.run(mutatedSrc);
  if (m.picksIntended(after)) {
    ck('MUTATION CAUGHT: ' + m.name, false, 'the check\'s invariant still held after the mutation — BLIND SPOT');
    blind++;
  } else {
    ck('MUTATION CAUGHT: ' + m.name, true, after);
  }
});

/* ============================================================== tally ===================== */
console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS **' : ', no blind spots'));
console.log('  run_perf_summary: ' + nPass + ' passed, ' + nFail + ' failed  (' + (nPass + nFail) + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((nFail > 0 || blind > 0) ? 1 : 0);
