/*
 * verify_quickwins_ui.js — the desktop UI quick wins (OWNER 2026-10-10: "make the UI more intuitive
 * and easier for people to understand and use"). One section per item, each in the real page.
 *
 *   QW1  Quiet board: with no alarm up the alarm panel is a one-line strip under a shorter chart and
 *        the board takes the height (scale 0.605 -> ~0.70 at 1366x768); the first alarm expands it at
 *        once; a dragged (pinned) strip is never collapsed. Layout only.
 *
 * SHOTDIR=<dir> saves a screenshot per section.
 * Run: node test/verify_quickwins_ui.js
 */
'use strict';
var path = require('path');
var ROOT = path.join(__dirname, '..');
var BASE = 'file:///' + path.join(ROOT, 'ui', 'shell.html').split('\\').join('/') + '?engine=pwr2&init=hot_full_power&dev=1';
var SHOTDIR = process.env.SHOTDIR || null;

var pass = 0, fail = 0;
function ck(name, ok, detail) {
  ok ? pass++ : fail++;
  console.log((ok ? '\x1b[32mPASS' : '\x1b[31mFAIL') + '\x1b[0m  ' + name + (detail != null ? '\x1b[2m   (' + detail + ')\x1b[0m' : ''));
}

(async function () {
  var playwright = require('playwright');
  var browser = await playwright.chromium.launch({ headless: true });

  async function session(vp, qs) {
    var ctx = await browser.newContext({ viewport: vp });
    var page = await ctx.newPage();
    page.on('pageerror', function (e) { console.log('pageerror: ' + e.message); });
    await page.goto(BASE + (qs || ''));
    await page.waitForSelector('#mainMenuBtn');
    if (await page.isVisible('#missionOverlay')) await page.click('#missionClose');
    await page.waitForTimeout(1200);
    return { ctx: ctx, page: page };
  }
  function shot(page, name) {
    return SHOTDIR ? page.screenshot({ path: path.join(SHOTDIR, name + '.png') }) : null;
  }
  function board(page) {
    return page.evaluate(function () {
      var st = document.querySelector('.pwr-board-stage');
      var m = getComputedStyle(st).transform;
      var br = document.querySelector('.bottom-row').getBoundingClientRect();
      var ap = document.querySelector('.app.pwr-synoptic');
      return { scale: m && m !== 'none' ? parseFloat(m.match(/matrix\(([^,]+)/)[1]) : null,
               rowH: Math.round(br.height), quiet: ap.classList.contains('alarms-quiet'),
               tiles: document.querySelectorAll('#alarmStack .alarm-tile').length,
               lanes: document.querySelectorAll('#chartFloats .lane-chrome').length };
    });
  }

  // ---- QW1 ---------------------------------------------------------------------------------
  var s = await session({ width: 1366, height: 768 });
  var q = await board(s.page);
  ck('QW1 no alarms: the strip collapses (class on, row <= 180 px)', q.quiet && q.rowH <= 180, JSON.stringify(q));
  ck('QW1 board scale grows past 0.66 (was 0.605)', q.scale >= 0.66, 'scale ' + q.scale);
  ck('QW1 the short chart still draws THREE trace lanes (36 px floor; fewer demote channels to numbers)', q.lanes === 3, 'lanes ' + q.lanes);
  var oneLine = await s.page.evaluate(function () {
    var a = document.querySelector('.alarm-panel').getBoundingClientRect();
    return a.height;
  });
  ck('QW1 the alarm panel is a one-line strip (<= 34 px)', oneLine <= 34, oneLine + ' px');
  await shot(s.page, 'qw1_quiet');
  if (await s.page.evaluate(function () { return document.getElementById('playBtn').classList.contains('paused'); })) await s.page.click('#playBtn');   // the sim opens RUNNING; only press Play if it is not
  await s.page.evaluate(function () { RD.__dev.cmd({ action: 'scram' }); });
  await s.page.waitForFunction(function () { return document.querySelectorAll('#alarmStack .alarm-tile').length > 0; }, null, { timeout: 15000 }).catch(function () {});
  await s.page.waitForTimeout(400);
  var e = await board(s.page);
  ck('QW1 first alarm expands it at once (class off, row >= 220 px, tiles shown)', !e.quiet && e.rowH >= 220 && e.tiles > 0, JSON.stringify(e));
  ck('QW1 expanded board scale is the old one (no stale collapse)', e.scale < q.scale, e.scale + ' < ' + q.scale);
  await shot(s.page, 'qw1_alarm');
  await s.ctx.close();

  var p = await session({ width: 1366, height: 768 });
  await p.page.evaluate(function () { document.querySelector('.app.pwr-synoptic').style.setProperty('--bottomrow-h', '230px'); });
  await p.page.waitForTimeout(600);
  var pin = await board(p.page);
  ck('QW1 a dragged (pinned) strip height is never collapsed', !pin.quiet && pin.rowH === 230, JSON.stringify(pin));
  await p.ctx.close();

  await browser.close();
  console.log('\n' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
