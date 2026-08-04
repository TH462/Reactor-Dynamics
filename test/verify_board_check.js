/*
 * verify_board_check.js — put `ui/test_panel/board_check.html` under the aggregate gate.
 *
 * WHY THIS EXISTS. board_check is the PWR board's own harness: it mounts the real diagram,
 * clicks real controls, and pins geometry, pipe animation state, colours and the driver's
 * value functions. It was written as a page you open, and CLAUDE.md has said "run it after
 * any board change" since #235 — an instruction, not a gate.
 *
 * That failed exactly the way an instruction does. MEASURED 2026-08-03: the harness was at
 * **1 FAILURE / 188** and had been for hours. #318 split the operator's ASK from the EHC
 * reference (`set_load_target` writes `load_cmd_mwe`; `LoadMode.step` brings
 * `load_target_mwe` to it), so the check reading `load_target_mwe` in the same breath as the
 * keystroke saw the PREVIOUS load. It went through a lane merge, a green 36-runner
 * `run_all`, a green CI run and A RELEASE TO `main` without anything going amber, because
 * nothing in `run_all` or `.github/workflows/gates.yml` opened the page. It was found by
 * hand, while doing unrelated work.
 *
 * This is also the second time the same shape has bitten: `run_manual_controls` was
 * `audit_manual_controls.js` — not a `run_*.js`, so auto-discovery never saw it, so it had
 * no baseline, so it sat at 32 mismatches through three procedure re-authorings (#224).
 * A harness nobody runs is a harness that is red.
 *
 * CHROMIUM, NOT EDGE, and that is not a preference. The documented local workflow drives
 * this page with headless Edge, which does not exist on `ubuntu-latest`; the other three
 * browser gates use `playwright.chromium`, which CI already installs and caches. Using
 * anything else here would put the gate in the same category as the instruction it replaces
 * — green on one machine, absent on the one that matters.
 *
 * WHAT IT ASSERTS. Deliberately thin: the page's own summary line. board_check owns the
 * checks; duplicating any of them here would create a second copy that rots independently,
 * which is the defect class this repo keeps finding. It reports the tally so `run_all`'s
 * symmetric drift catches a check being ADDED or LOST as well as one failing — that is the
 * whole reason to give it a baseline rather than just a pass/fail.
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
  // 1400x900, PINNED, and it is load-bearing rather than tidy: this harness measures
  // RENDERED rects (the #311 bdDtMargin overlap pins, the card-title clearance pins added
  // 2026-08-04), a rect depends on the stage scale, and the stage scale depends on the
  // viewport. Left to the default, a geometry check passes or fails on whatever window the
  // runner happened to get — green here, red in CI, for no reason anyone could reproduce.
  // Same size as the manual headless invocation CLAUDE.md documents.
  var page = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    .then(function (c) { return c.newPage(); });

  var pageErrors = [];
  page.on('pageerror', function (e) { pageErrors.push(String(e && e.message || e)); });

  await page.goto(PAGE);

  // board_check signals completion by rewriting document.title — it drives the plant through
  // a service, so the work is NOT finished when `load` fires. Wait on the title itself rather
  // than on a fixed sleep: a timeout that is merely GENEROUS is a flake waiting for a slower
  // machine, and one that is generous AND unchecked reports PASS on a page that never ran.
  var titled = await page.waitForFunction(
    function () { return /PASS|FAIL/.test(document.title); }, null, { timeout: 120000 }
  ).then(function () { return true; }).catch(function () { return false; });

  var title = await page.title();
  // Read `#out` — the element board_check writes its results into (board_check.html:768) —
  // and NOT `body`. `textContent` on body includes the text of every <script> on the page,
  // and this page's own source carries the sentence "board_check had been 1 FAILURE/143" in
  // a comment. The first cut of this gate scraped body, matched that comment, and reported
  // a FAILING board while the harness was green. That is CLAUDE.md's own warning about
  // scraping this page for numbers, which is quoted in the header above and was still walked
  // into — so the lesson is the narrower one: scope the read to the element that OWNS the
  // result, because a page that describes its own history will contain its own failure
  // strings as prose.
  var body = await page.textContent('#out').catch(function () { return ''; });
  await browser.close();

  var okLine = /ALL\s+(\d+)\s+CHECKS PASS/.exec(body);
  var badLine = /(\d+)\s+FAILURES?\s*\/\s*(\d+)/.exec(body);

  var fail = 0;
  function ck(name, ok, detail) {
    if (!ok) fail++;
    console.log((ok ? C.green + 'PASS' : C.red + 'FAIL') + C.off + '  ' + name +
      (ok || detail == null ? '' : C.dim + '   -> ' + detail + C.off));
  }

  ck('the page ran to completion (title carries a verdict)', titled, 'title was: ' + title);
  ck('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  ck('the harness reports a summary line', !!(okLine || badLine),
    'neither "ALL n CHECKS PASS" nor "n FAILURES / n" found');
  ck('board_check has zero failures', !badLine,
    badLine ? badLine[1] + ' failing of ' + badLine[2] : null);

  // Echo the harness's OWN failing lines. Without this the gate can only say "n failing
  // of m", and the next person has to reopen the page by hand to find out WHICH — most
  // of the friction that kept anyone from running it in the first place.
  body.split(String.fromCharCode(10)).forEach(function (l) {
    if (/^FAIL/.test(l.trim())) console.log('   ' + C.red + l.trim() + C.off);
  });

  var total = okLine ? Number(okLine[1]) : (badLine ? Number(badLine[2]) : 0);

  console.log('\n' + C.bold + '──────────────────────────────────────────' + C.off);
  console.log(C.bold + (fail ? C.red + 'BOARD CHECK: FAIL' : C.green + 'BOARD CHECK: PASS') + C.off +
    '   ' + total + ' checks');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
