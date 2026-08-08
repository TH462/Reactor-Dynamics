/*
 * tools/audit_deploy.js — deploy the auditor's orientation into the audit lane, and expose the
 * same computation to tools/audit_preflight.js so the two can never disagree about what
 * "up to date" means.
 *
 * WHY A SEPARATE COPY EXISTS AT ALL. The audit lane is `C:\grok_build\RD_Audit`, which is NOT a
 * checkout — it is a plain directory holding the auditor's `CLAUDE.md`, its `findings/`, and a
 * detached-HEAD worktree at `tree/`. The auditor's orientation has to sit at `RD_Audit/CLAUDE.md`
 * because that is the only path the harness auto-loads, and that path is outside the repo. So the
 * document is authored in `Blueprint/AUDITOR_ORIENTATION.md` (tracked, versioned, propagates to
 * every worktree) and COPIED out.
 *
 * A second copy of a document is a second source of truth — .gitignore already records this repo
 * learning it the hard way with CLAUDE.md in 2026-07-29. The mitigation is that the copy is
 * generated, never edited, and `audit_preflight.js` refuses a slice when it has drifted from the
 * master. That turns two copies into a verified mirror.
 *
 * THE SPLIT. The master's first section is editorial — who may edit it, what may go in it, how to
 * deploy. That is guidance for the primed session maintaining the file, not orientation for the
 * auditor, so it is stripped at the first `---` rule. Both the deploy and the drift check call
 * deployedText() here; there is deliberately not a second implementation of the split.
 *
 *   node tools/audit_deploy.js            # write RD_Audit/CLAUDE.md from the master
 *   node tools/audit_deploy.js --check    # exit 1 if it has drifted; write nothing
 */
'use strict';
var fs = require('fs');
var path = require('path');

// Hardcoded, like the tree list in tools/hook_lane_status.js and the excludes in
// .claude/settings*.json. It cannot be derived: this script runs from BOTH an ordinary lane (where
// the audit root is a sibling of the repo root) and from RD_Audit/tree (where it is the parent),
// and a rule that resolves differently depending on where it ran is the failure this repo keeps
// catching. One literal, one meaning.
var AUDIT_ROOT = 'C:/grok_build/RD_Audit';
var REPO_ROOT = path.resolve(__dirname, '..');
var MASTER = path.join(REPO_ROOT, 'Blueprint', 'AUDITOR_ORIENTATION.md');
var DEPLOYED = path.join(AUDIT_ROOT, 'CLAUDE.md');

// Everything after the first line that is exactly `---`. Returns null if the master is missing or
// has no rule, which the callers report as a failure rather than deploying a truncated document.
function deployedText() {
  if (!fs.existsSync(MASTER)) return null;
  var src = fs.readFileSync(MASTER, 'utf8').replace(/\r\n/g, '\n');
  var m = src.match(/\n---\n/);
  if (!m) return null;
  return src.slice(m.index + m[0].length).replace(/^\n+/, '');
}

module.exports = {
  AUDIT_ROOT: AUDIT_ROOT,
  MASTER: MASTER,
  DEPLOYED: DEPLOYED,
  deployedText: deployedText,
  // true only if the deployed copy exists and matches byte-for-byte after newline normalisation.
  isCurrent: function () {
    var want = deployedText();
    if (want === null || !fs.existsSync(DEPLOYED)) return false;
    return fs.readFileSync(DEPLOYED, 'utf8').replace(/\r\n/g, '\n') === want;
  },
};

if (require.main === module) {
  var check = process.argv.indexOf('--check') !== -1;
  var want = deployedText();
  if (want === null) {
    console.error('audit_deploy: ' + MASTER + ' is missing or has no `---` rule. Nothing deployed.');
    process.exit(2);
  }
  if (!fs.existsSync(AUDIT_ROOT)) {
    console.error('audit_deploy: audit lane ' + AUDIT_ROOT + ' does not exist.');
    console.error('  create it with:  git worktree add --detach "' + AUDIT_ROOT + '/tree" develop');
    process.exit(2);
  }
  if (check) {
    if (module.exports.isCurrent()) {
      console.log('audit_deploy: RD_Audit/CLAUDE.md is current (' + want.length + ' bytes).');
      process.exit(0);
    }
    console.error('audit_deploy: RD_Audit/CLAUDE.md has DRIFTED from Blueprint/AUDITOR_ORIENTATION.md.');
    console.error('  fix:  node tools/audit_deploy.js');
    process.exit(1);
  }
  fs.writeFileSync(DEPLOYED, want, 'utf8');
  console.log('audit_deploy: wrote ' + DEPLOYED + ' (' + want.length + ' bytes) from the master.');
}
