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
 * Section 6 (owner playtest 2026-09-28: "1/m plot points are lost when rewinding steps")
 * has its own injection, --inject-rewind: RD.OneOverMCore.rewindTo is put back to the old
 * clear-the-whole-table rule (for BOTH copies, panel and grader) and section 6 must go red.
 *
 *   node test/run_oneoverm.js
 *   node test/run_oneoverm.js --inject
 *   node test/run_oneoverm.js --inject-rewind
 *
 * Section 7 (2026-09-28 review): a save FILE load, a reset or a new initial condition is a
 * DIFFERENT history, and the plot clears on it however the clock moved. --inject-history
 * disables RD.OneOverMCore.newHistory (both copies) and section 7 must go red.
 *
 *   node test/run_oneoverm.js --inject-history
 */
'use strict';
var fs = require('fs');
var path = require('path');
var SRC = path.join(__dirname, '..', 'engines', 'pwr2');
var PANEL = path.join(__dirname, '..', 'ui', 'panels', 'one_over_m.js');
var INJECT = process.argv.indexOf('--inject') >= 0;
var INJECT_RW = process.argv.indexOf('--inject-rewind') >= 0;
var INJECT_HIST = process.argv.indexOf('--inject-history') >= 0;

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
require(path.join(__dirname, '..', 'ui', 'manual_procedures.js'));   // section 2c starts the startup walkthrough

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
if (INJECT_RW) {
  /* the pre-fix rule: the clock behind the LAST capture cleared the whole table. Patched on the
   * shared object, so the panel (core().rewindTo) and the grader (OneOverMCore.rewindTo) both
   * get it — the same single implementation the fix lives in. */
  RD.OneOverMCore.rewindTo = function (tbl, now) {
    if (tbl.t == null || !(now < tbl.t - 1e-6)) return null;
    RD.OneOverMCore.clear(tbl); return 'cleared';
  };
}
if (INJECT_HIST) {
  /* the pre-fix plant: nothing told a file load from a rewind — only the clock rule ran */
  RD.OneOverMCore.newHistory = function () { return false; };
}
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

/* ---- 2b. THE GRADER HOLDS THE PANEL'S TABLE (2026-09-24, pwr_startup 9a "3 short of the 1/M
 * prediction"). Each Plot point press sends its sample down with `plot_1m_point`; the instructor
 * keeps the same table through RD.OneOverMCore, and the snapshot publishes the prediction it
 * would print. A third point first, so there is a real crossing to compare (not two nulls).
 * INJECTIONS, proven in place: the instructor's `plot_1m_point` recording removed -> .1 red
 * (0 points, null against the printed step); the panel's `plot_1m_clear` send removed -> .2 red. */
w.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: Math.round(0.08 * RD.pwr2.kinetics.RODS.max_steps), speed: 'fast' });
w.tick(120);
RD.OneOverM.tick(w.snap());
press(win, 'plot');
w.tick(1);
var predTxt = win._q['#oomPred'] ? win._q['#oomPred'].textContent : '';
var mStep = /step (\d+)/.exec(predTxt), printed = mStep ? +mStep[1] : null;
var oomG = w.snap().instructor && w.snap().instructor.one_over_m;
ck('the grader holds the panel\'s three points and the prediction the panel PRINTS',
   printed != null && !!oomG && oomG.points === 3 && oomG.pred_steps === printed,
   'panel "' + predTxt + '"; grader ' + (oomG ? oomG.points + ' points, step ' + oomG.pred_steps : 'none'));
press(win, 'clear');
w.tick(1);
oomG = w.snap().instructor && w.snap().instructor.one_over_m;
ck('...and the panel\'s Clear clears the grader\'s table too',
   !!oomG && oomG.points === 0 && oomG.pred_steps == null,
   'grader ' + (oomG ? oomG.points + ' points, step ' + oomG.pred_steps : 'none'));
press(win, 'plot');   /* section 3 asserts that a plant change clears a NON-empty plot */

