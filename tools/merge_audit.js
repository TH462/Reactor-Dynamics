/*
 * tools/merge_audit.js — did a merge SILENTLY DROP prose?
 *
 * WHY THIS EXISTS. On 2026-08-03 two lane merges each lost content and NO GATE NOTICED:
 *
 *   1. `run_reachability`'s whole entry vanished from CLAUDE.md's gate-baselines line. That
 *      line is one enormous paragraph every lane appends to, so it is resolved by hand or by
 *      regex, and a splice that eats a segment leaves text that is still valid markdown.
 *      `BASELINES` in run_all.js was untouched, so `run_all` stayed green. Found only by
 *      counting distinct gate entries against each parent — 30, 30, 30, and 29 in the merge.
 *   2. The #238 half of `Manuals/12_SIM_PHYSICS.md` was dropped. `run_manual_rev` could not
 *      see it either: the content digests are RE-SEALED by `stamp_manual_revision.js` after
 *      the edit, so a loss followed by a stamp is perfectly self-consistent.
 *
 * Both are the same shape — **a merge result that is textually fine and factually short** —
 * and the repo's gates all check SCORES, CITATIONS or DIGESTS, none of which notice an
 * absence. This tool checks the one thing they do not: that every structural item present in
 * either parent is still present in the result.
 *
 * WHAT IT CATCHES, AND WHAT IT DOES NOT — measured against both real losses:
 *   · Case 1 IS caught. Run it on cb09eb6 and it reports `run_reachability` missing from
 *     CLAUDE.md, present in parent 9cb056c. It would have stopped that merge.
 *   · **Case 2 is NOT caught.** The #238 restore (dd2adc1) added **zero heading lines** — the
 *     lost 45 lines were body prose inside a section that survived, so every structural item
 *     was still present and this audit sees nothing wrong.
 * So: it covers STRUCTURAL loss — a named entry, heading, row or id that vanishes — and not
 * PARAGRAPH loss inside a surviving section. Half the observed problem, verified rather than
 * assumed. Do not read a green MERGE AUDIT as "the merge kept everything"; read it as "no
 * named thing disappeared". Catching case 2 would need something that survives legitimate
 * deletions, and I do not have a non-noisy idea for it yet.
 *
 * IT IS NOT A `run_*` GATE, deliberately. It needs merge parents, so it has no meaning on a
 * plain checkout and would have nothing to say in `run_all`. Run it as the last step of a
 * lane merge, BEFORE committing — see `.claude/skills/merge-worktrees`.
 *
 * USAGE
 *   node tools/merge_audit.js                  # audit HEAD against its own parents
 *   node tools/merge_audit.js <ref>            # audit a specific merge commit
 *   node tools/merge_audit.js <base> <lane>    # audit the WORKING TREE against two refs
 *
 * Exit 1 if anything a parent had is missing from the result.
 */
'use strict';
var cp = require('child_process'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var R = '\x1b[31m', G = '\x1b[32m', Y = '\x1b[33m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

function sh(cmd) { return cp.execSync(cmd, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
function show(ref, file) {
  try { return ref === null ? fs.readFileSync(path.join(ROOT, file), 'utf8') : sh('git show ' + ref + ':' + file); }
  catch (e) { return null; }   // file absent in that ref — not a loss, a rename or an add
}

/* The INVENTORY. Each entry is a file plus the regex whose matches must survive a merge.
 * These are deliberately STRUCTURAL — names, headings, ids — not prose, so the audit says
 * "this thing is gone" rather than "these words changed". Add a row whenever a new
 * newest-at-top or everyone-appends artifact appears. */
var INVENTORY = [
  ['CLAUDE.md',                      /`(?:run|verify)_[a-z_0-9]+` \*\*/g,     'gate entry'],
  ['Diagnostic/TUNING_LOG.md',       /^## Session log — [0-9a-z-]+/gm,        'session log entry'],
  ['Blueprint/DESIGN_COMPANION.md',  /^\| 8\.[0-9]+ \|/gm,                    'departure register row'],
  ['Blueprint/CURRICULUM.md',        /^### [A-Z][^\n]*/gm,                    'curriculum section'],
  ['Blueprint/DESIGN_CRITERIA.md',   /^#{2,3} [0-9][^\n]*/gm,                 'criteria section'],
  ['CHANGELOG.md',                   /^## \[[^\]]+\]/gm,                      'changelog version heading'],
  ['Manuals/00_REVISION_HISTORY.md', /^\| [0-9]+ \| [0-9-]+ \|/gm,            'revision row'],
  ['test/run_all.js',                /'(?:run|verify)_[a-z_0-9]+\.js':/g,     'BASELINES entry'],
  ['ui/manual_procedures.js',        /id: '[a-z_0-9]+', category:/g,          'authored procedure'],
  ['site/flags.js',                  /'(?:procedure|scenario):[a-z_0-9]+':/g, 'flag registry entry'],
];
// Every manual chapter's section headings, added programmatically.
fs.readdirSync(path.join(ROOT, 'Manuals')).filter(function (f) { return /\.md$/.test(f); })
  .forEach(function (f) { INVENTORY.push(['Manuals/' + f, /^#{2,3} [^\n]+/gm, 'manual heading']); });

function items(text, re) {
  if (text == null) return null;
  var out = {}, m; re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) out[m[0].trim()] = 1;
  return out;
}

var args = process.argv.slice(2), parents, resultRef, label;
if (args.length === 2) { parents = args; resultRef = null; label = 'WORKING TREE'; }
else {
  resultRef = args[0] || 'HEAD';
  var line = sh('git rev-list --parents -n 1 ' + resultRef).trim().split(/\s+/);
  if (line.length < 3) { console.error('not a merge commit: ' + resultRef); process.exit(2); }
  parents = line.slice(1); label = sh('git log -1 --format=%h ' + resultRef).trim() + ' ' + sh('git log -1 --format=%s ' + resultRef).trim();
}

console.log('\n' + B + 'MERGE AUDIT' + X + D + '  result: ' + label + X);
console.log(D + '  parents: ' + parents.join('  ') + X + '\n');

var losses = 0, checked = 0;
INVENTORY.forEach(function (row) {
  var file = row[0], re = row[1], kind = row[2];
  var got = items(show(resultRef, file), re);
  if (got == null) return;                       // file not in the result — out of scope here
  var missing = {};
  parents.forEach(function (p) {
    var had = items(show(p, file), re);
    if (!had) return;
    Object.keys(had).forEach(function (k) { if (!(k in got)) missing[k] = p; });
  });
  checked++;
  var keys = Object.keys(missing);
  if (!keys.length) return;
  losses += keys.length;
  console.log(R + '  ✗ ' + file + X + D + '  (' + keys.length + ' ' + kind + (keys.length === 1 ? '' : 's') + ' lost)' + X);
  keys.forEach(function (k) {
    console.log('      ' + Y + k.slice(0, 96) + X + D + '   — present in ' + missing[k].slice(0, 8) + X);
  });
});

console.log('\n' + B + '──────────────────────────────────────────' + X);
if (losses) {
  console.log(B + R + 'MERGE AUDIT: ' + losses + ' ITEM' + (losses === 1 ? '' : 'S') + ' LOST' + X +
    D + '  across ' + checked + ' artifacts' + X);
  console.log(D + '  Each line above existed in a parent and is absent from the result. Restore it\n' +
              '  from that parent before committing — no other gate will tell you.' + X);
  process.exit(1);
}
console.log(B + G + 'MERGE AUDIT: OK' + X + D + '  ' + checked + ' artifacts, nothing dropped' + X);
