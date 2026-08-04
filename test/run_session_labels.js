/*
 * run_session_labels.js — the session-heading label gate.
 *
 * WHY THIS EXISTS (#339). `Diagnostic/TUNING_LOG.md` and `Blueprint/BUILD_DECISIONS.md` are
 * cited constantly by their dated session headings — "see TUNING_LOG 2026-08-04b" is how one
 * entry points at another, and the whole point of the suffix is that the entry is CITABLE.
 * With three worktree lanes running in parallel, each lane picked its own suffix
 * independently and they collided. Measured on the merged tree at the time this gate was
 * written: 17 labels name more than one entry — 7 in TUNING_LOG, 10 in BUILD_DECISIONS —
 * so `2026-08-04b` resolves to two different sessions in one file and three in the other,
 * and every cross-reference written against those labels is ambiguous.
 *
 * The old scheme could not be rescued by care. It allocated a sequence letter per DAY across
 * all lanes, so it required three sessions in three trees to agree on who got `b` — and they
 * cannot see each other. It had also already run out: `2026-08-04` (unsuffixed) sits ABOVE
 * `2026-08-04a` in the file, so there is no free letter below `b` for a third lane without
 * renumbering everything above it.
 *
 * THE SCHEME. `YYYY-MM-DD-<lane>-<letter>` — e.g. `2026-08-05-develop-a`, then `-b`, `-c` for
 * later sessions IN THAT SAME LANE that day. Lane is one of develop / workbench / backshop:
 * the TREE the work was done in, not the branch. Two properties, and they are the reason:
 *
 *   - The lane makes collision structurally impossible ACROSS trees. No agent ever has to
 *     know what another lane chose, which is the failure the old scheme could not avoid.
 *   - The letter is scoped to (date, lane), so it is allocated by reading your own file's
 *     own lane — information you always have.
 *
 * THE LETTER IS MANDATORY, including on the first entry of the day, and that is a DEPARTURE
 * from #339 option 2 as literally written (`2026-08-04-develop`, no letter). Measured: 25
 * session entries landed on 2026-08-03, ~8 per lane, so multiple sessions per lane per day is
 * the norm and not the exception. With a bare first entry, session two must either rename
 * session one — the retro-rename churn option 2 was chosen to avoid — or start at `b` and
 * leave no `a`. Requiring `-a` up front costs two characters and removes both.
 *
 * WHAT IT CHECKS, per file:
 *
 *  1. Every session heading's label PARSES, as either the lane form or a grandfathered
 *     legacy `YYYY-MM-DD[letter]`. A misspelled or invented lane fails here.
 *  2. No duplicate LANE-FORM label. This is the defect the scheme exists to prevent.
 *  3. Every label dated on or after the ADOPTION date is lane-form. This is the check that
 *     makes the convention stick — without it the scheme is prose, and prose conventions in
 *     this repo have a record of being written down and then not followed (see run_release,
 *     which exists because a CLAUDE.md note and a skill step both said to roll CHANGELOG.md
 *     and both were skipped, twice).
 *  4. Within each (date, lane), the letters appear in DESCENDING order — newest on top, the
 *     stated convention of both files.
 *
 * GRANDFATHERED, deliberately. The legacy labels are NOT renamed *(OWNER RULING, 2026-08-04:
 * "Work issue 339 in develop. Go with option 2." — #339 option 2 is explicitly "for new
 * entries, and do not retro-rename")*. Their duplicates are REPORTED as information and never
 * failed: they are the readable record of the day three lanes landed at once, with #339 as
 * the explanation. Only labels dated on or after the adoption date are held to the scheme.
 *
 * WHAT IT DOES NOT CHECK, and why:
 *
 *  - CONTIGUITY of the letters. A session that writes up in TUNING_LOG but not in
 *    BUILD_DECISIONS leaves a legitimate gap in the second file, so `a, c` is not a defect.
 *    A contiguity check would redden on correct work, which is worse than not checking.
 *  - ORDERING across lanes, or across the legacy region. Two lanes both landing on one day
 *    have no defined order relative to each other, and the legacy region is already out of
 *    order (`2026-08-04a` sits below `2026-08-03w` in TUNING_LOG) — that is history, not a
 *    regression, and grandfathering it is the point.
 *  - Whether a label's PROSE is true, or whether an entry is in the right file. Same class as
 *    HR10/HR12: this gate proves a session is CITABLE, never that the citation is accurate.
 *
 *   node test/run_session_labels.js
 */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';
var checks = 0, fails = [];

// The three worktree lanes (CLAUDE.md). The lane is the TREE, not the branch.
var LANES = ['develop', 'workbench', 'backshop'];

// Labels dated ON OR AFTER this must use the lane form. Everything before it is
// grandfathered. 2026-08-05 rather than the 2026-08-04 ruling date on purpose: nine legacy
// entries are already dated 2026-08-04, so the ruling day is a TRANSITION day that accepts
// both forms. Do not move this date forward to make a red go away — that retires the gate.
var ADOPTED = '2026-08-05';

