/*
 * verify_board_scroll.js — nothing in the shell wears `overflow: hidden` as an unclamped
 * scrollport (#717 the board; #723 the three siblings a follow-up sweep found).
 *
 * ══════════════════════════════ PART 1 — THE BOARD (#717) ══════════════════════════════
 *
 * THE DEFECT. `.pwr-board-wrap` shipped with `overflow: hidden`, which clips visually but
 * still makes the element a live, unclamped SCROLLPORT. `.pwr-board-stage` is the full
 * 2400x1600 world canvas, while `layout()` in ui/diagram/board/pwr_board.js fits only the
 * CONTENT bounding box inside the wrap — so the stage's transformed box is always much
 * larger than the wrap, and every one of those overflow pixels is empty canvas margin.
 * MEASURED at 1400x900 before the fix: wrap 997x589 px, stage 1762x1175 px, scrollHeight
 * 1154, scrollWidth 1533, and `scrollTop = 300` stuck. A mouse wheel over the board did
 * exactly that in a real browser and panned the diagram off-screen with no scrollbar, no
 * reset control and no recovery short of a page reload.
 *
 * WHAT THIS ASSERTS, AND WHAT IT CANNOT. The wheel TRIGGER is not drivable here: Chromium
 * suppresses wheel-scrolling an overflow:hidden box, so ten CDP `mouse.wheel` pulses and a
 * raw `WheelEvent` dispatch all moved nothing even on the BROKEN build (inbox/scram/
 * repro_s3.js, repro_s3b.js), and no Firefox is installed for Playwright in this repo. So
 * this gate drives the one thing that DOES reproduce headlessly — writing `scrollTop` /
 * `scrollLeft` directly — and asserts the INVARIANT the fix produces rather than the
 * trigger: the wrap's scroll offset is unconditionally zero, however it was moved. That is
 * the stronger claim anyway; it holds for the wheel, for touch, for a descendant
 * scrollIntoView and for any future path, none of which this file has to enumerate. THE
 * SAME LIMIT AND THE SAME ANSWER APPLY TO EVERY PANEL BELOW — none of Part 2 drives a wheel
 * either, for the same reason.
 *
 * IT WOULD OTHERWISE BE HOLLOW, so each viewport asserts its own PRECONDITION first: the
 * stage's rendered box really is larger than the wrap. Without that, a layout change that
 * happened to stop the stage overflowing would make `scrollTop = 300` a no-op and every
 * check below would pass green over nothing — this repo's own "a passing check can be
 * HOLLOW" trap. Each viewport also re-measures a known board tile after the injection, so
 * a `scrollTop` that merely READS zero cannot stand in for a board that is actually drawn.
 *
 * PROVED RED BY INJECTION (2026-09-12): reverting `overflow: clip` to `overflow: hidden`
 * in pwr_board.css takes this runner from 16/16 to 4 failing of 16 — the four
 * "wrap is back at its scroll origin" checks, one per viewport.
 *
 * THE FOUR VIEWPORTS are the board's real layout states, not a spread of round numbers:
 * 1400x900 is the pinned size the other board gates use; 1250 and 1100 straddle the
 * control-room grid's 1200 px stacking breakpoint (pwr_board.js layout()); 800 is below
 * the 860 px stacked-columns breakpoint, where shell.css also hands the PAGE its own
 * scrollbar. There is no in-app fullscreen mode — the shell's help text offers F11, the
 * browser's own, which is just a larger viewport.
 *
 * ══════════════════════ PART 2 — THE THREE #723 SIBLINGS ═══════════════════════════════
 *
 * #723 was a DOM-walk sweep of the loaded shell finding every other `overflow: hidden`
 * element that (a) genuinely overflows and (b) accepts and keeps a scroll write. It found
 * three, and named per element whether scrolling it is ever legitimate — none of them is,
 * so all three are CLAMPED like the board, not made to scroll honestly:
 *
 *   1. `.scanline-body` (shell.css) — the System Scanner's one-line ellipsis text. The
 *      `overflow: hidden` is doing real work (it is what makes `text-overflow: ellipsis`
 *      clip the line), and the "overflow" is a ~2px line-box rounding remainder, not
 *      content — MEASURED 12px client / 14px scroll, both viewports. `overflow: clip`
 *      keeps the ellipsis identical (verified by screenshot diff against `overflow: hidden`
 *      in a throwaway harness) and refuses the scroll write.
 *
 *   2. `.tab-body.instr-mode` / `.tab-body.ckl-mode` (shell.css) — the tab body's OWN
 *      comment already says scrolling is not this element's job ("THE INSTRUCTOR PANE OWNS
 *      ITS HEIGHT, and the LOG is what scrolls — not .tab-body"). It was still panned 42px
 *      in the control-room grid's stacked row because that row's track was `auto` (content-
 *      sized) while `.tools.expanded { flex: 1 1 0 }` reports ~0 as its CONTENT contribution
 *      to that auto-sizing pass — MEASURED (2026-09-12, before any fix): client 20px /
 *      scroll 62px at BOTH 1100 and 800px wide (the squeeze is the <=1200px control-room
 *      grid stacking, not the 860px page-stack breakpoint the #723 sweep happened to
 *      sample). FIX, two parts: (a) `grid-template-rows: 78vh minmax(260px, 22vh)` gives
 *      that row a real floor, which alone fixes it back to client===scroll (67/67) with
 *      REAL content at every width — this is the root cause, and PROVED RED BY INJECTION
 *      below. (b) `overflow: clip` as the same defensive backstop as the board, because the
 *      element's own comment already forbids scrolling it under ANY cause, not just this one.
 *
 *   3. `#laneStack.lane-stack` (ui/test_panel/lane_reference.html) — a pixel-exact fixed
 *      list; the whole point of the artifact is that nothing in it scrolls. MEASURED 7px of
 *      overflow, traced to `.lane.form-num`'s 18px row holding a value+unit pair stacked in
 *      a column (needs ~22.5px) — the numeric row's own supposed advantage (compact) was
 *      defeated by stacking two lines in it. FIX: lay the value+unit out on one line
 *      (`flex-direction: row`) so the row's real content fits its own 18px, THEN
 *      `overflow: clip` as the backstop.
 *
 * ANTI-HOLLOW, PART 2's OWN VERSION. Fixing the instr-mode squeeze and the lane-stack
 * mismatch means neither element overflows its box under normal content any more — so
 * "write scrollTop, read back 0" would be true of any non-overflowing element regardless of
 * `overflow: clip`, and prove nothing about the CLAMP specifically. Each clamp check below
 * therefore FORCES a genuine overflow first (an oversized `.persona`, a capped
 * `.lane-stack` `max-height`, a capped `.scanline-body` `max-height`) and only then writes
 * scrollTop — so the check is exercising the clamp, not the absence of a defect to clamp.
 * The row-height fix gets its OWN separate check with NO forcing, because "does the pane
 * still need forcing to overflow" is exactly the claim that fix makes.
 *
 * PROVED RED BY INJECTION (2026-09-12), each in isolation:
 *   - `.scanline-body` `overflow: clip` -> `overflow: hidden` (single decl removed): the
 *     forced-overflow scanline clamp check fails (reads back 6, the forced max-height).
 *   - `.tab-body.instr-mode` / `.tab-body.ckl-mode` clip removed: both forced-overflow
 *     clamp checks fail the same way.
 *   - `grid-template-rows: 78vh auto` (the pre-fix value): the NO-FORCING "pane fits its
 *     own box" check fails at 1100/800 (client 20 vs scroll 62 again).
 *   - `.lane.form-num .lane-val` row reverted to the shared column layout, `overflow: clip`
 *     left in place: the no-forcing lane-stack fit check fails (234 vs 241); with the clip
 *     also reverted, the forced-overflow clamp check fails too (reads back 300).
 *
 * Run: node test/verify_board_scroll.js
 */
