/* Reactor Dynamics — usage-data receiver.
 *
 * Two routes, matching the two paths in site/telemetry.js:
 *
 *   POST /            a JSON batch of aggregate events  -> Analytics Engine
 *   POST /?kind=bundle  a gzipped session recording     -> R2
 *
 * They are kept apart here for the same reason they are kept apart in the client:
 * the first is passive and must stay boring; the second is a deliberate act by
 * someone reporting a bug and may carry their words. Nothing merges them.
 *
 * ---------------------------------------------------------------- what is NOT stored
 * The client is careful about what it sends. This end has to be equally careful
 * about what it ADDS, because a Worker sees far more than the page does:
 *
 *   - The IP address is used as the rate-limit key and NEVER written anywhere. It
 *     goes into env.LIMITER.limit({key}) and out of scope on the next line.
 *   - The User-Agent is not read, not stored, not passed on.
 *   - No cookies are set, no headers are echoed into storage.
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
const ALLOWED_ORIGINS = [
  'https://reactordynamics.com',
  'https://www.reactordynamics.com',
  'https://dev.reactordynamics.com',
];

// A 4-hour session is ~504 KB gzipped (measured), so 2 MB is generous headroom and
// still small enough that an open endpoint is not free file hosting. The event batch
// is a few hundred short rows at most.
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;
const MAX_EVENTS_BYTES = 64 * 1024;
const MAX_EVENTS_PER_BATCH = 250;   // Analytics Engine caps writes per invocation

/* THE COLUMN MAP — append-only. See the warning above.
 *
 *   indexes[0]  event name          (the sampling key)
 *   blobs[0]    event name          (repeated so queries need no join to filter)
 *   blobs[1]    channel             public | preview | dev
 *   blobs[2]    release             "Alpha 1.3.0"
 *   blobs[3]    session id          ephemeral, per visit — groups one visit's rows,
 *                                   and cannot link two visits (it is regenerated)
 *   blobs[4]    key                 the event's principal string, per KEY_OF below
 *   blobs[5]    plant               pwr | rbmk | bwr, when the event carries it
 *   doubles[0]  seconds
 *   doubles[1]  sim_seconds
 *   doubles[2]  mode                plant_mode only
 *   doubles[3]  beat                mission_abandon only
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

// ---------------------------------------------------------------- the Worker
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

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
      ],
      doubles: [
        Number(p.seconds || 0),
        Number(p.sim_seconds || 0),
        Number(p.mode || 0),
        Number(p.beat || 0),
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

  await env.BUNDLES.put(key, buf, {
    httpMetadata: {
      contentType: 'application/json',
      contentEncoding: gzipped ? 'gzip' : undefined,
    },
  });

  // The id goes back so a reporter can quote it and it can be found in one command.
  return json({ ok: true, id: id }, 200, origin);
}
