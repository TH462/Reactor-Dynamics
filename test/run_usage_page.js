/*
 * run_usage_page.js — the Feature usage view of the ops dashboard (#674).
 *
 *   node test/run_usage_page.js
 *   node test/run_usage_page.js --inject     # prove the gate can go red
 *
 * WHY THIS RUNNER HAS TO EXIST. `worker/src/usage.js` is where the walkthrough telemetry
 * becomes an ANSWER — a completion rate, a drop-off percentage, a p90 — and every one of
 * those is arithmetic this repo performs and Cloudflare does not. The queries return rows;
 * the meaning is assembled here-side. So a wrong denominator, a quantile index off by one
 * or a key parsed on the wrong separator all render a plausible, confident, wrong page,
 * and NOTHING else in the tree looks at it: `run_telemetry` reads the Worker's ingest as
 * TEXT, `run_rollup` drives the scheduled job, `run_dashboard_time` tests render.js's time
 * helpers. The dashboard's own numbers had no coverage of any kind.
 *
 * The failures it guards are the silent ones, all of them:
 *
 *   1. THE FUNNEL'S DENOMINATOR. "Sessions completing step N" is meaningless without
 *      saying "of what". It is of everyone who STARTED the walkthrough, deliberately —
 *      normalising on step 0 instead would make a walkthrough people open and abandon
 *      before checking anything off read as 100 % by definition, which is the single
 *      finding the owner asked for.
 *   2. THE QUANTILE. p90 is the whole point of the time table — a step whose p90 towers
 *      over its median is one most people walk through and some cannot finish. A p90 that
 *      is quietly a median says every step is fine.
 *   3. THE COMPOSITE KEY. blob5 is `id:step:by` or `id:reason`; parsing it on the wrong
 *      part silently attributes every row to one bucket.
 *   4. THE EMPTY-DATASET PATH. Analytics Engine types columns PER RESULT SET, so naming
 *      `double9` in a query no row matches is a 422 rather than an empty table. Before the
 *      client release that emits these events there are no rows at all, so the probe-guard
 *      is the difference between a page that explains itself and five error blocks.
 *
 * NO NETWORK. `cfapi.js` is replaced wholesale by a fake `sql` that dispatches on the
 * query text and returns canned rows, so what is under test is the page's arithmetic and
 * its rendering — not Cloudflare's behaviour, which this could not exercise anyway.
 *
 * The ESM loader is `run_rollup.js`'s idiom (base64 data: URLs, graph resolved bottom-up),
 * extended with a STUB map so a whole dependency can be swapped for a fake.
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

var INJECT = process.argv.indexOf('--inject') >= 0;

/* THE INJECTIONS, one per silent failure named in the header (plus, since #791, the
 * dev-channel filter, the session-clock column and the 100-session truncation note —
 * shared with sessions.js, which reuses this file's fake-sql/loadEsm idiom rather than
 * inventing a second one). Each reverts a fix to its exact original defective text, so
 * the gate is shown to catch the regression rather than merely claimed to. */
function injectSrc(rel, src) {
  if (!INJECT) return src;
  if (rel === 'usage.js') {
    return src
      // 1. the funnel normalised on itself — every step 100 %.
      .split('const pct = started ? (r.sessions / started) * 100 : 0;')
      .join('const pct = 100;')
      // 2. p90 quietly becomes a second median.
      .split('p90 = quantile(v, 0.9)').join('p90 = quantile(v, 0.5)')
      // 3. the composite key parsed as if it had no third part.
      .split("c: p[2] == null ? '' : p[2]").join("c: ''")
      // 4. dev-channel traffic back in the walkthrough funnel (defect 3, #791). No
      //    trailing newline in the anchor — this repo's checkout is CRLF and a bare \n
      //    never matches, "the source moved" by a line-ending, not a content change.
      .split("blob1 = 'walkthrough_start' AND blob2 <> 'dev' AND ${since}")
      .join("blob1 = 'walkthrough_start' AND ${since}")
      // ...and back in the migrated sim sections (defect 3, #791).
      .split("blob1 = 'session_start' AND blob2 <> 'dev' AND ${since}")
      .join("blob1 = 'session_start' AND ${since}")
      // 5. the elapsed-clock query reads the PAGE clock again, not the SESSION clock
      //    (defect 4, #791) — double5 resets on every reload, double6 does not.
      .split('(await sql(apiToken, `SELECT blob4 AS session, max(double6) AS t_last')
      .join('(await sql(apiToken, `SELECT blob4 AS session, max(double5) AS t_last')
      // 6. "latest release" picked by sorting the version STRING lexically instead of by
      //    last-seen timestamp (#800) — wrong the moment a two-digit patch ships, since
      //    "Alpha 1.7.10" < "Alpha 1.7.9" as strings ('1' < '9' at the first differing
      //    character). Proven by run_usage_page.js's Alpha-1.7.9/1.7.10 fixture.
      .split('})).sort((a, b) => b.lastMs - a.lastMs);')
      .join('})).sort((a, b) => (a.release < b.release ? 1 : -1));')
      // 7. one section (Panels opened) drops the version filter — every OTHER query still
      //    carries it, so this proves the "every section" check actually inspects every
      //    section rather than passing on the first one it finds.
      .split("FROM ${DATASET} WHERE blob1 = 'panel_open' AND blob2 <> 'dev' AND ${since}${versionWhere}")
      .join("FROM ${DATASET} WHERE blob1 = 'panel_open' AND blob2 <> 'dev' AND ${since}")
      // 8. the `days` hidden field is hard-coded to 30 instead of echoing the actual
      //    window, so changing the version would silently reset it back to 30 (#800).
      .split('+ \'<input type="hidden" name="days" value="\' + days + \'">\'')
      .join('+ \'<input type="hidden" name="days" value="30">\'')
      // 9. the small-sample warning threshold is neutered — a two-session release reads
      //    exactly like a thirty-session one (#800).
      .split('const SMALL_SAMPLE = 10;').join('const SMALL_SAMPLE = 0;');
  }
  if (rel === 'sessions.js') {
    return src
      // dev-channel traffic back in the session_start query (defect 3, #791).
      .split("blob1 = 'session_start' AND blob2 <> 'dev' AND ${since}")
      .join("blob1 = 'session_start' AND ${since}")
      // the elapsed-clock query reads the PAGE clock again (defect 4, #791).
      .split('return sql(apiToken, `SELECT blob4 AS session, max(double6) AS t_last')
      .join('return sql(apiToken, `SELECT blob4 AS session, max(double5) AS t_last')
      // the 100-session truncation note is silenced (defect 5, #791).
      .split('truncated = counts.length >= 100;')
      .join('truncated = false;')
      /* --- sortable/filterable Sessions view (#797.4) ------------------------------- */
      // 6. `start_asc` stops changing which 100 rows the SQL fetches — the primary
      //    query's ORDER BY is pinned to DESC regardless of the requested sort.
      .split("const fetchDir = sort === 'start_asc' ? 'ASC' : 'DESC';")
      .join("const fetchDir = 'DESC';")
      // 7. the device filter stops reaching the primary query's WHERE clause.
      .split("if (device !== 'all') filterClauses.push('blob13 = ' + sqlStr(device));")
      .join("if (false) filterClauses.push('blob13 = ' + sqlStr(device));")
      // 8. the referrer-kind filter stops reaching the primary query's WHERE clause.
      .split("if (refKind !== 'all') filterClauses.push('blob10 = ' + sqlStr(refKind));")
      .join("if (false) filterClauses.push('blob10 = ' + sqlStr(refKind));")
      // 9. the day window stops being carried as a hidden field on the filter form, so
      //    submitting it resets the window to the default (the trap named in the brief).
      .split('    + \'<input type="hidden" name="days" value="\' + days + \'">\'')
      .join('    + \'\'')
      // 10. a sort link stops carrying the active device filter forward.
      .split("if (device !== 'all') p.set('device', device);")
      .join("if (false) p.set('device', device);")
      // 11. duration-descending sort stops re-ordering the fetched rows.
      .split('if (sort === \'dur_desc\') rows = rows.slice().sort((a, b) => b.span_secs - a.span_secs);')
      .join('if (sort === \'dur_desc\') { /* no-op */ }')
      // 12. duration-ascending sort stops re-ordering the fetched rows.
      .split('else if (sort === \'dur_asc\') rows = rows.slice().sort((a, b) => a.span_secs - b.span_secs);')
      .join('else if (sort === \'dur_asc\') { /* no-op */ }')
      // 13. the scrammed filter stops removing non-matching sessions.
      .split("rows = rows.filter((r) => (scram === 'yes' ? r.scrams > 0 : r.scrams === 0));")
      .join('rows = rows;')
      // 14. the truncation note stops distinguishing the oldest-100 fetch from the
      //     newest-100 one — it always reads as though the fetch were newest-first.
      .split("? (fetchDir === 'ASC'")
      .join('? (false')
      // 15. a card's own device/country/referrer stops being merged in, so every card
      //     falls back to the '—' placeholder regardless of what `meta` returned.
      .split('(meta || []).forEach((r) => { if (!metaBy[r.session]) metaBy[r.session] = r; });')
      .join('(meta || []).forEach(() => {});');
  }
  return src;
}

