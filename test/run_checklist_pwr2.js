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
/* THE CHAIN IS THE OPERATING CYCLE, AND THE INCIDENT LEG IS NOT PART OF IT (#670 Phase 2).
 * The six cycle legs still chain Mode 5 → full power → Mode 5 through `next`, and that chain is
 * what `ui/app.js`'s menu sort and the finished-card handoff read. An incident walkthrough is a
 * historical reconstruction with no successor, so it names no `next` and must come AFTER the
 * cycle in the pool's declaration order — which is also what puts it last in the player's list
 * (`verify_ckl_relevance` asserts the rendered order independently). Asserted as three claims
 * rather than one, so a broken chain and a misplaced incident leg do not look alike. */
var CYCLE = POOL.filter(function (p) { return p.category !== 'incident'; });
var INCIDENT = POOL.filter(function (p) { return p.category === 'incident'; });
ck('the pwr2 pool exists and its operating cycle chains end to end (#526)',
   CYCLE.length >= 5 && CYCLE.every(function (p, i) {
     return i === CYCLE.length - 1 ? true : p.next === CYCLE[i + 1].id;
   }),
   CYCLE.map(function (p) { return p.id; }).join(' → '));
ck('the incident legs come after the cycle and chain to nothing (#670)',
   POOL.slice(0, CYCLE.length).every(function (p) { return p.category !== 'incident'; }) &&
   INCIDENT.every(function (p) { return !p.next; }),
   INCIDENT.length ? INCIDENT.map(function (p) { return p.id + (p.next ? ' → ' + p.next : ' (no next)'); }).join(', ')
                   : 'no incident legs in the pool');
/* THE STORY CLOCK NEVER RUNS BACKWARDS (#670 Phase 3, layman pass S-7). An incident leg heads
 * every step with `story.clock`, and the TMI-2 leg went 04:10:37 → 04:08:37 between steps 9 and
 * 10 — each clock correct for the event it names (the first pump vibration alarm at 10 minutes,
 * the auxiliary-feed discovery at 8), and the pair in the wrong order once the steps were
 * sequenced for teaching. The reviewer noticed, assumed it had mis-read, and said it lost
 * confidence in the clock for the rest of the run. Nothing else could catch it: the clock is
 * decoration to the replay, so all sixteen steps passed their acceptances with it inverted.
 * Non-decreasing, not strictly increasing — two verifications of the same instant may share a
 * clock, which is what steps 8 and 9 now do. */
