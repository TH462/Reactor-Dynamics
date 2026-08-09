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
  // The GENERATED instrument reference (RD.MANUAL) — the source of the Indications tab's
  // copy for every analog channel, so the coverage check below needs it to tell a described
  // channel from an undescribed one.
  'ui/manual_data.js',
].forEach(load);

var RD = globalThis.RD;
var I = RD.PwrBoardInspect;
var DOC = globalThis.RD_PWR_BOARD_DOC;

// Items the DRIVER DELETES at mount (`DOC_REMOVE` in pwr_board_wiring.js, #350 item 5) are
// not on the board the player gets, so they must not be here either. Read out of the source
// the same way EXTRA_IDS is below, and for the same reason — loading the driver would drag in
// the renderer. Filtering them out is not a convenience: without it this gate demands
// inspection copy for a tile nobody can point at, which is the mirror image of the gap it
// exists to catch, and the copy would then rot with nothing able to notice.
var REMOVED_IDS = (function () {
  var src = read('ui/diagram/board/pwr_board_wiring.js');
  var from = src.indexOf('var DOC_REMOVE');
  if (from < 0) return {};
  var block = src.slice(from, src.indexOf('};', from) + 2);
  var out = {}, m, re = /^\s*([A-Za-z_$][\w$]*)\s*:\s*1\s*,?\s*(\/\/.*)?$/gm;
  while ((m = re.exec(block)) !== null) out[m[1]] = true;
  return out;
})();
var ITEMS = ((DOC && DOC.items) || []).filter(function (it) { return !REMOVED_IDS[it.id]; });

