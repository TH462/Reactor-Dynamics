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
  'engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js',
  'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js',
  'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
  'engines/rbmk/rbmk_config.js', 'layers/control/rbmk_control.js', 'engines/rbmk/rbmk_kinetics.js',
  'engines/rbmk/rbmk_thermal.js', 'engines/rbmk/rbmk_rods.js', 'engines/rbmk/rbmk_instruments.js', 'engines/rbmk/rbmk_engine.js',
  'engines/bwr/bwr_config.js', 'layers/control/bwr_control.js', 'engines/bwr/bwr_vessel.js',
  'engines/bwr/bwr_recirculation.js', 'engines/bwr/bwr_safety_systems.js', 'engines/bwr/bwr_instruments.js', 'engines/bwr/bwr_engine.js',
  'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js',
  'scenarios/pwr_hook.js', 'scenarios/pwr_tmi.js', 'scenarios/pwr_sg_flood.js',
  'scenarios/pwr_tmi2_common.js', 'scenarios/pwr_tmi2_p1.js', 'scenarios/pwr_tmi2_p2.js', 'scenarios/pwr_tmi2_p3.js',
  'scenarios/pwr_tour.js', 'scenarios/pwr_chain_reaction.js', 'scenarios/pwr_feedback.js',
  'scenarios/pwr_xenon.js', 'scenarios/pwr_boron.js', 'scenarios/pwr_load_follow.js',
  'scenarios/pwr_feed_pump.js', 'scenarios/pwr_rod_auto.js',
  'scenarios/pwr_startup_challenge.js', 'scenarios/pwr_shift_exam.js',
  'scenarios/pwr_automation.js',
  'scenarios/pwr_protection.js', 'scenarios/pwr_esf.js', 'scenarios/pwr_msiv.js',
  'scenarios/pwr_slb.js', 'scenarios/pwr_lof.js', 'scenarios/pwr_qualify.js',
  'scenarios/pwr_mode5_to_mode3.js', 'scenarios/pwr_mode3_to_mode5.js', 'scenarios/pwr_return_to_mode1.js',
  'scenarios/rbmk_tour.js', 'scenarios/rbmk_void.js', 'scenarios/rbmk_ar.js',
  'scenarios/rbmk_chernobyl.js', 'scenarios/rbmk_az5_fixed.js',
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
// Missions with an auto_channels preset: M5's start_scenario now applies the
// authored preset itself (the channel runtime runs in-stack in the control
// layer), so this is just startScenario. Missions like pwr_automation NEED
// their preset — the bare plant trips on the demand swing the automation is
// there to carry (probed).
function startScenarioAuto(id) {
  return startScenario(id);
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
var EXPECTED_MISSIONS = { pwr: 34, rbmk: 9, bwr: 8 };

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
      // Chat-mode dialogue (TMI-2 M5): every line needs a speaker + both registers.
      (b.dialogue || []).forEach(function (dl, di) {
        var ok = !!(dl && dl.speaker && dl.learning && dl.industry);
        ck(id + '.' + b.id + ' dialogue[' + di + '] speaker+registers', ok, ok, 'speaker, learning, industry');
      });
      if (b.chat_button) {
        var cb = b.chat_button;
        ck(id + '.' + b.id + ' chat_button style legal', cb.style, cb.style === 'ack' || cb.style === 'skip', 'ack|skip');
      }
      if (b.level_complete) hasLc = true;
    });
    // Interaction tables (chat-mode props): request + responses in both registers.
    Object.keys(sc.interactions || {}).forEach(function (iid) {
      var it = sc.interactions[iid];
      var reqOk = !!(it.request && it.request.learning && it.request.industry);
      ck(id + ' interaction ' + iid + ' request registers', reqOk, reqOk, 'learning+industry');
      (it.responses || []).concat(it.repeat || []).forEach(function (r, ri) {
        var rOk = !!(r && r.speaker && r.learning && r.industry);
        ck(id + ' interaction ' + iid + ' line[' + ri + '] registers', rOk, rOk, 'speaker, learning, industry');
      });
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
// RBMK/BWR highlights resolve through findPdControl against the plant-display
// view-bar labels (mirrors app.js legacy PD controls + the scram button).
var PD_LABELS = {
  rbmk: ['Control Bank', 'Rod Speed', 'AR Rods (Auto Regulator)', 'Shutdown Bank', 'MCP / Channel Flow',
    'Emergency Core Cooling (ECCS)', 'EPS', 'Feedwater', 'Turbine Load', 'Steam Dump', 'AZ-5'],
  bwr: ['Control Bank', 'Rod Speed', 'Shutdown Bank', 'Recirc Drive', 'RCIC',
    'Isolation Condenser (IC)', 'HPCI', 'ADS', 'LPCI', 'Core Spray (LPCS)', 'Manual SRV',
    'Standby Liquid Control (SLC)', 'Steam Dump', 'Turbine Load', 'Feedwater', 'SCRAM'],
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
        if (b.highlight.control_label) {
          var pool = cid === 'pwr' ? RD.PwrSynoptic.highlightLabels : (PD_LABELS[cid] || []);
          var known = pool.indexOf(b.highlight.control_label) !== -1;
          ck(m.id + '.' + b.id + ' control highlight resolves (' + b.highlight.control_label + ')',
            b.highlight.control_label, known, cid === 'pwr' ? 'a SYN_CONTROL_MAP label' : 'a PD view-bar label');
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

// Authored automation presets must name real channels: every auto_channels id
// on a campaign scenario resolves in that plant's control-layer channel list.
function plantChannelIds(plant) {
  var cfg = plant === 'pwr' ? RD.PWR_CONTROL.protection
    : plant === 'bwr' ? RD.BWR_CONTROL.protection
    : RD.RBMK_CONTROL.forVersion('post_chernobyl');
  return (cfg.channels || []).map(function (d) { return d.id; });
}
test('campaign scenarios — auto_channels resolve to automation channels', function (ck) {
  Object.keys(RD.CAMPAIGNS).forEach(function (cid) {
    var chanIds = plantChannelIds(cid);
    RD.CAMPAIGNS[cid].acts.forEach(function (a) {
      a.missions.forEach(function (m) {
        if (m.kind !== 'scenario') return;
        var sc = RD.SCENARIOS[m.id];
        if (!sc || !sc.auto_channels) return;
        sc.auto_channels.forEach(function (id) {
          ck(m.id + ' auto_channels: ' + id, id, chanIds.indexOf(id) !== -1, 'a ' + cid + ' channel (' + chanIds.join('|') + ')');
        });
      });
    });
  });
});

// Static "references resolve" pass (2026-07-19 review): every name a beat uses
// must resolve against the live vocabularies — a typo'd goto softlocks the
// mission, a typo'd instrument/alarm/command means the beat/gate silently never
// fires (instructor_layer treats unknowns as compare-false). All cheap static
// checks over RD.SCENARIOS; runs on ALL campaign scenarios including bonus.
var DIRECTIONS = ['below', 'above', 'is_true', 'is_false', 'is_open'];
var ADVANCE_VOCAB = [undefined, null, 'auto', 'end', 'wait_for_trigger'];
function plantVocab(plant) {
  var eng, alarms, failures;
  if (plant === 'pwr') {
    eng = [new RD.PWREngine({ initial_state: 'hot_full_power' })];
    alarms = RD.PWR_CONTROL.protection.alarms;
    failures = Object.keys(RD.PWR_CONTROL.protection.failures);
  } else if (plant === 'bwr') {
    eng = [new RD.BWREngine({ initial_state: 'full_power' })];
    alarms = RD.BWR_CONTROL.protection.alarms;
    failures = Object.keys(RD.BWR_CONTROL.protection.failures);
  } else {
    eng = [new RD.RBMKEngine({ design_version: 'pre_chernobyl' }),
           new RD.RBMKEngine({ design_version: 'post_chernobyl' })];
    var pre = RD.RBMK_CONTROL.forVersion('pre_chernobyl'), post = RD.RBMK_CONTROL.forVersion('post_chernobyl');
    alarms = pre.alarms.concat(post.alarms);
    failures = Object.keys(pre.failures);
    Object.keys(post.failures).forEach(function (k) { if (failures.indexOf(k) === -1) failures.push(k); });
  }
  var ins = {}, ts = {};
  eng.forEach(function (e) {
    Object.keys(e.getInstruments()).forEach(function (k) { ins[k] = true; });
    Object.keys(e.getTrueState()).forEach(function (k) { ts[k] = true; });
  });
  return { instruments: ins, true_state: ts,
    alarm_ids: alarms.map(function (a) { return a.id; }), failure_ids: failures };
}
// Command vocabulary: every `case 'x':` in the engine/kernel/service dispatchers.
// Over-permissive (switch cases that aren't commands slip in) but never wrong —
// it exists to catch typos like 'opne_porv', not to be a strict schema.
function commandVocab() {
  var fs = require('fs');
  var files = ['engines/pwr/pwr_engine.js', 'engines/rbmk/rbmk_engine.js', 'engines/bwr/bwr_engine.js',
    'layers/control/control_kernel.js', 'layers/simulation_service.js', 'layers/instructor_layer.js'];
  var vocab = {};
  files.forEach(function (f) {
    var src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    var m; var re = /case '([a-z0-9_]+)':/g;
    while ((m = re.exec(src))) vocab[m[1]] = true;
  });
  vocab.manual_scram = true;   // UI alias routed before the dispatchers
  return vocab;
}
test('campaign scenarios — every reference resolves (goto, instruments, alarms, commands, gates)', function (ck) {
  var CMDS = commandVocab();
  Object.keys(RD.CAMPAIGNS).forEach(function (cid) {
    var vocab = plantVocab(cid);
    var missions = [];
    RD.CAMPAIGNS[cid].acts.forEach(function (a) { a.missions.forEach(function (m) { missions.push(m); }); });
    (RD.CAMPAIGNS[cid].bonus || []).forEach(function (m) { missions.push(m); });
    missions.forEach(function (m) {
      if (m.kind !== 'scenario') return;
      var sc = RD.SCENARIOS[m.id]; if (!sc) return;
      var beatIds = {};
      (sc.beats || []).forEach(function (b) { beatIds[b.id] = true; });
      function checkTrigger(tr, where) {
        if (!tr) return;
        switch (tr.type) {
          case 'time': case 'delay':
            ck(where + ' has numeric value', String(tr.value), typeof tr.value === 'number', 'number'); break;
          case 'inaction':
            ck(where + ' has numeric window', String(tr.window), typeof tr.window === 'number', 'number'); break;
          case 'instrument':
            ck(where + ' instrument resolves (' + tr.instrument + ')', tr.instrument,
              vocab.instruments[tr.instrument] === true, 'a ' + cid + ' instrument');
            ck(where + ' direction legal (' + tr.direction + ')', tr.direction,
              DIRECTIONS.indexOf(tr.direction) !== -1, DIRECTIONS.join('|'));
            break;
          case 'true_state':
            ck(where + ' field resolves (' + tr.field + ')', tr.field,
              vocab.true_state[tr.field] === true, 'a ' + cid + ' true_state field');
            ck(where + ' direction legal (' + tr.direction + ')', tr.direction,
              DIRECTIONS.indexOf(tr.direction) !== -1, DIRECTIONS.join('|'));
            break;
          case 'alarm':
            ck(where + ' alarm resolves (' + tr.alarm_id + ')', tr.alarm_id,
              vocab.alarm_ids.indexOf(tr.alarm_id) !== -1, 'a ' + cid + ' alarm id');
            break;
          case 'operator_action':
            ck(where + ' command resolves (' + tr.command + ')', tr.command,
              CMDS[tr.command] === true, 'a known command');
            break;
          case 'all': case 'any':
            ck(where + ' has sub-triggers', (tr.triggers || []).length, (tr.triggers || []).length > 0, '≥ 1');
            (tr.triggers || []).forEach(function (c2, i2) { checkTrigger(c2, where + '.sub[' + i2 + ']'); });
            break;
          // scram / manual need no fields
        }
      }
      (sc.beats || []).forEach(function (b) {
        var at = m.id + '.' + b.id;
        checkTrigger(b.trigger, at + ' trigger');
        (b.branches || []).forEach(function (br, i) {
          checkTrigger(br.trigger, at + ' branch[' + i + ']');
          ck(at + ' branch[' + i + '] goto resolves (' + br.goto + ')', br.goto,
            beatIds[br.goto] === true, 'an existing beat id');
        });
        ck(at + ' advance vocabulary (' + b.advance + ')', String(b.advance),
          ADVANCE_VOCAB.indexOf(b.advance) !== -1, 'auto|end|wait_for_trigger|unset');
        if (b.gate) {
          if (b.gate.message != null) {
            var gm = b.gate.message;
            var gmOk = typeof gm === 'object' && !!gm.learning && !!gm.industry;
            ck(at + ' gate.message has both registers (strings render as NOTHING)', gmOk ? 'ok' : typeof gm,
              gmOk, '{learning, industry}');
          }
          (b.gate.block_actions || []).concat(b.gate.allow_actions || []).forEach(function (a2) {
            ck(at + ' gate action resolves (' + a2 + ')', a2, CMDS[a2] === true, 'a known command');
          });
          if (b.gate.until) checkTrigger(b.gate.until, at + ' gate.until');
        }
        (b.inject_failures || []).forEach(function (f2, fi) {
          var fid = typeof f2 === 'string' ? f2 : (f2 && f2.failure_id);
          ck(at + ' inject_failures[' + fi + '] resolves (' + fid + ')', fid,
            vocab.failure_ids.indexOf(fid) !== -1, 'a ' + cid + ' failure id');
        });
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
  // Compensated governor: follow mode holds power where it IS (no overdelivery
  // pulling it home) — the restore is an explicit ask back to 1000. (Switching
  // to follow right away would snap the target to current power; the mission
  // has the player set FOLLOW only after output recovers.)
  s.handleCommand({ action: 'set_load_target', mwe: 1000 });
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

test('pwr_load_follow — evening ramp and morning pickup (three-element feed)', function (ck) {
  var s = startScenario('pwr_load_follow');
  // ramp_down carries the branch watch: settle past its delay-26 fire, then
  // dispatch inside the watch.
  var snap = waitBeat(s, 'ramp_down', 120);
  ck('ramp beat arms', !!snap, !!snap, 'ramp_down pending');
  if (!snap) return;
  settle(s, 28);
  s.handleCommand({ action: 'set_load_mode', mode: 'manual' });
  s.handleCommand({ action: 'set_load_target', mwe: 800 });
  snap = waitBeat(s, 'ramp_up', 1800);
  ck('night hold reached (dawn beat armed)', !!snap, !!snap, 'ramp_up pending');
  if (!snap) return;
  ck('three-element feed held SG level through the cut', snap.instruments.sg_level.toFixed(1),
    Math.abs(snap.instruments.sg_level - 65) < 8, '65 ±8 %');
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
  // Probed: with feed_sg engaged the unit rides even a 1000→0 load step, so
  // the grid_lost branch is the scram catch — reach it with a manual trip.
  var s2 = startScenario('pwr_load_follow');
  snap = waitBeat(s2, 'ramp_down', 120);
  if (snap) {
    settle(s2, 28);
    s2.handleCommand({ action: 'scram' });
    snap = runUntil(s2, function (sn) { return lc(sn); }, 300);
  }
  ck('a trip during the watch reaches the failure card', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the tripped-on-shift card', lc(snap).title, /Tripped/i.test(lc(snap).title), 'Tripped on Shift card');
});

test('pwr_feed_pump — manual level hold, then the three-element channel', function (ck) {
  var s = startScenario('pwr_feed_pump');
  // take_manual carries the branch watch: settle past its delay-30 fire, then
  // take the pump by hand inside the watch.
  var snap = waitBeat(s, 'take_manual', 60);
  ck('take-manual beat arms', !!snap, !!snap, 'take_manual pending');
  if (!snap) return;
  settle(s, 32);
  s.handleCommand({ action: 'set_feed_pump_speed', pct: 100 });
  // load_drop fires (delay 3, load -> 950); level creeps ~0.25%/s (probed) to
  // the 67% crossing, which opens the trim prompt.
  snap = waitBeat(s, 'trim_now', 180);
  ck('level creep observed -> trim prompt', !!snap, !!snap, 'trim_now pending');
  if (!snap) return;
  settle(s, 12);                        // trim_now fires (delay 1) + reading
  s.handleCommand({ action: 'set_feed_pump_speed', pct: 91 });   // just under steam flow
  snap = waitBeat(s, 'engage_auto', 300);
  ck('band recaptured -> engage prompt', !!snap, !!snap, 'engage_auto pending');
  if (!snap) return;
  settle(s, 5);                         // engage_auto fires (delay 3); watch opens
  s.handleCommand({ action: 'set_auto_channel', channel_id: 'feed_sg', engaged: true });
  snap = runUntil(s, function (sn) { return lc(sn); }, 900);
  ck('AUTO carries the restore -> complete', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the level-held card', lc(snap).title, /Level Held/i.test(lc(snap).title), 'Level Held card');
  if (snap) ck('SG level ends in band', snap.instruments.sg_level.toFixed(1), snap.instruments.sg_level > 55 && snap.instruments.sg_level < 75, '55-75%');
  // No trim -> the 75% HI alarm lands on the overfed card (probed ~52 s).
  var s2 = startScenario('pwr_feed_pump');
  snap = waitBeat(s2, 'take_manual', 60);
  if (snap) {
    settle(s2, 32);
    s2.handleCommand({ action: 'set_feed_pump_speed', pct: 100 });
    snap = runUntil(s2, function (sn) { return lc(sn); }, 600);
  }
  ck('inaction reaches an endpoint (no softlock)', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the overfed card', lc(snap).title, /Overfed/i.test(lc(snap).title), 'Overfed card');
  // A scram lands on the tripped card, not a softlock.
  var s3 = startScenario('pwr_feed_pump');
  snap = waitBeat(s3, 'take_manual', 60);
  if (snap) {
    settle(s3, 32);
    s3.handleCommand({ action: 'scram' });
    snap = runUntil(s3, function (sn) { return lc(sn); }, 300);
  }
  ck('scram reaches an endpoint (no softlock)', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the tripped card', lc(snap).title, /Tripped/i.test(lc(snap).title), 'Tripped card');
});

test('pwr_rod_auto — manual Tavg trim, T-ref capture, override precedence', function (ck) {
  var s = startScenario('pwr_rod_auto');
  // off_program (delay 28) drops load to 900; trim_task fires as Tavg crosses
  // 307 (~40 s later, probed) and carries the branch watch.
  var snap = runUntil(s, function () { return s.instructor.firedBeats.has('trim_task'); }, 400);
  ck('trim prompt fires on the excursion', !!snap, !!snap, 'trim_task fired');
  if (!snap) return;
  settle(s, 12);
  // Paced trim (the UI press pattern): 3 single-step insertions, ~30 s settling
  // between rounds — a burst overshoots (probed: 28 steps -> Tavg 298).
  for (var round = 0; round < 12; round++) {
    snap = s.advanceCycles(1);
    if (snap.instruments.tavg <= 305.5) break;
    for (var p2 = 0; p2 < 3; p2++) { s.handleCommand({ action: 'rod_nudge', group_id: 'control_rods', steps: -1, speed: 'normal' }); settle(s, 1.5); }
    settle(s, 30);
  }
  snap = waitBeat(s, 'engage_auto', 300);
  ck('trim accepted -> engage prompt', !!snap, !!snap, 'engage_auto pending');
  if (!snap) return;
  settle(s, 5);                         // engage_auto fires (delay 3); watch opens
  s.handleCommand({ action: 'set_auto_channel', channel_id: 'rods_tavg', engaged: true });
  snap = runUntil(s, function () { return s.instructor.firedBeats.has('override'); }, 600);
  ck('AUTO rides the restore -> override lesson', !!snap, !!snap, 'override fired');
  if (!snap) return;
  settle(s, 4);                         // override fires (delay 2); watch opens
  s.handleCommand({ action: 'rod_nudge', group_id: 'control_rods', steps: 1, speed: 'normal' });
  var sn2 = s.advanceCycles(1);
  var rc = null, chans = (sn2.automation && sn2.automation.channels) || [];
  for (var ci = 0; ci < chans.length; ci++) if (chans[ci].id === 'rods_tavg') rc = chans[ci];
  ck('manual nudge kicks the channel to MAN', rc && rc.engaged, !!rc && rc.engaged === false, 'engaged false');
  settle(s, 3);
  s.handleCommand({ action: 'set_auto_channel', channel_id: 'rods_tavg', engaged: true });
  snap = runUntil(s, function (sn) { return lc(sn); }, 300);
  ck('re-engage completes the mission', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the handed-over card', lc(snap).title, /Handed Over/i.test(lc(snap).title), 'Handed Over card');
  // A scram mid-trim lands on the tripped card, not a softlock.
  var s2 = startScenario('pwr_rod_auto');
  snap = runUntil(s2, function () { return s2.instructor.firedBeats.has('trim_task'); }, 400);
  if (snap) {
    settle(s2, 5);
    s2.handleCommand({ action: 'scram' });
    snap = runUntil(s2, function (sn) { return lc(sn); }, 300);
  }
  ck('scram reaches an endpoint (no softlock)', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the tripped card', lc(snap).title, /Tripped/i.test(lc(snap).title), 'Tripped card');
});

test('pwr_startup_challenge — solo startup passes; forgotten handoff fails on the SR gate', function (ck) {
  // Win line (probed): secure SR (P-6 already satisfied at HZP), pull to 1 %,
  // reinsert to null SUR — power then holds ~[1.0, 3.5] % through the 120 s
  // graded window. Commands land during the exam watch (no operator_action
  // triggers in this scenario, so beat-fire memory clearing is moot).
  var s = startScenario('pwr_startup_challenge');
  var snap = waitBeat(s, 'exam', 60);
  ck('exam watch arms', !!snap, !!snap, 'exam pending');
  if (!snap) return;
  settle(s, 2);
  s.handleCommand({ action: 'set_sr_detector', on: false });
  s.handleCommand({ action: 'rod_start', group_id: 'control_rods', direction: 1, speed: 'normal' });
  snap = runUntil(s, function (sn) { return sn.instruments.power_range > 1.0 || sn.rps_state.scrammed; }, 1200);
  s.handleCommand({ action: 'rod_stop', group_id: 'control_rods' });
  ck('criticality reached unscrammed', snap && !snap.rps_state.scrammed, snap && !snap.rps_state.scrammed, 'power > 1 %, no scram');
  if (!snap || snap.rps_state.scrammed) return;
  runUntil(s, function (sn) { return sn.instruments.power_range > 1.5; }, 300);
  s.handleCommand({ action: 'rod_start', group_id: 'control_rods', direction: -1, speed: 'normal' });
  runUntil(s, function (sn) { return sn.instruments.startup_rate <= 0.0; }, 300);
  s.handleCommand({ action: 'rod_stop', group_id: 'control_rods' });
  snap = runUntil(s, function (sn) { return lc(sn); }, 900);
  ck('band hold reaches an endpoint', !!snap, !!snap, 'level_complete');
  if (snap) ck('outcome is the clean startup', lc(snap).title, /Clean Startup/i.test(lc(snap).title), 'Clean Startup card');
  // Handoff forgotten: pull with the SR energized — its 1e5 cps gate ends the
  // climb at ~0.02 % power (probed t≈120 s) and the diagnose beat names it.
  var s2 = startScenario('pwr_startup_challenge');
  settle(s2, 5);
  s2.handleCommand({ action: 'rod_start', group_id: 'control_rods', direction: 1, speed: 'normal' });
  snap = runUntil(s2, function (sn) { return lc(sn); }, 900);
  s2.handleCommand({ action: 'rod_stop', group_id: 'control_rods' });
  ck('SR-energized climb reaches an endpoint (no softlock)', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the source-range card', lc(snap).title, /Source Range/i.test(lc(snap).title), 'Source Range Trip card');
});

test('pwr_startup_challenge — runaway coast lands on the overshoot card, not a softlock', function (ck) {
  // Stop-at-1 %-and-watch leaves the full pull's reactivity in: power coasts
  // 1 % → ~19 % in ~42 s. power_range crosses the 12 % branch a probed ~7 s
  // before the IR trip (1.67e-3 A ≈ 20 %), so the band-overshoot card wins
  // the race deterministically and carries the excess-reactivity lesson.
  var s = startScenario('pwr_startup_challenge');
  settle(s, 5);
  s.handleCommand({ action: 'set_sr_detector', on: false });
  s.handleCommand({ action: 'rod_start', group_id: 'control_rods', direction: 1, speed: 'normal' });
  var snap = runUntil(s, function (sn) { return sn.instruments.power_range > 1.0; }, 1200);
  s.handleCommand({ action: 'rod_stop', group_id: 'control_rods' });
  ck('criticality reached', !!snap, !!snap, 'power > 1 %');
  snap = runUntil(s, function (sn) { return lc(sn); }, 900);
  ck('coast reaches an endpoint', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the overshoot card', lc(snap).title, /Overshot/i.test(lc(snap).title), 'Band Overshot card');
});

test('pwr_shift_exam — evening curve passes pure-manual AND on player-engaged channels', function (ck) {
  // Manual route (fallback coupling, re-probed 2026-07-20 under the sliding-
  // Tavg program): the 850 ask walks down monotonically, crosses the 905
  // marker at ~186 s and dwells 894–899 under the 910 hold line (the old
  // undershoot-through-870 is gone); the return crosses 985 and settles ~996.
  var s = startScenario('pwr_shift_exam');
  var snap = waitBeat(s, 'watch_down', 60);
  ck('reduction watch arms', !!snap, !!snap, 'watch_down pending');
  if (!snap) return;
  settle(s, 46);                        // watch_down fires (delay 45)
  s.handleCommand({ action: 'set_load_mode', mode: 'manual' });
  s.handleCommand({ action: 'set_load_target', mwe: 850 });
  snap = waitBeat(s, 'pickup_call', 1200);
  ck('reduction + hold credited → pickup call', !!snap, !!snap, 'pickup_call pending');
  if (!snap) return;
  settle(s, 4);                         // pickup_call fires (delay 1)
  s.handleCommand({ action: 'set_load_target', mwe: 1000 });
  // Feed vigilance (the exam's own teaching — "the feed never out of your
  // scan"): under the Tavg program the down-leg shrink parks SG level ~31 %
  // and the fallback flow-matching feed holds it there, so the slider-only
  // route must restore level by hand before the grade reads SG 40–80 %.
  for (var fv = 0; fv < 60; fv++) {
    var tv = s.engine.getTrueState();
    if (tv.sg_level_pct > 55) break;
    s.handleCommand({ action: 'set_feed_pump_speed', pct: clampC(100 + 2 * (65 - tv.sg_level_pct), 0, 120) });
    settle(s, 10);
  }
  s.handleCommand({ action: 'set_feed_coupled', active: true });
  snap = runUntil(s, function (sn) { return lc(sn); }, 1200);
  ck('manual route reaches an endpoint', !!snap, !!snap, 'level_complete');
  if (snap) ck('manual route earns full marks', lc(snap).title, /Full Marks/i.test(lc(snap).title), 'Full Marks card');
  // Channels route: the board starts CLEAN — engaging rods_tavg + feed_sg is
  // the player's own tool choice (under the program the rods track Tref, so
  // the ask is followed closely; crosses the down-marker with margin).
  var s2 = startScenario('pwr_shift_exam');
  settle(s2, 10);
  s2.handleCommand({ action: 'set_auto_channel', channel_id: 'rods_tavg', engaged: true });
  s2.handleCommand({ action: 'set_auto_channel', channel_id: 'feed_sg', engaged: true });
  settle(s2, 40);                       // past the watch_down fire
  s2.handleCommand({ action: 'set_load_mode', mode: 'manual' });
  s2.handleCommand({ action: 'set_load_target', mwe: 850 });
  snap = waitBeat(s2, 'pickup_call', 1200);
  ck('channels route credits the hold', !!snap, !!snap, 'pickup_call pending');
  if (snap) {
    settle(s2, 4);
    s2.handleCommand({ action: 'set_load_target', mwe: 1000 });
    snap = runUntil(s2, function (sn) { return lc(sn); }, 1200);
  }
  ck('channels route reaches an endpoint', !!snap, !!snap, 'level_complete');
  if (snap) ck('channels route earns full marks', lc(snap).title, /Full Marks/i.test(lc(snap).title), 'Full Marks card');
});

test('pwr_shift_exam — deep ask trips the unit (SG drains on the fallback feed)', function (ck) {
  // Probed: a clean-board 1000→500 ask scrams at t≈180 s on SG LOW LEVEL
  // (11.8 %) — the fallback coupling lets the SG drain on a deep step, so
  // "forgot the feed" is the literal trip cause the failure card teaches.
  var s = startScenario('pwr_shift_exam');
  settle(s, 48);                        // watch_down fired; scram branch live
  s.handleCommand({ action: 'set_load_mode', mode: 'manual' });
  s.handleCommand({ action: 'set_load_target', mwe: 500 });
  var snap = runUntil(s, function (sn) { return lc(sn); }, 900);
  ck('deep ask reaches an endpoint (no softlock)', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the unit-trip card', lc(snap).title, /Unit Trip/i.test(lc(snap).title), 'Unit Trip card');
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

test('pwr_esf — ESF arms: auto-fire, MAN drop, re-arm; starved branch', function (ck) {
  // Main path: hands off through the AFW auto-start and low-SG trip, then the
  // takeover drill at the post-trip hold. (Probed: AFW arm fires ~12 s after
  // injection at 19 %, RPS trips at 12 % ~1.7 s later; hold ~24 % by ~195 s.)
  var s = startScenario('pwr_esf');
  var snap = runUntil(s, function () { return s.instructor.firedBeats.has('at_the_hold'); }, 600);
  ck('AFW fired, trip witnessed, hold prompt opens', !!snap, !!snap, 'at_the_hold fired');
  if (!snap) return;
  ck('arrived scrammed (defense in depth beat ran)', snap.rps_state.scrammed, snap.rps_state.scrammed === true, 'scrammed');
  settle(s, 2);                         // act inside the branch watch
  s.handleCommand({ action: 'set_afw_flow', pct: 60 });
  snap = runUntil(s, function () { return s.instructor.firedBeats.has('went_manual'); }, 60);
  ck('throttle touch → MAN narration beat', !!snap, !!snap, 'went_manual fired');
  if (!snap) return;
  var arm = s.advanceCycles(1).automation.esf.afw;
  ck('ESF arm dropped to MANUAL on the command', arm, arm === 'manual', 'manual');
  settle(s, 2);
  s.handleCommand({ action: 'set_esf_auto', system: 'afw', auto: true });
  snap = runUntil(s, function (sn) { return lc(sn); }, 300);
  ck('re-arm → stable hold → complete', !!snap, !!snap, 'level_complete');
  if (snap) {
    ck('endpoint is the handed-back card', lc(snap).title, /Handed Back/i.test(lc(snap).title), 'Handed Back card');
    ck('honest ending: level at the AFW hold', snap.instruments.sg_level.toFixed(1), snap.instruments.sg_level > 15, '> 15 %');
  }
  // Starved branch: a zeroed throttle on MANUAL drains the hold (<10 % in ~53 s,
  // probed) — and re-arming does NOT reopen the operator's throttle, so this
  // lands on the teaching card either way (softlock guard).
  var s2 = startScenario('pwr_esf');
  snap = runUntil(s2, function () { return s2.instructor.firedBeats.has('at_the_hold'); }, 600);
  if (snap) {
    settle(s2, 2);
    s2.handleCommand({ action: 'set_afw_flow', pct: 0 });
    snap = runUntil(s2, function (sn) { return lc(sn); }, 400);
  }
  ck('zeroed throttle reaches the starved endpoint', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the starved card', lc(snap).title, /Starved/i.test(lc(snap).title), 'Starved on Manual card');
});

test('pwr_msiv — MSIV closure: reopen and bottled endpoints, cold-feet catch', function (ck) {
  // Reopen branch: close at power, take the decision inside its ~21 s window
  // (probed: decision fires 29 s post-closure, auto low-SG trip at ~50 s; the
  // trip is unavoidable — reopening decides the post-trip heat path).
  var s = startScenario('pwr_msiv');
  var snap = runUntil(s, function () { return s.instructor.firedBeats.has('intro'); }, 30);
  ck('closure prompt opens', !!snap, !!snap, 'intro fired');
  if (!snap) return;
  settle(s, 2);
  s.handleCommand({ action: 'close_msiv' });
  snap = runUntil(s, function () { return s.instructor.firedBeats.has('decision'); }, 120);
  ck('slam → safeties → decision chain fires', !!snap, !!snap, 'decision fired');
  if (!snap) return;
  ck('safeties beat rode the sg_safety_open status', s.instructor.firedBeats.has('safeties'), s.instructor.firedBeats.has('safeties'), 'safeties fired');
  settle(s, 3);                         // act inside the decision window (auto trip ~21 s away)
  s.handleCommand({ action: 'open_msiv' });
  snap = runUntil(s, function (sn) { return lc(sn); }, 600);
  ck('reopen path completes', !!snap, !!snap, 'level_complete');
  if (snap) {
    ck('endpoint is the dump-path card', lc(snap).title, /Dump Path/i.test(lc(snap).title), 'Dump Path Restored card');
    ck('trip still came (shrink-driven, probed unavoidable)', snap.rps_state.scrammed, snap.rps_state.scrammed === true, 'scrammed');
    ck('safeties reseated with the dump carrying decay heat', snap.instruments.sg_safety_open, snap.instruments.sg_safety_open === false, 'sg_safety_open false');
  }
  // Bottled branch: ride it down — the automatic low-SG trip (~50 s) exits the
  // decision via its scram branch; the SG stays bottled on cycling safeties.
  var s2 = startScenario('pwr_msiv');
  runUntil(s2, function () { return s2.instructor.firedBeats.has('intro'); }, 30);
  settle(s2, 2);
  s2.handleCommand({ action: 'close_msiv' });
  snap = runUntil(s2, function () { return s2.instructor.firedBeats.has('decision'); }, 120);
  if (snap) snap = runUntil(s2, function (sn) { return lc(sn); }, 600);
  ck('inaction reaches the bottled endpoint', !!snap, !!snap, 'level_complete');
  if (snap) {
    ck('endpoint is the riding-the-safeties card', lc(snap).title, /Riding/i.test(lc(snap).title), 'Riding the Safeties card');
    ck('MSIV still shut at the end (the unfinished business)', snap.instruments.msiv_open, snap.instruments.msiv_open === false, 'msiv_open false');
  }
  // Cold-feet catch: a scram at the closure prompt lands on the retry card,
  // not a softlock.
  var s3 = startScenario('pwr_msiv');
  runUntil(s3, function () { return s3.instructor.firedBeats.has('intro'); }, 30);
  settle(s3, 2);
  s3.handleCommand({ action: 'scram' });
  snap = runUntil(s3, function (sn) { return lc(sn); }, 120);
  ck('scram at the prompt reaches an endpoint (no softlock)', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the cold-feet card', lc(snap).title, /Cold Feet/i.test(lc(snap).title), 'Cold Feet card');
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

test('pwr_slb — steam line break: both branches reach an endpoint', function (ck) {
  // Craft branch: recognize the MTC-driven power rise and trip manually.
  var s = startScenario('pwr_slb');
  var dec = runUntil(s, function () { return s.instructor.firedBeats.has('reactivity_event'); }, 120);
  ck('decision beat fires as power rises past 103% (overcooling → +reactivity)', !!dec, !!dec, 'reactivity_event fired');
  if (dec) {
    s.handleCommand({ action: 'scram' });
    var doneA = runUntil(s, function (sn) { return lc(sn); }, 120);
    ck('manual trip → Controlled endpoint', doneA ? lc(doneA).title : 'never', !!doneA && /Controlled/.test(lc(doneA).title), 'Controlled');
    if (doneA) ck('core stayed safe (never melted)', doneA.true_state.melted, doneA.true_state.melted === false, 'false');
  }

  // Automatics branch: do nothing — the RPS trips on low pzr level.
  var s2 = startScenario('pwr_slb');
  var dec2 = runUntil(s2, function () { return s2.instructor.firedBeats.has('reactivity_event'); }, 120);
  ck('decision beat fires (automatics run)', !!dec2, !!dec2, 'reactivity_event fired');
  if (dec2) {
    var doneB = runUntil(s2, function (sn) { return lc(sn); }, 600);
    ck('inaction → automatics catch it (low pzr level trip)', doneB ? lc(doneB).title : 'never (fired: ' + Array.from(s2.instructor.firedBeats) + ')', !!doneB && /Automatics/.test(lc(doneB).title), 'Caught by the Automatics');
    if (doneB) ck('endpoint arrives scrammed and safe', 'scram=' + doneB.rps_state.scrammed + ' melted=' + doneB.true_state.melted, doneB.rps_state.scrammed === true && doneB.true_state.melted === false, 'scrammed, not melted');
  }
});

test('pwr_lof — loss of flow: both branches reach an endpoint, DNB physics fires', function (ck) {
  // Craft branch: trip immediately on the pump loss — DNB is avoided entirely.
  var s = startScenario('pwr_lof');
  var dec = runUntil(s, function () { return s.instructor.firedBeats.has('pump_trips'); }, 120);
  ck('pump-trip decision beat fires', !!dec, !!dec, 'pump_trips fired');
  if (dec) {
    s.handleCommand({ action: 'scram' });
    var doneA = runUntil(s, function (sn) { return lc(sn); }, 120);
    ck('immediate trip → Tripped in Time endpoint', doneA ? lc(doneA).title : 'never', !!doneA && /Tripped in Time/.test(lc(doneA).title), 'Tripped in Time');
    if (doneA) {
      ck('DNB avoided (took the no-boil branch)', s.instructor.firedBeats.has('tripped_fast') && !s.instructor.firedBeats.has('boiling'), s.instructor.firedBeats.has('tripped_fast') && !s.instructor.firedBeats.has('boiling'), 'tripped_fast, not boiling');
      ck('core exit stayed subcooled (no core void)', doneA.true_state.core_void_fraction.toFixed(3), doneA.true_state.core_void_fraction < 0.01, '< 0.01');
    }
  }

  // Automatics branch: do nothing — the hot channel boils (DNB), then the
  // __true_flow__ low-flow trip scrams the reactor. Track peak core void to
  // prove the new DNB physics actually engaged.
  var s2 = startScenario('pwr_lof');
  var peakVoid = 0;
  s2.subscribe(function (sn) { if (sn.true_state.core_void_fraction > peakVoid) peakVoid = sn.true_state.core_void_fraction; });
  var dec2 = runUntil(s2, function () { return s2.instructor.firedBeats.has('pump_trips'); }, 120);
  ck('decision beat fires (automatics run)', !!dec2, !!dec2, 'pump_trips fired');
  if (dec2) {
    var doneB = runUntil(s2, function (sn) { return lc(sn); }, 300);
    ck('inaction → DNB then low-flow trip endpoint', doneB ? lc(doneB).title : 'never (fired: ' + Array.from(s2.instructor.firedBeats) + ')', !!doneB && /Low-Flow Trip/.test(lc(doneB).title), 'Caught by the Low-Flow Trip');
    ck('the hot channel actually boiled (DNB / core_void engaged)', 'peak core_void=' + peakVoid.toFixed(3), peakVoid > 0.02, '> 0.02');
    if (doneB) ck('endpoint arrives scrammed and undamaged', 'scram=' + doneB.rps_state.scrammed + ' melted=' + doneB.true_state.melted, doneB.rps_state.scrammed === true && doneB.true_state.melted === false, 'scrammed, not melted');
  }
});

test('pwr_sg_flood — bonus: both fixes work, inaction floods', function (ck) {
  // Re-premised (2026-07): feed pump left in MANUAL at 100 % while a rod trim
  // brings power down — nobody minding level. Fix window opens at 75 % and
  // closes at 96 % (probed: 75 % @ ~63 s, 96 % @ ~132 s; no automatic trip
  // ever comes — level parks at 100 %).
  // Fix 1: re-engage the three-element channel inside the fix window.
  var s = startScenario('pwr_sg_flood');
  var snap = waitBeat(s, 'fix', 300);
  ck('level watch fires (SG level > 75 %)', !!snap, !!snap, 'fix pending');
  if (!snap) return;
  settle(s, 15);                        // fix fires at delay 13, watch opens
  s.handleCommand({ action: 'set_auto_channel', channel_id: 'feed_sg', engaged: true });
  snap = runUntil(s, function (sn) { return lc(sn); }, 600);
  ck('channel re-engage → recovery endpoint', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the level-control card', lc(snap).title, /Level Control/i.test(lc(snap).title), 'What You Forgot — Level Control');

  // Fix 2: a manual pump cut is accepted the same way.
  var s2 = startScenario('pwr_sg_flood');
  snap = waitBeat(s2, 'fix', 300);
  if (snap) {
    settle(s2, 15);
    s2.handleCommand({ action: 'set_feed_pump_speed', pct: 20 });
    snap = runUntil(s2, function (sn) { return lc(sn); }, 600);
  }
  ck('manual pump cut → recovery endpoint', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the level-control card', lc(snap).title, /Level Control/i.test(lc(snap).title), 'What You Forgot — Level Control');

  // Inaction: nobody minds the level — flooded card at the 96 % line.
  var s3 = startScenario('pwr_sg_flood');
  snap = runUntil(s3, function (sn) { return lc(sn); }, 600);
  ck('inaction reaches the flooded endpoint', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the flooded card', lc(snap).title, /Flooded/i.test(lc(snap).title), 'SG Flooded card');
});

// ---------------------------------------------------------- Mode 5 ↔ Mode 1 path
// Scripted-operator drives for the three transition missions. The heatup uses
// controlled low-power nuclear heat (proven in the engine round-trip); the
// cooldown uses temperature-tracking setpoints. Both read the TRUE state and
// issue only real commands, at high acceleration to keep the gate fast.
function psatC(T) { return Math.pow(Math.max(T, 1) / 179.47, 1 / 0.239); }
function clampC(x, a, b) { return x < a ? a : (x > b ? b : x); }
function heatupStep(s, shutdown) {
  var t = s.engine.getTrueState();
  s.handleCommand({ action: 'set_rcp', running: true });
  s.handleCommand({ action: 'set_pressure_setpoint', mpa: 15.41 });
  s.handleCommand({ action: 'set_feed_pump_speed', pct: clampC(40 + 3 * (65 - t.sg_level_pct), 0, 100) });
  if (t.sr_energized && t.pressure_mpa > 5) s.handleCommand({ action: 'set_sr_detector', on: false }); // SR→IR handoff
  if (t.pressure_mpa < 13.5) return;                    // pressurize before pulling rods
  if (shutdown) {                                       // settle subcritical-but-hot (Mode 3)
    s.handleCommand({ action: 'set_boron_adjust', rate: 3.0 });
    s.handleCommand({ action: 'rod_nudge', group_id: 'control_rods', steps: -4, speed: 'normal' });
    return;
  }
  var Pt = (t.tavg_c < 300) ? 10 : 12;                  // gentle SUR-limited hold ~10 %
  if (t.power_pct > Pt * 1.3 || t.startup_rate_dpm > 1.5 || t.fuel_temp_c > 500) s.handleCommand({ action: 'rod_nudge', group_id: 'control_rods', steps: -2, speed: 'normal' });
  else if (t.power_pct < Pt * 0.8 && t.startup_rate_dpm < 1.0) s.handleCommand({ action: 'rod_nudge', group_id: 'control_rods', steps: 1, speed: 'slow' });
}

test('pwr_mode5_to_mode3 — cold heatup reaches Hot Standby, no fuel damage', function (ck) {
  var s = startScenario('pwr_mode5_to_mode3');
  s.handleCommand({ action: 'set_speed', value: 60 });
  var maxFuel = 0;
  var snap = runUntil(s, function (sn) {
    var t = s.engine.getTrueState(); if (t.fuel_temp_c > maxFuel) maxFuel = t.fuel_temp_c;
    heatupStep(s, t.tavg_c >= 296);                     // heat, then settle subcritical once hot
    return lc(sn);
  }, 30000);
  ck('heatup reaches an endpoint', !!snap, !!snap, 'level_complete');
  if (snap) {
    ck('endpoint is the Hot Standby card', lc(snap).title, /Hot Standby/i.test(lc(snap).title), 'Hot Standby — Reached');
    var tf = s.engine.getTrueState();
    ck('hot at NOP temperature', tf.tavg_c.toFixed(1), tf.tavg_c > 285, '> 285 °C');
    ck('subcritical Hot Standby (Mode 3)', 'mode=' + tf.plant_mode + ' rho=' + tf.reactivity_pcm.toFixed(0), tf.plant_mode === 3 && tf.reactivity_pcm < 0, 'Mode 3, subcritical');
    ck('no fuel damage on the way up', maxFuel.toFixed(0), maxFuel < 1200 && !s.engine.s.fuel_damaged, '< 1200 °C');
    // The heatup crosses the P-11 lo-press band with the trip auto-blocked at
    // cold init and auto-reinstated on the way up — a spuriously-scrammed plant
    // would still coast to the Hot Standby card, so pin "never scrammed".
    ck('arrived UNscrammed (trip bypass + reinstate did their job)',
      'rps=' + snap.rps_state.scrammed + ' eng=' + tf.scrammed,
      snap.rps_state.scrammed === false && tf.scrammed === false, 'false/false');
  }
});

test('pwr_mode3_to_mode5 — controlled cooldown reaches Cold Shutdown', function (ck) {
  var s = startScenario('pwr_mode3_to_mode5');
  s.handleCommand({ action: 'set_speed', value: 120 });
  // By-the-book cooldown (2026-07-19 rework — the old script arrived at Cold
  // Shutdown SCRAMMED, caught by the new UNscrammed assertion below):
  //  - Rates are SIM-TIME based, not per-sample: an M5 attention stop can drop
  //    the speed to 1× mid-run, and per-sample walks then turn into full-speed
  //    crashes (probed: spray crashed through P-11 AND the 12.41 lo-press trip
  //    inside one broadcast).
  //  - The P-11 block reads the pressure INSTRUMENT (HR1), which lags the
  //    descent — hold at 13.45 MPa and RETRY until the block is accepted.
  //  - CVCS AUTO make-up holds PZR level against the cooldown shrink (manual
  //    charging management fought the servo and lost — pzr_level low scram).
  var noLoadSp = RD.PWR_CONFIG.steam_generator.steam_dump_setpoint;
  var below = false, blockedLP = false, lastT = null, dumpSp = noLoadSp, prSp = 15.41;
  var snap = runUntil(s, function (sn) {
    var t = s.engine.getTrueState();
    var dtSim = lastT == null ? 0 : s.simTime - lastT; lastT = s.simTime;
    s.handleCommand({ action: 'set_cvcs_auto', active: true });
    dumpSp = Math.max(clampC(psatC(t.tavg_c - 30), 0.3, noLoadSp), dumpSp - 0.002 * dtSim);
    s.handleCommand({ action: 'set_steam_dump_setpoint', mpa: clampC(dumpSp, 0.3, noLoadSp) });
    var spTarget = psatC(t.tavg_c + 30);
    prSp = Math.max(blockedLP ? 0.5 : 13.45, Math.min(prSp - 0.01 * dtSim, clampC(spTarget, 0.5, 15.41)));
    s.handleCommand({ action: 'set_pressure_setpoint', mpa: clampC(Math.max(prSp, blockedLP ? spTarget : 13.45), 0.5, 15.41) });
    s.handleCommand({ action: 'set_spray', auto: true });
    if (!blockedLP && t.pressure_mpa < 13.55) {
      var rb = s.handleCommand({ action: 'set_trip_block', trip_id: 'lo_press', blocked: true });
      if (!(rb && rb.type === 'blocked')) blockedLP = true;   // accepted (retry next sample if refused)
    }
    if (!below && t.pressure_mpa < 2.76) { below = true; s.handleCommand({ action: 'set_rhr', active: true }); s.handleCommand({ action: 'set_rhr_hx', pct: 100 }); s.handleCommand({ action: 'set_rcp', running: false }); }
    s.handleCommand({ action: 'set_boron_adjust', rate: t.reactivity_pcm < -2500 ? 0 : 4.0 });
    if (t.pzr_level_pct > 58) s.handleCommand({ action: 'set_letdown_orifices', a: true, b: false });
    else s.handleCommand({ action: 'set_letdown_orifices', a: false, b: false });
    s.handleCommand({ action: 'set_feed_pump_speed', pct: clampC(10 + 1.5 * (65 - t.sg_level_pct), 0, 100) });
    return lc(sn);
  }, 40000);
  ck('cooldown reaches an endpoint', !!snap, !!snap, 'level_complete');
  if (snap) {
    ck('endpoint is the Cold Shutdown card', lc(snap).title, /Cold Shutdown/i.test(lc(snap).title), 'Cold Shutdown — Reached');
    var tf = s.engine.getTrueState();
    ck('cold (Tavg ≤ 95 °C)', tf.tavg_c.toFixed(1), tf.tavg_c <= 95, '≤ 95 °C');
    ck('depressurized below RHR interlock', tf.pressure_mpa.toFixed(2), tf.pressure_mpa < 2.76, '< 2.76 MPa');
    ck('RHR aligned + subcritical', 'rhr=' + tf.rhr_valve_open + ' rho=' + tf.reactivity_pcm.toFixed(0), tf.rhr_valve_open && tf.reactivity_pcm < 0, 'RHR on, subcritical');
    // The scripted set_trip_block lo_press is what lets the depressurization
    // through 12.41 MPa proceed — if the bypass became a no-op the plant would
    // scram mid-cooldown and STILL reach the card. Pin "never scrammed".
    ck('arrived UNscrammed (lo_press bypass worked)',
      'rps=' + snap.rps_state.scrammed + ' eng=' + tf.scrammed,
      snap.rps_state.scrammed === false && tf.scrammed === false, 'false/false');
  }
});

test('pwr_return_to_mode1 — full cold startup reaches Mode 1, At Power', function (ck) {
  var s = startScenario('pwr_return_to_mode1');
  s.handleCommand({ action: 'set_speed', value: 60 });
  var maxFuel = 0;
  var snap = runUntil(s, function (sn) {
    var t = s.engine.getTrueState(); if (t.fuel_temp_c > maxFuel) maxFuel = t.fuel_temp_c;
    heatupStep(s, false);                                // heat and hold power — no shutdown
    return lc(sn);
  }, 30000);
  ck('startup reaches an endpoint', !!snap, !!snap, 'level_complete');
  if (snap) {
    ck('endpoint is the At Power card', lc(snap).title, /At Power|Mode 1/i.test(lc(snap).title), 'At Power — Mode 1 Reached');
    var tf = s.engine.getTrueState();
    ck('at Mode 1 (critical, hot, > 5 %)', 'mode=' + tf.plant_mode + ' P=' + tf.power_pct.toFixed(1), tf.plant_mode === 1 && tf.power_pct > 5, 'Mode 1, > 5 %');
    ck('no fuel damage on the way up', maxFuel.toFixed(0), maxFuel < 1200 && !s.engine.s.fuel_damaged, '< 1200 °C');
    ck('arrived UNscrammed (cold-init blocks + reinstate did their job)',
      'rps=' + snap.rps_state.scrammed + ' eng=' + tf.scrammed,
      snap.rps_state.scrammed === false && tf.scrammed === false, 'false/false');
  }
});

// ------------------------------------------------------------ RBMK campaign
test('rbmk_tour — orientation chain completes', function (ck) {
  var s = startScenario('rbmk_tour');
  var snap = runUntil(s, function (sn) { return lc(sn); }, 300);
  ck('tour completes on its own', !!snap, !!snap, 'level_complete');
});

test('rbmk_void — flow cut raises power, restore completes', function (ck) {
  var s = startScenario('rbmk_void');
  // cut_task carries the branch watch: settle past its delay-16 fire, then
  // cut inside the watch.
  var snap = waitBeat(s, 'cut_task', 120);
  ck('flow-cut beat arms', !!snap, !!snap, 'cut_task pending');
  if (!snap) return;
  settle(s, 18);
  s.handleCommand({ action: 'set_channel_flow', pct: 60 });
  snap = waitBeat(s, 'restore_task', 600);
  ck('power rise observed → restore prompt', !!snap, !!snap, 'restore_task pending');
  if (!snap) return;
  settle(s, 4);                         // restore_task fires (delay 2)
  s.handleCommand({ action: 'set_channel_flow', pct: 80 });
  snap = runUntil(s, function (sn) { return lc(sn); }, 600);
  ck('restoration completes the mission', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the felt card', lc(snap).title, /Felt/i.test(lc(snap).title), 'Wrong-Way Machine — Felt card');
  // A trip mid-experiment (deep cut spikes ~120% and the protection acts, or
  // a manual AZ-5) lands on the overpowered card, not a softlock (playtest).
  var s2 = startScenario('rbmk_void');
  snap = waitBeat(s2, 'cut_task', 120);
  if (snap) {
    settle(s2, 18);
    s2.handleCommand({ action: 'set_channel_flow', pct: 30 });
    snap = runUntil(s2, function (sn) { return lc(sn); }, 600);
  }
  ck('deep cut reaches an endpoint (no softlock)', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the overpowered card', lc(snap).title, /Bit/i.test(lc(snap).title), 'It Bit card');
});

test('rbmk_ar — take the AR manual, sag, restore, hand back', function (ck) {
  // Headless there is no UI automation, so the AR simply sits where the state
  // parked it (50% inserted) — the mission's triggers depend only on the
  // player's own AR motion and the power response, by design.
  var s = startScenario('rbmk_ar');
  var snap = waitBeat(s, 'take_manual', 60);
  ck('take-manual beat arms', !!snap, !!snap, 'take_manual pending');
  if (!snap) return;
  settle(s, 16);                        // its delay-14 fires; branch watch opens
  s.handleCommand({ action: 'rod_start', group_id: 'auto_rods', direction: -1, speed: 'normal' });
  snap = waitBeat(s, 'sag_observed', 300);
  s.handleCommand({ action: 'rod_stop', group_id: 'auto_rods' });
  ck('insertion + sag observed → restore prompt', !!snap, !!snap, 'sag_observed pending');
  if (!snap) return;
  settle(s, 4);                         // sag_observed fires (delay 2)
  s.handleCommand({ action: 'rod_start', group_id: 'auto_rods', direction: 1, speed: 'normal' });
  snap = waitBeat(s, 'hand_back', 400);
  s.handleCommand({ action: 'rod_stop', group_id: 'auto_rods' });
  ck('withdrawal + recovery observed → hand-back prompt', !!snap, !!snap, 'hand_back pending');
  if (!snap) return;
  settle(s, 4);                         // hand_back fires (delay 2); manual trigger waits
  s.handleCommand({ action: 'instructor_continue' });
  snap = runUntil(s, function (sn) { return lc(sn); }, 120);
  ck('continue completes the mission', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the met card', lc(snap).title, /Met/i.test(lc(snap).title), 'Steady Hand — Met card');
  // A scram mid-exercise lands on the fumbled card, not a softlock.
  var s2 = startScenario('rbmk_ar');
  snap = waitBeat(s2, 'take_manual', 60);
  if (snap) {
    settle(s2, 16);
    s2.handleCommand({ action: 'manual_scram' });
    snap = runUntil(s2, function (sn) { return lc(sn); }, 300);
  }
  ck('scram mid-exercise reaches an endpoint (no softlock)', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the fumbled card', lc(snap).title, /Fumbled/i.test(lc(snap).title), 'Fumbled card');
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

// ------------------------------------------------------------ PWR automation
test('pwr_automation — dispatcher swing completes under the authored preset', function (ck) {
  // UI-faithful: the preset channels are engaged (startScenarioAuto), because
  // the mission NEEDS them — the bare plant trips on a 1000→700 swing (Tavg
  // runs away with nobody trimming rods; probed). That trip is the authored
  // failure card, covered below by the scram branch check.
  var s = startScenarioAuto('pwr_automation');
  var snap = waitBeat(s, 'drop_load', 60);
  ck('drop-load beat arms', !!snap, !!snap, 'drop_load pending');
  if (!snap) return;
  settle(s, 16);                        // its delay-14 fires; branch watch opens
  s.handleCommand({ action: 'set_load_target', mwe: 700 });
  snap = waitBeat(s, 'watch_settle', 600);
  ck('power followed demand down → settle card', !!snap, !!snap, 'watch_settle pending');
  if (!snap) return;
  settle(s, 34);                        // watch_settle fires (delay 30); raise watch opens
  s.handleCommand({ action: 'set_load_target', mwe: 1000 });
  snap = runUntil(s, function (sn) { return lc(sn); }, 900);
  ck('ramp back up completes the mission', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the dispatched card', lc(snap).title, /Dispatched/i.test(lc(snap).title), 'Hands Off — Dispatched card');
  // A scram lands on the tripped card, not a softlock.
  var s2 = startScenario('pwr_automation');
  snap = waitBeat(s2, 'drop_load', 60);
  if (snap) {
    settle(s2, 16);
    s2.handleCommand({ action: 'scram' });
    snap = runUntil(s2, function (sn) { return lc(sn); }, 300);
  }
  ck('scram reaches an endpoint (no softlock)', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the tripped card', lc(snap).title, /Tripped/i.test(lc(snap).title), 'Tripped card');
});

// ------------------------------------------------------------ BWR campaign
test('bwr_tour — orientation chain completes', function (ck) {
  var s = startScenario('bwr_tour');
  var snap = runUntil(s, function (sn) { return lc(sn); }, 300);
  ck('tour completes on its own', !!snap, !!snap, 'level_complete');
});

test('bwr_recirc — throttle up to ~70%, back to 50%', function (ck) {
  var s = startScenario('bwr_recirc');
  // up_task carries the branch watch: settle past its delay-18 fire, then
  // throttle inside the watch.
  var snap = waitBeat(s, 'up_task', 120);
  ck('throttle-up beat arms', !!snap, !!snap, 'up_task pending');
  if (!snap) return;
  settle(s, 20);
  s.handleCommand({ action: 'set_recirc_flow', pct: 25 });
  snap = waitBeat(s, 'down_task', 600);
  ck('power rise observed → throttle-down prompt', !!snap, !!snap, 'down_task pending');
  if (!snap) return;
  settle(s, 4);                         // down_task fires (delay 2)
  s.handleCommand({ action: 'set_recirc_flow', pct: 19 });
  snap = runUntil(s, function (sn) { return lc(sn); }, 600);
  ck('return to 50% completes the mission', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the licensed card', lc(snap).title, /Licensed/i.test(lc(snap).title), 'Flow Throttle — Licensed card');
  // A scram mid-maneuver lands on the tripped card, not a softlock (playtest).
  var s2 = startScenario('bwr_recirc');
  snap = waitBeat(s2, 'up_task', 120);
  if (snap) {
    settle(s2, 20);
    s2.handleCommand({ action: 'scram' });
    snap = runUntil(s2, function (sn) { return lc(sn); }, 300);
  }
  ck('scram mid-maneuver reaches an endpoint (no softlock)', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the tripped card', lc(snap).title, /Tripped/i.test(lc(snap).title), 'Flow Throttle — Tripped card');
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

// ---------------------------------------------------------------- TMI-2 module (M5)
// Chat-mode scenarios: pacing gates are any(manual, delay) so a periodic
// Continue (or plain patience) drives them; decision points are plant actions.
function ackThrough(s, pred, simBudget, actions) {
  var start = s.simTime, lastAck = s.simTime, snap = null, done = {};
  for (var guard = 0; guard < 600000; guard++) {
    snap = s.advanceCycles(1);
    if (pred(snap)) return snap;
    if (s.simTime - start > simBudget) return null;
    if (s.simTime - lastAck > 4) { s.handleCommand({ action: 'instructor_continue' }); lastAck = s.simTime; }
    (actions || []).forEach(function (a, i) {
      if (!done[i] && a.when(snap)) { done[i] = true; a.act(s); }
    });
  }
  return null;
}

test('pwr_tmi2_p1 — Fog of War plays to the historical outcome', function (ck) {
  var s = startScenario('pwr_tmi2_p1');
  var snap = ackThrough(s, function (sn) { return lc(sn); }, 4000, []);
  ck('reaches level_complete', !!snap, !!snap, 'level_complete');
  if (!snap) return;
  ck('endpoint is the Fog of War card', lc(snap).title, /Fog of War/.test(lc(snap).title), 'Part 1 card');
  ck('core damage latched (unsoftened ending)', snap.true_state.fuel_damaged, snap.true_state.fuel_damaged === true, 'fuel_damaged true');
  ck('plant recovered post-isolation', snap.instruments.subcooling_margin,
    snap.instruments.subcooling_margin > 11.1, '> 11.1 °C');
  var chat = snap.instructor.chat;
  ck('chat transcript accumulated', chat && chat.log.length, !!chat && chat.log.length > 40, '> 40 lines');
  // The tag denial: interaction responds but never grants in Part 1.
  s.handleCommand({ action: 'instructor_interact', interaction_id: 'afw_tag' });
  var sn2 = s.advanceCycles(1);
  var it = sn2.instructor.chat.interactions.afw_tag;
  ck('Part 1 tag click is denied (never granted)', JSON.stringify(it), it && it.clicks === 1 && !it.granted, 'clicks:1 granted:false');
});

test('pwr_tmi2_p1 — Part 1 gate blocks plant actions in character', function (ck) {
  var s = startScenario('pwr_tmi2_p1');
  var snap = waitBeat(s, 'b1_turnover', 60);
  ck('lead-in armed', !!snap, !!snap, 'b1 pending');
  var r = s.handleCommand({ action: 'set_hpi', active: true });
  ck('plant command blocked by the watch-only gate', r && r.code, !!r && r.code === 'GATED_BY_INSTRUCTOR', 'GATED_BY_INSTRUCTOR');
  var r2 = s.handleCommand({ action: 'acknowledge_all_alarms' });
  ck('alarm acknowledge still allowed', r2 == null || r2.type !== 'blocked', r2 == null || r2.type !== 'blocked', 'not blocked');
});

test('pwr_tmi2_p2 — Under a Microscope replay completes', function (ck) {
  var s = startScenario('pwr_tmi2_p2');
  var snap = ackThrough(s, function (sn) { return lc(sn); }, 5000, []);
  ck('reaches level_complete', !!snap, !!snap, 'level_complete');
  if (snap) ck('endpoint is the Part 2 card', lc(snap).title, /Microscope/.test(lc(snap).title), 'Part 2 card');
  if (snap) ck('replay reproduced the damage (truth shown)', snap.true_state.fuel_damaged, snap.true_state.fuel_damaged === true, 'fuel_damaged true');
});

test('pwr_tmi2_p3 — full save: tag + defended HPI + early isolation', function (ck) {
  var s = startScenario('pwr_tmi2_p3');
  var snap = ackThrough(s, function (sn) { return lc(sn); }, 4000, [
    { when: function (sn) { return sn.metadata.sim_time > 20; },
      act: function (s2) { s2.handleCommand({ action: 'instructor_interact', interaction_id: 'afw_tag' }); } },
    { when: function (sn) { return sn.metadata.sim_time > 320 && sn.true_state.porv_stuck; },
      act: function (s2) { s2.handleCommand({ action: 'close_block_valve' }); } },
  ]);
  ck('reaches level_complete', !!snap, !!snap, 'level_complete');
  if (!snap) return;
  ck('best ending: Eventful Shift', lc(snap).title, /Eventful Shift/.test(lc(snap).title), 'full-save card');
  ck('no core damage', snap.true_state.fuel_damaged, snap.true_state.fuel_damaged === false, 'fuel_damaged false');
  ck('tag interaction granted (valves reopened)', snap.instructor.chat.interactions.afw_tag.granted,
    snap.instructor.chat.interactions.afw_tag.granted === true, 'granted true');
});

test('pwr_tmi2_p3 — no deviations: history repeats gracefully', function (ck) {
  var s = startScenario('pwr_tmi2_p3');
  var complied = { done: false, alarmAt: null };
  var snap = ackThrough(s, function (sn) { return lc(sn); }, 6000, [
    { when: function (sn) {
        var al = (sn.alarms || []).some(function (a) { return a.id === 'pzr_level_high' && a.state !== 'clear'; });
        if (al && complied.alarmAt == null) complied.alarmAt = sn.metadata.sim_time;
        return complied.alarmAt != null && sn.metadata.sim_time - complied.alarmAt > 6;
      },
      act: function (s2) { s2.handleCommand({ action: 'set_hpi', active: false }); } },
  ]);
  ck('reaches level_complete', !!snap, !!snap, 'level_complete');
  if (!snap) return;
  ck('graceful historical ending', lc(snap).title, /History Repeated/.test(lc(snap).title), 'History Repeated card');
  ck('core damage (as in 1979)', snap.true_state.fuel_damaged, snap.true_state.fuel_damaged === true, 'fuel_damaged true');
});

// The remaining three of the five endings (2026-07-19 review: the ending
// discrimination is compound physics-coupled triggers — the part most likely
// to break on physics drift — and 3/5 outcomes were unproven).

test('pwr_tmi2_p3 — plugged not refilled: comply + early isolation, no re-injection', function (ck) {
  var s = startScenario('pwr_tmi2_p3');
  var snap = ackThrough(s, function (sn) { return lc(sn); }, 5000, [
    { when: function (sn) { return sn.metadata.sim_time > 20; },
      act: function (s2) { s2.handleCommand({ action: 'instructor_interact', interaction_id: 'afw_tag' }); } },
    // comply with the HPI order the moment it arms (the historical action)
    { when: function (sn) { return sn.instructor.current_beat_id === 'p3_b9_order'; },
      act: function (s2) { s2.handleCommand({ action: 'set_hpi', active: false }); } },
    // …but catch the tailpipe early: isolate pre-damage, never put water back
    { when: function (sn) { return sn.metadata.sim_time > 320 && sn.true_state.porv_stuck; },
      act: function (s2) { s2.handleCommand({ action: 'close_block_valve' }); } },
  ]);
  ck('reaches level_complete', !!snap, !!snap, 'level_complete');
  if (!snap) return;
  ck('ending: Plugged, Not Refilled', lc(snap).title, /Plugged, Not Refilled/.test(lc(snap).title), 'plugged card');
  ck('no core damage', snap.true_state.fuel_damaged, snap.true_state.fuel_damaged === false, 'fuel_damaged false');
  ck('inventory NOT recovered (the card\'s premise)', snap.true_state.core_inventory_pct.toFixed(1),
    snap.true_state.core_inventory_pct <= 85, '≤ 85%');
});

test('pwr_tmi2_p3 — caught late: isolation only after damage begins', function (ck) {
  var s = startScenario('pwr_tmi2_p3');
  var snap = ackThrough(s, function (sn) { return lc(sn); }, 9000, [
    { when: function (sn) { return sn.instructor.current_beat_id === 'p3_b9_order'; },
      act: function (s2) { s2.handleCommand({ action: 'set_hpi', active: false }); } },
    // act only once the core has already started to fail
    { when: function (sn) { return sn.true_state.fuel_damaged === true; },
      act: function (s2) { s2.handleCommand({ action: 'close_block_valve' }); s2.handleCommand({ action: 'set_hpi', active: true }); } },
  ]);
  ck('reaches level_complete', !!snap, !!snap, 'level_complete');
  if (!snap) return;
  ck('ending: Caught Late', lc(snap).title, /Caught Late/.test(lc(snap).title), 'late card');
  ck('core damage stands', snap.true_state.fuel_damaged, snap.true_state.fuel_damaged === true, 'fuel_damaged true');
});

test('pwr_tmi2_p3 — holding not won: HPI defended, leak never isolated', function (ck) {
  var s = startScenario('pwr_tmi2_p3');
  var snap = ackThrough(s, function (sn) { return lc(sn); }, 9000, [
    { when: function (sn) { return sn.metadata.sim_time > 20; },
      act: function (s2) { s2.handleCommand({ action: 'instructor_interact', interaction_id: 'afw_tag' }); } },
    // refuse the HPI order by simply never securing it; never touch the valve
  ]);
  ck('reaches level_complete', !!snap, !!snap, 'level_complete');
  if (!snap) return;
  ck('ending: Holding, Not Won', lc(snap).title, /Holding, Not Won/.test(lc(snap).title), 'bleed card');
  ck('no core damage (injection winning)', snap.true_state.fuel_damaged, snap.true_state.fuel_damaged === false, 'fuel_damaged false');
  ck('block valve still open (never isolated)', snap.true_state.block_valve_open, snap.true_state.block_valve_open === true, 'true');
});

report();
