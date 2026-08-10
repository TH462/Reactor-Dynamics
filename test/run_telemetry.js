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
  require(path.join(ROOT, 'site', 'telemetry.js'));
  return { T: g.RD.Telemetry, sent: sent };
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

  var map = {};
  m[1].split('\n').forEach(function (line) {
    var r = /^\s*([a-z_]+)\s*:\s*(null|'([^']*)')\s*,?\s*$/.exec(line);
    if (r) map[r[1]] = r[3] === undefined ? null : r[3];
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
    ck('"' + name + '" really carries the property "' + field + '"',
      !!(spec && Object.prototype.hasOwnProperty.call(spec.props, field)),
      spec ? 'props are ' + Object.keys(spec.props).join(', ') : 'no such event');
  });
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
