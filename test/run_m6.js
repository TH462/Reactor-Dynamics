/*
 * run_m6.js — tests for the real Instructor (M6): the beat engine, trigger
 * vocabulary, gating, branching, follow mode (Path 2), instrument-first grading,
 * save/restore, and the free-play swap invariant. Unit tests drive the layer
 * against a mock M4; integration tests drive the assembled PWR stack via M5.
 *
 *   node test/run_m6.js
 */
'use strict';
var path = require('path');
function load(p) { require(path.join(__dirname, '..', p)); }
[
  'engines/load_mode.js',
  'engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js',
  'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js',
  'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
  'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js',
  'ui/manual_procedures.js',
].forEach(load);
var RD = globalThis.RD;

function test(name, fn) {
  var checks = [];
  var ck = function (d, o, p, e) { checks.push({ desc: d, observed: o, expected: e, pass: !!p }); };
  try { fn(ck); } catch (e) { ck('threw: ' + (e && e.message), String(e && e.stack || e), false, 'no throw'); }
  return { name: name, pass: checks.every(function (c) { return c.pass; }), checks: checks };
}
var T = [];

function mockLayer() {
  return { calls: [], handleCommand: function (c) { this.calls.push(c); return { ok: c.action }; } };
}
// A minimal synthetic snapshot the trigger evaluator / grader can read.
function snap(over) {
  var s = {
    metadata: { plant_id: 'pwr', sim_time: 0 },
    true_state: {}, instruments: {}, alarms: [],
    rps_state: { scrammed: false },
  };
  over = over || {};
  for (var k in over) s[k] = over[k];
  return s;
}
function instrWith(scenario) {
  var below = mockLayer();
  var it = new RD.InstructorLayer(below);
  if (scenario) it.load(scenario);
  return { it: it, below: below };
}

// ============================== unit: trigger vocabulary (§5) ==============================
T.push(test('Triggers — time and delay measure from scenario start / last beat fire', function (ck) {
  var x = instrWith({ id: 't', beats: [
    { id: 'b1', trigger: { type: 'time', value: 10 }, commentary: { learning: 'one', industry: 'ONE' } },
    { id: 'b2', trigger: { type: 'delay', value: 5 }, commentary: { learning: 'two', industry: 'TWO' } },
  ] });
  x.it.step(snap(), 100);            // scenario starts at simTime 100
  ck('time trigger not yet (t+0)', x.it.getMessage().message, x.it.getMessage().message === null, 'null');
  x.it.step(snap(), 109);
  ck('time trigger not yet (t+9)', x.it.getMessage().message, x.it.getMessage().message === null, 'null');
  x.it.step(snap(), 110);
  ck('time trigger fires at t+10', x.it.getMessage().message, x.it.getMessage().message === 'one', 'one');
  x.it.step(snap(), 114);
  ck('delay trigger not yet (4 s after fire)', x.it.getMessage().message, x.it.getMessage().message === 'one', 'still one');
  x.it.step(snap(), 115);
  ck('delay trigger fires 5 s after previous beat', x.it.getMessage().message, x.it.getMessage().message === 'two', 'two');
}));

T.push(test('Triggers — instrument (HR1) and true_state directions', function (ck) {
  var x = instrWith({ id: 't', beats: [
    { id: 'b1', trigger: { type: 'instrument', instrument: 'sg_level', direction: 'below', value: 30 }, commentary: { learning: 'low', industry: 'low' } },
    { id: 'b2', trigger: { type: 'true_state', field: 'porv_stuck', direction: 'is_true', value: true }, commentary: { learning: 'stuck', industry: 'stuck' } },
  ] });
  x.it.step(snap({ instruments: { sg_level: 45 } }), 0);
  ck('instrument above threshold — no fire', x.it.getMessage().message, x.it.getMessage().message === null, 'null');
  x.it.step(snap({ instruments: { sg_level: 29.9 } }), 1);
  ck('instrument below threshold — fires', x.it.getMessage().message, x.it.getMessage().message === 'low', 'low');
  x.it.step(snap({ true_state: { porv_stuck: false } }), 2);
  ck('true_state is_true not met', x.it.getMessage().message, x.it.getMessage().message === 'low', 'still low');
  x.it.step(snap({ true_state: { porv_stuck: true } }), 3);
  ck('true_state is_true fires', x.it.getMessage().message, x.it.getMessage().message === 'stuck', 'stuck');
}));

