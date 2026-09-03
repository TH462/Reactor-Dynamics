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
     * own channel ids — NOT copied from pwr (its `boron_analyzer` is `boron` here, and
     * PWR2 has no SR/IR channels, so sr_counts_cps grades true_state, the documented
     * exception). Every id verified present in a live pwr2 broadcast by
     * test/run_checklist_pwr2.js, which reddens if one goes missing. */
    pwr2: {
      power_pct: 'power_range', pressure_mpa: 'primary_pressure', sg_level_pct: 'sg_level',
      pzr_level_pct: 'pzr_level', tavg_c: 'tavg', thot_c: 'thot', tcold_c: 'tcold',
      steam_pressure_mpa: 'steam_pressure', boron_ppm: 'boron_analyzer',
      startup_rate_dpm: 'startup_rate', pump_flow_pct: 'rcs_flow',
      mwe_output: 'mwe_output', fw_flow_normalized: 'fw_flow',
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
    // Checklist mode (Path 3): a procedure run as a PASSIVE checklist against the
    // live plant — no reset, no gating; steps auto-check off the instruments.
    this.checklist = null;
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
    this.checklist = {
      proc: proc,
      procedure_id: (meta && meta.procedure_id) || proc.id,
      profile_key: (meta && meta.profile_key) || null,
      idx: 0,
      done: proc.steps.map(function () { return false; }),
      doneBy: proc.steps.map(function () { return null; }),   // 'auto' | 'manual'
      cmdSeen: false, sawSeen: false, accStreak: 0, accMetNow: false,
      gradedBy: null, complete: false,
      // Precondition verdicts (#395) — evaluated on the first step() tick, never
      // here: load has no snapshot. null = no `precond` authored or not yet graded.
      precond: null,
      precondMsg: false,   // an unmet-precondition instructor comment is standing
      catchUp: true,       // first _stepChecklist tick walks past already-done steps (#607)
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
    this._checklistCheckOff('manual');
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
      var g = this._grade(snapshot, st.acc);
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

  // ============================================================ checklist (Path 3)
  // Passive sequential grading of the active (first unchecked) step. A step
  // auto-checks on: acc met (debounced, plus saw latched if authored) — the
  // outcome is the verification, the keystroke path doesn't matter; or, with no
  // acc, its saw latching; or, with neither, its command family being observed.
  // Pure observation steps only check by hand (checklistCheck).
  InstructorLayer.prototype._stepChecklist = function (snapshot) {
    var simTime = (snapshot && snapshot.metadata && snapshot.metadata.sim_time) || 0;
    var c = this.checklist;
    if (c.complete) return;

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
      if (anyUnmet && !c.precondMsg) {
        // One register-aware comment per unmet episode — the checklist banner
        // carries the row-by-row detail, this just points the operator at it.
        c.precondMsg = true;
        this.pendingMessage = {
          learning: 'Before you lean on this checklist: the plant does not match one or more of its prerequisites — the checklist panel lists each one with what the plant actually reads. Nothing is blocked; the steps simply may not verify until the plant is where the procedure assumes.',
          industry: 'CHECKLIST PRECONDITIONS NOT MET — see the checklist panel for the failed items.',
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
    if (c.stepAt == null) c.stepAt = simTime;   // when this step came up — the dwell's clock

    if (st.saw && !c.sawSeen && this._grade(snapshot, st.saw).met) c.sawSeen = true;

    if (st.accs && st.accs.length) {          // multi-check-off (#244 item 8)
      c.gradedBy = null;
      c.accMetNow = this._gradeAccs(c, st, snapshot);
    } else if (st.acc) {
      var g = this._grade(snapshot, st.acc);
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
    if (met) this._checklistCheckOff(hasAccs || st.acc || st.saw || st.cmd ? 'auto' : 'observed');
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
    c.done[c.idx] = true;
    c.doneBy[c.idx] = by;
    c.idx++;
    c.cmdSeen = false; c.sawSeen = false; c.accStreak = 0; c.accMetNow = false; c.gradedBy = null;
    c.accsState = null;                 // per-entry multi-check-off latches (#244 item 8)
    c.stepAt = null;                    // re-stamped on the next tick — see the dwell above
    if (c.idx >= c.proc.steps.length) c.complete = true;
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
  var CTL_PARAMS = { feed_coupled: 1, steam_dump_setpoint: 1 };
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
    if (CTL_PARAMS[p]) {
      var cv = snapshot && snapshot.control_state ? snapshot.control_state[p] : undefined;
      if (cv == null || (typeof cv === 'number' && isNaN(cv))) return undefined;
      return (typeof cv === 'boolean') ? (cv ? 1 : 0) : cv;
    }
    return snapshot && snapshot.true_state ? snapshot.true_state[p] : undefined;
  };

  InstructorLayer.prototype._grade = function (snapshot, pred) {
    if (ROD_PARAMS[pred.p]) {
      var rv = rodParam(snapshot, pred.p);
      return { met: this._predMet(rv, pred), graded_by: 'control_state', value: rv };
    }
    if (CTL_PARAMS[pred.p]) {
      var cv = snapshot && snapshot.control_state ? snapshot.control_state[pred.p] : undefined;
      if (typeof cv === 'boolean') cv = cv ? 1 : 0;
      return { met: this._predMet(cv, pred), graded_by: 'control_state', value: cv };
    }
    var plant = (snapshot.metadata && snapshot.metadata.plant_id) || null;
    var map = plant ? PARAM_INSTRUMENT[plant] : null;
    var iid = map ? map[pred.p] : null;
    var v, by;
    if (iid && snapshot.instruments && snapshot.instruments[iid] != null) {
      v = snapshot.instruments[iid]; by = 'instrument';
    } else {
      v = snapshot.true_state ? snapshot.true_state[pred.p] : undefined; by = 'true_state';
    }
    // `value` rides along for consumers that display the reading (#395's
    // precondition banner); met/graded_by callers are unaffected.
    return { met: this._predMet(v, pred), graded_by: by, value: v };
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
                      f.accsState = null; break;
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
   * artifact. `holder` is the runtime's own state object (this.checklist / this.follow). */
  InstructorLayer.prototype._ensureAccsState = function (holder, st) {
    if (!holder.accsState || holder.accsState.length !== st.accs.length) {
      holder.accsState = st.accs.map(function () {
        return { streak: 0, met: false, obs: null, graded_by: null };
      });
    }
    return holder.accsState;
  };
  InstructorLayer.prototype._gradeAccs = function (holder, st, snapshot) {
    var state = this._ensureAccsState(holder, st);
    var all = true;
    for (var i = 0; i < st.accs.length; i++) {
      var en = st.accs[i], ax = state[i];
      if (!ax.met && en && en.p) {
        var g = this._grade(snapshot, en);
        ax.obs = g.value; ax.graded_by = g.graded_by;
        ax.streak = g.met ? ax.streak + 1 : 0;
        if (ax.streak >= ACC_STABLE_N) ax.met = true;
      }
      if (!ax.met) all = false;               // cmd-kind entries latch in handleCommand
    }
    return all;
  };
  // The command half of the watch: latch any unmet cmd-kind entry the command satisfies.
  InstructorLayer.prototype._accsCmdWatch = function (holder, st, command) {
    if (!st || !st.accs || !st.accs.length) return;
    var state = this._ensureAccsState(holder, st);
    for (var i = 0; i < st.accs.length; i++) {
      var en = st.accs[i];
      if (en && en.cmd && !state[i].met &&
          this._cmdEvidence(typeof en.cmd === 'string' ? { action: en.cmd } : en.cmd, command)) {
        state[i].met = true;
      }
    }
  };

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
    if (stepCmd.action === 'set_trip_block') return stepCmd.trip_id === command.trip_id;
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
        // Multi-check-off verdicts for the ACTIVE step (#244 item 8) — {met, obs,
        // graded_by} order-parallel to the step's `accs`; null on single-acc steps.
        accs: this.checklist.accsState ? this.checklist.accsState.map(function (a) {
          return { met: a.met, obs: a.obs, graded_by: a.graded_by };
        }) : null,
        // Precondition verdicts (#395): {met, obs, graded_by} order-parallel to
        // the procedure's `precond` array; null until first graded or when the
        // procedure authors none. Row text is NOT duplicated (same rule as steps).
        preconditions: this.checklist.precond
          ? this.checklist.precond.map(function (p) { return { met: p.met, obs: p.obs, graded_by: p.graded_by }; })
          : null,
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
          // Precondition verdicts are DERIVED state — never saved; the first
          // step() tick after a restore regrades them against the live plant
          // (and re-raises the comment if rows are still unmet, which is right:
          // a fresh session deserves the warning again).
          precond: null, precondMsg: false,
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
