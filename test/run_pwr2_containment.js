/* run_pwr2_containment.js — Layer 5 gate: containment. (#479)
 *
 * THE INITIAL CONDITION IS THE LOAD-BEARING CHECK, which is not obvious.
 *
 * Containment starts at a SOURCED state — 125 °F and 1.0 psig (Ginna ch15) — and reproducing it
 * requires the air-mass derivation, the vapour partial pressure and the flash solve to ALL be
 * right at once. Two separate defects in this file were caught by exactly that check and by
 * nothing else:
 *   the flash residual was seeded with ENTHALPY where it works in internal energy, a 6 % error
 *   that reported 392 °F for a containment the source says starts at 125;
 *   and the bisection was unbounded, so on a state with almost no water in it the solver ran to
 *   its own upper limit and reported 698 °F.
 * Both produced a perfectly stable, plausible-looking transient afterwards. **The transient is
 * where the physics shows; the initial condition is where the arithmetic shows.**
 *
 * ⚠ AND THE FLASH IS WHAT MAKES IT A CONTAINMENT RATHER THAN A HEATER. A version without it never
 * condensed anything — the sump stayed at 0 kg for the whole event — so all the latent heat went
 * into sensible temperature and it read 530 °F. So the gate checks that a SUMP FORMS, which is the
 * one observable that separates the two.
 *
 * Run: node test/run_pwr2_containment.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var MUT = require('./mut_flags.js');   /* --no-mutations / --mut= / --grp= (#602) */
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_containment.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_sources',
 'pwr2_cvcs', 'pwr2_break'].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, W = RD.water, S = RD.sources, B = RD.break_;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water, vtable: RD.vtable, cvcs: RD.cvcs } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.containment;';
  return new Function('RD_ROOT', body)(root);
}

/* THE SOURCE, RETYPED — Ginna UFSAR ch15 (ML20339A101): "Containment net free volume, ft3 1E6";
 * "initial (pre-accident) containment conditions of 125ºF and 1.0 psig". */
var DOC = { free_volume_ft3: 1.0e6, init_f: 125.0, init_psig: 1.0 };

