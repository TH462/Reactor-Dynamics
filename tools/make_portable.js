/* make_portable.js — bundle the control room into ONE self-contained .html file.
 *
 *   node tools/make_portable.js               -> dist/Reactor_Dynamics_Alpha_1.9.0.html
 *   node tools/make_portable.js <out.html>    -> write somewhere else
 *
 * WHY. The sim already ran offline before this tool existed — every runtime file is a
 * plain global-namespace script, there is no `fetch` anywhere, the operator's manual is
 * pre-packed into ui/manual_md.js, and there are no images or web fonts at all. So
 * `file:///…/ui/shell.html` worked as-is. What it needed was a *folder*, which is not a
 * thing you can email. This collapses the folder into one file: 96 assets (94 scripts +
 * 2 stylesheets) inlined in document order, nothing left to load.
 *
 * GENERATED OUTPUT — never hand-edit the file in dist/. Edit ui/shell.html (or the
 * sources it loads) and re-run. The bundle is deliberately NOT minified: the code stays
 * readable, which is also what keeps AGPL §13 honest when you hand the file to someone.
 *
 * THE GUARD IS test/run_portable.js. It calls build() here and asserts the result loads
 * nothing at runtime. Add a fetch(), an ES module, a web font or a CDN tag and that gate
 * goes red — which is the point, because otherwise the emailed file breaks silently on
 * a stranger's machine and you never hear about it.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHELL = path.join(ROOT, 'ui', 'shell.html');
const SHELL_DIR = path.dirname(SHELL);

// The logo is an <a href="../index.html"> — inside a single file there is no sibling
// landing page to point at. A dead relative link is worse than an outbound one, so it
// goes to the project's public home (the domain legal.html names as the work's home).
// Neutralize it to a plain span here if you would rather ship no outbound link at all.
const HOME_URL = 'https://reactordynamics.com';

// Absolute-path tags that CANNOT be inlined and are dropped, each with its reason.
// An external tag that is not on this list is a HARD ERROR — shipping one silently is
// the exact failure this tool exists to prevent, so it must never be a warning.
const DROP = {
  '/_vercel/insights/script.js':
    'Vercel Web Analytics beacon — a server-side route, already 404s anywhere but Vercel. A portable build has no analytics, by construction.',
  '/_vercel/speed-insights/script.js':
    'Vercel Speed Insights beacon — same; real-user load timings only mean anything on the deployed site.',
};

// The ⚛️ favicon index.html uses, as a data: URI — an emailed file still gets a labelled
// browser tab, and a data: URI is not a network load.
const FAVICON =
  '<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 ' +
  'viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>&#9883;&#65039;</text></svg>">';

function release() {
  const src = fs.readFileSync(path.join(ROOT, 'site', 'release.js'), 'utf8');
  const m = /RD_RELEASE\s*=\s*"([^"]+)"/.exec(src);
  return m ? m[1] : 'Alpha';
}

function readAsset(href) {
  const abs = path.join(SHELL_DIR, href);
  if (!fs.existsSync(abs)) throw new Error('missing asset referenced by ui/shell.html: ' + href);
  return fs.readFileSync(abs, 'utf8');
}

function isExternal(src) { return /^(?:[a-z]+:)?\/\//i.test(src) || src[0] === '/'; }

/* Build the bundle in memory. Returns { html, css, js, dropped } — the gate uses the
 * lists to check the tally, and never writes to disk. */
function build() {
  const css = [], js = [], dropped = [];
  let html = fs.readFileSync(SHELL, 'utf8');

  // --- stylesheets -> <style>, in place so cascade order is preserved -----------
  html = html.replace(/[ \t]*<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>[ \t]*\r?\n?/g,
    function (m, href) {
      if (isExternal(href)) throw new Error('external stylesheet cannot be bundled: ' + href);
      css.push(href);
      // A stylesheet cannot contain "</style>", so no escaping is needed here.
      return '<style>\n/* ===== ' + href + ' ===== */\n' + readAsset(href) + '\n</style>\n';
    });

  // --- scripts -> inline, in document order ------------------------------------
  // Matches only src-carrying tags with an empty body: `<script>…code…</script>` has a
  // non-whitespace body and is left untouched (shell.html has none today, but a future
  // inline block must not be silently mangled).
  html = html.replace(/[ \t]*<script\b([^>]*)>[ \t\r\n]*<\/script>[ \t]*\r?\n?/g,
    function (m, attrs) {
      const sm = /\ssrc="([^"]+)"/.exec(attrs);
      if (!sm) return m;
      const src = sm[1];
      if (isExternal(src)) {
        if (DROP[src]) { dropped.push(src); return ''; }
        throw new Error(
          'undeclared external script in ui/shell.html: ' + src +
          '\nA portable build cannot fetch it. Either inline it, or add it to DROP in ' +
          'tools/make_portable.js with the reason it is safe to lose offline.');
      }
      js.push(src);
      // `</script` anywhere in a JS body — even in a comment, which is where the one
      // real case lives (ui/diagram/board/std_pipe.js:6) — would close the tag early
      // and dump the rest of the file into the DOM as text.
      return '<script>\n/* ===== ' + src + ' ===== */\n' +
        readAsset(src).replace(/<\/script/gi, '<\\/script') + '\n</script>\n';
    });

  // --- single-file fixups ------------------------------------------------------
  html = html.replace('href="../index.html"', 'href="' + HOME_URL + '" target="_blank" rel="noopener"');
  html = html.replace('</head>', '  ' + FAVICON + '\n</head>');
  html = html.replace(/^<!DOCTYPE html>/i,
    '<!DOCTYPE html>\n<!--\n  Reactor Dynamics — ' + release() + ' — PORTABLE SINGLE-FILE BUILD\n' +
    '  Generated by tools/make_portable.js from ui/shell.html. Do not hand-edit.\n' +
    '  Runs with no server and no network: open it in any desktop browser.\n' +
    '  Code AGPL-3.0, manuals & training prose CC BY 4.0, (c) 2026 Timothy Holt.\n-->');

  return { html: html, css: css, js: js, dropped: dropped };
}

// ------------------------------------------------------------------ CLI
if (require.main === module) {
  const b = build();
  const name = 'Reactor_Dynamics_' + release().replace(/[^A-Za-z0-9.]+/g, '_') + '.html';
  const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'dist', name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, b.html, 'utf8');

  const kb = n => (n / 1024).toFixed(0) + ' KB';
  console.log('\nPORTABLE BUILD - ' + release());
  console.log('  inlined      ' + b.js.length + ' scripts, ' + b.css.length + ' stylesheets');
  b.dropped.forEach(s => console.log('  dropped      ' + s + '  (declared: analytics beacon)'));
  console.log('  out          ' + path.relative(ROOT, out).replace(/\\/g, '/'));
  console.log('  size         ' + kb(Buffer.byteLength(b.html)));
  console.log('\nOpen it by double-clicking: no server, no network, no install.');
  console.log('Emailing it: ZIP it first. Several mail providers silently strip or');
  console.log('quarantine .html attachments, and the recipient sees nothing at all.\n');
}

module.exports = { build: build, release: release, DROP: DROP, SHELL: SHELL };
