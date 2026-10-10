/*
 * verify_opener_callout.js — the INSTRUCTOR CALLOUT prototype on the full-power opener (#811,
 * OWNER 2026-10-10: the "anchored callout" — the instructor's current line in a bubble beside the
 * highlighted control, bottom-centre over the board when nothing is highlighted, the history
 * collapsed, the chat buttons in the bubble). Off by default: `?callout=1` or Settings.
 *
 * What only the page can get wrong, at 1366x768 and 1920x1080:
 *   1. DEFAULT UNCHANGED — no flag, no bubble; the chat transcript is where it was.
 *   2. PLACEMENT (iteration 2, owner: "it blocks part of the diagram") — on every beat the card is
 *      on-screen and covers NONE of the six top tiles, the highlighted control's panel, or any item
 *      the line points at; a leader line runs to the anchor. Hovering the card fades it to ~25 %.
 *   3. COMPACT — an ask shows its action sentence only (.ico-act), the rest behind "why?"; a watch
 *      line is an OBSERVATION callout of ONE sentence (data-kind="observe", no .ico-act).
 *   4. BUTTONS WORK FROM THE BUBBLE — Ready starts the load ask, Show me does the step (o1_help),
 *      the early trip's Restart lands a fresh opener on o0.
 *   5. THE SETTINGS TOGGLE turns it on with no reload.
 *
 * SHOTDIR=<dir> saves a screenshot of every beat visited, per resolution.
 * Run: node test/verify_opener_callout.js
 */
'use strict';
var path = require('path');
var ROOT = path.join(__dirname, '..');
var BASE = 'file:///' + path.join(ROOT, 'ui', 'shell.html').replace(/\\/g, '/') + '?engine=pwr2&init=hot_full_power&dev=1';
var SHOTDIR = process.env.SHOTDIR || null;

