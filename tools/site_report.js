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
 * The adaptive dataset switches to a coarser pre-aggregated tier somewhere between 7 and 14
 * days. The first draft of this file multiplied count × sampleInterval and reported 300
 * pageloads against a true 20. So: report what comes back, print the granularity beside it,
 * and use `--days=7` or less when you need an exact figure.
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
 */
'use strict';

const ACCOUNT = 'f6ee6be4ecfceb66a8a6b7b6ed26d286';
const SITE_TAG = '283f126f6ff94319a638db77f6d0602b';
const DATASET = 'reactor_dynamics_usage';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;

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

if (!TOKEN) {
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
const rumGroup = (dims, order, limit) => `{
  viewer { accounts(filter: {accountTag: "${ACCOUNT}"}) {
    rumPageloadEventsAdaptiveGroups(limit: ${limit},
      filter: {datetime_geq: "${FROM}", datetime_leq: "${TO}", siteTag: "${SITE_TAG}"},
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
    exact: si === 1 ? 'yes' : `±${si}`,
  });
});

async function traffic() {
  if (!JSON_OUT) console.log(`\n${C.b}══ TRAFFIC ${C.d}(Web Analytics RUM — real browsers, bots excluded)${C.x}`);

  const COLS = ['pageloads', 'visits', 'exact'];
  await sec('traffic_by_day', 'By day', ['date', ...COLS],
    async () => rumRows(await gql(rumGroup('date', 'date_ASC', 60)), (d) => ({ date: d.date })));

  await sec('traffic_paths', 'Top pages', ['path', ...COLS],
    async () => rumRows(await gql(rumGroup('requestPath', 'count_DESC', 15)), (d) => ({ path: d.requestPath })));

  await sec('traffic_referers', 'Where they came from', ['referer', ...COLS],
    async () => rumRows(await gql(rumGroup('refererHost', 'count_DESC', 15)),
      (d) => ({ referer: d.refererHost || '(direct)' })));

  await sec('traffic_countries', 'Countries', ['country', ...COLS],
    async () => rumRows(await gql(rumGroup('countryName', 'count_DESC', 15)), (d) => ({ country: d.countryName })));

  await sec('traffic_devices', 'Devices', ['device', ...COLS],
    async () => rumRows(await gql(rumGroup('deviceType', 'count_DESC', 10)), (d) => ({ device: d.deviceType })));

  if (rumCoarse > 1 && !JSON_OUT) {
    console.log(`\n  ${C.y}Window > 7 days: Cloudflare answered from a coarser tier, so these counts are`);
    console.log(`  rounded to the nearest ${rumCoarse}. Re-run with --days=7 for exact figures.${C.x}`);
  }
  OUT.traffic_granularity = rumCoarse;
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

// ---------------------------------------------------------------------------------- main

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
