/*
 * verify_board_scroll.js — the PWR board's diagram wrapper must never pan (#717).
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
 * scrollIntoView and for any future path, none of which this file has to enumerate.
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
function ck(name, ok, detail) {
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

    await ctx.close();
  }

  await browser.close();

  console.log('\n' + C.bold + '──────────────────────────────────────────' + C.off);
  console.log(C.bold + (fail ? C.red + 'BOARD SCROLL: FAIL' : C.green + 'BOARD SCROLL: PASS') + C.off +
    '   ' + (VIEWPORTS.length * 4 - fail) + '/' + (VIEWPORTS.length * 4) + ' checks');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
