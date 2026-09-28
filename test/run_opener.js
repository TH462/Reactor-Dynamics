/*
 * run_opener.js — the full-power opener (#811), played FULL STACK through the service exactly
 * as the UI drives it: free-play boot at hot_full_power, `start_opener`, real broadcasts, real
 * automation lineup, the instructor's authored speeds, real attention stops.
 *
 *   node test/run_opener.js
 *
 * THREE ROUTES, because an opener that only works for the player who does exactly what it says
 * is a strand for everyone else (CLAUDE.md, walkthrough routes; #811 brief):
 *   typical    — does what is asked: 80 MWe, rods in 45, spray full until told, AUTO, SCRAM.
 *   mistake    — does it differently: 90 MWe, rods in 15 then 20 more, spray open 10 s then
 *                AUTO BEFORE being asked, never presses SCRAM (the instructor trips it).
 *   hands_off  — presses Ready and nothing else; every ask must be completed by the instructor.
 *
 * Each beat's EFFECT is asserted on the snapshot the player sees (instruments, the lit
 * AUTO), not on the beat having fired. The static half checks the copy: both registers, no SI
 * (OWNER RULING 2026-09-06, checklists carry no SI), <= 25 words a line, every speed change
 * stated in the text, every highlight resolvable on the board, every ask has an inaction exit.
 */
'use strict';
var path = require('path');
global.window = global;                       // board scripts attach to window.RD
function load(p) { require(path.join(__dirname, '..', p)); }
[
  'engines/load_mode.js', 'engines/pwr/pwr_config.js', 'layers/control/pwr_control.js',
  'engines/pwr/pwr_instruments.js',
  'engines/pwr2/pwr2_water.js', 'engines/pwr2/pwr2_vtable.js', 'engines/pwr2/pwr2_geometry.js',
  'engines/pwr2/pwr2_core.js', 'engines/pwr2/pwr2_loop.js', 'engines/pwr2/pwr2_kinetics.js',
  'engines/pwr2/pwr2_fuel.js', 'engines/pwr2/pwr2_reactor.js', 'engines/pwr2/pwr2_sources.js',
  'engines/pwr2/pwr2_sg.js', 'engines/pwr2/pwr2_turbine.js', 'engines/pwr2/pwr2_relief.js',
  'engines/pwr2/pwr2_condenser.js', 'engines/pwr2/pwr2_cvcs.js', 'engines/pwr2/pwr2_eccs.js',
  'engines/pwr2/pwr2_afw.js', 'engines/pwr2/pwr2_damage.js', 'engines/pwr2/pwr2_protection.js',
  'engines/pwr2/pwr2_pressurizer.js', 'engines/pwr2/pwr2_dumpctl.js', 'engines/pwr2/pwr2_break.js',
  'engines/pwr2/pwr2_containment.js', 'engines/pwr2/pwr2_rhr.js', 'engines/pwr2/pwr2_true_state.js',
  'engines/pwr2/pwr2_instruments.js', 'engines/pwr2/pwr2_feedwater.js', 'engines/pwr2/pwr2_engine.js',
  'engines/pwr2/pwr2_shell.js',
  'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js',
  // the board DRIVER only (its highlight vocabulary), same as run_campaign
  'ui/diagram/board/pwr_board_data.js', 'ui/diagram/board/pwr_board_inspect.js',
  'ui/manual_md.js', 'ui/diagram/board/pwr_board_wiring.js',
  'scenarios/opener_pwr2_hfp.js',
].forEach(load);
var RD = globalThis.RD;
var OP_ID = 'opener_pwr2_hfp';
var OP = RD.OPENERS && RD.OPENERS[OP_ID];

var T = [];
function test(name, fn) {
  var checks = [];
  var ck = function (d, o, p, e) { checks.push({ desc: d, observed: o, expected: e, pass: !!p }); };
  var t0 = Date.now();
  try { fn(ck); } catch (e) { ck('threw: ' + (e && e.message), String(e && e.stack || e), false, 'no throw'); }
  checks.push({ desc: 'wall ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s', observed: '', expected: '', pass: true, info: true });
  T.push({ name: name, pass: checks.every(function (c) { return c.pass; }), checks: checks });
}

