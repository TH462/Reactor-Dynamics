/* UI playthrough: manual procedure pills + Instructor follow vs rendered Plant Display control bar.
 * Run: node test/verify_manual_follow.js */
'use strict';
var path = require('path');
var http = require('http');
var fs = require('fs');
var map = require('./manual_ui_map.js');

var ROOT = path.join(__dirname, '..');
var SCRATCH = process.env.GROK_GOAL_SCRATCH || path.join(require('os').tmpdir(), 'grok-goal-0a451deb05ff', 'implementer');
// EPHEMERAL, assigned by the OS in startServer below — NOT a random pick from a range.
// This gate used 9760-9799 and verify_e2e_ui used 9750-9799: overlapping, both random. That
// never bit while run_all was sequential, and became an intermittent collision the moment it
// went parallel (2026-08-04) — the worst failure mode to put in a gate, because it fails a
// run that has nothing wrong with it and passes on the retry. `listen(0)` cannot collide.
var PORT = 0;

// `waitUntil: 'load'`, not `'networkidle'` (2026-08-04). MEASURED on this page, 5 samples:
// networkidle 0.64 s, load 0.29 s, domcontentloaded 0.25 s — networkidle waits an extra
// half-second of NETWORK QUIET after the page is already usable, and this gate navigates 87
// times, so it was ~30 s of pure sitting still. Verified sufficient rather than assumed: at
// `load` the shell has `#manualBtn` visible AND `RD.PwrBoard.isMounted()` true, which are the
// two things every phase below immediately depends on.
//
// `domcontentloaded` is NOT taken. It is barely faster and it fires before the deferred
// engine/layer scripts finish, so the board would not be mounted — this gate would then be
// racing the thing it exists to inspect.
require('../ui/manual_procedures.js');
var RD = globalThis.RD;

