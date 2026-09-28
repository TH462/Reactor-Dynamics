/*
 * verify_opener_ui.js — the full-power opener's OFFER, driven in the real control room (#811
 * follow-up). run_opener.js plays the opener through the service; these are the three things
 * only the page can get wrong:
 *
 *   1. THE OFFER NEVER COSTS A SESSION. One click resets the plant with no confirm, so it stands
 *      only on a fresh load: gone after the first plant command, gone after End, back on a new
 *      load. QA found it hours into free play, after End and after finishing.
 *   2. THE SCANNER forgets the offer once it is pressed (the hint described a button that is gone,
 *      and stayed until the next hover).
 *   3. TELEMETRY files one opener_beat row per beat reached — ids and an index, nothing else.
 *   4. THE TREND CHART is borrowed, never taken: a beat's `trend` replaces the traces (and glows
 *      the strip chart), stays up through the finish card, and the chart's DEFAULTS come back on
 *      End/Continue/Retry (owner, 2026-09-28).
 *   5. "Not now" hides the offer for the SESSION, not for good (OWNER RULING 2026-09-28).
 *
 * SHOT=<path> saves a screenshot of the chart during the trip beat (reached by a dev jump of the
 * instructor to o10_scram — the screenshot and the legend checks, not the route, are the point).
 *
 * Run: node test/verify_opener_ui.js
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
var OFFER = '#instrCurrent [data-opener-start]';

(async function () {
  var playwright = require('playwright');
  var browser = await playwright.chromium.launch({ headless: true });
  var ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  var page = await ctx.newPage();
  page.on('pageerror', function (e) { console.log('pageerror: ' + e.message); });

  async function boot() {
    await page.goto(SHELL);
    await page.waitForSelector('#mainMenuBtn');
    if (await page.isVisible('#missionOverlay')) await page.click('#missionClose');
    await page.click('#tabbar [data-tab="instructor"]').catch(function () {});
  }
  async function offerShown(ms) {
    return !!(await page.waitForSelector(OFFER, { state: 'visible', timeout: ms || 8000 }).catch(function () { return null; }));
  }
  async function offerGone(ms) {
    return !!(await page.waitForSelector(OFFER, { state: 'detached', timeout: ms || 8000 }).then(function () { return true; }).catch(function () { return false; }));
  }

  // ---------------------------------------------------------------- 1. the offer's gate
  await boot();
  ck('fresh load at full power: the offer is shown', await offerShown(), 'the opener starts from here');
  await page.evaluate(function () {
    var s = RD.__dev.service();
    s.handleCommand({ action: 'set_load_target', mwe: 95 });   // the player's first plant command
    s.handleCommand({ action: 'play' });                       // broadcasts, so the panel redraws
  });
  ck('after the first plant command: the offer is gone', await offerGone(), 'one click would reset their plant');
  await page.waitForTimeout(1500);
  ck('...and stays gone as the plant runs', !(await page.$(OFFER)), 'no re-render brings it back');

  await boot();
  ck('a new load: the offer is back', await offerShown(), 'fresh plant again');

  // ---------------------------------------------------------------- 2 + 3. start it
  await page.evaluate(function () {
    window.__ev = [];
    var T = RD.Telemetry, orig = T.event;
    T.event = function (n, p) { window.__ev.push([n, JSON.parse(JSON.stringify(p || {}))]); return orig.apply(this, arguments); };
  });
  var legend0 = (await page.textContent('#chartFloats')) || '';
  var offerHint = await page.getAttribute(OFFER, 'data-scanner-hint');
  await page.hover(OFFER);
  var hovered = await page.textContent('#scanner');
  ck('hovering the offer writes its hint to the Scanner (the fixture)', hovered.indexOf(offerHint.slice(0, 30)) !== -1, hovered.slice(0, 60));
  await page.click(OFFER);
  await page.waitForTimeout(600);
  var after = await page.textContent('#scanner');
  ck('after pressing it: the Scanner no longer describes the offer', after.indexOf(offerHint.slice(0, 30)) === -1, after.slice(0, 60));

  // o0_hello fires at 0.5 s and the pending beat moves to o1_load (index 1): two rows.
  await page.waitForFunction(function () {
    return (window.__ev || []).filter(function (e) { return e[0] === 'opener_beat'; }).length >= 2;
  }, null, { timeout: 15000 }).catch(function () {});
  var rows = await page.evaluate(function () { return window.__ev.filter(function (e) { return e[0] === 'opener_beat'; }); });
  ck('telemetry: opener_beat rows for beats 0 and 1', rows.map(function (r) { return r[1].beat; }).join(',') === '0,1',
     JSON.stringify(rows));
  ck('telemetry: ids and an index only', rows.length > 0 && rows.every(function (r) {
    return r[1].id === 'opener_pwr2_hfp' && Object.keys(r[1]).sort().join(',') === 'beat,id';
  }), rows.length ? Object.keys(rows[0][1]).join(',') : 'no rows');
  var accepted = await page.evaluate(function () {
    return RD.Telemetry.EVENTS && !!RD.Telemetry.EVENTS.opener_beat;
  });
  ck('telemetry: opener_beat is a declared event (not dropped by the schema)', accepted);

  // o1_load's trend: Tavg, Pressure, Steam Dump, Power in place of the player's own traces.
  await page.evaluate(function () { RD.__dev.service().handleCommand({ action: 'instructor_continue' }); });   // Ready
  await page.waitForFunction(function () { return RD.__dev.service().instructor.firedBeats.has('o1_load'); }, null, { timeout: 15000 }).catch(function () {});
  await page.waitForTimeout(800);
  var legend1 = (await page.textContent('#chartFloats')) || '';
  ck('trend: the o1_load beat put its traces on the chart', /Steam Dump/.test(legend1) && /Pressure/.test(legend1) && /Tavg/.test(legend1),
     legend0.replace(/\s+/g, ' ').slice(0, 50) + ' -> ' + legend1.replace(/\s+/g, ' ').slice(0, 60));
  ck('trend: ...and the strip chart glows (it is pointed at)', await page.evaluate(function () {
    return document.querySelector('.strip-chart').classList.contains('instr-glow'); }));

  /* SAVE / LOAD on the same beat, same page (#811 QA2): the load's afterPlantChange put the
   * default traces back AFTER the trend was applied, and the unchanged rev never re-applied it —
   * measured: the chart read Power / Tavg / Output MW under o1_load's line naming four others. */
  var saveFile = path.join(require('os').tmpdir(), 'rd_opener_mid_' + process.pid + '.json');
  require('fs').writeFileSync(saveFile, await page.evaluate(function () { return JSON.stringify(RD.__dev.service().saveState()); }));
  await page.setInputFiles('#loadFile', saveFile);
  await page.waitForTimeout(1500);
  require('fs').unlinkSync(saveFile);
  var legendL = (await page.textContent('#chartFloats')) || '';
  ck('trend: loading a save made on the same beat keeps the beat\'s traces', /Steam Dump/.test(legendL) && /Pressure/.test(legendL),
     legendL.replace(/\s+/g, ' ').slice(0, 60));

  // ---------------------------------------------------------------- End: no offer over it
  await page.waitForSelector('[data-opener-end]', { timeout: 8000 }).catch(function () {});
  await page.click('[data-opener-end]');
  await page.waitForTimeout(1500);
  ck('after End: the offer does not come back over the same plant', !(await page.$(OFFER)),
     'an opener ran on this load');
  var legend2 = (await page.textContent('#chartFloats')) || '';
  ck("trend: End hands the player's own chart back", /Output MW/.test(legend0) && /Output MW/.test(legend2) && !/Steam Dump|Pressure/.test(legend2),
     legend2.replace(/\s+/g, ' ').slice(0, 60));

  // ---------------------------------------------------------------- the trip beat's chart
  await boot();
  await page.click(OFFER);
  await page.waitForTimeout(800);
  await page.evaluate(function () {
    var s = RD.__dev.service(), I = s.instructor;
    I.branchWatch = null; I.currentBeatId = 'o10_scram'; I.lastBeatFireTime = s.simTime - 40;   // dev jump
  });
  await page.waitForFunction(function () { return RD.__dev.service().instructor.currentBeatId === 'o10_scram' && !!RD.__dev.service().instructor.branchWatch; }, null, { timeout: 15000 }).catch(function () {});
  await page.evaluate(function () { RD.__dev.service().handleCommand({ action: 'scram' }); });
  await page.waitForFunction(function () { var I = RD.__dev.service().instructor; return I.firedBeats.has('o11_trip'); }, null, { timeout: 40000 }).catch(function () {});
  await page.waitForTimeout(2500);
  var legend3 = (await page.textContent('#chartFloats')) || '';
  ck('trip beat: Decay Heat is on the trend chart, with Power and Tavg', /Decay Heat/.test(legend3) && /Tavg/.test(legend3) && /Power/.test(legend3),
     legend3.replace(/\s+/g, ' ').slice(0, 70));
  ck('trip beat: the strip chart glows', await page.evaluate(function () {
    return document.querySelector('.strip-chart').classList.contains('instr-glow'); }));
  if (process.env.SHOT) {
    var box = await page.evaluate(function () {
      var a = document.querySelector('.strip-chart').getBoundingClientRect();
      return { x: Math.max(0, a.left - 12), y: Math.max(0, a.top - 12), width: a.width + 24, height: a.height + 24 };
    });
    await page.screenshot({ path: process.env.SHOT, clip: box });
    console.log('screenshot: ' + process.env.SHOT);
  }

  // finish card (#811 follow-up): the trip beat's trend used to snap back to the defaults the
  // instant level_complete arrived, hiding the Decay Heat trace the card's own dialogue points at.
  // It now stays up while the card shows and only goes back to the plant's defaults on Continue.
  await page.waitForFunction(function () { return !!RD.__dev.service().instructor.level_complete; }, null, { timeout: 25000 }).catch(function () {});
  await page.waitForTimeout(300);
  var legendLc = (await page.textContent('#chartFloats')) || '';
  ck('finish card: the trip beat\'s Decay Heat trend is still on the chart', /Decay Heat/.test(legendLc),
     legendLc.replace(/\s+/g, ' ').slice(0, 70));
  await page.click('[data-lc="continue"]');
  await page.waitForTimeout(800);
  var legendAfterLc = (await page.textContent('#chartFloats')) || '';
  ck('finish card: Continue puts the plant\'s default chart back', /Output MW/.test(legendAfterLc) && !/Decay Heat/.test(legendAfterLc),
     legendAfterLc.replace(/\s+/g, ' ').slice(0, 70));

  // ---------------------------------------------------------------- 5. Not now = this session
  await boot();
  await page.click('#instrCurrent [data-opener-dismiss]');
  ck('Not now: the offer goes', await offerGone(4000));
  await boot();
  ck('Not now: it stays gone on a reload in the same session', !(await offerShown(3000)));
  var ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await ctx2.newPage();
  await boot();
  ck('Not now: a new session offers it again (not hidden for good)', await offerShown());

  await browser.close();
  console.log('\n' + (fail ? '\x1b[31mOPENER UI: FAIL' : '\x1b[32mOPENER UI: PASS') + '\x1b[0m   ' + pass + '/' + (pass + fail) + ' checks');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
