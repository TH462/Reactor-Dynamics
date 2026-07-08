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
    this._checkpointRequested = false;
    this._rewindRequested = null;     // { steps, scope } — beat-driven world rewind
    this._speedRequested = null;      // beat-driven time acceleration (number)
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
    if (this.mode === 'scenario') this._stepScenario(snapshot, simTime);
    else if (this.mode === 'follow') this._stepFollow(snapshot, simTime);
    this._continueRequested = false;    // a Continue click satisfies at most one pass
  };

  InstructorLayer.prototype._stepScenario = function (snapshot, simTime) {
    if (this.scenarioStartTime === null) this.scenarioStartTime = simTime;

    // Watching a decision beat's branches: first branch trigger to fire wins (§6).
    // A fired branch jumps to its goto beat, which is then evaluated in the SAME
    // pass below — the decision flows straight into its consequence beat.
    if (this.branchWatch) {
      var brs = this.branchWatch.branches || [];
      for (var i = 0; i < brs.length; i++) {
        if (this._evalTrigger(brs[i].trigger, snapshot, simTime)) {
          this._fireBranch(brs[i], simTime);
          break;
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

    if (st.acc) {
      var g = this._grade(snapshot, st.acc);
      f.gradedBy = g.graded_by;
      f.accStreak = g.met ? f.accStreak + 1 : 0;
      f.accMetNow = f.accStreak >= ACC_STABLE_N;
    } else {
      f.gradedBy = null;
      f.accMetNow = false;
    }

    var hasObligation = !!(st.cmd || st.acc || st.saw);
    if (!hasObligation) return;   // observation step — manual Next only
    if (st.cmd && !f.cmdSeen) return;
    if (st.saw && !f.sawSeen) return;
    if (st.acc && !f.accMetNow) return;
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
    this.pendingMessage = null;   // a new step retires the previous step's feedback
    if (autoAdvanced) this._checkpointRequested = true;   // rewind lands on step boundaries
  };

  InstructorLayer.prototype._completeFollow = function () {
    var f = this.follow;
    f.done = true;
    f.idx = f.proc.steps.length - 1;
    this.levelComplete = {
      title: f.proc.title,
      outcome: f.proc.outcome || 'Procedure complete.',
      outcome_learning: f.proc.outcome || 'Procedure complete.',
      outcome_industry: f.proc.outcome || 'Procedure complete.',
      actions: ['continue', 'retry'],
    };
  };

  // Grade one {p, op, v [,tol]} predicate. Instrument-first (HR1): if the param
  // has an instrument twin and the reading exists, grade what the operator sees;
  // otherwise the documented true_state fallback.
  InstructorLayer.prototype._grade = function (snapshot, pred) {
    var plant = (snapshot.metadata && snapshot.metadata.plant_id) || null;
    var map = plant ? PARAM_INSTRUMENT[plant] : null;
    var iid = map ? map[pred.p] : null;
    var v, by;
    if (iid && snapshot.instruments && snapshot.instruments[iid] != null) {
      v = snapshot.instruments[iid]; by = 'instrument';
    } else {
      v = snapshot.true_state ? snapshot.true_state[pred.p] : undefined; by = 'true_state';
    }
    return { met: this._predMet(v, pred), graded_by: by };
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
    if (command && command.action === 'follow_nav' && this.mode === 'follow') {
      return this._handleFollowNav(command);
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
      if (st && st.cmd && this._sameFamily(st.cmd.action, command.action) &&
          (st.cmd.action !== 'inject_failure' || st.cmd.failure_id === command.failure_id)) {
        this.follow.cmdSeen = true;
      }
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
                      f.cmdSeen = false; f.sawSeen = false; f.accStreak = 0; f.accMetNow = false; break;
      default: break;
    }
    return null;
  };

  InstructorLayer.prototype._sameFamily = function (a, b) {
    if (a === b) return true;
    return ROD_FAMILY.indexOf(a) !== -1 && ROD_FAMILY.indexOf(b) !== -1;
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
    return {
      message: base.message,
      message_register: base.message_register,
      scenario_id: this.scenario ? this.scenario.id : null,
      current_beat_id: this.currentBeatId,
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
      } : null,
      level_complete: this.levelComplete ? {
        title: this.levelComplete.title,
        outcome: this.levelComplete['outcome_' + this.register] || this.levelComplete.outcome,
        actions: this.levelComplete.actions,
      } : null,
    };
  };

  InstructorLayer.prototype.setRegister = function (value) { this.register = value; };

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
      ui_policy: this.uiPolicy ? JSON.parse(JSON.stringify(this.uiPolicy)) : null,
      highlight: this.highlight ? JSON.parse(JSON.stringify(this.highlight)) : null,
      level_complete: this.levelComplete ? JSON.parse(JSON.stringify(this.levelComplete)) : null,
      follow: this.follow ? {
        procedure_id: this.follow.procedure_id,
        profile_key: this.follow.profile_key,
        idx: this.follow.idx,
        cmdSeen: this.follow.cmdSeen, sawSeen: this.follow.sawSeen,
        done: this.follow.done,
      } : null,
    };
  };

  InstructorLayer.prototype.loadState = function (state) {
    this._clear();
    this.register = (state && state.register != null) ? state.register : 'learning';
    if (!state || !state.mode) return;

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
      this.uiPolicy = state.ui_policy || null;
      this.highlight = state.highlight || null;
      this.levelComplete = state.level_complete || null;
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
      this.follow = {
        proc: proc, procedure_id: fs.procedure_id, profile_key: fs.profile_key,
        idx: fs.idx, cmdSeen: fs.cmdSeen, sawSeen: fs.sawSeen,
        accStreak: 0, accMetNow: false, gradedBy: null, done: fs.done,
      };
      this.scenarioStartTime = state.scenario_start_time;
      this.lastBeatFireTime = state.last_beat_fire_time;
      this.pendingMessage = state.pending_message || null;
      this.levelComplete = state.level_complete || null;
    }
  };

  RD.InstructorLayer = InstructorLayer;

})(globalThis.RD || (globalThis.RD = {}));
