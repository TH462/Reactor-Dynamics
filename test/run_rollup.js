/*
 * run_rollup.js — the daily analytics rollup (#604).
 *
 * WHY THIS RUNNER HAS TO EXIST. `worker/src/rollup.js` is the first scheduled handler in
 * this repo, and nothing else in test/ executes worker code at all: run_dashboard_time
 * imports render.js helpers, run_telemetry parses the Worker as TEXT. So the job that
 * decides what history we keep for two years had no coverage of any kind.
 *
 * The failures it guards are all SILENT ONES — every one of them produces a plausible
 * table rather than an error:
 *
 *   1. DOUBLE COUNTING. A retry, an overlapping schedule or a manual re-run appending
 *      instead of replacing gives a day twice its traffic. A doubled day looks exactly
 *      like a good day. This is the defect that would be invisible in production and it
 *      is checked by running the job twice and asserting the store is unchanged.
 *   2. THE WRONG DAY. The dashboard renders EASTERN days *(OWNER DIRECTIVE, 2026-08-13)*.
 *      A rollup on UTC midnight would mis-file four or five hours of every day into its
 *      neighbour, and the stored history would disagree with the live view at exactly the
 *      edges nobody checks. The two DST switch days are pinned, because the plausible
 *      shortcut (sampling the zone offset at noon) is wrong on precisely those two, in
 *      OPPOSITE directions — render.js's own comment records it and run_dashboard_time
 *      pins the same cases for the display side.
 *   3. COARSE DATA STORED AS EXACT. The point of the job is that a same-day capture is
 *      exact; a late one is not. Silently storing rounded figures in the one place that is
 *      supposed to be exact is worse than not storing them, so a coarse response must be
 *      stored AND marked.
 *   4. INTERNAL NAVIGATION COUNTED AS DISCOVERY. Measured on the live account, our own
 *      host was the referrer on half the rows over 30 days.
 *
 * NO NETWORK AND NO D1. Both upstreams are injected as fakes and the database is a small
 * in-memory stub implementing the slice of the D1 API rollup.js uses (prepare/bind/run/
 * batch). The point is the job's LOGIC — what it asks for, how it keys rows, what it does
 * twice — not Cloudflare's behaviour, which this could not test anyway.
 *
 *   node test/run_rollup.js
 */
'use strict';
var path = require('path');
var url = require('url');

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

/* ---- a D1 stub: prepare / bind / run / batch, and a readable table dump ---------------
 * Statements are kept as {sql, args} and executed by a tiny interpreter that understands
 * exactly three shapes: CREATE (ignored), INSERT OR REPLACE (upsert on the declared
 * PRIMARY KEY) and DELETE ... WHERE day < ?. Anything else throws rather than silently
 * doing nothing, so a future statement cannot pass this gate by being unrecognised. */
function makeDb() {
  var tables = {}, keys = {};
  function parseCreate(sql) {
    var m = /CREATE TABLE IF NOT EXISTS (\w+)/.exec(sql);
    if (!m) return;
    tables[m[1]] = tables[m[1]] || [];
    var pk = /PRIMARY KEY \(([^)]*)\)/.exec(sql);
    keys[m[1]] = pk ? pk[1].split(',').map(function (s) { return s.trim(); })
                    : (/(\w+) TEXT PRIMARY KEY/.exec(sql) || [])[1];
    if (typeof keys[m[1]] === 'string') keys[m[1]] = [keys[m[1]]];
  }
  function exec(st) {
    var sql = st.sql, a = st.args || [];
    if (/^\s*CREATE/i.test(sql)) { parseCreate(sql); return; }
    var ins = /INSERT(?: OR REPLACE)? INTO (\w+) \(([^)]*)\)/i.exec(sql);
    if (ins) {
      // A plain INSERT appends; only OR REPLACE upserts. The distinction is what makes the
      // --inject run below able to reproduce the double-counting defect at all.
      var replacing = /INSERT OR REPLACE/i.test(sql);
      var t = ins[1], cols = ins[2].split(',').map(function (s) { return s.trim(); });
      var row = {}; cols.forEach(function (c, i) { row[c] = a[i]; });
      tables[t] = tables[t] || [];
      var k = keys[t] || cols;
      var idx = replacing ? tables[t].findIndex(function (r) {
        return k.every(function (c) { return String(r[c]) === String(row[c]); }); }) : -1;
      if (idx >= 0) tables[t][idx] = row; else tables[t].push(row);
      return;
    }
    var del = /DELETE FROM (\w+) WHERE day < \?/i.exec(sql);
    if (del) {
      var tt = del[1];
      tables[tt] = (tables[tt] || []).filter(function (r) { return !(r.day < a[0]); });
      return;
    }
    throw new Error('D1 stub does not understand: ' + sql.slice(0, 60));
  }
  return {
    /* ⚠ `bind()` RETURNS A NEW STATEMENT, it does not mutate. That is D1's documented
     * behaviour and the whole reason `db.prepare(sql)` once, `stmt.bind(a)`, `stmt.bind(b)`
     * into one batch is the idiomatic shape — which is what rollup.js does. The first cut
     * of this stub mutated and returned `this`, so every row in a batch executed with the
     * LAST row's arguments and the gate reported a correct implementation as dropping rows.
     * A stub that models the API loosely fails working code, which is worse than no stub. */
    prepare: function (sql) {
      function mk(args) {
        return {
          sql: sql, args: args,
          bind: function () { return mk(Array.prototype.slice.call(arguments)); },
          run: function () { exec({ sql: sql, args: args }); return Promise.resolve({}); },
        };
      }
      return mk([]);
    },
    batch: function (sts) { sts.forEach(exec); return Promise.resolve([]); },
    _t: function (n) { return tables[n] || []; },
  };
}

