/*
 * run_dashboard_trend.js — the arbitrary window + trend rewrite of the Analytics view
 * (#764 Unit 2b: `worker/src/analytics.js`, and `barChart`/`bucketDays`/`lineChart` in
 * `render.js`).
 *
 * THE TWO THINGS THE OWNER ASKED FOR (2026-09-18): pick an arbitrary date range instead of
 * fixed 7/14/30 presets, and see a trend line, not just a level. Both only became possible
 * once Unit 2a (`stats.js`) gave this page a first-party reader for `traffic_daily` — this
 * file is what plugs that reader into the page, and everything it guards is a way that
 * plumbing goes silently wrong while still rendering a plausible page:
 *
 *   1. CLOSED DAYS READ FROM CLOUDFLARE INSTEAD OF THE STORE. Cloudflare rounds to the
 *      nearest 10 past 7 days; the whole point of Unit 2a was to stop doing that. A wiring
 *      slip that drops the first-party read reads as a page that still loads — with the
 *      wrong numbers, or with zero.
 *   2. TODAY DRAWN SOLID, OR NOT DRAWN LIVE AT ALL. The nightly rollup captures YESTERDAY,
 *      so today has no first-party row. Drawing it solid makes every morning look like a
 *      collapse; not fetching it live means the page can never answer "how is today going".
 *   3. A BAD OR OUT-OF-RANGE DATE DRAWS AS ZERO TRAFFIC. An `<input type="date">` is a
 *      suggestion to the browser, not a constraint on the request, and a date before the
 *      store returns zero rows — indistinguishable from "nothing happened" unless the page
 *      says which one it is.
 *   4. A COARSE OR MISSING DAY BLENDS IN. At about 5 landing visits a day, one Cloudflare-
 *      rounded day is a doubled bar, and a day the cron never ran is not a quiet day.
 *   5. A REFUSED COMPARISON PRINTS A NUMBER ANYWAY. `stats.periodDelta` refuses rather than
 *      dividing by a store that has not existed long enough to compare against; the page's
 *      OWN rendering has to honour that refusal rather than reaching for `.pct` regardless.
 *   6. THE TREND LINE JOINS THROUGH A GAP. A null trailing mean means "not enough data", not
 *      zero — drawing a line through it shows a dip that never happened.
 *   7. `bucketDays` DRAWS TOO MANY BARS. The old signature took a `days` count and switched
 *      to weekly above 7 because every caller's `days` and row count were the same number;
 *      an arbitrary range has no such guarantee, and a wrong bucket size draws either a wall
 *      of hairline bars or a chart with almost nothing on it. (2026-09-20: `bucketDays` no
 *      longer buckets AT ALL — see #10 below for what replaced it.)
 *   8. A LEGACY `?days=N` LINK STOPS RESOLVING, or resolves to the wrong span.
 *   9. A CREDENTIAL IN A HREF. Unit 1 moved auth off the URL account-wide; this file adds a
 *      new picker with its own hrefs, which is a new place for the old mistake to recur.
 *  10. THE LINE JOINS THROUGH A MISSING DAY (2026-09-20, owner: "for the 30 day and all can
 *      you make them a line graph and show data from every day not the weekly average").
 *      Past 14 days the by-day chart is now `lineChart`, one point per day, not folded bars
 *      — and a missing day's STORED value is 0, not null, so the same "joins through as a
 *      drop to zero" trap as #6 applies to the DATA series too, not just the trend line; it
 *      needs its own break-by-`missing` logic (value-based nulling would draw a REAL zero
 *      day as a gap, which is the opposite defect) and its own visible mark at the gap.
 *
 * NO NETWORK. `cfapi.js` is replaced wholesale by a fake `gql` that dispatches on the query
 * TEXT (most specific first) and returns canned, already-unwrapped rows — the same idiom
 * `run_usage_page.js` established for this exact problem. The first-party store is the same
 * in-memory D1 stub `run_dashboard_stats.js` uses (prepare/bind/all over seeded tables).
 * `Date.now` is monkey-patched to a fixed instant so "today" is a known value.
 *
 * ⚠ EVERY CHECK BELOW ASSERTS ON RENDERED OUTPUT, never on a call being made in isolation —
 * a source scan for a string cannot prove it is reachable (#485), and the query-shape
 * assertions here exist alongside the render assertions, not instead of them.
 *
 *   node test/run_dashboard_trend.js
 *   node test/run_dashboard_trend.js --inject=<name>
 *   node test/run_dashboard_trend.js --list-injections
 */
'use strict';
var path = require('path');
var fs = require('fs');

var BOLD = '\x1b[1m', RED = '\x1b[31m', GREEN = '\x1b[32m', RST = '\x1b[0m';
var nPass = 0, nFail = 0;
function ck(name, cond, note) {
  var ok = !!cond;
  if (ok) nPass++; else nFail++;
  console.log((ok ? '  ' + GREEN + 'PASS' + RST + '  ' : '  ' + RED + 'FAIL' + RST + '  ') + name +
    (note ? '  -- ' + note : ''));
  return ok;
}
function head(s) { console.log('\n' + BOLD + s + RST); }

// ---------------------------------------------------------------- the D1 stub
// Identical shape to run_dashboard_stats.js's stub (prepare/bind/all over an interpreter
// that understands exactly the statements stats.js issues). Not shared code — each gate in
// this repo is self-contained — but deliberately the SAME interpreter, so a divergence here
// would itself be a defect worth finding.
function makeDb() {
  var tables = { traffic_daily: [], usage_daily: [], rollup_runs: [] };

  function lit(tok, args, i) {
    if (tok === '?') return { v: args[i.n++] };
    var m = /^'(.*)'$/.exec(tok);
    if (m) return { v: m[1] };
    if (/^-?\d+$/.test(tok)) return { v: Number(tok) };
    throw new Error('D1 stub: unparseable value ' + tok);
  }
  function parse(sql) {
    var s = String(sql).replace(/\s+/g, ' ').trim();
    var m = /^SELECT (.+?) FROM (\w+)(.*)$/i.exec(s);
    if (!m) throw new Error('D1 stub understands SELECT only: ' + s.slice(0, 60));
    var rest = m[3] || '';
    var mw = / WHERE (.+?)(?= GROUP BY | ORDER BY | LIMIT |$)/i.exec(rest);
    var mg = / GROUP BY (.+?)(?= ORDER BY | LIMIT |$)/i.exec(rest);
    var mo = / ORDER BY (\w+) (ASC|DESC)/i.exec(rest);
    var ml = / LIMIT (\?|\d+)/i.exec(rest);
    return {
      sel: m[1].split(',').map(function (x) { return x.trim(); }),
      table: m[2],
      where: mw ? mw[1].split(/ AND /i).map(function (x) { return x.trim(); }) : [],
      group: mg ? mg[1].split(',').map(function (x) { return x.trim(); }) : null,
      order: mo ? { col: mo[1], dir: mo[2].toUpperCase() } : null,
      limit: ml ? ml[1] : null,
    };
  }
  function run(sql, args) {
    var q = parse(sql);
    var rows = tables[q.table];
    if (!rows) throw new Error('D1 stub: no such table ' + q.table);
    var i = { n: 0 };
    q.where.forEach(function (c) {
      var mc = /^(\w+) (>=|<=|=|<|>) (.+)$/.exec(c);
      if (!mc) throw new Error('D1 stub: unparseable WHERE ' + c);
      var col = mc[1], op = mc[2], val = lit(mc[3], args, i).v;
      rows = rows.filter(function (r) {
        var a = r[col];
        if (op === '=') return String(a) === String(val);
        if (op === '>=') return String(a) >= String(val);
        if (op === '<=') return String(a) <= String(val);
        if (op === '>') return String(a) > String(val);
        return String(a) < String(val);
      });
    });
    var items = q.sel.map(function (x) {
      var ma = /^(MIN|MAX|SUM)\((\w+)\) AS (\w+)$/i.exec(x);
      if (ma) return { fn: ma[1].toUpperCase(), col: ma[2], as: ma[3] };
      var mp = /^(\w+) AS (\w+)$/.exec(x);
      if (mp) return { fn: null, col: mp[1], as: mp[2] };
      throw new Error('D1 stub: unparseable select item ' + x);
    });
    var hasAgg = items.some(function (it) { return it.fn; });
    function fold(group) {
      var out = {};
      items.forEach(function (it) {
        if (!it.fn) { out[it.as] = group.length ? group[0][it.col] : null; return; }
        var vals = group.map(function (r) { return r[it.col]; })
          .filter(function (v) { return v != null && v !== ''; });
        if (!vals.length) { out[it.as] = null; return; }
        if (it.fn === 'SUM') out[it.as] = vals.reduce(function (a, b) { return a + Number(b); }, 0);
        else if (it.fn === 'MIN') out[it.as] = vals.slice().sort()[0];
        else out[it.as] = vals.slice().sort(function (a, b) {
          return (Number(a) - Number(b)) || String(a).localeCompare(String(b)); }).pop();
      });
      return out;
    }
    var res;
    if (q.group) {
      var buckets = new Map();
      rows.forEach(function (r) {
        var k = q.group.map(function (c) { return String(r[c]); }).join('|#|');
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(r);
      });
      res = Array.from(buckets.values()).map(fold);
    } else if (hasAgg) {
      res = [fold(rows)];
    } else {
      res = rows.map(function (r) { return fold([r]); });
    }
    if (q.order) {
      var d = q.order.dir === 'DESC' ? -1 : 1;
      res.sort(function (a, b) { return d * ((Number(a[q.order.col]) || 0) - (Number(b[q.order.col]) || 0)); });
    } else {
      res.sort(function (a, b) { return String(a.day) < String(b.day) ? -1 : 1; });
    }
    if (q.limit != null) {
      var lim = q.limit === '?' ? Number(args[i.n++]) : Number(q.limit);
      res = res.slice(0, lim);
    }
    return { results: res };
  }
  return {
    prepare: function (sql) {
      function mk(args) {
        return {
          bind: function () { return mk(Array.prototype.slice.call(arguments)); },
          all: function () { return Promise.resolve(run(sql, args)); },
        };
      }
      return mk([]);
    },
    _ins: function (t, row) { tables[t].push(row); return this; },
  };
}
function traffic(db, day, country, pageloads, visits, si, bot) {
  db._ins('traffic_daily', {
    day: day, country: country, referrer_host: '', referrer_kind: 'direct', path: '/',
    device: 'desktop', browser: 'Chrome', os: 'Windows', nav_type: 'navigate',
    bot: bot ? 1 : 0, pageloads: pageloads, visits: visits, sample_interval: si,
  });
}
function ran(db, day, rows, coarse, note) {
  db._ins('rollup_runs', { day: day, ran_at: day + 'T05:10:00Z', traffic_rows: rows,
    usage_rows: 0, coarse: coarse, note: note || '' });
}