function runSuite(C, rec, quiet) {
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
  function blowInto(secs, area) {
    var sys = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41 });
    var br = B.createBreak({ area_m2: area === undefined ? 0.001 : area, open: true });
    var ct = C.createContainment({}), r = null, cr = null;
    for (var i = 0; i < Math.round(secs / 0.02); i++) {
      r = B.stepBreak(br, sys, 0.02, { backpressure_mpa: cr ? cr.containment_pressure_mpa : undefined });
      /* #585 — the plant's acceptance books: ledger and containment intake both ride the core's
       * verdict, so a held step can neither book nor deliver. (Order swap is inert: containment
       * feeds back only through NEXT step's backpressure.) */
      var p = S.stepPlant(sys, 0.02, { sources: [r.source] });
      if (p.held !== true) {
        B.book(br, r);
        cr = C.stepContainment(ct, 0.02, { mdot_kgs: r.mdot_kgs, h_kJkg: r.source.h });
      }
    }
    return { cr: cr, br: br, sys: sys, ct: ct };
  }

  /* ---- CONSTRUCTION ----------------------------------------------------------------------- */
  head('CONSTRUCTION  [a caller argument that never arrives is invisible to a physics check]');
  ck('caller free volume reaches the plant',
     C.createContainment({ free_volume_m3: 1234 }).V_m3, 1234, 1e-12, 'm3');
  ck('caller temperature reaches the plant',
     C.createContainment({ temp_c: 40 }).T_c, 40, 1e-12, 'degC');
  ckT('caller pressure reaches the plant', (function () {
        var a = C.createContainment({}), b = C.createContainment({ pressure_mpa: 0.3 });
        return b.m_air > a.m_air * 1.5;
      })(), 'a higher initial pressure means MORE air in the same volume');

  /* ---- SOURCED, AND THE INITIAL CONDITION IS THE CHECK ------------------------------------ */
  head('THE INITIAL CONDITION  [it takes the air mass, the vapour pressure AND the flash solve]');
  ck('the anchor free volume matches the source', C.CTMT.ginna_free_volume_ft3,
     DOC.free_volume_ft3, 1e-9, 'ft3');
  ck('the sourced pre-accident temperature', C.CTMT.initial_temp_f, DOC.init_f, 1e-12, 'degF');
  ck('the sourced pre-accident pressure', C.CTMT.initial_psig, DOC.init_psig, 1e-12, 'psig');
  var ct0 = C.createContainment({});
  var r0 = C.stepContainment(ct0, 0.02, {});
  ck('a fresh containment REPRODUCES the sourced temperature',
     r0.containment_temp_c * 9 / 5 + 32, DOC.init_f, 0.1, 'degF');
  ck('...and the sourced pressure', r0.pressure_psig, DOC.init_psig, 0.02, 'psig');
  ckT('...and the solver is NOT sitting on its bound to do it', r0.solver_clamped === false,
      'a version seeded with enthalpy instead of internal energy clamped here and read 392 degF');
  ckT('free volume is on the VOLUME basis, with CVCS', (function () {
        return Math.abs(C.volumeScale() - RD.cvcs.volumeScale()) < 1e-12;
      })(), 'containment holds the primary INVENTORY when it flashes, so it scales like CVCS and ' +
            'not like ECCS/RHR/condenser — D1 and run_pwr2_bases carry the reasoning');
  ck('the volume power-... sorry, VOLUME-scales to this plant', C.freeVolumeM3() * 35.3147,
     DOC.free_volume_ft3 * RD.cvcs.volumeScale(), 5, 'ft3');

  /* ---- THE FLASH ---------------------------------------------------------------------------- */
  head('THE FLASH  [a sump forming is what separates a containment from a heater]');
  var b60 = blowInto(60);
  ckT('A SUMP FORMS', b60.cr.m_sump_kg > 100,
      b60.cr.m_sump_kg.toFixed(0) + ' kg condensed — a version without the flash held ZERO and ' +
      'put all the latent heat into temperature, reading 530 degF');
  ckT('...and the atmosphere stays SATURATED once it has', b60.cr.saturated === true, '');
  ckT('temperature stays in a physical range', b60.cr.containment_temp_c * 9 / 5 + 32 > 150 &&
      b60.cr.containment_temp_c * 9 / 5 + 32 < 300,
      (b60.cr.containment_temp_c * 9 / 5 + 32).toFixed(1) + ' degF at 60 s');
  ckT('...and the solver never reaches its bound during the event',
      b60.cr.solver_clamped === false, '');
  /* ⚠ #544: THE LEDGER IS AIR-INCLUSIVE, checked as a CLOSURE — a full revert to the
   * water-only build is self-consistent (its own seed matches its own residual), so the IC
   * checks alone cannot see it. Recomputing the atmosphere's total internal energy at the
   * REPORTED state and requiring it to equal the ledger fails the water-only build by the
   * whole air term, ~1.4 GJ here. */
  /* ⚠ THE 200 degC BOUND IS STILL LOAD-BEARING WITH THE AIR CARRIED (#544). The air term
   * fixed the near-empty IC that used to expose an unbounded search, sending that mutation
   * blind — but at post-blowdown water masses the residual still FALLS past the h_g peak
   * (measured at 6,000 kg: U(190 degC) = 17.0 GJ > U(370) = 13.8 GJ), so an unbounded
   * bisection reads residual(370) < 0 and parks on its own top. This state pins the branch. */
  ckT('a hot unsaturated atmosphere solves on the PHYSICAL branch, not the far wall', (function () {
        var hot = C.createContainment({});
        var TK = 190 + 273.15, Ps = W.P_sat(190);
        hot.m_water = 6000;
        hot.U_total_kJ = 6000 * (W.h_g(Ps) - 0.4615 * TK) + hot.m_air * 0.718 * TK;
        var out = C.stepContainment(hot, 0.02, {});
        return Math.abs(out.containment_temp_c - 190) < 0.5 && out.solver_clamped === false;
      })(), 'an unbounded search latches the falling branch and reports 370 degC for a 190 degC state');
  ckT('the energy ledger closes AIR-INCLUSIVE at the reported state', (function () {
        var TK = b60.cr.containment_temp_c + 273.15;
        var Ps = W.P_sat(b60.cr.containment_temp_c);
        var U = b60.cr.m_vapour_kg * (W.h_g(Ps) - 0.4615 * TK) +
                b60.cr.m_sump_kg * W.h_f(Ps) +
                b60.cr.m_air * 0.718 * TK;
        return b60.ct.U_total_kJ !== undefined &&
               Math.abs(U - b60.ct.U_total_kJ) < 0.01 * Math.abs(b60.ct.U_total_kJ);
      })(), 'water-only ledger misses the air\'s ~1.4 GJ (and the field itself)');
  /* ⚠ AND THE CLAMP FLAG NEEDS A CASE THAT ACTUALLY CLAMPS. Both checks above assert it is FALSE,
   * so a version hardcoding `false` satisfies them and the flag stops meaning anything -- the
   * injection self-test found exactly that. Driving a deliberately undersized containment past the
   * bound is the only way to see the flag work, and a flag nobody has seen raised is not a flag. */
  ckT('an OVER-DRIVEN containment reports the solver clamp rather than hiding it', (function () {
        var tiny = C.createContainment({ free_volume_m3: 20 });
        var out = null;
        for (var i = 0; i < 200; i++) {
          out = C.stepContainment(tiny, 0.02, { mdot_kgs: 50, h_kJkg: 2700 });
        }
        return out.solver_clamped === true;
      })(), 'a 20 m3 containment taking a full break says so, instead of quietly reporting 200 degC ' +
            'as though it were a solution');

  /* ---- THE COUPLING ------------------------------------------------------------------------ */
  head('THE COUPLING  [pressure and temperature RISE, driven by the break]');
  var b5 = blowInto(5), b30 = blowInto(30);
  ckT('pressure rises monotonically with the mass delivered',
      b5.cr.containment_pressure_mpa < b30.cr.containment_pressure_mpa &&
      b30.cr.containment_pressure_mpa < b60.cr.containment_pressure_mpa,
      b5.cr.pressure_psig.toFixed(2) + ' -> ' + b30.cr.pressure_psig.toFixed(2) + ' -> ' +
      b60.cr.pressure_psig.toFixed(2) + ' psig');
  ckT('temperature rises with it', b5.cr.containment_temp_c < b60.cr.containment_temp_c, '');
  /* ⚠ COMPARED ON GAUGE PRESSURE, NOT ABSOLUTE. The first version used containment_pressure_mpa,
   * which carries the ~0.101 MPa atmospheric offset, and that offset DILUTES every ratio: doubling
   * the break gives 10.40 -> 17.60 psig, a 1.69x RISE, but only 1.287x in absolute terms -- which
   * failed a 1.3x bar for a response that is plainly strong. The meaningful quantity is the rise
   * above ambient, and comparing absolutes was the same unit mismatch that has caught me before. */
  var big = blowInto(30, 0.002);
  ckT('a BIGGER break pressurises it faster', big.cr.pressure_psig > b30.cr.pressure_psig * 1.5,
      b30.cr.pressure_psig.toFixed(2) + ' -> ' + big.cr.pressure_psig.toFixed(2) +
      ' psig at double the area');
  ck('every kg the break discharged arrived', b60.cr.mass_in_kg, b60.br.discharged_kg, 1e-6, 'kg');
  ckT('the water inventory is vapour PLUS sump, with nothing lost between them',
      Math.abs(b60.cr.m_water - (b60.cr.m_vapour_kg + b60.cr.m_sump_kg)) < 1e-6, '');
  ckT('pressure is air PLUS steam (Dalton), not one of them',
      Math.abs(b60.cr.containment_pressure_mpa - (b60.cr.P_air_mpa + b60.cr.P_steam_mpa)) < 1e-12 &&
      b60.cr.P_steam_mpa > b60.cr.P_air_mpa * 0.5,
      'air ' + b60.cr.P_air_mpa.toFixed(4) + ' + steam ' + b60.cr.P_steam_mpa.toFixed(4) + ' MPa');
  ckT('the air mass is CONSERVED — containment does not leak in this model',
      Math.abs(b60.cr.m_air - r0.m_air) < 1e-9, 'declared: no leakage path is modelled');

  /* ---- REFUSAL ------------------------------------------------------------------------------ */
  head('REFUSAL  [the energy a discharge carries is the whole of what pressurises containment]');
  ckT('mass arriving without an enthalpy throws', (function () {
        try { C.stepContainment(C.createContainment({}), 0.02, { mdot_kgs: 10 }); return false; }
        catch (e) { return /h_kJkg/.test(e.message); }
      })(), '');
  ckT('...but a quiet containment with no flow does not', (function () {
        try { C.stepContainment(C.createContainment({}), 0.02, {}); return true; }
        catch (e) { return false; }
      })(), '');
}

