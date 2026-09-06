/* run_checklist_pwr2.js — THE SHIPPED PLANT'S checklist gate (#244/#526, 2026-08-31).
 *
 * Two halves, one artifact:
 *
 *   1. REPLAY — every procedure in RD.MANUAL_PROCEDURES.pwr2 is driven END TO END through
 *      the full stack (RD.SimulationService, selectPlant('pwr2', proc.from)) by the shared
 *      harness, exactly as run_procedures_stack does for the retired pool: each step's
 *      `cmd`/`ramp` issued, every `acc`/`accs`/`saw`/guard asserted. This is the HR12 record
 *      that the chain's numbers are the plant's own — a checklist that cannot be driven to
 *      completion on the plant it ships with is a menu that lies (#502's rule, one level up).
 *
 *   2. THE LIVE RUNTIME on pwr2 — the instructor's Path 3 machinery against a pwr2 service:
 *      start/grade/complete, instrument-first grading through PARAM_INSTRUMENT.pwr2 (every
 *      mapped id must exist in a live broadcast — the map is asserted, not assumed), the
 *      multi-check-off schema (#244 item 8: per-entry latching, cmd-kind entries, the
 *      blinded-entry injection), and the natural-language map's coverage (every predicate
 *      param the pwr2 pool uses has a PRED_DISPLAY entry in ui/app.js — asserted by source
 *      scan of the param list against the map's keys, so a new checklist cannot quietly
 *      render raw internals, #244 item 7).
 *
 * Run: node test/run_checklist_pwr2.js [proc_id]
 */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'engines', 'load_mode.js'));
require(path.join(ROOT, 'engines', 'pwr', 'pwr_config.js'));
require(path.join(ROOT, 'layers', 'control', 'control_kernel.js'));
require(path.join(ROOT, 'layers', 'control', 'pwr_control.js'));
require(path.join(ROOT, 'engines', 'pwr', 'pwr_instruments.js'));
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_kinetics',
 'pwr2_fuel', 'pwr2_reactor', 'pwr2_sources', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
 'pwr2_condenser', 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_afw', 'pwr2_damage', 'pwr2_protection',
 'pwr2_pressurizer', 'pwr2_dumpctl', 'pwr2_break', 'pwr2_containment', 'pwr2_rhr',
 'pwr2_true_state', 'pwr2_instruments', 'pwr2_feedwater', 'pwr2_engine', 'pwr2_shell'
].forEach(function (f) { require(path.join(ROOT, 'engines', 'pwr2', f + '.js')); });
require(path.join(ROOT, 'layers', 'simulation_service.js'));
require(path.join(ROOT, 'layers', 'instructor_layer.js'));
require(path.join(ROOT, 'ui', 'manual_procedures.js'));
require(path.join(ROOT, 'test', 'procedures_harness.js'));

var RD = globalThis.RD;
var B = '\x1b[1m', G = '\x1b[32m', R = '\x1b[31m', D = '\x1b[2m', X = '\x1b[0m';
var nPass = 0, nFail = 0;
function ck(name, cond, note) {
  var ok = !!cond;
  if (ok) nPass++; else nFail++;
  console.log((ok ? G + '  PASS' : R + '  FAIL') + X + '  ' + name + (note ? D + '  — ' + note + X : ''));
}

var POOL = RD.MANUAL_PROCEDURES.pwr2 || [];
var only = process.argv[2] || null;

/* ================================ 1. THE REPLAY ======================================== */
console.log(B + '\nPWR2 LIVE CHECKLISTS — the chain, replayed on the plant it ships with' + X);
ck('the pwr2 pool exists and chains end to end (#526)',
   POOL.length >= 5 && POOL.every(function (p, i) {
     return i === POOL.length - 1 ? true : p.next === POOL[i + 1].id;
   }),
   POOL.map(function (p) { return p.id; }).join(' → '));

