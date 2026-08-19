/* run_pwr2_coredamage.js — Layer 5 JOINT gate: the whole damage chain, driven once. (#479)
 *
 * Every link in this chain is gated alone. Nothing had ever driven them TOGETHER, and the chain is
 * the claim:
 *
 *     break -> inventory falls -> core voids -> LOOP FLOW COLLAPSES -> the film coefficient
 *     collapses with it -> the cladding heats -> Baker-Just runs -> ITS HEAT GOES BACK INTO THE
 *     CLADDING -> it heats faster -> the reaction runs faster still
 *
 * That last feedback is the only thing here that no single-file gate can see, and it is the reason
 * core damage behaves differently from every other transient in this engine: **it accelerates.**
 * Everything else in the plant decays.
 *
 * ⚠ NO loadFrom / MUTATIONS HARNESS, deliberately, and for the reason `run_pwr2_loca.js` states:
 * every library this scenario touches — `pwr2_break.js`, `pwr2_fuel.js`, `pwr2_damage.js`,
 * `pwr2_sources.js`, `pwr2_reactor.js` — already carries its own injection self-test. The only NEW
 * code here is the wiring, and it lives in this file's `scenario()` rather than in a `SRC` string a
 * harness could patch. So the defence is TIGHT QUANTITATIVE CLOSURE instead: the energy released
 * must equal 1510 cal/g on the zirconium consumed, and the hydrogen must equal the stoichiometric
 * ratio times it — both to floating-point, not to a band. A dropped term, a sign error or a
 * double-count fails those directly rather than merely going unasserted.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ WHAT THIS GATE DOES NOT CLAIM, stated first so no number below is read as more than it is.
 *
 * TIMING IS NOT A CLAIM. When the cladding reaches a given temperature depends on `pwr2_fuel.js`'s
 * low-flow film coefficient, which is UNSOURCED, and on two declared optimistic simplifications
 * (no departure from nucleate boiling; a coolant clamped at the property library's 800 degC
 * ceiling). The times below are recorded so the ACCELERATION can be measured as a difference
 * between two runs of the same model — which is a real comparison — not offered as plant data.
 *
 * THE END STATE IS NOT A CLAIM EITHER, and this is the one place this model runs PESSIMISTIC where
 * every other declared simplification runs optimistic. With no mitigation the reaction consumes
 * 100 % of the cladding, because nothing here models the two things that actually terminate it in
 * a real accident: **relocation** (GEND-061 lists *"Zircaloy melting and relocation to generally
 * colder regions and resulting reduced exposed-surface areas"* among what makes TMI-2 hard to
 * calculate) and **quenching**. TMI-2 itself stopped at ~45 % because injection was restored. So
 * the terminal 100 % is what an UNMITIGATED, UNRELOCATED core would do, and it is reported rather
 * than asserted as prototypical.
 *
 * Run: node test/run_pwr2_coredamage.js
 */
'use strict';
var path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_kinetics',
 'pwr2_fuel', 'pwr2_reactor', 'pwr2_damage', 'pwr2_sources', 'pwr2_break'
].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, W = RD.water, S = RD.sources, R = RD.reactor, DG = RD.damage;
var DT = 0.02;

/* THE SOURCED MILESTONES, RETYPED. Ginna UFSAR ch15 (ML20339A101) and GEND-061 §4.3. */
var DOC = { onset_f: 1200, significant_f: 1800, pct_limit_f: 2200,
            heat_cal_per_g: 1510, cal_j: 4.184,
            zr_g_per_mol: 91.224, h2_g_per_mol: 2.016,
            ox_criterion: 0.17, h2_criterion: 0.01 };

/* scenario(opts) — a break at full power with the reactor coupled, and the oxidation heat fed
 * BACK into the cladding or not.
 *
 * ⚠ THE FEEDBACK IS THE CALLER'S, and that is not a convenience — it is the same split every
 * Layer 5 file in this engine draws. `pwr2_damage.js` computes a heat; `pwr2_fuel.js` accepts one;
 * neither reaches for the other. This scenario plays the wiring role ONCE, explicitly, so that
 * running it both ways is a one-argument change and the difference between them is a measurement
 * rather than two different programs. */
