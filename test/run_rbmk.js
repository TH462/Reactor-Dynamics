/*
 * run_rbmk.js — Node CLI runner for the RBMK §19 scenario suite.
 *
 *   node test/run_rbmk.js            run all tests, print expected-vs-observed
 *   node test/run_rbmk.js <name>     run one test by key (e.g. flagship_pre)
 *
 * The engine files are global-namespace scripts that attach to globalThis.RD;
 * require() executes them and they share globalThis. Load order (BUILD_DECISIONS
 * cross-cutting): protection → config → kinetics → thermal → rods → instruments
 * → engine. (protection before config so forVersion() can stitch protection in.)
 */
'use strict';
var path = require('path');
function load(p) { require(path.join(__dirname, '..', p)); }

[
  'engines/rbmk/rbmk_protection.js',
  'engines/rbmk/rbmk_config.js',
  'engines/rbmk/rbmk_kinetics.js',
  'engines/rbmk/rbmk_thermal.js',
  'engines/rbmk/rbmk_rods.js',
  'engines/rbmk/rbmk_instruments.js',
  'engines/rbmk/rbmk_engine.js',
].forEach(load);

var RD = globalThis.RD;
var only = process.argv[2];

var results;
if (only && RD.RBMKScenarioTests[only]) results = [RD.RBMKScenarioTests[only]()];
else results = RD.RBMKScenarioTests.runAll();

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
