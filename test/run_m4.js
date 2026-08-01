/*
 * run_m4.js — integration smoke test for the Control & Failure Layer (M4) wired
 * onto the PWR engine (M1). This is a DEV check, not the M7 Test Runner: it
 * exercises the highest-value wiring properties (trips/alarms read instruments
 * not truth, command interception, the ATWS truth-gap, alarm lifecycle,
 * actuation, failure bookkeeping, save/restore). M7 owns the full validation.
 *
 *   node test/run_m4.js
 */
'use strict';
var path = require('path');
function load(p) { require(path.join(__dirname, '..', p)); }
[
  'engines/load_mode.js',
  'engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js',
  'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js',
  'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
  'layers/control/control_kernel.js',
].forEach(load);
var RD = globalThis.RD;

// ---- minimal stack: engine + layer, stepped with per-cycle evaluate (like M5) ----
function Stack(initial, seed) {
  this.engine = new RD.PWREngine({ initial_state: initial || 'hot_full_power', seed: seed });
  this.layer = new RD.ControlFailureLayer(this.engine);
  this.dt = 0.02;
}
Stack.prototype.cmd = function (c) { return this.layer.handleCommand(c); };
Stack.prototype.run = function (seconds) {
  var n = Math.round(seconds / this.dt);
  for (var i = 0; i < n; i++) { this.engine.step(this.dt); this.layer.evaluate(this.engine.getInstruments()); }
  return this;
};
Stack.prototype.ts = function () { return this.engine.getTrueState(); };
Stack.prototype.ins = function () { return this.engine.getInstruments(); };
Stack.prototype.alarm = function (id) { return this.layer.getAlarms().find(function (a) { return a.id === id; }); };
Stack.prototype.auto = function () { return this.layer.getAutomationState(); };

function test(name, fn) {
  var checks = [];
  var ck = function (desc, observed, pass, expected) { checks.push({ desc: desc, observed: observed, expected: expected, pass: !!pass }); };
  try { fn(ck); } catch (e) { ck('threw: ' + (e && e.message), String(e && e.stack || e), false, 'no throw'); }
  return { name: name, pass: checks.every(function (c) { return c.pass; }), checks: checks };
}

var T = [];

T.push(test('Trip reads INSTRUMENT not truth — stuck-high instrument trips with truth safe', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(2);
  ck('truth safe before', s.ts().tavg_c.toFixed(1), s.ts().tavg_c < 335, '< 335 °C');
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'stuck', value: 340 }); // > 335 trip
  s.run(2);
  ck('trips on the (false) high reading', s.layer.rps.last_trip_reason, s.layer.rps.scrammed === true, 'scrammed');
  ck('true Tavg was never unsafe', s.ts().tavg_c.toFixed(1), s.ts().tavg_c < 335, 'truth stayed < 335');
}));

T.push(test('Trip reads INSTRUMENT not truth — instruments stuck safe, truth wild → NO trip', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(2);
  // Freeze every instrument-based trip parameter at a safe value; pumps stay on
  // so __true_flow__ stays safe too.
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'power_range', mode: 'stuck', value: 100 });
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'stuck', value: 304 });
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'primary_pressure', mode: 'stuck', value: 15.4 });
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'pzr_level', mode: 'stuck', value: 55 });
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'sg_level', mode: 'stuck', value: 65 });
  // Drive TRUE state genuinely unsafe: loss of feedwater boils the SG dry, so
  // true SG level crashes far below its 12% low-level trip — but the frozen
  // instrument still reads 65%.
  s.cmd({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
  s.run(120);
  ck('true SG level genuinely unsafe (< 12%)', s.ts().sg_level_pct.toFixed(1), s.ts().sg_level_pct < 12, '< 12%');
  ck('instrument still reads safe', s.ins().sg_level.toFixed(1), s.ins().sg_level > 60, 'frozen ~65%');
  ck('no scram (trips read the safe instruments)', String(s.layer.rps.scrammed), s.layer.rps.scrammed === false, 'not scrammed');
}));

T.push(test('TMI — porv_open alarm suppressed by the lying indicator', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(1);
  s.cmd({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
  s.cmd({ action: 'inject_failure', failure_id: 'porv_indicator_stuck_closed' });
  s.cmd({ action: 'open_porv' });
  s.run(2);
  ck('PORV truly open', s.ts().porv_open, s.ts().porv_open === true, true);
  ck('indicator reads closed', s.ins().porv_indicator, s.ins().porv_indicator === 'closed', 'closed');
  ck('porv_open alarm does NOT annunciate', s.alarm('porv_open').state, s.alarm('porv_open').state === 'clear', 'clear');
}));

// ---------------------------------------------------------------- PORV manual switch (#125)
// A real PORV takes two independent inputs to one solenoid: the automatic pressurizer-
// pressure channel and the operator's control switch. They were ONE command here, which is
// why the operator had no PORV control at all — the only way to give them one was to widen
// the command automatic relief already used, and then nothing could tell an operator lift
// from a relief lift. `open_porv_manual` is the operator's switch; `open_porv` stays the
// automatic and scenario-authored one (owner's design, 2026-07-31).
T.push(test('PORV — the operator switch is separate from automatic relief (#125)', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(1);
  ck('nothing locked by default', JSON.stringify(s.auto().action_locks), (s.auto().action_locks || []).length === 0, '[]');
  var r = s.cmd({ action: 'open_porv_manual' });
  ck('operator can open it', JSON.stringify(r), r == null, 'null');
  s.run(2);
  ck('valve truly open', s.ts().porv_open, s.ts().porv_open === true, true);
  s.cmd({ action: 'close_porv' }); s.run(2);
  ck('and truly closed again', s.ts().porv_open, s.ts().porv_open === false, false);
}));

// The third check here is the one that matters. Locking the operator's switch must never
// disable overpressure protection — that would turn a teaching lockout into a safety
// defect, and it is exactly what a single shared command would have produced.
T.push(test('PORV — a scenario can lock the operator switch, and relief still works (#125)', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(1);
  s.cmd({ action: 'set_action_lock', action_id: 'open_porv_manual' });
  ck('snapshot lists the locked action', JSON.stringify(s.auto().action_locks),
    (s.auto().action_locks || []).indexOf('open_porv_manual') >= 0, "['open_porv_manual']");

  // REFUSED, not silently dropped — a dead-looking button is the failure mode this repo
  // keeps finding, so the board has to be able to say why.
  var r = s.cmd({ action: 'open_porv_manual' });
  ck('operator open is refused with a reason', r && r.code, !!(r && r.code === 'ACTION_LOCKED'), 'ACTION_LOCKED');
  s.run(2);
  ck('and the valve did not move', s.ts().porv_open, s.ts().porv_open === false, false);

  // close_porv is deliberately NOT locked: it is the TMI-2 action itself, and it has to
  // stay available so the stuck-valve interception can lie to the operator.
  var rc = s.cmd({ action: 'close_porv' });
  ck('close is still allowed', JSON.stringify(rc), rc == null, 'null');

  // Automatic relief is a DIFFERENT command and is untouched. Drive pressure up on the
  // heaters and watch the valve lift anyway.
  s.cmd({ action: 'set_spray', pct: 0 });
  s.cmd({ action: 'set_heater', power_pct: 100 });
  var lifted = false;
  for (var i = 0; i < 40 && !lifted; i++) { s.run(15); lifted = s.ts().porv_open === true; }
  ck('AUTOMATIC relief still lifts while the operator switch is locked',
    lifted + ' @ ' + s.ins().primary_pressure.toFixed(2) + ' MPa', lifted === true, true);
}));

T.push(test('ATWS — failure_to_scram: trip signal present, reactor not shut down', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(1);
  s.cmd({ action: 'inject_failure', failure_id: 'failure_to_scram' });
  // Force a trip via a stuck-high flux reading.
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'power_range', mode: 'stuck', value: 125 });
  s.run(3);
  ck('trip signal present (indication)', s.layer.rps.scrammed, s.layer.rps.scrammed === true, 'rps scrammed');
  ck('engine NOT scrammed (truth)', s.ts().scrammed, s.ts().scrammed === false, 'true_state not scrammed');
  ck('power has not collapsed', s.ts().power_pct.toFixed(1), s.ts().power_pct > 90, '~ still at power');
}));

T.push(test('Interception — stuck-open PORV defeats a close command', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(1);
  s.cmd({ action: 'open_porv' });
  s.cmd({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
  s.cmd({ action: 'close_porv' });   // intercepted → open_porv
  s.run(1);
  ck('valve stays open after close', s.ts().porv_open, s.ts().porv_open === true, true);
  ck('demand was forced back to open', s.engine.getControlState().porv_demand, s.engine.getControlState().porv_demand === 'open', 'open');
}));

T.push(test('Engineered-safety actuation — low pressure auto-starts HPI', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(1);
  ck('HPI off initially', s.ts().hpi_active, s.ts().hpi_active === false, false);
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'primary_pressure', mode: 'stuck', value: 10.0 }); // < 11.03 actuation
  s.run(2);
  ck('HPI auto-actuated on low pressure', s.ts().hpi_active, s.ts().hpi_active === true, true);
}));