// ---------------------------------------------------------------- the fake upstream
/* Dispatch on the query TEXT, most specific first. Matching loosely is how a fake starts
 * answering the wrong question — two of these queries differ only in their GROUP BY.
 * `seen`, if given, collects every query TEXT issued — how #791's dev-channel-filter and
 * session-clock checks confirm what actually reached the wire, not just what a source
 * scan finds (a source scan cannot tell a string is reachable — CLAUDE.md's own standing
 * trap list). */
function fakeSql(rows, seen) {
  return function (token, q) {
    if (seen) seen.push(String(q));
    /* A REJECTED PROMISE, never a synchronous throw. The real `sql()` is async, so a
     * fake that throws on the spot escapes the page's per-query `.catch` and would make
     * a correctly-handled failure look unhandled — the harness reporting a defect it
     * created itself. */
    try { return dispatch(rows, q); } catch (e) { return Promise.reject(e); }
  };
}

function dispatch(rows, q) {
  {
    var asked = String(q);
    function has() {
      for (var i = 0; i < arguments.length; i++) if (asked.indexOf(arguments[i]) === -1) return false;
      return true;
    }
    // The version-filter dropdown's own query (#800) — distinct GROUP BY, cannot collide
    // with any query above or below it.
    if (has('GROUP BY release, channel')) return Promise.resolve(rows.releases || []);
    if (has("LIKE 'walkthrough_%'")) return Promise.resolve(rows.probe);
    if (has("'walkthrough_start'")) return Promise.resolve(rows.starts);
    if (has("'walkthrough_end'")) return Promise.resolve(rows.ends);
    if (has("'walkthrough_rewind'")) return Promise.resolve(rows.rewinds);
    if (has("'walkthrough_step'", 'LIMIT 20000')) return Promise.resolve(rows.dwell);
    if (has("'walkthrough_step'", 'blob5 AS k')) return Promise.resolve(rows.mix);
    if (has("'walkthrough_step'", 'GROUP BY wt, step')) return Promise.resolve(rows.funnel);
    // "Time per session"'s write-span query — a non-empty answer is what lets that
    // section go on to its columns-exist probe and its max(double6) query, the one
    // #791's elapsed-clock check needs to see reach the wire.
    if (has('min(timestamp) AS first_seen', 'max(timestamp) AS last_seen'))
      return Promise.resolve([{ session: 's1', first_seen: '2026-09-01 10:00:00', last_seen: '2026-09-01 10:05:00' }]);
    // Its own columns-exist probe (no blob1 filter, no GROUP BY) — a non-zero count is
    // what lets the max(double6) query fire at all.
    if (has('SELECT count() AS n FROM', 'timestamp >=')) return Promise.resolve([{ n: 5 }]);
    // The migrated sections. Empty is a legitimate answer and renders "(none)".
    return Promise.resolve([]);
  }
}

function fakeCfapi(sqlBody) {
  return 'export const DATASET = "reactor_dynamics_usage";\n'
    + 'export const COLUMNS_SINCE = "toDateTime(\'2026-08-11 02:54:00\')";\n'
    + 'export const COLUMNS_SINCE_TS = "2026-08-11 02:54:00";\n'
    + 'export const sql = globalThis.__RD_FAKE_SQL;\n'
    + 'export const gql = () => Promise.resolve({});\n'
    + 'export const ACCOUNT = "acct"; export const SITE_TAG = "tag";\n' + (sqlBody || '');
}

