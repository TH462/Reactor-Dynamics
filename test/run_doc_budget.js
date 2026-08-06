/*
 * test/run_doc_budget.js — a BUDGET on the auto-loaded context.
 *
 * WHY THIS EXISTS (2026-08-06)
 * ---------------------------
 * `CLAUDE.md` is loaded into every agent's context on every turn. It opens with "**Keep it
 * SHORT.** ... Prefer a pointer over a paragraph, and delete as readily as you add", and it
 * carries a *Recent themes* cap of "max 5 bullets" written as a hard rule of the file's design.
 *
 * Measured 2026-08-06, both were being violated and had been for weeks: the file was **42,065
 * words** across 1,735 lines, its longest single physical line was **5,310 words**, and the
 * themes list was running **7 bullets averaging 500 words** — two of them full-length duplicates
 * of traps already rescued into the standing list below them. Nothing could say so, because the
 * caps lived in prose inside the file they governed.
 *
 * That is this repo's own recurring lesson, arriving in the one file that states it: a rule
 * nobody can measure is a rule that decays. `tools/find_source.js` was written the same day for
 * the same reason (the SOP implied a three-lane corpus grep and it failed twice anyway).
 *
 * WHAT IT DOES NOT DO. It does not budget `Diagnostic/TUNING_LOG.md` (152,617 words) or
 * `Blueprint/`. Those are read ON DEMAND and their size is the point of them — TUNING_LOG is
 * deliberately a strict superset of what CLAUDE.md used to duplicate. **Length is only a defect
 * where it is paid on every turn**, so only the auto-loaded file is gated here.
 *
 * The thresholds carry real headroom against the 2026-08-06 measurement (13,455 words / 164-word
 * longest line), so ordinary work cannot trip them. If a cut ever has to fight this gate, the
 * answer is a pointer into TUNING_LOG, not a bigger number here.
 *
 *   node test/run_doc_budget.js
 */
'use strict';
var fs = require('fs');
var path = require('path');

var GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', BOLD = '\x1b[1m', RST = '\x1b[0m';

var FILE = path.join(__dirname, '..', 'CLAUDE.md');
var MAX_WORDS = 15000;   // measured 13,455 on 2026-08-06 (was 42,065 before the cut)
var MAX_LINE  = 400;     // measured 164 (was 5,310 — the prose gate-baselines paragraph)
var MAX_THEMES = 5;      // the file's own documented cap; it was running 7

var src = fs.readFileSync(FILE, 'utf8');
var lines = src.split(/\r?\n/);
var pass = 0, fail = 0;

function ck(name, observed, ok, expected) {
  if (ok) { pass++; console.log(GREEN + '  ✓' + RST + ' ' + name + DIM + '  (' + observed + ')' + RST); }
  else { fail++; console.log(RED + '  ✗' + RST + ' ' + name + DIM + '  [expected ' + expected + ', observed ' + observed + ']' + RST); }
}

console.log('\n' + BOLD + '════════ AUTO-LOADED DOC BUDGET ════════' + RST);
console.log(DIM + '  CLAUDE.md is read into every agent\'s context on every turn.' + RST);

// 1 — total size.
var words = src.split(/\s+/).filter(Boolean).length;
ck('CLAUDE.md fits the context budget', words + ' words', words <= MAX_WORDS, '<= ' + MAX_WORDS);

// 2 — no single monster paragraph. The 5,310-word line was ONE physical line, so a
// whole-file word count alone would not have located it.
var worst = 0, worstAt = 0;
lines.forEach(function (l, i) {
  var w = l.split(/\s+/).filter(Boolean).length;
  if (w > worst) { worst = w; worstAt = i + 1; }
});
ck('no single physical line is a wall of text', worst + ' words (line ' + worstAt + ')',
  worst <= MAX_LINE, '<= ' + MAX_LINE + ' words');

// 3 — the file's OWN themes cap, which it stated and then broke. Counts top-level bullets
// between the two markers; a missing marker is a failure, not a silent pass (the #345 shape).
var a = lines.findIndex(function (l) { return l.indexOf('**Recent themes**') === 0; });
var b = lines.findIndex(function (l, i) { return i > a && l.indexOf('**Standing procedure') === 0; });
if (a < 0 || b < 0) {
  ck('the themes/standing markers are present', 'themes@' + a + ' standing@' + b, false,
    'both markers found — this gate cannot count without them');
} else {
  var n = 0;
  for (var i = a; i < b; i++) if (lines[i].indexOf('- ') === 0) n++;
  ck('Recent themes obeys its own documented cap', n + ' bullets', n <= MAX_THEMES,
    '<= ' + MAX_THEMES + ' (evict the oldest, rescuing its trap to the standing list)');
}

console.log('\n' + BOLD + '─'.repeat(42) + RST);
if (fail) {
  console.log(BOLD + RED + 'DOC BUDGET: FAIL' + RST + '  ' + (pass + fail) + ' checks, ' + fail + ' failed');
  console.log(DIM + '  Cut, do not raise the number. The history belongs in Diagnostic/TUNING_LOG.md;' +
    '\n  CLAUDE.md gets the pointer.' + RST);
  process.exit(1);
}
console.log(BOLD + GREEN + 'DOC BUDGET: OK' + RST + '  ' + pass + ' checks, 0 failed');
console.log(DIM + '  OK means it FITS. It says nothing about whether what is in there is true.' + RST);
