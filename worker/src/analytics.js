/* Reactor Dynamics — the analytics half of the ops dashboard.
 *
 * #764 UNIT 2b REWRITE. Two owner requirements drove this: an ARBITRARY date-range window
 * instead of fixed 7/14/30 presets, and a TREND graph that shows growth or drop. Both are
 * only possible because Unit 2a (`stats.js`) gave this file a first-party reader for
 * `traffic_daily` — before that, every table here queried Cloudflare, which is exact for
 * 7 days and rounds to the nearest 10 after.
 *
 * THE SPLIT THIS FILE NOW MAKES (final round, all nine `stats.js` dimensions migrated):
 *   - The BY-DAY headline (tiles, chart, table, trailing mean, period-over-period) reads
 *     `stats.js` for every CLOSED Eastern day in the selected range, and Cloudflare RUM for
 *     TODAY only (the nightly rollup captures yesterday, so today has no first-party row).
 *     Today is drawn HOLLOW and labelled partial — see `barChart`'s header for why a
 *     half-finished day must never look like a finished one.
 *   - NINE breakdown sections — top pages, countries, devices, browser, OS, how the page was
 *     reached, bots, and the internal/external referrer split (via `stats.referrerBreakdown`,
 *     never a client-side recomputation of the kind — see `hybridReferrer`'s header) — read
 *     the SAME split: closed days from `stats.js`, today folded in live from Cloudflare, each
 *     printing its own source note and its own literal span so a section cannot silently
 *     drift onto a different window than the one the picker shows.
 *   - "Country × referrer × day" reads the SAME split as the nine breakdowns above it since
 *     the coordinator follow-up: `stats.dayCountryReferrer` is a dedicated four-column GROUP
 *     BY (day, country, referrer host, referrer kind), the same shape `referrerBreakdown`
 *     already used for two of those columns — `stats.groupBy` itself stays single-dimension
 *     only, but this section never needed it to be anything else.
 *   - Web Vitals is Cloudflare-only, fixed to a trailing 7 days, and says so — `traffic_daily`
 *     stores no percentiles, so it can never become a trend (#764 Unit 2b, section E).
 *
 * ⚠ IF YOU ADD AN ANALYTICS ENGINE SECTION HERE, you are re-mixing two opposite sampling
 * conventions. Put it on the usage page (`usage.js`), whose header carries the
 * `sum(_sample_interval)` rule:
 *
 *   Analytics Engine   `count()` is the RAW stored rows, an UNDERCOUNT.
 *                      The true number is `sum(_sample_interval)`.   (-> usage.js)
 *   Web Analytics RUM  `count` is ALREADY sample-adjusted. DO NOT multiply it.
 *
 * The transport lives in `cfapi.js`; the first-party reader is `stats.js` — both carry the
 * detailed traps (Eastern-day arithmetic, the non-additive `usage_daily.sessions` column,
 * why every day string is strictly parsed). This file does not repeat them.
 */

import { html, PAGE_HEAD, nav, table, errBlock, dayLabel, etDay, etDayStartMs,
         windowStartMs, RUM_FULL_RES_DAYS, barChart, bucketDays, lineChart, lineLabelStride,
         section, esc } from './render.js';
import { gql, ACCOUNT, SITE_TAG } from './cfapi.js';
import { referrerKind, RETAIN_DAYS } from './rollup.js';
import { parseDay, storeRange, dailyTotals, groupBy, referrerBreakdown, dayCountryReferrer,
         trailingMean, periodDelta, priorRange, dayRange, prevDay, nextDay } from './stats.js';

// ---------------------------------------------------------------- RUM helpers
const num = (v) => (v == null || v === '' ? 0 : Number(v));

/* `dims` always carries `bot`, even when the caller did not ask for it — the dashboard's
 * closed-day figures (`stats.js`) are `bot = 0` for every traffic figure they return, with
 * one deliberate exemption for `groupBy('bot', …)` (see that function's header). The live
 * "today" half of every RUM query here used to carry NO bot filter at all, so a window
 * reaching today silently mixed bot-included live rows into bot-excluded closed-day totals
 * — the page's own Bots section says it is the ONLY section including bot traffic, which
 * was false for the live half of every other one.
 *
 * The exclusion happens HERE-side, on the RETURNED rows (`rumRows`' `excludeBots` option),
 * rather than as a GraphQL filter term. This file's own Web Vitals introspection note is
 * the only confirmed schema check this account has done, and it was for the quantile
 * fields, not a `bot:` filter clause on this dataset — writing an unconfirmed filter key
 * would be exactly the guess `stats.js`'s header warns against. Deduped so a caller that
 * already names `bot` itself (the dedicated Bots section) does not select it twice. */
function rumGroup(dims, order, limit, from, to) {
  const fullDims = /\bbot\b/.test(dims) ? dims : (dims ? dims + ' bot' : 'bot');
  return `{ viewer { accounts(filter: {accountTag: "${ACCOUNT}"}) {
    rumPageloadEventsAdaptiveGroups(limit: ${limit},
      filter: {datetime_geq: "${from}", datetime_leq: "${to}", siteTag: "${SITE_TAG}"},
      orderBy: [${order}]) {
      count
      avg { sampleInterval }
      sum { visits }
      dimensions { ${fullDims} }
    } } } }`;
}