T.push(test('Triggers — alarm, scram, manual, all/any composites', function (ck) {
  var x = instrWith({ id: 't', beats: [
    { id: 'b1', trigger: { type: 'alarm', alarm_id: 'subcooling_low', state: 'active_unacknowledged' }, commentary: { learning: 'a', industry: 'a' } },
    { id: 'b2', trigger: { type: 'scram' }, commentary: { learning: 's', industry: 's' } },
    { id: 'b3', trigger: { type: 'manual' }, commentary: { learning: 'm', industry: 'm' } },
    { id: 'b4', trigger: { type: 'all', triggers: [
        { type: 'true_state', field: 'x', direction: 'above', value: 1 },
        { type: 'any', triggers: [{ type: 'true_state', field: 'y', direction: 'is_true', value: true }] },
      ] }, commentary: { learning: 'c', industry: 'c' } },
  ] });
  x.it.step(snap({ alarms: [{ id: 'subcooling_low', state: 'clear' }] }), 0);
  ck('clear alarm — no fire', x.it.getMessage().message, x.it.getMessage().message === null, 'null');
  x.it.step(snap({ alarms: [{ id: 'subcooling_low', state: 'active_unacknowledged' }] }), 1);
  ck('alarm state match fires', x.it.getMessage().message, x.it.getMessage().message === 'a', 'a');
  x.it.step(snap({ rps_state: { scrammed: true } }), 2);
  ck('scram trigger fires on rps_state', x.it.getMessage().message, x.it.getMessage().message === 's', 's');
  x.it.step(snap(), 3);
  ck('manual waits for Continue', x.it.getMessage().message, x.it.getMessage().message === 's', 'still s');
  x.it.handleCommand({ action: 'instructor_continue' });
  x.it.step(snap(), 4);
  ck('manual fires after instructor_continue', x.it.getMessage().message, x.it.getMessage().message === 'm', 'm');
  x.it.step(snap({ true_state: { x: 2, y: false } }), 5);
  ck('all not satisfied (y false)', x.it.getMessage().message, x.it.getMessage().message === 'm', 'still m');
  x.it.step(snap({ true_state: { x: 2, y: true } }), 6);
  ck('all + nested any fires', x.it.getMessage().message, x.it.getMessage().message === 'c', 'c');
}));

// ============================== unit: beat actions + flow ==============================
T.push(test('Beat fire — failures/commands descend as commands (HR7), no synchronous fire on load', function (ck) {
  var x = instrWith({ id: 't', beats: [
    { id: 'b1', trigger: { type: 'time', value: 0 },
      inject_failures: ['loss_of_feedwater'],
      commands: [{ action: 'manual_scram' }],
      commentary: { learning: 'go', industry: 'go' } },
  ] });
  ck('load issued no commands (fires only in step)', x.below.calls.length, x.below.calls.length === 0, '0');
  x.it.step(snap(), 0);
  ck('inject_failure descended', JSON.stringify(x.below.calls[0]), x.below.calls[0] && x.below.calls[0].action === 'inject_failure' && x.below.calls[0].failure_id === 'loss_of_feedwater', 'inject_failure loss_of_feedwater');
  ck('beat command descended', JSON.stringify(x.below.calls[1]), x.below.calls[1] && x.below.calls[1].action === 'manual_scram', 'manual_scram');
  var n = x.below.calls.length;
  x.it.step(snap(), 1);
  ck('fired beat does not re-fire', x.below.calls.length, x.below.calls.length === n, String(n));
}));

T.push(test('Beat flow — advance:auto chains in one pass; wait_for_trigger defers', function (ck) {
  var x = instrWith({ id: 't', beats: [
    { id: 'b1', trigger: { type: 'time', value: 0 }, advance: 'auto', commentary: { learning: '1', industry: '1' } },
    { id: 'b2', trigger: { type: 'time', value: 0 }, advance: 'wait_for_trigger', commentary: { learning: '2', industry: '2' } },
    { id: 'b3', trigger: { type: 'time', value: 0 }, commentary: { learning: '3', industry: '3' } },
  ] });
  x.it.step(snap(), 0);
  ck('auto chained b1→b2 in one pass', x.it.getMessage().message, x.it.getMessage().message === '2', '2');
  x.it.step(snap(), 1);
  ck('wait_for_trigger deferred b3 to the next pass', x.it.getMessage().message, x.it.getMessage().message === '3', '3');
}));

