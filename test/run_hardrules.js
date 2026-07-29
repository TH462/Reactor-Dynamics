/*
 * run_hardrules.js — static guards for the Hard Rules that had none.
 *
 * WHY. `CONTEXT.md` §3 now requires every hard rule to name its guard, because a
 * rule with no gate holds only as long as the next author reads the neighbouring
 * comment — HR3 was stated INSIDE the kernel, directly above the fix pattern for
 * it, and was violated again forty lines below that comment (#156, #227). HR3
 * already had `run_hr3.js`. This covers three more:
 *
 *   HR1  protection and alarms read INSTRUMENTS, never true state
 *   HR5  commands flow DOWN the layers; the UI never reaches the engine directly
 *   HR11 a ruling needs a DATE and the owner's VERBATIM WORDS, or it is advisory
 *
 * HR2, HR4 (partly) and HR6 remain unguarded and say so in §3. Add them here.
 *
 * SHAPE. Same convention as run_hr3.js: findings are either DECLARED (listed with
 * a reason, which converts a coupling accepted in passing into a decision someone
 * wrote down) or VIOLATIONS. A declared entry that no longer matches anything is
 * STALE and also fails — an allow-list that outlives its couplings stops
 * describing the code.
 *
 *   node test/run_hardrules.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var C = '\x1b[36m', G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', Y = '\x1b[33m', X = '\x1b[0m';

// ---------------------------------------------------------------- helpers
function walk(dir, filter, out) {
  out = out || [];
  var full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  fs.readdirSync(full).forEach(function (name) {
    var rel = dir + '/' + name, abs = path.join(ROOT, rel);
    var st = fs.statSync(abs);
    if (st.isDirectory()) { if (name !== 'node_modules') walk(rel, filter, out); }
    else if (filter.test(name)) out.push(rel);
  });
  return out;
}
// Strip // and /* */ comments so a rule stated in prose is never mistaken for a
// violation of itself. (run_hr3 learned this the same way.)
//
// NEWLINES ARE PRESERVED. The first cut of this deleted block comments outright,
// which collapsed their newlines and shifted every subsequent line number — so the
// gate reported a real violation at the wrong place, which for a diagnostic tool is
// its own kind of lie. Comment bodies are blanked in situ instead.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ' '); })
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

var findings = [];   // every check performed — the tally
var violations = [];
function check(rule, file, line, text, why) {
  var f = { rule: rule, file: file, line: line, text: text, why: why };
  findings.push(f);
  if (!why) violations.push(f);
  return f;
}

// ============================================================ HR1
// Protection, alarms and automation in layers/control/ must decide from
// INSTRUMENTS. Where no instrument exists for a quantity the control layer
// genuinely needs, §3 calls that a DECLARED exception — so each one is listed
// here with the reason it cannot read an instrument instead.
var HR1_ALLOWED = {
  'control_kernel.js:_permTest/pump_flow': 'no primary-flow instrument exists; the low-flow trip permissive reads true pump flow. Documented in place as an HR1 exception.',
  'control_kernel.js:ctx': 'assembling the ctx object handed to channel callbacks — plumbing, not a decision. The rule binds what a callback READS from it.',
  'control_kernel.js:melted': 'no core-damage instrument exists (a damage indication is post-ship). Used only to stop automation acting on a destroyed core.',
  'pwr_control.js:feedwater_isolated': 'no feedwater_isolated instrument exists (verified 2026-07-29 against getInstruments()). The three-element feed channel stands down when MFW is isolated; the alternative is inferring it from fw_flow, which cannot distinguish isolation from a tripped pump.',
  'control_kernel.js:readback': 'reading back whether a COMMAND took effect (RPS reset confirms truth.scrammed cleared), not deciding from a sensor. Same pattern as the rods-fully-inserted interlock. HR1 governs what protection DECIDES from; a command that lies about its own success would make the reset latch unfalsifiable.',
  'rbmk_control.js:scrammed_melted': 'RBMK, ON HOLD. Not reviewed; recorded so the gate is honest about it rather than silent.',
};
// Which allow-list key covers a given file:line. Keyed by the true-state field
// being read, because that is what the exception is actually about.
function hr1Key(file, text) {
  var base = path.basename(file);
  if (/pump_flow_pct/.test(text)) return 'control_kernel.js:_permTest/pump_flow';
  if (/true_state:\s*this\.engine\.getTrueState\(\)/.test(text)) return 'control_kernel.js:ctx';
  if (/melted/.test(text) && base === 'control_kernel.js') return 'control_kernel.js:melted';
  if (/var truth\s*=\s*this\.engine\.getTrueState\(\)/.test(text)) return 'control_kernel.js:readback';
  if (/feedwater_isolated/.test(text)) return 'pwr_control.js:feedwater_isolated';
  if (base === 'rbmk_control.js') return 'rbmk_control.js:scrammed_melted';
  return null;
}
var hr1Used = {};
walk('layers/control', /\.js$/).forEach(function (rel) {
  var src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8')).split('\n');
  src.forEach(function (line, i) {
    if (!/getTrueState\(\)|\btrue_state\b/.test(line)) return;
    var key = hr1Key(rel, line);
    if (key) hr1Used[key] = true;
    check('HR1', rel, i + 1, line.trim().slice(0, 90), key ? HR1_ALLOWED[key] : null);
  });
});

