/* E2E UI verification: screenshots per plant×view, units toggle, ?follow= Instructor.
 * Run: node test/verify_e2e_ui.js
 * Evidence: GROK_GOAL_SCRATCH env or %TEMP%/grok-goal-e2e-ui */
'use strict';
var path = require('path');
var http = require('http');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');
var SCRATCH = process.env.GROK_GOAL_SCRATCH || path.join(require('os').tmpdir(), 'grok-goal-e2e-ui');
var PORT = 9750 + Math.floor(Math.random() * 50);

var ENGINES = ['pwr', 'rbmk_pre', 'rbmk_post', 'bwr'];
var VIEWS = ['diagram', 'primary', 'secondary', 'all'];

/* Recently-added controls that must render on the shipped UI (data-act wiring).
 * PWR has NO entries here on purpose: data-act buttons are emitted only by
 * populateControlBar() into #pdCtlRow (ui/app.js:374,379,384), and the PWR returns
 * before that path to mount the learning board instead (ui/app.js:3413, :3459-3460).
 * The PWR board is covered by REQUIRED_BOARD_LABELS below. */
var REQUIRED_ACTS = {
  'rbmk_pre-primary': ['rbmk-eccs-on'],
  'rbmk_pre-secondary': ['rbmk-turbine-set', 'dump-open'],
  'rbmk_post-primary': ['rbmk-eccs-on'],
  'bwr-secondary': ['dump-open', 'ic-on', 'stop-lpcs', 'slc-stop'],
};

/* Board-rendered plants (PWR) expose controls through the label vocabulary rather
 * than data-act, so probe the same path Instructor highlights use:
 * RD.PwrBoard.revealControl(label) -> the tile to glow, or null if unreachable.
 * The board is one stage with no view bar, so every view must render all of these. */
var REQUIRED_BOARD_LABELS = {
  pwr: [
    'Charging Pump (CVCS)', 'CVCS Inventory Control', 'Letdown Orifices (CVCS)', 'Boron',
    'Pressurizer Heaters (PZR)', 'Pressurizer Spray (PZR)', 'Pressure SP',
    'Relief Valve (PORV)', 'PORV Block Valve',
    'Reactor Coolant Pumps (RCP)', 'Residual Heat Removal (RHR)',
    'HPI', 'AFW', 'Feed Pumps', 'MSIV',
    'Steam Dump', 'Dump SP', 'Turbine Load',
    'Control Bank', 'Shutdown Bank', 'SCRAM',
  ],
};

var REQUIRED_LABELS = {
  'rbmk_pre-secondary': ['Electrical Output', 'Turbine RPM', 'Cond. Vacuum'],
  'rbmk_post-secondary': ['Electrical Output', 'Turbine RPM', 'Cond. Vacuum'],
  'bwr-secondary': ['Electrical Output', 'Turbine RPM', 'Cond. Vacuum'],
};

function mime(p) {
  if (p.endsWith('.html')) return 'text/html';
  if (p.endsWith('.js')) return 'application/javascript';
  if (p.endsWith('.css')) return 'text/css';
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
    srv.listen(PORT, '127.0.0.1', function () { resolve(srv); });
  });
}

async function screenshot(page, engine, view) {
  var url = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=' + engine + '&view=' + view;
  var errors = [];
  page.removeAllListeners('pageerror');
  page.on('pageerror', function (e) { errors.push(String(e)); });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(800);
  var file = path.join(SCRATCH, 'ui-' + engine + '-' + view + '.png');
  await page.screenshot({ path: file, fullPage: true });
  var key = engine + '-' + view;
  var controls = await page.evaluate(function (req) {
    var missing = [];
    (req.acts || []).forEach(function (a) {
      if (!document.querySelector('[data-act="' + a + '"]')) missing.push(a);
    });
    var labelMiss = [];
    (req.labels || []).forEach(function (l) {
      if (document.body.innerText.indexOf(l) < 0) labelMiss.push(l);
    });
    // Board plants: resolve each control label to a real tile via the reveal path.
    var board = globalThis.RD && globalThis.RD.PwrBoard;
    var boardMounted = !!(board && board.isMounted());
    var boardMiss = [];
    if (req.boardLabels && req.boardLabels.length) {
      if (!boardMounted) boardMiss = req.boardLabels.slice();
      else req.boardLabels.forEach(function (l) { if (!board.revealControl(l)) boardMiss.push(l); });
    }
    return {
      gauges: document.querySelectorAll('.gauge').length,
      ctlGroups: document.querySelectorAll('.cg').length,
      pdCtl: document.getElementById('pdCtlRow') ? document.getElementById('pdCtlRow').children.length : 0,
      boardTiles: document.querySelectorAll('.bd-tile').length,
      boardMounted: boardMounted,
      missingActs: missing,
      missingLabels: labelMiss,
      missingBoardLabels: boardMiss,
    };
  }, {
    acts: REQUIRED_ACTS[key] || [],
    labels: REQUIRED_LABELS[key] || [],
    boardLabels: REQUIRED_BOARD_LABELS[engine] || [],
  });
  if (errors.length) throw new Error(engine + '/' + view + ' page errors: ' + errors.join('; '));
  if (controls.gauges < 4) throw new Error(engine + '/' + view + ' gauges missing');
  if (controls.missingActs.length) throw new Error(engine + '/' + view + ' missing controls: ' + controls.missingActs.join(', '));
  if (controls.missingLabels.length) throw new Error(engine + '/' + view + ' missing BOP labels: ' + controls.missingLabels.join(', '));
  if (REQUIRED_BOARD_LABELS[engine] && !controls.boardMounted) throw new Error(engine + '/' + view + ' board did not mount');
  if (controls.missingBoardLabels.length) throw new Error(engine + '/' + view + ' board controls unreachable: ' + controls.missingBoardLabels.join(', '));
  return controls;
}

