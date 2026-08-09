#!/usr/bin/env node
/* usage_report.js — what people actually do in the sim.
 *
 *   node tools/usage_report.js              last 7 days
 *   node tools/usage_report.js --days=30
 *   node tools/usage_report.js --sessions   per-session timelines as well
 *   node tools/usage_report.js --sql="SELECT ..."   one ad-hoc query
 *
 * NEEDS `CLOUDFLARE_API_TOKEN` — an *Account Analytics → Read* token, User scope. Without it
 * this exits 2 and says so; it never half-reports.
 *
 * ------------------------------------------------------------------ why this is a script
 * The Cloudflare MCP CANNOT read this dataset. Its `cloudflare.request()` demands the standard
 * `{success, result}` envelope and the Analytics Engine SQL endpoint answers `{meta, data,
 * rows}` — so a perfectly good query surfaces as `Cloudflare API error: 200`. Measured
 * 2026-08-09. Do not "fix" that by retrying through the MCP in another shape; it is the
 * wrapper, not the query.
 *
 * -------------------------------------------------------------------------- query traps
 *   - `uniq()` and `round()` both return 422. Group and format in JS, as below.
 *   - `ORDER BY` a RAW double column is a 422 ("unable to find type of column: double1") even
 *     though SELECTing the same column is fine. Order by the ALIAS. Isolated 2026-08-09:
 *     `SELECT double1 AS w ... ORDER BY double1` fails, `... ORDER BY w` succeeds.
 *   - The body is RAW SQL as text/plain. Not JSON, not form-encoded.
 *   - `timestamp` is the WRITE time (the client batches every 15 s), not the moment the thing
 *     happened. For "when did they do X" use double2 (sim_seconds), which is plant time.
 *   - COUNT SESSIONS WITH `count(DISTINCT blob4)`, NEVER `count(session_start)`. One session
 *     can legitimately carry several starts — the player can switch initial condition without
 *     opening a new tab, and that is a fact worth keeping rather than deduplicating away.
 *
 * ------------------------------------------------------------- the column map (positional)
 * The dataset has NO SCHEMA; position IS the schema, and `worker/src/index.js` owns it.
 * blob1 event · blob2 channel · blob3 release · blob4 session · blob5 key · blob6 plant
 * double1 seconds · double2 sim_seconds · double3 mode (plant_mode only) · double4 beat.
 * blob5 is EMPTY for plant_mode by design (KEY_OF maps it to null — the mode is a number and
 * lives in double3). An empty blob5 there is not a bug; reading blob5 instead of double3 is.
 */
'use strict';

const ACCOUNT = 'f6ee6be4ecfceb66a8a6b7b6ed26d286';
const DATASET = 'reactor_dynamics_usage';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;

const args = process.argv.slice(2);
const has = (f) => args.some((a) => a === f || a.startsWith(f + '='));
const val = (f, d) => { const a = args.find((x) => x.startsWith(f + '=')); return a ? a.slice(f.length + 1) : d; };
const DAYS = Number(val('--days', '7')) || 7;

const C = process.stdout.isTTY
  ? { b: '\x1b[1m', d: '\x1b[2m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', x: '\x1b[0m' }
  : { b: '', d: '', g: '', y: '', r: '', x: '' };

if (!TOKEN) {
  console.error(`${C.r}No CLOUDFLARE_API_TOKEN.${C.x}
Create one at https://dash.cloudflare.com/profile/api-tokens — Custom token,
permission "Account" / "Account Analytics" / "Read", nothing else. Then, in YOUR OWN
terminal (not inside an agent session, or it lands in the transcript):

  [Environment]::SetEnvironmentVariable("CLOUDFLARE_API_TOKEN", (Read-Host "Paste token"), "User")`);
  process.exit(2);
}

async function sql(q) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/analytics_engine/sql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'text/plain' },
    body: q,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  let j;
  try { j = JSON.parse(text); } catch (e) { throw new Error(`unparseable response: ${text.slice(0, 200)}`); }
  return j.data || [];
}

const SINCE = `timestamp > NOW() - INTERVAL '${DAYS}' DAY`;

// A table that does not lie about an empty result — "(none)" rather than a blank frame.
function table(rows, cols) {
  if (!rows.length) return `  ${C.d}(none)${C.x}`;
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] == null ? '' : r[c]).length)));
  const line = (cells) => '  ' + cells.map((s, i) => String(s).padEnd(w[i])).join('  ');
  return [line(cols), '  ' + w.map((n) => '-'.repeat(n)).join('  '),
          ...rows.map((r) => line(cols.map((c) => r[c] == null ? '' : r[c])))].join('\n');
}

