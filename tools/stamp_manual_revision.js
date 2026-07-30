/*
 * stamp_manual_revision.js — propagate the manual set's revision, and re-seal it.
 *
 * The set revision is SET-WIDE: one number, held in the newest row of
 * `Manuals/00_REVISION_HISTORY.md`, carried by every chapter's `**Revision:**` line and
 * by `README.md`. This tool copies it outward and refreshes the CONTENT DIGESTS that
 * `test/run_manual_rev.js` checks.
 *
 * WHY THE DIGESTS EXIST. Stamping alone only catches a stamp that disagrees. The failure
 * this set actually had was different and worse: SIX content changes (#247, #248, #251,
 * #260 x2, the gpm scale fix, #263 — revs 9-13) landed in the chapters with no row added
 * to the table at all, over two weeks, while ten of thirteen chapters still read
 * "Revision: 0" and README.md read "Revision: 2, 2026-07-16". Nothing compared prose
 * against the history, so nothing complained. A digest per chapter means editing a
 * chapter and NOT recording it is a red gate.
 *
 * So this tool is the deliberate "I have recorded this revision" action. It is NOT run by
 * pack_manuals — a pack happens often and would silently absorb the very change the digest
 * is meant to catch.
 *
 * USAGE
 *   1. add a row at the top of the table in Manuals/00_REVISION_HISTORY.md
 *   2. node tools/stamp_manual_revision.js
 *   3. node tools/pack_manuals.js          (so the in-app copy carries it)
 *
 *   node tools/stamp_manual_revision.js --check    exit 1 instead of writing (what the gate uses)
 */
'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var DIR = path.join(__dirname, '..', 'Manuals');
var HIST = '00_REVISION_HISTORY.md';
var CHECK = process.argv.indexOf('--check') >= 0;

// Chapters + README carry the stamp. The history file itself holds the authority, and the
// three working documents (issues log, campaign discrepancy notes, the alignment spec) are
// working notes, not part of the numbered set.
var NOT_CHAPTERS = /^(00_REVISION_HISTORY|ISSUES_AND_FINDINGS|CAMPAIGN_MANUAL_DISCREPANCIES|CAMPAIGN_MODE_ALIGNMENT_SPEC)/;

function stampedFiles() {
  return fs.readdirSync(DIR)
    .filter(function (f) { return /\.md$/.test(f) && !NOT_CHAPTERS.test(f); })
    .sort();
}

// The newest row of the table is the authority. Rows are `| N | YYYY-MM-DD | ... |`.
function readHistory() {
  var src = fs.readFileSync(path.join(DIR, HIST), 'utf8');
  var rows = [];
  src.split('\n').forEach(function (l) {
    var m = l.match(/^\|\s*(\d+)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|/);
    if (m) rows.push({ rev: parseInt(m[1], 10), date: m[2], line: l });
  });
  return { src: src, rows: rows };
}

// Digest of a chapter's CONTENT, with the stamp line itself normalised out — otherwise
// stamping would change the digest that stamping just sealed. Line endings normalised so
// a CRLF checkout does not read as an edit.
function digest(text) {
  var body = text.replace(/\r\n/g, '\n')
    .split('\n')
    .filter(function (l) { return !/^\*\*(Revision|Date):\*\*/.test(l); })
    .join('\n')
    .replace(/[ \t]+$/gm, '');
  return crypto.createHash('sha256').update(body, 'utf8').digest('hex').slice(0, 16);
}

var MANIFEST_START = '<!-- CONTENT-DIGESTS — maintained by tools/stamp_manual_revision.js; do not hand-edit.';
var MANIFEST_END = '-->';

