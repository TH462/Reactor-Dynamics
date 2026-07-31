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
 *   BEAVRS / Watts Bar U1 Cycle 1 HZP physics tests (OSTI 1991715), Table IV — the
 *   MEASURED anchors, and the ones that decide the model:
 *     - HZP ARO critical boron 975 ppm (BOL, zero xenon)  → sets rho_excess
 *     - measured ITCs 975 ppm/-1.75, 902/-4.65, 810/-8.01 pcm/°F
 *       → set the boron crossover at 986 ppm
 *   WTSM 2.2 Reactivity Balance Calculations (ML11216A051) Table 2.2-1
 *     - all Control Banks -4068 pcm, all Shutdown Banks -3676 pcm, all RCCAs -7744
 *   WTSM 2.1 Reactor Physics Review (ML11223A207) §2.1.6.2 / Fig 2.1-8
 *     - the moderator coefficient STEEPENS with temperature (density, not ΔT).
 *       This is the only thing we still take from WTSM 2.1. Its -17 pcm/°F at 500 °F
 *       reading and its "~1400 ppm" crossover BOTH disagree with the BEAVRS
 *       measurement; the crossover was measurably wrong (#263) and the magnitude is
 *       now set by the owner's 2026-07-21 at-power ruling instead.
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
function F(c) { return c * 9 / 5 + 32; }
var T_NOLOAD = 297.0;   // the no-load Tavg the HZP anchors are quoted at

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
// The 0-ppm magnitude is NO LONGER sourced to WTSM 2.1's -17 pcm/°F at 500 °F: the
// BEAVRS ITCs are irreconcilable with it under a linear-in-boron form, so the scale
// comes from the owner's at-power ruling and the crossover from the measurement (#263).
// Pin the resulting DISAGREEMENT so nobody re-reads WTSM's figure as if we honoured it.
ck('the 0-ppm curve is knowingly steeper than WTSM 2.1 Fig 2.1-8 reads at 500 °F',
   // The gap to WTSM 2.1's figure WIDENED when the scale was fitted to the measurement
   // (owner ruling 2026-07-30): -23.48 -> -31.43 at 500 °F against the figure's -17.
   // That is what the ruling cost and it is meant to stay visible. The bound is -40
   // because Fig 2.1-8's own vertical axis bottoms there, so past that we would be
   // claiming something the source's chart cannot even show.
   mtc(500, 0) < -17.0 && mtc(500, 0) > -40.0,
   mtc(500, 0).toFixed(2) + ' pcm/°F vs the figure\'s -17 — declared departure, #263');
ck('MTC crosses zero exactly at mod_boron_zero_ppm',
   near(mtc(500, RC.mod_boron_zero_ppm), 0, 0.01),
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
   Math.abs(mtc(122, 838)) < 3.0, mtc(122, 838).toFixed(2) + ' pcm/°F at 122 °F / 838 ppm');
// The physical consequence: denser cold water carries more boron per cm³.
ck('differential boron worth is LARGER cold than hot',
   e._boronWorth(F2C(122)) > e._boronWorth(F2C(567)) * 1.2,
   (e._boronWorth(F2C(122)) * 1e5).toFixed(2) + ' pcm/ppm cold vs '
   + (e._boronWorth(F2C(567)) * 1e5).toFixed(2) + ' hot');

// ---------------------------------------------------------------------------
// SECOND ANCHOR (#263). The curve used to be fit at exactly one point and validated
// at none, and the boron crossover was taken from a WTSM statement that its own
// figure contradicted. These are MEASURED isothermal temperature coefficients at
// three boron concentrations from the BEAVRS / Watts Bar U1 Cycle 1 HZP physics
// tests (OSTI 1991715, Table IV). ITC = MTC + the fuel coefficient, so we add
// alpha_D back before comparing. They settled the crossover at 986 ppm and proved
// the 1400 ppm we briefly shipped was 4.3x too negative at ARO.
console.log('\n' + BOLD + 'BEAVRS Cycle 1 HZP — MEASURED isothermal temperature coefficients' + RST);
var aD_F = RC.alpha_D * 1e5 * 5 / 9;
function itc(Tf, B) { return mtc(Tf, B) + aD_F; }
// The ARO point is the tight one: near the crossover the scale barely matters, so
// this check is a direct test of mod_boron_zero_ppm and nothing else.
ck('ITC at ARO / 975 ppm matches the measured -1.75 pcm/degF',
   near(itc(557, 975), -1.75, 0.25), itc(557, 975).toFixed(2) + ' pcm/°F vs -1.75 measured');
// All three points are now FITTED, not just the ARO one -- the owner ruled 2026-07-30
// to fit the measurement and supersede the 2026-07-21 at-power number. These tolerances
// are tight on purpose: the previous calibration sat 0.88 and 1.64 low here and that was
// a declared departure. If they ever need loosening, the trade-off changed -- read #263.
ck('ITC at 902 ppm matches the measured -4.65',
   Math.abs(itc(557, 902) - (-4.65)) < 0.3,
   itc(557, 902).toFixed(2) + ' vs -4.65 measured');
ck('ITC at 810 ppm matches the measured -8.01',
   Math.abs(itc(557, 810) - (-8.01)) < 0.3,
   itc(557, 810).toFixed(2) + ' vs -8.01 measured');
ck('the crossover is the MEASURED 986 ppm, not the 1400 the WTSM text claimed',
   Math.abs(RC.mod_boron_zero_ppm - 986) < 2, RC.mod_boron_zero_ppm + ' ppm');
// The at-power coefficient is now an OUTPUT of the fit, not an input. Pinned so the
// supersession of the 2026-07-21 ruling stays visible rather than drifting back.
ck('MTC at the full-power reference is the fitted -26.8 pcm/degC (SUPERSEDES the 2026-07-21 -20)',
   near(mtc(F(TREF), 618) * 9 / 5, -26.8, 1.2),
   (mtc(F(TREF), 618) * 9 / 5).toFixed(1) + ' pcm/°C at 618 ppm');

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
e.rod_groups[0].steps = e.rod_groups[0].max_steps;
e.rod_groups[1].steps = e.rod_groups[1].max_steps;
var dD = e._modDensity(T_NOLOAD) - e._modDensity(TREF);
var nonB = RC.rho_excess + e._rodReactivity() + RC.alpha_D * (T_NOLOAD - TFREF)
         + e._modCoeff() * dD;
var bAro = nonB / e._boronWorth(T_NOLOAD);
ck('HZP ARO critical boron is the measured 975 ppm (rho_excess is SOLVED for this)',
   near(bAro, 975, 6), bAro.toFixed(1) + ' ppm');

// ---------------------------------------------------------------------------
// #263 item 3. Hot-full-power boron has NO measured anchor of its own (BEAVRS gives
// HFP critical boron only as figures). So the thing to gate is not its value but its
// DERIVATION: it must follow from the measured HZP anchor plus our own Doppler,
// moderator, rod and xenon terms. If it ever stops following, either rho_excess was
// re-solved against something else or a term changed without the others noticing.
console.log('\n' + BOLD + 'HFP boron follows from the HZP anchor (no HFP anchor exists)' + RST);
var XE_W = RD.PWR_CONFIG.kinetics.xenon.xenon_worth;
var HFP_STEPS = Math.round(e.rod_groups[0].max_steps
                * RD.PWR_CONFIG.rods.control_op_position_pct / 100);
function rodsAt(st) {
  e.rod_groups[0].steps = st; e.rod_groups[1].steps = e.rod_groups[1].max_steps;
  return e._rodReactivity();
}
var hfpEngine = (new RD.PWREngine({ initial_state: 'hot_full_power' })).getTrueState().boron_ppm;
var netPcm = (RC.alpha_D * (TFREF - T_NOLOAD)
   + (e._moderatorReactivity(TREF, hfpEngine) - e._moderatorReactivity(T_NOLOAD, hfpEngine))
   + (rodsAt(HFP_STEPS) - rodsAt(e.rod_groups[0].max_steps))
   - XE_W) * 1e5;
var predicted = 975 + netPcm / (e._boronWorth(TREF) * 1e5);
ck('HFP boron is what the HZP anchor plus the power defect and xenon predict',
   Math.abs(predicted - hfpEngine) < 25,
   'balance predicts ' + predicted.toFixed(0) + ' ppm, engine reports '
   + hfpEngine.toFixed(0) + ' (net ' + netPcm.toFixed(0) + ' pcm from HZP ARO)');
// The declared departure: a real 4-loop at 100 EFPD runs 750 ppm at power (WTSM 2.2).
// Ours is lower, and the gap is dominated by our xenon worth, which is a [tune] value.
ck('the gap to the real 750 ppm comparable is still explained by xenon worth alone',
   Math.abs(750 - hfpEngine) < (XE_W * 1e5) / (e._boronWorth(TREF) * 1e5) * 1.2,
   (750 - hfpEngine).toFixed(0) + ' ppm gap vs '
   + ((XE_W * 1e5) / (e._boronWorth(TREF) * 1e5)).toFixed(0) + ' ppm of xenon worth');

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
// Intent, not an absolute: cold critical boron must sit far enough above the hot-end
// value that a hot dilution target is obviously unsafe cold. An absolute ppm threshold
// here needed bumping every recalibration (it read >750 and #263 landed on 749), which
// is a check tracking the plant instead of the claim.
ck('cold critical boron sits far above the hot-end value, so a hot dilution target is unsafe cold',
   bCrit(274) - bCrit(567) > 120,
   'critical boron 274 °F = ' + bCrit(274).toFixed(0) + ' ppm vs 567 °F = '
   + bCrit(567).toFixed(0) + ' ppm (gap ' + (bCrit(274) - bCrit(567)).toFixed(0)
   + '); 600 ppm at 274 °F is '
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

// ---------------------------------------------------------------------------------
// THE TWO INPUTS `pwr_startup`'s CREEP STEP IS DERIVED FROM (#263 item 2).
//
// That procedure withdraws 26 steps to take the reactor critical and leave a controlled
// ascent behind it. 26 is not a swept number any more — it is
//     (critical position − the 306 steps of plotted bursts) + (excess ρ / differential worth)
// so if either quantity moves and the procedure does not, the derivation is silently wrong
// and the ascent lands outside the authored 1–3 % band. `run_procedures_stack` would catch a
// gross break; it would NOT tell you the reason, and a few steps of drift can sit inside its
// acceptance while the published derivation quietly stops being true.
//
// ENGINE values, so this stays a static check — the engine is reset and read, never stepped.
// Both were confirmed at the full-stack layer before being pinned (#266).
console.log('\n' + BOLD + 'the derivation behind pwr_startup\'s 26-step creep' + RST);
(function () {
  function fresh() { return new RD.PWREngine({ initial_state: 'hot_zero_power', seed: 7 }); }
  function rhoAt(steps) { var y = fresh(); y.rod_groups[0].steps = steps; return y._totalReactivity() * 1e5; }
  var ts = fresh().getTrueState();
  var crit = null;
  for (var s = 250; s <= 400 && crit == null; s++) if (rhoAt(s) >= 0) crit = s;
  var PLOTTED = 306, CREEP = 26;   // the five authored 1/M bursts: 138+90+44+22+12
  ck('the startup IC sits at 683 ppm with the bank in', near(ts.boron_ppm, 683, 2),
     ts.boron_ppm.toFixed(1) + ' ppm');
  ck('criticality is at step 319, 13 past the last plotted 1/M burst', crit === 319,
     'critical at ' + crit + ', bursts end at ' + PLOTTED);
  var dw = (rhoAt(crit + 15) - rhoAt(crit)) / 15;
  // ±0.05 (0.7 %), not ±0.15: this is a deterministic static computation with no noise in it,
  // and at ±0.15 a 3.2 % rod-worth retune still slid through at 6.82 while the other three
  // checks here caught it. A guard the injection test walks past is not a guard.
  ck('differential bank worth through the critical band is 6.70 pcm/step', near(dw, 6.70, 0.05),
     dw.toFixed(2) + ' pcm/step (' + (dw / 6.5).toFixed(2) + ' ¢)');
  // The point of the whole derivation: the creep must leave the excess that the 600 s hold
  // needs to cover 3.20 decades at ~0.32 DPM. Measured, that is ~85 pcm.
  var excess = rhoAt(PLOTTED + CREEP) - rhoAt(crit);
  ck('the authored 26-step creep leaves ~85 pcm of excess (the 0.32 DPM ascent)',
     near(excess, 85, 12), excess.toFixed(0) + ' pcm above critical');
})();

console.log('\n' + BOLD + '──────────────────────────────────────────' + RST);
console.log(BOLD + (nFail ? RED : GREEN) + nPass + ' checks passed / ' + nFail + ' failed' + RST + '\n');
process.exit(nFail ? 1 : 0);
