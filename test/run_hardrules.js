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
// TWO CATEGORIES, and keeping them apart is the whole point.
//
// The first cut of this gate had ONE list called "allowed", and writing the
// reasons out is what exposed the problem: for two entries the honest reason was
// "the instrument does not exist" — which under HR9 ("err toward the real plant")
// is an argument for BUILDING the instrument, not for excusing the read. Filed as
// one list, those two were indistinguishable from the genuine exceptions, and a
// green gate would have read as "HR1 is clean" when the plant's most
// safety-significant trip reads truth. That is laundering debt as compliance.
// Both were paid four days later (#247) — the split worked as intended.
//
// So: EXCEPTION is settled and needs no further work. DEBT is a known violation
// that is tracked, must carry an issue number, and is reported separately and
// loudly. **A green run means "no UNDECLARED reads", never "HR1 is satisfied".**
var HR1_EXCEPTION = {
  'control_kernel.js:ctx': 'assembling the ctx object handed to channel callbacks — plumbing, not a decision. The rule binds what a callback READS from it.',
  'control_kernel.js:readback': 'reading back whether a COMMAND took effect (RPS reset confirms truth.scrammed cleared), not deciding from a sensor. Same pattern as the rods-fully-inserted interlock. HR1 governs what protection DECIDES from; a command that lies about its own success would make the reset latch unfalsifiable.',
  'pwr_control.js:runback_readback': 'the turbine runback (#318) reading back the LOAD SETPOINT it drives. HR1 governs what protection DECIDES from, and this runback decides from `otdt_margin`/`opdt_margin` — instruments. `load_target_mwe` is a commanded value the control layer issues itself, the same category as control_kernel.js:readback, not a measurement of the plant. It is re-read every step deliberately: if the operator types a higher load the runback picks it up and walks it back down, which IS the authored behaviour.',
  'control_kernel.js:melted': 'no core-damage instrument exists, deliberately — a damage indication is post-ship scope. Used only to stop automation acting on a destroyed core, never to decide protection.',
};
// PWR DEBT: PAID 2026-07-29 (#247). Both PWR entries came off this list when the
// instruments they were waiting on were built — `rcs_flow` (elbow-tap channel, feeds
// the low-flow reactor trip) and `mfw_isolated` (MFIV position, feeds the three-element
// feed channel's stand-down). Deleting them here is the point of the two-list split:
// debt is meant to be *paid*, and a gate that would have let the reads sit in an
// "allowed" list forever is the failure mode this shape exists to prevent.
var HR1_DEBT = {
  'rbmk_control.js:scrammed_melted': 'UNREVIEWED — RBMK is ON HOLD. Recorded so the gate is honest about it rather than silent. Not assessed either way.',
};
var HR1_ALLOWED = {};
Object.keys(HR1_EXCEPTION).forEach(function (k) { HR1_ALLOWED[k] = HR1_EXCEPTION[k]; });
Object.keys(HR1_DEBT).forEach(function (k) { HR1_ALLOWED[k] = HR1_DEBT[k]; });
// Which allow-list key covers a given file:line. Keyed by the true-state field
// being read, because that is what the exception is actually about.
function hr1Key(file, text) {
  var base = path.basename(file);
  if (/true_state:\s*this\.engine\.getTrueState\(\)/.test(text)) return 'control_kernel.js:ctx';
  if (/melted/.test(text) && base === 'control_kernel.js') return 'control_kernel.js:melted';
  if (/var truth\s*=\s*this\.engine\.getTrueState\(\)/.test(text)) return 'control_kernel.js:readback';
  if (base === 'rbmk_control.js') return 'rbmk_control.js:scrammed_melted';
  // The runback's `read` callback (#318) returns the load SETPOINT the control layer itself
  // issues — command read-back, not a sensed quantity. Keyed on the field so a future callback
  // reading something genuinely sensed does NOT inherit this exception.
  if (/load_target_mwe/.test(text)) return 'pwr_control.js:runback_readback';
  return null;
}
var hr1Used = {};
// SCAN SURFACE — `layers/control/` only, and here is why that is the whole rule and
// not a convenient subset. Verified 2026-07-29:
//   · protection, actuation and alarm decisions live ONLY in layers/control/
//     (grepped for trips/_evalAlarms/_tripAsserted across layers/)
//   · getTrueState() and `true_state` are the ONLY routes to engine truth in layers/
//     — no `engine.s`, no direct state handle
// so nothing that DECIDES can reach truth by a path this misses.
//
// THAT LAST SENTENCE WAS WRONG, and it stayed wrong for two days (#220). A decision
// can reach truth without naming it: the engine computes a `condition:` STATUS WORD
// from true state and hands it over, and inside layers/control/ it looks like any
// other reading. `above_p9` — two reactor trips and an AFW auto-start — was doing
// exactly that. The HR1(b) block below closes it, and is kept separate rather than
// folded in because it scans a different surface (permissive keys, then the engine
// line that defines them) and would otherwise hide inside this one's tally.
//
// Widening to all of layers/ was tried and reverted: the service reads true state
// legitimately in ~16 places (snapshot assembly — HR4 REQUIRES it — and the
// attention-stop's previous-tick comparison), none of which are decisions. Declaring
// sixteen benign sites would have buried the five that matter, which is exactly the
// failure the HR11 check already had to be rescued from.
walk('layers/control', /\.js$/).forEach(function (rel) {
  var src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8')).split('\n');
  src.forEach(function (line, i) {
    if (!/getTrueState\(\)|\btrue_state\b/.test(line)) return;
    var key = hr1Key(rel, line);
    if (key) hr1Used[key] = true;
    check('HR1', rel, i + 1, line.trim().slice(0, 90), key ? HR1_ALLOWED[key] : null);
  });
});

