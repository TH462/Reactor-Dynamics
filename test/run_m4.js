/*
 * run_m4.js — integration smoke test for the Control & Failure Layer (M4) wired
 * onto the PWR engine (M1). This is a DEV check, not the M7 Test Runner: it
 * exercises the highest-value wiring properties (trips/alarms read instruments
 * not truth, command interception, the ATWS truth-gap, alarm lifecycle,
 * actuation, failure bookkeeping, save/restore). M7 owns the full validation.
 *
 *   node test/run_m4.js
 */
'use strict';
var path = require('path');
function load(p) { require(path.join(__dirname, '..', p)); }
[
  'engines/load_mode.js',
  'engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js',
  'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js',
  'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
  'layers/control/control_kernel.js',
].forEach(load);
var RD = globalThis.RD;

// ---- minimal stack: engine + layer, stepped with per-cycle evaluate (like M5) ----
function Stack(initial, seed) {
  this.engine = new RD.PWREngine({ initial_state: initial || 'hot_full_power', seed: seed });
  this.layer = new RD.ControlFailureLayer(this.engine);
  this.dt = 0.02;
}
Stack.prototype.cmd = function (c) { return this.layer.handleCommand(c); };
Stack.prototype.run = function (seconds) {
  var n = Math.round(seconds / this.dt);
  for (var i = 0; i < n; i++) { this.engine.step(this.dt); this.layer.evaluate(this.engine.getInstruments()); }
  return this;
};
Stack.prototype.ts = function () { return this.engine.getTrueState(); };
Stack.prototype.ins = function () { return this.engine.getInstruments(); };
Stack.prototype.alarm = function (id) { return this.layer.getAlarms().find(function (a) { return a.id === id; }); };

function test(name, fn) {
  var checks = [];
  var ck = function (desc, observed, pass, expected) { checks.push({ desc: desc, observed: observed, expected: expected, pass: !!pass }); };
  try { fn(ck); } catch (e) { ck('threw: ' + (e && e.message), String(e && e.stack || e), false, 'no throw'); }
  return { name: name, pass: checks.every(function (c) { return c.pass; }), checks: checks };
}

var T = [];

T.push(test('Trip reads INSTRUMENT not truth — stuck-high instrument trips with truth safe', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(2);
  ck('truth safe before', s.ts().tavg_c.toFixed(1), s.ts().tavg_c < 335, '< 335 °C');
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'stuck', value: 340 }); // > 335 trip
  s.run(2);
  ck('trips on the (false) high reading', s.layer.rps.last_trip_reason, s.layer.rps.scrammed === true, 'scrammed');
  ck('true Tavg was never unsafe', s.ts().tavg_c.toFixed(1), s.ts().tavg_c < 335, 'truth stayed < 335');
}));

T.push(test('Trip reads INSTRUMENT not truth — instruments stuck safe, truth wild → NO trip', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(2);
  // Freeze every instrument-based trip parameter at a safe value; pumps stay on
  // so __true_flow__ stays safe too.
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'power_range', mode: 'stuck', value: 100 });
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'stuck', value: 304 });
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'primary_pressure', mode: 'stuck', value: 15.4 });
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'pzr_level', mode: 'stuck', value: 55 });
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'sg_level', mode: 'stuck', value: 65 });
  // Drive TRUE state genuinely unsafe: loss of feedwater boils the SG dry, so
  // true SG level crashes far below its 12% low-level trip — but the frozen
  // instrument still reads 65%.
  s.cmd({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
  s.run(120);
  ck('true SG level genuinely unsafe (< 12%)', s.ts().sg_level_pct.toFixed(1), s.ts().sg_level_pct < 12, '< 12%');
  ck('instrument still reads safe', s.ins().sg_level.toFixed(1), s.ins().sg_level > 60, 'frozen ~65%');
  ck('no scram (trips read the safe instruments)', String(s.layer.rps.scrammed), s.layer.rps.scrammed === false, 'not scrammed');
}));

