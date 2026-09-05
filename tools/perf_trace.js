/* perf_trace.js — WHERE DOES THE FRAME GO WHEN THE MAIN THREAD IS FREE?
 *
 * Run: node tools/perf_trace.js --help
 *
 * WHY THIS EXISTS
 * ---------------
 * The PWR2 control room runs at ~4.6 fps in the owner's browser with the JS render pass at
 * 16 ms, the physics step at 1.8 ms, broadcasts arriving on time every 104 ms, and only half
 * of them painted. `ui/perf.js` measures exactly those three stages and its verdict is
 * "PAINTS ARE BEING DROPPED — more broadcasts than frames, with both stages inside budget."
 * That verdict is a dead end by construction: it says the cost is NOT ours, and then stops.
 * The browser is withholding requestAnimationFrame callbacks while our main thread is idle,
 * which means the cost is downstream of JS — raster, compositing, or the GPU.
 *
 * Issue #596 measured this class once, with SCRATCH probes that were never committed
 * (28,765 Paint events and 8.9 s of raster per 15 s with the board animations on, 3.8 s with
 * them off). The number was right and the instrument is gone, so #613 had to start over.
 * This file is that instrument made durable: the same measurement, reproducible by a command,
 * with the A/B knobs that separate the suspects.
 *
 * WHAT IT MEASURES
 * ----------------
 * It drives the real shipped shell (`ui/shell.html`) over a local HTTP server in Playwright's
 * Chromium, lets the plant settle, then records a Chrome trace over a fixed wall-clock window
 * and adds up, per thread class:
 *
 *   main       CrRendererMain — RunTask (thread busy), FunctionCall, UpdateLayoutTree,
 *              Layout, PrePaint, Paint, Layerize/UpdateLayerTree, CompositeLayers, Commit
 *   raster     RasterTask and ImageDecodeTask, summed BY EVENT NAME across every thread —
 *              this is the term #596 found dominant and it never appears in ui/perf.js's
 *              numbers. Do NOT key it on a thread name; see classifyThread for what that cost.
 *   compositor Compositor thread — the frame pipeline's main-thread-independent half
 *   gpu        CrGpuMain / VizCompositor busy time
 *
 * plus Paint's invalidated clip AREA (Paint carries `args.data.clip` as a quad), a
 * top-layers-by-raster-ms table keyed on `args.tileData.layerId`, a compositor LAYER COUNT
 * read out of CDP `LayerTree`, and the page's own `RD.Perf.summary()` so the trace numbers
 * can be checked against the instrument the owner's bug reports carry.
 *
 * WHAT IT CANNOT MEASURE — read this before quoting a number at anyone
 * -------------------------------------------------------------------
 *  1. THE OWNER'S MACHINE. This is Playwright's Chromium on THIS box. His symptom is Edge on
 *     his Windows box with his GPU, his display scaling, his extensions. A ratio measured here
 *     (knob X removes N% of raster) transfers better than an absolute (raster was N ms).
 *  2. HEADLESS RASTER IS NOT HEADED RASTER. Headless Chromium usually has no GPU rasterization
 *     at all, so the default mode here may already be closer to `--software` than to what he
 *     runs. The tool prints the WebGL unmasked renderer and the raster thread names it saw, so
 *     the mode in effect is in the artifact rather than assumed. Use `--headed` to compare.
 *  3. WHETHER A FIX WILL HELP HIM. A knob that removes raster here is a HYPOTHESIS about his
 *     frame rate, not a measurement of it. The only instrument that answers that is his next
 *     bug report (`RD.Perf` rides along in it).
 *  4. ANYTHING ABOUT THE PLANT. This steps real physics only so the board has something to
 *     animate. No number here is a plant-dynamics claim.
 *  5. THE SYMPTOM ITSELF. Measured 2026-09-04: headless Chromium here draws a steady 60
 *     compositor frames a second and RD.Perf reports ~8.9 fps of APP paints, which is the
 *     broadcast ceiling (the app paints once per 100 ms broadcast) and not a dropped frame.
 *     So this harness does NOT reproduce the owner's 4.6 fps, and it is not trying to. What it
 *     measures is how much raster the board COSTS per frame; the frame-rate consequence of
 *     that cost is his machine's, and only his report closes the loop.
 *
 * THE `?ff=` TRAP — it is NOT a speed
 * -----------------------------------
 * `ui/app.js` (~:9002) reads `?ff=N` as a BOOT FAST-FORWARD of N SIM SECONDS: it sets speed 60,
 * advances, and sets speed back to 1. So `?ff=10` leaves the plant at 1x, not 10x. Time
 * acceleration is a separate thing and is set here by clicking the shipped `#speed` segment
 * (`--speed=`). `--ff=` and `--speed=` are both exposed and they are different knobs.
 *
 * A/B KNOBS (`--ab=name,name`) — all injected FROM OUTSIDE the product after load, so nothing
 * under ui/ is edited to take a measurement. Every knob is VERIFIED and the verification is
 * printed; a knob that did not take is reported as DID-NOT-TAKE and its cell must not be read
 * as a result.
 *
 *   nofilter   `filter: none !important` on everything. Kills the fourteen SVG feGaussianBlur
 *              glows on the board art (comp_reactor_vessel 9/11, comp_steam_generator 8/4,
 *              comp_pressurizer 7, comp_condenser 9, comp_turbine_generator 10, comp_pump 6,
 *              comp_porv 6, comp_atmospheric_dump 5/3.2, comp_cooling_tower 4, the three
 *              comp_valve* 6). A CSS property beats an SVG presentation attribute, which is
 *              why this works on `filter="url(#…)"` markup. Verified by getComputedStyle.
 *   noflow     Strips `data-dash-cyc` from the pipe polylines, which is the selector
 *              `flowTick` (ui/diagram/board/std_pipe.js:~285) iterates to write
 *              `stroke-dashoffset` at up to 24 Hz. 69 polylines x 24 Hz is ~1,650 stroke
 *              invalidations a second on an SVG that is NOT layer-promoted. The strip must
 *              REPEAT (the board re-authors pipes as flow states change and the attribute
 *              comes back) — see the knob for the measurement that proved it. Verified by
 *              sampling stroke-dashoffset across the window and by counting attribute
 *              mutations for 1 s afterwards; judged on the residual WRITE RATE.
 *   noanim     `animation: none !important` — the CSS keyframe decoration (flowmove, bubbles,
 *              spins, puffs, rain) that `tickAnimations` pauses and seeks. Verified by
 *              counting elements with a computed animation-name.
 *   notransition  `transition: none !important` on everything. THE FRAME PRODUCER, measured
 *              2026-09-04: compositor draws 870 -> 337 per 15 s (-61 %), compositor busy -32 %,
 *              GPU busy -25 %, while raster moves only -12 %. Of the ~96 animations on a settled
 *              board, ZERO keyframe animations are ever running (tickAnimations pauses them all)
 *              and 6-7 CSSTransitions always are — 150 ms transitions on `height`/`y`/`transform`
 *              of board rects and lines, restarted by every broadcast so they are never idle.
 *              The declarations are INLINE styles, and an author !important rule beats one.
 *   nolevels   The same, restricted to the continuously-restarted set (CSS for `.g-band .needle`
 *              and `.rodbar > span`, plus a 100 ms inline-style sweep over `.pwr-board-stage` for
 *              `0.15s linear` / `transform 0.3s linear` / `all 0.35s ease`). Measured 339 frames
 *              against notransition's 337: the level indicators are the WHOLE win and the
 *              one-shot transitions (a valve rotate, a stroke colour) cost nothing.
 *   nopulse    Pauses every running animation via `a.pause()`, swept every 100 ms. Kept because
 *              it was asked for, but it is the WEAKER control: a sweep cannot catch a 150 ms
 *              transition that starts and ends between two sweeps, and it recovers only a third
 *              of the frames (584) that `notransition` does. Use it to measure the METHOD.
 *   noclock    Drops the shared flow clock's own rAF request (std_pipe's `flowTick`, refused by
 *              name). ALONE IT BACKFIRES — the clock is also what pauses every keyframe
 *              animation the board re-authors, so frames went 450 -> 901 — use it WITH noanim:
 *              `noclock,noanim` measured 136 frames against 155 app paints on the fixed tree,
 *              which attributes the ~190-frame residual after #613 wave 3 to the clock's 24 Hz
 *              request itself (a BeginMainFrame commits and draws even when nothing was written).
 *   nochart    `#chartCanvas { display: none }` — the strip chart's SVG, rebuilt via innerHTML.
 *              Verified by getClientRects; reported as a NO-OP if the chart was not on screen.
 *   pipelayer  `.pwr-board-stage > svg { will-change: transform }` — promotes the single
 *              absolutely-positioned pipe SVG (pwr_board.js:990, the first child of the stage,
 *              under every .bd-tile) to its own compositor layer. Nothing on the board is
 *              promoted today, so a dash write invalidates whatever shares its layer, which is
 *              the blurred art above it. Verified by the CDP layer count and the distinct
 *              RasterTask layerId count.
 *   tilelayer  pipelayer PLUS `.bd-tile { will-change: transform }` — every tile its own layer.
 *              Heavier on memory; isolates the filters completely. Same verification.
 *   static     nofilter + noflow + noanim — the raster FLOOR of this board.
 *
 * OTHER OPTIONS
 *   --init=<id>      initial condition (default hot_full_power)
 *   --inject=<ids>   comma list passed to ?inject=
 *   --secs=15        trace window, seconds
 *   --settle=5       seconds to run before the window opens
 *   --speed=10       time acceleration (clicks the shipped speed segment)
 *   --ff=10          ?ff= boot fast-forward in SIM seconds (see the trap above)
 *   --throttle=N     CDP Emulation.setCPUThrottlingRate
 *   --software       launch with --disable-gpu-rasterization --disable-gpu-compositing
 *   --headed         run headed (raster path differs from headless; slower, but closer)
 *   --label=<s>      row label in the printed table / JSON
 *   --json=<path>    write the numbers as JSON
 *   --trace=<path>   keep the raw trace JSON (openable in the DevTools performance panel)
 *
 * NOT A GATE. It lives in tools/, so `test/run_all.js` (which discovers test/run_*.js and
 * test/verify_*.js) never sees it and it needs no BASELINES entry. It has no pass/fail: it
 * prints numbers, and reading them is a person's job.
 */
