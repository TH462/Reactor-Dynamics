/*
 * run_flags.js — the feature-flag registry gate (GitHub #241).
 *
 * site/flags.js decides what the PUBLIC website offers. Two ways that can go
 * wrong, and this gate exists for both:
 *
 *   1. Content ships unvetted. A new scenario lands with no registry entry, and
 *      whoever added it never thought about the public site. Resolution fails
 *      CLOSED so nothing leaks — but silence is not the same as a decision, so
 *      the missing entry is a FAILURE here, not a shrug.
 *   2. Content silently disappears. An id is renamed and its flag entry keeps
 *      pointing at the old name — the flag now gates nothing, and (worse) the
 *      renamed content is unregistered, so the public site quietly drops it.
 *      Orphan entries are a failure too.
 *
 * It also pins the RESOLUTION RULES, which is the part with real consequence: a
 * regression there does not throw or look wrong on the development channel — it
 * publishes something. Every rule is asserted from both sides (a public-stage
 * flag on the public channel AND a preview-stage flag on it), because a
 * resolver stuck at "true" passes any one-sided test.
 *
 * Static checks over ui/app.js and index.html close the last gap: a flag id
 * typo'd at the CALL site resolves to an unregistered id, which is invisible on
 * dev (unregistered → on) and hides a shipped feature in production.
 *
 *   node test/run_flags.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
function load(p) { require(path.join(__dirname, '..', p)); }
function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

[
  'site/flags.js',
  'engines/load_mode.js',
]
  .concat(fs.readdirSync(path.join(__dirname, '..', 'scenarios')).sort().map(function (f) { return 'scenarios/' + f; }))
  .concat(['ui/manual_procedures.js', 'ui/campaign_data.js'])
  .forEach(load);
var RD = globalThis.RD;
var F = RD.Flags;

// ---------------------------------------------------------------- harness
var T = [];
function test(name, fn) {
  var checks = [];
  var ck = function (desc, pass, detail) { checks.push({ desc: desc, pass: !!pass, detail: detail }); };
  try { fn(ck); } catch (e) { ck('threw: ' + (e && e.message), false, String(e && e.stack || e)); }
  T.push({ name: name, pass: checks.every(function (c) { return c.pass; }), checks: checks });
}

// A localStorage stand-in: flags.js reads globalThis.localStorage lazily behind
// a try/catch, so the override paths are testable outside a browser.
function withStorage(fn) {
  var mem = {};
  globalThis.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
  };
  try { fn(mem); } finally { delete globalThis.localStorage; }
}
function asChannel(ch, fn) {
  var prev = globalThis.RD_CHANNEL;
  globalThis.RD_CHANNEL = ch;
  try { return fn(); } finally { globalThis.RD_CHANNEL = prev; }
}

// ------------------------------------------------------------ the content
var SCEN = Object.keys(RD.SCENARIOS || {}).sort();
var PROCS = (function () {
  var out = {};
  var byEngine = RD.MANUAL_PROCEDURES || {};
  Object.keys(byEngine).forEach(function (k) {
    byEngine[k].forEach(function (p) { out[p.id] = true; });   // rbmk_pre/rbmk_post share ids
  });
  return Object.keys(out).sort();
})();
var MISSIONS = (function () {
  var out = [];
  Object.keys(RD.CAMPAIGNS || {}).forEach(function (k) {
    var c = RD.CAMPAIGNS[k];
    (c.acts || []).forEach(function (a) { (a.missions || []).forEach(function (m) { out.push(m); }); });
    (c.bonus || []).forEach(function (m) { out.push(m); });
  });
  return out;
})();

// =============================================================== coverage
test('registry covers every scenario', function (ck) {
  SCEN.forEach(function (id) {
    ck('scenario:' + id + ' registered', !!F.entry('scenario:' + id));
  });
});

test('registry covers every procedure', function (ck) {
  PROCS.forEach(function (id) {
    ck('procedure:' + id + ' registered', !!F.entry('procedure:' + id));
  });
});

test('registry covers every campaign mission', function (ck) {
  // The UI builds this exact key from the mission (`m.kind + ':' + m.id`), so
  // assert the key rather than trusting that the artifact lookup covered it.
  var seen = {};
  MISSIONS.forEach(function (m) {
    var id = m.kind + ':' + m.id;
    if (seen[id]) return;
    seen[id] = true;
    ck(id + ' registered', !!F.entry(id));
  });
});

test('no orphan entries — every item entry points at real content', function (ck) {
  F.ids().forEach(function (id) {
    var e = F.entry(id);
    if (e.kind === 'area') return;
    var key = id.split(':')[1];
    var exists = e.kind === 'scenario' ? SCEN.indexOf(key) !== -1 : PROCS.indexOf(key) !== -1;
    ck(id + ' still exists', exists, 'registered but no such ' + e.kind);
  });
});

test('registry is well formed', function (ck) {
  F.ids().forEach(function (id) {
    var e = F.entry(id);
    ck(id + ' has a legal stage', F.STAGES.indexOf(e.stage) !== -1, e.stage);
    // A gated AREA is the one a visitor actually reads a sentence about; without
    // its own `soon` line they get the generic fallback, which explains nothing.
    if (e.kind === 'area' && e.stage !== 'public') {
      ck(id + ' carries a coming-soon sentence', !!e.soon && e.soon.length > 40);
    }
  });
});

test('the public site is never left empty', function (ck) {
  // The floor, independent of what is being vetted: a visitor always gets the
  // plant itself and the manual. If these two are ever gated the public build
  // is a shell, which is not what "coming soon" is for.
  ck('free_play ships public', F.stage('free_play') === 'public', F.stage('free_play'));
  ck('manual ships public', F.stage('manual') === 'public', F.stage('manual'));
});

// ============================================================== resolution
test('public channel offers exactly the public stages', function (ck) {
  asChannel('public', function () {
    ck('channel reads public', F.channel() === 'public');
    ck('a public-stage flag is ON', F.on('free_play') === true);
    // Asserted from BOTH sides: a resolver stuck at true passes the line above.
    var preview = F.ids().filter(function (id) { return F.stage(id) === 'preview'; });
    ck('there is a preview-stage flag to test with', preview.length > 0);
    ck('every preview-stage flag is OFF', preview.every(function (id) { return F.on(id) === false; }));
    ck('an unregistered id fails CLOSED', F.on('scenario:not_a_real_thing') === false);
  });
});

test('development channels offer everything', function (ck) {
  ['preview', 'dev'].forEach(function (ch) {
    asChannel(ch, function () {
      ck(ch + ': channel reads back', F.channel() === ch);
      ck(ch + ': public stage ON', F.on('free_play') === true);
      ck(ch + ': preview stage ON', F.on('campaign') === true);
      ck(ch + ': unregistered id ON', F.on('scenario:not_a_real_thing') === true);
    });
  });
});

test('an unknown stamped channel degrades to dev, not to public', function (ck) {
  // A mis-stamped or missing site/channel.js must never silently publish.
  asChannel(undefined, function () { ck('unset → dev', F.baseChannel() === 'dev'); });
  asChannel('prod', function () { ck('typo → dev', F.baseChannel() === 'dev'); });
  asChannel('public', function () { ck('public is honoured', F.baseChannel() === 'public'); });
});

test("stage 'off' is dark on every channel", function (ck) {
  var reg = F.registry();
  reg.__test_off = { id: '__test_off', kind: 'area', stage: 'off' };
  try {
    ['public', 'preview', 'dev'].forEach(function (ch) {
      asChannel(ch, function () { ck(ch + ': off stays off', F.on('__test_off') === false); });
    });
    withStorage(function () {
      asChannel('dev', function () {
        F.setOverride('__test_off', true);
        ck('an explicit override still reaches it', F.on('__test_off') === true);
        F.clearOverrides();
      });
    });
  } finally { delete reg.__test_off; }
});

test('overrides beat the stage, in both directions, and clear cleanly', function (ck) {
  withStorage(function () {
    asChannel('public', function () {
      ck('baseline: campaign is gated here', F.on('campaign') === false);
      F.setOverride('campaign', true);
      ck('override ON reaches a gated feature', F.on('campaign') === true);
      ck('the override is reported', F.override('campaign') === true);
      F.setOverride('free_play', false);
      ck('override OFF hides a shipped feature', F.on('free_play') === false);
      ck('both overrides are recorded', Object.keys(F.overrides()).length === 2);
      F.setOverride('campaign', null);
      ck('a cleared override falls back to the stage', F.on('campaign') === false && F.override('campaign') === null);
      F.clearOverrides();
      ck('clearOverrides empties the record', Object.keys(F.overrides()).length === 0);
      ck('…and resolution returns to the stage', F.on('free_play') === true);
    });
  });
});

/* The BUILD-STAMPED layer (#448). The ops dashboard queues a stage, the Worker keeps it
 * in KV, site/stamp_version.js fetches it at BUILD time and writes it into the generated
 * site/channel.js as RD_FLAG_STAGES. By the time a browser sees it, it is a literal —
 * which is the whole point, because test/run_portable.js forbids the sim loading
 * anything at runtime and that is what lets the offline single-file build exist.
 *
 * Two things need pinning that nothing else covers: that a stamped value actually beats
 * the source literal (or the pipe is decorative), and that it CANNOT lower the floor
 * (or remote control can do what this gate forbids in source, and the gate is theatre).
 */
