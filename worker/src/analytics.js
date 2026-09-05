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
         windowStartMs, RUM_FULL_RES_DAYS, dur, barChart, bucketDays } from './render.js';
import { sql, gql, ACCOUNT, SITE_TAG, DATASET, COLUMNS_SINCE } from './cfapi.js';
import { referrerKind } from './rollup.js';

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

/* WEB VITALS — an entire dataset that was never queried (#604).
 *
 * WHY IT EARNS A SECTION HERE. #596 was the sim render-bound at 4.7 fps, and it was found
 * because the owner played it and said so. INP is exactly that measurement, taken on every
 * real visit, and `interactionToNextPaintPath` names the page it happened on. The next
 * regression of that shape should reach this page before it reaches him.
 *
 * The `*Path` / `*Element` dimensions are the reason this is worth more than a score: they
 * name WHAT caused the worst paint or the worst shift, not just how bad it was.
 */
function vitalsGroup(dims, order, limit, from, to) {
  return `{ viewer { accounts(filter: {accountTag: "${ACCOUNT}"}) {
    rumWebVitalsEventsAdaptiveGroups(limit: ${limit},
      filter: {datetime_geq: "${from}", datetime_leq: "${to}", siteTag: "${SITE_TAG}"},
      orderBy: [${order}]) {
      count
      avg { sampleInterval }
      dimensions { ${dims} }
    } } } }`;
}

// Returns {rows, coarse} — `coarse` is the largest sampleInterval seen, i.e. how rounded
// these numbers are. 1 means exact.
//
// `si` is the row's own interval as a NUMBER, alongside the `exact` string the tables
// render. The by-day view re-buckets rows and has to combine intervals, and parsing them
// back out of "±10" would be reading a display string as data.
/* ⚠ `key` NAMES THE DATASET, and defaulting it is what made this a trap. This read
 * `group.rumPageloadEventsAdaptiveGroups` unconditionally, so the first Web Vitals section
 * pointed at it rendered "(none)" — against a query that was returning 70 and 60. An empty
 * section and a dataset with no rows are the same page, which is #485's lesson in a new
 * place: a rendering that cannot fail loudly has to be checked against the source. It was
 * caught by running the query by hand and finding data the page had not shown. */
