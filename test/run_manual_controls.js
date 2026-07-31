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
    var expects = map.STEP_UI[proc.id] || [];
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
