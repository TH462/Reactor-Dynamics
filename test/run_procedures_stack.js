/*
 * test/run_procedures_stack.js — the authored operator procedures
 * (ui/manual_procedures.js) driven through the FULL STACK.
 *
 * WHY THIS EXISTS (and how it differs from run_procedures.js)
 * ----------------------------------------------------------
 * `run_procedures.js` constructs a bare engine and calls `applyCommand`/`step` on
 * it. That proves the PHYSICS of a procedure: the commands, in that order, with
 * those holds, reach the stated end state. What it cannot prove is that the
 * procedure works for a PLAYER, because a player's commands descend through M4
 * (interlocks, trips, automation channels, command interception) and M5/M6 — none
 * of which exist in an engine-direct run.
 *
 * That blind spot has now cost us twice (issue #202, #206):
 *   - `pwr_startup` never commanded feedwater. Engine-direct, the engine's own
 *     coupled-feed fallback held SG level and the gate stayed green; under the
 *     stack nothing regulated level, AFW pinned it at 21 % and the plant sat in a
 *     standing amber alarm for the whole ascent.
 *   - `pwr_heatup` passes engine-direct but floods the SG to ~95 % under the stack
 *     and never goes critical.
 * Neither is a physics bug. Both are invisible below M4 by construction.
 *
 * WHAT THIS GATE ADDS
 * -------------------
 * It replays the SAME steps and asserts the SAME `acc`/`saw`/`guard` predicates
 * against `true_state`, so any divergence from `run_procedures.js` is attributable
 * to the stack and nothing else. On top of that it asserts four things only the
 * stack can see:
 *   1. every step's command was ACCEPTED — not rejected as unknown (`type:'error'`)
 *      nor refused by an interlock (`type:'blocked'`). Engine-direct silently
 *      swallows both.
 *   2. no UNEXPECTED SCRAM during a normal-category procedure (startup / power /
 *      control / shutdown). This is the item-6 class: the startup net scramming an
 *      ascent that never blocked its trips.
 *   3. no CRITICAL alarm left standing at the end of a normal-category procedure.
 *      This is the item-5 class: a procedure that "completes" into a degraded plant.
 *   4. the plant is left in the automation lineup the procedure claims — any
 *      `auto_channels` it declares are actually engaged at the end.
 * Emergency/accident procedures are exempt from 2 and 3: a scram and standing
 * critical alarms are the POINT of those.
 *
 *   node test/run_procedures_stack.js                 all procedures
 *   node test/run_procedures_stack.js pwr_startup     one by id
 *   node test/run_procedures_stack.js --lineup=bare   noDefaults (campaign) lineup
 *
 * LINEUP. Procedures are validated in the free-play default lineup by default —
 * what a player running the live checklist actually gets. `--lineup=bare` runs the
 * `noDefaults` lineup that campaign missions and Path-2 walkthroughs use
 * (simulation_service.js selectPlant opts). The two are genuinely different plants
 * to operate; see the #202 SG-level table.
 */