// ================================================= HR1(b) — the PERMISSIVE surface
// The scan above claimed, in writing, that "nothing that DECIDES can reach truth by a
// path this misses". That was FALSE, and #220 found it: a trip's `condition:` key is a
// STATUS WORD the engine computes and hands over, so from inside layers/control/ it is
// indistinguishable from an instrument — no `getTrueState()`, no `true_state`, nothing
// for the scan to see. `above_p9` was computed from true `power_pct` and gated two
// reactor trips and the loss-of-main-feed AFW start. Measured before the fix: the
// power-range channel stuck at 40 % with the core at 100 % still scrammed on a turbine
// trip. A permissive that cannot be fooled by the channel it reads is exactly what HR1
// forbids, and this gate said OK for as long as the leak existed.
//
// So every `condition:` key gating a trip, actuation or alarm must be DECLARED here with
// where its value comes from. Four kinds:
//   instrument — derived from an instrument reading. CHECKED, not just declared: the
//                defining line inside the engine's _instrExtras() must reach through
//                `_ins_*` or `instruments.reading`. This is the kind that would have
//                caught #220 on the day it was written.
//   lineup     — a handswitch or valve position. A real board indicates these directly;
//                there is no transducer to fool, and the position IS the indication.
//   latch      — a fact the control layer itself owns (the RPS trip latch), never a
//                measurement. Reading your own state back is not sensing.
//   hold       — RBMK/BWR, ON HOLD. Recorded so the gate is honest rather than silent;
//                not assessed either way, same convention as HR1_DEBT above.
var HR1_CONDITION = {
  'pwr:above_p9': { kind: 'instrument',
    why: 'P-9, ~50 % power. Real one is "determined by two-out-of-four NIS power range detectors" (NUREG-1431 Rev 4 Bases B 3.3.1, ML12100A228), so it is a nuclear-instrument reading and nothing else. Gates two reactor trips + the loss-of-main-feed AFW start. Read truth until #220; probe TR-1f pins the behaviour.' },
  'pwr:sr_energized': { kind: 'lineup',
    why: 'source-range detector handswitch position. The switch IS the indication — de-energised detectors do not read low, they read nothing, which is why the SR high-flux trip is conditioned on the switch rather than on the count rate.' },
  'pwr:rcp_secured': { kind: 'lineup',
    why: 'RCP handswitch position — the reason the annunciator has for a stopped pump (#240). Reclassifies an alarm that has already annunciated from its own instrument; never decides whether one exists.' },
  'pwr:accum_valve_open': { kind: 'lineup',
    why: 'accumulator discharge valve position (#273). A real board has a valve position light; the alarm is gated on the LINEUP as well as the reading, which is the whole point of that alarm.' },
  'pwr:rps_scrammed': { kind: 'latch',
    why: 'the RPS trip latch — the control layer reading back its own state, not sensing the plant. Same standing as control_kernel.js:readback above.' },
  'bwr:ads_open': { kind: 'hold', why: 'BWR is ON HOLD. Recorded, not assessed.' },
  'bwr:hpci_unavailable': { kind: 'hold', why: 'BWR is ON HOLD. Recorded, not assessed.' },
};
var condUsed = {};
// The engine's _instrExtras() body, per plant — where a status word is computed.
function instrExtrasBody(plant) {
  var rel = 'engines/' + plant + '/' + plant + '_engine.js';
  var abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  var src = stripComments(fs.readFileSync(abs, 'utf8'));
  var start = src.indexOf('_instrExtras = function');
  if (start < 0) return null;
  // To the next prototype method — the extras object is the whole of this function.
  var end = src.indexOf('.prototype.', start + 10);
  return { rel: rel, text: src.slice(start, end < 0 ? src.length : end), offset: start, src: src };
}
var extrasCache = {};
walk('layers/control', /_control\.js$/).forEach(function (rel) {
  var plant = path.basename(rel).replace('_control.js', '');
  var src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8')).split('\n');
  src.forEach(function (line, i) {
    var m = /condition:\s*'([a-z_0-9]+)'/.exec(line);
    if (!m) return;
    var key = plant + ':' + m[1];
    condUsed[key] = true;
    var decl = HR1_CONDITION[key];
    if (!decl) {
      check('HR1', rel, i + 1, "condition: '" + m[1] + "' — permissive with no declared source", null);
      return;
    }
    if (decl.kind !== 'instrument') { check('HR1', rel, i + 1, "condition: '" + m[1] + "' (" + decl.kind + ')', decl.why); return; }
    // Declared as instrument-derived — prove it at the definition.
    if (extrasCache[plant] === undefined) extrasCache[plant] = instrExtrasBody(plant);
    var ex = extrasCache[plant];
    var def = ex && new RegExp('(^|\\n)\\s*' + m[1] + '\\s*:([^\\n]*)').exec(ex.text);
    var ok = def && /_ins_|instruments\s*\.\s*reading/.test(def[2]);
    check('HR1', rel, i + 1, "condition: '" + m[1] + "' (instrument-derived)",
      ok ? decl.why : null);
    if (!ok) {
      violations[violations.length - 1].text = "condition: '" + m[1] + "' is declared instrument-derived, but "
        + (def ? (ex.rel + ' computes it from true state: ' + def[2].trim().slice(0, 60)) : 'no definition found in _instrExtras()');
    }
  });
});
// A declaration that matches nothing has stopped describing the code (same rule as
// the allow-lists above — that is how an allow-list quietly becomes fiction).
Object.keys(HR1_CONDITION).forEach(function (k) {
  if (!condUsed[k]) check('HR1', 'test/run_hardrules.js', 0, 'STALE declaration — no permissive uses ' + k, null);
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
// Every OWNER RULING / OWNER DIRECTIVE in tracked markdown must carry a date AND a
// quotation. Without both it is indistinguishable from an agent's own preference
// written in authoritative voice — which has already happened at least twice (#216,
// and the ship-review plan's "accepted — do not re-fix them").
var DATE = /\d{4}-\d{2}-\d{2}/;
var QUOTE = /["“”']/;
// BOTH markers, not just one (#290). This matched `OWNER RULING` alone for its first
// three weeks, while the repo used `OWNER DIRECTIVE` for eleven in-scope citations —
// including `never merge into develop`, `never push the lanes`, the brevity and
// STILL OUTSTANDING directives, and the US-customary-units rule. All eleven were
// unguarded, and one of them (the status-owner-review labels) was already malformed.
// The silence was the defect: CLAUDE.md's own baseline note describes this runner as
// counting "dated owner quotes wherever they are tracked", so a directive added and
// the count not moving reads as CHECKED, not as NOT LOOKED AT.
var MARKER = /OWNER (RULING|DIRECTIVE)/;
function trackedMd() {
  var out = [];
  ['Blueprint', 'Diagnostic', 'Manuals'].forEach(function (d) { walk(d, /\.md$/, out); });
  ['CLAUDE.md', 'CHANGELOG.md', 'README.md'].forEach(function (f) {
    if (fs.existsSync(path.join(ROOT, f))) out.push(f);
  });
  // `.claude/skills/` too (#290). Skill files cite rulings as authority exactly like
  // the docs do — release-to-main/SKILL.md rests the whole versioning-digit rule on
  // one — and being outside this list is why the malformed citation there survived a
  // gate that was believed to cover it. Local-only files are not exempt from HR11:
  // an unverifiable directive misleads an agent whether or not it ships.
  walk('.claude', /\.md$/, out);
  return out;
}
// SCOPE, deliberately narrow: only the FORMAL, uppercase markers, which are the
// format §3 prescribes for asserting a ruling as authority. The case-insensitive
// version was tried first and matched 71 sites — narrative prose in the tuning log
// and changelog ("many 'owner rulings' in this repo were written by agents"), which
// are descriptions, not citations. A gate that cries wolf seventy times gets
// ignored, and an ignored gate is worse than none.
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

// Is the marker ITSELF inside an inline code span? Count backticks to its left:
// odd means open. The first cut asked instead whether the LINE contained a code span
// wrapping the marker (/`[^`]*MARKER[^`]*`/), which fires whenever the marker merely
// sits BETWEEN two spans — the `[^`]*` gap is the text after one span closes and
// before the next opens. Measured (#290): that silently dropped 4 genuine citations,
// three OWNER RULING (RETIRED.md's retirement of the ship-review plan, TUNING_LOG's
// "249 - fit it.", CLAUDE.md's steam-dump 40 %) and the US-customary-units DIRECTIVE,
// all of which are heavily backticked prose. It is the worse half of #290: an
// unmatched marker at least LOOKS unmatched, whereas these read as checked.
// Backtick RUNS, per CommonMark: a run of N backticks opens a span that only a run of
// EXACTLY N closes, which is how you write a code span containing backticks. Counting
// individual backticks instead was the third wrong answer here, and this file's own
// write-up is what caught it — describing the old regex as ``/`[^`]*OWNER RULING[^`]*`/``
// puts the marker inside a DOUBLE-backtick span whose content holds two single ones, so
// the parity count reads 4 (even, "not in code") and the gate flagged a paragraph about
// itself. Same shape as the §3 self-match this exclusion was written for in the first
// place; runs are what actually settle it.
function markerInCodeSpan(line, pos) {
  var open = 0;   // length of the run that opened the current span, 0 when outside
  for (var j = 0; j < line.length; j++) {
    if (line[j] !== '`') continue;
    var n = 0;
    while (line[j + n] === '`') n++;
    if (j > pos) break;
    if (!open) open = n;
    else if (n === open) open = 0;
    if (j + n > pos) return open > 0 && j < pos;   // the marker sits inside this run's span
    j += n - 1;
  }
  return open > 0;
}
// Net parenthesis depth of a string — how the window knows the citation is still open.
function parenDepth(s) {
  var d = 0;
  for (var j = 0; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')') d--; }
  return d;
}
// Truncate at the character that CLOSES the citation's parenthetical. Depth is counted
// RELATIVE TO THE MARKER (0 on entry), so the first UNMATCHED `)` — one with no `(` to
// pair with inside the window — is the citation's own closer. Returns the kept text and
// whether the citation is still open at the end of it.
//
// The window has to be bounded on BOTH sides, not just extended forwards (#290). The
// first cut ran from the marker to end of line, which is fine on a wrapped citation
// and wrong on a long one: CLAUDE.md's run_behavior baseline is a single 1,400-char
// paragraph carrying FOUR dates after its `(OWNER RULING, …: "Let's change it to
// 40%.")`, so deleting that citation's own date changed nothing — a later, unrelated
// date vouched for it. Found by injection; reading the code did not show it.
//
// Counting ABSOLUTE depth was the second wrong answer and it still measured green:
// that same citation is nested inside `(41 → 42 on 2026-07-31: …)`, so its closing
// paren only takes absolute depth 2 → 1 and the clip never fires. Relative is the
// only count that does not care what the citation is nested in.
function clipToCitation(s) {
  var rel = 0;
  for (var j = 0; j < s.length; j++) {
    if (s[j] === '(') rel++;
    else if (s[j] === ')') { rel--; if (rel < 0) return { text: s.slice(0, j + 1), open: false }; }
  }
  return { text: s, open: true };
}

trackedMd().forEach(function (rel) {
  var src = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  src.forEach(function (line, i) {
    if (!MARKER.test(line)) return;
    // The literal format template in §3 / SOP.md is not a ruling.
    if (/YYYY-MM-DD/.test(line)) return;
    // Nor is a backticked mention — that is prose ABOUT the marker (§3 describing
    // this very gate matched itself on the first run).
    var pos = line.search(MARKER);
    if (markerInCodeSpan(line, pos)) return;
    // Markdown wraps: a ruling routinely puts its date on one line and the quote on
    // the next, so inspect a small window from the marker rightward. The window must
    // not run past what the ruling could plausibly occupy — an unrelated date
    // downstream would otherwise vouch for it. Caught in development: RETIRED.md's
    // ruling sits mid-TABLE-ROW and the window borrowed the NEXT ROW's date, passing
    // a genuinely undated ruling. So a table row is its own window, and elsewhere the
    // window stops at a blank line or the start of a table.
    //
    // AND it stops when the citation's own parenthetical closes (#290). A quote mark
    // three lines down vouches for nothing if the `*(OWNER …)*` ended on line one —
    // which is exactly how release-to-main/SKILL.md's quote-less citation passed,
    // borrowing the `"a new *player-facing* feature"` from the sentence after it.
    // Depth is counted from the START OF THE LINE, not from the marker: the opening
    // `(` is BEFORE the marker in every citation here, so counting from the marker
    // sees depth 0 and never opens the window at all — measured, that reddens all 9
    // legitimately hard-wrapped citations in the repo.
    //
    // A citation NOT wrapped in parens at all cannot be clipped — there is nothing to
    // clip to — so it keeps the old marker-rightward behaviour and is bounded only by
    // the blank line / table rules. Every citation in the repo today is parenthesised;
    // this is the honest fallback, not a case that fires.
    var parenthesised = parenDepth(line.slice(0, pos)) > 0;
    var clipped = parenthesised ? clipToCitation(line.slice(pos)) : { text: line.slice(pos), open: true };
    var win = [clipped.text];
    if (!/^\s*\|/.test(line) && clipped.open) {
      for (var k = i + 1; k < Math.min(i + 3, src.length); k++) {
        if (!src[k].trim() || /^\s*\|/.test(src[k])) break;
        if (!parenthesised) { win.push(src[k]); continue; }
        var next = clipToCitation(src[k]);
        win.push(next.text);
        if (!next.open) break;
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
    all.filter(function (f) { return f.why && HR1_EXCEPTION[hr1Key(f.file, f.text)]; }).forEach(function (f) {
      console.log(D + '  · ' + f.file + ':' + f.line + '  — ' + f.why.slice(0, 100) + X);
    });
    var debt = all.filter(function (f) { return f.why && HR1_DEBT[hr1Key(f.file, f.text)]; });
    if (debt.length) {
      console.log(Y + '  ⚠ ' + debt.length + ' DECLARED DEBT — real HR1 violations, tracked, NOT excused:' + X);
      debt.forEach(function (f) {
        console.log(Y + '    ! ' + X + f.file + ':' + f.line + D + '  ' + f.why.slice(0, 96) + X);
      });
    }
  }
});
if (stale.length) {
  console.log('\n' + Y + B + 'STALE declarations (' + stale.length + ')' + X);
  stale.forEach(function (k) { console.log(Y + '  ✗' + X + ' ' + k + D + '  — nothing matches it any more; delete it' + X); });
}

var bad = violations.length + stale.length;
var nDebt = findings.filter(function (f) { return f.why && HR1_DEBT[hr1Key(f.file, f.text)]; }).length;
console.log('\n' + B + '──────────────────────────────────────────' + X);
console.log(B + (bad ? R + 'HARD RULES GUARD: FAIL' : G + 'HARD RULES GUARD: OK') + X + '  ' +
  findings.length + ' checks, ' + bad + ' failed' +
  (nDebt ? Y + '  ·  ' + nDebt + ' declared HR1 debt' + X : '') + X);
// Said plainly because the alternative is a green tick that means more than it should.
if (nDebt) console.log(D + 'OK here means no UNDECLARED reads. It does not mean HR1 is satisfied —' +
  ' see the debt above.' + X);
process.exit(bad ? 1 : 0);
