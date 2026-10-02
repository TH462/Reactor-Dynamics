/*
 * verify_coach_ui.js — the free-play debrief and the Inject Failure tab (#818), in the real
 * control room. run_coach.js proves what the instructor layer SAYS; these are the things only
 * the page can get wrong:
 *
 *   1. The Inject Failure tab: every row carries its one-line description, and the Inject
 *      button no longer wears the grey text that read as disabled.
 *   2. A failure that waits for a trigger shows "Armed — ..." under its row once injected, and
 *      the fired wording once it acts.
 *   3. One toast per event, pointing at the Instructor tab, raised only while another tab is
 *      showing; its button opens the tab.
 *   4. The Instructor tab draws the debrief (four parts, five readings) instead of the welcome.
 *   5. Retry rewinds to the moment before the injection; Dismiss returns the welcome.
 *
 * The plant is driven by ticking the service directly (`tick()` broadcasts, so the page renders
 * each one) — wall time is not plant time, and a timer-driven run would make this slow.
 * SHOT=<prefix> saves two screenshots (the failures tab, the debrief).
 * Run: node test/verify_coach_ui.js
 */
'use strict';
var path = require('path');
var ROOT = path.join(__dirname, '..');
var SHELL = 'file:///' + path.join(ROOT, 'ui', 'shell.html').replace(/\\/g, '/') +
  '?engine=pwr2&init=hot_full_power&dev=1';

var pass = 0, fail = 0;
function ck(name, ok, detail) {
  ok ? pass++ : fail++;
  console.log((ok ? '\x1b[32mPASS' : '\x1b[31mFAIL') + '\x1b[0m  ' + name + (detail != null ? '\x1b[2m   (' + detail + ')\x1b[0m' : ''));
}

