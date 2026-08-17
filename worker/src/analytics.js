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
 * And RUM changes granularity with the window: full resolution is held for a FIXED
 * 7-day retention edge and everything older comes from a coarser pre-aggregated tier
 * that rounds. The edge is 00:00 UTC of (today - 7), and it is a cliff, not a slope —
 * measured 2026-08-17 on the live dataset, one second either side of it:
 *
 *     datetime_geq 2026-08-09T23:59:59Z  ->  sampleInterval 10,  50 pageloads
 *     datetime_geq 2026-08-10T00:00:00Z  ->  sampleInterval  1,  67 pageloads
 *
 * `windowStartMs` in render.js is what keeps the 7d window on the near side of it; see
 * its note, and the window block below, for the four hours a day that used not to be.
 * Every RUM row below carries the interval it was answered at, so a rounded figure says
 * so on the page instead of being quoted as exact.
 */

import { esc, html, PAGE_HEAD, nav, table, errBlock, dayLabel, etDay, etDayStartMs,
         windowStartMs, RUM_FULL_RES_DAYS, dur } from './render.js';
import { sql, gql, ACCOUNT, SITE_TAG, DATASET, COLUMNS_SINCE } from './cfapi.js';

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
//
// `si` is the row's own interval as a NUMBER, alongside the `exact` string the tables
// render. The by-day view re-buckets rows and has to combine intervals, and parsing them
// back out of "±10" would be reading a display string as data.
function rumRows(group, map) {
  let coarse = 0;
  const rows = (group.rumPageloadEventsAdaptiveGroups || []).map((r) => {
    const si = num((r.avg || {}).sampleInterval) || 1;
    if (si > coarse) coarse = si;
    return Object.assign(map(r.dimensions || {}), {
      pageloads: num(r.count),
      visits: num((r.sum || {}).visits),
      si,
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
  /* THE WINDOW. Aligned to EASTERN midnight, not UTC midnight — otherwise the oldest row
   * of the by-day table is the last 19 or 20 hours of its day and reads as a quiet
   * morning (2026-08-13). CLAMPED to the full-resolution edge — otherwise, for the four
   * hours a day between 8pm and midnight Eastern, that alignment reaches twenty hours
   * past it and every table on this page comes back rounded (2026-08-17).
   *
   * Measured at 01:39 UTC on 2026-08-17, which is how it was found — same instant, the
   * two starts side by side, against a true 67 pageloads / 50 visits:
   *
   *     start 2026-08-09T04:00Z (Eastern midnight, unclamped)  ->  ±10,  60 / 40
   *     start 2026-08-10T00:00Z (clamped to the edge)          ->  exact, 67 / 50
   *
   * The grouping was NOT the cause and was cleared before this was written: `date`,
   * `datetimeHour` and `requestPath` all returned the same interval at the same window
   * (1 at a 169.7h span, 10 at 189.7h). It is the start instant alone.
   *
   * The filter is still sent as UTC, which is the only thing the API accepts; only the
   * CHOICE of instant is Eastern. See `windowStartMs`.
   */
  const nowMs = Date.now();
  const fromMs = windowStartMs(nowMs, days);
  const from = new Date(fromMs).toISOString();
  const to = new Date(nowMs).toISOString();
  /* Which Eastern day the window opens PARTWAY into, if any — the price of the clamp,
   * and the thing #480 removed, so it is named on the row rather than left to read as a
   * quiet evening. Null whenever the start is a clean Eastern midnight, which is every
   * window except a clamped one. */
  const partialDay = fromMs > etDayStartMs(fromMs) ? etDay(fromMs) : null;
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

  // The headline tiles. RUM `count` is already sample-adjusted — summing the hourly rows
  // is correct here; multiplying by sampleInterval would double-count.
  let tiles = '', coarseNote = '';
  let byDay = '<p class="muted">(none)</p>';
  try {
    /* GROUPED BY HOUR AND RE-SUMMED INTO EASTERN DAYS (2026-08-13). Asking RUM for `date`
     * gets UTC calendar days, and there is no way to relabel those "ET" honestly — the
     * bucket marked 2026-08-11 holds 20:00 on the 10th to 20:00 on the 11th Eastern, so a
     * relabel silently moves four or five hours of every day's traffic into the wrong row.
     * `datetimeHour` is the finest grouping this endpoint offers that still aggregates,
     * and an hour never straddles an Eastern midnight, so the sum is exact.
     *
     * Measured on the live dataset before the change (see render.js's Eastern block):
     * hourly and daily grouping return the same totals at the same sampleInterval over
     * 7/30/90 days, so this buys the correct buckets for nothing.
     *
     * The limit must cover every hour in the window or the tail is silently dropped —
     * `days * 24` plus a day's slack for the partial hours at both ends.
     */
    const g = rumRows(await gql(apiToken,
      rumGroup('datetimeHour', 'datetimeHour_ASC', Math.min(10000, days * 24 + 48), from, to)),
      (d) => ({ day: etDay(d.datetimeHour) }));
    const pageloads = g.rows.reduce((a, r) => a + r.pageloads, 0);
    const visits = g.rows.reduce((a, r) => a + r.visits, 0);
    tiles = '<div class="tiles">'
      + '<div class="tile"><div class="v">' + pageloads + '</div><div class="k">Pageloads</div></div>'
      + '<div class="tile"><div class="v">' + visits + '</div><div class="k">Visits</div></div>'
      + '<div class="tile"><div class="v">' + days + 'd</div><div class="k">Window</div></div>'
      + '</div>';
    // The day's `exact` is the COARSEST of its hours, not an average: one rounded hour
    // makes the whole day's figure rounded, and claiming otherwise would overstate it.
    const byEtDay = new Map();
    g.rows.forEach((r) => {
      const cur = byEtDay.get(r.day) || { date: r.day, pageloads: 0, visits: 0, si: 1 };
      cur.pageloads += r.pageloads;
      cur.visits += r.visits;
      if (r.si > cur.si) cur.si = r.si;
      byEtDay.set(r.day, cur);
    });
    const dayRows = [...byEtDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((r) => ({ date: dayLabel(r.date, partialDay),
                     pageloads: r.pageloads, visits: r.visits,
                     exact: r.si === 1 ? 'yes' : '±' + r.si }));
    byDay = table(dayRows, [{ key: 'date', label: 'Date (ET)' }, ...RUM_COLS])
      + (partialDay ? '<p class="muted">The oldest row is marked <b>(partial)</b>. Full '
        + 'resolution is held for a fixed ' + RUM_FULL_RES_DAYS + '-day window that opens '
        + 'partway through that Eastern day, so the row is exact but covers only the part '
        + 'of the day inside it. The window is trimmed to that edge rather than reaching '
        + 'past it, which would round every figure on this page.</p>' : '');
    /* The warning used to open "Window > 7 days:", which was a claim about the WINDOW and
     * was false the whole time the 7d view was rounding. Report what came back. */
    if (g.coarse > 1) {
      coarseNote = '<p class="warn">Cloudflare answered this window from a coarser '
        + 'pre-aggregated tier, so these counts are rounded to the nearest ' + g.coarse
        + '. Only the last ' + RUM_FULL_RES_DAYS + ' days are held at full resolution — '
        + 'the 7d window is exact.</p>';
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
    /* TIME PER SESSION. Reported as a MEDIAN first and a mean second, because the mean
     * here is close to meaningless: the live data contains a tab left open 11h 34m, and
     * one of those drags an average across a handful of real sessions into nonsense.
     *
     * Every figure is a FLOOR built from two independent lower bounds per session — the
     * span of write times, and the client's own clock at its last event. Neither can
     * overstate: the write span misses everything inside a single batch (measured: two
     * real sessions of 6 and 4 events span 00:00 while the player was there at least
     * 6 s), and the client clock restarts at 0 on a reload. The larger of the two is
     * the best available lower bound, and it measures a tab being OPEN, not play.
     */
    section('Time per session', async () => {
      const spans = await sql(apiToken, `SELECT blob4 AS session,
              min(timestamp) AS first_seen, max(timestamp) AS last_seen
         FROM ${DATASET} WHERE blob2 <> 'dev' AND ${since} GROUP BY session`);
      if (!spans.length) return '<p class="muted">(none)</p>';

      // The client clock is a separate query and only exists post-column; absent, the
      // write span stands alone. Naming double5 with no qualifying row is a 422.
      let lastBy = {};
      try {
        const probe = await sql(apiToken, `SELECT count() AS n FROM ${DATASET}
            WHERE ${since} AND timestamp >= ${COLUMNS_SINCE}`);
        if (num(probe[0] && probe[0].n) > 0) {
          (await sql(apiToken, `SELECT blob4 AS session, max(double5) AS t_last
              FROM ${DATASET} WHERE blob2 <> 'dev' AND ${since}
                AND timestamp >= ${COLUMNS_SINCE} GROUP BY session`))
            .forEach((r) => { lastBy[r.session] = num(r.t_last); });
        }
      } catch (e) { lastBy = {}; }

      const secs = spans.map((r) => {
        const t = (s) => Date.parse(String(s || '').trim().replace(' ', 'T') + 'Z');
        const write = (t(r.last_seen) - t(r.first_seen)) / 1000;
        return Math.max(isFinite(write) && write > 0 ? write : 0, lastBy[r.session] || 0);
      }).sort((a, b) => a - b);

      const mid = Math.floor(secs.length / 2);
      const median = secs.length % 2 ? secs[mid] : (secs[mid - 1] + secs[mid]) / 2;
      const mean = secs.reduce((a, b) => a + b, 0) / secs.length;

      return '<div class="tiles">'
        + '<div class="tile"><div class="v">' + esc(dur(median)) + '</div><div class="k">Median</div></div>'
        + '<div class="tile"><div class="v">' + esc(dur(mean)) + '</div><div class="k">Mean</div></div>'
        + '<div class="tile"><div class="v">' + esc(dur(secs[secs.length - 1])) + '</div><div class="k">Longest</div></div>'
        + '<div class="tile"><div class="v">' + secs.length + '</div><div class="k">Sessions</div></div>'
        + '</div>'
        + '<p class="muted">A FLOOR, and time a TAB WAS OPEN rather than time spent '
        + 'playing — the longest figure here is usually a tab someone left. Trust the '
        + 'median; the mean follows whichever tab was abandoned longest.</p>';
    }),
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
    /* Controls the plant REFUSED. TWO guards, and neither is optional: `double7 >= 0`
     * drops clients that had no opinion, and `timestamp >= COLUMNS_SINCE` drops rows
     * written before the column existed — those read back as 0, not -1, so the sentinel
     * cannot see them and they would be counted as "allowed" (see cfapi.js). The rate
     * matters more than the count — 40 refusals out of 41 presses is a control nobody
     * can use, 40 out of 4000 is an interlock doing its job — so the denominator comes
     * from the same query rather than by eye, and both guards apply to it too.
     *
     * DENOMINATOR CAVEAT, stated on the page: this counts presses that went through the
     * command dispatcher. `play`, `reset`, `start_scenario` and the URL-bootstrap paths
     * call service.handleCommand directly and emit nothing (ui/app.js:3458,3466,6011,
     * 6055,6523-6561), so they are in neither column. */
    section('Controls people try but cannot use', async () => {
      /* `blob2 <> 'dev'` excludes hand-made probes. The dev channel never reaches this
       * dataset from a real visitor — a local checkout has no endpoint and sends
       * nothing — so a dev row is always someone testing the pipeline by hand. It is
       * filtered HERE and not in the sections above because this view reports a RATE:
       * one synthetic row among hundreds cannot move a ranking, but it can and did read
       * as "rod_nudge, 100 % refused, a control nobody can use". */
      const rows = await sql(apiToken, `SELECT blob5 AS action, blob7 AS code,
              sum(_sample_interval) AS presses,
              sumIf(_sample_interval, double7 = 1) AS refused,
              count(DISTINCT blob4) AS sessions
         FROM ${DATASET} WHERE blob1 = 'command' AND double7 >= 0
              AND blob2 <> 'dev'
              AND timestamp >= ${COLUMNS_SINCE} AND ${since}
         GROUP BY action, code ORDER BY refused DESC LIMIT 25`);
      const shown = rows.filter((r) => num(r.refused) > 0).map((r) => ({
        action: r.action || '(none)',
        code: r.code || '—',
        refused: num(r.refused),
        presses: num(r.presses),
        rate: num(r.presses) ? Math.round((num(r.refused) / num(r.presses)) * 100) + '%' : '—',
        sessions: num(r.sessions),
      }));
      return table(shown, [
        { key: 'action', label: 'Action' }, { key: 'code', label: 'Why' },
        { key: 'refused', label: 'Refused', num: true }, { key: 'presses', label: 'Presses', num: true },
        { key: 'rate', label: 'Rate', num: true }, { key: 'sessions', label: 'Sessions', num: true }])
        + '<p class="muted">Of presses that went through the command dispatcher — '
        + '<span class="mono">play</span>, <span class="mono">reset</span> and scenario '
        + 'starts bypass it and are in neither column. Rows from clients older than the '
        + 'column are excluded rather than counted as “not refused”.</p>';
    }),
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
    + '<p class="muted">Window: ' + windowLink(7) + ' · ' + windowLink(14) + ' · ' + windowLink(30)
    + ' · every date and time here is <b>Eastern</b>, and the rows below are Eastern days '
    + 'measured midnight to midnight.</p>'
    + tiles + coarseNote
    + '<h2>Traffic <span class="muted">— real browsers, bots excluded</span></h2>'
    + sections.join('')
    + '<h2>In the simulator <span class="muted">— consented sessions only</span></h2>'
    + '<p class="muted">Session counts are a FLOOR: sampling drops whole rows, and no '
    + 'weighting recovers a session that vanished entirely.</p>'
    + usage.join('')
    + '</body></html>');
}