T.push(test('Gates — block_actions/allow_actions block with a distinct shape; until lifts', function (ck) {
  var x = instrWith({ id: 't', beats: [
    { id: 'b1', trigger: { type: 'time', value: 0 },
      gate: { block_actions: ['open_porv'], until: { type: 'scram' } },
      commentary: { learning: 'gated', industry: 'gated' } },
  ] });
  x.it.step(snap(), 0);
  var r = x.it.handleCommand({ action: 'open_porv' });
  ck('gated command blocked', JSON.stringify(r), r && r.type === 'blocked' && r.code === 'GATED_BY_INSTRUCTOR', '{type:blocked}');
  ck('blocked command did not descend (HR5)', x.below.calls.length, x.below.calls.length === 0, '0');
  var r2 = x.it.handleCommand({ action: 'rod_nudge', group_id: 'control_rods', steps: -1 });
  ck('un-gated command descends', JSON.stringify(r2), r2 && r2.ok === 'rod_nudge', '{ok:rod_nudge}');
  x.it.step(snap({ rps_state: { scrammed: true } }), 1);
  var r3 = x.it.handleCommand({ action: 'open_porv' });
  ck('gate lifted by its until trigger', JSON.stringify(r3), r3 && r3.ok === 'open_porv', '{ok:open_porv}');

  var y = instrWith({ id: 't2', beats: [
    { id: 'b1', trigger: { type: 'time', value: 0 }, gate: { allow_actions: ['scram'] }, commentary: { learning: 'g', industry: 'g' } },
  ] });
  y.it.step(snap(), 0);
  var b = y.it.handleCommand({ action: 'open_porv' });
  var a = y.it.handleCommand({ action: 'scram' });
  ck('allow_actions blocks everything else', JSON.stringify(b), b && b.type === 'blocked', 'blocked');
  ck('allow_actions permits the listed action', JSON.stringify(a), a && a.ok === 'scram', '{ok:scram}');
}));

T.push(test('Branching — operator_action wins the race; inaction is the timeout', function (ck) {
  function decisionScenario() {
    return { id: 't', beats: [
      { id: 'decide', trigger: { type: 'time', value: 0 },
        commentary: { learning: 'choose', industry: 'choose' },
        branches: [
          { trigger: { type: 'operator_action', command: 'set_hpi', params: { active: true } }, goto: 'good' },
          { trigger: { type: 'inaction', window: 120 }, goto: 'bad' },
        ] },
      { id: 'good', trigger: { type: 'time', value: 0 }, commentary: { learning: 'saved', industry: 'saved' } },
      { id: 'bad', trigger: { type: 'time', value: 0 }, commentary: { learning: 'lost', industry: 'lost' } },
    ] };
  }
  var x = instrWith(decisionScenario());
  x.it.step(snap(), 0);
  ck('decision beat fired', x.it.getMessage().message, x.it.getMessage().message === 'choose', 'choose');
  x.it.handleCommand({ action: 'set_hpi', active: true });
  x.it.step(snap(), 5);
  ck('operator_action branch fired', x.it.getMessage().message, x.it.getMessage().message === 'saved', 'saved');

  var y = instrWith(decisionScenario());
  y.it.step(snap(), 0);
  y.it.handleCommand({ action: 'set_hpi', active: false });    // params must match — active:false is not the branch
  y.it.step(snap(), 60);
  ck('param mismatch does not fire the branch', y.it.getMessage().message, y.it.getMessage().message === 'choose', 'choose');
  y.it.step(snap(), 121);
  ck('inaction branch fires after the window', y.it.getMessage().message, y.it.getMessage().message === 'lost', 'lost');
}));

