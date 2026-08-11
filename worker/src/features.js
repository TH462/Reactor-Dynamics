/* Reactor Dynamics — what the live sim actually gates.
 *
 * READ-ONLY, deliberately. This tab answers "what can a visitor reach right now",
 * which is a question the dashboard should be able to answer and previously could
 * not. It does NOT change anything, because on this repo's architecture a dashboard
 * on a different origin CANNOT change it — see the note the page itself carries.
 *
 * The registry is read from the DEPLOYED `site/flags.js` rather than from the repo,
 * so this shows what the live site is really serving. A Worker fetching another
 * origin server-side is unrelated to the sim's own no-runtime-loads property — that
 * rule (test/run_portable.js) governs what the SHELL loads in a browser, and nothing
 * here runs in the player's browser.
 *
 * Parsed with regexes rather than evaluated: Workers have no eval, and flags.js is a
 * global-namespace IIFE with no export. The parse is asserted rather than assumed —
 * if either block fails to yield entries the page says so instead of rendering an
 * empty table, because "nothing is gated" and "the parser broke" look identical.
 */

import { esc, html, PAGE_HEAD, nav, table, errBlock } from './render.js';

const SITE = 'https://reactordynamics.com';

async function text(url) {
  const res = await fetch(url, { cf: { cacheTtl: 0 } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  return res.text();
}

// AREAS — `key: { label: '…', stage: '…', desc: '…', soon?: '…' }`
function parseAreas(src) {
  const block = /var AREAS\s*=\s*\{([\s\S]*?)\n\s*\};/.exec(src);
  if (!block) return [];
  const out = [];
  const re = /(\w+):\s*\{([\s\S]*?)\n\s{4}\},/g;
  let m;
  while ((m = re.exec(block[1] + '\n    },')) !== null) {
    const body = m[2];
    const label = /label:\s*'((?:[^'\\]|\\.)*)'|label:\s*"((?:[^"\\]|\\.)*)"/.exec(body);
    const stage = /stage:\s*'([a-z]+)'/.exec(body);
    out.push({
      id: m[1],
      label: label ? (label[1] || label[2] || '').replace(/\\'/g, "'") : m[1],
      stage: stage ? stage[1] : '?',
    });
  }
  return out;
}

// ITEMS — `'kind:id': 'stage',`
function parseItems(src) {
  const block = /var ITEMS\s*=\s*\{([\s\S]*?)\n\s*\};/.exec(src);
  if (!block) return [];
  const out = [];
  const re = /'([a-z]+):([a-z0-9_]+)'\s*:\s*'([a-z]+)'/g;
  let m;
  while ((m = re.exec(block[1])) !== null) {
    out.push({ kind: m[1], id: m[2], stage: m[3], plant: (m[2].split('_')[0] || '').toUpperCase() });
  }
  return out;
}

// The shipped resolution, mirrored from site/flags.js `on()` for a visitor with no
// overrides: stage 'public' is on, 'off' is off, anything else follows the channel.
const visibleOn = (stage, channel) =>
  stage === 'public' ? true : stage === 'off' ? false : channel !== 'public';

export async function featuresPage(env, url, token) {
  const head = '<!doctype html><html><head>' + PAGE_HEAD
    + '<title>Features — Reactor Dynamics</title></head><body>' + nav(token, 'features');

  let body;
  try {
    const [flagSrc, chanSrc] = await Promise.all([
      text(SITE + '/site/flags.js'),
      text(SITE + '/site/channel.js').catch(() => ''),
    ]);
    const chan = (/RD_CHANNEL\s*=\s*"([a-z]+)"/.exec(chanSrc) || [, 'unknown'])[1];
    const areas = parseAreas(flagSrc);
    const items = parseItems(flagSrc);

    if (!areas.length || !items.length) {
      throw new Error('parsed ' + areas.length + ' areas and ' + items.length
        + ' items from the live flags.js — the registry shape has probably changed');
    }

    const areaRows = areas.map((a) => ({
      feature: a.label,
      id: a.id,
      stage: a.stage,
      live: visibleOn(a.stage, chan) ? 'yes' : 'no',
    }));

    // One row per plant+kind rather than 71 rows: the interesting fact is how much of
    // each group is vetted, and every entry has been 'preview' since #241.
    const groups = {};
    items.forEach((i) => {
      const k = i.plant + ' ' + i.kind;
      const g = groups[k] || (groups[k] = { group: k, total: 0, public_n: 0, off_n: 0 });
      g.total++;
      if (i.stage === 'public') g.public_n++;
      if (i.stage === 'off') g.off_n++;
    });
    const groupRows = Object.keys(groups).sort().map((k) => ({
      group: groups[k].group,
      total: groups[k].total,
      vetted: groups[k].public_n,
      off: groups[k].off_n,
      live: visibleOn('preview', chan) ? 'all' : groups[k].public_n,
    }));

    const publicCount = items.filter((i) => i.stage === 'public').length;

    body = '<div class="tiles">'
      + '<div class="tile"><div class="v">' + esc(chan) + '</div><div class="k">Live channel</div></div>'
      + '<div class="tile"><div class="v">' + areas.filter((a) => visibleOn(a.stage, chan)).length
        + '/' + areas.length + '</div><div class="k">Features on</div></div>'
      + '<div class="tile"><div class="v">' + publicCount + '/' + items.length
        + '</div><div class="k">Items vetted</div></div>'
      + '</div>'
      + '<section><h2>Features</h2>'
      + table(areaRows, [{ key: 'feature', label: 'Feature' }, { key: 'id', label: 'Flag' },
          { key: 'stage', label: 'Stage' }, { key: 'live', label: 'Public sees it' }])
      + '</section>'
      + '<section><h2>Playable content</h2>'
      + table(groupRows, [{ key: 'group', label: 'Group' }, { key: 'total', label: 'Entries', num: true },
          { key: 'vetted', label: 'Vetted (public)', num: true }, { key: 'off', label: 'Off', num: true },
          { key: 'live', label: 'Public sees', num: true }])
      + '<p class="muted">Every entry has been <span class="mono">preview</span> since '
      + '2026-07-28 by owner decision (#241) — they are placeholders until played '
      + 'through. Flipping one to <span class="mono">public</span> IS the vetting '
      + 'record, which is why the count above is the useful number.</p></section>';
  } catch (e) {
    body = errBlock(e.message);
  }

  return html(head
    + '<h1>Features <span class="muted">— what the live sim gates</span></h1>'
    + body
    + '<section><h2>Why this tab cannot toggle anything (yet)</h2>'
    + '<p class="muted">The in-sim <b>Features</b> panel writes to '
    + '<span class="mono">localStorage</span> on the sim\'s own origin, so it changes '
    + 'what <i>that one browser</i> sees. This dashboard is a different origin and '
    + 'cannot write there — moving the panel here as-is would give it nothing to write '
    + 'to. What ships to <i>every</i> visitor is the <span class="mono">stage</span> '
    + 'literal in <span class="mono">site/flags.js</span>, plus the deploy channel.</p>'
    + '<p class="muted">Making this tab authoritative therefore means making the stage '
    + 'server-supplied. The constraint that decides how is '
    + '<span class="mono">test/run_portable.js</span>: the sim must load NOTHING at '
    + 'runtime, which is what lets it ship as one emailable file. A boot-time fetch of '
    + 'flag values would break that gate — it already caught the same pattern in '
    + 'telemetry.js once.</p></section>'
    + '</body></html>');
}
