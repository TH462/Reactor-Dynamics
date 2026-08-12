/* build_site.js — assemble the PUBLISHABLE site into dist-site/.
 *
 *   node site/build_site.js        (after stamp_version.js and make_download.js)
 *
 * WHY THIS EXISTS. The deploy used to publish the repository root and rely on
 * an ignore file to hold back everything that is not the website. Cloudflare Pages
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
/* RD_SITE_OUT exists so test/run_site_build.js can build somewhere harmless and assert on the
 * REAL output. Without it the only way to check this file was to read it, and a source read is
 * what let the #470 cache-bust ship unguarded — see that runner's header. Default unchanged. */
const OUT = process.env.RD_SITE_OUT || path.join(ROOT, 'dist-site');

/* The public site: eight pages plus the directories they and the control room pull
 * from. Derived from a reference scan of the shipped HTML, not from memory. */
const PAGES = ['index.html', 'about.html', 'physics.html', 'roadmap.html',
               'download.html', 'changelog.html', 'privacy.html', 'legal.html',
               // Pages serves this for any unmatched path; Vercel supplies its own,
               // which is why one never existed here. An ordinary page, listed with the
               // rest so test/run_site_meta.js and this file agree on what the site is.
               '404.html'];
const DIRS = ['site', 'ui', 'engines', 'layers', 'scenarios'];

/* Root pages that deliberately DO NOT ship. Declared here rather than inferred, because
 * this file is now the only statement of what the site is: `.vercelignore` used to name
 * them and was deleted with `vercel.json` when the Vercel Git integration went (#413), and
 * Cloudflare Pages honours no ignore file at all. These are dev harnesses — they load an
 * engine directly, with no shell, no control layer and no flag gating — so reaching one on
 * the live domain is a bug, not a feature.
 *
 * PAGES + NOT_PUBLISHED must TOTAL the root `*.html` glob: `test/run_site_meta.js` proves
 * the partition, so a new root page cannot exist without some file saying whether it ships.
 * That is the property `.vercelignore` used to provide, kept rather than dropped. */
const NOT_PUBLISHED = ['test_pwr.html', 'test_bwr.html', 'test_rbmk.html'];

/* THE SAME RULE, ONE DIRECTORY DOWN — and it was missing, which is not hypothetical (#476).
 * NOT_PUBLISHED partitions the root `*.html` glob and nothing else, while the DIRS loop below
 * copies each directory WHOLESALE. So `ui/test_panel/` shipped, and on 2026-08-12 both of its
 * pages answered 200 on the live domain:
 *
 *     https://reactordynamics.com/ui/test_panel/board_check      200, 90,568 bytes
 *     https://reactordynamics.com/ui/test_panel/lane_reference   200, 13,755 bytes
 *
 * They are dev harnesses — the same category the paragraph above calls "a bug, not a feature"
 * — and being one directory deeper was the whole of their exemption. Nothing links to them, so
 * the reference walk never had an opinion either way.
 *
 * Keyed by the DIRS entry rather than a flat name set, because `copyDir`'s prune is checked at
 * the TOP LEVEL of the directory it is given (the recursive call passes no prune), which is
 * exactly where `test_panel` sits. A bare name would silently do nothing one level deeper.
 * test/run_site_build.js proves the result rather than the intent: it requires every `*.html`
 * in the built output to be a declared page, so a new dev page anywhere under a published
 * directory is a red rather than a live url. */
const WITHHELD_DIRS = { ui: new Set(['test_panel']) };

/* Generated earlier in the build. `download/` may be absent on a bare local run and
 * that is not an error — the page degrades to no metadata line. */
const OPTIONAL = ['robots.txt'];
const OPTIONAL_DIRS = ['download'];

/* THE DEPLOY BUILD CHAIN, and the one declaration of it in the repo. These three run in
 * this order as the Pages build command and must not reach the published tree.
 *
 * `test/run_portable.js` reads this set and proves every script here — and every sibling
 * each one shells out to, e.g. tools/make_portable.js — actually EXISTS. That check used
 * to ask a different question ("is .vercelignore hiding it from the build machine?"),
 * which is meaningless on Pages, where nothing is excluded. The underlying invariant is
 * the same one #258 cost a release: the build command cannot run a file that is not there,
 * and a deploy failure reports it as a bare `exited with 1` long after the fact. */
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
  copyDir(path.join(ROOT, d), path.join(OUT, d), d === 'site' ? BUILD_ONLY : WITHHELD_DIRS[d]);
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
    // A reference INTO AN OPTIONAL DIRECTORY THAT WAS NOT BUILT is not a broken link — it is
    // the state OPTIONAL_DIRS declares above ("may be absent on a bare local run and that is
    // not an error"). The walk used to contradict that declaration and throw, which meant
    // `node site/build_site.js` had never once worked on a fresh clone: measured 2026-08-12,
    // with `download/` renamed aside, it dies on `download/latest.zip` and
    // `download/manifest.js`. Invisible because only the deploy host ran it, and there
    // make_download.js runs first. It surfaced the day test/run_site_build.js started running
    // the build in CI. The directory still gets full link-checking whenever it EXISTS, which
    // is every real deploy, so nothing about the deploy's guarantees moves.
    const optional = OPTIONAL_DIRS.some((d) => target === d || target.startsWith(d + '/'));
    if (optional && !fs.existsSync(path.join(OUT, target.split('/')[0]))) continue;
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

