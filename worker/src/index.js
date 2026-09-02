/* Reactor Dynamics — usage-data receiver.
 *
 * Two ingestion routes, matching the two paths in site/telemetry.js:
 *
 *   POST /            a JSON batch of aggregate events  -> Analytics Engine
 *   POST /?kind=bundle  a gzipped session recording     -> R2
 *
 * They are kept apart here for the same reason they are kept apart in the client:
 * the first is passive and must stay boring; the second is a deliberate act by
 * someone reporting a bug and may carry their words. Nothing merges them.
 *
 * A third route reads back what the second one stored:
 *
 *   GET /dashboard?token=T   a token-gated feedback viewer — see dashboard.js
 *
 * It is GET, token-gated instead of origin-gated, and not part of the
 * CORS-fronted API below — it is meant to be opened directly in a browser.
 *
 * ---------------------------------------------------------------- what is NOT stored
 * The client is careful about what it sends. This end has to be equally careful
 * about what it ADDS, because a Worker sees far more than the page does:
 *
 *   - The IP address is used as the rate-limit key and NEVER written anywhere. It
 *     goes into env.LIMITER.limit({key}) and out of scope on the next line.
 *   - The User-Agent is not read, not stored, not passed on.
 *   - ONE exception: handleBundle stamps the CORS-checked Origin header into a bug report's
 *     R2 customMetadata (one of the three values in ALLOWED_ORIGINS — not a full URL, no
 *     path or query, nothing a visitor typed) so a report can be told apart by which site
 *     sent it. No other header is echoed into storage.
 *   - Nothing is logged. console.log in a Worker goes to the tail/observability
 *     stream, which is a place data lives; if you add logging while debugging,
 *     take it out, and never log `body`.
 *
 * privacy.html makes promises on behalf of this file. If you change what is kept,
 * change that page in the same commit.
 *
 * ------------------------------------------------------- Analytics Engine: read this
 * The dataset has NO SCHEMA. Position IS the schema — Cloudflare's own docs say
 * values "must be provided in consistent order across all writes". So the column
 * map below is append-only: adding a field means taking the next free slot, and
 * REORDERING OR REUSING A SLOT silently mixes old rows with new ones in every
 * query that has already been written against it. There is no migration and no
 * error; the numbers just quietly become wrong.
 */

// ---------------------------------------------------------------- configuration
/* THE TEST SITE MUST BE IN HERE, AND IT WAS NOT — measured 2026-08-09. This list
 * carried `https://dev.reactordynamics.com`, a custom subdomain that was planned in
 * #413 and then never created *(OWNER RULING, 2026-08-09: "instead of
 * dev.reactordynamics.com im going to use the currently functioning
 * https://develop.reactor-dynamics.pages.dev/. This works just as well. We can retire
 * the issues calling for the creation of a page for the develop worktree.")*. So the
 * allowlist named a host that does not exist and omitted the one that does, while
 * `RD_TELEMETRY_ENDPOINT` is stamped on preview builds too — the test site has been
 * sending all along. Measured against the live Worker:
 *
 *   POST, Origin: https://develop.reactor-dynamics.pages.dev  ->  403 origin not allowed
 *   POST, Origin: https://reactordynamics.com                 ->  204
 *
 * and the preflight answers `Access-Control-Allow-Origin: https://reactordynamics.com`
 * to the test site, so the browser blocks the response even when the status would not.
 * Every bug report and every event from the test site was discarded silently, which is
 * the worst way for a reporting channel to fail: the tester sees a normal page and the
 * dataset simply has no rows to be missing from.
 *
 * A `pages.dev` host is now load-bearing rather than incidental — do not drop it from
 * this list when the Pages project is tidied up. */
const ALLOWED_ORIGINS = [
  'https://reactordynamics.com',
  'https://www.reactordynamics.com',
  'https://develop.reactor-dynamics.pages.dev',
];

