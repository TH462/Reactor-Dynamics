/* pwr2_shell.js — PWR2Engine: THE SHELL-FACING CLASS (Option B stage B2, 2026-08-20, owner
 * ruling "Next: option B"). The parallel-phase engine the M4/M5/M8 stack can hold exactly the
 * way it holds RD.PWREngine — same method surface, same `instruments.reading` member, same
 * command door — wrapped around the pwr2_engine facade, which stays the single place the
 * plant is assembled and stepped.
 *
 * THE SURFACE (from the D4 interface design + the M5/M4 call-site inventory):
 *   step(dt) · getTrueState() · getInstruments() · instruments.reading ·
 *   getControlState() · getProtectionConfig() · getActiveFailures() · applyCommand(cmd) ·
 *   reset() · getStartupLineup() · saveState()/loadState()   [schema pwr2-1.0]
 *
 * INSTRUMENTS: the class carries a REUSED `RD.PWRInstruments` instance (D4: "reuse
 * pwr_instruments.js unchanged — it consumes published truth"), fed the shim's true_state
 * each step. That reuse is exactly why stage B1 had to complete the contract first: the
 * SOURCE map's inputs are contract fields. PWR2's own internal channels (pwr2_instruments)
 * keep serving the internal RPS — two instrument layers over one truth is the declared
 * parallel-phase shape, and unifying them is future work.
 *
 * PROTECTION CONFIG: `pwr_control.js:1730` WRITES `RD.PWR_CONFIG.protection` and the engine
 * hands the same object back (the inverted coupling D4 flags). This class is the same
 * courier. Consequence, DECLARED: under the shell, M4's protection channels run over this
 * plant alongside PWR2's own internal RPS — two protection systems whose actions converge
 * (both scram; the internal RPS usually first, since its setpoints are this plant's own).
 *
 * COMMANDS: every action in the current engine's applyCommand switch is in EXACTLY ONE of
 * three registries below — MAPPED (translates to the facade's door or a system state),
 * REHOMED (the D4 class: a command that wrote a derived quantity now sets the actuator that
 * produces it), or REFUSED (the target machinery does not exist in PWR2; the entry says
 * why). A REFUSED command is a no-op that reports itself — never a silent swallow. The gate
 * asserts the partition against the current engine's own switch, so a new old-engine action
 * cannot appear unaccounted.
 *
 * SAVE: schema 'pwr2-1.0'. Per the D4 §5 owner-facing recommendation, PWR2 does NOT load
 * 'pwr-1.0' saves — the two engines have genuinely different state, and any rule inventing
 * node-level distribution from lumped values would be fabrication wearing physics' name.
 * The save is a deep copy of the native state with the two non-serializable links (the
 * pressurizer's extraMass closure on sys, the channel-spec references in the internal
 * instruments) re-established on load. The gate's round-trip check is bit-exactness: save,
 * run N steps, record; load, run N steps, compare EXACTLY — determinism is the contract.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  if (!RD || !RD.engine) throw new Error('pwr2_shell: load the pwr2 stack (incl. pwr2_engine) first');
  var EN = RD.engine, PZ = RD.pressurizer, IN = RD.instruments;

  /* THE ACCUMULATOR VALVE'S ADMINISTRATIVE LOCK (#511) [sourced — Ginna TS Bases B 3.5.1:
   * the motor operated isolation valves "are maintained open with AC power removed under
   * administrative control when pressurizer pressure is > 1600 psig"; WTSM 5.2.4.1: "During
   * a deliberate plant depressurization, power to the valve motor operators is temporarily
   * restored so that the valves can be closed"]. Power removed means the motor cannot move
   * the valve in EITHER direction — both commands refuse, out loud (#505), while INDICATED
   * pressurizer pressure (HR1, the M-2 lesson; absent means truth) is above the lock. */
  function accValve(e, open) {
    var psig = (e.ins.reading.primary_pressure !== undefined
                ? e.ins.reading.primary_pressure : e.sys.P) * 145.038 - 14.7;
    if (psig > 1600) {
      throw new Error('ACCUMULATOR VALVE BLOCKED: power is removed from the valve operator ' +
        'above 1600 psig pressurizer pressure (administrative lock, TS Bases B 3.5.1) — ' +
        'indicated ' + psig.toFixed(0) + ' psig. Depressurize below 1600 psig first.');
    }
    EN.command(e, 'accumulator_valve', open);
  }

  /* THE #512 UNLATCH GUARDS (helpers, deliberately NOT MAPPED keys: a key would be a
   * dispatchable action). Each securing click asks the sourced reset permissive — the
   * 45-60 s time-delay relay (pt.*_t against RESET.delay_s) plus P-4 for SI — refuses
   * with the reason inside the window, and resets-then-executes after it, signal present
   * or not (the WTSM 12.3.2.3 circuit; the re-arm block stops automatic re-actuation). */
  function resetDelayS() { return root.RD.pwr2.protection.RESET.delay_s; }
  function eccsStop(e, pump, c) {
    var on = (c.active !== undefined ? c.active : c.running) !== false;
    if (!on && e.pt.si) {
      var left = resetDelayS() - e.pt.si_t;
      if (left > 0) {
        throw new Error('ECCS STOP BLOCKED: the SI reset permissive is not yet satisfied — ' +
          'the reset time-delay relay has ' + Math.ceil(left) + ' s to run (45-60 s class, ' +
          'WTSM 12.3.2.3). Actuated on ' + (e.pt.si_cause || 'SI') + '.');
      }
      if (!e.pt.reactor_trip) {
        throw new Error('ECCS STOP BLOCKED: the SI reset requires P-4 (a reactor trip) — ' +
          'the trip contact is not made (WTSM 12.3.2.3).');
      }
      EN.command(e, 'reset_si', true);   /* permissive met: reset + secure, one click */
    }
    EN.command(e, pump, on);
  }
  /* NOTE the dependency: a standing SI LATCH is itself an AFW start signal (the SGLL
   * block's si line), so AFW cannot be unlatched from under it — secure the ECCS first. */
  function afwUnlatch(e) {
    if (!(e.pt.afas_mdafw || e.pt.afas_tdafw)) return;
    if (e.pt.si) {
      throw new Error('AFW STOP BLOCKED: a latched safety injection is a standing aux feed ' +
        'start signal — secure the ECCS first, then stop the aux feed pumps.');
    }
    var left = resetDelayS() - e.pt.afas_t;
    if (left > 0) {
      throw new Error('AFW STOP BLOCKED: the actuation reset permissive is not yet satisfied — ' +
        'the reset time-delay relay has ' + Math.ceil(left) + ' s to run (45-60 s class, the ' +
        'WTSM 12.3.2.3 logic family). Actuated on ' +
        (e.pt.afas_mdafw_cause || e.pt.afas_tdafw_cause || 'AFAS') + '.');
    }
    EN.command(e, 'reset_afas', true);
  }

  /* ---- the command registries (see header). value: a mapper fn or a reason string. ---- */
  var MAPPED = {
    /* THE #511 VALVES — real machinery behind the two diagram symbols #509 item 11 had to
     * disable. The MSIV strokes ~5 s and closing it at load trips the turbine (engine). */
    open_msiv:        function (e, c) { EN.command(e, 'msiv', true); },
    close_msiv:       function (e, c) { EN.command(e, 'msiv', false); },
    open_accumulator_valve:  function (e, c) { accValve(e, true); },
    close_accumulator_valve: function (e, c) { accValve(e, false); },
    scram:            function (e, c) { EN.command(e, 'scram', true); },
    reset_rps:        function (e, c) { EN.command(e, 'reset_protection', true); },
    /* GROUP-ROUTED since #506.3-4 (two real banks): before this, group_id was DROPPED, so
     * the board's shutdown drive silently moved the CONTROL bank. The S/M/F selection rides
     * on the command (the board's convention) and lands in the engine's rod_speed door. */
    rod_nudge:        function (e, c) {
      if (c.speed) EN.command(e, 'rod_speed', c.speed);
      var sd = c.group_id === 'shutdown_rods';
      var d = c.steps !== undefined ? c.steps : (c.direction > 0 ? 1 : -1);
      EN.command(e, sd ? 'sd_target' : 'rod_target', (sd ? e.sdTarget : e.rodTarget) + d);
    },
    rod_start:        function (e, c) {
      if (c.speed) EN.command(e, 'rod_speed', c.speed);
      EN.command(e, c.group_id === 'shutdown_rods' ? 'sd_target' : 'rod_target',
        c.direction > 0 ? 200 : 0);
    },
    rod_stop:         function (e, c) {
      if (c.group_id === 'shutdown_rods') EN.command(e, 'sd_target', e.sdSteps);
      else EN.command(e, 'rod_target', e.rodSteps);
    },
    rod_stop_all:     function (e, c) {
      EN.command(e, 'rod_target', e.rodSteps);
      EN.command(e, 'sd_target', e.sdSteps);
    },
    set_load_target:  function (e, c) { EN.command(e, 'load_mwe', c.mwe !== undefined ? c.mwe : c.value); },
    trip_turbine:     function (e, c) { EN.command(e, 'turbine_trip', true); },
    turbine_trip:     function (e, c) { EN.command(e, 'turbine_trip', true); },
    set_pressure_setpoint: function (e, c) { EN.command(e, 'pzr_setpoint_mpa', c.mpa !== undefined ? c.mpa : c.value); },
    /* PAYLOAD KEYS ARE THE BOARD'S, FIRST (#506.1, 2026-08-22): the board's heater panel
     * sends `power_pct` (pwr_board_wiring MANUAL/OFF/% box) — the shipped mapper read only
     * `pct`/`value`, so MANUAL, OFF and the % box all fell through to null and re-selected
     * AUTO. Same class as the #408 currency below: the command lands, does the wrong thing,
     * and no error says so. */
    set_heater:       function (e, c) {
      var p = c.power_pct !== undefined ? c.power_pct : c.pct;
      var v = p !== undefined ? p / 100 : (c.auto ? null : c.value);
      EN.command(e, 'pzr_heaters_manual', v === undefined ? null : v);
    },
    set_spray:        function (e, c) {
      var p = c.power_pct !== undefined ? c.power_pct : c.pct;
      var v = p !== undefined ? p / 100 : (c.auto ? null : c.value);
      EN.command(e, 'pzr_spray_manual', v === undefined ? null : v);
    },
    open_block_valve:  function (e, c) { EN.command(e, 'block_valve', true); },
    close_block_valve: function (e, c) { EN.command(e, 'block_valve', false); },
    stuck_porv_open:   function (e, c) { EN.command(e, 'porv_stick', true); },
    /* THE #408 CURRENCY, both directions (2026-08-21): the board's charging/letdown SET
     * controls send `normalized` = gpm / 450,000 (pwr_board_wiring's GPM_CHARGING literal).
     * The shipped B2 mapper read that as a 0..1 pump-demand fraction, so any board setpoint
     * became ~zero flow — the control was effectively dead. Converted through the module's
     * own sourced-scaled ratings. */
    set_charging_flow: function (e, c) {
      e._plcsAuto = false;
      var gpm = (c.normalized !== undefined ? c.normalized : c.value) * 450000;
      e.cv.chargingDemand = Math.max(0, Math.min(1, gpm / RD.cvcs.CVCS.charging_max_gpm()));
    },
    /* the board sends `active` (charging AUTO/MAN panel); `enabled` kept for the old callers */
    set_cvcs_auto:     function (e, c) {
      var on = c.active !== undefined ? c.active : c.enabled;
      e._plcsAuto = on === false ? false : true;
    },
    set_letdown_flow:  function (e, c) {
      var gpmL = (c.normalized !== undefined ? c.normalized : c.value) * 450000;
      var ratedL = RD.cvcs.CVCS.charging_normal_gpm() + RD.cvcs.sealInjectionGpm();
      EN.command(e, 'letdown', gpmL / ratedL);
    },
    set_letdown_orifices: function (e, c) {
      var n = (c.a ? 1 : 0) + (c.b ? 1 : 0);                /* two-orifice lineup -> fraction */
      e._letdownAB = { a: !!c.a, b: !!c.b };                /* the PAIR, latched for the lamps —
                                                             * the engine keeps only the fraction,
                                                             * so A-only and B-only are the same
                                                             * plant but different lineups (#506) */
      EN.command(e, 'letdown', n / 2);
    },
    /* the kernel and every real caller send {rate} in ppm/s — the shipped mapper read
     * c.mode (always undefined) and landed every dose as a no-shift 'match' lineup, the
     * silent-wrong payload class (#507 wave 1). A mode payload still reaches the makeup
     * door for direct lineup selection. */
    set_boron_adjust:  function (e, c) {
      if (c.mode !== undefined) EN.command(e, 'makeup', c.mode);
      else EN.command(e, 'boron_rate', c.rate || 0);
    },
    take_boron_sample: function (e, c) { EN.command(e, 'boron_sample', true); },
    /* THE RHR ALIGN (#507 wave 2). Two REASONED refusals on the way in, both surfaced by
     * the #505 path; ISOLATE is never refused (the ruled asymmetry):
     * — the #458 shape verbatim *(OWNER RULING, 2026-08-12: "A'" — a refusal, NOT a plant
     *   interlock; the pumps are the low-head injection pumps and the message says
     *   "lineup", never "interlock"; declared Manuals/12 §12.20)*;
     * — the sourced 425 psig suction-valve permissive (WTSM 5.1), which pwr1 refuses
     *   silently and this plant refuses out loud. */
    set_rhr:           function (e, c) {
      if (c.active === false) { EN.command(e, 'rhr_align', false); return; }
      if (e.ec.hhsiRunning || e.ec.lhsiRunning) {
        /* #510 LOW: the old message claimed "(SI actuated)" — the pumps can be running on a
         * manual start with no ESFAS signal — and named "RHR pumps" for a condition that
         * also covers the high-head set. Say what is TRUE: injection pumps are running. */
        throw new Error('RHR ALIGN BLOCKED: injection pumps are running (the low-head pumps ' +
          'ARE the shutdown-cooling pumps — the #458 lineup rule). Hot-leg suction ' +
          'unavailable until injection is secured.');
      }
      /* INDICATED pressure, quoted to the player as such (#510 M-2 — HR1: the refusal used
       * to read AND quote true pressure while the P-11 guards forty lines away correctly
       * read the channel; absent means truth, the house fallback) */
      var psig = (e.ins.reading.primary_pressure !== undefined
                  ? e.ins.reading.primary_pressure : e.sys.P) * 145.038 - 14.7;
      if (psig >= RD.rhr.RHR.permissive_open_psig) {
        throw new Error('RHR ALIGN BLOCKED: RCS pressure indicates ' + psig.toFixed(0) +
          ' psig, above the ' + RD.rhr.RHR.permissive_open_psig +
          ' psig suction-valve permissive (WTSM 5.1). Depressurize below it, then align.');
      }
      EN.command(e, 'rhr_align', true);
    },
    set_dhr:           function (e, c) { MAPPED.set_rhr(e, c); },
    set_rhr_hx:        function (e, c) {
      EN.command(e, 'rhr_hx', c.fraction !== undefined ? c.fraction : (c.pct !== undefined ? c.pct / 100 : 1));
    },
    /* the board sends `active` (HPI/AFW START/STOP) — reading only `running` made STOP
     * evaluate `undefined !== false` = true, so STOP STARTED the pump (#506.1, measured)
     *
     * THE PER-SYSTEM UNLATCH (#512, owner design — supersedes #509's reset-then-act):
     * the panel's own securing click IS the reset, gated by the SOURCED reset permissive —
     * WTSM 12.3.2.3 (ML11223A310): the reset circuit's time-delay relay ("usually 45 - 60
     * sec") plus, for SI, the P-4 reactor-trip contact. Inside that window the click
     * refuses out loud with the reason; after it, ONE click resets the function and
     * secures the pump EVEN WITH THE SIGNAL STILL PRESENT — the source is explicit that
     * the reset removes only the start signal, automatic re-actuation is then blocked,
     * and the operator "can ... start or stop equipment as needed". That window is what
     * makes a deliberate TMI-style termination REACHABLE (owner requirement, 2026-08-25)
     * while the first minute of a valid actuation stays protected. Starts always pass. */
    set_hpi:           function (e, c) { eccsStop(e, 'hhsi', c); },
    set_lpi:           function (e, c) { eccsStop(e, 'lhsi', c); },
    set_afw:           function (e, c) {
      var on = (c.active !== undefined ? c.active : c.running) !== false;
      if (!on) afwUnlatch(e);
      EN.command(e, 'afw', on);
    },
    set_afw_flow:      function (e, c) {
      var on = (c.normalized !== undefined ? c.normalized : 1) > 0;
      if (!on) afwUnlatch(e);
      EN.command(e, 'afw', on);
    },
    /* THE FEED TRAIN (2026-08-21, pwr2_feedwater) — the old refusals retired. Payload shapes
     * are the current engine's: pct 0-120, delta_pct, {active}. */
    set_feed_pump_speed: function (e, c) { EN.command(e, 'feed_manual_frac', (c.pct !== undefined ? c.pct : 100) / 100); },
    set_feedwater_flow:  function (e, c) { EN.command(e, 'feed_manual_frac', (c.pct !== undefined ? c.pct : 100) / 100); },
    feed_pump_nudge:     function (e, c) {
      EN.command(e, 'feed_manual_frac', e.fw.feed_frac + (c.delta_pct || 0) / 100);
    },
    set_feed_coupled:    function (e, c) { EN.command(e, 'feed_auto', c.active !== false); },
    isolate_feedwater:   function (e, c) {
      /* the RESTORE click is the FWI unlatch (#512, same per-system law as the stops
       * above). TWO drivers, both would re-isolate silently on the next step (#509 item
       * 5): the pt.fwi latch (hi-hi level), and the feed module's own held-SI isolation
       * (SI held 32 s — pt.fwi never latches on that path, MEASURED). While either DRIVER
       * still stands the click refuses with the cause; a standing SI latch must be
       * secured at the ECCS panel first (it is the isolation's own driver). Once clear,
       * one click resets the latch and restores. */
      if (c.active === false) {
        if (e.pt.si && e.fw.isolated) {
          throw new Error('MFW RESTORE BLOCKED — feedwater is isolated by the latched ' +
            'safety injection (' + (e.pt.si_cause || 'SI') + '). Secure the ECCS first, ' +
            'then restore main feed.');
        }
        if (e.pt.fwi) {
          var leftF = resetDelayS() - e.pt.fwi_t;
          if (leftF > 0) {
            throw new Error('MFW RESTORE BLOCKED — the isolation reset permissive is not yet ' +
              'satisfied: the reset time-delay relay has ' + Math.ceil(leftF) + ' s to run ' +
              '(45-60 s class, the WTSM 12.3.2.3 logic family). Isolated on ' +
              (e.pt.fwi_cause || 'FWI') + '.');
          }
          EN.command(e, 'reset_fwi', true);   /* permissive met: reset + restore, one click */
        }
      }
      EN.command(e, 'isolate_feedwater', c.active !== false);
    },
    loss_of_feedwater:   function (e, c) {
      EN.command(e, 'feed_pump_a', false); EN.command(e, 'feed_pump_b', false);
    },
    /* #510 M-12: the row is the SEAT now, not a rewrite of the operator's demand — the
     * selector and manual_frac stay put, and the clear releases the valve instead of
     * force-selecting AUTO */
    sg_overfeed:         function (e, c) { EN.command(e, 'feed_overfeed', true); },
    coast_down_pumps:  function (e, c) { EN.command(e, 'pump_trip', true); },
    stop_pump:         function (e, c) { EN.command(e, 'pump_trip', true); },
    set_steam_dump_setpoint: function (e, c) {
      EN.command(e, 'dump_pressure_setpoint_mpa', c.mpa !== undefined ? c.mpa : c.value);
    },
    /* the board's ADV buttons send `mode` ('auto'/'closed'); both command zero demand (the
     * auto setpoint logic lives in the engine) — the shell latches WHICH was chosen so the
     * AUTO and SHUT lamps can disagree (they read the same demand otherwise) */
    set_adv:           function (e, c) {
      if (c.mode !== undefined) { e._advMode = c.mode; EN.command(e, 'adv_demand', 0); return; }
      e._advMode = null;                                     /* an explicit % is manual demand */
      EN.command(e, 'adv_demand', (c.pct !== undefined ? c.pct : 0) / 100);
    },
    /* the dump-mode door existed in the engine all along (dump_mode: tavg/pressure/off) —
     * the refusal predated it (#506.1). 'open' stays refused: the dump is controller-driven
     * and no manual full-open lever is modeled. */
    set_steam_dump:    function (e, c) {
      if (c.mode === 'auto') EN.command(e, 'dump_mode', 'tavg');
      else if (c.mode === 'closed') EN.command(e, 'dump_mode', 'off');
      else if (c.mode === 'open') {
        throw new Error('pwr2_shell: set_steam_dump "open" REFUSED — the dump is controller-driven ' +
          '(tavg/pressure modes); no manual full-open lever is modeled. AUTO or CLOSED.');
      }
    },
    set_instrument_failure: function (e, c) {
      /* the pwr1 instrument ids and pwr2 channel ids largely coincide (deliberately);
       * unknown ids throw inside the module, which is the behavior we want. The board's
       * advanced panel sends `instrument_id` (measured — reading only `instrument` made
       * every panel injection land on undefined and throw, #507 wave 3); the SHELL layer's
       * mirror lives in applyCommand, where `this` can reach it.
       * Wave 6: drift and dead pass THROUGH (they used to collapse to 'stuck' silently),
       * and the value rides under EITHER key — the advanced panel sends `value`, the
       * failure defs send `stuck_value`; reading only the latter dropped every typed
       * freeze-at value from the panel. */
      var id = c.instrument_id !== undefined ? c.instrument_id : c.instrument;
      var mode = c.mode === 'fail_low' ? 'low' : c.mode === 'fail_high' ? 'high'
               : c.mode === 'noisy' ? 'noisy' : c.mode === 'drift' ? 'drift'
               : c.mode === 'dead' ? 'dead' : 'stuck';
      var val = c.stuck_value !== undefined ? c.stuck_value : c.value;
      /* MIRROR-ONLY channels (#507 wave 6): porv_indicator is a STRING lamp the reused
       * board layer special-cases and the internal numeric table cannot host — skip the
       * engine command (which would throw before the applyCommand mirror ran) and let the
       * mirror land it on the board layer alone. Any other unknown id still throws. */
      if (!e.ins.channels[id] && id === 'porv_indicator') return;
      EN.command(e, 'instrument_fail', { id: id, mode: mode, value: val });
    },
    clear_instrument_failure: function (e, c) {
      var cid = c.instrument_id !== undefined ? c.instrument_id : c.instrument;
      if (cid === 'porv_indicator') return;          /* mirror-only — the mirror clears it */
      EN.command(e, 'instrument_restore', typeof cid === 'string' ? cid : true);
    },
    clear_all_failures: function (e, c) {
      EN.command(e, 'instrument_restore', true);
      /* EVERY ACTIVE row through its own per-id clear (#510 M-3: the old three-command
       * version left nine wave-3/4/6 levers set — a green "all clear" over a still-broken
       * plant). The list is engineActiveFailures — the SAME detection the Failures tab
       * draws — so a new casualty joins this sweep by teaching the detector and the per-id
       * clear, never by being remembered here (the hand-maintained-map trap). A blackout
       * row hides the LOOP row underneath it (the detector's replace rule), so clear the
       * blackout first and re-scan — the layered clear, #510 M-13. */
      engineActiveFailures(e).forEach(function (id) {
        if (id.indexOf('instrument:') !== 0) REHOMED.clear_failure(e, { failure_id: id });
      });
      engineActiveFailures(e).forEach(function (id) {
        if (id.indexOf('instrument:') !== 0) REHOMED.clear_failure(e, { failure_id: id });
      });
    },
    /* THE LOW-FLUX BLOCK (#507 wave 7 — the HZP startup's own action). The kernel forwards
     * set_trip_block here when ITS trips list is empty (PWR2's RPS lives in the engine);
     * the board's button uses the pwr1 id for the class. One blockable function. */
    set_trip_block: function (e, c) {
      if (c.trip_id === 'pr_low_setpoint' || c.trip_id === 'hi_flux_lo') {
        EN.command(e, 'low_flux_block', c.blocked !== false);
      } else if (c.trip_id === 'lo_press') {
        /* the P-11 pair (#507 wave 10) — the pwr1 board's own ids for the cooldown blocks */
        EN.command(e, 'lo_press_trip_block', c.blocked !== false);
      } else if (c.trip_id === 'si_trip') {
        EN.command(e, 'si_block', c.blocked !== false);
      } else {
        throw new Error('pwr2_shell: trip block "' + c.trip_id + '" REFUSED — this RPS ' +
          'blocks the 35 % low-flux setting (P-10), the low-pressure trip and the SI ' +
          'actuation (both P-11); nothing else');
      }
    }
  };

  /* REHOMED (D4 §3): the old command wrote a derived quantity; the new one sets the actuator
   * that produces it. Each entry documents the re-homing. */
  var REHOMED = {
    /* severity was a fitted leak scalar; PWR2's break takes an AREA and a LOCATION. The scale
     * [derived]: severity 1.0 = 20 cm2 (0.002 m2), the run_pwr2_coredamage class of small
     * break; location defaults to the old implicit cold leg (D4: "default to the current
     * implicit location so existing scenarios keep working"). */
    primary_leak: function (e, c) {
      var sev = c.severity !== undefined ? c.severity : 0.5;
      EN.command(e, 'break_open', { area_m2: Math.max(1e-5, sev * 0.002), node: c.node || 'cold_leg' });
    },
    /* the old open_porv wrote relief demand directly; PWR2's PORV is its controller's — the
     * OPERATOR path is the failure lever pair (stick to open, block valve to close) */
    open_porv_manual: function (e, c) { EN.command(e, 'porv_stick', true); },
    close_porv:       function (e, c) { EN.command(e, 'porv_stick', false); },
    /* grid disconnect is a load rejection: the actuator is the load target */
    disconnect_grid:  function (e, c) { EN.command(e, 'load_mwe', 0); },
    /* set_rcp: OFF secures the pump (the trip actuator + the SECURED display latch), ON is
     * a real motor start since #507 wave 9 (offsite-bus gated in the engine — the refusal
     * surfaces through #505's path when the grid is down) */
    set_rcp:          function (e, c) {
      if (c.running === false) {
        EN.command(e, 'pump_trip', true);
        e._rcpSecured = true;               /* the OPERATOR stopped it — the handswitch
                                             * reads SECURED, not LOST (#200's split) */
      } else {
        EN.command(e, 'rcp_start', true);
        e._rcpSecured = false;
      }
    },
    /* the old effect name for a station blackout — REHOMED onto the real electrical state
     * (#507 wave 4); false is the old engine's recovery case */
    full_blackout:    function (e, c) {
      EN.command(e, 'station_blackout', c === false || c === 0 ? false : true);
    },
    /* the wave-6 effect names, REHOMED onto their levers (#507) */
    set_afw_block:    function (e, c) {
      /* The board's VALVE_TOGGLE sends {open:<bool>} — read it the way pwr_engine does
       * (blocked iff open === false). The old mapper read c.blocked, which no caller sends,
       * and its fallback tested the payload OBJECT (always truthy) — so every click shut the
       * valve and none reopened it (#509 item 6). */
      EN.command(e, 'afw_block', (c && c.open !== undefined ? c.open : c) === false);
    },
    block_afw:        function (e, c) { EN.command(e, 'afw_block', c !== false); },
    degrade_hpi:      function (e, c) {
      e.ec.hhsiAvail = Math.max(0, 1 - (c && c.severity !== undefined ? c.severity : 0.5));
    },
    failed_pzr_heaters: function (e, c) { EN.command(e, 'pzr_heaters_failed', c !== false); },
    failure_to_scram: function (e, c) { EN.command(e, 'scram_block', c !== false); },
    stuck_open_spray: function (e, c) { EN.command(e, 'spray_stick', c !== false); },
    rod_withdrawal_runaway: function (e, c) {
      EN.command(e, 'rod_runaway',
                 (c && c.severity !== undefined ? c.severity : 0.5) * (24 / 912) * 200);
    },
    /* the old command toggled a discrete pump; PWR2's actuator is charging DEMAND — OFF is
     * demand 0 in manual, ON restores nothing by itself (dial a flow or re-select AUTO).
     * The shell latches the selection so the AUTO/MAN/OFF lamps can read it (#506.1). */
    set_charging_pump: function (e, c) {
      var on = (c.running !== undefined ? c.running : c.active) !== false;
      e._chargingPumpOn = on;
      if (!on) { e._plcsAuto = false; e.cv.chargingDemand = 0; }
    },
    inject_failure:   function (e, c) {
      /* the INSTRUMENT rows are data-driven off the pwr defs (type/instrument_id/mode/
       * stuck_value ride through the keep-list by reference); the shell-layer mirror is
       * applied in applyCommand (#507 wave 3) */
      var def = root.RD.PWR_CONFIG && root.RD.PWR_CONFIG.protection &&
                root.RD.PWR_CONFIG.protection.failures &&
                root.RD.PWR_CONFIG.protection.failures[c.failure_id];
      if (def && def.type === 'instrument') {
        MAPPED.set_instrument_failure(e, { instrument_id: def.instrument_id,
          mode: def.mode === 'stuck' ? 'stuck' : def.mode, stuck_value: def.stuck_value });
      }
      else if (c.failure_id === 'stuck_porv_open') EN.command(e, 'porv_stick', true);
      else if (c.failure_id === 'primary_leak') REHOMED.primary_leak(e, c);
      else if (c.failure_id === 'rcp_trip') EN.command(e, 'pump_trip', true);
      else if (c.failure_id === 'turbine_trip') EN.command(e, 'turbine_trip', true);
      else if (c.failure_id === 'loss_of_feedwater') MAPPED.loss_of_feedwater(e, c);
      /* #507 wave 3 — the rows PWR2's existing machinery honestly injects */
      else if (c.failure_id === 'sg_overfeed') MAPPED.sg_overfeed(e, c);
      else if (c.failure_id === 'loss_of_offsite_power') {
        /* the REAL sourced LOOP since #507 wave 4 *(OWNER RULING, 2026-08-22: "Full LOOP +
         * clear" — selected from options I wrote)*: nonvital buses die (RCPs, main feed,
         * condensate/CW), the diesels carry the vital loads, the AFW pumps auto-start
         * (ch10), and the row is clearable — the grid coming back. RCPs stay tripped. */
        EN.command(e, 'offsite_power', false);
      }
      else if (c.failure_id === 'station_blackout') {
        /* the LOOP the diesels did not answer (WTSM 5.7.5) — everything above plus the
         * vital loads; the steam-driven TDAFW pump is the sourced survivor */
        EN.command(e, 'station_blackout', true);
      }
      else if (c.failure_id === 'loss_of_condenser_vacuum') EN.command(e, 'cw_pumps', false);
      else if (c.failure_id === 'degraded_hpi') {
        /* LATENT DEFECT FIXED (#507 wave 6): wave 3 wrote e.ec.avail, which NOTHING in the
         * physics reads — stepECCS consumes hhsiAvail (pwr2_eccs.js) — so the row was inert
         * on flow through two green gate runs. The regression probe now measures the flow. */
        e.ec.hhsiAvail = Math.max(0, 1 - (c.severity !== undefined ? c.severity : 0.5));
      }
      else if (c.failure_id === 'large_loca') {
        REHOMED.primary_leak(e, { severity: c.severity !== undefined ? c.severity : 1.0 });
      }
      else if (c.failure_id === 'rcp_seal_leak') {
        /* [derived] scale, MEASURED: 8e-6 m2 leaks ~1.2 kg/s at operating pressure against
         * the sourced-scaled 1.85 kg/s max charging — holdable with margin, the row's
         * teaching point. Wave 6: the SLIDER IS HONORED (wave 3 discarded it — a rendered
         * control that did nothing); linear in area, sev 2/3 reproduces the wave-3 area
         * exactly, and sev 1.0 (1.2e-5 m2) sits at the edge of what charging can carry. */
        var sevS = c.severity !== undefined ? c.severity : 2 / 3;
        EN.command(e, 'break_open', { area_m2: Math.max(1e-6, sevS * 1.2e-5), node: 'rcp' });
      }
      /* ---- the wave-6 rows (#507): each an engine lever, each with its own probe ---- */
      else if (c.failure_id === 'afw_failure') EN.command(e, 'afw_block', true);
      else if (c.failure_id === 'failure_to_scram') EN.command(e, 'scram_block', true);
      else if (c.failure_id === 'failed_pzr_heaters') EN.command(e, 'pzr_heaters_failed', true);
      else if (c.failure_id === 'stuck_open_spray') EN.command(e, 'spray_stick', true);
      else if (c.failure_id === 'continuous_rod_withdrawal') {
        /* sev × the old ceiling as a FRACTION OF TRAVEL: 24/912 of the old fine bank =
         * 5.26 steps/s on this 200-step bank [adopted]. NOTE: the shipped hot-full-power IC
         * parks the bank at 200/200, so the failure only has travel on a plant whose rods
         * are inserted — declared, not hidden. */
        EN.command(e, 'rod_runaway',
                   (c.severity !== undefined ? c.severity : 0.5) * (24 / 912) * 200);
      }
      else if (c.failure_id === 'sgtr') {
        /* A break AT the sg_primary node — the facade routes it into the SECONDARY with the
         * SG's own backpressure (#507 wave 5). Severity is the sourced slider's fraction of
         * a FULL double-ended rupture. THE AREA IS [UNVERIFIED]: no SG tube geometry document
         * is in any lane's corpus (find_source.js verdict, 2026-08-22), so a typical
         * Westinghouse tube is declared *(OWNER RULING, 2026-08-22: "Declare UNVERIFIED" —
         * a selection from options I wrote)* — 0.75 in OD x 0.048 in wall, ID 0.654 in,
         * double-ended = 2 x pi/4 x ID^2 = 4.33e-4 m2. The break location is SOURCED:
         * "located at the top of the tube sheet on the outlet (cold leg) side" (§15.6.3) —
         * sg_primary is that side of the loop. MEASURED at full severity: 51.8 kg/s initial
         * (#510 M-15: this line shipped saying "~47", understating its own measurement in a
         * way that flattered the anchor). The "1982 Ginna event ~48 kg/s" comparison is
         * ⚠ [recalled] UNVERIFIED — no document in any lane's corpus carries the event's
         * flow figure (find_source.js verdict, 2026-08-24); the break model's declared ~2x
         * subcooled overstatement (pwr2_break.js) is the honest error bar either way. */
        var sevT = c.severity !== undefined ? c.severity : 0.4;
        EN.command(e, 'break_open', { area_m2: Math.max(1e-6, sevT * 4.33e-4),
                                      node: 'sg_primary' });
      }
      else throw new Error('pwr2_shell: failure "' + c.failure_id + '" REFUSED — not in ' +
        'PWR2\'s failure set yet (PORV stick, primary leak, instrument failures exist)');
    },
    clear_failure:    function (e, c) {
      var def = root.RD.PWR_CONFIG && root.RD.PWR_CONFIG.protection &&
                root.RD.PWR_CONFIG.protection.failures &&
                root.RD.PWR_CONFIG.protection.failures[c.failure_id];
      if (def && def.type === 'instrument') {
        /* mirror-only channels (#507 wave 6): the internal table cannot host porv_indicator,
         * so its restore — like its injection — is the applyCommand mirror's alone */
        if (e.ins.channels[def.instrument_id]) {
          EN.command(e, 'instrument_restore', def.instrument_id);
        }
      }
      else if (c.failure_id === 'stuck_porv_open') EN.command(e, 'porv_stick', false);
      else if (c.failure_id === 'primary_leak' || c.failure_id === 'large_loca' ||
               c.failure_id === 'rcp_seal_leak' || c.failure_id === 'sgtr') {
        EN.command(e, 'break_close', true);
      }
      else if (c.failure_id === 'loss_of_feedwater') {
        EN.command(e, 'feed_pump_a', true); EN.command(e, 'feed_pump_b', true);
      }
      else if (c.failure_id === 'sg_overfeed') EN.command(e, 'feed_overfeed', false);
      else if (c.failure_id === 'loss_of_condenser_vacuum') EN.command(e, 'cw_pumps', true);
      else if (c.failure_id === 'degraded_hpi') e.ec.hhsiAvail = 1;
      else if (c.failure_id === 'afw_failure') EN.command(e, 'afw_block', false);
      else if (c.failure_id === 'failure_to_scram') EN.command(e, 'scram_block', false);
      else if (c.failure_id === 'failed_pzr_heaters') EN.command(e, 'pzr_heaters_failed', false);
      else if (c.failure_id === 'stuck_open_spray') EN.command(e, 'spray_stick', false);
      else if (c.failure_id === 'continuous_rod_withdrawal') EN.command(e, 'rod_runaway', 0);
      /* the grid comes back (#507 wave 4). The buses re-energize; the RCPs stay tripped
       * until the OPERATOR restarts them (rcp_start — real since wave 9) and every selector
       * sits where it was left — recovery gives the plant back, it does not re-line it up. */
      else if (c.failure_id === 'loss_of_offsite_power') EN.command(e, 'offsite_power', true);
      else if (c.failure_id === 'station_blackout') EN.command(e, 'station_blackout', false);
      /* clearing an unknown failure is a no-op: there is nothing to clear */
    }
  };

  /* REFUSED: the machinery does not exist in PWR2. A refusal THROWS with its reason —
   * a command that silently does nothing reads exactly like a plant that survived it
   * (the same rule pwr2_instruments applies to misspelled failures). */
  var REFUSED = {
    open_porv:        'the PORV is its controller\'s; the operator path is stick/block (REHOMED pair)',
    open_pzr_safety:  'code safeties are spring-loaded metal with no lever — deliberate (§55)',
    close_pzr_safety: 'code safeties are spring-loaded metal with no lever — deliberate (§55)',
    set_load_mode:    'one dispatch mode exists (operator load target); Follow/Disconnected are the old engine\'s',
    connect_grid:     'reconnection is: reset protection, un-trip the turbine, set a load target — three real commands',
    set_adv_setpoint: 'the ADV auto setpoint is a sourced constant (1040 psig, §48); only demand is an operator lever',
    set_sr_detector:  'the SR channel auto-energizes below the P-6 class point; no operator lever',
    set_condensate_pump: 'no discrete condensate pump lever — the feed train (pwr2_feedwater) models the pumps as the feed module\'s own A/B pair',
    set_condenser_cw_temp: 'the condenser model has CW pumps on/off only',
    set_containment_spray: 'containment sprays are unmodeled (matches the shim\'s registered statics)',
    set_ctmt_fans:    'containment fan coolers are unmodeled (registered static)',
    set_ctmt_recombiners: 'recombiners are unmodeled (registered static)',
    set_steam_demand: 'the turbine is dispatched by load target only',
    /* open/close_msiv and open/close_accumulator_valve moved to MAPPED at #511 — the MSIV
     * and the accumulator are real machinery now */
    stuck_control_rod: 'one lumped bank; a single stuck rod has no representation',
    secondary_depressurize: 'no steam-line break model yet',
    secondary_depressurize_upstream: 'no steam-line break model yet',
    vacuum_decay:     'no condenser vacuum failure lever yet'
  };

  function PWR2Engine(opts) {
    opts = opts || {};
    this._opts = opts;                         /* reset() rebuilds with THESE (#502 — it used
                                                * to pass {}, silently dropping the seed) */
    this.eng = EN.createEngine(opts);
    this.schema = 'pwr2-1.0';
    this._ts = EN.step(this.eng, 0.02);        /* prime: one step so every consumer has a state */
    /* the REUSED shell instrument layer (see header). Requires the pwr1 files loaded — the
     * parallel-phase shell loads both engines; a standalone harness must too, or say why not. */
    if (root.RD.PWRInstruments && root.RD.PWR_CONFIG) {
      this.instruments = new root.RD.PWRInstruments(root.RD.PWR_CONFIG, opts.seed);
      /* THE CHANNEL CURRENCY OVERRIDE (#510 LOW): rod_limit_margin's shared range top is
       * pwr1's 912 FINE steps (4 per step); this bank's own 0..200 steps ARE the currency
       * here, so the no-limit reading and the rail ceiling are 200 — the same physical
       * number, the #500 override pattern, copied so the shared table is untouched. */
      this.instruments.specs = Object.assign({}, this.instruments.specs, {
        rod_limit_margin: Object.assign({}, this.instruments.specs.rod_limit_margin,
                                        { range: [0, 200] })
      });
      /* reset() PRIMES the lag buffers from truth — update() alone leaves the linear-lag
       * branch integrating from undefined (measured: every reading NaN) */
      this.instruments.reset(this._ts, this._instrExtras());
      this.instruments.update(this._ts, 0.02, this._instrExtras());
    } else {
      throw new Error('pwr2_shell: RD.PWRInstruments/RD.PWR_CONFIG not loaded — the shell ' +
        'class REUSES the published instrument layer (D4) and cannot honestly run without it');
    }
  }

  PWR2Engine.prototype.step = function (dt) {
    var prevPwr = this._ts ? this._ts.power_pct : undefined;
    this._ts = EN.step(this.eng, dt);
    /* smoothed %/s power rate for the SG-level shrink-and-swell term — the OLD engine's own
     * form (pwr_engine.js:582, tau 2 s), because the consumer is the old instrument model */
    if (prevPwr !== undefined && dt > 0) {
      var raw = (this._ts.power_pct - prevPwr) / dt, a = dt / (2.0 + dt);
      this._pwrRate = (this._pwrRate || 0) + a * (raw - (this._pwrRate || 0));
    }
    this.instruments.update(this._ts, dt, this._instrExtras());
    return this._ts;
  };

  /* The extras dict pwr_instruments derives its STATUS passthroughs and derived channels
   * from. _copyStatus reads ONLY this dict — for months of the parallel phase the shell
   * passed {}, so all 35 status readings (rcp_running, afw_pump_running, msiv_open,
   * condensate_pump_running…) were undefined and the board's every status word defaulted:
   * the RCP handswitch lit OFF over a running pump, AUX FEED read SECURED, the polisher
   * STANDBY. 21 of the 35 names are contract fields the B1 shim already emits — those pass
   * through verbatim. The rest are computed here from the same sources the class's other
   * surfaces use, or are honest constants for hardware PWR2 does not model. */
  PWR2Engine.prototype._instrExtras = function () {
    var e = this.eng, ts = this._ts, ex = {};
    var st = this.instruments.specs.status;
    for (var i = 0; i < st.length; i++) if (ts[st[i]] !== undefined) ex[st[i]] = ts[st[i]];
    ex.rps_scrammed = ts.scrammed === true;
    /* the PUMP, not the flow: ts.pump_running is mdot > 1 kg/s, which stays true on natural
     * circulation (~5 % flow ≈ 200 kg/s) — the handswitch reads the breaker */
    ex.rcp_running = !e.sys.pumpTripped;
    /* SECURED vs LOST is a real distinction since #507 wave 9: the operator's set_rcp OFF
     * latches secured; a trip that arrived any other way (casualty, LOOP) reads LOST */
    ex.rcp_secured = e._rcpSecured === true && e.sys.pumpTripped === true;
    ex.steam_demand_low = ts.turbine_tripped === true || (ts.steam_flow_normalized || 0) < 0.05;
    /* LIVE since #507 wave 8 — the RIL consumers: rod_at_limit feeds ROD LIMIT LO-LO,
     * rod_limit_margin feeds ROD LIMIT LO (in THIS bank's steps; the alarm row's setpoint
     * is overridden to the sourced RIL+10 in this currency — see getProtectionConfig) */
    ex.rod_at_limit = e._rodAtLimit === true;
    ex.rod_limit_margin = e._rodLimitMargin === undefined ? 200 : e._rodLimitMargin;
    ex.rods_fully_in = e.rodSteps <= 0.5;
    ex.above_p9 = !!(e.rpsReport && e.rpsReport.p9_met);
    ex.afw_block_open = e.aw.blocked !== true;      /* LIVE since #507 wave 6 made aw.blocked
                                                     * real state; the pinned `true` here kept
                                                     * the valve icon OPEN forever (#509 item 6) */
    ex.accum_valve_open = ts.accumulator_valve_open === true;   /* LIVE since #511 */
    ex.safety_relief_active = !!e.pz.safetyOpen;
    ex.mfw_isolated = this.eng.fw.isolated === true;   /* REAL since the feed train (2026-08-21) */
    /* LIVE since #507 wave 1 — the CVCS lab sample (they were pinned null/false/0 while no
     * sample machinery existed) */
    ex.boron_sample = this.eng.cv.sample_ppm;
    ex.boron_sample_pending = this.eng.cv._sample_timer > 0;
    ex.boron_sample_seq = this.eng.cv.sample_seq || 0;
    /* COMMANDED, not the disc: pz.porvOpen is the controller/operator command and porvStuck
     * stays out of it — this is the TMI-2 indicator lie, kept exactly (HR1) */
    ex.porv_commanded_open = !!e.pz.porvOpen;
    /* PWR2's own level-program anchor, not the old engine's computed _tavg_fp */
    ex.tavg_fp = root.RD.pwr2.pressurizer.LEVEL.tavg_full_c;
    /* …and the program LINE itself, so the deviation gauge measures against the plant's own
     * sourced 25..61.5 % program rather than the old engine's — still evaluated at the
     * INDICATED Tavg inside _levelDev (HR1). Measured: +6.4 % standing dev without this. */
    ex.level_program_fn = function (tavg_c) {
      return 100 * root.RD.pwr2.pressurizer.levelProgram(tavg_c);
    };
    ex.power_rate = this._pwrRate || 0;
    return ex;
  };

  PWR2Engine.prototype.getTrueState = function () { return this._ts; };
  PWR2Engine.prototype.getInstruments = function () { return this.instruments.reading; };
  /* The kernel's engine-owned-RPS mirror (#509 items 1/5) asks the engine WHY it is
   * scrammed so rps_state.last_trip_reason is the plant's own cause, not a placeholder. */
  PWR2Engine.prototype.getTripCause = function () {
    return this.eng.pt.reactor_trip ? (this.eng.pt.trip_cause || 'reactor trip') : null;
  };
  PWR2Engine.prototype.getProtectionConfig = function () {
    /* SUPERSEDES THE COURIER READING OF D4 (stage B3): handing back the pwr protection object
     * verbatim would run M4's pwr trip/actuation/automation DATA over this plant — and M4's
     * automation channels issue commands PWR2 REFUSES (set_feed_pump_speed and kin), which
     * would throw inside the service tick. PWR2's config keeps the pwr object's SHAPE (alarms,
     * permissives, labels ride along — annunciators only READ instruments) and empties the
     * ACTING parts: trips, actuations, ESF, runbacks, interlocks and automation channels are
     * PWR2's own, inside the engine (pwr2_protection + the internal control systems), where
     * they are sourced to this plant and gated. The failures table is the subset the class
     * can actually inject — a menu entry for a lever that throws would be a lie. */
    if (!this._protCfg) {
      var base = root.RD.PWR_CONFIG.protection;
      this._protCfg = Object.assign({}, base, {
        trips: [], actuations: [], interlocks: [], runbacks: [],
        /* EXACTLY ONE automation channel rides through (#507 wave 1): the boron batch-dose
         * panel. The emptying rationale above ("channels issue commands PWR2 REFUSES") no
         * longer bars this one — its whole vocabulary is set_boron_adjust {rate} and
         * take_boron_sample, both real commands now, and its analyzer input
         * (instruments.boron_analyzer) has been live all along. Every other pwr channel
         * stays out: their actuators are PWR2's own internal controllers. By reference,
         * like the alarms — the def is the pwr table's own. */
        channels: (base.channels || []).filter(function (ch) { return ch.id === 'boron_conc'; }),
        /* ONE esf entry, DISPLAY-TRUE by construction (2026-08-20, the AFAS build): the board's
         * AUX FEED word is RUNNING / STANDBY / SECURED and STANDBY requires
         * automation.esf.afw === 'auto', which the kernel only emits for a listed system. The
         * AFAS itself lives INSIDE the engine (pwr2_protection.js, the SGLL block) and is not
         * defeatable, so this arm is honest exactly because nothing can flip it: commands: []
         * means the kernel's manual-override scan never sets it MANUAL, and the board's only
         * AFW arm control sends auto:true (a re-arm pushbutton). A disarmable arm here would
         * claim an authority the engine does not grant it — the duplicate-authority veto. */
        esf_systems: [{ id: 'afw', label: 'Auxiliary feedwater', commands: [] }],
        /* THE ONE ALARM OVERRIDE (#500, 2026-08-22): every row rides through by reference
         * EXCEPT pzr_level_low, rebuilt at 17 % — the pwr table's 25.0 % IS this plant's
         * sourced no-load level program point (WTSM 10.3: "low level setpoint of 25%",
         * pwr2_pressurizer LEVEL/GEOM), so at Mode 3 the annunciator stood on a healthy
         * plant sitting exactly on program. 17 % is the sourced heater-cutoff level
         * (LEVEL.low_cut_pct, same WTSM section) — the point at which something real is
         * about to happen. pzr_level_lolo (12) stays below it; the pwr1 table is untouched. */
        alarms: (base.alarms || []).map(function (a) {
          /* two PWR2 setpoint overrides, every other row shared by reference:
           * pzr_level_low 25 -> 17 (#500, the sourced heater-cutoff level);
           * rod_limit_approach 40 -> 10 (#507 wave 8): the shared 40 is the sourced
           * "RIL + 10 steps" in pwr1's FINE-step currency (4 fine per step) — this bank's
           * steps ARE the currency, so the same physical number is 10. */
          return a.id === 'pzr_level_low'
            ? Object.assign({}, a, { setpoint: 17.0 })
            : a.id === 'rod_limit_approach'
            ? Object.assign({}, a, { setpoint: 10 })
            : a;
        }),
        failures: (function () {
          /* the pwr failures table is an OBJECT keyed by id (measured — an array filter
           * threw at boot); keep only the levers the class can actually inject */
          /* the menu = the defs the class can honestly HOST from the pwr table (there is
           * no 'primary_leak' def — the leak arrives as a command, not a menu row).
           * #507 wave 3 grew it by the rows EXISTING machinery injects: the break family
           * (large_loca, rcp_seal_leak), the feed/condenser/ECCS doors, and the two
           * stuck-level instrument rows (both instrument layers, see the applyCommand
           * mirror). Wave 4 made loss_of_offsite_power the REAL sourced LOOP and added
           * station_blackout — the two-bus electrical model. */
          var keep = ['stuck_porv_open', 'rcp_trip', 'turbine_trip', 'loss_of_feedwater',
                      'sg_overfeed', 'loss_of_offsite_power', 'station_blackout',
                      'loss_of_condenser_vacuum',
                      'degraded_hpi', 'large_loca', 'rcp_seal_leak', 'sgtr',
                      /* wave 6 (#507): the failure levers + the two instrument rows the
                       * drift mode and the mirror-only porv channel unlocked */
                      'afw_failure', 'failure_to_scram', 'failed_pzr_heaters',
                      'stuck_open_spray', 'continuous_rod_withdrawal',
                      'tavg_sensor_failure', 'porv_indicator_stuck_closed',
                      'pzr_level_sensor_stuck', 'pzr_level_sensor_low'], out = {};
          keep.forEach(function (id) {
            if (base.failures && base.failures[id]) out[id] = base.failures[id];
          });
          return out;
        })()
      });
    }
    return this._protCfg;
  };
  PWR2Engine.prototype.getStartupLineup = function () { return []; };
  /* THE ENGINE-OWNED BLOCK SURFACE (#507 wave 7). PWR2's RPS lives in the engine, so the
   * kernel's getRpsState merges THIS into its (empty-trip) snapshot: the board's block
   * button then reads and toggles one fact, and the power tile's armed band carries the
   * ENGINE's own 35 % setpoint rather than the static pwr1 table's 25 % (#506.7's shape,
   * completed rather than reversed). `blocked` is the REQUEST — P-10 gates the effect and
   * auto-revokes the request itself below 8 % (pwr2_protection), so the toggle stays
   * symmetric. */
  PWR2Engine.prototype.getTripBlocks = function () {
    var e = this.eng, rp = e.rpsReport || {};
    var blocked = !!e.pt.blockLowFlux;
    var asserted = false, sp = 35;
    (rp.functions || []).forEach(function (f) {
      if (f.id === 'hi_flux_lo') {
        asserted = f.asserted === true;
        if (typeof f.setpoint === 'number') sp = f.setpoint * 100;   /* frac -> % */
      }
    });
    /* the P-11 pair (#507 wave 10): same surface, the pwr1 board ids, the engine's own
     * setpoints attached so the pressure tile arms at THIS plant's numbers */
    var loB = !!e.pt.blockLoPress, siB = !!e.pt.blockSI;
    var p11 = rp.p11_permit === true;
    var spLo = 12.24, spSi = 11.83;
    (rp.functions || []).forEach(function (f) {
      if (f.id === 'lo_pzr_press' && typeof f.setpoint === 'number') spLo = f.setpoint;
      if (f.id === 'si_lo_pzr_press' && typeof f.setpoint === 'number') spSi = f.setpoint;
    });
    return {
      trip_blocks: { pr_low_setpoint: blocked, lo_press: loB, si_trip: siB },
      trip_block_status: {
        pr_low_setpoint: {
          blocked: blocked, asserted: asserted,
          can_block: !blocked && rp.p10_met === true,
          can_clear: blocked,
          setpoint: sp
        },
        lo_press: { blocked: loB, asserted: false,
                    can_block: !loB && p11, can_clear: loB, setpoint: spLo },
        si_trip:  { blocked: siB, asserted: false,
                    can_block: !siB && p11, can_clear: siB, setpoint: spSi }
      }
    };
  };
  /* THE ENGINE-DERIVED CASUALTY DETECTOR — one function, two consumers (#510 M-3): the
   * Failures tab (getActiveFailures below) and MAPPED.clear_all_failures both read it, so
   * "what is broken" and "what a clear-all clears" cannot drift apart. */
  function engineActiveFailures(eng) {
    var out = [];
    if (eng.pz.porvStuck) out.push('stuck_porv_open');
    /* the break family reports by NODE — a seal leak is the rcp node's break (#507 wave 3),
     * a tube rupture the sg_primary node's (#507 wave 5) */
    if (eng.brk && eng.brk.open) {
      out.push(eng.brk.node === 'rcp' ? 'rcp_seal_leak'
             : eng.brk.node === 'sg_primary' ? 'sgtr' : 'primary_leak');
    }
    if (!eng.fw.pumpA && !eng.fw.pumpB) out.push('loss_of_feedwater');
    if (eng.fw.overfeed) out.push('sg_overfeed');   /* the seat reports (#510 M-12) */
    if (!eng.cwPumps) out.push('loss_of_condenser_vacuum');
    if (eng.ec.hhsiAvail < 1) out.push('degraded_hpi');
    /* the electrical pair (#507 wave 4) — a blackout REPLACES the LOOP row rather than
     * stacking with it (it IS a LOOP plus dead diesels; one row, the worse one) */
    if (eng.elec.blackout) out.push('station_blackout');
    else if (!eng.elec.offsite) out.push('loss_of_offsite_power');
    /* the wave-6 levers (#507) */
    if (eng.aw.blocked) out.push('afw_failure');
    if (eng.scramBlocked) out.push('failure_to_scram');
    if (eng.pzDrivers.heaters_failed) out.push('failed_pzr_heaters');
    if (eng.pzDrivers.spray_stick) out.push('stuck_open_spray');
    if (eng.runaway) out.push('continuous_rod_withdrawal');
    var f = eng.ins.failure;
    Object.keys(f).forEach(function (id) { if (f[id]) out.push('instrument:' + id); });
    return out;
  }

  PWR2Engine.prototype.getActiveFailures = function () {
    var out = engineActiveFailures(this.eng);
    /* the SHELL layer can carry a failure the internal table cannot host (the mirror-only
     * porv_indicator, #507 wave 6) — report those too, without doubling the shared ids */
    var f = this.eng.ins.failure;
    var sf = this.instruments && this.instruments.failed;
    if (sf) Object.keys(sf).forEach(function (id) {
      if (sf[id] && !f[id]) out.push('instrument:' + id);
    });
    return out;
  };

  PWR2Engine.prototype.getControlState = function () {
    var e = this.eng, ts = this._ts;
    return {
      /* TWO groups in the old engine's field shape — the board looks them up BY ID
       * ('control_rods'/'shutdown_rods') and prints .steps, so the earlier one-entry
       * id:'control' left both position readouts at 0. BOTH GROUPS ARE REAL since #506.3:
       * two banks on the native 0..200 step scale (max_steps says so; the board renders the
       * unit from it), each with its own scram ramp (control 2.5 s, shutdown 2.0 s) and its
       * own manual drive. moving/direction feed the IN-OUT lamps (#306); scram is excluded
       * there by the board itself. */
      rod_groups: [
        { id: 'control_rods', name: 'Control Rods', function: 'control',
          steps: Math.round(e.rodSteps), max_steps: 200,
          position_pct: 100 * e.rodSteps / 200,
          moving: !ts.scrammed && e.rodSteps !== e.rodTarget,
          direction: e.rodTarget > e.rodSteps ? 1 : (e.rodTarget < e.rodSteps ? -1 : 0),
          speed: e.rodSpeedSel || 'normal', scrammed: !!ts.scrammed,
          /* LIVE since #507 wave 8: the facade's power-dependent RIL — null below its 5 %
           * applicability floor, the pwr1 shape */
          insertion_limit_steps: e._rilSteps === undefined ? null : e._rilSteps,
          at_insertion_limit: e._rodAtLimit === true },
        { id: 'shutdown_rods', name: 'Shutdown Rods', function: 'shutdown',
          steps: Math.round(e.sdSteps), max_steps: 200,
          position_pct: 100 * e.sdSteps / 200,
          moving: !ts.scrammed && e.sdSteps !== e.sdTarget,
          direction: e.sdTarget > e.sdSteps ? 1 : (e.sdTarget < e.sdSteps ? -1 : 0),
          speed: e.rodSpeedSel || 'normal', scrammed: !!ts.scrammed,
          insertion_limit_steps: null, at_insertion_limit: false },
      ],
      porv_demand: e.pz.porvOpen ? 'open' : 'shut',
      porv_block_open: e.pz.blockOpen !== false,
      heater_power_pct: ts.pzr_heater_kw !== undefined ? 100 * ts.pzr_heater_kw / 157.8 : 0,
      spray_valve_pct: ts.spray_flow_pct !== undefined ? ts.spray_flow_pct : 0,
      heater_auto: e.pzDrivers.heaters_manual === undefined,
      spray_auto: e.pzDrivers.spray_manual === undefined,
      pressure_setpoint: e.pz.setpoint_mpa,
      /* the #408 currency (gpm / 450,000) — the board multiplies back to gpm. Demand is a
       * fraction of THIS plant's sourced-scaled max; letdown lineup of its rated point. */
      charging_flow_normalized: (e.cv.chargingDemand === null ? 0 : e.cv.chargingDemand) *
                                RD.cvcs.CVCS.charging_max_gpm() / 450000,
      letdown_flow_normalized: e.cv.letdownOpen *
                               (RD.cvcs.CVCS.charging_normal_gpm() + RD.cvcs.sealInjectionGpm()) / 450000,
      /* the RHR lineup — real since #507 wave 2 (the valve, not the permissive; the split
       * re-enables the board's ALIGN/ISOLATE/HX controls, which key on hx_fraction) */
      rhr_active: e.rh.running === true,
      rhr_valve_open: e.rh.valve_open === true,
      rhr_hx_fraction: e.rh.hx_fraction,
      /* the orifice PAIR from the shell latch; before the first command, derived from the
       * boot letdownOpen (1.0 = both). The lamps read these — they were simply absent, so
       * CLOSED was permanently lit (#506.2). */
      letdown_orifice_a: e._letdownAB ? e._letdownAB.a : e.cv.letdownOpen >= 0.5,
      letdown_orifice_b: e._letdownAB ? e._letdownAB.b : e.cv.letdownOpen >= 1.0,
      charging_pump_running: e._chargingPumpOn !== false,
      cvcs_auto: this.eng._plcsAuto !== false,
      /* the commanded boron rate — the board's BORATING/DILUTING/HOLD word and the
       * boron_trim channel's read-back both key on this one field (#507 wave 1) */
      boron_adjust: e.cv.boron_rate_cmd || 0,
      /* REAL since the feed train (2026-08-21): the delivered main-feed fraction — the
       * "speed" gauge presentation the board's five reader tiles expect (measured) */
      feed_pump_speed_pct: Math.min(120, e.fw.feed_frac * 100),
      feed_coupled: e.fw.auto === true,
      /* THE PER-SYSTEM LATCH LAMPS (#512, owner design): the panel's button carries an
       * ACTUATED color while its function is latched; the panel's own securing click is
       * the unlatch (refused while the live signal stands). fwi_actuated covers BOTH
       * isolation drivers (the hi-hi latch and the feed module's held-SI isolation). */
      si_actuated: e.pt.si === true,
      afas_actuated: e.pt.afas_mdafw === true || e.pt.afas_tdafw === true,
      fwi_actuated: e.pt.fwi === true || (e.pt.si === true && e.fw.isolated === true),
      heaters_shed: ts.pzr_heaters_shed === true,
      condensate_pump_running: ts.condensate_pump_running === true,
      steam_demand_mwe: e.tb.load_target_mwe,
      load_mode: 'manual',
      /* the CAPABILITY list — one dispatch mode exists; the board disables FOLLOW off this
       * (absent list = the old engine, everything enabled) */
      load_modes: ['manual'],
      load_target_mwe: e.tb.load_target_mwe,
      /* the DEMANDED load, distinct from the ramping reference — the board's MW box reads
       * this first so a press computes cur+1 from a number that is not itself moving */
      load_cmd_mwe: e.tb.load_target_mwe,
      steam_dump_pct: ts.steam_dump_valve_pct !== undefined ? ts.steam_dump_valve_pct : 0,
      /* real since #506: the dump-mode door is commanded from the board — the DRIVER is the
       * commanded selection (dcDrivers.mode, forwarded each step); the controller default
       * is tavg = auto */
      steam_dump_auto: (e.dcDrivers.mode !== undefined ? e.dcDrivers.mode
                        : (e.dc ? e.dc.mode : 'tavg')) !== 'off',
      adv_pct: ts.adv_valve_pct !== undefined ? ts.adv_valve_pct : 0,
      /* from the latched selection (AUTO vs SHUT command both zero demand); a manual %
       * demand clears the latch */
      adv_auto: e._advMode !== undefined && e._advMode !== null ? e._advMode === 'auto'
                : e.advDemand === 0,
      adv_setpoint: 1040 / 145.03774,
      adv_setpoint_fixed: true,        /* a sourced constant (§48) — the board darkens its box */
      /* the CONTROLLER's live setpoint, not the driver override: dcDrivers only carries a
       * value after the operator sets one, so the box read 0 psi until first touched —
       * dc.pressure_setpoint_mpa holds the 7.03 MPa (1019 psi) Ginna no-load anchor */
      steam_dump_setpoint: e.dcDrivers.pressure_setpoint_mpa !== undefined
        ? e.dcDrivers.pressure_setpoint_mpa
        : (e.dc && e.dc.pressure_setpoint_mpa !== undefined ? e.dc.pressure_setpoint_mpa : 7.03),
      governor_valve_pct: ts.governor_valve_pct !== undefined ? ts.governor_valve_pct : 0,
      hpi_active: ts.hpi_active === true,
      eccs_mode: ts.eccs_mode,
      /* LIVE since #511 — the tank and the MSIV are real machinery; the #509 item 11
       * *_fixed capability flags retired exactly as designed (an engine that grows the
       * model stops publishing the flag and the valve symbol comes back operable). */
      accumulator_valve_open: ts.accumulator_valve_open === true,
      afw_throttle_pct: (e.aw.mdafwRunning || e.aw.tdafwRunning) ? 100 : 0,
      sr_energized: ts.sr_energized === true,
      msiv_open: ts.msiv_open === true,
      /* flow_pct is what the board's pump animation SPINS on (pumpProps speed) — without it
       * the driver computed NaN and the RCP impeller froze with its pipe ports dark
       * (#506.5, measured). pump_flow_pct is the true-state's own loop-flow fraction. */
      pumps: [{ id: 'rcp', running: !e.sys.pumpTripped,
                flow_pct: ts.pump_flow_pct !== undefined ? ts.pump_flow_pct
                          : (e.sys.pumpTripped ? 0 : 100) }]
    };
  };

  /* THE TWO-LAYER MIRROR (#507 wave 3). PWR2 runs two instrument layers over one truth —
   * the engine's internal channels (the RPS's) and the reused pwr1 layer (the BOARD's,
   * `this.instruments`) — the declared parallel-phase shape. The mappers can only reach the
   * engine, so an injected instrument failure corrupted the internal channels and was
   * INVISIBLE on the board (measured, #507 recon). This mirror applies the same failure to
   * the shell layer; low/high rail to the INTERNAL channel's own range bound so both layers
   * show the same rail. */
  PWR2Engine.prototype._mirrorInstr = function (cmd) {
    var a = cmd.action, sIns = this.instruments, eIns = this.eng.ins;
    function idOf(c) { return c.instrument_id !== undefined ? c.instrument_id : c.instrument; }
    if (a === 'set_instrument_failure') {
      var id = idOf(cmd), mode = cmd.mode;
      var mval = cmd.stuck_value !== undefined ? cmd.stuck_value : cmd.value;
      if (mode === 'noisy') sIns.setFailure(id, 'noisy');
      else if (mode === 'drift') sIns.setFailure(id, 'drift', mval);   /* value = rate; both
                                       * layers default the adopted 0.5/s so they walk together */
      else if (mode === 'dead') sIns.setFailure(id, 'dead');
      else if (mode === 'fail_low' || mode === 'fail_high') {
        /* the range lives on ch.SPEC (#510 M-5): the old `ch.range` was undefined on every
         * internal channel, so the BOARD layer froze at its healthy reading while the
         * internal channel railed — §67's both-layers-rail claim was false for all 14 */
        var ch = eIns.channels && eIns.channels[id];
        var chRange = ch && (ch.spec && ch.spec.range ? ch.spec.range : ch.range);
        var rail = chRange ? (mode === 'fail_low' ? chRange[0] : chRange[1]) : undefined;
        sIns.setFailure(id, 'stuck', rail);
      } else sIns.setFailure(id, 'stuck', mval);
    } else if (a === 'clear_instrument_failure') {
      var cid = idOf(cmd);
      if (typeof cid === 'string') sIns.clearFailure(cid);
      else Object.keys(sIns.failed || {}).forEach(function (k) { sIns.clearFailure(k); });
    } else if (a === 'clear_all_failures') {
      Object.keys(sIns.failed || {}).forEach(function (k) { sIns.clearFailure(k); });
    } else if (a === 'inject_failure' || a === 'clear_failure') {
      var def = root.RD.PWR_CONFIG && root.RD.PWR_CONFIG.protection &&
                root.RD.PWR_CONFIG.protection.failures &&
                root.RD.PWR_CONFIG.protection.failures[cmd.failure_id];
      if (def && def.type === 'instrument') {
        if (a === 'inject_failure') sIns.setFailure(def.instrument_id, def.mode, def.stuck_value);
        else sIns.clearFailure(def.instrument_id);
      }
    }
  };

  var MIRRORED = { set_instrument_failure: 1, clear_instrument_failure: 1,
                   clear_all_failures: 1, inject_failure: 1, clear_failure: 1 };

  PWR2Engine.prototype.applyCommand = function (cmd) {
    if (!cmd || !cmd.action) throw new Error('pwr2_shell: a command needs an action');
    var a = cmd.action;
    if (MAPPED[a])  {
      MAPPED[a](this.eng, cmd);
      if (MIRRORED[a]) this._mirrorInstr(cmd);
      /* reset_rps: the kernel reads back getTrueState() to judge the reset (control_kernel
       * resetRps), and _ts is the PREVIOUS step's snapshot — judged against it, a reset
       * that just succeeded was reported "rods not inserted" (#509 item 1, measured). Patch
       * the one field the reset changed; ts.scrammed IS pt.reactor_trip (pwr2_true_state),
       * so no re-step and nothing else can have moved. */
      if (a === 'reset_rps' && this._ts) this._ts.scrammed = this.eng.pt.reactor_trip === true;
      return { ok: true, action: a };
    }
    if (REHOMED[a]) { REHOMED[a](this.eng, cmd); if (MIRRORED[a]) this._mirrorInstr(cmd); return { ok: true, action: a, rehomed: true }; }
    if (REFUSED[a] !== undefined) {
      throw new Error('pwr2_shell: "' + a + '" REFUSED — ' + REFUSED[a]);
    }
    throw new Error('pwr2_shell: unknown action "' + a + '" — not in any registry');
  };

  PWR2Engine.prototype.reset = function () {
    var opts = this._opts || {};
    this.eng = EN.createEngine(opts);
    this._ts = EN.step(this.eng, 0.02);
    this.instruments = new root.RD.PWRInstruments(root.RD.PWR_CONFIG, opts.seed);
    this.instruments.reset(this._ts, this._instrExtras());
    this.instruments.update(this._ts, 0.02, this._instrExtras());
  };

  /* ---- save/load: schema pwr2-1.0 (see header — pwr-1.0 is deliberately NOT loadable) ---- */
  PWR2Engine.prototype.saveState = function () {
    var e = this.eng;
    /* strip the two non-serializable links; JSON round-trips the rest (plain data by design) */
    var extraMass = e.sys.extraMass;
    delete e.sys.extraMass;
    var chs = {};
    Object.keys(e.ins.channels).forEach(function (id) {
      var c = e.ins.channels[id];
      chs[id] = { lag1: c.lag1, lag2: c.lag2, noise: c.noise, rngState: c.rngState };
    });
    /* the READINGS dict itself rides along: the facade's control/RPS drivers read it one step
     * old, and a load that left it empty would hand them the first-step truth fallback for one
     * step — measured as a 6th-decimal divergence that cascades (bit-exactness is the bar) */
    var insReading = {};
    Object.keys(e.ins.reading).forEach(function (id) { insReading[id] = e.ins.reading[id]; });
    (function(){
    });
    var body = {
      sys: e.sys, rx: e.rx, sg: e.sg, tb: e.tb, rl: e.rl, cd: e.cd, dc: e.dc, cv: e.cv,
      ec: e.ec, aw: e.aw, fw: e.fw, dm: e.dm, pt: e.pt, pz: e.pz, ctm: e.ctm, rh: e.rh,
      brk: e.brk || null,
      ins: { noiseScale: e.ins.noiseScale, failure: e.ins.failure, channels: chs,
             reading: insReading },
      ts: this._ts,                                   /* the published snapshot, restored as-is */
      shellIns: this.instruments.save(),              /* pwr_instruments' own documented API */
      scalars: {
        rodTarget: e.rodTarget, rodSteps: e.rodSteps, simTime: e.simTime,
        /* the second bank + the S/M/F selection + the shell display latches (#506) — an old
         * save without them lands on the constructor's withdrawn/normal defaults, which is
         * the pre-#506 state exactly */
        sdTarget: e.sdTarget, sdSteps: e.sdSteps, rodSpeedSel: e.rodSpeedSel,
        _advMode: e._advMode, _chargingPumpOn: e._chargingPumpOn, _letdownAB: e._letdownAB,
        _rcpSecured: e._rcpSecured,   /* the handswitch's SECURED/LOST split (#507 wave 9) */
        _scramT: e._scramT, _manualTrip: e._manualTrip, _lastTrip: e._lastTrip,
        _rodStopSig: e._rodStopSig, _runbackSig: e._runbackSig, _rbT: e._rbT,
        _rbActive: e._rbActive, _pzRelief: e._pzRelief, _pzReliefH: e._pzReliefH,
        /* the outsurge-heat and SI-boron one-step carriers (#510 batches 1+3) — old saves
         * land on 0, healthy */
        _pzSurgeHeat: e._pzSurgeHeat, _eccsKgs: e._eccsKgs,
        /* the SGTR stream's one-step carriers (#507 wave 5) — old saves land on 0, healthy */
        _sgtrKgs: e._sgtrKgs, _sgtrH: e._sgtrH,
        /* the wave-6 failure levers (#507) — old saves land on the healthy defaults;
         * aw.blocked and the pzDrivers seats ride their own saved objects */
        scramBlocked: e.scramBlocked, runaway: e.runaway,
        _Qox: e._Qox, _cdAvail: e._cdAvail, _plcsAuto: e._plcsAuto,
        _pwrRate: e._pwrRate, _prevPower: e._prevPower,
        _tavgPrev: e._tavgPrev, _tavgRate: e._tavgRate, advDemand: e.advDemand,
        advBlock: e.advBlock, cwPumps: e.cwPumps,
        /* the electrical state (#507 wave 4) — an old save without it lands on the
         * constructor's healthy grid, which is the pre-wave-4 plant exactly */
        elec: e.elec,
        /* the MSIV (#511) — an old save without it lands on the constructor's open valve,
         * which is the pre-#511 plant exactly (the accumulator rides inside ec) */
        msiv: e.msiv,
        pzDrivers: e.pzDrivers, dcDrivers: e.dcDrivers
      }
    };
    var out = JSON.parse(JSON.stringify(body));      /* deep copy, and PROVES serializability */
    e.sys.extraMass = extraMass;
    return { schema: this.schema, state: out };
  };

  PWR2Engine.prototype.loadState = function (saved) {
    if (!saved || saved.schema !== 'pwr2-1.0') {
      throw new Error('pwr2_shell: schema "' + (saved && saved.schema) + '" REFUSED — pwr2-1.0 ' +
        'only. pwr-1.0 saves are not loadable BY DESIGN (D4 §5): inventing node-level ' +
        'distribution from lumped values would be fabrication indistinguishable from physics.');
    }
    var st = JSON.parse(JSON.stringify(saved.state));
    var e = this.eng;
    ['sys', 'rx', 'sg', 'tb', 'rl', 'cd', 'dc', 'cv', 'ec', 'aw', 'fw', 'dm', 'pt', 'pz', 'ctm', 'rh']
      .forEach(function (k) { e[k] = st[k]; });
    e.brk = st.brk || null;
    /* re-link 1: the pressurizer's seat on the conservation core */
    e.sys.extraMass = PZ.extraMassFn(e.pz);
    /* re-link 2: the internal channels' saved dynamic state onto fresh spec references */
    e.ins = IN.createInstruments({ noise_scale: st.ins.noiseScale });
    Object.keys(st.ins.channels).forEach(function (id) {
      if (!e.ins.channels[id]) return;
      var c = e.ins.channels[id], sc = st.ins.channels[id];
      c.lag1 = sc.lag1; c.lag2 = sc.lag2; c.noise = sc.noise; c.rngState = sc.rngState;
    });
    e.ins.failure = st.ins.failure;
    Object.keys(st.ins.reading || {}).forEach(function (id) { e.ins.reading[id] = st.ins.reading[id]; });
    Object.keys(st.scalars).forEach(function (k) { e[k] = st.scalars[k]; });
    /* #511 MIGRATIONS (the CHANGELOG migration-note pattern): a pre-#511 save carries no
     * MSIV and no accumulator — both land on the constructor's healthy at-power lineup
     * (valve open, full tank), which is the pre-#511 plant plus the new machinery. */
    if (!e.msiv) e.msiv = { open: true, pos: 1 };
    if (e.ec && !e.ec.acc && root.RD.pwr2.eccs.createAccumulator) {
      e.ec.acc = root.RD.pwr2.eccs.createAccumulator({});
    }
    this._ts = st.ts;                          /* the same step's own snapshot — no re-derive */
    this.instruments.load(st.shellIns);
  };

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.shell = {
    PWR2Engine: PWR2Engine,
    MAPPED: MAPPED, REHOMED: REHOMED, REFUSED: REFUSED
  };
})(globalThis);
