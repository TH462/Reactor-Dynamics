/* run_pwr2_geometry.js — Layer 1 gate for the PWR2 engine (#479).
 *
 * Layer 1 is DATA. So this gate cannot check "does it compute the right answer" — there is no
 * answer to compute. What it can check, and does:
 *
 *   1. THE LEDGER CLOSES. Node volumes sum to their components; components sum to the declared
 *      total. This is the assertion D1 §7 calls "the one to watch", because it is where §3's
 *      unresolved closure question lands.
 *   2. THE SOURCED NUMBERS ARE THE SOURCED NUMBERS. Piping and vessel fractions are asserted
 *      against NUREG/IA-0444's actual values, re-verified from the document 2026-08-14 — not
 *      against the design documents that quote them, which is how a transcription error survives.
 *   3. PROVENANCE IS ENFORCED, not declared. Every number carries [ruled]/[sourced]/[derived],
 *      `[tune]` is forbidden outright, and the ONE [recalled] family is allow-listed BY NAME so a
 *      second one cannot appear quietly. D1 §2 has demanded this since the design set was
 *      written; an independent review found ZERO numbers carrying a tag anywhere. This file is
 *      where that stops being aspirational.
 *   4. THE DECLARED UNCERTAINTY IS PRESENT AND HONEST. The 12.1 % unattributed fraction must
 *      travel with the data (D1 §24) and must equal what the ledger actually fails to account for.
 *   5. AN INJECTION SELF-TEST. Same rule as Layer 0: a mutation that leaves the suite green is a
 *      GATE FAILURE. Layer 0's version was hardened after an independent review found 11 blind
 *      spots in it, and the lesson carried here — the mutation set is an artifact of the author's
 *      imagination, so it is written to attack the things that would actually be wrong.
 *
 * Run: node test/run_pwr2_geometry.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var LIB = path.join(__dirname, '..', 'engines', 'pwr2', 'pwr2_geometry.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');   // autocrlf; see the Layer 0 runner
require(path.join(__dirname, '..', 'engines', 'pwr2', 'pwr2_water.js'));
var W = globalThis.RD.pwr2.water;

function loadFrom(src) {
  var root = {};
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.geometry;';
  return new Function('RD_ROOT', body)(root);
}

var FT3 = 35.3147;

/* SOURCED reference values, NUREG/IA-0444 Tables 5-7 (Almaraz I, W 3-loop, 2947 MWt),
 * read from the document itself. Alignment settled by the sum check below. */
var ALM = {
  total_m3: 280.97, rpv_m3: 100.81,
  hot_m3: 3.18, sg_m3: 32.28, cross_m3: 3.60, rcp_m3: 4.02, cold_m3: 3.23,
  surge_m3: 1.14, pzr_m3: 39.64, spray_m3: 0.45,
  hot_leg_L_m: 7.25,
  vessel: { upper_head: 11.81, upper_plenum: 28.0, core: 14.10, lower_plenum: 20.20, downcomer: 20.0 }
};
var RATIO = 300 / 982.3;          // SLS-100 against Almaraz PER LOOP

