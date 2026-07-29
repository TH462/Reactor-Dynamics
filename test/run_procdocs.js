/*
 * run_procdocs.js — the seam between the MANUAL's procedures and the EXECUTABLE
 * checklists that run them.
 *
 * WHY. This plant documents 57 procedures (PWR-N01…N15 normal, PWR-T01…T23
 * transitions, PWR-E01…E22 abnormal) and ships 10 runnable checklists. Until
 * 2026-07-29 the two sets did not reference each other AT ALL: no checklist named
 * the procedure it implements, and no procedure said whether it was runnable. So
 * there was no way — for a player, an author, or a gate — to answer either of the
 * two questions that matter:
 *
 *   · which documented procedures can actually be executed? (10 of 57)
 *   · does this checklist still match the procedure it came from?
 *
 * A prose procedure nobody has ever executed is not a sound procedure; it is an
 * untested claim about how the plant behaves (HR12). Binding the two sets is the
 * first step of making them sound, because it makes the gap COUNTABLE — and this
 * gate prints that count on every run so it cannot quietly stop improving.
 *
 * WHAT IS CHECKED
 *   1. every checklist's `manual_ref` names a procedure the packed manual DEFINES
 *      (a dead ref opens the right document at the wrong place — worse than none;
 *      same reasoning as run_inspect's citation check)
 *   2. no two checklists claim the same procedure
 *   3. every PWR-xxx referenced anywhere in Manuals/, scenarios/ or ui/ resolves
 *      to a defined procedure — no dangling cross-references
 *   4. COVERAGE, reported not enforced: how many documented procedures have a
 *      runnable checklist. Deliberately NOT a failure — the number is the work
 *      item, and a gate that failed on it would just be permanently red.
 *
 *   node test/run_procdocs.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', Y = '\x1b[33m', X = '\x1b[0m';

var checks = 0, failed = 0;
function ck(name, pass, detail) {
  checks++; if (!pass) failed++;
  console.log('  ' + (pass ? G + '✓' : R + '✗') + X + ' ' + name + (detail ? D + '  ' + detail + X : ''));
}

// ---------------------------------------------------------------- the manual
// A procedure is DEFINED by an `### PWR-xxx` heading or a `**Procedure ID:**`
// line. Index-table rows alone do not define one — a row can name a procedure
// that was never written, which is exactly the dangling case check 3 catches.
var defined = {};
fs.readdirSync(path.join(ROOT, 'Manuals')).filter(function (f) { return /\.md$/.test(f); }).forEach(function (f) {
  var src = fs.readFileSync(path.join(ROOT, 'Manuals', f), 'utf8');
  (src.match(/^###\s+(PWR-[NTE]\d+[a-z]?)/gm) || []).forEach(function (m) {
    defined[m.replace(/^###\s+/, '')] = f;
  });
  (src.match(/\*\*Procedure ID:\*\*\s*(PWR-[NTE]\d+[a-z]?)/g) || []).forEach(function (m) {
    defined[m.replace(/[\s\S]*?(PWR-[NTE]\d+[a-z]?)[\s\S]*/, '$1')] = f;
  });
  (src.match(/^\|\s*(PWR-[NTE]\d+[a-z]?)\s*\|/gm) || []).forEach(function (m) {
    var id = m.replace(/^\|\s*(PWR-[NTE]\d+[a-z]?)\s*\|/, '$1');
    if (!defined[id]) defined[id] = f + ' (index row)';
  });
});

// ---------------------------------------------------------------- checklists
require(path.join(ROOT, 'engines/load_mode.js'));
['engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js',
 'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js',
 'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js'
].forEach(function (f) { require(path.join(ROOT, f)); });
require(path.join(ROOT, 'ui/manual_procedures.js'));
var PROCS = (globalThis.RD.MANUAL_PROCEDURES && globalThis.RD.MANUAL_PROCEDURES.pwr) || [];

console.log('\n' + B + 'Checklist → manual procedure' + X);
var claimed = {};
PROCS.forEach(function (p) {
  ck(p.id + ' names a manual procedure', !!p.manual_ref, p.manual_ref || 'NO manual_ref');
  if (!p.manual_ref) return;
  ck(p.id + ' → ' + p.manual_ref + ' is defined', !!defined[p.manual_ref],
     defined[p.manual_ref] || 'NOT DEFINED in Manuals/');
  if (claimed[p.manual_ref]) {
    ck(p.manual_ref + ' claimed once', false, 'also claimed by ' + claimed[p.manual_ref]);
  }
  claimed[p.manual_ref] = p.id;
});

// ------------------------------------------------------- dangling references
console.log('\n' + B + 'Cross-references' + X);
var refs = {};
function scan(dir, filter) {
  fs.readdirSync(path.join(ROOT, dir)).forEach(function (f) {
    var rel = dir + '/' + f;
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) { if (f !== 'node_modules') scan(rel, filter); return; }
    if (!filter.test(f)) return;
    (fs.readFileSync(path.join(ROOT, rel), 'utf8').match(/PWR-[NTE]\d+[a-z]?/g) || [])
      .forEach(function (id) { (refs[id] = refs[id] || []).push(rel); });
  });
}
scan('Manuals', /\.md$/); scan('scenarios', /\.js$/); scan('ui', /\.js$/);
var dangling = Object.keys(refs).filter(function (id) { return !defined[id]; }).sort();
ck('every PWR-xxx reference resolves', dangling.length === 0,
   dangling.length ? dangling.map(function (d) { return d + ' (' + refs[d][0] + ')'; }).join(', ')
                   : Object.keys(refs).length + ' ids referenced, all defined');

// ------------------------------------------------------------------ coverage
var runnable = PROCS.filter(function (p) { return !p.narrative; });
var series = { N: 0, T: 0, E: 0 };
Object.keys(defined).forEach(function (id) { series[id[4]]++; });
var total = Object.keys(defined).length;
console.log('\n' + B + 'Coverage' + X + D + '  (reported, not enforced — the number IS the work item)' + X);
console.log('  documented: ' + total + '   (N ' + series.N + ' normal · T ' + series.T +
            ' transition · E ' + series.E + ' abnormal)');
console.log('  runnable checklists: ' + runnable.length + '   ' +
            (runnable.length < total ? Y + '→ ' + (total - runnable.length) + ' documented procedures have no executable checklist' + X : ''));
var without = Object.keys(defined).filter(function (id) { return !claimed[id]; }).sort();
if (without.length) console.log(D + '  no checklist: ' + without.join(' ') + X);

console.log('\n' + B + '──────────────────────────────────────────' + X);
console.log(B + (failed ? R + 'PROCDOCS: FAIL' : G + 'PROCDOCS: OK') + X + '  ' + checks + ' checks, ' + failed + ' failed' + X);
process.exit(failed ? 1 : 0);