T.push(test('ESF AUTO/MAN arms — operator action disarms; re-arm re-fires a standing condition', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(1);
  ck('HPI arm starts AUTO', s.layer.getAutomationState().esf.hpi, s.layer.getAutomationState().esf.hpi === 'auto', 'auto');
  // Low pressure fires the actuation (a PLANT command — must NOT disarm).
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'primary_pressure', mode: 'stuck', value: 10.0 });
  s.run(2);
  ck('actuation fired with the arm still AUTO', s.layer.getAutomationState().esf.hpi, s.ts().hpi_active === true && s.layer.getAutomationState().esf.hpi === 'auto', 'fired + auto');
  // Operator turns HPI off → the system goes MANUAL and stays off.
  s.cmd({ action: 'set_hpi', active: false });
  s.run(2);
  ck('operator action disarmed the system', s.layer.getAutomationState().esf.hpi, s.layer.getAutomationState().esf.hpi === 'manual', 'manual');
  ck('actuation does not re-fire while disarmed', s.ts().hpi_active, s.ts().hpi_active === false, false);
  // Re-arm with the low condition STANDING → the actuation re-fires.
  s.cmd({ action: 'set_esf_auto', system: 'hpi', auto: true });
  s.run(2);
  ck('re-arm restored AUTO', s.layer.getAutomationState().esf.hpi, s.layer.getAutomationState().esf.hpi === 'auto', 'auto');
  ck('standing low pressure re-fired HPI', s.ts().hpi_active, s.ts().hpi_active === true, true);
  // AFW arm: throttling is an operator action on the system too.
  ck('AFW arm starts AUTO', s.layer.getAutomationState().esf.afw, s.layer.getAutomationState().esf.afw === 'auto', 'auto');
  s.cmd({ action: 'set_afw_flow', pct: 50 });
  ck('throttle command disarmed AFW', s.layer.getAutomationState().esf.afw, s.layer.getAutomationState().esf.afw === 'manual', 'manual');
}));

T.push(test('NIS startup net — conditioned SR trip, P-6 switch interlocks, blockable trips + P-10', function (ck) {
  // Condition-gated SR trip: fires on high counts only while the detector is energized.
  var s = new Stack('hot_zero_power');
  s.run(1);
  ck('SR energized at HZP', s.ts().sr_energized, s.ts().sr_energized === true, 'true');
  ck('SR counting the source floor', s.ts().sr_counts_cps.toFixed(0), s.ts().sr_counts_cps > 100, '> 100 cps');
  // P-6 (a): can't de-energize the SR until the IR is on scale — at HZP the IR
  // IS on scale (8.3e-9 A), so securing it is permitted.
  var r = s.cmd({ action: 'set_sr_detector', on: false });
  ck('SR secure permitted at HZP (IR on scale)', r && r.type, !(r && r.type === 'blocked'), 'not blocked');
  ck('SR de-energized', s.ts().sr_energized, s.ts().sr_energized === false, 'false');
  s.cmd({ action: 'set_sr_detector', on: true });
  // Stick the SR instrument past its 1e5 cps trip → scram (energized).
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'source_range', mode: 'stuck', value: 2e5 });
  s.run(1);
  ck('SR high flux scrams while energized', s.layer.rps.last_trip_reason, s.layer.rps.scrammed === true, 'scrammed');
  // Same reading with the detector OFF: the condition gates the trip.
  var s2 = new Stack('hot_zero_power');
  s2.run(1);
  s2.cmd({ action: 'set_sr_detector', on: false });
  s2.cmd({ action: 'set_instrument_failure', instrument_id: 'source_range', mode: 'stuck', value: 2e5 });
  s2.run(1);
  ck('no SR trip with the detector secured', String(s2.layer.rps.scrammed), s2.layer.rps.scrammed === false, 'false');

  // Blockable trips: a plant AT POWER starts with the startup trips blocked.
  var p = new Stack('hot_full_power');
  p.run(1);
  ck('at-power lineup: IR + PR-25 blocked', JSON.stringify(p.layer.getRpsState().trip_blocks),
    p.layer.tripBlocks.ir_high === true && p.layer.tripBlocks.pr_low_setpoint === true, 'both blocked');
  ck('no spurious trip at 100 %', String(p.layer.rps.scrammed), p.layer.rps.scrammed === false, 'false');
  // Unblocking the PR low setpoint at 100 % → it fires (the trip is real).
  p.cmd({ action: 'set_trip_block', trip_id: 'pr_low_setpoint', blocked: false });
  p.run(1);
  ck('unblocked PR-25 trips at power', p.layer.rps.last_trip_reason, p.layer.rps.scrammed === true, 'scrammed');
  // Manual rule: below P-10 the automatic permissive is unmet, but the IR trip is not
  // asserted at zero power, so the operator may block it PROACTIVELY — and it's tracked
  // as a manual block (which survives auto-reinstate).
  var q = new Stack('hot_zero_power');
  q.run(1);
  var rb = q.cmd({ action: 'set_trip_block', trip_id: 'ir_high', blocked: true });
  ck('proactive block allowed below P-10 (IR not asserted)', rb, rb == null && q.layer.tripBlocks.ir_high === true, 'blocked');
  ck('operator block tracked as manual', String(q.layer.manualTripBlocks.ir_high), q.layer.manualTripBlocks.ir_high === true, 'true');
}));

T.push(test('P-11/P-7 trip bypass — cold init blocks, auto-reinstate on repressurization', function (ck) {
  var s = new Stack('cold_shutdown');
  s.run(1);
  ck('cold init auto-blocks lo_press (P-11)', String(s.layer.tripBlocks.lo_press), s.layer.tripBlocks.lo_press === true, 'blocked');
  ck('cold init auto-blocks lo_flow (P-7)', String(s.layer.tripBlocks.lo_flow), s.layer.tripBlocks.lo_flow === true, 'blocked');
  ck('depressurized plant sits unscrammed (bypass working)', String(s.layer.rps.scrammed), s.layer.rps.scrammed === false, 'false');
  // Repressurize past the 13.6 MPa P-11 permissive (hold the true pressure —
  // the instrument lags behind it) — the lo_press block must clear ITSELF:
  // a stuck block here means the low-pressure trip is dead at power.
  for (var i = 0; i < Math.round(30 / s.dt); i++) {
    s.engine.s.pressure_mpa = 15.4;
    s.engine.step(s.dt); s.layer.evaluate(s.engine.getInstruments());
  }
  ck('lo_press auto-reinstates above P-11', String(s.layer.tripBlocks.lo_press), s.layer.tripBlocks.lo_press !== true, 'cleared');
  ck('lo_flow stays blocked (its P-7 permissive still satisfied)', String(s.layer.tripBlocks.lo_flow), s.layer.tripBlocks.lo_flow === true, 'blocked');
  // The re-armed trip has teeth: pressure sagging back through 12.41 MPa scrams.
  for (var j = 0; j < Math.round(15 / s.dt) && !s.layer.rps.scrammed; j++) {
    s.engine.s.pressure_mpa = 11.0;
    s.engine.step(s.dt); s.layer.evaluate(s.engine.getInstruments());
  }
  ck('re-armed lo_press trip fires on the way back down', s.layer.rps.last_trip_reason, s.layer.rps.scrammed === true, 'scrammed (primary_pressure low)');
}));

T.push(test('MSIV closure at power (full stack) — bottled SG drains to the level scram', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(2);
  s.cmd({ action: 'close_msiv' });
  ck('MSIV shut + turbine tripped', s.ts().msiv_open, s.ts().msiv_open === false && s.engine.s.turbine_tripped, 'shut + tripped');
  // Sample DURING the run: the old check was `lifted || scrammed`, and the next
  // check requires the scram — so the safety lift itself was never pinned.
  var everLifted = false;
  for (var i = 0; i < Math.round(120 / s.dt); i++) {
    s.engine.step(s.dt); s.layer.evaluate(s.engine.getInstruments());
    if (s.ts().sg_safety_open === true) everLifted = true;
  }
  ck('safeties lifted while bottled', String(everLifted), everLifted === true, 'lifted at some point');
  ck('protection ended it — SG level scram', s.layer.rps.last_trip_reason, s.layer.rps.scrammed === true, 'scrammed');
  var al = s.alarm('msiv_closed');
  ck('MSIV SHUT annunciated', al && al.state, al && al.state !== 'clear', 'active');
}));

