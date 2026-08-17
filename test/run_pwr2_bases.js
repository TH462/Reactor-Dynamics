/* run_pwr2_bases.js — EACH SYSTEM'S SCALING BASIS IS PINNED, AND THEY DIFFER ON PURPOSE. (#479)
 *
 * (OWNER RULING, 2026-08-15: chose "keep the split, add a check that pins each system's declared
 * basis" from three options — keep and pin, unify on power, unify on volume.)
 *
 * PWR2's Layer 5 systems do NOT all scale the same way, and that is deliberate:
 *
 *   CVCS          VOLUME   charging and letdown move a FRACTION OF INVENTORY PER MINUTE, and
 *                          boration moves PPM PER MINUTE — both volume-normalised by definition
 *   ECCS          POWER    sized to keep the core covered and carry DECAY HEAT
 *   RHR           POWER    same duty, one phase later
 *   seal injection NEITHER  a seal belongs to the PUMP, not to the plant (WTSM 5 gpm per RCP)
 *
 * **THIS LOOKS LIKE AN INCONSISTENCY AND IS NOT**, which is exactly why it needs a gate rather
 * than a comment. Each basis is defended at its own definition, in three separate files, and
 * nothing stopped a future session "tidying them up" into one — with every existing gate staying
 * green, because each file is individually self-consistent either way.
 *
 * The bases genuinely disagree: this plant carries 17 % less water per MWt than Ginna, so
 * volume gives x0.1631 and power x0.1974 — **21 % apart**. Unifying would move the charging rate
 * an operator learns by that much, or resize emergency injection against the wrong duty.
 *
 * WHAT THIS GATE ASSERTS. Not that the numbers are right — their own gates do that. That each
 * system still uses the basis it DECLARES, that the two bases remain distinguishable, and that a
 * silent unification reddens here. It is the cross-file check none of the per-layer gates can be.
 *
 * Run: node test/run_pwr2_bases.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_sources',
 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_rhr'].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2;

/* ---- THE SELF-TEST NEEDED A THREE-FILE loadFrom, WHICH IS WHY THIS GATE WENT WITHOUT ONE.
 * Every other pwr2 gate patches ONE library. This one is a CROSS-FILE check by construction --
 * its whole subject is three modules agreeing about something none of them states alone -- so the
 * self-test has to mutate any of the three while the other two stay real. loadOne() rebuilds a
 * namespace with the shared Layer 0-4 modules plus the unmutated siblings, evaluates the patched
 * file into it, and hands back all three. */
var SRC = {};
['pwr2_cvcs', 'pwr2_eccs', 'pwr2_rhr'].forEach(function (f) {
  SRC[f] = fs.readFileSync(path.join(E, f + '.js'), 'utf8').replace(/\r\n/g, '\n');
});
var EXPORT = { pwr2_cvcs: 'cvcs', pwr2_eccs: 'eccs', pwr2_rhr: 'rhr' };

