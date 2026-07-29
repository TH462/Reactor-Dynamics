/*
 * run_inspect.js — the inspection-copy gate (GitHub #96).
 *
 * The inspection block tells the player what an object on the board IS. Every
 * way that can rot is silent — which is why it needs a gate rather than a
 * playtest:
 *
 *   1. An ORPHANED key. Item ids come from the diagram builder; delete or
 *      re-draw an item and its entry describes nothing. Nothing throws — the
 *      object just stops explaining itself. (Same failure mode that cost 12
 *      PIPE_TEMP entries in the V2 export.)
 *   2. UNCOVERED items. A new control lands with no copy and quietly inherits
 *      its card's summary, which READS like a deliberate answer. Interactive
 *      items must therefore carry their own entry, not a group one.
 *   3. A DEAD CITATION. An entry cites "Manual §7.3"; the manual is rewritten
 *      and §7.3 no longer exists. The link then opens the right document at the
 *      wrong place, which is worse than no link. Every citation is resolved
 *      against the packed manual markdown here.
 *   4. COPY-PASTE. Two objects sharing a brief means one of them was never
 *      actually written.
 *
 * It also checks the shell's inline tier (data-scanner-hint / -detail in
 * ui/shell.html): a detail with no summary is unreachable, since the resolver
 * only ever looks at elements carrying a hint.
 *
 * Node-only: the registry and the board doc are plain global scripts, so this
 * needs no DOM. The BEHAVIOUR of the block (hover → text, expand, glow) is
 * pinned in ui/test_panel/board_check.html, which mounts a real board.
 *
 *   node test/run_inspect.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
function load(p) { require(path.join(__dirname, '..', p)); }
function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

global.window = global;                       // board scripts attach to window.RD
[
  'engines/pwr/pwr_config.js',
  'layers/control/pwr_control.js',
  'ui/diagram/board/pwr_board_data.js',
  'ui/diagram/board/pwr_board_inspect.js',
  'ui/manual_md.js',
].forEach(load);

var RD = globalThis.RD;
var I = RD.PwrBoardInspect;
var DOC = globalThis.RD_PWR_BOARD_DOC;
var ITEMS = (DOC && DOC.items) || [];

// Driver-injected tiles are appended to the doc at mount, not present in the
// generated data. Loading the whole driver here would drag in the renderer, so
// the ids it adds are read out of the source instead — the same list the board
// pushes into doc.items in pwr_board.mount.
var EXTRA_IDS = (function () {
  var src = read('ui/diagram/board/pwr_board_wiring.js');
  var from = src.indexOf('var EXTRA_ITEMS');
  // …to the end of that array literal only — the file goes on to declare other
  // `{ id: … }` lists (the blockable trips), which are not board tiles.
  var block = src.slice(from, src.indexOf('\n  ];', from));
  var out = {}, m, re = /\{\s*id:\s*'([^']+)'/g;
  while ((m = re.exec(block)) !== null) out[m[1]] = true;
  return out;
})();
function liveId(id) {
  if (EXTRA_IDS[id]) return true;
  for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return true;
  return false;
}

// ---------------------------------------------------------------- harness
var T = [];
function test(name, fn) {
  var checks = [];
  var ck = function (desc, pass, detail) { checks.push({ desc: desc, pass: !!pass, detail: detail }); };
  try { fn(ck); } catch (e) { ck('threw: ' + (e && e.message), false, String((e && e.stack) || e)); }
  T.push({ name: name, pass: checks.every(function (c) { return c.pass; }), checks: checks });
}

// =============================================================== the registry
test('registry loads', function (ck) {
  ck('RD.PwrBoardInspect present', !!I);
  ck('board doc present', ITEMS.length > 0, ITEMS.length + ' items');
  ck('entries authored', I.ids().length > 100, I.ids().length + ' entries');
});

test('every key points at a live item', function (ck) {
  var orphans = I.ids().filter(function (id) { return !liveId(id); });
  ck('no orphaned entry keys', orphans.length === 0, orphans.join(', '));
  var al = I.aliases(), badAlias = [];
  Object.keys(al).forEach(function (from) {
    if (!liveId(from)) badAlias.push('from ' + from);
    if (!I.own(al[from])) badAlias.push(from + ' → ' + al[from] + ' (no entry)');
  });
  ck('every alias resolves', badAlias.length === 0, badAlias.join(', '));
});

test('coverage', function (ck) {
  var uncovered = ITEMS.filter(function (it) { return !I.entry(it.id); })
                       .map(function (it) { return it.kind + ':' + it.id; });
  ck('every board item inspects to something', uncovered.length === 0, uncovered.join(', '));

  // The driver's own tiles are appended to the doc at mount, so they are just as
  // hoverable — and just as easy to forget. (Two of them, the pressurizer TEMP and
  // HTR PWR captions, were missed on the first pass: they sit on the mimic inside
  // no card, so containment had nothing to inherit from either.)
  var extraGaps = Object.keys(EXTRA_IDS).filter(function (id) { return !I.entry(id); });
  ck('every driver-injected tile inspects to something', extraGaps.length === 0, extraGaps.join(', '));

  // A control the player can press must describe ITSELF. Inheriting the card is
  // right for a caption and wrong for a button: "AUTO" and the card it sits on
  // do different things, and a group summary hides that.
  var thin = ITEMS.filter(function (it) {
    return ['button', 'number', 'scram'].indexOf(it.kind) >= 0 && !I.own(it.id);
  }).map(function (it) { return it.kind + ':' + it.id; });
  ck('every control has its own entry', thin.length === 0, thin.join(', '));

  // Same for the things the plant is MADE of — a hovered pump or valve that
  // answers with its enclosing panel teaches nothing about the pump.
  var comps = ITEMS.filter(function (it) { return it.kind === 'component' && !I.own(it.id); })
                   .map(function (it) { return it.id; });
  ck('every component has its own entry', comps.length === 0, comps.join(', '));

  // And every indication: a number on the board is only useful if you know what
  // it reads.
  var vals = ITEMS.filter(function (it) {
    return ['value', 'readout'].indexOf(it.kind) >= 0 && !I.own(it.id);
  }).map(function (it) { return it.kind + ':' + it.id; });
  ck('every indication has its own entry', vals.length === 0, vals.join(', '));
});

test('copy quality', function (ck) {
  var noTitle = [], noBrief = [], noDetail = [], longBrief = [], shortDetail = [], unpunctuated = [];
  I.ids().forEach(function (id) {
    var e = I.own(id);
    if (!e.title) noTitle.push(id);
    if (!e.brief) noBrief.push(id);
    if (!e.detail) noDetail.push(id);
    // The collapsed block is ~3 lines of 12px text; a brief past ~140 chars is
    // detail wearing a summary's clothes.
    if (e.brief && e.brief.length > 140) longBrief.push(id + ' (' + e.brief.length + ')');
    if (e.detail && e.detail.length < 80) shortDetail.push(id + ' (' + e.detail.length + ')');
    if (e.brief && !/[.!?]$/.test(e.brief.trim())) unpunctuated.push(id);
  });
  ck('every entry has a title', noTitle.length === 0, noTitle.join(', '));
  ck('every entry has a brief', noBrief.length === 0, noBrief.join(', '));
  ck('every entry has a detail', noDetail.length === 0, noDetail.join(', '));
  ck('briefs fit the collapsed block', longBrief.length === 0, longBrief.join(', '));
  ck('details say something', shortDetail.length === 0, shortDetail.join(', '));
  ck('briefs are sentences', unpunctuated.length === 0, unpunctuated.join(', '));

  // Duplicate copy is the tell that an entry was pasted and never written.
  var byBrief = {}, dupB = [], byDetail = {}, dupD = [];
  I.ids().forEach(function (id) {
    var e = I.own(id);
    if (byBrief[e.brief]) dupB.push(byBrief[e.brief] + ' = ' + id); else byBrief[e.brief] = id;
    if (byDetail[e.detail]) dupD.push(byDetail[e.detail] + ' = ' + id); else byDetail[e.detail] = id;
  });
  ck('no two entries share a brief', dupB.length === 0, dupB.join(', '));
  ck('no two entries share a detail', dupD.length === 0, dupD.join(', '));
});

// ============================================================== the citations
var MD = (RD.MANUAL_MD && RD.MANUAL_MD.pwr) || null;
test('manual citations resolve', function (ck) {
  ck('packed PWR manual present', !!MD);
  if (!MD) return;
  var docs = {};
  (MD.docs || []).forEach(function (d) { docs[d.id] = d; });

  var badDoc = [], badSec = [], cited = 0;
  I.ids().forEach(function (id) {
    var e = I.own(id);
    if (!e.doc) return;
    cited++;
    var d = docs[e.doc];
    if (!d) { badDoc.push(id + ' → ' + e.doc); return; }
    if (!e.sec) return;
    // Headings render as "## 7.3 Letdown Orifices (A / B)" — match the section
    // number as a whole segment so §9.1 cannot pass on §9.10.
    var re = new RegExp('^#{1,6}\\s+' + e.sec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)', 'm');
    if (!re.test(d.md || '')) badSec.push(id + ' → ' + e.doc + ' §' + e.sec);
  });
  ck('entries cite the manual', cited > 100, cited + ' citations');
  ck('every cited document exists', badDoc.length === 0, badDoc.join(', '));
  ck('every cited section exists', badSec.length === 0, badSec.join(', '));
});

// ================================================================ the shell tier
test('shell inline tier', function (ck) {
  var html = read('ui/shell.html');
  // Every element carrying a detail must also carry a summary: inspectResolve()
  // only reaches elements matched by [data-scanner-hint], so a lone detail is
  // dead text.
  var tags = html.match(/<[a-z][^>]*data-scanner-detail=[^>]*>/gi) || [];
  var orphanDetail = tags.filter(function (t) { return t.indexOf('data-scanner-hint=') < 0; });
  ck('no detail without a summary', orphanDetail.length === 0,
     orphanDetail.map(function (t) { return t.slice(0, 60); }).join(' | '));
  ck('shell carries detail copy', tags.length >= 10, tags.length + ' elements');

  // The summary format is "Title — text"; the block splits on that em dash.
  var hints = html.match(/data-scanner-hint="[^"]*"/g) || [];
  var noDash = hints.filter(function (h) { return h.indexOf(' — ') < 0; });
  ck('summaries carry a title', noDash.length === 0,
     noDash.map(function (h) { return h.slice(0, 50); }).join(' | '));

  // A cited document that the packed manual does not carry would open the
  // overlay on nothing.
  var docs = {};
  ((MD && MD.docs) || []).forEach(function (d) { docs[d.id] = 1; });
  var cites = (html.match(/data-scanner-doc="([^"]+)"/g) || []).map(function (m) {
    return m.replace(/.*="/, '').replace(/"$/, '');
  });
  var bad = cites.filter(function (id) { return !docs[id]; });
  ck('shell citations resolve', bad.length === 0, bad.join(', '));
});

// ============================================================ app.js wiring
test('app wiring', function (ck) {
  var app = read('ui/app.js');
  ck('board resolution goes through the driver registry', /RD\.PwrBoard[\s\S]{0,80}inspect\b/.test(app));
  ck('hover and tap both feed the block',
     /mouseover['"][\s\S]{0,60}inspectAt/.test(app) && /'click'[\s\S]{0,60}inspectAt/.test(app));
  // Hovering must NOT mark the object (owner, 2026-07-28: the ring the first cut
  // drew "is very annoying"). Pinned because the merged issue text asks for a glow
  // and the next reader of #69/#96 would put it back.
  ck('hovering does not highlight the object', app.indexOf('scan-glow') < 0);
  ck('expanded state persists', app.indexOf('rd_inspect_expanded') >= 0);
  // The block must not describe itself: hovering it would replace the text being
  // read, and the pointer crossing it on the way to the manual link detached the
  // button mid-click (found by driving the real app).
  ck('the block ignores hovers over itself', /closest\('#scannerPanel'\)[\s\S]{0,40}return null/.test(app));
  // Gauges and alarm tiles must not hard-code their detail text — it comes from
  // the generated manual reference and the plant's protection table, so a retune
  // moves it.
  ck('gauge detail is generated', /function gaugeDetail/.test(app) && /manualIndication\(/.test(app));
  ck('alarm detail is generated', /function alarmDetail/.test(app) && /alarmSpec\(/.test(app));

  ck('no hover-ring style ships', read('ui/shell.css').indexOf('.scan-glow {') < 0 &&
                                   read('ui/diagram/board/pwr_board.css').indexOf('scan-glow') < 0);

  var shell = read('ui/shell.html');
  ck('the registry is loaded before the driver',
     shell.indexOf('pwr_board_inspect.js') > 0 &&
     shell.indexOf('pwr_board_inspect.js') < shell.indexOf('pwr_board_wiring.js'));
});

// ==================================================================== report
var C = { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' };
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
console.log(C.bold + (failS ? C.red + 'INSPECT: FAIL' : C.green + 'INSPECT: OK') + C.off +
  '   Suites: ' + passS + '/' + (passS + failS) + '   Checks: ' + passC + '/' + (passC + failC));
process.exit(failS ? 1 : 0);
