/*
 * run_events.js — THE SEQUENCE-OF-EVENTS STREAM GATE (#437).
 *
 *   node test/run_events.js
 *
 * WHY IT EXISTS
 * -------------
 * `RD.Events` is a PREREQUISITE for three separate features — the chart's SOE ribbon
 * (#442), checklist relevance ordering (#443) and the lanes' mode annotations (#441) —
 * so a defect in it is a defect in all three, and two of the three are visual, where a
 * missing marker looks like "nothing happened" rather than like a bug. That is the same
 * shape as #432: a recording instrument whose failure mode is silence.
 *
 * The file is a plain global script for the same reason ui/diag_recorder.js is: so this
 * runner can drive it in Node against a REAL plant rather than a fixture. Every assertion
 * below is made against a stepped PWR, not a hand-built snapshot — a hand-built one would
 * assert my idea of what the plant does, which is the trap HR10 names.
 *
 * WHAT IT ASSERTS, and why these
 * ------------------------------
 *   TR-1  seeding — the first observe() must NOT emit. A stream that announces the state
 *         it found (RCP start, MSIV open, condenser available) opens every session with
 *         a burst of artefacts, and they are indistinguishable from real edges downstream.
 *   TR-2  real edges — drive a trip and require the events the operator actually saw,
 *         with the right TIER (tier is set at emission by contract, so a wrong tier is a
 *         wrong marker for ever) and the right ACTOR.
 *   TR-3  operator vs plant — the distinction the timeline exists to teach. A blocked
 *         command must not appear at all: the plant did not change.
 *   TR-4  rewind — the recorded future is dropped AND the edge state is forgotten, or the
 *         first observe() after a rewind compares against a future that did not happen
 *         and invents an edge out of it.
 *   TR-5  one detector — the alarm/scram edges come from the recorder's hook, never from
 *         a second diff of s.alarms in this file's own code (a static check, because the
 *         duplicate would be invisible at runtime until the two disagreed).
 *   TR-6  wiring — the script tag, the load order, and the three call sites in app.js.
 *
 * LAYER: full stack (M4+M5+M6), driven by `svc.tick()` in a loop. NEVER `svc.start()`,
 * which arms setTimeout and advances in WALL time — see the table in test/measure_stack.js.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
function load(p) { require(path.join(ROOT, p)); }

require(path.join(ROOT, 'engines/load_mode.js'));
['engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js',
 'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js',
 'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
 'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js',
 'ui/diag_recorder.js', 'ui/event_stream.js'].forEach(load);

var RD = globalThis.RD;
var GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', RST = '\x1b[0m', BOLD = '\x1b[1m';
var nPass = 0, nFail = 0;
function ck(name, ok, detail) {
  if (ok) { nPass++; console.log('  ' + GREEN + 'PASS' + RST + '  ' + name + (detail ? DIM + '  (' + detail + ')' + RST : '')); }
  else { nFail++; console.log('  ' + RED + 'FAIL' + RST + '  ' + name + (detail ? '  ' + RED + detail + RST : '')); }
}
function head(s) { console.log('\n' + BOLD + s + RST); }

// --------------------------------------------------------------------------- the harness
// Mirrors ui/app.js's wiring exactly: the recorder detects alarm/scram edges and feeds the
// stream through its onEvent hook; the stream observes the same broadcast the recorder
// ticked on. Anything this harness has to do that app.js does not is a wiring bug.
function run(opts) {
  var svc = new RD.SimulationService({ seed: 4660 });
  svc.selectPlant('pwr', opts.ic || 'hot_full_power');
  svc.running = true;
  svc.timeAcceleration = opts.accel || 1;
  svc.attentionStops = false;

  var ev = RD.Events.create();
  ev.reset(0, 'pwr');
  var rec = RD.DiagRecorder.create({ onEvent: function (t, type, detail) { ev.fromRecorder(t, type, detail); } });
  rec.reset('init', null, 0, 'pwr');

  var sched = (opts.cmds || []).map(function (c) { return { at: c.at, body: c.body, sent: false }; });
  var snap = svc.assembleSnapshot();
  while (svc.simTime < opts.forSec) {
    for (var i = 0; i < sched.length; i++) {
      if (!sched[i].sent && svc.simTime >= sched[i].at) {
        var r = svc.handleCommand(sched[i].body);
        var bad = !!(r && (r.type === 'blocked' || r.type === 'error'));
        rec.command(svc.simTime, sched[i].body, bad, false);
        ev.command(svc.simTime, sched[i].body, bad);
        sched[i].sent = true;
      }
    }
    snap = svc.tick();
    rec.tick(snap, svc.takeFine ? svc.takeFine() : null);
    ev.observe(snap);
  }
  return { svc: svc, ev: ev, rec: rec, snap: snap };
}
function types(ev) { return ev.all().map(function (e) { return e.type; }); }
function ofType(ev, t) { return ev.all().filter(function (e) { return e.type === t; }); }

// ==================================================================== TR-1: seeding
head('TR-1  the observer does not announce the state it found');
(function () {
  // Hot full power: RCPs running, MSIVs open, condenser available, turbine on line. Every
  // one of those is a watched boolean sitting TRUE at t=0. None of them is an event.
  var r = run({ forSec: 20 });
  var t = types(r.ev);
  ck('no rcp_start from the seeding pass', t.indexOf('rcp_start') === -1, t.slice(0, 8).join(','));
  ck('no afw_start from the seeding pass', t.indexOf('afw_start') === -1);
  ck('no condenser_lost from the seeding pass', t.indexOf('condenser_lost') === -1);
  ck('no mode_change from the seeding pass', t.indexOf('mode_change') === -1);
  // A steady plant at power is allowed to be quiet. It is NOT allowed to be noisy.
  ck('a steady 20 s at power stays quiet', r.ev.count() <= 4, r.ev.count() + ' events: ' + t.join(','));
}());

// ==================================================================== TR-2: real edges
head('TR-2  a real trip produces the events, tiers and refs a timeline needs');
(function () {
  var r = run({ forSec: 240, cmds: [{ at: 30, body: { action: 'scram' } }] });
  var t = types(r.ev);
  var sc = ofType(r.ev, 'scram')[0];
  ck('the scram is on the stream', !!sc, t.join(',').slice(0, 120));
  ck('…at tier 1 (plant-defining)', !!sc && sc.tier === 1, sc ? 'tier=' + sc.tier : '—');
  ck('…attributed to the plant, not the operator', !!sc && sc.actor === 'plant', sc ? sc.actor : '—');
  ck('…carrying a component ref the highlight bus can resolve', !!sc && sc.ref === 'SCRAM', sc ? String(sc.ref) : '—');
  ck('…and after the operator command that caused it',
    !!sc && ofType(r.ev, 'cmd_scram').length === 1 && ofType(r.ev, 'cmd_scram')[0].t <= sc.t);
  // The turbine goes with the reactor above P-9; either way the trip is a tier-1 event.
  var tt = ofType(r.ev, 'turbine_trip')[0];
  ck('the turbine trip is a tier-1 event', !!tt && tt.tier === 1, tt ? 'tier=' + tt.tier + ' t=' + tt.t.toFixed(1) : 'absent');
  ck('alarms reach the stream as component-tier events', ofType(r.ev, 'alarm').length > 0,
    ofType(r.ev, 'alarm').length + ' alarm events');
  ck('an alarm clearing is tier 3, not tier 2',
    ofType(r.ev, 'alarm_clear').every(function (e) { return e.tier === 3; }));
  ck('every event carries t, type, tier, ref, actor',
    r.ev.all().every(function (e) {
      return typeof e.t === 'number' && typeof e.type === 'string' &&
        (e.tier === 1 || e.tier === 2 || e.tier === 3) &&
        (e.ref === null || typeof e.ref === 'string') &&
        (e.actor === 'plant' || e.actor === 'operator');
    }));
  // The window query is what the ribbon draws from.
  var win = r.ev.inWindow(25, 60);
  ck('inWindow() returns only what fell inside it',
    win.length > 0 && win.every(function (e) { return e.t >= 25 - 1e-6 && e.t <= 60 + 1e-6; }),
    win.length + ' in [25,60] of ' + r.ev.count());
}());

// ============================================================== TR-3: operator vs plant
head('TR-3  operator actions are distinguished from plant responses');
(function () {
  var r = run({
    forSec: 120,
    cmds: [{ at: 20, body: { action: 'set_rcp', running: false } },
           { at: 40, body: { action: 'rod_nudge', steps: 5, direction: 'out' } }]
  });
  var op = r.ev.all().filter(function (e) { return e.actor === 'operator'; });
  var pl = r.ev.all().filter(function (e) { return e.actor === 'plant'; });
  ck('operator commands appear as operator events', op.length >= 1, op.map(function (e) { return e.type; }).join(','));
  ck('plant responses appear as plant events', pl.length >= 1, pl.length + ' plant events');
  ck('the RCP command is a component-tier operator event',
    op.some(function (e) { return e.type === 'cmd_set_rcp' && e.tier === 2 && e.ref === 'Reactor Coolant Pumps (RCP)'; }));
  ck('an unlisted command falls to tier 3 rather than inventing a tier',
    op.filter(function (e) { return e.type === 'cmd_rod_nudge'; }).every(function (e) { return e.tier === 3; }));
  // Stopping the pumps is the operator's action; the pumps stopping is the plant's.
  var stop = ofType(r.ev, 'rcp_stop')[0];
  ck('the resulting rcp_stop is attributed to the PLANT', !!stop && stop.actor === 'plant',
    stop ? stop.actor : 'no rcp_stop');
}());
(function () {
  // A blocked command changed nothing, so it is not on the timeline. Asserted by
  // INJECTION rather than by hoping one gets blocked: call command() with blocked=true.
  var ev = RD.Events.create(); ev.reset(0, 'pwr');
  ev.command(10, { action: 'set_rcp', running: true }, true);
  ck('a blocked command produces no event', ev.count() === 0, ev.count() + ' events');
  ev.command(11, { action: 'set_rcp', running: true }, false);
  ck('…and the same command unblocked does', ev.count() === 1);
}());

// ==================================================================== TR-4: rewind
head('TR-4  a rewind drops the future AND forgets the edge state');
(function () {
  var r = run({ forSec: 200, cmds: [{ at: 30, body: { action: 'scram' } }] });
  var before = r.ev.count();
  var late = r.ev.all().filter(function (e) { return e.t > 60; }).length;
  ck('there is a recorded future to drop', late > 0, late + ' events after t=60');
  r.ev.rewind(60);
  ck('events after the rewind point are gone',
    r.ev.all().every(function (e) { return e.t <= 60.001; }), before + ' -> ' + r.ev.count());
  // The trap: the next observe() sees a plant whose booleans are the POST-trip ones (the
  // service was not actually rewound here), and must treat them as a fresh seed rather
  // than as edges against readings from a future that no longer exists.
  var n = r.ev.count();
  r.ev.observe(r.snap);
  ck('the first observe() after a rewind re-seeds instead of emitting',
    r.ev.count() === n, (r.ev.count() - n) + ' invented events');
}());

// ============================================================ TR-5: one detector only
head('TR-5  alarm and scram edges have exactly one detector');
(function () {
  var src = fs.readFileSync(path.join(ROOT, 'ui/event_stream.js'), 'utf8');
  // The recorder owns these. If this file ever grows its own alarm diff, the two can
  // disagree — which is #432's shape, and is invisible until they do.
  ck('event_stream.js does not diff s.alarms itself', !/\.alarms\b/.test(src),
    (src.match(/.{0,40}\.alarms.{0,30}/) || [''])[0]);
  ck('event_stream.js does not read rps_state itself', !/rps_state/.test(src));
  ck('…it takes them from the recorder hook', /fromRecorder/.test(src));
  var app = fs.readFileSync(path.join(ROOT, 'ui/app.js'), 'utf8');
  ck('app.js feeds the recorder hook into the stream', /RD\.Events\.fromRecorder\(/.test(app));
}());

// ==================================================================== TR-6: wiring
head('TR-6  the stream is actually wired into the shell');
(function () {
  var html = fs.readFileSync(path.join(ROOT, 'ui/shell.html'), 'utf8');
  var iEv = html.indexOf('event_stream.js'), iApp = html.indexOf('src="app.js"');
  ck('ui/shell.html loads event_stream.js', iEv !== -1);
  ck('…before app.js, which subscribes at load', iEv !== -1 && iApp !== -1 && iEv < iApp,
    'event_stream@' + iEv + ' app@' + iApp);
  var app = fs.readFileSync(path.join(ROOT, 'ui/app.js'), 'utf8');
  // observe() must ride diagTick — the SYNCHRONOUS per-broadcast subscriber. Inside the
  // rAF paint it would see rows one frame late, which is exactly the #432 defect.
  var dt = app.slice(app.indexOf('function diagTick('), app.indexOf('function diagTick(') + 900);
  ck('observe() is called from diagTick, the synchronous subscriber', /RD\.Events\.observe\(/.test(dt),
    dt.split('\n').slice(0, 3).join(' ').slice(0, 60));
  ck('commands reach the stream from cmd()', /RD\.Events\.command\(/.test(app));
  ck('a plant change resets the stream', /RD\.Events\.reset\(/.test(app));
}());

// ======================================================= TR-7: the table is honest
head('TR-7  the watch table names fields and labels that exist');
(function () {
  var r = run({ forSec: 10 });
  var ts = r.snap.true_state;
  var miss = RD.Events.WATCH.pwr.filter(function (w) { return !(w.f in ts); });
  ck('every watched field exists in true_state', miss.length === 0,
    miss.map(function (w) { return w.f; }).join(','));
  // The refs are CONTROL_LABEL_MAP labels. That file is browser-side (it pulls in the
  // board), so read it as TEXT — the point is that a ref cannot be a typo nobody notices
  // until the highlight bus silently fails to light anything.
  var wiring = fs.readFileSync(path.join(ROOT, 'ui/diagram/board/pwr_board_wiring.js'), 'utf8');
  var map = wiring.slice(wiring.indexOf('var CONTROL_LABEL_MAP'), wiring.indexOf('var CONTROL_LABEL_MAP') + 4000);
  var refs = RD.Events.WATCH.pwr.map(function (w) { return w.ref; })
    .concat(Object.keys(RD.Events.CMD_REF).map(function (k) { return RD.Events.CMD_REF[k]; }))
    .filter(Boolean);
  var bad = refs.filter(function (ref) { return map.indexOf("'" + ref + "'") === -1; });
  ck('every component ref is a real CONTROL_LABEL_MAP label', bad.length === 0, bad.join(' | '));
  ck('every watched channel names at least one edge as an event',
    RD.Events.WATCH.pwr.every(function (w) { return w.on || w.off; }));
  ck('every tier in the tables is 1, 2 or 3',
    RD.Events.WATCH.pwr.every(function (w) { return [1, 2, 3].indexOf(w.tier) !== -1; }) &&
    Object.keys(RD.Events.CMD_TIER).every(function (k) { return [1, 2, 3].indexOf(RD.Events.CMD_TIER[k]) !== -1; }));
}());

// ============================================================ TR-8: the ring is bounded
head('TR-8  the ring is bounded');
(function () {
  var ev = RD.Events.create(); ev.reset(0, 'pwr');
  for (var i = 0; i < RD.Events.MAX_EVENTS + 500; i++) ev.push(i, 'test', 3, null, 'plant', null);
  ck('the ring stops at MAX_EVENTS', ev.count() === RD.Events.MAX_EVENTS, ev.count() + '');
  ck('…dropping the OLDEST, not the newest', ev.all()[ev.count() - 1].t === RD.Events.MAX_EVENTS + 499);
}());

console.log('\n' + BOLD + '──────────────────────────────────────────' + RST);
console.log(BOLD + (nFail ? RED : GREEN) + nPass + ' checks passed / ' + nFail + ' failed' + RST + '\n');
process.exit(nFail ? 1 : 0);