/* ---- 2c. A NEW STARTUP STARTS A NEW PLOT (layman pass 8 S-1, 2026-09-26). The table cleared only
 * on plant change, clock back or Clear, so a SECOND Mode 3 -> Mode 1 walkthrough kept the first
 * one's baseline and points (the reviewer's predictions 208 -> 203 -> 205 -> 226, "3 short" at 223
 * already critical). `pwr_startup` authors `clear_1m`: loading it clears the grader's table and
 * bumps `one_over_m.gen`, which the panel watches. A walkthrough WITHOUT the flag leaves the plot.
 * INJECTIONS, proven in place 2026-09-26: the `loadChecklist` clear line removed -> all three
 * walkthrough checks red (grader keeps its point; the panel, never told, keeps its own); the panel's gen check removed -> .2 red
 * alone (grader 0 points, panel message unchanged). */
head('2c. starting the Mode 3 -> Mode 1 walkthrough clears the 1/M plot (layman pass 8 S-1)');
w.tick(1);
var oomB = w.snap().instructor.one_over_m;
ck('precondition: the plot holds a point from before the walkthrough', oomB.points >= 1, oomB.points + ' point(s)');
w.cmd({ action: 'start_checklist', procedure_id: 'pwr_startup' });
w.tick(1); RD.OneOverM.tick(w.snap());
var oomS = w.snap().instructor.one_over_m;
ck('starting pwr_startup clears the grader\'s table', oomS.points === 0 && oomS.pred_steps == null,
   'grader ' + oomS.points + ' points, step ' + oomS.pred_steps + ', gen ' + oomB.gen + ' -> ' + oomS.gen);
ck('...and the panel\'s own copy, with a message that says why', /new startup walkthrough/.test(msgOf(win)),
   'msg="' + msgOf(win) + '"');
w.cmd({ action: 'stop_checklist' }); w.tick(1);
press(win, 'plot'); w.tick(1);
w.cmd({ action: 'start_checklist', procedure_id: 'pwr_raise_power' });
w.tick(1); RD.OneOverM.tick(w.snap());
var oomR = w.snap().instructor.one_over_m;
ck('...a walkthrough WITHOUT clear_1m leaves the plot alone (it is the flag, not any start)',
   oomR.points === 1 && !/new startup walkthrough/.test(msgOf(win)), 'grader ' + oomR.points + ' point(s), msg="' + msgOf(win) + '"');
w.cmd({ action: 'stop_checklist' }); w.tick(1);

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

/* ============================================================ 6. a rewind keeps earlier points */
/* OWNER PLAYTEST 2026-09-28 (preview, pwr2:pwr_startup): "1/m plot points are lost when
 * rewinding steps". tick() cleared the WHOLE table whenever sim time went behind the LAST
 * capture, so a step rewind past one plot press dropped the baseline and every earlier point.
 * Driven through a real service REWIND (free-play ring, fake wall clock so the 20 s sandbox
 * cadence fires on demand): points taken before the checkpoint the rewind lands on must
 * survive, points after it must go, and a rewind to before the BASELINE still clears all.
 * BOTH COPIES: the panel's, and the grader's (`instructor.one_over_m`, which `pwr_startup` 9a
 * grades "3 short of the 1/M prediction" against) — one rule, RD.OneOverMCore.rewindTo. */
