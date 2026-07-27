/* Audit procedure step controls against Plant Display viewControls (not profile-level PROFILES).
 * Run: node test/audit_manual_controls.js */
'use strict';
var fs = require('fs');
var path = require('path');
var map = require('./manual_ui_map.js');
// Report destination: repo-relative Diagnostic/ by default (where the other
// generated reports live). `node test/audit_manual_controls.js <dir>` overrides.
var SCRATCH = process.env.GROK_GOAL_SCRATCH || process.argv[2] || path.join(__dirname, '..', 'Diagnostic');

require('../ui/manual_procedures.js');
var RD = globalThis.RD;

var mismatches = [];
Object.keys(RD.MANUAL_PROCEDURES).forEach(function (prof) {
  RD.MANUAL_PROCEDURES[prof].forEach(function (proc) {
    if (proc.narrative) return;
    var expects = map.STEP_UI[proc.id] || [];
    (proc.steps || []).forEach(function (st, idx) {
      if (!st.control || /^\(observe/.test(st.control)) return;
      var exp = expects.filter(function (e) { return e.i === idx; })[0];
      if (!exp) {
        mismatches.push(prof + ' · ' + proc.id + ' step ' + (idx + 1) + ': no STEP_UI entry for control "' + st.control + '"');
        return;
      }
      if (exp.control !== st.control) {
        mismatches.push(prof + ' · ' + proc.id + ' step ' + (idx + 1) + ': pill "' + st.control + '" != STEP_UI "' + exp.control + '"');
        return;
      }
      if (!map.controlOnView(prof, exp.view, st.control)) {
        mismatches.push(prof + ' · ' + proc.id + ' step ' + (idx + 1) + ': "' + st.control + '" not on ' + prof + '/' + exp.view);
      }
    });
    expects.forEach(function (e) {
      var st = (proc.steps || [])[e.i];
      if (!st || !st.control) mismatches.push(prof + ' · ' + proc.id + ': STEP_UI step ' + (e.i + 1) + ' missing procedure step');
    });
  });
});

fs.mkdirSync(SCRATCH, { recursive: true });
var out = mismatches.length ? mismatches.join('\n') + '\n' : 'PASS — all procedure controls map to viewControls for their view.\n';
fs.writeFileSync(path.join(SCRATCH, 'manual-audit.txt'), out);
console.log(out.trim());
process.exit(mismatches.length ? 1 : 0);