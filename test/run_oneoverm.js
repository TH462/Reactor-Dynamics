/*
 * run_oneoverm.js — the 1/M startup plot panel, headless (issue #598 item 2).
 *
 * THE DEFECT THIS EXISTS FOR. `ui/panels/one_over_m.js` gated itself on
 * `s.metadata.plant_id !== 'pwr'` in two places — the plot action and the
 * per-broadcast tick. PWR2, the plant the site actually runs, publishes 'pwr2'.
 * So the tile opened the window and the NEXT service broadcast hid it again, and a
 * player who was fast enough to press "Plot point" read "PWR only". Six steps of
 * `pwr_startup` — the approach to criticality, the whole reason the tool exists —
 * could not be performed on the shipped plant.
 *
 * NOTHING GATED THIS PANEL AT ALL. It is pure UI below the board, so run_pwr2_board
 * never sees it, verify_flags_ui never opens it, and no runner required()'d the file.
 * That is the gap this runner closes: the panel is driven against a REAL pwr2
 * SimulationService through its own public surface (init/open/tick + the click
 * handler it registers), with a DOM stub sized to what it actually touches.
 *
 * The fix is a CAPABILITY test, not a bigger plant list: 1/M needs a source-range
 * count and a control rod group, and `supported()` asks for exactly those. So the
 * checks here assert the capability, and the last section proves a plant WITHOUT a
 * source-range channel is still refused — the guard was narrowed, not deleted.
 *
 * Injection self-test (--inject): the two guards are reverted to the plant-id form
 * from source and the pwr2 checks must go red. A check born beside its fix is not
 * green until it has been made to fail (house rule).
 *
 *   node test/run_oneoverm.js
 *   node test/run_oneoverm.js --inject
 */
'use strict';
var fs = require('fs');
var path = require('path');
var SRC = path.join(__dirname, '..', 'engines', 'pwr2');
var PANEL = path.join(__dirname, '..', 'ui', 'panels', 'one_over_m.js');
var INJECT = process.argv.indexOf('--inject') >= 0;

/* ---- the DOM stub -------------------------------------------------------------------
 * one_over_m.js touches: createElement + body.appendChild (build), innerHTML on the
 * window, querySelector for the svg / #oomMsg / #oomPred / .oom-head, textContent,
 * classList.toggle, hidden, and addEventListener('click') for its own delegation. It
 * never reads back parsed HTML, so a stub that hands out fresh elements is faithful. */
