/* Reactor Dynamics — the READ side of the first-party daily store. (#764, Unit 2a)
 *
 * `rollup.js` writes `traffic_daily`, `usage_daily` and `rollup_runs` every night and
 * NOTHING HAS EVER READ THEM: before this file, `env.STATS` appeared in exactly one
 * module, the writer. Every table the operator stares at still queries Cloudflare, which
 * rounds to the nearest 10 past seven days. This module is the other half of that job.
 *
 * It renders nothing. It answers questions about the store, and it is written to make the
 * five readings that have already been wrong once IMPOSSIBLE to produce accidentally.
 *
 * ------------------------------------------------------------------ 1. A MISSING DAY IS
 * NOT A QUIET DAY. A day with genuinely no traffic writes no `traffic_daily` rows. A day
 * the cron never ran also writes none. The two are indistinguishable from `traffic_daily`
 * alone, and drawing them the same way is a lie about traffic in the one direction nobody
 * checks — an outage reads as a collapse in interest. `rollup_runs` has one row per
 * completed run and is the ONLY thing that tells them apart, so `dailyTotals` reads it on
 * every call and returns `missing` beside every count. A run that recorded a traffic
 * failure in its note counts as MISSING too: the run happened, the day did not get
 * captured, and "the job ran" is not the question anyone is asking.
 *
 * ------------------------------------------------------------------ 2. A COARSE DAY MUST
 * NOT BE AVERAGED IN. A day captured late comes back from Cloudflare's coarse tier rounded
 * to the nearest 10 and is stored with `sample_interval > 1` (rollup.js stores it AND marks
 * it, deliberately, rather than dropping it). Against a real volume of about 5 landing
 * visits a day, one such day is a doubled bar and a blown weekly mean. So `dailyTotals`
 * marks it and `trailingMean` returns null for any window containing one, rather than
 * blending a rounded figure with exact ones and printing the result to two decimals.
 *
 * ------------------------------------------------------------------ 3. THE COMPARISON
 * REFUSES RATHER THAN MISLEADS. The store began about 2026-09-01 (rollup.js landed
 * 2026-09-02, commit c9890552, capturing the prior day). A period-over-period figure whose
 * prior window predates that is not growth, it is the store starting — and it prints as
 * several hundred percent. `periodDelta` returns `{ok:false, reason}` for that, for a prior
 * window holding any coarse or uncaptured day, and for a prior total of zero (which is a
 * division by zero wearing a percent sign). It never returns Infinity and never returns a
 * number it cannot stand behind.
 *
 * ------------------------------------------------------------------ 4. `usage_daily.
 * sessions` IS NOT ADDITIVE, AND THIS FILE MAKES THAT UNAVAILABLE RATHER THAN DOCUMENTED.
 * The column is `count(DISTINCT blob4)` per `(day, channel, release, event, key_str,
 * plant)` (rollup.js `fetchUsage`). One session that fires `session_start` and four feature
 * events lands in FIVE rows, so a SUM across events, or across days, counts that session
 * five times and reports it as five sessions. The schema cannot answer unique-sessions-
 * per-period at all — no amount of SQL recovers a distinct count from pre-aggregated
 * distinct counts. `usageTotals` therefore exposes `n` (which IS additive: it is
 * `sum(_sample_interval)`) and no `sessions` key at all, `sessionsInPeriod` throws with the
 * reason instead of returning a plausible wrong number, and `NON_ADDITIVE` names the column
 * so a caller reaching for it finds the explanation before the bug.
 *
 * ------------------------------------------------------------------ 5. EVERY VALUE IS
 * BOUND. D1 supports `?` parameters, so there is no excuse here for the string
 * interpolation cfapi.js is forced into (Analytics Engine SQL has no binding). Days,
 * limits — all bound. The one thing that cannot be bound is a COLUMN NAME, which is what
 * `groupBy`'s `dim` selects, so it is validated against a hard-coded allowlist with an own-
 * property check and throws on anything else. `parseDay` is strict for the same reason:
 * the day strings become part of a SQL range, and an `<input type="date">` is a suggestion
 * to the browser, not a constraint on the request.
 *
 * ------------------------------------------------------------------ EASTERN DAYS.
 * Every `from`/`to` here is an inclusive Eastern calendar day, "YYYY-MM-DD", the same grain
 * the rollup stores and the dashboard prints *(OWNER DIRECTIVE, 2026-08-13: "I need all
 * dates in times in my telemetry site to be in eastern time")*. Day arithmetic goes through
 * `etDayStartMs`, never through a fixed 4- or 5-hour offset and never by subtracting
 * 86,400,000 ms: a window spanning a daylight-saving switch is 23 or 25 hours long.
 *
 * ⚠ `dayStartMs` anchors at NOON UTC before calling `etDayStartMs`, and that is NOT the
 * forbidden shortcut render.js warns about. The forbidden one samples the ZONE OFFSET at
 * noon and is wrong on the two switch days in opposite directions. This one only needs an
 * instant that is unambiguously inside the wanted Eastern day — noon UTC is 07:00 or 08:00
 * Eastern, always the same date — and then hands it to the two-pass helper, which reads the
 * offset correctly at the boundary. Feeding a bare "YYYY-MM-DD" to `etDayStartMs` directly
 * would be the real bug: it parses as midnight UTC, which is 19:00 or 20:00 the PREVIOUS
 * Eastern day, and every day would silently shift back one.
 *
 * BOTS ARE EXCLUDED from every traffic figure this module returns (`bot = 0`), with ONE
 * deliberate exemption: `groupBy('bot', …)`, where filtering the column you are grouping
 * by could only ever return a single row. The reasoning is at that function. The
 * dashboard's numbers have always been quoted bots-excluded; the store keeps the flag so
 * the choice is made here rather than at ingest.
 */

