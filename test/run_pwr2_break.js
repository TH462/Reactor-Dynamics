/* run_pwr2_break.js — Layer 5 gate: primary break discharge. (#479)
 *
 * THE HARDEST THING TO GATE HERE IS AN ERROR THE FILE ADMITS TO. This model is not Moody, which is
 * what 10 CFR 50 App. K mandates, and it overstates subcooled discharge by roughly 2x. A gate that
 * pinned the flux to the model's own output would be certifying the error; a gate that pinned it to
 * the literature would fail on purpose. So the flux checks bound it in the direction the file
 * DECLARES — above the real value, below anything absurd — and the caveat is checked as a
 * first-class property rather than left in prose.
 *
 * WHAT IS ACTUALLY WORTH ASSERTING is the structure, because every structural error here is one a
 * plausible number would hide:
 *   MASS OUT MUST EQUAL MASS LOST. The break's own ledger and the plant's inventory are computed by
 *   different code; if they disagree the discharge is going somewhere.
 *   THE DISCHARGE MUST NOT STOP. A version of this file capped the head at the flashing point and
 *   the plant PARKED at 8.85 MPa with the break open — 207 kg in 60 s and then nothing. It looked
 *   entirely reasonable from every steady-state check.
 *   THE FLUID MUST GO TWO-PHASE. A blowdown that stays subcooled is not a blowdown.
 *
 * Run: node test/run_pwr2_break.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_break.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop',
 'pwr2_sources'].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, W = RD.water, S = RD.sources;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water, vtable: RD.vtable, geometry: RD.geometry,
                             core: RD.core, loop: RD.loop, sources: RD.sources } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.break_;';
  return new Function('RD_ROOT', body)(root);
}

/* THE SOURCE, RETYPED — 10 CFR 50 App. K I.C.1.b: a discharge coefficient applied to the postulated
 * break area, "these values spanning the range from 0.6 to 1.0". Back-pressure is Ginna's
 * pre-accident containment condition, 1.0 psig (ML20339A101). */
var DOC = { cd_min: 0.6, cd_max: 1.0, back_psig: 1.0 };
function plant(opts) { return S.createPlant(Object.assign({ h: W.h_l(304.5, 15.41), P: 15.41 }, opts || {})); }

