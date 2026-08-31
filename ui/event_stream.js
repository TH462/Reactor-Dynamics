/* ui/event_stream.js — RD.Events, the plant's sequence-of-events stream (#437).
 *
 * ONE stream of discrete occurrences — scram, turbine trip, safety injection, mode
 * change, PORV/MSIV position, pump starts and stops, operator commands — with three
 * consumers that would otherwise each grow a private copy:
 *
 *   #442  the chart's SOE ribbon (tier decides how a marker draws)
 *   #443  checklist relevance ordering (recompute on events, not continuously)
 *   #441  mode annotations on the lanes
 *
 * ------------------------------------------------------------------ WHERE EDGES COME FROM
 * At the SERVICE/UI seam, not inside the engines (OWNER SELECTION 2026-08-10, from the
 * options presented: "Events emitted at service/UI layer"). Every field watched below is
 * already in `true_state`, so an engine-side emitter would add a second way to say the
 * same thing — and touching the physics files to say it risks the determinism gates for
 * no gain. The rule this keeps: an event fires when the PLANT's own state changed, not
 * when a UI happened to notice, which is why `observe()` is driven from the same
 * synchronous per-broadcast subscriber as the recorder rather than from a paint.
 *
 * ------------------------------------------------------------------------------ ACTOR
 * `actor` is not inferred, it is known at the call site: `command()` is the operator
 * acting, `observe()` and `fromRecorder()` are the plant responding. That distinction is
 * the most valuable thing the timeline carries — a student reads their own hand in the
 * record — and inferring it downstream from "did a command land near this event" would
 * be a guess dressed as a fact.
 *
 * ------------------------------------------------------------------------ THE RECORDER
 * The bug-report recorder (ui/diag_recorder.js) already detected alarm and scram edges
 * before this file existed. It still does, and feeds them here through its `onEvent`
 * hook — ONE detector, two consumers. Duplicating that detection here is exactly the
 * failure #432 was: two samplers of the same truth, disagreeing quietly.
 */
