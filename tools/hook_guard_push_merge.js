/*
 * tools/hook_guard_push_merge.js — PreToolUse hook on Bash|PowerShell: the push/merge GUARD.
 *
 * WHY THIS EXISTS (2026-10-18). Three owner rules govern what moves between trees and to GitHub:
 *   - never push until he says so            (owner, 2026-09-14 — Blueprint/RULINGS.md "Push")
 *   - never merge into `develop` unless he says so, fast-forwards included (owner, 2026-07-31)
 *   - the overflow lanes are LOCAL: never push `workbench` / `backshop`      (owner, 2026-07-31)
 * All three lived as prose in CLAUDE.md, which is the class of rule this repo has measured
 * decaying (the lane sweep, the themes cap, the changelog roll). The Claude Code best-practices
 * guidance is to put a must-happen-every-time rule in a hook, not a sentence. This is that hook.
 *
 * WHAT IT DOES. Reads the tool call's command off stdin, finds every git/gh invocation in it
 * (chained with `&&`, `||`, `;`, `|`, newlines), and returns ONE of:
 *   - nothing (exit 0, no output)  — the normal permission flow applies; this is the common case
 *   - permissionDecision "ask"     — the owner approves in the prompt, which IS his permission
 *   - permissionDecision "deny"    — only for pushing a local lane, which nothing can authorise
 *
 * DESIGN RULES:
 *  - IT CAN NEVER BREAK A COMMAND. Any parse error, any unexpected input shape → exit 0, silent.
 *    A guard that crashes `git status` is removed within the hour and then guards nothing.
 *  - ASK, NOT DENY, FOR THE OWNER-GATED RULES. "Never push until he says so" means his yes is the
 *    permission; the prompt is where he gives it. Deny would make an authorised push impossible.
 *  - IT DECIDES ON THE TARGET TREE'S BRANCH, NOT THE SESSION'S. `git -C <path>`, a leading
 *    `cd <path> &&` (or Set-Location), and a `git checkout <branch>` earlier in the same chain all
 *    change which branch a later `git merge` moves. A lane fast-forwarding FROM develop
 *    (`git merge --ff-only develop` while on workbench) is the intended daily move and passes.
 *  - "COULD NOT CHECK" IS NOT "CLEAR" (same rule as hook_lane_status.js): a history-moving verb
 *    whose target branch cannot be read asks rather than passing.
 *
 * Test it by piping payloads:  echo '{"tool_input":{"command":"git push"}}' | node tools/hook_guard_push_merge.js
 */
'use strict';
var cp = require('child_process');
var fs = require('fs');

var PUSH_RULE = 'OWNER RULE (2026-09-14): never push until he says so — "Let\'s change the rule to ' +
  'don\'t push until I tell you to." A clean tree and a green gate are not permission. Approve ' +
  'here only if he has asked for this push.';
var LANE_RULE = 'OWNER RULE (2026-07-31): the overflow lanes are LOCAL — "I don\'t want the workbench ' +
  'or backshop trees pushed to gh. Gh should only have main and develop." A pushed lane also builds a ' +
  'public preview site. Blocked.';
var MERGE_RULE = 'OWNER RULE (2026-07-31): never merge into develop unless he says so — "We need a ' +
  'rule to never merge unless I say so. Develop was being worked." Applies to fast-forwards, pulls, ' +
  'rebases and resets that move develop. PWR2 (#479) carries a standing hold on top. Approve here ' +
  'only if he has asked for it.';
var PR_RULE = 'OWNER RULE: merging a pull request moves `main` (a release) or `develop`. Both are ' +
  'owner-gated (2026-07-31 never-merge, 2026-09-14 never-push). Approve here only if he has asked.';

function out(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }));
}

function branchOf(dir) {
  try {
    return String(cp.execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: dir, encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    })).trim();
  } catch (e) { return null; }
}

