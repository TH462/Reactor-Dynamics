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
  var EN = RD.engine, PZ = RD.pressurizer, IN = RD.instruments, CD = RD.condenser;

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

  /* MIRROR-ONLY: a NUMERIC board reading the reused pwr instrument layer publishes and this
   * engine has no internal twin for. Such a failure is landed by _mirrorInstr on the board
   * layer alone; the engine command would throw first, before applyCommand ever reached the
   * mirror. #507 wave 6 built that path for exactly one id (porv_indicator) and hard-coded it,
   * which is the whole of #563 item 1.
   *
   * MEASURED 2026-08-30, both engines at hot full power, over the shell's own published list:
   *   RETIRED  85 channels, 85 accept a set_instrument_failure,  0 throw
   *   PWR2     86 channels, 16 accept,                          70 THROW
   * — `pwr2_instruments: no channel "rcs_flow"` in the player's face, on the Hard Rule 1
   * teaching tool, for 35 of the advanced panel's own 50-row dropdown. A regression, not a gap.
   *
   * The test is `specs[id]`, the NUMERIC map, and the two exclusions it leaves are deliberate:
   *   - An id that is not a board channel at all still THROWS. That property is what stops a
   *     typo landing silently, and it is why this is not simply `if (!e.ins.channels[id])`.
   *   - A STATUS boolean still throws, and that is BETTER than the retired engine, which
   *     accepted all 35 and did nothing with any of them (measured: `_applyFailure` runs only
   *     over the numeric SOURCE loop, and `_copyStatus` overwrites the reading unconditionally
   *     afterwards). Making them accept here would ship a 35-wide dark wire to match. */
  function boardNumericChannel(id) {
    var sp = root.RD.PWR_CONFIG && root.RD.PWR_CONFIG.instruments;
    return !!(sp && typeof id === 'string' && sp[id]);
  }
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
  /* AUXILIARY FEEDWATER LEVEL HOLD — PWR2's SECOND automation channel (#562, 2026-08-27).
   *
   * IT LIVES HERE, NOT IN pwr_control.js's PWR_CHANNELS, and that is deliberate. The retired
   * engine ALREADY holds level inside its own steam-generator module (pwr_steam_generator.js
   * afw_flow = capacity x throttle x hold, target pwr_config's afw_level_target 32.0). Adding
   * a channel to the shared table would give that plant a SECOND authority over one valve —
   * the duplicate-authority veto, DESIGN_CRITERIA Q4 — for no gain, on an engine #523 retired.
   * PWR2 is the plant that has the valve and no hold, so PWR2 carries the def. Every other
   * field follows the PWR_CHANNELS shape exactly; the kernel does not care where a def came
   * from (config.channels is just a list).
   *
   * WHY IT QUALIFIES UNDER getProtectionConfig's OWN RULE. That filter admits a pwr channel
   * only when its whole vocabulary is a command PWR2 really has and its input is live. Both
   * hold as of this change: `set_afw_flow {pct}` lands on the engine's `afw_throttle` door,
   * and `instruments.sg_level` has been live since the AFAS build. The rule is not being
   * bent — the second qualifying channel simply now exists.
   *
   * THE CONTRACT DESCRIBED THIS BEFORE IT EXISTED. Blueprint/CONTEXT.md defines
   * afw_flow_normalized as "capacity x throttle x LEVEL HOLD"; the Indications tab told the
   * player "this plant's auxiliary feed is level-controlled and delivers nothing until
   * generator level falls into its band"; the board's AFW AUTO button was already rendered.
   * None of it was true: measured on a loss of offsite power, the generator reached 186.8 %
   * of nominal inventory one hour AFTER the operator pressed STOP.
   *
   * OWNER RULING, 2026-08-27 (selected "Throttle in engine + AUTO channel"): the hold is a
   * CHANNEL, not an engine term, because the sourced action is the OPERATOR'S — WAT 05
   * Transients (ML11216A094): *"It is necessary to throttle AFW flow to control RCS
   * temperature at this point. One symptom that AFW flow needs to be throttled is closure of
   * all steam dump valves."* Baking the hold in, as the retired plant did, deletes that task
   * and teaches the very thing #562 says the plant currently teaches — that auxiliary feed is
   * fire-and-forget. As a channel the player takes it to MANUAL and does the real job, and
   * AUTO is what holds what manual proved (the MANUAL-FIRST directive, 2026-08-12).
   *
   * THE TARGET IS SOURCED, not the retired engine's unattributed 32.0. Westinghouse Technology
   * Systems Manual sec 19.0 (ML11223A342), plant startup step 15: *"Maintain steam generator
   * levels at 33 +/- 5% narrow-range level indication during secondary plant startup BY
   * THROTTLING the feedwater bypass regulating valves."* DECLARED EXTENSION: that source
   * throttles the FEEDWATER BYPASS valves, not the auxiliary feed valves. What it gives is
   * this plant's own narrow-range target and band in the low-power throttled-feed regime,
   * which is the regime auxiliary feedwater works in; the hardware doing the throttling here
   * is WTSM 7.2's (*"the AFW flow control valves are throttled closed. The steam generator
   * water levels are maintained at the appropriate values"*), which names no number. Neither
   * source alone gives both halves, and that is stated rather than blended away.
   *
   * ff 100 + kp 20 REPRODUCES THE RETIRED ENGINE'S SHAPE — full flow below the band, tapering
   * to zero across it — with ki 0, because an integrator on a level auxiliary feedwater itself
   * moves winds up through every dry-out. 28 % narrow range (33-5) clips the demand at 100;
   * 38 % (33+5) reaches 0. NOTHING HERE STARTS OR STOPS A PUMP: the throttle is delivery, the
   * pumps stay latched where protection put them (HR5). */
  var AFW_LEVEL_CHANNEL = {
    id: 'afw_level', kind: 'pid', group: 'Secondary',
    label: 'Aux feedwater → SG level (throttle)',
    hint: 'Holds steam-generator narrow-range level with the auxiliary feedwater flow control valves — full flow below the band, tapering shut across it. It throttles; it never starts or stops a pump. MANUAL hands you the valve, which is the real post-trip task: too much auxiliary feed overcools the primary.',
    pv: function (s) { return s.instruments.sg_level; },
    ff: function () { return 100; },
    cmd: function (u) { return { action: 'set_afw_flow', pct: u }; },
    manual_overrides: ['set_afw_flow'],
    /* STANDBY, not stood-down. The channel stays ACTIVE with no pump running, deliberately:
     * that is what pre-positions the valve shut so an AFAS start delivers nothing until level
     * falls into the band — the behaviour the Indications tab has always described and the
     * retired engine's always-on hold had. `offWhen` would instead leave the valve wherever it
     * was last, and a loss of offsite power would open both pumps wide for one 3 s period
     * before the controller caught up. DECLARED COSMETIC RESIDUE: the kernel consults
     * `standby` for the snapshot flag and, in the note path, only for `kind:'rods'` — so a
     * healthy at-power plant shows this channel `saturated:'lo'` with "at minimum output — no
     * authority to correct". True (shut valve, no pump), but it reads like a fault. Fixing it
     * means teaching the PID path about standby, which is a kernel change touching every
     * plant; not taken here, and not worth pretending is absent. */
    standby: function (s) { return !(s.instruments && s.instruments.afw_pump_running); },
    standbyNote: 'standing by — no auxiliary feed pump running',
    defaultOn: function () { return true; },
    uMin: 0, uMax: 100, kp: 20, ki: 0, db: 0.5, minDelta: 1.0, period: 3.0, pvTau: 1.5,
    program: function () { return 33; },      /* [sourced] WTSM 19.0 step 15 — 33 +/- 5 % NR */
    spSlew: 0.1,
    sp: { capture: function () { return 33; }, min: 20, max: 60, unit: '%', dp: 0, step: 1 }
  };

  /* THE STANDING TRIP SIGNAL (#571) — the ONE derivation behind three consumers: the
   * instrument the board's caption reads, the kernel's reset permissive, and this shell's own
   * reset refusal. A second copy of a protection test is the defect class #294, #303 and #557
   * are all instances of, so there is exactly one.
   *
   * WHY IT HAD TO BE BUILT HERE. `control_kernel.rpsResetBlock` implements this refusal by
   * iterating `this.config.trips` — and `getProtectionConfig` hands PWR2 an EMPTY trips list,
   * correctly, because this plant's protection lives in the engine (#546/#547, validation §98).
   * So the loop ran zero times and TRIP_SIGNAL_PRESENT could never be returned, while
   * `Manuals/03` §3.5.1 documented it as one of TWO live permissives with its own board
   * caption. MEASURED: a large LOCA holding lo_pzr_press at 1074 psia against its 1775 psia
   * setpoint, asserted and tripping — `rpsResetBlock()` returned null, `resetRps()` returned
   * null, the latch cleared, and ONE 0.1 s protection step later it re-latched on the same
   * signal. An accepted reset that undoes itself, with the SCRAMMED lamp blinking and nothing
   * saying why.
   *
   * IT READS `asserted`, NOT `tripping`, to mirror the kernel's own semantics exactly: that
   * version tests the raw `crossed(...)` with no delay, and skips blocked and condition-gated
   * rows. `asserted` is already false under every gate this plant has (the operator's block,
   * P-7, P-11), so the two agree by construction rather than by a second copy of the gate
   * tests. It is also the conservative half — a channel past its setpoint but not yet through
   * its delay will re-latch, and the breakers would not hold in against it either.
   *
   * `turbine_trip` and the manual pushbutton are deliberately NOT reachable here: both are
   * latch INPUTS in pwr2_protection, not table rows, so they never appear in `functions`.
   * That is load-bearing — the turbine stays tripped until it is latched, and `latch_turbine`
   * itself refuses under a standing reactor trip, so a turbine row here would deadlock the
   * two commands against each other. */
  function standingTrip(e) {
    var fns = (e.rpsReport && e.rpsReport.functions) || [];
    for (var i = 0; i < fns.length; i++) {
      if (fns[i].kind === 'rps' && fns[i].asserted) return fns[i];
    }
    return null;
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
    /* THE RESET NEEDS THE RODS IN, ON EVERY PATH (#545). The engine's `reset_protection` door
     * clears the latch unconditionally, and until this guard the kernel's RODS_NOT_INSERTED
     * permissive was the ONLY thing enforcing it — so the facade reset the trip at 200/200
     * (measured), and on the ATWS path it reset with the shutdown bank fully withdrawn. The
     * guard lives HERE rather than in the engine because this is the operator's door, which
     * is where `latch_turbine` and `afwUnlatch` put theirs; the engine door stays raw for the
     * gates. The retired engine enforces the same interlock in its own `reset_rps`.
     *
     * `e.pt.reactor_trip &&` is load-bearing: an un-tripped plant sits at 200/200 and there
     * is nothing to reset, so an unconditional guard would refuse a harmless no-op (run_pwr2_
     * kernel sweeps this action against exactly that plant).
     *
     * THE DEMAND SNAP is the manual's own sentence — Manuals/03 §3.5.1, "The rods stay where
     * they are until you deliberately withdraw them". The breakers re-close with no standing
     * motion demand; without it a target latched before the trip would drive the bank the
     * instant power came back, with no press behind it. This is the one place a latched demand
     * may legitimately be cleared — everywhere else, rewriting it is the heals-itself trap. */
    reset_rps:        function (e, c) {
      /* ORDER IS THE MESSAGE (#571): the standing-trip check runs FIRST, matching the kernel's
       * own ordering and its reason — a breaker will not hold in against a live trip signal,
       * which is the more fundamental refusal. Rod bottom is the second one. */
      if (e.pt.reactor_trip) {
        var live = standingTrip(e);
        if (live) {
          throw new Error('RPS RESET BLOCKED: the ' + live.name + ' trip signal is still ' +
            'asserted (' + live.value.toFixed(3) + ' against a setpoint of ' +
            live.setpoint.toFixed(3) + ' ' + (live.unit || '') + ') — a breaker will not hold ' +
            'in against a live trip signal. Clear the condition first.');
        }
      }
      if (e.pt.reactor_trip && !(e.rodSteps <= 0.5 && e.sdSteps <= 0.5)) {
        throw new Error('RPS RESET BLOCKED: the rods are not at the bottom of their travel ' +
          '(control ' + e.rodSteps.toFixed(0) + ', shutdown ' + e.sdSteps.toFixed(0) +
          ' of 200 steps) — the reactor trip breakers reset with the rods in.');
      }
      EN.command(e, 'reset_protection', true);
      e.rodTarget = e.rodSteps; e.sdTarget = e.sdSteps;
    },
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
    /* LATCH THE TURBINE (#551/#559, 2026-08-27) — the verb the real plant uses, and the half
     * of this pair that did not exist. Both mappers above hard-code `true`; NO key in MAPPED
     * (48) or REHOMED (16) ever passed false, `connect_grid` and `set_load_mode` are REFUSED,
     * and `clear_failure {turbine_trip}` fell off the end of its if-chain. Measured: 896
     * command/payload combinations against a tripped plant, NONE cleared `tb.tripped`. One
     * scram ended electrical generation for the session, while `load_target_mwe` read back the
     * MWe the operator typed so the board looked like it was obeying.
     *
     * [sourced] WTSM 11.3 (ML11223A295): *"If the turbine is latched (not tripped), it is
     * controlled in one of two operational modes"* — LATCHED is the plant's own word for the
     * state this command establishes, and its opposite is TRIPPED. Ginna UFSAR ch10
     * (ML20339A040): *"The defeat switch is automatically bypassed when the turbine is
     * latched."*
     *
     * IT REFUSES OUT LOUD RATHER THAN BEING OVERWRITTEN, which is the whole design. A bare
     * un-latch would be accepted and then undone on the next step by whichever of the six
     * level-holds is standing — the #509 §79 defect, where the plant agrees and nothing
     * happens. `turbineTripCauses` enumerates them and this names them back to the operator,
     * the same shape `afwUnlatch` above uses for the aux feed and safety-injection latches.
     *
     * DELIBERATELY NOT BUILT: turbine roll and generator synchronisation. WTSM 11.3 describes
     * a real sequence (latch closes the throttle and governor valves, speed control rolls the
     * machine, then load control), and this plant's turbine is binary — rpm is `tripped ? 0 :
     * rated`. Modelling the roll is #307, CLOSED and `status-deliberate` as "open by design"
     * (CURRICULUM PWR-N05). Latching puts the machine back on the line
     * *(OWNER RULING, 2026-08-27: selected "Latch = back on the line" over modelling the roll
     * and over a timed ramp — a menu selection, cited in that form)*. */
    latch_turbine:    function (e, c) {
      if (!e.tb.tripped) return;                          /* already latched — a no-op, not an error */
      var causes = EN.turbineTripCauses(e);
      if (causes.length) {
        throw new Error('TURBINE LATCH BLOCKED: ' +
          causes.map(function (x) { return x.why; }).join('; and ') +
          '. Clear it and latch again.');
      }
      EN.command(e, 'turbine_trip', false);
    },
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
      /* `open` IS A DOCUMENTED PAYLOAD KEY and was being dropped (#537 adjacent, 2026-08-28):
       * Manuals/03's command table lists `set_spray {open}` and the Mode 1 pressure-control
       * procedure sends exactly that — which fell through to `null` and selected AUTO, so the
       * step that says "open the spray" handed control back to the controller instead. Same
       * class as the #506.1 payload-key defect three lines up, and precisely the blind spot
       * run_manual_commands names in its own header: it can check that an action EXISTS, never
       * that the plant reads the key the manual prints. */
      if (p === undefined && c.open !== undefined) p = c.open ? 100 : 0;
      var v = p !== undefined ? p / 100 : (c.auto ? null : c.value);
      EN.command(e, 'pzr_spray_manual', v === undefined ? null : v);
    },
    /* AUXILIARY SPRAY (#563 item 2, wired 2026-08-30). Built at stage 2c, gated
     * (run_pwr2_pressurizer), mutation-tested — and in NONE of MAPPED, REHOMED or REFUSED,
     * which this file's own header says cannot happen. Not a declared gap; simply no door.
     *
     * It is the cooldown path for a plant with its reactor coolant pumps secured, and since
     * #507 wave 10 that is the SHIPPED cold end (Mode 4, Hot Shutdown). The normal spray draws
     * its motive head from the loop, so with the pumps down and the coastdown past, the only
     * other way down in pressure is to lift the PORV into containment — the action the real
     * system carries auxiliary spray to avoid (WTSM 3.2, quoted in pwr2_pressurizer.js:263).
     *
     * MEASURED authority — hot zero power, every pump tripped, heaters manual 0, 600 s:
     *   with aux spray 100 %:  2238.1 -> 1365.3 psia (15.43 -> 9.41 MPa)
     *   with it shut:          2238.1 -> 2229.2 psia (15.43 -> 15.37 MPa)
     * 864 psi (5.96 MPa) of depressurization authority, 1.83 kg/s (29.0 gpm), up to 2,523 kW.
     *
     * NO AUTO BRANCH, deliberately: the module is explicit that this is an operator command and
     * never automatic. The payload otherwise follows set_spray's exactly — `open` key included
     * — because the two controls sit beside each other and a procedure will send either. */
    set_aux_spray: function (e, c) {
      var p = c.power_pct !== undefined ? c.power_pct : c.pct;
      if (p === undefined && c.open !== undefined) p = c.open ? 100 : 0;
      var v = p !== undefined ? p / 100 : (c.value !== undefined ? c.value : 0);
      EN.command(e, 'aux_spray', Math.max(0, Math.min(1, v)));
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
    /* CIRCULATING-WATER INLET TEMPERATURE (#591 item 1, owner playtest 2026-08-30: "changing
     * condenser cooling temp didn't affect anything notably").
     *
     * IT WAS A DARK WIRE, NOT A MISSING FEATURE. `pwr2_condenser` has computed the vacuum from
     * this temperature since it was written — its own header says so ("handed warmer lake
     * water, and the backpressure follows — which is what makes the C-9 permissive something
     * the player can lose rather than something the scenario asserts") — and `cw_inlet_c` is
     * real state on the module. Nothing wrote it after `createCondenser`. This action sat in
     * REFUSED carrying the retired plant's reason, "the condenser model has CW pumps on/off
     * only", which was FALSE for this engine, and the board drew the box dark off the
     * capability flag that refusal justified. Same shape as #540 and the #507 wave-6 rows: a
     * driver documented, read, and never passed.
     *
     * MEASURED through this door, hot full power, 600 s, DT 0.02 — the sweep and the two
     * sourced C-9 crossings are in `pwr2_condenser.js` beside the range it clamps to. Payload
     * is `c` in degC, matching the board and the retired engine's command shape. */
    set_condenser_cw_temp: function (e, c) { EN.command(e, 'cw_inlet_temp', c.c); },
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
    /* THE PUMP SWITCHES ARE PER PUMP [sourced] — Ginna TS Bases B 3.3.2 (a), "one switch for
     * each pump", which pwr2_afw.js has cited since it was written and which the ENGINE has
     * always honoured with two doors (`afw`, `afw_tdafw`). THE SHELL WIRED ONLY THE FIRST
     * (#541): `afw_tdafw` was in no registry, so it threw "unknown action", and the board's
     * one AFW panel sent `set_afw` — which returned {ok:true}, cleared BOTH actuation latches
     * and secured only the motor-driven pump. Measured on a loss of offsite power, one hour
     * after the operator pressed STOP: 52,643 lbm (23,879 kg) in a shell rated for 28,186 —
     * 186.8 % of nominal, +22,107 lbm added AFTER the stop, run lamp still lit.
     *
     * `pump` selects: 'mdafw' | 'tdafw' | absent = BOTH. Absent-means-both keeps every
     * existing caller (the board's old panel, the instructor, saved missions) meaning what it
     * meant, while the new per-pump switches say which one they are. The unlatch runs ONCE for
     * either, because the actuation latch is per FUNCTION, not per pump. */
    set_afw:           function (e, c) {
      var on = (c.active !== undefined ? c.active : c.running) !== false;
      var p = c.pump;
      if (p !== undefined && p !== 'mdafw' && p !== 'tdafw')
        throw new Error('pwr2_shell: set_afw pump "' + p + '" — this plant has one ' +
          'motor-driven ("mdafw") and one turbine-driven ("tdafw") auxiliary feed pump.');
      if (!on) afwUnlatch(e);
      if (p !== 'tdafw') EN.command(e, 'afw', on);
      if (p !== 'mdafw') EN.command(e, 'afw_tdafw', on);
    },
    /* THE THROTTLE (#562). `pct` is what layers/control/control_kernel.js declares as this
     * action's value field, what Blueprint/CONTEXT.md names (`afw_throttle_pct`), what the
     * manual documents and what ui/app.js's own handler sends. THIS READ ONLY `c.normalized`,
     * so `{pct: 0}` fell through to the `: 1` default, evaluated `1 > 0` = true and RE-STARTED
     * the pump — the payload-key-mismatch class from #506 and #507 wave 6, on the plant the
     * site runs. Both keys are accepted; `pct` wins because it is the declared one.
     *
     * THROTTLING IS NOT SECURING. Closing the valve leaves the pumps running, which is the
     * plant's own idiom and the reason `afwUnlatch` is NOT called here: a throttled-shut pump
     * is available to re-open instantly, and making the throttle secure the pumps would make
     * it refuse inside the actuation reset window for no physical reason. */
    set_afw_flow:      function (e, c) {
      var frac = c.pct !== undefined ? +c.pct / 100
               : c.normalized !== undefined ? +c.normalized
               : c.fraction !== undefined ? +c.fraction : 1;
      if (!isFinite(frac))
        throw new Error('pwr2_shell: set_afw_flow needs a numeric pct (0-100) or normalized (0-1).');
      EN.command(e, 'afw_throttle', frac);
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
      /* ...AND EVERYTHING ELSE USED TO FALL OFF THE END, silently accepted (#570). `{mode:
       * 'manual'}` and `{pct: N}` both returned ok and did nothing — the #506 dead-command class,
       * latent because the board sends only the three modes above, and documented in Manuals/03
       * §18 as `{mode | pct}`, which is how a latent one becomes a live one. Refuse by name. */
      else if (c.pct !== undefined || c.mode !== undefined) {
        throw new Error('pwr2_shell: set_steam_dump ' + JSON.stringify(c.mode || c.pct) +
          ' REFUSED — this dump has no manual position lever. The modes are AUTO (controller) ' +
          'and CLOSED; the setpoint it controls to is set_steam_dump_setpoint.');
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
      /* MIRROR-ONLY channels (#507 wave 6, generalised at #563 item 1): a numeric board
       * reading with no internal twin — skip the engine command (which would throw before the
       * applyCommand mirror ran) and let the mirror land it on the board layer alone. The
       * derivation, the measurement and what is deliberately still refused: boardNumericChannel
       * above. porv_indicator is one of these, not a special case any more. */
      if (!e.ins.channels[id] && boardNumericChannel(id)) return;
      EN.command(e, 'instrument_fail', { id: id, mode: mode, value: val });
    },
    clear_instrument_failure: function (e, c) {
      var cid = c.instrument_id !== undefined ? c.instrument_id : c.instrument;
      /* mirror-only — the mirror clears it. Same set as the failure side (#563 item 1); a
       * per-id clear on a channel the engine never knew about would throw on the way out. */
      if (typeof cid === 'string' && !e.ins.channels[cid] && boardNumericChannel(cid)) return;
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
    /* THE OPERATOR'S PORV (2026-08-25): a real manual open demand on one valve. Until this
     * date the button was routed through the STICK lever, so "open PORV" was a failure
     * injection and the stick could never wait for a lift — see pwr2_pressurizer step 3. The
     * close is ineffective while the stick latch holds (the manual's "close_porv overridden;
     * PORV remains open"); the block valve is the operator's isolation. */
    open_porv_manual: function (e, c) { EN.command(e, 'porv_manual', true); },
    close_porv:       function (e, c) { EN.command(e, 'porv_manual', false); },
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
      /* ARMS the latch (owner design, 2026-08-25): the valve stays shut until the plant or
       * the operator lifts it, then it never reseats — pwr2_pressurizer step 3 */
      else if (c.failure_id === 'stuck_porv_open') EN.command(e, 'porv_stick', true);
      else if (c.failure_id === 'primary_leak') REHOMED.primary_leak(e, c);
      else if (c.failure_id === 'rcp_trip') EN.command(e, 'pump_trip', true);
      else if (c.failure_id === 'turbine_trip') EN.command(e, 'turbine_trip_failed', true);
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
      else if (c.failure_id === 'anticipatory_trip_failure') EN.command(e, 'p9_defeat', true);
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
      /* #551: this row fell off the end of the chain — the instructor could inject a turbine
       * trip and neither clear it nor see it listed. Clearing it LATCHES the machine, and it
       * goes through the same permissive as the operator's own command: a clear that silently
       * failed because something else was holding the trip would be the original defect wearing
       * an instructor's hat. */
      else if (c.failure_id === 'turbine_trip') {
        EN.command(e, 'turbine_trip_failed', false);
        if (EN.turbineTripCauses(e).length === 0) EN.command(e, 'turbine_trip', false);
      }
      else if (c.failure_id === 'degraded_hpi') e.ec.hhsiAvail = 1;
      else if (c.failure_id === 'afw_failure') EN.command(e, 'afw_block', false);
      else if (c.failure_id === 'failure_to_scram') EN.command(e, 'scram_block', false);
      else if (c.failure_id === 'anticipatory_trip_failure') EN.command(e, 'p9_defeat', false);
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
    open_porv:        'the PORV is its controller\'s; the operator path is open_porv_manual / close_porv (porv_manual, one valve) and the block valve',
    open_pzr_safety:  'code safeties are spring-loaded metal with no lever — deliberate (§55)',
    close_pzr_safety: 'code safeties are spring-loaded metal with no lever — deliberate (§55)',
    set_load_mode:    'one dispatch mode exists (operator load target); Follow/Disconnected are the old engine\'s',
    /* #551: this text's recipe named an action that DID NOT EXIST for as long as the refusal
     * did — "un-trip the turbine" had no command behind it anywhere in the tree, so the one
     * message telling the player what to do instead sent them hunting the board for a control
     * that was never built. `latch_turbine` exists now and the recipe is true; the verb is the
     * plant's own (WTSM 11.3: "if the turbine is LATCHED (not tripped)"). */
    connect_grid:     'reconnection is three real commands, not one synthetic verb: reset_rps, latch_turbine, set_load_target',
    set_adv_setpoint: 'the ADV auto setpoint is a sourced constant (1040 psig, §48); only demand is an operator lever',
    set_sr_detector:  'the SR channel auto-energizes below the P-6 class point; no operator lever',
    set_condensate_pump: 'no discrete condensate pump lever — the feed train (pwr2_feedwater) models the pumps as the feed module\'s own A/B pair',
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
                                        { range: [0, 200] }),
        /* ONE NAME ADDED TO THE STATUS LIST (#571), the same copy-don't-touch pattern.
         * `_copyStatus` reads ONLY this array — `this.reading[st[i]] = ex[st[i]]` — so a key
         * `_instrExtras` publishes but the list does not name never reaches the reading at all.
         * MEASURED when this was first written against the SHARED list: the permissive read
         * `undefined`, `crossed(undefined, 'is_true')` is FALSE, and every reset was refused
         * including the ordinary post-scram one. A silent-undefined that reads as a working
         * interlock, which is why it is worth the two lines to keep the array explicit.
         * PWR1 is deliberately untouched: it needs no such instrument, because on that plant
         * the kernel's own `config.trips` loop supplies this refusal. */
        status: (this.instruments.specs.status || []).concat(['no_trip_signal_standing'])
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
    /* BOTH BANKS (#545). The retired engine has had this right since #75 —
     * `this.rod_groups.every(g => g.position_pct <= RODS_IN_PCT)` — and this was a second
     * copy that lost the `every`, so the kernel's RODS_NOT_INSERTED reset permissive was
     * judging the reset on the CONTROL bank alone. Invisible under a normal trip, where the
     * shutdown bank seats FIRST (SD_SCRAM_S 2.0 s against SCRAM_S 2.5 s); measured wrong on
     * the failure-to-scram path, where rods 0/200 published `rods_fully_in: true`. */
    ex.rods_fully_in = e.rodSteps <= 0.5 && e.sdSteps <= 0.5;
    /* THE RESET'S OTHER PERMISSIVE (#571), published in the POSITIVE so a `direction:
     * 'is_true'` row reads as the condition that must HOLD, like rods_fully_in beside it.
     * The board's caption (`SCRAM_RESET_NOTE.TRIP_SIGNAL_PRESENT` -> "TRIP SIGNAL STANDING")
     * has been wired and waiting for a reason PWR2 never sent — this is what sends it, with
     * no board change at all. See standingTrip() for why the kernel's own version is dead
     * here and why this reads `asserted`. */
    ex.no_trip_signal_standing = !standingTrip(e);
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
    /* COMMANDED, not the disc: BOTH demands — the controller's ladder (pz.porvOpen) and the
     * OPERATOR's lever (pz.porvManual) — while porvStuck stays out of it, which is the TMI-2
     * indicator lie kept exactly (HR1). The comment used to say "controller/operator" while
     * the code carried only the controller (#552): a hand-opened PORV blew 1,145 psi (7.90 MPa)
     * out of the RCS with this lamp, the PORV OPEN annunciator and control_state.porv_demand
     * all reading CLOSED, and the Indications pane flagging a permanent divergence on a plant
     * whose instruments were fine. The stuck disc is what this channel must MISS; the
     * operator's own hand is not. */
    ex.porv_commanded_open = !!(e.pz.porvOpen || e.pz.porvManual);
    /* PWR2's own level-program anchor, not the old engine's computed _tavg_fp */
    ex.tavg_fp = root.RD.pwr2.pressurizer.LEVEL.tavg_full_c;
    /* …and the program LINE itself, so the deviation gauge measures against the plant's own
     * sourced 25..61.5 % program rather than the old engine's — still evaluated at the
     * INDICATED Tavg inside _levelDev (HR1). Measured: +6.4 % standing dev without this. */
    ex.level_program_fn = function (tavg_c) {
      return 100 * root.RD.pwr2.pressurizer.levelProgram(tavg_c);
    };
    /* …and the OVERTEMPERATURE / OVERPOWER SETPOINT EQUATION (#561), for the same reason and by
     * the same route. The reused instrument layer drew its delta-T margin gauge from the retired
     * plant's fitted DNB surface on a 33.0 degC rated split, while THIS plant's trip is the
     * sourced Ginna Table 15.0-7 form on a 31.1 degC split — so the tile went red with 13.70
     * margin points still standing and the "OTdT ROD STOP" annunciator, which reads the same
     * channel, latched 436 s before the trip. Same coefficients the trip uses, read from the
     * protection module rather than retyped; the layer feeds them the INDICATED Tavg and
     * pressure, so HR1 is untouched. */
    var OT = root.RD.pwr2.protection.OTDT, PSIA = root.RD.pwr2.protection.PSIA_PER_MPA;
    ex.otdt_form = {
      delta_t_rated_c: root.RD.pwr2.sources.DESIGN.dt_c,
      otSp: function (tavg_c, p_mpa) {
        return OT.k1 + OT.k2_per_psi * (p_mpa * PSIA - OT.p_ref_psia)
                     - OT.k3_per_f * ((tavg_c * 9 / 5 + 32) - OT.t_ref_f);
      },
      opSp: function (tavg_c) {
        return OT.k4 - OT.k6_per_f * ((tavg_c * 9 / 5 + 32) - OT.t_ref_f);
      }
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
        /* THE RESET'S FIRST PERMISSIVE, RESTORED (#571). The kernel implements this refusal by
         * iterating `trips` — which is empty two lines up, correctly — so TRIP_SIGNAL_PRESENT
         * could never fire on this plant while `Manuals/03` §3.5.1 documented it as one of two.
         * It rides here instead, on the instrument the shell publishes from the engine's own
         * report, PREPENDED to the pwr table's rows because order is the message the operator
         * gets and the kernel's own comment says why: a breaker will not hold in against a live
         * trip signal, so that is the more fundamental refusal and is named first.
         *
         * The message is GENERIC where the kernel's names the channel, because a permissive row
         * carries static text and teaching the kernel to interpolate would be a shared-code
         * change for one plant (HR3). The annunciators name which trip is in — that is what
         * they are for — and the shell's own reset refusal, which the facade and the board both
         * reach, quotes the channel, its value and its setpoint. */
        rps_reset_permissive: [{
          instrument: 'no_trip_signal_standing', direction: 'is_true',
          reason: 'TRIP_SIGNAL_PRESENT',
          message_learning: 'A reactor trip signal is still asserted — the breakers will not ' +
            'hold in against it. Clear the condition that tripped the plant first; the ' +
            'annunciators name which channel is in.',
          message_industry: 'RPS RESET BLOCKED — trip signal still asserted'
        }].concat(base.rps_reset_permissive || []),
        /* EXACTLY ONE automation channel rides through (#507 wave 1): the boron batch-dose
         * panel. The emptying rationale above ("channels issue commands PWR2 REFUSES") no
         * longer bars this one — its whole vocabulary is set_boron_adjust {rate} and
         * take_boron_sample, both real commands now, and its analyzer input
         * (instruments.boron_analyzer) has been live all along. Every other pwr channel
         * stays out: their actuators are PWR2's own internal controllers. By reference,
         * like the alarms — the def is the pwr table's own. */
        channels: (base.channels || []).filter(function (ch) { return ch.id === 'boron_conc'; })
                    .concat([AFW_LEVEL_CHANNEL]),
        /* ONE esf entry, DISPLAY-TRUE by construction (2026-08-20, the AFAS build): the board's
         * AUX FEED word is RUNNING / STANDBY / SECURED and STANDBY requires
         * automation.esf.afw === 'auto', which the kernel only emits for a listed system. The
         * AFAS itself lives INSIDE the engine (pwr2_protection.js, the SGLL block) and is not
         * defeatable, so this arm is honest exactly because nothing can flip it: commands: []
         * means the kernel's manual-override scan never sets it MANUAL, and the board's only
         * AFW arm control sends auto:true (a re-arm pushbutton). A disarmable arm here would
         * claim an authority the engine does not grant it — the duplicate-authority veto. */
        esf_systems: [{ id: 'afw', label: 'Auxiliary feedwater', commands: [] }],
        /* THE ONE ALARM OVERRIDE LEFT, every other row riding through BY REFERENCE.
         *
         * ⚠ THE #500 OVERRIDE IS GONE (2026-08-29). It rebuilt `pzr_level_low` at 17 %, the
         * sourced heater-cutoff level, because the pwr table's fixed 25.0 % IS this plant's own
         * sourced no-load level program point (WTSM 10.3) and a healthy Mode 3, Hot Standby
         * plant therefore rode its indicated level right on the annunciator. That fixed the
         * NUMBER; the ruling reversed the SHAPE *(OWNER RULING, 2026-08-28: "go with as
         * recommended for all")*, and the shared row is now program-relative — it reads
         * `pzr_level_dev` at -20 points, which is correct on BOTH plants, so there is nothing
         * left for this plant to override. The 17 % cutoff did not lose its voice: it is a fixed
         * ELEVATION, it still fires `lowLevelCut` -> `heatersShed` in pwr2_pressurizer, and that
         * annunciates as PZR HTRS SHED (raised to `caution` by #577 in the same change).
         *
         * The deviation channel is this plant's own: `extras.level_program_fn` below hands
         * pwr_instruments PWR2's 25..61.5 % program line, so the alarm measures against the
         * program the plant actually runs, not the retired engine's. */
        alarms: (base.alarms || []).map(function (a) {
          /* rod_limit_approach 40 -> 10 (#507 wave 8): the shared 40 is the sourced
           * "RIL + 10 steps" in pwr1's FINE-step currency (4 fine per step) — this bank's
           * steps ARE the currency, so the same physical number is 10. */
          return a.id === 'rod_limit_approach'
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
                      'anticipatory_trip_failure',   /* #515: the P-9 channel failed */
                      'stuck_open_spray', 'continuous_rod_withdrawal',
                      'tavg_sensor_failure', 'porv_indicator_stuck_closed',
                      'pzr_level_sensor_stuck', 'pzr_level_sensor_low'], out = {};
          /* THE INTERCEPTION IS THE RETIRED PLANT'S, AND IT IS STRIPPED (#546/#547, the
           * #534 systemic pattern). Seven kept rows are `command_override` — a mechanism
           * that has the KERNEL drop or rewrite the operator's command before it reaches
           * the engine (control_kernel.js:339-350), using the OLD plant's action names and
           * payload keys. PWR2 models every one of the seven inside its own engine
           * (scram_block, porv_stick, pzr_heaters_failed, spray_stick, turbine_trip,
           * feed_pump_a/b, feed_overfeed — see REHOMED.inject_failure above), so the
           * kernel's copy was a SECOND authority speaking a vocabulary this plant does not
           * have. Measured, all ten intercepted action names: `connect_grid` and
           * `set_steam_demand` are in REFUSED and could only THROW; `close_porv` was
           * rewritten into `open_porv`, also REFUSED (#547); `scram` was DROPPED outright
           * and the #509 mirror then erased the kernel's own manual-trip latch inside the
           * same evaluate, so the ATWS pushbutton did nothing at all (#546); `set_spray`
           * was handed an `open` key set_spray never reads. HR9: the plant is the ground
           * truth, so the engine keeps the failure and the kernel keeps out of it.
           *
           * WHAT SURVIVES is the MENU: getFailureCatalog (control_kernel.js:1302) reads
           * id/display/category/severity_meta and the Failures tab reads exactly those.
           * `type` stays as it is — nothing outside the kernel's `:344` interception test
           * reads a PWR2 failure's type except `=== 'instrument'` (three sites in this
           * file), and gen_manual_reference runs against the retired plant.
           *
           * VERIFIED BEFORE STRIPPING (the #295 trap — a two-part fix whose parts are each
           * sufficient makes a one-sided injection lie). Each row armed at the engine door
           * with the kernel NOT intercepting, then attacked with the command the kernel
           * used to eat: loss_of_feedwater holds (pumps stopped, flow 0.0111 either way),
           * sg_overfeed holds (1.2000 either way), turbine_trip holds (0.00 MWe), the
           * heaters hold (0.00 kW), the spray holds (100 % stuck, 2020.7 psia either way),
           * the PORV holds (open, 1624.5 psia either way), and the ATWS produces the
           * DECLARED row instead of nothing. Not one is defeated by removing this. */
          keep.forEach(function (id) {
            var def = base.failures && base.failures[id];
            if (!def) return;
            out[id] = def.type === 'command_override'
              ? { type: def.type, category: def.category, display: def.display,
                  severity_meta: def.severity_meta }
              : def;
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
    /* THE INDICATION SETPOINTS (#556). `trip_block_status` above carries a setpoint only for a
     * BLOCKABLE trip, because that is what it was built for — so a surface that draws where the
     * protection line is could learn this plant's blockable numbers and nothing else. The
     * pressurizer level tile is the case that exposed it: it painted its red edge at 100 % while
     * this plant scrams at 87 %, and painted a second red band from the meter bottom to 12 % for
     * a low-level scram this plant does not carry at all — both read out of the RETIRED plant's
     * static table, which is the only pzr_level source a consumer had.
     *
     * `armed` is the protection module's own (pwr2_protection: available AND no permissive or
     * block holding the function off) — NOT re-derived here, or this would be the second copy of
     * P-7 rather than the cure. A consumer draws a red edge only where a row is armed.
     *
     * COVERAGE IS DELIBERATELY NARROW AND MUST BE READ THAT WAY: this carries the PRESSURIZER
     * LEVEL function and nothing else. An absent instrument here means "not published", never
     * "this plant has no trip on it" — the one negative that IS load-bearing is a pzr_level row
     * with no `low` direction, which is why the whole instrument's rows go out together rather
     * than only the row that exists. Widening it is a per-instrument measurement, not a loop. */
    var tripSetpoints = [];
    (rp.functions || []).forEach(function (f) {
      if (f.id !== 'hi_pzr_level') return;
      tripSetpoints.push({
        id: f.id, instrument: 'pzr_level', direction: f.dir > 0 ? 'high' : 'low',
        /* frac -> the % the pzr_level instrument and the board both speak */
        setpoint: typeof f.setpoint === 'number' ? f.setpoint * 100 : 87,
        armed: f.armed === true
      });
    });

    return {
      trip_blocks: { pr_low_setpoint: blocked, lo_press: loB, si_trip: siB },
      trip_setpoints: tripSetpoints,
      trip_setpoint_instruments: ['pzr_level'],   /* what the list above SPEAKS FOR — see comment */
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
    /* ARMED or LATCHED — the injection is present (and clearable) before the valve has lifted */
    if (eng.pzDrivers.porv_stick || eng.pz.porvStuck) out.push('stuck_porv_open');
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
    if (eng.p9Defeated) out.push('anticipatory_trip_failure');
    /* THE TURBINE ROW (#551, the half buried in its verification note). `inject_failure
     * {turbine_trip}` has been in the keep-list and has set the trip since the menu was built,
     * but this detector had NO turbine branch — so the row never appeared in the Failures tab
     * and `clear_failure` / `clear_all_failures`, which both read this one function (#510 M-3),
     * could not clear it. Measured: inject -> tripped=true, getActiveFailures()=[], clear ->
     * still tripped, 0.00 MWe. An instructor could inject a casualty that was invisible and
     * unclearable.
     *
     * IT READS A SEAT, NOT THE TRIP STATE, and the first draft got that wrong in a way worth
     * recording: it reported `tb.tripped && no other cause`, which is empty in the very case an
     * instructor uses it — injecting a turbine trip at 100 % power trips the REACTOR through
     * P-9, so "another cause" is instantly standing and the row vanishes. Inferring a casualty
     * from a state the plant reaches by itself cannot work. Every other lever here is a seat
     * (`porv_stick`, `overfeed`, `p9Defeated`), so this is one too: it says the trip was
     * INJECTED, which is the only thing the Failures tab is asking. */
    if (eng.tbTripFailed) out.push('turbine_trip');
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
      /* the OPERATOR's lever counts as a demand here too (#552 — same union as the lamp
       * above), and the word is the CONTRACT's: §6.3 and WIRING_REFERENCE both say
       * "open" | "closed", while this line shipped "shut" — a second, separate divergence
       * from the retired plant on the same line */
      porv_demand: (e.pz.porvOpen || e.pz.porvManual) ? 'open' : 'closed',
      porv_block_open: e.pz.blockOpen !== false,
      /* DERIVED, not retyped (#538): this was the literal 157.8 — a second written-down copy
       * of the two bank constants, the protection-cadence failure mode. Deriving it makes the
       * drift structurally impossible instead of merely gated, and it is now the SAME currency
       * the manual demand speaks, so the round trip is the identity and the board's MANUAL
       * capture is bumpless. */
      heater_power_pct: ts.pzr_heater_kw !== undefined
        ? 100 * ts.pzr_heater_kw / (PZ.HEATERS.prop_kW + PZ.HEATERS.backup_kW) : 0,
      spray_valve_pct: ts.spray_flow_pct !== undefined ? ts.spray_flow_pct : 0,
      /* THE DEMAND, PUBLISHED SEPARATELY (#564 item 1). `spray_valve_pct` above is DELIVERED
       * flow, and the board was reading it twice — as the operator's own demand box and as
       * the `asked` half of the SPRAY FLOW readout's amber. So the readout's stated purpose,
       * "called for and not arriving", was an identity that is always zero, and the player's
       * setting was erased from the box they typed it into. MEASURED on this plant, both
       * directions: with a standing 60 % demand the pressurizer going SOLID drove the box to
       * 0.0 while the demand stood; and with the operator demanding 0, `stuck_open_spray` drove
       * the box to 100.0 — the board attributing a failed valve to the player. This is the
       * demand BEFORE the physical gates, exactly like `aux_spray_pct` below, and it excludes
       * the stuck-valve override on purpose (#200). */
      spray_demand_pct: ts.spray_demand_pct,
      /* AUXILIARY SPRAY DEMAND, for the board's own box (#563 item 2). The OPERATOR'S
       * STANDING DEMAND, not delivered flow: this is what the editable tile reads back, and a
       * box that reads delivery would fight the player's typing every step the two disagree —
       * which on this valve is most of them, since the module gates delivery on ac_available.
       * Undefined driver means the lever has never been touched, which is 0, not "missing". */
      aux_spray_pct: e.pzDrivers.aux_spray === undefined ? 0
                     : 100 * Math.max(0, Math.min(1, e.pzDrivers.aux_spray)),
      /* THE HEATER BANK'S ELEVATION, so the board draws it where the model loses authority
       * (#473/#573). The plant publishes; the board reads — the #557 shape. There is
       * deliberately no second copy of these two numbers anywhere: `comp_pressurizer.js` draws
       * the band it is handed, so moving `HEATERS.elev_*_pct` moves the drawn bank with it and
       * the modelled and drawn elevations cannot drift apart. */
      heater_elev_pct: [PZ.HEATERS.elev_bot_pct, PZ.HEATERS.elev_top_pct],
      heater_auto: e.pzDrivers.heaters_manual === undefined,
      spray_auto: e.pzDrivers.spray_manual === undefined,
      pressure_setpoint: e.pz.setpoint_mpa,
      /* THE PRESSURE CONTROL BAND'S HALF-WIDTHS, in psi about whatever setpoint the operator
       * has dialled (#576c). Same "the plant publishes, the board reads" shape as
       * `heater_elev_pct` above and for the same reason: `pwr_board_wiring` drew the primary
       * pressure tile's NORMAL band as setpoint -30/+50 psi out of `pwr_config.pressurizer`,
       * captured at SCRIPT LOAD from the RETIRED engine. The centre was already live off
       * `pressure_setpoint` on the line above, so the tile was drawn around the right middle
       * with the wrong width — the #556/#557 family, with this the last member standing on
       * the plant the site runs.
       *
       * -25/+25 psi, and the pair is chosen rather than merely copied: PWR2's sourced ladder
       * (pwr2_pressurizer CONTROL, WTSM Fig 10.2-3, spray corroborated by Ginna ch15 Model 1)
       * is asymmetric and four-tiered — proportional heaters over -15..+15, BACKUP heaters in
       * at -25, spray starting at +25, spray full at +75. A tile has one band, so it gets the
       * two edges that are each an ACTUATION the player can see the plant take, which is what
       * the tile's own comment says NORMAL means. Read from CONTROL, never retyped, so moving
       * the ladder moves the band. */
      pressure_band_psi: [PZ.CONTROL.backup_on_psi, PZ.CONTROL.spray_start_psi],
      /* THE LIVE LEVEL PROGRAM, % of span at the current Tavg (#500). Already computed every
       * step by pwr2_pressurizer and, until now, read by exactly one test — so the board drew
       * the pressurizer level tile's low red edge from a FIXED alarm setpoint while the alarm
       * itself went program-relative. Publishing it lets the tile draw `program + N`, which is
       * the only way an absolute 0-100 % scale can show a deviation alarm at all. */
      pzr_level_program_pct: (e._pzr && e._pzr.level_program_pct !== undefined)
                             ? e._pzr.level_program_pct : 100 * PZ.levelProgram(ts.tavg_c),
      /* the #408 currency (gpm / 450,000) — the board multiplies back to gpm. Demand is a
       * fraction of THIS plant's sourced-scaled max; letdown lineup of its rated point. */
      charging_flow_normalized: (e.cv.chargingDemand === null ? 0 : e.cv.chargingDemand) *
                                RD.cvcs.CVCS.charging_max_gpm() / 450000,
      /* THIS PLANT'S CHARGING CEILING, gpm (#516 item 11, 2026-08-29) — the #576c pattern, and
       * the same defect one system over. The board bounded its charging box at
       * `GPM_CHARGING * RD.PWR_CONFIG.reactivity.charging_max` = the RETIRED engine's 60 gpm,
       * and captured it at SCRIPT LOAD, while `set_charging_flow` two hundred lines up clamps
       * `gpm / CVCS.charging_max_gpm()` into [0,1]. So everything the operator typed between
       * 30.14 and 60 gpm landed on the same full-open valve, under a caption reading "0-60 gpm".
       * #579 derived 30.1 gpm and corrected the MANUAL; the board was left on the retired
       * plant's number. Read from CVCS, never retyped, so a re-derived volume basis moves the
       * box and its caption together. */
      charging_max_gpm: RD.cvcs.CVCS.charging_max_gpm(),
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
      /* THE DEMAND, beside the delivery (#516 item 1). `feed_pump_speed_pct` above is what the
       * pumps are DELIVERING, and it must stay that way — five reader tiles are calibrated to
       * it. This is what the feed train is being ASKED for, which is what a setpoint box has to
       * read back or its arrows fight the pump lag. In MANUAL it is the operator's own number;
       * in AUTO it is the controller's, so the box tracks the channel instead of going stale. */
      feed_demand_pct: Math.min(120, (e._fwDemandFrac !== undefined
                                      ? e._fwDemandFrac : e.fw.feed_frac) * 100),
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
      /* TWO MORE CAPABILITY FLAGS (#567, 2026-08-27), same law as the one above: the board
       * darkens a control the running plant does not carry, and an engine that later grows the
       * machinery stops publishing the flag and gets its control back for free. They exist
       * because both controls were rendered LIVE in front of a refusal — a press could only
       * throw, which is the dead-button class wearing an error message. The refusal texts stay
       * (they are correct and they teach); what changes is that the player is no longer invited
       * to press. */
      sr_detector_fixed: true,         /* the SR channel auto-energizes below the P-6 class point */
      /* `condenser_cw_temp_fixed` RETIRED at #591 item 1 — the flag was true because the action
       * was refused, and the action was refused for a reason that belonged to the retired
       * plant. The box is live and the sink moves; the board keeps its numberDisabled law for
       * any engine that does not publish `cw_inlet_temp_c`. */
      cw_inlet_temp_c: e.cd.cw_inlet_c,
      /* AND THE RANGE, published rather than left to the board (#591 item 1). The board's
       * NUM_BOUNDS_BASE entry read `RD.PWR_CONFIG.turbine.cw_inlet_min_c/max_c` captured at
       * script load — the RETIRED plant's 35-85 degF — against this plant's 35-95 degF, so
       * the box would have refused the ten degrees that contain the C-9 removal point and
       * the turbine trip: the whole reason the control teaches anything. Same shape as the
       * charging ceiling (#516 item 11) and the pressure band (#576c). Derived from
       * pwr2_condenser's own constants, never retyped. */
      cw_inlet_range_c: [(CD.COND.cw_min_f - 32) * 5 / 9, (CD.COND.cw_max_f - 32) * 5 / 9],
      /* #570: the STEAM DUMP OPEN button could ONLY throw. Its refusal is raised INSIDE the
       * MAPPED `set_steam_dump` handler rather than from the REFUSED registry, so neither
       * run_pwr2_kernel band 4 nor run_pwr2_board's registry sweep could see it — the hole the
       * round-trip prototype found. The dump is controller-driven (tavg/pressure modes) and has
       * no manual full-open lever, so the button darkens; AUTO and CLOSED stay live. */
      steam_dump_open_fixed: true,
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
      /* THE REAL VALVE POSITION since #562 — this used to be `running ? 100 : 0`, a second
       * name for the run lamp. It reported 100 through the whole unbounded fill and 0 for a
       * running pump against a shut throttle, so the one readback that could have told the
       * player their throttle command had not landed agreed with the command that had not
       * landed. VALVE POSITION, not delivered flow: `afw_flow_normalized` is the delivery,
       * and the two disagreeing is the diagnosis (a shut block valve, a dead motor). */
      afw_throttle_pct: 100 * (e.aw.throttle === undefined ? 1 : e.aw.throttle),
      /* THE FULL SCALE `afw_flow_normalized` IS NORMALIZED ON (#557). This plant's combined
       * sourced rating, 86.2 gpm — NOT the 640 gpm the board used to hold as a literal, which
       * was the retired plant's fraction-of-rated-feed basis. Same shape as `load_modes`
       * above: a capability/scale the consumer reads, absent on an engine that does not
       * publish it. The number is the plant's, so the plant says it. */
      afw_flow_gpm_full: RD.afw.ratedGpm(),
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
    this._pwrRate = 0;      /* #548: a fresh plant does not inherit the last run's smoother */
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
    var insReading = {}, insNonFinite = [];
    Object.keys(e.ins.reading).forEach(function (id) {
      var v = e.ins.reading[id];
      insReading[id] = v;
      /* #555: the JSON round trip below maps NaN to null, and isFinite(null) is TRUE — so a
       * channel with no true driver (Mode 4, Hot Shutdown's steam_flow) came back as a hard
       * ZERO that every finite guard in the tree accepts, and the three-element feed
       * controller's flow element read a standing -0.0750 error that drove the regulating
       * valve shut. NAME the non-finite ids and re-install NaN on load: a dead channel stays
       * dead, which is what bit-exactness means here. */
      if (typeof v === 'number' && !isFinite(v)) insNonFinite.push(id);
    });
    var body = {
      sys: e.sys, rx: e.rx, sg: e.sg, tb: e.tb, rl: e.rl, cd: e.cd, dc: e.dc, cv: e.cv,
      ec: e.ec, aw: e.aw, fw: e.fw, dm: e.dm, pt: e.pt, pz: e.pz, ctm: e.ctm, rh: e.rh,
      brk: e.brk || null,
      ins: { noiseScale: e.ins.noiseScale, failure: e.ins.failure, channels: chs,
             reading: insReading, nonFinite: insNonFinite },
      ts: this._ts,                                   /* the published snapshot, restored as-is */
      shellIns: this.instruments.save(),              /* pwr_instruments' own documented API */
      /* #548: the SHELL's own smoothed power rate — the ONLY driver of the board instrument
       * layer's shrink-and-swell term (set in step(), read as ex.power_rate in _instrExtras).
       * `scalars` below is written back onto `e`, so the inner engine's identically named
       * copy is a DIFFERENT number and restoring it does nothing for the board: measured
       * 7.48 points of narrow range HIGH after a rewind taken inside a scram. An old save
       * without this block lands on 0, which is the pre-fix state exactly. */
      shell: { _pwrRate: this._pwrRate },
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
        /* the break's live containment backpressure carrier (#543) — an old save lands on
         * undefined and the break rides the sourced 1.0 psig default for ONE step, the
         * pre-fix constant exactly */
        _ctP: e._ctP,
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
        pzDrivers: e.pzDrivers, dcDrivers: e.dcDrivers,
        /* THE INITIAL-CONDITION SCALES (#563 item 3) — rated_steam is every normalization's
         * denominator (pwr2_engine: "the RATED scale") and M_nominal is core_inventory_pct's
         * and the containment sump's. Both are set from the IC at construction, and
         * SimulationService._restore rebuilt the engine at hot_full_power, so a save taken on
         * any other preset came back wearing Hot Full Power's constants over its own saved
         * mass — measured on Mode 4, Hot Shutdown: M_nominal 23,234 -> 18,876 kg (51,222 ->
         * 41,613 lb) and the CORE INVENTORY indication 100.0 -> 123.1 % across a rewind that
         * moved true primary mass -0.7 kg (-1.5 lb). An old save without them lands on the
         * constructor's values, which is the pre-fix behaviour exactly. */
        rated_steam: e.rated_steam, M_nominal: e.M_nominal
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
    /* #515 MIGRATION (2026-08-25): a pre-two-region save carries m_pzr/h_bar/V_liq and no
     * region states — reconstruct the vessel the HEM enthalpy implied (pwr2_pressurizer
     * migrateState), BEFORE the seat is re-linked to it */
    PZ.migrateState(e.pz, e.sys.P);
    /* #544 MIGRATION: a pre-air-ledger save carries the water-only U_water_kJ — reconstruct
     * the total at the saved temperature (exact residual continuity), same pattern */
    root.RD.pwr2.containment.migrateState(e.ctm);
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
    /* #555: JSON wrote every non-finite reading out as null. Put the NaN back — the save
     * NAMES which ids were non-finite precisely so the load does not have to guess, and a
     * restored null would otherwise pass isFinite() and be read as a hard zero for ever. */
    (st.ins.nonFinite || []).forEach(function (id) { e.ins.reading[id] = NaN; });
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
    /* #548 (and the #511 migration pattern): an old save carries no shell block — 0 is the
     * pre-fix state. The service always restores into a FRESHLY CONSTRUCTED shell, so
     * leaving this alone means undefined, and the swell term is simply missing. */
    this._pwrRate = (st.shell && typeof st.shell._pwrRate === 'number') ? st.shell._pwrRate : 0;
  };

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.shell = {
    PWR2Engine: PWR2Engine,
    MAPPED: MAPPED, REHOMED: REHOMED, REFUSED: REFUSED
  };
})(globalThis);