function runSuite(G, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol;
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(46) +
      'got ' + got.toFixed(3) + ' want ' + want.toFixed(3) + ' (d ' + d.toFixed(3) + ' tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function node(id) { for (var i = 0; i < G.NODES.length; i++) if (G.NODES[i].id === id) return G.NODES[i]; return null; }
  function V(id) { var n = node(id); return n ? n.V * FT3 : NaN; }   // ft3

  /* ---- 1. THE SOURCE ITSELF -------------------------------------------------------- */
  if (!quiet) console.log('\nTHE SOURCE  [NUREG/IA-0444, re-verified from the document 2026-08-14]');
  var almSum = ALM.rpv_m3 + 3 * (ALM.hot_m3 + ALM.sg_m3 + ALM.cross_m3 + ALM.rcp_m3 + ALM.cold_m3) +
               ALM.surge_m3 + ALM.pzr_m3 + ALM.spray_m3;
  ck('Almaraz components sum to its stated total', almSum, ALM.total_m3, 0.02, 'm3');
  var vSum = ALM.vessel.upper_head + ALM.vessel.upper_plenum + ALM.vessel.core +
             ALM.vessel.lower_plenum + ALM.vessel.downcomer;
  ckT('Almaraz vessel parts sit under its RPV total, with a plausible residual',
      vSum < ALM.rpv_m3 && (ALM.rpv_m3 - vSum) / ALM.rpv_m3 < 0.10,
      ((ALM.rpv_m3 - vSum) / ALM.rpv_m3 * 100).toFixed(1) + ' % residual (guide tubes, bypass, supports)');

  /* ---- 2. THE LEDGER CLOSES -------------------------------------------------------- */
  if (!quiet) console.log('\nLEDGER CLOSURE  [D1 §7: "L1\'s gate is the one to watch"]');
  var rpv = V('downcomer') + V('lower_plenum') + V('core') + V('upper_plenum') + V('vessel_heads');
  ck('vessel nodes sum to the RPV component', rpv, G.LEDGER.rpv.m3 * FT3, 0.2, 'ft3');
  var piping = V('hot_leg') + V('crossover') + V('cold_leg');
  ck('leg nodes sum to the piping component', piping, G.LEDGER.piping.m3 * FT3, 0.2, 'ft3');
  var all = 0;
  G.NODES.forEach(function (n) { all += n.V * FT3; });
  ck('ALL nodes sum to the declared RCS total', all, G.RCS_TOTAL_M3 * FT3, 0.3, 'ft3');
  var ledger = 0;
  Object.keys(G.LEDGER).forEach(function (k) { ledger += G.LEDGER[k].m3 * FT3; });
  ck('components sum to the declared RCS total', ledger, G.RCS_TOTAL_M3 * FT3, 0.3, 'ft3');

  /* ---- 3. AGAINST THE SOURCE, not against the documents that quote it --------------- */
  if (!quiet) console.log('\nSOURCED VALUES  [asserted against the DOCUMENT, not the design set]');
  ck('hot leg = Almaraz x power ratio', V('hot_leg'), ALM.hot_m3 * RATIO * FT3, 0.15, 'ft3');
  ck('crossover = Almaraz x power ratio', V('crossover'), ALM.cross_m3 * RATIO * FT3, 0.15, 'ft3');
  ck('cold leg = Almaraz x power ratio', V('cold_leg'), ALM.cold_m3 * RATIO * FT3, 0.15, 'ft3');
  ck('hot leg length is the SOURCED one, not the authored 10 ft', G.LOOP.hot_leg.L, ALM.hot_leg_L_m, 0.01, 'm');
  Object.keys(ALM.vessel).forEach(function (k) {
    ck('vessel fraction ' + k, G.ALMARAZ_VESSEL_FRACTIONS[k], ALM.vessel[k] / ALM.rpv_m3, 0.002, '(frac)');
  });
  ck('downcomer follows the ruled Almaraz fraction',
     V('downcomer') / (G.LEDGER.rpv.m3 * FT3), ALM.vessel.downcomer / ALM.rpv_m3, 0.003, '(frac)');
  /* The core is derived INDEPENDENTLY of the vessel split, so it is the one vessel node that
   * can disagree — and that disagreement is information, not error. Assert it on its own basis. */
  ck('core volume from lattice geometry (independent of the split)', V('core'), 3.53 * 0.584 * FT3, 0.3, 'ft3');

  /* ---- 4. THE DECLARED UNCERTAINTY MUST BE REAL ------------------------------------- */
  if (!quiet) console.log('\nDECLARED UNCERTAINTY  [D1 §24 — it must travel WITH the data]');
  ck('unattributed fraction matches the declaration',
     G.UNATTRIBUTED_M3 / G.RCS_TOTAL_M3, G.INVENTORY_UNCERTAINTY, 0.002, '(frac)');
  ckT('the declared band is exposed to consumers', typeof G.INVENTORY_UNCERTAINTY === 'number' &&
      G.INVENTORY_UNCERTAINTY > 0.10 && G.INVENTORY_UNCERTAINTY < 0.15,
      (G.INVENTORY_UNCERTAINTY * 100).toFixed(1) + ' %');

  /* ---- 5. PHYSICAL SANITY ----------------------------------------------------------- */
  if (!quiet) console.log('\nPHYSICAL SANITY  [what the layout has to be true for]');
  ckT('SG sits ABOVE the core (natural circulation needs it)', node('sg_primary').z > node('core').z,
      'SG ' + node('sg_primary').z + ' m vs core ' + node('core').z + ' m');
  ckT('RCP is at a low point (NPSH margin)',
      node('rcp').z < node('core').z && node('rcp').z < node('cold_leg').z);
  ckT('pressurizer is the highest node', node('pressurizer').z ===
      Math.max.apply(null, G.NODES.map(function (n) { return n.z; })));
  ckT('every node has a positive volume', G.NODES.every(function (n) { return n.V > 0; }));
  /* Velocity, computed from Layer 0's energy balance rather than assumed. */
  var dh = W.h_l(321, 15.41) - W.h_l(288, 15.41), mdot = 300000 / dh;
  var Qh = mdot / W.rho_l(321, 15.41);
  var vHot = Qh / (node('hot_leg').V / G.LOOP.hot_leg.L);
  ckT('hot-leg velocity is in a real-plant family', vHot > 10 && vHot < 22,
      vHot.toFixed(1) + ' m/s (' + (vHot * 3.281).toFixed(0) + ' ft/s)');
  var transit = (G.RCS_TOTAL_M3 - node('pressurizer').V) / Qh;
  ckT('loop transit is REPORTED, not banded', isFinite(transit) && transit > 0,
      transit.toFixed(1) + ' s -- NO BAND ASSERTED (the 10-12 s figure is RETRACTED, D1 §3)');

  /* ---- 6. PROVENANCE ENFORCED ------------------------------------------------------- */
  if (!quiet) console.log('\nPROVENANCE  [D1 §2, enforced rather than declared]');
  var KINDS = ['[ruled]', '[sourced]', '[derived]', '[recalled]'];
  var RECALLED_ALLOWED = ['per_leg', 'grid_spacers', 'tube_entrance_exit'];
  var tagged = 0, untagged = [], recalled = [];
  function scan(obj, where) {
    Object.keys(obj).forEach(function (k) {
      var e = obj[k];
      if (!e || typeof e !== 'object') return;
      if (!('kind' in e)) { untagged.push(where + '.' + k); return; }
      if (KINDS.indexOf(e.kind) === -1) { untagged.push(where + '.' + k + ' (bad kind ' + e.kind + ')'); return; }
      tagged++;
      if (e.kind === '[recalled]') recalled.push(k);
    });
  }
  scan(G.LEDGER, 'LEDGER'); scan(G.LOOP, 'LOOP'); scan(G.FORM_LOSS_K, 'FORM_LOSS_K');
  /* NODES must go through the SAME collection as the keyed objects, not just a tag count.
   * The first draft counted node tags but never collected [recalled] from them, so the
   * self-test reported BLIND TO "a second [recalled] family appears" — a recalled NODE was
   * invisible while a recalled ledger entry was caught. Two containers, one rule. */
  G.NODES.forEach(function (n, i) {
    if (KINDS.indexOf(n.kind) === -1) { untagged.push('NODES[' + i + '] ' + n.id); return; }
    tagged++;
    if (n.kind === '[recalled]') recalled.push(n.id);
  });
  ckT('every entry carries a provenance kind', untagged.length === 0,
      untagged.length ? untagged.join(', ') : tagged + ' tagged');
  ckT('NO [tune] anywhere in the source', SRC.indexOf('[tune]') === -1 ||
      /`\[tune\]` does not exist|must never appear/.test(SRC.slice(Math.max(0, SRC.indexOf('[tune]') - 200), SRC.indexOf('[tune]') + 200)),
      'the only permitted mention is the prohibition itself');
  ckT('[recalled] is confined to the ONE ruled family',
      recalled.length > 0 && recalled.every(function (k) { return RECALLED_ALLOWED.indexOf(k) !== -1; }),
      recalled.join(', ') + ' -- form losses, OWNER RULING 2026-08-14');
  ckT('a [sourced] entry names its document',
      Object.keys(G.LOOP).concat(Object.keys(G.LEDGER)).every(function (k) {
        var e = G.LOOP[k] || G.LEDGER[k];
        return e.kind !== '[sourced]' || /NUREG|EPRI|WTSM|CASL|ML\d/.test(e.note);
      }));
}

