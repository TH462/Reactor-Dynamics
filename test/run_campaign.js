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
  'engines/rbmk/rbmk_config.js', 'engines/rbmk/rbmk_protection.js', 'engines/rbmk/rbmk_kinetics.js',
  'engines/rbmk/rbmk_thermal.js', 'engines/rbmk/rbmk_rods.js', 'engines/rbmk/rbmk_instruments.js', 'engines/rbmk/rbmk_engine.js',
  'engines/bwr/bwr_config.js', 'engines/bwr/bwr_protection.js', 'engines/bwr/bwr_vessel.js',
  'engines/bwr/bwr_recirculation.js', 'engines/bwr/bwr_safety_systems.js', 'engines/bwr/bwr_instruments.js', 'engines/bwr/bwr_engine.js',
  'layers/control_failure_layer.js', 'layers/instructor_layer.js', 'layers/simulation_service.js',
  'scenarios/pwr_hook.js', 'scenarios/pwr_tmi.js', 'scenarios/pwr_sg_flood.js',
  'scenarios/pwr_tour.js', 'scenarios/pwr_chain_reaction.js', 'scenarios/pwr_feedback.js',
  'scenarios/pwr_xenon.js', 'scenarios/pwr_boron.js', 'scenarios/pwr_load_follow.js',
  'scenarios/pwr_protection.js', 'scenarios/pwr_qualify.js',
  'scenarios/rbmk_tour.js', 'scenarios/rbmk_void.js', 'scenarios/rbmk_chernobyl.js', 'scenarios/rbmk_az5_fixed.js',
  'scenarios/bwr_tour.js', 'scenarios/bwr_recirc.js', 'scenarios/bwr_isolation.js',
  'scenarios/bwr_fukushima.js', 'scenarios/bwr_qualify.js',
  'ui/manual_procedures.js', 'ui/campaign_data.js',
  'ui/diagram/pwr_synoptic.js',   // safe headless: top level only defines functions/data
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
// campaign plant → the MANUAL_PROCEDURES engine keys its procedures must exist under
var ENGINE_KEYS = { pwr: ['pwr'], rbmk: ['rbmk_pre', 'rbmk_post'], bwr: ['bwr'] };
var EXPECTED_MISSIONS = { pwr: 19, rbmk: 8, bwr: 8 };

test('campaign structure — missions resolve, ids unique (all plants)', function (ck) {
  Object.keys(RD.CAMPAIGNS).forEach(function (cid) {
    var camp = RD.CAMPAIGNS[cid];
    var seen = {};
    var missions = [];
    camp.acts.forEach(function (a) { a.missions.forEach(function (m) { missions.push(m); }); });
    var required = missions.length;
    (camp.bonus || []).forEach(function (m) { missions.push(m); });
    ck(cid + ': expected mission count', required, required === EXPECTED_MISSIONS[cid], String(EXPECTED_MISSIONS[cid]));
    missions.forEach(function (m) {
      var key = cid + '/' + m.kind + ':' + m.id;
      ck('unique: ' + key, key, !seen[key], 'no duplicate');
      seen[key] = true;
      if (m.kind === 'scenario') {
        var sc = RD.SCENARIOS[m.id];
        ck('scenario exists: ' + m.id, !!sc, !!sc, 'defined in RD.SCENARIOS');
        if (sc) ck(m.id + ' plant matches campaign', sc.plant_id, sc.plant_id === cid, cid);
      } else {
        ENGINE_KEYS[cid].forEach(function (ek) {
          var pr = (RD.MANUAL_PROCEDURES[ek] || []).filter(function (x) { return x.id === m.id; })[0];
          ck('procedure exists: ' + m.id + ' [' + ek + ']', !!pr, !!pr, 'defined in MANUAL_PROCEDURES.' + ek);
          if (pr) ck(m.id + ' [' + ek + '] followable', !pr.narrative, !pr.narrative, 'narrative:false');
        });
      }
      ck(key + ' has a teaches line', !!m.teaches, !!m.teaches, 'teaches text');
    });
  });
});

