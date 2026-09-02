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
var MUT = require('./mut_flags.js');   /* --no-mutations / --mut= / --grp= (#602) */
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
  /* NODES + THE LAYER-5 VESSEL (#583). The pressurizer is not a node — it is the ledger row
   * that has no NODES entry, because Layer 5 owns the vessel and a ring node of the same name
   * double-counted it. So the closure is nodes PLUS that row, and `rcsVolume()` is the function
   * the engine's own consumers call for exactly this sum. Asserting the function too, because a
   * computed helper that nothing checks is how the two pressurizer sizes drifted apart. */
  ck('ALL nodes PLUS the Layer-5 vessel sum to the declared RCS total',
     all + G.LEDGER.pressurizer.m3 * FT3, G.RCS_TOTAL_M3 * FT3, 0.3, 'ft3');
  ck('...and rcsVolume() is that same whole-plant number', G.rcsVolume() * FT3,
     G.RCS_TOTAL_M3 * FT3, 0.3, 'ft3');
  ckT('the pressurizer is NOT a node — it would be a double count of the Layer-5 vessel (#583)',
      !G.NODES.some(function (n) { return n.id === 'pressurizer'; }) &&
      G.LEDGER.pressurizer !== undefined && G.NODES.length === 10,
      G.NODES.length + ' nodes, and the ledger still carries the vessel at ' +
      (G.LEDGER.pressurizer.m3 * FT3).toFixed(1) + ' ft3');
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
  /* The floor was 0.10 until #583 and the band is now 0.05-0.15. THAT IS NOT A RE-BAND TO GET
   * GREEN: the pressurizer ledger row was a 125.2 ft3 design-basis PLACEHOLDER against a
   * 135.3 ft3 reference target, and #472's real vessel is 147.5 — so swapping it ATTRIBUTES
   * 22.3 ft3 that used to sit in the unattributed residual (101.4 -> 79.1 ft3). The declared
   * uncertainty fell because a gap closed. The floor still catches the mutation it was written
   * for (a declaration quietly reduced to 0.030). */
  ckT('the declared band is exposed to consumers', typeof G.INVENTORY_UNCERTAINTY === 'number' &&
      G.INVENTORY_UNCERTAINTY > 0.05 && G.INVENTORY_UNCERTAINTY < 0.15,
      (G.INVENTORY_UNCERTAINTY * 100).toFixed(1) + ' %');

  /* ---- 5. PHYSICAL SANITY ----------------------------------------------------------- */
  if (!quiet) console.log('\nPHYSICAL SANITY  [what the layout has to be true for]');
  ckT('SG sits ABOVE the core (natural circulation needs it)', node('sg_primary').z > node('core').z,
      'SG ' + node('sg_primary').z + ' m vs core ' + node('core').z + ' m');
  ckT('RCP is at a low point (NPSH margin)',
      node('rcp').z < node('core').z && node('rcp').z < node('cold_leg').z);
  /* This was "pressurizer is the highest node" until #583 deleted that node. The claim it was
   * really making — the loop's top is the STEAM GENERATOR, which is what the natural-circulation
   * thermal centre needs and what the surge line hangs off above — survives without it. */
  ckT('the steam generator is the highest node (the loop\'s thermal centre, #583)',
      node('sg_primary').z === Math.max.apply(null, G.NODES.map(function (n) { return n.z; })),
      'SG ' + node('sg_primary').z + ' m; the pressurizer is Layer 5\'s vessel, not a node');
  ckT('every node has a positive volume', G.NODES.every(function (n) { return n.V > 0; }));
  /* Velocity, computed from Layer 0's energy balance rather than assumed. */
  var dh = W.h_l(321, 15.41) - W.h_l(288, 15.41), mdot = 300000 / dh;
  var Qh = mdot / W.rho_l(321, 15.41);
  var vHot = Qh / (node('hot_leg').V / G.LOOP.hot_leg.L);
  ckT('hot-leg velocity is in a real-plant family', vHot > 10 && vHot < 22,
      vHot.toFixed(1) + ' m/s (' + (vHot * 3.281).toFixed(0) + ' ft/s)');
  /* THE FLOW PATH ONLY. Until #583 this subtracted the pressurizer node and left `vessel_heads`
   * in — an off-loop volume on the transit path, which overstated it. Both off-loop volumes are
   * out now, and the pressurizer is out by construction (it is not in NODES at all). */
  var ringV = 0;
  G.NODES.forEach(function (n) { if (n.id !== 'vessel_heads') ringV += n.V; });
  var transit = ringV / Qh;
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

  /* ---- 6. THE TABLES MUST CORRESPOND  [what an adversarial pass found this gate blind to] ----
   * The thirteen curated mutations all edit a NUMBER -- a volume, an elevation, a fraction, a
   * provenance tag -- because Layer 1 is a data file and that is what data files get wrong. Four
   * more were written against the file's STRUCTURE and three survived. Same shape as Layers 2, 3
   * and 4 (D1 §31): what the curated set is aimed at is what it defends.
   *
   * The third is the one that matters. LOOP (segment lengths) and NODES (volumes) are two tables
   * that must describe the SAME loop, and Layer 4 multiplies them together to get the momentum
   * inertia. Dropping a segment from LOOP silently reduces that inertia and NOTHING noticed --
   * not here, and not in Layer 4, which computes SUM(L/A) from whatever keys it happens to find.
   * Two tables that must agree, with nothing asserting they do. */
  if (!quiet) console.log('\nCORRESPONDENCE  [two tables that must describe the same loop]');
  var ringIds = ['downcomer', 'lower_plenum', 'core', 'upper_plenum', 'hot_leg',
                 'sg_primary', 'crossover', 'rcp', 'cold_leg'];
  var stray = Object.keys(G.LOOP).filter(function (k) { return ringIds.indexOf(k) === -1; });
  var absent = ringIds.filter(function (id) {
    return !G.NODES.some(function (n) { return n.id === id; }); });
  ckT('every LOOP segment names a ring node, and none is missing',
      stray.length === 0 && absent.length === 0,
      Object.keys(G.LOOP).length + ' segments against ' + ringIds.length + ' ring nodes' +
      (absent.length ? '; ABSENT ' + absent.join(', ') : '') +
      (stray.length ? '; STRAY ' + stray.join(', ') : ''));
  ckT('...and every LOOP segment carries a positive length',
      Object.keys(G.LOOP).every(function (k) { return G.LOOP[k].L > 0; }),
      'shortest ' + Math.min.apply(null, Object.keys(G.LOOP).map(function (k) {
        return G.LOOP[k].L; })).toFixed(2) + ' m -- Layer 4 divides by these');

  /* A DECLARED gap silently set to zero stops being a declaration. Layer 4's gate bands this;
   * Layer 1 should own the number it declares rather than rely on a consumer to notice. */
  ck('the omitted-inertia fraction is the declared 5.3 %', G.LOOP_INERTIA_OMITTED, 0.053, 1e-9, '');

  /* ---- THE METAL WALLS (#574) --------------------------------------------------------------
   * `wallLumps` shipped on every node with ZERO consumers, so the table read as a working
   * feature to anyone who opened it. The first check is therefore about COVERAGE: a node that
   * quietly gets no wall is the same dark wire in a new place. */
  if (!quiet) console.log('\nMETAL WALLS  [every node, or the dark wire is back]');
  var noWall = G.NODES.filter(function (n) { return !G.WALLS[n.id]; }).map(function (n) { return n.id; });
  ckT('EVERY node has a metal wall — the ruling was "all of them", not "the ones that were easy"',
      noWall.length === 0 && Object.keys(G.WALLS).length === G.NODES.length,
      noWall.length ? 'missing: ' + noWall.join(', ') : G.NODES.length + ' of ' + G.NODES.length);
  var bad = G.NODES.filter(function (n) {
    var w = G.WALLS[n.id];
    return !(w && w.M_kg > 0 && w.A_m2 > 0 && w.t_m > 0 && G.WALL_MAT[w.mat] && w.kind);
  }).map(function (n) { return n.id; });
  ckT('...each with a positive mass, area and thickness, a known material and a provenance kind',
      bad.length === 0, bad.length ? 'bad: ' + bad.join(', ') : G.NODES.length + ' complete');
  /* THE STEAM GENERATOR'S CROSS-CHECK, and it is the strongest number in this block: the tube
   * bore implied by the SOURCED heat-transfer area and the Model 51 tube size reproduces this
   * file's INDEPENDENTLY derived sg_primary node volume. Two numbers that were never fitted to
   * each other. If a future edit moves either, this is what notices. */
  var sgV = G.NODES.filter(function (n) { return n.id === 'sg_primary'; })[0].V;
  ck('the SG tube bore implied by the sourced area reproduces the sg_primary node volume',
     G.WALLS.sg_primary.V_implied_m3 / sgV, 1.0, 2e-3, '');
  /* THE PIPE WALLS, RETYPED — the r_D rule applied by hand to the sourced reference sizes, so
   * a transcription slip in the module cannot pass by equalling itself. */
  (function () {
    var REF = { hot_leg: [29.0, 2.84], crossover: [31.0, 2.99], cold_leg: [27.5, 2.69] };
    var worst = 0, at = null;
    Object.keys(REF).forEach(function (id) {
      var L = G.LOOP[id].L, V = G.NODES.filter(function (n) { return n.id === id; })[0].V;
      var D = Math.sqrt(4 * (V / L) / Math.PI);
      var t = REF[id][1] * 0.0254 * (D / (REF[id][0] * 0.0254));
      var M = Math.PI * t * (D + t) * L * 7850;
      var e = Math.abs(M / G.WALLS[id].M_kg - 1);
      if (e > worst) { worst = e; at = id; }
    });
    ckT('the three pipe walls match an independently retyped r_D derivation',
        worst < 1e-9, 'worst ' + worst.toExponential(2) + (at ? ' at ' + at : ''));
  })();
  /* THE HEADLINE RATIO, PINNED. It is what the #574 ruling was taken on and it is the number
   * that decides how much a cooldown moves — so it must not drift silently when a mass is edited.
   *
   * ⚠ THE DENOMINATOR IS COMPUTED NOW, and #583 is why. It used to be the typed constant
   * 93,855 kJ/K with an absolute band (40,000-47,000) on the numerator. Deleting the phantom
   * pressurizer node took 8,708 kg of metal AND 2,772 kg of fluid out together, so the absolute
   * band failed while the RATIO — the thing the ruling was actually about — went UP, 46.3 % to
   * 49.2 %. A typed denominator cannot tell those two cases apart; a live one can. Both numbers
   * are reported so a future edit is read, not just judged. */
  (function () {
    var C = 0, Cf = 0;
    var rhoD = W.rho_l(304.5, 15.41);                        // design-point liquid density
    var cpD = W.h_l(305, 15.41) - W.h_l(304, 15.41);         // kJ/kg-K there, from Layer 0
    G.NODES.forEach(function (n) {
      var w = G.WALLS[n.id]; C += w.M_kg * G.WALL_MAT[w.mat].cp;
      Cf += n.V * rhoD * cpD;
    });
    ckT('the metal:fluid heat-capacity ratio is where the #574 ruling was taken (~49 %)',
        C / Cf > 0.42 && C / Cf < 0.56,
        C.toFixed(0) + ' kJ/K of metal against ' + Cf.toFixed(0) + ' of ring fluid = ' +
        (100 * C / Cf).toFixed(1) + ' % (was 46.3 % of 93,855 before #583 removed the ' +
        'phantom pressurizer node — metal AND fluid left together)');
  })();
  /* ⚠ THE FUEL IS NOT IN HERE. `pwr2_fuel` owns the rods' thermal mass; a "core wall" that
   * included them would double-count the one metal capacity the plant already had. The core's
   * wall is the BARREL, and its mass has to be barrel-sized, not core-sized. */
  ckT('the core node\'s wall is the BARREL, not the fuel — pwr2_fuel already owns the rods',
      G.WALLS.core.M_kg < 15000 && /barrel/i.test(G.WALLS.core.note),
      G.WALLS.core.M_kg.toFixed(0) + ' kg: ' + G.WALLS.core.note);
  ckT('the form-loss map is exactly the three declared families',
      Object.keys(G.FORM_LOSS_K).length === 3 &&
      Object.keys(G.FORM_LOSS_K).every(function (k) { return G.FORM_LOSS_K[k].K > 0; }),
      Object.keys(G.FORM_LOSS_K).join(', ') + ' -- all [recalled] and ruled to stand, so a ' +
      'FOURTH appearing unannounced is a change of basis, not a tweak');
}

