/* run_telemetry.js — the invariants of the usage-data client.
 *
 *   node test/run_telemetry.js
 *
 * WHY THIS EXISTS. site/telemetry.js is the first code in this project that sends
 * anything anywhere. Everything else runs entirely on the player's machine, and
 * privacy.html says so in as many words. So the rules it follows are not style
 * preferences to be re-derived by the next person to touch the file — they are the
 * difference between analytics and surveillance, and each one is cheap to break by
 * accident: a queue that outlives a refused prompt, an event name typed straight
 * into `event()`, a `note` field that finds its way onto the automatic path.
 *
 * The gate drives the real module with a fake browser rather than reading the source,
 * because every one of these invariants is about BEHAVIOUR. A grep for
 * `localStorage` proves nothing about whether an undecided visitor is silent.
 *
 * WHAT IT DOES NOT COVER. Whether the server keeps what it is sent, how long, or
 * who can read it. That is the Worker's contract and it is not in this repo yet.
 * Nothing here should be read as a claim about it.
 */
'use strict';
var path = require('path');
var ROOT = path.join(__dirname, '..');
var G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

var pass = 0, fail = 0, failures = [];
function ck(name, ok, detail) {
  if (ok) { pass++; return; }
  fail++; failures.push({ name: name, detail: detail || '' });
}

// ------------------------------------------------------------------ injections
/* Each is a real defect this runner claims to catch, applied to the SOURCE before it is
 * loaded or read — "the check can go red" is then a command anyone can re-run rather than
 * a sentence in a report:
 *
 *   node test/run_telemetry.js --list-injections
 *   node test/run_telemetry.js --inject=wk-country-from-ip
 *
 * `[file, anchor, replacement]`, and THE ANCHOR MUST BE A SINGLE PHYSICAL LINE. This tree
 * holds both endings — site/telemetry.js and worker/src/index.js are CRLF, worker/src/
 * rollup.js is LF — so an anchor with an embedded \n matches nothing in the CRLF files
 * and the injection silently never fires, which is worse than no injection. */
var ARG = process.argv.slice(2).join(' ');
var INJECT = (/--inject=([\w-]+)/.exec(ARG) || [])[1] || null;
var INJECTIONS = {
  /* --- the client half: a HOST and never a URL --------------------------------- */
  // The whole referrer on the wire, path and query included — a search page's query
  // string is the visitor's own words, and this is the one that matters.
  /* THE CONFLATION (2026-09-20). Reverts absent-vs-empty to the single `referrerKind()`
   * call: a client that never sent the field is then recorded as a DIRECT VISIT. It is the
   * shape of defect this whole page keeps producing -- not a missing number, a confident
   * wrong one, and unrecoverable once written because no later query can separate those
   * rows from real direct traffic. The live site does not send `ref` until
   * site/telemetry.js ships, so this would have been EVERY row until then. */
  'wk-ref-absent-reads-direct': ['worker/src/index.js',
    "  const refKind = refSent ? referrerKind(refHost, hostOf(origin)) : 'unknown';",
    '  const refKind = referrerKind(refHost, hostOf(origin));'],
  'tel-ref-is-full-url': ['site/telemetry.js',
    '      ref: refHost(),', "      ref: (G.document && G.document.referrer) || '',"],
  // The field simply not sent: the stream goes back to knowing nothing about arrivals.
  'tel-ref-absent': ['site/telemetry.js', '      ref: refHost(),', ''],
  // The final shape test removed. An IPv6 literal host comes back as '[::1]', which is
  // not host-shaped and is the evidence that the test is doing work rather than sitting
  // downstream of a parser that already cleaned everything.
  'tel-ref-shape-test-gone': ['site/telemetry.js',
    "    if (!h || h.length > 253 || !/^[a-z0-9.-]+$/.test(h)) return '';", "    if (!h) return '';"],
  // The no-URL fallback stops stripping userinfo and the port, so credentials in a
  // referrer would reach the shape test instead of being cut before it.
  'tel-ref-fallback-keeps-userinfo': ['site/telemetry.js',
    "      h = m ? String(m[1]).replace(/^[^@]*@/, '').replace(/:\\d+$/, '') : '';",
    "      h = m ? String(m[1]) : '';"],

  /* --- the Worker half ---------------------------------------------------------- */
  // The receiver trusting the client's `ref`. The shipped client sends a host; anything
  // at all can POST here, so this is the sanitiser the promise actually rests on.
  'wk-ref-unsanitised': ['worker/src/index.js',
    '  const refHost = hostOf(payload.ref);', "  const refHost = String(payload.ref || '');"],
  // A SECOND classifier instead of the one the Cloudflare-derived series uses: every
  // internal hop then files as discovery, which is the error traffic_daily exists to
  // stop making.
  'wk-ref-kind-invented': ['worker/src/index.js',
    "  const refKind = refSent ? referrerKind(refHost, hostOf(origin)) : 'unknown';",
    "  const refKind = refHost ? 'external' : 'direct';"],
  // The country never recorded.
  'wk-country-dropped': ['worker/src/index.js',
    '  const country = edgeCountry(request);', "  const country = '';"],
  // THE PROMISE BREAKER: the country derived here from the visitor's address instead of
  // taken from the edge, which puts the IP in a variable in the write path.
  'wk-country-from-ip': ['worker/src/index.js',
    '  const cf = request && request.cf;',
    "  const cf = { country: String(request.headers.get('CF-Connecting-IP') || '').slice(0, 2) };"],
  // Nothing is ever a bot.
  'wk-bot-never-classified': ['worker/src/index.js',
    "  if (!s) return 'no-ua';", "  return '';"],
  // The preview family dropped, so every Slack and Twitter link unfurl is filed as a
  // crawler — the generic pattern below it matches the "bot" in their names.
  'wk-preview-family-dropped': ['worker/src/index.js',
    "  ['preview', /(facebookexternalhit|slackbot|twitterbot|discordbot|telegrambot|whatsapp|linkedinbot|embedly|skypeuripreview|redditbot|pinterest|vkshare|preview)/],", ''],
  // The verdict computed and then not written.
  'wk-bot-column-dropped': ['worker/src/index.js', '        botKind ? 1 : 0,', ''],
  // A blob REMOVED rather than appended: every column after it shifts one slot and every
  // historical row is silently reinterpreted. This is the failure the column map's
  // append-only rule exists for, and it produces no error anywhere.
  'wk-blob-slot-shifted': ['worker/src/index.js', '        refHost,', ''],

  /* --- device / browser / OS (2026-09-20+2): the ORDERING traps named in the task ---- */
  // Android tablets are told apart from phones by the ABSENCE of "mobile" — dropping the
  // conditional files every Android tablet as a phone.
  'wk-device-android-tablet-swallowed': ['worker/src/index.js',
    "  if (/android/.test(s)) return /mobile/.test(s) ? 'mobile' : 'tablet';",
    "  if (/android/.test(s)) return 'mobile';"],
  // An iPad that still names itself falls through to the DESKTOP default once this is
  // gone — the one case this classifier can tell apart from a real Mac, lost.
  'wk-device-ipad-swallowed': ['worker/src/index.js',
    "  if (/ipad/.test(s)) return 'tablet';", ''],
  // Edge's UA carries "Chrome" AND "Safari" — dropping its own check first files every
  // Edge visit as Chrome, the engine it happens to be built on.
  'wk-browser-edge-swallowed-by-chrome': ['worker/src/index.js',
    "  ['edge', /edg/],", ''],
  // Chrome's UA carries "Safari" too — dropping Chrome's own check files every Chrome
  // visit as Safari, which is exactly the ordering trap the task named directly.
  'wk-browser-chrome-swallowed-by-safari': ['worker/src/index.js',
    "  ['chrome', /(chrome|chromium|crios)/],", ''],
  // An iPhone/iPad UA also carries "like Mac OS X" — dropping the iOS check first files
  // every iOS visit as macOS.
  'wk-os-ios-swallowed-by-macos': ['worker/src/index.js',
    "  if (/iphone|ipad|ipod/.test(s)) return 'ios';", ''],
  // Every Android UA also carries the "Linux" token naming its kernel — dropping the
  // Android check first files every Android visit as Linux.
  'wk-os-android-swallowed-by-linux': ['worker/src/index.js',
    "  if (/android/.test(s)) return 'android';", ''],
  // ChromeOS's UA opens "X11; CrOS ..." — dropping its own check first files every
  // ChromeOS visit as Linux.
  'wk-os-cros-swallowed-by-linux': ['worker/src/index.js',
    "  if (/cros/.test(s)) return 'chromeos';", ''],
  // ABSENT, on all three: hits every `if (!s) return 'unknown';` in this file at once,
  // since the three classifiers share the exact same guard line — a real fact about this
  // source, not a loosely-aimed injection. 'unknown' is the marker an absent User-Agent
  // is supposed to carry; '' would merge it with "looked and found nothing".
  'wk-device-browser-os-absent-not-unknown': ['worker/src/index.js',
    "  if (!s) return 'unknown';", "  if (!s) return '';"],
  // The verdicts computed and then not written — the append-only column map's failure
  // shape, once each, for the three new slots.
  'wk-device-column-dropped': ['worker/src/index.js', '        deviceKind,', ''],
  'wk-browser-column-dropped': ['worker/src/index.js', '        browserKind,', ''],
  'wk-os-column-dropped': ['worker/src/index.js', '        osKind,', ''],

  /* --- command-run coalescing (2026-09-20+3) ------------------------------------ */
  // The window check disabled: every repeat starts a new run instead of extending one,
  // so a drag/hold never collapses and the queue fills one row per tick again.
  'tel-coalesce-never-collapses': ['site/telemetry.js',
    '      if (openRun && openRun.key === key && (perfMs - openRun.raw) <= COALESCE_MS) {',
    '      if (false) {'],
  // The run's identity key ignores its own props, so a DIFFERENT action or a DIFFERENT
  // `blocked` wrongly extends the same run — hiding a refused command inside a run of
  // accepted ones, the exact failure the task calls out by name.
  'tel-coalesce-key-ignores-props': ['site/telemetry.js',
    "    for (k in p) { if (Object.prototype.hasOwnProperty.call(p, k) && k !== 'count') ks.push(k); }",
    '    for (k in p) { if (false) ks.push(k); }'],
  // The count freezes at 1: a run of any length reports as a single press.
  'tel-coalesce-count-frozen': ['site/telemetry.js',
    '        openRun.row.p.count = ++openRun.count;', '        openRun.row.p.count = openRun.count;'],
  // The open run is NOT cleared on opt-out, so it is left pointing at a row `queue.length
  // = 0` just detached — a later repeat mutates that orphan instead of starting a fresh,
  // correctly-counted run, and the repeat is silently lost.
  'tel-coalesce-survives-optout': ['site/telemetry.js',
    "    if (v === 'denied') { queue.length = 0; openRun = null; }",
    "    if (v === 'denied') { queue.length = 0; }"],
  // Same failure, at the OTHER place a queue is emptied: a normal batch flush leaves
  // the open run pointing at a row that just left the queue via splice().
  'tel-coalesce-survives-flush': ['site/telemetry.js', '    openRun = null;', ''],

  /* --- ui/app.js: state-derived milestones (2026-09-20+4) ------------------------------
   * #on_grid-is-an-IC: a state TEST ("mwe_output > 0") fires on the first tick of any
   * initial condition that already has the generator on line, recording the IC as an
   * accomplishment. The fix is transition-based: `stateMilestone` requires the condition
   * to have been observed FALSE at some point in the session before a TRUE reaches the
   * one-shot `milestone()` latch. Each injection below reverts ONE piece of that back to
   * a shape this runner has actually reproduced by inverting it. */
  // THE ORIGINAL DEFECT, at the call site: back to a bare state test.
  'tel-ongrid-state-test': ['ui/app.js',
    "        if (typeof ts.mwe_output === 'number') this.stateMilestone('on_grid', ts.mwe_output > 0, t);",
    "        if (typeof ts.mwe_output === 'number' && ts.mwe_output > 0) this.milestone('on_grid', t);"],
  // The mechanism itself ignores whether the condition was ever seen false — an IC that
  // starts true fires immediately, same defect, one layer lower.
  'tel-statemilestone-ic-fires': ['ui/app.js',
    '          if (falseSeen[name]) this.milestone(name, simT);',
    '          this.milestone(name, simT);'],
  // The condition is never recorded as having gone false, so it can NEVER transition —
  // a player who starts off the grid and then generates would get no on_grid, ever.
  'tel-falseseen-never-set': ['ui/app.js',
    '        if (!falseSeen[name]) {',
    '        if (false) {'],
  // Recorded in memory only: a reload loses the fact that the condition was ever seen
  // false, so a legitimate transition spanning a reload is silently dropped.
  'tel-falseseen-not-persisted': ['ui/app.js',
    '          ssSet(FALSE_KEY, JSON.stringify(falseSeen));   // survives a reload; see FALSE_KEY above',
    '          /* not persisted */'],
  // The one-shot latch disabled: the SAME milestone fires again on every later tick (and
  // again after a reload, under the unchanged session id) instead of once per session.
  'tel-seen-latch-disabled': ['ui/app.js',
    '        if (seen[name]) return;                   // latched: first crossing only',
    '        if (false) return;'],

  /* --- ui/app.js: the plant_mode FUNNEL's own baseline (2026-09-20+5) -------------------
   * #plant_mode-baseline-counted-as-progress: `lastMode` starts null, so the FIRST mode a
   * session ever observes always "differs" from it and fired — recording where a session
   * STARTED as a mode it REACHED. Measured 2026-09-20: mode-1 read 69 sessions and 69
   * sessions started at hot_full_power; mode-5 read 24 and 21 started at cold_shutdown —
   * most of both numbers was starting state, not progress. `modeWasKnown` suppresses only
   * that first emission; every later transition, including one this session has already
   * visited, still fires exactly as before. */
  // THE ORIGINAL DEFECT: fire unconditionally, baseline included.
  'tel-plantmode-fires-on-first': ['ui/app.js',
    "          if (modeWasKnown) ev('plant_mode', { mode: ts.plant_mode, sim_seconds: Math.round(t) });",
    "          ev('plant_mode', { mode: ts.plant_mode, sim_seconds: Math.round(t) });"],
  // The mechanism INVERTED: fires ONLY on the baseline and suppresses every real
  // transition afterwards — a plausible off-by-one on the same null check.
  'tel-modeknown-inverted': ['ui/app.js',
    "          var modeWasKnown = lastMode !== null;     // false only for this session's FIRST mode",
    "          var modeWasKnown = lastMode === null;     // false only for this session's FIRST mode"],
  // The baseline mode never persisted: a real page reload re-inits `lastMode` to null, so
  // the NEXT genuine transition is wrongly treated as a fresh baseline and lost rather
  // than reported.
  'tel-lastmode-not-persisted': ['ui/app.js',
    '          ssSet(MODE_KEY, String(lastMode));        // same reason as SEEN_KEY: survive a reload',
    '          /* not persisted */'],

  /* --- the rate limiter, split in two (#797) ------------------------------------------ */
  // THE ORIGINAL DEFECT: both routes drawing on the SAME budget. A bug-report upload and
  // an events flood would then throttle each other, which is exactly what the split
  // exists to stop.
  'wk-limiters-share-one-budget': ['worker/src/index.js',
    '    const limiter = isBundle ? env.BUNDLE_LIMITER : env.LIMITER;',
    '    const limiter = env.LIMITER;'],
  // The refusal recorded nowhere: a 429 goes back to the client exactly as before, but
  // nothing durable notices it happened — the invisibility the whole feature exists to fix.
  'wk-throttle-not-recorded': ['worker/src/index.js',
    "        recordThrottle(env, isBundle ? 'bundle' : 'events');", ''],
  // THE PROMISE BREAKER, at the one call site that could carry the address into a written
  // row: appending it to the route label is a plausible "make it more specific" edit, and
  // it would put the IP in Analytics Engine for three months.
  'wk-throttle-leaks-ip': ['worker/src/index.js',
    "        recordThrottle(env, isBundle ? 'bundle' : 'events');",
    "        recordThrottle(env, (isBundle ? 'bundle' : 'events') + ':' + ip);"],
  // The dashboard line shown even at zero — the "0 requests rate-limited" drift the
  // function's own header warns against: a routine-looking line where `.warn` belongs.
  'wk-throttle-line-shown-at-zero': ['worker/src/analytics.js',
    '  if (!throttled) return \'\';', ''],
  // `.warn` dropped: a non-zero count would render, but as neutral text indistinguishable
  // from every other line on the page — the one thing the task called out by name.
  'wk-throttle-line-not-warn': ['worker/src/analytics.js',
    "  return '<p class=\"warn\"><b>' + throttled + '</b> request'",
    "  return '<p><b>' + throttled + '</b> request'"],
};