// ============================== unit: registers + snapshot block ==============================
T.push(test('Commentary registers + extended snapshot block shape', function (ck) {
  var x = instrWith({ id: 't', ui_policy: { register: 'learning', highlights: true }, beats: [
    { id: 'b1', trigger: { type: 'time', value: 0 },
      commentary: { learning: 'plain words', industry: 'PLANT TERMS' },
      highlight: { view: 'primary', control_label: 'HPI', instrument_id: null },
      level_complete: { title: 'Done', outcome_learning: 'You did it', outcome_industry: 'Complete', actions: ['continue', 'retry'] } },
  ] });
  var free = new RD.InstructorLayer(mockLayer());
  var blk0 = free.getSnapshotBlock();
  ck('free-play block: message null, extensions null',
    JSON.stringify(blk0),
    blk0.message === null && blk0.ui_policy === null && blk0.highlight === null && blk0.follow === null && blk0.level_complete === null,
    'all null');
  x.it.step(snap(), 0);
  var blk = x.it.getSnapshotBlock();
  ck('learning register text', blk.message, blk.message === 'plain words', 'plain words');
  ck('highlight carried', JSON.stringify(blk.highlight), blk.highlight && blk.highlight.control_label === 'HPI', 'HPI');
  ck('ui_policy carried', JSON.stringify(blk.ui_policy), blk.ui_policy && blk.ui_policy.highlights === true, 'highlights:true');
  ck('level_complete outcome follows register', blk.level_complete && blk.level_complete.outcome, blk.level_complete && blk.level_complete.outcome === 'You did it', 'You did it');
  x.it.setRegister('industry');
  var blk2 = x.it.getSnapshotBlock();
  ck('industry register text', blk2.message, blk2.message === 'PLANT TERMS', 'PLANT TERMS');
  ck('industry level_complete outcome', blk2.level_complete && blk2.level_complete.outcome, blk2.level_complete && blk2.level_complete.outcome === 'Complete', 'Complete');
}));

// ============================== unit: follow mode (Path 2) ==============================
function synthProc() {
  return {
    id: 'p_test', title: 'Test procedure', outcome: 'All steps complete.',
    steps: [
      { text: 'Lower power with the control rods.', control: 'Control Bank', target: '90 %',
        cmd: { action: 'rod_nudge', group_id: 'control_rods', steps: -10 },
        acc: { p: 'power_pct', op: '~', v: 90, tol: 2 } },
      { text: 'Verify pressure stays above 15.', control: null, target: null,
        acc: { p: 'pressure_mpa', op: '>', v: 15 },
        saw: { p: 'core_inventory_pct', op: '<', v: 99 } },
      { text: 'Observe the response.' },
    ],
  };
}
function followInstr() {
  var below = mockLayer();
  var it = new RD.InstructorLayer(below);
  it.loadProcedure(synthProc(), { procedure_id: 'p_test', profile_key: 'pwr' });
  return { it: it, below: below };
}

T.push(test('Follow — strict gating: step family + safety set allowed, off-script blocked', function (ck) {
  var x = followInstr();
  var b = x.it.handleCommand({ action: 'open_porv' });
  ck('off-script command blocked', JSON.stringify(b), b && b.type === 'blocked', 'blocked');
  ck('block carries wrong-action text', b && b.message, b && /Control Bank/.test(b.message), 'mentions the step control');
  ck('blocked did not descend', x.below.calls.length, x.below.calls.length === 0, '0');
  var r1 = x.it.handleCommand({ action: 'rod_start', group_id: 'control_rods', direction: -1, speed: 'normal' });
  ck('rod family allowed for a rod step', JSON.stringify(r1), r1 && r1.ok === 'rod_start', 'rod_start ok');
  var r2 = x.it.handleCommand({ action: 'scram' });
  ck('safety set always allowed', JSON.stringify(r2), r2 && r2.ok === 'scram', 'scram ok');
  ck('cmdSeen latched by family command', x.it.follow.cmdSeen, x.it.follow.cmdSeen === true, 'true');
}));

