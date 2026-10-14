/*
 * verify_tmi_callout.js — the WALKTHROUGH CALLOUT on the TMI-2 incident leg (2026-10-10, OWNER:
 * "We should build TMI with the concise callouts like the starting instruction."). The opener's
 * anchored card (verify_opener_callout.js), driven by the active walkthrough step. On by default
 * for a procedure that authors `callout: true`; never on any other leg.
 *
 * What only the page can get wrong, at 1366x768 and 1920x1080, on EVERY TMI step:
 *   1. THE CARD IS UP and on-screen; ACTION (data-kind="act") exactly when the step has a control
 *      to act on (`hl`), OBSERVATION otherwise; the step line is the card's big/say line.
 *   2. KEEP-OUTS — it covers none of the six top tiles and none of the step's lit items on the
 *      board (the acted-on control, its panel, the watched items, the lit cards); a leader line
 *      runs to the anchor when there is one.
 *   3. THE COLUMN is a step-progress list (one row per step, the active one marked) and the
 *      step's prose card is not drawn.
 *   4. BUTTONS WORK FROM THE CARD — Continue on a pause step advances the leg; "why?" opens the
 *      explanation on an action step; History lists the morning so far; the card never fades on hover (OWNER 2026-10-13).
 *   5. DEFAULT ELSEWHERE IS UNCHANGED — another walkthrough draws no card and its step card shows;
 *      `?callout=0` (the player's Off) on TMI draws no card and the step card shows.
 *
 * SHOTDIR=<dir> saves a screenshot of six representative steps per resolution.
 * Run: node test/verify_tmi_callout.js
 */
'use strict';
var path = require('path');
var ROOT = path.join(__dirname, '..');
var BASE = 'file:///' + path.join(ROOT, 'ui', 'shell.html').replace(/\\/g, '/') + '?engine=pwr2&init=hot_full_power&dev=1';
var SHOTDIR = process.env.SHOTDIR || null;
var PROC = 'pwr_tmi2_incident';
var SHOTS = { 2: 1, 6: 1, 8: 1, 10: 1, 14: 1, 18: 1 };   // 1-based step numbers

