/*
 * run_reactivity.js — REACTIVITY-MODEL ANCHOR GATE (PWR).
 *
 *   node test/run_reactivity.js
 *
 * Every number in the PWR reactivity block is either SOURCED to a real-plant
 * document or SOLVED from one. This runner pins the sourced anchors so a future
 * retune cannot silently walk away from them — and so that if someone changes
 * alpha_D, the rod worths or boron_worth_per_ppm without re-solving rho_excess,
 * the HZP critical-boron check goes red instead of the plant quietly drifting.
 *
 * Sources (see engines/pwr/pwr_config.js `reactivity` for the verbatim quotes):
 *   WTSM 2.1 Reactor Physics Review (ML11223A207) §2.1.6.2 / Fig 2.1-8
 *     - MTC of unborated water at 500 °F = -17 pcm/°F
 *     - MTC crosses zero at ~1400 ppm
 *     - the moderator coefficient STEEPENS with temperature (density, not ΔT)
 *   WTSM 2.2 Reactivity Balance Calculations (ML11216A051) Table 2.2-1
 *     - all Control Banks -4068 pcm, all Shutdown Banks -3676 pcm,
 *       all RCCAs -7744 pcm
 *   BEAVRS / Watts Bar U1 Cycle 1 HZP physics tests (OSTI 1991715)
 *     - HZP ARO critical boron 975 ppm (BOL, zero xenon)
 *
 * This is a STATIC gate in the sense of CLAUDE.md's layer table — it resets the
 * engine and reads its reactivity model, and never steps the plant.
 */
'use strict';
var path = require('path');
function load(p) { require(path.join(__dirname, '..', p)); }
['engines/load_mode.js', 'engines/pwr/pwr_config.js', 'layers/control/pwr_control.js',
 'engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js',
 'engines/pwr/pwr_steam_generator.js', 'engines/pwr/pwr_instruments.js',
 'engines/pwr/pwr_engine.js'].forEach(load);