var pass = 0, fail = 0;
function ck(name, ok, detail) {
  ok ? pass++ : fail++;
  console.log((ok ? '\x1b[32mPASS' : '\x1b[31mFAIL') + '\x1b[0m  ' + name + (detail != null ? '\x1b[2m   (' + detail + ')\x1b[0m' : ''));
}
var OFFER = '#instrCurrent [data-opener-start]';
var BUB = '#instrCallout';

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
    await page.click('#tabbar [data-tab="instructor"]').catch(function () {});
    return { ctx: ctx, page: page };
  }
  function fired(page, id, ms) {
    return page.waitForFunction(function (i) { return RD.__dev.service().instructor.firedBeats.has(i); }, id, { timeout: ms || 20000 })
      .then(function () { return true; }).catch(function () { return false; });
  }
  async function startOpener(page) {
    await page.waitForSelector(OFFER, { state: 'visible', timeout: 10000 });
    await page.click(OFFER);
    return fired(page, 'o0_hello');
  }
  // Release the reading queue (the bubble's own "reveal all" when it shows), then let it settle.
  async function settle(page) {
    for (var i = 0; i < 4; i++) {
      await page.evaluate(function () { var r = document.querySelector('#instrCallout [data-chatrevealall]'); if (r) r.click(); });
      await page.waitForTimeout(350);
    }
    await page.waitForTimeout(500);
  }
  async function jump(page, id, back) {
    await page.evaluate(function (a) {
      var s = RD.__dev.service(), I = s.instructor;
      I.branchWatch = null; I.currentBeatId = a[0]; I.lastBeatFireTime = s.simTime - a[1]; I._readHoldS = 0;
    }, [id, back]);
    return fired(page, id);
  }
  // The bubble's geometry against the glowing control on the board.
  function geom(page) {
    return page.evaluate(function () {
      var b = document.querySelector('#instrCallout');
      if (!b || b.hidden) return { shown: false };
      var r = b.getBoundingClientRect(), g = null;
      [].some.call(document.querySelectorAll('#viewArea .instr-glow'), function (x) {
        var q = x.getBoundingClientRect(); if (q.width > 2 && q.height > 2) { g = q; return true; } return false; });
      // The control's PANEL: the smallest board tile wholly containing the glow (not most of the
      // board). The bubble must sit beside the panel, so the buttons the line names stay visible.
      var P = g;
      if (g) {
        var st = document.querySelector('#viewArea .pwr-board-stage'), S = st.getBoundingClientRect(), ba = Infinity;
        [].forEach.call(st.children, function (t) { var q = t.getBoundingClientRect(), a = q.width * q.height;
          if (a < S.width * S.height / 6 && a < ba && a > g.width * g.height * 1.05 && q.left <= g.left + 1 && q.top <= g.top + 1 && q.right >= g.right - 1 && q.bottom >= g.bottom - 1) { P = q; ba = a; } });
      }
      // The six TOP TILES, found by walking text nodes for the exact label (app.js finds them by
      // the smallest tile whose text contains it — a different route to the same tiles).
      var LABS = ['REACTOR POWER', 'AVG COOLANT TEMPERATURE', 'SUBCOOLING MARGIN', 'PRIMARY PRESSURE', 'PRESSURIZER LEVEL', 'STEAM GENERATOR LEVEL'];
      var stg = document.querySelector('#viewArea .pwr-board-stage'), tops = [];
      var tw = document.createTreeWalker(stg, NodeFilter.SHOW_TEXT), tn;
      while ((tn = tw.nextNode())) {
        if (LABS.indexOf(tn.nodeValue.trim().toUpperCase()) === -1) continue;
        var up = tn.parentNode; while (up && up.parentNode !== stg) up = up.parentNode;
        if (up) tops.push(up.getBoundingClientRect());
      }
      var pts = (RD.PwrBoard && RD.PwrBoard.pointTargets) ? RD.PwrBoard.pointTargets(
        [].concat.apply([], [].map.call(b.querySelectorAll('[data-point]'), function (x) { return x.getAttribute('data-point').split('|'); }))).map(function (t) { return t.getBoundingClientRect(); }) : [];
      var ld = document.querySelector('#instrCalloutLead'), dot = ld && !ld.hidden ? ld.querySelector('i').getBoundingClientRect() : null;
      function near(rr, x, y) { return x >= rr.left - 8 && x <= rr.right + 8 && y >= rr.top - 8 && y <= rr.bottom + 8; }
      var leadOk = dot ? [P].concat(pts).some(function (rr) { return rr && near(rr, (dot.left + dot.right) / 2, (dot.top + dot.bottom) / 2); }) : null;
      function ov(a, c) { var w = Math.min(a.right, c.right) - Math.max(a.left, c.left), h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top); return w > 0 && h > 0 ? w * h : 0; }
      function gap(a, c) { var dx = Math.max(0, c.left - a.right, a.left - c.right), dy = Math.max(0, c.top - a.bottom, a.top - c.bottom); return Math.max(dx, dy); }
      return { shown: true, side: b.getAttribute('data-side'), kind: b.getAttribute('data-kind'),
        onScreen: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        glow: !!g, overlap: g ? Math.round(ov(r, g) + ov(r, P)) : 0, gap: g ? Math.round(gap(r, P)) : null,
        tops: tops.length, topHit: Math.round(tops.reduce(function (acc, q) { return acc + ov(r, q); }, 0)),
        ptHit: Math.round(pts.reduce(function (acc, q) { return acc + ov(r, q); }, 0)),
        lead: leadOk, whyBtn: !!b.querySelector('[data-ico-why]'), compact: b.classList.contains('ico-compact'),
        act: (b.querySelector('.ico-act') || {}).textContent || '', why: (b.querySelector('.ico-why') || {}).textContent || '',
        say: (b.querySelector('.ico-say') || {}).textContent || '',
        btns: [].map.call(b.querySelectorAll('.ico-btns [data-chatbtn]'), function (x) { return x.getAttribute('data-chatbtn'); }),
        box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
    });
  }
  async function shot(page, tag, name) {
    if (!SHOTDIR) return;
    await page.screenshot({ path: path.join(SHOTDIR, tag + '_' + name + '.png') });
  }

  // ---------------------------------------------------------------- 1. default unchanged
  var d = await session({ width: 1366, height: 768 });
  await d.page.evaluate(function () { try { localStorage.removeItem('rd_instr_callout'); } catch (e) {} });
  await startOpener(d.page);
  await d.page.waitForTimeout(1500);
  var def = await d.page.evaluate(function () {
    var b = document.querySelector('#instrCallout');
    var log = document.querySelector('#chatLog');
    return { bubble: !!(b && !b.hidden), log: !!(log && log.offsetParent && log.querySelectorAll('.chat-line').length) };
  });
  ck('default (no flag): no bubble, and the chat transcript shows the lines', !def.bubble && def.log, JSON.stringify(def));
  // 5. the Settings toggle — on with no reload
  await d.page.click('#settingsBtn');
  await d.page.click('#calloutSeg [data-callout="on"]');
  await d.page.click('#settingsClose');
  var tog = await d.page.waitForSelector(BUB, { state: 'visible', timeout: 5000 }).then(function () { return true; }).catch(function () { return false; });
  var logHidden = await d.page.evaluate(function () { var l = document.querySelector('#chatLog'); return !l || !l.offsetParent; });
  ck('Settings > Instructor callout On: the bubble appears at once and the transcript collapses', tog && logHidden, 'bubble ' + tog + ', transcript hidden ' + logHidden);
  await d.page.evaluate(function () { try { localStorage.removeItem('rd_instr_callout'); } catch (e) {} });
  await d.ctx.close();

  // ---------------------------------------------------------------- 2-4 at both resolutions
  var ASKS = [['o4_rods', 41], ['o6_spray', 80], ['o8_auto', 20], ['o10_scram', 40]];
  var OBS = [['o2_watch', 2], ['o3_dump', 30], ['o7_spray_watch', 2], ['o12_settle', 5]];
  var VPS = [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }];
  for (var v = 0; v < VPS.length; v++) {
    var vp = VPS[v], tag = vp.width + 'x' + vp.height;
    var S = await session(vp, '&callout=1'), page = S.page;
    ck(tag + ': opener starts with the flag', await startOpener(page));
    await settle(page);
    var g0 = await geom(page);
    await shot(page, tag, 'o0_hello');
    ck(tag + ' o0: bubble shown, on-screen, an OBSERVATION (not an ask) with Ready in it', g0.shown && g0.onScreen && g0.kind === 'observe' && !g0.act && g0.btns.join() === 'ack', JSON.stringify(g0));
    await page.click(BUB + ' [data-chatbtn="ack"]').catch(function () {});
    ck(tag + ': Ready clicked in the bubble starts the load ask', await fired(page, 'o1_load', 40000));
    await settle(page);
    var g1 = await geom(page);
    await shot(page, tag, 'o1_load');
    ck(tag + ' o1_load: clear of all six top tiles and of the Turbine Load panel, on-screen, leader to the panel',
       g1.shown && g1.onScreen && g1.glow && g1.tops === 6 && g1.topHit === 0 && g1.overlap === 0 && (g1.lead === true || g1.gap <= 4), JSON.stringify(g1));
    ck(tag + ' o1_load: COMPACT — the action line only, the explanation behind "why?", Show me in the bubble',
       /^First move: set Turbine Load to 80 MW\.$/.test(g1.act.trim()) && g1.why === '' && g1.whyBtn && g1.btns.join() === 'show_me', JSON.stringify([g1.act, g1.why, g1.whyBtn, g1.btns]));
    await page.click(BUB + ' [data-ico-why]').catch(function () {});
    await page.waitForTimeout(500);
    var g1w = await geom(page);
    ck(tag + ' o1_load: "why?" opens the explanation, and the card is still clear of the top tiles and the panel',
       /less steam/.test(g1w.why) && g1w.topHit === 0 && g1w.overlap === 0, JSON.stringify([g1w.why, g1w.topHit, g1w.overlap]));
    await page.click(BUB + ' [data-ico-why]').catch(function () {});
    // HOVER FADE: over the card it fades so the board under it reads; over a button it stays solid.
    await page.hover(BUB + ' .ico-act').catch(function () {});
    await page.waitForTimeout(400);
    var opCard = await page.evaluate(function () { return +getComputedStyle(document.querySelector('#instrCallout')).opacity; });
    await page.hover(BUB + ' [data-chatbtn="show_me"]').catch(function () {});
    await page.waitForTimeout(400);
    var opBtn = await page.evaluate(function () { return +getComputedStyle(document.querySelector('#instrCallout')).opacity; });
    await page.mouse.move(2, 2);
    ck(tag + ' hover: the card fades to ~25 % over its text, stays solid over a button', opCard <= 0.3 && opBtn === 1, 'card ' + opCard + ', button ' + opBtn);
    if (v === 0) {
      await page.click(BUB + ' [data-chatbtn="show_me"]').catch(function () {});
      ck(tag + ': Show me clicked in the bubble does the step (o1_help fires)', await fired(page, 'o1_help', 30000));
    }
    for (var i = 0; i < ASKS.length; i++) {
      var ok = await jump(page, ASKS[i][0], ASKS[i][1]);
      await settle(page);
      var g = await geom(page);
      await shot(page, tag, ASKS[i][0]);
      ck(tag + ' ' + ASKS[i][0] + ': action callout clear of the six top tiles, its control panel and pointed items; leader to it; Show me in it',
         ok && g.shown && g.onScreen && g.glow && g.tops === 6 && g.topHit === 0 && g.overlap === 0 && g.ptHit === 0 && (g.lead === true || g.gap <= 4) &&
         g.kind === 'act' && g.act.length > 0 && g.why === '' && g.btns.indexOf('show_me') !== -1,
         JSON.stringify(g));
    }
    // observation lines (watch beats): lighter, no action, still anchored and on-screen
    for (var j = 0; j < OBS.length; j++) {
      var okj = await jump(page, OBS[j][0], OBS[j][1]);
      await settle(page);
      var go = await geom(page);
      await shot(page, tag, OBS[j][0]);
      ck(tag + ' ' + OBS[j][0] + ': observation callout — ONE sentence, no action line, clear of the top tiles, the panel and pointed items',
         okj && go.shown && go.onScreen && go.kind === 'observe' && !go.act && go.say && !/[.!?]\s+[A-Z]/.test(go.say.trim()) &&
         go.tops === 6 && go.topHit === 0 && go.overlap === 0 && go.ptHit === 0, JSON.stringify(go));
    }
    await S.ctx.close();
  }

  // ---------------------------------------------------------------- 4b. early trip -> Restart from the bubble
  var R = await session({ width: 1366, height: 768 }, '&callout=1'), rp = R.page;
  await startOpener(rp);
  await settle(rp);
  await rp.click(BUB + ' [data-chatbtn="ack"]').catch(function () {});
  await fired(rp, 'o1_load', 40000);
  await rp.evaluate(function () { RD.__dev.service().handleCommand({ action: 'scram' }); });
  var ox = await fired(rp, 'ox_trip_early');
  await settle(rp);
  var gx = await geom(rp);
  await shot(rp, '1366x768', 'ox_trip_early');
  ck('early trip: Restart and Carry on are in the bubble', ox && gx.btns.join() === 'restart,carry_on' && gx.onScreen, JSON.stringify(gx));
  await rp.click(BUB + ' [data-chatbtn="restart"]').catch(function () {});
  var rst = await rp.waitForFunction(function () {
    var I = RD.__dev.service().instructor;
    return I.mode === 'scenario' && I.firedBeats.has('o0_hello') && !I.firedBeats.has('ox_trip_early');
  }, null, { timeout: 15000 }).then(function () { return true; }).catch(function () { return false; });
  ck('Restart clicked in the bubble: a fresh opener on o0', rst);
  await R.ctx.close();

  await browser.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
