/* verify_ckl_focus.js — the walkthrough's board focus and card kinds, in a real browser.
 *
 * *(OWNER playtest of pwr_tmi2_meltdown, 2026-11-13: "it should dim non-essential parts of the
 * diagram" · "Needs a small caution tag hanging over the AFW valve" · "events and player actions need
 * a better visual differentiator" · "The glow should be around the outline of the actual object ie
 * reactor instead of the card the part sits on.")*
 *
 * LAYER: browser (Chromium via Playwright, file://). What is asserted is what is DRAWN: computed
 * opacity, computed box-shadow, the tag's rectangle against the valve's. The opt-in fields
 * (`scope`, `tag`, `step_kinds`, `ahead_label`) are set on the leg IN PAGE MEMORY, so this gate does
 * not depend on which steps the content authors them on; the control run before them is the leg as
 * shipped with the fields REMOVED, and asserts none of it shows.
 *
 * The service-side fields (`inject_delay_s`, `act_pause_s`) are run_checklist section 12; the card's
 * held line is checked here because only a browser draws it.
 *
 * INJECTIONS (2026-11-13; each applied, this file run, reverted — reds listed by check number):
 *   ui/app.js renderScope: `var cs = cklStepScope(s)` -> `null`                    -> 2, 3, 9
 *   ui/app.js: the `cklTagA.st.tag` branch made `false &&`                         -> 4
 *   ui/app.js: `kindCls` forced ''                                                 -> 5, 11
 *   ui/app.js cklSyncSil: the setStepOutlines call removed                         -> 7, 8, 10
 *   pwr_board.css: the two `.bd-halo.bd-halo-sil` paint rules removed              -> 8
 *   pwr_board.js setScope: the `spec.tag` seed removed                             -> 3
 *   ui/app.js: the `.ckl-held` line's `ck.act_hold` test made `false`              -> 12
 *   ui/app.js: `st.ahead_label ||` removed                                         -> 6
 *   pwr_board.css: `.bd-focus-sil *` pointer-events rule narrowed back to `> *`    -> 13 (the clone takes the valve's click)
 *   instructor_layer.js handleCommand: the act-hold release removed                -> 13
 */
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var BASE = 'file:///' + path.join(ROOT, 'ui', 'shell.html').replace(/\\/g, '/') + '?engine=pwr2&init=hot_full_power&dev=1&callout=0';
var LEG = 'pwr_tmi2_meltdown', VALVE = 'imrpp2g2m8k';
var pass = 0, fail = 0;
function ck(name, ok, detail) {
  ok ? pass++ : fail++;
  console.log((ok ? '\x1b[32mPASS' : '\x1b[31mFAIL') + '\x1b[0m  ' + name + (detail != null ? '\x1b[2m   (' + detail + ')\x1b[0m' : ''));
}

