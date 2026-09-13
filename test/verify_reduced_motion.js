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
 *      (outline-style, width, offset, box-shadow) — a comparison that never looks at a colour.
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
  { key: 'gauge alarm value',             tag: 'div',    cls: ['g-value'], parent: ['gauge', 'alarm'], anim: 'gauge-alarm-flash' },
  { key: 'armed button',                  tag: 'button', cls: ['armed'],                       anim: 'pulse' },
  { key: 'retired-board scram',           tag: 'button', cls: ['pd-scram', 'fired'],           anim: 'scram-flash' },
  { key: 'system slot alarm dot',         tag: 'div',    cls: ['slot-dot'], parent: ['sys-slot', 'state-alarm'], anim: 'status-flash' },
  { key: 'instructor attention',          tag: 'div',    cls: ['instructor', 'instr-attn'],    anim: 'instrAttnPulse' }
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
        shadow: (cs.boxShadow || 'none')
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

  var keys = SIGNALS.map(function (s) { return s.key; })
    .filter(function (k) { return HUE_ONLY_BY_DESIGN.indexOf(k) < 0; });
  var sig = {}, collisions = [];
  keys.forEach(function (k) {
    var r = reduce[k];
    /* box-shadow carries colour in its string; reduce it to the SHAPE (offsets/blur/spread) so a
     * pair differing only in hue cannot pass as distinct. */
    var shape = (r.shadow === 'none') ? 'none' : r.shadow.replace(/rgba?\([^)]*\)/g, '').trim();
    var fp = r.style + '|' + r.width + '|' + r.offset + '|' + shape;
    if (sig[fp]) collisions.push(sig[fp] + ' vs ' + k + '  [' + fp + ']');
    else sig[fp] = k;
  });
  ck('under reduced motion every signal is distinguishable WITHOUT hue (distinct outline/shadow geometry)',
    collisions.length === 0,
    collisions.length ? collisions.join(' ; ')
      : Object.keys(sig).length + ' distinct shapes for ' + keys.length + ' competing signals (' +
        HUE_ONLY_BY_DESIGN.length + ' value/retired signals excluded by design, see above)');

  /* The trio the ruling is actually about, called out so a collision among THEM is unmissable. */
  var trio = ['critical alarm', 'protection latch (ACTUATED)', 'trip-block message'];
  var trioShapes = trio.map(function (k) { return reduce[k].style + '|' + reduce[k].width + '|' + reduce[k].offset; });
  ck('  …and the three that were hue-only — critical alarm, protection latch, message — differ by LINE STYLE',
    new Set(trioShapes.map(function (t) { return t.split('|')[0]; })).size === 3,
    trio.map(function (k, i) { return k + ' ' + trioShapes[i]; }).join(' | '));

  /* `double` splits its width three ways: at 3px it renders as one thin line and read FAINTER than
   * the 2px solid latch, which is backwards for the loudest signal on the board. Rendered and
   * looked at before this bound was chosen (inbox/740/grey/). */
  ck('  …and the critical alarm\'s double outline is wide enough to read as two lines (>= 4px)',
    parseFloat(reduce['critical alarm'].width) >= 4, reduce['critical alarm'].width);

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