async function testUnitsAndInstructor(page) {
  var log = [];
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr&view=primary', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(500);

  var usUnit = await page.locator('#gauge-press [data-val]').textContent();
  log.push('US gauge pressure: ' + usUnit);
  if (!/psi/i.test(usUnit)) throw new Error('US units expected psi in gauge, got: ' + usUnit);

  // The PWR manual is now the packed Manuals/*.md set (RD.MANUAL_MD), so the nav ids
  // are document ids — 'setpoints' became '09_setpoints_limits'. The old structured
  // MANUAL_SECTIONS path (mSetpoints etc.) survives only for plants without an md set.
  await page.click('#manualBtn');
  await page.click('#manualNav [data-msec="09_setpoints_limits"]');
  await page.waitForTimeout(400);
  var usDoc = await page.locator('#manualContent .mdoc').first().textContent();
  log.push('US manual setpoints doc length: ' + usDoc.length);
  if (usDoc.length < 500) throw new Error('setpoints document did not render (len ' + usDoc.length + ')');

  // Toggle SI while manual overlay is open (DOM click — overlay blocks tab bar pointer events).
  await page.evaluate(function () {
    var b = document.querySelector('#unitsSeg button[data-units="SI"]');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  var siUnit = await page.locator('#gauge-press [data-val]').textContent();
  log.push('SI gauge pressure: ' + siUnit);
  if (!/MPa/i.test(siUnit)) throw new Error('SI units expected MPa, got: ' + siUnit);

  // The board/gauges honour the units toggle; the packed manual does NOT.
  // renderManualMd (ui/app.js) caches on `engineKey|docId` with no units key and
  // renders the markdown verbatim, which is authored in SI. So the manual reads
  // 1200 °C / 335 °C whichever way the toggle is set.
  //
  // STRICT XFAIL — tracked as issue #111 ("units in the manual need to change with
  // unit selection"). Asserted as a known gap so the gate can be honestly green while
  // the gap stays visible: if the manual ever DOES convert, this errors and tells you
  // to promote it to a real assertion. Do not delete without closing #111.
  var siDoc = await page.locator('#manualContent .mdoc').first().textContent();
  var manualConverts = usDoc !== siDoc;
  log.push('XFAIL #111 manual unit conversion: ' + (manualConverts ? 'CONVERTS' : 'static SI (expected gap)'));
  if (manualConverts) {
    throw new Error('XFAIL #111 unexpectedly passes: the manual now re-renders on the units ' +
      'toggle. Promote this to a real US-vs-SI assertion and close #111.');
  }
  if (!/1200\s*°C/.test(siDoc)) throw new Error('SI manual safety limit expected 1200 °C in the setpoints doc');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr&follow=pwr_loss_of_feedwater', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(function () {
    var el = document.getElementById('instrCurrent');
    if (!el || /Standing by/.test(el.textContent)) return false;
    var html = el.innerHTML;
    return html.indexOf('when') >= 0 || html.indexOf('not yet') >= 0 || html.indexOf('met') >= 0;
  }, { timeout: 15000 });
  var instr = await page.locator('#instrCurrent').textContent();
  log.push('Instructor follow text length: ' + instr.length);
  if (instr.length < 20) throw new Error('Instructor follow did not load procedure');

  var hasAcc = await page.evaluate(function () {
    var html = document.getElementById('instrCurrent').innerHTML;
    return html.indexOf('when') >= 0 || html.indexOf('not yet') >= 0 || html.indexOf('met') >= 0;
  });
  log.push('Instructor acceptance markup present: ' + hasAcc);
  if (!hasAcc) throw new Error('Instructor missing acceptance predicate markup');

  await page.click('#playBtn');
  await page.waitForTimeout(1500);
  var afterPlay = await page.locator('#instrCurrent').innerHTML();
  log.push('Instructor after play (chars): ' + afterPlay.length);

  return log.join('\n');
}

