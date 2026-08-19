/* run_pwr2_loca.js — Layer 5 JOINT gate: break -> containment, and ECCS answering the break. (#479)
 *
 * Five Layer 5 systems this session — break, containment, ECCS, plus the earlier turbine/relief/
 * condenser chain — were each gated ALONE. Nothing had ever driven break + containment + ECCS
 * TOGETHER: no test required `mergeSources()` to exist, fed the break's own enthalpy into
 * containment's driver shape, or watched ECCS respond to a pressure the break itself produced.
 * This is that scenario — the coupling `pwr2_break.js` was built to be the keystone for.
 *
 * ⚠ NO loadFrom / MUTATIONS HARNESS HERE, and that is a deliberate departure from the house
 * pattern, not an omission. The library code this scenario exercises — `pwr2_break.js`,
 * `pwr2_containment.js`, `pwr2_eccs.js`, `pwr2_sources.js` — is ALREADY under its own gate with
 * its own injection self-test; `mergeSources()` specifically has one in `run_pwr2_sources.js`. The
 * only code that is NEW here is the wiring itself, and it lives in this file's `scenario()`, not in
 * a library `SRC` string a mutation harness could patch. So this gate's defence is a TIGHT
 * QUANTITATIVE CLOSURE instead: mass leaving the primary must equal mass reported by containment
 * to within floating-point precision, not a tolerance band — a sign error, a dropped term, or a
 * double-count in the wiring would show up as a real mismatch, not as a check that merely fails to
 * assert one.
 *
 * THE CHEAPEST CHECK THAT WOULD CATCH A WIRING BUG: mass bookkeeping.
 *   primary lost   = M_total_initial - M_total_final              (Layer 3, moved only by sources)
 *   containment got = ctm.mass_in_kg                                (containment's own ledger)
 * With ECCS off these must be EQUAL. With ECCS on, ECCS adds mass to the PRIMARY only — never to
 * containment — so (primary lost + ECCS injected) must equal (break discharged), and containment's
 * ledger must still equal break-discharged EXACTLY, unmoved by whatever the primary side is doing.
 *
 * Run: node test/run_pwr2_loca.js
 */
'use strict';
var path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_sources',
 'pwr2_break', 'pwr2_containment', 'pwr2_eccs', 'pwr2_pressurizer'].forEach(function (f) {
  require(path.join(E, f + '.js'));
});
var RD = globalThis.RD.pwr2, W = RD.water, S = RD.sources, PZ = RD.pressurizer;
var DT = 0.02;

/* scenario(opts) -> runs break (+ optionally ECCS lined up from t=0) into containment for
 * `opts.steps` steps at DT, and returns everything a check needs. ECCS lineup is set BEFORE the
 * loop starts and never touched again -- "when to inject" is a control-layer decision (HR5,
 * pwr2_eccs.js's own header); this test plays that role ONCE, at t=0, and then only watches. */
function scenario(opts) {
  opts = opts || {};
  /* Pressurized fixture (stage 1, 2026-08-18 "Option 1"): the mass-ledger identities this gate
   * asserts are IDENTITIES — they hold whatever the inventory is — so the vessel changes the
   * numbers, not the claims. Its relief never fires in a blowdown; stepped for fidelity. */
  var pz  = PZ.createPressurizer({});
  var sys = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41, extraMass: PZ.extraMassFn(pz) });
  var brk = RD.break_.createBreak({ area_m2: opts.area_m2 || 0.001, cd: 1.0,
                                    node: 'cold_leg', open: true });
  var ctm = RD.containment.createContainment({});
  var ecc = RD.eccs.createECCS({ hhsiRunning: !!opts.eccsLinedUp, lhsiRunning: !!opts.eccsLinedUp });
  var M0 = sys.M_total, courantBad = 0, eccsStartedAt = null, injected = 0;
  var steps = opts.steps || 3000, t = 0, lastR = null, lastCt = null, lastEc = null;
  for (var i = 0; i < steps; i++) {
    var br = RD.break_.stepBreak(brk, sys, DT, {});
    var ec = RD.eccs.stepECCS(ecc, sys, DT);
    var merged = S.mergeSources([br.source], ec.sources);
    var r = S.stepPlant(sys, DT, { sources: merged });
    PZ.stepPressurizer(pz, sys, DT, {});
    var ct = RD.containment.stepContainment(ctm, DT,
      br.mdot_kgs > 0 ? { mdot_kgs: br.mdot_kgs, h_kJkg: br.source.h } : { mdot_kgs: 0 });
    if (!r.courantOK) courantBad++;
    if (eccsStartedAt === null && ec.total_kgs > 0) eccsStartedAt = t;
    injected += ec.total_kgs * DT;
    t += DT;
    lastR = r; lastCt = ct; lastEc = ec;
  }
  return { sys: sys, M0: M0, M1: sys.M_total, brk: brk, ctm: ctm, courantBad: courantBad,
           steps: steps, eccsStartedAt: eccsStartedAt, injected: injected,
           lastR: lastR, lastCt: lastCt, lastEc: lastEc };
}

