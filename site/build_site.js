/* build_site.js — assemble the PUBLISHABLE site into dist-site/.
 *
 *   node site/build_site.js        (after stamp_version.js and make_download.js)
 *
 * WHY THIS EXISTS. The deploy used to publish the repository root and rely on
 * `.vercelignore` to hold back everything that is not the website. Cloudflare Pages
 * has no equivalent and no ignore file at all, so on that host the same arrangement
 * publishes `test/`, `Blueprint/`, `Manuals/`, `Diagnostic/` and the three dev
 * harness pages. Nothing there is secret — the repository is public — but
 * `test_pwr.html` and friends become reachable dev harnesses on the live domain,
 * and the deploy carries several hundred files nobody asked for.
 *
 * Publishing the root was always the fragile choice. It only looked safe because an
 * ignore file was quietly carrying it, and that prop disappears on the host change.
 *
 * ---------------------------------------------------------- an allowlist that checks itself
 * The copy list below is hand-written, which makes it exactly the kind of
 * hand-maintained map that ends up testing itself: forget a directory and the build
 * cheerfully produces a site with a missing stylesheet.
 *
 * So it does not stand alone. After copying, every local `src=` and `href=` in every
 * published HTML file is RESOLVED against what was actually copied, and a single
 * miss fails the build. The allowlist decides what to include; the reference walk
 * decides whether that was enough. Adding a page or an asset directory cannot
 * silently half-deploy — either it is reachable or the build stops.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist-site');

/* The public site: eight pages plus the directories they and the control room pull
 * from. Derived from a reference scan of the shipped HTML, not from memory. */
const PAGES = ['index.html', 'about.html', 'physics.html', 'roadmap.html',
               'download.html', 'changelog.html', 'privacy.html', 'legal.html',
               // Pages serves this for any unmatched path; Vercel supplies its own,
               // which is why one never existed here. An ordinary page, listed with the
               // rest so test/run_site_meta.js and this file agree on what the site is.
               '404.html'];
const DIRS = ['site', 'ui', 'engines', 'layers', 'scenarios'];

/* Generated earlier in the build. `download/` may be absent on a bare local run and
 * that is not an error — the page degrades to no metadata line. */
const OPTIONAL = ['robots.txt'];
const OPTIONAL_DIRS = ['download'];

/* Build tooling that lives under site/ so .vercelignore would still ship it at build
 * time (see the note in stamp_version.js). It has no business in the published tree. */
const BUILD_ONLY = new Set(['stamp_version.js', 'make_download.js', 'build_site.js']);

// ---------------------------------------------------------------- copy
function copyDir(src, dst, prune) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (prune && prune.has(name)) continue;
    const s = path.join(src, name), d = path.join(dst, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let files = 0;
const count = (dir) => {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    fs.statSync(p).isDirectory() ? count(p) : files++;
  }
};

for (const p of PAGES) {
  if (!fs.existsSync(path.join(ROOT, p))) throw new Error('missing page: ' + p);
  fs.copyFileSync(path.join(ROOT, p), path.join(OUT, p));
}
for (const d of DIRS) {
  copyDir(path.join(ROOT, d), path.join(OUT, d), d === 'site' ? BUILD_ONLY : null);
}
for (const f of OPTIONAL) {
  if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
}
for (const d of OPTIONAL_DIRS) {
  if (fs.existsSync(path.join(ROOT, d))) copyDir(path.join(ROOT, d), path.join(OUT, d));
}



// ---------------------------------------------------------------- verify
/* THE PART THAT MAKES THE ALLOWLIST SAFE. Follow every local reference in every
 * published page and confirm it resolves inside the output. Query strings are
 * stripped: `ui/shell.html?engine=pwr` is a reference to a file plus a parameter. */
