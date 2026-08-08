/*
 * tools/audit_preflight.js — refuse to launch a #221 audit slice that is not actually independent.
 *
 * WHY THIS EXISTS (#382). #221 RoE 1 says: do not hand the auditor prior conclusions. That rule is
 * implemented by excluding CLAUDE.md and the auto-memory index from the session, plus
 * `Blueprint/AUDIT_CHARTER.md` in their place.
 *
 * The exclusion itself WORKS and has been verified twice by the charter's first-turn check (#296
 * caught a primed session and aborted before any finding; its clean re-run reported PASSED). What
 * has never been reliable is ARMING it: the `--settings` flag lived in an issue body, and the runs
 * that came out clean got there through `.claude/settings.local.json` layering instead. An earlier
 * version of this header claimed the mechanism had "never once been exercised" — that was wrong,
 * corrected 2026-08-05; see Diagnostic/TUNING_LOG.md 2026-08-05-backshop-a.
 *
 * THE FAILURE MODE THIS GUARDS. `settings.audit.json` names it in its own comments: a pattern that
 * silently fails to match "would look exactly like a clean audit". Every other way this breaks has
 * the same shape — a renamed settings key after a CLI upgrade, a fourth worktree nobody added to
 * the hand-maintained exclude list, a slice issue with no SUBJECTS TO TEST section. In every case
 * the audit RUNS, produces findings, and reads as independent. There is no red anywhere.
 *
 * So this exits 2 and names the cause, rather than warning. A warning in front of a session that
 * is about to start is a warning nobody reads.
 *
 * WHAT IT CANNOT DO. It is a static check running OUTSIDE the session it is protecting, so it can
 * only prove the configuration is right — never that the running session honoured it. That half is
 * the auditor's first-turn self-check, on the record in the slice issue before any finding
 * (AUDIT_CHARTER.md header + §11). Both halves are needed; neither substitutes for the other.
 *
 * HOW A SLICE IS ACTUALLY LAUNCHED (ruled 2026-08-08, superseding #383/2026-08-06). THE AUDIT LANE
 * IS `C:\grok_build\RD_Audit`, and it is the only one. It is NOT a checkout: it is a plain
 * directory holding the auditor's `CLAUDE.md`, its `findings/`, and a detached-HEAD worktree at
 * `tree/`. The session's cwd is the directory, not the worktree. It carries
 * `.claude/settings.local.json` with the exclusions, which layers BY DEFAULT and needs no flag, so
 * a plain session started there is already unprimed and a `/clear` begins a slice.
 *
 * The three WORK lanes — `develop`, `RD_workbench`, `RD_backshop` — are now all ordinary and all
 * keep their CLAUDE.md. #383 armed both overflow lanes; 2026-08-06 narrowed that to backshop only,
 * at the stated cost that ordinary work there ran unprimed too. Moving the lane to its own
 * directory retires that cost. To audit from a work lane anyway, the flag route still exists:
 * `claude --settings .claude/settings.audit.json`. This script checks either configuration.
 *
 * Note what it cannot tell you: it only ever checks the tree it is RUN IN, so it can never answer
 * "which lanes are currently unprimed?" — run it where you intend to audit, not somewhere else.
 * The exception is the auditor's orientation document, which is a global fact and is checked
 * wherever this runs (check 7).
 *
 *   node tree/tools/audit_preflight.js 344         # from RD_Audit — the normal case
 *   node tools/audit_preflight.js 344              # from a work lane: checks the FLAG route
 *   node tools/audit_preflight.js --settings=<p>   # check a copy instead (injection-testing)
 *   node tools/audit_preflight.js --no-gh          # skip the slice-issue checks (offline)
 */
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var deploy = require('./audit_deploy');

var REPO_ROOT = path.resolve(__dirname, '..');
var AUDIT_SETTINGS = path.join(REPO_ROOT, '.claude', 'settings.audit.json');
var LOCAL_SETTINGS = path.join(REPO_ROOT, '.claude', 'settings.local.json');
// The audit lane's settings live one level ABOVE the worktree, because the session's cwd is the
// lane directory and not the checkout. Resolving this by walking up from REPO_ROOT would give the
// right answer in the audit lane and a wrong one everywhere else; audit_deploy exports the literal.
var LANE_SETTINGS = path.join(deploy.AUDIT_ROOT, '.claude', 'settings.local.json');
var IN_AUDIT_TREE = path.resolve(REPO_ROOT).toLowerCase() ===
                    path.resolve(deploy.AUDIT_ROOT, 'tree').toLowerCase();