console.log('\nPWR2 Layer 1 -- SLS-100 geometry');
var G = loadFrom(SRC), rec = [];
runSuite(G, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

/* ---------------------------------------------------------------- INJECTION SELF-TEST */
var MUTATIONS = [
  /* ---- THE METAL WALLS (#574) ---- */
  ['a node quietly gets no wall (the dark wire returns, one node at a time)',
   "    w.rcp = { M_kg:", "    if (false) w.rcp = { M_kg:"],
  ['the SG tube wall thickness is mistyped (the cross-check against the node volume is the tell)',
   'TUBE_WALL = 0.050 * IN_M', 'TUBE_WALL = 0.065 * IN_M'],
  ['the pipe wall stops scaling with the r_D rule (reference thickness used raw)',
   '      var t = REF_PIPE[id].t * IN_M * (D / (REF_PIPE[id].D * IN_M));',
   '      var t = REF_PIPE[id].t * IN_M;'],
  ['the ASME wall goes thin (the vessel stops being the biggest term)',
   'S_allow_mpa: 138', 'S_allow_mpa: 400'],
  ['the core wall takes the FUEL as well as the barrel (the rods counted twice)',
   "    var t_barrel = 0.050;", "    var t_barrel = 0.400;"],
  ['downcomer takes the AREA-RULE volume (the rejected basis)', "V: ft3(62.5), z: -0.30", "V: ft3(44.7), z: -0.30"],
  ['vessel split silently rebalanced (ledger still closes)',
   "{ id: 'lower_plenum',V: ft3(49.0)", "{ id: 'lower_plenum',V: ft3(56.0)"],
  ['hot leg reverts to the authored 10 ft length', "hot_leg:   { L: 7.25", "hot_leg:   { L: 3.05"],
  ['piping scaled by the wrong power ratio', "V: ft3(34.30)", "V: ft3(30.00)"],
  ['SG dropped below the core (kills natural circulation)', "z:  8.00", "z: -8.00"],
  ['RCP raised off the low point', "{ id: 'rcp',         V: ft3(28.1), z: -1.52", "{ id: 'rcp',         V: ft3(28.1), z:  1.52"],
  ['declared uncertainty quietly reduced', "INVENTORY_UNCERTAINTY: 0.092", "INVENTORY_UNCERTAINTY: 0.030"],
  ['unattributed volume zeroed but the band left standing', "UNATTRIBUTED_M3 = ft3(79.1)", "UNATTRIBUTED_M3 = ft3(0.0)"],
  /* ---- THE #583 DOUBLE COUNT, three ways it could come back ---- */
  ['the pressurizer NODE returns (the #583 double count, restored verbatim)',
   "      kind: '[derived]', note: 'Almaraz 3.23 m3 x 0.3054; ECCS injects here' }",
   "      kind: '[derived]', note: 'Almaraz 3.23 m3 x 0.3054; ECCS injects here' },\n" +
   "    { id: 'pressurizer', V: ft3(125.2),z:  9.00, transport: 'stirred', wallLumps: 1,\n" +
   "      kind: '[derived]', note: 'the defect #583 removed' }"],
  ['rcsVolume() forgets the Layer-5 vessel (Sum NODES called the plant again)',
   'return V + LEDGER.pressurizer.m3;', 'return V;'],
  ['the ledger row reverts to the 125.2 ft3 DESIGN-BASIS PLACEHOLDER (#472 owns the real number)',
   'pressurizer:  { m3: 4.176', 'pressurizer:  { m3: ft3(125.2)'],
  ['a provenance tag dropped', "kind: '[sourced]', note: 'hemispherical pair", "note: 'hemispherical pair"],
  ['a [tune] constant introduced', "kind: '[derived]', note: 'Almaraz 3.18 m3", "kind: '[tune]', note: 'Almaraz 3.18 m3"],
  ['a SECOND [recalled] family appears', "kind: '[derived]', note: 'Almaraz 3.60 m3", "kind: '[recalled]', note: 'Almaraz 3.60 m3"],
  ['Almaraz vessel fractions edited away from the source', "downcomer: 0.198", "downcomer: 0.150"],
  ['core volume detached from lattice geometry', "{ id: 'core',        V: ft3(72.8)", "{ id: 'core',        V: ft3(85.0)"],
  /* The three an adversarial STRUCTURE pass found. */
  ['a loop segment dropped from the LOOP map (Layer 4 silently loses inertia)',
   'crossover:', 'crossover_GONE:'],
  ['the declared omitted-inertia fraction silently zeroed',
   'var LOOP_INERTIA_OMITTED = 0.053;', 'var LOOP_INERTIA_OMITTED = 0;'],
  ['a FOURTH form-loss family appears unannounced',
   'var FORM_LOSS_K = {', "var FORM_LOSS_K = { extra_bend: { K: 0.5, kind: '[recalled]', note: 'x' },"]
];

/* ---- THE CLEAN-RUN GUARD --------------------------------------------------------------
 * A MUTATION SELF-TEST IS ONLY MEANINGFUL IF THE UNMUTATED SUITE IS GREEN. If any check fails in
 * the clean run it fails in every mutant too, so `f2 > 0` holds unconditionally and EVERY mutation
 * is reported as caught. Coverage then reads 25/25 while the suite is measuring nothing.
 *
 * MEASURED in run_pwr2_kinetics.js, 2026-08-16: a fixture producing NaN made one check fail in the
 * clean run. The self-test reported 23/25. Fixing that ONE check dropped it to 21/25 -- the two
 * extra "caught" mutations had never been caught by anything, and both were genuinely blind.
 *
 * So the tally is REFUSED, not annotated, when the clean run is red. */
if (fail > 0) {
  /* PRINT THE SCORE FIRST. run_all parses this line to report drift; exiting without it
   * makes a legitimately-failing gate read as `score ?`, which is LESS informative than
   * before the guard existed. The guard refuses the MUTATION TALLY, not the tally line. */
  console.log('  ' + require('path').basename(__filename, '.js') + ': ' + pass +
              ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
  console.log('  MUTATION SELF-TEST SKIPPED -- ' + fail + ' check(s) failed in the CLEAN run.');
  console.log('  A failing check fails in every mutant too, so every mutation would report as');
  console.log('  caught and the coverage number would be a lie. Fix the check first.');
  process.exit(1);
}

console.log('\n' + '='.repeat(70));
console.log('  INJECTION SELF-TEST -- every mutation MUST redden at least one check');
console.log('='.repeat(70));
var blind = 0;
MUT.select(MUTATIONS).forEach(function (m) {
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