'use strict';
var path = require('path');
var ROOT = path.join(__dirname, '..');
var SHELL = 'file:///' + path.join(ROOT, 'ui', 'shell.html').replace(/\\/g, '/') + '?engine=pwr2';

var C = { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' };

/* Each entry is a LAYOUT STATE, named so a red says which one broke. */
var VIEWPORTS = [
  { w: 1400, h: 900, why: 'the pinned board-gate viewport' },
  { w: 1250, h: 900, why: 'just above the 1200px control-room stacking breakpoint' },
  { w: 1100, h: 900, why: 'just below the 1200px control-room stacking breakpoint' },
  { w: 800, h: 900, why: 'below the 860px stacked-columns breakpoint (the page scrolls here)' }
];

var fail = 0;
var total = 0;
function ck(name, ok, detail) {
  total++;
  if (!ok) fail++;
  console.log((ok ? C.green + 'PASS' : C.red + 'FAIL') + C.off + '  ' + name +
    (ok || detail == null ? '' : C.dim + '   -> ' + detail + C.off));
}

(async function () {
  var playwright = require('playwright');
  var browser = await playwright.chromium.launch({ headless: true });

  for (var i = 0; i < VIEWPORTS.length; i++) {
    var vp = VIEWPORTS[i];
    var tag = vp.w + 'x' + vp.h;
    var ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    var page = await ctx.newPage();
    await page.goto(SHELL);
    await page.waitForSelector('.pwr-board-wrap', { timeout: 30000 });
    /* The board mounts, then layout() runs off a ResizeObserver and the ports re-scan on a
     * 350 ms settle timer — measure after that, not on first paint. */
    await page.waitForTimeout(1500);

    var m = await page.evaluate(function () {
      var wrap = document.querySelector('.pwr-board-wrap');
      var stage = wrap && wrap.querySelector('.pwr-board-stage');
      if (!wrap || !stage) return { missing: true };
      var wr = wrap.getBoundingClientRect();
      var sr = stage.getBoundingClientRect();

      /* THE INJECTION. This is repro_s3b.js technique #1 — the only one that reproduces
       * the defect headlessly. On the broken build both reads come back 300. */
      wrap.scrollTop = 300;
      wrap.scrollLeft = 300;
      return {
        overflowX: sr.width - wr.width,      /* precondition: the stage really does overflow */
        overflowY: sr.height - wr.height,
        st: wrap.scrollTop,
        sl: wrap.scrollLeft
      };
    });

    if (m.missing) { ck(tag + ': the board mounted', false, 'no .pwr-board-wrap / .pwr-board-stage'); await ctx.close(); continue; }

    /* Give the scroll BACKSTOP its event a chance to land. `overflow: clip` needs none of
     * this (the write never takes), but the JS listener is what an engine without `clip`
     * would be relying on, and it fires asynchronously. A generous-but-CHECKED wait. */
    await page.waitForTimeout(250);

    var after = await page.evaluate(function () {
      var wrap = document.querySelector('.pwr-board-wrap');
      var wr = wrap.getBoundingClientRect();
      /* Re-measure a real board tile: a scrollTop that merely READS zero is not evidence
       * that the diagram is on screen. The reactor vessel is the board's largest authored
       * tile and is present in every layout state. */
      var v = wrap.querySelector('[data-item="reactorVessel"]');
      var vr = v ? v.getBoundingClientRect() : null;
      return {
        st: wrap.scrollTop,
        sl: wrap.scrollLeft,
        vesselInside: !!vr && vr.width > 4 && vr.height > 4 &&
          vr.left >= wr.left - 1 && vr.right <= wr.right + 1 &&
          vr.top >= wr.top - 1 && vr.bottom <= wr.bottom + 1,
        vessel: vr ? { l: Math.round(vr.left), t: Math.round(vr.top), r: Math.round(vr.right), b: Math.round(vr.bottom) } : null,
        wrapRect: { l: Math.round(wr.left), t: Math.round(wr.top), r: Math.round(wr.right), b: Math.round(wr.bottom) }
      };
    });

    console.log(C.bold + tag + C.off + C.dim + '  (' + vp.why + ')' + C.off);

    ck(tag + ': the stage still overflows the wrap (the defect ingredient is present)',
      m.overflowX > 1 && m.overflowY > 1,
      'stage - wrap = ' + m.overflowX.toFixed(1) + ' x ' + m.overflowY.toFixed(1) + ' px; ' +
      'if this is ~0 the scroll injection below is a no-op and this file proves nothing');

    ck(tag + ': the wrap refuses the scroll write outright (overflow: clip)',
      m.st === 0 && m.sl === 0,
      'scrollTop/Left read back ' + m.st + '/' + m.sl + ' immediately after the write — ' +
      'the wrap is still a live scrollport; the JS backstop below is all that is holding it');

    ck(tag + ': the wrap is back at its scroll origin',
      after.st === 0 && after.sl === 0,
      'scrollTop/Left = ' + after.st + '/' + after.sl + ' after a 300/300 write — THE BOARD IS PANNED');

    ck(tag + ': the reactor vessel is drawn inside the wrap',
      after.vesselInside,
      'vessel ' + JSON.stringify(after.vessel) + ' vs wrap ' + JSON.stringify(after.wrapRect));

    /* ────────────────────── #723 sibling 1: .scanline-body ────────────────────── */
    var scan = await page.evaluate(function () {
      var el = document.querySelector('.scanline-body');
      if (!el) return { missing: true };
      var natural = { client: el.clientHeight, scroll: el.scrollHeight };
      el.scrollTop = 300;
      var naturalClamp = el.scrollTop;
      /* FORCE a larger, unambiguous overflow so the clamp check below cannot be hollow
       * ("nothing to scroll to" reading back 0 proves nothing) even if the default hint
       * text is ever shortened past the natural ~2px line-box remainder. */
      el.style.maxHeight = '6px';
      var forced = { client: el.clientHeight, scroll: el.scrollHeight };
      el.scrollTop = 300;
      var forcedClamp = el.scrollTop;
      el.style.maxHeight = '';
      return { natural: natural, naturalClamp: naturalClamp, forced: forced, forcedClamp: forcedClamp };
    });
    if (scan.missing) {
      ck(tag + ': .scanline-body present', false, 'selector missing');
    } else {
      ck(tag + ': .scanline-body has its natural line-box overflow (the defect ingredient)',
        scan.natural.scroll > scan.natural.client,
        'client/scroll = ' + scan.natural.client + '/' + scan.natural.scroll + '; if these are equal ' +
        'the natural-overflow check below is a no-op');
      ck(tag + ': .scanline-body refuses the natural-overflow scroll write',
        scan.naturalClamp === 0, 'scrollTop read back ' + scan.naturalClamp);
      ck(tag + ': .scanline-body refuses a FORCED, larger scroll write too',
        scan.forcedClamp === 0,
        'scrollTop read back ' + scan.forcedClamp + ' after forcing client/scroll = ' +
        scan.forced.client + '/' + scan.forced.scroll);
    }

    /* ─────────────── #723 sibling 2a: .tab-body.instr-mode (Instructor tab) ─────────────── */
    await page.evaluate(function () {
      var btn = document.querySelector('[data-tab="instructor"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(300);
    var instr = await page.evaluate(function () {
      var el = document.querySelector('.tab-body.instr-mode');
      if (!el) return { missing: true };
      /* NO forcing here on purpose: this is the row-height fix's OWN claim — that the pane
       * fits its real content at every layout state without ever needing to scroll. */
      var natural = { client: el.clientHeight, scroll: el.scrollHeight };
      /* THEN force a genuine overflow (an oversized persona header) to exercise the CLAMP
       * itself, since the fix above means a plain scrollTop write has nothing to scroll. */
      var persona = document.querySelector('.persona');
      var saved = persona ? persona.style.minHeight : null;
      if (persona) persona.style.minHeight = '2000px';
      var forced = { client: el.clientHeight, scroll: el.scrollHeight };
      el.scrollTop = 300;
      var forcedClamp = el.scrollTop;
      if (persona) persona.style.minHeight = saved || '';
      return { natural: natural, forced: forced, forcedClamp: forcedClamp };
    });
    if (instr.missing) {
      ck(tag + ': .tab-body.instr-mode present', false, 'selector missing (Instructor tab did not activate?)');
    } else {
      ck(tag + ': .tab-body.instr-mode fits its own content with no forcing (the row-height fix)',
        instr.natural.client === instr.natural.scroll,
        'client/scroll = ' + instr.natural.client + '/' + instr.natural.scroll +
        ' — a mismatch means the pane is squeezed and needs to scroll to show itself, ' +
        'the pre-fix state (measured 20/62 at 1100 and 800px wide)');
      ck(tag + ': .tab-body.instr-mode refuses a FORCED scroll write (the clamp)',
        instr.forcedClamp === 0,
        'scrollTop read back ' + instr.forcedClamp + ' after forcing client/scroll = ' +
        instr.forced.client + '/' + instr.forced.scroll);
    }

    /* ─────────────── #723 sibling 2b: .tab-body.ckl-mode (Walkthroughs tab) ─────────────── */
    await page.evaluate(function () {
      var btn = document.querySelector('[data-tab="checklists"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(300);
    var ckl = await page.evaluate(function () {
      var el = document.querySelector('.tab-body.ckl-mode');
      if (!el) return { missing: true };
      el.scrollTop = 300;
      var naturalClamp = el.scrollTop;
      el.style.maxHeight = '10px';
      var forced = { client: el.clientHeight, scroll: el.scrollHeight };
      el.scrollTop = 300;
      var forcedClamp = el.scrollTop;
      el.style.maxHeight = '';
      return { naturalClamp: naturalClamp, forced: forced, forcedClamp: forcedClamp };
    });
    if (ckl.missing) {
      ck(tag + ': .tab-body.ckl-mode present', false, 'selector missing (Walkthroughs tab did not activate?)');
    } else {
      ck(tag + ': .tab-body.ckl-mode refuses the scroll write',
        ckl.naturalClamp === 0, 'scrollTop read back ' + ckl.naturalClamp);
      ck(tag + ': .tab-body.ckl-mode refuses a FORCED scroll write too',
        ckl.forcedClamp === 0,
        'scrollTop read back ' + ckl.forcedClamp + ' after forcing client/scroll = ' +
        ckl.forced.client + '/' + ckl.forced.scroll);
    }

    await ctx.close();
  }

  /* ─────────────── #723 sibling 3: #laneStack (ui/test_panel/lane_reference.html) ─────────────── */
  var LANE = 'file:///' + path.join(ROOT, 'ui', 'test_panel', 'lane_reference.html').replace(/\\/g, '/');
  var lctx = await browser.newContext({ viewport: { width: 700, height: 500 } });
  var lpage = await lctx.newPage();
  await lpage.goto(LANE);
  await lpage.waitForTimeout(300);
  var lane = await lpage.evaluate(function () {
    var el = document.getElementById('laneStack');
    if (!el) return { missing: true };
    /* NO forcing: this is the .form-num inline-layout fix's own claim. */
    var natural = { client: el.clientHeight, scroll: el.scrollHeight };
    el.scrollTop = 300;
    var naturalClamp = el.scrollTop;
    /* THEN force a genuine overflow (a capped max-height) to exercise the clamp itself. */
    el.style.maxHeight = '100px';
    var forced = { client: el.clientHeight, scroll: el.scrollHeight };
    el.scrollTop = 300;
    var forcedClamp = el.scrollTop;
    el.style.maxHeight = '';
    return { natural: natural, naturalClamp: naturalClamp, forced: forced, forcedClamp: forcedClamp };
  });
  console.log(C.bold + 'lane_reference.html' + C.off + C.dim + '  (#440/#509 golden artifact, fixed-size page)' + C.off);
  if (lane.missing) {
    ck('lane_reference.html: #laneStack present', false, 'selector missing');
  } else {
    ck('#laneStack fits its own content with no forcing (the form-num inline-layout fix)',
      lane.natural.client === lane.natural.scroll,
      'client/scroll = ' + lane.natural.client + '/' + lane.natural.scroll +
      ' — pre-fix this was 234/241, the 7px traced to .lane.form-num');
    ck('#laneStack refuses the natural scroll write',
      lane.naturalClamp === 0, 'scrollTop read back ' + lane.naturalClamp);
    ck('#laneStack refuses a FORCED scroll write too',
      lane.forcedClamp === 0,
      'scrollTop read back ' + lane.forcedClamp + ' after forcing client/scroll = ' +
      lane.forced.client + '/' + lane.forced.scroll);
  }
  await lctx.close();

  await browser.close();

  console.log('\n' + C.bold + '──────────────────────────────────────────' + C.off);
  console.log(C.bold + (fail ? C.red + 'BOARD SCROLL: FAIL' : C.green + 'BOARD SCROLL: PASS') + C.off +
    '   ' + (total - fail) + '/' + total + ' checks');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