function loadEsm(ROOT, entry, stubs) {
  var built = {};
  function build(rel) {
    if (built[rel]) return built[rel];
    var src = Object.prototype.hasOwnProperty.call(stubs, rel)
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

// ---------------------------------------------------------------- the canned dataset
/* ONE walkthrough, chosen so every arithmetic answer is DISTINCTIVE — no two figures the
 * same, so a check cannot pass by reading a neighbouring column.
 *
 *   5 sessions started `pwr_heatup` (17 steps)
 *   2 completed, 2 left, 1 stopped        -> 40 % completion
 *   step 0: 5 of 5 (100 %)   step 1: 5 of 5, SIX check-offs (a redo)
 *   step 2: 3 of 5 (60 %)    step 3: 1 of 5 (20 %)
 *   step 2 dwell: 10 20 30 40 300 s       -> median 30s, p90 300s, spread 10.0x
 *   `by` mix carries 2 overtaken + 3 caught_up = 5 stuck-signal check-offs
 */
var ROWS = {
  probe: [{ n: 30 }],
  starts: [{ wt: 'pwr_heatup', sessions: 5, n: 6, steps: 17 }],
  ends: [
    { k: 'pwr_heatup:complete', sessions: 2, n: 2 },
    { k: 'pwr_heatup:left', sessions: 2, n: 2 },
    { k: 'pwr_heatup:stopped', sessions: 1, n: 1 },
  ],
  funnel: [
    { wt: 'pwr_heatup', step: 0, sessions: 5, n: 5 },
    { wt: 'pwr_heatup', step: 1, sessions: 5, n: 6 },
    { wt: 'pwr_heatup', step: 2, sessions: 3, n: 3 },
    { wt: 'pwr_heatup', step: 3, sessions: 1, n: 1 },
  ],
  mix: [
    { k: 'pwr_heatup:00:auto', n: 5 },
    { k: 'pwr_heatup:01:auto', n: 4 },
    { k: 'pwr_heatup:01:overtaken', n: 2 },
    { k: 'pwr_heatup:02:caught_up', n: 3 },
    { k: 'pwr_heatup:03:manual', n: 1 },
  ],
  rewinds: [{ wt: 'pwr_heatup', step: 1, sessions: 2, n: 3 }],
  dwell: [10, 20, 30, 40, 300].map(function (s) {
    return { wt: 'pwr_heatup', step: 2, seconds: s };
  }),
  // The version-filter dropdown's own data (#800) — one release, comfortably above the
  // small-sample threshold, so the baseline render above exercises the filter machinery
  // without also triggering the low-sample warning tested separately below.
  releases: [{ release: 'Alpha 1.7.5', channel: 'public', sessions: 20, last_seen: '2026-09-15 10:00:00' }],
};

/* ⚠ A NONCE, AND IT IS LOAD-BEARING. `import()` caches by URL and a data: URL is its own
 * content, so two renders built from identical source got the SAME module instance — and
 * `sql` is captured at module evaluation, which pinned every later render to the FIRST
 * fake. It did not error: the second and third cases simply re-rendered the first one's
 * data and two checks failed for a reason that had nothing to do with the page. The nonce
 * makes each render its own module graph. */
var nonce = 0;
async function render(rows, token, seen) {
  globalThis.__RD_FAKE_SQL = fakeSql(rows, seen);
  var ROOT = path.join(__dirname, '..');
  var mod = await loadEsm(ROOT, 'usage.js',
    { 'cfapi.js': fakeCfapi('// render ' + (++nonce) + '\n') });
  var url = new URL('https://example.invalid/dashboard?token=t&view=usage&days=30');
  var res = await mod.usagePage({ CF_ANALYTICS_TOKEN: 'x' }, url, token || 't');
  return res.text();
}

// Same idiom as `render()`, but with a caller-chosen query string (days/version) rather
// than the fixed days=30 above — needed to prove the version filter's own behaviour
// (#800), which `render()`'s hard-coded URL cannot exercise.
async function renderQS(rows, qs, seen) {
  globalThis.__RD_FAKE_SQL = fakeSql(rows, seen);
  var ROOT = path.join(__dirname, '..');
  var mod = await loadEsm(ROOT, 'usage.js',
    { 'cfapi.js': fakeCfapi('// render ' + (++nonce) + '\n') });
  var url = new URL('https://example.invalid/dashboard?token=t&view=usage' + qs);
  var res = await mod.usagePage({ CF_ANALYTICS_TOKEN: 'x' }, url);
  return res.text();
}

// ---------------------------------------------------------------- sessions.js (shares
// this file's ESM-loader/fake-sql idiom rather than inventing a second one; sessions.js
// has no dedicated runner of its own, and this repo's convention is one test idiom per
// query-fake shape, not one per source file).
function dispatchSessions(rows, q) {
  var asked = String(q);
  function has() {
    for (var i = 0; i < arguments.length; i++) if (asked.indexOf(arguments[i]) === -1) return false;
    return true;
  }
  var isDetail = asked.indexOf("blob4 = '") !== -1;
  /* THE PRIMARY QUERY — sort-aware, playing the role of Analytics Engine itself rather
   * than a canned fixture, because the sort-actually-reorders check (#797.4) has to prove
   * the RENDERED order changes, and `start_asc`'s effect is entirely in the SQL `ORDER BY`
   * (sessions.js has no JS-side re-sort for the two start_* sorts — see its own header
   * comment). A fixture that ignored ASC/DESC here would let that specific defect through
   * silently: the page would render fine, just always in DESC order, and nothing above
   * this fake would ever notice. */
  if (!isDetail && has('GROUP BY session ORDER BY first_seen')) {
    var list = (rows.counts || []).slice();
    var asc = /ORDER BY first_seen ASC/.test(asked);
    list.sort(function (a, b) {
      var d = String(a.first_seen) < String(b.first_seen) ? -1
        : (String(a.first_seen) > String(b.first_seen) ? 1 : 0);
      return asc ? d : -d;
    });
    return Promise.resolve(list);
  }
  if (!isDetail && has("'session_start'", 'GROUP BY session, initial_state')) return Promise.resolve(rows.starts || []);
  // Device/country/referrer FOR DISPLAY — the "for display" query's own GROUP BY, distinct
  // from the one two lines up so the two cannot collide.
  if (!isDetail && has("'session_start'", 'GROUP BY session, device')) return Promise.resolve(rows.meta || []);
  // "Scrammed" — milestone:scram rows, one per session that ever scrammed.
  if (!isDetail && has("blob1 = 'milestone'", "blob5 = 'scram'")) return Promise.resolve(rows.scrams || []);
  // The two probes are DISTINCT floors (cfapi.js's COLUMNS_SINCE vs rollup.js's
  // OWN_COLUMNS_SINCE — sessions.js's own comment on why they are never shared), matched
  // on their own literal timestamps so a test can make one succeed and the other not —
  // the generic fallback below would answer both identically otherwise.
  if (!isDetail && has('SELECT count() AS n', 'timestamp >=', '2026-09-21')) {
    return Promise.resolve(rows.metaProbe || rows.probe || [{ n: 0 }]);
  }
  if (!isDetail && has('SELECT count() AS n', 'timestamp >=')) return Promise.resolve(rows.probe || [{ n: 0 }]);
  if (!isDetail && has('max(double', 'GROUP BY session')) return Promise.resolve(rows.elapsed || []);
  if (!isDetail && has("'session_end'")) return Promise.resolve(rows.ends || []);
  if (isDetail && has('SELECT count() AS n')) return Promise.resolve(rows.detailProbe || [{ n: 0 }]);
  if (isDetail && has('ORDER BY timestamp ASC')) return Promise.resolve(rows.detailRows || []);
  return Promise.resolve([]);
}

function mkSessionsRows(n) {
  var counts = [];
  for (var i = 0; i < n; i++) {
    counts.push({ session: 's' + i, first_seen: '2026-09-19 10:00:00',
                  last_seen: '2026-09-19 10:05:00', raw: 3, est: 3 });
  }
  return {
    counts: counts,
    starts: [{ session: 's0', initial_state: 'cold_shutdown', release: 'Alpha 1.7.0', plant: 'pwr2' }],
    probe: [{ n: 1 }],
    elapsed: [{ session: 's0', t_last: 42 }],
    ends: [{ session: 's0', last_panel: 'board', secs: 10 }],
    meta: [],
    scrams: [],
  };
}

/* Three sessions chosen so RECENCY order and DURATION order DISAGREE — a check that
 * happened to sort the same way regardless of the requested axis would still pass by
 * accident against a fixture where they agreed (#797.4). No `elapsed`/`ends` rows, so
 * each session's duration is purely the write span between first_seen and last_seen. */
function mkSortRows() {
  return {
    counts: [
      { session: 's_new', first_seen: '2026-09-19 11:00:00', last_seen: '2026-09-19 11:00:20', raw: 2, est: 2 },
      { session: 's_mid', first_seen: '2026-09-19 10:00:00', last_seen: '2026-09-19 10:08:20', raw: 2, est: 2 },
      { session: 's_old', first_seen: '2026-09-19 09:00:00', last_seen: '2026-09-19 09:00:50', raw: 2, est: 2 },
    ],
    starts: [], probe: [{ n: 0 }], elapsed: [], ends: [], meta: [], scrams: [],
  };
}

// Two sessions, one that scrammed once and one that never did — the minimum fixture the
// scram filter needs to prove it removes the non-matching session rather than the matching one.
function mkScramRows() {
  return {
    counts: [
      { session: 's_scrammed', first_seen: '2026-09-19 10:00:00', last_seen: '2026-09-19 10:00:05', raw: 1, est: 1 },
      { session: 's_clean', first_seen: '2026-09-19 09:00:00', last_seen: '2026-09-19 09:00:05', raw: 1, est: 1 },
    ],
    starts: [], probe: [{ n: 0 }], elapsed: [], ends: [], meta: [],
    scrams: [{ session: 's_scrammed', n: 1 }],
  };
}

async function renderSessionListQS(rows, qsStr, seen) {
  globalThis.__RD_FAKE_SQL = function (token, q) {
    if (seen) seen.push(String(q));
    try { return dispatchSessions(rows, q); } catch (e) { return Promise.reject(e); }
  };
  var ROOT = path.join(__dirname, '..');
  var mod = await loadEsm(ROOT, 'sessions.js',
    { 'cfapi.js': fakeCfapi('// sessions render ' + (++nonce) + '\n') });
  var url = new URL('https://example.invalid/dashboard?token=t&view=sessions' + qsStr);
  var res = await mod.sessionList({ CF_ANALYTICS_TOKEN: 'x' }, url);
  return res.text();
}

async function renderSessionList(rows, seen) {
  globalThis.__RD_FAKE_SQL = function (token, q) {
    if (seen) seen.push(String(q));
    try { return dispatchSessions(rows, q); } catch (e) { return Promise.reject(e); }
  };
  var ROOT = path.join(__dirname, '..');
  var mod = await loadEsm(ROOT, 'sessions.js',
    { 'cfapi.js': fakeCfapi('// sessions render ' + (++nonce) + '\n') });
  var url = new URL('https://example.invalid/dashboard?token=t&view=sessions&days=30');
  var res = await mod.sessionList({ CF_ANALYTICS_TOKEN: 'x' }, url);
  return res.text();
}

async function renderSessionDetail(rows, sid, seen) {
  globalThis.__RD_FAKE_SQL = function (token, q) {
    if (seen) seen.push(String(q));
    try { return dispatchSessions(rows, q); } catch (e) { return Promise.reject(e); }
  };
  var ROOT = path.join(__dirname, '..');
  var mod = await loadEsm(ROOT, 'sessions.js',
    { 'cfapi.js': fakeCfapi('// session detail render ' + (++nonce) + '\n') });
  var url = new URL('https://example.invalid/dashboard?token=t&view=session&sid=' + sid);
  var res = await mod.sessionDetail({ CF_ANALYTICS_TOKEN: 'x' }, url, sid);
  return res.text();
}

(async function main() {
  console.log(BOLD + '\nops dashboard — Feature usage view (#674)' + RST);
  var page = await render(ROWS);

  /* ------------------------------------------------------------------ 1. it is a page */
  head('1. the view renders, and knows which nav tab it is');
  ck('the page has the Feature usage heading', /<h1>Feature usage/.test(page));
  ck('the Usage tab is marked current', /<a class="on" href="[^"]*view=usage"/.test(page));
  /* THE NAME COLLISION. `&view=features` is the feature FLAGS page and predates this one;
   * a rename would break every bookmark the owner holds, so the two live side by side and
   * BOTH must be reachable from here. */
  ck('the Features (flags) tab is still in the nav and is a different view',
    /href="[^"]*view=features"/.test(page) && /href="[^"]*view=usage"/.test(page));

  /* ---------------------------------------------------------- 2. started / ended / rate */
  head('2. started, finished, abandoned — and the completion rate');
  ck('the walkthrough is listed with its step count', />pwr_heatup</.test(page) && />17</.test(page));
  /* 2 completed of 5 started. The three abandon reasons are DIFFERENT FACTS and are
   * counted apart: closing it, switching away, and the tab going. */
  ck('the completion rate is 2 of 5 = 40%', page.indexOf('>40%</b>') !== -1,
    'expected a 40% bar label');
  ck('the completion bar is drawn to 40.0%', page.indexOf('width:40.0%') !== -1);
  ck('stopped, switched and left are separate columns',
    /<th[^>]*>Stopped<\/th>/.test(page) && /<th[^>]*>Switched<\/th>/.test(page)
    && /<th[^>]*>Left<\/th>/.test(page));

  /* -------------------------------------------------------------- 3. the drop-off funnel */
  head('3. drop-off by step — the "how far do they go" answer');
  /* ⚠ THE DENOMINATOR IS THE STARTERS. Step 2 was completed by 3 sessions of the 5 that
   * started = 60 %. Against the first STEP it would also be 60 % here, which is exactly
   * why the fixture makes step 0 equal to the starters and the injection makes the
   * difference visible instead: a page normalised on itself reads 100 % everywhere. */
  ck('step 2 is 3 of 5 starters', page.indexOf('3 / 5') !== -1);
  ck('...drawn at 60.0% of the bar', page.indexOf('width:60.0%') !== -1);
  ck('step 3 is 1 of 5, drawn at 20.0%',
    page.indexOf('1 / 5') !== -1 && page.indexOf('width:20.0%') !== -1);
  ck('a step done more than once shows more check-offs than sessions',
    /step 6|>6<\/td>/.test(page), 'step 1 has 6 check-offs against 5 sessions');
  ck('the funnel says what its denominator is',
    /against everyone who STARTED/.test(page));

  /* -------------------------------------------------------------- 4. time on step */
  head('4. time on step — the "where do they get stuck" answer');
  // 10 20 30 40 300 -> median 30s, p90 300s. `dur()` renders 300 as "5m 0s".
  ck('the median of 10/20/30/40/300 is 30s', page.indexOf('>30s</td>') !== -1);
  ck('the p90 is 300s, not the median', page.indexOf('>5m 0s</td>') !== -1);
  ck('the spread is reported as p90 / median = 10.0x', page.indexOf('10.0×') !== -1);
  /* AND THE ROW MUST KNOW WHICH STEP IT IS. The quantiles alone cannot catch a key split
   * on the wrong separator — one group is still one group, so every duration figure stays
   * right while the row is labelled `pwr_heatup|2` / NaN. Measured: that exact defect
   * passed all three checks above. `NaN` is asserted page-wide because it is what every
   * arithmetic mistake here degrades to, and it renders as a plausible-looking cell. */
  ck('the time row names its own walkthrough and step',
    /<td>pwr_heatup<\/td><td class="num">2<\/td><td class="num">30s<\/td>/.test(page));
  ck('no cell anywhere on the page renders NaN', page.indexOf('NaN') === -1);
  ck('the internal group separator never reaches the page', page.indexOf('pwr_heatup|') === -1);
  /* THE RETENTION CAVEAT IS PART OF THE ANSWER. These durations are numeric columns and
   * the daily rollup keeps only the key string, so unlike the funnel above they cannot
   * outlive Analytics Engine's fixed three months. A reader who assumes otherwise draws a
   * trend off a window that silently truncates. */
  ck('the page warns that durations do not survive retention',
    /three months/.test(page) && /Analytics Engine<\/b> only|Analytics Engine only/.test(page));

  /* ---------------------------------------------------- 5. how steps checked off */
  head('5. how steps checked off — the direct stuck-signal');
  ck('the `by` verdict is parsed out of the third key part',
    page.indexOf('>overtaken</td>') !== -1 && page.indexOf('>caught_up</td>') !== -1);
  ck('overtaken and caught_up are totalled as the stuck-signal (2 + 3 = 5)',
    page.indexOf('5 of the check-offs in this window') !== -1);
  ck('...and the section says why those two mean stuck',
    /could no longer satisfy/.test(page) && /already true when they reached it/.test(page));

  /* ------------------------------------------------------------------ 6. rewinds */
  head('6. rewinds by step');
  ck('a rewind row renders its step and its count',
    /<th[^>]*>Rewinds<\/th>/.test(page) && page.indexOf('>3</td>') !== -1);
  ck('the checkpoint picker is excluded and the page says so',
    /checkpoint picker is a decision about the plant/.test(page));

  /* -------------------------------------------- 7. the sections moved off Analytics */
  head('7. the "In the simulator" block moved here');
  /* A SOURCE check, because this is a claim about a MOVE — the sections have to be on one
   * page and absent from the other, and rendering one page cannot show the other's
   * absence. Both directions, so a copy-and-paste that forgot to delete reddens too. */
  var ROOT = path.join(__dirname, '..');
  var an = fs.readFileSync(path.join(ROOT, 'worker', 'src', 'analytics.js'), 'utf8');
  ['Sessions by starting condition', 'How far through a startup they get',
   'Most-used controls', 'Controls people try but cannot use', 'Panels opened',
   'Time per session'].forEach(function (name) {
    ck('"' + name + '" is on the usage page', page.indexOf(name) !== -1);
    ck('..and is gone from analytics.js', an.indexOf(name) === -1);
  });
  ck('the "In the simulator" heading is gone from analytics.js',
    an.indexOf('In the simulator') === -1);
  ck('analytics.js links to the usage page instead', an.indexOf('view=usage') !== -1);

  /* ----------------------------------------------------- 8. the empty-dataset path */
  head('8. no walkthrough rows yet — the probe guard');
  /* Analytics Engine types columns PER RESULT SET: naming `double9` in a query nothing
   * matches is a 422, not an empty table. So on a dataset with no walkthrough rows the
   * five sections must not be ASKED, or the page is five error blocks on the day it ships.
   * The fake proves the guard by making every walkthrough query throw. */
  var empty = Object.assign({}, ROWS, { probe: [{ n: 0 }] });
  var thrown = 0;
  var strict = {
    probe: empty.probe,
    get starts() { thrown++; throw new Error('422 unable to find type of column'); },
    get ends() { thrown++; throw new Error('422'); },
    get funnel() { thrown++; throw new Error('422'); },
    get mix() { thrown++; throw new Error('422'); },
    get rewinds() { thrown++; throw new Error('422'); },
    get dwell() { thrown++; throw new Error('422'); },
  };
  var blank = await render(strict);
  ck('no walkthrough query is issued when the probe finds nothing', thrown === 0,
    thrown + ' walkthrough queries were issued against an empty dataset');
  ck('the page explains the empty window instead of erroring',
    /No walkthrough events in this window/.test(blank));
  ck('...and renders no error block', blank.indexOf('class="err"') === -1);
  ck('the migrated sections still render on an empty dataset',
    blank.indexOf('Panels opened') !== -1);

  /* --------------------------------------- 9b. a failed query is NAMED, not swallowed */
  head('9b. one broken query does not read as "no activity"');
  /* `Promise.all` rejects on the first failure, so each query catches its own — and the
   * lazy way to do that returns [] and renders an EMPTY SECTION. An empty section is
   * indistinguishable from "nothing happened", which is this file's own stated
   * anti-pattern and what #485 shipped. The error has to reach the page. */
  var partial = Object.assign({}, ROWS);
  Object.defineProperty(partial, 'funnel', {
    get: function () { return Promise.reject(new Error('422 unable to find type of column double9')); },
  });
  var broken = await render(partial);
  ck('a failed query is reported on the page', /walkthrough queries failed/.test(broken));
  ck('...it names which one', broken.indexOf('funnel: 422') !== -1);
  ck('...and says this is not an absence of activity',
    /NOT &quot;no activity&quot;|NOT "no activity"/.test(broken));
  ck('the sections that DID answer still render',
    broken.indexOf('overtaken') !== -1 && broken.indexOf('>40%</b>') !== -1);

  /* ------------------------------------------------------------------ 9. escaping */
  head('9. nothing from the wire reaches the page as markup');
  /* The enum guard in site/telemetry.js already forbids `<` in an id, and this page must
   * not DEPEND on that: the dashboard renders whatever the dataset holds, including rows a
   * hand-made probe put there. `raw` columns are the exception and are built here from a
   * clamped number, never from a wire value. */
  var hostile = Object.assign({}, ROWS, {
    starts: [{ wt: '<img src=x onerror=alert(1)>', sessions: 1, n: 1, steps: 3 }],
  });
  var esc = await render(hostile);
  ck('a hostile id is escaped, not rendered', esc.indexOf('<img src=x') === -1
    && esc.indexOf('&lt;img src=x') !== -1);

  /* ------------------------------------------------------- 10. the dev channel (#791) */
  head('10. usage.js excludes the dev channel everywhere (defect 3, owner ruling 2026-09-20)');
  var seenU = [];
  await render(ROWS, 't', seenU);
  ck('at least 12 queries were issued (6 walkthrough + probe + 5 migrated sim sections)',
    seenU.length >= 12, seenU.length + ' queries seen');
  var noDevFilter = seenU.filter(function (q) {
    return /FROM \S+ WHERE/.test(q) && q.indexOf("blob2 <> 'dev'") === -1;
  });
  ck('every query against the event stream excludes the dev channel',
    noDevFilter.length === 0, noDevFilter.length + ' missing it: ' + noDevFilter.join(' || ').slice(0, 300));

  /* ------------------------------------------------------ 11. the session clock (#791) */
  head('11. usage.js reads the SESSION clock (double6), not the PAGE clock (double5) (defect 4)');
  var elapsedQ = seenU.filter(function (q) {
    return /max\(double\d+\) AS t_last/.test(q);
  });
  ck('the elapsed-clock query names double6, never double5',
    elapsedQ.length === 1 && /max\(double6\)/.test(elapsedQ[0]) && !/max\(double5\)/.test(elapsedQ[0]),
    elapsedQ.join(' | '));

  /* -------------------------------------------------- 12. sessions.js: the dev channel */
  head('12. sessions.js excludes the dev channel on every query (defect 3, #791)');
  var seenS = [];
  await renderSessionList(mkSessionsRows(3), seenS);
  ck('at least 5 queries were issued (counts, starts, elapsed probe, elapsed, ends)',
    seenS.length >= 5, seenS.length + ' queries seen: ' + seenS.map(function (q) { return q.slice(0, 40); }).join(' || '));
  var noDevS = seenS.filter(function (q) { return q.indexOf("blob2 <> 'dev'") === -1; });
  ck('every one of them excludes the dev channel',
    noDevS.length === 0, noDevS.length + ' missing it: ' + noDevS.join(' || ').slice(0, 300));

  var seenD = [];
  await renderSessionDetail({ detailProbe: [{ n: 1 }],
    detailRows: [{ timestamp: '2026-09-19 10:00:00', event: 'command', key: 'scram' }] },
    'abc123-defg5678', seenD);
  ck('sessionDetail()\'s two queries exclude the dev channel too',
    seenD.length >= 2 && seenD.every(function (q) { return q.indexOf("blob2 <> 'dev'") !== -1; }),
    seenD.join(' || ').slice(0, 300));

  /* --------------------------------------------------- 13. sessions.js: session clock */
  head('13. sessions.js reads the SESSION clock (double6), not the PAGE clock (defect 4)');
  var elapsedS = seenS.filter(function (q) { return /max\(double\d+\) AS t_last/.test(q); });
  ck('the elapsed-clock query names double6, never double5',
    elapsedS.length === 1 && /max\(double6\)/.test(elapsedS[0]) && !/max\(double5\)/.test(elapsedS[0]),
    elapsedS.join(' | '));

  /* --------------------------------------------------- 14. sessions.js: the 100-cap */
  head('14. sessions.js says when the 100-session cap truncated the list (defect 5, #791)');
  var full100 = await renderSessionList(mkSessionsRows(100), []);
  ck('a full page of 100 sessions gets a truncation note',
    /Showing the most recent 100 sessions/.test(full100));
  var short3 = await renderSessionList(mkSessionsRows(3), []);
  ck('...and a short page does not', full100.indexOf('Showing the most recent') !== -1
    && short3.indexOf('Showing the most recent') === -1);

  /* ---------------------------------------- 14.1 sessions.js: sort by start time (#797.4) */
  head('14.1 sessions.js: sort by start time actually reorders (#797.4)');
  /* `mkSortRows` is chosen so recency order and duration order DISAGREE (s_mid started
   * in the middle but ran longest) — a check that passed either way by accident is worth
   * nothing here. Asserted on the RENDERED page, not the SQL text (the requirement): the
   * fake `dispatchSessions` plays Analytics Engine and actually honours `ORDER BY
   * first_seen ASC/DESC`, so if sessions.js stopped sending the right direction the
   * fixture's own order would leak through unchanged and this would catch it. */
  var pageNewestFirst = await renderSessionListQS(mkSortRows(), '&days=30&sort=start_desc');
  var pageOldestFirst = await renderSessionListQS(mkSortRows(), '&days=30&sort=start_asc');
  function orderIdx(page, ids) { return ids.map(function (id) { return page.indexOf('sid=' + id); }); }
  var newestOrder = orderIdx(pageNewestFirst, ['s_new', 's_mid', 's_old']);
  var oldestOrder = orderIdx(pageOldestFirst, ['s_old', 's_mid', 's_new']);
  ck('default (Newest first) renders s_new, s_mid, s_old in that order',
    newestOrder[0] < newestOrder[1] && newestOrder[1] < newestOrder[2], newestOrder.join(','));
  ck('Oldest first renders s_old, s_mid, s_new in that order — the OPPOSITE order',
    oldestOrder[0] < oldestOrder[1] && oldestOrder[1] < oldestOrder[2], oldestOrder.join(','));
  ck('...and it is a real reversal, not the same order read backwards by the test',
    pageNewestFirst.indexOf('sid=s_new') < pageOldestFirst.indexOf('sid=s_new'));

  /* ------------------------------------------- 14.2 sessions.js: sort by duration (#797.4) */
  head('14.2 sessions.js: sort by duration actually reorders — "show me the longest" (#797.4)');
  // s_mid = 500s (08:20 span), s_old = 50s, s_new = 20s — write-span only, no elapsed clock.
  var pageLongest = await renderSessionListQS(mkSortRows(), '&days=30&sort=dur_desc');
  var pageShortest = await renderSessionListQS(mkSortRows(), '&days=30&sort=dur_asc');
  var longestOrder = orderIdx(pageLongest, ['s_mid', 's_old', 's_new']);
  var shortestOrder = orderIdx(pageShortest, ['s_new', 's_old', 's_mid']);
  ck('Longest first renders s_mid (500s), s_old (50s), s_new (20s) in that order',
    longestOrder[0] < longestOrder[1] && longestOrder[1] < longestOrder[2], longestOrder.join(','));
  ck('Shortest first renders the OPPOSITE order: s_new, s_old, s_mid',
    shortestOrder[0] < shortestOrder[1] && shortestOrder[1] < shortestOrder[2], shortestOrder.join(','));
  ck('the longest session shows its actual duration ("8m 20s")', pageLongest.indexOf('8m 20s') !== -1);

  /* --------------------------------- 14.3 sessions.js: every param survives (#797.4) */
  head('14.3 sessions.js: sort links and the filter form preserve days + the active filter');
  var page7 = await renderSessionListQS(mkSortRows(), '&days=7&sort=dur_desc&device=mobile');
  ck('the filter form\'s hidden days field carries the ACTUAL window (7)',
    page7.indexOf('<input type="hidden" name="days" value="7">') !== -1);
  ck('a sort link (Newest first) carries days=7 AND the active device filter forward',
    page7.indexOf('href="?view=sessions&days=7&sort=start_desc&device=mobile"') !== -1);
  ck('the ACTIVE sort (Longest first) is bolded, not a link',
    /<b>Longest first<\/b>/.test(page7));

  /* ------------------------------------------- 14.4 sessions.js: a filter reaches the query */
  head('14.4 sessions.js: device/country/referrer filters reach the primary query (#797.4)');
  var seenDevice = [];
  await renderSessionListQS(mkSortRows(), '&days=30&device=mobile', seenDevice);
  ck('the device filter appears in the primary query as blob13',
    seenDevice.some(function (q) { return q.indexOf("blob13 = 'mobile'") !== -1; }));
  ck('...guarded by the 2026-09-20 column floor (OWN_COLUMNS_SINCE)',
    seenDevice.some(function (q) { return q.indexOf("blob13 = 'mobile'") !== -1
      && q.indexOf('2026-09-21') !== -1; }));
  var seenCountry = [];
  await renderSessionListQS(mkSortRows(), '&days=30&country=US', seenCountry);
  ck('the country filter appears in the primary query as blob11',
    seenCountry.some(function (q) { return q.indexOf("blob11 = 'US'") !== -1; }));
  var seenUnknownCountry = [];
  await renderSessionListQS(mkSortRows(), '&days=30&country=unknown', seenUnknownCountry);
  ck('"unknown" country filters on the empty string, not the literal word',
    seenUnknownCountry.some(function (q) { return q.indexOf("blob11 = ''") !== -1; }));
  var seenRef = [];
  await renderSessionListQS(mkSortRows(), '&days=30&ref=external', seenRef);
  ck('the referrer-kind filter appears in the primary query as blob10',
    seenRef.some(function (q) { return q.indexOf("blob10 = 'external'") !== -1; }));
  var seenNone = [];
  await renderSessionListQS(mkSortRows(), '&days=30', seenNone);
  ck('with no filter selected, no query names blob13/blob11/blob10 at all',
    seenNone.every(function (q) { return q.indexOf('blob13 =') === -1 && q.indexOf('blob10 =') === -1
      && q.indexOf('blob11 =') === -1; }));

  /* --------------------------- 14.5 sessions.js: window survives sort + filter TOGETHER */
  head('14.5 sessions.js: the day window survives a sort change AND a filter change at once');
  var seenBoth = [];
  var pageBoth = await renderSessionListQS(mkSortRows(),
    '&days=14&sort=dur_asc&country=US&scram=yes', seenBoth);
  ck('the primary query carries the 14-day window',
    seenBoth.some(function (q) { return q.indexOf("INTERVAL \'14\' DAY") !== -1; }));
  ck('the filter form\'s hidden days field reads 14, not the 30-day default',
    pageBoth.indexOf('<input type="hidden" name="days" value="14">') !== -1);
  ck('a sort link carries the 14-day window AND the active country + scram filters',
    pageBoth.indexOf('href="?view=sessions&days=14&sort=dur_desc&country=US&scram=yes"') !== -1);

  /* -------------------------------------------------- 14.6 sessions.js: sort-aware cap note */
  head('14.6 sessions.js: the truncation note names WHICH 100 sessions it is showing (#797.4)');
  var capOldest = await renderSessionListQS(mkSessionsRows(100), '&days=30&sort=start_asc');
  ck('sorted oldest-first, the note says OLDEST, not "most recent"',
    /Showing the OLDEST 100 sessions/.test(capOldest) && capOldest.indexOf('most recent') === -1);
  var capDur = await renderSessionListQS(mkSessionsRows(100), '&days=30&sort=dur_desc');
  ck('sorted by duration, the note says the sort applies WITHIN the fetched 100',
    /sorted by duration/.test(capDur) && /within that set/.test(capDur));
  var capFiltered = await renderSessionListQS(mkSessionsRows(100), '&days=30&device=mobile');
  ck('with a filter active and the cap hit, the note says so',
    capFiltered.indexOf('matching this filter') !== -1);
  var capShort = await renderSessionListQS(mkSessionsRows(3), '&days=30&sort=start_asc');
  ck('under the cap, no truncation note at all regardless of sort',
    capShort.indexOf('Showing the') === -1);

  /* ------------------------------------------------------- 14.7 sessions.js: scram filter */
  head('14.7 sessions.js: "scrammed" filters sessions without a second query round (#797.4)');
  var seenScram = [];
  var pageAny = await renderSessionListQS(mkScramRows(), '&days=30', seenScram);
  ck('unfiltered, both sessions render',
    pageAny.indexOf('sid=s_scrammed') !== -1 && pageAny.indexOf('sid=s_clean') !== -1);
  var pageYes = await renderSessionListQS(mkScramRows(), '&days=30&scram=yes');
  ck('scram=yes keeps the scrammed session and drops the clean one',
    pageYes.indexOf('sid=s_scrammed') !== -1 && pageYes.indexOf('sid=s_clean') === -1);
  var pageNo = await renderSessionListQS(mkScramRows(), '&days=30&scram=no');
  ck('scram=no keeps the clean session and drops the scrammed one',
    pageNo.indexOf('sid=s_clean') !== -1 && pageNo.indexOf('sid=s_scrammed') === -1);
  ck('the "scrammed" milestone query never issues a query per already-fetched session — one query total',
    seenScram.filter(function (q) { return q.indexOf("blob5 = 'scram'") !== -1; }).length === 1);

  /* --------------------------------------- 14.8 sessions.js: device/country/referrer shown */
  head('14.8 sessions.js: a card shows its own device/country/referrer');
  var METogo = {
    counts: [{ session: 's_meta', first_seen: '2026-09-19 10:00:00', last_seen: '2026-09-19 10:00:05', raw: 1, est: 1 }],
    starts: [], probe: [{ n: 0 }], metaProbe: [{ n: 1 }], elapsed: [], ends: [],
    meta: [{ session: 's_meta', device: 'mobile', country: 'US', ref_kind: 'external' }],
    scrams: [],
  };
  var pageMeta = await renderSessionListQS(METogo, '&days=30');
  ck('the card shows the device, country and referrer kind for its own session',
    pageMeta.indexOf('mobile') !== -1 && pageMeta.indexOf('>US<') !== -1
    && pageMeta.indexOf('external') !== -1);

  /* --------------------------------------------------- 15. usage.js: the version filter */
  head('15. the RELEASE-VERSION filter on Feature usage (#800)');
  /* THREE (release, channel) combinations, chosen so the default pick is FALSIFIABLE:
   * Alpha 1.7.10 is the most recently SEEN (2026-09-20) but sorts BELOW Alpha 1.7.9 as a
   * string ('1' < '9' at the first differing character) — a lexical "latest" would pick
   * the wrong one, which is exactly injection 6 above. 1.7.10 also carries only 5
   * sessions, under the small-sample threshold, so the default render exercises that
   * warning too without a second fixture. Alpha 1.7.4 appears under BOTH public and
   * preview, proving a release is not by itself a unique option. */
  var VER_ROWS = Object.assign({}, ROWS, {
    releases: [
      { release: 'Alpha 1.7.9', channel: 'public', sessions: 33, last_seen: '2026-09-10 12:00:00' },
      { release: 'Alpha 1.7.10', channel: 'public', sessions: 5, last_seen: '2026-09-20 09:00:00' },
      { release: 'Alpha 1.7.4', channel: 'preview', sessions: 2, last_seen: '2026-09-01 00:00:00' },
    ],
  });

  var seenDefault = [];
  var pageDefault = await render(VER_ROWS, 't', seenDefault);
  ck('the default version is picked by LAST-SEEN TIMESTAMP, not a lexical sort of the string',
    pageDefault.indexOf('<option value="Alpha 1.7.10|public" selected>') !== -1,
    'expected Alpha 1.7.10 (last seen 09-20) selected over the lexically-higher Alpha 1.7.9 (09-10)');
  ck('the sample-size line names the selected release, channel and count',
    pageDefault.indexOf('Alpha 1.7.10 — public · 5 sessions') !== -1);
  ck('a release in two channels gets two unambiguous, separately-labelled options',
    pageDefault.indexOf('Alpha 1.7.4 — preview (2)') !== -1
    && pageDefault.indexOf('Alpha 1.7.9 — public (33)') !== -1);
  ck('the dropdown lists them NEWEST FIRST by last-seen',
    pageDefault.indexOf('Alpha 1.7.10 — public') < pageDefault.indexOf('Alpha 1.7.9 — public')
    && pageDefault.indexOf('Alpha 1.7.9 — public') < pageDefault.indexOf('Alpha 1.7.4 — preview'));
  ck('"All versions" is offered and states its own total',
    pageDefault.indexOf('<option value="all"') !== -1 && pageDefault.indexOf('All versions (40 sessions)') !== -1);

  /* THE SMALL-SAMPLE WARNING (5 sessions, below the 10-session threshold). */
  ck('a 5-session release gets the small-sample warning, by name',
    pageDefault.indexOf('Only 5 sessions in this window for') !== -1
    && pageDefault.indexOf('one session moves any percentage') !== -1);
  var page9 = await renderQS(VER_ROWS, '&days=30&version=' + encodeURIComponent('Alpha 1.7.9|public'));
  /* NOT a bare "no .warn anywhere" check — the Time-on-step retention caveat and the
   * overtaken/caught_up stuck-signal count both legitimately use `.warn` too. The
   * small-sample warning is identified by its own wording instead. */
  ck('...and a 33-session one does not',
    page9.indexOf('Alpha 1.7.9 — public · 33 sessions') !== -1
    && page9.indexOf('one session moves any percentage') === -1);

  /* THE `days` PARAMETER SURVIVES A VERSION CHANGE — a non-default window (7, not the
   * usual 30) plus an explicit version, and the hidden field must echo the window it was
   * actually rendered with, not silently reset to the default. */
  var page7 = await renderQS(VER_ROWS,
    '&days=7&version=' + encodeURIComponent('Alpha 1.7.9|public'), []);
  ck('the `days` hidden field carries the ACTUAL window (7), not a reset to the default (30)',
    page7.indexOf('<input type="hidden" name="days" value="7">') !== -1
    && page7.indexOf('<input type="hidden" name="days" value="30">') === -1);

  /* EVERY SECTION HONOURS THE FILTER — every event query issued while a specific
   * (release, channel) is selected names it, or the check would pass on a page where one
   * section quietly still reads the whole dataset (injection 7, "Panels opened"). The
   * dropdown's OWN listing query is excluded: it has to see every release to offer them. */
  var seenSel = [];
  await renderQS(VER_ROWS, '&days=30&version=' + encodeURIComponent('Alpha 1.7.9|public'), seenSel);
  var eventQueries = seenSel.filter(function (q) {
    return /FROM \S+ WHERE/.test(q) && q.indexOf('GROUP BY release, channel') === -1;
  });
  var missingFilter = eventQueries.filter(function (q) {
    return q.indexOf("blob3 = 'Alpha 1.7.9'") === -1 || q.indexOf("blob2 = 'public'") === -1;
  });
  ck('at least 12 event queries were issued with a version selected',
    eventQueries.length >= 12, eventQueries.length + ' queries seen');
  ck('EVERY one of them carries the selected release and channel — no section ignores the filter',
    missingFilter.length === 0,
    missingFilter.length + ' missing it: ' + missingFilter.join(' || ').slice(0, 300));

  /* AN UNKNOWN/STALE `version` FALLS BACK TO THE LATEST, NEVER TO "ALL" — a stray or
   * expired value must not silently widen the scope back to the unfiltered page. */
  var pageBad = await renderQS(VER_ROWS, '&days=30&version=' + encodeURIComponent('Alpha 0.0.0|public'));
  ck('an unrecognised version falls back to the latest release, not to "All versions"',
    pageBad.indexOf('Alpha 1.7.10 — public · 5 sessions') !== -1);

  console.log('\n' + BOLD + (nFail ? RED + 'FAIL' : GREEN + 'PASS') + RST
    + '  ' + nPass + ' passed, ' + nFail + ' failed'
    + (INJECT ? '  ' + BOLD + '(--inject: failures are the POINT)' + RST : ''));
  console.log(BOLD + '\nUSAGE PAGE: ' + (nFail ? RED + 'FAIL' : GREEN + 'OK') + RST
    + '  ' + nPass + 'passed ' + nFail + 'failed ' + (nPass + nFail) + 'checks\n');
  process.exit(nFail ? 1 : 0);
}()).catch(function (e) {
  console.error(RED + 'RUNNER ERROR' + RST, e && e.stack || e);
  process.exit(2);
});
