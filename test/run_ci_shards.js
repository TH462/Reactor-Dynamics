/* run_ci_shards.js — static guard for the SHARDED CI workflow (#637, 2026-09-05).
 *
 *   node test/run_ci_shards.js
 *
 * WHY THIS EXISTS, AND IT IS ONE TRAP ABOVE ALL THE OTHERS.
 *
 *   `main`'s branch ruleset (id 20067220, `required_status_checks`, `integration_id` 15368
 *   = GitHub Actions) requires a status check whose context is EXACTLY `aggregate-gate`.
 *   A matrix job does not report under its own id: it reports as `aggregate-gate (1)`,
 *   `aggregate-gate (2)`, `aggregate-gate (3)`. So the moment the gate became a matrix, an
 *   `aggregate-gate` matrix job would leave the required context UNREPORTED FOR EVER, and
 *   every release pull request would sit blocked behind a check that never arrives — with
 *   three green checks sitting next to it saying the suite passed.
 *
 * Hence the shape this file pins: the shards run under some OTHER job id (`gate-shard`), and
 * a fan-in job whose id is exactly `aggregate-gate` needs them, runs `if: always()`, and fails
 * unless the shard job's aggregate result is 'success'. That is the only check name the
 * ruleset knows about.
 *
 * The second trap is quieter and costs a red build with nothing wrong in it:
 * `actions/upload-artifact` v4+ REJECTS a duplicate artifact name across matrix jobs, and it
 * does so AFTER the gate step has already run green. So every artifact name in the shard job
 * must carry `${{ matrix.shard }}`.
 *
 * WHY A GATE AND NOT A COMMENT. A workflow file can only be proven by pushing it — this repo
 * gates `main` and `develop` only, deliberately (see the branches note in gates.yml), which is
 * exactly how the `--fast` version shipped broken and ran red for 32 consecutive runs across a
 * release. Everything here is checkable without a push, so it is checked without a push.
 *
 * WHAT IT ASSERTS. Three static bands read out of `.github/workflows/gates.yml` with the small
 * hand parser below (there is no package.json in this repo and there must not be one, so there
 * is no YAML library to require), and one FUNCTIONAL band that drives `run_all --shard=i/N
 * --list` for real:
 *
 *   MATRIX   the shard job exists under a non-`aggregate-gate` id, `fail-fast: false`,
 *            `shard: [1..N]`, and its gate step runs `--shard=${{ matrix.shard }}/N` for the
 *            SAME N. N lives in exactly two places and this is what keeps them equal.
 *   FANIN    the ruleset trap above, in full.
 *   ARTIFACT every upload-artifact name in the shard job carries the shard number.
 *   SHARDS   the partition is TOTAL and DISJOINT over discovery, no shard is empty, a
 *            malformed --shard exits 2, and — the sacred one — an unbaselined runner still
 *            reddens a SHARDED run. That last is proved by injection on every run: a probe
 *            file is written into test/, `--shard=1/N --list` must exit 1 and name it, and it
 *            is removed again in a `finally` and on `exit`. A source scan could not tell you
 *            the guard still fires; a runner falling between shards is precisely the failure
 *            this repo has already had twice with no sharding at all (verify_board_check at 1
 *            FAILURE through a lane merge, a green CI run and a release; audit_manual_controls
 *            at 32 mismatches), and both times because nothing enumerated them.
 *
 * SHAPE. Static layer plus four short child processes: the plant is never stepped. Same report
 * convention as run_site_meta.js / run_release.js — a check carries either the reason it
 * passed or nothing, and nothing is a violation.
 */
'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var ROOT = path.join(__dirname, '..');
var G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

var WF_REL = '.github/workflows/gates.yml';
var RESERVED = 'aggregate-gate';   // the ruleset's required context; see the header

var findings = [], violations = [];
function check(rule, where, text, why) {
  var f = { rule: rule, where: where, text: text, why: why };
  findings.push(f);
  if (!why) violations.push(f);
  return f;
}

