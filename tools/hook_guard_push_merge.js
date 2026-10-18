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
 * (chained with `&&`, `||`, `;`, `|`, a lone `&`, newlines; nested in `bash -c "…"`,
 * `powershell -Command "…"`, `cmd /c "…"` or `$(…)`), and returns ONE of:
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
 *    A lane push is denied however it is spelled: by refspec destination, or — with no refspec
 *    or `HEAD` — by the tree's current branch (plain `git push` from RD_workbench is a lane push).
 *  - "COULD NOT CHECK" IS NOT "CLEAR" (same rule as hook_lane_status.js): a history-moving verb
 *    whose target branch cannot be read asks rather than passing.
 *  - DEVELOP CAN BE MOVED WITHOUT STANDING ON IT: `fetch <x>:develop`, `branch -f develop`,
 *    `update-ref refs/heads/develop`, `checkout -B develop`, `switch -C develop` all ask.
 *
 * Test it by piping payloads:  echo '{"tool_input":{"command":"git push"}}' | node tools/hook_guard_push_merge.js
 */
'use strict';
var cp = require('child_process');
var fs = require('fs');
var path = require('path');

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

var LANE = /^(workbench|backshop)$/i;
var PREFIX = /^(&|env|command|time|nohup|exec|sudo|builtin)$/i;
var SHELL = /^(bash|sh|zsh|dash|powershell|pwsh|cmd)(\.exe)?$/i;

function out(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }));
}

function git(dir, args) {
  try {
    return String(cp.execSync('git ' + args, {
      cwd: dir, encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    })).trim();
  } catch (e) { return null; }
}
function branchOf(dir) { return git(dir, 'rev-parse --abbrev-ref HEAD'); }
function isRef(dir, name) { return git(dir, 'rev-parse --verify --quiet "' + name + '"') !== null; }

// Git-Bash spells C:/x as /c/x; the hook's child processes are not Git Bash.
function normPath(p) {
  var m = /^\/([a-zA-Z])(\/.*)?$/.exec(p);
  if (m) return m[1].toUpperCase() + ':' + (m[2] || '/');
  return p;
}
function baseIs(tok, name) {
  var b = tok.replace(/\\/g, '/').split('/').pop().toLowerCase();
  return b === name || b === name + '.exe';
}

// ---- quote-aware splitting and tokenizing ---------------------------------------------------
// Segments: split at &&, ||, |, ;, newline and a LONE & (not `2>&1`, `&>`, `<&`), outside quotes.
function splitSegments(cmd) {
  var segs = [], cur = '', q = null;
  for (var i = 0; i < cmd.length; i++) {
    var c = cmd[i], n = cmd[i + 1], p = cmd[i - 1];
    if (q) { cur += c; if (c === q && p !== '\\') q = null; continue; }
    if (c === '"' || c === '\'') { q = c; cur += c; continue; }
    if (c === '\n' || c === ';') { segs.push(cur); cur = ''; continue; }
    if (c === '|') { segs.push(cur); cur = ''; if (n === '|') i++; continue; }
    if (c === '&') {
      if (n === '&') { segs.push(cur); cur = ''; i++; continue; }
      if (p === '>' || p === '<' || n === '>') { cur += c; continue; }   // redirections
      segs.push(cur); cur = ''; continue;                                 // lone & (background / PS call op)
    }
    cur += c;
  }
  segs.push(cur);
  return segs.map(function (s) { return s.trim(); }).filter(Boolean);
}
// Tokens: whitespace-separated, quotes removed, a quoted span kept as one token.
function tokenize(seg) {
  var t = [], cur = '', q = null, had = false;
  seg = seg.replace(/^\(+/, '');
  for (var i = 0; i < seg.length; i++) {
    var c = seg[i];
    if (q) {
      if (c === '\\' && q === '"' && (seg[i + 1] === '"' || seg[i + 1] === '\\')) { cur += seg[++i]; continue; }
      if (c === q) { q = null; continue; }
      cur += c; continue;
    }
    if (c === '"' || c === '\'') { q = c; had = true; continue; }
    if (/\s/.test(c)) { if (cur || had) t.push(cur); cur = ''; had = false; continue; }
    cur += c;
  }
  if (cur || had) t.push(cur);
  return t;
}
// `$( … )` bodies, balanced, anywhere in the command — scanned as commands in their own right.
function subshells(cmd) {
  var outl = [], i = 0;
  while ((i = cmd.indexOf('$(', i)) >= 0) {
    var d = 0, j = i + 1;
    for (; j < cmd.length; j++) {
      if (cmd[j] === '(') d++;
      else if (cmd[j] === ')') { d--; if (d === 0) break; }
    }
    outl.push(cmd.slice(i + 2, j));
    i = j + 1;
  }
  return outl;
}

// ---- git invocation parsing --------------------------------------------------------------
function stripPrefixes(t) {
  var i = 0;
  while (i < t.length) {
    if (PREFIX.test(t[i])) { i++; continue; }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t[i])) { i++; continue; }   // env assignment (bare or after `env`)
    break;
  }
  return t.slice(i);
}
function parseGit(t) {
  if (!t.length || !baseIs(t[0], 'git')) return null;
  var i = 1, dir = null;
  while (i < t.length && t[i][0] === '-') {
    if (t[i] === '-C') { dir = t[i + 1] || null; i += 2; continue; }
    if (t[i] === '-c') { i += 2; continue; }
    if (/^-C.+/.test(t[i])) { dir = t[i].slice(2); i++; continue; }
    i++;   // --no-pager, --git-dir=…, etc.
  }
  if (i >= t.length) return null;
  return { verb: t[i].toLowerCase(), args: t.slice(i + 1), dir: dir ? normPath(dir) : null };
}
function positionals(args) { return args.filter(function (a) { return a[0] !== '-'; }); }