// ============================================================ HR5
// The UI never reaches the engine directly — a command enters at the top and
// descends so gating and failure-interception can act on it. Any direct engine
// command call from ui/ defeats both.
walk('ui', /\.js$/).forEach(function (rel) {
  var src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8')).split('\n');
  src.forEach(function (line, i) {
    if (!/\bengine\s*\.\s*applyCommand\s*\(|\bengine\s*\.\s*step\s*\(/.test(line)) return;
    check('HR5', rel, i + 1, line.trim().slice(0, 90), null);
  });
});

// ============================================================ HR11
// Every OWNER RULING in tracked markdown must carry a date AND a quotation.
// Without both it is indistinguishable from an agent's own preference written in
// authoritative voice — which has already happened at least twice (#216, and the
// ship-review plan's "accepted — do not re-fix them").
var DATE = /\d{4}-\d{2}-\d{2}/;
var QUOTE = /["“”']/;
function trackedMd() {
  var out = [];
  ['Blueprint', 'Diagnostic', 'Manuals'].forEach(function (d) { walk(d, /\.md$/, out); });
  ['CLAUDE.md', 'CHANGELOG.md', 'README.md'].forEach(function (f) {
    if (fs.existsSync(path.join(ROOT, f))) out.push(f);
  });
  return out;
}
// SCOPE, deliberately narrow: only the FORMAL, uppercase marker `OWNER RULING`,
// which is the format §3 prescribes for asserting a ruling as authority. The
// case-insensitive version was tried first and matched 71 sites — narrative prose
// in the tuning log and changelog ("many 'owner rulings' in this repo were written
// by agents"), which are descriptions, not citations. A gate that cries wolf
// seventy times gets ignored, and an ignored gate is worse than none.
//
// KNOWN LIMITATION: this cannot catch authority laundered in lowercase. That is
// covered by the other half of HR11 — an unattributed directive is advisory — which
// is a reading rule, not a writing one, and is not gateable.
// An explicit, honest escape. Some genuine rulings predate the verbatim-quote
// requirement and the owner's exact words were never written down. HR11's answer is
// that such a directive is ADVISORY — so the document must SAY so rather than look
// like a binding ruling. Marking it declares the gap instead of hiding it, which is
// the same idiom run_hr3 uses for accepted couplings.
var NO_VERBATIM = /verbatim not recorded/i;

trackedMd().forEach(function (rel) {
  var src = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  src.forEach(function (line, i) {
    if (!/OWNER RULING/.test(line)) return;
    // The literal format template in §3 / SOP.md is not a ruling.
    if (/YYYY-MM-DD/.test(line)) return;
    // Nor is a backticked mention — that is prose ABOUT the marker (§3 describing
    // this very gate matched itself on the first run).
    if (/`[^`]*OWNER RULING[^`]*`/.test(line)) return;
    // Markdown wraps: a ruling routinely puts its date on one line and the quote on
    // the next, so inspect a small window from the marker rightward. The window must
    // not run past what the ruling could plausibly occupy — an unrelated date
    // downstream would otherwise vouch for it. Caught in development: RETIRED.md's
    // ruling sits mid-TABLE-ROW and the window borrowed the NEXT ROW's date, passing
    // a genuinely undated ruling. So a table row is its own window, and elsewhere the
    // window stops at a blank line or the start of a table.
    var head = line.slice(line.search(/OWNER RULING/));
    var win = [head];
    if (!/^\s*\|/.test(line)) {
      for (var k = i + 1; k < Math.min(i + 3, src.length); k++) {
        if (!src[k].trim() || /^\s*\|/.test(src[k])) break;
        win.push(src[k]);
      }
    }
    var window = win.join('\n');
    var ok = (DATE.test(window) && QUOTE.test(window)) || NO_VERBATIM.test(window);
    check('HR11', rel, i + 1, window.split('\n')[0].trim().slice(0, 90),
      ok ? (NO_VERBATIM.test(window) ? 'declared: verbatim not recorded → advisory' : 'date + verbatim quote present') : null);
  });
});

// ============================================================ stale declarations
var stale = Object.keys(HR1_ALLOWED).filter(function (k) { return !hr1Used[k]; });

// ---------------------------------------------------------------- report
var byRule = {};
findings.forEach(function (f) { (byRule[f.rule] = byRule[f.rule] || []).push(f); });
['HR1', 'HR5', 'HR11'].forEach(function (r) {
  var all = byRule[r] || [], bad = all.filter(function (f) { return !f.why; });
  console.log('\n' + B + (bad.length ? R + 'FAIL' : G + 'PASS') + X + '  ' + B + r + X +
    D + '  (' + all.length + ' site' + (all.length === 1 ? '' : 's') + ', ' + bad.length + ' undeclared)' + X);
  bad.forEach(function (f) {
    console.log(R + '  ✗' + X + ' ' + f.file + ':' + f.line + D + '  ' + f.text + X);
  });
  if (r === 'HR1') {
    all.filter(function (f) { return f.why; }).forEach(function (f) {
      console.log(D + '  · ' + f.file + ':' + f.line + '  — ' + f.why.slice(0, 100) + X);
    });
  }
});
if (stale.length) {
  console.log('\n' + Y + B + 'STALE declarations (' + stale.length + ')' + X);
  stale.forEach(function (k) { console.log(Y + '  ✗' + X + ' ' + k + D + '  — nothing matches it any more; delete it' + X); });
}

var bad = violations.length + stale.length;
console.log('\n' + B + '──────────────────────────────────────────' + X);
console.log(B + (bad ? R + 'HARD RULES GUARD: FAIL' : G + 'HARD RULES GUARD: OK') + X + '  ' +
  findings.length + ' checks, ' + bad + ' failed' + X);
process.exit(bad ? 1 : 0);
