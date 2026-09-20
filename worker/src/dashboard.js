/* Reactor Dynamics — ops dashboard.
 *
 * Views, all behind one signed session cookie (see AUTH below):
 *
 *   GET  /dashboard                      bug reports, newest first
 *   GET  /dashboard?key=<r2 key>         one report
 *   GET  /dashboard?key=<r2 key>&raw=1   the decompressed JSON, as-is
 *   GET  /dashboard?view=analytics       traffic + page performance (analytics.js)
 *   GET  /dashboard?view=usage           walkthroughs + in-sim feature usage (usage.js)
 *   GET  /dashboard?view=sessions        per-session drill-down (sessions.js)
 *   GET  /dashboard?view=session&sid=…   one session's trace
 *   POST /dashboard  action=login|logout           the session itself
 *   POST /dashboard?view=features  id=…&stage=…    the one write the dashboard owns
 *
 * Not part of the CORS-fronted ingest API in index.js: this is meant to be opened
 * directly in a browser, not called from the site.
 *
 * ============================== AUTH (#764) ==============================
 *
 * THE OLD DESIGN PUT THE SECRET IN THE QUERY STRING. `?token=` made the bookmark itself
 * the credential: it landed in browser history, in every screenshot of the address bar,
 * and — since the same value gated the feature-flag WRITE — a leaked URL could mutate the
 * live sim. It is replaced by a password typed once per device.
 *
 * TWO Worker secrets, none of them in this repo and none in RD_Ops:
 *
 *   DASHBOARD_PASSWORD   what the operator types. Compared with `safeEqual`.
 *   DASHBOARD_HMAC_KEY   signs the session cookie.
 *
 * DASHBOARD_TOKEN IS GONE (2026-09-20). The cutover block that exchanged an old `?token=`
 * bookmark for a session cookie was deleted a week early *(OWNER RULING, 2026-09-20, on the
 * recommendation to delete it now rather than wait for the 25th: "the two rulings as
 * recommended")*, and the secret was deleted with it. Two reasons it did not need its week:
 * the migration it existed for had ALREADY HAPPENED -- the owner signed in with the password
 * the same day, so his cookie was already minted -- and a review measured the exchange to be
 * the one credential check on this Worker with NO RATE LIMIT. A wrong password burns 1 of 5
 * per minute through LOGIN_LIMITER; a wrong token cost nothing and could be guessed for ever,
 * which made the token strictly weaker than the password it was standing in for.
 * DO NOT REINTRODUCE A BEARER TOKEN IN A URL.
 *
 * ROTATING `DASHBOARD_HMAC_KEY` IS THE REVOKE-ALL-DEVICES SWITCH. Every outstanding
 * cookie fails its MAC check the moment the key changes, and every device has to sign in
 * again. There is no session store and therefore NO OTHER WAY TO LOG OUT A LOST PHONE:
 *
 *     cd worker && wrangler secret put DASHBOARD_HMAC_KEY && wrangler deploy
 *
 * The cookie is a signed session, never the secret itself:
 *
 *     payload = <expireAt epoch ms> "." <16 hex nonce>
 *     cookie  = payload "." base64url(HMAC-SHA256(DASHBOARD_HMAC_KEY, payload))
 *
 * `Path=/dashboard` IS LOAD-BEARING: the telemetry ingest endpoint is at `/` and is
 * public, so the cookie must never be attached to a request the sim makes. Widening the
 * path hands this credential to every beacon the site sends.
 *
 * NO CSRF NONCE, AND THAT IS NOT AN OVERSIGHT. `SameSite=Lax` is what protects the
 * feature-flag POST: the browser does not attach the cookie to a cross-site form submit,
 * so a hostile page cannot flip a flag even knowing the shape of the form. THE WHOLE
 * PROTECTION IS THAT ATTRIBUTE — if anyone ever "fixes" the cookie to `SameSite=None`
 * (the usual reason being an embed or a third-party frame), the write becomes forgeable
 * from any page on the internet and a real CSRF token has to arrive in the same change.
 *
 * Every string that came from a player (the note, anything inside the bundle) is
 * HTML-escaped before it goes on the page — the note is untrusted input rendered as a
 * page an owner reads in a real browser, and it is not the reporter's job to keep it
 * safe to display.
 */