// A push's refspec DESTINATIONS, plus whether it needs the current branch to know (no refspec / HEAD).
function pushTargets(args) {
  var pos = [], i = 0;
  for (; i < args.length; i++) {
    var a = args[i];
    if (a === '--') { pos = pos.concat(args.slice(i + 1)); break; }
    if (a[0] === '-') {
      if (/^(-o|--push-option|--receive-pack|--exec|--repo)$/.test(a)) i++;   // flags that take a value
      continue;
    }
    pos.push(a);
  }
  var refspecs = pos.slice(1);           // pos[0] is the remote (or absent)
  var dests = [], needsHead = refspecs.length === 0;
  refspecs.forEach(function (r) {
    var s = r.replace(/^\+/, '');
    var dst = s.indexOf(':') >= 0 ? s.slice(s.indexOf(':') + 1) : s;
    if (!dst) return;                     // `src:` = delete; the generic push rule still asks
    if (dst === 'HEAD') { needsHead = true; return; }
    dests.push(dst.replace(/^refs\/heads\//, ''));
  });
  return { dests: dests, needsHead: needsHead };
}

function scan(cmd, ctx) {
  var subs = subshells(cmd);
  for (var k = 0; k < subs.length; k++) { var rs = scan(subs[k], ctx); if (rs) return rs; }

  var segs = splitSegments(cmd);
  for (var s = 0; s < segs.length; s++) {
    var t = stripPrefixes(tokenize(segs[s]));
    if (!t.length) continue;

    // Directory changes that affect later segments.
    if (/^(cd|chdir|set-location|sl|pushd|push-location)$/i.test(t[0])) {
      var tgt = null;
      for (var c = 1; c < t.length; c++) {
        if (/^\/d$/i.test(t[c])) continue;                 // cmd-style `cd /d <path>`
        if (/^-path$/i.test(t[c])) { tgt = t[c + 1]; break; }
        if (t[c][0] === '-') continue;
        tgt = t[c]; break;
      }
      if (tgt && tgt !== '-') {
        tgt = normPath(tgt);
        ctx.cwd = path.isAbsolute(tgt) ? tgt : path.resolve(ctx.cwd, tgt);
        ctx.checkedOut = null;
      }
      continue;
    }

    // Nested shells: bash -c "…", powershell -Command "…", cmd /c "…".
    if (SHELL.test(t[0])) {
      for (var n = 1; n < t.length; n++) {
        if (/^(-c|-command|\/c)$/i.test(t[n]) && t[n + 1]) {
          var rn = scan(t[n + 1], ctx); if (rn) return rn; break;
        }
      }
      continue;
    }

    // gh: pr merge, and the API route behind it.
    if (baseIs(t[0], 'gh')) {
      if ((t[1] || '').toLowerCase() === 'pr' && (t[2] || '').toLowerCase() === 'merge') return { d: 'ask', r: PR_RULE };
      if ((t[1] || '').toLowerCase() === 'api' && t.some(function (a) { return /\/pulls\/\d+\/merge/i.test(a); })) {
        return { d: 'ask', r: PR_RULE };
      }
      continue;
    }

    var g = parseGit(t);
    if (!g) continue;
    var dir = g.dir || ctx.cwd;
    var pos = positionals(g.args);

    if (g.verb === 'checkout' || g.verb === 'switch') {
      // `-B`/`-C <branch>` (re)points a branch at HEAD: moving develop without standing on it.
      var forceIdx = g.args.findIndex(function (a) { return a === '-B' || a === '-C' || a === '--force-create'; });
      if (forceIdx >= 0 && /^develop$/i.test(g.args[forceIdx + 1] || '')) return { d: 'ask', r: MERGE_RULE };
      // Track the checked-out BRANCH for later segments — only when it really is a ref, so that
      // `git checkout CLAUDE.md && git merge foo` still resolves the live branch.
      var b = pos[0];
      if (b && g.args.indexOf('--') < 0 && forceIdx < 0 && g.args.indexOf('-b') < 0 && g.args.indexOf('-c') < 0 &&
          isRef(dir, b)) ctx.checkedOut = b;
      continue;
    }

    if (g.verb === 'push') {
      if (g.args.some(function (a) { return a === '--all' || a === '--mirror' || a === '--branches'; })) return { d: 'deny', r: LANE_RULE };
      if (!g.args.some(function (a) { return a === '-d' || a === '--delete'; })) {
        var pt = pushTargets(g.args);
        if (pt.dests.some(function (d) { return LANE.test(d); })) return { d: 'deny', r: LANE_RULE };
        if (pt.needsHead) {
          var cur = ctx.checkedOut || branchOf(dir);
          if (cur && LANE.test(cur)) return { d: 'deny', r: LANE_RULE };
        }
      }
      return { d: 'ask', r: PUSH_RULE };
    }

    // Verbs that move develop without standing on it.
    if (g.verb === 'fetch' && g.args.some(function (a) { return /:(refs\/heads\/)?develop$/i.test(a); })) return { d: 'ask', r: MERGE_RULE };
    if (g.verb === 'branch' && g.args.some(function (a) { return a === '-f' || a === '--force' || a === '-M' || a === '-m'; }) &&
        pos.some(function (a) { return /^develop$/i.test(a); })) return { d: 'ask', r: MERGE_RULE };
    if (g.verb === 'update-ref' && g.args.some(function (a) { return /^refs\/heads\/develop$/i.test(a); })) return { d: 'ask', r: MERGE_RULE };

    if (/^(merge|pull|rebase|cherry-pick|reset)$/.test(g.verb)) {
      if (g.verb === 'reset') {
        // A reset that does not move the tip: a path reset (`-- <paths>`, `<file>`, `HEAD <file>`)
        // or a reset TO HEAD itself (`git reset`, `git reset --hard`, `git reset HEAD`).
        var a = g.args;
        if (a.indexOf('--') >= 0) continue;
        var first = pos[0];
        if (!first || first === 'HEAD') continue;
        if (fs.existsSync(path.resolve(dir, first))) continue;
        if (pos.length > 1 && fs.existsSync(path.resolve(dir, pos[1]))) continue;   // `git reset HEAD~1 <file>`
      }
      var br = ctx.checkedOut || branchOf(dir);
      if (br === null) {
        return { d: 'ask', r: 'Could not read the current branch of ' + dir + ' before `git ' + g.verb +
          '`. If this tree is on develop: ' + MERGE_RULE };
      }
      if (/^develop$/i.test(br)) return { d: 'ask', r: MERGE_RULE };
      // On a lane (workbench/backshop/scratch): merging develop IN is the intended daily move.
    }
  }
  return null;
}

function decide(input) {
  var cmd = input && input.tool_input && input.tool_input.command;
  if (typeof cmd !== 'string' || !cmd.trim()) return null;
  var cwd = (input.cwd && typeof input.cwd === 'string') ? normPath(input.cwd) : process.cwd();
  return scan(cmd, { cwd: cwd, checkedOut: null });
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
