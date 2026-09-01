/*
 * test/procedures_harness.js — the full-stack procedure REPLAY machinery, shared
 * by test/run_procedures_stack.js (per-procedure, fresh IC each — the original
 * home of every line here, extracted 2026-08-06 for #395) and
 * test/run_procedures_chain.js (one CONTINUOUS plant across procedures — the
 * assertion a per-procedure IC reload is blind to by construction).
 *
 * The extraction is BEHAVIOUR-PRESERVING on purpose: run_procedures_stack's
 * score is the refactor-neutrality assertion (29/29 262/262 before and after).
 * The one new seam is `opts.svc` — hand runProcedure an existing service and it
 * replays the procedure on the plant AS IT SITS instead of constructing a fresh
 * service and reloading `proc.from`. Everything downstream (acc/saw/guard, the
 * stack-only assertions, refusal capture) is identical in both modes, which is
 * what makes a chain-vs-reload divergence attributable to the SEAM and nothing
 * else.
 *
 * Attaches RD.ProceduresHarness.
 */
;(function (RD) {
  'use strict';

  var PLANTS = {
    pwr: { plant: 'pwr', version: null },
    /* THE SHIPPED PLANT (#244/#526, 2026-08-31). The runner that passes 'pwr2' must have
     * loaded the pwr2 module set (run_checklist_pwr2.js is that runner); the pwr-only
     * runners never name this key, so nothing changes for them. IC names pass through
     * un-translated — RD.RETIRED_ENGINE_IC is the RETIRED engine's vocabulary shim. */
    pwr2: { plant: 'pwr2', version: null },
    rbmk_pre: { plant: 'rbmk', version: 'pre_chernobyl' },
    rbmk_post: { plant: 'rbmk', version: 'post_chernobyl' },
    bwr: { plant: 'bwr', version: null },
  };

  // Categories where a scram / standing critical alarm is the intended outcome,
  // not a failure of the procedure.
  var CASUALTY_CATEGORIES = { emergency: true, accident: true };

  // Commands that deliberately trip the reactor. A shutdown procedure scrams ON
  // PURPOSE, so a scram at or after one of these is expected and REACTOR TRIP
  // standing afterwards is the correct end state — not a defect.
  var SCRAM_ACTIONS = { scram: true, manual_scram: true, az5: true };
  // Alarms that are the direct, correct consequence of an intended scram.
  var POST_SCRAM_ALARMS = { reactor_trip: true };

  // Time acceleration for the holds. The automation channels step at physics rate
  // inside tick() regardless, but the RPS/alarm `evaluate` runs once per broadcast,
  // so acceleration coarsens protection latency (the known #153 effect). 10x gives a
  // 1 s protection granularity — close enough to real-time that a trip this gate
  // reports is a trip a player would see.
  var ACCEL = 10;
  var SEC_PER_TICK = 1.0;   // ACCEL(10) x broadcastMs(100ms) = 1 s of sim per tick

  // RAMP steps (#310): re-issued every RAMP_EVERY sim-seconds. The full design
  // rationale (why ramps and not setpoint steps, the owner's keep ruling, the
  // measured -649 °C/hr step burst) lives in run_procedures_stack.js's header.
  var RAMP_EVERY = 10;
  // Piecewise-linear along `points` at fraction f of the step (equal time slices).
  function rampValue(points, f) {
    if (points.length === 1) return points[0];
    var x = Math.max(0, Math.min(1, f)) * (points.length - 1);
    var i = Math.min(points.length - 2, Math.floor(x));
    return points[i] + (points[i + 1] - points[i]) * (x - i);
  }

  function cmp(a, op, b, tol) {
    switch (op) { case '>': return a > b; case '<': return a < b; case '>=': return a >= b; case '<=': return a <= b;
      case '~': return Math.abs(a - b) <= (tol || 0); } return false;
  }
  function pred(ts, c) { return cmp(ts[c.p], c.op, c.v, c.tol); }

  function groupId(svc, which) {
    var gs = svc.engine.getControlState().rod_groups;
    for (var i = 0; i < gs.length; i++) { var fn = gs[i].function;
      if (which === 'control' && (fn === 'control' || fn === 'manual')) return gs[i].id;
      if (which === 'shutdown' && fn === 'shutdown') return gs[i].id; }
    return gs[0] && gs[0].id;
  }

  // A command result the stack refused. `handleCommand` returns a snapshot or null on
  // success; an unknown action comes back {type:'error'} and an interlock refusal
  // {type:'blocked'} (control_kernel.js) — the instructor's follow-mode gate uses the
  // same blocked shape.
  function refusal(r) {
    if (!r || typeof r !== 'object') return null;
    if (r.type === 'error' || r.type === 'blocked') return (r.code || r.type) + (r.message ? ': ' + r.message : '');
    return null;
  }

  function standingCritical(snap, scramWasCommanded) {
    return (snap.alarms || []).filter(function (a) {
      if (a.priority !== 'critical') return false;
      if (!a.state || a.state.indexOf('active') !== 0) return false;
      if (scramWasCommanded && POST_SCRAM_ALARMS[a.id]) return false;
      return true;
    }).map(function (a) { return a.id; });
  }

  // Replay one procedure through the full stack and return its check list.
  //   opts.seed  — instrument-noise seed for a freshly constructed service (default 42)
  //   opts.bare  — noDefaults (campaign) lineup for a freshly constructed service
  //   opts.svc   — CHAIN MODE: replay on this existing service, on the plant as it
  //                sits — no construction, no selectPlant, no IC reload. The caller
  //                owns the service's lineup, accel and attention-stop settings.
  function runProcedure(profKey, proc, opts) {
    opts = opts || {};
    var svc = opts.svc;
    if (!svc) {
      var P = PLANTS[profKey];
      svc = new RD.SimulationService({ seed: opts.seed != null ? opts.seed : 42 });
      /* the RETIRED engine's IC vocabulary — see RD.RETIRED_ENGINE_IC's note in
       * ui/manual_procedures.js. pwr2 (and rbmk/bwr) take the authored name as-is. */
      svc.selectPlant(P.plant,
                      P.plant === 'pwr' ? RD.RETIRED_ENGINE_IC(proc.from) : proc.from,
                      P.version, opts.bare ? { noDefaults: true } : undefined);
      svc.running = true;                       // gates drive tick() directly
      svc.timeAcceleration = ACCEL;
      // …and it has to STAY at ACCEL. `_attentionStop` drops fast-forward to 1× on the
      // first alarm/scram/failure on a quiet board and nothing puts it back, so this
      // harness used to declare 10× and then run most procedures at 1× from a few
      // seconds in — every step downstream judged on a TENTH of the sim time its author
      // declared. That is what misfiled `bwr_startup` step 2 as a BWR plant defect
      // (#245; see the removed xfail in run_procedures_stack.js). The dropout is a
      // comfort feature for a HUMAN at the board — a headless gate has no one to
      // protect — and `attentionStops` is the supported way to say so (it is the
      // Settings → Fast-forward dropout toggle). `run_autoctl` expresses the same rule
      // differently, by re-asserting the speed each cycle; both say "a headless probe
      // gets its full sim-time budget". The mechanism itself is covered by run_m5
      // (scram/failure/alarm reasons, the on/off setting, and its survival across a
      // state restore), so turning it off here costs no coverage.
      svc.attentionStops = false;
    }

    var checks = [];
    var casualty = !!CASUALTY_CATEGORIES[proc.category];
    var gNever = (proc.guard && proc.guard.never || []).map(function (c) { return { c: c, hit: false }; });
    var meltHit = false, scramStep = null, scramReason = null, scramCmdStep = null;
    var refusals = [];

    function observe(snap) {
      var ts = snap.true_state;
      if (ts.melted) meltHit = true;
      gNever.forEach(function (g) { if (pred(ts, g.c)) g.hit = true; });
      if (scramStep === null && snap.rps_state && snap.rps_state.scrammed) {
        scramStep = curStep; scramReason = snap.rps_state.last_trip_reason || '(no reason given)';
      }
    }

    // Ticks that advanced less sim time than SEC_PER_TICK claims. Asserted below, so
    // #245 cannot come back quietly: the whole defect was that the harness went on
    // reporting "10× accel" in its header while the runs underneath it did not.
    var slowTicks = 0, firstSlow = null;

    var curStep = 0, lastSnap = null;
    (proc.steps || []).forEach(function (st, idx) {
      curStep = idx + 1;
      function issue(cmd) {
        /* The pwr2 shell REFUSES BY THROWING (#505 made refusals visible; the retired
         * engine returns {type:'error'} instead). Both are the same fact to a replay —
         * the command did not land — so both record as a refusal string. */
        var why;
        try { why = refusal(svc.handleCommand(cmd)); }
        catch (e) { why = String(e && e.message || e).slice(0, 140); }
        if (why) refusals.push('step ' + curStep + ' ' + cmd.action + ' → ' + why);
      }
      // A ramp step's `cmd` is the REPRESENTATIVE action (what the instructor watches
      // for); the ramp entries are what actually drives the plant, so issuing both
      // would put the leg's end value on the board at t=0 — the step the ramp exists
      // to avoid.
      if (st.cmd && !st.ramp) {
        var cmd = {};
        for (var k in st.cmd) cmd[k] = st.cmd[k];
        if (cmd.group_id === 'control' || cmd.group_id === 'shutdown') cmd.group_id = groupId(svc, cmd.group_id);
        if (SCRAM_ACTIONS[cmd.action] && scramCmdStep === null) scramCmdStep = curStep;
        issue(cmd);
      }
      // cmd-kind multi-check-off entries (#244 item 8) are operator actions of this step
      // — the replay performs them the way the player would (the 1/M "Plot point" case).
      if (st.accs && st.accs.length) {
        st.accs.forEach(function (en) {
          if (en && en.cmd) issue(typeof en.cmd === 'string' ? { action: en.cmd }
                                                            : JSON.parse(JSON.stringify(en.cmd)));
        });
      }
      // `saw` may be ONE predicate or a LIST of them (#348) — see the note in
      // run_procedures.js. Kept identical here on purpose: this runner exists to assert the
      // SAME predicates through the stack, so a schema the two disagree on is worse than none.
      var sawList = st.saw ? (Array.isArray(st.saw) ? st.saw : [st.saw]) : [];
      var sawHits = [], ticks = Math.round((st.hold || 0) / SEC_PER_TICK);
      for (var i = 0; i < ticks; i++) {
        if (st.ramp && (i % RAMP_EVERY === 0)) {
          var f = i / Math.max(1, ticks - 1);
          st.ramp.forEach(function (r) { var c = { action: r.action }; c[r.arg] = rampValue(r.points, f); issue(c); });
        }
        var s = svc.tick();
        if (!s) continue;
        lastSnap = s;
        if (s.metadata && s.metadata.time_acceleration < ACCEL) {
          if (!slowTicks) firstSlow = 'step ' + curStep + ' @ t=' + s.metadata.sim_time.toFixed(1) +
            ' → ' + s.metadata.time_acceleration + '×' +
            (s.metadata.speed_snap ? ' (' + s.metadata.speed_snap.reason + ')' : '');
          slowTicks++;
        }
        observe(s);
        sawList.forEach(function (sw, k) { if (pred(s.true_state, sw)) sawHits[k] = true; });
      }
      // Land the ramp exactly on its last point: `f` never quite reaches 1 when
      // `ticks` is not a multiple of RAMP_EVERY, and a leg that stops a few tenths of
      // a psi short would leave the next leg's `from` wrong.
      if (st.ramp) st.ramp.forEach(function (r) { var c = { action: r.action }; c[r.arg] = r.points[r.points.length - 1]; issue(c); });
      if (!lastSnap) lastSnap = svc._assembleWithInstructor();
      sawList.forEach(function (sw, k) {
        checks.push({ d: 'step ' + curStep + ' saw ' + sw.p + ' ' + sw.op + ' ' + sw.v, pass: !!sawHits[k], obs: !!sawHits[k] });
      });
      if (st.acc) {
        var ts = lastSnap.true_state;
        checks.push({ d: 'step ' + curStep + ' ' + st.acc.p + ' ' + st.acc.op + ' ' + st.acc.v, pass: pred(ts, st.acc), obs: ts[st.acc.p] });
      }
      /* MULTI-CHECK-OFF steps (#244 item 8): predicate entries are asserted at the step's
       * end exactly like `acc`; cmd-kind entries were issued above as operator actions of
       * this step, so their evidence is the acceptance-free issue itself (the live runtime
       * latches them off the command watch — that half is run_checklist's subject). */
      if (st.accs && st.accs.length) {
        var tsA = lastSnap.true_state;
        st.accs.forEach(function (en, k) {
          if (en && en.p) checks.push({
            d: 'step ' + curStep + ' accs[' + k + '] ' + en.p + ' ' + en.op + ' ' + en.v,
            pass: pred(tsA, en), obs: tsA[en.p] });
        });
      }
    });
    if (!lastSnap) lastSnap = svc._assembleWithInstructor();

    // ---- the stack-only assertions ----
    checks.push({ d: 'stack: every step command accepted', pass: refusals.length === 0,
      obs: refusals.length ? refusals.join('; ') : 'all accepted' });

    // The run got the sim time its steps were written against (#245).
    checks.push({ d: 'stack: ran at the declared ' + ACCEL + '× throughout', pass: slowTicks === 0,
      obs: slowTicks ? slowTicks + ' slow ticks, first at ' + firstSlow : ACCEL + '× for every tick' });

    if (!casualty) {
      // "Unexpected" means the plant tripped without the procedure asking it to, or
      // tripped BEFORE the step that asks. A shutdown that scrams at its scram step
      // is doing its job.
      var expectedScram = scramCmdStep !== null && scramStep !== null && scramStep >= scramCmdStep;
      checks.push({ d: 'stack: no unexpected scram', pass: scramStep === null || expectedScram,
        obs: scramStep === null ? 'never scrammed'
          : expectedScram ? 'scrammed at step ' + scramStep + ' as commanded'
          : 'scrammed at step ' + scramStep + ' — ' + scramReason });
      var crit = standingCritical(lastSnap, scramCmdStep !== null);
      checks.push({ d: 'stack: no critical alarm standing at end', pass: crit.length === 0,
        obs: crit.length ? crit.join(', ') : (scramCmdStep !== null ? 'none beyond the commanded trip' : 'none') });
    }

    // A procedure that declares an automation lineup must actually be left in it.
    if (proc.auto_channels && proc.auto_channels.length) {
      var chans = (lastSnap.automation && lastSnap.automation.channels) || [];
      var missing = proc.auto_channels.filter(function (id) {
        for (var i = 0; i < chans.length; i++) if (chans[i].id === id) return !chans[i].engaged;
        return true;   // declared a channel this plant does not have
      });
      checks.push({ d: 'stack: declared auto_channels engaged', pass: missing.length === 0,
        obs: missing.length ? 'not engaged: ' + missing.join(', ') : proc.auto_channels.join(', ') });
    }

    if (proc.guard && proc.guard.never_melted) checks.push({ d: 'guard: never melted', pass: !meltHit, obs: meltHit });
    gNever.forEach(function (g) { checks.push({ d: 'guard: never ' + g.c.p + ' ' + g.c.op + ' ' + g.c.v, pass: !g.hit, obs: g.hit }); });

    return { pass: checks.every(function (c) { return c.pass; }), checks: checks, svc: svc, lastSnap: lastSnap };
  }

  RD.ProceduresHarness = {
    PLANTS: PLANTS,
    CASUALTY_CATEGORIES: CASUALTY_CATEGORIES,
    SCRAM_ACTIONS: SCRAM_ACTIONS,
    POST_SCRAM_ALARMS: POST_SCRAM_ALARMS,
    ACCEL: ACCEL,
    SEC_PER_TICK: SEC_PER_TICK,
    RAMP_EVERY: RAMP_EVERY,
    rampValue: rampValue,
    cmp: cmp,
    pred: pred,
    groupId: groupId,
    refusal: refusal,
    standingCritical: standingCritical,
    runProcedure: runProcedure,
  };
})(globalThis.RD || (globalThis.RD = {}));
