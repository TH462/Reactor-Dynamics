/* Reactor Dynamics — per-session drill-down.
 *
 *   ?view=sessions            every session, sortable/filterable (#797.4)
 *   ?view=session&sid=<id>    one session's ordered trace
 *
 * SORT (`sort=start_desc|start_asc|dur_desc|dur_asc`) and FILTER (`device=`, `ref=`,
 * `country=`, `scram=`) on the list view are covered where they are built, just above
 * `sessionList()` — read that block before changing either. Short version: only
 * `start_asc` changes which 100 sessions the SQL fetches; duration sort and the scram
 * filter both operate on whatever that fetch already returned, which is why the
 * truncation note is sort-aware rather than one fixed sentence.
 *
 * This is the "what did they press and look at" view. Read the three limits below
 * before quoting anything off it — all three are properties of the data, not bugs,
 * and each one makes a different question unanswerable.
 *
 * 1. THE ROWS ARE SAMPLED. Analytics Engine drops rows under load and reports the
 *    weight of what survived in `_sample_interval`. Measured on the live dataset
 *    2026-08-10: `command` stored 42 raw rows against an estimated 64 — about a
 *    THIRD of the presses are simply not there. A session trace is therefore a
 *    sample of what happened, never the whole of it, and "they never pressed X" is
 *    not a conclusion this view can support. The complete record of one session does
 *    exist — but only for a session someone filed a bug report on, in the R2 bundle,
 *    which carries every command with its own timestamp.
 *
 * 2. THE WRITE TIME IS THE BATCH FLUSH; THE "At" COLUMN IS THE PRESS. `site/telemetry.js`
 *    batches events and flushes every BATCH_MS, so a batch's worth of activity lands on
 *    one identical write timestamp. Since 2026-08-10 each event also carries its own
 *    client stamp — `t_page` (seconds since page load, on the wire since the first
 *    release and discarded until then) and `t_session` — so rows are ordered by the
 *    batch first and the client stamp within it. Two consequences worth knowing:
 *    `t_page` RESETS ON RELOAD while the session id survives one, so a drop in it is a
 *    positive detection of a reload and this view draws a band there rather than
 *    smoothing it away; and rows written by a client older than the release that added
 *    `t_session` read -1, shown as "—" rather than as second zero.
 *
 * 3. A SESSION IS A TAB, NOT A SITTING. The id lives in sessionStorage, so a tab left
 *    open spans everything that happens in it — the live data has one session running
 *    from 14:02 to 00:36 the next day. And `session_end` needs the page to go away
 *    cleanly enough for sendBeacon: 2 of the 4 sessions with events have no end row,
 *    so duration and last-panel are missing for half of them rather than zero.
 *
 * 4. -1 IS "NOT REPORTED", NEVER A ZERO. Every column added 2026-08-10 writes -1 when
 *    the client had no opinion, and for `blocked` that is the difference between "the
 *    plant let it through" and "this client predates the column". A query that forgets
 *    `>= 0` reads a whole release as a plant that never refused anything.
 */

import { esc, html, PAGE_HEAD, nav, table, cards, errBlock, etWithDow, dur } from './render.js';
import { sql, DATASET, COLUMNS_SINCE, COLUMNS_SINCE_TS } from './cfapi.js';
// OWN_COLUMNS_SINCE guards the 2026-09-20 device/country/referrer columns (blob10/11/13)
// the same way COLUMNS_SINCE above guards the 2026-08-10 set — see rollup.js's own
// comment for why it is a SEPARATE constant (two separate commits, two separate floors).
import { OWN_COLUMNS_SINCE } from './rollup.js';

const num = (v) => (v == null || v === '' ? 0 : Number(v));

// -1 is the receiver's "not reported" sentinel (worker/src/index.js). Anything that
// renders or sums a new column has to route through here, or a client too old to have
// an opinion is silently counted as a real zero.
const reported = (v) => Number(v) >= 0;

/* A row written BEFORE the columns existed has a short doubles array, which reads back
 * as 0 — not -1, and not null. So the sentinel cannot see it, and every historical
 * event would render "0:00", claiming the whole session happened in its first second.
 * The row's own write time is the only thing that separates the two, so anything that
 * renders or sums a new column asks this first. Both guards are needed; neither is a
 * substitute for the other. See cfapi.js for the measurement and the expiry date.
 */
