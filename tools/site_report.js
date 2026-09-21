#!/usr/bin/env node
/* site_report.js — every number the live site knows about itself, in one command.
 *
 *   node tools/site_report.js                  last 7 days, all three sections
 *   node tools/site_report.js --days=30
 *   node tools/site_report.js --only=traffic   traffic | usage | health  (comma-separated)
 *   node tools/site_report.js --sessions       per-session detail as well (see the volume note)
 *   node tools/site_report.js --json           machine-readable, same numbers
 *   node tools/site_report.js --sql="SELECT …" one ad-hoc Analytics Engine query
 *   node tools/site_report.js --gql="{ viewer … }"  one ad-hoc GraphQL query
 *
 * NEEDS `CLOUDFLARE_API_TOKEN` — an *Account Analytics → Read* token, User scope. Without it
 * this exits 2 and says so; it never half-reports. That ONE token reaches all three sources
 * below (measured 2026-08-10) — Web Analytics and Worker invocations do not need a second one.
 *
 * Supersedes `usage_report.js`, which read only the third source and counted it wrong (see
 * SAMPLING below).
 *
 * ------------------------------------------------------------------------- the three sources
 *   TRAFFIC  Web Analytics RUM, GraphQL      who visited, what they opened, where from
 *   HEALTH   workersInvocationsAdaptive, GraphQL   did telemetry arrive, is it erroring
 *   USAGE    Analytics Engine SQL, dataset `reactor_dynamics_usage`   what they did in the sim
 *
 * Bug-report BUNDLES are deliberately not here: reading one needs a ~20 s `wrangler dev
 * --remote` spin-up, which does not belong in a command you run to get a number. That is
 * `tools/fetch_bug_reports.js` — which as of 2026-08-10 exists on `workbench`/`backshop` and
 * NOT on `develop`; it arrives with the ordinary lane merge.
 *
 * ---------------------------------------------------------------- SAMPLING — read this first
 * Analytics Engine SAMPLES, and it is already sampling at this site's tiny volume. Measured
 * 2026-08-10 over the whole dataset: `sum(_sample_interval)` = 149 against `count()` = 120,
 * and for `blob1 = 'command'` specifically, 64 against 42. So:
 *
 *   - THE HEADLINE NUMBER IS `sum(_sample_interval)`, NOT `count()`. Every aggregate below
 *     reports `est`; `raw` is printed beside it so the sampling is visible rather than folded
 *     in. `usage_report.js` reported `raw` and called it the count.
 *   - `count(DISTINCT blob4)` CANNOT BE CORRECTED THIS WAY. Sampling drops whole rows, so a
 *     session all of whose rows were dropped is invisible — the session count is a FLOOR and
 *     is labelled as one. There is no weighting that recovers it.
 *
 * THE RUM SIDE IS THE OPPOSITE, AND GETTING IT BACKWARDS COSTS A 15× ERROR. Its `count` and
 * `sum { visits }` are ALREADY sample-adjusted — do NOT multiply them by `sampleInterval`.
 * What `sampleInterval` tells you there is the GRANULARITY the answer was rounded to.
 * Measured 2026-08-10, same two days of data, only the window span changed:
 *
 *     span <= 7 days   08-09: count 7,  visits 7    sampleInterval 1    <- exact
 *                      08-10: count 13, visits 12   sampleInterval 1
 *     span >= 14 days  08-09: count 20, visits 20   sampleInterval 10   <- quantized to 10s
 *                      08-10: count 10, visits 10   sampleInterval 10
 *
 * The first draft of this file multiplied count × sampleInterval and reported 300 pageloads
 * against a true 20. So: report what comes back, print the granularity beside it, and use
 * `--days=7` or less when you need an exact figure.
 *
 * "SOMEWHERE BETWEEN 7 AND 14 DAYS" was the original reading of that table and it is too
 * loose to build on. The switch is a FIXED RETENTION EDGE at 00:00 UTC of (today - 7), and
 * it is a cliff — measured 2026-08-17, one second either side:
 *
 *     datetime_geq 2026-08-09T23:59:59Z  ->  sampleInterval 10,  50 pageloads
 *     datetime_geq 2026-08-10T00:00:00Z  ->  sampleInterval  1,  67 pageloads
 *
 * The distinction is not academic: a "7-day window" can land on EITHER side of that edge
 * depending on the hour it is asked at. `FROM` below is a UTC midnight and therefore sits
 * exactly ON the edge at every hour of the day, which is the only reason --days=7 has always
 * been exact here. The dashboard aligned the same window to an EASTERN midnight and spent
 * three days rounding every figure between 8pm and midnight (#485). Do not "tidy" `FROM`
 * into a local-midnight or a rolling `now - 7d` without re-reading that issue.
 *
 * ---------------------------------------------------------------------------- query traps
 *   - `uniq()`, `round()` and `quantile()` are all 422. `quantileWeighted(q)(col, _sample_interval)`
 *     IS supported and is the right one anyway — it weights by the sample interval.
 *   - `ORDER BY` a RAW double column is a 422 ("unable to find type of column: double1") even
 *     though SELECTing it is fine. Order by the ALIAS.
 *   - The SQL body is RAW text/plain. Not JSON, not form-encoded.
 *   - GraphQL answers HTTP 200 with `{data: null, errors: [...]}` on a bad query. Check
 *     `errors`, never the status.
 *   - The Cloudflare MCP cannot read the SQL endpoint at all: it demands a `{success, result}`
 *     envelope and gets `{meta, data, rows}`, surfacing as `Cloudflare API error: 200`. That is
 *     the wrapper, not the query — do not retry it through the MCP in another shape.
 *   - `timestamp` is the WRITE time (the client batches every 15 s), not when the thing
 *     happened. For "when did they do X in the plant" use double2 (sim_seconds).
 *
 * ------------------------------------------------------------ the column map (positional)
 * The AE dataset has NO SCHEMA; position IS the schema, and `worker/src/index.js` owns it.
 * blob1 event · blob2 channel · blob3 release · blob4 session · blob5 key · blob6 plant
 * double1 seconds · double2 sim_seconds · double3 mode (plant_mode only) · double4 beat.
 * blob5 is EMPTY for plant_mode by design (the mode is a number and lives in double3).
 *
 * -------------------------------------------------------------------------- volume note
 * Everything printed by default is an AGGREGATE with a LIMIT, so the output size does not
 * grow with traffic. `--sessions` is the exception — it lists rows, and is capped at 200.
 * At promotion volume, read the aggregates and use `--sql=` for anything per-session.
 *
 * ---------------------------------------------------------- CLOSED DAYS READ THE STORE
 * Measured 2026-09-21: at `--days=30` every RUM row above came back rounded — 2026-09-04
 * read 20 pageloads (true 13), 2026-09-19 read 20 (true 45) — because Cloudflare's own
 * exact tier only holds 7 days and this tool asked it live for the whole window. The
 * dashboard is exact for the same days because it reads `traffic_daily`, the first-party
 * D1 store `worker/src/rollup.js` mirrors nightly while a day is still inside that 7-day
 * window. So: for every day in the window BEFORE today (Eastern — see below), the by-day
 * table now reads that store instead, and prints a SEPARATE table, not a merged column.
 *
 *   - `CLOUDFLARE_API_TOKEN` CANNOT REACH D1 — it is an Account Analytics/Read token and
 *     the REST call 7403s. The only path in is `wrangler d1 execute --remote`, run from
 *     `worker/`, with `env -u CLOUDFLARE_API_TOKEN` — that variable SHADOWS wrangler's own
 *     OAuth login, which is the credential that can actually reach D1 (same trap as
 *     `fetch_bug_reports.js`; documented in `worker/README.md` and `RD_Ops/runbook.md`).
 *   - `traffic_daily.day` IS AN EASTERN CALENDAR DAY; every other window in this file is
 *     UTC on purpose (see the retention-cliff note above, #485). Those two conventions
 *     cannot be merged into one column without relabelling one of them — that IS the
 *     defect this file exists to avoid, so the store's days get their own table
 *     ("By day (Eastern)"), never slotted into the UTC one's rows. `today`'s Eastern-day
 *     row in that table is still live (the store has no row for it until the nightly
 *     cron at 05:10 UTC), fetched the same way the UTC table gets today.
 *   - A day inside the window with NO `rollup_runs` row (before the store began, or the
 *     cron never ran) prints `no-data`, never a silent `0` — a real zero day and a day
 *     nobody captured are indistinguishable in `traffic_daily` alone.
 *   - EVERY row everywhere now carries a `source` in place of the old `exact` column:
 *     `store` (first-party, exact) · `cf` (Cloudflare, exact — sampleInterval 1) ·
 *     `cf~N` (Cloudflare, rounded to the nearest N). Three sources, three tags, on
 *     purpose — "the same number from a different source" is the confusion this exists
 *     to end, so the tag has to say which source, not just whether it rounded.
 *   - IF WRANGLER IS MISSING, NOT LOGGED IN, SLOW, OR D1 IS UNREACHABLE: the Eastern table
 *     is skipped with ONE line saying why, the rest of the report still prints in full, and
 *     nothing rounded is ever relabelled as exact. `D1_TIMEOUT_MS` below bounds the wait.
 */
