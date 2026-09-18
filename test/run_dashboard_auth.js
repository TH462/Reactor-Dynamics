/*
 * run_dashboard_auth.js — the ops dashboard's authentication (#764 Unit 1).
 *
 * WHY THIS RUNNER HAS TO EXIST. This change can lock the only operator out of the only
 * window onto the live site, from a Worker that deploys separately from the site. It also
 * moves a credential: the dashboard used to be gated by `?token=` on every URL and is now
 * gated by an HMAC-signed session cookie. Every failure mode below is SILENT — each one
 * produces a page that looks right to whoever is holding the phone:
 *
 *   1. A FORGED COOKIE ACCEPTED. If the MAC comparison is dropped, `rd_dash=1.a.b` opens
 *      the bug reports — which are other people's words — and the feature-flag write that
 *      changes the live sim. Nothing errors; the dashboard simply works for everyone.
 *   2. A COOKIE THAT NEVER EXPIRES. Verifying the signature but not `expireAt` makes every
 *      session permanent, so a phone lost a year ago still has a live console. There is no
 *      session store, so nothing else can revoke it (rotating DASHBOARD_HMAC_KEY is the
 *      only switch, which is why dashboard.js says so in its header).
 *   3. THE COOKIE REACHING THE INGEST ROUTE. `Path=/dashboard` is the whole reason this
 *      credential is not attached to every telemetry beacon the sim sends to `/`. Widen
 *      the path and nothing breaks, nothing warns, and the secret ships with each beacon.
 *   4. THE WRITE LEFT OPEN. The features POST is the one thing on this Worker that mutates
 *      what players get. Authenticating the GETs and forgetting the POST reads as a fully
 *      working dashboard.
 *   5. A TOKEN LEFT IN AN HREF. One surviving `?token=` link puts the legacy secret back
 *      into browser history and into the Referer of every outbound click.
 *
 * NO NETWORK. `env` is a plain object with no CF_ANALYTICS_TOKEN, so the analytics view
 * renders its own "no secret set" page — which still carries the view's <h1>, which is all
 * this runner needs to tell "reached the dashboard" from "got the login form". No R2, no
 * KV, no D1: the one write path is expected to fail INSIDE featuresAction (no KV binding),
 * after the auth decision this runner is actually testing.
 *
 * THE MAC IS COMPUTED INDEPENDENTLY HERE, with Node's own WebCrypto, rather than by asking
 * the module to mint a cookie. A test that signs with the code it is testing agrees with
 * that code by construction, including when both are wrong.
 *
 *   node test/run_dashboard_auth.js
 *   node test/run_dashboard_auth.js --inject=mac      # prove a check can go red
 *   node test/run_dashboard_auth.js --inject=list     # every injection this file knows
 */
'use strict';
var fs = require('fs');
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

/* ---------------------------------------------------------------- the injections
 *
 * Each one BREAKS THE THING A CHECK GUARDS, in the source text, before it is loaded. The
 * repo's standing rule is that a check written beside its own fix is not green until it
 * has been made to go red; keeping the injections in the runner makes that reproducible
 * by anyone later instead of a claim in a commit message.
 *
 * `red` is what was observed when it was written — a later change that alters the count
 * is worth reading, but only ZERO is a failure of the gate.
 */
