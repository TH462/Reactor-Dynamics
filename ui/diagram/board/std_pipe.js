/*
 * Standardized pipe kit for the PWR reactor components.
 * Single source of truth for pipe geometry, flanges, connection stubs and fluid colors,
 * so every component (pumps, valves, vessels, headers) draws pipes and ports identically.
 *
 * Load once per component:  <script src="./pipes.js"></script>   (inside <helmet>)
 * Then in a logic class:     const K = window.StdPipe.createKit(React.createElement);
 *                            C.push(K.pipe({ key:'p1', x1, y1, x2, y2, d:14, fluid:'hotLeg' }));
 *
 * RENDERING MODEL — "stacked stroke":
 *   each run is 3 overlaid polylines on one centerline:
 *     casing  strokeWidth = d + 2*wall   (pipe walls)
 *     bore    strokeWidth = d            (static fluid fill, color = fluid.bore)
 *     flow    strokeWidth = ~0.42*d      (dashed + animated, color = fluid.flow)
 *   -> scales with a single `d`; round joins handle elbows; identical everywhere.
 */
(function () {
  var WALL = '#3b4f5e';      // pipe wall / casing
  var FLANGE = '#4a5f6e';    // flange bar face
  var FLANGE_DK = '#243642'; // flange / wall outline

  // Fluid presets — bore = static fill inside the pipe, flow = moving dashed line.
  // Temperature + phase encoded as color, per the plant's convention.
  // INVERTED 2026-08-04 (#350 item 20) to match phaseTempColor below: the bore carries the
  // fluid colour at full strength and the DASH is the darker of the two. These are fallbacks
  // only — every board pipe passes { phase, temp } — but a preset table disagreeing with the
  // live model is the kind of thing that gets copied into a new component later.
  var FLUIDS = {
    coldWater:  { bore: '#5aa0e6', flow: '#12314c', label: 'COLD WATER' },   // blue  - cold
    coldLeg:    { bore: '#5aa0e6', flow: '#12314c', label: 'RCS COLD LEG' },
    coolWater:  { bore: '#3fd0d0', flow: '#123a45', label: 'FEEDWATER' },    // teal  - cool/feed
    condensate: { bore: '#7fe0d0', flow: '#123a45', label: 'CONDENSATE' },
    warmWater:  { bore: '#c9d15a', flow: '#2b2f2a', label: 'WARM WATER' },   // amber-ish - warm
    hotWater:   { bore: '#ff6a4d', flow: '#3a1512', label: 'HOT WATER' },    // red   - hot
    hotLeg:     { bore: '#ff6a4d', flow: '#3a1512', label: 'RCS HOT LEG' },
    steam:      { bore: '#ffffff', flow: '#7c868d', label: 'STEAM' },        // light grey - dry/hot steam
    wetSteam:   { bore: '#cfd6db', flow: '#5c666d', label: 'WET STEAM' },    // med grey  - near saturation
    empty:      { bore: '#101a22', flow: '#101a22', label: 'ISOLATED', empty: true }
  };

  // ---------------------------------------------------------------------------
  // GLOBAL TEMPERATURE + PHASE COLOR MODEL
  // One gradient, shared by every pipe and valve, so a given temperature always
  // paints the same color anywhere in the plant. Pass fluid as { phase, temp }:
  //   phase 'water' -> aqua -> blue -> purple -> red, with full RED anchored at
  //         WATER_MAX_C = the hottest liquid water in a PWR (pressurizer, saturated
  //         at operating pressure ~155 bar => ~345 C).
  //   phase 'steam' -> light/medium grey (cool) -> medium-dark grey (hot).
  //   phase 'empty' -> isolated (dark, no flow).
  // ---------------------------------------------------------------------------
  var TEMP_MIN_C = 15;     // coldest rendered temperature
  var WATER_MAX_C = 345;   // hottest liquid water in a PWR -> full red
  // Heat-map ramp: hue varies continuously cold→hot (blue→cyan→green→yellow→orange→red) so
  // ADJACENT temperatures differ in hue, not just brightness — you can read a ~30 °C hot-leg /
  // cold-leg split at a glance and watch a transient sweep colors. Paired with the operating-
  // band expansion below (rampT) so the 200–345 °C band the plant lives in spans most of the ramp.
  var WATER_RAMP = [
    [0.00, [0x2b, 0x66, 0xd8]],  // cold — blue
    [0.20, [0x2a, 0xac, 0xe4]],  // azure
    [0.38, [0x2c, 0xd0, 0xc0]],  // teal
    // The GREEN and ORANGE stops are the two the RCS actually lives on — cold leg lands near
    // 0.50 of the ramp and hot leg near 0.90 — and both are darkened a step at #357 (owner:
    // "make the coolant orange and greens a little darker"). Since #350 inverted the pipe
    // convention these ARE the bore, i.e. the full width of every primary run, so they were the
    // loudest thing on a board where they are the NORMAL state. The lime and yellow between them
    // are transition stops the plant only sweeps through, and are left alone so the ramp keeps
    // its continuous hue walk.
    [0.54, [0x38, 0xa8, 0x4e]],  // green   (was 49cb60)
    [0.68, [0xc6, 0xd6, 0x3a]],  // lime
    [0.80, [0xf2, 0xc0, 0x33]],  // yellow
    [0.90, [0xd4, 0x76, 0x22]],  // orange  (was ef8a2e)
    [1.00, [0xd8, 0x33, 0x26]]   // hot — red
  ];
  // Operating-band expansion. A PWR lives at ~280–345 °C, a thin slice of 15–345 that on a
  // linear scale all reads near-red — so the scale is piecewise, centered on the operating
  // range like a plant HMI's. Retuned 2026-07-28 (#237, owner: "increase the color contrast
  // between the hot and cold sides"): the old single knee gave the whole 200–345 °C band a
  // linear share, which rendered the at-power cold leg (~292 °C) YELLOW and hot leg (~319 °C)
  // ORANGE — adjacent hues, ~0.12 of the ramp apart. The at-power RCS band (285–322 °C) now
  // owns 0.50–0.90 of the ramp, so cold leg reads GREEN, hot leg ORANGE-RED (~0.29 apart —
  // two full hue steps), and only pressurizer saturation (345 °C) reaches deep red.
  var OP_LO = 200, OP_KNEE = 0.28;    // ≤200 °C: shutdown/cold band, compressed (blue→teal)
  var RCS_LO = 285, RCS_KNEE = 0.50;  // 200–285 °C: heatup approach band (teal→green)
  var RCS_HI = 322, RCS_HI_T = 0.90;  // 285–322 °C: the at-power leg band — most of the ramp
  function rampT(tempC) {
    if (tempC <= OP_LO) return clamp01((tempC - TEMP_MIN_C) / (OP_LO - TEMP_MIN_C)) * OP_KNEE;
    if (tempC <= RCS_LO) return OP_KNEE + (tempC - OP_LO) / (RCS_LO - OP_LO) * (RCS_KNEE - OP_KNEE);
    if (tempC <= RCS_HI) return RCS_KNEE + (tempC - RCS_LO) / (RCS_HI - RCS_LO) * (RCS_HI_T - RCS_KNEE);
    return RCS_HI_T + clamp01((tempC - RCS_HI) / (WATER_MAX_C - RCS_HI)) * (1 - RCS_HI_T);
  }
  var STEAM_RAMP = [
    [0.00, [0x5a, 0x64, 0x6b]],  // medium-dark grey  (cooler steam)
    [1.00, [0xd8, 0xde, 0xe2]]   // medium/light grey (hotter steam)
  ];
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function hex2(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16); }
  function toHex(a) { return '#' + hex2(a[0]) + hex2(a[1]) + hex2(a[2]); }
  function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function sampleRamp(ramp, t) {
    t = clamp01(t);
    for (var i = 0; i < ramp.length - 1; i++) {
      var p0 = ramp[i], p1 = ramp[i + 1];
      if (t <= p1[0]) { var span = (p1[0] - p0[0]) || 1; return mix3(p0[1], p1[1], (t - p0[0]) / span); }
    }
    return ramp[ramp.length - 1][1];
  }
  // Map a phase + temperature (deg C) to { bore, flow } (+ empty flag).
  //   bore = static fill inside the pipe;  flow = the moving dashed line.
  //
  // THE DASH IS THE DARKER OF THE TWO *(OWNER DIRECTIVE, 2026-08-04: "invert the colors on
  // the pipes so the darker color is the dashes showing water movement.")*, #350 item 20.
  // It used to be the other way round — a near-black bore with a bright dash — which read as
  // an empty pipe with something glowing inside it rather than as a full pipe with fluid
  // moving through it. Inverted, the BORE carries the temperature colour at full strength
  // (so a hot leg reads hot across its whole width, not along a 42 %-wide stripe) and the
  // dash is the same hue darkened, i.e. the shadow of the fluid moving in it.
  //
  // The dash mix is 0.55 toward black where the old bore mix was 0.74: 0.74 against a
  // full-strength bore is nearly invisible at the cold end of the ramp, where the bore is
  // already dark. 0.55 keeps the dash readable at every temperature in the ramp.
  // Item 12 — the reactor's cold-side downcomer dashes — falls out of this: the vessel's
  // internal flow arrows take their colour from the same function, so they now match the
  // darker colour of the pipe they continue.
  var DASH_MIX = 0.55;
  function phaseTempColor(phase, tempC) {
    if (phase === 'empty') return { bore: '#101a22', flow: '#101a22', empty: true, phase: 'empty', temp: tempC };
    var t = rampT(tempC);
    if (phase === 'steam') {
      var s = sampleRamp(STEAM_RAMP, t);
      return { bore: toHex(s), flow: toHex(mix3(s, [0x10, 0x17, 0x1d], DASH_MIX)), phase: 'steam', temp: tempC };
    }
    var w = sampleRamp(WATER_RAMP, t);
    return { bore: toHex(w), flow: toHex(mix3(w, [0x06, 0x0a, 0x0e], DASH_MIX)), phase: 'water', temp: tempC };
  }

  // THE THREE STANDARD PIPE SIZES (bore diameter, canvas px). Every connection stub
  // and every inter-component run must use one of these -- no custom diameters.
  // STUB_LEN is the fixed stub length per size (base to flange face, canvas px).
  var SIZES = { small: 4, medium: 8, large: 12 };
  var STUB_LEN = { small: 20, medium: 26, large: 32 };

  // Dash period is fixed (10+15=25) so the shared clock loops seamlessly at every
  // diameter; only the flow-line THICKNESS scales with d.
  //
  // THE DASHES ARE DRIVEN BY ONE JS CLOCK AT ~24 Hz, NOT BY CSS ANIMATIONS (2026-08-31 bug
  // report: "indications and drawing boxes were flickering under high system load", 4.7 fps).
  // `stroke-dashoffset` is not compositable, so a CSS animation of it repaints the stroke at
  // the display rate — MEASURED over 15 s of the shipped board: 28,765 Paint events and 8.9 s
  // of raster with the animations on, 9,429 and 3.8 s with them off. ~100 strokes each
  // invalidating at 60 Hz was most of the board's browser-side cost, and on a loaded machine
  // it is what starved the app's own rAF down to 4.7 fps. One ticker that writes every
  // stroke's offset in a single rAF-aligned batch cuts the invalidation rate (60 → 24 Hz;
  // first shipped at 12 Hz and raised same day — OWNER, 2026-08-31: "The 12hz may be too
  // slow. It looks choppy.") and keeps
  // every element on the same instant of the shared clock — the #233 world-grid alignment
  // this file exists to preserve (per-element CSS pause/resume actually BROKE that grid: a
  // resumed element kept its private elapsed time and rejoined out of phase; the shared
  // clock cannot).
  //
  // Element contract (set by pipe()/setFlowSpeed here and by comp_reactor_vessel's
  // flowLine): `data-dash-cyc` seconds per period, `data-dash-t` the drawn world phase 0..1,
  // `data-dash-dir` the drawn direction, `data-dash-sign` the EFFECTIVE direction (differs
  // from drawn when setFlowSpeed reversed the line). `style.animationPlayState === 'paused'`
  // still means "hold" — pwr_board writes it and pipeFlowState() reads it back — and the
  // board-wide `.bd-frozen` freeze holds the whole clock.
  var FLOW_FPS = 24;
  var flowClockMs = 0, flowLastMs = 0, flowTimer = 0, flowRafPend = false;

  /* ---- EVERY OTHER ANIMATION ON THE PAGE RIDES THE SAME CLOCK (2026-08-31) ----------------
   * ONE RUNNING CSS ANIMATION ANYWHERE COSTS THE WHOLE 60 Hz FRAME LOOP, so converting the
   * dashes alone bought almost nothing. MEASURED, 15 s traces, main-thread RunTask against a
   * 21.0 s baseline: kill the bubbles 18.6, the spins 20.9, the sprays/puffs/plumes 19.5 —
   * 4.0 s of savings between them — but kill ALL of them together and it is 12.6 s. The
   * per-element cost is small; the fixed per-frame cost (style, layerize, commit) is what
   * dominates, and it is paid at the display rate for as long as ANY animation runs.
   *
   * ALIGNING THE STEP EDGES DOES NOT WORK, and it was the cheaper idea: quantizing every
   * animation's duration AND delay onto one 1/24 s grid so they all step together measured
   * 20.7 s against 21.0 — nothing. Blink commits a frame for a running CSS animation whether
   * or not the computed value changed. The animation has to actually STOP.
   *
   * SO: pause them and SEEK them. `document.getAnimations()` hands back the live CSSAnimation
   * objects for the CSS this board already declares — pausing each one and advancing its
   * `currentTime` here reproduces the motion exactly, at this clock's rate, with no keyframe
   * rewritten and no component file touched. It also covers animations added later for free.
   * (The steps() quantization this replaces was reverted to `linear` in the same change: the
   * clock IS the sample rate now, and a second quantization at a near-but-not-equal rate
   * beats against it.)
   *
   * THREE THINGS IT DELIBERATELY DOES NOT TOUCH: CSSTransition (short, one-shot, and
   * pausing them would strand a half-finished level move), anything whose INLINE
   * animation-play-state says paused (the house "hold" flag), and anything inside a frozen
   * board stage — the board freezes, the alarm flash and the clock pulse do NOT, and they
   * are page-level. Advancing by DELTA rather than to an absolute time is what lets a
   * frozen element hold and then resume in its own phase. */
  var animPrevMs = 0;
  function tickAnimations(now) {
    if (!document.getAnimations) return;
    var dt = animPrevMs ? now - animPrevMs : 0;
    animPrevMs = now;
    if (!(dt > 0)) return;
    var frozen = document.querySelector('.pwr-board-stage.bd-frozen');
    var list;
    try { list = document.getAnimations(); } catch (e) { return; }
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var cn = a.constructor && a.constructor.name;
      if (cn === 'CSSTransition') continue;
      var st = a.playState;
      if (st === 'finished' || st === 'idle') continue;
      if (st === 'running') { try { a.pause(); } catch (e) { continue; } }
      var el = a.effect && a.effect.target;
      if (el && el.style && el.style.animationPlayState === 'paused') continue;
      if (frozen && el && frozen.contains(el)) continue;
      try { a.currentTime = (a.currentTime || 0) + dt; } catch (e) {}
    }
  }

  /* THE DECORATIVE CLOCK YIELDS WHEN THE FRAME BUDGET IS GONE (#613, owner playtest
   * 2026-09-03: "the sim has issues with large transients causing it to bog down and cause
   * graphical issues like indications and objects disappearing and reappearing").
   *
   * MEASURED, profiled at 10x with a checklist running — the regime his report was in (his step
   * p95 19.3 ms, mine 16.3): `tickAnimations` is the single largest cost in the whole UI, 454 ms
   * of a 15 s profile, 32 % of all ui/ self time, with `drawChart` second at 280 ms. The work
   * itself is ~0.64 ms to pause and re-seek 45 animations, and at FLOW_FPS = 24 that is
   * 15-30 ms EVERY SECOND, spent forever, on bubbles, plumes, rain and pump spin.
   *
   * It is decoration, and it was the one thing on the board with no back-pressure: the ticker
   * ran at a fixed 24 Hz whether the machine could afford it or not. On a loaded machine that is
   * exactly the cost that starves the app's own rAF — which is #596's finding, and #596 fixed
   * the RATE without making it adaptive.
   *
   * So: measure our own frame interval and skip ticks when it slips. The dash grid is unaffected
   * (it is redrawn from the shared clock below, so a skipped tick simply advances further next
   * time and the world alignment #233 protects is preserved by construction). What degrades is
   * how smooth a bubble looks, which is the right thing to spend first.
   *
   * NOT A FIX FOR THE OWNER'S NUMBERS, and it must not be reported as one: his render p95 is
   * 48.6 ms and the worst this harness reproduces is 22 ms, so the absolute cost is
   * environmental and unreproduced here. This removes real, measured waste; whether it is
   * enough is what his next report answers. */
  var animSkip = 0, animEma = 0;
  function flowTick() {
    flowRafPend = false;
    var now = performance.now();
    var frozen = !!document.querySelector('.pwr-board-stage.bd-frozen');
    if (!flowLastMs) flowLastMs = now;
    if (!frozen) flowClockMs += now - flowLastMs;
    var frameMs = flowLastMs ? now - flowLastMs : 0;
    flowLastMs = now;
    /* An exponential mean of our own interval. Nominal is 1000/FLOW_FPS ms; when the page is
     * healthy the timer lands near it, and when the main thread is contended it does not. */
    if (frameMs > 0 && frameMs < 2000) animEma = animEma ? (animEma * 0.85 + frameMs * 0.15) : frameMs;
    var nominal = 1000 / FLOW_FPS;
    /* 0 skips while we are inside ~2x nominal, then progressively more, capped so the motion
     * never stops outright — a frozen-looking board reads as a crashed sim. */
    var want = animEma > nominal * 4 ? 3 : animEma > nominal * 2 ? 1 : 0;
    /* THE SKIP COVERS THE DASH WRITES TOO (#613 wave 2, and the first wave was half a fix).
     *
     * The owner's rc1 report is what says so. Wave 1 gated `tickAnimations` alone and it WORKED
     * on the numbers it could reach: render p95 48.6 -> 21.7 ms, step 19.3 -> 2.3, budget
     * 49 % -> 17 %. And the frame rate did not move — 4.7 -> 4.6 fps — with the tool's verdict
     * flipping to "PAINTS ARE BEING DROPPED: more broadcasts than frames, with both stages
     * inside budget."
     *
     * That is the whole diagnosis: with our JS comfortably inside budget, the remaining cost is
     * the BROWSER's, and the loop below is what drives it — `stroke-dashoffset` written to ~67
     * polylines at 24 Hz is ~1,600 stroke invalidations a second, every one of which the
     * compositor must repaint. It is the same finding as #596 (dash strokes never composite;
     * measured there at 6x the raster cost of everything else) and wave 1 simply left it out.
     *
     * So one skip gates BOTH halves. The phase is computed from `flowClockMs`, an absolute
     * clock, so a skipped tick is not a dropped frame of motion — the next write lands where the
     * dashes should be by then, and #233's world-grid alignment is preserved exactly as it is
     * for the animation seeks above. */
    var doTick = true;
    if (animSkip > 0) { animSkip--; doTick = false; }
    else { animSkip = want; }
    if (doTick) tickAnimations(now);
    if (frozen || !doTick) return;
    var els = document.querySelectorAll('polyline[data-dash-cyc]');
    if (!els.length) return;
    var t = flowClockMs / 1000;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.style.animationPlayState === 'paused') continue;
      var cyc = parseFloat(el.getAttribute('data-dash-cyc')) || DASH_CYCLE_S;
      var ph = parseFloat(el.getAttribute('data-dash-t')) || 0;
      var drawn = parseFloat(el.getAttribute('data-dash-dir')) || 1;
      var signAttr = parseFloat(el.getAttribute('data-dash-sign'));
      var sign = isFinite(signAttr) ? signAttr : drawn;
      if (sign !== drawn) ph = (1 - ph) % 1;   // same complement setFlowSpeed's reverse used
      var prog = (t / cyc + ph) % 1;
      el.setAttribute('stroke-dashoffset', ((sign < 0 ? DASH_PERIOD : -DASH_PERIOD) * prog).toFixed(2));
    }
  }
  function ensureStyles() {
    if (flowTimer || typeof document === 'undefined') return;
    flowTimer = setInterval(function () {
      // Writes land inside a rAF so a frame never composites mid-batch (the 2026-08-06
      // strobing lesson, ui/app.js render()).
      if (flowRafPend) return;
      flowRafPend = true;
      (window.requestAnimationFrame || setTimeout)(flowTick);
    }, Math.round(1000 / FLOW_FPS));
  }

  function pointsOf(o) {
    return ptArray(o).map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
  }
  function ptArray(o) {
    if (o.points) return o.points.map(function (p) { return [p[0], p[1]]; });
    return [[o.x1, o.y1], [o.x2, o.y2]];
  }

  // ---------------------------------------------------------------------------
  // DASH GRID (#231/#233). Every flowing stroke in the plant shares one 10-on/15-off
  // period anchored to ABSOLUTE WORLD POSITION, so a canvas pipe and the leg of the
  // tee/cross/valve it meets land on the same grid and the dashes cross the joint
  // without a step.
  //
  // Two things have to be true, and both were wrong before:
  //   1. Arc length must grow in the same world direction for EVERY run. A run drawn
  //      in -x/-y is reversed (and its dir flipped) first — otherwise two legs of one
  //      fitting sit on opposite phase grids and meet mismatched at the centre.
  //   2. The phase must be measured in world space. A fitting draws its legs in TILE
  //      coordinates, so without ox/oy its grid starts at the tile instead of the
  //      canvas origin and every leg meets its pipe a fraction of a dash out of step.
  //      Fittings pass their tile origin as phaseX/phaseY; canvas pipes are already in
  //      world space and pass nothing.
  //
  // SPEED, not rate, sets dash velocity. Pipes have no rate slider, so folding a
  // component's 0–100 `flow` into its velocity made every fitting run at a different
  // speed from the pipe it joins. `rate`/`flow` still gates whether flow moves AT ALL.
  // ---------------------------------------------------------------------------
  //
  // LIVE SPEED (#350 item 10, "all dashed lines rate of movement needs to scale with the
  // flow rate"). `setFlowSpeed` re-times an already-drawn flow line WITHOUT rebuilding it,
  // by writing the two animation LONGHANDS. Never the shorthand: it carries the delay, and
  // the delay carries the world dash phase (#233).
  //
  // The phase is re-derived from the stashed `data-dash-t` (the run's 0..1 position on the
  // world grid) so the new delay lands on the SAME grid the old one did — otherwise every
  // speed change would walk the pipe out of step with the fitting it meets.
  //
  // A speed change is a DISCONTINUITY and cannot be made otherwise: CSS computes progress as
  // ((now - delay) / duration) mod 1, `now` grows without bound, so changing `duration` moves
  // the dashes by an amount that depends on how long the page has been open. That is why the
  // caller quantises (see LINE_SPEED in pwr_board_wiring.js) — the hop is one dash period at
  // worst, it happens only when a line genuinely changes flow band, and every element on that
  // system hops together because they all read the same number.
  var DASH_PERIOD = 25;
  var DASH_CYCLE_S = 1.04;   // seconds per period at speed 1 (== the old 10.4s / 10 periods)
  var SPEED_MIN = 0.1, SPEED_MAX = 4;

  function clampSpeed(v) {
    v = +v;
    if (!isFinite(v) || v <= 0) return 1;
    return v < SPEED_MIN ? SPEED_MIN : (v > SPEED_MAX ? SPEED_MAX : v);
  }

  // `reverse` flips the run against the sense it was DRAWN in — for a line whose direction is
  // a plant state rather than a geometry fact (the pressurizer surge line, #350 item 26).
  // Reversing swaps the keyframe AND takes the complement of the world phase, because
  // dashPhase derives t as ph/P forward and (P−ph)/P reverse: keeping the forward t on the
  // reverse keyframe would leave the line a fraction of a dash out of step with the tee it
  // hangs off, which is the #233 defect arriving through the back door.
  function setFlowSpeed(el, speed, reverse) {
    if (!el || !el.style) return;
    var cyc = DASH_CYCLE_S / clampSpeed(speed);
    var dir0 = parseFloat(el.getAttribute('data-dash-dir'));
    if (!isFinite(dir0)) dir0 = 1;
    var dir = reverse ? -dir0 : dir0;
    // Re-time by rewriting the clock contract, not CSS longhands — the shared ticker
    // (flowTick above) reads these on its next beat. `data-dash-t` stays the DRAWN phase;
    // the reverse complement is applied by the ticker when sign differs from drawn.
    el.setAttribute('data-dash-cyc', cyc.toFixed(4));
    el.setAttribute('data-dash-sign', String(dir));
  }

  function dashPhase(pts, dir, cycleDur, ox, oy) {
    var p = pts.slice();
    var a = p[0], b = p[1] || p[0];
    var horiz = Math.abs(b[1] - a[1]) <= Math.abs(b[0] - a[0]);
    var back = horiz ? (b[0] < a[0]) : (b[1] < a[1]);
    if (back) { p.reverse(); dir = -dir; }
    var c0 = (horiz ? p[0][0] : p[0][1]) + (horiz ? (ox || 0) : (oy || 0));
    var ph = ((c0 % DASH_PERIOD) + DASH_PERIOD) % DASH_PERIOD;   // 0..25 along the world axis
    // forward keyframes run 0 → -25 and reverse 0 → +25, so the reverse case needs the
    // complement to land on the same visual phase
    var t = (dir < 0 ? (DASH_PERIOD - ph) % DASH_PERIOD : ph) / DASH_PERIOD;
    // `t` is published so setFlowSpeed can re-derive the delay for a new duration.
    return { pts: p, dir: dir, offset: -ph, delay: -(t * cycleDur), t: t };
  }
  function resolveFluid(f) {
    if (f && typeof f === 'object') {
      // { phase, temp } -> global gradient;  { bore, flow } -> used as-is
      if (f.phase) return phaseTempColor(f.phase, f.temp == null ? WATER_MAX_C : f.temp);
      return f;
    }
    return (typeof f === 'string' ? FLUIDS[f] : null) || FLUIDS.coldWater;
  }

  function createKit(h) {
    ensureStyles();

    // A pipe run. o: { key, (x1,y1,x2,y2 | points:[[x,y]..]), d, fluid, flow, dir, speed, wall }
    //   d     pipe (bore) diameter        default 12
    //   fluid preset name or {bore,flow}  default coldWater
    //   flow  false to disable animation  default true
    //   dir   +1 forward / -1 reverse     default +1
    //   speed relative flow speed         default 1
    function pipe(o) {
      var d = o.d || 12;
      var fl = resolveFluid(o.fluid);
      var wall = o.wall == null ? Math.max(1.5, d * 0.2) : o.wall;
      var pts = pointsOf(o);
      var kids = [
        h('polyline', { key: 'case', points: pts, fill: 'none', stroke: WALL, strokeWidth: d + wall * 2, strokeLinecap: 'butt', strokeLinejoin: 'round' }),
        h('polyline', { key: 'bore', points: pts, fill: 'none', stroke: fl.bore, strokeWidth: d, strokeLinecap: 'butt', strokeLinejoin: 'round' })
      ];
      if (o.flow !== false && !fl.empty) {
        // 1.04s per dash period == the old 10.4s per ten periods, so speeds are unchanged
        var cyc = DASH_CYCLE_S / (o.speed || 1);
        var ph = dashPhase(ptArray(o), o.dir == null ? 1 : o.dir, cyc, o.phaseX, o.phaseY);
        kids.push(h('polyline', {
          key: 'flow', points: ph.pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' '),
          fill: 'none', stroke: fl.flow,
          strokeWidth: Math.max(2, d * 0.42), strokeLinecap: 'round', strokeLinejoin: 'round',
          strokeDasharray: '10 15', strokeDashoffset: ph.offset, opacity: 0.92,
          'data-dash-t': ph.t.toFixed(6), 'data-dash-dir': String(ph.dir),
          // The shared clock (flowTick) animates every element carrying data-dash-cyc; a
          // paused line holds via animationPlayState, same flag pwr_board always wrote.
          'data-dash-cyc': cyc.toFixed(4), 'data-dash-sign': String(ph.dir),
          style: o.paused ? { animationPlayState: 'paused' } : {}
        }));
      }
      return h('g', { key: o.key }, kids);
    }

    // Flange bar centered at (x,y), with a standard bolt pair. angle = pipe direction in degrees.
    function flange(o) {
      var d = o.d || 12;
      var over = o.over == null ? Math.max(4, d * 0.4) : o.over;
      var t = o.t == null ? Math.max(3.5, d * 0.32) : o.t;
      var len = d + over * 2;
      var bx = d / 2 + over / 2;   // bolt offset toward each flange end
      return h('g', {
        key: o.key,
        transform: 'translate(' + o.x + ',' + o.y + ') rotate(' + (90 - (o.angle || 0)) + ')'
      }, [
        h('rect', { key: 'bar', x: -len / 2, y: -t / 2, width: len, height: t, rx: 1.5, fill: FLANGE, stroke: FLANGE_DK, strokeWidth: 1 }),
        h('circle', { key: 'b1', cx: -bx, cy: 0, r: 1.5, fill: '#93a4b1' }),
        h('circle', { key: 'b2', cx: bx, cy: 0, r: 1.5, fill: '#93a4b1' })
      ]);
    }

    // Connection stub on a component edge: a short pipe + a flange at its free (mating) end.
    // dir points AWAY from the component: 'up' | 'down' | 'left' | 'right'.
    // out: true = fluid flows OUT of the component, false = INTO it (overrides default).
    // Returns { el, tip:[x,y] } so callers know exactly where the mating pipe should land.
    function stub(o) {
      var d = o.d || 12, len = o.len == null ? d + 8 : o.len;
      var x = o.x, y = o.y, ex = x, ey = y, ang = 0, fdir = 1;
      if (o.dir === 'up') { ey = y - len; ang = 90; fdir = -1; }
      else if (o.dir === 'down') { ey = y + len; ang = 90; fdir = 1; }
      else if (o.dir === 'left') { ex = x - len; ang = 0; fdir = -1; }
      else { ex = x + len; ang = 0; fdir = 1; }
      if (o.out != null) fdir = o.out ? 1 : -1;
      var el = h('g', { key: o.key }, [
        pipe({ key: 'p', x1: x, y1: y, x2: ex, y2: ey, d: d, fluid: o.fluid, flow: o.flow, dir: fdir, speed: o.speed }),
        flange({ key: 'f', x: ex, y: ey, angle: ang, d: d })
      ]);
      return { el: el, tip: [ex, ey] };
    }

    // Tee/junction marker where a pipe taps into another pipe. o: { key, x, y, d, fluid }
    function junction(o) {
      var d = o.d || 12;
      var fl = resolveFluid(o.fluid);
      var wall = Math.max(1.5, d * 0.2);
      return h('g', { key: o.key }, [
        h('circle', { key: 'o', cx: o.x, cy: o.y, r: d / 2 + wall + 1, fill: WALL, stroke: FLANGE_DK, strokeWidth: 1 }),
        h('circle', { key: 'i', cx: o.x, cy: o.y, r: d / 2, fill: fl.bore }),
        h('circle', { key: 'c', cx: o.x, cy: o.y, r: Math.max(1.4, d * 0.18), fill: fl.flow, opacity: 0.9 })
      ]);
    }

    return { pipe: pipe, flange: flange, stub: stub, junction: junction, dashPhase: dashPhase, setFlowSpeed: setFlowSpeed, DASH_PERIOD: DASH_PERIOD, DASH_CYCLE_S: DASH_CYCLE_S, FLUIDS: FLUIDS, SIZES: SIZES, STUB_LEN: STUB_LEN, phaseTempColor: phaseTempColor, TEMP_MIN_C: TEMP_MIN_C, WATER_MAX_C: WATER_MAX_C };
  }

  // watchScale(svgEl, onChange): reports the svg's LAYOUT scale (CSS px per viewBox
  // unit, min of both axes -- matches preserveAspectRatio 'meet'). Uses computed
  // style, so canvas pan/zoom transforms do NOT affect it. Components use this to
  // draw controls/connectors at a fixed on-screen size regardless of tile resizing.
  // Returns a cleanup function.
  function watchScale(svgEl, onChange) {
    function compute() {
      if (!svgEl || !svgEl.isConnected) return;
      var vb = svgEl.viewBox && svgEl.viewBox.baseVal;
      if (!vb || !vb.width || !vb.height) return;
      var cs = getComputedStyle(svgEl);
      var w = parseFloat(cs.width), hh = parseFloat(cs.height);
      if (!w || !hh) return;
      var s = Math.min(w / vb.width, hh / vb.height);
      if (s > 0.01 && isFinite(s)) onChange(s);
    }
    var ro = new ResizeObserver(function () { compute(); });
    ro.observe(svgEl);
    compute();
    return function () { ro.disconnect(); };
  }

  window.StdPipe = { createKit: createKit, watchScale: watchScale, dashPhase: dashPhase, setFlowSpeed: setFlowSpeed, DASH_PERIOD: DASH_PERIOD, DASH_CYCLE_S: DASH_CYCLE_S, FLUIDS: FLUIDS, SIZES: SIZES, STUB_LEN: STUB_LEN, phaseTempColor: phaseTempColor, TEMP_MIN_C: TEMP_MIN_C, WATER_MAX_C: WATER_MAX_C };
})();