// ---------------------------------------------------------------- the parser
/* A small block parser for the subset of YAML this workflow uses: mappings, block
 * sequences, flow sequences of scalars (`[1, 2, 3]`), block scalars (`run: |`), comments,
 * quoted scalars. It is deliberately strict — it THROWS on anything it does not understand
 * rather than returning a half-parsed object, because a parser that silently skips a line it
 * cannot read would report a missing job as a missing job and be believed.
 *
 * Cross-checked once by hand against PyYAML 6.0.3 on the real file (2026-09-05): same job
 * ids, same matrix list, same step names. PyYAML is not a dependency of anything here — this
 * repo has no manifest and CI installs only playwright.
 */
function parseYaml(src) {
  var L = src.split(/\r?\n/);
  var i = 0;

  function ind(s) { return /^\s*$/.test(s) ? -1 : s.length - s.replace(/^ +/, '').length; }
  function blank(s) { return /^\s*$/.test(s) || /^\s*#/.test(s); }
  function skip() { while (i < L.length && blank(L[i])) i++; }

  // Trailing comments, honouring quotes: a `#` only starts one at the start of the line or
  // after whitespace, which is the YAML rule and also what keeps `#!/…`-shaped values intact.
  function decomment(s) {
    var out = '', q = null;
    for (var k = 0; k < s.length; k++) {
      var c = s[k];
      if (q) { out += c; if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; out += c; continue; }
      if (c === '#' && (k === 0 || /\s/.test(s[k - 1]))) break;
      out += c;
    }
    return out.replace(/\s+$/, '');
  }
  function scalar(v) {
    v = v.trim();
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) return v.slice(1, -1);
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === '' || v === '~' || v === 'null') return null;
    if (/^-?\d+$/.test(v)) return parseInt(v, 10);
    return v;
  }

  function block(at) {
    var node = null;
    for (;;) {
      skip();
      if (i >= L.length) break;
      var cur = ind(L[i]);
      if (cur < at) break;
      if (cur > at) throw new Error('line ' + (i + 1) + ': unexpected indent ' + cur + ' (want ' + at + ')');
      var line = L[i];
      var body = decomment(line).slice(at);
      if (body === '') { i++; continue; }

      // ---- sequence item. Blank the dash in place and parse the item as a block starting
      // at the column its content already occupies — that keeps the item's SECOND and later
      // keys (`- uses:` then `with:`) at the indent the parser is about to expect.
      if (body === '-' || /^-\s/.test(body)) {
        if (node && !Array.isArray(node)) throw new Error('line ' + (i + 1) + ': sequence inside a mapping');
        node = node || [];
        if (body === '-') { i++; skip(); node.push(block(ind(L[i]))); continue; }
        L[i] = line.slice(0, at) + ' ' + line.slice(at + 1);
        node.push(block(ind(L[i])));
        continue;
      }

      // ---- mapping entry
      var m = /^([^:]+):(?:\s+(.*))?$/.exec(body);
      if (!m) throw new Error('line ' + (i + 1) + ': cannot parse "' + body + '"');
      if (node && Array.isArray(node)) throw new Error('line ' + (i + 1) + ': mapping inside a sequence');
      node = node || {};
      var key = m[1].trim(), val = (m[2] || '').trim();
      i++;

      if (/^[|>][-+]?$/.test(val)) {                       // block scalar
        var buf = [], base = -1;
        while (i < L.length && (/^\s*$/.test(L[i]) || ind(L[i]) > at)) {
          if (/^\s*$/.test(L[i])) { buf.push(''); i++; continue; }
          if (base < 0) base = ind(L[i]);
          buf.push(L[i].slice(base));
          i++;
        }
        node[key] = buf.join('\n');
      } else if (val === '') {                             // nested block, or an empty value
        var save = i;
        skip();
        if (i < L.length && ind(L[i]) > at) node[key] = block(ind(L[i]));
        else { i = save; node[key] = null; }
      } else if (val[0] === '[') {                         // flow sequence of scalars
        var inner = val.slice(1, val.lastIndexOf(']'));
        node[key] = inner.trim() === '' ? []
          : inner.split(',').map(function (x) { return scalar(x); });
      } else {
        node[key] = scalar(val);
      }
    }
    return node;
  }

  skip();
  return block(0) || {};
}

