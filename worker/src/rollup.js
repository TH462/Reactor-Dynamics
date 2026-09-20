/* Reactor Dynamics — the daily rollup. (#604)
 *
 * THE PROBLEM THIS SOLVES, AND WHY IT IS URGENT RATHER THAN NICE.
 *
 * Neither upstream keeps anything for long:
 *
 *   Web Analytics (traffic)   7 DAYS at full resolution. Older windows are answered
 *                             from a coarser pre-aggregated tier.
 *   Analytics Engine (in-sim) 3 MONTHS, fixed by Cloudflare and not configurable —
 *                             wrangler.toml records that as a feature, and for the raw
 *                             event stream it is. For trend it is a cliff.
 *
 * So the dashboard could not answer "is this growing" at all, and past a week it could
 * not answer "what happened on the 14th" either. Measured on the live account
 * 2026-09-02: a 30-day country x referrer x day query returns 12 rows and EVERY ONE
 * carries sampleInterval 10 — every figure rounded to the nearest 10, against a real
 * volume of 28 pageloads and 12 visits per week. A "10" may be one person.
 *
 * ⚠ THE INSIGHT THE WHOLE FILE TURNS ON: the coarse tier only penalises queries made
 * LATER. The same day, asked for inside the 7-day window, comes back exact. So a daily
 * job that snapshots yesterday while it is still inside that window keeps EXACT history
 * for ever. Nothing here is cleverer than being on time.
 *
 * That also means every day this job does not run is a day of exact history lost, and
 * lost permanently — the tier has already coarsened it by the time anyone notices. The
 * `sample_interval` column exists so that a late capture is VISIBLE rather than silently
 * stored as though it were exact.
 *
 * ---------------------------------------------------------------- what is stored
 * Aggregate counts only, keyed on dimensions Cloudflare already reports: date, country,
 * referrer, path, device, browser, OS, navigation type, bot flag. No identifier, no IP,
 * no session id, nothing that is one person. This is a strict subset of what the
 * analytics page has always displayed; the change is that we keep it, not that we see
 * more of it.
 *
 * RETENTION IS TWO YEARS *(OWNER RULING, 2026-09-02: "Cap it at 2 years, then roll off")*,
 * pruned by this same job. wrangler.toml's note on the R2 bucket — "an analytics store
 * with no expiry is a promise nobody made" — was written about session recordings, which
 * carry a player's words and a full trace; it is honoured here anyway rather than argued
 * around. `privacy.html` discloses the two years, and NOTHING GATES THAT: run_telemetry
 * binds the page to the Analytics Engine event schema and says nothing about retention or
 * about Web Analytics.
 */

import { etDay, etDayStartMs } from './render.js';
import { sql, gql, ACCOUNT, SITE_TAG, DATASET } from './cfapi.js';

/* Two years, in days, as the prune horizon. Expressed here rather than inline in the SQL
 * so the ruling has one home and the number cannot drift between the two tables. */
export const RETAIN_DAYS = 730;

/* WHEN OUR OWN EDGE COLUMNS STARTED EXISTING (2026-09-20). cfapi.js's COLUMNS_SINCE
 * idiom, applied to the columns worker/src/index.js appended on that date — blob9
 * (referrer host), blob10 (referrer kind), blob11 (country), blob12 (bot kind) and
 * double11 (bot). It lives here rather than in cfapi.js because this file is their only
 * consumer: the dashboard still reports the Cloudflare-derived series and nothing on
 * that page names these columns.
 *
 * WHY THIS VALUE IS SAFE. A column cannot appear on a row written before the code that
 * writes it was authored, and that was 2026-09-20; this floor is the following midnight,
 * so it errs LATE by up to a day rather than admitting one pre-column row. The usual
 * hazard with a hand-set floor is the opposite one — a floor below the deploy silently
 * drags pre-column rows in, where a short blobs array reads back as '' and a short
 * doubles array as 0, i.e. as "no referrer, not a bot" (cfapi.js measured exactly that
 * on the live dataset). That hazard does not apply here, and for a structural reason
 * rather than a lucky date: `ref_kind` is NEVER '' on a row this Worker writes, so a
 * pre-column row identifies itself and fetchOwnTraffic drops it whatever the floor says.
 * The floor's remaining job is to keep the scanned window small and to write the
 * boundary down.
 *
 * ⚠ A FLOOR CANNOT STOP A 422. Naming a column that no row in the result set carries is
 * an ERROR, not a null — so the probe query in fetchOwnTraffic runs first and a failure
 * is recorded as `own-columns-absent` instead of taking the day's run down with it.
 * Between this change landing and the Worker actually being deployed, that note is what
 * every run will carry, and it is the correct reading rather than a fault: the columns
 * are not live yet.
 *
 * Like cfapi.js's, this constant expires. Analytics Engine retention is a fixed three
 * months, so once no row older than 2026-12-21 survives, every remaining row carries the
 * columns and the floor and the probe can both be deleted. */