/* ---- fake upstreams ------------------------------------------------------------------
 * `gqlRows` is what Cloudflare's RUM API would return; `sqlRows` the Analytics Engine SQL
 * answer. Both are captured so the checks can assert on the QUERY as well as the result —
 * the window a job asks for is as much a defect surface as what it writes. */
/* OUR OWN page_view stream, as Analytics Engine would answer the two grouped queries
 * fetchOwnTraffic asks. `ref_kind` is non-empty on every row a deployed Worker writes,
 * so the '' row below is a PRE-COLUMN row and must be dropped rather than stored. */
var OWN_VIEWS = [
  { page: 'home', channel: 'public', ref_host: 'news.ycombinator.com', ref_kind: 'external',
    country: 'US', bot_kind: '', bot: 0, n: 9, sessions: 7 },
  { page: 'home', channel: 'public', ref_host: 'reactordynamics.com', ref_kind: 'internal',
    country: 'GB', bot_kind: '', bot: 0, n: 4, sessions: 3 },
  { page: 'about', channel: 'public', ref_host: '', ref_kind: 'direct',
    country: 'US', bot_kind: 'crawler', bot: 1, n: 2, sessions: 2 },
  // The pre-column row: every dimension reads back as the default a short row gives.
  { page: 'home', channel: 'public', ref_host: '', ref_kind: '',
    country: '', bot_kind: '', bot: 0, n: 40, sessions: 11 },
];
/* session_start, grouped WITHOUT blob5 — two starting conditions would otherwise map to
 * the same 'shell' primary key and one would silently replace the other. */
var OWN_SHELL = [
  { channel: 'public', ref_host: 'reactordynamics.com', ref_kind: 'internal',
    country: 'US', bot_kind: '', bot: 0, n: 5, sessions: 5 },
];

function fakeUpstream(gqlRows, sqlRows, si, own) {
  var seen = { gql: [], sql: [] };
  return {
    seen: seen,
    gql: function (token, query) {
      seen.gql.push(query);
      return Promise.resolve({
        rumPageloadEventsAdaptiveGroups: gqlRows.map(function (r) {
          return { count: r.count, avg: { sampleInterval: r.si == null ? (si || 1) : r.si },
                   sum: { visits: r.visits }, dimensions: r.d };
        }),
      });
    },
    /* Query-aware, because fetchOwnTraffic asks THREE more questions and a fake that
     * answered them all with the usage rows would let a wrong query pass. `own === null`
     * makes the PROBE reject, which is what an Analytics Engine 422 looks like before
     * the new columns exist on any row. */
    sql: function (token, q) {
      seen.sql.push(q);
      if (/LIMIT 1/.test(q)) {
        return own === null
          ? Promise.reject(new Error('HTTP 422: no such column blob10'))
          : Promise.resolve([{ ref_kind: 'direct', bot: 0 }]);
      }
      if (/blob1 = 'page_view'/.test(q)) return Promise.resolve(own === null ? [] : (own || {}).views || OWN_VIEWS);
      if (/blob1 = 'session_start'/.test(q)) return Promise.resolve(own === null ? [] : (own || {}).shell || OWN_SHELL);
      return Promise.resolve(sqlRows);
    },
  };
}

