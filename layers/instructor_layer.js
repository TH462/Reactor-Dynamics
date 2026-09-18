/*
 * instructor_layer.js — M6, the real Instructor (scenario + walkthrough engine).
 *
 * Replaces the M6·PH placeholder in the same slot with the same interface, so
 * nothing above (M5) or below (M4) changes (M6 §18). Two content containers run
 * on one engine object:
 *
 *   SCENARIOS  (RD.SCENARIOS[id])           — authored beats: triggers, two-register
 *              commentary, failure injection, auto-commands, gating, branching
 *              (M6 §4–§6). Started via M5's `start_scenario`.
 *   PROCEDURES (RD.MANUAL_PROCEDURES[key])  — Path 2 walkthroughs: the SAME validated
 *              procedure artifact the manual and harness use (CONTEXT §12); the
 *              Instructor runs its steps with auto-advance and strict gating.
 *              Started via M5's `start_follow`. Procedures are NOT converted to
 *              beats — no second copy of the content.
 *
 * FREE-PLAY INVARIANT (M6 §18, enforced by test/run_m6ph.js): with nothing loaded
 * this layer is byte-identical to the placeholder — commands forward unaltered,
 * step() does nothing, getMessage() is the empty block.
 *
 * HR1: triggers and operator grading read snapshot.instruments; `true_state`
 * triggers are the author's deliberate invisible hook. Grading falls back to
 * true_state only for parameters with no instrument twin (Gameplay §6 exception).
 * HR5: gating happens here, in the command path; blocked commands never descend.
 * HR7: the Instructor injects failures by COMMAND through the layer below.
 *
 * Beat triggers must never read snapshot.instructor — during step() it still
 * holds the previous cycle's message (M5 folds the new one in afterwards).
 *
 * Attaches RD.InstructorLayer.
 */