/* ---------------------------------------------- CACHE-BUST THE ASSETS (#470, 2026-08-12)
 *
 * THE PREMISE THE HEADER NOTE BELOW USED TO REST ON WAS FALSE. It said `max-age=14400` was
 * "fine for engine code — it is immutable per deploy and the page that loads it is
 * revalidated". Immutable per deploy, yes; but the URL is IDENTICAL across deploys, so a
 * browser holding last release's `shell.css` serves it against this release's HTML and never
 * asks. Revalidating the PAGE does not help — the page then requests `shell.css` and the
 * cache answers locally.
 *
 * MEASURED after Alpha 1.6.0 shipped, and reported by the owner: the control room's text
 * "crammed on the left edge" with the chart-settings menu "crammed to the left instead of
 * nice columns". Reproduced exactly by serving the release's HTML with the PREVIOUS release's
 * stylesheet — `.lane-chrome` computes `position: static` instead of `absolute`, `.lane-value`
 * spans the full width instead of sitting in the right gutter, and `.cs-row` matches no rule
 * at all. Every crammed element was one whose CSS was NEW in that release, which is the
 * signature of this and of nothing else. It never showed in testing because testing always
 * loads cold.
 *
 * This is the same defect the `_headers` note below already diagnosed for the three version
 * stamps on 2026-08-09 — it just under-called the scope, treating the rest as safe.
 *
 * SO THE URL CARRIES THE BUILD. `?v=<sha>` changes every deploy, so a release is instantly
 * correct while repeat visits WITHIN a release still hit the 4-hour cache. Read from the
 * stamp `stamp_version.js` has already written rather than re-deriving the host env — one
 * source of truth, and it is the file whose whole job is to say which build this is.
 *
 * Deliberately AFTER the reference walk and the extensionless rewrite: both resolve hrefs
 * against real files, and a `?v=` would have to be stripped by every one of them. Verify
 * first, rewrite second, bust third. */
const stampSrc = fs.readFileSync(path.join(__dirname, 'version.js'), 'utf8');
const stampM = /RD_VERSION\s*=\s*"[^"]*?([0-9a-f]{7,40}|dev|preview)"/.exec(stampSrc);
const STAMP = stampM ? stampM[1] : null;
if (!STAMP) throw new Error('site/version.js carries no build stamp — run stamp_version.js first');
// The three files whose job is to BE current are already `no-cache` below; versioning them
// would pin them to the build that emitted them, which is the opposite of what they are for.
const NO_BUST = new Set(['/site/version.js', '/site/release.js', '/download/manifest.js']);
let busted = 0;
function bustAssets(rel) {
  const abs = path.join(OUT, rel);
  const base = path.posix.dirname(rel.replace(/\\/g, '/'));
  let src = fs.readFileSync(abs, 'utf8');
  src = src.replace(/(\s(?:src|href)=")([^"?#]+\.(?:css|js))(")/g, (whole, pre, url, post) => {
    if (/^(https?:|data:|\/\/)/.test(url)) return whole;
    const resolved = path.posix.normalize(path.posix.join(url.startsWith('/') ? '' : base,
      url.replace(/^\//, '')));
    // Same discipline as the rewrite above: never invent a URL for a file we did not publish.
    if (!fs.existsSync(path.join(OUT, resolved))) return whole;
    if (NO_BUST.has('/' + resolved)) return whole;
    busted++;
    return pre + url + '?v=' + STAMP + post;
  });
  fs.writeFileSync(abs, src);
}
PAGES.forEach(bustAssets);
bustAssets('ui/shell.html');

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
console.log('            ' + busted + ' asset urls carry ?v=' + STAMP +
  '  (a release cannot serve new HTML against cached CSS — #470)');