/* LOADING THE WORKER'S ES MODULES FROM A CommonJS RUNNER.
 *
 * `run_dashboard_time.js` established the idiom — base64 a module into a `data:` URL and
 * import that, because there is no package.json declaring module type and the repo root is
 * gated against gaining one (`.github/workflows/gates.yml` fails the build if one appears).
 *
 * That idiom only works for a SELF-CONTAINED module, and rollup.js imports two others: a
 * relative specifier inside a data: URL has no base to resolve against. So the graph is
 * resolved bottom-up here, each module's own imports rewritten to the data: URL of the
 * already-built dependency. Three modules, no cycles; this is a loader, not a bundler, and
 * it will throw rather than guess if the graph ever grows an edge it does not know. */
/* --inject            the ORIGINAL combined injection (both rollup defects at once)
 * --inject=<name>     one named defect, listed by --list-injections
 *
 * Both forms are kept: the bare flag predates the map and is what anyone who has run
 * this file before will type. Each named entry is [file, anchor, replacement] and THE
 * ANCHOR MUST BE A SINGLE PHYSICAL LINE — worker/src/rollup.js is LF and index.js is
 * CRLF in this tree, so an anchor with an embedded newline matches nothing in one of
 * them and the injection silently never fires, which is worse than no injection. */
var ARGS = process.argv.slice(2).join(' ');
var NAMED = (/--inject=([\w-]+)/.exec(ARGS) || [])[1] || null;
var INJECT = !NAMED && process.argv.indexOf('--inject') >= 0;
var INJECTIONS = {
  /* --- our own traffic series (2026-09-20) ------------------------------------- */
  // The new series written into the Cloudflare-derived table, which is the one thing
  // the whole design says must not happen: the two are only trustworthy separately.
  'own-writes-traffic-daily': ['rollup.js',
    "      batch.push(...upsert(db, 'own_traffic_daily', OWN_KEY, o.rows));",
    "      batch.push(...upsert(db, 'traffic_daily', OWN_KEY, o.rows));"],
  // A pre-column row kept: reads back as a direct visit from an unknown country with
  // 40 views, and nothing anywhere says it is a row from before the columns existed.
  'own-predating-kept': ['rollup.js',
    '    if (!r.ref_kind) { predating++; return; }',
    '    if (false) { predating++; return; }'],
  // The probe's catch removed: a 422 before the Worker is deployed then takes the whole
  // day's own-traffic write down instead of recording a reason.
  'own-probe-fatal': ['rollup.js',
    "    return { rows: [], note: 'own-columns-absent' };", '    throw e;'],
  // The floor dropped from the window.
  'own-no-columns-since': ['rollup.js',
    '    + ` AND timestamp >= ${OWN_COLUMNS_SINCE}`;', '    ;'],
  // The run stops recording how many rows it wrote, so a broken fetch and a quiet day
  // become the same note.
  'own-count-unrecorded': ['rollup.js',
    "    out.notes.push('own:' + out.own_rows);", ''],
  // The shell's arrival dropped: the table then has no row for the one page the funnel
  // is about, and page_view never fires there to make up for it.
  'own-shell-dropped': ['rollup.js',
    "  shell.forEach((r) => take(r, 'shell'));", ''],
  // Retention stops applying to the new table only — the other two still prune, so the
  // job looks healthy.
  'own-not-pruned': ['rollup.js',
    "  batch.push(db.prepare('DELETE FROM own_traffic_daily WHERE day < ?').bind(horizon));", ''],
  // count() instead of sum(_sample_interval): rows stored, not events that happened.
  'own-counts-rows': ['rollup.js',
    '  const aggs = `sum(_sample_interval) AS n, count(DISTINCT blob4) AS sessions`;',
    '  const aggs = `count() AS n, count(DISTINCT blob4) AS sessions`;'],
};

if (/--list-injections/.test(ARGS)) {
  Object.keys(INJECTIONS).forEach(function (k) { console.log(k); });
  process.exit(0);
}
/* THE INJECTIONS, one per silent failure this runner exists to catch. Each reverts a fix
 * to its exact original defective text so the gate proves it catches the regression, not
 * merely a change adjacent to it.
 *
 *   rollup.js: (1) `INSERT OR REPLACE` becomes a plain `INSERT`, i.e. the job appends
 *   instead of upserting — a doubled day looks exactly like a good day.
 *   (2) the `!token` guard returns BEFORE `ensureSchema`/the batch write, so an expired
 *   token produces total silence — no `rollup_runs` row, no reason recorded (defect 2).
 *
 *   cfapi.js: `gql()` stops checking `res.ok`, so a 403/429/5xx shaped like
 *   {success:false, errors:[], result:null} — an EMPTY errors array — returns {} instead
 *   of throwing, and a day the token could not fetch is written as a quiet day (defect 1).
 */