'use strict';

var path = require('path');
var http = require('http');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');

/* ------------------------------------------------------------------ args */

function parseArgs(argv) {
  var o = {
    init: 'hot_full_power', inject: '', secs: 15, settle: 5, speed: 10, ff: 10,
    ab: '', throttle: 0, software: false, headed: false, label: '', json: '', trace: '',
  };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    var m = /^--([a-z]+)(?:=(.*))?$/.exec(a);
    if (!m) { console.error('unrecognised argument: ' + a); process.exit(2); }
    var k = m[1], v = m[2];
    if (k === 'help') { console.log(helpText()); process.exit(0); }
    else if (k === 'software' || k === 'headed') o[k] = true;
    else if (k === 'secs' || k === 'settle' || k === 'speed' || k === 'ff' || k === 'throttle') o[k] = +v;
    else if (k in o) o[k] = v == null ? '' : v;
    else { console.error('unrecognised option: --' + k); process.exit(2); }
  }
  return o;
}

function helpText() {
  var src = fs.readFileSync(__filename, 'utf8');
  var end = src.indexOf('*/');
  return src.slice(0, end + 2);
}

/* -------------------------------------------------------------- the knobs
 *
 * Each knob is {apply, verify}. `apply` runs in the page; `verify` runs in the page after the
 * measurement window and returns a small object that the caller judges. A knob whose verify
 * says it did not take makes the whole cell suspect — that is the #613 rule and the reason
 * every one of these has a verify at all. */