var INJECTIONS = {
  mac: { file: 'dashboard.js', red: '2 — a forged MAC, and any key, opens the dashboard',
         from: 'if (!safeEqual(mac, await macOf(env, expireAt + \'.\' + nonce))) return false;',
         to: 'if (false) return false;' },
  expiry: { file: 'dashboard.js', red: '1 — an expired session stays live for ever',
            from: 'return Number(expireAt) > Date.now();', to: 'return true;' },
  cookiepath: { file: 'dashboard.js', red: '2 — the cookie reaches the ingest route at /, and '
                     + 'the logout then clears a cookie the browser is not holding',
                from: "const COOKIE_PATH = '/dashboard';", to: "const COOKIE_PATH = '/';" },
  postauth: { file: 'dashboard.js', red: '1 — the feature-flag write is open to anyone',
              from: "if (!await authed(env, request)) return loginPage('Session expired — sign in again.');",
              to: '' },
  rejectall: { file: 'dashboard.js', red: '2 — nobody can sign in at all (the lockout case)',
               from: 'return raw ? validSession(env, raw) : false;', to: 'return false;' },
  legacystrip: { file: 'dashboard.js', red: '2 — the old bookmark keeps its secret',
                 from: "clean.searchParams.delete('token');", to: '' },
  /* ANCHORED ON ONE LINE EACH, not on the pair. The first cut of this injection spanned
   * two lines with a `\n`, which matched nothing — these files are CRLF in the working
   * tree — so the runner reported "the anchor moved" instead of running the injection.
   * An injection that never fires proves exactly as much as no injection at all. */
  nostore: { file: 'render.js', red: '1 — every dashboard page is cacheable',
             from: "'Cache-Control': 'no-store',", to: '' },
  noreferrer: { file: 'render.js', red: '1 — the dashboard leaks its URLs to outbound links',
                from: "'Referrer-Policy': 'no-referrer',", to: '' },
  tokenhref: { file: 'analytics.js', red: '1 — a credential back in an href',
               from: "const href = '?view=analytics&days=' + n;",
               to: "const href = '?token=' + encodeURIComponent('x') + '&view=analytics&days=' + n;" },
};
var INJECT = '';
process.argv.forEach(function (a) {
  var m = /^--inject=(.+)$/.exec(a);
  if (m) INJECT = m[1];
});
if (INJECT === 'list') {
  console.log(BOLD + '\ninjections\n' + RST);
  Object.keys(INJECTIONS).forEach(function (k) {
    console.log('  --inject=' + k + '  (' + INJECTIONS[k].file + ')  expected: ' + INJECTIONS[k].red);
  });
  process.exit(0);
}
if (INJECT && !INJECTIONS[INJECT]) {
  console.log(RED + 'unknown injection ' + INJECT + ' — try --inject=list' + RST);
  process.exit(1);
}

// ---------------------------------------------------------------- the worker source
var ROOT = path.join(__dirname, '..');
var SRCDIR = path.join(ROOT, 'worker', 'src');
var FILES = fs.readdirSync(SRCDIR).filter(function (f) { return /\.js$/.test(f); });
var SRC = {};
FILES.forEach(function (f) { SRC[f] = fs.readFileSync(path.join(SRCDIR, f), 'utf8'); });

if (INJECT) {
  var inj = INJECTIONS[INJECT];
  if (SRC[inj.file].indexOf(inj.from) < 0) {
    console.log(RED + 'injection ' + INJECT + ' no longer matches ' + inj.file
      + ' — the anchor moved; a blind injection proves nothing.' + RST);
    process.exit(1);
  }
  SRC[inj.file] = SRC[inj.file].split(inj.from).join(inj.to);
}

/* LOADING THE WORKER'S ES MODULES FROM A CommonJS RUNNER — the idiom from run_rollup.js,
 * which took it from run_dashboard_time.js. There is no package.json declaring module
 * type (the repo root is gated against gaining one), so a module is base64'd into a
 * `data:` URL and imported. A data: URL has no base to resolve `./render.js` against, so
 * the graph is built BOTTOM-UP: each dependency is built first and its own data: URL
 * substituted for the relative specifier in the importer. dashboard.js pulls the whole
 * worker graph this way — render, analytics, usage, sessions, features, cfapi, rollup.
 *
 * It reads from SRC, not from disk, so an injection above reaches the loaded module. */
function loadEsm(entry) {
  var built = {};
  function build(rel) {
    if (built[rel]) return built[rel];
    if (!SRC[rel]) throw new Error('no such worker module: ' + rel);
    built[rel] = 'PENDING';   // a cycle would otherwise recurse for ever
    var src = SRC[rel].replace(/from\s+'\.\/([\w.]+\.js)'/g, function (_, dep) {
      if (built[dep] === 'PENDING') throw new Error('import cycle at ' + rel + ' -> ' + dep);
      return "from '" + build(dep) + "'";
    });
    built[rel] = 'data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64');
    return built[rel];
  }
  return import(build(entry));
}

// ---------------------------------------------------------------- crypto, independently
var PASSWORD = 'correct-horse-battery-staple';
var HMAC_KEY = 'a-test-signing-key-not-the-token';
var LEGACY = 'legacy-bearer-token-value';
var NONCE = '0123456789abcdef';

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function macOf(key, payload) {
  var k = await crypto.subtle.importKey('raw', Buffer.from(key, 'utf8'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, Buffer.from(payload, 'utf8')));
}
async function cookieFor(expireAt, nonce, key) {
  var payload = expireAt + '.' + (nonce || NONCE);
  return payload + '.' + await macOf(key || HMAC_KEY, payload);
}

