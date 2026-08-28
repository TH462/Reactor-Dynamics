/* pwr2_pressurizer.js — Layer 5: the pressurizer. A TWO-REGION (non-equilibrium) vessel — a
 * steam region that is COMPRESSED by an insurge and a stratified liquid below it — plugged into
 * the ONE seat Layer 2 has carried for it since 2026-08-15 (`extraMass`, D1 §25.3).
 *
 * BUILT UNDER AN OWNER RULING (2026-08-18: "Option 1", selecting "build PWR2's own pressurizer
 * now, staged — pressure control first, level machinery second — taking #472's measured findings
 * as design evidence, not its code" from three options put to him). That ruling SUPERSEDES the
 * wait-for-#472 posture D1 §25.3 and D3 §4 recorded — those sections said "must not race #472";
 * the owner was shown exactly that trade and chose to build here. #472's findings that shaped
 * this file: the level constants are ONE object (its four-authority dP was the failure), spray
 * needs RCP flow, heaters shed on SI (#447, NUREG-0737 II.E.3.1 (7)).
 *
 * THE TWO-REGION VESSEL (2026-08-25, #515 — the stage-2 "two-h stratified states" §46 sequenced
 * last, reopened by OWNER RULING 2026-08-25: "A. Then choked porv then void term."). Three
 * regions, each single-phase at every step boundary:
 *
 *     m_stm, h_stm   the STEAM region — compressed by an insurge along dh = v·dP (Layer 2's own
 *                    convention), so it SUPERHEATS on a fast insurge and pressure rises steeply;
 *     m_sat, h_sat   the TOP liquid layer — the interface pool, saturated (or slightly subcooled
 *                    after a compression, re-saturating over tau_int);
 *     m_sub, h_sub   the BOTTOM liquid layer — where insurge water STRATIFIES (real insurge water
 *                    does not mix into the pool; §43.2's formulation 2 measured what happens when
 *                    it is allowed to).
 *
 * The projection into the pressure solve is m(P) at FROZEN intensive states: every region is
 * compressed by the same dh = v·dP law the loop nodes use inside F(P), the regions' volumes at
 * that P are summed, and the SLACK — the vessel volume the regions no longer fill — is liquid
 * that enters at the hot leg's enthalpy (insurge) or the bottom layer's own (outsurge). Regime
 * transitions fall out of the same function with no clips: no steam mass → WATER-SOLID, the
 * compliance is the liquid layers' bulk modulus; no liquid mass → EMPTIED, a steam volume whose
 * surge is steam out / liquid in.
 *
 * WHY (D5 §84, measured against Ginna UFSAR ch15 §15.2.2 / Table 15.2-1): a complete loss of
 * load from full power without the anticipatory trip reaches the 2425 psia high-pressure trip in
 * 5.4 s from 2190 psia (Case 2, no pressure control) — +235 psi in 5.4 s. The single-region
 * saturated-equilibrium vessel this file was until 2026-08-25 answered the same +8-point insurge
 * with +10 psi (P-only harness: +0.6 psi for +9.7 points), because a 600 degF insurge mixed into
 * 653 degF saturated contents CONDENSED the steam it should have COMPRESSED. WTSM 3.2
 * (ML11223A213:495): "This insurge compresses the steam ..."; (:480) the steam responds "in a
 * manner similar to an ideal gas (pressure is proportional to density)".
 *
 * ⚠ FOUR FORMULATIONS WERE BUILT AND MEASURED BEFORE THIS ONE, and the failure modes generalise:
 *   1. Two-space split derived from the SPACES' OWN ρ(h,P): under sustained spray the steam
 *      space's h fell into the dome, its density rose ~5x, and the derived V_liq collapsed —
 *      a DENSE steam space read as VANISHED liquid; level crashed 61.5 → 0 % during an insurge
 *      and the plant rode its own spray to the 18 MPa ceiling. A level must be monotone in
 *      mass. (Here: every region is single-phase when the level is computed — flash and
 *      rain-out at the solved P, step 1a — so the level is V_liq from liquid densities only.)
 *   2. §25.2 split + independent fully-MIXED h_liq/h_steam: settled −0.5 psi, but a ±10 %
 *      duty step INVERTED the pressure response — a 35 degC-subcooled insurge mixed into
 *      2.7 m3 of liquid state densified it ~36 kg/m3 and pulled the plant to 1711 psia
 *      (−524 psi err). A fully-mixed liquid space hands the bubble's job to compressed-liquid
 *      density; real insurge water stratifies and the interface stays saturated. (Here: the
 *      insurge goes to the BOTTOM layer and never touches the pool's state.)
 *   3. State (m, TOTAL H) projected at FROZEN H: the compliance came out INVERTED (∂m/∂P < 0
 *      — at fixed total energy, higher P supports less saturated liquid) and the solve ran
 *      to the floor in one step. Freezing an EXTENSIVE energy drops the compression work;
 *      the frozen variable must be INTENSIVE, which is what every region's h is here.
 *   4. ONE HEM VOLUME AT ONE h̄ (2026-08-18 → 2026-08-25): monotone, regime-continuous, held the
 *      design point — and could not spike. The insurge's enthalpy diluted h̄, the mixture's
 *      quality fell, the vessel absorbed 200 kg at ~constant pressure. Retired for D5 §84's
 *      measured reason, its compliance numbers kept as the reference (226 kg/MPa bubbled,
 *      9.2 solid).
 *
 * ⚠ SETPOINTS ARE CARRIED AS DELTAS ABOUT THE OPERATOR SETPOINT, and that is what the source
 * actually says: WTSM Figure 10.2-3 (ML11223A287, read from the PAGE IMAGE — the text layer
 * does not carry the figure) writes every control actuation as "(N psig above/below setpoint)".
 * The real plant's setpoint is 2235 psig; SLS-100's design point is 2235 psia (15.41 MPa) by
 * plant identity, and the ADOPTED content is the delta ladder about whatever the setpoint is:
 *
 *     +100  PORV opens                     −15  proportional heaters FULL ON
 *      +75  spray fully open (hi alarm)    −17  backup heaters OFF   (hysteresis)
 *      +25  spray starts to open           −25  backup heaters ON    (lo alarm)
 *      +15  proportional heaters OFF
 *
 * The controller is PROPORTIONAL ONLY, deliberately: the figure's own note says the ladder
 * "reflects only proportional output of master controller" and that integral/derivative action
 * shifts actuations. The measured cost: the plant parks within the ±15 psi proportional band
 * rather than exactly on setpoint — inside the real plant's ±25 psi alarm band.
 *
 * DIRECTION OF ERROR, declared per file convention:
 *   - Spray CONDENSES STEAM into the pool (mass steam → liquid inside the vessel) and its own
 *     water's mass stays in the loop. Optimistic on level during spray (real level rises
 *     slightly more); neutral on pressure.
 *   - The interface condensation / de-superheat rate is ONE time constant (tau_int, [open]),
 *     calibrated to Ginna Table 15.2-1's trip time and declared as this vessel's one fitted
 *     constant. Wall metal is not modelled (no heat capacity, no wall condensation).
 *   - Relief discharge is REPORTED (`relief_kgs` at the steam region's own h — superheated when
 *     it is; liquid from the pool when solid) and must be wired by the caller as a negative
 *     source, the same one-step-lag convention as the break.
 *   - The loop's own 3.545 m3 'pressurizer' node (pwr2_geometry) is a stagnant liquid volume the
 *     mass ledger carries alongside this 4.176 m3 seat — a declared double-count with the surge
 *     line, worth ~5 kg/MPa of the fast-insurge compliance (D5 §85).
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  var W  = RD && RD.water;
  /* #514: the extraMass seat sits INSIDE Layer 2's pressure solve — ~11 evaluations a step —
   * so it goes through the table (pwr2_core's idiom). The table covers the superheated wing
   * (x > 1) the steam region compresses into; nothing here inverts h → T. */
  var VT = RD && RD.vtable;
  var RHO = VT ? VT.rho_from_h : (W && W.rho_from_h);
  if (!W) throw new Error('pwr2_pressurizer: load pwr2_water.js first');

  var PSI = 145.037738;                  /* psi per MPa */
  var LB_HR = 1 / 7936.64;               /* kg/s per lb/hr */

  /* ---- SOURCED / DERIVED CONSTANTS --------------------------------------------------------- */
  var GEOM = {
    kind: '[derived from sourced anchors]',
    /* Ginna TS Bases (ML20339A221) B 3.4.9: "pressurizer water level is > 650 cubic feet, which
     * is equivalent to 87%" -> total = 650/0.87 = 747.1 ft3 at 1520 MWt = 0.4915 ft3/MWt.
     * Scaled per-MWt to 300 MWt: 147.5 ft3 = 4.176 m3. Cross-checks: D2 §25.2's worked example
     * used 4.13 m3 (1.1 % off); the 4-loop WTSM plant implies 0.526 ft3/MWt (7 %).
     * THE SCALING METHOD IS THE CLAIM — per-MWt from the anchor plant, declared, not recalled. */
    V_pzr_m3: 4.176,
    hi_level_trip_frac: 0.87,            /* Ginna TS Bases: the 650 ft3 / high-level-trip point */
    level_program_full: 0.615,           /* WTSM 10.3 (ML11223A290): "high level setpoint of 61.5%" */
    level_program_noload: 0.25           /* WTSM 10.3: "low level setpoint of 25%" */
  };

  var HEATERS = {
    kind: '[derived from sourced anchors]',
    /* WTSM 3.2 (ML11223A213): "78 heaters installed for a total capacity of 1794 kW ...
     * proportional heater group ... 414 kW and the backup heater group ... 1380 kW" at the
     * 3411 MWt reference plant -> 0.526 kW/MWt -> 157.8 kW at 300 MWt, split in the source's
     * own 414:1380 ratio. Floor check: Ginna TS Bases requires >= 100 kW at 1520 MWt for
     * natural circulation (0.0658 kW/MWt -> 19.7 kW here); the scaled bank clears it 8x. */
    prop_kW: 36.4,
    backup_kW: 121.4,
    /* Ginna TS Bases B 3.4.9 + NUREG-0737 II.E.3.1 (7) (#447): heaters shed on SI or loss of
     * offsite power, and shed when uncovered (D2 §25.3's emptied regime). */
    shed_on_si: true,

    /* ---- THE ELEVATION BAND (#573, the 2026-08-12 ruling) --------------------------------
     * The bank occupies a BAND of the vessel, and delivered power falls with the WETTED
     * FRACTION of that band as TRUE level passes through it. That is the physics; the sourced
     * 17 %/20 % bistable below survives ON TOP of it as protection *(OWNER RULING, 2026-08-12,
     * answer 3 of five given as "1: B  2: A  3: A  4: A and then B after the pzr  5: yes,
     * behind, rename" — rendered on #472 as "A: physical heater elevation with progressive
     * authority loss"; narrowed the same day, "1: accept as drafted  2: keep both  3: out of
     * scope, but measured", which settles that what the cliff loses is its role as the PHYSICS,
     * not the interlock's existence)*.
     *
     * THE SOURCED HALF is the elevation itself — WTSM 3.2 (ML11223A213): "replaceable,
     * direct-immersion, tubular-sheath type heaters ... located in the LOWER PORTION of the
     * pressurizer vessel". That is why WTSM 10.3 puts a cutoff at 17 % at all: below it the
     * bank is uncovered and operating in steam damages it.
     *
     * THE TWO PERCENTAGES ARE NOT SOURCED and say so. `find_source.js` finds no pressurizer
     * height, diameter, shell thickness or heater-bundle length in any lane's corpus. They are
     * DERIVED from this plant's own vessel, on the same L/D = 5 shape assumption the vessel-mass
     * derivation uses (Westinghouse pressurizers are tall):
     *
     *   V = 4.176 m3 (GEOM above) at L/D = 5  ->  D = (4V/5pi)^(1/3) = 1.021 m, L = 5.104 m
     *   cross-section 0.8183 m2  ->  10 points of VOLUME = 0.510 m of bundle,
     *   sitting from 0.255 m to 0.766 m above the bottom head
     *
     * — roughly the physical depth of an immersion-heater bundle. The retired engine reached
     * the same two percentages on a vessel 2.8 % larger (4.292 m3); they are adopted here BY
     * DERIVATION, not by copying, which is why the arithmetic is written out.
     *
     * ⚠ THE BAND SITS ENTIRELY BELOW THE 17 % CUT, and that ordering is the whole point of the
     * cut: S1 exists to de-energize the bank BEFORE it uncovers, not after. A band straddling
     * 17 % would make the protection fire in the middle of its own subject. The gate asserts
     * `elev_top_pct < LEVEL.low_cut_pct` directly rather than trusting the two literals.
     *
     * ⚠ THESE TWO KEYS ARE THE SINGLE SOURCE FOR THE BOARD (#473). The shell publishes them
     * through `getControlState().heater_elev_pct` and `comp_pressurizer.js` draws the bank
     * between them — move one and the drawn elevation moves with it. There is deliberately no
     * second number to drift, which is the #557 shape.
     *
     * ⚠ AND THE CONSEQUENCE ONLY BITES WHEN THE LEVEL CHANNEL LIES. The band is below the cut,
     * so on a healthy plant the bistable de-energizes the bank before the derate can do
     * anything. The case it exists for is behaviour-catalog HE-3: a stuck transmitter fools the
     * latch exactly as it fools the operator, and the wetted fraction is then the only thing
     * bounding #334's 2207-psi steam-heating deadhead. [declared estimate] */
    elev_bot_pct: 5.0,
    elev_top_pct: 15.0
  };

  var SPRAY = {
    kind: '[derived from sourced anchors]',
    /* WTSM 3.2: "maximum spray flow rate (840 gpm)" at 3411 MWt -> 0.246 gpm/MWt -> 73.9 gpm
     * at 300 MWt = 4.66e-3 m3/s of cold-leg water at the design cold-leg density (740 kg/m3)
     * -> 3.45 kg/s. The +25/+75 psi linear band is corroborated independently by Ginna ch15
     * (ML20339A101) Model 1: "actuated when ... exceeded the initial value by 25 psi ...
     * full-open ... by 75 psi. A linear increase ... between these points."
     * Spray needs a running RCP: the driving head is the loop dP the pump makes (WTSM 3.2,
     * and #472's measured lesson). Auxiliary spray from CVCS is stage 2. */
    max_kgs: 3.45,
    /* PHYSICALLY TRUE, AND DELIBERATELY NOT ENFORCED — a DECLARED DEPARTURE (#537).
     *
     * The physics is not in doubt, and the source is explicit. Ginna TS Bases Rev 101
     * (ML20339A221), PORV Applicable Safety Analyses: "A loss of offsite power is assumed to
     * accompany the event, and thus, NORMAL PRESSURIZER SPRAY IS UNAVAILABLE to reduce RCS
     * pressure. The PORVs are assumed to be used for RCS depressurization." A real unit
     * answers that with AUXILIARY spray — WTSM 3.2: "auxiliary spray to the vapor space of
     * the pressurizer during cool down if the reactor coolant pumps are not operating."
     *
     * THIS PLANT HAS THE AUX PATH IN THE ENGINE BUT NO CONTROL FOR IT ON THE BOARD, and the
     * owner has ruled against adding one *(OWNER RULING, 2026-08-28: "Leave the spray working
     * during a blackout to cover the lack of an aux spray. Declare the deviation."; and
     * earlier the same day: "Only have one set of spray controls... I don't want to add any
     * more controls to the UI.")*. So the ONE spray lever keeps working with the pumps
     * stopped, standing in for the auxiliary spray the player cannot reach.
     *
     * The stand-in is CONSERVATIVE, which is why it is tolerable: main spray delivers
     * 73.9 gpm (3.45 kg/s) of ~550 degF (288 degC) cold-leg water for about 4.34e6 BTU/hr
     * (1,273 kW) of condensing duty, while real auxiliary spray is 29.4 gpm (1.83 kg/s) of
     * ~131 degF (55 degC) charging water for about 8.74e6 BTU/hr (2,562 kW) — roughly HALF
     * the authority the modelled aux path would give, because cold charging water condenses
     * far harder per pound. Routing the lever to the aux path instead was costed and
     * rejected: it would have made a blacked-out plant depressurize FASTER than a healthy
     * one, and its 2,562 kW is energy the CVCS charging stream is already booked for at the
     * cold leg (pwr2_cvcs), i.e. a double count.
     *
     * WHAT WAS ACTUALLY WRONG, and is fixed: the gate read `!(sys.mdot_loop > 100)` — an
     * untagged flow threshold nobody derived, which is not the pump and not this departure
     * either. It let spray die at an arbitrary 6.1 % of rated flow while the whole
     * natural-circulation band (up to 244.5 kg/s here) sprayed at full ladder authority. The
     * departure is now DECLARED and total rather than accidental and partial.
     *
     * `needs_rcp` states the PHYSICS and stays true; `rcp_gate_enforced` states what the sim
     * does about it. Give the board an auxiliary-spray control and this flips to true. */
    needs_rcp: true,
    rcp_gate_enforced: false,
    /* AUXILIARY SPRAY (stage 2c, 2026-08-19) — WTSM 3.2: "A flow path from the CVCS to the
     * pressurizer spray line is also provided. This connection provides auxiliary spray to the
     * vapor space of the pressurizer during cool down if the reactor coolant pumps are not
     * operating." An OPERATOR command (drivers.aux_spray), never automatic — it is a cooldown
     * procedure action — and it deliberately does NOT need the RCPs: charging pumps drive it,
     * which is its whole reason to exist (#472 measured the old engine lacking exactly this:
     * RCPs secured, spray demanded 12 %, delivered 0).
     * aux_max_kgs is the CVCS charging maximum (29.4 gpm volume-scaled, at charging-water
     * density) — THE SAME PHYSICAL NUMBER pwr2_cvcs derives, written down twice, which is the
     * protection-cadence failure mode; the GATE ties the two together so they cannot drift
     * apart silently. aux_water_c is VCT-temperature charging water [derived ~55 degC]: the
     * per-kg condensing duty is h_f(P) − h_l(55, P), several times the loop-water spray's,
     * on a quarter of the flow. */
    aux_max_kgs: 1.83,
    aux_water_c: 55
  };

  var CONTROL = {
    kind: '[sourced]',                   /* the delta ladder, WTSM Fig 10.2-3, page image */
    setpoint_default_mpa: 15.41,         /* SLS-100 design point (plant identity) */
    setpoint_min_mpa: 11.72,             /* WTSM 10.2: operator span "1700 psig to 2500 psig", */
    setpoint_max_mpa: 17.24,             /*   adopted as the same span about this plant's scale */
    prop_full_on_psi:  -15,
    prop_off_psi:      +15,
    backup_on_psi:     -25,              /* also the low-pressure alarm */
    backup_off_psi:    -17,
    spray_start_psi:   +25,
    spray_full_psi:    +75,              /* also the high-pressure alarm */
    porv_open_psi:    +100,
    src: 'WTSM Fig 10.2-3 (ML11223A287); spray band corroborated by Ginna ch15 Model 1'
  };

  /* ---- THE LEVEL CONTROL SYSTEM (stage 2a, 2026-08-19) — WTSM 10.3 (ML11223A290) ----------
   * "The difference between the actual pressurizer level and the programmed reference level
   * signal is supplied to the master pressurizer level controller. If an error signal exists,
   * this PI (proportional plus integral) controller varies the chemical and volume control
   * system charging flow." Letdown is CONSTANT in the source's normal lineup; inventory is
   * maintained by charging alone, which is why the output here is a CHARGING DEMAND the caller
   * hands to pwr2_cvcs (cv.chargingDemand) — the same caller-wires-the-systems convention as
   * relief discharge.
   *
   * THE PROGRAM is a function of Tavg — "programmed ... as a function of auctioneered high
   * Tavg, so that it follows the natural expansion characteristics of the reactor coolant" —
   * from 25 % at the no-load Tavg to 61.5 % at full power. The source's no-load point is
   * 557 degF, which is EXACTLY this plant's own HZP anchor (291.67 degC, OSTI 1991715); the
   * full-power end is this plant's design Tavg (304.5 degC), the sourced percentages adopted
   * over the plant's own temperature span.
   *
   * THE PROTECTION LADDER, all sourced (WTSM 10.3.4): level > program + 5 % energises the
   * BACKUP HEATERS (anticipatory — the insurge water is cooler and will drop pressure);
   * level <= 17 % ISOLATES LETDOWN and CUTS ALL HEATERS (steam-environment damage); 70 % is
   * the high-level alarm. The 92 % high-level reactor trip is the 4-loop plant's; Ginna's is
   * the 87 % this file already carries, and the RPS FUNCTION itself is owed to
   * pwr2_protection (recorded, not smuggled in here). The 17 % cut's RESTORE deadband is
   * [open] — the source states the cut only — set at +3 % (restore above 20 %), the shape
   * #447 measured mattering in the old engine (a latch with no differential chatters). */
  var LEVEL = {
    kind: '[sourced percentages over this plant\'s own Tavg span]',
    tavg_noload_c: 291.67,               /* = the source's 557 degF, and the plant's HZP anchor */
    tavg_full_c: 304.5,
    backup_above_program_pct: 5,
    low_cut_pct: 17,
    low_cut_restore_pct: 20,             /* [open] deadband, see above */
    hi_alarm_pct: 70,
    /* PI gains — [open], plant-tuned quantities in the real system too. Sized so a 10 % level
     * deficit swings charging by ~half its range about the normal-balance point, and the
     * integral kills steady error on a ~5 min scale. The GATE pins the closed-loop behaviour
     * (holds program, restores after a drain), not these two numbers. */
    kp_per_pct: 0.05,
    ki_per_pct_s: 1 / 300,
    demand_bias: 46 / 180                /* the source's "normally maintained at 46 gpm" over
                                          * its 180 gpm max — the balance point the PI trims */
  };

  var RELIEF = {
    kind: '[derived from sourced anchors]',
    /* Ginna TS Bases: "two PORVs, each having a relief capacity of 179,000 lb/hr at 2335 psig";
     * Ginna ch15 Model 1: "PSV design relief rate was 288,000 lbm/hr per valve (2 valves)",
     * nominal setpoint 2485 psig, "did not reseat until the pressure dropped 5% below the
     * opening setpoint" (the reseat fraction is SOURCED). Capacities per-MWt scaled
     * 1520 -> 300 MWt. */
    porv_kgs:   2 * 179000 * LB_HR * (300 / 1520),    /* 8.90 kg/s, both valves — the RATING */
    safety_kgs: 2 * 288000 * LB_HR * (300 / 1520),    /* 14.33 kg/s, both valves — the RATING */
    /* THE RATINGS ARE AT THE LIFT POINT, and the flow is CHOKED (#515 Build 2, 2026-08-26 —
     * OWNER RULING 2026-08-25: "A. Then choked porv then void term."). "179,000 lb/hr at 2335
     * psig" is the mass a valve passes of saturated STEAM at 2335 psig; the constant flow this
     * file carried until 2026-08-26 passed 4.45 kg/s per stuck valve at 2234 psia and at 400 psia
     * alike, which drained the TMI ride to the accumulators at 53 min instead of holding TMI-2's
     * ~1000 psi plateau (D5 §83). Each valve is ONE EFFECTIVE AREA, derived once from its rating
     * through the SAME flux law that then runs live (criticalFlux below); the mass it passes is
     * area x the homogeneous critical mass flux of whatever the vessel offers it — superheated
     * steam, saturated steam, or (a solid vessel, TMI's regime for 95 % of the ride, measured)
     * flashing liquid. [derived]: no new constant; the sourced rating and Layer 0 fix everything. */
    porv_rated_mpa:   16.20,             /* 2335 psig + 14.7 = 2349.7 psia */
    safety_rated_mpa: 17.24,             /* 2485 psig, the nominal setpoint (the ASME rating point
                                          * carries +3 % accumulation — [declared] at nominal) */
    safety_open_mpa: 17.24,              /* 2485 psig = 2500 psia */
    safety_reseat_frac: 0.95,
    porv_reseat_psi: +85,                /* reclose below +85: a 15 psi deadband, [open] — the
                                          * sources give the opening point only; zero deadband
                                          * chatters at the house cadence */
    /* the tailpipe's two time constants, [open] — the ASYMMETRY is the claim (fast heat from
     * live steam, slow cool through pipe lagging), not the numbers; see step 3b */
    tail_tau_heat_s: 30,
    tail_tau_cool_s: 600
  };

  /* ---- THE TWO-REGION VESSEL'S OWN CONSTANTS (2026-08-25, #515) ----------------------------
   * tau_int_s — the interface time constant: superheated steam de-superheats toward the pool,
   *   and a subcooled pool re-saturates by condensing steam, each over this time. Its two limits
   *   are the two vessels this file has been: tau → 0 is the fully-equilibrated HEM vessel
   *   (formulation 4, +10 psi on the Ginna insurge), tau → ∞ is isentropic compression (the
   *   ceiling — measured on the P-only harness, D5 §85). [open]: `find_source.js
   *   "interfac|condens.*pressurizer"` finds no rate in any lane's corpus (2026-08-25); the value
   *   is CALIBRATED to ONE sourced case — Ginna Table 15.2-1 Case 2's 5.4 s to the 2425 psia trip
   *   — and D5 §85 publishes the sweep so the choice is a table, not a fit. MEASURED on the
   *   shell's Case 2 fixture (2026-08-25, from 2215 psia, mid-cycle feedback): the 2425 psia
   *   setpoint at 5.4 s (τ = ∞), 5.6 (100 s), 5.9 (30 s), 6.9 (10 s), 9.6 (3 s), 11.7 (1 s),
   *   12.2 (0.3 s) — even the equilibrium limit trips, because the stiffness is the
   *   STRATIFICATION (the insurge never mixes with the pool), not the condensation rate.
   *   30 s is adopted: inside the corrected band (5.4 s from 2190 psia ≈ 5.6 s from 2215 with
   *   this plant's feedback and channel lag) without sitting on the isentropic limit. It is
   *   deliberately NOT a `[tune]` constant: the scenario suite does not arbitrate it.
   * m_stm_floor_kg — below this much steam the vessel is WATER-SOLID (the remnant joins the
   *   pool); 0.5 kg is ~0.1 % of the vessel at the design steam density. [declared]
   * m_liq_floor_kg — below this much liquid the vessel is EMPTIED (heaters shed). [declared] */
  var STRATIFY = {
    kind: '[open — one calibrated constant, declared as such]',
    tau_int_s: 30,
    m_stm_floor_kg: 0.5,
    m_liq_floor_kg: 1.0
  };

  /* ---- the saturated-density level split (D2 §25.2 verbatim) — kept for MIGRATION only ----- */
  function satSplit(P, m, V) {
    var rf = W.rho_l_sat(W.T_sat(P)), rg = W.rho_v_sat(P);
    var Vl = (rf - rg) > 1e-9 ? (m - rg * V) / (rf - rg) : V;
    return { Vl: Vl, rf: rf, rg: rg };
  }

  /* ---- THE RELIEF FLUX LAW (#515 Build 2, 2026-08-26) ---------------------------------------
   * criticalFlux(h0, P0) -> kg/m2s: the HOMOGENEOUS critical mass flux of fluid at (h0, P0)
   * through a valve throat, from Layer 0 alone. Along a throttled (isenthalpic) path to a
   * throat pressure P_t the flux is G(P_t) = rho(h0, P_t) * sqrt(2 * Int_{P_t}^{P0} dP / rho),
   * and the CHOKED value is its maximum over P_t — the mixture density collapses as the fluid
   * flashes, so the maximum exists for liquid as well as steam. [derived — a sourced FORM
   * (homogeneous critical flow) on Layer 0's own densities; no correlation text is in any lane's
   * corpus, and Appendix K's Moody is cited only, pwr2_break.js]. Cross-checks, 2026-08-26:
   * saturated steam within 5-18 % of ideal-gas choked flow (23,922 vs 20,184 kg/m2s at 16.2 MPa;
   * 9,438 vs 9,073 at 6.9); saturated LIQUID 1.8-4x the steam flux (43,158 at 16.2, 25,803 at
   * 6.9 — the Moody class), where the orifice law sqrt(2 rho dP) reads 5.7-21x the steam flux and
   * is the known overstatement for flashing water (the break model's own declared error). The
   * throttled path stands in for the isentropic one (Layer 0 carries no entropy) — [declared],
   * direction: slightly HIGH flux. The back pressure is taken as 0.1 MPa: the throat pressure at
   * the maximum sits at 0.55-0.75 P0, far above containment for any P0 the relief sees. */
  var CRIT_N = 60;
  function criticalFlux(h0, P0) {
    var Pmin = 0.1, best = 0, acc = 0, prevP = P0, prevV = 1 / RHO(h0, P0);
    for (var i = 1; i <= CRIT_N; i++) {
      var Pt = P0 - (P0 - Pmin) * i / CRIT_N;
      var rho = RHO(h0, Pt), v = 1 / rho;
      acc += 0.5 * (v + prevV) * (prevP - Pt) * 1e6;                 /* Int dP/rho, J/kg */
      prevP = Pt; prevV = v;
      var G = rho * Math.sqrt(2 * acc);
      if (G > best) best = G; else if (i > 2) break;                  /* past the maximum */
    }
    return best;
  }
  /* the effective areas, derived ONCE from the ratings through the live law: the rated mass of
   * saturated steam at the rated pressure divided by the flux the law gives it there. Lazy —
   * the vtable builds on first use. */
  var _areas = null;
  function reliefAreas() {
    if (_areas) return _areas;
    _areas = {
      porv_m2:   RELIEF.porv_kgs   / criticalFlux(W.h_g(RELIEF.porv_rated_mpa),   RELIEF.porv_rated_mpa),
      safety_m2: RELIEF.safety_kgs / criticalFlux(W.h_g(RELIEF.safety_rated_mpa), RELIEF.safety_rated_mpa)
    };
    return _areas;    /* both valves of each pair; a stuck PORV is half porv_m2 */
  }

  /* ---- construction ------------------------------------------------------------------------ */
  /* A saturated, unstratified vessel at (P, level): steam at h_g above a pool at h_f, no bottom
   * layer. Densities come from the SAME table the seat reads, so the seat reproduces the
   * constructed mass EXACTLY at P (the regions fill the vessel with zero slack). */
  function createPressurizer(opts) {
    opts = opts || {};
    var P = opts.P === undefined ? CONTROL.setpoint_default_mpa : opts.P;
    var lvl = opts.level_frac === undefined ? GEOM.level_program_full : opts.level_frac;
    var V = GEOM.V_pzr_m3, Vl = lvl * V;
    var hf = W.h_f(P), hg = W.h_g(P);
    var pz = {
      V: V,
      m_stm: RHO(hg, P) * (V - Vl), h_stm: hg,
      m_sat: RHO(hf, P) * Vl,       h_sat: hf,
      m_sub: 0,                     h_sub: hf,
      m_pzr: 0,                          /* the ledger, Σ regions — set below */
      V_liq: Vl,
      P_ref: P,                          /* the pressure the states were last reconciled at */
      v_stm: 0, v_sub: 0, v_sat: 0,      /* dh/dP of each region at P_ref, kJ/kg per MPa */
      h_fill: hf,                        /* what an insurge arrives at (last step's hot leg) */
      rho_in: 0, rho_out_liq: 0, rho_out_stm: 0, m_liq: 0,   /* the seat's frozen fill terms */
      setpoint_mpa: opts.setpoint_mpa === undefined ? CONTROL.setpoint_default_mpa
                                                    : opts.setpoint_mpa,
      backupOn: false,
      porvOpen: false,
      safetyOpen: false,
      waterSolid: false,
      emptied: false,
      heatersShed: false,
      levErrInt: 0,                      /* the level PI's integral state, %*s */
      lowLevelCut: false,                /* the 17 % letdown-isolate / heater-cut latch */
      porvStuck: false,                  /* the TMI failure LATCH: set by the first lift while
                                          * drivers.porv_stick is armed, cleared only with it */
      porvManual: false,                 /* the operator's open demand (drivers.porv_manual) */
      blockOpen: true,                   /* the PORV block valve — the operator's isolation */
      T_tail_c: opts.tail_c === undefined ? 50 : opts.tail_c
    };
    freeze(pz, P);
    return pz;
  }

  /* migrateState(pz, P) — a pre-two-region save (#515) carries m_pzr/h_bar/V_liq and no region
   * states. Reconstruct the regions the HEM vessel implied at P: two-phase h̄ → the saturated
   * split; h̄ ≤ h_f → water-solid (one liquid pool at h̄); h̄ ≥ h_g → emptied (steam at h̄).
   * The old fields are deleted — two authorities for one vessel is the trap. Old saves land
   * on a saturated, unstratified vessel: the pre-build plant exactly. */
  function migrateState(pz, P) {
    if (!pz || pz.m_stm !== undefined) return pz;
    var V = pz.V === undefined ? GEOM.V_pzr_m3 : pz.V;
    var hf = W.h_f(P), hg = W.h_g(P), m = pz.m_pzr, hb = pz.h_bar;
    pz.V = V;
    if (hb === undefined || !isFinite(hb) || !isFinite(m)) {
      var fresh = createPressurizer({ P: P, level_frac: pz.V_liq !== undefined ? pz.V_liq / V
                                                                                : GEOM.level_program_full });
      pz.m_stm = fresh.m_stm; pz.h_stm = fresh.h_stm; pz.m_sat = fresh.m_sat; pz.h_sat = fresh.h_sat;
    } else if (hb <= hf) {
      pz.m_stm = 0; pz.h_stm = hg; pz.m_sat = m; pz.h_sat = hb;
    } else if (hb >= hg) {
      pz.m_stm = m; pz.h_stm = hb; pz.m_sat = 0; pz.h_sat = hf;
    } else {
      var s = satSplit(P, m, V), Vl = s.Vl < 0 ? 0 : (s.Vl > V ? V : s.Vl);
      pz.m_stm = RHO(hg, P) * (V - Vl); pz.h_stm = hg;
      pz.m_sat = m - pz.m_stm;          /* conserve the saved mass exactly */
      if (pz.m_sat < 0) pz.m_sat = 0;
      pz.h_sat = hf;
    }
    pz.m_sub = 0; pz.h_sub = hf;
    delete pz.h_bar;
    freeze(pz, P);
    return pz;
  }

  /* levelProgram(Tavg_c) -> programmed level FRACTION (WTSM 10.3 Fig 10.3-2, the sourced
   * 25..61.5 % over this plant's own no-load..full-power Tavg span, clamped at both ends). */
  function levelProgram(Tavg_c) {
    var f = (Tavg_c - LEVEL.tavg_noload_c) / (LEVEL.tavg_full_c - LEVEL.tavg_noload_c);
    f = clip(f, 0, 1);
    return GEOM.level_program_noload +
           f * (GEOM.level_program_full - GEOM.level_program_noload);
  }

  /* ---- THE SEAT: m(P) at frozen intensive states --------------------------------------------
   * Each region is compressed by dh = v·dP from the pressure it was last reconciled at (the
   * loop nodes' own discipline inside F(P)), its volume at P read off the table, and the
   * SLACK — vessel volume the regions no longer fill — is liquid at the hot leg's enthalpy
   * (insurge, slack > 0) or the bottom layer's own (outsurge, slack < 0). Monotone in P: every
   * region's volume falls as P rises (compression), so the slack — and the mass — rises.
   *   steam only  →  a steam volume whose surge is steam out / liquid in (EMPTIED);
   *   liquid only →  the liquid layers' bulk-modulus response (WATER-SOLID).
   * ONE function serves the solve AND the reconciliation, so the surge cannot pick up a phantom
   * interpolation-error flow (the #514 rule). */
  function seatMass(pz, P) {
    var dP = P - pz.P_ref;
    var V_stm = pz.m_stm > 0 ? pz.m_stm / RHO(pz.h_stm + pz.v_stm * dP, P) : 0;
    var V_sub = pz.m_sub > 0 ? pz.m_sub / RHO(pz.h_sub + pz.v_sub * dP, P) : 0;
    var V_sat = pz.m_sat > 0 ? pz.m_sat / RHO(pz.h_sat + pz.v_sat * dP, P) : 0;
    var slack = pz.V - V_stm - V_sub - V_sat, sum = pz.m_stm + pz.m_sub + pz.m_sat;
    /* THE FILL DENSITIES ARE FROZEN AT P_ref (stored by freeze()). Evaluating them at the
     * candidate P made m(P) NON-MONOTONE on a blowdown (a negative slack times a two-phase
     * density that rises with P), the bisection lost its bracket, and the core's ledger
     * drifted 9,560 kg on the accumulator ride (measured 2026-08-25). With the densities
     * constant inside the solve, m(P) is monotone because slack(P) is.
     * AND THE OUTSURGE SATURATES: the surge line passes the vessel's LIQUID first — all of it,
     * at its own density — and steam beyond that. Booking an outsurge at liquid density while
     * the vessel held half a kilogram of liquid (the emptied regime on the same ride) made the
     * seat and the placement disagree 60x per step and pumped the hot leg at +/-2,000 kg/s until
     * the loop's root jumped. Continuous in slack, monotone in P, placed in the same order. */
    if (slack >= 0) return sum + slack * pz.rho_in;
    var Vout = -slack, Vliq = pz.rho_out_liq > 0 ? pz.m_liq / pz.rho_out_liq : 0;
    if (Vout <= Vliq) return sum - Vout * pz.rho_out_liq;
    return sum - pz.m_liq - (Vout - Vliq) * pz.rho_out_stm;
  }
  function extraMassFn(pz) {
    return function (P) { return seatMass(pz, P); };
  }

  /* freeze(pz, P) — store the reconciliation pressure, each region's dh/dP, and the ledger. */
  function freeze(pz, P) {
    pz.P_ref = P;
    pz.v_stm = pz.m_stm > 0 ? 1000 / RHO(pz.h_stm, P) : 0;
    pz.v_sub = pz.m_sub > 0 ? 1000 / RHO(pz.h_sub, P) : 0;
    pz.v_sat = pz.m_sat > 0 ? 1000 / RHO(pz.h_sat, P) : 0;
    /* the seat's two fill densities, frozen with the states (see seatMass) */
    pz.rho_in  = RHO(pz.h_fill, P);
    pz.m_liq   = pz.m_sub + pz.m_sat;                            /* what an outsurge draws first */
    pz.rho_out_liq = pz.m_sub > 0 ? RHO(pz.h_sub, P) : (pz.m_sat > 0 ? RHO(pz.h_sat, P) : 0);
    pz.rho_out_stm = pz.m_stm > 0 ? RHO(pz.h_stm, P) : pz.rho_in;
    pz.m_pzr = pz.m_stm + pz.m_sub + pz.m_sat;
  }

  /* region mixers — mass m at enthalpy h joins a region (energy-conserving) */
  function addSteam(pz, m, h) {
    if (m <= 0) return;
    pz.h_stm = (pz.m_stm * pz.h_stm + m * h) / (pz.m_stm + m); pz.m_stm += m;
  }
  function addPool(pz, m, h) {
    if (m <= 0) return;
    pz.h_sat = (pz.m_sat * pz.h_sat + m * h) / (pz.m_sat + m); pz.m_sat += m;
  }

  /* stepPressurizer(pz, sys, dt, drivers) — call AFTER stepPlant, the same slot as the other
   * Layer 5 systems. Reads the solved pressure, reconciles mass (surge = the exact difference),
   * moves the regions' phases, runs the sourced control ladder, integrates energy by region,
   * reports.
   *
   *   drivers.si_active        heater shed (sourced; #447's NUREG-0737 requirement)
   *   drivers.ac_available     false sheds heaters too (TS Bases: ESF buses)
   *   drivers.offsite_ok       false = a LOOP (#507 wave 4) — arms the shed LATCH below even
   *                            though the diesels keep the buses up: NUREG-0737 II.E.3.1's
   *                            shed is a bus-loading action on SI-or-LOOP, and re-loading
   *                            the heaters is the OPERATOR's (the old engine's set_heater
   *                            convention — here, any pzr_heaters_manual command)
   *   drivers.heaters_manual   0..1 override — the operator's, not the controller's
   *   drivers.heaters_failed   true = the bank elements are DEAD (#507 wave 6) — a failure
   *                            seat, distinct from the manual override and the shed latch
   *   drivers.spray_manual     0..1 override
   *   drivers.spray_stick      true = the spray valve is latched OPEN (#507 wave 6) — the
   *                            porv_stick twin; the demand keeps moving and stays ineffective
   *   drivers.setpoint_mpa     operator setpoint (clamped to the sourced span)
   */
  function stepPressurizer(pz, sys, dt, drivers) {
    drivers = drivers || {};
    var P = sys.P, V = pz.V;

    if (drivers.setpoint_mpa !== undefined) {
      var sp = drivers.setpoint_mpa;
      pz.setpoint_mpa = sp < CONTROL.setpoint_min_mpa ? CONTROL.setpoint_min_mpa
                      : (sp > CONTROL.setpoint_max_mpa ? CONTROL.setpoint_max_mpa : sp);
    }

    /* ---- 1. MASS RECONCILIATION. The solve conserved the projection; adopt it, and the
     * change IS the surge (insurge positive, into the vessel). First the regions are
     * compressed exactly as the seat assumed (dh = v·dP from P_ref — Layer 2's gather-then-
     * integrate discipline), then the surge is PLACED: an insurge arrives in the BOTTOM layer
     * at the hot leg's enthalpy the seat used; an outsurge leaves from the bottom — the
     * stratified layer first, then the pool, then steam. ---- */
    var m_new = seatMass(pz, P);
    var surge_kgs = (m_new - pz.m_pzr) / dt;
    var hf = W.h_f(P), hg = W.h_g(P), hfg = hg - hf;
    var dPr = P - pz.P_ref;
    if (pz.m_stm > 0) pz.h_stm += pz.v_stm * dPr;
    if (pz.m_sub > 0) pz.h_sub += pz.v_sub * dPr;
    if (pz.m_sat > 0) pz.h_sat += pz.v_sat * dPr;
    var h_hot = nodeH(sys, 'hot_leg');
    var surge_heat_kW = 0, dm = surge_kgs * dt;
    if (dm > 0) {
      var h_in = pz.h_fill;
      /* a TWO-PHASE arrival (a voided hot leg) splits at the surge line: its liquid stratifies
       * in the bottom layer, its vapour joins the steam space — the same split step 1a makes,
       * done at entry so the volume the seat booked (a mixture density) is the volume the
       * regions hold. Booking it as liquid and flashing a step later over-filled the vessel and
       * chattered the solve at +/-600 kg/s on the accumulator blowdown (measured 2026-08-25). */
      if (h_in > hf) {
        var xin = h_in >= hg ? 1 : (h_in - hf) / hfg;
        addSteam(pz, xin * dm, hg);
        dm *= (1 - xin); h_in = hf;
      }
      if (dm > 0) {
        pz.h_sub = (pz.m_sub * pz.h_sub + dm * h_in) / (pz.m_sub + dm);
        pz.m_sub += dm;
      }
    } else if (dm < 0) {
      /* OUTSURGE CONSERVES ENERGY ACROSS THE SURGE LINE (#510 batch 1, measured). The vessel
       * debits its ledger at the donor enthalpy, but the LOOP gains that mass implicitly
       * through the pressure solve at its own node enthalpy — so the difference used to be
       * DESTROYED (~454 kJ/kg at the Mode 4 point). It is reported here and the facade
       * delivers it to the hot leg as heat (one step, the house lag convention). */
      var out = -dm, take, h_out;
      /* the surge line passes the LIQUID first — the stratified layer, then the pool, all of
       * it — and steam beyond that: the same order the seat's saturating outsurge assumed */
      take = Math.min(out, pz.m_sub);
      if (take > 0) { pz.m_sub -= take; out -= take; h_out = pz.h_sub; }
      if (out > 0) {
        take = Math.min(out, pz.m_sat);
        if (take > 0) { pz.m_sat -= take; out -= take; h_out = pz.h_sat; }
      }
      if (out > 0) {
        take = Math.min(out, pz.m_stm);
        if (take > 0) { pz.m_stm -= take; out -= take; h_out = pz.h_stm; }
      }
      if (h_hot !== undefined && h_out !== undefined) surge_heat_kW = (-surge_kgs) * (h_out - h_hot);
    }

    /* ---- 1a. PHASE BOOKKEEPING AT THE SOLVED P (instant, [declared]). A liquid layer above
     * h_f flashes its excess to steam at h_g — WTSM 3.2: "saturated water will flash to steam
     * to help maintain system pressure"; steam below h_g (an expansion made it wet) rains
     * out to the pool at h_f. Every region is single-phase when the level is computed, which
     * is formulation 1's killer applied by construction. ---- */
    var boil_kgs = 0, rain_kgs = 0, mv;
    if (pz.m_sub > 0 && pz.h_sub > hf) {
      mv = Math.min(1, (pz.h_sub - hf) / hfg) * pz.m_sub;
      pz.m_sub -= mv; pz.h_sub = hf; addSteam(pz, mv, hg); boil_kgs += mv / dt;
    }
    if (pz.m_sat > 0 && pz.h_sat > hf) {
      mv = Math.min(1, (pz.h_sat - hf) / hfg) * pz.m_sat;
      pz.m_sat -= mv; pz.h_sat = hf; addSteam(pz, mv, hg); boil_kgs += mv / dt;
    }
    if (pz.m_stm > 0 && pz.h_stm < hg) {
      var ml = (1 - Math.max(0, (pz.h_stm - hf) / hfg)) * pz.m_stm;
      pz.m_stm -= ml; pz.h_stm = hg; addPool(pz, ml, hf); rain_kgs = ml / dt;
    }

    /* ---- 1c. THE INTERFACE — the one calibrated constant (STRATIFY.tau_int_s). Superheated
     * steam de-superheats toward saturation, its energy into the pool (which then boils at the
     * interface through 1a next step); a subcooled pool re-saturates by CONDENSING steam onto
     * itself. Energy conserved exactly inside the vessel. ---- */
    var cond_kgs = 0, tau = STRATIFY.tau_int_s;
    if (isFinite(tau) && tau > 0) {
      if (pz.m_stm > 0 && pz.h_stm > hg) {
        var dHsh = pz.m_stm * (pz.h_stm - hg) * Math.min(1, dt / tau);
        pz.h_stm -= dHsh / pz.m_stm;
        if (pz.m_sat > 0) pz.h_sat += dHsh / pz.m_sat;
        else if (pz.m_sub > 0) pz.h_sub += dHsh / pz.m_sub;
        else pz.h_stm += dHsh / pz.m_stm;              /* nothing to receive it: no transfer */
      }
      if (pz.m_sat > 0 && pz.h_sat < hf && pz.m_stm > 0) {
        var dmc = Math.min(pz.m_sat * (hf - pz.h_sat) / hfg * Math.min(1, dt / tau), pz.m_stm);
        addPool(pz, dmc, pz.h_stm); pz.m_stm -= dmc;
        cond_kgs = dmc / dt;
      }
    }

    /* ---- 1b. THE LEVEL CONTROL SYSTEM (WTSM 10.3 — see the LEVEL block). Reads LAST step's
     * split (gather-then-integrate); outputs a charging demand for the caller to wire into
     * pwr2_cvcs, and the two sourced level protections. ---- */
    /* ---- HR1 SPLIT (2026-08-20, the instrument layer's control switchover) ----------------
     * CONTROL reads the INSTRUMENT; physics reads the plant. The heater/spray/PORV ladder,
     * the level PI, and the 17 % low-level cut are all instrument-actuated in the real plant,
     * so each takes its channel from drivers.indicated_* when the caller wires an instrument
     * layer — ABSENT means truth, which keeps every layer-local gate's fixture exactly what
     * it was. The CODE SAFETIES stay on TRUE pressure: spring-loaded metal has no instrument
     * in its loop, and that split is the whole TMI-relevant point — a lying pressure channel
     * can misdrive the heaters and the PORV, and can never hold a safety shut. Mass/energy
     * reconciliation, saturation properties and the emptied/solid regimes all stay on truth
     * (they are the vessel, not a reading of it). */
    var level_pct = 100 * pz.V_liq / V;
    var level_ctl = drivers.indicated_level_pct !== undefined ? drivers.indicated_level_pct
                                                              : level_pct;
    var program_pct = 100 * (drivers.tavg_c !== undefined ? levelProgram(drivers.tavg_c)
                                                          : GEOM.level_program_full);
    var levErr = program_pct - level_ctl;              /* positive = level LOW, charge more */
    /* ANTI-WINDUP: the integral's authority is capped at ±0.5 of demand (±150 %·s at this Ki)
     * — without the cap the startup transient wound it to the rail and the controller sat at
     * full charging with the level ABOVE program (measured, first closed-loop probe). The PI
     * "prevents the charging flow from reacting to small temporary level perturbations while
     * eliminating steady-state level errors" (WTSM 10.3) — a wound-up integral does neither. */
    pz.levErrInt = clip(pz.levErrInt + levErr * dt, -0.5 / LEVEL.ki_per_pct_s,
                                                     0.5 / LEVEL.ki_per_pct_s);
    var charging_demand = clip(LEVEL.demand_bias + LEVEL.kp_per_pct * levErr +
                               LEVEL.ki_per_pct_s * pz.levErrInt, 0, 1);
    if (!pz.lowLevelCut && level_ctl <= LEVEL.low_cut_pct) pz.lowLevelCut = true;
    else if (pz.lowLevelCut && level_ctl >= LEVEL.low_cut_restore_pct) pz.lowLevelCut = false;
    var backupOnLevel = levErr <= -LEVEL.backup_above_program_pct;   /* the +5 % anticipator */

    /* ---- 2. THE SOURCED CONTROL LADDER (proportional output only — see header). The error
     * is the CONTROL CHANNEL's — see the HR1 split note above. ---- */
    var P_ctl = drivers.indicated_pressure_mpa !== undefined ? drivers.indicated_pressure_mpa
                                                             : P;
    var err_psi = (P_ctl - pz.setpoint_mpa) * PSI;

    var prop = clip((CONTROL.prop_off_psi - err_psi) /
                    (CONTROL.prop_off_psi - CONTROL.prop_full_on_psi), 0, 1);
    if (err_psi <= CONTROL.backup_on_psi || backupOnLevel) pz.backupOn = true;
    else if (err_psi >= CONTROL.backup_off_psi && !backupOnLevel) pz.backupOn = false;

    /* Heater shed: SI / no AC (sourced), uncovered heaters (D2 §25.3's emptied regime), or
     * the 17 % low-level cut (WTSM 10.3 — a heater in a steam environment is a damaged one).
     * THE LATCH (#507 wave 4, NUREG-0737 II.E.3.1 (7) + Ginna TS Bases B 3.4.9 — the old
     * engine's rising-edge shape): an SI signal or a LOOP sheds the banks off the emergency
     * buses, and the GRID coming back does not re-load them — an operator does, by touching
     * the heater control (the caller clears pz.shedLatch on its heater command). Old saves
     * carry no latch fields and land healthy-false, the pre-wave-4 plant exactly. */
    /* TWO INDEPENDENT ACTUATING SIGNALS, each with its OWN edge (#510 H-6). The old single
     * OR'd edge meant a LOOP arriving AFTER an SI (heaters re-loaded between) never shed —
     * the second signal found the OR already high and no edge fired; 157.8 kW rode the
     * diesels through the design-basis LOCA+LOOP order. NUREG-0737 II.E.3.1's shed is a
     * bus-loading action on SI-or-LOOP: each arrival is its own action. Old saves carry no
     * _siPrev/_loopPrev and land false — the next standing signal re-arms, conservative. */
    var siSig = !!drivers.si_active;
    var loopSig = drivers.ac_available === false || drivers.offsite_ok === false;
    if ((siSig && !pz._siPrev) || (loopSig && !pz._loopPrev)) pz.shedLatch = true;
    pz._siPrev = siSig;
    pz._loopPrev = loopSig;
    /* the LATCH is the shed (the old engine's reading of the clarification: the source
     * "explicitly contemplates loading the heaters while the SI signal still stands", so a
     * standing signal does not re-shed past the operator's re-load). ac_available stays a
     * DIRECT term — a dead bus is physics, not a loading choice. */
    pz.heatersShed = !!pz.shedLatch || drivers.ac_available === false || pz.emptied ||
                     pz.lowLevelCut;
    var heatFrac = drivers.heaters_manual !== undefined ? clip(drivers.heaters_manual, 0, 1)
                                                        : prop;
    /* drivers.heaters_failed (#507 wave 6): the FAILURE seat — bank elements dead, output 0
     * whatever the demand or the shed state. A third seat, deliberately distinct from the
     * operator's manual override and the shed latch: a failure is not a lineup, and clearing
     * it must not touch either (the #200 split). */
    /* ⚠ THE MANUAL DEMAND SPANS THE INSTALLED TOTAL; AUTO KEEPS THE SOURCED TWO-BANK LADDER
     * (#538, 2026-08-28). The operator's 0..1 used to address the PROPORTIONAL bank alone,
     * with the backup group bolted on at `heaters_manual === 1` — a strict float equality, so
     * 0.999 delivered 36.36 kW and 1.0 delivered 157.80, a 4.34x cliff across a 0.1-point
     * move. The shell publishes heater_power_pct against the TOTAL, and the board's percent
     * box is ONE widget doing both, so the readback was 23 % of what the operator typed and
     * its MANUAL button — which re-sends the readback as the new demand — walked the bank
     * down: measured 14.45 -> 3.36 -> 0.78 -> 0.18 -> 0.04 kW in four presses. The same
     * currency break made the automation's "bumpless" hand-back (pwr_control.js's pzr_pressure
     * disengage, whose own hint promises the heaters freeze at their current output) drop
     * 36.4 kW to 8.4 kW.
     * MANUAL is therefore fraction-of-total, delivered continuously. That continuity is a
     * DECLARED simplification and a small one: the sourced backup group is 60 discrete
     * heaters (WTSM 3.2 — 18 proportional/414 kW, 60 backup/1380 kW), so its real granularity
     * is ~1.7 % of the installed total. AUTO is untouched and stays prototypical: the
     * proportional bank modulates and the backup group is a latched contactor on the sourced
     * pressure/level signals (Ginna UFSAR ch7). */
    /* THE ENERGIZED BANK — the bus load, after the shed latch and the failure seat. This is
     * what the heater kW INDICATION reads, because a real heater indication is electrical. */
    var Q_energized_kW = (pz.heatersShed || drivers.heaters_failed) ? 0
                       : drivers.heaters_manual !== undefined
                         ? heatFrac * (HEATERS.prop_kW + HEATERS.backup_kW)
                         : prop * HEATERS.prop_kW + (pz.backupOn ? HEATERS.backup_kW : 0);

    /* ---- THE WETTED FRACTION (#573) — PHYSICS, ON TRUE LEVEL ------------------------------
     * A rod in steam cannot heat water. `level_pct` is the plant's own liquid volume; the 17 %
     * bistable a few lines above reads `level_ctl`, the INSTRUMENT. That is the same HR1 split
     * this file already makes for the pressure ladder, and it is what makes HE-3 expressible:
     * a stuck level transmitter fools the latch, and this term is then the only thing bounding
     * the damage.
     *
     * ⚠ THE DRY FRACTION DELIVERS NOTHING — a DECLARED simplification, not an oversight. A
     * direct-immersion element in steam does transfer some heat, but through a film
     * coefficient two orders down; it burns out rather than usefully heating the steam space.
     * Crediting it would be re-opening #334's deadhead by arithmetic. Note the energy block
     * below still has an `m_stm` branch for the heater — with this term that branch becomes
     * unreachable, which is exactly the point (HE-3: "#334's 2207-psi steam-heating deadhead
     * becomes unreachable").
     *
     * ⚠ IT IS A VOLUME FRACTION, because `level_pct` is. On a straight-sided vessel that is the
     * height fraction; on this one the heads make them differ, and the BOARD is what has to
     * agree — `comp_pressurizer.js` maps level to a drawn height by volume for that reason
     * (#473). Declared here so the two cannot be reconciled in opposite directions later. */
    var wetted = HEATERS.elev_top_pct > HEATERS.elev_bot_pct
      ? clip((level_pct - HEATERS.elev_bot_pct) /
             (HEATERS.elev_top_pct - HEATERS.elev_bot_pct), 0, 1)
      : (level_pct > HEATERS.elev_top_pct ? 1 : 0);

    /* ⚠ DELIVERED AND ENERGIZED ARE DIFFERENT NUMBERS AND THE SPLIT IS LOAD-BEARING (#573).
     * `Q_heat_kW` is what reaches the water — the energy balance below and
     * `run_pwr2_engine`'s closed energy audit both sum THIS. `Q_energized_kW` is what the
     * gauge reads, and `pwr2_engine` publishes THAT as `pzr_heater_kw`.
     *
     * DERATING THE PUBLISHED NUMBER WOULD RESURRECT #538 BY A NEW ROAD: the shell derives
     * `heater_power_pct` from the published kW and the board's MANUAL button re-sends that
     * readback as the new demand, so a partly-uncovered bank would walk the operator's demand
     * down on every press — the same walk (14.45 -> 0.04 kW in four presses) that #538 fixed
     * from the other end. The readback must stay an identity. */
    var Q_heat_kW = Q_energized_kW * wetted;

    var sprayAuto = clip((err_psi - CONTROL.spray_start_psi) /
                         (CONTROL.spray_full_psi - CONTROL.spray_start_psi), 0, 1);
    var sprayFrac = drivers.spray_manual !== undefined ? clip(drivers.spray_manual, 0, 1)
                                                       : sprayAuto;
    /* drivers.spray_stick (#507 wave 6): the porv_stick twin — a PHYSICAL valve latched
     * open regardless of the controller or the operator's demand, which keeps moving and
     * stays ineffective (writing the override into the demand is the #200 trap the old
     * engine's spray_stuck comment names). Still needs RCP head and steam to condense. */
    pz.sprayStuck = !!drivers.spray_stick;
    if (pz.sprayStuck) sprayFrac = 1;
    /* THE PUMP, NOT THE FLOW — and the gate is DECLARED OFF (#537, see the SPRAY block). The
     * predicate that matters is the BREAKER (`sys.pumpTripped`), never loop flow: natural
     * circulation and the RHR floor both carry flow with no pump making head, which is the
     * same trap pwr2_shell's `rcp_running` comment records. While `rcp_gate_enforced` is
     * false the lever stands in for the auxiliary spray this board has no control for. */
    if (SPRAY.needs_rcp && SPRAY.rcp_gate_enforced && sys.pumpTripped === true) sprayFrac = 0;
    if (pz.waterSolid) sprayFrac = 0;                               /* no steam to condense */
    /* Auxiliary spray: operator-commanded, RCP-independent (see the SPRAY block) — but NOT
     * power-independent (#510 H-4): the CHARGING PUMPS drive it, and they are vital loads
     * dead in a blackout (pwr2_cvcs kills them on the same wire). Before this gate a plant
     * with ac_available false delivered 29 gpm of aux spray from a pump reporting zero flow
     * — 541 psi of depressurization through a blackout, measured. Absent means powered, the
     * house convention. */
    var auxFrac = (drivers.aux_spray === undefined || drivers.ac_available === false)
                  ? 0 : clip(drivers.aux_spray, 0, 1);
    if (pz.waterSolid) auxFrac = 0;

    /* ---- 3. RELIEF: controller PORV at +100 psi, mechanical safeties at 2500 psia. Both act
     * on their own (HR5: plant hardware) and are REPORTED for the caller to wire as a sink.
     *
     * THE TMI LEVERS (stage 2b, 2026-08-19; the stick became a LATCH 2026-08-25):
     *   drivers.porv_stick   ARMS the failure. It does NOTHING to a shut valve: the first lift
     *                        — the controller's own +100 psi lift or the operator's manual
     *                        open — latches ONE PORV open (pz.porvStuck), and from then on
     *                        neither the controller's reseat nor a manual close moves it. Only
     *                        clearing the failure releases the latch. TMI-2's valve was a
     *                        LEGITIMATE lift that never reseated, and that is the shape
     *                        *(OWNER DESIGN, 2026-08-25: "The PORV stuck failure injection should
     *                        work like a latch. it shouldnt just open the PORV, it shouldnt
     *                        activate until the PORV is opened. Once the PORV is opened, then the
     *                        failure injection can keep it opened.")*. Before this the injection
     *                        opened the valve itself, so the plant never had to lift it and the
     *                        pressure transient that lifts it was never part of the casualty.
     *                        Half the two-valve capacity, because one valve stuck is one valve.
     *   drivers.porv_manual  the operator's open demand on ONE PORV (the feed-and-bleed lift;
     *                        Ginna's control switches are per valve). Half capacity; closing it
     *                        is ineffective while the latch holds. Was routed through the stick
     *                        lever until 2026-08-25, which is why "open PORV" used to be a
     *                        failure injection.
     *   drivers.block_valve  the motor-operated isolation upstream of the PORVs — the operator
     *                        action that ENDED the TMI-2 loss (closed at 142 min). One combined
     *                        valve for the pair, declared (Ginna has one per PORV). Default
     *                        OPEN; closing it zeroes PORV discharge, stuck or commanded, and
     *                        never touches the code safeties, which have no isolation by design.
     * The stick is a FAILURE STATE, not an extra command path: the controller logic above runs
     * untouched, so an un-stuck PORV still cycles on its own ladder. */
    if (!pz.porvOpen && err_psi >= CONTROL.porv_open_psi) pz.porvOpen = true;
    else if (pz.porvOpen && err_psi <= RELIEF.porv_reseat_psi) pz.porvOpen = false;
    if (!pz.safetyOpen && P >= RELIEF.safety_open_mpa) pz.safetyOpen = true;
    else if (pz.safetyOpen && P <= RELIEF.safety_open_mpa * RELIEF.safety_reseat_frac) {
      pz.safetyOpen = false;
    }
    pz.porvManual = !!drivers.porv_manual;
    var stickArmed = !!drivers.porv_stick;
    if (!stickArmed) pz.porvStuck = false;                       /* the clear is the only release */
    else if (pz.porvOpen || pz.porvManual) pz.porvStuck = true;  /* the first lift latches it */
    if (drivers.block_valve !== undefined) pz.blockOpen = !!drivers.block_valve;
    var oneValve = pz.porvStuck || pz.porvManual;
    /* WHAT THE VESSEL OFFERS THE VALVES: steam from the steam region at ITS enthalpy
     * (superheated when it is); a SOLID vessel offers liquid from the pool — TMI's regime for
     * 95 % of the ride (measured 2026-08-26), where the same valve passes flashing water at
     * 2-4x the steam mass flux (criticalFlux). */
    var relief_h;
    if (pz.m_stm > STRATIFY.m_stm_floor_kg) relief_h = pz.h_stm;
    else if (pz.m_sat > 0) relief_h = pz.h_sat;
    else if (pz.m_sub > 0) relief_h = pz.h_sub;
    else relief_h = hg;
    /* THE FLOW IS AREA x CHOKED FLUX (#515 Build 2): each valve's effective area comes from its
     * sourced rating through the same law (reliefAreas), so a stuck PORV passes its rated 4.45
     * kg/s of steam AT the rating pressure and proportionally less below it — and 2-4x more
     * when the vessel is solid and it passes water. */
    var nPorv = !pz.blockOpen ? 0 : (pz.porvOpen ? 2 : (oneValve ? 1 : 0));
    var G_relief = (nPorv > 0 || pz.safetyOpen) ? criticalFlux(relief_h, P) : 0;
    var A = reliefAreas();
    var porv_kgs = nPorv * (A.porv_m2 / 2) * G_relief;
    var relief_kgs = porv_kgs + (pz.safetyOpen ? A.safety_m2 * G_relief : 0);

    /* ---- 3b. THE TAILPIPE — the TMI indication. A pipe-metal temperature: heats toward the
     * discharge steam's own T_sat while the PORV passes, cools toward ambient when it does not
     * — SLOWLY, which is the deceptive half: TMI-2's operators read a hot tailpipe as "always
     * hot" because it had been passing for years of small lifts. Both taus [open]; the
     * asymmetry (fast heat, slow cool) is the physical claim, not the numbers. */
    if (porv_kgs > 0) {
      pz.T_tail_c += dt * (W.T_sat(P) - pz.T_tail_c) / RELIEF.tail_tau_heat_s;
    } else {
      var amb = drivers.ambient_c === undefined ? 50 : drivers.ambient_c;
      pz.T_tail_c += dt * (amb - pz.T_tail_c) / RELIEF.tail_tau_cool_s;
    }

    /* ---- 4. ENERGY BY REGION. Heaters into the BOTTOM of the liquid (WTSM 3.2: "located in
     * the lower portion of the pressurizer vessel") — the stratified layer if there is one,
     * else the pool; a bottom layer that reaches saturation MERGES into the pool and boils
     * through 1a. Spray CONDENSES STEAM into the pool: m_spray·(h_f − h_cold) of steam
     * enthalpy above h_f is absorbed by the spray water, and that much steam mass becomes pool
     * liquid at h_f (efficiency 1, [declared]); the spray water's own mass stays in the loop.
     * Relief leaves from the steam region at ITS enthalpy (superheated when it is); a solid
     * vessel relieves liquid from the pool. ---- */
    if (Q_heat_kW > 0) {
      var dHh = Q_heat_kW * dt;
      if (pz.m_sub > STRATIFY.m_liq_floor_kg) pz.h_sub += dHh / pz.m_sub;
      else if (pz.m_sat > 0) pz.h_sat += dHh / pz.m_sat;
      else if (pz.m_stm > 0) pz.h_stm += dHh / pz.m_stm;
    }
    if (pz.m_sub > 0 && pz.h_sub >= hf) {
      addPool(pz, pz.m_sub, pz.h_sub); pz.m_sub = 0;
    }
    var Q_spray_kW = 0, m_spray = sprayFrac * SPRAY.max_kgs;
    if (m_spray > 0) {
      var h_cold = nodeH(sys, 'cold_leg');
      if (h_cold !== undefined && h_cold < hf) {
        Q_spray_kW = m_spray * (hf - h_cold);              /* condensing duty */
      }
    }
    var m_aux = auxFrac * SPRAY.aux_max_kgs, Q_aux_kW = 0;
    if (m_aux > 0) {
      Q_aux_kW = m_aux * (hf - W.h_l(SPRAY.aux_water_c, P));   /* VCT-cold water */
      Q_spray_kW += Q_aux_kW;
    }
    var spray_cond_kgs = 0;
    if (Q_spray_kW > 0 && pz.m_stm > 0) {
      var dmS = Math.min(Q_spray_kW * dt / Math.max(pz.h_stm - hf, 1), pz.m_stm);
      var Hgain = dmS * pz.h_stm - Q_spray_kW * dt;         /* = dmS·h_f unless steam ran out */
      pz.m_stm -= dmS;
      if (pz.m_sat + dmS > 0) {
        pz.h_sat = (pz.m_sat * pz.h_sat + Hgain) / (pz.m_sat + dmS); pz.m_sat += dmS;
      }
      spray_cond_kgs = dmS / dt;
    }
    if (relief_kgs > 0) {                                  /* relief_h was fixed in step 3 */
      var dmR = relief_kgs * dt;
      if (pz.m_stm > STRATIFY.m_stm_floor_kg) pz.m_stm = Math.max(0, pz.m_stm - dmR);
      else if (pz.m_sat > 0) pz.m_sat = Math.max(0, pz.m_sat - dmR);
      else if (pz.m_sub > 0) pz.m_sub = Math.max(0, pz.m_sub - dmR);
    }

    /* ---- 5. THE REGIMES, THE LEVEL, THE FREEZE (D2 §25.3: transitions, not clips). ---- */
    if (pz.m_stm <= STRATIFY.m_stm_floor_kg) {
      if (pz.m_stm > 0) { addPool(pz, pz.m_stm, pz.h_stm); pz.m_stm = 0; }
      pz.waterSolid = true;
    } else {
      pz.waterSolid = false;
    }
    var m_liq = pz.m_sub + pz.m_sat;
    pz.emptied = m_liq <= STRATIFY.m_liq_floor_kg;
    var V_liq = (pz.m_sub > 0 ? pz.m_sub / RHO(pz.h_sub, P) : 0) +
                (pz.m_sat > 0 ? pz.m_sat / RHO(pz.h_sat, P) : 0);
    pz.V_liq = clip(V_liq, 0, V);
    var hHi = W.h_v(W.LIMITS.TV_MAX, P);                   /* the envelope ceiling, once a step */
    if (pz.m_stm > 0 && pz.h_stm > hHi) pz.h_stm = hHi;
    if (pz.m_stm > 0 && pz.h_stm < hg) pz.h_stm = hg;      /* the interface cannot undercool steam */
    /* what the NEXT insurge arrives at: the hot leg's enthalpy now (one-step lag, the house
     * convention) — this is what makes the bottom layer stratified rather than saturated */
    pz.h_fill = h_hot !== undefined ? h_hot : hf;
    freeze(pz, P);

    return {
      P: P,
      level_frac: pz.V_liq / V,
      level_pct: 100 * pz.V_liq / V,
      m_pzr: pz.m_pzr,
      surge_kgs: surge_kgs,
      surge_heat_kW: surge_heat_kW,
      /* DELIVERED into the water (energized x wetted) — the number the energy balance uses and
       * the one `run_pwr2_engine`'s closed audit sums. NOT the gauge; see the split above. */
      heater_kW: Q_heat_kW,
      /* THE BUS LOAD, un-derated — what an electrical kW indication reads, and what the shell
       * publishes so #538's readback round trip stays an identity on an uncovered bank. */
      heater_energized_kW: Q_energized_kW,
      /* the fraction of the bank under water, for the gate and for the board's drawing (#473) */
      heater_wetted_frac: wetted,
      heater_frac: heatFrac,
      backup_on: pz.backupOn,
      heaters_shed: pz.heatersShed,
      spray_frac: sprayFrac,
      spray_stuck: pz.sprayStuck === true,
      spray_kgs: m_spray,
      spray_duty_kW: Q_spray_kW,
      aux_spray_frac: auxFrac,
      aux_spray_kgs: m_aux,
      aux_spray_duty_kW: Q_aux_kW,
      porv_open: pz.porvOpen || ((pz.porvStuck || pz.porvManual) && pz.blockOpen),
      porv_stuck: pz.porvStuck,                /* LATCHED — armed and lifted, not merely armed */
      porv_stick_armed: stickArmed,
      porv_manual: pz.porvManual,
      block_valve_open: pz.blockOpen,
      tailpipe_temp_c: pz.T_tail_c,
      safety_open: pz.safetyOpen,
      relief_kgs: relief_kgs,
      relief_h: relief_h,
      water_solid: pz.waterSolid,
      emptied: pz.emptied,
      hi_level_trip: pz.V_liq / V >= GEOM.hi_level_trip_frac,
      err_psi: err_psi,
      /* the level control system (WTSM 10.3) */
      level_program_pct: program_pct,
      charging_demand: charging_demand,
      letdown_isolated: pz.lowLevelCut,
      low_level_cut: pz.lowLevelCut,
      level_hi_alarm: level_pct >= LEVEL.hi_alarm_pct,
      /* the two regions (2026-08-25) */
      m_stm_kg: pz.m_stm,
      m_liq_kg: m_liq,
      steam_superheat_kJkg: pz.m_stm > 0 ? Math.max(0, pz.h_stm - hg) : 0,
      pool_subcool_kJkg: pz.m_sat > 0 ? Math.max(0, hf - pz.h_sat) : 0,
      cond_kgs: cond_kgs,
      boil_kgs: boil_kgs,
      rain_kgs: rain_kgs,
      spray_cond_kgs: spray_cond_kgs
    };
  }

  function nodeH(sys, id) {
    for (var i = 0; i < sys.nodes.length; i++) {
      if (sys.nodes[i].id === id) return sys.nodes[i].h;
    }
    return undefined;
  }
  function clip(x, a, b) { return x < a ? a : (x > b ? b : x); }

  root.RD.pwr2.pressurizer = {
    GEOM: GEOM, HEATERS: HEATERS, SPRAY: SPRAY, CONTROL: CONTROL, RELIEF: RELIEF, LEVEL: LEVEL,
    STRATIFY: STRATIFY,
    createPressurizer: createPressurizer,
    migrateState: migrateState,
    extraMassFn: extraMassFn,
    seatMass: seatMass,
    criticalFlux: criticalFlux,
    reliefAreas: reliefAreas,
    stepPressurizer: stepPressurizer,
    levelProgram: levelProgram,
    _satSplit: satSplit
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