T.push(test('Follow — instrument-first grading with true_state fallback + debounced auto-advance', function (ck) {
  var x = followInstr();
  x.it.handleCommand({ action: 'rod_nudge', group_id: 'control_rods', steps: -10 });
  // Instrument says 90 (in band) while truth says 85 (out of band): HR1 grading
  // must follow the instrument the operator sees.
  var s1 = snap({ instruments: { power_range: 90 }, true_state: { power_pct: 85 } });
  for (var i = 0; i < 4; i++) x.it.step(s1, i);
  var blk = x.it.getSnapshotBlock();
  ck('graded on the instrument', blk.follow.graded_by, blk.follow.graded_by === 'instrument', 'instrument');
  ck('debounce holds before N stable evaluations', blk.follow.step_index, blk.follow.step_index === 0, 'step 0');
  x.it.step(s1, 5);
  blk = x.it.getSnapshotBlock();
  ck('auto-advanced after stable acceptance', blk.follow.step_index, blk.follow.step_index === 1, 'step 1');

  // Step 2 grades pressure (instrument twin) and saw on core_inventory_pct (no
  // twin → true_state fallback); saw must latch even if only briefly true.
  var sSaw = snap({ instruments: { primary_pressure: 15.5 }, true_state: { core_inventory_pct: 98 } });
  x.it.step(sSaw, 6);
  ck('saw latched from true_state fallback', x.it.follow.sawSeen, x.it.follow.sawSeen === true, 'true');
  var sBack = snap({ instruments: { primary_pressure: 15.5 }, true_state: { core_inventory_pct: 100 } });
  for (var j = 0; j < 5; j++) x.it.step(sBack, 7 + j);
  blk = x.it.getSnapshotBlock();
  ck('advanced on acc+saw (saw stayed latched)', blk.follow.step_index, blk.follow.step_index === 2, 'step 2');
  var before = blk.follow.step_index;
  for (var k = 0; k < 10; k++) x.it.step(sBack, 20 + k);
  blk = x.it.getSnapshotBlock();
  ck('observation step waits for manual Next', blk.follow.step_index, blk.follow.step_index === before && !blk.follow.done, 'still step 2');
  x.it.handleCommand({ action: 'follow_nav', dir: 'next' });
  blk = x.it.getSnapshotBlock();
  ck('manual Next past the last step completes the procedure', blk.follow.done, blk.follow.done === true, 'done');
  ck('level_complete synthesized', blk.level_complete && blk.level_complete.title, blk.level_complete && blk.level_complete.title === 'Test procedure', 'Test procedure');
}));

T.push(test('Follow — nav prev/restart and follow highlight', function (ck) {
  var x = followInstr();
  var blk = x.it.getSnapshotBlock();
  ck('follow highlight derives from the step control', blk.highlight && blk.highlight.control_label, blk.highlight && blk.highlight.control_label === 'Control Bank', 'Control Bank');
  x.it.handleCommand({ action: 'follow_nav', dir: 'next' });
  ck('next advances', x.it.follow.idx, x.it.follow.idx === 1, '1');
  x.it.handleCommand({ action: 'follow_nav', dir: 'prev' });
  ck('prev returns', x.it.follow.idx, x.it.follow.idx === 0, '0');
  x.it.handleCommand({ action: 'follow_nav', dir: 'next' });
  x.it.handleCommand({ action: 'follow_nav', dir: 'restart' });
  ck('restart rewinds to step 0', x.it.follow.idx, x.it.follow.idx === 0, '0');
}));

// ============================== unit: save/restore (§17) ==============================
T.push(test('Save/restore — mid-scenario progress round-trips via the registry', function (ck) {
  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.__m6test = { id: '__m6test', beats: [
    { id: 'b1', trigger: { type: 'time', value: 0 }, gate: { block_actions: ['open_porv'] }, commentary: { learning: 'one', industry: 'ONE' } },
    { id: 'b2', trigger: { type: 'delay', value: 100 }, commentary: { learning: 'two', industry: 'TWO' } },
  ] };
  var x = instrWith(RD.SCENARIOS.__m6test);
  x.it.setRegister('industry');
  x.it.step(snap(), 50);
  var saved = JSON.parse(JSON.stringify(x.it.saveState()));   // must be JSON-able
  var y = new RD.InstructorLayer(mockLayer());
  y.loadState(saved);
  ck('register restored', y.register, y.register === 'industry', 'industry');
  ck('current beat restored', y.currentBeatId, y.currentBeatId === 'b2', 'b2');
  ck('fired beats restored', Array.from(y.firedBeats).join(','), y.firedBeats.has('b1'), 'has b1');
  ck('pending message restored', y.getMessage().message, y.getMessage().message === 'ONE', 'ONE');
  var r = y.handleCommand({ action: 'open_porv' });
  ck('active gate restored and enforced', JSON.stringify(r), r && r.type === 'blocked', 'blocked');
  y.step(snap(), 149);
  ck('delay trigger uses restored fire time (not yet)', y.getMessage().message, y.getMessage().message === 'ONE', 'still ONE');
  y.step(snap(), 151);
  ck('delay trigger fires from restored fire time', y.getMessage().message, y.getMessage().message === 'TWO', 'TWO');

  saved.scenario_id = '__does_not_exist';
  var z = new RD.InstructorLayer(mockLayer());
  z.loadState(saved);
  ck('missing registry entry degrades to free-play', z.mode, z.mode === null, 'null mode');
  ck('register survives the degradation', z.register, z.register === 'industry', 'industry');
  delete RD.SCENARIOS.__m6test;
}));

