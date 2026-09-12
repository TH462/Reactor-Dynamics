/* pwr2_dumpctl.js — Layer 5: the steam dump control system. The thing that COMPUTES the
 * `dump_demand` pwr2_relief has always taken from its caller — until now supplied by a gate's
 * declared stand-in law, because "commanding a dump position is a control-layer decision by
 * owner ruling, and PWR2 has no control layer yet". Now it has this much of one: the sourced
 * automatic dump controller, plant analog hardware in the same sense as the pressurizer's
 * ladder — it EVALUATES and REPORTS; the caller wires its demand into pwr2_relief.
 *
 * BUILT AGAINST A RULED ACCEPTANCE CRITERION *(OWNER RULING, 2026-08-19: "Defer. A." — the "A"
 * selecting "continuous load-following with rods in MANUAL: reactor power monotone in load
 * target over the dispatch range, no plateau wider than measurement noise" from two options
 * written for him; PWR2_VALIDATION.md §42)*. The criterion is met FOR THE SOURCED REASON, not
 * by tuning: dispatch-rate load changes never satisfy the C-7 arming interlock, so the dumps
 * stay SHUT and cannot become the parallel heat sink that pinned the old engine's power at
 * 76 % across a 15 MWe span (#489). The dump only acts when its sources say it should — a
 * load rejection beyond the rod system's design capability, a turbine trip, or the operator's
 * pressure mode.
 *
 * EVERYTHING BELOW IS WTSM 11.2 (ML11223A294, fetched into THIS lane's corpus 2026-08-19)
 * unless marked; controller output bands are WAT 05 (ML11216A094) §5-18(E):
 *
 *   MODES (operator selector): Tavg mode at power, steam pressure mode at hot standby /
 *   startup / cooldown. "The position of the mode selector switch and the plant conditions
 *   determine which of the three controllers is in service."
 *
 *   LOSS-OF-LOAD controller (Tavg mode, no turbine trip): input auctioneered-high Tavg and
 *   Tref; "a 5 degF dead band to allow the rod control system to respond ... first"; output
 *   proportional to the excess over the deadband — WAT 05: "5 - 16.4 [degF] generates
 *   0 - 100% output". Valves open ONLY if armed by C-7.
 *
 *   TURBINE-TRIP controller (Tavg mode, C-8 present — auto-selected by the trip relay):
 *   proportional to Tavg minus NO-LOAD Tavg, "no dead band" — WAT 05: "0 - 27.7 generates
 *   0 - 100%". C-8 itself arms the dumps.
 *
 *   STEAM PRESSURE controller: PI on header pressure against an operator setpoint; selecting
 *   the mode IS the arming. Used to hold the plant at the saturation temperature of the
 *   setpoint, and to drive a cooldown by walking the setpoint down.
 *
 *   ARMING (three signals): C-7 loss-of-load — "a ramp load decrease at a rate greater than
 *   5%/min, or a step load decrease of greater than 10% ... sensed from turbine impulse
 *   pressure"; C-8 turbine trip; the pressure-mode selector. C-9 condenser available gates
 *   ACTUATION in every mode — "sufficient vacuum ... and at least one operating condenser
 *   circulating water pump" — and pwr2_relief already enforces it on the flow side; this
 *   layer reports it so a demand-with-no-path is visible.
 *
 * Tref: "generated from turbine impulse pressure" — modelled as the plant's own Tavg program,
 * linear in load fraction from the no-load Tavg (286.11 degC = 547 degF — GINNA's programmed
 * no-load, and this plant's own no-load steam side; see tavg_noload_c below for the #508
 * re-anchor and its measurements) to the full-power design Tavg (304.5 degC), which is this
 * plant's own heat-balance design point from #479 and NOT a citation. Since #645 the
 * pressurizer's level program rides the SAME two knots — one plant quantity, two files, with an
 * equality check in each file's gate.
 *
 * ⚠ THE TURBINE-TRIP BAND IS THAT SPAN, DERIVED — see tt_full_c below *(OWNER RULING,
 * 2026-09-06: "A")*, #647. It was the typed 27.7 degF until then, which is the WAT plant's own
 * span borrowed as if it were a gain. Closing that also closed the question this header used to
 * leave open ("the full-power anchor is the open half"): #647's precondition measured the plant
 * settling 2.4 degF BELOW its own full-power knot and found the cause in the initial
 * conditions' fuel seed, not in the anchor — pwr2_engine's createReactor call carries it.
 *
 * [open] pieces, declared: the C-7 step-reference lowpass (~10 s; the rate unit's 120 s lag is
 * DERIVED — see C7DET); C-7's disarm (latched until the loss-of-load demand has returned to
 *  zero — the valves are fully closed within 5 degF of Tref, WAT 05); the pressure-mode PI
 * gains (the source says PI, not numbers). No Tavg rate compensation (WAT 05 notes the real
 * signal is rate-compensated) — declared; its absence delays demand slightly on fast
 * transients, pessimistic for the dump's own response time.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  if (!RD) throw new Error('pwr2_dumpctl: load the pwr2 stack first');

  var DUMP = {
    kind: '[sourced]',
    deadband_c: 5 / 1.8,                 /* 5 degF, WTSM 11.2 verbatim (rationale included) */
    lol_full_c: 16.4 / 1.8,              /* WAT 05: 5 - 16.4 degF -> 0 - 100 % */
    /* tt_full_c is DERIVED from the two program knots below — assigned after this literal,
     * because it is this plant's own span and not a number to type. See the block there. */
    /* ⚠ 547 degF, GINNA'S — RE-ANCHORED 2026-09-05 *(OWNER RULING, 2026-09-05: "547 °F —
     * re-anchor to Ginna")*, #508/#634. It used to be 291.67 degC (557 degF), the WTSM/WAT
     * 4-loop plant's figure, and this plant is not that plant: `pwr2_engine` boots EVERY
     * no-load initial condition at Tsat of the sourced 1005 psig no-load steam pressure =
     * 286.113 degC (547.0 degF), so the engine disagreed with its own Tref program by
     * 10.01 degF. At the plant's own Hot Standby point the loss-of-load error sat permanently
     * inside its own 5 degF deadband and turbine-trip demand was 0 — BOTH Tavg-mode dump
     * controllers dead at the point the mode exists to hold. Measured, 1800 s turbine trip
     * from hot_full_power: SG peak 1092.0 -> 1048.5 psia (margin to the 1085 psig main steam
     * safety valve pop 7.7 -> 51.2 psi), park 553.61 -> 549.13 degF, and the heat sink moves
     * off the ATMOSPHERIC DUMP VALVE (42.9 % -> 0.0 %, condenser dumps 0.00 -> 8.75 %):
     * 18,813 lbm (8,533 kg) vented to atmosphere in 30 min after an ordinary turbine trip
     * becomes 0 lbm. (On the tree that also carries #633's pressure-dependent relief the same
     * ride reads a 63.1 psi margin, a 548.71 degF / 1008.8 psig park and 0 lbm vented.)
     *   SOURCE — Ginna UFSAR ch15, ML20339A101, Table 15.0-3 note d, verbatim: "All analyses
     *   assumed a programmed no-load TAVG of 547F." Corroborated by Ginna UFSAR ch10
     *   (ML20339A040): "When the unit is in the MODE 3 (Hot Shutdown) mode, the main steam
     *   system operates to maintain no-load TAVG (547F)."
     * SCOPE, ruled: this copy first, and pwr2_pressurizer.js's level-program copy FOLLOWED it
     * *(OWNER RULING, 2026-09-06: "Move the pressurizer copy too")*, #645 — the two are one
     * plant quantity and each file's gate now asserts the equality. pwr2_kinetics.js's 291.67 is a
     * DIFFERENT quantity — the 975 ppm hot-zero-power boron anchor is BEAVRS / Watts Bar Unit 1
     * Cycle 1 (OSTI 1991715), quoted at WATTS BAR's 557 degF. */
    tavg_noload_c: 286.11,               /* 547 degF — Ginna's PROGRAMMED no-load Tavg */
    tavg_full_c: 304.5,                  /* this plant's design Tavg — see #647 note below */
    /* ⚠ #647 EVIDENCE PASS, 2026-09-11: tavg_full_c IS NOT GINNA'S. Ginna's own full-power
     * TAVG is 576.0 degF (UFSAR ch15, ML20339A101, Table 15.0-3 and its note d — "the high end
     * of the [Tavg] window ... had not changed from the previous licensing basis analyses");
     * this plant's own 580.1 degF (304.5 degC) is a heat-balance design point from #479, not a
     * citation, load-bearing in pwr2_sg.ratedU(), pwr2_kinetics's Doppler/moderator reference
     * temperatures and pwr2_protection's OTDT T' setpoint. Adopting Ginna's 576.0 degF wholesale
     * would move all four; RULED 2026-09-06 ("A") not to, confirmed rather than reopened by the
     * evidence pass. lol_full_c above (WAT-05, 16.4 degF) has no Ginna-specific alternative in
     * the corpus at all — Ginna UFSAR ch10 sec10.7.1 describes its Steam Dump System
     * mechanically (28 % capacity, 8 valves, three modes) with no numeric Tavg-mode bands. */
    c7_ramp_frac_per_min: 0.05,          /* C-7: "ramp load decrease at a rate greater than 5%/min" */
    c7_step_frac: 0.10,                  /* C-7: "step load decrease of greater than 10%" */
    src: 'WTSM 11.2 (ML11223A294); bands WAT 05 (ML11216A094) 5-18(E)'
  };
  /* ⚠ THE TURBINE-TRIP BAND IS THIS PLANT'S OWN PROGRAM SPAN — DERIVED, NEVER TYPED *(OWNER
   * RULING, 2026-09-06: "A" — keep the full-power knot at this plant's own 580.1 degF and
   * re-derive the dependents from its span, over adopting Ginna's full-power Tavg wholesale and
   * over leaving it)*, #647.
   *
   * IN THE SOURCE THE BAND AND THE PROGRAM ARE ONE OBJECT. WAT 05's Tavg program runs
   * 557 -> 584.7 degF, and its turbine-trip controller reaches full output at 584.7 - 557 =
   * 27.7 degF: the band IS the span, so the controller saturates exactly at full-power Tavg.
   * Typing 27.7 here adopted the WAT plant's SPAN as if it were a controller gain, and this
   * plant's span is not that plant's — 547 -> 580.1 degF = 33.10 degF (18.39 degC). Held at
   * 27.7 the controller saturated 5.4 degF BELOW its own full-power Tavg; before the #508
   * re-anchor it was mismatched the other way (a 23.09 degF span against the same 27.7, so
   * the controller could never reach 100 %).
   *
   * DERIVED FROM THE KNOTS, so that moving either anchor re-solves the band instead of leaving
   * a typed 18.39 to go stale — the second-copy trap that put this constant out of step in the
   * first place, and the same reasoning as etaCycle() in pwr2_turbine. */
  DUMP.tt_full_c = DUMP.tavg_full_c - DUMP.tavg_noload_c;
  var PI_PRESS = {
    kind: '[open]',                      /* the source says PI; the gains are this plant's */
    kp_per_mpa: 2.0,
    ki_per_mpa_s: 1 / 60
  };
  var C7DET = {
    kind: "[derived from the thresholds' mutual consistency]",
    ref_tau_s: 10,                       /* step detector: load vs a ~10 s lowpass reference */
    /* ⚠ THE RATE UNIT'S LAG IS PINNED BY THE SOURCE'S OWN TWO NUMBERS. A step of dL through a
     * rate unit with lag tau peaks at dL/tau — so for the "step > 10 %" criterion to mean
     * anything, a 10 % step must NOT trip the "ramp > 5 %/min" unit: 0.10/tau <= 5 %/min
     * requires tau >= 120 s. Measured before this was fixed: a 30 s filter read a clean 10 %
     * dispatch step as 20 %/min and armed C-7 on the FIRST step of the criterion-A sweep —
     * the two sourced criteria collapsing into one because the sensing dynamics were guessed
     * instead of derived. At 120 s an exact 10 % step peaks at exactly 5.0 %/min, under the
     * strict inequality; a sustained faster ramp still trips within ~a minute. */
    rate_tau_s: 120
  };

  function tref(load_frac) {
    var f = load_frac < 0 ? 0 : (load_frac > 1 ? 1 : load_frac);
    return DUMP.tavg_noload_c + f * (DUMP.tavg_full_c - DUMP.tavg_noload_c);
  }

  function createDumpCtl(opts) {
    opts = opts || {};
    return {
      mode: opts.mode === undefined ? 'tavg' : opts.mode,   /* 'tavg' | 'pressure' | 'off' */
      pressure_setpoint_mpa: opts.pressure_setpoint_mpa === undefined
        ? 7.03 : opts.pressure_setpoint_mpa,   /* Ginna 1005 psig no-load — the plant's anchor */
      loadRef: opts.load_frac === undefined ? 1.0 : opts.load_frac,   /* C-7 step reference */
      loadRate: 0,                                                    /* C-7 filtered %/s */
      lastLoad: opts.load_frac === undefined ? 1.0 : opts.load_frac,
      c7Armed: false,
      pErrInt: 0
    };
  }

  /* stepDumpCtl(dc, dt, drivers) — drivers:
   *   tavg_c                REQUIRED in tavg mode
   *   load_frac             turbine load as a fraction of rated (the impulse-pressure proxy)
   *   turbine_tripped       C-8
   *   condenser_available   C-9 (reported; pwr2_relief enforces it on the flow)
   *   steam_pressure_mpa    REQUIRED in pressure mode
   *   mode / pressure_setpoint_mpa   operator actions
   */
  function stepDumpCtl(dc, dt, drivers) {
    drivers = drivers || {};
    if (drivers.mode !== undefined) dc.mode = drivers.mode;
    if (drivers.pressure_setpoint_mpa !== undefined) {
      dc.pressure_setpoint_mpa = drivers.pressure_setpoint_mpa;
    }
    var load = drivers.load_frac === undefined ? dc.lastLoad : drivers.load_frac;
    var c8 = !!drivers.turbine_tripped;
    var c9 = drivers.condenser_available === undefined ? true : !!drivers.condenser_available;

    /* ---- C-7 DETECTION, from the load signal the way the source senses it (impulse
     * pressure): a lowpass reference catches the STEP ("greater than 10%"); a filtered
     * derivative catches the RAMP ("greater than 5%/min"). Decreases only — the interlock
     * exists for LOAD REJECTION. ---- */
    if (dt > 0) {
      var dLdt = (load - dc.lastLoad) / dt;                          /* frac per second */
      var aR = dt / (C7DET.rate_tau_s + dt);
      dc.loadRate += aR * (dLdt - dc.loadRate);
      var aS = dt / (C7DET.ref_tau_s + dt);
      dc.loadRef += aS * (load - dc.loadRef);
    }
    dc.lastLoad = load;
    var c7Event = (dc.loadRef - load) > DUMP.c7_step_frac ||
                  (-dc.loadRate * 60) > DUMP.c7_ramp_frac_per_min;

    var demand = 0, controller = null, armed = false, tr = tref(load);

    if (dc.mode === 'pressure') {
      /* Selecting the mode IS the arming (WTSM 11.2.2.1). PI on header pressure. */
      controller = 'pressure';
      armed = true;
      var pe = (drivers.steam_pressure_mpa === undefined ? dc.pressure_setpoint_mpa
                : drivers.steam_pressure_mpa) - dc.pressure_setpoint_mpa;
      dc.pErrInt = clip(dc.pErrInt + pe * dt, -0.5 / PI_PRESS.ki_per_mpa_s,
                                               0.5 / PI_PRESS.ki_per_mpa_s);
      demand = clip(PI_PRESS.kp_per_mpa * pe + PI_PRESS.ki_per_mpa_s * dc.pErrInt, 0, 1);
      dc.c7Armed = false;
    } else if (dc.mode === 'tavg') {
      var tavg = drivers.tavg_c;
      if (tavg === undefined) {
        throw new Error('pwr2_dumpctl: drivers.tavg_c is REQUIRED in Tavg mode — both of its ' +
                        'controllers read it, and a dump controller with no temperature would ' +
                        'have to invent one.');
      }
      if (c8) {
        /* TURBINE-TRIP controller, auto-selected by the trip relay; C-8 arms. No deadband. */
        controller = 'turbine_trip';
        armed = true;
        demand = clip((tavg - DUMP.tavg_noload_c) / DUMP.tt_full_c, 0, 1);
        dc.c7Armed = false;
      } else {
        /* LOSS-OF-LOAD controller. Demand exists above the 5 degF deadband; the VALVES need
         * C-7. The latch clears when the demand has returned to zero — "within 5 degF of
         * Tref, the steam dumps are fully closed" (WAT 05). */
        controller = 'loss_of_load';
        var over = (tavg - tr) - DUMP.deadband_c;
        demand = clip(over / (DUMP.lol_full_c - DUMP.deadband_c), 0, 1);
        if (c7Event) dc.c7Armed = true;
        else if (demand <= 0) dc.c7Armed = false;
        armed = dc.c7Armed;
      }
    } else {
      dc.c7Armed = false;                                  /* mode 'off': disarmed, no demand */
    }

    return {
      /* the demand the caller hands to pwr2_relief — zero unless ARMED, which is the whole
       * point of the interlock structure: a controller output with no arming signal moves
       * nothing, exactly as the source's solenoid arrangement has it. */
      dump_demand: armed && c9 ? demand : 0,
      controller_output: demand,                           /* pre-arming, the indication WAT 05
                                                            * warns "does not necessarily mean
                                                            * that the steam dumps are opening" */
      controller: controller,
      armed: armed,
      c7: dc.c7Armed,
      c8: c8,
      c9: c9,
      mode: dc.mode,
      tref_c: tr,
      pressure_setpoint_mpa: dc.pressure_setpoint_mpa
    };
  }

  function clip(x, a, b) { return x < a ? a : (x > b ? b : x); }

  root.RD.pwr2.dumpctl = {
    DUMP: DUMP, PI_PRESS: PI_PRESS, C7DET: C7DET,
    createDumpCtl: createDumpCtl,
    stepDumpCtl: stepDumpCtl,
    tref: tref
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