var KNOBS = {
  nofilter: {
    css: '*, *::before, *::after { filter: none !important; }',
    /* Count elements still reporting a computed filter. The SVG presentation attribute is the
     * lowest-priority author style, so any CSS rule beats it — this exists to PROVE that, not
     * to assume it. */
    verify: function () {
      var withAttr = document.querySelectorAll('[filter]');
      var still = 0, n = 0;
      for (var i = 0; i < withAttr.length; i++) {
        n++;
        var f = getComputedStyle(withAttr[i]).filter;
        if (f && f !== 'none') still++;
      }
      return { filter_attr_elements: n, still_filtered: still, took: n > 0 && still === 0 };
    },
  },
  noflow: {
    /* A ONE-SHOT STRIP DOES NOT HOLD, and the verify is what said so. Stripping
     * `data-dash-cyc` once left 2 of 69 polylines dashed and 27 stroke-dashoffset writes a
     * second still going: the board re-authors pipes as flow states change, and the attribute
     * comes back with them. So the strip repeats on a 100 ms interval, and the number of
     * re-adds it mopped up is reported — a knob that has to keep working is a fact about the
     * board, not an implementation detail to bury.
     *
     * The interval's own cost lands inside the measurement window: one querySelectorAll every
     * 100 ms, ~150 calls over a 15 s window. That is under a millisecond in total against the
     * seconds of raster being measured, and it is the same in every noflow cell. */
    apply: function () {
      function strip() {
        var els = document.querySelectorAll('polyline[data-dash-cyc]');
        for (var i = 0; i < els.length; i++) {
          els[i].setAttribute('data-dash-cyc-off', els[i].getAttribute('data-dash-cyc'));
          els[i].removeAttribute('data-dash-cyc');
        }
        window.__noflowReAdds = (window.__noflowReAdds || 0) + els.length;
        return els.length;
      }
      var n0 = strip();
      window.__noflowReAdds = 0;
      window.__noflowTimer = setInterval(strip, 100);
      return { stripped_at_apply: n0 };
    },
    /* Two independent checks. (a) the selector flowTick iterates is empty; (b) nothing is
     * writing stroke-dashoffset any more — counted with a MutationObserver over 1 s AFTER the
     * trace window, so the observer's own cost never lands inside a measurement. The nominal
     * rate this is compared against is ~69 polylines x 24 Hz = ~1,650 writes/s, so the <=40
     * allowance below is under 3 % leakage through the 100 ms re-strip gap, not "close enough".
     * `took` is judged on the WRITE RATE, not on the live element count: a pipe re-authored in
     * the instant before the check is counted as live and has still written nothing. */
    verify: function () {
      var live = document.querySelectorAll('polyline[data-dash-cyc]').length;
      var readds = window.__noflowReAdds || 0;
      return new Promise(function (res) {
        var hits = 0;
        var obs = new MutationObserver(function (recs) { hits += recs.length; });
        var all = document.querySelectorAll('polyline[data-dash-cyc], polyline[data-dash-cyc-off]');
        for (var i = 0; i < all.length; i++) {
          obs.observe(all[i], { attributes: true, attributeFilter: ['stroke-dashoffset'] });
        }
        setTimeout(function () {
          obs.disconnect();
          res({ dashed_polylines_live: live, dashoffset_writes_per_s: hits, re_adds_mopped: readds,
                took: hits <= 40 });
        }, 1000);
      });
    },
  },
  noanim: {
    css: '*, *::before, *::after { animation: none !important; }',
    verify: function () {
      var all = document.querySelectorAll('*'), still = 0;
      for (var i = 0; i < all.length; i++) {
        var an = getComputedStyle(all[i]).animationName;
        if (an && an !== 'none') still++;
      }
      return { still_animating: still, took: still === 0 };
    },
  },
  /* THE RESIDUAL after the transitions were removed (#613 wave 3, round 4). On the fixed tree the
   * compositor still drew 442 frames / 15 s against 249 app paints, and `noanim` (439) and
   * `noflow` (442) moved nothing. The remaining requester is the shared flow clock ITSELF:
   * std_pipe.js's setInterval asks for a rAF 24 times a second, and a BeginMainFrame commits
   * and draws whether or not the callback wrote anything. This knob drops exactly that request:
   * std_pipe reads `window.requestAnimationFrame` at call time and hands it a function NAMED
   * flowTick, so a wrapper that refuses by name stops the clock and nothing else (its
   * `flowRafPend` latch then stays set and the interval returns early for ever). A first draft
   * swept clearInterval over every id and killed the simulation service's own timer with it —
   * 0 broadcasts, 0 frames, a "result" about nothing. What is left is the app's own paints.
   * Verify: the dashes stop moving and the paused animations stop seeking. */
  noclock: {
    apply: function () {
      var orig = window.requestAnimationFrame.bind(window);
      window.__noclockDropped = 0;
      window.requestAnimationFrame = function (fn) {
        if (fn && fn.name === 'flowTick') { window.__noclockDropped++; return 0; }
        return orig(fn);
      };
      return { wrapped: true };
    },
    verify: function () {
      var pl = document.querySelector('polyline[data-dash-cyc]');
      var an = document.getAnimations ? document.getAnimations().filter(function (a) { return a.playState === 'paused'; })[0] : null;
      var d0 = pl ? pl.getAttribute('stroke-dashoffset') : null;
      var t0 = an ? an.currentTime : null;
      return new Promise(function (res) {
        setTimeout(function () {
          var d1 = pl ? pl.getAttribute('stroke-dashoffset') : null;
          var t1 = an ? an.currentTime : null;
          res({ dash_moved: d0 !== d1, anim_seeked: t0 !== t1, took: d0 === d1 && t0 === t1 });
        }, 1000);
      });
    },
  },
  /* THE FRAME PRODUCER (#613 wave 3, 2026-09-04). Everything about this board says it should
   * not need 60 Hz: the app paints once per broadcast (~17 Hz at 10x), the shared flow clock is
   * 24 Hz, and `tickAnimations` PAUSES every CSS keyframe animation and seeks it. Measured on
   * the settled baseline, `document.getAnimations()` is 95 entries — and 89 of them are
   * `paused`, exactly as std_pipe intends. The 6 that are RUNNING are all `CSSTransition`:
   * 150 ms transitions on `height`, `y` and `transform` of `<rect>`/`<line>` inside
   * `.pwr-board-stage` — level bars and needles, restarted every time the app writes a new
   * value. `height` and `y` are not compositor-animatable properties, so each one demands a
   * main-thread lifecycle update per vsync, which is what `ProxyMain::BeginMainFrame` = 825 per
   * 15 s (55 Hz) is.
   *
   * `nopulse` pauses them the way the brief asked (`a.pause()`, swept repeatedly because the
   * board re-authors elements and a NEW transition starts on the next value write). `notrans`
   * is the definitive control: a transition that never starts cannot be missed by a sweep. */
  nopulse: {
    apply: function () {
      function pauseAll() {
        var n = 0;
        document.getAnimations().forEach(function (a) {
          if (a.playState === 'running') { try { a.pause(); n++; } catch (e) {} }
        });
        window.__nopulsePaused = (window.__nopulsePaused || 0) + n;
        return n;
      }
      var n0 = pauseAll();
      window.__nopulsePaused = 0;
      /* 100 ms, not the 500 ms first proposed: a transition here is 150 ms long, so a 500 ms
       * sweep would let most of them run to completion and the knob would measure nothing. */
      window.__nopulseTimer = setInterval(pauseAll, 100);
      return { paused_at_apply: n0 };
    },
    verify: function () {
      var all = document.getAnimations();
      var running = all.filter(function (a) { return a.playState === 'running'; });
      return { animations: all.length, still_running: running.length,
               kinds: running.map(function (a) { return a.constructor.name + ':' + (a.transitionProperty || a.animationName || '?'); }).slice(0, 8),
               paused_over_window: window.__nopulsePaused || 0,
               took: running.length <= 1 };
    },
  },
  notransition: {
    /* The declarations are INLINE (`style: { transition: 'y 0.15s linear, height 0.15s linear' }`
     * in comp_steam_generator/comp_pressurizer/comp_reactor_vessel/comp_valve), and an inline
     * style is not !important — so an author rule with !important still beats it. */
    css: '*, *::before, *::after { transition: none !important; }',
    verify: function () {
      var running = document.getAnimations().filter(function (a) { return a.playState === 'running'; });
      var trans = running.filter(function (a) { return a.constructor.name === 'CSSTransition'; });
      return { still_running: running.length, still_transitioning: trans.length, took: trans.length === 0 };
    },
  },
  /* THE TARGETED HALF: only the continuously-restarted level/needle/rod transitions, not the
   * one-shot ones (a valve's 0.4 s rotate, a stroke or fill colour change) which fire on an
   * event and then stop. If `nolevels` captures the whole `notransition` win, the one-shots are
   * free and only the level indicators need changing. Two mechanisms because the board declares
   * these two ways: CSS for the HTML tiles, and an inline-style sweep for the SVG art, which
   * has no classes to select on and is re-authored as values change. */
  nolevels: {
    css: '.g-band .needle, .rodbar > span { transition: none !important; }',
    apply: function () {
      var RE = /0\.15s linear|transform 0\.3s linear|all 0\.35s ease/;
      function sweep() {
        var stage = document.querySelector('.pwr-board-stage');
        if (!stage) return 0;
        var els = stage.querySelectorAll('[style*="transition"]'), n = 0;
        for (var i = 0; i < els.length; i++) {
          var t = els[i].style.transition || '';
          if (RE.test(t)) { els[i].setAttribute('data-trans-off', t); els[i].style.transition = 'none'; n++; }
        }
        window.__nolevelsCleared = (window.__nolevelsCleared || 0) + n;
        return n;
      }
      var n0 = sweep();
      window.__nolevelsCleared = 0;
      window.__nolevelsTimer = setInterval(sweep, 100);
      return { cleared_at_apply: n0 };
    },
    verify: function () {
      var RE = /0\.15s linear|transform 0\.3s linear|all 0\.35s ease/;
      var stage = document.querySelector('.pwr-board-stage');
      var els = stage ? stage.querySelectorAll('[style*="transition"]') : [];
      var left = 0;
      for (var i = 0; i < els.length; i++) if (RE.test(els[i].style.transition || '')) left++;
      var running = document.getAnimations().filter(function (a) { return a.playState === 'running'; });
      var trans = running.filter(function (a) { return a.constructor.name === 'CSSTransition'; });
      return { targeted_still_declared: left, cleared_over_window: window.__nolevelsCleared || 0,
               still_transitioning: trans.length, took: left === 0 };
    },
  },
  nochart: {
    css: '#chartCanvas { display: none !important; }',
    verify: function () {
      var c = document.getElementById('chartCanvas');
      var rects = c ? c.getClientRects().length : 0;
      return { chart_present: !!c, chart_rects: rects, took: !!c && rects === 0 };
    },
  },
  /* LAYER PROMOTION. The pipe SVG is one absolutely-positioned <svg> under every .bd-tile
   * (pwr_board.js:990) and nothing on this board is promoted, so a stroke write on a pipe
   * invalidates the compositor layer it shares with the blurred component art above it.
   * `will-change: transform` is the promotion hint; whether Chrome honours it is exactly what
   * the layer count verifies. */
  pipelayer: {
    css: '.pwr-board-stage > svg { will-change: transform; }',
    verify: function () {
      var svg = document.querySelector('.pwr-board-stage > svg');
      return { pipe_svg_found: !!svg,
               will_change: svg ? getComputedStyle(svg).willChange : null,
               took: !!svg && /transform/.test(getComputedStyle(svg).willChange || '') };
    },
  },
  tilelayer: {
    css: '.pwr-board-stage > svg { will-change: transform; } .bd-tile { will-change: transform; }',
    verify: function () {
      var svg = document.querySelector('.pwr-board-stage > svg');
      var tiles = document.querySelectorAll('.bd-tile');
      var promoted = 0;
      for (var i = 0; i < tiles.length; i++) {
        if (/transform/.test(getComputedStyle(tiles[i]).willChange || '')) promoted++;
      }
      return { pipe_svg_found: !!svg, tiles: tiles.length, tiles_promoted: promoted,
               took: !!svg && tiles.length > 0 && promoted === tiles.length };
    },
  },
};
var COMPOSITE = { static: ['nofilter', 'noflow', 'noanim'] };

