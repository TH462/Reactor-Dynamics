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
  // 199 checks since 2026-07-25 (#199): save_migration also pins the new
  // _fail.steam_break.upstream default (legacy saves → downstream/isolable).
  // 200 checks since 2026-07-27 (#200): save_migration also pins the stuck-open
  // spray conversion — the failure used to be encoded as `spray_override = true`
  // (a boolean in the OPERATOR'S demand field, which is why any set_spray cleared
  // it); it is now s.spray_stuck, and a legacy save carrying the old encoding must
  // keep the failure rather than silently healing on load.
  'run_pwr.js':            { code: 0, score: '32/32 200passed' },
  'run_rbmk.js':           { code: 0, score: '23/23 150passed' },
  'run_bwr.js':            { code: 0, score: '15/15 92passed' },
  'run_scenarios.js':      { code: 0, score: '3/3 36passed' },
  // 34 since 2026-07-25 (#131): PI-3, PI-8, PI-9 and the TR-11 end-state pin were
  // catalogued behaviours the battery never probed — the coverage todo list is now empty.
  // 35 since 2026-07-25 (#199): +TR-12b, the MSIV isolating a downstream steam line break.
  // 36 since 2026-07-26 (#216): TR-1 was injecting a TURBINE TRIP while asserting the
  // ride-out. Those are different events in a real plant — a LOAD REJECTION rides out,
  // a turbine trip above P-9 scrams. Split: TR-1 now drives the ride-out with a real
  // load rejection, new TR-1b pins the P-9 anticipatory scram. No band was relaxed.
  // 37 since 2026-07-27 (#219): +TR-1c. The steam-dump C-7 arm is a bistable, so a
  // rejection just under it gets no fast dump and ends at the PORV. Owner ruled to KEEP
  // the threshold and DECLARE the cliff (DESIGN_COMPANION §8.8), so the probe pins BOTH
  // sides — 39 MWe lifts, 41 MWe is caught — and the declared behaviour cannot drift.
  // 38 since 2026-07-28 (#230): +TR-1d. `disconnect_grid` — the operator's own take-it-
  // off-line control — called the TURBINE TRIP path, so a planned offline latched a trip
  // flag and armed P-9 for the rest of the evolution; measured, a disconnect at 100 %
  // scrammed instantly and one during a heatup scrammed at the later P-9 crossing. Owner
  // ruled it a planned offline (no trip). TR-1d pins that, and fails on the old mapping.
  'run_behavior.js':       { code: 0, score: '38pass 0xfail' },
  // 9 since 2026-07-28 (#213): +MD-9 — partial uncovery HELD (inventory 50-70 %)
  // must damage the core on a TMI timescale; prompt reflood must not. Backed by the
  // new exposed-clad hot node (pwr_thermal.stepCladding).
  'run_meltdown.js':       { code: 0, score: '9pass 0xfail' },
  // New 2026-07-26d (#209 last thread): the same casualties HANDS OFF through the
  // full stack. run_meltdown is engine-direct and does not load control_kernel at
  // all, so its MD-4/MD-8 PROTECTION claims are proven with the operator hand-
  // scramming and hand-starting HPI. This asserts the automatic chain actually
  // fires unprompted — scram without a manual scram, hpi_active without a set_hpi —
  // so a regression in an SI setpoint, an ESF arm or the P-11 permissive cannot
  // silently turn a documented-survivable path into a melt.
  'run_meltdown_stack.js': { code: 0, score: '3/3 21/21' },

  // ---- stack layers ----
  // 19/19 since 2026-07-25 (#151): +a save/restore round-trip test for trip blocks
  // and the derived `asserted` flags.
  // NEW 2026-07-27b (#227) — static HR3 guard over control_kernel.js. Not a sim
  // gate: it derives the plant vocabulary from all three engines and fails on any
  // plant-specific name in the shared kernel that is not in its ALLOWED list with a
  // reason. Exists because the leak #156 reported had ALREADY been fixed once in
  // that file and was then re-created ~40 lines below the comment warning against
  // it. The site count is part of the score on purpose: a NEW coupling shifts it
  // and trips drift even when the author allow-lists it properly.
  'run_hr3.js':            { code: 0, score: '32checks 0failed' },
  // New 2026-07-28 (#241) — the feature-flag registry that decides what the PUBLIC
  // website offers vs what is still being vetted on `develop`. Coverage half: every
  // scenario, procedure and campaign mission has an entry and every entry still points
  // at real content, so new content cannot ship unconsidered and a rename cannot
  // silently drop a feature from production. Resolution half: the public/preview/dev
  // rules asserted from BOTH sides, because a resolver stuck at "true" does not throw —
  // it publishes. Check count moves with the content count (57 items today): adding a
  // scenario shifts this baseline, which is the intended nudge to decide its stage.
  'run_flags.js':          { code: 0, score: '16/16 290/290' },
  // New 2026-07-28 (#96) — the inspection copy behind the System Scanner block.
  // Every way this rots is silent: an item id changes and its entry describes
  // nothing; a new control inherits its card's summary and READS like a real
  // answer; a manual citation outlives the section it names. All three are
  // failures here. The check count moves with the board — a new control or
  // indication shifts it, which is the intended nudge to write its copy.
  'run_inspect.js':        { code: 0, score: '7/7 35/35' },
  // 19/19 86passed → 23/23 117passed (2026-07-28, #240): four suites for
  // mode/lineup-dependent alarm classification.
  'run_m4.js':             { code: 0, score: '23/23 117passed' },
  // Green since 2026-07-25 (#151): the rewind red was lastInstruments not being
  // rebuilt on restore, so every blockable trip reported asserted=false.
  'run_m5.js':             { code: 0, score: '19/19 79passed' },
  // 16 -> 17 suites, 94 -> 102 checks 2026-07-27 (#142): a new save/restore test for
  // the instructor's operator-action memory and follow acc streak, both of which
  // saveState dropped. Verified against the PRE-fix instructor, where 5 of its 8
  // checks fail — including the softlock itself (an `operator_action` beat could
  // never be credited after a restore). Its legacy-save check passes on both
  // versions, which is the point: old saves keep their old behaviour.
  'run_m6.js':             { code: 0, score: '17/17 102passed' },
  'run_m6ph.js':           { code: 0, score: '8/8 18passed' },
  'run_m7.js':             { code: 0, score: null },   // prints "M7 OK", no tally

  // ---- control, campaign, procedures ----
  'run_autoctl.js':        { code: 0, score: '20/20' },
  // Back to 51/51 2026-07-26 (#218): pwr_msiv re-authored for P-9. The mission had been
  // a RACE — reopen before an automatic low-SG trip — and with the scram now landing at
  // closure that race is gone; worse, the decision beat's `scram` branch fired instantly
  // and railroaded every run to the bottled ending in 14 s, so the player had no decision
  // at all. It is now the post-trip EOP question: decay heat is on the code safeties, do
  // you restore the dump path? Check count 2931 -> 2930: one assertion merged, none lost.
  // Check count 2930 -> 3024 2026-07-27 (#189), suites unchanged at 51: the four static
  // passes now walk RD.SCENARIOS directly instead of the campaign tree, so a scenario
  // that is unwired (zero validation before) or bonus-only (two of the four passes
  // skipped it) is graded like any other. +94 checks, none red. Measured against the
  // pre-fix runner: a dangling goto in an unwired scenario and a typo'd trigger type on
  // a `gate.until` both passed silently; both now fail.
  'run_campaign.js':       { code: 0, score: '51/51 3024passed' },
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
  //   +1 (#211) the startup now TAKES LOAD CONTROL after synchronising — it picked up
  //      load in FOLLOW, which is right for getting on line, then goes to MANUAL so both
  //      routes into Mode 1 leave the same lineup (the free-play preset was already
  //      MANUAL, so a player who learned via the checklist used to get a different board).
  'run_procedures.js':     { code: 0, score: '22/22 101/101' },
  // New 2026-07-26 (#202/#206): the same procedures driven through the FULL STACK
  // (M4+M5+M6) rather than engine-direct. Same acc/saw/guard predicates, plus four
  // assertions only the stack can make (command accepted, no unexpected scram, no
  // critical alarm standing, declared auto_channels engaged). Strict xfails 13 → 9 → 6
  // (2026-07-26c, #210) → 9 again when P-9 was adopted (#218) → **6** (2026-07-27b, #218
  // resolved). The remaining 6 are all RBMK/BWR (#208, plants on hold).
  //
  // Check count does NOT move on an xfail change — an xfail is still a check, just an
  // annotated one — so the score string is the same either way. That is worth knowing
  // before assuming this baseline is untouched: the 2026-07-27b #218 fix cleared three
  // xfails without shifting a single number here.
  'run_procedures_stack.js': { code: 0, score: '22/22 155/155' },

  // ---- known reds (each is a tracked issue; do not "fix" by editing the number) ----
  'run_ops.js': {
    code: 1, score: '57/68 334passed 12failed',
    note: 'Ops probes are tuning targets by design. Measured 2026-07-27b from ' +
          'Diagnostic/ops_results.json: PWR 21/21 with ZERO fails; all 11 reds are ' +
          '7 RBMK + 4 BWR, and the deliberately-red C2 accel-latency probe (#153, ' +
          'status-deliberate) is one of the RBMK seven ("ABUSE [post] time-acceleration"), ' +
          'not a twelfth item. The old wording here named "P4" among the open targets — ' +
          'a P-prefixed probe is PWR and P4 has passed since 2026-07-22 (#161(b)). It was ' +
          'wrong in CLAUDE.md and got copied into this note; both corrected together. ' +
          'See Diagnostic/OPS_TUNING_REPORT.md. ' +
          '2026-07-26c (#209): 59/68 -> 57/68 when ops_harness was wired to the SHIPPED ' +
          'lineup (engageDefaults + startup lineup + stepAutomation, mirroring M5). The ' +
          'two PWR probes it broke were repaired (they silently assumed load-follow; the ' +
          'shipped board is MANUAL -> #211). The two NEW reds are RBMK, which is ON HOLD: ' +
          '[post] load follow returns to 95.2 % vs 100 +/-3, and [pre] flow reduction holds ' +
          '94.0 % vs 100 +/-4 — both are the AR channel now actually running. Recorded in ' +
          '#208, not chased.',
  },

  // ---- browser gates (slow: Playwright + a throwaway http server) ----
  // New 2026-07-28 (#241). Fast for a browser gate (~15 s, no http server — file://),
  // so it is NOT marked slow. run_flags.js proves the registry and the resolver;
  // this proves the CONTROL ROOM obeys them, which is where both defects found
  // during the build actually were: a Features row that stayed on screen because
  // .set-row's display:flex beats the `hidden` attribute (the DOM property read
  // back true throughout — hence every assertion here is on VISIBILITY), and a
  // second entry point to checklists in the instructor card that the first pass
  // gated nowhere. It pins RD_CHANNEL to reproduce a real `main` deploy.
  'verify_flags_ui.js':      { code: 0, score: '48/48' },
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