function el(tag) {
  var e = {
    tagName: tag || 'div', innerHTML: '', textContent: '', hidden: false,
    style: {}, children: [],
    classList: { add: function () {}, remove: function () {}, toggle: function () {} },
    setAttribute: function () {}, removeAttribute: function () {},
    getAttribute: function () { return null; },
    appendChild: function (c) { e.children.push(c); return c; },
    removeChild: function () {}, remove: function () {},
    addEventListener: function (t, fn) { (e._h[t] = e._h[t] || []).push(fn); },
    removeEventListener: function () {},
    setPointerCapture: function () {}, releasePointerCapture: function () {},
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 340, height: 260 }; },
    querySelector: function (sel) { return (e._q[sel] = e._q[sel] || el(sel)); },
    querySelectorAll: function () { return []; },
    _h: {}, _q: {}
  };
  return e;
}
global.window = global;
global.innerWidth = 1400; global.innerHeight = 900;
global.addEventListener = function () {};
global.removeEventListener = function () {};
var BODY = el('body');
global.document = {
  createElement: el, createElementNS: el, body: BODY,
  getElementById: function () { return null; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  addEventListener: function () {}, removeEventListener: function () {}
};

require(path.join(__dirname, '..', 'engines', 'load_mode.js'));
require(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_config.js'));
require(path.join(__dirname, '..', 'layers', 'control', 'control_kernel.js'));
require(path.join(__dirname, '..', 'layers', 'control', 'pwr_control.js'));
require(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_instruments.js'));
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_kinetics',
 'pwr2_fuel', 'pwr2_reactor', 'pwr2_sources', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
 'pwr2_condenser', 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_afw', 'pwr2_damage', 'pwr2_protection',
 'pwr2_pressurizer', 'pwr2_dumpctl', 'pwr2_break', 'pwr2_containment', 'pwr2_rhr',
 'pwr2_true_state', 'pwr2_instruments', 'pwr2_feedwater', 'pwr2_engine', 'pwr2_shell'
].forEach(function (f) { require(path.join(SRC, f + '.js')); });
require(path.join(__dirname, '..', 'layers', 'instructor_layer.js'));
require(path.join(__dirname, '..', 'layers', 'simulation_service.js'));

/* the panel itself — loaded from SOURCE so --inject can hand it a reverted copy */
var panelSrc = fs.readFileSync(PANEL, 'utf8');
if (INJECT) {
  var before = panelSrc;
  panelSrc = panelSrc
    .replace('if (!supported(s)) { setMsg(\'no source-range channel on this plant\', true); return; }',
             'if (s.metadata.plant_id !== \'pwr\') { setMsg(\'PWR only\', true); return; }')
    .replace('if (win && !supported(s)) win.hidden = true;',
             'if (win && plant !== \'pwr\') win.hidden = true;');
  if (panelSrc === before) {
    console.log('\x1b[31mINJECTION FAILED\x1b[0m — neither guard matched; the anchors have moved.');
    process.exit(2);
  }
}
(new Function('globalThis', panelSrc))(globalThis);

var RD = globalThis.RD;
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

/* ---- the live plant ------------------------------------------------------------------ */
function mkWorld(ic) {
  var svc = new RD.SimulationService({ seed: 0x1A2B3C });
  svc.selectPlant('pwr2', ic, null, undefined);
  svc.running = true; svc.timeAcceleration = 10; svc.attentionStops = false;
  var snap = null;
  function cmd(c) { try { return svc.handleCommand(c); } catch (e) { return { type: 'error', message: String(e && e.message || e) }; } }
  function tick(n) { for (var i = 0; i < (n || 1); i++) snap = svc.tick(); return snap; }
  tick(10);
  return { svc: svc, cmd: cmd, tick: tick, snap: function () { return snap; } };
}

/* the panel's own click delegation, driven the way the browser would */
function press(win, op) {
  var handlers = win._h.click || [];
  var btn = { getAttribute: function () { return op; }, setAttribute: function () {},
              classList: { add: function () {}, remove: function () {}, toggle: function () {} } };
  var ev = { target: { closest: function (sel) { return sel === '[data-oom]' ? btn : null; } } };
  handlers.forEach(function (fn) { fn(ev); });
}
function winOf() { return BODY.children[BODY.children.length - 1]; }
function msgOf(win) { return win._q['#oomMsg'] ? win._q['#oomMsg'].textContent : ''; }

console.log(BOLD + '\n1/M startup plot — panel gate (#598 item 2)' + RST +
  (INJECT ? RED + '   [INJECTED: the plant-id guards are back]' + RST : ''));

/* ============================================================ 1. PWR2, the shipped plant */
head('1. the panel works on PWR2 — the plant the site runs');

var w = mkWorld('hot_zero_power');
var snap = w.snap();
ck('precondition: PWR2 publishes a source-range count and a control group',
   snap.metadata.plant_id === 'pwr2' && snap.instruments.source_range > 0 &&
   (snap.control_state.rod_groups || []).some(function (g) { return g.function === 'control'; }),
   'plant_id=' + snap.metadata.plant_id + ' sr=' + snap.instruments.source_range.toExponential(2));

RD.OneOverM.init({ getSnap: function () { return w.snap(); }, cmd: w.cmd });
var win = winOf();
ck('the panel builds its window', !!win && win.id === 'oomWin');

RD.OneOverM.open();
ck('open() shows the window', win.hidden === false);

/* THE REGRESSION. This is the line the defect broke: the very next broadcast hid it. */
RD.OneOverM.tick(w.snap());
ck('a service broadcast does NOT hide the window on PWR2 (the #598 item 2 defect)',
   win.hidden === false, 'hidden=' + win.hidden);

/* ============================================================ 2. plotting a real approach */
head('2. plotting an approach to criticality');

press(win, 'plot');
var m1 = msgOf(win);
ck('the first press captures a baseline, and does NOT read "PWR only"',
   /baseline/.test(m1) && !/PWR only/.test(m1), 'msg="' + m1 + '"');

var sr0 = w.snap().instruments.source_range;
/* A FRACTION OF TRAVEL, not 40 steps (#602 phase 2). 40 was 20 % of the 200-step bank when
 * this was written; on the sourced 627-step scale the same literal is 6 %, the count rate
 * barely moves and instrument noise wins — measured 538 -> 537 cps, a DECREASE, and the
 * check failed on a plant whose 1/M behaviour is fine. Green on workbench, red merged: the
 * combination broke it, which makes it the merge's defect and not the lane's. */
var bankOM = Math.round(0.20 * RD.pwr2.kinetics.RODS.max_steps);
w.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: bankOM, speed: 'fast' });
w.tick(120);
RD.OneOverM.tick(w.snap());
var sr1 = w.snap().instruments.source_range;
ck('withdrawing the control bank raises the source-range count (the plot has something to read)',
   sr1 > sr0, sr0.toExponential(2) + ' -> ' + sr1.toExponential(2) + ' cps');