const hasColumns = (r) => String(r.timestamp || '') >= COLUMNS_SINCE_TS;

// Seconds between two Analytics Engine timestamps ("YYYY-MM-DD HH:MM:SS", always UTC).
// Normalised to explicit ISO-Z rather than trusted to Date's space-separator handling,
// which is implementation-defined and treats the string as LOCAL time in V8.
function spanSecs(a, b) {
  const t = (s) => Date.parse(String(s || '').trim().replace(' ', 'T') + 'Z');
  const d = (t(b) - t(a)) / 1000;
  return isFinite(d) && d > 0 ? d : 0;
}
const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');

// What each event's payload MEANS — the column map is positional (see index.js), so
// the same slot is a panel on one row and an action on the next.
function detailOf(r) {
  const key = r.key || '';
  const refused = hasColumns(r) && reported(r.blocked) && num(r.blocked) === 1
    ? ' · REFUSED' + (r.code ? ' (' + r.code + ')' : '')
    : '';
  switch (r.event) {
    case 'command': return key + refused;
    case 'panel_open': return key;
    case 'panel_close': return key + ' · ' + num(r.secs) + ' s on screen';
    case 'session_start': return 'started in ' + (key || '(unknown)');
    case 'session_end': return 'last panel ' + (key || '(none)') + ' · ' + num(r.secs) + ' s';
    case 'milestone': return key + ' · sim ' + num(r.sim) + ' s';
    case 'plant_mode': return 'Mode ' + num(r.mode) + ' · sim ' + num(r.sim) + ' s';
    default: return key;
  }
}

/* ---------------------------------------------------------------- sort + filter (#797.4)
 *
 * SORT is two axes, each with two directions: start time (`start_desc`/`start_asc`) and
 * duration (`dur_desc`/`dur_asc` — "show me the longest sessions" is the question this
 * whole view exists to answer, per the issue). Links, not a form: GET with no state to
 * collect, so a plain `<a href>` carrying every current param is enough — no auto-submit,
 * no JS, matching the file's own no-script constraint.
 *
 * ONLY `start_asc` CHANGES WHICH 100 ROWS THE SQL FETCHES (it flips the query's own
 * `ORDER BY first_seen` to ASC, so the fetch is the OLDEST 100 in the window rather than
 * the newest). Duration has no such column to `ORDER BY` — it is `Math.max(write span,
 * client clock)`, computed in JS from two OTHER queries below — so both duration sorts
 * re-order whichever 100 rows the (always newest-first-fetched, unless start_asc) query
 * already returned. That is a real limitation, not an oversight: the "most recent 100"
 * and "the longest 100" are different sets the moment a window holds more than 100
 * sessions, and the truncation note below says so in the sort-appropriate words rather
 * than repeating the fixed sentence that used to be here unconditionally.
 *
 * FILTER is device / country / referrer-kind (blob13/11/10, index.js's 2026-09-20 column
 * set — see the import above) plus "scrammed", the one boolean derivable from the
 * existing session-events stream without a second query round. A GET form, not links: it
 * collects several fields at once. Every hidden field below exists because of the bug
 * named in the brief — a `<button formaction="?...">` inside a GET form has its action's
 * OWN query string discarded by the browser, which submits only the form's fields — so
 * `days` and the active `sort` are carried as hidden inputs, never assumed to survive in
 * the URL the form happens to be sitting on.
 */
const SORTS = ['start_desc', 'start_asc', 'dur_desc', 'dur_asc'];
const SORT_LABEL = { start_desc: 'Newest first', start_asc: 'Oldest first',
  dur_desc: 'Longest first', dur_asc: 'Shortest first' };
const DEVICE_KINDS = ['mobile', 'tablet', 'desktop', 'unknown'];
const REF_KINDS = ['direct', 'internal', 'external', 'unknown'];

// Quotes a value for interpolation into an AE SQL string literal — cfapi.js has no
// parameter binding, so anything built from a URL parameter is escaped here rather than
// trusted. Same idiom as usage.js's `sqlStr`; device/ref already come off a closed
// allowlist and country is regex-validated below, so this is defence in depth, not the
// only guard.
const sqlStr = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";

