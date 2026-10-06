/* build_manuals.js — publish the PWR operator manuals as static HTML (SEO), at build time.
 *
 * Called by site/build_site.js (BUILD_ONLY — never published). The in-app manual renders the
 * same Manuals/*.md through ui/md_render.js (RD.mdToHtml), so this REUSES that renderer rather
 * than carrying a second one: the two cannot disagree about what a table or a heading is.
 * The document list is tools/pack_manuals.js's DOCS — the website and the in-app manual share
 * one definition of "the manual".
 *
 * Output: <out>/manuals/<slug>.html, one per chapter, plus manuals/index.html (the README).
 * SLUG: file name lowercased, `_` -> `-`, `.md` dropped (04_NORMAL_OPERATIONS.md ->
 * 04-normal-operations.html); README.md -> index.html.
 *
 * Source links `NN_NAME.md#frag` become `<slug>.html#frag`. A link that leaves the packed set
 * goes to the file on GitHub (main). The generated pages are then walked, rewritten
 * extensionless and cache-busted by build_site.js exactly like the root pages, so a dead link
 * fails the build.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { DOCS: PACKED } = require(path.join(ROOT, 'tools', 'pack_manuals.js'));
/* In the app, NOT on the web. 00 is a dev-facing log (issue numbers, ruling quotes) with no
 * search value. 11 documents the training campaign, which is flag-gated (site/flags.js,
 * stage 'preview'): an unreleased feature gets no public page, same rule as changelog.html.
 * Re-add 11 when `campaign` goes public. Links to these go to GitHub, like any unpacked file. */
const WEB_WITHHELD = ['00_REVISION_HISTORY.md', '11_CAMPAIGN_CROSSWALK.md'];
const DOCS = PACKED.filter((f) => WEB_WITHHELD.indexOf(f) === -1);
require(path.join(ROOT, 'ui', 'md_render.js'));
const mdToHtml = globalThis.RD.mdToHtml;

const SITE = 'https://reactordynamics.com';
const GH = 'https://github.com/TH462/Reactor-Dynamics/blob/main/';
const HERO = SITE + '/site/hero.png';

const slugOf = (file) => file === 'README.md' ? 'index'
  : file.replace(/\.md$/, '').toLowerCase().replace(/_/g, '-');
/* `./index.html`, never bare `index.html`: build_site.js's extensionless rewrite turns a bare
 * index.html into `/` (the SITE root), which is the wrong page from inside manuals/. */
const hrefOf = (slug) => slug === 'index' ? './index.html' : slug + '.html';
const relOf = (file) => 'manuals/' + slugOf(file) + '.html';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const plain = (s) => s.replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/\*([^*]+)\*/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();

function titleOf(md, file) {
  const m = /^#\s+(.+)$/m.exec(md);
  return m ? plain(m[1]) : file.replace(/\.md$/, '');
}

/* First real prose paragraph, <=160 chars. Skips headings, tables, lists, rules and the
 * "**Document:** ..." metadata block every chapter opens with. */
