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
 'pwr2_fuel', 'pwr2_reactor', 'pwr2_damage', 'pwr2_sources', 'pwr2_break', 'pwr2_pressurizer'
].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, W = RD.water, S = RD.sources, R = RD.reactor, DG = RD.damage,
    PZ = RD.pressurizer;
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
  /* THE PLANT HAS ITS PRESSURIZER (stage 1, owner ruling 2026-08-18 "Option 1") — a LOCA run
   * on a plant with no pressure control was #486's finding, and this scenario was the last
   * major fixture carrying it. MEASURED before the change (2026-08-19, both plants, all five
   * scenarios): the vessel OUTSURGES INTO THE BREAK and empties at 22 s on the 20 cm2 break,
   * shifting every milestone a near-uniform +5..11 s; the 5 cm2 slow leak is fought ~150 s
   * longer (the heaters and 1,682 kg of vessel inventory are real); the feedback-attribution
   * property (both runs reach onset together) and the #487 floor endgame both SURVIVE. Relief
   * is wired as the one-step-lag sink the module header requires — it never fires in a
   * blowdown, and a wired-and-silent path beats an unwired one. */
  var pz  = PZ.createPressurizer({});
  var sys = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41, extraMass: PZ.extraMassFn(pz) });
  var rx  = R.createReactor({ P: 1.0, coolTemp_c: 304.5 });
  var dm  = DG.createDamage({});
  var brk = RD.break_.createBreak({ area_m2: opts.area_m2 || 0.002, cd: 1.0,
                                    node: 'cold_leg', open: true });
  var rods = [{ steps: 0, max_steps: 200, worth: 0.08 }];
  var t = 0, Qox = 0, sumOxKJ = 0, courantBad = 0, nonFinite = 0, relief = 0, pzr = null;
  var heldAt = null;
  var hit = {}, firstVoid = null, flowLost = null, damagedAt = null, meltedAt = null;
  var firstSuperheat = null, maxSuperheat = 0, superheatSteps = 0;   /* #517 */
  var maxSuperheatAt = null, clampAt = null;                          /* #574 — see the wing check */
  var M0 = sys.M_total, maxOx = 0, lastR = null, lastD = null, pzEmptyAt = null;
  var steps = Math.round((opts.secs || 1200) / DT);

  for (var i = 0; i < steps; i++) {
    /* ⚠ STOP WHEN THE PLANT DECLARES ITSELF BEYOND MODEL (#574). Every check below reads the
     * FINAL state, and a held plant's final state is an out-of-envelope one by definition —
     * that is what the hold exists to say. MEASURED 2026-08-28 on the 5 cm2 ride: with the metal
     * walls feeding the boil-off the blowdown carries to 0.137 MPa (against 4.571 dry) and the
     * core node ends pinned EXACTLY at the property ceiling, h = 4162 against h_v = 4162 — so
     * "no reading here is a clamped value" read a clamped value. The claim is about the RUNNING
     * plant and is now asserted on one. */
    if (sys.beyond_model) { heldAt = t; break; }
    var rr = R.stepReactor(rx, sys, DT,
      { boron_ppm: 700, rodGroups: rods, Q_ox_kW: feedback ? Qox : undefined });
    if (!isFinite(rr.T_clad_c) || !isFinite(rr.T_fuel_c)) { nonFinite++; break; }
    var dr = DG.stepDamage(dm, DT, { cladTemp_c: rr.T_clad_c, fuelTemp_c: rr.T_fuel_c });
    Qox = dr.Q_ox_kW;
    sumOxKJ += Qox * DT;
    var br = RD.break_.stepBreak(brk, sys, DT, {});
    var srcs = [br.source];
    if (relief > 0) srcs.push({ node: 'hot_leg', mdot: -relief, h: pzr.relief_h });
    var pr = S.stepPlant(sys, DT, { heats: rr.heats, sources: srcs });
    RD.break_.book(brk, br, pr.dt_accepted / DT);    /* #585 — book only what the plant accepted */
    pzr = PZ.stepPressurizer(pz, sys, DT, {});
    relief = pzr.relief_kgs;
    if (pzEmptyAt === null && pzr.emptied) pzEmptyAt = t;
    if (!pr.courantOK) courantBad++;
    /* #574 — WHEN the property clamp first fires. The superheat wing's claim is that its
     * numbers are COMPUTED and not pinned, and that is a claim about when they were taken. */
    var clampedThisStep = pr.enthalpyClamped > 0;
    t += DT;
    /* ⚠ STAMPED AFTER `t += DT`, like every other timestamp in this loop. Stamped before it, the
     * clamp and the superheat maximum recorded the SAME step as two different times, and the
     * comparison between them came out as a tie rather than as an ordering. */
    if (clampAt === null && clampedThisStep) clampAt = t;

    var reg = R.coreRegime(sys), cf = rr.T_clad_c * 9 / 5 + 32;
    if (firstVoid === null && reg.voidFrac > 0.5) firstVoid = t;
    if (flowLost === null && reg.flowFrac < 0.05) flowLost = t;
    /* #517 — the superheat regime, tracked so the wing has a RIDE to be accepted on. Void
     * saturates at 1 long before this does, which is the whole reason the field exists. */
    if (firstSuperheat === null && reg.superheat_c > 0) firstSuperheat = t;
    /* #574 — the maximum is tracked ONLY while every node is inside the property envelope.
     * The wing's claim is that its superheat is COMPUTED, not pinned, and a maximum taken
     * after the clamp fires cannot support it: measured, the peak sat at 691 degC at 1247 s
     * with the clamp first firing at 1187. Capping the tracking makes the reported number
     * defensible BY CONSTRUCTION rather than by a check that hopes it was. */
    if (clampAt === null && reg.superheat_c > maxSuperheat) {
      maxSuperheat = reg.superheat_c; maxSuperheatAt = t;
    }
    if (reg.superheat_c > 0) superheatSteps++;
    [DOC.onset_f, DOC.significant_f, DOC.pct_limit_f].forEach(function (m) {
      if (hit[m] === undefined && cf >= m) hit[m] = t;
    });
    if (damagedAt === null && dr.fuel_damaged) damagedAt = t;
    if (meltedAt === null && dr.melted) meltedAt = t;
    if (dr.oxidation_frac > maxOx) maxOx = dr.oxidation_frac;
    lastR = rr; lastD = dr;
  }
  return { sys: sys, rx: rx, dm: dm, t: t, M0: M0, sumOxKJ: sumOxKJ, courantBad: courantBad, heldAt: heldAt,
           maxSuperheatAt: maxSuperheatAt, clampAt: clampAt,
           nonFinite: nonFinite, hit: hit, firstVoid: firstVoid, flowLost: flowLost,
           damagedAt: damagedAt, meltedAt: meltedAt, maxOx: maxOx, r: lastR, d: lastD,
           pzEmptyAt: pzEmptyAt,
           firstSuperheat: firstSuperheat, maxSuperheat: maxSuperheat,
           superheatSteps: superheatSteps };
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

