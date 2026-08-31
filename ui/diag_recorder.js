/* ui/diag_recorder.js — the session recorder behind the in-sim bug report.
 *
 * Records the plant so a report can be diagnosed after the fact: a sampled true-state
 * history, alarm transitions, scram edges, every issued command, and — assembled at
 * export — a full `service.saveState()`.
 *
 * A PLAIN GLOBAL SCRIPT (RD.DiagRecorder), not part of ui/app.js, for one reason: app.js
 * is browser-only and no Node runner can reach it, so nothing in `test/` had ever touched
 * this code. That is how #432 shipped. `test/run_diag_bundle.js` drives this file directly,
 * the same way seven runners already `require('../ui/manual_procedures.js')`.
 *
 * ------------------------------------------------------------------- WHAT #432 WAS
 * Sampling used to happen once per BROADCAST, so its resolution in SIM time was
 * `timeAcceleration × broadcastMs` — 1 Hz at 1×, but one sample per 180 s at 3600×, under
 * a manifest that said `sample_hz: 1` unconditionally. Measured on the owner's own report
 * (`msmjyei2-yav89rpu`): a `large_loca` at 3600× is TWO ROWS, 100 % power / 2235 psi
 * followed by 0 % / 56 psi, with the blowdown, the scram and the SI all inside the gap.
 *
 * The plant was never wrong — protection has run on a 0.1 s sim-time cadence at every
 * speed since #153. Only the recording was. And the strip chart had already been fixed for
 * exactly this on 2026-08-05: the service samples inside its step loop on a sim-time grid
 * and folds MIN/MAX over each bucket, so a three-second excursion leaves a mark instead of
 * falling between two samples. The recorder now rides that same seam.
 *
 * THE GRID IS AN EMIT RULE, NOT A CONSTANT TO KEEP IN STEP. Fine rows arrive at whatever
 * interval the service chose; this file emits one sample when `GRID_SEC` of sim has passed
 * since the last, folding everything between into the extremes. That makes the spacing
 * `max(GRID_SEC, service's fine grid)` automatically — 1 s at 1× (unchanged from the old
 * behaviour), 1 s at 600×, 6 s at 3600× — without this file knowing CHART_FINE_MAX or the
 * acceleration. Nothing to desynchronise.
 *
 * ---------------------------------------------------------------- WHY dv, NOT the chart's tv
 * The sampler's `tv` side is the chart's, and two of its series SCALE FOR DISPLAY
 * (`steam_flow`/`fw_flow` are `tru: t.steam_flow_normalized * 100`). Reading those columns
 * would silently change the bundle's units, so a tool comparing an old report against a new
 * one would compare 0.069 against 6.9. The sampler carries a third side, `dv`, packed over
 * FIELDS below in raw true-state units, and this file stays the authority on what a
 * recording contains.
 *
 * ------------------------------------------------------------------------- the manifest
 * `sample_hz: 1` is gone and is not replaced by another scalar. The grid MOVES with
 * acceleration inside a single session, so no single number can describe it; `sampling`
 * declares the floor and the source, and the per-row `t` carries what actually happened.
 * A reader that wants the rate subtracts two timestamps — a fact the bundle cannot lie
 * about, which is the whole complaint in #432.
 */