// A 4-hour session is ~504 KB gzipped (measured), so 2 MB is generous headroom and
// still small enough that an open endpoint is not free file hosting. The event batch
// is a few hundred short rows at most.
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;
const MAX_EVENTS_BYTES = 64 * 1024;
const MAX_EVENTS_PER_BATCH = 250;   // Analytics Engine caps writes per invocation

/* THE COLUMN MAP — append-only. See the warning above.
 *
 * SQL is 1-INDEXED: blobs[0] is `blob1`, doubles[0] is `double1`. So doubles[4]
 * below is `double5` in a query, and blobs[6] is `blob7`. Getting this wrong reads
 * a neighbouring column that is also populated, so it returns plausible numbers.
 *
 *   indexes[0]  event name          (the sampling key)
 *   blobs[0]    event name          (repeated so queries need no join to filter)
 *   blobs[1]    channel             public | preview | dev
 *   blobs[2]    release             "Alpha 1.3.0"
 *   blobs[3]    session id          ephemeral, per visit — groups one visit's rows,
 *                                   and cannot link two visits (it is regenerated)
 *   blobs[4]    key                 the event's principal string, per KEY_OF below
 *   blobs[5]    plant               pwr | rbmk | bwr, when the event carries it
 *   blobs[6]    block_code          why a command was refused: INTERLOCK | SEAL_IN |
 *                                   GATED_BY_INSTRUCTOR | COMMAND_ERROR. '' = none.
 *   doubles[0]  seconds
 *   doubles[1]  sim_seconds
 *   doubles[2]  mode                plant_mode only
 *   doubles[3]  beat                mission_abandon only
 *   doubles[4]  t_page              seconds since PAGE LOAD (envelope `e.t`)
 *   doubles[5]  t_session           seconds since the session id was minted (`e.st`)
 *   doubles[6]  blocked             1 the plant refused it, 0 it went through
 *   doubles[7]  errored             1 the command errored, 0 it did not
 *
 * ALL FOUR NEW DOUBLES AND THE NEW BLOB ARE WRITTEN ON EVERY ROW FROM THE COMMIT
 * THAT ADDED THEM, even where nothing produces the value yet. A short row reads
 * back as 0 downstream, so a version that wrote five doubles and one that wrote
 * eight would make every older row say `blocked = 0` — "not blocked" — when the
 * truth is "this client could not tell you". Constant row shape plus the -1
 * sentinel below is the only version of this that stays honest.
 *
 * -1 MEANS "NOT REPORTED", AND IT APPLIES TO NEW COLUMNS ONLY. doubles[0..3] keep
 * `Number(p.x || 0)` and must not be retrofitted: analytics.js and sessions.js
 * already SUM those columns, and a -1 in them would quietly subtract. Append-only
 * governs meaning, not just position. Every query over a new column must exclude
 * the sentinel explicitly (`AND double7 >= 0`) or old rows count as a real 0.
 */
const KEY_OF = {
  session_start: 'initial_state',
  session_end: 'last_panel',
  command: 'action',
  panel_open: 'panel',
  mission_start: 'id',
  mission_complete: 'id',
  mission_abandon: 'id',
  plant_mode: null,
  milestone: 'name',
};

import { handleDashboard } from './dashboard.js';
import { runRollup } from './rollup.js';
import { stagesEndpoint } from './features.js';

// ---------------------------------------------------------------- helpers
function cors(origin) {
  const ok = ALLOWED_ORIGINS.indexOf(origin) !== -1;
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Content-Encoding is NOT a CORS-safelisted request header, so the bundle POST
    // triggers a preflight and this line is what makes it pass. Dropping it makes
    // bug reports fail in the browser while the event path keeps working, which is
    // a confusing way to find out.
    'Access-Control-Allow-Headers': 'Content-Type, Content-Encoding',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors(origin)),
  });
}