// ---------------------------------------------------------------- parse the workflow
var wfSrc = fs.readFileSync(path.join(ROOT, WF_REL), 'utf8');
var wf = null, parseErr = null;
try { wf = parseYaml(wfSrc); } catch (e) { parseErr = e.message; }
check('MATRIX', WF_REL, 'parses' + (parseErr ? ': ' + parseErr : ''), parseErr ? null : 'hand parser, see header');

var jobs = (wf && wf.jobs) || {};
var jobIds = Object.keys(jobs);
check('MATRIX', WF_REL, 'declares jobs: ' + (jobIds.join(', ') || '<none>'),
  jobIds.length >= 2 ? 'a shard job and a fan-in job at minimum' : null);

// ---- which job is the shard job? DERIVED from who declares a matrix, never a name I chose
// here: hard-coding `gate-shard` would make this gate agree with itself if the workflow were
// renamed, which is the whole failure mode it exists to catch.
var shardIds = jobIds.filter(function (id) {
  return jobs[id] && jobs[id].strategy && jobs[id].strategy.matrix &&
         jobs[id].strategy.matrix.shard;
});
check('MATRIX', WF_REL, 'exactly one job declares strategy.matrix.shard: ' +
  (shardIds.join(', ') || '<none>'),
  shardIds.length === 1 ? 'that job is the shard job' : null);

var shardId = shardIds[0] || null;
var shardJob = shardId ? jobs[shardId] : {};

check('FANIN', shardId || '<no shard job>', 'the shard job\'s id is NOT "' + RESERVED + '"',
  shardId && shardId !== RESERVED
    ? 'a matrix job reports as "' + RESERVED + ' (1)", which satisfies no required context'
    : null);

var ff = shardJob.strategy && shardJob.strategy['fail-fast'];
check('MATRIX', shardId, 'strategy.fail-fast = ' + JSON.stringify(ff),
  ff === false ? 'one red shard must not cancel the other two into an unreadable log' : null);

var list = (shardJob.strategy && shardJob.strategy.matrix && shardJob.strategy.matrix.shard) || [];
var N = list.length;
var wantList = [];
for (var k = 1; k <= N; k++) wantList.push(k);
check('MATRIX', shardId, 'matrix.shard = [' + list.join(', ') + ']',
  N >= 2 && list.join(',') === wantList.join(',')
    ? '1..' + N + ', which is what --shard=i/N indexes' : null);

// ---- the gate step, and the SAME N in the only other place N is written
var steps = (shardJob.steps || []);
var allSteps = [];
jobIds.forEach(function (id) { (jobs[id].steps || []).forEach(function (s) { allSteps.push({ job: id, step: s }); }); });
var gateSteps = allSteps.filter(function (s) { return /run_all\.js/.test(s.step.run || ''); });
check('MATRIX', WF_REL, 'exactly one step in the whole workflow runs run_all.js' +
  (gateSteps.length ? ' (' + gateSteps.map(function (s) { return s.job; }).join(', ') + ')' : ''),
  gateSteps.length === 1 ? 'a second call would run part of the suite twice, or unsharded' : null);
check('MATRIX', WF_REL, 'that step is in the shard job',
  gateSteps.length === 1 && gateSteps[0].job === shardId ? 'where the matrix is' : null);

var gateRun = gateSteps.length === 1 ? String(gateSteps[0].step.run).trim() : '';
var want = 'node test/run_all.js --shard=${{ matrix.shard }}/' + N;
check('MATRIX', shardId, 'gate step runs: ' + (gateRun || '<none>'),
  gateRun === want ? 'N matches the matrix list — the only two places N is written' : null);

