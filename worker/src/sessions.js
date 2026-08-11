/* Reactor Dynamics — per-session drill-down.
 *
 *   ?view=sessions            every session, newest first
 *   ?view=session&sid=<id>    one session's ordered trace
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

import { esc, html, PAGE_HEAD, nav, table, errBlock, withDow, dur } from './render.js';
import { sql, DATASET, COLUMNS_SINCE, COLUMNS_SINCE_TS } from './cfapi.js';

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

export async function sessionList(env, url, token) {
  const apiToken = env.CF_ANALYTICS_TOKEN;
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days')) || 30));
  const since = `timestamp > NOW() - INTERVAL '${days}' DAY`;
  const head = '<!doctype html><html><head>' + PAGE_HEAD
    + '<title>Sessions — Reactor Dynamics</title></head><body>' + nav(token, 'sessions');

  if (!apiToken) return html(head + '<h1>Sessions</h1><p class="warn">No '
    + '<span class="mono">CF_ANALYTICS_TOKEN</span> secret is set on this Worker.</p></body></html>');

  let body;
  try {
    // Three queries rather than one: Analytics Engine SQL has no subqueries, and the
    // fields wanted here live on different event rows. Merged by session id below.
    const [counts, starts, elapsed, ends] = await Promise.all([
      // GROUP BY the session ALONE, and select NOTHING else non-aggregate. Two traps,
      // both measured 2026-08-10:
      //   - grouping by release/plant too splits one session across several rows,
      //     because `plant` rides only on the events that carry it (session_start) and
      //     is empty on the rest — one session rendered twice, once `pwr`, once blank;
      //   - the obvious fix, max(blob6), is rejected outright: Analytics Engine answers
      //     422 "cannot use the String type as argument 1 in max()". There is no
      //     any()/argMax() here either, so the string columns come from the second
      //     query instead, where session_start already carries them.
      sql(apiToken, `SELECT blob4 AS session,
              min(timestamp) AS first_seen, max(timestamp) AS last_seen,
              count() AS raw, sum(_sample_interval) AS est
         FROM ${DATASET} WHERE ${since}
         GROUP BY session ORDER BY first_seen DESC LIMIT 100`),
      sql(apiToken, `SELECT blob4 AS session, blob5 AS initial_state,
              blob3 AS release, blob6 AS plant
         FROM ${DATASET} WHERE blob1 = 'session_start' AND ${since}
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
            WHERE ${since} AND timestamp >= ${COLUMNS_SINCE}`);
        if (!(num(p[0] && p[0].n) > 0)) return [];
        return sql(apiToken, `SELECT blob4 AS session, max(double5) AS t_last
           FROM ${DATASET} WHERE ${since} AND timestamp >= ${COLUMNS_SINCE}
           GROUP BY session`);
      })(),
      sql(apiToken, `SELECT blob4 AS session, blob5 AS last_panel, max(double1) AS secs
         FROM ${DATASET} WHERE blob1 = 'session_end' AND ${since}
         GROUP BY session, last_panel`),
    ]);

    const startBy = {}, endBy = {}, lastBy = {};
    // A session can carry more than one session_start row (a reload re-fires it under
    // the same sessionStorage id). First one wins — that is the session's real origin.
    starts.forEach((r) => { if (!startBy[r.session]) startBy[r.session] = r; });
    ends.forEach((r) => { endBy[r.session] = r; });
    (elapsed || []).forEach((r) => { lastBy[r.session] = num(r.t_last); });

    const rows = counts.map((r) => {
      const end = endBy[r.session];
      const start = startBy[r.session] || {};
      const href = '?token=' + encodeURIComponent(token) + '&view=session&sid=' + encodeURIComponent(r.session);
      return {
        session: r.session,
        link: '<a href="' + href + '">' + esc(r.session) + '</a>',
        started: withDow(r.first_seen),
        started_from: start.initial_state || '—',
        plant: start.plant || '—',
        release: start.release || '—',
        // A FLOOR, and the larger of two independent floors. The write span misses
        // everything inside one batch; the client's last stamp misses everything after
        // a reload (it restarts at 0). Neither can overstate, so the max of the two is
        // the best lower bound available — never a claim about how long they PLAYED.
        span: dur(Math.max(spanSecs(r.first_seen, r.last_seen), lastBy[r.session] || 0)),
        rows_raw: num(r.raw),
        rows_est: num(r.est),
        // Absent is not zero: no session_end row means the tab never closed cleanly.
        ended: end ? num(end.secs) + ' s' : '(no end row)',
      };
    });

    // `link` is pre-built HTML, so it must bypass table()'s escaping — the session id
    // inside it is escaped above.
    const head_ = '<tr><th>Session</th><th>First seen (UTC)</th><th class="num">Lasted ≥</th>'
      + '<th>Started from</th><th>Plant</th><th>Release</th>'
      + '<th class="num">Rows</th><th class="num">Est</th><th>Since reset</th></tr>';
    const trs = rows.map((r) => '<tr><td class="mono">' + r.link + '</td>'
      + '<td class="mono muted">' + esc(r.started) + '</td>'
      + '<td class="num">' + esc(r.span) + '</td>'
      + '<td>' + esc(r.started_from) + '</td>'
      + '<td class="mono">' + esc(r.plant) + '</td>'
      + '<td class="mono muted">' + esc(r.release) + '</td>'
      + '<td class="num">' + r.rows_raw + '</td>'
      + '<td class="num">' + r.rows_est + '</td>'
      + '<td class="muted">' + esc(r.ended) + '</td></tr>').join('');

    body = rows.length
      ? '<table>' + head_ + trs + '</table>'
      : '<p class="muted">(none)</p>';
  } catch (e) {
    body = errBlock(e.message);
  }

  return html(head
    + '<h1>Sessions <span class="muted">— last ' + days + ' days</span></h1>'
    + '<p class="muted">A session is a browser TAB, not a sitting: the id lives in '
    + 'sessionStorage, so a tab left open spans hours — the longest here is 11h 34m and '
    + 'nobody played for 11 hours. <b>Lasted ≥</b> is a FLOOR, the better of two lower '
    + 'bounds (the span of write times, and the client\'s own clock at its last event); '
    + 'it is time the tab was <i>open</i>, never time spent playing. <b>Since reset</b> '
    + 'is the client\'s own figure at <span class="mono">session_end</span> — measured '
    + 'from the last plant reset rather than from the start of the session, and absent '
    + 'entirely when a tab did not close cleanly. <b>Rows</b> is what was stored, '
    + '<b>Est</b> what was sampled away — where they differ, presses are missing.</p>'
    + body + '</body></html>');
}

export async function sessionDetail(env, url, token, sid) {
  const apiToken = env.CF_ANALYTICS_TOKEN;
  const head = '<!doctype html><html><head>' + PAGE_HEAD
    + '<title>Session ' + esc(sid) + '</title></head><body>' + nav(token, 'sessions');
  const backHref = '?token=' + encodeURIComponent(token) + '&view=sessions';

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
        WHERE blob4 = '${sid}' AND timestamp >= ${COLUMNS_SINCE}`);
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
        FROM ${DATASET} WHERE blob4 = '${sid}'
        ORDER BY timestamp ASC, t_sess ASC, t_page ASC LIMIT 500`
      : `SELECT timestamp, blob1 AS event, blob5 AS key,
             double1 AS secs, double2 AS sim, double3 AS mode, _sample_interval AS si
        FROM ${DATASET} WHERE blob4 = '${sid}' ORDER BY timestamp ASC LIMIT 500`);

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
        + '<td class="mono muted">' + esc(withDow(r.timestamp)) + '</td>'
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
      ? tiles + '<table><tr><th>At</th><th>Written (UTC)</th><th>Event</th><th>Detail</th>'
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