function runSuite(rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(60) +
      'got ' + got.toFixed(4) + ' want ' + want.toFixed(4) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }

  var N = quiet ? 500 : 3000;      /* quiet is unused today (no mutation replay) but kept for shape */

  /* ---- 1. MASS BALANCE, ECCS OFF -- the tightest check this gate has --------------------- */
  head('MASS BALANCE  [break discharge == containment receipt, ECCS silent]');
  var a = scenario({ steps: N, eccsLinedUp: false });
  var lost = a.M0 - a.M1;
  ckT('the primary actually lost mass', lost > 100, lost.toFixed(1) + ' kg over ' +
      (N * DT).toFixed(0) + ' s');
  ck('primary loss equals the break\'s own discharged_kg ledger', lost, a.brk.discharged_kg,
     1e-6 * lost, 'kg');
  ck('containment received EXACTLY what the break discharged',
     a.ctm.mass_in_kg, a.brk.discharged_kg, 1e-6 * a.brk.discharged_kg, 'kg');
  ckT('containment pressure ROSE from its sourced initial condition',
      a.lastCt.containment_pressure_mpa > 0.11, a.lastCt.containment_pressure_mpa.toFixed(4) +
      ' MPa, from 0.1082 MPa (125 degF / 1.0 psig)');
  ckT('containment temperature ROSE too', a.lastCt.containment_temp_c > 55,
      a.lastCt.containment_temp_c.toFixed(1) + ' degC, from 51.7 degC');
  ckT('ECCS, never lined up, delivered nothing', a.eccsStartedAt === null && a.injected === 0, '');

  /* ---- 2. ECCS ANSWERS THE BREAK -- lined up from t=0, gated by PHYSICS not a timer --------- */
  head('ECCS ANSWERS THE BREAK  [lined up throughout; the SHUTOFF HEAD decides when it flows]');
  var b = scenario({ steps: N, eccsLinedUp: true });
  ckT('ECCS delivered NOTHING while the RCS sat above both shutoff heads',
      b.eccsStartedAt !== null && b.eccsStartedAt > 0.3,
      'started at t=' + (b.eccsStartedAt === null ? 'never' : b.eccsStartedAt.toFixed(2) + ' s') +
      ' -- HHSI shutoff is 9.58 MPa, and the plant starts at 15.41');
  /* ⚠ RE-BANDED 3.0 -> 30 s WITH THE FIXTURE, 2026-08-19, and the direction is the physics:
   * the rigid plant fell below the 9.58 MPa HHSI head in under 3 s because nothing resisted
   * the depressurisation; the pressurizer now OUTSURGES against it and holds the plant up for
   * 12.0 s (measured) before the head clears — which is precisely the SI-delay role the vessel
   * plays in a real medium-break. The lower bound above (> 0.3 s) still rejects an ECCS that
   * ignores the shutoff head entirely; this bound still rejects one that never starts. */
  ckT('...and DID deliver once the break brought pressure below the HHSI shutoff head',
      b.eccsStartedAt !== null && b.eccsStartedAt < 30.0,
      'started ' + b.eccsStartedAt.toFixed(2) + ' s -- 12.0 s measured with the vessel ' +
      'fighting the blowdown, <3 s on the rigid plant');
  ckT('the plant is BELOW the HHSI shutoff head by the time ECCS starts',
      b.sys.P < 9.58 || b.eccsStartedAt === null, 'final P ' + b.sys.P.toFixed(3) + ' MPa');

  /* ---- 3. MASS BALANCE STILL CLOSES WITH BOTH STREAMS LIVE ----------------------------------
   * ECCS adds mass to the PRIMARY only; containment cannot see it. If mergeSources() or the
   * wiring here dropped a term, lost a sign, or double-counted, this is where it would show: the
   * net primary change must equal discharge minus injection, and containment's ledger must be
   * COMPLETELY UNMOVED by whatever the primary side received. */
  head('MASS BALANCE HOLDS WITH BOTH STREAMS LIVE  [the check a wiring bug could not pass]');
  var lostB = b.M0 - b.M1;
  ck('primary net change = discharged MINUS injected',
     lostB, b.brk.discharged_kg - b.injected, 1e-4 * b.brk.discharged_kg, 'kg');
  ck('containment STILL received exactly the break\'s discharge -- ECCS is invisible to it',
     b.ctm.mass_in_kg, b.brk.discharged_kg, 1e-6 * b.brk.discharged_kg, 'kg');
  ckT('ECCS actually injected something worth checking', b.injected > 10,
      b.injected.toFixed(1) + ' kg returned to the primary');

  /* ---- 4. THE COURANT LIMIT HOLDS AT THE HOUSE dt = 0.02 s ----------------------------------
   * The performance constraint: no substep machinery was added to guarantee this. A break moves
   * mass fast, but courantLimit() binds on the MAIN LOOP flow through the smallest ring node, not
   * on break flow directly -- so the existing cadence should already be sufficient, and this is
   * the check that would say otherwise if it were not. */
  head('COURANT LIMIT  [proving dt = 0.02 s is enough, not adding a substep to guarantee it]');
  ckT('scenario A (ECCS off) never violated the Courant limit', a.courantBad === 0,
      a.courantBad + ' / ' + a.steps + ' steps over limit');
  ckT('scenario B (ECCS live) never violated it either', b.courantBad === 0,
      b.courantBad + ' / ' + b.steps + ' steps over limit');
}

console.log('\nPWR2 Layer 5 -- JOINT SCENARIO: break -> containment, ECCS answering');
var rec = [];
runSuite(rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;
console.log('\n' + '='.repeat(70));
console.log('  run_pwr2_loca: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit(fail > 0 ? 1 : 0);
