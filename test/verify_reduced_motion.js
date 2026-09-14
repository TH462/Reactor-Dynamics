/* verify_reduced_motion.js — prefers-reduced-motion, gated for the first time (#740).
 *
 * *(OWNER RULING, 2026-09-13: "1:A, 2:A, 3:a now. I will playtest after you make these changes."
 * — item 2 was #740, option A: "distinct static geometry per signal under reduced motion, matching
 * the convention the board already uses".)*
 *
 * TWO CLAIMS, AND THE SECOND IS THE ONE THE RULING IS ABOUT.
 *
 *   1. Nothing animates for a player who asked it not to. Six signals ignored the preference when
 *      #740 was filed — `gauge-alarm-flash`, `pulse` on `button.armed`, `scram-flash`,
 *      `status-flash`, `cklGlow` and `instrGlow` — measured in a real browser, not read off the
 *      stylesheets.
 *
 *   2. THE FALLBACK IS NOT HUE-ONLY. Stopping the six was the obvious fix and was explicitly NOT
 *      the option taken, because it CREATES the problem: with the motion gone, a hue was the only
 *      thing separating "critical alarm", "a protection latch is holding this" and "there is a
 *      message" — the pairs a red/green or blue/yellow deficiency compresses. So each signal
 *      carries distinct static GEOMETRY, and this asserts that they are pairwise distinct on
 *      (outline-style, width, offset, box-shadow, text-decoration) — a comparison that never looks
 *      at a colour. The fifth term arrived with #752: the tuple was four terms and could not see
 *      `text-decoration` at all, which is the whole non-colour channel of the rod button's refusal
 *      cue — so that cue would have read as the browser default however it was styled.
 *
 * WHY A SEPARATE RUNNER. `emulateMedia({ reducedMotion: 'reduce' })` is per-page and global, and
 * `verify_board_check` asserts in the other direction (#738 requires `bdMsgFlash` to be RUNNING).
 * One page cannot hold both claims.
 *
 * ⚠ THE NEGATIVE LEG IS NOT OPTIONAL. Every "it does not animate" check would pass on a board
 * where the signal had been deleted, mis-spelled, or never applied — so each one is paired with the
 * same element under `no-preference`, where it MUST animate. A one-sided version of this file would
 * have gone green on a stylesheet with the animations simply removed.
 *
 * ⚠ READ THE RED, NOT THE COUNT. Four separate times in this cycle an injection meant to prove a
 * check reported ZERO reds because the injection itself had missed — it patched a comment instead
 * of the list, named an anchor a refactor had moved, or settled a plant above the permissive so the
 * precondition never held. AN INJECTION THAT DOES NOT LAND IS INDISTINGUISHABLE FROM A ROBUST
 * CHECK: both print "0 failed". Always read WHICH check went red and confirm it is the one the
 * injection was aimed at.
 *
 * Run: node test/verify_reduced_motion.js
 */
'use strict';
var path = require('path');
var http = require('http');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');
var PORT = 0;
var B = '\x1b[1m', G = '\x1b[32m', R = '\x1b[31m', D = '\x1b[2m', X = '\x1b[0m';
var nPass = 0, nFail = 0;
function ck(name, cond, note) {
  if (cond) { nPass++; console.log(G + '  PASS' + X + '  ' + name + (note ? D + '  — ' + note + X : '')); }
  else { nFail++; console.log(R + '  FAIL' + X + '  ' + name + (note ? D + '  — ' + note + X : '')); }
}

