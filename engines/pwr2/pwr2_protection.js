/* pwr2_protection.js — Layer 5: THE REACTOR PROTECTION SYSTEM. (#479)
 *
 * PWR2 could model a core that destroys itself before it could model the system that stops that
 * happening. Measured consequence, recorded in `pwr2_true_state.js` since the shim was written:
 * **a full load rejection is ridden out on relief at ~67 % power where a real plant scrams.** So
 * every casualty this engine can produce started from an UNSCRAMMED plant, which is the wrong
 * initial condition for all of them.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ WHAT THIS FILE DOES AND DOES NOT DO — the Hard Rule 5 line, drawn where `pwr2_relief.js`
 * draws it.
 *
 * The reactor protection system is AUTOMATIC PLANT HARDWARE, not an operator action, so it acts
 * on its own the way a safety valve lifts on pressure — `pwr2_relief.js` models exactly that split
 * already: its SAFETY valves lift by themselves, while its DUMP takes a demand from the caller
 * because a dump position is a control-layer decision.
 *
 * So this file **evaluates the sourced trip functions against plant state, applies each function's
 * sourced time delay, and LATCHES**. What it does NOT do is move anything:
 *
 *   - it does not insert the rods. It reports `reactor_trip`; the caller drives `rodGroups`.
 *   - it does not start a pump, shut a valve, or isolate anything. It reports `si` and the caller
 *     lines up `pwr2_eccs` / `pwr2_afw`, exactly as those two files' own headers require.
 *
 * That split is the same shape as `pwr2_afw.js` returning a kg/s the caller must add to
 * `drivers.feed`. **A trip reported and not acted on is a WIRING GAP, and it is visible** — the
 * shim will show `scrammed` true while power stays up.
 *
 * ---------------------------------------------------------------------------------------
 * SOURCED — Ginna UFSAR ch15 (ML20339A101) **Table 15.0-6, "Summary of RPS and ESFAS Functions
 * Actuated"**, which gives a setpoint AND an analysis delay for each function. Verbatim rows:
 *
 *     High-Pressurizer Pressure Reactor Trip .................. 2425 psia      2.0 s
 *     Low-Pressurizer Pressure Reactor Trip .................. 1775 psia      2.0 s
 *     Power-Range High Neutron Flux Reactor Trip (Low) ....... 35 %           0.5 s
 *     Power-Range High Neutron Flux Reactor Trip (High) ...... 118 %          0.5 s
 *     Low RCL Flow Reactor Trip .............................. 87 %           1.0 s
 *     Low-Pressurizer Pressure Safety Injection .............. 1715.0 psia
 *     Low Steam Pressure Safety Injection .................... 327.7 psia (lead/lag=12/2)  2.0 s
 *     High-High Steam Flow Setpoint .......................... 155 % of nominal            2.0 s
 *
 * The high-flux HIGH setting appears twice in the table — "115%" in the 15.4.2 row and "118%
 * (high setting)" in the 15.4.5 rod-ejection row. **118 % is used and the disagreement is
 * declared**, because 15.4.5 states the setting explicitly as "(high setting)" while the 15.4.2
 * row's number sits in a column the OCR has already shifted once on this page.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ WHAT IS DELIBERATELY NOT BUILT, AND WHY. Each of these is a REAL protection function that a
 * consumer might expect; every one is absent for a reason, not an oversight.
 *
 * **OVERTEMPERATURE ΔT AND OVERPOWER ΔT — the most important omission, and the best-evidenced.**
 * These are the DNBR protection and they are what a real plant trips on first in most transients.
 * The corpus has BOTH halves and they cannot be joined:
 *
 *   - Ginna UFSAR ch15 Table 15.0-7 gives the CONSTANTS: K1 1.30, K2 0.00093/psi, K3 0.0185/degF,
 *     K4 1.15, K5 0.0014/degF, K6 0.00/degF, T' 564.6-576.0 degF, P' 2250 psia.
 *   - NUREG-1431 Rev 4 Vol 1 (ML12100A222) Table 3.3.1-1 Note 1 gives the EQUATION — and every
 *     single constant in it is a bracketed placeholder, *"These values denoted with [*] are
 *     specified in the COLR"*. The transfer-function structure is also OCR-scrambled on that page.
 *
 * **And the two documents TRANSPOSE THE UNITS on the symbols.** NUREG-1431 has `K2 [*]/degF` and
 * `K3 [*]/psig`; Ginna has K2 in /psi and K3 in /degF. So mapping Ginna's constants onto
 * NUREG-1431's equation requires guessing which symbol carries which term — an inference across
 * two documents that disagree, on a page one of them has already mangled. That is the bracketed-
 * placeholder trap and the OCR-column trap at the same time. **Having the constants is not having
 * the equation.** Left out rather than assembled; an evidence pass owes the plant-specific
 * Technical Specification table.
 *
 * **LOW-LOW STEAM GENERATOR WATER LEVEL — BUILT (2026-08-20, owner ruling this session).** This
 * paragraph used to declare the level trips "not buildable" because `pwr2_true_state.js` had no
 * gauge — a premise that EXPIRED when Option B stage B1 adopted the sourced `sg_mass_map`
 * geometry and the shim started emitting a real `sg_level_pct`. (The premise-ages-independently
 * trap, #460's lesson, caught standing in this file's own header.) The lo-lo function is ONE
 * bistable with TWO consumers [sourced] — Ginna TS Bases B 3.3.1 Function 13 (ML20339A221): the
 * trip Function "also performs the Engineered Safety Feature Actuation System (ESFAS) function
 * of starting the AFW pumps on low low SG level." See the SGLL block below for the
 * setpoint/delay sourcing. HIGH-HIGH level (P-14 class: feedwater regulator closure + turbine
 * trip) — BUILT with the feed train (2026-08-21), which gave the plant the regulating valve
 * the function closes; the kind-'fwi' row and its own `fwi` latch below.
 *
 * **RCP UNDERVOLTAGE AND UNDERFREQUENCY** (57 Hz sourced). NOT BUILT — and the reason has
 * moved (#510 batch 2, was "no electrical model exists"): the two-bus electrical model has
 * existed since #507 wave 4 (`pwr2_engine`'s elec pair; `station_blackout`/`ac_available`
 * are LIVE contract fields), but it carries no voltage or frequency, only bus booleans, so
 * a 57 Hz setpoint still has nothing to read. The LOOP/SBO rows trip the RCPs directly at
 * the facade instead.
 *
 * **TURBINE TRIP / P-9 ANTICIPATORY TRIP — BUILT** (2026-08-19, PWR2_VALIDATION.md §51; this
 * line used to say "no trip state", stale since the turbine gained one).
 *
 * ---------------------------------------------------------------------------------------
 * UNITS ARE SI INTERNALLY. Sourced setpoints are psia and are converted ONCE, at the block below,
 * the same discipline `pwr2_afw.js` uses for gpm.
 */
