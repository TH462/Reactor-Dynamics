/*
 * tools/hook_lane_status.js — SessionStart hook: report LANE OCCUPANCY at t=0.
 *
 * WHY THIS EXISTS (#343). CLAUDE.md has told every agent to check all three worktrees before
 * editing, and to tag its issue `status-wip-<lane>` when it starts. Both are prose rules that
 * depend on the agent remembering, and measured on 2026-08-04 both failed in the same session:
 * the t=0 sweep was run and reported nothing (the documented `gh` command was broken — three
 * `--label` flags are ANDed, so it returned 0 for every issue, always; fixed in f976e7b), and
 * two issues were then worked for hours in `develop` with no lane tag on either.
 *
 * A `run_*` gate cannot cover this: labels live on GitHub, not in the repo, so it would make
 * `run_all` network-dependent and red in CI for reasons unrelated to the code. A hook can —
 * and this repo already runs one (`PostToolUse` -> hook_repack_manuals.js).
 *
 * WHAT IT DOES. Prints the lane it is standing in, the uncommitted-file sweep and last-commit
 * age for all three trees, and every issue currently carrying a lane tag, into the session's
 * opening context. It reports; it never blocks.
 *
 * DESIGN RULES, each of which is a way this could have been useless:
 *  - IT CAN NEVER HANG. Every child process carries a timeout, and `gh` is a network call. A
 *    session-start hook that blocks is worse than no hook.
 *  - IT CAN NEVER THROW. Any failure degrades to a line saying what could not be checked.
 *    A hook that dies silently reports "no occupancy", which is the exact false negative the
 *    broken sweep produced for days.
 *  - "COULD NOT CHECK" IS NEVER PRINTED AS "CLEAR". The two are different facts and only one
 *    of them means it is safe to start editing.
 *  - IT DOES NOT DECIDE ANYTHING. CLAUDE.md's rule is WARN AND ASK on a positive, because the
 *    heuristic cannot tell another live session from the owner's own edits from your own
 *    leftovers. This hook feeds that rule; it does not pre-empt it.
 */
'use strict';
var cp = require('child_process');
var path = require('path');
var fs = require('fs');

var LANES = [
  { lane: 'develop',   tree: 'C:/grok_build/Reactor_Dynamics', branch: 'develop' },
  { lane: 'workbench', tree: 'C:/grok_build/RD_workbench',     branch: 'workbench' },
  { lane: 'backshop',  tree: 'C:/grok_build/RD_backshop',      branch: 'backshop' },
];
var REPO = 'TH462/Reactor-Dynamics';
// gh is installed per-user; a shell that predates the PATH edit will not have it (CLAUDE.md).
var GH_FALLBACK = 'C:\\Users\\Tim H\\AppData\\Local\\Programs\\gh\\bin\\gh.exe';

function run(cmd, ms) {
  try {
    return { ok: true, out: String(cp.execSync(cmd, {
      encoding: 'utf8', timeout: ms || 5000, stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })).trim() };
  } catch (e) {
    return { ok: false, out: '', why: (e && e.code === 'ETIMEDOUT') ? 'timed out' : 'failed' };
  }
}

function ghBin() {
  if (run('gh --version', 4000).ok) return 'gh';
  if (run('"' + GH_FALLBACK + '" --version', 4000).ok) return '"' + GH_FALLBACK + '"';
  return null;
}

function whichLane() {
  var here = process.cwd().replace(/\\/g, '/').toLowerCase();
  for (var i = 0; i < LANES.length; i++) {
    if (here.indexOf(LANES[i].tree.toLowerCase()) === 0) return LANES[i];
  }
  return null;
}

var lines = [];
var mine = whichLane();

lines.push('LANE OCCUPANCY (tools/hook_lane_status.js — see CLAUDE.md "check ALL trees")');
lines.push('You are in: ' + (mine ? mine.lane.toUpperCase() + '  (' + mine.tree + ')'
                                  : 'an UNRECOGNISED tree — ' + process.cwd()));
lines.push('');

// ---- the file sweep -------------------------------------------------------------
LANES.forEach(function (L) {
  var st = run('git -C ' + L.tree + ' status --short', 5000);
  // The format string MUST be quoted. Unquoted, a `|` separator is read by the shell as a
  // pipe and the whole command fails — caught by pipe-testing this hook rather than by
  // reading it, which is the only reason it is not silently printing "(log failed)" forever.
  var lg = run('git -C ' + L.tree + ' log ' + L.branch + ' -1 --format="%h %cr"', 5000);
  if (!st.ok) { lines.push('  ' + pad(L.lane) + 'COULD NOT CHECK (git status ' + st.why + ')'); return; }
  var dirty = st.out ? st.out.split('\n').filter(function (s) { return s.trim(); }).length : 0;
  var commit = lg.ok ? lg.out : '(log ' + (lg.why || 'failed') + ')';
  lines.push('  ' + pad(L.lane) + (dirty ? dirty + ' uncommitted file' + (dirty === 1 ? '' : 's') : 'clean') +
             '  ·  ' + commit + (L === mine ? '   <- you' : ''));
});
function pad(s) { while (s.length < 11) s += ' '; return s; }