export async function sessionList(env, url) {
  const apiToken = env.CF_ANALYTICS_TOKEN;
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days')) || 30));
  const since = `timestamp > NOW() - INTERVAL '${days}' DAY`;
  const head = '<!doctype html><html><head>' + PAGE_HEAD
    + '<title>Sessions — Reactor Dynamics</title></head><body>' + nav('sessions');

  if (!apiToken) return html(head + '<h1>Sessions</h1><p class="warn">No '
    + '<span class="mono">CF_ANALYTICS_TOKEN</span> secret is set on this Worker.</p></body></html>');

  const rawSort = url.searchParams.get('sort') || 'start_desc';
  const sort = SORTS.indexOf(rawSort) !== -1 ? rawSort : 'start_desc';
  const fetchDir = sort === 'start_asc' ? 'ASC' : 'DESC';

  const rawDevice = url.searchParams.get('device') || 'all';
  const device = DEVICE_KINDS.indexOf(rawDevice) !== -1 ? rawDevice : 'all';
  const rawRef = url.searchParams.get('ref') || 'all';
  const refKind = REF_KINDS.indexOf(rawRef) !== -1 ? rawRef : 'all';
  // 'UNKNOWN' is a real, distinct answer (blob11 = '') — never the same fact as "no
  // filter" — so it is validated and carried the same way a real code is, not folded
  // into 'all'.
  const rawCountry = String(url.searchParams.get('country') || '').trim().toUpperCase();
  const country = rawCountry === 'UNKNOWN' ? 'UNKNOWN'
    : /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : 'all';
  const rawScram = url.searchParams.get('scram') || 'all';
  const scram = (rawScram === 'yes' || rawScram === 'no') ? rawScram : 'all';

  /* THE DEVICE/COUNTRY/REFERRER FILTER REACHES THE PRIMARY QUERY (`counts` below) as a
   * plain WHERE clause. These three ride on EVERY event row (index.js's 2026-09-20
   * column map), so a session's device/country/referrer-kind does not vary row to row —
   * filtering the primary per-session query by them is filtering by SESSION.
   *
   * GUARDED BY OWN_COLUMNS_SINCE, the same way rollup.js's own use of these columns is:
   * naming a sparse, per-result-set-typed column in a query that matches nothing is a
   * 422, not an empty table (cfapi.js's header; rollup.js's OWN_COLUMNS_SINCE comment
   * measures the same thing for this exact column set). The floor rules out "this window
   * predates the columns entirely"; it does NOT rule out "this exact combination has zero
   * sessions in an otherwise-columned window", which the SQL subset here has no subquery
   * or EXISTS to probe for cheaply. `counts` below therefore carries its own `.catch` for
   * this one case, rather than letting a legitimate zero-match filter take the whole page
   * down the way an unrelated query failure already can. */
  const filterClauses = [];
  if (device !== 'all') filterClauses.push('blob13 = ' + sqlStr(device));
  if (refKind !== 'all') filterClauses.push('blob10 = ' + sqlStr(refKind));
  if (country === 'UNKNOWN') filterClauses.push("blob11 = ''");
  else if (country !== 'all') filterClauses.push('blob11 = ' + sqlStr(country));
  const filterActive = filterClauses.length > 0;
  const filterWhere = filterActive
    ? (' AND ' + filterClauses.join(' AND ') + ' AND timestamp >= ' + OWN_COLUMNS_SINCE)
    : '';

  // Every link and every hidden form field is built from THIS, so a sort click or a
  // filter submit can never silently drop a param it did not itself change — the trap
  // named in the brief ("a filter that silently resets the window is worse than no
  // filter").
  const qs = (overrides) => {
    const p = new URLSearchParams();
    p.set('view', 'sessions');
    p.set('days', String(days));
    p.set('sort', sort);
    if (device !== 'all') p.set('device', device);
    if (refKind !== 'all') p.set('ref', refKind);
    if (country !== 'all') p.set('country', country);
    if (scram !== 'all') p.set('scram', scram);
    Object.keys(overrides || {}).forEach((k) => {
      if (overrides[k] == null) p.delete(k); else p.set(k, String(overrides[k]));
    });
    return '?' + p.toString();
  };
  const sortLink = (key) => key === sort
    ? '<b>' + esc(SORT_LABEL[key]) + '</b>'
    : '<a href="' + qs({ sort: key }) + '">' + esc(SORT_LABEL[key]) + '</a>';
  const sortBar = '<p class="muted">Sort by: ' + sortLink('start_desc') + ' &middot; '
    + sortLink('start_asc') + ' &middot; ' + sortLink('dur_desc') + ' &middot; '
    + sortLink('dur_asc') + '</p>';

  const opt = (value, label, current) => '<option value="' + esc(value) + '"'
    + (value === current ? ' selected' : '') + '>' + esc(label) + '</option>';
  const filterForm = '<form method="GET" style="margin:8px 0">'
    + '<input type="hidden" name="view" value="sessions">'
    + '<input type="hidden" name="days" value="' + days + '">'
    + '<input type="hidden" name="sort" value="' + esc(sort) + '">'
    + ' Device <select name="device">' + opt('all', 'All', device)
    + DEVICE_KINDS.map((d) => opt(d, d, device)).join('') + '</select>'
    + ' Referrer <select name="ref">' + opt('all', 'All', refKind)
    + REF_KINDS.map((k) => opt(k, k, refKind)).join('') + '</select>'
    + ' Country <input type="text" name="country" size="8" maxlength="8" '
    + 'placeholder="US, unknown" value="' + esc(country === 'all' ? '' : country) + '">'
    + ' Scrammed <select name="scram">' + opt('all', 'Any', scram)
    + opt('yes', 'Yes', scram) + opt('no', 'No', scram) + '</select>'
    + ' <button type="submit">Apply filter</button>'
    + (filterActive ? ' <a href="' + qs({ device: null, ref: null, country: null, scram: null })
      + '">clear</a>' : '')
    + '</form>';

  let body, truncated = false, filterErr = '';
  try {
    // Six queries rather than one: Analytics Engine SQL has no subqueries, and the
    // fields wanted here live on different event rows. Merged by session id below.
    const countsQuery = `SELECT blob4 AS session,
              min(timestamp) AS first_seen, max(timestamp) AS last_seen,
              count() AS raw, sum(_sample_interval) AS est
         FROM ${DATASET} WHERE blob2 <> 'dev' AND ${since}${filterWhere}
         GROUP BY session ORDER BY first_seen ${fetchDir} LIMIT 100`;

    const [counts, starts, elapsed, ends, meta, scrams] = await Promise.all([
      // GROUP BY the session ALONE, and select NOTHING else non-aggregate. Two traps,
      // both measured 2026-08-10:
      //   - grouping by release/plant too splits one session across several rows,
      //     because `plant` rides only on the events that carry it (session_start) and
      //     is empty on the rest — one session rendered twice, once `pwr`, once blank;
      //   - the obvious fix, max(blob6), is rejected outright: Analytics Engine answers
      //     422 "cannot use the String type as argument 1 in max()". There is no
      //     any()/argMax() here either, so the string columns come from the second
      //     query instead, where session_start already carries them.
      // `blob2 <> 'dev'` throughout this file (OWNER RULING, 2026-09-20): these pages
      // claim to show what players do, and the dev channel is a local checkout, `file://`
      // or a static server — i.e. an agent's headless run, never a real visitor. It needs
      // no COLUMNS_SINCE-style probe: blob2/channel is populated on every row.
      //
      // `.catch` ONLY when a device/country/referrer filter is active — see the comment
      // above `filterWhere`. Unfiltered, this query has the exact fixed shape it always
      // had and any failure is the same "something is actually wrong" the outer catch
      // already handles; filtered, a legitimate zero-match combination can 422 rather
      // than return [], and that is a normal filter result, not a page failure.
      filterActive
        ? sql(apiToken, countsQuery).catch((e) => { filterErr = e.message; return []; })
        : sql(apiToken, countsQuery),
      sql(apiToken, `SELECT blob4 AS session, blob5 AS initial_state,
              blob3 AS release, blob6 AS plant
         FROM ${DATASET} WHERE blob1 = 'session_start' AND blob2 <> 'dev' AND ${since}
         GROUP BY session, initial_state, release, plant`),
      /* The client's own elapsed clock, needed because the WRITE-TIME span is 0 for any
       * session whose events all landed in one batch — measured: two real browser
       * sessions of 6 and 4 events each span 00:00, while the player was demonstrably
       * present for at least 6 s. So the two numbers are combined below.
       *
       * Guarded by its own probe: naming double5 when no row in range carries it is a
       * 422, not an empty column (see the detail view). Resolves to [] when there are
       * no post-column rows, and the duration silently falls back to the write span.
       */
      (async () => {
        const p = await sql(apiToken, `SELECT count() AS n FROM ${DATASET}
            WHERE blob2 <> 'dev' AND ${since} AND timestamp >= ${COLUMNS_SINCE}`);
        if (!(num(p[0] && p[0].n) > 0)) return [];
        // double6 is t_session — seconds since the session id was MINTED, which
        // survives a reload; double5/t_page resets on every reload and is the weaker
        // floor. sessionDetail() below already reads double6 for the same reason.
        return sql(apiToken, `SELECT blob4 AS session, max(double6) AS t_last
           FROM ${DATASET} WHERE blob2 <> 'dev' AND ${since} AND timestamp >= ${COLUMNS_SINCE}
           GROUP BY session`);
      })(),
      sql(apiToken, `SELECT blob4 AS session, blob5 AS last_panel, max(double1) AS secs
         FROM ${DATASET} WHERE blob1 = 'session_end' AND blob2 <> 'dev' AND ${since}
         GROUP BY session, last_panel`),
      /* Device/country/referrer-kind FOR DISPLAY (every card, filtered or not) — same
       * probe-then-query shape as the elapsed-clock block above, guarded by
       * OWN_COLUMNS_SINCE rather than COLUMNS_SINCE because it is the OTHER column
       * generation (rollup.js's comment on why the two floors are never shared). This is
       * independent of `filterWhere`: it runs unfiltered so a card can show its own
       * device/country/referrer even when the page as a whole is not filtered by them. */
      (async () => {
        const p = await sql(apiToken, `SELECT count() AS n FROM ${DATASET}
            WHERE blob2 <> 'dev' AND ${since} AND timestamp >= ${OWN_COLUMNS_SINCE}`);
        if (!(num(p[0] && p[0].n) > 0)) return [];
        return sql(apiToken, `SELECT blob4 AS session, blob13 AS device,
                blob11 AS country, blob10 AS ref_kind
           FROM ${DATASET} WHERE blob1 = 'session_start' AND blob2 <> 'dev' AND ${since}
             AND timestamp >= ${OWN_COLUMNS_SINCE}
           GROUP BY session, device, country, ref_kind`);
      })(),
      /* "Scrammed" — the one filter offered beyond device/country/referrer, and the only
       * one derivable from the existing stream without inventing new SQL: `milestone`
       * events with key 'scram' fire once per SCRAM (ui/app.js), and blob1/blob5 are the
       * ORIGINAL columns (day-one, never sparse), so this needs no COLUMNS_SINCE-style
       * guard at all — unlike the two queries above. Same shape as the `ends` query two
       * queries up, not a new pattern. Membership in this result set (not the count) is
       * the yes/no signal; a session sampled down to one surviving row still shows up
       * here once, which is all "did this happen at least once" needs. */
      sql(apiToken, `SELECT blob4 AS session, count() AS n
         FROM ${DATASET} WHERE blob1 = 'milestone' AND blob5 = 'scram' AND blob2 <> 'dev' AND ${since}
         GROUP BY session`),
    ]);

    const startBy = {}, endBy = {}, lastBy = {}, metaBy = {}, scramBy = {};
    // A session can carry more than one session_start row (a reload re-fires it under
    // the same sessionStorage id). First one wins — that is the session's real origin.
    starts.forEach((r) => { if (!startBy[r.session]) startBy[r.session] = r; });
    ends.forEach((r) => { endBy[r.session] = r; });
    (elapsed || []).forEach((r) => { lastBy[r.session] = num(r.t_last); });
    (meta || []).forEach((r) => { if (!metaBy[r.session]) metaBy[r.session] = r; });
    (scrams || []).forEach((r) => { scramBy[r.session] = num(r.n); });

    // The `counts` query carries `LIMIT 100` (dashboard.js's pattern, `verbatim`d rather
    // than imported — this file does not touch that one). A full page means some
    // sessions in the window were silently cut off unless the reader is told — WHICH
    // ones depends on the active sort/fetch direction, so the note is built alongside
    // the sort links below rather than as one fixed sentence.
    truncated = counts.length >= 100;

    let rows = counts.map((r) => {
      const end = endBy[r.session];
      const start = startBy[r.session] || {};
      const m = metaBy[r.session] || {};
      const href = '?view=session&sid=' + encodeURIComponent(r.session);
      // A FLOOR, and the larger of two independent floors. The write span misses
      // everything inside one batch; the client's last stamp misses everything after
      // a reload (it restarts at 0). Neither can overstate, so the max of the two is
      // the best lower bound available — never a claim about how long they PLAYED.
      const spanSecsVal = Math.max(spanSecs(r.first_seen, r.last_seen), lastBy[r.session] || 0);
      return {
        session: r.session,
        link: '<a href="' + href + '">' + esc(r.session) + '</a>',
        started: etWithDow(r.first_seen),
        started_from: start.initial_state || '—',
        plant: start.plant || '—',
        release: start.release || '—',
        device: m.device || '—',
        country: m.country || '—',
        ref_kind: m.ref_kind || '—',
        span_secs: spanSecsVal,
        span: dur(spanSecsVal),
        rows_raw: num(r.raw),
        rows_est: num(r.est),
        scrams: scramBy[r.session] || 0,
        // Absent is not zero: no session_end row means the tab never closed cleanly.
        ended: end ? num(end.secs) + ' s' : '(no end row)',
      };
    });

    // The one filter that could not reach the primary query (see the comment on the
    // `scrams` query above — it is a per-session AGGREGATE over rows the WHERE clause
    // has already narrowed, not a value one row carries, so it cannot become a WHERE
    // fragment the way device/country/referrer can). Applied to whatever `counts`
    // already fetched — see the truncation note for what that means when the window
    // holds more than 100 sessions.
    if (scram !== 'all') {
      rows = rows.filter((r) => (scram === 'yes' ? r.scrams > 0 : r.scrams === 0));
    }

    // DURATION SORT is JS-side re-ordering of whatever `counts` fetched — see the big
    // comment above `SORTS`. The two `start_*` sorts need no re-sort here: the SQL
    // `ORDER BY first_seen ${fetchDir}` already put them in the right order, and
    // filtering by scram above only removes rows, never reorders the survivors.
    if (sort === 'dur_desc') rows = rows.slice().sort((a, b) => b.span_secs - a.span_secs);
    else if (sort === 'dur_asc') rows = rows.slice().sort((a, b) => a.span_secs - b.span_secs);

    // `link` is pre-built HTML, so it must bypass table()'s escaping — the session id
    // inside it is escaped above.
    //
    // CARDS, not a nine-column table (owner request, 2026-08-12). Nine columns was the worst
    // offender for the stretch problem: on a wide monitor the session id sat at the far left
    // and "Since reset" at the far right with a screen of whitespace between them, and the
    // page still showed only a handful of sessions. Stacked in a card the same nine facts
    // occupy ~320 px and a wide screen shows four sessions abreast instead of one.
    // `link` is pre-built HTML with the session id already escaped, so it goes in as
    // `titleHtml`; every other field is escaped by cards().
    body = cards(rows.map((r) => ({
      titleHtml: r.link + '<span class="muted">' + esc(r.span) + '</span>',
      meta: [
        { k: 'First seen', v: r.started, mono: true },
        { k: 'Started from', v: r.started_from },
        { k: 'Plant', v: r.plant, mono: true },
        { k: 'Release', v: r.release, mono: true },
        { k: 'Device', v: r.device, mono: true },
        { k: 'Country', v: r.country, mono: true },
        { k: 'Referrer', v: r.ref_kind, mono: true },
        { k: 'Scrammed', v: r.scrams > 0 ? ('yes (' + r.scrams + ')') : 'no' },
        { k: 'Rows', v: r.rows_raw + ' raw / ' + r.rows_est + ' est', mono: true },
        { k: 'Since reset', v: r.ended },
      ],
    })));
  } catch (e) {
    body = errBlock(e.message);
  }

  // THE TRUNCATION NOTE, sort-aware (#797.4) — "the most recent 100" and "the longest
  // 100" are different sets the moment a window holds more than 100 sessions, so the
  // note has to say which 100 it is actually looking at, not repeat one fixed sentence
  // regardless of sort. `fetchDir` is what the SQL actually used; `sort` distinguishes
  // "duration re-ordered within that fetch" from "start-time order, which the fetch IS".
  const capNote = truncated
    ? (fetchDir === 'ASC'
        ? '<p class="warn">Showing the OLDEST 100 sessions in the window'
          + (filterActive ? ' matching this filter' : '') + ' — the window holds more '
          + '(newer ones); switch to <b>Newest first</b> or narrow the day range to see them.</p>'
        : (sort === 'dur_desc' || sort === 'dur_asc'
            ? '<p class="warn">Showing the most recent 100 sessions in the window'
              + (filterActive ? ' matching this filter' : '') + ', sorted by duration '
              + '<b>within that set</b> — a longer session further back in the window '
              + 'would not appear here. Narrow the day range to search deeper.</p>'
            : '<p class="warn">Showing the most recent 100 sessions'
              + (filterActive ? ' matching this filter' : '') + ' — the window holds '
              + 'more; narrow the day range to see the rest.</p>'))
    : '';

  return html(head
    + '<h1>Sessions <span class="muted">— last ' + days + ' days</span></h1>'
    + sortBar + filterForm
    + (filterErr ? '<p class="err">The filtered query failed — most likely no session in '
      + 'this window matches this combination: <span class="mono">' + esc(filterErr)
      + '</span></p>' : '')
    + capNote
    + '<p class="muted">A session is a browser TAB, not a sitting: the id lives in '
    + 'sessionStorage, so a tab left open spans hours — the longest here is 11h 34m and '
    + 'nobody played for 11 hours. <b>Lasted ≥</b> is a FLOOR, the better of two lower '
    + 'bounds (the span of write times, and the client\'s own clock at its last event); '
    + 'it is time the tab was <i>open</i>, never time spent playing. <b>Since reset</b> '
    + 'is the client\'s own figure at <span class="mono">session_end</span> — measured '
    + 'from the last plant reset rather than from the start of the session, and absent '
    + 'entirely when a tab did not close cleanly. <b>Rows</b> is what was stored, '
    + '<b>Est</b> what was sampled away — where they differ, presses are missing. '
    + 'Times are <b>Eastern</b>.</p>'
    // The per-view source line (#764) — see the note in usage.js for why this page's
    // wording is not the traffic page's.
    + '<p class="muted">Source: <b>Cloudflare Analytics Engine</b> — sampled '
    + '(session counts are a floor), 3-month retention.</p>'
    + body + '</body></html>');
}

