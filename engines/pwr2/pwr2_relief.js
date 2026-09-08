/* pwr2_relief.js — Layer 5: SECONDARY RELIEF. (#479)
 *
 * The steam paths that are NOT the turbine. Without them PWR2 can only reproduce the current
 * engine's closed-relief behaviour (D4 §21.1): measured, a 100 → 60 MWe drop with rods in MANUAL
 * puts the current engine at 76.8 % with its dump ~14.7 % open, and PWR2 at 57.9 % because it has
 * nothing to open. #484 is the record of how much that one difference is worth.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ THE LAYER SPLIT, AND IT IS A RULING, NOT A PREFERENCE.
 *
 * *(OWNER RULING, recorded in the control-layer rework: relief-valve and turbine-trip LOGIC are
 * control-layer actuations on instruments; ENGINES KEEP THE HYDRAULICS.)*
 *
 * So this file answers only "given a valve position and a pressure, what flows?" — it does not
 * decide any position. The one exception is the SAFETY VALVES, and they are not an exception to
 * the rule so much as a case the rule does not reach: a spring-loaded safety valve has no
 * controller and no instrument. It lifts because the pressure under the disc exceeds the spring.
 * That is hydraulics, and it belongs here.
 *
 *     SAFETY VALVES   engine physics — pressure lifts them, this file models them completely
 *     STEAM DUMP      hydraulics HERE, position commanded by the caller
 *     ADV             hydraulics HERE; the AUTO overpressure function is a spring-and-pilot
 *                     characteristic and belongs here too, the operator's cooldown demand is the
 *                     caller's (built §48, 2026-08-19 — this line said NOT BUILT until #633)
 *
 * ---------------------------------------------------------------------------------------
 * SOURCED — with ONE exception, marked below and tracked at #643 — and all of it Ginna, this
 * plant's anchor, so nothing needed re-anchoring. That is
 * worth stating because the first figures this pass turned up (1234 psig safety, 1185 psig design,
 * ML11223A213/A229) belong to a FOUR-LOOP plant whose secondary runs 85 psi higher, and adopting
 * them would have been #380's trap: citing a number from the wrong plant class because it was the
 * first one found.
 *
 *   SAFETY POP     1085 psig — Ginna TS Bases (ML20339A221): "the MSSVs will maintain the
 *                  secondary system pressure at approximately 1085 psig"
 *   SAFETY BANK    FOUR valves per steam line at STAGGERED setpoints — Ginna UFSAR ch10
 *                  §10.3.2.4 (ML20339A040). One at 1085 psig, three at 1140 psig, each with
 *                  +3 % accumulation. The full table and both of the source's own
 *                  cross-checks are at safety_stage2_psig below (#542).
 *   SAFETY FLOW    1.0062 x rated at full lift — DERIVED IN CODE, never typed: the bank's own
 *                  sourced per-line capacity (797,689 + 3 x 837,600 lb/hr) over Ginna's stated
 *                  per-line design steam flow, UFSAR ch10's equipment table (ML20339A040):
 *                  "Flow design capacity, lb/hr  3.29 x 106 at 770 psia". That is B 3.7.1's own
 *                  sizing rule — "100% of design steam flow". It was 0.84 wearing a [sourced]
 *                  marker no document supported until #643; the full account, the independent
 *                  cross-check and the measured cost of the move are at safety_flow_frac below.
 *   DUMP CAPACITY  28 % of rated steam flow — Ginna UFSAR ch10 §10.4 (ML20339A040): "eight steam
 *                  dump valves that are capable of passing up to approximately 28% rated steam
 *                  flow". The fleet-typical figure is 40 % (WTSM §11.2, ML11223A294) and this
 *                  plant is deliberately the Ginna-class 28 %.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ EVERY CAPACITY ABOVE IS QUOTED AT A PRESSURE, AND FOR MONTHS THIS FILE IGNORED THAT (#633).
 *
 * A relief capacity is never a bare mass flow. Ginna UFSAR ch10's own equipment table quotes
 * all three of this file's paths WITH the pressure they were measured at, verbatim:
 *
 *     "Main steam safety valves ... Capacity (each), lb/hr: 797,689: two valves at 1085 psig
 *      +3% accumulation / 837,600: six valves at 1140 psig +3% accumulation"
 *     "Condenser steam dump valves ... Capacity, lb/hr: 302,500 at 695 psig"
 *     "Atmospheric steam dump valves ... Capacity (each), lb/hr: 329,000 at 1005 psig (normal)"
 *
 * Until #633 `stepRelief` passed `frac x capacity` at ANY upstream pressure. MEASURED full
 * stack (Mode 3, hot_zero_power, ADV commanded 100 % open): the plant cooled at 12 degF/min,
 * SG pressure fell 891 -> 106 psig and kept going THROUGH atmospheric to -14 psig with the ADV
 * still passing its full 8.18 kg/s (64,900 lb/hr) — a valve with no pressure behind it moving
 * its rated flow. Tavg reached 68 degF within the hour.
 *
 * THE MODEL [derived, IEC 60534-2-1 / ISA-75.01 compressible sizing]: for a fixed opening,
 *     W  is proportional to  Y * sqrt(x * P1 * rho1),   x = (P1 - P2)/P1,   Y = 1 - x/(3*F_g*x_T)
 * with x limited to the CHOKED value F_g*x_T, where Y reaches its floor of 2/3. Saturated steam
 * has rho1 roughly proportional to P1 (MEASURED against Layer 0: P/rho is 191,000 at 7.27 MPa,
 * 194,000 at 1.0 MPa and 169,000 at 0.1 MPa — within 12 % over the whole range this plant
 * reaches), so the form collapses to
 *     W  proportional to  Y * sqrt(x) * P1
 * which at choked is W proportional to P1 — Napier's steam equation, the ASME relief-sizing
 * convention and the reason a capacity is quoted at a stated pressure at all. As x -> 0 it
 * goes to ZERO, which is the half the -14 psig runaway was missing: Napier alone still passes
 * 1.4 % of rated at atmospheric, and a valve with no differential across it passes nothing.
 *
 * Each path NORMALISES TO 1.0 AT ITS OWN SOURCED REFERENCE PRESSURE, so the lb/hr figures above
 * still mean exactly what their comments say they mean. The three references are `adv_ref_mpa`,
 * `dump_ref_mpa` and each stage's `ref_mpa` — all three stated at their definitions.
 *
 * UNITS: SI. Pressure MPa absolute, flow kg/s.
 */