// ---- am I in an audit lane? (#383) -----------------------------------------------
// MEASURED 2026-08-05: this hook printed a WIP issue TITLE — "#361 PWR: a large-break LOCA walks
// inventory to the 120 % mass_max clip" — into a session where the #221 exclusion had just removed
// CLAUDE.md and the memory index. A plant defect, by name, in the opening context of what was meant
// to be an unprimed auditor. Hooks fire regardless of claudeMdExcludes, so this is the ONE priming
// channel neither the settings file nor tools/audit_preflight.js can close. It has to close here.
//
// It also answers the question #296 asked and never got: make the priming state OBSERVABLE rather
// than remembered. Until now the only detector was the auditor being honest on turn one.
//
// WHAT IT CAN AND CANNOT SEE. Settings that apply BY DEFAULT — .claude/settings.json and
// .claude/settings.local.json — are readable, and settings.local.json is how the lanes are set up.
// A session launched with `--settings <file>` is NOT visible from here: the flag is a process
// argument, not state on disk. So a lane can be audit-mode without this knowing, and it says
// UNKNOWN rather than NORMAL — "could not check" is never printed as "clear" (see header).
function auditModeHere() {
  var seen = false, unreadable = false;
  ['settings.json', 'settings.local.json'].forEach(function (f) {
    var p = path.join(process.cwd(), '.claude', f);
    if (!fs.existsSync(p)) return;
    try {
      var c = JSON.parse(fs.readFileSync(p, 'utf8'));
      if ((c.claudeMdExcludes || []).length || c.autoMemoryEnabled === false) seen = true;
    } catch (e) { unreadable = true; }
  });
  return seen ? 'on' : (unreadable ? 'unknown' : 'off');
}
var audit = auditModeHere();

lines.push('');
if (audit === 'on') {
  lines.push('AUDIT LANE — CLAUDE.md exclusion IS in force here (.claude/settings*.json).');
  lines.push('  Ordinary work in this tree runs WITHOUT the orientation document. Issue titles are');
  lines.push('  suppressed below so this hook cannot prime a slice. See CLAUDE.md "Audit lanes".');
} else if (audit === 'unknown') {
  lines.push('AUDIT LANE: COULD NOT CHECK — .claude/settings*.json unreadable. NOT the same as "off".');
} else {
  lines.push('Normal lane — CLAUDE.md exclusion is NOT in force by default here.');
  lines.push('  (A session started with `--settings` is invisible to this hook; it is a process flag.)');
}

// ---- the lane tags — the only signal that is not a guess -------------------------
lines.push('');
var gh = ghBin();
if (!gh) {
  lines.push('  WIP tags: COULD NOT CHECK — gh not found on PATH. This is not "no one is working".');
} else {
  // --search with a COMMA LIST is the OR. Three `--label` flags are ANDed by gh and match
  // nothing, since the convention allows only ONE lane tag per issue — that is the defect
  // f976e7b fixed, and repeating it here would put it straight back.
  //
  // NO `--jq`. cmd.exe does not treat single quotes as quotes, so a --jq filter arrives
  // shredded and the call fails — which the first pipe-test of this hook reported as a bare
  // "gh failed", i.e. indistinguishable from being offline. Ask for JSON and parse it in
  // Node, which is shell-independent.
  var r = run(gh + ' issue list --repo ' + REPO +
              ' --search "label:status-wip-develop,status-wip-workbench,status-wip-backshop"' +
              ' --json number,title,labels', 15000);
  var rows = null;
  if (r.ok) { try { rows = JSON.parse(r.out || '[]'); } catch (e) { rows = null; } }
  if (!r.ok || rows === null) {
    lines.push('  WIP tags: COULD NOT CHECK — gh ' + (r.why || 'returned unparseable output') +
               '. This is NOT "no one is working".');
  } else if (!rows.length) {
    lines.push('  WIP tags: none — no issue is claimed by any lane right now.');
  } else {
    lines.push('  WIP tags — an agent has SAID it is live on these:');
    rows.forEach(function (it) {
      var tags = (it.labels || []).map(function (l) { return l.name; })
        .filter(function (n) { return n.indexOf('status-wip-') === 0; }).join(',');
      // The NUMBER and the LANE are what occupancy needs; the title is what primes. In an audit
      // lane the number alone still tells the auditor the lane is claimed, and looking the issue
      // up is then a deliberate act it must declare — not something done to it at t=0.
      lines.push('    #' + it.number + ' [' + tags + ']' +
                 (audit === 'on' ? ' (title withheld — audit lane)'
                                 : ' ' + String(it.title || '').slice(0, 60)));
    });
    lines.push('  A tag naming YOUR lane that you did not set: warn the owner and ask (CLAUDE.md).');
  }
}

lines.push('');
lines.push('REMINDER: tag your issue `status-wip-' + (mine ? mine.lane : '<lane>') +
           '` when you START, and clear it when you STOP — not when you finish.');
lines.push('A tag left standing after a session ends makes the next agent stand down for nobody.');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') },
  suppressOutput: true,
}));
