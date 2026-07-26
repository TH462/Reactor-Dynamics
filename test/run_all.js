/* run_all.js — the aggregate gate.
 *
 * Runs every gate runner in test/, compares each against a recorded baseline, and
 * exits non-zero on ANY drift from that baseline. Written because the gate used to
 * be a prose checklist in CLAUDE.md, which is how run_e2e_controls sat red unnoticed
 * (2026-07-19 review) and how the manual's units regression hid behind an already-red
 * verify_e2e_ui (#111 / #148).
 *
 * Run: node test/run_all.js [options]
 *   --fast        skip the two Playwright gates (minutes each)
 *   --only <a,b>  run just these (substring match on the script name)
 *   --record      print a BASELINES block reflecting what actually happened
 *   --quiet       suppress per-runner output (failures still dump their tail)
 *
 * Exit code is 0 only when every runner matches its baseline exactly.
 *
 * DRIFT IS SYMMETRIC — a runner scoring BETTER than baseline also fails the
 * aggregate. That is deliberate: a red that turns green is a real event, and it
 * must be acknowledged by updating the baseline (and usually closing an issue)
 * rather than silently absorbed. Same convention as the strict xfails in
 * run_meltdown / run_behavior.
 *
 * MAINTENANCE: when you legitimately move a number, update `expect` here AND the
 * gate baselines in CLAUDE.md in the same change.
 */
'use strict';
var path = require('path');
var fs = require('fs');
var cp = require('child_process');

var TEST_DIR = __dirname;

/* Baselines, verified 2026-07-25.
 *   code  — expected process exit code
 *   score — expected "n/m" tally scraped from the output, or null if the runner
 *           prints no tally (exit code alone is the signal)
 *   note  — why a red is expected; every non-zero `code` MUST carry one
 *   slow  — Playwright gate, skipped by --fast
 */
var BASELINES = {
  // ---- engines & scenarios ----
  // 32/32 since 2026-07-25: +load_above_rated_hold (the #130 regression pin), and
  // load_mode_follow gained a real load-tracks-power check where a vacuous
  // "< 950 MWe" literal used to sit.
  'run_pwr.js':            { code: 0, score: '32/32 198passed' },
  'run_rbmk.js':           { code: 0, score: '23/23 150passed' },
  'run_bwr.js':            { code: 0, score: '15/15 92passed' },
  'run_scenarios.js':      { code: 0, score: '3/3 36passed' },
  'run_behavior.js':       { code: 0, score: '30pass 0xfail' },
  'run_meltdown.js':       { code: 0, score: '8pass 0xfail' },

  // ---- stack layers ----
  // 19/19 since 2026-07-25 (#151): +a save/restore round-trip test for trip blocks
  // and the derived `asserted` flags.
  'run_m4.js':             { code: 0, score: '19/19 86passed' },
  // Green since 2026-07-25 (#151): the rewind red was lastInstruments not being
  // rebuilt on restore, so every blockable trip reported asserted=false.
  'run_m5.js':             { code: 0, score: '19/19 79passed' },
  'run_m6.js':             { code: 0, score: '16/16 94passed' },
  'run_m6ph.js':           { code: 0, score: '8/8 18passed' },
  'run_m7.js':             { code: 0, score: null },   // prints "M7 OK", no tally

  // ---- control, campaign, procedures ----
  'run_autoctl.js':        { code: 0, score: '20/20' },
  'run_campaign.js':       { code: 0, score: '51/51 2932passed' },
  'run_checklist.js':      { code: 0, score: '24/24' },
  // Green since 2026-07-25 (#150): both F12 reds were stale expectations, not
  // regressions. 30 -> 35 checks; the replacements are differential, so they
  // discriminate where the originals could not.
  'run_e2e_controls.js':   { code: 0, score: '35/35' },
  // 96 → 100 checks, both from the pwr_startup rebuild:
  //   +1 (#134) the level-off now holds the point of adding heat at 1–3 %, and
  //      crossing the 5 % boundary into Mode 1 is its own deliberate step
  //      instead of something the ascent does to you;
  //   +3 (#197) the approach plots SIX 1/M points instead of three — three
  //      predicts criticality 79 steps late, which is not close enough to
  //      withdraw against.
  'run_procedures.js':     { code: 0, score: '22/22 100/100' },

  // ---- known reds (each is a tracked issue; do not "fix" by editing the number) ----
  'run_ops.js': {
    code: 1, score: '59/68 337passed 9failed',
    note: 'Ops probes are tuning targets by design. The FAILs are documented RBMK/BWR ' +
          'targets (P4, R1-R3, B2-B5) plus the deliberately-red C2 accel-latency probe ' +
          '(#153, status-deliberate). See Diagnostic/OPS_TUNING_REPORT.md.',
  },

  // ---- browser gates (slow: Playwright + a throwaway http server) ----
  'verify_e2e_ui.js':        { code: 0, score: '16screenshots', slow: true },
  'verify_manual_follow.js': { code: 0, score: '84checks', slow: true },
};