/* THE FIXTURE. "Today" is pinned at 2026-09-18 (below), so the store — 2026-08-25 through
 * 2026-09-17 — always ends YESTERDAY relative to it, the same shape run_dashboard_stats.js
 * seeds, shifted seven days earlier so the two fixtures can be read side by side. One of
 * each kind of day, placed where each check needs it:
 *
 *   2026-08-25         clean, 10 pageloads / 6 visits          (the store's first day)
 *   2026-08-26         clean, 8/5 (+ an excluded bot day)
 *   2026-08-27         REAL ZERO — ran, nobody came
 *   2026-08-28         COARSE — France, rounded to the nearest 10 (sample_interval 10)
 *   2026-08-29         clean, US 9/4 + France 3/1
 *   2026-08-30         UNCAPTURED — no rollup_runs row at all (the cron never fired)
 *   2026-08-31         MISSING — ran, but recorded a traffic failure
 *   2026-09-01..09-07  clean, 4 landing visits / day (8 pageloads)          — week A
 *   2026-09-08..09-14  clean, 7 landing visits / day (14 pageloads)        — week B
 *   2026-09-15..09-17  REAL ZERO — ran, dead
 *   2026-09-18         TODAY — no rollup row; comes live from Cloudflare (11 pageloads,
 *                      7 visits, from TODAY_LIVE below)
 */
function seed() {
  var db = makeDb();
  traffic(db, '2026-08-25', 'United States', 10, 6, 1, 0); ran(db, '2026-08-25', 1, 1);
  traffic(db, '2026-08-26', 'United States', 8, 5, 1, 0);
  traffic(db, '2026-08-26', 'United States', 500, 400, 1, 1);
  ran(db, '2026-08-26', 2, 1);
  ran(db, '2026-08-27', 0, 1);
  traffic(db, '2026-08-28', 'France', 20, 10, 10, 0);
  ran(db, '2026-08-28', 1, 10, 'coarse:10');
  traffic(db, '2026-08-29', 'United States', 9, 4, 1, 0);
  traffic(db, '2026-08-29', 'France', 3, 1, 1, 0);
  ran(db, '2026-08-29', 2, 1);
  ran(db, '2026-08-31', 0, 1, 'traffic failed: upstream 500');
  for (var i = 1; i <= 14; i++) {
    var day = '2026-09-' + (i < 10 ? '0' + i : i);
    var v = i <= 7 ? 4 : 7;
    traffic(db, day, 'United States', v * 2, v, 1, 0);
    ran(db, day, 1, 1);
  }
  ran(db, '2026-09-15', 0, 1); ran(db, '2026-09-16', 0, 1); ran(db, '2026-09-17', 0, 1);
  /* THE STORED-KIND CASE (#764 final round): a referrer that recomputing from the host
   * ALONE gets wrong. `referrerKind('preview.example.net', null)` returns 'external' — it
   * matches neither the reactordynamics.com nor the *.pages.dev suffix rule — but the
   * STORED kind, computed at rollup time with the real requestHost in hand, is 'internal'
   * (a preview deployment referring to itself). Country 'Canada' so this row cannot be
   * mistaken for the plain United-States traffic other checks total exactly. */
  db._ins('traffic_daily', { day: '2026-09-03', country: 'Canada', referrer_host: 'preview.example.net',
    referrer_kind: 'internal', path: '/preview', device: 'desktop', browser: 'Chrome',
    os: 'Windows', nav_type: 'navigate', bot: 0, pageloads: 5, visits: 2, sample_interval: 1 });
  return db;
}

// ---------------------------------------------------------------- the fake Cloudflare upstream
var TODAY_LIVE = { rumPageloadEventsAdaptiveGroups: [
  { count: 8, avg: { sampleInterval: 1 }, sum: { visits: 5 }, dimensions: { bot: false } },
  { count: 3, avg: { sampleInterval: 1 }, sum: { visits: 2 }, dimensions: { bot: false } },
  /* A BOT ROW baked into the SAME live batch as the two human rows above. Proves bots are
   * excluded from the "today" by-day figure — the defect was that today's live queries
   * carried no bot exclusion at all, while every closed-day figure is bot-excluded. If it
   * ever leaks back in, the totals checks 1 and 2 assert (53/28) jump to (153/78). */
  { count: 100, avg: { sampleInterval: 1 }, sum: { visits: 50 }, dimensions: { bot: true } },
] };   // 11 pageloads, 7 visits (human only) — the bot row must never be summed in
/* TODAY's live slice for "Country × referrer × day" — no `datetimeHour` dimension any more
 * (#791 follow-up): the section only ever fetches ONE day live (today), so there is nothing
 * left to bucket by hour. Two rows in the SAME batch, one exact and one coarse, so a check
 * can prove the per-row (not batch-wide) coarse marking the way `GENERIC_BREAKDOWN` already
 * does for the single-dimension sections. `news.ycombinator.com` matches neither the
 * reactordynamics.com nor the *.pages.dev suffix rule, so it classifies EXTERNAL. */
var THREE_DIM = { rumPageloadEventsAdaptiveGroups: [
  { count: 5, avg: { sampleInterval: 1 }, sum: { visits: 2 }, dimensions: {
    countryName: 'United States', refererHost: '', requestHost: 'reactordynamics.com' } },
  { count: 3, avg: { sampleInterval: 10 }, sum: { visits: 1 }, dimensions: {
    countryName: 'Germany', refererHost: 'news.ycombinator.com', requestHost: 'reactordynamics.com' } },
] };
/* TWO ROWS in the same live batch, same key in every dimension EXCEPT country and the
 * sample interval — France... no, "Germany" is a country that never appears in the seeded
 * D1 store, so its merged row is entirely the live half. Germany's row is COARSE
 * (sampleInterval 10); the United States row in the same batch is EXACT (sampleInterval 1).
 * Proves the per-KEY merge marks coarseness off the ROW'S OWN `si`, not the batch-wide
 * `g.coarse` — the defect was `if (g.coarse > 1) cur.coarse = true` inside the per-row
 * forEach, which taints every key in the batch once ANY row in it is coarse. */
var GENERIC_BREAKDOWN = { rumPageloadEventsAdaptiveGroups: [
  { count: 6, avg: { sampleInterval: 1 }, sum: { visits: 3 }, dimensions: {
    requestPath: '/', countryName: 'United States', refererHost: '',
    requestHost: 'reactordynamics.com', deviceType: 'desktop', userAgentBrowser: 'Chrome',
    userAgentOS: 'Windows', navigationType: 'navigate', bot: 0 } },
  { count: 3, avg: { sampleInterval: 10 }, sum: { visits: 1 }, dimensions: {
    requestPath: '/', countryName: 'Germany', refererHost: '',
    requestHost: 'reactordynamics.com', deviceType: 'desktop', userAgentBrowser: 'Chrome',
    userAgentOS: 'Windows', navigationType: 'navigate', bot: 0 } } ] };
var VITALS_LCP = { rumWebVitalsEventsAdaptiveGroups: [
  { count: 40, avg: { sampleInterval: 1 }, quantiles: { largestContentfulPaintP75: 1500000 },
    dimensions: { largestContentfulPaintPath: '/' } } ] };