T.push(test('AFW throttle + level hold — delivered flow scales and tapers (engine)', function (ck) {
  var s = new Stack('hot_full_power');
  var es = s.engine.s, sg = s.engine.cfg.steam_generator;
  s.run(1);
  // The hold senses level through the SG LEVEL INSTRUMENT (HR1) — drive the
  // SENSED level with a stuck-instrument injection, not the true state.
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'sg_level', mode: 'stuck', value: 10 });
  s.cmd({ action: 'set_afw', active: true });
  s.engine.step(0.02); s.engine.step(0.02);   // reading sticks, then the stash sees it
  ck('full capacity at low sensed level', es.afw_flow_normalized.toFixed(3), Math.abs(es.afw_flow_normalized - sg.afw_flow_frac) < 1e-6, String(sg.afw_flow_frac));
  s.cmd({ action: 'set_afw_flow', pct: 40 });
  s.engine.step(0.02);
  ck('throttle scales delivered flow', es.afw_flow_normalized.toFixed(3), Math.abs(es.afw_flow_normalized - 0.4 * sg.afw_flow_frac) < 1e-6, (0.4 * sg.afw_flow_frac).toFixed(3));
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'sg_level', mode: 'stuck', value: sg.afw_level_target + sg.afw_level_band + 1 });
  s.engine.step(0.02); s.engine.step(0.02);
  ck('level hold tapers to zero above the band', es.afw_flow_normalized.toFixed(4), es.afw_flow_normalized === 0, '0');
}));

T.push(test('Alarm lifecycle — clear → unack → ack → clear', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(1);
  ck('starts clear', s.alarm('high_tavg').state, s.alarm('high_tavg').state === 'clear', 'clear');
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'stuck', value: 320 }); // > 312.2 alarm, < 335 trip
  s.run(1);
  ck('condition true → active_unacknowledged', s.alarm('high_tavg').state, s.alarm('high_tavg').state === 'active_unacknowledged', 'active_unacknowledged');
  s.cmd({ action: 'acknowledge_alarm', alarm_id: 'high_tavg' });
  s.run(0.2);
  ck('acknowledge → active_acknowledged', s.alarm('high_tavg').state, s.alarm('high_tavg').state === 'active_acknowledged', 'active_acknowledged');
  s.cmd({ action: 'clear_instrument_failure', instrument_id: 'tavg' });
  s.run(2);
  ck('condition clears → clear', s.alarm('high_tavg').state, s.alarm('high_tavg').state === 'clear', 'clear');
}));

// --------------------------------------------------------------------------
// Kernel internals that shipped with no test at all (#154 item 6). Each of the
// four below guards a mechanism that was either fixed-but-unpinned or used by
// several failures and never once observed.

T.push(test('Actuation reset_below — the PORV holds open while pressure is high, and does NOT flap (#154)', function (ck) {
  // The PWR PORV actuation is `direction: high, setpoint 16.20, reset_below 15.86`.
  // The kernel comment records a shipped inversion — `value > reset_below` made it
  // fire and reset in the SAME pass, flapping open/close on every evaluate while
  // pressure stayed high — and nothing pinned the fix. Drive the INSTRUMENT (HR1)
  // rather than the plant, so the band is exact and the probe cannot drift.
  var s = new Stack('hot_full_power');
  s.run(1);
  ck('PORV shut at normal pressure', s.ts().porv_open, s.ts().porv_open === false, 'false');
  // Above the setpoint: fires once and STAYS fired.
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'primary_pressure', mode: 'stuck', value: 16.5 });
  s.run(0.5);
  ck('opened above the 16.20 MPa (2350 psi) setpoint', s.ts().porv_open, s.ts().porv_open === true, 'true');
  // 40 further evaluates with the reading still on the UNSAFE side of reset_below.
  // The inverted form closes it on the very first one; the correct form cannot.
  var flaps = 0, wasOpen = s.ts().porv_open;
  for (var i = 0; i < 40; i++) {
    s.run(0.1);
    if (s.ts().porv_open !== wasOpen) { flaps++; wasOpen = s.ts().porv_open; }
  }
  ck('no flapping across 40 evaluates at 16.5 MPa', flaps, flaps === 0, '0 transitions');
  ck('still open', s.ts().porv_open, s.ts().porv_open === true, 'true');
  // Between reset_below and the setpoint the latch must STILL hold — this is the
  // half a naive "reset when below setpoint" would get wrong.
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'primary_pressure', mode: 'stuck', value: 16.0 });
  s.run(0.5);
  ck('holds open between reset_below and setpoint (16.0 MPa)', s.ts().porv_open, s.ts().porv_open === true, 'true');
  // Below reset_below: the reset_action fires and it shuts.
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'primary_pressure', mode: 'stuck', value: 15.5 });
  s.run(0.5);
  ck('recloses below 15.86 MPa (2300 psi)', s.ts().porv_open, s.ts().porv_open === false, 'false');

  // The pressurizer CODE SAFETIES ride the same mechanism one band higher, and
  // this is the half the engine-direct probe (run_pwr pzr_code_safeties)
  // deliberately does not own: there the valve is a commanded state, here is
  // where the setpoint lives. Worth pinning separately because a real transient
  // cannot reach it — measured, the high-pressure reactor trip caps indicated
  // pressure at 16.96 MPa (2460 psi), below the 17.13 pop, so only an ATWS or a
  // failed instrument gets there.
  var q = new Stack('hot_full_power');
  q.run(1);
  ck('code safeties shut to begin with', q.ins().safety_relief_active,
    q.ins().safety_relief_active === false, 'false');
  q.cmd({ action: 'set_instrument_failure', instrument_id: 'primary_pressure', mode: 'stuck', value: 17.5 });
  q.run(0.5);
  ck('pop above the 17.13 MPa (2484 psi) code setpoint', q.ins().safety_relief_active,
    q.ins().safety_relief_active === true, 'true');
  // Between the reseat and pop setpoints they must STAY lifted — same latch as
  // the PORV, one band up.
  q.cmd({ action: 'set_instrument_failure', instrument_id: 'primary_pressure', mode: 'stuck', value: 16.8 });
  q.run(0.5);
  ck('still lifted between reseat and pop (16.8 MPa)', q.ins().safety_relief_active,
    q.ins().safety_relief_active === true, 'true');
  q.cmd({ action: 'set_instrument_failure', instrument_id: 'primary_pressure', mode: 'stuck', value: 16.3 });
  q.run(0.5);
  ck('reseat below 16.55 MPa (2400 psi)', q.ins().safety_relief_active,
    q.ins().safety_relief_active === false, 'false');
}));

