/*
 * run_bwr.js — Node CLI runner for the BWR §18 scenario suite.
 *
 *   node test/run_bwr.js            run all tests, print expected-vs-observed
 *   node test/run_bwr.js <name>     run one test by key (e.g. flagship_fukushima)
 *
 * Global-namespace scripts attach to globalThis.RD; require() executes them.
 * Load order: config → protection → vessel → recirculation → safety_systems →
 * instruments → engine (engine captures RD.bwr* helper namespaces at IIFE-eval).
 */
'use strict';
var path = require('path');
function load(p) { require(path.join(__dirname, '..', p)); }

[
  'engines/load_mode.js',
  'engines/bwr/bwr_config.js',
  'engines/bwr/bwr_protection.js',
  'engines/bwr/bwr_vessel.js',
  'engines/bwr/bwr_recirculation.js',
  'engines/bwr/bwr_safety_systems.js',
  'engines/bwr/bwr_instruments.js',
  'engines/bwr/bwr_engine.js',
].forEach(load);

var RD = globalThis.RD;
var only = process.argv[2];

var results;
if (only && RD.BWRScenarioTests[only]) results = [RD.BWRScenarioTests[only]()];
else results = RD.BWRScenarioTests.runAll();

var GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', RST = '\x1b[0m', BOLD = '\x1b[1m';
var passCount = 0, failCount = 0;

results.forEach(function (r) {
  var head = r.pass ? GREEN + 'PASS' + RST : RED + 'FAIL' + RST;
  console.log('\n' + head + '  ' + BOLD + r.name + RST);
  r.checks.forEach(function (c) {
    var mark = c.pass ? GREEN + '  ✓' + RST : RED + '  ✗' + RST;
    var line = mark + ' ' + c.desc;
    if (!c.pass) line += DIM + '  [expected ' + c.expected + ', observed ' + c.observed + ']' + RST;
    else line += DIM + '  (' + c.observed + ')' + RST;
    console.log(line);
    if (c.pass) passCount++; else failCount++;
  });
});

var suitePass = results.filter(function (r) { return r.pass; }).length;
console.log('\n' + BOLD + '──────────────────────────────────────────' + RST);
console.log(BOLD + 'Suites: ' + suitePass + '/' + results.length + RST +
  '   Checks: ' + GREEN + passCount + ' passed' + RST +
  (failCount ? ', ' + RED + failCount + ' failed' + RST : ''));
process.exit(failCount ? 1 : 0);
