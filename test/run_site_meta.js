/* run_site_meta.js — static guard for the PUBLIC SITE'S SOCIAL CARDS.
 *
 *   node test/run_site_meta.js
 *
 * WHY THIS EXISTS. Every public page carried `<meta property="og:image"
 * content="site/hero.png">` — a RELATIVE url. Several of the scrapers that matter
 * (Slack, Discord, iMessage, X) do not resolve a relative og:image against the page
 * url, so a link shared into any of them rendered as a bare text row with no
 * picture. This project spreads almost entirely by someone pasting a link into a
 * chat, which makes the preview card most of its first impression, and the bug was
 * invisible from inside: the pages look right, the image loads fine in a browser,
 * and nothing in the repo reads these tags. It shipped that way from launch.
 *
 * Three pages — changelog, privacy, legal — had no card at ALL, which is the same
 * failure arriving by a different route: a page added later simply never got the
 * block, because the block lived nowhere except in the pages that already had it.
 *
 * WHAT IT PINS. For every deployable page at the repo root: a canonical link, a
 * complete Open Graph + Twitter card, and — the part that actually broke — every
 * url in it ABSOLUTE. Plus two things a copy-paste cannot get right on its own:
 * og:url and canonical must agree with the file they are written in, and the
 * declared og:image:width/height must match the real pixels of the file on disk.
 *
 * THE PAGE LIST IS DISCOVERED, NOT DECLARED. It globs *.html at the root and drops
 * whatever .vercelignore says is not deployed. A gate that iterates a hand-kept
 * list of pages is a gate that tests the list: the next page added would be
 * missing from both the list and its own tags, and this would pass at full marks
 * while saying nothing about it. The one file that decides whether a page is
 * public is .vercelignore, so ask that file.
 *
 * SHAPE. Static and total: it reads html and one PNG header, starts no browser and
 * steps no plant. Same report convention as run_release.js / run_hardrules.js — a
 * check carries either the reason it passed or nothing, and nothing is a violation.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

var SITE = 'https://reactordynamics.com';

var findings = [], violations = [];
function check(rule, where, text, why) {
  var f = { rule: rule, where: where, text: text, why: why };
  findings.push(f);
  if (!why) violations.push(f);
  return f;
}

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

// ---------------------------------------------------------------- which pages are public
// STILL DISCOVERED, NOT DECLARED — the glob is the input, and the authority moved rather
// than disappeared. It used to be `.vercelignore`, which named the dev harness pages
// individually; that file was deleted with `vercel.json` when the Vercel Git integration
// went (#413), and Cloudflare Pages honours no ignore file at all. `site/build_site.js`
// assembles what actually ships, so it is now the only file that can answer this, and it
// declares BOTH halves: PAGES (published) and NOT_PUBLISHED (dev harnesses).
//
// THE PARTITION IS THE CHECK. Every root `*.html` must appear in exactly one of the two
// lists. A gate that iterated a hand-kept list of pages would be testing the list — the
// next page added would be missing from it AND from its own tags, and this would pass at
// full marks. Requiring the two declarations to TOTAL the glob keeps that impossible: a
// new page is a red until some file says whether it ships.
var buildSrc = read('site/build_site.js');
function declaredList(name) {
  var m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(buildSrc);
  return m ? (m[1].match(/'([^']+\.html)'/g) || []).map(function (s) { return s.replace(/'/g, ''); }) : null;
}
var published = declaredList('PAGES');
var withheld = declaredList('NOT_PUBLISHED');
check('PAGES', 'site/build_site.js', 'declares PAGES and NOT_PUBLISHED',
  published && withheld ? 'both parsed' : null);
published = published || [];
withheld = withheld || [];

var ROOT_HTML = fs.readdirSync(ROOT).filter(function (f) { return /\.html$/.test(f); }).sort();
var PAGES = ROOT_HTML.filter(function (f) { return withheld.indexOf(f) < 0; });

check('PAGES', 'site/build_site.js', 'deployable root pages discovered (' + PAGES.length + '): ' +
  PAGES.join(', '),
  PAGES.length >= 8 ? 'globbed, minus what build_site.js withholds' : null);

// Both directions, as before — a page in one list and not the other is a real defect
// either way: published-but-unchecked, or checked-but-never-deployed.
PAGES.forEach(function (p) {
  check('PAGES', p, 'is published by site/build_site.js',
    published.indexOf(p) !== -1 ? 'in its PAGES list' : null);
});
published.forEach(function (p) {
  check('PAGES', p, 'published, and this gate checks it',
    PAGES.indexOf(p) !== -1 ? 'both agree it is part of the site' : null);
});
// …and the partition is total: nothing at the root is unaccounted for.
ROOT_HTML.forEach(function (f) {
  check('PAGES', f, 'is declared either published or withheld',
    (published.indexOf(f) !== -1) !== (withheld.indexOf(f) !== -1)
      ? (published.indexOf(f) !== -1 ? 'PAGES' : 'NOT_PUBLISHED') : null);
});

// ------------------------------------------- the repo says .html, the DEPLOY must not
// Cloudflare Pages redirects `/about.html` to `/about` and it cannot be switched off, so a
// canonical naming the `.html` form points at a URL that redirects away from the one
// actually served — the same defect as a relative og:image, arriving by a different route.
// site/build_site.js rewrites links and canonicals to the extensionless form IN THE OUTPUT
// ONLY, because the repo has to keep `.html` for the site to browse from file:// with no
// server. So the SOURCE is expected to say `.html` (checked below) and the BUILD is
// expected not to — this pins the rewrite that reconciles them, since without it the two
// halves could drift apart silently and only a live 308 would show it.
var buildSrc2 = read('site/build_site.js');
check('PAGES', 'site/build_site.js', 'rewrites links and canonicals to extensionless urls',
  /function toExtensionless/.test(buildSrc2) ? 'Pages strips .html; the build matches it' : null);
// BOTH INDEXES MUST EXIST BEFORE THEY CAN BE ORDERED. The first version compared them
// directly, and `indexOf` returns -1 for a missing string — so deleting the reference walk
// made the comparison `-1 < n`, which is TRUE, and the check passed on a build that no
// longer verified anything. Same shape as TR-17's `!range(bool).max` → `!NaN` → true.
// Caught by injection, which is the only reason it is not still sitting here green.
var iWalk = buildSrc2.indexOf('PAGES.forEach(checkHtml)');
var iRewrite = buildSrc2.indexOf('PAGES.forEach(rewriteHtml)');
check('PAGES', 'site/build_site.js', 'the reference walk and the rewrite both exist, in that order' +
  '  (walk@' + iWalk + ', rewrite@' + iRewrite + ')',
  iWalk >= 0 && iRewrite >= 0 && iWalk < iRewrite
    ? 'the walk resolves hrefs against real files, which needs the .html still on them' : null);

// A regex for `deadLinks.length` alone survived `if (false && deadLinks.length)` — the
// text was still there. Require the guard to reach a THROW, which the neutered form cannot.
check('PAGES', 'site/build_site.js', 'a rewrite whose target is missing THROWS',
  /if \(deadLinks\.length\) \{[\s\S]{0,600}?throw new Error/.test(buildSrc2)
    ? 'a rewrite cannot invent a url and still ship' : null);

// ---------------------------------------------------------------- the image they all point at
// Declared dimensions are checked against the real ones. og:image:width/height is a
// hint scrapers use to lay the card out before the image arrives, so a wrong pair
// renders a stretched or letterboxed preview — and it is exactly the kind of number
// that stays behind when the picture is replaced.
var HERO_REL = 'site/hero.png';
var heroBuf = fs.readFileSync(path.join(ROOT, HERO_REL));
var heroW = heroBuf.readUInt32BE(16), heroH = heroBuf.readUInt32BE(20);
var HERO_URL = SITE + '/' + HERO_REL;
check('IMAGE', HERO_REL, 'exists and is ' + heroW + '×' + heroH +
  ' (' + (heroBuf.length / 1024).toFixed(0) + ' KB)',
  heroBuf.slice(1, 4).toString() === 'PNG' ? 'read from the PNG header, not asserted' : null);

// ---------------------------------------------------------------- per page
function metaContent(html, attr, key) {
  var re = new RegExp('<meta\\s+' + attr + '="' + key.replace(/:/g, ':') +
    '"\\s+content="([^"]*)"', 'i');
  var m = re.exec(html);
  return m ? m[1] : null;
}
function og(html, k) { return metaContent(html, 'property', k); }
function tw(html, k) { return metaContent(html, 'name', k); }

// index.html is served at the site root; every other page keeps its filename.
function urlFor(page) { return page === 'index.html' ? SITE + '/' : SITE + '/' + page; }

PAGES.forEach(function (page) {
  var html = read(page);
  var want = urlFor(page);

  var canon = /<link\s+rel="canonical"\s+href="([^"]*)"/i.exec(html);
  check('CANON', page, 'canonical = ' + (canon ? canon[1] : '<missing>'),
    canon && canon[1] === want ? 'absolute, and names this page' : null);

  // ---- the four that must be present and non-empty --------------------------
  [['og:title', og(html, 'og:title')],
   ['og:description', og(html, 'og:description')],
   ['og:type', og(html, 'og:type')],
   ['og:site_name', og(html, 'og:site_name')]].forEach(function (p) {
    check('CARD', page, p[0] + (p[1] ? ' = ' + JSON.stringify(p[1].slice(0, 48) +
      (p[1].length > 48 ? '…' : '')) : ' <missing>'),
      p[1] ? 'present' : null);
  });

  var ogUrl = og(html, 'og:url');
  check('CARD', page, 'og:url = ' + (ogUrl || '<missing>'),
    ogUrl === want ? 'absolute, and agrees with canonical' : null);

  // ---- THE BUG THIS FILE EXISTS FOR ----------------------------------------
  // Both image urls, absolute, and pointing at a file that is actually there.
  [['og:image', og(html, 'og:image')], ['twitter:image', tw(html, 'twitter:image')]]
    .forEach(function (p) {
      var v = p[1];
      var absolute = !!v && /^https:\/\//.test(v);
      check('IMAGE', page, p[0] + ' = ' + (v || '<missing>'),
        absolute && v === HERO_URL
          ? 'absolute https — scrapers cannot resolve a relative one'
          : null);
    });

  var w = og(html, 'og:image:width'), h = og(html, 'og:image:height');
  check('IMAGE', page, 'declared og:image size ' + w + '×' + h +
    ' vs actual ' + heroW + '×' + heroH,
    (+w === heroW && +h === heroH) ? 'matches the file on disk' : null);

  check('IMAGE', page, 'og:image:alt is set',
    og(html, 'og:image:alt') ? 'the card is described to a screen reader too' : null);

  // ---- twitter ---------------------------------------------------------------
  var card = tw(html, 'twitter:card');
  check('CARD', page, 'twitter:card = ' + (card || '<missing>'),
    card === 'summary_large_image' ? 'the wide preview, matching the 16:9 hero' : null);
  [['twitter:title', tw(html, 'twitter:title')],
   ['twitter:description', tw(html, 'twitter:description')]].forEach(function (p) {
    check('CARD', page, p[0] + (p[1] ? ' present' : ' <missing>'), p[1] ? 'present' : null);
  });

  // ---- and the plain description, which predates all of this -----------------
  var desc = /<meta\s+name="description"\s+content="([^"]*)"/i.exec(html);
  check('CARD', page, 'name="description" is set',
    desc && desc[1].trim().length > 20 ? 'used by search results' : null);
});

// ---------------------------------------------------------------- a whole-tree sweep
// Belt and braces, and it catches what the per-page walk cannot: a SECOND og:image
// further down a page, or one written with the attributes in an order the parser
// above does not match. Any relative-looking image url anywhere in a public page is
// a violation regardless of how it got there.
var stray = [];
PAGES.forEach(function (page) {
  var re = /<meta[^>]*(?:og:image|twitter:image)"[^>]*content="([^"]*)"/gi, m;
  var html = read(page);
  while ((m = re.exec(html)) !== null) {
    if (!/^https:\/\//.test(m[1])) stray.push(page + ': ' + m[1]);
  }
});
check('IMAGE', 'all pages', 'no relative image url anywhere in the deployed html',
  stray.length === 0 ? 'swept independently of the per-tag parse above' : null);
stray.forEach(function (s) { check('IMAGE', 'stray', s, null); });

// ---------------------------------------------------------------- report
var byRule = {};
findings.forEach(function (f) { (byRule[f.rule] = byRule[f.rule] || []).push(f); });
['PAGES', 'CANON', 'CARD', 'IMAGE'].forEach(function (r) {
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
console.log(B + (bad ? R + 'SITE META: FAIL' : G + 'SITE META: OK') + X +
  '  ' + findings.length + ' checks, ' + bad + ' failed' +
  D + '  ·  ' + PAGES.length + ' deployable pages, hero ' + heroW + '×' + heroH + X);
if (bad) {
  console.log(D + 'Every og:image / twitter:image / og:url / canonical must be an absolute\n' +
    'https://reactordynamics.com url. A relative og:image renders no preview at all in\n' +
    'Slack, Discord, iMessage and X. See the head block in index.html for the shape.' + X);
}
process.exit(bad ? 1 : 0);
