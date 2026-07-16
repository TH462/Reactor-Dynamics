/*
 * run_scenarios.js — headless validation of authored M6 scenarios, driven
 * through the full M5 stack (engine + M4 + Instructor) exactly as the UI would
 * run them: start_scenario, real broadcasts, real auto-actuation, real alarms.
 *
 * Proves each flagship plays end-to-end on the CURRENT physics: every beat
 * reachable, both branches of each decision point, and the teaching claims
 * (e.g. the PORV indicator lie) actually visible in the snapshot.
 *
 *   node test/run_scenarios.js
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
  'scenarios/pwr_tmi.js', 'scenarios/pwr_hook.js',
].forEach(load);
var RD = globalThis.RD;

function test(name, fn) {
  var checks = [];
  var ck = function (d, o, p, e) { checks.push({ desc: d, observed: o, expected: e, pass: !!p }); };
  try { fn(ck); } catch (e) { ck('threw: ' + (e && e.message), String(e && e.stack || e), false, 'no throw'); }
  return { name: name, pass: checks.every(function (c) { return c.pass; }), checks: checks };
}
var T = [];

// Drive broadcast cycles until pred(snapshot) is true or simBudget seconds of
// sim time pass. Returns the satisfying snapshot or null.
function runUntil(s, pred, simBudget) {
  var start = s.simTime;
  var snap = null;
  for (var guard = 0; guard < 200000; guard++) {
    snap = s.advanceCycles(1);
    if (pred(snap)) return snap;
    if (s.simTime - start > simBudget) return null;
  }
  return null;
}

// A fresh stack with the scenario started and a message-transition log attached
// (each new instructor message is recorded once, with its sim time).
function startTmi() {
  var s = new RD.SimulationService({ seed: 42 });
  var log = [];
  var lastMsg = null;
  s.subscribe(function (snap) {
    var m = snap.instructor && snap.instructor.message;
    if (m && m !== lastMsg) { log.push({ t: snap.metadata.sim_time, msg: m.slice(0, 60) }); lastMsg = m; }
  });
  s.handleCommand({ action: 'start_scenario', scenario_id: 'pwr_tmi' });
  return { s: s, log: log };
}
function firedIds(s) { return Array.from(s.instructor.firedBeats); }

// Common leg: intro → feedwater lost → trip → PORV stuck with lying indicator →
// decision point. Returns the decision-point snapshot (or null with diagnostics).
function driveToDecision(ctx, ck) {
  var s = ctx.s;
  // Real-time-ish through the fast transient so instrument triggers see it.
  s.handleCommand({ action: 'set_speed', value: 2 });
  var trip = runUntil(s, function (sn) { return sn.rps_state.scrammed; }, 900);
  ck('reactor trips on lost feedwater (RPS, not the scenario)', trip ? 't=' + trip.metadata.sim_time.toFixed(0) + 's' : 'never', !!trip, 'scram');
  if (!trip) return null;

  var stuck = runUntil(s, function () {
    return s.instructor.firedBeats.has('porv_sticks');
  }, 300);
  ck('porv_sticks beat fired on the indicator showing open', stuck ? 't=' + stuck.metadata.sim_time.toFixed(0) + 's' : 'never (fired: ' + firedIds(s) + ')', !!stuck, 'porv_sticks beat');
  if (!stuck) return null;

  var lie = runUntil(s, function (sn) {
    return sn.true_state.porv_open === true && sn.instruments.porv_indicator === 'closed';
  }, 60);
  ck('the lie is live: valve truly open, indicator reads closed (HR1/HR4)',
    lie ? 'porv_open=true, indicator=closed' : 'not observed', !!lie, 'truth ≠ indication');

  s.handleCommand({ action: 'set_speed', value: 30 });   // erosion phase — accelerate
  var decision = runUntil(s, function (sn) {
    return s.instructor.firedBeats.has('injection_decision');
  }, 5400);
  ck('injection_decision fires on the subcooling alarm', decision ? 't=' + decision.metadata.sim_time.toFixed(0) + 's' : 'never (fired: ' + firedIds(s) + ')', !!decision, 'decision beat');
  if (decision) ck('a rewind checkpoint per fired beat', s.checkpoints.length + ' on ring', s.checkpoints.length >= 6, '>= 6 (load + 5 beats)');
  return decision;
}

// ============================== TMI — recovery branch ==============================
T.push(test('TMI recovery — HPI at the decision point averts the accident', function (ck) {
  var ctx = startTmi();
  var s = ctx.s;
  var first = s.advanceCycles(25);
  ck('intro beat fired', s.instructor.firedBeats.has('intro') ? 'intro at ~2s' : 'not fired', s.instructor.firedBeats.has('intro'), 'intro');
  ck('scenario reset the plant to hot_full_power', first.true_state.power_pct.toFixed(0) + '%', Math.abs(first.true_state.power_pct - 100) < 3, '~100%');

  var decision = driveToDecision(ctx, ck);
  if (!decision) return;

  s.handleCommand({ action: 'set_speed', value: 2 });
  s.handleCommand({ action: 'set_hpi', active: true });
  var rec = runUntil(s, function () { return s.instructor.firedBeats.has('recovery_path'); }, 120);
  ck('operator_action branch → recovery_path', rec ? 't=' + rec.metadata.sim_time.toFixed(0) + 's' : 'never', !!rec, 'recovery_path');

  s.handleCommand({ action: 'set_speed', value: 30 });
  var done = runUntil(s, function (sn) { return sn.instructor.level_complete != null; }, 3600);
  ck('recovered beat delivers level_complete', done ? JSON.stringify(done.instructor.level_complete.title) : 'never (fired: ' + firedIds(s) + ')', !!done && /Averted/.test(done.instructor.level_complete.title), 'Averted');
  if (done) {
    ck('core never melted', done.true_state.melted, done.true_state.melted === false, 'false');
    ck('subcooling margin restored', done.instruments.subcooling_margin.toFixed(1) + ' °C', done.instruments.subcooling_margin > 11.1, '> 11.1 °C');
    ck('set point dropped time back to 1× (beat speed)', done.metadata.time_acceleration, done.metadata.time_acceleration === 1, '1');
    ck('scenario flow ended (no fall-through into the damage branch)', String(s.instructor.currentBeatId), s.instructor.currentBeatId === null, 'null');
  }
  console.log('    beat log (recovery): ' + ctx.log.map(function (e) { return e.t.toFixed(0) + 's "' + e.msg + '…"'; }).join(' | '));
}));

// ============================== TMI — damage branch ==============================
T.push(test('TMI damage — inaction at the decision point reproduces 1979', function (ck) {
  var ctx = startTmi();
  var s = ctx.s;
  s.advanceCycles(25);
  var decision = driveToDecision(ctx, ck);
  if (!decision) return;
  var invAtDecision = decision.true_state.core_inventory_pct;

  // Do nothing. The inaction window (120 s) must route to the damage path,
  // which replays the 1979 operator error (securing the auto-started HPI).
  var dmg = runUntil(s, function () { return s.instructor.firedBeats.has('damage_path'); }, 600);
  ck('inaction branch → damage_path after the window', dmg ? 't=' + dmg.metadata.sim_time.toFixed(0) + 's' : 'never (fired: ' + firedIds(s) + ')', !!dmg, 'damage_path');
  if (!dmg) return;
  // 10× since the playtest pacing pass — the damage_path card explains the
  // 1979 operator error and needs its reading window.
  ck('damage phase fast-forwards (beat speed 10×)', dmg.metadata.time_acceleration, dmg.metadata.time_acceleration === 10, '10');
  var invAtDamage = dmg.true_state.core_inventory_pct;
  var later = runUntil(s, function (sn) { return sn.metadata.sim_time - dmg.metadata.sim_time > 120; }, 300);
  ck('with HPI secured, inventory drains through the stuck PORV',
    later ? later.true_state.core_inventory_pct.toFixed(1) + '% (was ' + invAtDamage.toFixed(1) + '%)' : 'n/a',
    later && later.true_state.core_inventory_pct < invAtDamage, 'falling');

  var done = runUntil(s, function (sn) { return sn.instructor.level_complete != null; }, 7200);
  ck('core_damage beat delivers level_complete at uncovery', done ? done.instructor.level_complete.title : 'never (inv=' + s.assembleSnapshot().true_state.core_inventory_pct.toFixed(1) + '%, fired: ' + firedIds(s) + ')', !!done && /1979/.test(done.instructor.level_complete.title), '1979 outcome');
  if (done) {
    ck('rewind offered at the failure', JSON.stringify(done.instructor.level_complete.actions), done.instructor.level_complete.actions.indexOf('rewind') !== -1, 'includes rewind');
    ck('core inventory below the uncovery threshold', done.true_state.core_inventory_pct.toFixed(1) + '%', done.true_state.core_inventory_pct < 70, '< 70%');
    ck('core uncovery snaps time back to 1× (drop-out at the set point)', done.metadata.time_acceleration, done.metadata.time_acceleration === 1, '1');
  }
  console.log('    beat log (damage): ' + ctx.log.map(function (e) { return e.t.toFixed(0) + 's "' + e.msg + '…"'; }).join(' | '));
}));

// ============================== The Hook — first-run onboarding ==============================
T.push(test('Hook — scram-only gate, dramatic trip, world rewind, level complete', function (ck) {
  var s = new RD.SimulationService({ seed: 42 });
  s.handleCommand({ action: 'start_scenario', scenario_id: 'pwr_hook' });
  var sn = runUntil(s, function () { return s.instructor.firedBeats.has('press_it'); }, 30);
  ck('press_it beat fires', sn ? 't=' + sn.metadata.sim_time.toFixed(1) + 's' : 'never', !!sn, 'fired');
  if (!sn) return;
  ck('SCRAM highlighted for the player', JSON.stringify(sn.instructor.highlight), sn.instructor.highlight && sn.instructor.highlight.control_label === 'SCRAM', 'SCRAM');
  var blocked = s.handleCommand({ action: 'open_porv' });
  ck('everything but the trip is gated off', JSON.stringify(blocked), blocked && blocked.type === 'blocked', 'blocked');
  var ok = s.handleCommand({ action: 'scram' });
  ck('the SCRAM passes the gate', ok == null ? 'accepted' : JSON.stringify(ok), ok == null, 'accepted');
  sn = runUntil(s, function () { return s.instructor.firedBeats.has('what_happened'); }, 60);
  ck('post-trip narration plays', sn ? 't=' + sn.metadata.sim_time.toFixed(1) + 's, power=' + sn.true_state.power_pct.toFixed(1) + '%' : 'never', !!sn && sn.true_state.power_pct < 20, 'power collapsed');
  var tBefore = s.simTime;
  sn = runUntil(s, function () { return s.instructor.firedBeats.has('rewind_time'); }, 60);
  ck('rewind beat fires', sn ? 'yes' : 'never', !!sn, 'fired');
  if (!sn) return;
  ck('time rewound to before the press', sn.metadata.sim_time.toFixed(1) + 's (was ' + tBefore.toFixed(1) + 's)', sn.metadata.sim_time < 3 && sn.metadata.sim_time < tBefore, 'earlier, pre-scram');
  ck('the world is pre-scram again', 'scrammed=' + sn.rps_state.scrammed + ', power=' + sn.true_state.power_pct.toFixed(0) + '%', sn.rps_state.scrammed === false && sn.true_state.power_pct > 90, 'running at ~100%');
  ck('the teacher remembers (world scope)', Array.from(s.instructor.firedBeats).join(','), s.instructor.firedBeats.has('tripped') && s.instructor.firedBeats.has('rewind_time'), 'beats stay fired');
  sn = runUntil(s, function (x) { return x.instructor.level_complete != null; }, 60);
  ck('hook ends with level_complete', sn ? sn.instructor.level_complete.title : 'never', !!sn && /Welcome/.test(sn.instructor.level_complete.title), 'Welcome…');
  if (sn) ck('scenario flow ended', String(s.instructor.currentBeatId), s.instructor.currentBeatId === null, 'null');
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
