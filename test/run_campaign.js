/*
 * run_campaign.js — validation of the PWR training campaign
 * (Blueprint/pwr_training_campaign.md).
 *
 * Part 1 (structural): every campaign mission resolves to a real scenario or
 * procedure; scenario beats use the legal M6 trigger vocabulary; commentary
 * carries both registers; every campaign scenario has a reachable
 * level_complete endpoint.
 *
 * Part 2 (functional): each NEW campaign scenario is driven headlessly through
 * the full M5 stack (engine + M4 + Instructor) with a scripted operator, to a
 * level_complete — proving every mission is completable on current physics.
 *
 *   node test/run_campaign.js
 */
'use strict';
var path = require('path');
function load(p) { require(path.join(__dirname, '..', p)); }
[
  'engines/load_mode.js',
  'engines/pwr/pwr_config.js', 'engines/pwr/pwr_protection.js', 'engines/pwr/pwr_thermal.js',
  'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js',
  'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
  'layers/control_failure_layer.js', 'layers/instructor_layer.js', 'layers/simulation_service.js',
  'scenarios/pwr_hook.js', 'scenarios/pwr_tmi.js', 'scenarios/pwr_sg_flood.js',
  'scenarios/pwr_tour.js', 'scenarios/pwr_chain_reaction.js', 'scenarios/pwr_feedback.js',
  'scenarios/pwr_xenon.js', 'scenarios/pwr_boron.js', 'scenarios/pwr_load_follow.js',
  'scenarios/pwr_protection.js', 'scenarios/pwr_qualify.js',
  'ui/manual_procedures.js', 'ui/campaign_data.js',
].forEach(load);
var RD = globalThis.RD;