// ---------------------------------------------------------------- driving the handler
var ENV = {
  DASHBOARD_PASSWORD: PASSWORD,
  DASHBOARD_HMAC_KEY: HMAC_KEY,
  DASHBOARD_TOKEN: LEGACY,
  // No CF_ANALYTICS_TOKEN, no BUNDLES, no FLAGS: every view short-circuits to its own
  // "not configured" body AFTER the auth decision, which is the only decision under test.
};

function get(mod, qs, cookie) {
  var u = 'https://telemetry.example/dashboard' + (qs || '');
  var init = { method: 'GET', headers: {} };
  if (cookie) init.headers.Cookie = cookie;
  var req = new Request(u, init);
  return mod.handleDashboard(ENV, new URL(u), req);
}
function post(mod, qs, fields, cookie) {
  var u = 'https://telemetry.example/dashboard' + (qs || '');
  var fd = new FormData();
  Object.keys(fields).forEach(function (k) { fd.append(k, fields[k]); });
  var init = { method: 'POST', body: fd, headers: {} };
  if (cookie) init.headers.Cookie = cookie;
  var req = new Request(u, init);
  return mod.handleDashboard(ENV, new URL(u), req);
}
function isLogin(body) { return /name="password"/.test(body) && /action" value="login"/.test(body); }

// ---------------------------------------------------------------- comment stripping
/* Comments out, string literals left alone — the idiom from run_dashboard_time.js, and
 * for the same reason it exists there. EVERY comment in these files discusses the token
 * at length, because that is where the reasoning about removing it lives, so a scan that
 * does not strip them passes green on prose. Strings are masked FIRST so a `//` inside a
 * URL cannot open a fake comment. */
function stripComments(src) {
  var strings = [];
  var masked = src.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, function (m) {
    strings.push(m);
    return '' + (strings.length - 1) + '';
  });
  masked = masked.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  return masked.replace(/(\d+)/g, function (_, i) { return strings[+i]; });
}
function literals(src) {
  return (stripComments(src)
    .match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || []);
}