'use strict';

const { execFile, exec } = require('node:child_process');
const path = require('node:path');

const ACCOUNT = 'f6ee6be4ecfceb66a8a6b7b6ed26d286';
const SITE_TAG = '283f126f6ff94319a638db77f6d0602b';
const DATASET = 'reactor_dynamics_usage';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;

// ---------------------------------------------------------- first-party store (D1)
const D1_DB = 'reactor-dynamics-stats';
const D1_TIMEOUT_MS = 20000;
const WORKER_DIR = path.join(__dirname, '..', 'worker');
const EASTERN_TZ = 'America/New_York';

const args = process.argv.slice(2);
const has = (f) => args.some((a) => a === f || a.startsWith(f + '='));
const val = (f, d) => { const a = args.find((x) => x.startsWith(f + '=')); return a ? a.slice(f.length + 1) : d; };
const DAYS = Math.max(1, Number(val('--days', '7')) || 7);
const JSON_OUT = has('--json');
const ONLY = val('--only', '').split(',').map((s) => s.trim()).filter(Boolean);
const wants = (s) => !ONLY.length || ONLY.includes(s);

const C = process.stdout.isTTY && !JSON_OUT
  ? { b: '\x1b[1m', d: '\x1b[2m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', x: '\x1b[0m' }
  : { b: '', d: '', g: '', y: '', r: '', x: '' };