function withStamped(map, fn) {
  var had = Object.prototype.hasOwnProperty.call(globalThis, 'RD_FLAG_STAGES');
  var prev = globalThis.RD_FLAG_STAGES;
  globalThis.RD_FLAG_STAGES = map;
  try { fn(); } finally {
    if (had) globalThis.RD_FLAG_STAGES = prev; else delete globalThis.RD_FLAG_STAGES;
  }
}

test('a build-stamped stage overrides the source literal', function (ck) {
  asChannel('public', function () {
    ck('baseline: campaign is gated on public', F.on('campaign') === false);
    withStamped({ campaign: 'public' }, function () {
      ck('stamped public opens it', F.on('campaign') === true);
      ck('…and the stage reads back stamped', F.stage('campaign') === 'public');
    });
    ck('removing the stamp restores the literal', F.on('campaign') === false);

    withStamped({ 'scenario:pwr_tour': 'public' }, function () {
      ck('a content item can be stamped too', F.onItem('scenario', 'pwr_tour') === true);
    });
    withStamped({ scenarios: 'off' }, function () {
      asChannel('dev', function () {
        ck('stamped off is dark even on dev', F.on('scenarios') === false);
      });
    });
  });
});

test('a stamped stage cannot lower the floor, or arrive malformed', function (ck) {
  asChannel('public', function () {
    withStamped({ free_play: 'off', manual: 'preview' }, function () {
      ck('free_play cannot be stamped off', F.on('free_play') === true);
      ck('manual cannot be stamped below public', F.on('manual') === true);
    });
    /* Generated source is still input: a value flags.js does not understand must fall
     * back to the literal rather than resolve to whatever it happens to be.
     *
     * Tested against a stage-'public' entry, and that is the whole point. Asserting it
     * on `campaign` proves NOTHING — its literal is 'preview', so a rejected value and
     * an accepted-but-meaningless one both fall through to `channel() !== 'public'` and
     * give the identical answer. Measured: deleting the validation left all three of
     * those checks green. Against a 'public' literal the two outcomes finally differ —
     * kept means true, garbage-through means false.
     */
    var reg = F.registry();
    reg.__test_pub = { id: '__test_pub', kind: 'area', stage: 'public' };
    try {
      ck('precondition: the probe resolves on from its literal', F.on('__test_pub') === true);
      withStamped({ __test_pub: 'PUBLIC' }, function () {
        ck('a wrong-cased stage is ignored', F.on('__test_pub') === true);
      });
      withStamped({ __test_pub: 'sometimes' }, function () {
        ck('an unknown stage is ignored', F.on('__test_pub') === true);
      });
      withStamped({ __test_pub: true }, function () {
        ck('a non-string stage is ignored', F.on('__test_pub') === true);
      });
      withStamped({ __test_pub: 'off' }, function () {
        ck('…while a VALID stamp is still honoured', F.on('__test_pub') === false);
      });
    } finally { delete reg.__test_pub; }
    withStamped(null, function () {
      ck('no stamp at all resolves normally', F.on('campaign') === false && F.on('free_play') === true);
    });
    withStamped('not-an-object', function () {
      ck('a non-object stamp is ignored', F.on('free_play') === true);
    });
  });
  withStorage(function () {
    asChannel('public', function () {
      withStamped({ campaign: 'public' }, function () {
        F.setOverride('campaign', false);
        ck('a local override still beats the stamp', F.on('campaign') === false);
        F.clearOverrides();
      });
    });
  });
});

