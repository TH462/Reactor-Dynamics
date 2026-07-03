/* Static audit: procedure step `control` strings vs Plant Display labels in ui/app.js.
 * Run: node test/audit_manual_controls.js
 * Exit 0 when every non-observe control maps to a shipped label/button. */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var SCRATCH = process.env.GROK_GOAL_SCRATCH || path.join(require('os').tmpdir(), 'grok-goal-0a451deb05ff', 'implementer');
require('../ui/manual_procedures.js');
var RD = globalThis.RD;

var appSrc = fs.readFileSync(path.join(ROOT, 'ui', 'app.js'), 'utf8');
var labels = {};
function addLabel(s) { if (s) labels[s.trim()] = true; }
var reL = /\{\s*l:\s*'([^']+)'/g, m;
while ((m = reL.exec(appSrc)) !== null) addLabel(m[1]);
var reSeg = /l:\s*'([^']+)'/g;
while ((m = reSeg.exec(appSrc)) !== null) addLabel(m[1]);
var reScram = /scram(?:Short)?:\s*'([^']+)'/g;
while ((m = reScram.exec(appSrc)) !== null) addLabel(m[1]);
addLabel('SCRAM');
addLabel('AZ-5');

/* Procedure control → required UI fragments (any match passes). */
var MAP = {
  'Control Bank → Withdraw (hold)': ['Control Bank', 'Withdraw'],
  'SCRAM': ['SCRAM'],
  'AZ-5': ['AZ-5'],
  'Rod Speed → Slow': ['Rod Speed', 'Slow'],
  'Rod Speed → +1': ['+1'],
  'Rod Speed → −1': ['−1'],
  'Turbine Load': ['Turbine Load'],
  'Pressurizer Spray (PZR)': ['Pressurizer Spray (PZR)'],
  'Feed Reg': ['Feed Reg'],
  'SCRAM': ['SCRAM', 'AZ-5'],
  'AFW → Start': ['AFW', 'Start'],
  'PORV Block Valve → Isolate': ['PORV Block Valve', 'Isolate'],
  'MCP / Channel Flow': ['MCP / Channel Flow'],
  'AZ-5': ['AZ-5'],
  'Recirc Drive Flow': ['Recirc Drive Flow'],
  'RCIC → On': ['RCIC', 'On'],
};

function labelOkSingle(control) {
  if (MAP[control]) {
    return MAP[control].every(function (frag) {
      return Object.keys(labels).some(function (l) { return l.indexOf(frag) >= 0; });
    });
  }
  return !!labels[control] || Object.keys(labels).some(function (l) {
    return l.indexOf(control) >= 0 || control.indexOf(l) >= 0;
  });
}
function labelOk(control) {
  if (!control || /^\(observe/.test(control)) return true;
  var parts = control.split(';').map(function (s) { return s.trim(); });
  return parts.every(labelOkSingle);
}

var mismatches = [];
Object.keys(RD.MANUAL_PROCEDURES).forEach(function (prof) {
  RD.MANUAL_PROCEDURES[prof].forEach(function (proc) {
    (proc.steps || []).forEach(function (st, i) {
      if (!st.control || labelOk(st.control)) return;
      mismatches.push(prof + ' · ' + proc.id + ' step ' + (i + 1) + ': "' + st.control + '"');
    });
  });
});

fs.mkdirSync(SCRATCH, { recursive: true });
var out = mismatches.length
  ? mismatches.join('\n') + '\n'
  : 'PASS — all procedure controls map to Plant Display labels.\n';
fs.writeFileSync(path.join(SCRATCH, 'manual-audit.txt'), out);
console.log(out.trim());
process.exit(mismatches.length ? 1 : 0);