(async function main() {
  var mod = await loadEsm('dashboard.js');
  console.log(BOLD + '\nops dashboard authentication — #764 Unit 1' + RST
    + (INJECT ? '   ' + RED + '[INJECTED: ' + INJECT + ']' + RST : ''));

  var hour = 3600 * 1000;
  var goodCookie = 'rd_dash=' + await cookieFor(Date.now() + hour);

  /* ------------------------------------------------------------- 1. the cookie */
  head('1. a session cookie is only as good as its signature');

  var forged = await get(mod, '?view=analytics',
    'rd_dash=' + (Date.now() + hour) + '.' + NONCE + '.bm90LWEtcmVhbC1tYWM');
  var forgedBody = await forged.text();
  ck('a forged MAC does not open the dashboard',
     isLogin(forgedBody) && !/<h1>Analytics/.test(forgedBody),
     'status ' + forged.status + ', ' + (isLogin(forgedBody) ? 'login form' : 'NOT the login form'));

  // Correctly signed with the real key, and stale by an hour. The signature check alone
  // cannot tell this from a live session — only the expiry comparison can.
  var expired = await get(mod, '?view=analytics', 'rd_dash=' + await cookieFor(Date.now() - hour));
  var expiredBody = await expired.text();
  ck('a validly signed session whose expireAt has passed does not open the dashboard',
     isLogin(expiredBody) && !/<h1>Analytics/.test(expiredBody),
     'status ' + expired.status);

  var okRes = await get(mod, '?view=analytics', goodCookie);
  var okBody = await okRes.text();
  ck('a well-formed, unexpired cookie reaches the analytics view',
     /<h1>Analytics/.test(okBody) && !isLogin(okBody),
     'status ' + okRes.status + ', ' + okBody.length + ' bytes');

  var wrongKey = await get(mod, '?view=analytics',
    'rd_dash=' + await cookieFor(Date.now() + hour, NONCE, 'a-different-signing-key'));
  var wrongKeyBody = await wrongKey.text();
  ck('...and a cookie signed with a DIFFERENT key does not — rotating DASHBOARD_HMAC_KEY '
     + 'is the revoke-all-devices switch',
     isLogin(wrongKeyBody) && !/<h1>Analytics/.test(wrongKeyBody), '');

  /* ------------------------------------------------------------- 2. the write */
  head('2. the one write on this Worker is behind the same session');

  var openWrite = await post(mod, '?view=features', { id: 'x:y', stage: 'off' });
  var openWriteBody = await openWrite.text();
  ck('POST view=features with NO cookie is refused before featuresAction is reached',
     openWrite.status !== 303 && isLogin(openWriteBody),
     'status ' + openWrite.status + (openWrite.status === 303
       ? ' — Location ' + openWrite.headers.get('Location') : ''));

  // The positive control: without it, the check above would also pass if the POST path
  // were broken for everybody, which is a different (and also shipped-broken) plant.
  var authedWrite = await post(mod, '?view=features', { id: 'x:y', stage: 'off' }, goodCookie);
  ck('...and WITH a valid cookie it gets through to the write (which then fails on no KV '
     + 'binding, as it should in a runner with no bindings)',
     authedWrite.status === 303 && /err=/.test(authedWrite.headers.get('Location') || ''),
     'status ' + authedWrite.status + ', Location ' + authedWrite.headers.get('Location'));

  /* ------------------------------------------------------------- 3. the Set-Cookie */
  head('3. the cookie the login hands out');

  var login = await post(mod, '', { action: 'login', password: PASSWORD });
  var setCookie = login.headers.get('Set-Cookie') || '';
  ck('a correct password answers 303 to the analytics view',
     login.status === 303 && login.headers.get('Location') === '/dashboard?view=analytics',
     'status ' + login.status + ' -> ' + login.headers.get('Location'));
  ck('the cookie is HttpOnly, Secure and SameSite=Lax',
     /HttpOnly/.test(setCookie) && /Secure/.test(setCookie) && /SameSite=Lax/.test(setCookie),
     setCookie.replace(/^rd_dash=[^;]*/, 'rd_dash=<value>'));
  /* ASSERTED ON ITS OWN, because it is the one attribute whose loss is invisible: a cookie
   * at Path=/ still signs the operator in perfectly, and is also attached to every
   * telemetry beacon the sim POSTs to the ingest endpoint at `/`. */
  ck('the cookie is scoped Path=/dashboard, so it NEVER reaches the ingest route at /',
     /(^|;\s*)Path=\/dashboard(\s*;|\s*$)/.test(setCookie),
     (/Path=[^;]*/.exec(setCookie) || ['no Path at all'])[0]);
  ck('...and its value is a signed payload, not the password or the token',
     setCookie.indexOf(PASSWORD) < 0 && setCookie.indexOf(LEGACY) < 0
       && /^rd_dash=\d+\.[0-9a-f]{16}\.[\w-]{20,}/.test(setCookie), '');

  var wrong = await post(mod, '', { action: 'login', password: 'nope' });
  ck('a wrong password sets no cookie and does not 303',
     !wrong.headers.get('Set-Cookie') && wrong.status !== 303,
     'status ' + wrong.status);

  var out = await post(mod, '', { action: 'logout' }, goodCookie);
  var outCookie = out.headers.get('Set-Cookie') || '';
  ck('logout clears the cookie at the same name and path',
     /^rd_dash=;/.test(outCookie) && /Max-Age=0/.test(outCookie) && /Path=\/dashboard/.test(outCookie),
     outCookie);

  /* ------------------------------------------------------------- 4. the legacy exchange */
  head('4. LEGACY_TOKEN_EXCHANGE — one shot, then the bookmark is clean');

  var exch = await get(mod, '?token=' + encodeURIComponent(LEGACY) + '&view=analytics');
  var exchLoc = exch.headers.get('Location') || '';
  ck('an old ?token= bookmark is exchanged for a cookie and redirected',
     exch.status === 302 && /HttpOnly/.test(exch.headers.get('Set-Cookie') || ''),
     'status ' + exch.status);
  ck('...and the redirect it hands back carries NO token — this is what rewrites the '
     + 'bookmark', exchLoc.indexOf('token') < 0 && /view=analytics/.test(exchLoc), exchLoc);

  var exchBody = await exch.text();
  ck('the exchange response itself carries no dashboard content',
     !/<h1>Analytics/.test(exchBody), exchBody.length + ' bytes');

  /* A SECOND request presenting only the token is the case the old plan called "a short
   * window where ?token= keeps working". It does not keep working: it is an exchange, and
   * an exchange is not a page. */
  var second = await get(mod, '?token=' + encodeURIComponent(LEGACY) + '&view=analytics');
  var secondBody = await second.text();
  ck('a request carrying ONLY ?token= never returns analytics content, first time or tenth',
     !/<h1>Analytics/.test(secondBody), 'status ' + second.status);

  /* THE BOOKMARK ITSELF still holds the token after the exchange — only the address bar
   * came out clean. So a request that already HAS a session and still presents the
   * parameter is redirected too; otherwise every later visit serves a whole dashboard at
   * a URL bearing the credential, which is the thing #764 is removing. */
  var signedInWithToken = await get(mod, '?token=' + encodeURIComponent(LEGACY) + '&view=analytics',
    goodCookie);
  var signedInBody = await signedInWithToken.text();
  ck('an already-signed-in request still carrying ?token= is redirected clean, not served',
     signedInWithToken.status === 302 && !/<h1>Analytics/.test(signedInBody)
       && (signedInWithToken.headers.get('Location') || '').indexOf('token') < 0,
     'status ' + signedInWithToken.status + ' -> ' + signedInWithToken.headers.get('Location'));

  var badTok = await get(mod, '?token=not-the-token&view=analytics');
  var badTokBody = await badTok.text();
  ck('a wrong token gets the login form, not a redirect',
     badTok.status === 200 && isLogin(badTokBody), 'status ' + badTok.status);

  /* ------------------------------------------------------------- 5. response headers */
  head('5. the headers every dashboard response carries');

  ck('Cache-Control: no-store on a dashboard page — the bug list is other people’s words',
     (okRes.headers.get('Cache-Control') || '') === 'no-store',
     'analytics view: ' + okRes.headers.get('Cache-Control'));
  ck('Referrer-Policy: no-referrer on a dashboard page',
     (okRes.headers.get('Referrer-Policy') || '') === 'no-referrer',
     'analytics view: ' + okRes.headers.get('Referrer-Policy'));

  var anon = await get(mod, '');
  var anonBody = await anon.text();
  ck('the login page is noindex and carries no dashboard content',
     anon.headers.get('X-Robots-Tag') === 'noindex' && isLogin(anonBody)
       && !/<nav>/.test(anonBody) && !/Bug reports/.test(anonBody),
     'X-Robots-Tag: ' + anon.headers.get('X-Robots-Tag'));

  /* ------------------------------------------------------------- 6. the static scan */
  head('6. no credential survives in an href');

  var offenders = [];
  FILES.forEach(function (f) {
    literals(SRC[f]).forEach(function (lit) {
      if (/token=/.test(lit)) offenders.push(f + ': ' + lit);
    });
  });
  ck('no string literal under worker/src builds a query carrying token=',
     offenders.length === 0, offenders.length ? offenders.join(' | ') : 'scanned ' + FILES.length + ' files');

  var navCode = stripComments(SRC['render.js']);
  ck('nav() takes no credential — its signature is nav(current)',
     /function nav\(current\)/.test(navCode) && !/function nav\(token/.test(navCode), '');

  var dashCode = stripComments(SRC['dashboard.js']);
  ck('the view dispatch passes no token to any page function',
     !/analyticsPage\(env, url, token\)/.test(dashCode)
       && !/sessionDetail\(env, url, token/.test(dashCode)
       && !/featuresAction\(env, url, token/.test(dashCode), '');

  ck('SameSite=Lax is the CSRF protection and is written down as such',
     /SameSite=None/.test(SRC['dashboard.js']) && /NO CSRF NONCE/.test(SRC['dashboard.js']),
     'the header comment names the failure mode a later SameSite=None would create');

  console.log('\n' + BOLD + (nFail === 0 ? GREEN + 'PASS' : RED + 'FAIL') + RST +
    '  ' + nPass + ' passed, ' + nFail + ' failed, ' + (nPass + nFail) + ' checks');
  if (INJECT) {
    var caught = nFail > 0;
    console.log((caught ? GREEN + 'INJECTION CAUGHT' : RED + 'INJECTION MISSED') + RST +
      ' — ' + INJECT + ' reddened ' + nFail + ' check(s); expected ' + INJECTIONS[INJECT].red + '.');
    process.exit(caught ? 0 : 1);
  }
  process.exit(nFail === 0 ? 0 : 1);
})().catch(function (e) {
  console.log(RED + 'run_dashboard_auth: ' + (e && e.stack || e) + RST);
  process.exit(1);
});