T.push(test('TMI — porv_open alarm suppressed by the lying indicator', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(1);
  s.cmd({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
  s.cmd({ action: 'inject_failure', failure_id: 'porv_indicator_stuck_closed' });
  s.cmd({ action: 'open_porv' });
  s.run(2);
  ck('PORV truly open', s.ts().porv_open, s.ts().porv_open === true, true);
  ck('indicator reads closed', s.ins().porv_indicator, s.ins().porv_indicator === 'closed', 'closed');
  ck('porv_open alarm does NOT annunciate', s.alarm('porv_open').state, s.alarm('porv_open').state === 'clear', 'clear');
}));

T.push(test('ATWS — failure_to_scram: trip signal present, reactor not shut down', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(1);
  s.cmd({ action: 'inject_failure', failure_id: 'failure_to_scram' });
  // Force a trip via a stuck-high flux reading.
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'power_range', mode: 'stuck', value: 125 });
  s.run(3);
  ck('trip signal present (indication)', s.layer.rps.scrammed, s.layer.rps.scrammed === true, 'rps scrammed');
  ck('engine NOT scrammed (truth)', s.ts().scrammed, s.ts().scrammed === false, 'true_state not scrammed');
  ck('power has not collapsed', s.ts().power_pct.toFixed(1), s.ts().power_pct > 90, '~ still at power');
}));

T.push(test('Interception — stuck-open PORV defeats a close command', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(1);
  s.cmd({ action: 'open_porv' });
  s.cmd({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
  s.cmd({ action: 'close_porv' });   // intercepted → open_porv
  s.run(1);
  ck('valve stays open after close', s.ts().porv_open, s.ts().porv_open === true, true);
  ck('demand was forced back to open', s.engine.getControlState().porv_demand, s.engine.getControlState().porv_demand === 'open', 'open');
}));

T.push(test('Engineered-safety actuation — low pressure auto-starts HPI', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(1);
  ck('HPI off initially', s.ts().hpi_active, s.ts().hpi_active === false, false);
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'primary_pressure', mode: 'stuck', value: 10.0 }); // < 11.03 actuation
  s.run(2);
  ck('HPI auto-actuated on low pressure', s.ts().hpi_active, s.ts().hpi_active === true, true);
}));

T.push(test('Alarm lifecycle — clear → unack → ack → clear', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(1);
  ck('starts clear', s.alarm('high_tavg').state, s.alarm('high_tavg').state === 'clear', 'clear');
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'stuck', value: 320 }); // > 312.2 alarm, < 335 trip
  s.run(1);
  ck('condition true → active_unacknowledged', s.alarm('high_tavg').state, s.alarm('high_tavg').state === 'active_unacknowledged', 'active_unacknowledged');
  s.cmd({ action: 'acknowledge_alarm', alarm_id: 'high_tavg' });
  s.run(0.2);
  ck('acknowledge → active_acknowledged', s.alarm('high_tavg').state, s.alarm('high_tavg').state === 'active_acknowledged', 'active_acknowledged');
  s.cmd({ action: 'clear_instrument_failure', instrument_id: 'tavg' });
  s.run(2);
  ck('condition clears → clear', s.alarm('high_tavg').state, s.alarm('high_tavg').state === 'clear', 'clear');
}));

T.push(test('Failure bookkeeping — re-inject updates severity in place; snapshot {id,severity}', function (ck) {
  var s = new Stack('hot_full_power');
  s.cmd({ action: 'inject_failure', failure_id: 'sgtr', severity: 0.3 });
  var af1 = s.layer.getActiveFailures();
  ck('active_failures carries {id,severity}', JSON.stringify(af1), af1.length === 1 && af1[0].id === 'sgtr' && Math.abs(af1[0].severity - 0.3) < 1e-9, '[{sgtr,0.3}]');
  s.cmd({ action: 'inject_failure', failure_id: 'sgtr', severity: 0.7 });   // re-inject
  var af2 = s.layer.getActiveFailures();
  ck('re-inject updates in place (no duplicate)', af2.length, af2.length === 1, '1 entry');
  ck('severity updated to 0.7', af2[0].severity, Math.abs(af2[0].severity - 0.7) < 1e-9, '0.7');
  s.cmd({ action: 'clear_failure', failure_id: 'sgtr' });
  ck('clear removes it', s.layer.getActiveFailures().length, s.layer.getActiveFailures().length === 0, '0');
}));