// The step must fail on its OWN name before the job's budget does, or a slow step reports as
// "the job exceeded the maximum execution time" and reads as a slow test suite — which is
// exactly what sent #496's first diagnosis chasing runner contention for a day.
var stepTo = gateSteps.length === 1 ? gateSteps[0].step['timeout-minutes'] : null;
var jobTo = shardJob['timeout-minutes'];
check('MATRIX', shardId, 'step budget ' + stepTo + ' min < job budget ' + jobTo + ' min',
  typeof stepTo === 'number' && typeof jobTo === 'number' && stepTo < jobTo
    ? 'the step names itself before the job can time out around it' : null);

// ---------------------------------------------------------------- the fan-in (the trap)
var fan = jobs[RESERVED];
check('FANIN', RESERVED, 'a job with id exactly "' + RESERVED + '" exists',
  fan ? 'the one context main\'s ruleset (id 20067220) requires' : null);
fan = fan || {};

// A `name:` REPLACES the id as the reported check context, so a display name here would
// un-report the required check just as surely as the matrix would.
check('FANIN', RESERVED, 'declares no display name (name = ' + JSON.stringify(fan.name || null) + ')',
  !fan.name || fan.name === RESERVED ? 'the reported context stays the job id' : null);
jobIds.filter(function (id) { return id !== RESERVED; }).forEach(function (id) {
  check('FANIN', id, 'does not claim the name "' + RESERVED + '"',
    jobs[id].name !== RESERVED ? 'only one job may report under that context' : null);
});

check('FANIN', RESERVED, 'has no strategy/matrix of its own',
  !fan.strategy ? 'a matrix here would report as "' + RESERVED + ' (1)" and satisfy nothing' : null);

var needs = fan.needs == null ? [] : [].concat(fan.needs);
check('FANIN', RESERVED, 'needs: ' + (needs.join(', ') || '<none>'),
  shardId && needs.indexOf(shardId) >= 0 ? 'it fans in from the shard job' : null);

check('FANIN', RESERVED, 'if: ' + JSON.stringify(fan['if'] || null),
  String(fan['if']).replace(/\s/g, '') === 'always()'
    ? 'a SKIPPED required check blocks a pull request exactly as a missing one does' : null);

var fanRun = ((fan.steps || []).map(function (s) { return s.run || ''; }).join('\n'));
check('FANIN', RESERVED, 'reads needs.' + shardId + '.result',
  shardId && fanRun.indexOf('needs.' + shardId + '.result') >= 0
    ? 'the aggregate result: "success" only when every matrix job succeeded' : null);
// Require the SUCCESS comparison specifically. Anything phrased as "not failure" passes on a
// cancelled or skipped shard, which is the whole class this job is here to close.
check('FANIN', RESERVED, 'fails unless that result is "success"',
  /!=\s*"?success/.test(fanRun) || /=\s*"?success/.test(fanRun)
    ? 'cancelled and skipped are reds here too, not just failure' : null);
check('FANIN', RESERVED, 'names what it saw with ::error::',
  /::error::/.test(fanRun) ? 'the check summary says which result, not just "failed"' : null);
check('FANIN', RESERVED, 'exits non-zero on that path',
  /exit\s+1/.test(fanRun) ? 'a red job, not a red log line' : null);

// ---------------------------------------------------------------- artifact names
var uploads = steps.filter(function (s) { return /upload-artifact/.test(s.uses || ''); });
check('ARTIFACT', shardId, 'the shard job uploads ' + uploads.length + ' artifact(s)',
  uploads.length >= 1 ? 'non-vacuous — a check over an empty list asserts nothing' : null);