function allowed(origin) {
  // Not a security control — an Origin header is trivially forged, and this endpoint
  // is unauthenticated by design. It stops casual cross-posting and makes the CORS
  // response correct; the real protections are the size caps and the rate limit.
  return !origin || ALLOWED_ORIGINS.indexOf(origin) !== -1;
}

async function readCapped(request, max) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > max) return null;                  // cheap rejection before reading
  const buf = await request.arrayBuffer();
  return buf.byteLength > max ? null : buf;         // and again, since it can lie
}

/* -1 = NOT REPORTED, for the columns added 2026-08-10 only. The older columns use
 * `Number(x || 0)` and stay that way — see the column map.
 *
 * The distinction these preserve is between "the client told us 0" and "this client
 * is too old to have an opinion". `|| 0` collapses them, and the collapse is not
 * visible downstream: a query would read a release that predates the column as a
 * plant that never refused a command, rather than as no data. During the window
 * between deploying this and the client release that populates it, EVERY row is
 * -1 — which is exactly when a query that treats -1 as 0 tells its worst lie.
 */
function num(v) { return typeof v === 'number' && isFinite(v) ? v : -1; }
function bool(v) { return v === true ? 1 : v === false ? 0 : -1; }

// ---------------------------------------------------------------- the Worker
export default {
  /* THE DAILY ROLLUP (#604). Neither upstream keeps anything for long -- Web Analytics
   * holds 7 days at full resolution and Analytics Engine a fixed 3 months -- so the
   * dashboard could not answer "is this growing", and past a week could not answer "what
   * happened on the 14th" either.
   *
   * The whole trick is being ON TIME: the coarse tier only penalises queries made LATER,
   * so a job that snapshots yesterday while it is still inside the 7-day window keeps
   * exact history for ever. That makes a MISSED run a permanent loss of that day's
   * precision, not a delay -- which is why rollup.js stores `sample_interval` on every
   * row and records each run, so a late or absent capture is visible instead of being
   * read as a quiet day.
   *
   * ctx is deliberately unused: this must finish before the invocation ends, so it is
   * awaited rather than handed to waitUntil. */
  async scheduled(event, env) {
    const summary = await runRollup(env);
    /* Deliberately NOT console.log'd. Observability is off for this Worker on purpose
     * (wrangler.toml) because Workers Logs capture request metadata and headers, which
     * includes CF-Connecting-IP -- and src/index.js promises the IP is never written
     * anywhere. The run's own record lives in the `rollup_runs` table, which the
     * dashboard reads; that is the place to look, not a log stream. */
    return summary;
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    // The dashboard, and the one write it owns. Both token-gated inside; neither is
    // part of the CORS-fronted ingest below, and the POST here is a form submit from
    // the dashboard page rather than anything the sim can reach.
    if (url.pathname === '/dashboard' && (request.method === 'GET' || request.method === 'POST')) {
      return handleDashboard(env, url, request);
    }

    /* The site BUILD reads this to stamp flag stages. Open and unauthenticated on
     * purpose: a stage is not a secret — every one of them ships inside site/flags.js
     * to every visitor — so gating it would protect nothing while forcing a token into
     * the Pages build environment. Writing stays behind DASHBOARD_TOKEN. */
    if (request.method === 'GET' && url.pathname === '/flags-stages') {
      return stagesEndpoint(env);
    }

    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, origin);
    if (!allowed(origin)) return json({ error: 'origin not allowed' }, 403, origin);

    // Rate limit on the caller's IP. The address is used HERE and nowhere else — it
    // is never written to R2, never written to Analytics Engine, never logged.
    if (env.LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.LIMITER.limit({ key: ip });
      if (!success) return json({ error: 'rate limited' }, 429, origin);
    }

    return url.searchParams.get('kind') === 'bundle'
      ? handleBundle(request, env, origin)
      : handleEvents(request, env, origin);
  },
};

