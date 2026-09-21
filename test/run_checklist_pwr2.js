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

/* WHICH LEGS TRIP AS PART OF THEIR OWN AUTHORED ROUTE (#709) — harvested from the replay
 * that is already running above, so §2ai's rediscovery costs nothing. The replay drives the
 * leg's authored commands and nothing else, so a trip standing at the end of one is the leg's
 * own doing. `rps_state.scrammed` is the protection system's LATCH, so this cannot miss a trip
 * the way an end-state power reading could. */
var REPLAY_TRIP = {};
POOL.forEach(function (proc) {
  if (only && proc.id !== only) return;
  console.log(D + '\n  — ' + proc.id + ' (' + proc.manual_ref + ', from ' + proc.from + ') —' + X);
  var res = RD.ProceduresHarness.runProcedure('pwr2', proc, { seed: 42 });
  REPLAY_TRIP[proc.id] = !!(res.lastSnap && ((res.lastSnap.rps_state && res.lastSnap.rps_state.scrammed) ||
                                             (res.lastSnap.true_state && res.lastSnap.true_state.scrammed)));
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
    /* the static half: the flag is opt-in and means nothing on a step with one row.
     *
     * ⚰ THE `ask`-ON-EVERY-ROW CLAUSE IS GONE (#796 item 3, 2026-09-20). It pinned #756's model
     * — a line of instruction per substep — and the owner has since superseded that: "go back to
     * one step per plot point like we had before", because a row's `ask` draws in `.ckl-crit`
     * cobalt and only a step's own text draws white. A row may still carry an `ask`; requiring one
     * is what would forbid the shape he asked for. `accs_ordered` itself stays, and so does the
     * two-row floor: the flag means nothing on a single-row step. */
    var ordSteps = [];
    POOL.forEach(function (pr) {
      (pr.steps || []).forEach(function (st, k) {
        if (st.accs_ordered) ordSteps.push({ id: pr.id, k: k + 1, st: st });
      });
    });
    var badOrd = ordSteps.filter(function (e) {
      return !e.st.accs || e.st.accs.length < 2;
    });
    ck('2x every accs_ordered step has at least two rows (#756; the per-row `ask` clause retired #796)',
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
    /* ⚰ THE SHAPE THIS PINS CHANGED BY DIRECTIVE (#796 item 3, 2026-09-20). It used to require
     * four ordered rows per rung — counts floor, `control_bank_steps stopped`, startup rate, plot
     * — which is #761's gate on top of #756's sequence. The owner has retired BOTH from the
     * authored pool: "go back to one step per plot point like we had before. remove the
     * requirements for startup rate to fall back to zero."
     *
     * WHAT STILL HAS TO HOLD, and what this now asserts: TWO ordered rows, the counts floor FIRST
     * and the plot LAST. The ordering is the half that survives on its own merits — a cmd-kind
     * entry is deaf until its predecessor is met, so Plot point cannot bank a stale point while
     * the counts are still climbing, which is the one thing #756 bought that the step text cannot.
     *
     * THE ROD-STOP MECHANISM IS NOT UNTESTED BY THIS RETIREMENT. `op: 'stopped'` now has no
     * author in the pool, exactly as `op: 'steady'` already had none, and both are proven on
     * synthetic channels in §5 below plus on the plant in §3/§4 against a LOCAL fixture rather
     * than a shipped step. A gate that reads authored content cannot tell a retired convention
     * from a regression; one that drives the mechanism can. */
    var shapeBad = [];
    RUNGS.forEach(function (idx, k) {
      var st = proc && proc.steps[idx], w = 'step ' + (idx + 1);
      var en = (st && st.accs) || [];
      var iFloor = -1, iPlot = -1;
      en.forEach(function (e, i) {
        if (e.p === 'sr_counts_cps' && e.op === '>=' && e.v === FLOORS[k]) iFloor = i;
        if (e.cmd === 'plot_1m_point' || (e.cmd && e.cmd.action === 'plot_1m_point')) iPlot = i;
      });
      if (!st || !st.accs_ordered) shapeBad.push(w + ' not accs_ordered');
      else if (en.length !== 2 || iFloor !== 0 || iPlot !== 1)
        shapeBad.push(w + ' ' + en.length + ' rows, order floor/plot = ' + [iFloor, iPlot].join('/'));
    });
    ck('all four 1/M rungs are ONE step per plot point: counts floor, then plot, ordered (#796 item 3)',
       shapeBad.length === 0,
       shapeBad.join('; ') || 'steps 5-8: counts floor then plot, two ordered rows each');

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
    /* ⚰ IT NO LONGER DEMANDS A POPULATION (#796 item 3). `nBagged > 0` was honest while the four
     * 1/M rungs authored `stopped`; with those rows retired by directive the pool authors NO
     * bagged predicate at all, and a check that fails because content was legitimately removed is
     * pinning the content rather than the rule. What it asserts is the rule — any bagged predicate
     * that IS authored must be well formed — and it prints the population so a silent drop to
     * zero is visible in the log rather than inferred. The non-vacuity now lives where it can
     * survive an empty pool: §5's synthetic-channel proofs of `steady` and `stopped`. */
    ck('...and every bagged predicate authored is well formed (param + threshold, window if `steady`)',
       malformed.length === 0,
       malformed.join(', ') || nBagged + ' bagged, all well formed: ' + JSON.stringify(byOp));
    ck('...and `stopped` is authored only on a CONTROL-class param, where equality is exact (#761)',
       notControl.length === 0,
       notControl.join(', ') || (byOp.stopped || 0) + ' stopped predicate(s), all control-class');

    /* --- 3. THE PLANT RUN. The authored 94/63/31/14 ladder on `hot_zero_power`, the step-8 rows
     * graded through `_gradeAccs` — the path the live card actually grades on. */
    /* ⚰ THE FIXTURE IS LOCAL SINCE #796 item 3. This used to grade `proc.steps[7].accs` — the
     * shipped step 8 — and the rows it is about (rod-stop, then the rate) were retired from that
     * step by directive. Driving the shipped rows would now prove only that a counts floor latches
     * when the counts arrive, which is not what #761 is about and not what this section exists to
     * defend. So the ROWS are declared here, in the test, and driven on the real plant through the
     * real `_gradeAccs`: the mechanism stays proven, and the proof stops breaking every time the
     * content that once used it is re-authored. The floor, the quiet window and the tolerance are
     * the ones the pool carried on 2026-09-20, kept verbatim so the measured numbers below still
     * describe the same claim. */
    var ROD_STOP_RUNG = [
      { p: 'sr_counts_cps', op: '>=', v: 6950 },
      { p: 'control_bank_steps', op: 'stopped', v: 60 },
      { p: 'startup_rate_dpm', op: '~', v: 0, tol: 0.02 },
    ];
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
      var graded = { accs: ROD_STOP_RUNG.slice(), accs_ordered: true };
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
        /* The LOCAL fixture again (#796 item 3), at this rung's own floor — see §3. The shipped
         * step no longer carries a rod-stop row, and driving what it does carry would make this
         * probe assert that a counts floor latches when the counts arrive, i.e. exactly the hole
         * #761 was opened to close. */
        var graded = { accs: [{ p: 'sr_counts_cps', op: '>=', v: FLOORS[k] },
                              { p: 'control_bank_steps', op: 'stopped', v: 60 },
                              { p: 'startup_rate_dpm', op: '~', v: 0, tol: 0.02 }],
                       accs_ordered: true };
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
    /* WRAPPED, because the regex stops at the first newline and `fmtExp` is a ONE-LINE function
     * today: reformat it across lines and the capture is a brace-unbalanced fragment. Without
     * the catch, `new Function` throws a raw SyntaxError and takes the whole runner down — a
     * reformat would read as a crash rather than as this check going red, which is the wrong
     * failure mode for a check whose whole job is to notice the board changing. */
    var fmtExp = null;
    try {
      if (fmtSrc) fmtExp = new Function('return (' + fmtSrc[0].trim().replace(/;\s*$/, '') + ');')();
    } catch (e) { fmtExp = null; }
    var lifted = typeof fmtExp === 'function';
    if (!lifted) fmtExp = function () { return '(not lifted)'; };   // keep the checks below RED, not crashed
    ck('2ab. `fmtExp` was lifted out of pwr_board_wiring.js, not re-typed here (#749)',
       lifted && fmtExp(1400) === '1.4e3' && fmtExp(1349) === '1.3e3',
       !fmtSrc ? 'could not find `function fmtExp(` in the wiring'
               : !lifted ? 'found `fmtExp` but could not evaluate the capture — has it been reformatted across lines?'
                         : 'fmtExp(1400)=' + fmtExp(1400) + ', fmtExp(1349)=' + fmtExp(1349));

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
     * `fmtExp` is lifted above.
     *
     * ⚠ AND THE ASYMMETRY WITH CHECK 2 IS DELIBERATE, not an omission (quality pass, 2026-09-18).
     * `power_range` IS in DISPLAY_DAMP (2 s), unlike `source_range` — so item 2 does NOT get item
     * 1's "the graded reading is the drawn reading" argument and is not claiming it. This check
     * makes the narrower claim, which is the one that was wrong: the acceptance LITERAL must be
     * the floor of the digit the tile prints, not its middle. The damping is a separate, standing
     * tolerance the owner has already ruled on (#670: the acceptance reads the undamped
     * transmitter and does not regrade on the filtered value), and it is worth 1.1 s here —
     * MEASURED on the authored route, the row latching 1.1 s BEFORE the tile's first "0.1". A
     * faster ramp would widen that, and widening it is the #670 ruling's business, not this
     * check's. */
    (function () {
      var boardDoc = fs.readFileSync(path.join(ROOT, 'ui', 'diagram', 'board', 'pwr_board_data.js'), 'utf8');
      var dm = /"label":"REACTOR POWER"[^}]*?"digits":(\d+)/.exec(boardDoc);
      var digits = dm ? +dm[1] : null;
      /* THE CRITICALITY STEP IS FOUND BY ITS PREDICATE, not by its index, and it is found in
       * `acc` OR `accs`: it became a two-row step at #749 item 2 (the INTER RANGE progress row
       * went in beside the power row), and a finder that only read `acc` walked straight past it
       * onto the Mode 1 step's `power_pct > 5` and scored that instead — green, on the wrong
       * step. Hunt the ENTRIES, and take the first power row at or after index 8. */
      var pv = null, si = -1;
      (proc ? proc.steps : []).forEach(function (st, i) {
        if (si !== -1 || i < 8) return;
        [].concat(st.acc ? [st.acc] : [], st.accs || []).forEach(function (en) {
          if (si === -1 && en && en.p === 'power_pct') { pv = en.v; si = i; }
        });
      });
      var v = pv;
      /* `digits` null would coerce through toFixed(null) to toFixed(0) — the check still goes
       * red, but the note would read "the tile (null digit) draws 0" and send the next reader
       * after the wrong thing. Named explicitly instead. */
      var okFloor = v != null && digits != null &&
                    v.toFixed(digits) !== (v * (1 - 1e-9)).toFixed(digits) &&
                    v.toFixed(digits) === (v * (1 + 1e-9)).toFixed(digits);
      ck('2ab.4 the criticality step waits for the FIRST power the tile prints as 0.1 %, not the middle of that digit (#749 item 2)',
         okFloor && v.toFixed(digits) === '0.1',
         v == null ? 'no power_pct acceptance found at or after step 9'
                   : digits == null ? 'could not read the REACTOR POWER tile\'s `digits` out of pwr_board_data.js'
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

    /* --- 6. THE INTER RANGE PROGRESS ROW (#749 item 2, 2026-09-18). Same two rules as the count
     * rungs, on the same board formatter: graded on the channel the card draws, thresholded at
     * the floor of the band the card draws it in. `intermediate_range` carries no DISPLAY_DAMP
     * entry either, which is what keeps this clear of the #670 ruling exactly as check 2 does
     * for the source range. `fmtExp(1e-7 - ulp)` is `10.0e-8` — the formatter's own quirk at a
     * mantissa of ten — so for this one the band floor IS the target. */
    (function () {
      var st = null, si = -1;
      (proc ? proc.steps : []).forEach(function (s2, i) {
        if (si !== -1 || i < 8) return;
        (s2.accs || []).forEach(function (en) { if (si === -1 && en && en.p === 'ir_amps') { st = s2; si = i; } });
      });
      var en = null;
      (st ? st.accs : []).forEach(function (e) { if (e.p === 'ir_amps') en = e; });
      var dampM = /var DISPLAY_DAMP = \{([\s\S]*?)\};/.exec(wiring);
      var damped = !!dampM && /(^|[\s,{])intermediate_range\s*:/.test(dampM[1]);
      var svc = mkSvc('hot_zero_power');
      var s = null; for (var i = 0; i < 20; i++) s = svc.tick();
      var il = Object.create(RD.InstructorLayer.prototype);
      var g = en ? il._grade(s, en) : { graded_by: 'no row' };
      var v = en && en.v;
      var floorOK = v != null && fmtExp(v * (1 - 1e-9)) !== fmtExp(v) && fmtExp(v * (1 + 1e-9)) === fmtExp(v);
      ck('2ab.6 the INTER RANGE progress row grades the drawn channel, undamped, at its band floor (#749 item 2)',
         !!en && en.op === '>=' && floorOK && !damped &&
         g.graded_by === 'instrument' && g.value === s.instruments.intermediate_range,
         !en ? 'no ir_amps row found at or after step 9'
             : 'step ' + (si + 1) + ' ' + en.op + ' ' + v + ' -> the card draws ' + fmtExp(v) +
               ' (one ulp below: ' + fmtExp(v * (1 - 1e-9)) + '); graded_by ' + g.graded_by +
               '; damped ' + damped);
      ck('2ab.6 ...and the row prints the SHORTHAND, never the raw threshold (#724 item 6)',
         !!en && String(en.label || '').indexOf(fmtExp(v)) !== -1 &&
         String(en.label || '').indexOf(String(v)) === -1,
         en ? JSON.stringify(en.label) : 'no row');
    })();

    /* --- 7. AND IT ONLY EARNS ITS PLACE IF IT MOVES FIRST. `accs` is a CONJUNCTION: this row
     * cannot shorten the wait by a second, so the ONLY thing it buys is that something on the
     * card ticks part-way through a 21.8-minute stare. If it landed on the power row it would be
     * one more line to read for nothing and DESIGN_CRITERIA Q4 would veto it — so the margin is
     * the acceptance criterion, and it is asserted on the plant rather than assumed.
     *
     * Driven at 10x through the authored route, both rows graded through the real `_gradeAccs`,
     * one bag each so neither can mask the other. MEASURED at 1x on two seeds when the row was
     * authored: the INTER RANGE row ticks at +742 s / +851 s against +1306 s / +1499 s for the
     * power row — 57 % of the wait on both. The bound below is deliberately loose (a fifth of the
     * step, and before the power row) because it pins "a player sees this happen mid-wait", not a
     * number; a retune of the creep should move it, not break it. */
    (function () {
      var st = null, si = -1;
      (proc ? proc.steps : []).forEach(function (s2, i) {
        if (si !== -1 || i < 8) return;
        (s2.accs || []).forEach(function (en) { if (si === -1 && en && en.p === 'ir_amps') { st = s2; si = i; } });
      });
      if (!st) { ck('2ab.7 the criticality step carries an ir_amps row', false, 'none found'); return; }
      var irEn = null, pwEn = null;
      st.accs.forEach(function (e) { if (e.p === 'ir_amps') irEn = e; if (e.p === 'power_pct') pwEn = e; });
      var svc = mkSvc('hot_zero_power');
      var s = null, i;
      for (i = 0; i < 5; i++) s = svc.tick();
      var runFor = function (secs) { var t0 = s.metadata.sim_time; while (s.metadata.sim_time - t0 < secs) s = svc.tick(); };
      for (i = 0; i <= si; i++) {
        var step = proc.steps[i];
        if (step.cmd) svc.handleCommand(step.cmd);
        if (i === si) break;
        runFor(step.hold != null ? step.hold : 2);
      }
      var t0 = s.metadata.sim_time;
      var il = Object.create(RD.InstructorLayer.prototype);
      var irH = {}, pwH = {}, irSt = { accs: [irEn] }, pwSt = { accs: [pwEn] };
      var tIR = null, tPW = null;
      while (s.metadata.sim_time - t0 < (st.hold || 1800) && tPW === null) {
        s = svc.tick();
        if (tIR === null && il._gradeAccs(irH, irSt, s)) tIR = s.metadata.sim_time - t0;
        if (tPW === null && il._gradeAccs(pwH, pwSt, s)) tPW = s.metadata.sim_time - t0;
      }
      var span = st.hold || 1800;
      ck('2ab.7 the INTER RANGE row ticks MID-WAIT, well before the power row — the reason it ships (#749 item 2)',
         tIR !== null && tPW !== null && tIR < tPW && (tPW - tIR) >= span * 0.2,
         (tIR === null ? 'the INTER RANGE row never ticked' : 'INTER RANGE at +' + tIR.toFixed(0) + ' s') +
         ', ' + (tPW === null ? 'REACTOR POWER never ticked within the step' : 'REACTOR POWER at +' + tPW.toFixed(0) + ' s') +
         (tIR !== null && tPW !== null ? ' — a margin of ' + (tPW - tIR).toFixed(0) + ' s against a bound of ' +
                                         (span * 0.2).toFixed(0) : ''));
    })();

    /* --- 8. THE BRACKET STAYS OUT OF THE WAY BELOW ONE (#749 item 2). `fmtPredValue`'s `sci`
     * branch prints the meter's shorthand with the plain number beside it — the owner's own
     * accepted form (#724 item 6) — and `Math.round(1e-7)` is 0, so an INTER RANGE criteria line
     * would have read "1.0e-7 A (0 A)": a bracket saying the channel reads nothing beside a
     * shorthand saying it does not. The formatter is LIFTED out of ui/app.js and run, not
     * source-scanned: a scan tells you the guard is written, never that it is reached. Its `dim`
     * branch (the only part with outside dependencies) is unreachable for a `sci` entry. */
    (function () {
      /* ⚠ NORMALISE THE LINE ENDINGS BEFORE SLICING (2026-09-20). The slice ends on the first
       * `\n  }\n` after the declaration, and this machine has `core.autocrlf=true`, so ANY git
       * checkout rewrites the working tree as CRLF and that pattern then matches nothing —
       * `b2` comes back -1, the slice runs to the end of the file and the lift throws. The
       * committed blob is LF (measured: 0 CRLF in the blob, 10,898 in the worktree), so CI and
       * a freshly-edited file both pass and only a Windows tree that has been checked out goes
       * red. It cost a release gate to find. The claim this check makes is about the FORMATTER,
       * not about line endings, so normalising here narrows nothing. */
      var appSrc = fs.readFileSync(path.join(ROOT, 'ui', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
      var a2 = appSrc.indexOf('function fmtPredValue(');
      var b2 = a2 < 0 ? -1 : appSrc.indexOf('\n  }\n', a2);
      var fpv = null;
      try {
        if (a2 >= 0 && b2 > a2) fpv = new Function('return (' + appSrc.slice(a2, b2 + 4).trim() + ');')();
      } catch (e) { fpv = null; }
      if (typeof fpv !== 'function') {
        ck('2ab.8 `fmtPredValue` was lifted out of ui/app.js and run (#749 item 2)', false,
           'could not lift `function fmtPredValue(` — has it moved or been reformatted?');
        return;
      }
      var ir = fpv({ label: 'INTER RANGE', u: 'A', sci: true }, 1e-7);
      var sr = fpv({ label: 'SOURCE RANGE', u: 'counts per second', sci: true }, 1400);
      ck('2ab.8 a sub-unit `sci` reading drops the bracket instead of printing a rounded zero (#749 item 2)',
         ir === '1.0e-7 A' && sr === '1.4e3 (1,400 counts per second)',
         'ir_amps 1e-7 -> ' + JSON.stringify(ir) + ' · sr_counts_cps 1400 -> ' + JSON.stringify(sr));
    })();
  })();


  /* 2ad. A ROW THE PLAYER CAN BREAK MUST NOT TAKE THE STEP WITH IT (#749 follow-up,
   * OWNER RULING 2026-09-18, option B of four: "the INTER RANGE row stays — close the
   * soft-lock it opened"; reverting the row and building a separate non-grading affordance
   * were both put and declined).
   *
   * THE DEFECT. `accs` is a CONJUNCTION and since #749 item 1 both of the criticality step's
   * rows grade on INSTRUMENTS. MEASURED on this tree, `hot_full_power`, seed 7, through the
   * real `_gradeAccs`: `set_instrument_failure {intermediate_range, dead}` — reachable by the
   * player from the Failures tab — publishes the channel's range floor 1.0e-11 A against a
   * true 8.3e-3 A, the INTER RANGE row reads `met:false` for ever while REACTOR POWER reads
   * 99.6 % and meets, and the step authors no `overtaken`. Continue dark, leg stranded.
   *
   * THE MECHANISM IS AN IMPLICATION, NOT A FAIL-OPEN, and check 4 is what holds that line.
   * The obvious candidate — stand a row down when its channel is known bad — cannot be built
   * honestly here and would be the wrong shape if it could: (a) MEASURED, nothing the
   * instructor layer can see declares the failure, `snapshot.active_failures` is `[]` with the
   * channel dead (the engine knows; nothing publishes it); (b) standing a row down BECAUSE a
   * gauge broke says nothing about whether anything still asserts the step. `implied_by` names
   * a SIBLING that does, and that sibling is graded on an instrument too — Hard Rule 1 intact,
   * no true_state read on either side.
   *
   * INJECTION (each proven in place, 2026-09-18):
   *   · delete `implied_by: 'power_pct'` from the step        -> 2ad.1 and 2ad.3 red
   *   · drop the `state[ni].met` test in the implication pass -> 2ad.4 red (it ticks a step
   *                                                              whose real acceptance is unmet)
   *   · the `ordered` half of 2ad.1 is an AUTHORING gate and cannot be reddened by a code
   *     change: no shipped ordered step carries an `implied_by`, which is the state it pins. */
  (function () {
    var proc = null;
    POOL.forEach(function (p) { if (p.id === 'pwr_startup') proc = p; });

    /* --- 1. THE AUTHORING SHAPE, swept over the WHOLE pool rather than the one step: an
     * `implied_by` that names nothing, names itself, sits on an ordered step, or covers every
     * row of a step (a step that then grades nothing at all) is a defect wherever it appears. */
    (function () {
      var bad = [], carriers = [];
      POOL.forEach(function (pr) {
        (pr.steps || []).forEach(function (st2, i) {
          var accs = st2.accs || [];
          var impl = 0;
          accs.forEach(function (en) {
            if (!en || !en.implied_by) return;
            impl++;
            carriers.push(pr.id + ' step ' + (i + 1) + ' ' + en.p + ' <- ' + en.implied_by);
            if (en.implied_by === en.p) bad.push(pr.id + ':' + (i + 1) + ' names itself');
            if (!accs.some(function (o) { return o !== en && o.p === en.implied_by; }))
              bad.push(pr.id + ':' + (i + 1) + ' names a sibling that is not there (' + en.implied_by + ')');
            if (st2.accs_ordered) bad.push(pr.id + ':' + (i + 1) + ' is on an accs_ordered step');
            if (!en.label) bad.push(pr.id + ':' + (i + 1) + ' has no label to draw under');
          });
          if (impl && impl === accs.length) bad.push(pr.id + ':' + (i + 1) + ' has EVERY row implied — it grades nothing');
        });
      });
      ck('2ad.1 every authored `implied_by` names a real sibling, on an unordered step, and never covers the whole step (#749)',
         bad.length === 0 && carriers.length >= 1,
         bad.length ? bad.join('; ') : (carriers.length ? carriers.join(' · ') : 'NO step authors implied_by — has the row been reverted?'));
    })();

    /* --- 2. THE IMPLICATION IS ARITHMETIC ON THIS PLANT, and the constant is LIFTED out of the
     * engine rather than quoted here: `pwr2_true_state` computes `ir_amps = K_IR x power_frac`,
     * so the power row's own threshold pins where INTER RANGE must already be. A retune of
     * either number that closes the margin reddens this instead of quietly making the
     * implication a guess. Bound at 10x, measured at 41.7x. */
    (function () {
      var tsSrc = fs.readFileSync(path.join(ROOT, 'engines', 'pwr2', 'pwr2_true_state.js'), 'utf8');
      var kM = /K_IR\s*=\s*([0-9.eE+-]+)/.exec(tsSrc);
      var K_IR = kM ? parseFloat(kM[1]) : NaN;
      var st2 = proc ? proc.steps[8] : null;
      var irEn = null, pwEn = null;
      ((st2 && st2.accs) || []).forEach(function (e) { if (e.p === 'ir_amps') irEn = e; if (e.p === 'power_pct') pwEn = e; });
      var atPower = (irEn && pwEn && isFinite(K_IR)) ? K_IR * (pwEn.v / 100) : NaN;
      var ratio = atPower / (irEn ? irEn.v : NaN);
      ck('2ad.2 the covering row threshold puts INTER RANGE far above the covered row (#749)',
         isFinite(ratio) && ratio >= 10,
         !kM ? 'could not lift K_IR out of pwr2_true_state.js — has it been renamed?'
             : 'K_IR ' + K_IR + '; REACTOR POWER ' + (pwEn ? pwEn.v : '?') + ' % puts ir_amps at ' +
               (isFinite(atPower) ? atPower.toExponential(2) : '?') + ' A against the row ' +
               (irEn ? irEn.v.toExponential(1) : '?') + ' A — ' +
               (isFinite(ratio) ? ratio.toFixed(1) : '?') + 'x, bound 10x');
    })();

    /* --- 3 / 4 / 5. THE PLANT. One helper, three fixtures — the soft-lock closed, the relief
     * refusing to fire when nothing else asserts the step, and the healthy board unchanged.
     * `hot_full_power` is the fixture the defect was measured on: it is the cheapest plant on
     * which the covering row is true and the covered one can be broken. */
    function gradeStep(ic, dead, ticks) {
      var svc = mkSvc(ic);
      var s = null, i;
      for (i = 0; i < 10; i++) s = svc.tick();
      if (dead) svc.handleCommand({ action: 'set_instrument_failure', instrument_id: dead, mode: 'dead' });
      var il = Object.create(RD.InstructorLayer.prototype);
      var holder = {}, all = false;
      for (i = 0; i < (ticks || 40); i++) { s = svc.tick(); all = il._gradeAccs(holder, proc.steps[8], s); }
      return { all: all, rows: holder.accsState, s: s };
    }

    (function () {
      var r = gradeStep('hot_full_power', 'intermediate_range');
      var ir = r.rows ? r.rows[0] : null, pw = r.rows ? r.rows[1] : null;
      ck('2ad.3 a dead INTER RANGE no longer strands the criticality step — the step completes (#749)',
         r.all === true && !!ir && ir.met === true && ir.implied === true &&
         ir.obs === r.s.instruments.intermediate_range && ir.obs < 1e-7,
         'step graded ' + r.all + '; INTER RANGE met ' + (ir && ir.met) + ' implied ' + (ir && ir.implied) +
         ' reading ' + (ir && ir.obs != null ? ir.obs.toExponential(1) : '?') + ' A against a true ' +
         (r.s.true_state.ir_amps != null ? r.s.true_state.ir_amps.toExponential(1) : '?') +
         ' A; REACTOR POWER met ' + (pw && pw.met) + ' at ' + (pw && pw.obs != null ? pw.obs.toFixed(1) : '?') + ' %');
    })();

    (function () {
      /* THE LINE THIS CHECK HOLDS. The relief is redundancy, not sympathy for a broken gauge:
       * on a plant where the COVERING row is also unmet, a dead INTER RANGE must strand exactly
       * as before. Mode 3 at hot zero power is that plant — REACTOR POWER reads about 1.9e-7 %
       * against the row's 0.05 %. It also proves the mechanism is not reading a failure bit,
       * because the same injection is standing and the step does not tick. */
      var r = gradeStep('hot_zero_power', 'intermediate_range');
      var ir = r.rows ? r.rows[0] : null, pw = r.rows ? r.rows[1] : null;
      ck('2ad.4 ...and it is NOT a fail-open: with the covering row unmet the same dead channel still holds the step (#749)',
         r.all === false && !!ir && ir.met === false && !!pw && pw.met === false &&
         (r.s.active_failures || []).length === 0,
         'step graded ' + r.all + '; INTER RANGE met ' + (ir && ir.met) + ', REACTOR POWER met ' +
         (pw && pw.met) + ' at ' + (pw && pw.obs != null ? pw.obs.toExponential(1) : '?') +
         ' %; the snapshot declares ' + (r.s.active_failures || []).length +
         ' active failures with the channel dead — which is why the relief cannot read one');
    })();

    (function () {
      /* AND ON A HEALTHY BOARD IT CHANGES NOTHING. The covered row meets on its OWN reading and
       * `implied` stays false, which is the claim that keeps this from being the report-only
       * row kind the owner declined. */
      var r = gradeStep('hot_full_power', null, 20);
      var ir = r.rows ? r.rows[0] : null;
      ck('2ad.5 on a healthy board the covered row still ticks on its own reading, unimplied (#749)',
         r.all === true && !!ir && ir.met === true && ir.implied === false &&
         ir.obs >= 1e-7 && ir.graded_by === 'instrument',
         'INTER RANGE met ' + (ir && ir.met) + ' implied ' + (ir && ir.implied) + ' reading ' +
         (ir && ir.obs != null ? ir.obs.toExponential(1) : '?') + ' A by ' + (ir && ir.graded_by));
    })();
  })();

  /* 2ac. A MESSAGE RAISED ON A WALKTHROUGH STEP DIES WITH THAT STEP (#749 item 4, 2026-09-18).
   *
   * `_advanceFollow` has cleared `pendingMessage` on every step change since it was written;
   * `_checklistCheckOff` — the Path 3 advance that the Continue button AND the overtaken skip
   * both run through — reset eleven per-step fields and never touched it. MEASURED on the live
   * runtime before the fix: step 6's overtaken text stood at steps 9, 10, 11, 12, 13, 14, 15, 16,
   * 17 and on the COMPLETE snapshot — TEN of the ten later states, the last of them telling a
   * finished player to "Stop withdrawing".
   *
   * THIS IS DRIVEN, NOT UNIT-TESTED, AND THAT IS THE POINT. The defect was nine step advances and
   * a completion card; a single-advance probe on the layer would have passed on a fix that only
   * worked once. So the first two checks play the whole leg: start the walkthrough, Continue up
   * to a 1/M rung, overshoot the bank until the plant secures the source range itself, then
   * Continue to the end reading `snapshot.instructor.message` at every step.
   *
   * THE TWO HALVES ARE OPPOSITE FAILURES AND BOTH ARE REAL. Clearing the message inside
   * `_checklistCheckOff` deletes the very message the overtaken path calls it to deliver (that
   * path used to set it first); NOT clearing it leaves it on every later card. A check for one
   * passes on a build that has the other, which is why neither is written alone.
   *
   * INJECTION, both directions, proven in place:
   *   · delete `this.pendingMessage = null;` from `_checklistCheckOff` -> 2ac.2 and 2ac.3 red
   *   · swap the overtaken path back to set-then-check-off                -> 2ac.1 red */
  (function () {
    var svc = mkSvc('hot_zero_power');
    var s = null, i;
    for (i = 0; i < 5; i++) s = svc.tick();
    svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_startup' });
    for (i = 0; i < 5; i++) s = svc.tick();
    function ckl() { return s.instructor && s.instructor.checklist; }
    function msg() { return (s.instructor && s.instructor.message) || null; }

    /* up to a rung that authors `overtaken` — the lower 1/M points are the only steps that do */
    var rung = -1;
    (function () {
      var p2 = null;
      POOL.forEach(function (p) { if (p.id === 'pwr_startup') p2 = p; });
      (p2 ? p2.steps : []).forEach(function (st, k) { if (rung === -1 && st.overtaken && st.overtaken.p) rung = k; });
    })();
    var guard = 0;
    while (ckl() && ckl().step_index < rung + 1 && guard++ < 500) {
      svc.handleCommand({ action: 'checklist_check', index: ckl().step_index });
      s = svc.tick();
    }
    var startedAt = ckl() ? ckl().step_index : -1;

    /* the overshoot: drive the bank out until the plant secures the source range on its own */
    svc.handleCommand({ action: 'rod_start', group_id: 'control', direction: 1, speed: 'normal' });
    guard = 0;
    while (guard++ < 300000 && s.true_state.sr_energized) s = svc.tick();
    svc.handleCommand({ action: 'rod_stop', group_id: 'control' });
    var securedBank = s.true_state.rod_steps;
    for (i = 0; i < 20; i++) s = svc.tick();          // let the overtaken debounce land and skip

    var landedAt = ckl() ? ckl().step_index : -1;
    var landedMsg = msg();
    ck('2ac.1 the overtaken note is DELIVERED on the step the skip lands on (#749 item 4 — the ordering half)',
       landedAt > startedAt && !!landedMsg && /overtaken/i.test(String(landedMsg)),
       'entered the overshoot on step ' + (startedAt + 1) + ', the plant secured the source range at bank ' +
       (securedBank == null ? '?' : securedBank.toFixed(0)) + ' and the walkthrough skipped to step ' +
       (landedAt + 1) + '; message ' + (landedMsg ? JSON.stringify(String(landedMsg).slice(0, 48) + '…') : 'NONE'));

    /* Continue to the end, reading the card at every step */
    var later = [], carried = [], lastIdx = landedAt;
    guard = 0;
    while (ckl() && !ckl().complete && guard++ < 4000) {
      var c = ckl();
      if (c.step_index !== lastIdx) {
        lastIdx = c.step_index;
        later.push(c.step_index + 1);
        if (msg() != null) carried.push(c.step_index + 1);
      }
      svc.handleCommand({ action: 'checklist_check', index: c.step_index });
      s = svc.tick();
    }
    var doneMsg = msg();
    if (doneMsg != null) carried.push('COMPLETE');
    ck('2ac.2 ...and it is GONE from every LATER step and from the COMPLETE card (#749 item 4 — the clear half)',
       ckl() && ckl().complete && later.length >= 5 && carried.length === 0,
       !ckl() || !ckl().complete ? 'the leg never completed — ' + later.length + ' steps walked'
                                 : later.length + ' later steps walked (' + later.join(', ') + ') plus the ' +
                                   'COMPLETE card; ' + (carried.length ? 'STILL CARRYING A MESSAGE AT: ' + carried.join(', ')
                                                                       : 'every one of them clear'));

    /* AND IT IS NOT SPECIFIC TO THE OVERTAKEN NOTE, which is the issue's own point: ANY message
     * standing when the player presses Continue belonged to the step they are leaving. Raised by
     * hand here rather than by finding a step that happens to speak, because the claim is about
     * the ADVANCE and not about any one message. */
    (function () {
      var svc2 = mkSvc('hot_zero_power');
      var s2 = null, k;
      for (k = 0; k < 5; k++) s2 = svc2.tick();
      svc2.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_startup' });
      for (k = 0; k < 5; k++) s2 = svc2.tick();
      var il = svc2.instructor;
      var before = il && il.checklist ? il.checklist.idx : -1;
      il.pendingMessage = { learning: 'a message raised on this step', industry: 'A MESSAGE RAISED ON THIS STEP' };
      s2 = svc2.tick();
      var drawnBefore = s2.instructor && s2.instructor.message;
      svc2.handleCommand({ action: 'checklist_check', index: il.checklist.idx });
      s2 = svc2.tick();
      var after = il.checklist ? il.checklist.idx : -1;
      var drawnAfter = s2.instructor && s2.instructor.message;
      ck('2ac.3 ...and ANY message dies on a plain Continue, not just the overtaken note (#749 item 4)',
         drawnBefore === 'a message raised on this step' && after === before + 1 && !drawnAfter,
         'step ' + (before + 1) + ' -> ' + (after + 1) + '; card read ' + JSON.stringify(drawnBefore) +
         ' before Continue and ' + JSON.stringify(drawnAfter || null) + ' after');
    })();

    /* ...BUT THE CATCH-UP IS NOT A CONTINUE, and the first draft of the clear ate the one comment
     * the player most needs (quality pass, 2026-09-18). `_stepChecklist` raises the
     * PRECONDITIONS-NOT-MET comment and THEN runs the catch-up fast-forward, in the same pass —
     * so an unconditional clear inside `_checklistCheckOff` deleted it before any broadcast drew
     * it, and `precondSaid` latches for the run, so it never came back.
     *
     * `pwr_shutdown` on `hot_zero_power` is the shipped case: its first precondition is REACTOR
     * POWER above 10 % (the plant reads about 1.9e-7 %) and step 1's acceptance — OUTPUT below
     * 5 MWe — is already true, so the catch-up fires on the first pass. This is the walkthrough
     * equivalent of the player opening the wrong procedure, which is exactly when the comment has
     * something to say.
     *
     * INJECTION: drop the `by !== 'caught_up'` guard in `_checklistCheckOff` -> this check red
     * (message NULL on every broadcast), 2ac.1-2ac.3 all still green — which is why it is written
     * as its own check and not folded into one of them. */
    (function () {
      var svc3 = mkSvc('hot_zero_power');
      var s3 = null, k;
      for (k = 0; k < 5; k++) s3 = svc3.tick();
      svc3.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_shutdown' });
      for (k = 0; k < 4; k++) s3 = svc3.tick();
      var c3 = (s3.instructor && s3.instructor.checklist) || null;
      var caughtUp = !!c3 && (c3.done_by || []).indexOf('caught_up') !== -1;
      var unmet = c3 && c3.preconditions ? c3.preconditions.filter(function (r) { return !r.met; }).length : 0;
      var m3 = (s3.instructor && s3.instructor.message) || null;
      ck('2ac.4 ...and the catch-up fast-forward does NOT eat the preconditions comment (#749 item 4)',
         caughtUp && unmet > 0 && !!m3 && /prerequisite/i.test(String(m3)),
         !c3 ? 'no checklist' : 'caught_up ' + caughtUp + ' (done_by ' + JSON.stringify(c3.done_by) +
           '), ' + unmet + ' precondition row(s) unmet, message ' +
           (m3 ? JSON.stringify(String(m3).slice(0, 48) + '…') : 'NONE'));
    })();
  })();

  /* 2ae. A DEAD GAUGE STRANDS THE LEG — THE WHOLE-POOL SWEEP (#773, 2026-09-19).
   *
   * §2ad above closed ONE instance by hand (`pwr_startup` step 9's INTER RANGE row, by
   * `implied_by`). This is the same question asked of every acceptance row in the pool, because
   * `accs` is a CONJUNCTION and `_gradeAccs` conjoins everything: a row graded on an instrument
   * the player can break from the Failures tab takes its whole step with it, and with no
   * `overtaken` and no `implied_by` the Continue button never lights again.
   *
   * THE ISSUE COUNTED; THIS SWEEPS. #773 filed 84 graded steps / 135 predicate rows / 87 graded
   * on an instrument / 27 of those the only row of their step, and said plainly that they were
   * COUNTED, not swept. Re-measured here on the built pool: 84 / 135 / 87 / 27, identical. What
   * a count cannot tell you is which of the 87 actually strand, and the measured answer is that
   * FEWER THAN HALF do — 47 of the 87 (46 until #789 made `subcooling_margin` breakable and
   * moved step 19 in from `skipped`), plus 3 more from the four `saw` rows the issue did not
   * count at all, 50 in total — for three reasons the sweep decides per row rather than by list:
   *
   *   (a) THE DIRECTION OF THE COMPARISON DECIDES IT, and that is the finding the count could
   *       not carry. `dead` publishes the channel's RANGE FLOOR, so it can only ever fail a row
   *       that reads UPWARD. MEASURED at each leg's own `from`: 49 rows read `met:false` under
   *       the dead channel and STRAND; 30 rows read `met:TRUE` — a `<`/`<=` row that the floor
   *       satisfies — and those do not strand, they FALSE-TICK. `pwr_shutdown` step 1 is the
   *       clean example: `mwe_output < 5` against a dead gauge reading 0.000 MWe while the
   *       generator truly makes 100.0 MWe, the step ticks off and the leg walks on. Both sets
   *       are pinned below; which is the worse defect is the content pass's question, not this
   *       gate's. (A `stuck` failure with a typed value breaks a row in EITHER direction — the
   *       panel offers one — so the 30 are unsafe too; `dead` is pinned because it is the
   *       one-click mode with no value to type, and it is what #773 and #749 both measured.)
   *   (b) A CHANNEL THE PLAYER CANNOT ACTUALLY BREAK DOES NOT STRAND — WAS true of one of the
   *       nineteen until #789 (2026-09-20), kept here as the record of what changed. MEASURED,
   *       `hot_full_power`, seed 7, 3.0 s after the command: `set_instrument_failure
   *       {subcooling_margin, stuck, value: 12.040}` (21.7 °F of margin) returned `ok` and
   *       SUBCOOLING MARGIN went on reading 43.5 °F (24.140 °C) — a silent no-op, because
   *       `subcooling_margin` is DERIVED inside the instrument layer (Tsat(primary_pressure) −
   *       tavg) and `update()` computed it directly rather than routing it through
   *       `_applyFailure` like every SOURCE-mapped channel. The Failures tab listed the channel
   *       and the click did nothing — filed as #789 and fixed at `engines/pwr/pwr_instruments.js`
   *       (the derivation now ends in `this._applyFailure('subcooling_margin', ...)`, clipped to
   *       the channel's own range like every other mode).
   *
   *       So the three TMI-2 subcooling rows are DIRECTLY breakable now, and are measured that
   *       way below rather than skipped: `dead` pins the reading at the channel's range floor,
   *       −28.000 °C (−50.4 °F of margin, a DIFFERENCE — no +32 offset), which false-ticks steps
   *       13, 15 and 17 (each a `<=` row the floor satisfies) and strands step 19 (`> 5.56`, which
   *       a pinned-low reading can never clear). `skipped` is 0 — UNBREAKABLE_EXPECTED is empty,
   *       pinned that way so a future DERIVED channel with the same hole reopens this check.
   *       The sweep is deliberately DIRECT-ONLY — one channel, the one the row grades on — so
   *       that its set is a property of the authoring and not of the whole instrument graph.
   *   (c) RELIEF THE AUTHOR ALREADY WROTE. Nine rows carry it: `pwr_startup` 5-8's eight 1/M
   *       rows sit on steps with `overtaken: {sr_energized}`, graded on true_state and therefore
   *       untouched by any instrument failure (measured: `sr_energized` reads the same healthy
   *       and with SOURCE RANGE dead), so the plant can still check the step off; and step 9's
   *       INTER RANGE row is #749's `implied_by`, which names a sibling on a DIFFERENT channel.
   *       Relief on the SAME channel would be no relief at all, which is why both tests compare
   *       channels rather than parameter names.
   *
   * WHAT THIS CHECK IS FOR. Not to say the 49 are acceptable — that is the content pass, split
   * by leg, and the set below is grouped that way for it. It is to make the set KNOWN and
   * FROZEN, in the §2n idiom: a new acceptance row that strands cannot join the pool unnoticed,
   * and a row that is fixed must be taken out of the list by hand, where the removal is read.
   *
   * INJECTION — every check below made to FAIL deliberately and restored, 2026-09-19, and what
   * each one printed:
   *   · rename `pwr2:` to `pwrZZ:` in the scan regex        -> 2ae.1 red, "SCAN MISSED:
   *     pump_flow_pct, pressure_mpa, tavg_c, …" (16 params), and 2ae.1b/.2/.3/.4/.5 red with it —
   *     the scan is load-bearing for the whole section, which is why 2ae.1 exists
   *   · delete `'pwr_heatup:2:pump_flow_pct'` from STRAND_EXPECTED -> 2ae.2 red, "UNPINNED:
   *     pwr_heatup:2:pump_flow_pct. 49 row(s) …"
   *   · add `'pwr_nonesuch:1:power_pct'` to STRAND_EXPECTED  -> 2ae.2 red, "PINNED BUT NOT SEEN"
   *   · add `tavg` to UNBREAKABLE_EXPECTED                   -> 2ae.3 red (tavg took the stuck
   *     value exactly — zero no-ops found against one pinned; re-verified 2026-09-20 after #789
   *     emptied this set, see the (b) note above)
   *   · delete `'pwr_shutdown:1:mwe_output'` from TICK_EXPECTED    -> 2ae.4 red, "UNPINNED"
   *   · delete `'pwr_startup:9:ir_amps'` from RELIEVED_EXPECTED    -> 2ae.5 red, "UNPINNED"
   *   · point 2ae.6's probe at `sr_counts_cps` instead of `sr_energized` -> 2ae.6 red,
   *     "528.87 healthy / 1 with SOURCE RANGE dead, graded_by instrument" — i.e. the check does
   *     discriminate a true_state relief from an instrument one */
  (function () {
    var grader = Object.create(RD.InstructorLayer.prototype);

    /* THE PARAM -> CHANNEL MAP, scanned from the layer the way §2a scans it, because the map is
     * module-private. A SCAN CAN MISS AN ENTRY SILENTLY, so check 2ae.1 closes that by asking
     * the LAYER, on a live snapshot, which pool params actually grade `instrument` — the scan
     * has to cover every one of them or the sweep is looking at the wrong rows. */
    var isrc = fs.readFileSync(path.join(ROOT, 'layers', 'instructor_layer.js'), 'utf8');
    var pm = /\n    pwr2:\s*\{([\s\S]*?)\n    \},/.exec(isrc);
    var MAP = {};
    (pm ? pm[1] : '').replace(/([a-z_0-9]+)\s*:\s*'([a-z_0-9]+)'/g,
      function (_, p, id) { MAP[p] = id; return ''; });

    function boot(ic) {
      var svc = mkSvc(ic); var s = null;
      for (var i = 0; i < 30; i++) s = svc.tick();
      return { svc: svc, snap: s };
    }
    var healthy = {};
    function snapHealthy(from) {
      if (!healthy[from]) healthy[from] = boot(from).snap;
      return healthy[from];
    }
    var deadCache = {};
    function snapDead(from, chan) {
      var k = from + '|' + chan;
      if (deadCache[k]) return deadCache[k];
      var w = boot(from);
      w.svc.handleCommand({ action: 'set_instrument_failure', instrument_id: chan, mode: 'dead' });
      var s = null; for (var i = 0; i < 30; i++) s = w.svc.tick();
      return (deadCache[k] = s);
    }

    /* --- the rows. `accs` when present, else the single `acc`; predicate rows only.
     *
     * …AND `saw`, WHICH #773 DID NOT COUNT AND WHICH STRANDS THE SAME WAY. `_stepChecklist`
     * latches `sawSeen` the first tick the predicate holds and a step with a `saw` cannot
     * complete until it has, so a channel dead from the step's first tick is a lock with no
     * relief at all — `implied_by` lives inside `accs` and cannot reach a `saw`. Four exist in
     * the pool, all four graded on instruments, and TWO of them are on a channel their own
     * step's acceptance does NOT use, so they are stranding vectors the 87 could not see:
     * `pwr_startup` 10 (`startup_rate_dpm > 0` beside an acceptance on REACTOR POWER) and
     * `pwr_tmi2_incident` 3 (`pressure_mpa > 16`, the step's ONLY grading of any kind). Counted
     * apart from the 87 so that 2ae.1b still measures exactly what the issue counted. */
    var rows = [], sawRows = [], gradedSteps = 0, predRows = 0, soleInst = 0;
    POOL.forEach(function (proc) {
      (proc.steps || []).forEach(function (st, idx) {
        var accs = (st.accs && st.accs.length) ? st.accs : (st.acc ? [st.acc] : []);
        var preds = accs.filter(function (e) { return e && e.p; });
        if (st.saw && st.saw.p && MAP[st.saw.p]) {
          sawRows.push({ key: proc.id + ':' + (idx + 1) + ':saw:' + st.saw.p, proc: proc.id,
                         from: proc.from, step: idx + 1, en: st.saw, chan: MAP[st.saw.p],
                         sole: !preds.length, isSaw: true, sib: [], ot: st.overtaken || null });
        }
        if (!preds.length) return;
        gradedSteps++; predRows += preds.length;
        preds.forEach(function (en) {
          var chan = MAP[en.p]; if (!chan) return;
          if (preds.length === 1) soleInst++;
          rows.push({ key: proc.id + ':' + (idx + 1) + ':' + en.p, proc: proc.id, from: proc.from,
                      step: idx + 1, en: en, chan: chan, sole: preds.length === 1,
                      sib: preds.filter(function (o) { return o !== en; }), ot: st.overtaken || null });
        });
      });
    });

    /* --- 2ae.1 the scan covers every instrument-graded param the pool actually uses. */
    (function () {
      var seen = {}, missing = [];
      POOL.forEach(function (proc) {
        (proc.steps || []).forEach(function (st) {
          var accs = (st.accs && st.accs.length) ? st.accs : (st.acc ? [st.acc] : []);
          accs.concat(st.saw ? [st.saw] : []).forEach(function (en) {
            if (!en || !en.p || seen[en.p]) return; seen[en.p] = 1;
            var g = grader._grade(snapHealthy(proc.from), en);
            if (g.graded_by === 'instrument' && !MAP[en.p]) missing.push(en.p);
          });
        });
      });
      ck('2ae.1 the scanned PARAM_INSTRUMENT.pwr2 map covers every param the layer grades on an instrument (#773)',
         Object.keys(MAP).length >= 19 && missing.length === 0,
         missing.length ? 'SCAN MISSED: ' + missing.join(', ')
           : Object.keys(MAP).length + ' mapped params, ' + Object.keys(seen).length +
             ' distinct pool params, none graded `instrument` outside the map');
      /* ⚰ RE-PINNED 2026-09-20 (#796 item 3): 135 -> 127 predicate rows, 87 -> 83
       * instrument-graded, 27 -> 31 sole rows. The eight that left are the rod-stop and
       * startup-rate rows the 1/M ladder shed when it collapsed to one step per plot point by
       * directive, and the SOLE count RISES for the same reason — a rung that had four rows now
       * has two, and its counts floor is the only predicate row on it, so four more rows became
       * the only row of their step. The graded-step count is unmoved at 84, which is the control:
       * no step gained or lost its grading, only its row count. */
      ck('2ae.1b the re-measured pool counts are the pinned ones (#773, re-pinned #796: 84 / 127 / 83 / 31)',
         gradedSteps === 84 && predRows === 127 && rows.length === 83 && soleInst === 31,
         gradedSteps + ' graded steps, ' + predRows + ' predicate rows, ' + rows.length +
         ' instrument-graded, ' + soleInst + ' of them the only row of their step');
    })();

    /* --- which of the channels can the player actually break? ONE BOOT PER CHANNEL, stuck at
     * half its live reading; the failure switch returns the stuck value directly, so a channel
     * whose reading does not become that value has no transmitter to fail and the injection is
     * a silent no-op. ONE AT A TIME ON PURPOSE, not batched: a DERIVED channel is computed from
     * its neighbours, so breaking sixteen at once moves it too — measured, the batched form put
     * SUBCOOLING MARGIN at −4.0208 °C instead of its healthy 24.140, which still is not the
     * 12.040 asked for but could collide with it on some other plant state and report a derived
     * channel as breakable. Isolation is what makes the answer about the channel. */
    /* Empty since #789 (2026-09-20): `subcooling_margin` was the one channel here with no
     * transmitter of its own to fail (see the (b) note above) and is now wired through
     * `_applyFailure` like every other channel. Pinned empty rather than deleted so a future
     * DERIVED channel with the same hole reopens 2ae.3 instead of joining `chans` unnoticed. */
    var UNBREAKABLE_EXPECTED = {};
    var breakable = {}, breakNote = {};
    (function () {
      var chans = {};
      rows.concat(sawRows).forEach(function (r) { chans[r.chan] = 1; });
      var noop = [];
      Object.keys(chans).forEach(function (c) {
        var w = boot('hot_full_power');
        var lv = w.snap.instruments[c];
        var t = (typeof lv === 'number' && lv !== 0) ? lv * 0.5 : 0.5;
        /* CLAMP THE PROBE INTO THE CHANNEL'S OWN SPAN (#791, 2026-09-20). `stuck` now pegs an
         * out-of-range typed value to the transmitter's own range floor/ceiling, correctly —
         * that is #791's fix. Before it, a `stuck` value only had to be TYPED to be honored,
         * so half of a channel's live reading was a fine probe for every channel including one
         * sitting on its own floor. `source_range` at `hot_full_power` (SR de-energized) reads
         * its range floor 1.0 cps, half of which is 0.528 — now legitimately clipped back to
         * 1.0, which the probe's raw comparison misread as a no-op. Clamp the TARGET to what a
         * real instrument will accept before asking whether it arrived; a channel is unbreakable
         * only if an IN-RANGE typed value fails to land, not if an out-of-range one is refused. */
        var spec = RD.PWR_CONFIG.instruments[c];
        if (spec && spec.range) t = Math.min(spec.range[1], Math.max(spec.range[0], t));
        w.svc.handleCommand({ action: 'set_instrument_failure', instrument_id: c, mode: 'stuck', value: t });
        var s = null; for (var i = 0; i < 30; i++) s = w.svc.tick();
        var got = s.instruments[c];
        breakable[c] = Math.abs(got - t) < Math.max(1e-9, Math.abs(t) * 1e-6);
        breakNote[c] = c + ' live ' + Number(lv).toPrecision(5) + ' stuck@' + Number(t).toPrecision(5) +
                       ' -> ' + Number(got).toPrecision(5);
        if (!breakable[c]) noop.push(breakNote[c]);
      });
      var keys = Object.keys(UNBREAKABLE_EXPECTED);
      ck('2ae.3 every channel the pool grades on takes an instrument failure — no silent DERIVED no-op (#773/#789)',
         noop.length === keys.length && keys.every(function (k) { return breakable[k] === false; }),
         (noop.length ? 'NO-OP: ' + noop.join('; ') + '. ' : '') + Object.keys(chans).length +
         ' channels probed, ' + (Object.keys(chans).length - noop.length) + ' took the stuck value');
    })();

    /* --- the sweep. Per row: relief first (it costs nothing), then the injection. */
    var strand = [], ticks = [], relieved = [], skipped = [];
    rows.concat(sawRows).forEach(function (r) {
      if (!breakable[r.chan]) { skipped.push(r.key); return; }
      var impl = r.en.implied_by
        ? r.sib.filter(function (o) { return o.p === r.en.implied_by; })[0] : null;
      if (impl && MAP[impl.p] !== r.chan) { relieved.push(r.key + ' implied_by ' + impl.p); return; }
      if (r.ot && r.ot.p && MAP[r.ot.p] !== r.chan) { relieved.push(r.key + ' overtaken ' + r.ot.p); return; }
      var d = snapDead(r.from, r.chan);
      var g = grader._grade(d, r.en);
      r.read = d.instruments[r.chan]; r.truth = d.true_state[r.en.p];
      (g.met ? ticks : strand).push(r);
    });

    /* THE STRANDING SET — MEASURED, one `dead` injection per row at that row's own leg `from`.
     * Grouped by leg because the content pass is split that way. `[SOLE]` marks a row that is
     * the only acceptance on its step, where no `implied_by` could ever reach it. */
    var STRAND_EXPECTED = {
      /* pwr_heatup [cold_shutdown] */
      'pwr_heatup:2:pump_flow_pct': 'rcs_flow',              // > 90 [SOLE]   dead 0.000 vs true 3.867 %
      'pwr_heatup:9:pressure_mpa': 'primary_pressure',       // > 4.585       dead 0.000 vs true 2.500 MPa
      'pwr_heatup:11:tavg_c': 'tavg',                        // > 283 [SOLE]  dead 30.00 vs true 50.00 degC
      'pwr_heatup:14:pressure_mpa': 'primary_pressure',      // > 15 [SOLE]   dead 0.000 vs true 2.500 MPa
      'pwr_heatup:15:steam_pressure_mpa': 'steam_pressure',  // ~ 7.03        dead 0.000 vs true 0.0124 MPa
      /* pwr_startup [hot_zero_power] */
      'pwr_startup:1:tavg_c': 'tavg',                        // ~ 286 [SOLE]  dead 30.00 vs true 286.3 degC
      'pwr_startup:2:boron_ppm': 'boron_analyzer',           // ~ 719 [SOLE]  dead 0.000 vs true 718.9 ppm
      'pwr_startup:9:power_pct': 'power_range',              // > 0.05        the row #749's relief leans ON
      'pwr_startup:10:power_pct': 'power_range',             // > 0.5 [SOLE]
      'pwr_startup:12:startup_rate_dpm': 'startup_rate',     // ~ 0           dead -5.000 DPM (range floor)
      'pwr_startup:13:power_pct': 'power_range',             // > 5 [SOLE]
      'pwr_startup:14:mwe_output': 'mwe_output',             // > 8 [SOLE]
      /* pwr_raise_power [low_power] */
      'pwr_raise_power:2:mwe_output': 'mwe_output',          // > 8           dead 0.000 vs true 10.00 MWe
      'pwr_raise_power:4:mwe_output': 'mwe_output',          // > 28
      'pwr_raise_power:4:power_pct': 'power_range',          // > 28
      'pwr_raise_power:4:tavg_c': 'tavg',                    // ~ 294.75      dead 30.00 vs true 288.2 degC
      'pwr_raise_power:5:mwe_output': 'mwe_output',          // > 48
      'pwr_raise_power:5:power_pct': 'power_range',          // > 47
      'pwr_raise_power:5:tavg_c': 'tavg',                    // ~ 297
      'pwr_raise_power:6:mwe_output': 'mwe_output',          // > 72
      'pwr_raise_power:6:power_pct': 'power_range',          // > 70
      'pwr_raise_power:6:tavg_c': 'tavg',                    // ~ 300
      'pwr_raise_power:7:mwe_output': 'mwe_output',          // > 86
      'pwr_raise_power:7:tavg_c': 'tavg',                    // ~ 301.5
      'pwr_raise_power:8:mwe_output': 'mwe_output',          // > 97
      'pwr_raise_power:8:tavg_c': 'tavg',                    // ~ 303.2
      'pwr_raise_power:9:power_pct': 'power_range',          // > 96
      'pwr_raise_power:9:tavg_c': 'tavg',                    // ~ 303.2
      'pwr_raise_power:10:mwe_output': 'mwe_output',         // > 97
      'pwr_raise_power:10:tavg_c': 'tavg',                   // ~ 304.4
      'pwr_raise_power:11:mwe_output': 'mwe_output',         // ~ 100
      'pwr_raise_power:12:mwe_output': 'mwe_output',         // > 97 [SOLE]   the #667 shape exactly
      /* pwr_lower_power [hot_full_power] */
      'pwr_lower_power:2:mwe_output': 'mwe_output',          // ~ 75          dead 0.000 vs true 100.0 MWe
      'pwr_lower_power:3:mwe_output': 'mwe_output',          // ~ 75
      'pwr_lower_power:4:mwe_output': 'mwe_output',          // ~ 50
      'pwr_lower_power:5:mwe_output': 'mwe_output',          // ~ 30
      'pwr_lower_power:6:mwe_output': 'mwe_output',          // ~ 15
      /* pwr_cooldown [hot_zero_power] */
      'pwr_cooldown:1:boron_ppm': 'boron_analyzer',          // > 880 [SOLE]  dead 0.000 vs true 718.9 ppm
      'pwr_cooldown:6:spray_flow_pct': 'pzr_spray_flow',     // ~ 50          dead 0.000 %
      'pwr_cooldown:10:spray_flow_pct': 'pzr_spray_flow',    // ~ 50
      /* pwr_tmi2_incident [hot_full_power] */
      'pwr_tmi2_incident:1:power_pct': 'power_range',        // > 90 [SOLE]   dead 0.000 vs true 99.56 %
      'pwr_tmi2_incident:8:porv_tailpipe_temp_c': 'porv_tailpipe_temp', // > 115.56 [SOLE]  dead 0.000 degC
      'pwr_tmi2_incident:12:pzr_level_pct': 'pzr_level',     // >= 99 [SOLE]  dead 0.000 vs true 63.66 %
      'pwr_tmi2_incident:14:sg_level_pct': 'sg_level',       // > 5 [SOLE]    dead 0.000 vs true 98.08 %
      'pwr_tmi2_incident:18:pressure_mpa': 'primary_pressure', // > 5.17      dead 0.000 vs true 14.59 MPa
      'pwr_tmi2_incident:20:pump_flow_pct': 'rcs_flow',      // > 80 [SOLE]   dead 0.000 vs true 100.5 %
      'pwr_tmi2_incident:19:subcooling_c': 'subcooling_margin', // > 5.56 [SOLE] dead -28.000 vs true 23.404 degC (#789)
      /* the three `saw` rows — no `implied_by` can reach a `saw`, so these have no relief at all */
      'pwr_heatup:11:saw:tavg_c': 'tavg',                    // > 150         same channel as the step's acc
      'pwr_startup:10:saw:startup_rate_dpm': 'startup_rate', // > 0           a channel the step's acc does NOT use
      'pwr_tmi2_incident:3:saw:pressure_mpa': 'primary_pressure', // > 16 [SOLE]  the step's only grading
    };
    /* THE OTHER HALF: a row that reads DOWNWARD is not stranded by a dead gauge, it is TICKED by
     * one — the floor satisfies it. Pinned for the same reason, and it is the larger set. */
    var TICK_EXPECTED = {
      'pwr_heatup:15:adv_valve_pct': 1, 'pwr_heatup:17:power_pct': 1,
      'pwr_startup:12:power_pct': 1,
      'pwr_raise_power:9:boron_ppm': 1, 'pwr_raise_power:11:boron_ppm': 1,
      'pwr_lower_power:2:power_pct': 1, 'pwr_lower_power:3:tavg_c': 1,
      'pwr_lower_power:3:power_pct': 1, 'pwr_lower_power:4:power_pct': 1,
      'pwr_lower_power:4:tavg_c': 1, 'pwr_lower_power:5:power_pct': 1,
      'pwr_lower_power:5:tavg_c': 1, 'pwr_lower_power:6:power_pct': 1,
      'pwr_lower_power:6:tavg_c': 1,
      'pwr_shutdown:1:mwe_output': 1, 'pwr_shutdown:2:power_pct': 1, 'pwr_shutdown:3:power_pct': 1,
      'pwr_cooldown:2:pressure_mpa': 1, 'pwr_cooldown:4:tavg_c': 1, 'pwr_cooldown:5:pressure_mpa': 1,
      'pwr_cooldown:6:pressure_mpa': 1, 'pwr_cooldown:8:pressure_mpa': 1,
      'pwr_cooldown:10:pump_flow_pct': 1, 'pwr_cooldown:11:tavg_c': 1,
      'pwr_cooldown:12:spray_flow_pct': 1,
      /* STEP 15 USED TO BE HERE, on `pzr_level_pct < 80` (#788's content pass, 2026-09-19). The
       * entry was the pressurizer level gauge doing a clock's job on the one leg two of the four
       * named casualties can freeze, and it broke in BOTH directions depending on when the player
       * clicked — see the step's own note for the measurement and for why no `implied_by` could
       * reach it (the board carries no second measurement of pressurizer level). It now grades
       * SUBCOOLING MARGIN — see the three rows below, moved here from `skipped` by #789. */
      'pwr_tmi2_incident:5:sg_level_pct': 1,
      'pwr_tmi2_incident:16:pzr_level_pct': 1, 'pwr_tmi2_incident:18:porv_tailpipe_temp_c': 1,
      'pwr_cooldown:4:saw:tavg_c': 1,   // `saw tavg_c < 250` — a dead tavg reads 30.00 and is "seen"
      /* #789 (2026-09-20) — `subcooling_margin` went from UNBREAKABLE (silent no-op, skipped)
       * to directly failable, so these three `<=` rows now measure like every other channel: a
       * `dead` reading pins at the range floor (-28.000 degC, -50.4 degF of margin — a
       * DIFFERENCE, so no +32 offset), which satisfies all three `<=` thresholds on a plant that
       * is really at a healthy +23.4 degC (+42.1 degF) of margin. FALSE-TICKS, not strands —
       * step 19's `> 5.56` is the one direction a pinned-low floor can never clear, so it
       * strands instead (STRAND_EXPECTED above). */
      'pwr_tmi2_incident:13:subcooling_c': 1, 'pwr_tmi2_incident:15:subcooling_c': 1,
      'pwr_tmi2_incident:17:subcooling_c': 1,
    };
    /* ⚰ THE FOUR `startup_rate_dpm` ROWS LEFT THIS SET WITH THE ROWS THEMSELVES (#796 item 3,
     * 2026-09-20): the 1/M rungs collapsed to one step per plot point by directive, so there is
     * no rate row on steps 5-8 to be relieved. Their `sr_counts_cps` siblings stay, still
     * relieved off-channel by `overtaken: sr_energized`. */
    var RELIEVED_EXPECTED = {
      'pwr_startup:5:sr_counts_cps': 1,
      'pwr_startup:6:sr_counts_cps': 1,
      'pwr_startup:7:sr_counts_cps': 1,
      'pwr_startup:8:sr_counts_cps': 1,
      'pwr_startup:9:ir_amps': 1,
    };

    function diffSet(got, want) {
      var extra = got.filter(function (k) { return !want[k]; });
      var gone = Object.keys(want).filter(function (k) { return got.indexOf(k) < 0; });
      return { ok: extra.length === 0 && gone.length === 0,
        note: (extra.length ? 'UNPINNED: ' + extra.join(', ') + '. ' : '') +
              (gone.length ? 'PINNED BUT NOT SEEN: ' + gone.join(', ') + '. ' : '') };
    }
    var sKeys = strand.map(function (r) { return r.key; });
    var dS = diffSet(sKeys, STRAND_EXPECTED);
    ck('2ae.2 the MEASURED stranding set is exactly the pinned one (#773)', dS.ok,
       dS.note + sKeys.length + ' row(s) read met:false under a dead channel at their own leg IC, ' +
       strand.filter(function (r) { return r.sole && !r.isSaw; }).length + ' of them the only row of their step, ' +
       strand.filter(function (r) { return r.isSaw; }).length + ' of them a `saw` row');

    var dT = diffSet(ticks.map(function (r) { return r.key; }), TICK_EXPECTED);
    /* the worst of them by the gap between the dead reading and the truth it is lying about —
     * picked by measurement rather than by naming a row, so the example cannot go stale */
    var worst = ticks.slice().sort(function (x, y) {
      return Math.abs(Number(y.truth) - Number(y.read)) - Math.abs(Number(x.truth) - Number(x.read));
    })[0];
    ck('2ae.4 the rows a dead gauge TICKS instead of stranding are exactly the pinned ones (#773)', dT.ok,
       dT.note + ticks.length + ' row(s); worst gap ' + (worst ? worst.key + ' reads ' +
         Number(worst.read).toPrecision(4) + ' dead against a true ' +
         Number(worst.truth).toPrecision(4) : 'none'));

    var dR = diffSet(relieved.map(function (x) { return x.split(' ')[0]; }), RELIEVED_EXPECTED);
    ck('2ae.5 the rows the author already relieved are exactly the pinned ones, and the relief is off-channel (#773)',
       dR.ok && skipped.length === 0,   // was 4 (the subcooling_margin rows) until #789 made the channel breakable
       dR.note + relieved.length + ' relieved (' + relieved.join('; ') + '); ' +
       skipped.length + ' row(s) skipped on an unbreakable channel');

    /* AND THE OVERTAKEN RELIEF SURVIVES THE INJECTION, which is the whole of its claim: the
     * eight 1/M rows lean on `sr_energized`, and if that were graded on the same broken channel
     * the relief would be decoration. MEASURED both ways at `hot_zero_power`. */
    (function () {
      var h = snapHealthy('hot_zero_power'), d = snapDead('hot_zero_power', 'source_range');
      var pred = { p: 'sr_energized', op: '<', v: 1 };
      var gh = grader._grade(h, pred), gd = grader._grade(d, pred);
      ck('2ae.6 the 1/M steps’ `overtaken` reads true_state, so a dead SOURCE RANGE cannot take it too (#773)',
         gh.graded_by === 'true_state' && gd.graded_by === 'true_state' &&
         gh.value === gd.value && gd.met === false,
         'sr_energized ' + gh.value + ' healthy / ' + gd.value + ' with SOURCE RANGE dead (' +
         d.instruments.source_range + ' cps published), graded_by ' + gd.graded_by);
    })();
  })();

  /* 2af. AN OBSERVATION STEP GRADED ON A QUANTITY THE PLANT CAN LOSE (#667 item 1, 2026-09-19).
   *
   * An OBSERVATION-kind step is one that authors no operator action — no `cmd`, and no cmd-kind
   * `accs` entry (`instructor_layer.js`, "THE TEST IS DOES THE STEP AUTHOR AN OPERATOR ACTION").
   * Nobody presses anything on it; it stands until the plant says the thing it asks the player
   * to confirm is true. So when it grades a LIVE QUANTITY rather than a mode or a lineup fact,
   * and the plant loses that quantity after the leg was authored, the step is unsatisfiable with
   * nothing to press — a silent lock with no button, which is what makes it different from the
   * dead-gauge class above.
   *
   * THE WORKED INSTANCE, already fixed (`6075748f`): `pwr_raise_power`'s opening confirm graded
   * `mwe_output > 5`, so a player arriving with the turbine tripped sat on step 1 for ever. It
   * grades `plant_mode` now — a MODE fact, which the plant does not take away while the leg
   * runs.
   *
   * THE DISCRIMINATOR IS MEASURED, NOT LISTED, and that is deliberate — a hand-kept list of
   * "losable parameters" would be a gate that tests its own map. Each row is graded on a live
   * broadcast at the leg's own `from` and the LAYER is asked what it read it off:
   *   `control_state` / `rps_state` -> the operator's own switch or block position, a LINEUP
   *       fact, which nothing but the operator changes (1 row: `pwr_startup` 3, SG FEED AUTO).
   *   `instrument` -> a gauge reading the PLANT drives. Losable by construction: every one of
   *       these is a number the plant is free to walk away from (16 steps below).
   *   `true_state` -> the grey band, and it is genuinely mixed: `plant_mode`, `scrammed` and
   *       `turbine_tripped` are mode/latched facts while `letdown_flow_actual`,
   *       `accumulator_volume_pct` and `rcp_cavitating` are quantities. Pinned as a set rather
   *       than adjudicated here, so a new one lands in front of a reader (16 rows below).
   *
   * WHAT THE CHECK ASSERTS. (1) The set of observation steps grading a live quantity is exactly
   * the pinned one, so a new one cannot join unnoticed. (2) Every one of them carries a `why` —
   * the expandable paragraph that tells the player what to do when the confirmation does not
   * verify, which is the only thing standing between them and a dark Continue. MEASURED on the
   * built pool today: 31 graded observation-kind steps, 16 of them with at least one
   * instrument-graded row, and ALL 31 already carry a `why`. So check 2af.2 is green on arrival
   * and is a RATCHET, not a discovery — which is exactly why it is proven by injection below
   * rather than by its own pass.
   *
   * INJECTION — each made to FAIL deliberately and restored, 2026-09-19:
   *   · delete the `why` line from `pwr_raise_power` step 9 in ui/manual_procedures.js
   *                                                          -> 2af.2 red, "NO `why`:
   *                                                             pwr_raise_power:9"
   *   · delete `'pwr_cooldown:8'` from LIVE_QUANTITY_EXPECTED -> 2af.1 red, "UNPINNED:
   *                                                             pwr_cooldown:8"
   *   · delete `'pwr_tmi2_incident:9'` from TRUE_STATE_EXPECTED -> 2af.3 red, "UNPINNED:
   *                                                             pwr_tmi2_incident:9" */
  (function () {
    var grader = Object.create(RD.InstructorLayer.prototype);
    var snaps = {};
    function snapOf(from) {
      if (snaps[from]) return snaps[from];
      var svc = mkSvc(from); var s = null;
      for (var i = 0; i < 30; i++) s = svc.tick();
      return (snaps[from] = s);
    }

    var LIVE_QUANTITY_EXPECTED = {
      'pwr_heatup:11': 'tavg_c',                              // "wait until AVG COOLANT reaches 542 degF"
      'pwr_heatup:15': 'adv_valve_pct,steam_pressure_mpa',    // the Hot Standby confirm
      'pwr_heatup:17': 'power_pct',
      'pwr_startup:1': 'tavg_c',
      'pwr_startup:12': 'power_pct,startup_rate_dpm',
      'pwr_raise_power:9': 'power_pct,boron_ppm,tavg_c',
      'pwr_raise_power:12': 'mwe_output',                     // the #667 shape, one leg later
      'pwr_cooldown:8': 'pressure_mpa',
      'pwr_tmi2_incident:1': 'power_pct',
      'pwr_tmi2_incident:3': 'pressure_mpa',                  // a `saw` row, not an `acc`
      'pwr_tmi2_incident:5': 'sg_level_pct',
      'pwr_tmi2_incident:8': 'porv_tailpipe_temp_c',
      'pwr_tmi2_incident:12': 'pzr_level_pct',
      'pwr_tmi2_incident:13': 'subcooling_c',
      'pwr_tmi2_incident:16': 'pzr_level_pct',
      'pwr_tmi2_incident:17': 'subcooling_c',
    };
    var TRUE_STATE_EXPECTED = {
      'pwr_heatup:1': 'plant_mode', 'pwr_heatup:4': 'turbine_tripped',
      'pwr_heatup:6': 'steam_dump_valve_pct', 'pwr_heatup:12': 'rhr_active,letdown_flow_actual',
      'pwr_heatup:15': 'plant_mode', 'pwr_heatup:16': 'reactivity_pcm',
      'pwr_startup:11': 'sr_energized', 'pwr_startup:17': 'plant_mode',
      'pwr_raise_power:1': 'plant_mode',
      'pwr_cooldown:13': 'plant_mode', 'pwr_cooldown:14': 'accumulator_volume_pct',
      'pwr_cooldown:15': 'rhr_valve_open',
      'pwr_tmi2_incident:4': 'turbine_tripped', 'pwr_tmi2_incident:7': 'scrammed',
      'pwr_tmi2_incident:9': 'hpi_active', 'pwr_tmi2_incident:13': 'rcp_cavitating',
    };

    var live = {}, ts = {}, lineup = {}, nObs = 0, noWhy = [];
    POOL.forEach(function (proc) {
      (proc.steps || []).forEach(function (st, idx) {
        var accs = (st.accs && st.accs.length) ? st.accs : (st.acc ? [st.acc] : []);
        if (st.cmd || accs.some(function (e) { return e && e.cmd; })) return;   // an ACTION step
        var preds = accs.filter(function (e) { return e && e.p; });
        if (st.saw) preds = preds.concat([st.saw]);
        if (!preds.length) return;      // a pure dwell observation — nothing graded, nothing to lose
        nObs++;
        var s = snapOf(proc.from), key = proc.id + ':' + (idx + 1), bins = {};
        preds.forEach(function (e) {
          var by = grader._grade(s, e).graded_by;
          (bins[by] = bins[by] || []).push(e.p);
        });
        if (bins.instrument) {
          /* de-duplicated: `pwr_heatup` 11 grades tavg_c in both `acc` and `saw` */
          var ps = bins.instrument.filter(function (p, i) { return bins.instrument.indexOf(p) === i; });
          live[key] = ps.join(',');
          if (!st.why) noWhy.push(key);
        }
        if (bins.true_state) ts[key] = bins.true_state.join(',');
        if (bins.control_state || bins.rps_state) {
          lineup[key] = (bins.control_state || []).concat(bins.rps_state || []).join(',');
        }
      });
    });

    function cmpMap(got, want) {
      var gk = Object.keys(got), wk = Object.keys(want);
      var extra = gk.filter(function (k) { return want[k] === undefined; });
      var gone = wk.filter(function (k) { return got[k] === undefined; });
      var moved = gk.filter(function (k) { return want[k] !== undefined && want[k] !== got[k]; })
                    .map(function (k) { return k + ' now grades ' + got[k] + ' (pinned ' + want[k] + ')'; });
      return { ok: !extra.length && !gone.length && !moved.length,
        note: (extra.length ? 'UNPINNED: ' + extra.join(', ') + '. ' : '') +
              (gone.length ? 'PINNED BUT NOT SEEN: ' + gone.join(', ') + '. ' : '') +
              (moved.length ? 'CHANGED: ' + moved.join('; ') + '. ' : '') };
    }

    var dL = cmpMap(live, LIVE_QUANTITY_EXPECTED);
    ck('2af.1 the observation steps graded on a LIVE QUANTITY are exactly the pinned set (#667 item 1)',
       dL.ok, dL.note + Object.keys(live).length + ' of ' + nObs +
       ' graded observation-kind steps grade at least one instrument row; ' +
       Object.keys(lineup).length + ' grade a lineup fact, ' + Object.keys(ts).length +
       ' a true_state field');

    ck('2af.2 every observation step graded on a live quantity carries a `why` for when it does not verify (#667 item 1)',
       noWhy.length === 0,
       noWhy.length ? 'NO `why`: ' + noWhy.join(', ')
         : 'all ' + Object.keys(live).length + ' carry one (e.g. pwr_raise_power step 12, the #667 shape)');

    var dTS = cmpMap(ts, TRUE_STATE_EXPECTED);
    ck('2af.3 the true_state-graded observation rows — the grey band — are the pinned set (#667 item 1)',
       dTS.ok, dTS.note + Object.keys(ts).length + ' row(s), mode/latched facts and quantities mixed');
  })();

  /* 2ag. THE MODE AUTHORED PLAY ACTUALLY INJECTS (#788, the follow-up §2ae owed, 2026-09-19).
   *
   * §2ae swept `dead` across the whole pool and pinned 49 stranding rows and 30 false-ticking
   * ones. THE OWNER THEN ASKED THE QUESTION THAT SECTION DOES NOT ANSWER — "why would a gauge
   * break?" — and the answer is that on this plant NOTHING breaks a gauge by itself. There are
   * exactly FOUR named instrument casualties (`pwr_control.js` protection.failures), and NOT ONE
   * of them is `dead`:
   *
   *   porv_indicator_stuck_closed  porv_indicator  stuck @ 'closed'   <- a WALKTHROUGH injects it
   *   tavg_sensor_failure          tavg            drift  @ 0.5 degC/s (the layer default)
   *   pzr_level_sensor_stuck       pzr_level       stuck  @ the reading at injection
   *   pzr_level_sensor_low         pzr_level       stuck  @ 20.0 %
   *
   * `dead` is reachable ONLY from the advanced Failures panel, where the player picks a channel
   * and a mode by hand. So §2ae measured the mode a player has to go out of their way to select
   * and left the modes authored content injects unmeasured. This section closes that.
   *
   * THE MODE CHANGES THE ANSWER, AND IT IS NOT A DETAIL. `dead` rails at the channel's RANGE
   * FLOOR, which is why §2ae's split fell along the direction of the comparison. The two modes
   * here do not:
   *   · `stuck` freezes at ONE value for all time (`pwr_instruments._applyFailure`: `case
   *     'stuck': return f.value;` — no plant input at all), so the row's verdict is a PROPERTY
   *     OF THAT VALUE and is fixed from the injection onward. It breaks a row in EITHER
   *     direction, and which direction depends on WHEN the player clicked.
   *   · `drift` returns `trueVal + offset` with the offset growing at 0.5 degC/s without bound,
   *     so the reading MONOTONICALLY LEAVES every threshold: a `>` row false-ticks and stays
   *     ticked, a `<` row strands and stays stranded, and a `~ v +/- tol` row does BOTH — it
   *     false-ticks on the way through and strands once it is past. That third shape does not
   *     exist under `dead` at all.
   *
   * WHAT WAS MEASURED (full stack, seed 7, each leg at its own `from`, one injection per boot):
   *
   *   porv_indicator_stuck_closed — BREAKS NOTHING. No pool acceptance row grades that channel
   *       (check 2ag.2 asks the LAYER, it does not read a list), and an A/B at `hot_full_power`
   *       with the TMI-2 leg's own anticipatory-trip + loss-of-feedwater + stuck PORV running
   *       moves NOT ONE of the 88 instrument channels and flips NO acceptance verdict among all
   *       91 swept rows. The one honest tell the leg grades — `porv_tailpipe_temp_c` on step 8
   *       — is a DIFFERENT channel and reads 250.00 degC (482.0 degF) both ways. The control
   *       that proves the injection landed is taken at the LIFT, where the lamp still reads
   *       `open`: see check 2ag.2's own note. The walkthrough's authored failure is clean.
   *
   *   tavg_sensor_failure — STRANDS FIVE ROWS AND FALSE-TICKS EIGHT, of the 17 the pool grades
   *       on that channel, across four legs. NONE of the thirteen has an `implied_by` or an
   *       `overtaken` (the pool carries exactly one of the former and six of the latter, all
   *       elsewhere), so every strand is a hard lock with no relief.
   *       MEASURED at `hot_full_power`: 30 ticks after the injection the gauge reads 311.24 degC
   *       (592.2 degF) against a true 297.99 degC, and `pwr_lower_power` steps 3 and 4 — whose
   *       criteria the plant has ALREADY met — read `met:false` and can never read anything
   *       else. At `cold_shutdown` it is the other way: after 600 ticks the gauge reads 348.01
   *       degC (658.4 degF) on a plant that is truly 50.01 degC (122.0 degF), so `pwr_heatup`
   *       step 11 — "Mode 3, Hot Standby reached" — ticks off on a COLD plant.
   *
   * THE CONTENT PASS ON WHAT THIS SECTION MEASURED (2026-09-19, #773/#788). Sixteen rows, and
   * ONE of them had an honest relief available. The adjudication, so it is not re-opened blind:
   *   · `pwr_tmi2_incident` 15 — FIXED, and by moving the row rather than covering it. Its
   *     `pzr_level_pct < 80` entry was a WAIT GATE: the step's own note said so ("what makes the
   *     player wait rather than securing the pumps at ten minutes"). The cue that decides this
   *     action is loss of subcooling, not pressurizer level, so the entry is now SUBCOOLING
   *     MARGIN at the bottom of its scale — a channel no named casualty can freeze. 2ag.8.
   *   · `pwr_tmi2_incident` 12 and 16 — LEFT, and the reason is the board rather than the author.
   *     Both are SOLE rows on the gauge that IS their subject ("verify PRESSURIZER LEVEL has gone
   *     to the top of its scale"; "verify it is falling below 50 %"), and MEASURED on a live
   *     broadcast only two of the 88 channels carry pressurizer level — `pzr_level` and
   *     `pzr_level_dev`, and `pwr_instruments._levelDev` builds the second out of the first
   *     READING, so both die together. An `implied_by` needs a sibling whose own threshold
   *     ARITHMETICALLY answers the covered row (the 2ad.2 standard); nothing on this board
   *     computes pressurizer liquid volume, so every candidate would be a correlation. Worse, a
   *     covering row that implies the covered one is necessarily met at or BEFORE it, and every
   *     independent channel here is met FIRST — measured on the authored replay, the level pegs
   *     at t = 220 s with the subcooling margin already at zero since t = 170 s and the tailpipe
   *     on its 250 degC rail since t = 120 s — so the relief would tick the deception step off
   *     before the deception appeared, which is #749's defect inverted.
   *   · the five `tavg_c` rows — LEFT. `tavg_c` IS `(thot_c + tcold_c)/2` exactly
   *     (`pwr2_sg.primaryTavg`), and tcold <= thot, so `thot_c < V` implies `tavg_c < V` by
   *     arithmetic — the one real implication in this family. It is unusable: THOT runs half a
   *     leg delta-T ABOVE Tavg, so a `thot_c < V` row at the same threshold is FALSE on the
   *     authored route and would red the replay. MEASURED on `pwr_lower_power` 4, whose row is
   *     `tavg_c < 298.1`: the authored route settles Tavg at 295.76 degC (564.4 degF) with the
   *     leg split near 10.3 degC at full power, so THOT is about 300.9 degC. The two-sided
   *     bound that would work (`tcold_c < 298.1 - 10.3`) needs a SECOND row, and `implied_by`
   *     names one sibling and does not chain. `pwr_startup` 1 and `pwr_heatup` 11 are SOLE rows
   *     besides, where no `implied_by` can reach at all.
   * WHAT WOULD ACTUALLY CLOSE THE REMAINING SEVEN is not an implication: it is a declared relief
   * keyed on the casualty itself, which 2ag.7 measured is already published by name in
   * `snapshot.active_failures` for all four. That is a mechanism change and owes a ruling.
   *
   *   pzr_level_sensor_low — STRANDS THE TMI-2 DECEPTION STEP. Step 12 is the one that teaches
   *       A4, level is not inventory: `pzr_level_pct >= 99`, the step's ONLY acceptance. Frozen
   *       at 20.0 % the gauge can never say 99, and MEASURED on the driven leg the plant's own
   *       truth goes past 99 while the gauge sits at 20.0. The same freeze false-ticks steps 15
   *       and 16, which ask for the level to come back DOWN.
   *
   *   pzr_level_sensor_stuck — the same three rows, and WHICH of them breaks is decided by the
   *       moment of the click: frozen at the pre-accident 62 % it strands 12 and 16; frozen
   *       while the gauge is pegged it strands 15 and 16 instead. That is the `stuck`-vs-`dead`
   *       difference in one row: `dead` reads 0.0 % and TICKS both 15 and 16 (§2ae pins them in
   *       TICK_EXPECTED); the same two rows STRAND under a stuck gauge pegged high.
   *
   * AND ONE DEFECT IN THE FAILURE MODEL ITSELF, found on the way (2ag.6) and FIXED at #791
   * (2026-09-20): `drift` and `stuck` used to return out of `_applyFailure` AFTER the range
   * clip, unclipped, so a drifting Tavg walked straight out of its own transmitter span.
   * MEASURED at `hot_zero_power`, 600 ticks in, before the fix: 583.86 degC (1082.9 degF) on a
   * channel declared [30, 343] degC (86-649 degF) — 240.86 degC (433.5 degF) past the top of
   * the instrument. `dead` and `noisy` were ALREADY clipped in the same switch, so this was an
   * inconsistency inside one function rather than a design position. Was pinned as a canary,
   * not blessed — it reddened exactly as documented when #791 clipped the return, and this is
   * that reading: 2ag.6 now asserts the FIXED invariant, that `drift` pegs at the same span
   * `dead` does.
   *
   * TWO HOLLOW SHAPES CAUGHT WHILE BUILDING THIS, both of which produced confident wrong
   * answers before they were caught, and both of which the checks below are written to avoid:
   *   · A HAND-BUILT SNAPSHOT GRADES `true_state`, NOT THE INSTRUMENT. `readParam` picks the
   *     channel map off `snapshot.metadata.plant_id`; a `{instruments:{pzr_level:20}}` object
   *     with no metadata falls through to `true_state[p]`, which is undefined, so EVERY row
   *     reads `met:false` — a sweep that reports the whole pool stranded. Measured both ways in
   *     2ag.0. Every grade below is taken off a REAL broadcast with a REAL injection.
   *   · `svc.tick()` RETURNS ONE MUTABLE SNAPSHOT, REUSED. Holding `sA = tick()` and comparing
   *     it to `sB` 570 ticks later compares the object with itself: the first reading of a
   *     drift sweep came back identical to the last, at 348.009 both times. Hold VERDICTS, not
   *     the object — which is what the marks array below does.
   *
   * INJECTION — every check driven red by a separate mutation, restored, and re-run clean
   * (2026-09-19; ten mutations, each reddening EXACTLY ONE check and no other). What printed:
   *   · 2ag.0's own `metadata: w.snap.metadata` -> `metadata: null`  -> red, "with metadata ->
   *     true_state/met false (value undefined)" — i.e. the check does discriminate the two reads
   *   · drop `pzr_level_sensor_low` from NAMED_EXPECTED -> 2ag.1 red, "UNPINNED:
   *     pzr_level_sensor_low. 4 instrument-type failure(s)"
   *   · pin its mode as `dead` instead of `stuck`     -> 2ag.1 red, "MISMATCH
   *     pzr_level_sensor_low: pinned pzr_level|dead|20, built pzr_level|stuck|20"
   *   · point 2ag.2's channel at `pzr_level`          -> 2ag.2 red, "3 pool row(s) grade it:
   *     pwr_tmi2_incident:12/15/16:pzr_level_pct" (TWO since the 2026-09-19 content pass moved
   *     step 15's entry off the channel — steps 12 and 16 are what is left)
   *   · delete `'pwr_lower_power:3:tavg_c'` from DRIFT_STRAND -> 2ag.3 red, "UNPINNED:
   *     pwr_lower_power:3:tavg_c. 5 row(s) strand, 8 false-tick, of 17 graded on the channel"
   *   · delete `'pwr_heatup:11:tavg_c'` from DRIFT_TICK      -> 2ag.3 red, "UNPINNED:
   *     pwr_heatup:11:tavg_c"
   *   · add step 15 to LOW_STRAND                     -> 2ag.4 red, "PINNED BUT NOT SEEN:
   *     pwr_tmi2_incident:15:pzr_level_pct"
   *   · 2ag.5's late injection delay 150 -> 0 ticks   -> 2ag.5 red, both legs report "clicked at
   *     61.55 %" and the two verdict sets stop differing — the check is measuring the DELAY
   *   · CLIP the drift return in `pwr_instruments._applyFailure` to `spec.range` (the fix this
   *     canary was waiting for) -> 2ag.6 red, "tavg drifts to 343.00 degC (649 degF) … 0.00
   *     degC (0.0 degF) past the top". 2ag.3 STAYED GREEN under that fix, which is its own
   *     finding: pegging the gauge at 343 degC does not change one strand or false-tick
   *     verdict, so the unclipped reading was a BOARD defect and not the cause of the thirteen
   *     broken rows. THIS IS NO LONGER A HYPOTHETICAL MUTATION: #791 (2026-09-20) shipped
   *     exactly this clip, 2ag.6 reddened exactly as predicted, and is rewritten below to
   *     assert the fixed invariant instead of the defect. 2ag.3 is unchanged, confirming the
   *     prediction that the thirteen rows are untouched by it.
   *   · send 2ag.7's panel probe through `inject_failure` instead -> 2ag.7 red
   * Baseline before the mutations and after the restore: 0 red both times. */
  (function () {
    var grader = Object.create(RD.InstructorLayer.prototype);

    /* the param -> channel map, scanned the way §2a and §2ae scan it (module-private) */
    var isrc = fs.readFileSync(path.join(ROOT, 'layers', 'instructor_layer.js'), 'utf8');
    var pmm = /\n    pwr2:\s*\{([\s\S]*?)\n    \},/.exec(isrc);
    var MAP = {};
    (pmm ? pmm[1] : '').replace(/([a-z_0-9]+)\s*:\s*'([a-z_0-9]+)'/g,
      function (_, p, id) { MAP[p] = id; return ''; });

    /* the rows — `accs` when present else `acc`, plus `saw`, exactly §2ae's set */
    var rows = [];
    POOL.forEach(function (proc) {
      (proc.steps || []).forEach(function (st, idx) {
        var accs = (st.accs && st.accs.length) ? st.accs : (st.acc ? [st.acc] : []);
        var preds = accs.filter(function (e) { return e && e.p; });
        if (st.saw && st.saw.p && MAP[st.saw.p]) {
          rows.push({ key: proc.id + ':' + (idx + 1) + ':saw:' + st.saw.p, from: proc.from,
                      en: st.saw, chan: MAP[st.saw.p], sole: !preds.length, isSaw: true });
        }
        preds.forEach(function (en) {
          if (!MAP[en.p]) return;
          rows.push({ key: proc.id + ':' + (idx + 1) + ':' + en.p, from: proc.from,
                      en: en, chan: MAP[en.p], sole: preds.length === 1, isSaw: false });
        });
      });
    });
    function truthMet(s, en) {
      return grader._predMet(s.true_state ? s.true_state[en.p] : undefined, en);
    }
    function boot(ic, accel) {
      var svc = new RD.SimulationService({ seed: 7 });
      svc.selectPlant('pwr2', ic, null, undefined);
      svc.running = true; svc.timeAcceleration = accel || 10; svc.attentionStops = false;
      var s = null; for (var i = 0; i < 20; i++) s = svc.tick();
      return { svc: svc, snap: s };
    }
    function diffSet(got, want) {
      var extra = got.filter(function (k) { return !want[k]; });
      var gone = Object.keys(want).filter(function (k) { return got.indexOf(k) < 0; });
      return { ok: extra.length === 0 && gone.length === 0,
        note: (extra.length ? 'UNPINNED: ' + extra.join(', ') + '. ' : '') +
              (gone.length ? 'PINNED BUT NOT SEEN: ' + gone.join(', ') + '. ' : '') };
    }

    /* --- 2ag.0 THE GRADER NEEDS `metadata.plant_id` — the hollow shape, asserted so the next
     * agent cannot rebuild the sweep on a hand-made snapshot and get a pool-wide false red. */
    (function () {
      var w = boot('hot_full_power');
      var en = { p: 'pzr_level_pct', op: '<', v: 50 };
      var bare = grader._grade({ instruments: { pzr_level: 20 }, true_state: {} }, en);
      var real = grader._grade({ instruments: { pzr_level: 20 }, true_state: {},
                                 metadata: w.snap.metadata }, en);
      ck('2ag.0 a snapshot with no `metadata.plant_id` grades true_state, not the instrument (#788)',
         bare.graded_by === 'true_state' && bare.met === false &&
         real.graded_by === 'instrument' && real.met === true,
         'bare -> ' + bare.graded_by + '/met ' + bare.met + ', with metadata -> ' +
         real.graded_by + '/met ' + real.met + ' (value ' + real.value + ')');
    })();

    /* --- 2ag.1 the four named instrument casualties, and not one of them is `dead` */
    var NAMED_EXPECTED = {
      porv_indicator_stuck_closed: 'porv_indicator|stuck|closed',
      tavg_sensor_failure:         'tavg|drift|-',
      pzr_level_sensor_stuck:      'pzr_level|stuck|-',
      pzr_level_sensor_low:        'pzr_level|stuck|20',
    };
    (function () {
      var DEFS = (RD.PWR_CONFIG.protection && RD.PWR_CONFIG.protection.failures) || {};
      var built = {}, bad = [];
      Object.keys(DEFS).forEach(function (id) {
        var d = DEFS[id]; if (!d || d.type !== 'instrument') return;
        built[id] = d.instrument_id + '|' + d.mode + '|' +
          (d.stuck_value === undefined ? '-' : String(d.stuck_value));
      });
      var d = diffSet(Object.keys(built), NAMED_EXPECTED);
      Object.keys(NAMED_EXPECTED).forEach(function (id) {
        if (built[id] && built[id] !== NAMED_EXPECTED[id]) {
          bad.push('MISMATCH ' + id + ': pinned ' + NAMED_EXPECTED[id] + ', built ' + built[id]);
        }
      });
      var anyDead = Object.keys(built).filter(function (id) { return /\|dead\|/.test(built[id]); });
      ck('2ag.1 the named instrument casualties are the pinned four, and NONE of them is `dead` (#788)',
         d.ok && bad.length === 0 && anyDead.length === 0,
         d.note + (bad.length ? bad.join('; ') + '. ' : '') +
         (anyDead.length ? 'DEAD: ' + anyDead.join(', ') + '. ' : '') +
         Object.keys(built).length + ' instrument-type failure(s); `dead` is panel-only');
    })();

    /* --- 2ag.2 the one the WALKTHROUGH injects breaks nothing. THREE claims, because any two
     * of them are hollow on their own: no row grades the channel (asked of the LAYER, not of a
     * list); the injection moves nothing else; and THE INJECTION LANDED AT ALL, which is the
     * control an absence check owes. The control is the awkward one and it is worth reading:
     * healthy, the lamp reads `open` for about a second after the valve lifts and then goes
     * dark on its own as the solenoid de-energizes — MEASURED at `hot_full_power` with the
     * leg's own anticipatory-trip failure in, `open` at t+5.0 s and `closed` from t+6.0 s over
     * a valve that is truly open for the rest of the ride. So the deception is already there
     * without the casualty, and the ONLY window in which the injection changes the lamp is that
     * first second. The control injects inside it; the sweep uses the authored moment. */
    (function () {
      var graded = rows.filter(function (r) { return r.chan === 'porv_indicator'; });
      function lampAtLift(inject) {
        var w = boot('hot_full_power', 10), s = w.snap, i;
        w.svc.handleCommand({ action: 'inject_failure', failure_id: 'anticipatory_trip_failure' });
        for (i = 0; i < 10; i++) s = w.svc.tick();
        w.svc.handleCommand({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
        w.svc.handleCommand({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
        if (inject) w.svc.handleCommand({ action: 'inject_failure', failure_id: 'porv_indicator_stuck_closed' });
        var lamp = null;
        for (i = 0; i < 8; i++) {
          s = w.svc.tick();
          if (s.true_state.porv_open && lamp === null) lamp = s.instruments.porv_indicator;
        }
        return lamp;
      }
      var lampH = lampAtLift(false), lampF = lampAtLift(true);
      function run(inject) {
        var w = boot('hot_full_power', 60), s = w.snap, i;
        w.svc.handleCommand({ action: 'inject_failure', failure_id: 'anticipatory_trip_failure' });
        w.svc.handleCommand({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
        w.svc.handleCommand({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
        for (i = 0; i < 20; i++) s = w.svc.tick();
        if (inject) w.svc.handleCommand({ action: 'inject_failure', failure_id: 'porv_indicator_stuck_closed' });
        var v = {};
        for (i = 0; i < 300; i++) s = w.svc.tick();
        rows.forEach(function (r) { v[r.key] = grader._grade(s, r.en).met; });
        var ins = {}; Object.keys(s.instruments).forEach(function (k) { ins[k] = s.instruments[k]; });
        return { v: v, ins: ins, open: s.true_state.porv_open, tail: s.instruments.porv_tailpipe_temp };
      }
      var a = run(false), b = run(true);
      var moved = Object.keys(a.ins).filter(function (k) {
        var x = a.ins[k], y = b.ins[k];
        return (typeof x === 'number' && typeof y === 'number') ? Math.abs(x - y) > 1e-9 : x !== y;
      });
      var flipped = rows.filter(function (r) { return a.v[r.key] !== b.v[r.key]; })
                        .map(function (r) { return r.key; });
      ck('2ag.2 the TMI-2 leg\u2019s OWN porv_indicator_stuck_closed strands and false-ticks nothing (#788)',
         graded.length === 0 && moved.length === 0 && flipped.length === 0 &&
         lampH === 'open' && lampF === 'closed' && a.open === true,
         (graded.length ? graded.length + ' pool row(s) grade it: ' +
            graded.map(function (r) { return r.key; }).join(', ') + '. ' : 'no pool row grades it; ') +
         (moved.length ? moved.length + ' channel(s) differ: ' + moved.slice(0, 6).join(', ') + '. '
                       : 'no channel of ' + Object.keys(a.ins).length + ' differs; ') +
         (flipped.length ? 'FLIPPED: ' + flipped.join(', ') + '. '
                         : 'none of ' + rows.length + ' rows flips; ') +
         'CONTROL: at the lift the lamp reads ' + JSON.stringify(lampH) + ' healthy / ' +
         JSON.stringify(lampF) + ' injected, valve truly open ' + a.open +
         ', and the honest tell PORV TAILPIPE reads ' + Number(a.tail).toFixed(2) + ' degC both ways');
    })();

    /* --- the drift sweep. ONE boot per leg; verdicts are HELD at each mark, never the
     * snapshot (see the header's second hollow shape). A row is a STRAND at a mark when the
     * plant's own truth satisfies it and the gauge refuses, and a FALSE-TICK when the gauge
     * satisfies it and the truth does not — the two are not exclusive across marks, and the
     * `~ v +/- tol` rows are exactly the ones that are both. */
    var DRIFT_STRAND = {
      /* the gauge refuses a criterion the plant has already met */
      'pwr_startup:1:tavg_c': 1,                               // ~286 +/-8  [SOLE]
      'pwr_lower_power:3:tavg_c': 1, 'pwr_lower_power:4:tavg_c': 1,
      'pwr_lower_power:5:tavg_c': 1, 'pwr_lower_power:6:tavg_c': 1,
    };
    var DRIFT_TICK = {
      /* the gauge satisfies a criterion the plant has NOT met */
      'pwr_heatup:11:saw:tavg_c': 1, 'pwr_heatup:11:tavg_c': 1,
      'pwr_raise_power:4:tavg_c': 1, 'pwr_raise_power:5:tavg_c': 1,
      'pwr_raise_power:6:tavg_c': 1, 'pwr_raise_power:7:tavg_c': 1,
      'pwr_raise_power:8:tavg_c': 1, 'pwr_raise_power:9:tavg_c': 1,
    };
    (function () {
      var legs = {};
      rows.filter(function (r) { return r.chan === 'tavg'; })
          .forEach(function (r) { (legs[r.from] = legs[r.from] || []).push(r); });
      var strand = [], tick = [], readings = [];
      Object.keys(legs).forEach(function (from) {
        var mine = legs[from], w = boot(from), s = w.snap, i, n = 0;
        w.svc.handleCommand({ action: 'inject_failure', failure_id: 'tavg_sensor_failure' });
        var seen = {};
        mine.forEach(function (r) { seen[r.key] = { s: false, t: false }; });
        var MARKS = [30, 120, 300, 600];
        MARKS.forEach(function (m) {
          while (n < m) { s = w.svc.tick(); n++; }
          mine.forEach(function (r) {
            var g = grader._grade(s, r.en).met, tm = truthMet(s, r.en);
            if (!g && tm) seen[r.key].s = true;
            if (g && !tm) seen[r.key].t = true;
          });
        });
        readings.push(from + ' ' + Number(w.snap.instruments.tavg).toFixed(2) + ' -> ' +
                      Number(s.instruments.tavg).toFixed(2) + ' degC on a true ' +
                      Number(s.true_state.tavg_c).toFixed(2));
        mine.forEach(function (r) {
          if (seen[r.key].s) strand.push(r.key);
          if (seen[r.key].t) tick.push(r.key);
        });
      });
      var dS = diffSet(strand, DRIFT_STRAND), dT = diffSet(tick, DRIFT_TICK);
      ck('2ag.3 the DRIFTING Tavg sensor — the pinned strand and false-tick sets (#788)',
         dS.ok && dT.ok,
         dS.note + dT.note + strand.length + ' row(s) strand, ' + tick.length +
         ' false-tick, of ' + rows.filter(function (r) { return r.chan === 'tavg'; }).length +
         ' graded on the channel; ' + readings.join('; '));
    })();

    /* --- the two pzr_level casualties, on the TMI-2 leg DRIVEN by its own injections, so the
     * plant really does go solid and a refusing gauge is a refusal against the plant's own
     * truth rather than against a boot that has not got there yet. Counted per broadcast and in
     * BOTH directions, because a row can be each at different times: `strandN` is the ticks the
     * plant's truth satisfies the row and the gauge refuses; `tickN` the ticks the gauge
     * satisfies it and the truth does not. A single verdict per row would have to pick one.
     * Both are counted against PERSIST below rather than against zero — see the note there. */
    var PERSIST = 10;              // broadcasts of gauge/truth disagreement that is not the lag
    function tmiSweep(fid, delayTicks, ticks) {
      var w = boot('hot_full_power', 60), s = w.snap, i;
      w.svc.handleCommand({ action: 'inject_failure', failure_id: 'anticipatory_trip_failure' });
      for (i = 0; i < 20; i++) s = w.svc.tick();
      w.svc.handleCommand({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
      w.svc.handleCommand({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
      for (i = 0; i < (delayTicks || 0); i++) s = w.svc.tick();
      var froze = s.instruments.pzr_level;
      if (fid) w.svc.handleCommand({ action: 'inject_failure', failure_id: fid });
      var mine = rows.filter(function (r) { return r.chan === 'pzr_level'; });
      var acc = {}; mine.forEach(function (r) { acc[r.key] = { s: 0, t: 0 }; });
      var N = ticks || 300;
      for (i = 0; i < N; i++) {
        s = w.svc.tick();
        mine.forEach(function (r) {
          var g = grader._grade(s, r.en).met, tm = truthMet(s, r.en);
          if (!g && tm) acc[r.key].s++;
          if (g && !tm) acc[r.key].t++;
        });
      }
      /* PERSIST, not `> 0`. A HEALTHY gauge disagrees with the truth for a broadcast or two
       * either side of a crossing — that is the instrument lag, HR1, and it is the plant working.
       * MEASURED on the un-injected rig: 3 broadcasts on step 15 and 1 on step 16, against 259
       * to 290 for the casualty. Anything under PERSIST is the lag straddle, and check 2ag.4's
       * control asserts the un-injected rig stays there so this threshold cannot quietly become
       * the thing that hides a real defect. */
      var strand = [], tick = [], endMet = {};
      mine.forEach(function (r) {
        if (acc[r.key].s >= PERSIST) strand.push(r.key);
        if (acc[r.key].t >= PERSIST) tick.push(r.key);
        endMet[r.key] = grader._grade(s, r.en).met;
      });
      return { strand: strand, tick: tick, froze: froze, endMet: endMet, acc: acc, N: N,
               gauge: s.instruments.pzr_level, truth: s.true_state.pzr_level_pct, rows: mine };
    }

    /* --- 2ag.4 pzr_level_sensor_low: frozen at 20.0 % whatever the plant is doing, so this
     * verdict does not depend on when the player clicked. */
    (function () {
      var LOW_STRAND = { 'pwr_tmi2_incident:12:pzr_level_pct': 1 };
      /* STEP 15 LEFT THIS SET on 2026-09-19 — its `pzr_level_pct < 80` entry is gone, replaced by
       * SUBCOOLING MARGIN at the bottom of its scale (2ag.8 is the measurement). Steps 12 and 16
       * stay: both are SOLE rows on the gauge whose reading is the step's whole subject, and the
       * pool has nothing to relieve them with — see the header's adjudication. */
      var LOW_TICK = { 'pwr_tmi2_incident:16:pzr_level_pct': 1 };
      var base = tmiSweep(null, 0), low = tmiSweep('pzr_level_sensor_low', 0);
      var dS = diffSet(low.strand, LOW_STRAND), dT = diffSet(low.tick, LOW_TICK);
      /* THE CONTROL: on the same rig with nothing injected NO row strands and step 12's
       * criterion is genuinely reached, so the strand above is the casualty and not the rig
       * failing to drive the plant into the deception. */
      var k12 = 'pwr_tmi2_incident:12:pzr_level_pct';
      var worst = Math.max.apply(null, Object.keys(base.acc).map(function (k) {
        return Math.max(base.acc[k].s, base.acc[k].t); }));
      var control = base.strand.length === 0 && base.tick.length === 0 &&
                    base.endMet[k12] === true && worst <= 5;
      ck('2ag.4 pzr_level_sensor_low strands the TMI-2 deception step and false-ticks its reversal (#788)',
         dS.ok && dT.ok && control,
         dS.note + dT.note +
         (control ? 'control: the un-injected rig reaches step 12 and its worst gauge/truth ' +
            'disagreement is ' + worst + ' broadcast(s), the lag. '
                   : 'CONTROL FAILED: un-injected rig strands [' + base.strand.join(', ') +
            '], false-ticks [' + base.tick.join(', ') + '], step 12 met ' + base.endMet[k12] +
            ', worst disagreement ' + worst + ' broadcast(s). ') +
         'gauge frozen at ' + Number(low.gauge).toFixed(2) + ' % against a true ' +
         Number(low.truth).toFixed(2) + ' %; step 12 refused on ' + low.acc[k12].s + '/' + low.N +
         ' broadcasts its own criterion was met, step 16 ticked on ' +
         low.acc['pwr_tmi2_incident:16:pzr_level_pct'].t + '/' + low.N + ' it was not');
    })();

    /* --- 2ag.5 pzr_level_sensor_stuck: the SAME casualty, and WHICH rows it breaks is decided
     * by the moment of the click. This is the `stuck`-vs-`dead` difference in one measurement.
     * §2ae pins steps 15 and 16 in TICK_EXPECTED because a DEAD gauge reads 0.0 % and satisfies
     * `< 80` and `< 50`; a gauge stuck while PEGGED can never satisfy either, for ever.
     * Asserted on the GAUGE's own verdict rather than on a strand count, because the plant takes
     * about 95 plant-minutes to bring the true level back under 50 % and a window that long
     * would be the most expensive check in this file for no extra claim. */
    (function () {
      var early = tmiSweep('pzr_level_sensor_stuck', 0);
      var late = tmiSweep('pzr_level_sensor_stuck', 150);
      var K12 = 'pwr_tmi2_incident:12:pzr_level_pct',
          K16 = 'pwr_tmi2_incident:16:pzr_level_pct';
      /* STEP 15 IS NO LONGER IN THIS MEASUREMENT (2026-09-19): it authors no pzr_level row, so
       * `tmiSweep` cannot see it and neither casualty can reach it. 2ag.8 is the check that says
       * so, and it asserts the OLD entry would still have broken on this same rig — otherwise
       * "the casualty no longer breaks step 15" would be true of a rig that had stopped driving. */
      var earlyOk = early.froze < 80 && early.endMet[K12] === false && early.endMet[K16] === false;
      var lateOk = late.froze >= 99 && late.endMet[K12] === true && late.endMet[K16] === false;
      ck('2ag.5 ...and a STUCK gauge breaks a DIFFERENT set depending on when it was clicked (#788)',
         earlyOk && lateOk,
         'clicked at ' + Number(early.froze).toFixed(2) + ' % -> step 12 ' + early.endMet[K12] +
         ', 16 ' + early.endMet[K16] +
         '  |  clicked at ' + Number(late.froze).toFixed(2) + ' % -> step 12 ' + late.endMet[K12] +
         ', 16 ' + late.endMet[K16] +
         ' - step 16 is permanently unmet on a gauge stuck high, and 2ae pins it in ' +
         'TICK_EXPECTED because a DEAD gauge reads 0.0 % and satisfies it');
    })();

    /* --- 2ag.6 THE FAILURE MODEL'S OWN DEFECT, WAS pinned as a canary (see the header) —
     * FIXED at #791 (2026-09-20). `drift` and `stuck` used to return out of `_applyFailure`
     * AFTER the range clip, unclipped, so the reading could leave the transmitter's declared
     * span; `dead` and `noisy` were already clipped in the same switch. Rewritten from the
     * canary's STRICT-EXCESS assertion to the fixed invariant: `drift` now pegs at the same
     * span `dead` does, same as every other failure mode. */
    (function () {
      var sp = RD.PWR_CONFIG.instruments.tavg;
      var w = boot('hot_zero_power'), s = w.snap, i;
      w.svc.handleCommand({ action: 'inject_failure', failure_id: 'tavg_sensor_failure' });
      for (i = 0; i < 600; i++) s = w.svc.tick();
      var drifted = s.instruments.tavg;
      var w2 = boot('hot_zero_power'), s2 = w2.snap;
      w2.svc.handleCommand({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'dead' });
      for (i = 0; i < 30; i++) s2 = w2.svc.tick();
      ck('2ag.6 a drifting channel now pegs at its own transmitter span, same as `dead` (#788, fixed by #791)',
         Math.abs(drifted - sp.range[1]) < 1e-9 && Math.abs(s2.instruments.tavg - sp.range[0]) < 1e-9,
         'tavg drift pegs at ' + drifted.toFixed(3) + ' degC (' + (drifted * 9 / 5 + 32).toFixed(1) +
         ' degF) against the declared top ' + sp.range[1] + ' degC; `dead` pegs at ' +
         s2.instruments.tavg.toFixed(3) + ' degC against the declared floor ' + sp.range[0] + ' degC');
    })();

    /* --- 2ag.7 IS THE BROKEN GAUGE PUBLISHED WHERE THE INSTRUCTOR COULD READ IT? This is the
     * question #773 opened and it was filed on a measurement of the PANEL path only, which
     * gives the wrong answer for the path authored content uses. MEASURED both ways:
     *
     *   inject_failure {failure_id: 'tavg_sensor_failure'}  -> snapshot.active_failures
     *       [{"id":"tavg_sensor_failure","severity":null}]   — PUBLISHED, by name.
     *   set_instrument_failure {instrument_id:'pzr_level', mode:'dead'} -> active_failures []
     *       while engine.getActiveFailures() returns ["instrument:pzr_level"] — NOT published.
     *
     * So the signal a walkthrough would need already exists for every one of the four named
     * casualties, and is missing only for the hand-built panel injection. Any mechanism that
     * names a broken gauge on a stranded step can read `active_failures` today; what it cannot
     * do is see a channel the player killed from the advanced panel. Pinned so the two halves
     * cannot drift apart unnoticed, and so the next agent does not re-derive #773's premise. */
    (function () {
      var named = {}, panel = {};
      ['tavg_sensor_failure', 'pzr_level_sensor_low', 'porv_indicator_stuck_closed'].forEach(function (fid) {
        var w = boot('hot_full_power'), s = w.snap, i;
        w.svc.handleCommand({ action: 'inject_failure', failure_id: fid });
        for (i = 0; i < 30; i++) s = w.svc.tick();
        named[fid] = (s.active_failures || []).map(function (f) { return f && f.id; });
      });
      var w2 = boot('hot_full_power'), s2 = w2.snap, j;
      w2.svc.handleCommand({ action: 'set_instrument_failure', instrument_id: 'pzr_level', mode: 'dead' });
      for (j = 0; j < 30; j++) s2 = w2.svc.tick();
      panel.published = (s2.active_failures || []).map(function (f) { return f && f.id; });
      panel.engine = [];
      try { panel.engine = w2.svc.engine.getActiveFailures(); } catch (e) { panel.engine = ['THREW ' + e.message]; }
      panel.reading = s2.instruments.pzr_level;
      var allNamed = Object.keys(named).every(function (k) { return named[k].indexOf(k) !== -1; });
      ck('2ag.7 a NAMED casualty is published by id; the PANEL injection is not, though the engine knows (#788)',
         allNamed && panel.published.length === 0 &&
         panel.engine.indexOf('instrument:pzr_level') !== -1 && panel.reading === 0,
         'named -> ' + Object.keys(named).map(function (k) { return JSON.stringify(named[k]); }).join(', ') +
         '; panel dead pzr_level reads ' + panel.reading + ' with active_failures ' +
         JSON.stringify(panel.published) + ' and engine.getActiveFailures() ' +
         JSON.stringify(panel.engine));
    })();

    /* --- 2ag.8 THE RELIEF #788 ACTUALLY SHIPPED: step 15's wait entry is off the breakable
     * channel (content pass, 2026-09-19).
     *
     * The step asks the player to secure the reactor coolant pumps at 1 h 13 min, and the entry
     * that made them WAIT for it was `pzr_level_pct < 80`. That is the pressurizer level gauge
     * keeping a clock, on the one leg two of the four named casualties freeze, and it broke in
     * both directions at once: frozen at 20.0 % it is satisfied from the injection onward (the
     * player secures at ten minutes, which is what the entry existed to stop); frozen while the
     * gauge is pegged it can never be satisfied at all and the step is a soft lock. The step now
     * grades SUBCOOLING MARGIN at the bottom of its scale — the cue that decides this action,
     * and the DERIVED channel 2ae.3 measures as refusing an instrument failure silently.
     *
     * THREE CLAIMS, because the first two are hollow apart. (1) No entry of the step grades a
     * param the layer maps to `pzr_level` — asked of the MAP, not of a list. (2) THE OLD ENTRY
     * WOULD STILL BREAK ON THIS RIG: graded alongside, it false-ticks on hundreds of the same
     * broadcasts, so "the casualty no longer reaches step 15" is a fact about the step and not
     * about a rig that has stopped driving the plant into the deception. (3) The wait is still a
     * wait: the new entry is unmet through all 300 broadcasts on BOTH rigs — measured on the
     * authored replay, the margin reaches its -28.00 degC (-50.4 degF) floor at t = 3420 s
     * (57.0 min) against the old entry's 3980 s (66.3 min) and the replay's own press at 4400 s.
     *
     * INJECTION (2026-09-19): restore `{p:'pzr_level_pct',op:'<',v:80}` as the step's first entry
     * -> 2ag.8 red, "step 15 grades pzr_level on 1 entry"; and 2ae.4 red with it, "UNPINNED:
     * pwr_tmi2_incident:15:pzr_level_pct", and 2ag.4 red, same key. Raise the new entry's
     * threshold to `<= 0` (a margin the plant reaches in three minutes) -> 2ag.8 red, "the wait
     * entry is met on 300/300 broadcasts". */
    (function () {
      var st = null;
      POOL.forEach(function (p) {
        if (p.id === 'pwr_tmi2_incident') st = (p.steps || [])[14];
      });
      var accs = (st && st.accs) || [];
      var onLevel = accs.filter(function (e) { return e && e.p && MAP[e.p] === 'pzr_level'; });
      var wait = accs.filter(function (e) { return e && e.p === 'subcooling_c'; })[0];
      var OLD = { p: 'pzr_level_pct', op: '<', v: 80 };
      function drive(fid) {
        var w = boot('hot_full_power', 60), s = w.snap, i;
        w.svc.handleCommand({ action: 'inject_failure', failure_id: 'anticipatory_trip_failure' });
        for (i = 0; i < 20; i++) s = w.svc.tick();
        w.svc.handleCommand({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
        w.svc.handleCommand({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
        if (fid) w.svc.handleCommand({ action: 'inject_failure', failure_id: fid });
        var old = 0, met = 0, N = 300;
        for (i = 0; i < N; i++) {
          s = w.svc.tick();
          if (grader._grade(s, OLD).met && !grader._predMet(s.true_state.pzr_level_pct, OLD)) old++;
          if (wait && grader._grade(s, wait).met) met++;
        }
        return { old: old, met: met, N: N, gauge: s.instruments.pzr_level,
                 margin: s.instruments.subcooling_margin };
      }
      var base = drive(null), low = drive('pzr_level_sensor_low');
      ck('2ag.8 step 15’s wait entry is off the channel the casualty freezes, and it is still a wait (#788)',
         onLevel.length === 0 && !!wait && low.old >= 200 && base.old <= 5 &&
         low.met === 0 && base.met === 0,
         (onLevel.length ? 'step 15 grades pzr_level on ' + onLevel.length + ' entry(ies): ' +
            onLevel.map(function (e) { return e.p; }).join(', ') + '. '
                         : 'no entry of step 15 grades pzr_level; ') +
         (wait ? 'the wait entry is ' + wait.p + ' ' + wait.op + ' ' + wait.v + ', met on ' +
            low.met + '/' + low.N + ' broadcasts with the casualty in and ' + base.met + '/' +
            base.N + ' without (the margin reads ' + Number(low.margin).toFixed(2) +
            ' degC at the end of the window, its floor is -28.00 and it arrives at 57.0 plant-min); '
               : 'NO SUBCOOLING ENTRY ON STEP 15; ') +
         'CONTROL: the OLD `pzr_level_pct < 80` entry false-ticks on ' + low.old + '/' + low.N +
         ' broadcasts with the gauge frozen at ' + Number(low.gauge).toFixed(2) + ' % against ' +
         base.old + '/' + base.N + ' un-injected');
    })();

    /* --- 2ag.9 THE DRIFT SWEEP'S BLIND SPOT: A DERIVED CHANNEL INHERITS ITS INPUTS' CASUALTIES
     * (#788 content pass, 2026-09-19 — found while adjudicating step 15, not looked for).
     *
     * 2ag.3 answers "what does `tavg_sensor_failure` break?" by sweeping the rows whose channel
     * is `tavg`. SUBCOOLING MARGIN is Tsat(primary_pressure) - tavg, both instrument readings
     * (`pwr_instruments`), so a drifting T-avg drags it too — and its rows have channel
     * `subcooling_margin`, which that filter cannot see. FOUR rows on the TMI-2 leg grade it and
     * a drifting T-avg breaks EVERY ONE, three by false-tick and one by soft lock. So 2ag.3's
     * "5 strand, 8 false-tick of 17" is the count for the rows named after the channel, not the
     * count for the casualty.
     *
     * MEASURED on the leg driven by its own injections (`hot_full_power`, seed 7, 60x, 300
     * broadcasts, drift injected with the accident): the gauge reads 1004.69 degC (1840.4 degF)
     * at the end of the window against a true 131.69 degC (269.0 degF), and the margin it feeds
     * reads -28.00 degC (-50.4 degF) against a true +88.02 degC (+158.4 degF).
     *   step 13  `subcooling_c <= 0.56`      false-ticks 286/300, first at broadcast 14
     *   step 15  `subcooling_c <= -27.778`   false-ticks 276/300, first at broadcast 24
     *   step 17  `subcooling_c <= -27.778`   false-ticks 276/300
     *   step 19  `subcooling_c > 5.56`       STRANDS     289/300 — an unrecorded soft lock
     * Un-injected control on the same rig: 0, 0, 0, and 1 broadcast on step 19, which is the
     * instrument lag straddle PERSIST exists for.
     *
     * PINNED, NOT FIXED. Three of the four rows predate this pass and the fourth is step 15's
     * new entry; every one of them is the honest reading of a tile the player is told to watch,
     * and the relief they need is the same one steps 12 and 16 need — a declaration keyed on the
     * casualty, which 2ag.7 measured is already published by name.
     *
     * INJECTION (2026-09-19): drop step 19's key from SUB_STRAND -> red, "UNPINNED:
     * pwr_tmi2_incident:19:subcooling_c"; pin step 13 in SUB_STRAND as well -> red, "PINNED BUT
     * NOT SEEN". Grading `subcooling_c` on true_state instead of the instrument would clear the
     * whole set, which is why the control below asserts the un-injected rig stays quiet. */
    (function () {
      var SUB_TICK = { 'pwr_tmi2_incident:13:subcooling_c': 1, 'pwr_tmi2_incident:15:subcooling_c': 1,
                       'pwr_tmi2_incident:17:subcooling_c': 1 };
      var SUB_STRAND = { 'pwr_tmi2_incident:19:subcooling_c': 1 };
      var mine = rows.filter(function (r) { return r.chan === 'subcooling_margin'; });
      function sweep(fid) {
        var w = boot('hot_full_power', 60), s = w.snap, i;
        w.svc.handleCommand({ action: 'inject_failure', failure_id: 'anticipatory_trip_failure' });
        for (i = 0; i < 20; i++) s = w.svc.tick();
        w.svc.handleCommand({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
        w.svc.handleCommand({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
        if (fid) w.svc.handleCommand({ action: 'inject_failure', failure_id: fid });
        var acc = {}; mine.forEach(function (r) { acc[r.key] = { s: 0, t: 0 }; });
        var N = 300;
        for (i = 0; i < N; i++) {
          s = w.svc.tick();
          mine.forEach(function (r) {
            var g = grader._grade(s, r.en).met, tm = truthMet(s, r.en);
            if (!g && tm) acc[r.key].s++;
            if (g && !tm) acc[r.key].t++;
          });
        }
        var strand = [], tick = [];
        mine.forEach(function (r) {
          if (acc[r.key].s >= PERSIST) strand.push(r.key);
          if (acc[r.key].t >= PERSIST) tick.push(r.key);
        });
        return { strand: strand, tick: tick, acc: acc, N: N,
                 tavg: s.instruments.tavg, ttavg: s.true_state.tavg_c,
                 marg: s.instruments.subcooling_margin, tmarg: s.true_state.subcooling_c };
      }
      var base = sweep(null), dr = sweep('tavg_sensor_failure');
      var dS = diffSet(dr.strand, SUB_STRAND), dT = diffSet(dr.tick, SUB_TICK);
      var control = base.strand.length === 0 && base.tick.length === 0;
      ck('2ag.9 a DRIFTING T-avg breaks every SUBCOOLING MARGIN row, which 2ag.3’s channel filter cannot see (#788)',
         mine.length === 4 && dS.ok && dT.ok && control,
         dS.note + dT.note + mine.length + ' pool row(s) grade the derived channel, ' +
         dr.tick.length + ' false-tick and ' + dr.strand.length + ' strand under the drift; ' +
         (control ? 'control: the un-injected rig does neither on any of them. '
                  : 'CONTROL FAILED: un-injected rig strands [' + base.strand.join(', ') +
                    '] and false-ticks [' + base.tick.join(', ') + ']. ') +
         'T-avg reads ' + Number(dr.tavg).toFixed(2) + ' degC (' +
         (dr.tavg * 9 / 5 + 32).toFixed(1) + ' degF) against a true ' + Number(dr.ttavg).toFixed(2) +
         ', and the margin it feeds reads ' + Number(dr.marg).toFixed(2) + ' degC against a true ' +
         Number(dr.tmarg).toFixed(2));
    })();
  })();

  /* 2ah. A CASUALTY THE PLAYER INJECTED ON PURPOSE STANDS ITS OWN ROWS DOWN — THE MECHANISM
   * #773/#788 OWED *(OWNER RULING, 2026-09-19: "A")*.
   *
   * §2ae measured which rows a broken gauge strands; §2ag measured which of them the four NAMED
   * casualties reach. Neither of them fixed anything, and one of the rows they found —
   * `pwr_tmi2_incident` step 19, SUBCOOLING MARGIN above 10 degF (5.56 degC) — was an
   * UNRECORDED SOFT LOCK: the only acceptance of its step, refused on 289 of 300 broadcasts.
   * The relief is in `instructor_layer.js` (`_casualtyChannels` / `_predVoided`) and this
   * section is its proof.
   *
   * WHAT IT IS NOT. It is not the fail-open #773 rejected. A fail-open says "you are done
   * because your meter died" and fires on ANY cause; this fires only on the player's own
   * DECLARED action, reading `snapshot.active_failures` — the injection record, never
   * `true_state`. Hard Rule 1 is untouched, and 2ah.6 pins the boundary the ruling drew: the
   * RAW advanced-panel injection publishes nothing and is therefore NOT relieved.
   *
   * THE DERIVED-CHANNEL HALF IS WHY A NAME MATCH WOULD HAVE CLOSED NOTHING WORTH CLOSING. Four
   * of the rows grade `subcooling_c` -> `subcooling_margin`, which the instrument layer builds
   * out of indicated pressure, T-avg and core-exit temperature, so `tavg_sensor_failure` kills
   * them though their channel is not `tavg` — and step 19 is among them. The relation comes
   * from `RD.PWRInstruments.DERIVED_FROM`, declared in the file that COMPUTES those channels,
   * and 2ah.1 RE-DISCOVERS it by perturbation rather than iterating it.
   *
   * AND THE DISCOVERY HAD TO BE TWO-SIDED AND ON FROZEN INPUTS, both of which are findings.
   * On a LIVE plant a stuck channel moves 32 of 33 readings — the automation reads instruments
   * and drives the plant back — so a live A/B cannot tell a derived channel from a controlled
   * one (measured: `porv_indicator`, which nothing derives from, moved 33). And
   * `subcooling_margin` takes the MAX of T-avg and core-exit (#407), so at `hot_full_power`
   * sticking T-avg DOWNWARD moves it not at all: a one-sided probe reports T-avg as no input.
   * That is the "identity in the regime you test in" trap, and 2ah.1 sticks each channel HIGH
   * AND LOW for exactly that reason.
   *
   * WHAT "CLOSES A ROW" MEANS HERE, measured per row on a REAL leg with a REAL injection and
   * the REAL live checklist driven step by step (2ah.4), never a flag read off a rig:
   *   - the row is VOIDED and the verdict names the casualty the player injected; and
   *   - the row NO LONGER BLOCKS ITS STEP — `selfBlocks` false on every one of the 19; and
   *   - where the row is the step's SOLE acceptance, the step actually COMPLETES
   *     (`awaiting_ack` rises), which is the soft-lock relief itself.
   * A step whose OTHER rows are still unmet does NOT complete, and that is the mechanism
   * working: `mwe_output`, `power_pct`, `rcp_cavitating` and `boron_ppm` are on healthy gauges
   * and go on asserting. 2ah.4 pins which rows complete and which do not, so a relief that
   * ever over-fired — voiding a sibling it has no business touching — reddens here.
   *
   * INJECTION — twelve edits made deliberately and restored, 2026-09-19, and what each one
   * PRINTED. Three of them STAYED GREEN, and those are recorded too, because a guard that no
   * injection can redden is a guard whose claim is carried somewhere else and it is worth
   * saying where:
   *   - drop `core_exit_temp` from DERIVED_FROM.subcooling_margin -> 2ah.1 red, "UNDECLARED:
   *     subcooling_margin <- core_exit_temp"
   *   - add `sg_level` to DERIVED_FROM.tavg_rate                  -> 2ah.1 red, "DECLARED BUT
   *     NEVER MOVED: tavg_rate <- sg_level"
   *   - make the probe one-sided (stuck LOW only)                 -> 2ah.1 red, "DECLARED BUT
   *     NEVER MOVED: subcooling_margin <- tavg" — the max masks it, which is the trap the
   *     two-sided probe exists for, and this injection is the proof that it does
   *   - revert `c.accMetNow = ... || !!c.accVoided`               -> 2ah.4 AND 2ah.5 red,
   *     "NEVER COMPLETES: pwr_heatup:11:tavg_c, pwr_tmi2_incident:19:subcooling_c,
   *     pwr_tmi2_incident:12:pzr_level_pct"
   *   - revert `sawOk` to `c.sawSeen`                             -> 2ah.5 red, "injected ack
   *     false" — `pwr_heatup` step 11 carries BOTH an `acc` and a `saw` on T-avg, so losing
   *     the `saw` half alone re-locks the step even with the acceptance relieved. That is the
   *     measurement behind the decision to let the void reach `sawSeen`
   *   - latch the SOLE-row void (`c.accVoided = c.accVoided || ...`) -> 2ah.5 red, "after
   *     clear ack false voided \"Tavg Sensor Drifting\"" — the latch bug, caught
   *   - delete the `av.voided` branch from ui/app.js              -> 2ah.7 red, "the accs row
   *     draws no sentence"; delete the `ck.acc_voided` branch     -> 2ah.7 red, "the sole row
   *     draws no sentence"
   *
   *   STAYED GREEN, with the reason:
   *   - drop the `!af.length` early return in `_predVoided`       -> 7/7. It is an
   *     OPTIMISATION, not the safety property: a healthy plant has no failures, so the
   *     closure is empty and every row resolves to null by the longer road. 2ah.2 asserts
   *     the closure itself is empty, which is the claim that matters.
   *   - revert `if (!ax.met && !ax.voided)` to `if (!ax.met)` in the FIRST loop of
   *     `_gradeAccs`                                              -> 7/7. That guard governs
   *     only the `accs_ordered` sequencer's `blocked` flag; the FINAL `all` recomputation
   *     below it is what decides completion, and it honours `voided` independently. Both are
   *     needed and neither is dead — but no pool step is both ordered AND voidable today, so
   *     the first one has no probe standing on it. Said out loud rather than trimmed.
   *   - `ax.voided = ax.voided || ...` (latch the per-ROW void)   -> 7/7. 2ah.5 measures the
   *     SOLE-acc path (`acc_voided`), and the 19 rows 2ah.4 drives never clear mid-step. The
   *     per-row latch is unprobed; it is written non-latching for the same reason as the
   *     sole-row one, which IS probed.
   *
   *   NOT RUN: `_casualtyChannels` returning the direct channel only. The anchor did not
   *   match on the first pass and the re-run did not fit the session; 2ah.3 pins the closure
   *   for all four casualties by value, so an empty closure would redden it by inspection of
   *   the pinned sets — but that is an ARGUMENT, not a measurement, and it is owed. */
  (function () {
    function send(svc, c) { try { svc.handleCommand(c); } catch (e) { /* a door refused it */ } }
    /* `tick()` returns null on a non-broadcast tick, AND the clock stops dead when a step's
     * `pause` fires (#694) — the TMI-2 leg has several. The player releases that with Continue;
     * a headless driver has to put the clock back itself or the walk ends at step 3. */
    function tkv(svc) { var s = null, n = 0; while (s == null && n++ < 200) { if (!svc.running) svc.running = true; s = svc.tick(); } return s; }

    /* --- 2ah.1 THE DERIVED-CHANNEL RELATION, RE-DISCOVERED. One real (true_state, dt, extras)
     * triple is captured off a live pwr2 broadcast and then FROZEN; a fresh instrument set is
     * driven to settlement on it, once healthy and once with each channel stuck high and stuck
     * low, and every reading is diffed. Nothing here reads the declaration to decide what to
     * probe — it probes every channel the layer publishes. */
    (function () {
      var orig = RD.PWRInstruments.prototype.update, cap = null;
      RD.PWRInstruments.prototype.update = function (ts, dt, ex) { cap = { ts: ts, dt: dt, ex: ex }; return orig.apply(this, arguments); };
      var svc = mkSvc('hot_full_power');
      for (var q = 0; q < 30; q++) svc.tick();
      RD.PWRInstruments.prototype.update = orig;
      var TS = JSON.parse(JSON.stringify(cap.ts)), EX = JSON.parse(JSON.stringify(cap.ex || {})), DT = cap.dt;
      function settle(ch, val) {
        var ins = new RD.PWRInstruments(RD.PWR_CONFIG, 7);
        ins.reset(TS, EX);
        if (ch) ins.setFailure(ch, 'stuck', val);
        for (var i = 0; i < 400; i++) ins.update(TS, DT, EX);
        return ins.reading;
      }
      var A = settle(null), found = {}, probed = 0;
      Object.keys(A).forEach(function (ch) {
        var lv = A[ch];
        var cands = (ch === 'porv_indicator') ? ['open', 'closed']
                  : (typeof lv === 'number' && isFinite(lv)) ? [lv * 0.5 - 1, lv * 1.5 + 1] : [];
        if (!cands.length) return;
        probed++;
        cands.forEach(function (v) {
          var B = settle(ch, v);
          Object.keys(A).forEach(function (k) {
            if (k === ch) return;
            var a = A[k], b = B[k];
            var moved = (typeof a === 'number' && typeof b === 'number')
              ? Math.abs(a - b) > Math.max(1e-9, Math.abs(a) * 1e-9) : a !== b;
            if (moved) { (found[k] = found[k] || {})[ch] = 1; }
          });
        });
      });
      var DECL = RD.PWRInstruments.DERIVED_FROM || {};
      /* UNDECLARED is the UNSAFE direction — a dependency the relief would miss, which is how
       * step 19 stayed a soft lock. DECLARED-BUT-NEVER-MOVED is inert here and is allowed for
       * exactly one channel, with its measured reason: `pzr_level_dev` needs a level-program
       * supplier and the PWR2 stack loads none, so it publishes a constant 0.0 % and nothing
       * can move it. Pinned by name so a SECOND one cannot join it quietly. */
      var UNMOVABLE_EXPECTED = { pzr_level_dev: 1 };
      var undecl = [], inert = [], deep = [];
      Object.keys(found).forEach(function (k) {
        var d = DECL[k] || [];
        Object.keys(found[k]).forEach(function (src) {
          if (d.indexOf(src) < 0) undecl.push(k + ' <- ' + src);
        });
      });
      Object.keys(DECL).forEach(function (k) {
        if (!found[k]) { if (!UNMOVABLE_EXPECTED[k]) inert.push(k + ' (no input moves it)'); return; }
        DECL[k].forEach(function (src) { if (!found[k][src]) inert.push(k + ' <- ' + src); });
        // one level deep: a declared channel must not itself be an input to another
        Object.keys(DECL).forEach(function (o) { if (DECL[o].indexOf(k) >= 0) deep.push(k + ' feeds ' + o); });
      });
      ck('2ah.1 the derived-channel relation re-discovered by two-sided perturbation is the DECLARED one, one level deep (#773/#788)',
         undecl.length === 0 && inert.length === 0 && deep.length === 0 && probed >= 25 &&
         Object.keys(found).length >= 7,
         (undecl.length ? 'UNDECLARED: ' + undecl.join(', ') + '. ' : '') +
         (inert.length ? 'DECLARED BUT NEVER MOVED: ' + inert.join(', ') + '. ' : '') +
         (deep.length ? 'NOT ONE LEVEL DEEP: ' + deep.join(', ') + '. ' : '') +
         probed + ' channels perturbed high and low on one frozen true-state; ' +
         Object.keys(found).length + ' derived channels discovered, ' +
         Object.keys(DECL).length + ' declared (pzr_level_dev is inert on PWR2 — no level-program supplier)');
    })();

    /* --- 2ah.2 THE HEALTHY-PLANT NEGATIVE, and it is the most important check here. With no
     * casualty injected, NOT ONE row of the pool is voided — asserted over every predicate row
     * at its own leg's IC, plus the closure map itself, which must be empty. */
    (function () {
      var voided = [], nonEmpty = [], legs = 0, byIC = {};
      POOL.forEach(function (proc) {
        if (!byIC[proc.from]) {
          var w = mkSvc(proc.from), s0 = null;
          for (var i = 0; i < 30; i++) s0 = w.tick();
          byIC[proc.from] = { snap: s0, inst: w.instructor };
          legs++;
        }
        var rig = byIC[proc.from], snap = rig.snap;
        if (Object.keys(rig.inst._casualtyChannels(snap)).length) nonEmpty.push(proc.from);
        (proc.steps || []).forEach(function (st, idx) {
          var accs = (st.accs && st.accs.length) ? st.accs : (st.acc ? [st.acc] : []);
          accs.concat(st.saw ? [st.saw] : []).forEach(function (en) {
            if (!en || !en.p) return;
            if (rig.inst._predVoided(snap, en)) voided.push(proc.id + ':' + (idx + 1) + ':' + en.p);
          });
        });
      });
      ck('2ah.2 on a HEALTHY plant not one row in the pool is voided, and the closure is empty (#773/#788)',
         voided.length === 0 && nonEmpty.length === 0 && legs >= 3,
         (voided.length ? 'VOIDED WITH NOTHING INJECTED: ' + voided.join(', ') + '. ' : '') +
         (nonEmpty.length ? 'NON-EMPTY CLOSURE at ' + nonEmpty.join(', ') + '. ' : '') +
         POOL.length + ' legs swept over ' + legs + ' initial conditions');
    })();

    /* --- 2ah.3 WHAT EACH NAMED CASUALTY TAKES OUT. Driven through the REAL control layer so
     * the catalog lookup and the `active_failures` publication are the live ones. */
    (function () {
      /* `pzr_level_dev` APPEARS IN THREE OF THESE FOUR and is INERT, which is worth saying
       * rather than trimming away: it is declared as derived from `pzr_level` and `tavg`
       * (true of the file that computes it), and on PWR2 it publishes a constant 0.0 %
       * because no level-program supplier is wired (2ah.1's note). No pool row grades it,
       * so the over-reach costs nothing today — but it is pinned so that wiring a program
       * supplier, which would make the channel live, reddens here and is read. */
      var EXPECT = {
        porv_indicator_stuck_closed: ['porv_indicator'],
        pzr_level_sensor_stuck: ['pzr_level', 'pzr_level_dev'],
        pzr_level_sensor_low: ['pzr_level', 'pzr_level_dev'],
        tavg_sensor_failure: ['tavg', 'subcooling_margin', 'tavg_rate', 'otdt_setpoint',
                              'opdt_setpoint', 'otdt_margin', 'opdt_margin', 'pzr_level_dev'],
      };
      var bad = [], note = [];
      Object.keys(EXPECT).forEach(function (fid) {
        var w = mkSvc('hot_full_power'), s = null, i;
        for (i = 0; i < 10; i++) s = w.tick();
        w.handleCommand({ action: 'inject_failure', failure_id: fid });
        for (i = 0; i < 3; i++) s = w.tick();
        var got = Object.keys(w.instructor._casualtyChannels(s)).sort();
        var want = EXPECT[fid].slice().sort();
        if (got.join(',') !== want.join(',')) bad.push(fid + ' -> [' + got.join(', ') + '] want [' + want.join(', ') + ']');
        note.push(fid + ':' + got.length);
      });
      ck('2ah.3 each named instrument casualty closes over exactly its own channel plus what is DERIVED from it (#773/#788)',
         bad.length === 0, (bad.length ? 'MISMATCH ' + bad.join('; ') + '. ' : '') + note.join(', ') + ' channel(s)');
    })();

    /* --- 2ah.4 THE ROW SWEEP. One boot per (leg, casualty); the REAL live checklist is started
     * and walked with Continue, the step's own authored `cmd` issued on entry the way the
     * replay does (the live checklist never issues it — the player presses the control), the
     * casualty injected by NAME, and each target step watched for up to 400 broadcasts. */
    (function () {
      var ROW_EXPECTED = {
        /* key                                 [casualty display, the step COMPLETES] */
        'pwr_startup:1:tavg_c':               ['Tavg Sensor Drifting', true],
        'pwr_heatup:11:tavg_c':               ['Tavg Sensor Drifting', true],
        'pwr_heatup:11:saw:tavg_c':           ['Tavg Sensor Drifting', true],
        'pwr_lower_power:3:tavg_c':           ['Tavg Sensor Drifting', false],
        'pwr_lower_power:4:tavg_c':           ['Tavg Sensor Drifting', false],
        'pwr_lower_power:5:tavg_c':           ['Tavg Sensor Drifting', false],
        'pwr_lower_power:6:tavg_c':           ['Tavg Sensor Drifting', false],
        'pwr_raise_power:4:tavg_c':           ['Tavg Sensor Drifting', false],
        'pwr_raise_power:5:tavg_c':           ['Tavg Sensor Drifting', false],
        'pwr_raise_power:6:tavg_c':           ['Tavg Sensor Drifting', false],
        'pwr_raise_power:7:tavg_c':           ['Tavg Sensor Drifting', false],
        'pwr_raise_power:8:tavg_c':           ['Tavg Sensor Drifting', false],
        'pwr_raise_power:9:tavg_c':           ['Tavg Sensor Drifting', false],
        'pwr_tmi2_incident:13:subcooling_c':  ['Tavg Sensor Drifting', false],
        'pwr_tmi2_incident:15:subcooling_c':  ['Tavg Sensor Drifting', true],
        'pwr_tmi2_incident:17:subcooling_c':  ['Tavg Sensor Drifting', true],
        'pwr_tmi2_incident:19:subcooling_c':  ['Tavg Sensor Drifting', true],
        'pwr_tmi2_incident:12:pzr_level_pct': ['Pressurizer Level Sensor Failed Low', true],
        'pwr_tmi2_incident:16:pzr_level_pct': ['Pressurizer Level Sensor Failed Low', true],
      };
      var LEGS = [
        ['pwr_startup', 'tavg_sensor_failure', [[1, 'tavg_c', 0]]],
        ['pwr_heatup', 'tavg_sensor_failure', [[11, 'tavg_c', 0], [11, 'tavg_c', 1]]],
        ['pwr_lower_power', 'tavg_sensor_failure', [[3, 'tavg_c', 0], [4, 'tavg_c', 0], [5, 'tavg_c', 0], [6, 'tavg_c', 0]]],
        ['pwr_raise_power', 'tavg_sensor_failure', [[4, 'tavg_c', 0], [5, 'tavg_c', 0], [6, 'tavg_c', 0], [7, 'tavg_c', 0], [8, 'tavg_c', 0], [9, 'tavg_c', 0]]],
        ['pwr_tmi2_incident', 'tavg_sensor_failure', [[13, 'subcooling_c', 0], [15, 'subcooling_c', 0], [17, 'subcooling_c', 0], [19, 'subcooling_c', 0]]],
        ['pwr_tmi2_incident', 'pzr_level_sensor_low', [[12, 'pzr_level_pct', 0], [16, 'pzr_level_pct', 0]]],
      ];
      var noVoid = [], stillBlocks = [], neverDone = [], wrongName = [], unexpectedDone = [], seen = 0;
      LEGS.forEach(function (L) {
        var proc = POOL.filter(function (p) { return p.id === L[0]; })[0];
        var svc = mkSvc(proc.from), s = tkv(svc), i, g;
        svc.handleCommand({ action: 'start_checklist', procedure_id: proc.id });
        s = tkv(svc);
        svc.handleCommand({ action: 'inject_failure', failure_id: L[1] });
        L[2].forEach(function (t) {
          var step = t[0], p = t[1], isSaw = !!t[2], st = proc.steps[step - 1];
          var key = proc.id + ':' + step + ':' + (isSaw ? 'saw:' : '') + p;
          seen++;
          g = 0;
          while ((s.instructor.checklist.step_index + 1) < step && g++ < 200) {
            var cur = proc.steps[s.instructor.checklist.step_index];
            if (cur && cur.cmd) send(svc, cur.cmd);
            svc.handleCommand({ action: 'checklist_check' }); s = tkv(svc);
          }
          if (st.cmd) send(svc, st.cmd);
          var v = null, ack = false, self = false;
          for (i = 0; i < 400; i++) {
            var ckl = s.instructor.checklist;
            if (ckl.step_index + 1 !== step) break;
            var vv = isSaw ? ckl.saw_voided
                   : (ckl.acc_voided || (ckl.accs || []).map(function (a) { return a.voided; }).filter(Boolean)[0] || null);
            if (vv) v = vv;
            if (ckl.awaiting_ack) ack = true;
            /* DOES THE TARGET ROW ITSELF STILL HOLD THE STEP? — the claim the relief makes,
             * and the one a step blocked by a healthy sibling would otherwise hide. */
            (ckl.accs || []).forEach(function (a, ix) {
              if ((st.accs[ix] || {}).p === p && !a.met && !a.voided) self = true;
            });
            if (ack && v) break;
            s = tkv(svc);
          }
          var want = ROW_EXPECTED[key] || [null, false];
          if (!v) noVoid.push(key);
          else if (v !== want[0]) wrongName.push(key + ' -> "' + v + '"');
          if (self) stillBlocks.push(key);
          if (want[1] && !ack) neverDone.push(key);
          if (!want[1] && ack) unexpectedDone.push(key);
        });
      });
      var done = Object.keys(ROW_EXPECTED).filter(function (k) { return ROW_EXPECTED[k][1]; }).length;
      ck('2ah.4 every one of the 19 pinned rows is voided by its casualty, none still blocks its step, and the ' + done + ' sole-row steps COMPLETE (#773/#788)',
         seen === 19 && noVoid.length === 0 && wrongName.length === 0 && stillBlocks.length === 0 &&
         neverDone.length === 0 && unexpectedDone.length === 0,
         (noVoid.length ? 'NOT VOIDED: ' + noVoid.join(', ') + '. ' : '') +
         (wrongName.length ? 'WRONG CASUALTY NAMED: ' + wrongName.join(', ') + '. ' : '') +
         (stillBlocks.length ? 'STILL BLOCKS: ' + stillBlocks.join(', ') + '. ' : '') +
         (neverDone.length ? 'NEVER COMPLETES: ' + neverDone.join(', ') + '. ' : '') +
         (unexpectedDone.length ? 'COMPLETES BUT WAS NOT PINNED TO: ' + unexpectedDone.join(', ') + '. ' : '') +
         seen + ' rows driven on a real leg with a real named injection; the ' + (19 - done) +
         ' that do not complete are held by a SIBLING on a healthy gauge (mwe_output, power_pct, ' +
         'rcp_cavitating, boron_ppm), which is the relief not over-firing');
    })();

    /* --- 2ah.5 CLEARING. `clear_failure` must take the relief away — a row voided once and
     * voided for ever is the `implied_by` latch bug in a new place. Measured on `pwr_heatup`
     * step 11, the clean case: stranded healthy, complete under the casualty, stranded again
     * after the clear. All three states asserted, in that order. */
    (function () {
      var proc = POOL.filter(function (p) { return p.id === 'pwr_heatup'; })[0];
      var svc = mkSvc(proc.from), s = tkv(svc), i, g = 0;
      svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_heatup' });
      s = tkv(svc);
      while ((s.instructor.checklist.step_index + 1) < 11 && g++ < 200) {
        var cur = proc.steps[s.instructor.checklist.step_index];
        if (cur && cur.cmd) send(svc, cur.cmd);
        svc.handleCommand({ action: 'checklist_check' }); s = tkv(svc);
      }
      var beforeAck = false;
      for (i = 0; i < 20; i++) { if (s.instructor.checklist.awaiting_ack) beforeAck = true; s = tkv(svc); }
      svc.handleCommand({ action: 'inject_failure', failure_id: 'tavg_sensor_failure' });
      for (i = 0; i < 5; i++) s = tkv(svc);
      var midV = s.instructor.checklist.acc_voided, midAck = !!s.instructor.checklist.awaiting_ack;
      svc.handleCommand({ action: 'clear_failure', failure_id: 'tavg_sensor_failure' });
      for (i = 0; i < 5; i++) s = tkv(svc);
      var afterV = s.instructor.checklist.acc_voided, afterAck = !!s.instructor.checklist.awaiting_ack;
      ck('2ah.5 clear_failure takes the relief BACK — the void is re-derived every tick, never latched (#773/#788)',
         beforeAck === false && !!midV && midAck === true && afterV == null && afterAck === false,
         'pwr_heatup step 11: healthy ack ' + beforeAck + ' / injected ack ' + midAck +
         ' voided ' + JSON.stringify(midV) + ' / after clear ack ' + afterAck +
         ' voided ' + JSON.stringify(afterV));
    })();

    /* --- 2ah.6 THE RULING'S BOUNDARY. The RAW advanced-panel path publishes no
     * `active_failures` (§2ag.7 measured it), so it gets NO relief — deliberately, because
     * extending that publication also decides what M5's new-failure attention stop does when a
     * player breaks a gauge, and that was left out of scope. Asserted here so a future change
     * to the publication cannot widen the relief silently. */
    (function () {
      var svc = mkSvc('cold_shutdown'), s = null, i;
      for (i = 0; i < 10; i++) s = svc.tick();
      svc.handleCommand({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'dead' });
      for (i = 0; i < 5; i++) s = svc.tick();
      var en = { p: 'tavg_c', op: '>', v: 283 };
      var af = (s.active_failures || []).length;
      var v = svc.instructor._predVoided(s, en);
      ck('2ah.6 the RAW panel injection is NOT relieved — the ruling is scoped to the NAMED path (#773/#788)',
         af === 0 && v == null && s.instruments.tavg != null,
         'set_instrument_failure {tavg, dead} -> active_failures ' + af + ' entries, tavg reads ' +
         Number(s.instruments.tavg).toFixed(2) + ' degC (' + (s.instruments.tavg * 9 / 5 + 32).toFixed(1) +
         ' degF), _predVoided ' + JSON.stringify(v));
    })();

    /* --- 2ah.7 THE PLAYER-FACING HALF, which is the CONDITION the ruling attached to the
     * sole-row case: a step that completes with nothing asserting it must SAY so. Source scan
     * of the renderer for all three branches — the per-row one, the sole-row one and the `saw`
     * one — and of the render key, because a card that never re-draws says nothing however
     * good the string is. A SOURCE SCAN CANNOT PROVE THE STRING IS REACHABLE (#485), so the
     * fields it reads are the ones 2ah.4 and 2ah.5 measured on live broadcasts. */
    (function () {
      var asrc = fs.readFileSync(path.join(ROOT, 'ui', 'app.js'), 'utf8');
      var row = /av\.voided \?[\s\S]{0,240}?Not verified/.test(asrc);
      var sole = /ck\.acc_voided \?[\s\S]{0,240}?Not verified/.test(asrc);
      var saw = /ck\.saw_voided\)[\s\S]{0,240}?Not verified/.test(asrc);
      var keyed = /a\.voided \? 3 :/.test(asrc) && asrc.indexOf("ck.acc_voided || ''") >= 0;
      ck('2ah.7 the card names the casualty on a voided row, a voided SOLE row and a voided `saw`, and all three are in the render key (#773/#788)',
         row && sole && saw && keyed,
         (row ? '' : 'the accs row draws no sentence; ') + (sole ? '' : 'the sole row draws no sentence; ') +
         (saw ? '' : 'the saw latch draws no sentence; ') + (keyed ? '' : 'not in the render key; ') +
         'drawn from the runtime verdict (the casualty display string), never re-derived in the view');
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

  /* THE SHIPPED DECLARATIONS, CHECKED AGAINST THE REGISTRY (#655, 2026-09-20). Everything above
   * is synthetic and proves the MECHANISM; this is the only check that reads what the pool
   * actually declares, and it exists because a declaration fails SILENTLY in both directions.
   *
   * WHAT IT CAN CATCH: an id that is not an alarm at all — a typo, or a rename — which stops
   * matching and quietly restores the drop the step was authored to remove; and a `caution` or
   * `status` id, which is not in ALARM_DROP_PRIORITIES and so was never capable of dropping the
   * clock, i.e. a declaration that reads as a fix and is a no-op.
   *
   * ⚠ WHAT IT CANNOT CATCH, said here so nobody reads a green tally as cover: whether the step
   * really CAUSES the alarm it names. That is the whole failure mode of the feature — a false
   * declaration silences a real warning and nothing says so — and no static check can answer it.
   * It is answered by driving the leg and recording the clear -> active transitions inside the
   * step's own window; both declarations below were measured that way on 2026-09-20 and the
   * numbers are written on the steps themselves.
   *
   * `carriers.length >= 1` for the same reason 2ad.1 has it: a silent revert must redden. */
  (function () {
    var ALARM = {};
    /* `RD.PWR_CONTROL.protection.alarms`, not `RD.PWR_CONTROL.alarms` — the registry hangs off
     * the protection block (the first draft of this check read the outer object, found `undefined`
     * and reported both shipped declarations as unknown ids, which is the check doing its job on
     * itself). 50 rows, {id, priority, ...}. */
    ((RD.PWR_CONTROL && RD.PWR_CONTROL.protection && RD.PWR_CONTROL.protection.alarms) || [])
      .forEach(function (a) { ALARM[a.id] = a; });
    var DROPS = { critical: true, warning: true };
    var bad = [], carriers = [];
    POOL.forEach(function (pr) {
      (pr.steps || []).forEach(function (st2, i) {
        (st2.expect_alarms || []).forEach(function (id) {
          var where = pr.id + ':' + (i + 1) + ' ' + id;
          var a = ALARM[id];
          if (!a) { bad.push(where + ' is not an id in the alarm registry'); return; }
          carriers.push(where + '[' + a.priority + ']');
          if (!DROPS[a.priority]) bad.push(where + ' is a ' + a.priority +
            ' — only critical/warning can drop the clock, so declaring it buys nothing');
        });
      });
    });
    ck('12. every shipped `expect_alarms` id is a real alarm of a drop priority (#655)',
       bad.length === 0 && carriers.length >= 1,
       bad.length ? bad.join('; ')
                  : (carriers.length ? carriers.join(' · ')
                                     : 'NO step declares expect_alarms — the engine half is inert again'));
  })();
})();


/* ========================================================================================
 * 2ai. THE WALKTHROUGH REACTS TO A REACTOR TRIP (#709, layman playthrough 2026-09-07
 * finding S-15: "The checklist does not react to a reactor trip.")
 *
 * OPTION A ONLY. The leg DETECTS the trip and SAYS SO, without moving: one instructor
 * comment plus a panel banner. It is not per-step re-entry and it is not a post-trip
 * emergency leg — neither is built and neither is ruled. So the claim under test here is
 * two-sided and the second side is the important one: the notice APPEARS where it should,
 * and it CHANGES NOTHING (2ai.4 is the A/B that pins that).
 *
 * HARD RULE 1. The detection reads `rps_state.scrammed` / `true_state.scrammed` to decide
 * whether to INFORM the player. Nothing here grades on it, and 2ai.4 is what proves that
 * rather than asserting it.
 * ====================================================================================== */
if (!only) {
  console.log(B + '\n2ai. A REACTOR TRIP UNDER A WALKTHROUGH  [#709 — the leg says so, and moves nothing]' + X);

  function mkSvcT(ic) {
    var svc = new RD.SimulationService({ seed: 7 });
    svc.selectPlant('pwr2', ic, null, undefined);
    svc.running = true; svc.timeAcceleration = 10; svc.attentionStops = false;
    return svc;
  }
  function tickN(svc, n) { var s = null; for (var i = 0; i < n; i++) { var t = svc.tick(); if (t) s = t; } return s; }
  function isTripMsg(s) {
    var m = s && s.instructor && s.instructor.message;
    return !!(m && /reactor (has )?trip/i.test(m));
  }
  var SCRIPTS = {};
  POOL.forEach(function (p) { SCRIPTS[p.id] = RD.InstructorLayer.legScriptsScram(p); });

  /* 2ai.1 — THE EXEMPT SET IS RE-DISCOVERED BY DRIVING, NOT READ OFF THE SCANNER.
   *
   * A banner reading "this walkthrough cannot continue" on the step that just told the player
   * to scram is worse than silence, so the legs whose own route trips the reactor are exempt.
   * The exemption is derived from the authored content (`InstructorLayer.legScriptsScram`),
   * and this check asks the PLANT the same question: the replay above drove every leg's
   * authored commands and nothing else, so a trip standing at the end of one is that leg's own
   * doing. The two sets must be equal — a hand-kept list of ids would certify the list.
   *
   * The two legs are reached by DIFFERENT clauses of the scanner, which is why both exist:
   * `pwr_shutdown` sends `cmd {action:'scram'}`; `pwr_tmi2_incident` sends no scram at all and
   * is caught by its step-7 `acc {p:'scrammed'}`, the trip arriving out of the loss-of-feedwater
   * transient its earlier steps inject. Delete either clause and this reddens. */
  (function () {
    var derived = POOL.filter(function (p) { return SCRIPTS[p.id]; }).map(function (p) { return p.id; }).sort();
    var driven = POOL.filter(function (p) { return REPLAY_TRIP[p.id]; }).map(function (p) { return p.id; }).sort();
    ck('2ai.1 the legs the scanner exempts are exactly the legs whose OWN authored replay trips (#709)',
       derived.length >= 2 && derived.join(',') === driven.join(','),
       'scanner: [' + derived.join(', ') + ']  replay: [' + driven.join(', ') + ']  of ' + POOL.length + ' legs');
  })();

  /* 2ai.2 — THE HEALTHY-PLANT NEGATIVE, and it is the check that matters most. A notice that
   * fires on a plant nobody tripped is worse than no notice: every leg, at its own initial
   * condition, walked with nothing injected and nothing scrammed, and `trip_notice` must be
   * false on EVERY broadcast — not merely at the end. The instructor's comment is asserted
   * separately, because the two halves are published through different channels. */
  (function () {
    var lit = [], spoke = [];
    POOL.forEach(function (p) {
      var svc = mkSvcT(p.from);
      svc.handleCommand({ action: 'start_checklist', procedure_id: p.id });
      for (var i = 0; i < 120; i++) {
        var s = svc.tick(); if (!s) continue;
        var c = s.instructor && s.instructor.checklist;
        if (c && c.trip_notice) { lit.push(p.id + ' @tick ' + i); break; }
        if (isTripMsg(s)) { spoke.push(p.id + ' @tick ' + i); break; }
      }
    });
    ck('2ai.2 nothing tripped: trip_notice is false on every broadcast of every leg (#709)',
       lit.length === 0, lit.length ? 'LIT: ' + lit.join('; ') : POOL.length + ' legs x 120 broadcasts, 0 lit');
    ck('2ai.2 ...and the instructor never says the reactor has tripped on a healthy plant',
       spoke.length === 0, spoke.length ? 'SPOKE: ' + spoke.join('; ') : '0 of ' + POOL.length + ' legs');
  })();

  /* 2ai.3 — A TRIP MID-LEG IS SEEN AND SAID, ON EVERY LEG THE TRIP IS NOT THE POINT OF.
   * A trip can land on ANY leg, heatup and cooldown included, where the turbine is not in the
   * picture at all — so this drives all seven rather than the ascension, and asserts the
   * exempt pair STAYS SILENT in the same sweep. Both halves of the notice are asserted: the
   * banner flag the panel draws, and the instructor comment.
   *
   * The comment's deference rule is what this check found: with a plain "defer to any standing
   * comment" guard, `pwr_raise_power` and `pwr_lower_power` raised no comment at all, because
   * the precondition warning was still standing at their own initial conditions. */
  (function () {
    var bad = [];
    POOL.forEach(function (p) {
      var svc = mkSvcT(p.from);
      svc.handleCommand({ action: 'start_checklist', procedure_id: p.id });
      tickN(svc, 40);
      svc.handleCommand({ action: 'scram' });
      var s = tickN(svc, 60);
      var c = s.instructor.checklist;
      var want = !SCRIPTS[p.id];
      var saidIt = isTripMsg(s);
      if (!!c.trip_notice !== want) bad.push(p.id + ': banner ' + !!c.trip_notice + ', wanted ' + want);
      if (saidIt !== want) bad.push(p.id + ': comment ' + saidIt + ', wanted ' + want);
      if (!s.true_state.scrammed) bad.push(p.id + ': the scram did not take');
    });
    ck('2ai.3 a trip lights the banner AND the comment on all 5 covered legs, and on NEITHER exempt leg (#709)',
       bad.length === 0,
       bad.length ? bad.join('; ')
                  : 'covered: ' + POOL.filter(function (p) { return !SCRIPTS[p.id]; }).map(function (p) { return p.id; }).join(', ') +
                    '  |  exempt and silent: ' + POOL.filter(function (p) { return SCRIPTS[p.id]; }).map(function (p) { return p.id; }).join(', '));
  })();

  /* 2ai.4 — IT INFORMS; IT DOES NOT RESCUE. The player is being TOLD, not carried: the step
   * does not move, nothing is checked off, no acceptance is relieved and no row is graded
   * differently. That is the ruling's own boundary against the #788 casualty relief, which
   * DOES stand rows down, and against the per-step re-entry that was explicitly not built.
   *
   * ASSERTED BY A/B, not by reading the code. The same leg, same seed, same commands, same
   * tick counts, run twice — once normally and once with the mechanism neutered at its only
   * entry point (`legScriptsScram` forced true, so every leg is exempt and no notice is ever
   * raised). Every graded output must be IDENTICAL: step index, the whole done vector, the
   * acceptance verdict and the per-row verdicts. A one-sided check ("the step index did not
   * move") could not tell a mechanism that changes nothing from one that changes something the
   * probe was not watching. */
  (function () {
    var LEG = 'pwr_raise_power';
    function walk() {
      var svc = mkSvcT(POOL.filter(function (p) { return p.id === LEG; })[0].from);
      svc.handleCommand({ action: 'start_checklist', procedure_id: LEG });
      tickN(svc, 40);
      svc.handleCommand({ action: 'scram' });
      var s = tickN(svc, 120);
      var c = s.instructor.checklist;
      return { notice: !!c.trip_notice,
               sig: [c.step_index, (c.steps_done || []).map(function (d) { return d ? 1 : 0; }).join(''),
                     c.acc_met ? 1 : 0, c.graded_by || '', c.complete ? 1 : 0, c.awaiting_ack ? 1 : 0,
                     (c.accs || []).map(function (a) { return (a.met ? 1 : 0) + '' + (a.voided ? 'v' : ''); }).join(',')].join('|') };
    }
    var withNotice = walk();
    var real = RD.InstructorLayer.legScriptsScram;
    RD.InstructorLayer.legScriptsScram = function () { return true; };
    var without;
    try { without = walk(); } finally { RD.InstructorLayer.legScriptsScram = real; }
    ck('2ai.4 the notice changes NO grading — same leg, trip, A/B with the mechanism neutered (#709)',
       withNotice.notice === true && without.notice === false && withNotice.sig === without.sig,
       'notice on: ' + withNotice.sig + '   notice off: ' + without.sig);
  })();

  /* 2ai.5 — IT CLEARS ON PRESS TO RESET, AND NOTHING LATCHES. `trip_notice` is recomputed from
   * the live plant every tick, so the reset takes it straight back; latch it and this reddens.
   * Measured healthy -> tripped -> reset IN THAT ORDER on one service, because a check that
   * only samples the end state cannot tell a notice that cleared from one that never lit.
   *
   * `pwr_heatup` is the leg used because `reset_rps` carries a rods-in interlock and actually
   * takes there — measured: on `pwr_startup` and `pwr_cooldown` the reset is refused and the
   * plant stays tripped, where the notice correctly STAYS UP. That is the mechanism working,
   * not a leg to test the clear on. */
  (function () {
    var svc = mkSvcT('cold_shutdown');
    svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_heatup' });
    var s0 = tickN(svc, 40);
    var healthy = !s0.instructor.checklist.trip_notice && !isTripMsg(s0);
    svc.handleCommand({ action: 'scram' });
    var s1 = tickN(svc, 60);
    var lit = !!s1.instructor.checklist.trip_notice && isTripMsg(s1);
    svc.handleCommand({ action: 'reset_rps' });
    var s2 = tickN(svc, 30);
    var cleared = !s2.instructor.checklist.trip_notice && !isTripMsg(s2) && !s2.true_state.scrammed;
    ck('2ai.5 healthy -> tripped -> PRESS TO RESET clears both the banner and the comment (#709)',
       healthy && lit && cleared,
       'healthy ' + healthy + ' -> lit ' + lit + ' -> cleared ' + cleared +
       ' (scrammed ' + s2.true_state.scrammed + ')');
  })();

  /* 2ai.6 — AND IT CLEARS ON REWIND, which is the other route out the banner offers. The
   * walkthrough's own Rewind button is `{action:'rewind', steps:2, scope:'full', exact:true}`
   * (ui/app.js) — a loadState of a checkpoint, so it restores the INSTRUCTOR as well as the
   * plant, which is exactly where a latched notice would survive its own cause.
   *
   * The rewind actually LANDING is asserted first and separately. Without that clause a
   * refused rewind would leave the plant untripped-by-accident or the notice down for the
   * wrong reason, and the check could pass while testing nothing. */
  (function () {
    var svc = mkSvcT('cold_shutdown');
    svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_heatup' });
    tickN(svc, 40);
    svc.handleCommand({ action: 'scram' });
    var s1 = tickN(svc, 60);
    var lit = !!s1.instructor.checklist.trip_notice;
    svc.handleCommand({ action: 'rewind', steps: 1, scope: 'full', exact: true });
    var s2 = tickN(svc, 20);
    var landed = !s2.true_state.scrammed;
    var cleared = !s2.instructor.checklist.trip_notice && !isTripMsg(s2);
    ck('2ai.6 Rewind lands on a pre-trip plant and the notice goes with it (#709)',
       lit && landed && cleared,
       'lit ' + lit + ' -> rewind landed (scrammed ' + s2.true_state.scrammed + ') ' + landed +
       ' -> cleared ' + cleared);
  })();

  /* 2ai.7 — A MESSAGE RAISED ON A STEP MUST NOT OUTLIVE IT (#749 item 2, not re-opened).
   * Step 6's overtaken note stood at steps 9-17 AND on the completion card, telling a finished
   * player to stop withdrawing. The trip notice is a fact about the PLANT rather than about one
   * step, so it is re-raised on each step for as long as the trip stands — but a FINISHED
   * walkthrough has nothing left that "cannot continue", and the notice must be gone from the
   * completion card. Both halves are asserted here, because fixing one by hand breaks the other:
   * clearing the flag without re-raising retires the notice for good the first time any step
   * ticks while tripped, and re-raising without the completion branch puts it on the card.
   *
   * DRIVEN ON THE LAYER with a synthetic three-step procedure and hand-built snapshots. That is
   * legitimate HERE and nowhere else in this section: the detection reads `rps_state.scrammed` /
   * `true_state.scrammed` DIRECTLY, not through `readParam`, so a hand-built snapshot grades
   * exactly what the shipped path grades. The synthetic steps carry no `acc`/`saw`/`cmd` at all,
   * so nothing in them is graded through the instrument map either. Reaching the completion card
   * on a real leg would mean completing one while the reactor is tripped, which is the state the
   * whole finding says cannot be reached. */
  (function () {
    var inst = new RD.InstructorLayer();
    var SYN = { id: 'syn_trip_notice', title: 'synthetic', from: 'hot_full_power',
                steps: [{ text: 'one' }, { text: 'two' }, { text: 'three' }] };
    inst.loadChecklist(SYN, { procedure_id: 'syn_trip_notice', profile_key: 'pwr2' });
    var t = 0;
    function snap(tripped) {
      t += 1;
      return { metadata: { sim_time: t, plant_id: 'pwr2' },
               true_state: { scrammed: tripped }, rps_state: { scrammed: tripped } };
    }
    inst._stepChecklist(snap(false));            // arm on a healthy plant
    inst._stepChecklist(snap(false));
    var quiet = inst.pendingMessage === null && inst.checklist.scramSeen === false;
    inst._stepChecklist(snap(true));             // the trip
    var onStep1 = !!inst.pendingMessage && /reactor has tripped/i.test(inst.pendingMessage.learning);
    inst._checklistCheckOff('manual');           // the player presses Continue anyway
    var retired = inst.pendingMessage === null;  // the outgoing step's comment goes with the step
    inst._stepChecklist(snap(true));
    var onStep2 = !!inst.pendingMessage && /reactor has tripped/i.test(inst.pendingMessage.learning);
    inst._checklistCheckOff('manual');
    inst._stepChecklist(snap(true));
    var onStep3 = !!inst.pendingMessage;
    inst._checklistCheckOff('manual');           // idx now past the last step
    inst._stepChecklist(snap(true));             // the completion tick
    var done = inst.checklist.complete === true;
    var offCard = inst.pendingMessage === null && inst.checklist.scramSeen === false;
    ck('2ai.7 the notice is re-raised per step while the trip stands, and is GONE from the completion card (#749 item 2)',
       quiet && onStep1 && retired && onStep2 && onStep3 && done && offCard,
       'quiet ' + quiet + ' | step1 ' + onStep1 + ' | retired at check-off ' + retired +
       ' | step2 ' + onStep2 + ' | step3 ' + onStep3 + ' | complete ' + done +
       ' | off the completion card ' + offCard);
  })();
}

console.log('\n' + '='.repeat(74));
console.log('  run_checklist_pwr2: ' + nPass + ' passed, ' + nFail + ' failed  (' + (nPass + nFail) + ' checks)');
console.log('='.repeat(74) + '\n');
process.exit(nFail > 0 ? 1 : 0);