var VITALS_INP = { rumWebVitalsEventsAdaptiveGroups: [
  { count: 12, avg: { sampleInterval: 1 }, quantiles: { interactionToNextPaintP75: 220000 },
    dimensions: { interactionToNextPaintPath: '/ui/shell', interactionToNextPaintElement: 'button.scram' } } ] };
var VITALS_CLS = { rumWebVitalsEventsAdaptiveGroups: [
  { count: 8, avg: { sampleInterval: 1 }, quantiles: { cumulativeLayoutShiftP75: 0.02 },
    dimensions: { cumulativeLayoutShiftPath: '/', cumulativeLayoutShiftElement: 'img.hero' } } ] };

// Set true for exactly one render (check 18) to simulate the live referrer fetch failing —
// everything else must keep working normally around it.
var FAIL_REFERRER = false;

// Dispatch on the query TEXT, most specific first — a fake that matched loosely would be
// answering the wrong question and never notice.
function dispatchGql(q) {
  var s = String(q).replace(/\s+/g, ' ');
  function has(x) { return s.indexOf(x) !== -1; }
  if (has('rumWebVitalsEventsAdaptiveGroups')) {
    if (has('largestContentfulPaintP75')) return VITALS_LCP;
    if (has('interactionToNextPaintP75')) return VITALS_INP;
    if (has('cumulativeLayoutShiftP75')) return VITALS_CLS;
    throw new Error('fakeGql: vitals query with no recognised quantile field: ' + s.slice(0, 150));
  }
  // `dimensions { … bot }` -- analytics.js's `rumGroup` always appends `bot` to the
  // requested dimensions now, so it can filter bot rows out of the returned rows
  // (`rumRows`' `excludeBots` option) without an unconfirmed GraphQL filter term.
  if (has('dimensions { datetimeHour bot }')) return TODAY_LIVE;
  if (has('dimensions { countryName refererHost requestHost bot }')) return THREE_DIM;
  if (has('dimensions { refererHost requestHost bot }')) {
    if (FAIL_REFERRER) throw new Error('fakeGql: simulated referrer upstream failure');
    return GENERIC_BREAKDOWN;
  }
  if (has('rumPageloadEventsAdaptiveGroups')) return GENERIC_BREAKDOWN;
  throw new Error('fakeGql: unrecognised query: ' + s.slice(0, 150));
}
var SEEN = [];
function fakeGql(token, q) {
  SEEN.push(q);
  try { return Promise.resolve(dispatchGql(q)); } catch (e) { return Promise.reject(e); }
}
function fakeCfapi() {
  return 'export const DATASET = "reactor_dynamics_usage";\n'
    + 'export const sql = () => Promise.reject(new Error("run_dashboard_trend: unexpected sql() call"));\n'
    + 'export const gql = globalThis.__RD_FAKE_GQL;\n'
    + 'export const ACCOUNT = "acct"; export const SITE_TAG = "tag";\n';
}
globalThis.__RD_FAKE_GQL = fakeGql;

// ---------------------------------------------------------------- injections
var ARG = process.argv.slice(2).join(' ');
var INJECT = (/--inject=([\w-]+)/.exec(ARG) || [])[1] || null;

/* Each is a real defect this runner claims to catch, applied to the module SOURCE before
 * it is loaded — "the check can go red" is a command anyone can re-run, not a sentence in
 * a report. `[file, anchor, replacement]`; the anchor must be a SINGLE PHYSICAL LINE (both
 * files are CRLF — a multi-line `\n` anchor matches nothing and the injection never fires,
 * which is worse than no injection). */
var INJECTIONS = {
  'closed-days-blind': ['analytics.js',
    'const closedRows = meanFrom <= closedTo ? await dailyTotals(db, meanFrom, closedTo) : [];',
    'const closedRows = [];'],
  'today-not-live': ['analytics.js', 'if (includesToday) {', 'if (false) {'],
  'window-error-swallowed': ['analytics.js',
    'catch (e) { return { error: e.message }; }', 'catch (e) { return { from: today, to: today }; }'],
  'clamp-drop': ['analytics.js', 'if (sr && from < sr.first) {', 'if (false) {'],
  'coarse-hide': ['analytics.js',
    'return { day, pageloads: c.pageloads, visits: c.visits, coarse: c.coarse, missing: c.missing,',
    'return { day, pageloads: c.pageloads, visits: c.visits, coarse: false, missing: c.missing,'],
  'delta-always-ok': ['analytics.js',
    "const deltaLine = '<p>' + (delta.ok", "const deltaLine = '<p>' + (true"],
  'mean-draws-to-zero': ['render.js',
    'if (v == null) { if (cur.length > 1) segs.push(cur); cur = []; return; }', ''],
  'legacy-days-ignored': ['analytics.js',
    'const n = Math.max(1, Math.min(90, Math.floor(Number(qDays)) || 7));', 'const n = 7;'],
  'token-leak': ['analytics.js',
    '<a class="pbtn" href="?view=analytics&amp;from=\'',
    '<a class="pbtn" href="?view=analytics&amp;token=x&amp;from=\''],
  /* THE DEFECT THE PRESETS SHIPPED WITH (2026-09-20). Puts the `<button formaction=>`
   * form back: on a GET submission the browser DISCARDS the action URL's query string and
   * sends the form's own fields instead, so every preset redrew the window already on
   * screen. Measured in headless Edge before the fix — the 14d button, whose formaction
   * asked for from=2026-09-07, navigated to from=2026-09-14, the date input's own value. */
  'preset-not-a-link': ['analytics.js',
    '<a class="pbtn" href="?view=analytics&amp;from=\'',
    '<button type="submit" formaction="?view=analytics&amp;from=\''],
  'breakdown-skips-d1': ['analytics.js',
    'const closed = from <= closedTo ? await groupBy(db, dim, from, closedTo, Math.max(limit, 200)) : [];',
    'const closed = [];'],
  /* ANCHOR REPAIRED 2026-09-20 (found blind while re-firing every injection for the line-
   * chart change, unrelated to it): the two-line `if (includesToday) {\n      const g = …`
   * form broke when an intervening comment (the `dim !== 'bot'` exemption note) landed
   * between them, so `src.indexOf` never matched and the injection silently never fired.
   * A multi-line anchor is also exactly the CRLF/LF trap this file's own header warns
   * about. Re-anchored on the single physical line unique to THIS `rumRows` call (its
   * `cfDims`/`count_DESC` args distinguish it from the other two `includesToday` blocks in
   * this file) and short-circuited with `false &&` so the following, unchanged line stays
   * a valid continuation of the same expression — `gql`/`rumRows` are never called, so
   * `g.rows` is empty and today's slice never reaches the merge. */
  'breakdown-today-not-merged': ['analytics.js',
    "const g = rumRows(await gql(apiToken, rumGroup(cfDims, 'count_DESC', Math.max(limit, 200), todayFromIso, todayToIso)),",
    "const g = { rows: [] }; false && rumRows(await gql(apiToken, rumGroup(cfDims, 'count_DESC', Math.max(limit, 200), todayFromIso, todayToIso)),"],
  'breakdown-span-drift': ['analytics.js',
    "+ esc(from) + ' to ' + esc(closedTo) + ')'", "+ esc(from) + ' to ' + esc(nextDay(closedTo)) + ')'"],
  'referrer-kind-recomputed': ['analytics.js',
    'const by = new Map(closed.map((r) => [r.host, { host: r.host, kind: r.kind,',
    'const by = new Map(closed.map((r) => [r.host, { host: r.host, kind: referrerKind(r.host || null, null),'],
  'bot-no-warning': ['analytics.js',
    "+ '<p class=\"warn\">Unlike every other section on this page, THIS ONE INCLUDES BOT '\n        + 'TRAFFIC — grouping by bot status cannot also filter it out. Do not compare these '\n        + 'totals against Top pages, Countries, or any other section above.</p>'\n        + table(h.rows.map((r) => ({",
    '+ table(h.rows.map((r) => ({'],
  /* THE FIVE CODA DEFECTS + THE "All" PRESET (coordinator round, 2026-09-20). */
  'today-bots-included': ['analytics.js',
    'const filtered = excludeBots ? raw.filter((r) => !((r.dimensions || {}).bot)) : raw;',
    'const filtered = raw;'],
  'arrivals-vacuous-truth': ['analytics.js',
    "+ (ext.length > 0 && ext.every((r) => r.kind === 'direct')",
    "+ (ext.every((r) => r.kind === 'direct')"],
  'batch-coarse-taints-row': ['analytics.js',
    'if (r.si > 1) cur.coarse = true;', 'if (g.coarse > 1) cur.coarse = true;'],
  'referrer-fetch-crashes-page': ['analytics.js',
    '} catch (e) { referrerErr = e.message; }', '} catch (e) { throw e; }'],
  'all-preset-missing': ['analytics.js',
    "+ (sr ? ' <a class=\"pbtn\" href=\"?view=analytics&amp;from=' + allFrom",
    "+ (false ? ' <a class=\"pbtn\" href=\"?view=analytics&amp;from=' + allFrom"],
  /* THE LINE CHART (2026-09-20): "for the 30 day and all can you make them a line graph and
   * show data from every day not the weekly average." Six injections, one per new behaviour. */
  'line-threshold-wrong': ['analytics.js',
    'const isLongWindow = rows.length > 14;', 'const isLongWindow = rows.length > 9999;'],
  'line-joins-through-missing': ['render.js',
    'if (r.missing) { if (cur.length > 1) segs.push(cur); cur = []; return; }', ''],
  'line-missing-tick-gone': ['render.js',
    'if (!r.missing) return;', 'return;'],
  'line-partial-not-hollow': ['render.js',
    'const style = r.partial ? \'fill="none" stroke="\' + color + \'" stroke-width="2"\'',
    'const style = false ? \'fill="none" stroke="\' + color + \'" stroke-width="2"\''],
  'line-coarse-not-faded': ['render.js',
    ': \'fill="\' + color + \'"\' + (r.coarse ? \' fill-opacity="0.45"\' : \'\');',
    ': \'fill="\' + color + \'"\' + (false ? \' fill-opacity="0.45"\' : \'\');'],
  /* THE OVERPRINT (2026-09-20). Removing the guard restores the state a screenshot caught
   * and 63 green checks did not: two x-axis labels one slot apart, drawn on top of each
   * other. Well-formed markup, unreadable render -- which is why 7c asserts the drawn x
   * geometry rather than a label COUNT. A count check re-derives the implementation's own
   * formula and follows it into exactly this bug. */
  'line-labels-overlap': ['render.js',
    'if (lastForced && i !== n - 1 && (n - 1) - i < 2 * stride) return;', ''],
  'line-labels-not-thinned': ['render.js',
    'if (i % stride !== 0 && i !== n - 1) return;', 'if (false) return;'],
  /* "COUNTRY × REFERRER × DAY" MIGRATED OFF CLOUDFLARE-ONLY (#791 follow-up): four
   * behaviours, four injections. */
  'countryday-skips-d1': ['analytics.js',
    'const closed = from <= closedTo ? await dayCountryReferrer(db, from, closedTo, Math.max(limit, 500)) : [];',
    'const closed = [];'],
  /* THE ONE THE TASK NAMES DIRECTLY: "falls back to the live Cloudflare query". A window that
   * never reaches today must never touch Cloudflare for this dimension combination at all —
   * `fetchCountryDayLive` exists so this can be forced on without touching the `includesToday`
   * guard three OTHER blocks in this file already share. */
  'countryday-falls-back-live': ['analytics.js',
    'const fetchCountryDayLive = includesToday;', 'const fetchCountryDayLive = true;'],
  /* THE OTHER ONE THE TASK NAMES DIRECTLY: "an uncaptured day renders as a zero row". The
   * shipped code cannot produce one — a GROUP BY over rows that do not exist returns no row,
   * never a zero one — so this is the NAIVE alternative it replaced: pre-seed a placeholder
   * for every day in the window before the real rows are folded in, the way a LEFT JOIN
   * against a calendar table would. */
  'countryday-zero-row': ['analytics.js', '    const by = new Map();',
    '    const by = new Map((from <= closedTo ? dayRange(from, closedTo) : []).map((d) => '
    + '[d, { day: d, country: \'\', host: \'\', kind: \'\', pageloads: 0, visits: 0, coarse: false }]));'],
  /* A day can be legitimately absent from the table without the reader being broken (a real
   * zero, or the window ending before it). What must not happen is the NOTE staying silent
   * about a day that was never captured — this drops the warning paragraph outright. */
  'countryday-missing-note-silent': ['analytics.js',
    'const missingDays = allDays.filter((d) => d <= closedTo && (closedByDay.get(d) || { missing: true }).missing);',
    'const missingDays = [];'],
};