function loadOne(which, src) {
  var root = { RD: { pwr2: { water: RD.water, vtable: RD.vtable, core: RD.core,
                             geometry: RD.geometry, loop: RD.loop, sources: RD.sources,
                             cvcs: RD.cvcs, eccs: RD.eccs, rhr: RD.rhr } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.' + EXPORT[which] + ';';
  var mod = new Function('RD_ROOT', body)(root);
  var out = { CV: RD.cvcs, EC: RD.eccs, RH: RD.rhr };
  if (which === 'pwr2_cvcs') out.CV = mod;
  else if (which === 'pwr2_eccs') out.EC = mod;
  else out.RH = mod;
  return out;
}

function runSuite(CV, EC, RH, rec, quiet) {
function ck(name, cond, note) {
  rec.push({ name: name, ok: !!cond });
  if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
}
function log(s) { if (!quiet) console.log(s); }

/* ---- 1. THE TWO BASES ARE DISTINGUISHABLE ------------------------------------------- */
log('\nTHE BASES  [they must stay far enough apart that confusing them is visible]');
var vol = CV.volumeScale(), pow = EC.ECCS.POWER_SCALE;
log('        volume x' + vol.toFixed(4) + '   power x' + pow.toFixed(4) +
            '   ' + (100 * (pow / vol - 1)).toFixed(0) + ' % apart');
ck('the volume basis is DERIVED from Layer 1 geometry, not written down',
   Math.abs(vol - CV.rcsVolume() / CV.GINNA_RCS_M3) < 1e-12,
   'x' + vol.toFixed(4) + ' from ' + CV.rcsVolume().toFixed(2) + ' m3 against Ginna ' +
   CV.GINNA_RCS_M3.toFixed(2) + ' m3 -- it moves when the geometry does');
ck('the power basis is this plant against its anchor', Math.abs(pow - 300 / 1520) < 1e-12,
   '300 MWt / 1520 MWt');
ck('the two bases are more than 15 % apart, so a swap is VISIBLE',
   Math.abs(pow / vol - 1) > 0.15,
   'this plant carries 17 % less water per MWt than Ginna (0.0789 vs 0.0954 m3/MWt), which is ' +
   'the whole reason they disagree');

/* ---- 2. EACH SYSTEM USES THE BASIS IT DECLARES --------------------------------------- */
log('\nEACH SYSTEM USES WHAT IT DECLARES  [a silent unification reddens here]');
ck('CVCS charging is on the VOLUME basis',
   Math.abs(CV.CVCS.charging_max_gpm() - 180 * vol) < 1e-9 &&
   Math.abs(CV.CVCS.charging_max_gpm() - 180 * pow) > 1,
   CV.CVCS.charging_max_gpm().toFixed(1) + ' gpm; the power basis would give ' +
   (180 * pow).toFixed(1) + ' -- charging moves a FRACTION OF INVENTORY per minute');
/* ⚠ NORMAL charging needs its own check, and the injection self-test is what proved it.
 * The flow-balance check below CANNOT see this one: letdown is computed from
 * `charging_normal_gpm() + sealInjectionGpm()`, so moving normal charging to the power basis moves
 * letdown with it and the balance still closes at net zero. Only a direct basis check catches it,
 * and the gate had one for charging_max and not for charging_normal. */
ck('CVCS NORMAL charging is on the VOLUME basis too',
   Math.abs(CV.CVCS.charging_normal_gpm() - 46 * vol) < 1e-9 &&
   Math.abs(CV.CVCS.charging_normal_gpm() - 46 * pow) > 0.5,
   CV.CVCS.charging_normal_gpm().toFixed(1) + ' gpm; the power basis would give ' +
   (46 * pow).toFixed(1) + ' -- the balance check cannot see this, because letdown derives from ' +
   'the same function and moves with it');
ck('ECCS injection is on the POWER basis',
   Math.abs(EC.hhsiFlow(1.0) - EC.gpmToKgs(300 * pow, 1000)) < 1e-9 &&
   Math.abs(EC.hhsiFlow(1.0) - EC.gpmToKgs(300 * vol, 1000)) > 1e-4,
   (EC.hhsiFlow(1.0) / 1000 * 264.172 * 60).toFixed(1) + ' gpm; the volume basis would give ' +
   (300 * vol).toFixed(1) + ' -- ECCS carries DECAY HEAT, a power fraction');
ck('RHR is on the POWER basis, with ECCS', Math.abs(RH.RHR.POWER_SCALE - pow) < 1e-12,
   'same duty as ECCS one phase later');

/* ---- 3. SEAL INJECTION IS ON NEITHER, BY RULING -------------------------------------- */
log('\nSEAL INJECTION  [on NEITHER basis -- a seal belongs to the PUMP]');
var seal = CV.sealInjectionGpm();
ck('seal injection is the sourced per-pump figure, UNSCALED', Math.abs(seal - 5 * 1) < 1e-12,
   seal.toFixed(1) + ' gpm = WTSM\'s 5 gpm per RCP x 1 pump, with NO scale factor applied');
ck('...and it is neither volume- nor power-scaled', Math.abs(seal - 20 * vol) > 1 &&
   Math.abs(seal - 20 * pow) > 1,
   'volume would give ' + (20 * vol).toFixed(1) + ', power ' + (20 * pow).toFixed(1) +
   ' -- both would shrink a seal because the PLANT is smaller, which a seal does not do');
ck('the declared consequence is REAL and measured',
   seal / (seal + CV.CVCS.charging_normal_gpm()) > 0.3,
   (100 * seal / (seal + CV.CVCS.charging_normal_gpm())).toFixed(0) + ' % of normal makeup on ' +
   'this plant, against ~25 % on the four-loop plant it was sourced from -- DECLARED, not an ' +
   'accident: a one-pump plant keeping a real pump\'s seal');

/* ---- 4. THE BALANCE THE SOURCE STATES ------------------------------------------------ */
log('\nTHE FLOW BALANCE  [WTSM: seal + charging = letdown]');
var toGpm = function (k) { return k / 1000 * 264.172 * 60; };
var sys = RD.sources.createPlant({ h: RD.water.h_l(304.5, 15.41), P: 15.41 });
var r = CV.stepCVCS(CV.createCVCS({}), sys, 0.02);
ck('letdown carries charging AND seal injection, so inventory holds',
   Math.abs(r.net_kgs) < 1e-9,
   toGpm(r.charging_kgs).toFixed(1) + ' charging + ' + toGpm(r.seal_kgs).toFixed(1) +
   ' seal = ' + toGpm(r.letdown_kgs).toFixed(1) + ' gpm letdown; net ' +
   r.net_kgs.toExponential(1) + ' kg/s');
ck('isolating CVCS stops the seal flow too', (function () {
     var i = CV.stepCVCS(CV.createCVCS({ isolated: true }), sys, 0.02);
     return i.seal_kgs === 0 && i.charging_kgs === 0;
   })(), 'seal injection runs with the charging pumps; only isolation stops it');

}

console.log('\nPWR2 -- THE SCALING BASES, PINNED');
var rec = [];
runSuite(RD.cvcs, RD.eccs, RD.rhr, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

/* MUTATIONS. Every one is a SILENT UNIFICATION or a basis swap -- the exact failure this gate was
 * written to catch, and the one no per-layer gate can see, because each file stays individually
 * self-consistent after the change. */
var MUTATIONS = [
  ['pwr2_cvcs', 'CVCS charging silently unified onto the POWER basis',
   'charging_max_gpm:    function () { return 180 * volumeScale(); },',
   'charging_max_gpm:    function () { return 180 * (300 / 1520); },'],
  ['pwr2_cvcs', 'CVCS normal charging unified onto the POWER basis',
   'charging_normal_gpm: function () { return  46 * volumeScale(); },',
   'charging_normal_gpm: function () { return  46 * (300 / 1520); },'],
  ['pwr2_cvcs', 'the volume basis stops deriving from Layer 1 geometry (hardcoded)',
   'function volumeScale() { return rcsVolume() / GINNA_RCS_M3; }',
   'function volumeScale() { return 0.1631; }'],
  ['pwr2_cvcs', 'the volume basis is replaced by the power basis outright',
   'function volumeScale() { return rcsVolume() / GINNA_RCS_M3; }',
   'function volumeScale() { return 300 / 1520; }'],
  ['pwr2_cvcs', 'SEAL INJECTION volume-scaled -- a seal shrinking because the PLANT is smaller',
   'return CVCS.seal_injection_gpm_per_pump * CVCS.rcp_count;',
   'return CVCS.seal_injection_gpm_per_pump * CVCS.rcp_count * volumeScale();'],
  ['pwr2_cvcs', 'SEAL INJECTION power-scaled',
   'return CVCS.seal_injection_gpm_per_pump * CVCS.rcp_count;',
   'return CVCS.seal_injection_gpm_per_pump * CVCS.rcp_count * (300 / 1520);'],
  ['pwr2_cvcs', 'seal injection survives CVCS isolation',
   'var seal = cv.isolated ? 0 : gpmToKgs(sealInjectionGpm(), 1000);',
   'var seal = gpmToKgs(sealInjectionGpm(), 1000);'],
  ['pwr2_cvcs', 'letdown stops carrying seal injection, so inventory drifts',
   'return gpmToKgs(CVCS.charging_normal_gpm() + sealInjectionGpm(), 1000);',
   'return gpmToKgs(CVCS.charging_normal_gpm(), 1000);'],
  ['pwr2_eccs', 'ECCS silently unified onto the VOLUME basis',
   '  var POWER_SCALE = 300 / 1520;',
   '  var POWER_SCALE = 0.1631;'],
  ['pwr2_rhr', 'RHR drifts off the shared power basis',
   'POWER_SCALE: 300 / 1520',
   'POWER_SCALE: 0.1631'],
];

if (fail > 0) {
  console.log('  run_pwr2_bases: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
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
  var which = m[0];
  if (SRC[which].indexOf(m[2]) === -1) { console.log('  ERROR   anchor not found: ' + m[1]); blind++; return; }
  var r2 = [];
  try {
    var mod = loadOne(which, SRC[which].split(m[2]).join(m[3]));
    runSuite(mod.CV, mod.EC, mod.RH, r2, true);
  } catch (e) { r2.push({ name: 'threw', ok: false }); }
  var f2 = r2.filter(function (r) { return !r.ok; }).length;
  if (f2 === 0) { blind++; console.log('  BLIND TO  ' + m[1] + '   <-- THIS GATE CANNOT SEE IT'); }
  else console.log('  caught    ' + m[1].padEnd(72) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_bases: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