import { esc, html, PAGE_HEAD, nav, cards, etWithDow, etFull } from './render.js';
import { analyticsPage } from './analytics.js';
import { usagePage } from './usage.js';
import { sessionList, sessionDetail } from './sessions.js';
import { featuresPage, featuresAction } from './features.js';

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ======================================================================= the session
 *
 * COOKIE_NAME/COOKIE_PATH are used by BOTH the set and the clear: a logout that spells
 * either of them differently writes a second cookie instead of deleting the first, and
 * the browser then keeps sending the original — a logout that silently does nothing.
 */
const COOKIE_NAME = 'rd_dash';
const COOKIE_PATH = '/dashboard';
const SESSION_DAYS = 30;
const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;   // seconds, for Max-Age

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function macOf(env, payload) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(env.DASHBOARD_HMAC_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload))));
}

/* The nonce is not a session id — nothing looks it up, because there is no session store.
 * It exists so two logins in the same millisecond do not mint the same cookie, and so the
 * signed payload is not guessable from the clock alone. */
async function mintCookie(env) {
  const rnd = new Uint8Array(8);
  crypto.getRandomValues(rnd);
  let nonce = '';
  for (let i = 0; i < rnd.length; i++) nonce += rnd[i].toString(16).padStart(2, '0');
  const payload = (Date.now() + SESSION_MAX_AGE * 1000) + '.' + nonce;
  const value = payload + '.' + await macOf(env, payload);
  return COOKIE_NAME + '=' + value + '; HttpOnly; Secure; SameSite=Lax; Path=' + COOKIE_PATH
    + '; Max-Age=' + SESSION_MAX_AGE;
}

function clearCookie() {
  return COOKIE_NAME + '=; HttpOnly; Secure; SameSite=Lax; Path=' + COOKIE_PATH + '; Max-Age=0';
}

function readCookie(request, name) {
  const raw = (request && request.headers && request.headers.get('Cookie')) || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

/* TWO independent reasons to reject, and both must stay. Verifying the MAC without
 * checking `expireAt` makes the cookie permanent — a correctly signed session from a
 * phone lost last year still opens the dashboard — and checking the expiry without the
 * MAC lets anyone type one. */
async function validSession(env, value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 3) return false;
  const [expireAt, nonce, mac] = parts;
  if (!/^\d{1,15}$/.test(expireAt) || !/^[0-9a-f]{16}$/.test(nonce)) return false;
  if (!safeEqual(mac, await macOf(env, expireAt + '.' + nonce))) return false;
  return Number(expireAt) > Date.now();
}

async function authed(env, request) {
  const raw = readCookie(request, COOKIE_NAME);
  return raw ? validSession(env, raw) : false;
}

/* THE LOGIN PAGE CARRIES NO DASHBOARD CONTENT — not a count, not a nav bar. It is what an
 * unauthenticated request gets, so anything on it is public. 200 rather than 401 because
 * the owner meets this on a phone and a browser's own 401 chrome is not a form.
 *
 * The form posts to `/dashboard` itself with an `action` field rather than to a new route:
 * index.js routes exactly one dashboard path, and every other POST falls through into the
 * CORS-fronted ingest handler. A `/dashboard/login` route would have to be added there, to
 * the cookie Path, and to the CORS boundary's list of exceptions. */
function loginPage(msg, extra, status) {
  const headers = Object.assign({ 'X-Robots-Tag': 'noindex' }, extra || {});
  return html('<!doctype html><html><head>' + PAGE_HEAD
    + '<title>Sign in — Reactor Dynamics</title></head><body>'
    + '<h1>Reactor Dynamics — ops</h1>'
    + (msg ? '<p class="warn">' + esc(msg) + '</p>' : '')
    + '<form method="POST" action="/dashboard">'
    + '<input type="hidden" name="action" value="login">'
    + '<p><input type="password" name="password" autocomplete="current-password" '
    + 'autofocus style="padding:8px;font-size:16px;width:260px;max-width:70vw"></p>'
    + '<p><button type="submit" style="padding:8px 18px;font-size:15px">Sign in</button></p>'
    + '</form></body></html>', status || 200, headers);
}

// bundles/<day>/<base36 ms>-<8 random chars>.json[.gz] — see index.js handleBundle.
function parseKey(key) {
  const parts = key.split('/');
  const day = parts[1] || '';
  const id = (parts[2] || '').replace(/\.json(\.gz)?$/, '');
  const ms = parseInt(id.split('-')[0], 36);
  // Match the Analytics Engine format the other two views print ("YYYY-MM-DD HH:MM:SS")
  // rather than raw ISO — milliseconds and a T are noise in a column someone scans.
  // This stays UTC: it is the wire format, and `etWithDow` converts it at RENDER (2026-08-12).
  // The `day` fallback is a bare date and the ET helpers pass it through unconverted — see
  // the DATE_ONLY note in render.js for why converting it would list a report a day early.
  const when = Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 19).replace('T', ' ') : day;
  return { day, id, when };
}

