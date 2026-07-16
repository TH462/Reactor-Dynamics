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

/* Recently-added controls that must render on the shipped UI (data-act wiring). */
var REQUIRED_ACTS = {
  'pwr-primary': ['charge-pump-on', 'charge-pump-off', 'borate', 'heat-set', 'spray-set', 'porv-open', 'porv-block-close', 'rhr-auto', 'rhr-on', 'cvcs-auto'],
  'pwr-secondary': ['dump-open', 'dump-auto'],
  'rbmk_pre-primary': ['rbmk-eccs-on'],
  'rbmk_pre-secondary': ['rbmk-turbine-set', 'dump-open'],
  'rbmk_post-primary': ['rbmk-eccs-on'],
  'bwr-secondary': ['dump-open', 'ic-on', 'stop-lpcs', 'slc-stop'],
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
    return {
      gauges: document.querySelectorAll('.gauge').length,
      ctlGroups: document.querySelectorAll('.cg').length,
      pdCtl: document.getElementById('pdCtlRow') ? document.getElementById('pdCtlRow').children.length : 0,
      missingActs: missing,
      missingLabels: labelMiss,
    };
  }, { acts: REQUIRED_ACTS[key] || [], labels: REQUIRED_LABELS[key] || [] });
  if (errors.length) throw new Error(engine + '/' + view + ' page errors: ' + errors.join('; '));
  if (controls.gauges < 4) throw new Error(engine + '/' + view + ' gauges missing');
  if (controls.missingActs.length) throw new Error(engine + '/' + view + ' missing controls: ' + controls.missingActs.join(', '));
  if (controls.missingLabels.length) throw new Error(engine + '/' + view + ' missing BOP labels: ' + controls.missingLabels.join(', '));
  return controls;
}

function manualSetpointCell(page, instrument) {
  return page.evaluate(function (inst) {
    var rows = document.querySelectorAll('#manualContent tr');
    for (var i = 0; i < rows.length; i++) {
      var cells = rows[i].querySelectorAll('td.mono');
      if (cells.length >= 2 && cells[0].textContent.trim() === inst) return cells[1].textContent.trim();
    }
    return null;
  }, instrument);
}

async function testUnitsAndInstructor(page) {
  var log = [];
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr&view=primary', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(500);

  var usUnit = await page.locator('#gauge-press [data-val]').textContent();
  log.push('US gauge pressure: ' + usUnit);
  if (!/psi/i.test(usUnit)) throw new Error('US units expected psi in gauge, got: ' + usUnit);

  await page.click('#manualBtn');
  await page.click('#manualNav [data-msec="setpoints"]');
  await page.waitForTimeout(400);
  var usTrip = await manualSetpointCell(page, 'tavg');
  log.push('US manual tavg trip: ' + usTrip);
  if (!usTrip || !/°F/.test(usTrip)) throw new Error('US manual trip setpoint expected °F, got: ' + usTrip);
  var usLimit = await page.locator('#manualContent tr:has-text("Fuel cladding damage") td.mono').first().textContent();
  usLimit = (usLimit || '').trim();
  log.push('US manual fuel limit: ' + usLimit);
  if (!/°F/.test(usLimit) || !/2192/.test(usLimit)) throw new Error('US manual safety limit expected ~2192 °F, got: ' + usLimit);

  // Toggle SI while manual overlay is open (DOM click — overlay blocks tab bar pointer events).
  await page.evaluate(function () {
    var b = document.querySelector('#unitsSeg button[data-units="SI"]');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  var siUnit = await page.locator('#gauge-press [data-val]').textContent();
  log.push('SI gauge pressure: ' + siUnit);
  if (!/MPa/i.test(siUnit)) throw new Error('SI units expected MPa, got: ' + siUnit);

  var siTrip = await manualSetpointCell(page, 'tavg');
  log.push('SI manual tavg trip: ' + siTrip);
  if (!siTrip || !/°C/.test(siTrip) || !/335/.test(siTrip)) throw new Error('SI manual trip expected 335 °C, got: ' + siTrip);
  var siLimit = await page.locator('#manualContent tr:has-text("Fuel cladding damage") td.mono').first().textContent();
  siLimit = (siLimit || '').trim();
  log.push('SI manual fuel limit: ' + siLimit);
  if (!/°C/.test(siLimit) || !/1200/.test(siLimit)) throw new Error('SI manual safety limit expected 1200 °C, got: ' + siLimit);

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