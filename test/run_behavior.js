/*
 * run_behavior.js — Node CLI runner for the PWR BEHAVIOR BATTERY
 * (test/behavior_pwr.js): the spec layer above the regression gates. Every
 * probe asserts bands from Blueprint/PWR_BEHAVIOR_CATALOG.md (real-plant
 * ground truth), not from what the sim happened to do yesterday.
 *
 *   node test/run_behavior.js            run the battery
 *   node test/run_behavior.js SS-1       run one probe by catalog ID
 *
 * Gate semantics (strict xfail, same spirit as run_procedures KNOWN_FAILS):
 *   - probe passes, not in XFAIL         → PASS (green)
 *   - probe fails,  in XFAIL             → XFAIL (yellow, expected — gate stays green)
 *   - probe fails,  NOT in XFAIL         → FAIL (red)
 *   - probe passes, in XFAIL             → XPASS (red — the annotation went stale;
 *                                          remove the XFAIL entry to re-green)
 *
 * Side effects of a full run:
 *   Diagnostic/behavior_results.json     raw results
 *   Diagnostic/BEHAVIOR_GAP_REPORT.md    observed-vs-expected for every XFAIL/FAIL
 *                                        + coverage todo list — the tuning packet.
 */
'use strict';
var path = require('path');
var fs = require('fs');
function load(p) { require(path.join(__dirname, '..', p)); }

[
  'engines/load_mode.js',
  'engines/pwr/pwr_config.js',
  'layers/control/pwr_control.js',
  'engines/pwr/pwr_thermal.js',
  'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_pressurizer2.js',
  'engines/pwr/pwr_primary.js',
  'engines/pwr/pwr_steam_generator.js',
  'engines/pwr/pwr_instruments.js',
  'engines/pwr/pwr_engine.js',
  'layers/control/control_kernel.js',
  'test/ops_harness.js',
  'test/behavior_pwr.js',
].forEach(load);

var RD = globalThis.RD;
var B = RD.BehaviorPWR;

var GREEN = '\x1b[32m', RED = '\x1b[31m', YEL = '\x1b[33m', DIM = '\x1b[2m',
    CYAN = '\x1b[36m', RST = '\x1b[0m', BOLD = '\x1b[1m';

/* THE BATTERY IS SPLIT ACROSS THREE RUNNERS (#513, owner-approved "2-3 siblings"). This
 * file is part A; run_behavior_b.js and run_behavior_c.js are parts B and C of the SAME
 * battery — probe ids interleaved modulo 3, so the parts stay balanced without a
 * hand-maintained list (halves measured 174/256 s; the heavy probes cluster). The single
 * 398.8 s runner was the whole aggregate gate's wall-time floor (makespan = the longest
 * job, run_all.js:2346), and a partition across processes is a scheduling change, not a
 * test change: every probe still runs, under the same strict-xfail semantics, and each
 * part scores against its own BASELINES entry. `node test/run_behavior.js <ID>` still
 * runs ANY probe by id, whichever part owns it. */
var PART = globalThis.__BEHAVIOR_PART || 0;
var PART_COUNT = 3;
var PART_NAME = ['A', 'B', 'C'][PART];
var idArg = process.argv[2];
var tStart = Date.now();
var results = idArg
  ? (B.probes[idArg] ? [(function () { var r = B.probes[idArg](); r.id = idArg; return r; })()]
     : (console.log('unknown probe id: ' + idArg), process.exit(2)))
  : Object.keys(B.probes).filter(function (id, i) { return i % PART_COUNT === PART; })
      .map(function (id) { var r = B.probes[id](); r.id = id; return r; });
var secs = ((Date.now() - tStart) / 1000).toFixed(1);

var nPass = 0, nXfail = 0, nFail = 0, nXpass = 0;
var gapRows = [];

console.log('\n' + BOLD + '════════ PWR BEHAVIOR BATTERY (catalog ' + B.CATALOG_VERSION +
  ') — part ' + PART_NAME + ' ════════' + RST + DIM + '  (' + secs + 's wall)' + RST);

results.forEach(function (r) {
  var expected = Object.prototype.hasOwnProperty.call(B.XFAIL, r.id);
  var verdict, color;
  if (r.pass && !expected)       { verdict = 'PASS';  color = GREEN; nPass++; }
  else if (!r.pass && expected)  { verdict = 'XFAIL'; color = YEL;   nXfail++; }
  else if (!r.pass && !expected) { verdict = 'FAIL';  color = RED;   nFail++; }
  else                           { verdict = 'XPASS'; color = RED;   nXpass++; }

  console.log('\n' + color + BOLD + verdict + RST + '  ' + BOLD + r.name + RST +
    (expected ? DIM + '  [known: ' + B.XFAIL[r.id] + ']' + RST : ''));
  r.checks.forEach(function (c) {
    var mark = c.info ? CYAN + '  ▸' + RST : (c.pass ? GREEN + '  ✓' + RST : (expected ? YEL : RED) + '  ✗' + RST);
    var line = mark + ' ' + c.desc;
    if (c.info) line += DIM + '  = ' + c.observed + RST;
    else if (!c.pass) line += DIM + '  [expected ' + c.expected + ', observed ' + c.observed + ']' + RST;
    else line += DIM + '  (' + c.observed + ')' + RST;
    console.log(line);
  });

  if (!r.pass || verdict === 'XPASS') {
    gapRows.push({ id: r.id, name: r.name, verdict: verdict, known: expected ? B.XFAIL[r.id] : null,
      failed: r.checks.filter(function (c) { return !c.info && !c.pass; }),
      infos: r.checks.filter(function (c) { return c.info; }) });
  }
});