if (/--list-injections/.test(ARG)) {
  Object.keys(INJECTIONS).forEach(function (k) { console.log(k); });
  process.exit(0);
}

function injectSrc(rel, src) {
  if (!INJECT) return src;
  var spec = INJECTIONS[INJECT];
  if (!spec) throw new Error('unknown injection: ' + INJECT);
  if (spec[0] !== rel) return src;
  if (src.indexOf(spec[1]) < 0) {
    throw new Error('injection "' + INJECT + '" did not match its anchor in ' + rel
      + ' — the source moved and the injection is blind, which is worse than no injection');
  }
  return src.split(spec[1]).join(spec[2]);
}

// ---------------------------------------------------------------- the ESM loader
// run_rollup.js's idiom (base64 data: URLs, graph resolved bottom-up), with a STUB map
// (run_usage_page.js's extension) so cfapi.js can be swapped for the fake wholesale.
function loadEsm(ROOT, entry, stubs) {
  var built = {};
  function build(rel) {
    if (built[rel]) return built[rel];
    var src = (stubs && Object.prototype.hasOwnProperty.call(stubs, rel))
      ? stubs[rel]
      : injectSrc(rel, fs.readFileSync(path.join(ROOT, 'worker', 'src', rel), 'utf8'));
    src = src.replace(/from\s+'\.\/([\w.]+\.js)'/g, function (_, dep) {
      return "from '" + build(dep) + "'";
    });
    built[rel] = 'data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64');
    return built[rel];
  }
  return import(build(entry));
}

async function threwAsync(fn) {
  try { await fn(); return null; } catch (e) { return String(e && e.message || e); }
}