T.push(test('Interception — override_value forces the NUMBER an operator commanded (#154)', function (ck) {
  // Five PWR failures carry `override_value`, and the intercepted-command path was
  // never observed: the failures get injected in other suites, but nothing issues
  // the intercepted command and reads back the forced value. `loss_of_feedwater`
  // pins feed to 0.0 however hard the operator drives it.
  var s = new Stack('hot_full_power');
  s.run(1);
  s.cmd({ action: 'set_feed_pump_speed', pct: 80 });
  s.run(0.5);
  var freeRunning = s.engine.s.feed_pump_speed_pct;
  ck('operator owns the pump with no failure active', freeRunning.toFixed(1), Math.abs(freeRunning - 80) < 1e-6, '80.0 %');
  s.cmd({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
  s.cmd({ action: 'set_feed_pump_speed', pct: 80 });   // the operator fights it
  s.run(0.5);
  ck('override_value 0.0 forced the commanded 80 % to zero', s.engine.s.feed_pump_speed_pct.toFixed(1),
    s.engine.s.feed_pump_speed_pct === 0, '0.0 %');
  // The other direction: sg_overfeed forces feed UP to 120 %, so this is not just
  // "the failure zeroes things".
  s.cmd({ action: 'clear_failure', failure_id: 'loss_of_feedwater' });
  s.cmd({ action: 'inject_failure', failure_id: 'sg_overfeed', severity: 1.0 });
  s.cmd({ action: 'set_feed_pump_speed', pct: 10 });   // operator tries to throttle back
  s.run(0.5);
  ck('sg_overfeed forces the commanded 10 % UP to 120 %', s.engine.s.feed_pump_speed_pct.toFixed(1),
    Math.abs(s.engine.s.feed_pump_speed_pct - 120) < 1e-6, '120.0 %');
}));

T.push(test('Interception precedence — at most one override, FIRST injected wins (#154)', function (ck) {
  // §7: the kernel walks activeFailures in injection order and breaks on the first
  // command_override matching the action. Both failures below intercept
  // set_feed_pump_speed with different override_values (0.0 and 120), so the order
  // is observable — and a change from first-wins to last-wins inverts both halves.
  var a = new Stack('hot_full_power');
  a.run(1);
  a.cmd({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
  a.cmd({ action: 'inject_failure', failure_id: 'sg_overfeed', severity: 1.0 });
  a.cmd({ action: 'set_feed_pump_speed', pct: 50 });
  a.run(0.5);
  ck('LOF injected first → 0 %, overfeed does not get a look in', a.engine.s.feed_pump_speed_pct.toFixed(1),
    a.engine.s.feed_pump_speed_pct === 0, '0.0 %');
  var b = new Stack('hot_full_power');
  b.run(1);
  b.cmd({ action: 'inject_failure', failure_id: 'sg_overfeed', severity: 1.0 });
  b.cmd({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
  b.cmd({ action: 'set_feed_pump_speed', pct: 50 });
  b.run(0.5);
  ck('overfeed injected first → 120 %, with the SAME two failures active',
    b.engine.s.feed_pump_speed_pct.toFixed(1), Math.abs(b.engine.s.feed_pump_speed_pct - 120) < 1e-6, '120.0 %');
  // `effect: 'block'` DROPS the command outright rather than transforming it, and
  // it returns before any later override can claim the action.
  var c = new Stack('hot_full_power');
  c.run(1);
  c.cmd({ action: 'inject_failure', failure_id: 'failure_to_scram' });
  c.cmd({ action: 'scram' });
  c.run(1);
  ck('a block-effect override drops the command (ATWS: no scram)', c.ts().scrammed,
    c.ts().scrammed === false, 'false');
}));

T.push(test('acknowledge_all_alarms clears every standing alarm at once (#154)', function (ck) {
  // Only ever asserted as "the instructor gate does not block it" (run_campaign) —
  // the EFFECT was untested, so a no-op implementation passed.
  var s = new Stack('hot_full_power');
  s.run(1);
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'stuck', value: 320 });
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'pzr_level', mode: 'stuck', value: 12 });
  s.run(1);
  var unack = function () {
    return s.layer.getAlarms().filter(function (a) { return a.state === 'active_unacknowledged'; });
  };
  var before = unack();
  ck('at least two alarms standing unacknowledged', before.length, before.length >= 2,
    '≥ 2 (' + before.map(function (a) { return a.id; }).join(',') + ')');
  s.cmd({ action: 'acknowledge_all_alarms' });
  s.run(0.2);
  ck('none left unacknowledged', unack().length, unack().length === 0, '0');
  var acked = s.layer.getAlarms().filter(function (a) { return a.state === 'active_acknowledged'; });
  ck('they are ACKNOWLEDGED, not cleared — the conditions still stand', acked.length,
    acked.length >= before.length, '≥ ' + before.length);
  // A NEW alarm after the sweep must still arrive unacknowledged: the command acks
  // what is standing, it does not latch the board quiet.
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'sg_level', mode: 'stuck', value: 20 });
  s.run(1);
  ck('a later alarm still arrives unacknowledged', unack().length, unack().length >= 1, '≥ 1');
}));

T.push(test('#287 — losing shutdown cooling annunciates; the permissive stays one-shot', function (ck) {
  // OWNER RULING, 2026-07-31: "Keep it and enunciate". The RHR auto-entry permissive
  // fires once below the 400 psi (2.76 MPa) interlock and never re-arms, while the
  // engine AUTO-CLOSES the suction valve on any repressurization above it. That pairing
  // is deliberate — a real plant re-opens that valve on purpose, not automatically — so
  // what was added is the INDICATION, not a re-arm.
  //
  // Gated on the MODE, not on the RPS latch. The first cut of this alarm asked for
  // `rps_scrammed`, and measured, a Mode 5 plant reads `rps_scrammed = false` — it was
  // never tripped, it is simply cold — so the alarm could not fire in the one regime
  // where losing shutdown cooling is most dangerous. Mode is what says "RHR is the heat
  // sink here".
  var m5 = new Stack('cold_shutdown');
  m5.run(3);
  var st = function (s2) { return s2.alarm('rhr_not_aligned').state; };
  ck('Mode 5 with cooling in service is quiet', m5.ins().plant_mode + '/' + st(m5),
    m5.ins().plant_mode === 5 && st(m5) === 'clear', 'mode 5, clear');
  m5.cmd({ action: 'set_rhr', active: false });        // the loss — however it arises
  m5.run(3);
  ck('losing RHR in Mode 5 ANNUNCIATES', st(m5), st(m5) !== 'clear', 'active');
  ck('it is a warning on panel B, not a casualty alarm', m5.alarm('rhr_not_aligned').priority,
    m5.alarm('rhr_not_aligned').priority === 'warning', 'warning');
  ck('and it is NOT auto-acknowledged — this is news, not a lineup',
    st(m5), st(m5) === 'active_unacknowledged', 'active_unacknowledged');
  // Nothing re-aligns it on its own: the permissive is one-shot AND its condition
  // (rps_scrammed) is false in Mode 5, so the operator owns the recovery.
  ck('nothing re-aligns RHR by itself (the ruled-on one-shot)', m5.ts().rhr_active,
    m5.ts().rhr_active === false, 'false');
  m5.cmd({ action: 'set_rhr', active: true });
  m5.run(3);
  ck('operator re-alignment clears it', st(m5) + ' (rhr_active=' + m5.ts().rhr_active + ')',
    st(m5) === 'clear' && m5.ts().rhr_active === true, 'clear');
  // At power RHR is not aligned either, and that is entirely normal — the alarm must
  // not fire outside the regime, or it is standing for the whole of Mode 1.
  var hot = new Stack('hot_full_power');
  hot.run(3);
  ck('at power, RHR unaligned is NORMAL and stays quiet',
    'mode ' + hot.ins().plant_mode + ', rhr_active=' + hot.ts().rhr_active + ', ' + st(hot),
    hot.ts().rhr_active === false && st(hot) === 'clear', 'clear');
  // The permissive is one-shot BY CONSTRUCTION, and that is now a ruled-on property:
  // pin the absence of a reset so a later edit cannot quietly make it re-arm. (The
  // engine's auto-close half is pinned engine-direct in run_pwr rhr_valve_and_mode.)
  var acts = (RD.PWR_PROTECTION || RD.PWRControl || {}).actuations ||
             (hot.layer.config && hot.layer.config.actuations) || [];
  var rhrAct = acts.filter(function (a) { return a.action === 'set_rhr' && a.active === true; })[0];
  ck('the RHR entry actuation exists', !!rhrAct, !!rhrAct, 'found');
  if (rhrAct) {
    ck('…and carries NO reset — it is one-shot by construction (#287 ruling)',
      'reset_below=' + rhrAct.reset_below + ' reset_action=' + rhrAct.reset_action,
      rhrAct.reset_below === undefined && rhrAct.reset_action === undefined, 'neither set');
  }
}));

T.push(test('#294 — MODE 4 is a cold mode too: the whole COLD_MODES half was untested', function (ck) {
  // `COLD_MODES = [4, 5]` (pwr_control.js) gates SIX behaviours: the #287 alarm's
  // `condition`, plus four reclassify rules that turn expected cold-plant indications
  // into `status` instead of leaving them as warnings. Everything above this test
  // exercises Mode 5 only, and MEASURED, narrowing COLD_MODES to `[5]` left run_m4,
  // run_pwr, run_ops, run_contract, run_reachability and run_hardrules ALL GREEN —
  // 185/240/351/139/58/75, every one at baseline. So the Mode 4 half could be deleted
  // outright without a gate objecting.
  //
  // What that injection actually does to a correctly-cooled-down plant: low_tavg and
  // pzr_pressure_low revert to warnings, turbine_trip reverts to a warning, and
  // pzr_pressure_lolo comes back as a CRITICAL — a casualty alarm on a plant that is
  // depressurized exactly as the procedure intends — while the one alarm carrying real
  // news, RHR NOT IN SERVICE, vanishes entirely because its condition no longer matches.
  //
  // Mode 4 matters because it is where a plant spends most of a cooldown from power, and
  // it is where the #287 sequence actually lands (measured: the cooldown ends Mode 4 at
  // 147.5 °C / 297 °F, 280 psi / 1.93 MPa). The test above reaches its loss with an
  // operator `set_rhr active:false` in Mode 5; this one reaches Mode 4 the way the plant
  // really does — by LOSING shutdown cooling and heating up on decay + pump heat — so the
  // mechanism is the engine's, not the probe's.
  var m4 = new Stack('cold_shutdown');
  m4.run(3);
  // CLAUDE.md trap: the engine silently ignores a string IC. Assert it rather than trust it.
  ck('IC really is Mode 5 cold shutdown', m4.ins().plant_mode + ', ' + m4.ts().tavg_c.toFixed(1) + ' °C',
    m4.ins().plant_mode === 5 && m4.ts().tavg_c < 93, 'mode 5, < 93 °C');
  m4.cmd({ action: 'set_rhr', active: false });   // lose the heat sink
  m4.cmd({ action: 'set_rcp', running: true });   // pump heat does the rest
  var t = 0;
  while (t < 6000 && m4.ins().plant_mode !== 4) { m4.run(100); t += 100; }
  m4.run(600);   // walk clear of the 93 °C boundary rather than asserting on top of it
  var tavg = m4.ts().tavg_c;
  ck('the plant heated into Mode 4 on its own', 'mode ' + m4.ins().plant_mode + ', ' +
    tavg.toFixed(1) + ' °C (' + (tavg * 9 / 5 + 32).toFixed(0) + ' °F) after ' + t + ' s',
    m4.ins().plant_mode === 4 && tavg > 93 && tavg < 177, 'mode 4, 93..177 °C');
  var pr = function (id) { var a = m4.alarm(id); return a ? a.priority : 'absent'; };
  var stOf = function (id) { var a = m4.alarm(id); return a ? a.state : 'absent'; };
  // The four reclassifications. These are the ones that revert under the injection, and
  // three of them still APPEAR either way — only their priority moves — which is exactly
  // what a presence-only check cannot see. Assert the priority.
  [['low_tavg', 'coolant cold'], ['pzr_pressure_low', 'pzr depressurized'],
   ['pzr_pressure_lolo', 'pzr very low'], ['turbine_trip', 'turbine secured']
  ].forEach(function (p) {
    ck('Mode 4: ' + p[0] + ' reads STATUS, not a warning (' + p[1] + ')', pr(p[0]),
      pr(p[0]) === 'status', 'status');
  });
  // The one that must NOT be downgraded — losing the heat sink is news in Mode 4 just as
  // it is in Mode 5. Under the injection this reads 'absent', not a softer priority.
  ck('Mode 4: losing RHR still ANNUNCIATES as a warning', pr('rhr_not_aligned') + '/' + stOf('rhr_not_aligned'),
    pr('rhr_not_aligned') === 'warning' && stOf('rhr_not_aligned') === 'active_unacknowledged',
    'warning, active_unacknowledged');
  // …and the operator owns the recovery here too. Pressure is below the block-open
  // permissive, so re-alignment is available — the point is that nothing did it for him.
  ck('nothing re-aligned RHR by itself in Mode 4 either', m4.ts().rhr_active,
    m4.ts().rhr_active === false, 'false');
  m4.cmd({ action: 'set_rhr', active: true });
  m4.run(20);
  ck('operator re-alignment clears it, still in Mode 4',
    'mode ' + m4.ins().plant_mode + ', ' + stOf('rhr_not_aligned'),
    m4.ins().plant_mode === 4 && stOf('rhr_not_aligned') === 'clear', 'mode 4, clear');
}));

