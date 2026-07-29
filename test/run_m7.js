/*
 * run_m7.js — drives the Test Runner (M7) against the assembled PWR stack.
 *
 * Two parts:
 *  1. POSITIVE — run the full Test Runner against the correctly-wired stack;
 *     every integration check must pass (this IS the assembled-system gate).
 *  2. NEGATIVE (teeth) — sabotage the wiring so trips read TRUE state instead of
 *     instruments (an HR1 violation), and confirm the protection-boundary suite
 *     CATCHES it. A gate that can't fail proves nothing.
 *
 *   node test/run_m7.js
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
  'layers/test_runner.js',
].forEach(load);
var RD = globalThis.RD;

var GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', RST = '\x1b[0m', BOLD = '\x1b[1m', YEL = '\x1b[33m';

function newStack(seed) {
  var s = new RD.SimulationService({ seed: seed != null ? seed : 42 });
  s.selectPlant('pwr', 'hot_full_power', null);
  return s;
}

// ---------------------------------------------------------------- 1. POSITIVE
console.log(BOLD + 'M7 Test Runner — full-stack integration gate (PWR + M4 + M5 + M6·PH)' + RST);
var tr = new RD.TestRunner(newStack());
var curSuite = null;
var summary = tr.runAll(function (r) {
  if (r.suite !== curSuite) { curSuite = r.suite; console.log('\n' + BOLD + r.suite + RST); }
  var mark = r.passed ? GREEN + '  ✓' + RST : RED + '  ✗' + RST;
  var line = mark + ' ' + r.check;
  if (!r.passed) line += DIM + '  [expected ' + r.expected + ', observed ' + r.observed + ' — ' + r.fix_hint + ']' + RST;
  else line += DIM + '  (' + r.observed + ')' + RST;
  console.log(line);
});
console.log('\n' + BOLD + 'Positive: ' + summary.passed + '/' + summary.total + ' checks across ' + summary.suites.length + ' suites' + RST +
  (summary.ok ? GREEN + '  ALL PASS' + RST : RED + '  ' + summary.failed + ' FAILED' + RST));

// ---------------------------------------------------------------- 2. NEGATIVE
console.log('\n' + BOLD + YEL + 'Teeth check — sabotage HR1 (trips read TRUE state) and confirm M7 catches it' + RST);
var origEvalTrips = RD.ControlFailureLayer.prototype._evalTrips;
RD.ControlFailureLayer.prototype._evalTrips = function (ins) {
  // SABOTAGE: read true state instead of instruments — the exact HR1 violation
  // the protection-boundary checks exist to catch.
  var ts = this.engine.getTrueState();
  var map = { power_range: 'power_pct', tavg: 'tavg_c', primary_pressure: 'pressure_mpa', pzr_level: 'pzr_level_pct', sg_level: 'sg_level_pct',
              rcs_flow: 'pump_flow_pct' };   // #247 — was the `__true_flow__` sentinel; now a real instrument with a true-state twin
  var trips = this.config.trips || [];
  for (var i = 0; i < trips.length; i++) {
    var t = trips[i];
    var v = ts[map[t.instrument]];
    if (v == null) continue;
    var hit = (t.direction === 'high') ? v > t.setpoint : (t.direction === 'low') ? v < t.setpoint : false;
    if (hit && !this.rps.scrammed) { this.rps.scrammed = true; this.rps.last_trip_reason = t.instrument + ' ' + t.direction; this.handleCommand({ action: 'scram' }); }
  }
};
var trBad = new RD.TestRunner(newStack());
var bad = trBad.runSuite('protection_boundary', function (r) {
  var mark = r.passed ? GREEN + '  ✓' + RST : YEL + '  ✗(caught)' + RST;
  console.log(mark + ' ' + r.check + (r.passed ? '' : DIM + '  [' + r.fix_hint + ']' + RST));
});
RD.ControlFailureLayer.prototype._evalTrips = origEvalTrips; // restore

var caught = bad.failed > 0;
console.log(BOLD + 'Negative: protection_boundary reported ' + bad.failed + ' failure(s) under sabotage' + RST +
  (caught ? GREEN + '  CAUGHT' + RST : RED + '  MISSED (the gate has no teeth!)' + RST));

// ---------------------------------------------------------------- verdict
var ok = summary.ok && caught;
console.log('\n' + BOLD + '──────────────────────────────────────────' + RST);
console.log(BOLD + (ok ? GREEN + 'M7 OK' + RST + BOLD + ' — stack wired correctly AND the gate has teeth' : RED + 'M7 PROBLEM' + RST) + RST);
process.exit(ok ? 0 : 1);