import { etDay, etDayStartMs } from './render.js';

/* ---------------------------------------------------------------- the non-additive column
 *
 * Exported as data rather than as a comment so the reason travels with the name: a caller
 * that reaches for unique sessions per period gets this text, not a plausible number. */
export const NON_ADDITIVE = Object.freeze({
  table: 'usage_daily',
  column: 'sessions',
  additive: 'n',
  reason: 'usage_daily.sessions is count(DISTINCT blob4) per (day, channel, release, '
    + 'event, key_str, plant). One session firing session_start plus four feature events '
    + 'lands in five rows, so summing it across events or days over-counts that session '
    + 'five times. The schema cannot answer unique sessions per period at all — take that '
    + 'live from Analytics Engine (3-month ceiling) and say so on the page. `n` is '
    + 'sum(_sample_interval) and IS additive.',
});

/* The dimensions `groupBy` may select. A COLUMN NAME cannot be bound as a parameter, so
 * this map is the whole defence: the key is what a request may name, the value is the
 * column that reaches the SQL, and nothing else does. An own-property lookup, so
 * `constructor`, `__proto__` and `toString` are not dimensions.
 *
 * ALL NINE COLUMNS `traffic_daily` KEYS ON ARE HERE. The first cut stopped at seven and
 * left out `nav_type` and `bot`, which is not a tidy subset — it is two breakdown sections
 * on the analytics page ("how the page was reached", "host and bots") that could not leave
 * Cloudflare, so they went on printing figures rounded to the nearest 10 underneath an
 * exact chart. A dimension missing from this map is a section of the page that cannot be
 * migrated, so the map tracks `rollup.js`'s TRAFFIC_KEY rather than what a caller has
 * needed so far. */
const DIMS = Object.freeze({
  country: 'country',
  referrer_host: 'referrer_host',
  referrer_kind: 'referrer_kind',
  path: 'path',
  device: 'device',
  browser: 'browser',
  os: 'os',
  nav_type: 'nav_type',
  bot: 'bot',
});

/* `bot` is the one dimension stored as an INTEGER, and it stays one: the key comes back as
 * the number 0 or 1, not the string "0". Stringifying it would hand the page a value that
 * compares false against the 0 it stores and true against a "0" it never has, and the page
 * is the half that decides what to call the two rows — labels are presentation, and this
 * module has no business inventing "human"/"crawler". */
const NUMERIC_DIMS = Object.freeze({ bot: true });

