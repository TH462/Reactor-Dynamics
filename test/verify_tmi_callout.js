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
 *   7. THE #670 REDESIGN (OWNER RULING 2026-10-14): the strip chart is preset from step 1 (pressure,
 *      pressurizer level, RCS inventory, PORV; 30 min pinned) and widens to 3 h on the pumps step;
 *      the deciding beats draw the live PRESSURIZER LEVEL | RCS INVENTORY pair with the reason inline;
 *      Realistic mode drops the true-state half (Hard Rule 1); End puts the chart back.
 *  11. A row latched by its `implied_by` sibling draws as covered on the card, never a plain ✓.
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
var SHOTS = { 1: 1, 3: 1, 6: 1, 7: 1, 9: 1, 10: 1 };   // 1-based step numbers (#670 redesign: 12 steps)

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
      /* A JUMPED plant never ran step 6, so injection may be running when it lands on step 9, whose
       * `overtaken` (hpi_active) is the keep-injection branch's -- played for real by
       * run_walkthrough_routes `keep_injection`. Here it would skip the step this test measures. */
      var tgt = c.proc.steps[k];
      if (tgt && tgt.overtaken && tgt.overtaken.p === 'hpi_active') delete tgt.overtaken;
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
    var cPre = await page.evaluate(function () { return RD.__dev.chart(); });   // the chart before the walkthrough borrows it
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
       N >= 10 && bad.length === 0 && skipped.length <= 2, bad.length ? bad.join(' | ') : N + ' steps' + (skipped.length ? ', overtaken on the jump: ' + skipped : '') + ', compact fallback on: ' + (compact.join(',') || 'none'));

    // "why?" on an ACTION step
    var actIdx = await page.evaluate(function () { var s = RD.__dev.service().instructor.checklist.proc.steps; for (var k = 0; k < s.length; k++) if (s[k].hl && s[k].hl.length && s[k].why && !s[k].overtaken && !s[k].pair) return k;   /* a pair step draws its why inline (#670 redesign) */ return -1; });
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
    var histWant = await page.evaluate(function (k) { var st = RD.__dev.service().instructor.checklist.proc.steps, n = 0; for (var j = 0; j <= k; j++) n += st[j].history ? st[j].history.length : (st[j].story ? 1 : 0); return n; }, actIdx);
    ck(tag + ': History lists the morning so far (every sourced beat of every step reached, folded steps included)', hist === histWant && histWant > actIdx + 1, 'entries ' + hist + ' of ' + histWant + ' for step ' + (actIdx + 1));
    await page.click(BUB + ' [data-ico-hist]').catch(function () {});

    // 7. THE REDESIGN: chart preset, window pin, live pair, Hard Rule 1, restore on End
    if (v === 0) {
      var PRESET = ['inventory', 'porv', 'pressure', 'pzr_level'];
      var PRESET9 = ['inventory', 'porv', 'pressure', 'pzr_level', 'uncovered'];   // the pumps step adds Core Uncovered (layman pass 2026-10-14, S-1)
      var steps = await page.evaluate(function () { return RD.__dev.service().instructor.checklist.proc.steps.map(function (x) { return { pair: !!x.pair, window: x.window || 0 }; }); });
      var pairIdx = steps.map(function (x, k) { return x.pair ? k : -1; }).filter(function (k) { return k >= 0; });
      var wideIdx = steps.map(function (x, k) { return x.window === 10800 ? k : -1; }).filter(function (k) { return k >= 0; })[0];
      await jump(page, 1);
      var c1 = await page.evaluate(function () { return RD.__dev.chart(); });
      // the lit ladder rung is the pinned width or none: a 5m/15m rung lit over a 30 min axis misreads the chart (quality pass 2026-10-14)
      ck(tag + ': step 2 charts the preset (pressure, pressurizer level, RCS inventory, PORV) on a pinned 30 min window, and no other width is lit on the ladder',
         JSON.stringify(c1.series) === JSON.stringify(PRESET) && c1.window === 1800 && c1.windowAuto === false && (c1.lit === null || c1.lit === 1800), JSON.stringify(c1));
      await jump(page, wideIdx);
      var c9 = await page.evaluate(function () { return RD.__dev.chart(); });
      ck(tag + ': the pumps step (step ' + (wideIdx + 1) + ') widens the pinned window to 3 h, keeps 3 h of trend and adds Core Uncovered to the chart',
         wideIdx >= 0 && c9.window === 10800 && c9.record >= 10800 && JSON.stringify(c9.series) === JSON.stringify(PRESET9) && (c9.lit === null || c9.lit === 10800), JSON.stringify(c9));
      var PAIR_RE = /^PRESSURIZER LEVEL \d+ %( rising| falling| steady)?  \|  RCS INVENTORY \d+ %( rising| falling| steady)?$/;
      var pairBad = [];
      for (var pk = 0; pk < pairIdx.length; pk++) {
        await jump(page, pairIdx[pk]);
        var pr = await page.evaluate(function () { var b = document.querySelector('#instrCallout'); var p = b.querySelector('.ico-pair'); var w = b.querySelector('.ico-why');
          return { idx: RD.__dev.service().instructor.checklist.idx, pair: p ? p.textContent : null, compact: b.classList.contains('ico-compact'), why: !!(w && (w.getClientRects().length || b.classList.contains('ico-compact'))) }; });   // compact (the no-room fallback) hides every why by design
        if (pr.idx !== pairIdx[pk] || !PAIR_RE.test(pr.pair || '') || !pr.why) pairBad.push(JSON.stringify(pr));
      }
      await jump(page, 1);
      var np = await page.evaluate(function () { return !!document.querySelector('#instrCallout .ico-pair'); });
      ck(tag + ': the deciding beats (steps ' + pairIdx.map(function (k) { return k + 1; }).join(', ') + ') draw PRESSURIZER LEVEL | RCS INVENTORY with the reason inline; step 2 draws no pair',
         pairIdx.length >= 2 && pairBad.length === 0 && !np, pairBad.join(' | ') || (pairIdx.length + ' pair steps'));
      await jump(page, pairIdx[0]);
      await page.evaluate(function () { RD.__dev.setDiagMode('realistic'); });
      await page.waitForTimeout(900);
      var pReal = await page.evaluate(function () { var p = document.querySelector('#instrCallout .ico-pair'); return p ? p.textContent : null; });
      await page.evaluate(function () { RD.__dev.setDiagMode('learning'); });
      // ...and points at the strip chart, which the preset makes trace RCS INVENTORY in both modes
      // (a no-instrument series draws truth there), rather than calling it Learning-only (quality pass 2026-10-14)
      ck(tag + ': Hard Rule 1 - in Realistic mode the pair keeps the gauge, drops the true RCS INVENTORY number, and points at the strip chart that still traces it',
         /^PRESSURIZER LEVEL \d+ %/.test(pReal || '') && /RCS INVENTORY: on the strip chart$/.test(pReal) && !/RCS INVENTORY \d/.test(pReal), pReal);
      await page.evaluate(function () { RD.__dev.cmd({ action: 'stop_checklist' }); });
      await page.waitForTimeout(900);
      var cEnd = await page.evaluate(function () { return RD.__dev.chart(); });
      ck(tag + ': ending the walkthrough puts the chart back (not the preset, window back on the speed ladder, on the rung lit before it started)',
         JSON.stringify(cEnd.series) !== JSON.stringify(PRESET) && cEnd.windowAuto === true && cEnd.lit === cEnd.window && cEnd.lit === cPre.lit, JSON.stringify([cPre, cEnd]));   // the player's own rung comes back, not whichever rung the pin left lit (quality pass 2026-10-14)
      await start(page, PROC);
      /* 8. THE BOIL-DOWN IS WATCHED, AND A BRIEF-SWING WARP DROP IS PUT BACK (layman pass 2026-10-14,
       * S-1 and S-2). The pumps step is where the core uncovers: auto pacing runs it at 60x (it ran
       * at 600x, ~5 s of wall for the whole boil-down). Then, with that step's rung forced to 600x in
       * page memory so the WARP path is live, the service's in-loop watch is made to report ONE
       * half-second pressure rate: auto must put 600x back. The same drop reported as a reactor trip
       * is an event, and must stay at 60x. INJECTIONS: drop `wait_speed: 60` from step 9 -> the first
       * check red (600x); delete the re-request in syncCklAutoSpeed -> the second red (stays 60x). */
      async function oneDrop(det) {
        await page.evaluate(function (d) { var sv = RD.__dev.service(), orig = sv._warpWatch, once = true;
          sv._warpWatch = function (sp) { var w = orig.call(this, sp); if (once) { once = false; this._warpWatch = orig; return d; } return w; }; }, det);
        await page.waitForTimeout(1500);
        return page.evaluate(function () { return RD.__dev.service().timeAcceleration; });
      }
      await page.click(BUB + ' .ico-cont').catch(function () {});   // step 1's Continue: releases the walkthrough's own hold, as a player does
      await page.waitForTimeout(600);
      await jump(page, wideIdx);
      await page.waitForTimeout(1500);
      var x9 = await page.evaluate(function () { return RD.__dev.service().timeAcceleration; });
      ck(tag + ': the pumps step (step ' + (wideIdx + 1) + '), where the core uncovers, is paced at 60x, not 600x', x9 === 60, 'x' + x9);
      await page.evaluate(function (k) { RD.__dev.service().instructor.checklist.proc.steps[k].wait_speed = 600; }, wideIdx);
      await page.waitForFunction(function () { return RD.__dev.service().timeAcceleration === 600; }, null, { timeout: 8000 }).catch(function () {});
      var xPre = await page.evaluate(function () { return RD.__dev.service().timeAcceleration; });
      var xRate = await oneDrop('pressure moving 99 psi/s right now (the gauge is damped and shows the trend)');
      var xTrip = await oneDrop('reactor trip');
      await page.evaluate(function (k) { RD.__dev.service().instructor.checklist.proc.steps[k].wait_speed = 60; }, wideIdx);
      ck(tag + ': a WARP drop on a brief pressure rate is put back to the step\'s 600x; a drop on a reactor trip stays at 60x',
         xPre === 600 && xRate === 600 && xTrip === 60, 'before x' + xPre + ', after rate drop x' + xRate + ', after trip drop x' + xTrip);
      await page.evaluate(function () { RD.__dev.cmd({ action: 'stop_checklist' }); });   // leave a fresh leg for what follows
      await page.waitForTimeout(900);
      await start(page, PROC);
    }

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

  // ---------------------------------------------------------------- 9. ROUTE-TRUE TEXT (#670, 2026-10-14)
  /* The keep-injection route (step 6 overtaken, injection on for the whole leg — routes gate
   * keep_injection) drew step 7's "Injection stays off" and the recap's "Injection was stopped". Here
   * step 6 is marked overtaken in the live checklist and the card and recap are read back.
   * INJECTIONS (2026-10-14): delete step 7's `route_alt` -> the first check red ("Injection stays
   * off"); drop the `ico-over` line in cklCalloutFill -> the first check red; delete the leg's
   * `route_alt` -> the second check red ("Injection was stopped" on the keep route). */
  var K = await session({ width: 1366, height: 768 });
  await start(K.page, PROC);
  await K.page.evaluate(function () {
    RD.__dev.service().instructor.checklist.doneBy[5] = 'overtaken';
  });
  await jump(K.page, 6);
  await K.page.evaluate(function () {   // the instructor's line the overtake raised (set after the jump: a step change may retire it)
    var t = RD.__dev.service().instructor.checklist.proc.steps[5].overtaken.text;
    RD.__dev.service().instructor.pendingMessage = { learning: t, industry: t };
  });
  await K.page.waitForTimeout(900);
  var kc = await K.page.evaluate(function () {
    var tips = [].map.call(document.querySelectorAll('#instrCallout .ico-tip'), function (x) { return x.textContent; });
    return { idx: RD.__dev.service().instructor.checklist.idx, tips: tips };
  });
  ck('keep-injection route: step 7\'s card says why step 6 was overtaken and that injection is still on (not "Injection stays off")',
     kc.idx === 6 && kc.tips.some(function (t) { return /^Skipped step 6 \(injection left on: RCS INVENTORY below 80 % anyway\)$/.test(t); }) &&
     kc.tips.some(function (t) { return /Injection is still on\.$/.test(t); }) && !kc.tips.some(function (t) { return /Injection stays off/.test(t); }), JSON.stringify(kc));
  async function recap(by) {
    await K.page.evaluate(function (b) { var c = RD.__dev.service().instructor.checklist; c.doneBy[5] = b; c.complete = true; }, by);
    await K.page.waitForTimeout(900);
    return K.page.evaluate(function () { var e = document.querySelector('#cklRun .ckl-complete'); return e ? e.textContent : null; });
  }
  var rKeep = await recap('overtaken'), rStop = await recap('auto');
  ck('the recap follows the route: keep-injection says injection stayed on; the STOP route says it was stopped',
     /You kept injection on/.test(rKeep || '') && !/Injection was stopped/.test(rKeep || '') && /Injection was stopped/.test(rStop || '') && !/You kept injection on/.test(rStop || ''),
     JSON.stringify([(rKeep || '').slice(340, 520), (rStop || '').slice(340, 520)]));
  await K.ctx.close();

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
  var dc0 = await D.page.evaluate(function () { return RD.__dev.chart(); });
  await start(D.page, other);
  var od = await geom(D.page);
  var dc1 = await D.page.evaluate(function () { return RD.__dev.chart(); });
  ck('another walkthrough (' + other + ') leaves the strip chart alone (no preset, no pin)', JSON.stringify(dc0) === JSON.stringify(dc1), JSON.stringify([dc0, dc1]));
  ck('another walkthrough (' + other + ') with nothing set: no card, its step card shows, no progress list', !od.shown && od.colStepShown && od.prog === 0, JSON.stringify(od));
  await D.ctx.close();
  var O = await session({ width: 1366, height: 768 }, '&callout=0');
  await start(O.page, PROC);
  var oo = await geom(O.page);
  ck('TMI with the player\'s Off (?callout=0): no card, the step card shows', !oo.shown && oo.colStepShown && oo.prog === 0, JSON.stringify(oo));
  await O.ctx.close();

  // ---------------------------------------------------------------- 10. THE GENERAL PAIR (2026-10-14, one relationship per leg)
  /* `pair: [idA, idB]` draws two strip-chart series as one line under the ACTIVE step in the side panel
   * (non-callout legs). A SYNTHETIC step is stamped onto a leg that has none; the direction words are
   * driven through RD.CklPairRow with hand-built snapshots so they are deterministic. `pair: true` is
   * pinned to its exact TMI-2 string. INJECTIONS (2026-10-14): drop the `data-ckl-pair` placeholder in the
   * step render -> the panel check red; make cklPairSeries read the newest sample instead of the trailing
   * window (H[0] -> H[H.length-1]) -> the direction check red; skip the `cklSerHist` reset on a new key ->
   * the step-change check red; route `pair: true` through cklPairSeries -> the byte-for-byte check red. */
  var G = await session({ width: 1366, height: 768 });
  var gOther = await G.page.evaluate(function () {
    return (RD.MANUAL_PROCEDURES.pwr2 || []).filter(function (p) { return !p.callout && p.from === 'hot_full_power' && p.steps.length > 2; }).map(function (p) { return p.id; })[0];
  });
  await G.page.evaluate(function (id) {
    var pr = RD.MANUAL_PROCEDURES.pwr2.filter(function (p) { return p.id === id; })[0];
    pr.steps[1].pair = ['tavg', 'tavg_tref_dev'];
  }, gOther);
  await start(G.page, gOther);
  await jump(G.page, 1);
  await G.page.evaluate(function () { RD.__dev.service().timeAcceleration = 10; });   // 5 plant-s of history for a direction
  await G.page.waitForTimeout(2500);
  var gp = await G.page.evaluate(function () {
    var e = document.querySelector('#cklRun [data-ckl-pair]');
    return { txt: e ? e.textContent : null, shown: !!(e && e.getClientRects().length), card: !!document.querySelector('#instrCallout:not([hidden])') };
  });
  ck('side panel: a step with pair [tavg, tavg_tref_dev] draws ONE line under the active step, two chart-series labels, each with a direction',
     gp.shown && !gp.card && /^TAVG .+ {2}\| {2}TAVG . TREF .+$/i.test(gp.txt || '') && ((gp.txt || '').match(/rising|falling|steady/g) || []).length === 2, JSON.stringify(gp));
  var gd = await G.page.evaluate(function () {
    function snap(t, tv, dv) { return { metadata: { sim_time: t }, instruments: { tavg: tv, tavg_tref_dev: dv }, true_state: { tavg_c: tv, tref_c: tv - dv, plant_mode: 1 }, control_state: {} }; }
    var P = ['tavg', 'tavg_tref_dev'], out = {};
    function run(key, a, b) { RD.CklPairRow(snap(0, a[0], a[1]), key, P); return RD.CklPairRow(snap(10, b[0], b[1]), key, P); }
    out.up = run('g-up', [300, 0], [305, 3]); out.flat = run('g-flat', [300, 0], [300, 0]); out.down = run('g-dn', [310, 3], [300, 0]);
    RD.CklPairRow(snap(0, 300, 0), 'g-chg', P); RD.CklPairRow(snap(10, 305, 3), 'g-chg', P);
    out.fresh = RD.CklPairRow(snap(11, 305, 3), 'g-chg2', P);      // a new key (step change) starts from nothing
    RD.CklPairRow(snap(0, 300, 0), 'g-rw', P); RD.CklPairRow(snap(10, 305, 3), 'g-rw', P);
    out.rew = RD.CklPairRow(snap(2, 305, 3), 'g-rw', P);           // the clock went back inside the step
    var ts = { metadata: { sim_time: 5 }, instruments: { pzr_level: 50.4 }, true_state: { core_inventory_pct: 80.2 }, control_state: {} };
    out.t1 = RD.CklPairRow(ts, 'g-t1', true); out.t2 = RD.CklPairRow(ts, 'g-t2');
    return out;
  });
  var dirs = function (t) { return ((t || '').match(/rising|falling|steady/g) || []).join(','); };
  ck('direction words follow the trailing change: rising / steady / falling for a +5 / 0 / -10 degC move over 10 s',
     dirs(gd.up) === 'rising,rising' && dirs(gd.flat) === 'steady,steady' && dirs(gd.down) === 'falling,falling', JSON.stringify([gd.up, gd.flat, gd.down]));
  ck('the pair clears on a step change (new key: no direction on a lone sample) and on a rewind (clock goes back)',
     dirs(gd.fresh) === '' && dirs(gd.rew) === '', JSON.stringify([gd.fresh, gd.rew]));
  ck('pair: true is unchanged byte for byte (PRESSURIZER LEVEL | RCS INVENTORY), with or without the spec argument',
     gd.t1 === 'PRESSURIZER LEVEL 50 %  |  RCS INVENTORY 80 %' && gd.t2 === gd.t1, JSON.stringify([gd.t1, gd.t2]));
  await jump(G.page, 0);
  await G.page.waitForTimeout(900);
  var gc = await G.page.evaluate(function () { return !!document.querySelector('#cklRun [data-ckl-pair]'); });
  ck('the side-panel line is gone when the active step authors no pair (step change)', !gc, String(gc));
  await G.ctx.close();

  // ---------------------------------------------------------------- 11. AN IMPLIED TICK IS DRAWN AS ONE (#670 review, 2026-10-14)
  /* Step 9's relation row carries `implied_by: 'subcooling_c'` for the late-AFW player (routes afw_late: the drain
   * happened on step 8; MEASURED there, the row latches by implication at 17.75 plant-min with PRESSURIZER LEVEL
   * reading 74 %). The card drew a plain ✓ beside "...while PRESSURIZER LEVEL still reads 90 % or more". Here the
   * RUNTIME takes the implied latch for real: the SUBCOOLING MARGIN row's threshold is opened so it latches at
   * once, and the relation row (600 s window) cannot latch on its own in the seconds this waits.
   * INJECTION (2026-10-14): delete the `if (r.implied) return ...` line in cklCalloutFill -> this check red
   * (the row draws '✓ RCS INVENTORY...'). */
  var M = await session({ width: 1366, height: 768 });
  await start(M.page, PROC);
  await M.page.evaluate(function () { RD.__dev.service().instructor.checklist.proc.steps[8].accs[1].v = 1e6; });
  await jump(M.page, 8);
  await M.page.waitForTimeout(900);
  var mi = await M.page.evaluate(function () {
    var sv = RD.__dev.service(), c = sv.instructor.checklist;
    var rows = [].map.call(document.querySelectorAll('#instrCallout .ico-crit'), function (x) { return { cls: x.className, txt: x.textContent }; });
    return { idx: c.idx, rows: rows };
  });
  var r0 = mi.rows[0] || {};
  ck('step 9: a row latched by its implied_by sibling draws as covered (↳ + "Covered by SUBCOOLING MARGIN..."), not a plain ✓',
     mi.idx === 8 && /\bimplied\b/.test(r0.cls || '') && /^↳ RCS INVENTORY/.test(r0.txt || '') &&
     /Covered by SUBCOOLING MARGIN pegged at -50 °F — not checked on its own\.$/.test(r0.txt || '') &&
     !mi.rows.some(function (r) { return /^✓ RCS INVENTORY/.test(r.txt); }), JSON.stringify(mi));
  await M.ctx.close();

  await browser.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