/* WEB VITALS — an entire dataset that was never queried (#604), and until this change never
 * queried for the number the section's own title claimed: `count` on this dataset is a
 * SAMPLE COUNT, not a p75. The `quantiles { …P75 }` block is what actually answers "how bad
 * was the worst-affecting-most-visits page", and it exists on this dataset — confirmed by
 * GraphQL introspection against the live account 2026-09-18 (`__type(name:
 * "AccountRumWebVitalsEventsAdaptiveGroups")`), not assumed:
 *
 *   quantiles { largestContentfulPaintP75 interactionToNextPaintP75 cumulativeLayoutShiftP75 }
 *
 * LCP and INP come back in MICROSECONDS (measured live: largestContentfulPaintP75 1316000 on
 * "/" — 1316 ms, a normal LCP), so both are divided by 1000 before they reach the page. CLS
 * is already the unitless score (measured 0.909 on "/ui/shell", which is POOR — matching the
 * render-bound history this section exists to catch) and is never scaled.
 */
function vitalsGroup(dims, order, limit, from, to, quantileField) {
  return `{ viewer { accounts(filter: {accountTag: "${ACCOUNT}"}) {
    rumWebVitalsEventsAdaptiveGroups(limit: ${limit},
      filter: {datetime_geq: "${from}", datetime_leq: "${to}", siteTag: "${SITE_TAG}"},
      orderBy: [${order}]) {
      count
      avg { sampleInterval }
      ${quantileField ? 'quantiles { ' + quantileField + ' }' : ''}
      dimensions { ${dims} }
    } } } }`;
}

// Returns {rows, coarse} — `coarse` is the largest sampleInterval seen, i.e. how rounded
// these numbers are. 1 means exact. `si` is the row's own interval as a NUMBER, needed here
// even though it is no longer rendered as a per-row column (#764 Unit 1 killed that) — the
// by-day view combines intervals across a bucket and reading "±10" back out of a display
// string would be reading a rendering as data.
// `opts.excludeBots` drops bot rows before summing — every call site sets it true except
// the dedicated Bots section, which needs the bot flag intact to split on. `rumGroup`
// always requests the `bot` dimension so there is something here to filter on.
function rumRows(group, map, key, opts) {
  let coarse = 0;
  const excludeBots = !!(opts && opts.excludeBots);
  const raw = group[key || 'rumPageloadEventsAdaptiveGroups'] || [];
  const filtered = excludeBots ? raw.filter((r) => !((r.dimensions || {}).bot)) : raw;
  const rows = filtered.map((r) => {
    const si = num((r.avg || {}).sampleInterval) || 1;
    if (si > coarse) coarse = si;
    return Object.assign(map(r.dimensions || {}), {
      pageloads: num(r.count),
      visits: num((r.sum || {}).visits),
      si,
    });
  });
  return { rows, coarse: coarse || 1 };
}

// Same shape, for the Web Vitals dataset: a sample count and a p75, never a raw average —
// an average is dragged by the tail exactly where a Core Web Vital cares about the tail.
function vitalsRows(group, map, quantileField, key) {
  return (group[key || 'rumWebVitalsEventsAdaptiveGroups'] || []).map((r) => {
    const q = (r.quantiles || {})[quantileField];
    return Object.assign(map(r.dimensions || {}), {
      samples: num(r.count),
      p75: q == null ? null : Number(q),
    });
  });
}

/* D1 "LANDING VISITS", NOT "VISITS" (#764). A Web Analytics visit is attributed to the
 * page a session STARTED on, so an internal hop from the homepage into the control room
 * is a pageload with ZERO visits. Labelled "Visits", that produced a false reading the
 * owner acted on — "almost nobody enters the sim", which was really "almost nobody LANDS
 * on the shell". The column is the same number; the label now says what it counts. */
const RUM_COLS = [
  { key: 'pageloads', label: 'Pageloads', num: true },
  { key: 'visits', label: 'Landing visits', num: true },
];

/* ONE LINE PER VIEW, saying where the figures came from and how exact they are. Three forms:
 * the two Cloudflare ones (unchanged), and the new first-party one for the by-day headline,
 * which since #764 Unit 2b is genuinely produced (closed Eastern days come from
 * `traffic_daily`, which is exact for ever once a day is captured inside the window). */
function sourceNote(coarse) {
  return '<p class="muted">Source: ' + (coarse > 1
    ? '<b>Cloudflare coarse</b> — rounded to the nearest ' + coarse
    : '<b>Cloudflare exact</b> — 7 days or fewer') + '.</p>';
}

function sourceNoteFirstParty(anyCoarse, anyMissing) {
  return '<p class="muted">Source: <b>first-party exact</b> for every closed day'
    + (anyCoarse ? ' (a day marked <b>coarse</b> below was captured late and is Cloudflare-'
        + 'rounded, not first-party)' : '')
    + (anyMissing ? ', <b>no data captured</b> marks a day the nightly job never ran for'
        + ' (not the same as a real zero)' : '')
    + '; <b>today</b> is Cloudflare, live, and partial.</p>';
}

/* THREE GRAINS, THREE NAMES, PRINTED WHERE THE NUMBERS ARE. Every confusion this page has
 * caused was someone reading one grain's number as another's. */
const GLOSSARY = '<div class="muted" style="margin:0 0 16px">'
  + '<div><b>Landing visit</b> — the page a session started on</div>'
  + '<div><b>Pageload</b> — any load, including moving around inside the app</div>'
  + '<div><b>In-sim session</b> — the Usage/Sessions grain (sampled, a floor)</div></div>';

// `n` Eastern days before `day` — used to build both the default window and the preset
// buttons. Small `n` always (<=90 in this file), so a day-by-day walk costs nothing; it is
// the same walk `stats.dayRange` already does internally.
function stepBack(day, n) {
  let d = day;
  for (let i = 0; i < n; i++) d = prevDay(d);
  return d;
}

/* Resolve the requested window into an inclusive Eastern [from, to], or an error string.
 * Three sources, checked in order: an explicit ?from=&to= (the new, arbitrary picker), a
 * legacy ?days=N (translated so a bookmark from before this change keeps resolving instead
 * of 404ing or silently drawing the wrong span), or the default — the last 7 days.
 *
 * NEITHER an <input type="date"> NOR a `days` query param is trusted as typed: both go
 * through `stats.parseDay` / a numeric clamp before touching anything, because the result
 * becomes half of a SQL range one call later. */