test('the stamper writes the flag map, and degrades loudly', function (ck) {
  var stamp = read('site/stamp_version.js');
  ck('it writes RD_FLAG_STAGES', /RD_FLAG_STAGES/.test(stamp));
  ck('it records which source it used', /RD_FLAG_SOURCE/.test(stamp));
  ck('a failed fetch falls back rather than throwing', /source: 'fallback'/.test(stamp));
  ck('the fetch is bounded by a timeout', /AbortController/.test(stamp) && /setTimeout/.test(stamp));
  ck('the fetched value is validated before it becomes source', /OK_STAGES\.indexOf/.test(stamp));
  // The generated repo copy must not carry someone's local KV state into the tree.
  ck('the repo copy of channel.js stamps an empty map',
    /RD_FLAG_STAGES\s*=\s*\{\}/.test(read('site/channel.js'))
    || !/RD_FLAG_STAGES/.test(read('site/channel.js')));
});

test('view-as re-resolves the app against another channel', function (ck) {
  withStorage(function () {
    asChannel('dev', function () {
      ck('starts on the stamped channel', F.channel() === 'dev' && F.on('campaign') === true);
      F.viewAs('public');
      ck('view-as public gates preview content', F.channel() === 'public' && F.on('campaign') === false);
      ck('the build itself is unchanged', F.baseChannel() === 'dev');
      F.viewAs(null);
      ck('clearing view-as returns to the build', F.channel() === 'dev' && F.on('campaign') === true);
    });
  });
});

