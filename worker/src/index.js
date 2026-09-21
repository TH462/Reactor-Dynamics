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
 *   GET  /dashboard    the ops console — see dashboard.js
 *   POST /dashboard    sign in, sign out, and the one feature-flag write
 *
 * It is gated by a signed session cookie instead of by origin, and is not part of the
 * CORS-fronted API below — it is meant to be opened directly in a browser. The cookie is
 * scoped `Path=/dashboard` precisely so it is never attached to the ingest POST at `/`.
 *
 * ---------------------------------------------------------------- what is NOT stored
 * The client is careful about what it sends. This end has to be equally careful
 * about what it ADDS, because a Worker sees far more than the page does:
 *
 *   - The IP address is used as the rate-limit key and NEVER written anywhere. It
 *     goes into env.LIMITER.limit({key}) and out of scope on the next line.
 *   - The User-Agent IS READ, and is never stored, never passed on, never logged. It
 *     is reduced on the next line to a short list of CLASSES -- a bot kind ('' for
 *     none), and coarse DEVICE / BROWSER / OS labels -- by botClass(), deviceClass(),
 *     browserClass() and osClass() below, and the string itself goes out of scope,
 *     exactly as the IP does. This line used to read "not read", and the change is
 *     deliberate *(OWNER RULING, 2026-09-20: "We should also classify bots."; and "Can
 *     we start to link device to session along with other info like country, etc?")*:
 *     a class label is a fact about the client SOFTWARE, the User-Agent string is a
 *     fingerprinting surface, and only the first is kept. privacy.html already names
 *     "coarse device info (country, device type, browser, OS)" -- see the classifiers'
 *     own header for why that page needs no edit.
 *   - The COUNTRY is taken from the EDGE -- request.cf.country, which Cloudflare has
 *     already derived before this code runs. Deriving it here would mean holding the
 *     address to do it, which is the promise above; taking the ANSWER instead of the
 *     INPUT is what keeps it. privacy.html has disclosed a per-country page-view count
 *     since the RUM beacon went in *(OWNER RULING, 2026-09-20: "We don't need to change
 *     privacy.html. We are just doing what cloudflare already does.")*.
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

// 2 MB is small enough that an open endpoint is not free file hosting. The event batch is
// a few hundred short rows at most.
//
// THE "~504 KB, generous headroom" FIGURE THAT USED TO BE HERE WAS WRONG (#681). Measured
// on PWR2, 4 plant-hours, full stack: 2,939 KB, 143 % of this cap — the report crossed it
// at 2 h 45 min of plant time and every one after that was answered 413. The client now
// rounds the timeseries at build() (646 KB, 32 %) and measures the body it is about to POST
// against its own budget of this number minus 128 KiB, trimming oldest rows if it has to
// (ui/diag_recorder.js, site/telemetry.js). MOVING THIS CONSTANT MOVES THAT BUDGET: it is
// copied verbatim in site/telemetry.js WIRE_CAP and in test/run_diag_bundle.js TR-10.
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
 *   blobs[7]    id                  the event's `id` prop on its own — walkthroughs and
 *                                   missions; '' where the event has none. Redundant with
 *                                   the first part of blobs[4] ON PURPOSE: this SQL has no
 *                                   string-splitting worth relying on, so an exact
 *                                   `count(DISTINCT session) GROUP BY blob8, double9`
 *                                   needs the id in a column of its own. blobs[4] stays
 *                                   the COMPOSITE because that is the part which survives
 *                                   the daily rollup; this column does not.
 *   doubles[0]  seconds
 *   doubles[1]  sim_seconds
 *   doubles[2]  mode                plant_mode only
 *   doubles[3]  beat                mission_abandon only
 *   doubles[4]  t_page              seconds since PAGE LOAD (envelope `e.t`)
 *   doubles[5]  t_session           seconds since the session id was minted (`e.st`)
 *   doubles[6]  blocked             1 the plant refused it, 0 it went through
 *   doubles[7]  errored             1 the command errored, 0 it did not
 *   doubles[8]  step                walkthrough_* only — the 0-based step index
 *   doubles[9]  steps               walkthrough_start / _end only — the leg's length
 *
 *   --- 2026-09-20: what the Cloudflare RUM beacon reports and this stream did not ---
 *   blobs[8]    ref_host            the HOST of the referrer and never the URL, cut by
 *                                   hostOf() below. '' = no referrer, or one that did
 *                                   not survive the cut.
 *   blobs[9]    ref_kind            unknown | direct | internal | external, from rollup.js's
 *                                   referrerKind() — the SAME classifier the
 *                                   Cloudflare-derived series uses, deliberately not a
 *                                   second one. NEVER '' on a row this Worker wrote,
 *                                   which is what makes it the marker described below.
 *                                   `unknown` means the CLIENT DID NOT SEND THE FIELD, and
 *                                   is not the same fact as `direct`, which means the
 *                                   browser reported no referrer. Conflating them would
 *                                   record the whole pre-field site as direct traffic.
 *   blobs[10]   country             two-letter EDGE country. Not a country NAME:
 *                                   traffic_daily stores Cloudflare's `countryName`, so
 *                                   the two series compare by rank, not by string.
 *   blobs[11]   bot_kind            OUR classification, from the User-Agent: crawler |
 *                                   preview | headless | tool | no-ua. '' = no match.
 *   doubles[10] bot                 1 matched, 0 did not. NO -1 sentinel, and the reason
 *                                   is specific rather than an exemption: this Worker
 *                                   can always answer, so -1 would never be written and
 *                                   a query excluding it would exclude nothing.
 *   doubles[11] count               presses in a coalesced run; 1 for a single press.
 *
 *   --- 2026-09-20: coarse DEVICE / BROWSER / OS, derived at this Worker ---------------
 *   blobs[12]   device              OUR classification, from the User-Agent, by
 *                                   deviceClass() below: mobile | tablet | desktop |
 *                                   unknown. NEVER '' — 'unknown' covers an absent
 *                                   User-Agent, and every other case falls to 'desktop'
 *                                   rather than a blank, which is what keeps this column
 *                                   its own predates-the-columns marker (see below).
 *   blobs[13]   browser             OUR classification, by browserClass() below: chrome |
 *                                   edge | firefox | safari | opera | samsung | other |
 *                                   unknown. NEVER ''.
 *   blobs[14]   os                  OUR classification, by osClass() below: windows |
 *                                   macos | ios | android | linux | chromeos | other |
 *                                   unknown. NEVER ''.
 *                                   All three are the CRUDE, User-Agent-substring
 *                                   equivalent of Cloudflare's own `deviceType` /
 *                                   `userAgentBrowser` / `userAgentOS` on the RUM-derived
 *                                   series (rollup.js's `traffic_daily`) — comparable, not
 *                                   interchangeable, same relationship botClass() has to
 *                                   Cloudflare's own bot flag. They ride on EVERY event
 *                                   (not just session_start), so a row can be grouped by
 *                                   device WITHOUT losing the session id beside it —
 *                                   session length by device is answered from THIS raw
 *                                   stream (session_start..session_end per blobs[3]),
 *                                   not from a daily aggregate, which carries no seconds.
 *
 * THE 2026-09-20 COLUMNS CARRY THEIR OWN MARKER, which is better than a clock. A row
 * written before they existed reads back '' for a blob and 0 for a double —
 * indistinguishable from "no referrer, not a bot", and the whole reason COLUMNS_SINCE
 * exists for the 2026-08-10 set. `ref_kind` closes it for blobs[8..11]/doubles[10]: every
 * row this Worker writes carries one of three non-empty strings, so `ref_kind === ''` IS
 * "this row predates the columns", exactly and with no date in it. `device` closes it for
 * blobs[12..14] THE SAME WAY, independently — deliberately not "ref_kind implies device",
 * because the referrer/country/bot code and this device/browser/os code are two separate
 * commits and the Worker could in principle deploy between them, which would populate
 * ref_kind on rows that carry no device at all. rollup.js drops a row unless BOTH markers
 * are present. It ALSO carries a timestamp floor and a probe query (OWN_COLUMNS_SINCE)
 * because naming a column that no matching row carries is a 422 rather than a null — the
 * floor and the probe stop the query FAILING; the markers are what stop it LYING.
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
 *
 * doubles[8]/[9] (2026-09-09, #674) NEED NO `COLUMNS_SINCE` GUARD, and the reason is
 * specific rather than an exemption: 0 is a VALID step index, so the -1 sentinel could
 * not tell a pre-column row from step 0 — but the only events that populate them are
 * `walkthrough_*`, which did not exist before the columns did. Every row carrying that
 * event name necessarily carries the columns. **If a LATER change ever writes double9
 * or double10 from an event that already existed, that reasoning dies with it** and the
 * query needs a since-guard of its own.
 */

/* THE PRINCIPAL STRING for each event — `blobs[4]`, and the ONLY place a walkthrough's
 * step number survives long-term storage.
 *
 * A string value names one prop. An ARRAY names several, joined with ':'. That is not
 * decoration: the daily rollup (rollup.js) keys `usage_daily` on
 * [day, channel, release, event, key_str, plant] and carries NO NUMERIC COLUMNS, while
 * Analytics Engine retention is a fixed three months. So anything that must outlive
 * retention has to ride in this string — which is why a step check-off is keyed
 * `pwr_tmi2_incident:07:overtaken` and the completion rate `pwr_tmi2_incident:complete`, and why
 * time-on-step (a double) is Analytics-Engine-only and says so on the dashboard.
 *
 * A NUMERIC part is zero-padded to two digits so the key sorts in step order rather
 * than lexically (`:09` before `:10`). The longest authored procedure is 18 steps; a
 * 100-step procedure would sort its tail wrong and is the thing to notice, not to
 * pre-solve. */
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
  walkthrough_start: 'id',
  /* `by` RIDES IN THE KEY, and it is here rather than in a column for the reason the whole
   * scheme exists: the instructor's verdict is the direct stuck-signal — `overtaken` means
   * the plant moved past a step the player could no longer satisfy — and a signal that
   * evaporates at the three-month retention edge cannot answer "is this step still doing
   * that". Costs one more `:` part and no extra column. */
  walkthrough_step: ['id', 'step', 'by'],
  walkthrough_rewind: ['id', 'step'],
  walkthrough_end: ['id', 'reason'],
  /* THE WAY IN (#764). Both ride ENTIRELY in this string and claim no new column, which
   * is deliberate rather than thrifty: `usage_daily` keys on
   * [day, channel, release, event, key_str, plant] and carries no numeric columns, so a
   * funnel encoded in doubles would evaporate at the three-month Analytics Engine edge —
   * and "is the click-through rate improving" is a question about months, not weeks.
   *
   * `cta_click`'s three parts give `shell:coarse:xs`, which is the whole question in one
   * groupable string: did a phone press the button that the homepage says is not for
   * phones. Every part is a closed enum on the client, so this key cannot be widened by
   * anything a page sends. */
  page_view: 'page',
  cta_click: ['to', 'device', 'width'],
};

function keyPart(v) {
  if (v == null) return '';
  if (typeof v === 'number' && isFinite(v)) return (v < 0 || v > 99) ? String(v) : ('0' + v).slice(-2);
  return String(v);
}
function keyOf(name, p) {
  const spec = KEY_OF[name];
  if (!spec) return '';
  if (Array.isArray(spec)) return spec.map((f) => keyPart(p[f])).join(':');
  return keyPart(p[spec]);
}

import { handleDashboard } from './dashboard.js';
import { runRollup, referrerKind } from './rollup.js';
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

/* HOST ONLY, ENFORCED HERE (2026-09-20). site/telemetry.js already cuts
 * document.referrer down to its hostname before sending, and that cut is NOT the one the
 * promise rests on: this endpoint is open and unauthenticated by design, so a full URL —
 * path, query and all — can arrive in `ref` whatever the shipped client does. This is the
 * sanitiser that counts, and it is the same shape as the client's on purpose.
 *
 * A hostname cannot contain '/', '?', '#', ':' or a space, so a value carrying one is
 * DROPPED WHOLE rather than trimmed: trimming the path off a URL that arrived here means
 * the path existed in a variable in a file whose next edit might store it. */
function hostOf(v) {
  let s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return '';
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/.exec(s);
  if (m) s = m[1].replace(/^[^@]*@/, '').replace(/:\d+$/, '');
  // 253 = DNS's own hostname limit, so no real host is refused; the bound only stops an
  // absurd value being stored, and the character class beside it is the part that stops
  // a path or a query riding in.
  if (!s || s.length > 253 || !/^[a-z0-9.-]+$/.test(s)) return '';
  return s;
}

/* THE COUNTRY, TAKEN FROM THE EDGE AND NEVER DERIVED HERE. `request.cf.country` is
 * Cloudflare's own answer, computed before this Worker runs; `CF-IPCountry` is the same
 * value as a header and covers `wrangler dev` and any request that arrives with no `cf`
 * object. Either way the ADDRESS is never in a variable in this function, which is the
 * difference between honouring the promise at the top of this file and breaking it for a
 * two-letter string.
 *
 * 'XX' (unknown) and 'T1' (Tor) are real answers and are stored as they come rather than
 * blanked: "we do not know" is a different fact from "we did not look". */
function edgeCountry(request) {
  const cf = request && request.cf;
  const hdr = (request && request.headers && request.headers.get('CF-IPCountry')) || '';
  const v = String((cf && cf.country) || hdr || '').toUpperCase();
  return /^[A-Z0-9]{2}$/.test(v) ? v : '';
}

/* OUR OWN BOT CLASSIFICATION, AND IT IS THE CRUDE ONE *(OWNER RULING, 2026-09-20: "We
 * should also classify bots.")*. Cloudflare Bot Management is not on this plan, and the
 * `bot` flag in traffic_daily comes from the RUM stream, which has signals this has no
 * access to — request fingerprints, address reputation, behavioural scoring. THIS IS A
 * USER-AGENT SUBSTRING MATCH. It is stored in a column of our own and must never be read
 * as the same measurement; where the two disagree, Cloudflare's is the better one.
 *
 * ⚠ A LOW COUNT HERE IS EXPECTED AND IS NOT EVIDENCE THE CLASSIFIER WORKS. This runs on a
 * JS beacon: a client reaches it only by executing JavaScript and then POSTing, and most
 * crawlers do neither. So the honest prior is that this column is nearly all zeros
 * whether the patterns are right or wrong — the exact shape of a check that cannot fail.
 * The only ways to know are to feed it User-Agent strings and assert the class
 * (test/run_telemetry.js does, one per family, plus real browser strings that must NOT
 * match), and after deploy to compare our rate against Cloudflare's bot share on
 * traffic_daily for the same days.
 *
 * ORDER MATTERS. Slackbot, Twitterbot and their kin all contain "bot", so the PREVIEW
 * family is matched before the generic crawler pattern or every link unfurl would be
 * filed as a crawler. An absent User-Agent is 'no-ua' and not '': a browser always sends
 * one, so its absence is a signal, and '' would merge it with "looked and found
 * nothing". */
const BOT_PATTERNS = [
  ['preview', /(facebookexternalhit|slackbot|twitterbot|discordbot|telegrambot|whatsapp|linkedinbot|embedly|skypeuripreview|redditbot|pinterest|vkshare|preview)/],
  ['headless', /(headlesschrome|phantomjs|puppeteer|playwright|selenium|chrome-lighthouse|electron\/)/],
  ['tool', /(curl\/|wget\/|python-requests|python-urllib|libwww-perl|go-http-client|okhttp|axios\/|node-fetch|httpie|postman|guzzle|scrapy|java\/)/],
  ['crawler', /(googlebot|bingbot|yandex|duckduckbot|baiduspider|applebot|ahrefsbot|semrushbot|petalbot|bytespider|gptbot|claudebot|ccbot|perplexitybot|archive\.org_bot|(^|[^a-z])(bot|crawler|spider)([^a-z]|$))/],
];
function botClass(ua) {
  const s = String(ua == null ? '' : ua).toLowerCase();
  if (!s) return 'no-ua';
  for (const row of BOT_PATTERNS) if (row[1].test(s)) return row[0];
  return '';
}

/* OUR OWN DEVICE / BROWSER / OS CLASSIFICATION, AND THEY ARE THE CRUDE ONES, THE SAME
 * WAY botClass() ABOVE IS *(OWNER, 2026-09-20: "Can we start to link device to session
 * along with other info like country, etc?")*. Cloudflare's RUM beacon already reports
 * `deviceType` / `userAgentBrowser` / `userAgentOS` (rollup.js's `traffic_daily`), from
 * signals this Worker does not have — real device metrics, not a substring match. THESE
 * THREE ARE USER-AGENT SUBSTRING MATCHES, nothing more, and must never be read as the
 * same measurement; where the two disagree, Cloudflare's is the better one. The point of
 * having them here at all is that they ride on OUR OWN stream, so a row already carries a
 * session id and a country beside them — which is the one thing the RUM series cannot
 * offer, because it has no shared key with our session data (see the OWNER's question
 * above: mobile is 34% of pageloads and session duration is ours, on two streams that
 * cannot be joined without this).
 *
 * privacy.html already discloses "coarse device info (country, device type, browser,
 * OS)" for the RUM series, so nothing here changes what the page promises — it is the
 * same disclosed dimensions, collected a second, cruder way *(OWNER RULING, 2026-09-20,
 * given for the referrer/country/bot work and verified to apply unchanged here: "We
 * don't need to change privacy.html. We are just doing what cloudflare already does.")*.
 *
 * The User-Agent is READ and reduced to these three labels; it is NEVER STORED — see the
 * file header. */
function deviceClass(ua) {
  const s = String(ua == null ? '' : ua).toLowerCase();
  if (!s) return 'unknown';
  /* iPad FIRST. An iPad that still names itself (an older iPadOS, or "request mobile
   * site") is the one case this function CAN tell apart from a real Mac — iPadOS's
   * DEFAULT "request desktop site" UA claims to be a Mac outright and is indistinguishable
   * from one by substring match; that gap is real and is not fixed by reordering. */
  if (/ipad/.test(s)) return 'tablet';
  /* Android tablets are told apart from Android PHONES by the ABSENCE of "mobile" —
   * Android deliberately encodes the distinction itself, so this has to run before any
   * generic phone pattern would swallow both. */
  if (/android/.test(s)) return /mobile/.test(s) ? 'mobile' : 'tablet';
  if (/iphone|ipod/.test(s)) return 'mobile';
  // Other tablets that name themselves explicitly.
  if (/tablet|kindle|silk|playbook/.test(s)) return 'tablet';
  // Other handhelds that name themselves, or the generic "Mobi" token a browser uses
  // when "Mobile" is absent (Opera Mini, some Windows Phone builds).
  if (/mobi|windows phone|blackberry|bb10|iemobile|opera mini/.test(s)) return 'mobile';
  return 'desktop';
}
const BROWSER_PATTERNS = [
  // Edge, Opera and Samsung Internet are all Chromium — their UA carries "Chrome" AND
  // "Safari" too — so each must be matched before the generic chrome/safari checks below
  // or it is misread as the engine it is built on. `edg` alone catches Edg/ (desktop),
  // Edge/ (legacy EdgeHTML), EdgA/ (Android) and EdgiOS/ (iOS) in one pattern.
  ['edge', /edg/],
  ['opera', /(opr\/|opera)/],
  ['samsung', /samsungbrowser/],
  // Firefox never carries "Safari" in its UA, so its position relative to the checks
  // below is not load-bearing — kept here anyway, beside the other named engines.
  ['firefox', /(firefox|fxios)/],
  // Chrome (incl. crios, Chrome on iOS) also carries "Safari" — must be checked AFTER
  // the four browsers above, which all carry "Chrome" too, and BEFORE the generic
  // Safari check below, which Chrome's own UA would otherwise satisfy.
  ['chrome', /(chrome|chromium|crios)/],
  // Real Safari LAST: every Chromium-family browser above also carries "Safari" in its
  // UA, so this only ever matches once none of them did.
  ['safari', /safari/],
];
function browserClass(ua) {
  const s = String(ua == null ? '' : ua).toLowerCase();
  if (!s) return 'unknown';
  for (const row of BROWSER_PATTERNS) if (row[1].test(s)) return row[0];
  return 'other';
}
function osClass(ua) {
  const s = String(ua == null ? '' : ua).toLowerCase();
  if (!s) return 'unknown';
  // iOS FIRST: an iPhone/iPad UA also carries "like Mac OS X", which the macOS check
  // below would otherwise claim.
  if (/iphone|ipad|ipod/.test(s)) return 'ios';
  // Android FIRST (ahead of Linux): every Android UA also carries the "Linux" token
  // that names the kernel underneath it.
  if (/android/.test(s)) return 'android';
  // ChromeOS FIRST (ahead of Linux, same reason): its UA opens "X11; CrOS ...".
  if (/cros/.test(s)) return 'chromeos';
  if (/windows/.test(s)) return 'windows';
  if (/macintosh|mac os x/.test(s)) return 'macos';
  if (/linux|x11/.test(s)) return 'linux';
  return 'other';
}

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

    /* The dashboard, and the writes it owns. Authentication is INSIDE handleDashboard
     * (a signed cookie since #764), and this stays a SINGLE route on purpose: sign-in and
     * sign-out are POSTs to this same path carrying an `action` field. A `/dashboard/login`
     * route would have to be added here, to the cookie's Path, and to the CORS boundary
     * below — every POST that is not this one falls through into the ingest handler. */
    if (url.pathname === '/dashboard' && (request.method === 'GET' || request.method === 'POST')) {
      return handleDashboard(env, url, request);
    }

    /* The site BUILD reads this to stamp flag stages. Open and unauthenticated on
     * purpose: a stage is not a secret — every one of them ships inside site/flags.js
     * to every visitor — so gating it would protect nothing while forcing a token into
     * the Pages build environment. Writing stays behind the dashboard session. */
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

  /* THE EDGE FACTS (2026-09-20). Computed ONCE per batch rather than per event: the
   * country and the User-Agent are properties of the REQUEST, and the referrer is a
   * property of the page load the batch came from, so a per-event copy would be the same
   * value repeated with somewhere new to drift.
   *
   * `origin` is already checked against ALLOWED_ORIGINS above, so it is the SITE's host.
   * The Worker's OWN hostname is not the site's, and handing that to referrerKind() would
   * file every internal hop as external — the exact error the `traffic_daily` series was
   * built to stop making. */
  /* A CLIENT THAT NEVER SENDS `ref` IS NOT A DIRECT VISIT, and conflating the two writes a
   * WRONG number rather than a missing one -- unrecoverable, because nothing downstream can
   * tell the rows apart afterwards. `hostOf(undefined)` is '' and `referrerKind('')` is
   * 'direct', so without this the entire live site -- which does not carry the field until
   * site/telemetry.js ships -- would record as 100 % direct, and every referral we ever had
   * would read as someone typing the URL.
   *
   * ABSENT and EMPTY are different facts and get different values:
   *   field absent      -> 'unknown'  the client predates the field (or is not ours)
   *   field present, '' -> 'direct'   the browser reported no referrer, which IS the answer
   * `fetchOwnTraffic` keeps 'unknown' rows and they stay countable as page views; what they
   * must never do is inflate 'direct'. Delete this and the damage is silent. */
  const refSent = Object.prototype.hasOwnProperty.call(payload, 'ref');
  const refHost = hostOf(payload.ref);
  const refKind = refSent ? referrerKind(refHost, hostOf(origin)) : 'unknown';
  const country = edgeCountry(request);
  const botKind = botClass(request.headers.get('User-Agent'));
  /* The 2026-09-20(+) device/browser/OS trio — see deviceClass()/browserClass()/
   * osClass() above for the ordering and why each matters. Same batch-once reasoning as
   * botKind just above: the User-Agent is a property of the request, not the event. */
  const deviceKind = deviceClass(request.headers.get('User-Agent'));
  const browserKind = browserClass(request.headers.get('User-Agent'));
  const osKind = osClass(request.headers.get('User-Agent'));

  let written = 0;
  for (const e of events.slice(0, MAX_EVENTS_PER_BATCH)) {
    const name = String((e && e.e) || '');
    if (!Object.prototype.hasOwnProperty.call(KEY_OF, name)) continue;   // unknown = dropped
    const p = (e && e.p) || {};

    env.EVENTS.writeDataPoint({
      indexes: [name],
      blobs: [
        name,
        channel,
        release,
        session,
        keyOf(name, p),
        String(p.plant || ''),
        // block_code: SLOT RESERVED, nothing populates it yet. Written as a literal
        // rather than read from `p` so that the schema, this receiver and privacy.html
        // all describe exactly what is collected TODAY — a column reading a prop no
        // event declares is the same drift `blocked` already demonstrated. The slot is
        // claimed here because claiming it later is what risks a collision.
        '',
        // The `id` prop ALONE (#674) — see the column map for why it is duplicated out of
        // blob5. Events with no `id` write '', which is not a value any query groups on.
        String(p.id || ''),
        /* The 2026-09-20 edge columns. Constant across the batch, and written on EVERY
         * row for the reason the 2026-08-10 set is: a short row reads back as '' and
         * would say "no referrer, unknown country" where the truth is "this Worker could
         * not tell you". `refKind` is never '' here, which is what makes a '' downstream
         * mean "written before these columns existed". */
        refHost,
        refKind,
        country,
        botKind,
        /* The 2026-09-20(+) device/browser/OS trio. Also constant across the batch and
         * also written on EVERY row — see deviceClass() above for why NONE of the three
         * is ever '', which is what makes `device` its own predates-the-columns marker,
         * independent of ref_kind (rollup.js's column-map comment explains why that
         * independence matters here specifically). */
        deviceKind,
        browserKind,
        osKind,
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
        // The walkthrough columns (#674). They are also encoded in blob5 so the funnel
        // survives the rollup; these exist so a query can GROUP BY a NUMBER instead of
        // parsing a string in a SQL dialect with no subqueries (cfapi.js).
        num(p.step),
        num(p.steps),
        // OUR bot verdict, not Cloudflare's — see botClass(). No -1: this Worker can
        // always answer, so the sentinel would never be written.
        botKind ? 1 : 0,
        /* HOW MANY PRESSES a coalesced run of repeats took (2026-09-20). The client
         * collapses repeats of the same command inside 250 ms into ONE event so that a
         * held arrow and a single click are comparable -- but these controls are NUMBER
         * BOXES, not sliders, so the press count is a measure of USER EFFORT and not a
         * pointer artifact. "It took 18 presses to reach the setpoint" is a usability
         * finding; without this column the collapse would destroy it. Always >= 1 on a
         * command, so no -1 sentinel is needed. */
        num(p.count),
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
