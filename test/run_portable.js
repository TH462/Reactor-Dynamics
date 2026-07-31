/* run_portable.js — static guard for the OFFLINE / single-file build.
 *
 *   node test/run_portable.js
 *
 * WHY THIS EXISTS. `tools/make_portable.js` collapses the control room into one emailable
 * .html file. That only works because of a property nothing else in the suite asserts:
 * **nothing in the runtime loads anything at runtime.** No fetch, no ES module, no worker,
 * no service worker, no web font, no CDN tag, no image — every asset is a plain
 * `<script src>` or `<link rel=stylesheet>` a bundler can see and inline.
 *
 * That property is true today (measured), and it is exactly the kind of property that
 * dies quietly. The day someone adds a perfectly reasonable `fetch('Manuals/12.md')`,
 * every other gate stays green, the deployed site stays perfect, and the *emailed* file
 * breaks — on a recipient's machine, with no error anyone will ever report back. This
 * gate is the only thing standing between that change and a stranger's broken download.
 *
 * SHAPE. Same convention as run_hardrules.js / run_hr3.js: a finding is either DECLARED
 * (listed with a reason, which turns a coupling accepted in passing into a decision
 * someone wrote down) or a VIOLATION. A declared entry matching nothing is STALE and
 * also fails, because an allow-list that outlives its couplings stops describing the code.
 *
 * SCAN SURFACE — exactly the assets `ui/shell.html` loads, read out of the file itself,
 * and here is why that is the right surface rather than a sweep of engines/ + layers/ +
 * ui/. It is the *bundle's* contents, so it can neither miss a file that ships nor flag
 * one that does not: `ui/test_panel/*` harnesses and `tools/` may fetch whatever they
 * like. It also maintains itself — a new <script src> is scanned the moment it is added,
 * with nobody remembering to widen a directory list here.
 *
 * IT ALSO GUARDS THE DELIVERY, not just the artifact: that vercel.json's buildCommand can
 * still see the files it shells out to (.vercelignore killed the Alpha 1.10.0 deploy), and
 * that the zip download.html hands a visitor arrives NAMED — product, Alpha, version —
 * rather than as an anonymous `latest.zip` (#275). Both are couplings between files edited
 * independently, and neither fails anywhere a person would look.
 *
 * WHAT IT DOES NOT COVER. A runtime load assembled from string fragments
 * (`window['fet'+'ch']`) defeats it, as does one added to a file the shell does not load
 * and then reached indirectly. It is a tripwire on the honest mistake, which is the one
 * that actually happens.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', Y = '\x1b[33m', X = '\x1b[0m';

var bundler = require('../tools/make_portable.js');

// Strip // and /* */ comments so a pattern NAMED in prose is never read as a use of
// itself — this file's own doc comment would trip half these rules, and so does
// comp_porv.js's `<dc-import …>` note. Newlines are preserved so line numbers stay true:
// a diagnostic that reports a real finding at the wrong line is its own kind of lie.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ' '); })
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// ---------------------------------------------------------------- what may load at runtime
// Every way a browser can be told to go and get something, plus ES module syntax (which
// would also break the no-module-system convention and the Node test runners).
var LOADERS = [
  [/\bfetch\s*\(/,                          'fetch()'],
  [/\bXMLHttpRequest\b/,                    'XMLHttpRequest'],
  [/\bimport\s*\(/,                         'dynamic import()'],
  [/^[ \t]*import[ \t]+[^(]/m,              'ES import'],
  [/^[ \t]*export[ \t]+/m,                  'ES export'],
  [/\bnew\s+Worker\s*\(/,                   'new Worker'],
  [/\bimportScripts\s*\(/,                  'importScripts'],
  [/\bserviceWorker\b/,                     'serviceWorker'],
  [/\bnew\s+EventSource\s*\(/,              'EventSource'],
  [/\bnew\s+WebSocket\s*\(/,                'WebSocket'],
  [/createElement\s*\(\s*['"]script['"]/,   "createElement('script')"],
  [/createElement\s*\(\s*['"]link['"]/,     "createElement('link')"],
  [/\bnew\s+Image\s*\(/,                    'new Image'],
];

// DECLARED runtime loads: 'file.js:token' -> why it is safe in a portable build.
// EMPTY, and that is a measured fact, not an aspiration — as of 2026-07-29 no file the
// shell loads contains any of the patterns above. Add an entry only with a reason that
// survives the question "what happens when this file is opened from a USB stick?"
var LOAD_DECLARED = {};

// Absolute-path tags in ui/shell.html that the bundler drops. Single source of truth is
// tools/make_portable.js — duplicating the list here is how the two drift apart.
var DROP = bundler.DROP;

var findings = [], violations = [];
function check(rule, where, text, why) {
  var f = { rule: rule, where: where, text: text, why: why };
  findings.push(f);
  if (!why) violations.push(f);
  return f;
}

// ---------------------------------------------------------------- the shell's asset list
var shellSrc = fs.readFileSync(bundler.SHELL, 'utf8');
var SHELL_DIR = path.dirname(bundler.SHELL);
var scripts = [], sheets = [], externals = [];

var re = /<script\b[^>]*\ssrc="([^"]+)"[^>]*>|<link\s+rel="stylesheet"\s+href="([^"]+)"/g, m;
while ((m = re.exec(shellSrc)) !== null) {
  var href = m[1] || m[2];
  if (/^(?:[a-z]+:)?\/\//i.test(href) || href[0] === '/') externals.push(href);
  else (m[1] ? scripts : sheets).push(href);
}

// ---- A. every tag resolves locally, or is a DECLARED drop -----------------------
scripts.concat(sheets).forEach(function (href) {
  var abs = path.join(SHELL_DIR, href);
  check('TAGS', 'ui/shell.html', href,
    fs.existsSync(abs) ? 'resolves to a local file' : null);
});
externals.forEach(function (href) {
  check('TAGS', 'ui/shell.html', href, DROP[href] || null);
});
var staleDrop = Object.keys(DROP).filter(function (k) { return externals.indexOf(k) < 0; });

// ---- B. no runtime loads in anything the shell ships ---------------------------
var loadUsed = {};
scripts.forEach(function (href) {
  var src = stripComments(fs.readFileSync(path.join(SHELL_DIR, href), 'utf8'));
  LOADERS.forEach(function (pair) {
    if (!pair[0].test(src)) return;
    var key = path.basename(href) + ':' + pair[1];
    if (LOAD_DECLARED[key]) loadUsed[key] = true;
    check('LOADS', href, pair[1], LOAD_DECLARED[key] || null);
  });
});
var staleLoad = Object.keys(LOAD_DECLARED).filter(function (k) { return !loadUsed[k]; });

// ---- C. stylesheets reference no external — and no RELATIVE — assets ----------
// A relative url() is a bundle hazard even though it works on the site: inlined into
// <style>, it resolves against the DOCUMENT's directory, not the stylesheet's. Only
// data: URIs survive the move, so anything else is a finding.
sheets.forEach(function (href) {
  var css = fs.readFileSync(path.join(SHELL_DIR, href), 'utf8');
  (css.match(/url\(\s*['"]?([^'")]+)/g) || []).forEach(function (u) {
    check('CSS', href, u.trim(), /url\(\s*['"]?data:/.test(u) ? 'data: URI — no network, survives inlining' : null);
  });
  if (/@import/.test(css)) check('CSS', href, '@import', null);
  if (/@font-face/.test(css)) check('CSS', href, '@font-face (web font would not inline)', null);
  check('CSS', href, 'no external or relative assets', /@import|@font-face/.test(css) ? null : 'clean');
});

// ---- D. the built bundle really is self-contained ------------------------------
// The point of building it here: this asserts the DELIVERABLE, not just the sources.
var built = null, buildErr = null;
try { built = bundler.build(); } catch (e) { buildErr = e.message; }

if (buildErr) {
  check('BUNDLE', 'tools/make_portable.js', 'build() threw: ' + buildErr, null);
} else {
  check('BUNDLE', 'dist', 'inlined ' + built.js.length + ' scripts (shell lists ' + scripts.length + ')',
    built.js.length === scripts.length ? 'all of them' : null);
  check('BUNDLE', 'dist', 'inlined ' + built.css.length + ' stylesheets (shell lists ' + sheets.length + ')',
    built.css.length === sheets.length ? 'all of them' : null);

  // No loading attribute may survive: every src= is gone from the MARKUP, and the only
  // href= on a <link> is the data: favicon. (The logo's outbound href and the mailto: are
  // user CLICKS, not loads — they cost nothing offline until someone follows them.)
  //
  // Scanned with <script>/<style> BODIES blanked, because a body is not markup. The
  // first cut of this check searched the raw file and flagged `src="./pipes.js"` — which
  // lives inside a JS block comment in std_pipe.js:6 documenting how the diagram builder
  // loads that component. A browser never parses it as HTML, and the measured request
  // count for the bundle is 1 (itself). Flagging it would have been the gate lying.
  var markup = built.html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style></style>');
  var leftSrc = markup.match(/\ssrc="[^"]*"/g) || [];
  check('BUNDLE', 'dist', 'no src= in markup (' + leftSrc.length + ')',
    leftSrc.length === 0 ? 'nothing left to load' : null);

  var linkHrefs = (markup.match(/<link\b[^>]*href="([^"]*)"/g) || [])
    .filter(function (t) { return !/href="data:/.test(t); });
  check('BUNDLE', 'dist', 'no <link> points off-file (' + linkHrefs.length + ')',
    linkHrefs.length === 0 ? 'favicon is a data: URI' : null);

  check('BUNDLE', 'dist', 'no <link rel=stylesheet> remains',
    /<link\s+rel="stylesheet"/.test(built.html) ? null : 'all inlined as <style>');

  // A body containing "</script" would close its tag early and spill the rest of the file
  // into the page as text. std_pipe.js:6 has one in a comment, so this is a live case.
  check('BUNDLE', 'dist', 'no unescaped </script inside an inlined body',
    /<\/script(?!>\s*(?:<|$))/.test(built.html.replace(/<\/script>/g, '')) ? null : 'escaped');

  // Sentinels: cheap proof the bundle is the whole plant, not a truncated write. These
  // are the REAL global names — checked against the sources, not guessed. The first cut
  // guessed `RD.PwrEngine` and `RD.ControlKernel`; both are wrong (`RD.PWREngine`,
  // `RD.ControlLayer`), and a sentinel for a name that never existed fails forever, which
  // reads as a broken bundle rather than a broken test.
  [['RD.PWREngine', 'engine'], ['RD.PwrBoard', 'board'], ['RD.MANUAL_MD', 'packed manual'],
   ['RD.ControlLayer', 'control layer'], ['RD.SimulationService', 'service']
  ].forEach(function (p) {
    check('BUNDLE', 'dist', 'contains ' + p[1], built.html.indexOf(p[0]) >= 0 ? 'present' : null);
  });
}

// ---- E. the build output is not committable -----------------------------------
var ignore = fs.existsSync(path.join(ROOT, '.gitignore'))
  ? fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8') : '';
check('DIST', '.gitignore', 'dist/ ignored', /^\s*dist\/?\s*$/m.test(ignore)
  ? 'a 2.5 MB generated file cannot be committed by accident' : null);

// ---- F. the download the SITE hands out is named ------------------------------
// The bundle above is only half the delivery: download.html serves it as a zip, and for
// its whole life that zip arrived on the visitor's machine called `latest.zip` (#275) —
// no product name, no Alpha, no version, indistinguishable from every other latest.zip
// in a downloads folder, and impossible to tell apart from the copy they pulled three
// releases ago.
//
// The href stays the stable path on purpose (make_download.js writes it so this page
// needs no per-release edit), so the NAME comes from an `download=` attribute stamped by
// site/nav.js out of window.RD_RELEASE. That is three files that must agree, none of
// which fails visibly when one of them stops: drop the release.js tag and the stamp
// silently no-ops, rename the anchor's id and it no-ops, change the prefix in one place
// and the site hands out a name the build never produced. Nothing else here would notice.
var dlHtml = fs.readFileSync(path.join(ROOT, 'download.html'), 'utf8');
var navSrc = fs.readFileSync(path.join(ROOT, 'site', 'nav.js'), 'utf8');
var mkDlSrc = fs.readFileSync(path.join(ROOT, 'site', 'make_download.js'), 'utf8');

var anchor = /<a\b[^>]*\bid="dlZip"[^>]*>/.exec(dlHtml);
check('DOWNLOAD', 'download.html', 'download button carries id="dlZip"',
  anchor ? 'the hook nav.js stamps' : null);
check('DOWNLOAD', 'download.html', 'button href is the stable download/latest.zip',
  anchor && /href="download\/latest\.zip"/.test(anchor[0])
    ? 'make_download.js writes this path every deploy' : null);
check('DOWNLOAD', 'download.html', 'bare download attribute kept as the no-JS fallback',
  anchor && /\sdownload(?=[\s>])/.test(anchor[0]) ? 'saves as latest.zip if JS is off' : null);

// Script ORDER, not just presence: nav.js reads RD_RELEASE at DOMContentLoaded, so a
// release.js tag placed after it would still be a silent no-op on a slow parse.
var iRel = dlHtml.indexOf('src="site/release.js"');
var iNav = dlHtml.indexOf('src="site/nav.js"');
check('DOWNLOAD', 'download.html', 'loads site/release.js before site/nav.js',
  iRel >= 0 && iNav >= 0 && iRel < iNav
    ? 'RD_RELEASE is defined by the time nav.js runs'
    : null);
check('DOWNLOAD', 'site/nav.js', 'stamps the dlZip button',
  /getElementById\('dlZip'\)/.test(navSrc) && /setAttribute\('download'/.test(navSrc)
    ? 'sets the saved filename from RD_RELEASE' : null);

// The two spellings of the same filename must be one filename. Pull the three literals
// out of each source rather than re-implementing the name here — a copy in this file
// would be a fourth place to drift.
function zipNameParts(src) {
  var pre = /'(Reactor_Dynamics_)'/.exec(src);
  var san = /replace\((\/\[\^[^/]*\]\+\/g)\s*,\s*'_'\)/.exec(src);
  var ext = /'(\.zip)'/.exec(src);
  return [pre && pre[1], san && san[1], ext && ext[1]].join(' | ');
}
var navName = zipNameParts(navSrc), buildName = zipNameParts(mkDlSrc);
check('DOWNLOAD', 'site/nav.js vs site/make_download.js',
  'same zip name: ' + navName,
  navName === buildName && navName.indexOf('null') < 0
    ? 'the offered name is the name that was built'
    : null);

// RD_RELEASE is the one source of truth for all of it, and it is hand-edited.
//
// PRE-RELEASE MODE (2026-07-31), matching run_release.js. Before the public launch there is
// no version at all: RD_RELEASE reads "Pre Alpha" and the build is identified by its SHA.
// This check used to demand Alpha X.Y.Z unconditionally, which is the SECOND gate to pin
// that format — it was missed when the pre-release mode went into run_release.js and this
// is what caught it. Either shape is valid; what must never be valid is an EMPTY or
// malformed string, because the download names itself from this.
var relSrc = fs.readFileSync(path.join(ROOT, 'site', 'release.js'), 'utf8');
var relStr = (/RD_RELEASE\s*=\s*"([^"]*)"/.exec(relSrc) || [])[1];
check('DOWNLOAD', 'site/release.js', 'RD_RELEASE = ' + JSON.stringify(relStr),
  /^Alpha \d+\.\d+\.\d+$/.test(relStr || '')
    ? 'names the product AND the version, which is what the file is called'
    : (relStr && relStr.trim()
        ? 'PRE-RELEASE: no version yet — the download carries this name and the SHA identifies the build'
        : null));

// ---------------------------------------------------------------- report
var byRule = {};
findings.forEach(function (f) { (byRule[f.rule] = byRule[f.rule] || []).push(f); });
// LOADS records a finding only on a HIT, so a clean scan produces none — and the first cut
// of this loop skipped any empty rule, which meant the gate's HEADLINE assertion printed
// NOTHING on a green run. A check you cannot see is a check nobody believes ran, so LOADS
// always reports, with the scan coverage standing in for the (correctly empty) finding list.
['TAGS', 'LOADS', 'CSS', 'BUNDLE', 'DIST', 'DOWNLOAD'].forEach(function (r) {
  var all = byRule[r] || [], bad = all.filter(function (f) { return !f.why; });
  if (!all.length && r !== 'LOADS') return;
  console.log('\n' + B + (bad.length ? R + 'FAIL' : G + 'PASS') + X + '  ' + B + r + X +
    D + '  (' + (r === 'LOADS' ? scripts.length + ' files scanned' :
      all.length + ' check' + (all.length === 1 ? '' : 's')) + ', ' + bad.length + ' failed)' + X);
  bad.forEach(function (f) {
    console.log(R + '  ✗' + X + ' ' + f.where + D + '  ' + f.text + X);
  });
  if (r === 'LOADS' && !bad.length) {
    console.log(D + '  · nothing the shell ships can load anything: ' + scripts.length +
      ' scripts × ' + LOADERS.length + ' patterns (' +
      LOADERS.slice(0, 4).map(function (p) { return p[1]; }).join(', ') + ', …) — no hits' + X);
  }
});

// ---------------------------------------------------------------------------
// THE DEPLOY BUILD MUST BE ABLE TO RUN.
//
// vercel.json's buildCommand runs scripts that require other files; .vercelignore
// decides what the build machine actually receives. Those two are edited
// independently and nothing compared them — so Alpha 1.10.0 deployed with `tools`
// ignored while the buildCommand shelled out to tools/make_portable.js. The deploy
// failed with "Command ... exited with 1" and the release never went live, while
// every local build worked, because locally nothing is ignored.
//
// Ignore-file semantics are the trap: a file inside an excluded DIRECTORY cannot be
// re-included, so excluding `tools` excludes the bundler whatever follows it.
var vercelCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
var ignoreLines = fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8')
  .split('\n').map(function (l) { return l.trim(); })
  .filter(function (l) { return l && l.charAt(0) !== '#'; });

var buildScripts = (vercelCfg.buildCommand || '').match(/[\w.\/-]+\.js/g) || [];
var needed = buildScripts.slice();
buildScripts.forEach(function (rel) {
  var abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  var src = fs.readFileSync(abs, 'utf8'), m;
  // path.join(ROOT, 'tools', 'make_portable.js')  — how a build script names a sibling
  var re = /path\.join\(\s*ROOT\s*,\s*'([\w.-]+)'\s*,\s*'([\w.-]+\.js)'\s*\)/g;
  while ((m = re.exec(src))) needed.push(m[1] + '/' + m[2]);
});
needed = needed.filter(function (v, i, a) { return a.indexOf(v) === i; });

function vercelIgnored(rel) {
  var parts = rel.split('/');
  for (var i = 0; i < ignoreLines.length; i++) {
    var pat = ignoreLines[i].replace(/\/$/, '');
    if (pat === rel) return pat;
    for (var d = 1; d < parts.length; d++) {
      if (pat === parts.slice(0, d).join('/')) return pat;
    }
  }
  return null;
}

needed.forEach(function (rel) {
  if (!fs.existsSync(path.join(ROOT, rel))) return;
  var pat = vercelIgnored(rel);
  findings.push({ ok: !pat, id: 'deploy:' + rel });
  if (pat) violations.push('DEPLOY: ' + rel + ' is needed by vercel.json buildCommand but ' +
    '.vercelignore excludes it via "' + pat + '"');
});

var stale = staleDrop.concat(staleLoad);
if (stale.length) {
  console.log('\n' + Y + B + 'STALE declarations (' + stale.length + ')' + X);
  stale.forEach(function (k) {
    console.log(Y + '  ✗' + X + ' ' + k + D + '  — nothing matches it any more; delete it' + X);
  });
}

// LOADS reports one check per (file, pattern) HIT, so a clean run has none — the tally
// would then hide the fact that 94 files were read. Count the files as the coverage.
var scanned = scripts.length;
var bad = violations.length + stale.length;
console.log('\n' + B + '──────────────────────────────────────────' + X);
console.log(B + (bad ? R + 'PORTABLE GUARD: FAIL' : G + 'PORTABLE GUARD: OK') + X + '  ' +
  findings.length + ' checks, ' + bad + ' failed' + D + '  ·  ' + scanned +
  ' shipped scripts scanned, ' + LOADERS.length + ' load patterns' + X);
if (!bad) console.log(D + 'The single-file build has nothing left to load. ' +
  'Rebuild it with: node tools/make_portable.js' + X);
process.exit(bad ? 1 : 0);
