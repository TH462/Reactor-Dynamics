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
 * ---------------------------------------------------------------------------------------
 * THE COLD-LEG INJECTION ACCUMULATOR (#511 — was a declared omission until 2026-08-24).
 *
 * ONE accumulator (single-loop plant; the reference plant carries one per cold leg — WTSM 5.2,
 * ML11223A220: "One accumulator is attached to each of the cold legs"). An honest tank, not a
 * curve: borated water under a nitrogen cover, and *"Should the RCS pressure fall below the
 * accumulator pressure, the check valves unseat, and borated water is immediately forced into
 * the RCS by the expansion of the nitrogen volume"* [sourced, same doc §5.2.4.1]. The cover gas
 * expands ISOTHERMALLY as the tank empties (the discharge takes tens of seconds against a large
 * metal tank — the isothermal end of the polytropic band, [derived]), so the driving pressure
 * FALLS as it discharges and the tank stops itself if the RCS holds an intermediate pressure —
 * the state-not-a-curve behaviour the old omission note said this component needed.
 *
 * SOURCED NUMBERS:
 *   cover pressure   650 psig normal / 600 psig minimum  [sourced — WTSM Table 5.2-2]
 *   fill fraction    tank ~2/3 water, 1/3 nitrogen       [sourced — WTSM §5.2.4.1]
 *   water volume     0.435 x RCS volume                  [sourced — Ginna UFSAR T15.6-15 via the
 *                    #408 identity the old engine carries: 2x1,115 ft3 against a 5,123 ft3 RCS;
 *                    the volume itself is DERIVED from this plant's own Layer-1 node volumes]
 *   discharge class  full dump in ~36 s at design dP     [sourced — same Ginna table; the flow
 *                    coefficient below is solved against it, not fitted]
 *   boron            the RWST concentration              [sourced — WTSM §5.2.4.1: "about the
 *                    same as that of the RWST"]
 *   water temp       100-150 degF operating band, mid    [sourced band — WTSM Table 5.2-2]
 *
 * PASSIVE — deliberately NOT gated on ac_available: "The accumulators are passive components,
 * since no operator or control actions are required in order for them to perform their function"
 * [sourced], and CONTEXT §6.3's blackout note says the same. The one lever is the motor-operated
 * ISOLATION VALVE, and its administrative lock (power removed above 1600 psig pressurizer
 * pressure — Ginna TS Bases B 3.5.1) is the SHELL's refusal, not physics here (HR5).
 *
 * NITROGEN INJECTION AFTER EMPTY IS UNMODELED, declared — a real drained accumulator can blow
 * cover gas into the RCS; this one just stops.
 *
 * DECLARED OMISSIONS (unchanged).
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

  /* ---- THE ACCUMULATOR (#511) — constants per the header block ---------------------------- */
  var FT3_M3 = 0.0283168;
  var ACC = {
    p0_mpa: (650 + 14.7) / PSI_PER_MPA,     // [sourced] 650 psig normal cover pressure (WTSM T5.2-2)
    p_min_mpa: (600 + 14.7) / PSI_PER_MPA,  // [sourced] 600 psig minimum — the arming class the board's card quotes
    capacity_frac: 0.435,                   // [sourced] Ginna T15.6-15 via the #408 identity: water = 0.435 x RCS volume
    discharge_s: 36,                        // [sourced] same table — full dump in the ~36 s class
    water_temp_c: 48.9,                     // [sourced band] 100-150 degF operating, midpoint 120 degF
    admin_lock_psig: 1600                   // [sourced] B 3.5.1 / WTSM 5.2.4.1 — power removed from the MOV above it (SHELL enforces)
  };

  /* Volumes DERIVED from this plant's own Layer-1 geometry, resolved once at load — the same
   * "derive, don't type" rule rhoRated follows in pwr2_sources. */
  function accGeometry() {
    var GEO = RD.geometry;
    var vRcs = 0;
    GEO.NODES.forEach(function (n) { vRcs += n.V; });          // m3, the whole RCS incl. pressurizer
    var w0 = ACC.capacity_frac * vRcs;                          // m3 water
    return { w0_m3: w0, vg0_m3: w0 / 2 };                       // 2/3 water -> gas space = w0/2
  }

  function createAccumulator(opts) {
    opts = opts || {};
    var g = accGeometry();
    return {
      water_m3: opts.water_m3 === undefined ? g.w0_m3 : opts.water_m3,
      w0_m3: g.w0_m3, vg0_m3: g.vg0_m3,
      /* the ISOLATION valve — default OPEN (the at-power lineup, SR 3.5.1.1); the shutdown
       * preset boots it CLOSED (sourced: closed in Mode 3 below 1600 psig and Modes 4/5/6) */
      valve_open: opts.valve_open === undefined ? true : !!opts.valve_open,
      discharged_kg: 0
    };
  }

  /* Cover-gas pressure NOW: isothermal expansion of the fixed nitrogen charge into the space
   * the discharged water vacated. P·V = P0·V0. */
  function accPressure(ac) {
    var vg = ac.vg0_m3 + (ac.w0_m3 - ac.water_m3);
    return vg > 0 ? ACC.p0_mpa * ac.vg0_m3 / vg : ACC.p0_mpa;
  }

  /* Flow coefficient SOLVED against the sourced ~36 s full-dump class rather than fitted:
   * k = M0 / (36 s x sqrt(P0/2)), i.e. the mean driving head of a full blowdown discharge
   * (cover pressure falling toward its empty-tank value against a depressurized RCS). The
   * gate MEASURES the resulting empty time; this is the anchor, not the assertion. */
  var _accK = null;
  function accK() {
    if (_accK === null) {
      var g = accGeometry();
      var m0 = g.w0_m3 * W.rho_l(ACC.water_temp_c, ACC.p0_mpa);
      _accK = m0 / (ACC.discharge_s * Math.sqrt(ACC.p0_mpa / 2));
    }
    return _accK;
  }

  function createECCS(opts) {
    opts = opts || {};
    return {
      /* Lineup only. NOTHING here decides to inject — that is the control layer's (HR5). */
      hhsiRunning: opts.hhsiRunning === undefined ? false : !!opts.hhsiRunning,
      lhsiRunning: opts.lhsiRunning === undefined ? false : !!opts.lhsiRunning,
      /* fraction of nameplate available: 1 = both trains, 0.5 = one of two, 0 = failed */
      hhsiAvail: opts.hhsiAvail === undefined ? 1 : opts.hhsiAvail,
      lhsiAvail: opts.lhsiAvail === undefined ? 1 : opts.lhsiAvail,
      injected_kg: opts.injected_kg === undefined ? 0 : opts.injected_kg,
      /* the passive tank (#511) */
      acc: createAccumulator(opts.acc)
    };
  }

  /* stepECCS(ec, sys, dt, drivers) -> {hhsi_kgs, lhsi_kgs, total_kgs, sources, ...}
   * `sources` is Layer 3's boundary-mass shape, so the caller hands it straight to stepPlant.
   * drivers.ac_available (#507 wave 4): the SI pumps are VITAL loads — diesel-carried through
   * a LOOP, dead in a station blackout (WTSM 5.7.5's "all decay heat removal systems ... also
   * fail"). Absent means powered. The run flags and the avail FAILURE fractions stay separate
   * seats: a failed train and an unpowered one are different facts with different recoveries. */
  function stepECCS(ec, sys, dt, drivers) {
    var P = sys.P;
    var powered = !drivers || drivers.ac_available !== false;
    var hh = (ec.hhsiRunning && powered) ? hhsiFlow(P) * Math.max(0, ec.hhsiAvail) : 0;
    var lh = (ec.lhsiRunning && powered) ? lhsiFlow(P) * Math.max(0, ec.lhsiAvail) : 0;

    /* THE ACCUMULATOR (#511): passive, so NOT behind `powered` (header). Flow whenever the
     * cover gas beats the RCS and the isolation valve is open; sqrt(dP) through the line,
     * capped by the water that is actually left. The check valves are the > comparison. */
    var acFlow = 0;
    var ac = ec.acc;
    if (ac && ac.valve_open && ac.water_m3 > 0) {
      var Pg = accPressure(ac);
      if (Pg > P) {
        acFlow = accK() * Math.sqrt(Pg - P);
        var rho = W.rho_l(ACC.water_temp_c, Pg);
        var maxKgs = ac.water_m3 * rho / (dt > 0 ? dt : 1);
        if (acFlow > maxKgs) acFlow = maxKgs;
        if (dt > 0) {
          ac.water_m3 = Math.max(0, ac.water_m3 - acFlow * dt / rho);
          ac.discharged_kg += acFlow * dt;
        }
      }
    }

    var total = hh + lh + acFlow;
    ec.injected_kg += total * dt;

    /* RWST water at its sourced temperature. Injected into the COLD LEG, which is where a
     * Westinghouse plant's ECCS ties in and also where it does the most good and the most
     * thermal-shock harm — both teachable, neither decided here. The accumulator's water is
     * warmer (its sourced operating band) but lands on the same node; one blended source. */
    var h_inj = W.h_l(ECCS.rwst_temp_c, P);
    var h_acc = W.h_l(ACC.water_temp_c, P);
    var srcs = [];
    if (hh + lh > 0) srcs.push({ node: 'cold_leg', mdot: hh + lh, h: h_inj });
    if (acFlow > 0) srcs.push({ node: 'cold_leg', mdot: acFlow, h: h_acc });

    return {
      hhsi_kgs: hh, lhsi_kgs: lh, acc_kgs: acFlow, total_kgs: total,
      injected_kg: ec.injected_kg,
      /* the tank's published state (§6.3 fields the board's card reads) */
      acc_water_frac: ac ? (ac.w0_m3 > 0 ? ac.water_m3 / ac.w0_m3 : 0) : 0,
      acc_pressure_mpa: ac ? accPressure(ac) : 0,
      acc_valve_open: ac ? ac.valve_open === true : false,
      /* REPORTED so a caller can see WHY flow is zero without re-deriving it. A shutoff head is
       * not a failure and must not read like one. */
      hhsi_shutoff: P * PSI_PER_MPA >= ECCS.hhsi_shutoff_psia,
      lhsi_shutoff: P * PSI_PER_MPA >= ECCS.lhsi_shutoff_psia,
      sources: srcs
    };
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.eccs = {
    ECCS: ECCS, ACC: ACC, createECCS: createECCS, stepECCS: stepECCS,
    createAccumulator: createAccumulator, accPressure: accPressure, accK: accK,
    hhsiFlow: hhsiFlow, lhsiFlow: lhsiFlow, interp: interp, gpmToKgs: gpmToKgs
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
