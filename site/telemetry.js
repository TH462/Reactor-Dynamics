/* telemetry.js — the client half of "what do people actually do in the sim".
 *
 * Two SEPARATE paths, and keeping them separate is the whole design:
 *
 *   1. AGGREGATE EVENTS  — small, named, declared below, sent automatically, and
 *      ONLY with consent. Counts and durations. No free text, ever.
 *   2. SESSION BUNDLE    — the full diagnostic recording (ui/app.js buildDiagBundle),
 *      sent ONLY when a human presses a button in the feedback form. It carries a
 *      note they typed, so it is the one path that may contain their words.
 *
 * They are separate because they answer to different rules. Path 1 is passive and
 * therefore needs consent and must be boring: a visitor who never notices it must
 * not be able to be identified by it. Path 2 is an act — the user is deliberately
 * sending a bug report — so it may carry much more, and it does not need path 1's
 * consent, because pressing "send" IS the consent. Merging them would drag path 2's
 * richness into path 1's silence, which is how analytics turns into surveillance.
 *
 * -------------------------------------------------------------------- invariants
 * These are gated by test/run_telemetry.js. Do not relax one without moving it:
 *
 *   a. Nothing is sent while consent is undecided or denied. Undeclared events are
 *      DROPPED, not queued — a queue that survives an undecided visitor is a record
 *      of someone who never agreed to one.
 *   b. Nothing is sent when there is no endpoint. A local checkout and the offline
 *      single-file build both have none, by construction (see the note below).
 *   c. Event names come from the EVENTS allowlist. An undeclared name is dropped.
 *      Same idiom as site/flags.js: the registry is the spec, and a gate reads it.
 *   d. Property VALUES may only be number | boolean | short enum string. No free
 *      text on path 1 — enforced here, not by convention.
 *   e. The session id lives in sessionStorage and is regenerated per session, so
 *      there is no identifier that follows anyone between visits.
 *
 * ------------------------------------------------------------------- the endpoint
 * `window.RD_TELEMETRY_ENDPOINT` is GENERATED at deploy, exactly like RD_CHANNEL —
 * the repo copy is empty, so a clone sends nothing without anyone remembering to
 * switch it off.
 *
 * THE OFFLINE BUILD IS THE TRAP HERE. tools/make_portable.js runs AFTER the deploy
 * stamp, so without an explicit step it would inline the production endpoint into a
 * file whose entire promise is that it never touches the network. It must blank the
 * endpoint the same way it DROPs the analytics beacons — deliberately, not by luck.
 *
 * Plain global-namespace script (CLAUDE.md, "Code conventions"): browser via
 * <script>, Node via require() into the shared global for the gate.
 */
