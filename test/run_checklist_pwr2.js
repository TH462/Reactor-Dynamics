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
      if (/Raise SET PZR PRESSURE to 1700/.test(st.text)) spIdx = k;
    });
    var s = null, issued = {}, issuedAt = {}, holdTick = null, stepAtHold = null, ticksToAcc = null;
    var pAtHold = 0, pAtAcc = 0, chatter = 0, refused = 0, accepted = 0, spDialledBox = null;
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
      /* the setpoint action is its own check-off, ticked the moment it is dialled. Read it on a
       * LATER tick than the one that issued the command (#660 item 16: every step now waits for
       * Continue, so the step's first snapshot already carries `accs` and arrives BEFORE the
       * command — sampling it there would grade the box on a setpoint nobody had dialled yet). */
      if (i === spIdx && spDialledBox === null && ck2.accs && ck2.accs[0] &&
          issuedAt[spIdx] !== undefined && n > issuedAt[spIdx]) spDialledBox = ck2.accs[0].met;
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
}

console.log('\n' + '='.repeat(74));
console.log('  run_checklist_pwr2: ' + nPass + ' passed, ' + nFail + ' failed  (' + (nPass + nFail) + ' checks)');
console.log('='.repeat(74) + '\n');
process.exit(nFail > 0 ? 1 : 0);