T.push(test('Failure bookkeeping — re-inject updates severity in place; snapshot {id,severity}', function (ck) {
  var s = new Stack('hot_full_power');
  s.cmd({ action: 'inject_failure', failure_id: 'sgtr', severity: 0.3 });
  var af1 = s.layer.getActiveFailures();
  ck('active_failures carries {id,severity}', JSON.stringify(af1), af1.length === 1 && af1[0].id === 'sgtr' && Math.abs(af1[0].severity - 0.3) < 1e-9, '[{sgtr,0.3}]');
  s.cmd({ action: 'inject_failure', failure_id: 'sgtr', severity: 0.7 });   // re-inject
  var af2 = s.layer.getActiveFailures();
  ck('re-inject updates in place (no duplicate)', af2.length, af2.length === 1, '1 entry');
  ck('severity updated to 0.7', af2[0].severity, Math.abs(af2[0].severity - 0.7) < 1e-9, '0.7');
  s.cmd({ action: 'clear_failure', failure_id: 'sgtr' });
  ck('clear removes it', s.layer.getActiveFailures().length, s.layer.getActiveFailures().length === 0, '0');
}));

T.push(test('Failure catalog — built from data, categorized, with severity meta', function (ck) {
  var s = new Stack('hot_full_power');
  var cat = s.layer.getFailureCatalog();
  var sgtr = cat.find(function (e) { return e.id === 'sgtr'; });
  var sensor = cat.find(function (e) { return e.id === 'tavg_sensor_failure'; });
  var cats = {}; cat.forEach(function (e) { cats[e.category] = true; });
  ck('catalog non-empty', cat.length, cat.length >= 20, '≥ 20');
  ck('sgtr categorized coolant + has severity_meta', sgtr && sgtr.category + '/' + !!sgtr.severity_meta, sgtr && sgtr.category === 'coolant' && !!sgtr.severity_meta, 'coolant/true');
  ck('instrument failure categorized', sensor && sensor.category, sensor && sensor.category === 'instrument', 'instrument');
  ck('uses the documented category set', Object.keys(cats).join(','),
    Object.keys(cats).every(function (c) { return ['reactivity', 'coolant', 'power', 'instrument', 'safety_system'].indexOf(c) !== -1; }), 'valid categories');
}));

T.push(test('Save / restore — layer runtime state round-trips', function (ck) {
  var s = new Stack('hot_full_power', 7);
  s.run(1);
  s.cmd({ action: 'inject_failure', failure_id: 'sgtr', severity: 0.4 });
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'stuck', value: 320 });
  s.run(1);
  s.cmd({ action: 'acknowledge_alarm', alarm_id: 'high_tavg' });
  var snap = s.layer.saveState();
  // Mutate, then restore.
  s.cmd({ action: 'clear_all_failures' });
  s.layer.register = 'industry';
  s.layer.loadState(snap);
  ck('register restored', s.layer.register, s.layer.register === 'learning', 'learning');
  ck('active failure + severity restored', JSON.stringify(s.layer.getActiveFailures()), s.layer.getActiveFailures().length === 1 && Math.abs(s.layer.getActiveFailures()[0].severity - 0.4) < 1e-9, '[{sgtr,0.4}]');
  ck('alarm ack state restored', s.alarm('high_tavg').state, s.alarm('high_tavg').state === 'active_acknowledged', 'active_acknowledged');
}));

T.push(test('Save / restore — trip blocks and derived trip status round-trip (#151)', function (ck) {
  // The BUG this pins: lastInstruments (the previous step's readings) was not
  // rebuilt on restore, so getRpsState() computed every blockable trip's
  // `asserted` from {} and reported false until the next step — the run_m5 rewind
  // bit-exactness red, and briefly wrong trip-block buttons after any restore.
  //
  // The tripBlocks assertions below are coverage, not a fix: those already
  // round-trip correctly inside the `automation` blob (_saveAutomation /
  // _loadAutomation). They are asserted here so that stays true, and so nobody
  // "helpfully" adds a second top-level copy of them to saveState.
  var s = new Stack('hot_full_power', 7);
  s.run(2);
  var before = s.layer.getRpsState();
  var blockedIds = Object.keys(before.trip_blocks);
  ck('at-power lineup has blocked trips to lose', blockedIds.join(','), blockedIds.length > 0, 'non-empty');
  var assertedBefore = Object.keys(before.trip_block_status)
    .filter(function (k) { return before.trip_block_status[k].asserted; });
  ck('...and some trips genuinely asserted', assertedBefore.join(','), assertedBefore.length > 0, 'non-empty');

  var snap = s.layer.saveState();
  s.layer.tripBlocks = {};                 // mutate both, then restore
  s.layer.manualTripBlocks = {};
  s.layer.lastInstruments = {};
  s.layer.loadState(snap);

  var after = s.layer.getRpsState();
  ck('trip blocks restored', JSON.stringify(after.trip_blocks),
    JSON.stringify(after.trip_blocks) === JSON.stringify(before.trip_blocks),
    JSON.stringify(before.trip_blocks));
  ck('derived asserted flags restored (lastInstruments rebuilt from the engine)',
    JSON.stringify(after.trip_block_status) === JSON.stringify(before.trip_block_status)
      ? 'identical' : JSON.stringify(after.trip_block_status),
    JSON.stringify(after.trip_block_status) === JSON.stringify(before.trip_block_status),
    'identical');

  // A manual block must round-trip, and must stay distinguishable from an
  // automatic one — manualTripBlocks is what survives auto-reinstate.
  // Set it directly rather than via block_trip: the manual rule refuses a block
  // on an already-asserted trip, so which ids are blockable depends on plant
  // state, and this test is about persistence, not the block rule.
  var freeTrip = (s.layer.config.trips || []).filter(function (t) {
    return t.blockable && t.id && !s.layer.tripBlocks[t.id];
  })[0];
  ck('a blockable trip exists that is not already blocked', freeTrip ? freeTrip.id : 'none',
    !!freeTrip, 'some trip id');
  if (freeTrip) {
    s.layer.tripBlocks[freeTrip.id] = true;
    s.layer.manualTripBlocks[freeTrip.id] = true;
    var withManual = s.layer.saveState();
    s.layer.tripBlocks = {}; s.layer.manualTripBlocks = {};
    s.layer.loadState(withManual);
    ck('manual trip block survives the round-trip',
      String(!!s.layer.manualTripBlocks[freeTrip.id]),
      s.layer.manualTripBlocks[freeTrip.id] === true, 'true');
    ck('...and stays in the blocked set too',
      String(!!s.layer.tripBlocks[freeTrip.id]),
      s.layer.tripBlocks[freeTrip.id] === true, 'true');
    delete s.layer.tripBlocks[freeTrip.id];
    delete s.layer.manualTripBlocks[freeTrip.id];
  }

  // Old saves carry no trip_blocks inside `automation` — those must still load,
  // re-deriving the at-power lineup so a pre-NIS save does not insta-trip.
  var legacy = s.layer.saveState();
  delete legacy.automation.trip_blocks; delete legacy.automation.manual_trip_blocks;
  s.layer.loadState(legacy);
  ck('legacy save without trip blocks still loads (re-derives the at-power lineup)',
    JSON.stringify(s.layer.getRpsState().trip_blocks),
    JSON.stringify(s.layer.getRpsState().trip_blocks) === JSON.stringify(before.trip_blocks),
    'initial at-power lineup');
}));

