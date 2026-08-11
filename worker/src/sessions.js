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
 * 2. THE TIMESTAMP IS THE BATCH WRITE, NOT THE PRESS. `site/telemetry.js` batches
 *    events and flushes every BATCH_MS, so up to a batch's worth of activity lands on
 *    one identical timestamp. Ordering WITHIN a timestamp is the order the rows came
 *    back, which is not necessarily the order the player did them. `command` and
 *    `panel_open` carry no time field of their own (deliberately — the schema in
 *    telemetry.js collects the key and nothing else), so there is no finer signal to
 *    fall back on. Consecutive identical rows are therefore ambiguous by construction:
 *    six `inject_failure` rows on one timestamp is six presses over a batch window,
 *    and nothing here can tell that from a double-send.
 *
 * 3. A SESSION IS A TAB, NOT A SITTING. The id lives in sessionStorage, so a tab left
 *    open spans everything that happens in it — the live data has one session running
 *    from 14:02 to 00:36 the next day. And `session_end` needs the page to go away
 *    cleanly enough for sendBeacon: 2 of the 4 sessions with events have no end row,
 *    so duration and last-panel are missing for half of them rather than zero.
 */

import { esc, html, PAGE_HEAD, nav, table, errBlock } from './render.js';
import { sql, DATASET } from './cfapi.js';

const num = (v) => (v == null || v === '' ? 0 : Number(v));

// What each event's payload MEANS — the column map is positional (see index.js), so
// the same slot is a panel on one row and an action on the next.
function detailOf(r) {
  const key = r.key || '';
  switch (r.event) {
    case 'command': return key;
    case 'panel_open': return key;
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
    const [counts, starts, ends] = await Promise.all([
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
      sql(apiToken, `SELECT blob4 AS session, blob5 AS last_panel, max(double1) AS secs
         FROM ${DATASET} WHERE blob1 = 'session_end' AND ${since}
         GROUP BY session, last_panel`),
    ]);

    const startBy = {}, endBy = {};
    // A session can carry more than one session_start row (a reload re-fires it under
    // the same sessionStorage id). First one wins — that is the session's real origin.
    starts.forEach((r) => { if (!startBy[r.session]) startBy[r.session] = r; });
    ends.forEach((r) => { endBy[r.session] = r; });

    const rows = counts.map((r) => {
      const end = endBy[r.session];
      const start = startBy[r.session] || {};
      const href = '?token=' + encodeURIComponent(token) + '&view=session&sid=' + encodeURIComponent(r.session);
      return {
        session: r.session,
        link: '<a href="' + href + '">' + esc(r.session) + '</a>',
        started: r.first_seen,
        started_from: start.initial_state || '—',
        plant: start.plant || '—',
        release: start.release || '—',
        rows_raw: num(r.raw),
        rows_est: num(r.est),
        // Absent is not zero: no session_end row means the tab never closed cleanly.
        ended: end ? num(end.secs) + ' s' : '(no end row)',
      };
    });

    // `link` is pre-built HTML, so it must bypass table()'s escaping — the session id
    // inside it is escaped above.
    const head_ = '<tr><th>Session</th><th>First seen (UTC)</th><th>Started from</th>'
      + '<th>Plant</th><th>Release</th><th class="num">Rows</th><th class="num">Est</th><th>Ended</th></tr>';
    const trs = rows.map((r) => '<tr><td class="mono">' + r.link + '</td>'
      + '<td class="mono muted">' + esc(r.started) + '</td>'
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
    + 'sessionStorage, so a tab left open spans hours. <b>Rows</b> is what was stored, '
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
    const rows = await sql(apiToken, `SELECT timestamp, blob1 AS event, blob5 AS key,
             double1 AS secs, double2 AS sim, double3 AS mode, _sample_interval AS si
        FROM ${DATASET} WHERE blob4 = '${sid}' ORDER BY timestamp ASC LIMIT 500`);

    const trs = rows.map((r) => '<tr><td class="mono muted">' + esc(r.timestamp) + '</td>'
      + '<td class="mono">' + esc(r.event) + '</td>'
      + '<td>' + esc(detailOf(r)) + '</td>'
      + '<td class="num muted">' + (num(r.si) > 1 ? '×' + num(r.si) : '') + '</td></tr>').join('');

    const counts = {};
    rows.forEach((r) => { counts[r.event] = (counts[r.event] || 0) + 1; });
    const tiles = '<div class="tiles">' + Object.keys(counts).sort().map((k) =>
      '<div class="tile"><div class="v">' + counts[k] + '</div><div class="k">' + esc(k) + '</div></div>'
    ).join('') + '</div>';

    body = rows.length
      ? tiles + '<table><tr><th>Written (UTC)</th><th>Event</th><th>Detail</th>'
        + '<th class="num">Weight</th></tr>' + trs + '</table>'
      : '<p class="muted">(no rows — the session may have aged out of the 3-month retention)</p>';
  } catch (e) {
    body = errBlock(e.message);
  }

  return html(head
    + '<a class="backlink" href="' + backHref + '">&larr; all sessions</a>'
    + '<h1>Session <span class="mono">' + esc(sid) + '</span></h1>'
    + '<p class="muted"><b>“Written” is the batch flush, not the press.</b> Events are '
    + 'batched client-side, so a batch lands on one timestamp and the order within it is '
    + 'not necessarily the order the player did things. Commands and panel opens carry no '
    + 'time of their own. <b>Weight</b> marks a row that stood for more than one event — '
    + 'the rest were sampled away.</p>'
    + body + '</body></html>');
}
