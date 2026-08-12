/* run_site_build.js — functional guard for WHAT THE DEPLOY ACTUALLY PUBLISHES.
 *
 *   node test/run_site_build.js
 *
 * WHY THIS EXISTS. Alpha 1.6.0 shipped and the control room rendered with its chart text
 * jammed against the left edge (#470). Not a layout bug: `ui/shell.html` is served
 * `max-age=0, must-revalidate` while `ui/shell.css` is `max-age=14400` and was referenced as a
 * bare `href="shell.css"`, so anyone who had loaded the sim within four hours got THIS
 * release's HTML against the PREVIOUS release's stylesheet, and every element whose CSS was
 * new in the release drew unstyled. `site/build_site.js` now puts the build in the url
 * (`?v=<sha>`), which fixes it — and NOTHING TESTED THAT. `run_site_meta` reads source and
 * scored 163/163 unchanged across the fix; deleting the bust block was green in every gate in
 * this directory. A fix nothing can fail is a fix waiting to be refactored away.
 *
 * THE SECOND DEFECT IT FOUND (#476). Checking the OUTPUT rather than the source answers a
 * question the source never raised: which files are in it? `build_site.js` partitions the root
 * `*.html` glob (PAGES / NOT_PUBLISHED) but copies each asset directory wholesale, so
 * `ui/test_panel/` shipped — and on 2026-08-12 both of its dev harnesses answered 200 on the
 * live domain. Withheld now; the check below is what keeps them withheld, because it demands
 * every `*.html` in the output be a declared page rather than trusting a copy list.
 *
 * SHAPE. It runs the REAL build — the same script the Pages build command runs — into a
 * scratch directory via `RD_SITE_OUT`, and asserts on the files that come out. It starts no
 * browser and steps no plant, and it never touches `dist-site/`. Same report convention as
 * `run_site_meta.js` / `run_release.js`: a check carries either the reason it passed or
 * nothing, and nothing is a violation.
 *
 * VERIFIED BY INJECTION, because a check written beside its own fix has never been red.
 * Measured 2026-08-12 against a 31/0 baseline, each reverted after:
 *   - disable the cache-bust call -> 162 checks / 133 failed. Two independent rules catch it:
 *     BUILD, from the build's own tally ("reports 0 urls"), and BUST, from the files.
 *   - empty WITHHELD_DIRS, republishing ui/test_panel -> 33/3, both harnesses named.
 *   - add ui/shell.css to the build's NO_BUST, leaving exactly ONE url bare -> 32/2:
 *     "130 of 131" and `ui/shell.html -> shell.css`. That is the case that matters — it is
 *     #470 itself, and it proves the walk reads the OUTPUT rather than the source, since the
 *     source still contains a perfectly healthy-looking bust block.
 *
 * THE TALLY IS DELIBERATELY INDEPENDENT OF THE ENVIRONMENT, and the first draft was not.
 * It emitted one check per html file, which made the score depend on whether `download/`
 * exists — it does here and on the deploy host, it does not on a fresh clone or in CI. That
 * form scored 41 locally and 40 in CI ON A HEALTHY TREE: a baseline reporting the environment
 * rather than the code. Measured after the fix: 31/0 both ways (11 html files vs 10).
 *
 * WHAT IT DOES NOT COVER. Whether the STAMP is the right sha — that is the deploy host's job
 * (measured live instead: develop's preview served `shell.css?v=b06dcd8`) — and whether the
 * cache headers themselves are correct, which only the origin can answer.
 */
'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var ROOT = path.join(__dirname, '..');
var G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

var findings = [], violations = [];
function check(rule, where, text, why) {
  var f = { rule: rule, where: where, text: text, why: why };
  findings.push(f);
  if (!why) violations.push(f);
  return f;
}

// ---------------------------------------------------------------- the stamp, derived here
// PARSED INDEPENDENTLY of build_site.js's own regex, on purpose. The question this gate asks
// is "does the published url carry the build this deploy is stamped as", and answering it by
// re-using the producer's parse would make the two agree by construction — including when
// both capture the wrong part of the string. Take the version label and read its last token,
// which is what `stamp_version.js` builds the label from: 'alpha · ' + sha.slice(0, 7).
var verSrc = fs.readFileSync(path.join(ROOT, 'site', 'version.js'), 'utf8');
var verM = /RD_VERSION\s*=\s*"([^"]+)"/.exec(verSrc);
var STAMP = verM ? verM[1].trim().split(/\s+/).pop() : null;
check('BUILD', 'site/version.js', 'build stamp = ' + JSON.stringify(STAMP) +
  '  (from ' + JSON.stringify(verM && verM[1]) + ')',
  STAMP ? 'read from the label stamp_version.js writes, not from build_site.js' : null);