/* Runners that write reports into Diagnostic/ as a side effect — an aggregate run
 * dirties the working tree, which is expected, not a bug. */
var DIRTIES_TREE = ['run_behavior.js', 'run_meltdown.js', 'run_ops.js'];

var C = {
  red: '[31m', green: '[32m', yellow: '[33m',
  dim: '[2m', bold: '[1m', off: '[0m',
};
function strip(s) { return String(s).replace(/\[[0-9;]*m/g, ''); }

/* Scrape the tally off the end of a runner's output.
 *
 * There is no shared format — runners print "Suites: 31/31", "20/20 suites passed",
 * "Probes: 30 pass, 0 xfail", "PASS (16 screenshots)". So: walk backwards over the
 * last few lines, and take the first one that yields any tally token. Bounded to
 * TAIL lines so a runner with no tally returns null instead of matching some stray
 * number from its body.
 *
 * Every token on that line is captured, not just the first — run_procedures prints
 * "Procedures: 22/22   Checks: 96/96", and the check count catches a regression that
 * leaves the suite count untouched. */
var TAIL = 8;
var PATTERNS = [
  /(\d+)\s*\/\s*(\d+)/g,                                              // 31/31
  // The (^|\s) guard stops "15/15   Checks:" contributing a bogus "15 Checks" —
  // the count must be a standalone word, not the tail of a fraction.
  /(^|[\s(])(\d+)\s+(pass|xfail|passed|failed|checks|screenshots)\b/gi,  // 30 pass, (84 checks)
];
function scrapeScore(out) {
  var lines = strip(out).trimEnd().split('\n').filter(function (l) { return l.trim(); });
  for (var i = lines.length - 1; i >= Math.max(0, lines.length - TAIL); i--) {
    var toks = [];
    PATTERNS.forEach(function (re) {
      re.lastIndex = 0;
      var m;
      // Drop the leading delimiter the (^|[\s(]) guard captures, then close up spaces.
      while ((m = re.exec(lines[i])) !== null) toks.push(m[0].replace(/^\D*/, '').replace(/\s+/g, ''));
    });
    if (toks.length) return toks.join(' ');
  }
  return null;
}

function discover() {
  return fs.readdirSync(TEST_DIR)
    .filter(function (f) { return /^(run|verify)_.*\.js$/.test(f) && f !== 'run_all.js'; })
    .sort();
}

function main() {
  var argv = process.argv.slice(2);
  var fast = argv.indexOf('--fast') >= 0;
  var record = argv.indexOf('--record') >= 0;
  var quiet = argv.indexOf('--quiet') >= 0;
  var onlyIx = argv.indexOf('--only');
  var only = onlyIx >= 0 && argv[onlyIx + 1] ? argv[onlyIx + 1].split(',') : null;

  var found = discover();

  // A runner with no baseline is itself a failure — otherwise a new gate can be
  // added and quietly never checked.
  var unknown = found.filter(function (f) { return !BASELINES[f]; });
  var missing = Object.keys(BASELINES).filter(function (f) { return found.indexOf(f) < 0; });

  var scripts = found.filter(function (f) {
    if (only) return only.some(function (o) { return f.indexOf(o) >= 0; });
    if (fast && BASELINES[f] && BASELINES[f].slow) return false;
    return true;
  });

  console.log(C.bold + 'Aggregate gate — ' + scripts.length + ' runners' + C.off +
    (fast ? C.dim + ' (--fast: browser gates skipped)' + C.off : ''));
  console.log('');

  var results = [];
  for (var i = 0; i < scripts.length; i++) {
    var f = scripts[i];
    var base = BASELINES[f] || null;
    process.stdout.write(C.dim + '  running ' + f + '…' + C.off);
    var t0 = Date.now();
    var r = cp.spawnSync(process.execPath, [path.join(TEST_DIR, f)], {
      cwd: path.join(TEST_DIR, '..'),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    var secs = ((Date.now() - t0) / 1000).toFixed(1);
    var out = (r.stdout || '') + (r.stderr || '');
    var code = r.status == null ? -1 : r.status;
    var score = scrapeScore(out);

    var drift = [];
    if (!base) drift.push('no baseline recorded');
    else {
      if (code !== base.code) drift.push('exit ' + code + ' (baseline ' + base.code + ')');
      if (base.score && score !== base.score) drift.push('score ' + (score || '?') + ' (baseline ' + base.score + ')');
    }
    var ok = drift.length === 0;
    results.push({ file: f, code: code, score: score, secs: secs, ok: ok, drift: drift, out: out, base: base });

    process.stdout.write('\r' + (ok ? C.green + '  PASS' : C.red + '  DRIFT') + C.off +
      '  ' + f + Array(Math.max(1, 26 - f.length)).join(' ') +
      C.dim + (score || '—') + '  ' + secs + 's' + C.off +
      (ok ? '' : '  ' + C.red + drift.join('; ') + C.off) + '\n');

    if (!quiet && !ok) {
      var tail = strip(out).trimEnd().split('\n').slice(-14);
      console.log(C.dim + tail.map(function (l) { return '      │ ' + l; }).join('\n') + C.off);
    }
  }

  if (record) {
    console.log('\n' + C.bold + '--record — observed:' + C.off);
    results.forEach(function (r) {
      console.log("  '" + r.file + "': { code: " + r.code + ', score: ' +
        (r.score ? "'" + r.score + "'" : 'null') + ' },');
    });
  }

  var drifted = results.filter(function (r) { return !r.ok; });
  var reds = results.filter(function (r) { return r.ok && r.base && r.base.code !== 0; });

  console.log('');
  if (reds.length) {
    console.log(C.yellow + 'Expected reds (' + reds.length + ') — tracked, not regressions:' + C.off);
    reds.forEach(function (r) {
      console.log(C.dim + '  ' + r.file + ' @ ' + r.score + C.off);
      console.log(C.dim + '    ' + (r.base.note || 'NO NOTE — add one').replace(/(.{86})\s/g, '$1\n    ') + C.off);
    });
    console.log('');
  }
  if (unknown.length) console.log(C.red + 'Runners with no baseline: ' + unknown.join(', ') + C.off);
  if (missing.length) console.log(C.red + 'Baselines with no runner: ' + missing.join(', ') + C.off);
  if (fast) console.log(C.dim + 'Skipped (--fast): verify_e2e_ui.js, verify_manual_follow.js' + C.off);
  console.log(C.dim + 'Wrote reports into Diagnostic/ (expected): ' + DIRTIES_TREE.join(', ') + C.off);

  var bad = drifted.length || unknown.length || missing.length;
  console.log('');
  if (bad) {
    console.log(C.red + C.bold + 'AGGREGATE GATE: DRIFT (' + drifted.length + ' runner(s))' + C.off);
    console.log(C.dim + 'A runner scoring BETTER than baseline also drifts — update BASELINES in\n' +
      'test/run_all.js and the gate baselines in CLAUDE.md, and close the issue it fixes.' + C.off);
  } else {
    console.log(C.green + C.bold + 'AGGREGATE GATE: OK' + C.off +
      C.dim + ' (' + results.length + ' runners at baseline)' + C.off);
  }
  process.exit(bad ? 1 : 0);
}

main();
