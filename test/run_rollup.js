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
function fakeUpstream(gqlRows, sqlRows, si) {
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
    sql: function (token, q) { seen.sql.push(q); return Promise.resolve(sqlRows); },
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
var INJECT = process.argv.indexOf('--inject') >= 0;
/* THE INJECTION: `INSERT OR REPLACE` becomes a plain `INSERT`, i.e. the job appends instead
 * of upserting. That is the production failure this runner exists for — a doubled day looks
 * exactly like a good day, with no error anywhere — so it is the one the gate has to be
 * shown to catch rather than merely claimed to. */
function injectSrc(rel, src) {
  if (!INJECT || rel !== 'rollup.js') return src;
  return src.split('INSERT OR REPLACE INTO').join('INSERT INTO');
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

  console.log('\n' + BOLD + (nFail === 0 ? GREEN + 'PASS' : RED + 'FAIL') + RST +
    '  ' + nPass + ' passed, ' + nFail + ' failed, ' + (nPass + nFail) + ' checks');
  if (INJECT) {
    var caught = nFail > 0;
    console.log((caught ? GREEN + 'INJECTION CAUGHT' : RED + 'INJECTION MISSED') + RST +
      ' — appending instead of upserting ' +
      (caught ? 'reddened ' + nFail + ' check(s).' : 'changed NOTHING. The gate is hollow.'));
    process.exit(caught ? 0 : 1);
  }
  process.exit(nFail === 0 ? 0 : 1);
})().catch(function (e) {
  console.log(RED + 'run_rollup: ' + (e && e.stack || e) + RST);
  process.exit(1);
});