head('6. a rewind drops only the points taken AFTER the checkpoint it lands on');
(function () {
  var r = mkWorld('hot_zero_power');
  var clock = 1e6;
  r.svc._now = function () { return clock; };
  r.svc._lastSandboxCpMs = null;
  function layCheckpoint() {           // one tick to settle, then a tick that lays a mark
    r.tick(1); clock += 20001; r.tick(1);
    var cps = r.svc.checkpoints;
    return cps[cps.length - 1].metadata.sim_time;
  }
  function withdraw(frac) {
    r.cmd({ action: 'rod_nudge', group_id: 'control_rods',
            steps: Math.round(frac * RD.pwr2.kinetics.RODS.max_steps), speed: 'fast' });
    r.tick(90);
  }
  function rewindTo(t) {
    var cps = r.svc.checkpoints, idx = -1;
    for (var i = 0; i < cps.length; i++) if (Math.abs(cps[i].metadata.sim_time - t) < 1e-9) idx = i;
    var res = r.cmd({ action: 'rewind', steps: cps.length - idx, exact: true });
    return res && res.metadata ? res : r.svc.assembleSnapshot();
  }
  function gPts() { r.tick(1); var o = r.snap().instructor && r.snap().instructor.one_over_m; return o ? o.points : -1; }
  function nPts(w) {
    var svg = w.querySelector('svg');
    return ((svg && svg.innerHTML) || '').split('class="oom-pt"').length - 1;
  }

  RD.OneOverM.init({ getSnap: function () { return r.snap(); }, cmd: r.cmd });
  var w = winOf();
  RD.OneOverM.tick(r.snap());          // a plant change from section 4's relabelled snapshot
  RD.OneOverM.open();
  press(w, 'clear');

  var tA = layCheckpoint();            // A: before the baseline
  r.tick(5);
  press(w, 'plot');                    // P1 baseline
  withdraw(0.15);
  press(w, 'plot');                    // P2
  var tB = layCheckpoint();            // B: after P1, P2
  withdraw(0.10);
  press(w, 'plot');                    // P3
  withdraw(0.05);
  press(w, 'plot');                    // P4
  RD.OneOverM.tick(r.snap());
  ck('precondition: four points on the plot before the rewind, in both copies', nPts(w) === 4 && gPts() === 4,
     nPts(w) + ' drawn, grader ' + gPts());

  var rs = rewindTo(tB);
  ck('precondition: the rewind landed on checkpoint B', Math.abs(rs.metadata.sim_time - tB) < 1e-9,
     't=' + rs.metadata.sim_time.toFixed(2) + ' s, B=' + tB.toFixed(2) + ' s');
  RD.OneOverM.tick(rs);
  ck('rewinding to B KEEPS the two points taken before B (the playtest defect)', nPts(w) === 2,
     nPts(w) + ' drawn, msg="' + msgOf(w) + '"');
  ck('...and so does the GRADER\'s copy (what 9a grades)', gPts() === 2, 'grader ' + gPts());

  r.tick(5);
  press(w, 'plot');
  var m = msgOf(w);
  ck('...and the next press extends the SAME curve, not a fresh baseline',
     /1\/M =/.test(m) && !/baseline/.test(m) && nPts(w) === 3, 'msg="' + m + '", ' + nPts(w) + ' drawn');

  var ra = rewindTo(tA);
  RD.OneOverM.tick(ra);
  ck('rewinding to A, before the BASELINE, still clears the whole plot (both copies)', nPts(w) === 0 && gPts() === 0,
     nPts(w) + ' drawn, msg="' + msgOf(w) + '"');
})();

/* ============================================================ 7. a different history clears */
/* 2026-09-28 review: the rewind rule above keeps points when the clock goes back, and nothing
 * but the clock was read — so a save FILE taken later than every capture (a different plant
 * entirely) kept the plot, and so would a reset whose baseline sat at t = 0. The service now
 * publishes metadata.timeline_epoch, bumped by selectPlant and loadState and never by Rewind. */