(function (G) {
  'use strict';
  var RD = G.RD = G.RD || {};

  var MAX_EVENTS = 4000;      // ~ the recorder's ring; a long session with a busy trip cascade
  var EPS = 1e-9;

  /* TIERS (spec §8):
   *   1  plant-defining — full-height line across every lane
   *   2  component state — a tick in the event ribbon
   *   3  minor — off by default, filterable on
   * Set HERE, at emission, never inferred downstream: a consumer that has to classify is
   * a consumer that will classify differently from the next one. */
  var TIER = { PLANT: 1, COMPONENT: 2, MINOR: 3 };

  /* Boolean true_state channels worth an event, per plant. `ref` is a
   * CONTROL_LABEL_MAP label (ui/diagram/board/pwr_board_wiring.js) so the highlight bus
   * (#444) can light the component from a marker with no second mapping table; a label
   * that does not resolve simply fails to highlight, it never throws.
   *
   * `on`/`off` are the event names for the rising and falling edge. A null side means
   * that edge is not an event — an MSIV re-opening after an isolation is not the story,
   * the isolation is. */
  var WATCH = {
    pwr: [
      { f: 'turbine_tripped', tier: TIER.PLANT, ref: 'Turbine Load', on: 'turbine_trip', off: null },
      { f: 'hpi_active', tier: TIER.PLANT, ref: 'HPI', on: 'safety_injection', off: null },
      { f: 'station_blackout', tier: TIER.PLANT, ref: null, on: 'station_blackout', off: 'ac_restored' },
      { f: 'accumulators_discharging', tier: TIER.PLANT, ref: 'Accumulator valve', on: 'accumulator_discharge', off: null },
      { f: 'ctmt_h2_burned', tier: TIER.PLANT, ref: null, on: 'hydrogen_burn', off: null },
      { f: 'porv_open', tier: TIER.COMPONENT, ref: 'Relief Valve (PORV)', on: 'porv_open', off: 'porv_shut' },
      // NO `safety_relief_active` row, though it is the obvious neighbour of the PORV
      // above: it is an INSTRUMENT (`ins:` with no `tru:` — see the relief_act series in
      // ui/app.js), not a true-state field, and this stream watches the plant rather than
      // what the panel says about it. run_events TR-7 caught the attempt.
      { f: 'msiv_open', tier: TIER.COMPONENT, ref: 'MSIV', on: null, off: 'msiv_shut' },
      { f: 'pump_running', tier: TIER.COMPONENT, ref: 'Reactor Coolant Pumps (RCP)', on: 'rcp_start', off: 'rcp_stop' },
      { f: 'afw_pump_running', tier: TIER.COMPONENT, ref: 'AFW', on: 'afw_start', off: 'afw_stop' },
      { f: 'rhr_active', tier: TIER.COMPONENT, ref: 'Residual Heat Removal (RHR)', on: 'rhr_in_service', off: 'rhr_secured' },
      { f: 'ctmt_spray_active', tier: TIER.COMPONENT, ref: null, on: 'ctmt_spray_start', off: 'ctmt_spray_stop' },
      { f: 'condenser_cooling_available', tier: TIER.COMPONENT, ref: 'Steam Dump', on: null, off: 'condenser_lost' }
    ]
  };
  function watchFor(plant) { return WATCH[plant] || []; }

  /* Commands worth a marker, and at which tier. Anything not named here is still recorded
   * by the bug-report recorder — this table decides only what earns a place on a timeline
   * a human reads. A setpoint nudge is tier 3 for the reason the spec gives: at TMI the
   * PORV cycled repeatedly, and a chart that draws every minor action is a picket fence. */
  var CMD_TIER = {
    scram: TIER.PLANT, trip_reactor: TIER.PLANT, reset_trip: TIER.PLANT,
    set_rcp: TIER.COMPONENT, set_porv: TIER.COMPONENT, set_msiv: TIER.COMPONENT,
    set_rhr_valve: TIER.COMPONENT, set_hpi: TIER.COMPONENT, set_afw: TIER.COMPONENT,
    start_scenario: TIER.COMPONENT, start_follow: TIER.COMPONENT, start_checklist: TIER.COMPONENT,
    inject_failure: TIER.COMPONENT, clear_failure: TIER.COMPONENT
  };
  var CMD_REF = {
    scram: 'SCRAM', trip_reactor: 'SCRAM', reset_trip: 'SCRAM',
    set_rcp: 'Reactor Coolant Pumps (RCP)', set_porv: 'Relief Valve (PORV)', set_msiv: 'MSIV',
    set_rhr_valve: 'Residual Heat Removal (RHR)', set_hpi: 'HPI', set_afw: 'AFW',
    rod_nudge: 'Control Bank', set_rod_speed: 'Rod Speed', set_boron: 'Boron',
    set_load: 'Turbine Load', set_steam_dump_setpoint: 'Steam Dump', set_pressure_setpoint: 'Pressure SP'
  };

  function Stream() { this.reset(0, 'pwr'); }

  Stream.prototype.reset = function (t, plant) {
    this.plant = plant || 'pwr';
    this.events = [];
    this.last = null;           // previous boolean readings, by field
    this.lastMode = null;
    this.alarmOn = {};          // alarm ids this stream has seen annunciate — see fromRecorder
    this.t0 = t || 0;
    return this;
  };

  Stream.prototype.push = function (t, type, tier, ref, actor, detail) {
    var ev = { t: t, type: type, tier: tier || TIER.MINOR, ref: ref || null,
               actor: actor || 'plant', detail: detail || null };
    this.events.push(ev);
    if (this.events.length > MAX_EVENTS) this.events.shift();
    return ev;
  };

  /* One broadcast's worth of plant state. Cheap by construction — a dozen boolean
   * comparisons — because it runs on the same synchronous path as the recorder's tick.
   *
   * FIRST CALL SEEDS, IT DOES NOT EMIT. Otherwise every session opens with a burst of
   * "RCP start / MSIV open" for a plant that was already running when we started
   * looking, and a timeline whose first ten marks are artefacts of the observer teaches
   * the wrong thing about all the rest. */
  Stream.prototype.observe = function (s) {
    if (!s || !s.true_state || !s.metadata) return;
    var t = s.metadata.sim_time, ts = s.true_state;
    var list = watchFor(this.plant), i, w, now;
    var seed = (this.last === null);
    var cur = {};
    for (i = 0; i < list.length; i++) {
      w = list[i];
      now = !!ts[w.f];
      cur[w.f] = now;
      if (!seed && now !== this.last[w.f]) {
        var type = now ? w.on : w.off;
        if (type) this.push(t, type, w.tier, w.ref, 'plant', null);
      }
    }
    this.last = cur;
    // Mode change is the one tier-1 event with no boolean behind it (#437): plant_mode
    // is a VALUE, and nothing in the engine announces crossing one. Seeded like the rest.
    var mode = ts.plant_mode;
    if (mode != null) {
      if (this.lastMode !== null && mode !== this.lastMode) {
        this.push(t, 'mode_change', TIER.PLANT, null, 'plant', { from: this.lastMode, to: mode });
      }
      this.lastMode = mode;
    }
  };

  /* An operator command that landed. Blocked commands are NOT events: the plant did not
   * change, and a timeline that marks refused actions reads as though they happened. */
  Stream.prototype.command = function (t, c, blocked) {
    if (!c || blocked) return null;
    var a = c.action;
    var tier = CMD_TIER[a] || TIER.MINOR;
    return this.push(t, 'cmd_' + a, tier, CMD_REF[a] || null, 'operator', { action: a });
  };

  /* Edges the recorder already owns (alarm transitions, scram, trip cause). Wired through
   * its `onEvent` hook so there is exactly one detector — see the header. `session_start`
   * is dropped: it describes the recording, not the plant. */
  Stream.prototype.fromRecorder = function (t, type, detail) {
    if (type === 'session_start') return null;
    if (type === 'time_rewind') { this.rewind(t); return null; }
    if (type === 'trip_reason') return null;                       // rides on the scram event
    if (type === 'scram') return this.push(t, 'scram', TIER.PLANT, 'SCRAM', 'plant', detail);
    if (type === 'alarm') {
      var id = detail && detail.id;
      var on = detail && detail.state && detail.state !== 'clear' && detail.state !== 'normal';
      if (on) { this.alarmOn[id] = true; return this.push(t, 'alarm', TIER.COMPONENT, null, 'plant', detail); }
      // A CLEAR for an alarm this stream never saw annunciate is not an event.
      //
      // Measured (run_events TR-1, before this guard): a steady 20 s at hot full power
      // produced 46 events, every one of them `alarm_clear` at t≈0 — the recorder's own
      // first pass, which then emitted a row for EVERY alarm (`r.lastAlarms === null` in
      // ui/diag_recorder.js). The recorder now suppresses clear→clear rows itself (#504,
      // its first pass captures only the non-clear starting state), so this guard's
      // remaining work is the genuine case: a clear for an alarm that annunciated before
      // this stream attached. Same trap as this file's own `seed` guard, on the other
      // side of the hook.
      if (!this.alarmOn[id]) return null;
      delete this.alarmOn[id];
      // Tier 3: the annunciator is where alarms are watched, and a ribbon that draws every
      // clear buries the trip that caused them.
      return this.push(t, 'alarm_clear', TIER.MINOR, null, 'plant', detail);
    }
    return this.push(t, type, TIER.MINOR, null, 'plant', detail);
  };

  /* Drop the recorded future, and forget the edge state with it — after a rewind the
   * plant's booleans are whatever they were THEN, and comparing them against readings
   * from a future that no longer happened invents an edge. Re-seeding is the point. */
  Stream.prototype.rewind = function (t) {
    this.events = this.events.filter(function (e) { return e.t <= t + 0.001; });
    this.last = null;
    this.lastMode = null;
    // Rebuild "which alarms are up" from what SURVIVED the truncation, rather than
    // clearing it: an alarm that annunciated before the rewind point is still up after
    // it, and forgetting that would swallow its clear.
    this.alarmOn = {};
    for (var i = 0; i < this.events.length; i++) {
      var e = this.events[i], id = e.detail && e.detail.id;
      if (!id) continue;
      if (e.type === 'alarm') this.alarmOn[id] = true;
      else if (e.type === 'alarm_clear') delete this.alarmOn[id];
    }
  };

  Stream.prototype.all = function () { return this.events; };
  Stream.prototype.since = function (t) {
    var out = [], i;
    for (i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].t < t - EPS) break;
      out.push(this.events[i]);
    }
    return out.reverse();
  };
  Stream.prototype.inWindow = function (t0, t1) {
    return this.events.filter(function (e) { return e.t >= t0 - EPS && e.t <= t1 + EPS; });
  };
  Stream.prototype.count = function () { return this.events.length; };

  RD.Events = new Stream();
  RD.Events.TIER = TIER;
  RD.Events.create = function () { return new Stream(); };
  RD.Events.WATCH = WATCH;
  RD.Events.CMD_TIER = CMD_TIER;
  RD.Events.CMD_REF = CMD_REF;
  RD.Events.MAX_EVENTS = MAX_EVENTS;
}(typeof globalThis !== 'undefined' ? globalThis : this));