if (/--list-injections/.test(ARG)) {
  Object.keys(INJECTIONS).forEach(function (k) { console.log(k); });
  process.exit(0);
}

/* Read a repo file with the active injection applied. Used for the two files the
 * injections target; every other read in this runner is a plain readFileSync, which is
 * correct — an injection that no check reads would report CAUGHT on someone else's. */
function readSrc(rel) {
  var src = require('fs').readFileSync(path.join(ROOT, rel), 'utf8');
  if (!INJECT) return src;
  var spec = INJECTIONS[INJECT];
  if (!spec) throw new Error('unknown injection: ' + INJECT);
  if (spec[0] !== rel) return src;
  if (src.indexOf(spec[1]) < 0) {
    throw new Error('injection "' + INJECT + '" did not match its anchor in ' + rel
      + ' — the source moved and the injection is blind, which is worse than no injection');
  }
  return src.split(spec[1]).join(spec[2]);
}

/* ------------------------------------------------------- loading the Worker's ES modules
 * The idiom from run_dashboard_auth.js/run_dashboard_trend.js/run_rollup.js: there is no
 * package.json declaring module type (the repo root is gated against gaining one), so a
 * `data:` URL carries each module and the graph is resolved BOTTOM-UP — a dependency is
 * built before the specifier that names it is rewritten to point at the built copy.
 * Reads through readSrc(), so an active --inject= targeting 'worker/src/index.js' still
 * reaches the module actually imported and executed here. */
function loadWorkerEsm(entry, stubs) {
  var built = {};
  function build(rel) {
    if (built[rel]) return built[rel];
    var src = (stubs && Object.prototype.hasOwnProperty.call(stubs, rel))
      ? stubs[rel]
      : readSrc('worker/src/' + rel);
    src = src.replace(/from\s+'\.\/([\w.]+\.js)'/g, function (_, dep) {
      return "from '" + build(dep) + "'";
    });
    built[rel] = 'data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64');
    return built[rel];
  }
  return import(build(entry));
}
// A stub for cfapi.js's whole export surface (every name any worker/src module imports
// from it) that never makes a real network call. Every route this runner drives (events,
// bundle) never reaches analytics.js/usage.js/sessions.js/rollup.js's actual functions —
// they only need to IMPORT successfully, which is all this proves.
function fakeCfapiForWorker() {
  return "export const DATASET = 'reactor_dynamics_usage';\n"
    + "export const ACCOUNT = 'acct'; export const SITE_TAG = 'tag';\n"
    + "export const COLUMNS_SINCE_TS = '2026-08-11 02:54:00';\n"
    + "export const COLUMNS_SINCE = \"toDateTime('2026-08-11 02:54:00')\";\n"
    + "export const sql = () => Promise.reject(new Error('run_telemetry: unexpected sql() call'));\n"
    + "export const gql = () => Promise.reject(new Error('run_telemetry: unexpected gql() call'));\n";
}

// ------------------------------------------------------------------ fake browser
// Minimal, and deliberately hand-written: a real DOM library would bring behaviours
// this module must work WITHOUT (storage that throws, no sendBeacon, no fetch).
function mkStore() {
  var m = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    _all: m,
  };
}

// Captured once, before any test blanks it, so a later load() can put it back.
var CS = globalThis.CompressionStream;

function load(opts) {
  opts = opts || {};
  delete require.cache[require.resolve(path.join(ROOT, 'site', 'telemetry.js'))];
  var sent = [];
  var g = globalThis;
  g.RD = {};
  g.localStorage = opts.noStorage ? null : mkStore();
  g.sessionStorage = opts.noStorage ? null : mkStore();
  g.RD_TELEMETRY_ENDPOINT = ('endpoint' in opts) ? opts.endpoint : 'https://example.invalid/t';
  g.RD_RELEASE = 'Alpha 1.3.0';
  g.RD_CHANNEL = 'public';
  g.setTimeout = function () { return 1; };
  g.clearTimeout = function () {};
  g.fetch = function (url, init) {
    sent.push({ via: 'fetch', url: url, body: init && init.body, headers: (init && init.headers) || {} });
    // THE NETWORK-LEVEL FAILURE (#682). A dropped connection, an offline machine, DNS, CORS:
    // `fetch` REJECTS rather than answering, and until sendBundle grew a terminal `.catch`
    // that resolved neither branch of the caller's `.then` — the feedback form sat on
    // "Sending…" with Send disabled for the life of the page. This is that, exactly.
    if (opts.networkFails) return Promise.reject(new TypeError('Failed to fetch'));
    // The real Worker answers the bundle route with `{ok:true, id}` and 204-with-no-body on
    // the event route. `bodyless` drops `json` entirely, which is what an opaque response
    // looks like — sendBundle must survive that rather than reject (#431).
    if (opts.bodyless) return Promise.resolve({ ok: true, status: 200 });
    return Promise.resolve({
      ok: true, status: 200,
      json: function () { return Promise.resolve({ ok: true, id: 'msmiercb-46iji16v' }); }
    });
  };
  // Node ships CompressionStream, so the gzip path is the DEFAULT here — which is
  // what a modern browser does too. `noCompression` exercises the fallback an older
  // one takes; both must reach the server with the same content.
  // Restore from the CAPTURED value, not from the current global — an earlier
  // noCompression load has already blanked it, so testing `g.CompressionStream`
  // here leaves it blanked for every later case and silently tests one path twice.
  if (opts.noCompression) {
    Object.defineProperty(g, 'CompressionStream', { value: undefined, writable: true, configurable: true });
  } else if (CS) {
    Object.defineProperty(g, 'CompressionStream', { value: CS, writable: true, configurable: true });
  }
  // Node 24 defines `navigator` and `performance` on globalThis as GETTER-ONLY, so a
  // plain assignment throws. defineProperty is the way to stub a real browser global
  // that the runtime has already claimed.
  function stub(name, value) {
    Object.defineProperty(g, name, { value: value, writable: true, configurable: true });
  }
  stub('performance', { now: function () { return 1000; } });
  stub('navigator', { sendBeacon: function (url, body) { sent.push({ via: 'beacon', url: url, body: body }); return true; } });
  /* A REFERRER NEEDS A `document`, and the module reads it at FLUSH time rather than at
   * load, so a case can set one. Defined only when a case asks: the auto-init at the foot
   * of telemetry.js is guarded by a one-shot global that this process's FIRST load has
   * already consumed, so a document here cannot start wiring listeners — but leaving it
   * undefined by default keeps every other suite exactly as it was. */
  stub('document', ('referrer' in opts)
    ? { referrer: opts.referrer, addEventListener: function () {}, readyState: 'complete', visibilityState: 'visible' }
    : undefined);
  // THE REAL RECORDER, not a stub (#681). sendBundle's byte backstop calls
  // RD.DiagRecorder.trimOldest through a soft global lookup, which is exactly how the
  // control room wires it (ui/shell.html loads diag_recorder.js before app.js). A fake trim
  // here would gate the loop and not the wiring, and the wiring is the half that has been
  // wrong before.
  if (opts.withRecorder) {
    delete require.cache[require.resolve(path.join(ROOT, 'ui', 'diag_recorder.js'))];
    require(path.join(ROOT, 'ui', 'diag_recorder.js'));
  }
  /* The injected load goes through `vm` rather than `require`, because require() reads
   * the file itself and there is nowhere to patch it. telemetry.js is a plain
   * global-namespace IIFE with no module references (CLAUDE.md, "Code conventions"), so
   * running its source in this context attaches RD.Telemetry exactly as require does.
   * The uninjected path is left on require() so an ordinary run is unchanged. */
  if (INJECT && INJECTIONS[INJECT] && INJECTIONS[INJECT][0] === 'site/telemetry.js') {
    require('vm').runInThisContext(readSrc('site/telemetry.js'),
      { filename: path.join(ROOT, 'site', 'telemetry.js') });
  } else {
    require(path.join(ROOT, 'site', 'telemetry.js'));
  }
  return { T: g.RD.Telemetry, sent: sent };
}

// ------------------------------------------------------------------ TEL (ui/app.js)
/* TEL is not a module — it is a local `var` inside the giant closure ui/app.js attaches to
 * globalThis.RD.UI, and nothing in Node can execute that file whole (see the "ui/app.js must
 * actually USE it" comment lower down, which is why THAT check is a source scan). TEL's own
 * `tick`/`milestone`/`stateMilestone` methods are self-contained, though: everything they
 * touch (`seen`, `falseSeen`, `lastMode`, `ssGet`, `ssSet`, `ev`, `api`) is declared inside
 * the TEL IIFE itself, and `api()` reaches out only through the bare identifiers `window`
 * and `RD`. Extracting the IIFE's own source and running it against a stubbed `window`/`RD`
 * therefore exercises the REAL code — the same trick site/telemetry.js's injected loads
 * already use via vm.runInThisContext, above.
 *
 * THE ANCHORS ARE SINGLE PHYSICAL LINES, grep-verified as the only lines in the file
 * matching them. Either one moving throws rather than silently extracting nothing. */
var TEL_START = '  var TEL = (function () {';
var TEL_END = '  }());';
function extractTEL(src) {
  var i = src.indexOf(TEL_START);
  if (i < 0) throw new Error('TEL start anchor not found in ui/app.js — the source moved');
  var j = src.indexOf(TEL_END, i);
  if (j < 0) throw new Error('TEL end anchor not found in ui/app.js — the source moved');
  // Assigns a global property instead of declaring `var TEL`, so nothing here can collide
  // with — or be shadowed by — an unrelated global named TEL.
  return src.slice(i, j + TEL_END.length).replace('var TEL', 'global.__TEL__');
}

// Builds a fresh TEL against its own sessionStorage (a new browser TAB) and a fake
// RD.Telemetry that just records what was accepted. `opts.storage` reuses a PRIOR mkStore()
// to simulate a RELOAD of the SAME tab: real sessionStorage survives a reload, so passing
// the same store back in is what "reload" means here — TEL itself is rebuilt from scratch,
// exactly like the page re-running this IIFE, but the storage under it is the same object.
function loadTEL(opts) {
  opts = opts || {};
  var events = [];
  var granted = opts.granted !== false;
  global.window = global;                     // window === globalThis, as it is in a browser
  // Same shape as telemetry.js's own `noStorage` case: `window.sessionStorage.getItem`
  // throws on a null store, and ssGet's own try/catch is what is under test there.
  global.sessionStorage = opts.noStorage ? null : (opts.storage || mkStore());
  global.RD = { Telemetry: {
    granted: function () { return granted; },
    event: function (name, props) { events.push({ name: name, props: props }); return true; },
  } };
  require('vm').runInThisContext(extractTEL(readSrc('ui/app.js')),
    { filename: path.join(ROOT, 'ui', 'app.js') });
  var TEL = global.__TEL__;
  delete global.__TEL__;
  return { TEL: TEL, events: events, storage: global.sessionStorage };
}
// A snapshot shaped like what TEL.tick reads: `s.true_state.mwe_output`/`.fuel_damaged`/
// `.plant_mode` and `s.metadata.sim_time`. `mode` is left OUT of the object entirely when
// omitted (rather than `undefined`) — `typeof ts.plant_mode === 'number'` must see the key
// missing, not present-but-undefined, to match a real true_state that never had the field.
function snap(mwe, fuelDamaged, simT, mode) {
  var ts = { mwe_output: mwe, fuel_damaged: !!fuelDamaged };
  if (typeof mode === 'number') ts.plant_mode = mode;
  return { true_state: ts, metadata: { sim_time: simT || 0 } };
}
function names(events) { return events.map(function (e) { return e.name; }); }
function milestoneNames(events) {
  return events.filter(function (e) { return e.name === 'milestone'; })
    .map(function (e) { return e.props.name; });
}
// The sequence of MODES actually reported on the funnel, in firing order.
function modeSeq(events) {
  return events.filter(function (e) { return e.name === 'plant_mode'; })
    .map(function (e) { return e.props.mode; });
}

// A bundle shaped like a real recording: columnar timeseries, `rows` rows of full-precision
// doubles. Built here rather than by driving the plant, because what is under test is the
// ENCODER, not the plant — and a random walk is the shape gzip actually meets.
function mkBundle(rows, fields) {
  fields = fields || ['power_pct', 'tavg_c', 'pressure_mpa', 'pzr_level_pct'];
  var seed = 0x5eed;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  var ts = { fields: fields, t: [], accel: [], v: [], lo: [], hi: [] };
  var walk = fields.map(function (f, i) { return 10 + i * 90; });
  for (var i = 0; i < fields.length; i++) { ts.v.push([]); ts.lo.push([]); ts.hi.push([]); }
  for (var r = 0; r < rows; r++) {
    ts.t.push(r); ts.accel.push(1);
    for (i = 0; i < fields.length; i++) {
      walk[i] = walk[i] * (1 + (rnd() - 0.5) * 0.01);
      ts.v[i].push(walk[i]); ts.lo[i].push(walk[i] * 0.999); ts.hi[i].push(walk[i] * 1.001);
    }
  }
  return { schema_version: '1.2', kind: 'reactor_dynamics_diagnosis', manifest: { plant_id: 'pwr' },
           timeseries: ts, events: [], commands: [] };
}
function bodyBytes(b) {
  if (b && typeof b.size === 'number') return b.size;         // Blob (the gzip path)
  return Buffer.byteLength(String(b), 'utf8');
}

// =============================================================== (a) the opt-out gate
//
// REWRITTEN 2026-08-09 with the default flip (opt-in -> on-unless-opted-out). Two things
// changed here beyond the polarity:
//
//   - Every assertion is a DELTA across one flush, not an absolute `a.sent.length === 0`.
//     `a.sent` accumulates for the lifetime of the harness, so once the default sends
//     anything the old absolutes fail everywhere downstream — which is exactly what they
//     did, and the misleading part was WHERE: "denied: flush sends nothing" went red
//     carrying a body from the *undecided* phase, reading like an opt-out leak when the
//     opt-out was fine. A delta cannot inherit another phase's traffic.
//   - The opt-out is asserted on a FRESH client too. Proving "denied is silent" only after
//     a granted phase leaves open that some first-send latch, not the check, is doing the
//     work — the failure mode HR10 is about.
function sentDelta(a, fn) { var n = a.sent.length; fn(); a.T.flush(); return a.sent.length - n; }

(function () {
  var a = load();
  // DEFAULT: no answer recorded, and collection is on. `consent()` still reads null —
  // untouched storage is the common case and must stay indistinguishable from a fresh visit.
  ck('default consent reads null', a.T.consent() === null, String(a.T.consent()));
  ck('default: granted() is true', a.T.granted() === true);
  ck('default: event() accepts', a.T.event('session_start', { plant: 'pwr' }) === true);
  ck('default: it queued', a.T._queue().length === 1, 'queue=' + a.T._queue().length);
  a.T.flush();
  ck('default: flush sends', a.sent.length === 1, JSON.stringify(a.sent.length));

  a.T.setConsent('denied');
  ck('opted out: granted() is false', a.T.granted() === false);
  ck('opted out: event() refuses', a.T.event('session_start', { plant: 'pwr' }) === false);
  ck('opted out: flush sends nothing',
    sentDelta(a, function () { a.T.event('command', { action: 'set_rods' }); }) === 0);

  a.T.setConsent('granted');
  ck('opted back in: event() accepts', a.T.event('session_start', { plant: 'pwr' }) === true);
  ck('opted back in: flush sends again', sentDelta(a, function () {}) === 1);

  // Opting out must drop what is already pending, not merely stop adding.
  a.T.event('command', { action: 'set_rods' });
  var pending = a.T._queue().length;
  a.T.setConsent('denied');
  ck('opting out empties the pending queue', pending > 0 && a.T._queue().length === 0,
    'was=' + pending + ' now=' + a.T._queue().length);
  ck('opting out: the pending events are never sent', sentDelta(a, function () {}) === 0);
}());