T.push(test('Interlock — rod withdrawal blocked on high startup rate (HR1: reads the instrument)', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(1);
  var ok = s.cmd({ action: 'rod_start', group_id: 'control_rods', direction: 1, speed: 'slow' });
  ck('withdrawal free with SUR normal', JSON.stringify(ok), !(ok && ok.type === 'blocked'), 'not blocked');
  s.cmd({ action: 'rod_stop_all' });
  // Force the SUR INSTRUMENT high (truth stays calm) — the interlock must follow
  // the indication, like every other automatic decision (HR1).
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'startup_rate', mode: 'stuck', value: 4.0 });
  s.run(0.5);
  var b1 = s.cmd({ action: 'rod_start', group_id: 'control_rods', direction: 1, speed: 'slow' });
  ck('withdrawal blocked with a labelled refusal', JSON.stringify(b1), b1 && b1.type === 'blocked' && b1.code === 'INTERLOCK', '{type:blocked, code:INTERLOCK}');
  var b2 = s.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: 5 });
  ck('outward nudge blocked too', JSON.stringify(b2), b2 && b2.type === 'blocked', 'blocked');
  var ins = s.cmd({ action: 'rod_start', group_id: 'control_rods', direction: -1, speed: 'slow' });
  ck('INSERTION always works (withdrawal_only)', JSON.stringify(ins), !(ins && ins.type === 'blocked'), 'not blocked');
  s.cmd({ action: 'rod_stop_all' });
  var alarm = s.alarm('sur_high');
  ck('SUR HIGH annunciator explains the block', alarm && alarm.state, alarm && alarm.state !== 'clear', 'active');
  s.cmd({ action: 'clear_instrument_failure', instrument_id: 'startup_rate' });
  s.run(3);   // reading lags back below clears_below (1.5)
  var ok2 = s.cmd({ action: 'rod_start', group_id: 'control_rods', direction: 1, speed: 'slow' });
  ck('interlock clears when the rate settles', JSON.stringify(ok2), !(ok2 && ok2.type === 'blocked'), 'not blocked');
  s.cmd({ action: 'rod_stop_all' });
}));

// -------- P-14 high-high SG level protection (turbine trip + feed isolation + P-9 reactor trip) --------

T.push(test('P-14 — high-high SG level: turbine trip + feedwater isolation + reactor trip (P-9)', function (ck) {
  var s = new Stack('hot_full_power');
  s.run(2);
  ck('baseline clean (no trip, feed available, turbine running)',
    [s.layer.rps.scrammed, !!s.engine.s.feedwater_isolated, !!s.engine.s.turbine_tripped].join(','),
    s.layer.rps.scrammed === false && !s.engine.s.feedwater_isolated && !s.engine.s.turbine_tripped, 'clean');
  // Drive the SG LEVEL INSTRUMENT above the 90% high-high setpoint (the control layer
  // actuates on instruments, HR1). At full power the P-9 permissive (above_p9) is met.
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'sg_level', mode: 'stuck', value: 95 });
  s.run(2);
  ck('turbine tripped (P-14)', String(s.engine.s.turbine_tripped), s.engine.s.turbine_tripped === true, 'tripped');
  ck('main feedwater isolated (P-14)', String(s.engine.s.feedwater_isolated), s.engine.s.feedwater_isolated === true, 'isolated');
  ck('reactor tripped via the P-9 cascade', s.layer.rps.last_trip_reason || 'none', s.layer.rps.scrammed === true, 'scrammed');
  ck('SG LVL HI HI (P-14) alarm annunciates', s.alarm('sg_level_hihi') && s.alarm('sg_level_hihi').state,
    s.alarm('sg_level_hihi') && s.alarm('sg_level_hihi').state !== 'clear', 'active');
}));

T.push(test('P-14 / P-9 — below 50% power, high-high SG trips turbine + isolates feed but does NOT scram', function (ck) {
  var s = new Stack('5_percent');
  s.run(2);
  ck('plant is below the P-9 permissive (< 50% power)', s.ts().power_pct.toFixed(1) + '%', s.ts().power_pct < 50, '< 50%');
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'sg_level', mode: 'stuck', value: 95 });
  s.run(2);
  ck('turbine still trips (P-14 is not power-gated)', String(s.engine.s.turbine_tripped), s.engine.s.turbine_tripped === true, 'tripped');
  ck('feedwater still isolates (P-14 is not power-gated)', String(s.engine.s.feedwater_isolated), s.engine.s.feedwater_isolated === true, 'isolated');
  ck('NO reactor trip below P-9 (the cascade is power-gated)', String(s.layer.rps.scrammed), s.layer.rps.scrammed === false, 'not scrammed');
}));

// ---------------------------------------------------------------------------
// #240 — alarm CONDITION PROCESSING. Owner ruling 2026-07-28: mode-dependent
// severity (option 1) + reword the RCP annunciator when the pumps were secured
// rather than tripped (option 2). Sourced to NUREG-0700 Rev 4 (ML26022A094)
// §4.1.2-7 / Table 4.1 — see the comment block over ControlLayer._reclassify.
//
// The four suites below are deliberately split into the two claims that MUST
// change and the two that MUST NOT. The must-nots pin what the reclassification
// is forbidden to touch, which is the half of this feature that can go wrong
// silently (HR10).
//
// Validated against the OLD behaviour, 2026-07-28 (`git stash` of the four source
// files, this file kept): every SUBSTANTIVE check in the two must-not suites
// passes pre-#240 — PZR PRESS LO stays warning, PZR PRESS LO LO stays critical,
// TURB TRIP stays warning post-trip, the lifecycle and ACK behaviour are
// unchanged, and stripping the rules reproduces the old two standing criticals.
// The only pre-#240 failures there are the checks that read machinery which did
// not yet exist (`plant_mode`, `base_priority`), which cannot be satisfied on
// either side. Both must-change suites fail wholesale pre-#240, as they should.
// ---------------------------------------------------------------------------

T.push(test('#240 — a planned Mode 5 lineup annunciates as STATUS, not as a casualty', function (ck) {
  var s = new Stack('cold_shutdown');
  s.run(2);
  ck('plant declares Mode 5', String(s.ins().plant_mode), s.ins().plant_mode === 5, '5');
  var active = s.layer.getAlarms().filter(function (a) { return a.state !== 'clear'; });
  var crit = active.filter(function (a) { return a.priority === 'critical'; });
  // The headline defect: two CRITICAL alarms standing on a healthy, planned
  // cold-shutdown spawn. Pre-#240 this observed 2 (pzr_pressure_lolo, rcp_trip).
  ck('no critical alarm stands on a healthy cold plant', crit.map(function (a) { return a.id; }).join(',') || 'none',
     crit.length === 0, 'none');
  // …but every condition is still annunciated. Reclassify must never filter.
  ck('all five conditions still annunciate', active.length, active.length === 5, '5');
  ['low_tavg', 'pzr_pressure_low', 'pzr_pressure_lolo', 'rcp_trip', 'turbine_trip'].forEach(function (id) {
    var a = s.alarm(id);
    ck(id + ' reads status', a && a.priority, a && a.priority === 'status', 'status');
    // §4.3.6-3: personnel must not be left to guess that a mode-defined change
    // took effect — the tile says why, and reports what it was authored as.
    ck(id + ' says it was reclassified', a && a.base_priority, a && !!a.base_priority, 'a base priority');
  });
  ck('the RCP tile reads SECURED, not TRIP', s.alarm('rcp_trip').tile_label,
     /Secured/.test(s.alarm('rcp_trip').tile_label), 'Reactor Coolant Pumps Secured');
}));

