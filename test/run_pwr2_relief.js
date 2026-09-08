/* run_pwr2_relief.js — Layer 5 gate: secondary relief. (#479)
 *
 * THE THING MOST AT RISK IN THIS FILE IS THE LATCH, not the setpoints.
 *
 * A safety valve that opens on `P >= pop` and closes on `P < pop` is one character different from
 * a correct one and behaves completely differently: it chatters at the setpoint, passing a
 * time-average of its capacity instead of lifting cleanly, and the secondary rings. That failure
 * looks like noisy physics rather than a bug — the plant still balances, the pressure still gets
 * relieved, and the only tell is a valve that opens and shuts every timestep. So the gate walks
 * the pressure UP THROUGH the setpoint AND BACK DOWN, and requires the valve to still be open
 * between the reseat point and the pop point on the way down. Nothing else can distinguish a
 * latched valve from a stateless one.
 *
 * ⚠ AND ONE THING THIS GATE MUST NOT DO: check that the dump opens. It has no opinion about when
 * the dump should open — that is a control-layer decision by owner ruling, and a check asserting a
 * dump position would be this gate reaching into the layer above. What it checks instead is that a
 * COMMANDED position produces the sourced flow, and that the layer computes no position of its own.
 *
 * Run: node test/run_pwr2_relief.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var MUT = require('./mut_flags.js');   /* --no-mutations / --mut= / --grp= (#602) */
/* pwr2_water is loaded ONLY for the ADV's 4%-of-RTP cross-check (h_fg at the setpoint) --
 * relief itself carries fractions and needs no properties, which the sandbox loader preserves. */
require(path.join(__dirname, '..', 'engines', 'pwr2', 'pwr2_water.js'));
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_relief.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');

