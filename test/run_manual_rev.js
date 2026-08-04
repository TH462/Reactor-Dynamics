/*
 * run_manual_rev.js — the manual set's revision-history gate.
 *
 * WHY THIS EXISTS. On 2026-07-30 the revision history was audited and found to have stopped
 * being written. SIX content changes had landed in the chapters with no row in the table:
 * #247 and #248 (the low-flow trip), #251 (pump-heat heatup, which re-authored 04 and 05),
 * #260 twice (the density-shaped moderator coefficient, and a new §7.5 ECC table), the gpm
 * display-scale fix, and #263 (the second reactivity anchor). Two weeks of operator-facing
 * numbers changing — heatup timings, trip setpoints, critical boron — with the document
 * whose entire job is to say what changed silent about all of it.
 *
 * Meanwhile ten of thirteen chapters still read "**Revision:** 0" (including 12_SIM_PHYSICS,
 * created at Rev 5 and edited three times since) and README.md read "Revision: 2,
 * 2026-07-16" — six revisions and two weeks behind. Nothing compared any of it, so nothing
 * complained.
 *
 * WHAT IT CHECKS, and the reasoning for each:
 *
 *  1. The table is WELL-FORMED and strictly newest-first, with no duplicate or missing rev
 *     numbers. Rows 0-3 used to sit ASCENDING above a descending 4-8, so "the top of the
 *     table" was ambiguous — which is a large part of why rows stopped being added there.
 *  2. Every chapter and README carry the SET-WIDE revision, equal to the newest row, and
 *     README's date matches that row. One number, mechanically checked, instead of thirteen
 *     hand-maintained ones.
 *  3. CONTENT DIGESTS match — the check that catches the real failure. Editing a chapter
 *     without adding a revision row reddens this. Sealed by tools/stamp_manual_revision.js.
 *  4. CONTENT CANARY — every section a revision row NAMES still exists in the chapter it
 *     names. This is the one a lane merge walks through; see the block at section 4.
 *
 * (3) and (4) are the load-bearing ones, and they catch OPPOSITE failures: (3) is content
 * that changed with no row, (4) is a row whose content went away. (1) and (2) only catch
 * bookkeeping that disagrees with itself; a set can be perfectly self-consistent and still
 * be describing last week's plant.
 *
 * NOT gateable here, and deliberately so: whether a revision row's PROSE is accurate. A row
 * can be well-formed, correctly stamped, digest-sealed, have every section it names present
 * — and still describe the change wrongly — same class as HR10/HR12. This gate proves a
 * change was RECORDED and that what the record POINTS AT is still there; never that the
 * record is true. (4) narrows that boundary rather than crossing it: "does §5.5 exist" is
 * structural, "is what §5.5 says about the clad node correct" is not.
 *
 *   node test/run_manual_rev.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var DIR = path.join(__dirname, '..', 'Manuals');
var HIST = path.join(DIR, '00_REVISION_HISTORY.md');
var G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';
var checks = 0, fails = [];

function ck(desc, ok, detail) {
  checks++;
  if (ok) console.log(G + '  ✓' + X + ' ' + desc + (detail ? D + '  (' + detail + ')' + X : ''));
  else { fails.push(desc + (detail ? ' — ' + detail : '')); console.log(R + '  ✗' + X + ' ' + desc + (detail ? R + '  — ' + detail + X : '')); }
}

console.log(B + 'Manual revision history' + X);

// ---- 1. the table -------------------------------------------------------------
var src = fs.readFileSync(HIST, 'utf8');
var rows = [];
src.split('\n').forEach(function (l) {
  var m = l.match(/^\|\s*(\d+)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.+?)\s*\|\s*([^|]+?)\s*\|\s*$/);
  if (m) rows.push({ rev: parseInt(m[1], 10), date: m[2], desc: m[3], author: m[4] });
});
ck('revision table parses', rows.length > 0, rows.length + ' rows');
if (!rows.length) { report(); }

var revs = rows.map(function (r) { return r.rev; });
ck('rows are strictly NEWEST FIRST',
  revs.every(function (v, i) { return i === 0 || revs[i - 1] > v; }),
  revs.join(','));
ck('no duplicate revision numbers', new Set(revs).size === revs.length);
var max = Math.max.apply(null, revs), min = Math.min.apply(null, revs);
ck('no gaps in the revision sequence', max - min + 1 === revs.length,
  'span ' + min + '..' + max + ' over ' + revs.length + ' rows');
ck('every row has a description and an author',
  rows.every(function (r) { return r.desc.length > 20 && r.author.length > 2; }));
// Dates must not travel backwards as revisions climb.
var dateOrder = rows.every(function (r, i) { return i === 0 || rows[i - 1].date >= r.date; });
ck('dates are non-decreasing with revision number', dateOrder);

var newest = rows[0];

// ---- 2. the stamps ------------------------------------------------------------
var NOT_CHAPTERS = /^(00_REVISION_HISTORY|ISSUES_AND_FINDINGS|CAMPAIGN_MANUAL_DISCREPANCIES|CAMPAIGN_MODE_ALIGNMENT_SPEC)/;
var files = fs.readdirSync(DIR).filter(function (f) {
  return /\.md$/.test(f) && !NOT_CHAPTERS.test(f);
}).sort();
ck('the numbered set was found', files.length >= 12, files.length + ' documents');

var badStamp = [];
files.forEach(function (f) {
  var t = fs.readFileSync(path.join(DIR, f), 'utf8');
  var m = t.match(/^\*\*Revision:\*\* *(\d+)/m);
  if (!m) badStamp.push(f + ' (no stamp)');
  else if (parseInt(m[1], 10) !== newest.rev) badStamp.push(f + ' at Rev ' + m[1]);
});
ck('every document carries the set revision (' + newest.rev + ')', !badStamp.length,
  badStamp.length ? badStamp.join(', ') : files.length + ' documents');

var rm = fs.readFileSync(path.join(DIR, 'README.md'), 'utf8').match(/^\*\*Date:\*\* *(\d{4}-\d{2}-\d{2})/m);
ck('README date matches the newest row', !!rm && rm[1] === newest.date,
  (rm ? rm[1] : 'missing') + ' vs ' + newest.date);
var sm = src.match(/^\*\*Set revision:\*\* *(\d+) *\((\d{4}-\d{2}-\d{2})\)/m);
ck('the "Set revision" header matches the newest row',
  !!sm && parseInt(sm[1], 10) === newest.rev && sm[2] === newest.date,
  sm ? sm[1] + ' (' + sm[2] + ')' : 'missing');
// …and there is only ONE of them. The check above matches the FIRST occurrence, and the
// stamper rewrites the first occurrence, so a second line is invisible to both while
// contradicting the set-wide revision in the one document whose job is to state it.
// Found 2026-07-31 carrying a stale "Set revision: 20 (2026-07-30)" directly under the
// live 23 — arrived by hand in 85264ad (#277) and had survived three stampings, because
// nothing counted. The revision is SET-WIDE: one number, stated once.
var smAll = src.match(/^\*\*Set revision:\*\*/gm) || [];
ck('exactly one "Set revision" header line', smAll.length === 1, smAll.length + ' found');