/* ============================================================================================
 * ⚠ EVERYTHING PAST THE HYDROGEN ONSET IS DECLARED BLOCKED, NOT DELETED — #586.
 *
 * This gate used to assert the 1800 and 2200 degF crossings, the damage latch, the melt order,
 * the ON-vs-OFF milestone comparison and a 100 % oxidation endpoint. MEASURED 2026-08-28, on the
 * PRE-#574 plant as well as the post — so this is NOT the metal walls: the plant latches
 * `beyond_model` at **469 s** on this 20 cm2 break, and the 2200 degF crossing was at **939 s**.
 * `pwr2_core.step` returns early on a held plant — mass stops moving, junctions read zero — so
 * every one of those numbers came from 470+ seconds of FROZEN PHYSICS while only the systems
 * around the plant kept running. Fourth probe in this engine to read a plant outside its own
 * valid regime; `run_pwr2_cvcs` carries the comment about the first three.
 *
 * WHICH WALL BLOCKS IT WAS MEASURED 2026-08-29 (#586, owner-ruled "measure, then settle"), and
 * it is NOT the 0.1 MPa pressure floor this banner used to name: on every unmitigated break
 * size (5/10/20/40 cm2) the plant latches on the CEILING-PERSISTENCE arm — the core node
 * pinned at the VAPOUR branch's 800 degC envelope edge (h = 4161 kJ/kg) for 60 continuous
 * seconds of active discard — with pressure parked at 15.7 psia, comfortably ABOVE the floor.
 * So the chain is NOT blocked on #524 (the sub-floor extension Mode 5 waits on); it is blocked
 * on TV_MAX, the superheated-vapour fits' validated ceiling. The honest ride reaches the
 * 1200 degF onset and peaks at 1698-1735 degF STILL CLIMBING at the latch, oxidation < 1 % —
 * about 65 degF short of the 1800 degF milestone. Un-blocking means extending the four
 * cp_v/Z(P) fits past 800 degC against fresh IAPWS-95 anchors and re-calibrating the
 * CEIL_HOLD_LATCH_S margin — its own scoped work item, not a constant bump.
 *
 * *(OWNER RULING, 2026-08-28: "Keep the guard, shrink the claims", from three costed options.)*
 * Every claim the VALID plant supports is kept; the rest is named here rather than quietly
 * re-fitted to whatever a held plant produces. A gate that is green and false is worse than one
 * that is honest about its reach.
 * ========================================================================================== */
