/*
 * run_dashboard_stats.js — the READ side of the first-party daily store (#764, Unit 2a).
 *
 * WHAT IT GUARDS. `worker/src/stats.js` is the first thing that ever reads what the nightly
 * rollup writes, and every failure it can have is a SILENT one: each produces a plausible
 * table rather than an error, which is the exact class of false reading #764 was opened
 * over. Five of them, one per section below.
 *
 *   1. A MISSING DAY DRAWN AS A QUIET DAY. A day with no traffic and a day the cron never
 *      ran both write zero rows to `traffic_daily`. Only `rollup_runs` tells them apart.
 *      Conflating them turns an outage into a collapse in interest, and nothing errors.
 *   2. A COARSE DAY AVERAGED IN. A late capture comes back rounded to the nearest 10 and is
 *      stored with sample_interval > 1. Against about 5 landing visits a day that is a
 *      doubled bar; blended into a 7-day mean it is a trend that never happened.
 *   3. A PERCENTAGE THAT IS THE STORE STARTING. The store begins about 2026-09-01. A
 *      period-over-period figure whose prior window predates that prints several hundred
 *      percent of growth. So does a prior total of zero, via Infinity.
 *   4. `usage_daily.sessions` SUMMED. It is count(DISTINCT blob4) per (day, channel,
 *      release, event, key_str, plant): one session firing five events lands in five rows.
 *      A sum reports that session five times and looks entirely reasonable.
 *   5. A DAY STRING INTERPOLATED INTO SQL. D1 binds parameters; nothing here has cfapi's
 *      excuse. The one value that cannot be bound is a COLUMN NAME, which is what the
 *      groupBy dimension selects.
 *
 * Plus the Eastern-day arithmetic underneath all of it: a window spanning a daylight-saving
 * switch is 23 or 25 hours long, and both switch days are pinned here in both directions.
 *
 * NO NETWORK AND NO D1. The database is an in-memory stub implementing the slice of the D1
 * API stats.js uses (prepare/bind/all), with a small SELECT interpreter over seeded tables.
 * It RECORDS EVERY STATEMENT AND ITS BOUND ARGUMENTS, so the checks can assert the result
 * and the binding — an interpolated query that happens to return the right rows is still a
 * defect, and it is invisible to a result-only assertion.
 *
 * …AND THEN A REAL SQL ENGINE, because that stub is an interpreter written in this file and
 * therefore agrees with itself by construction: a statement valid to me and invalid to
 * SQLite would pass every check above and fail in production. Section 10 builds the REAL
 * schema (read out of rollup.js at runtime, never retyped) in `node:sqlite`, prepares every
 * statement the module emitted — all seven groupBy dimensions included, since each
 * interpolates a different column name — and re-runs the module against it to compare the
 * answers row for row.
 *
 *   node test/run_dashboard_stats.js
 *   node test/run_dashboard_stats.js --inject=coarse-blind     (proof the checks can fail)
 *   node test/run_dashboard_stats.js --list-injections
 */
'use strict';
var path = require('path');

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

/* ---- the D1 stub ---------------------------------------------------------------------
 * prepare / bind / all, over seeded in-memory tables, with a SELECT interpreter that
 * understands exactly the shapes stats.js issues: aggregate-with-GROUP-BY, whole-table
 * MIN/MAX, `day >= ? AND day <= ?` (and the same with literals, so an INTERPOLATION
 * INJECTION still runs and is caught by the binding check rather than by a crash), an
 * optional `bot = 0`, ORDER BY <col> DESC and LIMIT.
 *
 * It THROWS on anything it does not recognise. A stub that silently returns [] would let a
 * future query pass this gate by being unparseable, which is how a hollow check is born. */
function makeDb() {
  var tables = { traffic_daily: [], usage_daily: [], rollup_runs: [] };
  var seen = [];

  function lit(tok, args, i) {
    if (tok === '?') return { v: args[i.n++], bound: true };
    var m = /^'(.*)'$/.exec(tok);
    if (m) return { v: m[1], bound: false };
    if (/^-?\d+$/.test(tok)) return { v: Number(tok), bound: false };
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
        /* STUB_DRIFT is the --inject=stub-drift case: the interpreter below starts
         * disagreeing with SQLite. It is the only way to redden the row-for-row comparison
         * in section 10, because an injection into the MODULE changes both sides of that
         * comparison identically and could never fail it. */
        if (it.fn === 'SUM') out[it.as] = STUB_DRIFT ? vals.length
          : vals.reduce(function (a, b) { return a + Number(b); }, 0);
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
    // D1's bind() RETURNS A NEW STATEMENT rather than mutating — modelled exactly, because a
    // loose stub fails working code (run_rollup.js's own stub header records that cost).
    prepare: function (sql) {
      function mk(args) {
        return {
          sql: sql, args: args,
          bind: function () { return mk(Array.prototype.slice.call(arguments)); },
          all: function () { seen.push({ sql: sql, args: args }); return Promise.resolve(run(sql, args)); },
          first: function () {
            seen.push({ sql: sql, args: args });
            return Promise.resolve(run(sql, args).results[0] || null);
          },
        };
      }
      return mk([]);
    },
    seen: seen,
    _ins: function (t, row) { tables[t].push(row); return this; },
    _rows: function (t) { return tables[t]; },
    _tables: function () { return Object.keys(tables); },
  };
}

/* ---- the same D1 surface, over a REAL SQLite engine -----------------------------------
 * The stub above is an interpreter I wrote, so it agrees with itself by construction: it
 * cannot catch a statement that is valid to me and invalid to SQLite. `node:sqlite` ships
 * with Node 24 and closes that hole for the price of an adapter — same prepare/bind/all
 * shape, so the MODULE runs unmodified against a real engine and the two results can be
 * compared row for row. */
function realDb(sq) {
  var seen = [];
  return {
    prepare: function (sql) {
      function mk(args) {
        return {
          sql: sql, args: args,
          bind: function () { return mk(Array.prototype.slice.call(arguments)); },
          all: function () {
            seen.push({ sql: sql, args: args });
            var st = sq.prepare(sql);
            return Promise.resolve({ results: st.all.apply(st, args) });
          },
        };
      }
      return mk([]);
    },
    seen: seen,
  };
}

/* ---- seeding -------------------------------------------------------------------------
 * A store that begins 2026-09-01 and contains, on purpose, one of every kind of day the
 * reader has to tell apart. */
function traffic(db, day, country, pageloads, visits, si, bot, extra) {
  var row = {
    day: day, country: country, referrer_host: '', referrer_kind: 'direct', path: '/',
    device: 'desktop', browser: 'Chrome', os: 'Windows', nav_type: 'navigate',
    bot: bot ? 1 : 0, pageloads: pageloads, visits: visits, sample_interval: si,
  };
  Object.keys(extra || {}).forEach(function (k) { row[k] = extra[k]; });
  db._ins('traffic_daily', row);
}
function ran(db, day, rows, coarse, note) {
  db._ins('rollup_runs', {
    day: day, ran_at: day + 'T05:10:00Z', traffic_rows: rows, usage_rows: 0,
    coarse: coarse, note: note || '',
  });
}

function seed() {
  var db = makeDb();
  //            day           country          loads visits si  bot
  traffic(db, '2026-09-01', 'United States', 10, 6, 1, 0); ran(db, '2026-09-01', 1, 1);
  traffic(db, '2026-09-02', 'United States', 8, 5, 1, 0);
  traffic(db, '2026-09-02', 'United States', 500, 400, 1, 1);   // a bot day, excluded
  ran(db, '2026-09-02', 2, 1);
  ran(db, '2026-09-03', 0, 1);                                   // REAL ZERO: ran, no traffic
  traffic(db, '2026-09-04', 'France', 20, 10, 10, 0);            // COARSE: nearest 10
  ran(db, '2026-09-04', 1, 10, 'coarse:10');
  traffic(db, '2026-09-05', 'United States', 9, 4, 1, 0);
  traffic(db, '2026-09-05', 'France', 3, 1, 1, 0);
  /* THE HOST THAT ONLY THE STORED KIND GETS RIGHT. `preview.example.net` referring to
   * itself was classified `internal` at rollup time by the exact-match rule
   * (refererHost === requestHost). Recomputing the kind from the host alone — which is all
   * a single-column GROUP BY leaves a page able to do — matches neither reactordynamics.com
   * nor *.pages.dev and returns `external`, i.e. reports in-app navigation as discovery.
   * It is here so the referrer reader is tested on the one case that can tell the two
   * apart, rather than on the rows where both answers agree. */
  traffic(db, '2026-09-05', 'United States', 6, 0, 1, 0,
    { referrer_host: 'preview.example.net', referrer_kind: 'internal' });
  traffic(db, '2026-09-05', 'United States', 4, 2, 1, 0,
    { referrer_host: 'news.ycombinator.com', referrer_kind: 'external', nav_type: 'reload' });
  ran(db, '2026-09-05', 4, 1);
  /* 2026-09-06: NO run row at all — the cron never fired. */
  ran(db, '2026-09-07', 0, 1, 'traffic failed: upstream 500');   // ran, captured nothing
  // A clean fortnight: 09-08..09-14 at 4 landing visits a day, 09-15..09-21 at 7.
  for (var i = 8; i <= 21; i++) {
    var day = '2026-09-' + (i < 10 ? '0' + i : i);
    var v = i <= 14 ? 4 : 7;
    traffic(db, day, 'United States', v * 2, v, 1, 0);
    ran(db, day, 1, 1);
  }
  // Three genuinely dead days at the end: the run fired, nobody came.
  ran(db, '2026-09-22', 0, 1); ran(db, '2026-09-23', 0, 1); ran(db, '2026-09-24', 0, 1);

  db._ins('usage_daily', { day: '2026-09-10', channel: 'public', release: 'Alpha 1.7.5',
    event: 'session_start', key_str: '', plant: 'pwr2', n: 6, sessions: 6 });
  db._ins('usage_daily', { day: '2026-09-10', channel: 'public', release: 'Alpha 1.7.5',
    event: 'command', key_str: 'scram', plant: 'pwr2', n: 11, sessions: 5 });
  db._ins('usage_daily', { day: '2026-09-11', channel: 'public', release: 'Alpha 1.7.5',
    event: 'command', key_str: 'scram', plant: 'pwr2', n: 4, sessions: 3 });
  return db;
}