// CHECK THE FILE THAT IS ACTUALLY IN FORCE, not the one named after the job. Checking
// settings.audit.json in a lane that never loads it would validate a file the session ignores —
// the same class of error this script exists to catch.
//
// Run from RD_Audit/tree, the operative file is RD_Audit/.claude/settings.local.json, one level up
// and outside the repo. Run from a work lane, it is that lane's own settings.local.json if it has
// excludes (none does now), otherwise the flag route.
function defaultSettings() {
  if (IN_AUDIT_TREE) return { path: LANE_SETTINGS, lane: true };
  try {
    var c = JSON.parse(fs.readFileSync(LOCAL_SETTINGS, 'utf8'));
    if ((c.claudeMdExcludes || []).length) return { path: LOCAL_SETTINGS, lane: true };
  } catch (e) { /* absent or unreadable — fall through to the flag route */ }
  return { path: AUDIT_SETTINGS, lane: false };
}
var DEFAULT = defaultSettings();
var DEFAULT_SETTINGS = DEFAULT.path;
var CHARTER = path.join(REPO_ROOT, 'Blueprint', 'AUDIT_CHARTER.md');
var REPO = 'TH462/Reactor-Dynamics';
// gh is installed per-user; a shell that predates the PATH edit will not have it (CLAUDE.md).
var GH_FALLBACK = 'C:\\Users\\Tim H\\AppData\\Local\\Programs\\gh\\bin\\gh.exe';

var failures = [];

function fail(check, why, fix) {
  failures.push({ check: check, why: why, fix: fix });
}

function run(cmd, ms) {
  try {
    return { ok: true, out: String(cp.execSync(cmd, {
      encoding: 'utf8', timeout: ms || 8000, stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })).trim() };
  } catch (e) {
    return { ok: false, out: '', why: (e && e.code === 'ETIMEDOUT') ? 'timed out' : 'failed' };
  }
}

function ghBin() {
  if (run('gh --version', 5000).ok) return 'gh';
  if (run('"' + GH_FALLBACK + '" --version', 5000).ok) return '"' + GH_FALLBACK + '"';
  return null;
}

// ---- arguments ------------------------------------------------------------------
var slice = null, settingsPath = DEFAULT_SETTINGS, useGh = true;
process.argv.slice(2).forEach(function (a) {
  if (/^\d+$/.test(a)) slice = a;
  else if (a.indexOf('--settings=') === 0) settingsPath = a.slice(11);
  else if (a === '--no-gh') useGh = false;
  else if (a === '--help' || a === '-h') {
    console.log('usage: node tools/audit_preflight.js [<slice-issue>] [--settings=<path>] [--no-gh]');
    console.log('');
    console.log('  Checks that a #221 audit slice would actually be independent, and exits 2');
    console.log('  naming the cause if not. How this tree launches is printed on success.');
    process.exit(0);
  }
  else if (a === '--print') { /* accepted, no-op — this script never launches */ }
  else {
    console.error('audit_preflight: unknown argument "' + a + '"');
    console.error('usage: node tools/audit_preflight.js [<slice-issue>] [--settings=<path>] [--no-gh]');
    process.exit(2);
  }
});

