/*
 * tools/seal_released.js — FREEZE THE RELEASE NOTES THAT HAVE ALREADY SHIPPED (#639).
 *
 * WHAT THIS EXISTS FOR. On 2026-09-05 `Alpha 1.7.2` merged to `main` at 08:50, and a change
 * made hours later edited the `[Alpha 1.7.2]` section of CHANGELOG.md in place — and the
 * pending manual row `Rev 17`, which had shipped in that same release — then re-sealed the
 * chapter digests around it. `run_release` and `run_manual_rev` were both green throughout,
 * because neither asks the question:
 *
 *     run_release     — do the three version strings AGREE? They agree exactly as well after
 *                       a released section is rewritten in place.
 *     run_manual_rev  — are the chapter digests sealed at the NEWEST row? Re-sealing a
 *                       RELEASED row satisfies that as completely as a pending one does.
 *
 * A gate that asks "is this artifact self-consistent" cannot answer "was this artifact
 * already published". This file answers the second question, and `test/run_released_frozen.js`
 * is the gate that reads it.
 *
 * ⚠ WHY THIS DOES NOT READ GIT, WHICH IS THE OBVIOUS IMPLEMENTATION. `git show v1.7.2:CHANGELOG.md`
 * works perfectly on a development tree and is VACUOUS ON CI: `.github/workflows/gates.yml`
 * checks out with `actions/checkout@v7` and no `fetch-depth` / `fetch-tags`, so the runner has
 * one commit and NO TAGS. The gate would find nothing to compare against on every CI run and
 * report green — the silently-vacuous-guard failure this repo has now documented five times.
 * Digests in a tracked file work offline, on a shallow checkout, and in a worktree that has
 * never fetched a tag.
 *
 * WHAT IS SEALED, AND WHAT IS DELIBERATELY NOT:
 *
 *   • Every PUBLISHED version — its CHANGELOG.md section and its changelog.html entry.
 *     A `-rc` version is NEVER sealed: that is the pending entry, and the whole point of the
 *     `-rc` policy (#611) is that it goes on being edited until the release commit strips the
 *     suffix. So "the pending entry may change, a released one may not" is ENCODED here rather
 *     than remembered by whoever is editing.
 *
 *   • Every manual revision row at or below `manual_sealed_rev`. The row ABOVE it is the
 *     pending one, which CLAUDE.md says extends until the next release. Today's defect is
 *     exactly why this is a stored NUMBER and not "all rows but the newest": Rev 17 was both
 *     the newest row AND already shipped, so "all but the newest" would have permitted the
 *     edit that started this.
 *
 * SELF-ENFORCING. The gate fails on a published version with no seal, so a release cut without
 * running this reddens on the next gate rather than quietly leaving the newest release
 * unfrozen. That is the property `run_manual_rev` has and `run_release` does not.
 *
 * THE `open` ATTRIBUTE IS NORMALISED AWAY BEFORE HASHING. changelog.html marks only the newest
 * entry `<details class="log-entry" open>`, so cutting a release legitimately removes `open`
 * from the entry below it. Hashing that byte would make every release redden its predecessor —
 * a gate crying wolf once per release, which is a gate that gets switched off.
 *
 * Usage:
 *   node tools/seal_released.js              # re-seal: adds any newly published version
 *   node tools/seal_released.js --check      # verify only; exit 1 and print what moved
 *   node tools/seal_released.js --rev=<n>    # with a re-seal, set manual_sealed_rev
 *
 * At a release, `release-to-main` runs `--rev=<the revision that just shipped>`.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..');
var SEALS = path.join(ROOT, 'test', 'released_seals.json');

// The pending form is `Alpha X.Y.Z-rcN`; a published one carries no suffix. Same shape
// run_release.js's VER_RE accepts, minus the optional suffix — a version is PUBLISHED
// exactly when it has none.
var PUBLISHED_RE = /^Alpha \d+\.\d+\.\d+$/;

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function sha(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16); }

// Line endings are NOT part of the content. These files are checked out CRLF on Windows and
// LF on CI, so hashing raw bytes would make every seal platform-dependent — a check that is
// green on one machine and red on the other, which is the #588 bifurcation in a doc gate.
function norm(s) { return s.replace(/\r\n/g, '\n').replace(/\s+$/, ''); }

// ---- CHANGELOG.md: a version's section is its heading through to the next heading ----------
function mdSections() {
  var src = norm(read('CHANGELOG.md'));
  var re = /^## \[([^\]]+)\].*$/gm, m, heads = [];
  while ((m = re.exec(src)) !== null) heads.push({ ver: m[1].trim(), at: m.index });
  var out = {};
  heads.forEach(function (h, i) {
    var end = i + 1 < heads.length ? heads[i + 1].at : src.length;
    out[h.ver] = norm(src.slice(h.at, end));
  });
  return out;
}

// ---- changelog.html: the <details> block carrying that version ------------------------------
// Comments stripped FIRST, for run_release.js's reason: the ADDING AN ENTRY comment holds a
// fully-formed "Alpha 1.5.0" specimen, and sealing a template as if it were the release would
// freeze the wrong bytes AND shadow the real 1.5.0 entry.
function htmlEntries() {
  var src = norm(read('changelog.html')).replace(/<!--[\s\S]*?-->/g, '');
  var out = {};
  var re = /<details class="log-entry"[^>]*>([\s\S]*?)<\/details>/g, m;
  while ((m = re.exec(src)) !== null) {
    var body = m[1];
    var v = /log-ver mono">([^<]+)</.exec(body);
    if (v) out[v[1].trim()] = norm(body);   // the `open` attribute lives in the tag, not the body
  }
  return out;
}

// ---- Manuals/00_REVISION_HISTORY.md: one digest per revision row ----------------------------
// Rows are `| <rev> | <date> | <description> | <author> |`, and the description legitimately
// contains unescaped pipes (recorded in the Rev 17 row itself), so the row is taken WHOLE and
// keyed by the leading revision number rather than split into cells.
function revRows() {
  var src = norm(read('Manuals/00_REVISION_HISTORY.md'));
  var out = {};
  src.split('\n').forEach(function (line) {
    var m = /^\|\s*(\d+)\s*\|/.exec(line);
    if (m) out[m[1]] = norm(line);
  });
  return out;
}

function compute() {
  var md = mdSections(), html = htmlEntries(), rows = revRows();
  var vers = Object.keys(md).filter(function (v) { return PUBLISHED_RE.test(v); });
  return { md: md, html: html, rows: rows, published: vers };
}

function loadSeals() {
  if (!fs.existsSync(SEALS)) return null;
  return JSON.parse(fs.readFileSync(SEALS, 'utf8'));
}

function main() {
  var args = process.argv.slice(2);
  var checkOnly = args.indexOf('--check') >= 0;
  var revArg = null;
  args.forEach(function (a) { var m = /^--rev=(\d+)$/.exec(a); if (m) revArg = +m[1]; });

  var now = compute();
  var seals = loadSeals();

  if (checkOnly) {
    if (!seals) { console.error('no test/released_seals.json — run: node tools/seal_released.js'); process.exit(1); }
    var bad = [];
    now.published.forEach(function (v) {
      var s = seals.versions[v];
      if (!s) { bad.push(v + ': PUBLISHED but never sealed — was a release cut without running this tool?'); return; }
      if (sha(now.md[v]) !== s.md) bad.push(v + ': the CHANGELOG.md section has been EDITED since it shipped');
      if (now.html[v] == null) bad.push(v + ': its changelog.html entry has been REMOVED');
      else if (sha(now.html[v]) !== s.html) bad.push(v + ': the changelog.html entry has been EDITED since it shipped');
    });
    Object.keys(seals.manual_rows).forEach(function (rev) {
      if (+rev > seals.manual_sealed_rev) return;              // above the seal = still pending
      if (now.rows[rev] == null) bad.push('Rev ' + rev + ': the revision row has been REMOVED');
      else if (sha(now.rows[rev]) !== seals.manual_rows[rev]) {
        bad.push('Rev ' + rev + ': the revision row has been EDITED since it shipped');
      }
    });
    if (bad.length) { bad.forEach(function (b) { console.error(b); }); process.exit(1); }
    console.log('sealed: ' + now.published.length + ' published versions, manual rows <= Rev ' + seals.manual_sealed_rev);
    return;
  }

  var out = {
    _note: 'GENERATED by tools/seal_released.js — do not hand-edit. Digests of the release ' +
           'notes and manual revision rows that have ALREADY SHIPPED, so an edit to one reddens ' +
           'test/run_released_frozen.js. A -rc version is never sealed; the manual row above ' +
           'manual_sealed_rev is the pending one. See #639 and the tool header.',
    manual_sealed_rev: revArg != null ? revArg : (seals ? seals.manual_sealed_rev : 0),
    versions: {},
    manual_rows: {},
  };
  now.published.forEach(function (v) {
    out.versions[v] = { md: sha(now.md[v]), html: now.html[v] == null ? null : sha(now.html[v]) };
  });
  Object.keys(now.rows).forEach(function (rev) {
    if (+rev <= out.manual_sealed_rev) out.manual_rows[rev] = sha(now.rows[rev]);
  });
  fs.writeFileSync(SEALS, JSON.stringify(out, null, 2) + '\n');
  console.log('sealed ' + Object.keys(out.versions).length + ' published versions and ' +
              Object.keys(out.manual_rows).length + ' manual rows (<= Rev ' + out.manual_sealed_rev + ')');
}

main();
