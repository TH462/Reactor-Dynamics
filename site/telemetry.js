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

  /* THE SITE PAGES, as a CLOSED set (#764). A raw `location.pathname` is unbounded free
   * text and invariant (d) rejects it — correctly: a path can carry a query, a fragment,
   * a typo'd URL someone was sent, and none of that is a usage fact. So the path is mapped
   * to one of these here, and anything unrecognised becomes 'other' rather than travelling.
   *
   * 'shell' is in the list because `pageId()` must be able to NAME the shell in order to
   * skip it (see the auto-init at the foot of this file); no page_view is ever sent for it.
   * The shell's arrival is `session_start`, which it already sends and which carries more. */
  var PAGES = ['home', 'about', 'physics', 'roadmap', 'changelog', 'download',
               'privacy', 'legal', 'notfound', 'shell', 'other'];

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

    /* --- the walkthroughs (#674) --------------------------------------------
     * WHERE PEOPLE GET STUCK, AND HOW FAR THEY GET BEFORE THEY STOP. The
     * walkthroughs are the guided content and until now they reported NOTHING —
     * `start_checklist` went to the service and no event followed it, so a leg
     * nobody finishes and a leg everybody finishes looked identical from here.
     *
     * `id` is the PROCEDURE id (`pwr_heatup`, `pwr_tmi2_incident`) and not the
     * plant: the same id exists in both the retired-PWR and the PWR2 procedure
     * sets, so which engine ran it is recovered by joining on the session's own
     * `session_start.plant` row rather than by duplicating the plant here.
     */
    walkthrough_start: { props: { id: 'enum', steps: 'num' } },
    /* ONE ROW PER CHECK-OFF, which is what makes a drop-off funnel possible at
     * all: the highest `step` a session reaches IS how far they got. `seconds` is
     * WALL time on that one step — getting stuck is a wall-clock experience, not a
     * sim one, and a step can burn 20 s of a player's life and an hour of plant
     * time at 600x. `by` is the instructor's own verdict rather than an inference
     * made here: `overtaken` means the plant moved past a step the player could no
     * longer satisfy, `caught_up` means it was already true when they arrived.
     * Those two are the direct stuck-signal and neither is visible in a count. */
    walkthrough_step:  { props: { id: 'enum', step: 'num', seconds: 'num',
                                  by: ['auto', 'manual', 'observed', 'caught_up', 'overtaken'] } },
    // A step someone backs INTO is a step they got wrong. The WALKTHROUGH's own
    // Rewind button only, not the checkpoint picker — a general rewind is a
    // decision about the plant and says nothing about the guidance.
    walkthrough_rewind: { props: { id: 'enum', step: 'num' } },
    /* HOW IT ENDED, and the four ways are four different facts: `complete` is the
     * whole leg walked, `stopped` is the player closing it, `switched` is them
     * leaving for another one, `left` is the tab going away mid-leg. `step` is
     * where they were when it ended, so the completion rate and the depth people
     * abandon at both come out of this one row. */
    walkthrough_end:   { props: { id: 'enum', step: 'num', steps: 'num', seconds: 'num',
                                  reason: ['complete', 'stopped', 'switched', 'left'] } },

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

    /* --- the way in (#764) --------------------------------------------------
     * THE QUESTION THESE TWO ANSWER, and why neither existed: `/` is the landing
     * door and `/ui/shell` pageloads roughly equal homepage pageloads, but a VISIT
     * is attributed by Cloudflare to the page a session STARTED on — so an internal
     * hop into the sim is a pageload with zero visits, and the console could not
     * distinguish "nobody goes in" from "nobody LANDS on the shell". It reported the
     * first, and it was the second.
     *
     * `page_view` fires on every site page but NEVER on the shell, whose arrival is
     * already `session_start` and carries more. Since the session id lives in
     * sessionStorage and survives same-tab navigation, a session holding
     * `page_view{home}` and then `session_start` IS the click-through, with no cookie,
     * no new identifier and nothing that links two visits (invariant e untouched). */
    page_view:     { props: { page: PAGES } },

    /* DID THEY PRESS THE BUTTON. The homepage says "desktop or laptop only" and leaves
     * the button enabled, so "mobile visitors click and give up" is a plausible story
     * we have never been able to test — mobile is only about 5 of about 35 weekly
     * landing visits, so the disclaimer cannot explain the gap on its own.
     *
     * EVERY PROP IS A CLOSED ENUM, including the width. A raw viewport width in pixels
     * is a number invariant (d) would happily accept, and it is also a fingerprinting
     * surface that buys nothing over the bucket: the question is "was this a phone",
     * not "was this 393 pixels". Deciding that here rather than at the query end is the
     * point — what is not collected cannot leak. */
    cta_click:     { props: { to: ['shell', 'download', 'github', 'other'],
                              device: ['fine', 'coarse'],
                              width: ['xs', 'sm', 'md', 'lg'] } },
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

  /* Seconds since THE SESSION ID WAS MINTED, derived from the id itself — its first
   * segment is `Date.now().toString(36)` (see sessionId above). Nothing new is
   * stored, so invariant (e) is untouched, and it is correct even for an id minted
   * by an older client still alive in a tab.
   *
   * This exists because `t` below is relative to PAGE LOAD while the session id
   * lives in sessionStorage and survives a reload — so within one session id, `t`
   * goes backwards at every reload. Both are kept rather than one being redefined:
   * a drop in `t` across two rows is a positive detection of a reload, which is
   * what lets the dashboard show the discontinuity instead of smoothing over it.
   *
   * Date.now() is wall-clock, so a clock step can make this non-monotonic. The
   * clamp handles the common direction; the rest is not worth machinery.
   */
  function sessionElapsed() {
    var id = sessionId();
    if (!id) return null;
    var minted = parseInt(String(id).split('-')[0], 36);
    if (!isFinite(minted)) return null;
    return Math.max(0, Math.round((Date.now() - minted) / 1000));
  }

  function event(name, props) {
    if (!granted() || !endpoint()) return false;              // invariants (a) and (b)
    var p = clean(name, props);
    if (!p) return false;
    if (queue.length >= MAX_QUEUE) return false;              // never grow without bound
    var row = { e: name, t: Math.round((G.performance && G.performance.now ? G.performance.now() : 0) / 1000), p: p };
    var st = sessionElapsed();
    if (st !== null) row.st = st;                             // omitted rather than faked
    queue.push(row);
    if (!timer && G.setTimeout) timer = G.setTimeout(flush, BATCH_MS);
    return true;
  }

  /* THE REFERRING HOST -- AND NOTHING ELSE OF THE URL (2026-09-20).
   *
   * Cloudflare's injected RUM beacon already reports a referrer and a country, and
   * privacy.html discloses both. What it does not do is survive a content blocker, and a
   * blocked beacon is not a missing visitor -- it is a missing ROW, which is the one
   * failure an analytics stream cannot see in itself. Recording the same two facts on
   * this path, which is not blocked, is what lets the site's own stream answer the
   * question at all *(OWNER RULING, 2026-09-20: "We don't need to change privacy.html.
   * We are just doing what cloudflare already does.")*.
   *
   * HOST ONLY. `document.referrer` is a full URL -- path, query and fragment included --
   * and a search page's query string is the visitor's own words. The hostname is the
   * entire answer to "where did they come from", so the rest never leaves this page.
   * `URL.hostname` drops the scheme, any userinfo, the port, the path and the query in
   * one step; the regex below is the fallback for a runtime without `URL` and applies
   * the same cuts by hand. The final shape test is the load-bearing line: a hostname
   * cannot contain '/', '?', '#', ':' or a space, so a value carrying one is dropped
   * WHOLE rather than trimmed into something host-shaped.
   *
   * IT IS AN ENVELOPE FIELD, NOT A PROP, on two counts. It is a fact about the PAGE
   * LOAD and is constant for every event in the batch -- the same shape as `release`,
   * `channel` and `build`, which are already envelope fields -- and invariant (d)
   * governs prop VALUES, which this is not. The receiver re-applies the identical
   * host-only cut on arrival (worker/src/index.js `hostOf`), because anything can POST
   * to that endpoint and the sanitiser that the promise rests on is the one at the far
   * end, not this one.
   */
  function refHost() {
    var r = '';
    try { r = (G.document && G.document.referrer) || ''; } catch (e) { return ''; }
    if (!r) return '';
    var h = '';
    try { if (G.URL) h = new G.URL(String(r)).hostname || ''; } catch (e) { h = ''; }
    if (!h) {
      var m = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/.exec(String(r));
      h = m ? String(m[1]).replace(/^[^@]*@/, '').replace(/:\d+$/, '') : '';
    }
    h = String(h).toLowerCase();
    // 253 is DNS's own limit on a hostname, so nothing real is refused by it; the bound
    // is there to stop an absurd value being stored at all, and the character class on
    // the same line is what stops a path or a query riding in.
    if (!h || h.length > 253 || !/^[a-z0-9.-]+$/.test(h)) return '';
    return h;
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
      // The HOST of document.referrer and never the URL -- see refHost() above.
      ref: refHost(),
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
  //
  // ------------------------------------------------------------------ THE WIRE BUDGET (#681)
  // The Worker refuses a body over `MAX_BUNDLE_BYTES` (worker/src/index.js) with a 413, and
  // nothing on this side ever measured. A 4-plant-hour session posted 3,006,146 bytes and was
  // rejected; from 2 h 45 min of plant time onward every report in that session was rejected.
  //
  // The fix is in two halves and the FIRST one is the whole fix: ui/diag_recorder.js rounds
  // the timeseries at build() (4-hour bundle 2,939 KB -> 646 KB, all rows kept). This half is
  // the BACKSTOP the owner asked for — measure what is actually about to go on the wire, and
  // drop OLDEST rows until it fits *(OWNER, 2026-09-09, #675: "When we hit the max length we
  // can send for feedback we should trim older data. Usually the most recent data is the most
  // relevant.")*.
  //
  // MEASURE THE POSTED BODY, NOT THE JSON. A raw-JSON budget would have trimmed half the
  // history off a 4-hour report that gzips to 32 % of the cap — the server counts the gzipped
  // bytes, so that is what is counted here. It also means the un-gzipped path an older browser
  // takes (no CompressionStream) is protected too, and that path is the one still over the cap
  // after rounding: 3.54 MB raw.
  var WIRE_CAP = 2 * 1024 * 1024;              // worker/src/index.js MAX_BUNDLE_BYTES, verbatim
  // 128 KiB of headroom under it. The measurement here IS the body handed to fetch, so in
  // principle none is needed; what it buys is (a) the request line and headers the server also
  // reads, (b) the trim's granularity — each pass drops whole rows and cannot land on an exact
  // byte, and (c) somewhere to grow for a future non-timeseries part of the bundle before this
  // constant has to move. 1,966,080 bytes = 94 % of the Worker's cap.
  var WIRE_BUDGET = WIRE_CAP - 128 * 1024;
  var MAX_TRIM_PASSES = 12;

  function byteLength(str) {
    try { if (G.TextEncoder) return new G.TextEncoder().encode(str).length; } catch (e) { /* fall through */ }
    return str.length;                          // ASCII-only fallback; only ever an under-count
  }

  /* Player-facing status text for a sendBundle result — SUCCESS AND EVERY FAILURE. It lives
   * here, not in ui/app.js, for one reason: app.js is browser-only, so a string chosen there
   * is a string no Node gate can prove is ever reached, and "a source scan for a rendered
   * string cannot tell you the string is reachable" is this project's own standing lesson.
   * test/run_telemetry.js feeds this real results from real (stubbed) posts.
   *
   * The three failures are three different things for the player to DO, which is the whole
   * point of telling them apart: the attachment is too big (untick it — measured, the note-only
   * path sends fine at 165 bytes), the network never answered (try again), or the server said
   * no (email instead). */
  function sendResultMessage(r) {
    if (r && r.ok) return r.id ? ('Sent — thank you. Reference ' + r.id) : 'Sent — thank you.';
    if (r && (r.tooLarge || r.status === 413)) {
      return 'Could not send — the attached recording is too large. Untick ' +
             '"Attach this session\'s recording" and send just your message, or email it instead.';
    }
    if (r && r.network) {
      return 'Could not send — no reply from the server. Check your connection and press ' +
             'Send report again, or email instead.';
    }
    return 'Could not send — please email instead.';
  }

  function sendBundle(bundle, note, opts) {
    var url = (opts && opts.endpoint) || endpoint();
    if (!url || !bundle) return Promise.resolve({ ok: false, reason: 'no endpoint' });
    var budget = (opts && opts.maxBytes) || WIRE_BUDGET;
    // Soft dependency, deliberately: ui/diag_recorder.js is loaded by the control room and by
    // nothing else on the site, and a note-only report has no timeseries to trim. Absent it,
    // this behaves exactly as it did before — encode and post.
    var trim = (opts && opts.trim) || ((G.RD && G.RD.DiagRecorder && G.RD.DiagRecorder.trimOldest) || null);
    // build/channel ride along so a report from develop's preview site is not
    // indistinguishable from one off the production build — see worker/src/index.js
    // handleBundle, which also stamps the Origin header server-side as the harder-to-spoof copy.
    var payload = {
      v: 1, kind: 'session_bundle', note: (note || '').slice(0, 4000), bundle: bundle,
      build: (typeof G.RD_VERSION === 'string') ? G.RD_VERSION : null,
      channel: (typeof G.RD_CHANNEL === 'string') ? G.RD_CHANNEL : null,
    };
    // A 30-minute session is ~0.7 MB of JSON and ~63 KB gzipped (measured), so
    // compressing is the difference between a reasonable request and a rude one.
    // CompressionStream is absent on older browsers — send raw there rather than fail.
    function post(body, encoded) {
      var h = { 'Content-Type': 'application/json' };
      if (encoded) h['Content-Encoding'] = 'gzip';
      return G.fetch(url + '?kind=bundle', { method: 'POST', headers: h, body: body })
        .then(function (r) {
          // READ THE ID BACK (#431). The Worker answers `{ok:true, id}` and names the stored
          // object after it, precisely so a reporter can quote it — and this line used to
          // return `{ok, status}` and drop it on the floor, which left the id existing
          // nowhere a human could see. Not personal data: a base-36 timestamp plus eight
          // random characters, generated server-side, and already the R2 object key.
          //
          // The body read must not be able to REJECT, and must not assume there is one to
          // read. An error response is not necessarily JSON (an edge can answer HTML), an
          // opaque response has no readable body at all, and a rejected promise here would
          // turn a report that ARRIVED into "could not send" in the form.
          var base = { ok: r.ok, status: r.status };
          if (typeof r.json !== 'function') return base;
          return r.json().then(
            function (j) { return { ok: r.ok, status: r.status, id: (j && j.id) || undefined }; },
            function () { return base; }
          );
        });
    }
    // Encode once, and report the byte count of the thing that will actually be posted.
    function encode(json) {
      if (G.CompressionStream && G.Response && G.Blob) {
        try {
          var cs = new G.CompressionStream('gzip');
          return new G.Response(new G.Blob([json]).stream().pipeThrough(cs)).blob()
            .then(function (b) { return { body: b, encoded: true, bytes: b.size }; },
                  function () { return { body: json, encoded: false, bytes: byteLength(json) }; });
        } catch (e) { /* fall through to raw */ }
      }
      return Promise.resolve({ body: json, encoded: false, bytes: byteLength(json) });
    }

    function rows() {
      var ts = bundle && bundle.timeseries;
      return (ts && ts.t && ts.t.length) || 0;
    }

    var dropped = 0;
    function attempt(pass) {
      var json;
      try { json = JSON.stringify(payload); }
      catch (e) { return Promise.resolve({ ok: false, reason: String(e) }); }
      return encode(json).then(function (enc) {
        if (enc.bytes <= budget) {
          return post(enc.body, enc.encoded).then(function (r) {
            if (dropped) r.trimmed_rows = dropped;
            r.bytes = enc.bytes;
            return r;
          });
        }
        // Over budget. Size the drop off the OVERSHOOT rather than a fixed fraction — the
        // timeseries is 99.6 % of the payload, so bytes are near-linear in rows and this
        // converges in one or two passes instead of a dozen gzips of a 3 MB body.
        var n = rows();
        var want = n ? Math.ceil(n * Math.min(0.5, Math.max(0.02, 1 - budget / enc.bytes) + 0.02)) : 0;
        var got = (trim && want) ? trim(bundle, want) : 0;
        if (!got || pass >= MAX_TRIM_PASSES) {
          // Nothing left to give. Do NOT post it: the server would answer 413 after reading
          // the whole body off the wire, and the player gets the same answer either way —
          // except this one can say WHICH failure it was, and the attachment box is the fix.
          return { ok: false, status: 413, reason: 'too large', tooLarge: true,
                   bytes: enc.bytes, budget: budget, trimmed_rows: dropped };
        }
        dropped += got;
        return attempt(pass + 1);
      });
    }

    // THE TERMINAL CATCH (#682). Without it a fetch REJECTION — a dropped connection, offline,
    // DNS, CORS — resolved neither branch of the caller's .then, and the feedback form read
    // "Sending…" for ever with the Send button disabled and no way out but a reload. Measured:
    // still "Sending…" at 45 s, two `TypeError: Failed to fetch` in the page log. The result
    // shape is the one this function already returns for `no endpoint`, plus `network: true`
    // so the form can say which failure it was.
    return attempt(0).catch(function (e) {
      return { ok: false, reason: String(e), network: true };
    });
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
    sendResultMessage: sendResultMessage,
    WIRE_CAP: WIRE_CAP,
    WIRE_BUDGET: WIRE_BUDGET,
    pageId: pageId,
    widthBucket: widthBucket,
    // Test seams. Not for production callers.
    _clean: clean,
    _refHost: refHost,
    _queue: function () { return queue; },
    _autoInit: autoInit,
    PAGES: PAGES,
  };

  /* ======================================================== the site pages (#764)
   *
   * Everything below runs on the SITE pages and is skipped on the shell, which has its
   * own lifecycle in ui/app.js — `session_start`, `session_end` and a `pagehide` beacon.
   * Adding a second set there would double-wire the one page that was already correct.
   */

  // Path -> one of PAGES. Closed by construction: an unlisted page is 'other', never its
  // own path. Matching on the BASENAME so a sub-path deployment or a preview host does not
  // reclassify every page as 'other' — and the empty basename (a bare '/') is 'home'.
  function pageId(pathname) {
    var p = String(pathname == null ? ((G.location && G.location.pathname) || '') : pathname);
    var base = p.replace(/[?#].*$/, '').split('/').pop().toLowerCase();
    if (/(^|\/)shell\.html$/.test(base) || base === 'shell.html') return 'shell';
    if (base === '' || base === 'index.html') return 'home';
    if (base === '404.html') return 'notfound';
    var name = base.replace(/\.html$/, '');
    return PAGES.indexOf(name) !== -1 && name !== 'shell' ? name : 'other';
  }

  /* Viewport width as a BUCKET, never the pixel count — see the cta_click comment. The
   * edges are the ordinary responsive ones and nothing downstream depends on their exact
   * values; what matters is that 'xs' means a phone held upright. */
  function widthBucket(w) {
    var n = (typeof w === 'number' && isFinite(w)) ? w
      : (G.innerWidth || (G.document && G.document.documentElement && G.document.documentElement.clientWidth) || 0);
    if (n < 600) return 'xs';
    if (n < 900) return 'sm';
    if (n < 1280) return 'md';
    return 'lg';
  }

  function coarsePointer() {
    try {
      return !!(G.matchMedia && G.matchMedia('(pointer: coarse)').matches);
    } catch (e) { return false; }   // no matchMedia, or a UA that throws on the query
  }

  // Where a link goes, as a closed enum. Read off the href rather than off markup the
  // page author has to remember to add, so a new call-to-action is classified the day it
  // ships instead of the day someone notices it was never tagged.
  function linkTarget(href) {
    var h = String(href || '').toLowerCase();
    if (h.indexOf('shell.html') !== -1) return 'shell';
    if (h.indexOf('download') !== -1) return 'download';
    if (h.indexOf('github.com') !== -1) return 'github';
    return 'other';
  }

  // `win` is a parameter so the pagehide/visibility wiring is TESTABLE: globalThis in Node
  // is not an EventTarget, so a handler registered on it can be neither observed nor
  // proved, and deleting the pagehide flush reddened nothing until this became an argument.
  function autoInit(doc, win) {
    doc = doc || G.document;
    win = win || G;
    if (!doc) return false;
    if (pageId() === 'shell') return false;      // ui/app.js owns that page
    /* THE OFFLINE BUILD. tools/make_portable.js collapses the control room into one file
     * whose whole promise is that it never touches the network, and it blanks the endpoint
     * to keep that true. The filename is not `shell.html`, so the guard above does not
     * catch it — without this one, that build would wire listeners and queue events it can
     * never send. Invariant (b) already makes them silent; this makes them absent. */
    if (!endpoint()) return false;

    event('page_view', { page: pageId() });

    /* A DELEGATED listener, not one per element: the nav is injected by site/nav.js after
     * this file runs, so anything bound to the elements present at load would miss every
     * link in it. Capture phase, because a handler elsewhere may stop propagation. */
    doc.addEventListener('click', function (ev) {
      var el = ev && ev.target;
      while (el && el !== doc && !(el.tagName === 'A' && el.getAttribute)) el = el.parentNode;
      if (!el || el === doc || !el.getAttribute) return;
      // Only the ways IN to the product. An ordinary navigation link is a page_view
      // already, and counting it twice would make the funnel's denominator meaningless.
      var to = linkTarget(el.getAttribute('href'));
      if (to === 'other') return;
      event('cta_click', { to: to, device: coarsePointer() ? 'coarse' : 'fine', width: widthBucket() });
      /* FLUSH IMMEDIATELY, WITH A BEACON. The click navigates away inside the 15-second
       * batch window, so a queued cta_click would die with the page — which would report
       * zero clicks on a button people press, the most confidently wrong number this
       * whole change could produce. sendBeacon is the only transport that survives it. */
      flush(true);
    }, true);

    /* The site pages have no session_end, so without this a visitor who reads the
     * homepage and closes the tab inside 15 seconds sends nothing at all — and a bounce
     * is exactly the visitor this event exists to count. `flush` empties the queue, so a
     * second call is a no-op rather than a duplicate. */
    if (win && win.addEventListener) win.addEventListener('pagehide', function () { flush(true); });
    if (doc.addEventListener) {
      doc.addEventListener('visibilitychange', function () {
        if (doc.visibilityState === 'hidden') flush(true);
      });
    }
    return true;
  }

  // Fire on load. Guarded so a page that loads this file twice does not double-count.
  if (!G.__rdTelemetryAutoInit) {
    G.__rdTelemetryAutoInit = true;
    if (G.document && G.document.readyState === 'loading' && G.document.addEventListener) {
      G.document.addEventListener('DOMContentLoaded', function () { autoInit(); });
    } else if (G.document) {
      autoInit();
    }
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
