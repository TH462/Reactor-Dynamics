/*
 * run_m5.js — integration smoke test for the Simulation Service (M5) driving the
 * full assembled PWR stack (engine M1 + Control & Failure M4 + the default
 * pass-through Instructor slot). A DEV check, not the M7 Test Runner: it
 * exercises snapshot completeness, the step loop, command routing through the
 * whole stack (HR5), lifecycle, acceleration stability, transient cadence,
 * determinism, and service-level save/restore.
 *
 *   node test/run_m5.js
 */
'use strict';
var path = require('path');
function load(p) { require(path.join(__dirname, '..', p)); }
[
  'engines/pwr/pwr_config.js', 'engines/pwr/pwr_protection.js', 'engines/pwr/pwr_thermal.js',
  'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js',
  'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
  'layers/control_failure_layer.js', 'layers/simulation_service.js',
].forEach(load);
var RD = globalThis.RD;

function svc(opts) {
  opts = opts || {};
  var s = new RD.SimulationService({ seed: opts.seed != null ? opts.seed : 42 });
  s.selectPlant('pwr', opts.initial_state || 'hot_full_power', null);
  return s;
}
// Physics-relevant slice of a snapshot (excludes wall_time, which is display-only).
function physics(snap) {
  return JSON.stringify({
    true_state: snap.true_state, instruments: snap.instruments, control_state: snap.control_state,
    rps_state: snap.rps_state, alarms: snap.alarms, active_failures: snap.active_failures,
    sim_time: snap.metadata.sim_time,
  });
}

function test(name, fn) {
  var checks = [];
  var ck = function (d, o, p, e) { checks.push({ desc: d, observed: o, expected: e, pass: !!p }); };
  try { fn(ck); } catch (e) { ck('threw: ' + (e && e.message), String(e && e.stack || e), false, 'no throw'); }
  return { name: name, pass: checks.every(function (c) { return c.pass; }), checks: checks };
}
var T = [];

T.push(test('Snapshot — complete, well-shaped, truth & indication both present (HR4)', function (ck) {
  var s = svc();
  var snap = s.advanceCycles(1);
  var top = ['type', 'schema_version', 'metadata', 'true_state', 'instruments', 'control_state', 'rps_state', 'alarms', 'active_failures', 'instructor'];
  ck('all top-level sections present', Object.keys(snap).join(','), top.every(function (k) { return k in snap; }), top.join(','));
  var md = ['sim_time', 'running', 'time_acceleration', 'wall_time', 'plant_id', 'design_version'];
  ck('metadata complete', Object.keys(snap.metadata).join(','), md.every(function (k) { return k in snap.metadata; }), md.join(','));
  ck('plant_id = pwr', snap.metadata.plant_id, snap.metadata.plant_id === 'pwr', 'pwr');
  ck('truth present (true_state.power_pct)', snap.true_state.power_pct.toFixed(1), typeof snap.true_state.power_pct === 'number', 'number');
  ck('indication present (instruments.power_range)', snap.instruments.power_range.toFixed(1), typeof snap.instruments.power_range === 'number', 'number');
  ck('truth ≠ indication (instruments differ from truth)', (snap.instruments.tavg - snap.true_state.tavg_c).toFixed(3), snap.instruments.tavg !== snap.true_state.tavg_c, 'differ (noise/lag)');
  ck('instructor block null for default slot', JSON.stringify(snap.instructor), snap.instructor.message === null, '{message:null,...}');
}));

T.push(test('Step loop — advances sim_time by the broadcast cadence each cycle (1×)', function (ck) {
  var s = svc();
  var dtCycle = s.broadcastMs / 1000;   // steady cadence at 1× (no transient)
  var t0 = s.simTime;
  s.advanceCycles(4);
  var expect = 4 * dtCycle;
  ck('sim_time advanced 4 cycles', (s.simTime - t0).toFixed(3), Math.abs((s.simTime - t0) - expect) < 1e-9, expect.toFixed(3) + ' s');
  ck('still ~100% power (steady, stable)', s.engine.getTrueState().power_pct.toFixed(2), Math.abs(s.engine.getTrueState().power_pct - 100) < 1.0, '~100%');
}));