function expandAb(spec) {
  var out = [];
  (spec || '').split(',').forEach(function (n) {
    n = n.trim();
    if (!n || n === 'baseline' || n === 'none') return;
    if (COMPOSITE[n]) { COMPOSITE[n].forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); }); return; }
    if (!KNOBS[n]) { console.error('unknown --ab knob: ' + n + ' (have: ' + Object.keys(KNOBS).concat(Object.keys(COMPOSITE)).join(', ') + ')'); process.exit(2); }
    if (out.indexOf(n) < 0) out.push(n);
  });
  return out;
}

/* ------------------------------------------------------------------ server
 * Same shape as test/verify_e2e_ui.js:101 — an ephemeral 127.0.0.1 static server over the
 * repo root. file:// would also load (nothing fetches at runtime) but an http origin is what
 * the gate uses and what the site serves, and origin affects nothing measured here only if it
 * is the same one every cell used. */

var PORT = 0;
function mime(p) {
  if (p.endsWith('.html')) return 'text/html';
  if (p.endsWith('.js')) return 'application/javascript';
  if (p.endsWith('.css')) return 'text/css';
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}
function startServer() {
  return new Promise(function (resolve) {
    var srv = http.createServer(function (req, res) {
      var url = (req.url || '/').split('?')[0];
      if (url === '/') url = '/ui/shell.html';
      var fp = path.join(ROOT, decodeURIComponent(url.replace(/^\//, '').replace(/\//g, path.sep)));
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': mime(fp) });
      res.end(fs.readFileSync(fp));
    });
    srv.listen(0, '127.0.0.1', function () { PORT = srv.address().port; resolve(srv); });
  });
}

/* ----------------------------------------------------------- trace parsing
 *
 * The trace is a flat array of trace events. Two things matter and both are easy to get
 * wrong:
 *
 *  - THREADS. `{ph:'M', name:'thread_name'}` metadata maps pid/tid to a name. Raster does NOT
 *    happen on the renderer main thread — it is on CompositorTileWorker*, and a sum that does
 *    not separate threads adds wall time across processors and means nothing.
 *  - NESTING. 'X' events nest. Summing `dur` for every event double-counts (RunTask contains
 *    everything under it). So: per-name sums are INCLUSIVE and are only comparable within a
 *    name; the per-thread BUSY figure is computed from depth-0 events only and is the honest
 *    "how loaded was this thread" number. */

/* THREAD CLASSES — and the first trap this file hit.
 *
 * The obvious raster thread name is `CompositorTileWorker*`, which is what every article about
 * Chrome tracing says and what the first cut of this parser matched. THIS CHROMIUM DOES NOT
 * HAVE ONE. Raster runs on `ThreadPoolForegroundWorker`, and a `RasterTask` sum keyed on the
 * thread name reported a confident **0.0 ms x0** while the same trace held 4,643 RasterTasks
 * worth 1,712 ms. That is the hollow-check shape CLAUDE.md's standing list names: the sum was
 * correct, it was just reading a thread that does not exist.
 *
 * So RASTER IS SUMMED BY EVENT NAME, across every thread, and the threads it actually landed
 * on are reported. Thread class is still used for the per-thread BUSY figure, where it is the
 * right key. */
function classifyThread(name) {
  if (!name) return 'other';
  if (name === 'CrRendererMain') return 'main';
  if (/^CompositorTileWorker/.test(name) || /^ThreadPoolForegroundWorker/.test(name)) return 'pool';
  if (name === 'Compositor') return 'compositor';
  if (name === 'CrGpuMain' || /^VizCompositor/.test(name)) return 'gpu';
  if (name === 'CrBrowserMain') return 'browser';
  return 'other';
}

/* Paint's args.data.clip is [x0,y0,x1,y1,x2,y2,x3,y3] — the shoelace formula, absolute.
 *
 * SECOND TRAP: a large share of Paint events carry the INFINITE clip (+-8388608, i.e. LayoutUnit
 * max), which is Blink saying "unbounded", not "70 trillion square pixels". Summing them gave a
 * total of 6e17 px^2 and would have made every A/B comparison meaningless. Unbounded clips are
 * counted separately and excluded from the area. */
var CLIP_INF = 8000000;
function quadArea(clip) {
  if (!clip || clip.length < 8) return null;
  for (var k = 0; k < 8; k++) if (Math.abs(clip[k]) >= CLIP_INF) return null;
  var a = 0;
  for (var i = 0; i < 4; i++) {
    var x1 = clip[i * 2], y1 = clip[i * 2 + 1];
    var j = (i + 1) % 4;
    var x2 = clip[j * 2], y2 = clip[j * 2 + 1];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function parseTrace(raw) {
  var events = Array.isArray(raw) ? raw : (raw.traceEvents || []);
  var threads = {};                     // "pid/tid" -> name
  var i, e;
  for (i = 0; i < events.length; i++) {
    e = events[i];
    if (e.ph === 'M' && e.name === 'thread_name' && e.args && e.args.name) {
      threads[e.pid + '/' + e.tid] = e.args.name;
    }
  }

  var byClassName = {};                 // class -> name -> {count, ms}
  var byName = {};                      // name -> {count, ms}   (thread-agnostic)
  var nameThreads = {};                 // name -> {threadName: true}
  var busy = {};                        // class -> depth-0 ms
  var stacks = {};                      // "pid/tid" -> end-time stack
  var paintArea = 0, paintCount = 0, paintUnbounded = 0;
  var rasterByLayer = {};               // layerId -> ms
  var tsMin = Infinity, tsMax = -Infinity;

  /* Depth needs events in start order per thread. */
  var xs = [];
  for (i = 0; i < events.length; i++) {
    e = events[i];
    if (e.ph !== 'X' || typeof e.dur !== 'number') continue;
    xs.push(e);
  }
  xs.sort(function (a, b) { return (a.ts - b.ts) || (b.dur - a.dur); });

  for (i = 0; i < xs.length; i++) {
    e = xs[i];
    var key = e.pid + '/' + e.tid;
    var cls = classifyThread(threads[key]);
    if (e.ts < tsMin) tsMin = e.ts;
    if (e.ts + e.dur > tsMax) tsMax = e.ts + e.dur;

    var st = stacks[key] || (stacks[key] = []);
    while (st.length && st[st.length - 1] <= e.ts) st.pop();
    var depth = st.length;
    st.push(e.ts + e.dur);
    if (depth === 0) busy[cls] = (busy[cls] || 0) + e.dur / 1000;

    var cn = byClassName[cls] || (byClassName[cls] = {});
    var slot = cn[e.name] || (cn[e.name] = { count: 0, ms: 0 });
    slot.count++; slot.ms += e.dur / 1000;
    var gslot = byName[e.name] || (byName[e.name] = { count: 0, ms: 0 });
    gslot.count++; gslot.ms += e.dur / 1000;
    (nameThreads[e.name] || (nameThreads[e.name] = {}))[threads[key] || '?'] = true;

    if (e.name === 'Paint') {
      paintCount++;
      if (e.args && e.args.data && e.args.data.clip) {
        var ar = quadArea(e.args.data.clip);
        if (ar == null) paintUnbounded++; else paintArea += ar;
      }
    }
    if (e.name === 'RasterTask' && e.args && e.args.tileData) {
      var lid = 'layer ' + e.args.tileData.layerId;
      rasterByLayer[lid] = (rasterByLayer[lid] || 0) + e.dur / 1000;
    }
  }

  var topLayers = Object.keys(rasterByLayer)
    .map(function (k) { return { layer: k, ms: rasterByLayer[k] }; })
    .sort(function (a, b) { return b.ms - a.ms; }).slice(0, 8);

  /* Thread-agnostic name sum — the RIGHT key for raster, which moves between thread pools
   * across Chromium versions (see classifyThread). */
  function nsum(names) {
    var ms = 0, count = 0, th = {};
    names.forEach(function (n) {
      if (byName[n]) { ms += byName[n].ms; count += byName[n].count; Object.keys(nameThreads[n]).forEach(function (t) { th[t] = true; }); }
    });
    return { ms: ms, count: count, threads: Object.keys(th) };
  }
  function csum(cls, names) {
    var cn = byClassName[cls] || {}, ms = 0, count = 0;
    names.forEach(function (n) { if (cn[n]) { ms += cn[n].ms; count += cn[n].count; } });
    return { ms: ms, count: count, threads: [] };
  }
  function ncount(names) { var c = 0; names.forEach(function (n) { if (byName[n]) c += byName[n].count; }); return c; }

  var threadNames = {};
  Object.keys(threads).forEach(function (k) { threadNames[threads[k]] = true; });

  var topNames = {};
  Object.keys(byClassName).forEach(function (cls) {
    topNames[cls] = Object.keys(byClassName[cls])
      .map(function (n) { return { name: n, ms: byClassName[cls][n].ms, count: byClassName[cls][n].count }; })
      .sort(function (a, b) { return b.ms - a.ms; }).slice(0, 6);
  });

  return {
    span_s: (tsMax - tsMin) / 1e6,
    threads_seen: Object.keys(threadNames).sort(),
    busy_ms: busy,
    top_names: topNames,
    raster: nsum(['RasterTask']),
    raster_playback: nsum(['DisplayItemList::Raster']),
    image_decode: nsum(['ImageDecodeTask', 'Decode Image', 'ImageDecodeTaskImpl']),
    paint: csum('main', ['Paint']),
    paint_area_px2: paintArea,
    paint_count: paintCount,
    paint_unbounded: paintUnbounded,
    layout: csum('main', ['Layout', 'UpdateLayoutTree']),
    prepaint: csum('main', ['PrePaint']),
    paint_lifecycle: csum('main', ['LocalFrameView::RunPaintLifecyclePhase']),
    layerize: csum('main', ['Layerize', 'UpdateLayerTree']),
    composite: csum('main', ['CompositeLayers', 'Commit']),
    function_call: csum('main', ['FunctionCall']),
    gpu: { ms: busy.gpu || 0, count: 0, threads: [] },
    frames: {
      /* `DrawFrame` does not appear in this Chromium; the compositor's draw is
       * `MainFrame.Draw` / `ProxyImpl::ScheduledActionDraw`. Every candidate is reported so a
       * rename in a future Chromium shows up as a zero beside a non-zero rather than as a
       * silently wrong frame count. */
      DrawFrame: ncount(['DrawFrame']),
      MainFrameDraw: ncount(['MainFrame.Draw']),
      ScheduledActionDraw: ncount(['ProxyImpl::ScheduledActionDraw']),
      BeginMainFrame: ncount(['ProxyMain::BeginMainFrame']),
      Commit: ncount(['Commit']),
      ActivateLayerTree: ncount(['ActivateLayerTree', 'ProxyImpl::ScheduledActionActivateSyncTree']),
      RasterTask: ncount(['RasterTask']),
    },
    top_raster_layers: topLayers,
    raster_layer_count: Object.keys(rasterByLayer).length,
  };
}

/* ------------------------------------------------------------------- main */

var CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'blink',
  'blink.user_timing',
  'cc',
  'gpu',
  'toplevel',
  '__metadata',
];

async function main() {
  var o = parseArgs(process.argv.slice(2));
  var knobs = expandAb(o.ab);
  var label = o.label || (o.ab || 'baseline');

  var playwright = require('playwright');
  var srv = await startServer();

  var launchArgs = [];
  if (o.software) launchArgs = ['--disable-gpu-rasterization', '--disable-gpu-compositing'];
  var browser = await playwright.chromium.launch({ headless: !o.headed, args: launchArgs });
  var page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  var out = { label: label, knobs: knobs, opts: o };

  try {
    var cdp = await page.context().newCDPSession(page);
    var layerCounts = [];
    cdp.on('LayerTree.layerTreeDidChange', function (p) {
      layerCounts.push(p && p.layers ? p.layers.length : 0);
    });
    try { await cdp.send('LayerTree.enable'); } catch (e) { out.layertree_error = String(e).slice(0, 120); }
    if (o.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: o.throttle });

    var url = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&init=' + o.init + '&run=1&dev=1' +
      (o.ff ? '&ff=' + o.ff : '') + (o.inject ? '&inject=' + o.inject : '');
    out.url = url;
    var pageErrors = [];
    page.on('pageerror', function (e) { pageErrors.push(String(e).slice(0, 200)); });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });

    /* The Plant & Mission window opens on every load (owner directive, 2026-08-11) and is
     * deliberately not bypassable by a URL parameter — verify_e2e_ui.js:21 records why. */
    /* WAIT FOR THE OVERLAY TO BE GONE, not for 250 ms. Under `--throttle=4` the fade leaves it
     * intercepting pointer events long past a fixed sleep, and the FIRST symptom is the speed
     * button timing out 30 s later with "missionOverlay intercepts pointer events" — i.e. the
     * cell dies in an unrelated place. */
    /* WAIT FOR THE CLOCK FIRST, THEN DISMISS — and it took three failed attempts to learn that
     * order, which is worth writing down because verify_e2e_ui.js does it the other way round
     * and is green.
     *
     * The Plant & Mission window OPENS ASYNCHRONOUSLY, after boot. At 1x it is already up when
     * the page settles, so "goto, then dismiss" works and the gate never sees anything else.
     * Under `--throttle=4` it is NOT up yet: measured (inbox/613/diag.js) —
     *   after goto   hidden:true  display:none  rects:0
     *   after loop   hidden:true  display:none  rects:0     <- a dismiss loop finds nothing
     *   after clock  hidden:false display:flex  rects:1     <- and NOW it opens
     * so a dismiss that runs first is a no-op, and the failure surfaces 30 s later on the
     * UNRELATED speed button as "missionOverlay intercepts pointer events". Three of four
     * throttled cells died that way.
     *
     * The plant runs behind the window, so the clock is a valid wait either way. After it,
     * poll until the overlay has actually gone, dispatching the close button's OWN click (the
     * app's real handler) rather than `page.click`, whose actionability wait the overlay's own
     * interception defeats. */
    await page.waitForFunction(function () {
      var c = document.getElementById('clock');
      return !!c && /^T\+\d/.test(c.textContent || '') && c.textContent !== 'T+00:00:00';
    }, { timeout: 60000, polling: 100 });

    var t_ov = Date.now(), seen = false;
    while (Date.now() - t_ov < 45000) {
      var vis = await page.evaluate(function () {
        var o = document.getElementById('missionOverlay');
        if (!o) return 'absent';
        if (o.hidden || o.getClientRects().length === 0) return 'gone';
        var b = document.getElementById('missionClose');
        if (b) b.click();
        return 'clicked';
      });
      if (vis === 'clicked') seen = true;
      if (vis !== 'clicked' && (seen || Date.now() - t_ov > 10000)) break;
      await page.waitForTimeout(300);
    }
    if (!seen) out.overlay_warning = 'the Plant & Mission window was never seen open — dismissal unverified';
    if (await page.evaluate(function () { var o = document.getElementById('missionOverlay'); return !!(o && !o.hidden && o.getClientRects().length); })) {
      out.overlay_warning = 'the Plant & Mission window never closed — this cell is suspect';
    }

    /* Time acceleration — the shipped segment, not a service poke, so the cell exercises the
     * same path a player does. See the ?ff= trap in the header: ?ff is NOT this. */
    if (o.speed && o.speed !== 1) {
      var sel = '#speed [data-speed="' + o.speed + '"]';
      if (await page.$(sel)) { await page.click(sel); }
      else { out.speed_warning = 'no speed button for ' + o.speed + 'x — left at 1x'; }
    }

    /* DOM census BEFORE the knobs, so the table always says what the untouched board holds. */
    out.census = await page.evaluate(function () {
      var stage = document.querySelector('.pwr-board-stage');
      var dashed = document.querySelectorAll('polyline[data-dash-cyc]');
      var hidden = 0;
      for (var i = 0; i < dashed.length; i++) if (dashed[i].getClientRects().length === 0) hidden++;
      var filtAttr = document.querySelectorAll('[filter]');
      var filtLive = 0;
      for (var j = 0; j < filtAttr.length; j++) {
        var f = getComputedStyle(filtAttr[j]).filter;
        if (f && f !== 'none' && filtAttr[j].getClientRects().length > 0) filtLive++;
      }
      var anim = 0, all = document.querySelectorAll('*');
      for (var k = 0; k < all.length; k++) {
        var an = getComputedStyle(all[k]).animationName;
        if (an && an !== 'none') anim++;
      }
      var chart = document.getElementById('chartCanvas');
      var gl = null;
      try {
        var cv = document.createElement('canvas');
        var ctx = cv.getContext('webgl') || cv.getContext('experimental-webgl');
        var dbg = ctx && ctx.getExtension('WEBGL_debug_renderer_info');
        gl = dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (ctx ? 'webgl (renderer info blocked)' : 'no webgl');
      } catch (e) { gl = 'webgl error'; }
      return {
        stage_present: !!stage,
        board_svgs: stage ? stage.querySelectorAll(':scope > svg').length : 0,
        svgs_total: document.querySelectorAll('svg').length,
        bd_tiles: document.querySelectorAll('.bd-tile').length,
        dashed_polylines: dashed.length,
        dashed_offscreen: hidden,
        filter_attr_elements: filtAttr.length,
        filter_live_visible: filtLive,
        animating_elements: anim,
        chart_visible: !!(chart && chart.getClientRects().length),
        dom_nodes: document.querySelectorAll('*').length,
        webgl_renderer: gl,
        devicePixelRatio: window.devicePixelRatio,
      };
    });

    /* Apply the knobs. CSS knobs go in as a stylesheet (page.addStyleTag) so they sit in the
     * author cascade with !important and beat both presentation attributes and inline styles;
     * DOM knobs (noflow) run as a script. Nothing under ui/ is touched. */
    out.applied = {};
    for (var ki = 0; ki < knobs.length; ki++) {
      var kn = knobs[ki], K = KNOBS[kn];
      if (K.css) await page.addStyleTag({ content: K.css });
      if (K.apply) out.applied[kn] = await page.evaluate(K.apply);
    }

    await page.waitForTimeout(o.settle * 1000);

    /* The window. RD.Perf is reset here so its summary covers exactly the traced span and can
     * be compared against the trace's own frame counts. */
    await page.evaluate(function () { if (globalThis.RD && RD.Perf) RD.Perf.reset(); });
    var dashBefore = await page.evaluate(function () {
      var els = document.querySelectorAll('polyline[data-dash-cyc], polyline[data-dash-cyc-off]');
      var v = [];
      for (var i = 0; i < els.length && i < 40; i++) v.push(els[i].getAttribute('stroke-dashoffset'));
      return v;
    });
    var layersBefore = layerCounts.length ? layerCounts[layerCounts.length - 1] : null;

    var tracePath = o.trace || path.join(require('os').tmpdir(), 'perf_trace_' + process.pid + '.json');
    await browser.startTracing(page, { categories: CATEGORIES, path: tracePath });
    var t0 = Date.now();
    /* FIVE INSTANTS ACROSS THE WINDOW, not one after it. What produces frames on this board is a
     * running CSS TRANSITION, and a transition is 150 ms long — a single sample after the window
     * says nothing about whether they were continuously live during it. Five `getAnimations()`
     * reads over 15 s is negligible against seconds of raster, and it is what turns "there are
     * six of them" into "they are never idle". */
    var animSamples = [];
    for (var s = 0; s < 5; s++) {
      await page.waitForTimeout(Math.round(o.secs * 1000 / 5));
      animSamples.push(await page.evaluate(function () {
        function desc(el) {
          if (!el || !el.tagName) return '?';
          var cls = (typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '');
          return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls.trim().split(/\s+/).slice(0, 2).join('.') : '');
        }
        var all = document.getAnimations();
        var running = all.filter(function (a) { return a.playState === 'running'; });
        var byTarget = {};
        running.forEach(function (a) {
          var t = a.effect && a.effect.target;
          var k = a.constructor.name + ' ' + (a.transitionProperty || a.animationName || '?') + ' @ ' + desc(t);
          byTarget[k] = (byTarget[k] || 0) + 1;
        });
        return { total: all.length, running: running.length,
                 transitions: running.filter(function (a) { return a.constructor.name === 'CSSTransition'; }).length,
                 keyframes: running.filter(function (a) { return a.constructor.name === 'CSSAnimation'; }).length,
                 paused: all.length - running.length, targets: byTarget };
      }));
    }
    await browser.stopTracing();
    var wallMs = Date.now() - t0;
    out.anim_samples = animSamples;

    out.window_wall_s = wallMs / 1000;
    out.perf = await page.evaluate(function () { return (globalThis.RD && RD.Perf) ? RD.Perf.summary() : null; });
    var dashAfter = await page.evaluate(function () {
      var els = document.querySelectorAll('polyline[data-dash-cyc], polyline[data-dash-cyc-off]');
      var v = [];
      for (var i = 0; i < els.length && i < 40; i++) v.push(els[i].getAttribute('stroke-dashoffset'));
      return v;
    });
    var moved = 0;
    for (var d = 0; d < dashBefore.length; d++) if (dashBefore[d] !== dashAfter[d]) moved++;
    out.dash_sampled = dashBefore.length;
    out.dash_moved_in_window = moved;
    out.layers_before = layersBefore;
    out.layers_after = layerCounts.length ? layerCounts[layerCounts.length - 1] : null;
    out.layer_count_max = layerCounts.length ? Math.max.apply(null, layerCounts) : null;

    /* Verify every knob AFTER the window, so no verification cost lands inside a measurement. */
    out.verify = {};
    out.knob_took = {};
    for (var vi = 0; vi < knobs.length; vi++) {
      var vn = knobs[vi];
      var r = await page.evaluate(KNOBS[vn].verify);
      out.verify[vn] = r;
      out.knob_took[vn] = !!(r && r.took);
    }
    out.page_errors = pageErrors;

    var raw = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
    out.trace = parseTrace(raw);
    if (!o.trace) { try { fs.unlinkSync(tracePath); } catch (e) {} }
    out.gpu_mode = { software_flags: !!o.software, headed: !!o.headed,
                     webgl_renderer: out.census.webgl_renderer,
                     raster_threads: out.trace.threads_seen.filter(function (n) { return /CompositorTileWorker|CrGpuMain|VizCompositor/.test(n); }) };

    report(out);
    if (o.json) fs.writeFileSync(o.json, JSON.stringify(out, null, 2));
  } finally {
    await browser.close();
    srv.close();
  }
}