// ---------------------------------------------------------------- harness
var T = [];
function test(name, fn) {
  var checks = [];
  var ck = function (desc, observed, pass, expected) {
    checks.push({ desc: desc, observed: observed, expected: expected, pass: !!pass });
  };
  try { fn(ck); } catch (e) { ck('threw: ' + (e && e.message), String(e && e.stack || e), false, 'no throw'); }
  T.push({ name: name, pass: checks.every(function (c) { return c.pass; }), checks: checks });
}
function report() {
  var passS = 0, failS = 0, passC = 0, failC = 0;
  T.forEach(function (t) {
    console.log((t.pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  \x1b[1m' + t.name + '\x1b[0m');
    t.checks.forEach(function (c) {
      if (c.pass) { passC++; if (!t.pass) console.log('\x1b[32m  ✓\x1b[0m ' + c.desc); }
      else { failC++; console.log('\x1b[31m  ✗\x1b[0m ' + c.desc + '\x1b[2m  [expected ' + c.expected + ', observed ' + c.observed + ']\x1b[0m'); }
    });
    if (t.pass) passS++; else failS++;
  });
  console.log('\n\x1b[1m──────────────────────────────────────────\x1b[0m');
  console.log('\x1b[1mSuites: ' + passS + '/' + (passS + failS) + '\x1b[0m   Checks: \x1b[32m' + passC + ' passed\x1b[0m' + (failC ? ', \x1b[31m' + failC + ' failed\x1b[0m' : ''));
  process.exit(failS ? 1 : 0);
}

// Drive broadcast cycles until pred(snapshot) is true or simBudget sim-seconds
// pass. Returns the satisfying snapshot or null.
function runUntil(s, pred, simBudget) {
  var start = s.simTime, snap = null;
  for (var guard = 0; guard < 400000; guard++) {
    snap = s.advanceCycles(1);
    if (pred(snap)) return snap;
    if (s.simTime - start > simBudget) return null;
  }
  return null;
}
function startScenario(id) {
  var s = new RD.SimulationService({ seed: 42 });
  var sc = RD.SCENARIOS[id];
  s.selectPlant(sc.plant_id, sc.initial_state, sc.design_version || null);
  s.handleCommand({ action: 'start_scenario', scenario_id: id });
  s.handleCommand({ action: 'play' });
  return s;
}
function lc(snap) { return snap.instructor && snap.instructor.level_complete; }
// current_beat_id is the PENDING beat (armed, waiting on its trigger). A beat
// prompts when it FIRES — i.e. when its successor becomes pending. Scripted
// operator actions must land while the CONSUMING beat is pending, because the
// instructor clears its operator-action memory on every beat fire.
function beatIs(snap, id) { return snap.instructor && snap.instructor.current_beat_id === id; }
function waitBeat(s, id, budget) { return runUntil(s, function (sn) { return beatIs(sn, id); }, budget); }
function settle(s, secs) { var end = s.simTime + secs; var sn; while (s.simTime < end) sn = s.advanceCycles(1); return sn; }

// ---------------------------------------------------------------- Part 1: structure
var TRIGGERS = ['time', 'delay', 'instrument', 'true_state', 'operator_action', 'inaction', 'alarm', 'scram', 'manual', 'all', 'any'];
var camp = RD.CAMPAIGNS.pwr;

test('campaign structure — missions resolve, ids unique', function (ck) {
  var seen = {};
  var missions = [];
  camp.acts.forEach(function (a) { a.missions.forEach(function (m) { missions.push(m); }); });
  (camp.bonus || []).forEach(function (m) { missions.push(m); });
  ck('campaign has 5 acts', camp.acts.length, camp.acts.length === 5, '5');
  ck('19 required missions', missions.length - (camp.bonus || []).length, missions.length - (camp.bonus || []).length === 19, '19');
  missions.forEach(function (m) {
    var key = m.kind + ':' + m.id;
    ck('unique: ' + key, key, !seen[key], 'no duplicate');
    seen[key] = true;
    if (m.kind === 'scenario') {
      var sc = RD.SCENARIOS[m.id];
      ck('scenario exists: ' + m.id, !!sc, !!sc, 'defined in RD.SCENARIOS');
      if (sc) ck(m.id + ' is a PWR scenario', sc.plant_id, sc.plant_id === 'pwr', 'pwr');
    } else {
      var pr = (RD.MANUAL_PROCEDURES.pwr || []).filter(function (x) { return x.id === m.id; })[0];
      ck('procedure exists: ' + m.id, !!pr, !!pr, 'defined in MANUAL_PROCEDURES.pwr');
      if (pr) ck(m.id + ' is followable (not narrative)', !pr.narrative, !pr.narrative, 'narrative:false');
    }
    ck(key + ' has a teaches line', !!m.teaches, !!m.teaches, 'teaches text');
  });
});

test('campaign scenarios — beat vocabulary, registers, endpoints', function (ck) {
  var scenarioIds = [];
  camp.acts.forEach(function (a) { a.missions.forEach(function (m) { if (m.kind === 'scenario') scenarioIds.push(m.id); }); });
  scenarioIds.forEach(function (id) {
    var sc = RD.SCENARIOS[id]; if (!sc) return;
    var beatIds = {};
    var hasLc = false;
    (sc.beats || []).forEach(function (b) {
      ck(id + '.' + b.id + ' unique beat id', b.id, !beatIds[b.id], 'unique');
      beatIds[b.id] = true;
      var check = function (tr, where) {
        if (!tr) { ck(id + '.' + b.id + ' ' + where + ' has trigger', 'missing', false, 'trigger object'); return; }
        ck(id + '.' + b.id + ' ' + where + ' trigger legal (' + tr.type + ')', tr.type, TRIGGERS.indexOf(tr.type) !== -1, TRIGGERS.join('|'));
        (tr.triggers || []).forEach(function (c2) { check(c2, where + '.sub'); });
      };
      check(b.trigger, 'trigger');
      (b.branches || []).forEach(function (br, i) { check(br.trigger, 'branch[' + i + ']'); });
      if (b.commentary) {
        ck(id + '.' + b.id + ' has learning register', !!b.commentary.learning, !!b.commentary.learning, 'learning text');
        ck(id + '.' + b.id + ' has industry register', !!b.commentary.industry, !!b.commentary.industry, 'industry text');
      }
      if (b.level_complete) hasLc = true;
    });
    ck(id + ' has a level_complete endpoint', hasLc, hasLc, '≥1 level_complete beat');
  });
});

// ---------------------------------------------------------------- Part 2: functional
// Each new scenario is played to completion by a scripted operator.

test('pwr_tour — energy journey completes', function (ck) {
  var s = startScenario('pwr_tour');
  // act_restore pending ⇒ the act_load prompt has fired: throttle now.
  var snap = waitBeat(s, 'act_restore', 300);
  ck('load-throttle prompt fires', !!snap, !!snap, 'act_restore pending');
  if (!snap) return;
  s.handleCommand({ action: 'set_load_mode', mode: 'manual' });
  s.handleCommand({ action: 'set_load_target', mwe: 900 });
  snap = waitBeat(s, 'complete', 400);
  ck('load reduction observed → restore prompt', !!snap, !!snap, 'complete pending');
  if (!snap) return;
  s.handleCommand({ action: 'set_load_mode', mode: 'follow' });
  snap = runUntil(s, function (sn) { return lc(sn); }, 600);
  ck('tour completes', !!snap, !!snap, 'level_complete');
  if (snap) ck('completion is the tour endpoint', lc(snap).title, /Journey/i.test(lc(snap).title), 'Energy Journey card');
});

test('pwr_chain_reaction — pull to critical, then back below', function (ck) {
  var s = startScenario('pwr_chain_reaction');
  // critical pending ⇒ pull_rods prompt fired: withdraw and hold.
  var snap = waitBeat(s, 'critical', 120);
  ck('rod-pull prompt fires', !!snap, !!snap, 'critical pending');
  if (!snap) return;
  s.handleCommand({ action: 'rod_start', group_id: 'control_rods', direction: 1, speed: 'normal' });
  snap = waitBeat(s, 'reinsert', 1200);
  ck('criticality recognized (SUR positive)', !!snap, !!snap, 'reinsert pending');
  s.handleCommand({ action: 'rod_stop', group_id: 'control_rods' });
  if (!snap) return;
  snap = waitBeat(s, 'complete', 600);
  ck('rise observed → reinsert prompt', !!snap, !!snap, 'complete pending');
  if (!snap) return;
  s.handleCommand({ action: 'rod_start', group_id: 'control_rods', direction: -1, speed: 'normal' });
  snap = runUntil(s, function (sn) { return lc(sn); }, 900);
  s.handleCommand({ action: 'rod_stop', group_id: 'control_rods' });
  ck('returns subcritical → complete', !!snap, !!snap, 'level_complete');
});

test('pwr_feedback — nudge out, plant self-stabilizes, demand demo', function (ck) {
  var s = startScenario('pwr_feedback');
  // stabilized pending ⇒ nudge_task prompt fired: nudge now.
  var snap = waitBeat(s, 'stabilized', 120);
  ck('nudge prompt fires', !!snap, !!snap, 'stabilized pending');
  if (!snap) return;
  s.handleCommand({ action: 'rod_nudge', group_id: 'control_rods', steps: 3, speed: 'normal' });
  snap = waitBeat(s, 'complete', 900);
  ck('stabilization observed → demand demo runs', !!snap, !!snap, 'complete pending');
  if (!snap) return;
  snap = runUntil(s, function (sn) { return lc(sn); }, 900);
  ck('power follows steam demand → complete', !!snap, !!snap, 'level_complete');
});

test('pwr_xenon — post-trip build, peak, and decay observed', function (ck) {
  var s = startScenario('pwr_xenon');
  var snap = runUntil(s, function (sn) { return sn.true_state.scrammed; }, 120);
  ck('instructor scrams the plant', !!snap, !!snap, 'scrammed');
  if (!snap) return;
  snap = waitBeat(s, 'peak', 4 * 3600);
  ck('xenon build narrated (>106% eq)', !!snap, !!snap, 'peak pending');
  if (!snap) return;
  snap = waitBeat(s, 'complete', 4 * 3600);
  ck('peak crossed (>113% eq)', !!snap, !!snap, 'complete pending');
  if (!snap) return;
  snap = runUntil(s, function (sn) { return lc(sn); }, 6 * 3600);
  ck('decay past the crest completes the arc', !!snap, !!snap, 'level_complete');
});

test('pwr_boron — dilute up, borate back', function (ck) {
  var s = startScenario('pwr_boron');
  // borate_task pending ⇒ dilute prompt fired: dilute now.
  var snap = waitBeat(s, 'borate_task', 120);
  ck('dilution prompt fires', !!snap, !!snap, 'borate_task pending');
  if (!snap) return;
  s.handleCommand({ action: 'set_boron_adjust', rate: -2 });
  snap = waitBeat(s, 'complete', 2400);
  ck('Tavg rise on dilution → borate prompt', !!snap, !!snap, 'complete pending');
  if (!snap) return;
  s.handleCommand({ action: 'set_boron_adjust', rate: 2 });
  snap = runUntil(s, function (sn) { return lc(sn); }, 3600);
  ck('Tavg restored with boration → complete', !!snap, !!snap, 'level_complete');
});

test('pwr_load_follow — evening ramp and morning pickup', function (ck) {
  var s = startScenario('pwr_load_follow');
  // hold pending ⇒ ramp_down prompt fired: go to manual 800.
  var snap = waitBeat(s, 'hold', 120);
  ck('ramp prompt fires', !!snap, !!snap, 'hold pending');
  if (!snap) return;
  s.handleCommand({ action: 'set_load_mode', mode: 'manual' });
  s.handleCommand({ action: 'set_load_target', mwe: 800 });
  snap = waitBeat(s, 'restore_follow', 1800);
  ck('night hold + morning prompt', !!snap, !!snap, 'restore_follow pending');
  if (!snap) return;
  s.handleCommand({ action: 'set_load_target', mwe: 1000 });
  snap = waitBeat(s, 'complete', 1200);
  ck('back at full output → restore prompt', !!snap, !!snap, 'complete pending');
  if (!snap) return;
  s.handleCommand({ action: 'set_load_mode', mode: 'follow' });
  snap = runUntil(s, function (sn) { return lc(sn); }, 400);
  ck('load-follow mission completes', !!snap, !!snap, 'level_complete');
});

test('pwr_protection — turbine trip, scram, acknowledge, stabilize', function (ck) {
  var s = startScenario('pwr_protection');
  var snap = runUntil(s, function (sn) { return sn.rps_state.scrammed; }, 600);
  ck('the deliberate turbine trip scrams the plant', !!snap, !!snap, 'scrammed');
  if (!snap) return;
  // stabilizing pending ⇒ ack_task prompt fired: acknowledge now.
  snap = waitBeat(s, 'stabilizing', 300);
  ck('acknowledge prompt fires', !!snap, !!snap, 'stabilizing pending');
  if (!snap) return;
  s.handleCommand({ action: 'acknowledge_all_alarms' });
  snap = runUntil(s, function (sn) { return lc(sn); }, 1200);
  ck('stable shutdown → complete', !!snap, !!snap, 'level_complete');
});

test('pwr_qualify — blind stuck PORV isolated and recovered (win path)', function (ck) {
  var s = startScenario('pwr_qualify');
  var snap = runUntil(s, function (sn) { return sn.true_state.porv_stuck; }, 120);
  ck('fault injected silently', !!snap, !!snap, 'porv_stuck true');
  if (!snap) return;
  ck('indicator lies (reads closed while stuck open)', snap.instruments.porv_indicator, snap.instruments.porv_indicator === false || snap.instruments.porv_indicator === 'closed' || snap.instruments.porv_indicator === 0, 'closed indication');
  // Candidate waits for the margin alarm (the graded window), then acts.
  // challenge fires 2 s after it arms — settle past the fire so the actions
  // land inside its branch-watch window (action memory clears on fire).
  snap = waitBeat(s, 'challenge', 1800);
  ck('margin erosion opens the graded window', !!snap, !!snap, 'challenge beat');
  if (!snap) return;
  settle(s, 6);
  s.handleCommand({ action: 'close_block_valve' });
  s.handleCommand({ action: 'set_hpi', active: true });
  snap = runUntil(s, function (sn) { return lc(sn); }, 3600);
  ck('recovery reaches an endpoint', !!snap, !!snap, 'level_complete');
  if (snap) ck('outcome is qualification', lc(snap).title, /Qualified/i.test(lc(snap).title), 'Qualified card');
});

test('pwr_qualify — early isolation on the pressure trend also passes', function (ck) {
  var s = startScenario('pwr_qualify');
  var snap = runUntil(s, function (sn) { return sn.true_state.porv_stuck; }, 120);
  ck('fault injected', !!snap, !!snap, 'porv_stuck true');
  if (!snap) return;
  // The sharp candidate isolates before the alarm ever sounds.
  s.handleCommand({ action: 'close_block_valve' });
  snap = runUntil(s, function (sn) { return lc(sn); }, 1200);
  ck('early isolation reaches an endpoint', !!snap, !!snap, 'level_complete');
  if (snap) ck('outcome is qualification', lc(snap).title, /Qualified/i.test(lc(snap).title), 'Qualified card');
});

test('pwr_qualify — negligence fails (failure endpoint exists)', function (ck) {
  var s = startScenario('pwr_qualify');
  var snap = runUntil(s, function (sn) { return sn.true_state.porv_stuck; }, 120);
  ck('fault injected', !!snap, !!snap, 'porv_stuck true');
  if (!snap) return;
  // No operator action at all — the exam must end in a failure card.
  snap = runUntil(s, function (sn) { return lc(sn); }, 2 * 3600);
  ck('reaches an endpoint without operator help', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is a failure card', lc(snap).title, !/Qualified/i.test(lc(snap).title), 'not Qualified');
});

report();