// require()-able (test/run_site_report.js imports the pure helpers below) without this
// exiting the process — the exit-on-missing-token belongs to the CLI, not the module, so
// it moves into the require.main guard at the bottom together with the async main().
function requireToken() {
  if (TOKEN) return;
  console.error(`${C.r}No CLOUDFLARE_API_TOKEN.${C.x}
Create one at https://dash.cloudflare.com/profile/api-tokens — Custom token,
permission "Account" / "Account Analytics" / "Read", nothing else. Then, in YOUR OWN
terminal (not inside an agent session, or it lands in the transcript):

  [Environment]::SetEnvironmentVariable("CLOUDFLARE_API_TOKEN", (Read-Host "Paste token"), "User")

It is an ACCOUNT-owned token, so it verifies at /accounts/{id}/tokens/verify — NOT
/user/tokens/verify, which rejects it and sends you hunting for a problem that is not there.`);
  process.exit(2);
}

// ---------------------------------------------------------------------------- transports

async function sql(q) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/analytics_engine/sql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'text/plain' },
    body: q,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300).trim()}`);
  let j;
  try { j = JSON.parse(text); } catch (e) { throw new Error(`unparseable response: ${text.slice(0, 200)}`); }
  return j.data || [];
}

async function gql(query) {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const j = await res.json().catch(() => null);
  if (!j) throw new Error(`HTTP ${res.status}: unparseable response`);
  // A bad GraphQL query is a 200 with errors — the status never tells you.
  if (j.errors && j.errors.length) throw new Error(j.errors.map((e) => e.message).join('; ').slice(0, 300));
  const accts = ((j.data || {}).viewer || {}).accounts || [];
  return accts[0] || {};
}

/* THE D1 TRANSPORT — shells out to `wrangler d1 execute`, because the Analytics-read
 * token above cannot reach D1 (verified 2026-09-21: the REST call answers
 * `7403 — account is not valid or is not authorized to access this service`). `runner` is
 * injectable so the pure parsing/classification logic below can be exercised offline
 * (test/run_site_report.js) without spawning a process or touching the network.
 *
 * `env -u CLOUDFLARE_API_TOKEN` is NOT OPTIONAL — wrangler prefers that variable over its
 * own OAuth login, and the Analytics-read token it holds cannot write or read D1, so
 * leaving it set makes every call here fail (same trap as `fetch_bug_reports.js`;
 * `worker/README.md`, `RD_Ops/runbook.md`). Run from `worker/`, not the repo root — from
 * the root wrangler resolves the Pages project instead. */
function runWrangler(q) {
  return new Promise((resolve, reject) => {
    const env = Object.assign({}, process.env);
    delete env.CLOUDFLARE_API_TOKEN;
    const opts = { cwd: WORKER_DIR, env, timeout: D1_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, windowsHide: true };
    const cb = (err, stdout, stderr) => {
      if (err) {
        if (err.killed || err.signal) {
          reject(new Error(`wrangler timed out after ${(D1_TIMEOUT_MS / 1000).toFixed(0)}s`));
        } else {
          reject(new Error(String(stderr || err.message || err).slice(0, 300).trim()));
        }
        return;
      }
      resolve(stdout);
    };
    /* WINDOWS TAKES A DIFFERENT PATH, MEASURED 2026-09-21. `npx` on Windows is `npx.cmd`,
     * which `execFile` cannot spawn without `shell: true` (EINVAL) — but `shell: true`
     * with an ARGS ARRAY only CONCATENATES them, unescaped (Node's own deprecation
     * warning), so `--command 'SELECT 1'` reaches cmd.exe as two bare tokens and wrangler
     * reads `SELECT` then rejects `1` as an unknown argument. The fix verified against the
     * live database is `exec()` with a single command STRING, quoted here rather than by
     * Node. The SQL is always ours (never user input) and never carries a double quote —
     * guarded below, not assumed, since a stray one would otherwise close the quote early
     * and hand cmd.exe the rest of the SQL as bare tokens. */
    if (process.platform === 'win32') {
      if (q.includes('"')) { reject(new Error('D1 query contains a double quote — cannot be safely shelled on Windows')); return; }
      exec(`npx wrangler d1 execute ${D1_DB} --remote --json --command "${q}"`, opts, cb);
    } else {
      execFile('npx', ['wrangler', 'd1', 'execute', D1_DB, '--remote', '--json', '--command', q], opts, cb);
    }
  });
}

// PURE: wrangler's `--json` stdout -> rows, or a thrown Error with the reason. Exported
// so the test runner can feed it both the real shape (seen live 2026-09-21:
// `[{results:[...], success:true, meta:{...}}]`) and the failure shape wrangler itself
// prints on a bad query (`{error:{text:"..."}}`, no array wrapper, no `results`).
function parseD1Output(stdout) {
  let parsed;
  try { parsed = JSON.parse(stdout); }
  catch (e) { throw new Error(`wrangler returned unparseable output: ${String(stdout).slice(0, 200).trim()}`); }
  const first = Array.isArray(parsed) ? parsed[0] : null;
  if (!first || first.success !== true) {
    const msg = (parsed && parsed.error && parsed.error.text) || (first && first.error) || 'wrangler query did not succeed';
    throw new Error(String(msg).slice(0, 300));
  }
  return first.results || [];
}

async function d1Query(q, runner) {
  const stdout = await (runner || runWrangler)(q);
  return parseD1Output(stdout);
}

/* EASTERN-DAY ARITHMETIC. `traffic_daily.day` is an Eastern calendar day (rollup.js);
 * everything else in this file is UTC on purpose (the #485 retention-cliff note above).
 * `Intl` with a named zone handles the DST switch correctly in both directions — no
 * fixed -4/-5 offset, which would be wrong for half the year. */
function easternYMD(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: EASTERN_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function addDaysYMD(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function formatPartsInTZ(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const h = get('hour');
  return { y: get('year'), mo: get('month'), d: get('day'), h: h === 24 ? 0 : h, mi: get('minute'), s: get('second') };
}
/* The UTC instant of Eastern midnight for a given Eastern calendar day, as an ISO string.
 * Converges by correction rather than by looking up "the" offset for the day, because
 * there ISN'T one on a transition day. A first pass anchored at NOON UTC of the same
 * calendar day (reasoned as "nowhere near the 2 a.m. local switch") was wrong on
 * 2026-03-08: by noon UTC (~7-8 a.m. local) the spring-forward jump had already happened,
 * so it read back EDT (-240) and returned 04:00Z, but LOCAL MIDNIGHT on the transition
 * day itself is still EST (-300, the correct answer is 05:00Z) — verified against
 * Intl's own formatting of both instants. One correction step is enough: DST offsets
 * only ever change by a whole hour and the EST-shaped first guess is at most a few hours
 * from the true answer, so a second pass is defensive, not load-bearing. */
function easternMidnightISO(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const wantMs = Date.UTC(y, m - 1, d, 0, 0, 0);
  let guess = wantMs + 5 * 3600000; // EST-shaped first guess (UTC = local + 5h)
  for (let i = 0; i < 2; i++) {
    const p = formatPartsInTZ(new Date(guess), EASTERN_TZ);
    const gotMs = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    const diff = gotMs - wantMs;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess).toISOString();
}

/* The window of Eastern days that are CLOSED as of `now` — everything strictly before
 * today (Eastern). Always at least one day for DAYS >= 1 (yesterday). `hasClosedDays` is
 * really only ever false for a malformed `days`; kept explicit rather than assumed. */
function closedDayWindow(days, now) {
  const todayET = easternYMD(now);
  const to = addDaysYMD(todayET, -1);
  const from = addDaysYMD(todayET, -days);
  return { todayET, from, to, hasClosedDays: from <= to };
}

/* PURE: the joined `rollup_runs` + `traffic_daily` rows -> one row per day in [from, to],
 * ascending, with no gaps — same "walk the whole range, don't just list what came back"
 * idiom `stats.js`'s `dailyTotals` uses, so a day the store never captured (before it
 * began, or the cron didn't run) reads `no-data` rather than a silent, wrong `0`.
 *
 *   { day, status: 'store' | 'failed' | 'no-data', pageloads?, visits?, si?, note? }
 *
 * `joinedRows` is `[{day, note, pageloads, visits, si}]` — the shape the LEFT JOIN query
 * below returns, one row per day THAT HAS a `rollup_runs` entry (a day with none is simply
 * absent, which is exactly how "no-data" is detected). */
function classifyClosedDays(from, to, joinedRows) {
  const byDay = new Map((joinedRows || []).map((r) => [String(r.day), r]));
  const days = [];
  for (let d = from; d <= to; d = addDaysYMD(d, 1)) days.push(d);
  return days.map((day) => {
    const r = byDay.get(day);
    if (!r) return { day, status: 'no-data' };
    const note = r.note == null ? '' : String(r.note);
    if (/traffic failed/i.test(note)) return { day, status: 'failed', note };
    return { day, status: 'store', pageloads: num(r.pageloads), visits: num(r.visits), si: Math.max(1, num(r.si)) };
  });
}

// The `source` tag every traffic row now carries in place of the old `exact: yes/±N` —
// THREE states, not two, because "the same number from a different source" is the
// confusion this file exists to end: `store` (first-party, exact), `cf` (Cloudflare,
// exact — sampleInterval 1), `cf~N` (Cloudflare, rounded to the nearest N).
function cfSourceLabel(sampleInterval) {
  const si = Math.max(1, num(sampleInterval) || 1);
  return si === 1 ? 'cf' : `cf~${si}`;
}

// ------------------------------------------------------------------------------- helpers

const iso = (n) => new Date(Date.now() - n * 864e5).toISOString();
const FROM = iso(DAYS).slice(0, 11) + '00:00:00Z';
const TO = iso(0);
const SINCE = `timestamp > NOW() - INTERVAL '${DAYS}' DAY`;
const num = (v) => (v == null || v === '' ? 0 : Number(v));
const fix = (v, n) => (Number.isFinite(v) ? v.toFixed(n) : '');

// A table that does not lie about an empty result — "(none)" rather than a blank frame.
function table(rows, cols) {
  if (!rows || !rows.length) return `  ${C.d}(none)${C.x}`;
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] == null ? '' : r[c]).length)));
  const line = (cells) => '  ' + cells.map((s, i) => String(s).padEnd(w[i])).join('  ');
  return [line(cols), '  ' + w.map((n) => '-'.repeat(n)).join('  '),
          ...rows.map((r) => line(cols.map((c) => (r[c] == null ? '' : r[c]))))].join('\n');
}

const OUT = {};
const failures = [];

async function sec(key, title, cols, fn) {
  let rows = [];
  try { rows = (await fn()) || []; }
  catch (e) {
    failures.push(`${title}: ${e.message}`);
    if (!JSON_OUT) { console.log(`\n${C.b}${title}${C.x}`); console.log(`  ${C.r}query failed:${C.x} ${e.message}`); }
    OUT[key] = { error: e.message };
    return;
  }
  OUT[key] = rows;
  if (!JSON_OUT) { console.log(`\n${C.b}${title}${C.x}`); console.log(table(rows, cols)); }
}

// ------------------------------------------------------------------------------- sections

// RUM `count`/`visits` are ALREADY sample-adjusted — see the SAMPLING block. sampleInterval
// is reported as the granularity, never multiplied in.
// `fromISO`/`toISO` default to the module window but are overridable — `trafficEastern`
// below reuses this same query shape for "today, Eastern" rather than inventing a second
// GraphQL dialect (the whole point of `cfapi.js`'s "lifted from site_report.js" note).
const rumGroup = (dims, order, limit, fromISO, toISO) => `{
  viewer { accounts(filter: {accountTag: "${ACCOUNT}"}) {
    rumPageloadEventsAdaptiveGroups(limit: ${limit},
      filter: {datetime_geq: "${fromISO || FROM}", datetime_leq: "${toISO || TO}", siteTag: "${SITE_TAG}"},
      orderBy: [${order}]) {
      count
      avg { sampleInterval }
      sum { visits }
      dimensions { ${dims} }
    } } } }`;

let rumCoarse = 0; // biggest sampleInterval seen this run — drives the one-line caveat
const rumRows = (g, map) => (g.rumPageloadEventsAdaptiveGroups || []).map((r) => {
  const si = num((r.avg || {}).sampleInterval) || 1;
  if (si > rumCoarse) rumCoarse = si;
  return Object.assign(map(r.dimensions || {}), {
    pageloads: num(r.count),
    visits: num((r.sum || {}).visits),
    source: cfSourceLabel(si),
  });
});

async function traffic() {
  if (!JSON_OUT) console.log(`\n${C.b}══ TRAFFIC ${C.d}(Web Analytics RUM — real browsers, bots excluded)${C.x}`);
  // Said where the numbers are, not only in a header nobody opens.
  if (!JSON_OUT) console.log(`${C.d}   Days here are UTC; the dashboard's are EASTERN — the same`
    + ` date labels a different 24 hours in each, so do not quote one into the other.${C.x}`);

  const COLS = ['pageloads', 'visits', 'source'];
  /* `date (UTC)` AND NOT JUST `date`, because THE DASHBOARD'S DAYS ARE EASTERN and these
   * are not. Cloudflare's `date` dimension is a UTC calendar day, so 2026-09-19 here spans
   * 09-18 20:00 to 09-19 20:00 Eastern -- it carries the previous evening and drops the
   * current one. MEASURED 2026-09-21 on the same closed day: this tool reported 51 pageloads
   * / 17 visits for 2026-09-19 while the dashboard and the first-party store both said
   * 45 / 14. Neither is wrong; they are different 24-hour windows wearing one label, and a
   * figure from here was quoted into a sentence about the other.
   *
   * THE FIX IS THE LABEL, NOT THE WINDOW. Re-aligning to Eastern midnights would reintroduce
   * #485: the retention cliff is at 00:00 UTC of (today - 7), a UTC-midnight FROM sits
   * exactly ON it at every hour, and that is the only reason --days=7 is exact here. The
   * header above carries the measurement; the dashboard paid three days of rounded evening
   * figures to learn it. */
  await sec('traffic_by_day', 'By day (UTC)', ['date (UTC)', ...COLS],
    async () => rumRows(await gql(rumGroup('date', 'date_ASC', 60)),
      (d) => ({ 'date (UTC)': d.date })));

  await trafficEastern();

  await sec('traffic_paths', 'Top pages', ['path', ...COLS],
    async () => rumRows(await gql(rumGroup('requestPath', 'count_DESC', 15)), (d) => ({ path: d.requestPath })));

  await sec('traffic_referers', 'Where they came from', ['referer', ...COLS],
    async () => rumRows(await gql(rumGroup('refererHost', 'count_DESC', 15)),
      (d) => ({ referer: d.refererHost || '(direct)' })));

  await sec('traffic_countries', 'Countries', ['country', ...COLS],
    async () => rumRows(await gql(rumGroup('countryName', 'count_DESC', 15)), (d) => ({ country: d.countryName })));

  await sec('traffic_devices', 'Devices', ['device', ...COLS],
    async () => rumRows(await gql(rumGroup('deviceType', 'count_DESC', 10)), (d) => ({ device: d.deviceType })));

  /* Report what came BACK, not what was asked for. This used to open "Window > 7 days:",
   * which is a claim about the window rather than about the answer — and the dashboard's
   * copy of that sentence spent three days telling the one person who could have caught
   * it that a 7-day window was the reason a 7-day window was rounding (#485). */
  if (rumCoarse > 1 && !JSON_OUT) {
    console.log(`\n  ${C.y}Cloudflare answered from a coarser tier, so these counts are rounded to`);
    console.log(`  the nearest ${rumCoarse}. Only the last 7 days are held at full resolution.${C.x}`);
  }
  OUT.traffic_granularity = rumCoarse;
}