T.push(test('#240 — the RCP annunciator discriminates SECURED from TRIPPED, in any mode', function (ck) {
  // Option 2 is keyed on the handswitch, NOT on the plant mode: securing at power
  // is planned, and a pump lost in Mode 5 is still a casualty. Both directions.
  var s = new Stack('hot_full_power');
  s.run(2);
  s.cmd({ action: 'set_rcp', running: false });
  s.run(2);
  ck('secured by command at power → status', s.alarm('rcp_trip').priority, s.alarm('rcp_trip').priority === 'status', 'status');
  ck('…and reads SECURED', s.alarm('rcp_trip').tile_label, /Secured/.test(s.alarm('rcp_trip').tile_label), 'Secured');
  // A fault ON TOP of a securing must revert the tile — the pumps are now lost,
  // whatever the operator intended a moment ago.
  s.cmd({ action: 'inject_failure', failure_id: 'rcp_trip' });
  s.run(2);
  ck('a trip injected on top reverts to critical', s.alarm('rcp_trip').priority, s.alarm('rcp_trip').priority === 'critical', 'critical');
  ck('…and reads TRIP again', s.alarm('rcp_trip').tile_label, /Trip/.test(s.alarm('rcp_trip').tile_label), 'Reactor Coolant Pump Trip');
  // The mirror case: a genuine loss of the pumps in the COLD plant, where a
  // mode-based rule would have wrongly called it planned.
  var c = new Stack('cold_shutdown');
  c.run(2);
  c.cmd({ action: 'set_rcp', running: true });     // heatup: pumps started
  c.run(2);
  ck('RCP alarm clears once the pumps run', c.alarm('rcp_trip').state, c.alarm('rcp_trip').state === 'clear', 'clear');
  c.cmd({ action: 'inject_failure', failure_id: 'rcp_trip' });
  c.run(2);
  ck('a pump lost in Mode 5 still reads CRITICAL', c.alarm('rcp_trip').priority,
     c.alarm('rcp_trip').priority === 'critical', 'critical');
}));

T.push(test('#240 — Mode 3 keeps full severity (the mode floor must not reach Hot Standby)', function (ck) {
  // Hot Standby is where a plant sits after a trip and where a real
  // depressurization must read at full severity. This suite passes on the
  // pre-#240 code too: it pins what must NOT move.
  var s = new Stack('hot_zero_power');   // the Mode 3, Hot Standby IC
  s.run(2);
  ck('plant declares Mode 3', String(s.ins().plant_mode), s.ins().plant_mode === 3, '3');
  // Drive the pressure indication below both alarm setpoints without touching
  // the mode (a stuck transmitter — the alarm layer reads instruments, HR1).
  s.cmd({ action: 'set_instrument_failure', instrument_id: 'primary_pressure', mode: 'stuck', value: 12.0 });
  s.run(2);
  ck('PZR PRESS LO stays a warning in Mode 3', s.alarm('pzr_pressure_low').priority,
     s.alarm('pzr_pressure_low').priority === 'warning', 'warning');
  ck('PZR PRESS LO LO stays CRITICAL in Mode 3', s.alarm('pzr_pressure_lolo').priority,
     s.alarm('pzr_pressure_lolo').priority === 'critical', 'critical');
  ck('neither carries a base_priority (no rule fired)', String(s.alarm('pzr_pressure_lolo').base_priority),
     s.alarm('pzr_pressure_lolo').base_priority === undefined, 'undefined');
  // The post-trip case for the turbine annunciator: after a scram the plant is in
  // Mode 3 with the turbine tripped, and that is real news, not a lineup.
  var t = new Stack('hot_full_power');
  t.run(2);
  t.cmd({ action: 'scram' });
  t.run(60);
  ck('post-trip plant is in Mode 3', String(t.ins().plant_mode), t.ins().plant_mode === 3, '3');
  ck('TURB TRIP stays a warning post-trip', t.alarm('turbine_trip').priority,
     t.alarm('turbine_trip').priority === 'warning', 'warning');
}));

T.push(test('#240 — reclassification never suppresses, delays or invents an annunciation', function (ck) {
  // The HR1 property the whole mechanism rests on: a rule may not suppress, delay
  // or invent an annunciation. Same instrument condition, same lifecycle — only
  // priority, label, and (per the follow-up ruling) the ACK demand differ.
  //
  // CHANGED 2026-07-29 by the follow-up ruling ("I want status-class alarms to
  // spawn (and arrive) pre-acknowledged"): this suite used to assert that every
  // active tile read `active_unacknowledged`, which was true pre-ruling and is
  // deliberately false now. What it was actually pinning — that a reclassified
  // tile is genuinely ACTIVE and runs a normal lifecycle — is pinned below
  // without pinning the ack state, which its own suite now owns.
  var s = new Stack('cold_shutdown');
  s.run(2);
  var alarms = s.layer.getAlarms();
  var active = alarms.filter(function (a) { return a.state !== 'clear'; });
  ck('reclassified tiles carry a real lifecycle state', active.map(function (a) { return a.state; }).join(','),
     active.every(function (a) { return a.state === 'active_acknowledged' || a.state === 'active_unacknowledged'; }),
     'all active_*');
  // …and it ends normally: the condition goes away, the tile clears, whatever it
  // was reclassified to. On its OWN stack — `s` must keep its reclassified tiles
  // active for the restore check at the bottom of this suite.
  var lc = new Stack('cold_shutdown');
  lc.run(2);
  lc.cmd({ action: 'set_rcp', running: true });
  lc.run(2);
  ck('a reclassified alarm clears normally', lc.alarm('rcp_trip').state,
     lc.alarm('rcp_trip').state === 'clear', 'clear');
  // And a CLEAR alarm is never reclassified (there is nothing to present).
  ck('a clear alarm carries no base_priority', String(s.alarm('high_flux').base_priority),
     s.alarm('high_flux').base_priority === undefined, 'undefined');
  // Falsification: with the rules stripped, the Mode 5 spawn must go back to
  // reading two criticals. This is what proves the suite above is measuring the
  // rules and not some incidental property of the cold IC.
  //
  // The alarm SPECS are shared module-level objects (config.alarms is a concat,
  // but its elements are not copies), so this saves and restores rather than
  // deleting — leaving them stripped would silently disarm any later suite.
  var bare = new Stack('cold_shutdown');
  var saved = bare.layer.config.alarms.map(function (a) { return a.reclassify; });
  bare.layer.config.alarms.forEach(function (a) { delete a.reclassify; });
  var bareCrit;
  try {
    bare.run(2);
    bareCrit = bare.layer.getAlarms().filter(function (a) {
      return a.state !== 'clear' && a.priority === 'critical';
    });
  } finally {
    bare.layer.config.alarms.forEach(function (a, i) { if (saved[i]) a.reclassify = saved[i]; });
  }
  ck('without the rules, the old 2 criticals return', bareCrit.map(function (a) { return a.id; }).join(','),
     bareCrit.length === 2 && bareCrit.map(function (a) { return a.id; }).sort().join(',') === 'pzr_pressure_lolo,rcp_trip',
     'pzr_pressure_lolo,rcp_trip');
  ck('the rules are restored afterwards', String(!!s.alarm('rcp_trip').base_priority),
     !!s.layer.getAlarms().find(function (a) { return a.id === 'rcp_trip'; }).base_priority, 'true');
}));

// ---------------------------------------------------------------------------
// #240 follow-up — the STATUS class does not demand an acknowledgment.
// Owner ruling 2026-07-29: "I want status-class alarms to spawn (and arrive)
// pre-acknowledged." NUREG-0700 Rev 4 Table 4.1, Status-Alarm Separation:
// "separates status annunciators from alarms that require operator action."
//
// This is the whole `status` tier, not only #240's reclassified tiles — the
// authored ones (hpi_active here; RCIC RUNNING on the BWR) have never required
// action either and demanded an ACK anyway.
//
// Both suites FAIL wholesale on the pre-ruling source (everything active spawned
// unacknowledged), as they must. The regression checks inside them — a warning
// alarm still arrives unacknowledged, an operator ack is never undone — pass on
// BOTH sides, which is what makes them worth having.
// ---------------------------------------------------------------------------