// #142. Two pieces of PROGRESS used to be dropped by saveState: the operator-action
// memory and the follow-mode acceptance streak. Both restored as "nothing has
// happened yet", so a save (or an auto-checkpoint, or a rewind — all the same
// path) silently undid work the player had already done. The action memory is the
// serious one: an `operator_action` beat fires because a matching command
// descended since the last beat fired, and this list is the only record of that,
// so a one-shot action performed before the save could never be credited and the
// scenario had no way forward.
T.push(test('Save/restore — operator-action memory and acc streak are progress, not scratch (#142)', function (ck) {
  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.__m6act = { id: '__m6act', beats: [
    { id: 'b1', trigger: { type: 'time', value: 0 }, commentary: { learning: 'go', industry: 'GO' } },
    { id: 'b2', trigger: { type: 'operator_action', command: 'open_porv' }, commentary: { learning: 'seen', industry: 'SEEN' } },
  ] };
  var x = instrWith(RD.SCENARIOS.__m6act);
  x.it.step(snap(), 1);                                  // b1 fires, arming b2
  ck('action beat armed', x.it.currentBeatId, x.it.currentBeatId === 'b2', 'b2');
  x.it.handleCommand({ action: 'open_porv' });            // the one-shot the beat watches
  var saved = JSON.parse(JSON.stringify(x.it.saveState()));
  ck('save carries the action memory', (saved.actions_since_beat || []).length,
    (saved.actions_since_beat || []).length === 1, '1 command');

  var y = new RD.InstructorLayer(mockLayer());
  y.loadState(saved);
  y.step(snap(), 2);
  ck('restored instructor credits the action (no softlock)', y.getMessage().message,
    y.getMessage().message === 'seen', 'seen');

  // A save written before #142 has no such field; it must still load, and behave
  // exactly as it used to — the beat stays armed.
  var legacy = JSON.parse(JSON.stringify(saved));
  delete legacy.actions_since_beat;
  var z = new RD.InstructorLayer(mockLayer());
  z.loadState(legacy);
  z.step(snap(), 2);
  ck('pre-#142 save still loads, with its old behaviour', z.currentBeatId, z.currentBeatId === 'b2', 'b2 still armed');
  delete RD.SCENARIOS.__m6act;

  // Follow mode: a partly-earned acceptance streak (ACC_STABLE_N = 5) must survive.
  RD.MANUAL_PROCEDURES = RD.MANUAL_PROCEDURES || {};
  RD.MANUAL_PROCEDURES.pwr = RD.MANUAL_PROCEDURES.pwr || [];
  RD.MANUAL_PROCEDURES.pwr.push(synthProc());
  var f = followInstr();
  f.it.handleCommand({ action: 'rod_nudge', group_id: 'control_rods', steps: -10 });
  var inBand = snap({ instruments: { power_range: 90 }, true_state: { power_pct: 90 } });
  for (var i = 0; i < 3; i++) f.it.step(inBand, i);       // 3 of the 5 needed
  var fsaved = JSON.parse(JSON.stringify(f.it.saveState()));
  ck('save carries the partial acc streak', fsaved.follow && fsaved.follow.acc_streak,
    fsaved.follow && fsaved.follow.acc_streak === 3, '3');
  var g = new RD.InstructorLayer(mockLayer());
  g.loadState(fsaved);
  ck('streak restored, not zeroed', g.follow && g.follow.accStreak, g.follow && g.follow.accStreak === 3, '3');
  g.step(inBand, 4);
  ck('restored streak still short of the debounce', g.getSnapshotBlock().follow.step_index,
    g.getSnapshotBlock().follow.step_index === 0, 'step 0');
  g.step(inBand, 5);
  ck('advances on the 5th evaluation, counting the 3 it was saved with',
    g.getSnapshotBlock().follow.step_index, g.getSnapshotBlock().follow.step_index === 1, 'step 1');
  RD.MANUAL_PROCEDURES.pwr = RD.MANUAL_PROCEDURES.pwr.filter(function (p) { return p.id !== 'p_test'; });
}));