/* By day (Eastern) — a SEPARATE table from "By day (UTC)" above, deliberately never
 * merged into it. `traffic_daily.day` is an Eastern calendar day and the UTC table's
 * `date (UTC)` column is a different 24-hour window under the same-looking label — see
 * the header note and #485. Closed days come from the first-party store and are exact;
 * today is still live (the store has no row for it until the nightly cron), fetched with
 * the same `rumGroup` query the UTC table uses, just re-windowed to Eastern midnight.
 *
 * Gracefully degrades: any failure reaching D1 (wrangler missing, not logged in, slow,
 * unreachable) prints ONE line and skips this table — it does not touch `failures` (that
 * array drives the run's exit code and the "N section(s) failed" tally, and a first-party
 * store being unreachable is a degrade, not a broken section) and it never falls back to
 * printing Cloudflare's rounded number under an `exact`/`store` label. */
async function trafficEastern() {
  const now = new Date();
  const { todayET, from, to } = closedDayWindow(DAYS, now);
  const TITLE = 'By day (Eastern — closed days exact, from the first-party store)';

  let closed;
  try {
    const rows = await d1Query(
      `SELECT r.day AS day, r.note AS note, COALESCE(t.pageloads,0) AS pageloads,` +
      ` COALESCE(t.visits,0) AS visits, COALESCE(t.si,1) AS si` +
      ` FROM (SELECT day, note FROM rollup_runs WHERE day >= '${from}' AND day <= '${to}') r` +
      ` LEFT JOIN (SELECT day, SUM(pageloads) AS pageloads, SUM(visits) AS visits,` +
      ` MAX(sample_interval) AS si FROM traffic_daily WHERE day >= '${from}' AND day <= '${to}'` +
      ` AND bot = 0 GROUP BY day) t ON t.day = r.day ORDER BY r.day ASC`,
    );
    closed = classifyClosedDays(from, to, rows);
  } catch (e) {
    OUT.traffic_by_day_eastern = { unavailable: true, reason: e.message };
    if (!JSON_OUT) {
      console.log(`\n${C.b}${TITLE}${C.x}`);
      console.log(`  ${C.y}first-party store unavailable (${e.message}) — skipped. The UTC table`);
      console.log(`  above is Cloudflare's live figures, rounded beyond 7 days.${C.x}`);
    }
    return;
  }

  // Today (Eastern), still live — same mechanism the UTC table uses for its own "today",
  // just re-windowed from Eastern midnight instead of a UTC one. Always inside Cloudflare's
  // 7-day exact tier by construction (the window is at most 24h old), so this is `cf`,
  // never `cf~N`, in practice — the tag is still computed rather than assumed.
  let today = { day: todayET, status: 'cf', pageloads: 0, visits: 0 };
  try {
    const g = await gql(rumGroup('date', 'date_ASC', 5, easternMidnightISO(todayET), TO));
    const grp = g.rumPageloadEventsAdaptiveGroups || [];
    const pageloads = grp.reduce((s, r) => s + num(r.count), 0);
    const visits = grp.reduce((s, r) => s + num((r.sum || {}).visits), 0);
    const si = grp.reduce((m, r) => Math.max(m, num((r.avg || {}).sampleInterval) || 1), 1);
    today = { day: todayET, status: cfSourceLabel(si), pageloads, visits };
  } catch (e) {
    today = { day: todayET, status: 'unavailable', pageloads: 0, visits: 0, note: e.message };
  }

  const rows = [...closed, today].map((r) => ({
    'date (ET)': r.day,
    pageloads: r.status === 'store' || r.status.startsWith('cf') ? r.pageloads : '',
    visits: r.status === 'store' || r.status.startsWith('cf') ? r.visits : '',
    source: r.status === 'store' ? 'store'
      : r.status.startsWith('cf') ? r.status
      : r.status === 'failed' ? `store (${(r.note || 'capture failed').slice(0, 24)})`
      : r.status === 'unavailable' ? `live unavailable (${(r.note || '').slice(0, 24)})`
      : 'no-data',
  }));
  OUT.traffic_by_day_eastern = rows;
  if (!JSON_OUT) {
    console.log(`\n${C.b}${TITLE}${C.x}`);
    console.log(table(rows, ['date (ET)', 'pageloads', 'visits', 'source']));
    console.log(`${C.d}  Different 24-hour windows than "By day (UTC)" above — do not diff the`);
    console.log(`  two day-for-day. \`no-data\` means the store has no row (before it began, or`);
    console.log(`  the nightly cron did not run), never a silent 0.${C.x}`);
  }
}

