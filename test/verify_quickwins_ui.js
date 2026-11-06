/*
 * verify_quickwins_ui.js â€” the desktop UI quick wins (OWNER 2026-10-10: "make the UI more intuitive
 * and easier for people to understand and use"). One section per item, each in the real page.
 *
 *   QW1  Quiet board: with no alarm up the alarm panel folds to a one-line strip and the chart takes the
 *        row's width; the first alarm expands it at once. The board never moves or rescales across a
 *        quiet -> alarm -> quiet cycle (0.0 px at three viewports, layman S-1 2026-10-15). Layout only.
 *   QW2  (REMOVED 2026-11-03, #825) Hover help at the cursor blocked vital instruments; the bottom
 *        Scanner is the help channel. Pinned absent: no popup after a rest on a described item.
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
  /* THE BOARD NEVER MOVES (cycle layman pass S-1, 2026-10-15). The fold used to shrink the row and rescale the
   * board -- MEASURED 27 px at 1600x1000, up to 45 px vertical / 87 px horizontal at 1366x768 and 1920x1080 -- so
   * a click aimed a second earlier landed on a card header. Now the row keeps its height in both states and the
   * fold hands its room to the chart. A real quiet -> alarm -> quiet cycle at each viewport (PZR LEVEL stuck at
   * 80 %, over the 75 % High alarm, then cleared): the class must flip both ways (or the check is hollow), and
   * the plant area, the board stage and a board control must sit on the same pixels, 0.0 px, in all three. */
  function geom(page) {
    return page.evaluate(function () {
      function bb(el) { var r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }
      var st = document.querySelector('.pwr-board-stage'), m = getComputedStyle(st).transform;
      var ap = document.querySelector('.app.pwr-synoptic');
      return { plant: bb(document.querySelector('.plant-area')),
               stage: bb(st), item: bb(document.querySelector('.pwr-board-stage [data-item]')),
               scale: m && m !== 'none' ? parseFloat(m.match(/matrix\(([^,]+)/)[1]) : null,
               rowH: Math.round(document.querySelector('.bottom-row').getBoundingClientRect().height),
               chartW: Math.round(document.querySelector('.bottom-row > .strip-chart').getBoundingClientRect().width),
               quiet: ap.classList.contains('alarms-quiet'),
               tiles: document.querySelectorAll('#alarmStack .alarm-tile').length,
               lanes: document.querySelectorAll('#chartFloats .lane-chrome').length,
               panelH: document.querySelector('.alarm-panel').getBoundingClientRect().height };
    });
  }
  function drift(a, b) {
    var d = 0;
    ['plant', 'stage', 'item'].forEach(function (k) { for (var i = 0; i < 4; i++) d = Math.max(d, Math.abs(a[k][i] - b[k][i])); });
    return d;
  }
  var VPS = [{ width: 1366, height: 768 }, { width: 1600, height: 1000 }, { width: 1920, height: 1080 }];
  for (var vi = 0; vi < VPS.length; vi++) {
    var vp = VPS[vi], tag = vp.width + 'x' + vp.height;
    var s = await session(vp);
    if (await s.page.evaluate(function () { return document.getElementById('playBtn').classList.contains('paused'); })) await s.page.click('#playBtn');   // the sim opens RUNNING; only press Play if it is not
    var g0 = await geom(s.page);
    await s.page.evaluate(function () { RD.__dev.cmd({ action: 'set_instrument_failure', instrument_id: 'pzr_level', mode: 'stuck', value: 80 }); });
    await s.page.waitForFunction(function () { return document.querySelectorAll('#alarmStack .alarm-tile').length > 0; }, null, { timeout: 20000 }).catch(function () {});
    await s.page.waitForTimeout(600);
    var g1 = await geom(s.page);
    if (vi === 0) await shot(s.page, 'qw1_alarm');
    await s.page.evaluate(function () { RD.__dev.cmd({ action: 'clear_instrument_failure', instrument_id: 'pzr_level' }); });
    await s.page.waitForFunction(function () { return document.querySelectorAll('#alarmStack .alarm-tile').length === 0; }, null, { timeout: 30000 }).catch(function () {});
    await s.page.waitForTimeout(9500);   // past the 8 s quiet hold
    var g2 = await geom(s.page);
    if (vi === 0) await shot(s.page, 'qw1_quiet');
    ck('QW1 ' + tag + ' the strip folds, expands on an alarm, and folds again (class quiet->off->quiet, tiles shown)',
       g0.quiet && !g1.quiet && g1.tiles > 0 && g2.quiet && g2.tiles === 0, 'quiet ' + g0.quiet + '->' + g1.quiet + '->' + g2.quiet + ', tiles ' + g1.tiles);
    var dmax = Math.max(drift(g0, g1), drift(g1, g2), drift(g0, g2));
    ck('QW1 ' + tag + ' the plant area, board stage and a board control do not move or rescale across the cycle (0.0 px)',
       dmax === 0 && g0.scale === g1.scale && g1.scale === g2.scale, 'max drift ' + dmax.toFixed(1) + ' px, scale ' + g0.scale + '/' + g1.scale + '/' + g2.scale);
    ck('QW1 ' + tag + ' the fold gives its room to the chart (chart wider folded than expanded; row height unchanged)',
       g2.chartW > g1.chartW && g2.rowH === g1.rowH, 'chart ' + g1.chartW + ' -> ' + g2.chartW + ' px, row ' + g1.rowH + '/' + g2.rowH);
    ck('QW1 ' + tag + ' folded: the alarm panel is a one-line strip (<= 34 px) and the chart draws >= 3 trace lanes',
       g2.panelH <= 34 && g2.lanes >= 3, g2.panelH + ' px, lanes ' + g2.lanes);
    await s.ctx.close();
  }

  // ---- QW1b: THE SCANNER SITS UNDER THE DIAGRAM (owner, in-sim report 2026-11-05: "Move the scanner bar up to be
  // tween the diagram and the strip chart/alarms panel so it sits right under the diagram."). Geometry, not source:
  // its top is at or below the board area's bottom and its bottom at or above the bottom row's top; expanded, it
  // overlays the chart row downward and the board, plant area and a board control stay on the same pixels (it was
  // 288-362 px of board movement when the scanner was the plant area's last child).
  for (var si = 0; si < 2; si++) {
    var svp = VPS[si === 0 ? 1 : 0], stag = svp.width + 'x' + svp.height;
    var sq = await session(svp);
    var sg = function () {
      return sq.page.evaluate(function () {
        function bb(el) { var r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }
        var sc = document.getElementById('scannerPanel').getBoundingClientRect();
        var main = document.querySelector('.main-area').getBoundingClientRect();
        var row = document.querySelector('.bottom-row').getBoundingClientRect();
        var st = document.querySelector('.pwr-board-stage');
        return { scTop: sc.top, scBottom: sc.bottom, boardBottom: main.bottom, rowTop: row.top,
                 plant: bb(document.querySelector('.plant-area')), stage: bb(st), item: bb(document.querySelector('.pwr-board-stage [data-item]')),
                 scale: getComputedStyle(st).transform, exp: document.getElementById('scannerPanel').classList.contains('expanded') };
      });
    };
    var s0 = await sg();
    await shot(sq.page, 'qw1b_scanner_idle_' + stag);
    await sq.page.evaluate(function () { document.getElementById('scannerPanel').classList.add('expanded'); });
    await sq.page.waitForTimeout(500);
    var s1 = await sg();
    await shot(sq.page, 'qw1b_scanner_expanded_' + stag);
    var sd = drift({ plant: s0.plant, stage: s0.stage, item: s0.item }, { plant: s1.plant, stage: s1.stage, item: s1.item });
    ck('QW1b ' + stag + ' the Scanner sits between the diagram and the bottom row (top >= board bottom, bottom <= row top)',
       s0.scTop >= s0.boardBottom - 0.5 && s0.scBottom <= s0.rowTop + 0.5,
       'board bottom ' + s0.boardBottom.toFixed(1) + ', scanner ' + s0.scTop.toFixed(1) + '-' + s0.scBottom.toFixed(1) + ', row top ' + s0.rowTop.toFixed(1));
    ck('QW1b ' + stag + ' an expanded Scanner overlays the chart row and moves nothing above it (0.0 px, same scale)',
       s1.exp && s1.scBottom > s1.rowTop + 20 && sd === 0 && s0.scale === s1.scale,
       'scanner bottom ' + s1.scBottom.toFixed(1) + ' vs row top ' + s1.rowTop.toFixed(1) + ', drift ' + sd.toFixed(1));
    await sq.ctx.close();
  }

  var p = await session({ width: 1366, height: 768 });
  await p.page.evaluate(function () { document.querySelector('.app.pwr-synoptic').style.setProperty('--bottomrow-h', '260px'); });
  await p.page.waitForTimeout(600);
  var pin = await geom(p.page);
  ck('QW1 a dragged (pinned) strip height is honoured while folded', pin.quiet && pin.rowH === 260, JSON.stringify({ quiet: pin.quiet, rowH: pin.rowH }));
  await p.ctx.close();

  // ---- QW2 (REMOVED, owner 2026-11-03, #825: the at-cursor popup blocked vital instruments; the bottom
  // Scanner is the help channel). Now pinned ABSENT: resting on a described item draws no popup, the Scanner still fills.
  var h = await session({ width: 1366, height: 768 });
  await h.page.waitForTimeout(1500);
  var pt = await h.page.evaluate(function () {
    var e = document.querySelector('.pwr-board-stage [data-item]'), r = e.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  });
  await h.page.mouse.move(pt[0], pt[1]);
  await h.page.waitForTimeout(1200);
  var rest = await h.page.evaluate(function () {
    var t = document.getElementById('hoverTip');
    return { tip: !!t, any: !!document.querySelector('.hover-tip'), scanner: document.getElementById('scanner').textContent.length };
  });
  ck('QW2 no popup at the cursor after a 1.2 s rest on a described item; the Scanner still fills', !rest.tip && !rest.any && rest.scanner > 10, JSON.stringify(rest));
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

  // ---- QW8 (#825 rc9 playtest): PORV colour, RCP coast, finished walkthrough ------------------
  var q = await session({ width: 1600, height: 1000 });
  function porvTile(page) {
    return page.evaluate(function () {
      var e = document.querySelector('[data-item="ims2jf7fv7m"]'), t = e.textContent.trim();
      var best = null; e.querySelectorAll('*').forEach(function (x) { if (x.children.length === 0 && x.textContent.trim() === t) best = x; });
      return { text: t, color: getComputedStyle(best || e).color };
    });
  }
  await q.page.evaluate(function () { RD.__dev.cmd({ action: 'open_porv_manual' }); });
  await q.page.waitForTimeout(1500);
  var po = await porvTile(q.page);
  ck('QW8 PORV STATUS reads OPEN in the caution yellow', po.text === 'OPEN' && po.color === 'rgb(216, 166, 87)', JSON.stringify(po));
  await q.page.evaluate(function () { RD.__dev.cmd({ action: 'close_porv' }); });
  await q.page.waitForTimeout(1500);
  var pc = await porvTile(q.page);
  ck('QW8 ...and returns to the authored green once the valve recloses', pc.text === 'CLOSED' && pc.color === 'rgb(90, 173, 124)', JSON.stringify(pc));
  function spin(page) {
    return page.evaluate(function () {
      var v = document.querySelector('[data-item="imrobpq4a70"] [style*="rcpSpin"]');
      return { dur: v ? v.style.animationDuration : 'none', flow: document.querySelector('[data-item="imsgteavgid"]').textContent.trim() };
    });
  }
  await q.page.evaluate(function () { RD.__dev.cmd({ action: 'set_rcp', running: false }); });
  await q.page.evaluate(function () { RD.__dev.service().advanceCycles(300); });
  await q.page.waitForTimeout(400);
  var s20 = await spin(q.page);
  ck('QW8 a tripped RCP rotor is still turning while it coasts (flow still falling)', s20.dur !== 'none', JSON.stringify(s20));
  await q.page.evaluate(function () { RD.__dev.service().advanceCycles(9000); });
  await q.page.waitForTimeout(400);
  var s900 = await spin(q.page);
  ck('QW8 ...and has stopped long after, while natural-circulation flow is still on the readout', s900.dur === 'none' && parseInt(s900.flow, 10) >= 2, JSON.stringify(s900));
  await q.ctx.close();

  var cp = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  var cpg = await cp.newPage();
  await cpg.goto(BASE.replace('init=hot_full_power', 'init=cold_shutdown'));
  await cpg.waitForSelector('#mainMenuBtn');
  if (await cpg.isVisible('#missionOverlay')) await cpg.click('#missionClose');
  await cpg.waitForTimeout(1500);
  await cpg.evaluate(function () { RD.__dev.service().advanceCycles(600); });
  await cpg.waitForTimeout(400);
  var cold = await spin(cpg);
  ck('QW8 a stopped RCP in cold shutdown does not spin on natural-circulation flow', cold.dur === 'none' && parseInt(cold.flow, 10) >= 1, JSON.stringify(cold));
  await cp.close();


  // A finished walkthrough, started the way the UI starts it (a [data-ckl-start] press -- RD.__dev.cmd leaves #cklRun display:none, 0 px tall),
  // on three legs (the TMI-2 callout leg hides every .ckl-step by CSS) at two viewports. The kept step and its Rewind must be VISIBLE
  // inside the #cklLog viewport, not merely present in the HTML.
  async function finishLeg(vp, leg) {
    var w2 = await session(vp);
    await w2.page.evaluate(function (l) { var b = document.createElement('button'); b.setAttribute('data-ckl-start', l); document.body.appendChild(b); b.click(); }, leg);
    await w2.page.waitForTimeout(800);
    for (var kk = 0; kk < 60; kk++) {
      var cst = await w2.page.evaluate(function () { var c = RD.__dev.service().instructor.checklist; return c ? { c: c.complete, i: c.step_index } : null; });
      if (!cst || cst.c) break;
      await w2.page.evaluate(function (i) { RD.__dev.cmd({ action: 'checklist_check', index: i }); }, cst.i);
      await w2.page.waitForTimeout(250);
    }
    await w2.page.waitForTimeout(1500);
    var fin = await w2.page.evaluate(function () {
      var run = document.getElementById('cklRun'), log = document.getElementById('cklLog'), k = run.querySelector('.ckl-last-kept');
      var rw = k && k.parentElement.querySelector('[data-wt-rewind]') || run.querySelector('[data-wt-rewind]');
      var lr = log ? log.getBoundingClientRect() : null, kr = k ? k.getBoundingClientRect() : null, rr = rw ? rw.getBoundingClientRect() : null;
      var hd = run.querySelector('.ckl-complete-head'), hr = hd ? hd.getBoundingClientRect() : null;   // the completion line (#825 layman S-3)
      function inside(r) { return !!(r && lr && r.width > 0 && r.height > 0 && r.top >= lr.top - 1 && r.bottom <= lr.bottom + 1); }
      return { kept: !!k, banner: !!run.querySelector('.ckl-complete'), rewind: !!rw,
               headLine: hd ? hd.textContent : null, headLineInView: inside(hr),
               wait: !!(k && k.querySelector('.ckl-wait')),
               ticked: k ? k.querySelectorAll('.ckl-crit.ckl-crit-met').length : 0,
               unticked: k ? [].filter.call(k.querySelectorAll('.ckl-crit'), function (n) { return !n.classList.contains('ckl-crit-met'); }).length : -1,
               keptHeadInView: !!(kr && lr && kr.height > 0 && kr.top >= lr.top - 1 && kr.top < lr.bottom - 20),
               rewindInView: inside(rr), scrollTop: log ? Math.round(log.scrollTop) : null,
               logH: lr ? Math.round(lr.height) : null, keptH: kr ? Math.round(kr.height) : null, rewindBottomFromHead: (rr && kr) ? Math.round(rr.bottom - kr.top) : null, scrollH: log ? log.scrollHeight : null };
    });
    await shot(w2.page, 'qw8_finished_' + leg + '_' + vp.width);
    await w2.ctx.close();
    return fin;
  }
  var legs = ['pwr_lower_power', 'pwr_raise_power', 'pwr_startup', 'pwr_tmi2_incident'];   // + pwr_startup: the third leg of the #825 layman chain
  for (var vi2 = 0; vi2 < VPS.length - 1; vi2++) {   // 1366x768 and 1600x1000
    for (var li = 0; li < legs.length; li++) {
      var fin = await finishLeg(VPS[vi2], legs[li]), tag = legs[li] + ' @' + VPS[vi2].width;
      ck('QW8 ' + tag + ': finished card keeps the last step, the banner and Rewind', fin.kept && fin.banner && fin.rewind, JSON.stringify(fin));
      /* #825 layman pass S-3: MEASURED before the fix, the banner title fell outside the log on lower and raise power at 1366x768
       * (title top 516 / 472 px into a 467 px log) and sat on the floor at 1600x1000 on the layman's route. The completion line now sits
       * above the kept step and the kept step's Rewind row is pinned to the log floor, so all three are in view on every leg. */
      ck('QW8 ' + tag + ': the "Walkthrough complete" line, the kept step head and its Rewind are all inside the log viewport', fin.headLineInView && /Walkthrough complete/.test(fin.headLine || '') && fin.keptHeadInView && fin.rewindInView, JSON.stringify(fin));
      ck('QW8 ' + tag + ': every row drawn met, no wait advice', fin.unticked === 0 && !fin.wait, JSON.stringify(fin));
    }
  }

  // The completion scroll happens ONCE (#605: scroll on an event, never on a repaint). A reader who wheels down to the TMI-2 recap and
  // then presses a speed button (which changes the render key) must not be snapped back to the step head.
  var rs = await session({ width: 1366, height: 768 });
  await rs.page.evaluate(function (l) { var b = document.createElement('button'); b.setAttribute('data-ckl-start', l); document.body.appendChild(b); b.click(); }, 'pwr_tmi2_incident');
  await rs.page.waitForTimeout(800);
  for (var rk = 0; rk < 60; rk++) {
    var rst = await rs.page.evaluate(function () { var c = RD.__dev.service().instructor.checklist; return c ? { c: c.complete, i: c.step_index } : null; });
    if (!rst || rst.c) break;
    await rs.page.evaluate(function (i) { RD.__dev.cmd({ action: 'checklist_check', index: i }); }, rst.i);
    await rs.page.waitForTimeout(250);
  }
  await rs.page.waitForTimeout(1500);
  var lp = await rs.page.evaluate(function () { var l = document.getElementById('cklLog'), r = l.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, l.scrollTop]; });
  await rs.page.mouse.move(lp[0], lp[1]);
  await rs.page.mouse.wheel(0, 3000);
  await rs.page.waitForTimeout(500);
  var bot = await rs.page.evaluate(function () { return document.getElementById('cklLog').scrollTop; });
  await rs.page.mouse.move(5, 5);
  await rs.page.evaluate(function () { var b = document.querySelector('#speed [data-speed="5"]'); if (b) b.click(); });
  await rs.page.waitForTimeout(2500);
  var aft = await rs.page.evaluate(function () { return document.getElementById('cklLog').scrollTop; });
  ck('QW8 the completion scroll is once: a reader at the bottom of the finished TMI-2 log is not snapped back by a speed press', bot > lp[2] + 50 && Math.abs(aft - bot) <= 2, JSON.stringify({ atCompletion: Math.round(lp[2]), afterWheel: Math.round(bot), afterSpeedPress: Math.round(aft) }));
  await rs.ctx.close();

  /* ---- QW9 (#825 layman pass): the walkthrough's own speed on Shutdown Part 1, and what #warpInfo says about it -------------
   * The owner asked for steps 2-5 of this leg at 10x. MEASURED in this page: step 2 opens at 1x (`cklActionPending` holds real
   * time until the step's own LOAD cut lands, #796 "speed the wait, not the action") and goes to 10x on the first cut; the layman,
   * who pressed 10x before cutting, never saw it rise. The line used to read "nothing to do for a while" at that moment, while the
   * card still asked for four more cuts and the inserts (S-2). */
  var lp2 = await session({ width: 1600, height: 1000 });
  await lp2.page.evaluate(function (l) { var b = document.createElement('button'); b.setAttribute('data-ckl-start', l); document.body.appendChild(b); b.click(); }, 'pwr_lower_power');
  await lp2.page.waitForTimeout(800);
  function lpState() { return lp2.page.evaluate(function () { var s = RD.__dev.service(), w = document.getElementById('warpInfo');
    return { step: s.instructor.checklist.idx, speed: s.timeAcceleration, info: w && !w.hidden ? w.textContent : '' }; }); }
  await lp2.page.evaluate(function () { RD.__dev.cmd({ action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 719 }); });
  await lp2.page.waitForTimeout(2500);
  await lp2.page.evaluate(function () { var b = document.querySelector('.wt-continue.ready'); if (b) b.click(); });
  await lp2.page.waitForTimeout(2500);
  var lpIn = await lpState();
  await lp2.page.evaluate(function () { RD.__dev.cmd({ action: 'set_load_target', mwe: 95 }); });
  await lp2.page.waitForTimeout(2500);
  var lpCut = await lpState();
  ck('QW9 Shutdown Part 1 step 2 opens at 1x and the walkthrough sets 10x once the first LOAD cut lands', lpIn.step === 1 && lpIn.speed === 1 && lpCut.step === 1 && lpCut.speed === 10, JSON.stringify([lpIn, lpCut]));
  ck('QW9 ...and #warpInfo says the walkthrough set it, never "nothing to do" while the card still asks for cuts', /^The walkthrough set the speed to 10/.test(lpCut.info) && !/nothing to do/.test(lpCut.info), JSON.stringify(lpCut));
  /* critic L-1 (e4949322): the hand-back line, and the plain raise line on a step WITHOUT `pair` (the layman's S-2 form). The route
   * is the critic's probe: LOAD 75 in one command and 40 single INSERT taps finish step 2 in about 48 s of wall. */
  await lp2.page.evaluate(function () { RD.__dev.cmd({ action: 'set_load_target', mwe: 75 }); });
  for (var lpn = 0; lpn < 40; lpn++) {
    await lp2.page.evaluate(function () { RD.__dev.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -1, speed: 'med' }); });
    await lp2.page.waitForTimeout(150);
  }
  var lpDone = null;
  for (var lpt = 0; lpt < 150 && !lpDone; lpt++) {
    var lpx = await lpState();
    if (/Step done/.test(lpx.info)) { await lp2.page.waitForTimeout(1500); lpDone = await lpState(); }
    else await lp2.page.waitForTimeout(1000);
  }
  ck('QW9 when step 2\'s rows are met the walkthrough hands the clock back to 1x and #warpInfo says why', !!lpDone && lpDone.step === 1 && lpDone.speed === 1 && /^Step done/.test(lpDone.info), JSON.stringify(lpDone));
  await lp2.page.evaluate(function () { var b = document.querySelector('.wt-continue.ready'); if (b) b.click(); });
  await lp2.page.waitForTimeout(2000);
  await lp2.page.evaluate(function () { RD.__dev.cmd({ action: 'set_load_target', mwe: 70 }); });
  await lp2.page.waitForTimeout(2500);
  var lp3 = await lpState();
  ck('QW9 step 3 (no chart pair): the plain line "The walkthrough set the speed to 10x." after the first cut', lp3.step === 2 && lp3.speed === 10 && lp3.info === 'The walkthrough set the speed to 10\u00d7.', JSON.stringify(lp3));
  await lp2.ctx.close();

  /* critic L-4 (e4949322): a failed `outcome_guard` (#715) is said IN the completion line, amber, not below the fold. Lower power
   * finished on the full-power preset, then the turbine tripped: `turbine_tripped < 1` fails, `outcome_verified` goes false. */
  var og = await session({ width: 1366, height: 768 });
  await og.page.evaluate(function (l) { var b = document.createElement('button'); b.setAttribute('data-ckl-start', l); document.body.appendChild(b); b.click(); }, 'pwr_lower_power');
  await og.page.waitForTimeout(800);
  for (var ogk = 0; ogk < 20; ogk++) {
    var ogc = await og.page.evaluate(function () { var c = RD.__dev.service().instructor.checklist; return c ? { c: c.complete, i: c.step_index } : null; });
    if (!ogc || ogc.c) break;
    await og.page.evaluate(function (i) { RD.__dev.cmd({ action: 'checklist_check', index: i }); }, ogc.i);
    await og.page.waitForTimeout(250);
  }
  await og.page.waitForTimeout(1500);
  function ogHead() { return og.page.evaluate(function () { var h = document.querySelector('#cklRun .ckl-complete-head'), l = document.getElementById('cklLog');
    var r = h && h.getBoundingClientRect(), lr = l && l.getBoundingClientRect();
    return { text: h ? h.textContent : null, warn: !!(h && h.classList.contains('ckl-complete-warn')), inView: !!(r && lr && r.height > 0 && r.top >= lr.top - 1 && r.bottom <= lr.bottom + 1),
             recap: !!document.querySelector('#cklRun .ckl-complete') }; }); }
  var ogOk = await ogHead();
  await og.page.evaluate(function () { RD.__dev.cmd({ action: 'trip_turbine' }); });
  await og.page.waitForTimeout(2500);
  var ogBad = await ogHead();
  ck('QW10 a finished leg whose board matches its finish draws the green line and the recap', !ogOk.warn && /^\u2713 Walkthrough complete$/.test(ogOk.text || '') && ogOk.recap, JSON.stringify(ogOk));
  ck('QW10 ...and once the board stops matching (turbine tripped) the line turns amber, says so, and stays in view', ogBad.warn && /does not match/.test(ogBad.text || '') && ogBad.inView && !ogBad.recap, JSON.stringify(ogBad));
  await og.ctx.close();


  await browser.close();
  console.log('\n' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
