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
 * (no departure from nucleate boiling; a coolant clamped at the property library's vapour ceiling
 * — 1000 degC since #586, IAPWS-95's own upper limit). The times below are recorded so the
 * ACCELERATION can be measured as a difference between two runs of the same model — which is a
 * real comparison — not offered as plant data.
 *
 * THE END STATE IS NOT A CLAIM EITHER. The ride ends where the MODEL ends, not where the accident
 * would: the fluid reaches the vapour ceiling and the plant holds, at 4.68 % of the cladding
 * oxidised with the damage limit just crossed. Nothing here models the two things that actually
 * terminate the reaction in a real accident — **relocation** (GEND-061 lists *"Zircaloy melting
 * and relocation to generally colder regions and resulting reduced exposed-surface areas"* among
 * what makes TMI-2 hard to calculate) and **quenching** — nor anything that would carry it
 * further. TMI-2 itself reached ~45 % because injection was restored when it was. So this gate
 * asserts that the chain REACHES the damage limit and which criteria it breaches on the way;
 * where an unmitigated core would finish is outside what this library can speak to.
 * (Before #586 this paragraph described a terminal 100 % oxidation — that number came from
 * stepping a plant that had been frozen for 470 s, and it is the reason the fence existed.)
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
  var cladMeltAt = null;                       /* #516 item 9 — when the oxidation surface goes */
  var firstSuperheat = null, maxSuperheat = 0, superheatSteps = 0;   /* #517 */
  var maxSuperheatAt = null, clampAt = null;                          /* #574 — see the wing check */
  var M0 = sys.M_total, maxOx = 0, maxClad = 0, lastR = null, lastD = null, pzEmptyAt = null;
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
    if (cladMeltAt === null && dr.clad_melted) cladMeltAt = t;
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
    /* #586 — the PEAK cladding temperature on the valid ride. Tracked inside the loop, which
     * breaks at the hold, so it can never be a held plant's number. */
    if (cf > maxClad) maxClad = cf;
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
           damagedAt: damagedAt, meltedAt: meltedAt, cladMeltAt: cladMeltAt,
           maxOx: maxOx, maxClad: maxClad,
           r: lastR, d: lastD,
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
 * THE CHAIN COMPLETES INSIDE THE ENVELOPE AGAIN — #586 UNBLOCKED, 2026-08-29.
 *
 * HISTORY, because the shape of this fence is the lesson. The gate once asserted the 1800 and
 * 2200 degF crossings, the damage latch and a 100 % oxidation endpoint — and every one of those
 * numbers came from 470+ seconds of FROZEN PHYSICS, because the plant latched `beyond_model` at
 * 469 s and the harness kept stepping it. The claims were then DECLARED BLOCKED rather than
 * re-fitted to what a held plant produces *(OWNER RULING, 2026-08-28: "Keep the guard, shrink
 * the claims")*, and the wall was measured rather than assumed *(OWNER RULING, 2026-08-29:
 * "Measure, then settle" — selected from written options)*.
 *
 * THE WALL WAS THE VAPOUR CEILING, NOT THE PRESSURE FLOOR. Every unmitigated break latched on
 * the CEILING-PERSISTENCE arm with the core node pinned at h_v(TV_MAX, P) — at 15.7 psia, ABOVE
 * the 14.5 psia floor. So this was never blocked on #524's sub-floor extension: it was blocked
 * on `TV_MAX`, which was 800 degC only because the fetch query that built the fits stopped
 * there (`PWR2_L0_REBUILD` §3, `THigh=800`) — a data boundary that had never been argued.
 *
 * TV_MAX IS NOW 1000 degC, IAPWS-95's own documented upper limit, with the four
 * superheated-vapour parameters REFITTED over the whole extended range against freshly fetched
 * NIST SRD 69 reference data (h_v max 32.8 kJ/kg over 1,814 points — better than the old fit's
 * 35.1 over its shorter range). The old coefficients did NOT extrapolate: evaluated past their
 * range they measured cp 34.8 % out at 1000 degC. Raising the ceiling without the refit would
 * have published that as physics.
 *
 * WHAT THE VALID PLANT NOW REACHES, all measured 2026-08-29 on the 20 cm2 unmitigated break:
 *   void > 50 %   33 s        flow < 5 %    110 s      1200 degF (GEND-061)   308.0 s
 *   1800 degF    489.9 s      2200 degF     590.0 s    damage latch           590.0 s
 *   model holds  596.4 s      peak clad     2229 degF  oxidation              4.68 %
 * The chain completes with 6.4 s of valid plant to spare, and MELT does not occur — that is
 * declared below rather than chased, because it sits past the last ceiling this library can
 * claim to be validated at rather than extrapolated to.
 * ========================================================================================== */
/* RE-EXPRESSED at #516 item 9 (2026-08-29). This check used to require `ON.heldAt !== null` and
 * assert the 2200 degF crossing landed BEFORE the hold — because until now the ride always ended
 * on the ceiling-persistence arm, 6.4 s past the crossing, and "the chain fits inside the
 * envelope" was a real and hard-won claim (#586, §118). Layer 0 now carries a sourced ideal-gas
 * branch above TV_MAX and the plant DOES NOT HOLD AT ALL on this ride, so requiring a hold would
 * pin the very limitation the extension removed. The ordering claim — which was always the
 * mechanism — is unchanged, and is now asserted on a plant that runs the whole way. */
ckT('the chain COMPLETES on a running plant — every milestone, in order, and no hold at all',
    ON.hit[DOC.onset_f] !== undefined && ON.hit[DOC.significant_f] !== undefined &&
    ON.hit[DOC.pct_limit_f] !== undefined && ON.heldAt === null &&
    ON.hit[DOC.onset_f] < ON.hit[DOC.significant_f] &&
    ON.hit[DOC.significant_f] < ON.hit[DOC.pct_limit_f],
    '1200 degF ' + ON.hit[DOC.onset_f].toFixed(1) + ' s, 1800 ' +
    ON.hit[DOC.significant_f].toFixed(1) + ' s, 2200 ' + ON.hit[DOC.pct_limit_f].toFixed(1) +
    ' s, and the model never holds — the ceiling that used to end this ride 6.4 s past the ' +
    'limit has moved');
/* THE LATCH AND THE CROSSING ARE THE SAME EVENT, and asserting them as a pair is what stops a
 * damage flag that fires off some other quantity reading as the 50.46 limit working. */
ckT('the damage latch trips ON the 2200 degF crossing — the same step, not merely nearby',
    ON.damagedAt !== null && Math.abs(ON.damagedAt - ON.hit[DOC.pct_limit_f]) <= 2 * DT,
    'damaged at ' + ON.damagedAt.toFixed(2) + ' s against the 2200 degF crossing at ' +
    ON.hit[DOC.pct_limit_f].toFixed(2) + ' s');
/* THE CLADDING MELTS, AND THAT IS WHERE THE HEAT SOURCE ENDS (#516 item 9). Measured WITHOUT
 * the cut-off: the clad crosses its melting point at 645.3 s and reaches 16,311 degC three
 * seconds later, because Appendix K's sourced "shall be assumed not to be steam limited" keeps
 * a SURFACE rate law running on a surface that has relocated. */
ckT('the cladding reaches its melting point AFTER the 50.46 limit, and the oxidation heat ends there',
    ON.cladMeltAt !== null && ON.cladMeltAt > ON.hit[DOC.pct_limit_f],
    'clad melts at ' + ON.cladMeltAt.toFixed(1) + ' s, after the 2200 degF crossing at ' +
    ON.hit[DOC.pct_limit_f].toFixed(1) + ' s');
/* THE BOUND IS THE POINT. A gate that only checked "melt did not happen" would pass happily on
 * an unbounded run that reaches 29,392 degF, which is not a temperature. */
ckT('...and the peak cladding temperature stays PHYSICAL — the runaway is bounded, not merely absent',
    ON.maxClad < 4000,
    'peak clad ' + ON.maxClad.toFixed(0) + ' degF; without the cut-off the same ride reaches ' +
    '29,392 degF within three seconds of the melting point');
/* DECLARED, NOT CHASED — AND THE REASON HAS CHANGED, which is the finding. It used to be a
 * property-range limit: the fluid pinned at the ceiling and the ride ended there. That wall is
 * gone. Melt is still out of reach, now because the oxidation heat source DIES WITH THE CLADDING
 * and decay heat alone cannot close the remaining gap to the uranium-dioxide melting point.
 * Reaching it would need a melt-progression model — relocation, candling, a molten pool — which
 * nothing in the corpus supports and which this module declares it does not have. Asserted as an
 * absence with its reason, so a later change that makes melt reachable reds this check and gets
 * re-measured rather than silently acquiring a melt path. */
ckT('MELT is still out of reach — no longer a property-range limit, but the absence of a ' +
    'melt-progression model',
    ON.meltedAt === null,
    'melted never; peak fuel stays short of the sourced ' + (3100 - 273.15).toFixed(0) +
    ' degC uranium-dioxide melting point. The fluid ceiling is no longer the wall (Layer 0 now ' +
    'extends to ' + RD.water.LIMITS.TV_EXT_MAX + ' degC on the sourced ideal-gas branch) — the ' +
    'wall is that this model cannot follow cladding that has relocated');

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
/* ⚠ A CLAIM THIS GATE MADE AT #586 IS NOW WITHDRAWN, AND THAT IS THE FINDING (#516 item 9,
 * 2026-08-29). With the ride ending on the vapour ceiling at 596 s, the no-feedback leg peaked at
 * 2090 degF and NEVER crossed the 50.46 limit, and this gate said in as many words that the
 * oxidation feedback "is what takes this core over the damage limit AT ALL". Once Layer 0's
 * sourced ideal-gas branch let both legs run to completion, the OFF leg peaks at **2940 degF** —
 * it crosses the limit too, just later. **The old claim was an artifact of where the ride was
 * truncated**, which is the same lesson #586 recorded about its own fence, arriving one level up.
 *
 * What survives is the claim that was always the mechanism, and it is still strong: the feedback
 * gets the core there SOONER, and the ordering is asserted rather than the reachability. */
ckT('BOTH legs cross the damage limit once the ride can finish — and the FEEDBACK leg gets there ' +
    'first, which is the claim that survives the fence coming down',
    ON.hit[DOC.pct_limit_f] !== undefined && OFF.hit[DOC.pct_limit_f] !== undefined &&
    ON.hit[DOC.pct_limit_f] < OFF.hit[DOC.pct_limit_f],
    'ON crosses 2200 degF at ' + ON.hit[DOC.pct_limit_f].toFixed(1) + ' s, OFF at ' +
    OFF.hit[DOC.pct_limit_f].toFixed(1) + ' s (' +
    (OFF.hit[DOC.pct_limit_f] - ON.hit[DOC.pct_limit_f]).toFixed(1) +
    ' s later) — same break, same plant, one term');
/* THE OXIDATION COMPARISON INVERTS, and it is not a defect — it is the cut-off showing through.
 * The feedback leg reaches the cladding melting point EARLIER, which freezes its reaction
 * earlier, so it ends with LESS total oxide (17.57 %) than the leg that heated slowly and kept
 * reacting for longer (52.67 %). The old check asserted ON > OFF, which was true only while
 * neither leg could reach the melting point. Asserted in its true direction, with the reason. */
ckT('...and it gets there SOONER at every milestone past the onset, never later',
    ON.hit[DOC.significant_f] < OFF.hit[DOC.significant_f],
    '1800 degF at ' + ON.hit[DOC.significant_f].toFixed(1) + ' s with feedback against ' +
    OFF.hit[DOC.significant_f].toFixed(1) + ' without (' +
    (OFF.hit[DOC.significant_f] - ON.hit[DOC.significant_f]).toFixed(1) + ' s earlier). ' +
    'Everything else in this plant decays; this is the one thing that accelerates');
/* AND THE CLEANEST STATEMENT IN THIS GATE FALLS OUT OF IT: the feedback is what MELTS THE
 * CLADDING. The ON leg reaches the melting point at 645.3 s; the OFF leg never reaches it at all
 * within the horizon, peaking at 2940 degF (1616 degC). Which is why the oxidation comparison
 * INVERTS — the feedback leg stops reacting when its cladding goes, while the leg that heats
 * slowly keeps reacting for the rest of the ride and ends with three times the oxide. The old
 * check asserted ON > OFF and was true only while neither leg could get near the melting point. */
ckT('...and the FEEDBACK is what melts the cladding — the OFF leg never reaches the melting ' +
    'point at all, so it ends MORE oxidised despite being the cooler ride',
    ON.cladMeltAt !== null && OFF.cladMeltAt === null &&
    ON.maxOx < OFF.maxOx && ON.maxOx > 0,
    'cladding melts at ' + ON.cladMeltAt.toFixed(1) + ' s with feedback and never without; ' +
    'oxidation ' + (ON.maxOx * 100).toFixed(2) + ' % against ' + (OFF.maxOx * 100).toFixed(2) +
    ' % — the reaction stops when the surface it runs on does');
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
/* ⚠ RESTORED at #586 and RE-EXPRESSED at #516 item 9, and the re-expression is the interesting
 * part. At #586, with the ride ending on the vapour ceiling, the unmitigated core breached TWO of
 * the three 10 CFR 50.46 criteria and not the third, and this gate called that "sharper and more
 * teachable than breaching everything". Once the ride can finish, oxidation reaches 17.57 %
 * and the third criterion goes too — so "and NOT the oxidation one" was, again, a statement about
 * where the ride stopped rather than about the plant.
 *
 * THE ORDERING CLAIM IS THE ONE THAT WAS ALWAYS REAL, and it survives in a stronger form: the
 * hydrogen criterion is not merely crossed first, it is crossed by a WIDE MARGIN while oxidation
 * only just clears its own. That is what "17x tighter" means, measured on the plant instead of
 * read off two constants. */
ckT('the model carries all three 50.46 criteria, and the hydrogen one is the tightest',
    DOC.h2_criterion < DOC.ox_criterion && DOC.pct_limit_f === 2200 &&
    ON.dm.geom.M_clad_kg > 0,
    '1 % hydrogen against 17 % oxidation — 17x tighter, so it binds first; 2200 degF is the third');
ckT('the unmitigated core breaches ALL THREE criteria — and the HYDROGEN one by far the widest ' +
    'margin, which is the ordering demonstrated rather than assumed',
    ON.maxClad >= DOC.pct_limit_f &&
    ON.d.h2_frac_hypothetical > DOC.h2_criterion &&
    ON.maxOx > DOC.ox_criterion &&
    (ON.d.h2_frac_hypothetical / DOC.h2_criterion) > 3 * (ON.maxOx / DOC.ox_criterion),
    'peak clad ' + ON.maxClad.toFixed(0) + ' degF (limit 2200); hydrogen ' +
    (ON.d.h2_frac_hypothetical * 100).toFixed(2) + ' % against a 1 % criterion (' +
    (ON.d.h2_frac_hypothetical / DOC.h2_criterion).toFixed(1) + 'x over); oxidation ' +
    (ON.maxOx * 100).toFixed(2) + ' % against 17 % (' +
    (ON.maxOx / DOC.ox_criterion).toFixed(2) + 'x over) — the tight one goes deep, the loose ' +
    'one only just goes');

/* ---- THE PLANT SURVIVED THE RIDE AS A MODEL ----------------------------------------------- */
head('NUMERICS  [the scenario must stay inside what the engine claims to compute]');
ckT('nothing went non-finite in either run', ON.nonFinite === 0 && OFF.nonFinite === 0,
    'a NaN here would make every number above meaningless');
ckT('the Courant limit held at the house cadence, with no substepping',
    ON.courantBad === 0 && OFF.courantBad === 0,
    'dt = ' + DT + ' s throughout, ' + (ON.t / DT).toFixed(0) + ' steps');
/* ⚠ THE HORIZON CHECK, RE-AIMED THREE TIMES NOW AND THE HISTORY IS THE POINT. It first required
 * both runs to complete 1,200 s — which they did, by stepping a FROZEN plant for the last 700.
 * It was then inverted to "both stop at the model's own floor", and at #586 to "both stop on the
 * ceiling, ON first (596.4 vs 645.9)". Each of those was true of the plant at the time and each
 * was pinning a LIMITATION rather than a behaviour, which is why each had to be re-aimed when the
 * limitation moved. With Layer 0's extension (#516 item 9) neither leg stops at all: both run the
 * full horizon on a live plant.
 *
 * So the claim is inverted one last time, and this form should survive — it asserts the thing the
 * first version was actually reaching for and got wrong by accident: **both runs are still being
 * STEPPED at the end**, not frozen. `heldAt === null` is what makes the last 700 s real rather
 * than 35,000 repetitions of one state, which is the defect the original wording concealed. */
ckT('neither run stops early — both are LIVE at the horizon, not a frozen plant being re-stepped',
    ON.heldAt === null && OFF.heldAt === null &&
    ON.t >= 1200 - 2 * DT && OFF.t >= 1200 - 2 * DT,
    'ON ran ' + ON.t.toFixed(1) + ' s and OFF ' + OFF.t.toFixed(1) +
    ' s, neither held — the ceiling that used to stop both legs has moved');

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
/* ⚠ RE-SCOPED AGAIN at #516 item 9. At #535 this required the plant to end TERMINALLY LATCHED,
 * because the alternative then on offer was the #535 defect — an immortal plant floating for ever
 * on deleted decay heat, with every health flag green. That is no longer the alternative: the
 * ceiling this ride used to latch against has moved, the clad-melt cut-off bounds the heat source
 * honestly, and the plant now runs the whole 1,800 s LIVE and deeply drained. The #535 concern is
 * met by the cut-off rather than by the latch, so what this asserts is DEPTH plus a live plant,
 * and the #487 finiteness claim below is unchanged and does the rest. */
ckT('the filed 5 cm2 case runs DEEP into the endgame, on a LIVE plant (#487/#535)',
    END.sys.beyond_model !== true && 100 * END.sys.M_total / END.M0 < 10,
    END.sys.P.toFixed(3) + ' MPa, ' + (100 * END.sys.M_total / END.M0).toFixed(2) +
    ' % inventory at 1800 s, never held — a run held shallow would prove nothing, and one ' +
    'riding free on DELETED heat is the #535 defect, which the clad-melt cut-off now bounds');
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
 * new name: Layer 0 is characterised to TV_MAX (1000 degC since #586) and this ride tops out
 * below it. */
/* ⚠ THE CLAIM IS ABOUT WHEN THE NUMBER WAS TAKEN, NOT ABOUT THE FINAL STATE (#574).
 * This asserted that no node ends past Layer 0's vapour ceiling. On the 5 cm2 ride the
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