async function health() {
  if (!JSON_OUT) console.log(`\n${C.b}══ HEALTH ${C.d}(Worker invocations — did the telemetry actually arrive)${C.x}`);

  await sec('worker', 'Workers', ['worker', 'status', 'requests', 'errors'], async () => {
    const g = await gql(`{
      viewer { accounts(filter: {accountTag: "${ACCOUNT}"}) {
        workersInvocationsAdaptive(limit: 100,
          filter: {datetime_geq: "${FROM}", datetime_leq: "${TO}"}) {
          sum { requests errors }
          dimensions { scriptName status }
        } } } }`);
    return (g.workersInvocationsAdaptive || [])
      .map((r) => ({
        worker: r.dimensions.scriptName,
        status: r.dimensions.status,
        requests: num((r.sum || {}).requests),
        errors: num((r.sum || {}).errors),
      }))
      .sort((a, b) => b.requests - a.requests);
  });
}

async function usage() {
  // Totals first: they decide whether the rest is worth printing, and they are the one place
  // the sampling gap is stated in full.
  let est = 0, raw = 0, sessions = 0;
  try {
    const t = await sql(`SELECT sum(_sample_interval) AS est, count() AS raw,
                                count(DISTINCT blob4) AS sessions
                         FROM ${DATASET} WHERE ${SINCE}`);
    est = num((t[0] || {}).est); raw = num((t[0] || {}).raw); sessions = num((t[0] || {}).sessions);
  } catch (e) {
    failures.push(`usage totals: ${e.message}`);
    OUT.usage_totals = { error: e.message };
    if (!JSON_OUT) console.log(`\n${C.r}USAGE query failed:${C.x} ${e.message}`);
    return;
  }
  OUT.usage_totals = { est_events: est, raw_rows: raw, sessions_floor: sessions, days: DAYS };

  if (!JSON_OUT) {
    console.log(`\n${C.b}══ IN-SIM USAGE ${C.d}(Analytics Engine — what they did at the board)${C.x}`);
    const gap = raw ? ((est / raw - 1) * 100) : 0;
    console.log(`${C.d}  ~${est} events (${raw} rows stored${gap > 0.5 ? `, sampled ${fix(gap, 0)}% up` : ''}) · ` +
                `>= ${sessions} sessions${C.x}`);
    if (gap > 0.5) console.log(`${C.d}  'est' columns are sum(_sample_interval); the session count is a FLOOR — sampling drops whole rows.${C.x}`);
  }
  if (!est) {
    if (!JSON_OUT) {
      console.log(`\n  ${C.y}No events in the window.${C.x} That is not proof the pipeline is broken —`);
      console.log(`  the HEALTH section above answers "did anything arrive" independently.`);
    }
    return;
  }

  const rows = (r, map) => r.map(map);

  await sec('usage_events', 'Events', ['event', 'est', 'raw', 'sessions'], async () =>
    rows(await sql(`SELECT blob1 AS event, sum(_sample_interval) AS est, count() AS raw,
                           count(DISTINCT blob4) AS sessions
                    FROM ${DATASET} WHERE ${SINCE} GROUP BY event ORDER BY est DESC`),
      (r) => ({ event: r.event, est: num(r.est), raw: num(r.raw), sessions: num(r.sessions) })));

  await sec('usage_release', 'Release / channel', ['release', 'channel', 'est', 'sessions'], async () =>
    rows(await sql(`SELECT blob3 AS release, blob2 AS channel, sum(_sample_interval) AS est,
                           count(DISTINCT blob4) AS sessions
                    FROM ${DATASET} WHERE ${SINCE} GROUP BY release, channel ORDER BY est DESC`),
      (r) => ({ release: r.release, channel: r.channel, est: num(r.est), sessions: num(r.sessions) })));

  await sec('usage_start', 'Where they start', ['initial_state', 'sessions', 'est'], async () =>
    rows(await sql(`SELECT blob5 AS initial_state, count(DISTINCT blob4) AS sessions,
                           sum(_sample_interval) AS est
                    FROM ${DATASET} WHERE ${SINCE} AND blob1 = 'session_start'
                    GROUP BY initial_state ORDER BY est DESC`),
      (r) => ({ initial_state: r.initial_state, sessions: num(r.sessions), est: num(r.est) })));

  await sec('usage_modes', 'How far they get  (plant_mode — the funnel; mode is double3, blob5 is empty by design)',
    ['mode', 'sessions', 'transitions'], async () =>
    rows(await sql(`SELECT double3 AS mode, count(DISTINCT blob4) AS sessions,
                           sum(_sample_interval) AS transitions
                    FROM ${DATASET} WHERE ${SINCE} AND blob1 = 'plant_mode'
                    GROUP BY mode ORDER BY mode ASC`),
      (r) => ({ mode: num(r.mode), sessions: num(r.sessions), transitions: num(r.transitions) })));

  await sec('usage_milestones', 'Milestones  (one per session)', ['milestone', 'sessions'], async () =>
    rows(await sql(`SELECT blob5 AS milestone, count(DISTINCT blob4) AS sessions
                    FROM ${DATASET} WHERE ${SINCE} AND blob1 = 'milestone'
                    GROUP BY milestone ORDER BY sessions DESC LIMIT 30`),
      (r) => ({ milestone: r.milestone, sessions: num(r.sessions) })));

  await sec('usage_panels', 'Panels opened', ['panel', 'opens', 'sessions'], async () =>
    rows(await sql(`SELECT blob5 AS panel, sum(_sample_interval) AS opens,
                           count(DISTINCT blob4) AS sessions
                    FROM ${DATASET} WHERE ${SINCE} AND blob1 = 'panel_open'
                    GROUP BY panel ORDER BY opens DESC LIMIT 25`),
      (r) => ({ panel: r.panel, opens: num(r.opens), sessions: num(r.sessions) })));

  await sec('usage_controls', 'Controls used  (action NAME only — never the value it was set to)',
    ['action', 'uses', 'sessions'], async () =>
    rows(await sql(`SELECT blob5 AS action, sum(_sample_interval) AS uses,
                           count(DISTINCT blob4) AS sessions
                    FROM ${DATASET} WHERE ${SINCE} AND blob1 = 'command'
                    GROUP BY action ORDER BY uses DESC LIMIT 25`),
      (r) => ({ action: r.action, uses: num(r.uses), sessions: num(r.sessions) })));

  await sec('usage_missions', 'Missions', ['mission', 'event', 'sessions'], async () =>
    rows(await sql(`SELECT blob5 AS mission, blob1 AS event, count(DISTINCT blob4) AS sessions
                    FROM ${DATASET} WHERE ${SINCE}
                      AND blob1 IN ('mission_start','mission_complete','mission_abandon')
                    GROUP BY mission, event ORDER BY mission, event LIMIT 60`),
      (r) => ({ mission: r.mission, event: r.event, sessions: num(r.sessions) })));

  // A DISTRIBUTION, not a row per session — this is the section that would otherwise grow
  // without bound. quantileWeighted is the only quantile the endpoint accepts, and weighting
  // by _sample_interval is what the sampled rows require anyway.
  /* THIS FIGURE IS session_end ONLY AND THE LABEL SAYS SO -- but the label is the whole
   * defence, and it has now been stripped twice when the number was quoted onward. Only
   * about half of sessions record an end (36 of 69, measured 2026-09-20): a tab left open
   * never does, and the ones it omits are disproportionately the LONG ones, so this median
   * is biased SHORT. Measured the same day: session_end-only reads p50 1.9 min / p75 8.0,
   * while ALL sessions by first-to-last event span read p50 3.0 / p75 21.8 / p95 125.3.
   *
   * THE DASHBOARD'S Feature usage PAGE HAS THE UNBIASED VERSION (a histogram over every
   * session, #797 item 6). Prefer it. Quote this one only with its qualifier attached. */
  await sec('usage_length', 'Session length  (session_end only — a tab still open has not ended)',
    ['metric', 'p50', 'p75', 'p95', 'max'], async () => {
    const q = (c) => `quantileWeighted(${c})(double1, _sample_interval)`;
    const s = (c) => `quantileWeighted(${c})(double2, _sample_interval)`;
    const r = (await sql(`SELECT ${q(0.5)} AS w50, ${q(0.75)} AS w75, ${q(0.95)} AS w95, max(double1) AS wmax,
                                 ${s(0.5)} AS s50, ${s(0.75)} AS s75, ${s(0.95)} AS s95, max(double2) AS smax
                          FROM ${DATASET} WHERE ${SINCE} AND blob1 = 'session_end'`))[0] || {};
    if (!Number.isFinite(num(r.w50)) || num(r.wmax) === 0) return [];
    const mins = (v) => fix(num(v) / 60, 1);
    return [
      { metric: 'wall minutes', p50: mins(r.w50), p75: mins(r.w75), p95: mins(r.w95), max: mins(r.wmax) },
      { metric: 'sim minutes', p50: mins(r.s50), p75: mins(r.s75), p95: mins(r.s95), max: mins(r.smax) },
    ];
  });

  if (has('--sessions')) {
    await sec('sessions', 'Per-session detail  (capped at 200 — use --sql= beyond that)',
      ['session', 'release', 'events', 'first_seen', 'last_seen'], async () =>
      rows(await sql(`SELECT blob4 AS session, blob3 AS release, count() AS events,
                             min(timestamp) AS first_seen, max(timestamp) AS last_seen
                      FROM ${DATASET} WHERE ${SINCE} GROUP BY session, release
                      ORDER BY first_seen DESC LIMIT 200`),
        (r) => ({ session: r.session, release: r.release, events: num(r.events),
                  first_seen: r.first_seen, last_seen: r.last_seen })));
  }
}