export const DIMENSIONS = Object.freeze(Object.keys(DIMS));

/* Retention is 730 days (rollup.js RETAIN_DAYS), so nothing legitimate asks for more. The
 * cap exists because `dayRange` walks the range one day at a time and a typo'd year would
 * otherwise walk for a million iterations inside a Worker's CPU budget. */
export const MAX_SPAN_DAYS = 800;

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? 0 : Number(v));

// D1 returns {results:[...]} from .all(); be tolerant of a bare array so a stub or a future
// client shape does not silently read as zero rows.
function rowsOf(r) {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  return Array.isArray(r.results) ? r.results : [];
}

/* ---------------------------------------------------------------- days
 *
 * STRICT, because this string becomes part of a SQL range and reaches a bound parameter
 * only if it gets past here. It also has to be a real calendar date: "2026-02-30" matches
 * the shape, and a Date would roll it silently to March 2nd, so the round-trip check is
 * what rejects it. Returns the canonical day or null — never throws, so a caller can offer
 * a message instead of a stack trace. */
export function parseDay(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const y = +t.slice(0, 4), m = +t.slice(5, 7), d = +t.slice(8, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return t;
}

function mustDay(where, s) {
  const d = parseDay(s);
  if (!d) throw new Error(where + ': not an Eastern day "YYYY-MM-DD": ' + JSON.stringify(String(s)).slice(0, 48));
  return d;
}

/* The UTC instant at which an Eastern calendar day began. See the ⚠ in the header for why
 * the noon anchor is here and why it is not the shortcut render.js forbids. */
export function dayStartMs(day) {
  const d = mustDay('stats.dayStartMs', day);
  return etDayStartMs(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), 12, 0, 0));
}

// The Eastern day before this one: one millisecond before its start is in it, whatever the
// day's length.
export function prevDay(day) {
  return etDay(dayStartMs(day) - 1);
}

// …and the one after. +25 h clears the longest possible day (the 25-hour fall-back day,
// where it lands exactly on the next midnight) and overshoots the shortest by 2 h, which
// cannot reach the day after next because no day is shorter than 23 h.
export function nextDay(day) {
  return etDay(dayStartMs(day) + 25 * 3600 * 1000);
}

// Every Eastern calendar day in [from, to], inclusive and ascending. Walked rather than
// computed so a 23- or 25-hour day costs nothing to get right.
export function dayRange(from, to) {
  const a = mustDay('stats.dayRange', from);
  const b = mustDay('stats.dayRange', to);
  if (a > b) throw new Error('stats.dayRange: the range ends before it begins: ' + a + ' .. ' + b);
  const out = [];
  let d = a;
  while (d <= b) {
    out.push(d);
    if (out.length > MAX_SPAN_DAYS) {
      throw new Error('stats.dayRange: more than ' + MAX_SPAN_DAYS + ' days asked for (' + a + ' .. ' + b + '); retention is 730');
    }
    d = nextDay(d);
  }
  return out;
}

/* The equal-length window immediately preceding [from, to], with no overlap and no gap.
 * Counted in EASTERN DAYS — the arithmetic that looks equivalent (subtract length × 864e5
 * from the start instant) drifts an hour at every switch and eventually lands a day out. */
export function priorRange(from, to) {
  const days = dayRange(from, to);
  const pto = prevDay(days[0]);
  let pfrom = pto;
  for (let i = 1; i < days.length; i++) pfrom = prevDay(pfrom);
  return { from: pfrom, to: pto };
}

/* ---------------------------------------------------------------- the store
 *
 * How far back the recorded history actually goes. The picker clamps to this and the page
 * prints it: picking a day before the store returns zero rows, and zero rows draw as ZERO
 * TRAFFIC rather than as NO DATA unless something says where the data begins. */
export async function storeRange(db) {
  const r = await db.prepare(
    'SELECT MIN(day) AS first, MAX(day) AS last FROM traffic_daily').all();
  const row = rowsOf(r)[0];
  if (!row || row.first == null || row.first === '') return null;
  return { first: String(row.first), last: String(row.last) };
}