function unquote(s) { return s.replace(/^["']+|["']+$/g, ''); }

// Split a shell/PowerShell command into segments at the chaining operators. Quotes are not
// honoured — a `&&` inside a commit message would over-split, which only ever produces an
// EXTRA look at a fragment, never a missed git verb.
function segments(cmd) {
  return cmd.split(/\s*(?:&&|\|\||;|\||\r?\n)\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
}

function tokens(seg) {
  // Strip a leading subshell paren, env assignments and `sudo`-style prefixes we do not use.
  var t = seg.replace(/^\(+/, '').split(/\s+/).filter(Boolean);
  while (t.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0])) t.shift();
  return t.map(unquote);
}

// Parse one segment as a git invocation: returns {verb, args, dir} or null.
function parseGit(t) {
  var i = 0;
  if (!/^(git|git\.exe)$/i.test(t[i] || '')) return null;
  i++;
  var dir = null;
  while (i < t.length && t[i][0] === '-') {
    if (t[i] === '-C') { dir = t[i + 1] || null; i += 2; continue; }
    if (t[i] === '-c') { i += 2; continue; }
    if (/^-C.+/.test(t[i])) { dir = t[i].slice(2); i++; continue; }
    i++;   // --no-pager, --git-dir=…, etc.
  }
  if (i >= t.length) return null;
  return { verb: t[i].toLowerCase(), args: t.slice(i + 1), dir: dir };
}

function decide(input) {
  var cmd = input && input.tool_input && input.tool_input.command;
  if (typeof cmd !== 'string' || !cmd.trim()) return null;

  var cwd = (input.cwd && typeof input.cwd === 'string') ? input.cwd : process.cwd();
  var checkedOut = null;        // a `git checkout/switch <branch>` earlier in the chain
  var segs = segments(cmd);

  for (var s = 0; s < segs.length; s++) {
    var t = tokens(segs[s]);
    if (!t.length) continue;

    // Directory changes that affect later segments.
    if (/^(cd|set-location|sl|pushd|push-location)$/i.test(t[0]) && t[1]) {
      var target = t[1] === '/d' ? t[2] : t[1];     // cmd-style `cd /d <path>`
      if (target && target !== '-') { cwd = target; checkedOut = null; }
      continue;
    }

    // gh pr merge → ask.
    if (/^gh(\.exe)?$/i.test(t[0]) && (t[1] || '').toLowerCase() === 'pr' && (t[2] || '').toLowerCase() === 'merge') {
      return { d: 'ask', r: PR_RULE };
    }

    var g = parseGit(t);
    if (!g) continue;
    var dir = g.dir || cwd;

    if (g.verb === 'checkout' || g.verb === 'switch') {
      var b = g.args.filter(function (a) { return a[0] !== '-'; })[0];
      if (b && !/^(--|\.)/.test(b) && g.args.indexOf('--') < 0 && g.args.indexOf('-b') < 0 &&
          g.args.indexOf('-c') < 0) checkedOut = b;
      continue;
    }

    if (g.verb === 'push') {
      var pushesLane = g.args.some(function (a) {
        return /^(refs\/heads\/)?(workbench|backshop)(:|$)/i.test(a) || /^(--all|--mirror)$/.test(a);
      });
      if (pushesLane) return { d: 'deny', r: LANE_RULE };
      return { d: 'ask', r: PUSH_RULE };
    }

    if (/^(merge|pull|rebase|cherry-pick|reset)$/.test(g.verb)) {
      if (g.verb === 'reset') {
        // A path reset (`git reset -- <file>` / `git reset <existing file>`) unstages; it does
        // not move the branch tip. Anything else does.
        var a = g.args;
        if (a.indexOf('--') >= 0) continue;
        var modeFlag = a.some(function (x) { return /^--(hard|soft|mixed|merge|keep)$/.test(x); });
        var first = a.filter(function (x) { return x[0] !== '-'; })[0];
        if (!modeFlag && first && fs.existsSync(require('path').resolve(dir, first))) continue;
      }
      var br = checkedOut || branchOf(dir);
      if (br === null) {
        return { d: 'ask', r: 'Could not read the current branch of ' + dir + ' before `git ' + g.verb +
          '`. If this tree is on develop: ' + MERGE_RULE };
      }
      if (br.toLowerCase() === 'develop') return { d: 'ask', r: MERGE_RULE };
      // On a lane (workbench/backshop/scratch): merging develop IN is the intended daily move.
    }
  }
  return null;
}

var raw = '';
try {
  raw = fs.readFileSync(0, 'utf8');
} catch (e) { process.exit(0); }
var input = null;
try { input = JSON.parse(raw); } catch (e) { process.exit(0); }
var verdict = null;
try { verdict = decide(input); } catch (e) { process.exit(0); }
if (verdict) out(verdict.d, verdict.r);
process.exit(0);