function scenario(opts) {
  opts = opts || {};
  var feedback = opts.feedback !== false;
  var sys = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41 });
  var rx  = R.createReactor({ P: 1.0, coolTemp_c: 304.5 });
  var dm  = DG.createDamage({});
  var brk = RD.break_.createBreak({ area_m2: opts.area_m2 || 0.002, cd: 1.0,
                                    node: 'cold_leg', open: true });
  var rods = [{ steps: 0, max_steps: 200, worth: 0.08 }];
  var t = 0, Qox = 0, sumOxKJ = 0, courantBad = 0, nonFinite = 0;
  var hit = {}, firstVoid = null, flowLost = null, damagedAt = null, meltedAt = null;
  var M0 = sys.M_total, maxOx = 0, lastR = null, lastD = null;
  var steps = Math.round((opts.secs || 1200) / DT);

  for (var i = 0; i < steps; i++) {
    var rr = R.stepReactor(rx, sys, DT,
      { boron_ppm: 700, rodGroups: rods, Q_ox_kW: feedback ? Qox : undefined });
    if (!isFinite(rr.T_clad_c) || !isFinite(rr.T_fuel_c)) { nonFinite++; break; }
    var dr = DG.stepDamage(dm, DT, { cladTemp_c: rr.T_clad_c, fuelTemp_c: rr.T_fuel_c });
    Qox = dr.Q_ox_kW;
    sumOxKJ += Qox * DT;
    var br = RD.break_.stepBreak(brk, sys, DT, {});
    var pr = S.stepPlant(sys, DT, { heats: rr.heats, sources: [br.source] });
    if (!pr.courantOK) courantBad++;
    t += DT;

    var reg = R.coreRegime(sys), cf = rr.T_clad_c * 9 / 5 + 32;
    if (firstVoid === null && reg.voidFrac > 0.5) firstVoid = t;
    if (flowLost === null && reg.flowFrac < 0.05) flowLost = t;
    [DOC.onset_f, DOC.significant_f, DOC.pct_limit_f].forEach(function (m) {
      if (hit[m] === undefined && cf >= m) hit[m] = t;
    });
    if (damagedAt === null && dr.fuel_damaged) damagedAt = t;
    if (meltedAt === null && dr.melted) meltedAt = t;
    if (dr.oxidation_frac > maxOx) maxOx = dr.oxidation_frac;
    lastR = rr; lastD = dr;
  }
  return { sys: sys, rx: rx, dm: dm, t: t, M0: M0, sumOxKJ: sumOxKJ, courantBad: courantBad,
           nonFinite: nonFinite, hit: hit, firstVoid: firstVoid, flowLost: flowLost,
           damagedAt: damagedAt, meltedAt: meltedAt, maxOx: maxOx, r: lastR, d: lastD };
}

var rec = [];
function ck(name, got, want, tol, unit) {
  var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
  rec.push({ name: name, ok: ok });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(58) +
    'got ' + got.toFixed(4) + ' want ' + want.toFixed(4) + ' (tol ' + tol + ') ' + (unit || ''));
}
function ckT(name, cond, note) {
  rec.push({ name: name, ok: !!cond });
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
}
function head(s) { console.log('\n' + s); }

console.log('\nPWR2 JOINT -- CORE DAMAGE: the chain, and the feedback that makes it accelerate');

var ON  = scenario({ feedback: true,  secs: 1200 });
var OFF = scenario({ feedback: false, secs: 1200 });

/* ---- THE CHAIN HAPPENS, AND IN ORDER ------------------------------------------------------ */
head('THE CHAIN  [each link must precede the next, or the mechanism is not the one claimed]');
ckT('the core voids before the loop flow collapses',
    ON.firstVoid !== null && ON.flowLost !== null && ON.firstVoid < ON.flowLost,
    'void past 50 % at ' + ON.firstVoid.toFixed(0) + ' s, flow under 5 % of rated at ' +
    ON.flowLost.toFixed(0) + ' s');
