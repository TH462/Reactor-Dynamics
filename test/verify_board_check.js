/*
 * verify_board_check.js — put `ui/test_panel/board_check.html` under `run_all` (2026-08-04).
 *
 * WHY THIS FILE EXISTS, and it is not "board coverage" — the harness already had that.
 * It exists because the harness's SCORE lived only as a sentence in CLAUDE.md, and that
 * sentence has now been wrong twice, in the same direction, for the same reason:
 *
 *   · before #289 it read "143/143" while the harness was at 1 FAILURE / 143
 *   · through 2026-08-03 it read "188/188" while the harness was at 1 FAILURE / 188
 *
 * Both times the number was written by someone who ADDED PINS WITHOUT RUNNING THE FILE,
 * and both times nothing could contradict them: board_check is an HTML page in `ui/`, not
 * a `run_*.js` in `test/`, so `run_all`'s auto-discovery never saw it, so it had no
 * BASELINES entry, so the only record of its score was prose. CLAUDE.md's own gate-baseline
 * section says exactly this about prose baselines — "Prose baselines are what rotted" — and
 * then carried one for this harness anyway.
 *
 * The fix is structural, not diligence: this runner is discovered, so a missing BASELINES
 * entry is itself a gate failure, and the score is DATA that drifts symmetrically. A pin
 * added without running the file now reddens `run_all` for the person who added it. Same
 * move `run_manual_controls.js` made for `audit_manual_controls.js` (#224), which sat at
 * 32 mismatches / exit 1 through three procedure re-authorings for the identical reason.
 *
 * WHAT IT DOES NOT DO: it adds no checks of its own. Every assertion still lives in
 * board_check.html, which is the right place for them — it mounts the real board with the
 * real driver and the real service. This is a HARNESS RUNNER: load the page, wait for it
 * to finish, read ITS OWN summary line, exit on it.
 *
 * Read the summary line, never scrape the page for `n/n` pairs — CLAUDE.md has warned about
 * that since the pins started reporting geometry ("x 1525 vs 1525"), and a scrape picks
 * those up and reports a nonsense total.
 *
 * Run: node test/verify_board_check.js
 */
'use strict';
var path = require('path');
var ROOT = path.join(__dirname, '..');
var PAGE = 'file:///' + path.join(ROOT, 'ui', 'test_panel', 'board_check.html').replace(/\\/g, '/');

var C = { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' };

(async function () {
  var playwright = require('playwright');
  var browser = await playwright.chromium.launch({ headless: true });
  // 1400x900: the harness measures RENDERED rects (the #311 overlap pins, the card-title
  // pins), and a rect depends on the stage scale, which depends on the viewport. Pinning it
  // here keeps a geometry check from passing or failing on the window size it happened to
  // get. The manual headless-Edge invocation in CLAUDE.md uses the same size.
  var ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  var page = await ctx.newPage();

  // A page error is a HARD failure, not a red check: board_check builds its own tally, so
  // an exception thrown halfway through leaves a PARTIAL count that would look like a pass
  // with fewer checks — which is the silent-truncation shape this runner exists to stop.
  var pageErrors = [];
  page.on('pageerror', function (e) { pageErrors.push(String(e && e.message || e)); });

  await page.goto(PAGE);
  // The harness runs its whole body inside one setTimeout(…, 800) and stamps the title when
  // it is done, so the title IS the completion signal. Waiting on it rather than on a fixed
  // sleep means a slower machine cannot silently read a half-finished page.
  var finished = true;
  try {
    await page.waitForFunction(function () { return /^(PASS|FAIL) /.test(document.title); }, null, { timeout: 60000 });
  } catch (e) { finished = false; }

  var body = await page.evaluate(function () {
    var el = document.getElementById('out');
    return el ? el.textContent : '';
  });
  await browser.close();

  var lines = body.split('\n');
  var fails = lines.filter(function (l) { return /^FAIL\b/.test(l.trim()); });
  // board_check.html:916 — 'ALL n CHECKS PASS' | 'n FAILURES / n'
  var okM = body.match(/ALL\s+(\d+)\s+CHECKS PASS/);
  var badM = body.match(/(\d+)\s+FAILURES\s*\/\s*(\d+)/);

  var nPass = 0, nFail = 0, ok = false;
  if (okM) { nPass = +okM[1]; nFail = 0; ok = true; }
  else if (badM) { nFail = +badM[1]; nPass = +badM[2] - nFail; }

  fails.forEach(function (l) { console.log(C.red + l.trim() + C.off); });
  pageErrors.forEach(function (e) { console.log(C.red + 'PAGE ERROR  ' + e + C.off); });

  var hardFail = !finished || (!okM && !badM) || pageErrors.length;
  console.log('\n' + C.bold + '──────────────────────────────────────────' + C.off);
  if (hardFail) {
    console.log(C.bold + C.red + 'BOARD CHECK: DID NOT COMPLETE' + C.off + C.dim +
      (finished ? '' : '   (title never stamped — the harness threw or hung)') + C.off);
    process.exit(2);
  }
  // The tally line run_all scrapes. The SPACE before 'checks' is load-bearing: the scraper's
  // pattern is /(^|[\s(])(\d+)\s+(pass|xfail|passed|failed|checks|screenshots)\b/ and it
  // strips whitespace AFTER matching, so the BASELINES string reads '202checks 0failed'
  // while the line printed here must not. Printing them closed up scrapes to `?`, which
  // run_all reports as DRIFT against every baseline — caught on the first wiring-up.
  console.log(C.bold + (ok ? C.green + 'BOARD CHECK: PASS' : C.red + 'BOARD CHECK: FAIL') + C.off +
    '   ' + (nPass + nFail) + ' checks, ' + nFail + ' failed');
  process.exit(ok ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(2); });