head('7. a save-file load or a reset is a new history: the plot clears (both copies)');
(function () {
  var r = mkWorld('hot_zero_power');
  function gPts() { r.tick(1); var o = r.snap().instructor && r.snap().instructor.one_over_m; return o ? o.points : -1; }
  function nPts(w) {
    var svg = w.querySelector('svg');
    return ((svg && svg.innerHTML) || '').split('class="oom-pt"').length - 1;
  }
  function withdraw(frac) {
    r.cmd({ action: 'rod_nudge', group_id: 'control_rods',
            steps: Math.round(frac * RD.pwr2.kinetics.RODS.max_steps), speed: 'fast' });
    r.tick(90);
  }
  RD.OneOverM.init({ getSnap: function () { return r.snap(); }, cmd: r.cmd });
  var w = winOf();
  RD.OneOverM.tick(r.snap());
  RD.OneOverM.open();
  press(w, 'clear');
  press(w, 'plot');
  withdraw(0.15);
  press(w, 'plot');
  RD.OneOverM.tick(r.snap());
  var tLast = r.snap().metadata.sim_time;
  ck('precondition: two points on the plot, in both copies', nPts(w) === 2 && gPts() === 2,
     nPts(w) + ' drawn, grader ' + gPts());

  /* a save taken on ANOTHER plant, later in its own clock than every capture here */
  var other = mkWorld('hot_zero_power');
  other.tick(600);
  var saved = JSON.parse(JSON.stringify(other.svc.saveState()));
  var e0 = r.snap().metadata.timeline_epoch;
  r.svc.loadState(saved);
  r.tick(1);
  RD.OneOverM.tick(r.snap());
  ck('precondition: the loaded file is LATER than the last capture (the clock rule alone keeps the plot)',
     r.snap().metadata.sim_time > tLast && r.snap().metadata.timeline_epoch !== e0,
     'file t=' + r.snap().metadata.sim_time.toFixed(1) + ' s vs last capture ' + tLast.toFixed(1) +
     ' s; epoch ' + e0 + ' -> ' + r.snap().metadata.timeline_epoch);
  ck('a save-FILE load clears the plot (panel)', nPts(w) === 0, nPts(w) + ' drawn, msg="' + msgOf(w) + '"');
  ck('...and the grader\'s copy (9a cannot grade against a plot of a plant that is gone)', gPts() === 0,
     'grader ' + gPts());

  /* a reset: same plant, same IC, a new history */
  r.tick(5);
  press(w, 'plot');
  withdraw(0.10);
  press(w, 'plot');
  RD.OneOverM.tick(r.snap());
  var pre = nPts(w), preG = gPts();
  r.cmd({ action: 'reset', plant_id: 'pwr2', initial_state: 'hot_zero_power' });
  r.tick(1);
  RD.OneOverM.tick(r.snap());
  ck('a reset clears the plot (both copies)', pre === 2 && preG === 2 && nPts(w) === 0 && gPts() === 0,
     'before ' + pre + '/' + preG + ', after ' + nPts(w) + '/' + gPts());

  /* and Rewind is NOT a new history: the epoch holds across one */
  var e1 = r.snap().metadata.timeline_epoch;
  var clock = 1e6;
  r.svc._now = function () { return clock; };
  r.svc._lastSandboxCpMs = null;
  r.tick(1); clock += 20001; r.tick(1); r.tick(5);
  var tPre = r.snap().metadata.sim_time;
  var rw = r.cmd({ action: 'rewind', steps: 1, exact: true });
  var rsn = rw && rw.metadata ? rw : r.svc.assembleSnapshot();
  var e2 = rsn.metadata.timeline_epoch;
  ck('a Rewind leaves timeline_epoch where it was (only the clock rule applies to it)',
     e1 === e2 && rsn.metadata.sim_time < tPre - 1,
     'epoch ' + e1 + ' -> ' + e2 + ', clock ' + tPre.toFixed(1) + ' -> ' + rsn.metadata.sim_time.toFixed(1) + ' s');
})();

/* ============================================================ summary */
var expectRed = INJECT || INJECT_RW || INJECT_HIST;
console.log('\n' + BOLD + (nFail === 0 ? GREEN + 'PASS' : RED + 'FAIL') + RST +
  '  ' + nPass + ' passed, ' + nFail + ' failed, ' + (nPass + nFail) + ' checks');
if (INJECT || INJECT_RW || INJECT_HIST) {
  var caught = nFail > 0;
  console.log((caught ? GREEN + 'INJECTION CAUGHT' : RED + 'INJECTION MISSED') + RST +
    ' — the ' + (INJECT_HIST ? 'disabled new-history clear' : INJECT_RW ? 'reverted clear-on-rewind' : 'reverted plant-id guards') + ' ' + (caught ? 'reddened ' + nFail + ' check(s).' : 'changed NOTHING. The gate is hollow.'));
  process.exit(caught ? 0 : 1);
}
process.exit(nFail === 0 ? 0 : 1);
