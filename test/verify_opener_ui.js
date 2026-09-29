/*
 * verify_opener_ui.js — the full-power opener's OFFER, driven in the real control room (#811
 * follow-up). run_opener.js plays the opener through the service; these are the three things
 * only the page can get wrong:
 *
 *   1. THE OFFER STANDS WHENEVER THE TAB IS IDLE, AND NEVER COSTS A SESSION (OWNER 2026-09-28:
 *      "keep the button for the full power opener on the instructor tab unless it's showing other
 *      content"). On a fresh load one click starts it; after a plant command or after End it asks
 *      first ("This restarts the plant at full power. Your current plant will be lost."), and
 *      Cancel leaves the plant exactly as it was.
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
  ck('scope: free play never scopes or points at the board', await page.evaluate(function () {
    return !document.querySelector('.bd-focus-ol') && !document.querySelector('.pwr-board-stage.bd-dimming'); }));
  await page.evaluate(function () {
    var s = RD.__dev.service();
    s.handleCommand({ action: 'set_load_target', mwe: 95 });   // the player's first plant command
    s.handleCommand({ action: 'play' });                       // broadcasts, so the panel redraws
  });
  await page.waitForTimeout(1500);
  ck('after the first plant command: the offer stays', await offerShown(4000), 'the tab is idle');
  var CONF = '#instrCurrent [data-opener-confirm]';
  var t0c = await page.evaluate(function () { return RD.__dev.service().simTime; });
  await page.click(OFFER);
  var confTxt = await page.waitForSelector(CONF, { state: 'visible', timeout: 4000 }).then(function () {
    return page.textContent('#instrCurrent .instr-opener-confirm'); }).catch(function () { return null; });
  ck('not fresh: Start asks first, with the one-line warning', !!confTxt && /restarts the plant at full power\. Your current plant will be lost\./.test(confTxt),
     confTxt ? confTxt.replace(/\s+/g, ' ').trim() : 'no confirm');
  ck('...and has not started anything yet', await page.evaluate(function () { return RD.__dev.service().instructor.mode !== 'scenario'; }));
  await page.click('#instrCurrent [data-opener-cancel]');
  await page.waitForTimeout(1200);
  var kept = await page.evaluate(function (t0) { var s = RD.__dev.service();
    return { mode: s.instructor.mode, t: s.simTime, t0: t0, fresh: s.isFreshPlant(), load: s.controlState ? null : null }; }, t0c);
  ck('Cancel: the plant is untouched (no opener, clock kept running, still not fresh)', kept.mode !== 'scenario' && kept.t >= kept.t0 && kept.fresh === false,
     'mode ' + kept.mode + ', sim ' + kept.t0.toFixed(1) + ' -> ' + kept.t.toFixed(1) + ' s');
  ck('Cancel: the offer is back, the confirm gone', (await offerShown(3000)) && !(await page.$(CONF)));
  await page.click(OFFER);
  await page.waitForSelector(CONF, { state: 'visible', timeout: 4000 }).catch(function () {});
  await page.click(CONF);
  var startedC = await page.waitForFunction(function () { return RD.__dev.service().instructor.firedBeats.has('o0_hello'); }, null, { timeout: 15000 })
    .then(function () { return true; }).catch(function () { return false; });
  ck('Restart at full power: the opener starts', startedC);

  await boot();
  ck('a new load: the offer is back', await offerShown(), 'fresh plant again');

  var noConfFresh = await page.evaluate(function () { return RD.__dev.service().isFreshPlant(); });
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
  ck('fresh plant: Start starts at once, no confirm', noConfFresh === true && !(await page.$('#instrCurrent [data-opener-confirm]')) &&
     await page.evaluate(function () { return RD.__dev.service().instructor.mode === 'scenario'; }), 'fresh ' + noConfFresh);

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

  /* POINTER LOG (#811). Every pointer outline added to / removed from the board, with the time and
   * whether its chat line was already in the transcript when it appeared — read by section 6. */
  await page.evaluate(function () {
    window.__ptr = [];
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        [].forEach.call(m.addedNodes, function (n) {
          if (!n.classList || !n.classList.contains('bd-focus-ol')) return;
          var id = n.getAttribute('data-focus-item');
          var lines = [].map.call(document.querySelectorAll('.chat-line[data-point]'), function (l) { return l.getAttribute('data-point'); });
          window.__ptr.push({ id: id, added: performance.now(), removed: null, lines: lines });
        });
        [].forEach.call(m.removedNodes, function (n) {
          if (!n.classList || !n.classList.contains('bd-focus-ol')) return;
          var id = n.getAttribute('data-focus-item');
          for (var i = window.__ptr.length - 1; i >= 0; i--) if (window.__ptr[i].id === id && window.__ptr[i].removed == null) { window.__ptr[i].removed = performance.now(); break; }
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  });

  // o1_load's trend: Tavg, Pressure, Steam Dump, Power in place of the player's own traces.
  await page.evaluate(function () { RD.__dev.service().handleCommand({ action: 'instructor_continue' }); });   // Ready
  await page.waitForFunction(function () { return RD.__dev.service().instructor.firedBeats.has('o1_load'); }, null, { timeout: 40000 }).catch(function () {});
  await page.waitForTimeout(800);
  var legend1 = (await page.textContent('#chartFloats')) || '';
  ck('trend: the o1_load beat put its traces on the chart', /Steam Dump/.test(legend1) && /Pressure/.test(legend1) && /Tavg/.test(legend1),
     legend0.replace(/\s+/g, ' ').slice(0, 50) + ' -> ' + legend1.replace(/\s+/g, ' ').slice(0, 60));
  ck('trend: ...and the strip chart glows (it is pointed at)', await page.evaluate(function () {
    return document.querySelector('.strip-chart').classList.contains('instr-glow'); }));

  /* ------------------------------------------------------------ 6. BOARD SCOPE + POINTER (#811)
   * OWNER RULING 2026-09-28: "we use dimming to isolate the part of the board we are focusing on
   * and only use the outline as a pointer to briefly show what the instructor is describing."
   * o1_load scopes the board to the secondary + pressurizer and its first line points at the
   * turbine-generator. Earlier owner words still bind the look: an outline "that follows the
   * detailed silhouette of the object", "I don't want it to brighten when moused over"; and the
   * instructor has exclusive control — an alarm does not change the dimming, only a beat does. */
  var SHOTDIR = process.env.SHOTDIR || null;
  async function shot(name) { if (SHOTDIR) { await page.screenshot({ path: path.join(SHOTDIR, name) }); console.log('screenshot: ' + name); } }
  function ptrLog(id) { return page.evaluate(function (i) { return (window.__ptr || []).filter(function (p) { return p.id === i; }); }, id); }
  async function waitPtr(id, n, ms) {
    return page.waitForFunction(function (a) { return (window.__ptr || []).filter(function (p) { return p.id === a[0]; }).length >= a[1]; },
      [id, n], { timeout: ms || 20000 }).then(function () { return true; }).catch(function () { return false; });
  }
  // (20 s: a line appears on the transcript's READING cadence, up to 7 s behind each line before it)
  async function waitGone(id, n, ms) {
    return page.waitForFunction(function (a) { var l = (window.__ptr || []).filter(function (p) { return p.id === a[0]; }); return l.length >= a[1] && l[a[1] - 1].removed != null; },
      [id, n], { timeout: ms || 8000 }).then(function () { return true; }).catch(function () { return false; });
  }
  function scopeNames() { return page.evaluate(function () { var f = RD.PwrBoard.scopeState(); return JSON.stringify([f.names, f.dimming]); }); }
  function scopeKey() { return page.evaluate(function () { var f = RD.PwrBoard.scopeState(); return JSON.stringify([f.key, f.lit, f.dimming]); }); }
  var TGID = 'turbineGenerator', TG = '[data-focus-item="turbineGenerator"]';
  var gotTg = await waitPtr(TGID, 1);
  var tg1 = (await ptrLog(TGID))[0];
  ck('pointer: the load line\'s pointer outlines the turbine-generator as the line appears', gotTg && tg1.lines.some(function (l) { return /Turbine and Generator/.test(l); }),
     tg1 ? 'appeared, line in the transcript: ' + tg1.lines.join(' / ') : 'never appeared');
  await page.waitForTimeout(700);                       // the 0.45 s dim transition
  await shot('scope2_load.png');
  var BORON = '[data-item="imrmtlyf64y"]', LOADC = '[data-item="imro8k5pzem"]', RODC = '[data-item="imrpk3wvydp"]', HEATC = '[data-item="imro94kec8b"]';
  function op(sel) { return page.evaluate(function (s) { return +getComputedStyle(document.querySelector(s)).opacity; }, sel); }
  var oDim = await op(BORON), oLit = await op(LOADC);
  ck('scope: a card outside the scope is dimmed (Boron)', oDim > 0.2 && oDim < 0.5, 'opacity ' + oDim.toFixed(2));
  ck('scope: a card inside it is not (Turbine Load)', oLit === 1, 'opacity ' + oLit.toFixed(2));
  var pipes = await page.evaluate(function () {
    var u = document.querySelector('.pwr-board-stage > svg:first-child');
    return { dim: u.querySelectorAll('.bd-dim').length, all: u.children.length };
  });
  ck('scope: pipes dim with their ends (some, not all)', pipes.dim > 0 && pipes.dim < pipes.all, pipes.dim + ' of ' + pipes.all + ' pipe parts dimmed');
  var bb = await page.evaluate(function () {
    // a button that sits on the dimmed Boron card: the ON button tile inside its box
    var card = document.querySelector('[data-item="imrmtlyf64y"]').getBoundingClientRect();
    var btns = [].slice.call(document.querySelectorAll('.pwr-board-stage > .bd-tile button')).filter(function (b) {
      var r = b.getBoundingClientRect(); return r.left >= card.left && r.right <= card.right && r.top >= card.top && r.bottom <= card.bottom; });
    var b = btns[0]; if (!b) return null;
    var r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, item: b.closest('[data-item]').getAttribute('data-item') };
  });
  if (bb) {
    var sel = '[data-item="' + bb.item + '"]', before = await op(sel);
    await page.mouse.move(bb.x, bb.y);
    await page.waitForTimeout(600);
    var after = await op(sel);
    ck('scope: hovering a dimmed control does not brighten it', before < 0.5 && Math.abs(after - before) < 0.01, before.toFixed(2) + ' -> ' + after.toFixed(2));
    var hit = await page.evaluate(function (p) { var e = document.elementFromPoint(p.x, p.y); var t = e && e.closest('[data-item]'); return t ? t.getAttribute('data-item') : null; }, bb);
    ck('scope: a dimmed control is still clickable (it is what the pointer hits)', hit === bb.item, hit + ' vs ' + bb.item);
    await page.mouse.move(5, 5);
  } else ck('scope: found a button on the dimmed Boron card', false, 'none');

  // THE POINTER IS BRIEF: gone about 4 s after it appeared, while the scope stands.
  var goneTg = await waitGone(TGID, 1);
  tg1 = (await ptrLog(TGID))[0];
  var life = tg1 && tg1.removed != null ? (tg1.removed - tg1.added) / 1000 : NaN;
  var afterGone = await page.evaluate(function () { return { ol: document.querySelectorAll('.bd-focus-ol').length, dim: !!document.querySelector('.pwr-board-stage.bd-dimming') }; });
  ck('pointer: gone again within ~5 s, the scope still standing', goneTg && life > 3.5 && life < 5.0 && afterGone.ol === 0 && afterGone.dim,
     'lived ' + life.toFixed(2) + ' s; outlines now ' + afterGone.ol + ', dimmed ' + afterGone.dim);
  // CLICKING THE LINE RE-SHOWS IT.
  await page.click('.chat-line[data-point*="Turbine and Generator"] .chat-txt');
  var again = await waitPtr(TGID, 2, 3000);
  ck('pointer: clicking the line shows it again', again && !!(await page.$(TG + '.on')), again ? 'second cue' : 'no second cue');
  /* SHAPED, NOT A RECT: the outline's own pixels (the outline ALONE — everything else on the stage
   * hidden for one shot, so nothing that moves on the board can land in the mask; a with/without
   * diff did, and read a drawn RECTANGLE as "2 % on the edge" — caught by injecting one). For a box
   * outline the leftmost lit pixel sits on the box's left edge on ~every row; on the turbine's
   * silhouette the slanted casing moves it right on most rows. */
  var olBox = await page.evaluate(function (sel) { var r = document.querySelector(sel).getBoundingClientRect(); return { x: Math.max(0, r.left - 20), y: Math.max(0, r.top - 20), width: r.width + 40, height: r.height + 40 }; }, TG);
  var soloOl = await page.addStyleTag({ content: '.pwr-board-stage > :not(.bd-focus-layer) { visibility: hidden !important; } .bd-focus-ol.on { animation: none !important; opacity: 1 !important; }' });
  await page.waitForTimeout(150);
  var shotOn = (await page.screenshot({ clip: olBox })).toString('base64');
  await page.evaluate(function (el) { el.remove(); }, soloOl);
  var shape = await page.evaluate(async function (b64) {
    var img = await new Promise(function (res) { var i = new Image(); i.onload = function () { res(i); }; i.src = 'data:image/png;base64,' + b64; });
    var w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'); g.drawImage(img, 0, 0);
    var P = g.getImageData(0, 0, w, h).data, bg = [P[0], P[1], P[2]], rows = [], minX = w, n = 0;
    for (var y = 0; y < h; y++) {
      var first = -1;
      for (var x = 0; x < w; x++) {
        var k = (y * w + x) * 4;
        if (P[k + 2] - bg[2] > 60) { n++; if (first < 0) first = x; if (x < minX) minX = x; }   // the band's blue
      }
      if (first >= 0) rows.push(first);
    }
    var onEdge = rows.filter(function (f) { return f - minX <= 3; }).length;
    return { lit: n, rows: rows.length, edgeFrac: rows.length ? onEdge / rows.length : 1 };
  }, shotOn);
  ck('pointer: the outline follows the silhouette (not a rectangle)', shape.lit > 200 && shape.edgeFrac < 0.75,
     shape.lit + ' px drawn, leftmost pixel on the bbox edge in ' + (shape.edgeFrac * 100).toFixed(0) + ' % of ' + shape.rows + ' rows (a box: ~100 %)');

  // AN ALARM DOES NOT TOUCH THE DIMMING (OWNER RULING 2026-09-28). Lift the PORV: PORV OPEN alarms.
  var fs0 = await scopeKey();
  await page.evaluate(function () { RD.__dev.service().handleCommand({ action: 'open_porv_manual' }); });
  var alarmed = await page.waitForFunction(function () {
    var a = (RD.__dev.service().assembleSnapshot().alarms || []).filter(function (x) { return x.id === 'porv_open' && x.state !== 'clear'; });
    return a.length > 0; }, null, { timeout: 10000 }).then(function () { return true; }).catch(function () { return false; });
  await page.waitForTimeout(700);
  var fs1 = await scopeKey();
  await page.evaluate(function () { RD.__dev.service().handleCommand({ action: 'close_porv' }); });
  ck('scope: an alarm firing mid-dim leaves the dimming exactly as the beat set it', alarmed && fs0 === fs1 && JSON.parse(fs1)[2] === true,
     'PORV OPEN ' + (alarmed ? 'alarmed' : 'NEVER ALARMED') + ', scope ' + (fs0 === fs1 ? 'unchanged' : 'CHANGED'));

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

  ck('scope: loading that save keeps the board scoped', await page.evaluate(function () { return !!document.querySelector('.pwr-board-stage.bd-dimming'); }));

  /* THE NEXT SCOPED BEAT CHANGES IT; A BEAT WITHOUT `scope` KEEPS IT. Dev jumps (the route is
   * run_opener's job; the page's job is to draw what the snapshot says). */
  async function jump(id, back) {
    await page.evaluate(function (a) {
      var s = RD.__dev.service(), I = s.instructor;
      I.branchWatch = null; I.currentBeatId = a[0]; I.lastBeatFireTime = s.simTime - a[1]; I._readHoldS = 0;
    }, [id, back]);
    return page.waitForFunction(function (i) { return RD.__dev.service().instructor.firedBeats.has(i); }, id, { timeout: 15000 })
      .then(function () { return true; }).catch(function () { return false; });
  }
  var key1 = await scopeKey(), names4;
  var j4 = await jump('o4_rods', 41);
  var gotRv = await waitPtr('reactorVessel', 1);
  await page.waitForTimeout(700);
  await shot('scope2_rods.png');
  var key4 = await scopeKey(), oRod = await op(RODC), oLoad4 = await op(LOADC);
  names4 = await scopeNames();
  ck('scope: the next scoped beat (o4_rods) changes it — rods lit, the turbine card dimmed',
     j4 && key4 !== key1 && oRod === 1 && oLoad4 < 0.5, 'o4 ' + j4 + ', Control Bank ' + oRod.toFixed(2) + ', Turbine Load ' + oLoad4.toFixed(2));
  ck('pointer: the rods line points at the reactor vessel', gotRv, gotRv ? 'appeared' : 'never');
  await waitGone('reactorVessel', 1);
  await page.waitForTimeout(300);
  await shot('scope2_rods_after.png');
  ck('pointer: after the vessel pointer expires the rods scope is unchanged', (await scopeKey()) === key4 && !(await page.$('.bd-focus-ol')));
  var j5 = await jump('o5_rods_watch', 2);
  await page.waitForTimeout(500);
  // (the key's lit list moves with the beat's highlight, which is always lit; the SCOPE must not)
  var names5 = await scopeNames();
  ck('scope: a beat without `scope` (o5_rods_watch) keeps the one standing', j5 && names5 === names4 && JSON.parse(names5)[1] === true, 'o5 ' + j5 + ', ' + names5);
  var j6 = await jump('o6_spray', 80);
  var gotSp = await waitPtr('imro8ymb0jw', 1);
  await page.waitForTimeout(700);
  await shot('scope2_spray.png');
  var oHeat = await op(HEATC), oRod6 = await op(RODC);
  ck('scope: o6_spray scopes to the pressurizer — heaters lit, the rod card dimmed', j6 && oHeat === 1 && oRod6 < 0.5,
     'o6 ' + j6 + ', Heaters ' + oHeat.toFixed(2) + ', Control Bank ' + oRod6.toFixed(2));
  ck('pointer: the spray line points at the spray card', gotSp, gotSp ? 'appeared' : 'never');

  /* ALARM HUE UNDER DIMMING (OWNER RULING 2026-09-28, option (b): "keep dimming, but let a tile in
   * alarm keep its hue (drop the grayscale for alarm/actuated states only; no brightening)"). The
   * rod card is dimmed under o6's pressurizer scope; trip the reactor there and SCRAMMED must stay
   * RED at the same dim opacity, with the scope untouched. The opener's early-trip watch would lift
   * the scope on the trip, so it is disarmed for this probe (a dev poke; the watch has its own
   * checks in section 7). QA measured SCRAMMED (255,90,77) -> (68,53,54) under the grayscale. */
  var SCR = '[data-item="imrqr8ecji6"]';
  var names6 = await scopeNames();
  await page.evaluate(function () { var I = RD.__dev.service().instructor; I.scenario.watch = []; RD.__dev.service().handleCommand({ action: 'scram' }); });
  await page.waitForFunction(function (s) { return /SCRAMMED/.test(document.querySelector(s).textContent); }, SCR, { timeout: 10000 }).catch(function () {});
  await page.waitForTimeout(700);
  var scr = await page.evaluate(function (s) { var t = document.querySelector(s), cs = getComputedStyle(t); return { op: +cs.opacity, filter: cs.filter, text: t.textContent.trim().slice(0, 12) }; }, SCR);
  var scrBox = await page.evaluate(function (s) { var r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; }, SCR);
  var scrB64 = (await page.screenshot({ clip: scrBox })).toString('base64');
  var rg = await page.evaluate(async function (b64) {
    var img = await new Promise(function (res) { var i = new Image(); i.onload = function () { res(i); }; i.src = 'data:image/png;base64,' + b64; });
    var c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    var g = c.getContext('2d'); g.drawImage(img, 0, 0);
    var P = g.getImageData(0, 0, img.width, img.height).data, best = [0, 0, 0], bd = -1e9;
    for (var k = 0; k < P.length; k += 4) { var d = P[k] - P[k + 1]; if (d > bd) { bd = d; best = [P[k], P[k + 1], P[k + 2]]; } }
    return { rgb: best, rMinusG: bd };
  }, scrB64);
  ck('alarm hue: a dimmed SCRAMMED keeps its red — same dim opacity, no grayscale, scope unchanged',
     /SCRAMMED/.test(scr.text) && rg.rMinusG > 35 && scr.op > 0.3 && scr.op < 0.45 && scr.filter === 'none' && (await scopeNames()) === names6,
     scr.text + ', reddest pixel rgb(' + rg.rgb.join(',') + ') R-G ' + rg.rMinusG + ', opacity ' + scr.op.toFixed(2) + ', filter ' + scr.filter);
  var litNorm = await page.evaluate(function () { var t = document.querySelector('[data-item="imrmtlyf64y"]'); return getComputedStyle(t).filter; });
  ck('alarm hue: ...while a dimmed tile NOT in alarm stays desaturated (Boron)', /grayscale/.test(litNorm), litNorm);

  // ---------------------------------------------------------------- End: no offer over it
  await page.waitForSelector('[data-opener-end]', { timeout: 8000 }).catch(function () {});
  await page.click('[data-opener-end]');
  await page.waitForTimeout(1500);
  ck('after End: the offer is back (the tab is idle)', await offerShown(4000), 'Start will ask first: an opener ran on this load');
  var legend2 = (await page.textContent('#chartFloats')) || '';
  await page.waitForTimeout(600);
  ck('scope: End clears it all (no pointer, no dimming)', await page.evaluate(function () {
    return !document.querySelector('.bd-focus-ol') && !document.querySelector('.pwr-board-stage.bd-dimming') && !document.querySelector('.bd-lit'); }));
  ck("trend: End hands the player's own chart back", /Output MW/.test(legend0) && /Output MW/.test(legend2) && !/Steam Dump|Pressure/.test(legend2),
     legend2.replace(/\s+/g, ' ').slice(0, 60));
  // ...and it does ask; and a confirm left up over a NEW load goes (its "will be lost" is then false).
  // Measured before the idleKey fix (#811 QA): the confirm stayed up over the fresh plant.
  await page.click(OFFER);
  ck('after End: Start asks first', !!(await page.waitForSelector('#instrCurrent [data-opener-confirm]', { state: 'visible', timeout: 4000 }).catch(function () { return null; })));
  await page.evaluate(function () { RD.__dev.service().handleCommand({ action: 'reset', plant_id: 'pwr2', initial_state: 'hot_full_power' }); });
  await page.waitForTimeout(1500);
  ck('a confirm left up over a new load goes, the offer comes back', !(await page.$('#instrCurrent [data-opener-confirm]')) && (await offerShown(3000)));

  // ---------------------------------------------------------------- the trip beat's chart
  await boot();
  await page.click(OFFER);
  await page.waitForTimeout(800);
  // Ready first, so o1_load's scope is UP when the jump lands — otherwise "o10 shows the whole
  // board" would pass on a board that was never dimmed (it did, until the injection said so).
  await page.waitForFunction(function () { return RD.__dev.service().instructor.firedBeats.has('o0_hello'); }, null, { timeout: 15000 }).catch(function () {});
  await page.evaluate(function () { RD.__dev.service().handleCommand({ action: 'instructor_continue' }); });
  await page.waitForFunction(function () { return !!document.querySelector('.pwr-board-stage.bd-dimming'); }, null, { timeout: 15000 }).catch(function () {});
  await page.evaluate(function () {
    var s = RD.__dev.service(), I = s.instructor;
    I.branchWatch = null; I.currentBeatId = 'o10_scram'; I.lastBeatFireTime = s.simTime - 40;   // dev jump
  });
  await page.waitForFunction(function () { return RD.__dev.service().instructor.currentBeatId === 'o10_scram' && !!RD.__dev.service().instructor.branchWatch; }, null, { timeout: 15000 }).catch(function () {});
  await page.waitForTimeout(700);
  ck('scope: the SCRAM ask (o10_scram, scope: null) shows the whole board', await page.evaluate(function () {
    return !document.querySelector('.pwr-board-stage.bd-dimming') && !document.querySelector('.bd-focus-ol.on'); }));
  await page.evaluate(function () { RD.__dev.service().handleCommand({ action: 'scram' }); });
  await page.waitForFunction(function () { var I = RD.__dev.service().instructor; return I.firedBeats.has('o11_trip'); }, null, { timeout: 40000 }).catch(function () {});
  ck('scope: the planned trip did not take the early-trip path', await page.evaluate(function () {
    return !RD.__dev.service().instructor.firedBeats.has('ox_trip_early'); }));
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

  // ---------------------------------------------------------------- 7. the UNEXPECTED trip
  // SCRAM pressed during the load cut, before it is asked for: the scenario watch jumps to
  // ox_trip_early, whose `scope: null` lifts the dimming — the beat does it, not the trip — and
  // whose `speed: 1` takes the clock back (QA: an early SCRAM at 5x left the explanation at 5x).
  // The clock is put at 5x and the event dropouts OFF (a Settings choice), or the scram's own
  // dropout would bring it to 1x and hide a missing `speed: 1`.
  await boot();
  await page.click(OFFER);
  await page.waitForFunction(function () { return RD.__dev.service().instructor.firedBeats.has('o0_hello'); }, null, { timeout: 15000 }).catch(function () {});
  await page.evaluate(function () { RD.__dev.service().handleCommand({ action: 'instructor_continue' }); });
  await page.waitForFunction(function () { return RD.__dev.service().instructor.firedBeats.has('o1_load'); }, null, { timeout: 40000 }).catch(function () {});
  await page.waitForTimeout(800);
  var dimBefore = await page.evaluate(function () { return !!document.querySelector('.pwr-board-stage.bd-dimming'); });
  var acc5 = await page.evaluate(function () {
    var s = RD.__dev.service();
    s.handleCommand({ action: 'set_attention_stops', value: false });
    s.handleCommand({ action: 'set_speed', value: 5 });
    return s.timeAcceleration;
  });
  await page.evaluate(function () { RD.__dev.service().handleCommand({ action: 'scram' }); });
  var oxFired = await page.waitForFunction(function () { return RD.__dev.service().instructor.firedBeats.has('ox_trip_early'); }, null, { timeout: 15000 })
    .then(function () { return true; }).catch(function () { return false; });
  await page.waitForTimeout(800);
  var after7 = await page.evaluate(function () { return { dim: !!document.querySelector('.pwr-board-stage.bd-dimming'), acc: RD.__dev.service().timeAcceleration }; });
  ck('early trip: the guard beat fires and un-dims the board', dimBefore && oxFired && !after7.dim,
     'dimmed before ' + dimBefore + ', ox_trip_early ' + oxFired + ', dimmed after ' + after7.dim);
  ck('early trip: ...and takes the clock from 5x back to 1x', acc5 === 5 && oxFired && after7.acc === 1, acc5 + 'x -> ' + after7.acc + 'x');

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

  // ---------------------------------------------------------------- 8. regions + gauge alarm hue (QA4)
  /* EVERY TILE IS IN SOME REGION. A readout whose tile overhangs its card is missed by the card's
   * containment, and it stayed dim under the scope that is about it (OUTPUT / GOVERNOR / TURBINE
   * rpm under `secondary` during the load cut — found 2026-09-28). The one exemption is the outer
   * CVCS + safety-injection panel frame, which only contains cards that have their own regions. */
  var cov = await page.evaluate(function () {
    var B = RD.PwrBoard, seen = {};
    RD.PwrBoardDriver.focusRegions().forEach(function (r) {
      B.setScope({ names: [r], lit: [] });
      B.scopeState().lit.forEach(function (id) { seen[id] = 1; });
    });
    B.setScope(null);
    var EXEMPT = { ims3l6k3mb0: 1 };
    return [].map.call(document.querySelectorAll('.pwr-board-stage > .bd-tile[data-item]'), function (t) { return t.getAttribute('data-item'); })
      .filter(function (id) { return !seen[id] && !EXEMPT[id]; });
  });
  ck('regions: every board tile is lit by at least one region', !cov.length, cov.length ? 'never lit: ' + cov.join(', ') : 'all');
  /* A GAUGE IN ITS ALARM BAND keeps its hue under the dimming (OWNER RULING 2026-09-28, option
   * (b)). Section 6 proves it for SCRAMMED only. Scope the rods (PRIMARY PRESSURE dimmed), pin
   * the scope against free play's per-broadcast clear, open the PORV at 10x and read the gauge
   * once it is in its band: no grayscale, same dim opacity, colour in the pixels. Measured
   * 2026-09-28: chroma 54 in alarm vs 12 with the grayscale forced back on (injection). */
  var PP = '.pwr-board-stage > [data-item="ims2immsvn6"]';
  await page.evaluate(function () {
    var B = RD.PwrBoard, s = RD.__dev.service();
    B.setScope({ names: ['rods'], lit: [] }); B.setScope = function () {};
    s.attentionStops = false; s.handleCommand({ action: 'open_porv_manual' }); s.handleCommand({ action: 'set_speed', value: 10 });
  });
  var ppAlarm = await page.waitForFunction(function (sel) { var t = document.querySelector(sel); return !!(t && t.querySelector('.bd-alarm-hue')); }, PP, { timeout: 60000 })
    .then(function () { return true; }).catch(function () { return false; });
  await page.evaluate(function () { RD.__dev.service().handleCommand({ action: 'pause' }); });
  await page.waitForTimeout(700);
  var ppSt = await page.evaluate(function (sel) { var t = document.querySelector(sel), cs = getComputedStyle(t), r = t.getBoundingClientRect();
    return { op: +cs.opacity, filter: cs.filter, lit: t.classList.contains('bd-lit'), box: { x: r.left, y: r.top, width: r.width, height: r.height } }; }, PP);
  var ppB64 = (await page.screenshot({ clip: ppSt.box })).toString('base64');
  var ppChroma = await page.evaluate(async function (b64) {
    var img = await new Promise(function (res) { var i = new Image(); i.onload = function () { res(i); }; i.src = 'data:image/png;base64,' + b64; });
    var c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    var g = c.getContext('2d'); g.drawImage(img, 0, 0);
    var P = g.getImageData(0, 0, img.width, img.height).data, best = 0;
    for (var k = 0; k < P.length; k += 4) best = Math.max(best, Math.max(P[k], P[k + 1], P[k + 2]) - Math.min(P[k], P[k + 1], P[k + 2]));
    return best;
  }, ppB64);
  ck('alarm hue: a dimmed gauge in its alarm band (PRIMARY PRESSURE, PORV open) keeps its colour',
     ppAlarm && !ppSt.lit && ppSt.op > 0.3 && ppSt.op < 0.45 && ppSt.filter === 'none' && ppChroma > 35,
     (ppAlarm ? 'in band' : 'NEVER IN BAND') + ', opacity ' + ppSt.op.toFixed(2) + ', filter ' + ppSt.filter + ', max chroma ' + ppChroma + ' (grayscaled: ~12)');

  await browser.close();
  console.log('\n' + (fail ? '\x1b[31mOPENER UI: FAIL' : '\x1b[32mOPENER UI: PASS') + '\x1b[0m   ' + pass + '/' + (pass + fail) + ' checks');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