var LANE_FORM = new RegExp('^(\\d{4}-\\d{2}-\\d{2})-(' + LANES.join('|') + ')-([a-z])$');
var LEGACY_FORM = /^(\d{4}-\d{2}-\d{2})([a-z]*)$/;

// The two logs, and how a session heading is spelled in each.
var FILES = [
  { file: 'Diagnostic/TUNING_LOG.md',       re: /^##\s+Session log\s+—\s+(\S+)/ },
  { file: 'Blueprint/BUILD_DECISIONS.md',   re: /^##\s+(\d{4}-\d{2}-\d{2}\S*)/ }
];

function ck(desc, ok, detail) {
  checks++;
  if (ok) console.log(G + '  ✓' + X + ' ' + desc + (detail ? D + '  (' + detail + ')' + X : ''));
  else { fails.push(desc + (detail ? ' — ' + detail : '')); console.log(R + '  ✗' + X + ' ' + desc + (detail ? R + '  — ' + detail + X : '')); }
}

FILES.forEach(function (spec) {
  var abs = path.join(ROOT, spec.file);
  console.log('\n' + B + spec.file + X);
  var lines = fs.readFileSync(abs, 'utf8').split('\n');
  var entries = [];
  lines.forEach(function (l, i) {
    var m = l.match(spec.re);
    if (m) entries.push({ label: m[1], line: i + 1 });
  });

  // ---- 1. every label parses -------------------------------------------------
  var unparsed = entries.filter(function (e) {
    return !LANE_FORM.test(e.label) && !LEGACY_FORM.test(e.label);
  });
  ck('every session label parses', unparsed.length === 0,
    unparsed.length ? unparsed.map(function (e) { return e.label + ' (:' + e.line + ')'; }).join(', ') +
      ' — expected YYYY-MM-DD-<' + LANES.join('|') + '>-<letter>'
      : entries.length + ' headings');

  var lane = entries.filter(function (e) { return LANE_FORM.test(e.label); });
  var legacy = entries.filter(function (e) { return !LANE_FORM.test(e.label) && LEGACY_FORM.test(e.label); });

  // ---- 2. no duplicate lane-form label ---------------------------------------
  var seen = {}, dup = [];
  lane.forEach(function (e) {
    if (seen[e.label]) dup.push(e.label + ' (:' + seen[e.label] + ', :' + e.line + ')');
    else seen[e.label] = e.line;
  });
  ck('no duplicate lane-form label', dup.length === 0,
    dup.length ? dup.join('; ') : lane.length + ' lane-form label' + (lane.length === 1 ? '' : 's'));

  // ---- 3. anything dated on/after adoption uses the lane form ----------------
  var late = legacy.filter(function (e) { return e.label.slice(0, 10) >= ADOPTED; });
  ck('every label dated ' + ADOPTED + ' or later uses the lane form', late.length === 0,
    late.length ? late.map(function (e) { return e.label + ' (:' + e.line + ')'; }).join(', ')
      : legacy.length + ' grandfathered below the adoption date');

  // ---- 4. newest-first within each (date, lane) ------------------------------
  var groups = {}, outOfOrder = [];
  lane.forEach(function (e) {
    var m = e.label.match(LANE_FORM), key = m[1] + '-' + m[2];
    (groups[key] = groups[key] || []).push({ letter: m[3], line: e.line, label: e.label });
  });
  Object.keys(groups).forEach(function (k) {
    var g = groups[k];
    for (var i = 1; i < g.length; i++) {
      if (g[i].letter >= g[i - 1].letter) outOfOrder.push(g[i].label + ' (:' + g[i].line + ') below ' + g[i - 1].label);
    }
  });
  ck('lane-form entries are newest-first within each date+lane', outOfOrder.length === 0,
    outOfOrder.length ? outOfOrder.join('; ') : Object.keys(groups).length + ' date+lane group' + (Object.keys(groups).length === 1 ? '' : 's'));

  // ---- grandfathered collisions: REPORTED, never failed ----------------------
  var lseen = {}, ldup = {};
  legacy.forEach(function (e) {
    if (lseen[e.label]) ldup[e.label] = (ldup[e.label] || [lseen[e.label]]).concat(e.line);
    else lseen[e.label] = e.line;
  });
  var ldupKeys = Object.keys(ldup);
  if (ldupKeys.length) {
    console.log(D + '  · ' + ldupKeys.length + ' grandfathered collision' + (ldupKeys.length === 1 ? '' : 's') +
      ' (#339, not renamed by ruling): ' +
      ldupKeys.map(function (k) { return k + ' ×' + ldup[k].length; }).join(', ') + X);
  }
});

console.log('\n' + B + '──────────────────────────────────────────' + X);
if (fails.length) fails.forEach(function (f) { console.log(R + '  ✗ ' + X + f); });
console.log(B + (fails.length ? R + 'SESSION LABELS: FAIL' : G + 'SESSION LABELS: OK') + X + '  ' +
  checks + ' checks, ' + fails.length + ' failed' + X);
if (!fails.length) console.log(D + 'OK here means every session is uniquely CITABLE. It says nothing about' +
  ' whether the entry under the heading is true.' + X);
process.exit(fails.length ? 1 : 0);