(function (root) {
  'use strict';

  var PSI_PER_MPA = 145.0377;

  /* ---- THE THREE SOURCED lb/hr FIGURES `safety_flow_frac` IS DIVIDED OUT OF (#643) ------------
   * They are module-level rather than object properties for one reason: an object literal cannot
   * reference its own siblings while it is being built, and `safety_flow_frac` is DERIVED from
   * these three rather than typed. Each is still exported as a `RELIEF.*` property below, so
   * there is exactly one definition of each number in this file.
   *
   * [sourced] per-stage capacity, ONE steam line's worth — Ginna UFSAR ch10's equipment table
   * (ML20339A040), verbatim: "Main steam safety valves ... Capacity (each), lb/hr: 797,689: two
   * valves at 1085 psig +3% accumulation / 837,600: six valves at 1140 psig +3% accumulation".
   * Eight valves is four per line on Ginna's two-line plant; this single-loop plant models one
   * line, which is where the "two"/"six" become one and three. The per-stage SHARES are derived
   * from these so the lb/hr figures stay the things a reader can check against the document. */
  var STAGE1_LBHR = 797689.0;
  var STAGE2_LBHR = 3 * 837600.0;
  /* [sourced] ONE steam line's DESIGN steam flow — the denominator the design basis uses. Ginna
   * UFSAR ch10 (ML20339A040) equipment table, main steam line / MSIV row, verbatim:
   *     "Flow design capacity, lb/hr  3.29 x 106 at 770 psia"
   * Twice it is §10.3.2.4's own stated bank total of 6.58 x 10^6 lbm/hr, which that section calls
   * "equal to the full load steam flow for the original 1520 MWt licensed power level" — so the
   * two halves of the source agree with each other on what a steam line carries at design. */
  var DESIGN_LINE_LBHR = 3.29e6;

  var RELIEF = {
    /* [sourced] Ginna 1085 psig first lift. Stored in MPa ABSOLUTE, converted here rather than
     * typed, so the psig figure in the comment is the thing that can be checked against the
     * document and the MPa is derived from it. */
    safety_pop_psig:     1085.0,
    safety_pop_mpa:      (1085.0 + 14.7) / PSI_PER_MPA,
    /* [derived] 3.3 % blowdown class — a safety valve reseats BELOW its pop pressure, and without
     * that hysteresis it chatters at the setpoint. The blowdown fraction is a valve-class figure,
     * not a Ginna measurement, so it is derived and marked as such. */
    safety_blowdown:     0.033,
    /* [sourced, DERIVED IN CODE — #643] full-lift capacity as a fraction of rated steam flow:
     * the bank's own sourced per-line capacity over the source's own per-line DESIGN steam flow.
     * Both numbers are quoted verbatim at their declarations above; this line is the division,
     * and 1.0062 IS DELIBERATELY NOT TYPED ANYWHERE — a typed copy is exactly how the number
     * this replaced went wrong and stayed wrong for a month.
     *
     *     (797,689 + 3 x 837,600) / 3,290,000  =  3,310,489 / 3,290,000  =  1.0062
     *
     * WHY 100 % OF DESIGN FLOW IS THE RIGHT RULE — the source states it in words, twice:
     *   TS Bases B 3.7.1 (ML20339A221), verbatim: "The design basis for the MSSVs is to limit
     *     the secondary system pressure to <= 110% of design pressure when passing 100% of
     *     design steam flow."
     *   UFSAR ch10 §10.3.2.4 (ML20339A040), verbatim: "The minimum total relieving capacity is
     *     6.58 x 106 lbm/hr which is equal to the full load steam flow for the original 1520
     *     MWt licensed power level. Although these safety valves do not relief 100% steam
     *     capacity at 1775 MWt, the UFSAR Chapter 15 analyses demonstrates that sufficient
     *     relief capacity is available". THE SOURCE NAMES ITS OWN DEPARTURE FROM 100 % AND
     *     CALLS IT AN UPRATE ARTIFACT. This plant sits at its design power, not 17 % above it,
     *     so it inherits the rule and not the artifact.
     *
     * AN INDEPENDENT SECOND ROUTE, asserted in `run_pwr2_relief` rather than left as prose: the
     * WHOLE bank power-scaled to this plant, 6,620,978 x 300/1520 = 1,306,772 lb/hr, against
     * THIS plant's own rated steam flow of 1,303,570 lb/hr (164.25 kg/s, from Layer 0's
     * enthalpy rise) = 1.0025. It never touches Ginna's stated flow, and it lands 0.4 % from the
     * route above. The gate requires the two to agree within 0.01, so a retyped denominator on
     * either side reddens instead of quietly re-scaling the bank.
     *
     * ⚠ WHAT THIS REPLACED, AND THE TRAP IT CAME IN — the constant was 0.84 and wore a
     * [sourced] marker for which no document existed (`node tools/find_source.js '0\.84|84 ?%'`:
     * 3 hits across 39 documents in 3 lanes, every one digits inside an unrelated table). It was
     * inherited BY REFERENCE from the retired engine (`pwr_config.js` `sg_safety_flow_max`,
     * #418 wave A3, 2026-08-07) and it is Ginna's ratio AFTER its 1775 MWt uprate: the same
     * numerator over one line's share of UFSAR ch15 Table 15.0-1 note b's 7.92e6 lb/hr, a flow
     * that note itself calls an envelope ("This envelopes the possibility that the steam
     * generator could perform better than expected"). 3,310,489 / 3,960,000 = 0.836. Two
     * conservatisms stacked in a denominator, both of which make the bank look smaller, on a
     * plant that is neither uprated nor being enveloped. #542's evidence pass verdicted the
     * ARRANGEMENT of this bank and inherited the FIGURE — the #380 template-placeholder trap,
     * second instance in this file, and the reason the shape above is a division and not a digit.
     *
     * MEASURED BEFORE AND AFTER (#643, 2026-09-08, condenser dumps SHUT and the ADV block valve
     * CLOSED so the bank is the only steam path out): on a turbine trip from hot full power the
     * peak steam-generator pressure falls 1105.3 -> 1102.9 psig (7.72 -> 7.70 MPa), first lift
     * is 10.46 s at BOTH scales — first lift is a setpoint, not a capacity — and stage 2 never
     * lifts at either. On a bottled generator the peak falls 1160.0 -> 1155.1 psig (8.10 ->
     * 8.07 MPa). So the scale is NOT the whole overpressure response: after a trip the heat
     * source is decay heat and even half a bank passes ten times what it has to. Where the plant
     * does have an opinion is the LOW end — at 0.50 the bottled fixture peaks at 1197.7 psig,
     * ABOVE B 3.7.1's 1193.5 psig ceiling (110 % of the 1085 psig first-lift class).
     *
     * (OWNER RULING, 2026-09-08: "A — 1.0062 x rated, the sourced design basis" — chosen over
     * keeping 0.84 as a declared departure, and over WTSM §7.1.3.4's fleet figure of 109 %
     * ("The combined capacity of the 20 safety valves is 16,467,380 lbm/hr, which is 109% of
     * full-power steam flow"), which is a four-loop plant class this Ginna-anchored plant does
     * not follow — the same reasoning that put the steam dumps at Ginna's 28 % and not 40 %.) */
    safety_flow_frac:    (STAGE1_LBHR + STAGE2_LBHR) / DESIGN_LINE_LBHR,
    /* ---- THE ATMOSPHERIC RELIEF VALVE (the ladder's middle rung, 2026-08-19) --------------
     * Ginna TS Bases B 3.7.4 (ML20339A221), verbatim: one ARV per SG main steam header, "a
     * relief capacity of 329,000 lbm/hr each (approximately 4% of RTP)", "normally closed,
     * fail closed", "equipped with pneumatic controllers to permit control of the cooldown
     * rate", with an upstream BLOCK VALVE "to isolate a failed open ARV". Two sourced
     * functions: "(a) provide secondary system overpressure protection below the setpoint of
     * the main steam safety valves; and (b) provide a method for cooling the plant should the
     * preferred heat sink via the steam dump system to the condenser not be available." The
     * SGTR event is its design basis. It discharges to ATMOSPHERE -- no condenser, which is
     * function (b)'s whole point.
     * CAPACITY: one valve on this single-loop plant, per-MWt from Ginna's two-loop figure:
     * 329,000 x 300/1520 = 64,934 lb/hr = 8.18 kg/s. The source's own cross-check lands:
     * 8.18 kg/s x h_fg at the setpoint is ~12.3 MW = 4.1 % of 300 MWt against the stated
     * "approximately 4% of RTP".
     * SETPOINT [derived]: B 3.7.4 places the auto function "below the setpoint of the MSSVs"
     * without a number; the WAT 05 plant sets its ARV 45 psi below its lowest safety (1125 vs
     * 1170 psig), and the same margin below Ginna's 1085 psig pop gives 1040 psig. The
     * modulating band [derived, 25 psi] keeps it fully open before the safeties pop. */
    adv_setpoint_psig:   1040.0,
    adv_setpoint_mpa:    (1040.0 + 14.7) / PSI_PER_MPA,
    adv_band_mpa:        25.0 / PSI_PER_MPA,
    adv_kgs:             329000.0 / 7936.64 * (300.0 / 1520.0),
    /* [sourced] THE PRESSURE THE 329,000 lb/hr WAS QUOTED AT (#633). Ginna UFSAR ch10
     * (ML20339A040) equipment table, verbatim: "Atmospheric steam dump valves ... Capacity
     * (each), lb/hr  329,000 at 1005 psig (normal)". NOT the 1040 psig auto setpoint — the
     * evidence pass went looking for the setpoint as the reference and the table gave a
     * better answer, which is the whole point of running one. 1005 psig is also this plant's
     * sourced no-load steam pressure (pwr2_sg's SG.P_noload), so the valve is sized at the
     * hot-standby condition it exists to hold. At its own 1040 psig setpoint it therefore
     * passes 103.4 % of the quoted capacity, which is what the table says it does. */
    adv_ref_psig:        1005.0,
    adv_ref_mpa:         (1005.0 + 14.7) / PSI_PER_MPA,
    /* ---- THE STAGGERED BANK (#542, 2026-08-27) ---------------------------------------------
     * This replaced a [derived] `safety_full_lift_mpa: 0.35` lumped band. The evidence pass the
     * lump was standing in for found the arrangement in this plant's OWN anchor, so every figure
     * below is now sourced and the lump is retired.
     *
     * [sourced] Ginna UFSAR ch10 §10.3.2.4 (ML20339A040), verbatim: "There are four main steam
     * safety valves (MSSV) for each steam line. The first valve lifts at 1085 psig and the
     * remaining three valves are set to lift at 1140 psig. The minimum total relieving capacity
     * is 6.58 x 10^6 lbm/hr". The same chapter's equipment table gives the CAPACITIES and the
     * accumulation: "Main steam safety valves ... Number 8 ... Type Crosby ... Capacity (each),
     * lb/hr: 797,689: two valves at 1085 psig +3% accumulation / 837,600: six valves at
     * 1140 psig +3% accumulation". Eight valves is FOUR PER LINE on Ginna's two-line plant;
     * this single-loop plant models one line's worth, which is where the "two"/"six" become
     * one and three.
     *
     * [sourced] WHY the stagger exists — Ginna TS Bases B 3.7.1 (ML20339A221), verbatim: "The
     * MSSV design includes staggered setpoints so that only the needed valves will actuate.
     * Staggered setpoints reduce the potential for valve chattering that is due to steam
     * pressure insufficient to fully open all valves following a turbine/reactor trip."
     *
     * TWO CROSS-CHECKS FROM THE SOURCE ITSELF, both land:
     *   2 lines x (797,689 + 3 x 837,600) = 6,620,978 lb/hr against §10.3.2.4's own stated
     *     "minimum total relieving capacity is 6.58 x 10^6 lbm/hr" — 0.6 % apart.
     *   Full bank lift at 1140 x 1.03 = 1174.2 psig is 98.4 % of 110 % of the 1085 psig first
     *     lift (1193.5 psig), satisfying B 3.7.1's "limit the secondary system to <= 110% of
     *     design pressure when passing 100% of design flow".
     *
     * ⚠ STAGE 1's SETPOINT IS `safety_pop_psig` ABOVE — deliberately not retyped here. A
     * constant that is right for one plant is a second copy, and it goes wrong silently the day
     * the plant changes; there is exactly one 1085.0 in this file. */
    safety_stage2_psig:  1140.0,
    /* [sourced] "+3% accumulation" — the pressure rise above a stage's own setpoint that takes
     * it from first crack to full lift. Quoted on the SET pressure in psig, the convention the
     * table itself uses. */
    safety_accumulation: 0.03,
    /* [sourced] per-stage capacity, one steam line's worth, from the table above — declared at
     * the top of the module (STAGE1_LBHR / STAGE2_LBHR) because `safety_flow_frac` divides by
     * them and an object literal cannot read its own siblings. ONE definition each; the SHARES
     * and the full-lift SCALE are both derived from them, so the lb/hr figures stay the things a
     * reader can check against the document. */
    safety_stage1_lbhr:  STAGE1_LBHR,
    safety_stage2_lbhr:  STAGE2_LBHR,
    /* [sourced] the DENOMINATOR of safety_flow_frac — one steam line's design steam flow, quoted
     * verbatim at its declaration. Exported so the gate can check the division rather than the
     * quotient (#643). */
    safety_design_line_lbhr: DESIGN_LINE_LBHR,

    /* [sourced] Ginna ch10 §10.4 — 28 % of rated steam flow, eight valves. */
    dump_capacity_frac:  0.28,
    /* THE PRESSURE THE 28 % IS QUOTED AT (#633): this plant's RATED steam pressure, 810 psig
     * = 825 psia [sourced, Ginna 810 psig outlet class]. §10.4's sentence — "capable of passing
     * up to approximately 28% rated steam flow" — is a statement about the load the dumps stand
     * in for, so "rated steam flow" carries "at rated steam conditions" with it; a dump quoted
     * at 28 % of rated that passed 32 % of rated at full power would contradict the sentence
     * it came from.
     *
     * ⚠ THIS IS THE SAME NUMBER pwr2_sg.js's `createSG()` DEFAULTS TO, and that file owns it.
     * It is restated here because run_pwr2_relief loads this layer in a sandbox with no SG
     * module, so a runtime read is not available to the gate that has to check it. The gate
     * closes the second-copy trap instead: it loads pwr2_sg.js and asserts this constant
     * equals `RD.pwr2.sg.createSG({}).P` exactly. Move the plant's rated pressure and the
     * gate reddens here — which is the behaviour a hand-copied constant never has.
     *
     * The equipment table's own dump row is a CROSS-CHECK, not the source of this figure:
     * "Condenser steam dump valves ... Capacity, lb/hr: 302,500 at 695 psig", 8 valves =
     * 2,420,000 lb/hr at 709.7 psia. Napier-corrected to 825 psia that is 2,813,000 lb/hr
     * against Ginna's ~6.6e6 lb/hr rated steam flow, i.e. ~43 % — the FLEET-TYPICAL 40 %, not
     * §10.4's 28 %. The two Ginna statements disagree with each other; `dump_capacity_frac`
     * follows §10.4 by the standing choice recorded above and this note records the tension
     * rather than quietly resolving it. */
    dump_ref_mpa:        825.0 / 145.038,

    /* [derived, IEC 60534-2-1 / ISA-75.01] the compressible-sizing constants — see the header.
     *   x_T   pressure-drop ratio factor at choke. 0.70 is the standard's own valve-class
     *         figure for a single-seat globe valve, flow-to-open; no Ginna document gives a
     *         valve-specific one (`node tools/find_source.js 'expansion factor|xT|x_T'` and
     *         `'ASME Section VIII.*relief|relief.*capacity.*set pressure'` — 0 plant-specific
     *         hits across 39 documents in 3 lanes, 2026-09-05).
     *   F_g   specific-heat-ratio factor, gamma/1.40. Steam's gamma is 1.30. */
    valve_xt:            0.70,
    valve_fgamma:        1.30 / 1.40,
    /* [sourced, standard atmosphere] the ADV and the MSSVs discharge to ATMOSPHERE — TS Bases
     * B 3.7.4's function (b) is the whole reason the ADV exists. The steam dumps discharge to
     * the CONDENSER and take theirs from the caller. */
    P_atm_mpa:           0.101325,

    src: 'Ginna TS Bases ML20339A221 (1085 psig MSSV) and Ginna UFSAR ch10 ML20339A040 ' +
         '(28 % dump; the equipment table\'s three quoted-at pressures, #633)'
  };

  /* ---- CHOKED / SUBCRITICAL FLOW THROUGH A FIXED OPENING (#633) ------------------------------
   * The header carries the derivation. `flowFactor` returns the flow a fully-open path passes
   * at (P1, P2) as a MULTIPLE of what it passes CHOKED at its own reference pressure — so it is
   * exactly 1.0 at the pressure the sourced capacity was quoted at, and the capacity constants
   * above keep meaning what their documents say.
   *
   * ⚠ IT IS NOT CLAMPED AT 1.0, deliberately. A relief valve above its reference pressure
   * passes MORE than its quoted capacity — that is Napier, and clamping would re-introduce a
   * pressure-independent flow at exactly the overpressure end where the safeties earn their
   * keep. What clamps is the LIFT.
   *
   * All three references are choked at their own quoted conditions (the ADV and the MSSVs vent
   * to atmosphere; the dumps see a condenser two orders of magnitude below rated steam), so the
   * denominator needs no reference DOWNSTREAM pressure — one formula serves all three. */
  var X_CHOKED = RELIEF.valve_fgamma * RELIEF.valve_xt;
  var Y_CHOKED = 1 - X_CHOKED / (3 * RELIEF.valve_fgamma * RELIEF.valve_xt);   /* = 2/3 exactly */
  var REF_DEN  = Y_CHOKED * Math.sqrt(X_CHOKED);

  function flowFactor(P1, P2, P_ref) {
    if (!(P1 > 0) || !(P_ref > 0)) return 0;
    var x = (P1 - P2) / P1;
    if (!(x > 0)) return 0;                       /* no differential, no flow — the #633 floor */
    if (x > X_CHOKED) x = X_CHOKED;
    var Y = 1 - x / (3 * RELIEF.valve_fgamma * RELIEF.valve_xt);
    return (Y * Math.sqrt(x) * P1) / (REF_DEN * P_ref);
  }

  /* ONE definition of blowdown, used by every stage AND by the exported bank figure — a second
   * copy is how a mutation goes blind on the half nobody re-anchored. */
  function reseatOf(setMpa) { return setMpa * (1 - RELIEF.safety_blowdown); }
  /* the BANK's reseat is stage 1's: the last valve to shut is the first to have opened. */
  function safetyReseatMpa() { return reseatOf(RELIEF.safety_pop_mpa); }

  /* The staggered bank, resolved once from the sourced table into the MPa/fraction form the
   * step uses. Constants: the step runs at 50 Hz and must not rebuild this. */
  var SAFETY_STAGES = (function () {
    var psig  = [RELIEF.safety_pop_psig,   RELIEF.safety_stage2_psig];
    var lbhr  = [RELIEF.safety_stage1_lbhr, RELIEF.safety_stage2_lbhr];
    var tot = 0, out = [], i;
    for (i = 0; i < lbhr.length; i++) tot += lbhr[i];
    for (i = 0; i < psig.length; i++) {
      var set = (psig[i] + 14.7) / PSI_PER_MPA;
      out.push({
        set_psig:   psig[i],
        set_mpa:    set,
        band_mpa:   RELIEF.safety_accumulation * psig[i] / PSI_PER_MPA,
        reseat_mpa: reseatOf(set),
        /* [sourced] (#633) THE PRESSURE THIS STAGE'S CAPACITY WAS QUOTED AT — the equipment
         * table says it in the same breath as the lb/hr: "797,689: two valves at 1085 psig
         * +3% accumulation". So the reference is the stage's own set pressure PLUS its own
         * accumulation, i.e. the top of its lift band, which is also the only pressure at
         * which the valve is at full lift. Derived from the same two constants the band is,
         * never retyped. */
        ref_mpa:    (psig[i] * (1 + RELIEF.safety_accumulation) + 14.7) / PSI_PER_MPA,
        share:      lbhr[i] / tot
      });
    }
    return out;
  })();

  /* THE SAVE MIGRATION (#542), the `msiv` pattern from pwr2_shell.js. The shell saves `rl`
   * wholesale and restores it wholesale, so a save written before the staggered bank carries
   * `safety_open` and no `stages`. Seed stage 1 OPEN AT FULL LIFT when that flag was set — the
   * old model passed flow whenever it was set, and landing on a shut bank would silently drop a
   * relief path mid-transient. A shut legacy flag lands on a shut bank, which is the pre-#542
   * plant exactly. This is also the ONE path that seeds a bank constructed with safety_open. */
  function seedStages(rl) {
    var wasOpen = !!(rl && rl.safety_open), out = [];
    for (var i = 0; i < SAFETY_STAGES.length; i++) {
      out.push({ open: i === 0 && wasOpen, lift: (i === 0 && wasOpen) ? 1 : 0 });
    }
    return out;
  }

  function createRelief(opts) {
    opts = opts || {};
    return {
      /* Safety valves LATCH. Once lifted they stay lifted until pressure falls to the reseat
       * point — that is what blowdown IS, and a stateless "open if P > pop" model chatters. */
      safety_open:  opts.safety_open === undefined ? false : !!opts.safety_open,
      /* the per-stage latch and ratcheted lift (#542). Left null and seeded on the first step
       * by seedStages, so construction and a pre-#542 restore travel the SAME path. */
      stages:       null,
      relieved_kg:  opts.relieved_kg === undefined ? 0 : opts.relieved_kg
    };
  }

  /* stepRelief(rl, P_mpa, dt, drivers) -> the steam leaving by every path that is not the turbine.
   *
   *   drivers.rated_steam_kgs      the plant's rated steam flow; capacities are fractions of it
   *   drivers.dump_demand          0..1, COMMANDED position. This layer does not compute it.
   *   drivers.condenser_available  the dump discharges to the CONDENSER, so it is unavailable on a
   *                                loss of vacuum or a blackout. Defaults TRUE; a caller modelling
   *                                that loss must say so.
   *   drivers.P_atm_mpa            (#633) DOWNSTREAM of the ADV and the MSSVs. DEFAULTS to
   *                                RELIEF.P_atm_mpa, 0.101325 MPa — standard atmosphere is a
   *                                physically obvious default in a way a plant capacity is not,
   *                                which is why this one may default where rated_steam_kgs throws.
   *   drivers.P_cond_mpa           (#633) DOWNSTREAM of the steam dumps. DEFAULTS to the
   *                                atmospheric pressure above — i.e. a caller with no condenser
   *                                model gets a dump discharging to atmosphere, which UNDERSTATES
   *                                its flow at low steam pressure and can never overstate it.
   *                                Above ~0.29 MPa upstream the dump is choked either way, so
   *                                every fixture at or near operating pressure is unaffected.
   *                                pwr2_engine passes pwr2_condenser's own `P_cond_mpa`.
   */
  function stepRelief(rl, P_mpa, dt, drivers) {
    drivers = drivers || {};
    /* `> 0`, not `!== undefined` (#539). The old guard refused to invent a MISSING plant and
     * then silently accepted a ZERO one — the same fabrication with a different spelling, and
     * it is what let Mode 4 ship with every capacity multiplied by nought: the safety-valve
     * latch says OPEN (it keys on pressure alone) while safety_kgs is safety_flow_frac * 0 —
     * named rather than spelled, because the constant it spelled has since moved (#643). This is the
     * only hard refusal in the whole rated-scale chain and it did not fire on the case that
     * actually shipped. PWR2_VALIDATION.md:1021 states the house rule: "Every PWR2 layer so
     * far throws rather than fabricate a missing driver (fuelTemp_c, Q_core_kW,
     * rated_steam_kgs)." */
    if (!(drivers.rated_steam_kgs > 0)) {
      throw new Error('pwr2_relief: drivers.rated_steam_kgs must be > 0 — every capacity here is ' +
                      'a FRACTION of rated flow, and this layer will not invent the plant it is a ' +
                      'fraction of. Got: ' + drivers.rated_steam_kgs);
    }
    var rated = drivers.rated_steam_kgs;

    /* the two downstream pressures (#633). Both DECLARED defaults — see the driver block above. */
    var pAtm = drivers.P_atm_mpa === undefined ? RELIEF.P_atm_mpa : drivers.P_atm_mpa;
    if (!(pAtm >= 0)) pAtm = RELIEF.P_atm_mpa;
    var pCond = drivers.P_cond_mpa === undefined ? pAtm : drivers.P_cond_mpa;
    if (!(pCond >= 0)) pCond = pAtm;

    /* ---- SAFETY VALVES. No controller, no instrument, no permissive: pressure against a spring.
     * The latch is the point — lift at a setpoint, hold until that stage's own reseat.
     *
     * A STAGGERED BANK (#542), sourced — see safety_stage2_psig above. Each stage latches on its
     * OWN setpoint, ramps over its OWN +3 % accumulation, and reseats on its OWN 3.3 % blowdown.
     *
     * ⚠ THE RATCHET IS THE LOAD-BEARING LINE. A pop-type safety valve snaps open and stays open
     * until blowdown; it does not modulate back down as pressure falls. Holding the lift while
     * latched makes the flow INDEPENDENT of pressure below the setpoint, and THAT is what makes
     * a sub-setpoint equilibrium impossible.
     *
     * Before #542 the ramp was anchored at the RESEAT pressure, so 71.5 % of it lay below the
     * pop. Measured on the shipped plant, hot full power stepped to 12.8 MWe: the bank went from
     * shut to 98.93 kg/s = 60.2 % of rated in ONE 0.02 s step at first lift, then parked for an
     * hour at 24.2 % of rated and 1063.3 psig — 21 psi BELOW its own 1085 psig setpoint, where
     * no valve in a real bank has one — with 0 reseats and 750,078 lbm vented. Re-anchoring
     * alone only MOVES that park; the ratchet is what abolishes it. */
    if (!rl.stages || rl.stages.length !== SAFETY_STAGES.length) rl.stages = seedStages(rl);
    var safetyFrac = 0, anyOpen = false;
    for (var si = 0; si < SAFETY_STAGES.length; si++) {
      var S = SAFETY_STAGES[si], st = rl.stages[si];
      if (!st.open && P_mpa >= S.set_mpa) st.open = true;
      else if (st.open && P_mpa <= S.reseat_mpa) { st.open = false; st.lift = 0; }
      if (st.open) {
        var lift = (P_mpa - S.set_mpa) / S.band_mpa;
        if (lift < 0) lift = 0;
        if (lift > 1) lift = 1;
        if (lift > st.lift) st.lift = lift;          /* THE RATCHET */
        /* ⚠ THE RATCHET IS ABOUT THE LIFT, NOT THE DENSITY (#633). "A pop valve does not
         * modulate back down" is a claim about the valve's POSITION; it says nothing about
         * the steam going through that position, which thins with pressure like everything
         * else. Each stage's capacity is quoted at its OWN set pressure + accumulation, so
         * that is its reference. MEASURED that the #542 behaviour survives: inside stage 1's
         * blowdown band the factor moves only 93.9 % -> 97.1 % of quoted capacity (the band
         * is 3.3 % wide and flow is linear in pressure), against the 24.2 %-vs-60.2 % swing
         * that made the pre-#542 park possible. No sub-setpoint equilibrium; a 3 % droop
         * where there used to be a flat line. */
        safetyFrac += st.lift * S.share * flowFactor(P_mpa, pAtm, S.ref_mpa);
        anyOpen = true;
      }
    }
    /* the published bank flag — pwr2_true_state's sg_safety_open and the board's "SG Safeties
     * Lifting". ANY stage open, which is what an operator sees: metal off its seat. */
    rl.safety_open = anyOpen;
    var safety = safetyFrac * RELIEF.safety_flow_frac * rated;

    /* ---- THE ADV: auto overpressure relief below the safeties, PLUS the operator's cooldown
     * lever (drivers.adv_demand, 0..1 -- the pneumatic controller is the operator's per the
     * source; nothing here automates a cooldown). The block valve isolates both. Atmospheric
     * discharge: deliberately NOT gated on the condenser. */
    var advBlock = drivers.adv_block === undefined ? true : !!drivers.adv_block;
    var advAuto = (P_mpa - RELIEF.adv_setpoint_mpa) / RELIEF.adv_band_mpa;
    if (advAuto < 0) advAuto = 0;
    if (advAuto > 1) advAuto = 1;
    var advMan = drivers.adv_demand === undefined ? 0 : drivers.adv_demand;
    if (advMan < 0) advMan = 0;
    if (advMan > 1) advMan = 1;
    var advFrac = advBlock ? Math.max(advAuto, advMan) : 0;
    /* #633: 329,000 lb/hr is quoted AT 1005 psig against atmosphere, so that is the reference
     * and the discharge is `pAtm`. This is the path the issue was filed on: at 106 psig the
     * valve now passes 8.5 % of its rating, and at atmospheric it passes nothing at all. */
    var advF = flowFactor(P_mpa, pAtm, RELIEF.adv_ref_mpa);
    var adv = advFrac * RELIEF.adv_kgs * advF;

    /* ---- STEAM DUMP. Hydraulics only. The position is the CALLER'S — this file has no Tavg
     * error, no setpoint and no permissive, by the layer ruling in the header. */
    var demand = drivers.dump_demand === undefined ? 0 : drivers.dump_demand;
    if (demand < 0) demand = 0;
    if (demand > 1) demand = 1;
    var avail = drivers.condenser_available === undefined ? true : !!drivers.condenser_available;
    /* the MSIV sits UPSTREAM of the dumps and the turbine, DOWNSTREAM of the safeties and
     * the ADV (#511 — Ginna TS Bases B 3.7.2: closing it "isolates the turbine, steam dump
     * system, and other auxiliary steam supplies" while "the MSSVs prevent overpressure").
     * Absent means open — the pre-#511 plants never pass it. */
    var msivFrac = drivers.msiv_frac === undefined ? 1 : Math.max(0, Math.min(1, drivers.msiv_frac));
    /* #633: the 28 % is quoted at RATED steam conditions and the dumps discharge to the
     * CONDENSER, so this is the one path whose downstream pressure is a real plant variable
     * rather than the atmosphere. A dump into a condenser stays choked down to ~0.014 MPa
     * upstream, which is why the vacuum matters far less than the steam pressure does. */
    var dumpF = flowFactor(P_mpa, pCond, RELIEF.dump_ref_mpa);
    var dump = avail ? demand * RELIEF.dump_capacity_frac * rated * msivFrac * dumpF : 0;

    var total = safety + dump + adv;
    rl.relieved_kg += total * dt;

    return {
      safety_kgs: safety, dump_kgs: dump, adv_kgs: adv, total_kgs: total,
      adv_frac: advFrac, adv_auto: advAuto, adv_block_open: advBlock,
      /* (#633) REPORTED so a caller can tell a THROTTLED valve from a DEPRESSURIZED one — a
       * 100 %-open ADV passing 8 % of its rating is a different plant state from a 8 %-open
       * one, and before this they looked identical from outside. 1.0 = the sourced capacity
       * at the sourced reference pressure; > 1 above it, which is real and not clamped. */
      adv_flow_factor: advF, dump_flow_factor: dumpF,
      /* THE VALVE'S RATED CAPACITY, TRAVELLING WITH THE FLOW IT NORMALISES (#633).
       * pwr2_true_state divided `adv_kgs` by a hand-typed literal `8.18` — a second copy of
       * `RELIEF.adv_kgs` that would have had to be edited in step for ever, and the exact trap
       * #557/#556/#561 are the record of. Publishing it here rather than making the shim reach
       * into this module keeps the shim's own rule intact: it reads STEP RESULTS off ctx and
       * never calls into a layer (which is what run_pwr2_true_state's sandbox enforces). */
      adv_rated_kgs: RELIEF.adv_kgs,
      P_atm_mpa: pAtm, P_cond_mpa: pCond,
      safety_open: rl.safety_open,
      /* REPORTED so a caller can see WHY the dump is passing nothing — a commanded-open dump with
       * no condenser is a different plant state from a shut one, and they must not look alike. */
      dump_available: avail,
      dump_demand: demand,
      relieved_kg: rl.relieved_kg,
      pop_mpa: RELIEF.safety_pop_mpa, reseat_mpa: safetyReseatMpa(),
      /* which stage is off its seat and how far — the staircase a lumped flag cannot show
       * (#542). Copies, not the live objects: a caller must not be able to move the bank. */
      safety_stages: rl.stages.map(function (s) { return { open: s.open, lift: s.lift }; }),
      /* Fraction of rated flow going out through relief — the number that says how far the plant
       * is from balancing on the turbine alone. */
      total_frac: rated > 0 ? total / rated : 0
    };
  }

  /* ---- ⚠ THIS BLOCK USED TO SAY THE ADV WAS NOT BUILT. It was built at §48 (2026-08-19) and the
   * note outlived it by a fortnight, telling every reader that a SHIPPED path did not exist —
   * three paragraphs of "recorded as owed" over a valve the operator can command. Deleted at #633.
   *
   * Keeping the one fact in it that is still load-bearing, because it is the argument for why the
   * middle rung has to exist at all: #484 measured the current engine's ADVs carrying ~9 % of rated
   * flow with the condenser dump disarmed. The ladder is dump → ADV → safeties, and without its
   * middle rung a secondary held closed runs to the safety valves.
   *
   * NOTHING IS OWED ON THE BANK'S SCALE ANY MORE. `safety_flow_frac` was the last open item here
   * — a 0.84 with no document behind it — and #643 closed it: the evidence pass, the owner's
   * ruling on 2026-09-08, and the constant now DERIVED from two sourced lb/hr figures rather
   * than typed. See safety_flow_frac above. */

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.relief = {
    RELIEF: RELIEF, PSI_PER_MPA: PSI_PER_MPA,
    SAFETY_STAGES: SAFETY_STAGES,
    safetyReseatMpa: safetyReseatMpa,
    /* (#633) exported so the gate can assert the SHAPE of the model rather than only its
     * endpoints — a check that only samples flows cannot tell Napier from a lookup table. */
    flowFactor: flowFactor, X_CHOKED: X_CHOKED, Y_CHOKED: Y_CHOKED,
    createRelief: createRelief, stepRelief: stepRelief
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