// (a2) The opt-out on a FRESH client — no prior granted phase to lean on.
(function () {
  var a = load();
  a.T.setConsent('denied');
  ck('fresh client, opted out: granted() is false', a.T.granted() === false);
  ck('fresh client, opted out: sends nothing at all',
    sentDelta(a, function () {
      a.T.event('session_start', { plant: 'pwr' });
      a.T.event('command', { action: 'set_rods' });
    }) === 0, 'sent=' + a.sent.length);
}());

// ============================================================== (b) no endpoint
(function () {
  var a = load({ endpoint: '' });
  a.T.setConsent('granted');
  ck('no endpoint: enabled() is false', a.T.enabled() === false);
  ck('no endpoint: event() refuses even with consent',
    a.T.event('session_start', { plant: 'pwr' }) === false);
  a.T.flush();
  ck('no endpoint: nothing is sent', a.sent.length === 0, JSON.stringify(a.sent));
  // The shipped repo copy must BE that state — a clone that phones home because
  // someone committed a real URL is the failure this pins.
  var src = require('fs').readFileSync(path.join(ROOT, 'site', 'telemetry_endpoint.js'), 'utf8');
  ck('the committed endpoint file is empty',
    /RD_TELEMETRY_ENDPOINT\s*=\s*""\s*;/.test(src), src.split('\n').pop());
}());

// ========================================================= (c) declared events only
(function () {
  var a = load();
  a.T.setConsent('granted');
  ck('an undeclared event name is dropped',
    a.T.event('keystrokes', { text: 'hello' }) === false);
  ck('an undeclared name queues nothing', a.T._queue().length === 0);
  Object.keys(a.T.EVENTS).forEach(function (name) {
    ck('declared event "' + name + '" is accepted', a.T.event(name, {}) === true);
  });
}());

// ======================================================== (d) no free text, path 1
(function () {
  var a = load();
  a.T.setConsent('granted');

  // The concrete fear: someone adds a note/message/url to an automatic event.
  var c = a.T._clean('command', { action: 'set_rods', note: 'I think this is broken', blocked: false });
  ck('an undeclared property is stripped', !('note' in c), JSON.stringify(c));
  ck('declared properties survive', c.action === 'set_rods' && c.blocked === false, JSON.stringify(c));

  // A declared enum field must still refuse prose: length AND character set.
  var long = a.T._clean('command', { action: 'x'.repeat(200) });
  ck('an over-long enum value is dropped', !('action' in long), JSON.stringify(long));
  var prose = a.T._clean('command', { action: 'the plant blew up and my name is Tim' });
  ck('an enum value containing spaces/prose is dropped', !('action' in prose), JSON.stringify(prose));

  // Closed enums accept only their listed values.
  ck('a closed enum accepts a listed value',
    a.T._clean('milestone', { name: 'on_grid' }).name === 'on_grid');
  ck('a closed enum rejects an unlisted value',
    !('name' in a.T._clean('milestone', { name: 'anything_else' })));

  // Wrong types are dropped rather than coerced — "5" is a string someone built.
  ck('a string in a num field is dropped',
    !('seconds' in a.T._clean('session_end', { seconds: '600' })));
  ck('a number in a bool field is dropped',
    !('blocked' in a.T._clean('command', { blocked: 1 })));
}());

// ===================================================== (f) command-run coalescing
// These controls are number boxes with up/down arrows, not sliders (a hold auto-repeats,
// a "dial it in exactly" click-sequence does not) — set_pressure_setpoint alone was 1,761
// uses over 18 sessions, and `command` was 93% of all 13,181 events. A run of the SAME
// action/flags within COALESCE_MS collapses to ONE row on the trailing edge, carrying how
// many presses it took. See COALESCE_MS in site/telemetry.js for the window and why.
(function () {
  // ---- a run collapses to one row, and the row carries the repeat count -----------
  (function () {
    var a = load();
    a.T.setConsent('granted');
    a.T.event('command', { action: 'set_pressure_setpoint', blocked: false });
    a.T.event('command', { action: 'set_pressure_setpoint', blocked: false });
    a.T.event('command', { action: 'set_pressure_setpoint', blocked: false });
    ck('a run of 3 identical presses collapses to ONE queued row',
      a.T._queue().length === 1, 'queue=' + a.T._queue().length);
    ck('...and the row carries the repeat count',
      a.T._queue()[0].p.count === 3, JSON.stringify(a.T._queue()[0].p));

    var b = load();
    b.T.setConsent('granted');
    b.T.event('command', { action: 'set_load_target', blocked: false });
    ck('a single press with no repeat still carries count: 1',
      b.T._queue()[0].p.count === 1, JSON.stringify(b.T._queue()[0].p));
  }());

  // ---- the row's timing is the TRAILING edge, not the first press -----------------
  (function () {
    var a = load();
    a.T.setConsent('granted');
    // 1450 -> 1650ms: 200ms apart (inside COALESCE_MS, so still one run) but straddling
    // a whole-second rounding boundary (1 -> 2), since `t` is seconds, rounded.
    var clock = { t: 1450 };
    globalThis.performance = { now: function () { return clock.t; } };
    a.T.event('command', { action: 'set_steam_dump_setpoint', blocked: false });
    var firstT = a.T._queue()[0].t;
    clock.t += 200;
    a.T.event('command', { action: 'set_steam_dump_setpoint', blocked: false });
    var lastT = a.T._queue()[0].t;
    ck('the coalesced row\'s timestamp moves to the LAST repeat, not the first',
      lastT > firstT, 'first=' + firstT + ' last=' + lastT);
  }());

  // ---- a gap over the window starts a NEW run, not a third repeat -------------------
  (function () {
    var a = load();
    a.T.setConsent('granted');
    var clock = { t: 1000 };
    globalThis.performance = { now: function () { return clock.t; } };
    a.T.event('command', { action: 'set_rods', blocked: false });
    clock.t += 251;   // just over COALESCE_MS (250ms)
    a.T.event('command', { action: 'set_rods', blocked: false });
    ck('a gap over the coalesce window starts a second row',
      a.T._queue().length === 2, 'queue=' + a.T._queue().length);
    // Read defensively: a wrong row count above must not also crash this one.
    var q2 = a.T._queue();
    ck('...each with its own count of 1',
      !!q2[0] && !!q2[1] && q2[0].p.count === 1 && q2[1].p.count === 1,
      JSON.stringify(q2.map(function (r) { return r.p.count; })));
  }());

  // ---- NEVER coalesce across a different action ------------------------------------
  (function () {
    var a = load();
    a.T.setConsent('granted');
    a.T.event('command', { action: 'set_rods', blocked: false });
    a.T.event('command', { action: 'set_load_target', blocked: false });
    ck('two different action names are never coalesced',
      a.T._queue().length === 2, 'queue=' + a.T._queue().length);
  }());

  // ---- NEVER coalesce across a different `blocked` ---------------------------------
  // THE LOAD-BEARING ONE: a refused command inside a run of accepted ones is the single
  // most interesting event in that run, and folding it away would hide exactly what
  // "Controls people try but cannot use" exists to show.
  (function () {
    var a = load();
    a.T.setConsent('granted');
    a.T.event('command', { action: 'set_pressure_setpoint', blocked: false });
    a.T.event('command', { action: 'set_pressure_setpoint', blocked: true });
    a.T.event('command', { action: 'set_pressure_setpoint', blocked: false });
    ck('a refused command inside a run is its OWN row, never folded in',
      a.T._queue().length === 3, 'queue=' + a.T._queue().length);
    // Read defensively (#-idiom in this file): when the row count is wrong, index [1]
    // may not exist at all — that is red about the defect above, not a crash here.
    var q3 = a.T._queue();
    ck('...and the blocked flag survives on its own row',
      !!q3[1] && q3[1].p.blocked === true,
      JSON.stringify(q3.map(function (r) { return r.p.blocked; })));
  }());

  // ---- the buffer cannot survive an opt-out (invariant a) --------------------------
  (function () {
    var a = load();
    a.T.setConsent('granted');
    a.T.event('command', { action: 'set_pressure_setpoint', blocked: false });
    a.T.event('command', { action: 'set_pressure_setpoint', blocked: false });   // open run, count=2
    a.T.setConsent('denied');
    ck('opting out mid-run empties the queue', a.T._queue().length === 0);
    a.T.setConsent('granted');
    a.T.event('command', { action: 'set_pressure_setpoint', blocked: false });
    ck('a repeat after re-consenting starts a FRESH run, not a silently-lost extension',
      a.T._queue().length === 1 && a.T._queue()[0].p.count === 1,
      JSON.stringify(a.T._queue()));
  }());

  // ---- a run that spans a batch flush: the tail ships, and does not orphan --------
  (function () {
    var a = load();
    a.T.setConsent('granted');
    a.T.event('command', { action: 'set_pressure_setpoint', blocked: false });
    a.T.event('command', { action: 'set_pressure_setpoint', blocked: false });
    a.T.flush();
    ck('the run in flight IS in the flushed batch, count included',
      a.sent.length === 1 && JSON.parse(a.sent[0].body).events[0].p.count === 2,
      a.sent.length ? a.sent[0].body : 'nothing sent');
    a.T.event('command', { action: 'set_pressure_setpoint', blocked: false });
    ck('a repeat after the flush starts a NEW row, not an edit to the shipped one',
      a.T._queue().length === 1 && a.T._queue()[0].p.count === 1,
      JSON.stringify(a.T._queue()));
  }());

  // ---- BATCH_MS is 60000, not 15000 -------------------------------------------------
  (function () {
    var src = require('fs').readFileSync(path.join(ROOT, 'site', 'telemetry.js'), 'utf8');
    ck('BATCH_MS is 60000 (15s -> 60s)', /\bvar BATCH_MS = 60000;/.test(src),
      (src.match(/var BATCH_MS = \d+;/) || [''])[0]);
  }());
}());

// =================================================== (e) no cross-session identity
(function () {
  var a = load();
  a.T.setConsent('granted');
  a.T.event('session_start', { plant: 'pwr' });
  a.T.flush();
  var body = JSON.parse(a.sent[0].body);
  ck('a payload carries a session id', typeof body.session === 'string' && body.session.length > 4);
  ck('the session id lives in sessionStorage, not localStorage',
    Object.keys(globalThis.sessionStorage._all).some(function (k) { return /session/.test(k); }) &&
    !Object.keys(globalThis.localStorage._all).some(function (k) { return /session/.test(k); }),
    'local=' + JSON.stringify(Object.keys(globalThis.localStorage._all)));
  // localStorage may hold the CONSENT choice and nothing else — that has to persist
  // (it is the answer to a question we promised not to ask twice) and it is not an id.
  ck('localStorage holds only the consent decision',
    Object.keys(globalThis.localStorage._all).length === 1 &&
    /consent/.test(Object.keys(globalThis.localStorage._all)[0]),
    JSON.stringify(Object.keys(globalThis.localStorage._all)));
}());

// ============================================ the client and the Worker must agree
// The receiver drops any event name it does not recognise (`if (!hasOwnProperty(
// KEY_OF, name)) continue`) and reads each event's principal string out of a NAMED
// property. So there are two silent failures available: declare an event here and
// forget the Worker, and it is collected and thrown away; rename a property, and the
// column arrives empty for ever. Neither errors, and neither is visible from either
// side alone — which is exactly the shape of thing worth gating.
//
// Parsed as TEXT, not required: worker/src/index.js is an ES module (`export default`)
// and this repo's runners are CommonJS.
(function () {
  var fs = require('fs');
  var wsrc;
  try { wsrc = fs.readFileSync(path.join(ROOT, 'worker', 'src', 'index.js'), 'utf8'); }
  catch (e) { ck('the Worker source is present', false, String(e)); return; }

  var m = /const KEY_OF = \{([\s\S]*?)\n\};/.exec(wsrc);
  ck('the Worker declares a KEY_OF column map', !!m);
  if (!m) return;

  /* Three value shapes, and the third is not decoration: `null` (no key string),
   * `'field'` (that prop verbatim), and `['a','b']` — several props joined, which is how
   * a walkthrough's STEP survives the daily rollup. `usage_daily` keys on
   * [day, channel, release, event, key_str, plant] and carries no numeric columns, so a
   * step number that is only a `double` is gone at three months (#674). */
  var map = {};
  m[1].split('\n').forEach(function (line) {
    var r = /^\s*([a-z_]+)\s*:\s*(null|'([^']*)'|\[([^\]]*)\])\s*,?\s*$/.exec(line);
    if (!r) return;
    if (r[4] !== undefined) {
      map[r[1]] = r[4].split(',').map(function (s) { return s.trim().replace(/^'|'$/g, ''); })
        .filter(function (s) { return s; });
    } else {
      map[r[1]] = r[3] === undefined ? null : r[3];
    }
  });

  var declared = Object.keys(globalThis.RD.Telemetry.EVENTS);
  var mapped = Object.keys(map);
  ck('the Worker map parsed', mapped.length > 0, JSON.stringify(mapped));

  declared.forEach(function (name) {
    ck('the Worker knows "' + name + '"',
      Object.prototype.hasOwnProperty.call(map, name),
      'declared in telemetry.js but the receiver would drop it');
  });
  mapped.forEach(function (name) {
    ck('the Worker map has no stale entry "' + name + '"', declared.indexOf(name) !== -1);
  });
  // And the named property must actually exist on that event, or blob4 is always ''.
  mapped.forEach(function (name) {
    var field = map[name];
    if (field === null) return;                       // plant_mode carries no key string
    var spec = globalThis.RD.Telemetry.EVENTS[name];
    [].concat(field).forEach(function (f) {
      ck('"' + name + '" really carries the property "' + f + '"',
        !!(spec && Object.prototype.hasOwnProperty.call(spec.props, f)),
        spec ? 'props are ' + Object.keys(spec.props).join(', ') : 'no such event');
    });
  });

  /* AND THE COMPOSER IS RUN, not read. Parsing the map above proves the two sides agree
   * on the NAMES; it says nothing about what actually lands in blob5. A `keyOf` that
   * ignored its array branch, or dropped the zero-padding, would leave every check above
   * green while the whole step funnel arrived as one undifferentiated key — the same
   * shape as #485, where a source scan certified a string that could never render.
   *
   * So the three declarations are lifted out of the Worker source and EXECUTED. They are
   * pure and depend on nothing else in that file, which is the only reason this is
   * possible at all; if `keyOf` ever needs an import, this becomes a source scan again
   * and is worth less. */
  /* `\r?\n` AND NOT `\n`: `core.autocrlf=true` is set in every lane of this repo, so the
   * SAME blob checks out LF in a tree whose file the editor last wrote and CRLF in one git
   * has just re-materialised at a merge. Anchored on a bare \n this check read "composer not
   * found" on a CRLF checkout and took its six behavioural assertions with it — green in one
   * working tree and red in another, off one bit of checkout state and nothing in the Worker.
   * Verified against BOTH endings before it went in. */
  var fn = /function keyPart\([\s\S]*?\r?\n\}\r?\n[\s\S]*?function keyOf\([\s\S]*?\r?\n\}/.exec(wsrc);
  ck('the Worker key composer was found', !!fn);
  if (fn) {
    var keyOf;
    try {
      keyOf = new Function('KEY_OF', fn[0] + '; return keyOf;')(map);
    } catch (e) { ck('the Worker key composer runs', false, String(e)); }
    if (keyOf) {
      ck('a single-prop key is the value itself',
        keyOf('command', { action: 'set_rods' }) === 'set_rods', keyOf('command', { action: 'set_rods' }));
      ck('an event with no key string composes to empty',
        keyOf('plant_mode', { mode: 3 }) === '', keyOf('plant_mode', { mode: 3 }));
      ck('a composite key joins its props with a colon',
        keyOf('walkthrough_end', { id: 'pwr_heatup', reason: 'complete' }) === 'pwr_heatup:complete',
        keyOf('walkthrough_end', { id: 'pwr_heatup', reason: 'complete' }));
      ck('a numeric key part is zero-padded',
        keyOf('walkthrough_step', { id: 'pwr_heatup', step: 7, by: 'auto' }) === 'pwr_heatup:07:auto',
        keyOf('walkthrough_step', { id: 'pwr_heatup', step: 7, by: 'auto' }));
      /* THE PADDING IS THE POINT, not a formatting preference: the rollup stores this as
       * TEXT, so step 9 sorting after step 10 would put the funnel in the wrong order in
       * the one store that outlives Analytics Engine's three months. */
      ck('…so steps sort in step order, not lexically',
        keyOf('walkthrough_step', { id: 'x', step: 9, by: 'auto' }) < keyOf('walkthrough_step', { id: 'x', step: 10, by: 'auto' }),
        keyOf('walkthrough_step', { id: 'x', step: 9, by: 'auto' }) + ' vs ' + keyOf('walkthrough_step', { id: 'x', step: 10, by: 'auto' }));
      /* A verdict clean() refused (an `by` outside the closed enum) leaves an EMPTY part,
       * never the string "undefined" — which would land in the rollup as a real category
       * and be indistinguishable from a verdict named that. */
      ck('a missing key prop composes to empty rather than "undefined"',
        keyOf('walkthrough_step', { id: 'x', step: 3 }) === 'x:03:',
        keyOf('walkthrough_step', { id: 'x', step: 3 }));
    }
  }
}());

