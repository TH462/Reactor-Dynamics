/* telemetry.js — the client half of "what do people actually do in the sim".
 *
 * Two SEPARATE paths, and keeping them separate is the whole design:
 *
 *   1. AGGREGATE EVENTS  — small, named, declared below, sent automatically unless
 *      the visitor opts out. Counts and durations. No free text, ever.
 *   2. SESSION BUNDLE    — the full diagnostic recording (ui/app.js buildDiagBundle),
 *      sent ONLY when a human presses a button in the feedback form. It carries a
 *      note they typed, so it is the one path that may contain their words.
 *
 * They are separate because they answer to different rules. Path 1 is passive, so it
 * must be boring: a visitor who never notices it must not be able to be identified by
 * it, which is what invariants c/d/e are for. Path 2 is an act — the user is
 * deliberately sending a bug report — so it may carry much more. Merging them would
 * drag path 2's richness into path 1's silence, which is how analytics turns into
 * surveillance.
 *
 * ------------------------------------------------- why there is no consent prompt
 * There was one, at first launch, and it was REMOVED 2026-08-09 *(OWNER, 2026-08-09:
 * "Can we get rid of the convent popup and just divulge that we collect telemetry in
 * the privacy tab?")*. Two reasons, and the second is the one that settles it:
 *
 *   - It did not work. Ad-blocker cosmetic filter lists target consent dialogs by
 *     element name, and the overlay was `id="consentOverlay"` — about as obvious a
 *     target as exists. Reported symptom: it "pops up for about half a second then
 *     disappears", and the diagnostic read `hidden:false, display:none` — our code
 *     never hid it; an extension did. A prompt a filter list can silently delete is
 *     not a consent mechanism, it is a way to collect nothing from blocked users and
 *     believe you asked them.
 *   - It was incoherent. The site already serves Cloudflare Web Analytics with no
 *     prompt at all, and that beacon carries MORE identifying signal than this does.
 *
 * So path 1 is now on by default and DISCLOSED on privacy.html, which is the posture
 * every cookieless analytics product takes. What makes that defensible is not the
 * disclosure but invariants c/d/e below: no persistent id, no free text, no cookies,
 * and an IP used only as a rate-limit key and never stored. The Settings toggle is
 * the opt-out, and it is the only thing that ever writes to localStorage.
 *
 * NOTE the limit honestly: EU/UK ePrivacy asks for consent before ANY non-essential
 * storage on the device, sessionStorage included. The consent-free reading rests on
 * the data being anonymous and session-scoped. It is the mainstream position, not a
 * settled one — if that call is ever revisited, restore a prompt that a filter list
 * cannot delete (inline in the page body, neutrally named), not the overlay.
 *
 * -------------------------------------------------------------------- invariants
 * These are gated by test/run_telemetry.js. Do not relax one without moving it:
 *
 *   a. Nothing is sent once the visitor has opted OUT, and opting out DROPS what was
 *      queued rather than flushing it — a queue that survives an opt-out is a record
 *      of someone who just asked you not to keep one.
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
    // `sim_seconds` doubles as "did they ever press play" — the sim clock only advances
    // while running, so > 0 is the answer and a separate reached_play flag was both
    // redundant and WRONG: play does not route through the command dispatcher, so the
    // first implementation reported false on a session that had plainly run. Measured
    // against the live board before it was cut.
    session_end:   { props: { seconds: 'num', sim_seconds: 'num', last_panel: 'enum' } },

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
    // THE MODE IS THE FUNNEL, and it is the engine's own answer rather than a
    // threshold invented here. `true_state.plant_mode` is the DERIVED commercial
    // mode 1-6, computed from power, reactivity and Tavg (CONTEXT.md §6.3), so
    // "how far did they get" is Mode 5 -> 3 -> 2 -> 1 with no judgement of mine in
    // it. An analytics threshold picked by eye would have been a plant-dynamics
    // claim wearing a product-metric hat, and wrong thresholds make wrong funnels.
    plant_mode:    { props: { mode: 'num', sim_seconds: 'num' } },
    // The three that are latched flags or recorded events already, not inferences:
    // on_grid from mwe_output first going positive, scram from the existing recorder,
    // core_damage from true_state.fuel_damaged, which the engine latches itself.
    milestone:     { props: { name: ['on_grid', 'scram', 'core_damage'], sim_seconds: 'num' } },
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
    // Only an OPT-OUT drops the queue (invariant a). Under the old tri-state this read
    // `!== 'granted'`, which also fired for the back-to-default case — now that default
    // means "collecting", clearing there would silently bin events we are allowed to send.
    if (v === 'denied') queue.length = 0;
  }
  // ON BY DEFAULT, off only on an explicit opt-out (see the header for why the launch
  // prompt was removed). `null` means the visitor never touched the Settings toggle, so
  // nothing was ever written to localStorage for them — which is the common case, and
  // the reason this reads `!== 'denied'` rather than `=== 'granted'`.
  function granted() { return consent() !== 'denied'; }

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

  /* WHY THERE IS A DIAGNOSTIC AT ALL. Every way this feature can fail looks identical
   * from outside: nothing is sent. Consent undecided, endpoint unset, storage refused, the
   * prompt hidden by a content blocker — all four produce silence, and silence is also what
   * correct operation looks like for a visitor who said no. Without a way to tell them
   * apart, "the prompt vanished" is unanswerable, which is exactly where this started.
   *
   * IS STORAGE WRITABLE, not just present. `localStorage` can exist and still throw on
   * write — Safari private mode, a quota, a locked-down profile. When that happens the
   * consent answer is accepted, never stored, and reads back as null for ever: the prompt
   * returns every visit and nothing is ever collected, with no error anywhere. Presence is
   * not the question; writability is. */
  function storageWritable() {
    var s = store('localStorage');
    if (!s) return false;
    try {
      s.setItem('rd_storage_probe', '1');
      var ok = s.getItem('rd_storage_probe') === '1';
      s.removeItem('rd_storage_probe');
      return ok;
    } catch (e) { return false; }
  }

  function diagnose() {
    return {
      channel: (typeof G.RD_CHANNEL === 'string') ? G.RD_CHANNEL : null,
      release: (typeof G.RD_RELEASE === 'string') ? G.RD_RELEASE : null,
      endpoint_set: !!endpoint(),
      consent: consent(),                 // 'granted' | 'denied' | null (never answered)
      collecting: granted() && !!endpoint(),
      storage_writable: storageWritable(),
      declared_events: Object.keys(EVENTS).length,
      queued: queue.length,
    };
  }

  RD.Telemetry = {
    EVENTS: EVENTS,
    diagnose: diagnose,
    storageWritable: storageWritable,
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