var RD = globalThis.RD, RC = RD.PWR_CONFIG.reactivity;
var GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', RST = '\x1b[0m', BOLD = '\x1b[1m';
var nPass = 0, nFail = 0;
function ck(desc, ok, obs) {
  if (ok) { nPass++; console.log(GREEN + '  ✓' + RST + ' ' + desc + DIM + '  (' + obs + ')' + RST); }
  else    { nFail++; console.log(RED   + '  ✗' + RST + ' ' + desc + DIM + '  (' + obs + ')' + RST); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }
function F2C(f) { return (f - 32) * 5 / 9; }

var e = new RD.PWREngine();
e.reset({ initial_state: 'hot_full_power' });
var TREF = e.T_coolant_ref, TFREF = e.T_fuel_ref;

// MTC by finite difference on the engine's own moderator model, pcm/°F
function mtc(Tf, B) {
  var Tc = F2C(Tf), h = 0.05;
  return (e._moderatorReactivity(Tc + h, B) - e._moderatorReactivity(Tc - h, B))
         / (2 * h) * 1e5 * 5 / 9;
}

console.log('\n' + BOLD + '════════ PWR REACTIVITY-MODEL ANCHORS ════════' + RST);

console.log('\n' + BOLD + 'WTSM 2.1 Fig 2.1-8 — moderator coefficient' + RST);
ck('MTC of unborated water at 500 °F is the sourced -17 pcm/°F',
   near(mtc(500, 0), -17.0, 0.15), mtc(500, 0).toFixed(2) + ' pcm/°F');
ck('MTC crosses zero at the sourced ~1400 ppm',
   near(mtc(500, RC.mod_boron_zero_ppm), 0, 0.01) && near(RC.mod_boron_zero_ppm, 1400, 1),
   RC.mod_boron_zero_ppm + ' ppm → ' + mtc(500, RC.mod_boron_zero_ppm).toFixed(3) + ' pcm/°F');
// "at high temperatures an increase in the moderator temperature causes a larger
//  reduction in density than an identical increase at low moderator temperatures"
var steepens = true, prev = 0;
[122, 200, 274, 350, 437, 500, 567].forEach(function (Tf) {
  var m = mtc(Tf, 0); if (prev && m > prev) steepens = false; prev = m;
});
ck('MTC steepens monotonically with temperature (density-shaped, not constant)',
   steepens, mtc(122, 0).toFixed(1) + ' pcm/°F at 122 °F → ' + mtc(567, 0).toFixed(1) + ' at 567 °F');
ck('cold-end MTC is near zero at our operating boron — NOT the old flat -11.1',
   Math.abs(mtc(122, 907)) < 3.0, mtc(122, 907).toFixed(2) + ' pcm/°F at 122 °F / 907 ppm');
// The physical consequence: denser cold water carries more boron per cm³.
ck('differential boron worth is LARGER cold than hot',
   e._boronWorth(F2C(122)) > e._boronWorth(F2C(567)) * 1.2,
   (e._boronWorth(F2C(122)) * 1e5).toFixed(2) + ' pcm/ppm cold vs '
   + (e._boronWorth(F2C(567)) * 1e5).toFixed(2) + ' hot');

console.log('\n' + BOLD + 'WTSM 2.2 Table 2.2-1 — rod worths' + RST);
ck('control-bank worth is the sourced 4068 pcm',
   near(RC.rod_worth_total * 1e5, 4068, 5), (RC.rod_worth_total * 1e5).toFixed(0) + ' pcm');
ck('shutdown-bank worth is the sourced 3676 pcm',
   near(RC.rod_worth_shutdown * 1e5, 3676, 5), (RC.rod_worth_shutdown * 1e5).toFixed(0) + ' pcm');
ck('all RCCAs together are the sourced 7744 pcm',
   near((RC.rod_worth_total + RC.rod_worth_shutdown) * 1e5, 7744, 10),
   ((RC.rod_worth_total + RC.rod_worth_shutdown) * 1e5).toFixed(0) + ' pcm');

console.log('\n' + BOLD + 'BEAVRS / Watts Bar U1 — HZP ARO critical boron' + RST);
// rho = 0 with both banks fully withdrawn, no xenon, zero power at the no-load Tavg.
var T_NOLOAD = 297.0;
e.rod_groups[0].steps = e.rod_groups[0].max_steps;
e.rod_groups[1].steps = e.rod_groups[1].max_steps;
var dD = e._modDensity(T_NOLOAD) - e._modDensity(TREF);
var nonB = RC.rho_excess + e._rodReactivity() + RC.alpha_D * (T_NOLOAD - TFREF)
         + e._modCoeff() * dD;
var bAro = nonB / e._boronWorth(T_NOLOAD);
ck('HZP ARO critical boron is the measured 975 ppm (rho_excess is SOLVED for this)',
   near(bAro, 975, 6), bAro.toFixed(1) + ' ppm');

console.log('\n' + BOLD + 'shape checks — what the recalibration was for' + RST);
function bCrit(Tf) {
  var Tc = F2C(Tf);
  e.rod_groups[0].steps = 0; e.rod_groups[1].steps = e.rod_groups[1].max_steps;
  var d = e._modDensity(Tc) - e._modDensity(TREF);
  return (RC.rho_excess + e._rodReactivity() + RC.alpha_D * (Tc - TFREF) + e._modCoeff() * d)
         / e._boronWorth(Tc);
}
var spread = bCrit(122) - bCrit(567);
// Before #260 this spread was 556 ppm on a flat MTC, which is what made 600 ppm
// critical at 274 °F while the hot end wanted 263 ppm.
ck('cold→hot critical-boron spread is flat enough to hold boron through a heatup',
   spread < 300, spread.toFixed(0) + ' ppm (was 556 before #260)');
// The owner's #260 event, stated correctly. 600 ppm at 274 °F is SUPERCRITICAL and
// should be — cold water is more reactive, so cold critical boron is HIGH. The old
// model's failure was putting critical boron at 629 ppm there, close enough to the
// hot end (263 ppm) that 600 read as a safe waypoint. rho = (Bcrit − B)·worth.
ck('cold critical boron sits far above any hot-end dilution target (600 ppm is supercritical here, correctly)',
   bCrit(274) > 750,
   'critical boron at 274 °F = ' + bCrit(274).toFixed(0) + ' ppm (was 629); 600 ppm there is '
   + ((bCrit(274) - 600) * e._boronWorth(F2C(274)) * 1e5).toFixed(0) + ' pcm SUPERcritical');
// Critical boron must rise monotonically as the plant cools — the sign of the whole model.
var mono = true, last = -1e9;
[567, 500, 437, 350, 274, 200, 122].forEach(function (Tf) {
  var b = bCrit(Tf); if (b < last) mono = false; last = b;
});
ck('critical boron rises monotonically on cooldown (cold is more reactive)',
   mono, bCrit(567).toFixed(0) + ' ppm hot → ' + bCrit(122).toFixed(0) + ' ppm cold');
// And the Mode 5 IC must actually sit above it, or the plant spawns critical.
var m5 = new RD.PWREngine(); m5.reset({ initial_state: 'cold_shutdown' });
var bIC = m5.getTrueState().boron_ppm;
ck('the Mode 5 IC boron is above cold critical boron, so the plant spawns subcritical',
   bIC > bCrit(122) + 40,
   bIC.toFixed(0) + ' ppm vs ' + bCrit(122).toFixed(0) + ' critical, rho = '
   + (m5.s._rho * 1e5).toFixed(0) + ' pcm');

// ---------------------------------------------------------------------------
// The published ECC curve must match the plant.
//
// This is the part that matters most for #260's actual lesson. The reactivity
// numbers were right in the config and WRONG in the prose for weeks, and no gate
// covered prose: run_manual_units checks unit CONVERSIONS, run_campaign checks
// mission BEHAVIOUR, and neither notices a manual table that quotes a critical
// boron the plant does not have. Manuals/09 §7.5 is the operator's ECC reference —
// if it drifts, an operator dilutes to a number the plant does not agree with,
// which is the whole of the #260 event. So parse it and compare every cell.
console.log('\n' + BOLD + 'Manuals/09 §7.5 — the published ECC curve vs the plant' + RST);
var fs = require('fs');
var md = fs.readFileSync(path.join(__dirname, '..', 'Manuals', '09_SETPOINTS_LIMITS.md'), 'utf8');
var COLS = [0, 228, 456, 684, 912];          // the table's bank positions, in steps
var rows = [], bad = [], seenMarker = md.indexOf('ECC-BCRIT-TABLE') >= 0;
md.split(/\r?\n/).forEach(function (line) {
  // | 122 °F (50.0 °C) | 834 | 870 | 982 | 1094 | 1130 |
  var m = line.match(/^\|\s*([\d.]+)\s*°F\s*\([\d.]+\s*°C\)\s*\|([^|]+\|){5}\s*$/);
  if (!m) return;
  var cells = line.split('|').slice(2, 7).map(function (c) { return parseFloat(c.trim()); });
  if (cells.some(isNaN)) return;
  rows.push({ Tf: parseFloat(m[1]), cells: cells });
});
rows.forEach(function (r) {
  COLS.forEach(function (steps, i) {
    var Tc = F2C(r.Tf);
    e.rod_groups[0].steps = steps;
    e.rod_groups[1].steps = e.rod_groups[1].max_steps;
    var dD = e._modDensity(Tc) - e._modDensity(TREF);
    var live = (RC.rho_excess + e._rodReactivity() + RC.alpha_D * (Tc - TFREF)
                + e._modCoeff() * dD) / e._boronWorth(Tc);
    if (Math.abs(live - r.cells[i]) > 1.0) {
      bad.push(r.Tf + ' °F / ' + steps + ' steps: table ' + r.cells[i]
               + ' vs plant ' + live.toFixed(1));
    }
  });
});
ck('the ECC table carries its do-not-hand-edit marker', seenMarker,
   seenMarker ? 'present' : 'MISSING — the table is no longer identifiable');
ck('the ECC table was found and has all ten temperature rows', rows.length === 10,
   rows.length + ' rows parsed');
ck('every published critical-boron cell matches the plant within 1 ppm', bad.length === 0,
   bad.length ? bad.slice(0, 3).join(' · ') : (rows.length * COLS.length) + ' cells verified');

console.log('\n' + BOLD + '──────────────────────────────────────────' + RST);
console.log(BOLD + (nFail ? RED : GREEN) + nPass + ' checks passed / ' + nFail + ' failed' + RST + '\n');
process.exit(nFail ? 1 : 0);