ckT('the ride stops WHERE THE MODEL DOES — the chain past the onset is #586, not a claim',
    ON.heldAt !== null && ON.hit[DOC.onset_f] < ON.heldAt,
    'onset at ' + ON.hit[DOC.onset_f].toFixed(0) + ' s, beyond_model at ' +
    (ON.heldAt === null ? 'never' : ON.heldAt.toFixed(0) + ' s') + ' — 1800 degF, 2200 degF, the ' +
    'damage latch and the oxidation endpoint all sit past that floor and are DECLARED BLOCKED');
ckT('...and the damage latch has NOT tripped, because the plant never got there',
    ON.damagedAt === null && ON.meltedAt === null,
    'damaged ' + ON.damagedAt + ', melted ' + ON.meltedAt +
    ' — the old gate latched it at 939 s, on a plant frozen since 469');

/* ---- THE FEEDBACK, WHICH IS THE WHOLE POINT ----------------------------------------------- */
head('THE FEEDBACK  [the only thing here no single-file gate can see]');
/* THE ATTRIBUTION PROPERTY SURVIVES INTACT, and it was always the real claim: the feedback
 * cannot act before there is a reaction, so both runs must reach the onset together. It is
 * asserted on a RUNNING plant — the onset is at ~352 s against a floor at 469. */
ckT('BOTH runs reach the hydrogen onset at the same time — the feedback cannot act before there ' +
    'is a reaction',
    ON.hit[DOC.onset_f] !== undefined && OFF.hit[DOC.onset_f] !== undefined &&
    Math.abs(ON.hit[DOC.onset_f] - OFF.hit[DOC.onset_f]) < 1.0,
    'ON ' + ON.hit[DOC.onset_f].toFixed(2) + ' s, OFF ' + OFF.hit[DOC.onset_f].toFixed(2) +
    ' s — identical, which is what makes the divergence AFTER it attributable');
/* ⚠ THE DIVERGENCE ITSELF IS WHAT #586 TAKES AWAY. The old checks compared the 2200 degF
 * crossings and the terminal oxidation fractions, and both sit past the floor. What CAN be
 * asserted on a valid plant is that the feedback is already doing something by the time the
 * model stops: the ON leg must have oxidised MORE, and the OFF leg must have oxidised at all,
 * or the comparison is against a model that does nothing. The magnitudes are small because the
 * valid ride is short, and they are REPORTED rather than banded — a band here would be fitted
 * to a horizon that #586 is expected to change. */
ckT('the feedback is already accelerating the reaction by the time the model stops',
    ON.maxOx > OFF.maxOx && OFF.maxOx > 0,
    (ON.maxOx * 100).toFixed(3) + ' % with feedback against ' + (OFF.maxOx * 100).toFixed(3) +
    ' % without, at ' + ON.t.toFixed(0) + ' s — the old gate read 100 % against 15.8 %, both past ' +
    'the floor. Everything else in this plant decays; this is the one thing that accelerates');