console.log('\nPWR2 Layer 5 -- CONTAINMENT');
var C = loadFrom(SRC), rec = [];
runSuite(C, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['the flash solve is seeded with ENTHALPY instead of internal energy (the 392 degF defect)',
   '                  (W.h_g(Pv0) - 0.4615 * (T + 273.15)) +', '                  (W.h_g(Pv0)) +'],
  ['the bisection is unbounded again, so it latches onto the non-monotone branch',
   '      var lo = 20, hi = 200;', '      var lo = 20, hi = 370;'],
  ['NOTHING EVER CONDENSES — the sump is removed and it becomes a heater',
   '      m_sump = ct.m_water - m_vapour;', '      m_sump = 0;'],
  ['the vapour is not capped at saturation, so the atmosphere holds unlimited steam',
   '      m_vapour = Math.min(ct.m_water, mvmax);', '      m_vapour = ct.m_water;'],
  ['incoming enthalpy stops reaching the energy balance',
   '      ct.U_total_kJ += dm * drivers.h_kJkg;', ''],
  ['incoming mass stops reaching the water inventory', '      ct.m_water += dm;', ''],
  ['pressure drops the steam term', '      containment_pressure_mpa: P_a + P_v,',
   '      containment_pressure_mpa: P_a,'],
  ['pressure drops the air term', '      containment_pressure_mpa: P_a + P_v,',
   '      containment_pressure_mpa: P_v,'],
  ['the air mass is not derived from the sourced initial condition',
   '    var m_air = Pa0 * 1000 * V / (R_AIR * (T + 273.15));', '    var m_air = 4697;'],
  ['the air heat capacity leaves the RESIDUAL (#544 — the solved T is handed to the air free)',
   '              + ct.m_air * CV_AIR * TK;', '              ;'],
  ['the air heat capacity leaves the SEED (#544 — the ledger starts water-only)',
   '                  m_air * CV_AIR * (T + 273.15),', '                  0,'],
  ['the vapour partial pressure is ignored when deriving the air mass',
   '    var Pa0 = Math.max(0, P - Pv0);', '    var Pa0 = P;'],
  ['the sourced free volume moves', 'ginna_free_volume_ft3: 1.0e6,', 'ginna_free_volume_ft3: 2.0e6,'],
  ['the sourced initial temperature moves', 'initial_temp_f:        125.0,',
   'initial_temp_f:        90.0,'],
  ['the sourced initial pressure moves', 'initial_psig:          1.0,', 'initial_psig:          5.0,'],
  ['containment moves onto the POWER basis, breaking the declared reasoning',
   '    return RD.cvcs ? RD.cvcs.volumeScale() : 1;', '    return 300 / 1520;'],
  ['the solver clamp stops being reported', '      solver_clamped: ct.T_c >= 199.999,',
   '      solver_clamped: false,'],
  /* CONSTRUCTION */
  ['caller free volume ignored at construction',
   'var V = opts.free_volume_m3 === undefined ? freeVolumeM3() : opts.free_volume_m3;',
   'var V = freeVolumeM3();'],
  ['caller temperature ignored at construction',
   'var T = opts.temp_c === undefined ? f2c(CTMT.initial_temp_f) : opts.temp_c;',
   'var T = f2c(CTMT.initial_temp_f);'],
  ['caller pressure ignored at construction',
   'var P = opts.pressure_mpa === undefined ? psigToMpa(CTMT.initial_psig) : opts.pressure_mpa;',
   'var P = psigToMpa(CTMT.initial_psig);']
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
MUT.select(MUTATIONS).forEach(function (m) {
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
console.log('  run_pwr2_containment: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
