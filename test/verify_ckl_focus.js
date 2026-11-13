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
 * `beat_s`, `say`, the spotlight, `idea` / `ideas` (2026-11-13, same method):
 *   render: the `cklBeatSync(s)` call removed                                      -> 15, 16, 17, 18, 20, 21, 22
 *   cklBeatSync: the queue filled in reverse row order                             -> 16
 *   cklBeatSync: a row's own `beat_s` ignored (step value only)                    -> 16
 *   the row text: `(beatNow && en.say) ||` removed                                 -> 17
 *   renderScope: the `cklBeatSpot` branch made `if (false)`                        -> 18
 *   cklSubstepHl: the beat row's own lists not taken                               -> 18
 *   cklBeatStart: `cklBeat.row = -1` dropped at the end of the queue               -> 16, 19
 *   syncPlayBtn: `&& !beatOnly` dropped from the paused class                      -> 20
 *   syncPlayBtn: the rung cleared on a beat's pause again                          -> 20 (see the run below)
 *   cklBeatSync: no cancel on a step change                                        -> 21, 22
 *   the beat timer's body removed (never releases)                                 -> 15, 16, 17, 18
 *   the idea block made `if (false)`                                               -> 23
 *   the idea's range test dropped                                                  -> 24
 *   the finished card's ideas list made `if (false)`                               -> 25
 * `why_fold` and the alarm panel (2026-11-13):
 *   cklWhyFolded made to return false                                              -> 26, and the run stops there (no line to click)
 *   renderChecklist: focus not put back on the rebuilt line                        -> 27
 *   cklWhyFolded: the `st.idea` test dropped (folds every step of a `why_fold` leg) -> 30
 *   the fold's click handler: the toggle of `cklWhyOpenKey` removed                -> 27
 *   the render key's `wf` term removed (the click does not redraw)                 -> 27
 *   cklDimAlarms made a no-op                                                      -> 29
 *   cklDimAlarms called with `true` always                                         -> 1, 30, 14
 *   shell.css: the `:hover` / `:focus-within` restore removed                      -> 29
 * Pause during a beat (critic M-1, 2026-11-13):
 *   the play handler's `|| beatOnlyNow` removed (a beat reads as paused, so the press plays) -> 31, 32
 * NOT RED ALONE: syncSpeedUI's `k !== 'beat'` reverted to "any hold" — with syncPlayBtn no longer
 * dropping `lastSpeedSync` on a beat, that repaint does not run during one. Kept as the second guard.
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
        idea: (function () {
          var b = act && act.querySelector('.ckl-idea'); if (!b) return null;
          var txt = act.querySelector('.ckl-txt'), next = act.querySelector('.ckl-crit, .ckl-ahead, .ckl-why, .ckl-ack-row');
          var t = b.querySelector('.ckl-idea-t'), bg = act.querySelector('.ckl-why') || txt;
          return { h: b.querySelector('.ckl-idea-h').textContent, t: t.textContent, x: (b.querySelector('.ckl-idea-x') || {}).textContent || null,
            afterText: !!(txt && (txt.compareDocumentPosition(b) & 4)), beforeRest: !next || !!(b.compareDocumentPosition(next) & 4),
            titlePx: parseFloat(getComputedStyle(t).fontSize), titleWeight: +getComputedStyle(t).fontWeight, otherPx: parseFloat(getComputedStyle(bg).fontSize) };
        })(),
        why: (function () {
          var w = act && act.querySelector('.ckl-why'); if (!w) return null;
          var tg = w.querySelector('[data-ckl-whyfold]'), bd = w.querySelector('.ckl-why-body');
          return { fold: w.classList.contains('ckl-why-fold'), expanded: tg ? tg.getAttribute('aria-expanded') : null, body: bd ? bd.textContent : null,
            button: !!tg && tg.localName === 'button', focused: !!tg && document.activeElement === tg, text: w.textContent };
        })(),
        alarmDim: document.querySelector('.alarm-panel').classList.contains('ckl-dimmed'),
        stackOpacity: +getComputedStyle(document.querySelector('.alarm-stack')).opacity,
        titleOpacity: +getComputedStyle(document.getElementById('alarmTitle')).opacity,
        held: held ? held.textContent : null, idx: c ? c.idx : -1 };
    }, VALVE);
  }

  // ---------------------------------------------------------------- control: the leg with none of the fields
  await page.evaluate(function (id) {
    var L = RD.MANUAL_PROCEDURES.pwr2.filter(function (p) { return p.id === id; })[0];
    delete L.scope; delete L.step_kinds; delete L.ideas; delete L.why_fold;
    L.steps.forEach(function (s) { delete s.why_fold; delete s.idea; delete s.idea_text; delete s.beat_s; delete s.scope; delete s.tag; delete s.ahead_label; delete s.act_pause_s; delete s.inject_delay_s; (s.accs || []).forEach(function (a) { delete a.act_pause_s; }); });
  }, LEG);
  await start();
  var c0 = await read();
  ck('1. CONTROL — a leg that authors none of the fields: no dimming, no tag, no kind chip, solid rule',
     !c0.dimming && c0.dim === 0 && !c0.tag && c0.kind == null && c0.rule === 'solid' && c0.idea == null && !c0.alarmDim && c0.stackOpacity === 1 && !!c0.why && !c0.why.fold,
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
    L.ideas = ['Heat with nowhere to go', 'Level is not inventory'];
    L.steps[0].idea = 2; L.steps[0].idea_text = 'The pressurizer can read full while the plant drains.';
    L.steps[8].idea = 7;                   // out of range: draws nothing
    L.why_fold = true;                     // Background folds on the steps that carry an `idea`
    L.steps[8].scope = ['Steam Generator'];
    L.steps[6].scope = false; delete L.steps[6].idea;
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

  ck('23. `idea`: the step carries a KEY IDEA block under its instruction line and above everything else: "Key idea 2 of 2", the leg\'s title, the step\'s text, in the card\'s largest type',
     !!a.idea && a.idea.h === 'Key idea 2 of 2' && a.idea.t === 'Level is not inventory' && a.idea.x === 'The pressurizer can read full while the plant drains.' &&
     a.idea.afterText && a.idea.beforeRest && a.idea.titleWeight >= 700 && a.idea.titlePx > a.idea.otherPx, JSON.stringify(a.idea));
  // `why_fold`: Background behind a disclosure on an idea step, opened by click, closed by Enter, closed again on the next step
  var whyWant = await page.evaluate(function (id) { return RD.MANUAL_PROCEDURES.pwr2.filter(function (p) { return p.id === id; })[0].steps[0].why; }, LEG);
  ck('26. `why_fold`: on a step that carries an `idea`, Background is one focusable line and its text is not drawn',
     !!a.why && a.why.fold && a.why.button && a.why.expanded === 'false' && a.why.body == null && a.why.text.indexOf(whyWant.slice(0, 30)) === -1,
     JSON.stringify(a.why));
  await page.click('#cklRun [data-ckl-whyfold]');
  await page.waitForTimeout(250);
  var wo = (await read()).why;
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  var wc = (await read()).why;
  ck('27. ...a click opens it (the full text, aria-expanded true, focus kept on the line) and Enter from the keyboard closes it',
     !!wo && wo.expanded === 'true' && wo.body === whyWant && wo.focused && !!wc && wc.expanded === 'false' && wc.body == null,
     JSON.stringify({ opened: wo && wo.expanded, bodyMatches: !!wo && wo.body === whyWant, focused: wo && wo.focused, afterEnter: wc && wc.expanded }));
  await page.click('#cklRun [data-ckl-whyfold]');   // left OPEN on this step, to prove the next one arrives closed
  // the alarm panel dims with the board
  await page.mouse.move(400, 400);
  await page.waitForTimeout(700);
  var al1 = await read();
  await page.hover('.alarm-stack');
  await page.waitForTimeout(700);
  var al2 = await read();
  await page.mouse.move(400, 400);
  ck('29. under a step\'s `scope` the alarm STACK dims to the board\'s 0.38, its header and count stay at full strength, and it comes back under the pointer',
     al1.alarmDim && Math.abs(al1.stackOpacity - 0.38) < 0.02 && al1.titleOpacity === 1 && al2.stackOpacity === 1,
     JSON.stringify({ dimClass: al1.alarmDim, stack: al1.stackOpacity, title: al1.titleOpacity, hovered: al2.stackOpacity }));
  await jump(8);   // step 9: hl_watch names Reactor Vessel (component art) and two cards
  var b = await read();
  ck('28. ...and the fold is closed again on the next step that has one (it was left open on step 1)',
     !!b.why && b.why.fold && b.why.expanded === 'false' && b.why.body == null, JSON.stringify(b.why));
  ck('24. ...and a step without a valid `idea` draws none (step 9 here: `idea: 7` of 2)', b.idea == null && b.idx === 8, JSON.stringify(b.idea));
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
  ck('30. a step without an `idea` keeps Background open as ruled, and with `scope: false` the alarm panel is not dimmed',
     !!d.why && !d.why.fold && d.why.text.length > 30 && !d.alarmDim && d.stackOpacity === 1, JSON.stringify({ why: d.why && { fold: d.why.fold, len: d.why.text.length }, alarmDim: d.alarmDim, stack: d.stackOpacity }));
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

  // ---------------------------------------------------------------- `beat_s`: events that land together, one at a time
  /* *(OWNER, 2026-11-13: "the events that happened within seconds of each other can you somehow delay them so
   * that they happen a few seconds after each other instead of all at once not an actual slow motion" · "Should
   * we consider dimming the board for a few seconds to show the important parts of what's happening in the
   * moment?")* A step is given three rows in page memory, all unmeetable; two are then made true TOGETHER, so
   * they tick on one broadcast. Sampled every 40 ms from inside the page. */
  async function armBeat(k, sA, sStep) {
    await page.evaluate(function (o) {
      var st = RD.__dev.service().instructor.checklist.proc.steps[o.k];
      ['pause_on_met', 'pause', 'inject', 'clear', 'cmd', 'hl', 'saw', 'overtaken', 'act_pause_s', 'inject_delay_s', 'accs_ordered', 'tag', 'wait_speed', 'acc'].forEach(function (f) { delete st[f]; });
      st.scope = ['Steam Generator']; st.beat_s = o.sStep;   // one piece of un-ringed context, which the spotlight must drop
      st.hl_watch = ['ECCS', 'Plant Pressure', 'Pressurizer Level'];
      st.accs = [{ p: 'power_pct', op: '>', v: 9e9, label: 'event A', say: 'The first thing happens.', beat_s: o.sA },   // no targets of its own
                 { p: 'power_pct', op: '>', v: 9e9, label: 'event B', hl_watch: ['Plant Pressure'] },             // its own target: the spotlight
                 { p: 'power_pct', op: '>', v: 9e9, label: 'never' }];
    }, { k: k, sA: sA, sStep: sStep });
    await jump(k);
  }
  function sampler() {
    return page.evaluate(function () {
      window.__bt = [];
      /* the rung going dark for ONE FRAME is invisible to a 40 ms sampler six times in seven (measured), so
       * every class change on the speed bar is watched: a moment with the clock held by a beat and no rung lit counts */
      window.__dark = 0;
      if (window.__mo) window.__mo.disconnect();
      window.__mo = new MutationObserver(function () {
        if (RD.__dev.holds().join('+') === 'beat' && !document.querySelector('#speed [data-speed].on')) window.__dark++;
      });
      window.__mo.observe(document.getElementById('speed'), { attributes: true, attributeFilter: ['class'], subtree: true });
      window.__btI = setInterval(function () {
        var sv = RD.__dev.service(), c = sv.instructor.checklist, now = document.querySelector('#cklRun .ckl-crit-now');
        var rows = now ? [].slice.call(now.parentNode.querySelectorAll('.ckl-crit')) : [];
        var txt = now ? now.textContent.replace(/^now/, '').replace(/^\S*[✓○·↳]\s*/, '').trim() : null;
        var play = document.getElementById('playBtn');
        window.__bt.push({ w: performance.now(), run: sv.running, t: sv.simTime, idx: c ? c.idx : -1, x: sv.timeAcceleration,
          row: now ? rows.indexOf(now) : -1, txt: txt, holds: RD.__dev.holds().join('+'),
          sg: RD.PwrBoard.scopeState().lit.indexOf('steamGenerator') >= 0, lit: RD.PwrBoard.scopeState().lit.length, dimming: RD.PwrBoard.scopeState().dimming,
          rings: document.querySelectorAll('#viewArea .bd-halo.ckl-watch-glow').length,
          rung: !!document.querySelector('#speed [data-speed].on'), playPaused: play.classList.contains('paused') });
      }, 40);
    });
  }
  function fire() { return page.evaluate(function () { var a = RD.__dev.service().instructor.checklist; a = a.proc.steps[a.idx].accs; a[0].v = -1; a[1].v = -2; }); }
  await armBeat(3, 1.5, 2);
  /* settle the clock first: the step left behind was mid fast-forward, and the walkthrough's own hand-back to 1x
   * can land a broadcast or two after the jump (seen once in seven runs as a speed that "moved" during the beat) */
  await page.waitForFunction(function () { return RD.__dev.service().timeAcceleration === 1 && RD.__dev.service().running; }, null, { timeout: 5000 }).catch(function () {});
  await page.waitForTimeout(400);
  var base = await page.evaluate(function () { var q = RD.PwrBoard.scopeState(); return { lit: q.lit.length, dimming: q.dimming, x: RD.__dev.service().timeAcceleration, rings: document.querySelectorAll('#viewArea .bd-halo.ckl-watch-glow').length }; });
  await sampler();
  await page.waitForTimeout(300);
  await fire();
  await page.waitForTimeout(5600);
  var bt = await page.evaluate(function () { clearInterval(window.__btI); window.__mo.disconnect(); return window.__bt; });
  var dark = await page.evaluate(function () { return window.__dark; });
  var heldS = bt.filter(function (q) { return !q.run; });
  function span(list) { return list.length ? (list[list.length - 1].w - list[0].w) / 1000 : 0; }
  var sA = bt.filter(function (q) { return q.row === 0; }), sB = bt.filter(function (q) { return q.row === 1; });
  var tail = bt.slice(-10), after = bt[bt.length - 1];
  ck('15. `beat_s`: two rows tick together and the clock is held ' + span(heldS).toFixed(2) + ' wall-s (1.5 + 2.0 asked), then RUNS AGAIN with no Continue: same step, sim_time frozen during the hold and moving after',
     heldS.length > 10 && Math.abs(span(heldS) - 3.5) <= 0.7 && heldS.every(function (q) { return q.t === heldS[0].t && q.holds === 'beat'; }) &&
     tail.every(function (q) { return q.run && q.idx === 3 && q.holds === ''; }) && after.t > heldS[0].t,
     JSON.stringify({ held: +span(heldS).toFixed(2), holds: heldS[0] && heldS[0].holds, simHeld: heldS[0] && heldS[0].t, simAfter: after.t, idx: after.idx, run: after.run }));
  ck('16. ...one at a time, in ROW ORDER: row 0 is "now" for its own 1.5 s, then row 1 for the step\'s 2.0 s, never both',
     sA.length > 5 && sB.length > 5 && sA[sA.length - 1].w < sB[0].w && Math.abs(span(sA) - 1.5) <= 0.3 && Math.abs(span(sB) - 2.0) <= 0.3 && tail.every(function (q) { return q.row === -1; }),
     'row 0 ' + span(sA).toFixed(2) + ' s, row 1 ' + span(sB).toFixed(2) + ' s');
  ck('17. `say` is the row\'s text while its beat holds; a row without one keeps its label',
     sA.length > 0 && sA.every(function (q) { return q.txt === 'The first thing happens.'; }) && sB.length > 0 && sB.every(function (q) { return q.txt === 'event B'; }),
     JSON.stringify([sA[0] && sA[0].txt, sB[0] && sB[0].txt]));
  var midA = sA[Math.floor(sA.length / 2)] || {}, midB = sB[Math.floor(sB.length / 2)] || {};
  ck('18. SPOTLIGHT: during row 1\'s beat only ITS target is lit and ringed (fewer lit tiles than the step\'s own scope, one ring); row 0, with no targets of its own, keeps the step\'s scope',
     base.dimming && base.rings >= 2 && midB.dimming && midB.lit > 0 && midB.lit < base.lit && midB.rings === 1 && midB.sg === false && midA.lit === base.lit && midA.rings === base.rings && midA.sg === true,
     JSON.stringify({ stepScopeLit: base.lit, stepRings: base.rings, row0: midA.lit, row0Rings: midA.rings, row1: midB.lit, row1Rings: midB.rings, contextLitRow0: midA.sg, contextLitRow1: midB.sg }));
  ck('19. ...and the step\'s own scope is back once the beat releases',
     after.dimming && after.lit === base.lit && after.rings === base.rings && after.sg === true, JSON.stringify({ stepScopeLit: base.lit, after: after.lit, rings: after.rings }));
  ck('20. a beat is not the player pausing: the speed rung stays lit, the play button does not flash paused, and the speed is what it was',
     heldS.length > 0 && dark === 0 && heldS.every(function (q) { return q.rung && !q.playPaused && q.x === base.x; }) && after.x === base.x,
     JSON.stringify({ samples: heldS.length, darkMoments: dark, noRung: heldS.filter(function (q) { return !q.rung; }).length, playPaused: heldS.filter(function (q) { return q.playPaused; }).length, xMoved: heldS.filter(function (q) { return q.x !== base.x; }).length, x: [base.x, after.x] }));

  // PAUSE pressed during a beat (critic M-1): the button shows its running face, so a press must PAUSE, by button and by Space
  async function pauseInBeat(k, how) {
    await armBeat(k, 2.5, 2.5);
    await page.waitForFunction(function () { return RD.__dev.service().timeAcceleration === 1 && RD.__dev.service().running; }, null, { timeout: 5000 }).catch(function () {});
    await page.waitForTimeout(400);
    var lit0 = await page.evaluate(function () { return RD.PwrBoard.scopeState().lit.length; });
    await fire();
    var took = await page.waitForFunction(function () { return RD.__dev.holds().join('+') === 'beat'; }, null, { timeout: 6000 }).then(function () { return true; }).catch(function () { return false; });
    await page.waitForTimeout(300);
    if (how === 'space') { await page.evaluate(function () { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }); await page.keyboard.press('Space'); }
    else await page.click('#playBtn');
    await page.waitForTimeout(200);
    function snap() { return page.evaluate(function () { var sv = RD.__dev.service(), b = document.getElementById('playBtn');
      return { run: sv.running, t: sv.simTime, holds: RD.__dev.holds().sort().join('+'), paused: b.classList.contains('paused'), face: b.textContent,
               now: !!document.querySelector('#cklRun .ckl-crit-now'), lit: RD.PwrBoard.scopeState().lit.length }; }); }
    var at = await snap();
    await page.waitForTimeout(5600);          // both rows' beats (2.5 s each) are over
    var later = await snap();
    await page.click('#playBtn');             // the player's own resume
    await page.waitForTimeout(500);
    var res = await snap();
    return { took: took, lit0: lit0, at: at, later: later, res: res };
  }
  var pb = await pauseInBeat(9, 'button');
  ck('31. PAUSE pressed during a beat pauses: the clock is still held 5.6 s later (both beats over, sim_time unmoved), the only hold left is the player\'s, the button shows the paused face, the step\'s scope is back — and play then runs',
     pb.took && !pb.at.run && pb.at.holds === 'beat+user' && pb.at.paused && !pb.later.run && pb.later.t === pb.at.t && pb.later.holds === 'user' && pb.later.paused && pb.later.face === '▶' &&
     !pb.later.now && pb.later.lit === pb.lit0 && pb.res.run && pb.res.holds === '',
     JSON.stringify({ atPress: pb.at.holds, runAtPress: pb.at.run, later: { run: pb.later.run, holds: pb.later.holds, paused: pb.later.paused, moved: pb.later.t - pb.at.t, lit: [pb.lit0, pb.later.lit] }, afterPlay: pb.res.run }));
  var ps = await pauseInBeat(10, 'space');
  ck('32. ...and the same from the keyboard: Space during a beat pauses, and the pause outlives the beat',
     ps.took && !ps.at.run && ps.at.holds === 'beat+user' && !ps.later.run && ps.later.t === ps.at.t && ps.later.holds === 'user' && ps.later.paused && ps.res.run,
     JSON.stringify({ atPress: ps.at.holds, later: { run: ps.later.run, holds: ps.later.holds, paused: ps.later.paused, moved: ps.later.t - ps.at.t }, afterPlay: ps.res.run }));

  // Rewind and End, each pressed with a 6 s beat standing: the hold must go AT ONCE, not when its timer runs out
  await armBeat(4, 6, 6);
  await fire();
  var tookR = await page.waitForFunction(function () { return RD.__dev.holds().indexOf('beat') >= 0; }, null, { timeout: 6000 }).then(function () { return true; }).catch(function () { return false; });
  await page.evaluate(function () { RD.__dev.cmd({ action: 'rewind', steps: 1, scope: 'full', exact: true }); });
  await page.waitForTimeout(700);
  var rwS = await page.evaluate(function () { return { holds: RD.__dev.holds().join('+'), now: !!document.querySelector('#cklRun .ckl-crit-now'), idx: RD.__dev.service().instructor.checklist.idx }; });
  ck('21. Rewind with a beat standing cancels it: 0.7 s later no `beat` hold and no "now" row (its timer had 5 s left)',
     tookR && rwS.holds.indexOf('beat') === -1 && !rwS.now && rwS.idx !== 4, 'beat taken ' + tookR + '; after the rewind ' + JSON.stringify(rwS));
  await armBeat(5, 6, 6);
  await fire();
  var tookE = await page.waitForFunction(function () { return RD.__dev.holds().indexOf('beat') >= 0; }, null, { timeout: 6000 }).then(function () { return true; }).catch(function () { return false; });
  await page.click('[data-ckl-stop]');
  await page.waitForTimeout(700);
  var enS = await page.evaluate(function () { return { holds: RD.__dev.holds().join('+'), run: RD.__dev.service().running, ckl: !!RD.__dev.service().instructor.checklist }; });
  ck('22. End walkthrough with a beat standing cancels it: 0.7 s later the clock is running with no hold left',
     tookE && enS.holds === '' && enS.run && !enS.ckl, 'beat taken ' + tookE + '; after End ' + JSON.stringify(enS));
  // the finished leg's card: the ideas, numbered, above the recap
  await start();
  await page.evaluate(function () {
    var c = RD.__dev.service().instructor.checklist; c.idx = c.proc.steps.length - 1; c.paused = false;
    RD.__dev.cmd({ action: 'checklist_check', index: c.idx });
  });
  await page.waitForTimeout(700);
  var fin = await page.evaluate(function () {
    var box = document.querySelector('#cklRun .ckl-ideas'), rec = document.querySelector('#cklRun .ckl-complete');
    return { done: !!RD.__dev.service().instructor.checklist.complete, h: box && box.querySelector('.ckl-ideas-h').textContent,
      li: box ? [].map.call(box.querySelectorAll('ol > li'), function (l) { return l.textContent; }) : [],
      aboveRecap: !box ? false : (!rec || !!(box.compareDocumentPosition(rec) & 4)) };
  });
  ck('25. `ideas`: the finished leg lists them, numbered, under "The two key ideas", above the recap',
     fin.done && fin.h === 'The two key ideas' && fin.li.join('|') === 'Heat with nowhere to go|Level is not inventory' && fin.aboveRecap, JSON.stringify(fin));
  await page.evaluate(function () { RD.__dev.cmd({ action: 'stop_checklist' }); });
  await page.waitForTimeout(400);
  await start();   // check 14 below ends a RUNNING walkthrough

  await page.evaluate(function () { RD.__dev.cmd({ action: 'stop_checklist' }); });
  await page.waitForTimeout(700);
  var e = await read();
  ck('14. ending the walkthrough lifts all of it: no dimming, no outlines, no tag',
     !e.dimming && e.dim === 0 && Object.keys(e.ols).length === 0 && !e.tag && e.silHalo.length === 0 && !e.alarmDim,
     JSON.stringify({ dimming: e.dimming, dim: e.dim, ols: Object.keys(e.ols), tag: e.tag }));

  await browser.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