function runSuite(B, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(56) +
      'got ' + got.toFixed(4) + ' want ' + want.toFixed(4) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }
  function blow(area, secs, opts) {
    var sys = plant(opts), br = B.createBreak({ area_m2: area, open: true });
    var M0 = sys.M_total, r = null, n = Math.round(secs / 0.02);
    for (var i = 0; i < n; i++) {
      r = B.stepBreak(br, sys, 0.02, {});
      S.stepPlant(sys, 0.02, { sources: [r.source] });
    }
    return { sys: sys, br: br, r: r, lost: M0 - sys.M_total, M0: M0 };
  }

  /* ---- CONSTRUCTION, WRITTEN FIRST (D1 §31) ---------------------------------------------- */
  head('CONSTRUCTION  [a caller argument that never arrives is invisible to a physics check]');
  ck('caller area reaches the break', B.createBreak({ area_m2: 0.007 }).area_m2, 0.007, 1e-12, 'm2');
  ck('caller discharge coefficient reaches the break', B.createBreak({ cd: 0.6 }).cd, 0.6, 1e-12, '');
  ckT('caller node reaches the break', B.createBreak({ node: 'hot_leg' }).node === 'hot_leg', '');
  ckT('caller open state reaches the break', B.createBreak({ open: true }).open === true, '');
  ck('caller discharged total reaches the break',
     B.createBreak({ discharged_kg: 88 }).discharged_kg, 88, 1e-12, 'kg');
  ckT('the default lineup is SHUT with zero area',
      B.createBreak({}).open === false && B.createBreak({}).area_m2 === 0,
      'a default of open would put a hole in every plant that omitted it');

  /* ---- SOURCED ---------------------------------------------------------------------------- */
  head('SOURCED  [10 CFR 50 App. K I.C.1.b, retyped independently]');
  ck('the App. K coefficient range, lower bound', B.BREAK.cd_min, DOC.cd_min, 1e-12, '');
  ck('the App. K coefficient range, upper bound', B.BREAK.cd_max, DOC.cd_max, 1e-12, '');
  ckT('the default coefficient sits INSIDE the sourced range',
      B.BREAK.cd_default >= DOC.cd_min && B.BREAK.cd_default <= DOC.cd_max,
      'Cd = ' + B.BREAK.cd_default);
  ck('back-pressure is the sourced containment pre-accident condition',
     B.BREAK.backpressure_mpa * 145.0377 - 14.696, DOC.back_psig, 0.01, 'psig');

  /* ---- THE DISCHARGE LAW ------------------------------------------------------------------ */
  head('THE DISCHARGE LAW  [an AREA with a coefficient, per App. K -- not a flow]');
  var sys0 = plant();
  var one = B.stepBreak(B.createBreak({ area_m2: 0.001, open: true }), sys0, 0.02, {});
  var ten = B.stepBreak(B.createBreak({ area_m2: 0.010, open: true }), sys0, 0.02, {});
  ck('flow is LINEAR in area', ten.mdot_kgs, one.mdot_kgs * 10, 1e-6, 'kg/s');
  ck('flow is LINEAR in the discharge coefficient',
     B.stepBreak(B.createBreak({ area_m2: 0.001, cd: 0.6, open: true }), sys0, 0.02, {}).mdot_kgs,
     one.mdot_kgs * 0.6, 1e-9, 'kg/s');
  ckT('a SHUT break discharges nothing',
      B.stepBreak(B.createBreak({ area_m2: 0.01, open: false }), sys0, 0.02, {}).mdot_kgs === 0, '');
  ckT('a ZERO-AREA break discharges nothing',
      B.stepBreak(B.createBreak({ area_m2: 0, open: true }), sys0, 0.02, {}).mdot_kgs === 0, '');
  /* A NEGATIVE area is nonsense input, and the guard that rejects it is only load-bearing if
   * something exercises it -- the replacement for a vacuous mutation was itself vacuous until
   * this check existed. Two vacuous mutations in one file is a pattern, not an accident: a guard
   * nothing tests is indistinguishable from no guard. */
  ckT('a NEGATIVE area produces no flow rather than a negative one',
      B.stepBreak(B.createBreak({ area_m2: -0.01, open: true }), sys0, 0.02, {}).mdot_kgs === 0,
      'nonsense in, nothing out — not nonsense out');
  ckT('a break into a HIGHER back-pressure discharges nothing',
      B.stepBreak(B.createBreak({ area_m2: 0.01, open: true }), sys0, 0.02,
                  { backpressure_mpa: 20 }).mdot_kgs === 0,
      'flow does not run backwards up the hole');

  /* ---- THE FLUX IS BOUNDED IN THE DIRECTION THE FILE DECLARES ----------------------------- */
  head('THE FLUX  [the file admits ~2x; the gate bounds it, it does not certify it]');
  ckT('subcooled flux is ABOVE the real critical value, as the file declares',
      one.flux_kg_m2s > 90000,
      one.flux_kg_m2s.toFixed(0) + ' kg/m2s against a literature 60,000-80,000 — this gate ' +
      'asserts the DECLARED overstatement rather than pretending it is not there');
  ckT('...and below anything absurd', one.flux_kg_m2s < 200000,
      'a model an order of magnitude out would be a different defect, not a declared one');
  ckT('the file reports what a flashing-limited model WOULD have used',
      one.dP_flash_limited_mpa > 0 && one.dP_flash_limited_mpa < one.dP_mpa,
      one.dP_flash_limited_mpa.toFixed(2) + ' vs ' + one.dP_mpa.toFixed(2) + ' MPa — the abandoned ' +
      'approach stays visible instead of being deleted');

  /* ---- THE BLOWDOWN ----------------------------------------------------------------------- */
  head('THE BLOWDOWN  [structure, because a plausible number hides every structural error]');
  var b = blow(0.001, 60);
  ck('the break ledger equals the plant inventory lost', b.br.discharged_kg, b.lost, 1e-6, 'kg');
  ckT('pressure falls and KEEPS falling', b.sys.P < 9 && b.sys.P > 4,
      '15.410 -> ' + b.sys.P.toFixed(3) + ' MPa in 60 s through 10 cm2');
  ckT('the fluid goes TWO-PHASE — a blowdown that stays subcooled is not a blowdown',
      b.r.quality > 0.01, 'x = ' + b.r.quality.toFixed(4));
  ckT('THE DISCHARGE DOES NOT STOP', b.r.mdot_kgs > 20,
      b.r.mdot_kgs.toFixed(1) + ' kg/s still flowing at 60 s. A flashing-limited version of this ' +
      'file parked the plant at 8.85 MPa and 0.7 kg/s -- and looked entirely reasonable');
  ckT('...and the flow DECLINES as the mixture thins, rather than growing',
      b.r.mdot_kgs < one.mdot_kgs,
      one.mdot_kgs.toFixed(1) + ' -> ' + b.r.mdot_kgs.toFixed(1) + ' kg/s as density collapses');
  ckT('a bigger break drains faster', blow(0.002, 30).lost > blow(0.001, 30).lost * 1.5, '');
  /* ⚠ THE DENSITY MUST BE THE MIXTURE'S, AND ONLY A COMPARISON SHOWS IT. Freezing rho at the
   * liquid value still produces a declining flow (because dP falls), so the decline check above
   * cannot see it. What a frozen density cannot do is FALL. */
  ckT('the density REPORTED is the mixture density, and it collapses during blowdown',
      b.r.rho_mix < one.rho_mix * 0.9 && b.r.rho_mix > 1,
      one.rho_mix.toFixed(0) + ' -> ' + b.r.rho_mix.toFixed(0) + ' kg/m3 as the fluid flashes');
  /* And the discharge carries the NODE condition, not a remembered one -- checked by equality
   * rather than by outcome, because the node enthalpy barely moves and an outcome check would be
   * satisfied by any nearby constant. */
  ckT('the discharge leaves at the NODE enthalpy, not a fixed value', (function () {
        var sysH = plant({ h: W.h_l(280, 15.41) });      /* a DIFFERENT initial enthalpy */
        var o = B.stepBreak(B.createBreak({ area_m2: 0.001, open: true }), sysH, 0.02, {});
        var nodeH = null;
        sysH.nodes.forEach(function (n) { if (n.id === 'cold_leg') nodeH = n.h; });
        return Math.abs(o.source.h - nodeH) < 1e-9 && Math.abs(nodeH - 1362) > 50;
      })(), 'tested at a node enthalpy far from the default, so a remembered constant cannot pass');

  /* ---- REFUSALS --------------------------------------------------------------------------- */
  head('REFUSALS  [a break is an area in a SPECIFIC node]');
  ckT('stepping without a plant throws', (function () {
        try { B.stepBreak(B.createBreak({}), null, 0.02, {}); return false; }
        catch (e) { return /plant is REQUIRED/.test(e.message); }
      })(), '');
  ckT('a break in a node the plant does not have throws', (function () {
        try { B.stepBreak(B.createBreak({ node: 'nowhere', open: true, area_m2: 0.01 }),
                          plant(), 0.02, {}); return false; }
        catch (e) { return /no node/.test(e.message); }
      })(), 'a silently-missing node would discharge nothing for ever');
}

