/*
 * test/run_pzr2.js — the pressurizer v2 two-region model, asserted at the REGION level (#472).
 *
 * WHY THIS RUNNER EXISTS
 * ----------------------
 * Phase 3b built two-region thermodynamics — `rho_g_sat`, `T_sat_from_P`, `h_fg`,
 * `ensureRegions`, `stepRegions`, `solveFlash` — over four commits, and NOTHING CONSUMED
 * ANY OF IT. The only caller of `stepRegions` was its own file; `verify_pzr2_loadlists.js`
 * checks load order and nothing else. Every number in those commit messages (2.61 psi/s of
 * heater authority, the 4x implicit-vs-explicit flash error, +105 psi on an insurge) was
 * measured with a throwaway script and then had no home. This runner is the home.
 *
 * It found its first defect before it was finished: `stepRegions` read
 * `heater_elev_top_pct`/`heater_elev_bot_pct`, and NEITHER KEY EXISTED IN THE CONFIG.
 * Both undefined makes `top > bot` false, so the fallback arm ran `lvl > undefined` — false
 * at every level — and the wetted fraction was 0 for ever. Full heater demand, zero watts
 * delivered, no error, no red anywhere, because nothing was watching. See D3.
 *
 * IT RUNS MOSTLY AT THE REGION LEVEL, DELIBERATELY. Most checks drive the exported
 * internals directly rather than stepping a plant, because a model's conservation
 * properties are statements about a state and a step, not about a scenario — and a probe
 * that has to run a scenario to see a mass-closure violation will miss most of them.
 * Section H is the exception and it exists because one defect was invisible from here: the
 * regions cannot see that steam has no way OUT of the vessel, since that is a statement
 * about what the loop does with it. The plant-level acceptance rows (MO-*, TD-*, HE-*,
 * SB-*, SA-*, BD-*) are `PWR_BEHAVIOR_CATALOG.md` §13.2, measured by hand with
 * `measure_stack --pzr2`; they have no probe yet and the catalog says so.
 *
 * WHAT IS PINNED vs WHAT IS DERIVED — the HR10 split, stated per check below.
 *   DERIVED  : the check computes both sides and asserts they agree (round trips, the
 *              energy books, mass closure, the level-geometry identity). These cannot be
 *              satisfied by a wrong model that happens to be self-consistent with itself,
 *              because the two sides come from different places.
 *   PINNED   : a measured characterisation with a band (heater authority in psi/s, the
 *              insurge peak). It says "this number moved" and nothing more. Every pin says
 *              so in its comment, and none of them is the sole assertion about its subject.
 *
 * CV-4 (void-ledger bounds and no-ratchet) is NOT here yet — its subject is `surgeDemand`,
 * which does not exist until the node boundary lands. It belongs in this file when it does.
 *
 *   node test/run_pzr2.js
 */
'use strict';
var path = require('path');
function L(p) { require(path.join(__dirname, '..', p)); }

L('engines/load_mode.js');
L('engines/pwr/pwr_config.js');
L('engines/pwr/pwr_pressurizer.js');
L('engines/pwr/pwr_pressurizer2.js');
var RD = globalThis.RD;