function mime(p) {
  if (p.endsWith('.html')) return 'text/html';
  if (p.endsWith('.js')) return 'application/javascript';
  if (p.endsWith('.css')) return 'text/css';
  return 'application/octet-stream';
}
function startServer() {
  return new Promise(function (res) {
    var s = http.createServer(function (q, r) {
      var u = (q.url || '/').split('?')[0];
      if (u === '/') u = '/ui/shell.html';
      var fp = path.join(ROOT, decodeURIComponent(u.replace(/^\//, '').replace(/\//g, path.sep)));
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
      r.writeHead(200, { 'Content-Type': mime(fp) });
      r.end(fs.readFileSync(fp));
    });
    s.listen(0, '127.0.0.1', function () { PORT = s.address().port; res(s); });
  });
}

/* The board's attention vocabulary. `anim` is what each MUST run when motion is allowed — naming it
 * rather than accepting "something" is what stops a renamed keyframe passing silently. */
var SIGNALS = [
  { key: 'critical alarm',                tag: 'div',    cls: ['alarm-tile', 'unack', 'crit'], anim: 'alarmCritFlash' },
  { key: 'protection latch (ACTUATED)',   tag: 'button', cls: ['bd-btn', 'bd-actuated'],       anim: 'bdActuatedFlash' },
  { key: 'trip-block message',            tag: 'button', cls: ['bd-btn', 'bd-msg', 'bd-unack'], anim: 'bdMsgFlash' },
  { key: 'walkthrough: act on this',      tag: 'div',    cls: ['ckl-step-glow'],               anim: 'cklGlow' },
  { key: 'walkthrough: watch this',       tag: 'div',    cls: ['ckl-watch-glow'],              anim: null },
  { key: 'highlight bus',                 tag: 'div',    cls: ['instr-glow'],                  anim: 'instrGlow' },
  /* #743. The recommended speed rung is the one signal here whose treatment is an INSET, and that
   * is load-bearing rather than stylistic: `.speed` is `overflow: hidden`, so an outer ring on a
   * rung is CLIPPED and the fallback would be invisible for exactly the player who asked for a
   * static one. Its shape tuple therefore starts with `inset`, which is also what keeps it apart
   * from the highlight bus's `0 0 0 2px`. */
  { key: 'walkthrough: recommended speed rung', tag: 'button', cls: ['ckl-speed-rung'], parent: ['speed'], anim: 'cklRungGlow' },
  { key: 'gauge alarm value',             tag: 'div',    cls: ['g-value'], parent: ['gauge', 'alarm'], anim: 'gauge-alarm-flash' },
  { key: 'armed button',                  tag: 'button', cls: ['armed'],                       anim: 'pulse' },
  { key: 'retired-board scram',           tag: 'button', cls: ['pd-scram', 'fired'],           anim: 'scram-flash' },
  { key: 'system slot alarm dot',         tag: 'div',    cls: ['slot-dot'], parent: ['sys-slot', 'state-alarm'], anim: 'status-flash' },
  { key: 'instructor attention',          tag: 'div',    cls: ['instructor', 'instr-attn'],    anim: 'instrAttnPulse' },
  /* #752. `bd-refused` shipped in `fc7fae62` WITH NO GATE, and this list is exactly why it could
   * ship that way: it is hand-maintained, so a signal nobody adds is invisible to both claims here
   * — the house trap, a gate that iterates a hand-maintained map tests the map. Two entries,
   * because the cue has two faces on two different kinds of element and only one of them was ever
   * looked at.
   *
   * THEIR NON-COLOUR CHANNELS ARE DELIBERATELY DIFFERENT, and the tuple below had to grow a fifth
   * term before it could see either. The BUTTON crosses its own label out — "WITHDRAW, struck
   * through" is the sentence, and `text-decoration` is a channel no outline can collide with. The
   * READING cannot borrow that: a struck-out NUMBER reads as "this value is void", which is false —
   * the step count is perfectly correct, it is simply not moving — so it carries a 1px ring
   * instead. Both are on the base rules, not inside the reduced-motion block, so every player gets
   * them and not only the one who asked for stillness. */
  { key: 'rod press refused (button)',    tag: 'button', cls: ['bd-btn', 'bd-refused'],        anim: 'bdRefusedFlash' },
  { key: 'rod press refused (reading)',   tag: 'div',    cls: ['bd-value', 'bd-val-refused'],  anim: 'bdRefusedFlash' }
];

function probeAll() {
  return function (sigs) {
    var out = {};
    sigs.forEach(function (s) {
      var host = document.body, wrap = null;
      if (s.parent) { wrap = document.createElement('div'); wrap.className = s.parent.join(' '); document.body.appendChild(wrap); host = wrap; }
      var el = document.createElement(s.tag);
      el.className = s.cls.join(' ');
      el.textContent = 'TRIP BLOCKS';
      el.style.width = '96px'; el.style.height = '34px';
      host.appendChild(el);
      var cs = getComputedStyle(el);
      out[s.key] = {
        anim: cs.animationName,
        style: cs.outlineStyle, width: cs.outlineWidth, offset: cs.outlineOffset,
        shadow: (cs.boxShadow || 'none'),
        /* THE FIFTH TERM (#752). The tuple was (outline-style, width, offset, box-shadow) and could
         * not see `text-decoration` at all — which is the ENTIRE non-colour channel of the rod
         * button's refusal cue. Without this, `.bd-refused` reads as `none|3px|0px|none`, the
         * browser default, so it would have collided with any other ring-less signal AND been
         * reported bare by the presence check below. A tuple that cannot see a signal's only
         * geometry is a distinctness claim about something else. */
        deco: (cs.textDecorationLine || 'none')
      };
      el.remove(); if (wrap) wrap.remove();
    });
    return out;
  };
}

(async function () {
  var srv = await startServer();
  var playwright = require('playwright');
  var browser = await playwright.chromium.launch({ headless: true });
  var url = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&dev=1';

  async function load(mode) {
    var page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
    await page.emulateMedia({ reducedMotion: mode });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    try { if (await page.isVisible('#missionOverlay')) { await page.click('#missionClose'); await page.waitForTimeout(300); } } catch (e) {}
    await page.waitForTimeout(700);
    return page;
  }

  console.log(B + '\nREDUCED MOTION — the board keeps its meaning without the movement (#740)' + X);

  var pMotion = await load('no-preference');
  var motion = await pMotion.evaluate(probeAll(), SIGNALS);

  /* THE POSITIVE LEG FIRST. If these do not animate with motion ALLOWED, every check below is
   * measuring a signal that was never there. */
  var notAnimating = SIGNALS.filter(function (s) { return s.anim && motion[s.key].anim !== s.anim; });
  ck('every animated signal really does animate when motion is allowed (else the checks below prove nothing)',
    notAnimating.length === 0,
    notAnimating.length ? notAnimating.map(function (s) {
      return s.key + ': expected ' + s.anim + ', got ' + motion[s.key].anim; }).join(' | ')
      : SIGNALS.filter(function (s) { return s.anim; }).length + ' signals animating');

  var pReduce = await load('reduce');
  var reduce = await pReduce.evaluate(probeAll(), SIGNALS);

  /* CLAIM 1 — nothing moves. */
  var stillMoving = SIGNALS.filter(function (s) { return reduce[s.key].anim !== 'none'; });
  ck('no attention signal animates under prefers-reduced-motion',
    stillMoving.length === 0,
    stillMoving.length ? stillMoving.map(function (s) { return s.key + '=' + reduce[s.key].anim; }).join(', ')
      : SIGNALS.length + ' signals checked, all static');

  /* The six #740 was filed for, named individually so a regression says WHICH. */
  ['gauge alarm value', 'armed button', 'retired-board scram', 'system slot alarm dot',
   'walkthrough: act on this', 'highlight bus'].forEach(function (k) {
    ck('  …including "' + k + '", one of the six that ignored it when #740 was filed',
      reduce[k].anim === 'none', reduce[k].anim);
  });

  /* CLAIM 2 — the fallback is geometry, not hue. Compared on shape alone; no colour is read. */
  /* WHICH SIGNALS THE DISTINCTNESS CLAIM COVERS, AND WHY IT IS NOT ALL OF THEM.
   *
   * The claim is "a player can tell these apart without hue". That only bites for signals that
   * compete for interpretation — the ring-shaped ones on the live board's control surface, which
   * appear in the same places and mean different things. Three VALUE flashes are deliberately
   * outside it and the exclusion is stated rather than quietly applied:
   *
   *   `gauge alarm value` / `system slot alarm dot` — a NUMBER and a DOT going into alarm. An
   *      outline round a digit is not the board's idiom and nobody asked for one; these say "this
   *      reading is bad", they are never confused with each other, and they are read in place
   *      rather than compared. THEY REMAIN HUE-ONLY UNDER REDUCED MOTION and that is a known,
   *      reported limit of this change (noted on #740), not an oversight.
   *   `retired-board scram` — the RETIRED board. Out of scope by the coordinating lane's direction.
   *
   * ⚠ THIS LIST IS THE EASIEST THING IN THIS FILE TO ABUSE. Adding a key here makes a red go away
   * without fixing anything. Do not add one to quiet a failure; a signal that competes with another
   * on the board belongs in the claim, and if it cannot carry geometry, that is a design question
   * rather than a list edit. */
  var HUE_ONLY_BY_DESIGN = ['gauge alarm value', 'system slot alarm dot', 'retired-board scram'];
  ck('the hue-only exclusion list is still SMALL and named (3) — it is the easiest thing here to abuse',
    HUE_ONLY_BY_DESIGN.length === 3, HUE_ONLY_BY_DESIGN.join(', '));
  /* A TYPO IN THE LIST IS SILENT OTHERWISE. A misspelt key excludes nothing and the list quietly
     stops meaning what it says; it fails SAFE (the signal rejoins the distinctness set) but the
     comment above it becomes a lie. */
  var badKeys = HUE_ONLY_BY_DESIGN.filter(function (k) {
    return !SIGNALS.some(function (s) { return s.key === k; });
  });
  ck('  …and every excluded key names a real signal (a typo excludes nothing and says nothing)',
    badKeys.length === 0, badKeys.length ? badKeys.join(', ') : 'all 3 resolve');

  var keys = SIGNALS.map(function (s) { return s.key; })
    .filter(function (k) { return HUE_ONLY_BY_DESIGN.indexOf(k) < 0; });
  var sig = {}, collisions = [];
  keys.forEach(function (k) {
    var r = reduce[k];
    /* box-shadow carries colour in its string; reduce it to the SHAPE (offsets/blur/spread) so a
     * pair differing only in hue cannot pass as distinct. */
    var shape = (r.shadow === 'none') ? 'none' : r.shadow.replace(/rgba?\([^)]*\)/g, '').trim();
    var fp = r.style + '|' + r.width + '|' + r.offset + '|' + shape + '|' + r.deco;
    if (sig[fp]) collisions.push(sig[fp] + ' vs ' + k + '  [' + fp + ']');
    else sig[fp] = k;
  });
  ck('under reduced motion every signal is distinguishable WITHOUT hue (distinct outline/shadow geometry)',
    collisions.length === 0,
    collisions.length ? collisions.join(' ; ')
      : Object.keys(sig).length + ' distinct shapes for ' + keys.length + ' competing signals (' +
        HUE_ONLY_BY_DESIGN.length + ' value/retired signals excluded by design, see above)');

  /* ⚠ PAIRWISE DISTINCTNESS DOES NOT CARRY PRESENCE — HARD RULE 10 IN ONE PARAGRAPH, and the first
   * version of this file got it wrong. The claim being made is "the fallback is not hue-only". A
   * check that asserts the signals' geometry tuples are all DIFFERENT does not establish that,
   * because a signal whose geometry is DELETED still has a unique tuple as long as the others
   * differ. So the check looked like it proved the claim and proved nothing of the kind.
   *
   * It survived its own injections because all four of them removed a WHOLE override, animation
   * included — which is not what a real future edit looks like. A real edit trims an outline and
   * leaves the `animation: none`. That case was never probed, and each of the five signals could
   * have reverted to hue-only with this runner green. THE PROPERTY ASSERTED WAS NOT THE PROPERTY
   * THE DEFECT VIOLATES.
   *
   * DISTINCTNESS IS NOT ENOUGH, AND THE FIRST VERSION OF THIS FILE ONLY ASSERTED DISTINCTNESS.
   * The claim is "the fallback is not hue-only". Pairwise uniqueness does not carry it: a signal
   * whose geometry is DELETED still has a unique tuple as long as the others differ, so any one
   * signal could silently revert to hue-only with this gate green. MEASURED (#740 quality pass):
   * dropping the outline from `button.armed`, `.ckl-step-glow`, `.bd-msg.bd-unack` or
   * `.bd-actuated` — or the box-shadow from `.instr-glow` — left the gate at 14/14.
   *
   * The four injections the commit cited all removed a WHOLE override, animation included, which
   * is why they were caught; the geometry-only case, which is what a real future edit looks like,
   * was never probed. Hard Rule 10 exactly: the property asserted was not the property the defect
   * violates. So assert PRESENCE too — `none|3px|0px|none` is the browser default and means the
   * signal has no static treatment at all. */
  var DEFAULT_TUPLE = 'none|3px|0px|none|none';
  var bare = keys.filter(function (k) {
    var r = reduce[k];
    var shape = (r.shadow === 'none') ? 'none' : r.shadow.replace(/rgba?\([^)]*\)/g, '').trim();
    return (r.style + '|' + r.width + '|' + r.offset + '|' + shape + '|' + r.deco) === DEFAULT_TUPLE;
  });
  ck('every competing signal actually HAS a static treatment (distinctness alone would pass on a deleted one)',
    bare.length === 0, bare.length ? bare.join(', ') + ' carry the browser default' : keys.length + ' signals carry geometry');

  /* The trio the ruling is actually about, called out so a collision among THEM is unmissable. */
  var trio = ['critical alarm', 'protection latch (ACTUATED)', 'trip-block message'];
  var trioShapes = trio.map(function (k) { return reduce[k].style + '|' + reduce[k].width + '|' + reduce[k].offset; });
  /* `none` IS NOT A LINE STYLE. `new Set(['double','none','dotted']).size === 3` is true, so the
   * first version of this check stayed green when either outline was deleted outright (measured).
   * Require three REAL styles. */
  var trioStyles = trioShapes.map(function (t) { return t.split('|')[0]; });
  ck('  …and the three that were hue-only — critical alarm, protection latch, message — differ by LINE STYLE',
    new Set(trioStyles).size === 3 && trioStyles.every(function (st) { return st !== 'none'; }),
    trio.map(function (k, i) { return k + ' ' + trioShapes[i]; }).join(' | '));

  /* `double` splits its width three ways: at 3px it renders as one thin line and read FAINTER than
   * the 2px solid latch, which is backwards for the loudest signal on the board. Rendered and
   * looked at before this bound was chosen (inbox/740/grey/). */
  ck('  …and the critical alarm\'s double outline is wide enough to read as two lines (>= 4px)',
    parseFloat(reduce['critical alarm'].width) >= 4, reduce['critical alarm'].width);

  /* THE SPEED RUNG'S FALLBACK MUST BE AN INSET, AND NO OTHER CHECK HERE CAN SEE THAT (#743). The
   * distinctness and presence checks above compare shape tuples and would be perfectly happy with
   * an OUTER ring — which `.speed`'s `overflow: hidden` clips, so the signal would be gone from the
   * screen while every check stayed green. That is the same clip that made the pre-#743 code light
   * the whole six-rung strip instead of the one rung. Assert the thing the clip cares about.
   * Injection-proven: dropping `inset` from the fallback reds this and nothing else. */
  var rungShape = reduce['walkthrough: recommended speed rung'].shadow;
  ck('the recommended speed rung fallback is an INSET ring (an outer one is clipped by .speed)',
    /inset/.test(rungShape) && /\d/.test(rungShape), rungShape);

  /* THE SCRAM BUTTON'S ARMED PULSE IS SET BY JAVASCRIPT as an inline style, so no stylesheet rule
   * can stop it and no class probe can see it — it was missed twice by #740's own audit. Driven
   * here through the real board. */
  async function scramArmed(page) {
    return page.evaluate(function () {
      var tile = document.querySelector('[data-item="imrqr8ecji6"]');
      var btn = tile && (tile.querySelector('button') || tile);
      if (!btn) return { err: 'no scram tile' };
      btn.click();                       // first press ARMS (the #598 two-step)
      return { anim: btn.style.animation || 'none', shadow: btn.style.boxShadow || '' };
    });
  }
  /* THE KEYFRAME HAS TO EXIST, and check 13 could not see that. It regex-tests the inline
   * `animation` shorthand string, so MEASURED: deleting `@keyframes bdScramPulse` outright left the
   * gate 14/14 green — the exact regression the commit's headline lesson is about (it was deleted
   * once already, on a CSS-only grep that could not see its JavaScript caller). Ask the CSSOM. */
  var kf = await pMotion.evaluate(function () {
    /* `cklAckGlow` and `cklGlow` WERE ONE KEYFRAME until #743 split them — the board's pulse went
     * cyan on the 2026-09-13 ruling while ACKNOWLEDGE is held to green by the 2026-09-03 one. A
     * split like that is exactly how a name goes stale silently: whichever half keeps the old name
     * still resolves, and the other animates nothing. Both are named here. */
    var want = ['bdScramPulse', 'bdMsgFlash', 'bdActuatedFlash', 'alarmCritFlash', 'cklGlow',
                'cklAckGlow', 'cklRungGlow', 'instrGlow', 'bdRefusedFlash'];
    var found = {};
    for (var i = 0; i < document.styleSheets.length; i++) {
      var rules; try { rules = document.styleSheets[i].cssRules; } catch (e) { continue; }
      for (var j = 0; j < rules.length; j++) {
        if (rules[j].type === CSSRule.KEYFRAMES_RULE) found[rules[j].name] = true;
      }
    }
    return want.filter(function (n) { return !found[n]; });
  });
  ck('every keyframe the board names still EXISTS in the CSSOM (a named animation with no keyframe is silent)',
    kf.length === 0, kf.length ? 'MISSING: ' + kf.join(', ') : '9 keyframes present');

  /* ⚰ THE STYLESHEET PARSE CHECK WAS HERE AND HAS MOVED to `test/verify_stylesheets.js`.
   * It caught a stray `}` that this change itself shipped — one that silently swallowed the next
   * rule and broke eleven number-input tiles on the live board with every gate in the repo green —
   * but it is a GENERAL stylesheet invariant and has nothing to do with reduced motion. Left here,
   * the next person to reorganise this runner would have deleted the repo's only parse check
   * without knowing what it was. Do not re-add it here. */

  var armedMotion = await scramArmed(pMotion);
  var armedReduce = await scramArmed(pReduce);
  ck('the SCRAM armed pulse animates when motion is allowed (inline style, invisible to a class probe)',
    !armedMotion.err && /bdScramPulse/.test(armedMotion.anim), JSON.stringify(armedMotion));
  ck('  …and under reduced motion it stops and leaves a static ring instead',
    !armedReduce.err && !/bdScramPulse/.test(armedReduce.anim) && /\d/.test(armedReduce.shadow),
    JSON.stringify(armedReduce));

  await browser.close();
  srv.close();

  console.log('\n' + B + (nFail ? R + 'REDUCED MOTION: FAIL' : G + 'REDUCED MOTION: PASS') + X +
    '   ' + nPass + '/' + (nPass + nFail) + ' checks');
  console.log(D + 'PASS means nothing MOVES and every signal still differs by SHAPE. It says nothing ' +
    'about whether the shapes are the right ones — that was decided by rendering them.' + X);
  process.exit(nFail > 0 ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