ckT('the run WITHOUT feedback still oxidises, so the difference is the feedback and not the model',
    OFF.maxOx > 0,
    (OFF.maxOx * 100).toFixed(3) + ' % — a zero here would mean the comparison was against a ' +
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
/* ⚠ BOTH 50.46 CRITERIA LIVE PAST THE PROPERTY FLOOR — DECLARED BLOCKED, #586. The old pair
 * asserted that criterion 1 (2200 degF peak clad) is breached and that criterion 3 (1 % of the
 * hypothetical hydrogen) is reached before criterion 2 (17 % oxidation). Both were true only of
 * a HELD plant: this ride stops at `beyond_model` with 0.8 % oxidation, an order under either
 * criterion. What is still assertable on a valid plant is that the model CARRIES the criteria
 * and their ordering, which is a claim about the criteria and not about a frozen ride. */
ckT('the model carries all three 50.46 criteria, and the hydrogen one is the tightest',
    DOC.h2_criterion < DOC.ox_criterion && DOC.pct_limit_f === 2200 &&
    ON.dm.geom.M_clad_kg > 0,
    '1 % hydrogen against 17 % oxidation — 17x tighter, so it binds first; 2200 degF is the ' +
    'third. WHETHER this plant reaches any of them is #586: it stops at ' +
    (ON.maxOx * 100).toFixed(2) + ' % oxidation when the model does');

/* ---- THE PLANT SURVIVED THE RIDE AS A MODEL ----------------------------------------------- */
head('NUMERICS  [the scenario must stay inside what the engine claims to compute]');
ckT('nothing went non-finite in either run', ON.nonFinite === 0 && OFF.nonFinite === 0,
    'a NaN here would make every number above meaningless');
ckT('the Courant limit held at the house cadence, with no substepping',
    ON.courantBad === 0 && OFF.courantBad === 0,
    'dt = ' + DT + ' s throughout, ' + (ON.t / DT).toFixed(0) + ' steps');
/* ⚠ THE HORIZON CHECK IS INVERTED NOW, and deliberately. It used to require both runs to
 * complete 1,200 s, which they did — by stepping a frozen plant for the last 700 of them. The
 * honest claim is that both runs stop at the model's own floor and stop TOGETHER, within a few
 * seconds of each other, because the feedback is not what takes the plant there. */
ckT('both runs stop at the model\'s OWN floor, and within seconds of each other',
    ON.heldAt !== null && OFF.heldAt !== null && Math.abs(ON.heldAt - OFF.heldAt) < 30,
    ON.t.toFixed(0) + ' s and ' + OFF.t.toFixed(0) + ' s of VALID plant — the old form required ' +
    '1,190 s and got it by stepping a held plant for the last 700');

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
/* RE-SCOPED at #535 (2026-08-28): this used to require P < 0.5 MPa and < 1 % inventory —
 * an endgame the ride only reached by riding THROUGH ~30 min of sustained ceiling discard
 * (deleted decay heat). The ceiling persistence latch now holds the plant honestly at
 * 4.56 MPa / 5.8 % inventory, mid-boil-off, so the endpoint claim is: DEEP in the casualty
 * and TERMINALLY LATCHED. The old floats-unlatched-for-ever behaviour FAILS this form —
 * deliberate, that immortality is the #535 defect; the latch mechanism itself is
 * unit-tested and mutation-pinned in run_pwr2_core. */
ckT('the filed 5 cm2 case runs DEEP into the endgame and ends TERMINALLY LATCHED (#487/#535)',
    END.sys.beyond_model === true && 100 * END.sys.M_total / END.M0 < 10,
    END.sys.P.toFixed(3) + ' MPa, ' + (100 * END.sys.M_total / END.M0).toFixed(2) +
    ' % inventory at 1800 s, beyond_model ' + END.sys.beyond_model +
    ' — a run held shallow, or riding free on deleted heat, would prove nothing');
ckT('...and the plant is FINITE there, held or floating — never NaN (#487)',
    END.nonFinite === 0 && isFinite(END.sys.P) && isFinite(END.sys.mdot_loop) && endHFinite,
    'P ' + END.sys.P.toFixed(3) + ' MPa in-envelope, every node enthalpy finite through ' +
    END.t.toFixed(0) + ' s; beyond_model latch ' + (END.sys.beyond_model ? 'FIRED' : 'not needed'));

/* ---- #517: THE SUPERHEAT REGIME IS REACHABLE, AND LARGE ------------------------------------
 * ⚠ THE TRAP THIS SECTION EXISTS FOR: "a term that is an IDENTITY in the regime you test in is
 * a term nothing tests." The superheat wing is INERT on both rides #517 was filed about — their
 * cores stay at quality 0.84-0.88 and never leave the dome, and the freeze there is a numerical
 * transport instability, not a property-range event (measured, and filed separately). So the
 * wing has to be accepted on the ride where the regime actually LIVES: the unmitigated 5 cm2
 * break, which is the same fixture the #487 endgame section already rides. If this section ever
 * reads zero, the wing is decoration and should be removed rather than kept green. */
head('#517 SUPERHEAT  [the wing is inert on the rides it was filed about — this is its regime]');
ckT('the unmitigated 5 cm2 break REACHES superheat, and is not a corner it grazes',
    END.firstSuperheat !== null && END.superheatSteps * DT > 600,
    END.firstSuperheat === null ? 'NEVER — the wing has no regime and is decoration' :
      'first at ' + END.firstSuperheat.toFixed(0) + ' s, then ' +
      (END.superheatSteps * DT).toFixed(0) + ' s of the ' + END.t.toFixed(0) + ' s ride');
ckT('...and it goes far past the boundary — over 100 degC of superheat, not a rounding wobble',
    END.maxSuperheat > 100,
    'max ' + END.maxSuperheat.toFixed(0) + ' degC (' + (END.maxSuperheat * 9 / 5).toFixed(0) +
    ' degF) above saturation');
/* THE ENVELOPE IS NOT REACHED, which is what makes the wing honest rather than a clamp with a
 * new name: Layer 0 is characterised to 800 degC and this ride tops out far below it. */
/* ⚠ THE CLAIM IS ABOUT WHEN THE NUMBER WAS TAKEN, NOT ABOUT THE FINAL STATE (#574).
 * This asserted that no node ends past Layer 0's 800 degC vapour ceiling. On the 5 cm2 ride the
 * plant now carries down to 0.137 MPa and the core node ends pinned EXACTLY on it — h = 4162.1
 * against h_v = 4162.1 — so the check that existed to prove the superheat is COMPUTED was itself
 * reading a pinned value. Note the clamp fires BEFORE the beyond-model latch, so stopping at the
 * hold is not enough on its own; #535's latch waits for SUSTAINED discard.
 * The honest form is the one the wing actually needs: the maximum superheat this gate reports was
 * measured while every node was still inside the envelope. That is a statement about the reading,
 * which is what "computed, not pinned" always meant. */
ckT('the superheat MAXIMUM was measured before any node touched the vapour ceiling',
    END.maxSuperheatAt !== null &&
    (END.clampAt === null || END.maxSuperheatAt < END.clampAt),
    'peak ' + END.maxSuperheat.toFixed(0) + ' degC at ' + END.maxSuperheatAt.toFixed(0) +
    ' s; the property clamp first fires at ' +
    (END.clampAt === null ? 'never in this ride' : END.clampAt.toFixed(0) + ' s') +
    ' — the reported superheat is computed, and the ride past that point is #586');
/* ⚠ THE NEGATIVE CONTROL IS NOT IN THIS FILE, AND WRITING IT HERE FIRST IS THE MISTAKE WORTH
 * RECORDING. #517's ride is the SAME 0.002 m2 break — but through the FACADE, with emergency
 * injection answering. This harness is engine-direct with no ECCS, so the identical break
 * superheats to 138 degC here and 18.6 degC there; a check written here read the wrong plant and
 * failed against a number that was never the claim. Measured, and it is the interesting half:
 * injection is what keeps that core in the dome. The control lives in `run_pwr2_endurance`
 * beside the facade ride it is about. (Memory: reproduce a probe with ITS harness.) */

console.log('\n' + '='.repeat(70));
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;
console.log('  run_pwr2_coredamage: ' + pass + ' passed, ' + fail + ' failed  (' +
            rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit(fail > 0 ? 1 : 0);
