/*
 * run_released_frozen.js — A RELEASE THAT HAS SHIPPED IS HISTORY, NOT A DRAFT (#639).
 *
 * THE DEFECT THIS EXISTS FOR, in full, because it is the reason to trust the gate:
 * `Alpha 1.7.2` merged to `main` on 2026-09-05 at 08:50 (PR #636). A change made hours later
 * edited the `[Alpha 1.7.2]` section of CHANGELOG.md in place to describe behaviour that is
 * NOT in 1.7.2, edited the manual's `Rev 17` row — Rev 17 having shipped in that release —
 * and re-sealed the chapter digests around it. Every gate was green:
 *
 *     run_release     asks whether CHANGELOG.md, changelog.html and site/release.js AGREE on
 *                     the version. They agree exactly as well after a released section is
 *                     rewritten in place.
 *     run_manual_rev  asks whether the chapter digests are sealed at the NEWEST revision row.
 *                     Re-sealing a RELEASED row satisfies that as completely as a pending one.
 *
 * Both are consistency checks, and consistency is preserved by a coherent rewrite. Neither can
 * ask "was this artifact already published" because neither has any record of what shipped.
 * `test/released_seals.json` is that record; this is the gate that reads it.
 *
 * WHY THE RECORD IS DIGESTS AND NOT GIT — the objection to answer first, since `git show
 * v1.7.2:CHANGELOG.md` is the obvious implementation and works on any development tree.
 * `.github/workflows/gates.yml` checks out with `actions/checkout@v7` and no `fetch-depth` or
 * `fetch-tags`: the CI runner has ONE COMMIT AND NO TAGS. A git-based gate finds nothing to
 * compare against and reports green on every CI run — silently vacuous, which is the failure
 * mode this repo has documented five times over and the one a NEW gate has no excuse for.
 * Digests in a tracked file work offline, on a shallow checkout, and in a fresh worktree.
 *
 * WHAT IT ASSERTS
 *   1. Every PUBLISHED version (`Alpha X.Y.Z`, no `-rc`) has a seal. A release cut without
 *      running the sealer leaves an unsealed published version, which is a RED — so the
 *      procedure enforces itself instead of relying on the step being remembered.
 *   2. Each published version's CHANGELOG.md section is byte-identical to what shipped.
 *   3. Each published version's changelog.html entry likewise.
 *   4. Every manual revision row at or below `manual_sealed_rev` is byte-identical.
 *   5. The PENDING entry and the pending revision row are NOT frozen — the `-rc` policy
 *      (#611) and CLAUDE.md's "extend the pending row" both require them to keep changing.
 *      A gate that froze those would forbid the normal workflow, and would be turned off.
 *
 * The `open` attribute on a changelog.html entry is normalised away before hashing: only the
 * newest entry carries it, so cutting a release legitimately removes it from the entry below.
 * Hashing that byte would make every release redden its predecessor.
 *
 * Run: node test/run_released_frozen.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';
var checks = 0, fails = [];

function ck(desc, ok, detail) {
  checks++;
  if (ok) console.log(G + '  ✓' + X + ' ' + desc + (detail ? D + '  (' + detail + ')' + X : ''));
  else { fails.push(desc + (detail ? ' — ' + detail : '')); console.log(R + '  ✗' + X + ' ' + desc + (detail ? R + '  — ' + detail + X : '')); }
}

console.log(B + '\n════════ RELEASED ARTIFACTS ARE FROZEN ════════' + X);
console.log(D + '  A shipped release is history. The PENDING entry and the pending manual row' +
                '\n  are deliberately NOT frozen — those are supposed to keep changing.' + X);

var SEALS = path.join(ROOT, 'test', 'released_seals.json');
ck('the seal record exists', fs.existsSync(SEALS), 'test/released_seals.json');

if (fs.existsSync(SEALS)) {
  var seals = JSON.parse(fs.readFileSync(SEALS, 'utf8'));
  var nVers = Object.keys(seals.versions || {}).length;
  var nRows = Object.keys(seals.manual_rows || {}).length;

  /* THE RECORD IS NOT EMPTY. An empty seal file passes every comparison below — the
   * vacuous-guard shape this file's own header names, arriving from inside.
   *
   * The floors are MEASURED at the gate's birth, not guessed — the first cut wrote 17 and 17
   * from memory and this check reddened on its own seal file. **16** published versions, not
   * the 17 `run_release` reports, because that tally counts the pending `-rc` entry as a
   * version heading; and **18** rows, because Rev 0 through Rev 17 is eighteen of them. They
   * are FLOORS: a release adds to both and must never redden this. */
  ck('it is not empty — an empty record would pass every check below',
     nVers >= 16 && nRows >= 18, nVers + ' versions, ' + nRows + ' rows <= Rev ' + seals.manual_sealed_rev);

  /* THE COMPARISON ITSELF is the tool's `--check`, spawned rather than re-implemented here.
   * Re-implementing the section-splitting and the `open` normalisation in the gate would give
   * two parsers that must agree, and the day they disagree the gate reports on a document the
   * sealer never sealed. `run_manual_rev` spawns `stamp_manual_revision.js --check` for the
   * same reason and it is the house idiom. */
  var r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'seal_released.js'), '--check'],
                       { encoding: 'utf8' });
  var out = ((r.stdout || '') + (r.stderr || '')).trim();
  ck('every published release still reads as it shipped', r.status === 0,
     r.status === 0 ? out : out.split('\n').slice(0, 4).join(' | '));
  if (r.status !== 0) {
    console.log(D + '\n  A section or revision row that has ALREADY SHIPPED was edited. Restore it' +
                    '\n  (git checkout <the release tag or merge> -- <file>) and put the change in the' +
                    '\n  PENDING entry instead — open one with a -rc version if there is none.' +
                    '\n  If the edit is deliberate (a typo in shipped notes), re-seal:' +
                    '\n    node tools/seal_released.js' + X);
  }

  /* THE PENDING ENTRY IS FREE. Asserted positively rather than left implied: a future
   * tightening that froze everything would pass all the checks above and quietly forbid the
   * documented workflow — extend the pending entry, bump -rc. This is the check that fails
   * when that happens. */
  var mdSrc = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
  var pend = /^## \[(Alpha \d+\.\d+\.\d+-rc\d+)\]/m.exec(mdSrc);
  ck('a -rc version is never sealed — the pending entry stays editable',
     !pend || !(seals.versions || {})[pend[1]],
     pend ? pend[1] + ' is pending and unsealed' : 'no pending entry right now');

  /* AND THE SEAL NEVER RUNS AHEAD OF THE TABLE.
   *
   * ⚠ THIS CHECK WAS WRONG ON ITS FIRST REAL RELEASE, AND IT CAUGHT ITSELF. It was written as
   * `manual_sealed_rev < newest` — "there is a pending row above the seal" — which is true
   * BETWEEN releases and FALSE at the moment of one: cutting Alpha 1.7.3 sealed through Rev 18
   * while Rev 18 was still the newest row, and this went red on a correct release. The only way
   * to satisfy the strict form there is to open a dummy Rev 19 for nothing, which is the gate
   * dictating the workflow — the failure this file's own header warns about two paragraphs up.
   *
   * So the invariant is `<=`: the seal may sit ON the newest row (just released, nothing pending
   * yet) or BELOW it (a pending row is open and editable). What it may never do is run AHEAD of
   * the table, which would freeze a row that does not exist and is the actual error worth
   * catching. The claim that the pending row stays editable is carried by the sealer itself —
   * it writes digests only for rows <= manual_sealed_rev — and by the -rc check above it. */
  var hist = fs.readFileSync(path.join(ROOT, 'Manuals', '00_REVISION_HISTORY.md'), 'utf8').replace(/\r\n/g, '\n');
  var revs = [];
  hist.split('\n').forEach(function (l) { var m = /^\|\s*(\d+)\s*\|/.exec(l); if (m) revs.push(+m[1]); });
  var newest = revs.length ? Math.max.apply(null, revs) : 0;
  ck('the seal does not run ahead of the revision table',
     seals.manual_sealed_rev <= newest || revs.length === 0,
     'newest row Rev ' + newest + ', sealed through Rev ' + seals.manual_sealed_rev +
     (seals.manual_sealed_rev === newest ? ' — just released, nothing pending yet'
                                         : ' — Rev ' + newest + ' is pending and editable'));
}

console.log(B + '\n──────────────────────────────────────────' + X);
if (fails.length) {
  console.log(B + R + 'RELEASED FROZEN: FAIL' + X + '  ' + checks + ' checks, ' + fails.length + ' failed' + X);
  process.exit(1);
}
console.log(B + G + 'RELEASED FROZEN: OK' + X + '  ' + checks + ' checks, 0 failed' + X);
console.log(D + 'OK means nothing already published has moved. It says nothing about whether' +
                '\nwhat was published was TRUE when it shipped.' + X);