const DESC_OVERRIDE = {   // chapters whose first paragraph is a callout/fragment, not a summary
  'Manuals/08_ACCIDENT_TMI.md': 'The Three Mile Island Unit 2 accident as it can be lived on this simulated plant: what the crew saw, what they believed, and what they did.',
  'Manuals/09_SETPOINTS_LIMITS.md': 'Normal operating values, protection setpoints and operating limits for the Reactor Dynamics PWR simulator, in US units with SI.',
  'Manuals/00_REVISION_HISTORY.md': 'What changed in each revision of the Reactor Dynamics PWR operator manual set, newest first.',
};
function describe(md, file) {
  if (DESC_OVERRIDE['Manuals/' + file]) return DESC_OVERRIDE['Manuals/' + file];
  const paras = md.replace(/<!--[\s\S]*?-->/g, '').replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  for (const raw of paras) {
    const t = raw.trim();
    if (!t || /^(#|\||-|\*\s|>|`|\d+\.)/.test(t) || /^\*\*[^*]+:\*\*/.test(t)) continue;
    const p = plain(t);
    if (p.length < 50) continue;
    if (p.length <= 160) return p;
    const cut = p.slice(0, 159).replace(/\s+\S*$/, '');
    return cut + '…';
  }
  throw new Error('no description paragraph found');
}

const NAV_ITEMS = [['../ui/shell.html?engine=pwr2', 'Simulator'], ['../about.html', 'About'],
  ['../physics.html', 'Physics'], ['../roadmap.html', 'Roadmap'], ['./index.html', 'Manual'],
  ['../download.html', 'Download'], ['../changelog.html', 'Changelog']];

function page(o) {
  const nav = NAV_ITEMS.map((n) => '      <a' + (n[1] === 'Manual' ? ' class="active"' : '') +
    ' href="' + n[0] + '">' + n[1] + '</a>').join('\n') +
    '\n      <a href="https://github.com/TH462/Reactor-Dynamics" rel="noopener">GitHub</a>';
  const url = SITE + '/' + o.rel;
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(o.title)}</title>
    <meta name="description" content="${esc(o.desc)}">
    <link rel="canonical" href="${url}">
    <meta property="og:site_name" content="Reactor Dynamics">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${esc(o.title)}">
    <meta property="og:description" content="${esc(o.desc)}">
    <meta property="og:image" content="${HERO}">
    <meta property="og:image:width" content="1915">
    <meta property="og:image:height" content="1045">
    <meta property="og:image:alt" content="The Reactor Dynamics PWR control-room board">
    <meta property="og:type" content="article">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(o.title)}">
    <meta name="twitter:description" content="${esc(o.desc)}">
    <meta name="twitter:image" content="${HERO}">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚛️</text></svg>">
    <link rel="stylesheet" href="../site/site.css">
    <script src="../site/channel.js"></script>
    <script>(function (c) {
      document.documentElement.setAttribute('data-channel', c);
      if (c !== 'public') document.title = '[TEST] ' + document.title;
    }(window.RD_CHANNEL || 'dev'));</script>
</head>
<body>

<div class="dev-bar" role="status">
  <strong>TEST BUILD</strong> &mdash; an unstable work in progress, not the released
  simulator. Things here are half-finished on purpose. The stable version is at
  <a href="https://reactordynamics.com/">reactordynamics.com</a>.
</div>

<header class="site-header">
  <div class="bar">
    <a class="brand" href="../index.html">Reactor⚛️Dynamics</a>
    <span class="brand-alpha" title="This is an early alpha build — a work in progress.">ALPHA</span>
    <span class="brand-test" title="This is the unstable test build, not the released site.">TEST</span>
    <span class="brand-ver" id="brandVer" title="The release this build ships as — see the Changelog."></span>
    <div class="nav-wrap">
      <button type="button" class="nav-burger" id="navBurger"
              aria-label="Open menu" aria-expanded="false" aria-controls="siteNav">
        <span></span><span></span><span></span>
      </button>
      <nav class="site-nav" id="siteNav">
${nav}
      </nav>
    </div>
  </div>
</header>

<main class="page manual">
  <p class="manual-crumb"><a href="./index.html">PWR Operator Manual</a> &middot;
  <a class="cta-inline" href="../ui/shell.html?engine=pwr2">Open the simulator</a></p>
${o.body}
  <nav class="manual-pager" aria-label="Chapters">
    ${o.prev ? '<a rel="prev" href="' + o.prev.href + '">&larr; ' + esc(o.prev.label) + '</a>' : '<span></span>'}
    ${o.next ? '<a rel="next" href="' + o.next.href + '">' + esc(o.next.label) + ' &rarr;</a>' : '<span></span>'}
  </nav>
  <p class="manual-license">These manuals are licensed
  <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener">CC BY 4.0</a>
  &mdash; see <a href="../legal.html">Legal</a>. Training documents for an educational
  simulator, not licensing-basis documents for a real plant.</p>
</main>

<footer class="site-footer">
  <div class="inner">
    <div>Reactor Dynamics is an educational simulation — not engineering
    software, and no substitute for real operator training.</div>
    <div class="links">
      <a href="../about.html">About</a>
      <a href="../physics.html">Physics</a>
      <a href="../roadmap.html">Roadmap</a>
      <a href="./index.html">Manual</a>
      <a href="../changelog.html">Changelog</a>
      <a href="../privacy.html">Privacy</a>
      <a href="../legal.html">Legal</a>
      <a href="https://github.com/TH462/Reactor-Dynamics" rel="noopener">GitHub</a>
      <span id="ver" class="mono"></span>
    </div>
  </div>
</footer>

<script src="../site/version.js"></script>
<script src="../site/release.js"></script>
<script src="../site/telemetry_endpoint.js"></script>
<script src="../site/telemetry.js"></script>
<script src="../site/nav.js"></script>
</body>
</html>
`;
}

/* Returns the output-relative paths of every page written, index first. */
function buildManuals(OUT) {
  const slugs = new Set(DOCS.map(slugOf));
  const docs = DOCS.map((file) => {
    const md = fs.readFileSync(path.join(ROOT, 'Manuals', file), 'utf8').replace(/^﻿/, '');
    return { file, md, slug: slugOf(file), rel: relOf(file), title: titleOf(md, file) };
  });
  const bodies = {};
  docs.forEach((d) => { bodies[d.slug] = mdToHtml(d.md); });

  const warnings = [];
  function fixLinks(html, d) {
    return html.replace(/<a href="#" class="mdoc-doclink" data-doc="([^"]*)">/g, (whole, ref) => {
      ref = ref.replace(/&amp;/g, '&');
      const hash = ref.indexOf('#');
      const f = (hash < 0 ? ref : ref.slice(0, hash)).replace(/^\.\//, '');
      const frag = hash < 0 ? '' : ref.slice(hash);
      if (/^[A-Za-z0-9_]+\.md$/.test(f) && DOCS.indexOf(f) !== -1) {
        const t = bodies[slugOf(f)];
        if (frag && t.indexOf('id="' + frag.slice(1) + '"') === -1) {
          warnings.push(d.file + ' -> ' + ref + ' (anchor not in target)');
        }
        return '<a href="' + hrefOf(slugOf(f)) + frag + '">';
      }
      // Outside the packed set (Blueprint/, a dev-facing Manuals log, ...): the file on GitHub.
      return '<a href="' + GH + path.posix.normalize('Manuals/' + f) + frag + '" rel="noopener">';
    });
  }

  const written = [];
  docs.forEach((d, i) => {
    let body = fixLinks(bodies[d.slug], d);
    const isIndex = d.slug === 'index';
    if (isIndex) {
      const list = docs.filter((x) => x.slug !== 'index').map((x) =>
        '<li><a href="' + hrefOf(x.slug) + '">' + esc(x.title) + '</a></li>').join('\n');
      body += '\n<h2 id="chapters">Chapters</h2>\n<ul class="manual-toc">\n' + list + '\n</ul>';
    }
    const pn = (x) => x && { href: hrefOf(x.slug), label: x.slug === 'index' ? 'Manual home' : x.title };
    const title = (isIndex ? 'PWR Operator Manual' : d.title + ' — PWR Operator Manual') +
      ' — Reactor Dynamics';
    fs.mkdirSync(path.join(OUT, 'manuals'), { recursive: true });
    fs.writeFileSync(path.join(OUT, d.rel), page({
      rel: isIndex ? 'manuals/index.html' : d.rel, title, desc: describe(d.md, d.file), body,
      prev: pn(docs[i - 1]), next: pn(docs[i + 1]),
    }));
    written.push(d.rel);
  });
  warnings.forEach((w) => console.warn('manuals: ' + w));
  if (!slugs.has('index')) throw new Error('README.md is not in pack_manuals DOCS');
  return { pages: written, sources: docs.map((d) => [d.rel, 'Manuals/' + d.file]) };
}

module.exports = { buildManuals: buildManuals, slugOf: slugOf, WEB_WITHHELD: WEB_WITHHELD };
