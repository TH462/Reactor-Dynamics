/*
 * run_dashboard_trend.js — the arbitrary window + trend rewrite of the Analytics view
 * (#764 Unit 2b: `worker/src/analytics.js`, and `barChart`/`bucketDays` in `render.js`).
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
 *      of hairline bars or a chart with almost nothing on it.
 *   8. A LEGACY `?days=N` LINK STOPS RESOLVING, or resolves to the wrong span.
 *   9. A CREDENTIAL IN A HREF. Unit 1 moved auth off the URL account-wide; this file adds a
 *      new picker with its own hrefs, which is a new place for the old mistake to recur.
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
  { count: 8, avg: { sampleInterval: 1 }, sum: { visits: 5 }, dimensions: {} },
  { count: 3, avg: { sampleInterval: 1 }, sum: { visits: 2 }, dimensions: {} },
] };   // 11 pageloads, 7 visits
var THREE_DIM = { rumPageloadEventsAdaptiveGroups: [
  { count: 5, avg: { sampleInterval: 1 }, sum: { visits: 2 }, dimensions: {
    countryName: 'United States', refererHost: '', requestHost: 'reactordynamics.com',
    datetimeHour: '2026-09-10 10:00:00' } } ] };
var GENERIC_BREAKDOWN = { rumPageloadEventsAdaptiveGroups: [
  { count: 6, avg: { sampleInterval: 1 }, sum: { visits: 3 }, dimensions: {
    requestPath: '/', countryName: 'United States', refererHost: '',
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
  if (has('dimensions { datetimeHour }')) return TODAY_LIVE;
  if (has('dimensions { countryName refererHost requestHost datetimeHour }')) return THREE_DIM;
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
  'bucket-threshold-widen': ['render.js',
    "else if (n <= 90) { size = 7; bucket = 'week'; }", "else if (n <= 500) { size = 7; bucket = 'week'; }"],
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
  'breakdown-today-not-merged': ['analytics.js',
    'if (includesToday) {\n      const g = rumRows(await gql(apiToken, rumGroup(cfDims,',
    'if (false) {\n      const g = rumRows(await gql(apiToken, rumGroup(cfDims,'],
  'breakdown-span-drift': ['analytics.js',
    "+ esc(from) + ' to ' + esc(closedTo) + ')'", "+ esc(from) + ' to ' + esc(nextDay(closedTo)) + ')'"],
  'referrer-kind-recomputed': ['analytics.js',
    'const by = new Map(closed.map((r) => [r.host, { host: r.host, kind: r.kind,',
    'const by = new Map(closed.map((r) => [r.host, { host: r.host, kind: referrerKind(r.host || null, null),'],
  'bot-no-warning': ['analytics.js',
    "+ '<p class=\"warn\">Unlike every other section on this page, THIS ONE INCLUDES BOT '\n        + 'TRAFFIC — grouping by bot status cannot also filter it out. Do not compare these '\n        + 'totals against Top pages, Countries, or any other section above.</p>'\n        + table(h.rows.map((r) => ({",
    '+ table(h.rows.map((r) => ({'],
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
    var liveQueryFired1 = SEEN.some(function (q) { return /dimensions \{ datetimeHour \}/.test(q); });
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
    var liveQueryFired2 = SEEN.some(function (q) { return /dimensions \{ datetimeHour \}/.test(q); });
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

    /* =================================================================== 7. bucketing */
    head('7. bucketDays keys its width off the ROW COUNT, at 7 / 30 / 45 / 400 days');
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
    ck('7 days stays DAILY (7 bars)', b7.bucket === 'day' && b7.rows.length === 7,
       b7.bucket + '/' + b7.rows.length);
    ck('30 days buckets to WEEKS (5 bars, not 30 hairlines)', b30.bucket === 'week' && b30.rows.length === 5,
       b30.bucket + '/' + b30.rows.length);
    ck('45 days also buckets to WEEKS (7 bars)', b45.bucket === 'week' && b45.rows.length === 7,
       b45.bucket + '/' + b45.rows.length);
    ck('400 days buckets to MONTHS (14 bars, not 400 or 57)', b400.bucket === 'month' && b400.rows.length === 14,
       b400.bucket + '/' + b400.rows.length);
    ck('every bucket width came from the ROW COUNT alone — bucketDays takes no `days` argument',
       R.bucketDays.length === 1, R.bucketDays.length + ' declared parameter(s)');

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