var pass = 0, fail = 0;
function ck(name, ok, detail) {
  ok ? pass++ : fail++;
  console.log((ok ? '\x1b[32mPASS' : '\x1b[31mFAIL') + '\x1b[0m  ' + name + (detail != null ? '\x1b[2m   (' + detail + ')\x1b[0m' : ''));
}
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
    await page.evaluate(function () { try { localStorage.removeItem('rd_instr_callout'); } catch (e) {} });
    return { ctx: ctx, page: page };
  }
  // The leg's own launcher path (startChecklist sets the UI's run view), via the delegated
  // `data-ckl-start` handler every launcher uses.
  async function start(page, id) {
    await page.evaluate(function (p) {
      var s = RD.__dev.service(); s.attentionStops = false;
      var b = document.createElement('button'); b.setAttribute('data-ckl-start', p); document.body.appendChild(b); b.click(); b.remove();
    }, id);
    await page.waitForFunction(function (p) { var c = RD.__dev.service().instructor.checklist; return !!(c && c.proc && c.proc.id === p); }, id, { timeout: 15000 });
    await page.waitForTimeout(800);
  }
  async function jump(page, i) {
    await page.evaluate(function (k) {
      var sv = RD.__dev.service(), c = sv.instructor.checklist;
      c.idx = k;
      if (!sv.running) sv.start();   // a pause step stopped the clock: no broadcast would carry the jump
      for (var j = 0; j < c.done.length; j++) c.done[j] = j < k;
    }, i);
    await page.waitForTimeout(900);
  }
  function geom(page) {
    return page.evaluate(function () {
      var b = document.querySelector('#instrCallout');
      var c = RD.__dev.service().instructor.checklist;
      var st = c && c.proc ? c.proc.steps[c.idx] : null;
      var colStep = document.querySelector('#cklRun .ckl-step.ckl-active');
      var prog = [].map.call(document.querySelectorAll('#cklRun .ckl-prog-list li'), function (li) { return li.className; });
      var base = { idx: c ? c.idx : -1, hasHl: !!(st && st.hl && st.hl.length), text: st ? st.text : '',
        colStepShown: !!(colStep && colStep.getClientRects().length), prog: prog.length, progActive: prog.indexOf('active') };
      // the ACTIVE progress row is on screen inside its scroller (review 2026-10-10: step 20 sat
      // below the fold at 1366x768 — the step-advance scroll aimed at the hidden step card)
      var li = document.querySelector('#cklRun .ckl-prog-list li.active');
      if (li) {
        var sc = li.parentElement;
        while (sc && sc !== document.body && !(sc.scrollHeight > sc.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
        var lr = li.getBoundingClientRect(), vr = sc && sc !== document.body ? sc.getBoundingClientRect() : { top: 0, bottom: innerHeight };
        base.rowVis = lr.top >= Math.max(0, vr.top) - 1 && lr.bottom <= Math.min(innerHeight, vr.bottom) + 1;
      }
      if (!b || b.hidden) { base.shown = false; return base; }
      var r = b.getBoundingClientRect();
      function ok(q) { return q.width > 2 && q.height > 2; }
      function ov(a, q) { var w = Math.min(a.right, q.right) - Math.max(a.left, q.left), h = Math.min(a.bottom, q.bottom) - Math.max(a.top, q.top); return w > 0 && h > 0 ? w * h : 0; }
      // the six TOP TILES — found by the exact label text (app.js finds them another way)
      var LABS = ['REACTOR POWER', 'AVG COOLANT TEMPERATURE', 'SUBCOOLING MARGIN', 'PRIMARY PRESSURE', 'PRESSURIZER LEVEL', 'STEAM GENERATOR LEVEL'];
      var stg = document.querySelector('#viewArea .pwr-board-stage'), tops = [];
      var tw = document.createTreeWalker(stg, NodeFilter.SHOW_TEXT), tn;
      while ((tn = tw.nextNode())) {
        if (LABS.indexOf(tn.nodeValue.trim().toUpperCase()) === -1) continue;
        var up = tn.parentNode; while (up && up.parentNode !== stg) up = up.parentNode;
        if (up) tops.push(up.getBoundingClientRect());
      }
      // THE PLANT KEEP-OUTS (owner: "it might block important info"): the pressurizer and vessel
      // drawings and the PZR SPRAY / PZR TEMP / HTR PWR readouts. This test's OWN list of board ids,
      // not the app's: a renamed item must go red here, not silently shrink both lists.
      var PLANT = ['pressurizer', 'reactorVessel', 'imsgt6tl11c', 'imsgt6qmdgx', 'ims5gp0aicx', 'ims5gq44zgr', 'ims5gpdv96m', 'ims5gprvl7n'];
      var plant = PLANT.map(function (id) { var t = stg.querySelector('[data-item="' + id + '"]'); return t ? t.getBoundingClientRect() : null; }).filter(function (q) { return q && ok(q); });
      // the step's lit items on the board, and the acted-on control's PANEL
      var lit = [].map.call(document.querySelectorAll('#viewArea .ckl-step-glow, #viewArea .ckl-watch-glow, #viewArea .ckl-check-glow, #viewArea .ckl-panel-glow'),
        function (x) { return x.getBoundingClientRect(); }).filter(ok);
      var g = [].map.call(document.querySelectorAll('#viewArea .ckl-step-glow'), function (x) { return x.getBoundingClientRect(); }).filter(ok)[0];
      if (g) {
        var S = stg.getBoundingClientRect(), P = null, ba = Infinity;
        [].forEach.call(stg.children, function (t) { var q = t.getBoundingClientRect(), a = q.width * q.height;
          if (a < S.width * S.height / 6 && a < ba && a > g.width * g.height * 1.05 && q.left <= g.left + 1 && q.top <= g.top + 1 && q.right >= g.right - 1 && q.bottom >= g.bottom - 1) { P = q; ba = a; } });
        if (P) lit.push(P);
      }
      var ld = document.querySelector('#instrCalloutLead'), dot = ld && !ld.hidden ? ld.querySelector('i').getBoundingClientRect() : null;
      var dx = dot ? (dot.left + dot.right) / 2 : 0, dy = dot ? (dot.top + dot.bottom) / 2 : 0;
      // an ACTION card's leader ends ON the control it asks for, not merely inside its panel (review
      // 2026-10-10: step 18's ran to the pressurizer tile's edge and ended on PZR SPRAY)
      var acts = [].map.call(document.querySelectorAll('#viewArea .ckl-step-glow'), function (x) { return x.getBoundingClientRect(); }).filter(ok);
      // CLEAR AIR round the control it asks for (layman pass 2026-10-10, S-10: a 7 px tangent on
      // step 14 read as the card covering the AFW block valve). Edge-to-edge gap, px.
      base.actGap = acts.length ? Math.round(Math.min.apply(null, acts.map(function (q) {
        var gx = Math.max(0, q.left - r.right, r.left - q.right), gy = Math.max(0, q.top - r.bottom, r.top - q.bottom);
        return Math.sqrt(gx * gx + gy * gy); }))) : null;
      base.leadAct = dot && acts.length ? acts.some(function (q) { return dx >= q.left - 10 && dx <= q.right + 10 && dy >= q.top - 10 && dy <= q.bottom + 10; }) : null;
      base.shown = true;
      base.kind = b.getAttribute('data-kind');
      base.onScreen = r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      base.tops = tops.length;
      base.topHit = Math.round(tops.reduce(function (a, q) { return a + ov(r, q); }, 0));
      base.plant = plant.length;
      base.plantHit = Math.round(plant.reduce(function (a, q) { return a + ov(r, q); }, 0));
      base.compact = b.classList.contains('ico-compact');
      base.lit = lit.length;
      base.litHit = Math.round(lit.reduce(function (a, q) { return a + ov(r, q); }, 0));
      base.lead = dot ? lit.some(function (q) { return dx >= q.left - 8 && dx <= q.right + 8 && dy >= q.top - 8 && dy <= q.bottom + 8; }) : null;
      base.main = ((b.querySelector('.ico-act') || b.querySelector('.ico-say') || {}).textContent || '').trim();
      base.who = (b.querySelector('.ico-who') || {}).textContent || '';
      base.cont = !!b.querySelector('[data-ico-fwd="[data-ckl-check]"]');
      base.box = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
      return base;
    });
  }
  async function shot(page, tag, name) {
    if (!SHOTDIR) return;
    await page.screenshot({ path: path.join(SHOTDIR, tag + '_' + name + '.png') });
  }

  var VPS = [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }];
  for (var v = 0; v < VPS.length; v++) {
    var vp = VPS[v], tag = vp.width + 'x' + vp.height;
    var S = await session(vp), page = S.page;
    await start(page, PROC);
    var N = await page.evaluate(function () { return RD.__dev.service().instructor.checklist.proc.steps.length; });
    var bad = [], skipped = [], compact = [];
    for (var i = 0; i < N; i++) {
      if (i > 0) await jump(page, i);
      var g = await geom(page);
      // a step the plant has already moved past (overtaken, e.g. the SI block above 1972 psi on a
      // plant that never depressurized) advances on its own: grade the step the leg is ON
      if (g.idx !== i) { if (g.idx > i) { skipped.push(i + 1); continue; } }
      if (SHOTS[i + 1]) await shot(page, tag, 'step' + String(i + 1).padStart(2, '0'));
      var why = [];
      if (!g.shown) why.push('no card');
      else {
        if (!g.onScreen) why.push('off-screen ' + g.box);
        if (g.kind !== (g.hasHl ? 'act' : 'observe')) why.push('kind ' + g.kind + ' vs hl ' + g.hasHl);
        if (g.main !== g.text) why.push('line "' + g.main + '"');
        if (g.tops !== 6 || g.topHit !== 0) why.push('top tiles ' + g.tops + ' hit ' + g.topHit);
        if (g.litHit !== 0) why.push('covers a lit item by ' + g.litHit + ' px2');
        if (g.plant !== 8 || g.plantHit !== 0) why.push('plant keep-outs ' + g.plant + '/8 hit ' + g.plantHit + ' px2');
        if (g.compact) compact.push(g.idx + 1);
        if (g.lit && g.lead === false) why.push('leader misses the anchor');
        if (g.kind === 'act' && g.leadAct === false) why.push('leader misses the control it asks for');
        if (g.kind === 'act' && g.actGap != null && g.actGap < 10) why.push('card within ' + g.actGap + ' px of the control it asks for');
        if (!g.cont) why.push('no Continue in the card');
        if (g.who.indexOf('Step ' + (g.idx + 1) + ' of ' + N) !== 0) why.push('head "' + g.who + '"');
      }
      if (g.colStepShown) why.push('the column still draws the step card');
      if (g.prog !== N || g.progActive !== g.idx) why.push('progress list ' + g.prog + ' rows, active ' + g.progActive);
      if (g.rowVis === false) why.push('the active progress row is scrolled out of view');
      if (why.length) bad.push('step ' + (i + 1) + ': ' + why.join('; ') + ' ' + JSON.stringify(g.box || null));
    }
    ck(tag + ': every one of the ' + N + ' TMI steps draws the card — right kind, the step line, on-screen, clear of the six top tiles and every lit item, 10 px clear of the control it asks for, leader to the anchor, Continue in it; the column is a progress list',
       N >= 15 && bad.length === 0 && skipped.length <= 2, bad.length ? bad.join(' | ') : N + ' steps' + (skipped.length ? ', overtaken on the jump: ' + skipped : '') + ', compact fallback on: ' + (compact.join(',') || 'none'));

    // "why?" on an ACTION step
    var actIdx = await page.evaluate(function () { var s = RD.__dev.service().instructor.checklist.proc.steps; for (var k = 0; k < s.length; k++) if (s[k].hl && s[k].hl.length && s[k].why && !s[k].overtaken) return k; return -1; });
    await jump(page, actIdx);
    actIdx = await page.evaluate(function () { return RD.__dev.service().instructor.checklist.idx; });
    var w0 = await page.evaluate(function () { var b = document.querySelector('#instrCallout'); return { why: !!b.querySelector('.ico-why'), btn: !!b.querySelector('[data-ico-why]') }; });
    await page.click(BUB + ' [data-ico-why]').catch(function () {});
    await page.waitForTimeout(400);
    var w1 = await page.evaluate(function () { var w = document.querySelector('#instrCallout .ico-why'); return w ? w.textContent : ''; });
    var whyWant = await page.evaluate(function (k) { return RD.__dev.service().instructor.checklist.proc.steps[k].why; }, actIdx);
    ck(tag + ': an action step hides its why behind "why?", and the button opens it', !w0.why && w0.btn && w1 === whyWant, JSON.stringify([w0, w1.slice(0, 50)]));
    // History
    await page.click(BUB + ' [data-ico-hist]').catch(function () {});
    await page.waitForTimeout(400);
    var hist = await page.evaluate(function () { var h = document.querySelector('#instrCallout .ico-hist'); return h && !h.hidden ? h.querySelectorAll('.ico-h').length : -1; });
    ck(tag + ': History lists the morning so far (one entry per step reached)', hist === actIdx + 1, 'entries ' + hist + ' for step ' + (actIdx + 1));
    await page.click(BUB + ' [data-ico-hist]').catch(function () {});

    // Continue from the card, on a PAUSE step (no acceptance: the button is the only way on)
    if (v === 0) {
      var pIdx = await page.evaluate(function () { var s = RD.__dev.service().instructor.checklist.proc.steps; for (var k = 0; k < s.length; k++) if (s[k].pause && !s[k].acc && !(s[k].accs && s[k].accs.length) && !s[k].saw) return k; return -1; });
      await jump(page, pIdx);
      await page.waitForFunction(function () { var b = document.querySelector('#instrCallout [data-ico-fwd="[data-ckl-check]"]'); return b && !b.disabled; }, null, { timeout: 8000 }).catch(function () {});
      await page.click(BUB + ' [data-ico-fwd="[data-ckl-check]"]').catch(function () {});
      var moved = await page.waitForFunction(function (k) { return RD.__dev.service().instructor.checklist.idx === k + 1; }, pIdx, { timeout: 8000 }).then(function () { return true; }).catch(function () { return false; });
      ck(tag + ': Continue clicked in the card advances a pause step (step ' + (pIdx + 1) + ')', pIdx >= 0 && moved);
      /* NO HOVER FADE (OWNER 2026-10-13: "they also shouldnt go clear when moused over"). The next
       * card is drawn under the pointer that pressed Continue; it must be solid at rest, while the
       * pointer moves on it, and after leaving and returning. */
      await page.waitForTimeout(700);
      var tc = await page.evaluate(function () { var t = document.querySelector('#instrCallout .ico-say, #instrCallout .ico-act'); if (!t) return null; var q = t.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
      var opac = async function () { await page.waitForTimeout(450); return page.evaluate(function () { return +getComputedStyle(document.querySelector('#instrCallout')).opacity; }); };
      var opA = -1, opB = -1, opC = -1;
      if (tc) {
        await page.mouse.move(tc.x, tc.y); opA = await opac();
        await page.mouse.move(tc.x + 30, tc.y, { steps: 3 }); opC = await opac();   // a hover that MOVES on the card
        await page.mouse.move(2, 2); await page.mouse.move(tc.x, tc.y); opB = await opac();
        await page.mouse.move(2, 2);
      }
      ck(tag + ': the card stays fully opaque under the pointer - at rest, moving on it, and after leaving and returning',
         opA === 1 && opB === 1 && opC === 1, 'opacity at rest ' + opA + ', moving on it ' + opC + ', after leave+return ' + opB);
    }
    await S.ctx.close();
  }

  // ---------------------------------------------------------------- 6. Settings shows the EFFECTIVE state
  var T = await session({ width: 1366, height: 768 });
  await start(T.page, PROC);
  async function segState(p) { return p.evaluate(function () { var b = document.querySelector('#calloutSeg .on'); var c = document.querySelector('#instrCallout'); return { on: b && b.getAttribute('data-callout'), card: !!(c && !c.hidden) }; }); }
  await T.page.click('#settingsBtn');
  var s0 = await segState(T.page);
  await T.page.click('#calloutSeg [data-callout="off"]'); await T.page.waitForTimeout(600);
  var s1 = await segState(T.page);
  await T.page.click('#calloutSeg [data-callout="auto"]'); await T.page.waitForTimeout(600);
  var s2 = await segState(T.page);
  var ls = await T.page.evaluate(function () { try { return localStorage.getItem('rd_instr_callout'); } catch (e) { return 'x'; } });
  ck('Settings shows the effective state: nothing chosen reads Auto with the TMI card up; Off takes it down; Auto brings it back and clears the choice',
     s0.on === 'auto' && s0.card && s1.on === 'off' && !s1.card && s2.on === 'auto' && s2.card && ls === null, JSON.stringify([s0, s1, s2, ls]));
  await T.ctx.close();

  // ---------------------------------------------------------------- 5. defaults elsewhere
  var D = await session({ width: 1366, height: 768 });
  var other = await D.page.evaluate(function () {
    return (RD.MANUAL_PROCEDURES.pwr2 || []).filter(function (p) { return !p.callout && p.from === 'hot_full_power'; }).map(function (p) { return p.id; })[0];
  });
  await start(D.page, other);
  var od = await geom(D.page);
  ck('another walkthrough (' + other + ') with nothing set: no card, its step card shows, no progress list', !od.shown && od.colStepShown && od.prog === 0, JSON.stringify(od));
  await D.ctx.close();
  var O = await session({ width: 1366, height: 768 }, '&callout=0');
  await start(O.page, PROC);
  var oo = await geom(O.page);
  ck('TMI with the player\'s Off (?callout=0): no card, the step card shows', !oo.shown && oo.colStepShown && oo.prog === 0, JSON.stringify(oo));
  await O.ctx.close();

  await browser.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