function loadFrom(src) {
  var root = { RD: { pwr2: {} } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.relief;';
  return new Function('RD_ROOT', body)(root);
}

/* THE SOURCES, RETYPED INDEPENDENTLY of the engine's copy — the ECCS discipline.
 *   Ginna TS Bases (ML20339A221): MSSVs hold secondary at "approximately 1085 psig"
 *   Ginna UFSAR ch10 §10.4 (ML20339A040): eight dump valves passing "approximately 28% rated
 *   steam flow"
 *   Ginna UFSAR ch10 §10.3.2.4 (ML20339A040), the STAGGERED BANK (#542): "There are four main
 *   steam safety valves (MSSV) for each steam line. The first valve lifts at 1085 psig and the
 *   remaining three valves are set to lift at 1140 psig. The minimum total relieving capacity
 *   is 6.58 x 10^6 lbm/hr" — and the same chapter's equipment table: "797,689: two valves at
 *   1085 psig +3% accumulation / 837,600: six valves at 1140 psig +3% accumulation" (eight
 *   valves = four per line; this single-loop plant carries one line's worth).  */
var DOC = { safety_pop_psig: 1085.0, dump_frac: 0.28, safety_flow_frac: 0.84, blowdown: 0.033,
            stage2_psig: 1140.0, accum: 0.03,
            stage1_lbhr: 797689.0, stage2_lbhr: 3 * 837600.0,
            /* §10.3.2.4's own total, for BOTH steam lines */
            bank_total_lbhr: 6.58e6,
            /* (#643) THE TWO DENOMINATORS THAT SAY WHAT `safety_flow_frac` IS AND IS NOT.
             * Retyped independently of the engine, like everything else in this block.
             *   UFSAR ch15 Table 15.0-1 note b, verbatim: "If a high steam pressure is more
             *     limiting for analysis purposes, a greater steam pressure of 855 psia, steam
             *     temperature of 525.9F, and steam flow of 7.92 x 106 lb/hr total should be
             *     assumed. This envelopes the possibility that the steam generator could
             *     perform better than expected." — Ginna's POST-UPRATE (1775 MWt) flow, and an
             *     envelope of it. This is the denominator 0.84 came from.
             *   UFSAR ch10 equipment table, MSIV row, verbatim: "Flow design capacity, lb/hr
             *     3.29 x 106 at 770 psia" — ONE steam line's design flow. Twice it is
             *     §10.3.2.4's own 6.58e6 bank total, which that section calls "equal to the
             *     full load steam flow for the original 1520 MWt licensed power level". This
             *     is the denominator the DESIGN BASIS uses. */
            ginna_uprate_total_lbhr: 7.92e6,
            ginna_design_line_lbhr:  3.29e6,
            ginna_mwt: 1520.0,             /* §10.3.2.4's "original 1520 MWt licensed power" */
            plant_mwt: 300.0,              /* this plant's rated thermal power (D4 §21.2) */
            lbhr_per_kgs: 3600 * 2.2046226,
            /* THE QUOTED-AT PRESSURES (#633), from the SAME ch10 equipment table, verbatim:
             *   "Atmospheric steam dump valves ... Capacity (each), lb/hr  329,000 at 1005 psig
             *    (normal)"
             *   "Main steam safety valves ... 797,689: two valves at 1085 psig +3% accumulation /
             *    837,600: six valves at 1140 psig +3% accumulation"
             * A capacity is never a bare mass flow, and every one of these carries its pressure.
             * Retyped independently of the engine's copy, like everything else in this block. */
            adv_ref_psig: 1005.0,
            /* the dumps' reference is this plant's RATED steam pressure — §10.4's "28% rated
             * steam flow" is a statement about the load they stand in for, so it means 28 % AT
             * rated conditions. pwr2_sg.js owns the number; the cross-check below reads it from
             * that module rather than retyping it here, which is the whole point. */
            atm_psia: 14.6959488,          /* standard atmosphere, 0.101325 MPa */
            xt: 0.70, fgamma: 1.30 / 1.40 };
var RATED = 164.25;      /* kg/s — this plant's rated steam flow (D4 §21.2, §22.2) */
var ATM_MPA = 0.101325;  /* standard atmosphere, where the ADV and the MSSVs discharge */

/* THE #633 MODEL, RE-DERIVED HERE FROM THE STANDARD rather than imported from the engine —
 * the same discipline as DOC above. A check that calls the function under test to compute
 * what it expects can only prove the function equals itself (HR10).
 *
 * IEC 60534-2-1 / ISA-75.01: W is proportional to Y*sqrt(x*P1*rho1) with x = (P1-P2)/P1 and
 * Y = 1 - x/(3*F_g*x_T), x limited at the choked value F_g*x_T where Y bottoms out at 2/3.
 * Saturated steam has rho1 roughly proportional to P1, so the form collapses to Y*sqrt(x)*P1,
 * which at choked is W proportional to P1 — Napier. Normalized to 1.0 choked at P_ref. */
function docFactor(P1, P2, Pref) {
  var xc = DOC.fgamma * DOC.xt;
  var x = (P1 - P2) / P1;
  if (!(P1 > 0) || !(x > 0)) return 0;
  if (x > xc) x = xc;
  var Y = 1 - x / (3 * DOC.fgamma * DOC.xt);
  var Yc = 1 - xc / (3 * DOC.fgamma * DOC.xt);
  return (Y * Math.sqrt(x) * P1) / (Yc * Math.sqrt(xc) * Pref);
}

function runSuite(R, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(58) +
      'got ' + got.toFixed(4) + ' want ' + want.toFixed(4) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }
  function step(rl, P, d) {
    return R.stepRelief(rl, P, 1, Object.assign({ rated_steam_kgs: RATED }, d || {}));
  }

  /* ---- CONSTRUCTION, WRITTEN FIRST (D1 §31) ---------------------------------------------- */
  head('CONSTRUCTION  [a caller argument that never arrives is invisible to a physics check]');
  ckT('caller safety state reaches the plant', R.createRelief({ safety_open: true }).safety_open === true, '');
  ck('caller relieved total reaches the plant', R.createRelief({ relieved_kg: 55 }).relieved_kg,
     55, 1e-12, 'kg');
  ckT('the default lineup is SHUT and unlifted',
      R.createRelief({}).safety_open === false && R.createRelief({}).relieved_kg === 0,
      'a default of lifted would make every probe that omits it relieve a plant nobody overpressured');

  /* ---- SOURCED CONSTANTS ------------------------------------------------------------------ */
  head('SOURCED  [Ginna, this plant\'s own anchor -- except the safety SCALE, see #643 below]');
  ck('the safety pop setpoint matches the source', R.RELIEF.safety_pop_psig, DOC.safety_pop_psig,
     1e-12, 'psig');
  ck('...and its MPa form is DERIVED from the psig figure, not typed beside it',
     R.RELIEF.safety_pop_mpa, (DOC.safety_pop_psig + 14.7) / R.PSI_PER_MPA, 1e-12, 'MPa');
  ck('the dump capacity matches the source', R.RELIEF.dump_capacity_frac, DOC.dump_frac,
     1e-12, 'frac');
  ck('the safety full-lift SCALE is the one this plant ships (see #643 PROVENANCE below)',
     R.RELIEF.safety_flow_frac, DOC.safety_flow_frac, 1e-12, 'frac');
  ck('the blowdown fraction is the derived valve-class figure', R.RELIEF.safety_blowdown,
     DOC.blowdown, 1e-12, '');
  ckT('the pop setpoint is ABOVE this plant\'s no-load secondary pressure',
      R.RELIEF.safety_pop_mpa > 7.03,
      R.RELIEF.safety_pop_mpa.toFixed(3) + ' MPa against Ginna no-load 7.03 — a safety that lifted ' +
      'below no-load would be open at every hot shutdown');

  /* ---- #643 PROVENANCE --------------------------------------------------------------------
   * `safety_flow_frac` wore a [sourced] marker until 2026-09-08 and NO DOCUMENT CARRIES IT:
   * `node tools/find_source.js '0\.84|84 ?%'` returns 3 hits across 39 documents in 3 lanes,
   * all digits inside unrelated tables. The check that used to stand here was called "the
   * safety full-lift capacity matches the source" and compared the engine's 0.84 against a
   * 0.84 retyped in DOC — the number agreeing with itself. It could never name WHICH source,
   * and it is why #542's evidence pass verdicted the ARRANGEMENT and inherited the FIGURE:
   * the #380 template-placeholder trap, second instance.
   *
   * These two make both halves of the engine comment FALSIFIABLE — what the number is, and
   * what the source's own rule gives instead.
   *
   * ⚠ THE SECOND CHECK REDDENS THE DAY THE CONSTANT IS CORRECTED, AND THAT IS ITS JOB. It
   * pins a KNOWN, MEASURED GAP, the way a strict xfail does. Whoever moves the constant
   * rewrites these two checks AND the comment above the constant in the same change — which
   * is the only arrangement that stops a fourth pass inheriting the figure again. */
  head('#643 PROVENANCE  [what the number IS, and what the source says it is NOT]');
  var lineBank = DOC.stage1_lbhr + DOC.stage2_lbhr;         /* 3,310,489 lb/hr, one steam line */
  ck('the shipped scale is GINNA POST-UPRATE arithmetic, not a design-basis figure',
     R.RELIEF.safety_flow_frac, lineBank / (DOC.ginna_uprate_total_lbhr / 2), 0.005, 'frac');
  ckT("...and the SOURCE'S OWN sizing rule gives ~100 % of design flow, which this plant does " +
      'NOT carry — the tracked gap (#643)', (function () {
        /* ROUTE 1 — one line's bank over one line's DESIGN flow (ch10's MSIV row). */
        var routeDesign = lineBank / DOC.ginna_design_line_lbhr;
        /* ROUTE 2 — the whole bank power-scaled to this plant, over this plant's own rated
         * steam flow. INDEPENDENT of route 1: it uses this plant's Layer-0 enthalpy rise and
         * the power ratio, not Ginna's stated flow at all. Two routes landing together is
         * evidence; the whole-bank-over-6.58e6 route is NOT used here because 2 x 3.29e6 IS
         * 6.58e6, so it would be route 1 wearing a different name. */
        var routePower = 2 * lineBank * (DOC.plant_mwt / DOC.ginna_mwt) /
                         (RATED * DOC.lbhr_per_kgs);
        return Math.abs(routeDesign - routePower) < 0.01 &&
               routeDesign > 1.0 && routeDesign < 1.02 &&
               R.RELIEF.safety_flow_frac < routeDesign - 0.10;
      })(),
      'the design-flow route gives ' + (lineBank / DOC.ginna_design_line_lbhr).toFixed(4) +
      ' and the power-scaled route ' +
      (2 * lineBank * (DOC.plant_mwt / DOC.ginna_mwt) / (RATED * DOC.lbhr_per_kgs)).toFixed(4) +
      ', against the shipped ' + R.RELIEF.safety_flow_frac.toFixed(4) +
      ' — B 3.7.1: "limit the secondary system pressure to <= 110% of design pressure when ' +
      'passing 100% of design steam flow"');

  /* ---- THE LATCH. The load-bearing check in this file. ------------------------------------- */
  head('THE LATCH  [a stateless valve chatters, and chattering looks like noisy physics]');
  var pop = R.RELIEF.safety_pop_mpa, reseat = R.safetyReseatMpa();
  ckT('reseat sits BELOW pop by the blowdown fraction',
      Math.abs(reseat - pop * (1 - DOC.blowdown)) < 1e-12 && reseat < pop,
      pop.toFixed(4) + ' -> ' + reseat.toFixed(4) + ' MPa');
  var rl = R.createRelief({});
  ckT('below the setpoint it stays shut', step(rl, pop - 0.01).safety_kgs === 0, '');
  ckT('at the setpoint it lifts', step(rl, pop + 0.001).safety_open === true, '');
  /* THE ONE THAT MATTERS: on the way DOWN, between reseat and pop, a latched valve is still open
   * and a stateless one has already shut. */
  var mid = (pop + reseat) / 2;
  ckT('...and STAYS open between reseat and pop on the way down', (function () {
        var o = step(rl, mid);
        return o.safety_open === true && o.safety_kgs > 0;
      })(), 'a stateless "open if P >= pop" valve is SHUT here — this is the only check that ' +
            'separates them, and the difference is chatter at the setpoint');
  ckT('it reseats only once pressure falls through the blowdown point',
      step(rl, reseat - 0.001).safety_open === false, '');
  ckT('...and having reseated, it does NOT re-open at the same mid pressure',
      step(rl, mid).safety_open === false,
      'the hysteresis works in both directions, or it is not hysteresis');

  /* ---- THE STAGGERED BANK (#542) -----------------------------------------------------------
   * ⚠ THE CHECK THAT USED TO LIVE HERE COULD NEVER FAIL. It asserted "flow RAMPS between first
   * lift and full lift, it does not step" while sampling at reseat+0.05 MPa (1056.0 psig) and
   * reseat+0.20 MPa (1078.0 psig) — BOTH BELOW the 1085 psig pop. The ramp it was walking was
   * the part of the ramp that lay below the setpoint, which is the defect, not the claim: the
   * bank stepped from shut to 60.05 % of rated in ONE 0.02 s step at the pop and this gate saw
   * green (HR10). Every check below is anchored on the POP or on a stage setpoint, never on the
   * reseat, and each one was run against the pre-#542 source and confirmed RED. */
  var PSI = R.PSI_PER_MPA;
  function mpaOf(psig) { return (psig + 14.7) / PSI; }
  var S1 = R.SAFETY_STAGES[0], S2 = R.SAFETY_STAGES[1];
  var s1Full = mpaOf(DOC.safety_pop_psig * (1 + DOC.accum));    /* 1117.6 psig */
  var s2Full = mpaOf(DOC.stage2_psig     * (1 + DOC.accum));    /* 1174.2 psig */
  var share1 = DOC.stage1_lbhr / (DOC.stage1_lbhr + DOC.stage2_lbhr);

  head('THE SOURCED STAGGER  [one valve at 1085, three at 1140 — §10.3.2.4, not a lumped band]');
  ckT('the bank has exactly the TWO stages the source describes', R.SAFETY_STAGES.length === 2, '');
  ck('stage 1 lifts at the sourced first-lift setpoint', S1.set_mpa * PSI - 14.7,
     DOC.safety_pop_psig, 1e-9, 'psig');
  ck('stage 2 lifts at the sourced 1140 psig', S2.set_mpa * PSI - 14.7, DOC.stage2_psig,
     1e-9, 'psig');
  ck('stage 1 carries its sourced share of bank capacity', S1.share, share1, 1e-9, 'frac');
  ck('...and stage 2 the rest', S2.share, 1 - share1, 1e-9, 'frac');
  ck('each stage reaches FULL lift at its own sourced +3 % accumulation',
     (S2.set_mpa + S2.band_mpa) * PSI - 14.7, DOC.stage2_psig * (1 + DOC.accum), 1e-9, 'psig');
  ckT("the source's OWN capacity cross-check lands", (function () {
        /* both steam lines, against §10.3.2.4's stated 6.58e6 lbm/hr total */
        var both = 2 * (DOC.stage1_lbhr + DOC.stage2_lbhr);
        return Math.abs(both - DOC.bank_total_lbhr) / DOC.bank_total_lbhr < 0.01;
      })(), '2 x (797,689 + 3 x 837,600) = 6,620,978 lb/hr against the stated 6.58e6 — 0.6 % apart');
  ckT('...and so does the DESIGN BASIS — full bank lift under 110 % of the first-lift setpoint',
      (s2Full * PSI - 14.7) <= 1.10 * DOC.safety_pop_psig,
      (s2Full * PSI - 14.7).toFixed(1) + ' psig against ' + (1.10 * DOC.safety_pop_psig).toFixed(1) +
      ' — B 3.7.1: "limit the secondary system to <= 110% of design pressure"');

  /* ---- SAFETY FLOW ------------------------------------------------------------------------- */
  head('SAFETY FLOW  [the ramp lives ABOVE the pop, and there is no step at the pop]');
  /* THE BANK'S EXPECTED FLOW AT A PRESSURE, from the sourced shares AND the sourced quoted-at
   * pressures (#633). Each stage's lb/hr is quoted at its OWN set pressure + 3 % accumulation,
   * so a bank at full lift only passes exactly 0.84 x rated when every stage sits at its own
   * reference — which cannot happen at one pressure with staggered setpoints. Before #633 this
   * file asserted 0.84 x rated at 1246.7 psig, a pressure 130 psi above stage 1's quoted
   * condition; it read 148.15 kg/s, and 148.15 is what Napier says a bank there should pass. */
  function bankFlow(P_mpa, lifts) {
    var sum = 0;
    for (var i = 0; i < 2; i++) {
      var refP = (DOC[i ? 'stage2_psig' : 'safety_pop_psig'] * (1 + DOC.accum) + 14.7) / PSI;
      var share = (i ? DOC.stage2_lbhr : DOC.stage1_lbhr) / (DOC.stage1_lbhr + DOC.stage2_lbhr);
      sum += lifts[i] * share * docFactor(P_mpa, ATM_MPA, refP);
    }
    return sum * DOC.safety_flow_frac * RATED;
  }
  var rl2 = R.createRelief({});
  step(rl2, pop + 0.001);                                       /* lift it */
  ck('a stage AT ITS OWN QUOTED PRESSURE passes exactly its sourced share of capacity (#633)',
     step(R.createRelief({}), s1Full).safety_kgs,
     (DOC.stage1_lbhr / (DOC.stage1_lbhr + DOC.stage2_lbhr)) * DOC.safety_flow_frac * RATED,
     1e-9, 'kg/s');
  var full = step(rl2, s2Full + 0.5);
  ck('at full lift it passes the sourced capacity SCALED to the pressure it is at',
     full.safety_kgs, bankFlow(s2Full + 0.5, [1, 1]), 1e-9, 'kg/s');
  /* ⚠ THE CHECK THIS REPLACED SAID "it CLAMPS there rather than growing without bound" AND
   * READ THE FLOW. That was only ever an assertion about the LIFT — and it could make it
   * through the flow because flow was pressure-independent, which is #633's whole defect.
   * Split: the LIFT clamps at 1, and the flow above the reference grows LINEARLY with
   * absolute pressure (Napier), which is what a fixed opening does and is not "unbounded". */
  ckT('...the LIFT clamps at 1 — 20 MPa passes the Napier flow, not a multiple of it',
      Math.abs(step(rl2, 20).safety_kgs - bankFlow(20, [1, 1])) < 1e-9,
      'at 20 MPa it passes ' + step(rl2, 20).safety_kgs.toFixed(2) + ' kg/s; without the lift ' +
      'clamp the same pressure would multiply that again by the lift ramp');
  ckT('...and the flow ABOVE the reference is Napier-LINEAR in absolute pressure (#633)',
      (function () {
        var a = step(rl2, 8.0).safety_kgs, b = step(rl2, 16.0).safety_kgs;
        return a > 0 && Math.abs(b / a - 2.0) < 1e-9;
      })(),
      'both stages choked and at full lift, so doubling P must double the flow exactly — the ' +
      'shape a check that only samples endpoints cannot tell from a lookup table');
  ckT('...and full lift needs the SOURCED 1174.2 psig, not one stage-width above the pop',
      Math.abs(step(R.createRelief({}), s2Full).safety_kgs - bankFlow(s2Full, [1, 1])) < 1e-9 &&
      step(R.createRelief({}), s2Full - 1 / PSI).safety_kgs < bankFlow(s2Full, [1, 1]),
      'a bank at full flow BELOW its top valves\' accumulation is a bank that never staggered');

  /* THE #542 CHECK. A fresh bank walked up through the pop in 0.1 psi steps: nothing below the
   * setpoint, and no single sample allowed to jump. Pre-#542 the first sample AT the pop read
   * 60.05 % of rated out of a shut valve. */
  ckT('NOTHING passes below the first-lift setpoint, and the pop is not a STEP', (function () {
        var r = R.createRelief({}), worst = 0, below = 0, prev = 0;
        for (var p = DOC.safety_pop_psig - 5; p <= DOC.safety_pop_psig + 5; p += 0.1) {
          var o = step(r, mpaOf(p));
          if (p < DOC.safety_pop_psig - 1e-9 && o.safety_kgs > 0) below++;
          var d = Math.abs(o.safety_kgs - prev);
          if (d > worst) worst = d;
          prev = o.safety_kgs;
        }
        return below === 0 && worst < 0.02 * RATED;
      })(), 'pre-#542 this walk read 98.63 kg/s = 60.05 % of rated in the FIRST sample at the ' +
            'pop, out of a valve that was shut 0.1 psi earlier');

  /* THE OTHER HALF OF #542, and the one that makes the park impossible rather than merely
   * relocating it: while a stage is latched BELOW its own setpoint, its flow is a constant. */
  /* ⚠ #633 NARROWED THIS CLAIM AND THE NARROWING IS THE POINT. It used to assert that a latched
   * stage passes a literally CONSTANT flow below its setpoint. That was two claims wearing one
   * coat: the LIFT is constant (the ratchet, #542's actual mechanism) and the DENSITY is
   * constant (which is #633's defect — the steam through a fixed opening thins with pressure).
   * The first is what abolishes the park; the second was never true of any valve. So: the LIFT
   * is held, and the flow droop across the WHOLE blowdown band is small enough that no
   * equilibrium can hide in it. MEASURED at the layer, a bottled SG with relief the only path
   * out, production swept 5-80 % of rated for a sim hour: the bank settles ABOVE its setpoint
   * in every row, both before and after #633, to within 0.5 psi. */
  ckT('a latched stage HOLDS ITS LIFT below its setpoint — the ratchet, unchanged by #633',
      (function () {
        var r = R.createRelief({});
        step(r, s1Full + 0.01);                       /* stage 1 ratcheted to full lift */
        var a = step(r, mpaOf(1080));                 /* both inside stage 1's blowdown band */
        var b = step(r, mpaOf(1055));
        return a.safety_kgs > 0 && a.safety_stages[0].lift === 1 && b.safety_stages[0].lift === 1;
      })(), 'a pop valve does not modulate back down; pre-#542 the LIFT tracked pressure all the ' +
            'way to reseat, so the bank settled wherever relief met production — measured, ' +
            '24.2 % of rated at 1063.3 psig, 21 psi BELOW the setpoint, for an hour with 0 reseats');
  ckT('...and the flow droop across the whole blowdown band is under 7 %, so nothing parks in it',
      (function () {
        var r = R.createRelief({});
        step(r, s1Full + 0.01);
        var hi = step(r, R.RELIEF.safety_pop_mpa).safety_kgs;
        var lo = step(r, R.SAFETY_STAGES[0].reseat_mpa + 1e-6).safety_kgs;
        return lo > 0 && hi > lo && (hi - lo) / hi < 0.07;
      })(), 'the band is 3.3 % wide and flow is linear in pressure, so the bank passes 93.9-97.1 % ' +
            'of its quoted capacity across it — against the 24.2 %-vs-60.2 % swing pre-#542');

  ckT('stage 2 lifts ONLY above its own 1140 psig setpoint, and reseats on its OWN blowdown',
      (function () {
        var r = R.createRelief({});
        var mid  = step(r, mpaOf(1130));                          /* stage 1 only */
        var both = step(r, mpaOf(1150));                          /* stage 2 in as well */
        var held = step(r, mpaOf(1105));                          /* above stage 2's reseat */
        var shut = step(r, mpaOf(1095));                          /* below it */
        return mid.safety_stages[1].open === false &&
               both.safety_stages[1].open === true &&
               held.safety_stages[1].open === true &&
               shut.safety_stages[1].open === false &&
               shut.safety_stages[0].open === true &&
               shut.safety_kgs > 0;
      })(), 'stage 2 reseats at ' + (S2.reseat_mpa * PSI - 14.7).toFixed(1) + ' psig while stage 1 ' +
            'stays open to ' + (S1.reseat_mpa * PSI - 14.7).toFixed(1) + ' — the staircase a ' +
            'single lumped latch cannot express');

  /* ---- THE SAVE MIGRATION (#542) -----------------------------------------------------------
   * pwr2_shell saves `rl` wholesale and restores it wholesale, so a save written before the
   * staggered bank carries `safety_open` and NO `stages`. Nothing else in the tree reads an old
   * relief payload, so this gate is the only thing that can hold the migration. The injection
   * self-test found this section missing: the "migrates to a SHUT bank" mutation was BLIND. */
  head('THE SAVE MIGRATION  [a pre-stagger save carries a flag and no stages]');
  ckT('a legacy LIFTED save comes back passing stage 1\'s full flow, not nothing', (function () {
        var legacy = { safety_open: true, relieved_kg: 0 };     /* no `stages` key at all */
        var o = step(legacy, mpaOf(1060));                      /* inside stage 1's blowdown band */
        return o.safety_open === true &&
               Math.abs(o.safety_kgs - bankFlow(mpaOf(1060), [1, 0])) < 1e-9;
      })(), 'the old model passed flow whenever that flag was set; landing on a shut bank would ' +
            'silently drop a relief path mid-transient');
  ckT('...and a legacy SHUT save comes back shut, which is the pre-#542 plant exactly',
      (function () {
        var legacy = { safety_open: false, relieved_kg: 0 };
        var o = step(legacy, mpaOf(1060));
        return o.safety_open === false && o.safety_kgs === 0;
      })(), '');

  /* ---- THE DUMP: HYDRAULICS ONLY ----------------------------------------------------------- */
  head('THE DUMP  [hydraulics here; the POSITION is the control layer\'s, by ruling]');
  var rl3 = R.createRelief({});
  /* ⚠ EVERY CHECK IN THIS SECTION USED TO SAMPLE AT AN ARBITRARY 6.0 MPa and expect the flat
   * 28 % of rated. 6.0 MPa is not this plant's rated steam pressure, so the number they were
   * asserting was only right because flow was pressure-independent (#633). They now sample at
   * the pressure the 28 % is QUOTED at, where the factor is 1.0 by construction. */
  var DREF = R.RELIEF.dump_ref_mpa;
  ck('a fully commanded dump passes the sourced 28 % of rated AT ITS QUOTED PRESSURE',
     step(rl3, DREF, { dump_demand: 1.0 }).dump_kgs, DOC.dump_frac * RATED, 1e-9, 'kg/s');
  ck('half a command passes half of that',
     step(rl3, DREF, { dump_demand: 0.5 }).dump_kgs, 0.5 * DOC.dump_frac * RATED, 1e-9, 'kg/s');
  ckT('no command means no dump flow', step(rl3, DREF, {}).dump_kgs === 0,
      'this layer has no setpoint and no Tavg error — it opens nothing on its own');
  ckT('the dump does not open itself at ANY pressure', (function () {
        var any = false;
        for (var P = 4; P <= 12; P += 0.25) if (step(R.createRelief({}), P, {}).dump_kgs > 0) any = true;
        return !any;
      })(), 'swept 4-12 MPa with no command: a layer that opened its own dump would be deciding a ' +
            'position, which is the control layer\'s job');
  ckT('a command outside 0..1 is clamped, not trusted',
      step(rl3, DREF, { dump_demand: 5 }).dump_kgs === DOC.dump_frac * RATED &&
      step(rl3, DREF, { dump_demand: -2 }).dump_kgs === 0, '');

  /* ---- CONDENSER AVAILABILITY -------------------------------------------------------------- */
  head('THE CONDENSER  [the dump discharges to it, so losing it removes the path]');
  ckT('with no condenser a commanded dump passes nothing',
      step(R.createRelief({}), 6.0, { dump_demand: 1.0, condenser_available: false }).dump_kgs === 0, '');
  ckT('...but the COMMAND is still reported, so the two states do not look alike', (function () {
        var o = step(R.createRelief({}), 6.0, { dump_demand: 1.0, condenser_available: false });
        return o.dump_demand === 1.0 && o.dump_available === false;
      })(), 'a commanded-open dump with no condenser is a different plant state from a shut one');
  ckT('the safety valves do NOT need the condenser', (function () {
        var o = step(R.createRelief({}), pop + 0.5, { condenser_available: false });
        return o.safety_kgs > 0;
      })(), 'they discharge to atmosphere — losing the condenser must not disable the last resort');

  /* ---- THE MSIV (#511) — sourced placement, Ginna TS Bases B 3.7.2: the valve sits
   * DOWNSTREAM of the safeties (and the ADV/TDAFW supply), UPSTREAM of the turbine and the
   * dumps. So a shut MSIV zeroes the DUMP and touches nothing else in this layer. ---- */
  head('THE MSIV  [gates the dump, never the safeties or the ADV — B 3.7.2]');
  ckT('a shut MSIV stops a fully commanded dump', (function () {
        var o = step(R.createRelief({}), 6.0, { dump_demand: 1.0, msiv_frac: 0 });
        return o.dump_kgs === 0;
      })(), 'the dumps are downstream of the isolation valve');
  ckT('a mid-stroke MSIV passes a proportional dump', (function () {
        var o = step(R.createRelief({}), DREF, { dump_demand: 1.0, msiv_frac: 0.5 });
        return Math.abs(o.dump_kgs - 0.5 * DOC.dump_frac * RATED) < 1e-9;
      })(), '');
  ckT('a shut MSIV does NOT touch the safeties or the ADV', (function () {
        var o = step(R.createRelief({}), pop + 0.5, { msiv_frac: 0, adv_demand: 1.0 });
        return o.safety_kgs > 0 && o.adv_kgs > 0;
      })(), 'both are upstream of the valve — the SG can still relieve with the line isolated, ' +
            'which is what keeps the MSSVs able to "prevent overpressure" per the source');
  ckT('absent msiv_frac means OPEN (the pre-#511 caller)', (function () {
        var o = step(R.createRelief({}), DREF, { dump_demand: 1.0 });
        return Math.abs(o.dump_kgs - DOC.dump_frac * RATED) < 1e-9;
      })(), '');

  /* ---- TOTALS ------------------------------------------------------------------------------ */
  /* ---- THE ADV (the middle rung, 2026-08-19) — Ginna TS Bases B 3.7.4 ------------------- */
  head('THE ADV  [below the safeties, above the dump — and it does NOT need the condenser]');
  ck('the auto setpoint sits BELOW the safety pop, [derived] at the WAT-05 margin',
     (R.RELIEF.safety_pop_mpa - R.RELIEF.adv_setpoint_mpa) * 145.0377, 45, 0.5, 'psi');
  ck("capacity is Ginna's 329,000 lb/hr per-MWt scaled, one valve on one loop",
     R.RELIEF.adv_kgs, 329000 / 7936.64 * 300 / 1520, 1e-9, 'kg/s');
  ckT('...which is the source own "approximately 4% of RTP" cross-check',
      (function () {
        var W2 = globalThis.RD.pwr2.water;
        var rtp = R.RELIEF.adv_kgs * W2.h_fg(R.RELIEF.adv_setpoint_mpa) / 300000;
        return rtp > 0.035 && rtp < 0.05;
      })(), 'capacity x h_fg at the setpoint, over 300 MWt');
  var rlA = R.createRelief({});
  var below = step(rlA, R.RELIEF.adv_setpoint_mpa - 0.05);
  var mid = step(rlA, R.RELIEF.adv_setpoint_mpa + R.RELIEF.adv_band_mpa / 2);
  var full = step(rlA, R.RELIEF.adv_setpoint_mpa + R.RELIEF.adv_band_mpa + 0.02);
  /* ⚠ THIS USED TO READ `full.adv_kgs === RELIEF.adv_kgs` for its "FULL above it" arm, i.e. it
   * checked the valve's POSITION by reading its FLOW — which only worked because flow was
   * pressure-independent (#633). The position claim is now made on the position. */
  ckT('shut below the setpoint, HALF at mid-band, FULL above it — a modulating valve, not a pop',
      below.adv_kgs === 0 && Math.abs(mid.adv_frac - 0.5) < 0.01 &&
      Math.abs(full.adv_frac - 1) < 1e-12 && full.adv_kgs > 0,
      "the pneumatic controller's shape; the SAFETIES are the latching pop, not this");
  ckT('...and FULL before the safeties lift — the rung ordering is the point',
      full.safety_open === false && full.adv_kgs > 0,
      (R.RELIEF.adv_setpoint_mpa * 145.04 - 14.7).toFixed(0) + ' + band < 1085 psig pop');
  ckT('the OPERATOR can open it at ANY pressure — function (b), the condenser-less cooldown',
      step(R.createRelief({}), 6.0, { adv_demand: 0.7 }).adv_frac === 0.7,
      'adv_demand is the cooldown lever; auto and manual take the max');
  ckT('...and it flows with the condenser GONE, which is its whole reason to exist',
      step(R.createRelief({}), 6.0, { adv_demand: 1.0, condenser_available: false }).adv_kgs > 0 &&
      step(R.createRelief({}), 6.0, { dump_demand: 1.0, condenser_available: false }).dump_kgs === 0,
      'same step: the dump dies with the condenser, the ADV does not — atmospheric discharge');
  ckT('the BLOCK VALVE isolates it, auto and manual alike — the failed-open ARV lever',
      step(R.createRelief({}), full ? R.RELIEF.adv_setpoint_mpa + 1 : 8,
           { adv_demand: 1.0, adv_block: false }).adv_kgs === 0,
      '"upstream block valves ... to isolate a failed open ARV" (B 3.7.4)');

  /* ---- #633: FLOW DEPENDS ON THE UPSTREAM PRESSURE ------------------------------------------
   * THE FILED DEFECT, and it is worth stating what made it invisible: every capacity check in
   * this file sampled at ONE pressure, so a model that ignored pressure and a model that
   * honoured it were indistinguishable to the whole gate. Reproduced full stack before the fix
   * (Mode 3, ADV commanded 100 % open, RD.SimulationService at 600x): SG pressure fell straight
   * through atmospheric to -14.4 psig with `adv_flow_normalized` pinned at 1.0000 the entire
   * way, SG level to 0 %. After: the plant settles at 428 degF / 266 psig and SG pressure never
   * goes below 280.75 psia. */
  head('#633 PRESSURE DEPENDENCE  [a capacity is quoted AT a pressure, or it is not a capacity]');
  ck("the ADV's reference is the pressure the UFSAR quotes its capacity at, not its setpoint",
     R.RELIEF.adv_ref_mpa * PSI - 14.7, DOC.adv_ref_psig, 1e-9, 'psig');
  ckT('...and that is BELOW the ADV setpoint, so the valve passes MORE than rated when it opens',
      R.RELIEF.adv_ref_mpa < R.RELIEF.adv_setpoint_mpa &&
      step(R.createRelief({}), R.RELIEF.adv_setpoint_mpa, { adv_demand: 1 }).adv_kgs >
        R.RELIEF.adv_kgs,
      'a clamp at the quoted capacity would silently re-introduce a pressure-independent flow ' +
      'at exactly the overpressure end');
  ck('each safety stage references its OWN set pressure + the sourced 3 % accumulation',
     S2.ref_mpa * PSI - 14.7, DOC.stage2_psig * (1 + DOC.accum), 1e-9, 'psig');
  ckT('the dump reference is pwr2_sg.js\'s OWN rated pressure, not a second copy of it',
      (function () {
        /* THE SECOND-COPY GUARD. `dump_ref_mpa` restates a constant pwr2_sg.js owns, because
         * this gate loads the relief layer in a sandbox with no SG module and a runtime read is
         * not available to it. So the gate does the read instead: load pwr2_sg for real and
         * compare. Move the plant's rated steam pressure and this reddens (#557's class). */
        var sg = null;
        try {
          require(path.join(__dirname, '..', 'engines', 'pwr2', 'pwr2_sg.js'));
          sg = globalThis.RD.pwr2.sg;
        } catch (e) { return false; }
        return sg && Math.abs(R.RELIEF.dump_ref_mpa - sg.createSG({}).P) < 1e-12;
      })(), 'asserted against RD.pwr2.sg.createSG({}).P, the module that owns the number');

  /* THE SHAPE, not just the endpoints. A check that samples three pressures cannot tell Napier
   * from any other monotone curve through them, so assert the model itself against a DOC-side
   * re-derivation (docFactor), then the two limits that decide plant behaviour. */
  ckT('the ADV follows the IEC/Napier curve across the whole range, not a lookup', (function () {
        var worst = 0;
        for (var p = 0.11; p <= 8.0; p += 0.03) {
          var got = step(R.createRelief({}), p, { adv_demand: 1.0 }).adv_kgs;
          var want = R.RELIEF.adv_kgs * docFactor(p, ATM_MPA, (DOC.adv_ref_psig + 14.7) / PSI);
          worst = Math.max(worst, Math.abs(got - want));
        }
        return worst < 1e-9;
      })(), 'swept 0.11-8.0 MPa against a re-derivation of IEC 60534-2-1 that never calls the ' +
            'engine, so the two agreeing is evidence rather than a tautology');
  ckT('AT ATMOSPHERIC THE ADV PASSES NOTHING — the -14 psig runaway is impossible', (function () {
        return step(R.createRelief({}), ATM_MPA, { adv_demand: 1.0 }).adv_kgs === 0 &&
               step(R.createRelief({}), ATM_MPA * 0.5, { adv_demand: 1.0 }).adv_kgs === 0;
      })(), 'a valve with no differential across it moves no steam; pre-#633 the ADV passed its ' +
            'full 8.18 kg/s (64,900 lb/hr) at 0.29 psia and dragged the SG to -14.4 psig');
  ckT('NO relief path can drive steam pressure below its own discharge', (function () {
        /* the invariant, not one path's endpoint: at or below the discharge pressure every
         * path is shut, whatever it is commanded to do (#543's lesson — assert the invariant
         * the defect violated, not the branch it took). */
        var bad = 0;
        for (var p = 0.02; p <= ATM_MPA; p += 0.004) {
          var o = step(R.createRelief({}), p,
            { adv_demand: 1.0, dump_demand: 1.0, P_cond_mpa: ATM_MPA });
          if (o.adv_kgs > 0 || o.dump_kgs > 0 || o.safety_kgs > 0) bad++;
        }
        return bad === 0;
      })(), 'swept 0.02 MPa to atmospheric with every lever commanded fully open');
  ck('at 15 psia the ADV passes a fraction of a per cent of its rating, not 100 %',
     100 * step(R.createRelief({}), 15 / PSI, { adv_demand: 1.0 }).adv_kgs / R.RELIEF.adv_kgs,
     0.386, 0.02, '% of rated');
  ckT('the dump takes the CONDENSER pressure and the ADV takes ATMOSPHERE', (function () {
        /* the two paths must not share a discharge: a dump into a vacuum stays choked far
         * lower than an ADV venting to atmosphere, and the difference is visible at 0.2 MPa. */
        /* 0.12 MPa (17.4 psia) is where the two diverge by ~48 %: a dump into a 0.005 MPa
         * condenser is STILL choked there, one venting to atmosphere is deep in the
         * subcritical knee. At operating pressure both are choked and identical, which is
         * why the sample has to be down here to mean anything. */
        var lowP = 0.12;
        var vac = step(R.createRelief({}), lowP, { dump_demand: 1.0, P_cond_mpa: 0.005 });
        var atm = step(R.createRelief({}), lowP, { dump_demand: 1.0, P_cond_mpa: ATM_MPA });
        return vac.dump_kgs > atm.dump_kgs * 1.2 && atm.dump_kgs > 0 &&
               Math.abs(vac.dump_flow_factor - docFactor(lowP, 0.005, R.RELIEF.dump_ref_mpa)) < 1e-12;
      })(), 'a dump discharging to a real condenser is still choked at 17.4 psia where one ' +
            'discharging to atmosphere is not');
  ckT('an absent condenser pressure DEFAULTS to atmosphere, and says so by understating',
      (function () {
        var a = step(R.createRelief({}), 0.2, { dump_demand: 1.0 });
        var b = step(R.createRelief({}), 0.2, { dump_demand: 1.0, P_cond_mpa: ATM_MPA });
        return Math.abs(a.dump_kgs - b.dump_kgs) < 1e-12 && a.P_cond_mpa === a.P_atm_mpa;
      })(), 'a fixture with no condenser model must never get MORE dump than the real plant — ' +
            'the one direction a default is allowed to be wrong in');
  ckT('every path is choked at its own reference, so the reference needs no downstream pressure',
      (function () {
        var xc = DOC.fgamma * DOC.xt;
        return (R.RELIEF.adv_ref_mpa - ATM_MPA) / R.RELIEF.adv_ref_mpa > xc &&
               (R.RELIEF.dump_ref_mpa - 0.01) / R.RELIEF.dump_ref_mpa > xc &&
               (S1.ref_mpa - ATM_MPA) / S1.ref_mpa > xc &&
               (S2.ref_mpa - ATM_MPA) / S2.ref_mpa > xc;
      })(), 'x at each quoted condition exceeds the choked limit ' +
            (DOC.fgamma * DOC.xt).toFixed(4) + ', which is why one normalisation serves all three');
  ck('the choked expansion factor bottoms out at the standard\'s own 2/3',
     R.Y_CHOKED, 2 / 3, 1e-12, '');

  head('TOTALS AND REPORTING');
  var rl4 = R.createRelief({});
  var both = step(rl4, pop + 0.5, { dump_demand: 1.0 });
  ck('the total is the sum of the paths', both.total_kgs,
     both.safety_kgs + both.dump_kgs + both.adv_kgs,
     1e-12, 'kg/s');
  ck('...reported as a fraction of rated', both.total_frac, both.total_kgs / RATED, 1e-12, '');
  ckT('relieved mass accumulates over time', (function () {
        var r5 = R.createRelief({});
        R.stepRelief(r5, R.RELIEF.dump_ref_mpa, 10, { rated_steam_kgs: RATED, dump_demand: 1.0 });
        return Math.abs(r5.relieved_kg - DOC.dump_frac * RATED * 10) < 1e-9;
      })(), '');

  /* ---- REFUSAL ----------------------------------------------------------------------------- */
  head('REFUSAL  [every capacity here is a FRACTION of a plant this layer does not know]');
  ckT('omitting the rated steam flow throws rather than assuming one', (function () {
        try { R.stepRelief(R.createRelief({}), 6.0, 1, { dump_demand: 1 }); return false; }
        catch (e) { return /rated_steam_kgs/.test(e.message); }
      })(), '');
  /* ...and a ZERO throws too (#539). The guard used to be `=== undefined`, so it refused to
   * invent a MISSING plant and then silently accepted a plant of size nought — the same
   * fabrication, differently spelled, and it is the case that actually shipped: Mode 4 booted
   * with rated_steam 0, so every capacity here was 0 x its fraction while the safety-valve
   * latch (which keys on pressure alone) still reported OPEN. This is the arm that would have
   * caught it at the layer boundary. */
  ckT('...and so does a ZERO — 0 x every fraction is a fabricated plant, not a missing one',
      (function () {
        try { R.stepRelief(R.createRelief({}), 8.2, 1, { rated_steam_kgs: 0, dump_demand: 1 }); return false; }
        catch (e) { return /rated_steam_kgs/.test(e.message); }
      })(), '');
}