/* ONE ROW PER CALENDAR DAY in [from, to], ascending, with no gaps — a day with no rows in
 * the store still gets a row here, and it carries the flag that says which kind of nothing
 * it is. Callers render the array directly; a caller that has to reason about holes will
 * get it wrong eventually.
 *
 *   { day, pageloads, visits, coarse, missing, truncated }
 *
 * `coarse`    any contributing row was captured from the rounded tier (sample_interval > 1),
 *             or the run itself recorded a coarse capture.
 * `missing`   no rollup run completed for that day, or the run recorded a traffic failure.
 *             NOT the same as zero: a real zero day is {0, 0, missing:false}.
 * `truncated` the capture hit Cloudflare's 10,000-combination ceiling and the day is stored
 *             short. Rare, and separate from coarse because it is a different lie. */
export async function dailyTotals(db, from, to) {
  const days = dayRange(from, to);
  const f = days[0], t = days[days.length - 1];

  const agg = await db.prepare(
    'SELECT day AS day, SUM(pageloads) AS pageloads, SUM(visits) AS visits,'
    + ' MAX(sample_interval) AS si FROM traffic_daily'
    + ' WHERE day >= ? AND day <= ? AND bot = 0 GROUP BY day').bind(f, t).all();
  const runs = await db.prepare(
    'SELECT day AS day, traffic_rows AS traffic_rows, coarse AS coarse, note AS note'
    + ' FROM rollup_runs WHERE day >= ? AND day <= ?').bind(f, t).all();

  const byDay = new Map();
  for (const r of rowsOf(agg)) byDay.set(String(r.day), r);
  const runBy = new Map();
  for (const r of rowsOf(runs)) runBy.set(String(r.day), r);

  return days.map((day) => {
    const a = byDay.get(day);
    const run = runBy.get(day);
    const note = run ? String(run.note == null ? '' : run.note) : '';
    const failed = /traffic failed/i.test(note);
    return {
      day,
      pageloads: a ? num(a.pageloads) : 0,
      visits: a ? num(a.visits) : 0,
      coarse: (a ? num(a.si) : 1) > 1 || (run ? num(run.coarse) : 1) > 1,
      missing: !run || failed,
      truncated: /limit-hit/.test(note),
    };
  });
}

/* Top `limit` values of one dimension over [from, to], descending by pageloads.
 *
 * `coarse` is per KEY, not per day: a country whose only appearance in the window is on a
 * rounded day is a rounded row, and saying so is the difference between "France: 10" and
 * "France: 10, and that 10 may be one person".
 *
 * ⚠ GROUPING BY `bot` DROPS THE `bot = 0` FILTER. Every other dimension is answered
 * bots-excluded, but filtering a column to one value and then grouping by that same column
 * is a contradiction: it can only ever return one row, and one row of real-looking data is
 * a worse answer than an error because nothing about it says it is incomplete. So the
 * filter is skipped exactly when the dimension IS the filter's own column, and `bot` is
 * the only dimension that returns bot traffic. The alternative considered and rejected was
 * an `includeBots` flag: a second way to ask, which a caller has to know to pass, on a
 * question that has only one sensible answer. `run_dashboard_stats.js` pins this. */
export async function groupBy(db, dim, from, to, limit) {
  const col = Object.prototype.hasOwnProperty.call(DIMS, dim) ? DIMS[dim] : null;
  if (!col) {
    throw new Error('stats.groupBy: unknown dimension ' + JSON.stringify(String(dim)).slice(0, 64)
      + ' — a column name cannot be bound as a parameter, so it must be one of: '
      + DIMENSIONS.join(', '));
  }
  const days = dayRange(from, to);
  const lim = Math.max(1, Math.min(1000, Math.floor(Number(limit)) || 20));
  const humans = col === 'bot' ? '' : ' AND bot = 0';
  const r = await db.prepare(
    'SELECT ' + col + ' AS key, SUM(pageloads) AS pageloads, SUM(visits) AS visits,'
    + ' MAX(sample_interval) AS si FROM traffic_daily'
    + ' WHERE day >= ? AND day <= ?' + humans
    + ' GROUP BY ' + col + ' ORDER BY pageloads DESC LIMIT ?')
    .bind(days[0], days[days.length - 1], lim).all();
  return rowsOf(r).map((x) => ({
    key: NUMERIC_DIMS[dim] ? num(x.key) : (x.key == null ? '' : String(x.key)),
    pageloads: num(x.pageloads),
    visits: num(x.visits),
    coarse: num(x.si) > 1,
  }));
}

