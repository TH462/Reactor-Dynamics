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
 'engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_pressurizer2.js', 'engines/pwr/pwr_primary.js',
 'engines/pwr/pwr_steam_generator.js', 'engines/pwr/pwr_instruments.js',
 'engines/pwr/pwr_engine.js'].forEach(load);
/* The SHIPPED plant's kinetics, for the Manuals/09 §7.5 block at the bottom only (#618).
 * Measured safe to load alongside: pwr2 attaches under RD.pwr2 and leaves RD.PWREngine
 * intact — asserted below so a future namespace collision reddens here rather than
 * silently handing this runner the wrong plant a second time. */
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_kinetics']
  .forEach(function (f) { load('engines/pwr2/' + f + '.js'); });
/* The LIVE checklists — the creep derivation at the bottom reads its inputs out of the
 * authored procedure rather than keeping a second copy of them (#618). */
load('ui/manual_procedures.js');

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
// DECOUPLED at #419 wave 3: this is the MEASUREMENT'S temperature — the WBN/BEAVRS HZP
// (557 °F = 291.67 °C) the 975-ppm ARO boron and the ITCs were taken at — NOT this
// plant's no-load anchor. The old 297.0 conflated the two; benign while the anchor sat
// 5 °C away, wrong once the Ginna re-anchor moved it to 286. rho_excess is solved
// against THIS temperature; the plant's own ICs trim at their own anchor downstream.
var T_NOLOAD = 291.67;  // the WBN HZP the anchors are quoted at (name kept for diff hygiene)

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
// RE-DERIVED at #419 wave 3, two fixes exposed by the longer (13 °C) anchor-to-HFP walk:
// (1) the 975-ppm base must convert through the ANCHOR temperature's boron worth, not the
// destination's (b = nonB/w — the old `975 + Δpcm/w(TREF)` hid ~30 ppm of linearization);
// (2) the moderator leg must use the SAME boron-independent `_modCoeff()·dD` form the
// rho_excess solve and the bAro check above use — the old form evaluated it at the HFP
// boron, a different point on the crossover, which is a second ~50 ppm of inconsistency.
// At T = TREF the moderator term is zero by construction, so the walk's mod leg is just
// −modCoeff·dD(T_NOLOAD→TREF), and the chain from the anchor is exact.
var dD_walk = e._modDensity(T_NOLOAD) - e._modDensity(TREF);
var netPcm = (RC.alpha_D * (TFREF - T_NOLOAD)
   - e._modCoeff() * dD_walk
   + (rodsAt(HFP_STEPS) - rodsAt(e.rod_groups[0].max_steps))
   - XE_W) * 1e5;
var predicted = (975 * e._boronWorth(T_NOLOAD) + netPcm / 1e5) / e._boronWorth(TREF);
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
/* ⚠ THIS BLOCK CHECKS pwr2, THE SHIPPED PLANT — the rest of this runner pins the RETIRED
 * engine's sourced anchors and is left alone (#618, 2026-09-03).
 *
 * It used to read `COLS = [0, 228, 456, 684, 912]` and compare against `pwr_engine`'s
 * reactivity model. Both halves named the retired plant, which no public build ships
 * (#523) — so `Manuals/09 §7.5` described a 912-step bank, and this gate agreed with it,
 * to 1 ppm, for months. A check can be real, tight AND pointed at the wrong plant; that
 * combination reads exactly like a working gate. The columns are now DERIVED from the
 * shipped bank rather than written down, so the scale cannot drift out from under them
 * again. */