(function (root) {
  'use strict';

  var PSIA_PER_MPA = 145.0377;

  /* ---- SOURCED: Ginna UFSAR ch15 Table 15.0-6 ---------------------------------------------- */
  var RPS = {
    kind: '[sourced]',
    hi_pzr_press_psia:  2425,
    lo_pzr_press_psia:  1775,
    hi_flux_lo_frac:    0.35,
    hi_flux_hi_frac:    1.18,
    lo_flow_frac:       0.87,
    /* stage 2b (2026-08-19): the HIGH PRESSURIZER LEVEL trip. Ginna TS Bases B 3.4.9
     * (ML20339A221): "the upper limit is the same as the Pressurizer High Level Trip" -- the
     * 650 ft3 / 87 % point this engine's vessel already carries. WTSM 10.3.4.3 gives the
     * generic function's SHAPE: 2-of-3 level channels, "to protect the RCS pressure boundary
     * by tripping the reactor before the pressurizer completely fills", "at a value low enough
     * to prevent the discharge of water through the pressurizer safety valves", and it is an
     * AT-POWER trip -- "only active if either reactor power or turbine power is 10% or greater
     * ('at-power permissive' P-7)". The 4-loop plant's 92 % is noted; Ginna's 87 % is carried
     * (the anchor plant, and the same number the level instrument's own trip flag uses). */
    hi_pzr_level_frac:  0.87,
    src: 'Ginna UFSAR ch15 (ML20339A101) Table 15.0-6; hi level Ginna TS Bases B 3.4.9 + WTSM 10.3.4.3'
  };
  /* P-7, the at-power permissive gating the high-level trip. UNLIKE P-10 there is no operator
   * request anywhere in it -- below 10 % power the function is simply not active, above it is
   * -- so it is a plain automatic gate, not a revoked request. WTSM 10.3.4.3 verbatim. */
  /* [adopted] the P-11 pressurizer-pressure permissive — pwr1's ~1970 psig / 13.6 MPa pair
   * (its lo_press/si_trip block permissive); Ginna's own installed figure is not in corpus.
   * Below it the operator MAY block the low-pressure trip and the SI actuation (the
   * cooldown's lineup); above it both requests are REVOKED — see the stepProtection note. */
  var P11 = { kind: '[adopted]', mpa: 13.6 };
  var P7 = {
    kind: '[sourced]',
    frac: 0.10,
    src: 'WTSM 10.3 (ML11223A290) sec 10.3.4.3'
  };
  var ESFAS = {
    kind: '[sourced]',
    si_lo_pzr_press_psia:   1715.0,
    si_lo_steam_press_psia: 327.7,
    hi_hi_steam_flow_frac:  1.55,
    src: 'Ginna UFSAR ch15 (ML20339A101) Table 15.0-6'
  };
  /* ---- SOURCED: low-low steam generator water level — ONE bistable, TWO consumers ------------
   * Ginna TS Bases B 3.3.1 Function 13 (ML20339A221): the reactor-trip Function "also performs
   * the Engineered Safety Feature Actuation System (ESFAS) function of starting the AFW pumps
   * on low low SG level" — so ONE table row below carries both the trip and the AFW start,
   * exactly the source's own wiring (and PWR1's, #380).
   *
   * TWO SOURCED VALUES EXIST for the setpoint, and the INSTALLED one is carried:
   *   - ch10 §10.5.3.1.3 (ML20339A040): "The motor-driven preferred auxiliary feedwater system
   *     pumps will start if one steam generator level decreases to a low-low level of 17%"
   *     (narrow-range span) — the plant's field setting.
   *   - Table 15.0-6 (ML20339A101): "0% NRS" — the ANALYSIS limit the ch15 events assume.
   * 17 % is used because this sim models the plant as operated (HR9); the 0 % figure is a
   * bounding assumption, not the bistable's setting. NUREG-1431's "[30.4]%/[32.3]%" are
   * bracketed COLR placeholders, not numbers (the #380 trap, recorded in CLAUDE.md). ch10's
   * "+13.9% error ... at a containment temperature of 286F" adder is deliberately NOT added —
   * it compensates an adverse-environment instrument error this model does not represent.
   *
   * THE SINGLE-LOOP COLLAPSE, DECLARED: the source starts the MDAFW pumps on ONE SG lo-lo and
   * the TDAFW pump on BOTH SGs lo-lo. This plant has one steam generator, so the two conditions
   * are the same event and both pumps start on it. SI starts the MDAFW pumps ONLY (ch10: "Upon
   * receipt of a safety injection signal, the two motor-driven preferred auxiliary feedwater
   * pumps will start") — that distinction survives the collapse and is kept.
   *
   * THE LOSS-OF-MAIN-FEED START — BUILT with the feed train (2026-08-21): "If both main
   * feedwater pumps fail ... the motor-driven auxiliary feedwater pumps (MDAFW) will start
   * automatically" (ch10). Input is drivers.main_feed_lost, a STATE signal (breaker
   * positions — the turbine_tripped convention); the same source sentence's "the turbine
   * will be tripped" is the CALLER's half, wired in the facade.
   *
   * THE LOSS-OF-OFFSITE-POWER START — BUILT with the electrical model (#507 wave 4): "All
   * three preferred auxiliary feedwater pumps will start on loss of offsite power" (ch10).
   * Input is drivers.loss_of_offsite, a STATE signal (bus deadness — the main_feed_lost
   * convention); this plant's one-of-each lineup collapses "all three" to both pumps. The
   * start latches whether or not the MDAFW pump's bus can then turn it — in a blackout the
   * latched demand meets mdafw_power_ok false in pwr2_afw and delivers nothing, which is
   * the #200 running-with-no-flow split doing its job, not a contradiction.
   */
  var SGLL = {
    kind: '[sourced]',
    lolo_frac: 0.17,
    /* THE HIGH-HIGH (P-14 class) — BUILT with the feed train (2026-08-21), which gave the
     * plant the regulating valve the function closes. Consequences [sourced]: "High-High
     * Steam Generator Water Level Feedwater Regulator Valve Closure" (Table 15.0-6, analysis
     * setpoint 100 % NRS, at-closure delay 22.0 s — a consequence figure, the SI-32.0
     * reading) and "a high-high steam generator level turbine trip to protect the turbine
     * against excessive moisture carryover" (WTSM 3.2, ML11223A213). The INSTALLED 0.90 is
     * [adopted] — the current engine's P-14 value (WTSM-derived, pwr_control.js); Ginna's
     * own installed figure is not in corpus and NUREG-1431's is a bracketed placeholder. */
    hi_hi_frac: 0.90,
    src: 'Ginna UFSAR ch10 (ML20339A040) sec 10.5.3.1.3 "low-low level of 17%"; one-bistable-' +
         'two-consumers Ginna TS Bases B 3.3.1 Function 13 (ML20339A221); hi-hi consequences ' +
         'Table 15.0-6 + WTSM 3.2 (ML11223A213), installed value [adopted] from the current engine'
  };
  /* ---- SOURCED: the OT-delta-T / OP-delta-T setpoint coefficients, Table 15.0-7 -------------
   * Ginna UFSAR ch15 (ML20339A101), "Overtemperature and Overpower [delta]T Setpoints" —
   * found IN THE CORPUS on 2026-08-19 after this function had carried "blocked on a source"
   * for days (the find-source-before-declaring-unsourced trap). K1 1.30 and K4 1.15 are the
   * table's own "(safety analysis value)" rows. The trip compares loop delta-T, normalized to
   * full-power delta-T, against a setpoint varied by Tavg and pressure:
   *
   *   OT: sp = K1 + K2*(P - P') - K3*(T - T')     [P psia, T degF — the source's units]
   *   OP: sp = K4 - K6*(T - T')                    [K6 = 0.00/degF, the table's value]
   *
   * DECLARED, each with its reason:
   *   - f(delta-I): the table's penalty has a DEADBAND of -14 % to +6 % delta-I. This plant's
   *     core is one lumped node, so its axial flux difference reads identically zero — INSIDE
   *     the deadband — and the penalty is exactly 0 by the table's own shape. Sourced zero,
   *     not a stub.
   *   - The dynamic compensation (TS Bases B 3.3.1: "for system piping delays from the core
   *     to the temperature measurement system"; footnote b of Table 15.0-6: RTD lag 2.0 s +
   *     hot-leg filter 3.5/6.0 s) corrects MEASUREMENT lag — and this protection reads TRUE,
   *     unlagged values (PWR2 has no instrument layer yet). The compensation comes with the
   *     instrument layer, not before it.
   *   - OP's K5 rate term (0.0014/degF, increasing-Tavg-only) needs its compensation time
   *     constant, which lives in the COLR and is not in the corpus. Omitted, declared; with
   *     K6 = 0.00 the OP setpoint is the flat K4 until then.
   *   - T' is "to be set equal to or less than the full power operating TAVG chosen"
   *     (footnote b of 15.0-7) — set equal to THIS plant's design full-power Tavg. P' is the
   *     table's 2250 psia, kept even though this plant's setpoint is 2235 (the correction is
   *     -0.014 at nominal, the source's own geometry). */
  var OTDT = {
    kind:  '[sourced]',
    k1:    1.30,
    k2_per_psi: 0.00093,
    k3_per_f:   0.0185,
    k4:    1.15,
    k6_per_f:   0.00,
    t_ref_f:    304.5 * 9 / 5 + 32,   /* T' = design full-power Tavg (580.1 degF), per footnote */
    p_ref_psia: 2250.0,
    src: 'Ginna UFSAR ch15 (ML20339A101) Table 15.0-7'
  };
  /* ---- SOURCED: the P-10 permissive, and it is an ASYMMETRIC gate on the low flux trip ------
   * Ginna TS Bases B 3.3.1 (ML20339A221), on Power Range Neutron Flux-Low, verbatim:
   *
   *   *"This Function may be MANUALLY BLOCKED by the operator when two-out-of-four power range
   *    channels are greater than approximately 8% RTP (P-10 setpoint). This Function is
   *    AUTOMATICALLY UNBLOCKED when three-out-of-four power range channels are below the P-10
   *    setpoint. Above the P-10 setpoint, positive reactivity additions are mitigated by the
   *    Power Range Neutron Flux-High trip Function."*
   *
   * ⚠ THE TWO HALVES ARE NOT SYMMETRIC AND THAT IS THE WHOLE MODEL. Blocking is an OPERATOR
   * action that the permissive merely PERMITS; unblocking is AUTOMATIC and the operator has no
   * say in it. So the block is a permissive-gated ENABLE that always auto-reinstates — never a
   * defeatable trip. This engine's predecessor shipped a "proactive block" that was exactly the
   * defeatable version and it had to be superseded (#295 F1/F2).
   *
   * The Bases also says permissive values "are to be treated as a Nominal value", and the text
   * says "approximately" — so 8 % is carried as the nominal it is, not as a precise threshold.
   * Two-out-of-four and three-out-of-four are CHANNEL logic; this plant has one lumped flux
   * signal, so both reduce to the same comparison. Declared, not silently collapsed. */
  var P10 = {
    kind: '[sourced]',
    frac: 0.08,
    src: 'Ginna TS Bases B 3.3.1 (ML20339A221), Power Range Neutron Flux-Low'
  };
  /* ---- SOURCED: the P-9 permissive, and it has TWO values by design --------------------------
   * Ginna TS Bases B 3.3.1 (ML20339A221), Power Range Neutron Flux, P-9 Permissive, verbatim:
   *
   *   *"actuated at approximately 50% power as determined by two-out-of-four NIS power range
   *    detectors if the Steam Dump System is available and at approximately 8% if the Steam
   *    Dump System is unavailable ... Above the P-9 setpoint, a turbine trip will cause a load
   *    rejection beyond the capacity of the Steam Dump System and RCS. A reactor trip is
   *    automatically initiated on a turbine trip when it is above the P-9 setpoint."*
   *
   * The setpoint IS the dump system's load-rejection capacity margin, which is why it moves
   * when the dumps are unavailable. "Approximately", nominal — same reading as P-10's. Channel
   * logic (2/4) collapses to one comparison on this plant's lumped flux signal, declared. */
  var P9 = {
    kind: '[sourced]',
    frac_dumps: 0.50,
    frac_no_dumps: 0.08,
    src: 'Ginna TS Bases B 3.3.1 (ML20339A221), P-9 Permissive'
  };

  /* THE RESET PERMISSIVE (#512) [sourced — WTSM 12.3.2.3, ML11223A310]: the reset circuit's
   * time-delay relay "produces an output (energizes) some time after it is started (usually
   * 45 - 60 sec)"; the top of the band is used. SI reset additionally requires P-4 (the
   * reactor trip contact, same figure). AFAS/FWI adopt the same logic family [derived —
   * the source details the SI circuit; the actuation circuits share the design]. */
  var RESET = {
    kind: '[sourced]',
    delay_s: 60,
    src: 'WTSM 12.3.2.3 (ML11223A310), the SI reset circuit'
  };

  /* Analysis delays, same table, same rows. A function must hold CONTINUOUSLY for its delay. */
  var DELAY = {
    kind: '[sourced]',
    hi_pzr_press: 2.0, lo_pzr_press: 2.0,
    hi_flux_lo:   0.5, hi_flux_hi:   0.5,
    lo_flow:      1.0,
    hi_pzr_level: 2.0,         /* [open] -- not in the 15.0-6 delay set; matches the pressure channels */
    ot_delta_t: 2.0, op_delta_t: 2.0,  /* [sourced] 15.0-6 footnote b: "a delay of 1.5 (or 2.0)
                                        * seconds was assumed to account for electronic delays,
                                        * reactor trip breakers opening, and RCCA gripper
                                        * release" -- the sourced pair's conservative member */
    si_lo_pzr_press: 2.0,      /* see the note below — the table's column is ambiguous here */
    si_lo_steam_press: 2.0,
    hi_hi_steam_flow: 2.0,
    hi_hi_sg_level: 2.0,       /* [derived] signal delay by the module's SI-32.0 precedent; the
                                * table's 22.0 s is the valve's AT-CLOSURE figure, a consequence */
    sg_lolo_level: 2.0         /* [sourced] 15.0-6, 15.2.6 LONF: "Low-Low Steam Generator Water
                                * Level Reactor Trip 0% NRS 2.0". The SAME table's AFW row reads
                                * "AFW Pump Start 0% NRS 60.0" — that 60 s is the analysis'
                                * pumps-AT-FULL-FLOW figure (diesel loading, valve strokes), a
                                * consequence delay like the SI 32.0 below, not a signal delay.
                                * The one bistable actuates both consumers at 2.0 s here; the
                                * no-spin-up pump model (pwr2_afw.js, declared) then delivers
                                * rated flow immediately, which is OPTIMISTIC against the
                                * analysis' 60 s by that declared simplification's own width. */
  };
  /* ⚠ ONE DELAY IS NOT CLEANLY SOURCED AND IS DECLARED. The 15.1.6 row reads "Low-Pressurizer
   * Pressure Safety Injection 1715.0 psia 32.0", but the SAME table carries "Feedwater Isolation
   * Delay from SI ... 32.0" and "SI Pumps at Full Flow Following SI Signal ... 12.0/22.75". 32 s
   * is far too long to be a SIGNAL delay and matches the feedwater-isolation row exactly, so the
   * column is reporting a consequence delay rather than an actuation delay. 2.0 s is used, matching
   * every other pressure function in the table. THE SETPOINT IS SOURCED; this delay is [derived]
   * from the table's own internal consistency and should be corrected if the plant-specific
   * response-time table turns up. */

  /* ---- THE LEAD/LAG ON LOW STEAM PRESSURE, and it is load-bearing ---------------------------
   * The table writes the low-steam-pressure safety injection setpoint as "327.7 psia
   * (lead/lag=12/2)" — the compensation is part of the setpoint, not decoration. The existing
   * engine learned that the expensive way (#433/#403): a steam-line isolation whose rate
   * compensation had been dropped NEVER fired automatically, because the raw crossing arrived
   * ~103 s after a full-area break, long after the latch it fed had expired. Three green probes
   * certified an isolation that could not complete.
   *
   *     (1 + T1*s) / (1 + T2*s),  T1 = 12 s, T2 = 2 s
   *
   * Discretised as y += (dt/T2)*(u - y) + (T1/T2)*(u - u_prev), the standard form: the first term
   * is the lag and the second is the lead acting on the INPUT's change over the step. On a falling
   * pressure the lead term drives the compensated signal BELOW the raw one, which is the whole
   * point — it trips early on a fast transient and not at all on a slow drift. */
  var LEADLAG = { kind: '[sourced]', lead_s: 12.0, lag_s: 2.0,
                  src: 'Ginna UFSAR ch15 Table 15.0-6, "(lead/lag=12/2)"' };

  /* THE FUNCTION TABLE. Each entry is evaluated the same way, so a new one cannot arrive with its
   * own private comparison logic. `dir` is the side that trips: -1 trips LOW, +1 trips HIGH. */
  function functions() {
    return [
      { id: 'hi_pzr_press', name: 'High pressurizer pressure', kind: 'rps', dir: +1,
        sp: RPS.hi_pzr_press_psia / PSIA_PER_MPA, unit: 'MPa', read: 'pressure_mpa',
        delay: DELAY.hi_pzr_press },
      { id: 'lo_pzr_press', name: 'Low pressurizer pressure', kind: 'rps', dir: -1,
        sp: RPS.lo_pzr_press_psia / PSIA_PER_MPA, unit: 'MPa', read: 'pressure_mpa',
        delay: DELAY.lo_pzr_press },
      { id: 'hi_flux_lo', name: 'Power-range high flux (low setting)', kind: 'rps', dir: +1,
        sp: RPS.hi_flux_lo_frac, unit: 'frac', read: 'power_frac', delay: DELAY.hi_flux_lo,
        blockable: true },
      { id: 'hi_flux_hi', name: 'Power-range high flux (high setting)', kind: 'rps', dir: +1,
        sp: RPS.hi_flux_hi_frac, unit: 'frac', read: 'power_frac', delay: DELAY.hi_flux_hi },
      /* atPower (P-7) since #507 wave 10 [sourced — Ginna TS Bases B 3.3.1: the loss-of-flow
       * Functions are required above P-7 and blocked below it]: a shutdown plant with its
       * RCPs deliberately secured is not a loss-of-flow accident. Latent until the first
       * RCPs-off IC existed — every earlier state carried flow. */
      { id: 'lo_flow', name: 'Low reactor coolant loop flow', kind: 'rps', dir: -1,
        sp: RPS.lo_flow_frac, unit: 'frac', read: 'flow_frac', delay: DELAY.lo_flow,
        atPower: true },
      { id: 'hi_pzr_level', name: 'High pressurizer level', kind: 'rps', dir: +1,
        sp: RPS.hi_pzr_level_frac, unit: 'frac', read: 'pzr_level_frac',
        delay: DELAY.hi_pzr_level, atPower: true },
      /* ONE bistable, TWO consumers (the SGLL block above): this row IS the reactor trip, and
       * its `tripping` also drives the AFW-start latches after the loop. kind 'rps' on purpose
       * — inventing a third kind would put the AFW start in this row and the trip in a twin,
       * which is not the source's wiring. */
      { id: 'sg_lolo_level', name: 'Low-low steam generator water level', kind: 'rps', dir: -1,
        sp: SGLL.lolo_frac, unit: 'frac', read: 'sg_level_frac', delay: DELAY.sg_lolo_level },
      /* kind 'fwi': not a reactor trip and not SI -- its own latch. Closes the feed regulating
       * valve and trips the turbine (the SGLL block's sourced consequences). */
      { id: 'hi_hi_sg_level', name: 'High-high steam generator water level', kind: 'fwi', dir: +1,
        sp: SGLL.hi_hi_frac, unit: 'frac', read: 'sg_level_frac', delay: DELAY.hi_hi_sg_level },
      { id: 'si_lo_pzr_press', name: 'Safety injection on low pressurizer pressure',
        kind: 'esfas', dir: -1, sp: ESFAS.si_lo_pzr_press_psia / PSIA_PER_MPA, unit: 'MPa',
        read: 'pressure_mpa', delay: DELAY.si_lo_pzr_press },
      { id: 'si_lo_steam_press', name: 'Safety injection on low steam pressure', kind: 'esfas',
        dir: -1, sp: ESFAS.si_lo_steam_press_psia / PSIA_PER_MPA, unit: 'MPa',
        read: 'steam_pressure_mpa', delay: DELAY.si_lo_steam_press, leadlag: true },
      { id: 'hi_hi_steam_flow', name: 'High-high steam flow', kind: 'esfas', dir: +1,
        sp: ESFAS.hi_hi_steam_flow_frac, unit: 'frac', read: 'steam_flow_frac',
        delay: DELAY.hi_hi_steam_flow },
      /* The delta-T pair compare a MEASURED fraction against a COMPUTED setpoint — spFn
       * resolves per step from Tavg and pressure; sp is the nominal-condition value so the
       * row still reads sensibly in a listing. Both need delta_t_frac AND tavg_c: absent
       * either, the row goes unavailable (never silently static). */
      { id: 'ot_delta_t', name: 'Overtemperature delta-T', kind: 'rps', dir: +1,
        sp: OTDT.k1, unit: 'frac', read: 'delta_t_frac', delay: DELAY.ot_delta_t,
        spFn: function (d) {
          if (typeof d.tavg_c !== 'number' || !isFinite(d.tavg_c)) return undefined;
          return OTDT.k1 + OTDT.k2_per_psi * (d.pressure_mpa * PSIA_PER_MPA - OTDT.p_ref_psia)
                        - OTDT.k3_per_f * ((d.tavg_c * 9 / 5 + 32) - OTDT.t_ref_f);
        } },
      { id: 'op_delta_t', name: 'Overpower delta-T', kind: 'rps', dir: +1,
        sp: OTDT.k4, unit: 'frac', read: 'delta_t_frac', delay: DELAY.op_delta_t,
        spFn: function (d) {
          if (typeof d.tavg_c !== 'number' || !isFinite(d.tavg_c)) return undefined;
          return OTDT.k4 - OTDT.k6_per_f * ((d.tavg_c * 9 / 5 + 32) - OTDT.t_ref_f);
        } }
    ];
  }

  /* createProtection(opts)
   *   opts.blockLowFlux   the OPERATOR'S REQUEST to block the low flux setting. It is a request,
   *                       not a state: P-10 gates whether it takes effect and revokes it
   *                       automatically below 8 % power. Defaults to NOT REQUESTED — the
   *                       conservative end, and the one that cannot silently disable a trip
   *                       nobody remembered was blockable. A plant AT POWER has it requested;
   *                       a fixture that wants that must STATE it (#460's lesson: every probe
   *                       that broke was inheriting a lineup instead of stating it). */
  function createProtection(opts) {
    opts = opts || {};
    var held = {}, fns = functions();
    for (var i = 0; i < fns.length; i++) held[fns[i].id] = 0;
    return {
      held_s: held,                         /* how long each function has been asserted */
      blockLowFlux: !!opts.blockLowFlux,
      /* the P-11 pair (#507 wave 10) — a shutdown IC boots with the cooldown's blocks taken */
      blockLoPress: !!opts.blockLoPress,
      blockSI: !!opts.blockSI,
      reactor_trip: false,                  /* LATCHED */
      dtApproach: false,                    /* the rod-stop/runback bistable, with hysteresis */
      si: false,                            /* LATCHED */
      afas_mdafw: false,                    /* LATCHED — the AFW starts, same law as si */
      afas_tdafw: false,                    /* LATCHED */
      fwi: false,                           /* LATCHED — hi-hi feedwater isolation */
      trip_cause: null,
      si_cause: null,
      afas_mdafw_cause: null,
      afas_tdafw_cause: null,
      fwi_cause: null,
      /* the LIVE signals (#512) — is the actuating condition present now, latch aside */
      si_live: false, afas_mdafw_live: false, afas_tdafw_live: false, fwi_live: false,
      /* THE RESET LOGIC (#512) [sourced — WTSM 12.3.2.3, ML11223A310]: the reset circuit's
       * time-delay relay ("usually 45 - 60 sec") gates the operator's reset; *_t is each
       * latch's age against it. After a reset "all automatic SI actuation signals are
       * blocked" — *_rearm_block — re-armed here when the live signal clears (the manual
       * re-actuation pushbutton that also re-arms the real circuit is declared unmodeled;
       * the board's START starts pumps directly). */
      si_t: 0, afas_t: 0, fwi_t: 0,
      si_rearm_block: false, afas_rearm_block: false, fwi_rearm_block: false,
      ll_y: null, ll_u: null                /* lead/lag state for low steam pressure */
    };
  }

  /* reset(pr) — clear the latches. A real reset is an operator action with permissives; this is
   * the CALLER's, deliberately, and it is the only way a latch ever clears. */
  function reset(pr) {
    pr.reactor_trip = false; pr.si = false;
    pr.afas_mdafw = false; pr.afas_tdafw = false;
    pr.fwi = false;
    pr.trip_cause = null; pr.si_cause = null;
    pr.afas_mdafw_cause = null; pr.afas_tdafw_cause = null; pr.fwi_cause = null;
    Object.keys(pr.held_s).forEach(function (k) { pr.held_s[k] = 0; });
    return pr;
  }

  function leadLag(pr, u, dt) {
    if (pr.ll_y === null || !(dt > 0)) { pr.ll_y = u; pr.ll_u = u; return u; }
    var du = u - pr.ll_u;
    pr.ll_y = pr.ll_y + (dt / LEADLAG.lag_s) * (u - pr.ll_y) + (LEADLAG.lead_s / LEADLAG.lag_s) * du;
    pr.ll_u = u;
    return pr.ll_y;
  }

  /* stepProtection(pr, dt, drivers) -> what the protection system SEES and what it has LATCHED.
   *
   *   drivers.pressure_mpa       primary pressure                          REQUIRED
   *   drivers.power_frac         FISSION power, fraction of rated          REQUIRED
   *   drivers.flow_frac          loop flow, fraction of rated              REQUIRED
   *   drivers.steam_pressure_mpa secondary pressure                        optional
   *   drivers.steam_flow_frac    steam flow, fraction of rated             optional
   *   drivers.sg_level_frac      SG narrow-range level, fraction of span   optional
   *                              (drives the lo-lo trip + the AFW starts; absent, that row
   *                              reports available:false — the hi_pzr_level precedent, a
   *                              later-added trip whose reading is not in the REQUIRED three)
   *   drivers.main_feed_lost     both main feed pumps failed               optional, STATE
   *                              (starts the MDAFW — sourced ch10; a breaker fact like
   *                              turbine_tripped, so absent simply means "not lost")
   *
   * The three REQUIRED readings are the ones every reactor trip in this table depends on; a caller
   * that omits them would silently get a plant with no protection at all, which is the reassuring
   * answer and is unearned. The two optional ones drive ESFAS functions only, and a caller with no
   * secondary model should not be forced to invent one — those functions report `available: false`
   * rather than a false NOT-ASSERTED. */
  function stepProtection(pr, dt, drivers) {
    drivers = drivers || {};
    ['pressure_mpa', 'power_frac', 'flow_frac'].forEach(function (k) {
      if (drivers[k] === undefined) {
        throw new Error('pwr2_protection: drivers.' + k + ' is REQUIRED — every reactor trip in ' +
                        'the sourced table reads it, and this layer will not report a plant as ' +
                        'un-tripped on a reading it never had.');
      }
    });

    /* ---- P-10, EVALUATED BEFORE ANY FUNCTION. Unblocking is AUTOMATIC and beats the operator,
     * so the revoke is applied to the REQUEST itself: below the permissive the request is gone
     * and has to be made again on the way back up. Modelling it as "ignore the request while
     * low" would leave a stale request that silently re-arms as power rises, which is the
     * defeatable-trip shape the sources do not have. */
    var p10Met = drivers.power_frac >= P10.frac;
    if (!p10Met && pr.blockLowFlux) pr.blockLowFlux = false;
    /* ---- P-11, THE SHUTDOWN PERMISSIVE (#507 wave 10) — the mirror of P-10's law in the
     * other direction: the low-pressure trip block and the SI block are OPERATOR REQUESTS
     * permitted only BELOW P-11, and climbing back above it REVOKES both requests
     * themselves (the auto-reinstate the pwr1 comment records; the revoke-not-gate lesson
     * transfers verbatim — a stale request that silently re-arms on the next cooldown is
     * the #295 defeatable-trip shape). Value [adopted]: pwr1's ~1970 psig / 13.6 MPa pair,
     * the same source lineage as its lo_press/si_trip block permissive. "Block SI is THREE
     * actions on a cooldown" (the house trap): the pressure setpoint comes down first, then
     * lo_press, then si_trip — these are the last two, each its own request. */
    var p11Below = drivers.pressure_mpa !== undefined && drivers.pressure_mpa < P11.mpa;
    if (!p11Below) {
      if (pr.blockLoPress) pr.blockLoPress = false;
      if (pr.blockSI) pr.blockSI = false;
    }
    /* ⚠ NO `&& p10Met` HERE, AND THE GATE IS WHAT PROVED IT REDUNDANT. The revoke above
     * has already cleared the request whenever the permissive is not met, so an extra
     * gate could never change the answer — the injection self-test could not make a
     * mutation of it fail, which is this repo's definition of a line that is not doing
     * anything. Keeping it would also have hidden which mechanism carries the safety
     * property: it is the REVOKE. Gating without revoking would leave a stale request
     * that re-arms by itself as power rises, and that is the defeatable-trip shape
     * (#295 F1/F2) the sources do not have. */
    var blockEffective = pr.blockLowFlux;

    var out = [], fns = functions(), anyRps = null, anyEsfas = null, sgLolo = false, anyFwi = null;
    for (var i = 0; i < fns.length; i++) {
      var f = fns[i];
      var raw = drivers[f.read];
      var available = raw !== undefined && isFinite(raw);
      var value = raw, asserted = false;

      var sp = f.sp;
      if (available && f.spFn) {
        var spDyn = f.spFn(drivers);
        if (spDyn === undefined) available = false;   /* a computed setpoint missing an input
                                                       * is an UNAVAILABLE channel, not a
                                                       * silently-static one */
        else sp = spDyn;
      }
      /* GATED — this function cannot assert right now, whatever the plant does, because a
       * permissive or an operator block is holding it off. Set at each gate below rather than
       * re-derived afterwards: a second copy of a permissive test is the defect class #294,
       * #303 and #557 are all instances of, and the report is read by surfaces (the board's
       * vital tiles, #556) that must not paint a protection line the plant is not standing on.
       * `armed` is its complement over an available channel, and it is the field to read —
       * `asserted` answers a different question (is the limit crossed RIGHT NOW). */
      var gated = false;
      if (available) {
        if (f.leadlag) value = leadLag(pr, raw, dt);
        asserted = f.dir > 0 ? (value >= sp) : (value <= sp);
        if (f.blockable && blockEffective) { asserted = false; gated = true; }
        /* P-11's two blocks (#507 wave 10): the low-pressure REACTOR trip and the whole
         * esfas kind (the SI actuation — all three initiating rows are the one disarm the
         * sources describe). Assertion-gated like P-7, so no hold time accumulates. */
        if (f.id === 'lo_pzr_press' && pr.blockLoPress) { asserted = false; gated = true; }
        if (f.kind === 'esfas' && pr.blockSI) { asserted = false; gated = true; }
        /* P-7: an at-power trip is NOT ACTIVE below 10 % power. A plain gate, deliberately --
         * there is no operator request in P-7 to revoke, so the revoke-not-gate lesson from
         * P-10 does not transfer; gating the ASSERTION also zeroes the hold timer below, so
         * nothing stale accumulates while inactive. */
        if (f.atPower && drivers.power_frac < P7.frac) { asserted = false; gated = true; }
      }

      /* THE DELAY IS A CONTINUOUS HOLD, not an elapsed-time-since-first-seen. A function that
       * crosses, clears, and crosses again starts its delay over — which is what a real channel
       * does and is the difference between a trip and a transient. */
      pr.held_s[f.id] = asserted ? pr.held_s[f.id] + (dt > 0 ? dt : 0) : 0;
      var tripping = asserted && pr.held_s[f.id] >= f.delay;

      if (tripping) {
        if (f.kind === 'rps' && !anyRps) anyRps = f.id;
        if (f.kind === 'esfas' && !anyEsfas) anyEsfas = f.id;
        if (f.id === 'sg_lolo_level') sgLolo = true;   /* the bistable's second consumer */
        if (f.kind === 'fwi' && !anyFwi) anyFwi = f.id;
      }
      out.push({
        id: f.id, name: f.name, kind: f.kind, dir: f.dir, available: available,
        /* ARMED — the channel is live AND no permissive or block is holding it off, so this
         * setpoint is a line the plant will actually trip on. See `gated` above. */
        armed: available && !gated,
        value: value, setpoint: sp, unit: f.unit,
        asserted: asserted, held_s: pr.held_s[f.id], delay_s: f.delay, tripping: tripping,
        /* SIGNED margin to the setpoint, in the function's own units: positive is safe.
         * A margin that floors at zero hides how far past a limit a plant went. */
        margin: available ? (f.dir > 0 ? sp - value : value - sp) : undefined
      });
    }

    /* MANUAL REACTOR TRIP [sourced] — Ginna TS Bases B 3.3.1 Function 1 (ML20339A221): "The
     * Manual Reactor Trip Function ensures that the control room operator can initiate a
     * reactor trip at any time by using either of two reactor trip pushbuttons on the main
     * control board." No setpoint, no permissive, no delay ("This function has no adjustable
     * trip setpoint"), so it is a latch input, not a table row — and it is evaluated FIRST so
     * that a pushbutton and an automatic function arriving together record the operator's act. */
    if (drivers.manual_trip && !pr.reactor_trip) { pr.reactor_trip = true; pr.trip_cause = 'manual'; }

    /* LATCH. A reactor trip and a safety injection both latch in a real plant until reset.
     * The SI latch honours the reset's re-arm block (#512) [sourced — after an SI reset
     * "all automatic SI actuation signals are blocked"]; the block clears below when the
     * live signal drops. */
    if (anyRps && !pr.reactor_trip) { pr.reactor_trip = true; pr.trip_cause = anyRps; }
    if (anyEsfas && !pr.si && !pr.si_rearm_block) { pr.si = true; pr.si_cause = anyEsfas; }

    /* THE AFW STARTS [sourced — the SGLL block]. Same latch law as si; evaluated AFTER the SI
     * latch so a safety injection arriving this very step starts the MDAFW pumps this step.
     * Lo-lo level starts BOTH pumps (the declared single-loop collapse); SI starts the
     * motor-driven pumps ONLY. Reported here, acted on by the caller (HR5) — this module
     * still starts nothing. */
    if (sgLolo && !pr.afas_mdafw && !pr.afas_rearm_block) { pr.afas_mdafw = true; pr.afas_mdafw_cause = 'sg_lolo_level'; }
    if (sgLolo && !pr.afas_tdafw && !pr.afas_rearm_block) { pr.afas_tdafw = true; pr.afas_tdafw_cause = 'sg_lolo_level'; }
    if (pr.si && !pr.afas_mdafw && !pr.afas_rearm_block) { pr.afas_mdafw = true; pr.afas_mdafw_cause = 'si'; }
    /* [sourced ch10, the SGLL block]: both main feed pumps failed -> the MDAFW pumps start.
     * A state signal, no delay row — the source gives none and breakers are not analog. */
    if (drivers.main_feed_lost && !pr.afas_mdafw && !pr.afas_rearm_block) {
      pr.afas_mdafw = true; pr.afas_mdafw_cause = 'loss_of_main_feed';
    }
    /* [sourced ch10, the SGLL block]: "All three preferred auxiliary feedwater pumps will
     * start on loss of offsite power" — BOTH pumps on this plant's one-of-each lineup
     * (#507 wave 4). Same state-signal law; evaluated after the level/SI starts so a
     * simultaneous arrival records the credited cause first. */
    if (drivers.loss_of_offsite && !pr.afas_mdafw && !pr.afas_rearm_block) {
      pr.afas_mdafw = true; pr.afas_mdafw_cause = 'loss_of_offsite_power';
    }
    if (drivers.loss_of_offsite && !pr.afas_tdafw && !pr.afas_rearm_block) {
      pr.afas_tdafw = true; pr.afas_tdafw_cause = 'loss_of_offsite_power';
    }
    /* FEEDWATER ISOLATION on high-high level [sourced -- the SGLL block]. Same latch law.
     * (The SI-driven isolation lives in pwr2_feedwater with its own sourced 32 s delay.) */
    if (anyFwi && !pr.fwi && !pr.fwi_rearm_block) { pr.fwi = true; pr.fwi_cause = anyFwi; }

    /* LIVE SIGNALS (#512, the owner's per-system unlatch design): is each function's
     * ACTUATING CONDITION present right now, latch aside. The panel's own securing click
     * refuses while its signal is live and resets-then-executes once it clears — so these
     * are the refusal's question, asked of the same bistables the latches fire on (they
     * cannot drift apart). The AFAS lives include the SI LATCH deliberately: the SI latch
     * is itself a standing start signal for the motor-driven pump (the line above), so AFW
     * cannot be unlatched from under a standing SI — reset SI at its own panel first. */
    pr.si_live = !!anyEsfas;
    pr.afas_mdafw_live = !!(sgLolo || pr.si || drivers.main_feed_lost || drivers.loss_of_offsite);
    pr.afas_tdafw_live = !!(sgLolo || drivers.loss_of_offsite);
    pr.fwi_live = !!anyFwi;

    /* THE RESET PERMISSIVE TIMERS (#512) [sourced — the reset circuit's time-delay relay,
     * "usually 45 - 60 sec"]: each latch's age, zeroed when the latch is clear. The SHELL
     * refuses a securing click until the age passes RESET.delay_s (and, for SI, P-4 —
     * reactor trip — per the same figure); after that the click resets and secures EVEN
     * WITH THE SIGNAL STILL PRESENT — the source is explicit that the reset removes only
     * the start signal and the operator then stops equipment as required. That window is
     * what keeps a deliberate TMI-style termination reachable. */
    var dtT = dt > 0 ? dt : 0;
    pr.si_t   = pr.si ? pr.si_t + dtT : 0;
    pr.afas_t = (pr.afas_mdafw || pr.afas_tdafw) ? pr.afas_t + dtT : 0;
    pr.fwi_t  = pr.fwi ? pr.fwi_t + dtT : 0;
    /* the re-arm blocks clear when the live signal drops — a recovered plant re-arms */
    if (!pr.si_live) pr.si_rearm_block = false;
    if (!pr.afas_mdafw_live && !pr.afas_tdafw_live) pr.afas_rearm_block = false;
    if (!pr.fwi_live) pr.fwi_rearm_block = false;

    /* TURBINE-TRIP REACTOR TRIP, gated by P-9 [sourced] — Ginna TS Bases B 3.3.1 Function 14
     * (ML20339A221): "A reactor trip is automatically initiated on a turbine trip when it is
     * above the P-9 setpoint, to minimize the transient on the reactor"; below it, "load
     * rejection can be accommodated by the steam dump system. Therefore, a turbine trip does
     * not actuate a reactor trip." Evaluated AFTER the setpoint functions on purpose: the
     * Bases says these trips are "not credited in the accident analysis" — anticipatory — so
     * a credited function arriving the same step keeps the cause. The real sensing is 2/3
     * autostop-oil pressure switches and stop-valve limit switches; this model's honest input
     * is the turbine's own tripped flag (drivers.turbine_tripped), declared, and P-9 selects
     * its value from drivers.steam_dumps_available (absent = available, the normal lineup). */
    var p9frac = drivers.steam_dumps_available === false ? P9.frac_no_dumps : P9.frac_dumps;
    /* THE DEFEAT (#515) — drivers.p9_defeated is the `anticipatory_trip_failure` casualty:
     * the turbine-trip channel has failed, so this ANTICIPATORY trip reports nothing while
     * every credited function below still trips. It exists to recreate TMI-2 on a plant
     * whose sourced design forbids the sequence *(OWNER DIRECTIVE, 2026-08-25: "lets get rid
     * of that anticipatory trip so that we can recreate the TMI incident")* — built as a
     * failure the operator injects rather than a deletion, because the permissive is
     * sourced and every other turbine trip on this plant keeps it. MEASURED (validation
     * §83): with the channel failed a loss of feed at 100 % runs 60 s to the SG lo-lo trip
     * at 67 % power (feedback-limited), boils most of the SG doing it, and the PORV lifts
     * on its own at 18.5 min against 52.4 min with the trip in place. */
    if (drivers.turbine_tripped && !drivers.p9_defeated && drivers.power_frac >= p9frac && !pr.reactor_trip) {
      pr.reactor_trip = true; pr.trip_cause = 'turbine_trip';
    }

    /* THE DELTA-T APPROACH SIGNAL — rod stop + turbine runback [sourced], Ginna UFSAR ch7
     * (ML20339A027) §7.2.2.4.1/§7.2.3.2.1: OT/OP delta-T "at 3% of rated loop [delta]T below
     * trip setpoints" initiate rod stops, and "High overpower delta T and overtemperature
     * delta T will also initiate a turbine runback at 200%/min for 1.5 sec every 30 sec";
     * the design intent verbatim: "[delta]T (rod stop) = [delta]T (trip) - constant, with a
     * programmed turbine runback until [delta]T < [delta]T (rod stop) ... to maintain
     * essentially a constant margin to trip and gives the operator the opportunity to make
     * appropriate adjustments before a reactor trip occurs." ONE signal, TWO consumers —
     * the caller blocks outward rod motion and nibbles the turbine (HR5: reported here,
     * acted on there). 3 % of rated loop delta-T is 0.03 in these normalized units. */
    /* A BISTABLE NEEDS HYSTERESIS: measured without it, channel noise flickers the signal at
     * the 3 % line and every flicker restarts the runback pulse timer — the sourced 1.5 s /
     * 30 s duty cycle degenerates into near-continuous ramping. Assert at 3 % below the
     * setpoint [sourced]; clear at 3.5 % [open, anti-chatter — the source names no deadband,
     * and half a percent is ~3 sigma of the indicated delta-T noise]. */
    var dtNear = false;
    for (var oi = 0; oi < out.length; oi++) {
      var of = out[oi];
      if ((of.id === 'ot_delta_t' || of.id === 'op_delta_t') && of.available &&
          of.value >= of.setpoint - (pr.dtApproach ? 0.035 : 0.03)) dtNear = true;
    }
    pr.dtApproach = dtNear;
    var dtApproach = dtNear;

    return {
      functions: out,
      rod_stop: dtApproach,
      runback: dtApproach,
      reactor_trip: pr.reactor_trip,
      si: pr.si,
      afas_mdafw: pr.afas_mdafw,
      afas_tdafw: pr.afas_tdafw,
      afas_mdafw_cause: pr.afas_mdafw_cause,
      afas_tdafw_cause: pr.afas_tdafw_cause,
      fwi: pr.fwi,
      fwi_cause: pr.fwi_cause,
      /* THE HIGH-HIGH LEVEL TURBINE TRIP, NAMED (#562, 2026-08-27) [sourced] — WTSM 3.2
       * (ML11223A213): *"a high-high steam generator level turbine trip to protect the turbine
       * against excessive moisture carryover."*
       *
       * ⚠ THIS FIELD NAMES A CONSEQUENCE THAT WAS ALREADY BUILT. It is `!!pr.fwi` by
       * construction, and pwr2_engine has tripped the turbine off `ptr.fwi` since the FWI line
       * was written, with this same citation in its comment. #562 added it believing the trip
       * half had no consumer — a conclusion drawn from THIS MODULE'S HEADER ("P-14 class:
       * feedwater regulator closure + turbine trip") without grepping the engine, and the
       * duplicate consumer it also added was removed the next day. The field EARNS ITS PLACE
       * anyway, for the reason the mistake shows: one protective function with two consequences
       * reported as one boolean is exactly how a reader concludes the second one is missing.
       * A consumer reading this can see the function has two halves; do not fold it back.
       *
       * It rides the FWI latch — same bistable, same setpoint, same latch — so the halves
       * cannot drift apart, and it is LEVEL-HELD, which is what stops the operator re-latching
       * the turbine into a steam line that is carrying water. */
      turbine_trip_hi_level: !!pr.fwi,
      p10_met: p10Met,
      p11_permit: p11Below,
      lo_press_blocked: pr.blockLoPress,
      si_blocked: pr.blockSI,
      p7_met: drivers.power_frac >= P7.frac,
      p9_met: drivers.power_frac >= (drivers.steam_dumps_available === false
                                     ? P9.frac_no_dumps : P9.frac_dumps),
      low_flux_blocked: blockEffective,
      trip_cause: pr.trip_cause,
      si_cause: pr.si_cause,
      /* ASSERTED-NOW is distinct from LATCHED, and both are reported. A consumer that only ever
       * sees the latch cannot tell a plant still crossing a setpoint from one that crossed it
       * once and recovered. */
      rps_asserted_now: !!anyRps,
      esfas_asserted_now: !!anyEsfas
    };
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.protection = {
    /* OTDT is exported for ONE reason (#561): the board's overtemperature/overpower margin gauge
     * is drawn by the reused pwr instrument layer, which computed it from the retired plant's
     * fitted DNB surface. The shell hands these coefficients to that layer so the gauge and the
     * trip are one equation instead of two. Exported as data, not as a second evaluator. */
    OTDT: OTDT,
    RPS: RPS, ESFAS: ESFAS, SGLL: SGLL, DELAY: DELAY, LEADLAG: LEADLAG, P10: P10, P7: P7,
    P11: P11, RESET: RESET,
    PSIA_PER_MPA: PSIA_PER_MPA,
    functions: functions, leadLag: leadLag,
    createProtection: createProtection, stepProtection: stepProtection, reset: reset
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
