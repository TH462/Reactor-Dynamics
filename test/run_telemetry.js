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
  // THE REAL RECORDER, not a stub (#681). sendBundle's byte backstop calls
  // RD.DiagRecorder.trimOldest through a soft global lookup, which is exactly how the
  // control room wires it (ui/shell.html loads diag_recorder.js before app.js). A fake trim
  // here would gate the loop and not the wiring, and the wiring is the half that has been
  // wrong before.
  if (opts.withRecorder) {
    delete require.cache[require.resolve(path.join(ROOT, 'ui', 'diag_recorder.js'))];
    require(path.join(ROOT, 'ui', 'diag_recorder.js'));
  }
  require(path.join(ROOT, 'site', 'telemetry.js'));
  return { T: g.RD.Telemetry, sent: sent };
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