uploads.forEach(function (s) {
  var nm = (s['with'] && s['with'].name) || '';
  check('ARTIFACT', shardId, 'artifact name = ' + JSON.stringify(nm),
    nm.indexOf('${{ matrix.shard }}') >= 0
      ? 'upload-artifact v4+ rejects a duplicate name across matrix jobs, AFTER the gate ran'
      : null);
});

// ---------------------------------------------------------------- the partition, for real
/* THE CHILD WRITES TO A FILE, NOT A PIPE, and that is load-bearing for the same reason
 * run_all.js does it (its own note, 2026-08-04): every runner here ends in `process.exit()`,
 * and on POSIX a pipe is ASYNCHRONOUS, so a child can exit 0 with the tail of its own output
 * thrown away. Locally that is invisible twice over — Windows pipes are synchronous and a
 * developer running it by hand gets a TTY — and CI is where it would bite.
 */
function runAll(args) {
  var tmp = path.join(os.tmpdir(), 'rd_ci_shards_' + process.pid + '_' +
    args.join('_').replace(/[^a-z0-9]+/gi, '_') + '.log');
  var fd = fs.openSync(tmp, 'w');
  var r = cp.spawnSync(process.execPath, [path.join(__dirname, 'run_all.js')].concat(args),
    { cwd: ROOT, stdio: ['ignore', fd, fd] });
  try { fs.closeSync(fd); } catch (e) { /* already closed */ }
  var out = '';
  try { out = fs.readFileSync(tmp, 'utf8'); } catch (e) { out = '<no output: ' + e.message + '>'; }
  try { fs.unlinkSync(tmp); } catch (e) { /* best effort */ }
  return { code: r.status, out: out.replace(/\x1b\[[0-9;]*m/g, '') };
}
function membersOf(out) {
  return out.split('\n').filter(function (l) { return /^ {2}\S+\.js$/.test(l); })
            .map(function (l) { return l.trim(); });
}

var discovered = fs.readdirSync(__dirname)
  .filter(function (f) { return /^(run|verify)_.*\.js$/.test(f) && f !== 'run_all.js'; })
  .sort();

var seen = Object.create(null), dupes = [], sizes = [];
if (N >= 2) {
  for (var s = 1; s <= N; s++) {
    var res = runAll(['--shard=' + s + '/' + N, '--list']);
    var mem = membersOf(res.out);
    sizes.push(mem.length);
    check('SHARDS', 'shard ' + s + '/' + N, 'run_all --shard=' + s + '/' + N + ' --list exits ' +
      res.code + ', lists ' + mem.length + ' runners',
      res.code === 0 && mem.length > 0
        ? 'an empty shard would mean N exceeds the suite' : null);
    mem.forEach(function (f) { if (seen[f]) dupes.push(f); seen[f] = 1; });
  }
  var union = Object.keys(seen).sort();
  var lost = discovered.filter(function (f) { return union.indexOf(f) < 0; });
  var extra = union.filter(function (f) { return discovered.indexOf(f) < 0; });

  check('SHARDS', WF_REL, 'the ' + N + ' shards are EXHAUSTIVE over discovery (' +
    union.length + ' of ' + discovered.length + ')' +
    (lost.length ? ' — missing: ' + lost.join(', ') : '') +
    (extra.length ? ' — invented: ' + extra.join(', ') : ''),
    !lost.length && !extra.length ? 'every discovered runner is in exactly one shard' : null);
  check('SHARDS', WF_REL, 'the ' + N + ' shards are DISJOINT' +
    (dupes.length ? ' — in two shards: ' + dupes.join(', ') : ''),
    !dupes.length ? 'no runner is paid for twice' : null);
  check('SHARDS', WF_REL, 'shard sizes ' + sizes.join('/') + ' sum to ' +
    sizes.reduce(function (a, b) { return a + b; }, 0),
    sizes.reduce(function (a, b) { return a + b; }, 0) === discovered.length
      ? 'independent of the set comparison above — a count, not a membership test' : null);
}

// A malformed --shard must be exit 2 (bad invocation), never exit 0 with the WHOLE suite:
// `--shard=1/e` in the workflow would then read as a slow-but-green CI running everything
// three times, and nothing would ever say so.
[['--shard=4/3', 'i > N'], ['--shard=0/3', 'i = 0'], ['--shard=abc', 'not i/N'],
 ['--shard=1/17', 'N > 16']].forEach(function (p) {
  var r = runAll([p[0], '--list']);
  check('SHARDS', p[0], 'malformed (' + p[1] + ') exits ' + r.code,
    r.code === 2 ? 'exit 2 is "you called me wrong", distinct from exit 1, "the gate drifted"' : null);
});

/* THE SACRED CHECK, PROVED BY INJECTION ON EVERY RUN (the standing rule: to prove something
 * is untested, break it and see what notices). run_all must fail on a discovered runner with
 * no BASELINES entry — under --shard as much as without it, and from EVERY shard, since the
 * unbaselined runner belongs to only one of them. A source scan for `unknown.length` could
 * not tell you the guard still fires; this writes a probe runner into test/, drives the
 * partition at it, and removes it again in a finally and on exit. */
var PROBE = path.join(__dirname, 'run_zz_ci_shards_probe_delete_me.js');
function dropProbe() { try { if (fs.existsSync(PROBE)) fs.unlinkSync(PROBE); } catch (e) { /* best effort */ } }
process.on('exit', dropProbe);
try {
  fs.writeFileSync(PROBE, '/* transient injection probe written by test/run_ci_shards.js — ' +
    'if you are reading this, that runner died mid-check; delete this file. */\n');
  var probeName = path.basename(PROBE);
  var caught = [];
  for (var q = 1; q <= Math.max(2, N); q++) {
    var pr = runAll(['--shard=' + q + '/' + Math.max(2, N), '--list']);
    if (pr.code === 1 && pr.out.indexOf(probeName) >= 0) caught.push(q);
  }
  check('SHARDS', 'injection', 'an unbaselined runner reddens ' + caught.length + ' of ' +
    Math.max(2, N) + ' shards (exit 1, named)',
    caught.length === Math.max(2, N)
      ? 'the no-baseline guard is evaluated over the FULL discovered set on every shard' : null);
} finally {
  dropProbe();
}
check('SHARDS', 'injection', 'the probe file is gone again',
  !fs.existsSync(PROBE) ? 'the tree is clean' : null);

// ---------------------------------------------------------------- report
var byRule = {};
findings.forEach(function (f) { (byRule[f.rule] = byRule[f.rule] || []).push(f); });
['MATRIX', 'FANIN', 'ARTIFACT', 'SHARDS'].forEach(function (r) {
  var all = byRule[r] || [], bad = all.filter(function (f) { return !f.why; });
  if (!all.length) return;
  console.log('\n' + B + (bad.length ? R + 'FAIL' : G + 'PASS') + X + '  ' + B + r + X +
    D + '  (' + all.length + ' check' + (all.length === 1 ? '' : 's') + ', ' +
    bad.length + ' failed)' + X);
  bad.forEach(function (f) {
    console.log(R + '  x' + X + ' ' + f.where + D + '  ' + f.text + X);
  });
});

var bad = violations.length;
console.log('\n' + B + '-'.repeat(42) + X);
console.log(B + (bad ? R + 'CI SHARDS: FAIL' : G + 'CI SHARDS: OK') + X +
  '  ' + findings.length + ' checks, ' + bad + ' failed' +
  D + '  ' + N + ' shards over ' + discovered.length + ' runners' + X);
if (bad) {
  console.log(D + 'The shard jobs must NOT be called "' + RESERVED + '": a matrix job reports as\n' +
    '"' + RESERVED + ' (1)", and main\'s branch ruleset requires that exact context, so the\n' +
    'required check would never be reported and every release PR would block for ever.\n' +
    'See the header of this file and of ' + WF_REL + '.' + X);
}
process.exit(bad ? 1 : 0);