// ---------------------------------------------------------------- run the real build
var OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-site-build-'));
var built = cp.spawnSync(process.execPath, [path.join(ROOT, 'site', 'build_site.js')], {
  cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { RD_SITE_OUT: OUT }),
});
var stdout = (built.stdout || '') + (built.stderr || '');
check('BUILD', 'site/build_site.js', 'builds into RD_SITE_OUT and exits ' + built.status,
  built.status === 0 ? 'the same script the Pages build command runs' : null);
if (built.status !== 0) {
  console.error(stdout);
  report();  // nothing below can mean anything if the build did not run
}

// The build reports its own tally; a silent zero would mean the regex matched nothing.
var bustM = /(\d+) asset urls carry \?v=(\S+)/.exec(stdout);
check('BUILD', 'site/build_site.js', 'reports ' + (bustM ? bustM[1] : '<no>') +
  ' urls carrying ?v=' + (bustM ? bustM[2] : '?'),
  bustM && +bustM[1] > 0 && bustM[2] === STAMP
    ? 'a non-zero count, stamped with the version this build declares' : null);

// ---------------------------------------------------------------- what is in the output
// THE DECLARED SET. Every html in the output must be one of:
//   - a page build_site.js declares in PAGES (parsed from its source, as run_site_meta does)
//   - ui/shell.html, the control room
//   - anything under download/, which is the self-contained OFFLINE build — one file with
//     everything inlined, downloaded rather than served, and so neither a page nor bustable.
// Anything else is a dev harness that reached the public domain, which is the failure this
// half exists for. Declared-set rather than deny-list ON PURPOSE: a deny-list cannot name the
// page nobody has written yet.
var buildSrc = fs.readFileSync(path.join(ROOT, 'site', 'build_site.js'), 'utf8');
var pagesM = /const PAGES = \[([\s\S]*?)\];/.exec(buildSrc);
var PAGES = pagesM ? (pagesM[1].match(/'([^']+\.html)'/g) || []).map(function (s) {
  return s.replace(/'/g, '');
}) : [];
check('PAGES', 'site/build_site.js', 'PAGES parsed (' + PAGES.length + ')',
  PAGES.length >= 8 ? 'the declaration this gate measures the output against' : null);

function walk(dir, acc) {
  fs.readdirSync(dir).forEach(function (n) {
    var p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else acc.push(path.relative(OUT, p).replace(/\\/g, '/'));
  });
  return acc;
}
var OUT_FILES = walk(OUT, []);
var OUT_HTML = OUT_FILES.filter(function (f) { return /\.html$/.test(f); }).sort();