function startServer() {
  return new Promise(function (resolve) {
    var srv = http.createServer(function (req, res) {
      var url = (req.url || '/').split('?')[0];
      if (url === '/') url = '/ui/shell.html';
      var fp = path.join(ROOT, decodeURIComponent(url.replace(/^\//, '').replace(/\//g, path.sep)));
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      var mime = fp.endsWith('.html') ? 'text/html' : fp.endsWith('.js') ? 'application/javascript' : fp.endsWith('.css') ? 'text/css' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(fs.readFileSync(fp));
    });
    srv.listen(0, '127.0.0.1', function () { PORT = srv.address().port; resolve(srv); });
  });
}

function cgLabels(page) {
  return page.evaluate(function () {
    return Array.prototype.map.call(document.querySelectorAll('#pdCtlRow .cg-l'), function (el) { return el.textContent.trim(); });
  });
}


/* THE PLANT & MISSION WINDOW OPENS ON EVERY LOAD since 2026-08-11 *(OWNER DIRECTIVE: "It
 * should always the the first thing someone sees when loading the sim.")*, so every gate
 * navigation dismisses it exactly as a player does — never by a URL exemption, because a
 * bypass list containing `engine=` is precisely what hid the window from every real
 * visitor while a bare-URL check reported it working.
 *
 * IT WAITS FOR THE WINDOW RATHER THAN ASSUMING IT IS UP. `waitUntil: 'load'` returns
 * before app.js has run its init, so a fixed 200 ms probe found nothing, skipped, and then
 * the window appeared and swallowed every later click — 34 checks instead of 261. "Not
 * there yet" and "not there" are different answers and only one of them means skip. */
async function dismissMission(page) {
  for (var i = 0; i < 30; i++) {
    try {
      if (await page.isVisible('#missionOverlay')) {
        await page.click('#missionClose');
        /* AND PAUSE. Closing the window now RESUMES the plant (owner, 2026-08-11: "Sim
         * should start running not paused"), and this gate never plays the sim — it checks
         * control-surface reachability step by step. On a running plant the steps grade
         * themselves off the instruments and advance, so every reading came out one step
         * late: 34 failures, all of the form 'Instructor "<step N+1>" expected "<step N>"'.
         * The gate's subject is the mapping, not the dynamics; freeze the clock. */
        // IMMEDIATELY, with no intervening wait. A 200 ms gap between the close and the
        // pause let the plant tick twice, and two ticks are enough for a follow step whose
        // acceptance is already satisfied to grade itself and advance — which shifted every
        // subsequent reading by exactly one step (24 failures, all off-by-one). Pausing in
        // the same turn removes the window rather than making it smaller.
        try {
          await page.evaluate(function () {
            var b = document.getElementById('playBtn');
            if (b && b.textContent.trim() !== '▶') b.click();
          });
        } catch (e) { /* no play button on this view */ }
        await page.waitForTimeout(150);
        return true;
      }
    } catch (e) { /* not mounted yet */ }
    await page.waitForTimeout(100);
  }
  return false;   // never appeared — let the caller's own checks report what that broke
}

async function checkControlOnBar(page, prof, view, control) {
  if (prof === 'pwr') {
    // The PWR plant display is the learning board (no view bar): a control is
    // "on the board" when the board can reveal it (auto-switching the tab or
    // section it hides behind — the same path Instructor highlights use).
    // This used to probe the V1 synoptic (RD.PwrSynoptic), which still loaded but
    // never mounted, so every bar-check failed regardless of the board's contents
    // (#149). The V1 module was deleted in #246; RD.PwrBoard is the only display.
    return page.evaluate(function (label) {
      var RD = globalThis.RD;
      return !!(RD.PwrBoard && RD.PwrBoard.isMounted() && RD.PwrBoard.revealControl(label));
    }, view === 'scram' ? map.VIEW_CONTROLS.pwr.scram : control);
  }
  if (view === 'scram') {
    var txt = await page.locator('#pdScram').textContent();
    return txt.trim() === map.VIEW_CONTROLS[prof].scram;
  }
  var labels = await cgLabels(page);
  return labels.indexOf(control) >= 0;
}

// Click a view tab if this plant has a view bar. The PWR board has none (its controls are
// revealed by RD.PwrBoard.revealControl, not by a bar), so this is a no-op there.
async function selectView(page, v) {
  await page.evaluate(function (view) {
    var tabs = document.querySelectorAll('#viewTabs [data-view]');
    for (var i = 0; i < tabs.length; i++) { if (tabs[i].getAttribute('data-view') === view) tabs[i].click(); }
  }, v);
  await page.waitForTimeout(400);
}

async function verifyProcedure(page, prof, proc) {
  var expects = map.STEP_UI[proc.id];
  if (!expects) return [];
  var log = [];
  var fails = 0;

  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=' + prof, { waitUntil: 'load', timeout: 90000 });
  await dismissMission(page);
  await page.waitForTimeout(600);
  await page.click('#manualBtn');
  await page.click('#manualNav [data-msec="procedures"]');
  await page.waitForTimeout(400);

  for (var e = 0; e < expects.length; e++) {
    var ex = expects[e];
    var st = proc.steps[ex.i];
    if (!st || !st.control) continue;
    var pill = await page.evaluate(function (args) {
      var cards = document.querySelectorAll('#manualContent .m-card');
      for (var c = 0; c < cards.length; c++) {
        var btn = cards[c].querySelector('[data-follow="' + args.pid + '"]');
        if (!btn) continue;
        var steps = cards[c].querySelectorAll('.m-step');
        if (!steps[args.stepIdx]) return null;
        var meta = steps[args.stepIdx].querySelector('.m-meta');
        if (!meta) return null;
        var p = meta.querySelector('.m-pill');
        return p ? p.textContent.trim() : null;
      }
      return null;
    }, { pid: proc.id, stepIdx: ex.i });
    if (pill !== st.control) {
      fails++;
      log.push('FAIL ' + prof + ' · ' + proc.id + ' step ' + (ex.i + 1) + ' manual pill: "' + pill + '" expected "' + st.control + '"');
    } else {
      log.push('OK   ' + prof + ' · ' + proc.id + ' step ' + (ex.i + 1) + ': manual pill "' + st.control + '"');
    }
  }

  // ---- bar check. ONE page load for the whole procedure (#224).
  //
  // This used to `goto(...&view=<v>)` once per entry. Two things were wrong with that:
  // `&view=` is read by NOTHING in ui/app.js — grep it — so every one of those loads
  // rendered the identical page, and the view is actually selected by clicking the tab
  // (which the follow loop below already does). N identical page loads per procedure was
  // affordable only while STEP_UI covered 17 steps; filling it to 58 would have made this
  // gate several minutes slower for no extra assurance. Load once, click the tab when the
  // plant has one, check each entry.
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=' + prof, { waitUntil: 'load', timeout: 90000 });
  await dismissMission(page);
  await page.waitForTimeout(500);
  var lastView = null;
  for (var b = 0; b < expects.length; b++) {
    var exb = expects[b];
    var stb = proc.steps[exb.i];
    if (!stb || !stb.control) continue;
    var vb = exb.view === 'scram' ? 'primary' : exb.view;
    if (vb !== lastView) { await selectView(page, vb); lastView = vb; }
    if (!(await checkControlOnBar(page, prof, exb.view, stb.control))) {
      fails++;
      log.push('FAIL ' + prof + ' · ' + proc.id + ' step ' + (exb.i + 1) + ': "' + stb.control + '" not on ' + exb.view + ' bar');
    } else {
      log.push('OK   ' + prof + ' · ' + proc.id + ' step ' + (exb.i + 1) + ': ' + exb.view + ' bar "' + stb.control + '"');
    }
  }

  // ---- Instructor-follow check. ONE page load, walking FORWARD (#224).
  //
  // This used to reload the page per entry and then click `next` i times to get back to
  // step i — O(n²) clicks in the length of the procedure. `pwr_heatup` alone (entries at
  // i = 1…17) would have cost 153 clicks and 17 page loads. The follow pane only ever
  // moves forward, and the entries are in step order, so walk it once: 17 clicks, 1 load.
  // Sorted defensively — an out-of-order entry would otherwise silently skip a step.
  var ordered = expects.slice().sort(function (p, q) { return p.i - q.i; });
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=' + prof + '&follow=' + proc.id, { waitUntil: 'load', timeout: 90000 });
  await dismissMission(page);
  await page.waitForTimeout(400);
  var at = 0;
  for (var f = 0; f < ordered.length; f++) {
    var exf = ordered[f];
    var stf = proc.steps[exf.i];
    if (!stf || !stf.control || /^\(observe/.test(stf.control)) continue;
    while (at < exf.i) { await page.click('[data-fnav="next"]'); await page.waitForTimeout(200); at++; }
    var fv = exf.view === 'scram' ? 'primary' : exf.view;
    await selectView(page, fv);
    var instrCtrl = await page.evaluate(function () {
      var el = document.getElementById('instrCurrent');
      var m = el && el.innerHTML.match(/Control:\s*<b>([^<]+)<\/b>/);
      return m ? m[1] : null;
    });
    if (instrCtrl !== stf.control) {
      fails++;
      log.push('FAIL ' + prof + ' · ' + proc.id + ' follow step ' + (exf.i + 1) + ': Instructor "' + instrCtrl + '" expected "' + stf.control + '"');
    } else if (!(await checkControlOnBar(page, prof, exf.view, stf.control))) {
      fails++;
      log.push('FAIL ' + prof + ' · ' + proc.id + ' follow step ' + (exf.i + 1) + ': control not on bar');
    } else {
      log.push('OK   ' + prof + ' · ' + proc.id + ' follow step ' + (exf.i + 1) + ' Instructor + bar');
    }
  }

  return { log: log, fails: fails };
}

async function main() {
  fs.mkdirSync(SCRATCH, { recursive: true });
  var allLog = [];
  var totalFails = 0;
  var playwright = require('playwright');
  var srv = await startServer();
  var browser = await playwright.chromium.launch({ headless: true });
  var page = await browser.newPage({ viewport: { width: 1500, height: 950 } });

  try {
    Object.keys(RD.MANUAL_PROCEDURES).forEach(function () {}); /* load check */
    /* PWR ONLY since #514 (owner-ruled): the shell no longer loads the RBMK/BWR engines, so
     * an ?engine=rbmk_pre page cannot start a follow — the nav renders hidden and this gate
     * timed out clicking it. The rbmk/bwr rows in manual_ui_map.js are left in place: they
     * are data, and restoring the plants to the shell restores this loop by deleting the
     * filter (git log this file). Same decision as verify_e2e_ui's ENGINES list. */
    var profiles = Object.keys(RD.MANUAL_PROCEDURES).filter(function (p) { return p === 'pwr'; });
    for (var pi = 0; pi < profiles.length; pi++) {
      var prof = profiles[pi];
      var procs = RD.MANUAL_PROCEDURES[prof];
      for (var pj = 0; pj < procs.length; pj++) {
        var proc = procs[pj];
        if (proc.narrative || !map.STEP_UI[proc.id]) continue;
        var r = await verifyProcedure(page, prof, proc);
        allLog = allLog.concat(r.log);
        totalFails += r.fails;
      }
    }

    fs.writeFileSync(path.join(SCRATCH, 'manual-follow-ui.log'), allLog.join('\n') + '\n');
    if (totalFails) {
      console.error('Manual UI follow verification FAILED (' + totalFails + ' checks)');
      process.exit(1);
    }
    console.log('Manual UI follow verification: PASS (' + allLog.filter(function (l) { return l.indexOf('OK') === 0; }).length + ' checks)');
  } finally {
    await browser.close();
    srv.close();
  }
}

main().catch(function (e) {
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, 'manual-follow-ui.log'), String(e.stack || e));
  console.error('Manual UI follow verification FAILED:', e.message);
  process.exit(1);
});