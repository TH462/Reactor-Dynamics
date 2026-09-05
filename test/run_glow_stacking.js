/*
 * run_glow_stacking.js — highlight glows must not restack the board (#598 item 12).
 *
 * THE BUG THIS EXISTS FOR, THREE TIMES OVER.
 *
 * Board tiles carry an authored stacking order (panels at base z, buttons/values/text at
 * 1, the reactor vessel at 2 — buildStage in pwr_board.js) and they deliberately overlap:
 * the vessel art is authored to read IN FRONT of the CONTROL/SHUTDOWN GROUP panels beneath
 * it. Box tiles are OPAQUE (`bg` defaults to #0e1620). So any shared highlight rule that
 * lifts a tile's z-index makes an opaque panel paint over its own contents and over its
 * neighbours.
 *
 * `ui/diagram/board/pwr_board.css` pins those classes back to `z-index: auto`. Three
 * separate classes have been added to `ui/shell.css` WITHOUT being added to that list:
 *
 *   #202 item 2  — .ckl-glow / .instr-glow: a hovered panel jumped in front of the vessel.
 *   #509 item 9  — .hl-glow / .hl-pin (the #444 highlight bus): an indications-panel hover
 *                  popped its board tile over the diagram indication it was pointing at.
 *   #598 item 12 — .ckl-step-glow (the #244 persistent step glow), and the worst of the
 *                  three: it is not a hover, it stands for minutes, and 13 of the pwr2
 *                  checklists' highlight labels resolve to opaque BOX panels — the owner
 *                  reported the BORON panel "ends up on top of everything".
 *
 * A comment in the CSS saying "add new classes here" did not stop it happening twice more.
 * This runner is the thing that will: it reads both stylesheets and requires that every
 * glow class shell.css lifts is a class pwr_board.css pins back.
 *
 * WHY STATIC. The failure is a CSS stacking context in a browser, which no Node gate can
 * observe and which verify_e2e_ui's screenshots do not diff. What IS checkable, exactly
 * and cheaply, is the invariant the three bugs all violated: the two lists must agree.
 * That is a bifurcation, not a rendering claim — see the CLAUDE.md standing note.
 *
 * Injection self-test (--inject): .ckl-step-glow is removed from the override list and
 * the check must go red.
 *
 *   node test/run_glow_stacking.js
 *   node test/run_glow_stacking.js --inject
 */
'use strict';
var fs = require('fs');
var path = require('path');

var SHELL_CSS = path.join(__dirname, '..', 'ui', 'shell.css');
var BOARD_CSS = path.join(__dirname, '..', 'ui', 'diagram', 'board', 'pwr_board.css');
var INJECT = process.argv.indexOf('--inject') >= 0;

var BOLD = '\x1b[1m', RED = '\x1b[31m', GREEN = '\x1b[32m', RST = '\x1b[0m';
var nPass = 0, nFail = 0;
function ck(name, cond, note) {
  var ok = !!cond;
  if (ok) nPass++; else nFail++;
  console.log((ok ? '  ' + GREEN + 'PASS' + RST + '  ' : '  ' + RED + 'FAIL' + RST + '  ') + name +
    (note ? '  -- ' + note : ''));
  return ok;
}
function head(s) { console.log('\n' + BOLD + s + RST); }

var shell = fs.readFileSync(SHELL_CSS, 'utf8');
var board = fs.readFileSync(BOARD_CSS, 'utf8');
if (INJECT) board = board.replace('.pwr-board-stage .bd-tile.ckl-step-glow,\n', '');

/* ---- what shell.css lifts ---------------------------------------------------------------
 * A "lifting glow rule" is a top-level class selector that sets BOTH a z-index and a
 * box-shadow (directly or through the animation the rule names). Comments are stripped
 * first so the prose in them cannot answer for the code. */
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

var shellCode = stripComments(shell);
var boardCode = stripComments(board);

/* rule bodies keyed by their selector list */
function rules(css) {
  var out = [];
  var re = /([^{}]+)\{([^{}]*)\}/g, m;
  while ((m = re.exec(css))) out.push({ sel: m[1].trim(), body: m[2] });
  return out;
}

/* the keyframes a rule's `animation` shorthand names, so an animated glow counts too */
function keyframeGlows(css) {
  var names = {}, re = /@keyframes\s+([A-Za-z0-9_-]+)\s*\{([\s\S]*?)\n\}/g, m;
  while ((m = re.exec(css))) if (/box-shadow/.test(m[2])) names[m[1]] = true;
  return names;
}

var glowFrames = keyframeGlows(shellCode);
var lifting = [];
rules(shellCode).forEach(function (r) {
  if (!/z-index\s*:\s*\d/.test(r.body)) return;
  var animated = false;
  var am = r.body.match(/animation\s*:\s*([A-Za-z0-9_-]+)/);
  if (am && glowFrames[am[1]]) animated = true;
  if (!/box-shadow/.test(r.body) && !animated) return;
  /* only SIMPLE class selectors — a compound/descendant rule is scoped to its own tree and
   * cannot be applied to a board tile by the highlight code, which does el.classList.add */
  r.sel.split(',').forEach(function (one) {
    var s = one.trim();
    if (/^\.[A-Za-z][A-Za-z0-9_-]*$/.test(s)) {
      var z = (r.body.match(/z-index\s*:\s*(\d+)/) || [])[1];
      lifting.push({ cls: s.slice(1), z: z });
    }
  });
});

