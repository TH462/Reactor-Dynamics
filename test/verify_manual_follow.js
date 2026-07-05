/* UI playthrough: manual procedure pills + Instructor follow vs rendered Plant Display control bar.
 * Run: node test/verify_manual_follow.js */
'use strict';
var path = require('path');
var http = require('http');
var fs = require('fs');
var map = require('./manual_ui_map.js');

var ROOT = path.join(__dirname, '..');
var SCRATCH = process.env.GROK_GOAL_SCRATCH || path.join(require('os').tmpdir(), 'grok-goal-0a451deb05ff', 'implementer');
var PORT = 9760 + Math.floor(Math.random() * 40);

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
    srv.listen(PORT, '127.0.0.1', function () { resolve(srv); });
  });
}

function cgLabels(page) {
  return page.evaluate(function () {
    return Array.prototype.map.call(document.querySelectorAll('#pdCtlRow .cg-l'), function (el) { return el.textContent.trim(); });
  });
}

async function checkControlOnBar(page, prof, view, control) {
  if (view === 'scram') {
    var txt = await page.locator('#pdScram').textContent();
    return txt.trim() === map.VIEW_CONTROLS[prof].scram;
  }
  var labels = await cgLabels(page);
  return labels.indexOf(control) >= 0;
}

async function verifyProcedure(page, prof, proc) {
  var expects = map.STEP_UI[proc.id];
  if (!expects) return [];
  var log = [];
  var fails = 0;

  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=' + prof, { waitUntil: 'networkidle', timeout: 90000 });
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

  for (var b = 0; b < expects.length; b++) {
    var exb = expects[b];
    var stb = proc.steps[exb.i];
    if (!stb || !stb.control) continue;
    var vb = exb.view === 'scram' ? 'primary' : exb.view;
    await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=' + prof + '&view=' + vb, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(500);
    if (!(await checkControlOnBar(page, prof, exb.view, stb.control))) {
      fails++;
      log.push('FAIL ' + prof + ' · ' + proc.id + ' step ' + (exb.i + 1) + ': "' + stb.control + '" not on ' + exb.view + ' bar');
    } else {
      log.push('OK   ' + prof + ' · ' + proc.id + ' step ' + (exb.i + 1) + ': ' + exb.view + ' bar "' + stb.control + '"');
    }
  }

  for (var f = 0; f < expects.length; f++) {
    var exf = expects[f];
    var stf = proc.steps[exf.i];
    if (!stf || !stf.control || /^\(observe/.test(stf.control)) continue;
    await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=' + prof + '&follow=' + proc.id, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(400);
    for (var n = 0; n < exf.i; n++) { await page.click('[data-fnav="next"]'); await page.waitForTimeout(200); }
    var fv = exf.view === 'scram' ? 'primary' : exf.view;
    await page.evaluate(function (v) {
      var tabs = document.querySelectorAll('#viewTabs [data-view]');
      for (var i = 0; i < tabs.length; i++) { if (tabs[i].getAttribute('data-view') === v) tabs[i].click(); }
    }, fv);
    await page.waitForTimeout(400);
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
    var profiles = Object.keys(RD.MANUAL_PROCEDURES);
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