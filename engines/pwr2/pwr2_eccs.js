/* pwr2_eccs.js — Layer 5: EMERGENCY CORE COOLING. (#479)
 *
 * Reads Layers 0-4. Layer 5's third system, after the SG secondary and CVCS.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS HYDRAULICS ONLY. **NOTHING HERE DECIDES WHEN TO INJECT.**
 *
 * Actuation — the safety injection signal, its permissives, its blocks — is CONTROL, and putting
 * it in the engine is the mistake HR5 exists to prevent. This file answers exactly one question:
 * *given a pump lined up and an RCS at pressure P, how much flow gets in?* The answer is a
 * SOURCED CURVE, and the curve's shape is the whole educational point.
 *
 * ---------------------------------------------------------------------------------------
 * THE SOURCE IS A REAL PUMP CURVE, NOT A CONSTANT — Ginna UFSAR Table 15.6-17, verbatim:
 *
 *   "R. E. Ginna High Head Safety Injection (HHSI) Flow Versus Pressure
 *    Pressure (psia) Flow (gpm)
 *    14.7 300 / 114.7 300 / 214.7 300 / 314.7 300 / 414.7 300 / 514.7 300 / 614.7 289 /
 *    714.7 273 / 814.7 253 / 914.7 229 / 1014.7 201 / 1114.7 167 / 1214.7 125 /
 *    1314.7 62 / 1389.7 0"
 *
 *   "R. E. Ginna Low Head Safety Injection (LHSI) Flow Versus Pressure
 *    Pressure (psia) Flow (gpm)
 *    14.7 1200 / 20 1176 / 40 1083 / 60 980 / 80 866 / 100 735 / 120 570 / 140 220 /
 *    214.7 0"
 *
 * **WHY A CURVE AND NOT A NUMBER IS THE POINT.** Both pumps have a SHUTOFF HEAD: HHSI delivers
 * nothing above 1389.7 psia, LHSI nothing above 214.7. So an RCS that has not depressurised gets
 * NO EMERGENCY COOLING, however many pumps are running — and the operator action that makes ECCS
 * work is the one that lowers pressure. A constant-flow ECCS would teach that injection is
 * automatic and unconditional, which is the opposite of the lesson and the opposite of TMI.
 *
 * The two curves also cross a REGIME BOUNDARY at ~215 psia: above it only the high-head train
 * contributes; below it the low-head train delivers four times as much. That step is why "get the
 * plant below the RHR/LHSI cut-in" is a procedure step and not a preference.
 *
 * ---------------------------------------------------------------------------------------
 * SCALING: **POWER, NOT VOLUME — AND THAT IS DELIBERATELY THE OPPOSITE OF CVCS.**
 *
 * CVCS volume-scales because charging and letdown move a FRACTION OF INVENTORY PER MINUTE and
 * boration moves PPM PER MINUTE; both are volume-normalised by what they are for. ECCS is sized
 * by a different duty: it must carry away DECAY HEAT and keep the core covered, and decay heat is
 * a fraction of RATED POWER. Two systems, two purposes, two bases — stated here rather than left
 * as an apparent inconsistency for someone to "tidy up".
 *
 *     volume basis  x0.1631 -> HHSI 48.9 gpm     (what CVCS uses)
 *     power basis   x0.1974 -> HHSI 59.2 gpm     USED
 *
 * The gate reports both. The honest counter-argument, recorded because it is real: the REFILL
 * phase of a large break is a volume duty, not a power one, and this plant carries 17 % less water
 * per MWt than Ginna — so power-scaling gives it proportionally MORE refill capacity than the
 * anchor plant has. That is the conservative direction for the phase this plant is least able to
 * model, and the large break is in any case a DECLARED DEMONSTRATION rather than a design
 * requirement (owner ruling, 2026-08-14).
 *
 * ---------------------------------------------------------------------------------------
 * DECLARED OMISSIONS.
 *   NO ACCUMULATORS YET. They are passive, nitrogen-driven, and arm at a sourced 600 psi
 *   (4.14 MPa) — but an accumulator is an INVENTORY with a level and a cover gas that expands as
 *   it empties, so its discharge is a state, not a curve. It belongs with the pressurizer's
 *   compressible-volume work (#472) rather than being invented here in a second incompatible way.
 *   NO RECIRCULATION, no sump, no switchover. Injection draws from an infinite RWST.
 *   NO HEAT REMOVAL PATH — this layer delivers cold water; where the heat goes is the loop's.
 *
 * UNITS ARE SI INTERNALLY. P MPa · mdot kg/s.  The sourced curves are psia/gpm and are converted
 * once, at load, so the table in this file stays byte-comparable with the document.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  var W = RD && RD.water;

  var PSI_PER_MPA = 145.038, GAL_PER_M3 = 264.172;

  /* THE SOURCED TABLES, IN THE DOCUMENT'S OWN UNITS so they can be diffed against it by eye. */
  var HHSI_PSIA_GPM = [
    [14.7, 300], [114.7, 300], [214.7, 300], [314.7, 300], [414.7, 300], [514.7, 300],
    [614.7, 289], [714.7, 273], [814.7, 253], [914.7, 229], [1014.7, 201], [1114.7, 167],
    [1214.7, 125], [1314.7, 62], [1389.7, 0]
  ];
  var LHSI_PSIA_GPM = [
    [14.7, 1200], [20, 1176], [40, 1083], [60, 980], [80, 866], [100, 735], [120, 570],
    [140, 220], [214.7, 0]
  ];

  /* POWER BASIS — declared above. 300 MWt against Ginna's ~1520 MWt. */
  var POWER_SCALE = 300 / 1520;
  var VOLUME_SCALE_REF = 0.16312;      /* what CVCS uses; carried only so the gate can report it */

  /* Linear interpolation on the sourced points, CLAMPED AT BOTH ENDS.
   *   - above the last pressure: 0. That is the shutoff head and it is the physics.
   *   - below the first pressure: the first flow. The curve is flat there in the document and a
   *     pump does not deliver more because containment is at 5 psia rather than 14.7. */
  function interp(tbl, P_psia) {
    /* NO EARLY RETURN ABOVE THE TABLE, and removing it was a real fix rather than a tidy-up.
     * It read `if (P_psia >= last[0]) return 0;` -- redundant above the table, because the bracket
     * loop finds nothing there and falls through to `return 0` anyway. But at EXACTLY the shutoff
     * pressure it short-circuited, so THE LAST ROW'S VALUE WAS NEVER READ and could have said
     * anything: an adversarial mutation changing [1389.7, 0] to [1389.7, 5] passed every check,
     * including the one that diffs every point against the document.
     *
     * A guard that is redundant in the case it was written for, and load-bearing in a case nobody
     * considered, is worse than no guard -- it makes the masked value untestable while looking
     * like defence in depth. */
    if (P_psia <= tbl[0][0]) return tbl[0][1];
    for (var i = 0; i < tbl.length - 1; i++) {
      var a = tbl[i], b = tbl[i + 1];
      if (P_psia >= a[0] && P_psia <= b[0]) {
        var t = (P_psia - a[0]) / (b[0] - a[0]);
        return a[1] + t * (b[1] - a[1]);
      }
    }
    return 0;                       /* above the table: THE SHUTOFF HEAD */
  }

  function gpmToKgs(gpm, rho) { return gpm / GAL_PER_M3 / 60 * (rho === undefined ? 1000 : rho); }

  /* Flow at RCS pressure, in kg/s, SCALED. `scale` lets the gate ask for the unscaled Ginna curve
   * so the sourced numbers can be checked against the document without arithmetic in the way. */
  function hhsiFlow(P_mpa, scale) {
    var s = scale === undefined ? POWER_SCALE : scale;
    return gpmToKgs(interp(HHSI_PSIA_GPM, P_mpa * PSI_PER_MPA) * s, 1000);
  }
  function lhsiFlow(P_mpa, scale) {
    var s = scale === undefined ? POWER_SCALE : scale;
    return gpmToKgs(interp(LHSI_PSIA_GPM, P_mpa * PSI_PER_MPA) * s, 1000);
  }

  var ECCS = {
    HHSI_PSIA_GPM: HHSI_PSIA_GPM,
    LHSI_PSIA_GPM: LHSI_PSIA_GPM,
    POWER_SCALE: POWER_SCALE,
    VOLUME_SCALE_REF: VOLUME_SCALE_REF,
    /* [sourced] shutoff heads, read off the tables rather than restated */
    hhsi_shutoff_psia: HHSI_PSIA_GPM[HHSI_PSIA_GPM.length - 1][0],
    lhsi_shutoff_psia: LHSI_PSIA_GPM[LHSI_PSIA_GPM.length - 1][0],
    /* [sourced] injected water is RWST water: cold, and borated at the RWST concentration.
     * ML11223A220 gives the 2,000-2,500 ppm band; the top is used for the same reason CVCS's
     * boric acid tank does — a borating source that cannot out-borate the RCS is not one. */
    rwst_temp_c: 21.1,          // [sourced] 70 degF RWST, the usual technical-specification floor
    rwst_boron_ppm: 2500        // [sourced] ML11223A220, top of the band
  };

  function createECCS(opts) {
    opts = opts || {};
    return {
      /* Lineup only. NOTHING here decides to inject — that is the control layer's (HR5). */
      hhsiRunning: opts.hhsiRunning === undefined ? false : !!opts.hhsiRunning,
      lhsiRunning: opts.lhsiRunning === undefined ? false : !!opts.lhsiRunning,
      /* fraction of nameplate available: 1 = both trains, 0.5 = one of two, 0 = failed */
      hhsiAvail: opts.hhsiAvail === undefined ? 1 : opts.hhsiAvail,
      lhsiAvail: opts.lhsiAvail === undefined ? 1 : opts.lhsiAvail,
      injected_kg: opts.injected_kg === undefined ? 0 : opts.injected_kg
    };
  }

  /* stepECCS(ec, sys, dt) -> {hhsi_kgs, lhsi_kgs, total_kgs, sources, ...}
   * `sources` is Layer 3's boundary-mass shape, so the caller hands it straight to stepPlant. */
  function stepECCS(ec, sys, dt) {
    var P = sys.P;
    var hh = ec.hhsiRunning ? hhsiFlow(P) * Math.max(0, ec.hhsiAvail) : 0;
    var lh = ec.lhsiRunning ? lhsiFlow(P) * Math.max(0, ec.lhsiAvail) : 0;
    var total = hh + lh;
    ec.injected_kg += total * dt;

    /* RWST water at its sourced temperature. Injected into the COLD LEG, which is where a
     * Westinghouse plant's ECCS ties in and also where it does the most good and the most
     * thermal-shock harm — both teachable, neither decided here. */
    var h_inj = W.h_l(ECCS.rwst_temp_c, P);

    return {
      hhsi_kgs: hh, lhsi_kgs: lh, total_kgs: total,
      injected_kg: ec.injected_kg,
      /* REPORTED so a caller can see WHY flow is zero without re-deriving it. A shutoff head is
       * not a failure and must not read like one. */
      hhsi_shutoff: P * PSI_PER_MPA >= ECCS.hhsi_shutoff_psia,
      lhsi_shutoff: P * PSI_PER_MPA >= ECCS.lhsi_shutoff_psia,
      sources: total > 0 ? [{ node: 'cold_leg', mdot: total, h: h_inj }] : []
    };
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.eccs = {
    ECCS: ECCS, createECCS: createECCS, stepECCS: stepECCS,
    hhsiFlow: hhsiFlow, lhsiFlow: lhsiFlow, interp: interp, gpmToKgs: gpmToKgs
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