test('applyDom swaps gated copy and leaves shipped copy alone', function (ck) {
  function el(flag, alt) {
    return {
      _attrs: { 'data-flag': flag, 'data-flag-off': alt },
      textContent: 'ORIGINAL', hidden: false,
      getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    };
  }
  asChannel('public', function () {
    var gatedAlt = el('campaign', 'ALTERNATE'), gatedNoAlt = el('campaign', undefined), shipped = el('free_play', 'ALTERNATE');
    delete gatedNoAlt._attrs['data-flag-off'];
    F.applyDom({ querySelectorAll: function () { return [gatedAlt, gatedNoAlt, shipped]; } });
    ck('gated copy is replaced', gatedAlt.textContent === 'ALTERNATE');
    ck('gated element with no alternate is hidden', gatedNoAlt.hidden === true);
    ck('shipped copy is untouched', shipped.textContent === 'ORIGINAL' && shipped.hidden === false);
  });
});

// ================================================================= static
// Both call sites resolve flag ids as plain strings, so a typo is invisible
// until production hides the wrong thing. Match the literals and check them.
test('every flag id used in ui/app.js is registered', function (ck) {
  var src = read('ui/app.js');
  var ids = {}, m;
  var re = /(?:flagOn|soonPanel|RD\.Flags\.on)\(\s*'([a-z0-9_:]+)'\s*[),]/g;
  while ((m = re.exec(src)) !== null) ids[m[1]] = true;
  var list = Object.keys(ids).sort();
  ck('found the call sites', list.length >= 5, list.join(', '));
  list.forEach(function (id) { ck('app.js: ' + id + ' registered', !!F.entry(id)); });
});

test('every data-flag id in index.html is registered', function (ck) {
  var src = read('index.html');
  var ids = {}, m;
  var re = /data-flag="([a-z0-9_:]+)"/g;
  while ((m = re.exec(src)) !== null) ids[m[1]] = true;
  var list = Object.keys(ids).sort();
  ck('found the landing-page markers', list.length >= 1, list.join(', '));
  list.forEach(function (id) { ck('index.html: ' + id + ' registered', !!F.entry(id)); });
});

test('the deploy stamp can only produce a known channel', function (ck) {
  // site/stamp_version.js is the only writer of site/channel.js. If it ever
  // emits a value site/flags.js does not know, every gate silently opens.
  var stamp = read('site/stamp_version.js');
  var emitted = (stamp.match(/'(public|preview|dev)'/g) || []).map(function (s) { return s.replace(/'/g, ''); });
  ck('stamp emits channel values', emitted.length >= 3, emitted.join(', '));
  emitted.forEach(function (c) { ck('stamped "' + c + '" is a known channel', F.CHANNELS.indexOf(c) !== -1); });
  ck('production maps to public', /production'\s*\?\s*'public'/.test(stamp));
  ck('the repo copy of channel.js is the dev placeholder', /RD_CHANNEL\s*=\s*"dev"/.test(read('site/channel.js')));
});

// ================================================================= report
var C = { red: '[31m', green: '[32m', dim: '[2m', bold: '[1m', off: '[0m' };
var passS = 0, failS = 0, passC = 0, failC = 0;
T.forEach(function (t) {
  t.pass ? passS++ : failS++;
  t.checks.forEach(function (c) { c.pass ? passC++ : failC++; });
  console.log((t.pass ? C.green + 'PASS' : C.red + 'FAIL') + C.off + '  ' + t.name +
    C.dim + '  (' + t.checks.filter(function (c) { return c.pass; }).length + '/' + t.checks.length + ')' + C.off);
  t.checks.filter(function (c) { return !c.pass; }).forEach(function (c) {
    console.log('   ' + C.red + '✗' + C.off + ' ' + c.desc + (c.detail ? C.dim + '  — ' + c.detail + C.off : ''));
  });
});
console.log('\n' + C.bold + '──────────────────────────────────────────' + C.off);
console.log(C.bold + (failS ? C.red + 'FLAGS: FAIL' : C.green + 'FLAGS: OK') + C.off +
  '   Suites: ' + passS + '/' + (passS + failS) + '   Checks: ' + passC + '/' + (passC + failC));
process.exit(failS ? 1 : 0);
