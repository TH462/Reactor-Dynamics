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
['engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_pressurizer2.js',
 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js', 'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
 'layers/control/rbmk_control.js', 'engines/rbmk/rbmk_config.js', 'engines/rbmk/rbmk_kinetics.js', 'engines/rbmk/rbmk_thermal.js',
 'engines/rbmk/rbmk_rods.js', 'engines/rbmk/rbmk_instruments.js', 'engines/rbmk/rbmk_engine.js',
 'engines/bwr/bwr_config.js', 'layers/control/bwr_control.js', 'engines/bwr/bwr_vessel.js', 'engines/bwr/bwr_recirculation.js',
 'engines/bwr/bwr_safety_systems.js', 'engines/bwr/bwr_instruments.js', 'engines/bwr/bwr_engine.js',
 'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js'
].forEach(function (f) { require('../' + f); });
require('../ui/manual_procedures.js');
require('./procedures_harness.js');
var RD = globalThis.RD;
// The replay machinery — PLANTS, the casualty/scram/alarm tables, the 10× accel
// contract (#245), ramp handling (#310), refusal capture and the stack-only
// assertions — was EXTRACTED VERBATIM to test/procedures_harness.js
// (2026-08-06, #395) so the continuous-chain gate (run_procedures_chain.js) can
// replay the same steps on a plant that is NOT reloaded per procedure. This
// runner's score is the refactor-neutrality assertion: 29/29 262/262 before
// and after the extraction.
var PH = RD.ProceduresHarness;
var ACCEL = PH.ACCEL;

var argv = process.argv.slice(2);
var ONLY = null, BARE = false;
argv.forEach(function (a) {
  if (a === '--lineup=bare') BARE = true;
  else if (a === '--lineup=default') BARE = false;
  else if (a.charAt(0) !== '-') ONLY = a;
});

// RAMP steps (#310). A step carrying `ramp` walks a setpoint along an authored
// polyline across its `hold` instead of stepping it once — the operator holding the
// ▼ on a setpoint box, not typing one number. Re-issued every RAMP_EVERY sim-seconds.
//
// KEEP IT *(OWNER RULING, 2026-08-02: "1 keep. 2. Keep. 3. Keep.", ruling on all three
// #310 judgement calls after raising the concern "I don't want to make the sim more
// complex. I don't think that['s] added features will help teach reactor dynamics more")*.
// The answer to that concern is that this is NOT sim complexity: #310 changed no file in
// `engines/`, `layers/` or `scenarios/`, and the player-facing surface is a checklist.
// `ramp` is replay-side test-harness code. Do not re-litigate it as a plant feature.
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
// (RAMP_EVERY, rampValue and the rest of the replay machinery live in
// test/procedures_harness.js since the #395 extraction.)

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

// Thin wrapper over the extracted machinery (test/procedures_harness.js) —
// same name, same call sites in the driver loop below.
function runProcedure(profKey, proc) {
  return PH.runProcedure(profKey, proc, { seed: SEED, bare: BARE });
}

/* Known-fails: documented defects with a filed issue, whose acceptance test lives
 * here. STRICT XFAIL — an XFAIL reports but does not redden the gate; if the
 * underlying defect gets FIXED the check XPASSes and the gate goes RED, so the
 * annotation cannot go stale silently. Same convention as run_procedures.js,
 * run_behavior.js and run_meltdown.js. */
var KNOWN_FAILS = {
  /* #206 (pwr_heatup) — FOUR of the original seven xfails are fixed and removed; the
   * heatup now actually heats (Tavg 50 → 286 °C, secondary bottled to the 7.0 MPa
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
  /* pwr2 replays in its own runner (run_checklist_pwr2.js) with the pwr2 module set —
   * this runner loads only the retired trio, so selectPlant('pwr2') here would throw. */
  if (profKey === 'pwr2') return;
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