ckT('...and the flow collapses before the cladding reaches the hydrogen onset',
    ON.flowLost < ON.hit[DOC.onset_f],
    'flow lost at ' + ON.flowLost.toFixed(0) + ' s, GEND-061 1200 degF at ' +
    ON.hit[DOC.onset_f].toFixed(0) + ' s — the heat-up follows the loss of cooling, not the break');
ckT('...and the three sourced clad milestones arrive in the order the documents put them',
    ON.hit[DOC.onset_f] < ON.hit[DOC.significant_f] &&
    ON.hit[DOC.significant_f] < ON.hit[DOC.pct_limit_f],
    '1200 degF at ' + ON.hit[DOC.onset_f].toFixed(0) + ' s, 1800 at ' +
    ON.hit[DOC.significant_f].toFixed(0) + ' s, 2200 at ' + ON.hit[DOC.pct_limit_f].toFixed(0) +
    ' s (TIMES ARE NOT A CLAIM — see the header)');
ckT('...and the damage latch trips at the 50.46 limit, not before and not after',
    ON.damagedAt !== null && Math.abs(ON.damagedAt - ON.hit[DOC.pct_limit_f]) <= 2 * DT,
    'latched at ' + ON.damagedAt.toFixed(2) + ' s against the 2200 degF crossing at ' +
    ON.hit[DOC.pct_limit_f].toFixed(2));
ckT('...and MELT comes after damage, never before it',
    ON.meltedAt === null || ON.meltedAt > ON.damagedAt,
    ON.meltedAt === null ? 'not reached in this run' :
      'melted at ' + ON.meltedAt.toFixed(0) + ' s, damaged at ' + ON.damagedAt.toFixed(0));

/* ---- THE FEEDBACK, WHICH IS THE WHOLE POINT ----------------------------------------------- */
head('THE FEEDBACK  [the only thing here no single-file gate can see]');
ckT('BOTH runs reach the hydrogen onset at the same time — the feedback cannot act before there ' +
    'is a reaction',
    Math.abs(ON.hit[DOC.onset_f] - OFF.hit[DOC.onset_f]) < 1.0,
    'ON ' + ON.hit[DOC.onset_f].toFixed(0) + ' s, OFF ' + OFF.hit[DOC.onset_f].toFixed(0) +
    ' s — identical, which is what makes the divergence AFTER it attributable');
ckT('...and the 50.46 limit arrives MEASURABLY EARLIER with the reaction heat fed back',
    ON.hit[DOC.pct_limit_f] < OFF.hit[DOC.pct_limit_f] - 60,
    'ON ' + ON.hit[DOC.pct_limit_f].toFixed(0) + ' s against OFF ' +
    OFF.hit[DOC.pct_limit_f].toFixed(0) + ' s — ' +
    (OFF.hit[DOC.pct_limit_f] - ON.hit[DOC.pct_limit_f]).toFixed(0) + ' s earlier');
ckT('...and far more of the cladding is consumed, on the same break and the same decay heat',
    ON.maxOx > OFF.maxOx * 2,
    (ON.maxOx * 100).toFixed(1) + ' % with feedback against ' + (OFF.maxOx * 100).toFixed(1) +
    ' % without — everything else in this plant decays; this is the one thing that accelerates');
ckT('the run WITHOUT feedback still oxidises, so the difference is the feedback and not the model',
    OFF.maxOx > 0.05,
    (OFF.maxOx * 100).toFixed(1) + ' % — a zero here would mean the comparison was against a ' +
    'model that does nothing, which would prove nothing');

/* ---- CLOSURE: the defence this gate has instead of a mutation harness --------------------- */
head('CLOSURE  [tight quantitative equalities, not bands — a dropped term fails these directly]');
var zrKg = ON.d.zr_consumed_kg;
ck('the energy released is EXACTLY 1510 cal/g on the zirconium consumed',
   ON.sumOxKJ, zrKg * 1000 * DOC.heat_cal_per_g * DOC.cal_j / 1000, 1.0, 'kJ');
ck('the hydrogen is EXACTLY the stoichiometric ratio times it (GEND-061 states it in words)',
   ON.d.h2_kg, zrKg * 2 * DOC.h2_g_per_mol / DOC.zr_g_per_mol, 1e-9, 'kg');