var K2 = globalThis.RD.pwr2.kinetics;
var R2 = K2.RODS, kin2 = K2.createKinetics({ P: 1e-9 });
var ECC_P_MPA = 15.41;                       // NOP — the table declares this; see the marker
var COLS = [0, 0.25, 0.50, 0.75, 1.00].map(function (f) { return Math.round(R2.max_steps * f); });
function eccGroups(steps) {
  return [{ steps: R2.max_steps, max_steps: R2.max_steps, worth: R2.worth_shutdown },
          { steps: steps,        max_steps: R2.max_steps, worth: R2.worth_control }];
}
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
    var live = K2.criticalBoron(kin2, Tc, ECC_P_MPA, eccGroups(steps), 0, Tc);
    if (Math.abs(live - r.cells[i]) > 1.0) {
      bad.push(r.Tf + ' °F / ' + steps + ' steps: table ' + r.cells[i]
               + ' vs plant ' + live.toFixed(1));
    }
  });
});
/* THE TWO PLANTS MUST STILL BE TELLABLE APART IN THIS PROCESS. If a future load-order
 * change let pwr2 clobber RD.PWREngine (or vice versa) both halves of this runner would
 * quietly grade the same plant — the failure that produced #618 in the first place, in a
 * new costume. The retired bank is 912 steps and the shipped one is 627, so the banks
 * differing is a cheap positive proof that each half is reading its own engine. */
ck('the retired and shipped engines are both live and distinct in this process',
   e.rod_groups[0].max_steps === 912 && R2.max_steps === 627,
   'retired ' + e.rod_groups[0].max_steps + ' steps · shipped ' + R2.max_steps + ' steps');
ck('the ECC table carries its do-not-hand-edit marker', seenMarker,
   seenMarker ? 'present' : 'MISSING — the table is no longer identifiable');
ck('the ECC table was found and has all ten temperature rows', rows.length === 10,
   rows.length + ' rows parsed');
ck('every published critical-boron cell matches the plant within 1 ppm', bad.length === 0,
   bad.length ? bad.slice(0, 3).join(' · ') : (rows.length * COLS.length) + ' cells verified');