function injectSrc(rel, src) {
  if (NAMED) {
    var spec = INJECTIONS[NAMED];
    if (!spec) throw new Error('unknown injection: ' + NAMED);
    if (spec[0] !== rel) return src;
    if (src.indexOf(spec[1]) < 0) {
      throw new Error('injection "' + NAMED + '" did not match its anchor in ' + rel
        + ' — the source moved and the injection is blind, which is worse than no injection');
    }
    return src.split(spec[1]).join(spec[2]);
  }
  if (!INJECT) return src;
  if (rel === 'rollup.js') {
    return src
      .split('INSERT OR REPLACE INTO').join('INSERT INTO')
      .split("    out.notes.push('no CF_ANALYTICS_TOKEN');\n  } else {")
      .join("    out.notes.push('no CF_ANALYTICS_TOKEN'); return out;\n  } else {");
  }
  if (rel === 'cfapi.js') {
    return src.split(
      "  if (!res.ok) throw new Error('gql HTTP ' + res.status + ': ' + text.slice(0, 200).trim());\n"
    ).join('');
  }
  return src;
}

function loadEsm(ROOT, entry) {
  var fs = require('fs');
  var built = {};
  function build(rel) {
    if (built[rel]) return built[rel];
    var src = injectSrc(rel, fs.readFileSync(path.join(ROOT, 'worker', 'src', rel), 'utf8'));
    src = src.replace(/from\s+'\.\/([\w.]+\.js)'/g, function (_, dep) {
      return "from '" + build(dep) + "'";
    });
    built[rel] = 'data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64');
    return built[rel];
  }
  return import(build(entry));
}