var psi = function (mpa) { return mpa * 145.038; };
var degF = function (c) { return c * 9 / 5 + 32; };
function I(s, id) { return s.instruments[id]; }
// tick() hands back a snapshot whose blocks are REUSED between broadcasts, so a stored reference
// reads the final state for every beat (measured: every beat read 0.4 % power). Copy what is read.
var INST = ['mwe_output', 'primary_pressure', 'tavg', 'steam_dump_valve', 'power_range', 'pzr_spray_flow'];
function rec(s) {
  var o = { instruments: {}, true_state: {}, control_state: { spray_auto: s.control_state.spray_auto },
            rps_state: { scrammed: !!(s.rps_state && s.rps_state.scrammed) },
            metadata: { time_acceleration: s.metadata.time_acceleration },
            instructor: s.instructor };
  INST.forEach(function (k) { o.instruments[k] = s.instruments[k]; });
  ['rod_steps', 'pzr_heater_kw', 'core_heat_pct', 'turbine_tripped'].forEach(function (k) { o.true_state[k] = s.true_state[k]; });
  return o;
}
function words(t) { return String(t).trim().split(/\s+/).length; }

// ------------------------------------------------------------------ the driver
// Boots like the UI (free play at hot_full_power), then starts the opener. `route` maps a beat id
// to [{ at: sim seconds after that beat fired, cmd }]. Records the snapshot at every beat fire and
// the wall clock the player would spend (broadcast period per tick, 0.1 s — 0.05 s in a transient).
function play(route, budgetS) {
  var svc = new RD.SimulationService({ seed: 42 });
  svc.selectPlant('pwr2', 'hot_full_power');
  svc.attentionStops = true;
  svc.handleCommand({ action: 'start_opener', opener_id: OP_ID });
  var start = rec(svc.assembleSnapshot());
  var fired = [], at = {}, snaps = {}, pending = [], wall = 0, lc = null, trace = [];
  var seen = new Set();
  svc.running = true;
  for (var guard = 0; guard < 40000 && !lc; guard++) {
    var ms = svc.broadcastMs;
    var s = rec(svc.tick());
    wall += ms / 1000;
    var fb = svc.instructor.firedBeats;
    fb.forEach(function (id) {
      if (seen.has(id)) return;
      seen.add(id); fired.push(id); at[id] = svc.simTime; snaps[id] = s;
      (route[id] || []).forEach(function (a) { pending.push({ t: svc.simTime + a.at, cmd: a.cmd }); });
    });
    for (var i = pending.length - 1; i >= 0; i--) {
      if (svc.simTime >= pending[i].t) { svc.handleCommand(pending[i].cmd); pending.splice(i, 1); }
    }
    if (guard % 5 === 0) trace.push({ t: svc.simTime, s: s });
    if (s.instructor && s.instructor.level_complete) lc = s;
    if (svc.simTime > budgetS) break;
  }
  return { svc: svc, start: start, fired: fired, at: at, snaps: snaps, wall: wall, lc: lc, trace: trace };
}
function window_(r, fromId, toId, fn) {   // fold fn over trace samples between two beat fires
  var a = r.at[fromId], b = r.at[toId];
  return r.trace.filter(function (x) { return x.t >= a && x.t <= b; }).map(function (x) { return fn(x.s); });
}
function max(a) { return Math.max.apply(null, a); }