(function (G) {
  'use strict';
  var RD = G.RD = G.RD || {};

  // Per-plant true-state fields. Append-only in spirit: a reader keys off `timeseries.fields`,
  // so adding one is safe, but reordering breaks nothing only because the names ride along.
  var FIELDS = {
    pwr: ['power_pct', 'tavg_c', 'thot_c', 'tcold_c', 'pressure_mpa', 'pzr_level_pct', 'sg_level_pct', 'steam_flow_normalized', 'fw_flow_normalized', 'steam_pressure_mpa'],
    rbmk: ['power_pct', 'fuel_temp_c', 'graphite_temp_avg_c', 'void_fraction_avg', 'reactivity_pcm', 'xenon_pct_eq', 'steam_pressure_mpa', 'drum_level_pct', 'channel_flow_pct'],
    bwr: ['power_pct', 'fuel_temp_c', 'vessel_pressure_mpa', 'vessel_level_pct', 'core_void_fraction', 'recirc_flow_pct', 'decay_heat_pct']
  };

  var GRID_SEC = 1.0;      // never sample finer than this, however slowly the plant is run
  var MAX_SAMPLES = 14400; // 4 h at 1× · 24 h at 3600×, where the grid is 6 s
  var MAX_EVENTS = 5000;
  var MAX_COMMANDS = 2000;
  var EPS = 1e-9;

  function fieldsFor(plant) { return FIELDS[plant] || FIELDS.pwr; }

  /* Pack a true_state into the sampler's third side. Called from the fine sampler, which
   * runs up to CHART_SUB_MAX (240) times per broadcast — hence a typed array of the same
   * shape the other two sides use, so `foldExtremes` folds it with no special case. NaN is
   * "no reading", exactly as it is for the chart sides. */
  function pack(plant, trueState) {
    var F = fieldsFor(plant), out = new Float64Array(F.length);
    for (var i = 0; i < F.length; i++) {
      var x = trueState ? trueState[F[i]] : undefined;
      out[i] = (typeof x === 'number') ? x : NaN;
    }
    return out;
  }

  // ------------------------------------------------------------------ the recorder
  function Recorder(opts) {
    this._onEvent = (opts && opts.onEvent) || null;   // app.js hooks scram -> telemetry here
    this.rec = null;
  }

  Recorder.prototype.active = function () { return !!this.rec; };

  /* Start a new recording. A recording is per PLANT — a plant change resets, which is why
   * the field list is fixed here rather than read at export. */
  Recorder.prototype.reset = function (reason, meta, t, plant) {
    t = t || 0;
    var F = fieldsFor(plant);
    this.rec = {
      plant: plant, reason: reason, meta: meta || null,
      startSim: t, lastT: t,
      fields: F,
      // Columnar, not an array of row objects. Measured on real report data (jittered so
      // columns do not repeat): at the 14,400-row ring, gzipped, 720 KB columnar against
      // 1218 KB as rows — and the Worker's cap is 2 MB before `events` and `snapshot_end`
      // are added. Repeating ten property NAMES per row is what costs; the same lesson the
      // strip chart's buffer learned when 40 series cost 39.5 MB as properties.
      t: [], accel: [], v: [], lo: [], hi: [],
      events: [], commands: [],
      lastAlarms: null, lastScrammed: false,
      // Emit state: `nextT` is the sim time the next sample is due at; `pend` folds
      // everything since the last emit so a short excursion survives a coarse grid.
      nextT: t, pend: null, pendT: t,
      sawFine: false, sawBroadcast: false
    };
    for (var i = 0; i < F.length; i++) { this.rec.v.push([]); this.rec.lo.push([]); this.rec.hi.push([]); }
    this.event(t, 'session_start', { reason: reason, meta: meta || null });
    return this;
  };

  Recorder.prototype.event = function (t, type, detail) {
    var r = this.rec; if (!r) return;
    r.events.push({ t: t, type: type, detail: detail });
    if (r.events.length > MAX_EVENTS) r.events.shift();
    if (this._onEvent) this._onEvent(t, type, detail);
  };

  Recorder.prototype.command = function (t, command, blocked, error) {
    var r = this.rec; if (!r) return;
    r.commands.push({ t: t, command: command, blocked: !!blocked, error: !!error });
    if (r.commands.length > MAX_COMMANDS) r.commands.shift();
  };

  // ---- sampling -------------------------------------------------------------------
  // Fold one reading into the pending bucket. `v` may be a Float64Array from the sampler's
  // `dv` side or a plain array built from a broadcast snapshot; both index by field.
  function fold(r, v, lo, hi) {
    if (!r.pend) { r.pend = { v: [], lo: [], hi: [] }; for (var j = 0; j < r.fields.length; j++) { r.pend.v.push(null); r.pend.lo.push(null); r.pend.hi.push(null); } }
    var p = r.pend;
    for (var i = 0; i < r.fields.length; i++) {
      var x = v ? v[i] : NaN;
      if (x == null || !isFinite(x)) continue;         // no reading on this field
      p.v[i] = x;                                      // the LAST value, as the old row was
      var a = (lo && isFinite(lo[i])) ? lo[i] : x;
      var b = (hi && isFinite(hi[i])) ? hi[i] : x;
      // Negated comparisons: `p.lo[i]` starts null and every comparison against it must
      // seed rather than skip. Same shape as foldSide() in simulation_service.js.
      if (p.lo[i] == null || a < p.lo[i]) p.lo[i] = a;
      if (p.hi[i] == null || b > p.hi[i]) p.hi[i] = b;
    }
  }

  function emit(r, t, accel) {
    if (!r.pend) return;
    r.t.push(t); r.accel.push(accel);
    for (var i = 0; i < r.fields.length; i++) {
      r.v[i].push(r.pend.v[i]); r.lo[i].push(r.pend.lo[i]); r.hi[i].push(r.pend.hi[i]);
    }
    r.pend = null;
    if (r.t.length > MAX_SAMPLES) {
      r.t.shift(); r.accel.shift();
      for (var k = 0; k < r.fields.length; k++) { r.v[k].shift(); r.lo[k].shift(); r.hi[k].shift(); }
    }
  }

  /* One broadcast. `fineRows` is what the service accrued inside its step loop — the same
   * rows the strip chart draws — each carrying `dv` plus the `dlo`/`dhi` extremes folded
   * over its own sub-interval. Passing none is not an error: a headless harness or a plant
   * with no chart profile registers no sampler, and the recorder falls back to sampling the
   * broadcast snapshot, which is exactly what it did before #432. The bundle SAYS which
   * happened rather than leaving the reader to infer it from the spacing. */
  Recorder.prototype.tick = function (s, fineRows) {
    var r = this.rec;
    if (!r || !s || !s.metadata) return;
    var t = s.metadata.sim_time, accel = s.metadata.time_acceleration || 1;

    if (t < r.lastT - 0.001) this._rewind(t);
    r.lastT = t;

    this._alarms(s, t);

    var i;
    if (fineRows && fineRows.length) {
      r.sawFine = true;
      for (i = 0; i < fineRows.length; i++) {
        var f = fineRows[i];
        if (!f || f.t == null) continue;
        fold(r, f.dv, f.dlo, f.dhi);
        if (f.t >= r.nextT - EPS) { emit(r, f.t, accel); r.nextT = f.t + GRID_SEC; }
      }
    }
    // The broadcast instant itself. It is folded in every time — it costs one reading and
    // it is the only sample there is when no fine rows arrived.
    fold(r, pack(r.plant, s.true_state), null, null);
    if (!(fineRows && fineRows.length)) r.sawBroadcast = true;
    if (t >= r.nextT - EPS || !r.t.length) { emit(r, t, accel); r.nextT = t + GRID_SEC; }
  };

  Recorder.prototype._alarms = function (s, t) {
    var r = this.rec, byId = {}, i;
    for (i = 0; i < s.alarms.length; i++) {
      var a = s.alarms[i]; byId[a.id] = a.state;
      var was = r.lastAlarms ? r.lastAlarms[a.id] : a.state;
      // First pass (lastAlarms === null): capture only the NON-CLEAR starting state — an
      // already-alarmed panel is information, an all-clear one is inferable. The old rule
      // emitted every alarm as a clear→clear non-transition, 47 noise rows of the 48
      // events in each 2026-08-21 bundle (#504). Later passes log transitions only.
      var firstPass = r.lastAlarms === null;
      if (firstPass ? a.state !== 'clear' : was !== a.state) this.event(t, 'alarm', { id: a.id, state: a.state, was: was });
    }
    r.lastAlarms = byId;
    var sc = !!(s.rps_state && s.rps_state.scrammed);
    if (sc && !r.lastScrammed) {
      var reason = (s.rps_state.last_trip_reason || 'unknown');
      this.event(t, 'scram', { trip_reason: reason });
      this.event(t, 'trip_reason', { reason: reason });
    }
    r.lastScrammed = sc;
  };

  // Rewind / replay: drop the recorded future. The service clears its own fine buffer on the
  // same event, so no stale sub-sample splices in behind this.
  Recorder.prototype._rewind = function (t) {
    var r = this.rec, keep = function (e) { return e.t <= t + 0.001; };
    var n = 0;
    while (n < r.t.length && r.t[n] <= t + 0.001) n++;
    r.t.length = n; r.accel.length = n;
    for (var i = 0; i < r.fields.length; i++) { r.v[i].length = n; r.lo[i].length = n; r.hi[i].length = n; }
    r.events = r.events.filter(keep); r.commands = r.commands.filter(keep);
    r.pend = null; r.nextT = t;
    this.event(t, 'time_rewind', { to: t });
  };

  // ---- export ---------------------------------------------------------------------
  Recorder.prototype.readout = function () {
    var r = this.rec;
    return r ? { plant: r.plant, reason: r.reason, t: r.lastT || 0, samples: r.t.length,
                 events: r.events.length, commands: r.commands.length } : null;
  };

  /* Assemble the bundle. `ctx` carries everything that lives outside this file — the
   * snapshot, the ids the UI knows, the service seed, the perf summary and saveState() —
   * so the SCHEMA is here (and gateable) while the reaching-around stays in app.js. */
  Recorder.prototype.build = function (ctx) {
    var r = this.rec;
    if (!r) return null;
    ctx = ctx || {};
    var s = ctx.snapshot, t = (s && s.metadata) ? s.metadata.sim_time : r.lastT;
    // Final partial-grid sample, as the old export did — but ONLY if the export instant is
    // actually past the last recorded row. Emitting it unconditionally appends a duplicate
    // timestamp whenever a grid row landed exactly on the broadcast (every export at 3600×,
    // where the grid and the broadcast share instants), and a zero dt reads to any consumer
    // as an infinite sample rate.
    if (s && (!r.t.length || t > r.t[r.t.length - 1] + EPS)) {
      fold(r, pack(r.plant, s.true_state), null, null);
      emit(r, t, (s.metadata.time_acceleration || 1));
    }
    var bundle = {
      schema_version: '1.1', kind: 'reactor_dynamics_diagnosis',
      exported_at: ctx.exported_at || new Date().toISOString(),
      manifest: {
        plant_id: r.plant, design_version: ctx.design_version || null, engine_key: ctx.engine_key || null,
        initial_state: ctx.initial_state || null,
        scenario_id: ctx.scenario_id || null,
        follow_procedure_id: ctx.follow_procedure_id || null,
        session_start_reason: r.reason, session_start_meta: r.meta,
        session_start_sim_time: r.startSim, exported_sim_time: t,
        seed: ctx.seed,
        // NOT a rate. `grid_s` is the FLOOR — the true spacing is whatever the service's
        // fine grid gave, and only the per-row `t` knows it. See the header.
        sampling: {
          grid_s: GRID_SEC, extremes: true,
          source: r.sawFine ? (r.sawBroadcast ? 'mixed' : 'fine') : 'broadcast'
        }
      },
      timeseries: { fields: r.fields, t: r.t, accel: r.accel, v: r.v, lo: r.lo, hi: r.hi },
      events: r.events, commands: r.commands,
      performance: ctx.performance || null,
      snapshot_end: ctx.snapshot_end || null
    };
    if (ctx.notes) bundle.notes = ctx.notes;
    return bundle;
  };

  RD.DiagRecorder = {
    create: function (opts) { return new Recorder(opts); },
    FIELDS: FIELDS,
    fieldsFor: fieldsFor,
    pack: pack,
    GRID_SEC: GRID_SEC,
    MAX_SAMPLES: MAX_SAMPLES
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