export const OWN_COLUMNS_SINCE_TS = '2026-09-21 00:00:00';
// The cast is required, not decorative: `timestamp >= '<string>'` is a 422 (cfapi.js).
export const OWN_COLUMNS_SINCE = `toDateTime('${OWN_COLUMNS_SINCE_TS}')`;

/* The dimension tuple each table is keyed on. `INSERT OR REPLACE` against these makes the
 * job IDEMPOTENT: a retry, a manual trigger, an overlapping schedule or a same-day re-run
 * rewrites the row instead of adding a second one. That is the failure this design is
 * most exposed to and the one that would be invisible in production — a double-counted
 * day looks exactly like a good day. */
const TRAFFIC_KEY = ['day', 'country', 'referrer_host', 'referrer_kind', 'path',
                     'device', 'browser', 'os', 'nav_type', 'bot'];
const USAGE_KEY = ['day', 'channel', 'release', 'event', 'key_str', 'plant'];
/* OUR OWN traffic series (2026-09-20), keyed on the dimensions the Cloudflare-derived
 * one is keyed on MINUS the three only a RUM beacon can see (browser, OS, navigation
 * type) and PLUS `channel`, which our stream has and Cloudflare's does not — without it
 * the test site's page views would be added to the production site's. `path` becomes
 * `page`, because the client sends a closed enum of page ids and never a path
 * (site/telemetry.js PAGES); that is a narrower fact on purpose and it is the one
 * invariant (d) permits. */