// ---- 3. the digests — the check that catches an unrecorded edit ---------------
// Delegated to the tool in --check mode so the sealing logic and the checking logic
// cannot drift apart (there is exactly one implementation of the digest).
var r = cp.spawnSync(process.execPath,
  [path.join(__dirname, '..', 'tools', 'stamp_manual_revision.js'), '--check'],
  { encoding: 'utf8' });
var out = ((r.stdout || '') + (r.stderr || '')).trim();
ck('content digests are sealed at the newest revision', r.status === 0,
  r.status === 0 ? 'Rev ' + newest.rev : out.split('\n').slice(0, 3).join(' | '));
if (r.status !== 0) {
  console.log(D + '\n  A chapter changed with no revision row. Add a row at the top of' +
    '\n  Manuals/00_REVISION_HISTORY.md, then: node tools/stamp_manual_revision.js' +
    '\n  followed by node tools/pack_manuals.js' + X);
}

// ---- 4. the content canary — the check a LANE MERGE walks through ------------
// (3) catches a chapter edited with NO row. This catches the opposite and worse case: a row
// that CLAIMS a change whose content a merge silently dropped.
//
// Manuals/ files are edited in the MIDDLE by two lanes, so git resolves in one lane's favour
// and says nothing — unlike CHANGELOG.md / TUNING_LOG.md / BUILD_DECISIONS.md / BASELINES,
// which are append-at-top and conflict loudly. Measured 2026-08-03: a backshop merge dropped
// an entire Manuals/12 §5.5 section, the documentation of a physics change whose ENGINE half
// merged fine. (3) was SILENT, because the merge re-sealed the digests and they then agreed
// with the surviving text. The revision row still claimed the change, which is worse than
// silence: the record said it was documented and it was not. CLAUDE.md carries the standing
// human instruction this automates — "after any merge that touches Manuals/, grep the chapter
// for the thing you wrote. One grep -c per claim is the whole check."
//
// WHAT IS PARSED: chapter-qualified references only — "12 §5.5", "09 §2.0", "12 §12.4b",
// bolded or not. Bare "§7.5" is deliberately NOT resolved. There are 44 of them in the
// pre-zeroing table and they point variously at a Blueprint document, at CONTEXT.md, or at
// the chapter under discussion, so resolving them would guess and this gate would start
// failing on correct rows. MEASURED against the full 26-row pre-zeroing table (e2b6452^):
// 11 of 11 chapter-qualified refs resolve, and 1 of 1 in the live table.
//
// A SECTION IS EITHER A HEADING OR A REGISTER ROW, and both forms are required. Chapter 12's
// §12.0 holds its declared simplifications as a numbered TABLE, so "12 §12.4b" is a row and
// not a heading; a heading-only matcher reddens on a clean tree. A dropped section destroys
// either form, so both are structural evidence the content is still there.
//
// ONE CHECK, NOT ONE PER REF, deliberately: a per-ref count would move this runner's baseline
// every time a revision row is added — i.e. on ordinary manual work — and BASELINES drift is
// meant to mean something. That is exactly why run_manual_units is not baselined at all;
// this gate stays structurally counted so it can be.
var CHAPTERS = fs.readdirSync(DIR).filter(function (f) { return /^\d\d_.+\.md$/.test(f); });
function chapterFile(nn) {
  var hit = CHAPTERS.filter(function (f) { return f.indexOf(nn + '_') === 0; });
  return hit.length === 1 ? path.join(DIR, hit[0]) : null;
}
function sectionPresent(text, sec) {
  var q = sec.replace(/\./g, '\\.');
  return new RegExp('^#{1,6}[ \\t]*' + q + '\\b', 'm').test(text) ||                 // a heading
         new RegExp('^\\|[ \\t]*\\*{0,2}' + q + '\\*{0,2}[ \\t]*\\|', 'm').test(text); // a register row
}