console.log('\nPWR2 Layer 5 -- RELIEF: the steam paths that are not the turbine');
var R = loadFrom(SRC), rec = [];
runSuite(R, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['the rated-flow guard goes back to `=== undefined` (a plant of size nought sails through)',
   'if (!(drivers.rated_steam_kgs > 0)) {',
   'if (drivers.rated_steam_kgs === undefined) {'],
  ['the ADV auto function is dead (overpressure rides straight to the safeties)',
   'var advAuto = (P_mpa - RELIEF.adv_setpoint_mpa) / RELIEF.adv_band_mpa;',
   'var advAuto = 0 * (P_mpa - RELIEF.adv_setpoint_mpa) / RELIEF.adv_band_mpa;'],
  ['the ADV is gated on the condenser (function (b) deleted)',
   'var advFrac = advBlock ? Math.max(advAuto, advMan) : 0;',
   'var advFrac = advBlock && avail ? Math.max(advAuto, advMan) : 0;'],
  /* the mutation must hit the DERIVED MPa, not the display psig — the two are separate
   * literals (the safety pop has the same shape), and mutating the label moves nothing */
  ['the ADV setpoint drifts ABOVE the safety pop (the rung ordering inverts)',
   'adv_setpoint_mpa:    (1040.0 + 14.7) / PSI_PER_MPA,',
   'adv_setpoint_mpa:    (1100.0 + 14.7) / PSI_PER_MPA,'],
  ['the block valve is ignored',
   'var advBlock = drivers.adv_block === undefined ? true : !!drivers.adv_block;',
   'var advBlock = true;'],
  /* #542 re-anchored the latch onto the per-stage loop; these three follow it there. */
  ['THE LATCH IS LOST — a stateless valve that chatters at the setpoint',
   '      if (!st.open && P_mpa >= S.set_mpa) st.open = true;\n      else if (st.open && P_mpa <= S.reseat_mpa) { st.open = false; st.lift = 0; }',
   '      st.open = P_mpa >= S.set_mpa;'],
  ['the valve reseats at the POP pressure (no blowdown, so no hysteresis)',
   'else if (st.open && P_mpa <= S.reseat_mpa) { st.open = false; st.lift = 0; }',
   'else if (st.open && P_mpa <= S.set_mpa) { st.open = false; st.lift = 0; }'],
  ['blowdown inverted — reseat ABOVE pop', 'function reseatOf(setMpa) { return setMpa * (1 - RELIEF.safety_blowdown); }',
   'function reseatOf(setMpa) { return setMpa * (1 + RELIEF.safety_blowdown); }'],
  /* ---- #542 ITSELF, replayed. The top one IS the shipped defect. ---- */
  ['#542: THE LIFT RAMP IS ANCHORED AT THE RESEAT, NOT THE SETPOINT (the shipped defect)',
   '        var lift = (P_mpa - S.set_mpa) / S.band_mpa;',
   '        var lift = (P_mpa - S.reseat_mpa) / S.band_mpa;'],
  ['#542: the RATCHET is dropped — a pop valve that modulates back down as pressure falls',
   '        if (lift > st.lift) st.lift = lift;          /* THE RATCHET */',
   '        st.lift = lift;'],
  ['#542: the two sourced stages collapse onto one setpoint (the stagger deleted)',
   '    safety_stage2_psig:  1140.0,', '    safety_stage2_psig:  1085.0,'],
  ['#542: the sourced capacity split is replaced by an even one',
   '    safety_stage1_lbhr:  797689.0,\n    safety_stage2_lbhr:  3 * 837600.0,',
   '    safety_stage1_lbhr:  1000000.0,\n    safety_stage2_lbhr:  1000000.0,'],
  ['#542: the accumulation band moves off the sourced +3 %',
   '    safety_accumulation: 0.03,', '    safety_accumulation: 0.12,'],
  ['#542: a stage reseats on the BANK\'s reseat instead of its own',
   '        reseat_mpa: reseatOf(set),', '        reseat_mpa: reseatOf(RELIEF.safety_pop_mpa),'],
  /* ⚠ NOT `rl.stages[0].open`, which the injection self-test proved is a NO-OP: stage 1's
   * setpoint AND its reseat both sit below stage 2's, so on any continuous pressure path stage 2
   * can never be open while stage 1 is shut, and the two expressions are identical. A mutation
   * that changes nothing reports as "blind spot" and is really a mutation that is not one. The
   * TOP stage is the half that can genuinely go missing. */
  ['#542: the bank flag reports only the TOP stage (a lifting first valve the board cannot see)',
   '    rl.safety_open = anyOpen;', '    rl.safety_open = rl.stages[1].open;'],
  ['#542: a pre-stagger save migrates to a SHUT bank (a relief path dropped mid-transient)',
   '      out.push({ open: i === 0 && wasOpen, lift: (i === 0 && wasOpen) ? 1 : 0 });',
   '      out.push({ open: false, lift: 0 });'],
  ['the safety pop setpoint moves off the sourced Ginna figure',
   'safety_pop_psig:     1085.0,', 'safety_pop_psig:     1234.0,'],
  ['the MPa setpoint is typed instead of derived from the psig figure',
   'safety_pop_mpa:      (1085.0 + 14.7) / PSI_PER_MPA,', 'safety_pop_mpa:      7.5,'],
  ['the dump capacity moves off the sourced 28 % to the fleet-typical 40 %',
   'dump_capacity_frac:  0.28,', 'dump_capacity_frac:  0.40,'],
  ['the safety full-lift capacity moves off its sourced fraction',
   'safety_flow_frac:    0.84,', 'safety_flow_frac:    0.50,'],
  ['safety flow no longer clamps at full lift (unbounded with pressure)',
   '        if (lift > 1) lift = 1;', ''],
  ['safety flow STEPS to full capacity instead of ramping',
   '        var lift = (P_mpa - S.set_mpa) / S.band_mpa;', '        var lift = 1;'],
  ['THE LAYER DECIDES ITS OWN DUMP POSITION (control logic in the engine)',
   '    var demand = drivers.dump_demand === undefined ? 0 : drivers.dump_demand;',
   '    var demand = drivers.dump_demand === undefined ? (P_mpa > 7.03 ? 1 : 0) : drivers.dump_demand;'],
  ['the dump command is trusted unclamped',
   '    if (demand > 1) demand = 1;', ''],
  ['losing the condenser stops the SAFETY valves too',
   '    var safety = safetyFrac * RELIEF.safety_flow_frac * rated;',
   '    var safety = avail ? safetyFrac * RELIEF.safety_flow_frac * rated : 0;'],
  /* ⚠ RE-AIMED BY #633 — this mutation's anchor line gained the `* dumpF` term, and an
   * anchor that no longer exists reports as a BLIND SPOT rather than as a caught defect. */
  ['the dump ignores condenser availability',
   '    var dump = avail ? demand * RELIEF.dump_capacity_frac * rated * msivFrac * dumpF : 0;',
   '    var dump = demand * RELIEF.dump_capacity_frac * rated * msivFrac * dumpF;'],
  /* ---- #633 ITSELF, replayed. The top one IS the shipped defect. ---- */
  ['#633: THE ADV IGNORES UPSTREAM PRESSURE (the shipped defect — SG to -14 psig)',
   '    var adv = advFrac * RELIEF.adv_kgs * advF;', '    var adv = advFrac * RELIEF.adv_kgs;'],
  ['#633: the DUMPS ignore upstream pressure',
   '    var dump = avail ? demand * RELIEF.dump_capacity_frac * rated * msivFrac * dumpF : 0;',
   '    var dump = avail ? demand * RELIEF.dump_capacity_frac * rated * msivFrac : 0;'],
  ['#633: the SAFETIES ignore upstream pressure (the ratchet swallows the density too)',
   '        safetyFrac += st.lift * S.share * flowFactor(P_mpa, pAtm, S.ref_mpa);',
   '        safetyFrac += st.lift * S.share;'],
  ['#633: the ADV is referenced to its SETPOINT instead of the quoted 1005 psig',
   '    adv_ref_mpa:         (1005.0 + 14.7) / PSI_PER_MPA,',
   '    adv_ref_mpa:         (1040.0 + 14.7) / PSI_PER_MPA,'],
  ['#633: the dump reference drifts off the plant\'s rated steam pressure',
   '    dump_ref_mpa:        825.0 / 145.038,', '    dump_ref_mpa:        900.0 / 145.038,'],
  ['#633: a stage references the BANK\'s first-lift condition instead of its own',
   '        ref_mpa:    (psig[i] * (1 + RELIEF.safety_accumulation) + 14.7) / PSI_PER_MPA,',
   '        ref_mpa:    (RELIEF.safety_pop_psig * (1 + RELIEF.safety_accumulation) + 14.7) / PSI_PER_MPA,'],
  ['#633: the expansion factor is dropped — pure Napier, so a valve at atmospheric still flows',
   '    var Y = 1 - x / (3 * RELIEF.valve_fgamma * RELIEF.valve_xt);\n    return (Y * Math.sqrt(x) * P1) / (REF_DEN * P_ref);',
   '    return P1 / P_ref;'],
  ['#633: the no-differential floor is removed (flow goes NEGATIVE below the discharge)',
   '    if (!(x > 0)) return 0;                       /* no differential, no flow — the #633 floor */',
   ''],
  ['#633: the factor is clamped at 1, re-introducing a flat flow above the reference',
   '    return (Y * Math.sqrt(x) * P1) / (REF_DEN * P_ref);',
   '    return Math.min(1, (Y * Math.sqrt(x) * P1) / (REF_DEN * P_ref));'],
  ['#633: the dumps discharge to ATMOSPHERE instead of the condenser',
   '    var dumpF = flowFactor(P_mpa, pCond, RELIEF.dump_ref_mpa);',
   '    var dumpF = flowFactor(P_mpa, pAtm, RELIEF.dump_ref_mpa);'],
  ['#633: the caller\'s condenser pressure is ignored (a fixture default for the real plant)',
   '    var pCond = drivers.P_cond_mpa === undefined ? pAtm : drivers.P_cond_mpa;',
   '    var pCond = pAtm;'],
  ['#633: the choked limit is dropped, so x runs to 1 and Y goes below the standard\'s 2/3',
   '    if (x > X_CHOKED) x = X_CHOKED;', ''],
  /* #511 — the MSIV gates the dump (downstream), never the safeties/ADV (upstream) */
  ['the MSIV stops gating the dump (a shut steam line keeps feeding the condenser)',
   '    var msivFrac = drivers.msiv_frac === undefined ? 1 : Math.max(0, Math.min(1, drivers.msiv_frac));',
   '    var msivFrac = 1;'],
  ['the commanded position stops being reported when the condenser is lost',
   '      dump_demand: demand,', '      dump_demand: avail ? demand : 0,'],
  ['relieved mass stops accumulating', '    rl.relieved_kg += total * dt;', ''],
  ['the total drops the dump path', '    var total = safety + dump + adv;', '    var total = safety + adv;'],
  /* CONSTRUCTION */
  ['caller safety state ignored at construction',
   'safety_open:  opts.safety_open === undefined ? false : !!opts.safety_open,',
   'safety_open:  false,'],
  ['caller relieved total ignored at construction',
   'relieved_kg:  opts.relieved_kg === undefined ? 0 : opts.relieved_kg',
   'relieved_kg:  0'],
  ['the default lineup ships LIFTED',
   'safety_open:  opts.safety_open === undefined ? false : !!opts.safety_open,',
   'safety_open:  opts.safety_open === undefined ? true : !!opts.safety_open,']
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
  else console.log('  caught    ' + m[0].padEnd(72) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_relief: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