ck('the oxidised mass is the areal oxide over the clad surface',
   zrKg, ON.dm.w_mg_cm2 * ON.dm.geom.clad_surface_m2 / 100, 1e-9, 'kg');
ckT('the reaction never consumes more zirconium than the core contains',
    zrKg <= ON.dm.geom.M_clad_kg * (1 + 1e-9),
    zrKg.toFixed(0) + ' kg of ' + ON.dm.geom.M_clad_kg.toFixed(0) + ' kg present');

/* ---- THE 50.46 CRITERIA, AND WHICH ONE GOES FIRST ---------------------------------------- */
head('10 CFR 50.46  [an unmitigated core must breach them, and in the right order]');
ckT('criterion 1 (2200 degF peak clad) is breached, so the model can express a design-basis ' +
    'failure at all',
    ON.damagedAt !== null, 'a model that could never breach it could never grade an accident');
ckT('criterion 3 (1 % of the hypothetical hydrogen) goes LONG before criterion 2 (17 % oxidation)',
    DOC.h2_criterion < DOC.ox_criterion && ON.maxOx > DOC.h2_criterion,
    'the hydrogen criterion is 17x tighter than the oxidation one, so it is the binding constraint ' +
    'first — at ' + (ON.maxOx * 100).toFixed(1) + ' % oxidation both are long past');

/* ---- THE PLANT SURVIVED THE RIDE AS A MODEL ----------------------------------------------- */
head('NUMERICS  [the scenario must stay inside what the engine claims to compute]');
ckT('nothing went non-finite in either run', ON.nonFinite === 0 && OFF.nonFinite === 0,
    'a NaN here would make every number above meaningless');
ckT('the Courant limit held at the house cadence, with no substepping',
    ON.courantBad === 0 && OFF.courantBad === 0,
    'dt = ' + DT + ' s throughout, ' + (ON.t / DT).toFixed(0) + ' steps');
ckT('both runs completed their full horizon', ON.t > 1190 && OFF.t > 1190,
    ON.t.toFixed(0) + ' s and ' + OFF.t.toFixed(0) + ' s of plant');

/* ---- #487: THE ENDGAME PAST THE FLOOR ------------------------------------------------------
 * The filed case: a 5 cm2 break ran clean for 840 s and went NaN in the reactor the step after
 * pressure touched the 0.1 MPa property floor. Re-measured 2026-08-18: the pump density
 * coupling (landed after the issue was filed) changed the endgame — the plant now drains to
 * ~0.08 % inventory and FLOATS just above the floor, finite, indefinitely. That cure was
 * incidental, so this section pins it, and pwr2_core now carries a beyond-model latch
 * (flooredLow + enthalpy clamp -> held state) as the guaranteed backstop for any state that
 * DOES make the floor mass-inconsistent; the latch itself is unit-tested in run_pwr2_core. */
head('#487 ENDGAME  [the filed NaN was cured incidentally; this is what keeps it cured]');
var END = scenario({ feedback: true, secs: 1800, area_m2: 0.0005 });
var endHFinite = true;
END.sys.nodes.forEach(function (n) { if (!isFinite(n.h)) endHFinite = false; });
ckT('the filed 5 cm2 case reaches the floor REGION — the check is not passing above the endgame',
    END.sys.P < 0.5 && 100 * END.sys.M_total / END.M0 < 1.0,
    END.sys.P.toFixed(3) + ' MPa, ' + (100 * END.sys.M_total / END.M0).toFixed(2) +
    ' % inventory at 1800 s — a run that never got here would prove nothing');
ckT('...and the plant is FINITE there, held or floating — never NaN (#487)',
    END.nonFinite === 0 && isFinite(END.sys.P) && isFinite(END.sys.mdot_loop) && endHFinite,
    'P ' + END.sys.P.toFixed(3) + ' MPa in-envelope, every node enthalpy finite through ' +
    END.t.toFixed(0) + ' s; beyond_model latch ' + (END.sys.beyond_model ? 'FIRED' : 'not needed'));

console.log('\n' + '='.repeat(70));
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;
console.log('  run_pwr2_coredamage: ' + pass + ' passed, ' + fail + ' failed  (' +
            rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit(fail > 0 ? 1 : 0);