// ================================================ every declared prop type is a KIND
// clean() dispatches on the type string and has no else. A prop declared 'number'
// instead of 'num' therefore falls through every branch, is dropped at runtime for
// ever, and — worse — is invisible to the column check below, which filters on the
// same spelling. So that check would pass green over a prop that never arrives. This
// one closes the hole it stands on, and must run first.
(function () {
  var EVENTS = globalThis.RD.Telemetry.EVENTS;
  var bad = [];
  Object.keys(EVENTS).forEach(function (n) {
    var props = EVENTS[n].props || {};
    Object.keys(props).forEach(function (k) {
      var want = props[k];
      var ok = want === 'num' || want === 'bool' || want === 'enum'
        || Object.prototype.toString.call(want) === '[object Array]';
      if (!ok) bad.push(n + '.' + k + ' = ' + JSON.stringify(want));
    });
  });
  ck('every declared prop type is a kind clean() understands', bad.length === 0, bad.join('; '));
}());

// =========================================== every scalar prop reaches a real column
// The KEY_OF cross-check above covers each event's principal STRING. It says nothing
// about the numbers and booleans, which reach Analytics Engine through the fixed
// `doubles`/`blobs` arrays instead — so a 'num' or 'bool' prop can be declared,
// validated, transmitted, and silently discarded by the receiver with every gate
// green. That is not hypothetical: `command.blocked` shipped, was collected, and was
// thrown away on arrival until 2026-08-10, and nothing here could see it.
//
// Enum props are deliberately NOT checked: they arrive via `p[keyField]`, which the
// KEY_OF block already gates. And `session_start.channel` is read off the payload
// ENVELOPE rather than off `p`, so an all-props version of this check would redden on
// it for ever. Both exclusions are why this filters on 'num'/'bool' — do not widen it
// without re-reading handleEvents.
(function () {
  var fs = require('fs');
  var wsrc;
  try { wsrc = fs.readFileSync(path.join(ROOT, 'worker', 'src', 'index.js'), 'utf8'); }
  catch (e) { ck('the Worker source is present (columns)', false, String(e)); return; }

  var m = /writeDataPoint\(\{([\s\S]*?)\n    \}\);/.exec(wsrc);
  ck('the Worker writeDataPoint call parsed', !!m);
  if (!m) return;
  var body = m[1];

  // Which props the receiver actually reads. `p[keyField]` is computed and invisible
  // here, which is correct — that path is KEY_OF's to gate.
  var cols = {};
  (body.match(/\bp\.([A-Za-z_][A-Za-z0-9_]*)/g) || []).forEach(function (s) { cols[s.slice(2)] = true; });

  var EVENTS = globalThis.RD.Telemetry.EVENTS;
  var scalars = {};
  Object.keys(EVENTS).forEach(function (n) {
    var props = EVENTS[n].props || {};
    Object.keys(props).forEach(function (k) {
      if (props[k] === 'num' || props[k] === 'bool') scalars[k] = true;
    });
  });

  Object.keys(scalars).sort().forEach(function (k) {
    ck('the Worker stores the scalar prop "' + k + '"', cols[k] === true,
      'declared num/bool in telemetry.js, but handleEvents never reads p.' + k);
  });
  Object.keys(cols).sort().forEach(function (k) {
    ck('the Worker reads no undeclared prop "' + k + '"',
      Object.prototype.hasOwnProperty.call(scalars, k) || declaredAnywhere(k, EVENTS),
      'handleEvents reads p.' + k + ' but no event declares it — a typo here is a column of zeroes');
  });

  // The two ENVELOPE fields are not props and no prop loop can see them, so they get
  // their own assertions or the per-event timing ships ungated.
  ck('the Worker stores the envelope timestamp e.t', /\be\.t\b/.test(body),
    'the client has always sent it; without this line it is discarded on arrival');
  ck('the Worker stores the envelope session-elapsed e.st', /\be\.st\b/.test(body));

  function declaredAnywhere(name, evs) {
    return Object.keys(evs).some(function (n) {
      return Object.prototype.hasOwnProperty.call(evs[n].props || {}, name);
    });
  }
}());

// ====================================== privacy.html discloses what the schema takes
// The rule "change privacy.html in the same commit" is written in three source files
// and was enforced by nothing, which is how `command.blocked` came to be collected
// without ever appearing on the page. This gate closes that, and it reads MARKUP, not
// prose: the page carries data-collects="event.prop …" on each bullet, so the wording
// can be rewritten freely and only a change to WHAT IS COLLECTED reddens it.
//
// Deliberately four checks rather than one per token: run_all's baseline is an exact
// string, and a count that moved on every schema edit would train the next author to
// rewrite the number without reading why it changed.
(function () {
  var fs = require('fs');
  var html;
  try { html = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8'); }
  catch (e) { ck('privacy.html is present', false, String(e)); return; }

  var disclosed = {};
  (html.match(/data-collects="([^"]*)"/g) || []).forEach(function (attr) {
    attr.replace(/^data-collects="|"$/g, '').split(/\s+/).forEach(function (tok) {
      if (tok) disclosed[tok] = true;
    });
  });
  ck('privacy.html carries data-collects markers', Object.keys(disclosed).length > 0,
    'the disclosure gate has no anchor — was the attribute dropped in an edit?');

  var EVENTS = globalThis.RD.Telemetry.EVENTS;
  var all = [];
  Object.keys(EVENTS).forEach(function (n) {
    Object.keys(EVENTS[n].props || {}).forEach(function (k) { all.push(n + '.' + k); });
  });

  var missing = all.filter(function (t) { return !disclosed[t]; });
  ck('privacy.html discloses every declared event.prop', missing.length === 0,
    'collected but not disclosed: ' + missing.join(', '));

  var stale = Object.keys(disclosed).filter(function (t) { return all.indexOf(t) === -1; });
  ck('privacy.html discloses nothing the schema does not collect', stale.length === 0,
    'disclosed but not collected: ' + stale.join(', '));

  /* THE PAGE MUST NOT PROMISE A CONTROL IT DOES NOT HAVE.
   *
   * This check has been re-pointed twice in one day and the direction of travel matters.
   * It began as "the in-sim Settings row points at the schema"; when the control moved to
   * privacy.html it became "privacy.html carries a working opt-out"; the owner then ruled
   * that there is to be no opt-out anywhere. So the thing worth guarding is no longer the
   * mechanism — it is the CLAIM. A page that says "you can turn this off" with nothing
   * behind it is a false statement to the public, and that is the failure mode a future
   * edit could reintroduce for free by restoring one sentence of old copy.
   *
   * It deliberately does NOT require the page to say collection cannot be switched off:
   * the ruling was to remove the control and assert nothing in its place. Silence passes;
   * only an unbacked promise fails. */
  var promises = /(turn|switch|shut)\s+(this|it|usage data)\s+off|opt[- ]out|opt out of/i.test(html);
  var hasControl = /id="telOptOut"/.test(html) && /setConsent\(/.test(html);
  ck('privacy.html makes no opt-out promise it cannot keep', !promises || hasControl,
    promises ? 'the page offers an opt-out in prose with no control behind it' : '');

  // And the retired in-sim location must stay retired: a second control would be two
  // sources of truth for one setting, which is how they drift apart.
  var shell;
  try { shell = fs.readFileSync(path.join(ROOT, 'ui', 'shell.html'), 'utf8'); }
  catch (e) { shell = ''; }
  ck('the removed Settings row has not come back',
    !/telemetryRow|telSeg/.test(shell),
    'the in-sim consent row is back — one setting, two controls');
}());

/* ================================================ the site pages (#764)
 *
 * The client used to load ONLY in ui/shell.html, so a visitor who read the homepage and
 * left was invisible — which is why the console could not tell "nobody enters the sim"
 * from "nobody LANDS on the shell", and reported the first when it was the second.
 *
 * Widening its reach widens what is collected from people who never open the simulator,
 * and there is no consent prompt anywhere by owner ruling. So the guards below are not
 * about whether the events arrive; they are about the events staying INCAPABLE of
 * carrying more than was disclosed. Every one of them was written against an injection
 * that made it red first — INJ3 below in particular went GREEN on the first pass, which
 * is what these exist for.
 */
