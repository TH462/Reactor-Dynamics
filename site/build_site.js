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

/* /sim IS A REDIRECT, NOT A REWRITE, AND THAT IS THE WHOLE POINT.
 *
 * vercel.json carried it as a rewrite (`/sim` -> `/ui/shell.html`, URL unchanged) and
 * IT HAS BEEN BROKEN IN PRODUCTION EVER SINCE. Measured against the live site on
 * 2026-08-07: https://reactordynamics.com/sim returns 200 and paints an empty shell
 * with 62 FAILED REQUESTS and zero gauges, while /ui/shell.html on the same host
 * loads with none. A rewrite keeps the address at /sim, so every relative path in
 * ui/shell.html — `shell.css`, `diagram/board/pwr_board.css`, every panel script —
 * resolves against the site ROOT instead of /ui/.
 *
 * A redirect moves the browser to the real path first, so the relative paths resolve.
 * The short link still works for sharing; the address bar just tells the truth.
 * 302, not 301: a permanent redirect is cached hard by browsers, and reclaiming /sim
 * later for a real page would then mean asking people to clear their cache. */
fs.writeFileSync(path.join(OUT, '_redirects'), '/sim  /ui/shell.html?engine=pwr  302\n');


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

if (problems.length) {
  console.error('\ndist-site is INCOMPLETE — these references do not resolve inside it:');
  problems.forEach((p) => console.error('  ' + p));
  throw new Error(problems.length + ' unresolved reference(s). Add what is missing to ' +
    'DIRS/PAGES in site/build_site.js — do not delete the reference to silence this.');
}

count(OUT);
console.log('dist-site/  ' + files + ' files  (' + PAGES.length + ' pages, ' +
  DIRS.length + ' asset directories)  — every reference resolves');