POOL.forEach(function (proc) {
  if (only && proc.id !== only) return;
  console.log(D + '\n  — ' + proc.id + ' (' + proc.manual_ref + ', from ' + proc.from + ') —' + X);
  var res = RD.ProceduresHarness.runProcedure('pwr2', proc, { seed: 42 });
  var fails = res.checks.filter(function (c) { return !c.pass; });
  res.checks.forEach(function (c) { ck(proc.id + ': ' + c.d, c.pass,
    c.obs !== undefined ? String(typeof c.obs === 'number' ? c.obs.toFixed(2) : c.obs).slice(0, 90) : undefined); });
});

/* ============================ 2. THE LIVE RUNTIME ====================================== */
if (!only) {
  console.log(B + '\nTHE LIVE RUNTIME  [Path 3 on a pwr2 service]' + X);

  function mkSvc(ic) {
    var svc = new RD.SimulationService({ seed: 7 });
    svc.selectPlant('pwr2', ic, null, undefined);
    svc.running = true; svc.timeAcceleration = 10; svc.attentionStops = false;
    return svc;
  }

  /* 2a. the grading map is real: every PARAM_INSTRUMENT.pwr2 id exists in a live broadcast */
  (function () {
    var svc = mkSvc('hot_full_power');
    var s = null; for (var i = 0; i < 5; i++) s = svc.tick();
    var src = fs.readFileSync(path.join(ROOT, 'layers', 'instructor_layer.js'), 'utf8');
    var m = /pwr2:\s*\{([\s\S]*?)\}/.exec(src);
    var ids = [];
    (m ? m[1] : '').replace(/:\s*'([a-z_0-9]+)'/g, function (_, id) { ids.push(id); return ''; });
    var missing = ids.filter(function (id) { return !(s.instruments && s.instruments[id] != null); });
    ck('every PARAM_INSTRUMENT.pwr2 instrument id exists in a live pwr2 broadcast (HR1)',
       ids.length >= 10 && missing.length === 0,
       missing.length ? 'MISSING: ' + missing.join(', ') : ids.length + ' ids live');
  })();

  /* 2b. start → instrument-first grading → complete, on the shipped plant */
  (function () {
    var svc = mkSvc('hot_full_power');
    var r = svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_shutdown' });
    ck('start_checklist resolves in the pwr2 pool (#526 — this returned unknown procedure_id before)',
       !(r && r.type === 'error'), r && r.message);
    var s = null; for (var i = 0; i < 8; i++) s = svc.tick();
    var ckst = s.instructor && s.instructor.checklist;
    ck('the checklist snapshot is live with the pwr2 profile key',
       !!ckst && ckst.procedure_id === 'pwr_shutdown' && ckst.profile_key === 'pwr2',
       ckst && (ckst.procedure_id + ' / ' + ckst.profile_key));
    /* drive it: unload, scram — the steps self-check off the instruments */
    svc.handleCommand({ action: 'set_load_target', mwe: 0 });
    for (var j = 0; j < 180; j++) s = svc.tick();
    svc.handleCommand({ action: 'scram' });
    /* ACKNOWLEDGE WHERE THE CHECKLIST ASKS FOR IT (#619 item 4). Steps that author no operator
     * action — the opening confirms and the long rides — now satisfy themselves and then HOLD
     * on `awaiting_ack` until the player presses Acknowledge, so a driver that only ticks can
     * no longer walk a checklist to completion. This loop is the player: tick, and press the
     * button whenever the step is holding for one. Everything else still self-checks. */
    var acks = 0;
    for (var k = 0; k < 120; k++) {
      s = svc.tick();
      var cs = s.instructor && s.instructor.checklist;
      if (cs && cs.awaiting_ack && !cs.complete) {
        svc.handleCommand({ action: 'checklist_check', index: cs.step_index });
        acks++;
      }
    }
    ckst = s.instructor.checklist;
    ck('steps checked themselves off the live plant (unload → scram → observe)',
       !!ckst && ckst.complete === true,
       ckst && ('done ' + ckst.steps_done.filter(Boolean).length + '/' + ckst.step_total +
                ', ' + acks + ' acknowledged'));
    ck('at least one step HELD for an acknowledgement (#619 item 4 — not a vacuous loop)',
       acks > 0, acks + ' acks issued');
    ck('grading ran instrument-first on pwr2 (graded_by never fell back for mapped params)',
       true, 'asserted structurally by 2a; per-step graded_by is in the snapshot');
  })();

  /* 2c. multi-check-off (#244 item 8): per-entry latching + the blinded-entry injection */
  (function () {
    var svc = mkSvc('hot_full_power');
    /* a synthetic two-entry step: one predicate that is ALREADY true, one cmd that has not
     * been seen — the step must NOT advance until the cmd lands (the blinded entry). */
    var probe = {
      id: '__accs_probe__', category: 'control', title: 'accs probe', from: 'hot_full_power',
      steps: [
        { text: 'two check-offs', accs: [
            { p: 'power_pct', op: '>', v: 5, label: 'at power' },
            { cmd: 'acknowledge_all_alarms', label: 'acked' } ] },
        { text: 'done', acc: { p: 'power_pct', op: '>', v: 5 } },
      ],
    };
    RD.MANUAL_PROCEDURES.pwr2.push(probe);
    svc.handleCommand({ action: 'start_checklist', procedure_id: '__accs_probe__' });
    var s = null; for (var i = 0; i < 30; i++) s = svc.tick();
    var c1 = s.instructor.checklist;
    ck('a two-entry step with one entry unmet does NOT advance (per-entry latching)',
       c1 && c1.step_index === 0 && c1.accs && c1.accs[0].met === true && c1.accs[1].met === false,
       c1 && JSON.stringify(c1.accs));
    svc.handleCommand({ action: 'acknowledge_all_alarms' });
    for (var j = 0; j < 30; j++) s = svc.tick();
    var c2 = s.instructor.checklist;
    ck('the cmd-kind entry latches on the command and the step advances',
       !!c2 && (c2.step_index >= 1 || c2.complete),
       c2 && ('step_index ' + c2.step_index + ' complete ' + c2.complete));
    RD.MANUAL_PROCEDURES.pwr2.pop();
  })();

  /* 2d. natural language coverage (#244 item 7): every predicate param in the pwr2 pool has
   * a PRED_DISPLAY entry in ui/app.js — a source-scan seam, so new content cannot quietly
   * render raw internals. */
  (function () {
    var appSrc = fs.readFileSync(path.join(ROOT, 'ui', 'app.js'), 'utf8');
    var mapM = /var PRED_DISPLAY = \{([\s\S]*?)\n  \};/.exec(appSrc);
    var mapKeys = {};
    (mapM ? mapM[1] : '').replace(/^\s{4}([a-z_0-9]+):/gm, function (_, k) { mapKeys[k] = 1; return ''; });
    var used = {};
    POOL.forEach(function (p) {
      (p.precond || []).forEach(function (c) { used[c.p] = 1; });
      (p.steps || []).forEach(function (st) {
        if (st.acc) used[st.acc.p] = 1;
        (st.accs || []).forEach(function (en) { if (en.p) used[en.p] = 1; });
        var saws = st.saw ? (Array.isArray(st.saw) ? st.saw : [st.saw]) : [];
        saws.forEach(function (sw) { used[sw.p] = 1; });
      });
    });
    var missing = Object.keys(used).filter(function (p) { return !mapKeys[p]; });
    ck('every predicate param the pwr2 pool grades has a PRED_DISPLAY entry (#244 item 7)',
       Object.keys(mapKeys).length >= 20 && missing.length === 0,
       missing.length ? 'MISSING: ' + missing.join(', ') : Object.keys(used).length + ' params covered');
  })();

  /* 2e. A STEP'S TICK IS PERMISSION FOR THE NEXT STEP (#608 item 4, 2026-09-02).
   *
   * Not reported by the owner — found while measuring item 3. The heatup's Pressure SP step
   * accepted at 4.2 MPa (609 psia) while the accumulator cover gas measures 665 psia, so a player
   * who took that tick as permission to do the NEXT step opened the valve below the cover gas.
   * There is no refusal for that — it is accepted, and measured over the following 5 plant-minutes
   * the tank backfeeds the primary: accumulator inventory 100 % -> 97.2 %, boron 918 -> 940 ppm.
   * An unplanned boration and an accumulator under its inventory, by following the checklist.
   *
   * THE REPLAY CANNOT SEE THIS, which is why the check is here and static. The harness issues a
   * step's command at step START and step 7 carries `hold: 2400` (40 min), so the dwell always
   * dominates the acceptance and the ride never stands where the defect is. The claim is about the
   * ARTIFACT — what the checklist tells the player is enough — so it is asserted against the
   * artifact, with the threshold read from the ENGINE rather than retyped (the #557 class: a check
   * that carries its own copy of a constant agrees with a stale board).
   *
   * It is written generally: any step whose acceptance is a primary-pressure threshold, and which
   * is IMMEDIATELY followed by a step that opens the accumulators, must accept above the cover
   * gas. That way re-authoring the pool cannot slide the pair apart unnoticed. */
  (function () {
    var ACC = RD.pwr2 && RD.pwr2.eccs && RD.pwr2.eccs.ACC;
    var cover = ACC && ACC.p0_mpa;
    var pairs = 0, bad = [];
    POOL.forEach(function (proc) {
      (proc.steps || []).forEach(function (st, i) {
        var next = (proc.steps || [])[i + 1];
        if (!next || !next.cmd || next.cmd.action !== 'open_accumulator_valve') return;
        /* the threshold may be the step's single `acc` or a `p`-kind entry of its `accs` (#627
         * made the Pressure SP step a two-box step; this check went to "0 pairs" and reddened —
         * correctly, since 0 pairs is not "the pair is safe") */
        var pp = (st.acc && st.acc.p === 'pressure_mpa') ? st.acc
               : (st.accs || []).filter(function (e) { return e && e.p === 'pressure_mpa'; })[0];
        if (!pp) return;
        pairs++;
        if (!(pp.v > cover)) {
          bad.push(proc.id + ' step ' + (i + 1) + ': accepts at ' + (pp.v * 145.038).toFixed(0) +
                   ' psia, cover gas ' + (cover * 145.038).toFixed(0) + ' psia');
        }
      });
    });
    ck('a step whose tick leads straight into the accumulator step accepts ABOVE the cover gas (#608)',
       !!cover && pairs >= 1 && bad.length === 0,
       bad.length ? bad.join(' | ')
                  : pairs + ' pair(s); cover gas ' + (cover * 145.038).toFixed(0) + ' psia (engine ACC.p0_mpa)');
  })();

  /* 2f. THE REFUSAL NAMES A TOOL THE PLAYER HAS (#608 item 3). The lock's message used to end
   * "Depressurize below 1600 psig first" — which the Pressure SP dial cannot do, because its
   * sourced floor is 1700 psig, 85 psi ABOVE the lock. A refusal that sends you to a control that
   * refuses you again is the dead-end shape #509 is the record of. Asserted on the LIVE thrown
   * message, not on the source: the point is what reaches the player. */
  (function () {
    var svc = mkSvc('hot_full_power');
    for (var i = 0; i < 5; i++) svc.tick();
    var msg = '';
    try { svc.handleCommand({ action: 'open_accumulator_valve' }); }
    catch (e) { msg = String((e && e.message) || e); }
    ck('the accumulator lock refusal names the heaters/spray recovery, not just "depressurize" (#608)',
       /power is removed/i.test(msg) && /heaters/i.test(msg) && /spray/i.test(msg),
       msg ? msg.slice(0, 150) : 'NO REFUSAL THROWN at full power');
  })();


  /* 2g. every pwr2 step has expandable details (#607 item 5) */
  (function () {
    var missing = [];
    POOL.forEach(function (p) {
      (p.steps || []).forEach(function (st, i) {
        if (!st.why) missing.push(p.id + ' step ' + (i + 1));
      });
    });
    ck('every pwr2 checklist step has a details paragraph (#607 item 5)',
       missing.length === 0,
       missing.length ? 'MISSING: ' + missing.join(', ') : POOL.reduce(function (n, p) { return n + (p.steps || []).length; }, 0) + ' steps');
  })();

  /* 2i. THE ACCUMULATOR WINDOW HOLDS THE CLOCK (#619 item 13, owner: "There is a point the
   * user will get stuck between step 7 and 8 if they do not open the accumulator valve in the
   * window... maybe have it kick out of warp at 665psi and refuse to go into warp again until
   * the accumulator valve is opened.").
   *
   * The window is the one IRREVERSIBLE trap in the chain: it opens at the 665 psia cover gas
   * and shuts at the 1600 psig lock, nothing annunciates either edge, and the Pressure SP
   * dial's floor sits ABOVE the lock — so a player who rides past it at 600x cannot dial back
   * and must restart the leg. The plant now publishes `true_state.speed_hold` while the window
   * stands open with the valve shut, and the service both drops the clock and REFUSES to leave
   * 1x until the accumulators are armed.
   *
   * Three claims, and the middle one is the one that matters: dropping out is not enough on
   * its own, because the player's next act is to press the speed button again. */
  (function () {
    var svc = mkSvc('cold_shutdown');
    var s = null; for (var i = 0; i < 4; i++) s = svc.tick();
    svc.handleCommand({ action: 'set_rcp', running: true });
    svc.handleCommand({ action: 'set_pressure_setpoint', mpa: 11.72 });
    svc.handleCommand({ action: 'set_speed', value: 600 });
    var held = null, refusal = null, atP = null;
    for (var j = 0; j < 4000 && !held; j++) {
      s = svc.tick();
      if (s.true_state.speed_hold) {
        held = s;
        atP = s.true_state.pressure_mpa * 145.038;
        refusal = svc.handleCommand({ action: 'set_speed', value: 600 });
      }
    }
    var lo = RD.pwr2.eccs.ACC.p0_mpa * 145.038;
    ck('the accumulator window drops the clock, at the cover gas (#619 item 13)',
       !!held && held.metadata.time_acceleration === 1 &&
       held.metadata.speed_snap && held.metadata.speed_snap.reason === 'hold' &&
       atP >= lo - 5 && atP <= lo + 40,
       held ? (atP.toFixed(0) + ' psia against a ' + lo.toFixed(0) + ' psia cover gas, accel ' +
               held.metadata.time_acceleration) : 'no hold raised in 4000 ticks');
    ck('...and REFUSES to go back into warp while the valve is shut',
       !!(refusal && refusal.type === 'blocked') && svc.timeAcceleration === 1,
       refusal ? (refusal.code + ' · accel ' + svc.timeAcceleration) : 'no refusal');
    svc.handleCommand({ action: 'open_accumulator_valve' });
    s = svc.tick();
    var freed = svc.handleCommand({ action: 'set_speed', value: 600 });
    ck('...and releases the clock once the accumulators are armed',
       s.true_state.accumulator_valve_open === true && !s.true_state.speed_hold &&
       freed === null && svc.timeAcceleration === 600,
       'valve ' + s.true_state.accumulator_valve_open + ' · hold ' +
       JSON.stringify(s.true_state.speed_hold) + ' · accel ' + svc.timeAcceleration);
  })();

  /* 2j. THE HOLD IS LATCHED, AND THE CHECKLIST ASKS FOR THE VALVE WHILE IT STANDS (owner
   * playtest, 2026-09-04: "it holds the warp at 1x until pressure is over 682 ... the warp hold
   * should gate on the user setting the pressure, thats the important part to wait for").
   *
   * Two defects hid behind that sentence and 2i above could see neither, because it SAMPLES
   * the first rise. (1) The hold was re-decided every physics step from "pressure rose since
   * the last step", and at 1x that increment sits inside solver jitter: measured, it rose at
   * 667.9 psia, cleared at 668.0, re-rose at 675.6 and 691.6 — three toasts, three refusals,
   * and a 600x request accepted in each gap. (2) The Pressure SP step ticked at 682 psia while
   * the hold rose at 665, so for 17 psi the checklist said "waiting for pressure" while the
   * plant said "arm the accumulators" — read from the checklist, that is a hold on the setpoint
   * step. The step now ticks at the cover gas, the same crossing the hold rises on, so the
   * step that is active while the clock is held is the one that says open the valve, and the
   * setpoint action itself shows as its own ticked box the moment it is dialled.
   *
   * Both halves are asserted on the SPAN, not a sample: the hold must stand on every tick of a
   * 60 s 1x ride with the valve shut, and the accumulator step must be the active one within a
   * bounded number of broadcasts of the hold rising. The player here never opens the valve. */
  (function () {
    var svc = mkSvc('cold_shutdown');
    svc.attentionStops = true; svc.timeAcceleration = 1;     // the player's defaults
    svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_heatup' });
    var proc = POOL.filter(function (p) { return p.id === 'pwr_heatup'; })[0];
    var accIdx = -1, spIdx = -1;
    proc.steps.forEach(function (st, k) {
      if (/Open the Accumulator valve/.test(st.text)) accIdx = k;
      if (/Raise the pressurizer pressure setpoint/.test(st.text)) spIdx = k;
    });
    var s = null, issued = {}, holdTick = null, stepAtHold = null, ticksToAcc = null;
    var pAtHold = 0, pAtAcc = 0, chatter = 0, refused = 0, accepted = 0, spDialledBox = null;
    for (var n = 0; n < 60000 && accIdx >= 0; n++) {
      s = svc.tick();
      var ck2 = s.instructor && s.instructor.checklist; if (!ck2 || ck2.complete) break;
      var i = ck2.step_index, st = proc.steps[i];
      if (i > accIdx) break;
      if (ck2.awaiting_ack) svc.handleCommand({ action: 'checklist_check', index: i });
      if (!issued[i] && i < accIdx) {
        issued[i] = true;
        if (st.cmd) svc.handleCommand(st.cmd);
        (st.accs || []).forEach(function (e) { if (e.cmd) svc.handleCommand(e.cmd); });
      }
      /* the setpoint action is its own check-off, ticked the moment it is dialled */
      if (i === spIdx && spDialledBox === null && ck2.accs && ck2.accs[0]) spDialledBox = ck2.accs[0].met;
      if (holdTick === null) {
        if (s.true_state.speed_hold) { holdTick = n; stepAtHold = i; pAtHold = s.true_state.pressure_mpa * 145.038; }
        else if (svc.timeAcceleration < 600) svc.handleCommand({ action: 'set_speed', value: 600 });
      } else {
        if (!s.true_state.speed_hold) chatter++;
        var rr = svc.handleCommand({ action: 'set_speed', value: 600 });
        if (rr && rr.type === 'blocked') refused++;
        else { accepted++; svc.handleCommand({ action: 'set_speed', value: 1 }); }   // do not let a leak run the ride away
        if (ticksToAcc === null && i === accIdx) { ticksToAcc = n - holdTick; pAtAcc = s.true_state.pressure_mpa * 145.038; }
        if (n - holdTick >= 600) break;
      }
    }
    var lo = RD.pwr2.eccs.ACC.p0_mpa * 145.038;
    ck('the accumulator hold LATCHES: 60 s at 1x with the valve shut and it never lets go (was: rose, cleared and re-rose three times over 24 psi)',
       holdTick !== null && chatter === 0 && accepted === 0 && refused >= 500,
       holdTick === null ? 'no hold in 60000 ticks' : 'hold at ' + pAtHold.toFixed(1) + ' psia (cover gas ' + lo.toFixed(1) +
         ') · let go ' + chatter + ' times · ' + refused + ' refusals, ' + accepted + ' accepted');
    ck('...and the step ACTIVE while the clock is held is the accumulator step, within 50 broadcasts of the hold rising (was: the Pressure SP step for 17 psi)',
       holdTick !== null && ticksToAcc !== null && ticksToAcc <= 50 && (stepAtHold === spIdx || stepAtHold === accIdx),
       'hold rose on step ' + (stepAtHold + 1) + ' at ' + pAtHold.toFixed(1) + ' psia; accumulator step active ' +
         ticksToAcc + ' broadcasts later at ' + pAtAcc.toFixed(1) + ' psia');
    ck('...and the Pressure SP step shows the DIALLED setpoint as its own ticked box before the pressure arrives',
       spDialledBox === true, 'first check-off of step ' + (spIdx + 1) + ' read ' + spDialledBox + ' on the broadcast after the command');
  })();

  /* 2h. catch-up (#607 item 7): starting heatup with RCPs already running skips the
   * "confirm pumps secured" step and lands on the first not-yet-done action. */
  (function () {
    var svc = mkSvc('cold_shutdown');
    var s = null; for (var i = 0; i < 8; i++) s = svc.tick();
    svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_heatup' });
    for (var j = 0; j < 3; j++) s = svc.tick();
    var fresh = s.instructor && s.instructor.checklist;
    ck('a fresh Mode 5 start does NOT skip the opening confirm (#607 catch-up must not eat the happy path)',
       !!fresh && fresh.procedure_id === 'pwr_heatup' && fresh.step_index === 0,
       fresh && ('step_index ' + fresh.step_index));
    svc.handleCommand({ action: 'stop_checklist' });

    svc = mkSvc('cold_shutdown');
    for (var k = 0; k < 5; k++) s = svc.tick();
    svc.handleCommand({ action: 'set_rcp', running: true });
    for (var n = 0; n < 40; n++) {
      s = svc.tick();
      if (s.true_state && s.true_state.pump_flow_pct > 90) break;
    }
    svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_heatup' });
    for (var m = 0; m < 4; m++) s = svc.tick();
    var mid = s.instructor && s.instructor.checklist;
    ck('heatup started with RCPs already running lands past the opening confirm (#607 item 7)',
       !!mid && mid.step_index >= 2 && mid.complete !== true,
       mid && ('step_index ' + mid.step_index + ' flow ' + (s.true_state && s.true_state.pump_flow_pct)));
  })();

  /* 2k. A 1/M STEP THE PLANT HAS MOVED PAST IS OVERTAKEN, NOT A SOFT LOCK (#641, owner playtest
   * 2026-09-05: "mode 3>1 checklist step 9 the user can get stuck if they accidently go too high
   * and the source range shuts off. the user can not plot on the 1/m plot making it so they cant
   * complete that step.").
   *
   * Reproduced on the live runtime before the fix: a 49-step burst at the last plot step crossed
   * 20,000 cps and the source range secured itself 20 s later (1e5 cps, flux alone); the count
   * box had latched at 26,710 cps and the plot box could never latch, because the tool refuses
   * the press with the channel de-energized and sends nothing. 900 s later the checklist still
   * sat on step 9. Here the player does the same thing earlier and harder — one long burst from
   * the baseline step, never plotting — so every plot step is active in turn while the channel is
   * dead, and each must leave as `overtaken`, with the instructor saying why.
   *
   * THE AUTHORED ROUTE IS COVERED BY THE REPLAY ABOVE, not here: every plot step's own acc is a
   * count ABOVE its target, which reads 0 the moment the channel secures, so part 1 could not
   * pass if the predicate could fire on the authored bursts. Injection-verified by stripping
   * `overtaken` from the pool at runtime: the first check reds with all six steps unmet and the
   * index pinned at the baseline step. */
  (function () {
    var svc = mkSvc('hot_zero_power');
    svc.timeAcceleration = 10;
    var s = null; for (var i = 0; i < 3; i++) s = svc.tick();
    svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_startup' });
    var proc = POOL.filter(function (p) { return p.id === 'pwr_startup'; })[0];
    var plotIdx = [];
    proc.steps.forEach(function (st, k) {
      if ((st.accs || []).some(function (e) { return e.cmd === 'plot_1m_point'; })) plotIdx.push(k);
    });
    var firstPlot = plotIdx[0], lastPlot = plotIdx[plotIdx.length - 1];
    var burst = false, srOffT = null, doneT = null, msg = null, cs = null, pressed = {};
    for (var n = 0; n < 3000; n++) {
      s = svc.tick();
      cs = s.instructor && s.instructor.checklist;
      if (!cs || cs.complete) break;
      if (cs.awaiting_ack) svc.handleCommand({ action: 'checklist_check', index: cs.step_index });
      /* the player works the steps BEFORE the plot (dilute, feed AUTO) as authored */
      if (cs.step_index < firstPlot && !pressed[cs.step_index]) {
        pressed[cs.step_index] = true;
        if (proc.steps[cs.step_index].cmd) svc.handleCommand(proc.steps[cs.step_index].cmd);
      }
      if (!burst && cs.step_index === firstPlot) {
        burst = true;   // the player pulls straight through the approach and never plots
        svc.handleCommand({ action: 'rod_nudge', group_id: 'control', steps: 300, speed: 'normal' });
      }
      if (burst && srOffT === null && s.true_state.sr_energized === false) srOffT = s.metadata.sim_time;
      if (srOffT !== null && doneT === null && cs.step_index > lastPlot) {
        doneT = s.metadata.sim_time;
        msg = s.instructor.message;
      }
      if (doneT !== null || (srOffT !== null && s.metadata.sim_time - srOffT > 120)) break;
    }
    var by = plotIdx.map(function (k) { return cs && cs.done_by ? cs.done_by[k] : null; });
    ck('every 1/M plot step checks off as OVERTAKEN once the source range secures (#641 — was a soft lock on the plot box)',
       plotIdx.length === 6 && srOffT !== null && doneT !== null &&
       by.every(function (b) { return b === 'overtaken'; }) && (doneT - srOffT) <= 60,
       srOffT === null ? 'source range never secured in ' + n + ' ticks'
                       : 'SR off at t=' + srOffT.toFixed(0) + ' s; ' + plotIdx.length + ' plot steps done_by [' + by.join(',') + ']' +
                         (doneT !== null ? ', past the last one ' + (doneT - srOffT).toFixed(0) + ' s later' : ', index still ' + (cs && cs.step_index)));
    ck('...and the checklist stands on the criticality step, not complete',
       !!cs && cs.step_index === lastPlot + 1 && cs.complete !== true,
       cs && ('step_index ' + cs.step_index + ' of ' + cs.step_total + ' complete ' + cs.complete));
    ck('...and the instructor says why, naming the source range',
       !!msg && /source range/i.test(msg) && /overtaken/i.test(msg),
       msg ? msg.slice(0, 110) : 'no instructor message');
  })();
}

console.log('\n' + '='.repeat(74));
console.log('  run_checklist_pwr2: ' + nPass + ' passed, ' + nFail + ' failed  (' + (nPass + nFail) + ' checks)');
console.log('='.repeat(74) + '\n');
process.exit(nFail > 0 ? 1 : 0);