// ONE CHECK FOR THE WHOLE SET, NOT ONE PER FILE — and that is not a style choice. A per-file
// tally moves with the CONTENTS of the output, and `download/` is an OPTIONAL_DIR: it exists
// on this machine and on the deploy host (make_download.js runs first) and does not exist on a
// fresh clone or in CI. So the per-file form scored 41 locally and would have scored 40 in CI
// on a healthy tree — a baseline that reports the environment rather than the code. Offenders
// are still named individually, but only when there are some.
var SERVED = [], undeclared = [];
OUT_HTML.forEach(function (rel) {
  if (PAGES.indexOf(rel) !== -1 || rel === 'ui/shell.html') { SERVED.push(rel); return; }
  // download/ holds the single-file OFFLINE build — everything inlined, downloaded rather
  // than served, so it is neither a page nor bustable.
  if (/^download\//.test(rel)) return;
  undeclared.push(rel);
});
check('PAGES', 'the built output', OUT_HTML.length + ' html file(s), ' + SERVED.length +
  ' served as pages, ' + undeclared.length + ' undeclared',
  undeclared.length === 0 ? 'nothing ships that no file declares' : null);
undeclared.forEach(function (f) {
  check('PAGES', f, 'is published but declared nowhere — a dev harness on the live domain', null);
});
check('PAGES', 'the built output', SERVED.length + ' served pages vs ' + PAGES.length +
  ' declared', SERVED.length === PAGES.length + 1
    ? 'every declared page plus the control room, and nothing extra' : null);

// ---------------------------------------------------------------- every asset url versioned
// Walked from the OUTPUT, not from build_site.js's own list of files to rewrite. That is the
// whole point: if the build stops busting a page — or starts publishing one it does not bust —
// this notices, and a source scan cannot.
var NO_BUST = ['site/version.js', 'site/release.js', 'download/manifest.js'];
var bare = [], versioned = 0, stamped = 0;
SERVED.forEach(function (rel) {
  var src = fs.readFileSync(path.join(OUT, rel), 'utf8');
  var base = path.posix.dirname(rel);
  var re = /\s(?:src|href)="([^"]+)"/g, m;
  while ((m = re.exec(src)) !== null) {
    var url = m[1];
    if (/^(https?:|data:|mailto:|#|\/\/)/.test(url)) continue;
    var file = url.split(/[?#]/)[0];
    if (!/\.(css|js)$/.test(file)) continue;
    var target = path.posix.normalize(path.posix.join(file.charAt(0) === '/' ? '' : base,
      file.replace(/^\//, '')));
    var q = url.slice(file.length);
    if (NO_BUST.indexOf(target) !== -1) {
      // These three are `no-cache` in _headers; pinning them to the build that emitted them
      // is the opposite of their job, so a version query on one is a violation too.
      check('NOCACHE', rel, target + ' referenced as ' + JSON.stringify(url),
        q === '' ? 'left unversioned — it is revalidated on every load instead' : null);
      continue;
    }
    versioned++;
    if (q === '?v=' + STAMP) stamped++;
    else bare.push(rel + '  ->  ' + url);
  }
});
check('BUST', 'all served pages', stamped + ' of ' + versioned +
  ' local css/js urls carry ?v=' + STAMP,
  versioned > 0 && stamped === versioned
    ? 'a release requests urls no cache has seen — #470' : null);
bare.forEach(function (b) { check('BUST', 'unversioned', b, null); });

// ---------------------------------------------------------------- the headers still exist
var headers = fs.existsSync(path.join(OUT, '_headers'))
  ? fs.readFileSync(path.join(OUT, '_headers'), 'utf8') : '';
NO_BUST.forEach(function (f) {
  check('NOCACHE', '_headers', '/' + f + ' is declared no-cache',
    new RegExp('/' + f.replace(/[.\/]/g, '\\$&') + '\\s*\\n\\s*Cache-Control: no-cache')
      .test(headers) ? 'revalidated on every load, so the version shown is this build' : null);
});

report();

// ---------------------------------------------------------------- report
function report() {
  try { fs.rmSync(OUT, { recursive: true, force: true }); } catch (e) { /* scratch dir */ }
  var byRule = {};
  findings.forEach(function (f) { (byRule[f.rule] = byRule[f.rule] || []).push(f); });
  ['BUILD', 'PAGES', 'BUST', 'NOCACHE'].forEach(function (r) {
    var all = byRule[r] || [], bad = all.filter(function (f) { return !f.why; });
    if (!all.length) return;
    console.log('\n' + B + (bad.length ? R + 'FAIL' : G + 'PASS') + X + '  ' + B + r + X +
      D + '  (' + all.length + ' check' + (all.length === 1 ? '' : 's') + ', ' +
      bad.length + ' failed)' + X);
    bad.forEach(function (f) {
      console.log(R + '  ✗' + X + ' ' + f.where + D + '  ' + f.text + X);
    });
  });

  var bad = violations.length;
  console.log('\n' + B + '─'.repeat(42) + X);
  console.log(B + (bad ? R + 'SITE BUILD: FAIL' : G + 'SITE BUILD: OK') + X +
    '  ' + findings.length + ' checks, ' + bad + ' failed' +
    D + '  ·  ' + stampedNote() + X);
  if (bad) {
    console.log(D + 'The published site is assembled by site/build_site.js. Every local css/js\n' +
      'url in a served page must carry ?v=<build stamp>, or a release serves new HTML\n' +
      'against the previous release\'s stylesheet (#470); and every html in the output\n' +
      'must be a declared page, or a dev harness is live on the public domain.' + X);
  }
  process.exit(bad ? 1 : 0);
}
// Tolerates being called from the early exit above, where the build failed and neither of
// these has been counted yet — `var` hoists them to undefined rather than throwing.
function stampedNote() {
  return (versioned ? versioned + ' asset urls, ' : '') +
    (OUT_HTML ? OUT_HTML.length + ' html files, ' : '') + 'stamp ' + STAMP;
}
