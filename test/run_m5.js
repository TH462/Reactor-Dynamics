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
  'engines/load_mode.js',
  'engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js',
  'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js',
  'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
  'layers/control/control_kernel.js', 'layers/simulation_service.js',
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

T.push(test('Cold shutdown (Mode 5) IC — stable through the full stack, no spurious ESF flood', function (ck) {
  var s = svc({ initial_state: 'cold_shutdown' });
  var snap = s.advanceCycles(40);
  var ts = snap.true_state;
  ck('reads Mode 5, Cold Shutdown', ts.plant_mode + ' ' + ts.plant_mode_name, ts.plant_mode === 5, 'Mode 5');
  ck('holds cold (Tavg ≤ 93 °C)', ts.tavg_c.toFixed(1), ts.tavg_c <= 93, '≤ 93 °C');
  ck('SI auto disarmed at depressurized init (P-11 lineup)', String(s.layer.esfAuto.hpi), s.layer.esfAuto.hpi === false, 'hpi MANUAL');
  ck('no spurious HPI injection', ts.hpi_active, ts.hpi_active === false, false);
  ck('core inventory not overfilled', ts.core_inventory_pct.toFixed(0), ts.core_inventory_pct <= 105, '≤ 105 %');
  ck('RHR aligned for shutdown cooling', ts.rhr_valve_open, ts.rhr_valve_open === true, true);
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

T.push(test('Attention stop — a plant event snaps fast-forward back to real time', function (ck) {
  // SCRAM while fast-forwarding → drop to 1× with a reason on THIS snapshot.
  var s = svc();
  s.advanceCycles(3);                                    // establish a steady prev broadcast
  s.handleCommand({ action: 'set_speed', value: 60 });
  var ff = s.advanceCycles(1);                           // 60× with no event → stays fast
  ck('fast-forward holds while nothing happens', ff.metadata.time_acceleration, ff.metadata.time_acceleration === 60, '60');
  s.handleCommand({ action: 'scram' });
  var snap = s.advanceCycles(1);
  ck('scram snaps back to real time', snap.metadata.time_acceleration, snap.metadata.time_acceleration === 1, '1');
  ck('the snap carries its reason', snap.metadata.speed_snap && snap.metadata.speed_snap.reason, snap.metadata.speed_snap && snap.metadata.speed_snap.reason === 'scram', 'scram');

  // A newly-injected failure is also an attention stop.
  var f = svc();
  f.advanceCycles(3);
  f.handleCommand({ action: 'set_speed', value: 60 });
  f.advanceCycles(1);
  f.handleCommand({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
  var fsnap = f.advanceCycles(1);
  ck('failure snaps back to real time', fsnap.metadata.time_acceleration, fsnap.metadata.time_acceleration === 1, '1');
  ck('failure reason reported', fsnap.metadata.speed_snap && fsnap.metadata.speed_snap.reason, fsnap.metadata.speed_snap && fsnap.metadata.speed_snap.reason === 'failure', 'failure');

  // Guard: at real time there is nothing to snap — no event flag is manufactured.
  var g = svc();
  g.advanceCycles(3);
  g.handleCommand({ action: 'scram' });
  var gsnap = g.advanceCycles(1);
  ck('no snap flag when already at 1×', gsnap.metadata.time_acceleration + '/' + !!gsnap.metadata.speed_snap,
     gsnap.metadata.time_acceleration === 1 && !gsnap.metadata.speed_snap, '1/false');

  // A newly annunciating ALARM is an attention stop, distinct from scram/failure.
  // trip_turbine is a COMMAND (not inject_failure), so it fires the TURB TRIP alarm
  // without registering a new active_failure — isolating the alarm trigger.
  // Driven from the 6 % initial state since #216: above P-9 (~50 % power) a turbine
  // trip now SCRAMS the reactor, which would make this an attention stop of the wrong
  // KIND (reason 'scram', not 'alarm') and leave the alarm leg untested. Below P-9 the
  // trip is bypassed exactly as in a real plant, so the alarm still arrives alone.
  var a = svc({ initial_state: '5_percent' });
  a.advanceCycles(3);
  a.handleCommand({ action: 'set_speed', value: 60 });
  a.advanceCycles(1);
  a.handleCommand({ action: 'trip_turbine' });
  var asnap = a.advanceCycles(1);
  ck('a new alarm snaps back to real time', asnap.metadata.time_acceleration, asnap.metadata.time_acceleration === 1, '1');
  ck('alarm reason reported', asnap.metadata.speed_snap && asnap.metadata.speed_snap.reason,
     asnap.metadata.speed_snap && asnap.metadata.speed_snap.reason === 'alarm', 'alarm');

  // …but only on a QUIET BOARD. Once alarms are already up the operator is inside a
  // casualty working procedures, and the alarms that follow are consequences they are
  // already handling — stopping for each one made fast-forward unusable exactly when it
  // is most wanted (a large-break LOCA dropped the clock 5 times in its first 3 min).
  var lit = svc({ initial_state: '5_percent' });         // below P-9 — see above
  lit.advanceCycles(3);
  lit.handleCommand({ action: 'trip_turbine' });          // light the board
  lit.advanceCycles(8);
  var litCount = lit.assembleSnapshot().alarms.filter(function (a) { return a.state !== 'clear'; }).length;
  ck('board is lit before the run', litCount, litCount > 0, '> 0');
  lit.handleCommand({ action: 'set_speed', value: 60 });
  var prevState = {}, sawNewAlarm = false, alarmSnapped = false;
  lit.assembleSnapshot().alarms.forEach(function (a) { prevState[a.id] = a.state; });
  for (var li = 0; li < 200; li++) {
    // Force a SECOND alarm partway through. This used to arrive for free: the
    // post-trip ride-out drained the SG, because the three-element feed channel
    // read turbine flow and so commanded no feed while the dump carried the plant
    // (the FG-4 defect, fixed 2026-07-26 — feed now tracks total SG draw). With
    // the ride-out clean the board stays quiet, `sawNewAlarm` goes false and the
    // real assertion below would pass VACUOUSLY, so the follow-on alarm is now
    // produced deliberately rather than borrowed from a plant defect.
    //
    // It must be an OPERATOR COMMAND, not inject_failure: a failure injection is
    // itself an attention stop, so it snaps the clock to 1× on the same cycle as
    // the alarm it causes, and every later alarm then arrives at 1× where the
    // quiet-board rule already forbids snapping — vacuous again, just differently.
    // Zeroing the feed pump kicks feed_sg to MAN and annunciates sg_level_low two
    // cycles later, STILL AT 60×, which is exactly the case :205 is about.
    if (li === 40) lit.handleCommand({ action: 'set_feed_pump_speed', pct: 0 });
    var ls = lit.advanceCycles(1);
    ls.alarms.forEach(function (a) {
      if ((prevState[a.id] || 'clear') === 'clear' && a.state !== 'clear') sawNewAlarm = true;
      prevState[a.id] = a.state;
    });
    if (ls.metadata.speed_snap && ls.metadata.speed_snap.reason === 'alarm') alarmSnapped = true;
  }
  ck('further alarms did fire during the run', sawNewAlarm, sawNewAlarm, 'true');
  ck('a new alarm on an ALREADY-LIT board does NOT snap fast-forward', alarmSnapped, !alarmSnapped, 'false');

  // Settings → Fast-forward dropout = Off: nothing touches the clock, not even a scram.
  var off = svc();
  off.advanceCycles(3);
  ck('attention stops on by default', off.assembleSnapshot().metadata.attention_stops,
     off.assembleSnapshot().metadata.attention_stops === true, 'true');
  off.handleCommand({ action: 'set_attention_stops', value: false });
  ck('the setting is reported in metadata', off.assembleSnapshot().metadata.attention_stops,
     off.assembleSnapshot().metadata.attention_stops === false, 'false');
  off.handleCommand({ action: 'set_speed', value: 60 });
  off.handleCommand({ action: 'inject_failure', failure_id: 'large_loca', severity: 0.2 });
  var offDrops = 0, offMin = Infinity;
  for (var oi = 0; oi < 400; oi++) {
    var os = off.advanceCycles(1);
    if (os.metadata.speed_snap) offDrops++;
    offMin = Math.min(offMin, os.metadata.time_acceleration);
  }
  ck('dropout off: a LOCA + scram never drops the clock', offDrops + '/' + offMin,
     offDrops === 0 && offMin === 60, '0/60');

  // The preference is the operator's, not the plant's: restoring a checkpoint (rewind)
  // must not hand them back a setting they changed since.
  var pref = svc();
  pref.advanceCycles(3);
  var prefState = pref.saveState();
  pref.handleCommand({ action: 'set_attention_stops', value: false });
  pref.loadState(prefState);
  ck('a state restore leaves the dropout preference alone', pref.attentionStops, pref.attentionStops === false, 'false');

  // The crucial NON-trigger: a commanded power/load maneuver is expected change and
  // must remain fast-forwardable. Only an unbidden event snaps the clock; an
  // excursion that genuinely needs attention annunciates an alarm (caught above),
  // whereas the operator's own ramp does not. This guards fast-forward from being
  // made useless during normal maneuvering by an over-eager future trigger.
  var m = svc();
  m.advanceCycles(3);
  m.handleCommand({ action: 'set_speed', value: 60 });
  m.advanceCycles(1);
  m.handleCommand({ action: 'rod_nudge', group_id: 'control_rods', steps: -4, speed: 'normal' });
  var msnap = m.advanceCycles(1);
  ck('a commanded maneuver does NOT snap fast-forward',
     msnap.metadata.time_acceleration + '/' + !!msnap.metadata.speed_snap,
     msnap.metadata.time_acceleration === 60 && !msnap.metadata.speed_snap, '60/false');
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

// ======================= rewind ring (loads the real M6 AFTER the suites above,
// so they keep exercising the DefaultInstructor fallback path) =======================
load('layers/instructor_layer.js');

T.push(test('Rewind — checkpoints pushed on instructor request; full scope is bit-exact', function (ck) {
  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.__m5rw = {
    id: '__m5rw', plant_id: 'pwr', initial_state: 'hot_full_power', design_version: null,
    beats: [
      { id: 'b1', trigger: { type: 'time', value: 0.3 }, commentary: { learning: 'one', industry: 'one' } },
      { id: 'b2', trigger: { type: 'delay', value: 0.5 }, commentary: { learning: 'two', industry: 'two' } },
    ],
  };
  var s = new RD.SimulationService({ seed: 7 });
  s.selectPlant('pwr', 'hot_full_power', null);
  ck('ring empty in free-play', s.checkpoints.length, s.checkpoints.length === 0, '0');
  s.handleCommand({ action: 'start_scenario', scenario_id: '__m5rw' });
  ck('checkpoint 0 pushed at scenario load', s.checkpoints.length, s.checkpoints.length === 1, '1');
  var atB2 = null;
  for (var i = 0; i < 40 && s.checkpoints.length < 3; i++) atB2 = s.advanceCycles(1);
  ck('a checkpoint per beat fire', s.checkpoints.length, s.checkpoints.length === 3, '3');
  var mark = physics(s.assembleSnapshot());
  s.advanceCycles(20);                                   // drift well past the checkpoint
  ck('state drifted past the checkpoint', 'changed', physics(s.assembleSnapshot()) !== mark, 'differs');
  var back = s.handleCommand({ action: 'rewind', steps: 1 });
  ck('full rewind restores bit-exact state (physics + PRNG + lag)', 'restored', physics(back) === mark, 'identical');
  ck('rewound instructor still at beat two (retry semantics)', back.instructor.message, back.instructor.message === 'two', 'two');
  ck('the target checkpoint stays on the ring', s.checkpoints.length, s.checkpoints.length === 3, '3');
  var deeper = s.handleCommand({ action: 'rewind', steps: 3 });
  ck('multi-step rewind reaches checkpoint 0', deeper.metadata.sim_time.toFixed(1), deeper.metadata.sim_time === 0, '0 s');
  var none = s.handleCommand({ action: 'rewind', steps: 5 });
  ck('rewind past the ring errors cleanly', JSON.stringify(none && none.type), none && none.type === 'error', 'error');
  s.handleCommand({ action: 'stop_scenario' });
  ck('stop_scenario clears the ring', s.checkpoints.length, s.checkpoints.length === 0, '0');
  delete RD.SCENARIOS.__m5rw;
}));

T.push(test('Rewind — world scope rolls the plant back but the teacher remembers', function (ck) {
  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.__m5w = {
    id: '__m5w', plant_id: 'pwr', initial_state: 'hot_full_power', design_version: null,
    beats: [
      { id: 'b1', trigger: { type: 'time', value: 0.3 }, commentary: { learning: 'mark', industry: 'mark' } },
      { id: 'b2', trigger: { type: 'delay', value: 1.0 }, rewind: { steps: 1 }, commentary: { learning: 'again', industry: 'again' } },
      { id: 'b3', trigger: { type: 'delay', value: 0.5 }, commentary: { learning: 'after', industry: 'after' } },
    ],
  };
  var s = new RD.SimulationService({ seed: 7 });
  s.handleCommand({ action: 'start_scenario', scenario_id: '__m5w' });
  var sn = null;
  for (var i = 0; i < 60 && !s.instructor.firedBeats.has('b2'); i++) sn = s.advanceCycles(1);
  ck('rewind beat fired', s.instructor.firedBeats.has('b2'), s.instructor.firedBeats.has('b2'), 'b2 fired');
  ck('world rewind rolled sim time back to the b1 checkpoint', sn.metadata.sim_time.toFixed(2), sn.metadata.sim_time < 1.0, '< 1.0 s');
  ck('instructor progress survived the rewind', Array.from(s.instructor.firedBeats).join(','), s.instructor.firedBeats.has('b1') && s.instructor.firedBeats.has('b2'), 'b1+b2 fired');
  for (var j = 0; j < 40 && !s.instructor.firedBeats.has('b3'); j++) sn = s.advanceCycles(1);
  ck('scenario continues past the rewind (rebased time anchors)', sn.instructor.message, sn.instructor.message === 'after', 'after');
  s.handleCommand({ action: 'stop_scenario' });
  delete RD.SCENARIOS.__m5w;
}));

// #137. The cadence is REAL time, not sim time — the ring must always cover about
// the same slice of the PLAYER's life, because that is the clock a player has. On
// the old sim-time cadence a 32-slot ring spanned 465.9 real seconds at 1× but only
// 3.1 at 600× (measured), i.e. it evaporated in exactly the case — a long
// fast-forward — where reaching back matters. `_now` is the injected wall clock: a
// headless runner burns no real time, so the whole cadence is invisible without it.
T.push(test('Rewind — sandbox checkpoints tick on a REAL-time cadence in free play only', function (ck) {
  var s = new RD.SimulationService({ seed: 7 });
  var wall = 1000000;                        // ms; frozen unless a check advances it
  s._now = function () { return wall; };
  s.selectPlant('pwr', 'hot_full_power', null);
  s.advanceCycles(1);
  ck('first free-play tick lays checkpoint 0', s.checkpoints.length, s.checkpoints.length === 1, '1');
  // The discriminating check: pile up sim time with the wall clock stopped. On the
  // old sim-time cadence this alone laid ~24 checkpoints.
  s.handleCommand({ action: 'set_speed', value: 60 });
  s.advanceCycles(60);                       // 360 sim s at 60×, 0 real s
  ck('360 sim-s with the wall clock frozen lays none', s.checkpoints.length + ' after ' + s.simTime.toFixed(0) + ' sim-s', s.checkpoints.length === 1, '1');
  wall += 19999; s.advanceCycles(1);
  ck('19.999 real-s is short of the interval', s.checkpoints.length, s.checkpoints.length === 1, '1');
  wall += 1; s.advanceCycles(1);
  ck('the 20th real second lays the next', s.checkpoints.length, s.checkpoints.length === 2, '2');
  wall += 20000; s.advanceCycles(1);
  ck('and the next, at any acceleration', s.checkpoints.length, s.checkpoints.length === 3, '3');
  var atRewind = s.checkpoints[1].metadata.sim_time;
  var back = s.handleCommand({ action: 'rewind', steps: 2 });
  ck('sandbox rewind restores a periodic checkpoint', back.metadata.sim_time.toFixed(1) + ' s', Math.abs(back.metadata.sim_time - atRewind) < 1e-9, atRewind.toFixed(1) + ' s');
  // A rewind restarts the cadence from the moment landed on, so the next slot is a
  // full interval away instead of sitting on top of the target.
  s.advanceCycles(1);
  ck('no checkpoint immediately after a rewind', s.checkpoints.length, s.checkpoints.length === 2, '2');

  // During a scenario the Instructor owns the ring: no periodic pushes. The wall
  // clock is advanced well past the interval so this asserts the instructor guard
  // rather than a stopped clock.
  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.__m5sb = { id: '__m5sb', plant_id: 'pwr', initial_state: 'hot_full_power', design_version: null,
    beats: [{ id: 'b1', trigger: { type: 'time', value: 0.1 }, commentary: { learning: 'x', industry: 'x' } }] };
  s.handleCommand({ action: 'start_scenario', scenario_id: '__m5sb' });
  s.handleCommand({ action: 'set_speed', value: 60 });
  for (var w = 0; w < 10; w++) { wall += 20000; s.advanceCycles(1); }   // 200 real s — would be 10 periodic pushes
  ck('no periodic checkpoints while a scenario owns the ring', s.checkpoints.length + ' (load + 1 beat)', s.checkpoints.length === 2, '2');
  s.handleCommand({ action: 'stop_scenario' });
  delete RD.SCENARIOS.__m5sb;
}));

T.push(test('Rewind — a beat can set time acceleration (fast-forward in, drop out at a set point)', function (ck) {
  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.__m5sp = { id: '__m5sp', plant_id: 'pwr', initial_state: 'hot_full_power', design_version: null,
    beats: [
      { id: 'ff',   trigger: { type: 'time', value: 0.2 }, speed: 60, commentary: { learning: 'ff', industry: 'ff' } },
      { id: 'drop', trigger: { type: 'delay', value: 30 }, speed: 1, commentary: { learning: 'drop', industry: 'drop' } },
    ] };
  var s = new RD.SimulationService({ seed: 7 });
  s.handleCommand({ action: 'start_scenario', scenario_id: '__m5sp' });
  var sn = null;
  for (var i = 0; i < 20 && !s.instructor.firedBeats.has('ff'); i++) sn = s.advanceCycles(1);
  ck('fast-forward beat raises acceleration', sn.metadata.time_acceleration, sn.metadata.time_acceleration === 60, '60');
  for (var j = 0; j < 40 && !s.instructor.firedBeats.has('drop'); j++) sn = s.advanceCycles(1);
  ck('set-point beat drops back to real time', sn.metadata.time_acceleration, s.instructor.firedBeats.has('drop') && sn.metadata.time_acceleration === 1, '1');
  s.handleCommand({ action: 'stop_scenario' });
  delete RD.SCENARIOS.__m5sp;
}));

T.push(test('Rewind — ring cap evicts the oldest checkpoint', function (ck) {
  var s = new RD.SimulationService({ seed: 7 });
  s.selectPlant('pwr', 'hot_full_power', null);
  for (var i = 0; i < 40; i++) { s.advanceCycles(1); s._pushCheckpoint(); }
  ck('ring capped at 32', s.checkpoints.length, s.checkpoints.length === 32, '32');
  var oldest = s.checkpoints[0].metadata.sim_time;
  ck('oldest entries evicted (FIFO)', oldest.toFixed(1) + ' s', oldest > 0.5, '> first pushes');
}));

// Protection is a PLANT property, not a UI speed-button property (#153).
//
// Until this shipped, `tick()` evaluated trips/actuations/alarms exactly once per
// broadcast, so the interval between two protection evaluations was
// `timeAcceleration × broadcastMs`. Measured on the pre-fix service, this same probe
// at 3600× ran the plant through a 135.9 % power excursion and NEVER TRIPPED — the
// first evaluation landed 360 sim s later with power already back at 56.7 %.
//
// PROVEN BY INJECTION, not by reading the diff: restore the old body (delete the
// in-loop evaluate, keeping only the post-loop call) and this test goes red on four
// checks — 'trips at 3600×' (no trip at all), both 'same trip' / 'same sim time'
// checks, and the 3600× evaluation-rate check at 0.003 evals/sim s against its ≥5
// floor. The 1× checks stay green either way, which is the point: 1× is byte-
// identical, because a 1× broadcast is exactly PROTECTION_DT and the in-loop guard
// hands that evaluation to the post-loop call.
//
// Deliberately NOT asserted: the exact trip latency. A 3600× broadcast covers 360
// sim s, so the SNAPSHOT reporting the scram is still once per broadcast and always
// will be — you cannot render faster than you broadcast. What must not vary is when
// the plant actually acts, so this reads the RPS latch at physics rate.
T.push(test('Protection cadence — bounded in SIM time, not per broadcast (#153)', function (ck) {
  // Drive the runaway at `accel` and report when the RPS actually latched, sampled
  // at physics rate (0.02 s) rather than at the broadcast boundary.
  function runaway(accel) {
    var s = new RD.SimulationService({ seed: 42 });
    s.selectPlant('pwr', '50_percent', null);
    s.running = true; s.attentionStops = true; s.timeAcceleration = accel;
    var eng = s.engine, origStep = eng.step, origEval = s.layer.evaluate.bind(s.layer);
    var armed = false, tFine = 0, scramT = null, reason = null, peak = 0, evals = 0;
    s.layer.evaluate = function (ins) { evals++; return origEval(ins); };
    eng.step = function (dt) {
      var r = origStep.call(this, dt);
      if (armed) {
        tFine += dt;
        var ts = this.getTrueState();
        if (ts.power_pct > peak) peak = ts.power_pct;
        if (scramT == null && s.layer.rps && s.layer.rps.scrammed) { scramT = tFine; reason = s.layer.rps.last_trip_reason; }
      }
      return r;
    };
    var t0 = s.simTime + 20; while (s.simTime < t0) s.advanceCycles(1);
    armed = true; evals = 0;
    s.handleCommand({ action: 'inject_failure', failure_id: 'continuous_rod_withdrawal', severity: 1.0 });
    var end = s.simTime + 400;
    while (s.simTime < end) { s.advanceCycles(1); if (scramT != null && tFine > scramT + 30) break; }
    return { scram: scramT, reason: reason, peak: peak, rate: evals / tFine };
  }

  var slow = runaway(1), fast = runaway(3600);

  ck('1×: trips on high flux', slow.reason || 'NO TRIP', slow.reason === 'power_range high', 'power_range high');
  ck('3600×: trips at all', fast.reason || 'NO TRIP', fast.scram != null, 'a trip');
  ck('3600×: same trip as 1× (not a slower parameter catching it late)',
    fast.reason || 'NO TRIP', fast.reason === slow.reason, slow.reason);
  ck('3600×: same sim time as 1× (within 1 s)',
    fast.scram != null ? fast.scram.toFixed(2) + ' s vs ' + slow.scram.toFixed(2) + ' s' : 'NO TRIP',
    fast.scram != null && Math.abs(fast.scram - slow.scram) < 1.0, '|Δ| < 1.0 s');
  // The excursion itself: the pre-fix 3600× peak was 135.9 %, against 121.6 % at 1×.
  ck('3600×: excursion no worse than 1× (within 3 points)',
    fast.peak.toFixed(1) + ' % vs ' + slow.peak.toFixed(1) + ' %',
    Math.abs(fast.peak - slow.peak) < 3.0, '|Δ| < 3.0 points');
  // ≥5/sim s is half the 0.1 s cadence — loose enough not to pin the exact interleave,
  // tight enough that the pre-fix 3600× rate (0.003) cannot squeak through.
  ck('1×: protection evaluated ≥5 times per sim second', slow.rate.toFixed(1) + ' /s', slow.rate >= 5, '≥ 5');
  ck('3600×: protection evaluated ≥5 times per sim second', fast.rate.toFixed(1) + ' /s', fast.rate >= 5, '≥ 5');
}));

// --------------------------------------------------------------------------
// The two rewind guards and the save/load COMMAND path (#154 item 7). #137
// narrowed `_rewindCursor` to the beat path but did not remove it, and it had
// never had a test; `exact` was covered end-to-end in the browser gate and
// nowhere at this level, which is where its semantics actually live.

T.push(test('Rewind — consecutive presses with no new progress WALK BACK (#154)', function (ck) {
  var s = new RD.SimulationService({ seed: 7 });
  s.selectPlant('pwr', 'hot_full_power', null);
  for (var i = 0; i < 6; i++) { s.advanceCycles(1); s._pushCheckpoint(); }
  // 7, not 6: the first free-play tick lays checkpoint 0 on the sandbox cadence
  // before the loop's own pushes. Read the ring rather than assume its length.
  var times = s.checkpoints.map(function (c) { return c.metadata.sim_time; });
  ck('a ring of increasing checkpoints', times.length,
    times.length === 7 && times[times.length - 1] > times[0], '7, increasing');
  var first = s.handleCommand({ action: 'rewind', steps: 1 });
  var t1 = first.metadata.sim_time;
  // A broadcast between the presses is what makes this hard: it advances simTime
  // past the checkpoint just landed on, so the exact-time guard no longer fires and
  // every later press would restore that SAME checkpoint forever — the state could
  // never be escaped. Since #137 this is reached by two `rewind:` beats in a row
  // (a rewind beat deliberately does not checkpoint), which is why the guard stayed.
  s.advanceCycles(1);
  var second = s.handleCommand({ action: 'rewind', steps: 1 });
  var t2 = second.metadata.sim_time;
  ck('the second press lands STRICTLY earlier', t1.toFixed(2) + ' → ' + t2.toFixed(2),
    t2 < t1 - 1e-9, '< ' + t1.toFixed(2) + ' s');
  s.advanceCycles(1);
  var third = s.handleCommand({ action: 'rewind', steps: 1 });
  ck('and keeps walking back, one boundary per press', third.metadata.sim_time.toFixed(2),
    third.metadata.sim_time < t2 - 1e-9, '< ' + t2.toFixed(2) + ' s');
}));

T.push(test('Rewind — `exact` names a checkpoint and skips the press guards (#154)', function (ck) {
  function ringOf(n) {
    var s = new RD.SimulationService({ seed: 7 });
    s.selectPlant('pwr', 'hot_full_power', null);
    for (var i = 0; i < n; i++) { s.advanceCycles(1); s._pushCheckpoint(); }
    return s;
  }
  var a = ringOf(6);
  var N = a.checkpoints.length;                      // 7 — the free-play tick lays one too
  var newest = a.checkpoints[N - 1].metadata.sim_time;
  var pick4 = a.checkpoints[N - 4].metadata.sim_time;   // what steps:4 must name
  // The picker's contract: the mark the player clicked is the state they get. A
  // non-exact steps:1 here lands one EARLIER, because the newest checkpoint is the
  // current moment and press semantics require strictly-earlier state — correct for
  // a press, wrong for a pick. Both halves are asserted so the two cannot converge.
  var exact1 = a.handleCommand({ action: 'rewind', steps: 1, exact: true });
  ck('exact steps:1 restores the NEWEST checkpoint itself', exact1.metadata.sim_time.toFixed(2),
    Math.abs(exact1.metadata.sim_time - newest) < 1e-9, newest.toFixed(2) + ' s');
  var press = ringOf(6).handleCommand({ action: 'rewind', steps: 1 });
  ck('…where a PRESS at the same moment lands one earlier', press.metadata.sim_time.toFixed(2),
    press.metadata.sim_time < newest - 1e-9, '< ' + newest.toFixed(2) + ' s');
  // Steps count back from the END of the ring, so steps:4 names index N−4.
  var exact4 = ringOf(6).handleCommand({ action: 'rewind', steps: 4, exact: true });
  ck('exact steps:4 restores checkpoint index N−4', exact4.metadata.sim_time.toFixed(2),
    Math.abs(exact4.metadata.sim_time - pick4) < 1e-9, pick4.toFixed(2) + ' s');
  // A pick past the ring is an error, not a silent clamp to the oldest.
  var tooFar = ringOf(6).handleCommand({ action: 'rewind', steps: 99, exact: true });
  ck('a pick past the ring errors cleanly', JSON.stringify(tooFar && tooFar.type),
    tooFar && tooFar.type === 'error', 'error');
}));

T.push(test('save_state / load_state as COMMANDS round-trip through the service (#154)', function (ck) {
  // `load_state` has one caller (run_autoctl); `save_state` as a COMMAND had none —
  // every other test reaches for svc.saveState() directly, so that dispatch line
  // was never once exercised.
  var s = new RD.SimulationService({ seed: 7 });
  s.selectPlant('pwr', 'hot_full_power', null);
  s.handleCommand({ action: 'set_speed', value: 10 });
  s.advanceCycles(30);
  s.handleCommand({ action: 'open_porv' });
  s.advanceCycles(5);
  var saved = s.handleCommand({ action: 'save_state' });
  ck('save_state returns a save payload', !!(saved && typeof saved === 'object'),
    !!(saved && typeof saved === 'object'), 'an object');
  var atSave = s.simTime;
  ck('PORV was open at save', String(s.engine.getTrueState().porv_open),
    s.engine.getTrueState().porv_open === true, 'true');
  // Move the plant somewhere else entirely, then load the payload back.
  s.handleCommand({ action: 'close_porv' });
  s.advanceCycles(40);
  ck('plant moved on after the save', s.simTime > atSave, s.simTime > atSave, '> ' + atSave.toFixed(1) + ' s');
  s.handleCommand({ action: 'load_state', state: saved });
  ck('load_state restored the saved sim time', s.simTime.toFixed(2),
    Math.abs(s.simTime - atSave) < 1e-9, atSave.toFixed(2) + ' s');
  ck('…and the saved plant state with it', String(s.engine.getTrueState().porv_open),
    s.engine.getTrueState().porv_open === true, 'true');
  // The payload must survive the trip a real save takes — through JSON and back.
  var s2 = new RD.SimulationService({ seed: 7 });
  s2.selectPlant('pwr', 'hot_full_power', null);
  s2.handleCommand({ action: 'load_state', state: JSON.parse(JSON.stringify(saved)) });
  ck('a JSON round-trip of the payload loads into a fresh service', s2.simTime.toFixed(2),
    Math.abs(s2.simTime - atSave) < 1e-9, atSave.toFixed(2) + ' s');
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