// Coverage todo list — never let a catalog ID go silently uncovered.
var todos = Object.keys(B.COVERAGE).filter(function (k) { return B.COVERAGE[k].indexOf('todo') === 0; });

console.log('\n' + BOLD + '──────────────────────────────────────────' + RST);
console.log(BOLD + 'Probes: ' + RST + GREEN + nPass + ' pass' + RST +
  ', ' + YEL + nXfail + ' xfail (known gaps)' + RST +
  (nFail ? ', ' + RED + nFail + ' FAIL' + RST : '') +
  (nXpass ? ', ' + RED + nXpass + ' XPASS (stale annotation)' + RST : ''));
if (todos.length) {
  console.log(DIM + 'coverage todo (' + todos.length + '): ' + todos.map(function (k) {
    return k + ' — ' + B.COVERAGE[k].replace(/^todo\s*/, '').replace(/^\(|\)$/g, '');
  }).join('; ') + RST);
}

// -------------------------------------------------------- gap report (full run)
// Per-part artifacts (#513): part A keeps the legacy filenames so every existing pointer
// stays valid; parts B/C write the _B/_C pairs. Each report names its siblings.
if (!idArg) {
  var diagDir = path.join(__dirname, '..', 'Diagnostic');
  var sfx = PART === 0 ? '' : PART === 1 ? '_b' : '_c';
  var resName = 'behavior_results' + sfx + '.json';
  var gapName = 'BEHAVIOR_GAP_REPORT' + sfx.toUpperCase() + '.md';
  var sibling = ['BEHAVIOR_GAP_REPORT.md', 'BEHAVIOR_GAP_REPORT_B.md', 'BEHAVIOR_GAP_REPORT_C.md']
    .filter(function (n) { return n !== gapName; }).join('`, `');
  try {
    fs.mkdirSync(diagDir, { recursive: true });
    fs.writeFileSync(path.join(diagDir, resName), JSON.stringify(results, null, 1));

    var md = [];
    md.push('# PWR Behavior Gap Report — the tuning packet (part ' + PART_NAME + ' of ' + PART_COUNT + ')');
    md.push('');
    md.push('Auto-generated by `node test/run_behavior' + sfx + '.js` from the behavior battery.');
    md.push('The battery is split across three runners (#513, probe ids modulo 3) —');
    md.push('**this report covers only part ' + PART_NAME + '; the other parts are `' + sibling + '`.**');
    md.push('Ground truth: `Blueprint/PWR_BEHAVIOR_CATALOG.md` (' + B.CATALOG_VERSION + '). Do not hand-edit;');
    md.push('re-run the battery to refresh. Each row is a catalog behavior the sim does');
    md.push('not yet exhibit — observed vs required, with the catalog §8 decision that');
    md.push('covers the fix.');
    md.push('');
    md.push('Battery result: ' + nPass + ' pass, ' + nXfail + ' known gaps (xfail)' +
      (nFail ? ', ' + nFail + ' UNEXPECTED FAIL' : '') +
      (nXpass ? ', ' + nXpass + ' XPASS (stale annotation)' : '') + '.');
    md.push('');
    if (!gapRows.length) {
      md.push('**No gaps — the battery is fully green. The tuning pass is complete.**');
    }
    gapRows.forEach(function (g) {
      md.push('## ' + g.id + ' — ' + g.name + (g.verdict !== 'XFAIL' ? '  (' + g.verdict + ')' : ''));
      if (g.known) md.push('*Known gap:* ' + g.known);
      md.push('');
      g.failed.forEach(function (c) {
        md.push('- **' + c.desc + '** — required `' + c.expected + '`, observed `' + c.observed + '`');
      });
      g.infos.forEach(function (c) {
        md.push('- measurement: ' + c.desc + ' = `' + c.observed + '`');
      });
      md.push('');
    });
    if (todos.length) {
      md.push('## Not yet probed (coverage todo)');
      md.push('');
      todos.forEach(function (k) { md.push('- **' + k + '** — ' + B.COVERAGE[k]); });
      md.push('');
    }
    var gapPath = path.join(diagDir, gapName);
    fs.writeFileSync(gapPath, md.join('\n'));
    console.log(DIM + 'gap report → ' + gapPath + RST);
  } catch (e) { console.log(DIM + 'report write skipped: ' + e.message + RST); }
}

process.exit((nFail || nXpass) ? 1 : 0);