T.push(test('#240 — a status-class alarm arrives pre-acknowledged; a real one still does not', function (ck) {
  // (a) reclassified status: the whole cold-shutdown spawn.
  var s = new Stack('cold_shutdown');
  s.run(2);
  var active = s.layer.getAlarms().filter(function (a) { return a.state !== 'clear'; });
  var unack = active.filter(function (a) { return a.state === 'active_unacknowledged'; });
  ck('the healthy cold spawn asks for no acknowledgment', unack.map(function (a) { return a.id; }).join(',') || 'none',
     unack.length === 0, 'none');
  ck('…and all five are still annunciating', active.length, active.length === 5, '5');
  ck('every one reads acknowledged', active.map(function (a) { return a.state; }).join(','),
     active.every(function (a) { return a.state === 'active_acknowledged'; }), 'all active_acknowledged');

  // (b) AUTHORED status, with no reclassify rule anywhere near it.
  var h = new Stack('hot_full_power');
  h.run(1);
  ck('HPI/LPI ACTIVE is authored `status`', h.alarm('hpi_active').priority,
     h.alarm('hpi_active').priority === 'status', 'status');
  ck('…with no rule involved', String(h.alarm('hpi_active').base_priority),
     h.alarm('hpi_active').base_priority === undefined, 'undefined');
  h.cmd({ action: 'set_hpi', active: true });
  h.run(1);
  ck('an authored status alarm arrives acknowledged too', h.alarm('hpi_active').state,
     h.alarm('hpi_active').state === 'active_acknowledged', 'active_acknowledged');

  // (c) The regression that matters: a real alarm is untouched. Passes pre-ruling.
  h.cmd({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'stuck', value: 320 });
  h.run(1);
  ck('a warning alarm still arrives UNACKNOWLEDGED', h.alarm('high_tavg').state,
     h.alarm('high_tavg').state === 'active_unacknowledged', 'active_unacknowledged');
  ck('…and still reads warning', h.alarm('high_tavg').priority,
     h.alarm('high_tavg').priority === 'warning', 'warning');
}));

T.push(test('#240 — an auto-acknowledged alarm hands the ACK back when it escalates', function (ck) {
  // The failure mode this exists to prevent: the plant acknowledges a tile
  // because the condition is planned, the condition then stops being planned, and
  // a genuine critical sits lit and steady having never flashed.
  var s = new Stack('hot_full_power');
  s.run(2);
  s.cmd({ action: 'set_rcp', running: false });          // planned securing
  s.run(2);
  ck('secured pumps annunciate as status', s.alarm('rcp_trip').priority,
     s.alarm('rcp_trip').priority === 'status', 'status');
  ck('…and arrive acknowledged', s.alarm('rcp_trip').state,
     s.alarm('rcp_trip').state === 'active_acknowledged', 'active_acknowledged');
  s.cmd({ action: 'inject_failure', failure_id: 'rcp_trip' });   // now a casualty
  s.run(2);
  ck('the escalated alarm is critical again', s.alarm('rcp_trip').priority,
     s.alarm('rcp_trip').priority === 'critical', 'critical');
  ck('…and DEMANDS acknowledgment again', s.alarm('rcp_trip').state,
     s.alarm('rcp_trip').state === 'active_unacknowledged', 'active_unacknowledged');
  ck('the auto-ack bookkeeping was released', JSON.stringify(s.layer.alarmAutoAcked),
     s.layer.alarmAutoAcked.rcp_trip === undefined, 'no rcp_trip entry');

  // An OPERATOR acknowledgment is never handed back — only the plant's own is.
  s.cmd({ action: 'acknowledge_alarm', alarm_id: 'rcp_trip' });
  s.run(2);
  ck('an operator ack sticks through the same evaluation', s.alarm('rcp_trip').state,
     s.alarm('rcp_trip').state === 'active_acknowledged', 'active_acknowledged');

  // Save/restore carries the distinction: without it, a restored cold plant would
  // never hand its acknowledgments back on heatup.
  var c = new Stack('cold_shutdown');
  c.run(2);
  ck('the cold spawn records what IT acknowledged', Object.keys(c.layer.alarmAutoAcked).sort().join(','),
     Object.keys(c.layer.alarmAutoAcked).length === 5, '5 ids');
  c.layer.loadState(c.layer.saveState());
  ck('…and it round-trips', Object.keys(c.layer.alarmAutoAcked).sort().join(','),
     Object.keys(c.layer.alarmAutoAcked).length === 5, '5 ids');
  // Old saves predate the field: nothing is auto-acked, so nothing is handed
  // back. Conservative — re-flashing a tile the operator dealt with is the
  // harmful direction.
  var legacy = c.layer.saveState();
  delete legacy.alarmAutoAcked;
  c.layer.loadState(legacy);
  ck('an old save restores with no auto-acks', JSON.stringify(c.layer.alarmAutoAcked),
     Object.keys(c.layer.alarmAutoAcked).length === 0, '{}');
  ck('…and the alarm states themselves are unharmed', c.alarm('rcp_trip').state,
     c.alarm('rcp_trip').state === 'active_acknowledged', 'active_acknowledged');
}));

// #273 — the accumulator-isolation cue, and the lineup gate that makes it usable.
//
// THIS IS THE BY-INJECTION PROOF. The interesting checks are 4 and 5: the alarm must go
// ACTIVE on a cold plant whose discharge valve is still open, and CLEAR the moment it is
// shut. Checks 2 and 3 are the other half — an alarm that also fires at power, or in the
// shipped Mode 5 lineup where the tanks are correctly isolated, would be a nuisance tile
// and would have been "green" against pressure alone. The whole point of `condition` is
// that pressure alone is not the condition.
T.push(test('#273 — SI ACCUM ALIGNED annunciates on the lineup, not on pressure alone', function (ck) {
  var ins = function (s) { return s.engine.getInstruments(); };

  // 1. the indication exists and tracks the valve (it is what the gate reads).
  var v = new Stack('hot_zero_power', 7).run(2);
  ck('accum_valve_open is an indication', 'accum_valve_open' in ins(v), 'accum_valve_open' in ins(v), 'present');
  ck('…and reads ALIGNED by default', ins(v).accum_valve_open, ins(v).accum_valve_open === true, 'true');
  v.cmd({ action: 'close_accumulator_valve' }); v.run(1);
  ck('…follows the isolate command', ins(v).accum_valve_open, ins(v).accum_valve_open === false, 'false');
  v.cmd({ action: 'open_accumulator_valve' }); v.run(1);
  ck('…and the re-align command', ins(v).accum_valve_open, ins(v).accum_valve_open === true, 'true');

  // 2. at power — aligned, but nowhere near the setpoint. Must be silent.
  var h = new Stack('hot_full_power', 7).run(20);
  ck('silent at power (aligned, 2235 psi)', h.alarm('accum_aligned').state,
     h.alarm('accum_aligned').state === 'clear', 'clear');

  // 3. the shipped Mode 5 lineup is ALREADY isolated — silent, with no mode rule needed.
  var c = new Stack('cold_shutdown', 7).run(20);
  ck('cold_shutdown ships isolated', ins(c).accum_valve_open, ins(c).accum_valve_open === false, 'false');
  ck('…so the cue is silent in Mode 5', c.alarm('accum_aligned').state,
     c.alarm('accum_aligned').state === 'clear', 'clear');

  // 4. THE INJECTION. Same cold plant, valve left aligned — the #273 defect state.
  var d = new Stack('cold_shutdown', 7).run(5);
  d.cmd({ action: 'open_accumulator_valve' }); d.run(5);
  var p = ins(d).primary_pressure;
  ck('cold + ALIGNED annunciates', d.alarm('accum_aligned').state,
     d.alarm('accum_aligned').state !== 'clear', 'not clear');
  ck('…below the 1000 psi (6.895 MPa) setpoint', (p * 145.038).toFixed(0) + ' psi', p < 6.895, '< 1000 psi');
  ck('…as a caution, not a status (it wants an ACK)', d.alarm('accum_aligned').priority,
     d.alarm('accum_aligned').priority === 'caution', 'caution');

  // 5. …and isolating is what clears it. This is the operator action the cue exists for.
  d.cmd({ action: 'close_accumulator_valve' }); d.run(5);
  ck('isolating clears the cue', d.alarm('accum_aligned').state,
     d.alarm('accum_aligned').state === 'clear', 'clear');

  // 6. the conditioned alarm must NOT have been paired as a lo_lo escalation of the
  // pressurizer low-pressure tiles that share its instrument (control_kernel
  // _buildAlarmModel). If it had been, it would silently require their condition too.
  ck('not paired as an escalation of a pzr-pressure tile', String(d.layer._loSibling['accum_aligned']),
     !d.layer._loSibling['accum_aligned'], 'undefined');
}));

// -------- report --------
var GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', RST = '\x1b[0m', BOLD = '\x1b[1m';
var pass = 0, fail = 0;
T.forEach(function (r) {
  console.log('\n' + (r.pass ? GREEN + 'PASS' + RST : RED + 'FAIL' + RST) + '  ' + BOLD + r.name + RST);
  r.checks.forEach(function (c) {
    console.log((c.pass ? GREEN + '  ✓' + RST : RED + '  ✗' + RST) + ' ' + c.desc +
      DIM + (c.pass ? '  (' + c.observed + ')' : '  [expected ' + c.expected + ', observed ' + c.observed + ']') + RST);
    if (c.pass) pass++; else fail++;
  });
});
var suites = T.filter(function (r) { return r.pass; }).length;
console.log('\n' + BOLD + '──────────────────────────────────────────' + RST);
console.log(BOLD + 'Suites: ' + suites + '/' + T.length + RST + '   Checks: ' + GREEN + pass + ' passed' + RST + (fail ? ', ' + RED + fail + ' failed' + RST : ''));
process.exit(fail ? 1 : 0);
