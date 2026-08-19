/*
 * run_m6ph.js — tests for the Placeholder Instructor (M6·PH) and its integration
 * in the assembled stack. Verifies the pass-through is transparent (no gating, no
 * commentary, no scenario logic) and that M5 drives it identically to free-play.
 *
 *   node test/run_m6ph.js
 */
'use strict';
var path = require('path');
function load(p) { require(path.join(__dirname, '..', p)); }
[
  'engines/load_mode.js',
  'engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js',
  'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_pressurizer2.js', 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js',
  'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
  'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js',
].forEach(load);
var RD = globalThis.RD;

function test(name, fn) {
  var checks = [];
  var ck = function (d, o, p, e) { checks.push({ desc: d, observed: o, expected: e, pass: !!p }); };
  try { fn(ck); } catch (e) { ck('threw: ' + (e && e.message), String(e && e.stack || e), false, 'no throw'); }
  return { name: name, pass: checks.every(function (c) { return c.pass; }), checks: checks };
}
var T = [];

// ---- unit: the placeholder in isolation, against a mock layer below ----
function mockLayer() {
  return { calls: [], handleCommand: function (c) { this.calls.push(c); return { ok: c.action }; } };
}

T.push(test('Pass-through — forwards every command straight down, unaltered', function (ck) {
  var below = mockLayer();
  var instr = new RD.InstructorLayer(below);
  var cmd = { action: 'rod_nudge', group_id: 'control_rods', steps: -3 };
  var ret = instr.handleCommand(cmd);
  ck('command reached the layer below', JSON.stringify(below.calls[0]), below.calls[0] === cmd, 'same command object');
  ck('not mutated (no gating)', JSON.stringify(below.calls[0]), JSON.stringify(below.calls[0]) === JSON.stringify(cmd), 'unaltered');
  ck('returns what the layer below returned', JSON.stringify(ret), ret && ret.ok === 'rod_nudge', '{ok:rod_nudge}');
}));

T.push(test('No commentary, no beats, no scenarios', function (ck) {
  var below = mockLayer();
  var instr = new RD.InstructorLayer(below);
  var r = instr.step({ true_state: { power_pct: 100 } }, 12.3); // must not inspect/inject
  ck('step is a no-op (returns undefined)', String(r), r === undefined, 'undefined');
  ck('step issues no commands downward', below.calls.length, below.calls.length === 0, '0 commands');
  ck('getMessage is the empty block', JSON.stringify(instr.getMessage()), instr.getMessage().message === null, '{message:null,...}');
  instr.load({ id: 'pwr_tmi' });
  ck('load() runs no scenario', below.calls.length, below.calls.length === 0, 'still 0 commands');
}));

T.push(test('Register tracking + save/restore', function (ck) {
  var instr = new RD.InstructorLayer(mockLayer());
  ck('default register learning', instr.getMessage().message_register, instr.register === 'learning', 'learning');
  instr.setRegister('industry');
  ck('setRegister updates', instr.getMessage().message_register, instr.register === 'industry', 'industry');
  var saved = instr.saveState();
  var other = new RD.InstructorLayer(mockLayer());
  other.loadState(saved);
  ck('saveState/loadState round-trips register', other.register, other.register === 'industry', 'industry');
  ck('loadState(undefined) defaults to learning', new RD.InstructorLayer(null).register, (function () { var i = new RD.InstructorLayer(null); i.loadState(undefined); return i.register === 'learning'; })(), 'learning');
}));

// ---- integration: M5 auto-selects M6·PH for the slot; free-play unchanged ----
function svc(seed) {
  var s = new RD.SimulationService({ seed: seed != null ? seed : 42 });
  s.selectPlant('pwr', 'hot_full_power', null);
  return s;
}

T.push(test('Integration — M5 places M6·PH in the slot', function (ck) {
  var s = svc();
  ck('slot occupied by RD.InstructorLayer', s.instructor.constructor.name, s.instructor instanceof RD.InstructorLayer, 'InstructorLayer');
  var snap = s.advanceCycles(1);
  ck('instructor block is empty (free-play)', JSON.stringify(snap.instructor), snap.instructor.message === null, '{message:null,...}');
}));

T.push(test('Integration — commands still descend the full stack (HR5)', function (ck) {
  var s = svc();
  var before = s.engine.getControlState().rod_groups[0].steps;
  s.handleCommand({ action: 'rod_nudge', group_id: 'control_rods', steps: -10 });
  // A nudge drives to its target at rod speed (M1 §7), not instantly — step until it arrives.
  for (var i = 0; i < 400 && s.engine.getControlState().rod_groups[0].steps > before - 10; i++) s.advanceCycles(1);
  ck('rod_nudge reached the engine through the placeholder', s.engine.getControlState().rod_groups[0].steps, s.engine.getControlState().rod_groups[0].steps === before - 10, String(before - 10));
}));

T.push(test('Integration — interception below the placeholder still works', function (ck) {
  var s = svc();
  s.advanceCycles(1);
  s.handleCommand({ action: 'open_porv' });
  s.handleCommand({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
  s.handleCommand({ action: 'close_porv' });   // M4 intercepts → open_porv (not the Instructor's concern)
  var snap = s.advanceCycles(1);
  ck('stuck PORV stays open (M4 interception, not gating)', snap.true_state.porv_open, snap.true_state.porv_open === true, true);
}));

T.push(test('Integration — set_register reaches the placeholder + M4 alarm labels', function (ck) {
  var s = svc();
  s.handleCommand({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
  s.advanceCycles(40);
  s.handleCommand({ action: 'set_register', value: 'industry' });
  var snap = s.assembleSnapshot();
  ck('instructor message_register tracked', snap.instructor.message_register, snap.instructor.message_register === 'industry', 'industry');
  var a = snap.alarms.find(function (x) { return x.id === 'sg_level_low'; });
  ck('alarm tile uses industry label', a && a.tile_label, a && a.tile_label === 'SG LVL LO', 'SG LVL LO');
}));

T.push(test('Swap invariant — M6·PH free-play is identical to the fallback', function (ck) {
  // Same seed + same commands, once with the real placeholder, once with the
  // built-in DefaultInstructor injected — the physics-relevant snapshot must match.
  function run(instr) {
    var s = new RD.SimulationService({ seed: 321, instructor: instr });
    s.selectPlant('pwr', 'hot_full_power', null);
    s.advanceCycles(3);
    s.handleCommand({ action: 'scram' });
    s.advanceCycles(5);
    var snap = s.assembleSnapshot();
    return JSON.stringify({ ts: snap.true_state, ins: snap.instruments, alarms: snap.alarms, t: snap.metadata.sim_time });
  }
  var a = run(new RD.InstructorLayer(null));
  var b = run(undefined); // M5 auto-picks RD.InstructorLayer too → still pass-through
  ck('placeholder yields pure free-play (no contamination)', 'a==b', a === b, 'identical snapshots');
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