// Returns the server-stamped Origin alongside the parsed body so a caller never needs a
// second R2 request (a plain `.head()`) just to learn where a report came from.
async function fetchBundle(env, key) {
  const obj = await env.BUNDLES.get(key);
  if (!obj) return null;
  const text = key.endsWith('.gz')
    ? await new Response(obj.body.pipeThrough(new DecompressionStream('gzip'))).text()
    : await obj.text();
  return { bundle: JSON.parse(text), origin: (obj.customMetadata && obj.customMetadata.origin) || '' };
}

async function reportList(env) {
  if (!env.BUNDLES) return html('no bucket bound', 503);

  // Keys sort newest-first as plain strings: the date segment dominates, and within a
  // day the base36-millisecond id segment is monotonic too.
  const listed = await env.BUNDLES.list({ prefix: 'bundles/', limit: 1000 });
  const keys = listed.objects.map((o) => o.key).sort().reverse();
  const shown = keys.slice(0, 50);

  const rows = await Promise.all(shown.map(async (key) => {
    const { when } = parseKey(key);
    let note = '', plant = '', channel = '';
    try {
      const fetched = await fetchBundle(env, key);
      const bundle = fetched && fetched.bundle;
      note = (bundle && bundle.note) || '';
      const manifest = bundle && bundle.bundle && bundle.bundle.manifest;
      plant = (manifest && manifest.plant_id) || '';
      // The client-declared channel is the readable one ("public"/"preview"/"dev") — fall
      // back to the server-stamped Origin (a URL, harder to spoof) for older bundles that
      // predate it, or if a caller ever ships a doctored `channel` field.
      channel = (bundle && bundle.channel) || (fetched && fetched.origin) || '';
    } catch (e) {
      note = '(failed to read: ' + e.message + ')';
    }
    // The card CLAMPS the note in CSS, so the preview no longer has to be truncated to a
    // single line's worth here — 400 chars is a card's worth of reading, and anything past
    // it is a click away. The old 140 was sized for a table cell.
    const preview = note.length > 400 ? note.slice(0, 400) + '…' : note;
    return {
      title: etWithDow(when),
      meta: [
        { k: 'Plant', v: plant || '—', mono: true },
        { k: 'Channel', v: channel || '—', mono: true },
      ],
      body: preview || '(no note)',
      href: '?key=' + encodeURIComponent(key),
      hrefLabel: 'view report →',
    };
  }));

  return html('<!doctype html><html><head>' + PAGE_HEAD
    + '<title>Feedback — Reactor Dynamics</title></head><body>' + nav('')
    + '<h1>Bug reports — ' + rows.length + ' of ' + listed.objects.length + ', newest first</h1>'
    + '<p class="muted">Times are Eastern.</p>'
    + cards(rows)
    + (listed.objects.length > rows.length ? '<p class="muted">Showing the most recent ' + rows.length + '.</p>' : '')
    + '</body></html>');
}

async function reportDetail(env, key) {
  let fetched;
  try { fetched = await fetchBundle(env, key); }
  catch (e) { return html('failed to read report: ' + esc(e.message), 500); }
  if (!fetched) return html('not found', 404);
  const bundle = fetched.bundle;

  const b = bundle.bundle || {};
  const manifest = b.manifest || {};
  const events = Array.isArray(b.events) ? b.events : [];
  const commands = Array.isArray(b.commands) ? b.commands : [];
  const perf = b.performance || {};
  const { when, id } = parseKey(key);

  const eventRows = events.slice(0, 200).map((e) =>
    '<tr><td class="mono muted">' + esc(e.t) + '</td><td>' + esc(e.type || e.kind || '')
    + '</td><td class="mono muted">' + esc(JSON.stringify(e)) + '</td></tr>'
  ).join('');
  const cmdRows = commands.slice(0, 200).map((c) =>
    '<tr><td class="mono muted">' + esc(c.t) + '</td><td>' + esc(c.action || c.cmd || '')
    + '</td><td>' + esc(c.blocked ? 'blocked' : (c.error || '')) + '</td></tr>'
  ).join('');

  const backHref = '/dashboard';
  const rawHref = '?key=' + encodeURIComponent(key) + '&raw=1';

  return html('<!doctype html><html><head>' + PAGE_HEAD
    + '<title>Report ' + esc(id) + '</title></head><body>' + nav('')
    + '<a class="backlink" href="' + backHref + '">&larr; all reports</a>'
    + '<h1>' + esc(etFull(when)) + ' — <span class="mono">' + esc(id) + '</span></h1>'
    + '<p class="muted">Channel: <span class="mono">' + esc(bundle.channel || '—')
    + '</span> · Build: <span class="mono">' + esc(bundle.build || '—')
    + '</span> · Origin: <span class="mono">' + esc(fetched.origin || '—') + '</span></p>'
    + '<section><h2>Note</h2><pre>' + esc(bundle.note || '(no note)') + '</pre></section>'
    + '<section><h2>Manifest</h2><pre>' + esc(JSON.stringify(manifest, null, 2)) + '</pre></section>'
    + '<section><h2>Events (' + events.length + ')</h2><table><tr><th>t</th><th>type</th><th>raw</th></tr>' + eventRows + '</table></section>'
    + '<section><h2>Commands (' + commands.length + ')</h2><table><tr><th>t</th><th>action</th><th>flag</th></tr>' + cmdRows + '</table></section>'
    + '<section><h2>Performance</h2><pre>' + esc(JSON.stringify(perf, null, 2)) + '</pre></section>'
    + '<p><a href="' + rawHref + '">raw json</a></p>'
    + '</body></html>');
}