/* REFERRER HOST **AND** THE KIND IT WAS CLASSIFIED AS, in one row.
 *
 * `groupBy('referrer_host', …)` cannot carry a second column through, so a page that wants
 * both has to recompute the kind from the host alone — and `rollup.js`'s `referrerKind`
 * takes TWO arguments. Called with `requestHost` null it loses its first and strongest
 * rule, `refererHost === requestHost`, and falls back to a suffix test against
 * reactordynamics.com and *.pages.dev.
 *
 * On today's data those agree, which is exactly what makes it dangerous: the case the
 * exact-match rule exists for is A HOST NOBODY HAS SEEN YET — a preview domain, a rename —
 * and recomputation classifies it `external`, i.e. as DISCOVERY. That is the #604 finding
 * inverted: our own host presented as "where they came from", which it was on 6 of 12 rows
 * before the classification existed.
 *
 * Nothing needs recomputing. The kind is already stored, computed at rollup time with the
 * real `requestHost` in hand. This reader just hands both columns over together.
 *
 *   -> [{ host, kind, pageloads, visits, coarse }] descending by pageloads
 *
 * A dedicated reader rather than a general two-column grouper: two columns is the only
 * pairing anything needs, and a generic one would need a second allowlist and a second
 * ordering rule to prove. */
export async function referrerBreakdown(db, from, to, limit) {
  const days = dayRange(from, to);
  const lim = Math.max(1, Math.min(1000, Math.floor(Number(limit)) || 20));
  const r = await db.prepare(
    'SELECT referrer_host AS host, referrer_kind AS kind, SUM(pageloads) AS pageloads,'
    + ' SUM(visits) AS visits, MAX(sample_interval) AS si FROM traffic_daily'
    + ' WHERE day >= ? AND day <= ? AND bot = 0'
    + ' GROUP BY referrer_host, referrer_kind ORDER BY pageloads DESC LIMIT ?')
    .bind(days[0], days[days.length - 1], lim).all();
  return rowsOf(r).map((x) => ({
    host: x.host == null ? '' : String(x.host),
    kind: x.kind == null ? '' : String(x.kind),
    pageloads: num(x.pageloads),
    visits: num(x.visits),
    coarse: num(x.si) > 1,
  }));
}

/* ---------------------------------------------------------------- in-sim usage
 *
 * `n` ONLY. See NON_ADDITIVE: the `sessions` column is a pre-aggregated distinct count and
 * summing it is the exact class of false reading #764 was opened about, so this reader does
 * not select it, does not return it, and there is no option to. */
export async function usageTotals(db, from, to, limit) {
  const days = dayRange(from, to);
  const lim = Math.max(1, Math.min(1000, Math.floor(Number(limit)) || 50));
  const r = await db.prepare(
    'SELECT event AS event, key_str AS key_str, plant AS plant, SUM(n) AS n'
    + ' FROM usage_daily WHERE day >= ? AND day <= ?'
    + ' GROUP BY event, key_str, plant ORDER BY n DESC LIMIT ?')
    .bind(days[0], days[days.length - 1], lim).all();
  return rowsOf(r).map((x) => ({
    event: x.event == null ? '' : String(x.event),
    key: x.key_str == null ? '' : String(x.key_str),
    plant: x.plant == null ? '' : String(x.plant),
    n: num(x.n),
  }));
}

/* The function a caller will look for, existing only so that the search ends in an
 * explanation rather than in `SUM(sessions)` written by hand at the call site. */
export function sessionsInPeriod() {
  throw new Error('stats.sessionsInPeriod: not answerable from the store. ' + NON_ADDITIVE.reason);
}

