/* Reactor Dynamics — the analytics half of the ops dashboard.
 *
 * Two sources, two APIs, and they are NOT interchangeable:
 *
 *   traffic   Web Analytics RUM, over GraphQL  — pageloads, visits, pages, referrers
 *   in-sim    Analytics Engine, over the SQL API — what people do once inside the sim
 *
 * Both transports live in `cfapi.js` — read its header for why a token is involved at
 * all, and what Analytics Engine SQL does not support.
 *
 * ------------------------------------------------ THE TWO SAMPLING CONVENTIONS ARE OPPOSITE
 * This cost a 15× error once (RD_Ops/runbook.md, measured 2026-08-10):
 *
 *   Analytics Engine   `count()` is the RAW stored rows, an UNDERCOUNT.
 *                      The true number is `sum(_sample_interval)`.
 *   Web Analytics RUM  `count` is ALREADY sample-adjusted. DO NOT multiply it.
 *
 * And RUM changes granularity with the window: a span of ≤7 days answers at
 * sampleInterval 1 (exact), while ≥14 days comes from a coarser pre-aggregated tier and
 * rounds. Every RUM row below carries the interval it was answered at, so a rounded
 * figure says so on the page instead of being quoted as exact.
 */

import { esc, html, PAGE_HEAD, nav, table, errBlock } from './render.js';
import { sql, gql, ACCOUNT, SITE_TAG, DATASET } from './cfapi.js';

// ---------------------------------------------------------------- RUM helpers
const num = (v) => (v == null || v === '' ? 0 : Number(v));

function rumGroup(dims, order, limit, from, to) {
  return `{ viewer { accounts(filter: {accountTag: "${ACCOUNT}"}) {
    rumPageloadEventsAdaptiveGroups(limit: ${limit},
      filter: {datetime_geq: "${from}", datetime_leq: "${to}", siteTag: "${SITE_TAG}"},
      orderBy: [${order}]) {
      count
      avg { sampleInterval }
      sum { visits }
      dimensions { ${dims} }
    } } } }`;
}

// Returns {rows, coarse} — `coarse` is the largest sampleInterval seen, i.e. how rounded
// these numbers are. 1 means exact.
function rumRows(group, map) {
  let coarse = 0;
  const rows = (group.rumPageloadEventsAdaptiveGroups || []).map((r) => {
    const si = num((r.avg || {}).sampleInterval) || 1;
    if (si > coarse) coarse = si;
    return Object.assign(map(r.dimensions || {}), {
      pageloads: num(r.count),
      visits: num((r.sum || {}).visits),
      exact: si === 1 ? 'yes' : '±' + si,
    });
  });
  return { rows, coarse: coarse || 1 };
}

// Renders one section, and turns a failed query into a visible message rather than an
// empty frame — a silent zero is indistinguishable from "nothing happened".
async function section(title, fn) {
  let inner;
  try { inner = await fn(); }
  catch (e) { inner = errBlock(e.message); }
  return '<section><h2>' + esc(title) + '</h2>' + inner + '</section>';
}

const RUM_COLS = [
  { key: 'pageloads', label: 'Pageloads', num: true },
  { key: 'visits', label: 'Visits', num: true },
  { key: 'exact', label: 'Exact', num: true },
];