test('campaign scenarios — beat vocabulary, registers, endpoints', function (ck) {
  var scenarioIds = [];
  Object.keys(RD.CAMPAIGNS).forEach(function (cid) {
    RD.CAMPAIGNS[cid].acts.forEach(function (a) { a.missions.forEach(function (m) { if (m.kind === 'scenario') scenarioIds.push(m.id); }); });
  });
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

// Every highlight a campaign beat names must resolve to something that can
// actually glow: PWR control labels against the synoptic's SYN_CONTROL_MAP
// (exported as highlightLabels), gauge ids against the per-plant gauge strip
// (mirrors app.js PROFILES). Playtest finding: four PWR beats named labels
// the map did not know, and pwr_sg_flood pointed at a nonexistent gauge id.
var GAUGE_IDS = {
  pwr:  ['power', 'press', 'tavg', 'pzr', 'sg', 'subcool'],
  rbmk: ['power', 'steam_p', 'drum', 'flow', 'void', 'orm'],
  bwr:  ['power', 'vessel_p', 'level', 'recirc', 'void', 'steam'],
};
test('campaign highlights — every named control/gauge resolves on the board', function (ck) {
  Object.keys(RD.CAMPAIGNS).forEach(function (cid) {
    var missions = [];
    RD.CAMPAIGNS[cid].acts.forEach(function (a) { a.missions.forEach(function (m) { missions.push(m); }); });
    (RD.CAMPAIGNS[cid].bonus || []).forEach(function (m) { missions.push(m); });
    missions.forEach(function (m) {
      if (m.kind !== 'scenario') return;
      var sc = RD.SCENARIOS[m.id]; if (!sc) return;
      (sc.beats || []).forEach(function (b) {
        if (!b.highlight) return;
        if (b.highlight.control_label && cid === 'pwr') {
          var known = RD.PwrSynoptic.highlightLabels.indexOf(b.highlight.control_label) !== -1;
          ck(m.id + '.' + b.id + ' control highlight resolves (' + b.highlight.control_label + ')',
            b.highlight.control_label, known, 'a SYN_CONTROL_MAP label');
        }
        if (b.highlight.instrument_id) {
          var ids = GAUGE_IDS[cid] || [];
          ck(m.id + '.' + b.id + ' gauge highlight resolves (' + b.highlight.instrument_id + ')',
            b.highlight.instrument_id, ids.indexOf(b.highlight.instrument_id) !== -1, ids.join('|'));
        }
      });
    });
  });
});

// ---------------------------------------------------------------- Part 2: functional
// Each new scenario is played to completion by a scripted operator.

test('pwr_tour — energy journey completes', function (ck) {
  var s = startScenario('pwr_tour');
  // act_load carries the branch watch: wait for it to arm, settle past its
  // delay-20 fire, then act inside the watch (action memory clears on fire).
  var snap = waitBeat(s, 'act_load', 300);
  ck('load-throttle beat arms', !!snap, !!snap, 'act_load pending');
  if (!snap) return;
  settle(s, 22);
  s.handleCommand({ action: 'set_load_mode', mode: 'manual' });
  s.handleCommand({ action: 'set_load_target', mwe: 900 });
  snap = waitBeat(s, 'act_restore', 400);
  ck('load reduction observed → restore prompt', !!snap, !!snap, 'act_restore pending');
  if (!snap) return;
  settle(s, 4);                         // act_restore fires (delay 2), watch opens
  s.handleCommand({ action: 'set_load_mode', mode: 'follow' });
  snap = runUntil(s, function (sn) { return lc(sn); }, 600);
  ck('tour completes', !!snap, !!snap, 'level_complete');
  if (snap) ck('completion is the tour endpoint', lc(snap).title, /Complete/i.test(lc(snap).title), 'Energy Journey — Complete card');
  // Greedy ask (500 MW) trips on load rejection → the trip-catch card, not a
  // softlock (playtest fix).
  var s2 = startScenario('pwr_tour');
  snap = waitBeat(s2, 'act_load', 300);
  if (snap) {
    settle(s2, 22);
    s2.handleCommand({ action: 'set_load_mode', mode: 'manual' });
    s2.handleCommand({ action: 'set_load_target', mwe: 500 });
    snap = runUntil(s2, function (sn) { return lc(sn); }, 600);
  }
  ck('greedy ask reaches an endpoint (no softlock)', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the load-rejection card', lc(snap).title, /Rejected/i.test(lc(snap).title), 'Load Rejected card');
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
  // dilute_task carries the branch watch: settle past its delay-24 fire, then
  // dilute inside the watch.
  var snap = waitBeat(s, 'dilute_task', 120);
  ck('dilution beat arms', !!snap, !!snap, 'dilute_task pending');
  if (!snap) return;
  settle(s, 28);
  s.handleCommand({ action: 'set_boron_adjust', rate: -2 });
  snap = waitBeat(s, 'borate_task', 2400);
  ck('Tavg rise on dilution → borate prompt', !!snap, !!snap, 'borate_task pending');
  if (!snap) return;
  settle(s, 4);                         // borate_task fires (delay 2; parks CVCS on HOLD)
  s.handleCommand({ action: 'set_boron_adjust', rate: 2 });
  snap = runUntil(s, function (sn) { return lc(sn); }, 3600);
  ck('Tavg restored with boration → complete', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the round trip', lc(snap).title, /Played/i.test(lc(snap).title), 'Long Game — Played card');
  // A reactor trip during the evolution lands on the failure card (playtest
  // fix — previously the mission softlocked under a stale prompt).
  var s2 = startScenario('pwr_boron');
  snap = waitBeat(s2, 'dilute_task', 120);
  if (snap) {
    settle(s2, 28);
    s2.handleCommand({ action: 'scram' });
    snap = runUntil(s2, function (sn) { return lc(sn); }, 300);
  }
  ck('trip during the evolution reaches the failure card', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the chemistry-trip card', lc(snap).title, /Tripped/i.test(lc(snap).title), 'Tripped on Chemistry card');
});

test('pwr_load_follow — evening ramp and morning pickup', function (ck) {
  var s = startScenario('pwr_load_follow');
  // ramp_down carries the branch watch: settle past its delay-14 fire, then
  // dispatch inside the watch.
  var snap = waitBeat(s, 'ramp_down', 120);
  ck('ramp beat arms', !!snap, !!snap, 'ramp_down pending');
  if (!snap) return;
  settle(s, 16);
  s.handleCommand({ action: 'set_load_mode', mode: 'manual' });
  s.handleCommand({ action: 'set_load_target', mwe: 800 });
  snap = waitBeat(s, 'ramp_up', 1800);
  ck('night hold reached (dawn beat armed)', !!snap, !!snap, 'ramp_up pending');
  if (!snap) return;
  settle(s, 305);                       // ramp_up fires at delay 300, watch opens
  s.handleCommand({ action: 'set_load_target', mwe: 1000 });
  snap = waitBeat(s, 'restore_follow', 1200);
  ck('back at full output → restore prompt', !!snap, !!snap, 'restore_follow pending');
  if (!snap) return;
  settle(s, 4);                         // restore_follow fires (delay 2)
  s.handleCommand({ action: 'set_load_mode', mode: 'follow' });
  snap = runUntil(s, function (sn) { return lc(sn); }, 400);
  ck('load-follow mission completes', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the shift card', lc(snap).title, /Shift Complete/i.test(lc(snap).title), 'Shift Complete card');
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
  // Isolating DURING the briefing can neither cheese nor softlock the exam:
  // the fault beat restores the normal lineup at injection (playtest fix —
  // previously this left the exam unfinishable).
  var s2 = startScenario('pwr_qualify');
  settle(s2, 10);
  s2.handleCommand({ action: 'close_block_valve' });
  var snap2 = runUntil(s2, function (sn) { return lc(sn); }, 2 * 3600);
  ck('pre-briefing isolation still ends the exam', !!snap2, !!snap2, 'level_complete');
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

test('pwr_sg_flood — bonus mission completes (imbalance trigger repaired)', function (ck) {
  // Playtest follow-up: the original trigger was malformed (instrument_id/
  // high/setpoint) and the mission softlocked at 'imbalance' forever.
  var s = startScenario('pwr_sg_flood');
  var snap = waitBeat(s, 'imbalance', 60);
  ck('rod-insert prompt fires', !!snap, !!snap, 'imbalance pending');
  if (!snap) return;
  s.handleCommand({ action: 'rod_start', group_id: 'control_rods', direction: -1, speed: 'normal' });
  settle(s, 30);
  s.handleCommand({ action: 'rod_stop', group_id: 'control_rods' });
  snap = runUntil(s, function (sn) { return lc(sn); }, 600);
  ck('SG flood recognized → mission completes', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the load-mode card', lc(snap).title, /Load Mode/i.test(lc(snap).title), 'Load Mode card');
});

// ------------------------------------------------------------ RBMK campaign
test('rbmk_tour — orientation chain completes', function (ck) {
  var s = startScenario('rbmk_tour');
  var snap = runUntil(s, function (sn) { return lc(sn); }, 300);
  ck('tour completes on its own', !!snap, !!snap, 'level_complete');
});

test('rbmk_void — flow cut raises power, restore completes', function (ck) {
  var s = startScenario('rbmk_void');
  var snap = waitBeat(s, 'restore_task', 120);
  ck('flow-cut prompt fires', !!snap, !!snap, 'restore_task pending');
  if (!snap) return;
  s.handleCommand({ action: 'set_channel_flow', pct: 60 });
  snap = waitBeat(s, 'complete', 600);
  ck('power rise observed → restore prompt', !!snap, !!snap, 'complete pending');
  if (!snap) return;
  s.handleCommand({ action: 'set_channel_flow', pct: 80 });
  snap = runUntil(s, function (sn) { return lc(sn); }, 600);
  ck('restoration completes the mission', !!snap, !!snap, 'level_complete');
});

test('rbmk_chernobyl — the excursion is witnessed to its end', function (ck) {
  var s = startScenario('rbmk_chernobyl');
  var snap = runUntil(s, function (sn) { return sn.true_state.melted; }, 300);
  ck('the excursion destroys the core', !!snap, !!snap, 'melted');
  if (!snap) return;
  snap = runUntil(s, function (sn) { return lc(sn); }, 120);
  ck('aftermath completes the witnessing', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the witnessing card', lc(snap).title, /Witnessed/i.test(lc(snap).title), 'Witnessed card');
});

test('rbmk_az5_fixed — prompt AZ-5 saves the rebuilt core', function (ck) {
  var s = startScenario('rbmk_az5_fixed');
  var snap = waitBeat(s, 'act', 30);
  ck('the decision beat arms', !!snap, !!snap, 'act pending');
  if (!snap) return;
  settle(s, 1.5);
  s.handleCommand({ action: 'scram' });
  snap = runUntil(s, function (sn) { return lc(sn); }, 300);
  ck('clean shutdown reaches an endpoint', !!snap, !!snap, 'level_complete');
  if (snap) ck('outcome is the fix holding', lc(snap).title, /Held/i.test(lc(snap).title), 'Fix Held card');
});

test('rbmk_az5_fixed — hesitation loses the core (failure endpoint)', function (ck) {
  var s = startScenario('rbmk_az5_fixed');
  var snap = runUntil(s, function (sn) { return lc(sn); }, 300);
  ck('inaction reaches an endpoint', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the failure card', lc(snap).title, /Slow/i.test(lc(snap).title), 'Too Slow card');
});

// ------------------------------------------------------------ BWR campaign
test('bwr_tour — orientation chain completes', function (ck) {
  var s = startScenario('bwr_tour');
  var snap = runUntil(s, function (sn) { return lc(sn); }, 300);
  ck('tour completes on its own', !!snap, !!snap, 'level_complete');
});

test('bwr_recirc — throttle up to ~70%, back to 50%', function (ck) {
  var s = startScenario('bwr_recirc');
  var snap = waitBeat(s, 'down_task', 120);
  ck('throttle-up prompt fires', !!snap, !!snap, 'down_task pending');
  if (!snap) return;
  s.handleCommand({ action: 'set_recirc_flow', pct: 25 });
  snap = waitBeat(s, 'complete', 600);
  ck('power rise observed → throttle-down prompt', !!snap, !!snap, 'complete pending');
  if (!snap) return;
  s.handleCommand({ action: 'set_recirc_flow', pct: 19 });
  snap = runUntil(s, function (sn) { return lc(sn); }, 600);
  ck('return to 50% completes the mission', !!snap, !!snap, 'level_complete');
});

test('bwr_isolation — MSIV slam, shrink, recovery witnessed', function (ck) {
  var s = startScenario('bwr_isolation');
  var snap = runUntil(s, function (sn) { return sn.rps_state.scrammed; }, 120);
  ck('isolation trips the reactor', !!snap, !!snap, 'scrammed');
  if (!snap) return;
  snap = runUntil(s, function (sn) { return lc(sn); }, 900);
  ck('shrink + recovery chain completes', !!snap, !!snap, 'level_complete');
});

test('bwr_fukushima — IC branch buys hours, ends at uncovery', function (ck) {
  var s = startScenario('bwr_fukushima');
  var snap = waitBeat(s, 'batteries_die', 600);
  ck('the hold phase reaches the battery failure', !!snap, !!snap, 'batteries_die pending');
  if (!snap) return;
  settle(s, 2450);                      // let the beat fire (delay 2400) + a beat of thought
  s.handleCommand({ action: 'set_ic', active: true });
  snap = runUntil(s, function (sn) { return lc(sn); }, 12 * 3600);
  ck('IC path reaches the uncovery endpoint', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the IC card', lc(snap).title, /Hours/i.test(lc(snap).title), 'Hours You Bought card');
});

test('bwr_fukushima — bare branch (no IC) also completes', function (ck) {
  var s = startScenario('bwr_fukushima');
  var snap = runUntil(s, function (sn) { return lc(sn); }, 12 * 3600);
  ck('bare path reaches the uncovery endpoint', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the long-night card', lc(snap).title, /Long Night/i.test(lc(snap).title), 'Long Night card');
});

test('bwr_qualify — careful ascension passes', function (ck) {
  var s = startScenario('bwr_qualify');
  var snap = waitBeat(s, 'exam', 60);
  ck('exam window opens', !!snap, !!snap, 'exam pending');
  if (!snap) return;
  settle(s, 10);
  s.handleCommand({ action: 'set_recirc_flow', pct: 28 });
  snap = runUntil(s, function (sn) { return lc(sn); }, 1200);
  ck('band hold reaches an endpoint', !!snap, !!snap, 'level_complete');
  if (snap) ck('outcome is qualification', lc(snap).title, /Qualified/i.test(lc(snap).title), 'Qualified card');
});

test('bwr_qualify — greedy ask overshoots and fails', function (ck) {
  var s = startScenario('bwr_qualify');
  var snap = waitBeat(s, 'exam', 60);
  ck('exam window opens', !!snap, !!snap, 'exam pending');
  if (!snap) return;
  settle(s, 10);
  s.handleCommand({ action: 'set_recirc_flow', pct: 40 });
  snap = runUntil(s, function (sn) { return lc(sn); }, 1200);
  ck('overshoot reaches an endpoint', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the overpower card', lc(snap).title, /Overpower/i.test(lc(snap).title), 'Overpower card');
});

report();