;(function (RD) {
  'use strict';

  // ---------------------------------------------------------------- grading map
  // Procedure predicate param (a true_state field, CONTEXT §6.3) → the instrument
  // the operator actually reads (ids from each engine's instrument model). Grading
  // is instrument-first (HR1); params absent here have no instrument twin and fall
  // back to true_state — the documented exception (Gameplay §6). Data, not logic
  // (HR3); candidate for extraction to the engine configs if it grows.
  var PARAM_INSTRUMENT = {
    pwr: {
      power_pct: 'power_range', pressure_mpa: 'primary_pressure', sg_level_pct: 'sg_level',
      pzr_level_pct: 'pzr_level', tavg_c: 'tavg', thot_c: 'thot', tcold_c: 'tcold',
      steam_pressure_mpa: 'steam_pressure', boron_ppm: 'boron_analyzer',
    },
    /* THE SHIPPED PLANT (#526/#244, 2026-08-31). Authored against pwr2_instruments.js's
     * own channel ids — NOT copied from pwr (its `boron_analyzer` is `boron` here).
     * Every id verified present in a live pwr2 broadcast by test/run_checklist_pwr2.js,
     * which reddens if one goes missing.
     *
     * ⚠ THIS COMMENT USED TO SAY "PWR2 has no SR/IR channels, so sr_counts_cps grades
     * true_state, the documented exception" AND THAT WAS STALE (#749 item 1, measured
     * 2026-09-18). PWR2 has no SR/IR channel of its OWN — pwr2_instruments.js serves the
     * internal reactor protection system and defines neither — but the SHELL carries a
     * reused `RD.PWRInstruments` (pwr2_shell.js: "reuse pwr_instruments.js unchanged"),
     * and that layer is where `source_range` lives. MEASURED on a live pwr2 broadcast,
     * `hot_zero_power`, seed 42, 2.0 s in: `instruments.source_range` = 499.0 against
     * `true_state.sr_counts_cps` = 502.0, one of 88 channels present. The board has drawn
     * that reading the whole time (`IN(s).source_range`, pwr_board_wiring), so the tile and
     * the acceptance were on different channels — measured divergence over the authored
     * 1/M ladder, instrument/truth 0.83 to 1.18. The map entry below closes it. Same class
     * as `subcooling_margin` and `pzr_spray_flow` above, which were already mapped that way. */
    pwr2: {
      power_pct: 'power_range', pressure_mpa: 'primary_pressure', sg_level_pct: 'sg_level',
      pzr_level_pct: 'pzr_level', tavg_c: 'tavg', thot_c: 'thot', tcold_c: 'tcold',
      steam_pressure_mpa: 'steam_pressure', boron_ppm: 'boron_analyzer',
      startup_rate_dpm: 'startup_rate', pump_flow_pct: 'rcs_flow',
      mwe_output: 'mwe_output', fw_flow_normalized: 'fw_flow',
      /* PRESSURIZER SPRAY FLOW (#729, added 2026-09-13). `pwr_cooldown` grades the spray on
       * DELIVERED flow, not on the AUTO lamp — the leg puts the spray in MANUAL at 50 %, so no
       * lamp is lit and `spray_auto` has nothing to say. It was grading `true_state`; the board
       * shows the operator `pzr_spray_flow` (pwr_instruments, 1.0 s lag, noise 0), so HR1 says
       * grade what they can see. The divergence is one second, which is why nothing caught it. */
      spray_flow_pct: 'pzr_spray_flow',
      /* the atmospheric dump valve (#629) — the heatup's Mode 3 confirmation asserts it is
       * SHUT, which is a claim about the heat sink the plant is riding on. Graded on the
       * board's own channel, per HR1: the player sees `adv_valve`, not `adv_valve_pct`. */
      adv_valve_pct: 'adv_valve',
      /* SUBCOOLING MARGIN (#670 Phase 1) — the tile the TMI-2 walkthrough is graded against,
       * and the one number that says whether the coolant is water or is about to be steam.
       * `subcooling_margin` is a DERIVED channel of the reused pwr instrument layer
       * (`pwr_instruments.js`: Tsat(primary_pressure) − tavg, both of them instrument
       * readings), which is exactly why grading on it is HR1-honest: the operator's margin is
       * built out of the two gauges they can see, and it diverges from `true_state.subcooling_c`
       * — which is Tsat(TRUE P) − TRUE T-hot — under precisely the conditions an incident
       * walkthrough is about. */
      subcooling_c: 'subcooling_margin',
      /* THE PORV TAILPIPE (#670 Phase 2) — the one honest tell in the TMI-2 sequence, and the
       * reading the incident walkthrough's step 4 is graded on. Instrument-first per HR1 and
       * that is the whole point of the step: the operator's tailpipe reading is a lagged,
       * noisy pipe-clamp thermocouple (`pwr2_instruments.js`, tau 5 s), and it is the ONLY
       * channel that disagrees with the PORV lamp — which the same walkthrough has failed
       * stuck-closed. Grading on `true_state.porv_open` instead would tick the step off a
       * truth the player cannot see. */
      porv_tailpipe_temp_c: 'porv_tailpipe_temp',
      /* THE SOURCE RANGE COUNT RATE (#749 item 1) — the channel the 1/M ladder's four count
       * rungs are graded on, and the one the NIS card prints. It graded `true_state` until
       * 2026-09-18 while the tile drew the instrument, so the board could read the step's own
       * target while the step refused: MEASURED on the player's route (release WITHDRAW the
       * instant the tile first prints the target), rung 6 at `hot_zero_power` seed 42 — released
       * at truth 1254 counts a second against an instrument reading 1366, and the old
       * `true_state > 1400` row did not close for another 173.2 s while the tile printed 1.4e3
       * or higher on 2,046 of the next 3,000 broadcasts. Graded here it closes in 46.4 s.
       * Instrument-first is HR1, and this is NOT the #670 "regrade on the drawn value" case:
       * `source_range` carries no DISPLAY_DAMP entry, so the transmitter reading and the drawn
       * reading are the same number — the board only formats it (`fmtExp`). */
      sr_counts_cps: 'source_range',
      /* THE INTERMEDIATE RANGE (#749 item 2) — the one tile that MOVES through the criticality
       * step's 21.8-minute wait, and the channel that step's own note tells the player to watch
       * ("From your last tap onward, watch INTER RANGE and STARTUP RATE rather than REACTOR
       * POWER"). Same shell instrument layer and same argument as `source_range` above:
       * `intermediate_range` carries no DISPLAY_DAMP entry, so the transmitter reading and the
       * drawn reading are the same number and the board only formats it (`fmtExp`). */
      ir_amps: 'intermediate_range',
    },
    rbmk: {
      power_pct: 'power_range', steam_pressure_mpa: 'steam_pressure', drum_level_pct: 'drum_level',
      channel_flow_pct: 'channel_flow', void_fraction_avg: 'void_fraction', fuel_temp_c: 'fuel_temp',
    },
    bwr: {
      power_pct: 'power_range', vessel_pressure_mpa: 'vessel_pressure', vessel_level_pct: 'vessel_level',
    },
  };

  // Follow-mode strict gating: the safety set is always allowed, and a step's
  // command is expanded to its family so every UI path to the same intent counts
  // (the hold-button rod controls issue rod_start/rod_stop around rod_nudge).
  var ALWAYS_ALLOWED = ['scram', 'manual_scram', 'acknowledge_alarm', 'acknowledge_all_alarms'];
  var ROD_FAMILY = ['rod_nudge', 'rod_start', 'rod_stop', 'rod_stop_all'];

  // Auto-advance debounce: the acceptance predicate must hold for this many
  // consecutive broadcast evaluations before the step completes, so a parameter
  // sweeping through its target band doesn't advance the procedure in passing.
  var ACC_STABLE_N = 5;
  // Seconds of SIM time an observation step stands before it checks itself off. Long
  // enough to read a line and look at the board, short enough not to feel stuck.
  var OBSERVE_DWELL_S = 12;

  /* STEADINESS — `op: 'steady'` *(OWNER RULING, 2026-09-15: selected "add a steadiness
   * predicate" from three options put to him — raise the last 1/M step's count target to
   * 12,000, add a "counts steady" predicate, or leave it as prose — taking the one that needed
   * new plumbing over the one-number change. A SELECTION, not verbatim words; the rationale
   * relayed with it is that a steady count rate is what an operator actually looks for and an
   * absolute threshold is only a stand-in for it.)*
   *
   * `{ p, op:'steady', v: <fractional drift>, window: <trailing seconds> }` — "this indication
   * has stopped moving". The reading is sampled into a trailing ring; the mean of the window's
   * OLDER half is compared with the mean of its NEWER half, and the predicate holds when the
   * relative difference is at or under `v`. The window must be FULLY COVERED before it can hold
   * at all, and the ring is reset when the step changes, so the window doubles as the minimum
   * dwell: a step carrying one cannot complete inside `window` seconds of becoming active.
   *
   * WHY TWO HALF-MEANS AND NOT "unchanged since the last sample". Two reasons, both measured:
   *   · A per-sample difference is a function of the SAMPLE SPACING, which is the player's speed
   *     control — 0.1 s of plant per broadcast at 1x, 6 s at 60x. A trailing window in SIM time
   *     is the same claim at every acceleration. Measured on `pwr_startup` step 8 at its
   *     authored 3 % / 120 s: the accept lands 506 s after the rods stop with 1 s samples and
   *     within about a minute of that with 0.1 s and 10 s samples — the 1/M prediction across
   *     that whole spread is 208.8 to 208.6, against a true critical of 208.
   *   · Averaging each half divides any channel noise by root-n, which is what keeps one noise
   *     sample from deciding a latch — the #752 trap. The channel step 8 actually grades,
   *     `sr_counts_cps`, is the documented no-instrument-twin case and its measured detrended
   *     scatter is 0.0019 % of reading (max residual 0.0062 %) — its 3 % tolerance clears that
   *     by a factor of 480 — but the predicate is general and instrument channels are not.
   *
   * `v` IS RELATIVE, to the window mean, because the channel this was built for spans decades.
   * An author wanting an absolute band on a linear channel wants `~`, not this. A window mean of
   * (near) zero has no meaningful relative drift, so the comparison falls back to the absolute
   * difference there rather than dividing by nothing.
   *
   * IT RE-GRADES, it does not latch — same rule and same reason as `op: '~'` in `_gradeAccs`
   * below: "steady" is a HOLD claim, and a plant that starts climbing again has left it.
   *
   * SUPPORTED IN `acc` AND `accs` ONLY (both runtimes), because those are the two that own a
   * per-step state bag. `run_checklist_pwr2` §2w reddens on a `steady` authored anywhere else —
   * `saw`, `overtaken`, `precond`, a `when` gate — rather than letting it read false for ever. */
  var STEADY_WINDOW_S = 120;        // default trailing window when a step authors none

  /* HAS THE CONTROL STOPPED MOVING — `op: 'stopped'` *(OWNER RULING, 2026-09-17: selected
   * "Gate on rods stopped + startup rate" from three options put to him — gate on rod-stop plus
   * startup rate, remove the steady row and keep startup rate alone, or keep the steady row. A
   * SELECTION, not verbatim words.)*
   *
   * `{ p, op:'stopped', v: <seconds of no motion> }` — "this control has not moved for `v`
   * seconds". Exact, not inferred: the bag remembers the last reading and the sim time it
   * changed, and the predicate holds once `v` seconds of plant have passed with the reading
   * unchanged. Any change at all restarts the clock; there is deliberately no tolerance, because
   * a tolerance turns a slow ramp into a "stopped" control (each sample inside the band, the
   * clock never restarting) — the degenerate-latch shape.
   *
   * WHY IT EXISTS, AND WHY IT IS NOT `steady`. `steady` is a claim about an INDICATION settling
   * and is therefore a proxy for the operator's action; `stopped` is the action itself.
   * MEASURED on the four inverse-count-rate (1/M) settle rungs of `pwr_startup`, `hot_zero_power`,
   * one step withdrawn every 20 s (a "dribble" — a real way to work a rung, not an exploit):
   * the startup-rate row (`startup_rate_dpm ~0 ±0.02`) is satisfied with the bank STILL MOVING at
   * rung 5 and rung 6, and `sr_counts_cps steady 3 %/120 s` latches with the bank still moving at
   * rung 5. Both are proxies and one dribble defeats both. `stopped` cannot be satisfied while the
   * control is moving, because that is the thing it reads.
   *
   * `v` IS DERIVED FROM THE DRIBBLE CADENCE, not picked round. Measured, rungs 5 and 6, taps at
   * 2 / 5 / 10 / 20 / 30 / 45 / 60 / 75 s: the predicate latches while the bank is still moving
   * IF AND ONLY IF the tap cadence is at or above `v`. So `v` is exactly "the slowest tap
   * cadence this rung refuses", and it has no other free parameter.
   *
   * LEGAL ONLY ON A CONTROL-CLASS PARAM (`InstructorLayer.isControlParam`) — the rod banks, the
   * flat `control_state` lineup fields, the operator's trip blocks. Those are read off the
   * operator's own control state, exactly and without noise, so "unchanged" is a fact. On a
   * noisy instrument channel exact equality would essentially never hold and the predicate would
   * read FALSE FOR EVER, which is the hollow-check shape; an author who wants "this INDICATION
   * has settled" on such a channel wants `steady`. `run_checklist_pwr2` §2aa reddens on both
   * halves of that rule.
   *
   * IT RE-GRADES, it does not latch — same rule and same reason as `~` and `steady`: "the rods
   * have stopped" is a HOLD claim, and a player who pulls again has left it.
   *
   * SUPPORTED IN `acc` AND `accs` ONLY, for the same reason as `steady`: those are the two that
   * own a per-step state bag. The bag is cleared when the step changes, so `v` doubles as a
   * minimum dwell — a step carrying one cannot complete inside `v` seconds of becoming active. */
  var STOPPED_DEFAULT_S = 60;       // default quiet time when a step authors none

  /* The two ops that need per-step state, and the ONE dispatcher both runtimes and the replay
   * harness route through. Adding a third bagged op means adding it here and nowhere else. */
  var BAG_OPS = { steady: 1, stopped: 1 };
  InstructorLayer.isBagOp = function (op) { return !!BAG_OPS[op]; };
  InstructorLayer.gradeBagged = function (bag, snapshot, pred) {
    return (pred && pred.op === 'stopped') ? InstructorLayer.gradeStopped(bag, snapshot, pred)
                                           : InstructorLayer.gradeSteady(bag, snapshot, pred);
  };

  // #715 — a completion banner's `outcome` text is an AUTHORED plant-state claim
  // (e.g. "stable near 15 %, 15 MWe"); nothing checked it before showing it, so a
  // leg whose own step acceptances can be satisfied for free (a scram, say) drew
  // the claim over a dead board. Shown instead of the authored text whenever a
  // leg's `outcome_guard` fails to verify — see `_gradeOutcomeGuard`.
  var OUTCOME_UNVERIFIED_TEXT = "Steps checked off, but the board does not match this leg's " +
    'expected finish. Read the board, not this banner.';

  // ================================================================ constructor
  // Signature and connect() must match the placeholder — M5 constructs with null
  // and re-points `below` on every plant rebuild.
  function InstructorLayer(controlFailureLayer) {
    this.below = controlFailureLayer || null;
    this.register = 'learning';
    this._clear();
  }

  InstructorLayer.prototype._clear = function () {
    this.mode = null;                 // null (free-play) | 'scenario' | 'follow'
    this.scenario = null;
    this.currentBeatId = null;
    this.branchWatch = null;          // decision beat whose branches are being watched
    this.firedBeats = new Set();
    this.scenarioStartTime = null;
    this.lastBeatFireTime = null;
    this.activeGates = [];
    this.pendingMessage = null;       // { learning, industry } of the last fired beat
    this.follow = null;               // Path 2 state machine (see loadProcedure)
    this.uiPolicy = null;
    this.highlight = null;
    this.levelComplete = null;
    this._actionsSinceBeat = [];      // forwarded operator commands since last beat fire
    this._lastSimTime = 0;
    this._continueRequested = false;  // instructor_continue → `manual` trigger
    // Chat-mode state (scenarios with `chat: true` — dialogue log + interactions).
    this.chatLog = [];                // [{speaker, learning, industry, t}] capped at CHAT_LOG_CAP
    this._chatRev = 0;                // bumped on every append — the UI's cheap re-render key
    this._interact = {};              // interaction_id → { clicks, granted }
    this._checkpointRequested = false;
    this._rewindRequested = null;     // { steps, scope } — beat-driven world rewind
    this._speedRequested = null;      // beat-driven time acceleration (number)
    this._pauseRequested = false;     // a checklist step's fired event wants the clock stopped (#694)
    // Checklist mode (Path 3): a procedure run as a PASSIVE checklist against the
    // live plant — no reset, no gating; steps auto-check off the instruments.
    this.checklist = null;
    // Can the walkthrough's "Rewind step" actually land? DERIVED, not owned: M5 writes
    // it before every snapshot assemble because only M5 can see the rewind ring (#660
    // items 17-18). Never trust a stale value — it is rewritten every broadcast.
    this._rewindReady = false;
  };

  // Re-point at the (possibly rebuilt) layer below. Deliberately does NOT clear
  // scenario progress: M5's loadState connects first and restores state after.
  InstructorLayer.prototype.connect = function (controlFailureLayer) {
    this.below = controlFailureLayer;
  };

  // ================================================================ lifecycle
  // Load a scenario (M6 §11). Issues NO commands — beats fire in step().
  InstructorLayer.prototype.load = function (scenario) {
    if (!scenario) return;
    this._clear();
    this.mode = 'scenario';
    this.scenario = scenario;
    var beats = scenario.beats || [];
    this.currentBeatId = beats.length ? beats[0].id : null;
    this.uiPolicy = scenario.ui_policy || null;
    this._checkpointRequested = true;   // checkpoint 0: the pristine start state
  };

  // Load a manual procedure for a Path 2 walkthrough (Gameplay §4.1). `meta`
  // carries { procedure_id, profile_key } so save/restore can re-resolve it.
  InstructorLayer.prototype.loadProcedure = function (proc, meta) {
    if (!proc) return;
    this._clear();
    this.mode = 'follow';
    this.follow = {
      proc: proc,
      procedure_id: (meta && meta.procedure_id) || proc.id,
      profile_key: (meta && meta.profile_key) || null,
      idx: 0,
      cmdSeen: false, sawSeen: false, accStreak: 0, accMetNow: false,
      gradedBy: null, done: false,
    };
    this._checkpointRequested = true;
  };

  // Load a manual procedure as an AUTO-CHECKLIST (Path 3). Unlike follow mode it
  // does NOT reset the plant and does NOT gate commands: the operator plays on,
  // and each step checks itself off when its evidence appears — `acc` graded
  // instrument-first (same debounce as follow), `saw` latched, or the step's
  // command family observed descending. Steps with nothing gradable (pure
  // observations) wait for a manual tick (M5 `checklist_check`), which is also
  // the operator's override for any stuck step. Orthogonal to mode on purpose —
  // it lives in free play; loading a scenario/walkthrough clears it (_clear).
  InstructorLayer.prototype.loadChecklist = function (proc, meta) {
    if (!proc || !proc.steps || !proc.steps.length) return;
    this._checkpointRequested = true;   // checkpoint 0 for the walkthrough's step rewind (#660 item 17)
    this.checklist = {
      proc: proc,
      procedure_id: (meta && meta.procedure_id) || proc.id,
      profile_key: (meta && meta.profile_key) || null,
      idx: 0,
      done: proc.steps.map(function () { return false; }),
      doneBy: proc.steps.map(function () { return null; }),   // 'auto' | 'manual' | 'observed' | 'caught_up' | 'overtaken' (#641)
      cmdSeen: false, sawSeen: false, accStreak: 0, accMetNow: false,
      gradedBy: null, complete: false,
      // Precondition verdicts (#395) — evaluated on the first step() tick, never
      // here: load has no snapshot. null = no `precond` authored or not yet graded.
      precond: null,
      precondMsg: false,   // an unmet-precondition instructor comment is standing
      precondSaid: false,  // #732 — it has been said ONCE for this run and will not be said again
                           //   (restored by loadState too: a REWIND is not a new run)
      catchUp: true,       // first _stepChecklist tick walks past already-done steps (#607)
      // Behind-the-scenes failures fired on the CURRENT step (#670): `fired` is the once-per-
      // entry keys, `injected` the failure ids the snapshot publishes. Both reset per step.
      fired: [], injected: [],
      paused: false,   // #694 — this step's own fire has requested (and landed) a sim pause
    };
  };

  InstructorLayer.prototype.stopChecklist = function () {
    // Take our own precondition comment down with the checklist (it names a
    // banner that no longer exists); anyone else's message is left alone.
    if (this.checklist && this.checklist.precondMsg) this.pendingMessage = null;
    this.checklist = null;
  };

  // Manual tick — only the ACTIVE step can be checked (a checklist is sequential).
  // Allowed even on auto-gradable steps: the operator's judgment outranks a
  // debounce that hasn't landed yet.
  InstructorLayer.prototype.checklistCheck = function (index) {
    var c = this.checklist;
    if (!c || c.complete) return;
    if (index != null && index !== c.idx) return;
    /* Continue on a step the instruments already satisfied is a confirmation, not a hand
     * tick: the record keeps 'auto' (HR1 — graded off the instrument). 'manual' is only a
     * step ticked before its acceptance was met (harnesses; the board's Continue is dark). */
    this._checklistCheckOff(c.awaitingAck ? 'auto' : 'manual');
  };

  // Back to free-play. M5 calls this on stop_scenario/stop_follow and on every
  // plain plant reset so stale progress can't outlive its plant.
  InstructorLayer.prototype.unload = function () {
    var reg = this.register;
    this._clear();
    this.register = reg;
  };

  // ================================================================ step (M6 §11)
  // Called by M5 each broadcast with the freshly assembled snapshot. Returns
  // undefined (the placeholder contract). Beats/steps fire here, never in load().
  InstructorLayer.prototype.step = function (snapshot, simTime) {
    this._lastSimTime = simTime;
    this._lastSnapshot = snapshot;    // #715 — outcome_guard re-grades off this, not a latch
    if (this.mode === 'scenario') this._stepScenario(snapshot, simTime);
    else if (this.mode === 'follow') this._stepFollow(snapshot, simTime);
    if (this.checklist) this._stepChecklist(snapshot);
    this._continueRequested = false;    // a Continue click satisfies at most one pass
  };

  InstructorLayer.prototype._stepScenario = function (snapshot, simTime) {
    if (this.scenarioStartTime === null) this.scenarioStartTime = simTime;

    // Watching a decision beat's branches: first branch trigger to fire wins (§6).
    // A fired branch jumps to its goto beat, which is then evaluated in the SAME
    // pass below — the decision flows straight into its consequence beat.
    // `inaction` branches are deferred to a second pass regardless of authored
    // order: an inaction trigger is only elapsed time, so it must never beat a
    // sibling operator_action that matched in the same pass ("no relevant
    // action within the window" — the relevant actions are the siblings).
    if (this.branchWatch) {
      var brs = this.branchWatch.branches || [];
      var fired = false;
      for (var i = 0; i < brs.length; i++) {
        if (brs[i].trigger && brs[i].trigger.type === 'inaction') continue;
        if (this._evalTrigger(brs[i].trigger, snapshot, simTime)) {
          this._fireBranch(brs[i], simTime);
          fired = true;
          break;
        }
      }
      if (!fired && this.branchWatch) {
        for (var j = 0; j < brs.length; j++) {
          if (!(brs[j].trigger && brs[j].trigger.type === 'inaction')) continue;
          if (this._evalTrigger(brs[j].trigger, snapshot, simTime)) {
            this._fireBranch(brs[j], simTime);
            break;
          }
        }
      }
    }
    if (!this.branchWatch) {
      // Linear flow. `advance: "auto"` lets the next beat fire in the same pass;
      // the loop is bounded by the fired-beats guard plus a hard cap.
      for (var hop = 0; hop < 8; hop++) {
        var beat = this._currentBeat();
        if (!beat || this.firedBeats.has(beat.id)) break;
        if (!this._evalTrigger(beat.trigger, snapshot, simTime)) break;
        this._fireBeat(beat, simTime);
        if (beat.branches || beat.advance !== 'auto') break;
      }
    }
    this._updateGates(snapshot, simTime);
  };

  InstructorLayer.prototype._currentBeat = function () {
    if (!this.scenario || this.currentBeatId == null) return null;
    var beats = this.scenario.beats || [];
    for (var i = 0; i < beats.length; i++) if (beats[i].id === this.currentBeatId) return beats[i];
    return null;
  };

  InstructorLayer.prototype._fireBeat = function (beat, simTime) {
    if (beat.commentary) this.pendingMessage = beat.commentary;
    // Chat-mode dialogue: a beat may carry a multi-line, multi-speaker exchange.
    // Lines land in the persistent chat log (the UI renders a scrolling
    // transcript); commentary remains the single-slot fallback for non-chat
    // scenarios and for gate feedback.
    if (beat.dialogue && beat.dialogue.length) this._appendChat(beat.dialogue, simTime, beat.story_min != null ? beat.story_min : null, !!beat.time_skip);

    // Scenario actions descend as commands through M4, which places failures
    // correctly (HR7) and applies command interception.
    var i, f;
    var inj = beat.inject_failures || [];
    for (i = 0; i < inj.length; i++) {
      f = inj[i];
      this.below.handleCommand(typeof f === 'string'
        ? { action: 'inject_failure', failure_id: f }
        : { action: 'inject_failure', failure_id: f.failure_id, severity: f.severity });
    }
    var clr = beat.clear_failures || [];
    for (i = 0; i < clr.length; i++) this.below.handleCommand({ action: 'clear_failure', failure_id: clr[i] });
    var cmds = beat.commands || [];
    for (i = 0; i < cmds.length; i++) this.below.handleCommand(cmds[i]);

    if (beat.gate && ((beat.gate.block_actions && beat.gate.block_actions.length) ||
                      (beat.gate.allow_actions && beat.gate.allow_actions.length))) {
      this.activeGates.push({
        block_actions: (beat.gate.block_actions || []).slice(),
        allow_actions: (beat.gate.allow_actions || []).slice(),
        until: beat.gate.until || null,
        message: beat.gate.message || null,
      });
    }

    if (beat.highlight) this.highlight = beat.highlight;
    if (beat.level_complete) {
      this.levelComplete = {
        title: beat.level_complete.title || (this.scenario && this.scenario.title) || '',
        outcome: beat.level_complete['outcome_' + this.register]
          || beat.level_complete.outcome || '',
        outcome_learning: beat.level_complete.outcome_learning || beat.level_complete.outcome || '',
        outcome_industry: beat.level_complete.outcome_industry || beat.level_complete.outcome || '',
        actions: beat.level_complete.actions || ['continue', 'retry'],
      };
    }

    this.firedBeats.add(beat.id);
    this.lastBeatFireTime = simTime;
    this._actionsSinceBeat = [];

    // A rewind beat asks M5 to roll the WORLD back while the Instructor keeps its
    // progress (the "watch that again" device). It does not also checkpoint —
    // that would put the rewind target one slot off for the author.
    if (beat.rewind) this._rewindRequested = { steps: beat.rewind.steps || 1, scope: 'world' };
    else this._checkpointRequested = true;

    // Beat-driven time acceleration: fast-forward a slow phase, and — the key
    // device — DROP OUT of fast-forward when a set point fires (author the next
    // beat's trigger on the condition and give it `speed: 1`). Applied by M5
    // after any rewind, so it wins over the checkpoint's stored speed.
    if (beat.speed != null) this._speedRequested = beat.speed;

    if (beat.branches) { this.branchWatch = beat; return; }
    this._advanceFrom(beat);
  };

  InstructorLayer.prototype._advanceFrom = function (beat) {
    // `advance: "end"` terminates the scenario flow at this beat — needed by
    // branch endpoints, since beats are one flat ordered list and a finished
    // branch must not fall through into the other branch's beats.
    if (beat.advance === 'end') { this.currentBeatId = null; return; }
    var beats = this.scenario.beats || [];
    for (var i = 0; i < beats.length; i++) {
      if (beats[i].id === beat.id) {
        this.currentBeatId = (i + 1 < beats.length) ? beats[i + 1].id : null;
        return;
      }
    }
    this.currentBeatId = null;
  };

  InstructorLayer.prototype._fireBranch = function (branch, simTime) {
    this.branchWatch = null;
    this.currentBeatId = branch.goto;
    this.lastBeatFireTime = simTime;      // delay triggers on the target measure from the decision
    this._actionsSinceBeat = [];
  };

  // ------------------------------------------------------------ chat (TMI-2 M5)
  // Dialogue lines and player interactions for chat-mode scenarios. All content
  // is scenario DATA (speakers, two-register text, interaction tables) — this
  // engine only appends, counts, and surfaces (M6 §16 authoring boundary).
  var CHAT_LOG_CAP = 300;

  // storyMin — optional in-fiction timeline anchor (minutes since the story's
  // opening). The sim compresses the real accident's hours into minutes; the
  // authored story clock keeps the HISTORICAL durations visible (the "it took
  // 80 minutes" numbers are part of the lesson — Spec §2.2 guardrail).
  // timeSkip — set only by beats that deliberately compress a stretch (the
  // authored `time_skip: true`): the UI draws its elapsed-time divider ONLY on
  // these, so an ordinary continuous conversation never shows a time jump.
  InstructorLayer.prototype._appendChat = function (lines, simTime, storyMin, timeSkip) {
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (!l) continue;
      this.chatLog.push({
        speaker: l.speaker || 'sup',
        learning: l.learning || l.industry || '',
        industry: l.industry || l.learning || '',
        t: simTime != null ? simTime : this._lastSimTime,
        story: (i === 0 && storyMin != null) ? storyMin : null,
        skip: (i === 0 && timeSkip) ? true : null,
      });
    }
    while (this.chatLog.length > CHAT_LOG_CAP) this.chatLog.shift();
    this._chatRev++;
  };

  // instructor_interact — a click on a scenario object (e.g. the TMI-2
  // maintenance tag). The player never types: the interaction table supplies
  // the outgoing request bubble and the scripted response(s). First activation
  // may carry commands/clear_failures (a granted request acts on the plant);
  // repeats cycle authored variants. Recorded for operator_action triggers.
  InstructorLayer.prototype._handleInteract = function (command) {
    if (this.mode !== 'scenario' || !this.scenario) return null;
    var table = this.scenario.interactions || {};
    var def = table[command.interaction_id];
    if (!def) return null;
    var st = this._interact[command.interaction_id] ||
      (this._interact[command.interaction_id] = { clicks: 0, granted: false });
    st.clicks++;
    var t = this._lastSimTime;
    var i;
    if (st.clicks === 1) {
      if (def.request) this._appendChat([{ speaker: 'player', learning: def.request.learning, industry: def.request.industry }], t);
      if (def.responses) this._appendChat(def.responses, t);
      var clr = def.clear_failures || [];
      for (i = 0; i < clr.length; i++) this.below.handleCommand({ action: 'clear_failure', failure_id: clr[i] });
      var cmds = def.commands || [];
      for (i = 0; i < cmds.length; i++) this.below.handleCommand(cmds[i]);
      if (clr.length || cmds.length || def.grants) st.granted = true;
    } else if (def.repeat && def.repeat.length) {
      var rq = def.request_repeat || def.request;
      if (rq) this._appendChat([{ speaker: 'player', learning: rq.learning, industry: rq.industry }], t);
      this._appendChat([def.repeat[(st.clicks - 2) % def.repeat.length]], t);
    }
    // Visible to operator_action triggers: { command:'instructor_interact',
    // params:{ interaction_id: ... } } matches this record.
    this._actionsSinceBeat.push({ action: 'instructor_interact', interaction_id: command.interaction_id });
    return null;
  };

  // ---------------------------------------------------------------- gates (§11)
  InstructorLayer.prototype._updateGates = function (snapshot, simTime) {
    for (var i = this.activeGates.length - 1; i >= 0; i--) {
      var g = this.activeGates[i];
      if (g.until && this._evalTrigger(g.until, snapshot, simTime)) this.activeGates.splice(i, 1);
    }
  };

  // ============================================================= trigger eval (§5)
  InstructorLayer.prototype._evalTrigger = function (trigger, snapshot, simTime) {
    if (!trigger) return false;
    var v, i;
    switch (trigger.type) {
      case 'time':      // seconds since scenario start
        return this.scenarioStartTime !== null && (simTime - this.scenarioStartTime) >= trigger.value;
      case 'delay': {   // seconds since the previous beat fired (or scenario start)
        var base = this.lastBeatFireTime !== null ? this.lastBeatFireTime : this.scenarioStartTime;
        return base !== null && (simTime - base) >= trigger.value;
      }
      case 'instrument':      // HR1: the reading the operator sees
        v = snapshot.instruments ? snapshot.instruments[trigger.instrument] : undefined;
        return this._compare(v, trigger.direction, trigger.value);
      case 'true_state':      // deliberate author hook for truth the operator can't see
        v = snapshot.true_state ? snapshot.true_state[trigger.field] : undefined;
        return this._compare(v, trigger.direction, trigger.value);
      case 'operator_action': // a matching command descended since the last beat fired
        for (i = 0; i < this._actionsSinceBeat.length; i++) {
          if (this._commandMatches(this._actionsSinceBeat[i], trigger)) return true;
        }
        return false;
      case 'inaction': {      // window elapsed with no sibling action having fired first
        var arm = this.lastBeatFireTime !== null ? this.lastBeatFireTime : this.scenarioStartTime;
        return arm !== null && (simTime - arm) >= trigger.window;
      }
      case 'alarm':
        if (!snapshot.alarms) return false;
        for (i = 0; i < snapshot.alarms.length; i++) {
          var a = snapshot.alarms[i];
          if (a.id !== trigger.alarm_id) continue;
          return trigger.state ? a.state === trigger.state : a.state !== 'clear';
        }
        return false;
      case 'scram':
        return !!((snapshot.rps_state && snapshot.rps_state.scrammed) ||
                  (snapshot.true_state && snapshot.true_state.scrammed));
      case 'manual':          // the user clicked Continue (consumed per pass)
        return this._continueRequested;
      case 'all':
        for (i = 0; i < trigger.triggers.length; i++) {
          if (!this._evalTrigger(trigger.triggers[i], snapshot, simTime)) return false;
        }
        return true;
      case 'any':
        for (i = 0; i < trigger.triggers.length; i++) {
          if (this._evalTrigger(trigger.triggers[i], snapshot, simTime)) return true;
        }
        return false;
      default:
        return false;
    }
  };

  // Direction vocabulary (§5): below/above for numerics, is_true/is_false/is_open
  // for booleans and position/status readings.
  InstructorLayer.prototype._compare = function (v, direction, value) {
    if (v === undefined || v === null) return false;
    switch (direction) {
      case 'below':    return v < value;
      case 'above':    return v > value;
      case 'is_true':  return v === true || v === 1;
      case 'is_false': return v === false || v === 0;
      case 'is_open':  return v === true || v === 'open' || v === 1;
      default:         return false;
    }
  };

  InstructorLayer.prototype._commandMatches = function (cmd, trigger) {
    if (cmd.action !== trigger.command) return false;
    var p = trigger.params;
    if (p) for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k) && cmd[k] !== p[k]) return false;
    return true;
  };

  // ============================================================ follow mode (Path 2)
  // Runs the CURRENT manual procedure step against the live snapshot: latches
  // `saw` (must be true at least once during the step), grades `acc` instrument-
  // first, and auto-advances when the step's obligations are met. Observation
  // steps (no cmd, no acc, no saw) wait for a manual Next — same as the manual.
  InstructorLayer.prototype._stepFollow = function (snapshot, simTime) {
    if (this.scenarioStartTime === null) this.scenarioStartTime = simTime;
    var f = this.follow;
    if (!f || f.done) return;
    var st = f.proc.steps[f.idx];
    if (!st) { this._completeFollow(); return; }

    if (st.saw && !f.sawSeen && this._grade(snapshot, st.saw).met) f.sawSeen = true;

    var fHasAccs = !!(st.accs && st.accs.length);
    if (fHasAccs) {                            // multi-check-off (#244 item 8)
      f.gradedBy = null;
      f.accMetNow = this._gradeAccs(f, st, snapshot);
    } else if (st.acc) {
      var g = this._gradeOne(f, snapshot, st.acc, 'acc');
      f.gradedBy = g.graded_by;
      f.accStreak = g.met ? f.accStreak + 1 : 0;
      f.accMetNow = f.accStreak >= ACC_STABLE_N;
    } else {
      f.gradedBy = null;
      f.accMetNow = false;
    }

    var hasObligation = !!(st.cmd || st.acc || fHasAccs || st.saw);
    if (!hasObligation) return;   // observation step — manual Next only
    if (st.cmd && !f.cmdSeen) return;
    if (st.saw && !f.sawSeen) return;
    if ((st.acc || fHasAccs) && !f.accMetNow) return;
    this._advanceFollow(+1, true);
  };

  InstructorLayer.prototype._advanceFollow = function (dir, autoAdvanced) {
    var f = this.follow;
    if (!f) return;
    var next = f.idx + dir;
    if (next < 0) next = 0;
    if (next >= f.proc.steps.length) { this._completeFollow(); return; }
    f.idx = next;
    f.cmdSeen = false; f.sawSeen = false; f.accStreak = 0; f.accMetNow = false; f.gradedBy = null;
    f.accsState = null;           // per-entry multi-check-off latches (#244 item 8)
    f.outOfTurn = null;           // #759 — as above, per step
    f.predBags = null;          // #755/#761 — a bagged predicate's window is per step, like the latches
    this.pendingMessage = null;   // a new step retires the previous step's feedback
    if (autoAdvanced) this._checkpointRequested = true;   // rewind lands on step boundaries
  };

  InstructorLayer.prototype._completeFollow = function () {
    var f = this.follow;
    f.done = true;
    f.idx = f.proc.steps.length - 1;
    // #715 — an authored `outcome` string is an unmeasured claim in player-facing
    // copy until something checks it. `outcome_guard` (optional, per-leg) is that
    // check; unverified, the banner says so instead of repeating the claim.
    var text = this._gradeOutcomeGuard(f.proc) ? (f.proc.outcome || 'Procedure complete.')
                                                : OUTCOME_UNVERIFIED_TEXT;
    this.levelComplete = {
      title: f.proc.title,
      outcome: text,
      outcome_learning: text,
      outcome_industry: text,
      actions: ['continue', 'retry'],
    };
  };

  // ============================================================ checklist (Path 3)
  // Passive sequential grading of the active (first unchecked) step. A step
  // auto-checks on: acc met (debounced, plus saw latched if authored) — the
  // outcome is the verification, the keystroke path doesn't matter; or, with no
  // acc, its saw latching; or, with neither, its command family being observed.
  // Pure observation steps only check by hand (checklistCheck).
  InstructorLayer.prototype._stepChecklist = function (snapshot) {
    var simTime = (snapshot && snapshot.metadata && snapshot.metadata.sim_time) || 0;
    var c = this.checklist;
    // #715 — re-graded every tick the banner is shown, not once at the step-off:
    // the board can be read at any time while the walkthrough sits complete, and
    // the claim it draws should track the live plant, same as `precond` below.
    if (c.complete) { c.outcomeVerified = this._gradeOutcomeGuard(c.proc); return; }

    // Preconditions (#395) — grade each authored {p, op, v, tol} against the LIVE
    // plant every tick, instrument-first like `acc`, so the banner clears itself
    // the moment the operator fixes the condition (dilutes to the ECC, restores
    // the lineup). Verdicts only; the row text stays in the procedure artifact,
    // same rule as step text. Nothing here blocks a command or a check-off —
    // *(OWNER RULING, 2026-08-06: selected "Warn, never block" from three options
    // put to him — a selection, not verbatim words)*.
    if (c.proc.precond && c.proc.precond.length) {
      var pv = [], anyUnmet = false;
      for (var pi = 0; pi < c.proc.precond.length; pi++) {
        var pg = this._grade(snapshot, c.proc.precond[pi]);
        pv.push({ met: pg.met, obs: pg.value, graded_by: pg.graded_by });
        if (!pg.met) anyUnmet = true;
      }
      c.precond = pv;
      /* ENTRY ONLY *(OWNER, 2026-09-03, #619 item 3: "The instructor block gets a 'before
       * you...' in the middle of mode 5>3 checklist. it doesnt make sense. probably just
       * remove it.")*.
       *
       * The latch is per EPISODE, not per run: it clears the moment every row recovers, so the
       * next row to go unmet raises the message again — and a checklist that is CHANGING the
       * plant walks its own preconditions in and out. The heatup's entry rows are "plant cold"
       * and "depressurized", so heating up and pressurizing re-breaks them by design, and the
       * player got told they were not ready for a checklist they were half way through.
       *
       * A precondition answers a question about ENTRY — "was it sensible to open this" — so the
       * answer cannot change while you run it. Same reasoning the in-panel banner already
       * follows (ui/app.js, #614), and the fix is the same shape: nothing may raise it once the
       * run has started moving.
       *
       * SCOPED RATHER THAN DELETED, which is a departure from the owner's "probably just remove
       * it": at entry it is the one thing that explains why a checklist's steps are not going to
       * verify. Flagged on #622 for review — deleting the block is a two-line follow-up if he
       * would rather have it gone.
       *
       * NOT the `underway` test #614 tried and rejected for the BANNER. That failed because a
       * checklist whose first step is already satisfied advances within a broadcast or two, so
       * the banner vanished before it could be read. This is the message channel, and it fires
       * on the SAME tick the condition is first seen — before any advance — so the entry window
       * is real rather than a race. */
      /* ONCE PER RUN, NOT ONCE PER CROSSING (#732, owner playtest #724 item 15: "it gave me a
       * flickering warning that prerequisites for this checklist are not met").
       *
       * The raise was guarded by `!cklMoving`; the CLEAR below was not, so `precondMsg` fell
       * back to false the moment every row recovered and the next crossing raised the comment
       * again. A precondition predicate sitting ON its threshold therefore chatters: the
       * checklist is still on step 0 (`cklMoving` false) for as long as its first step is
       * ungraded, so the guard above does nothing while the flicker is happening.
       *
       * MEASURED BY BACKSHOP, INHERITED HERE (#732, #724 item 15): `power_pct` on the
       * `low_power` initial condition runs 9.222-10.061 %, a span of 0.840 points, and crosses
       * `pwr_raise_power`'s authored `> 10 %` row twice in 10 plant-minutes. Their half of the
       * fix moves that threshold; this half is the mechanism, so the next oscillating predicate
       * cannot do it again.
       *
       * `precondSaid` is never cleared for the life of the run. THE CLEAR STILL CLEARS — a
       * genuinely recovered precondition still takes the standing comment down on the tick it
       * recovers, which is what `precondMsg` is for; a latch that never clears is the same
       * defect facing the other way. */
      var cklMoving = c.idx > 0;
      if (anyUnmet && !c.precondMsg && !c.precondSaid && !cklMoving) {
        // One register-aware comment per unmet episode — the checklist banner
        // carries the row-by-row detail, this just points the operator at it.
        c.precondMsg = true;
        c.precondSaid = true;
        this.pendingMessage = {
          learning: 'Before you lean on this walkthrough: the plant does not match one or more of its prerequisites — the walkthrough panel lists each one with what the plant actually reads. Nothing is blocked; the steps simply may not verify until the plant is where the procedure assumes.',
          industry: 'WALKTHROUGH PRECONDITIONS NOT MET — see the walkthrough panel for the failed items.',
        };
      } else if (!anyUnmet && c.precondMsg) {
        // All rows recovered — clear OUR message (set under precondMsg only).
        c.precondMsg = false;
        this.pendingMessage = null;
      }
    }

    /* CATCH-UP AT START (#607 item 7). Sequential grading of the first unchecked step
     * traps a player who already did the early actions: heatup step 1 wants pumps
     * secured, and a plant whose pumps are running can never satisfy the prose even
     * when later accs are already true. Walking BACKWARD from "a later acc is met"
     * would skip the whole heatup — the last confirms are `power_pct < 1`, true the
     * entire ride. So walk FORWARD once, and skip a step only when:
     *   · an authored `past` predicate is met (the starting-state confirmation no
     *     longer applies), or
     *   · it is an ACTION (has `cmd`) whose `acc` is already true.
     * A pure observation whose acc still describes this plant is left standing. */
    if (c.catchUp) {
      c.catchUp = false;
      while (c.idx < c.proc.steps.length && this._stepAlreadyDone(snapshot, c.proc.steps[c.idx])) {
        this._checklistCheckOff('caught_up');
      }
    }

    var st = c.proc.steps[c.idx];
    if (!st) { c.complete = true; return; }
    var stepEntryTick = (c.stepAt == null);
    if (stepEntryTick) c.stepAt = simTime;   // when this step came up — the dwell's clock

    /* FAILURES THE STEP FIRES BEHIND THE SCENES (#670 Phase 1, incident walkthroughs). See
     * `_checklistFire`. NOT on the entry tick, and that is not a detail — see the ordering
     * note there: firing here would put the failure INSIDE the step's own start checkpoint,
     * and Rewind would then hand the player back a plant that is already broken. */
    /* THE PAUSE (#694). "For events that the user does not control... user hits continue
     * [...] sim pauses" (owner, 2026-09-09). Requested the SAME tick something in `inject`/
     * `clear` NEWLY fires — `_firedN0` catches the case where the step's fire is still
     * waiting on a `when` predicate, so a step with `pause` does not freeze the plant before
     * its event has actually happened. The pause REPLACES ordinary grading for this step
     * (early return, below `c.awaitingAck = true`): a dwell or `acc` predicate needs sim time
     * to advance, and stopping the clock is exactly what a pause does, so requiring one would
     * soft-lock the checklist. One event per step is the authored shape (the owner's own
     * cascade: polisher / feed pump / turbine as three steps, not three injects on one) —
     * `_serviceInstructorRequests` (simulation_service.js) is what actually stops the clock;
     * `ui/app.js` releases the hold on Continue, the checklist's own Rewind, or Stop. */
    if (!stepEntryTick && (st.inject || st.clear)) {
      var _firedN0 = c.fired.length;
      this._checklistFire(snapshot, st);
      if (st.pause && c.fired.length > _firedN0) {
        this._pauseRequested = true;
        c.awaitingAck = true;
        c.paused = true;
        return;
      }
    }

    /* A STEP THE PLANT HAS MOVED PAST CHECKS ITSELF OFF AS OVERTAKEN (#641, owner playtest
     * 2026-09-05: "mode 3>1 checklist step 9 the user can get stuck if they accidently go too
     * high and the source range shuts off. the user can not plot on the 1/m plot making it so
     * they cant complete that step.").
     *
     * A `plot_1m_point` cmd-entry is evidence the player can only produce while the source
     * range is energized — the tool refuses the press otherwise and sends nothing — and this
     * plant secures the channel on flux alone at 1e5 cps, twenty seconds past the last plot
     * step's 20,000 cps target on a hot burst (measured). Sequential grading then waits for a
     * command that can never come: a soft lock with no skip, because the manual tick was
     * removed by directive (2026-08-11). So a step may author `overtaken: {p, op, v, text}` —
     * the plant condition under which the step no longer applies. Graded like `acc` (same
     * debounce, instrument-first), and when it holds the step is checked off `'overtaken'`,
     * the text goes out as the instructor's comment, and the checklist moves on. It is the
     * plant checking the step off on a condition the plant publishes — not a skip button.
     *
     * Evaluated BEFORE the acceptance so a step whose count box has already latched still
     * leaves; and never on a step already met, since `met` below returns first only when
     * both are true on the same tick, which is the tie the acceptance should win. */
    if (st.overtaken && st.overtaken.p) {
      c.overtakenStreak = this._grade(snapshot, st.overtaken).met ? (c.overtakenStreak || 0) + 1 : 0;
      if (c.overtakenStreak >= ACC_STABLE_N) {
        var otText = st.overtaken.text || 'The plant has moved past this step.';
        /* ⚠ CHECK OFF FIRST, THEN SPEAK (#749 item 4, 2026-09-18). `_checklistCheckOff` now
         * retires the outgoing step's comment, so setting `pendingMessage` BEFORE this call —
         * which is what this site used to do — hands it a message and then deletes it on the
         * same tick. The message belongs to the step being ENTERED (it explains why the player
         * is suddenly there), so it is raised after the move, and it is retired when THAT step
         * is checked off. Any future caller that wants to speak through a check-off owes the
         * same order; `run_checklist_pwr2` §2ac reddens if this pair is swapped back. */
        this._checklistCheckOff('overtaken');
        this.pendingMessage = { learning: otText, industry: st.overtaken.industry || otText };
        return;
      }
    }

    if (st.saw && !c.sawSeen && this._grade(snapshot, st.saw).met) c.sawSeen = true;

    if (st.accs && st.accs.length) {          // multi-check-off (#244 item 8)
      c.gradedBy = null;
      c.accMetNow = this._gradeAccs(c, st, snapshot);
    } else if (st.acc) {
      var g = this._gradeOne(c, snapshot, st.acc, 'acc');
      c.gradedBy = g.graded_by;
      c.accStreak = g.met ? c.accStreak + 1 : 0;
      c.accMetNow = c.accStreak >= ACC_STABLE_N;
    } else {
      c.gradedBy = null;
      c.accMetNow = false;
    }

    /* A step with NOTHING GRADABLE is an OBSERVATION, and it completes on time spent.
     *
     * *(OWNER DIRECTIVE, 2026-08-11: "Checklists are supposed to be automatically checked
     * off by the sim when complete. Remove the user clickable step complete button.")* —
     * with that button gone, `: false` here would be a soft lock. Measured across the PWR
     * set: 2 steps of 106 declare no `acc`, `saw` or `cmd`, and both are the opening "Read
     * the primary pressure…" / "Read SG level…" of their procedure. There is no instrument
     * evidence that someone has READ something; the honest completion criterion is that
     * they were given time to.
     *
     * Generalised rather than authored onto those two steps on purpose: a new observation
     * step should not be able to soft-lock a checklist just by omitting a predicate.
     * `checklist_check` survives as a command — save/restore and the tests still use it —
     * it simply has no button any more. */
    var hasAccs = !!(st.accs && st.accs.length);
    var met = (hasAccs || st.acc) ? (c.accMetNow && (!st.saw || c.sawSeen))
            : st.saw ? c.sawSeen
            : st.cmd ? c.cmdSeen
            : (simTime - (c.stepAt == null ? simTime : c.stepAt)) >= OBSERVE_DWELL_S;
    /* A STEP THE PLAYER NEVER TOUCHES WAITS FOR AN ACKNOWLEDGEMENT *(OWNER, 2026-09-03, #619
     * item 4: "When steps are auto completed with no user action, add an acknowledge button to
     * the step., this button should flash green so the user knows thats the control that needs
     * to be pressed to progres."; scoped by ruling 2026-09-03 to observation/ride steps only)*.
     *
     * These are the steps that satisfy themselves out of the plant — the opening confirms, and
     * the long rides like "ride the heatup to Hot Standby". They used to tick and move on while
     * the player was still reading, so a checklist could run several steps ahead of them.
     *
     * THE TEST IS "DOES THE STEP AUTHOR AN OPERATOR ACTION", not how it grades. `cmd` is the
     * replay's command and every step the player actually operates carries one (the live
     * checklist never issues it — the player presses the control and the acc grades what
     * happened), and a `cmd`-kind accs entry is the same thing for multi-action steps. A step
     * with neither is one nobody had to do anything for, which is exactly the owner's wording.
     *
     * NARROWED, NOT REVERSED. *(OWNER DIRECTIVE, 2026-08-11: "Checklists are supposed to be
     * automatically checked off by the sim when complete. Remove the user clickable step
     * complete button.")* still holds everywhere it was aimed: every step you operate still
     * ticks itself off the instruments and grows no button.
     *
     * The gate is on the ADVANCE, not on the grading — `acc_met` and the per-entry verdicts
     * keep updating underneath, so the card shows the step satisfied while it waits. `awaiting_ack`
     * is what the UI draws the flashing button from; `checklistCheck` (the button, and the
     * replay harness) clears it through the ordinary manual path. */
    /* EVERY STEP WAITS FOR CONTINUE *(OWNER, 2026-09-08, #660 items 16-18: "Only show one step at
     * a time … Add a continue button that only lights up when the conditions of the step are
     * met.")*. The grading is unchanged — `met` is what lights the button — but no step advances
     * itself any more; the press (`checklist_check`) does. Before this, action steps ticked and
     * moved on the instant their predicate held and only observation steps held for the
     * acknowledgement (#619 item 4). The overtaken path (#641) still advances by itself: it is
     * the plant moving past a step, not the player finishing one. */
    c.awaitingAck = !!met;
  };

  /* A STEP MAY FIRE FAILURES BEHIND THE SCENES (#670 Phase 1, incident walkthroughs).
   *
   * *(OWNER, 2026-09-08: "These walkthroughs will include another element the last walkthroughs
   * don't have, these ones will automatically trigger failures behind the scenes.")* — the plant
   * breaks on the step that needs it, with the player never opening the Failures tab.
   *
   *   inject: [{ failure: 'stuck_porv_open', severity: 1.0 }, { failure: 'afw_failure',
   *              when: { p: 'turbine_tripped', op: '>', v: 0 } }]
   *   clear:  ['porv_indicator_stuck_closed', { failure: 'x', when: {...} }]
   *
   * Both descend through `this.below.handleCommand` — the SAME path the beat engine's
   * `beat.inject_failures` takes (`_fireBeat` above) — so the control layer places the failure
   * (Hard Rule 7) and command interception applies. Nothing here reaches into an engine.
   *
   * WITHOUT `when` it fires on the step's first tick AFTER the entry tick; WITH `when` on the
   * first tick that predicate holds, graded by `_grade` — instrument-first, the same evaluator
   * the acceptance uses, so a walkthrough's trigger reads the board the player reads. NO
   * DEBOUNCE, unlike `acc`: an acceptance that flickers advances a checklist wrongly and can be
   * re-earned, where a failure that fires one tick early is simply the failure firing.
   *
   * ⚠ THE ORDERING, which is the whole reason this is not on the entry tick. `_checklistCheckOff`
   * requests the step-boundary checkpoint and M5 services that request in
   * `_serviceInstructorRequests` — AFTER `instructor.step()` in the same `_assembleWithInstructor`
   * call (measured at #660: the ring goes 3 → 4 with no tick in between). So an injection fired on
   * the entry tick lands INSIDE the checkpoint that Rewind restores, and "⏪ Rewind step" would
   * hand the player back a plant that is already broken with the fired-set saying it had already
   * happened. One broadcast later (0.1 s of plant time) the checkpoint is on the ring holding the
   * clean plant, and a rewind genuinely un-does the failure. MEASURED BY INJECTION: firing on the
   * entry tick reddens three checks of `run_checklist` section 10, one of them the plant reading
   * ("the plant comes back WITHOUT the injected failure" → active [stuck_porv_open]).
   *
   * FIRES ONCE PER STEP ENTRY. `fired` is keyed by kind+index+id — not by id alone, so the same
   * failure may be cleared and re-injected by two entries of one step — and it is reset in
   * `_checklistCheckOff` BEFORE the checkpoint request, so a restored checkpoint carries an empty
   * set and re-entry after a Rewind fires again against the plant it was restored beside.
   *
   * A REFUSAL IS SWALLOWED WITH A WARNING, unlike the beat engine, which is scenario content run
   * by a gate. This runs under a player in free play, and the pwr2 shell refuses by THROWING
   * (#505): an unknown or beyond-model failure id would otherwise take `tick()` down mid-session.
   * The id is authored content and `run_style`/the replay are where a bad one should be caught. */
  InstructorLayer.prototype._checklistFire = function (snapshot, st) {
    var c = this.checklist, self = this;
    if (!c.fired) c.fired = [];
    if (!c.injected) c.injected = [];
    if (!this.below) return;
    function fire(list, kind) {
      for (var i = 0; i < (list || []).length; i++) {
        var e = list[i];
        var spec = (typeof e === 'string') ? { failure: e } : e;
        if (!spec || !spec.failure) continue;
        var key = kind + i + ':' + spec.failure;
        if (c.fired.indexOf(key) >= 0) continue;
        if (spec.when && spec.when.p && !self._grade(snapshot, spec.when).met) continue;
        c.fired.push(key);
        var cmd;
        if (kind === 'i') {
          cmd = { action: 'inject_failure', failure_id: spec.failure };
          if (spec.severity != null) cmd.severity = spec.severity;
        } else {
          cmd = { action: 'clear_failure', failure_id: spec.failure };
        }
        try {
          self.below.handleCommand(cmd);
          if (kind === 'i' && c.injected.indexOf(spec.failure) < 0) c.injected.push(spec.failure);
        } catch (err) {
          if (typeof console !== 'undefined') {
            console.warn('InstructorLayer: checklist ' + (kind === 'i' ? 'inject' : 'clear') +
              ' "' + spec.failure + '" refused — ' + (err && err.message || err));
          }
        }
      }
    }
    fire(st.inject, 'i');
    fire(st.clear, 'c');
  };

  /* See the catch-up block in `_stepChecklist`. `past` is one predicate or an array (OR).
   * Reads paramValue (true_state / control_state), not the instrument-first `_grade`:
   * catch-up is "has the plant already done this", and a lagged channel would leave the
   * player on a start-pumps step whose flow is already 110 % true. The ACTIVE step still
   * grades instruments. */
  InstructorLayer.prototype._stepAlreadyDone = function (snapshot, st) {
    if (!st) return false;
    var self = this;
    function met(pred) {
      return self._predMet(InstructorLayer.paramValue(snapshot, pred.p), pred);
    }
    var past = st.past ? (Array.isArray(st.past) ? st.past : [st.past]) : [];
    for (var i = 0; i < past.length; i++) {
      if (met(past[i])) return true;
    }
    if (!st.cmd) return false;
    if (st.acc) return met(st.acc);
    if (st.accs && st.accs.length) {
      var anyPred = false;
      for (var j = 0; j < st.accs.length; j++) {
        var en = st.accs[j];
        if (en && en.cmd && !en.p) return false;   // still owes a command this tick never saw
        if (en && en.p) {
          anyPred = true;
          if (!met(en)) return false;
        }
      }
      return anyPred;
    }
    return false;
  };

  InstructorLayer.prototype._checklistCheckOff = function (by) {
    var c = this.checklist;
    /* THE OUTGOING STEP'S COMMENT GOES WITH THE STEP (#749 item 4, measured 2026-09-18).
     *
     * `_advanceFollow` has cleared `pendingMessage` on every step change since it was written —
     * "a new step retires the previous step's feedback" — and this, the Path 3 advance the
     * Continue button AND the overtaken skip both run through, reset eleven per-step fields and
     * never touched it. MEASURED on the live runtime (`start_checklist pwr_startup`, a real
     * overshoot to `sr_energized < 1` at bank 242, then Continue to the end): step 6's overtaken
     * text — "This point is overtaken: SOURCE RANGE switched itself off… Stop withdrawing and go
     * to the criticality step." — stood at steps 9, 10, 11, 12, 13, 14, 15, 16, 17 AND on the
     * COMPLETE snapshot. TEN of the ten later states, the last of them telling a finished player
     * to stop withdrawing. `ui/app.js` paints it into `#instrCurrent`, so it is on the card for
     * all of them. NOT specific to the overtaken note: any message raised on a walkthrough step
     * outlived every later step.
     *
     * ⚠ THE ORDERING IS THE TRAP AND IT IS WHY THIS LINE IS NOT ENOUGH ON ITS OWN. The overtaken
     * path SET the message and then called this — so an unconditional clear here deletes the very
     * message that call was made to deliver. The form chosen is the one with the smallest surface
     * and no new serialized state: this clears unconditionally, and the ONE caller that speaks
     * through a check-off now raises its message AFTER the call. The alternative — stamping each
     * message with the step index it belongs to — buys the same behaviour for a new field in
     * `serialize`/`restore` and a second rule to keep in step; declined. The other two callers
     * (`checklistCheck`, the Continue button; and the `caught_up` loop) raise no message at all.
     *
     * `precondMsg` COMES DOWN WITH IT, and that is deliberate rather than incidental: it is the
     * flag saying "the standing comment is OURS to clear", so leaving it true over a cleared
     * message would let a later recovery null out somebody else's comment instead — the same
     * defect facing the other way. The precondition ROWS are unaffected; the walkthrough panel
     * still lists every failed one, which is where that detail has always lived. */
    this.pendingMessage = null;
    c.precondMsg = false;
    c.done[c.idx] = true;
    c.doneBy[c.idx] = by;
    c.idx++;
    c.cmdSeen = false; c.sawSeen = false; c.accStreak = 0; c.accMetNow = false; c.gradedBy = null;
    c.accsState = null;                 // per-entry multi-check-off latches (#244 item 8)
    c.outOfTurn = null;                 // #759 — the out-of-turn note belongs to the step it was pressed on
    c.predBags = null;                // #755/#761 — the new step owes its steadiness / quiet window afresh
    c.awaitingAck = false;              // #619 item 4 — cleared with the step it belonged to
    c.stepAt = null;                    // re-stamped on the next tick — see the dwell above
    c.overtakenStreak = 0;              // #641 — the next step's own predicate starts from zero
    c.paused = false;                   // #694 — the new step has not fired its own pause yet
    /* #670 — the fired-set is PER STEP ENTRY, and it is cleared HERE, before the checkpoint
     * request below, so the checkpoint M5 lays at the start of the step just entered carries an
     * empty set. A Rewind back onto it therefore re-enters a step that has not fired yet, beside
     * a plant that has not been broken yet. See `_checklistFire`. */
    c.fired = []; c.injected = [];
    if (c.idx >= c.proc.steps.length) c.complete = true;
    /* A CHECKPOINT ON EVERY STEP BOUNDARY (#660 item 17: "Rewind takes the walkthrough and plant
     * back one step. So it will need to save each step."). M5 consumes this on its next tick and
     * lays the checkpoint at the START of the step just entered; the walkthrough state rides in
     * it, so a rewind restores plant and progress together. */
    this._checkpointRequested = true;
  };

  // Grade one {p, op, v [,tol]} predicate. Instrument-first (HR1): if the param
  // has an instrument twin and the reading exists, grade what the operator sees;
  // otherwise the documented true_state fallback.
  /* ROD POSITION IS A PREDICATE PARAM, AND IT IS NOT IN `true_state` (#605, owner playtest
   * 2026-09-02, M5->3 item 1: "Step 3 should be based on rod position not reactivity").
   *
   * `_grade` reads FLAT fields — an instrument twin, else `true_state[p]` — and bank position is
   * neither. It lives in `control_state.rod_groups[]`, one entry per bank, carrying `steps` /
   * `max_steps` / `position_pct`: the same numbers the board's rod readouts print, which is what
   * makes grading off them instrument-honest rather than a peek at truth. So resolve those few
   * names here instead of minting `true_state` fields for them — a new contract field would want
   * its §6.3 line and would exist for the checklists alone, and `run_contract` would then police
   * a field no engine has any other reason to publish.
   *
   * A group the running plant does not carry resolves to undefined, which `_predMet` fails
   * closed on — the same verdict a missing true_state field gets, so a step written against a
   * two-bank plant simply never checks off on a one-bank one rather than checking off wrongly. */
  var ROD_PARAMS = {
    control_bank_pct:  { group: 'control_rods',  field: 'position_pct' },
    control_bank_steps: { group: 'control_rods', field: 'steps' },
    shutdown_bank_pct: { group: 'shutdown_rods', field: 'position_pct' },
    shutdown_bank_steps: { group: 'shutdown_rods', field: 'steps' }
  };
  /* Flat control_state fields a checklist acc may name (#607). Same reason as ROD_PARAMS:
   * they are what the board shows, they are not in true_state, and minting contract
   * fields for the checklists alone is the wrong shape. */
  /* `letdown_orifice_a`/`_b` are the OPERATOR'S ORIFICE LINEUP and live only in control_state
   * (#624 item 25): the heatup's letdown step is graded on the selector the player pressed,
   * which no true_state field carries — the plant publishes the resulting FLOW
   * (`letdown_flow_actual`), and a flow reads the same on a cold plant letting down through the
   * RHR cross-connect with the orifices shut. */
  /* `heater_auto`/`spray_auto` are the two AUTO LAMPS on the pressurizer cards (#624 item 14):
   * the heatup's "place pressure control in service" step is graded on which mode the operator
   * selected, and mode is control_state — true_state carries the heater's kW and the spray's
   * delivered flow, both of which read the same in AUTO and in a MANUAL demand that happens to
   * match. Grading on kW would tick the step for a player who never touched the card. */
  /* THE OPERATOR'S TRIP BLOCKS (#731, owner playtest #724 item 13). A manual trip block is a
   * LINEUP the player sets and the board draws as a lit row on the TRIP BLOCKS panel; it lives
   * in `rps_state.trip_blocks`, not in true_state and not on any instrument, so a step that
   * wanted "is this trip blocked?" had nothing to grade on and was authored on the COMMAND
   * instead. That is the defect: a command-graded step cannot see a block a previous step
   * already placed, and — until `_cmdEvidence` below learned the sense — an UNBLOCK satisfied
   * it. Measured on the shipped plant (pwr_startup, hot_zero_power, full stack): entering step
   * 17 with pr_low_setpoint already blocked left the step unmet for 402 s of plant time, and
   * issuing the unblock lit its Continue button 6 s later with the trip live at 9.9 % power.
   *
   * A block is not the negation of a trip: it is permissive-gated and AUTO-REINSTATES below
   * P-10, so this must be read live every tick rather than latched once — which is exactly what
   * grading on state (and not on a command that happened once) gives. Boolean on the wire;
   * normalised to 1/0 here so the ordinary `{op:'>', v:0}` predicate vocabulary applies. */
  /* The engine publishes fields of its own called `ir_high_blocked` and `lo_press_blocked`
   * (pwr2_protection.js) and these param names shadow them in `paramValue`. Traced at the
   * quality pass: both come from the SAME source — `pwr2_shell.js` builds `trip_blocks` out of
   * the very flags those fields report — so there is no second copy of the truth here. */
  var RPS_BLOCK_PARAMS = {
    ir_high_blocked:         'ir_high',
    pr_low_setpoint_blocked: 'pr_low_setpoint',
    lo_press_blocked:        'lo_press',
    si_trip_blocked:         'si_trip'
  };
  function rpsBlockParam(snapshot, p) {
    var id = RPS_BLOCK_PARAMS[p];
    if (!id) return undefined;
    var tb = snapshot && snapshot.rps_state && snapshot.rps_state.trip_blocks;
    if (!tb) return undefined;
    return tb[id] ? 1 : 0;
  }
  var CTL_PARAMS = { feed_coupled: 1, steam_dump_setpoint: 1,
                     letdown_orifice_a: 1, letdown_orifice_b: 1,
                     heater_auto: 1, spray_auto: 1,
                     /* the operator's SELECTION, not the valve (#629) — a dump controller in
                      * service at its setpoint carries 0 % on a plant already on programme,
                      * so the valve position cannot tell AUTO from CLOSED */
                     steam_dump_auto: 1,
                     /* HX SPLIT (#739) — the cooldown throttle. `getControlState()` is the only
                      * place it is published (`pwr2_shell.js` :1843, from `e.rh.hx_fraction`);
                      * `true_state` does not carry it, so without this line `paramValue` returns
                      * undefined and `pwr_cooldown` step 10's acceptance could never grade. It is
                      * a FRACTION here (0.07) and per cent on the card. */
                     rhr_hx_fraction: 1 };
  function rodParam(snapshot, p) {
    var spec = ROD_PARAMS[p];
    if (!spec) return undefined;
    var groups = snapshot.control_state && snapshot.control_state.rod_groups;
    if (!groups || !groups.length) return undefined;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i] && groups[i].id === spec.group) {
        var v = groups[i][spec.field];
        return (v == null || isNaN(v)) ? undefined : v;
      }
    }
    return undefined;
  }

  /* THE ONE RESOLVER (#605). `test/procedures_harness.js` asserts the same `acc` predicates
   * this layer grades, and it used to read `snapshot.true_state[p]` directly — a second sampler
   * of the same truth, and one that cannot see a param resolved anywhere else. It calls this
   * now, so a param added here reaches the gate and the live runtime together. */
  InstructorLayer.paramValue = function (snapshot, p) {
    if (ROD_PARAMS[p]) return rodParam(snapshot, p);
    if (RPS_BLOCK_PARAMS[p]) return rpsBlockParam(snapshot, p);
    if (CTL_PARAMS[p]) {
      var cv = snapshot && snapshot.control_state ? snapshot.control_state[p] : undefined;
      if (cv == null || (typeof cv === 'number' && isNaN(cv))) return undefined;
      return (typeof cv === 'boolean') ? (cv ? 1 : 0) : cv;
    }
    return snapshot && snapshot.true_state ? snapshot.true_state[p] : undefined;
  };

  /* THE READ, split out from `_grade` (#755) so the steadiness evaluator below samples the
   * SAME channel the acceptance grades — instrument-first, per Hard Rule 1 — rather than
   * becoming a second sampler of the same truth (the #605/#432 shape). Byte-for-byte the
   * branches `_grade` used to carry; nothing about resolution changed. */
  function readParam(snapshot, p) {
    if (RPS_BLOCK_PARAMS[p]) return { value: rpsBlockParam(snapshot, p), graded_by: 'rps_state' };
    if (ROD_PARAMS[p]) return { value: rodParam(snapshot, p), graded_by: 'control_state' };
    if (CTL_PARAMS[p]) {
      var cv = snapshot && snapshot.control_state ? snapshot.control_state[p] : undefined;
      if (typeof cv === 'boolean') cv = cv ? 1 : 0;
      return { value: cv, graded_by: 'control_state' };
    }
    var plant = (snapshot.metadata && snapshot.metadata.plant_id) || null;
    var map = plant ? PARAM_INSTRUMENT[plant] : null;
    var iid = map ? map[p] : null;
    var v, by;
    /* RULED (#670) — OWNER RULING, 2026-09-09: "A." This read, which is what `_gradeAccs` grades
     * a walkthrough step's `acc` on, is the UNDAMPED transmitter, and it stays that way. The
     * board draws every dimensioned tile through its own filter (`DISPLAY_DAMP` in
     * pwr_board_wiring.js — #234 indicator damping, sg_level at a time constant of 1.5 s), so on
     * a fast transient an acceptance can tick with the tile a point the wrong side of the step's
     * limit: measured, `below 55 %` at 56 % drawn, a 1 percentage point gap. Do NOT regrade on
     * the drawn value — it is a pool-wide retune of the 58 acceptances that grade on a damped
     * channel, and it trades Hard Rule 1, instruments versus truth, for cosmetic agreement.
     * github.com/TH462/Reactor-Dynamics/issues/670#issuecomment-5604928260 */
    if (iid && snapshot.instruments && snapshot.instruments[iid] != null) {
      v = snapshot.instruments[iid]; by = 'instrument';
    } else {
      v = snapshot.true_state ? snapshot.true_state[p] : undefined; by = 'true_state';
    }
    return { value: v, graded_by: by };
  }

  InstructorLayer.prototype._grade = function (snapshot, pred) {
    var r = readParam(snapshot, pred.p);
    // `value` rides along for consumers that display the reading (#395's
    // precondition banner); met/graded_by callers are unaffected.
    return { met: this._predMet(r.value, pred), graded_by: r.graded_by, value: r.value };
  };

  /* THE STEADINESS EVALUATOR (#755) — ONE implementation, two callers. The live runtimes reach
   * it through `_gradeOne` / `_gradeAccs` below with a per-step bag; `test/procedures_harness.js`
   * (the replay) calls this static directly with a bag of its own, for the same reason `pv()`
   * there calls `paramValue` — a second sampler of the same claim is worse than none (#605).
   *
   * `bag` is opaque per-predicate state, reset by the caller when the step changes. Call it once
   * per broadcast with the live snapshot: it samples, prunes and returns the verdict together.
   * `{met, drift, value, graded_by, covered, n}` — `drift` is null until the window is covered. */
  InstructorLayer.gradeSteady = function (bag, snapshot, pred) {
    var r = readParam(snapshot, pred.p);
    var t = snapshot && snapshot.metadata ? snapshot.metadata.sim_time : null;
    var W = (pred.window > 0) ? pred.window : STEADY_WINDOW_S;
    var out = { met: false, drift: null, value: r.value, graded_by: r.graded_by, covered: false, n: 0 };
    if (!bag.s) bag.s = [];
    var s = bag.s;
    if (t == null || !isFinite(t) || typeof r.value !== 'number' || !isFinite(r.value)) return out;
    /* THE CLOCK WENT BACKWARDS — a Rewind, a restored save, a re-selected plant. The ring
     * describes a plant that no longer exists, so it starts again; the step then owes its
     * window afresh, which is the conservative direction. */
    if (s.length && t < s[s.length - 1].t) s.length = 0;
    var gap = Math.max(0.05, W / 120);          // ~120 samples per window at 1x; cheap at 60x
    if (!s.length || t - s[s.length - 1].t >= gap) s.push({ t: t, v: r.value });
    // keep exactly one sample at or before the window's trailing edge, so `covered` is honest
    while (s.length > 1 && t - s[1].t > W) s.shift();
    out.n = s.length;
    out.covered = s.length > 1 && (t - s[0].t) >= W;
    if (!out.covered) return out;
    var tm = t - W / 2, a = 0, na = 0, b = 0, nb = 0;
    for (var i = 0; i < s.length; i++) {
      if (t - s[i].t > W) continue;             // the one sample outside the window
      if (s[i].t < tm) { a += s[i].v; na++; } else { b += s[i].v; nb++; }
    }
    var lo, hi;
    if (na >= 2 && nb >= 2) { lo = a / na; hi = b / nb; }
    else {
      /* A WINDOW TOO THIN TO HALVE — the WARP tier, where one broadcast can be minutes of plant.
       * Fall back to the ends of the COVERED SPAN, which is at least `window` long, so the change
       * it measures is an over-read of the change across the window: conservative, never a false
       * accept, and it cannot soft-lock a step the way "never met" would. */
      lo = s[0].v; hi = s[s.length - 1].v;
    }
    var mid = Math.abs((lo + hi) / 2);
    out.drift = mid > 1e-9 ? Math.abs(hi - lo) / mid : Math.abs(hi - lo);
    out.met = out.drift <= pred.v;
    return out;
  };

  /* THE "IT HAS STOPPED MOVING" EVALUATOR (#761) — ONE implementation, the same two callers as
   * `gradeSteady`, for the same reason (#605: a second sampler of the same claim is worse than
   * none). `bag` is opaque per-predicate state, cleared by the caller when the step changes.
   * `{met, still, value, graded_by}` — `still` is the seconds the reading has been unchanged. */
  InstructorLayer.gradeStopped = function (bag, snapshot, pred) {
    var r = readParam(snapshot, pred.p);
    var t = snapshot && snapshot.metadata ? snapshot.metadata.sim_time : null;
    var need = (pred.v > 0) ? pred.v : STOPPED_DEFAULT_S;
    var out = { met: false, still: null, value: r.value, graded_by: r.graded_by };
    /* NOTHING TO READ is never "stopped". A channel that does not publish would otherwise sit
     * unchanged at `undefined` for ever and read as a control at rest — a check that can only
     * pass. The bag is cleared too, so the quiet clock restarts when the channel comes back. */
    if (t == null || !isFinite(t) || typeof r.value !== 'number' || !isFinite(r.value)) {
      bag.last = null; bag.since = null; return out;
    }
    /* THE CLOCK WENT BACKWARDS — a Rewind, a restored save, a re-selected plant. Same rule as
     * `gradeSteady`: the bag describes a plant that no longer exists, so the quiet time starts
     * again and the step owes `v` afresh, which is the conservative direction. */
    if (bag.t != null && t < bag.t) { bag.last = null; bag.since = null; }
    bag.t = t;
    if (bag.last == null || r.value !== bag.last) { bag.last = r.value; bag.since = t; }
    out.still = t - bag.since;
    out.met = out.still >= need;
    return out;
  };

  /* Is this param read off the OPERATOR'S OWN CONTROL STATE (exact, quantized, no instrument in
   * the path) rather than off a gauge? Derived from the same three maps `readParam` dispatches
   * on — never a hand-kept second list, which is the shape that certifies a map instead of a
   * plant. `op: 'stopped'` is legal only on these; `run_checklist_pwr2` §2aa is the gate. */
  InstructorLayer.isControlParam = function (p) {
    return !!(ROD_PARAMS[p] || CTL_PARAMS[p] || RPS_BLOCK_PARAMS[p]);
  };

  /* Grade ONE predicate for a runtime holder (checklist / follow), routing a BAGGED op
   * (`steady`, `stopped`) to the holder's own per-step bag. Every other op is stateless and
   * goes straight to `_grade`. */
  InstructorLayer.prototype._gradeOne = function (holder, snapshot, pred, key) {
    if (!pred || !BAG_OPS[pred.op]) return this._grade(snapshot, pred);
    if (!holder.predBags) holder.predBags = {};
    if (!holder.predBags[key]) holder.predBags[key] = { s: [] };
    return InstructorLayer.gradeBagged(holder.predBags[key], snapshot, pred);
  };

  // #715 — re-grades a leg's optional `outcome_guard` (same {p,op,v[,tol]} shape as
  // `precond`/`accs`) against the LIVE snapshot. No guard authored → unaffected (true).
  // Instrument-first via `_grade`, same as every other predicate in this file (HR1).
  InstructorLayer.prototype._gradeOutcomeGuard = function (proc) {
    var g = proc && proc.outcome_guard;
    if (!g || !g.length) return true;
    var snap = this._lastSnapshot;
    if (!snap) return true;   // nothing graded yet — do not manufacture a false negative
    for (var i = 0; i < g.length; i++) {
      if (!this._grade(snap, g[i]).met) return false;
    }
    return true;
  };

  // Same op vocabulary as the manual/harness: > < >= <= ~ (within tol).
  InstructorLayer.prototype._predMet = function (v, c) {
    if (v === undefined || v === null) return false;
    switch (c.op) {
      case '>':  return v > c.v;
      case '<':  return v < c.v;
      case '>=': return v >= c.v;
      case '<=': return v <= c.v;
      case '~':  return Math.abs(v - c.v) <= (c.tol != null ? c.tol : 1);
      default:   return false;
    }
  };

  // ============================================================ command path (HR5)
  // Operator commands descend through here. Free-play: forward the SAME object,
  // unaltered, and return what the layer below returns (placeholder contract).
  InstructorLayer.prototype.handleCommand = function (command) {
    // Instructor-internal commands — consumed here, never forwarded below (they
    // are not plant commands and would only be an M4 error).
    if (command && command.action === 'instructor_continue') {
      this._continueRequested = true;
      return null;
    }
    if (command && command.action === 'instructor_interact') {
      return this._handleInteract(command);
    }
    if (command && command.action === 'follow_nav' && this.mode === 'follow') {
      return this._handleFollowNav(command);
    }

    // Checklist cmd-watch (Path 3, passive): if the active step's evidence is a
    // command with nothing gradable behind it, seeing the family descend is the
    // check. Recording only — the command is never blocked or altered.
    if (this.checklist && !this.checklist.complete && command && command.action) {
      var cst = this.checklist.proc.steps[this.checklist.idx];
      if (cst && this._cmdEvidence(cst.cmd, command)) this.checklist.cmdSeen = true;
      if (cst) this._accsCmdWatch(this.checklist, cst, command);   // multi-check-off cmd entries
    }

    // 1/M plot point — an operator ACTION with no plant effect. Pressing "Plot
    // point" records a source-range sample in the 1/M tool, whose points live in
    // the UI (ui/panels/one_over_m.js), not in the snapshot, so there is nothing
    // for `acc` to grade: seeing the action IS the evidence (#202 item 1). The
    // checklist cmd-watch above has already recorded it; do the same for follow
    // mode, then consume — M4 would reject it as an unknown plant command.
    // Never gated: taking a reading is an observation, always allowed.
    if (command && command.action === 'plot_1m_point') {
      if (this.mode === 'follow' && this.follow && !this.follow.done) {
        var fst1m = this.follow.proc.steps[this.follow.idx];
        if (fst1m && fst1m.cmd && fst1m.cmd.action === 'plot_1m_point') this.follow.cmdSeen = true;
        if (fst1m) this._accsCmdWatch(this.follow, fst1m, command);  // "point plotted" check-off
      }
      return null;
    }

    // Scenario gates (beats restrict actions until their `until` trigger fires).
    if (this.mode === 'scenario' && command) {
      for (var i = 0; i < this.activeGates.length; i++) {
        var g = this.activeGates[i];
        var blocked = (g.block_actions.length && g.block_actions.indexOf(command.action) !== -1) ||
                      (g.allow_actions.length && g.allow_actions.indexOf(command.action) === -1);
        if (blocked) return this._blocked(g.message);
      }
      var ret = this.below.handleCommand(command);
      this._actionsSinceBeat.push(command);   // operator_action / inaction triggers watch these
      return ret;
    }

    // Follow-mode strict gating: current step's command family + the safety set.
    if (this.mode === 'follow' && command && this.follow && !this.follow.done) {
      var st = this.follow.proc.steps[this.follow.idx];
      if (!this._followAllows(st, command)) return this._blocked(this._wrongActionText(st));
      var r = this.below.handleCommand(command);
      this.pendingMessage = null;   // compliance clears stale wrong-action feedback
      if (st && this._cmdEvidence(st.cmd, command)) this.follow.cmdSeen = true;
      if (st) this._accsCmdWatch(this.follow, st, command);        // multi-check-off cmd entries
      return r;
    }

    return this.below.handleCommand(command);
  };

  InstructorLayer.prototype._handleFollowNav = function (command) {
    var f = this.follow;
    switch (command.dir) {
      case 'next':    this._advanceFollow(+1, false); break;
      case 'prev':    if (f.done) { f.done = false; this.levelComplete = null; } this._advanceFollow(-1, false); break;
      case 'restart': f.idx = 0; f.done = false; this.levelComplete = null;
                      f.cmdSeen = false; f.sawSeen = false; f.accStreak = 0; f.accMetNow = false;
                      f.accsState = null; f.predBags = null; break;
      default: break;
    }
    return null;
  };

  InstructorLayer.prototype._sameFamily = function (a, b) {
    if (a === b) return true;
    return ROD_FAMILY.indexOf(a) !== -1 && ROD_FAMILY.indexOf(b) !== -1;
  };

  /* ---------------------------------------------------------------- multi-check-off
   * (#244 item 8, owner: "Each step can have more then one checkoff to complete.")
   * A step may author `accs: [...]` instead of `acc`: each entry is either an
   * acceptance predicate {p,op,v[,tol],label} (graded with the same ACC_STABLE_N
   * debounce as `acc`) or a command observation {cmd,label} (family-matched like the
   * step's own `cmd` — the 1/M "point plotted" case). Entries LATCH individually —
   * a met check-off stays met, the way a ticked box behaves — and the step completes
   * when every entry is latched. Shared by BOTH runtimes (Path 3 checklist and
   * Path 2 follow), because the Walkthroughs tab and the 📋 checklist run the same
   * artifact. `holder` is the runtime's own state object (this.checklist / this.follow).
   *
   * ⚠ EXCEPT A TWO-SIDED BAND, WHICH MUST HOLD RATHER THAN MERELY HAVE BEEN TOUCHED (#683).
   * `op: '~'` is a *hold it here* claim; `>` and `<` are *you got past this* claims. A latched
   * band is satisfied by a plant that passed THROUGH it and left, which is how the only
   * two-sided temperature gate in the power ascension came to certify a plant that then walked
   * 105 degF (58 degC) down at 96.5 % power: measured 581.8 degF at stage 5 and 579.5 degF at
   * stage 8, inside the 563.4-592.2 degF band long enough to latch, then gone. `~` entries are
   * therefore RE-GRADED every tick and un-tick when the plant leaves the band.
   *
   * THE BLAST RADIUS IS MEASURED, NOT ASSUMED, which is why this is the default rather than an
   * authored opt-in flag: of 203 predicate acceptances across the whole pool, 20 are two-sided
   * and exactly TWO of those sit in this latching `accs[]` path — `pwr_raise_power` step 8
   * (this defect) and `pwr_heatup` step 14's steam-pressure band, which the dumps HOLD on
   * setpoint rather than pass through. Every `>`/`<` bound and every cmd-kind entry latches
   * exactly as before, so a ticked box still behaves like a ticked box everywhere it did. */
  InstructorLayer.prototype._ensureAccsState = function (holder, st) {
    if (!holder.accsState || holder.accsState.length !== st.accs.length) {
      holder.accsState = st.accs.map(function () {
        return { streak: 0, met: false, obs: null, graded_by: null, bag: null };
      });
    }
    return holder.accsState;
  };
  InstructorLayer.prototype._gradeAccs = function (holder, st, snapshot) {
    var state = this._ensureAccsState(holder, st);
    var all = true;
    var ordered = !!st.accs_ordered, blocked = false;
    for (var i = 0; i < st.accs.length; i++) {
      var en = st.accs[i], ax = state[i];
      /* a two-sided band re-grades for ever; every other kind latches (see the note above).
       * `steady` and `stopped` join it (#755, #761) and for the same reason: "it has stopped
       * moving" is a HOLD claim, and a plant — or a player — that starts moving again has left
       * it. */
      var holds = !!(en && (en.op === '~' || BAG_OPS[en.op]));
      if ((!ax.met || holds) && en && en.p) {
        var g;
        if (BAG_OPS[en.op]) {
          if (!ax.bag) ax.bag = { s: [] };
          g = InstructorLayer.gradeBagged(ax.bag, snapshot, en);
        } else g = this._grade(snapshot, en);
        ax.obs = g.value; ax.graded_by = g.graded_by;
        ax.streak = g.met ? ax.streak + 1 : 0;
        /* ORDERED STEPS (#756): a blocked entry still GRADES — `obs` keeps updating and a
         * `steady` ring keeps filling from the moment the step became active — it just may not
         * LATCH. Grading it is not cosmetic: measured on the 1/M ladder, the settle window has
         * to run from the step's start or the settle row would owe a fresh 120 s after the count
         * row ticks, and the crossing is at the same wall-clock instant either way. */
        if (ax.streak >= ACC_STABLE_N && !blocked) ax.met = true;
        else if (holds) ax.met = false;        // left the band — the check-off comes back off
      }
      if (!ax.met) { all = false; if (ordered) blocked = true; }   // cmd entries latch in handleCommand
      /* A LATCHED ENTRY IS NEVER UN-LATCHED BY A PREDECESSOR GOING BACK OFF, and that is
       * deliberate: "the counts passed 7.0e2" and "you plotted a point" stay true when a later
       * `steady` row un-ticks because the player pulled more rod. The block only gates NEW
       * latches, so the step still cannot COMPLETE until every row is met at once. */
    }
    return all;
  };
  // The command half of the watch: latch any unmet cmd-kind entry the command satisfies.
  // On an `accs_ordered` step a cmd entry is DEAF until its predecessors are met — that is the
  // half of the sequencer the player actually feels (#756: pressing Plot point early does nothing
  // instead of latching a stale point), because the press, not the predicate, is what they do.
  InstructorLayer.prototype._accsCmdWatch = function (holder, st, command) {
    if (!st || !st.accs || !st.accs.length) return;
    var state = this._ensureAccsState(holder, st);
    var ordered = !!st.accs_ordered, blocked = false, blockedBy = -1;
    for (var i = 0; i < st.accs.length; i++) {
      var en = st.accs[i];
      var matches = en && en.cmd && !state[i].met &&
        this._cmdEvidence(typeof en.cmd === 'string' ? { action: en.cmd } : en.cmd, command);
      if (!blocked && matches) state[i].met = true;
      /* AN OUT-OF-TURN PRESS MUST SAY SO (#759, OWNER RULING 2026-09-15: "Fix the text AND say
       * why"). Measured on the shipped pool before this: with rung 5a unmet (source range at
       * 501 counts per second against a 700 target) pressing Plot point added real points —
       * 1 -> 2 -> 3 circles on the plot, the panel recomputing each press — while the rung
       * never ticked and NOTHING was said on the card or in the panel. The sim accepted the
       * player and the walkthrough contradicted them with no way to tell which was in charge.
       *
       * Recorded here and not in `_gradeAccs` because the PRESS is the event: the predicate
       * half never sees a button. It names the ROW THAT IS BLOCKING, not the row that was
       * pressed, so the card's sentence is derived from the predecessor's own `ask` and no
       * step's wording is duplicated into the runtime. Cleared at the step boundary, and
       * suppressed in the snapshot once the blocker latches (see `out_of_turn` there). */
      if (blocked && matches) holder.outOfTurn = { idx: i, by: blockedBy };
      if (ordered && !state[i].met && !blocked) { blocked = true; blockedBy = i; }
    }
  };

  /* ON/OFF ACTUATIONS whose whole payload is the sense — see `_cmdEvidence` below. Each drives a
   * START/STOP or ON/OFF pair on one card, so a family match alone lets either button stand as
   * evidence for a step that asked for the other. `active !== false` is the shells' own
   * convention throughout (an absent flag means ON). */
  var SENSE_ACTIONS = { set_hpi: 1, set_lpi: 1, set_afw: 1, set_rcp: 1, set_rhr: 1,
                        set_feed_coupled: 1, set_charging_pump: 1 };
  // Does `command` count as having performed the step whose authored command is
  // `stepCmd`? Family match, plus a discriminator for the actions where the family
  // alone is too coarse: several DIFFERENT steps can share one action and would
  // otherwise check each other off. `inject_failure` is keyed by failure_id;
  // `set_trip_block` by trip_id, so blocking the power-range trip does not also
  // tick the intermediate-range step (the startup net needs BOTH — #202 item 6).
  InstructorLayer.prototype._cmdEvidence = function (stepCmd, command) {
    if (!stepCmd || !command || !command.action) return false;
    if (!this._sameFamily(stepCmd.action, command.action)) return false;
    if (stepCmd.action === 'inject_failure') return stepCmd.failure_id === command.failure_id;
    /* THE SENSE, NOT JUST THE ROW (#731, owner playtest #724 item 13: "When i unblocked the
     * trip the step thought i had blocked it and checked off the step. this would have left me
     * in a condition where the trip would have fired and ended my playthrough."). `trip_id`
     * alone made `set_trip_block {blocked:false}` evidence for a step that asks for a BLOCK —
     * the one direction that is unsafe. `blocked !== false` is the shell's own convention
     * (pwr2_shell.js set_trip_block): an absent flag means block. */
    if (stepCmd.action === 'set_trip_block') {
      return stepCmd.trip_id === command.trip_id &&
             (stepCmd.blocked !== false) === (command.blocked !== false);
    }
    /* …AND THE SAME RULE FOR EVERY ON/OFF ACTUATION (#741 quality pass, 2026-09-13). #731 fixed
     * the sense for trip blocks and left the identical hole one card over: these actions each
     * drive a pair of buttons that sit side by side, and a family match alone made the WRONG
     * button evidence for the step.
     *
     * FOUND BY REPRODUCTION, not by reading: #739 gave `pwr_cooldown` step 3 a pure `cmd` entry
     * for `set_hpi {active:false}` ("press STOP on ECCS"), and pressing START — `set_hpi
     * {active:true}`, the button immediately above it on the same card (pwr_board_wiring :602 /
     * :603) — ticked the entry green. Worse than #731's case, because that entry deliberately
     * carries NO predicate sibling (there is nothing observable behind securing an idle pump),
     * so nothing could contradict the false tick: the player got a green step AND high-pressure
     * injection running into a cooldown.
     *
     * `set_rhr` is in the list for the same reason and `set_spray` is not: spray carries a `pct`
     * as well as an open/shut sense, and `set_spray {open:true, pct:50}` vs `{open:false}` is
     * already discriminated by the predicate entries the spray steps carry. Keep this list to
     * actions whose ONLY payload is the sense — adding one whose payload matters would make the
     * check narrower than the step and reintroduce the soft-lock #697 is about. */
    if (SENSE_ACTIONS[stepCmd.action]) {
      return (stepCmd.active !== false) === (command.active !== false);
    }
    return true;
  };

  InstructorLayer.prototype._followAllows = function (st, command) {
    if (ALWAYS_ALLOWED.indexOf(command.action) !== -1) return true;
    if (!st || !st.cmd) return false;                       // observation step: look, don't touch
    if (!this._sameFamily(st.cmd.action, command.action)) return false;
    if (st.cmd.action === 'inject_failure') return st.cmd.failure_id === command.failure_id;
    return true;
  };

  // Wrong-action commentary: a generic two-register template built from the step
  // (a per-step authored `wrong: {learning, industry}` overrides it when present).
  InstructorLayer.prototype._wrongActionText = function (st) {
    if (st && st.wrong) return st.wrong;
    if (!st) return {
      learning: 'Hold on — just observe for this step. Watch the indications described, then press Next.',
      industry: 'Observation step. No manipulations. Advance when the indication is verified.',
    };
    var control = st.control || 'the indicated control';
    var firstSentence = (st.text || '').split(/(?<=[.!?])\s/)[0] || '';
    return {
      learning: 'Not yet — this step asks you to use "' + control + '". ' + firstSentence,
      industry: 'Off-procedure. Current step: ' + control + (st.target ? ' — ' + st.target : '') + '.',
    };
  };

  // Blocked-command result: distinguishable from M4's success (null) and error
  // shapes so the UI can show why nothing happened. The commentary also lands in
  // the instructor card via pendingMessage on the next broadcast.
  InstructorLayer.prototype._blocked = function (msg) {
    if (msg) this.pendingMessage = msg;
    var text = msg ? (msg[this.register] || msg.learning) : 'The Instructor has restricted this action for now.';
    // Chat-mode scenarios voice the gate denial in the transcript (in-character
    // supervisor line), deduped so repeated blocked clicks don't spam the log.
    if (msg && this.mode === 'scenario' && this.scenario && this.scenario.chat) {
      var last = this.chatLog[this.chatLog.length - 1];
      if (!last || last.learning !== (msg.learning || msg.industry)) {
        this._appendChat([{ speaker: msg.speaker || 'sup', learning: msg.learning, industry: msg.industry }], this._lastSimTime);
      }
    }
    return { type: 'blocked', code: 'GATED_BY_INSTRUCTOR', message: text };
  };

  // ================================================================ output (§7)
  InstructorLayer.prototype.getMessage = function () {
    return this.pendingMessage
      ? { message: this.pendingMessage[this.register] || null, message_register: this.register }
      : { message: null, message_register: this.register };
  };

  // The extended instructor block (Gameplay §5). Fixed shape: every key present,
  // null when inactive — free-play carries the same nulls the placeholder implied.
  InstructorLayer.prototype.getSnapshotBlock = function () {
    var base = this.getMessage();
    var f = this.follow;
    var st = (f && !f.done) ? f.proc.steps[f.idx] : null;
    // The ACTIVE checklist step, for the narrative block below (#670).
    var cklStep = (this.checklist && !this.checklist.complete)
      ? this.checklist.proc.steps[this.checklist.idx] : null;
    var cklStory = (cklStep && cklStep.story) ? cklStep.story : null;
    return {
      message: base.message,
      message_register: base.message_register,
      scenario_id: this.scenario ? this.scenario.id : null,
      current_beat_id: this.currentBeatId,
      // Is a beat currently GATING progress? (#439, spec §4.) The UI tiers its
      // interrupt on this: a routine message cues the collapsed card's badge, a step
      // that blocks the player has to reach them even with another panel open, or the
      // instruction is lost silently and the mission looks broken rather than gated.
      // A boolean, not the gate list: which actions are blocked is the layer's business
      // and is already enforced here — the UI only needs to know that it matters.
      gated: this.activeGates.length > 0,
      ui_policy: this.uiPolicy,
      highlight: this.mode === 'follow'
        ? (st && st.control ? { view: null, control_label: st.control, instrument_id: null } : null)
        : this.highlight,
      follow: f ? {
        procedure_id: f.procedure_id,
        step_index: f.idx,
        step_total: f.proc.steps.length,
        acc_met: f.accMetNow,
        graded_by: f.gradedBy,
        done: f.done,
        // Multi-check-off verdicts for the ACTIVE step ({met, obs, graded_by} per
        // entry, order-parallel to the step's `accs`), or null on single-acc steps.
        accs: f.accsState ? f.accsState.map(function (a) {
          return { met: a.met, obs: a.obs, graded_by: a.graded_by };
        }) : null,
      } : null,
      level_complete: this.levelComplete ? {
        title: this.levelComplete.title,
        outcome: this.levelComplete['outcome_' + this.register] || this.levelComplete.outcome,
        actions: this.levelComplete.actions,
      } : null,
      // Chat transcript (chat-mode scenarios only; null otherwise — fixed shape).
      // The log is passed by reference for per-broadcast economy; consumers
      // treat it as read-only. `rev` is the cheap change key.
      chat: (this.mode === 'scenario' && this.scenario && this.scenario.chat) ? {
        log: this.chatLog,
        rev: this._chatRev,
        interactions: this._interact,
      } : null,
      // Auto-checklist (Path 3). Step text is NOT duplicated here — the UI reads
      // it from the same RD.MANUAL_PROCEDURES artifact, like follow mode.
      checklist: this.checklist ? {
        procedure_id: this.checklist.procedure_id,
        profile_key: this.checklist.profile_key,
        step_index: this.checklist.idx,
        step_total: this.checklist.proc.steps.length,
        steps_done: this.checklist.done.slice(),
        done_by: this.checklist.doneBy.slice(),
        acc_met: this.checklist.accMetNow,
        graded_by: this.checklist.gradedBy,
        complete: this.checklist.complete,
        // #715 — whether the completion banner's `outcome` text is safe to show: re-graded
        // every tick off the leg's optional `outcome_guard` (see `_gradeOutcomeGuard`). null
        // while the checklist is still running (the question does not apply yet); true when
        // no guard is authored, so every leg but the one this fixed is unaffected.
        outcome_verified: this.checklist.complete ? (this.checklist.outcomeVerified !== false) : null,
        // #619 item 4 — the step is satisfied and is holding for the player to acknowledge.
        awaiting_ack: !!this.checklist.awaitingAck,
        // #694 — this step's own `pause` fired and the service has been asked to stop the
        // clock (or already has). Sticky per-step, like `awaitingAck`: ui/app.js watches for
        // this to rise and calls pauseSim('walkthrough'), since a service-level pause is a
        // plant fact, not a broadcast the UI can wait on (the clock stopping IS what ends
        // the broadcasts). Cleared with the step it belonged to in `_checklistCheckOff`.
        paused: !!this.checklist.paused,
        /* CAN "REWIND STEP" LAND? (#660 items 17-18). The button used to be drawn on
         * `step_index > 0` alone, which is a claim about the WALKTHROUGH when the thing it
         * depends on is the rewind RING — and the two come apart on a loaded save, which
         * clears the ring while the walkthrough's progress survives (measured 2026-09-08:
         * step_index 2 restored, checkpoints.length 0, the rewind refused with "no checkpoint
         * to rewind to" while the button sat lit). M5 fills this in from the ring itself. */
        rewind_ready: !!this._rewindReady,
        // Multi-check-off verdicts for the ACTIVE step (#244 item 8) — {met, obs,
        // graded_by} order-parallel to the step's `accs`; null on single-acc steps.
        accs: this.checklist.accsState ? this.checklist.accsState.map(function (a) {
          return { met: a.met, obs: a.obs, graded_by: a.graded_by };
        }) : null,
        /* THE LAST OUT-OF-TURN PRESS ON THIS STEP (#759) — `{ acc_index, blocked_by }`, both
         * indices into the step's own `accs`. `acc_index` is the row the press WOULD have
         * latched; `blocked_by` is the row that has to be met first, and is what the card
         * builds its sentence from. Null when nothing has been pressed out of turn.
         *
         * SUPPRESSED THE MOMENT THE BLOCKER LATCHES, here rather than by a second clear in the
         * runtime: the reason the note gives ("the counts are still rising") stops being true
         * at the same instant that row ticks, and re-deriving it from the live verdicts is the
         * only way the card cannot disagree with the grading — the same rule the ordered-row
         * muting already follows in ui/app.js. */
        out_of_turn: (function (c) {
          var o = c.outOfTurn, st8 = c.accsState;
          if (!o || !st8 || !st8[o.by] || st8[o.by].met) return null;
          return { acc_index: o.idx, blocked_by: o.by };
        })(this.checklist),
        // Precondition verdicts (#395): {met, obs, graded_by} order-parallel to
        // the procedure's `precond` array; null until first graded or when the
        // procedure authors none. Row text is NOT duplicated (same rule as steps).
        preconditions: this.checklist.precond
          ? this.checklist.precond.map(function (p) { return { met: p.met, obs: p.obs, graded_by: p.graded_by }; })
          : null,
        // Failure ids this step has fired behind the scenes (#670) — reset on every step
        // boundary, so it answers "what did THIS step break", not "what is broken".
        // `active_failures` remains the plant's own answer to the second question.
        injected: (this.checklist.injected || []).slice(),
        /* THE NARRATIVE BLOCK (#670) — the one place step CONTENT is duplicated into the
         * snapshot, and it is a deliberate exception to the rule two comments up. The renderer
         * reads `story` off the pool exactly as it reads `text`/`why`; this copy exists so a
         * gate, a headless probe or any non-pool consumer can see what the card is showing
         * without re-resolving the procedure artifact. ACTIVE STEP ONLY. */
        story: cklStory ? { clock: cklStory.clock || null, saw: cklStory.saw || null,
                            knew: cklStory.knew || null, did: cklStory.did || null } : null,
        crew: !!(cklStep && cklStep.crew),
      } : null,
    };
  };

  InstructorLayer.prototype.setRegister = function (value) { this.register = value; };
  // M5 → M6, written just before each snapshot assemble (#660 items 17-18). The rewind ring
  // is M5's; whether the walkthrough may offer "back one step" is a fact about that ring.
  InstructorLayer.prototype.setRewindReady = function (v) { this._rewindReady = !!v; };

  // ---------------------------------------------------- M5 consume-flags (no upward calls)
  // M5 polls these right after step(): layering stays snapshots-up/commands-down.
  InstructorLayer.prototype.consumeCheckpointRequest = function () {
    var r = this._checkpointRequested; this._checkpointRequested = false; return r;
  };
  InstructorLayer.prototype.consumeRewindRequest = function () {
    var r = this._rewindRequested; this._rewindRequested = null; return r;
  };
  InstructorLayer.prototype.consumeSpeedRequest = function () {
    var r = this._speedRequested; this._speedRequested = null; return r;
  };
  // #694 — a checklist step's fired event wants the clock stopped. One-shot like the
  // three above; the SERVICE decides how (simulation_service.js `_serviceInstructorRequests`
  // calls `this.stop()` directly — never through `_setSpeed`, which clamps 0 to 1).
  InstructorLayer.prototype.consumePauseRequest = function () {
    var r = this._pauseRequested; this._pauseRequested = false; return r;
  };
  // After a world-scope rewind sim time has moved backwards under a live scenario;
  // clamp the time anchors so time/delay triggers don't wait for time to re-elapse
  // past a future timestamp.
  InstructorLayer.prototype.rebaseTime = function (newSimTime) {
    if (this.scenarioStartTime !== null && this.scenarioStartTime > newSimTime) this.scenarioStartTime = newSimTime;
    if (this.lastBeatFireTime !== null && this.lastBeatFireTime > newSimTime) this.lastBeatFireTime = newSimTime;
  };

  // ============================================================ save/restore (§17)
  // Scenario progress only — the heavy state is the engine's (M5 §8). Content is
  // stored by id and re-resolved from the registries on restore.
  InstructorLayer.prototype.saveState = function () {
    return {
      register: this.register,
      mode: this.mode,
      scenario_id: this.scenario ? this.scenario.id : null,
      current_beat_id: this.currentBeatId,
      branch_watch_id: this.branchWatch ? this.branchWatch.id : null,
      fired_beats: Array.from(this.firedBeats),
      scenario_start_time: this.scenarioStartTime,
      last_beat_fire_time: this.lastBeatFireTime,
      active_gates: JSON.parse(JSON.stringify(this.activeGates)),
      pending_message: this.pendingMessage ? JSON.parse(JSON.stringify(this.pendingMessage)) : null,
      chat_log: this.chatLog.length ? JSON.parse(JSON.stringify(this.chatLog)) : null,
      chat_rev: this._chatRev,
      interact: JSON.parse(JSON.stringify(this._interact)),
      ui_policy: this.uiPolicy ? JSON.parse(JSON.stringify(this.uiPolicy)) : null,
      highlight: this.highlight ? JSON.parse(JSON.stringify(this.highlight)) : null,
      level_complete: this.levelComplete ? JSON.parse(JSON.stringify(this.levelComplete)) : null,
      // The operator-action memory is PROGRESS, not scratch (#142). An
      // `operator_action` beat fires because a matching command descended since
      // the last beat fired, and this list is the only record that it did — so
      // dropping it on save meant a player who performed the action and then
      // saved (or hit an auto-checkpoint, or rewound) came back with the beat
      // still armed and no way to satisfy it but to do the action AGAIN. On a
      // one-shot action there is no again, and the scenario softlocks.
      actions_since_beat: JSON.parse(JSON.stringify(this._actionsSinceBeat)),
      follow: this.follow ? {
        procedure_id: this.follow.procedure_id,
        profile_key: this.follow.profile_key,
        idx: this.follow.idx,
        cmdSeen: this.follow.cmdSeen, sawSeen: this.follow.sawSeen,
        // acc_streak is the count of consecutive evaluations the step's `acc`
        // predicate has held; the step advances at ACC_STABLE_N. Restoring it as
        // 0 silently rewound a partly-earned step.
        acc_streak: this.follow.accStreak,
        done: this.follow.done,
        // per-entry multi-check-off latches (#244 item 8): met flags only — obs/
        // graded_by are derived and regrade on the first tick after restore. A
        // cmd-kind latch (a plotted point) cannot re-earn itself after a load.
        accs_met: this.follow.accsState
          ? this.follow.accsState.map(function (a) { return !!a.met; }) : null,
      } : null,
      checklist: this.checklist ? {
        procedure_id: this.checklist.procedure_id,
        profile_key: this.checklist.profile_key,
        idx: this.checklist.idx,
        done: this.checklist.done.slice(),
        done_by: this.checklist.doneBy.slice(),
        cmdSeen: this.checklist.cmdSeen, sawSeen: this.checklist.sawSeen,
        acc_streak: this.checklist.accStreak,
        complete: this.checklist.complete,
        accs_met: this.checklist.accsState
          ? this.checklist.accsState.map(function (a) { return !!a.met; }) : null,
        /* #670 — the per-step-entry fired-set RIDES IN THE CHECKPOINT. A `scope:'full'` rewind
         * is a loadState of a saved checkpoint, so this is what makes "Rewind un-does the
         * injection and the step fires it again" true rather than an assumption. */
        fired: (this.checklist.fired || []).slice(),
        injected: (this.checklist.injected || []).slice(),
        /* #732 — the once-per-run precondition latch rides with them, for the same reason. The
         * REWIND button is a loadState of a checkpoint, so without this every rewind re-armed the
         * comment and the flicker came back one press at a time. Absent in an old save reads as
         * false, which is exactly the pre-#732 behaviour. */
        precond_said: !!this.checklist.precondSaid,
      } : null,
    };
  };

  InstructorLayer.prototype.loadState = function (state) {
    this._clear();
    this.register = (state && state.register != null) ? state.register : 'learning';
    if (!state) return;
    // Checklist restore is independent of mode — it normally lives in free play
    // (mode null). Content is re-resolved by id, like follow.
    if (state.checklist) {
      var cs = state.checklist;
      var cpool = (RD.MANUAL_PROCEDURES && cs.profile_key) ? RD.MANUAL_PROCEDURES[cs.profile_key] : null;
      var cproc = null;
      if (cpool) for (var ci = 0; ci < cpool.length; ci++) if (cpool[ci].id === cs.procedure_id) cproc = cpool[ci];
      if (cproc) {
        // acc_streak absent = a save written before #142; 0 is exactly what that
        // save used to restore as, so old saves keep their old behaviour.
        var cStreak = cs.acc_streak || 0;
        this.checklist = {
          proc: cproc, procedure_id: cs.procedure_id, profile_key: cs.profile_key,
          idx: cs.idx, done: (cs.done || []).slice(), doneBy: (cs.done_by || []).slice(),
          cmdSeen: !!cs.cmdSeen, sawSeen: !!cs.sawSeen,
          accStreak: cStreak, accMetNow: cStreak >= ACC_STABLE_N,
          gradedBy: null, complete: !!cs.complete,
          // restore the per-entry latches; streaks/obs regrade live (#244 item 8)
          accsState: cs.accs_met ? cs.accs_met.map(function (m) {
            return { streak: 0, met: !!m, obs: null, graded_by: null };
          }) : null,
          // Precondition VERDICTS are DERIVED state — never saved; the first step() tick
          // after a restore regrades them against the live plant.
          //
          // THE LATCH IS NOT DERIVED AND IS RESTORED (#732, quality pass 2026-09-12). The
          // comment above used to argue that re-raising is right because "a fresh session
          // deserves the warning again" — true of a file load, and WRONG of the path this
          // actually is most of the time: the walkthrough's own Rewind button goes through
          // loadState (simulation_service.js `_restoreCheckpoint`), so an undefined flag meant
          // every rewind re-armed the comment and handed the player the flicker back one press
          // at a time. A save written before this field restores false, i.e. unchanged.
          precond: null, precondMsg: false, precondSaid: !!cs.precond_said,
          // #670 — restored, not re-derived: a save written before this field is an empty set,
          // which is exactly what it used to behave as.
          fired: (cs.fired || []).slice(), injected: (cs.injected || []).slice(),
        };
      } else if (typeof console !== 'undefined') {
        console.warn('InstructorLayer.loadState: checklist procedure "' + cs.procedure_id + '" not found — dropped.');
      }
    }
    if (!state.mode) return;

    if (state.mode === 'scenario') {
      var sc = RD.SCENARIOS ? RD.SCENARIOS[state.scenario_id] : null;
      if (!sc) {
        if (typeof console !== 'undefined') console.warn('InstructorLayer.loadState: scenario "' + state.scenario_id + '" not in RD.SCENARIOS — degrading to free-play.');
        return;
      }
      this.mode = 'scenario';
      this.scenario = sc;
      this.currentBeatId = state.current_beat_id;
      this.firedBeats = new Set(state.fired_beats || []);
      this.branchWatch = null;
      if (state.branch_watch_id != null) {
        var beats = sc.beats || [];
        for (var i = 0; i < beats.length; i++) if (beats[i].id === state.branch_watch_id) this.branchWatch = beats[i];
      }
      this.scenarioStartTime = state.scenario_start_time;
      this.lastBeatFireTime = state.last_beat_fire_time;
      this.activeGates = state.active_gates || [];
      this.pendingMessage = state.pending_message || null;
      this.chatLog = state.chat_log || [];
      this._chatRev = state.chat_rev || 0;
      this._interact = state.interact || {};
      this.uiPolicy = state.ui_policy || null;
      this.highlight = state.highlight || null;
      this.levelComplete = state.level_complete || null;
      // Absent on pre-#142 saves; [] is what those restored as, so they are
      // unchanged — they simply keep the old forgetfulness.
      this._actionsSinceBeat = (state.actions_since_beat || []).slice();
    } else if (state.mode === 'follow') {
      var fs = state.follow;
      var pool = (RD.MANUAL_PROCEDURES && fs && fs.profile_key) ? RD.MANUAL_PROCEDURES[fs.profile_key] : null;
      var proc = null;
      if (pool) for (var j = 0; j < pool.length; j++) if (pool[j].id === fs.procedure_id) proc = pool[j];
      if (!proc) {
        if (typeof console !== 'undefined') console.warn('InstructorLayer.loadState: procedure "' + (fs && fs.procedure_id) + '" not found — degrading to free-play.');
        return;
      }
      this.mode = 'follow';
      var fStreak = fs.acc_streak || 0;   // absent on pre-#142 saves — see checklist above
      this.follow = {
        proc: proc, procedure_id: fs.procedure_id, profile_key: fs.profile_key,
        idx: fs.idx, cmdSeen: fs.cmdSeen, sawSeen: fs.sawSeen,
        accStreak: fStreak, accMetNow: fStreak >= ACC_STABLE_N,
        gradedBy: null, done: fs.done,
        // restore the per-entry latches; streaks/obs regrade live (#244 item 8)
        accsState: fs.accs_met ? fs.accs_met.map(function (m) {
          return { streak: 0, met: !!m, obs: null, graded_by: null };
        }) : null,
      };
      this.scenarioStartTime = state.scenario_start_time;
      this.lastBeatFireTime = state.last_beat_fire_time;
      this.pendingMessage = state.pending_message || null;
      this.levelComplete = state.level_complete || null;
    }
  };

  /* ---------------------------------------------- procedure relevance ordering (#443)
   * "SORT, DO NOT FILTER." A Mode 5 heatup is not wanted while at power in Mode 1 — but
   * hiding it breaks the mental model (a player who saw a checklist yesterday and cannot
   * find it today assumes a bug), and someone at power may legitimately want to read ahead
   * about an evolution they will do later. So inapplicable procedures are DEMOTED and
   * LABELLED WITH THEIR GATING CONDITION, which turns the demotion into instruction: a
   * beginner learns which mode gates which evolution just by scanning the list.
   *
   * IT LIVES HERE, NOT IN THE UI, because the preconditions it reads are already graded
   * here — instrument-first via PARAM_INSTRUMENT, per HR1 — and a second evaluator in
   * ui/app.js would be the two-samplers-of-one-truth shape that #432 was. It is a method
   * on the layer for the same reason: `_grade` is.
   *
   * "WARN, NEVER BLOCK" (OWNER RULING, 2026-08-06) is untouched. This orders a list; it
   * refuses nothing. Every procedure remains startable at any time, exactly as before.
   *
   * The priority order is the spec's, and the reason it is that order: an in-progress
   * checklist is what you are DOING, an abnormal plant is what the plant is ASKING FOR
   * (after a scram, post-trip actions outrank normal operations the way emergency
   * procedures supersede normal ones in a real control room), and only then does what is
   * merely possible come into it.
   */
  var COND_WORDS = { tavg_c: 'RCS temperature', pressure_mpa: 'RCS pressure',
                     power_pct: 'reactor power', boron_ppm: 'boron', mwe_output: 'generator output' };
  /* The gate string's VALUE, in the player's units — US-first per the house convention
   * (#244 item 7's sibling: 'near 286' told the owner nothing; 'near 547 °F' does). */
  function condValue(p, v) {
    if (p === 'tavg_c') return Math.round(v * 9 / 5 + 32) + ' °F';
    if (p === 'pressure_mpa') return Math.round(v * 145.038) + ' psi';
    if (p === 'power_pct') return v + ' %';
    if (p === 'boron_ppm') return v + ' ppm';
    if (p === 'mwe_output') return v + ' MWe';
    return String(v);
  }
  InstructorLayer.prototype.rankProcedures = function (snapshot, procs, activeId) {
    var self = this;
    var ts = (snapshot && snapshot.true_state) || {};
    var scrammed = !!(snapshot && snapshot.rps_state && snapshot.rps_state.scrammed);
    // "Abnormal" is the plant asking for something, not a severity score: a trip, a
    // blackout, or a live core-damage condition. Alarms alone are NOT abnormal enough —
    // a single caution on a healthy board would promote every emergency procedure.
    var abnormal = scrammed || !!ts.station_blackout || !!ts.core_damage || !!ts.hpi_active;
    /* WHICH abnormal procedure, not just "an abnormal one". Measured before this existed:
     * a plain reactor trip ranked ATWS, a seal leak and a rod withdrawal equal-first with
     * the post-trip actions — every emergency procedure at once, which is a list that has
     * stopped discriminating. The spec is specific: "after a scram, post-trip actions go
     * to the top".
     *
     * The map is deliberately SMALL and covers only conditions the plant reports
     * unambiguously in `true_state`. Guessing which procedure answers a condition from its
     * title would be a heuristic pretending to be knowledge; an authored `responds_to` on
     * each procedure is the real fix and is content work. What is here is the subset that
     * is certain, and anything unlisted keeps the ordinary abnormal rank. */
    var CALLED_FOR = {};
    if (scrammed) CALLED_FOR.pwr_post_trip = true;
    if (ts.station_blackout) CALLED_FOR.pwr_sbo = true;
    if (ts.hpi_active) CALLED_FOR.pwr_loca = true;
    return (procs || []).map(function (p) {
      var unmet = [];
      (p.precond || []).forEach(function (c) {
        var g = self._grade(snapshot, c);
        if (!g.met) unmet.push(c);
      });
      var emergency = p.category === 'emergency' || p.category === 'accident';
      var score = 0;
      if (activeId && p.id === activeId) score = 1000;                 // in progress pins to top
      else if (CALLED_FOR[p.id]) score = 700;                          // this condition, by name
      else if (abnormal && emergency) score = 500;                     // the plant is abnormal
      else if (!abnormal && emergency) score = 100;                    // available, not called for
      else if (!unmet.length) score = 300;                             // ready to run now
      else score = 50;                                                 // read-ahead
      return {
        id: p.id, category: p.category, title: p.title,
        score: score, ready: !unmet.length, emergency: emergency,
        // The gating condition, in the words a player can act on. This is the whole value
        // of demoting rather than hiding — it says WHY, and what would change it.
        gate: unmet.length ? unmet.map(function (c) {
          var w = COND_WORDS[c.p] || c.p;
          var op = c.op === '<' ? 'below' : c.op === '>' ? 'above' : c.op === '~' ? 'near' :
                   c.op === '<=' ? 'at or below' : c.op === '>=' ? 'at or above' : c.op;
          return 'Requires ' + w + ' ' + op + ' ' + condValue(c.p, c.v);
        }).join(' · ') : null
      };
    }).sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (a.title || '').localeCompare(b.title || '');   // stable, and alphabetical within a tier
    });
  };

  RD.InstructorLayer = InstructorLayer;

})(globalThis.RD || (globalThis.RD = {}));
