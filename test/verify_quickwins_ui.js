/*
 * verify_quickwins_ui.js â€” the desktop UI quick wins (OWNER 2026-10-10: "make the UI more intuitive
 * and easier for people to understand and use"). One section per item, each in the real page.
 *
 *   QW1  Quiet board: with no alarm up the alarm panel is a one-line strip under a shorter chart and
 *        the board takes the height (scale 0.605 -> ~0.70 at 1366x768); the first alarm expands it at
 *        once; a dragged (pinned) strip is never collapsed. Layout only.
 *   QW2  Hover help at the cursor: resting on a described board item for ~0.4 s shows the Scanner's
 *        one-line brief beside the pointer (same text); a press or leaving dismisses it; never over
 *        the instructor callout card.
 *   QW3  The chart window fits the data: a fresh run opens on 1 min and widens with the time since
 *        the player's last command (never past the speed rule's rung); a clicked rung is authoritative.
 *   QW4  PAUSED veil: a plainly stopped clock (Escape out of the Quick tour, the player's pause) puts a
 *        big PAUSED over the board whose Resume button plays; none under a dialog, the tour, or a
 *        walkthrough hold; clicks pass through everywhere else.
 *   QW5  Board temperature units read `°F` (degree sign), as the chart and manual do. (The on/off selector
 *        vocabulary half of QW5 is NOT done -- see the commit message.)
 *   QW6  The number boxes' step arrows keep their look but get a 24 screen-px hit zone.
 *   QW7  The opener's Show me button acknowledges the press at once ("Doing it..."), step still runs.
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

  /* QW1b NOT UNDER THE POINTER (cycle layman pass S-2, 2026-10-15): the fold reflows and rescales the board
   * (MEASURED 27-45 px vertical, up to 87 px horizontal), so it waits while the pointer rests on the board and
   * lands when the pointer leaves -- through a real quiet -> alarm -> quiet cycle (PZR LEVEL stuck at 80 %, over
   * the 75 % High alarm, then cleared). */
  var u = await session({ width: 1366, height: 768 });
  if (await u.page.evaluate(function () { return document.getElementById('playBtn').classList.contains('paused'); })) await u.page.click('#playBtn');
  function target(page) {
    return page.evaluate(function () {
      var e = document.querySelector('.pwr-board-stage [data-item]'), r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    });
  }
  function quietNow(page) { return page.evaluate(function () { return document.querySelector('.app.pwr-synoptic').classList.contains('alarms-quiet'); }); }
  function tilesNow(page) { return page.evaluate(function () { return document.querySelectorAll('#alarmStack .alarm-tile').length; }); }
  function moved(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
  var u0 = await target(u.page), uq0 = await quietNow(u.page);
  await u.page.mouse.move(u0.cx, u0.cy);
  await u.page.evaluate(function () { RD.__dev.cmd({ action: 'set_instrument_failure', instrument_id: 'pzr_level', mode: 'stuck', value: 80 }); });
  await u.page.waitForFunction(function () { return document.querySelectorAll('#alarmStack .alarm-tile').length > 0; }, null, { timeout: 20000 }).catch(function () {});
  await u.page.waitForTimeout(1500);
  var u1 = await target(u.page), uq1 = await quietNow(u.page), ut1 = await tilesNow(u.page);
  ck('QW1b an alarm with the pointer resting on the board: the strip waits, the board does not move',
     uq0 && ut1 > 0 && uq1 && moved(u0, u1) < 1, 'quiet ' + uq0 + '->' + uq1 + ', tiles ' + ut1 + ', moved ' + moved(u0, u1).toFixed(1) + ' px');
  await u.page.mouse.move(3, 3);
  await u.page.waitForTimeout(500);
  var uq2 = await quietNow(u.page);
  ck('QW1b ...and expands once the pointer leaves the board', !uq2, 'quiet ' + uq2);
  var u2 = await target(u.page);
  await u.page.mouse.move(u2.cx, u2.cy);
  await u.page.evaluate(function () { RD.__dev.cmd({ action: 'clear_instrument_failure', instrument_id: 'pzr_level' }); });
  await u.page.waitForFunction(function () { return document.querySelectorAll('#alarmStack .alarm-tile').length === 0; }, null, { timeout: 30000 }).catch(function () {});
  await u.page.waitForTimeout(9500);   // past the 8 s quiet hold
  var u3 = await target(u.page), uq3 = await quietNow(u.page), ut3 = await tilesNow(u.page);
  ck('QW1b quiet again past the 8 s hold with the pointer on the board: no fold, no movement',
     ut3 === 0 && !uq3 && moved(u2, u3) < 1, 'tiles ' + ut3 + ', quiet ' + uq3 + ', moved ' + moved(u2, u3).toFixed(1) + ' px');
  await u.page.mouse.move(3, 3);
  await u.page.waitForTimeout(500);
  var uq4 = await quietNow(u.page);
  ck('QW1b ...and folds once the pointer leaves the board', uq4, 'quiet ' + uq4);
  await u.ctx.close();

  // ---- QW2 ---------------------------------------------------------------------------------
  var h = await session({ width: 1366, height: 768 }, '&callout=1');
  await h.page.click('#tabbar [data-tab="instructor"]').catch(function () {});
  await h.page.waitForTimeout(1500);   // let the board settle: a relayout under a measured point moves the target
  var pt = await h.page.evaluate(function () {
    var e = document.querySelector('.pwr-board-stage [data-item]'), r = e.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  });
  function tip(page) {
    return page.evaluate(function () {
      var t = document.getElementById('hoverTip');
      return { on: !!(t && t.classList.contains('on')), text: t ? t.textContent : '',
               scanner: document.getElementById('scanner').textContent,
               rect: t ? t.getBoundingClientRect().toJSON() : null };
    });
  }
  await h.page.mouse.move(pt[0], pt[1]);
  await h.page.waitForTimeout(200);
  var early = await tip(h.page);
  ck('QW2 no tooltip before the ~0.4 s dwell', !early.on, JSON.stringify({ on: early.on }));
  await h.page.waitForFunction(function () { var t = document.getElementById('hoverTip'); return t && t.classList.contains('on'); }, null, { timeout: 5000 }).catch(function () {});
  var late = await tip(h.page);
  ck('QW2 after the dwell the tooltip shows the Scanner brief, beside the cursor',
     late.on && late.rect && late.text.length > 10 && late.text === late.scanner && late.rect.left >= pt[0] && late.rect.top >= pt[1],
     late.text.slice(0, 50) + (late.rect ? ' @' + Math.round(late.rect.left) + ',' + Math.round(late.rect.top) : ' (no tip drawn)'));
  await shot(h.page, 'qw2_tip');
  await h.page.mouse.down(); await h.page.mouse.up();
  await h.page.waitForTimeout(150);
  ck('QW2 a press dismisses it', !(await tip(h.page)).on);
  await h.page.mouse.move(pt[0] + 1, pt[1] + 1);
  await h.page.waitForTimeout(700);
  await h.page.mouse.move(3, 3);
  await h.page.waitForTimeout(250);
  ck('QW2 moving onto nothing described dismisses it', !(await tip(h.page)).on);
  // The instructor callout card: start the opener and rest on the card's own hinted button.
  await h.page.waitForSelector('#instrCurrent [data-opener-start]', { timeout: 10000 });
  await h.page.click('#instrCurrent [data-opener-start]');
  await h.page.waitForFunction(function () { return RD.__dev.service().instructor.firedBeats.has('o0_hello'); }, null, { timeout: 30000 });
  await h.page.waitForSelector('#instrCallout [data-scanner-hint]', { state: 'visible', timeout: 15000 });
  var cb = await h.page.evaluate(function () {
    var e = document.querySelector('#instrCallout [data-scanner-hint]'), r = e.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  });
  await h.page.mouse.move(cb[0], cb[1]);
  await h.page.waitForTimeout(900);
  var onCard = await tip(h.page);
  ck('QW2 no tooltip over the instructor callout card (its button carries a hint)', !onCard.on, JSON.stringify({ on: onCard.on }));
  await h.page.mouse.move(pt[0], pt[1]);
  await h.page.waitForTimeout(900);
  ck('QW2 ...and it still shows on the board with the callout up', (await tip(h.page)).on);
  await h.ctx.close();

  // ---- QW3 ---------------------------------------------------------------------------------
  function axisFirst(page) {
    return page.evaluate(function () {
      var sp = document.querySelector('#chartXAxis span'); var t = sp ? sp.textContent : '';
      var m = t.match(/(\d+):(\d+):(\d+)/), n = t.match(/(\d+)s/);
      return { text: t, sec: m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : n ? +n[1] : null,
               auto: document.getElementById('graphWindow').classList.contains('win-auto') };
    });
  }
  var w = await session({ width: 1366, height: 768 });
  var a0 = await axisFirst(w.page);
  ck('QW3 a fresh run opens on a 1 min window (was the 5 min rung)', a0.sec === 60 && a0.auto, JSON.stringify(a0));
  await shot(w.page, 'qw3_fresh');
  await w.page.click('#speed button[data-speed="60"]');
  await w.page.waitForTimeout(4000);
  var a60 = await axisFirst(w.page);
  ck('QW3 at 60x the window follows the data, not the 1 h rung (60 s <= window < 3600 s)', a60.sec >= 60 && a60.sec < 3600, JSON.stringify(a60));
  await shot(w.page, 'qw3_60x');
  var rung = await w.page.evaluate(function () { var b = document.querySelectorAll('#graphWindow [data-win]'); return +b[b.length - 1].getAttribute('data-win'); });
  await w.page.click('#graphWindow [data-win="' + rung + '"]');
  await w.page.waitForTimeout(700);
  var aM = await axisFirst(w.page);
  ck('QW3 a clicked rung is authoritative (the widest rung shows exactly, auto off)', aM.sec === rung && !aM.auto, JSON.stringify(aM) + ' rung ' + rung);
  await w.ctx.close();

  // ---- QW4 ---------------------------------------------------------------------------------
  function veil(page) {
    return page.evaluate(function () {
      var v = document.getElementById('pausedVeil'), s = RD.__dev.service();
      return { on: !!(v && v.classList.contains('on')), running: !!s.running, t: s.simTime,
               playPaused: document.getElementById('playBtn').classList.contains('paused') };
    });
  }
  var v = await session({ width: 1366, height: 768 });
  var v0 = await veil(v.page);
  ck('QW4 a running plant has no veil', v0.running && !v0.on, JSON.stringify(v0));
  await v.page.click('[data-open-tour]');
  await v.page.waitForTimeout(500);
  var vt = await veil(v.page);
  ck('QW4 no veil under the tour itself', !vt.running && !vt.on, JSON.stringify(vt));
  await v.page.keyboard.press('Escape');
  await v.page.waitForTimeout(700);
  var ve = await veil(v.page);
  await v.page.waitForTimeout(600);
  var ve2 = await veil(v.page);
  ck('QW4 Escape out of the Quick tour: plant stays held AND the board says PAUSED', !ve.running && ve.on && ve2.t === ve.t, JSON.stringify({ on: ve.on, running: ve.running, dt: ve2.t - ve.t }));
  await shot(v.page, 'qw4_paused');
  var passes = await v.page.evaluate(function () {
    var e = document.elementFromPoint(60, 200);
    return e && !e.closest('#pausedVeil');
  });
  ck('QW4 the veil passes clicks through everywhere but its Resume button', passes === true);
  await v.page.click('#pausedVeilBtn');
  await v.page.waitForTimeout(500);
  var vr = await veil(v.page);
  ck('QW4 clicking the veil resumes (running, veil gone)', vr.running && !vr.on && !vr.playPaused, JSON.stringify(vr));
  await v.page.click('#playBtn');
  await v.page.waitForTimeout(300);
  var vp = await veil(v.page);
  ck('QW4 the player pausing with Play shows it too', !vp.running && vp.on, JSON.stringify(vp));
  await v.page.click('#playBtn');
  await v.page.waitForTimeout(300);
  await v.page.click('#settingsBtn');
  await v.page.waitForTimeout(500);
  var vm = await veil(v.page);
  ck('QW4 no veil under a dialog (Settings holds the clock itself)', !vm.running && !vm.on, JSON.stringify(vm));
  await v.ctx.close();

  // ---- QW5 ---------------------------------------------------------------------------------
  var d = await session({ width: 1366, height: 768 });
  var du = await d.page.evaluate(function () {
    var bare = [], deg = 0;
    [].forEach.call(document.querySelectorAll('.pwr-board-stage *'), function (e) {
      if (e.children.length) return;
      var t = e.textContent.trim();
      if (/^[FC](\/hr)?$/.test(t)) bare.push(t);
      if (/^\u00B0[FC](\/hr)?$/.test(t)) deg++;
    });
    return { bare: bare, deg: deg };
  });
  ck('QW5 every board temperature unit carries the degree sign (no bare F / C / F/hr)', du.bare.length === 0 && du.deg >= 8, JSON.stringify(du));
  await shot(d.page, 'qw5_units');
  await d.ctx.close();

  // ---- QW6 ---------------------------------------------------------------------------------
  var z = await session({ width: 1366, height: 768 });
  var zr = await z.page.evaluate(function () {
    var btns = [].slice.call(document.querySelectorAll('.pwr-board-stage .bd-num-steps button'));
    var bad = [], small = 0, shrunk = 0, stolen = 0, minZoneW = 1e9, minZoneH = 1e9, sc = parseFloat(getComputedStyle(document.querySelector('.pwr-board-stage')).transform.match(/matrix\(([^,]+)/)[1]);
    // A point another TILE's control is painted over is that control's (a neighbour wins where zones meet, and
    // two number boxes already overlap on the board); it counts as the arrow's only if it lands on nothing else.
    var curTile = null;
    function hit(x, y, b) {
      var e = document.elementFromPoint(x, y), t = e && e.closest('[data-item]');
      if (e && b && t && t !== curTile) return b;
      return e && e.closest('button');
    }
    btns.forEach(function (b) { curTile = b.closest('[data-item]');
      var r = b.getBoundingClientRect(); if (r.width < 2) return;
      if (Math.abs(r.height - 14 * sc) > 1.5) shrunk++;                       // visuals unchanged
      var up = b.parentNode.firstChild === b, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      // 24 screen px zone: probe the far end of it, 11 px beyond the visual edge, and 11 px to the right
      var yFar = up ? r.top - 10.5 : r.bottom + 10.5;
      if (hit(cx, yFar, b) !== b) bad.push('v'); if (hit(r.right + 5, cy, b) !== b) bad.push('h');
      if (hit(cx, cy, b) !== b) bad.push('c');
    });
    // negative control: no other board button's centre may be swallowed by a zone
    [].forEach.call(document.querySelectorAll('.pwr-board-stage button'), function (b) {
      if (b.closest('.bd-num-steps')) return;
      var r = b.getBoundingClientRect(); if (r.width < 2) return;
      var h = hit(r.left + r.width / 2, r.top + r.height / 2, null);
      if (h && h !== b && h.closest('.bd-num-steps')) stolen++;
    });
    return { n: btns.length, bad: bad.length, shrunk: shrunk, stolen: stolen, sc: sc };
  });
  ck('QW6 every step arrow has a >= 24 px hit zone (11 px past its edge and to the right hit it), centre intact',
     zr.n >= 4 && zr.bad === 0, JSON.stringify(zr));
  ck('QW6 the arrows themselves are drawn at their old size', zr.shrunk === 0, JSON.stringify(zr));
  ck('QW6 no other board button lost its centre to a zone', zr.stolen === 0, JSON.stringify(zr));
  await z.ctx.close();

  // ---- QW7 ---------------------------------------------------------------------------------
  var o = await session({ width: 1366, height: 768 });
  await o.page.click('#tabbar [data-tab="instructor"]').catch(function () {});
  await o.page.waitForSelector('#instrCurrent [data-opener-start]', { timeout: 10000 });
  await o.page.click('#instrCurrent [data-opener-start]');
  var gotShowMe = false;
  for (var k = 0; k < 120 && !gotShowMe; k++) {
    gotShowMe = await o.page.evaluate(function () {
      if (document.querySelector('#chatBtns [data-chatbtn="show_me"]')) return true;
      var ack = document.querySelector('#chatBtns [data-chatbtn="ack"]'); if (ack) ack.click();
      return false;
    });
    if (!gotShowMe) await o.page.waitForTimeout(500);
  }
  ck('QW7 the opener reaches a Show me ask', gotShowMe);
  var sm = await o.page.evaluate(function () {
    var b = document.querySelector('#chatBtns [data-chatbtn="show_me"]'); if (!b) return null;
    var before = b.textContent; b.click();
    return { before: before, now: b.textContent, disabled: b.disabled };   // read in the SAME task as the press
  });
  ck('QW7 pressing Show me answers in the same instant ("Doing it...", inert)', !!sm && /Doing it/.test(sm.now) && sm.disabled === true, JSON.stringify(sm));
  var fired1 = await o.page.waitForFunction(function () { return RD.__dev.service().instructor.firedBeats.has('o1_help'); }, null, { timeout: 20000 }).then(function () { return true; }).catch(function () { return false; });
  ck('QW7 ...and the step still runs (o1_help fires)', fired1);
  await o.ctx.close();

  await browser.close();
  console.log('\n' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