ck('the window survived the rod motion and the broadcasts', win.hidden === false);

press(win, 'plot');
var m2 = msgOf(win);
ck('a second point plots against the new rod position', /plotted|1\/M/.test(m2) && !/PWR only/.test(m2),
   'msg="' + m2 + '"');

var pred = win._q['#oomPred'] ? win._q['#oomPred'].textContent : '';
ck('two points produce a prediction line (or an honest "insufficient trend")',
   /predicted criticality|insufficient trend/.test(pred), 'pred="' + pred + '"');

/* ============================================================ 3. another supported plant */
head('3. the guard was NARROWED, not deleted — another supported plant still works');

/* A pwr-shaped snapshot: same instruments, a different plant_id. This is the branch the
 * defect lived in, tested without loading the retired engine (#523 strips it from a public
 * build, so a gate must not depend on it being present). */
var other = JSON.parse(JSON.stringify(w.snap()));
other.metadata.plant_id = 'pwr';

RD.OneOverM.tick(other);
ck('a plant change clears the plot (the points describe the OTHER plant)',
   msgOf(win).indexOf('plant changed') >= 0, 'msg="' + msgOf(win) + '"');
ck('but the window STAYS OPEN — the new plant has a source range too',
   win.hidden === false, 'hidden=' + win.hidden);

/* ============================================================ 4. a plant with no SR is refused */
head('4. a plant with NO source-range channel is still refused');

var noSr = JSON.parse(JSON.stringify(w.snap()));
noSr.metadata.plant_id = 'bwr';
delete noSr.instruments.source_range;

RD.OneOverM.open();
RD.OneOverM.tick(noSr);
ck('the window hides on a plant that publishes no source-range channel', win.hidden === true);

var noRods = JSON.parse(JSON.stringify(w.snap()));
noRods.metadata.plant_id = 'rbmk';
noRods.control_state.rod_groups = [];
RD.OneOverM.open();
RD.OneOverM.tick(noRods);
ck('and on a plant with a source range but no control GROUP to plot it against',
   win.hidden === true);

/* ============================================================ 5. the HELP panel (#619 item 23) */
/* THE STUB DOES NOT PARSE HTML, so it cannot tell you the panel starts hidden — its
 * querySelector hands out a fresh element with `hidden: false` for any selector. That is
 * exactly the shape that turns a gate into a test of its own stub, so the two claims are
 * asserted separately and honestly:
 *
 *   1. the BUILT MARKUP declares the button and a hidden panel — a string check on the
 *      innerHTML the browser will actually parse, which is what fixes the initial state;
 *   2. the CLICK HANDLER toggles it — driven through the panel's own delegation, with the
 *      starting state set explicitly here because the stub cannot have read it from (1).
 *
 * Neither claim alone is worth much; together they cover authored-and-wired. */
(function () {
  var w = winOf();
  var html = w.innerHTML || '';
  ck('the 1/M panel authors a Help button (#619 item 23)',
     html.indexOf('data-oom="help"') !== -1);
  ck('...and a help panel that starts HIDDEN in the markup',
     /class="oom-help" hidden/.test(html));
  ck('...whose copy explains the ratio, not just the controls',
     html.indexOf('shutdown count rate divided by the current count rate') !== -1);
  ck('...and warns that the early prediction reads HIGH (the fit is the trailing 3 points)',
     /reads HIGH/.test(html) && html.indexOf('Never withdraw straight to the predicted position') !== -1);

  var panel = w.querySelector('.oom-help');
  panel.hidden = true;                       // the state the markup above establishes
  press(w, 'help');
  ck('pressing Help opens the panel in place (no modal — the Scanner idiom)',
     panel.hidden === false, 'hidden ' + panel.hidden);
  press(w, 'help');
  ck('...and pressing it again closes it', panel.hidden === true, 'hidden ' + panel.hidden);
})();

/* ============================================================ summary */
var expectRed = INJECT;
console.log('\n' + BOLD + (nFail === 0 ? GREEN + 'PASS' : RED + 'FAIL') + RST +
  '  ' + nPass + ' passed, ' + nFail + ' failed, ' + (nPass + nFail) + ' checks');
if (INJECT) {
  var caught = nFail > 0;
  console.log((caught ? GREEN + 'INJECTION CAUGHT' : RED + 'INJECTION MISSED') + RST +
    ' — the reverted plant-id guards ' + (caught ? 'reddened ' + nFail + ' check(s).' : 'changed NOTHING. The gate is hollow.'));
  process.exit(caught ? 0 : 1);
}
process.exit(nFail === 0 ? 0 : 1);