(async () => {
  if (has('--sql')) { console.log(JSON.stringify(await sql(val('--sql', '')), null, 2)); return; }

  console.log(`${C.b}Reactor Dynamics — usage, last ${DAYS} day(s)${C.x}`);

  const totals = await sql(`SELECT count() AS n FROM ${DATASET} WHERE ${SINCE}`);
  const sessions = await sql(`SELECT count(DISTINCT blob4) AS n FROM ${DATASET} WHERE ${SINCE}`);
  const n = Number((totals[0] || {}).n || 0);
  if (!n) {
    console.log(`\n  ${C.y}No events in the window.${C.x} That is not proof the pipeline is broken —`);
    console.log(`  check arrivals independently: Worker request counts come from the GraphQL`);
    console.log(`  workersInvocationsAdaptive dataset and do not depend on this one.`);
    return;
  }
  console.log(`${C.d}  ${n} events · ${(sessions[0] || {}).n || 0} distinct sessions${C.x}`);

  const sec = async (title, q, cols) => {
    console.log(`\n${C.b}${title}${C.x}`);
    try { console.log(table(await sql(q), cols)); }
    catch (e) { console.log(`  ${C.r}query failed:${C.x} ${e.message}`); }
  };

  await sec('Sessions',
    `SELECT blob4 AS session, blob3 AS release, count() AS events,
            min(timestamp) AS first_seen, max(timestamp) AS last_seen
     FROM ${DATASET} WHERE ${SINCE} GROUP BY blob4, blob3 ORDER BY first_seen DESC`,
    ['session', 'release', 'events', 'first_seen', 'last_seen']);

  await sec('Where they start',
    `SELECT blob5 AS initial_state, count() AS n FROM ${DATASET}
     WHERE ${SINCE} AND blob1 = 'session_start' GROUP BY blob5 ORDER BY n DESC`,
    ['initial_state', 'n']);

  await sec('How far they get  (plant_mode — the funnel; mode is double3, blob5 is empty by design)',
    `SELECT double3 AS mode, count(DISTINCT blob4) AS sessions, count() AS transitions
     FROM ${DATASET} WHERE ${SINCE} AND blob1 = 'plant_mode' GROUP BY double3 ORDER BY mode ASC`,
    ['mode', 'sessions', 'transitions']);

  await sec('Milestones  (one per session since 2026-08-09 — before that, reloads double-counted)',
    `SELECT blob5 AS milestone, count(DISTINCT blob4) AS sessions FROM ${DATASET}
     WHERE ${SINCE} AND blob1 = 'milestone' GROUP BY blob5 ORDER BY sessions DESC`,
    ['milestone', 'sessions']);

  await sec('Panels opened',
    `SELECT blob5 AS panel, count() AS opens, count(DISTINCT blob4) AS sessions
     FROM ${DATASET} WHERE ${SINCE} AND blob1 = 'panel_open' GROUP BY blob5 ORDER BY opens DESC`,
    ['panel', 'opens', 'sessions']);

  await sec('Controls used  (action NAME only — never the value it was set to)',
    `SELECT blob5 AS action, count() AS uses, count(DISTINCT blob4) AS sessions
     FROM ${DATASET} WHERE ${SINCE} AND blob1 = 'command' GROUP BY blob5 ORDER BY uses DESC`,
    ['action', 'uses', 'sessions']);

  await sec('Missions',
    `SELECT blob1 AS event, blob5 AS mission, count() AS n FROM ${DATASET}
     WHERE ${SINCE} AND blob1 IN ('mission_start','mission_complete','mission_abandon')
     GROUP BY blob1, blob5 ORDER BY mission, event`,
    ['mission', 'event', 'n']);

  await sec('Session length  (wall seconds, and sim seconds reached)',
    `SELECT blob4 AS session, double1 AS wall_secs, double2 AS sim_secs, blob5 AS last_panel
     FROM ${DATASET} WHERE ${SINCE} AND blob1 = 'session_end' ORDER BY wall_secs DESC`,
    ['session', 'wall_secs', 'sim_secs', 'last_panel']);

  if (has('--sessions')) {
    await sec('Full timeline',
      `SELECT timestamp, blob4 AS session, blob1 AS event, blob5 AS detail, double2 AS sim_secs
       FROM ${DATASET} WHERE ${SINCE} ORDER BY timestamp ASC, blob4 ASC LIMIT 500`,
      ['timestamp', 'session', 'event', 'detail', 'sim_secs']);
  }

  console.log(`\n${C.d}A session with no session_end did not necessarily crash — the tab may still`);
  console.log(`be open, or the unload beacon may not have flushed. Absence is not an ending.${C.x}`);
})().catch((e) => { console.error(`${C.r}FAILED${C.x} ${e.message}`); process.exit(1); });