(async function () {
  var playwright = require('playwright');
  var browser = await playwright.chromium.launch({ headless: true });
  var ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  var page = await ctx.newPage();
  page.on('pageerror', function (e) { console.log('pageerror: ' + e.message); });
  await page.goto(BASE);
  await page.waitForSelector('#mainMenuBtn');
  if (await page.isVisible('#missionOverlay')) await page.click('#missionClose');

  async function start() {
    await page.evaluate(function (p) {
      var s = RD.__dev.service(); s.attentionStops = false;
      var b = document.createElement('button'); b.setAttribute('data-ckl-start', p); document.body.appendChild(b); b.click(); b.remove();
    }, LEG);
    await page.waitForFunction(function (p) { var c = RD.__dev.service().instructor.checklist; return !!(c && c.proc && c.proc.id === p); }, LEG, { timeout: 15000 });
    await page.waitForTimeout(900);
  }
  // Move to step k (0-based) the way verify_tmi_callout's jump does: a step change, with its clears.
  async function jump(k) {
    await page.evaluate(function (i) {
      var sv = RD.__dev.service(), c = sv.instructor.checklist;
      delete c.proc.steps[i].overtaken;
      c.idx = i; c.paused = false; c.awaitingAck = false; c.stepAt = null; c.accsState = null; c.cmdSeen = false;
      c.actAsk = null; c.actHold = false; c.enterT = null;
      RD.__dev.cmd({ action: 'noop_redraw' });
    }, k).catch(function () {});
    await page.evaluate(function () { var sv = RD.__dev.service(); if (!sv.running) sv.start(); });
    await page.waitForFunction(function (i) { var e = document.querySelector('#cklRun .ckl-step.ckl-active'); return e && +e.getAttribute('data-ckl-step') === i; }, k, { timeout: 8000 }).catch(function () {});
    await page.waitForTimeout(700);
  }
  function read() {
    return page.evaluate(function (valve) {
      var B = RD.PwrBoard, stage = document.querySelector('.pwr-board-stage');
      var tiles = stage.querySelectorAll(':scope > .bd-tile'), dim = 0, lit = 0, ringedDim = [];
      tiles.forEach(function (t) {
        var d = +getComputedStyle(t).opacity < 0.9;
        d ? dim++ : lit++;
        if (d && t.querySelector(':scope > .bd-halo.ckl-step-glow, :scope > .bd-halo.ckl-watch-glow, :scope > .bd-halo.ckl-check-glow, :scope > .bd-halo.ckl-panel-glow')) ringedDim.push(t.getAttribute('data-item'));
      });
      var vt = B.tileFor(valve), g = vt.querySelector('.bd-maint-tag'), shown = !!(g && g.style.display !== 'none');
      var vr = vt.getBoundingClientRect(), gr = shown ? g.getBoundingClientRect() : null, ov = 0;
      if (gr) { var w = Math.min(gr.right, vr.right) - Math.max(gr.left, vr.left), h = Math.min(gr.bottom, vr.bottom) - Math.max(gr.top, vr.top); ov = (w > 0 && h > 0) ? (w * h) / (vr.width * vr.height) : 0; }
      var ols = {}, st = B.stepOutlineState();
      [].forEach.call(stage.querySelectorAll('.bd-step-ol'), function (o) {
        var cs = getComputedStyle(o);
        ols[o.getAttribute('data-focus-item')] = { kind: st[o.getAttribute('data-focus-item')], anim: cs.animationName, opacity: +cs.opacity, w: o.getBoundingClientRect().width };
      });
      var silHalo = [].map.call(stage.querySelectorAll('.bd-halo.bd-halo-sil'), function (h) {
        return { id: h.parentNode.getAttribute('data-item'), glow: /ckl-(step|watch|check)-glow/.test(h.className), shadow: getComputedStyle(h).boxShadow };
      });
      var rectHalo = [].map.call(stage.querySelectorAll('.bd-halo.ckl-watch-glow:not(.bd-halo-sil)'), function (h) { return getComputedStyle(h).boxShadow !== 'none'; });
      var act = document.querySelector('#cklRun .ckl-step.ckl-active');
      var kind = act && act.querySelector('.ckl-kind'), ah = act && act.querySelector('.ckl-ahead > span'), held = act && act.querySelector('.ckl-held');
      var c = RD.__dev.service().instructor.checklist;
      return { dimming: stage.classList.contains('bd-dimming'), dim: dim, lit: lit, ringedDim: ringedDim,
        valveOpacity: +getComputedStyle(vt).opacity, tag: shown, tagText: shown ? g.textContent : null, tagCompact: shown && g.classList.contains('bd-tag-compact'),
        tagW: gr ? gr.width : 0, tagH: gr ? gr.height : 0, valveW: vr.width, tagOverValve: +ov.toFixed(3),
        ols: ols, silHalo: silHalo, rectHaloPainted: rectHalo,
        kind: kind ? kind.textContent : null, rule: act ? getComputedStyle(act).borderLeftStyle : null, ahead: ah ? ah.textContent : null,
        held: held ? held.textContent : null, idx: c ? c.idx : -1 };
    }, VALVE);
  }

  // ---------------------------------------------------------------- control: the leg with none of the fields
  await page.evaluate(function (id) {
    var L = RD.MANUAL_PROCEDURES.pwr2.filter(function (p) { return p.id === id; })[0];
    delete L.scope; delete L.step_kinds;
    L.steps.forEach(function (s) { delete s.scope; delete s.tag; delete s.ahead_label; delete s.act_pause_s; delete s.inject_delay_s; (s.accs || []).forEach(function (a) { delete a.act_pause_s; }); });
  }, LEG);
  await start();
  var c0 = await read();
  ck('1. CONTROL — a leg that authors none of the fields: no dimming, no tag, no kind chip, solid rule',
     !c0.dimming && c0.dim === 0 && !c0.tag && c0.kind == null && c0.rule === 'solid',
     JSON.stringify({ dimming: c0.dimming, dim: c0.dim, tag: c0.tag, kind: c0.kind, rule: c0.rule }));
  await page.evaluate(function () { RD.__dev.cmd({ action: 'stop_checklist' }); });
  await page.waitForTimeout(500);

  // ---------------------------------------------------------------- the fields, in page memory
  await page.evaluate(function (id) {
    var L = RD.MANUAL_PROCEDURES.pwr2.filter(function (p) { return p.id === id; })[0];
    L.step_kinds = true;
    L.scope = [];                          // leg default: dim everything but what the step rings
    L.steps[0].tag = true;
    L.steps[0].ahead_label = 'Watch for';
    L.steps[8].scope = ['Steam Generator'];
    L.steps[6].scope = false;
  }, LEG);
  await start();
  var a = await read();
  ck('2. `scope` (leg default []): the board is dimmed, more tiles dimmed than lit, and nothing the step rings is dimmed',
     a.dimming && a.dim > a.lit && a.lit >= 3 && a.ringedDim.length === 0,
     a.dim + ' dimmed / ' + a.lit + ' lit; ringed-but-dimmed [' + a.ringedDim.join(',') + ']');
  ck('3. `tag` + `scope`: the tagged valve stays lit under the dimming',
     a.dimming && a.valveOpacity > 0.9, 'valve tile opacity ' + a.valveOpacity);
  ck('4. `tag: true`: a compact tag reading CAUTION is on the AFW block valve, narrower than 1.2 valve-widths, covering under 20 % of the valve',
     a.tag && a.tagCompact && a.tagText === 'CAUTION' && a.tagW > 0 && a.tagW < 1.2 * a.valveW && a.tagOverValve < 0.2,
     JSON.stringify({ text: a.tagText, compact: a.tagCompact, tagW: +a.tagW.toFixed(1), valveW: +a.valveW.toFixed(1), cover: a.tagOverValve }));
  ck('5. `step_kinds`: step 1 asks for no press — chip "Watch", dashed rule',
     a.kind === 'Watch' && a.rule === 'dashed', a.kind + ' / ' + a.rule);
  ck('6. `ahead_label` replaces the forecast heading on its step',
     a.ahead === 'Watch for', String(a.ahead));

  await jump(8);   // step 9: hl_watch names Reactor Vessel (component art) and two cards
  var b = await read();
  var rv = b.ols.reactorVessel, rvHalo = b.silHalo.filter(function (h) { return h.id === 'reactorVessel'; })[0];
  ck('7. a WATCHED component is outlined on its own art: a standing, steady silhouette on the reactor vessel',
     !!rv && rv.kind === 'watch' && rv.anim === 'none' && rv.opacity > 0.9 && rv.w > 20, JSON.stringify(rv || null));
  ck('8. ...its rectangular halo keeps its glow class and paints nothing, while a watched CARD keeps its rectangle',
     !!rvHalo && rvHalo.glow && rvHalo.shadow === 'none' && b.rectHaloPainted.length >= 1 && b.rectHaloPainted.every(Boolean),
     JSON.stringify({ vesselHalo: rvHalo || null, cardRings: b.rectHaloPainted }));
  ck('9. a step\'s own `scope` names un-dim context without a ring (Steam Generator lit, not outlined), and no tag on an untagged step',
     b.dimming && !b.tag && !b.ols.steamGenerator && (await page.evaluate(function () { return +getComputedStyle(RD.PwrBoard.tileFor('steamGenerator')).opacity; })) > 0.9,
     'dimming ' + b.dimming + ', tag ' + b.tag + ', outlined [' + Object.keys(b.ols).join(',') + ']');

  await jump(6);   // step 7: hl is the AFW block valve (art, a PRESS); `scope: false` on this step
  var d = await read();
  var vo = d.ols[VALVE];
  ck('10. a component the step asks you to PRESS pulses on its outline (bdStepSil), and `scope: false` lifts the dimming for that step',
     !!vo && vo.kind === 'press' && vo.anim === 'bdStepSil' && !d.dimming && d.dim === 0, JSON.stringify({ valve: vo || null, dimming: d.dimming, dim: d.dim }));
  ck('11. `step_kinds`: step 7 asks for a press — chip "Your action", solid rule',
     d.kind === 'Your action' && d.rule === 'solid', d.kind + ' / ' + d.rule);

  // the held line: take the hold the way the instructor does, on this step's own press row
  await page.evaluate(function () {
    var sv = RD.__dev.service(), c = sv.instructor.checklist;
    c.proc.steps[6].accs[0].act_pause_s = 1;
    c.proc.steps[6].accs[0].ask = 'Click the valve symbol above the AFW card.';
    c.actAsk = null;
  });
  await page.waitForFunction(function () { var c = RD.__dev.service().instructor.checklist; return c.actHold && !RD.__dev.service().running; }, null, { timeout: 8000 }).catch(function () {});
  await page.waitForTimeout(500);
  var hd = await read();
  var t1 = await page.evaluate(function () { return RD.__dev.service().simTime; });
  ck('12. `act_pause_s`: the clock stops and the card says so in one line naming the press',
     /^The clock is stopped until you do this: Click the valve symbol above the AFW card\.$/.test(hd.held || ''), String(hd.held));
  // the press, on the BOARD, with the clock held
  var vb = await page.evaluate(function (id) { var r = RD.PwrBoard.tileFor(id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, VALVE);
  await page.evaluate(function () { var sv = RD.__dev.service(), real = sv.handleCommand.bind(sv); window.__seen = []; sv.handleCommand = function (c) { window.__seen.push(c && c.action + (c.open != null ? ':' + c.open : '')); return real(c); }; });
  var under = await page.evaluate(function (pt) { var el = document.elementFromPoint(pt.x, pt.y); return el ? (el.localName + '.' + (el.getAttribute('class') || '')) : null; }, vb);
  await page.mouse.click(vb.x, vb.y);
  await page.waitForTimeout(900);
  var seen = await page.evaluate(function () { return window.__seen; });
  var af = await page.evaluate(function () { var sv = RD.__dev.service(), c = sv.instructor.checklist; return { hold: !!c.actHold, run: sv.running, t: sv.simTime, row: !!(c.accsState && c.accsState[0] && c.accsState[0].met), line: !!document.querySelector('#cklRun .ckl-held') }; });
  ck('13. a BOARD press made with the clock held is delivered and graded, the hold lets go, the clock runs and the line is gone',
     !af.hold && af.run && af.row && af.t > t1 && !af.line, JSON.stringify(af) + ' from sim ' + t1.toFixed(1) + '; commands the click sent [' + seen.join(',') + '], element under the pointer ' + under);

  await page.evaluate(function () { RD.__dev.cmd({ action: 'stop_checklist' }); });
  await page.waitForTimeout(700);
  var e = await read();
  ck('14. ending the walkthrough lifts all of it: no dimming, no outlines, no tag',
     !e.dimming && e.dim === 0 && Object.keys(e.ols).length === 0 && !e.tag && e.silHalo.length === 0,
     JSON.stringify({ dimming: e.dimming, dim: e.dim, ols: Object.keys(e.ols), tag: e.tag }));

  await browser.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