T.push(test('Consume-flags + rebaseTime (rewind support)', function (ck) {
  var x = instrWith({ id: 't', beats: [
    { id: 'b1', trigger: { type: 'time', value: 0 }, speed: 30, commentary: { learning: 'x', industry: 'x' } },
    { id: 'b2', trigger: { type: 'delay', value: 2 }, rewind: { steps: 2 }, speed: 1, commentary: { learning: 'y', industry: 'y' } },
  ] });
  // Capture each consume ONCE — the old checks passed the literal `true` as the
  // pass argument (could never fail) and/or consumed the flag twice, so the
  // observed and asserted values were different reads.
  var cp0 = x.it.consumeCheckpointRequest();
  ck('load requests checkpoint 0', cp0, cp0 === true, 'true');
  var cp1 = x.it.consumeCheckpointRequest();
  ck('consume clears the flag', cp1, cp1 === false, 'false');
  var sp0 = x.it.consumeSpeedRequest();
  ck('no speed request before a beat fires', String(sp0), sp0 === null, 'null');
  x.it.step(snap(), 10);
  var cp2 = x.it.consumeCheckpointRequest();
  ck('beat fire requests a checkpoint', cp2, cp2 === true, 'true');
  var sp1 = x.it.consumeSpeedRequest();
  ck('beat speed requests time acceleration', sp1, sp1 === 30 && x.it._speedRequested === null, '30, then cleared');
  x.it.step(snap(), 12);
  var rw = x.it.consumeRewindRequest();
  ck('rewind beat requests a world rewind', JSON.stringify(rw), rw && rw.steps === 2 && rw.scope === 'world', '{steps:2, scope:world}');
  // Single read: the old double-consume meant a regression (rewind beat ALSO
  // checkpointing — the "one slot off" bug instructor_layer.js guards against)
  // would be consumed by the observed read and pass the re-read anyway.
  var cp3 = x.it.consumeCheckpointRequest();
  ck('rewind beat does not also checkpoint', cp3, cp3 === false, 'false');
  var sp2 = x.it.consumeSpeedRequest();
  ck('rewind beat can also drop the speed', sp2, sp2 === 1, '1 (from beat b2)');
  x.it.rebaseTime(5);
  ck('rebaseTime clamps the fire anchor back', x.it.lastBeatFireTime, x.it.lastBeatFireTime === 5, '5');
}));

// ============================== integration: full PWR stack via M5 ==============================
function svc(seed) {
  var s = new RD.SimulationService({ seed: seed != null ? seed : 42 });
  s.selectPlant('pwr', 'hot_full_power', null);
  return s;
}

T.push(test('Integration — start_scenario resets the plant, loads, and beats drive the stack', function (ck) {
  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.__m6int = {
    id: '__m6int', title: 'Integration', plant_id: 'pwr', design_version: null,
    initial_state: 'hot_full_power', mode: 'demonstration',
    beats: [
      { id: 'kick', trigger: { type: 'time', value: 0.2 },
        inject_failures: ['loss_of_feedwater'],
        commentary: { learning: 'feedwater gone', industry: 'LOFW' } },
    ],
  };
  var s = svc();
  s.advanceCycles(3);                                     // dirty the run state first
  var snap0 = s.handleCommand({ action: 'start_scenario', scenario_id: '__m6int' });
  ck('start_scenario returns a fresh snapshot', snap0 && snap0.metadata && snap0.metadata.sim_time, snap0 && snap0.metadata.sim_time === 0, 'sim_time 0');
  var sn = s.advanceCycles(5);
  ck('beat commentary in the snapshot', sn.instructor.message, sn.instructor.message === 'feedwater gone', 'feedwater gone');
  var hasLofw = sn.active_failures.some(function (f) { return f === 'loss_of_feedwater' || (f && f.id === 'loss_of_feedwater'); });
  ck('beat-injected failure is active', JSON.stringify(sn.active_failures), hasLofw, 'loss_of_feedwater active');
  var bad = s.handleCommand({ action: 'start_scenario', scenario_id: 'nope' });
  ck('unknown scenario_id errors', JSON.stringify(bad), bad && bad.type === 'error', 'error');
  var sn2 = s.handleCommand({ action: 'stop_scenario' });
  ck('stop_scenario returns to free-play', sn2.instructor.message, sn2.instructor.message === null, 'null');
  var sn3 = s.handleCommand({ action: 'reset', plant_id: 'pwr', initial_state: 'hot_full_power' });
  var freePlay = sn3.instructor.message === null && s.instructor.mode === null;
  ck('plain reset also unloads any scenario', sn3.instructor.message + '/' + s.instructor.mode, freePlay, 'null/null');
  delete RD.SCENARIOS.__m6int;
}));