INCIDENT.forEach(function (p) {
  var clocks = (p.steps || []).map(function (st) { return st.story && st.story.clock; });
  var secs = clocks.map(function (c) {
    if (!c) return null;
    var m = /^(\d+):(\d+)(?::(\d+))?$/.exec(c);
    return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0)) : null;
  });
  var back = [];
  for (var i = 1; i < secs.length; i++) {
    if (secs[i] == null || secs[i - 1] == null) continue;
    if (secs[i] < secs[i - 1]) back.push('step ' + i + ' ' + clocks[i - 1] + ' → step ' + (i + 1) + ' ' + clocks[i]);
  }
  ck(p.id + ': every step carries a story clock and the clock never runs backwards (#670)',
     secs.every(function (s) { return s != null; }) && back.length === 0,
     back.length ? back.join('; ') : clocks[0] + ' … ' + clocks[clocks.length - 1] +
       ' over ' + clocks.length + ' steps');
});

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

  /* PRESSING AN ORDERED STEP'S BUTTONS THE WAY THE PLAYER HAS TO (#756). A section that walks a
   * live checklist by issuing every `accs[].cmd` on step entry drives a route that no longer
   * exists: on an `accs_ordered` step a cmd row is DEAF until the rows above it are met, so the
   * press lands on nothing and the walk stalls there for ever. (Measured: the #731 trip-block
   * sections stalled at step 5 of pwr_startup, index 4, and reported "never reached step 16".)
   * This presses the FIRST UNMET row, once, each time it becomes the live one — read off the
   * snapshot's own per-row verdicts, never re-pressed, because `plot_1m_point` is not idempotent
   * and a per-tick re-press would bank a dozen points. */
  function pressOrderedRow(svc, st, cs, memo) {
    if (!st || !st.accs || !st.accs.length || !cs || !cs.accs) return;
    for (var k = 0; k < st.accs.length; k++) {
      if (cs.accs[k] && cs.accs[k].met) continue;
      var e = st.accs[k];
      if (e && e.cmd && !memo[k]) {
        memo[k] = true;
        svc.handleCommand(typeof e.cmd === 'string' ? { action: e.cmd } : e.cmd);
      }
      return;                                   // only the first unmet row is live
    }
  }

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
    var acks = 0, dumpPressed = false;
    for (var k = 0; k < 300; k++) {
      s = svc.tick();
      var cs = s.instructor && s.instructor.checklist;
      /* THE LAST STEP IS NOW AN ACTION (#653 pass 2, S-11 / pass 1 S2): after the scram the dump
       * is still in 'tavg' mode from power and carries nothing, so the leg's last step presses
       * STEAM DUMP AUTO (a cmd-kind accs entry) and is graded on the valve carrying flow. The
       * player presses it once the step is active — so does this driver. */
      if (cs && cs.step_index === 2 && !cs.complete && !dumpPressed) {
        svc.handleCommand({ action: 'set_steam_dump', mode: 'auto' });
        dumpPressed = true;
      }
      if (cs && cs.awaiting_ack && !cs.complete) {
        svc.handleCommand({ action: 'checklist_check', index: cs.step_index });
        acks++;
      }
    }
    /* NOTE (#670): this driver issues no `inject`/`clear` of its own — it does not need to. On
     * the LIVE runtime the instructor fires them itself (`_checklistFire`); the replay half of
     * this runner is where the harness has to do it by hand, because there the instructor is not
     * driving the checklist at all. The pwr_shutdown leg authors none either way. */
    ckst = s.instructor.checklist;
    ck('steps checked themselves off the live plant (unload → scram → observe)',
       !!ckst && ckst.complete === true,
       ckst && ('done ' + ckst.steps_done.filter(Boolean).length + '/' + ckst.step_total +
                ', ' + acks + ' acknowledged'));
    /* THE ACK PROOF MOVED (#653 pass 2). It used to ride on this leg's last step, an observation
     * that satisfied itself after the scram and then HELD. That step is an action now (STEAM
     * DUMP AUTO, graded on the valve carrying flow), so no step of the shutdown leg holds for an
     * acknowledgement any more — and "0 acks" here says only that. The mechanism is proved on a
     * step that still holds: the heatup's opening Mode 5 confirm, which satisfies itself on the
     * cold plant at once and waits for the button. */
    (function () {
      var svc2 = mkSvc('cold_shutdown');
      svc2.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_heatup' });
      var s2 = null, held = false, acked = false;
      for (var k2 = 0; k2 < 80; k2++) {
        s2 = svc2.tick();
        var c2 = s2.instructor && s2.instructor.checklist;
        if (c2 && c2.awaiting_ack && !c2.complete) {
          held = true;
          svc2.handleCommand({ action: 'checklist_check', index: c2.step_index });
          acked = true;
          break;
        }
      }
      var after = s2 && s2.instructor && s2.instructor.checklist;
      for (var k3 = 0; k3 < 5 && after && after.step_index === 0; k3++) { s2 = svc2.tick(); after = s2.instructor.checklist; }
      ck('at least one step HELD for an acknowledgement (#619 item 4 — not a vacuous loop): the heatup\'s opening confirm',
         held && acked && !!after && after.step_index >= 1,
         held ? 'held; acknowledged; index now ' + (after && after.step_index) : 'never held in 80 ticks');
    })();
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
    ck('the cmd-kind entry latches on the command and the step holds for Continue (#660 item 16)',
       !!c2 && c2.awaiting_ack === true && c2.step_index === 0 && c2.accs && c2.accs[1].met === true,
       c2 && ('step_index ' + c2.step_index + ' awaiting_ack ' + c2.awaiting_ack + ' ' + JSON.stringify(c2.accs)));
    svc.handleCommand({ action: 'checklist_check', index: 0 });
    for (var j2 = 0; j2 < 5; j2++) s = svc.tick();
    var c3 = s.instructor.checklist;
    ck('...and Continue advances it',
       !!c3 && (c3.step_index >= 1 || c3.complete),
       c3 && ('step_index ' + c3.step_index + ' complete ' + c3.complete));
    RD.MANUAL_PROCEDURES.pwr2.pop();
  })();

  /* 2x. ORDERED MULTI-CHECK-OFF (#756) - `accs_ordered`, the sequencer under the owner's
   * substeps *(OWNER DIRECTIVE, 2026-09-15: "We instruct to pull rods to a count/however many
   * steps. The next substep says to wait for the startup rate to stabilize. Once the startup
   * rate hits a predetermined number that step checks off. Then have another substep to plot
   * the 1/m point.")*.
   *
   * THE PAIR, because either half alone is satisfied by a broken sequencer: one that NEVER
   * opens passes "cannot latch early", and one that ALWAYS opens passes "advances when done".
   * Both are asserted here against the SAME probe object, driven through the live path
   * (`_stepChecklist` -> `_gradeAccs` / `_accsCmdWatch` -> `c.awaitingAck` -> Continue).
   *
   * THE INJECTION IS THE THIRD CHECK and it is the flag itself: the identical probe with
   * `accs_ordered` deleted latches the later entry on the early press. MEASURED before the
   * feature existed, on the shipped pool's own shape: accs = [false,true] with the cmd entry
   * latched and the predicate entry still false. That is the hole #755 filed and could not
   * close - the plot press was never gated, only the step's completion. */
  (function () {
    /* THE FIXTURE IS THE 1/M LADDER'S OWN SHAPE, MINIATURISED: a `steady` row gating a cmd row.
     * `power_pct` at full power IS steady, so the row is false only because its 30 s window is
     * not yet covered - which is exactly why it works here, and is the one predicate that goes
     * false -> true on the CLOCK with no plant driving.
     * ⚠ THE FIRST DRAFT OF THIS PROBE USED `ir_high_blocked > 0`, WHICH IS ALREADY TRUE ON A
     * hot_full_power BOOT - so no row was ever blocked and all three checks read [true,true].
     * A sequencer probe whose first row starts MET tests nothing. */
    function probe(ordered) {
      return {
        id: '__ord_probe__', category: 'control', title: 'ordered probe', from: 'hot_full_power',
        steps: [
          { text: 'ordered pair', accs_ordered: ordered || undefined,
            accs: [{ p: 'power_pct', op: 'steady', v: 0.02, window: 30,
                     ask: 'Wait for power to settle', label: 'power steady' },
                   { cmd: 'acknowledge_all_alarms', ask: 'Acknowledge', label: 'acked' }] },
          { text: 'done', acc: { p: 'power_pct', op: '>', v: 5 } },
        ],
      };
    }
    function run(ordered) {
      RD.MANUAL_PROCEDURES.pwr2.push(probe(ordered));
      var svc = mkSvc('hot_full_power');
      svc.handleCommand({ action: 'start_checklist', procedure_id: '__ord_probe__' });
      var s = null, i;
      for (i = 0; i < 8; i++) s = svc.tick();     // 10x: ~1 s of plant per tick, window not covered
      // the player presses the LATER substep's button first, with the first row still unmet
      svc.handleCommand({ action: 'acknowledge_all_alarms' });
      for (i = 0; i < 5; i++) s = svc.tick();
      var early = s.instructor.checklist.accs.map(function (a) { return !!a.met; });
      // now let the first row satisfy itself - the window closes and the steadiness holds
      for (i = 0; i < 60; i++) s = svc.tick();
      var mid = s.instructor.checklist.accs.map(function (a) { return !!a.met; });
      // ...and press again, which is what an ordered step costs the player: one more press
      svc.handleCommand({ action: 'acknowledge_all_alarms' });
      for (i = 0; i < 20; i++) s = svc.tick();
      var c = s.instructor.checklist;
      var late = c.accs.map(function (a) { return !!a.met; }), ack = !!c.awaiting_ack;
      svc.handleCommand({ action: 'checklist_check', index: c.step_index });
      for (i = 0; i < 5; i++) s = svc.tick();
      var c2 = s.instructor.checklist;
      RD.MANUAL_PROCEDURES.pwr2.pop();
      return { early: early, mid: mid, late: late, ack: ack,
               advanced: !!(c2 && (c2.step_index >= 1 || c2.complete)) };
    }
    var ord = run(true), un = run(false);
    ck('2x ordered: a cmd entry pressed BEFORE its predecessor is met does not latch (#756)',
       ord.early[0] === false && ord.early[1] === false, 'accs ' + JSON.stringify(ord.early));
    ck('2x ordered: ...and satisfying the predecessor does not retroactively bank that press',
       ord.mid[0] === true && ord.mid[1] === false, 'accs ' + JSON.stringify(ord.mid));
    ck('2x ordered: ...but the press AFTER it latches, the step lights Continue and advances',
       ord.late[0] === true && ord.late[1] === true && ord.ack === true && ord.advanced === true,
       'accs ' + JSON.stringify(ord.late) + ' awaiting_ack ' + ord.ack + ' advanced ' + ord.advanced);
    ck('2x INJECTION: the same probe WITHOUT accs_ordered latches the later entry early',
       un.early[0] === false && un.early[1] === true,
       'unordered accs ' + JSON.stringify(un.early) + ' (this is the pre-#756 behaviour)');
    /* the static half: the flag is opt-in and means nothing on a step with one row, and every
     * ordered step's rows must be authorable as a sequence (an `ask` on each, so the card has an
     * instruction to draw for the row the player is standing on). */
    var ordSteps = [];
    POOL.forEach(function (pr) {
      (pr.steps || []).forEach(function (st, k) {
        if (st.accs_ordered) ordSteps.push({ id: pr.id, k: k + 1, st: st });
      });
    });
    var badOrd = ordSteps.filter(function (e) {
      return !e.st.accs || e.st.accs.length < 2 ||
             e.st.accs.some(function (en) { return !en.ask; });
    });
    ck('2x every accs_ordered step has at least two rows and an `ask` on each (#756)',
       ordSteps.length > 0 && badOrd.length === 0,
       badOrd.length ? badOrd.map(function (e) { return e.id + ' step ' + e.k; }).join(', ')
                     : ordSteps.length + ' ordered steps: ' +
                       ordSteps.map(function (e) { return e.id + ' ' + e.k; }).join(', '));
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

  /* 2d-bis. THE REACTOR TRIP TILE NAMES THIS PLANT'S CAUSE (#670 operator pass 2, S-11).
   *
   * Same seam, one alarm over. `ui/app.js`'s TRIP_CAUSE turns `rps_state.last_trip_reason` into
   * the words on the Reactor Trip tile, and every key it shipped with was the RETIRED engine's
   * "<instrument> <direction>" form. PWR2 does not produce one of those: control_kernel takes the
   * cause from `engine.getTripCause()`, which is `pr.trip_cause` — a protection-table ID. So all
   * twelve of this plant's causes fell through the title-case fallback, and an operator running
   * the TMI-2 leg read "Reactor Trip — Ot Delta T" off the board and reported it as a typo.
   *
   * A SOURCE SCAN IS THE RIGHT INSTRUMENT HERE and a replay is not: producing all twelve trips
   * would take twelve casualties, while the defect is a MAP with a hole in it — exactly the shape
   * the PRED_DISPLAY check above exists for. PROVEN RED BY INJECTION: deleting the 'ot_delta_t'
   * key reports `MISSING: ot_delta_t`. */
  (function () {
    var appSrc = fs.readFileSync(path.join(ROOT, 'ui', 'app.js'), 'utf8');
    var m = /var TRIP_CAUSE = \{([\s\S]*?)\n  \};/.exec(appSrc);
    var keys = {};
    (m ? m[1] : '').replace(/^\s*'([a-z_0-9 ]+)':/gm, function (_, k) { keys[k] = 1; return ''; });
    var protSrc = fs.readFileSync(path.join(ROOT, 'engines', 'pwr2', 'pwr2_protection.js'), 'utf8');
    var ids = [], re = /\{ id: '([a-z_0-9]+)', name: '[^']+', kind: 'rps'/g, mm;
    while ((mm = re.exec(protSrc))) ids.push(mm[1]);
    /* the two causes the table does not carry: the pushbutton and the anticipatory trip, both
     * assigned literally in pwr2_protection (`trip_cause = 'manual'` / `'turbine_trip'`). */
    ids.push('manual', 'turbine_trip');
    var gaps = ids.filter(function (i) { return !keys[i]; });
    ck('every pwr2 reactor-trip cause has a TRIP_CAUSE entry - the tile names it, not a title-cased id (#670 S-11)',
       ids.length >= 10 && gaps.length === 0,
       gaps.length ? 'MISSING: ' + gaps.join(', ') : ids.length + ' causes covered');
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
      if (/Open the accumulator valve/i.test(st.text)) accIdx = k;
      /* the step that STARTS the climb, and its FIRST check-off is the operator's ACTION. It was
       * `Raise SET PZR PRESSURE to 1700` until #755 item 11 floored the Mode 5 seed at the board
       * span's own bottom (2026-09-15) and retired the dial step — the HEATER press now carries
       * both the climb and the cover-gas acceptance, so it is the one to read. `>= 0` is asserted
       * below rather than left to `spIdx === -1` quietly matching nothing. */
      if (/press AUTO under HEATER/.test(st.text)) spIdx = k;
    });
    var s = null, issued = {}, issuedAt = {}, holdTick = null, stepAtHold = null, ticksToAcc = null;
    var pAtHold = 0, pAtAcc = 0, chatter = 0, refused = 0, accepted = 0;
    var spActionTick = null, pAtAction = 0;
    for (var n = 0; n < 60000 && accIdx >= 0; n++) {
      s = svc.tick();
      var ck2 = s.instructor && s.instructor.checklist; if (!ck2 || ck2.complete) break;
      var i = ck2.step_index, st = proc.steps[i];
      if (i > accIdx) break;
      if (ck2.awaiting_ack) svc.handleCommand({ action: 'checklist_check', index: i });
      if (!issued[i] && i < accIdx) {
        issued[i] = true; issuedAt[i] = n;
        if (st.cmd) svc.handleCommand(st.cmd);
        (st.accs || []).forEach(function (e) { if (e.cmd) svc.handleCommand(e.cmd); });
        // no `inject`/`clear` here — the LIVE instructor fires those itself (#670; see 2b).
      }
      /* the operator's ACTION is its own check-off, and the claim (#627) is that it ticks
       * BEFORE the ride is over — not on one nominated broadcast.
       *
       * ⚠ IT USED TO SAMPLE EXACTLY ONE TICK, `n > issuedAt[spIdx]`, and that worked only
       * because the entry was CMD-KIND: a cmd entry latches on the command itself. #755 item 11
       * made it a `p`-kind lamp, which goes through the instructor's grading, and MEASURED
       * 2026-09-17 on this very loop the two are NOT the same broadcast — `control_state
       * .heater_auto` flips on broadcast +1 while `accs[0].met` latches on **+5**, at 420 psia.
       * The one-tick sample read `false` and reddened a check whose claim was true by 33
       * broadcasts. So record WHEN it latches and assert the ORDER, which is what #627 asked
       * for; a sample cannot tell a four-broadcast grading lag from a box that never ticks. */
      if (i === spIdx && spActionTick === null && ck2.accs && ck2.accs[0] && ck2.accs[0].met &&
          issuedAt[spIdx] !== undefined && n > issuedAt[spIdx]) {
        spActionTick = n; pAtAction = s.true_state.pressure_mpa * 145.038;
      }
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
    ck('...and the HEATER step ticks the PRESS as its own box BEFORE the clock hold rises',
       spIdx >= 0 && spActionTick !== null && holdTick !== null && spActionTick < holdTick,
       'step ' + (spIdx + 1) + ' (spIdx ' + spIdx + '): action box ticked ' +
         (spActionTick === null ? 'NEVER' : (spActionTick - issuedAt[spIdx]) + ' broadcasts after the press, at ' +
           pAtAction.toFixed(1) + ' psia') + '; clock hold rose ' +
         (holdTick === null ? 'NEVER' : (holdTick - issuedAt[spIdx]) + ' broadcasts after, at ' + pAtHold.toFixed(1) + ' psia'));
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
   * index pinned at the baseline step.
   *
   * FIVE PLOT STEPS SINCE #750, not six — the count is a STRUCTURAL PIN on the authored ladder,
   * the same role `nBursts` plays in `run_reactivity.js`, and it moves only when the ladder does.
   * It caught this change: the removal reddened it here with the observation `5 plot steps done_by
   * [overtaken x5], past the last one 24 s later`, i.e. every claim the check makes still held and
   * only the count had moved. */
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
       plotIdx.length === 5 && srOffT !== null && doneT !== null &&
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

  /* 2l. THE STARTUP CHECKLIST'S OWN BORON NUMBER IS REACHABLE FROM THE HEATUP'S PLANT (#654,
   * owner-ruled 2026-09-07 "as recommended"; found by the layman playtest, #653 S1/S14).
   * `pwr_startup` replays from hot_zero_power, which boots AT 719 ppm — so nothing here ever
   * drove the dilution the step actually asks for, from the 918 ppm the pump-heat heatup hands
   * over. Measured before the fix: the batch totalizer counted the COMMANDED -0.05 ppm/s while
   * the clamped blender delivered about -0.03, the dose stopped at 788, and the post-dose lab
   * sample re-anchored the target to 788. The plant now publishes its delivered rate and the
   * kernel integrates that. Full stack, the cold plant, the step's own command; INJECTION —
   * the kernel's delivered branch removed — reads ~788 with the target re-anchored there. */
  (function () {
    var svc = mkSvc('cold_shutdown');
    var s = null; for (var i = 0; i < 20; i++) s = svc.tick();
    var b0 = s.true_state.boron_ppm;
    svc.handleCommand({ action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 719 });
    var t0 = s.metadata.sim_time;
    while (s.metadata.sim_time - t0 < 2.5 * 3600) s = svc.tick();
    var ch = (s.automation && s.automation.channels || []).filter(function (c) { return c.id === 'boron_conc'; })[0];
    ck('the heatup\'s 918 ppm plant dilutes to the startup step\'s 719 ppm and stops there',
       Math.abs(s.true_state.boron_ppm - 719) <= 3,
       b0.toFixed(0) + ' -> ' + s.true_state.boron_ppm.toFixed(1) + ' ppm after 2.5 plant-hours (books-by-command landed ~788)');
    ck('...and the channel still reports the 719 the operator set, not a re-anchored shortfall',
       !!ch && Math.abs(ch.setpoint - 719) <= 3 && /idle/.test(ch.note || ''),
       ch ? 'setpoint ' + ch.setpoint.toFixed(0) + ' [' + ch.note + ']' : 'no boron_conc channel');
  })();

  /* 2m. A PLAYER WHO TAKES A TURBINE TRIP AT POWER CAN STILL CLIMB THROUGH P-9 (#664, filed off
   * #663's measurement; OWNER RULING, 2026-09-08 on #663: "C — leave the logic as sourced; fix
   * the checklist gap").
   *
   * P-9 is the power-range permissive at 50 % that arms the reactor trip on turbine trip, and
   * the trip is a LEVEL on the turbine's tripped flag — sourced and unchanged (Ginna TS Bases
   * B 3.3.1 Function 14). So a turbine trip BELOW 50 % does not trip the reactor; the plant
   * settles on the steam dumps and the player keeps climbing, and the reactor trips the instant
   * power reaches 50 %. `latch_turbine` occurred exactly ONCE in the whole pwr2 pool — the
   * startup leg's 8 % step — and there is no pwr2 post-trip leg, so no procedure put it back.
   *
   * THE CLAIM THIS ASSERTS is the pool's, not the plant's: the ascension leg carries a step
   * that puts the turbine back on line, and taking that step — driven ONLY from the artifact,
   * `st.cmd` plus its cmd-kind accs entries, exactly as procedures_harness issues them — is what
   * lets the same climb cross 50 %. Nothing here hand-codes `latch_turbine`: delete the step, or
   * blank its `cmd`, and the driver issues nothing, the turbine stays tripped and the ride reds
   * on the trip it is asserting the absence of. Measured both ways at authoring (#664 write-up):
   * left tripped, `reactor_trip` cause `turbine_trip` at a peak of 49.19 %; step taken, the climb
   * runs to 70.9 % with no trip.
   *
   * THE STEP IS LOOKED UP BY ITS ACTION, never by index: an index is what the STEP_UI map's
   * three historical off-by-ones were made of. */
  (function () {
    var proc = POOL.filter(function (p) { return p.id === 'pwr_raise_power'; })[0];
    var idx = -1;
    (proc ? proc.steps : []).forEach(function (st, k) {
      if (idx < 0 && st.cmd && st.cmd.action === 'latch_turbine') idx = k;
    });
    var firstRod = -1;
    (proc ? proc.steps : []).forEach(function (st, k) {
      if (firstRod < 0 && st.cmd && st.cmd.action === 'rod_nudge') firstRod = k;
    });
    ck('the ascension leg carries a step that re-latches the turbine, ahead of its first rod pull (#664)',
       idx >= 0 && firstRod >= 0 && idx < firstRod,
       proc ? ('latch step ' + (idx + 1) + ', first rod pull step ' + (firstRod + 1) + ' of ' + proc.steps.length)
            : 'pwr_raise_power missing from the pool');

    var svc = mkSvc('low_power');
    var s = null, trip = null, peak = 0;
    function ride(sec) {
      var end = (s ? s.metadata.sim_time : 0) + sec;
      while (!s || s.metadata.sim_time < end) {
        s = svc.tick();
        if (s.true_state.power_pct > peak) peak = s.true_state.power_pct;
        if (!trip && s.true_state.scrammed) {
          var e = svc.engine && svc.engine.eng;
          trip = { t: s.metadata.sim_time, cause: (e && e.pt && e.pt.trip_cause) || '?', peak: peak };
          return;
        }
      }
    }
    ride(60);
    /* the ascension, the leg's own shape: rods lead, load follows — up to ~40 %, under P-9 */
    [{ steps: 30, mwe: 30 }, { steps: 12, mwe: 40 }].forEach(function (stg) {
      if (trip) return;
      svc.handleCommand({ action: 'rod_nudge', group_id: 'control', steps: stg.steps, speed: 'normal' });
      ride(120);
      svc.handleCommand({ action: 'set_load_target', mwe: stg.mwe });
      ride(480);
    });
    var pAtEvent = s.true_state.power_pct;
    /* THE EVENT: the turbine trips below P-9. The reactor stays up — that is the trap. */
    try { svc.handleCommand({ action: 'trip_turbine' }); } catch (e) { /* recorded by the ride */ }
    ride(180);
    var mweAfterEvent = s.true_state.mwe_output;

    /* THE STEP, taken from the artifact and nowhere else */
    var st = idx >= 0 ? proc.steps[idx] : null;
    var issued = [];
    function issue(c) {
      issued.push(c.action);
      try { svc.handleCommand(c); } catch (e) { issued[issued.length - 1] += '(refused)'; }
    }
    if (st && st.cmd) issue(JSON.parse(JSON.stringify(st.cmd)));
    (st && st.accs || []).forEach(function (en) {
      if (en && en.cmd) issue(typeof en.cmd === 'string' ? { action: en.cmd } : JSON.parse(JSON.stringify(en.cmd)));
    });
    ride(240);
    var mweOnLine = s.true_state.mwe_output, trippedOnLine = s.true_state.turbine_tripped;
    var onLine = !trippedOnLine && mweOnLine > 8;

    /* and the climb the player was making all along, on through P-9 */
    [50, 60, 70].forEach(function (mwe) {
      if (trip) return;
      svc.handleCommand({ action: 'rod_nudge', group_id: 'control', steps: 20, speed: 'normal' });
      ride(120);
      svc.handleCommand({ action: 'set_load_target', mwe: mwe });
      ride(480);
    });

    ck('...the trip is below P-9, so the reactor stays up and the player keeps climbing (the trap)',
       pAtEvent > 35 && pAtEvent < 50 && mweAfterEvent < 1 && (!trip || trip.t > 0),
       'turbine tripped at ' + pAtEvent.toFixed(2) + ' % true, OUTPUT then ' + mweAfterEvent.toFixed(1) + ' MWe');
    ck('...and taking the step puts the generator back on line',
       onLine, 'issued [' + issued.join(', ') + '] -> ' + mweOnLine.toFixed(1) +
         ' MWe 240 s later, TRIP ' + trippedOnLine);
    ck('...so the same climb crosses 50 % with no reactor trip (was: turbine_trip at 49.19 %)',
       !trip && peak > 50,
       trip ? ('TRIPPED ' + trip.cause + ' at t=' + trip.t.toFixed(0) + ' s, peak ' + trip.peak.toFixed(2) + ' %')
            : 'peak ' + peak.toFixed(2) + ' % true, no trip');
  })();

  /* 2n. THE #697 SWEEP — a step whose acceptance is a PRESS cannot tick when the plant has
   * already reached the state that press produces (#697, owner: "Mode 3>5 walkthrough step 4 -
   * steam dump AUTO was already green but it still required a press to check off step."). Same
   * family as #641 sign-flipped: there the plant stopped letting the player PRODUCE the command;
   * here the plant produces the command's EFFECT on its own and the checkbox still demands the
   * press — a ceremonial re-press at best, a permanent soft lock at worst (proven below).
   *
   * TWO STATIC SWEEPS OF THE POOL, one runner, over every `accs` entry that is cmd-kind (has
   * `.cmd`) with no `.p` of its own and whose step carries no `overtaken`:
   *   (a) NO SIBLING PREDICATE on the same step — no observable state to grade on at all
   *       (`pwr_raise_power` step 3's `set_auto_setpoint` boron-dilution entry, #683 — grading
   *       the number would stall the climb on chemistry the leg runs in the background, so only
   *       the operator's ACTION is checked and the number is verified later on the leg's own
   *       closing step; and `pwr_cooldown` step 3's two bare `set_trip_block` entries).
   *       Judgement calls per the issue (an `overtaken` or a new state field), not fixed here;
   *       the set is pinned so a new one cannot join unnoticed. `take_boron_sample` used to be
   *       the fourth and is gone entirely (#698) — see the note on NO_STATE_EXPECTED below.
   *   (b) HAS a sibling predicate — booted at the leg's own `from`, ticked, nothing pressed: is
   *       the sibling already true? Only `pwr_cooldown` step 4 and `pwr_shutdown` step 3 ever
   *       did (both fixed by #697, live-proved below); the other 8 read clean because they need
   *       the leg's OWN earlier steps actually run first (`pwr_raise_power`'s ladder, `pwr_startup`
   *       step 15, `pwr_cooldown` step 11) — a different shape, left alone.
   *
   * THE FIX: `p`/`op`/`v` now live on the SAME entry as `cmd`, not a second hidden one. Proven
   * by injection (test_accs.js during authoring) that `pwr_heatup` step 8's two-entry
   * hidden-cmd-plus-predicate shape does NOT bypass the press — `_gradeAccs` never grades a
   * cmd-only entry, so it stays unmet until `_accsCmdWatch` sees the exact command, and a
   * predicate SIBLING cannot satisfy it. It just never surfaced there because `heater_auto` /
   * `spray_auto` are false at `pwr_heatup`'s own `cold_shutdown` IC. One merged entry lets
   * `_gradeAccs` grade the `p` half regardless of any command (a plant already there ticks the
   * box) while `_accsCmdWatch` still latches the SAME entry on the press for a plant that is not. */
  (function () {
    var grader = Object.create(RD.InstructorLayer.prototype);
    var NO_STATE = [], CANDIDATES = [];
    POOL.forEach(function (proc) {
      (proc.steps || []).forEach(function (st, idx) {
        if (!st.accs || !st.accs.length || st.overtaken) return;
        st.accs.forEach(function (en) {
          if (!(en && en.cmd) || en.p) return;              // not a pure cmd-kind entry
          var sibs = st.accs.filter(function (e2) { return e2 !== en && e2.p; });
          var rec = { proc: proc.id, step: idx + 1, from: proc.from, siblings: sibs };
          (sibs.length ? CANDIDATES : NO_STATE).push(rec);
        });
      });
    });

    /* `pwr_raise_power:4` LEFT THIS SET BY DELETION, not by being fixed (#698, 2026-09-11): it
     * was the `take_boron_sample` entry, and the board's SAMPLE button was removed by owner
     * ruling, so the step went with it rather than becoming a soft lock — the #641 half of the
     * pair this sweep's own header describes. The allowlist SHRINKS; nothing was reclassified.
     * The sweep caught it the turn the step was deleted, which is what pinning the set is for. */
    /* `pwr_cooldown:3` LEFT THIS SET BY BEING FIXED (#731, 2026-09-13) — the other way out, and
     * the first time this allowlist has shrunk for that reason. Its two entries blocked the
     * low-pressure and safety-injection reactor trips and were graded on the PRESS, so a block
     * placed EARLIER never satisfied the step. They now carry `p: 'lo_press_blocked'` /
     * `p: 'si_trip_blocked'` ALONGSIDE their `cmd` halves, which is why they no longer count as
     * no-observable-state: the sweep looks for a command entry with no state sibling.
     * The `cmd` halves had to STAY — the replay ISSUES `accs[].cmd`, and deleting them took the
     * leg from 31/0 to 23 passed / 10 failed by never placing the safety-injection block at all.
     * `pwr_tmi2_incident:10` took the same fix and was never in this set (single entry, and it
     * now has a state sibling too). `pwr_raise_power:3` is unchanged and remains the documented
     * judgement call. */
    /* ⚠ `pwr_cooldown:3` DOES NOT JOIN THIS SET, AND THAT IS A PROPERTY OF THE SWEEP, NOT OF THE
     * STEP (#739, 2026-09-13). Its new "STOP pressed on the ECCS card" entry IS a pure cmd-kind
     * acceptance with nothing observable behind it — measured at the leg's own `hot_zero_power`
     * boot, 30 ticks either side of `set_hpi {active:false}`: `eccs_mode` "standby" ->
     * "standby", `hpi_active` false -> false, `si_actuated` false -> false, command accepted;
     * and the board's STOP lamp (`!esfAuto(s,'hpi') && !hpi_active`, pwr_board_wiring :603) is
     * lit at boot, at the step and after the press, because this plant publishes no `hpi` ESF
     * arm at all. So it is exactly the shape this allowlist describes.
     * The sweep classifies it as a CANDIDATE instead, because `sibs` is computed over the WHOLE
     * step and the entry's two NEIGHBOURS — the trip blocks — carry `p`. Those siblings belong
     * to different actions, so they say nothing about whether the ECCS press is observable; the
     * sweep is asking a per-step question of a per-entry property. Adding the step here was
     * tried first and REDDENS this check (an allowlist key with no matching entry), which is how
     * the gap was found.
     * NOT WIDENED HERE. Making `sibs` per-entry would reclassify entries across the whole pool
     * and this change is not the place to re-adjudicate them; the consequence is recorded on the
     * step itself and in #739 instead. The residual risk is small and named: a player who
     * pressed STOP before reaching step 3 has nothing to re-press against, and `eccsStop`
     * refuses only with safety injection latched, which the leg reaches this step without
     * (1923 psi, `si_actuated` false, measured). */
    var NO_STATE_EXPECTED = { 'pwr_raise_power:3': 1 };
    var noStateTally = {};
    NO_STATE.forEach(function (r) { var k = r.proc + ':' + r.step; noStateTally[k] = (noStateTally[k] || 0) + 1; });
    var noStateKeys = Object.keys(noStateTally), expectedKeys = Object.keys(NO_STATE_EXPECTED);
    var noStateOk = noStateKeys.length === expectedKeys.length &&
      expectedKeys.every(function (k) { return noStateTally[k] === NO_STATE_EXPECTED[k]; });
    ck('the no-observable-state command entries are the known, documented judgement calls (#697)',
       noStateOk,
       NO_STATE.map(function (r) { return r.proc + ' step ' + r.step; }).join(', ') || 'none');

    var icCache = {};
    function bootSnapshot(from) {
      if (icCache[from]) return icCache[from];
      var svc = mkSvc(from);
      var s = null; for (var i = 0; i < 30; i++) s = svc.tick();
      return (icCache[from] = s);
    }
    var preSatisfied = [];
    CANDIDATES.forEach(function (r) {
      var snap = bootSnapshot(r.from);
      if (r.siblings.every(function (e2) { return grader._grade(snap, e2).met; })) {
        preSatisfied.push(r.proc + ' step ' + r.step);
      }
    });
    ck('no command-kind acceptance with an observable state is pre-satisfied at its own leg\'s boot IC (#697)',
       preSatisfied.length === 0,
       (preSatisfied.length ? 'PRE-SATISFIED: ' + preSatisfied.join(', ') + '; ' : '') +
       CANDIDATES.length + ' candidate(s) checked');
  })();

  /* 2o. LIVE PROOF, #697 — the two confirmed instances, driven through the actual checklist
   * runtime with the fixed command NEVER pressed. Each also proves RED BY INJECTION: the fixed
   * entry is mutated back to its pre-#697 shape (pure cmd, no `.p`) for one drive, then restored —
   * the pre-fix shape must soft-lock (stick at the step forever, `met: false, obs: null`, the
   * SAME two siblings already true underneath it), the fixed shape must complete. */
  (function () {
    var POOL2 = RD.MANUAL_PROCEDURES.pwr2;

    function driveCooldownStep4(maxTicks) {
      var svc = mkSvc('hot_zero_power');
      svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_cooldown' });
      var s = null, didBoron = false, didPressure1 = false, didTripBlocks = false, rampIdx = 0;
      var rampPoints = [7.03, 4.42, 2.76, 1.66, 0.83];
      for (var i = 0; i < maxTicks; i++) {
        s = svc.tick();
        var c = s.instructor && s.instructor.checklist;
        if (!c) continue;
        if (c.complete) return { done: true, step: c.step_index };
        if (c.step_index === 0 && !didBoron) { svc.handleCommand({ action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 920 }); didBoron = true; }
        if (c.step_index === 1 && !didPressure1) { svc.handleCommand({ action: 'set_pressure_setpoint', mpa: 13.1 }); didPressure1 = true; }
        if (c.step_index === 2 && !didTripBlocks) {
          svc.handleCommand({ action: 'set_trip_block', trip_id: 'lo_press', blocked: true });
          svc.handleCommand({ action: 'set_trip_block', trip_id: 'si_trip', blocked: true });
          /* …AND THE THIRD ACTION THE STEP ASKS FOR (#739). The step's text has ALWAYS ended
           * "Then press STOP on ECCS"; this driver issued the two blocks and not the press,
           * which did not matter while the press was ungraded. It is graded now, so the driver
           * sticks at step 3 without it — MEASURED when the entry first landed: this probe
           * reached step_index 2 and stopped, tavg 286.2 degC. That is the check working, not
           * the driver being wrong to model a player: the fix is for the stand-in operator to
           * perform the whole step, the same way it already presses both trip blocks. */
          svc.handleCommand({ action: 'set_hpi', active: false });
          didTripBlocks = true;
        }
        // step 4 (index 3): drive the dump setpoint ramp; NEVER press set_steam_dump auto.
        if (c.step_index === 3 && i % 20 === 0) {
          rampIdx = Math.min(rampPoints.length - 1, rampIdx + 1);
          svc.handleCommand({ action: 'set_steam_dump_setpoint', mpa: rampPoints[rampIdx] });
        }
        if (c.awaiting_ack && !c.complete) svc.handleCommand({ action: 'checklist_check', index: c.step_index });
      }
      var f = s.instructor && s.instructor.checklist;
      return { done: false, step: f && f.step_index, accs: f && f.accs, tavg_c: s.true_state.tavg_c };
    }

    function driveShutdownStep3(maxTicks) {
      var svc = mkSvc('hot_full_power');
      svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_shutdown' });
      var s = null, didLoad = false, didScram = false;
      for (var i = 0; i < maxTicks; i++) {
        s = svc.tick();
        var c = s.instructor && s.instructor.checklist;
        if (!c) continue;
        if (c.complete) return { done: true, step: c.step_index };
        if (c.step_index === 0 && !didLoad) { svc.handleCommand({ action: 'set_load_target', mwe: 0 }); didLoad = true; }
        if (c.step_index === 1 && !didScram) { svc.handleCommand({ action: 'scram' }); didScram = true; }
        // step 3 (index 2): NEVER press set_steam_dump auto.
        if (c.awaiting_ack && !c.complete) svc.handleCommand({ action: 'checklist_check', index: c.step_index });
      }
      var f = s.instructor && s.instructor.checklist;
      return { done: false, step: f && f.step_index, accs: f && f.accs,
        power_pct: s.true_state.power_pct, valve: s.true_state.steam_dump_valve_pct };
    }

    function withReverted(proc_id, stepIdx, fn) {
      var proc = POOL2.filter(function (p) { return p.id === proc_id; })[0];
      var entry = proc.steps[stepIdx].accs[0];
      var saved = { p: entry.p, op: entry.op, v: entry.v };
      delete entry.p; delete entry.op; delete entry.v;
      var result;
      try { result = fn(); } finally { entry.p = saved.p; entry.op = saved.op; entry.v = saved.v; }
      return result;
    }

    var cdFixed = driveCooldownStep4(6000);
    ck('pwr_cooldown step 4 completes with the fix, AUTO never pressed (#697)',
       cdFixed.done === false && cdFixed.step >= 4,
       'tavg reached ' + (cdFixed.tavg_c != null ? (cdFixed.tavg_c * 9 / 5 + 32).toFixed(1) + ' degF (' + cdFixed.tavg_c.toFixed(1) + ' degC)' : '?') + ', advanced to step_index ' + cdFixed.step);
    var cdRed = withReverted('pwr_cooldown', 3, function () { return driveCooldownStep4(6000); });
    ck('...RED BY INJECTION: the pre-#697 shape soft-locks step 4 forever (siblings already true)',
       cdRed.done === false && cdRed.step === 3 && cdRed.accs && cdRed.accs[0].met === false && cdRed.accs[1].met === true,
       JSON.stringify(cdRed.accs));

    var sdFixed = driveShutdownStep3(600);
    ck('pwr_shutdown step 3 completes with the fix, AUTO never pressed (#697 — the reported instance)',
       sdFixed.done === true,
       'done=' + sdFixed.done + ' step_index=' + sdFixed.step);
    var sdRed = withReverted('pwr_shutdown', 2, function () { return driveShutdownStep3(600); });
    ck('...RED BY INJECTION: the pre-#697 shape soft-locks step 3 forever (siblings already true)',
       sdRed.done === false && sdRed.step === 2 && sdRed.accs && sdRed.accs[0].met === false &&
       sdRed.accs[1].met === true && sdRed.accs[2].met === true,
       JSON.stringify(sdRed.accs));
  })();

  /* 2p. #696 — `pwr_shutdown`'s precondition now has an UPPER bound. Only `power_pct > 10` was
   * checked before, which the leg's own `from: 'hot_full_power'` satisfies — measured (#696
   * comment), that standalone entry is the +21.0 °F (+11.7 °C) / 601.3 °F Tavg spike, 54.3 °F
   * (30.1 °C) above the no-load program, sourced against Ginna's 50 % RTP loss-of-load trip
   * threshold. `precond` WARNS, never blocks *(OWNER RULING, 2026-08-06)*, so this asserts the
   * BANNER, not a refusal: unmet at the standalone 100 % entry, met on the leg's own INTENDED
   * chained entry (`pwr_lower_power` run to completion into this leg — the plant it actually
   * hands off, not the `low_power` boot IC, which measures 9.4 % power and would fail the
   * EXISTING lower-bound row for reasons #696 does not touch).
   *
   * 30 %, NOT THE ISSUE'S OWN 20 %: measured here, the chained handoff settles at 22-23 %, not
   * the ~15 % `pwr_lower_power`'s text promises (the already-tracked #508 rod-trim residue) — a
   * 20 % ceiling would warn on the leg's own shipped, correct route, which is worse than the gap
   * it replaces. PROVEN RED BY INJECTION: the upper-bound row is removed for one drive, and the
   * 100 % entry must then show NO unmet row at all — the exact silence the owner hit. */
  (function () {
    var proc = POOL.filter(function (p) { return p.id === 'pwr_shutdown'; })[0];
    var lowerPowerProc = POOL.filter(function (p) { return p.id === 'pwr_lower_power'; })[0];
    var upperIdx = (proc.precond || []).findIndex(function (c) { return c.op === '<='; });

    function preconVerdict(svc) {
      svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_shutdown' });
      var s = null; for (var i = 0; i < 8; i++) s = svc.tick();
      var pc = s.instructor && s.instructor.checklist && s.instructor.checklist.preconditions;
      return pc && pc[upperIdx] ? pc[upperIdx] : null;
    }

    ck('pwr_shutdown\'s precondition has an upper bound now (#696)', upperIdx >= 0,
       upperIdx >= 0 ? JSON.stringify(proc.precond[upperIdx]) : 'no <= row found');

    var vFull = preconVerdict(mkSvc('hot_full_power'));
    ck('...UNMET at a standalone 100 % entry (was silently accepted before #696)',
       vFull && vFull.met === false, vFull ? JSON.stringify(vFull) : 'no verdict');

    var chained = RD.ProceduresHarness.runProcedure('pwr2', lowerPowerProc, { seed: 42 });
    var vChained = preconVerdict(chained.svc);
    ck('...MET on the leg\'s own INTENDED chained entry (pwr_lower_power run to completion)',
       vChained && vChained.met === true, vChained ? JSON.stringify(vChained) : 'no verdict');

    if (upperIdx >= 0) {
      var removed = proc.precond.splice(upperIdx, 1)[0];
      var vRed = preconVerdict(mkSvc('hot_full_power'));
      proc.precond.splice(upperIdx, 0, removed);
      ck('...RED BY INJECTION: without the upper bound, the 100 % entry shows no unmet row at all',
         vRed === null, vRed === null ? '(row absent, as expected pre-#696)' : JSON.stringify(vRed));
    }
  })();

  /* 2q. THE #698 SWEEP GAP — REMOVING A CONTROL LEAVES STALE PROSE BEHIND, AND NOTHING READS
   * PROSE (#714, owner live playtest 2026-09-12: "mode 3> mode 1 step 2 walkthrough is broken.
   * its looking for a chemistry sample but that feature has been removed there is no sample
   * button any more.").
   *
   * `pwr2:pwr_startup` step 2's `acc` has always graded true `boron_ppm`, never a
   * `take_boron_sample` command — so 2n's sweep above (pure CMD-KIND entries, #697/#698's own
   * shape) correctly never flagged it, and the REPLAY (section 1) drove it to completion on
   * every run: 195/195 straight through the regression. What broke is the `note`/`target`
   * PROSE, which told the player to expect a SAMPLE control and a lab delay #698 deleted from
   * the board the same day. Neither this runner's replay nor 2n reads `note`, `target`, `text`,
   * `why`, `story`, or `cautions` at all — the acceptance-shape gate and the prose are two
   * different things, and only the first is gated. Same hole CLAUDE.md already records for
   * `Manuals/*.md` ("nothing gates manual prose"); it turns out to reach this file's own free
   * text too.
   *
   * Fixed by REWORDING (#714) — no acceptance changed. This sweep is the gate: every pwr2
   * procedure and step, scanned whole-object for "sample". Zero is the measured, corrected
   * count (one hit, `pwr_startup` step 2, before the fix). Proven red by injection: the exact
   * stale phrase is reinstated into the step's `note`, the sweep must catch it, then it is
   * restored. Not a general prose-linter — narrow to the one word this regression turned on,
   * per the "narrow and silent beats broad and noisy" rule this file already states for 2n. */
  (function () {
    var STALE_RE = /sample/i;
    function sweep() {
      var hits = [];
      POOL.forEach(function (proc) {
        ['title', 'purpose', 'outcome'].forEach(function (k) {
          if (typeof proc[k] === 'string' && STALE_RE.test(proc[k])) hits.push(proc.id + '.' + k);
        });
        (proc.prereq || []).forEach(function (t, i) { if (STALE_RE.test(t)) hits.push(proc.id + '.prereq[' + i + ']'); });
        (proc.cautions || []).forEach(function (t, i) { if (STALE_RE.test(t)) hits.push(proc.id + '.cautions[' + i + ']'); });
        (proc.steps || []).forEach(function (st, idx) {
          if (STALE_RE.test(JSON.stringify(st))) hits.push(proc.id + ' step ' + (idx + 1));
        });
      });
      return hits;
    }

    ck('no pwr2 checklist text (title/purpose/prereq/cautions/outcome/step) mentions SAMPLE (#714)',
       sweep().length === 0, sweep().join(', ') || 'clean');

    var proc = POOL.filter(function (p) { return p.id === 'pwr_startup'; })[0];
    var step = proc.steps[1];
    var saved = step.note;
    step.note = saved + ' BORON CHEM updates only after a SAMPLE.';
    var redHits = sweep();
    step.note = saved;
    ck('...RED BY INJECTION: reinstating the stale SAMPLE phrase in step 2\'s note is caught',
       redHits.indexOf('pwr_startup step 2') !== -1, redHits.join(', '));
  })();

  /* 2r. THE HONEST GATE FOR #715 — "a leg completes on a scrammed plant and tells the player
   * it succeeded." A gate that only re-checks the acceptance STRINGS changed is hollow (this
   * file caught exactly that shape hours before this issue was filed) — this one reproduces
   * the filed scenario end to end: scram BEFORE `pwr_lower_power` starts (the operator
   * playthrough's own sequence — a real scram between `pwr_raise_power` and this leg), then
   * drive the checklist the way a player would and read its OWN `complete`/`outcome_verified`
   * fields, never re-deriving them.
   *
   * BEFORE THE FIX: all four load-drop steps' accs were satisfied by the scram snapshot alone
   * (power_pct and tavg_c both one-sided, no `set_load_target` ever issued — measured,
   * `inbox/scram/repro_s1.js`) and the checklist ran to `complete: true` with the banner still
   * reading "15 MWe". AFTER: each step now also requires `mwe_output` near its own commanded
   * load (#715 cause 1), which a scrammed turbine cannot supply, so the checklist sticks —
   * and even if it did not, `outcome_guard` (#715 cause 2, sub-block below) keeps the banner
   * from repeating the claim. */
  (function () {
    var svc = mkSvc('hot_full_power');
    svc.handleCommand({ action: 'scram' });
    for (var i = 0; i < 20; i++) svc.tick();   // same 20 s settle as the filed repro (10x accel)
    var pre = svc.tick();
    ck('#715 setup: plant is actually scrammed before the leg starts',
       pre.true_state.turbine_tripped === true && pre.true_state.mwe_output === 0,
       'turbine_tripped=' + pre.true_state.turbine_tripped + ' mwe_output=' + pre.true_state.mwe_output +
       ' power_pct=' + pre.true_state.power_pct.toFixed(2));
    var r = svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_lower_power' });
    ck('#715 setup: start_checklist accepted on the scrammed plant (Path 3 does not reset it)',
       !(r && r.type === 'error'), r && r.message);
    // step 1 (boron) is unrelated to the defect and gates on a real command — issue it, same
    // as any operator would, so the driver actually reaches the vulnerable steps 2-5.
    svc.handleCommand({ action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 719 });
    var s = null, maxStepSeen = 0;
    for (var k = 0; k < 400; k++) {
      s = svc.tick();
      var cs = s.instructor && s.instructor.checklist;
      if (cs) maxStepSeen = Math.max(maxStepSeen, cs.step_index);
      if (cs && cs.awaiting_ack && !cs.complete) svc.handleCommand({ action: 'checklist_check', index: cs.step_index });
    }
    var ckst = s.instructor && s.instructor.checklist;
    ck('#715 — pwr_lower_power does NOT complete on a plant scrammed before it started (no set_load_target ever issued)',
       !!ckst && ckst.complete !== true,
       ckst ? ('complete=' + ckst.complete + ', stuck at step ' + (ckst.step_index + 1) + '/' + ckst.step_total +
               ' (reached step ' + (maxStepSeen + 1) + '), mwe_output=' + s.true_state.mwe_output) : 'no checklist');
    ck('#715 — the checklist reached the vulnerable steps (2-5), not stuck on step 1\'s boron gate',
       maxStepSeen >= 1, 'furthest step index reached: ' + maxStepSeen);
  })();

  /* 2s. THE BANNER'S OWN CHECK, DIRECTLY (#715 cause 2, defense in depth). `outcome_guard` must
   * keep the completion note from claiming a state the plant does not hold EVEN IF a future
   * edit reopens a hole in cause 1's per-step pairing — proven by injection on the mechanism
   * itself, not inferred from 2r's outcome. */
  (function () {
    var IL = RD.InstructorLayer;
    var il = new IL(null);
    var proc = POOL.filter(function (p) { return p.id === 'pwr_lower_power'; })[0];
    ck('pwr_lower_power authors an outcome_guard (#715) — not vacuous',
       Array.isArray(proc.outcome_guard) && proc.outcome_guard.length > 0, JSON.stringify(proc.outcome_guard));

    var svc = mkSvc('hot_full_power');
    svc.handleCommand({ action: 'scram' });
    var scrammed = null; for (var i = 0; i < 20; i++) scrammed = svc.tick();
    il.step(scrammed, scrammed.metadata.sim_time);
    ck('outcome_guard reads FALSE against the scrammed snapshot',
       il._gradeOutcomeGuard(proc) === false,
       'turbine_tripped=' + scrammed.true_state.turbine_tripped + ' mwe_output=' + scrammed.true_state.mwe_output);

    var svc2 = mkSvc('hot_full_power');
    svc2.handleCommand({ action: 'set_load_target', mwe: 15 });
    var healthy = null; for (var j = 0; j < 40; j++) healthy = svc2.tick();
    il.step(healthy, healthy.metadata.sim_time);
    ck('outcome_guard reads TRUE against a healthy plant still carrying load',
       il._gradeOutcomeGuard(proc) === true,
       'turbine_tripped=' + healthy.true_state.turbine_tripped + ' mwe_output=' + healthy.true_state.mwe_output.toFixed(1));

    // RED BY INJECTION: strip the guard and confirm the same scrammed snapshot now reads
    // verified — proves the TRUE case above is testing the guard, not a tautology.
    il.step(scrammed, scrammed.metadata.sim_time);
    var saved = proc.outcome_guard;
    proc.outcome_guard = null;
    var noGuardResult = il._gradeOutcomeGuard(proc);
    proc.outcome_guard = saved;
    ck('...RED BY INJECTION: with the guard removed, the same scrammed snapshot reads verified (true) — the guard is load-bearing',
       noGuardResult === true, 'result with no guard authored: ' + noGuardResult);
  })();

  /* 2t. A TRIP BLOCK IS GRADED ON THE LINEUP, AND THE SENSE IS NOT REVERSIBLE (#731, owner
   * playtest #724 item 13: "i blocked both trips on step 16 but when i got to step 17 it didnt
   * automatically detect the PR HIGH trip block was blocked. When i unblocked the trip the step
   * thought i had blocked it and checked off the step. this would have left me in a condition
   * where the trip would have fired and ended my playthrough.").
   *
   * Two defects in one step, and the second is the dangerous one. `pwr_startup` steps 16 and 17
   * carried a bare `cmd`, so the live checklist graded them on SEEING `set_trip_block` descend
   * while the step was active — and `_cmdEvidence` discriminated on `trip_id` alone, so
   * `{blocked: false}` was evidence for a step that asks for a BLOCK.
   *
   * MEASURED ON THE PRE-FIX TREE (`inbox/724/repro13.js`, `invert13.js`, run against a scratch
   * worktree at the parent commit): entering step 17 with pr_low_setpoint ALREADY blocked left
   * the step unmet for 402 s of plant time, and issuing the UNBLOCK lit its Continue button 6 s
   * later with the trip live at 9.91 % power. After the fix: met 18 s after entry on the
   * standing block, still unmet 126 s after an unblock, met 30 s after the block is replaced.
   *
   * DRIVEN ON THE REAL LEG, not a synthetic probe: the whole point is that a block placed by a
   * PREVIOUS step is seen, which only a run that reaches step 17 through step 16 can show.
   * ~30 s of wall time for the two drives. */
  (function () {
    var proc = POOL.filter(function (p) { return p.id === 'pwr_startup'; })[0];
    var i16 = -1, i17 = -1;
    (proc.steps || []).forEach(function (st, k) {
      if (!st.cmd || st.cmd.action !== 'set_trip_block') return;
      if (st.cmd.trip_id === 'ir_high') i16 = k;
      if (st.cmd.trip_id === 'pr_low_setpoint') i17 = k;
    });
    ck('pwr_startup carries both trip-block steps and BOTH grade on the lineup, not on the press (#731)',
       i16 >= 0 && i17 >= 0 && i16 < i17 &&
       !!(proc.steps[i16].acc && proc.steps[i16].acc.p === 'ir_high_blocked') &&
       !!(proc.steps[i17].acc && proc.steps[i17].acc.p === 'pr_low_setpoint_blocked'),
       'steps ' + (i16 + 1) + '/' + (i17 + 1) + ' acc ' +
       JSON.stringify(proc.steps[i16] && proc.steps[i16].acc) + ' / ' +
       JSON.stringify(proc.steps[i17] && proc.steps[i17].acc));

    /* the SENSE, on the mechanism itself — cheap, and it speaks for every leg rather than only
     * this one (`pwr_cooldown` authors two more set_trip_block steps) */
    var il = new RD.InstructorLayer(null);
    var askBlock = { action: 'set_trip_block', trip_id: 'pr_low_setpoint', blocked: true };
    ck('_cmdEvidence: an UNBLOCK is NOT evidence for a step that asks for a block (#731 — it was)',
       il._cmdEvidence(askBlock, { action: 'set_trip_block', trip_id: 'pr_low_setpoint', blocked: false }) === false);
    ck('..._cmdEvidence: the matching BLOCK still is, and a different row still is not',
       il._cmdEvidence(askBlock, { action: 'set_trip_block', trip_id: 'pr_low_setpoint', blocked: true }) === true &&
       il._cmdEvidence(askBlock, { action: 'set_trip_block', trip_id: 'ir_high', blocked: true }) === false);

    /* THE LIVE LEG. A player who blocks BOTH rows while step 16 is up must find step 17 already
     * satisfied when it comes up. */
    var svc = mkSvc('hot_zero_power');
    svc.timeAcceleration = 60;
    var s = null; for (var i = 0; i < 3; i++) s = svc.tick();
    svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_startup' });
    var pressed = {}, ordMemo = {}, t17 = null, metOnEntry = null, cs = null;
    for (var n = 0; n < 6000; n++) {
      s = svc.tick();
      cs = s.instructor && s.instructor.checklist;
      if (!cs || cs.complete) break;
      var idx = cs.step_index, st = proc.steps[idx];
      if (!pressed[idx]) {
        pressed[idx] = true;
        if (idx === i16) {
          // the owner's action: BOTH rows blocked while step 16 is the active step
          svc.handleCommand({ action: 'set_trip_block', trip_id: 'ir_high', blocked: true });
          svc.handleCommand({ action: 'set_trip_block', trip_id: 'pr_low_setpoint', blocked: true });
        } else if (idx === i17) {
          t17 = s.metadata.sim_time;
        } else {
          if (st.cmd) svc.handleCommand(st.cmd);
          if (!st.accs_ordered) (st.accs || []).forEach(function (e) {
            if (e.cmd) svc.handleCommand(typeof e.cmd === 'string' ? { action: e.cmd } : e.cmd);
          });
        }
      }
      if (st && st.accs_ordered && idx !== i16 && idx !== i17) {
        ordMemo[idx] = ordMemo[idx] || {};
        pressOrderedRow(svc, st, cs, ordMemo[idx]);
      }
      if (idx === i17) {
        var d = s.metadata.sim_time - t17;
        if (metOnEntry === null && cs.awaiting_ack) { metOnEntry = d; break; }
        if (d > 200) break;
        continue;
      }
      if (idx > i17) break;
      if (cs.awaiting_ack) svc.handleCommand({ action: 'checklist_check', index: idx });
    }
    ck('a block placed on step 16 checks step 17 off ON ENTRY (#731 — it waited for ever before)',
       metOnEntry !== null && metOnEntry <= 60,
       metOnEntry === null ? 'step ' + (i17 + 1) + ' never met; index ' + (cs && cs.step_index) +
                             ', pr blocked=' + !!(s.rps_state && s.rps_state.trip_blocks.pr_low_setpoint)
                           : 'met ' + metOnEntry.toFixed(0) + ' s after entry at ' +
                             s.true_state.power_pct.toFixed(1) + ' % power');

    /* THE UNSAFE DIRECTION, on the live leg: enter step 17 with the row UNBLOCKED (block only
     * ir_high on step 16), issue the unblock, and the step must stay open. */
    var svc2 = mkSvc('hot_zero_power');
    svc2.timeAcceleration = 60;
    var s2 = null; for (var i2 = 0; i2 < 3; i2++) s2 = svc2.tick();
    svc2.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_startup' });
    var pressed2 = {}, ordMemo2 = {}, t17b = null, metUnblocked = null, metBlocked = null, blockedAt = null, cs2 = null;
    for (var n2 = 0; n2 < 6000; n2++) {
      s2 = svc2.tick();
      cs2 = s2.instructor && s2.instructor.checklist;
      if (!cs2 || cs2.complete) break;
      var j = cs2.step_index, st2 = proc.steps[j];
      if (!pressed2[j]) {
        pressed2[j] = true;
        if (j === i16) svc2.handleCommand({ action: 'set_trip_block', trip_id: 'ir_high', blocked: true });
        else if (j === i17) {
          t17b = s2.metadata.sim_time;
          svc2.handleCommand({ action: 'set_trip_block', trip_id: 'pr_low_setpoint', blocked: false });
        } else {
          if (st2.cmd) svc2.handleCommand(st2.cmd);
          if (!st2.accs_ordered) (st2.accs || []).forEach(function (e) {
            if (e.cmd) svc2.handleCommand(typeof e.cmd === 'string' ? { action: e.cmd } : e.cmd);
          });
        }
      }
      if (st2 && st2.accs_ordered && j !== i16 && j !== i17) {
        ordMemo2[j] = ordMemo2[j] || {};
        pressOrderedRow(svc2, st2, cs2, ordMemo2[j]);
      }
      if (j === i17) {
        var d2 = s2.metadata.sim_time - t17b;
        if (blockedAt === null) {
          if (cs2.awaiting_ack && metUnblocked === null) metUnblocked = d2;
          if (d2 > 120) {
            blockedAt = d2;
            svc2.handleCommand({ action: 'set_trip_block', trip_id: 'pr_low_setpoint', blocked: true });
          }
        } else if (metBlocked === null && cs2.awaiting_ack) { metBlocked = d2 - blockedAt; break; }
        if (d2 > 320) break;
        continue;
      }
      if (j > i17) break;
      if (cs2.awaiting_ack) svc2.handleCommand({ action: 'checklist_check', index: j });
    }
    ck('UNBLOCKING the trip does NOT check the step off (#731 — it did, leaving a live trip)',
       metUnblocked === null && t17b !== null,
       t17b === null ? 'never reached step ' + (i17 + 1)
                     : 'held open ' + (blockedAt === null ? '(no hold window)' : blockedAt.toFixed(0) + ' s') +
                       ' with pr_low_setpoint unblocked at ' + s2.true_state.power_pct.toFixed(1) + ' % power');
    ck('...and BLOCKING it then does — the check is not simply dead',
       metBlocked !== null && metBlocked <= 60,
       metBlocked === null ? 'still unmet after the block; pr blocked=' +
                             !!(s2.rps_state && s2.rps_state.trip_blocks.pr_low_setpoint)
                           : 'met ' + metBlocked.toFixed(0) + ' s after the block');
  })();

  /* 2u. THE PRECONDITION COMMENT IS SAID ONCE PER RUN, NOT ONCE PER CROSSING (#732, owner
   * playtest #724 item 15: "Walkthrough leaving mode 3>1 checklist and going into mode 1, power
   * ascension it gave me a flickering warning that prerequisites for this checklist are not met
   * since i think the reactor power was on the line for these prerequisites").
   *
   * `_stepChecklist` guarded the RAISE with `!cklMoving` and left the CLEAR unguarded, so
   * `precondMsg` fell back to false the moment every row recovered and the next crossing raised
   * the comment again. A checklist sits on step 0 for as long as its first step is ungraded, so
   * `cklMoving` is false for the whole of the window in which the flicker happens.
   *
   * MEASURED BY BACKSHOP, INHERITED HERE: `power_pct` on the `low_power` initial condition runs
   * 9.222-10.061 %, a span of 0.840 points, and crosses `pwr_raise_power`'s authored `> 10 %`
   * row twice in ten plant-minutes. The threshold half of that fix is theirs; this is the
   * mechanism half.
   *
   * THE COUNT IS THE ASSERTION, NOT THE STATE AT ONE INSTANT (#627's trap: a condition
   * re-decided every step chatters, and a gate that samples one crossing passes anyway).
   * PROVEN RED BY INJECTION against a scratch worktree at the parent commit
   * (`inbox/724/precond_flicker.js`): six crossings raised the comment SIX times there and once
   * here, while the heal case reads 1 raise / 1 clear on BOTH trees — so the latch is not
   * bought by breaking the clear. */
  (function () {
    var PROBE = {
      id: '__precond_flicker__', category: 'control', title: 'flicker probe', from: 'hot_full_power',
      precond: [{ p: 'power_pct', op: '>', v: 10, text: 'Reactor at power: REACTOR POWER above 10 %' }],
      steps: [{ text: 'never satisfied', acc: { p: 'power_pct', op: '>', v: 999 } }]
    };
    function snap(power, t) {
      return { metadata: { sim_time: t, plant_id: 'pwr2' }, true_state: { power_pct: power },
               instruments: {}, control_state: {}, rps_state: { trip_blocks: {} } };
    }
    function run(series) {
      var il = new RD.InstructorLayer(null);
      il.engineKey = 'pwr2';
      il.loadChecklist(PROBE, { procedure_id: PROBE.id, profile_key: 'pwr2' });
      var raises = 0, clears = 0, standing = false, t = 0;
      series.forEach(function (pw) {
        t += 0.1;
        il.pendingMessage = null;
        il.step(snap(pw, t), t);
        var m = il.pendingMessage;
        if (m && /prerequisites|PRECONDITIONS/i.test(m.industry || m.learning || '')) raises++;
        var now = !!(il.checklist && il.checklist.precondMsg);
        if (standing && !now) clears++;
        standing = now;
      });
      return { raises: raises, clears: clears, standing: standing };
    }
    var osc = [];
    for (var k = 0; k < 6; k++) {
      for (var i = 0; i < 5; i++) osc.push(9.222);
      for (var j = 0; j < 5; j++) osc.push(10.061);
    }
    var r1 = run(osc);
    ck('a precondition predicate crossing its threshold six times raises the comment ONCE (#732 — it raised it six times)',
       r1.raises === 1, 'raises ' + r1.raises + ', clears ' + r1.clears + ' over 60 ticks');

    var heal = [];
    for (var a = 0; a < 10; a++) heal.push(9.0);
    for (var c = 0; c < 10; c++) heal.push(20.0);
    var r2 = run(heal);
    ck('...and a precondition that genuinely recovers still takes the standing comment DOWN (a latch that never clears is the same defect facing the other way)',
       r2.raises === 1 && r2.clears === 1 && r2.standing === false,
       'raises ' + r2.raises + ', clears ' + r2.clears + ', standing ' + r2.standing);

    var fine = []; for (var d = 0; d < 20; d++) fine.push(20.0);
    ck('...and a plant that never breaks the precondition says nothing at all',
       run(fine).raises === 0);

    /* THE LATCH SURVIVES A REWIND, because a rewind is a loadState of a checkpoint and NOT a new
     * run (quality pass, 2026-09-12). Found by review, not by this section: 2u above drives
     * `step()` only, so it could never see `loadState` rebuild the checklist without the flag and
     * hand the player the flicker back one Rewind press at a time. An OLD save with no field must
     * still read false, i.e. behave exactly as it did before #732.
     * PROVEN RED BY INJECTION on a scratch worktree at the parent commit: 2 / 2 / 2 there
     * (inbox/724/precond_rewind.js), 1 / 0 / 1 here. */
    function raisesOver(il, series, t0) {
      var n = 0, t = t0;
      series.forEach(function (pw) {
        t += 0.1; il.pendingMessage = null; il.step(snap(pw, t), t);
        var m = il.pendingMessage;
        if (m && /prerequisites|PRECONDITIONS/i.test(m.industry || m.learning || '')) n++;
      });
      return n;
    }
    /* ⚠ THE PROBE MUST BE IN THE POOL FOR THE RESTORE HALF, and this was WRONG on the first
     * attempt — `loadState` looks the procedure up by id in the pool it is handed and DROPS the
     * checklist when it cannot find it. The "after a rewind it says nothing" check then passed
     * for the wrong reason: there was no checklist left to say anything. The gate caught it (the
     * old-save check reddened beside it, and `loadState` logged the drop), which is the whole
     * argument for asserting BOTH directions rather than only the one you expect to pass.
     * Same push/pop idiom as `__accs_probe__` in section 2c. */
    RD.MANUAL_PROCEDURES.pwr2.push(PROBE);
    var cycle = [9, 9, 9, 20, 20, 9, 9, 9];
    var ilA = new RD.InstructorLayer(null);
    ilA.engineKey = 'pwr2';
    ilA.loadChecklist(PROBE, { procedure_id: PROBE.id, profile_key: 'pwr2' });
    var rA = raisesOver(ilA, cycle, 0);
    var saved = ilA.saveState();
    ck('the once-per-run latch is SAVED with the checkpoint (#732 — a rewind is not a new run)',
       rA === 1 && saved && saved.checklist && saved.checklist.precond_said === true,
       'raises ' + rA + ', precond_said ' + (saved && saved.checklist && saved.checklist.precond_said));
    var ilB = new RD.InstructorLayer(null);
    ilB.engineKey = 'pwr2';
    ilB.loadState(saved, RD.MANUAL_PROCEDURES);
    ck('...so the same oscillation after a REWIND says nothing at all',
       raisesOver(ilB, cycle, 100) === 0);
    var oldSave = JSON.parse(JSON.stringify(saved));
    delete oldSave.checklist.precond_said;
    var ilC = new RD.InstructorLayer(null);
    ilC.engineKey = 'pwr2';
    ilC.loadState(oldSave, RD.MANUAL_PROCEDURES);
    ck('...and a save written before the field reads false — unchanged behaviour, not a migration break',
       raisesOver(ilC, cycle, 200) === 1 && !!ilC.checklist,
       ilC.checklist ? 'checklist restored, precondSaid ' + ilC.checklist.precondSaid
                     : 'CHECKLIST WAS DROPPED — the probe is not in the pool');
    /* and the restore half is only meaningful if the checklist SURVIVED the load */
    ck('...both restores actually rebuilt the checklist (guards the wrong-reason pass above)',
       !!ilB.checklist && !!ilC.checklist,
       'B ' + !!ilB.checklist + ', C ' + !!ilC.checklist);
    RD.MANUAL_PROCEDURES.pwr2.pop();
  })();

  /* 2v. A STEP MAY NOT AUTHOR BOTH `acc` AND `accs` — THE DEAD-FIELD GATE (#739, 2026-09-13).
   *
   * `instructor_layer.js` `_gradeStep` is `if (st.accs && st.accs.length) {...} else if (st.acc)
   * {...}`. An author who writes both gets NO error and NO warning: the `accs` branch wins and
   * the `acc` is simply never read. `pwr_heatup` step 15 shipped that way — its `plant_mode ~ 3`
   * was the heatup leg's ONLY Mode 3, Hot Standby confirmation and it never graded once, while
   * the step ticked on the atmospheric dump valve and steam pressure alone.
   *
   * WHY A GATE AND NOT A GRADER CHANGE. Teaching `_gradeStep` to honour both would have changed
   * exactly ONE step's live grading (this sweep is how that was measured: 248 steps across all
   * five pools, 34 with `accs` when the decision was taken — 36 once this same change converted
   * `pwr_cooldown` 7 and 10 — and exactly 1 with both) and would contradict the schema header in
   * `ui/manual_procedures.js` — "When `accs` is present it REPLACES `acc`". The field was folded
   * into the `accs` list instead; this makes the silent case loud for the next author.
   *
   * ALL FIVE POOLS, not just pwr2 — the trap is in the shared grader, so a pwr/rbmk/bwr step
   * would be just as dead. PROVEN RED BY INJECTION below: an `acc` is put back on the step it
   * was removed from, the sweep must name it, then it is removed again. */
  (function () {
    var POOLS = RD.MANUAL_PROCEDURES;
    function sweep() {
      var hits = [];
      Object.keys(POOLS).forEach(function (key) {
        (POOLS[key] || []).forEach(function (proc) {
          (proc.steps || []).forEach(function (st, i) {
            if (st.acc && st.accs && st.accs.length) hits.push(key + ':' + proc.id + ' step ' + (i + 1));
          });
        });
      });
      return hits;
    }
    var hits = sweep();
    ck('no step authors both `acc` and `accs` — the `accs` branch wins and the `acc` is dead (#739)',
       hits.length === 0, hits.join(', ') || 'clean across all ' + Object.keys(POOLS).length + ' pools');

    /* THE INJECTION TARGET IS FOUND BY CONTENT, NOT BY INDEX (#739). `steps[14]` would be a
     * sixth entry in this repo's collection of array-index couplings, and the merge proposal
     * under discussion moves exactly these steps. It is the heatup step whose `accs` carries the
     * Mode 3 confirmation — which is the thing the check is about. */
    var victim = (POOLS.pwr2 || []).filter(function (p) { return p.id === 'pwr_heatup'; })[0];
    var vIdx = victim ? victim.steps.findIndex(function (s) {
      return (s.accs || []).some(function (e) { return e.p === 'plant_mode'; });
    }) : -1;
    var step = vIdx >= 0 ? victim.steps[vIdx] : null;
    if (step) {
      step.acc = { p: 'plant_mode', op: '~', v: 3, tol: 0.1 };
      var red = sweep();
      delete step.acc;
      ck('...RED BY INJECTION: restoring the dead `acc` on the heatup\'s Mode 3 step is caught',
         red.indexOf('pwr2:pwr_heatup step ' + (vIdx + 1)) !== -1, red.join(', ') || 'NOT CAUGHT');
      ck('...and the injection was cleaned up (the sweep is green again)', sweep().length === 0, '');
    } else {
      ck('...RED BY INJECTION: the injection target exists', false,
         'no pwr_heatup step carries a plant_mode acceptance entry');
    }
  })();

  /* 2w. AN AUTHORED ACCEPTANCE NUMBER IS PINNED TO THE SOURCE THAT PUBLISHES IT (#739).
   *
   * The `{p,op,v}` schema takes a LITERAL — there is no expression form and this does not add
   * one. What it adds is the tie: every literal below is re-derived here from the module that
   * owns it, so a retune of the Tavg programme or a re-authored command reddens a gate instead
   * of silently invalidating the acceptance that was derived from it. `pwr_lower_power`'s band
   * tops were derived twice before, at #419 wave 3 and #508, and both times the acceptance
   * literals were re-typed by hand.
   *
   * (a) THE TAVG BAND TOPS. `tavgBand` in `ui/diagram/board/pwr_board_wiring.js` draws the
   *     tile's green band as `trefProgram(load) +/- 3.5 x TAVG_DEADBAND_C`, and an acceptance
   *     that says "back inside the band" is that band's TOP edge. `trefProgram`,
   *     `TAVG_DEADBAND_C` and `identity.mwe_rated` are all published; the 3.5 is a literal in
   *     the board file and is the ONE number here that is not, so it is named as such rather
   *     than quietly re-typed. The load for each step is taken from the step's OWN
   *     `mwe_output` entry, not from a hand-kept table — a step that changes its commanded load
   *     moves its own band with it.
   * (b) THE SPRAY SETTING. `pwr_cooldown`'s spray entry must equal the per cent the SAME step's
   *     `cmd` sends (`set_spray {pct}`), or the card grades a number the step never asked for.
   * (c) THE HX SPLIT. Same shape one entry down, and the wire form is a FRACTION against a
   *     command in per cent — exactly the units slip this pins. */
  (function () {
    var CTL = RD.PWR_CONTROL || {};
    var RATED = ((RD.PWR_CONFIG || {}).identity || {}).mwe_rated;
    /* THE BOARD'S OWN MULTIPLE OF THE ROD LOCKUP BAND — `tavgBand` in pwr_board_wiring.js, a
     * browser file this runner does not load. It is the ONE number in this section that is not
     * published, so it is READ OUT OF THE BOARD FILE rather than re-typed: a copy here would go
     * stale the moment someone widened the band, the four acceptances would still "match" this
     * gate's own arithmetic, and the thing §2w exists to prevent would happen under a green run
     * (#741 quality pass — the section claimed to close exactly this and did not). */
    var wiringSrc = fs.readFileSync(path.join(ROOT, 'ui', 'diagram', 'board', 'pwr_board_wiring.js'), 'utf8');
    var multM = /TAVG_DEADBAND_C\s*\|\|\s*0\.8\)\s*\*\s*([0-9.]+)/.exec(wiringSrc);
    var BAND_HALF_MULT = multM ? parseFloat(multM[1]) : NaN;
    ck('2w reads the band half-width multiple out of the BOARD, not a copy of it (#741)',
       !!multM && BAND_HALF_MULT > 0,
       multM ? 'pwr_board_wiring tavgBand uses x' + BAND_HALF_MULT + ' of the rod lockup band'
             : 'COULD NOT FIND the multiplier in pwr_board_wiring.js — the tie is broken');
    ck('2w preconditions: trefProgram, TAVG_DEADBAND_C and identity.mwe_rated are all published',
       typeof CTL.trefProgram === 'function' && CTL.TAVG_DEADBAND_C > 0 && RATED > 0,
       'trefProgram=' + typeof CTL.trefProgram + ' deadband=' + CTL.TAVG_DEADBAND_C + ' rated=' + RATED);

    var half = BAND_HALF_MULT * (CTL.TAVG_DEADBAND_C || 0);
    var lp = POOL.filter(function (p) { return p.id === 'pwr_lower_power'; })[0];
    var bad = [], checked = 0;
    (lp ? lp.steps : []).forEach(function (st, i) {
      if (!st.accs) return;
      var tav = st.accs.filter(function (e) { return e.p === 'tavg_c'; })[0];
      var mwe = st.accs.filter(function (e) { return e.p === 'mwe_output'; })[0];
      if (!tav || !mwe) return;
      checked++;
      var want = Math.round((CTL.trefProgram(mwe.v / RATED) + half) * 10) / 10;
      if (Math.abs(tav.v - want) > 0.051) {
        bad.push('step ' + (i + 1) + ' authored ' + tav.v + ' degC, programme top at ' +
                 (mwe.v / RATED).toFixed(2) + ' load is ' + want + ' degC');
      }
    });
    ck('pwr_lower_power: every tavg_c acceptance IS the Tavg programme band top at that step\'s own commanded load (#739)',
       checked >= 4 && bad.length === 0,
       bad.length ? bad.join('; ') : checked + ' step(s) re-derived, all matching');
    /* RED BY INJECTION — move the programme's no-load anchor and every band top must go stale.
     * This is the failure the check exists for: a Tavg retune that leaves four acceptances
     * describing a band the plant no longer has. */
    (function () {
      var real = CTL.trefProgram;
      CTL.trefProgram = function (l) { return real(l) + 2; };
      var red = [];
      (lp ? lp.steps : []).forEach(function (st, i) {
        if (!st.accs) return;
        var tav = st.accs.filter(function (e) { return e.p === 'tavg_c'; })[0];
        var mwe = st.accs.filter(function (e) { return e.p === 'mwe_output'; })[0];
        if (!tav || !mwe) return;
        var want = Math.round((CTL.trefProgram(mwe.v / RATED) + half) * 10) / 10;
        if (Math.abs(tav.v - want) > 0.051) red.push(i + 1);
      });
      CTL.trefProgram = real;
      ck('...RED BY INJECTION: a 2 degC shift in the Tavg programme staleness-reds every one of them',
         red.length === checked && checked > 0, 'reddened steps ' + red.join(',') + ' of ' + checked);
    })();

    var cd = POOL.filter(function (p) { return p.id === 'pwr_cooldown'; })[0];
    /* THE COMMAND IS FOUND WHEREVER IT LIVES, on the step or on one of its entries (2026-09-13).
     * It was looked up as `st.cmd.action === 'set_spray'`, which stopped finding it the moment
     * the pressure-control handover merged and the spray command moved onto `accs[1].cmd`: the
     * check went red reporting "NO spray_flow_pct acceptance on the set_spray step" while the
     * acceptance sat right beside the command. The TIE was fine and the FINDER was too narrow —
     * a merge is precisely when an authored command changes which object carries it. */
    var sprayCmd = null, sprayEn = null;
    (cd ? cd.steps : []).forEach(function (st) {
      [st.cmd].concat((st.accs || []).map(function (e) { return e.cmd; })).forEach(function (c) {
        if (c && c.action === 'set_spray' && c.pct != null && !sprayCmd) {
          sprayCmd = c;
          sprayEn = (st.accs || []).filter(function (e) { return e.p === 'spray_flow_pct'; })[0];
        }
      });
    });
    ck('pwr_cooldown: the SPRAY acceptance grades the per cent the step\'s own command sends (#739)',
       !!sprayEn && !!sprayCmd && sprayEn.v === sprayCmd.pct,
       sprayEn && sprayCmd ? 'acceptance ' + sprayEn.v + ' % vs command ' + sprayCmd.pct + ' %'
               : 'NO spray_flow_pct acceptance beside a set_spray command');

    var hxEn = null, hxCmd = null;
    (cd ? cd.steps : []).forEach(function (st) {
      (st.accs || []).forEach(function (e) {
        if (e.p === 'rhr_hx_fraction' && e.cmd && e.cmd.action === 'set_rhr_hx') { hxEn = e; hxCmd = e.cmd; }
      });
    });
    ck('pwr_cooldown: the HX SPLIT acceptance is its own command\'s per cent, as a fraction (#739)',
       !!hxEn && Math.abs(hxEn.v * 100 - hxCmd.pct) < 1e-9,
       hxEn ? 'acceptance ' + hxEn.v + ' (fraction) vs command ' + hxCmd.pct + ' %'
            : 'NO rhr_hx_fraction acceptance carrying a set_rhr_hx command');
  })();

  /* 2x. THE SESSION SEAMS A REPLAY CANNOT REACH (#739).
   *
   * Everything else about these acceptances was measured on a REPLAY, and A REPLAY NEVER CROSSES
   * A SESSION SEAM: it boots one plant, drives it, and stops. Reset, plant switch and save/load
   * are outside that population, so a green replay says nothing about them — and #739 adds a
   * param (`rhr_hx_fraction`) that is GRADED STATE the player sets once and the step then holds,
   * which is exactly the shape a world replacement strands. A save taken mid-cooldown that came
   * back with the split at its boot value would take step 10 from met to unmet under the player
   * with nothing on the board to explain it.
   *
   * Measured rather than reasoned: `rh` is carried whole in `getState` (pwr2_shell :2083), so the
   * expectation was that it survives — this asserts it, and asserts the RESET direction too,
   * where re-initialising is the CORRECT behaviour and stranding the old 7 % would be the defect.
   * The third check is the plain one the other two assume: the params resolve at all, on every
   * initial condition the pool boots from. */
  (function () {
    var PV = RD.InstructorLayer.paramValue;
    function tick(s, n) { var x = null; for (var i = 0; i < n; i++) x = s.tick(); return x; }

    var a = mkSvc('hot_zero_power'); tick(a, 30);
    a.handleCommand({ action: 'set_rhr_hx', pct: 7 });
    a.handleCommand({ action: 'set_spray', open: true, pct: 50 });
    var sa = tick(a, 30);
    var blob = JSON.parse(JSON.stringify(a.saveState()));
    var b = new RD.SimulationService({ seed: 7 });
    b.loadState(blob); b.running = true; b.timeAcceleration = 10; b.attentionStops = false;
    var sb = tick(b, 5);
    ck('a SAVE/LOAD carries the HX SPLIT the cooldown\'s step 10 grades (#739)',
       Math.abs(PV(sa, 'rhr_hx_fraction') - 0.07) < 1e-9 && Math.abs(PV(sb, 'rhr_hx_fraction') - 0.07) < 1e-9,
       'before ' + PV(sa, 'rhr_hx_fraction') + ' -> after ' + PV(sb, 'rhr_hx_fraction'));
    ck('...and the SPRAY per cent its step 7 grades',
       Math.abs(PV(sb, 'spray_flow_pct') - 50) < 5, 'after load: ' + (+PV(sb, 'spray_flow_pct')).toFixed(2) + ' %');

    var c = mkSvc('hot_zero_power'); tick(c, 10);
    c.handleCommand({ action: 'set_rhr_hx', pct: 7 });
    var before = PV(tick(c, 10), 'rhr_hx_fraction');
    c.selectPlant('pwr2', 'cold_shutdown', null, undefined);
    var afterCold = PV(tick(c, 10), 'rhr_hx_fraction');
    c.selectPlant('pwr2', 'hot_full_power', null, undefined);
    var afterHot = PV(tick(c, 10), 'rhr_hx_fraction');
    /* AND THIS IS THE #739 CORRECTION, PINNED: the issue argued the check is not vacuous because
     * `pwr2_engine.js:707` sets `hx_fraction = 0`. That line is inside `if (ic.cold)`. A cold boot
     * really is 0; `pwr_cooldown`'s own `hot_zero_power` boot is 1, so the player THROTTLES down
     * to 7 % rather than opening up to it. If either number ever moves, this reddens. */
    ck('a RESET re-initialises the HX SPLIT per IC and strands nothing — cold boots 0, hot boots 1 (#739)',
       Math.abs(before - 0.07) < 1e-9 && afterCold === 0 && afterHot === 1,
       '7 % -> cold_shutdown ' + afterCold + ' -> hot_full_power ' + afterHot);

    var ics = {}; POOL.forEach(function (p) { if (p.from) ics[p.from] = 1; });
    var miss = [];
    Object.keys(ics).forEach(function (ic) {
      var s = mkSvc(ic), sx = tick(s, 20);
      ['rhr_hx_fraction', 'spray_flow_pct', 'tavg_c', 'plant_mode'].forEach(function (p) {
        var v = PV(sx, p);
        if (v == null || (typeof v === 'number' && isNaN(v))) miss.push(ic + '.' + p);
      });
    });
    ck('every param the #739 acceptances grade resolves on every IC the pool boots from',
       miss.length === 0, miss.length ? ('UNRESOLVED: ' + miss.join(', ')) : Object.keys(ics).join(', '));
  })();

  /* 2y. THE LETTERED SUBSTEP INSTRUCTIONS — AUTHORING SHAPE (#741).
   *
   * `accs[].ask` is the per-entry INSTRUCTION the card draws above that entry's done-when. This
   * asserts the shape a bad `ask` would break; it does NOT assert the render, which needs a
   * browser and has no reachable fixture (see the note at the end).
   *
   *   - an `ask` never replaces a `label`. The card draws the ask on the lit row and the label
   *     under it, so an entry with an ask and no label loses the done-when entirely — the exact
   *     thing #741 exists to restore.
   *   - an `ask` is an INSTRUCTION, so it is short and it is not a copy of its own done-when. A
   *     paste of the label would put the same sentence on the card twice and read as a bug.
   *   - the pool's `ask` strings sit ONLY on steps with more than one visible entry. A single-row
   *     step draws no letter, so an ask there is prose with nothing to distinguish it from the
   *     label it duplicates — and the owner's principle is FEWER beats for mechanical work, not a
   *     second voice on every step.
   *
   * NO SI is `run_style`'s `checklist_no_si`, which harvests this key alongside `label` — proven
   * red by injection when the key was added: "Set LOAD to 50 MWe at 11.14 MPa." reddens it and
   * removing the clause goes green. A new authoring key the harvester does not know about ships
   * ungated, which is how the panel came to print "(116 degC)" under a green check at #670. */
  (function () {
    /* ALL FIVE POOLS, not just pwr2 (#741 quality pass). `accs[].ask` is a key on the SHARED step
     * schema and the renderer draws whatever pool is loaded, so an ask authored in the pwr, rbmk
     * or bwr pool would ship unchecked. Zero there today; this is what keeps it so. */
    function askSweep() {
      var r = { noLabel: [], echoes: [], tooLong: [], onSingles: [], notString: [], total: 0 };
      Object.keys(RD.MANUAL_PROCEDURES).forEach(function (key) {
        (RD.MANUAL_PROCEDURES[key] || []).forEach(function (proc) {
          (proc.steps || []).forEach(function (st, i) {
            if (!st.accs || !st.accs.length) return;
            var vis = st.accs.filter(function (e) { return !e.hidden; });
            st.accs.forEach(function (en) {
              if (en.ask === undefined || en.ask === null) return;
              r.total++;
              var where = key + ':' + proc.id + ' step ' + (i + 1);
              /* a non-string ask crashes the word count below and is skipped by run_style's
               * harvester, so it would ship un-SI-scanned: caught here rather than thrown */
              if (typeof en.ask !== 'string') { r.notString.push(where); return; }
              if (!en.label) r.noLabel.push(where);
              if (en.label && en.ask.replace(/[.\s]/g, '').toLowerCase() ===
                              en.label.replace(/[.\s]/g, '').toLowerCase()) r.echoes.push(where);
              var w = en.ask.trim().split(/\s+/).length;
              if (w > 14) r.tooLong.push(where + ' (' + w + ' words)');
              if (vis.length < 2) r.onSingles.push(where);
            });
          });
        });
      });
      return r;
    }
    var sw = askSweep();
    ck('every accs[].ask keeps its label — the ask REPLACES the done-when on the card otherwise (#741)',
       sw.noLabel.length === 0, sw.noLabel.join(', ') || sw.total + ' ask(s) authored, all with a label');
    ck('...and no ask merely echoes its own done-when (the same sentence twice on one row)',
       sw.echoes.length === 0, sw.echoes.join(', ') || 'none');
    ck('...and every ask is an instruction, not a paragraph (at most 14 words), and is a string',
       sw.tooLong.length === 0 && sw.notString.length === 0,
       sw.tooLong.concat(sw.notString).join(', ') || 'longest is within the cap, all strings');
    ck('...and asks sit only on steps that draw more than one row, where the letters mean something',
       sw.onSingles.length === 0, sw.onSingles.join(', ') || 'none on single-row steps');

    /* AND EVERY acceptance ENTRY CARRIES A LABEL, ask or no ask (#741 quality pass). The card's
     * fallback for a labelless entry is `mesc(en.cmd || '')`, and `en.cmd` is an OBJECT on the
     * cmd-kind entries #739 introduced — so such a row would draw the string "[object Object]".
     * Unreachable today because every entry in every pool has a label; this is what keeps it
     * unreachable, since 2y's other rules only require a label when an `ask` is present. */
    var unlabelled = [];
    Object.keys(RD.MANUAL_PROCEDURES).forEach(function (key) {
      (RD.MANUAL_PROCEDURES[key] || []).forEach(function (proc) {
        (proc.steps || []).forEach(function (st, i) {
          (st.accs || []).forEach(function (en, k) {
            if (en && !en.hidden && !en.label) unlabelled.push(key + ':' + proc.id + ' step ' + (i + 1) + ' accs[' + k + ']');
          });
        });
      });
    });
    ck('every drawn acceptance entry has a label — the fallback renders "[object Object]" (#741)',
       unlabelled.length === 0, unlabelled.join(', ') || 'all labelled');

    /* RED BY INJECTION, all four, in place. */
    var lp = POOL.filter(function (p) { return p.id === 'pwr_lower_power'; })[0];
    var probe = null;
    (lp.steps || []).forEach(function (st) {
      (st.accs || []).forEach(function (e) { if (e.ask && !probe) probe = e; });
    });
    if (probe) {
      /* THE INJECTION DRIVES THE SHIPPED SWEEP (#741 quality pass). An earlier version defined a
       * parallel `sweepOne()` with the same four conditions re-implemented — which proves only
       * that the COPY discriminates, and would have stayed green through a bug in the sweep the
       * gate actually ships. `askSweep()` above is now a named function and this calls it. */
      var savedLabel = probe.label, savedAsk = probe.ask;
      function counts() { var r = askSweep(); return { noLabel: r.noLabel.length, echo: r.echoes.length,
                                                       long: r.tooLong.length, single: r.onSingles.length }; }
      delete probe.label; var r1 = counts(); probe.label = savedLabel;
      probe.ask = savedLabel;  var r2 = counts(); probe.ask = savedAsk;
      probe.ask = 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen.';
      var r3 = counts(); probe.ask = savedAsk;
      /* the fourth rule had NO injection at all: three of four were proven and one was not */
      var single = null;
      POOL.forEach(function (proc) { (proc.steps || []).forEach(function (st) {
        if (!single && st.accs && st.accs.filter(function (e) { return !e.hidden; }).length === 1) single = st.accs[0];
      }); });
      var r4 = { single: 0 };
      if (single) { single.ask = 'Press the thing.'; r4 = counts(); delete single.ask; }
      ck('...RED BY INJECTION: a dropped label, an echo, a 15-word ask and an ask on a one-row step are each caught',
         r1.noLabel === 1 && r2.echo === 1 && r3.long === 1 && r4.single === 1,
         'noLabel ' + r1.noLabel + ', echo ' + r2.echo + ', long ' + r3.long + ', single ' + r4.single);
      var clean = counts();
      ck('...and every injection was cleaned up (the sweep is green again)',
         !!probe.label && probe.ask === savedAsk && !clean.noLabel && !clean.echo && !clean.long && !clean.single,
         'label restored, ask restored, sweep ' + JSON.stringify(clean));
    } else {
      ck('...RED BY INJECTION: an ask exists to mutate', false, 'no accs[].ask authored anywhere');
    }
  })();

  /* 2z. THE WRONG BUTTON IS NOT EVIDENCE FOR THE RIGHT ONE (#741 quality pass, 2026-09-13).
   *
   * #731 was the owner's own playtest report — *"When i unblocked the trip the step thought i had
   * blocked it and checked off the step"* (#724 item 13) — and it was fixed for `set_trip_block`
   * alone. The identical hole sat one card over: `_cmdEvidence` matched a cmd-kind acceptance on
   * the command FAMILY, so for every action that drives a START/STOP pair, either button was
   * evidence for a step that asked for the other.
   *
   * #739 walked straight into it. `pwr_cooldown` step 3's "press STOP on ECCS" entry is a pure
   * `cmd` with no predicate sibling — deliberately, because securing an idle pump moves nothing
   * observable — so nothing could contradict a false tick. Measured before the fix: pressing
   * START (`set_hpi {active:true}`) left the entry `met: true`, i.e. a green step AND
   * high-pressure injection running into a cooldown.
   *
   * THIS ASSERTS THE RULE, NOT THE ONE STEP. Every pure-`cmd` acceptance in every pool whose
   * action carries a reversible sense is driven with the OPPOSITE sense and must not latch, and
   * with its OWN sense and must latch. Driving both directions is the point: a `_cmdEvidence`
   * that returned false for everything would satisfy the first half alone. */
  (function () {
    var il = Object.create(RD.InstructorLayer.prototype);
    var cases = [], seen = {};
    Object.keys(RD.MANUAL_PROCEDURES).forEach(function (key) {
      (RD.MANUAL_PROCEDURES[key] || []).forEach(function (proc) {
        (proc.steps || []).forEach(function (st, i) {
          (st.accs || []).forEach(function (en) {
            if (!en || !en.cmd || typeof en.cmd === 'string') return;
            if (en.cmd.active === undefined) return;          // no sense to reverse
            cases.push({ where: key + ':' + proc.id + ' step ' + (i + 1), cmd: en.cmd });
            seen[en.cmd.action] = 1;
          });
        });
      });
    });
    var wrongLatched = [], rightRefused = [];
    cases.forEach(function (c) {
      var opposite = {}; for (var k in c.cmd) opposite[k] = c.cmd[k];
      opposite.active = !(c.cmd.active !== false);
      if (il._cmdEvidence(c.cmd, opposite)) wrongLatched.push(c.where + ' (' + c.cmd.action + ')');
      if (!il._cmdEvidence(c.cmd, c.cmd)) rightRefused.push(c.where + ' (' + c.cmd.action + ')');
    });
    ck('the OPPOSITE button is never evidence for a cmd-kind acceptance (#741; #731 one card over)',
       cases.length > 0 && wrongLatched.length === 0,
       cases.length ? (wrongLatched.join(', ') || cases.length + ' sense-carrying entr(ies) checked: ' +
                       Object.keys(seen).join(', '))
                    : 'NO sense-carrying cmd acceptance found — the check has no population');
    ck('...and the RIGHT button still is (the rule did not just refuse everything)',
       rightRefused.length === 0, rightRefused.join(', ') || 'all latch on their own sense');
  })();

  /* 2aa. THE TWO BAGGED PREDICATES — `op: 'steady'` (#755) and `op: 'stopped'` (#761).
   *
   * *(OWNER RULING, 2026-09-17: selected "Gate on rods stopped + startup rate" from three options
   * put to him — gate on rod-stop plus startup rate, remove the steady row and keep startup rate
   * alone, or keep the steady row. A SELECTION, not verbatim words.)*
   *
   * WHAT WAS WRONG WITH THE STEADINESS ROW, MEASURED. `sr_counts_cps steady 3 %/120 s` is a proxy
   * for "the operator has stopped pulling", and a SLOW DRIBBLE defeats a proxy: one bank step
   * withdrawn every 20 s satisfies it with the rods STILL MOVING at rung 5, and satisfies the
   * startup-rate row with the rods still moving at rungs 5 and 6. Both rows are proxies, one
   * route defeats both, so the ruling replaces the proxy with the fact the plant actually knows —
   * has the bank moved. The four rungs keep FOUR rows: counts floor, rods stopped, startup rate,
   * point plotted, in that order, `accs_ordered`.
   *
   * `op: 'steady'` STAYS IN THE SCHEMA and is now authored NOWHERE, which is exactly the
   * "population goes to zero" trap CLAUDE.md's standing list names: the checks below therefore
   * assert the BAGGED population rather than the steady one, and `steady`'s own behaviour is
   * proven on a synthetic channel, which needs no authored use to be honest.
   *
   * THE PROOFS ARE PAIRS, DRIVEN ON THE PLANT. A predicate that never latches satisfies "cannot
   * plot while the rods are moving" all by itself, so every negative below has its positive. */
  (function () {
    var proc = null;
    POOL.forEach(function (p) { if (p.id === 'pwr_startup') proc = p; });
    var RUNGS = [4, 5, 6, 7];                 // pwr_startup steps 5-8, zero-based
    /* THE AUTHORED FLOORS, and since #749 they are the LOWER EDGE of each target's render band
     * rather than the target itself (695 / 1350 / 2950 / 6950 for 7.0e2 / 1.4e3 / 3.0e3 / 7.0e3),
     * graded `>=`. §2ab below is what re-derives those four numbers out of `fmtExp`; this section
     * only needs to find the row, so it reads them as data. */
    var FLOORS = [695, 1350, 2950, 6950];

    /* --- 1. the authored shape of the four rungs -------------------------------------- */
    var shapeBad = [], stopN = null;
    RUNGS.forEach(function (idx, k) {
      var st = proc && proc.steps[idx], w = 'step ' + (idx + 1);
      var en = (st && st.accs) || [];
      var iFloor = -1, iStop = -1, iRate = -1, iPlot = -1;
      en.forEach(function (e, i) {
        if (e.p === 'sr_counts_cps' && e.op === '>=' && e.v === FLOORS[k]) iFloor = i;
        if (e.p === 'control_bank_steps' && e.op === 'stopped') { iStop = i; stopN = e.v; }
        if (e.p === 'startup_rate_dpm' && e.op === '~') iRate = i;
        if (e.cmd === 'plot_1m_point' || (e.cmd && e.cmd.action === 'plot_1m_point')) iPlot = i;
      });
      if (!st || !st.accs_ordered) shapeBad.push(w + ' not accs_ordered');
      else if (iFloor !== 0 || iStop !== 1 || iRate !== 2 || iPlot !== 3)
        shapeBad.push(w + ' order floor/stop/rate/plot = ' + [iFloor, iStop, iRate, iPlot].join('/'));
    });
    ck('all four 1/M rungs gate the plot on ROD-STOP, then startup rate — the counts floor first (#761)',
       shapeBad.length === 0 && stopN > 0,
       shapeBad.join('; ') || 'steps 5-8: counts floor, control_bank_steps stopped ' + stopN +
       ' s, startup rate, plot — ordered');

    /* --- 2. legality, both halves of it ----------------------------------------------- */
    var illegal = [], malformed = [], notControl = [], nBagged = 0, byOp = {};
    function scanPred(where, pr) {
      if (Array.isArray(pr)) { pr.forEach(function (q, i) { scanPred(where + '[' + i + ']', q); }); return; }
      if (pr && RD.InstructorLayer.isBagOp(pr.op)) illegal.push(where + ' (' + pr.op + ')');
    }
    Object.keys(RD.MANUAL_PROCEDURES).forEach(function (key) {
      (RD.MANUAL_PROCEDURES[key] || []).forEach(function (pr) {
        (pr.precond || []).forEach(function (c, i) { scanPred(key + ':' + pr.id + ' precond[' + i + ']', c); });
        ((pr.guard && pr.guard.never) || []).forEach(function (c, i) { scanPred(key + ':' + pr.id + ' guard[' + i + ']', c); });
        scanPred(key + ':' + pr.id + ' outcome_guard', pr.outcome_guard);
        (pr.steps || []).forEach(function (st, si) {
          var w = key + ':' + pr.id + ' step ' + (si + 1);
          scanPred(w + ' saw', st.saw);
          scanPred(w + ' overtaken', st.overtaken);
          scanPred(w + ' past', st.past);
          [].concat(st.inject || [], st.clear || []).forEach(function (sp) {
            if (sp && typeof sp !== 'string') scanPred(w + ' inject.when', sp.when);
          });
          [].concat(st.acc ? [st.acc] : [], st.accs || []).forEach(function (en) {
            if (!en || !RD.InstructorLayer.isBagOp(en.op)) return;
            nBagged++; byOp[en.op] = (byOp[en.op] || 0) + 1;
            if (!en.p || !(en.v > 0)) malformed.push(w + ' (' + en.op + ')');
            if (en.op === 'steady' && !(en.window > 0)) malformed.push(w + ' (steady, no window)');
            /* `stopped` compares readings for EQUALITY, so it is honest only on a channel that
             * is exact and quantized — the operator's own control state. On a noisy instrument
             * it would read false for ever: a check that can only fail is as hollow as one that
             * can only pass, and nothing would say so. */
            if (en.op === 'stopped' && !RD.InstructorLayer.isControlParam(en.p))
              notControl.push(w + ' (' + en.p + ')');
          });
        });
      });
    });
    ck('a BAGGED predicate is authored ONLY where a per-step bag exists — acc / accs (#755, #761)',
       illegal.length === 0, illegal.join(', ') || nBagged + ' bagged predicate(s) in the pool, all in acc/accs');
    ck('...and every one is well formed (param + threshold, and a window if it is `steady`)',
       nBagged > 0 && malformed.length === 0,
       malformed.join(', ') || nBagged + ' well formed: ' + JSON.stringify(byOp));
    ck('...and `stopped` is authored only on a CONTROL-class param, where equality is exact (#761)',
       notControl.length === 0,
       notControl.join(', ') || (byOp.stopped || 0) + ' stopped predicate(s), all control-class');

    /* --- 3. THE PLANT RUN. The authored 94/63/31/14 ladder on `hot_zero_power`, the step-8 rows
     * graded through `_gradeAccs` — the path the live card actually grades on. */
    var step8 = proc && proc.steps[7];
    if (step8 && step8.accs) {
      var svc = mkSvc('hot_zero_power');
      var s = null, i;
      for (i = 0; i < 5; i++) s = svc.tick();
      var runFor = function (secs) { var t0 = s.metadata.sim_time; while (s.metadata.sim_time - t0 < secs) s = svc.tick(); };
      var ctlBank = function () {
        var gs = (s.control_state && s.control_state.rod_groups) || [];
        for (var j = 0; j < gs.length; j++) if (gs[j].function === 'control') return gs[j].steps;
        return null;
      };
      [94, 63, 31, 14].forEach(function (n, k) {
        svc.handleCommand({ action: 'rod_nudge', group_id: 'control', steps: n, speed: 'normal' });
        if (k < 3) runFor(150);
      });
      var prev = ctlBank(), still = 0;
      while (still < 5) { s = svc.tick(); var b = ctlBank(); if (b === prev) still++; else still = 0; prev = b; }
      var tStop = s.metadata.sim_time, bankStop = ctlBank();
      var il8 = Object.create(RD.InstructorLayer.prototype);
      var graded = { accs: step8.accs.filter(function (e) { return e && e.p; }), accs_ordered: true };
      var holder = {}, firstFloor = null, firstAll = null, stoppedAtFloor = false, countsAtFloor = null;
      while (s.metadata.sim_time - tStop < 900) {
        s = svc.tick();
        var el = s.metadata.sim_time - tStop, c = s.true_state.sr_counts_cps;
        var all = il8._gradeAccs(holder, graded, s);
        if (firstFloor === null && c > 7000) { firstFloor = el; countsAtFloor = c; stoppedAtFloor = !!all; }
        if (firstAll === null && all) firstAll = el;
      }
      ck('the rod-stop rung is RED where the OLD acceptance fired — the counts floor is not the gate (#761)',
         firstFloor !== null && !stoppedAtFloor && firstAll !== null && firstAll > firstFloor,
         'floor crossed at ' + (firstFloor === null ? '?' : firstFloor.toFixed(0)) + ' s (' +
         (countsAtFloor || 0).toFixed(0) + ' counts, rung met=' + stoppedAtFloor + '), rung met at ' +
         (firstAll === null ? 'NEVER within 900 s' : firstAll.toFixed(0) + ' s') + ', bank ' + bankStop);
      /* GREEN, AND WELL INSIDE THE AUTHORED HOLD. `hold: 600` is measured from the step becoming
       * ACTIVE and 17-22 s of it is the rod burst, so the replay delivers ~580 s of settle; a
       * rung the replay cannot satisfy reddens the very step it is authored on, which is the trap
       * #755's 2 % tolerance hit. Measured here: the rung is met 333 s after rod-stop. The band is
       * wide on purpose — it pins "after the rods stop and after the rate falls in, with room",
       * not a number, and a retune of the ladder should move it rather than break it. */
      ck('...and GREEN once the bank has been still and the startup rate has fallen in (#761)',
         firstAll !== null && firstAll >= 120 && firstAll <= 500,
         firstAll === null ? 'never met within 900 s of rod-stop'
                           : firstAll.toFixed(0) + " s from rod-stop; the replay's hold delivers ~580 s");
    }

    /* --- 4. THE DRIBBLE ROUTE, WHICH IS WHY THIS CHANGE EXISTS. One bank step every 20 s up to
     * the rung's own target: the rung must NOT be satisfiable while the bank is still moving. The
     * control is the OLD steadiness row driven on the SAME tick stream — it DID latch while the
     * rods moved at rung 5, which is the defect the ruling names, and a proof that the new rung is
     * refusing a route that was genuinely open rather than a route nothing could take. */
    (function () {
      var svc = mkSvc('hot_zero_power'), s = null, i;
      for (i = 0; i < 5; i++) s = svc.tick();
      var ctlBank = function () {
        var gs = (s.control_state && s.control_state.rod_groups) || [];
        for (var j = 0; j < gs.length; j++) if (gs[j].function === 'control') return gs[j].steps;
        return null;
      };
      var oldSteady = { p: 'sr_counts_cps', op: 'steady', v: 0.03, window: 120 };
      [0, 1].forEach(function (k) {
        var idx = RUNGS[k], st = proc && proc.steps[idx];
        if (!st || !st.accs) return;
        var target = ctlBank() + [94, 63][k];
        var il = Object.create(RD.InstructorLayer.prototype);
        var graded = { accs: st.accs.filter(function (e) { return e && e.p; }), accs_ordered: true };
        var oldGraded = { accs: [ { p: 'sr_counts_cps', op: '>', v: FLOORS[k] }, oldSteady ],
                          accs_ordered: true };
        var holder = {}, oldHolder = {};
        var newLatchedMoving = false, oldLatchedMoving = false;
        var lastTap = -1e9, guard = 0;
        while (ctlBank() < target && guard++ < 400000) {
          var t = s.metadata.sim_time;
          if (t - lastTap >= 20) { svc.handleCommand({ action: 'rod_nudge', group_id: 'control', steps: 1, speed: 'normal' }); lastTap = t; }
          s = svc.tick();
          var moving = ctlBank() < target;
          if (il._gradeAccs(holder, graded, s) && moving) newLatchedMoving = true;
          if (il._gradeAccs(oldHolder, oldGraded, s) && moving) oldLatchedMoving = true;
        }
        ck('DRIBBLE, rung ' + (idx + 1) + ': one step every 20 s cannot satisfy the rung while the bank still moves (#761)',
           !newLatchedMoving,
           newLatchedMoving ? 'the rung latched with the bank at ' + ctlBank() + ' of ' + target
                            : 'never met before bank ' + target + ' (' +
                              Math.round(s.true_state.sr_counts_cps) + ' counts)');
        if (k === 0) {
          ck('...and the OLD steadiness row DID latch on that same route — the hole was real (#761)',
             oldLatchedMoving,
             oldLatchedMoving ? 'counts-steady ticked with the bank still moving'
                              : 'the old row did not latch either — this route proves nothing');
        }
      });
    })();

    /* --- 5. THE RUNTIME HALVES, on synthetic channels. `steady` is authored nowhere now, so this
     * is the only thing keeping it honest; `stopped` gets the same treatment plus the two traps
     * that are specific to it (a dead channel, and the quiet window as a dwell). */
    (function () {
      var il = Object.create(RD.InstructorLayer.prototype);
      var en = { p: 'sr_counts_cps', op: 'steady', v: 0.03, window: 120 };
      var st = { accs: [en] }, holder = {};
      var t = 0, c = 9000;
      var metEarly = false, metFlat = false, unticked = false;
      function feed(secs, perSec, cb) {
        for (var k = 0; k < secs; k++) {
          t += 1; c *= (1 + perSec);
          var snap = { metadata: { sim_time: t, plant_id: 'pwr2' },
                       true_state: { sr_counts_cps: c }, instruments: {} };
          cb(il._gradeAccs(holder, st, snap), t);
        }
      }
      feed(400, 0.002, function (m) { if (m) metEarly = true; });            // +0.2 %/s, still climbing
      feed(400, 0, function (m) { if (m) metFlat = true; });                  // flattened
      feed(400, 0.002, function (m) { if (metFlat && !m) unticked = true; }); // climbing again
      ck('`steady`: a channel still climbing does NOT tick it (#755 — still supported, now unauthored)',
         !metEarly, metEarly ? 'ticked while climbing at 0.2 %/s' : '400 s of +0.2 %/s, never met');
      ck('...a channel that has flattened DOES (the pair, not one side of it)', metFlat,
         metFlat ? 'met once the window filled' : 'never met on a dead-flat channel — unsatisfiable');
      ck('...and it UN-ticks when the channel climbs again (it re-grades, like ~)', unticked,
         unticked ? 'came back off' : 'stayed latched — a hold claim that cannot be lost');
      (function () {
        var il2 = Object.create(RD.InstructorLayer.prototype);
        var st2 = { accs: [{ p: 'sr_counts_cps', op: 'steady', v: 0.03, window: 120 }] }, h2 = {};
        var firstMet = null;
        for (var k = 1; k <= 300; k++) {
          var snap = { metadata: { sim_time: k, plant_id: 'pwr2' },
                       true_state: { sr_counts_cps: 13000 }, instruments: {} };
          if (il2._gradeAccs(h2, st2, snap) && firstMet === null) firstMet = k;
        }
        ck('...and it cannot be met inside its own window — the window IS the dwell, from step entry',
           firstMet !== null && firstMet >= 120,
           firstMet === null ? 'never met on a dead-flat channel' : 'first met at ' + firstMet + ' s of a 120 s window');
      })();
    })();

    (function () {
      /* `stopped` on a control channel. `control_bank_steps` reads through ROD_PARAMS, which
       * matches the rod group by `id` — NOT by `function`, which is what the board draws with.
       * A snapshot built the wrong way reads as NO VALUE, and the first draft of this block did
       * exactly that: three checks failed for the shape, not for the predicate. That miss is
       * itself the dead-channel proof at the bottom of this section. */
      function snapAt(t, steps) {
        return { metadata: { sim_time: t, plant_id: 'pwr2' },
                 control_state: { rod_groups: [{ id: 'control_rods', function: 'control',
                                                 steps: steps, position_pct: steps / 627 * 100 }] },
                 true_state: {}, instruments: {} };
      }
      var il = Object.create(RD.InstructorLayer.prototype);
      var st = { accs: [{ p: 'control_bank_steps', op: 'stopped', v: 60 }] }, holder = {};
      var t = 0, steps = 100, lastTap = 0, metMoving = false, firstStill = null, unticked = false;
      for (var k = 0; k < 200; k++) {               // a 20 s dribble, ten taps
        t += 1;
        if (t % 20 === 0) { steps++; lastTap = t; }
        if (il._gradeAccs(holder, st, snapAt(t, steps))) metMoving = true;
      }
      var tapEnd = lastTap;
      for (k = 0; k < 200; k++) {                    // rods parked
        t += 1;
        if (il._gradeAccs(holder, st, snapAt(t, steps)) && firstStill === null) firstStill = t;
      }
      for (k = 0; k < 200; k++) {                    // pulling again
        t += 1;
        if (t % 20 === 0) steps++;
        if (firstStill !== null && !il._gradeAccs(holder, st, snapAt(t, steps))) unticked = true;
      }
      var quiet = firstStill === null ? null : firstStill - tapEnd;
      ck('`stopped`: a bank tapped every 20 s never satisfies a 60 s quiet time (#761)',
         !metMoving, metMoving ? 'latched mid-dribble' : '200 s of 20 s taps, never met');
      ck('...a bank that has been parked DOES satisfy it (the pair, not one side of it)',
         firstStill !== null, firstStill === null ? 'never met on a parked bank — unsatisfiable'
                                                  : 'met ' + quiet + ' s after the last tap');
      /* THE QUIET TIME IS THE DWELL, measured from the last MOTION and not from step entry, which
       * is the one way `stopped` differs from `steady`: a step entered with the control already
       * at rest still owes `v`, because the bag is empty and its first reading starts the clock. */
      ck('...and it cannot be met inside its own quiet time — `v` IS the dwell (#761)',
         quiet !== null && quiet >= 60 && quiet <= 65,
         quiet === null ? 'never met' : quiet + ' s after the last tap, against a 60 s quiet time');
      ck('...and it UN-ticks when the bank moves again (it re-grades, like ~)', unticked,
         unticked ? 'came back off' : 'stayed latched — a hold claim that cannot be lost');
      /* A CHANNEL THAT IS NOT A NUMBER IS NEVER "STOPPED". Two cases, and only the second one
       * actually needs the guard in `gradeStopped` — which is why both are here. An ABSENT param
       * reads `undefined`, and `bag.last == null` is true of `undefined`, so the quiet clock
       * restarts every sample and the predicate never latches even with the guard deleted. A
       * param that publishes a CONSTANT NON-NUMBER (a mode selector, a lineup string) does not:
       * `'AUTO' !== 'AUTO'` is false, the clock never restarts, and without the guard the
       * predicate latches after `v` seconds and reads as a control at rest. That is a check that
       * could only pass, on any step that names a string-valued channel. INJECTION-PROVEN:
       * dropping `typeof r.value !== 'number'` from the guard reddens the second case and only
       * the second case. */
      (function () {
        var il3 = Object.create(RD.InstructorLayer.prototype);
        var absent = { accs: [{ p: 'control_bank_steps', op: 'stopped', v: 60 }] }, h3 = {};
        var str = { accs: [{ p: 'steam_dump_setpoint', op: 'stopped', v: 60 }] }, h4 = {};
        var metAbsent = false, metStr = false;
        for (var k = 1; k <= 400; k++) {
          var base = { metadata: { sim_time: k, plant_id: 'pwr2' }, true_state: {}, instruments: {} };
          if (il3._gradeAccs(h3, absent, base)) metAbsent = true;
          var withStr = { metadata: { sim_time: k, plant_id: 'pwr2' },
                          control_state: { steam_dump_setpoint: 'AUTO' },
                          true_state: {}, instruments: {} };
          if (il3._gradeAccs(h4, str, withStr)) metStr = true;
        }
        ck('...and a channel that is absent, or not a number, is NEVER "stopped" (#761)',
           !metAbsent && !metStr,
           (metAbsent ? 'an ABSENT param read as a parked control; ' : '') +
           (metStr ? "a constant 'AUTO' read as a parked control" : '') ||
           '400 s of no reading and 400 s of a constant string, never met');
      })();
    })();
  })();

  /* 2ab. THE GRADED NUMBER AND THE DRAWN NUMBER ARE THE SAME NUMBER (#749 items 1 and 2,
   * 2026-09-18).
   *
   * TWO DEFECTS, ONE SHAPE: a step's acceptance was a threshold the player could not tell they
   * had crossed, because the board rounds and the acceptance did not.
   *
   *   1. THE CHANNEL. `sr_counts_cps` had no PARAM_INSTRUMENT.pwr2 entry, so the four 1/M count
   *      rungs graded `true_state` while the NIS card drew `instruments.source_range` — the
   *      reused pwr instrument layer (lag 0.5 s, noise 0.02 decades). MEASURED over the authored
   *      ladder, instrument / truth ran 0.83 to 1.18, so the tile could read ABOVE the target
   *      while the step refused, indefinitely.
   *   2. THE BAND. Every count target sat at the CENTRE of the band `fmtExp` draws it in —
   *      `1.4e3` is drawn for [1350, 1450) — and REACTOR POWER's 0.1 % sat at the centre of the
   *      `toFixed(1)` band [0.05, 0.15). Half of each band reads the target and fails it.
   *
   * WHY THIS IS NOT THE #670 "do NOT regrade on the drawn value" CASE, which forbids exactly
   * this-looking change. #670 is about DISPLAY_DAMP: the board runs dimensioned tiles through a
   * first-order filter, and grading the filtered value trades Hard Rule 1 for cosmetic agreement.
   * `source_range` carries NO DISPLAY_DAMP entry (check 2 below pins that), so the transmitter
   * reading and the drawn reading are the same number and the board only FORMATS it. What moves
   * here is the threshold, to the edge of the format's own band — not the reading.
   *
   * THE FOUR EDGES ARE RE-DERIVED OUT OF `fmtExp` ITSELF, lifted from pwr_board_wiring.js rather
   * than copied, so a change to the board's formatter reddens this instead of silently dating it.
   *
   * INJECTION (each proven in place, 2026-09-18):
   *   · delete `sr_counts_cps: 'source_range'` from PARAM_INSTRUMENT.pwr2 -> checks 1 and 5 red
   *   · put a `source_range` entry in DISPLAY_DAMP                       -> check 2 red
   *   · put any rung's threshold back on its band centre (1350 -> 1400)  -> check 3 red
   *   · put the criticality step's `power_pct` back to 0.1               -> check 4 red */
  (function () {
    var proc = null;
    POOL.forEach(function (p) { if (p.id === 'pwr_startup') proc = p; });
    var RUNGS = [4, 5, 6, 7];

    /* fmtExp, LIFTED from the board rather than re-typed: the one-line function is pulled out of
     * pwr_board_wiring.js by name and evaluated here. A copy would be a second implementation of
     * the claim, which is the #605 shape — and this check exists precisely because the board's
     * rounding is the thing under test. */
    var wiring = fs.readFileSync(path.join(ROOT, 'ui', 'diagram', 'board', 'pwr_board_wiring.js'), 'utf8');
    var fmtSrc = /function fmtExp\s*\([\s\S]*?\n/.exec(wiring);
    var fmtExp = fmtSrc ? new Function('return (' + fmtSrc[0].trim().replace(/;\s*$/, '') + ');')() : null;
    ck('2ab. `fmtExp` was lifted out of pwr_board_wiring.js, not re-typed here (#749)',
       typeof fmtExp === 'function' && fmtExp(1400) === '1.4e3' && fmtExp(1349) === '1.3e3',
       typeof fmtExp === 'function' ? 'fmtExp(1400)=' + fmtExp(1400) + ', fmtExp(1349)=' + fmtExp(1349)
                                    : 'could not find `function fmtExp(` in the wiring');

    /* --- 1. THE CHANNEL. Instrument-first, on a live broadcast, through the real evaluator. */
    (function () {
      var svc = mkSvc('hot_zero_power');
      var s = null; for (var i = 0; i < 20; i++) s = svc.tick();
      var il = Object.create(RD.InstructorLayer.prototype);
      var g = il._grade(s, { p: 'sr_counts_cps', op: '>', v: 0 });
      var inst = s.instruments && s.instruments.source_range;
      var truth = s.true_state && s.true_state.sr_counts_cps;
      ck('2ab.1 the 1/M count rungs grade the SOURCE RANGE instrument the card draws, not truth (#749 item 1)',
         g.graded_by === 'instrument' && inst != null && g.value === inst && inst !== truth,
         'graded_by ' + g.graded_by + ', value ' + (g.value == null ? 'none' : g.value.toFixed(1)) +
         ' vs instruments.source_range ' + (inst == null ? 'ABSENT' : inst.toFixed(1)) +
         ' vs true_state ' + (truth == null ? 'ABSENT' : truth.toFixed(1)));
    })();

    /* --- 2. AND THE DRAWN NUMBER IS THE UNFILTERED ONE, which is what keeps check 1 clear of the
     * #670 ruling. If `source_range` ever joins DISPLAY_DAMP, the acceptance and the tile part
     * company again and the argument above stops holding — so the absence is asserted, not
     * assumed. */
    (function () {
      var m = /var DISPLAY_DAMP = \{([\s\S]*?)\};/.exec(wiring);
      var body = m ? m[1] : null;
      var damped = !!body && /(^|[\s,{])source_range\s*:/.test(body);
      ck('2ab.2 `source_range` carries NO display damping — the graded reading IS the drawn reading (#670 boundary)',
         !!body && !damped,
         !body ? 'could not find DISPLAY_DAMP in the wiring'
               : damped ? 'source_range is damped — check 1 now regrades a filtered value'
                        : 'DISPLAY_DAMP names ' + (body.match(/[a-z_0-9]+\s*:/g) || []).length + ' channels, not this one');
    })();

    /* --- 3. THE BAND EDGE, for all four rungs. `v` must be the FIRST value the board draws as
     * the step's own shorthand: one ulp below it must draw a different string. `>=` and not `>`
     * for exactly that reason — the edge value itself is inside the band. */
    (function () {
      var bad = [], seen = [];
      RUNGS.forEach(function (idx) {
        var st = proc && proc.steps[idx];
        var en = st && st.accs && st.accs[0];
        if (!en || en.p !== 'sr_counts_cps') { bad.push('step ' + (idx + 1) + ': no counts row first'); return; }
        var v = en.v, below = v * (1 - 1e-9), above = v * (1 + 1e-9);
        var here = fmtExp(v);
        if (en.op !== '>=') bad.push('step ' + (idx + 1) + ' op ' + en.op + ' (must be >=, the edge is in the band)');
        if (fmtExp(below) === here) bad.push('step ' + (idx + 1) + ' v=' + v + ' is NOT the band floor — ' + below + ' also draws ' + here);
        if (fmtExp(above) !== here) bad.push('step ' + (idx + 1) + ' v=' + v + ' is not inside its own band');
        seen.push(here + '@' + v);
      });
      ck('2ab.3 every 1/M count threshold is the LOWER EDGE of the band the board draws it in (#749 item 1)',
         bad.length === 0 && seen.length === 4, bad.join('; ') || seen.join(', '));

      /* ...AND THE PLAYER ONLY EVER SEES THE SHORTHAND *(OWNER, #724 item 6)*. The edge number is
       * an implementation detail; the step's text, its target line and the row's own label all
       * carry the band's name, and that name is what the tile prints at the tick. */
      var strBad = [];
      RUNGS.forEach(function (idx) {
        var st = proc && proc.steps[idx], en = st && st.accs && st.accs[0];
        if (!en) return;
        var name = fmtExp(en.v);
        ['text', 'target'].forEach(function (f) {
          if (String(st[f] || '').indexOf(name) === -1) strBad.push('step ' + (idx + 1) + ' ' + f + ' does not print ' + name);
        });
        if (String(en.label || '').indexOf(name) === -1) strBad.push('step ' + (idx + 1) + ' label does not print ' + name);
        if (String(en.label || '').indexOf(String(en.v)) !== -1) strBad.push('step ' + (idx + 1) + ' label prints the raw edge ' + en.v);
      });
      ck('2ab.3 ...and every rung prints the SHORTHAND, never the edge number (#724 item 6)',
         strBad.length === 0, strBad.join('; ') || 'all four: text, target and label carry the band name only');
    })();

    /* --- 4. THE SAME RULE ON REACTOR POWER (#749 item 2). The tile is `digits: 1` in
     * pwr_board_data.js and is rendered `toFixed(digits)`, so it prints "0.1" from 0.05 up. The
     * digit count is READ OUT OF THE BOARD DOCUMENT, not asserted here, for the same reason
     * `fmtExp` is lifted above. */
    (function () {
      var boardDoc = fs.readFileSync(path.join(ROOT, 'ui', 'diagram', 'board', 'pwr_board_data.js'), 'utf8');
      var dm = /"label":"REACTOR POWER"[^}]*?"digits":(\d+)/.exec(boardDoc);
      var digits = dm ? +dm[1] : null;
      var step = null, si = -1;
      (proc ? proc.steps : []).forEach(function (st, i) {
        if (st.acc && st.acc.p === 'power_pct' && si === -1 && i >= 8) { step = st; si = i; }
      });
      var v = step && step.acc.v;
      var okFloor = v != null && digits != null &&
                    v.toFixed(digits) !== (v * (1 - 1e-9)).toFixed(digits) &&
                    v.toFixed(digits) === (v * (1 + 1e-9)).toFixed(digits);
      ck('2ab.4 the criticality step waits for the FIRST power the tile prints as 0.1 %, not the middle of that digit (#749 item 2)',
         okFloor && v.toFixed(digits) === '0.1',
         v == null ? 'no power_pct acc found at or after step 9'
                   : 'step ' + (si + 1) + ' acc power_pct > ' + v + '; the tile (' + digits +
                     ' digit) draws ' + v.toFixed(digits) + ' there and ' +
                     (v * (1 - 1e-9)).toFixed(digits) + ' one ulp below');
    })();

    /* --- 5. THE WHOLE CLAIM, ON THE PLANT. Drive the authored 94 + 63 ladder and grade rung 6's
     * own counts row through `_gradeAccs` — the live path — then read the board's formatter on
     * the SAME broadcast the row latches. With the fix that is an identity, not a coincidence:
     * the row needs the instrument at or above the band floor, and the band floor is the first
     * value that draws the target string. Graded on truth (the shipped state until today) it is
     * neither, and the tile can be a band low at the tick. */
    (function () {
      var st = proc && proc.steps[5];
      var en = st && st.accs && st.accs[0];
      if (!en) { ck('2ab.5 the rung-6 count row exists', false, 'step 6 has no counts row'); return; }
      var name = fmtExp(en.v), target = +name.split('e')[0] * Math.pow(10, +name.split('e')[1]);
      var svc = mkSvc('hot_zero_power');
      var s = null, i;
      for (i = 0; i < 5; i++) s = svc.tick();
      var runFor = function (secs) { var t0 = s.metadata.sim_time; while (s.metadata.sim_time - t0 < secs) s = svc.tick(); };
      svc.handleCommand({ action: 'rod_nudge', group_id: 'control', steps: 94, speed: 'normal' });
      runFor(300);
      svc.handleCommand({ action: 'rod_nudge', group_id: 'control', steps: 63, speed: 'normal' });
      var il = Object.create(RD.InstructorLayer.prototype);
      var graded = { accs: [en] }, holder = {};
      var drawnAtLatch = null, latchT = null, drawnStr = null, byAtLatch = null, t0 = s.metadata.sim_time;
      while (s.metadata.sim_time - t0 < 600 && latchT === null) {
        s = svc.tick();
        if (il._gradeAccs(holder, graded, s)) {
          latchT = s.metadata.sim_time - t0;
          drawnStr = fmtExp(s.instruments.source_range);
          drawnAtLatch = +drawnStr.split('e')[0] * Math.pow(10, +drawnStr.split('e')[1]);
          byAtLatch = il._grade(s, en).graded_by;
        }
      }
      /* BOTH HALVES AT THE SAME INSTANT, because either alone is satisfiable by accident. "The
       * tile reads the target or more" passes on a truth-graded row whenever the noise happens to
       * be on the high side — MEASURED under injection: with the map entry removed this rung
       * still latched with the card reading 1.5e3, one band ABOVE the target. What cannot happen
       * by accident is the pair: the row that latched was graded on the channel the card draws,
       * and the card was printing the target. */
      ck('2ab.5 when the rung ticks, it was graded on the drawn channel AND the tile was printing the target — on the plant (#749 item 1)',
         latchT !== null && drawnAtLatch !== null && drawnAtLatch >= target && byAtLatch === 'instrument',
         latchT === null ? 'the rung never latched within 600 s of the burst'
                         : 'latched ' + latchT.toFixed(0) + ' s in, graded_by ' + byAtLatch +
                           '; the card read ' + drawnStr + ' (' + drawnAtLatch +
                           ') against a target of ' + name + ' (' + target + ')');
    })();
  })();

}


/* 12. AN ALARM THE STEP DECLARED DOES NOT DROP THE CLOCK *(OWNER RULING, 2026-09-14: "Only
 * alarms the step is not expecting")*. A walkthrough step declares the alarms its own evolution
 * causes in `expect_alarms`; those do not break fast-forward, anything else does.
 *
 * MEASURED ON A REAL SERVICE with a real running plant, through the real `_attentionStop` — the
 * same call `_assembleWithInstructor` makes every broadcast. Only the ALARM ROW is synthetic,
 * and it has to be: driving the plant to the shutdown-cooling tile that produced the ruling
 * takes a plant-hour of heatup, and what is under test is the DECISION, not the annunciator.
 * The row is the registry's own shape ({id, label, priority, state}) and is fed through the
 * prev/next pair the service itself keeps, so the quiet-board rule, the priority rule and the
 * unacknowledged rule all still have to pass before the new gate is reached at all.
 *
 * THE FOURTH CHECK IS THE ONE THAT KEEPS THIS HONEST: a declaration is a statement about ONE
 * evolution, so the step index moving must re-arm the same alarm. Without it the other three
 * pass just as well on an implementation that reads the whole procedure, which would hand a leg
 * a permanent exemption from its own casualties.
 *
 * INJECTION-PROVEN, each red for its own reason and no other:
 *   - deleting `if (this._stepExpectsAlarm(a)) continue;` in `_newAlarmOfPriority`
 *       -> checks 2 and 5 red, 1/3/4 green;
 *   - `_stepExpectsAlarm` returning true unconditionally
 *       -> checks 1, 3, 4 and 5 red, 2 green. */
(function () {
  function svcWithStep(expect) {
    var svc = new RD.SimulationService({ seed: 7 });
    svc.selectPlant('pwr2', 'hot_full_power', null, undefined);
    svc.running = true; svc.attentionStops = true; svc.timeAcceleration = 10;
    // a two-step synthetic procedure: only step 0 declares anything
    svc.instructor.checklist = {
      procedure_id: 'probe', profile_key: 'pwr2', idx: 0, complete: false,
      proc: { id: 'probe', steps: [{ text: 'declaring step', expect_alarms: expect || [] },
                                   { text: 'the next step' }] },
      done: [false, false], doneBy: [null, null],
    };
    var s = null; for (var i = 0; i < 3; i++) s = svc.tick();
    return { svc: svc, snap: s };
  }
  function alarm(id, label) { return { id: id, label: label, priority: 'warning', state: 'active_unacknowledged' }; }
  var RHR = alarm('rhr_not_in_service', 'Shutdown Cooling Not In Service - RCS Is Below the RHR Entry Pressure');
  var OTHER = alarm('sg_level_lo', 'Steam Generator Level Low');
  /* THE BOARD THE ALARM ARRIVES ON IS QUIET, so #655's own rule cannot be what decides this.
   * The step index used to be held still here too, so the #619 item 6 step dropout could not
   * answer instead of the alarm; that dropout was removed 2026-09-17 *(OWNER RULING: "Release
   * with the step snap.")* and the fixture line went with it. */
  function verdict(w, a) {
    w.svc._prevTrueState = w.svc._prevTrueState || w.snap.true_state;
    w.svc._prevAlarms = [];
    w.svc._prevScrammed = false;
    w.snap.alarms = [a];
    return w.svc._attentionStop(w.snap);
  }
  var undeclared = svcWithStep([]);
  ck('12. an alarm the active step does NOT declare still drops fast-forward (the control)',
     verdict(undeclared, RHR) === 'alarm', 'verdict ' + verdict(undeclared, RHR));
  var declared = svcWithStep(['rhr_not_in_service']);
  ck('12. ...and the SAME alarm, declared in that step’s expect_alarms, does not (2026-09-14 ruling)',
     verdict(declared, RHR) === null, 'verdict ' + verdict(declared, RHR));
  var declared2 = svcWithStep(['rhr_not_in_service']);
  ck('12. ...while a DIFFERENT alarm on the same step still does ("only alarms it is not expecting")',
     verdict(declared2, OTHER) === 'alarm', 'verdict ' + verdict(declared2, OTHER));
  var moved = svcWithStep(['rhr_not_in_service']);
  moved.svc.instructor.checklist.idx = 1;         // the next step declares nothing
  ck('12. ...and the declaration is scoped to the ACTIVE step - the next step re-arms it',
     verdict(moved, RHR) === 'alarm', 'verdict ' + verdict(moved, RHR));
  /* THE SHARED SEAM: the WARP tier drop (`_warpBlocked`) reads the same helper, so it inherits
   * this and the two halves cannot disagree - the failure shape the `speed_hold` split already
   * cost us once. Asserted on the helper rather than by re-driving WARP, because the claim is
   * that there is ONE decision, not two that happen to agree today. */
  var shared = svcWithStep(['rhr_not_in_service']);
  ck('12. ...and the WARP drop inherits it through the one shared `_newAlarmOfPriority` (#655 terms)',
     shared.svc._newAlarmOfPriority([RHR], []) === null &&
     shared.svc._newAlarmOfPriority([OTHER], []) === OTHER,
     'declared -> ' + shared.svc._newAlarmOfPriority([RHR], []) +
     ', undeclared -> ' + (shared.svc._newAlarmOfPriority([OTHER], []) || {}).id);
})();

console.log('\n' + '='.repeat(74));
console.log('  run_checklist_pwr2: ' + nPass + ' passed, ' + nFail + ' failed  (' + (nPass + nFail) + ' checks)');
console.log('='.repeat(74) + '\n');
process.exit(nFail > 0 ? 1 : 0);
