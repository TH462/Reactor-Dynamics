/*
 * run_ops.js — Node CLI runner for the external OPERATIONS suites (ops_pwr /
 * ops_rbmk / ops_bwr on the ops_harness): realistic plant evolutions and
 * player-abuse sequences, run with the engine UNDER the real Control & Failure
 * Layer (M4). Distinct from the engine acceptance suites (run_pwr etc.).
 *
 *   node test/run_ops.js                 run everything
 *   node test/run_ops.js pwr             one plant (pwr | rbmk | bwr)
 *   node test/run_ops.js pwr ops_sgtr_managed    one test
 *   node test/run_ops.js --json <path>   also dump results JSON (default
 *                                        Diagnostic/ops_results.json)
 */
'use strict';
var path = require('path');
var fs = require('fs');
function load(p) { require(path.join(__dirname, '..', p)); }

[
  'engines/load_mode.js',
  // PWR
  'engines/pwr/pwr_config.js',
  'layers/control/pwr_control.js',
  'engines/pwr/pwr_thermal.js',
  'engines/pwr/pwr_pressurizer.js',
  'engines/pwr/pwr_primary.js',
  'engines/pwr/pwr_steam_generator.js',
  'engines/pwr/pwr_instruments.js',
  'engines/pwr/pwr_engine.js',
  // RBMK (protection before config so forVersion() can stitch protection in)
  'layers/control/rbmk_control.js',
  'engines/rbmk/rbmk_config.js',
  'engines/rbmk/rbmk_kinetics.js',
  'engines/rbmk/rbmk_thermal.js',
  'engines/rbmk/rbmk_rods.js',
  'engines/rbmk/rbmk_instruments.js',
  'engines/rbmk/rbmk_engine.js',
  // BWR
  'engines/bwr/bwr_config.js',
  'layers/control/bwr_control.js',
  'engines/bwr/bwr_vessel.js',
  'engines/bwr/bwr_recirculation.js',
  'engines/bwr/bwr_safety_systems.js',
  'engines/bwr/bwr_instruments.js',
  'engines/bwr/bwr_engine.js',
  // M4 + harness + suites
  'layers/control/control_kernel.js',
  'test/ops_harness.js',
  'test/ops_pwr.js',
  'test/ops_rbmk.js',
  'test/ops_bwr.js',
].forEach(load);

var RD = globalThis.RD;
var SUITES = { pwr: RD.OpsTestsPWR, rbmk: RD.OpsTestsRBMK, bwr: RD.OpsTestsBWR };

var args = process.argv.slice(2).filter(function (a) { return a !== '--json'; });
var wantJson = process.argv.indexOf('--json') !== -1;
var jsonPath = path.join(__dirname, '..', 'Diagnostic', 'ops_results.json');
var plantArg = args[0], testArg = args[1];

var GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', CYAN = '\x1b[36m', RST = '\x1b[0m', BOLD = '\x1b[1m';
var passCount = 0, failCount = 0, all = {};

Object.keys(SUITES).forEach(function (plant) {
  if (plantArg && plantArg !== plant) return;
  var suite = SUITES[plant];
  var results;
  var tStart = Date.now();
  if (testArg && suite[testArg]) results = [suite[testArg]()];
  else if (testArg) return;
  else results = suite.runAll();
  var secs = ((Date.now() - tStart) / 1000).toFixed(1);
  all[plant] = results;

  console.log('\n' + BOLD + '════════ ' + plant.toUpperCase() + ' operations suite ════════' + RST + DIM + '  (' + secs + 's wall)' + RST);
  results.forEach(function (r) {
    var head = r.pass ? GREEN + 'PASS' + RST : RED + 'FAIL' + RST;
    console.log('\n' + head + '  ' + BOLD + r.name + RST);
    r.checks.forEach(function (c) {
      var mark = c.info ? CYAN + '  ▸' + RST : (c.pass ? GREEN + '  ✓' + RST : RED + '  ✗' + RST);
      var line = mark + ' ' + c.desc;
      if (c.info) line += DIM + '  = ' + c.observed + RST;
      else if (!c.pass) line += DIM + '  [expected ' + c.expected + ', observed ' + c.observed + ']' + RST;
      else line += DIM + '  (' + c.observed + ')' + RST;
      console.log(line);
      if (!c.info) { if (c.pass) passCount++; else failCount++; }
    });
  });
});

var suitesRun = Object.keys(all);
var suitePass = 0, suiteTotal = 0;
suitesRun.forEach(function (p) {
  all[p].forEach(function (r) { suiteTotal++; if (r.pass) suitePass++; });
});
console.log('\n' + BOLD + '──────────────────────────────────────────' + RST);
console.log(BOLD + 'Scenarios: ' + suitePass + '/' + suiteTotal + RST +
  '   Checks: ' + GREEN + passCount + ' passed' + RST +
  (failCount ? ', ' + RED + failCount + ' failed' + RST : ''));

if (wantJson || !plantArg) {
  try {
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(all, null, 1));
    console.log(DIM + 'results JSON → ' + jsonPath + RST);
  } catch (e) { console.log(DIM + 'JSON write skipped: ' + e.message + RST); }
}
process.exit(failCount ? 1 : 0);
