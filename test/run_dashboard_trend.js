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
 *   6. THE TREND LINE JOINS THROUGH A GAP. A null ghost (prior-period) value means the
 *      matching prior-period day was coarse or uncaptured, not zero — drawing a line
 *      through it shows a dip that never happened. (The OTHER trend line this file used to
 *      guard, a 7-day trailing mean, was REMOVED 2026-09-20 — owner: "get rid of the
 *      weekly average" — see section 6 below for what replaced its coverage.)
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

/* DEEP-LINK LANDINGS FIXTURES (#795 follow-up) — their OWN, ISOLATED databases, not rows
 * added to the shared `seed()` store above. Every day in that store is already load-
 * bearing for an exact sum somewhere in this file (checks 1-2's period-over-period delta
 * alone spans 2026-09-05..2026-09-18 — the "prior 7 days" plus the default window — and
 * combined with checks 1/10/13/20a's 2026-09-01..2026-09-07 and check 20c's
 * 2026-08-25..2026-08-31, there is no day left that is not part of some exact total).
 * Same idiom check 19 already uses for the empty-store case: a fresh `makeDb()` and a
 * direct `A.analyticsPage()` call rather than the shared `renderPage()` helper. */
function seedDeepLinkClosed() {
  var d = makeDb();
  // One DIRECT non-home landing (the bookmark case — must count) and one EXTERNAL one
  // (search discovery of a subpage — must NOT), on a day that never reaches "today".
  d._ins('traffic_daily', { day: '2026-09-09', country: 'Australia', referrer_host: '',
    referrer_kind: 'direct', path: '/ui/shell', device: 'desktop', browser: 'Chrome',
    os: 'Windows', nav_type: 'navigate', bot: 0, pageloads: 6, visits: 5, sample_interval: 1 });
  d._ins('traffic_daily', { day: '2026-09-09', country: 'Australia', referrer_host: 'www.google.com',
    referrer_kind: 'external', path: '/about', device: 'desktop', browser: 'Chrome',
    os: 'Windows', nav_type: 'navigate', bot: 0, pageloads: 1, visits: 1, sample_interval: 1 });
  d._ins('rollup_runs', { day: '2026-09-09', ran_at: '2026-09-09T05:10:00Z', traffic_rows: 2,
    usage_rows: 0, coarse: 0, note: '' });
  return d;
}
// A window that DOES reach "today" (2026-09-18, per FAKE_NOW below), so the closed side
// combines with `DEEPLINK_LIVE`'s canned Cloudflare batch (a direct home row, a direct
// non-home row, and an external non-home row) through the SAME merge.
function seedDeepLinkLive() {
  var d = makeDb();
  d._ins('traffic_daily', { day: '2026-09-17', country: 'United States', referrer_host: '',
    referrer_kind: 'direct', path: '/', device: 'desktop', browser: 'Chrome', os: 'Windows',
    nav_type: 'navigate', bot: 0, pageloads: 14, visits: 7, sample_interval: 1 });
  d._ins('rollup_runs', { day: '2026-09-17', ran_at: '2026-09-17T05:10:00Z', traffic_rows: 1,
    usage_rows: 0, coarse: 0, note: '' });
  return d;
}

/* DEEP-LINK LANDINGS, PLOTTED PER DAY (owner, 2026-09-20: "show that per day and plot it on
 * the main plot"). An isolated fixture, own dates, well clear of "today" (2026-09-18) so
 * every day here is CLOSED and the assertions do not have to reason about a live merge —
 * that half is already proven by check 23b above. One of each kind of day this new reader
 * has to tell apart, same convention section 3/4's `dailyTotals` fixture uses:
 *   day 1  2 deep-link landings (plus a same-day home landing that must not count)
 *   day 2  a REAL ZERO for deep-link landings — every landing that day is the homepage
 *   day 3  exactly 1 deep-link landing — the "must still read at a value of 1" case
 *   day 4  UNCAPTURED — no rollup_runs row at all
 *   day 5..n  filler clean days (no deep-link landings), so a >14-day request has real
 *             content past the boundary without inventing more deep-link cases than above */
function seedDeepLinkByDay(nDays) {
  var d = makeDb();
  traffic(d, '2026-09-01', 'United States', 4, 2, 1, 0);
  d._ins('traffic_daily', { day: '2026-09-01', country: 'United States', referrer_host: '',
    referrer_kind: 'direct', path: '/ui/shell', device: 'desktop', browser: 'Chrome',
    os: 'Windows', nav_type: 'navigate', bot: 0, pageloads: 4, visits: 2, sample_interval: 1 });
  ran(d, '2026-09-01', 2, 1);
  traffic(d, '2026-09-02', 'United States', 10, 6, 1, 0);
  ran(d, '2026-09-02', 1, 1);
  d._ins('traffic_daily', { day: '2026-09-03', country: 'United States', referrer_host: '',
    referrer_kind: 'direct', path: '/ui/shell', device: 'desktop', browser: 'Chrome',
    os: 'Windows', nav_type: 'navigate', bot: 0, pageloads: 2, visits: 1, sample_interval: 1 });
  ran(d, '2026-09-03', 1, 1);
  // day 4: no rollup_runs row at all -- UNCAPTURED.
  for (var i = 5; i <= (nDays || 4); i++) {
    var day = '2026-09-' + (i < 10 ? '0' + i : i);
    traffic(d, day, 'United States', 4, 2, 1, 0);
    ran(d, day, 1, 1);
  }
  return d;
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
/* DEEP-LINK LANDINGS' OWN LIVE BATCH (#795 follow-up) — a THIRD dimension combination
 * (`requestPath refererHost requestHost bot`) distinct from both `GENERIC_BREAKDOWN`'s
 * ("requestPath bot", used by Top pages/Countries/Devices/Browser/OS) and the referrer
 * sections' ("refererHost requestHost bot"), so this fixture answers ONLY the Deep-link
 * Landings live query and cannot silently change any other section's total. One DIRECT
 * home row (so the window still has ordinary traffic), one DIRECT non-home row (must
 * count), one EXTERNAL non-home row (must NOT count — the exact narrowing being proven). */
var DEEPLINK_LIVE = { rumPageloadEventsAdaptiveGroups: [
  { count: 8, avg: { sampleInterval: 1 }, sum: { visits: 4 }, dimensions: {
    requestPath: '/', refererHost: '', requestHost: 'reactordynamics.com', bot: 0 } },
  { count: 6, avg: { sampleInterval: 1 }, sum: { visits: 5 }, dimensions: {
    requestPath: '/ui/shell', refererHost: '', requestHost: 'reactordynamics.com', bot: 0 } },
  { count: 2, avg: { sampleInterval: 1 }, sum: { visits: 1 }, dimensions: {
    requestPath: '/about', refererHost: 'www.google.com', requestHost: 'reactordynamics.com', bot: 0 } },
] };
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

/* Set to a batch for exactly one render (check 28) to stand in for TODAY_LIVE — a full
 * 25-hour Eastern day with every hour touched by a bot, which is the shape that makes the
 * group LIMIT load-bearing. Null everywhere else, so no other check's totals move. */
var HOURLY_WIDE = null;

/* THE LIMIT IS PART OF THE ANSWER, so the fake honours it. Cloudflare truncates a group
 * query at `limit:` and says nothing — the rows simply stop, which reads as a quiet
 * evening rather than as a truncation. A fake that returns its whole canned batch
 * regardless can never show that, so every check in this file was blind to an undersized
 * limit however the number had been derived. TODAY_LIVE is 3 rows against a limit of 50,
 * so this changes nothing for any other check; only a fixture deliberately wider than the
 * limit can see it. */
function limited(batch, s) {
  var m = /limit: (\d+)/.exec(s);
  if (!m) return batch;
  return { rumPageloadEventsAdaptiveGroups:
    (batch.rumPageloadEventsAdaptiveGroups || []).slice(0, +m[1]) };
}

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
  if (has('dimensions { datetimeHour bot }')) return limited(HOURLY_WIDE || TODAY_LIVE, s);
  if (has('dimensions { countryName refererHost requestHost bot }')) return THREE_DIM;
  if (has('dimensions { requestPath refererHost requestHost bot }')) return DEEPLINK_LIVE;
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
    'const closedRows = from <= closedTo ? await dailyTotals(db, from, closedTo) : [];',
    'const closedRows = [];'],
  'today-not-live': ['analytics.js', 'if (includesToday) {', 'if (false) {'],
  'window-error-swallowed': ['analytics.js',
    'catch (e) { return { error: e.message }; }', 'catch (e) { return { from: today, to: today }; }'],
  'clamp-drop': ['analytics.js', 'if (sr && from < sr.first) {', 'if (false) {'],
  /* RE-ANCHORED (found blind while re-firing every injection for #797: the deep-link-per-
   * day merge landed between this fix and the anchor's last check, `coarse: c.coarse,`
   * became `coarse: c.coarse || dl.coarse,`, and the old anchor silently never matched —
   * the exact "source moved, injection never touches the module" trap this file's own
   * header warns about, on a check nothing else re-fires). */
  'coarse-hide': ['analytics.js',
    'return { day, pageloads: c.pageloads, visits: c.visits, coarse: c.coarse || dl.coarse,',
    'return { day, pageloads: c.pageloads, visits: c.visits, coarse: false,'],
  'delta-always-ok': ['analytics.js',
    "const deltaLine = '<p>' + (delta.ok", "const deltaLine = '<p>' + (true"],
  'ghost-draws-to-zero': ['render.js',
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
  /* #797 item 5. The limit as it shipped: 26, sized for the dimension ASKED FOR while
   * `rumGroup` groups on hour x bot. Ordered ASC, so it truncates the EVENING. The fake
   * `gql` honours `limit:` (see `limited`), so this is a behavioural red, not a spelling
   * one — check 28's tile drops from 25 pageloads to 13. */
  'hourly-limit-26': ['analytics.js',
    "      const g = rumRows(await gql(apiToken, rumGroup('datetimeHour', 'datetimeHour_ASC', 50,",
    "      const g = rumRows(await gql(apiToken, rumGroup('datetimeHour', 'datetimeHour_ASC', 26,"],
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
  /* DEEP-LINK LANDINGS (#795). THE OFF-BY-ONE THAT INVERTS THE METRIC: counting the
   * HOMEPAGE as a deep-link landing instead of everything that is not it. */
  'deeplink-home-counted': ['analytics.js',
    "    const deepRows = rows.filter((r) => r.path !== '/' && r.referrerKind === 'direct');",
    "    const deepRows = rows.filter((r) => r.path === '/');"],
  /* THE NARROWING #795's FOLLOW-UP MADE, PUT BACK: counting ANY non-home landing
   * regardless of referrer — which counts search-engine DISCOVERY of a subpage
   * (`/about`, `/download`) as though it were a returning visitor's bookmark. */
  'deeplink-external-counted': ['analytics.js',
    "    const deepRows = rows.filter((r) => r.path !== '/' && r.referrerKind === 'direct');",
    "    const deepRows = rows.filter((r) => r.path !== '/');"],
  /* THE SECTION READS CLOUDFLARE INSTEAD OF THE STORE for closed days — the same shape
   * `breakdown-skips-d1` proves for the generic breakdowns, here for the dedicated reader. */
  'deeplink-skips-store': ['analytics.js',
    'const closed = from <= closedTo ? await deepLinkLandings(db, from, closedTo, 1000) : { total: 0, deepLink: 0, coarse: false, byPath: [] };',
    'const closed = { total: 0, deepLink: 0, coarse: false, byPath: [] };'],
  /* DEEP-LINK LANDINGS, PER DAY, ON THE BY-DAY CHART (owner, 2026-09-20: "show that per
   * day and plot it on the main plot"). Four behaviours, same shapes the sections above
   * already prove for the TOTAL form, now for the per-day merge that feeds the chart/table. */
  'deeplink-byday-skips-store': ['analytics.js',
    'const closedDeepLink = from <= closedTo ? await deepLinkLandingsByDay(db, from, closedTo) : [];',
    'const closedDeepLink = [];'],
  'deeplink-byday-live-not-merged': ['analytics.js',
    "const dl = rumRows(await gql(apiToken, rumGroup('requestPath refererHost requestHost',",
    "const dl = { rows: [] }; false && rumRows(await gql(apiToken, rumGroup('requestPath refererHost requestHost',"],
  'deeplink-byday-live-home-counted': ['analytics.js',
    "deepLink: dl.rows.filter((r) => r.path !== '/' && r.referrerKind === 'direct')",
    "deepLink: dl.rows.filter((r) => r.path === '/')"],
  'deeplink-byday-live-external-counted': ['analytics.js',
    "deepLink: dl.rows.filter((r) => r.path !== '/' && r.referrerKind === 'direct')",
    "deepLink: dl.rows.filter((r) => r.path !== '/')"],
  /* THE PIPELINE-HEALTH LINE (#797 item 2). */
  /* The anchor carries its trailing newline on purpose: '    + pipelineLine' alone is also
   * a SUBSTRING of the `!apiToken` branch's '      + pipelineLineNoToken' a few dozen lines
   * up, and a bare split/join would silently corrupt THAT line's `+` operator too (found by
   * firing this injection and getting a SyntaxError instead of the one check it should
   * redden — worse than no injection, since it never touched the composition it targets). */
  'pipeline-not-wired': ['analytics.js', '    + pipelineLine\n', ''],
  'health-note-inverted': ['analytics.js',
    '  return { tokens, warn: tokens.filter((t) => !QUIET_NOTE.test(t)) };',
    '  return { tokens, warn: tokens.filter((t) => QUIET_NOTE.test(t)) };'],
  'health-stale-never-fires': ['analytics.js',
    '  const stale = Number.isFinite(hoursSince) && hoursSince > STALE_HOURS;', '  const stale = false;'],
  'health-gap-silent': ['analytics.js', '  if (gaps.length) {', '  if (false) {'],
  /* THE FIVE REMAINING "coarse (±10)" LITERALS (#797). `si-not-carried` blanks the per-row
   * merge in `hybridBreakdown`/`hybridDeepLink`/`hybridReferrer` at once -- identical text,
   * same "one physical line, several call sites" shape `batch-coarse-taints-row` already
   * uses next door. `coarse-note-hardcoded` reverts all four render sites that print a row's
   * OWN note (by-day table, breakdownTable, Bots, referrerTable) back to the universal
   * literal. `legend-si-hardcoded`/`legend-worstsi-blind` are two different ways the chart
   * legend's own figure could go back to a hard-coded 10. */
  'si-not-carried': ['analytics.js', 'cur.si = Math.max(cur.si || 1, r.si || 1);', ''],
  'coarse-note-hardcoded': ['analytics.js',
    "(r.si > 1 ? 'coarse (±' + r.si + ')' : 'coarse')", "'coarse (±10)'"],
  'legend-si-hardcoded': ['analytics.js', '(worstSi > 1 ? worstSi : 10)', '10'],
  'legend-worstsi-blind': ['analytics.js',
    'const worstSi = rows.reduce((m, r) => Math.max(m, r.coarse ? (r.si || 1) : 1), 1);',
    'const worstSi = 1;'],
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
  // Same as `renderPage`, against a CALLER-SUPPLIED database rather than the shared
  // `seed()` store — for a fixture that needs to be isolated from every other check's
  // exact totals (see `seedDeepLinkClosed`/`seedDeepLinkLive`'s own header).
  async function renderPageOn(db2, qs) {
    SEEN.length = 0;
    var url = new URL('https://example.invalid/dashboard?view=analytics' + (qs || ''));
    var res = await A.analyticsPage({ STATS: db2, CF_ANALYTICS_TOKEN: 'tok' }, url);
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
    head('6. the ghost (prior-period) line skips a null gap instead of drawing to zero — '
       + 'REPOINTED here 2026-09-20 (owner: "get rid of the weekly average on that plot" '
       + 'removed the mean/7-day-average line this section used to cover; the shared '
       + 'null-skip logic in render.js is untouched, so the injection that guards it, '
       + 'renamed ghost-draws-to-zero, is proven against ghost instead)');
    var p6 = await renderPage('&from=2026-09-01&to=2026-09-07');
    /* This window's PRIOR period is 08-25..08-31 — the fixture's own coarse/missing week
     * (checks 4 and 17 use the same days) — so its per-day ghost values are
     * [6, 5, 0, null, 5, null, null]: three clean days (08-25..08-27, the middle one a REAL
     * ZERO, not missing) form ONE drawable run, the 08-28 COARSE day breaks it, the lone
     * 08-29 point (index 4) is one point — too short to draw, a polyline needs more than
     * one — and 08-30/08-31 being MISSING leaves nothing after it. */
    var ghostRe = /<polyline points="([^"]+)" fill="none" stroke="#8fa2b3" stroke-width="2" stroke-dasharray="5,4"\/>/;
    var ghostPolys = p6.match(new RegExp(ghostRe.source, 'g')) || [];
    ck('exactly ONE ghost polyline is drawn — the lone index-4 point stays a gap, not a '
     + 'one-point line joined to its neighbours',
       ghostPolys.length === 1, ghostPolys.length + ' ghost polyline(s)');
    var ghostMatch = ghostRe.exec(p6);
    ck('a ghost polyline is drawn at all', !!ghostMatch, ghostMatch ? 'found' : 'NOT FOUND');
    if (ghostMatch) {
      var gpts = ghostMatch[1].trim().split(/\s+/);
      var gFirstX = parseFloat(gpts[0].split(',')[0]);
      var GPADL = 34, gplotW = 720 - 34 - 96, gslot = gplotW / 7;
      var gExpectFirstX = GPADL + 0 * gslot + gslot / 2;   // day index 0 (2026-09-01)
      ck('it has exactly 3 points (08-25..08-27 — the run the 08-28 coarse day breaks)',
         gpts.length === 3, gpts.length + ' points');
      ck('...and the FIRST point sits at day index 0 — the gap that follows it does not '
       + 'shift where the run starts',
         Math.abs(gFirstX - gExpectFirstX) < 1, 'x=' + gFirstX.toFixed(1) + ' vs expected ' + gExpectFirstX.toFixed(1));
    } else {
      ck('it has exactly 3 points', false, 'no polyline to inspect');
      ck('...and the FIRST point sits at day index 0', false, 'no polyline to inspect');
    }
    ck('the mean (7-day trailing average) line is GONE from the page entirely — no #5fd9a0 '
     + 'stroke anywhere, and no "7d mean"/"trailing mean" label',
       !/#5fd9a0/.test(p6) && !/7d mean/.test(p6) && !/trailing mean/.test(p6));

    /* =================================================================== 7. no bucketing */
    head('7. bucketDays NEVER buckets any more, at 7 / 30 / 45 / 400 days (rewritten '
       + '2026-09-20 — a >14-day window draws lineChart, one point per day, instead of '
       + 'folding into weekly/monthly bars; see section 7b for what replaced this)');
    function mkRows(n) {
      var rows = [], d = new Date('2026-01-01T00:00:00Z');
      for (var i = 0; i < n; i++) {
        rows.push({ day: d.toISOString().slice(0, 10), pageloads: 1, visits: 1, deepLink: 0,
          coarse: false, missing: false, partial: false, ghost: null });
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
      // One real ghost value so the direct-label collision-avoidance path is exercised too
      // (the mean line this used to set is gone — see section 6).
      rows[rows.length - 1].ghost = 3;
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
    ck('at least one span was found per breakdown section (6 migrated, incl. Deep-link '
     + 'landings, + 2 referrer + 3 Cloudflare-only = 11)',
       spans.length === 11, spans.length + ' span(s) found: ' + spans.join(', '));
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
    ck('today\'s deep-link-landings point (5, from the live DEEPLINK_LIVE batch) is hollow '
     + 'too — the third series carries the same partial treatment as the first two',
       /<circle[^>]*fill="none" stroke="#a374db" stroke-width="2"><title>09-18 F — Deep-link landings: 5 \(today, partial\)<\/title>/.test(by17b));
    ck('no OTHER day in the window carries the "(today, partial)" flag — exactly the 3 '
     + 'series points for today (pageloads, landing visits, deep-link landings), none else',
       (by17b.match(/\(today, partial\)/g) || []).length === 3,
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

    /* =========== 23. Deep-link landings — not the homepage, AND no referrer (#795 f/u) ==== */
    head('23. Deep-link landings — narrowed to path <> "/" AND referrer_kind = "direct"');
    /* ISOLATED database (`seedDeepLinkClosed`, above): a DIRECT non-home landing (must
     * count) and an EXTERNAL one (search discovery of a subpage — must NOT), and nothing
     * else in the store, so the totals are exactly the two rows. */
    var p23a = await renderPageOn(seedDeepLinkClosed(), '&from=2026-09-09&to=2026-09-09');
    var dl23aStart = p23a.indexOf('<h2>Deep-link landings</h2>');
    var dl23a = p23a.slice(dl23aStart, p23a.indexOf('<h2>', dl23aStart + 1));
    ck('the section exists and states the definition, the referrer exclusion, and the '
     + 'floor/not-a-count caveat',
       dl23aStart >= 0 && /is not the homepage/.test(dl23a) && /NO REFERRER at all/.test(dl23a)
       && /that is discovery, the/.test(dl23a) && /FLOOR on returning visitors/.test(dl23a)
       && /counted[\s\S]{0,10}wrongly as one/.test(dl23a),
       dl23aStart >= 0 ? 'section found' : 'section missing');
    ck('5 of 6 landing visits (83.3%) — only the DIRECT /ui/shell landing counts, not the '
     + 'external /about row',
       /<b>5 of 6 landing visits<\/b> \(83\.3%\)/.test(dl23a), dl23a.match(/<b>[^<]*<\/b> \([^)]*\)/) || 'no match');
    ck('THE EXACT DEFECT THIS NARROWING FIXES: the breakdown lists /ui/shell and NEVER '
     + '/about (external, non-home)',
       /<td>\/ui\/shell<\/td><td class="num">6<\/td><td class="num">5<\/td>/.test(dl23a)
       && !/\/about/.test(dl23a), 'checked');
    ck('its own source note names this exact span and never mentions today',
       /<h2>Deep-link landings<\/h2><p class="muted">Source: <b>first-party exact<\/b> \(2026-09-09 to 2026-09-09\)/.test(p23a)
       && !/<h2>Deep-link landings<\/h2>[\s\S]{0,400}plus <b>today<\/b>/.test(p23a));

    /* A window that DOES reach today, so the SAME direct-vs-external exclusion is proven on
     * the LIVE half of the merge too: `DEEPLINK_LIVE` carries a direct home row, a direct
     * non-home row (must count) and an external non-home row (must not), in the SAME batch
     * as `seedDeepLinkLive`'s single closed-store day (7 landing visits, home, direct).
     * Total = 7 (closed) + 4 + 5 + 1 (live) = 17; deep-link = 0 (closed) + 5 (live) = 5. */
    var p23b = await renderPageOn(seedDeepLinkLive(), '&from=2026-09-17&to=2026-09-18');
    var dl23bStart = p23b.indexOf('<h2>Deep-link landings</h2>');
    var dl23b = p23b.slice(dl23bStart, p23b.indexOf('<h2>', dl23bStart + 1));
    ck('5 of 17 landing visits (29.4%) — the LIVE direct /ui/shell row counts, the LIVE '
     + 'external /about row does not, proving the exclusion applies to today’s merge too',
       /<b>5 of 17 landing visits<\/b> \(29\.4%\)/.test(dl23b), dl23b.match(/<b>[^<]*<\/b> \([^)]*\)/) || 'no match');
    ck('the breakdown lists /ui/shell and never /about or the homepage, same rule as check 23a',
       /<td>\/ui\/shell<\/td><td class="num">6<\/td><td class="num">5<\/td>/.test(dl23b)
       && !/\/about/.test(dl23b) && !/<td>\/<\/td>/.test(dl23b), 'checked');
    ck('its source note says "plus today (...) live from Cloudflare", same as every other '
     + 'migrated section on a window that reaches it',
       /plus <b>today<\/b> \(2026-09-18\) live from Cloudflare/.test(dl23b));

    // A window with NO non-home landings of any kind (the SHARED store, day 2026-09-01,
    // read-only — no rows added, safe alongside every other check on that store) — the
    // pre-existing "share is legitimately 0%, not blank" case, unaffected by the narrowing
    // (there was nothing to narrow away here in the first place).
    var p23c = await renderPage('&from=2026-09-01&to=2026-09-01');
    var dl23cStart = p23c.indexOf('<h2>Deep-link landings</h2>');
    var dl23c = p23c.slice(dl23cStart, p23c.indexOf('<h2>', dl23cStart + 1));
    ck('0 of 4 landing visits (0%) when every landing in the window is the homepage — not '
     + 'blank, not omitted',
       /<b>0 of 4 landing visits<\/b> \(0%\)/.test(dl23c), dl23c.match(/<b>[^<]*<\/b> \([^)]*\)/) || 'no match');
    ck('...and says so in place of a breakdown table',
       /No deep-link landings in this window/.test(dl23c));

    // The zero-DENOMINATOR case: a real-zero closed day, on its own, with no live fold-in.
    var p23d = await renderPage('&from=2026-08-27&to=2026-08-27');
    var dl23dStart = p23d.indexOf('<h2>Deep-link landings</h2>');
    var dl23d = p23d.slice(dl23dStart, p23d.indexOf('<h2>', dl23dStart + 1));
    ck('a window with zero landing visits reads "no landing visits in this window" — never '
     + 'NaN%, never Infinity%, never a bare 0%',
       /<b>0 of 0 landing visits<\/b> \(no landing visits in this window\)/.test(dl23d)
       && !/NaN/.test(dl23d) && !/Infinity/.test(dl23d));

    /* ============================ 24. deep-link landings, PER DAY ======================= */
    head('24. deep-link landings PLOTTED PER DAY on the by-day chart and table (owner, '
       + '2026-09-20: "show that per day and plot it on the main plot")');
    var pDLbar = await renderPageOn(seedDeepLinkByDay(4), '&from=2026-09-01&to=2026-09-04');
    var dlBarSection = pDLbar.slice(pDLbar.indexOf('<h2>By day</h2>'), pDLbar.indexOf('<h2>', pDLbar.indexOf('<h2>By day</h2>') + 1));
    ck('the by-day TABLE carries a Deep-link landings column',
       /<th class="num">Deep-link landings<\/th>/.test(dlBarSection));
    ck('day 1 (2 deep-link landings, plus a same-day home landing that must not add to it) '
     + 'shows 2 in that column, against 8 pageloads / 4 landing visits total',
       /<td>2026-09-01[^<]*<\/td><td class="num">8<\/td><td class="num">4<\/td><td class="num">2<\/td><td><\/td>/.test(dlBarSection),
       dlBarSection.match(/<td>2026-09-01[^<]*<\/td>(?:<td[^>]*>[^<]*<\/td>){4}/) || 'no row match');
    ck('day 3 (exactly ONE deep-link landing — must still read as a value, not vanish) shows 1',
       /<td>2026-09-03[^<]*<\/td><td class="num">2<\/td><td class="num">1<\/td><td class="num">1<\/td><td><\/td>/.test(dlBarSection));
    ck('day 2 is a REAL ZERO for deep-link landings (every landing that day was the '
     + 'homepage) — 0, not blank, and NOT marked "no data captured"',
       /<td>2026-09-02[^<]*<\/td><td class="num">10<\/td><td class="num">6<\/td><td class="num">0<\/td><td><\/td>/.test(dlBarSection));
    ck('day 4 (no rollup run at all) is marked "no data captured" — distinguishing it from '
     + 'day 2’s real zero, though both read deep-link 0',
       /<td>2026-09-04[^<]*<\/td><td class="num">0<\/td><td class="num">0<\/td><td class="num">0<\/td><td>no data captured<\/td>/.test(dlBarSection));
    ck('the chart draws a THIRD bar series for deep-link landings, in its own colour '
     + '(#a374db), on the day with 2',
       /fill="#a374db"><title>09-01[^—]* — Deep-link landings: 2<\/title>/.test(dlBarSection));
    ck('...and it is still visible — a bar is drawn — at a value of exactly 1',
       /fill="#a374db"><title>09-03[^—]* — Deep-link landings: 1<\/title>/.test(dlBarSection));
    ck('...and draws NO bar for the real-zero day — 0 height, the same rule pageloads/'
     + 'visits already follow, not a special case for this series',
       !/Deep-link landings: 0/.test(dlBarSection));
    ck('the 7-day mean line is GONE from this page too — no #5fd9a0 stroke, no "7d mean" '
     + 'or "trailing mean" text anywhere',
       !/#5fd9a0/.test(pDLbar) && !/7d mean/.test(pDLbar) && !/trailing mean/.test(pDLbar));

    // Past 14 days the SAME series draws as a LINE (section 7b already proves the shape
    // switch generally; this proves the THIRD series specifically survives it).
    var pDLline = await renderPageOn(seedDeepLinkByDay(16), '&from=2026-09-01&to=2026-09-16');
    var dlLineSection = pDLline.slice(pDLline.indexOf('<h2>By day</h2>'), pDLline.indexOf('<h2>', pDLline.indexOf('<h2>By day</h2>') + 1));
    ck('past 14 days the deep-link series draws as a LINE too (a <circle> in its own '
     + 'colour), value 2 on day 1',
       /<circle[^>]*fill="#a374db"[^>]*><title>09-01[^—]* — Deep-link landings: 2<\/title>/.test(dlLineSection));
    ck('...and value 1 on day 3, still readable as a distinct point',
       /<circle[^>]*fill="#a374db"[^>]*><title>09-03[^—]* — Deep-link landings: 1<\/title>/.test(dlLineSection));
    ck('no second or rescaled axis was introduced for the tiny series — still exactly two '
     + 'gridline labels (0 and the top), same as every other window',
       (dlLineSection.match(/text-anchor="end">/g) || []).length === 2,
       (dlLineSection.match(/text-anchor="end">/g) || []).length + ' gridline label(s)');

    /* ============== 25. no direct label overruns the chart's right-hand gutter ========= */
    head('25. every direct series label fits the gutter it is drawn in');
    /* FOUND BY SCREENSHOTTING, not by any assertion here: "Deep-link landings" rendered
     * CLIPPED as "Deep-link landing:" in both the bar and the line chart. The SVG was
     * perfectly valid -- the text simply ran past the viewport -- so every markup check
     * passed. The gutter is PADR = 96 px against a 720 px viewBox, and the label is drawn
     * at font-size 11. This bounds the DRAWN GEOMETRY rather than the text, so the next
     * long label cannot clip in silence; the tooltips and the legend keep the full name
     * and are deliberately not covered by this, having no width limit. */
    var PADR_PX = 96, LABEL_FONT_PX = 11, CHAR_W = 0.62;   // 0.62em is wide for this stack
    ['', '&from=2026-08-25&to=2026-09-08'].forEach(function (qs, i) {
      var svg = i ? p13 : p11;
      var lbls = (svg.match(/<text x="6[0-9][0-9][^>]*font-size="11"[^>]*>([^<]*)</g) || [])
        .map(function (t) { return /includes=""|>([^<]*)<$/.exec(t)[1]; });
      var widest = lbls.reduce(function (m, t) { return Math.max(m, t.length); }, 0);
      var px = widest * LABEL_FONT_PX * CHAR_W;
      ck((i ? 'line' : 'bar') + ' chart: widest direct label "' + widest + ' chars" fits '
         + PADR_PX + ' px (' + px.toFixed(0) + ' px)',
         lbls.length > 0 && px <= PADR_PX, lbls.join(' | ') + ' -> ' + px.toFixed(0) + ' px');
    });

    /* ===================== 26. the pipeline-health line (#797 item 2) =================== */
    head('26. the pipeline-health line -- classifyNote / renderPipelineHealthLine, and its wiring');
    /* Lifted directly out of analytics.js and executed, same idiom run_telemetry.js already
     * uses in this same file for renderThrottleLine -- proof by running the real function,
     * not a source scan (HR10: a string existing in the source is not evidence it renders
     * the right thing under the right condition). Sliced by two literal, unique anchors
     * rather than a brace-matching regex, because the function bodies below contain nested
     * `{ }` a non-greedy regex would stop at early. */
    /* THROUGH injectSrc, not a bare fs.readFileSync — an injection into `classifyNote` or
     * `renderPipelineHealthLine` has to reach THIS slice too, or the checks below stay
     * green against every injection aimed at them: reading the file straight off disk
     * would silently bypass the same patching `loadEsm` applies to the module A already
     * uses, which is exactly the "hollow check" shape #797's own brief warns about. */
    var asrc26 = injectSrc('analytics.js', fs.readFileSync(path.join(ROOT, 'worker', 'src', 'analytics.js'), 'utf8'));
    var startMark = 'const STALE_HOURS = 30;';
    var endMark = '// ---------------------------------------------------------------- the page';
    var i0 = asrc26.indexOf(startMark), i1 = asrc26.indexOf(endMark);
    ck('classifyNote / renderPipelineHealthLine were found at their expected anchors',
       i0 >= 0 && i1 > i0, 'i0=' + i0 + ' i1=' + i1);
    var blob26 = asrc26.slice(i0, i1);
    var lifted26 = new Function('esc', 'dayLabel', blob26
      + '; return { classifyNote: classifyNote, renderPipelineHealthLine: renderPipelineHealthLine };')
      (R.esc, R.dayLabel);
    var classifyNote = lifted26.classifyNote, renderLine26 = lifted26.renderPipelineHealthLine;

    /* ---- classifyNote: which rollup_runs.note tokens warn, which stay quiet ------------- */
    ck('an empty note is clean -- nothing to warn about',
       classifyNote('').warn.length === 0, JSON.stringify(classifyNote('')));
    ck('the always-present own:N counter is QUIET, never a warning by itself',
       classifyNote('own:0').warn.length === 0, JSON.stringify(classifyNote('own:0')));
    ck('a coarse capture is QUIET -- already shown per-row everywhere else on this page',
       classifyNote('coarse:10').warn.length === 0, JSON.stringify(classifyNote('coarse:10')));
    ck('the two EXPECTED own-traffic deploy-gap notes are QUIET',
       classifyNote('own-columns-absent').warn.length === 0
       && classifyNote('own-predating:3').warn.length === 0,
       JSON.stringify([classifyNote('own-columns-absent').warn, classifyNote('own-predating:3').warn]));
    ck('a missing token IS a warning',
       classifyNote('no CF_ANALYTICS_TOKEN').warn.length === 1,
       JSON.stringify(classifyNote('no CF_ANALYTICS_TOKEN')));
    ck('a truncated day (limit-hit) IS a warning -- the only place this ever surfaces at all '
     + '(stats.dailyTotals’ own `truncated` flag has never been rendered anywhere on this page)',
       classifyNote('limit-hit').warn.length === 1, JSON.stringify(classifyNote('limit-hit')));
    ck('each of the three fetch-exception notes IS a warning',
       classifyNote('traffic failed: upstream 500').warn.length === 1
       && classifyNote('usage failed: boom').warn.length === 1
       && classifyNote('own traffic failed: boom').warn.length === 1,
       JSON.stringify([classifyNote('traffic failed: upstream 500').warn,
                        classifyNote('usage failed: boom').warn,
                        classifyNote('own traffic failed: boom').warn]));
    ck('a MIX of quiet and warn tokens on one note keeps only the warn half',
       JSON.stringify(classifyNote('coarse:10; own:4; traffic failed: x').warn) === '["traffic failed: x"]',
       JSON.stringify(classifyNote('coarse:10; own:4; traffic failed: x')));
    ck('an unrecognised token defaults to WARN, not silence -- an unseen note is exactly the '
     + 'silent-failure shape #797 exists to catch',
       classifyNote('some-future-note:7').warn.length === 1, JSON.stringify(classifyNote('some-future-note:7')));

    /* ---- renderPipelineHealthLine: the three independent reasons to draw anything ------- */
    var HOUR26 = 3600e3;
    var lastClean = { day: '2026-09-17', ranAt: '2026-09-17T05:10:00Z', note: '' };
    ck('a healthy pipeline (fresh, clean, no gaps) renders NOTHING',
       renderLine26({ rows: [lastClean], gaps: [] }, Date.parse(lastClean.ranAt) + 10 * HOUR26) === '',
       'expected empty string');
    ck('...and still nothing when the last run’s note is merely QUIET (coarse/own-*)',
       renderLine26({ rows: [{ day: '2026-09-17', ranAt: '2026-09-17T05:10:00Z', note: 'coarse:10; own:4' }], gaps: [] },
         Date.parse(lastClean.ranAt) + 10 * HOUR26) === '', 'expected empty string');
    var staleLine = renderLine26({ rows: [lastClean], gaps: [] }, Date.parse(lastClean.ranAt) + 31 * HOUR26);
    ck('past the staleness threshold (31h > 30h) the line warns and names the hour count',
       /class="warn"/.test(staleLine) && /31 h/.test(staleLine), staleLine);
    var freshLine = renderLine26({ rows: [lastClean], gaps: [] }, Date.parse(lastClean.ranAt) + 29 * HOUR26);
    ck('...but 29h (under the threshold) stays quiet -- "a few hours late is not yet news"',
       freshLine === '', JSON.stringify(freshLine));
    var notedLine = renderLine26({ rows: [
      { day: '2026-09-16', ranAt: '2026-09-16T05:10:00Z', note: '' },
      { day: '2026-09-17', ranAt: '2026-09-17T05:10:00Z', note: 'traffic failed: upstream 500' }], gaps: [] },
      Date.parse('2026-09-17T05:10:00Z') + 1 * HOUR26);
    ck('a BAD note on a FRESH run still warns -- staleness is not the only trigger',
       /class="warn"/.test(notedLine) && /traffic failed: upstream 500/.test(notedLine), notedLine);
    ck('when it warns, the last CLEAN run (09-16, the one before the bad note) is named in '
     + 'Eastern, so "nothing else is wrong" stays legible at a glance',
       /Last clean run.*09-16/.test(notedLine), notedLine);
    var gapLine = renderLine26({ rows: [
      { day: '2026-09-01', ranAt: '2026-09-01T05:10:00Z', note: '' },
      { day: '2026-09-03', ranAt: '2026-09-03T05:10:00Z', note: '' }], gaps: ['2026-09-02'] },
      Date.parse('2026-09-03T05:10:00Z') + 1 * HOUR26);
    ck('a gap INSIDE the recorded span warns even though the tail is fresh and its note is clean',
       /class="warn"/.test(gapLine) && /09-02/.test(gapLine), gapLine);
    var neverLine = renderLine26({ rows: [], gaps: [] }, Date.now());
    ck('a rollup that has never recorded a run warns outright, rather than computing NaN hours',
       /class="warn"/.test(neverLine) && /never recorded a run/.test(neverLine), neverLine);

    /* ---- reachability: the SAME line is actually wired into the real page --------------- */
    var freshDb26 = makeDb();
    freshDb26._ins('rollup_runs', { day: '2026-09-17',
      ran_at: new Date(Date.now() - 5 * HOUR26).toISOString(), traffic_rows: 1, usage_rows: 0,
      coarse: 0, note: '' });
    var pHealthy26 = await renderPageOn(freshDb26, '');
    ck('wired into the real page: a healthy pipeline renders no "Data pipeline" banner',
       !/Data pipeline/.test(pHealthy26), (pHealthy26.match(/Data pipeline[^<]*/) || ['(none)'])[0]);
    var staleDb26 = makeDb();
    staleDb26._ins('rollup_runs', { day: '2026-08-01', ran_at: '2026-08-01T05:10:00Z',
      traffic_rows: 1, usage_rows: 0, coarse: 0, note: '' });
    var pStale26 = await renderPageOn(staleDb26, '');
    var idxLine = pStale26.indexOf('Data pipeline'), idxByDay = pStale26.indexOf('<h2>By day</h2>');
    ck('wired into the real page: a stale pipeline DOES render the banner, near the TOP -- '
     + 'before the by-day section',
       idxLine >= 0 && idxByDay > idxLine, 'idx(Data pipeline)=' + idxLine + ' idx(By day)=' + idxByDay);

    /* =================================================================== 27. si (#797) */
    head('27. the five remaining "coarse (±10)" literals now print the MEASURED interval, '
       + 'not Cloudflare’s current tier (#797) -- an isolated fixture using 25, a number no '
       + 'hard-coded renderer would produce, across every remaining site.');
    /* An ISOLATED fixture (own db), same idiom `seedDeepLinkClosed` above uses -- and dated
     * 2026-08-20 specifically so a >14-day window (needed for the LINE chart legend) stays
     * entirely BEFORE "today" (2026-09-18): `storeRange` clamps `from` up to its own first
     * recorded day, so the window has to start there, not touch the live-merge path. */
    function seedMeasuredSi() {
      var d = makeDb();
      d._ins('traffic_daily', { day: '2026-08-20', country: 'Testland', referrer_host: 'ref.example.net',
        referrer_kind: 'external', path: '/measured', device: 'desktop', browser: 'Chrome',
        os: 'Windows', nav_type: 'navigate', bot: 0, pageloads: 4, visits: 2, sample_interval: 25 });
      d._ins('traffic_daily', { day: '2026-08-20', country: 'Testland', referrer_host: '',
        referrer_kind: 'direct', path: '/ui/shell', device: 'desktop', browser: 'Chrome',
        os: 'Windows', nav_type: 'navigate', bot: 0, pageloads: 3, visits: 1, sample_interval: 25 });
      d._ins('traffic_daily', { day: '2026-08-20', country: 'Testland', referrer_host: '',
        referrer_kind: 'direct', path: '/', device: 'desktop', browser: 'Chrome',
        os: 'Windows', nav_type: 'navigate', bot: 1, pageloads: 9, visits: 9, sample_interval: 25 });
      d._ins('rollup_runs', { day: '2026-08-20', ran_at: '2026-08-20T05:10:00Z', traffic_rows: 3,
        usage_rows: 0, coarse: 25, note: 'coarse:25' });
      return d;
    }
    var msiDb = seedMeasuredSi();

    // Two days, not one -- `barChart` draws nothing for a single bar ("one bar is a number,
    // not a chart"), which would leave the legend paragraph absent rather than proven right.
    var p27bar = await renderPageOn(msiDb, '&from=2026-08-20&to=2026-08-21');
    var byDay27bar = p27bar.slice(p27bar.indexOf('<h2>By day</h2>'), p27bar.indexOf('<h2>', p27bar.indexOf('<h2>By day</h2>') + 1));
    ck('the by-day table cell prints the MEASURED interval (25), not a hard-coded 10',
       /<td>coarse \(±25\)<\/td>/.test(byDay27bar), byDay27bar);
    ck('...and the BAR chart legend (≤14 days) states the same measured interval',
       /faded bar = Cloudflare-coarse \(±25\)/.test(byDay27bar), byDay27bar);

    var p27line = await renderPageOn(msiDb, '&from=2026-08-20&to=2026-09-04');   // 16 days
    var byDay27line = p27line.slice(p27line.indexOf('<h2>By day</h2>'), p27line.indexOf('<h2>', p27line.indexOf('<h2>By day</h2>') + 1));
    ck('past 14 days the LINE chart legend states the same measured interval too, not the '
     + 'bar chart’s own literal',
       /faded point = Cloudflare-coarse \(±25\)/.test(byDay27line), byDay27line);

    var countriesSec27 = p27bar.slice(p27bar.indexOf('<h2>Countries</h2>'), p27bar.indexOf('<h2>', p27bar.indexOf('<h2>Countries</h2>') + 1));
    ck('the Countries table (hybridBreakdown -> breakdownTable) prints the measured interval',
       /Testland[\s\S]*?coarse \(±25\)/.test(countriesSec27), countriesSec27);

    var botsSec27 = p27bar.slice(p27bar.indexOf('<h2>Bots</h2>'), p27bar.indexOf('<h2>', p27bar.indexOf('<h2>Bots</h2>') + 1));
    ck('the Bots table (its OWN inline rendering, not breakdownTable) prints the measured '
     + 'interval for BOTH the Human and Bot rows',
       (botsSec27.match(/coarse \(±25\)/g) || []).length === 2, botsSec27);

    var arriveSec27 = p27bar.slice(p27bar.indexOf('<h2>How people arrive</h2>'), p27bar.indexOf('<h2>', p27bar.indexOf('<h2>How people arrive</h2>') + 1));
    ck('the referrer table ("How people arrive") prints the measured interval',
       /ref\.example\.net[\s\S]*?coarse \(±25\)/.test(arriveSec27), arriveSec27);

    var deepSec27 = p27bar.slice(p27bar.indexOf('<h2>Deep-link landings</h2>'), p27bar.indexOf('<h2>', p27bar.indexOf('<h2>Deep-link landings</h2>') + 1));
    ck('the Deep-link landings breakdown prints the measured interval too, not just its total',
       /coarse \(±25\)/.test(deepSec27), deepSec27);

    /* THE SVG TOOLTIPS, which the first pass at #797 missed entirely: they live in render.js,
     * not analytics.js, so a grep of the page's own source found four sites and not these two.
     * They were the LAST hard-coded ±10 on the page, and `bucketDays` had to stop dropping `si`
     * before the bar chart could even reach the number. A tooltip is exactly where a reader
     * goes to ask "how rounded is this bar", so a literal there is the worst of the six. */
    ck('the BAR chart tooltip states the measured interval, not a literal',
       /<title>[^<]*\(coarse, ±25\)<\/title>/.test(byDay27bar), (byDay27bar.match(/<title>[^<]*coarse[^<]*<\/title>/) || ['(no coarse tooltip)'])[0]);
    ck('...and so does the LINE chart tooltip',
       /<title>[^<]*\(coarse, ±25\)<\/title>/.test(byDay27line), (byDay27line.match(/<title>[^<]*coarse[^<]*<\/title>/) || ['(no coarse tooltip)'])[0]);
    ck('no ±10 survives ANYWHERE in either rendered chart, tooltips included',
       byDay27bar.indexOf('±10') < 0 && byDay27line.indexOf('±10') < 0,
       'bar ' + byDay27bar.indexOf('±10') + ', line ' + byDay27line.indexOf('±10'));

    /* Strip the SVG <title> tooltips before this scan: `render.js`'s own point/bar tooltip
     * text ("(coarse, ±10)") is OUT OF SCOPE here (#797 names five sites in analytics.js;
     * render.js's `bucketDays` drops `si` before it ever reaches that string, and even where
     * it does not — the line chart's own `dataLine` closure — the string is hard-coded
     * independent of it) — see check 17's own `±10` tooltip assertion, unchanged by this
     * fix. This proves every literal this task DID touch, not the one it named as a
     * plumbing job not worth forcing. */
    var stripTitles = (s) => s.replace(/<title>[^<]*<\/title>/g, '');
    ck('and the hard-coded literal survives NOWHERE this task touched -- every coarse row in '
     + 'this fixture is si=25, so a stray "±10" outside an SVG tooltip can only be the old '
     + 'hard-code coming back',
       !/±10/.test(stripTitles(p27bar)) && !/±10/.test(stripTitles(p27line)),
       'p27bar has ±10: ' + /±10/.test(stripTitles(p27bar))
       + ', p27line has ±10: ' + /±10/.test(stripTitles(p27line)));

    /* NO "unmeasured coarse" CASE EXISTS TO PROVE for the by-day table: `rollup_runs.coarse`
     * IS that run's own real measured interval (`rollup.js`'s `out.coarse = t.coarse`, never a
     * bare flag), and `dailyTotals`/`deepLinkLandingsByDay`'s `si` is the max of it and
     * `traffic_daily`'s own -- the SAME two sources `coarse` itself already ORs, so `coarse`
     * cannot be true here with no number behind it. The `r.si > 1 ? … : 'coarse'` guard in
     * analytics.js stays as a fail-safe for a future coarse-flagging path that does not keep
     * that invariant, not because this fixture can reach it today.
     * `groupBy`/`referrerBreakdown`/`deepLinkLandings` have no separate flag at all -- `coarse`
     * IS `si > 1` there, so the same is true by construction; see run_dashboard_stats.js. */

    /* ============ 28. the hourly group limit is sized off the GROUPING, not the dim === */
    head('28. the live "today" hourly limit covers hour x bot, not hour — the evening is '
       + 'never silently dropped (#797)');
    /* THE SECOND HALF OF #797, and it pushes the number the OTHER WAY. `rumGroup` appends
     * `bot` to every dimension list, so `rumGroup('datetimeHour', …)` groups hour x bot.
     * The limit was 26, sized for 24 hours plus the 25-hour fall-back day plus one spare —
     * i.e. for the dimension ASKED FOR, not the one grouped on. Ordered `datetimeHour_ASC`,
     * so once bots had touched about 13 hours of the day the limit fell inside the window
     * and every hour after it was dropped. Nothing errors. Today just reads low.
     *
     * DERIVATION of 50: the window is [Eastern midnight, now], at most ONE Eastern day; the
     * longest Eastern day is 25 h (fall-back); an Eastern midnight is always on an exact UTC
     * hour boundary, so that span touches at most 25 `datetimeHour` buckets; `bot` takes two
     * values. 25 x 2 = 50, exact.
     *
     * THE FIXTURE IS THE WORST CASE: all 25 hours, each with a human row (1 pageload,
     * 1 visit) and a bot row (2 pageloads), interleaved in the ASC order the API returns.
     * Human total 25. At limit 26 the fake hands back the first 26 groups — 13 human, 13
     * bot — so the tile reads 13. Own store, one closed REAL-ZERO day, so the tile is
     * today's live figure and nothing else. */
    var wide = [];
    for (var h28 = 0; h28 < 25; h28++) {
      var hh = '2026-09-18T' + (h28 < 10 ? '0' + h28 : h28) + ':00:00Z';
      wide.push({ count: 1, avg: { sampleInterval: 1 }, sum: { visits: 1 },
        dimensions: { datetimeHour: hh, bot: false } });
      wide.push({ count: 2, avg: { sampleInterval: 1 }, sum: { visits: 1 },
        dimensions: { datetimeHour: hh, bot: true } });
    }
    var db28 = makeDb();
    ran(db28, '2026-09-17', 0, 1);          // a real zero: the store exists, today is all live
    HOURLY_WIDE = { rumPageloadEventsAdaptiveGroups: wide };
    var p28, q28;
    try {
      p28 = await renderPageOn(db28, '');
      q28 = (SEEN.filter(function (q) { return /dimensions \{ datetimeHour bot \}/.test(q); })[0]) || '';
    } finally { HOURLY_WIDE = null; }
    var lim28 = (/limit: (\d+)/.exec(String(q28).replace(/\s+/g, ' ')) || [])[1];
    ck('the query the page actually built groups hour x bot and asks for at least 25 x 2',
       /dimensions \{ datetimeHour bot \}/.test(q28) && Number(lim28) >= 50,
       'limit: ' + lim28 + ' for a grouping of hour x bot');
    ck('all 25 human hours reach the tile — 25 pageloads, not the 13 a limit of 26 leaves',
       />25<\/div><div class="k">Pageloads<\/div>/.test(p28),
       (p28.match(/<div class="v">(\d+)<\/div><div class="k">(Pageloads|Landing visits)/g) || []).join(' | '));
    ck('and the 50 bot pageloads in the same batch are still excluded',
       !/>75<\/div><div class="k">Pageloads<\/div>/.test(p28)
       && !/>39<\/div><div class="k">Pageloads<\/div>/.test(p28));

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
