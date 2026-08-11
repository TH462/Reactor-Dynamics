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
const KV_KEY = 'stages';
const STAGES = ['public', 'preview', 'off'];

/* The floor, enforced HERE as well as in site/flags.js. `free_play` and `manual` are
 * the sim and its manual: a stage that hides them ships a site with nothing on it, and
 * `test/run_flags.js` already refuses to let the source literals go below public. A
 * dashboard that could do by remote control what the gate forbids in source would make
 * that gate decorative, so the same rule binds both ends of the pipe.
 */
const FLOOR = { free_play: true, manual: true };

export async function readStages(env) {
  if (!env.FLAGS) return { stages: {}, updated: null, note: 'no KV binding' };
  const raw = await env.FLAGS.get(KV_KEY);
  if (!raw) return { stages: {}, updated: null };
  try {
    const j = JSON.parse(raw);
    return { stages: j.stages || {}, updated: j.updated || null };
  } catch (e) {
    return { stages: {}, updated: null, note: 'unparseable KV value' };
  }
}

/* The build reads this. Open, and unauthenticated on purpose: a stage is not a secret —
 * every one of them ships inside site/flags.js to every visitor, so gating the read
 * would protect nothing while adding a token to the Pages build environment. WRITING is
 * a different matter and stays behind DASHBOARD_TOKEN.
 */
export async function stagesEndpoint(env) {
  const { stages, updated } = await readStages(env);
  return new Response(JSON.stringify({ v: 1, updated, stages }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      // The build must never be handed a cached answer — a deploy that silently
      // stamps last week's flags is the failure this whole path exists to avoid.
      'Cache-Control': 'no-store',
    },
  });
}

async function writeStage(env, id, stage) {
  if (!env.FLAGS) throw new Error('no KV binding');
  if (FLOOR[id] && stage !== 'public') {
    throw new Error(id + ' cannot go below public — it is the sim itself');
  }
  const { stages } = await readStages(env);
  if (stage === '' || stage == null) delete stages[id];      // back to the source literal
  else if (STAGES.indexOf(stage) === -1) throw new Error('unknown stage ' + stage);
  else stages[id] = stage;
  await env.FLAGS.put(KV_KEY, JSON.stringify({
    v: 1,
    updated: new Date().toISOString().slice(0, 19).replace('T', ' '),
    stages,
  }));
}

export async function featuresAction(env, url, token, form) {
  const id = String(form.get('id') || '');
  const stage = String(form.get('stage') || '');
  let err = '';
  try { await writeStage(env, id, stage); }
  catch (e) { err = e.message; }
  const back = '?token=' + encodeURIComponent(token) + '&view=features'
    + (err ? '&err=' + encodeURIComponent(err) : '&ok=' + encodeURIComponent(id));
  return new Response(null, { status: 303, headers: { Location: back } });
}

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

/* A plain form per row. No JavaScript on this page at all — a fetch()-driven control
 * would need its own error handling, and a POST that silently failed would leave the
 * page showing a stage that was never stored. A form submit either navigates or
 * visibly does not.
 */