// ---------------------------------------------------------------- path 1: events
async function handleEvents(request, env, origin) {
  const buf = await readCapped(request, MAX_EVENTS_BYTES);
  if (!buf) return json({ error: 'too large' }, 413, origin);

  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(buf)); }
  catch (e) { return json({ error: 'bad json' }, 400, origin); }

  const events = Array.isArray(payload && payload.events) ? payload.events : [];
  if (!events.length) return new Response(null, { status: 204, headers: cors(origin) });
  if (!env.EVENTS) return json({ error: 'no dataset bound' }, 503, origin);

  const channel = String(payload.channel || '');
  const release = String(payload.release || '');
  const session = String(payload.session || '');

  let written = 0;
  for (const e of events.slice(0, MAX_EVENTS_PER_BATCH)) {
    const name = String((e && e.e) || '');
    if (!Object.prototype.hasOwnProperty.call(KEY_OF, name)) continue;   // unknown = dropped
    const p = (e && e.p) || {};
    const keyField = KEY_OF[name];

    env.EVENTS.writeDataPoint({
      indexes: [name],
      blobs: [
        name,
        channel,
        release,
        session,
        keyField ? String(p[keyField] == null ? '' : p[keyField]) : '',
        String(p.plant || ''),
        // block_code: SLOT RESERVED, nothing populates it yet. Written as a literal
        // rather than read from `p` so that the schema, this receiver and privacy.html
        // all describe exactly what is collected TODAY — a column reading a prop no
        // event declares is the same drift `blocked` already demonstrated. The slot is
        // claimed here because claiming it later is what risks a collision.
        '',
      ],
      doubles: [
        Number(p.seconds || 0),
        Number(p.sim_seconds || 0),
        Number(p.mode || 0),
        Number(p.beat || 0),
        // ENVELOPE fields, not props: the client stamps these on the queued event
        // itself (site/telemetry.js), so they are read off `e`, not off `p`. `t` has
        // been on the wire since the first release and was discarded here until
        // 2026-08-10 — the ordering it gives is what the sessions view is built on.
        num(e.t),
        num(e.st),
        // `blocked` has likewise been collected and dropped since it was added.
        bool(p.blocked),
        -1,                 // errored: SLOT RESERVED — see block_code above
      ],
    });
    written++;
  }
  // 204: the client sends these with mode:'no-cors' or sendBeacon and cannot read a
  // body anyway. Returning one would only cost bandwidth on a fire-and-forget path.
  return new Response(null, { status: 204, headers: cors(origin) });
}

// ---------------------------------------------------------------- path 2: bundle
async function handleBundle(request, env, origin) {
  const buf = await readCapped(request, MAX_BUNDLE_BYTES);
  if (!buf) return json({ error: 'too large' }, 413, origin);
  if (!env.BUNDLES) return json({ error: 'no bucket bound' }, 503, origin);

  // SNIFF, do not trust the header. The client sets Content-Encoding: gzip, but an
  // edge or proxy may have decompressed the body before it reaches us — in which case
  // storing the object with contentEncoding=gzip makes every later read fail on a
  // file that is actually plain JSON. The gzip magic number settles it.
  const bytes = new Uint8Array(buf);
  const gzipped = bytes.length > 1 && bytes[0] === 0x1f && bytes[1] === 0x8b;

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const id = now.getTime().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const key = 'bundles/' + day + '/' + id + (gzipped ? '.json.gz' : '.json');

  // Origin is already checked against ALLOWED_ORIGINS above and then discarded — the only
  // record left of which site sent this was whatever the client claimed inside the JSON body.
  // Stamping it here too means the dashboard can show which build a report came from even if
  // the client-side `build`/`channel` fields are absent (older sessions) or wrong.
  await env.BUNDLES.put(key, buf, {
    httpMetadata: {
      contentType: 'application/json',
      contentEncoding: gzipped ? 'gzip' : undefined,
    },
    customMetadata: { origin: origin || '' },
  });

  // The id goes back so a reporter can quote it and it can be found in one command.
  return json({ ok: true, id: id }, 200, origin);
}