T.push(test('Integration — Path 2: start_follow runs a real procedure end-to-end via M5', function (ck) {
  var s = svc();
  // A walkthrough starts from the procedure's authored `from` state, whatever
  // the plant was doing: pwr_raise_power (from 50_percent) at full power must
  // NOT be trivially completable.
  s.advanceCycles(2);
  var pre = s.handleCommand({ action: 'start_follow', procedure_id: 'pwr_raise_power' });
  ck('start_follow resets to the procedure\'s from state', pre.true_state.power_pct.toFixed(0) + '%', Math.abs(pre.true_state.power_pct - 50) < 5, '~50% (50_percent), not 100%');
  ck('so its first acceptance is honestly unmet at start', String(pre.instructor.follow.acc_met), pre.instructor.follow.acc_met === false, 'false');

  var sn = s.handleCommand({ action: 'start_follow', procedure_id: 'pwr_lower_power' });
  ck('and pwr_lower_power starts back at hot_full_power', sn.true_state.power_pct.toFixed(0) + '%', Math.abs(sn.true_state.power_pct - 100) < 3, '~100%');
  ck('follow block in the snapshot', JSON.stringify(sn.instructor.follow),
    sn.instructor.follow && sn.instructor.follow.procedure_id === 'pwr_lower_power' && sn.instructor.follow.step_index === 0 && sn.instructor.follow.step_total === 2,
    'step 0 of 2');
  var blocked = s.handleCommand({ action: 'open_porv' });
  ck('off-script command blocked through the full stack (HR5)', JSON.stringify(blocked), blocked && blocked.type === 'blocked', 'blocked');
  ck('blocked command did not reach the engine', s.engine.getControlState().porv_demand, s.engine.getControlState().porv_demand === 'closed', 'closed');
  // 60 MWe = the value pwr_lower_power step 1 actually authors (60 % of this plant's
  // 100 MWe rating). This read 600 — a leftover from the ~1000 MWe plant, i.e. a 6x
  // ask on the rescaled unit. It "worked" only because the old feed/steam clip
  // asymmetry (#130) flooded the SG on an above-rated ask and scrammed the plant,
  // which is what actually drove power under the step's 98 % acceptance. With that
  // fixed, the test has to lower power the way the procedure says to.
  var ok = s.handleCommand({ action: 'set_steam_demand', mwe: 60 });
  ck('the step\'s own command passes the gate', JSON.stringify(ok), ok == null, 'null (accepted)');
  sn = s.advanceCycles(2);
  ck('cmd-only step auto-advances once its command is issued', sn.instructor.follow.step_index, sn.instructor.follow.step_index === 1, '1');
  s.handleCommand({ action: 'rod_nudge', group_id: 'control', steps: -40, speed: 'normal' });
  s.handleCommand({ action: 'set_speed', value: 10 });
  var done = null;
  for (var i = 0; i < 3000 && !done; i++) {
    sn = s.advanceCycles(1);
    if (sn.instructor.follow && sn.instructor.follow.done) done = sn;
  }
  ck('procedure completes by auto-advance on the graded acceptance', done ? 'done at t=' + done.metadata.sim_time.toFixed(0) + 's' : 'never', !!done, 'done');
  if (done) {
    ck('acceptance was truly reached (power < 98%)', done.true_state.power_pct.toFixed(1) + '%', done.true_state.power_pct < 98, '< 98%');
    ck('completion synthesizes level_complete', done.instructor.level_complete && done.instructor.level_complete.title, !!done.instructor.level_complete, 'present');
  }
  var off = s.handleCommand({ action: 'stop_follow' });
  ck('stop_follow returns to free-play', JSON.stringify({ m: off.instructor.message, f: off.instructor.follow }), off.instructor.message === null && off.instructor.follow === null, 'nulls');
}));

T.push(test('Integration — swap invariant: real M6 free-play is byte-identical to the fallback', function (ck) {
  function run(instr) {
    var s = new RD.SimulationService({ seed: 321, instructor: instr });
    s.selectPlant('pwr', 'hot_full_power', null);
    s.advanceCycles(3);
    s.handleCommand({ action: 'scram' });
    s.advanceCycles(5);
    var sn = s.assembleSnapshot();
    return JSON.stringify({ ts: sn.true_state, ins: sn.instruments, alarms: sn.alarms, t: sn.metadata.sim_time });
  }
  var a = run(new RD.InstructorLayer(null));
  var b = run(new RD.DefaultInstructor(null));
  ck('identical physics-relevant snapshots', 'a==b', a === b, 'identical');
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