function ms(x) { return (x || 0).toFixed(1); }

function report(o) {
  var t = o.trace, c = o.census;
  var L = [];
  L.push('');
  L.push('=== perf_trace  ' + o.label + '  ===');
  L.push('  url        ' + o.url);
  L.push('  window     ' + o.window_wall_s.toFixed(1) + ' s wall, trace span ' + t.span_s.toFixed(1) + ' s' +
         (o.opts.throttle > 1 ? ', CPU throttle ' + o.opts.throttle + 'x' : '') +
         ', speed ' + o.opts.speed + 'x' + (o.speed_warning ? ' (' + o.speed_warning + ')' : ''));
  L.push('  gpu mode   ' + (o.gpu_mode.software_flags ? 'SOFTWARE flags' : 'default') +
         (o.gpu_mode.headed ? ', headed' : ', headless') + ' | webgl: ' + o.gpu_mode.webgl_renderer);
  L.push('  threads    ' + t.threads_seen.join(', '));
  L.push('');
  L.push('  DOM census (before knobs)');
  L.push('    board stage svgs (direct children) ' + c.board_svgs + '   svgs total ' + c.svgs_total + '   .bd-tile ' + c.bd_tiles);
  L.push('    polyline[data-dash-cyc] ' + c.dashed_polylines + '  (offscreen/zero-rect ' + c.dashed_offscreen + ')');
  L.push('    elements with filter attr ' + c.filter_attr_elements + '  (computed-live AND visible ' + c.filter_live_visible + ')');
  L.push('    css-animating elements ' + c.animating_elements + '   dom nodes ' + c.dom_nodes + '   chart visible ' + c.chart_visible);
  L.push('');
  L.push('  THREAD BUSY (depth-0 sum, ms over the window)');
  Object.keys(t.busy_ms).sort().forEach(function (k) { L.push('    ' + k.padEnd(12) + ms(t.busy_ms[k])); });
  L.push('');
  L.push('  TERMS (inclusive ms / count)');
  var rows = [
    ['RASTER  RasterTask (any thread)', t.raster], ['raster  DisplayItemList::Raster', t.raster_playback],
    ['raster  ImageDecode', t.image_decode],
    ['main    Paint', t.paint], ['main    RunPaintLifecyclePhase', t.paint_lifecycle],
    ['main    Layout+UpdateLayoutTree', t.layout],
    ['main    PrePaint', t.prepaint], ['main    Layerize/UpdateLayerTree', t.layerize],
    ['main    CompositeLayers+Commit', t.composite], ['main    FunctionCall', t.function_call],
    ['gpu     viz+gpu thread busy', t.gpu],
  ];
  rows.forEach(function (r) { L.push('    ' + r[0].padEnd(32) + ms(r[1].ms).padStart(9) + '  x' + r[1].count); });
  L.push('    ' + 'Paint clip area (bounded only)'.padEnd(32) + (t.paint_area_px2 / 1e6).toFixed(1).padStart(9) +
         '  Mpx^2   (' + t.paint_unbounded + ' of ' + t.paint_count + ' paints carried the INFINITE clip and are excluded)');
  if (t.raster.threads.length) L.push('    raster ran on: ' + t.raster.threads.join(', '));
  L.push('');
  L.push('  TOP EVENTS BY THREAD CLASS (inclusive; nested, so read within a class only)');
  Object.keys(t.top_names).sort().forEach(function (cls) {
    if (cls === 'other' || cls === 'browser') return;
    L.push('    ' + cls.padEnd(11) + t.top_names[cls].map(function (x) { return x.name + ' ' + x.ms.toFixed(0) + 'ms x' + x.count; }).join(' | '));
  });
  L.push('');
  L.push('  FRAMES  MainFrame.Draw ' + t.frames.MainFrameDraw + '   ScheduledActionDraw ' + t.frames.ScheduledActionDraw +
         '   BeginMainFrame ' + t.frames.BeginMainFrame + '   Commit ' + t.frames.Commit +
         '   DrawFrame ' + t.frames.DrawFrame + '   RasterTask ' + t.frames.RasterTask);
  if (o.perf) {
    L.push('  RD.Perf paints ' + o.perf.paints + '  broadcasts ' + o.perf.broadcasts + '  coalesced ' + o.perf.coalesced +
           '  fps ' + (o.perf.fps == null ? 'n/a' : o.perf.fps.toFixed(1)) +
           '  render p50 ' + (o.perf.render_ms ? o.perf.render_ms.p50.toFixed(1) : '?') +
           '  step p50 ' + (o.perf.step_ms ? o.perf.step_ms.p50.toFixed(1) : '?'));
    L.push('  RD.Perf verdict: ' + o.perf.verdict);
  }
  L.push('  LAYERS  cdp before ' + o.layers_before + ' after ' + o.layers_after + ' max ' + o.layer_count_max +
         '   distinct raster layerIds ' + t.raster_layer_count);
  if (t.top_raster_layers.length) {
    L.push('  TOP RASTER LAYERS  ' + t.top_raster_layers.map(function (x) { return x.layer + '=' + ms(x.ms); }).join('  '));
  }
  L.push('  DASH  ' + o.dash_moved_in_window + '/' + o.dash_sampled + ' sampled polylines moved during the window');
  if (o.anim_samples && o.anim_samples.length) {
    L.push('  ANIMATIONS (5 instants across the window)  total/running/transitions/keyframes:');
    L.push('    ' + o.anim_samples.map(function (a) { return a.total + '/' + a.running + '/' + a.transitions + '/' + a.keyframes; }).join('   '));
    var agg = {};
    o.anim_samples.forEach(function (a) { Object.keys(a.targets).forEach(function (k) { agg[k] = (agg[k] || 0) + a.targets[k]; }); });
    var top = Object.keys(agg).map(function (k) { return { k: k, n: agg[k] }; }).sort(function (x, y) { return y.n - x.n; }).slice(0, 10);
    top.forEach(function (r) { L.push('      x' + String(r.n).padStart(3) + '  ' + r.k); });
  }
  if (o.knobs.length) {
    L.push('');
    L.push('  KNOBS');
    o.knobs.forEach(function (k) {
      L.push('    ' + (o.knob_took[k] ? 'TOOK       ' : 'DID-NOT-TAKE ') + k.padEnd(10) + JSON.stringify(o.verify[k]));
    });
    if (o.knobs.some(function (k) { return !o.knob_took[k]; })) {
      L.push('    *** a knob did not take — this cell is NOT a result for that knob ***');
    }
  }
  if (o.page_errors && o.page_errors.length) L.push('  PAGE ERRORS  ' + o.page_errors.join(' | '));
  L.push('');
  console.log(L.join('\n'));
}

main().catch(function (e) { console.error(e); process.exit(1); });
