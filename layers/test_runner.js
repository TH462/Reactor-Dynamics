/*
 * test_runner.js — M7, the Test Runner Layer (dev-only).
 *
 * A synthetic operator that drives the ASSEMBLED stack through the same command
 * interface the UI uses (the Simulation Service, M5) and reads the same snapshots
 * the UI receives, asserting INTEGRATION correctness: the snapshot is well-shaped,
 * instruments differ from truth in the right ways, trips/alarms read instruments
 * not truth (HR1 — the highest-value checks), commands route and intercept
 * correctly, the alarm lifecycle works, and each plant's config is internally
 * consistent.
 *
 * It owns WIRING, not physics — the engine scenario tests (M1 §14 etc.) own
 * physics, and the accident sequences are NOT re-run here (CONTEXT §9, M7 §2/§4).
 * Every assertion is made against the snapshot and the command interface; config
 * data is read only for the §3.6 consistency checks. Excluded from production
 * builds. Attaches RD.TestRunner.
 */
;(function (RD) {
  'use strict';

  function approx(a, b, tol) { return Math.abs(a - b) <= tol; }

  function TestRunner(service) {
    this.service = service;
  }

  // ---- driving helpers (command interface + broadcast snapshots only) --------
  TestRunner.prototype._reset = function (plant, init, design) {
    return this.service.handleCommand({ action: 'reset', plant_id: plant, initial_state: init, design_version: design || null });
  };
  TestRunner.prototype._cmd = function (c) { return this.service.handleCommand(c); };
  TestRunner.prototype._step = function (cycles) { return this.service.advanceCycles(cycles || 1); };
  TestRunner.prototype._runSeconds = function (sec) {
    var target = this.service.simTime + sec, snap = null, guard = 0;
    while (this.service.simTime < target && guard++ < 100000) snap = this.service.advanceCycles(1);
    return snap;
  };
  // Config data (sanctioned for §3.6): protection config from M4, instrument specs from the engine.
  TestRunner.prototype._protConfig = function () { return this.service.layer.config; };
  TestRunner.prototype._instrConfig = function () { return this.service.engine.cfg.instruments; };

  // Build the plant's full instrument-id vocabulary (measured + derived + status).
  TestRunner.prototype._instrumentIds = function () {
    var spec = this._instrConfig(), ids = {};
    for (var k in spec) {
      if (k === 'status') { for (var i = 0; i < spec.status.length; i++) ids[spec.status[i]] = true; }
      else ids[k] = true;
    }
    return ids;
  };

  // ====================================================================== suites
  // Each suite(emit) runs its checks; emit(check, passed, expected, observed, fix_hint).
  TestRunner.prototype.SUITES = ['data_contract', 'instrument_vs_truth', 'protection_boundary',
    'command_flow', 'alarm_behavior', 'config_consistency'];

  // 3.1 — the data contract: snapshot complete and well-shaped (HR4).
  TestRunner.prototype.data_contract = function (emit) {
    this._reset('pwr', 'hot_full_power');
    var s = this._step(1);
    var top = ['type', 'schema_version', 'metadata', 'true_state', 'instruments', 'control_state', 'rps_state', 'alarms', 'active_failures', 'instructor'];
    emit('all top-level sections present', top.every(function (k) { return k in s; }), top.join(','), Object.keys(s).join(','), 'M5 assembleSnapshot is dropping a section');
    var md = ['sim_time', 'running', 'time_acceleration', 'wall_time', 'plant_id', 'design_version'];
    emit('metadata complete', md.every(function (k) { return k in s.metadata; }), md.join(','), Object.keys(s.metadata).join(','), 'M5 metadata assembly');

    var ts = ['power_pct', 'tavg_c', 'thot_c', 'tcold_c', 'pressure_mpa', 'pzr_level_pct', 'sg_level_pct', 'core_inventory_pct', 'fuel_temp_c', 'porv_open', 'scrammed', 'melted'];
    var missTs = ts.filter(function (k) { return !(k in s.true_state); });
    emit('true_state carries the PWR §6.3 fields', missTs.length === 0, 'none missing', missTs.join(',') || 'none', 'engine.getTrueState missing fields');

    var ins = ['power_range', 'tavg', 'thot', 'tcold', 'primary_pressure', 'pzr_level', 'sg_level', 'subcooling_margin', 'porv_indicator'];
    var missIns = ins.filter(function (k) { return !(k in s.instruments); });
    emit('instruments carry the PWR §8.8 ids (incl. derived)', missIns.length === 0, 'none missing', missIns.join(',') || 'none', 'engine.getInstruments / instrument model');

    emit('control_state has rod_groups[] + porv_demand', Array.isArray(s.control_state.rod_groups) && 'porv_demand' in s.control_state, 'rod_groups[], porv_demand', typeof s.control_state.rod_groups, 'engine.getControlState');
    emit('rps_state shaped {scrammed,last_trip_reason}', typeof s.rps_state.scrammed === 'boolean' && 'last_trip_reason' in s.rps_state, 'bool + key', JSON.stringify(s.rps_state), 'M4.getRpsState');
    var alarmOk = Array.isArray(s.alarms) && s.alarms.every(function (a) { return a.id && a.state && a.priority && a.panel && 'tile_label' in a; });
    emit('alarms[] each {id,state,priority,panel,tile_label}', alarmOk, 'all well-shaped', s.alarms.length + ' alarms', 'M4.getAlarms');
    emit('active_failures is an array', Array.isArray(s.active_failures), 'array', typeof s.active_failures, 'M4.getActiveFailures');
    emit('instructor block {message,message_register}', 'message' in s.instructor && 'message_register' in s.instructor, 'both keys', JSON.stringify(s.instructor), 'instructor.getMessage');
    emit('types: power_pct number, scrammed boolean', typeof s.true_state.power_pct === 'number' && typeof s.true_state.scrammed === 'boolean', 'number, boolean', typeof s.true_state.power_pct + ', ' + typeof s.true_state.scrammed, 'field typing');
  };

  // 3.2 — instruments genuinely differ from truth (lag, noise, stuck holds).
  TestRunner.prototype.instrument_vs_truth = function (emit) {
    this._reset('pwr', 'hot_full_power');
    var s = this._step(4);
    // Noise: the reading jitters off the exact truth, and varies cycle to cycle.
    var n1 = this._step(1).instruments.power_range;
    var n2 = this._step(1).instruments.power_range;
    emit('noise present (reading ≠ exact truth, varies)', n1 !== n2 && n1 !== s.true_state.power_pct, 'jitter', n1.toFixed(3) + ' vs ' + n2.toFixed(3), 'instrument noise / PRNG not applied');

    // Lag: drive true Tavg steadily down (steam-line break overcooling); the
    // lagged tavg reading trails above the still-falling truth (tavg lag = 4 s).
    this._reset('pwr', 'hot_full_power');
    this._step(2);
    var tavg0_true = this._step(1).true_state.tavg_c;
    this._cmd({ action: 'inject_failure', failure_id: 'steam_line_break', severity: 1.0 });
    var after = this._runSeconds(12);
    var trueDrop = tavg0_true - after.true_state.tavg_c;
    var lagGap = after.instruments.tavg - after.true_state.tavg_c; // > 0 ⇒ reading lags above falling truth
    emit('reading LAGS truth (trails a falling true value)', trueDrop > 0.8 && lagGap > 0.4, 'true falling, reading above it by >0.4 °C', 'trueDrop=' + trueDrop.toFixed(2) + ', lagGap=' + lagGap.toFixed(2), 'instrument lag not applied (HR6)');

    // Stuck holds while truth moves (drive truth far with the same overcooling).
    this._reset('pwr', 'hot_full_power');
    this._step(2);
    this._cmd({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'stuck' });
    var held = this._step(1).instruments.tavg;     // frozen at the injection-time reading
    this._cmd({ action: 'inject_failure', failure_id: 'steam_line_break', severity: 1.0 });
    var moved = this._runSeconds(12);
    emit('stuck instrument holds while truth moves', approx(moved.instruments.tavg, held, 0.01) && (held - moved.true_state.tavg_c) > 0.8, 'reading frozen, truth diverged > 0.8 °C', moved.instruments.tavg.toFixed(2) + ' vs true ' + moved.true_state.tavg_c.toFixed(2), 'stuck-failure not applied');
  };

  // 3.3 — the protection boundary (HR1). The highest-value checks.
  TestRunner.prototype.protection_boundary = function (emit) {
    // (a) Stick an instrument ABOVE a trip setpoint with TRUE value safe → MUST trip.
    this._reset('pwr', 'hot_full_power');
    this._cmd({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'stuck', value: 340 }); // > 335 trip
    var sa = this._runSeconds(1.5);
    emit('(a) stuck-high instrument trips with truth safe', sa.rps_state.scrammed === true, 'scrammed = true', String(sa.rps_state.scrammed), 'trip is NOT reading the instrument (HR1 broken)');
    emit('(a) trip reason is the stuck channel', sa.rps_state.last_trip_reason === 'tavg high', 'tavg high', String(sa.rps_state.last_trip_reason), 'wrong/absent trip reason');
    emit('(a) and the TRUE value really was safe', sa.true_state.tavg_c < 335, 'true tavg < 335', sa.true_state.tavg_c.toFixed(1), 'sanity: truth not actually safe');

    // (b) Drive the TRUE value unsafe while instruments read SAFE → must NOT trip.
    this._reset('pwr', 'hot_full_power');
    var safe = { power_range: 100, tavg: 304, primary_pressure: 15.4, pzr_level: 55, sg_level: 65 };
    for (var id in safe) this._cmd({ action: 'set_instrument_failure', instrument_id: id, mode: 'stuck', value: safe[id] });
    this._cmd({ action: 'inject_failure', failure_id: 'loss_of_feedwater' }); // boils the SG dry → true level → 0
    var sb = this._runSeconds(120);
    emit('(b) truth driven genuinely unsafe (true SG < 12%)', sb.true_state.sg_level_pct < 12, 'true sg_level < 12', sb.true_state.sg_level_pct.toFixed(1), 'sanity: truth not actually unsafe');
    emit('(b) reactor does NOT trip (trips read the safe instruments)', sb.rps_state.scrammed === false, 'scrammed = false', String(sb.rps_state.scrammed), 'trip IS reading true state (HR1 broken)');
  };

  // 3.4 — command flow and interception, end to end.
  TestRunner.prototype.command_flow = function (emit) {
    this._reset('pwr', 'hot_full_power');
    var before = this.service.assembleSnapshot().control_state.rod_groups[0].steps;
    this._cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -10 });
    var after = this.service.assembleSnapshot().control_state.rod_groups[0].steps;
    emit('plant command reaches the engine and takes effect', after === before - 10, String(before - 10), String(after), 'command not routed through M5→instructor→M4→engine');

    this._reset('pwr', 'hot_full_power');
    this._step(1);
    this._cmd({ action: 'open_porv' });
    this._cmd({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
    this._cmd({ action: 'close_porv' });   // command-override must intercept this
    var s = this._step(1);
    emit('command-override intercepts (stuck PORV defeats close)', s.true_state.porv_open === true, 'porv_open = true', String(s.true_state.porv_open), 'interception not applied in M4');
    emit('the failure is reported in active_failures', s.active_failures.some(function (f) { return f.id === 'stuck_porv_open'; }), 'contains stuck_porv_open', JSON.stringify(s.active_failures), 'active_failures not assembled');
  };

  // 3.5 — alarm behavior: condition → snapshot (config-driven) → lifecycle.
  TestRunner.prototype.alarm_behavior = function (emit) {
    this._reset('pwr', 'hot_full_power');
    var def = this._protConfig().alarms.filter(function (a) { return a.id === 'high_tavg'; })[0];
    this._cmd({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'stuck', value: 320 }); // > 312.2 alarm, < 335 trip
    var s = this._runSeconds(1.5);
    var a = s.alarms.filter(function (x) { return x.id === 'high_tavg'; })[0];
    emit('crossing the setpoint raises the alarm (active_unacknowledged)', a && a.state === 'active_unacknowledged', 'active_unacknowledged', a && a.state, 'alarm evaluation not wired');
    emit('priority read from config (not hardcoded)', a && a.priority === def.priority && a.panel === def.panel, def.priority + '/' + def.panel, a && (a.priority + '/' + a.panel), 'alarm meta not sourced from config');
    emit('tile_label is the learning-register label', a && a.tile_label === def.label_learning, def.label_learning, a && a.tile_label, 'register label selection wrong');

    this._cmd({ action: 'set_register', value: 'industry' });
    var aI = this.service.assembleSnapshot().alarms.filter(function (x) { return x.id === 'high_tavg'; })[0];
    emit('tile_label switches with register (config-driven dual labels)', aI && aI.tile_label === def.label_industry, def.label_industry, aI && aI.tile_label, 'register not propagated to M4 tile labels');

    this._cmd({ action: 'acknowledge_alarm', alarm_id: 'high_tavg' });
    var sAck = this._step(1);
    var aAck = sAck.alarms.filter(function (x) { return x.id === 'high_tavg'; })[0];
    emit('acknowledge → active_acknowledged', aAck && aAck.state === 'active_acknowledged', 'active_acknowledged', aAck && aAck.state, 'acknowledge lifecycle');

    this._cmd({ action: 'clear_instrument_failure', instrument_id: 'tavg' });
    var sClr = this._runSeconds(2);
    var aClr = sClr.alarms.filter(function (x) { return x.id === 'high_tavg'; })[0];
    emit('condition clears → clear', aClr && aClr.state === 'clear', 'clear', aClr && aClr.state, 'alarm does not clear when condition resolves');
  };

  // 3.6 — configuration consistency (no simulation run; reads config).
  TestRunner.prototype.config_consistency = function (emit) {
    this._reset('pwr', 'hot_full_power');
    var cfg = this._protConfig(), instr = this._instrConfig(), ids = this._instrumentIds();
    var trips = cfg.trips, acts = cfg.actuations, alarms = cfg.alarms;

    // Every referenced instrument exists (or is the documented __true_flow__ exception).
    var missing = [];
    trips.forEach(function (t) { if (t.instrument !== '__true_flow__' && !ids[t.instrument]) missing.push('trip:' + t.instrument); });
    acts.forEach(function (a) { if (!ids[a.instrument]) missing.push('act:' + a.instrument); });
    alarms.forEach(function (a) { if (!ids[a.instrument]) missing.push('alarm:' + a.instrument); });
    emit('every referenced instrument exists in the set', missing.length === 0, 'none missing', missing.join(',') || 'none', 'config references an undefined instrument id');

    // Every numeric setpoint within its instrument's range.
    var oob = [];
    function inRange(iid, sp) { var sc = instr[iid]; if (!sc || !sc.range || sp == null) return true; return sp >= sc.range[0] && sp <= sc.range[1]; }
    trips.forEach(function (t) { if (t.instrument !== '__true_flow__' && !inRange(t.instrument, t.setpoint)) oob.push('trip:' + t.instrument + '=' + t.setpoint); });
    alarms.forEach(function (a) { if (a.setpoint != null && !inRange(a.instrument, a.setpoint)) oob.push('alarm:' + a.id + '=' + a.setpoint); });
    acts.forEach(function (a) { if (a.setpoint != null && !inRange(a.instrument, a.setpoint)) oob.push('act:' + a.instrument + '=' + a.setpoint); });
    emit('every setpoint within its instrument range', oob.length === 0, 'all in range', oob.join(',') || 'none', 'a setpoint lies outside the gauge range');

    // Each trip has a less-extreme matching alarm that warns first (instrument-based trips only).
    var noWarn = [];
    trips.forEach(function (t) {
      if (t.instrument === '__true_flow__') return; // documented exception (no instrument-based alarm)
      var warns = alarms.some(function (a) {
        return a.instrument === t.instrument && a.direction === t.direction && a.setpoint != null &&
          (t.direction === 'high' ? a.setpoint < t.setpoint : a.setpoint > t.setpoint);
      });
      if (!warns) noWarn.push(t.instrument + ' ' + t.direction);
    });
    emit('each trip has an earlier-warning alarm', noWarn.length === 0, 'all trips warn first', noWarn.join(',') || 'none', 'a trip has no alarm warning before it fires');

    // lo_lo more extreme than its lo sibling.
    var badLolo = [];
    alarms.forEach(function (a) {
      if (a.direction !== 'low' || !/lolo$/.test(a.id)) return;
      alarms.forEach(function (b) {
        if (b !== a && b.instrument === a.instrument && b.direction === 'low' && /(_low|_lo)$/.test(b.id) && !(a.setpoint < b.setpoint)) badLolo.push(a.id + ' !< ' + b.id);
      });
    });
    emit('lo_lo thresholds more extreme than lo siblings', badLolo.length === 0, 'lo_lo < lo', badLolo.join(',') || 'none', 'a lo_lo alarm is not more extreme than its lo');
  };

  // ----------------------------------------------------------------- run / report
  TestRunner.prototype.runSuite = function (name, onResult) {
    var self = this, results = [];
    var emit = function (check, passed, expected, observed, fix_hint) {
      var r = { suite: name, check: check, passed: !!passed };
      if (!passed) { r.expected = expected; r.observed = observed; r.fix_hint = fix_hint; }
      else { r.observed = observed; }
      results.push(r);
      if (onResult) onResult(r);
    };
    if (typeof this[name] !== 'function') {
      var r = { suite: name, check: 'unknown suite', passed: false, fix_hint: 'no such suite' };
      if (onResult) onResult(r);
      return { suite: name, total: 1, passed: 0, failed: 1, results: [r] };
    }
    this[name](emit);
    var passed = results.filter(function (r) { return r.passed; }).length;
    return { suite: name, total: results.length, passed: passed, failed: results.length - passed, results: results };
  };

  TestRunner.prototype.runAll = function (onResult) {
    var summaries = [], total = 0, passed = 0;
    for (var i = 0; i < this.SUITES.length; i++) {
      var sum = this.runSuite(this.SUITES[i], onResult);
      summaries.push(sum); total += sum.total; passed += sum.passed;
    }
    return { suites: summaries, total: total, passed: passed, failed: total - passed, ok: passed === total };
  };

  RD.TestRunner = TestRunner;

})(globalThis.RD || (globalThis.RD = {}));