function rumRows(group, map, key) {
  let coarse = 0;
  const rows = (group[key || 'rumPageloadEventsAdaptiveGroups'] || []).map((r) => {
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
    /* The chart goes ABOVE its own table, and the table keeps every exact figure. The
     * chart is shape; the numbers are the table's job — which is also why no bar carries a
     * printed value (`<title>` gives it on hover instead of eight labels competing). */
    const b = bucketDays([...byEtDay.values()].sort((a, c) => (a.date < c.date ? -1 : 1)), days);
    byDay = barChart(b.rows, { labelA: 'Pageloads', labelB: 'Visits', bucket: b.bucket })
      /* ⚠ SAY IT UNDER THE CHART, not only in the tiles at the top. A bar's height reads as
       * precision whatever a note three sections away says, and past the 7-day edge these
       * are rounded to the nearest 10 or 100 — at this site's volume one bar may be one
       * visit. This is the caveat the daily rollup exists to retire: rows captured inside
       * the window stay exact for ever, so in time these bars stop needing it. */
      + (g.coarse > 1
          ? '<p class="warn">These bars are rounded to the nearest ' + g.coarse + ' — the '
            + 'window reaches past the ' + RUM_FULL_RES_DAYS + '-day full-resolution edge. '
            + 'Read the shape, not the heights.</p>' : '')
      + (b.rows.some((r) => r.short)
          ? '<p class="muted">A bucket marked <b>*</b> is short — the window does not divide '
            + 'evenly into weeks, so its bar covers fewer days than the others.</p>' : '')
      + table(dayRows, [{ key: 'date', label: 'Date (ET)' }, ...RUM_COLS])
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
    /* HOW PEOPLE ARRIVE — external referrers and direct, which is the question this
     * section is for. It used to be one undivided "Where they came from" table, and that
     * conflated discovery with INTERNAL NAVIGATION: measured on the live account
     * 2026-09-02, `reactordynamics.com` was the referrer on 6 of 12 rows over 30 days,
     * and every one of them was one of our own pages linking to another. The honest
     * reading of that window is that there was NO external referrer at all — which is a
     * real and useful finding, and the old table hid it behind our own name at the top. */
    section('How people arrive', async () => {
      const rows = rumRows(await gql(apiToken, rumGroup('refererHost requestHost', 'count_DESC', 40, from, to)),
        (d) => ({ referer: d.refererHost || '(direct)',
                  kind: referrerKind(d.refererHost, d.requestHost) })).rows;
      const ext = rows.filter((r) => r.kind !== 'internal');
      return table(ext, [{ key: 'referer', label: 'Referrer' }, { key: 'kind', label: 'Kind' }, ...RUM_COLS])
        + (ext.every((r) => r.kind === 'direct')
            ? '<p class="muted">Every arrival in this window is direct or internal — nothing '
              + 'external referred anyone. That is a finding, not a gap in the data.</p>' : '');
    }),
    section('Internal navigation', async () => table(
      rumRows(await gql(apiToken, rumGroup('refererHost requestHost', 'count_DESC', 40, from, to)),
        (d) => ({ referer: d.refererHost || '', kind: referrerKind(d.refererHost, d.requestHost) }))
        .rows.filter((r) => r.kind === 'internal'),
      [{ key: 'referer', label: 'From' }, ...RUM_COLS])),
    section('Countries', async () => table(
      rumRows(await gql(apiToken, rumGroup('countryName', 'count_DESC', 15, from, to)),
        (d) => ({ country: d.countryName })).rows,
      [{ key: 'country', label: 'Country' }, ...RUM_COLS])),
    /* THE CORRELATION (#604, the owner's own question: how do different countries find
     * their way here, and on what days). One query — `rumGroup` interpolates its dimension
     * list, so this needed no new transport.
     *
     * ⚠ READ THE ± COLUMN BEFORE READING THE NUMBERS. Past the 7-day edge every figure is
     * rounded to the nearest 10, and at this site's volume (28 pageloads / 12 visits a
     * week, measured) a "10" may be one person. Cross-cutting three dimensions makes the
     * cells smaller and the rounding proportionally louder, which is exactly why the
     * daily rollup exists: rows captured inside the window are exact for ever. */
    section('Country × referrer × day', async () => {
      /* ⚠ GROUPED BY HOUR AND RE-BUCKETED, NOT BY THE API'S OWN `date` DIMENSION. `date` is
       * UTC, and this dashboard reads Eastern *(OWNER DIRECTIVE, 2026-08-13)* — so using it
       * would put four or five hours of every day in the wrong row while the column heading
       * still said the day. The first cut of this section did exactly that and
       * `run_dashboard_time.js` caught it on the label: that gate exists because relabelling
       * a bucket without re-grouping its query is the failure mode here, and it has now
       * caught the same mistake twice, in the two different views. Same re-bucketing as the
       * by-day table above, and the same rule for the interval — the day's ± is the COARSEST
       * of its hours, because one rounded hour makes the whole cell rounded. */
      const g = rumRows(await gql(apiToken,
        rumGroup('countryName refererHost requestHost datetimeHour', 'count_DESC',
                 Math.min(10000, days * 24 + 48), from, to)),
        (d) => ({ country: d.countryName, referer: d.refererHost || '(direct)',
                  kind: referrerKind(d.refererHost, d.requestHost), day: etDay(d.datetimeHour) }));
      const by = new Map();
      g.rows.forEach((r) => {
        // A separator that cannot occur inside any of the three parts. '|' can appear in a
        // path or a referrer; a control character cannot.
        const k = [r.day, r.country, r.referer].join('\u0001');
        const cur = by.get(k) || { day: r.day, country: r.country, referer: r.referer,
                                   kind: r.kind, pageloads: 0, visits: 0, si: 1 };
        cur.pageloads += r.pageloads; cur.visits += r.visits;
        if (r.si > cur.si) cur.si = r.si;
        by.set(k, cur);
      });
      const rows = [...by.values()]
        .sort((a, b) => (a.day === b.day ? b.pageloads - a.pageloads : (a.day < b.day ? 1 : -1)))
        .map((r) => Object.assign(r, { exact: r.si === 1 ? 'yes' : '±' + r.si }));
      return table(rows, [{ key: 'day', label: 'Date (ET)' }, { key: 'country', label: 'Country' },
        { key: 'referer', label: 'Referrer' }, { key: 'kind', label: 'Kind' }, ...RUM_COLS]);
    }),
    section('Devices', async () => table(
      rumRows(await gql(apiToken, rumGroup('deviceType', 'count_DESC', 10, from, to)),
        (d) => ({ device: d.deviceType })).rows,
      [{ key: 'device', label: 'Device' }, ...RUM_COLS])),
    /* FOUR DIMENSIONS THAT WERE COLLECTED AND NEVER SHOWN (#604). `bot` is the one worth
     * having on the page even when it is boring: measured 0 across the window, which means
     * the pageload and visit tiles are real people — an assumption the page was making
     * silently and can now keep checking. `navigationType` is the closest thing this data
     * has to a returning visitor (navigate vs reload vs back_forward). */
    section('Browser', async () => table(
      rumRows(await gql(apiToken, rumGroup('userAgentBrowser', 'count_DESC', 10, from, to)),
        (d) => ({ browser: d.userAgentBrowser })).rows,
      [{ key: 'browser', label: 'Browser' }, ...RUM_COLS])),
    section('Operating system', async () => table(
      rumRows(await gql(apiToken, rumGroup('userAgentOS', 'count_DESC', 10, from, to)),
        (d) => ({ os: d.userAgentOS })).rows,
      [{ key: 'os', label: 'OS' }, ...RUM_COLS])),
    section('How the page was reached', async () => table(
      rumRows(await gql(apiToken, rumGroup('navigationType', 'count_DESC', 10, from, to)),
        (d) => ({ nav: d.navigationType || '(unknown)' })).rows,
      [{ key: 'nav', label: 'Navigation' }, ...RUM_COLS])),
    section('Host, and bots', async () => table(
      rumRows(await gql(apiToken, rumGroup('requestHost bot', 'count_DESC', 10, from, to)),
        (d) => ({ host: d.requestHost, bot: d.bot ? 'BOT' : 'human' })).rows,
      [{ key: 'host', label: 'Host' }, { key: 'bot', label: 'Bot?' }, ...RUM_COLS])),
  ]);

  // ---- in-sim usage. sum(_sample_interval), never count() — see the header.
  /* ---- real-user performance. See vitalsGroup's header for why this is here. --------- */
  const vitals = await Promise.all([
    section('Slowest paint, by page (LCP)', async () => table(
      rumRows(await gql(apiToken,
        vitalsGroup('largestContentfulPaintPath', 'count_DESC', 10, from, to)),
        (d) => ({ page: d.largestContentfulPaintPath || '(none reported)' }),
        'rumWebVitalsEventsAdaptiveGroups').rows,
      [{ key: 'page', label: 'Page' }, { key: 'pageloads', label: 'Samples', num: true },
       { key: 'exact', label: '±' }])),
    /* INP is the one that would have shown #596 — a page that responds slowly to a click
     * is a page whose frame loop is saturated, which is what "4.7 fps" means from the
     * outside. The ELEMENT is the payload: it names the control that felt slow. */
    section('Slowest response to an interaction (INP)', async () => table(
      rumRows(await gql(apiToken,
        vitalsGroup('interactionToNextPaintPath interactionToNextPaintElement', 'count_DESC', 10, from, to)),
        (d) => ({ page: d.interactionToNextPaintPath || '(none reported)',
                  element: d.interactionToNextPaintElement || '' }),
        'rumWebVitalsEventsAdaptiveGroups').rows,
      [{ key: 'page', label: 'Page' }, { key: 'element', label: 'Element' },
       { key: 'pageloads', label: 'Samples', num: true }, { key: 'exact', label: '±' }])),
    section('Layout shift, by element (CLS)', async () => table(
      rumRows(await gql(apiToken,
        vitalsGroup('cumulativeLayoutShiftPath cumulativeLayoutShiftElement', 'count_DESC', 10, from, to)),
        (d) => ({ page: d.cumulativeLayoutShiftPath || '(none reported)',
                  element: d.cumulativeLayoutShiftElement || '' }),
        'rumWebVitalsEventsAdaptiveGroups').rows,
      [{ key: 'page', label: 'Page' }, { key: 'element', label: 'Element' },
       { key: 'pageloads', label: 'Samples', num: true }, { key: 'exact', label: '±' }])),
  ]);

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
    + '<h2>Performance <span class="muted">— what real visitors actually experienced</span></h2>'
    + '<p class="muted">Core Web Vitals from real page loads. #596 (the control room '
    + 'render-bound at 4.7 fps) was found by playing the sim and noticing; INP is the same '
    + 'measurement taken automatically, and the element column names what felt slow.</p>'
    + vitals.join('')
    + '<h2>In the simulator <span class="muted">— consented sessions only</span></h2>'
    + '<p class="muted">Session counts are a FLOOR: sampling drops whole rows, and no '
    + 'weighting recovers a session that vanished entirely.</p>'
    + usage.join('')
    + '</body></html>');
}