var READY = { action: 'instructor_continue' };
var ROUTES = {
  // Delays are a reading player's: read the line, find the control, act (at 1×, so sim = wall).
  typical: {
    o0_hello:  [{ at: 15, cmd: READY }],
    o1_load:   [{ at: 20, cmd: { action: 'set_load_target', mwe: 80 } }],
    o4_rods:   [{ at: 15, cmd: { action: 'rod_nudge', group_id: 'control_rods', steps: -45 } }],
    o6_spray:  [{ at: 20, cmd: { action: 'set_spray', pct: 100 } }],
    o8_auto:   [{ at: 8, cmd: { action: 'set_spray', auto: true } }],
    o10_scram: [{ at: 8, cmd: { action: 'scram' } }],
  },
  mistake: {
    o0_hello:  [{ at: 3, cmd: READY }],
    o1_load:   [{ at: 5, cmd: { action: 'set_load_target', mwe: 90 } }],
    o4_rods:   [{ at: 5, cmd: { action: 'rod_nudge', group_id: 'control_rods', steps: -15 } },
                { at: 40, cmd: { action: 'rod_nudge', group_id: 'control_rods', steps: -20 } }],
    o6_spray:  [{ at: 5, cmd: { action: 'set_spray', pct: 100 } }],
    o7_spray_watch: [{ at: 9, cmd: { action: 'set_spray', auto: true } }],   // closed after ~10 s, BEFORE the ask
    // o10_scram: never pressed — the instructor trips it
  },
  hands_off: {
    o0_hello: [{ at: 8, cmd: READY }],
  },
};
var ROUTE_PATH = {
  typical:   ['o0_hello', 'o1_load', 'o2_watch', 'o3_dump', 'o4_rods', 'o5_rods_watch', 'o6_spray', 'o7_spray_watch', 'o8_auto', 'o9_heaters', 'o10_scram', 'o11_trip', 'o12_settle', 'o13_end'],
  mistake:   ['o0_hello', 'o1_load', 'o2_watch', 'o3_small', 'o4_rods', 'o5_rods_watch', 'o6_spray', 'o7_spray_watch', 'o8_auto', 'o9_heaters', 'o10_scram', 'o10_help', 'o11_trip', 'o12_settle', 'o13_end'],
  hands_off: ['o0_hello', 'o1_load', 'o1_help', 'o2_watch', 'o3_dump', 'o4_rods', 'o4_help', 'o5_rods_watch', 'o6_spray', 'o6_help', 'o7_spray_watch', 'o8_auto', 'o8_help', 'o9_heaters', 'o10_scram', 'o10_help', 'o11_trip', 'o12_settle', 'o13_end'],
};

// ------------------------------------------------------------------ static: the copy
test('opener copy — registers, units, length, speed stated, highlights, exits', function (ck) {
  ck('opener registered in RD.OPENERS', !!OP, !!OP, 'RD.OPENERS.' + OP_ID);
  if (!OP) return;
  ck('keyed to plant + starting condition', OP.plant_id + '/' + OP.initial_state,
     OP.plant_id === 'pwr2' && OP.initial_state === 'hot_full_power', 'pwr2/hot_full_power');
  ck('not a mission (kept out of RD.SCENARIOS)', String(!!(RD.SCENARIOS || {})[OP_ID]), !(RD.SCENARIOS || {})[OP_ID], 'false');
  var labels = RD.PwrBoardDriver && RD.PwrBoardDriver.controlLabels ? RD.PwrBoardDriver.controlLabels() : [];
  var ids = OP.beats.map(function (b) { return b.id; });
  var prevSpeed = 1, bad = [], long = [], si = [], hl = [], spd = [], exits = [], gotos = [];
  OP.beats.forEach(function (b) {
    (b.dialogue || []).forEach(function (l, i) {
      if (!(l.learning && l.industry && l.speaker)) bad.push(b.id + '[' + i + ']');
      ['learning', 'industry'].forEach(function (r) {
        if (words(l[r] || '') > 25) long.push(b.id + '.' + r + '=' + words(l[r]));
        if (/MPa|kPa|°C|\bdeg ?C\b/.test(l[r] || '')) si.push(b.id + '.' + r);
      });
    });
    if (b.highlight && labels.indexOf(b.highlight.control_label) === -1) hl.push(b.id + ':' + b.highlight.control_label);
    if (b.speed != null && b.speed !== prevSpeed) {
      var txt = (b.dialogue || []).map(function (l) { return l.learning + ' ' + l.industry; }).join(' ');
      if (txt.indexOf(b.speed + '×') === -1) spd.push(b.id + '→' + b.speed + '×');
    }
    if (b.speed != null) prevSpeed = b.speed;
    if (b.branches) {
      var hasExit = b.branches.some(function (x) { return x.trigger && (x.trigger.type === 'inaction' || x.trigger.type === 'delay'); });
      if (!hasExit) exits.push(b.id);
      b.branches.forEach(function (x) { if (ids.indexOf(x.goto) === -1) gotos.push(b.id + '→' + x.goto); });
    }
  });
  ck('every line has speaker + both registers', bad.join(',') || 'all', !bad.length, 'none missing');
  ck('every line is 25 words or fewer (both registers)', long.join(',') || 'all', !long.length, '<= 25');
  ck('no SI units in the copy', si.join(',') || 'none', !si.length, 'US units only');
  ck('board resolves every highlight', hl.join(',') || (labels.length + ' labels, all resolve'), labels.length > 0 && !hl.length, 'every label in controlLabels()');
  ck('every speed change is stated in its own beat (N×)', spd.join(',') || 'all stated', !spd.length, 'text names the rung');
  ck('every branch point has a time-only exit (no silent strand)', exits.join(',') || 'all', !exits.length, 'an inaction or delay branch');
  ck('every goto lands on a beat', gotos.join(',') || 'all', !gotos.length, 'defined');
  var last = OP.beats[OP.beats.length - 1];
  ck('ends with a level_complete and a SCRAM before it', last.id + ' / ' + !!last.level_complete,
     !!last.level_complete && ids.indexOf('o10_scram') !== -1 && ids.indexOf('o10_scram') < ids.indexOf(last.id), 'level_complete after the trip');
});