function resolveWindow(url, today) {
  const qFrom = url.searchParams.get('from');
  const qTo = url.searchParams.get('to');
  const qDays = url.searchParams.get('days');
  let from, to;
  if (qFrom != null || qTo != null) {
    from = parseDay(qFrom);
    to = parseDay(qTo);
    if (!from || !to) return { error: 'from/to must both be dates in the form YYYY-MM-DD.' };
    if (from > to) return { error: 'the range ends (' + to + ') before it begins (' + from + ').' };
  } else if (qDays != null) {
    const n = Math.max(1, Math.min(90, Math.floor(Number(qDays)) || 7));
    to = today;
    from = stepBack(to, n - 1);
  } else {
    to = today;
    from = stepBack(to, 6);
  }
  // Nobody can select the future; a `to` past today is silently pulled back rather than
  // rejected, since it usually means "today" landed here from a clock a few minutes fast.
  if (to > today) to = today;
  try { dayRange(from, to); }         // throws on an absurd span; the reversed case is caught above
  catch (e) { return { error: e.message }; }
  return { from, to };
}

// ---------------------------------------------------------------- the page
export async function analyticsPage(env, url) {
  const apiToken = env.CF_ANALYTICS_TOKEN;
  const db = env.STATS;
  const nowMs = Date.now();
  const today = etDay(nowMs);

  const head = '<!doctype html><html><head>' + PAGE_HEAD
    + '<title>Analytics — Reactor Dynamics</title></head><body>' + nav('analytics');

  if (!db) {
    return html(head + '<h1>Analytics</h1>'
      + '<p class="warn">No <span class="mono">STATS</span> D1 binding is configured on this '
      + 'Worker, so the first-party daily store cannot be read. The nightly rollup writes it; '
      + 'nothing here can show more than a live Cloudflare snapshot of today without it.</p>'
      + '</body></html>');
  }
  if (!apiToken) {
    return html(head
      + '<h1>Analytics</h1>'
      + '<p class="warn">No <span class="mono">CF_ANALYTICS_TOKEN</span> secret is set on this Worker, '
      + 'so today’s live figures and Web Vitals cannot be read (closed-day history would still '
      + 'come from the first-party store).</p>'
      + '<pre>cd worker\nwrangler secret put CF_ANALYTICS_TOKEN   # Account Analytics / Read\nwrangler deploy</pre>'
      + '</body></html>');
  }

  const w = resolveWindow(url, today);
  const sr = await storeRange(db);   // { first, last } | null — clamps the picker

  const pickerMin = sr ? sr.first : null;
  /* "ALL" (owner request, 2026-09-20) opens on the first day the store has, reusing
   * `storeRange`'s own `first` rather than re-querying. Clamped to the retention window so
   * a store someday older than the 800-day span `stats.dayRange` accepts could never hand
   * the picker a window the page then rejects — today's first recorded day (2026-08-25) is
   * nowhere near that ceiling, but the clamp is what keeps that true rather than assuming
   * it forever. */
  const allFloor = sr ? stepBack(today, RETAIN_DAYS - 1) : null;
  const allFrom = sr ? (sr.first < allFloor ? allFloor : sr.first) : null;
  const picker = (fromV, toV) => '<form method="get" style="margin:0 0 8px">'
    + '<input type="hidden" name="view" value="analytics">'
    + '<label>From <input type="date" name="from" value="' + esc(fromV) + '"'
      + (pickerMin ? ' min="' + esc(pickerMin) + '"' : '') + ' max="' + esc(today) + '"></label> '
    + '<label>To <input type="date" name="to" value="' + esc(toV) + '"'
      + (pickerMin ? ' min="' + esc(pickerMin) + '"' : '') + ' max="' + esc(today) + '"></label> '
    + '<button type="submit">Go</button> '
    + '<span class="muted">Presets:</span> '
    /* ANCHORS, NOT SUBMIT BUTTONS -- see `a.pbtn` in render.js for the measurement. A GET
     * form throws away its action URL's query string, so the `formaction` these used to
     * carry never reached the server and every preset re-submitted the date inputs as they
     * stood: the 7d window redrew itself under a 14d label. An <a> navigates to the href
     * verbatim. `&amp;` because this is HTML, not a URL. */
    + [7, 14, 30].map((n) => '<a class="pbtn" href="?view=analytics&amp;from='
        + stepBack(today, n - 1) + '&amp;to=' + today + '">' + n + 'd</a>').join(' ')
    + (sr ? ' <a class="pbtn" href="?view=analytics&amp;from=' + allFrom
        + '&amp;to=' + today + '">All</a>' : '')
    + '</form>'
    + '<p class="muted">' + (sr
      ? 'Recorded history begins <b>' + esc(sr.first) + '</b>.'
      : 'No first-party history recorded yet — every figure below is Cloudflare-only.') + '</p>';

  if (w.error) {
    return html(head + '<h1>Analytics</h1>' + picker(today, today)
      + errBlock(w.error) + '</body></html>');
  }

  let { from, to } = w;
  // The WHOLE selection predates recorded history: clamping `from` alone here would leave
  // `from > to`, which every day-arithmetic call downstream treats as a reversed range and
  // throws on — and even if it did not throw, showing a window that opens AFTER it closes
  // is worse than saying plainly there is nothing to show yet.
  if (sr && to < sr.first) {
    return html(head + '<h1>Analytics</h1>' + picker(from, to)
      + '<p class="warn">The selected range (' + esc(from) + ' to ' + esc(to) + ') ends '
      + 'before the recorded history begins (' + esc(sr.first) + ') — there is nothing to '
      + 'show yet.</p>' + '</body></html>');
  }
  let clampNote = '';
  if (sr && from < sr.first) {
    clampNote = '<p class="warn">The picked start (' + esc(from) + ') is before the recorded '
      + 'history begins (' + esc(sr.first) + '); the window opens there instead — an earlier '
      + 'start would return zero rows, which reads as zero traffic rather than as no data.</p>';
    from = sr.first;
  }

  const includesToday = to === today;
  const closedTo = includesToday ? prevDay(today) : to;
  // Six extra days of lookback so the trailing mean is FULL on day one of the display range,
  // not null for the first six rows of every window (`stats.trailingMean`'s own rule).
  const meanFrom = stepBack(from, 6);
  const closedRows = meanFrom <= closedTo ? await dailyTotals(db, meanFrom, closedTo) : [];
  const closedByDay = new Map(closedRows.map((r) => [r.day, r]));
  const meanSeries = trailingMean(closedRows, 7, 'visits');
  const meanByDay = new Map(meanSeries.map((m) => [m.day, m.mean]));

  const priorR = priorRange(from, to);
  const prevDays = await dailyTotals(db, priorR.from, priorR.to);   // same length as [from,to]

  // ---- today, live (only when the window reaches it) ------------------------------------
  let liveToday = { pageloads: 0, visits: 0, coarse: false };
  let liveErr = null;
  if (includesToday) {
    try {
      const g = rumRows(await gql(apiToken, rumGroup('datetimeHour', 'datetimeHour_ASC', 26,
        new Date(etDayStartMs(today)).toISOString(), new Date(nowMs).toISOString())),
        (d) => ({}), undefined, { excludeBots: true });
      liveToday = {
        pageloads: g.rows.reduce((s, r) => s + r.pageloads, 0),
        visits: g.rows.reduce((s, r) => s + r.visits, 0),
        coarse: g.coarse > 1,
      };
    } catch (e) { liveErr = e.message; }
  }

  // ---- the display rows: one per Eastern day in [from, to], today live and hollow -------
  const allDays = dayRange(from, to);
  const rows = allDays.map((day, i) => {
    const ghostSrc = prevDays[i];
    const ghost = (ghostSrc && !ghostSrc.missing && !ghostSrc.coarse) ? ghostSrc.visits : null;
    if (day === today) {
      return { day, pageloads: liveToday.pageloads, visits: liveToday.visits,
               coarse: liveToday.coarse, missing: false, partial: true, mean: null, ghost };
    }
    const c = closedByDay.get(day) || { pageloads: 0, visits: 0, coarse: false, missing: true };
    return { day, pageloads: c.pageloads, visits: c.visits, coarse: c.coarse, missing: c.missing,
             partial: false, mean: meanByDay.has(day) ? meanByDay.get(day) : null, ghost };
  });

  const curTotalVisits = rows.reduce((s, r) => s + r.visits, 0);
  const curTotalPageloads = rows.reduce((s, r) => s + r.pageloads, 0);
  const delta = periodDelta(curTotalVisits, prevDays, rows,
    { storeFirst: sr && sr.first, metric: 'visits' });

  const anyCoarse = rows.some((r) => r.coarse);
  const anyMissing = rows.some((r) => r.missing);

  const tiles = '<div class="tiles">'
    + '<div class="tile"><div class="v">' + curTotalPageloads + '</div><div class="k">Pageloads</div></div>'
    + '<div class="tile"><div class="v">' + curTotalVisits + '</div><div class="k">Landing visits</div></div>'
    + '<div class="tile"><div class="v">' + allDays.length + '</div><div class="k">Days</div></div>'
    + '</div>';

  const deltaLine = '<p>' + (delta.ok
    ? (delta.direction === 'flat'
        ? 'Flat versus the prior ' + allDays.length + ' days'
        : '<b>' + delta.direction + ' ' + Math.abs(delta.pct) + '%</b> on the prior '
          + allDays.length + ' days (' + esc(priorR.from) + ' to ' + esc(priorR.to) + ', '
          + delta.prevTotal + ' landing visits then vs ' + curTotalVisits + ' now)')
    : '<span class="muted">No comparable prior period — ' + esc(delta.reason) + '.</span>')
    + '</p>';

  /* CHART SHAPE (2026-09-20, owner: "for the 30 day and all can you make them a line graph
   * and show data from every day not the weekly average"). 14 days or fewer draws the
   * unchanged bar chart; anything longer draws `lineChart` — one point per day, no
   * bucketing at any length — instead of folding into weekly/monthly bars. `rows.length`,
   * not the picked `days`/`from`/`to`, decides: it is the actual number of days on screen,
   * which is what a hand-picked range or a store-clamped window can shorten without the
   * caller's own day count changing. */
  const isLongWindow = rows.length > 14;
  const chartOpts = { labelA: 'Pageloads', labelB: 'Landing visits', labelMean: '7d mean', labelGhost: 'prior period' };
  const chart = isLongWindow ? lineChart(rows, chartOpts) : barChart(bucketDays(rows).rows, { ...chartOpts, bucket: 'day' });
  const legend = !chart ? '' : isLongWindow
    ? '<p class="muted">Hollow point = today, live and partial · faded point = Cloudflare-'
      + 'coarse (±10) · a break in the line, marked with a dashed tick at the baseline = no '
      + 'data captured that day (never drawn as a drop to zero) · solid line = 7-day '
      + 'trailing mean of landing visits · dashed muted line = the prior, equal-length '
      + 'period · dates are labelled every ' + lineLabelStride(rows.length) + ' day(s).</p>'
    : '<p class="muted">Hollow bar = today, live and partial · faded bar = Cloudflare-coarse '
      + '(±10) · dashed tick at the baseline = no data captured that day · solid line = '
      + '7-day trailing mean of landing visits · dashed muted line = the prior, '
      + 'equal-length period.</p>';

  const dayTable = table(rows.map((r) => ({
    dateLabel: dayLabel(r.day, r.partial ? r.day : null),
    pageloads: r.pageloads,
    visits: r.visits,
    status: r.missing ? 'no data captured' : r.coarse ? 'coarse (±10)' : r.partial ? 'today, live' : '',
  })), [{ key: 'dateLabel', label: 'Date (ET)' }, ...RUM_COLS, { key: 'status', label: 'Note' }]);

  /* ---- the breakdown sections, MIGRATED (coordinator follow-up, item 1): closed days from
   * the first-party store, today folded in live — the SAME split as the by-day headline
   * above, and deliberately reusing `from`/`closedTo`/`today` rather than re-deriving them,
   * so a section cannot quietly drift onto a different window from the one the picker shows
   * (coordinator's item 2). `stats.groupBy` supports exactly seven dimensions; five map
   * straight onto a section (path/country/device/browser/os) and two more (referrer_host,
   * referrer_kind) combine into the two referrer views. Three sections below have NO first-
   * party equivalent — `nav_type` and `bot` are stored in `traffic_daily` but are not in
   * `stats.js`'s exposed `DIMENSIONS` allowlist, and the three-way country/referrer/day cut
   * has no single-dimension `groupBy` at all — so they stay on Cloudflare, each saying so
   * itself rather than inheriting a page-level claim.
   *
   * Before this, a 30-day pick drew an EXACT chart directly above tables still rounded to
   * the nearest 10 (Cloudflare's coarse tier past 7 days) — the two halves disagreed and
   * nothing on screen said why. */
  const todayFromIso = new Date(etDayStartMs(today)).toISOString();
  const todayToIso = new Date(nowMs).toISOString();

  /* One D1 dimension (`stats.groupBy`), merged with today's live Cloudflare slice for the
   * matching RUM field. Per-KEY coarseness survives the merge unchanged — `stats.groupBy`'s
   * own definition: a key whose only appearance in the window is a rounded day is a rounded
   * ROW, not a rounded table, so one noisy country does not paint the whole section coarse. */
  async function hybridBreakdown(dim, cfDims, cfKey, limit) {
    const closed = from <= closedTo ? await groupBy(db, dim, from, closedTo, Math.max(limit, 200)) : [];
    const by = new Map(closed.map((r) => [r.key, { key: r.key, pageloads: r.pageloads, visits: r.visits, coarse: r.coarse }]));
    if (includesToday) {
      // `dim !== 'bot'` is the exemption: grouping by bot status and excluding bots would
      // return exactly one row, always Human.
      const g = rumRows(await gql(apiToken, rumGroup(cfDims, 'count_DESC', Math.max(limit, 200), todayFromIso, todayToIso)),
        (d) => ({ key: cfKey(d) }), undefined, { excludeBots: dim !== 'bot' });
      // "Today" sits inside Cloudflare's 7-day full-resolution edge in practice, but that is
      // measured elsewhere, never assumed here — a coarse live slice still marks its rows.
      // The per-row sample interval, not the batch-wide `g.coarse`, decides which MERGED
      // key gets marked — a rounded row must not taint every other row in the same batch.
      g.rows.forEach((r) => {
        const cur = by.get(r.key) || { key: r.key, pageloads: 0, visits: 0, coarse: false };
        cur.pageloads += r.pageloads; cur.visits += r.visits;
        if (r.si > 1) cur.coarse = true;
        by.set(r.key, cur);
      });
    }
    const rows = [...by.values()].sort((a, b2) => b2.pageloads - a.pageloads).slice(0, limit);
    return { rows, anyCoarse: rows.some((r) => r.coarse) };
  }

  /* THE SPAN, PRINTED LITERALLY, on every migrated section — the coordinator's item 2. If a
   * future edit makes one section derive its own window instead of reusing `from`/`closedTo`,
   * the mismatch is readable on the page, not just theoretically possible. */
  function hybridSourceNote(anyCoarse) {
    return '<p class="muted">Source: <b>first-party exact</b> (' + esc(from) + ' to ' + esc(closedTo) + ')'
      + (anyCoarse ? ', a row marked <b>coarse</b> below was captured late and is Cloudflare-rounded' : '')
      + (includesToday ? ', plus <b>today</b> (' + esc(today) + ') live from Cloudflare' : '') + '.</p>';
  }
  function breakdownTable(rows, keyLabel, emptyLabel) {
    return table(rows.map((r) => ({
      key: r.key === '' || r.key == null ? (emptyLabel || '(unknown)') : r.key,
      pageloads: r.pageloads, visits: r.visits, note: r.coarse ? 'coarse (±10)' : '',
    })), [{ key: 'key', label: keyLabel }, ...RUM_COLS, { key: 'note', label: 'Note' }]);
  }

  const migrated = await Promise.all([
    section('Top pages', async () => {
      const h = await hybridBreakdown('path', 'requestPath', (d) => d.requestPath || '', 15);
      return hybridSourceNote(h.anyCoarse) + breakdownTable(h.rows, 'Path');
    }),
    section('Countries', async () => {
      const h = await hybridBreakdown('country', 'countryName', (d) => d.countryName || '', 15);
      return hybridSourceNote(h.anyCoarse) + breakdownTable(h.rows, 'Country');
    }),
    section('Devices', async () => {
      const h = await hybridBreakdown('device', 'deviceType', (d) => d.deviceType || '', 10);
      return hybridSourceNote(h.anyCoarse) + breakdownTable(h.rows, 'Device');
    }),
    section('Browser', async () => {
      const h = await hybridBreakdown('browser', 'userAgentBrowser', (d) => d.userAgentBrowser || '', 10);
      return hybridSourceNote(h.anyCoarse) + breakdownTable(h.rows, 'Browser');
    }),
    section('Operating system', async () => {
      const h = await hybridBreakdown('os', 'userAgentOS', (d) => d.userAgentOS || '', 10);
      return hybridSourceNote(h.anyCoarse) + breakdownTable(h.rows, 'OS');
    }),
    // `nav_type` and `bot` were added to `stats.js`'s allowlist in the follow-up round —
    // the last two sections that had no first-party equivalent, now migrated too.
    section('How the page was reached', async () => {
      const h = await hybridBreakdown('nav_type', 'navigationType', (d) => d.navigationType || '', 10);
      return hybridSourceNote(h.anyCoarse) + breakdownTable(h.rows, 'Navigation');
    }),
    /* BOTS — the one section on the page that INCLUDES bot traffic. `stats.groupBy('bot', …)`
     * cannot filter bots out and group by that same column (it would return exactly one
     * row), so it does neither — every OTHER section here is bots-excluded and this one is
     * not, and its totals are not comparable with any other section's. Said on the page
     * itself, not just in this comment (coordinator item 3). The key is the INTEGER 0 or 1;
     * `stats.js` deliberately does not name the rows, so the label is written here. */
    section('Bots', async () => {
      const h = await hybridBreakdown('bot', 'bot', (d) => (d.bot ? 1 : 0), 10);
      return hybridSourceNote(h.anyCoarse)
        + '<p class="warn">Unlike every other section on this page, THIS ONE INCLUDES BOT '
        + 'TRAFFIC — grouping by bot status cannot also filter it out. Do not compare these '
        + 'totals against Top pages, Countries, or any other section above.</p>'
        + table(h.rows.map((r) => ({
            who: r.key === 1 ? 'Bot' : 'Human', pageloads: r.pageloads, visits: r.visits,
            note: r.coarse ? 'coarse (±10)' : '',
          })), [{ key: 'who', label: 'Traffic' }, ...RUM_COLS, { key: 'note', label: 'Note' }]);
    }),
  ]);

  /* THE REFERRER SPLIT — `stats.referrerBreakdown` reads host AND kind together for closed
   * days, so the kind is the STORED value (computed at rollup time with the real
   * requestHost), never recomputed from the host alone. Recomputing it was tried in the
   * prior round and retired: `referrerKind(host, null)` loses the exact-host-match rule and
   * classifies a host referring to itself under a name neither suffix rule covers as
   * EXTERNAL — the #604 finding inverted, own navigation read as discovery. Fetched ONCE and
   * classified into the two views below, rather than two independent round trips. */
  async function hybridReferrer(limit) {
    const closed = from <= closedTo ? await referrerBreakdown(db, from, closedTo, 1000) : [];
    const by = new Map(closed.map((r) => [r.host, { host: r.host, kind: r.kind,
      pageloads: r.pageloads, visits: r.visits, coarse: r.coarse }]));
    if (includesToday) {
      // TODAY has no stored kind yet — it is classified here, but WITH the real requestHost
      // this live row actually carries, which is the accurate half of `referrerKind`, not
      // the lossy host-alone call this section used to make on already-aggregated data.
      const g = rumRows(await gql(apiToken, rumGroup('refererHost requestHost', 'count_DESC',
        1000, todayFromIso, todayToIso)),
        (d) => ({ host: d.refererHost || '', kind: referrerKind(d.refererHost, d.requestHost) }),
        undefined, { excludeBots: true });
      g.rows.forEach((r) => {
        // A host the store already has keeps its STORED kind; only a host today introduces
        // for the first time falls back to today's own (still fully-informed) classification.
        const cur = by.get(r.host) || { host: r.host, kind: r.kind, pageloads: 0, visits: 0, coarse: false };
        cur.pageloads += r.pageloads; cur.visits += r.visits;
        // Per-row sample interval, not the batch-wide `g.coarse` — one rounded host must
        // not mark every other host in the same live batch.
        if (r.si > 1) cur.coarse = true;
        by.set(r.host, cur);
      });
    }
    const rows = [...by.values()].sort((a, b2) => b2.pageloads - a.pageloads).slice(0, limit);
    return { rows, anyCoarse: rows.some((r) => r.coarse) };
  }
  // The fetch is made ONCE here, outside `section()`, and shared by the two sections below
  // — it used to be `await`ed at the top level of `analyticsPage`, outside every section's
  // try/catch, so one bad GraphQL call 500'd the whole page instead of degrading just the
  // two sections that read it. Caught here and turned into a stored error so each section
  // below can still render its own errBlock through `section()`, same as every other
  // breakdown on this page.
  let referrerRows = [];
  let referrerErr = null;
  try {
    referrerRows = (await hybridReferrer(1000)).rows;
  } catch (e) { referrerErr = e.message; }
  const referrerTable = (rows, label) => table(rows.map((r) => ({
    referer: r.host || '(direct)', kind: r.kind, pageloads: r.pageloads, visits: r.visits,
    note: r.coarse ? 'coarse (±10)' : '',
  })), [{ key: 'referer', label: label }, { key: 'kind', label: 'Kind' }, ...RUM_COLS,
        { key: 'note', label: 'Note' }]);

  const referrerSections = await Promise.all([
    /* HOW PEOPLE ARRIVE — external referrers and direct, which is the question this
     * section is for; it excludes our own pages linking to each other (measured 2026-09-02:
     * 6 of 12 rows over 30 days were `reactordynamics.com` referring itself). */
    section('How people arrive', async () => {
      if (referrerErr) throw new Error(referrerErr);
      const ext = referrerRows.filter((r) => r.kind !== 'internal').slice(0, 40);
      // `ext.length > 0 &&` guards a VACUOUS TRUTH: `[].every(...)` is true on an empty
      // array, so a day the nightly rollup never captured used to print "nothing external
      // referred anyone" as a finding, when there was no data to draw that conclusion from
      // at all. The sentence may only appear when there is positive evidence for it.
      return hybridSourceNote(ext.some((r) => r.coarse)) + referrerTable(ext, 'Referrer')
        + (ext.length > 0 && ext.every((r) => r.kind === 'direct')
            ? '<p class="muted">Every arrival in this window is direct or internal — nothing '
              + 'external referred anyone. That is a finding, not a gap in the data.</p>' : '');
    }),
    section('Internal navigation', async () => {
      if (referrerErr) throw new Error(referrerErr);
      const inter = referrerRows.filter((r) => r.kind === 'internal').slice(0, 40);
      return hybridSourceNote(inter.some((r) => r.coarse)) + referrerTable(inter, 'From');
    }),
  ]);

  /* ---- "Country × referrer × day" — MIGRATED (coordinator follow-up on #791). It used to
   * stay Cloudflare-only for the whole picked window because `stats.groupBy` is
   * single-dimension only; `stats.dayCountryReferrer` is a dedicated four-column GROUP BY
   * instead, so closed days now come from the store exactly like every other breakdown, and
   * only TODAY is still fetched live. Reuses `from`/`closedTo`/`today` for the same reason
   * `hybridBreakdown` does — a section deriving its own span is how one silently drifts onto
   * a different window than the picker shows. */
  async function hybridCountryReferrerDay(limit) {
    const closed = from <= closedTo ? await dayCountryReferrer(db, from, closedTo, Math.max(limit, 500)) : [];
    const by = new Map();
    closed.forEach((r) => {
      const k = [r.day, r.country, r.host].join('');
      by.set(k, { day: r.day, country: r.country, host: r.host, kind: r.kind,
                  pageloads: r.pageloads, visits: r.visits, coarse: r.coarse,
                  si: r.si || 1 });
    });
    // Only TODAY is ever read live here — a window that never reaches today must issue NO
    // Cloudflare query for this dimension combination at all (closed days come from D1 alone).
    const fetchCountryDayLive = includesToday;
    if (fetchCountryDayLive) {
      const g = rumRows(await gql(apiToken,
        rumGroup('countryName refererHost requestHost', 'count_DESC', Math.max(limit, 500),
                 todayFromIso, todayToIso)),
        (d) => ({ country: d.countryName || '', host: d.refererHost || '',
                  kind: referrerKind(d.refererHost, d.requestHost) }),
        undefined, { excludeBots: true });
      g.rows.forEach((r) => {
        const k = [today, r.country, r.host].join('');
        const cur = by.get(k) || { day: today, country: r.country, host: r.host, kind: r.kind,
                                    pageloads: 0, visits: 0, coarse: false, si: 1 };
        cur.pageloads += r.pageloads; cur.visits += r.visits;
        // Per-row sample interval, not a batch-wide flag — one rounded key must not taint
        // every other key merged from the same live batch (the same trap `hybridBreakdown`
        // and `hybridReferrer` already guard against).
        if (r.si > 1) { cur.coarse = true; cur.si = Math.max(cur.si || 1, r.si); }
        by.set(k, cur);
      });
    }
    const rows = [...by.values()]
      .sort((a, b2) => (a.day === b2.day ? b2.pageloads - a.pageloads : (a.day < b2.day ? 1 : -1)))
      .slice(0, limit);
    return { rows, anyCoarse: rows.some((r) => r.coarse) };
  }
  /* Same span-naming rule as `hybridSourceNote`, plus the one thing this table cannot say by
   * itself: a day this table has NO ROWS for could be a real zero or a day the nightly job
   * never captured, and those must not read the same. `closedByDay` already carries that flag
   * per day (built for the by-day headline above) — reused here rather than re-querying. */
  function countryReferrerDayNote(anyCoarse, missingDays, worstSi) {
    return '<p class="muted">Source: <b>first-party exact</b> (' + esc(from) + ' to ' + esc(closedTo) + ')'
      + (anyCoarse ? ', a row marked <b>coarse</b> below was captured late and is'
          + ' Cloudflare-rounded to the nearest ' + (worstSi || 10) : '')
      + (includesToday ? ', plus <b>today</b> (' + esc(today) + ') live from Cloudflare' : '') + '.</p>'
      + (missingDays.length ? '<p class="warn"><b>No data captured</b> for ' + missingDays.map(esc).join(', ')
          + ' — absent from the table below, which is NOT the same as a zero.</p>' : '');
  }
  const countryReferrerDaySection = await Promise.all([
    section('Country × referrer × day', async () => {
      const h = await hybridCountryReferrerDay(500);
      const missingDays = allDays.filter((d) => d <= closedTo && (closedByDay.get(d) || { missing: true }).missing);
      // The WORST interval in the window, so the note cannot understate what a row shows.
      const worstSi = h.rows.reduce((m, r) => Math.max(m, r.coarse ? (r.si || 1) : 1), 1);
      return countryReferrerDayNote(h.anyCoarse, missingDays, worstSi) + table(h.rows.map((r) => ({
        day: r.day, country: r.country === '' ? '(unknown)' : r.country,
        referer: r.host || '(direct)', kind: r.kind, pageloads: r.pageloads, visits: r.visits,
        /* THE INTERVAL IT ACTUALLY GOT, not a hard-coded 10 -- see stats.dayCountryReferrer.
         * The five other sites on this page still print the literal; they are the same
         * latent defect and are not fixed here. */
        note: r.coarse ? 'coarse (±' + r.si + ')' : '',
      })), [{ key: 'day', label: 'Date (ET)' }, { key: 'country', label: 'Country' },
        { key: 'referer', label: 'Referrer' }, { key: 'kind', label: 'Kind' }, ...RUM_COLS,
        { key: 'note', label: 'Note' }]);
    }),
  ]);

  /* ---- Web Vitals — Cloudflare-only, fixed 7 days, never a trend (section E). The picker
   * above never touches this: `traffic_daily` stores no percentiles, so a longer or older
   * window would not make these more historical, only more likely to be a stale cache of
   * "the last 7 days" quietly relabelled. `windowStartMs` is the reason this stays exact —
   * it is the helper this file used to compute EVERY window with, kept here for the one
   * window that still needs its coarse-tier-edge clamp (see render.js's header). */
  const vFrom = new Date(windowStartMs(nowMs, RUM_FULL_RES_DAYS)).toISOString();
  const vTo = new Date(nowMs).toISOString();
  const vitals = await Promise.all([
    section('Slowest paint, by page — Largest Contentful Paint (LCP)', async () => {
      const rows2 = vitalsRows(await gql(apiToken,
        vitalsGroup('largestContentfulPaintPath', 'count_DESC', 10, vFrom, vTo, 'largestContentfulPaintP75')),
        (d) => ({ page: d.largestContentfulPaintPath || '(none reported)' }),
        'largestContentfulPaintP75').filter((r) => r.p75 != null)
        .map((r) => ({ page: r.page, p75: Math.round(r.p75 / 1000), samples: r.samples }));
      if (!rows2.length) return '<p class="muted">No LCP p75 samples in the last 7 days.</p>';
      return table(rows2, [{ key: 'page', label: 'Page' }, { key: 'p75', label: 'p75 (ms)', num: true },
        { key: 'samples', label: 'Samples', num: true }]);
    }),
    /* INP is the one that would have shown #596 — a page that responds slowly to a click
     * is a page whose frame loop is saturated, which is what "4.7 fps" means from the
     * outside. The ELEMENT is the payload: it names the control that felt slow. */
    section('Slowest response to an interaction — Interaction to Next Paint (INP)', async () => {
      const rows2 = vitalsRows(await gql(apiToken,
        vitalsGroup('interactionToNextPaintPath interactionToNextPaintElement', 'count_DESC', 10, vFrom, vTo,
          'interactionToNextPaintP75')),
        (d) => ({ page: d.interactionToNextPaintPath || '(none reported)',
                  element: d.interactionToNextPaintElement || '' }),
        'interactionToNextPaintP75').filter((r) => r.p75 != null)
        .map((r) => ({ page: r.page, element: r.element, p75: Math.round(r.p75 / 1000), samples: r.samples }));
      if (!rows2.length) return '<p class="muted">No INP p75 samples in the last 7 days.</p>';
      return table(rows2, [{ key: 'page', label: 'Page' }, { key: 'element', label: 'Element' },
        { key: 'p75', label: 'p75 (ms)', num: true }, { key: 'samples', label: 'Samples', num: true }]);
    }),
    section('Layout shift, by element — Cumulative Layout Shift (CLS)', async () => {
      const rows2 = vitalsRows(await gql(apiToken,
        vitalsGroup('cumulativeLayoutShiftPath cumulativeLayoutShiftElement', 'count_DESC', 10, vFrom, vTo,
          'cumulativeLayoutShiftP75')),
        (d) => ({ page: d.cumulativeLayoutShiftPath || '(none reported)',
                  element: d.cumulativeLayoutShiftElement || '' }),
        'cumulativeLayoutShiftP75').filter((r) => r.p75 != null)
        .map((r) => ({ page: r.page, element: r.element, p75: Math.round(r.p75 * 1000) / 1000, samples: r.samples }));
      if (!rows2.length) return '<p class="muted">No CLS p75 samples in the last 7 days.</p>';
      return table(rows2, [{ key: 'page', label: 'Page' }, { key: 'element', label: 'Element' },
        { key: 'p75', label: 'p75 (score)', num: true }, { key: 'samples', label: 'Samples', num: true }]);
    }),
  ]);

  return html(head
    + '<h1>Analytics <span class="muted">— ' + esc(from) + ' to ' + esc(to)
      + ' ET, ' + allDays.length + ' day' + (allDays.length === 1 ? '' : 's')
      + ', ' + rows.length + ' row' + (rows.length === 1 ? '' : 's') + '</span></h1>'
    + '<p class="muted">Every date and time on this page is <b>Eastern</b>, measured '
    + 'midnight to midnight.</p>'
    + picker(from, to) + clampNote
    + GLOSSARY
    + tiles + deltaLine
    + sourceNoteFirstParty(anyCoarse, anyMissing)
    + (liveErr ? '<p class="warn">Today’s live figure failed to load: ' + esc(liveErr) + '</p>' : '')
    + '<h2>By day</h2>' + chart + legend + dayTable
    + '<h2>Traffic breakdown <span class="muted">— first-party for closed days, Cloudflare live for today</span></h2>'
    + migrated.join('') + referrerSections.join('') + countryReferrerDaySection.join('')
    + '<h2>Performance <span class="muted">— real visitors, last 7 days, Cloudflare-only</span></h2>'
    + '<p class="muted">Core Web Vitals from real page loads, at the 75th percentile — the '
    + 'figure Google’s own ranking uses, and the one that would have shown #596 (the control '
    + 'room render-bound at 4.7 fps) before a player had to say so. <span class="warn">'
    + '`traffic_daily` stores no percentiles, so this section cannot become a trend and does '
    + 'not follow the picker above</span> — it is always the trailing 7 days.</p>'
    + vitals.join('')
    + '<p class="muted">In-sim usage — what people do once inside the sim, and how the '
    + 'walkthroughs go — is on <a href="?view=usage">Feature usage</a>.</p>'
    + '</body></html>');
}