console.log('\nPWR2 Layer 5 -- PRIMARY BREAK DISCHARGE');
var B = loadFrom(SRC), rec = [];
runSuite(B, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['THE FLASHING CAP RETURNS — the discharge stops at saturation (the abandoned version)',
   '      var dP_eff = dP;',
   '      var dP_eff = Math.max(0, sys.P - W.P_sat(W.T_from_h(node.h, sys.P)));'],
  ['the discharge coefficient stops scaling the flow',
   '      mdot = br.cd * br.area_m2 * G;', '      mdot = br.area_m2 * G;'],
  ['the area stops scaling the flow', '      mdot = br.cd * br.area_m2 * G;',
   '      mdot = br.cd * 0.001 * G;'],
  ['density is frozen at liquid instead of following the mixture',
   /* anchor re-pointed #514: the discharge density goes through RHO (the vtable idiom) now */
   '      rho = RHO(node.h, sys.P);', '      rho = 716;'],
  ['back-pressure is ignored, so the break always sees the full system pressure',
   '    var dP = sys.P - back;', '    var dP = sys.P;'],
  ['a shut break still discharges',
   '    var open = br.open && br.area_m2 > 0 && dP > 0;',
   '    var open = br.area_m2 > 0 && dP > 0;'],
  /* A "zero-area break still discharges" mutation was tried here and is VACUOUS: with area 0 the
   * product cd * area * G is zero whatever the guard says, so removing `area_m2 > 0` changes
   * nothing. The guard is redundant rather than load-bearing, and a mutation that cannot alter
   * behaviour is not coverage. Replaced with one that can. */
  ['a NEGATIVE area is trusted instead of producing no flow',
   '    var open = br.open && br.area_m2 > 0 && dP > 0;',
   '    var open = br.open && br.area_m2 !== 0 && dP > 0;'],
  ['flow runs BACKWARDS when the back-pressure is higher',
   '    var open = br.open && br.area_m2 > 0 && dP > 0;',
   '    var open = br.open && br.area_m2 > 0;'],
  ['the source carries POSITIVE mdot, so a break ADDS mass to the plant',
   '      source: { node: br.node, mdot: -mdot, h: node.h },',
   '      source: { node: br.node, mdot: mdot, h: node.h },'],
  ['the discharge leaves at a fixed enthalpy instead of the node condition',
   '      source: { node: br.node, mdot: -mdot, h: node.h },',
   '      source: { node: br.node, mdot: -mdot, h: 1362 },'],
  ['the ledger stops accumulating', '    br.discharged_kg += mdot * dt;', ''],
  ['the App. K coefficient range moves', 'cd_min: 0.6, cd_max: 1.0,', 'cd_min: 0.3, cd_max: 1.5,'],
  ['the sourced back-pressure moves', 'backpressure_mpa: (1.0 + 14.696) / 145.0377,',
   'backpressure_mpa: 0.5,'],
  ['a missing node is tolerated instead of throwing',
   "      throw new Error('pwr2_break: no node \"' + br.node + '\" in this plant — a break must be ' +\n                      'somewhere, and a silently-missing node would discharge nothing for ever.');",
   '      return { mdot_kgs: 0, source: { node: br.node, mdot: 0, h: 0 } };'],
  /* CONSTRUCTION */
  ['caller area ignored at construction',
   'area_m2: opts.area_m2 === undefined ? 0 : opts.area_m2,', 'area_m2: 0,'],
  ['caller coefficient ignored at construction',
   'cd:      opts.cd === undefined ? BREAK.cd_default : opts.cd,', 'cd:      BREAK.cd_default,'],
  ['caller node ignored at construction',
   "node:    opts.node === undefined ? 'cold_leg' : opts.node,", "node:    'cold_leg',"],
  ['the default lineup ships OPEN',
   'open:    opts.open === undefined ? false : !!opts.open,',
   'open:    opts.open === undefined ? true : !!opts.open,']
];

if (fail > 0) {
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
MUTATIONS.forEach(function (m) {
  if (SRC.indexOf(m[1]) === -1) { console.log('  ERROR   anchor not found: ' + m[0]); blind++; return; }
  var r2 = [];
  try { runSuite(loadFrom(SRC.split(m[1]).join(m[2])), r2, true); }
  catch (e) { r2.push({ name: 'threw', ok: false }); }
  var f2 = r2.filter(function (r) { return !r.ok; }).length;
  if (f2 === 0) { blind++; console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); }
  else console.log('  caught    ' + m[0].padEnd(74) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_break: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