/* ---- and of those, the DECORATORS ---------------------------------------------------------
 * A lifting glow rule is only dangerous if the class can be put ON an element that already
 * exists. A floating window that carries its own z-index in its own class (.oom-win,
 * .app-toast, .tour-tip) is a COMPONENT, not a decorator: it is never applied to a board
 * tile, and pinning it would be nonsense.
 *
 * The test is that distinction, stated directly: a class is a component if the UI ever
 * writes it as an element's OWN class — `el.className = 'oom-win'`, or a `class="..."`
 * attribute in markup. Everything else that appears as a class-name literal is a decorator.
 *
 * Do NOT narrow this to `classList.add('literal')`. The highlight bus hoists its names
 * (`var CLS = 'hl-glow', CLS_PIN = 'hl-pin'`) and hands them down two call hops as a
 * parameter, so a literal-argument scan misses exactly the pair that #509 was about — the
 * hollow-check failure mode this file's own header warns about. */
function readUiSources() {
  var out = [];
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      var f = path.join(d, e.name);
      if (e.isDirectory()) return walk(f);
      if (/\.(js|html)$/.test(e.name)) out.push(fs.readFileSync(f, 'utf8'));
    });
  })(path.join(__dirname, '..', 'ui'));
  return out;
}
var uiSrc = readUiSources();

function isComponentClass(cls) {
  /* the class is written as an element's own class: className assignment, a className in an
   * object literal (the board's h() helper), or a class="" attribute in markup */
  var reOwn = new RegExp('className\\s*[:=]\\s*[\'"][^\'"]*\\b' + cls + '\\b');
  var reAttr = new RegExp('class\\s*=\\s*[\'"][^\'"]*\\b' + cls + '\\b');
  return uiSrc.some(function (src) { return reOwn.test(src) || reAttr.test(src); });
}
function isNamedInUi(cls) {
  var re = new RegExp('[\'"]' + cls + '[\'"]');
  return uiSrc.some(function (src) { return re.test(src); });
}

var componentOnly = lifting.filter(function (l) { return isComponentClass(l.cls); });
lifting = lifting.filter(function (l) { return !isComponentClass(l.cls) && isNamedInUi(l.cls); });

/* ---- what pwr_board.css pins back -------------------------------------------------------- */
var pinned = {};
rules(boardCode).forEach(function (r) {
  if (!/z-index\s*:\s*auto/.test(r.body)) return;
  r.sel.split(',').forEach(function (one) {
    var m = one.trim().match(/\.bd-tile\.([A-Za-z][A-Za-z0-9_-]*)\s*$/);
    if (m) pinned[m[1]] = true;
  });
});

console.log(BOLD + '\nglow stacking — shell.css lifts vs pwr_board.css pins (#598 item 12)' + RST +
  (INJECT ? RED + '   [INJECTED: .ckl-step-glow removed from the override list]' + RST : ''));

head('1. the scan found something to check (a hollow pass is the failure mode here)');
ck('shell.css declares at least four lifting glow classes the UI applies to elements',
   lifting.length >= 4,
   lifting.map(function (l) { return '.' + l.cls + '(z' + l.z + ')'; }).join(' '));
ck('the component-only lifts were correctly excluded (they carry the class themselves)',
   componentOnly.length > 0,
   componentOnly.map(function (l) { return '.' + l.cls; }).join(' ') || '(none)');
ck('pwr_board.css declares an override list', Object.keys(pinned).length >= 4,
   Object.keys(pinned).map(function (c) { return '.' + c; }).join(' '));

head('2. every glow class that lifts a tile is pinned back on the board');
var missing = lifting.filter(function (l) { return !pinned[l.cls]; });
lifting.forEach(function (l) {
  ck('.' + l.cls + ' (z-index ' + l.z + ') is in the board override list', !!pinned[l.cls],
     pinned[l.cls] ? '' : 'an opaque board panel wearing this class paints over the vessel and its neighbours');
});

head('3. the three classes the historical failures named are all present');
['ckl-glow', 'instr-glow', 'hl-glow', 'hl-pin', 'ckl-step-glow'].forEach(function (c) {
  ck('.' + c + ' pinned (#202 / #509 / #598)', !!pinned[c]);
});

head('4. the override list has no dead entries');
var live = {};
lifting.forEach(function (l) { live[l.cls] = true; });
Object.keys(pinned).forEach(function (c) {
  ck('.' + c + ' still exists as a lifting glow in shell.css', !!live[c],
     live[c] ? '' : 'the override outlived its rule — either the class was renamed or the lift was removed');
});

console.log('\n' + BOLD + (nFail === 0 ? GREEN + 'PASS' : RED + 'FAIL') + RST +
  '  ' + nPass + ' passed, ' + nFail + ' failed, ' + (nPass + nFail) + ' checks');
if (missing.length) {
  console.log(RED + '\nUNPINNED: ' + missing.map(function (m) { return '.' + m.cls; }).join(', ') + RST +
    '\nAdd them to the `.pwr-board-stage .bd-tile.<class>` list in ui/diagram/board/pwr_board.css.');
}
if (INJECT) {
  var caught = nFail > 0;
  console.log((caught ? GREEN + 'INJECTION CAUGHT' : RED + 'INJECTION MISSED') + RST +
    ' — removing .ckl-step-glow ' + (caught ? 'reddened ' + nFail + ' check(s).' : 'changed NOTHING. The gate is hollow.'));
  process.exit(caught ? 0 : 1);
}
process.exit(nFail === 0 ? 0 : 1);
