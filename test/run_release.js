/* run_release.js — static guard for RELEASE BOOKKEEPING.
 *
 *   node test/run_release.js
 *
 * WHY THIS EXISTS. Three files have to say the same thing about what version shipped:
 *
 *   site/release.js   window.RD_RELEASE — the string the app and both bundlers read, and
 *                     since #275 also the name the offline download saves itself under
 *   changelog.html    the player-facing entry: version, date, what changed
 *   CHANGELOG.md      the developer record, whose `## [Unreleased]` heading is supposed to
 *                     be renamed to the shipped version at the merge
 *
 * The first two are load-bearing — get them wrong and someone notices, because the version
 * is on screen. The third is not: `## [Unreleased]` is a perfectly ordinary-looking heading
 * whether or not it still describes unreleased work, and NOTHING downstream reads it. So it
 * was simply skipped, twice: Alpha 1.10.0 and Alpha 1.11.0 both shipped with their entries
 * still sitting under [Unreleased], 434 lines of two releases' work filed as not-yet-released,
 * and the newest version heading in the file reading 1.9.0. Nobody noticed for a day, and it
 * would have compounded every release after that, because the longer it goes the harder the
 * boundaries are to reconstruct — by the third release it takes a tag diff to work out which
 * entry belonged to which version.
 *
 * A note in CLAUDE.md and a step in the release skill already told people to do it. They are
 * what failed. This is the gate.
 *
 * SHAPE. Static and total: it reads three files, parses no plant and steps nothing. Same
 * report convention as run_portable.js / run_hardrules.js — a check carries either a reason
 * it passed or nothing, and nothing is a violation.
 *
 * WHAT IT DOES NOT COVER. Whether the entries are *accurate* or in the right section, and
 * whether the version digit chosen matches the significance of what shipped (CLAUDE.md's
 * Platform.Feature.Refinement rule) — both are judgement, and neither is parseable. It pins
 * the bookkeeping, which is the part that failed on its own.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

var findings = [], violations = [];
function check(rule, where, text, why) {
  var f = { rule: rule, where: where, text: text, why: why };
  findings.push(f);
  if (!why) violations.push(f);
  return f;
}

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

// ---------------------------------------------------------------- parse the three files

// -- site/release.js: the one hand-edited version string ------------------------
var relSrc = read('site/release.js');
var relM = /RD_RELEASE\s*=\s*"([^"]+)"/.exec(relSrc);
var RELEASE = relM ? relM[1] : null;
check('VERSION', 'site/release.js', 'RD_RELEASE = ' + JSON.stringify(RELEASE),
  RELEASE && /^Alpha \d+\.\d+\.\d+$/.test(RELEASE)
    ? 'a full Alpha X.Y.Z — the download names itself from this' : null);

// -- changelog.html: the player-facing entries ----------------------------------
// Comments are stripped FIRST. The file carries a fully-formed "Alpha 1.5.0" specimen entry
// inside the ADDING AN ENTRY comment, and parsing it as real would make the newest published
// version look like 1.5.0 — a gate that reads a template as data is worse than no gate.
var siteHtml = read('changelog.html').replace(/<!--[\s\S]*?-->/g, '');
var siteEntries = [];
var reSite = /log-ver mono">([^<]+)<[\s\S]*?datetime="([^"]+)">([^<]+)</g, sm;
while ((sm = reSite.exec(siteHtml)) !== null) {
  siteEntries.push({ ver: sm[1].trim(), iso: sm[2].trim(), shown: sm[3].trim() });
}

// -- CHANGELOG.md: the developer record -----------------------------------------
var mdSrc = read('CHANGELOG.md');
var mdHeads = [], mm;
var reMd = /^## \[([^\]]+)\](?:\s*—\s*(.+))?$/gm;
while ((mm = reMd.exec(mdSrc)) !== null) {
  mdHeads.push({ raw: mm[1].trim(), date: (mm[2] || '').trim(), at: mm.index });
}
var unreleased = mdHeads.filter(function (h) { return h.raw === 'Unreleased'; });
// "Alpha 1.6.1 and earlier" is a deliberate catch-all for the pre-history and is not a
// version heading — it has no single version and no single date.
var mdVers = mdHeads.filter(function (h) { return /^Alpha \d+\.\d+\.\d+$/.test(h.raw); });

// ---------------------------------------------------------------- A. changelog.html
check('SITE', 'changelog.html', 'published entries found (' + siteEntries.length + ')',
  siteEntries.length ? 'outside the ADDING AN ENTRY template comment' : null);

var topSite = siteEntries[0];
check('SITE', 'changelog.html', 'newest entry is ' + (topSite ? topSite.ver : '<none>'),
  topSite && topSite.ver === RELEASE ? 'agrees with site/release.js' : null);

// The date is written twice on purpose — machine-readable and human-readable — and the two
// are edited by hand in the same tag, which is exactly where a copy-paste from the entry
// above survives unnoticed.
var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
              'August', 'September', 'October', 'November', 'December'];
function isoFromShown(s) {
  var m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(s);
  if (!m) return null;
  var mi = MONTHS.indexOf(m[2]);
  if (mi < 0) return null;
  return m[3] + '-' + String(mi + 1).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');
}
siteEntries.forEach(function (e) {
  if (isoFromShown(e.shown) === e.iso) return;   // silent on agreement; report only breaks
  check('SITE', 'changelog.html', e.ver + ': shown "' + e.shown + '" vs datetime="' + e.iso + '"', null);
});
check('SITE', 'changelog.html', 'every visible date matches its datetime attribute (' +
  siteEntries.length + ' entries)',
  siteEntries.every(function (e) { return isoFromShown(e.shown) === e.iso; }) ? 'agree' : null);

function verKey(v) {
  var p = /(\d+)\.(\d+)\.(\d+)/.exec(v);
  return p ? (+p[1]) * 1e6 + (+p[2]) * 1e3 + (+p[3]) : -1;
}
function descending(list, get) {
  for (var i = 1; i < list.length; i++) {
    if (verKey(get(list[i - 1])) <= verKey(get(list[i]))) return get(list[i]);
  }
  return null;
}
var siteOOO = descending(siteEntries, function (e) { return e.ver; });
check('SITE', 'changelog.html', 'entries are newest-first',
  siteOOO ? null : 'strictly descending — a new entry went to the top, as the file says');

// ---------------------------------------------------------------- B. CHANGELOG.md
check('MD', 'CHANGELOG.md', 'exactly one ## [Unreleased] (' + unreleased.length + ')',
  unreleased.length === 1 ? 'the single landing place for work in flight' : null);

check('MD', 'CHANGELOG.md', '[Unreleased] sits above every version heading',
  unreleased.length === 1 && mdVers.every(function (h) { return h.at > unreleased[0].at; })
    ? 'newest-first, and unreleased is newer than anything released' : null);

// THE CHECK THIS GATE EXISTS FOR. Rolling the heading is the step that was skipped, and
// skipping it leaves a file that parses, reads plausibly, and is wrong.
var topMd = mdVers[0];
check('MD', 'CHANGELOG.md', 'newest version heading is ' + (topMd ? topMd.raw : '<none>') +
  ' (release.js says ' + RELEASE + ')',
  topMd && topMd.raw === RELEASE
    ? 'the shipped release has been rolled out of [Unreleased]'
    : null);

var mdOOO = descending(mdVers, function (h) { return h.raw; });
check('MD', 'CHANGELOG.md', 'version headings are newest-first',
  mdOOO ? null : 'strictly descending');

var badDate = mdVers.filter(function (h) { return !/^\d{4}-\d{2}-\d{2}$/.test(h.date); });
check('MD', 'CHANGELOG.md', 'every version heading carries an ISO date (' +
  mdVers.length + ' headings)',
  badDate.length === 0 ? 'YYYY-MM-DD' : null);
badDate.forEach(function (h) {
  check('MD', 'CHANGELOG.md', h.raw + ': date is ' + JSON.stringify(h.date), null);
});

// ---------------------------------------------------------------- C. the two must agree
// Only down to the oldest version CHANGELOG.md still names individually: below that it
// collapses into an "Alpha 1.6.1 and earlier" catch-all, on purpose, and demanding a heading
// per site entry there would be asking the gate to undo a deliberate summarisation.
var floor = mdVers.length ? verKey(mdVers[mdVers.length - 1].raw) : Infinity;
var mdByVer = {};
mdVers.forEach(function (h) { mdByVer[h.raw] = h; });

siteEntries.filter(function (e) { return verKey(e.ver) >= floor; }).forEach(function (e) {
  var h = mdByVer[e.ver];
  check('CROSS', e.ver, h ? 'CHANGELOG.md ' + h.date + ' vs changelog.html ' + e.iso
                          : 'published on the site, absent from CHANGELOG.md',
    h ? (h.date === e.iso ? 'same date in both' : null) : null);
});

// ---------------------------------------------------------------- report
var byRule = {};
findings.forEach(function (f) { (byRule[f.rule] = byRule[f.rule] || []).push(f); });
['VERSION', 'SITE', 'MD', 'CROSS'].forEach(function (r) {
  var all = byRule[r] || [], bad = all.filter(function (f) { return !f.why; });
  if (!all.length) return;
  console.log('\n' + B + (bad.length ? R + 'FAIL' : G + 'PASS') + X + '  ' + B + r + X +
    D + '  (' + all.length + ' check' + (all.length === 1 ? '' : 's') + ', ' +
    bad.length + ' failed)' + X);
  bad.forEach(function (f) {
    console.log(R + '  ✗' + X + ' ' + f.where + D + '  ' + f.text + X);
  });
});

var bad = violations.length;
console.log('\n' + B + '──────────────────────────────────────────' + X);
console.log(B + (bad ? R + 'RELEASE BOOKKEEPING: FAIL' : G + 'RELEASE BOOKKEEPING: OK') + X +
  '  ' + findings.length + ' checks, ' + bad + ' failed' + D + '  ·  ' + RELEASE +
  ', ' + siteEntries.length + ' published entries, ' + mdVers.length +
  ' version headings' + X);
if (bad) {
  console.log(D + 'At a release: bump site/release.js, add the changelog.html entry, and RENAME\n' +
    'CHANGELOG.md\'s "## [Unreleased]" to "## [' + RELEASE + '] — YYYY-MM-DD" with a\n' +
    'fresh empty [Unreleased] above it. See CLAUDE.md, "Website changelog & version numbers".' + X);
}
process.exit(bad ? 1 : 0);