// ------------------------------------------------------------------------------ exports
// Pure, offline-testable pieces — test/run_site_report.js exercises these without a
// network call or a subprocess. Everything else here (sql, gql, sec, traffic, ...) reads
// module-level state (TOKEN, FROM/TO, OUT) built for a live run and is not meant to be
// imported; requiring this file for the exports below must not itself exit the process,
// which is why `requireToken()`'s check moved out of module-load and into the guard below.
module.exports = {
  easternYMD, addDaysYMD, easternMidnightISO,
  closedDayWindow, classifyClosedDays, parseD1Output, cfSourceLabel, d1Query,
};

// ---------------------------------------------------------------------------------- main

if (require.main === module) {
  requireToken();
  (async () => {
    if (has('--sql')) { console.log(JSON.stringify(await sql(val('--sql', '')), null, 2)); return; }
    if (has('--gql')) { console.log(JSON.stringify(await gql(val('--gql', '')), null, 2)); return; }

    if (!JSON_OUT) console.log(`${C.b}reactordynamics.com — last ${DAYS} day(s)${C.x}  ${C.d}${FROM.slice(0, 10)} → ${TO.slice(0, 10)}${C.x}`);

    if (wants('traffic')) await traffic();
    if (wants('health')) await health();
    if (wants('usage')) await usage();

    if (JSON_OUT) {
      console.log(JSON.stringify({ days: DAYS, from: FROM, to: TO, failures, ...OUT }, null, 2));
    } else if (failures.length) {
      console.log(`\n${C.y}${failures.length} section(s) failed — the numbers above are incomplete.${C.x}`);
    }
    // A non-zero exit on a failed section, so a scheduled run cannot look green while half-blind.
    if (failures.length) process.exit(1);
  })().catch((e) => { console.error(`${C.r}FAILED${C.x} ${e.message}`); process.exit(1); });
}