console.log('\nPWR2 Layer 1 -- SLS-100 geometry');
var G = loadFrom(SRC), rec = [];
runSuite(G, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

/* ---------------------------------------------------------------- INJECTION SELF-TEST */
var MUTATIONS = [
  ['downcomer takes the AREA-RULE volume (the rejected basis)', "V: ft3(62.5), z: -0.30", "V: ft3(44.7), z: -0.30"],
  ['vessel split silently rebalanced (ledger still closes)',
   "{ id: 'lower_plenum',V: ft3(49.0)", "{ id: 'lower_plenum',V: ft3(56.0)"],
  ['hot leg reverts to the authored 10 ft length', "hot_leg:   { L: 7.25", "hot_leg:   { L: 3.05"],
  ['piping scaled by the wrong power ratio', "V: ft3(34.30)", "V: ft3(30.00)"],
  ['SG dropped below the core (kills natural circulation)', "z:  8.00", "z: -8.00"],
  ['RCP raised off the low point', "{ id: 'rcp',         V: ft3(28.1), z: -1.52", "{ id: 'rcp',         V: ft3(28.1), z:  1.52"],
  ['declared uncertainty quietly reduced', "INVENTORY_UNCERTAINTY: 0.121", "INVENTORY_UNCERTAINTY: 0.030"],
  ['unattributed volume zeroed but the band left standing', "UNATTRIBUTED_M3 = ft3(101.4)", "UNATTRIBUTED_M3 = ft3(0.0)"],
  ['a provenance tag dropped', "kind: '[sourced]', note: 'hemispherical pair", "note: 'hemispherical pair"],
  ['a [tune] constant introduced', "kind: '[derived]', note: 'Almaraz 3.18 m3", "kind: '[tune]', note: 'Almaraz 3.18 m3"],
  ['a SECOND [recalled] family appears', "kind: '[derived]', note: 'Almaraz 3.60 m3", "kind: '[recalled]', note: 'Almaraz 3.60 m3"],
  ['Almaraz vessel fractions edited away from the source', "downcomer: 0.198", "downcomer: 0.150"],
  ['core volume detached from lattice geometry', "{ id: 'core',        V: ft3(72.8)", "{ id: 'core',        V: ft3(85.0)"]
];

console.log('\n' + '='.repeat(70));
console.log('  INJECTION SELF-TEST -- every mutation MUST redden at least one check');
console.log('='.repeat(70));
var blind = 0;
MUTATIONS.forEach(function (m) {
  if (SRC.indexOf(m[1]) === -1) { console.log('  ERROR   anchor not found: ' + m[0]); blind++; return; }
  var r2 = [];
  try { runSuite(loadFrom(SRC.split(m[1]).join(m[2])), r2, true); }
  catch (e) { r2.push({ name: 'threw', ok: false }); }
  var f2 = r2.filter(function (r) { return !r.ok; }).length;
  if (f2 === 0) { blind++; console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); }
  else console.log('  caught    ' + m[0].padEnd(56) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_geometry: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