function buildManifest(rev, date, files) {
  var lines = [MANIFEST_START,
    '     Sealed at Rev ' + rev + ' (' + date + '). A mismatch means a chapter changed with no',
    '     revision row added — add one and re-run the tool. See test/run_manual_rev.js.'];
  files.forEach(function (f) {
    lines.push('     ' + f + ' ' + digest(fs.readFileSync(path.join(DIR, f), 'utf8')));
  });
  lines.push(MANIFEST_END);
  return lines.join('\n');
}

function parseManifest(src) {
  var i = src.indexOf(MANIFEST_START);
  if (i < 0) return null;
  var j = src.indexOf(MANIFEST_END, i);
  if (j < 0) return null;
  var out = {};
  src.slice(i, j).split('\n').forEach(function (l) {
    var m = l.match(/^\s{5}(\S+\.md)\s+([0-9a-f]{16})$/);
    if (m) out[m[1]] = m[2];
  });
  return { map: out, start: i, end: j + MANIFEST_END.length };
}

// ------------------------------------------------------------------ main
var hist = readHistory();
if (!hist.rows.length) { console.error('no revision rows found in ' + HIST); process.exit(1); }
var newest = hist.rows.reduce(function (a, b) { return b.rev > a.rev ? b : a; });
var files = stampedFiles();
var problems = [], wrote = [];

files.forEach(function (f) {
  var p = path.join(DIR, f);
  var text = fs.readFileSync(p, 'utf8');
  var eol = /\r\n/.test(text) ? '\r\n' : '\n';
  var out = text;
  if (/^\*\*Revision:\*\*.*$/m.test(out)) {
    out = out.replace(/^\*\*Revision:\*\*.*$/m, '**Revision:** ' + newest.rev + '  ');
  } else {
    problems.push(f + ' has no "**Revision:**" line to stamp');
  }
  // README additionally carries the set date.
  if (/^\*\*Date:\*\*.*$/m.test(out)) {
    out = out.replace(/^\*\*Date:\*\*.*$/m, '**Date:** ' + newest.date + '  ');
  }
  if (out !== text) {
    if (CHECK) problems.push(f + ' stamp is not at Rev ' + newest.rev);
    else { fs.writeFileSync(p, out.replace(/\r?\n/g, eol)); wrote.push(f); }
  }
});

// Re-seal the digests AFTER stamping, so they describe the stamped files.
var histPath = path.join(DIR, HIST);
var hsrc = fs.readFileSync(histPath, 'utf8');
var heol = /\r\n/.test(hsrc) ? '\r\n' : '\n';
var manifest = buildManifest(newest.rev, newest.date, files);
var existing = parseManifest(hsrc);
var newHsrc;
if (existing) {
  newHsrc = hsrc.slice(0, existing.start) + manifest + hsrc.slice(existing.end);
} else {
  newHsrc = hsrc.replace(/\s*$/, '') + '\n\n' + manifest + '\n';
}
// Also keep the human-readable "Set revision:" header line honest.
newHsrc = newHsrc.replace(/^\*\*Set revision:\*\*.*$/m,
  '**Set revision:** ' + newest.rev + ' (' + newest.date + ')  ');

if (newHsrc.replace(/\r\n/g, '\n') !== hsrc.replace(/\r\n/g, '\n')) {
  if (CHECK) problems.push(HIST + ' digests/header are stale — run tools/stamp_manual_revision.js');
  else { fs.writeFileSync(histPath, newHsrc.replace(/\r?\n/g, heol)); wrote.push(HIST); }
}

if (CHECK) {
  if (problems.length) { problems.forEach(function (m) { console.error('  ' + m); }); process.exit(1); }
  console.log('manual revision stamp: OK (Rev ' + newest.rev + ', ' + newest.date + ')');
  process.exit(0);
}
if (problems.length) { problems.forEach(function (m) { console.error('  ' + m); }); process.exit(1); }
console.log('Stamped Rev ' + newest.rev + ' (' + newest.date + ') into ' + files.length + ' documents.');
console.log(wrote.length ? '  updated: ' + wrote.join(', ') : '  already current — nothing to write');