;(function (G) {
  'use strict';
  var RD = G.RD = G.RD || {};

  // ============================================================ the event registry
  // Every automatic event, declared. `props` lists the keys it may carry and the
  // shape each is allowed to take: 'num', 'bool', or an array of permitted strings.
  // Anything not listed is dropped. Adding a row here is the deliberate act of
  // deciding to collect something.
  var EVENTS = {
    // --- shape of the visit -------------------------------------------------
    session_start: { props: { plant: ['pwr', 'rbmk', 'bwr'], initial_state: 'enum', channel: ['public', 'preview', 'dev'] } },
    // The single most useful row here: WHERE PEOPLE STOP. `last_panel` and the two
    // durations together answer "did they bounce, or did they get stuck somewhere".
    session_end:   { props: { seconds: 'num', sim_seconds: 'num', last_panel: 'enum', reached_play: 'bool' } },

    // --- what they touch ----------------------------------------------------
    // Action NAME only. Never the value — "set_rod_position" is a usage fact,
    // "set_rod_position 143" is a recording of what someone did.
    command:       { props: { action: 'enum', blocked: 'bool' } },
    panel_open:    { props: { panel: 'enum' } },

    // --- what they learn ----------------------------------------------------
    mission_start:    { props: { id: 'enum' } },
    mission_complete: { props: { id: 'enum', seconds: 'num' } },
    mission_abandon:  { props: { id: 'enum', seconds: 'num', beat: 'num' } },

    // --- the funnel ---------------------------------------------------------
    // Entered -> pressed play -> went critical -> on the grid -> full power. This
    // is the row that answers "is the startup too hard", which is the question a
    // silent user base cannot be asked directly.
    milestone:     { props: { name: ['critical', 'on_grid', 'full_power', 'scram', 'core_damage'], sim_seconds: 'num' } },
  };

  var CONSENT_KEY = 'rd_telemetry_consent';   // 'granted' | 'denied' — localStorage
  var SESSION_KEY = 'rd_telemetry_session';   // random, sessionStorage ONLY (invariant e)
  var MAX_STR = 48;                           // an enum that long is a mistake, not a value
  var BATCH_MS = 15000;
  var MAX_QUEUE = 200;

  function store(which) {
    try { return G[which] || null; } catch (e) { return null; }   // blocked cookies/storage
  }
  function endpoint() {
    var e = G.RD_TELEMETRY_ENDPOINT;
    return (typeof e === 'string' && e) ? e : null;
  }

  // ================================================================== consent
  function consent() {
    var s = store('localStorage');
    if (!s) return null;
    try {
      var v = s.getItem(CONSENT_KEY);
      return (v === 'granted' || v === 'denied') ? v : null;
    } catch (e) { return null; }
  }
  function setConsent(v) {
    var s = store('localStorage');
    if (!s) return;
    try {
      if (v === 'granted' || v === 'denied') s.setItem(CONSENT_KEY, v);
      else s.removeItem(CONSENT_KEY);
    } catch (e) { /* nothing persists; treated as undecided, which sends nothing */ }
    if (v !== 'granted') queue.length = 0;   // revoking drops what was pending
  }
  // Undecided is NOT consent. The launch prompt exists to turn null into an answer;
  // until it does, this returns false and nothing is collected.
  function granted() { return consent() === 'granted'; }

  function sessionId() {
    var s = store('sessionStorage');
    if (!s) return null;
    try {
      var v = s.getItem(SESSION_KEY);
      if (!v) {
        // Not a user id. Scoped to one browser session so events from one visit can
        // be grouped, and deliberately unable to link two visits together.
        v = String(Date.now().toString(36)) + '-' + Math.random().toString(36).slice(2, 10);
        s.setItem(SESSION_KEY, v);
      }
      return v;
    } catch (e) { return null; }
  }

  // ================================================================ validation
  // Invariant (d), enforced rather than documented. Returns a cleaned props object,
  // or null if the event may not be sent at all.
  function clean(name, props) {
    var spec = EVENTS[name];
    if (!spec) return null;                                   // invariant (c)
    var out = {}, k, want, v;
    for (k in spec.props) {
      if (!Object.prototype.hasOwnProperty.call(spec.props, k)) continue;
      if (!props || !Object.prototype.hasOwnProperty.call(props, k)) continue;
      want = spec.props[k];
      v = props[k];
      if (want === 'num') {
        if (typeof v === 'number' && isFinite(v)) out[k] = v;
      } else if (want === 'bool') {
        if (typeof v === 'boolean') out[k] = v;
      } else if (want === 'enum') {
        // An open enum — any short identifier-shaped string. Bounded in LENGTH and
        // CHARACTER SET, which is what stops a note, a filename or a URL riding in.
        if (typeof v === 'string' && v.length <= MAX_STR && /^[A-Za-z0-9_.:-]+$/.test(v)) out[k] = v;
      } else if (Object.prototype.toString.call(want) === '[object Array]') {
        if (want.indexOf(v) !== -1) out[k] = v;               // closed enum
      }
    }
    return out;
  }

  // ==================================================================== queue
  var queue = [];
  var timer = null;

  function event(name, props) {
    if (!granted() || !endpoint()) return false;              // invariants (a) and (b)
    var p = clean(name, props);
    if (!p) return false;
    if (queue.length >= MAX_QUEUE) return false;              // never grow without bound
    queue.push({ e: name, t: Math.round((G.performance && G.performance.now ? G.performance.now() : 0) / 1000), p: p });
    if (!timer && G.setTimeout) timer = G.setTimeout(flush, BATCH_MS);
    return true;
  }

  function flush(useBeacon) {
    if (timer && G.clearTimeout) { G.clearTimeout(timer); timer = null; }
    var url = endpoint();
    if (!url || !queue.length || !granted()) { queue.length = 0; return false; }
    var body = JSON.stringify({
      v: 1, session: sessionId(),
      release: (typeof G.RD_RELEASE === 'string') ? G.RD_RELEASE : null,
      build: (typeof G.RD_VERSION === 'string') ? G.RD_VERSION : null,
      channel: (typeof G.RD_CHANNEL === 'string') ? G.RD_CHANNEL : null,
      events: queue.splice(0, queue.length),
    });
    try {
      // sendBeacon survives the page going away, which is exactly when session_end
      // fires — a normal fetch there is routinely cancelled and that event is the
      // most valuable one in the list.
      if (useBeacon && G.navigator && G.navigator.sendBeacon) {
        return G.navigator.sendBeacon(url, body);
      }
      if (G.fetch) { G.fetch(url, { method: 'POST', body: body, keepalive: true, mode: 'no-cors' }); return true; }
    } catch (e) { /* telemetry must never break the sim */ }
    return false;
  }

  // ============================================================= session bundle
  // PATH 2. Explicit: only ever called from the feedback form's send button, and
  // it deliberately does NOT consult `granted()` — pressing send is the consent,
  // and someone who declined passive collection may still want to report a bug.
  //
  // Returns a promise so the form can show success or fall back to the mailto.
  function sendBundle(bundle, note, opts) {
    var url = (opts && opts.endpoint) || endpoint();
    if (!url || !bundle) return Promise.resolve({ ok: false, reason: 'no endpoint' });
    var payload = { v: 1, kind: 'session_bundle', note: (note || '').slice(0, 4000), bundle: bundle };
    var json = JSON.stringify(payload);
    // A 30-minute session is ~0.7 MB of JSON and ~63 KB gzipped (measured), so
    // compressing is the difference between a reasonable request and a rude one.
    // CompressionStream is absent on older browsers — send raw there rather than fail.
    function post(body, encoded) {
      var h = { 'Content-Type': 'application/json' };
      if (encoded) h['Content-Encoding'] = 'gzip';
      return G.fetch(url + '?kind=bundle', { method: 'POST', headers: h, body: body })
        .then(function (r) { return { ok: r.ok, status: r.status }; });
    }
    try {
      if (G.CompressionStream && G.Response) {
        var cs = new G.CompressionStream('gzip');
        return new G.Response(new G.Blob([json]).stream().pipeThrough(cs)).blob()
          .then(function (b) { return post(b, true); })
          .catch(function () { return post(json, false); });
      }
      return post(json, false);
    } catch (e) {
      return Promise.resolve({ ok: false, reason: String(e) });
    }
  }

  RD.Telemetry = {
    EVENTS: EVENTS,
    consent: consent,
    setConsent: setConsent,
    granted: granted,
    enabled: function () { return !!endpoint(); },
    event: event,
    flush: flush,
    sendBundle: sendBundle,
    // Test seams. Not for production callers.
    _clean: clean,
    _queue: function () { return queue; },
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