T.push(test('Command routing — plant command descends the full stack to the engine (HR5)', function (ck) {
  var s = svc();
  var before = s.engine.getControlState().rod_groups[0].steps;
  s.handleCommand({ action: 'rod_nudge', group_id: 'control_rods', steps: -10 }); // insert
  // A nudge drives to its target at rod speed (M1 §7), not instantly — step the
  // sim until the control group reaches before-10 (or a generous cycle cap).
  for (var i = 0; i < 400 && s.engine.getControlState().rod_groups[0].steps > before - 10; i++) s.advanceCycles(1);
  var after = s.engine.getControlState().rod_groups[0].steps;
  ck('rod_nudge reached the engine via instructor→M4→engine', before + '→' + after, after === before - 10, String(before - 10));
}));

T.push(test('Full-stack interception — stuck-open PORV defeats close, routed through M5', function (ck) {
  var s = svc();
  s.advanceCycles(1);
  s.handleCommand({ action: 'open_porv' });
  s.handleCommand({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
  s.handleCommand({ action: 'close_porv' });               // intercepted in M4 → open_porv
  var snap = s.advanceCycles(1);
  ck('valve stays open', snap.true_state.porv_open, snap.true_state.porv_open === true, true);
  ck('failure shows in snapshot active_failures', JSON.stringify(snap.active_failures), snap.active_failures.some(function (f) { return f.id === 'stuck_porv_open'; }), 'contains stuck_porv_open');
}));

T.push(test('Lifecycle — play/pause gate the loop', function (ck) {
  var s = svc();
  s.stop();
  var t0 = s.simTime;
  var r = s.tick();              // paused → no-op
  ck('tick is a no-op while paused', String(r) + ' / Δt=' + (s.simTime - t0), r === null && s.simTime === t0, 'null, no advance');
  s.handleCommand({ action: 'play' });
  ck('play sets running', s.running, s.running === true, true);
  s.handleCommand({ action: 'pause' });
  ck('pause clears running', s.running, s.running === false, false);
}));

T.push(test('Acceleration — more sim-time per cycle, physics stays stable (fixed-dt steps)', function (ck) {
  var s = svc();
  s.handleCommand({ action: 'set_speed', value: 60 });
  var dtCycle = s.broadcastMs / 1000;
  var t0 = s.simTime;
  s.advanceCycles(2);
  var expect = 2 * 60 * dtCycle;        // 60× → 60 s of sim time per second of cadence
  ck('60× advances ' + expect.toFixed(1) + ' s in 2 cycles', (s.simTime - t0).toFixed(2), Math.abs((s.simTime - t0) - expect) < 1e-6, expect.toFixed(1) + ' s');
  ck('power did NOT diverge (stable at 60×)', s.engine.getTrueState().power_pct.toFixed(2), Math.abs(s.engine.getTrueState().power_pct - 100) < 2, '~100%');
}));

T.push(test('Transient cadence — tightens on a transient, relaxes when steady', function (ck) {
  var s = svc();
  s.advanceCycles(3);
  var normalMs = s.broadcastMs;   // steady cadence
  ck('normal cadence at steady state', normalMs + ' ms', normalMs > 0, 'normal');
  s.handleCommand({ action: 'scram' });
  s.advanceCycles(1);            // power drops sharply → transient
  ck('cadence tightens on scram', s.broadcastMs + ' ms', s.broadcastMs < normalMs, '< ' + normalMs + ' ms');
  s.advanceCycles(60);          // decay settles → rate per interval small again
  ck('cadence relaxes once settled', s.broadcastMs + ' ms', s.broadcastMs === normalMs, normalMs + ' ms');
}));

T.push(test('Plant selection / reset — rebuilds the stack and resets the run', function (ck) {
  var s = svc();
  s.advanceCycles(5);
  ck('sim_time advanced before reset', s.simTime > 0, s.simTime > 0, '> 0');
  var snap = s.handleCommand({ action: 'reset', plant_id: 'pwr', initial_state: '50_percent' });
  ck('sim_time reset to 0', snap.metadata.sim_time, s.simTime === 0, '0');
  ck('initial snapshot is the new state (~50%)', snap.true_state.power_pct.toFixed(1), Math.abs(snap.true_state.power_pct - 50) < 1, '~50%');
  ck('reset returns the broadcast snapshot', snap.type, snap.type === 'state', 'state');
}));

T.push(test('Determinism — same seed + same commands → identical snapshots', function (ck) {
  function run(seed) {
    var s = new RD.SimulationService({ seed: seed });
    s.selectPlant('pwr', 'hot_full_power', null);
    s.advanceCycles(3);
    s.handleCommand({ action: 'rod_nudge', group_id: 'control_rods', steps: 5 });
    s.advanceCycles(3);
    s.handleCommand({ action: 'inject_failure', failure_id: 'rcp_trip' });
    s.advanceCycles(5);
    return s.assembleSnapshot();
  }
  var a = run(123), b = run(123), c = run(999);
  ck('identical for equal seed', 'a==b', physics(a) === physics(b), 'physics(a)===physics(b)');
  ck('noise differs for different seed', 'a!=c', a.instruments.power_range !== c.instruments.power_range, 'instrument noise differs');
  ck('but physics trajectory same magnitude', (a.true_state.power_pct - c.true_state.power_pct).toFixed(3), Math.abs(a.true_state.power_pct - c.true_state.power_pct) < 1e-9, 'true power identical (noise-free)');
}));

T.push(test('Save / restore — full simulation round-trips identically', function (ck) {
  var a = new RD.SimulationService({ seed: 77 });
  a.selectPlant('pwr', 'hot_full_power', null);
  a.advanceCycles(3);
  a.handleCommand({ action: 'inject_failure', failure_id: 'steam_line_break', severity: 0.5 });
  a.handleCommand({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'drift', value: 0.03 });
  a.advanceCycles(3);
  var save = JSON.parse(JSON.stringify(a.saveState())); // simulate a JSON round-trip

  var b = new RD.SimulationService({ seed: 999 });       // different seed; load must override
  b.loadState(save);

  a.advanceCycles(5); b.advanceCycles(5);
  var sa = a.assembleSnapshot(), sb = b.assembleSnapshot();
  ck('physics state identical after restore', 'a==b', physics(sa) === physics(sb), 'identical');
  ck('sim_time matches', sb.metadata.sim_time.toFixed(3), Math.abs(sa.metadata.sim_time - sb.metadata.sim_time) < 1e-9, sa.metadata.sim_time.toFixed(3));
  ck('active failure restored', JSON.stringify(sb.active_failures), sb.active_failures.some(function (f) { return f.id === 'steam_line_break'; }), 'steam_line_break present');
}));

T.push(test('set_register — propagates to alarm tile labels (M4) and instructor', function (ck) {
  var s = svc();
  s.handleCommand({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
  s.advanceCycles(40);          // SG dries → sg_level_low alarm fires
  var snapL = s.assembleSnapshot();
  var aL = snapL.alarms.find(function (x) { return x.id === 'sg_level_low'; });
  ck('learning label by default', aL && aL.tile_label, aL && aL.tile_label === 'Steam Generator Level Low', 'learning text');
  s.handleCommand({ action: 'set_register', value: 'industry' });
  var snapI = s.assembleSnapshot();
  var aI = snapI.alarms.find(function (x) { return x.id === 'sg_level_low'; });
  ck('industry label after set_register', aI && aI.tile_label, aI && aI.tile_label === 'SG LVL LO', 'SG LVL LO');
  ck('instructor register tracked', snapI.instructor.message_register, snapI.instructor.message_register === 'industry', 'industry');
}));

T.push(test('subscribe — receives each broadcast snapshot', function (ck) {
  var s = svc();
  var got = [];
  var unsub = s.subscribe(function (snap) { got.push(snap.metadata.sim_time); });
  s.advanceCycles(3);
  ck('subscriber got 3 snapshots', got.length, got.length === 3, '3');
  unsub();
  s.advanceCycles(1);
  ck('unsubscribe stops delivery', got.length, got.length === 3, 'still 3');
}));

// -------- report --------
var GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', RST = '\x1b[0m', BOLD = '\x1b[1m';
var pass = 0, fail = 0;
T.forEach(function (r) {
  console.log('\n' + (r.pass ? GREEN + 'PASS' + RST : RED + 'FAIL' + RST) + '  ' + BOLD + r.name + RST);
  r.checks.forEach(function (c) {
    console.log((c.pass ? GREEN + '  ✓' + RST : RED + '  ✗' + RST) + ' ' + c.desc +
      DIM + (c.pass ? '  (' + c.observed + ')' : '  [expected ' + c.expected + ', observed ' + c.observed + ']') + RST);
    if (c.pass) pass++; else fail++;
  });
});
var suites = T.filter(function (r) { return r.pass; }).length;
console.log('\n' + BOLD + '──────────────────────────────────────────' + RST);
console.log(BOLD + 'Suites: ' + suites + '/' + T.length + RST + '   Checks: ' + GREEN + pass + ' passed' + RST + (fail ? ', ' + RED + fail + ' failed' + RST : ''));
process.exit(fail ? 1 : 0);