export async function sessionDetail(env, url, sid) {
  const apiToken = env.CF_ANALYTICS_TOKEN;
  const head = '<!doctype html><html><head>' + PAGE_HEAD
    + '<title>Session ' + esc(sid) + '</title></head><body>' + nav('sessions');
  const backHref = '?view=sessions';

  if (!apiToken) return html(head + '<p class="warn">No CF_ANALYTICS_TOKEN secret set.</p></body></html>');

  // The id is interpolated into SQL, so it must be exactly the shape the Worker mints:
  // <base36 ms>-<8 chars> (index.js handleBundle / telemetry.js). Anything else is
  // rejected rather than escaped — there is no parameter binding on this API.
  if (!/^[a-z0-9]{1,16}-[a-z0-9]{1,16}$/i.test(sid)) {
    return html(head + '<p class="err">bad session id</p></body></html>', 400);
  }

  let body;
  try {
    /* ANALYTICS ENGINE TYPES COLUMNS PER RESULT SET, and errors rather than nulling.
     * If no row matching the WHERE clause carries double5..8, naming one is a 422 —
     * "unable to find type of column: double6" — so a session made entirely of rows
     * older than the columns cannot even mention them. Measured 2026-08-11.
     *
     * So: ask first whether this session has any row from after the columns existed,
     * and only then select them. A try/catch fallback would work too, but it would
     * swallow every OTHER 422 as well, and a malformed query would look like an old
     * session for ever.
     */
    const probe = await sql(apiToken, `SELECT count() AS n FROM ${DATASET}
        WHERE blob4 = '${sid}' AND blob2 <> 'dev' AND timestamp >= ${COLUMNS_SINCE}`);
    const timed = num(probe[0] && probe[0].n) > 0;

    /* The batch write time stays the OUTER sort — it is never wrong ACROSS batches —
     * and the client stamps break the tie WITHIN one, which is the whole point of
     * storing them. t_session first, because it survives a reload; t_page second.
     *
     * ORDER BY RESOLVES AGAINST THE SELECT PROJECTION, not against the table. It can
     * only name something the SELECT list actually outputs — so `ORDER BY double6` is a
     * 422 ("unable to find type of column") on the very same query whose SELECT reads
     * `double6 AS t_sess`, because the projection is called t_sess. The same error
     * appears for `ORDER BY timestamp` the moment timestamp is dropped from the SELECT
     * list, which is what pinned the rule down. Both measured 2026-08-11 against rows
     * that demonstrably carry the columns, so this is the resolver and not the
     * sparse-result-set case above — which produces an identical message from a
     * completely different cause.
     */
    const rows = await sql(apiToken, timed
      ? `SELECT timestamp, blob1 AS event, blob5 AS key,
             double1 AS secs, double2 AS sim, double3 AS mode,
             double5 AS t_page, double6 AS t_sess, double7 AS blocked, blob7 AS code,
             _sample_interval AS si
        FROM ${DATASET} WHERE blob4 = '${sid}' AND blob2 <> 'dev'
        ORDER BY timestamp ASC, t_sess ASC, t_page ASC LIMIT 500`
      : `SELECT timestamp, blob1 AS event, blob5 AS key,
             double1 AS secs, double2 AS sim, double3 AS mode, _sample_interval AS si
        FROM ${DATASET} WHERE blob4 = '${sid}' AND blob2 <> 'dev'
        ORDER BY timestamp ASC LIMIT 500`);

    // A DROP in t_page is a page reload: the stamp is relative to page load while the
    // session id lives in sessionStorage and survives one. Draw it, rather than let a
    // clock that appears to run backwards read as noise.
    let prevPage = null, load = 1;
    const trs = rows.map((r) => {
      const known = hasColumns(r);
      const tp = num(r.t_page);
      let band = '';
      if (known && reported(r.t_page)) {
        if (prevPage !== null && tp < prevPage) {
          load++;
          band = '<tr><td class="muted" colspan="5">— page reload · load ' + load + ' —</td></tr>';
        }
        prevPage = tp;
      }
      // Prefer the session-relative stamp; fall back to page-relative, which is what a
      // client older than that release sends. Rows predating the columns entirely get
      // an em dash — rendering their 0 as "0:00" would claim the whole session happened
      // in its first second.
      const at = !known ? '—'
        : reported(r.t_sess) ? mmss(num(r.t_sess))
        : reported(r.t_page) ? mmss(tp) + '*'
        : '—';
      return band + '<tr><td class="mono">' + esc(at) + '</td>'
        + '<td class="mono muted">' + esc(etWithDow(r.timestamp)) + '</td>'
        + '<td class="mono">' + esc(r.event) + '</td>'
        + '<td>' + esc(detailOf(r)) + '</td>'
        + '<td class="num muted">' + (num(r.si) > 1 ? '×' + num(r.si) : '') + '</td></tr>';
    }).join('');

    const counts = {};
    rows.forEach((r) => { counts[r.event] = (counts[r.event] || 0) + 1; });
    const tiles = '<div class="tiles">' + Object.keys(counts).sort().map((k) =>
      '<div class="tile"><div class="v">' + counts[k] + '</div><div class="k">' + esc(k) + '</div></div>'
    ).join('') + '</div>';

    body = rows.length
      ? tiles + '<table><tr><th>At</th><th>Written (ET)</th><th>Event</th><th>Detail</th>'
        + '<th class="num">Weight</th></tr>' + trs + '</table>'
      : '<p class="muted">(no rows — the session may have aged out of the 3-month retention)</p>';
  } catch (e) {
    body = errBlock(e.message);
  }

  return html(head
    + '<a class="backlink" href="' + backHref + '">&larr; all sessions</a>'
    + '<h1>Session <span class="mono">' + esc(sid) + '</span></h1>'
    + '<p class="muted"><b>“At” is the press; “Written” is the batch flush.</b> Events are '
    + 'batched client-side, so a whole batch shares one write time — the client stamp is '
    + 'what orders them within it. A starred time is page-relative (a client older than '
    + 'the session-relative stamp), and <b>—</b> means that client sent no time at all. '
    + '<b>Weight</b> marks a row that stood for more than one event; the rest were '
    + 'sampled away, so this is a sample of the session, not the whole of it.</p>'
    + body + '</body></html>');
}