const OWN_KEY = ['day', 'channel', 'country', 'referrer_host', 'referrer_kind', 'page',
                 'bot', 'bot_kind'];

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS traffic_daily (
     day TEXT NOT NULL, country TEXT NOT NULL, referrer_host TEXT NOT NULL,
     referrer_kind TEXT NOT NULL, path TEXT NOT NULL, device TEXT NOT NULL,
     browser TEXT NOT NULL, os TEXT NOT NULL, nav_type TEXT NOT NULL, bot INTEGER NOT NULL,
     pageloads INTEGER NOT NULL, visits INTEGER NOT NULL, sample_interval INTEGER NOT NULL,
     PRIMARY KEY (${TRAFFIC_KEY.join(', ')}))`,
  `CREATE TABLE IF NOT EXISTS usage_daily (
     day TEXT NOT NULL, channel TEXT NOT NULL, release TEXT NOT NULL, event TEXT NOT NULL,
     key_str TEXT NOT NULL, plant TEXT NOT NULL,
     n INTEGER NOT NULL, sessions INTEGER NOT NULL,
     PRIMARY KEY (${USAGE_KEY.join(', ')}))`,
  /* A TABLE OF ITS OWN, AND NOT A SECOND WRITER INTO traffic_daily (2026-09-20).
   *
   * The two series measure the same thing by different means and are BOTH incomplete, in
   * opposite directions. traffic_daily comes from Cloudflare's injected RUM beacon, which
   * a content blocker removes — so it under-counts, and by an unknown amount that is
   * itself unmeasurable from inside it. own_traffic_daily comes from this site's own
   * telemetry POST, which is not blocked by the usual lists but only fires where
   * JavaScript runs and the visitor has not opted out.
   *
   * Merging them would destroy the only thing that makes either trustworthy: that each
   * is comparable WITH ITSELF over time. So they sit side by side and the difference
   * between them is the measurement. AUTHORITY DOES NOT MOVE IN THIS CHANGE — the
   * dashboard keeps reporting the Cloudflare numbers, and what decides whether it ever
   * stops is weeks of the two series next to each other, not this comment.
   *
   * ⚠ EXPECT THIS ONE TO READ HIGHER once it is live. It is not blocked, so a rise on the
   * day it starts working is the block rate becoming visible — it is NOT new traffic, and
   * anyone comparing a before and an after across that date will read it as growth.
   *
   * `views` rather than `pageloads`, and `sessions` rather than `visits`: different
   * words for deliberately different measurements. A "visit" is Cloudflare's own
   * attribution of a session to its landing page; `sessions` here is a count of distinct
   * sessionStorage ids that produced a row in that group, which is not the same rule and
   * must not be charted as though it were. */
  `CREATE TABLE IF NOT EXISTS own_traffic_daily (
     day TEXT NOT NULL, channel TEXT NOT NULL, country TEXT NOT NULL,
     referrer_host TEXT NOT NULL, referrer_kind TEXT NOT NULL, page TEXT NOT NULL,
     bot INTEGER NOT NULL, bot_kind TEXT NOT NULL,
     views INTEGER NOT NULL, sessions INTEGER NOT NULL,
     PRIMARY KEY (${OWN_KEY.join(', ')}))`,
  /* One row per completed run, so "did it run" and "was that day captured exact" are
   * answerable without inferring either from the presence of rows. A day with genuinely
   * no traffic writes no traffic rows, and is indistinguishable from a day the job never
   * ran unless something records the run itself. */
  `CREATE TABLE IF NOT EXISTS rollup_runs (
     day TEXT PRIMARY KEY, ran_at TEXT NOT NULL, traffic_rows INTEGER NOT NULL,
     usage_rows INTEGER NOT NULL, coarse INTEGER NOT NULL, note TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS traffic_day ON traffic_daily (day)`,
  `CREATE INDEX IF NOT EXISTS usage_day ON usage_daily (day)`,
  `CREATE INDEX IF NOT EXISTS own_traffic_day ON own_traffic_daily (day)`,
];

export async function ensureSchema(db) {
  for (const s of SCHEMA) await db.prepare(s).run();
}

/* WHICH EASTERN DAY A RUN OWNS. The dashboard renders Eastern days *(OWNER DIRECTIVE,
 * 2026-08-13: "I need all dates in times in my telemetry site to be in eastern time")* and
 * the stored history has to agree with it at the edges, or the same date means two
 * different 24-hour spans depending on which surface you read.
 *
 * So the window is built from `etDayStartMs`, the same two-pass DST-correct helper the
 * by-day table uses — not from a UTC midnight and not from a fixed offset. Its own
 * comment records that the obvious shortcut (sampling the zone offset at noon) is wrong on
 * exactly the two switch days a year, in opposite directions, and `run_dashboard_time.js`
 * pins all four cases so it cannot be simplified back.
 */
export function dayWindow(nowMs) {
  const startOfToday = etDayStartMs(nowMs);
  const start = etDayStartMs(startOfToday - 1);      // the Eastern day before this one
  return { day: etDay(start), fromMs: start, toMs: startOfToday };
}

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const num = (v) => (v == null || v === '' ? 0 : Number(v));

/* Our own hosts. A referrer equal to one of these is INTERNAL NAVIGATION, not discovery —
 * measured 2026-09-02, `reactordynamics.com` was the referrer on 6 of 12 rows over 30 days
 * and the page presented all of them as "where they came from". Derived from the row's own
 * requestHost rather than a literal so a new host (a preview domain, a rename) classifies
 * itself. */
export function referrerKind(refererHost, requestHost) {
  if (!refererHost) return 'direct';
  if (requestHost && refererHost === requestHost) return 'internal';
  if (/(^|\.)reactordynamics\.com$/i.test(refererHost)) return 'internal';
  if (/(^|\.)pages\.dev$/i.test(refererHost)) return 'internal';
  return 'external';
}

function trafficQuery(from, to, limit) {
  return `{ viewer { accounts(filter: {accountTag: "${ACCOUNT}"}) {
    rumPageloadEventsAdaptiveGroups(limit: ${limit},
      filter: {datetime_geq: "${from}", datetime_leq: "${to}", siteTag: "${SITE_TAG}"},
      orderBy: [count_DESC]) {
      count
      avg { sampleInterval }
      sum { visits }
      dimensions { countryName refererHost requestPath requestHost deviceType
                   userAgentBrowser userAgentOS navigationType bot }
    } } } }`;
}

/* One Eastern day of traffic, as rows ready for traffic_daily.
 *
 * ⚠ The `limit` must exceed the number of distinct dimension combinations in a day or the
 * tail is silently dropped and the day is stored short — with no error and no way to tell
 * later. 10000 is Cloudflare's ceiling and this site's daily traffic is two orders below
 * the number of combinations that could reach it; the run records `note: 'limit-hit'` if
 * the response ever comes back full, because a silent truncation is the one failure that
 * would make the stored history quietly wrong for ever. */
export async function fetchTraffic(token, win, gqlFn) {
  const LIMIT = 10000;
  const acct = await (gqlFn || gql)(token, trafficQuery(iso(win.fromMs), iso(win.toMs - 1), LIMIT));
  const groups = acct.rumPageloadEventsAdaptiveGroups || [];
  let coarse = 1;
  const rows = groups.map((r) => {
    const d = r.dimensions || {};
    const si = num((r.avg || {}).sampleInterval) || 1;
    if (si > coarse) coarse = si;
    return {
      day: win.day,
      country: d.countryName || '',
      referrer_host: d.refererHost || '',
      referrer_kind: referrerKind(d.refererHost, d.requestHost),
      path: d.requestPath || '',
      device: d.deviceType || '',
      browser: d.userAgentBrowser || '',
      os: d.userAgentOS || '',
      nav_type: d.navigationType || '',
      bot: d.bot ? 1 : 0,
      pageloads: num(r.count),
      visits: num((r.sum || {}).visits),
      sample_interval: si,
    };
  });
  return { rows, coarse, truncated: groups.length >= LIMIT };
}

/* One Eastern day of in-sim usage. `sum(_sample_interval)` and never `count()` — the
 * dataset is sampled and count() reports rows stored, not events that happened; the
 * analytics page carries the same rule in its header.
 *
 * The window is passed as a literal because Analytics Engine SQL has no parameter binding
 * (cfapi.js header). Both bounds come from `iso()` of a computed instant, so neither is
 * ever attacker-shaped — but they are still formatted here rather than concatenated from
 * anything a request supplies. */
export async function fetchUsage(token, win, sqlFn) {
  const from = iso(win.fromMs).replace('T', ' ').replace('Z', '');
  const to = iso(win.toMs).replace('T', ' ').replace('Z', '');
  const q = `SELECT blob1 AS event, blob2 AS channel, blob3 AS release,
                    blob5 AS key_str, blob6 AS plant,
                    sum(_sample_interval) AS n, count(DISTINCT blob4) AS sessions
             FROM ${DATASET}
             WHERE timestamp >= toDateTime('${from}') AND timestamp < toDateTime('${to}')
             GROUP BY event, channel, release, key_str, plant`;
  const data = await (sqlFn || sql)(token, q);
  return data.map((r) => ({
    day: win.day,
    channel: r.channel || '',
    release: r.release || '',
    event: r.event || '',
    key_str: r.key_str || '',
    plant: r.plant || '',
    n: num(r.n),
    sessions: num(r.sessions),
  }));
}

/* ONE EASTERN DAY OF OUR OWN PAGE VIEWS (2026-09-20).
 *
 * TWO QUERIES, NOT ONE, and the reason is a silent collision rather than tidiness. The
 * shell sends no `page_view` — its arrival is `session_start`, which carries more — so a
 * table built from page_view alone would have no row for the simulator itself, which is
 * the page the whole funnel is about. session_start is therefore folded in as
 * page = 'shell'. But its blob5 is the INITIAL STATE, not a page: grouped in the same
 * query, two starting conditions would map to the same primary key and `INSERT OR
 * REPLACE` would keep the last and drop the other's views, saying nothing. Grouping it
 * WITHOUT blob5 in a query of its own makes each group exact, and the two result sets
 * cannot collide because no page_view is ever 'shell'.
 *
 * `sum(_sample_interval)` and never `count()` — the dataset is sampled and count()
 * reports rows stored rather than events that happened (fetchUsage carries the same
 * rule, as does the analytics page's header).
 *
 * THE PROBE RUNS FIRST. Analytics Engine types columns PER RESULT SET, so naming a
 * column that no matching row carries is a 422 and not a null; between this landing and
 * the Worker being deployed that is every single day. A caught probe returns
 * `own-columns-absent` and no rows, which the run record keeps — a deploy gap then reads
 * as a reason instead of as a quiet day or a broken job. */
export async function fetchOwnTraffic(token, win, sqlFn) {
  const run = sqlFn || sql;
  const from = iso(win.fromMs).replace('T', ' ').replace('Z', '');
  const to = iso(win.toMs).replace('T', ' ').replace('Z', '');
  const where = `timestamp >= toDateTime('${from}') AND timestamp < toDateTime('${to}')`
    + ` AND timestamp >= ${OWN_COLUMNS_SINCE}`;
  const dims = `blob2 AS channel, blob9 AS ref_host, blob10 AS ref_kind,
                blob11 AS country, blob12 AS bot_kind, double11 AS bot`;
  const aggs = `sum(_sample_interval) AS n, count(DISTINCT blob4) AS sessions`;
  const grp = `channel, ref_host, ref_kind, country, bot_kind, bot`;

  try {
    await run(token, `SELECT blob10 AS ref_kind, double11 AS bot
                      FROM ${DATASET} WHERE ${where} LIMIT 1`);
  } catch (e) {
    return { rows: [], note: 'own-columns-absent' };
  }

  const views = await run(token,
    `SELECT blob5 AS page, ${dims}, ${aggs} FROM ${DATASET}
     WHERE ${where} AND blob1 = 'page_view' GROUP BY page, ${grp}`);
  const shell = await run(token,
    `SELECT ${dims}, ${aggs} FROM ${DATASET}
     WHERE ${where} AND blob1 = 'session_start' GROUP BY ${grp}`);

  /* A ROW WITH AN EMPTY ref_kind PREDATES THE COLUMNS and is dropped, not stored as a
   * direct visit from an unknown country. Every row this Worker writes carries one of
   * three non-empty kinds (worker/src/index.js), so this test is exact and needs no
   * clock — which is what makes the floor above a convenience rather than the guard. */
  let predating = 0;
  const rows = [];
  const take = (r, page) => {
    if (!r.ref_kind) { predating++; return; }
    rows.push({
      day: win.day,
      channel: r.channel || '',
      country: r.country || '',
      referrer_host: r.ref_host || '',
      referrer_kind: r.ref_kind,
      page: page,
      bot: num(r.bot) ? 1 : 0,
      bot_kind: r.bot_kind || '',
      views: num(r.n),
      sessions: num(r.sessions),
    });
  };
  views.forEach((r) => take(r, r.page || ''));
  shell.forEach((r) => take(r, 'shell'));
  return { rows, note: predating ? 'own-predating:' + predating : '' };
}

function upsert(db, table, key, rows) {
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
  return rows.map((r) => stmt.bind(...cols.map((c) => r[c])));
}

/* THE JOB. Returns a summary rather than throwing on a partial failure: one upstream being
 * down must not cost the other's day. A failure is recorded in `rollup_runs.note` so a
 * missing day has a reason attached instead of being an unexplained hole. */
export async function runRollup(env, nowMs, deps) {
  /* `deps` injects the two transports. Production passes nothing and gets cfapi's; the gate
   * passes fakes, because the thing worth testing is what this job ASKS FOR and what it
   * writes twice — not Cloudflare's behaviour, which a test could not exercise anyway.
   * An argument rather than a mutable module-level seam: no hidden state to leak between
   * cases, and the production path has no branch in it. */
  deps = deps || {};
  const db = env.STATS;
  const token = env.CF_ANALYTICS_TOKEN;
  const win = dayWindow(nowMs == null ? Date.now() : nowMs);
  const out = { day: win.day, traffic_rows: 0, usage_rows: 0, own_rows: 0, coarse: 1, notes: [] };
  if (!db) { out.notes.push('no STATS binding'); return out; }

  await ensureSchema(db);
  const batch = [];

  /* A missing token is a run that CANNOT PROCEED, not a run that never happened — the
   * `rollup_runs` row below still gets written with the reason, same as a run whose fetch
   * throws. Returning early here (as this used to) skipped `ensureSchema` and the whole
   * batch, so an expired token produced total silence: no row, no note, nothing for
   * `scheduled()` to log (it deliberately logs nothing either). The `!db` guard above stays
   * an early return — with no D1 binding there is genuinely nothing to write to. */
  if (!token) {
    out.notes.push('no CF_ANALYTICS_TOKEN');
  } else {
    try {
      const t = await fetchTraffic(token, win, deps.gql);
      out.traffic_rows = t.rows.length;
      out.coarse = t.coarse;
      if (t.truncated) out.notes.push('limit-hit');
      /* A coarse capture is STORED AND MARKED, never dropped and never passed off as exact.
       * Dropping it would leave a hole that reads as "no traffic"; storing it silently would
       * put rounded numbers into the one place that is supposed to be exact. */
      if (t.coarse > 1) out.notes.push('coarse:' + t.coarse);
      batch.push(...upsert(db, 'traffic_daily', TRAFFIC_KEY, t.rows));
    } catch (e) { out.notes.push('traffic failed: ' + String(e.message || e).slice(0, 120)); }

    try {
      const u = await fetchUsage(token, win, deps.sql);
      out.usage_rows = u.length;
      batch.push(...upsert(db, 'usage_daily', USAGE_KEY, u));
    } catch (e) { out.notes.push('usage failed: ' + String(e.message || e).slice(0, 120)); }

    /* OUR OWN traffic, into its own table (2026-09-20). A third fetch and a third
     * upsert, deliberately NOT a second writer into traffic_daily — see the schema.
     *
     * `own:N` is pushed UNCONDITIONALLY, success or failure, because rollup_runs gained
     * no column for it: `CREATE TABLE IF NOT EXISTS` does not add a column to a table
     * that already exists in the live database, and there is no migration step here. So
     * the count rides in the note, where `own:0` beside `own-columns-absent` is a
     * different fact from a bare `own:0`, and both are different from the note being
     * absent entirely — which would mean this code never ran. */
    try {
      const o = await fetchOwnTraffic(token, win, deps.sql);
      out.own_rows = o.rows.length;
      if (o.note) out.notes.push(o.note);
      batch.push(...upsert(db, 'own_traffic_daily', OWN_KEY, o.rows));
    } catch (e) { out.notes.push('own traffic failed: ' + String(e.message || e).slice(0, 120)); }
    out.notes.push('own:' + out.own_rows);
  }

  batch.push(db.prepare(
    `INSERT OR REPLACE INTO rollup_runs (day, ran_at, traffic_rows, usage_rows, coarse, note)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(win.day, iso(nowMs == null ? Date.now() : nowMs),
         out.traffic_rows, out.usage_rows, out.coarse, out.notes.join('; ')));

  /* Prune inside the same batch: retention is a property of the store, not a separate
   * job that can be forgotten or fail on its own. */
  const horizon = etDay(win.fromMs - RETAIN_DAYS * 86400000);
  batch.push(db.prepare('DELETE FROM traffic_daily WHERE day < ?').bind(horizon));
  batch.push(db.prepare('DELETE FROM usage_daily WHERE day < ?').bind(horizon));
  batch.push(db.prepare('DELETE FROM own_traffic_daily WHERE day < ?').bind(horizon));
  batch.push(db.prepare('DELETE FROM rollup_runs WHERE day < ?').bind(horizon));
  out.pruned_before = horizon;

  await db.batch(batch);
  return out;
}