(async function main() {
  var ROOT = path.join(__dirname, '..');
  var mod = await loadEsm(ROOT, 'rollup.js');

  console.log(BOLD + '\ndaily analytics rollup — #604' + RST);

  /* ---------------------------------------------------------------- 1. the Eastern day */
  head('1. the job rolls up the EASTERN day that just closed');
  /* 2026-06-15 03:00Z is 2026-06-14 23:00 EDT — still the 14th in Eastern, so the day that
   * just CLOSED is the 13th. A UTC-midnight job would say the 14th. */
  var w = mod.dayWindow(Date.UTC(2026, 5, 15, 3, 0, 0));
  ck('an instant that is still "yesterday" in Eastern rolls up the day before that',
     w.day === '2026-06-13', 'window day = ' + w.day + ' (UTC date would say 2026-06-14)');
  ck('...and the window is exactly one Eastern day long',
     (w.toMs - w.fromMs) === 24 * 3600 * 1000,
     ((w.toMs - w.fromMs) / 3600000).toFixed(2) + ' h');

  /* THE DST PAIR. These are the two days a year the plausible shortcut gets wrong, in
   * opposite directions — render.js's etDayStartMs comment records both, and the display
   * side is pinned by run_dashboard_time. The stored history has to agree with it. */
  var spring = mod.dayWindow(Date.UTC(2026, 2, 9, 12, 0, 0));   // 2026-03-09 08:00 EDT
  ck('spring forward: the 8th is 23 hours, not 24',
     spring.day === '2026-03-08' && (spring.toMs - spring.fromMs) === 23 * 3600 * 1000,
     spring.day + ', ' + ((spring.toMs - spring.fromMs) / 3600000) + ' h');
  var fall = mod.dayWindow(Date.UTC(2026, 10, 2, 12, 0, 0));    // 2026-11-02 07:00 EST
  ck('fall back: the 1st is 25 hours, not 24',
     fall.day === '2026-11-01' && (fall.toMs - fall.fromMs) === 25 * 3600 * 1000,
     fall.day + ', ' + ((fall.toMs - fall.fromMs) / 3600000) + ' h');

  /* ---------------------------------------------------------------- 2. internal vs external */
  head('2. our own host is internal navigation, not discovery');
  ck('the site referring to itself is INTERNAL',
     mod.referrerKind('reactordynamics.com', 'reactordynamics.com') === 'internal', '');
  ck('...and so is a preview host, without naming it in a literal',
     mod.referrerKind('develop.reactor-dynamics.pages.dev', 'reactordynamics.com') === 'internal', '');
  ck('no referrer is DIRECT, not external', mod.referrerKind('', 'reactordynamics.com') === 'direct', '');
  ck('a real referrer is EXTERNAL',
     mod.referrerKind('news.ycombinator.com', 'reactordynamics.com') === 'external', '');

  /* ---------------------------------------------------------------- 3. the job */
  var ROWS = [
    { count: 12, visits: 9, d: { countryName: 'United States', refererHost: '', requestPath: '/',
        requestHost: 'reactordynamics.com', deviceType: 'desktop', userAgentBrowser: 'Chrome',
        userAgentOS: 'Windows', navigationType: 'navigate', bot: 0 } },
    { count: 5, visits: 0, d: { countryName: 'Ukraine', refererHost: 'reactordynamics.com',
        requestPath: '/sim', requestHost: 'reactordynamics.com', deviceType: 'desktop',
        userAgentBrowser: 'Firefox', userAgentOS: 'Linux', navigationType: 'navigate', bot: 0 } },
  ];
  var USAGE = [{ event: 'command', channel: 'public', release: 'Alpha 1.7.0', key_str: 'scram',
                 plant: 'pwr2', n: 7, sessions: 3 }];

  function mkEnv(up) {
    var db = makeDb();
    return { env: { STATS: db, CF_ANALYTICS_TOKEN: 'x' }, db: db, up: up };
  }
  head('3. one run writes the day, and a SECOND run changes nothing (idempotency)');
  var up = fakeUpstream(ROWS, USAGE, 1);
  var E = mkEnv(up);
  var NOW = Date.UTC(2026, 5, 15, 5, 10, 0);
  var r1 = await mod.runRollup(E.env, NOW, up);
  ck('the run reports the rows it wrote', r1.traffic_rows === 2 && r1.usage_rows === 1,
     'traffic ' + r1.traffic_rows + ', usage ' + r1.usage_rows + ', notes "' + r1.notes.join('; ') + '"');
  var t1 = E.db._t('traffic_daily').length, u1 = E.db._t('usage_daily').length;
  ck('the store holds them', t1 === 2 && u1 === 1, t1 + ' traffic, ' + u1 + ' usage');
  ck('the referrer kinds are classified, not stored raw',
     E.db._t('traffic_daily').map(function (r) { return r.referrer_kind; }).sort().join(',') === 'direct,internal',
     E.db._t('traffic_daily').map(function (r) { return r.referrer_kind; }).join(','));

  await mod.runRollup(E.env, NOW, up);
  var t2 = E.db._t('traffic_daily').length, u2 = E.db._t('usage_daily').length;
  ck('RUNNING IT AGAIN DOES NOT DOUBLE THE DAY — the failure that looks like a good day',
     t2 === t1 && u2 === u1, 'after two runs: ' + t2 + ' traffic, ' + u2 + ' usage');
  var loads = E.db._t('traffic_daily').reduce(function (a, r) { return a + r.pageloads; }, 0);
  ck('...and the totals are unchanged, not merely the row count', loads === 17, loads + ' pageloads');
  ck('the run itself is recorded, so a MISSING day is distinguishable from a quiet one',
     E.db._t('rollup_runs').length === 1 && E.db._t('rollup_runs')[0].day === '2026-06-14',
     JSON.stringify(E.db._t('rollup_runs')[0] || {}).slice(0, 90));

  /* ---------------------------------------------------------------- 4. coarse */
  head('4. a COARSE capture is stored AND marked, never passed off as exact');
  var upC = fakeUpstream(ROWS, USAGE, 10);
  var EC = mkEnv(upC);
  var rc = await mod.runRollup(EC.env, NOW, upC);
  ck('the rows are still stored — dropping them would read as "no traffic"',
     EC.db._t('traffic_daily').length === 2, EC.db._t('traffic_daily').length + ' rows');
  ck('every row carries its sample_interval',
     EC.db._t('traffic_daily').every(function (r) { return r.sample_interval === 10; }), '');
  ck('and the run is flagged coarse',
     rc.coarse === 10 && /coarse:10/.test(rc.notes.join(';')), rc.notes.join('; '));

  /* ---------------------------------------------------------------- 5. retention */
  head('5. retention: two years, pruned by the job itself (owner ruling)');
  ck('RETAIN_DAYS is the ruled two years', mod.RETAIN_DAYS === 730, String(mod.RETAIN_DAYS));
  var EP = mkEnv(up);
  await mod.runRollup(EP.env, NOW, up);
  // plant one row inside the horizon and one well outside it, then run again
  EP.db.prepare('INSERT OR REPLACE INTO traffic_daily (day, country, referrer_host, referrer_kind, path, device, browser, os, nav_type, bot, pageloads, visits, sample_interval) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind('2019-01-01', 'X', '', 'direct', '/', 'd', 'b', 'o', 'navigate', 0, 1, 1, 1).run();
  EP.db.prepare('INSERT OR REPLACE INTO traffic_daily (day, country, referrer_host, referrer_kind, path, device, browser, os, nav_type, bot, pageloads, visits, sample_interval) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind('2026-01-01', 'Y', '', 'direct', '/', 'd', 'b', 'o', 'navigate', 0, 1, 1, 1).run();
  await mod.runRollup(EP.env, NOW, up);
  var days = EP.db._t('traffic_daily').map(function (r) { return r.day; });
  ck('a row older than two years is pruned', days.indexOf('2019-01-01') < 0, days.join(','));
  ck('...and one inside the window is kept', days.indexOf('2026-01-01') >= 0, days.join(','));

  /* ---------------------------------------------------------------- 6. the window asked for */
  head('6. the job asks the upstreams for the day it claims to be rolling up');
  var q = up.seen.gql[0] || '';
  ck('the RUM query window opens at the Eastern day start, not UTC midnight',
     /datetime_geq: "2026-06-14T04:00:00Z"/.test(q),
     (/datetime_geq: "([^"]+)"/.exec(q) || [])[1] + ' — the cron fires 01:10 EDT on the 15th, so the closed day is the 14th, and 2026-06-14 00:00 EDT is 04:00Z');
  ck('...and it asks for every dimension the store keys on',
     /countryName/.test(q) && /refererHost/.test(q) && /requestPath/.test(q) &&
     /userAgentBrowser/.test(q) && /userAgentOS/.test(q) && /navigationType/.test(q) && /bot/.test(q), '');
  var sq = up.seen.sql[0] || '';
  ck('the usage query is bounded on BOTH sides — an open upper bound would re-read today',
     /timestamp >= toDateTime/.test(sq) && /timestamp < toDateTime/.test(sq), '');
  ck('...and it sums the sample interval rather than counting stored rows',
     /sum\(_sample_interval\)/.test(sq) && !/\bcount\(\)/.test(sq), '');

  /* ---------------------------------------------------------------- 7. gql() checks status */
  head('7. gql() checks the HTTP status, not only the errors array (defect 1)');
  /* Loaded as its OWN entry — cfapi.js has no relative imports, so this needs no stub
   * graph — with global.fetch swapped out so the module's real HTTP layer runs, which is
   * the thing under test here (everywhere else in this file fetch never happens at all). */
  var modCfapi = await loadEsm(ROOT, 'cfapi.js');
  var savedFetch = global.fetch;
  try {
    // Cloudflare's actual shape for a 403/429/5xx: 200-shaped JSON, EMPTY errors array.
    // Only the status distinguishes this from a genuinely quiet day.
    global.fetch = function () { return Promise.resolve({
      ok: false, status: 403,
      text: function () { return Promise.resolve(JSON.stringify({ success: false, errors: [], result: null })); },
    }); };
    var threw403 = false, msg403 = '';
    try { await modCfapi.gql('tok', '{ viewer { accounts { x } } }'); }
    catch (e) { threw403 = true; msg403 = String(e.message || e); }
    ck('a 403 with an EMPTY errors array throws instead of returning {}',
       threw403 && /403/.test(msg403), msg403 || '(did not throw)');

    // A genuine GraphQL error (200 OK, non-empty errors) must still throw — the status
    // check is ADDED to the errors check, never a replacement for it.
    global.fetch = function () { return Promise.resolve({
      ok: true, status: 200,
      text: function () { return Promise.resolve(JSON.stringify({ errors: [{ message: 'bad query' }] })); },
    }); };
    var threwBad = false, msgBad = '';
    try { await modCfapi.gql('tok', 'garbage'); }
    catch (e) { threwBad = true; msgBad = String(e.message || e); }
    ck('...and a 200 WITH an errors array still throws',
       threwBad && /bad query/.test(msgBad), msgBad || '(did not throw)');

    // A genuinely good response still returns the account unharmed.
    global.fetch = function () { return Promise.resolve({
      ok: true, status: 200,
      text: function () { return Promise.resolve(JSON.stringify({ data: { viewer: { accounts: [{ ok: 1 }] } } })); },
    }); };
    var good = await modCfapi.gql('tok', '{ viewer { accounts { ok } } }');
    ck('a genuinely good response is unaffected', good.ok === 1, JSON.stringify(good));
  } finally { global.fetch = savedFetch; }

  /* ---------------------------------------------------------------- 8. token-missing run */
  head('8. a missing CF_ANALYTICS_TOKEN still records the run (defect 2)');
  var dbNoTok = makeDb();
  var envNoTok = { STATS: dbNoTok, CF_ANALYTICS_TOKEN: '' };
  var upNoTok = fakeUpstream(ROWS, USAGE, 1);
  var rNoTok = await mod.runRollup(envNoTok, NOW, upNoTok);
  ck('the run reports the reason and zero rows',
     rNoTok.traffic_rows === 0 && rNoTok.usage_rows === 0 && /no CF_ANALYTICS_TOKEN/.test(rNoTok.notes.join(';')),
     JSON.stringify(rNoTok));
  ck('a rollup_runs ROW IS WRITTEN ANYWAY — a missing day must be distinguishable from a quiet one',
     dbNoTok._t('rollup_runs').length === 1 && /no CF_ANALYTICS_TOKEN/.test(dbNoTok._t('rollup_runs')[0].note || ''),
     JSON.stringify(dbNoTok._t('rollup_runs')[0] || {}));
  ck('...and no traffic/usage rows are fabricated in the process',
     dbNoTok._t('traffic_daily').length === 0 && dbNoTok._t('usage_daily').length === 0, '');
  ck('the upstreams were never called — there is no token to call them with',
     upNoTok.seen.gql.length === 0 && upNoTok.seen.sql.length === 0, '');

  /* ---------------------------------------------------------------- 9. our own stream */
  head('9. our own page_view stream, in a table of its OWN (2026-09-20)');
  var upO = fakeUpstream(ROWS, USAGE, 1);
  var EO = mkEnv(upO);
  var rO = await mod.runRollup(EO.env, NOW, upO);
  var ownT = EO.db._t('own_traffic_daily');
  ck('the run writes our own rows and reports the count',
     rO.own_rows === 4 && ownT.length === 4,
     'own_rows ' + rO.own_rows + ', stored ' + ownT.length + ' — 3 page_view + 1 shell, the pre-column row dropped');
  ck('A PRE-COLUMN ROW IS DROPPED, not stored as a direct visit from nowhere',
     ownT.every(function (r) { return r.referrer_kind !== ''; }) &&
     ownT.every(function (r) { return r.views !== 40; }) &&
     /own-predating:1/.test(rO.notes.join(';')),
     'kinds ' + ownT.map(function (r) { return r.referrer_kind; }).join(',') + ' | notes ' + rO.notes.join('; '));
  ck('the CLOUDFLARE-derived table is untouched by it — the two series stay comparable with themselves',
     EO.db._t('traffic_daily').length === 2 &&
     EO.db._t('traffic_daily').every(function (r) { return r.pageloads === 12 || r.pageloads === 5; }),
     EO.db._t('traffic_daily').length + ' traffic rows');
  ck('the shell arrives as page "shell", from session_start — page_view never fires there',
     ownT.filter(function (r) { return r.page === 'shell'; }).length === 1 &&
     (ownT.filter(function (r) { return r.page === 'shell'; })[0] || {}).views === 5,
     ownT.map(function (r) { return r.page + ':' + r.views; }).join(','));
  ck('the referrer is stored as a HOST with its KIND beside it, not re-derived later',
     ownT.some(function (r) { return r.referrer_host === 'news.ycombinator.com' && r.referrer_kind === 'external'; }) &&
     ownT.some(function (r) { return r.referrer_host === 'reactordynamics.com' && r.referrer_kind === 'internal'; }),
     ownT.map(function (r) { return (r.referrer_host || '(none)') + '/' + r.referrer_kind; }).join(' '));
  ck('the country and OUR bot verdict both reach the store',
     ownT.some(function (r) { return r.country === 'US' && r.bot === 1 && r.bot_kind === 'crawler'; }) &&
     ownT.some(function (r) { return r.country === 'GB' && r.bot === 0; }),
     ownT.map(function (r) { return r.country + '/' + r.bot + r.bot_kind; }).join(' '));

  var ownBefore = JSON.stringify(EO.db._t('own_traffic_daily'));
  await mod.runRollup(EO.env, NOW, upO);
  ck('RUNNING IT AGAIN DOES NOT DOUBLE THE NEW TABLE EITHER',
     JSON.stringify(EO.db._t('own_traffic_daily')) === ownBefore,
     'after two runs: ' + EO.db._t('own_traffic_daily').length + ' rows');
  ck('the run note records own:N, so a broken fetch is distinguishable from a quiet day',
     /(^|; )own:4(;|$)/.test(EO.db._t('rollup_runs')[0].note || ''),
     'note "' + (EO.db._t('rollup_runs')[0].note || '') + '"');

  head('10. the query it asks, and the floor it asks under');
  var probeQ = upO.seen.sql[1] || '', viewQ = upO.seen.sql[2] || '', shellQ = upO.seen.sql[3] || '';
  ck('a PROBE runs before the new columns are named — a 422 is not a null',
     /LIMIT 1/.test(probeQ) && /blob10/.test(probeQ) && /double11/.test(probeQ),
     probeQ.replace(/\s+/g, ' ').slice(0, 90));
  ck('the window carries the COLUMNS_SINCE floor as a toDateTime cast',
     viewQ.indexOf(mod.OWN_COLUMNS_SINCE) >= 0 && /^toDateTime\('[\d -:]+'\)$/.test(mod.OWN_COLUMNS_SINCE),
     mod.OWN_COLUMNS_SINCE);
  ck('...and the floor cannot predate the code that writes the columns',
     mod.OWN_COLUMNS_SINCE_TS >= '2026-09-21', mod.OWN_COLUMNS_SINCE_TS);
  ck('it sums the sample interval rather than counting stored rows',
     /sum\(_sample_interval\)/.test(viewQ) && !/\bcount\(\)/.test(viewQ), '');
  ck('the two groupings are separate, and only the page_view one groups on blob5',
     /blob5 AS page/.test(viewQ) && !/blob5/.test(shellQ) &&
     /blob1 = 'session_start'/.test(shellQ),
     'shell query groups on: ' + ((/GROUP BY ([^\n]*)/.exec(shellQ) || [])[1] || '(none)'));
  ck('it reads the four new blobs and the new double by POSITION',
     /blob9 AS ref_host/.test(viewQ) && /blob10 AS ref_kind/.test(viewQ) &&
     /blob11 AS country/.test(viewQ) && /blob12 AS bot_kind/.test(viewQ) &&
     /double11 AS bot/.test(viewQ), '');

  head('11. the columns not being live yet is a RECORDED REASON, not a failure');
  var upA = fakeUpstream(ROWS, USAGE, 1, null);
  var EA = mkEnv(upA);
  var rA = await mod.runRollup(EA.env, NOW, upA);
  ck('a probe 422 records own-columns-absent and writes no own rows',
     rA.own_rows === 0 && /own-columns-absent/.test(rA.notes.join(';')) &&
     EA.db._t('own_traffic_daily').length === 0,
     rA.notes.join('; '));
  ck('...and the rest of the day is unharmed — the other two tables still fill',
     rA.traffic_rows === 2 && rA.usage_rows === 1,
     'traffic ' + rA.traffic_rows + ', usage ' + rA.usage_rows);
  ck('...and the run row still records it',
     /own-columns-absent/.test(EA.db._t('rollup_runs')[0].note || ''),
     EA.db._t('rollup_runs')[0].note || '');

  head('12. retention reaches the new table too');
  var EQ = mkEnv(upO);
  await mod.runRollup(EQ.env, NOW, upO);
  EQ.db.prepare('INSERT OR REPLACE INTO own_traffic_daily (day, channel, country, referrer_host, referrer_kind, page, bot, bot_kind, views, sessions) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind('2019-01-01', 'public', 'US', '', 'direct', 'home', 0, '', 1, 1).run();
  await mod.runRollup(EQ.env, NOW, upO);
  var odays = EQ.db._t('own_traffic_daily').map(function (r) { return r.day; });
  ck('a row older than two years is pruned from own_traffic_daily as well',
     odays.indexOf('2019-01-01') < 0 && odays.length === 4, odays.join(','));

  console.log('\n' + BOLD + (nFail === 0 ? GREEN + 'PASS' : RED + 'FAIL') + RST +
    '  ' + nPass + ' passed, ' + nFail + ' failed, ' + (nPass + nFail) + ' checks');
  if (INJECT || NAMED) {
    var caught = nFail > 0;
    console.log((caught ? GREEN + 'INJECTION CAUGHT' : RED + 'INJECTION MISSED') + RST +
      ' — "' + (NAMED || 'the combined rollup defect') + '" ' +
      (caught ? 'reddened ' + nFail + ' check(s).' : 'changed NOTHING. The gate is hollow.'));
    process.exit(caught ? 0 : 1);
  }
  process.exit(nFail === 0 ? 0 : 1);
})().catch(function (e) {
  console.log(RED + 'run_rollup: ' + (e && e.stack || e) + RST);
  process.exit(1);
});