/* ---- loading the worker's ES modules from a CommonJS runner --------------------------
 * run_dashboard_time.js established the data:-URL idiom and run_rollup.js extended it to a
 * graph: there is no package.json declaring module type (the CI gate fails the build if one
 * appears), and a relative specifier inside a data: URL has no base to resolve against. So
 * the graph is built BOTTOM-UP, each module's imports rewritten to the data: URL of the
 * already-built dependency. stats.js imports render.js; two modules, no cycles. */
var ARG = process.argv.slice(2).join(' ');
var INJECT = (/--inject=([\w-]+)/.exec(ARG) || [])[1] || null;

/* THE INJECTIONS. Each one is a real defect this runner claims to catch, applied to the
 * module source before it is loaded, so "the check can go red" is a command anyone can
 * re-run rather than a sentence in a report. */
var INJECTIONS = {
  'missing-blind': ['stats.js', 'missing: !run || failed,', 'missing: false,'],
  'coarse-blind': ['stats.js',
    'coarse: (a ? num(a.si) : 1) > 1 || (run ? num(run.coarse) : 1) > 1,', 'coarse: false,'],
  'delta-always': ['stats.js', 'const refuse = (reason) => ({ ok: false, reason });',
    "const refuse = (reason) => ({ ok: true, pct: 0, direction: 'flat', reason });"],
  /* PER-DAY DEEP-LINK LANDINGS (owner, 2026-09-20: "show that per day"). Same shape as the
   * two `deeplink-*` injections below, aimed at the new day-form instead of the total. */
  'deeplink-day-home-counted': ['stats.js',
    "    if (String(r.path) !== '/' && String(r.referrer_kind) === 'direct') cur.deepLink += num(r.visits);",
    "    if (String(r.path) === '/') cur.deepLink += num(r.visits);"],
  'deeplink-day-external-counted': ['stats.js',
    "    if (String(r.path) !== '/' && String(r.referrer_kind) === 'direct') cur.deepLink += num(r.visits);",
    "    if (String(r.path) !== '/') cur.deepLink += num(r.visits);"],
  'deeplink-day-bots-in': ['stats.js',
    "    + ' WHERE day >= ? AND day <= ? AND bot = 0 GROUP BY day, path, referrer_kind').bind(f, t).all();",
    "    + ' WHERE day >= ? AND day <= ? GROUP BY day, path, referrer_kind').bind(f, t).all();"],
  'loose-day': ['stats.js', 'if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(t)) return null;', ''],
  'no-allowlist': ['stats.js',
    'const col = Object.prototype.hasOwnProperty.call(DIMS, dim) ? DIMS[dim] : null;',
    'const col = DIMS[dim] || String(dim);'],
  'interp': ['stats.js',
    "    + ' WHERE day >= ? AND day <= ? AND bot = 0 GROUP BY day').bind(f, t).all();",
    "    + \" WHERE day >= '\" + f + \"' AND day <= '\" + t + \"' AND bot = 0 GROUP BY day\").all();"],
  'naive-day': ['stats.js',
    '  return etDayStartMs(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), 12, 0, 0));',
    '  return etDayStartMs(d);'],
  'sum-sessions': ['stats.js',
    "    'SELECT event AS event, key_str AS key_str, plant AS plant, SUM(n) AS n'",
    "    'SELECT event AS event, key_str AS key_str, plant AS plant, SUM(n) AS n, SUM(sessions) AS sessions'"],
  'sum-sessions2': ['stats.js', '    n: num(x.n),', '    n: num(x.n),\n    sessions: num(x.sessions),'],
  'zero-prior': ['stats.js',
    "  if (!(prevTotal > 0)) return refuse('no traffic in the prior period');", ''],
  /* The four below exist because the checks they redden are ABSENCE-SHAPED — "this day is
   * NOT coarse", "this row is not missing", "there is no gap". An absence can be pinning a
   * non-event, so each is shown to fail against a defect that would produce the absence
   * for the wrong reason. */
  'coarse-always': ['stats.js',
    'coarse: (a ? num(a.si) : 1) > 1 || (run ? num(run.coarse) : 1) > 1,', 'coarse: true,'],
  'groupby-coarse-blind': ['stats.js', '    coarse: num(x.si) > 1,', '    coarse: false,'],
  'bots-in': ['stats.js', ' AND bot = 0 GROUP BY day', ' GROUP BY day'],
  'gaps': ['stats.js', '  return days.map((day) => {',
    '  return days.filter((day) => byDay.has(day) || runBy.has(day)).map((day) => {'],
  'store-empty-row': ['stats.js',
    "  if (!row || row.first == null || row.first === '') return null;", '  if (!row) return null;'],
  /* The two below are for section 10 and could not be caught by anything above it: both
   * produce SQL my own interpreter happily accepts. `bad-alias` aliases a column to a
   * RESERVED WORD, which is the failure mode I named as unverified in the first pass;
   * `ghost-column` selects a column that does not exist in the real schema. */
  'bad-alias': ['stats.js', "'SELECT ' + col + ' AS key,", "'SELECT ' + col + ' AS group,"],
  /* --- the dimensions and the referrer reader (the 2026-09-18 additions) --------------- */
  /* RE-ANCHORED (found blind alongside `ghost-column` while re-firing every injection for
   * #791): the two-line anchor joined by a literal `\n` never matched this CRLF file, so the
   * injection only "caught" by throwing its own not-found error — worse than no injection,
   * since it never actually shrank the allowlist. `dims-shrunk-a`/`-b` are each a SINGLE
   * physical line; `PAIRS` below fires both, the same idiom `sum-sessions` already uses. */
  'dims-shrunk-a': ['stats.js', "  nav_type: 'nav_type',", ''],
  'dims-shrunk-b': ['stats.js', "  bot: 'bot',", ''],
  'bot-filtered': ['stats.js', "  const humans = col === 'bot' ? '' : ' AND bot = 0';",
    "  const humans = ' AND bot = 0';"],
  'bot-stringified': ['stats.js',
    "    key: NUMERIC_DIMS[dim] ? num(x.key) : (x.key == null ? '' : String(x.key)),",
    "    key: x.key == null ? '' : String(x.key),"],
  /* The defect the referrer reader exists to prevent, written out: the kind recomputed from
   * the host alone, which is all a single-column GROUP BY leaves a page able to do. */
  'kind-recomputed': ['stats.js', "    kind: x.kind == null ? '' : String(x.kind),",
    "    kind: /(^|\\.)reactordynamics\\.com$|(^|\\.)pages\\.dev$/i.test(String(x.host))\n"
    + "      ? 'internal' : (String(x.host) ? 'external' : 'direct'),"],
  /* RE-ANCHORED (found blind while re-firing every injection for #791: the original anchor
   * spanned three physical lines joined by a literal `\n`, and this file is CRLF — the join
   * never matched and the injection only "caught" by throwing the anchor-not-found error
   * itself, which is worse than no injection because it never touches the module at all.
   * A single physical line, selecting a column `traffic_daily` does not have. */
  'ghost-column': ['stats.js',
    "    'SELECT day AS day, SUM(pageloads) AS pageloads, SUM(visits) AS visits,'",
    "    'SELECT day AS day, SUM(pageviews) AS pageloads, SUM(visits) AS visits,'"],
  /* THE NEWEST READER'S bot FILTER. `dayCountryReferrer` never groups BY bot (unlike
   * `groupBy`'s deliberate exemption), so it has no excuse to ever drop `AND bot = 0`. */
  'cday-bots-in': ['stats.js',
    "    + ' FROM traffic_daily WHERE day >= ? AND day <= ? AND bot = 0'",
    "    + ' FROM traffic_daily WHERE day >= ? AND day <= ?'"],
  /* DEEP-LINK LANDINGS (#795): the off-by-one that inverts the metric, counting the
   * homepage itself as a deep-link landing instead of everything that is not it. */
  'deeplink-home-counted': ['stats.js',
    "  const deepLink = rows.filter((x) => x.path !== '/' && x.referrerKind === 'direct').reduce((s, x) => s + x.visits, 0);",
    "  const deepLink = rows.filter((x) => x.path === '/').reduce((s, x) => s + x.visits, 0);"],
  /* THE NARROWING #795's FOLLOW-UP MADE, PUT BACK: counting ANY non-home landing
   * regardless of referrer kind — the exact defect that made a search-engine-referred
   * subpage landing (`/about`, `/download`) read as though someone had bookmarked it. */
  'deeplink-external-counted': ['stats.js',
    "  const deepLink = rows.filter((x) => x.path !== '/' && x.referrerKind === 'direct').reduce((s, x) => s + x.visits, 0);",
    "  const deepLink = rows.filter((x) => x.path !== '/').reduce((s, x) => s + x.visits, 0);"],
};
// `sum-sessions` needs both halves of the same defect (the SELECT and the mapper), or the
// column is fetched and dropped and nothing changes. A one-sided injection lies (#295).
var PAIRS = { 'sum-sessions': ['sum-sessions', 'sum-sessions2'],
  'dims-shrunk': ['dims-shrunk-a', 'dims-shrunk-b'] };