var refs = [], seenRef = {};
rows.forEach(function (r) {
  var re = /\b(\d{2}) §(\d+(?:\.\d+)*[a-z]?)/g, m;
  while ((m = re.exec(r.desc + ' ' + r.author))) {
    var key = m[1] + ' §' + m[2];
    if (!seenRef[key]) { seenRef[key] = true; refs.push({ rev: r.rev, ch: m[1], sec: m[2], key: key }); }
  }
});

// The anti-hollow guard. If the reference syntax in the table ever changes, the canary below
// would resolve an empty list, find nothing missing, and pass while checking NOTHING — the
// failure mode this repo files under "a claim about coverage is an unmeasured claim". A table
// with no chapter-qualified reference at all is therefore a red that a human must look at.
ck('the reference parser finds chapter-qualified section refs', refs.length > 0,
  refs.length + ' unique across ' + rows.length + ' rows');

var chapText = {};
var missing = refs.filter(function (r) {
  var f = chapterFile(r.ch);
  if (!f) return true;
  if (!(r.ch in chapText)) chapText[r.ch] = fs.readFileSync(f, 'utf8');
  return !sectionPresent(chapText[r.ch], r.sec);
}).map(function (r) { return 'Rev ' + r.rev + ' names ' + r.key; });

ck('every section a revision row names still exists', !missing.length,
  missing.length ? missing.join('; ') : refs.length + ' refs resolve');
if (missing.length) {
  console.log(D + '\n  A revision row claims a change the chapter no longer carries. If this' +
    '\n  followed a lane merge, the merge resolved that chapter in one lane\'s favour' +
    '\n  and dropped the other side — recover it from the losing side before re-stamping.' + X);
}

// ---- 5. the packed in-app copy carries this revision -------------------------
// The manual the PLAYER reads is ui/manual_md.js, packed from these files. A revision
// recorded here but not packed is invisible in the product.
var packed = fs.readFileSync(path.join(__dirname, '..', 'ui', 'manual_md.js'), 'utf8');
var stampsInPack = (packed.match(/\*\*Revision:\*\* *(\d+)/g) || [])
  .map(function (s) { return parseInt(s.replace(/\D/g, ''), 10); });
ck('packed in-app manual carries the set revision',
  stampsInPack.length > 0 && stampsInPack.every(function (v) { return v === newest.rev; }),
  stampsInPack.length ? 'all ' + stampsInPack.length + ' at Rev ' +
    Array.from(new Set(stampsInPack)).join('/') : 'no stamps found in the pack');

function report() {
  console.log(B + '\n──────────────────────────────────────────' + X);
  console.log(B + (fails.length ? R + 'MANUAL REVISION: FAIL' : G + 'MANUAL REVISION: OK') + X +
    '  ' + checks + ' checks, ' + fails.length + ' failed' + X);
  process.exit(fails.length ? 1 : 0);
}
report();
