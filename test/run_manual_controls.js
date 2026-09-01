/*
 * run_manual_controls.js — every controlled procedure step names a control the
 * player can actually reach, and is COVERED by the browser gate.
 *
 * WHY THIS IS A GATE (#224). It was `test/audit_manual_controls.js`: same checks,
 * but not a `run_*.js`, so `run_all`'s auto-discovery never saw it and it had no
 * baseline. Manual-run harnesses drift — #159 said so, and this is the half that
 * mattered. Measured 2026-07-31 it reported **32 mismatches, exit 1**, and had been
 * doing so silently through the #197 / #202 / #206 procedure re-authoring.
 *
 * WHAT IT ACTUALLY GUARDS, which is more than the name suggests. `STEP_UI` in
 * `manual_ui_map.js` is the COVERAGE LIST for `verify_manual_follow.js` — that gate
 * iterates the table, not the procedure steps. So a step with no entry is not merely
 * unmapped, it is **unverified**, and the browser gate reports a confident PASS over
 * whatever slice remains. At the point this was written the table covered 17 of the
 * 45 controlled PWR steps and `pwr_heatup` had none at all. Nothing said so, because
 * the only thing that could say so was not in the gate list.
 *
 * THE THREE CHECKS, per controlled step (a step whose `control` is absent or reads
 * `(observe…)` is not a control step and is skipped):
 *   1. it has a `STEP_UI` entry            — i.e. the browser gate will look at it
 *   2. the entry's control matches the pill — catches steps inserted above an entry,
 *      which is exactly how `pwr_startup` came to pin `Control Bank` at the 1/M step
 *   3. the control exists on that plant's display vocabulary — for PWR, the board's
 *      own CONTROL_LABEL_MAP (see manual_ui_map.js); for RBMK/BWR, the view-bar lists
 * …plus the reverse: a `STEP_UI` entry pointing at a step that no longer exists.
 *
 * Static — no browser, no plant stepped. `verify_manual_follow.js` is the dynamic
 * half and mounts the real UI.
 *
 *   node test/run_manual_controls.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var map = require('./manual_ui_map.js');
var G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

// Report destination: repo-relative Diagnostic/ by default (where the other
// generated reports live). `node test/run_manual_controls.js <dir>` overrides.
var SCRATCH = process.env.GROK_GOAL_SCRATCH || process.argv[2] || path.join(__dirname, '..', 'Diagnostic');

require('../ui/manual_procedures.js');
var RD = globalThis.RD;

var checks = 0, failed = 0, mismatches = [];
function ck(label, ok, detail) {
  checks++;
  if (!ok) { failed++; mismatches.push(label + (detail ? ': ' + detail : '')); }
}

var covered = 0, controlled = 0;
Object.keys(RD.MANUAL_PROCEDURES).forEach(function (prof) {
  RD.MANUAL_PROCEDURES[prof].forEach(function (proc) {
    if (proc.narrative) return;
    var expects = map.STEP_UI[prof + ':' + proc.id] ||
                  (map.OWN_POOL_PROFILES.indexOf(prof) >= 0 ? null : map.STEP_UI[proc.id]) || [];
    (proc.steps || []).forEach(function (st, idx) {
      if (!st.control || /^\(observe/.test(st.control)) return;
      controlled++;
      var where = prof + ' · ' + proc.id + ' step ' + (idx + 1);
      var exp = expects.filter(function (e) { return e.i === idx; })[0];
      if (!exp) { ck(where, false, 'no STEP_UI entry for control "' + st.control + '" — this step is UNVERIFIED by verify_manual_follow'); return; }
      covered++;
      if (exp.control !== st.control) { ck(where, false, 'pill "' + st.control + '" != STEP_UI "' + exp.control + '"'); return; }
      ck(where, map.controlOnView(prof, exp.view, st.control),
        '"' + st.control + '" not on ' + prof + '/' + exp.view);
    });
    // Reverse: an entry whose step has gone away or lost its control.
    expects.forEach(function (e) {
      var st = (proc.steps || [])[e.i];
      ck(prof + ' · ' + proc.id + ' STEP_UI step ' + (e.i + 1),
        !!(st && st.control), 'STEP_UI entry has no procedure step behind it');
    });
  });
});

// ============================================================================
// INOPERABLE-CLAIM CHECK (#304) — a manual may not call a control read-only
// while the board gives it a press handler.
//
// WHY. Three times in two days a chapter asserted control behaviour that
// `Manuals/03` — the control inventory, which owns this — already had right:
// N05's "selecting a load mode does not close the breaker" (#303, there is no
// breaker), 01 4.1's "shutdown bank ... read-only to operator" (it has
// Withdraw/Insert on the board and 03 3.3 documents the full stroke), and
// 01 6.0's "Follow (default)" (the shipped lineup is MANUAL). HR12 was widened
// to cover control behaviour in the same change; this is the half of it that
// can be mechanised.
//
// SCOPE, deliberately narrow. Only the NEGATIVE claim is checkable: "this
// control cannot be operated" is decidable against the wiring, whereas "this
// control does X" is not. A wrong claim about what a control DOES still gets
// past this — see the HR12 note. Narrow and silent beats broad and noisy: the
// phrase list below is short on purpose, because "not used for routine trim"
// (03 3.3, correct) must not fire while "read-only to operator" (01 4.1,
// wrong) must.
//
// OPERABLE = the label's card, or anything inside it, has a `press` or `hold`
// handler. `pressableIds()` excludes entries carrying only `active`/`warn`/
// `badge` — those decorate a control, they are not one.
// ============================================================================
var INOPERABLE_PHRASES = [
  'read-only', 'read only', 'not operable', 'cannot be operated', 'no operator control',
  'observation only', 'display only', 'indication only', 'not adjustable',
  'operator cannot', 'not an operator control',
];

(function inoperableClaims() {
  if (!globalThis.RD || !globalThis.RD.PwrBoardDriver || !globalThis.RD.PwrBoardInspect) return;
  var DRV = globalThis.RD.PwrBoardDriver, I = globalThis.RD.PwrBoardInspect;
  if (!DRV.pressableIds) return;

  // Every id that is, or is inside, something pressable.
  var operableIds = {};
  DRV.pressableIds().forEach(function (id) {
    var cur = id, guard = 0;
    while (cur && guard++ < 8) { operableIds[cur] = true; cur = I.parentOf(cur); }
  });
  var operable = DRV.controlLabels().filter(function (l) { return !!operableIds[DRV.controlLabelItem(l)]; });

  // DROP TERSE ALIASES. CONTROL_LABEL_MAP deliberately points several names at one card —
  // 'Mode', 'Load', 'Turbine Load' and 'Main Breaker' are all the generator card — and the
  // one-word ones are ordinary English in this domain. Measured: keyword-matching 'Mode'
  // fires on "Training display only; does not change plant MODE" (05), which is correct
  // prose about a plant MODE and nothing to do with the load-mode control. So a single-word
  // label is skipped WHEN A LONGER LABEL SHARES ITS CARD — that keeps 'Turbine Load' and
  // 'Shutdown Bank' while dropping 'Mode', 'Load', 'Boron', 'Nudge', 'NIS', 'HPI'. It is
  // self-maintaining: a new terse alias is excluded automatically. Unambiguous single words
  // with no longer sibling ('MSIV', 'SCRAM') are kept.
  operable = operable.filter(function (l) {
    if (/\s/.test(l)) return true;
    var card = DRV.controlLabelItem(l);
    return !operable.some(function (o) { return o !== l && o.length > l.length && DRV.controlLabelItem(o) === card; });
  });
  // Longest label first so "Turbine Load" is preferred over "Load" on a line carrying both.
  operable.sort(function (a, b) { return b.length - a.length; });
  // CASE-INSENSITIVE, and this is not cosmetic: the defect that motivated the check writes
  // "Shutdown bank" while CONTROL_LABEL_MAP holds "Shutdown Bank". The first cut matched
  // exactly and stayed GREEN on the real #304 text — caught only by re-injecting it.
  var operableLc = operable.map(function (l) { return l.toLowerCase(); });

  var MANUAL_DIR = path.join(__dirname, '..', 'Manuals');
  fs.readdirSync(MANUAL_DIR).filter(function (f) { return /\.md$/.test(f); }).forEach(function (f) {
    // The revision history QUOTES the defects it records ("01 4.1 called the shutdown
    // bank read-only"), so scanning it would fail the gate on its own changelog.
    if (f === '00_REVISION_HISTORY.md') return;
    var lines = fs.readFileSync(path.join(MANUAL_DIR, f), 'utf8').split(/\r?\n/);
    lines.forEach(function (line, i) {
      var low = line.toLowerCase();
      var phrase = INOPERABLE_PHRASES.filter(function (ph) { return low.indexOf(ph) >= 0; })[0];
      if (!phrase) return;
      var li = operableLc.reduce(function (acc, l, n) { return acc >= 0 ? acc : (low.indexOf(l) >= 0 ? n : -1); }, -1);
      if (li < 0) return;
      var label = operable[li];
      ck(f + ':' + (i + 1), false,
        'calls "' + label + '" ' + phrase.toUpperCase() + ', but the board gives it a press handler' +
        ' — see Manuals/03 and pwr_board_wiring.js (HR12: control behaviour is measurable)');
    });
  });
  console.log('\n' + B + 'Inoperable-claim scan' + X + D + '  (#304 — negative control claims vs the wiring)' + X);
  console.log('  operable board controls: ' + operable.length + ' of ' + DRV.controlLabels().length +
    '   phrases watched: ' + INOPERABLE_PHRASES.length);
})();

fs.mkdirSync(SCRATCH, { recursive: true });
fs.writeFileSync(path.join(SCRATCH, 'manual-audit.txt'),
  (mismatches.length ? mismatches.join('\n') : 'PASS — every controlled procedure step is mapped and reachable.') + '\n');

if (mismatches.length) mismatches.forEach(function (m) { console.log(R + '  ✗ ' + X + m); });
console.log('\n' + B + 'Coverage' + X + D + '  (STEP_UI is what verify_manual_follow iterates)' + X);
console.log('  controlled procedure steps: ' + controlled + '   mapped: ' + covered +
  (covered < controlled ? '   ' + R + '→ ' + (controlled - covered) + ' unverified' + X : '   ' + G + 'all covered' + X));
console.log('\n' + B + '──────────────────────────────────────────' + X);
console.log(B + (failed ? R + 'MANUAL CONTROLS: FAIL' : G + 'MANUAL CONTROLS: OK') + X + '  ' + checks + ' checks, ' + failed + ' failed' + X);
process.exit(failed ? 1 : 0);