const problems = [];
function checkHtml(rel) {
  const abs = path.join(OUT, rel);
  const src = fs.readFileSync(abs, 'utf8');
  const base = path.posix.dirname(rel.replace(/\\/g, '/'));
  const re = /(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const href = m[1];
    if (/^(https?:|data:|mailto:|#|\/\/)/.test(href)) continue;
    // Absolute site paths are served by the host, not resolved from disk here; the
    // only one is the analytics beacon, and it is expected to 404 off its host.
    if (href[0] === '/') continue;
    const target = path.posix.normalize(path.posix.join(base, href.split(/[?#]/)[0]));
    if (!target || target === '.') continue;
    if (!fs.existsSync(path.join(OUT, target))) problems.push(rel + '  ->  ' + href);
  }
}
PAGES.forEach(checkHtml);
checkHtml('ui/shell.html');

/* ------------------------------------------------ EXTENSIONLESS URLS, OUTPUT ONLY
 * Cloudflare Pages redirects `/about.html` to `/about` and there is NO WAY TO TURN THAT
 * OFF. Measured on the live site: every page 308s. So links written as `about.html` cost
 * an extra round trip on every internal click, and — worse — every `rel=canonical` named
 * a URL that redirects away from the one actually served. That is the same defect as the
 * relative `og:image`, reintroduced by the host change.
 *
 * The rewrite happens HERE, in the built output, and NOT in the repo. The repo keeps
 * `about.html` so the site still browses correctly from `file://` with no server, which
 * is a property this project deliberately has — extensionless hrefs would break it, since
 * a local filesystem has no server to resolve `/about` to a file.
 *
 * Deliberately AFTER the reference walk above: that check resolves every href against a
 * real file, which only works while the hrefs still carry `.html`. Verify first, rewrite
 * second. Each rewrite below asserts its target existed, so a typo cannot silently produce
 * a dead link. */
function toExtensionless(href) {
  // Only local .html targets. External, data:, mailto:, anchors and assets are untouched.
  if (/^(https?:|data:|mailto:|#|\/\/)/.test(href)) return null;
  const m = /^(.*?)([^/]+)\.html($|[?#].*$)/.exec(href);
  if (!m) return null;
  const [, dir, base, tail] = m;
  // index.html is the directory itself — `/about/index.html` is served as `/about/`.
  const path = base === 'index' ? (dir || '') : (dir || '') + base;
  return (path === '' ? '/' : path) + tail;
}

let rewrites = 0;
const deadLinks = [];
function rewriteHtml(rel) {
  const abs = path.join(OUT, rel);
  const base = path.posix.dirname(rel.replace(/\\/g, '/'));
  let src = fs.readFileSync(abs, 'utf8');

  src = src.replace(/(\s(?:href|content)=")([^"]+)(")/g, (whole, pre, href, post) => {
    // Canonical and og:url are absolute site URLs; links are relative. Handle both.
    const abs_ = /^https:\/\/reactordynamics\.com\//.test(href);
    const target = abs_ ? href.replace('https://reactordynamics.com', '') : href;
    const next = toExtensionless(target);
    if (next === null) return whole;

    // Prove the file this link USED to point at is actually in the output. A rewrite that
    // invents a URL is worse than the redirect it replaces.
    const resolved = path.posix.normalize(path.posix.join(abs_ ? '' : base, target.split(/[?#]/)[0].replace(/^\//, '')));
    if (!fs.existsSync(path.join(OUT, resolved))) { deadLinks.push(rel + ' -> ' + href); return whole; }

    rewrites++;
    return pre + (abs_ ? 'https://reactordynamics.com' + (next === '/' ? '/' : '/' + next.replace(/^\//, '')) : next) + post;
  });

  fs.writeFileSync(abs, src);
}
PAGES.forEach(rewriteHtml);
rewriteHtml('ui/shell.html');
if (deadLinks.length) {
  console.error('\nRewrite skipped these — the target is not in the output:');
  deadLinks.forEach((d) => console.error('  ' + d));
  throw new Error(deadLinks.length + ' link(s) point at files dist-site does not contain.');
}

// /sim must land on the FINAL url, not one that redirects again.
fs.writeFileSync(path.join(OUT, '_redirects'), '/sim  /ui/shell?engine=pwr  302\n');

// THE VERSION STAMPS MUST NOT BE CACHED FOR FOUR HOURS. Cloudflare Pages defaults static
// assets to `max-age=14400`, which is fine for engine code — it is immutable per deploy and
// the page that loads it is revalidated — but self-defeating for the three files whose ENTIRE
// JOB is to say which build you are looking at. Measured 2026-08-09, right after Alpha 1.5.1:
// the origin served 1.5.1 to every uncached fetch while the owner's browser showed 1.4.0 —
// TWO releases behind, because it had cached release.js hours earlier and `must-revalidate`
// does nothing until max-age expires. The same policy is why version.js appeared to serve a
// stale commit after 1.5.0; that was written off as a self-healing edge blip, and it was not,
// it was this, and it hits every visitor for four hours after every release.
//
// `no-cache` here means "store it, but revalidate every time" — not "do not store". With the
// ETag already present each check is a ~100-byte 304, so the cost is one conditional request
// per page load against a version display that is otherwise wrong for a quarter of a day.
fs.writeFileSync(path.join(OUT, '_headers'),
  ['/site/version.js',      '  Cache-Control: no-cache',
   '/site/release.js',      '  Cache-Control: no-cache',
   '/download/manifest.js', '  Cache-Control: no-cache', ''].join('\n'));

if (problems.length) {
  console.error('\ndist-site is INCOMPLETE — these references do not resolve inside it:');
  problems.forEach((p) => console.error('  ' + p));
  throw new Error(problems.length + ' unresolved reference(s). Add what is missing to ' +
    'DIRS/PAGES in site/build_site.js — do not delete the reference to silence this.');
}

count(OUT);
console.log('dist-site/  ' + files + ' files  (' + PAGES.length + ' pages, ' +
  DIRS.length + ' asset directories)  — every reference resolves');