// Driver-injected tiles are appended to the doc at mount, not present in the
// generated data. Loading the whole driver here would drag in the renderer, so
// the ids it adds are read out of the source instead — the same list the board
// pushes into doc.items in pwr_board.mount.
var EXTRA_IDS = (function () {
  var src = read('ui/diagram/board/pwr_board_wiring.js');
  var from = src.indexOf('var EXTRA_ITEMS');
  // …to the end of that array literal only — the file goes on to declare other
  // `{ id: … }` lists (the blockable trips), which are not board tiles. Matching
  // the first `];` (not a line-anchored one) keeps this right when the array is
  // EMPTY and written inline, which is what it is today.
  var block = src.slice(from, src.indexOf('];', from) + 2);
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
    // A STRING value is an ALIAS to another entry's copy, not an entry with copy of its
    // own -- `bdRxPeriodLbl: 'bdRxPeriod'`. It must be skipped BEFORE the title check,
    // not after: an alias exists precisely to borrow copy, so demanding it carry a title
    // is demanding the thing it was written to avoid. The alias mechanism has its own
    // check, 'every alias resolves'. This was the first alias in the file (bf41f67), so
    // the loop had never met the case.
    if (typeof e === 'string') return;
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

  // ---- acronyms are spelled out (#350 item 2) --------------------------------------
  // *(OWNER DIRECTIVE, 2026-08-04: "Scanner should spell out every acronym eg. Steam
  // Generator (SG).")* Each entry is read STANDALONE — the block shows one at a time — so
  // "expanded elsewhere" is no help; the expansion has to be in the entry that uses it.
  //
  // UNIT SYMBOLS ARE DELIBERATELY NOT ON THIS LIST (psi, gpm, ppm, pcm, MWe, MWt, cps).
  // They are units, not acronyms, and CLAUDE.md's unit directive says units keep their
  // standard spelling — writing "2235 pounds per square inch (psi)" in every entry would
  // bury the number the reader opened the block for. The owner's example was a system name.
  //
  // Gated rather than trusted: this is prose across 166 hand-written entries, exactly the
  // kind of property that holds on the day it is done and rots on the next edit.
  var ACRONYMS = {
    ECCS: 'Emergency Core Cooling System', CVCS: 'Chemical and Volume Control System',
    MSIV: 'Main Steam Isolation Valve', RWST: 'Refueling Water Storage Tank',
    PORV: 'Power-Operated Relief Valve', SGTR: 'Steam Generator Tube Rupture',
    LOCA: 'loss-of-coolant accident', NPSH: 'Net Positive Suction Head',
    LTOP: 'Low Temperature Overpressure Protection', AFW: 'Auxiliary Feedwater',
    RCS: 'Reactor Coolant System', RCP: 'Reactor Coolant Pump', RHR: 'Residual Heat Removal',
    TMI: 'Three Mile Island', HPI: 'High Pressure Injection', LPI: 'Low Pressure Injection',
    NIS: 'Nuclear Instrumentation', MFW: 'Main Feedwater', RPS: 'Reactor Protection System',
    DNB: 'Nucleate Boiling', VCT: 'Volume Control Tank', TCV: 'Turbine Control Valve',
    ESF: 'Engineered Safety Feature', RPV: 'Reactor Pressure Vessel',
    CRDM: 'Control Rod Drive Mechanism', SG: 'Steam Generator', SI: 'Safety Injection',
    // 'decade', not 'decade(s) per minute': a rate of exactly 1 is singular, so both
    // spellings are correct expansions and pinning either one red-cards the other.
    DPM: 'decade'
  };
  var unexpanded = [];
  I.ids().forEach(function (id) {
    var e = I.entry(id);
    if (!e || e.inherited) return;
    var text = [e.title || '', e.brief || '', e.detail || ''].join(' ');
    var low = text.toLowerCase();
    Object.keys(ACRONYMS).forEach(function (a) {
      // Not inside a longer token: SG must not fire on SGTR, SI must not fire on SIx.
      if (!new RegExp('(^|[^A-Za-z0-9\\-])' + a + 's?([^A-Za-z0-9]|$)').test(text)) return;
      if (low.indexOf(ACRONYMS[a].toLowerCase()) >= 0) return;
      unexpanded.push(id + ':' + a);
    });
  });
  ck('every acronym is spelled out in the entry that uses it', unexpanded.length === 0,
     unexpanded.slice(0, 8).join(', ') + (unexpanded.length > 8 ? ' (+' + (unexpanded.length - 8) + ')' : ''));
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

// The board renders SI as well as US customary since #238 — nineteen readouts, six
// tiles and five setpoint boxes switch on ctx.units(). THIS COPY DOES NOT: it is a
// static registry with no access to the toggle. So a sentence that names the display
// unit ("Hot-leg temperature, in °F") is a claim the board contradicts the moment the
// player selects SI, and nothing else here can see it — run_manual_units checks that a
// VALUE carries its SI partner, which a bare unit name never trips.
//
// The rule: a US unit token may appear only as the unit OF A QUOTED NUMBER ("2235 psi
// (15.41 MPa)", "0–60 gpm (0–14 m³/h)"), where run_manual_units then holds it to the
// dual-unit convention. Naming the unit on its own is what this forbids — the readout
// already labels itself, in whichever unit is showing.
test('copy never names the display unit on its own (#238)', function (ck) {
  // psig before psi: the shorter token is a prefix of the longer one and would
  // otherwise swallow it, reporting the wrong unit in the failure text.
  var UNITS = ['psig', 'psi', '°F', 'gpm', 'inHg', 'inches of mercury'];
  var offenders = [];
  I.ids().forEach(function (id) {
    var e = I.own(id);
    if (typeof e === 'string') return;                 // alias — its target is checked
    ['title', 'brief', 'detail'].forEach(function (field) {
      var text = e[field] || '', seen = [];
      UNITS.forEach(function (u) {
        var at = 0, i;
        while ((i = text.indexOf(u, at)) >= 0) {
          at = i + u.length;
          // Already reported under a longer unit covering this same span?
          if (seen.some(function (s) { return i >= s[0] && i < s[1]; })) continue;
          seen.push([i, at]);
          // Preceded by a number (allowing "0–60 gpm", "±1.4 °F", "1e5 cps")? Then it
          // is the unit of a quoted value, which is exactly what we want.
          if (/[0-9]\s*$/.test(text.slice(0, i))) continue;
          offenders.push(id + '.' + field + ': "…' +
            text.slice(Math.max(0, i - 28), at + 2).replace(/\s+/g, ' ') + '…"');
        }
      });
    });
  });
  ck('no entry names a US unit except after a number', offenders.length === 0,
     offenders.join('  |  '));
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

  // ---- Physics tab rows carry scanner copy (#350 item 3) --------------------------
  // The panel is the one surface in the shell whose numbers are under-the-hood physics
  // rather than gauges, so it is the list a player is least able to read off the label —
  // and it shipped with no inspection copy at all. Gated rather than trusted because the
  // rows are a HAND-MAINTAINED table and a new one would otherwise arrive silently
  // uncovered, which is the #224 trap exactly.
  //
  // Static, on the source: loading app.js here would need a DOM. The physics block runs
  // from `physics: [` to the failure-grouping comment that follows it.
  var pStart = app.indexOf('      physics: [');
  var pEnd = app.indexOf('failGroups: [', pStart);
  ck('the physics block is findable', pStart > 0 && pEnd > pStart);
  if (pStart > 0 && pEnd > pStart) {
    var pBlock = app.slice(pStart, pEnd);
    var rowKeys = (pBlock.match(/\{ k: '((?:[^'\\]|\\.)*)'/g) || []);
    var hints = (pBlock.match(/\n\s+hint: '/g) || []).length;
    var details = (pBlock.match(/\n\s+detail: '/g) || []).length;
    ck('every physics row has a scanner summary', rowKeys.length > 0 && hints === rowKeys.length,
       hints + ' summaries for ' + rowKeys.length + ' rows');
    ck('every physics row has a scanner detail', rowKeys.length > 0 && details === rowKeys.length,
       details + ' details for ' + rowKeys.length + ' rows');
    // The renderer has to actually emit them, or the copy is dead text — the same
    // orphan-detail failure the shell tier checks for, one file over.
    ck('buildPhysics emits the scanner attributes',
       /data-scanner-hint[\s\S]{0,200}data-scanner-detail/.test(app.slice(app.indexOf('function buildPhysics'))));
  }
});

// ============================================ Inject Failure groupings (2026-08-04)
// *(OWNER DIRECTIVE, 2026-08-04: "organize the list of failures into logical
// groupings.")* The Failures tab orders the catalog through a hand-maintained
// `failGroups` table in ui/app.js, which is the #224 shape: a list-driven view that
// silently under-covers the artifact it presents. `buildFailures` already refuses to
// DROP an unlisted failure — it renders under "Other" — so the failure mode is not a
// vanished row but a MISFILED one, which nobody would notice. Both directions are
// checked here, in the gate that already exists for exactly this class of rot.
test('every failure is placed in a group', function (ck) {
  var app = read('ui/app.js');
  var from = app.indexOf('failGroups: [');
  ck('failGroups table found in ui/app.js', from > 0);
  if (from < 0) return;
  var block = app.slice(from, app.indexOf('\n      ],', from) + 8);
  var listed = {}, order = [], m, re = /'([a-z0-9_]+)'/g;
  while ((m = re.exec(block)) !== null) { if (!listed[m[1]]) { listed[m[1]] = true; order.push(m[1]); } }
  var titles = (block.match(/title:\s*'[^']+'/g) || []).length;
  ck('groups are authored', titles >= 5, titles + ' groups');

  var cat = Object.keys((RD.PWR_PROTECTION && RD.PWR_PROTECTION.failures) || {});
  ck('failure catalog loaded', cat.length > 0, cat.length + ' failures');

  // Direction 1: a catalog entry with no group falls into "Other" — present, misfiled.
  var unplaced = cat.filter(function (id) { return !listed[id]; });
  ck('no failure is left out of the groups', unplaced.length === 0, unplaced.join(', '));

  // Direction 2: an id in the table that no longer exists in the catalog is dead
  // weight and hides a rename — the group silently loses a row and reads complete.
  var dead = order.filter(function (id) { return cat.indexOf(id) < 0; });
  ck('no group lists a failure that does not exist', dead.length === 0, dead.join(', '));

  // Each failure in exactly ONE group: a duplicate renders the row twice, and both
  // copies carry the same DOM id, so the inject handler binds to whichever is first.
  var dupes = [], seen = {};
  var idsInOrder = (block.match(/'([a-z0-9_]+)'/g) || []).map(function (s) { return s.replace(/'/g, ''); });
  idsInOrder.forEach(function (id) { if (seen[id]) dupes.push(id); seen[id] = true; });
  ck('no failure appears in two groups', dupes.length === 0, dupes.join(', '));
});

// ======================================= Indications tab covers every channel (2026-08-08)
// *(OWNER, 2026-08-08: "Lets change the graph tab to 'Indications' and this tells us all the
// indications in the plant".)* The tab is generated from `PROFILES.pwr.series`, so "all the
// indications" is only true while that hand-maintained array keeps up with the engine's
// instrument set. This is the #224 shape exactly — a list-driven view that silently
// under-covers the artifact it presents — and it is the same failure the failGroups check
// above exists for: a new instrument does not produce an error, it produces a tab that
// quietly stops being complete while still calling itself complete.
//
// Static, on the source, like the physics-row check: loading ui/app.js needs a DOM. A channel
// counts as covered if the series block reads it as `i.<key>` or declares it as `ins: '<key>'`
// (the `stat()` builder's form). Both directions are checked — a series reading a channel the
// config no longer declares is a rename that lost its trace.
test('every plant indication has a chart series', function (ck) {
  var cfg = (RD.PWR_CONFIG && RD.PWR_CONFIG.instruments) || {};
  var analog = Object.keys(cfg).filter(function (k) { return k !== 'status'; });
  // `instruments.status` is an ARRAY of channel names, not a map of specs — status booleans
  // carry no lag/noise/range, so there is nothing to key. Object.keys on it returns "0".."33".
  var status = Array.isArray(cfg.status) ? cfg.status.slice() : Object.keys(cfg.status || {});
  var channels = analog.concat(status);
  ck('instrument set loaded from config', channels.length > 50,
     analog.length + ' analog + ' + status.length + ' status');

  var app = read('ui/app.js');
  var from = app.indexOf('      series: [');
  var to = app.indexOf('------ Physics tab', from);
  ck('the series block is findable', from > 0 && to > from);
  if (from < 0 || to < from) return;
  // COMMENTS STRIPPED FIRST, and it matters in both directions. The block is heavily
  // commented and the prose contains accessor-shaped text: "i.e." parses as a read of an
  // instrument called `e`, and a comment explaining why a ghost accessor was REMOVED
  // ("it used to read `i.xenon_pct_eq`") keeps the ghost alive for the scanner. The same cut
  // stops a channel counting as covered because someone merely mentioned it in prose, which
  // is the more dangerous direction — that one fails green. No line in this block carries a
  // URL or a `//` inside a string, so cutting at the first `//` per line is exact here.
  var block = app.slice(from, to).split('\n').map(function (ln) {
    var i = ln.indexOf('//');
    return i < 0 ? ln : ln.slice(0, i);
  }).join('\n');

  function covered(k) { return block.indexOf('i.' + k) >= 0 || block.indexOf("ins: '" + k + "'") >= 0; }
  var missing = channels.filter(function (k) { return !covered(k); });
  ck('no plant indication is missing from the series registry', missing.length === 0,
     missing.length + ' uncovered: ' + missing.join(', '));

  // Reverse: an accessor naming a channel the config does not declare is a GHOST — it reads
  // undefined, so the Indications row renders a permanent em-dash while still claiming to be
  // something the plant indicates. Caught in the wild the day this check was written: the
  // `xenon` series declared `get: i.xenon_pct_eq` for a quantity with no instrument, and
  // chartSample cloned the instruments dict every sample to graft the true value in so the
  // accessor would find something. Both directions of the accessor are scanned — `ins: 'k'`
  // (the stat() builder) and a bare `i.k` read — because that defect used the second form.
  var declared = {}; channels.forEach(function (k) { declared[k] = true; });
  var ghosts = {}, m;
  var re = /ins: '([a-z0-9_]+)'/g;
  while ((m = re.exec(block)) !== null) if (!declared[m[1]]) ghosts[m[1]] = true;
  var re2 = /\bi\.([a-z0-9_]+)\b/g;
  while ((m = re2.exec(block)) !== null) if (!declared[m[1]]) ghosts[m[1]] = true;
  var ghostList = Object.keys(ghosts);
  ck('no series reads an instrument the plant does not have', ghostList.length === 0, ghostList.join(', '));

  // Ids must be unique: `serCol` is built by walking the array, so a duplicate id silently
  // gives two series the same packed column and the second one overwrites the first.
  var ids = (block.match(/\bid: '([a-z0-9_]+)'/g) || []).map(function (s) { return s.slice(5, -1); });
  var dup = [], seen = {};
  ids.forEach(function (i) { if (seen[i]) dup.push(i); seen[i] = true; });
  ck('no two series share an id', dup.length === 0, dup.join(', '));
  ck('every series is grouped', (block.match(/\bid: '/g) || []).length === (block.match(/grp: '/g) || []).length,
     ids.length + ' series, ' + (block.match(/grp: '/g) || []).length + ' grouped');

  // A series NO CHECKBOX CAN REACH is dead weight — it costs a column in every packed chart
  // row and nothing can plot it. Reachable means: listed on the Indications tab (it has `get`,
  // `ins:` or `ctl`), or bound to a Physics row by `ser:`. Three of these shipped briefly
  // (block_valve, porv_stuck, spray_stuck — all true-state-only, so the Indications filter
  // excluded them and no physics row named them).
  var chunks = block.split(/(?=\n        (?:\{ id:|stat\(|logSer\())/);
  var listed = {};
  chunks.forEach(function (c) {
    var im = c.match(/\bid: '([a-z0-9_]+)'/);
    if (im && /\bget:|ins: '|\bctl:/.test(c)) listed[im[1]] = true;
  });
  var physBlock = app.slice(app.indexOf('      physics: ['), app.indexOf('failGroups: ['));
  var bound = {}, b, rb = /ser: '([a-z0-9_]+)'/g;
  while ((b = rb.exec(physBlock)) !== null) bound[b[1]] = true;
  var orphan = ids.filter(function (i) { return !listed[i] && !bound[i]; });
  ck('every series is reachable from a checkbox', orphan.length === 0, orphan.join(', '));

  // A Physics row's `ser:` must name a series that exists, or its checkbox toggles nothing.
  var ghostSer = Object.keys(bound).filter(function (i) { return ids.indexOf(i) < 0; });
  ck('every physics row binds a series that exists', ghostSer.length === 0, ghostSer.join(', '));

  // Every Indications row resolves to scanner copy. Two sources: the generated manual
  // reference (analog channels) or an authored `hint` (status channels and commanded
  // positions, which the manual reference does not describe — it documents instruments).
  // Without this a new status series ships with a bare label and no way to find out what it
  // means, which is the state the whole tab was in before 2026-08-09.
  var inds = ((RD.MANUAL || {}).pwr || {}).indications || [];
  var described = {}; inds.forEach(function (i) { if (i.measures) described[i.id] = true; });
  var noCopy = [];
  chunks.forEach(function (c) {
    var im = c.match(/\bid: '([a-z0-9_]+)'/);
    if (!im || !listed[im[1]]) return;                       // only rows the tab actually shows
    if (/\bhint: '/.test(c)) return;                         // authored
    var instr = c.match(/(?:instr|ins): '([a-z0-9_]+)'/);
    if (instr && described[instr[1]]) return;                // generated from the manual
    noCopy.push(im[1]);
  });
  ck('every indication row resolves to scanner copy', noCopy.length === 0,
     noCopy.length + ' with neither an authored hint nor a described instrument: ' + noCopy.join(', '));
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
