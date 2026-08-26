/*
 * run_diag_bundle.js — THE BUG-REPORT RECORDER GATE (#432).
 *
 *   node test/run_diag_bundle.js
 *
 * WHY IT EXISTS
 * -------------
 * Nothing in test/ had ever touched the session recorder. That is not a coverage
 * observation, it is the CAUSE: the recorder lived inside ui/app.js, which is browser-only,
 * so no Node runner could reach it and no browser gate ever looked. It therefore shipped
 * sampling once per BROADCAST — 1 Hz at 1x, one row per 180 s at 3600x — under a manifest
 * that said `sample_hz: 1` unconditionally, and nobody found out until the owner sent a
 * report of a large LOCA taken at 3600x and the whole accident was TWO ROWS:
 *
 *     t=13685.5  100.01 %  2235 psi (15.41 MPa)
 *     t=14045.5    0.00 %    56 psi ( 0.39 MPa)
 *
 * Blowdown, scram, SI and the pressurizer emptying all inside one gap. The plant was never
 * wrong — protection has been on a 0.1 s sim-time cadence at every speed since #153 — only
 * the recording of it was.
 *
 * WHAT IT ASSERTS, and the shape of the assertions
 * ------------------------------------------------
 * The failure being guarded is a SILENT LOSS OF RESOLUTION, and the trap in guarding that is
 * writing a check the defect walks straight past. Two specifically:
 *
 *   - "there are samples" passes on the broken recorder (there were 211 of them).
 *   - "the manifest says 1 Hz" passed on the broken recorder too, because the manifest was a
 *     literal. So `sampling` is checked AGAINST THE DATA — the row timestamps — rather than
 *     read and believed. A manifest that cannot disagree with its own timeseries is the
 *     specific property #432 was about.
 *
 * The load-bearing check is TR-4: at 3600x, a transient must leave a mark in the extremes.
 * On point sampling every bucket folds exactly one reading, so `hi - lo` is identically 0
 * and the check is red — verified by injection before the fix landed.
 *
 * LAYER: full stack (M4+M5+M6), driven by `svc.tick()` in a loop. NEVER `svc.start()`, which
 * arms setTimeout and advances in WALL time — see the table in test/measure_stack.js.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
function load(p) { require(path.join(ROOT, p)); }

require(path.join(ROOT, 'engines/load_mode.js'));
['engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js',
 'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_pressurizer2.js', 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js',
 'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
 'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js',
 'ui/diag_recorder.js'].forEach(load);

var RD = globalThis.RD;
var GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', RST = '\x1b[0m', BOLD = '\x1b[1m';
var nPass = 0, nFail = 0;
function ck(name, ok, detail) {
  if (ok) { nPass++; console.log('  ' + GREEN + 'PASS' + RST + '  ' + name + (detail ? DIM + '  (' + detail + ')' + RST : '')); }
  else { nFail++; console.log('  ' + RED + 'FAIL' + RST + '  ' + name + (detail ? '  ' + RED + detail + RST : '')); }
}
function head(s) { console.log('\n' + BOLD + s + RST); }
var psi = function (mpa) { return (mpa * 145.0377).toFixed(0); };

// --------------------------------------------------------------------------- the harness
// One run: build the stack, register the fine sampler the way ui/app.js does, drive tick()
// and hand each broadcast's drained rows to the recorder. `sampler:false` reproduces a
// context with no sampler registered — a headless harness, or the fallback path.
function run(opts) {
  var svc = new RD.SimulationService({ seed: 4660 });
  svc.selectPlant('pwr', opts.ic || 'hot_full_power');
  svc.running = true;
  svc.timeAcceleration = opts.accel || 1;
  svc.attentionStops = false;          // a scram must not silently drop the clock to 1x here

  if (opts.sampler !== false) {
    // What ui/app.js's chartSample contributes on the recorder's side. The chart's own two
    // sides are irrelevant to this gate and would only cost time to fabricate.
    svc.setFineSampler(function (ins, truth) { return { dv: RD.DiagRecorder.pack('pwr', truth) }; });
  }

  var rec = RD.DiagRecorder.create({});
  rec.reset('init', { engine_key: 'pwr', initial_state: opts.ic || 'hot_full_power' }, 0, 'pwr');

  var sched = (opts.cmds || []).map(function (c) { return { at: c.at, body: c.body, sent: false }; });
  var snap = svc.assembleSnapshot();
  while (svc.simTime < opts.forSec) {
    for (var i = 0; i < sched.length; i++) {
      if (!sched[i].sent && svc.simTime >= sched[i].at) {
        var r = svc.handleCommand(sched[i].body);
        rec.command(svc.simTime, sched[i].body, !!(r && r.type === 'blocked'), !!(r && r.type === 'error'));
        sched[i].sent = true;
      }
    }
    snap = svc.tick();
    rec.tick(snap, svc.takeFine ? svc.takeFine() : null);
  }
  return { svc: svc, rec: rec, bundle: rec.build({ snapshot: snap, seed: svc.seed, engine_key: 'pwr' }) };
}

// Row spacings. The LAST row is a deliberate partial — `build()` records the export instant
// wherever it falls in the grid — so it is excluded from spacing assertions rather than
// allowed to widen every band by one arbitrary interval.
function dts(ts) { var d = []; for (var i = 1; i < ts.t.length - 1; i++) d.push(ts.t[i] - ts.t[i - 1]); return d; }
function col(ts, f) { return ts.fields.indexOf(f); }
function min(a) { return a.reduce(function (x, y) { return y < x ? y : x; }, Infinity); }
function max(a) { return a.reduce(function (x, y) { return y > x ? y : x; }, -Infinity); }

// =========================================================================== TR-1: shape
head('TR-1  the bundle is what it says it is');
(function () {
  var b = run({ accel: 1, forSec: 30 }).bundle;
  var ts = b.timeseries;
  ck('schema_version is 1.1', b.schema_version === '1.1', b.schema_version);
  ck('the timeseries is columnar', !!(ts && ts.fields && ts.t && ts.v && ts.lo && ts.hi),
    Object.keys(ts || {}).join(','));
  var lens = [ts.t.length, ts.accel.length].concat(ts.v.map(function (c) { return c.length; }))
    .concat(ts.lo.map(function (c) { return c.length; })).concat(ts.hi.map(function (c) { return c.length; }));
  ck('every column is the same length as `t`', lens.every(function (n) { return n === ts.t.length; }),
    'rows=' + ts.t.length + ' distinct lengths=' + Array.from(new Set(lens)).join(','));
  ck('one column per declared field', ts.v.length === ts.fields.length,
    ts.v.length + ' columns / ' + ts.fields.length + ' fields');
  // The specific literal that was the defect. A grep, because a reader that finds the key
  // will believe it whatever it holds.
  ck('`sample_hz` is gone from the manifest', !('sample_hz' in b.manifest),
    JSON.stringify(b.manifest.sampling));
  ck('`sampling` declares the floor, the extremes and the source',
    !!(b.manifest.sampling && typeof b.manifest.sampling.grid_s === 'number' &&
       b.manifest.sampling.extremes === true && b.manifest.sampling.source),
    JSON.stringify(b.manifest.sampling));
}());

// ============================================================== TR-2: 1x is not disturbed
head('TR-2  1x still records at 1 Hz — the fix must not move the ordinary case');
(function () {
  var b = run({ accel: 1, forSec: 60 }).bundle, ts = b.timeseries, d = dts(ts);
  ck('the grid is 1 s at 1x', Math.abs(max(d) - 1) < 0.05 && Math.abs(min(d) - 1) < 0.05,
    'dt min ' + min(d).toFixed(3) + ' max ' + max(d).toFixed(3) + ' s');
  ck('~1 row per second of sim', Math.abs(ts.t.length - 61) <= 2,
    ts.t.length + ' rows over ' + ts.t[ts.t.length - 1].toFixed(1) + ' s');
  // AND THE SOURCE IS `broadcast` AT 1x, WHICH IS CORRECT AND WORTH PINNING. The service's
  // fine grid is 0.2 s while a 1x broadcast carries only 0.1 s of sim, and the emit is
  // skipped on the final step of the loop — so no fine row is ever produced at 1x and the
  // recorder falls through to the broadcast instant. That path gives 10 samples a second to
  // choose a 1 Hz grid from, which is why 1x never needed fixing. Pinned because a future
  // change to CHART_FINE_SEC would silently move which path the ordinary case runs on.
  ck('at 1x the source is the broadcast, and that is the right answer',
    b.manifest.sampling.source === 'broadcast', b.manifest.sampling.source);
}());

// ====================================================== TR-3: the grid holds at 3600x
head('TR-3  at 3600x the grid rides the service\'s fine sampler, not the broadcast');
(function () {
  var b = run({ accel: 3600, forSec: 3600 }).bundle, ts = b.timeseries, d = dts(ts);
  // A broadcast at 3600x carries 360 s. CHART_FINE_MAX caps the service at 60 buckets, so
  // 6 s is the floor the fine seam can offer — and 6 s is what the recorder must see, not
  // the 360 s the old broadcast-only path gave.
  ck('rows are at most 6 s apart at 3600x', max(d) <= 6.0 + 1e-6,
    'dt max ' + max(d).toFixed(2) + ' s over ' + ts.t.length + ' rows');
  ck('…and never finer than the declared floor', min(d) >= b.manifest.sampling.grid_s - 1e-6,
    'dt min ' + min(d).toFixed(2) + ' s, floor ' + b.manifest.sampling.grid_s + ' s');
  // THE MANIFEST IS CHECKED AGAINST THE DATA. This is the assertion the old bundle could
  // never have failed, because its manifest was a literal with nothing to disagree with.
  ck('the declared floor is consistent with the observed spacing',
    min(d) >= b.manifest.sampling.grid_s - 1e-6 && b.manifest.sampling.grid_s > 0,
    'floor ' + b.manifest.sampling.grid_s + ' s vs observed min ' + min(d).toFixed(2) + ' s');
  ck('an hour at 3600x is hundreds of rows, not two', ts.t.length > 400,
    ts.t.length + ' rows');
}());

// ============================================ TR-4: the transient survives the coarse grid
head('TR-4  a transient at 3600x leaves a mark — the check that fails on point sampling');
(function () {
  // The owner's own report, reproduced: hot_full_power at 3600x, large_loca sev 0.4.
  var b = run({
    accel: 3600, forSec: 1800,
    cmds: [{ at: 300, body: { action: 'inject_failure', failure_id: 'large_loca', severity: 0.4 } }]
  }).bundle;
  var ts = b.timeseries, p = col(ts, 'pressure_mpa');
  ck('the timeseries carries pressure', p >= 0, 'fields: ' + ts.fields.join(','));

  // Rows inside the blowdown: from the injection to wherever pressure has settled low.
  var idx = [], i;
  for (i = 0; i < ts.t.length; i++) if (ts.t[i] >= 300 && ts.t[i] <= 900) idx.push(i);
  ck('the blowdown is more than one row', idx.length >= 50,
    idx.length + ' rows across 600 s of it');

  // THE LOAD-BEARING ONE. Every bucket on the old recorder folded exactly ONE reading, so
  // hi - lo was identically zero and there was nothing between two samples at all.
  var widest = 0, at = null;
  for (i = 0; i < idx.length; i++) {
    var lo = ts.lo[p][idx[i]], hi = ts.hi[p][idx[i]];
    if (lo == null || hi == null) continue;
    if (hi - lo > widest) { widest = hi - lo; at = ts.t[idx[i]]; }
  }
  ck('some bucket spans a real pressure swing the point samples miss', widest > 0.2,
    'widest span ' + psi(widest) + ' psi (' + widest.toFixed(2) + ' MPa) at t=' + (at == null ? '-' : at.toFixed(0)) + ' s');

  // And the extremes must carry information the value column does not: the lowest pressure
  // the plant actually reached is below the lowest one a point sample happened to catch.
  var vs = [], los = [];
  for (i = 0; i < idx.length; i++) { if (ts.v[p][idx[i]] != null) vs.push(ts.v[p][idx[i]]); if (ts.lo[p][idx[i]] != null) los.push(ts.lo[p][idx[i]]); }
  ck('the recorded minimum comes from the extremes, not the point samples', min(los) < min(vs) + 1e-9,
    'lo min ' + psi(min(los)) + ' psi vs v min ' + psi(min(vs)) + ' psi');

  var scram = b.events.filter(function (e) { return e.type === 'scram'; })[0];
  ck('the scram is recorded with its trip reason', !!scram, scram ? scram.trip_reason || JSON.stringify(scram.detail) : 'none');
}());

// ============================================================ TR-5: the fallback is honest
head('TR-5  with no sampler registered the recorder still works, and SAYS so');
(function () {
  var b = run({ accel: 60, forSec: 60, sampler: false }).bundle, ts = b.timeseries;
  ck('a bundle is still produced', ts.t.length > 0, ts.t.length + ' rows');
  ck('the source is declared `broadcast`', b.manifest.sampling.source === 'broadcast',
    b.manifest.sampling.source);
  // 60x means a broadcast carries 6 s, so the honest answer is 6 s rows — the point is that
  // the bundle does not claim 1 Hz while delivering this.
  var d = dts(ts);
  ck('the spacing is the broadcast\'s, and the row timestamps show it', min(d) >= 1 - 1e-6,
    'dt min ' + min(d).toFixed(2) + ' max ' + max(d).toFixed(2) + ' s');
}());

// ================================================================== TR-6: the ring is bounded
head('TR-6  the sample ring is bounded, and drops the OLDEST');
(function () {
  var rec = RD.DiagRecorder.create({});
  rec.reset('init', null, 0, 'pwr');
  var N = RD.DiagRecorder.MAX_SAMPLES;
  // Synthetic broadcasts — this is about the ring, not the plant, and 14,400 real seconds of
  // sim to prove an array bound would cost minutes for nothing.
  for (var t = 0; t <= N + 200; t++) {
    rec.tick({ metadata: { sim_time: t, time_acceleration: 1 }, true_state: { pressure_mpa: 15 + t * 1e-6 }, alarms: [], rps_state: {} }, null);
  }
  var ts = rec.build({}).timeseries;
  ck('rows never exceed MAX_SAMPLES', ts.t.length <= N, ts.t.length + ' / ' + N);
  ck('every column was shifted with `t`', ts.v.every(function (c) { return c.length === ts.t.length; }),
    'v lengths ' + Array.from(new Set(ts.v.map(function (c) { return c.length; }))).join(','));
  ck('it is the OLDEST rows that went', ts.t[0] > 0 && ts.t[ts.t.length - 1] > N,
    'first t=' + ts.t[0] + ' last t=' + ts.t[ts.t.length - 1]);
}());

// ============================================================= TR-7: rewind drops the future
head('TR-7  a rewind drops the recorded future');
(function () {
  var rec = RD.DiagRecorder.create({});
  rec.reset('init', null, 0, 'pwr');
  function snap(t) { return { metadata: { sim_time: t, time_acceleration: 1 }, true_state: { pressure_mpa: 15 }, alarms: [], rps_state: {} }; }
  for (var t = 0; t <= 100; t++) rec.tick(snap(t), null);
  var before = rec.build({}).timeseries.t.length;
  rec.tick(snap(40), null);
  var ts = rec.build({}).timeseries;
  ck('rows past the rewind point are gone', max(ts.t) <= 41,
    before + ' rows -> ' + ts.t.length + ', last t=' + max(ts.t));
  ck('the rewind is recorded as an event',
    rec.build({}).events.some(function (e) { return e.type === 'time_rewind'; }));
}());

// ==================================================== TR-9: the first alarm scan is not noise
head('TR-9  the first alarm scan captures the non-clear starting state ONLY (#504)');
(function () {
  var rec = RD.DiagRecorder.create({});
  rec.reset('init', null, 0, 'pwr');
  function snap(t, alarms) { return { metadata: { sim_time: t, time_acceleration: 1 }, true_state: { pressure_mpa: 15 }, alarms: alarms, rps_state: {} }; }
  var panel = [{ id: 'porv_open', state: 'active' }];
  for (var i = 0; i < 8; i++) panel.push({ id: 'quiet_' + i, state: 'clear' });
  rec.tick(snap(0.1, panel), null);
  var ev1 = rec.build({}).events.filter(function (e) { return e.type === 'alarm'; });
  // Pre-#504 this read 9: every clear alarm shipped as a clear->clear non-transition
  // (47 of 48 events in both 2026-08-21 bundles).
  ck('first pass: 1 active + 8 clear -> exactly 1 alarm event', ev1.length === 1,
    ev1.length + ' events: ' + ev1.map(function (e) { return e.detail.id + '=' + e.detail.state; }).join(','));
  ck('…and it is the active one', ev1.length === 1 && ev1[0].detail.id === 'porv_open' && ev1[0].detail.state === 'active');
  panel = panel.map(function (a) { return a.id === 'quiet_0' ? { id: a.id, state: 'active' } : a; });
  rec.tick(snap(0.2, panel), null);
  var ev2 = rec.build({}).events.filter(function (e) { return e.type === 'alarm'; });
  ck('second pass: one transition -> exactly one more event', ev2.length === 2,
    ev2.length + ' events');
  ck('…recording the transition with its previous state', ev2.length === 2 &&
    ev2[1].detail.id === 'quiet_0' && ev2[1].detail.state === 'active' && ev2[1].detail.was === 'clear');
}());

// ====================================================== TR-8: the wiring, which a Node gate
// cannot execute. Everything above drives the recorder directly, so it would all stay green
// if ui/app.js stopped calling it. These are source scans for exactly that gap.
head('TR-8  the UI is still wired to it (source scan — this gate cannot execute app.js)');
(function () {
  var shell = fs.readFileSync(path.join(ROOT, 'ui/shell.html'), 'utf8');
  // STRIP COMMENTS BEFORE SCANNING. A source scan that reads prose finds whatever the prose
  // is ABOUT: the `sample_hz` check below went red on the paragraph explaining that
  // `sample_hz` had been removed. The `[^:]` guard keeps `https://` out of the line-comment
  // rule. Same trap as the Indications registry scan (CLAUDE.md, standing procedure).
  function code(src) { return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1'); }
  var app = code(fs.readFileSync(path.join(ROOT, 'ui/app.js'), 'utf8'));
  var iRec = shell.indexOf('diag_recorder.js'), iApp = shell.indexOf('"app.js"');
  ck('ui/shell.html loads diag_recorder.js', iRec !== -1);
  ck('…before app.js, which constructs a recorder at load', iRec !== -1 && iApp !== -1 && iRec < iApp,
    'diag_recorder@' + iRec + ' app@' + iApp);
  ck('chartSample packs the recorder\'s side', /RD\.DiagRecorder\.pack\(/.test(app));
  ck('the fine drain reaches the recorder', /pendingDiagFine/.test(app));
  ck('app.js no longer writes a hardcoded sample_hz', !/sample_hz/.test(app),
    (app.match(/.{0,40}sample_hz.{0,40}/) || [''])[0]);
}());

console.log('\n' + BOLD + '──────────────────────────────────────────' + RST);
console.log(BOLD + (nFail ? RED : GREEN) + nPass + ' checks passed / ' + nFail + ' failed' + RST + '\n');
process.exit(nFail ? 1 : 0);