(async function () {
  var playwright = require('playwright');
  var browser = await playwright.chromium.launch({ headless: true });
  var ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  var page = await ctx.newPage();
  var errs = [];
  page.on('pageerror', function (e) { errs.push(e.message); console.log('pageerror: ' + e.message); });

  await page.goto(SHELL);
  await page.waitForSelector('#mainMenuBtn');
  if (await page.isVisible('#missionOverlay')) await page.click('#missionClose');
  async function ticks(plantS) {
    await page.evaluate(function (dt) {
      var s = RD.__dev.service();
      s.stop(); s.running = true;   // the page's own timer is cleared (tick() needs running): only these ticks advance the plant
      s.timeAcceleration = 10;
      var end = s.simTime + dt;
      while (s.simTime < end) s.tick();
    }, plantS);
    await page.waitForTimeout(150);
  }
  async function tab(name) { await page.click('#tabbar [data-tab="' + name + '"]'); await page.waitForTimeout(100); }

  // ---------------------------------------------------------------- 1. the tab's rows
  await tab('failures');
  var rows = await page.evaluate(function () {
    var r = [].slice.call(document.querySelectorAll('#failList .fail-row'));
    var tg = document.querySelector('#failList .fail-row:not(.active) .fail-toggle');
    var cs = tg ? getComputedStyle(tg) : null, root = getComputedStyle(document.documentElement);
    return { n: r.length, withDesc: r.filter(function (x) { return x.querySelector('.fail-desc') && x.querySelector('.fail-desc').textContent.trim().length > 10; }).length,
             color: cs && cs.color, border: cs && cs.borderTopColor, disabled: tg ? tg.disabled : null,
             grey: (function () { var p = document.createElement('span'); p.style.color = 'var(--text-2)'; document.body.appendChild(p); var c = getComputedStyle(p).color; p.remove(); return c; })() };
  });
  ck('Inject Failure: every row has its one-line description', rows.n > 15 && rows.withDesc === rows.n, rows.withDesc + '/' + rows.n);
  ck('Inject Failure: the Inject button is not drawn in the dim grey that read as disabled',
     rows.disabled === false && rows.color !== rows.grey, 'color ' + rows.color + ', grey ' + rows.grey + ', border ' + rows.border);

  var note = await page.evaluate(function () {
    var n = document.getElementById('failConsoleNote'), r = n && n.getBoundingClientRect();
    return n ? { text: n.textContent, shown: !!(r && r.height > 0 && r.width > 0) } : null;
  });
  ck('Inject Failure: the pane says it is the instructor console view of the plant itself, not the board (Hard Rule 1, #818 review)',
     !!note && note.shown && /Instructor's console/.test(note.text) && /board shows only the indications/.test(note.text), note && note.text);

  // ---------------------------------------------------------------- 2. armed, then fired
  await page.click('#fail-stuck_porv_open .fail-toggle');
  await ticks(5);
  var arm = await page.evaluate(function () { var a = document.querySelector('#fail-stuck_porv_open .fail-arm'); return a ? { hidden: a.hidden, text: a.textContent, cls: a.className } : null; });
  ck('stuck PORV at full power: the row says it is armed and waiting', !!arm && !arm.hidden && /^Armed — sticks open the next time pressure lifts the valve\.$/.test(arm.text), arm && arm.text);
  await page.evaluate(function () { RD.__dev.service().handleCommand({ action: 'open_porv_manual' }); });
  await ticks(5);
  arm = await page.evaluate(function () { var a = document.querySelector('#fail-stuck_porv_open .fail-arm'); return a ? { hidden: a.hidden, text: a.textContent } : null; });
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '_failures.png' });
  ck('...and says it fired once the valve lifts', !!arm && !arm.hidden && /^Fired — /.test(arm.text), arm && arm.text);
  await page.click('#fail-stuck_porv_open .fail-toggle');   // Clear
  await page.evaluate(function () { RD.__dev.service().handleCommand({ action: 'close_porv' }); });
  await ticks(2);
  arm = await page.evaluate(function () { var a = document.querySelector('#fail-stuck_porv_open .fail-arm'); return a ? a.hidden : null; });
  ck('cleared: the armed line goes away', arm === true);

  // A fresh plant for the debrief: reload, so the PORV event above is not the one explained.
  await page.goto(SHELL);
  await page.waitForSelector('#mainMenuBtn');
  if (await page.isVisible('#missionOverlay')) await page.click('#missionClose');

  // ---------------------------------------------------------------- 3. the toast
  await tab('failures');
  var idle0 = await page.evaluate(function () { return !!document.querySelector('#instrCurrent .instr-idle'); });
  await page.click('#fail-loss_of_feedwater .fail-toggle');
  await ticks(30);
  var toast = await page.evaluate(function () { var t = document.getElementById('coachToast'); return t ? { show: t.classList.contains('show'), text: t.textContent } : null; });
  ck('another tab showing: ONE toast points at the Instructor tab', !!toast && toast.show && /Loss of Main Feedwater/.test(toast.text) && /Instructor tab/.test(toast.text), toast && toast.text);
  await page.click('#coachToast .coach-toast-open');
  await page.waitForTimeout(150);
  var onInstr = await page.evaluate(function () { var p = document.querySelector('.tabpane[data-pane="instructor"]'); return !!(p && p.classList.contains('on')); });
  var toastGone = await page.evaluate(function () { var t = document.getElementById('coachToast'); return !t || !t.classList.contains('show'); });
  ck('the toast\'s button opens the Instructor tab and the toast goes', onInstr && toastGone);
  await ticks(2);
  toast = await page.evaluate(function () { var t = document.getElementById('coachToast'); return t && t.classList.contains('show'); });
  ck('no second toast for the same event', !toast);

  // ---------------------------------------------------------------- 4. the debrief
  var deb = await page.evaluate(function () {
    var c = document.querySelector('#instrCurrent .coach');
    return c ? { lines: c.querySelectorAll('.coach-line').length, watch: c.querySelectorAll('.coach-watch li').length,
                 text: c.textContent.replace(/\s+/g, ' '), retry: !!c.querySelector('[data-coach-retry]:not([disabled])'),
                 folded: document.querySelectorAll('#instrLog .instr-msg').length } : null;
  });
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '_debrief.png' });
  ck('free play was idle before the event (the welcome text)', idle0);
  ck('the Instructor tab draws the debrief: four parts, five readings', !!deb && deb.lines === 4 && deb.watch === 5, deb && (deb.lines + ' parts, ' + deb.watch + ' readings'));
  ck('the debrief names the trip, the automatic actions and a live reading',
     !!deb && /reactor tripped/.test(deb.text) && /auxiliary feedwater pumps started/.test(deb.text) && /\d psi \(/.test(deb.text) && !/psia/.test(deb.text), deb && deb.text.slice(0, 220));
  ck('Retry is offered (a checkpoint exists before the injection)', !!deb && deb.retry);
  ck('the welcome it replaced is not folded into the message log above it', !!deb && deb.folded === 0, deb && deb.folded + ' folded messages');

  // ---------------------------------------------------------------- 5. Retry, then Dismiss
  var tInj = await page.evaluate(function () { var s = RD.__dev.service(); return s.instructor._coach ? s.instructor._coach.before_t : null; });
  await page.click('#instrCurrent [data-coach-retry]');
  await ticks(1);
  var after = await page.evaluate(function () { var s = RD.__dev.service(); return { af: s.layer.getActiveFailures().length, t: s.simTime, coach: !!document.querySelector('#instrCurrent .coach'), idle: !!document.querySelector('#instrCurrent .instr-idle') }; });
  ck('Retry: back to just before the injection — failure gone, welcome back', after.af === 0 && !after.coach && after.idle && after.t < tInj + 3,
     'failures ' + after.af + ', t ' + after.t.toFixed(1) + ' vs injection ' + tInj);
  await page.evaluate(function () { RD.__dev.service().handleCommand({ action: 'scram' }); });
  await ticks(20);
  var tripDeb = await page.evaluate(function () { var c = document.querySelector('#instrCurrent .coach'); return c ? c.textContent : null; });
  ck('a manual trip brings a new debrief', !!tripDeb && /manual trip button/.test(tripDeb), tripDeb && tripDeb.slice(0, 120));
  await page.click('#instrCurrent [data-coach-dismiss]');
  await ticks(2);
  var dis = await page.evaluate(function () { return { coach: !!document.querySelector('#instrCurrent .coach'), idle: !!document.querySelector('#instrCurrent .instr-idle') }; });
  ck('Dismiss: the welcome comes back and the debrief stays away for this event', !dis.coach && dis.idle);
  ck('no page errors', errs.length === 0, errs.join(' | '));

  await browser.close();
  console.log('\n' + (fail ? '\x1b[31mCOACH UI: FAIL' : '\x1b[32mCOACH UI: PASS') + '\x1b[0m   ' + pass + '/' + (pass + fail) + ' checks');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