var G = '\x1b[32m', R = '\x1b[31m', D = '\x1b[2m', B = '\x1b[1m', Y = '\x1b[33m', X = '\x1b[0m';
var checks = 0, failed = 0;
function ck(name, observed, ok, expected) {
  checks++;
  if (ok) console.log('  ' + G + 'PASS' + X + '  ' + name + D + '  [' + observed + ']' + X);
  else { failed++; console.log('  ' + R + 'FAIL' + X + '  ' + name + D + '  [expected ' + expected + ', observed ' + observed + ']' + X); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }
function psi(mpa) { return mpa * 145.038; }
function F(c) { return c * 9 / 5 + 32; }
function r3(x) { return Math.round(x * 1000) / 1000; }

var PZ2 = RD.pwrPressurizer2, PZ1 = RD.pwrPressurizer, CFG = RD.PWR_CONFIG;
var P2 = CFG.pressurizer2, P1 = CFG.pressurizer;
var P_OP = 15.41;                      // MPa — this plant's operating pressure

// A fresh region state at a given level and pressure, seeded exactly the way the A/B
// switch seeds it mid-run (from the two published quantities that always exist).
function stateAt(level_pct, P) {
  var s = { pressure_mpa: P == null ? P_OP : P, pzr_level_pct: level_pct };
  PZ2.ensureRegions(s, CFG);
  return s;
}
function level(s) { return PZ2.levelFromRegions(s, CFG); }
function press(s) { return PZ2.pressureFromRegions(s, CFG); }

console.log('\n' + B + 'PRESSURIZER v2 — REGION MODEL' + X + D + '  (#472 phase 3b; region level, not a plant)' + X);

// ============================================================ A. the saturation line
console.log('\n' + B + 'A. Correlations — one saturation line, and the steam side v1 never had' + X);

// A1 DERIVED — monotone, and exact at its own table nodes. A non-monotone rho_g_sat would
// make `P_from_steam_density`'s bisection return a wrong branch silently.
var mono = true, prev = -1;
for (var Pm = 0.1; Pm <= 20.0; Pm += 0.1) { var rg = PZ2.rho_g_sat(Pm); if (rg <= prev) mono = false; prev = rg; }
ck('A1 rho_g_sat is monotone in P across 0.1-20 MPa', mono ? 'monotone' : 'NOT monotone', mono, 'monotone');
ck('A1b rho_g_sat is exact at its table nodes (15 MPa)', r3(PZ2.rho_g_sat(15.0)) + ' kg/m3',
   near(PZ2.rho_g_sat(15.0), 96.71, 0.01), '96.71 kg/m3');

// A6 DERIVED — the table is SMOOTH, which is the only independent thing that can be said
// about 23 recalled numbers without a steam-table reference in the corpus. Saturated-vapour
// density steepens gradually toward the critical point: the log-log slope of each segment
// rises 0.936 -> 2.182 and never jumps, worst adjacent change 8.7 %. A mistyped digit
// breaks that and nothing else does — ADDED because the injection pass corrupted the last
// node (165.3 -> 175.3, a 66 % slope jump) and every other check in this file stayed green.
// Monotonicity, the node-exactness spot check and the round trip all survive a corrupted
// entry, because they are satisfied by any table, including a wrong one.
var slopes = [], worstJump = 0, jumpAt = 0;
for (var si = 0; si < 22; si++) {
  var Pa = [0.1, 0.2, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20][si];
  var Pb = [0.1, 0.2, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20][si + 1];
  slopes.push(Math.log(PZ2.rho_g_sat(Pb) / PZ2.rho_g_sat(Pa)) / Math.log(Pb / Pa));
}
for (var sj = 1; sj < slopes.length; sj++) {
  var rel = Math.abs(slopes[sj] - slopes[sj - 1]) / slopes[sj - 1];
  if (rel > worstJump) { worstJump = rel; jumpAt = sj; }
}
ck('A6 the vapour table is smooth (no mistyped node)', 'worst adjacent slope change ' + r3(worstJump * 100) + ' % at segment ' + jumpAt,
   worstJump < 0.20, '< 20 %');

// A2 DERIVED — the round trip the pressure solve depends on. `stepRegions` reads pressure
// off the steam region through P_from_steam_density(rho); if that is not the inverse of
// rho_g_sat, every pressure in the model is wrong by the residual and nothing says so.
var worstRT = 0, worstAt = 0;
for (var Pr = 0.5; Pr <= 19.0; Pr += 0.25) {
  var back = PZ2.P_from_steam_density(PZ2.rho_g_sat(Pr));
  if (Math.abs(back - Pr) > worstRT) { worstRT = Math.abs(back - Pr); worstAt = Pr; }
}
ck('A2 P_from_steam_density inverts rho_g_sat', 'worst ' + worstRT.toExponential(2) + ' MPa at ' + worstAt + ' MPa',
   worstRT < 1e-3, '< 1e-3 MPa');

// A3 DERIVED — ONE saturation line. T_sat_from_P bisects v1's own P_sat_from_T rather than
// carrying a second table, so the flash predicate, the condense predicate, the solid entry
// and the sat-branch entry all test the same curve. A second table would let the model
// disagree with itself about where saturation is.
var worstSat = 0;
for (var Ts = 150; Ts <= 360; Ts += 5) {
  var d = Math.abs(PZ2.T_sat_from_P(PZ1.P_sat_from_T(Ts)) - Ts);
  if (d > worstSat) worstSat = d;
}
ck('A3 T_sat_from_P is the exact inverse of v1 P_sat_from_T', 'worst ' + worstSat.toExponential(2) + ' C',
   worstSat < 1e-3, '< 1e-3 C');

// A4 DERIVED-ish — the slope that turns heat into pressure. The withdrawn §7 arithmetic and
// the config's recorded 3.44 psi/s both rest on this number; it is asserted here so a
// change to the saturation correlation cannot move heater authority unnoticed.
var dtdp = PZ2.dTsat_dP(P_OP);
ck('A4 dTsat/dP at 15.41 MPa', r3(dtdp) + ' C/MPa', near(dtdp, 5.35, 0.15), '5.35 +/- 0.15 C/MPa');

// A5 DERIVED — h_fg is not a constant over this plant's range, and a model that flashes
// with a fixed value gets the cold end of a cooldown wrong by about 2x. That factor is the
// claim, so assert the factor.
var ratio = PZ2.h_fg(0.1) / PZ2.h_fg(15.0);
ck('A5 h_fg(0.1 MPa) / h_fg(15 MPa)', r3(ratio) + 'x  (' + r3(PZ2.h_fg(0.1)) + ' / ' + r3(PZ2.h_fg(15.0)) + ' kJ/kg)',
   ratio > 2.0 && ratio < 2.5, '2.0-2.5x');

// ============================================================ B. geometry (CV-3)
console.log('\n' + B + 'B. Geometry — level is volume, and the 776 slope is an identity now' + X);

// B1 = CV-3. DERIVED, both sides from config, nothing transcribed. v1's `level_per_mass`
// was a [tune]; v2 makes it an output of V_pzr_m3, M_rcs_kg and the liquid density. If a
// later change moves the geometry without re-solving, this is what says so.
var rho_l = PZ2.rho_l_sat(PZ2.T_sat_from_P(P_OP));
var slope = 100 * P2.M_rcs_kg / (rho_l * P2.V_pzr_m3);
ck('B1 CV-3 level-geometry identity vs level_per_mass', r3(slope) + ' vs ' + P1.level_per_mass + ' %/frac',
   Math.abs(slope - P1.level_per_mass) / P1.level_per_mass < 0.01, 'within 1 %');

// B2/B3 DERIVED — the regions must be reconstructable from the two published quantities,
// because that is how the A/B switch takes over a plant mid-run, how a loaded save comes
// back and how a scenario IC starts. A seed that does not round-trip would make every
// measurement start from a plant slightly different from the one requested.
var s55 = stateAt(55.0);
ck('B2 ensureRegions round-trips level', r3(level(s55)) + ' %', near(level(s55), 55.0, 0.01), '55.00 %');
ck('B3 ensureRegions round-trips pressure', r3(press(s55)) + ' MPa (' + Math.round(psi(press(s55))) + ' psia)',
   near(press(s55), P_OP, 0.01), '15.41 MPa');

// B4 DERIVED — THE STEP MUST RETURN THE PRESSURE THE STATE HOLDS. Liquid temperature is an
// INPUT to pressure (it sets rho_l, hence the liquid volume, hence the steam volume), so
// assigning `T_liq = Tsat(P)` after reading P leaves the two disagreeing. That was the
// shipped behaviour until 2026-08-14 and its signature was a two-step zigzag with pressure
// RISING on alternate steps while steam was being drawn out — 2216.06, 2216.44, 2204.33
// psia. `settle` iterates to the fixed point instead. This check is the one that catches
// it: a numerical inconsistency of 0.18 °C is invisible to every assertion about the
// physics being modelled, because the physics is not what is wrong.
var sFP = stateAt(55.0);
var pRet = PZ2.stepRegions(sFP, CFG, 1.0, { heater_frac: 0.7, surge_kgps: 1.5, surge_t_c: 311.7 });
ck('B4 the returned pressure is the state\'s own pressure', 'gap ' + Math.abs(pRet - press(sFP)).toExponential(2) + ' MPa, T_liq off sat by ' + Math.abs(sFP.pzr_t_liq_c - PZ2.T_sat_from_P(pRet)).toExponential(2) + ' C',
   Math.abs(pRet - press(sFP)) < 1e-9 && Math.abs(sFP.pzr_t_liq_c - PZ2.T_sat_from_P(pRet)) < 1e-6, 'both < 1e-9 / 1e-6');

// ============================================================ C. the flash solve
console.log('\n' + B + 'C. Flash and condense — the implicit solve, and the 4x error it avoids' + X);

// Step a state with only heaters on, and report the pressure rate.
function heaterRate(level_pct, frac, dt) {
  var s = stateAt(level_pct), P0 = press(s);
  var P1v = PZ2.stepRegions(s, CFG, dt || 1.0, { heater_frac: frac == null ? 1 : frac });
  return { s: s, dP: (P1v - P0) / (dt || 1.0), P0: P0, P1: P1v };
}

// C1 = CV-2. DERIVED, and it reads the BOOKS OFF THE STATE rather than re-running the
// solve. The invariant the implicit flash exists to satisfy is
//
//     energy delivered  =  m_flash * h_fg(P_new)  +  C * (Tsat(P_new) - Tsat(P_old))
//
// and every term on the right is measurable from the state before and after a step:
// m_flash is the liquid mass that vanished, the saturation temperatures come from the two
// pressures. A check that recomputed the solve would only be testing that the solve equals
// itself — that was this check's FIRST form, and it went red the moment `solveFlash` was
// fixed while the model was more correct than before, which is the tell.
function bookResidual(s0, sN, delivered, extraMass) {
  var mf = s0.pzr_m_liq_kg + (extraMass || 0) - sN.pzr_m_liq_kg;   // liquid that crossed
  var C = (s0.pzr_m_liq_kg + (extraMass || 0)) * 6.0 + P2.pzr_vessel_mass_kg * P2.pzr_vessel_cp_kj_kgk;
  var dTsat = PZ2.T_sat_from_P(press(sN)) - PZ2.T_sat_from_P(press(s0));
  var resid = delivered - mf * PZ2.h_fg(press(sN)) - C * dTsat;
  return { resid: resid, rel: Math.abs(resid) / Math.max(1, Math.abs(delivered)), mf: mf };
}
// (a) FLASH — heaters deliver 1794 kJ in one second and nothing else happens.
var sF0 = stateAt(55.0), sF1 = stateAt(55.0);
PZ2.stepRegions(sF1, CFG, 1.0, { heater_frac: 1 });
var eUp = bookResidual(sF0, sF1, P2.heater_power_mw * 1000);
ck('C1a CV-2 energy books close on a heater step', 'residual ' + eUp.resid.toExponential(2) + ' kJ of 1794 (' + (eUp.rel * 100).toExponential(1) + ' %), flashed ' + r3(eUp.mf) + ' kg',
   eUp.rel < 0.02 && eUp.mf > 0, '< 2 % and mass flashed');
// (b) CONDENSE — spray puts 2 kg/s of 290 C water into the steam space. Delivered energy is
// negative relative to the old saturation line, mass crosses the other way.
var sC0 = stateAt(55.0), sC1 = stateAt(55.0);
var T_SPRAY = 290, m_spray = 2.0;
var deliveredSpray = m_spray * 6.0 * (T_SPRAY - PZ2.T_sat_from_P(press(sC0)));
PZ2.stepRegions(sC1, CFG, 1.0, { spray_kgps: m_spray, spray_t_c: T_SPRAY });
var eDn = bookResidual(sC0, sC1, deliveredSpray, m_spray);
ck('C1b CV-2 energy books close on a spray step', 'residual ' + eDn.resid.toExponential(2) + ' kJ of ' + r3(deliveredSpray) + ' (' + (eDn.rel * 100).toExponential(1) + ' %), condensed ' + r3(-eDn.mf) + ' kg',
   eDn.rel < 0.02 && eDn.mf < 0, '< 2 % and mass condensed');

// C2 DERIVED — the implicit rate sits between the two wrong answers. Below the explicit
// form (C3), and within a factor of the no-latent-heat estimate the config records
// (Q / (C * dTsat/dP) = 3.44 psi/s). NOT asserted as "under it": the flash also grows the
// steam space as liquid leaves it, and that geometric term can push the true rate either
// side of the pure-capacity estimate depending on level. Asserting "under" was this
// check's first form and it was a guess wearing a bound.
var full = heaterRate(55.0, 1, 1.0);
var C55 = PZ2.capacity_mj_per_c(stateAt(55.0), CFG);
var naive = psi(P2.heater_power_mw / (C55 * dtdp));
ck('C2 implicit rate is the same order as the capacity estimate', r3(psi(full.dP)) + ' vs ' + r3(naive) + ' psi/s',
   psi(full.dP) > 0.5 * naive && psi(full.dP) < 1.5 * naive, '0.5x-1.5x of ' + r3(naive));

// C3 DERIVED, and it is the trap. Flashing against the OLD Tsat — the obvious explicit
// form — puts ALL the delivered energy into latent heat. Computed here rather than
// asserted from memory: if solveFlash is ever reverted to the explicit form, C2 goes red
// and this check says by how much. THE POINT: a fitted gain would have absorbed this
// silently, because v1 would simply have been re-tuned to whatever the explicit form gave.
var sX = stateAt(55.0);
var Cx = sX.pzr_m_liq_kg * 6.0 + P2.pzr_vessel_mass_kg * P2.pzr_vessel_cp_kj_kgk;
var Ex = P2.heater_power_mw * 1000 * 1.0;                       // kJ delivered in 1 s
var mfX = Ex / PZ2.h_fg(press(sX));                             // explicit: all of it flashes
var mLx = sX.pzr_m_liq_kg - mfX, mSx = sX.pzr_m_stm_kg + mfX;
var Px = PZ2.P_from_steam_density(mSx / Math.max(1e-6, P2.V_pzr_m3 - mLx / PZ2.rho_l_sat(PZ2.T_sat_from_P(press(sX)))));
var explicitRate = psi(Px - press(sX));
ck('C3 the explicit flash over-reads by 3x or more', r3(explicitRate) + ' vs implicit ' + r3(psi(full.dP)) + ' psi/s',
   explicitRate / psi(full.dP) >= 3.0, '>= 3x');

// C4 DERIVED — and it is the most interesting number in this file. Across the whole normal
// band the heated capacity NEARLY DOUBLES (8.78 -> 16.43 MJ/°C from 20 % to 70 %) and the
// delivered pressure rate barely moves: 3.02 -> 2.86 psi/s, under 6 %. Two effects cancel.
// More liquid is more to heat, which slows Tsat; a smaller bubble makes each kilogram of
// flashed steam worth more pressure, which speeds it. v1 carried ONE constant for every
// level and was, in the normal band, accidentally close — for a reason it did not model.
//
// The spec predicted 2.85 / 2.61 / 2.37 at 25 / 55 / 90 % from the capacity term alone. The
// direction is right and the magnitude is not: capacity alone would have the rate fall by
// nearly half across that band.
var r20 = psi(heaterRate(20.0, 1, 1.0).dP), r55 = psi(full.dP), r70 = psi(heaterRate(70.0, 1, 1.0).dP);
var C20 = PZ2.capacity_mj_per_c(stateAt(20.0), CFG), C70 = PZ2.capacity_mj_per_c(stateAt(70.0), CFG);
ck('C4a capacity nearly doubles across the normal band', r3(C20) + ' -> ' + r3(C70) + ' MJ/C (20 -> 70 %)',
   C70 / C20 > 1.8, '> 1.8x');
ck('C4b but authority stays within 10 % — capacity and geometry cancel',
   r3(r20) + ' / ' + r3(r55) + ' / ' + r3(r70) + ' psi/s at 20 / 55 / 70 %',
   Math.abs(r20 - r70) / r55 < 0.10 && r20 > r55 && r55 > r70, 'spread < 10 %, gently decreasing');

// C4c THE KNOWN GAP, asserted so it cannot be forgotten. Above about 75 % level the
// two-region path runs away — 5.4 psi/s at 75 %, then six-figure nonsense that is
// dt-DEPENDENT (at 85 %: 1.06e6 psi/s at dt 1.0 s, 1.06e7 at 0.1 s, 1.06e8 at 0.01 s — the
// same jump divided by a smaller dt, i.e. the solve railing at the top of the rho_g_sat
// table, 20 MPa). That regime belongs to the SOLID branch — bulk modulus, sub-stepped,
// spec §2.7 — which is not built yet. The check pins the rail so that (a) nobody measures
// an acceptance row up there by accident, and (b) it goes red the day the solid branch
// lands, which is when this check should be rewritten to assert the handover instead.
var r85 = psi(heaterRate(85.0, 1, 1.0).dP);
ck('C4c [known gap] the near-solid regime runs away until the solid branch lands',
   r3(psi(heaterRate(75.0, 1, 1.0).dP)) + ' psi/s at 75 %, ' + r85.toExponential(2) + ' at 85 %',
   r85 > 1e3, '> 1e3 psi/s — the gap, not the plant');

// C5 PINNED — the characterisation. Says "the number moved", nothing more; C1-C4 are what
// say the mechanism is right. Measured 2026-08-14 at 55 % level, after the `settle` fixed
// point and the flash-bracket repair. The commit that built stepRegions recorded 2.61
// psi/s; that number is NOT reproducible on this tree and was measured before both fixes.
ck('C5 [pin] full-heater authority at 55 % level', r3(r55) + ' psi/s', r55 > 2.6 && r55 < 3.5, '2.6-3.5 psi/s');

// ============================================================ D. heaters and elevation
console.log('\n' + B + 'D. Heater elevation — progressive authority, and the cliff that is gone' + X);

// D1 DERIVED — the wetted fraction is a ramp across the band, not a step at its top.
var wTop = heaterRate(P2.heater_elev_top_pct + 5, 1, 1.0).s.pzr_heater_wetted_frac;
var wMid = heaterRate((P2.heater_elev_top_pct + P2.heater_elev_bot_pct) / 2, 1, 1.0).s.pzr_heater_wetted_frac;
var wBot = heaterRate(P2.heater_elev_bot_pct - 2, 1, 1.0).s.pzr_heater_wetted_frac;
ck('D1 wetted fraction ramps across the bank', r3(wBot) + ' / ' + r3(wMid) + ' / ' + r3(wTop) + ' below / mid / above',
   near(wBot, 0, 1e-9) && near(wMid, 0.5, 0.05) && near(wTop, 1, 1e-9), '0 / ~0.5 / 1');

// D2 DERIVED — and the consequence is delivered POWER, not just a published fraction. Half
// the bank wet must move pressure at about half the rate, all else equal. This is HE-1 in
// region form: #348 and #447 are the record of what a 0-or-full cliff does.
var midLvl = (P2.heater_elev_top_pct + P2.heater_elev_bot_pct) / 2;
var rMid = psi(heaterRate(midLvl, 1, 1.0).dP), rJustAbove = psi(heaterRate(P2.heater_elev_top_pct + 1, 1, 1.0).dP);
ck('D2 half-wet bank delivers about half the pressure rate', r3(rMid) + ' vs ' + r3(rJustAbove) + ' psi/s',
   rMid > 0.35 * rJustAbove && rMid < 0.65 * rJustAbove, '0.35-0.65x of the fully wet rate');

// D3 THE REGRESSION GUARD, and the reason this file exists. With the elevation keys absent
// or mis-typed, `wetted_frac` is 0 at EVERY level and full heater demand delivers zero
// watts — no error, no NaN, nothing to see. That was the shipped state of the phase-3b
// tree until 2026-08-14. Asserting "pressure rises when the heaters are on at a normal
// level" is the cheapest possible check and it would have caught it on day one.
ck('D3 heaters on at 55 % actually deliver power', r3(r55) + ' psi/s with wetted ' + r3(heaterRate(55, 1, 1).s.pzr_heater_wetted_frac),
   r55 > 1.0, '> 1.0 psi/s');

// ============================================================ E. stratification
console.log('\n' + B + 'E. Stratification — an insurge RAISES pressure, and that is not free' + X);

// A surge of hot-leg water into a 55 % pressurizer, then a quiet period.
function surgeRun(kgps, T_in, steps, dt) {
  var s = stateAt(55.0), P0 = press(s), peak = -1e9, trace = [];
  for (var i = 0; i < steps; i++) {
    var io = (i < 60 / (dt || 1)) ? { surge_kgps: kgps, surge_t_c: T_in } : {};
    var P = PZ2.stepRegions(s, CFG, dt || 1.0, io);
    if (P - P0 > peak) peak = P - P0;
    trace.push(P - P0);
  }
  return { s: s, P0: P0, peak: peak, end: trace[trace.length - 1], trace: trace };
}
var THOT = 311.7;                                   // C — hot-leg temperature at power
var ins = surgeRun(4.4, THOT, 900, 1.0);            // ~265 kg over 60 s, the Phase-1 insurge

// E1 DERIVED — the SIGN, and the alternative is run through THE MODEL'S OWN CODE rather
// than hand-rolled beside it. Setting surge_mix_tau_s to zero IS the instant-mixing model:
// the enthalpy deficit is released in the step it arrives. Every PWR text has an insurge
// raising pressure — which is why spray exists as the countermeasure — and instant mixing
// inverts it, because 265 kg of 311.7 C water cools a 14 MJ/C node and condenses more
// bubble than its volume displaces. (An earlier form of this check mixed the water by hand
// and skipped the interface solve, so its "alternative" rose too. A comparison model that
// is not the model is not a comparison.)
var CFG_MIX = Object.assign({}, CFG, { pressurizer2: Object.assign({}, P2, { surge_mix_tau_s: 1e-9 }) });
var sMix = stateAt(55.0), Pmix0 = press(sMix), mixPeak = -1e9;
for (var im = 0; im < 120; im++) {
  var Pm = PZ2.stepRegions(sMix, CFG_MIX, 1.0, im < 60 ? { surge_kgps: 4.4, surge_t_c: THOT } : {});
  if (Pm - Pmix0 > mixPeak) mixPeak = Pm - Pmix0;
}
ck('E1 stratified insurge raises pressure; instant mixing drops it',
   'peak ' + r3(psi(ins.peak)) + ' psi vs instant-mix peak ' + r3(psi(mixPeak)) + ' psi',
   ins.peak > 0 && mixPeak < 0, 'stratified > 0, instant-mix < 0');

// E2 DERIVED — peak THEN decay. The banked enthalpy deficit is released on
// surge_mix_tau_s, which is the shape an operator watches: a spike as the volume displaces,
// then a sag as the cold water works in. A model with no deficit would hold the peak.
ck('E2 the peak decays as the insurge mixes in', 'peak ' + r3(psi(ins.peak)) + ' -> ' + r3(psi(ins.end)) + ' psi at 900 s',
   ins.end < ins.peak * 0.5, 'end < half the peak');

// E3 DERIVED — the deficit BANK is bounded and empties. Ten in/out cycles that net to zero
// mass, then a quiet half hour: the banked enthalpy must be gone, not parked. This is the
// no-ratchet property of the mechanism, and it is all that is being claimed.
//
// WHAT IS NOT CLAIMED, because it is false: that pressure comes back. Net-zero MASS is not
// net-zero ENERGY — the water going in is hot-leg temperature and the water coming out is
// pressurizer temperature, so each cycle removes about 24 MJ and the plant cools. Measured,
// pressure ends ~286 psi down. A check asserting "no net change" would have been asserting
// that a pressurizer cannot be cooled by cycling cold water through it, which is the
// opposite of why its heaters exist. The FIRST form of this check did exactly that.
var sCyc = stateAt(55.0), Pc0 = press(sCyc), m0cyc = sCyc.pzr_m_liq_kg + sCyc.pzr_m_stm_kg, peakBank = 0;
for (var c = 0; c < 10; c++) {
  for (var i2 = 0; i2 < 30; i2++) {
    PZ2.stepRegions(sCyc, CFG, 1.0, { surge_kgps: 4.0, surge_t_c: THOT });
    peakBank = Math.max(peakBank, Math.abs(sCyc.pzr_mix_deficit_kj || 0));
  }
  for (var i3 = 0; i3 < 30; i3++) PZ2.stepRegions(sCyc, CFG, 1.0, { surge_kgps: -4.0 });
}
for (var q = 0; q < 1800; q++) PZ2.stepRegions(sCyc, CFG, 1.0, {});
var bank = Math.abs(sCyc.pzr_mix_deficit_kj || 0);
var mCyc = sCyc.pzr_m_liq_kg + sCyc.pzr_m_stm_kg;
ck('E3 the deficit bank drains and mass nets to zero',
   'bank ' + r3(peakBank) + ' -> ' + bank.toExponential(2) + ' kJ, mass ' + r3(mCyc - m0cyc) + ' kg, dP ' + r3(psi(press(sCyc) - Pc0)) + ' psi (cooled, expected)',
   bank / Math.max(1, peakBank) < 1e-4 && Math.abs(mCyc - m0cyc) < 1e-6, '> 99.99 % drained, mass unchanged');

// ============================================================ F. mass closure
console.log('\n' + B + 'F. Mass — closure across the step, and relief that draws steam' + X);

// F1 = CV-1, in the form available today. The full boundary form (pzr + loop == _mass *
// M_rcs) needs `surgeDemand`, which does not exist yet; this is the step-level half and it
// is what the boundary form will be built on: mass in minus mass out IS the change in the
// two regions, to machine precision, with flashing moving mass between them and creating
// none.
var sM = stateAt(55.0), m0 = sM.pzr_m_liq_kg + sM.pzr_m_stm_kg, added = 0;
for (var n = 0; n < 120; n++) {
  var io2 = { surge_kgps: (n < 40 ? 3.0 : (n < 80 ? -2.0 : 0)), surge_t_c: THOT,
              spray_kgps: (n >= 80 ? 1.5 : 0), spray_t_c: 290, relief_kgps: (n >= 80 ? 0.4 : 0),
              heater_frac: 0.3 };
  added += (io2.surge_kgps || 0) + (io2.spray_kgps || 0) - (io2.relief_kgps || 0);
  PZ2.stepRegions(sM, CFG, 1.0, io2);
}
var m1 = sM.pzr_m_liq_kg + sM.pzr_m_stm_kg;
var closure = Math.abs((m1 - m0) - added) / Math.max(1, Math.abs(added));
ck('F1 CV-1 step mass closure (surge + spray - relief)', 'residual ' + closure.toExponential(2) + ' rel on ' + r3(added) + ' kg',
   closure < 1e-9, '< 1e-9 relative');

// TD-5 ("relief is not surge") IS NOT ASSERTED HERE, and the attempt is worth recording.
// The obvious region-level form — 60 kg out of the steam space moves level less than 60 kg
// out of the liquid — is FALSE in this model and correctly so: measured 3.50 points against
// 2.95, i.e. the steam draw moves level MORE, because the pressure drop boils 59 kg of the
// liquid inventory away. TD-5's real subject is the LEVEL LAW in the loop bookkeeping (v1
// counted relief flow in `_dmass_dt` and needed the `w` admittance split to take it back
// out), and that lives in `surgeDemand` at the node boundary, not in the regions. It gets
// asserted when the boundary lands. Two forms of this check were written and both were
// testing the wrong layer; F3 below asserts what the regions actually own.

// F3 DERIVED — and the pressure consequence is the other half: drawing steam must DROP
// pressure, and the liquid must FLASH to slow that drop. A check that only compared level
// paths would pass on a relief path that did nothing at all, and the flashing is what makes
// the drop 115 psi instead of 665 (the pre-fix number, when the solve could not flash).
var sR2 = stateAt(55.0), pr0 = press(sR2), mliq0 = sR2.pzr_m_liq_kg, mstm0 = sR2.pzr_m_stm_kg;
for (var r2 = 0; r2 < 30; r2++) PZ2.stepRegions(sR2, CFG, 1.0, { relief_kgps: 2.0 });
var flashed = mliq0 - sR2.pzr_m_liq_kg, steamNet = mstm0 - sR2.pzr_m_stm_kg;
// F4 DERIVED — the valve is on the STEAM space, and this is the measurement that says so.
// Sixty kilograms out of the top drops pressure 112 psi; the same sixty out of the surge
// line drops it 19. ADDED because the injection pass rerouted relief to draw liquid and
// F1/F3 both stayed green: mass still closed, and "flashed > 30 kg" was satisfied by the
// 60 kg the valve itself had taken. A check whose predicate the wrong model also satisfies
// is not a check, and the ratio is what separates them.
var sSteamD = stateAt(55.0), pS0 = press(sSteamD);
for (var fs1 = 0; fs1 < 30; fs1++) PZ2.stepRegions(sSteamD, CFG, 1.0, { relief_kgps: 2.0 });
var sLiqD = stateAt(55.0), pL0 = press(sLiqD);
for (var fs2 = 0; fs2 < 30; fs2++) PZ2.stepRegions(sLiqD, CFG, 1.0, { surge_kgps: -2.0 });
var dropSteam = pS0 - press(sSteamD), dropLiq = pL0 - press(sLiqD);
ck('F4 60 kg off the steam space costs far more pressure than 60 kg off the liquid',
   r3(psi(dropSteam)) + ' vs ' + r3(psi(dropLiq)) + ' psi',
   dropSteam > 3 * dropLiq && dropLiq > 0, 'steam draw > 3x the liquid draw');

ck('F3 relief drops pressure and the liquid flashes to replace the steam',
   r3(psi(press(sR2) - pr0)) + ' psi; ' + r3(flashed) + ' kg flashed against ' + r3(steamNet) + ' kg net steam loss of 60 drawn',
   press(sR2) < pr0 - 0.05 && flashed > 30 && steamNet < 10, 'pressure falls, > 30 kg flashes, net steam loss < 10 kg');

// ============================================================ G. the node boundary
console.log('\n' + B + 'G. Surge boundary — v1\'s algebra in kg/s, and the ledger that carries TMI' + X);

// G1 DERIVED — the currency conversion is the CV-3 identity, not a new constant. One point
// of level is M_rcs_kg / level_per_mass = 25.5 kg, which is also 1 % of the vessel at the
// saturated liquid density. If those disagree, the boundary and the regions are measuring
// two different pressurizers.
var kgPerPoint = P2.M_rcs_kg / P1.level_per_mass;
var kgPerPointGeom = 0.01 * P2.V_pzr_m3 * PZ2.rho_l_sat(PZ2.T_sat_from_P(P_OP));
ck('G1 one level point is the same mass both ways', r3(kgPerPoint) + ' vs ' + r3(kgPerPointGeom) + ' kg',
   Math.abs(kgPerPoint - kgPerPointGeom) / kgPerPoint < 0.01, 'within 1 %');

// G2 DERIVED — the thermal and inventory terms ARE v1's, converted. Computed here from the
// same config constants v1 reads, against the boundary's answer for the same state. This is
// what makes a TD drift during the rebuild a conversion bug rather than a recalibration.
var sB = stateAt(55.0);
sB.tavg_c = 304.0; sB._tavg_fp = 304.0; sB._dTavg_dt = 0.01; sB._dmass_dt = -1e-5;
sB._mass = 1.0; sB.primary_void_fraction = 0; sB.leak_flow = 0;
var expect_lvl = P1.level_per_tavg * 0.01 + P1.level_per_mass * -1e-5;
var got = PZ2.surgeDemand(sB, CFG, 0.1);
ck('G2 thermal + inventory match v1\'s law in the new currency', r3(got) + ' vs ' + r3(expect_lvl * kgPerPoint) + ' kg/s',
   Math.abs(got - expect_lvl * kgPerPoint) < 1e-9, 'equal to 1e-9');

// G3 DERIVED — the NEVER-LEAKED family keeps v1's state form with w === 1 exactly. That is
// the calibrated TMI arc (stuck PORV, safeties, loss of heat sink), and "bitwise the frozen
// line" is the property that lets TD-3/TD-4 stay green through the rebuild.
var sV = stateAt(55.0);
sV.tavg_c = 304.0; sV._tavg_fp = 304.0; sV._dTavg_dt = 0; sV._dmass_dt = 0; sV.leak_flow = 0;
sV.primary_void_fraction = 0.0; PZ2.surgeDemand(sV, CFG, 0.1);
sV.primary_void_fraction = 0.2; var credit_kgps = PZ2.surgeDemand(sV, CFG, 0.1);
ck('G3 void credit with no leak is v1\'s state form, w = 1', r3(sV._pzr_void_lvl) + ' points at void 0.2',
   Math.abs(sV._pzr_void_lvl - P1.level_per_void * 0.2) < 1e-9, r3(P1.level_per_void * 0.2) + ' points');

// G4 = CV-4. DERIVED — the ledger's bounds. Once a leak has flowed the credit accretes as a
// FLOW with the admittance split on growth and unweighted collapse, floored at zero. Two
// properties and both are the anti-ratchet: the credit never exceeds level_per_void * void
// (growth is weighted, collapse is not), and saturation-boundary flicker can only take it
// DOWN. Driven here with a leak running, which is the regime v1's state form got wrong.
var sL = stateAt(55.0);
sL.tavg_c = 304.0; sL._tavg_fp = 304.0; sL._dTavg_dt = 0; sL._dmass_dt = 0; sL.leak_flow = 0.05;
sL.primary_void_fraction = 0; PZ2.surgeDemand(sL, CFG, 0.1);
var maxOver = 0;
for (var gv = 0; gv < 40; gv++) {                       // ramp the void up, then flicker it
  sL.primary_void_fraction = Math.min(0.8, sL.primary_void_fraction + 0.02);
  PZ2.surgeDemand(sL, CFG, 0.1);
  maxOver = Math.max(maxOver, sL._pzr_void_lvl - P1.level_per_void * sL.primary_void_fraction);
}
var beforeFlicker = sL._pzr_void_lvl;
for (var gf = 0; gf < 20; gf++) {
  sL.primary_void_fraction = 0.8 + (gf % 2 ? 0.02 : -0.02);
  PZ2.surgeDemand(sL, CFG, 0.1);
}
ck('G4a CV-4 the credit never exceeds the unweighted displacement', 'worst excess ' + maxOver.toExponential(2) + ' points',
   maxOver <= 1e-9, '<= 0');
ck('G4b CV-4 boundary flicker can only ratchet DOWN', r3(beforeFlicker) + ' -> ' + r3(sL._pzr_void_lvl) + ' points over 20 flickers',
   sL._pzr_void_lvl <= beforeFlicker + 1e-9, 'no net rise');

// G4c CV-4 THE FLOOR. Growth is weighted and collapse is not, so a void that grows through
// a leak and then condenses away takes MORE credit out than it ever put in — the node would
// end up owing liquid it was never given. The floor at zero is what stops that, and it only
// binds on this path: a full collapse after a weighted growth. ADDED after the injection
// pass deleted the floor and every other ledger check stayed green, because none of their
// trajectories ever reached it.
var sFl = stateAt(55.0);
sFl.tavg_c = 304.0; sFl._tavg_fp = 304.0; sFl._dTavg_dt = 0; sFl._dmass_dt = 0; sFl.leak_flow = 0.05;
sFl.primary_void_fraction = 0; PZ2.surgeDemand(sFl, CFG, 0.1);
for (var gg = 1; gg <= 30; gg++) { sFl.primary_void_fraction = gg * 0.02; PZ2.surgeDemand(sFl, CFG, 0.1); }
var peakCredit = sFl._pzr_void_lvl, minCredit = peakCredit;
for (var gc = 29; gc >= 0; gc--) {
  sFl.primary_void_fraction = gc * 0.02;
  PZ2.surgeDemand(sFl, CFG, 0.1);
  minCredit = Math.min(minCredit, sFl._pzr_void_lvl);
}
ck('G4c CV-4 the credit floors at zero on a full collapse',
   'peak ' + r3(peakCredit) + ' -> ' + r3(sFl._pzr_void_lvl) + ' points, minimum ' + r3(minCredit),
   minCredit >= 0 && sFl._pzr_void_lvl < 1e-9, 'never negative, ends at 0');

// G6 DERIVED, and it is the strongest thing in this file — THE PORTED LEDGER IS RUN
// AGAINST V1'S OWN, step for step, on the same trajectory. v1 accretes the credit inside
// `stepLevel`; v2 does it in `voidCreditRate` at the boundary. Same keys, same algebra,
// different callers. If they ever disagree the deception has been RECALIBRATED rather than
// ported, which is the one outcome spec §3.4 says must not happen quietly: TD-1 and TD-2
// are algebra-preserving by construction or they are not preserved at all.
var sv1 = { _mass: 1.0, tavg_c: 304.0, _tavg_fp: 304.0, pzr_mass_frac: 0.0709, primary_void_fraction: 0, leak_flow: 0 };
var sv2 = { _mass: 1.0, tavg_c: 304.0, _tavg_fp: 304.0, primary_void_fraction: 0, leak_flow: 0, _dTavg_dt: 0, _dmass_dt: 0 };
var worstLedger = 0;
for (var gt = 0; gt < 200; gt++) {
  var vv = gt < 120 ? gt * 0.006 : Math.max(0, 0.72 - (gt - 120) * 0.004);   // ramp up, then collapse
  var lk = gt < 40 ? 0 : 0.03 * Math.min(1, (gt - 40) / 20);                 // a leak opens at step 40
  sv1.primary_void_fraction = sv2.primary_void_fraction = vv;
  sv1.leak_flow = sv2.leak_flow = lk;
  PZ1.stepLevel(sv1, CFG, 0.1);
  PZ2.surgeDemand(sv2, CFG, 0.1);
  worstLedger = Math.max(worstLedger, Math.abs((sv1._pzr_void_lvl || 0) - (sv2._pzr_void_lvl || 0)));
}
ck('G6 the ported ledger tracks v1\'s bitwise over a leak-and-collapse trajectory',
   'worst divergence ' + worstLedger.toExponential(2) + ' points over 200 steps, ending ' + r3(sv2._pzr_void_lvl),
   worstLedger < 1e-12, '< 1e-12 points');

// G7 DERIVED — TD-5 AT THE LAYER THAT OWNS IT. "Relief is not surge" is a statement about
// the boundary, not the regions (the regions' attempt is recorded in section F): mass
// leaving through the PORV leaves the pressurizer directly, so it must not appear in the
// surge demand. `stepInventory` already adds it back into `_dmass_dt`
// (pwr_primary.js:396), so the boundary's job is simply not to add it AGAIN — and this
// check is the one that notices, since a double count is invisible on any state where the
// valve is shut. ADDED after the injection pass duplicated the term and the gate stayed
// green through it.
var sNoRel = stateAt(55.0), sRel = stateAt(55.0);
[sNoRel, sRel].forEach(function (x) {
  x.tavg_c = 304.0; x._tavg_fp = 304.0; x._dTavg_dt = 0; x._dmass_dt = -2e-4;
  x._mass = 1.0; x.primary_void_fraction = 0; x.leak_flow = 0;
});
sRel.porv_flow = 0.6; sRel.safety_flow = 0.2;
var qNoRel = PZ2.surgeDemand(sNoRel, CFG, 0.1), qRel = PZ2.surgeDemand(sRel, CFG, 0.1);
ck('G7 TD-5 relief flow does not appear in the surge demand', r3(qRel) + ' vs ' + r3(qNoRel) + ' kg/s with 0.8 of relief flowing',
   Math.abs(qRel - qNoRel) < 1e-12, 'identical');

// G8 DERIVED — #384 stage 4's suppression survives the port. On a SOLID plant whose level
// base is floored (below ~293 °C, the #289 cold-modes stand-in) and CONTRACTING, the level
// line credits no room from thermal contraction, so the surge must not credit it either —
// two accountings of one vessel is how inventory once rode a cooldown to the mass_max clip.
// Both legs are asserted: suppressed when solid, and NOT suppressed when a bubble exists,
// because a suppression that fired everywhere would be a different defect.
var sSol = stateAt(101.0);                       // over capacity: solid
sSol.tavg_c = 200.0; sSol._tavg_fp = 304.0; sSol._dTavg_dt = -0.01; sSol._dmass_dt = 0;
sSol._mass = 1.0; sSol.primary_void_fraction = 0; sSol.leak_flow = 0;
var qSolid = PZ2.surgeDemand(sSol, CFG, 0.1);
var sBub = stateAt(55.0);
sBub.tavg_c = 200.0; sBub._tavg_fp = 304.0; sBub._dTavg_dt = -0.01; sBub._dmass_dt = 0;
sBub._mass = 1.0; sBub.primary_void_fraction = 0; sBub.leak_flow = 0;
var qBubble = PZ2.surgeDemand(sBub, CFG, 0.1);
ck('G8 the cold-solid thermal suppression survives the port, and only there',
   'solid ' + r3(qSolid) + ' kg/s, bubbled ' + r3(qBubble) + ' kg/s on the same contraction',
   Math.abs(qSolid) < 1e-12 && qBubble < -0.1, 'solid 0, bubbled negative');

// G5 DERIVED — the tap's saturation margin, which is what #474 asked this boundary to
// expose (a derived voided/liquid flag needs the local margin, not the flow). Positive is
// subcooled; at the operating point the hot leg sits about 60 °F under saturation, and a
// depressurization to the hot leg's own saturation pressure takes it to zero.
var sT = { pressure_mpa: P_OP, thot_c: 311.7 };
var m1 = PZ2.tapSatMargin(sT);
sT.pressure_mpa = PZ1.P_sat_from_T(311.7);
var m2 = PZ2.tapSatMargin(sT);
ck('G5 tap saturation margin reads subcooled, and reaches zero at Psat(Thot)',
   r3(m1 * 9 / 5) + ' F subcooled at 2235 psia, ' + r3(m2 * 9 / 5) + ' F at Psat(Thot)',
   m1 > 25 && Math.abs(m2) < 0.05, '> 45 F, then ~0');

// ============================================================ H. the step, at the top level
console.log('\n' + B + 'H. stepPressure — the regime branch, and the hole in the loop' + X);

// H1 THE REGRESSION GUARD FOR A DEFECT THE REGIONS CANNOT SEE. Steam has no way out of this
// vessel except the relief valves, so as a break drains the loop the pressurizer's liquid
// leaves and its STEAM STAYS — holding pressure up, which keeps the loop subcooled, which
// keeps `primary_void_fraction` at 0, which keeps the saturated/blowdown branch from ever
// firing. Measured on a severity-0.8 large break before the fix: core inventory 0.0 %, void
// 0.0, pressure PINNED at 1871 psi for fifteen minutes, accumulators never dumping.
//
// v1's `K_leak_depressurize` is the stand-in that prevents it and it was dropped from v2 as
// a double count (the leak IS already in `_dmass_dt`). The first half of that reasoning is
// right and the conclusion was wrong. The real fix is steam venting down the surge line,
// which needs the loop to hold steam — #474. This check is what stops the term being
// "simplified" out again before then.
function stepOnce(leak) {
  var s = stateAt(55.0);
  s.tavg_c = 304.0; s._tavg_fp = 304.0; s.thot_c = 311.7; s.tcold_c = 297.0;
  s._dTavg_dt = 0; s._dmass_dt = 0; s._mass = 1.0; s.primary_void_fraction = 0;
  s.leak_flow = leak; s._leak_base = leak > 0 ? leak : 0;
  s.heater_power_frac = 0; s.spray_flow_frac = 0; s.flow_frac = 1;
  s.porv_flow = 0; s.safety_flow = 0; s.pressure_mpa = P_OP;
  s.pzr_level_pct = 55; s.pzr_mass_frac = s.pzr_m_liq_kg / P2.M_rcs_kg;
  var p0 = s.pressure_mpa;
  for (var i = 0; i < 100; i++) PZ2.stepPressure(s, CFG, 1.0);
  return psi(s.pressure_mpa - p0);
}
var dry = stepOnce(0), leaking = stepOnce(2e-4);
ck('H1 a hole in the loop depressurizes the bubble (and no leak does not)',
   r3(leaking) + ' psi with a leak vs ' + r3(dry) + ' psi without, over 100 s',
   leaking < -10 && Math.abs(dry) < 5, 'leaking falls > 10 psi, dry stays put');

// ============================================================ J. inventory conservation
console.log('\n' + B + 'J. The node against the loop — mass is not created by pressure' + X);

// J1 DERIVED — RESEED PRESERVES MASS. The ported branches set pressure by a dP law and then
// re-derive the vessel's thermodynamic state; that re-derivation must not touch inventory.
// It used to go through LEVEL — the caller computed a level from `m_liq / rho_l(T_old)` and
// reseed rebuilt the mass as `level × V_pzr × rho_l(Tsat(P_new))`. Identical only while the
// two temperatures agree, which during a blowdown they do not: Tsat falls with pressure, the
// liquid gets denser, and the same level comes back as MORE kilograms. Every step of a
// depressurization minted water. Normal operation hid it completely (the temperatures do
// agree there, and `pzr_mass_frac` tracked v1 to 0.25 %).
var sRS = stateAt(55.0);
sRS._mass = 1.0;
var mBefore = sRS.pzr_m_liq_kg;
sRS.pressure_mpa = 8.0;                       // a blowdown's worth of pressure change
PZ2.reseed(sRS, CFG);
ck('J1 reseed changes temperature and steam, never liquid mass',
   r3(mBefore) + ' -> ' + r3(sRS.pzr_m_liq_kg) + ' kg across a 15.41 -> 8.0 MPa reseed',
   Math.abs(sRS.pzr_m_liq_kg - mBefore) < 1e-9, 'unchanged to 1e-9');

// J2 DERIVED — the node cannot hold water the plant does not have (#418: a node's capacity
// comes OUT of what it split from, and the loop's share is the implicit `_mass − share`).
// v1 could not violate this because it RECONSTRUCTED the share from `_mass` every step; v2
// integrates the surge, so numerics can drift the two apart. The fence is a clamp, not a
// trim toward a reconstruction — anchoring to one would re-import v1's level law as the
// authority and undo the rebuild.
//
// IT ALSO REPORTS HEADROOM, deliberately: if this ever binds in a normal regime that is a
// defect in the surge accounting, not a rounding issue, and a silent clamp is exactly how
// such a defect would be absorbed.
var sCap = stateAt(55.0);
sCap._mass = 0.02;                            // a plant holding less than the vessel does
sCap.pzr_m_liq_kg = 5000;
PZ2.reconcile(sCap, CFG);
var sHead = stateAt(55.0); sHead._mass = 1.0;
PZ2.reconcile(sHead, CFG);
var headroom = (1.0 * P2.M_rcs_kg - sHead.pzr_m_liq_kg) / P2.M_rcs_kg;
ck('J2 the node is clamped to the plant\'s inventory, and normal ops are far from it',
   'clamped to ' + r3(sCap.pzr_m_liq_kg) + ' kg; normal-ops headroom ' + r3(headroom * 100) + ' % of RCS mass',
   Math.abs(sCap.pzr_m_liq_kg - 0.02 * P2.M_rcs_kg) < 1e-9 && headroom > 0.9, 'clamped; headroom > 90 %');

// J3 DERIVED — THE INVENTORY IS SIGNED. An outsurge that outruns the water must BANK the
// remainder and a refill must REPAY it before the vessel fills, or the plant gets water for
// free at the empty end. Measured before this existed: on a severity-0.09 break the clamp
// bound for 80,209 steps and discarded 8,684 kg — 3.4x the vessel's capacity — while the
// ECCS refill that followed was credited in full, so a pressurizer holding ZERO water
// published a 100 % gauge. v1 cannot fail this way because its level is a signed
// reconstruction; `ui/app.js` records its node reading −105 and −172 points off-scale.
var sSg = stateAt(55.0);
var mFull = sSg.pzr_m_liq_kg;
var out = PZ2.stepRegions(sSg, CFG, 1.0, { surge_kgps: -(mFull + 500) });   // 500 kg past empty
var bankedKg = sSg.pzr_m_deficit_kg || 0;
PZ2.stepRegions(sSg, CFG, 1.0, { surge_kgps: 200, surge_t_c: 300 });        // partial refill
var afterPartial = sSg.pzr_m_liq_kg, stillOwed = sSg.pzr_m_deficit_kg || 0;
ck('J3a an outsurge past empty banks the remainder instead of discarding it',
   r3(bankedKg) + ' kg banked from a ' + r3(mFull + 500) + ' kg demand on ' + r3(mFull) + ' kg of water',
   Math.abs(bankedKg - 500) < 1e-6 && sSg.pzr_m_liq_kg >= 0, '500 kg banked, vessel not negative');
// Tolerance is 1 kg against a 1402 kg vessel, not zero: the flash solve legitimately moves a
// fraction of a kilogram across the interface in the same step (the region is condensing at
// this pressure), and asserting an exact zero was measuring the flash, not the repayment.
ck('J3b a refill repays the debt before the vessel fills',
   afterPartial.toExponential(2) + ' kg in the vessel, ' + r3(stillOwed) + ' kg still owed after 200 kg back',
   afterPartial < 1.0 && Math.abs(stillOwed - 300) < 1.0, 'vessel still ~empty, ~300 kg owed');
// And normal operation never touches any of it — a deficit on a plant that is simply running
// would mean the surge accounting is wrong, not that the fence is working.
var sNorm = stateAt(55.0);
for (var jn = 0; jn < 200; jn++) PZ2.stepRegions(sNorm, CFG, 1.0, { surge_kgps: (jn % 2 ? 1.5 : -1.5), surge_t_c: 311.7 });
ck('J3c normal surge cycling banks nothing', r3(sNorm.pzr_m_deficit_kg || 0) + ' kg after 200 steps of ±1.5 kg/s',
   !(sNorm.pzr_m_deficit_kg > 1e-9), 'zero');

// ============================================================ tally
console.log('\n' + D + '──────────────────────────────────────────' + X);
if (failed === 0) console.log(B + G + 'PRESSURIZER v2 REGIONS: OK' + X + '  ' + checks + ' checks, 0 failed');
else console.log(B + R + 'PRESSURIZER v2 REGIONS: FAIL' + X + '  ' + checks + ' checks, ' + R + failed + ' failed' + X);
console.log(D + 'Mostly region level: conservation is a property of a state and a step, not of a' + X);
console.log(D + 'scenario. Plant-level acceptance is PWR_BEHAVIOR_CATALOG §13.2, measured by hand' + X);
console.log(D + 'with measure_stack --pzr2 — those rows have no probe yet (todo, #472 3d).' + X + '\n');
process.exit(failed === 0 ? 0 : 1);