(async function main() {
  var ROOT = path.join(__dirname, '..');
  var A = await loadEsm(ROOT, 'analytics.js', { 'cfapi.js': fakeCfapi() });
  var R = await loadEsm(ROOT, 'render.js', {});
  var db = seed();

  /* "TODAY" IS PINNED so the fixture above is a known shape rather than a moving target.
   * 2026-09-18T15:00:00Z is 11:00 EDT — the 18th in Eastern, nowhere near a day boundary. */
  var FAKE_NOW = Date.UTC(2026, 8, 18, 15, 0, 0);
  var realNow = Date.now;
  Date.now = function () { return FAKE_NOW; };

  var ALL_HTML = [];
  async function renderPage(qs) {
    SEEN.length = 0;
    var url = new URL('https://example.invalid/dashboard?view=analytics' + (qs || ''));
    var res = await A.analyticsPage({ STATS: db, CF_ANALYTICS_TOKEN: 'tok' }, url);
    var body = await res.text();
    ALL_HTML.push(body);
    return body;
  }

  console.log(BOLD + '\nAnalytics — arbitrary window + trend (#764 Unit 2b)' + RST +
    (INJECT ? RED + '   [INJECTED: ' + INJECT + ']' + RST : ''));

  try {
    /* =================================================================== 1. closed days */
    head('1. an explicit [from,to] queries the first-party store for every CLOSED day');
    var p1 = await renderPage('&from=2026-09-01&to=2026-09-07');
    var liveQueryFired1 = SEEN.some(function (q) { return /dimensions \{ datetimeHour bot \}/.test(q); });
    ck('a range that never reaches today issues NO live Cloudflare query for the by-day figure',
       !liveQueryFired1, liveQueryFired1 ? 'a today-only query was issued anyway' : 'none issued');
    // 56/28 United States (7 clean days at 8/4) plus the 5/2 Canada/preview.example.net row
    // seeded for check 14 below (same window) — 61 pageloads, 30 landing visits.
    ck('the totals are the STORE\'S numbers (61 pageloads, 30 landing visits over 7 clean days)',
       />61<\/div><div class="k">Pageloads<\/div>/.test(p1) && />30<\/div><div class="k">Landing visits<\/div>/.test(p1),
       (p1.match(/<div class="v">(\d+)<\/div><div class="k">(Pageloads|Landing visits)/g) || []).join(' | '));
    ck('the by-day source note claims first-party, not Cloudflare, for this window',
       /first-party exact/.test(p1));

    /* =================================================================== 2. today, live */
    head('2. TODAY comes from Cloudflare, live, and is marked partial — never blended in solid');
    var p2 = await renderPage('');   // default window: the last 7 days, ending today
    var liveQueryFired2 = SEEN.some(function (q) { return /dimensions \{ datetimeHour bot \}/.test(q); });
    ck('the default window (ending today) DOES issue a live today-only Cloudflare query, '
     + 'and the headline totals include its 11 pageloads / 7 visits (53 / 28 over the 7 days)',
       liveQueryFired2 && />53<\/div><div class="k">Pageloads<\/div>/.test(p2)
       && />28<\/div><div class="k">Landing visits<\/div>/.test(p2),
       'live query issued=' + liveQueryFired2 + '; ' +
       (p2.match(/<div class="v">(\d+)<\/div><div class="k">(Pageloads|Landing visits)/g) || []).join(' | '));
    ck('today’s row is labelled (partial) and "today, live" in the by-day table',
       /2026-09-18[^<]*\(partial\)/.test(p2) && /today, live/.test(p2));
    ck('period-over-period reads DOWN 30% against the prior 7 days (40 -> 28 visits) — proves '
     + 'the live figure feeds the comparison, not just the tiles',
       /<b>down 30%<\/b>/.test(p2), (p2.match(/<b>(up|down|flat)[^<]*<\/b>/) || ['(none)'])[0]);

    /* =================================================================== 3. bad windows */
    head('3. a malformed or out-of-range date is REJECTED or CLAMPED — never drawn as zero');
    var p3a = await renderPage('&from=2026-13-40&to=2026-09-05');
    ck('an impossible date renders an error block and never reaches the by-day table',
       /class="err"/.test(p3a) && !/<h2>By day<\/h2>/.test(p3a));
    var p3b = await renderPage('&from=2026-09-10&to=2026-09-01');
    ck('a reversed range (ends before it begins) is also rejected',
       /class="err"/.test(p3b) && !/<h2>By day<\/h2>/.test(p3b));
    var p3c = await renderPage("&from=2026-09-01' OR '1'='1&to=2026-09-05");
    ck('an injection-shaped from= is rejected, not coerced',
       /class="err"/.test(p3c) && !/<h2>By day<\/h2>/.test(p3c));
    var p3d = await renderPage('&from=2026-08-01&to=2026-08-27');
    ck('a START before the store begins is CLAMPED to the store’s first day, with a visible '
     + 'note — not silently rendered as a zero-traffic window',
       /recorded history begins/.test(p3d) && !/class="err"/.test(p3d)
       && /2026-08-25 to /.test(p3d) && !/>2026-08-01</.test(p3d),
       (p3d.match(/<h1>[^<]*<span[^>]*>([^<]*)</) || ['', '(no heading match)'])[1]);
    var p3e = await renderPage('&from=2026-07-01&to=2026-07-07');
    ck('a range ENTIRELY before the store says plainly there is nothing to show — no crash, '
     + 'no reversed-range error, and no attempt at a by-day table',
       /recorded history begins/.test(p3e) && !/<h2>By day<\/h2>/.test(p3e));
    var p3f = await renderPage('&from=2020-01-01&to=2026-09-18');
    ck('a span over the 800-day retention ceiling is rejected too (stats.dayRange’s own '
     + 'guard, reached through resolveWindow’s try/catch) — not silently narrowed',
       /class="err"/.test(p3f) && !/<h2>By day<\/h2>/.test(p3f));

    /* =================================================================== 4. coarse/missing */
    head('4. a coarse day and an uncaptured day are marked, not blended in');
    var p4 = await renderPage('&from=2026-08-25&to=2026-08-31');
    /* The chart's own LEGEND also carries the literal substrings "coarse (" and "no data
     * captured" (it explains what a faded bar and a dashed tick mean) — a loose match on
     * either would pass even with every real per-day marker deleted, which is exactly the
     * "a source scan cannot prove reachability" trap (#485). Both checks below match the
     * TABLE'S OWN <td> cell instead, which only exists if that specific day's row carries
     * the flag. */
    /* Scoped to the By-day SECTION alone (up to the next <h2>) — the migrated breakdown
     * tables below it can legitimately carry their OWN "coarse" cells (a country whose only
     * appearance is on this same rounded day), and an unscoped match would keep passing
     * even with the by-day table's own marking deleted outright. */
    var byDaySection4 = p4.slice(p4.indexOf('<h2>By day</h2>'), p4.indexOf('<h2>', p4.indexOf('<h2>By day</h2>') + 1));
    ck('the coarse day (2026-08-28, Cloudflare-rounded) is marked in its own by-day table cell — '
     + 'not just named in the legend, and not just true of a DIFFERENT section',
       /<td>coarse \(±10\)<\/td>/.test(byDaySection4));
    ck('the uncaptured days (08-30 no run, 08-31 traffic failed) each carry their own '
     + '"no data captured" table cell in the by-day table',
       (byDaySection4.match(/<td>no data captured<\/td>/g) || []).length === 2,
       (byDaySection4.match(/<td>no data captured<\/td>/g) || []).length + ' cell(s)');

    /* =================================================================== 5. refused delta */
    head('5. periodDelta refusing renders the REASON and never a percentage');
    var p5 = await renderPage('&from=2026-08-25&to=2026-08-31');   // the store's own first week
    ck('the prior week predates the store, so the comparison refuses with the reason',
       /No comparable prior period/.test(p5) && /recorded history begins/.test(p5));
    ck('...and NO percentage is printed in its place — no 0%, no up/down, nothing',
       !/<b>(up|down|flat)[^<]*<\/b>/.test(p5.slice(p5.indexOf('No comparable') - 5)));

    /* =================================================================== 6. trend line */
    head('6. the trailing-mean line skips a null window instead of drawing to zero');
    var p6 = await renderPage('&from=2026-09-01&to=2026-09-14');
    var meanPoly = /<polyline points="([^"]+)" fill="none" stroke="#5fd9a0"/.exec(p6);
    ck('a mean polyline is drawn at all', !!meanPoly, meanPoly ? 'found' : 'NOT FOUND');
    if (meanPoly) {
      var pts = meanPoly[1].trim().split(/\s+/);
      var firstX = parseFloat(pts[0].split(',')[0]);
      var PADL = 34, plotW = 720 - 34 - 96, slot = plotW / 14;
      var expectFirstX = PADL + 6 * slot + slot / 2;   // day index 6 (2026-09-07), 0-based
      ck('it has exactly 8 points (days 7..14 of the 14-day window — the first 6 have no '
       + 'full trailing window and are skipped, not zeroed)',
         pts.length === 8, pts.length + ' points');
      ck('...and the FIRST point sits at day index 6, not day 0 — the gap is a gap, not a '
       + 'flat run to the baseline',
         Math.abs(firstX - expectFirstX) < 1, 'x=' + firstX.toFixed(1) + ' vs expected ' + expectFirstX.toFixed(1));
    } else {
      ck('it has exactly 8 points', false, 'no polyline to inspect');
      ck('...and the FIRST point sits at day index 6, not day 0', false, 'no polyline to inspect');
    }

    /* =================================================================== 7. no bucketing */
    head('7. bucketDays NEVER buckets any more, at 7 / 30 / 45 / 400 days (rewritten '
       + '2026-09-20 — a >14-day window draws lineChart, one point per day, instead of '
       + 'folding into weekly/monthly bars; see section 7b for what replaced this)');
    function mkRows(n) {
      var rows = [], d = new Date('2026-01-01T00:00:00Z');
      for (var i = 0; i < n; i++) {
        rows.push({ day: d.toISOString().slice(0, 10), pageloads: 1, visits: 1,
          coarse: false, missing: false, partial: false, mean: null, ghost: null });
        d.setUTCDate(d.getUTCDate() + 1);
      }
      return rows;
    }
    var b7 = R.bucketDays(mkRows(7)), b30 = R.bucketDays(mkRows(30)),
        b45 = R.bucketDays(mkRows(45)), b400 = R.bucketDays(mkRows(400));
    ck('7 days stays daily (7 rows)', b7.bucket === 'day' && b7.rows.length === 7,
       b7.bucket + '/' + b7.rows.length);
    ck('30 days is STILL 30 rows — no fold into 5 weekly bars',
       b30.bucket === 'day' && b30.rows.length === 30, b30.bucket + '/' + b30.rows.length);
    ck('45 days is still 45 rows — no fold into weeks',
       b45.bucket === 'day' && b45.rows.length === 45, b45.bucket + '/' + b45.rows.length);
    ck('400 days is still 400 rows — no fold into months',
       b400.bucket === 'day' && b400.rows.length === 400, b400.bucket + '/' + b400.rows.length);
    ck('bucketDays still takes no `days` argument',
       R.bucketDays.length === 1, R.bucketDays.length + ' declared parameter(s)');

    /* =========================================================== 7b. the line chart ==== */
    head('7b. past 14 days the by-day chart is a DAILY LINE, not folded bars — and the '
       + '14-day boundary itself is exercised both sides');
    var p7bBar = await renderPage('&from=2026-09-01&to=2026-09-14');   // 14 days, exactly at the boundary
    var p7bLine = await renderPage('&from=2026-08-25&to=2026-09-08');  // 15 days, one past it
    var barSection = p7bBar.slice(p7bBar.indexOf('<h2>By day</h2>'), p7bBar.indexOf('<h2>', p7bBar.indexOf('<h2>By day</h2>') + 1));
    var lineSection = p7bLine.slice(p7bLine.indexOf('<h2>By day</h2>'), p7bLine.indexOf('<h2>', p7bLine.indexOf('<h2>By day</h2>') + 1));
    ck('14 days (the boundary itself) still draws bars — <rect rx="3">, no <circle> markers',
       /<rect[^>]*rx="3"/.test(barSection) && !/<circle/.test(barSection));
    ck('15 days (one past the boundary) draws a line — <circle> markers, no <rect rx="3"> bars',
       /<circle/.test(lineSection) && !/<rect[^>]*rx="3"/.test(lineSection));
    ck('the 15-day line legend explains the point styles and states the label spacing',
       /Hollow point = today, live and partial/.test(lineSection)
       && /faded point = Cloudflare-coarse/.test(lineSection)
       && /dates are labelled every \d+ day\(s\)/.test(lineSection));

    /* ==================================================== 7c. x-axis label thinning ===== */
    head('7c. x-axis labels are THINNED at length -- never one per day past 14, the last day',
       'is always labelled, and no two labels are drawn close enough to overprint');
    function mkLineRows(n) {
      var rows = mkRows(n);
      // One real mean value so the direct-label collision-avoidance path is exercised too.
      rows[rows.length - 1].mean = 3;
      return rows;
    }
    /* 18 is in the list because it is the case that BROKE: stride 2 over 18 days does not
     * divide, so forcing the last label put `09-17 Th` one slot from `09-18 F` and they
     * overprinted as `09-17 TH09-18 F`. Found by screenshotting a render, not by any check
     * here -- the markup was well-formed with the labels on top of each other, so the
     * assertion below is on the drawn GEOMETRY (the x attributes) rather than on the count,
     * which the old form of this check re-derived from the implementation's own formula and
     * would therefore have followed into the bug. */
    [15, 18, 30, 90, 400].forEach(function (n) {
      var svg = R.lineChart(mkLineRows(n), { labelA: 'Pageloads', labelB: 'Landing visits' });
      var xs = (svg.match(/<text x="([0-9.]+)" y="\d+" fill="#8fa2b3" font-size="10" text-anchor="middle">/g) || [])
        .map(function (t) { return parseFloat(/x="([0-9.]+)"/.exec(t)[1]); })
        .sort(function (p, q) { return p - q; });
      ck(n + ' days: ' + xs.length + ' x-axis labels drawn, fewer than one per day',
         xs.length > 1 && xs.length < n, xs.length + ' labels for ' + n + ' days');
      var tightest = Infinity;
      for (var i = 1; i < xs.length; i++) tightest = Math.min(tightest, xs[i] - xs[i - 1]);
      /* 44 px is just under the ~46 px a `09-18 F` label occupies at font-size 10, so this
       * does not assert a pretty layout -- it asserts the labels are not ON TOP of each
       * other. FIRST CUT OF THIS CHECK USED 24 px AND WAS HOLLOW FOR THE VERY CASE THAT
       * PROMPTED IT: with the guard injected out, 18 days measures 32.8 px -- overlapping,
       * since the label is wider than that -- and 24 px passed it. Caught by firing the
       * injection and reading the numbers per row rather than trusting INJECTION CAUGHT,
       * which was already true from the 90-day row alone. */
      ck(n + ' days: no two labels closer than 44 px (tightest ' + tightest.toFixed(1) + ' px)',
         tightest >= 44, tightest.toFixed(1) + ' px');
      var lastDrawn = xs[xs.length - 1];
      var svgLast = /<text x="([0-9.]+)"[^>]*text-anchor="middle">[^<]*<\/text>(?![\s\S]*text-anchor="middle")/.exec(svg);
      ck(n + ' days: the last day of the window is still labelled',
         !!svgLast && Math.abs(parseFloat(svgLast[1]) - lastDrawn) < 0.01, 'x=' + lastDrawn);
    });

    /* =================================================================== 8. legacy link */
    head('8. a legacy ?days=20 link still resolves, to the RIGHT span');
    // 20, not the more obvious 30, so this check is decoupled from the store-clamp behaviour
    // check 3 already covers — the fixture's recorded history only reaches back 24 days
    // from "today", and a `days=30` request would legitimately (and separately-testedly)
    // clamp short of 30 there.
    var p8 = await renderPage('&days=20');
    ck('it renders (no error) and reflects a 20-day window, not silently 7 or 90',
       !/class="err"/.test(p8) && />20<\/div><div class="k">Days<\/div>/.test(p8),
       (p8.match(/<div class="v">(\d+)<\/div><div class="k">Days/) || ['', '?'])[1] + ' days shown');

    /* ================================================== 10. breakdown sections migrated */
    head('10. the breakdown sections read the first-party store for closed days too (coordinator item 1)');
    // A pure-historical week (does not reach today) — every seeded row in it is
    // 'United States' / desktop / Chrome / Windows / direct, so a clean D1-only total is
    // exactly checkable, and NO live Cloudflare query for any of these five dimensions
    // should fire at all.
    var p10 = await renderPage('&from=2026-09-01&to=2026-09-07');
    var singleDimFired = ['requestPath', 'countryName', 'deviceType', 'userAgentBrowser', 'userAgentOS']
      .filter(function (d) { return SEEN.some(function (q) { return q.indexOf('dimensions { ' + d + ' }') >= 0; }); });
    ck('none of the five migrated single-dimension breakdowns hit Cloudflare for a window '
     + 'that never reaches today',
       singleDimFired.length === 0, singleDimFired.length ? 'fired: ' + singleDimFired.join(',') : 'none fired');
    ck('Countries shows the STORE’s total (56 pageloads, 28 landing visits, "United '
     + 'States" only — no "France", which only appears the prior week)',
       /<h2>Countries<\/h2>[\s\S]*?<td>United States<\/td><td class="num">56<\/td><td class="num">28<\/td>/.test(p10)
       && !/<h2>Countries<\/h2>[\s\S]*?France/.test(p10));
    ck('that section’s OWN source note says first-party, names this exact span, and never '
     + 'says Cloudflare',
       /<h2>Countries<\/h2><p class="muted">Source: <b>first-party exact<\/b> \(2026-09-01 to 2026-09-07\)/.test(p10)
       && !/<h2>Countries<\/h2>[\s\S]{0,300}Cloudflare/.test(p10));

    head('11. today folds INTO the migrated breakdown totals too, not just the by-day chart');
    var p11 = await renderPage('');   // default window, ends today — same fixture as check 2
    // D1 side for 'United States' over 09-12..09-17 (3 clean days at 7/day, 3 dead days) is
    // 42 pageloads / 21 visits; the live-today canned row (GENERIC_BREAKDOWN) adds 6 / 3.
    ck('Countries’ "United States" row is the D1 total PLUS today’s live 6 pageloads / '
     + '3 visits (48 / 24), not the D1 total alone',
       /<h2>Countries<\/h2>[\s\S]*?<td>United States<\/td><td class="num">48<\/td><td class="num">24<\/td>/.test(p11));
    ck('...and its source note says so — "plus today (...) live from Cloudflare"',
       /<h2>Countries<\/h2>[\s\S]{0,300}plus <b>today<\/b> \(2026-09-18\) live from Cloudflare/.test(p11));
    /* THE SAME live batch also carries a COARSE Germany row (GENERIC_BREAKDOWN's second
     * row, sampleInterval 10) beside the EXACT United States one. A per-key merge must mark
     * coarseness off each row's OWN sample interval — the defect was `if (g.coarse > 1)`,
     * the BATCH-WIDE maximum, which taints every key in the merge once any one row in it is
     * coarse. */
    ck('...and the coarse Germany row in that SAME batch does not taint the exact United '
     + 'States row — Germany is marked coarse, United States is not',
       /<h2>Countries<\/h2>[\s\S]*?<td>United States<\/td><td class="num">48<\/td><td class="num">24<\/td><td><\/td>/.test(p11)
       && /<h2>Countries<\/h2>[\s\S]*?<td>Germany<\/td><td class="num">3<\/td><td class="num">1<\/td><td>coarse \(±10\)<\/td>/.test(p11));

    /* ============================== 12. one window, everywhere (coordinator item 2) ===== */
    head('12. every section on the page names the SAME picked span — no section silently '
       + 'derives a different one');
    /* A BEHAVIOURAL form, not a source regex: every migrated, referrer and Cloudflare-only
     * section prints its own literal "(from to to)" span in its source note (added for
     * exactly this reason). Using p10 — a window that never reaches today — means every
     * section's span collapses to the SAME two dates, with no "closedTo vs to" distinction
     * to special-case. */
    var breakdownHtml = p10.slice(p10.indexOf('<h2>Traffic breakdown'));
    var spans = [];
    var spanRe = /\((\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})\)/g;
    var sm;
    while ((sm = spanRe.exec(breakdownHtml))) spans.push(sm[1] + '..' + sm[2]);
    ck('at least one span was found per breakdown section (5 migrated + 2 referrer + 3 '
     + 'Cloudflare-only = 10)',
       spans.length === 10, spans.length + ' span(s) found: ' + spans.join(', '));
    ck('...and EVERY one of them is exactly the picked range, 2026-09-01..2026-09-07 — no '
     + 'section quietly used a different window',
       spans.length > 0 && spans.every(function (s) { return s === '2026-09-01..2026-09-07'; }),
       spans.filter(function (s) { return s !== '2026-09-01..2026-09-07'; }).join(', ') || '(all match)');

    /* ============================ 13. the last two dimensions, migrated ================= */
    head('13. "How the page was reached" and "Bots" are migrated too (stats.js’s newest two dimensions)');
    var p13 = await renderPage('&from=2026-09-01&to=2026-09-07');
    var navBotFired = ['navigationType', 'bot'].filter(function (d) {
      return SEEN.some(function (q) { return q.indexOf('dimensions { ' + d + ' }') >= 0; });
    });
    ck('neither section hits Cloudflare for a window that never reaches today',
       navBotFired.length === 0, navBotFired.length ? 'fired: ' + navBotFired.join(',') : 'none fired');
    // 56/28 United States (checks 10-12's window) plus the 5/2 Canada row seeded below,
    // both nav_type 'navigate' — 61 pageloads, 30 visits.
    ck('"How the page was reached" shows the STORE’s total for "navigate" (61 / 30)',
       /<h2>How the page was reached<\/h2>[\s\S]*?<td>navigate<\/td><td class="num">61<\/td><td class="num">30<\/td>/.test(p13));
    ck('"Bots" shows ONLY "Human" (61 / 30, no bot=1 rows in this window) and warns its '
     + 'totals are not comparable with any other section',
       /<h2>Bots<\/h2>[\s\S]*?<td>Human<\/td><td class="num">61<\/td><td class="num">30<\/td>/.test(p13)
       && !/<h2>Bots<\/h2>[\s\S]*?<td>Bot<\/td>/.test(p13)
       && /<h2>Bots<\/h2>[\s\S]{0,300}INCLUDES BOT TRAFFIC/.test(p13));

    /* ============================ 14. referrer kind is STORED, never recomputed ========== */
    head('14. the referrer split uses the STORED kind — recomputing from the host alone gets this wrong');
    /* `preview.example.net` is seeded as referrer_kind 'internal' (a preview deployment
     * referring to itself, computed at rollup time with the real requestHost). Recomputing
     * with `referrerKind(host, null)` matches neither the reactordynamics.com nor the
     * *.pages.dev suffix rule and returns 'external' — the #604 finding inverted. */
    // Each section scoped to its own <h2>..next <h2> span — an unscoped lazy match would
    // find "preview.example.net" in Internal navigation's own text and call it a hit inside
    // How people arrive too, since that section comes first on the page (same trap as #4).
    var arriveSection14 = p13.slice(p13.indexOf('<h2>How people arrive</h2>'),
      p13.indexOf('<h2>', p13.indexOf('<h2>How people arrive</h2>') + 1));
    var internalSection14 = p13.slice(p13.indexOf('<h2>Internal navigation</h2>'),
      p13.indexOf('<h2>', p13.indexOf('<h2>Internal navigation</h2>') + 1));
    ck('preview.example.net sits under Internal navigation, not How people arrive',
       /preview\.example\.net/.test(internalSection14) && !/preview\.example\.net/.test(arriveSection14));

    /* ================================ 15. the presets NAVIGATE, they do not SUBMIT ==== */
    head('15. each range preset is a LINK carrying its own span — not a submit button');
    /* WHY A SUBMIT BUTTON CANNOT WORK HERE, and why every other check on this page stayed
     * green while the feature did not: a `formaction` URL's QUERY STRING is discarded on a
     * GET submission (HTML spec, "mutate action URL" — the form data set replaces it), so
     * the server saw the date inputs' current values and answered correctly for the window
     * it was actually asked about. The defect was entirely in what the browser SENT, which
     * is why `resolveWindow`'s 87 checks in run_dashboard_time.js could not see it. Assert
     * the href, which is the thing the browser acts on.
     *
     * Today is pinned to 2026-09-18, so 7d opens 09-12, 14d opens 09-05 and 30d 08-20. */
    var p15 = await renderPage('');
    [[7, '2026-09-12'], [14, '2026-09-05'], [30, '2026-08-20']].forEach(function (pair) {
      var n = pair[0], from = pair[1];
      ck(n + 'd is an <a> whose href opens on ' + from,
         p15.indexOf('<a class="pbtn" href="?view=analytics&amp;from=' + from
                     + '&amp;to=2026-09-18">' + n + 'd</a>') >= 0);
    });
    /* `<button[^>]*formaction`, not a bare /formaction/: the stylesheet's own comment
     * explains this defect and ships on every page, so the loose form fails on the fix's
     * documentation rather than on the markup. Caught by this check going red on its
     * first run — the word is in render.js's PAGE_HEAD. */
    ck('no preset is a submit button — a formaction query never reaches the server',
       !/<button[^>]*formaction/.test(p15));

    /* ====================== 16. an EMPTY arrivals set is not a vacuous "finding" ======== */
    head('16. "How people arrive" says nothing about an EMPTY arrivals set — [].every(...) is '
       + 'true on nothing, and that is not evidence');
    // 2026-08-27 is seeded as a REAL ZERO day (rollup_runs has a row, traffic_daily has
    // none) — `referrerBreakdown` returns zero rows, so `ext` is empty. The old code's
    // `ext.every((r) => r.kind === 'direct')` is vacuously true on an empty array, so it
    // used to print "nothing external referred anyone" as a finding with no rows behind it.
    var p16 = await renderPage('&from=2026-08-27&to=2026-08-27');
    ck('the section renders (no crash) but prints NO "nothing external referred anyone" claim '
     + 'when there is no arrival data at all',
       /<h2>How people arrive<\/h2>/.test(p16)
       && !/nothing[\s\S]{0,20}external referred anyone/.test(p16));

    /* ====================== 17. a missing day breaks the line, never joins through ====== */
    head('17. a missing day BREAKS the data line into segments and draws its own baseline '
       + 'tick — never joined through as a drop to zero (was: a weekly bucket with some '
       + 'uncaptured days drew a dashed outline; that folding is gone — see bucketDays\' '
       + 'header)');
    /* Same 21-day window the old weekly-bucket check used (2026-08-25..2026-09-14), now
     * >14 days so it draws lineChart. Two CONSECUTIVE missing days sit at indices 5-6
     * (08-30 no run at all, 08-31 traffic failed) among otherwise-clean days: joining
     * through them would draw a plunge from the 08-29 point down to zero and back up to
     * the 09-01 point — a two-day collapse that never happened, since 09-01 opens week A at
     * the same 4 landing visits/day as every other day in it. */
    var p17 = await renderPage('&from=2026-08-25&to=2026-09-14');
    var by17 = p17.slice(p17.indexOf('<h2>By day</h2>'), p17.indexOf('<h2>', p17.indexOf('<h2>By day</h2>') + 1));
    var pageloadSegs17 = (by17.match(/<polyline points="[^"]+" fill="none" stroke="#3987e5" stroke-width="2"\/>/g) || []).length;
    var visitSegs17 = (by17.match(/<polyline points="[^"]+" fill="none" stroke="#d95926" stroke-width="2"\/>/g) || []).length;
    ck('the pageloads line is drawn as exactly 2 segments (08-25..08-29, then 09-01..09-14) '
     + '— not 1 continuous polyline through the 2-day gap',
       pageloadSegs17 === 2, pageloadSegs17 + ' segment(s)');
    ck('...and so is the landing-visits line',
       visitSegs17 === 2, visitSegs17 + ' segment(s)');
    var missingTicks17 = (by17.match(/no data captured<\/title><\/line>/g) || []).length;
    ck('both uncaptured days (08-30, 08-31) draw their own dashed baseline tick',
       missingTicks17 === 2, missingTicks17 + ' tick(s)');
    ck('the coarse day (08-28) inside the same window keeps its own reduced-opacity marker '
     + '— never folded into a sum',
       /<circle[^>]*fill-opacity="0\.45"[^>]*><title>08-28 F — Pageloads: \d+ \(coarse, ±10\)<\/title>/.test(by17));
    ck('the legend now describes a BREAK in the line, not a dashed outline on a bar',
       /a break in the line, marked with a dashed tick at the baseline = no data captured/.test(by17)
       && !/dashed outline on a bar/.test(by17));

    /* ===================== 17b. today draws HOLLOW on the line, never solid ============= */
    head('17b. today (live, partial) draws a HOLLOW point on the line — never folded in as '
       + 'an ordinary closed day');
    var p17b = await renderPage('&from=2026-09-01&to=2026-09-18');   // 18 days, includes today
    var by17b = p17b.slice(p17b.indexOf('<h2>By day</h2>'), p17b.indexOf('<h2>', p17b.indexOf('<h2>By day</h2>') + 1));
    ck('today\'s pageloads point (11) is drawn hollow — fill="none", stroked, never solid',
       /<circle[^>]*fill="none" stroke="#3987e5" stroke-width="2"><title>09-18 F — Pageloads: 11 \(today, partial\)<\/title>/.test(by17b));
    ck('today\'s landing-visits point (7) is hollow too',
       /<circle[^>]*fill="none" stroke="#d95926" stroke-width="2"><title>09-18 F — Landing visits: 7 \(today, partial\)<\/title>/.test(by17b));
    ck('no OTHER day in the window carries the "(today, partial)" flag — exactly the 2 '
     + 'series points for today, none else',
       (by17b.match(/\(today, partial\)/g) || []).length === 2,
       (by17b.match(/\(today, partial\)/g) || []).length + ' flagged point(s)');

    /* ============== 18. a failed referrer fetch degrades, never crashes the page ========= */
    head('18. a failed live referrer fetch degrades BOTH referrer sections — never a 500 for '
       + 'the whole page');
    /* The fetch used to be awaited at the TOP LEVEL of analyticsPage, outside every
     * section()'s try/catch — one bad GraphQL call took the whole page down instead of
     * degrading just the two sections that read it. */
    FAIL_REFERRER = true;
    var p18 = null, threw18 = null;
    try { p18 = await renderPage(''); }
    catch (e) { threw18 = String(e && e.message || e); }
    finally { FAIL_REFERRER = false; }
    ck('the page still renders instead of throwing',
       !threw18, threw18 ? 'threw: ' + threw18 : 'rendered');
    ck('...both "How people arrive" and "Internal navigation" show their OWN error block',
       !!p18 && /<h2>How people arrive<\/h2><p class="err">query failed:/.test(p18)
       && /<h2>Internal navigation<\/h2><p class="err">query failed:/.test(p18),
       p18 ? 'checked' : '(no page — see previous check)');
    ck('...and the rest of the page rendered normally — By day and Countries are unaffected',
       !!p18 && /<h2>By day<\/h2>/.test(p18)
       && /<h2>Countries<\/h2><p class="muted">Source: <b>first-party exact<\/b>/.test(p18),
       p18 ? 'checked' : '(no page — see previous check)');

    /* ========================= 19. the "All" range preset (feature) ===================== */
    head('19. an "All" preset opens on the first recorded day through today, and is absent '
       + 'when the store is empty');
    var p19 = await renderPage('');
    ck('an <a class="pbtn"> "All" link opens on the store’s first day (2026-08-25) through today',
       p19.indexOf('<a class="pbtn" href="?view=analytics&amp;from=2026-08-25'
                   + '&amp;to=2026-09-18">All</a>') >= 0);
    var emptyDb = makeDb();
    var emptyUrl = new URL('https://example.invalid/dashboard?view=analytics');
    var emptyRes = await A.analyticsPage({ STATS: emptyDb, CF_ANALYTICS_TOKEN: 'tok' }, emptyUrl);
    var emptyBody = await emptyRes.text();
    ck('with an empty store, no "All" preset renders at all',
       !/>All<\/a>/.test(emptyBody) && /No first-party history recorded yet/.test(emptyBody));

    /* ============ 20. "Country × referrer × day" reads the store for closed days ========= */
    head('20. "Country × referrer × day" reads the first-party store for closed days '
       + '(#791 follow-up — it used to stay Cloudflare-only for the whole window)');
    var p20a = await renderPage('&from=2026-09-01&to=2026-09-07');
    var cday20aStart = p20a.indexOf('<h2>Country × referrer × day</h2>');
    var cday20a = p20a.slice(cday20aStart, p20a.indexOf('<h2>', cday20aStart + 1));
    ck('a window that never reaches today issues NO live Cloudflare query for this dimension combination',
       !SEEN.some(function (q) { return /dimensions \{ countryName refererHost requestHost bot \}/.test(q); }));
    ck('the table holds exactly the store’s rows for the window — 7 daily United States rows '
     + 'plus the Canada/preview.example.net row on 09-03 (8 data rows + 1 header = 9 <tr>)',
       (cday20a.match(/<tr>/g) || []).length === 9,
       (cday20a.match(/<tr>/g) || []).length + ' <tr>');
    ck('the Canada/preview.example.net row carries the STORED kind (internal), never recomputed '
     + 'from the host alone',
       /<td>2026-09-03<\/td><td>Canada<\/td><td>preview\.example\.net<\/td><td>internal<\/td><td class="num">5<\/td><td class="num">2<\/td><td><\/td>/.test(cday20a));
    ck('the section’s own source note says first-party exact for this exact span, and never '
     + 'mentions today — the window does not reach it',
       /Source: <b>first-party exact<\/b> \(2026-09-01 to 2026-09-07\)/.test(cday20a)
       && !/plus <b>today<\/b>/.test(cday20a));

    /* =========== 21. today folds in live, per-row coarse never taints the batch ========== */
    head('21. today folds INTO "Country × referrer × day" live, and per-row coarse never '
       + 'taints the whole batch');
    var p20b = await renderPage('');   // default window, ends today
    var liveFired20b = SEEN.some(function (q) { return /dimensions \{ countryName refererHost requestHost bot \}/.test(q); });
    var cday20bStart = p20b.indexOf('<h2>Country × referrer × day</h2>');
    var cday20b = p20b.slice(cday20bStart, p20b.indexOf('<h2>', cday20bStart + 1));
    ck('the default window (ending today) DOES issue the live query for this section',
       liveFired20b);
    ck('today’s United States/direct row is EXACT (5/2, no coarse note)',
       /<td>2026-09-18<\/td><td>United States<\/td><td>\(direct\)<\/td><td>direct<\/td><td class="num">5<\/td><td class="num">2<\/td><td><\/td>/.test(cday20b));
    ck('today’s Germany/news.ycombinator.com row in the SAME live batch is marked coarse and '
     + 'classified external (matches neither the reactordynamics.com nor the pages.dev rule)',
       /<td>2026-09-18<\/td><td>Germany<\/td><td>news\.ycombinator\.com<\/td><td>external<\/td><td class="num">3<\/td><td class="num">1<\/td><td>coarse \(±10\)<\/td>/.test(cday20b));
    ck('...and the exact United States row on the SAME day is not tainted by Germany’s coarseness',
       !/United States[\s\S]{0,10}coarse/.test(cday20b));
    ck('the source note says "plus today (...) live from Cloudflare"',
       /plus <b>today<\/b> \(2026-09-18\) live from Cloudflare/.test(cday20b));

    /* ====== 22. an uncaptured day never renders as a zero row, and the note says so ====== */
    head('22. an uncaptured day never renders as a zero row in "Country × referrer × day" — '
       + 'and the source note names it plainly');
    var p20c = await renderPage('&from=2026-08-25&to=2026-08-31');
    var cday20cStart = p20c.indexOf('<h2>Country × referrer × day</h2>');
    var cday20c = p20c.slice(cday20cStart, p20c.indexOf('<h2>', cday20cStart + 1));
    ck('neither uncaptured day (08-30 no run at all, 08-31 traffic failed) appears as a row — '
     + 'not even a zero one',
       !/<td>2026-08-30<\/td>/.test(cday20c) && !/<td>2026-08-31<\/td>/.test(cday20c));
    ck('the REAL-zero day (08-27, ran fine, nobody came) also draws no row — same absence as '
     + 'an uncaptured day; only the NOTE tells the two apart',
       !/<td>2026-08-27<\/td>/.test(cday20c));
    ck('the table holds exactly the 5 real rows (08-25, 08-26, 08-28 France, 08-29 US, '
     + '08-29 France) plus its header (6 <tr>)',
       (cday20c.match(/<tr>/g) || []).length === 6,
       (cday20c.match(/<tr>/g) || []).length + ' <tr>');
    ck('the coarse day (08-28, France) is marked in its OWN row',
       /<td>2026-08-28<\/td><td>France<\/td><td>\(direct\)<\/td><td>direct<\/td><td class="num">20<\/td><td class="num">10<\/td><td>coarse \(±10\)<\/td>/.test(cday20c));
    ck('the source note plainly names which days were never captured, ascending',
       /No data captured<\/b> for 2026-08-30, 2026-08-31/.test(cday20c));

    /* =================================================================== 9. no token= */
    head('9. no rendered page anywhere carries a credential in a href');
    var leaked = ALL_HTML.filter(function (h) { return /token=/.test(h); });
    ck('across all ' + ALL_HTML.length + ' pages rendered this run, none contains "token="',
       leaked.length === 0, leaked.length ? leaked.length + ' page(s) leaked it' : 'clean');
  } finally {
    Date.now = realNow;
  }

  tally();
})().catch(function (e) {
  ck('the run completed without an unhandled exception', false, String(e && e.message || e).slice(0, 160));
  console.log(RED + (e && e.stack ? String(e.stack).split('\n').slice(0, 4).join('\n') : '') + RST);
  tally();
});

function tally() {
  console.log('\n' + BOLD + (nFail === 0 ? GREEN + 'PASS' : RED + 'FAIL') + RST +
    '  ' + nPass + ' passed, ' + nFail + ' failed, ' + (nPass + nFail) + ' checks');
  if (INJECT) {
    var caught = nFail > 0;
    console.log((caught ? GREEN + 'INJECTION CAUGHT' : RED + 'INJECTION MISSED') + RST +
      ' — "' + INJECT + '" reddened ' + nFail + ' check(s).' + (caught ? '' : ' THE GATE IS HOLLOW HERE.'));
    process.exit(caught ? 0 : 1);
  }
  process.exit(nFail === 0 ? 0 : 1);
}