// ------------------------------------------------------------------ lineup + restore
test('the opener runs on the FREE-PLAY plant and survives save/restore', function (ck) {
  function engaged(svc) {
    var by = svc.layer.byId || {}; return Object.keys(by).filter(function (k) { return by[k] && by[k].engaged; }).sort().join(',');
  }
  var free = new RD.SimulationService({ seed: 42 });
  free.selectPlant('pwr2', 'hot_full_power');
  var op = new RD.SimulationService({ seed: 42 });
  op.selectPlant('pwr2', 'cold_shutdown');
  var r = op.handleCommand({ action: 'start_opener', opener_id: OP_ID });
  ck('start_opener loads the opener', r && r.instructor && r.instructor.scenario_id, !!(r && r.instructor && r.instructor.scenario_id === OP_ID), OP_ID);
  ck('...and resets to its starting condition', op.activeInitialState, op.activeInitialState === 'hot_full_power', 'hot_full_power');
  ck('automation lineup = free play\'s', engaged(op) || '(none)', engaged(op) === engaged(free) && engaged(free).length > 0, engaged(free));
  ck('chat block present (renders as a transcript)', String(!!(r.instructor.chat)), !!r.instructor.chat, 'true');
  var bad = op.handleCommand({ action: 'start_opener', opener_id: 'nope' });
  ck('an unknown opener is refused', bad && bad.code, !!(bad && bad.code === 'COMMAND_ERROR'), 'COMMAND_ERROR');
  op.running = true;
  for (var i = 0; i < 30; i++) op.tick();
  op.handleCommand(READY);
  for (i = 0; i < 20; i++) op.tick();
  var saved = op.saveState();
  var back = new RD.SimulationService({ seed: 42 });
  back.loadState(saved);
  ck('a save mid-opener restores the opener, not free play', back.instructor.scenario && back.instructor.scenario.id,
     !!(back.instructor.scenario && back.instructor.scenario.id === OP_ID), OP_ID);
  ck('...on the same beat', back.instructor.currentBeatId + ' vs ' + op.instructor.currentBeatId,
     back.instructor.currentBeatId === op.instructor.currentBeatId, 'equal');
  op.handleCommand({ action: 'stop_scenario' });
  ck('stop_scenario ends it (one click → free play)', String(op.instructor.mode), op.instructor.mode === null, 'null');
});