/* The three-element pair on the board: STEAM FLOW must sit beside SG FEED RATE, on the
 * SAME scale, reading TOTAL main-steam-line draw (issue #206).
 *
 * Why this is a gate and not just a screenshot: the obvious wiring for a "steam flow"
 * readout is the `steam_flow` instrument, which is governor/turbine flow ONLY. That reads
 * ~0 whenever the turbine is offline and the steam dump is carrying the plant — so the
 * board would show "no steam" while the SG boiled at 98 % dump, which is precisely the
 * blind spot that had the three-element feed channel commanding zero feed through a
 * turbine trip. The readout is worth nothing unless it survives THAT case, so the check
 * trips the turbine and asserts the number stays up. It also guards the pairing itself:
 * the indication is a driver EXTRA_ITEM, so a board re-export must not drop it. */
async function testSteamFeedPair(page) {
  var log = [];
  var read = async function (qs) {
    await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr&run=1' + qs,
      { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(1200);
    return page.evaluate(function () {
      var t = function (id) {
        var e = document.querySelector('[data-item="' + id + '"]');
        return e ? e.textContent.trim() : null;
      };
      return { steam: t('bdSteamFlow'), feed: t('imrsgkz4lq0'), gov: t('imrppej8ulo'), dump: t('imrppeg6g16') };
    });
  };
  var num = function (t) { return t == null ? null : Number(String(t).replace(/[^0-9.-]/g, '')); };

  var atPower = await read('&ff=30');
  log.push('at power: steam=' + atPower.steam + ' feed=' + atPower.feed + ' gov=' + atPower.gov);
  if (atPower.steam == null) throw new Error('STEAM FLOW readout (bdSteamFlow) is missing from the board');
  if (!/gpm/.test(atPower.steam) || !/gpm/.test(atPower.feed)) {
    throw new Error('STEAM FLOW and SG FEED RATE must share the gpm scale to be comparable, got ' +
      atPower.steam + ' vs ' + atPower.feed);
  }
  if (Math.abs(num(atPower.steam) - num(atPower.feed)) > 80) {
    throw new Error('at steady full power feed should match steam, got steam=' + atPower.steam + ' feed=' + atPower.feed);
  }

  var tripped = await read('&inject=turbine_trip&ff=120');
  log.push('turbine tripped: steam=' + tripped.steam + ' feed=' + tripped.feed +
           ' gov=' + tripped.gov + ' dump=' + tripped.dump);
  if (!(num(tripped.gov) < 20)) throw new Error('turbine_trip did not shut the governor (gov=' + tripped.gov + ')');
  // Decay-heat scale since #216: above P-9 a turbine trip now SCRAMS the reactor, so the
  // dump carries ~8 % (decay heat) rather than the ~98 % of the old ride-out. The check
  // is unchanged in purpose and if anything sharper — governor 0 % against STEAM FLOW
  // ~79 gpm is a cleaner demonstration that the readout is not governor-only.
  if (!(num(tripped.dump) > 3)) throw new Error('steam dump did not pick up decay heat (dump=' + tripped.dump + ')');
  if (!(num(tripped.steam) > 40)) {
    throw new Error('STEAM FLOW collapsed with the turbine (' + tripped.steam + ') — it is wired to the ' +
      'governor-only `steam_flow` instrument instead of `sg_steam_flow` (total SG draw). See #206.');
  }
  if (!(num(tripped.feed) > 30)) {
    throw new Error('feed stopped tracking the dump draw (' + tripped.feed + ') — the three-element ' +
      'channel is reading governor flow again. See #206.');
  }
  return log.join('\n');
}

async function main() {
  fs.mkdirSync(SCRATCH, { recursive: true });
  var fallback = path.join(SCRATCH, 'ui-screenshot-fallback.log');
  if (fs.existsSync(fallback)) fs.unlinkSync(fallback);

  var playwright = require('playwright');
  var srv = await startServer();
  var browser = await playwright.chromium.launch({ headless: true });
  var page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  var summary = [];

  try {
    for (var i = 0; i < ENGINES.length; i++) {
      for (var j = 0; j < VIEWS.length; j++) {
        var c = await screenshot(page, ENGINES[i], VIEWS[j]);
        var miss = (REQUIRED_ACTS[ENGINES[i] + '-' + VIEWS[j]] || []).length;
        summary.push(ENGINES[i] + '/' + VIEWS[j] + ': gauges=' + c.gauges + ' cg=' + c.ctlGroups + ' pdCtl=' + c.pdCtl +
          (miss ? ' acts=ok(' + miss + ')' : ''));
      }
    }
    var iuLog = await testUnitsAndInstructor(page);
    fs.writeFileSync(path.join(SCRATCH, 'instructor-units.log'), iuLog);
    var sfLog = await testSteamFeedPair(page);
    fs.writeFileSync(path.join(SCRATCH, 'steam-feed-pair.log'), sfLog);
    fs.writeFileSync(path.join(SCRATCH, 'ui-screenshot-summary.log'), summary.join('\n') + '\n');
    console.log('E2E UI verification: PASS (' + (ENGINES.length * VIEWS.length) + ' screenshots)');
  } finally {
    await browser.close();
    srv.close();
  }
}

main().catch(function (e) {
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, 'ui-screenshot-fallback.log'), String(e.stack || e));
  console.error('E2E UI verification FAILED:', e.message);
  process.exit(1);
});