// ---------------------------------------------------------------------------------
// THE DERIVATION BEHIND `pwr_startup`'s CREEP STEP (#263 item 2; repointed at the shipped
// plant and the LIVE ladder, #618, 2026-09-03).
//
// The approach to criticality plots 1/CR points on a series of decreasing bursts and then
// creeps onto criticality. The creep is not a swept number — it is
//     (critical position − the plotted bursts) + (the excess you want behind it)
// so if the plant moves and the procedure does not, the derivation is silently wrong.
//
// ⚠ IT WAS PINNED TO A PROCEDURE THAT NO LONGER EXISTED, AND STAYED GREEN. This block read
// `PLOTTED = 306, CREEP = 26` — the retired 138/90/44/22/12 ladder — and computed against
// `RD.PWREngine`, the retired 912-step plant. The live checklist has used 94/63/31/14/9 with
// a 15-step creep for a long time. Both halves were consistently retired, so the arithmetic
// closed and the check passed while certifying a derivation for a startup nobody can run.
// A hard-coded copy of authored content is a SECOND COPY, and the gate cannot tell you when
// the first one moved. So every input below is now READ FROM THE LIVE PROCEDURE — the boron
// from its own dilution command, the bursts from the steps that plot a point, the creep from
// the withdrawal after them. Change the checklist and this re-derives; it cannot go stale
// again without also going red.
//
// STATIC: the kinetics model is read, never stepped.
console.log('\n' + BOLD + 'the derivation behind pwr_startup\'s creep onto criticality' + RST);
(function () {
  var POOL = globalThis.RD.MANUAL_PROCEDURES && globalThis.RD.MANUAL_PROCEDURES.pwr2;
  var proc = POOL && POOL.filter(function (p) { return p.id === 'pwr_startup'; })[0];
  if (!proc) { ck('the live pwr_startup procedure was found', false, 'missing from RD.MANUAL_PROCEDURES.pwr2'); return; }

  var B = null, PLOTTED = 0, CREEP = null, nBursts = 0;
  proc.steps.forEach(function (s) {
    if (s.cmd && s.cmd.action === 'set_auto_setpoint' && s.cmd.channel_id === 'boron_conc') B = s.cmd.value;
    if (!s.cmd || s.cmd.action !== 'rod_nudge' || s.cmd.steps <= 0) return;
    if ((s.accs || []).some(function (a) { return a.cmd === 'plot_1m_point'; })) { PLOTTED += s.cmd.steps; nBursts++; }
    else if (CREEP === null && PLOTTED > 0) CREEP = s.cmd.steps;      // the first pull after the last plot
  });

  var HZP2 = K2.HZP;
  function groups(st) {
    return [{ steps: R2.max_steps, max_steps: R2.max_steps, worth: R2.worth_shutdown },
            { steps: st,           max_steps: R2.max_steps, worth: R2.worth_control }];
  }
  function rhoAt(st) { return K2.reactivity(kin2, HZP2.temp_c, HZP2.temp_c, B, groups(st), HZP2.P_mpa) * 1e5; }
  var crit = null;
  for (var s = 0; s <= R2.max_steps && crit == null; s++) if (rhoAt(s) >= 0) crit = s;

  ck('the live procedure still dilutes to the 719 ppm estimated critical concentration',
     B === 719, B + ' ppm, read from the checklist\'s own boron command');
  ck('the plotted 1/CR bursts are five and decreasing, ending SUBCRITICAL',
     nBursts === 5 && rhoAt(PLOTTED) < 0,
     nBursts + ' bursts summing ' + PLOTTED + ' steps, leaving ' + rhoAt(PLOTTED).toFixed(0) + ' pcm');
  // THE SAFETY HALF: going critical on a plotted burst would mean the player takes a 1/CR
  // point on a supercritical core, which is the one thing the whole ladder exists to avoid.
  ck('criticality lies past the last plotted burst, inside the creep',
     crit > PLOTTED && crit <= PLOTTED + CREEP,
     'critical at ' + crit + '; bursts end at ' + PLOTTED + ', creep of ' + CREEP + ' reaches ' + (PLOTTED + CREEP));
  var dw = (rhoAt(crit + 15) - rhoAt(crit)) / 15;
  // ±0.05 (0.6 %) — a deterministic static computation with no noise in it. Kept tight for the
  // reason the retired version recorded: at ±0.15 a 3.2 % rod-worth retune slid straight through.
  ck('differential bank worth through the critical band is 8.06 pcm/step', near(dw, 8.06, 0.05),
     dw.toFixed(2) + ' pcm/step (' + (dw / (K2.DELAYED.beta * 1e5 / 100)).toFixed(2) + ' ¢)');
  // AND THE CHECKLIST MUST SAY THE SAME NUMBER. This is the check that would have caught #618's
  // headline defect: four documents quoted this worth at three different values (6.5 / 8 / 9
  // pcm) and nothing compared any of them to the plant.
  var quoted = null;
  (proc.cautions || []).forEach(function (c) {
    var m = /([\d.]+)\s*pcm/.exec(c);
    if (m && quoted === null) quoted = parseFloat(m[1]);
  });
  ck('the checklist caution quotes the worth the plant actually has',
     quoted !== null && Math.abs(quoted - dw) <= 0.1,
     'caution says ' + quoted + ' pcm/step, plant is ' + dw.toFixed(2));
  // The creep must land PAST critical but not far past: all the excess it leaves has to come
  // back out by hand, because below the point of adding heat there is no temperature feedback.
  var excess = rhoAt(PLOTTED + CREEP) - rhoAt(crit);
  ck('the authored creep leaves a small positive excess for a controlled rise',
     excess > 0 && excess < 60, excess.toFixed(0) + ' pcm above critical');
})();

console.log('\n' + BOLD + '──────────────────────────────────────────' + RST);
console.log(BOLD + (nFail ? RED : GREEN) + nPass + ' checks passed / ' + nFail + ' failed' + RST + '\n');
process.exit(nFail ? 1 : 0);