T.push(test('Failure catalog — built from data, categorized, with severity meta', function (ck) {
  var s = new Stack('hot_full_power');
  var cat = s.layer.getFailureCatalog();
  var sgtr = cat.find(function (e) { return e.id === 'sgtr'; });
  var sensor = cat.find(function (e) { return e.id === 'tavg_sensor_failure'; });
  var cats = {}; cat.forEach(function (e) { cats[e.category] = true; });
  ck('catalog non-empty', cat.length, cat.length >= 20, '≥ 20');
  ck('sgtr categorized coolant + has severity_meta', sgtr && sgtr.category + '/' + !!sgtr.severity_meta, sgtr && sgtr.category === 'coolant' && !!sgtr.severity_meta, 'coolant/true');
  ck('instrument failure categorized', sensor && sensor.category, sensor && sensor.category === 'instrument', 'instrument');
  ck('uses the documented category set', Object.keys(cats).join(','),
    Object.keys(cats).every(function (c) { return ['reactivity', 'coolant', 'power', 'instrument', 'safety_system'].indexOf(c) !== -1; }), 'valid categories');
}));

T.push(test('Save / restore — layer runtime state round-trips', function (ck) {
  var s = new Stack('hot_full_power', 7);
  s.run(1);
  s.cmd({ action: 'inject_failure', failure_id: 'sgtr', severity: 0.4 });
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'stuck', value: 320 });
  s.run(1);
  s.cmd({ action: 'acknowledge_alarm', alarm_id: 'high_tavg' });
  var snap = s.layer.saveState();
  // Mutate, then restore.
  s.cmd({ action: 'clear_all_failures' });
  s.layer.register = 'industry';
  s.layer.loadState(snap);
  ck('register restored', s.layer.register, s.layer.register === 'learning', 'learning');
  ck('active failure + severity restored', JSON.stringify(s.layer.getActiveFailures()), s.layer.getActiveFailures().length === 1 && Math.abs(s.layer.getActiveFailures()[0].severity - 0.4) < 1e-9, '[{sgtr,0.4}]');
  ck('alarm ack state restored', s.alarm('high_tavg').state, s.alarm('high_tavg').state === 'active_acknowledged', 'active_acknowledged');
}));

T.push(test('Interlock — rod withdrawal blocked on high startup rate (HR1: reads the instrument)', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(1);
  var ok = s.cmd({ action: 'rod_start', group_id: 'control_rods', direction: 1, speed: 'slow' });
  ck('withdrawal free with SUR normal', JSON.stringify(ok), !(ok && ok.type === 'blocked'), 'not blocked');
  s.cmd({ action: 'rod_stop_all' });
  // Force the SUR INSTRUMENT high (truth stays calm) — the interlock must follow
  // the indication, like every other automatic decision (HR1).
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'startup_rate', mode: 'stuck', value: 4.0 });
  s.run(0.5);
  var b1 = s.cmd({ action: 'rod_start', group_id: 'control_rods', direction: 1, speed: 'slow' });
  ck('withdrawal blocked with a labelled refusal', JSON.stringify(b1), b1 && b1.type === 'blocked' && b1.code === 'INTERLOCK', '{type:blocked, code:INTERLOCK}');
  var b2 = s.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: 5 });
  ck('outward nudge blocked too', JSON.stringify(b2), b2 && b2.type === 'blocked', 'blocked');
  var ins = s.cmd({ action: 'rod_start', group_id: 'control_rods', direction: -1, speed: 'slow' });
  ck('INSERTION always works (withdrawal_only)', JSON.stringify(ins), !(ins && ins.type === 'blocked'), 'not blocked');
  s.cmd({ action: 'rod_stop_all' });
  var alarm = s.alarm('sur_high');
  ck('SUR HIGH annunciator explains the block', alarm && alarm.state, alarm && alarm.state !== 'clear', 'active');
  s.cmd({ action: 'clear_instrument_failure', instrument_id: 'startup_rate' });
  s.run(3);   // reading lags back below clears_below (1.5)
  var ok2 = s.cmd({ action: 'rod_start', group_id: 'control_rods', direction: 1, speed: 'slow' });
  ck('interlock clears when the rate settles', JSON.stringify(ok2), !(ok2 && ok2.type === 'blocked'), 'not blocked');
  s.cmd({ action: 'rod_stop_all' });
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