/* Injections into THIS FILE rather than into the module. Section 10's comparison asks
 * whether my interpreter and SQLite agree; an injection into stats.js moves both answers
 * at once, so only a defect planted in the interpreter can prove that check is alive. */
var RUNNER_INJECTIONS = { 'stub-drift': "the runner's own SQL interpreter sums row COUNTS" };
var STUB_DRIFT = INJECT === 'stub-drift';

if (/--list-injections/.test(ARG)) {
  // `sum-sessions2` and the `dims-shrunk-a`/`-b` halves are PAIRS internals, not names anyone
  // runs directly — `dims-shrunk` (the name that fires both) is listed in their place.
  var HIDDEN_HALVES = { 'sum-sessions2': true, 'dims-shrunk-a': true, 'dims-shrunk-b': true };
  console.log('dims-shrunk');
  Object.keys(INJECTIONS).forEach(function (k) { if (!HIDDEN_HALVES[k]) console.log(k); });
  Object.keys(RUNNER_INJECTIONS).forEach(function (k) {
    console.log(k + '   (' + RUNNER_INJECTIONS[k] + ')'); });
  process.exit(0);
}

function injectSrc(rel, src) {
  if (!INJECT || RUNNER_INJECTIONS[INJECT]) return src;
  var names = PAIRS[INJECT] || [INJECT];
  names.forEach(function (n) {
    var spec = INJECTIONS[n];
    if (!spec) throw new Error('unknown injection: ' + n);
    if (spec[0] !== rel) return;
    if (src.indexOf(spec[1]) < 0) {
      throw new Error('injection "' + n + '" did not match its anchor in ' + rel
        + ' — the source moved and the injection is blind, which is worse than no injection');
    }
    src = src.split(spec[1]).join(spec[2]);
  });
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

function threw(fn) {
  try { fn(); return null; } catch (e) { return String(e && e.message || e); }
}
async function threwAsync(fn) {
  try { await fn(); return null; } catch (e) { return String(e && e.message || e); }
}

(async function main() {
  var ROOT = path.join(__dirname, '..');
  var S = await loadEsm(ROOT, 'stats.js');
  var db = seed();

  console.log(BOLD + '\nfirst-party store — the read side (#764 Unit 2a)' + RST +
    (INJECT ? RED + '   [INJECTED: ' + INJECT + ']' + RST : ''));

  /* =============================================================== 1. Eastern day maths */
  head('1. Eastern days across both daylight-saving switches (23 h and 25 h)');
  ck('spring forward 2026-03-08 is 23 hours long',
     (S.dayStartMs('2026-03-09') - S.dayStartMs('2026-03-08')) === 23 * 3600e3,
     ((S.dayStartMs('2026-03-09') - S.dayStartMs('2026-03-08')) / 3600e3) + ' h');
  ck('fall back 2026-11-01 is 25 hours long',
     (S.dayStartMs('2026-11-02') - S.dayStartMs('2026-11-01')) === 25 * 3600e3,
     ((S.dayStartMs('2026-11-02') - S.dayStartMs('2026-11-01')) / 3600e3) + ' h');
  ck('a bare day string is NOT read as midnight UTC (which is the previous Eastern evening)',
     S.dayStartMs('2026-06-15') === Date.UTC(2026, 5, 15, 4, 0, 0),
     new Date(S.dayStartMs('2026-06-15')).toISOString() + ' = 2026-06-15 00:00 EDT');
  ck('nextDay / prevDay step correctly over the spring switch',
     S.nextDay('2026-03-07') === '2026-03-08' && S.nextDay('2026-03-08') === '2026-03-09'
     && S.prevDay('2026-03-09') === '2026-03-08' && S.prevDay('2026-03-08') === '2026-03-07',
     S.nextDay('2026-03-08') + ' / ' + S.prevDay('2026-03-09'));
  ck('...and over the fall switch',
     S.nextDay('2026-10-31') === '2026-11-01' && S.nextDay('2026-11-01') === '2026-11-02'
     && S.prevDay('2026-11-02') === '2026-11-01' && S.prevDay('2026-11-01') === '2026-10-31',
     S.nextDay('2026-11-01') + ' / ' + S.prevDay('2026-11-02'));
  ck('dayRange counts CALENDAR days, not 24-hour blocks, across the spring switch',
     S.dayRange('2026-03-06', '2026-03-10').join(',')
       === '2026-03-06,2026-03-07,2026-03-08,2026-03-09,2026-03-10',
     S.dayRange('2026-03-06', '2026-03-10').join(','));
  ck('...and across the fall switch',
     S.dayRange('2026-10-30', '2026-11-03').join(',')
       === '2026-10-30,2026-10-31,2026-11-01,2026-11-02,2026-11-03',
     S.dayRange('2026-10-30', '2026-11-03').join(','));

  var pSpring = S.priorRange('2026-03-09', '2026-03-15');
  ck('priorRange over the SPRING switch lands on the right Eastern days',
     pSpring.from === '2026-03-02' && pSpring.to === '2026-03-08',
     JSON.stringify(pSpring) + ' (the prior week contains the 23-hour day)');
  var pFall = S.priorRange('2026-11-02', '2026-11-08');
  ck('priorRange over the FALL switch lands on the right Eastern days',
     pFall.from === '2026-10-26' && pFall.to === '2026-11-01',
     JSON.stringify(pFall) + ' (the prior week contains the 25-hour day)');
  ck('the prior window is the same LENGTH, abuts the selected one, and does not overlap',
     S.dayRange(pSpring.from, pSpring.to).length === 7
     && S.nextDay(pSpring.to) === '2026-03-09',
     S.dayRange(pSpring.from, pSpring.to).length + ' days, ends the day before 2026-03-09');
  ck('a single-day window has a single-day prior window',
     JSON.stringify(S.priorRange('2026-11-02', '2026-11-02')) === '{"from":"2026-11-01","to":"2026-11-01"}',
     JSON.stringify(S.priorRange('2026-11-02', '2026-11-02')));
  ck('an absurd span throws instead of walking for a million iterations',
     !!threw(function () { return S.dayRange('1999-01-01', '2026-01-01'); }), '');

  /* =============================================================== 2. strict day parsing */
  head('2. parseDay is strict — the string becomes half of a SQL range');
  ck('a real Eastern day is accepted and returned canonical',
     S.parseDay('2026-09-01') === '2026-09-01', String(S.parseDay('2026-09-01')));
  var BAD = ['2026-9-1', '26-09-01', '2026-09-1', '2026-13-01', '2026-02-30', '2026-00-10',
             '9999-99-99', '2026-09-01 00:00', '2026-09-01T00:00Z', 'today', '',
             "2026-09-01' OR '1'='1", '2026-09-01; DROP TABLE traffic_daily',
             '2026-09-01 UNION SELECT 1', '2026-09-01%', '../2026-09-01'];
  var survived = BAD.filter(function (s) { return S.parseDay(s) !== null; });
  ck('every malformed and injection-shaped string is rejected', survived.length === 0,
     survived.length ? 'ACCEPTED: ' + JSON.stringify(survived) : BAD.length + ' rejected');
  ck('a non-string is rejected rather than coerced',
     S.parseDay(null) === null && S.parseDay(20260901) === null && S.parseDay(undefined) === null, '');
  ck('a calendar-impossible date is rejected, not rolled forward by Date',
     S.parseDay('2026-02-30') === null && S.parseDay('2025-02-29') === null
     && S.parseDay('2024-02-29') === '2024-02-29', 'leap day 2024 kept, 2025 rejected');

  /* THE GUARD HAS TO BE ON THE QUERY PATH, not merely exported. A strict parseDay nothing
   * calls is a strict parseDay nothing enforces. */
  var before = db.seen.length;
  var e1 = await threwAsync(function () { return S.dailyTotals(db, "2026-09-01' OR '1'='1", '2026-09-05'); });
  ck('dailyTotals REFUSES an injection-shaped day and issues no statement at all',
     !!e1 && db.seen.length === before, e1 ? e1.slice(0, 70) : 'it did not throw');
  before = db.seen.length;
  var e2 = await threwAsync(function () { return S.groupBy(db, 'country', '2026-09-01', 'yesterday', 10); });
  ck('groupBy does the same on the `to` bound',
     !!e2 && db.seen.length === before, e2 ? e2.slice(0, 70) : 'it did not throw');
  var e3 = await threwAsync(function () { return S.dailyTotals(db, '2026-09-05', '2026-09-01'); });
  ck('a reversed range throws rather than returning [] (which draws as zero traffic)',
     !!e3 && /ends before it begins/.test(e3), String(e3).slice(0, 70));

  /* =============================================================== 3. missing vs quiet */
  head('3. a MISSING day is not a QUIET day — rollup_runs is the only thing that knows');
  var r = await S.dailyTotals(db, '2026-09-01', '2026-09-07');
  ck('one row per calendar day, ascending, no gaps',
     r.length === 7 && r.map(function (x) { return x.day; }).join(',')
       === '2026-09-01,2026-09-02,2026-09-03,2026-09-04,2026-09-05,2026-09-06,2026-09-07',
     r.length + ' rows: ' + r.map(function (x) { return x.day.slice(8); }).join(','));
  var d3 = r[2], d6 = r[5], d7 = r[6];
  ck('a REAL ZERO day: the run fired, nobody came — 0 and NOT missing',
     d3.pageloads === 0 && d3.visits === 0 && d3.missing === false,
     '09-03 ' + JSON.stringify({ p: d3.pageloads, v: d3.visits, missing: d3.missing }));
  ck('an UNCAPTURED day: no run row at all — 0 and MISSING',
     d6.pageloads === 0 && d6.visits === 0 && d6.missing === true,
     '09-06 ' + JSON.stringify({ p: d6.pageloads, v: d6.visits, missing: d6.missing }));
  ck('the two are DISTINGUISHABLE — identical counts, different flag',
     d3.pageloads === d6.pageloads && d3.missing !== d6.missing,
     'both 0 pageloads; missing ' + d3.missing + ' vs ' + d6.missing);
  ck('a run that recorded a traffic FAILURE is missing too — "it ran" is not the question',
     d7.missing === true && d7.pageloads === 0, '09-07 missing=' + d7.missing);
  ck('a day with traffic is not missing', r[0].missing === false && r[0].visits === 6,
     '09-01 visits ' + r[0].visits);
  ck('bots are excluded — 09-02 is 8 pageloads, not 508',
     r[1].pageloads === 8 && r[1].visits === 5, r[1].pageloads + ' pageloads, ' + r[1].visits + ' visits');

  /* =============================================================== 4. coarse days */
  head('4. a COARSE day is marked (stats.trailingMean, which used to be tested right here, '
     + 'was REMOVED 2026-09-20 -- owner: "get rid of the weekly average" -- and nothing else '
     + 'called it)');
  ck('sample_interval > 1 marks the day coarse', r[3].coarse === true && r[3].pageloads === 20,
     '09-04 coarse=' + r[3].coarse + ', ' + r[3].pageloads + ' pageloads (rounded to the nearest 10)');
  ck('an exact day is NOT marked coarse',
     r[0].coarse === false && r[4].coarse === false, '09-01 and 09-05');
  ck('a day with no rows is not silently coarse', r[2].coarse === false && r[5].coarse === false, '');
  ck('stats.trailingMean no longer exists (removed, not just unexported)',
     S.trailingMean === undefined, typeof S.trailingMean);

  /* ===================================================== 4b. deep-link landings, per day */
  head('4b. deepLinkLandingsByDay -- the per-day form (owner, 2026-09-20: "show that per '
     + 'day and plot it on the main plot")');
  /* An isolated fixture (own db, same reasoning `seedDeepLink` above gives): PATH x
   * REFERRER-KIND x DAY diversity the shared `db` has none of. Four days, one of each kind
   * this reader has to tell apart, same convention `dailyTotals`' own section 3 uses. */
  function seedDeepLinkByDay() {
    var d = makeDb();
    // Day 1: two deep-link landings (both direct, non-home) plus a home landing that must
    // not be counted.
    traffic(d, '2026-09-01', 'United States', 6, 4, 1, 0);
    traffic(d, '2026-09-01', 'United States', 3, 2, 1, 0, { path: '/ui/shell' });
    ran(d, '2026-09-01', 2, 1);
    // Day 2: REAL ZERO for deep-link landings -- every landing is the homepage -- must read
    // 0 and NOT missing, the same real-zero-vs-uncaptured split `dailyTotals` guards.
    traffic(d, '2026-09-02', 'United States', 10, 6, 1, 0);
    ran(d, '2026-09-02', 1, 1);
    // Day 3: an EXTERNAL non-home landing only -- must stay 0 (discovery, not a return).
    traffic(d, '2026-09-03', 'United States', 2, 1, 1, 0,
      { path: '/about', referrer_kind: 'external', referrer_host: 'google.com' });
    ran(d, '2026-09-03', 1, 1);
    // Day 4: exactly ONE deep-link landing -- the "reads at 1" case -- on a COARSE row.
    traffic(d, '2026-09-04', 'United States', 2, 1, 10, 0, { path: '/ui/shell' });
    ran(d, '2026-09-04', 1, 10, 'coarse:10');
    // Day 5: UNCAPTURED -- no rollup_runs row at all.
    return d;
  }
  var dld = seedDeepLinkByDay();
  var dbd = await S.deepLinkLandingsByDay(dld, '2026-09-01', '2026-09-05');
  ck('one row per calendar day, ascending, no gaps',
     dbd.length === 5 && dbd.map(function (x) { return x.day; }).join(',')
       === '2026-09-01,2026-09-02,2026-09-03,2026-09-04,2026-09-05',
     dbd.map(function (x) { return x.day.slice(8) + ':' + x.deepLink; }).join(' '));
  ck('day 1: 2 deep-link landings (the home landing on the same day is excluded)',
     dbd[0].deepLink === 2 && dbd[0].missing === false && dbd[0].coarse === false,
     JSON.stringify(dbd[0]));
  ck('day 2: a REAL ZERO -- every landing was the homepage -- 0 and NOT missing',
     dbd[1].deepLink === 0 && dbd[1].missing === false, JSON.stringify(dbd[1]));
  ck('day 3: an external non-home landing does not count -- 0, not 1',
     dbd[2].deepLink === 0 && dbd[2].missing === false, JSON.stringify(dbd[2]));
  ck('day 4: exactly 1 deep-link landing, and COARSE (sample_interval 10)',
     dbd[3].deepLink === 1 && dbd[3].coarse === true && dbd[3].missing === false,
     JSON.stringify(dbd[3]));
  ck('day 5: UNCAPTURED -- no run row at all -- 0 and MISSING, distinguishable from day 2’s '
   + 'real zero by the flag alone (both read deepLink 0)',
     dbd[4].deepLink === 0 && dbd[4].missing === true
     && dbd[4].deepLink === dbd[1].deepLink && dbd[4].missing !== dbd[1].missing,
     JSON.stringify(dbd[4]));
  var dbdSeen = dld.seen[dld.seen.length - 2];   // the traffic_daily query, not rollup_runs
  ck('bots are excluded and the range is bound -- GROUP BY day, path, referrer_kind',
     dbdSeen.sql.indexOf('GROUP BY day, path, referrer_kind') >= 0
     && dbdSeen.sql.indexOf('bot = 0') >= 0
     && dbdSeen.args.join(',') === '2026-09-01,2026-09-05',
     dbdSeen.sql.replace(/\s+/g, ' ').slice(0, 100));

  /* =============================================================== 5. the store's edges */
  head('5. where the recorded history begins — zero rows must not draw as zero traffic');
  var sr = await S.storeRange(db);
  ck('storeRange reports the first and last recorded day',
     sr && sr.first === '2026-09-01' && sr.last === '2026-09-21', JSON.stringify(sr));
  var empty = await S.storeRange(makeDb());
  ck('an empty store returns null, not {first:null} that renders as a date', empty === null, String(empty));

  /* =============================================================== 6. the comparison */
  head('6. periodDelta refuses rather than misleads');
  var prev = await S.dailyTotals(db, '2026-09-08', '2026-09-14');   // clean, 28 landing visits
  var cur = await S.dailyTotals(db, '2026-09-15', '2026-09-21');    // clean, 49 landing visits
  var up = S.periodDelta(49, prev, cur, { storeFirst: '2026-09-01' });
  ck('a clean comparison gives the percentage and the direction',
     up.ok === true && up.pct === 75 && up.direction === 'up' && up.prevTotal === 28,
     JSON.stringify(up));
  var down = S.periodDelta(14, prev, cur, { storeFirst: '2026-09-01' });
  ck('...and reads DOWN when it is down', down.ok === true && down.pct === -50 && down.direction === 'down',
     JSON.stringify({ pct: down.pct, dir: down.direction }));
  var flat = S.periodDelta(28, prev, cur, { storeFirst: '2026-09-01' });
  ck('...and FLAT at no change, not "up 0%"', flat.ok === true && flat.pct === 0 && flat.direction === 'flat',
     JSON.stringify({ pct: flat.pct, dir: flat.direction }));

  var old = await S.dailyTotals(db, '2026-08-25', '2026-08-31');
  var rOld = S.periodDelta(49, old, cur, { storeFirst: '2026-09-01' });
  ck('a prior window PREDATING the store refuses — it is the store starting, not growth',
     rOld.ok === false && /recorded history/.test(rOld.reason) && rOld.pct === undefined,
     JSON.stringify(rOld).slice(0, 110));

  var coarsePrev = await S.dailyTotals(db, '2026-09-01', '2026-09-05');
  var rCoarse = S.periodDelta(49, coarsePrev, cur, { storeFirst: '2026-09-01' });
  ck('a prior window containing a COARSE day refuses',
     rCoarse.ok === false && /nearest 10/.test(rCoarse.reason) && rCoarse.pct === undefined,
     JSON.stringify(rCoarse).slice(0, 110));

  var gapPrev = await S.dailyTotals(db, '2026-09-06', '2026-09-07');
  var rGap = S.periodDelta(49, gapPrev, cur, { storeFirst: '2026-09-01' });
  ck('a prior window containing an UNCAPTURED day refuses',
     rGap.ok === false && /uncaptured/.test(rGap.reason) && rGap.pct === undefined,
     JSON.stringify(rGap).slice(0, 110));

  var deadPrev = await S.dailyTotals(db, '2026-09-22', '2026-09-24');  // ran, genuinely zero
  ck('...and those dead days are clean, not missing — so the next check is about the ZERO',
     deadPrev.every(function (x) { return x.missing === false && x.coarse === false && x.visits === 0; }),
     JSON.stringify(deadPrev.map(function (x) { return x.missing; })));
  var rZero = S.periodDelta(49, deadPrev, cur, { storeFirst: '2026-09-01' });
  ck('a prior total of ZERO refuses — no Infinity, no NaN, no percent sign',
     rZero.ok === false && /no traffic in the prior period/.test(rZero.reason)
     && rZero.pct === undefined,
     JSON.stringify(rZero).slice(0, 110));
  ck('no refusal anywhere carries a printable number — not 0, not Infinity, nothing',
     [rOld, rCoarse, rGap, rZero].every(function (x) {
       return x.ok === false && x.pct === undefined && x.direction === undefined; }),
     JSON.stringify([rOld.pct, rCoarse.pct, rGap.pct, rZero.pct]) + ' (JSON prints undefined as null)');
  var curDirty = await S.dailyTotals(db, '2026-09-01', '2026-09-07');
  var rCur = S.periodDelta(49, prev, curDirty, { storeFirst: '2026-09-01' });
  ck('a SELECTED window with uncaptured days refuses too — both halves are judged',
     rCur.ok === false && /selected period/.test(rCur.reason), JSON.stringify(rCur).slice(0, 110));

  /* =============================================================== 7. grouping */
  head('7. groupBy — the one value that CANNOT be bound is the column name');
  var byC = await S.groupBy(db, 'country', '2026-09-01', '2026-09-05', 10);
  ck('grouped, bots excluded, descending by pageloads',
     byC.length === 2 && byC[0].key === 'United States' && byC[0].pageloads === 37
     && byC[1].key === 'France' && byC[1].pageloads === 23,
     JSON.stringify(byC.map(function (x) { return x.key + ':' + x.pageloads; })));
  ck('a key whose only appearance is on a rounded day is marked coarse',
     byC[1].coarse === true && byC[0].coarse === false,
     'France coarse=' + byC[1].coarse + ', US coarse=' + byC[0].coarse);
  var one = await S.groupBy(db, 'country', '2026-09-01', '2026-09-05', 1);
  ck('the limit is applied', one.length === 1 && one[0].key === 'United States', JSON.stringify(one));
  var okDims = [];
  // The loop is over the ALLOWLIST but names the nine columns explicitly, so a dimension
  // dropped from the allowlist is a red here rather than a shorter loop that still passes.
  var WANT_DIMS = ['country', 'referrer_host', 'referrer_kind', 'path', 'device', 'browser',
                   'os', 'nav_type', 'bot'];
  for (var di = 0; di < WANT_DIMS.length; di++) {
    var d = WANT_DIMS[di];
    try {
      var out = await S.groupBy(db, d, '2026-09-01', '2026-09-05', 5);
      if (Array.isArray(out)) okDims.push(d);
    } catch (e) { /* recorded as an absent dimension by the check below, not as a crash */ }
  }
  /* ALL NINE COLUMNS traffic_daily KEYS ON, not the seven anyone happened to need first: a
   * dimension missing here is a page section that cannot leave Cloudflare and goes on
   * printing figures rounded to the nearest 10 under an exact chart. The list is checked
   * against rollup.js's own TRAFFIC_KEY in section 10, so it cannot drift from the store. */
  ck('every allowed dimension works, and there are nine of them',
     okDims.length === 9 && okDims.indexOf('nav_type') >= 0 && okDims.indexOf('bot') >= 0,
     okDims.join(', '));
  // `.catch(->[])` on these two, so that a dimension REMOVED from the allowlist reddens
  // every check that depends on it — including section 10's — instead of aborting the run
  // at the first one and leaving the rest unproven.
  var byNav = await S.groupBy(db, 'nav_type', '2026-09-01', '2026-09-05', 5).catch(function () { return []; });
  ck('nav_type — "how the page was reached" — comes off the first-party store',
     byNav.length === 2 && byNav[0].key === 'navigate' && byNav[1].key === 'reload'
     && byNav[1].pageloads === 4,
     JSON.stringify(byNav.map(function (x) { return x.key + ':' + x.pageloads; })));

  /* THE bot DIMENSION AND ITS FILTER. Every other dimension is answered bots-excluded.
   * Grouping BY bot under `bot = 0` could only ever return one row — real-looking data with
   * nothing about it saying it is half the answer — so the filter is dropped exactly there.
   * This is the deliberate exemption; it is pinned here because "one row" is indisting-
   * uishable from "there were no bots" at the call site. */
  var byBot = await S.groupBy(db, 'bot', '2026-09-01', '2026-09-05', 5).catch(function () { return []; });
  ck('grouping BY bot returns BOTH rows — the bot = 0 filter is dropped for its own column',
     byBot.length === 2,
     JSON.stringify(byBot.map(function (x) { return x.key + ':' + x.pageloads; })));
  ck('...and the bot row is the one the other dimensions were hiding',
     byBot.length === 2 && byBot[0].key === 1 && byBot[0].pageloads === 500
     && byBot[1].key === 0 && byBot[1].pageloads === 60,
     JSON.stringify(byBot));
  ck('the bot key is the INTEGER 0/1 it is stored as, never the string "0"',
     byBot.length > 0 && byBot.every(function (x) { return typeof x.key === 'number'; })
     && byBot.every(function (x) { return x.key === 0 || x.key === 1; }),
     byBot.map(function (x) { return typeof x.key + ' ' + JSON.stringify(x.key); }).join(', '));
  ck('...while every other dimension keeps a STRING key',
     typeof byC[0].key === 'string' && byNav.length > 0 && typeof byNav[0].key === 'string', '');
  var botSql = db.seen[db.seen.length - 1].sql;   // the groupBy('bot') statement just issued
  ck('and no OTHER dimension lost its bot filter on the way',
     !/AND bot = 0/.test(botSql) && /GROUP BY bot/.test(botSql)
     && db.seen.filter(function (s) { return /GROUP BY (country|nav_type)\b/.test(s.sql); })
          .every(function (s) { return /AND bot = 0/.test(s.sql); }),
     botSql.replace(/\s+/g, ' ').slice(0, 78));

  /* ---------------------------------------------------------------- the referrer reader */
  var refs = await S.referrerBreakdown(db, '2026-09-01', '2026-09-05', 10);
  ck('referrerBreakdown carries the host AND the stored kind in one row',
     refs.length === 3 && refs[0].host === '' && refs[0].kind === 'direct'
     && refs[0].pageloads === 50,
     JSON.stringify(refs.map(function (x) { return (x.host || '(direct)') + '/' + x.kind + ':' + x.pageloads; })));
  var pv = refs.filter(function (x) { return x.host === 'preview.example.net'; })[0];
  ck('THE CASE RECOMPUTION GETS WRONG: an exact-match internal host reads as internal',
     !!pv && pv.kind === 'internal', pv ? JSON.stringify(pv) : 'the row is missing');
  /* The proof that the check above is about something. rollup.js's own classifier, given
   * the host and a null requestHost — which is all a single-column GROUP BY can offer —
   * calls this host EXTERNAL, i.e. discovery. The stored value is the one that is right. */
  var rollupMod = await loadEsm(ROOT, 'rollup.js');
  ck('...and recomputing it from the host alone would have said EXTERNAL',
     rollupMod.referrerKind('preview.example.net', null) === 'external'
     && rollupMod.referrerKind('preview.example.net', 'preview.example.net') === 'internal',
     'referrerKind(host, null) = ' + rollupMod.referrerKind('preview.example.net', null)
       + ', with the real requestHost = internal');
  ck('the reader is ordered, limited, bots-excluded and marks coarse rows',
     refs[0].pageloads >= refs[1].pageloads && refs[1].pageloads >= refs[2].pageloads
     && refs[0].coarse === true && refs[2].coarse === false
     && (await S.referrerBreakdown(db, '2026-09-01', '2026-09-05', 1)).length === 1
     && refs.every(function (x) { return x.pageloads < 500; }),
     JSON.stringify(refs.map(function (x) { return x.pageloads + (x.coarse ? '*' : ''); })));

  /* `pageloads`, `visits`, `sample_interval` and `day` are REAL COLUMNS of traffic_daily
   * and still not dimensions: the allowlist is the authority, not "does this name exist in
   * the table". Grouping by a measure is meaningless and grouping by day is dailyTotals'
   * job — both would return something that renders. */
  var EVIL = ['evil', 'pageloads', 'visits', 'sample_interval', 'day',
              'day; DROP TABLE traffic_daily', 'constructor', '__proto__',
              'toString', '1', '', null, 'country, path'];
  var leaked = [];
  for (var ei = 0; ei < EVIL.length; ei++) {
    var n0 = db.seen.length;
    var msg = await threwAsync((function (dim) {
      return function () { return S.groupBy(db, dim, '2026-09-01', '2026-09-05', 5); };
    })(EVIL[ei]));
    if (!msg || !/unknown dimension/.test(msg) || db.seen.length !== n0) {
      leaked.push(String(EVIL[ei]) + (msg ? ' [' + msg.slice(0, 40) + ']' : ' [no throw]'));
    }
  }
  ck('every dimension outside the allowlist throws BEFORE any statement is issued',
     leaked.length === 0, leaked.length ? 'LEAKED: ' + leaked.join(' | ') : EVIL.length + ' rejected');

  /* ---------------------------------------------------------- the day x country x referrer reader */
  head('7b. dayCountryReferrer — the three-way cut with no single-dimension groupBy equivalent');
  var cday = await S.dayCountryReferrer(db, '2026-09-01', '2026-09-05', 20);
  ck('seven day/country/referrer rows — one per DISTINCT combination in the window; the '
   + 'real-zero day (09-03) contributes none, and the bot day is excluded',
     cday.length === 7,
     JSON.stringify(cday.map(function (x) { return x.day + '/' + x.country + '/' + (x.host || '(direct)') + ':' + x.pageloads; })));
  var r0904 = cday.filter(function (x) { return x.day === '2026-09-04'; })[0];
  ck('the coarse day (09-04, France) is marked coarse in its OWN row',
     !!r0904 && r0904.coarse === true && r0904.country === 'France' && r0904.pageloads === 20,
     JSON.stringify(r0904));
  var r0901 = cday.filter(function (x) { return x.day === '2026-09-01'; })[0];
  ck('...and a clean day in the SAME result set is not tainted',
     !!r0901 && r0901.coarse === false, JSON.stringify(r0901));
  var pv2 = cday.filter(function (x) { return x.host === 'preview.example.net'; })[0];
  ck('THE CASE RECOMPUTATION GETS WRONG, again: the referrer kind is the STORED value '
   + '(internal), never recomputed from the host alone',
     !!pv2 && pv2.kind === 'internal' && pv2.country === 'United States' && pv2.pageloads === 6,
     JSON.stringify(pv2));
  var extRow = cday.filter(function (x) { return x.host === 'news.ycombinator.com'; })[0];
  ck('an external referrer keeps its stored kind too, in the same three-way row',
     !!extRow && extRow.kind === 'external' && extRow.pageloads === 4, JSON.stringify(extRow));
  ck('the real-zero day (09-03, ran but nobody came) contributes NO row at all — a GROUP BY '
   + 'over rows that do not exist cannot fabricate a zero one',
     cday.every(function (x) { return x.day !== '2026-09-03'; }));
  var cdayLim = await S.dayCountryReferrer(db, '2026-09-01', '2026-09-05', 1);
  ck('the limit is applied and the ordering is by pageloads descending',
     cdayLim.length === 1 && cdayLim[0].pageloads === 20, JSON.stringify(cdayLim));
  var n0b = db.seen.length;
  await S.dayCountryReferrer(db, '2026-09-01', '2026-09-05', 20);
  ck('every value is bound — the range and the limit — and no date literal reaches the SQL',
     db.seen[n0b].args.join(',') === '2026-09-01,2026-09-05,20'
     && !/\d{4}-\d{2}-\d{2}/.test(db.seen[n0b].sql),
     db.seen[n0b].sql.replace(/\s+/g, ' ').slice(0, 90) + ' args=' + JSON.stringify(db.seen[n0b].args));

  /* ---------------------------------------------------------- deep-link landings */
  head('7c. deepLinkLandings — not the homepage, AND no referrer at all (#795 follow-up)');
  /* A DEDICATED, ISOLATED FIXTURE (own db, same idiom `storeRange`'s empty-store check
   * already uses) rather than reusing the shared `db` above: every day in that fixture is
   * load-bearing for an exact sum somewhere else in this file (the country totals in
   * section 7, the trailing-mean windows in section 4, the real-zero/coarse/missing days
   * in section 3), and this reader's whole point is PATH x REFERRER-KIND diversity that
   * fixture has none of — `traffic()`'s helper hard-codes `path: '/'` and defaults
   * `referrer_kind: 'direct'` for every row it inserts. Modelled on the live numbers
   * measured for #795: 41 direct + 30 external at '/', 5 DIRECT at '/ui/shell' (the
   * bookmark case), 1 EXTERNAL each at '/about' and '/download' (search discovery of a
   * subpage — the case the narrowed definition exists to exclude). */
  function seedDeepLink() {
    var d = makeDb();
    traffic(d, '2026-09-10', 'United States', 50, 41, 1, 0);
    traffic(d, '2026-09-10', 'United States', 40, 30, 1, 0, { referrer_kind: 'external', referrer_host: 'google.com' });
    traffic(d, '2026-09-10', 'United States', 6, 5, 1, 0, { path: '/ui/shell' });
    traffic(d, '2026-09-10', 'United States', 1, 1, 1, 0, { path: '/about', referrer_kind: 'external', referrer_host: 'google.com' });
    traffic(d, '2026-09-10', 'United States', 1, 1, 1, 0, { path: '/download', referrer_kind: 'external', referrer_host: 'google.com' });
    // A COARSE deep-link row on a separate day, so the coarse flag can be proven per-path
    // rather than accidentally true because everything in the fixture happens to be exact.
    traffic(d, '2026-09-11', 'United States', 20, 10, 10, 0, { path: '/ui/shell' });
    ran(d, '2026-09-10', 5, 1); ran(d, '2026-09-11', 1, 10, 'coarse:10');
    return d;
  }
  var dl = seedDeepLink();
  var dlAll = await S.deepLinkLandings(dl, '2026-09-10', '2026-09-10', 1000);
  ck('total is every landing visit in the window, summed across ALL paths and kinds (41+30+5+1+1 = 78)',
     dlAll.total === 78, JSON.stringify({ total: dlAll.total, deepLink: dlAll.deepLink }));
  /* THE MEASURED #795 NUMBER: 5, not 7. '/about' and '/download' are non-home but EXTERNAL
   * (someone found them via a search engine, i.e. discovery) and must NOT contribute —
   * only '/ui/shell', which is both non-home AND direct, does. This is the exact narrowing
   * the follow-up made: "not the homepage" alone over-counted by including those two. */
  ck('deep-link is ONLY the non-home path that is ALSO direct (5, not 5+1+1=7)',
     dlAll.deepLink === 5, 'deepLink=' + dlAll.deepLink);
  ck('an EXTERNAL non-home landing is NOT counted — the exact defect this narrowing fixes '
   + '(/about and /download are non-home but excluded, worth 2 landing visits if wrongly counted)',
     dlAll.byPath.filter(function (r) { return r.path !== '/' && r.referrerKind === 'external'; })
       .reduce(function (s, r) { return s + r.visits; }, 0) === 2
     && dlAll.deepLink === 5,
     'external non-home visits present but excluded: deepLink stayed ' + dlAll.deepLink);
  ck('the homepage itself is never counted as a deep-link landing, in EITHER referrer kind',
     dlAll.byPath.filter(function (r) { return r.path === '/'; }).length === 2
     && dlAll.deepLink < dlAll.total,
     JSON.stringify(dlAll.byPath.map(function (r) { return r.path + '/' + r.referrerKind + ':' + r.visits; })));
  ck('the breakdown carries one row per distinct (path, referrer kind) PAIR — five, since '
   + '"/" now splits into its direct and external rows',
     dlAll.byPath.length === 5
     && dlAll.byPath[0].path === '/' && dlAll.byPath[0].referrerKind === 'direct'
     && dlAll.byPath[0].visits === 41 && dlAll.byPath[0].pageloads === 50,
     JSON.stringify(dlAll.byPath));
  ck('not coarse when every contributing row is exact',
     dlAll.coarse === false, 'coarse=' + dlAll.coarse);

  var dlCoarse = await S.deepLinkLandings(dl, '2026-09-10', '2026-09-11', 1000);
  ck('a coarse row anywhere in the window marks the whole answer coarse — the same per-row '
   + 'rule groupBy already applies, just surfaced one level up',
     dlCoarse.coarse === true
     && dlCoarse.byPath.filter(function (r) { return r.path === '/ui/shell' && r.referrerKind === 'direct'; })[0].visits === 15,
     JSON.stringify(dlCoarse.byPath.filter(function (r) { return r.path === '/ui/shell'; })));
  ck('deepLinkLandings groups on path AND referrer_kind — a dedicated two-column reader, '
   + 'not a re-use of groupBy (which is single-dimension only) — and the range/limit are bound',
     dl.seen[dl.seen.length - 1].sql.indexOf('GROUP BY path, referrer_kind') >= 0
     && dl.seen[dl.seen.length - 1].args.join(',') === '2026-09-10,2026-09-11,1000',
     dl.seen[dl.seen.length - 1].sql.replace(/\s+/g, ' ').slice(0, 90));

  // A window where EVERY landing is the homepage: deepLink is 0, total > 0 — not blank,
  // not equal to total, and not a constant regardless of which paths are in the window.
  var homeOnlyDb = makeDb();
  traffic(homeOnlyDb, '2026-09-12', 'United States', 10, 6, 1, 0);
  ran(homeOnlyDb, '2026-09-12', 1, 1);
  var dlHome = await S.deepLinkLandings(homeOnlyDb, '2026-09-12', '2026-09-12', 1000);
  ck('a window where every landing is the homepage has deepLink 0, total > 0 — not blank, '
   + 'not equal to total',
     dlHome.total === 6 && dlHome.deepLink === 0, JSON.stringify(dlHome));

  // ISOLATING THE REFERRER CONDITION ALONE: a non-home landing that is EXTERNAL and
  // nothing else in the window — proves the exclusion is not an artefact of the homepage
  // rows outweighing it, the way dlAll's mix could be read.
  var extOnlyDb = makeDb();
  traffic(extOnlyDb, '2026-09-13', 'United States', 10, 8, 1, 0,
    { path: '/about', referrer_kind: 'external', referrer_host: 'bing.com' });
  ran(extOnlyDb, '2026-09-13', 1, 1);
  var dlExtOnly = await S.deepLinkLandings(extOnlyDb, '2026-09-13', '2026-09-13', 1000);
  ck('a window whose ONLY landing is a non-home, EXTERNAL page has deepLink 0 — discovery, '
   + 'not a return',
     dlExtOnly.total === 8 && dlExtOnly.deepLink === 0, JSON.stringify(dlExtOnly));

  var dlEmpty = await S.deepLinkLandings(makeDb(), '2026-09-01', '2026-09-01', 1000);
  ck('the zero-denominator case: an empty window is 0/0 and an empty breakdown, never a throw',
     dlEmpty.total === 0 && dlEmpty.deepLink === 0 && dlEmpty.coarse === false
     && Array.isArray(dlEmpty.byPath) && dlEmpty.byPath.length === 0,
     JSON.stringify(dlEmpty));

  /* =============================================================== 8. binding */
  head('8. every value is BOUND — D1 has no excuse for interpolation');
  var dated = db.seen.filter(function (s) { return /\d{4}-\d{2}-\d{2}/.test(s.sql); });
  ck('no statement issued in this whole run carries a date literal in its SQL',
     dated.length === 0,
     dated.length ? dated[0].sql.replace(/\s+/g, ' ').slice(0, 90) : db.seen.length + ' statements');
  var mismatched = db.seen.filter(function (s) {
    return (s.sql.match(/\?/g) || []).length !== (s.args || []).length; });
  ck('every placeholder has exactly one bound argument',
     mismatched.length === 0,
     mismatched.length ? mismatched[0].sql.replace(/\s+/g, ' ').slice(0, 80) + ' args=' + JSON.stringify(mismatched[0].args)
       : 'across ' + db.seen.length + ' statements');
  var n1 = db.seen.length;
  await S.dailyTotals(db, '2026-09-08', '2026-09-14');
  var issued = db.seen.slice(n1);
  ck('dailyTotals binds the range to both tables it reads',
     issued.length === 2
     && issued.every(function (s) { return s.args.join(',') === '2026-09-08,2026-09-14'; })
     && /traffic_daily/.test(issued[0].sql) && /rollup_runs/.test(issued[1].sql),
     issued.map(function (s) { return JSON.stringify(s.args); }).join(' '));
  var n2 = db.seen.length;
  await S.groupBy(db, 'path', '2026-09-08', '2026-09-14', 5);
  ck('groupBy binds the range AND the limit',
     db.seen[n2].args.join(',') === '2026-09-08,2026-09-14,5', JSON.stringify(db.seen[n2].args));
  ck('a junk limit is clamped to a whole number rather than bound as junk',
     (await (async function () {
       var k = db.seen.length;
       await S.groupBy(db, 'path', '2026-09-08', '2026-09-14', '5; DROP TABLE traffic_daily');
       return db.seen[k].args[2];
     })()) === 20, 'unparseable limit -> the default');

  /* =============================================================== 9. the non-additive column */
  head('9. usage_daily.sessions cannot be summed, so it is not offered');
  ck('NON_ADDITIVE names the table, the column, the additive alternative and the reason',
     S.NON_ADDITIVE.table === 'usage_daily' && S.NON_ADDITIVE.column === 'sessions'
     && S.NON_ADDITIVE.additive === 'n' && /count\(DISTINCT blob4\)/.test(S.NON_ADDITIVE.reason)
     && /five rows/.test(S.NON_ADDITIVE.reason),
     S.NON_ADDITIVE.reason.slice(0, 60) + '…');
  var n3 = db.seen.length;
  var use = await S.usageTotals(db, '2026-09-10', '2026-09-11', 20);
  ck('usageTotals returns n — which IS additive, being sum(_sample_interval)',
     use.length === 2 && use[0].n === 15 && use[0].key === 'scram' && use[1].n === 6,
     JSON.stringify(use));
  var withSessions = use.filter(function (x) { return Object.prototype.hasOwnProperty.call(x, 'sessions'); });
  ck('NO returned row carries a sessions key — the over-count cannot be rendered by accident',
     withSessions.length === 0,
     withSessions.length ? JSON.stringify(withSessions[0]) : use.length + ' rows checked');
  var usageSql = db.seen.slice(n3).map(function (s) { return s.sql; }).join(' ');
  ck('...and the column is never even SELECTed, so there is nothing to drop later',
     !/sessions/i.test(usageSql), usageSql.replace(/\s+/g, ' ').slice(0, 90));
  var sErr = threw(function () { return S.sessionsInPeriod(db, '2026-09-10', '2026-09-11'); });
  ck('the function a caller would reach for THROWS with the reason attached',
     !!sErr && /count\(DISTINCT blob4\)/.test(sErr), String(sErr).slice(0, 70));
  var allSql = db.seen.map(function (s) { return s.sql; }).join(' ');
  ck('no statement in the entire run sums the non-additive column',
     !/SUM\(sessions\)/i.test(allSql), '');

  /* =============================================================== 10. real SQLite */
  head('10. every statement is put to a REAL SQLite engine, on the REAL schema');
  /* WHY THIS SECTION EXISTS. Everything above runs against an interpreter written in this
   * file, which agrees with itself by construction: a statement that is valid to me and
   * invalid to SQLite passes all 63 checks and fails in production, where the first reader
   * of the store would meet it as a 500 on the dashboard. `node:sqlite` is built into
   * Node 24, so the fix is an adapter and a copy of the real schema, not a mock.
   *
   * THE SCHEMA IS READ FROM rollup.js AT RUNTIME, never retyped. A retyped copy is a second
   * authority that stops agreeing the day someone adds a column to the writer, and this
   * gate would go on asserting against the shape the store used to have. */
  var sqliteErr = null, DatabaseSync = null;
  try { DatabaseSync = require('node:sqlite').DatabaseSync; }
  catch (e) { sqliteErr = String(e && e.message || e); }
  /* NOT SKIPPED IF ABSENT. A section that quietly passes when it cannot run is the hollow
   * shape this whole runner is written against — if the engine is missing, that is a red. */
  ck('node:sqlite is available (Node 24+), so the SQL can be put to a real engine',
     !!DatabaseSync, sqliteErr || 'node ' + process.version);

  if (DatabaseSync) {
    var roll = await loadEsm(ROOT, 'rollup.js');
    ck('the real schema comes from rollup.js SCHEMA, not a copy in this file',
       Array.isArray(roll.SCHEMA) && roll.SCHEMA.length >= 3
       && /CREATE TABLE IF NOT EXISTS traffic_daily/.test(roll.SCHEMA.join(' '))
       && /CREATE TABLE IF NOT EXISTS rollup_runs/.test(roll.SCHEMA.join(' ')),
       roll.SCHEMA.length + ' statements, read from worker/src/rollup.js at runtime');

    /* THE ALLOWLIST AGAINST THE STORE ITSELF. `DIMENSIONS` is a hand-kept list and the
     * store's own key is `traffic_daily`'s PRIMARY KEY, read here out of the same SCHEMA
     * text. A column added to the writer and forgotten here is a page section that cannot
     * be migrated — which is exactly how nav_type and bot came to be missing. */
    var pk = (/CREATE TABLE IF NOT EXISTS traffic_daily[\s\S]*?PRIMARY KEY \(([^)]*)\)/
      .exec(roll.SCHEMA.join('\n')) || [])[1] || '';
    var pkDims = pk.split(',').map(function (x) { return x.trim(); })
      .filter(function (x) { return x && x !== 'day'; });
    ck('the dimension allowlist is exactly the columns traffic_daily keys on, minus the day',
       pkDims.length === 9 && pkDims.join(',') === S.DIMENSIONS.join(','),
       'store: ' + pkDims.join(',') + '  |  allowlist: ' + S.DIMENSIONS.join(','));

    var sq = new DatabaseSync(':memory:');
    roll.SCHEMA.forEach(function (s) { sq.exec(s); });

    // The same seeded rows, inserted through the real engine, so the comparison below is
    // between two readings of one dataset rather than between two datasets.
    db._tables().forEach(function (t) {
      db._rows(t).forEach(function (row) {
        var cols = Object.keys(row);
        var ist = sq.prepare('INSERT OR REPLACE INTO ' + t + ' (' + cols.join(', ') + ') VALUES ('
          + cols.map(function () { return '?'; }).join(', ') + ')');
        ist.run.apply(ist, cols.map(function (c) { return row[c]; }));
      });
    });

    /* EVERY DISTINCT STATEMENT THE MODULE EMITTED in this run — which includes groupBy for
     * all seven dimensions, because each one interpolates a different column name and a
     * reserved word would only break the dimension that uses it. */
    var stmts = [];
    db.seen.forEach(function (s) { if (stmts.indexOf(s.sql) < 0) stmts.push(s.sql); });
    var dims = S.DIMENSIONS.filter(function (d) {
      return stmts.some(function (s) { return new RegExp('SELECT ' + d + ' AS ').test(s); });
    });
    /* AN EXACT COUNT, not a floor. Every statement captured is prepared below, so the only
     * way one can escape this section is by never being emitted — a reader added and never
     * exercised by any check above. A `>=` would go green on exactly that. Raise it when a
     * reader is added, in the same change that adds a check calling it:
     *   1 storeRange + 2 dailyTotals + 8 groupBy(text) + 1 groupBy(bot, unfiltered)
     *   + 1 referrerBreakdown + 1 usageTotals + 1 dayCountryReferrer = 15 */
    ck('the captured statement set covers all nine dimensions and every other reader',
       dims.length === 9 && stmts.length === 15
       && stmts.some(function (s) { return /rollup_runs/.test(s); })
       && stmts.some(function (s) { return /usage_daily/.test(s); })
       && stmts.some(function (s) { return /MIN\(day\)/.test(s); })
       && stmts.some(function (s) { return /referrer_kind AS kind/.test(s); })
       && stmts.some(function (s) { return /GROUP BY day, country, referrer_host, referrer_kind/.test(s); }),
       stmts.length + ' distinct statements (expected 15), dims: ' + dims.join(','));

    var rejected = [];
    stmts.forEach(function (s) {
      try { sq.prepare(s); } catch (e) { rejected.push(s.replace(/\s+/g, ' ').slice(0, 70) + ' -> ' + String(e.message).slice(0, 60)); }
    });
    ck('SQLite PREPARES every one of them — no syntax error, no reserved word, no unknown column',
       rejected.length === 0,
       rejected.length ? 'REJECTED ' + rejected.length + ': ' + rejected[0] : stmts.length + ' statements prepared clean');

    /* AND THE ANSWERS AGREE. Preparing proves the SQL parses; it does not prove my
     * interpreter's GROUP BY, MAX(sample_interval) and `bot = 0` mean what SQLite's do.
     * So the module is run again, unmodified, against the real engine and the results are
     * compared row for row. */
    var rdb = realDb(sq);
    var sameness = [];
    async function agrees(label, fn) {
      var a = await fn(db), b = await fn(rdb);
      var same = JSON.stringify(a) === JSON.stringify(b);
      sameness.push({ label: label, same: same, mine: a, sqlite: b, n: Array.isArray(a) ? a.length : 1 });
      return same;
    }
    var okDaily = await agrees('dailyTotals 09-01..09-07', function (x) {
      return S.dailyTotals(x, '2026-09-01', '2026-09-07'); });
    var okGroup = await agrees('groupBy country 09-01..09-05', function (x) {
      return S.groupBy(x, 'country', '2026-09-01', '2026-09-05', 10); });
    var okStore = await agrees('storeRange', function (x) { return S.storeRange(x); });
    var okUsage = await agrees('usageTotals 09-10..09-11', function (x) {
      return S.usageTotals(x, '2026-09-10', '2026-09-11', 20); });
    // The two newest readers: an INTEGER grouping key, and a two-column GROUP BY. Both are
    // shapes the interpreter had never been asked for before.
    var okBot = await agrees('groupBy bot 09-01..09-05', function (x) {
      return S.groupBy(x, 'bot', '2026-09-01', '2026-09-05', 5); });
    var okRefs = await agrees('referrerBreakdown 09-01..09-05', function (x) {
      return S.referrerBreakdown(x, '2026-09-01', '2026-09-05', 10); });
    // The newest reader: a FOUR-column GROUP BY, a shape the interpreter had never been
    // asked for before either.
    var okCday = await agrees('dayCountryReferrer 09-01..09-05', function (x) {
      return S.dayCountryReferrer(x, '2026-09-01', '2026-09-05', 20); });
    var disagreed = sameness.filter(function (s) { return !s.same; });
    ck('the real engine returns the SAME rows as the interpreter — GROUP BY, MAX(sample_interval), bot = 0',
       okDaily && okGroup && okStore && okUsage && okBot && okRefs && okCday,
       disagreed.length ? disagreed[0].label + ': mine ' + JSON.stringify(disagreed[0].mine).slice(0, 120)
         + ' vs sqlite ' + JSON.stringify(disagreed[0].sqlite).slice(0, 120)
         : sameness.map(function (s) { return s.label.split(' ')[0]; }).join(', '));
    /* A comparison of two empty results is a comparison of nothing — the check above would
     * pass on a database that was never seeded. */
    ck('...and that comparison was not two empty results',
       sameness.every(function (s) { return s.n > 0; })
       && sameness[0].sqlite.length === 7 && sameness[1].sqlite.length === 2
       && sameness[4].sqlite.length === 2 && sameness[5].sqlite.length === 3
       && sameness[6].sqlite.length === 7
       && typeof sameness[4].sqlite[0].key === 'number',
       sameness.map(function (s) { return s.label.split(' ')[0] + ':' + s.n; }).join(' '));
  }

  /* =============================================================== tally */
  tally();
})().catch(function (e) {
  /* A THROW IS A RED, NOT A CRASH REPORT. An injected defect can make a helper throw
   * (day arithmetic that never advances hits the span guard, for instance), and a runner
   * that only prints a stack trace in that case reports "0 failed" while being broken. */
  ck('the run completed without an unhandled exception', false,
     String(e && e.message || e).slice(0, 120));
  console.log(RED + (e && e.stack ? String(e.stack).split('\n').slice(0, 3).join('\n') : '') + RST);
  tally();
});

function tally() {
  console.log('\n' + BOLD + (nFail === 0 ? GREEN + 'PASS' : RED + 'FAIL') + RST +
    '  ' + nPass + ' passed, ' + nFail + ' failed, ' + (nPass + nFail) + ' checks');
  if (INJECT) {
    var caught = nFail > 0;
    console.log((caught ? GREEN + 'INJECTION CAUGHT' : RED + 'INJECTION MISSED') + RST +
      ' — "' + INJECT + '" reddened ' + nFail + ' check(s).' +
      (caught ? '' : ' THE GATE IS HOLLOW HERE.'));
    process.exit(caught ? 0 : 1);
  }
  process.exit(nFail === 0 ? 0 : 1);
}