// ------------------------------------------------------------------ the routes
var RESULTS = {};
Object.keys(ROUTES).forEach(function (name) {
  test('route: ' + name, function (ck) {
    var r = play(ROUTES[name], 1500);
    RESULTS[name] = r;
    if (process.env.OPENER_TRACE) r.fired.forEach(function (id) {
      var x = r.snaps[id];
      console.log(name.padEnd(9) + ' ' + id.padEnd(15) + ' t=' + r.at[id].toFixed(1).padStart(6) + 's  P=' + psi(I(x, 'primary_pressure')).toFixed(0) +
        ' psi  Tavg=' + degF(I(x, 'tavg')).toFixed(1) + ' F  pwr=' + I(x, 'power_range').toFixed(1) + '%  MWe=' + I(x, 'mwe_output').toFixed(1) +
        '  dump=' + I(x, 'steam_dump_valve').toFixed(1) + '%  spray=' + I(x, 'pzr_spray_flow').toFixed(0) + '%  rods=' + x.true_state.rod_steps.toFixed(0) +
        '  htr=' + x.true_state.pzr_heater_kw.toFixed(0) + 'kW  core=' + x.true_state.core_heat_pct.toFixed(1) + '%  x' + x.metadata.time_acceleration);
    });
    var want = ROUTE_PATH[name];
    ck('beats fired in order', r.fired.join(' '), r.fired.join(' ') === want.join(' '), want.join(' '));
    ck('reaches the level_complete', r.lc ? r.lc.instructor.level_complete.title : 'never', !!r.lc, 'Full-power opener');
    if (!r.lc) return;
    var S = r.snaps, s0 = r.start;
    var p0 = psi(I(s0, 'primary_pressure')), t0 = degF(I(s0, 'tavg'));

    // 1. load cut — the generator follows the dial and the primary heats up
    ck('o2: generator below 96 MWe when the watch starts', I(S.o2_watch, 'mwe_output').toFixed(1), I(S.o2_watch, 'mwe_output') < 96, '< 96');
    var o3 = S.o3_dump ? 'o3_dump' : 'o3_small', S3 = S[o3];
    var pk = max(window_(r, 'o1_load', o3, function (s) { return psi(I(s, 'primary_pressure')); }));
    var tk = max(window_(r, 'o1_load', 'o4_rods', function (s) { return degF(I(s, 'tavg')); }));
    var dk = max(window_(r, 'o1_load', 'o4_rods', function (s) { return I(s, 'steam_dump_valve'); }));
    ck('o3: pressure rose after the load cut', '+' + (pk - p0).toFixed(0) + ' psi (peak ' + pk.toFixed(0) + ')', pk - p0 > 15, '> +15 psi');
    ck('o3: Tavg rose', '+' + (tk - t0).toFixed(1) + ' °F (peak ' + tk.toFixed(1) + ')', tk - t0 > 1.5, '> +1.5 °F');
    if (o3 === 'o3_dump') ck('o3_dump: "the steam dump opened" — it did', I(S3, 'steam_dump_valve').toFixed(1) + ' %', I(S3, 'steam_dump_valve') > 10, '> 10 %');
    else ck('o3_small: "the steam dump stayed shut" — it did', 'max ' + dk.toFixed(1) + ' % through the watch', dk < 1, '< 1 %');
    ck(o3 + ': power trimmed by itself (moderator feedback)', I(S3, 'power_range').toFixed(1) + ' %', I(S3, 'power_range') < 98.5, '< 98.5 %');

    // 2. rods — power follows, Tavg comes back (read at the END of the watch, o6)
    ck('o6: power below 90 % after the rods went in', I(S.o6_spray, 'power_range').toFixed(1) + ' %', I(S.o6_spray, 'power_range') < 90, '< 90 %');
    ck('o6: rods actually moved in', S.o6_spray.true_state.rod_steps.toFixed(0) + ' steps', S.o6_spray.true_state.rod_steps < 600, '< 600');
    ck('o6: Tavg came back down from the rod ask', degF(I(S.o4_rods, 'tavg')).toFixed(1) + ' -> ' + degF(I(S.o6_spray, 'tavg')).toFixed(1) + ' °F',
       degF(I(S.o6_spray, 'tavg')) < degF(I(S.o4_rods, 'tavg')) - 1, 'down > 1 °F');

    // 3. pressure — spray drops it, heaters rebuild it
    ck('o7: spray flowing', I(S.o7_spray_watch, 'pzr_spray_flow').toFixed(0) + ' %', I(S.o7_spray_watch, 'pzr_spray_flow') > 30, '> 30 %');
    var pSpray0 = psi(I(S.o7_spray_watch, 'primary_pressure'));
    var pMin = Math.min.apply(null, window_(r, 'o7_spray_watch', 'o9_heaters', function (s) { return psi(I(s, 'primary_pressure')); }));
    ck('o8: pressure fell under spray', '-' + (pSpray0 - pMin).toFixed(0) + ' psi (' + pSpray0.toFixed(0) + ' → ' + pMin.toFixed(0) + ')', pSpray0 - pMin > 15, '> 15 psi');
    ck('o9: spray back in AUTO (the lit button)', String(S.o9_heaters.control_state.spray_auto), S.o9_heaters.control_state.spray_auto === true, 'true');
    var p9 = psi(I(S.o9_heaters, 'primary_pressure')), p10 = psi(I(S.o10_scram, 'primary_pressure'));
    var dtm = (r.at.o10_scram - r.at.o9_heaters) / 60;
    // The text claims "slow", not "rising": measured, the recovery is 0 to 20 psi/min by route
    // (Tavg still falling behind the rods offsets the heaters on the 90 MWe route).
    ck('o10: pressure no longer falling once back in AUTO (the text: slow)', (p10 - p9).toFixed(0) + ' psi in ' + (dtm * 60).toFixed(0) + ' s = ' + ((p10 - p9) / dtm).toFixed(0) + ' psi/min', p10 > p9 - 5 && (p10 - p9) / dtm < 60, '-5 psi .. +60 psi/min');
    ck('o10: heaters near full', S.o10_scram.true_state.pzr_heater_kw.toFixed(0) + ' kW', S.o10_scram.true_state.pzr_heater_kw > 100, '> 100 kW');

    // 4. trip
    var t11 = S.o11_trip;
    ck('o11: tripped, neutron power about 2 %', I(t11, 'power_range').toFixed(2) + ' %', t11.rps_state.scrammed && I(t11, 'power_range') > 1 && I(t11, 'power_range') < 3, 'scrammed, 1..3 % (text: about 2)');
    ck('o11: decay heat about 7 %', t11.true_state.core_heat_pct.toFixed(2) + ' %', t11.true_state.core_heat_pct >= 6 && t11.true_state.core_heat_pct <= 8, '6..8 (text: about 7)');
    ck('o12: turbine tripped', String(S.o12_settle.true_state.turbine_tripped), S.o12_settle.true_state.turbine_tripped === true, 'true');
    var tEnd = degF(I(S.o13_end, 'tavg'));
    ck('o13: Tavg settled near 552 °F', tEnd.toFixed(1) + ' °F', tEnd > 548 && tEnd < 558, '548..558 (text: about 552)');
    ck('o13: steam dump carrying decay heat', I(S.o13_end, 'steam_dump_valve').toFixed(1) + ' %', I(S.o13_end, 'steam_dump_valve') > 5, '> 5 %');

    // the clock — the authored speed lands, and the opener leaves the player at 1×
    ck('clock at 5× during the heater watch', String(r.svc.timeAcceleration) + ' now; at o9 ' + S.o9_heaters.metadata.time_acceleration,
       S.o9_heaters.metadata.time_acceleration === 5, '5');
    ck('clock back to 1× at the end', String(r.lc.metadata.time_acceleration), r.lc.metadata.time_acceleration === 1, '1');
    var mins = r.wall / 60;
    ck('player time (clock only, reading overlaps it)', mins.toFixed(1) + ' min, ' + (r.svc.simTime / 60).toFixed(1) + ' plant-min',
       name === 'typical' ? (mins > 3 && mins < 7) : mins < 12, name === 'typical' ? '3..7 min (target 5)' : '< 12 min');
  });
});

// ------------------------------------------------------------------ report
var GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', RST = '\x1b[0m', BOLD = '\x1b[1m';
var pass = 0, fail = 0;
T.forEach(function (r) {
  console.log('\n' + (r.pass ? GREEN + 'PASS' + RST : RED + 'FAIL' + RST) + '  ' + BOLD + r.name + RST);
  r.checks.forEach(function (c) {
    if (c.info) { console.log(DIM + '    ' + c.desc + RST); return; }
    console.log((c.pass ? GREEN + '  ✓' + RST : RED + '  ✗' + RST) + ' ' + c.desc +
      DIM + (c.pass ? '  (' + c.observed + ')' : '  [expected ' + c.expected + ', observed ' + c.observed + ']') + RST);
    if (c.pass) pass++; else fail++;
  });
});
var suites = T.filter(function (r) { return r.pass; }).length;
console.log('\n' + BOLD + '──────────────────────────────────────────' + RST);
console.log(BOLD + 'Suites: ' + suites + '/' + T.length + RST + '   Checks: ' + GREEN + pass + ' passed' + RST + (fail ? ', ' + RED + fail + ' failed' + RST : ''));
process.exit(fail ? 1 : 0);
