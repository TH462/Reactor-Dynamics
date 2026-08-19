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
 * **LOW-LOW AND HIGH-HIGH STEAM GENERATOR WATER LEVEL** (0 % and 100 % narrow-range span, sourced
 * in the same table). Not buildable: `pwr2_sg.js` is LUMPED by ruling and `pwr2_true_state.js`
 * already declares `sg_level_pct` missing because *"there is no geometry to turn inventory into a
 * gauge reading"*. A level trip needs the gauge. `sg_mass_frac` is real and a mass-fraction trip
 * could be invented — that is precisely the fabricated linear scale the shim refuses.
 *
 * **RCP UNDERVOLTAGE AND UNDERFREQUENCY** (57 Hz sourced). No electrical model exists; the same
 * gap that keeps `station_blackout` and `ac_available` declared-missing.
 *
 * **TURBINE TRIP / P-9 ANTICIPATORY TRIP.** `pwr2_turbine.js` has no trip state.
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

  /* Analysis delays, same table, same rows. A function must hold CONTINUOUSLY for its delay. */
  var DELAY = {
    kind: '[sourced]',
    hi_pzr_press: 2.0, lo_pzr_press: 2.0,
    hi_flux_lo:   0.5, hi_flux_hi:   0.5,
    lo_flow:      1.0,
    hi_pzr_level: 2.0,         /* [open] -- not in the 15.0-6 delay set; matches the pressure channels */
    si_lo_pzr_press: 2.0,      /* see the note below — the table's column is ambiguous here */
    si_lo_steam_press: 2.0,
    hi_hi_steam_flow: 2.0
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
      { id: 'lo_flow', name: 'Low reactor coolant loop flow', kind: 'rps', dir: -1,
        sp: RPS.lo_flow_frac, unit: 'frac', read: 'flow_frac', delay: DELAY.lo_flow },
      { id: 'hi_pzr_level', name: 'High pressurizer level', kind: 'rps', dir: +1,
        sp: RPS.hi_pzr_level_frac, unit: 'frac', read: 'pzr_level_frac',
        delay: DELAY.hi_pzr_level, atPower: true },
      { id: 'si_lo_pzr_press', name: 'Safety injection on low pressurizer pressure',
        kind: 'esfas', dir: -1, sp: ESFAS.si_lo_pzr_press_psia / PSIA_PER_MPA, unit: 'MPa',
        read: 'pressure_mpa', delay: DELAY.si_lo_pzr_press },
      { id: 'si_lo_steam_press', name: 'Safety injection on low steam pressure', kind: 'esfas',
        dir: -1, sp: ESFAS.si_lo_steam_press_psia / PSIA_PER_MPA, unit: 'MPa',
        read: 'steam_pressure_mpa', delay: DELAY.si_lo_steam_press, leadlag: true },
      { id: 'hi_hi_steam_flow', name: 'High-high steam flow', kind: 'esfas', dir: +1,
        sp: ESFAS.hi_hi_steam_flow_frac, unit: 'frac', read: 'steam_flow_frac',
        delay: DELAY.hi_hi_steam_flow }
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
      reactor_trip: false,                  /* LATCHED */
      si: false,                            /* LATCHED */
      trip_cause: null,
      si_cause: null,
      ll_y: null, ll_u: null                /* lead/lag state for low steam pressure */
    };
  }

  /* reset(pr) — clear the latches. A real reset is an operator action with permissives; this is
   * the CALLER's, deliberately, and it is the only way a latch ever clears. */
  function reset(pr) {
    pr.reactor_trip = false; pr.si = false;
    pr.trip_cause = null; pr.si_cause = null;
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
    /* ⚠ NO `&& p10Met` HERE, AND THE GATE IS WHAT PROVED IT REDUNDANT. The revoke above
     * has already cleared the request whenever the permissive is not met, so an extra
     * gate could never change the answer — the injection self-test could not make a
     * mutation of it fail, which is this repo's definition of a line that is not doing
     * anything. Keeping it would also have hidden which mechanism carries the safety
     * property: it is the REVOKE. Gating without revoking would leave a stale request
     * that re-arms by itself as power rises, and that is the defeatable-trip shape
     * (#295 F1/F2) the sources do not have. */
    var blockEffective = pr.blockLowFlux;

    var out = [], fns = functions(), anyRps = null, anyEsfas = null;
    for (var i = 0; i < fns.length; i++) {
      var f = fns[i];
      var raw = drivers[f.read];
      var available = raw !== undefined && isFinite(raw);
      var value = raw, asserted = false;

      if (available) {
        if (f.leadlag) value = leadLag(pr, raw, dt);
        asserted = f.dir > 0 ? (value >= f.sp) : (value <= f.sp);
        if (f.blockable && blockEffective) asserted = false;
        /* P-7: an at-power trip is NOT ACTIVE below 10 % power. A plain gate, deliberately --
         * there is no operator request in P-7 to revoke, so the revoke-not-gate lesson from
         * P-10 does not transfer; gating the ASSERTION also zeroes the hold timer below, so
         * nothing stale accumulates while inactive. */
        if (f.atPower && drivers.power_frac < P7.frac) asserted = false;
      }

      /* THE DELAY IS A CONTINUOUS HOLD, not an elapsed-time-since-first-seen. A function that
       * crosses, clears, and crosses again starts its delay over — which is what a real channel
       * does and is the difference between a trip and a transient. */
      pr.held_s[f.id] = asserted ? pr.held_s[f.id] + (dt > 0 ? dt : 0) : 0;
      var tripping = asserted && pr.held_s[f.id] >= f.delay;

      if (tripping) {
        if (f.kind === 'rps' && !anyRps) anyRps = f.id;
        if (f.kind === 'esfas' && !anyEsfas) anyEsfas = f.id;
      }
      out.push({
        id: f.id, name: f.name, kind: f.kind, available: available,
        value: value, setpoint: f.sp, unit: f.unit,
        asserted: asserted, held_s: pr.held_s[f.id], delay_s: f.delay, tripping: tripping,
        /* SIGNED margin to the setpoint, in the function's own units: positive is safe.
         * A margin that floors at zero hides how far past a limit a plant went. */
        margin: available ? (f.dir > 0 ? f.sp - value : value - f.sp) : undefined
      });
    }

    /* LATCH. A reactor trip and a safety injection both latch in a real plant until reset. */
    if (anyRps && !pr.reactor_trip) { pr.reactor_trip = true; pr.trip_cause = anyRps; }
    if (anyEsfas && !pr.si) { pr.si = true; pr.si_cause = anyEsfas; }

    return {
      functions: out,
      reactor_trip: pr.reactor_trip,
      si: pr.si,
      p10_met: p10Met,
      p7_met: drivers.power_frac >= P7.frac,
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
    RPS: RPS, ESFAS: ESFAS, DELAY: DELAY, LEADLAG: LEADLAG, P10: P10, P7: P7,
    PSIA_PER_MPA: PSIA_PER_MPA,
    functions: functions, leadLag: leadLag,
    createProtection: createProtection, stepProtection: stepProtection, reset: reset
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