(function () {
  // `fs` is declared per-suite in this runner, not at module scope. Without this line the
  // read below throws a ReferenceError INSIDE the try/catch and every page reports "no
  // endpoint tag" — a wrong diagnosis that looks exactly like the defect being guarded.
  var fs = require('fs');
  var T = globalThis.RD.Telemetry;
  var EV = T.EVENTS;
  var PAGES = T.PAGES;

  /* CLOSED ENUMS, NOT OPEN ONES. `clean()`'s 'enum' kind accepts any identifier-shaped
   * string up to 48 characters; an ARRAY accepts only what is listed. The difference is
   * the whole privacy claim for these two events: an open `page` prop would take
   * `index.html` — a real path, disclosed as nothing — and an open `width` would take the
   * pixel count this deliberately buckets away. MEASURED: switching page_view.page from
   * PAGES to 'enum' left the suite at 169/0 before this check existed. */
  var closed = function (spec) { return Object.prototype.toString.call(spec) === '[object Array]'; };
  ck('page_view.page is a CLOSED enum, not an open one',
    closed(EV.page_view && EV.page_view.props.page),
    'an open enum here takes a real path and discloses none of it');
  ['to', 'device', 'width'].forEach(function (k) {
    ck('cta_click.' + k + ' is a CLOSED enum',
      closed(EV.cta_click && EV.cta_click.props[k]),
      'an open enum here takes more than the four buckets that were disclosed');
  });

  /* THE CLASSIFIER CANNOT EMIT A PATH. Driven through the real pageId() rather than read
   * out of the source, because what matters is the value it RETURNS, and a source scan
   * for a closed list cannot tell you the function honours it. The corpus is deliberately
   * hostile: a query string and a fragment are the two ways a path smuggles free text. */
  var paths = ['/', '/index.html', '/about.html', '/404.html', '/ui/shell.html',
    '/ui/shell.html?engine=pwr2', '/privacy.html#usage', '/some/unknown/page.html',
    '/index.html?utm_source=a_marketing_campaign', '', '/WEIRD.HtMl'];
  var out = paths.map(function (p) { return T.pageId(p); });
  var escaped = out.filter(function (v) { return PAGES.indexOf(v) === -1; });
  ck('pageId() returns nothing outside the declared page set', escaped.length === 0,
    'escaped: ' + JSON.stringify(escaped));
  ck('a query string cannot ride in on the page id',
    T.pageId('/index.html?utm_source=a_marketing_campaign') === 'home',
    String(T.pageId('/index.html?utm_source=a_marketing_campaign')));
  ck('an unknown page is "other", never its own path',
    T.pageId('/some/unknown/page.html') === 'other',
    String(T.pageId('/some/unknown/page.html')));
  ck('widthBucket() returns one of the four declared bands',
    [0, 320, 599, 600, 899, 900, 1279, 1280, 4000].every(function (w) {
      return EV.cta_click.props.width.indexOf(T.widthBucket(w)) !== -1;
    }));
  // A bucket that collapses to one value discloses nothing and would pass the check above.
  ck('the width bands actually discriminate',
    T.widthBucket(390) !== T.widthBucket(1920),
    'every width lands in the same band — the bucket is decorative');

  /* THE SHELL IS NOT DOUBLE-WIRED. ui/app.js already owns that page's lifecycle
   * (session_start, session_end, and a pagehide beacon at app.js:8703). A second set of
   * listeners there would add a page_view nothing asked for and a second flush racing the
   * one that carries session_end — the most valuable row in the set. */
  /* DRIVEN THROUGH THE REAL autoInit, not asserted off pageId(). The first draft of these
   * two checks tested what pageId() RETURNS for the shell path, which is the ingredient
   * and not the behaviour: deleting autoInit's `pageId() === 'shell'` guard reddened
   * NOTHING, measured. What follows wires a fake document and asks what actually happens. */
  function fakeDoc() {
    var h = {};
    return {
      visibilityState: 'visible',
      addEventListener: function (t, fn) { (h[t] = h[t] || []).push(fn); },
      _handlers: h,
      _click: function (href) {
        var a = { tagName: 'A', getAttribute: function (k) { return k === 'href' ? href : null; },
                  parentNode: null };
        (h.click || []).forEach(function (fn) { fn({ target: a }); });
      },
    };
  }
  function at(pathname, fn) {
    var prev = globalThis.location;
    globalThis.location = { pathname: pathname };
    try { return fn(); } finally { globalThis.location = prev; }
  }

  var site = load();
  at('/index.html', function () {
    var doc = fakeDoc();
    ck('autoInit runs on a site page', site.T._autoInit(doc) === true);
    var before = site.sent.length;
    /* THE CLICK NAVIGATES AWAY INSIDE THE 15-SECOND BATCH WINDOW, so a queued cta_click
     * dies with the page. That would report ZERO clicks on a button people press — the
     * most confidently wrong number this change could produce — so the send must happen
     * on the click itself, with no flush() call from the test. */
    doc._click('ui/shell.html?engine=pwr2');
    ck('a call-to-action click is sent immediately, not left in the batch',
      site.sent.length === before + 1, 'sent delta ' + (site.sent.length - before));
    // DEFENSIVE ABOUT AN EMPTY WIRE. Without this the same defect the check above catches
    // makes this line THROW on `sent[-1]`, and the runner dies with a stack trace and no
    // tally — a broken module reported as neither pass nor fail.
    var last = site.sent[site.sent.length - 1];
    var rows = last ? JSON.parse(last.body).events.map(function (e) { return e.e; }) : [];
    ck('that send carries both the page_view and the cta_click',
      rows.indexOf('page_view') !== -1 && rows.indexOf('cta_click') !== -1,
      last ? rows.join(',') : 'nothing was sent at all');
    // An ordinary navigation link is a page_view already; counting it as a call-to-action
    // too would make the funnel's own denominator meaningless.
    var n = site.sent.length;
    doc._click('about.html');
    ck('an ordinary link is not counted as a call-to-action', site.sent.length === n);
  });

  /* NO ENDPOINT, NO WIRING. The offline single-file build is not called shell.html, so the
   * shell guard does not catch it; without an endpoint check it would wire listeners and
   * queue events on a build whose entire promise is that it never touches the network. */
  var offline = load({ endpoint: null });
  at('/Reactor_Dynamics_Alpha_1.7.5.html', function () {
    var doc = fakeDoc(), win = fakeDoc();
    ck('autoInit refuses when no endpoint is stamped', offline.T._autoInit(doc, win) === false);
    ck('and wires nothing in the offline build',
      Object.keys(doc._handlers).length === 0 && Object.keys(win._handlers).length === 0);
  });

  /* THE BOUNCE IS THE VISITOR THIS EXISTS TO COUNT. Site pages have no session_end, so
   * without a pagehide beacon someone who reads the homepage and closes the tab inside the
   * 15-second batch window sends nothing at all — and "arrived, left immediately" is
   * exactly the row the funnel needs. Proved by driving the registered handler, because a
   * check that the LISTENER exists says nothing about whether it flushes. */
  var bounce = load();
  at('/about.html', function () {
    var doc = fakeDoc(), win = fakeDoc();
    bounce.T._autoInit(doc, win);
    ck('a pagehide handler is registered on the window', !!(win._handlers.pagehide || []).length);
    var before = bounce.sent.length;
    (win._handlers.pagehide || []).forEach(function (fn) { fn(); });
    ck('leaving the page sends what was queued', bounce.sent.length === before + 1,
      'sent delta ' + (bounce.sent.length - before));
    // flush() empties the queue, so the second call must be a no-op and not a duplicate row.
    var after = bounce.sent.length;
    (win._handlers.pagehide || []).forEach(function (fn) { fn(); });
    ck('a second pagehide does not duplicate the send', bounce.sent.length === after);
  });

  /* THE SHELL IS NOT DOUBLE-WIRED. ui/app.js already owns that page's lifecycle
   * (session_start, session_end, and a pagehide beacon at app.js:8703). A second set of
   * listeners there would add a page_view nothing asked for and a second flush racing the
   * one that carries session_end — the most valuable row in the set. */
  var shellClient = load();
  at('/ui/shell.html', function () {
    var doc = fakeDoc();
    ck('autoInit REFUSES to run on the shell', shellClient.T._autoInit(doc) === false);
    ck('and wires no listeners there', Object.keys(doc._handlers).length === 0,
      Object.keys(doc._handlers).join(','));
    ck('and sends nothing there', shellClient.sent.length === 0,
      String(shellClient.sent.length));
  });

  /* LOAD ORDER ON EVERY SITE PAGE. telemetry.js reads window.RD_TELEMETRY_ENDPOINT at
   * load, so the endpoint file must come FIRST. Reversed, the client silently collects
   * nothing for ever — invariant (b) makes that the correct behaviour for an unset
   * endpoint, which is exactly why the mistake would never announce itself. */
  var SITE_PAGES = ['index.html', 'about.html', 'physics.html', 'roadmap.html',
    'changelog.html', 'download.html', 'privacy.html', 'legal.html', '404.html'];
  SITE_PAGES.forEach(function (f) {
    var src = '';
    try { src = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { /* reported below */ }
    var ep = src.indexOf('<script src="site/telemetry_endpoint.js">');
    var tel = src.indexOf('<script src="site/telemetry.js">');
    ck(f + ' loads the client, endpoint first',
      ep !== -1 && tel !== -1 && ep < tel,
      ep === -1 ? 'no endpoint tag' : (tel === -1 ? 'no telemetry tag' : 'endpoint loads AFTER the client'));
  });
}());

// =========================================== ui/app.js: state-derived milestones (TEL)
/* #on_grid-is-an-IC: `hot_full_power` starts with the generator already on line, so the
 * old "mwe_output > 0" state test fired on_grid on the FIRST tick — recording the initial
 * condition as though the player had done something. Live data, 7 days to 2026-09-20:
 * on_grid 69 sessions, hot_full_power 69 sessions — a "100% success" funnel that measured
 * nothing. `stateMilestone` requires a FALSE observed before a TRUE counts, so an IC that
 * starts true never fires — but a player who starts on the grid, trips, and re-syncs still
 * gets credit once the trip has been observed. Each case below is proven to go red via the
 * matching injection in the table above; run with --inject=<name> to watch it happen. */
(function () {
  // ---- an IC that starts true: no on_grid, ever, for this session --------------------
  (function () {
    var a = loadTEL();
    a.TEL.tick(snap(50, false, 0));      // first observation: already on the grid
    a.TEL.tick(snap(52, false, 5));      // stays on the grid
    ck('an IC that starts on the grid emits NO on_grid milestone',
      milestoneNames(a.events).indexOf('on_grid') === -1,
      JSON.stringify(milestoneNames(a.events)));
  }());

  // ---- starts off the grid, then generates: on_grid DOES fire ------------------------
  (function () {
    var a = loadTEL();
    a.TEL.tick(snap(0, false, 0));       // observed false first
    a.TEL.tick(snap(0, false, 3));
    a.TEL.tick(snap(40, false, 8));      // the transition
    ck('a session that starts off the grid and then generates DOES emit on_grid',
      milestoneNames(a.events).indexOf('on_grid') !== -1,
      JSON.stringify(milestoneNames(a.events)));
    var ev = a.events.filter(function (e) { return e.name === 'milestone' && e.props.name === 'on_grid'; })[0];
    ck('...stamped with the sim second of the crossing, not the first tick',
      ev && ev.props.sim_seconds === 8, JSON.stringify(ev));
  }());

  // ---- starts on the grid, drops off, comes back: DOES fire (the re-sync case) -------
  (function () {
    var a = loadTEL();
    a.TEL.tick(snap(60, false, 0));      // starts true — must NOT fire yet
    ck('...has not fired while still on the initial condition',
      milestoneNames(a.events).indexOf('on_grid') === -1, JSON.stringify(milestoneNames(a.events)));
    a.TEL.tick(snap(0, false, 10));      // trips off — the false this rule requires
    a.TEL.tick(snap(45, false, 40));     // re-synchronises
    ck('a session that starts on the grid, drops off, and comes back DOES emit on_grid',
      milestoneNames(a.events).indexOf('on_grid') !== -1, JSON.stringify(milestoneNames(a.events)));
  }());

  // ---- the one-shot latch still holds across a repeat ---------------------------------
  (function () {
    var a = loadTEL();
    a.TEL.tick(snap(0, false, 0));
    a.TEL.tick(snap(30, false, 5));      // fires once
    a.TEL.tick(snap(0, false, 10));      // drops off again
    a.TEL.tick(snap(35, false, 20));     // a SECOND crossing, same session
    var hits = milestoneNames(a.events).filter(function (n) { return n === 'on_grid'; });
    ck('the one-shot latch still holds across a repeat crossing in the same session',
      hits.length === 1, JSON.stringify(milestoneNames(a.events)));
  }());

  // ---- a reload does not duplicate an already-fired milestone -------------------------
  (function () {
    var store = mkStore();
    var a = loadTEL({ storage: store });
    a.TEL.tick(snap(0, false, 0));
    a.TEL.tick(snap(30, false, 5));      // fires under the first TEL instance
    var b = loadTEL({ storage: store }); // "reload": same sessionStorage, a fresh TEL
    b.TEL.tick(snap(31, false, 6));      // still on the grid post-reload
    ck('a reload of an already-fired session does not re-emit on_grid',
      milestoneNames(b.events).indexOf('on_grid') === -1, JSON.stringify(milestoneNames(b.events)));
  }());

  // ---- a reload does not LOSE a false-seen-but-not-yet-fired milestone -----------------
  (function () {
    var store = mkStore();
    var a = loadTEL({ storage: store });
    a.TEL.tick(snap(0, false, 0));       // observed false, not yet fired
    var b = loadTEL({ storage: store }); // "reload" before the transition ever happened
    b.TEL.tick(snap(40, false, 12));     // the transition, under the reloaded TEL
    ck('a reload does not lose a false-seen-but-not-yet-crossed on_grid',
      milestoneNames(b.events).indexOf('on_grid') !== -1, JSON.stringify(milestoneNames(b.events)));
  }());

  // ---- core_damage goes through the SAME rule (shape check, not a live defect) --------
  (function () {
    var a = loadTEL();
    a.TEL.tick(snap(10, true, 0));       // an IC that starts damaged: must not fire
    ck('core_damage does not fire on an already-damaged initial condition',
      milestoneNames(a.events).indexOf('core_damage') === -1, JSON.stringify(milestoneNames(a.events)));
    var b = loadTEL();
    b.TEL.tick(snap(10, false, 0));
    b.TEL.tick(snap(10, true, 30));      // the transition
    ck('core_damage fires on a genuine false -> true transition',
      milestoneNames(b.events).indexOf('core_damage') !== -1, JSON.stringify(milestoneNames(b.events)));
  }());

  // ---- scram is UNCHANGED: an event, not a state test, and takes no falseSeen key -----
  (function () {
    var raw = require('fs').readFileSync(path.join(ROOT, 'ui', 'app.js'), 'utf8');
    ck("scram still fires from the recorder's EVENT (type === 'scram'), not a state test",
      raw.indexOf("if (type === 'scram') TEL.milestone('scram', t);") !== -1,
      'the scram hook moved — this file was not supposed to touch it');
  }());

  // ============================= the plant_mode FUNNEL's own baseline (2026-09-20+5) ====
  /* `lastMode` starts null, so the FIRST mode a session ever observes always "differed"
   * and fired — recording where a session STARTED as a mode it REACHED. Measured
   * 2026-09-20: mode-1 read 69 sessions and 69 sessions STARTED at hot_full_power; mode-5
   * read 24 and 21 STARTED at cold_shutdown. `modeWasKnown` suppresses only that one
   * emission per session; plant_mode itself is NOT one-shot (unlike milestone()) — every
   * later transition, including one already visited, must keep firing. */

  // ---- the very first mode a session observes does not fire -------------------------
  (function () {
    var a = loadTEL();
    a.TEL.tick(snap(50, false, 0, 1));   // first observation: Mode 1
    a.TEL.tick(snap(52, false, 5, 1));   // unchanged
    ck('the first plant_mode observation this session emits NOTHING',
      modeSeq(a.events).length === 0, JSON.stringify(modeSeq(a.events)));
  }());

  // ---- a session that starts at mode 1 and never changes emits NOTHING --------------
  (function () {
    var a = loadTEL();
    for (var i = 0; i < 5; i++) a.TEL.tick(snap(50, false, i * 10, 1));
    ck('a session that never changes mode emits no plant_mode at all',
      modeSeq(a.events).length === 0, JSON.stringify(modeSeq(a.events)));
  }());

  // ---- a later transition still fires, exactly as before -----------------------------
  (function () {
    var a = loadTEL();
    a.TEL.tick(snap(0, false, 0, 5));    // baseline: Mode 5 — no emission
    a.TEL.tick(snap(0, false, 20, 4));   // a real transition
    a.TEL.tick(snap(20, false, 40, 3));  // and another
    ck('a later transition still emits plant_mode',
      JSON.stringify(modeSeq(a.events)) === JSON.stringify([4, 3]),
      JSON.stringify(modeSeq(a.events)));
  }());

  // ---- starts at mode 5, works up: every mode ENTERED fires, not the one begun in ----
  (function () {
    var a = loadTEL();
    a.TEL.tick(snap(0, false, 0, 5));
    a.TEL.tick(snap(0, false, 30, 4));
    a.TEL.tick(snap(0, false, 60, 3));
    a.TEL.tick(snap(0, false, 90, 2));
    a.TEL.tick(snap(80, false, 120, 1));
    ck('a session climbing from mode 5 emits every mode entered, but not the one begun in',
      JSON.stringify(modeSeq(a.events)) === JSON.stringify([4, 3, 2, 1]),
      JSON.stringify(modeSeq(a.events)));
  }());

  // ---- revisiting a mode already seen this session still fires (not one-shot) --------
  (function () {
    var a = loadTEL();
    a.TEL.tick(snap(0, false, 0, 3));
    a.TEL.tick(snap(0, false, 10, 4));
    a.TEL.tick(snap(0, false, 20, 3));   // back to 3 — a milestone would suppress this
    ck('plant_mode is not one-shot: a revisited mode fires again',
      JSON.stringify(modeSeq(a.events)) === JSON.stringify([4, 3]),
      JSON.stringify(modeSeq(a.events)));
  }());

  // ---- a reload mid-session does not re-emit the baseline -----------------------------
  (function () {
    var store = mkStore();
    var a = loadTEL({ storage: store });
    a.TEL.tick(snap(0, false, 0, 3));    // baseline established and persisted
    var b = loadTEL({ storage: store }); // "reload": same sessionStorage, a fresh TEL
    b.TEL.tick(snap(0, false, 5, 3));    // still mode 3 post-reload
    ck('a reload of an established baseline does not re-emit it',
      modeSeq(b.events).length === 0, JSON.stringify(modeSeq(b.events)));
  }());

  // ---- a genuine transition, discovered on the FIRST tick after a reload, still fires --
  /* THE DISCRIMINATING CASE for persistence specifically: if the reload's first tick
   * repeats the pre-reload mode (as above), an unpersisted `lastMode` still "recovers" by
   * treating that repeat as its own new baseline — same value, so nothing LOOKS lost. Only
   * a mode that already changed by the time of that first post-reload tick exposes it: an
   * unpersisted baseline reads this as a fresh session's first mode and swallows it. */
  (function () {
    var store = mkStore();
    var a = loadTEL({ storage: store });
    a.TEL.tick(snap(0, false, 0, 3));     // baseline: mode 3, established and persisted
    var b = loadTEL({ storage: store });  // "reload": same sessionStorage, a fresh TEL
    b.TEL.tick(snap(60, false, 5, 1));    // already at mode 1 on the very first post-reload tick
    ck('a transition already true on the first tick after a reload still fires',
      JSON.stringify(modeSeq(b.events)) === JSON.stringify([1]), JSON.stringify(modeSeq(b.events)));
    b.TEL.tick(snap(60, false, 20, 1));   // unchanged
    ck('...and does not repeat while unchanged',
      JSON.stringify(modeSeq(b.events)) === JSON.stringify([1]), JSON.stringify(modeSeq(b.events)));
  }());

  // ---- storage refusal: the first tick is still suppressed, never a spurious fire ----
  (function () {
    var a = loadTEL({ noStorage: true });
    a.TEL.tick(snap(0, false, 0, 5));
    ck('a storage refusal does not turn the first tick into an emission',
      modeSeq(a.events).length === 0, JSON.stringify(modeSeq(a.events)));
    a.TEL.tick(snap(0, false, 10, 4));   // a real transition, still detected in-memory
    ck('...but a later transition in the SAME session (no reload) still fires',
      JSON.stringify(modeSeq(a.events)) === JSON.stringify([4]), JSON.stringify(modeSeq(a.events)));
  }());
}());

// ======================================================= path 2 is a separate path
// Run WITHOUT compression first: the body is plain JSON and can be read directly.
// Consent is deliberately left UNDECIDED throughout — pressing send in the feedback
// form is the consent, and someone who refused passive collection must still be able
// to report a bug. That is the whole reason path 2 does not call granted().
(function () {
  var a = load({ noCompression: true });
  return a.T.sendBundle({ kind: 'reactor_dynamics_diagnosis' }, 'the rods did nothing')
    .then(function (res) {
      // #431: the Worker names the stored object after this id and hands it back so the
      // reporter can quote it. sendBundle used to return only {ok, status} and drop it,
      // which left the id existing nowhere a human could reach.
      ck('sendBundle hands the report id back to the caller',
        res && res.id === 'msmiercb-46iji16v', JSON.stringify(res));
      ck('sendBundle posts without consent being granted', a.sent.length === 1,
        'sent=' + a.sent.length);
      ck('the bundle goes to its own ?kind=bundle route',
        a.sent.length === 1 && /kind=bundle/.test(a.sent[0].url), a.sent.length ? a.sent[0].url : '');
      var b = JSON.parse(a.sent[0].body);
      ck('the bundle carries the typed note', b.note === 'the rods did nothing', b.note);
      ck('the bundle carries the recording', b.bundle && b.bundle.kind === 'reactor_dynamics_diagnosis');
      ck('an over-long note is capped at 4000 chars', true);
      return a.T.sendBundle({ kind: 'x' }, 'y'.repeat(9999)).then(function () {
        var b2 = JSON.parse(a.sent[1].body);
        ck('an over-long note is capped', b2.note.length === 4000, 'len=' + b2.note.length);
      });
    })
    .then(function () {
      // And the compressed path a real browser takes: same content, gzip-encoded.
      var c = load();
      return c.T.sendBundle({ kind: 'reactor_dynamics_diagnosis' }, 'compressed note')
        .then(function () {
          var s = c.sent[0];
          ck('the compressed path declares Content-Encoding: gzip',
            s && s.headers && s.headers['Content-Encoding'] === 'gzip', JSON.stringify(s && s.headers));
          return s.body.arrayBuffer().then(function (ab) {
            var raw = require('zlib').gunzipSync(Buffer.from(ab)).toString('utf8');
            var b3 = JSON.parse(raw);
            ck('the gzipped body decompresses to the same payload',
              b3.note === 'compressed note' && b3.kind === 'session_bundle', raw.slice(0, 60));
            ck('compression is worth doing', Buffer.from(ab).length < raw.length,
              Buffer.from(ab).length + ' vs ' + raw.length);
          });
        });
    })
    .then(function () {
      // A response with no readable body — an opaque one, or an edge answering HTML on an
      // error. Reading the id must not be able to turn a report that ARRIVED into a failure.
      var d = load({ bodyless: true });
      return d.T.sendBundle({ kind: 'reactor_dynamics_diagnosis' }, 'no body').then(function (res) {
        ck('a response with no readable body still resolves ok', !!(res && res.ok === true), JSON.stringify(res));
        ck('…and simply carries no id', !(res && res.id), JSON.stringify(res));
      });
    });
}())
  .then(function () {
    // ============================================ the wire budget and the terminal catch
    //
    // #681: a 4-plant-hour report posted 3,006,146 bytes against the Worker's 2 MiB cap and
    // was answered 413; every report from 2 h 45 min of plant time onward was rejected for
    // the rest of the session, and nothing on this side had ever measured. #682: a POST that
    // failed at the NETWORK level resolved neither branch of the caller's `.then`, so the
    // form read "Sending…" at 45 s with Send permanently disabled.
    //
    // These drive the real module with the real recorder. The budget is passed explicitly at
    // a small value in the mechanics cases: the loop is scale-free and a gate that had to
    // build two megabytes to prove it would cost seconds for nothing. The DEFAULT budget is
    // asserted separately, against the Worker's constant.
    var fs = require('fs');
    var cap = load({}).T;
    ck('the default wire budget sits under the Worker\'s cap',
      cap.WIRE_CAP === 2 * 1024 * 1024 && cap.WIRE_BUDGET === 2 * 1024 * 1024 - 128 * 1024 &&
      cap.WIRE_BUDGET < cap.WIRE_CAP,
      cap.WIRE_BUDGET + ' of ' + cap.WIRE_CAP);

    // ---- it fits: nothing is trimmed --------------------------------------------------
    var fits = load({ withRecorder: true, noCompression: true });
    var small = mkBundle(50);
    return fits.T.sendBundle(small, 'short session', { maxBytes: 5 * 1024 * 1024 })
      .then(function (res) {
        ck('a bundle inside the budget is posted whole', !!(res && res.ok) && !res.trimmed_rows,
          JSON.stringify({ ok: res.ok, trimmed: res.trimmed_rows, bytes: res.bytes }));
        ck('...with every row still on it',
          JSON.parse(fits.sent[0].body).bundle.timeseries.t.length === 50,
          String(JSON.parse(fits.sent[0].body).bundle.timeseries.t.length));
        ck('...and no `trimmed` note in the manifest',
          !JSON.parse(fits.sent[0].body).bundle.manifest.trimmed);
      })
      .then(function () {
        // ---- it does not fit: OLDEST rows go until it does ------------------------------
        // *(OWNER, 2026-09-09, #675: "When we hit the max length we can send for feedback we
        // should trim older data. Usually the most recent data is the most relevant.")*
        var big = load({ withRecorder: true, noCompression: true });
        var b = mkBundle(4000);
        var wholeRows = b.timeseries.t.length, newestT = b.timeseries.t[wholeRows - 1];
        return big.T.sendBundle(b, 'long session', { maxBytes: 40000 }).then(function (res) {
          ck('an over-budget bundle is still SENT', !!(res && res.ok), JSON.stringify(res && res.reason));
          ck('...after dropping rows', res.trimmed_rows > 0, String(res.trimmed_rows));
          // Read the wire DEFENSIVELY. When the trim is unwired there is no request at all,
          // and a gate that indexes `sent[-1]` dies with a TypeError instead of naming which
          // property failed — a crash is red, but it is red about the gate, not about the
          // defect. Every check below has to be able to report on an empty wire.
          var wire = big.sent[big.sent.length - 1] || null;
          var posted = wire ? JSON.parse(wire.body) : null;
          var pts = (posted && posted.bundle && posted.bundle.timeseries) || null;
          ck('...and something actually went on the wire', !!pts, wire ? 'no timeseries' : 'no request');
          ck('...and what went is under the budget',
            !!wire && bodyBytes(wire.body) <= 40000,
            wire ? bodyBytes(wire.body) + ' B of 40000' : 'nothing posted');
          ck('...the rows that went are the OLDEST, and the newest survived',
            !!pts && pts.t.length < wholeRows && pts.t[0] > 0 && pts.t[pts.t.length - 1] === newestT,
            pts ? (pts.t.length + ' of ' + wholeRows + ' rows, ' + pts.t[0] + '..' + pts.t[pts.t.length - 1]) : 'nothing posted');
          ck('...every column was cut with `t`',
            !!pts && pts.v.concat(pts.lo).concat(pts.hi).every(function (c) { return c.length === pts.t.length; }));
          // A reader must not mistake a trimmed window for the whole session.
          ck('...and the bundle SAYS its window was cut',
            !!(posted && posted.bundle.manifest.trimmed && posted.bundle.manifest.trimmed.rows_dropped > 0),
            posted ? JSON.stringify(posted.bundle.manifest.trimmed) : 'nothing posted');
        });
      })
      .then(function () {
        // ---- the gzip path measures the GZIPPED body, not the JSON ----------------------
        // The distinction is the whole reason a raw-JSON budget was rejected: it would have
        // thrown away half the history of a 4-hour report that compresses to 32 % of the cap.
        var gz = load({ withRecorder: true });
        var b = mkBundle(4000);
        var jsonBytes = Buffer.byteLength(JSON.stringify({ v: 1, bundle: b }), 'utf8');
        return gz.T.sendBundle(b, 'compressed', { maxBytes: Math.floor(jsonBytes / 2) })
          .then(function (res) {
            ck('the gzip path counts the compressed body, so nothing is trimmed needlessly',
              !!(res && res.ok) && !res.trimmed_rows &&
              bodyBytes(gz.sent[0].body) < jsonBytes / 2,
              bodyBytes(gz.sent[0].body) + ' B gzipped vs ' + jsonBytes + ' B of JSON, budget ' +
              Math.floor(jsonBytes / 2));
          });
      })
      .then(function () {
        // ---- nothing left to give: say WHICH failure it was, and do not post it ----------
        var stuck = load({ withRecorder: true, noCompression: true });
        var n0 = stuck.sent.length;
        return stuck.T.sendBundle(mkBundle(120), 'no room', { maxBytes: 200 }).then(function (res) {
          ck('a bundle that cannot be made to fit resolves as too large',
            !!(res && res.ok === false && res.tooLarge === true && res.status === 413),
            JSON.stringify({ ok: res.ok, tooLarge: res.tooLarge, status: res.status }));
          ck('...and is NOT posted, so the wire does not carry a doomed body',
            stuck.sent.length === n0, (stuck.sent.length - n0) + ' requests');
          // The message is the one that tells the player what to DO about it.
          ck('...and the form is told to untick the attachment',
            /too large/.test(stuck.T.sendResultMessage(res)) &&
            /Attach this session/.test(stuck.T.sendResultMessage(res)),
            stuck.T.sendResultMessage(res));
        });
      })
      .then(function () {
        // ---- #682: the network never answers --------------------------------------------
        // THE ASSERTION IS THAT THE PROMISE FULFILS, not merely that it settles. A REJECTION
        // is the defect: `T.sendBundle(...).then(cb)` in ui/app.js never calls cb on one, so
        // the button stays disabled and the status stays "Sending…" for the life of the page.
        // Caught both ways here so the gate REPORTS it rather than dying on it.
        var dead = load({ withRecorder: true, noCompression: true, networkFails: true });
        var out = null;
        return dead.T.sendBundle(mkBundle(20), 'connection dies').then(
          function (res) { out = { fulfilled: true, res: res }; },
          function (e) { out = { fulfilled: false, err: String(e) }; }
        ).then(function () {
          ck('a network-level failure FULFILS the promise — a rejection is what left the form on "Sending…"',
            !!(out && out.fulfilled), JSON.stringify(out));
          var res = out.fulfilled ? out.res : null;
          ck('...resolving to a failure the caller can read', !!res && res.ok === false,
            JSON.stringify(res));
          ck('...that says it was the network, not the server',
            !!(res && res.network === true && /Failed to fetch/.test(String(res.reason))),
            JSON.stringify(res));
          ck('...so the form gets a sentence with a retry in it',
            /Could not send/.test(dead.T.sendResultMessage(res)) &&
            /Send report again/.test(dead.T.sendResultMessage(res)),
            dead.T.sendResultMessage(res));
        });
      })
      .then(function () {
        // ---- the success sentence still carries the reference id (#431) ------------------
        var okc = load({ withRecorder: true, noCompression: true });
        return okc.T.sendBundle(mkBundle(10), 'fine').then(function (res) {
          ck('a successful send still quotes the report id back at the player',
            okc.T.sendResultMessage(res) === 'Sent — thank you. Reference msmiercb-46iji16v',
            okc.T.sendResultMessage(res));
        });
      })
      .then(function () {
        // ---- ui/app.js must actually USE it ---------------------------------------------
        // A source scan, and it is the weak kind on purpose: everything above proves the
        // module, and nothing in Node can execute app.js. What it can prove is that the
        // browser half has not gone back to choosing its own words or to a one-branch
        // `.then`, which is the shape #682 was.
        var app = fs.readFileSync(path.join(ROOT, 'ui', 'app.js'), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
        ck('app.js renders the status from sendResultMessage', /sendResultMessage\(/.test(app));
        ck('app.js gives sendBundle a rejection branch too',
          /sendBundle\([^)]*\)\.then\(settle,/.test(app),
          (app.match(/.{0,30}sendBundle\(.{0,60}/) || [''])[0]);
        ck('app.js no longer hardcodes the failure sentence',
          !/Could not send/.test(app),
          (app.match(/.{0,40}Could not send.{0,40}/) || [''])[0]);
      });
  })
  .then(function () {
    /* ========================= the referrer, the country and the bot flag (2026-09-20)
     *
     * WHAT THIS IS FOR. Country, referrer, device and a bot flag reach us ONLY through
     * Cloudflare's injected RUM beacon; the nightly rollup mirrors them into our own D1
     * while they are still inside Cloudflare's 7-day exact window, so the STORE is ours
     * and the COLLECTION is not. Content blockers remove that beacon, so the series is
     * structurally incomplete by an amount it cannot measure about itself. These checks
     * cover the same two facts arriving on OUR path, which is not blocked, plus a bot
     * classification of our own *(OWNER RULINGS, 2026-09-20: "We don't need to change
     * privacy.html. We are just doing what cloudflare already does." and "We should also
     * classify bots.")*.
     *
     * The Worker helpers are LIFTED OUT AND EXECUTED, not grepped — the keyOf idiom
     * earlier in this file, and for the same reason: a source scan can certify a
     * classifier that classifies nothing (#485). They are pure and import nothing, which
     * is the only reason it is possible. */
    var fs = require('fs');

    // ---- the client sends a HOST, and never the rest of the URL ---------------------
    var q = load({ referrer: 'https://www.google.com/search?q=nuclear+plant+simulator+tim+holt' });
    ck('the referrer is reduced to its host', q.T._refHost() === 'www.google.com', q.T._refHost());
    q.T.event('page_view', { page: 'home' });
    q.T.flush();
    var body = (q.sent[0] || {}).body || '';
    var env = {};
    try { env = JSON.parse(body); } catch (e) { /* reported by the checks below */ }
    ck('THE ENVELOPE CARRIES THE HOST', env.ref === 'www.google.com', JSON.stringify(env.ref));
    /* The load-bearing one. A query string on a search referrer is the visitor's own
     * words, and the whole point of sending a host is that they never leave the page. */
    ck('...and NOT the path or the query — the search terms never leave the page',
      body.indexOf('/search') < 0 && body.indexOf('q=nuclear') < 0 && body.indexOf('tim+holt') < 0,
      body.slice(0, 160));
    ck('...and nothing host-shaped carries a slash, a colon, a query or a fragment',
      !/[/?#: ]/.test(String(env.ref || '')), JSON.stringify(env.ref));

    var noRef = load({ referrer: '' });
    noRef.T.event('page_view', { page: 'home' });
    noRef.T.flush();
    ck('no referrer sends an empty string, not "undefined" or a missing field',
      JSON.parse((noRef.sent[0] || {}).body || '{}').ref === '', '');

    var noDoc = load();
    noDoc.T.event('page_view', { page: 'home' });
    noDoc.T.flush();
    ck('a runtime with no document still sends — the field is empty, not absent',
      JSON.parse((noDoc.sent[0] || {}).body || '{}').ref === '', '');

    var same = load({ referrer: 'https://reactordynamics.com/about.html' });
    ck('an internal hop sends its host too — CLASSIFYING it is the receiver\'s job',
      same.T._refHost() === 'reactordynamics.com', same.T._refHost());

    /* THE FALLBACK PATH, which no browser in production takes and every check above
     * therefore skips. Without `URL` the host is cut by hand, and credentials and a port
     * are exactly what a hand-written cut forgets. */
    var savedURL = globalThis.URL;
    Object.defineProperty(globalThis, 'URL', { value: undefined, writable: true, configurable: true });
    try {
      var fb = load({ referrer: 'https://user:pw@evil.example.com:8443/p?q=secret' });
      ck('with no URL constructor the host is still cut by hand, without userinfo or port',
        fb.T._refHost() === 'evil.example.com', fb.T._refHost());
      var fb2 = load({ referrer: 'evil.example.com/search?q=secret' });
      ck('...and a value that is not a URL at all is dropped WHOLE, never trimmed',
        fb2.T._refHost() === '', fb2.T._refHost());
    } finally {
      Object.defineProperty(globalThis, 'URL', { value: savedURL, writable: true, configurable: true });
    }
    var six = load({ referrer: 'https://[::1]:8080/p' });
    ck('an IPv6 literal is not host-shaped and is dropped, not passed through',
      six.T._refHost() === '', six.T._refHost());

    // ---- the Worker: the three edge facts, EXECUTED ---------------------------------
    var wsrc = readSrc('worker/src/index.js');
    var mHost = /function hostOf\(v\) \{[\s\S]*?\r?\n\}/.exec(wsrc);
    var mCtry = /function edgeCountry\(request\) \{[\s\S]*?\r?\n\}/.exec(wsrc);
    var mBot = /const BOT_PATTERNS = \[[\s\S]*?\r?\n\];\r?\nfunction botClass\(ua\) \{[\s\S]*?\r?\n\}/.exec(wsrc);
    ck('the Worker\'s hostOf was found', !!mHost);
    ck('the Worker\'s edgeCountry was found', !!mCtry);
    ck('the Worker\'s bot classifier was found', !!mBot);

    if (mHost) {
      var hostOf = new Function(mHost[0] + '; return hostOf;')();
      ck('the receiver re-cuts a full URL to its host — the client is never trusted',
        hostOf('https://www.google.com/search?q=secret') === 'www.google.com',
        hostOf('https://www.google.com/search?q=secret'));
      ck('...a bare host passes through unchanged',
        hostOf('news.ycombinator.com') === 'news.ycombinator.com', hostOf('news.ycombinator.com'));
      ck('...a host WITH a path and no scheme is dropped whole, not trimmed',
        hostOf('news.ycombinator.com/item?id=1') === '', hostOf('news.ycombinator.com/item?id=1'));
      ck('...userinfo, port and case are all removed',
        hostOf('HTTPS://User:Pw@Example.COM:8443/p') === 'example.com',
        hostOf('HTTPS://User:Pw@Example.COM:8443/p'));
      ck('...an absurd length is refused rather than truncated',
        hostOf('a'.repeat(300) + '.com') === '', String(hostOf('a'.repeat(300) + '.com')).length + ' chars');
      var hostile = ['https://x.test/a/b?c=d#e', 'javascript:alert(1)', '../../etc/passwd',
        'https://x.test/?note=i typed this', '', null, undefined, 12345,
        'https://[::1]/p', 'http://10.0.0.1:99/x?y'];
      ck('NO INPUT PRODUCES ANYTHING BUT A BARE HOST OR AN EMPTY STRING',
        hostile.every(function (v) { var o = hostOf(v); return o === '' || /^[a-z0-9.-]+$/.test(o); }),
        hostile.map(function (v) { return JSON.stringify(hostOf(v)); }).join(' '));
    }

    if (mCtry) {
      var edgeCountry = new Function(mCtry[0] + '; return edgeCountry;')();
      var req = function (cf, hdr) {
        return { cf: cf, headers: { get: function (k) { return k === 'CF-IPCountry' ? (hdr || null) : null; } } };
      };
      ck('the country comes from the edge object', edgeCountry(req({ country: 'US' })) === 'US');
      ck('...or from the CF-IPCountry header when there is no cf object',
        edgeCountry(req(null, 'GB')) === 'GB', edgeCountry(req(null, 'GB')));
      ck('..."unknown" and Tor are real answers and are kept as they come',
        edgeCountry(req({ country: 'XX' })) === 'XX' && edgeCountry(req({ country: 'T1' })) === 'T1', '');
      ck('...and anything that is not a two-character code is refused',
        edgeCountry(req({ country: 'United States' })) === '' && edgeCountry(req(null)) === '', '');
      /* THE STANDING PROMISE, as a source fact rather than a behaviour: the address is a
       * rate-limit key and nothing else. A country DERIVED here instead of taken from the
       * edge would put it in a variable in the write path, which is how a promise like
       * this one gets broken by someone being helpful. */
      ck('THE VISITOR ADDRESS IS NOWHERE NEAR THE COUNTRY — it is taken, not derived',
        !/CF-Connecting-IP/.test(mCtry[0]), mCtry[0].replace(/\s+/g, ' ').slice(0, 120));
    }

    /* THE IP, ONCE, AND ONLY AS A RATE-LIMIT KEY. Counted over the whole Worker rather
     * than asserted about one function: the promise at the top of index.js is about the
     * FILE, and a second reader added anywhere is the thing that would break it. */
    /* CODE ONLY. The header and the `scheduled()` comment both NAME the header, because
     * explaining the promise requires saying what it is about — counting those would make
     * this check red for documenting itself, which is the surest way to get the comment
     * deleted instead of the defect fixed. The `[^:]` guard on the line-comment strip is
     * the standing idiom in this file: without it every `https://` eats its own line. */
    var wCode = wsrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    var ipHits = (wCode.match(/CF-Connecting-IP/g) || []).length;
    /* REWRITTEN FOR #797: the address is still read exactly once, but the two limiters
     * that key off it are chosen by a ternary rather than a single fixed binding — the
     * old regex required `env.LIMITER` immediately before the CF-Connecting-IP read, and
     * that ordering is gone now that the route decides which binding to ask FIRST. */
    ck('the Worker READS the visitor address exactly once, and both limiters key off it',
      ipHits === 1 &&
      /CF-Connecting-IP'\)\s*\|\|\s*'unknown';[\s\S]{0,150}env\.BUNDLE_LIMITER[\s\S]{0,60}env\.LIMITER;[\s\S]{0,200}limiter\.limit\(\{\s*key:\s*ip\s*\}\)/.test(wCode),
      ipHits + ' occurrence(s) in code');
    var wBody = (/writeDataPoint\(\{([\s\S]*?)\n    \}\);/.exec(wsrc) || [])[1] || '';
    ck('...and nothing about the address reaches the ordinary EVENT row that is written',
      !!wBody && !/CF-Connecting-IP|\bip\b/i.test(wBody), wBody ? '' : 'writeDataPoint body not found');
    /* THE SECOND WRITE SITE (#797): recordThrottle's own row. Found independently of the
     * one above — it is the LAST writeDataPoint in the file, appended after handleBundle —
     * so a defect in either one cannot hide behind the other going green. */
    var mThrottleFn = /function recordThrottle\(env, route\) \{[\s\S]*?\r?\n\}/.exec(wsrc);
    ck('recordThrottle was found', !!mThrottleFn);
    if (mThrottleFn) {
      ck('recordThrottle takes no request and reads no header — it cannot leak the '
        + 'address even by a later, careless edit',
        !/\brequest\b|\bheaders\b|CF-Connecting-IP/.test(mThrottleFn[0]), mThrottleFn[0]);
      var mThrottleBody = (/env\.EVENTS\.writeDataPoint\(\{([\s\S]*?)\n  \}\);/.exec(mThrottleFn[0]) || [])[1] || '';
      ck('...and its own writeDataPoint body carries no IP either',
        !!mThrottleBody && !/CF-Connecting-IP|\bip\b/i.test(mThrottleBody),
        mThrottleBody ? mThrottleBody : 'recordThrottle writeDataPoint body not found');
    }

    if (mBot) {
      var botClass = new Function(mBot[0] + '; return botClass;')();
      var CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
      var IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      var FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
      ck('a real desktop browser is NOT a bot', botClass(CHROME) === '', botClass(CHROME));
      ck('a real phone browser is NOT a bot', botClass(IPHONE) === '', botClass(IPHONE));
      ck('a real Firefox is NOT a bot', botClass(FIREFOX) === '', botClass(FIREFOX));
      ck('a search crawler classifies as crawler',
        botClass('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)') === 'crawler',
        botClass('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'));
      ck('an unrecognised self-declared bot still classifies as crawler',
        botClass('SomeNewThing-Bot/1.0 (+https://example.test)') === 'crawler',
        botClass('SomeNewThing-Bot/1.0 (+https://example.test)'));
      /* ORDER, AND IT IS NOT COSMETIC: Slackbot, Twitterbot and their kin all contain
       * "bot", so the generic crawler pattern would swallow the whole preview family and
       * every shared link would read as a crawl. */
      ck('a link unfurl is a PREVIEW, not a crawler — the families are matched in order',
        botClass('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)') === 'preview',
        botClass('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'));
      ck('...and so is Twitter\'s, which also has "bot" in its name',
        botClass('Twitterbot/1.0') === 'preview', botClass('Twitterbot/1.0'));
      ck('a command-line tool classifies as tool', botClass('curl/8.4.0') === 'tool', botClass('curl/8.4.0'));
      ck('a driven browser classifies as headless',
        botClass('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36') === 'headless',
        botClass('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36'));
      ck('an ABSENT User-Agent is "no-ua", which is a signal, not a blank',
        botClass('') === 'no-ua' && botClass(null) === 'no-ua' && botClass(undefined) === 'no-ua', '');
      /* THE HONEST CAVEAT, written into the gate so it cannot be forgotten: this runs on
       * a JS beacon, and most bots execute no JavaScript. A near-zero bot rate in
       * production is therefore EXPECTED and is not evidence the classifier works — these
       * strings are. */
      ck('the classifier says in its own comment that a low live count proves nothing',
        /not evidence the classifier works/i.test(wsrc), '');
    }

    /* ---- device / browser / OS (2026-09-20+2), EXECUTED the same way as botClass -----
     * OWNER, 2026-09-20: "Can we start to link device to session along with other info
     * like country, etc?" Real fixture UAs, one per family, chosen to hit the FOUR
     * ordering traps the task brief named directly: iPadOS Safari reporting a Mac UA
     * (device only — this classifier cannot win that one, and MACOS_SAFARI below proves
     * it does NOT false-positive a real Mac into 'tablet' instead), Edge's UA carrying
     * "Chrome" AND "Safari", Chrome's UA carrying "Safari", and an Android UA telling a
     * tablet from a phone by the ABSENCE of "Mobile". */
    var mDevice = /function deviceClass\(ua\) \{[\s\S]*?\r?\n\}/.exec(wsrc);
    var mBrowser = /const BROWSER_PATTERNS = \[[\s\S]*?\r?\n\];\r?\nfunction browserClass\(ua\) \{[\s\S]*?\r?\n\}/.exec(wsrc);
    var mOs = /function osClass\(ua\) \{[\s\S]*?\r?\n\}/.exec(wsrc);
    ck('the Worker\'s device classifier was found', !!mDevice);
    ck('the Worker\'s browser classifier was found', !!mBrowser);
    ck('the Worker\'s OS classifier was found', !!mOs);

    if (mDevice && mBrowser && mOs) {
      var deviceClass = new Function(mDevice[0] + '; return deviceClass;')();
      var browserClass = new Function(mBrowser[0] + '; return browserClass;')();
      var osClass = new Function(mOs[0] + '; return osClass;')();

      var CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
      var IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      var FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
      var EDGE_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0';
      var OPERA_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0';
      var SAMSUNG_AND = 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36';
      var ANDROID_PHONE = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
      var ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      var IPAD_NAMED = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      var MACOS_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
      var CROS_CHROME = 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

      ck('a desktop Chrome/Windows visit is desktop/chrome/windows',
        deviceClass(CHROME_WIN) === 'desktop' && browserClass(CHROME_WIN) === 'chrome' && osClass(CHROME_WIN) === 'windows',
        deviceClass(CHROME_WIN) + '/' + browserClass(CHROME_WIN) + '/' + osClass(CHROME_WIN));
      ck('an iPhone Safari visit is mobile/safari/ios',
        deviceClass(IPHONE_SAFARI) === 'mobile' && browserClass(IPHONE_SAFARI) === 'safari' && osClass(IPHONE_SAFARI) === 'ios',
        deviceClass(IPHONE_SAFARI) + '/' + browserClass(IPHONE_SAFARI) + '/' + osClass(IPHONE_SAFARI));
      ck('a desktop Firefox/Linux visit is desktop/firefox/linux',
        deviceClass(FIREFOX_LINUX) === 'desktop' && browserClass(FIREFOX_LINUX) === 'firefox' && osClass(FIREFOX_LINUX) === 'linux',
        deviceClass(FIREFOX_LINUX) + '/' + browserClass(FIREFOX_LINUX) + '/' + osClass(FIREFOX_LINUX));
      ck('EDGE IS EDGE, not Chrome — its UA carries "Chrome" AND "Safari" too',
        browserClass(EDGE_WIN) === 'edge', browserClass(EDGE_WIN));
      ck('OPERA IS OPERA, same trap',
        browserClass(OPERA_WIN) === 'opera', browserClass(OPERA_WIN));
      ck('SAMSUNG INTERNET IS ITS OWN CLASS, same trap, on a real device+OS reading too',
        browserClass(SAMSUNG_AND) === 'samsung' && deviceClass(SAMSUNG_AND) === 'mobile' && osClass(SAMSUNG_AND) === 'android',
        browserClass(SAMSUNG_AND) + '/' + deviceClass(SAMSUNG_AND) + '/' + osClass(SAMSUNG_AND));
      ck('a real Mac Safari visit is desktop/safari/macos — no false tablet or iOS',
        deviceClass(MACOS_SAFARI) === 'desktop' && browserClass(MACOS_SAFARI) === 'safari' && osClass(MACOS_SAFARI) === 'macos',
        deviceClass(MACOS_SAFARI) + '/' + browserClass(MACOS_SAFARI) + '/' + osClass(MACOS_SAFARI));
      ck('AN ANDROID PHONE IS MOBILE — carries "Mobile" in its UA',
        deviceClass(ANDROID_PHONE) === 'mobile', deviceClass(ANDROID_PHONE));
      ck('...AND AN ANDROID TABLET IS TABLET — told apart by the ABSENCE of "Mobile", the\n        exact trap the task named',
        deviceClass(ANDROID_TABLET) === 'tablet', deviceClass(ANDROID_TABLET));
      ck('an iPad that still names itself is TABLET, the one case this can tell from a Mac',
        deviceClass(IPAD_NAMED) === 'tablet' && osClass(IPAD_NAMED) === 'ios',
        deviceClass(IPAD_NAMED) + '/' + osClass(IPAD_NAMED));
      ck('ChromeOS is its own OS class, not swallowed by the Linux/X11 it also carries',
        osClass(CROS_CHROME) === 'chromeos', osClass(CROS_CHROME));
      ck('a command-line tool is desktop/other/other — present but unrecognised, never blank',
        deviceClass('curl/8.4.0') === 'desktop' && browserClass('curl/8.4.0') === 'other' && osClass('curl/8.4.0') === 'other',
        deviceClass('curl/8.4.0') + '/' + browserClass('curl/8.4.0') + '/' + osClass('curl/8.4.0'));
      ck('AN ABSENT User-Agent is "unknown" on all three, never "" — same marker idiom as\n        ref_kind, and it is what makes device its own predates-the-columns signal',
        deviceClass('') === 'unknown' && deviceClass(null) === 'unknown' && deviceClass(undefined) === 'unknown' &&
        browserClass('') === 'unknown' && osClass('') === 'unknown', '');
    }

    /* ---- AND THE WIRING IS RUN, not read ------------------------------------------
     * Everything above proves the three helpers. It says nothing about whether
     * handleEvents CALLS them: `const refHost = String(payload.ref || '')` would leave
     * every check above green while the receiver trusted whatever a client posted, and
     * `const country = ''` would leave the column empty for ever. Measured — both
     * injections reddened NOTHING until this block existed.
     *
     * The four assignments are lifted out and executed with the real helpers in scope,
     * the same idiom as the key composer earlier in this file. referrerKind comes from
     * rollup.js because that is where it lives and reusing it is half the point. */
    /* STARTS AT `refSent`, not `refHost`: the absent-vs-empty guard is declared above
     * refHost, and lifting from refHost left it out of scope -- ReferenceError, which at
     * least fails loudly. A line silently EXCLUDED from a lifted block would not. */
    var wireM = /  const refSent = [\s\S]*?\r?\n  const botKind = [^\r\n]*/.exec(wsrc);
    var rkM = /export function referrerKind\(refererHost, requestHost\) \{[\s\S]*?\r?\n\}/
      .exec(require('fs').readFileSync(path.join(ROOT, 'worker', 'src', 'rollup.js'), 'utf8'));
    ck('the receiver\'s edge-fact wiring was found', !!wireM);
    ck('rollup.js\'s referrerKind was found', !!rkM);
    if (wireM && rkM && mHost && mCtry && mBot) {
      var referrerKind = new Function(rkM[0].replace(/^export /, '') + '; return referrerKind;')();
      var wire = new Function('hostOf', 'referrerKind', 'edgeCountry', 'botClass',
        'payload', 'origin', 'request',
        wireM[0] + '\nreturn { refHost: refHost, refKind: refKind, country: country, botKind: botKind };');
      var mkReq = function (country, ua) {
        return { cf: { country: country }, headers: { get: function (k) { return k === 'User-Agent' ? ua : null; } } };
      };
      var w1 = wire(new Function(mHost[0] + '; return hostOf;')(), referrerKind,
        new Function(mCtry[0] + '; return edgeCountry;')(),
        new Function(mBot[0] + '; return botClass;')(),
        { ref: 'https://news.ycombinator.com/item?id=1&note=whatever' },
        'https://reactordynamics.com', mkReq('DE', 'Mozilla/5.0 (compatible; Googlebot/2.1)'));
      ck('A CLIENT THAT POSTS A FULL URL STILL YIELDS A HOST — the receiver re-cuts it',
        w1.refHost === 'news.ycombinator.com', JSON.stringify(w1.refHost));
      ck('...and an outside referrer is classified external',
        w1.refKind === 'external', w1.refKind);
      ck('THE COUNTRY IS ACTUALLY TAKEN FROM THE REQUEST, not left empty',
        w1.country === 'DE', JSON.stringify(w1.country));
      ck('...and the User-Agent is actually classified',
        w1.botKind === 'crawler', JSON.stringify(w1.botKind));
      var w2 = wire(new Function(mHost[0] + '; return hostOf;')(), referrerKind,
        new Function(mCtry[0] + '; return edgeCountry;')(),
        new Function(mBot[0] + '; return botClass;')(),
        { ref: 'reactordynamics.com' }, 'https://reactordynamics.com',
        mkReq('US', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0 Safari/537.36'));
      ck('OUR OWN HOST IS INTERNAL NAVIGATION, not discovery — the same call the\n      Cloudflare-derived series makes',
        w2.refKind === 'internal', w2.refKind);
      ck('...and an ordinary visitor is not flagged a bot',
        w2.botKind === '' && w2.country === 'US', w2.botKind + '/' + w2.country);
      var w3 = wire(new Function(mHost[0] + '; return hostOf;')(), referrerKind,
        new Function(mCtry[0] + '; return edgeCountry;')(),
        new Function(mBot[0] + '; return botClass;')(),
        {}, 'https://reactordynamics.com', mkReq('CA', 'curl/8.4.0'));
      /* THE MARKER THE ROLLUP DEPENDS ON. A row this Worker wrote always carries a
       * non-empty kind, which lets rollup.js tell a pre-column row ('' here) from a real
       * one without consulting a clock. If this can ever be '', that inference dies.
       *
       * SPLIT 2026-09-20. It used to assert an ABSENT `ref` is 'direct', bundling two
       * different facts. A client that never sends the field is NOT a direct visit, and
       * the live site does not send it until site/telemetry.js ships -- so 'direct' would
       * have recorded the whole pre-field site as typed-in traffic: a WRONG number, not a
       * missing one, and unrecoverable, because nothing downstream could separate those
       * rows later. Absent is 'unknown' now, and the two cases are asserted separately. */
      ck('an ABSENT ref field is "unknown" — the client did not report one',
        w3.refKind === 'unknown', JSON.stringify(w3.refKind));
      var w4 = wire(new Function(mHost[0] + '; return hostOf;')(), referrerKind,
        new Function(mCtry[0] + '; return edgeCountry;')(),
        new Function(mBot[0] + '; return botClass;')(),
        { ref: '' }, 'https://reactordynamics.com', mkReq('CA', 'curl/8.4.0'));
      ck('a PRESENT but empty ref IS "direct" — the browser reported no referrer',
        w4.refKind === 'direct', JSON.stringify(w4.refKind));
      ck('...and neither is ever the empty string, which is the pre-column marker',
        w3.refKind !== '' && w4.refKind !== '', JSON.stringify([w3.refKind, w4.refKind]));
    }

    // ---- the column map: APPENDED, documented, and written on every row -------------
    var noCmt = wBody.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    ck('the four 2026-09-20 blobs are APPENDED after the last one, in the documented order',
      /String\(p\.id \|\| ''\),\s*refHost,\s*refKind,\s*country,\s*botKind,\s*/.test(noCmt),
      (noCmt.match(/String\(p\.id[\s\S]{0,120}/) || [''])[0].replace(/\s+/g, ' '));
    ck('...and device/browser/os are APPENDED after THOSE, not spliced in among them',
      /country,\s*botKind,\s*deviceKind,\s*browserKind,\s*osKind,\s*\]/.test(noCmt),
      (noCmt.match(/country,[\s\S]{0,120}/) || [''])[0].replace(/\s+/g, ' '));
    /* WAS anchored on `botKind ? 1 : 0,` being the LAST double before `]`. That could not
     * survive the next append, and on 2026-09-20 it did not: `count` was appended after it,
     * which SATISFIES the property this check exists for (append, never insert) while
     * failing its literal form. Rewritten to assert the ORDER of the appended doubles, open
     * at the end, so the next append extends it instead of breaking it. */
    ck('the doubles appended since 2026-09-20 are in documented order, bot then count',
      /num\(p\.steps\),\s*botKind \? 1 : 0,\s*num\(p\.count\),/.test(noCmt),
      (noCmt.match(/num\(p\.steps\)[\s\S]{0,90}/) || [''])[0].replace(/\s+/g, ' '));
    ck('...and nothing was SPLICED IN before them — steps is still the last pre-2026-09-20 double',
      /num\(p\.step\),\s*num\(p\.steps\),/.test(noCmt),
      (noCmt.match(/num\(p\.step\),[\s\S]{0,60}/) || [''])[0].replace(/\s+/g, ' '));
    /* device/browser/os add NO new doubles (unlike bot, which paired a string with a
     * numeric flag) — Cloudflare's own deviceType/userAgentBrowser/userAgentOS on the
     * RUM series are plain TEXT columns too, so there is no boolean counterpart to omit. */
    ck('...and NO new double was added for device/browser/os — TEXT has no boolean twin',
      !/num\(p\.steps\),\s*botKind \? 1 : 0,\s*(deviceKind|browserKind|osKind)/.test(noCmt), '');
    ['blobs\\[8\\]\\s+ref_host', 'blobs\\[9\\]\\s+ref_kind', 'blobs\\[10\\]\\s+country',
     'blobs\\[11\\]\\s+bot_kind', 'doubles\\[10\\] bot',
     'blobs\\[12\\]\\s+device', 'blobs\\[13\\]\\s+browser', 'blobs\\[14\\]\\s+os'
    ].forEach(function (re) {
      ck('the column map documents ' + re.replace(/\\\\s\+|\\\\/g, ' ').replace(/\s+/g, ' '),
        new RegExp(re).test(wsrc), 'a slot claimed in code and not in the map is the next collision');
    });
    ck('the receiver reuses rollup.js\'s referrerKind rather than writing a second one',
      /import \{ runRollup, referrerKind \} from '\.\/rollup\.js';/.test(wsrc) &&
      /referrerKind\(refHost, hostOf\(origin\)\)/.test(wsrc),
      'a second classifier is how internal navigation becomes discovery');
    /* The ORIGIN's host and not the Worker's: this endpoint is a different hostname from
     * the site, so referrerKind given the request URL would file every internal hop as
     * external — and it would look right in a code read. */
    ck('...and it is handed the SITE\'s host, not the Worker\'s own',
      !/referrerKind\([^)]*url\.hostname/.test(wsrc), '');
  })
  .then(function () {
    /* ================================ the rate limiter, split in two (#797) ============
     * WHY THIS EXECUTES THE REAL WORKER rather than reading its source: "route A doesn't
     * draw on route B's budget" is a claim about BEHAVIOUR under a shared IP, and a source
     * scan can certify a ternary that is never actually reached at request time (the
     * exact shape #485/#542 already caught elsewhere in this file). mod.default.fetch is
     * driven with real `Request` objects and counting fakes for both `ratelimits`
     * bindings, the same idiom run_dashboard_auth.js already uses for handleDashboard. */
    function makeLimiter(succeedFn) {
      var l = { calls: 0 };
      l.limit = function (opts) {
        l.calls++;
        return Promise.resolve({ success: succeedFn(l.calls, opts) });
      };
      return l;
    }
    function makeEvents() {
      var rows = [];
      return { rows: rows, writeDataPoint: function (row) { rows.push(row); } };
    }
    function evReq(ip, extra) {
      var body = JSON.stringify(Object.assign({ channel: 'public', release: 'Alpha 1.7.6',
        session: 's', events: [{ e: 'session_start', p: { plant: 'pwr' } }] }, extra || {}));
      return new Request('https://telemetry.example/',
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: body });
    }
    function bnReq(ip) {
      return new Request('https://telemetry.example/?kind=bundle',
        { method: 'POST', headers: { 'CF-Connecting-IP': ip }, body: '{"kind":"x"}' });
    }

    return loadWorkerEsm('index.js', { 'cfapi.js': fakeCfapiForWorker() }).then(function (mod) {
      var IP = '203.0.113.9';

      // ---- (1) a bundle upload does not consume the events budget, and vice versa -----
      return (function () {
        var ev = makeLimiter(function () { return true; });
        var bn = makeLimiter(function () { return true; });
        var env = { LIMITER: ev, BUNDLE_LIMITER: bn, EVENTS: makeEvents(), BUNDLES: { put: function () { return Promise.resolve(); } } };
        return mod.default.fetch(evReq(IP), env).then(function () {
          ck('an events request calls only the EVENTS limiter',
            ev.calls === 1 && bn.calls === 0, 'events=' + ev.calls + ' bundle=' + bn.calls);
          return mod.default.fetch(bnReq(IP), env);
        }).then(function (res) {
          ck('a bundle upload calls only the BUNDLE limiter — the events budget is untouched',
            ev.calls === 1 && bn.calls === 1, 'events=' + ev.calls + ' bundle=' + bn.calls);
          ck('...and the bundle itself still goes through', res.status === 200, String(res.status));
        });
      }())
      // ---- (2) an events flood exhausting ITS limiter does not block a bug report -----
      .then(function () {
        var ev = makeLimiter(function (n) { return n <= 3; });   // 4th+ call refused
        var bn = makeLimiter(function () { return true; });
        var env = { LIMITER: ev, BUNDLE_LIMITER: bn, EVENTS: makeEvents(), BUNDLES: { put: function () { return Promise.resolve(); } } };
        var flood = Promise.resolve();
        for (var i = 0; i < 6; i++) { (function () { flood = flood.then(function () { return mod.default.fetch(evReq(IP), env); }); }()); }
        return flood.then(function () {
          ck('an events flood exhausted its own limiter', ev.calls === 6, 'calls=' + ev.calls);
          return mod.default.fetch(bnReq(IP), env);
        }).then(function (res) {
          ck('...and a bug report from the SAME address still goes through',
            res.status === 200 && bn.calls === 1, 'status=' + res.status + ' bundleCalls=' + bn.calls);
        });
      })
      // ---- (3) a throttled request records ITS datapoint, on the right route ----------
      .then(function () {
        var refused = makeLimiter(function () { return false; });
        var allowed = makeLimiter(function () { return true; });
        var events = makeEvents();
        var env = { LIMITER: refused, BUNDLE_LIMITER: allowed, EVENTS: events, BUNDLES: { put: function () { return Promise.resolve(); } } };
        return mod.default.fetch(evReq(IP), env).then(function (res) {
          ck('a throttled events request answers 429', res.status === 429, String(res.status));
          ck('...and writes exactly one throttle datapoint',
            events.rows.length === 1, JSON.stringify(events.rows));
          ck('...tagged as the EVENTS route (blobs[4], same slot an ordinary row\'s key uses)',
            !!events.rows[0] && events.rows[0].blobs[4] === 'events', JSON.stringify(events.rows[0]));
          ck('...under the "rate_limited" name, so it is never mistaken for a real event',
            !!events.rows[0] && events.rows[0].indexes[0] === 'rate_limited'
              && events.rows[0].blobs[0] === 'rate_limited', JSON.stringify(events.rows[0]));
          // THE LOAD-BEARING ONE (4): the row carries no trace of the address anywhere —
          // not a blob, not a double, not a key of the object — searched as JSON rather
          // than field-by-field so a later column added to the row cannot hide it. Read
          // defensively (the #-idiom in this file): a wrong row count above must not also
          // crash this one — `events.rows[0]` may not exist, which is red about THAT
          // defect, not a reason to throw here.
          ck('...and the row carries NO IP anywhere in it',
            !!events.rows[0] && JSON.stringify(events.rows[0]).indexOf(IP) === -1,
            JSON.stringify(events.rows[0]));
        });
      })
      .then(function () {
        var allowed = makeLimiter(function () { return true; });
        var refused = makeLimiter(function () { return false; });
        var events = makeEvents();
        var env = { LIMITER: allowed, BUNDLE_LIMITER: refused, EVENTS: events, BUNDLES: { put: function () { return Promise.resolve(); } } };
        return mod.default.fetch(bnReq(IP), env).then(function (res) {
          ck('a throttled bundle upload answers 429', res.status === 429, String(res.status));
          ck('...and writes a throttle datapoint tagged as the BUNDLE route',
            events.rows.length === 1 && !!events.rows[0] && events.rows[0].blobs[4] === 'bundle',
            JSON.stringify(events.rows));
          ck('...still with no IP anywhere in it',
            !!events.rows[0] && JSON.stringify(events.rows[0]).indexOf(IP) === -1,
            JSON.stringify(events.rows[0]));
        });
      })
      // ---- (5) no EVENTS binding: the limiter check still runs, nothing throws --------
      .then(function () {
        var refused = makeLimiter(function () { return false; });
        var env = { LIMITER: refused, BUNDLE_LIMITER: makeLimiter(function () { return true; }) };
        return mod.default.fetch(evReq(IP), env).then(function (res) {
          ck('a throttle with no EVENTS binding still answers 429 rather than throwing',
            res.status === 429, String(res.status));
        }, function (e) {
          ck('a throttle with no EVENTS binding still answers 429 rather than throwing', false, String(e));
        });
      });
    });
  })
  .then(function () {
    /* =========================== the dashboard's throttle line (#797) ===================
     * renderThrottleLine (worker/src/analytics.js) is a PURE function of the query rows,
     * split out from the query specifically so it can be lifted and run directly — same
     * idiom as hostOf/edgeCountry/botClass above, and for the same reason (HR10: a source
     * scan proves the string exists, not that it renders the right thing under the right
     * condition). */
    var asrc = readSrc('worker/src/analytics.js');
    var m = /function renderThrottleLine\(rows\) \{[\s\S]*?\r?\n\}/.exec(asrc);
    ck('analytics.js\'s renderThrottleLine was found', !!m);
    if (m) {
      var renderThrottleLine = new Function('esc', m[0] + '; return renderThrottleLine;')(function (s) { return String(s); });
      ck('zero rows renders NOTHING — no reassuring "0 requests" line',
        renderThrottleLine([]) === '', JSON.stringify(renderThrottleLine([])));
      ck('an all-zero total also renders nothing',
        renderThrottleLine([{ route: 'events', n: 0 }]) === '', renderThrottleLine([{ route: 'events', n: 0 }]));
      var line = renderThrottleLine([{ route: 'events', n: 3 }, { route: 'bundle', n: 1 }]);
      ck('a non-zero total renders `.warn` — the alarm colour, not a neutral tile',
        /class="warn"/.test(line), line);
      ck('...carries the total', /\b4\b/.test(line), line);
      ck('...and both routes, distinguishably',
        /events: 3/.test(line) && /bundle: 1/.test(line), line);
    }
  })
  .then(function () {
    // ------------------------------------------------- storage refused entirely
    // A browser that refuses localStorage cannot RECORD an opt-out, so under the
    // on-by-default model (2026-08-09) it collects — the inverse of the old opt-in
    // behaviour, where no storage meant no consent meant silence. This is pinned rather
    // than left implicit because it is the one place the flip made the privacy outcome
    // WORSE, and it should fail loudly if anyone changes it without meaning to.
    // RD.diagnose() reports it in words for the same reason.
    var a = load({ noStorage: true });
    ck('no storage: consent reads null', a.T.consent() === null);
    ck('no storage: collects (an opt-out cannot be persisted)',
      a.T.event('session_start', {}) === true);
    ck('no storage: an opt-out attempt does not throw', (function () {
      try { a.T.setConsent('denied'); return true; } catch (e) { return false; }
    }()));
    // ...and having failed to persist, it is still collecting. Better that than a silent
    // false promise that the setting stuck.
    ck('no storage: opt-out could not persist, so consent still reads null',
      a.T.consent() === null, String(a.T.consent()));

    // ---------------------------------------------------------------- report
    console.log('\n' + B + (fail ? R + 'FAIL' : G + 'PASS') + X + '  ' + B + 'TELEMETRY' + X +
      D + '  (' + (pass + fail) + ' checks, ' + fail + ' failed)' + X);
    failures.forEach(function (f) {
      console.log(R + '  ✗' + X + ' ' + f.name + D + '  ' + f.detail + X);
    });
    console.log('\n' + B + '─'.repeat(42) + X);
    console.log(B + (fail ? R + 'TELEMETRY: FAIL' : G + 'TELEMETRY: OK') + X +
      '  ' + (pass + fail) + ' checks, ' + fail + ' failed' +
      D + '  ·  ' + Object.keys(globalThis.RD.Telemetry.EVENTS).length + ' declared events' + X);
    if (fail) {
      console.log(D + 'These are the rules that separate analytics from surveillance.\n' +
        'Read the invariants block at the top of site/telemetry.js before changing one.' + X);
    }
    process.exit(fail ? 1 : 0);
  })
  .catch(function (e) { console.error(e); process.exit(1); });