/* ---------------------------------------------------------------- trend
 *
 * A trailing mean over `window` days of `dailyTotals` rows, aligned to the last day of each
 * window. `mean` is null until the window is full AND null for any window containing a
 * coarse or uncaptured day: at about 5 landing visits a day, one figure rounded to the
 * nearest 10 moves a 7-day mean by more than the weekday effect the line exists to remove.
 * A gap in the line is readable; a bent line is not.
 *
 * Defaults to `visits` (landing visits), the headline grain — pass 'pageloads' for the
 * other series. */
export function trailingMean(days, window, metric) {
  const rows = days || [];
  const w = Math.floor(Number(window));
  if (!(w >= 1)) throw new Error('stats.trailingMean: window must be a whole number of days >= 1');
  const key = metric || 'visits';
  return rows.map((r, i) => {
    if (i + 1 < w) return { day: r.day, mean: null };
    const win = rows.slice(i + 1 - w, i + 1);
    if (win.some((x) => x.coarse || x.missing)) return { day: r.day, mean: null };
    const sum = win.reduce((s, x) => s + num(x[key]), 0);
    return { day: r.day, mean: Math.round((sum / w) * 100) / 100 };
  });
}

const refuse = (reason) => ({ ok: false, reason });

/* PERIOD OVER PERIOD, or an honest refusal.
 *
 * `curTotal` is the headline figure the caller is already printing; `prevSeries` and
 * `curSeries` are `dailyTotals` arrays for the prior and selected windows, and they are
 * here to be JUDGED, not only summed — the prior total comes from `prevSeries`, and the
 * quality flags on both decide whether a percentage may be printed at all.
 *
 * `opts.storeFirst` is `storeRange().first`. Pass it: a prior window that predates the
 * store is already caught as uncaptured days, but the reason the operator needs to read is
 * "the history does not go back that far", not "the cron missed seven days".
 *
 * A window ending TODAY: today has no rollup run, so it arrives `missing` and would refuse
 * the whole comparison. The caller that draws today live from Cloudflare hands its row in
 * with `missing:false, coarse:false` — that is a deliberate statement that the figure is
 * exact, not a default.
 *
 * `pct` is signed and rounded to one decimal; `direction` is up / down / flat. Renderers
 * that print "up 17%" use the direction and the magnitude. */
export function periodDelta(curTotal, prevSeries, curSeries, opts) {
  const o = opts || {};
  const metric = o.metric || 'visits';
  const prev = prevSeries || [];
  const cur = curSeries || [];

  if (!prev.length) return refuse('there is no prior period to compare against');

  const first = parseDay(o.storeFirst);
  if (first && String(prev[0].day) < first) {
    return refuse('the prior period begins ' + prev[0].day + ', before the recorded history begins ' + first);
  }

  const pMissing = prev.filter((r) => r.missing);
  if (pMissing.length) {
    return refuse('the prior period has ' + pMissing.length + ' uncaptured day(s) — ' + pMissing[0].day);
  }
  const pCoarse = prev.filter((r) => r.coarse);
  if (pCoarse.length) {
    return refuse('the prior period has ' + pCoarse.length + ' day(s) rounded to the nearest 10 — ' + pCoarse[0].day);
  }
  const cMissing = cur.filter((r) => r.missing);
  if (cMissing.length) {
    return refuse('the selected period has ' + cMissing.length + ' uncaptured day(s) — ' + cMissing[0].day);
  }
  const cCoarse = cur.filter((r) => r.coarse);
  if (cCoarse.length) {
    return refuse('the selected period has ' + cCoarse.length + ' day(s) rounded to the nearest 10 — ' + cCoarse[0].day);
  }

  const prevTotal = prev.reduce((s, r) => s + num(r[metric]), 0);
  if (!(prevTotal > 0)) return refuse('no traffic in the prior period');

  const now = Number(curTotal);
  if (!Number.isFinite(now)) return refuse('the current total is not a number');

  const pct = Math.round(((now - prevTotal) / prevTotal) * 1000) / 10;
  return {
    ok: true,
    pct,
    direction: pct > 0 ? 'up' : (pct < 0 ? 'down' : 'flat'),
    prevTotal,
    curTotal: now,
  };
}