'use strict';
var C = '\x1b[36m', G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', Y = '\x1b[33m', X = '\x1b[0m';

require('../engines/load_mode.js');
// Same load order as run_procedures.js, plus the three layers above the engines.
['engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js',
 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js', 'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
 'layers/control/rbmk_control.js', 'engines/rbmk/rbmk_config.js', 'engines/rbmk/rbmk_kinetics.js', 'engines/rbmk/rbmk_thermal.js',
 'engines/rbmk/rbmk_rods.js', 'engines/rbmk/rbmk_instruments.js', 'engines/rbmk/rbmk_engine.js',
 'engines/bwr/bwr_config.js', 'layers/control/bwr_control.js', 'engines/bwr/bwr_vessel.js', 'engines/bwr/bwr_recirculation.js',
 'engines/bwr/bwr_safety_systems.js', 'engines/bwr/bwr_instruments.js', 'engines/bwr/bwr_engine.js',
 'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js'
].forEach(function (f) { require('../' + f); });
require('../ui/manual_procedures.js');
var RD = globalThis.RD;

var argv = process.argv.slice(2);
var ONLY = null, BARE = false;
argv.forEach(function (a) {
  if (a === '--lineup=bare') BARE = true;
  else if (a === '--lineup=default') BARE = false;
  else if (a.charAt(0) !== '-') ONLY = a;
});

var PLANTS = {
  pwr: { plant: 'pwr', version: null },
  rbmk_pre: { plant: 'rbmk', version: 'pre_chernobyl' },
  rbmk_post: { plant: 'rbmk', version: 'post_chernobyl' },
  bwr: { plant: 'bwr', version: null },
};

// Categories where a scram / standing critical alarm is the intended outcome, not
// a failure of the procedure.
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

// RAMP steps (#310). A step carrying `ramp` walks a setpoint along an authored
// polyline across its `hold` instead of stepping it once — the operator holding the
// ▼ on a setpoint box, not typing one number. Re-issued every RAMP_EVERY sim-seconds.
//
// WHY THE SCHEMA HAD TO GROW, measured, because the cheap answer was tried first: a
// DISCRETE walk-down of the steam-dump setpoint cannot hold a programmed cooldown on
// this plant. The dump's proportional band is 0.25 MPa against a 40 % capacity, and
// the primary follows the secondary with tau ~ 37 s, so a step of dT bursts at
// roughly dT/tau. Measured on `hot_zero_power`, full stack: a 10 °C step peaks at
// **-649 °C/hr** (-1168 °F/hr) over its first 30 s and is done in four minutes, then
// the plant sits. Holding the -50 °C/hr programme that way needs dT <= ~0.8 °C, i.e.
// ~250 steps for the 297 -> 93 °C ride. The ramp does it in four.
//
// The LIVE checklist never issues `cmd` (ui/app.js renderChecklist is text +
// highlights; the instructor grades off `acc` and watches for the player's own
// command), so this is a REPLAY-side field only — no UI change, and the instructor
// still recognises the step by its `cmd`.
var RAMP_EVERY = 10;      // sim-s between re-issues
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

// RD_SEED re-runs this gate on a different instrument-noise stream
// (`RD_SEED=7 node test/run_procedures_stack.js pwr_heatup`) without touching the
// baseline — the default is unchanged, so the gate itself is unaffected. Same
// convention as run_campaign.js.
//
// Added 2026-07-27b while reviewing #218. That fix moved a margin from 0.1 points
// to 26, but it was derived and validated on seed 42 alone — and the defect it
// fixed was a peak sitting 0.1 points under a trip setpoint, i.e. one decided by
// noise. A gate pinned to a single seed cannot see that class of problem at all,
// which is part of why this one survived.
var SEED = Number(process.env.RD_SEED) || 42;

function runProcedure(profKey, proc) {
  var P = PLANTS[profKey];
  var svc = new RD.SimulationService({ seed: SEED });
  svc.selectPlant(P.plant, proc.from, P.version, BARE ? { noDefaults: true } : undefined);
  svc.running = true;                       // gates drive tick() directly
  svc.timeAcceleration = ACCEL;
  // …and it has to STAY at ACCEL. `_attentionStop` drops fast-forward to 1× on the
  // first alarm/scram/failure on a quiet board and nothing puts it back, so this
  // harness used to declare 10× and then run most procedures at 1× from a few
  // seconds in — every step downstream judged on a TENTH of the sim time its author
  // declared. That is what misfiled `bwr_startup` step 2 as a BWR plant defect
  // (#245; see the removed xfail below). The dropout is a comfort feature for a
  // HUMAN at the board — a headless gate has no one to protect — and `attentionStops`
  // is the supported way to say so (it is the Settings → Fast-forward dropout
  // toggle). `run_autoctl` expresses the same rule differently, by re-asserting the
  // speed each cycle; both say "a headless probe gets its full sim-time budget".
  // The mechanism itself is covered by run_m5 (scram/failure/alarm reasons, the
  // on/off setting, and its survival across a state restore), so turning it off
  // here costs no coverage.
  svc.attentionStops = false;

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
      var why = refusal(svc.handleCommand(cmd));
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
    var sawHit = false, ticks = Math.round((st.hold || 0) / SEC_PER_TICK);
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
      if (st.saw && pred(s.true_state, st.saw)) sawHit = true;
    }
    // Land the ramp exactly on its last point: `f` never quite reaches 1 when
    // `ticks` is not a multiple of RAMP_EVERY, and a leg that stops a few tenths of
    // a psi short would leave the next leg's `from` wrong.
    if (st.ramp) st.ramp.forEach(function (r) { var c = { action: r.action }; c[r.arg] = r.points[r.points.length - 1]; issue(c); });
    if (!lastSnap) lastSnap = svc._assembleWithInstructor();
    if (st.saw) checks.push({ d: 'step ' + curStep + ' saw ' + st.saw.p + ' ' + st.saw.op + ' ' + st.saw.v, pass: sawHit, obs: sawHit });
    if (st.acc) {
      var ts = lastSnap.true_state;
      checks.push({ d: 'step ' + curStep + ' ' + st.acc.p + ' ' + st.acc.op + ' ' + st.acc.v, pass: pred(ts, st.acc), obs: ts[st.acc.p] });
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

  return { pass: checks.every(function (c) { return c.pass; }), checks: checks };
}

/* Known-fails: documented defects with a filed issue, whose acceptance test lives
 * here. STRICT XFAIL — an XFAIL reports but does not redden the gate; if the
 * underlying defect gets FIXED the check XPASSes and the gate goes RED, so the
 * annotation cannot go stale silently. Same convention as run_procedures.js,
 * run_behavior.js and run_meltdown.js. */
var KNOWN_FAILS = {
  /* #206 (pwr_heatup) — FOUR of the original seven xfails are fixed and removed; the
   * heatup now actually heats (Tavg 50 → 297 °C, secondary bottled to the 8.20 MPa
   * no-load anchor, Mode 3 reached). Fixed: the procedure never blocked the startup
   * net it walks straight into (IR HIGH scram at ~20 %); it held a standing 30 %
   * manual feed-pump demand instead of engaging Feed AUTO; and it left the turbine in
   * FOLLOW, so the governor took the steam and the ride stalled at 240 °C. Under all
   * three sat a real control bug — the three-element channel read `steam_flow`
   * (turbine only) instead of total SG draw — now fixed via `sg_steam_flow`.
   *
   * WHAT REMAINS (still #206, precisely characterised): across the heatup's long
   * low-power holds the SG fills on a persistent ~0.001-normalized feed trickle
   * against ZERO steam demand — TRUE narrow level 65.0 → 75.8 % with fw pinned at
   * 0.001 — and keeps climbing to ~90 % during the ride. When Tavg reaches the
   * no-load point the dump opens, the generator finally boils, and the accumulated
   * inventory swings the other way: level collapses through the 17 % lo-lo and
   * scrams. Nothing regulates it because the channel reports "holding" throughout —
   * it cannot pump water OUT, so it is saturated at u=0 with level far above
   * setpoint. The boron xfail below is downstream of that scram, not independent.
   * NOTE it is knife-edge: this outcome flips on instrument-noise ordering alone
   * (with sg_steam_flow at noise 0.01 the same run held 65 % and passed 19/19).
   *
   * RESOLVED 2026-07-26c (#210) — all three removed, pwr_heatup is 19/19 green. The
   * "trickle" was not noise and not physics: the PID output deadband (`minDelta`)
   * stranded the channel's LAST small pump demand. Wanting u = 0 after last sending
   * 0.13 %, it never sent again (|0 − 0.13| < minDelta 1.0), so a 0.13 % feed stood
   * for the rest of the run against ZERO steam draw. Fixed in control_kernel.js:
   * minDelta no longer suppresses the step onto a rail. Measured: TRUE level now
   * holds 65.5 % across every hold (was 65.0 → 75.8 → collapse). */
  /* #218 (pwr_heatup) — RESOLVED 2026-07-27b, all three xfails removed.
   *
   * CORRECTION, same day, and worth reading before trusting any peak number here.
   * I first reported the pre-fix peak as 49.9 % against a 50 % permissive and called
   * it "a knife-edge sitting exactly on the setpoint", and called the procedure's
   * "roughly 55 %" caution a stale number. Both claims were WRONG, and wrong for an
   * instructive reason: 49.9 % was a CENSORED observation. The P-9 trip fired at
   * 50 % and truncated the rise, so what I measured was where the protection cut the
   * trajectory, not where it was heading. Re-measured with P-9 temporarily disabled,
   * the free-running peak is 66.2 % (P-9 crossed at t=6045s, 16.2 points of
   * overshoot). The caution's "roughly 55 %" was an UNDERSTATEMENT, not an error.
   * Nor was it a knife-edge: swept across 8 seeds, the pre-fix procedure scrams on
   * every one, and the post-fix procedure passes on every one.
   *
   * The lesson generalises: never read a peak off a run that a trip terminated. The
   * trip is a censor, and the number it leaves behind is the setpoint, not the peak.
   *
   * Cause: step 14 diluted at a fixed 4300 s hold. Traced at 300 s resolution, Tavg
   * reaches the no-load anchor at t~5700 — about 3800 s in — after which the dump
   * pins temperature and the remaining ~500 s of dilution has nowhere to go but
   * power: 6.1 % at t=5476, 19.5 % at t=5776, and on toward 66 % if nothing stops
   * it. The step's own text already said to "secure the dilution as Tavg reaches the
   * hot band"; the fixed hold just wasn't doing it. Hold 4300 -> 3900 stops dilution
   * at arrival: peak 23.8 %, 26 points of margin.
   *
   * Verified as a COUNTERFACTUAL, not just a green gate (HR10): 8 seeds pre-fix, all
   * 8 scram; 8 seeds post-fix, all 8 pass 19/19. RD_SEED was added to this runner to
   * make that sweep possible — it had been pinned to seed 42, and a single-seed gate
   * cannot see a noise-sensitive margin at all.
   *
   * The boron xfail was indeed downstream of the scram and cleared with it —
   * confirmed by the gate, not assumed. */

  /* #208 — RBMK/BWR procedures that diverge under the stack. Those plants are ON
   * HOLD (see CLAUDE.md); these are recorded so the findings survive until they
   * reopen, NOT scheduled. Strict xfail: if one starts passing, the gate reddens
   * and the annotation must be removed. */
  'rbmk_pre·rbmk_raise_power': { 'step 1 power_pct > 51': '#208 on-hold' },
  'rbmk_post·rbmk_raise_power': { 'step 1 power_pct > 51': '#208 on-hold' },
  /* 'rbmk_pre·rbmk_mcp_trip' / 'rbmk_post·rbmk_mcp_trip' — step 2 `power_pct < 12`
   * REMOVED 2026-07-29 with the #245 fix, and 'bwr·bwr_sbo_rcic' step 3
   * `vessel_level_pct > 40` (was 25.38) with them. Same story as bwr_startup above,
   * three more times: each ran at 1× from an early dropout, so each was judged on a
   * TENTH of its declared sim time — power had a tenth of the time to fall after the
   * pump trip, RCIC a tenth of the time to refill the vessel. Given their intended
   * 10×, all three pass. That is FOUR "RBMK/BWR plant defects" under #208 that were
   * one test-harness bug; #208's remaining entries deserve the same suspicion when
   * those plants reopen.
   *
   * The same caveat as bwr_startup applies and is the whole point of repeating it:
   * this establishes the MECHANISM, not that the RBMK or the BWR is right. Nobody
   * has re-derived these steps from the plant. Not chased — both plants are ON HOLD
   * (owner, 2026-07-29: "We are not working on the BWR right now"). **When they
   * reopen, re-derive rather than inheriting the green.** */
  /* 'bwr·bwr_startup' — step 2 `power_pct > 1` REMOVED 2026-07-29. It was never a
   * BWR physics defect. Measured cause: at t=2.0 s the BWR's RCIC RUNNING
   * annunciator (priority `status`) came in on an otherwise quiet board, the
   * service's attention stop counted it as "first alarm", and `timeAcceleration`
   * dropped 10× → 1× — permanently, because this harness sets ACCEL once at line
   * 152 and never restores it. The procedure then covered a TENTH of the sim time
   * its steps assume, and step 2 observed power_pct = 0.
   *
   * #240's follow-up ruling (status-class alarms arrive pre-acknowledged, so a
   * status arrival is not an attention event) removed that dropout, the run got
   * the 10× it declares, and the step passes.
   *
   * WHAT THIS DOES **NOT** ESTABLISH — read before you treat the green as a
   * clean bill of health for the BWR. What was demonstrated is the MECHANISM:
   * the harness was starving the run of sim time, and it no longer is. Nobody
   * has independently checked that BWR startup behaviour is otherwise right.
   * "Passes once it gets the time its author intended" is a weaker claim than
   * "the plant does the correct thing", and a genuinely slow ascent would be
   * hidden by the same 10×. The original #208 filing may have been observing
   * something real on top of this. It was not chased because BWR is ON HOLD
   * (owner, 2026-07-29: "We are not working on the BWR right now") — so this is
   * a note, not a deferral anyone has scheduled. **When BWR reopens, re-derive
   * this step from the plant rather than inheriting the green.**
   *
   * Also: the fix is in the SERVICE, not in the BWR. The remaining ten dropouts
   * in this suite still cost their procedures 90 % of their sim time from the
   * moment they fire — filed as **#245**. If that is fixed, several numbers here
   * will move again, this one included.
   *
   * FIXED 2026-07-29 (#245): `svc.attentionStops = false` at the top of
   * runProcedure, and a per-procedure assertion that the run held the declared
   * acceleration throughout. Three more xfails cleared with it — see below. */
};

var suites = 0, suitesPass = 0, total = 0, passed = 0, narr = 0, skipped = 0, xfails = 0, xpassBad = 0;
console.log(B + 'Full-stack procedure gate' + X + D + '  (lineup: ' + (BARE ? 'noDefaults / campaign' : 'free-play defaults') +
  ', ' + ACCEL + '× accel)' + X + '\n');

Object.keys(RD.MANUAL_PROCEDURES).forEach(function (profKey) {
  RD.MANUAL_PROCEDURES[profKey].forEach(function (proc) {
    if (ONLY && proc.id !== ONLY) { skipped++; return; }
    if (proc.narrative) {
      narr++;
      console.log(C + 'NARR' + X + '  ' + B + profKey + ' · ' + proc.id + X + D + ' (' + proc.category + ' — narrative; engine flagship suite owns validation)' + X);
      return;
    }
    var known = KNOWN_FAILS[profKey + '·' + proc.id] || {};
    var r = runProcedure(profKey, proc);
    var effectivePass = true;
    r.checks.forEach(function (c) {
      var tag = known[c.d];
      if (tag && !c.pass) c.xfail = tag;
      else if (tag && c.pass) { c.xpass = tag; effectivePass = false; }
      else if (!c.pass) effectivePass = false;
    });
    suites++; if (effectivePass) suitesPass++;
    console.log((effectivePass ? G + 'PASS' : R + 'FAIL') + X + '  ' + B + profKey + ' · ' + proc.id + X + D + ' (' + proc.category + ')' + X);
    r.checks.forEach(function (c) {
      total++;
      var obs = typeof c.obs === 'number' ? Math.round(c.obs * 100) / 100 : c.obs;
      if (c.xfail) { xfails++; passed++;
        console.log(Y + '  ✗(known ' + c.xfail + ')' + X + ' ' + c.d + D + '  (' + obs + ' — filed defect)' + X); return; }
      if (c.xpass) { xpassBad++;
        console.log(R + '  ✓(XPASS ' + c.xpass + '!)' + X + ' ' + c.d + D + '  (defect fixed — remove the KNOWN_FAILS entry)' + X); return; }
      if (c.pass) passed++;
      console.log((c.pass ? G + '  ✓' : R + '  ✗') + X + ' ' + c.d + D + '  (' + obs + ')' + X);
    });
  });
});

console.log('\n' + B + '──────────' + X);
console.log(B + 'Procedures (full stack): ' + suitesPass + '/' + suites + X + '   Checks: ' + (passed === total ? G : R) + passed + '/' + total + X +
  '   (' + narr + ' narrative' + (xfails ? ', ' + xfails + ' known-fail' : '') + (xpassBad ? ', ' + xpassBad + ' STALE XFAIL' : '') + ')');
process.exit(suitesPass === suites ? 0 : 1);