function stageControl(id, current, token, floored) {
  if (floored) return '<span class="muted">locked public</span>';
  const opts = ['public', 'preview', 'off'].map((s) =>
    '<option value="' + s + '"' + (s === current ? ' selected' : '') + '>' + s + '</option>').join('');
  return '<form method="POST" action="?token=' + esc(token) + '&view=features" class="inline">'
    + '<input type="hidden" name="id" value="' + esc(id) + '">'
    + '<select name="stage">' + opts + '</select>'
    + '<button type="submit">set</button></form>';
}

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

    const { stages: pending, updated } = await readStages(env);

    // Three columns that are easy to conflate and must not be: what the LIVE site is
    // serving right now, what the dashboard has queued, and what the next build will
    // therefore ship. Showing only the last would let someone read a queued change as
    // a live one.
    const areaRows = areas.map((a) => {
      const next = pending[a.id] || a.stage;
      return {
        feature: a.label,
        id: a.id,
        live_stage: a.stage,
        live: visibleOn(a.stage, chan) ? 'yes' : 'no',
        next_stage: next === a.stage ? '—' : next,
        control: stageControl(a.id, next, token, !!FLOOR[a.id]),
      };
    });

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

    /* Per-item control, which is the half of the ask the group summary cannot serve:
     * "which scenarios" means one switch per scenario, not per plant. Inside <details>
     * because 64 dropdowns unfolded would bury the six that gate whole features — and
     * <details> is native, so this page still needs no JavaScript.
     */
    const byGroup = {};
    items.forEach((i) => {
      const k = i.plant + ' ' + i.kind;
      (byGroup[k] || (byGroup[k] = [])).push(i);
    });
    const itemDetail = Object.keys(byGroup).sort().map((k) => {
      const list = byGroup[k].slice().sort((a, b) => (a.id < b.id ? -1 : 1));
      const queued = list.filter((i) => pending[i.kind + ':' + i.id]).length;
      const rows = list.map((i) => {
        const key = i.kind + ':' + i.id;
        const next = pending[key] || i.stage;
        return '<tr><td class="mono">' + esc(i.id) + '</td>'
          + '<td class="mono">' + esc(i.stage) + '</td>'
          + '<td class="mono">' + esc(next === i.stage ? '—' : next) + '</td>'
          + '<td>' + stageControl(key, next, token, false) + '</td></tr>';
      }).join('');
      return '<details><summary>' + esc(k) + ' — ' + list.length + ' entries'
        + (queued ? ', <b>' + queued + ' queued</b>' : '') + '</summary>'
        + '<table><tr><th>Id</th><th>Live stage</th><th>Queued</th><th>Set</th></tr>'
        + rows + '</table></details>';
    }).join('');

    const publicCount = items.filter((i) => i.stage === 'public').length;

    body = '<div class="tiles">'
      + '<div class="tile"><div class="v">' + esc(chan) + '</div><div class="k">Live channel</div></div>'
      + '<div class="tile"><div class="v">' + areas.filter((a) => visibleOn(a.stage, chan)).length
        + '/' + areas.length + '</div><div class="k">Features on</div></div>'
      + '<div class="tile"><div class="v">' + publicCount + '/' + items.length
        + '</div><div class="k">Items vetted</div></div>'
      + '</div>'
      + '<section><h2>Features</h2>'
      + '<table><tr><th>Feature</th><th>Flag</th><th>Live stage</th><th>Public sees it</th>'
      + '<th>Queued</th><th>Set</th></tr>'
      + areaRows.map((r) => '<tr><td>' + esc(r.feature) + '</td>'
        + '<td class="mono">' + esc(r.id) + '</td>'
        + '<td class="mono">' + esc(r.live_stage) + '</td>'
        + '<td>' + esc(r.live) + '</td>'
        + '<td class="mono">' + esc(r.next_stage) + '</td>'
        + '<td>' + r.control + '</td></tr>').join('')
      + '</table></section>'
      + '<section><h2>Playable content</h2>'
      + table(groupRows, [{ key: 'group', label: 'Group' }, { key: 'total', label: 'Entries', num: true },
          { key: 'vetted', label: 'Vetted (public)', num: true }, { key: 'off', label: 'Off', num: true },
          { key: 'live', label: 'Public sees', num: true }])
      + (updated ? '<p class="muted">Queued settings last changed <span class="mono">'
          + esc(updated) + '</span> UTC · ' + Object.keys(pending).length
          + ' override(s) waiting for a deploy.</p>' : '')
      + '<p class="muted">Every entry has been <span class="mono">preview</span> since '
      + '2026-07-28 by owner decision (#241) — they are placeholders until played '
      + 'through. Flipping one to <span class="mono">public</span> IS the vetting '
      + 'record, which is why the count above is the useful number.</p>'
      + itemDetail
      + '<p class="muted">A content item is offered only when BOTH it and the area '
      + 'listing it are on — setting a scenario to <span class="mono">public</span> '
      + 'while <span class="mono">scenarios</span> stays <span class="mono">preview</span> '
      + 'shows nobody anything.</p></section>';
  } catch (e) {
    body = errBlock(e.message);
  }

  const err = url.searchParams.get('err');
  const ok = url.searchParams.get('ok');

  return html(head
    + '<h1>Features <span class="muted">— what the live sim gates</span></h1>'
    + (err ? '<p class="err">' + esc(err) + '</p>' : '')
    + (ok ? '<p class="warn">Queued <span class="mono">' + esc(ok) + '</span>. '
        + 'It reaches players at the next deploy — see below.</p>' : '')
    + body
    + '<section><h2>How a change here reaches players</h2>'
    + '<p class="muted">Setting a stage writes it to the Worker\'s KV store. '
    + '<span class="mono">site/stamp_version.js</span> reads that at BUILD time and '
    + 'stamps it into the generated <span class="mono">site/channel.js</span>, exactly '
    + 'the way the channel itself is stamped. So a change is <b>queued, not live</b>: '
    + 'it ships on the next deploy of <span class="mono">main</span>, and the "Live '
    + 'stage" column above keeps showing what visitors actually have until then.</p>'
    + '<p class="muted">It works this way because the sim must load <b>nothing</b> at '
    + 'runtime — that is what lets it ship as one emailable file, and '
    + '<span class="mono">test/run_portable.js</span> enforces it. Fetching flag values '
    + 'at boot would break that gate (it already caught the same pattern in '
    + 'telemetry.js) and the offline download could never honour them anyway. The '
    + 'in-sim <b>Features</b> panel is unaffected and still useful: it writes '
    + '<span class="mono">localStorage</span> on the sim\'s own origin, so it previews '
    + 'a change in one browser without shipping it to anyone.</p></section>'
    + '</body></html>');
}
