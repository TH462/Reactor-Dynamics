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

function runProcedure(profKey, proc) {
  var P = PLANTS[profKey];
  var svc = new RD.SimulationService({ seed: 42 });
  svc.selectPlant(P.plant, proc.from, P.version, BARE ? { noDefaults: true } : undefined);
  svc.running = true;                       // gates drive tick() directly
  svc.timeAcceleration = ACCEL;

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

  var curStep = 0, lastSnap = null;
  (proc.steps || []).forEach(function (st, idx) {
    curStep = idx + 1;
    if (st.cmd) {
      var cmd = {};
      for (var k in st.cmd) cmd[k] = st.cmd[k];
      if (cmd.group_id === 'control' || cmd.group_id === 'shutdown') cmd.group_id = groupId(svc, cmd.group_id);
      if (SCRAM_ACTIONS[cmd.action] && scramCmdStep === null) scramCmdStep = curStep;
      var why = refusal(svc.handleCommand(cmd));
      if (why) refusals.push('step ' + curStep + ' ' + cmd.action + ' → ' + why);
    }
    var sawHit = false, ticks = Math.round((st.hold || 0) / SEC_PER_TICK);
    for (var i = 0; i < ticks; i++) {
      var s = svc.tick();
      if (!s) continue;
      lastSnap = s;
      observe(s);
      if (st.saw && pred(s.true_state, st.saw)) sawHit = true;
    }
    if (!lastSnap) lastSnap = svc._assembleWithInstructor();
    if (st.saw) checks.push({ d: 'step ' + curStep + ' saw ' + st.saw.p + ' ' + st.saw.op + ' ' + st.saw.v, pass: sawHit, obs: sawHit });
    if (st.acc) {
      var ts = lastSnap.true_state;
      checks.push({ d: 'step ' + curStep + ' ' + st.acc.p + ' ' + st.acc.op + ' ' + st.acc.v, pass: pred(ts, st.acc), obs: ts[st.acc.p] });
    }
  });
  if (!lastSnap) lastSnap = svc._assembleWithInstructor();

  // ---- the four stack-only assertions ----
  checks.push({ d: 'stack: every step command accepted', pass: refusals.length === 0,
    obs: refusals.length ? refusals.join('; ') : 'all accepted' });

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
  /* #218 — pwr_heatup drives above P-9 (~50 % power) with the turbine offline, and the
   * new Reactor Trip on Turbine Trip correctly scrams it (#216). A real plant would
   * never sit above 50 % power with the turbine tripped, so the PROCEDURE is asking for
   * something the protection is right to refuse — the heatup's own caution says it uses
   * "10-30 % power", so it is overshooting its own stated band. Fix belongs in the
   * procedure (cap the heatup below P-9), not in the plant. Boron is downstream of the
   * scram, not independent. Strict xfail: reddens if the procedure is fixed. */
  'pwr·pwr_heatup': {
    'stack: no unexpected scram': '#218 heatup exceeds P-9',
    'stack: no critical alarm standing at end': '#218 heatup exceeds P-9',
    'step 17 boron_ppm > 900': '#218 (downstream of the P-9 scram)',
  },

  /* #208 — RBMK/BWR procedures that diverge under the stack. Those plants are ON
   * HOLD (see CLAUDE.md); these are recorded so the findings survive until they
   * reopen, NOT scheduled. Strict xfail: if one starts passing, the gate reddens
   * and the annotation must be removed. */
  'rbmk_pre·rbmk_raise_power': { 'step 1 power_pct > 51': '#208 on-hold' },
  'rbmk_post·rbmk_raise_power': { 'step 1 power_pct > 51': '#208 on-hold' },
  'rbmk_pre·rbmk_mcp_trip': { 'step 2 power_pct < 12': '#208 on-hold' },
  'rbmk_post·rbmk_mcp_trip': { 'step 2 power_pct < 12': '#208 on-hold' },
  'bwr·bwr_startup': { 'step 2 power_pct > 1': '#208 on-hold' },
  'bwr·bwr_sbo_rcic': { 'step 3 vessel_level_pct > 40': '#208 on-hold (B3 under the stack)' },
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