// ---- 1. the settings file exists and parses --------------------------------------
var cfg = null;
if (!fs.existsSync(settingsPath)) {
  fail('settings file', settingsPath + ' does not exist',
       'the audit settings file is what excludes CLAUDE.md — without it the launch is bare');
} else {
  try {
    cfg = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (e) {
    fail('settings file', settingsPath + ' is not valid JSON — ' + e.message,
         'the CLI would fall back to its defaults, i.e. a primed session');
  }
}

// ---- 2. auto-memory is off -------------------------------------------------------
// Excluding CLAUDE.md alone leaves the memory index in place, which is the worked case #221 RoE 1
// actually cites (the trip-block-hybrid-model memory, slice 1, 2026-08-02).
if (cfg && cfg.autoMemoryEnabled !== false) {
  fail('autoMemoryEnabled', 'is ' + JSON.stringify(cfg.autoMemoryEnabled) + ', must be false',
       'the auto-memory index loads alongside CLAUDE.md and carries settled conclusions');
}

// ---- 3. EVERY worktree's CLAUDE.md is excluded, verbatim, both slash directions ----
// Verbatim string comparison on purpose. Re-implementing the CLI's glob semantics here to decide
// whether `**/grok_build/**/CLAUDE.md` matches would put a second, differently-buggy matcher in
// front of the first — and the whole point is that a matcher disagreeing with itself is invisible.
// The explicit per-path entries are what must hold; a new tree then fails loudly instead of leaking.
var excludes = (cfg && cfg.claudeMdExcludes) || [];
if (cfg && !excludes.length) {
  fail('claudeMdExcludes', 'is empty or absent', 'nothing is excluded — the session is primed');
}
if (cfg && excludes.length) {
  var wt = run('git -C "' + REPO_ROOT + '" worktree list --porcelain', 8000);
  if (!wt.ok) {
    fail('worktree sweep', 'could not run `git worktree list` (' + wt.why + ')',
         'cannot prove every tree is covered; fix git access rather than skipping this');
  } else {
    var trees = wt.out.split(/\r?\n/)
      .filter(function (l) { return l.indexOf('worktree ') === 0; })
      .map(function (l) { return l.slice(9).trim(); });
    if (!trees.length) fail('worktree sweep', 'reported no worktrees', 'unexpected — check git');
    trees.forEach(function (t) {
      var md = path.join(t, 'CLAUDE.md');
      if (!fs.existsSync(md)) return;            // a tree without one needs no exclusion
      var fwd = md.replace(/\\/g, '/');
      var back = md.replace(/\//g, '\\');
      var hasFwd = excludes.indexOf(fwd) !== -1;
      var hasBack = excludes.indexOf(back) !== -1;
      if (!hasFwd || !hasBack) {
        fail('claudeMdExcludes', 'worktree ' + t + ' is not fully covered — missing ' +
             (!hasFwd ? 'forward-slash form "' + fwd + '"' : '') +
             (!hasFwd && !hasBack ? ' and ' : '') +
             (!hasBack ? 'backslash form "' + back + '"' : ''),
             'add both forms to claudeMdExcludes; the list is hand-maintained per tree');
      }
    });
  }
}

// ---- 3b. the exclude list is FULLY EXPLICIT — no wildcards ------------------------
// A catch-all `**/grok_build/**/CLAUDE.md` used to head this list as belt-and-braces. Since the
// audit lane moved to C:\grok_build\RD_Audit that pattern is a defect rather than a safety net: it
// also matches RD_Audit/CLAUDE.md, the auditor's own orientation and the ONE file in the lane that
// must load. An auditor handed no orientation measures at the wrong layer — protection read
// engine-direct reports a plant with no ESF arms at all — and files false findings. Like every
// other failure guarded here, nothing about that outcome announces itself.
//
// Covering a newly-added worktree is check 3's job; it enumerates `git worktree list` and demands
// both slash forms verbatim. A wildcard cannot do that job any better and can do this damage, so
// the rule is: no wildcards. That is checkable without re-implementing glob semantics, which this
// file refuses to do on principle (check 3).
excludes.forEach(function (e) {
  if (/[*?[\]{}!]/.test(e)) {
    fail('claudeMdExcludes', 'entry "' + e + '" contains glob metacharacters',
         'the list must be explicit, one absolute path per entry. A wildcard broad enough to ' +
         'cover the work lanes also swallows RD_Audit/CLAUDE.md, leaving the auditor unoriented');
  }
});

// ---- 4. the key names still exist in the installed CLI ----------------------------
// THE UPGRADE TRAP. settings.audit.json is hand-written and nothing validates it: an unknown key
// is ignored in silence. If a CLI upgrade renames either key, the audit degrades to a bare launch
// that still prints a settings flag. Measured 2026-08-05 on @anthropic-ai/claude-code@2.1.222:
// both key names are present in the shipped binary.
// The asymmetry is deliberate: NOT FINDING the binary is a note, because the wrapper can be run
// from a machine where it lives somewhere unguessed. Finding it and NOT finding the key is a hard
// failure, because that is positive evidence of a rename.
(function () {
  // `where claude` yields the npm shim (a shell script), not the 279 MB binary the keys live in,
  // so resolve the package directory instead.
  var cands = [];
  var root = run('npm root -g', 8000);
  if (root.ok) cands.push(path.join(root.out.split(/\r?\n/)[0].trim(), '@anthropic-ai', 'claude-code'));
  var home = process.env.USERPROFILE || process.env.HOME || '';
  if (home) cands.push(path.join(home, '.claude', 'local', 'node_modules', '@anthropic-ai', 'claude-code'));
  var which = run(process.platform === 'win32' ? 'where claude' : 'command -v claude', 5000);
  if (which.ok) {
    cands.push(path.join(path.dirname(which.out.split(/\r?\n/)[0].trim()),
                         'node_modules', '@anthropic-ai', 'claude-code'));
  }

  var target = null;
  for (var i = 0; i < cands.length && !target; i++) {
    ['cli.js', path.join('bin', 'claude.exe'), path.join('bin', 'claude')].forEach(function (f) {
      var p = path.join(cands[i], f);
      if (!target && fs.existsSync(p) && fs.statSync(p).isFile()) target = p;
    });
  }
  if (!target) {
    console.error('  note: could not locate the installed claude-code package — settings-key ' +
                  'check skipped. This check is advisory; the rest of the preflight still ran.');
    return;
  }

  // Chunked scan with overlap — the binary is ~279 MB and must not be slurped into memory.
  var missing = ['claudeMdExcludes', 'autoMemoryEnabled'];
  var CHUNK = 4 * 1024 * 1024, OVERLAP = 64;
  var fd = fs.openSync(target, 'r');
  try {
    var buf = Buffer.alloc(CHUNK + OVERLAP), pos = 0, carry = '';
    for (;;) {
      var n = fs.readSync(fd, buf, 0, CHUNK, pos);
      if (n <= 0) break;
      var text = carry + buf.toString('latin1', 0, n);
      missing = missing.filter(function (k) { return text.indexOf(k) === -1; });
      if (!missing.length) break;
      carry = text.slice(-OVERLAP);
      pos += n;
    }
  } finally { fs.closeSync(fd); }

  missing.forEach(function (k) {
    fail('CLI settings schema', '"' + k + '" does not appear in ' + target,
         'the key was probably renamed by a CLI upgrade — an unknown key is ignored SILENTLY, ' +
         'so the slice would run primed while still printing a --settings flag');
  });
})();

// ---- 5. the charter exists -------------------------------------------------------
if (!fs.existsSync(CHARTER)) {
  fail('charter', 'Blueprint/AUDIT_CHARTER.md is missing',
       'it is what the auditor reads INSTEAD of CLAUDE.md; without it there is no orientation');
}

// ---- 6. the slice issue is real, open, and carries SUBJECTS TO TEST ---------------
// #221 process step 1 as amended: each slice issue must list the auto-loaded claims inside its
// scope, marked SUBJECTS TO TEST. An auditor cannot un-read them; it can be told they are on trial.
if (slice && useGh) {
  var gh = ghBin();
  if (!gh) {
    console.error('  note: gh not found — slice-issue checks skipped (re-run with gh on PATH).');
  } else {
    var iss = run(gh + ' issue view ' + slice + ' --repo ' + REPO + ' --json state,title,body', 20000);
    if (!iss.ok) {
      fail('slice issue', 'could not read issue #' + slice + ' (' + iss.why + ')',
           'check the number, and that gh is authenticated');
    } else {
      var j = null;
      try { j = JSON.parse(iss.out); } catch (e) { /* handled below */ }
      if (!j) {
        fail('slice issue', 'gh returned unparseable JSON for #' + slice, 'check gh');
      } else {
        if (j.state !== 'OPEN') {
          fail('slice issue', '#' + slice + ' is ' + j.state + ' — "' + j.title + '"',
               'a closed slice is not the one to run');
        }
        if (String(j.body || '').indexOf('SUBJECTS TO TEST') === -1) {
          fail('slice issue', '#' + slice + ' has no SUBJECTS TO TEST section',
               '#221 process step 1 requires the slice to list the auto-loaded claims inside its ' +
               'scope, marked as on trial. Write that section before running the slice.');
        }
      }
    }
  }
}

// ---- 7. the auditor's orientation is deployed, current, and NOT excluded ----------
// Checks 1-6 all ask whether the WRONG documents were kept out. This one asks whether the RIGHT
// one got in, which is the failure the move to a dedicated lane introduced. RD_Audit/CLAUDE.md is
// generated from Blueprint/AUDITOR_ORIENTATION.md and lives outside the repo, so it has three ways
// to be wrong that a tracked file does not: never deployed, deployed then left behind by an edit
// to the master, or deployed and then excluded along with the others.
//
// Unlike every other check this is a GLOBAL fact, not a property of the tree this ran in, so it
// runs wherever this is invoked from.
(function () {
  if (!fs.existsSync(deploy.AUDIT_ROOT)) {
    fail('audit lane', deploy.AUDIT_ROOT + ' does not exist',
         'rebuild it: git worktree add --detach "' + deploy.AUDIT_ROOT + '/tree" develop, ' +
         'then node tools/audit_deploy.js — see Blueprint/AUDIT_CHARTER.md §12');
    return;
  }
  if (!fs.existsSync(deploy.DEPLOYED)) {
    fail('auditor orientation', deploy.DEPLOYED + ' is missing',
         'the auditor would start with NO orientation document and no way to know it. ' +
         'Deploy it: node tools/audit_deploy.js');
  } else if (!deploy.isCurrent()) {
    fail('auditor orientation', deploy.DEPLOYED + ' has drifted from Blueprint/AUDITOR_ORIENTATION.md',
         'the auditor is reading a stale copy of its own rules. Re-deploy: node tools/audit_deploy.js');
  }
  var fwd = deploy.DEPLOYED.replace(/\\/g, '/');
  var back = deploy.DEPLOYED.replace(/\//g, '\\');
  if (excludes.indexOf(fwd) !== -1 || excludes.indexOf(back) !== -1) {
    fail('auditor orientation', 'RD_Audit/CLAUDE.md is itself in claudeMdExcludes',
         'that is the auditor\'s orientation, not a priming source — the excludes cover the work ' +
         'lanes and RD_Audit/tree/CLAUDE.md, never this file. Remove the entry.');
  }
})();

// ---- verdict ---------------------------------------------------------------------
if (failures.length) {
  console.error('');
  console.error('AUDIT PREFLIGHT FAILED — ' + failures.length + ' problem(s). Not launching.');
  console.error('An audit launched over any of these produces findings that READ as independent.');
  console.error('');
  failures.forEach(function (f, i) {
    console.error('  ' + (i + 1) + '. [' + f.check + '] ' + f.why);
    console.error('     -> ' + f.fix);
  });
  console.error('');
  process.exit(2);
}

var rel = path.relative(REPO_ROOT, settingsPath).replace(/\\/g, '/');
var lane = settingsPath === LOCAL_SETTINGS || settingsPath === LANE_SETTINGS;
console.log('audit preflight OK — settings ' + rel + ', ' + excludes.length + ' exclude entries, ' +
            'auto-memory off, orientation deployed and current' +
            (slice ? ', slice #' + slice + ' open with SUBJECTS TO TEST' : ''));
console.log('');
if (settingsPath === LANE_SETTINGS) {
  console.log('  THIS IS THE AUDIT LANE — ' + deploy.AUDIT_ROOT + ' (ruled 2026-08-08).');
  console.log('  settings.local.json there layers by default, so a plain session started in the');
  console.log('  LANE DIRECTORY is already unprimed and a /clear begins a slice. Start the session');
  console.log('  in ' + deploy.AUDIT_ROOT + ', NOT in tree/ — the orientation and the');
  console.log('  exclusions both hang off that cwd, and starting a level down silently gets you');
  console.log('  the repo\'s own settings and no auditor CLAUDE.md.');
} else if (lane) {
  console.log('  THIS IS AN AUDIT LANE. settings.local.json layers by default, so a plain');
  console.log('  session started in this tree is already unprimed — no flag, and a /clear is');
  console.log('  enough to begin a slice. Ordinary non-audit work here also runs without CLAUDE.md;');
  console.log('  that is the accepted cost of arming a work lane, not an accident.');
} else {
  console.log('  launch:  claude --settings ' + rel);
  console.log('  (no settings.local.json here, so the flag is what arms the exclusion)');
}
console.log('');
console.log('  This proves the CONFIGURATION is right. It cannot prove the SESSION honoured it —');
console.log('  the auditor\'s first turn must state, in the slice issue, whether CLAUDE.md was');
console.log('  auto-loaded into its context and whether it sees a memory index. #221 caveat (a).');
console.log('  The SessionStart hook now reports the lane\'s mode in the opening context too.');
process.exit(0);