// ---------------------------------------------------------------- the page
export async function analyticsPage(env, url, token) {
  const apiToken = env.CF_ANALYTICS_TOKEN;
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days')) || 7));
  const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 11) + '00:00:00Z';
  const to = new Date().toISOString();
  const since = `timestamp > NOW() - INTERVAL '${days}' DAY`;

  const head = '<!doctype html><html><head>' + PAGE_HEAD
    + '<title>Analytics — Reactor Dynamics</title></head><body>' + nav(token, 'analytics');

  if (!apiToken) {
    return html(head
      + '<h1>Analytics</h1>'
      + '<p class="warn">No <span class="mono">CF_ANALYTICS_TOKEN</span> secret is set on this Worker, '
      + 'so traffic and in-sim usage cannot be read.</p>'
      + '<pre>cd worker\nwrangler secret put CF_ANALYTICS_TOKEN   # Account Analytics / Read\nwrangler deploy</pre>'
      + '</body></html>');
  }

  const windowLink = (n) => {
    const href = '?token=' + encodeURIComponent(token) + '&view=analytics&days=' + n;
    return n === days ? '<b>' + n + 'd</b>' : '<a href="' + href + '">' + n + 'd</a>';
  };

  // The headline tiles. RUM `count` is already sample-adjusted — summing the per-day
  // rows is correct here; multiplying by sampleInterval would double-count.
  let tiles = '', coarseNote = '';
  let byDay = '<p class="muted">(none)</p>';
  try {
    const g = rumRows(await gql(apiToken, rumGroup('date', 'date_ASC', 90, from, to)), (d) => ({ date: d.date }));
    const pageloads = g.rows.reduce((a, r) => a + r.pageloads, 0);
    const visits = g.rows.reduce((a, r) => a + r.visits, 0);
    tiles = '<div class="tiles">'
      + '<div class="tile"><div class="v">' + pageloads + '</div><div class="k">Pageloads</div></div>'
      + '<div class="tile"><div class="v">' + visits + '</div><div class="k">Visits</div></div>'
      + '<div class="tile"><div class="v">' + days + 'd</div><div class="k">Window</div></div>'
      + '</div>';
    byDay = table(g.rows, [{ key: 'date', label: 'Date' }, ...RUM_COLS]);
    if (g.coarse > 1) {
      coarseNote = '<p class="warn">Window &gt; 7 days: Cloudflare answered from a coarser '
        + 'pre-aggregated tier, so these counts are rounded to the nearest ' + g.coarse
        + '. Use the 7d window for exact figures.</p>';
    }
  } catch (e) {
    tiles = errBlock(e.message);
  }

  const sections = await Promise.all([
    section('By day', async () => byDay),
    section('Top pages', async () => table(
      rumRows(await gql(apiToken, rumGroup('requestPath', 'count_DESC', 15, from, to)),
        (d) => ({ path: d.requestPath })).rows,
      [{ key: 'path', label: 'Path' }, ...RUM_COLS])),
    section('Where they came from', async () => table(
      rumRows(await gql(apiToken, rumGroup('refererHost', 'count_DESC', 15, from, to)),
        (d) => ({ referer: d.refererHost || '(direct)' })).rows,
      [{ key: 'referer', label: 'Referrer' }, ...RUM_COLS])),
    section('Countries', async () => table(
      rumRows(await gql(apiToken, rumGroup('countryName', 'count_DESC', 15, from, to)),
        (d) => ({ country: d.countryName })).rows,
      [{ key: 'country', label: 'Country' }, ...RUM_COLS])),
    section('Devices', async () => table(
      rumRows(await gql(apiToken, rumGroup('deviceType', 'count_DESC', 10, from, to)),
        (d) => ({ device: d.deviceType })).rows,
      [{ key: 'device', label: 'Device' }, ...RUM_COLS])),
  ]);

  // ---- in-sim usage. sum(_sample_interval), never count() — see the header.
  const usage = await Promise.all([
    section('Sessions by starting condition', async () => table(
      (await sql(apiToken, `SELECT blob5 AS initial_state, count(DISTINCT blob4) AS sessions
         FROM ${DATASET} WHERE blob1 = 'session_start' AND ${since}
         GROUP BY initial_state ORDER BY sessions DESC`))
        .map((r) => ({ initial_state: r.initial_state || '(none)', sessions: num(r.sessions) })),
      [{ key: 'initial_state', label: 'Starting condition' },
       { key: 'sessions', label: 'Sessions', num: true }])),
    section('How far through a startup they get', async () => table(
      (await sql(apiToken, `SELECT double3 AS mode, count(DISTINCT blob4) AS sessions
         FROM ${DATASET} WHERE blob1 = 'plant_mode' AND ${since}
         GROUP BY mode ORDER BY mode DESC`))
        .map((r) => ({ mode: 'Mode ' + num(r.mode), sessions: num(r.sessions) })),
      [{ key: 'mode', label: 'Reached' }, { key: 'sessions', label: 'Sessions', num: true }])),
    section('Most-used controls', async () => table(
      (await sql(apiToken, `SELECT blob5 AS action, sum(_sample_interval) AS uses,
              count(DISTINCT blob4) AS sessions
         FROM ${DATASET} WHERE blob1 = 'command' AND ${since}
         GROUP BY action ORDER BY uses DESC LIMIT 20`))
        .map((r) => ({ action: r.action || '(none)', uses: num(r.uses), sessions: num(r.sessions) })),
      [{ key: 'action', label: 'Action' }, { key: 'uses', label: 'Uses', num: true },
       { key: 'sessions', label: 'Sessions', num: true }])),
    section('Panels opened', async () => table(
      (await sql(apiToken, `SELECT blob5 AS panel, sum(_sample_interval) AS opens,
              count(DISTINCT blob4) AS sessions
         FROM ${DATASET} WHERE blob1 = 'panel_open' AND ${since}
         GROUP BY panel ORDER BY opens DESC LIMIT 20`))
        .map((r) => ({ panel: r.panel || '(none)', opens: num(r.opens), sessions: num(r.sessions) })),
      [{ key: 'panel', label: 'Panel' }, { key: 'opens', label: 'Opens', num: true },
       { key: 'sessions', label: 'Sessions', num: true }])),
  ]);

  return html(head
    + '<h1>Analytics <span class="muted">— last ' + days + ' days</span></h1>'
    + '<p class="muted">Window: ' + windowLink(7) + ' · ' + windowLink(14) + ' · ' + windowLink(30) + '</p>'
    + tiles + coarseNote
    + '<h2>Traffic <span class="muted">— real browsers, bots excluded</span></h2>'
    + sections.join('')
    + '<h2>In the simulator <span class="muted">— consented sessions only</span></h2>'
    + '<p class="muted">Session counts are a FLOOR: sampling drops whole rows, and no '
    + 'weighting recovers a session that vanished entirely.</p>'
    + usage.join('')
    + '</body></html>');
}