export async function handleDashboard(env, url, request) {
  if (!env.DASHBOARD_PASSWORD || !env.DASHBOARD_HMAC_KEY) {
    return html('dashboard not configured — DASHBOARD_PASSWORD and DASHBOARD_HMAC_KEY '
      + 'are Worker secrets and at least one is unset', 503);
  }

  if (request && request.method === 'POST') {
    /* ONE read of the body, up front: a Request's body is a stream and reading it twice
     * throws. The action decides what happens; the features write is the fall-through. */
    const form = await request.formData();
    const action = String(form.get('action') || '');

    if (action === 'logout') return loginPage('Signed out.', { 'Set-Cookie': clearCookie() });

    if (action === 'login') {
      if (safeEqual(String(form.get('password') || ''), env.DASHBOARD_PASSWORD)) {
        return new Response(null, {
          status: 303,
          headers: {
            Location: '/dashboard?view=analytics',
            'Set-Cookie': await mintCookie(env),
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
          },
        });
      }
      /* THE THROTTLE IS CHARGED ONLY BY A FAILURE, which is what makes it safe to put in
       * front of a password the owner sometimes fat-fingers: a correct password never
       * consumes budget, so he cannot lock himself out by signing in on four devices.
       * Every wrong guess does consume one, so a brute force runs out at five a minute.
       * The IP is the limiter KEY and is never written anywhere — same promise index.js
       * makes for the ingest endpoint, and privacy.html depends on it. */
      if (env.LOGIN_LIMITER) {
        const ip = (request.headers.get('CF-Connecting-IP')) || 'unknown';
        const { success } = await env.LOGIN_LIMITER.limit({ key: ip });
        if (!success) return loginPage('Too many attempts — wait a minute.', {}, 429);
      }
      return loginPage('Wrong password.', {}, 401);
    }

    /* The only write in the whole dashboard. It needs the SAME session as the reads —
     * before #764 it shared the read token, so any leaked URL could mutate the live sim.
     * Answered with a 303 so a refresh cannot resubmit the change. */
    if (!await authed(env, request)) return loginPage('Session expired — sign in again.');
    if (url.searchParams.get('view') !== 'features') return html('no such action', 404);
    return featuresAction(env, url, form);
  }

  const session = await authed(env, request);
  if (!session) return loginPage('');

  const view = url.searchParams.get('view');
  if (view === 'analytics') return analyticsPage(env, url);
  if (view === 'usage') return usagePage(env, url);
  if (view === 'sessions') return sessionList(env, url);
  if (view === 'features') return featuresPage(env, url);
  if (view === 'session') return sessionDetail(env, url, url.searchParams.get('sid') || '');

  const key = url.searchParams.get('key');
  if (!key) return reportList(env);

  if (url.searchParams.get('raw') === '1') {
    let fetched;
    try { fetched = await fetchBundle(env, key); }
    catch (e) { return html('failed to read: ' + esc(e.message), 500); }
    if (!fetched) return html('not found', 404);
    return new Response(JSON.stringify(fetched.bundle, null, 2), {
      // A report bundle is a player's own words and a recording of their session. It is
      // the last thing that should sit in a shared device's cache — same rule as html().
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  }

  return reportDetail(env, key);
}
