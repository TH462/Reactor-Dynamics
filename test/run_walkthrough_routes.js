/* run_walkthrough_routes.js — every walkthrough leg driven OFF its authored route (2026-09-24).
 *
 * *(OWNER DIRECTIVE, 2026-09-24: "Make the adjustments to your process as you recommend")* — the
 * recommendation: a ROUTE-VARIANT harness in the gate. Every gate we had drove a leg on its
 * authored replay only, and every defect in `pwr_startup` (Mode 3 -> Mode 1) was found by a
 * layman playthrough instead: step 9 stranded a pull to bank 235, step 17 was unfinishable at
 * LOAD 10 MWe, step 12 ticked on entry, a WITHDRAW tap un-ticked 9a, stated times held on the
 * authored route only (`Diagnostic/CHECKLIST_PLAYTEST_2026-09-2{3,4}_*.md`). This runner drives
 * the LIVE checklist runtime (the player's grading: Continue / awaiting_ack, overtaken, latch,
 * below_1m, the 1/M table) — NOT the replay's issue-every-cmd shortcut, which run_checklist_pwr2
 * already covers — on two kinds of route per leg:
 *
 *   typical   a player following the card LITERALLY: the first stopping point the text permits,
 *             the slowest acceptable reading, each control pressed once when its row is live,
 *             the speed the row's own `wait_speed` names (WARP on, as the player has it).
 *   mistakes  ONE scripted perturbation per run at one step (overshoot, undershoot, wrong order,
 *             press early, double press, fast tap, Rewind mid-step, skip an optional action),
 *             followed by RECOVERY = the card's own guidance, encoded as the step's policy.
 *
 * THE INVARIANT, per run: every step ends, inside a bounded plant time, in one of
 *   (i) completion (Continue lit and pressed), (ii) `overtaken` (the instructor moved it on and
 *   said why), (iii) an HONEST consequence — a reactor trip the card's own trip banner names
 *   (`trip_notice`) or the leg scripts. FAIL = a SILENT STRAND: not met, not overtaken, no trip,
 *   past the bound. Also FAIL: a HOLLOW tick on the typical route (Continue lit inside the first
 *   ENTRY_S plant-seconds of a step, before the player has touched anything, on a step the route
 *   does not declare `entry_met`), a FLASH (Continue lit then out again on the same step, no
 *   press), and a ROW UN-TICK (a drawn, non-`cont` row met then unmet on the same step).
 *
 * ROUTES ARE DATA. `ROUTES[leg]` names a policy per step (a small vocabulary below) and each
 * mistake is an override of ONE step's policy/params. Steps are keyed so a re-numbering port
 * costs little: '#n' (1-based), 'cmd:<action>[:k]' (k-th step whose cmd or a row cmd is that
 * action), 'p:<param>[:k]' (k-th step whose first graded param is that). The five other legs'
 * ports to the owner step format landed 2026-09-24; a leg with no `steps` entry runs the default
 * policy on every step.
 *
 *   node test/run_walkthrough_routes.js                 all legs, all routes (the gate)
 *   node test/run_walkthrough_routes.js --leg=pwr_startup --route=typical   FILTERED: forced non-zero
 *   node test/run_walkthrough_routes.js --leg=chain     the six legs as ONE plant (layman pass 4, 2026-09-25)
 *   node test/run_walkthrough_routes.js --jobs=1        sequential
 *   WR_SEED=<n> on a --job run: a measurement knob (the gate is seed 42)
 *   (--job=<leg>:<route> is the child-process entry; not for hand use)
 */
'use strict';
var path = require('path');
var cp = require('child_process');
var ROOT = path.join(__dirname, '..');
var ARGV = process.argv.slice(2);
function flag(n) { for (var i = 0; i < ARGV.length; i++) if (ARGV[i].indexOf('--' + n + '=') === 0) return ARGV[i].slice(n.length + 3); return null; }

var ENTRY_S = 5;        // hollow window: plant-seconds after step entry with no player action
/* A two-sided `~` band is a HOLD claim that un-ticks BY DESIGN when the plant leaves it (#683):
 * `pwr_raise_power` 6 arrives at 577.5 degF inside its 558-585 degF band, the card's own 35-step
 * pull carries Tavg to 590.0 degF, the row goes back off and returns when LOAD catches up (3.7
 * plant-min, measured 2026-09-24). That is honest re-grading, not a defect. What IS a defect is a
 * band that ticks and lets go inside PASS_S — a transient pass through the band, or gauge noise
 * at its edge — so a `~` row's un-tick counts only when it had been met for less than PASS_S. */
var PASS_S = 10;
var ACK_S = 3;          // the player notices a lit Continue after this many plant-seconds
var BOUND_FLOOR_S = 1800;

/* ================================ THE ROUTE TABLES ====================================== */
/* Policies: default | final (a ramp step's end value, typed once) | pull_plot{to,speed,plot_rate,repeat} | approach{short,min_rate,max_rate,
 * dwell,tap,to} | wait_tap{rate_below,power_below,dwell,skip} | hold_below{p} | nudge{steps,speed} | hold_until{p,speed}
 * | block_when{p,trip_id,param} | rows_then_cmd | seq{cmds:[...]} | observe | to_band{tref,dead,dead_hi,dir,pull,dwell,near}
 * | stair{from,to,step,wait_s|read_s}. Any step may add `stated_max_min` (the card's own time: the
 * typical route's `stated` check fails past it), and
 * `repeat` (press its controls N times) and `rewind_after` (seconds into the step: press the
 * walkthrough's Rewind once) and `delay_s` (the player acts no sooner than this). */
var ROUTES = {
  pwr_startup: {
    final: true,
    entry_met: ['#1', '#2', '#3', '#17'],   // the card says these read true on arrival (final: the whole list)
    steps: {
      /* THE WINDOW IS WHERE THE COUNT TARGET LIES, NOT A STOP THAT GUARANTEES IT *(OWNER RULING,
       * 2026-09-24: "The way I see it the range means that the source range target will be within
       * that range not that hitting the lower part of the range will put you over the target. So
       * let's leave then")*. The player pulls to the window's bottom, lets the counts settle, and
       * keeps withdrawing inside the window until SOURCE RANGE meets the row — the top at most. */
      '#5': { policy: 'pull_plot', to: 80, top: 100 },     // "80 to 100"
      '#6': { policy: 'pull_plot', to: 150, top: 175 },    // "150 to 175"
      '#7': { policy: 'pull_plot', to: 180, top: 205 },    // "180 to 205"
      '#8': { policy: 'pull_plot', to: 195, top: 205 },    // "195 to 205"
      // 9 and 10 are slow by the card's own design (a tap, a read once the rate has stopped falling —
      // about 10 minutes — repeat; then 30 to 60 minutes of climb after a 0.06 to 0.10 read), so their
      // bound is the card's, not 3 x hold. Measured 2026-09-24: step 9 21.6 / 26.7 min, step 10
      // 31.1 / 45.5 min (seeds 42 / 7). The policy still reads every 300 s and taps under 0.06.
      '#9': { policy: 'approach', short: 3, min_rate: 0.06, max_rate: 1.0, dwell: 300, tap: 1, bound_s: 5400 },
      '#10': { policy: 'observe', bound_s: 5400 },
      '#11': { policy: 'wait_tap', rate_below: 0.005, power_below: 0.5, dwell: 300 },
      '#12': { policy: 'hold_below', p: 5 },
      '#13': { policy: 'nudge', steps: 13, speed: 'slow' },
      '#14': { policy: 'rows_then_cmd' },
      '#15': { policy: 'block_when', p: 9.5, trip_id: 'ir_high', param: 'ir_high_blocked' },
    },
    /* THE MISTAKES RIDE A BASE THAT COMPLETES. The literal first-stop route strands at step 8
     * (measured 2026-09-24: bank 195 settles at ~6,375 counts a second against the 6,950 row, SUR
     * -0.001 after 30 plant-minutes) — a tracked red awaiting the owner, see BASELINES. A mistake
     * run on that base would only re-report it, so the mistakes use layman pass 3's reviewer stops
     * for 7 and 8 (195 and 203, CHECKLIST_PLAYTEST_2026-09-24_LAYMAN_PASS3.md). */
    mistake_base: { '#7': { policy: 'pull_plot', to: 195 }, '#8': { policy: 'pull_plot', to: 203 } },
    // chained from the heatup, step 2 is the ~918 -> 719 ppm wash the card times at "about 90
    // plant-minutes" (its own 600x line), not the preset's instant tick
    chain_steps: { '#2': { policy: 'default', bound_s: 10800 } },
    base_route: 'typical_pass3',   // the base itself, unperturbed: a second typical-kind route
    mistakes: [
      { id: 'overshoot_235', kind: 'overshoot', at: '#9', set: { policy: 'approach', to: 235, speed: 'normal' } },
      { id: 'undershoot_10', kind: 'undershoot', at: '#9', set: { short: 10 } },
      { id: 'window_overshoot', kind: 'overshoot', at: '#5', set: { to: 120 } },
      { id: 'plot_early', kind: 'press early', at: '#8', set: { plot_rate: 99 } },
      { id: 'double_plot', kind: 'double press', at: '#6', set: { repeat: 2 } },
      { id: 'fast_tap', kind: 'tap at speed', at: '#9', set: { tap: 8 } },
      { id: 'load_before_latch', kind: 'wrong order', at: '#14', set: { policy: 'seq', cmds: [
        { action: 'set_load_target', mwe: 10 }, { action: 'latch_turbine' }, { action: 'set_load_target', mwe: 10 }] } },
      // "hold CONTROL WITHDRAW for about 13 steps" read as "hold until REACTOR POWER passes 5 %":
      // power trails the rods, so the bank ends further out (pass 3: 19 steps from 209) and the
      // plant settles at LOAD 10 MWe with REACTOR POWER under 10 % — the route that made the old
      // 10.05 % step-17 floor unfinishable.
      { id: 'hold_to_5pct', kind: 'overshoot', at: '#13', set: { policy: 'hold_until', p: 5.05, speed: 'slow' } },
      // the second block pressed 20 plant-minutes late: step 17 is then graded on a plant that
      // has SETTLED at LOAD 10 MWe (layman pass 1's route to the 10.05 % strand, §2al)
      { id: 'late_second_block', kind: 'press late', at: '#16', set: { delay_s: 1200 } },
      { id: 'rewind_mid_11', kind: 'rewind mid-step', at: '#11', set: { rewind_after: 300 } },
      { id: 'never_tap_11', kind: 'skip optional', at: '#11', set: { skip: true } },
    ],
  },
  /* ---- the other legs: typical = default policy on every step unless `steps` names one ---- */
  pwr_heatup: {
    steps: {},
    mistakes: [
      { id: 'double_rcp', kind: 'double press', at: 'cmd:set_rcp', set: { repeat: 2 } },
      { id: 'pressure_sp_high', kind: 'overshoot', at: 'cmd:set_pressure_setpoint',
        set: { policy: 'seq', cmds: [{ action: 'set_pressure_setpoint', mpa: 15.9 }] } },
      { id: 'rewind_mid_heaters', kind: 'rewind mid-step', at: 'cmd:set_heater', set: { rewind_after: 600 } },
    ],
  },
  pwr_raise_power: {
    /* LOAD FIRST since 2026-09-24 (b) (owner ruling, option selection "Load first"). Since
     * 2026-09-25 (layman pass 4) each `b` reads "Hold WITHDRAW at MED until AVG COOLANT
     * TEMPERATURE is back in its band, about K steps": the typical player follows the GAUGE —
     * one step at a time while the tile reads more than 0.5 degF under the band value the card
     * names, one step in when it is 5 degF over. The OLD card's fixed counts are the injection
     * `chain_count_pulls` below (on the chained plant they trip the reactor at step 10). */
    steps: {
      'cmd:set_load_target:1': { policy: 'to_band', tref: 556, dead: 0.5, dead_hi: 5 },
      'cmd:set_load_target:2': { policy: 'to_band', tref: 562, dead: 0.5, dead_hi: 5 },
      'cmd:set_load_target:3': { policy: 'to_band', tref: 570, dead: 0.5, dead_hi: 5 },
      'cmd:set_load_target:4': { policy: 'to_band', tref: 575, dead: 0.5, dead_hi: 5 },
      'cmd:set_load_target:5': { policy: 'to_band', tref: 578, dead: 0.5, dead_hi: 5 },
      // 9a's note: "hold INSERT a few steps whenever it rises above its band" (the chained plant's dilution tail)
      '#9': { policy: 'to_band', tref: 578, dir: 'insert', dead: 3, pull: 3, dwell: 60 },
    },
    // "Make sure the turbine is on line and taking steam": a CONFIRM step — the ask is "Check the
    // TURBINE-GENERATOR card is on line", LATCH only "if it reads TRIP" — and the low_power start
    // arrives latched at 10 MWe. Added to the provisional no-action default, not replacing it.
    entry_met: ['cmd:latch_turbine'],
    mistakes: [
      { id: 'double_boron', kind: 'double press', at: 'cmd:set_auto_setpoint', set: { repeat: 2 } },
      // the OLD order: the pull first, LOAD after it
      { id: 'rods_before_load', kind: 'wrong order', at: 'cmd:set_load_target:1', set: { policy: 'seq', cmds: [
        { action: 'rod_nudge', group_id: 'control', steps: 20, speed: 'normal' }, { action: 'set_load_target', mwe: 30 }] } },
      // LOAD, then a 60-step first pull, three times the card's "about 20"
      { id: 'overpull_60', kind: 'overshoot', at: 'cmd:set_load_target:1', set: { policy: 'seq', cmds: [
        { action: 'set_load_target', mwe: 30 }, { action: 'rod_nudge', group_id: 'control', steps: 60, speed: 'normal' }] } },
      { id: 'rewind_mid_stage3', kind: 'rewind mid-step', at: 'cmd:set_load_target:3', set: { rewind_after: 120 } },
    ],
  },
  pwr_lower_power: {
    /* 2026-09-25 (layman pass 4): "insert at MED in pulls of about 5 steps, half a plant-minute
     * apart, until AVG COOLANT TEMPERATURE is back in its band" — the player stops at the first
     * read inside the row's edge (1 degF under it), as the reviewer did. */
    steps: {
      '#3': { policy: 'to_band', tref: 576, dead: 0, dir: 'insert', pull: 5, dwell: 30 },
      'cmd:set_load_target:2': { policy: 'to_band', tref: 567, dead: 0, dir: 'insert', pull: 5, dwell: 30 },
      'cmd:set_load_target:3': { policy: 'to_band', tref: 561, dead: 0, dir: 'insert', pull: 5, dwell: 30 },
      'cmd:set_load_target:4': { policy: 'to_band', tref: 556, dead: 0, dir: 'insert', pull: 5, dwell: 30 },
    },
    mistakes: [
      { id: 'double_load75', kind: 'double press', at: 'cmd:set_load_target', set: { repeat: 2 } },
      { id: 'insert_x2', kind: 'overshoot', at: 'cmd:rod_nudge', set: { policy: 'seq', cmds: [
        { action: 'rod_nudge', group_id: 'control', steps: -80, speed: 'normal' }] } },
      { id: 'rewind_mid_load50', kind: 'rewind mid-step', at: 'cmd:set_load_target:2', set: { rewind_after: 120 } },
    ],
  },
  pwr_shutdown: {
    steps: {},
    // chained, the dump has been in AUTO / PRESS since the heatup's step 13, so 3a is true on
    // arrival (layman pass 4). The step is no longer: 3c's STEAM PRESS 1015-1025 psi row
    // (2026-09-25 bring-down) holds it until the pressure comes down from 1043 psi (34 s,
    // measured on this chain), so `chain_entry_met: ['#3']` came out and the hollow check binds.
    mistakes: [
      { id: 'scram_early', kind: 'press early', at: 'cmd:set_load_target', set: { policy: 'seq', cmds: [
        { action: 'set_load_target', mwe: 0 }, { action: 'scram' }] } },
      { id: 'double_scram', kind: 'double press', at: 'cmd:scram', set: { repeat: 2 } },
      { id: 'rewind_mid_dumps', kind: 'rewind mid-step', at: 'cmd:set_steam_dump', set: { rewind_after: 30 } },
      // Step 3's row grades the dump MODE since 2026-09-24 (owner ruling "Grade the mode"): the
      // step must WAIT for the AUTO press, not tick on the lamp. A player who reads for two
      // plant-minutes before pressing: step 3 held unmet (TAVG) until the press, then completes.
      { id: 'dump_auto_late', kind: 'press late', at: 'cmd:set_steam_dump', set: { delay_s: 120 } },
    ],
  },
  pwr_cooldown: {
    // "Lower SET PZR PRESSURE to 1900 psi": one entry, not the replay's ramp. Ramped, the step
    // ticks at 13.6 MPa with the setpoint still mid-ramp and the player moves on (measured
    // 2026-09-24: the SI low-steam-pressure trip at step 4, 1951 psia).
    // "Raise HX SPLIT to 12 %" (step 11): the player types 12 once, not the replay's 7 -> 12 ramp
    // across the whole hold (2026-09-24, the step 11 reword was measured on this route: COOLDOWN
    // RATE tile peak -106 degF/hr at +27 min, Mode 5 in 100 plant-min; the ramp peaks -83).
    steps: { 'cmd:set_pressure_setpoint': { policy: 'final' }, 'cmd:set_pressure_setpoint:2': { policy: 'final' },
             'cmd:set_rhr_hx:2': { policy: 'final' },
             /* step 4 since 2026-09-25 (layman pass 4): "Lower DUMP SETPOINT 50 psi at a time from 1020
              * to 120 ... Wait about 5 plant-minutes between steps ... About an hour and a half in all." */
             'cmd:set_steam_dump_setpoint': { policy: 'stair', from: 1020, to: 120, step: 50, wait_s: 300, stated_max_min: 120 } },
    mistakes: [
      { id: 'pressure_sp_ramped', kind: 'press early', at: 'cmd:set_pressure_setpoint', set: { policy: 'default' } },
      { id: 'hpi_before_blocks', kind: 'wrong order', at: 'cmd:set_trip_block', set: { policy: 'seq', order: [2, 0, 1] } },
      { id: 'double_rhr', kind: 'double press', at: 'cmd:set_rhr', set: { repeat: 2 } },
      { id: 'rewind_mid_dump_sp', kind: 'rewind mid-step', at: 'cmd:set_steam_dump_setpoint', set: { rewind_after: 1800 } },
    ],
  },
};

/* ================================ THE CHAIN ============================================== */
/* THE LEGS AS ONE PLANT (2026-09-25, layman pass 4). Every route above reloads its leg's own
 * `from` IC, so each leg is graded on the plant its author measured — and the player who presses
 * "Next: … ▸" gets a different one. Measured on that route: the raise-power leg arrives at 719
 * ppm, not the `low_power` IC's 684, so step 3's dilution is 59 ppm, not 24, and keeps adding
 * reactivity through every stage. One `chain` run drives all six legs on ONE service, each leg on
 * its typical route plus its `chain_steps` (the literal player's gauge-following, where the card
 * says "until"), and reports every leg as `chain:<leg>`. */
var CHAIN = ['pwr_heatup', 'pwr_startup', 'pwr_raise_power', 'pwr_lower_power', 'pwr_shutdown', 'pwr_cooldown'];
function runChain(mutId) {
  var legs = [], ctx = { chain: true }, M = mutId ? MUTATIONS.filter(function (m) { return m.id === mutId; })[0] : null;
  for (var i = 0; i < CHAIN.length; i++) {
    var r = runJob(CHAIN[i], 'typical', M && M.leg === CHAIN[i] ? mutId : null, ctx);
    ctx = r._ctx; delete r._ctx; r.route = 'chain'; legs.push(r);
    if (r.result.kind !== 'complete') break;
  }
  return { leg: 'chain', route: 'chain', chain: legs, result: { kind: legs[legs.length - 1].result.kind }, steps: [], flags: [] };
}

/* ================================ INJECTION PROOFS ====================================== */
/* Each re-opens one pwr_startup defect the layman passes found and a later change fixed, on a
 * pool mutated IN THE CHILD (nothing on disk moves), and the gate asserts the named check goes
 * RED on that run. Without these, a harness that could never fail would read the same as one
 * that found nothing. `route` is the route the defect showed on. */
var MUTATIONS = [
  { id: 'no_overtaken_9', route: 'overshoot_235', expect: 'invariant',
    why: 'step 9 without its `overtaken` (the pull to bank 235 stranded the 2026-09-23 layman)',
    mutate: function (P) { delete P.steps[8].overtaken; } },
  { id: 'step17_1005', route: 'late_second_block', expect: 'invariant',
    why: 'step 17 floor back to 10.05 % (unfinishable at LOAD 10 MWe, owner ruling 2026-09-23)',
    mutate: function (P) { P.steps[16].accs[0].v = 10.05; } },
  { id: 'step12_rate_row', route: 'typical_pass3', expect: 'hollow',
    why: "step 12's steady row replaced by a rate-only row (RECONSTRUCTED: SUR < 0.1 — the old row ticked on entry)",
    mutate: function (P) { P.steps[11].accs[1] = { cont: true, p: 'startup_rate_dpm', op: '<', v: 0.1, label: 'rate row' }; } },
  { id: 'no_settle_9', route: 'typical', expect: 'complete',
    why: 'step 9 without its STARTUP RATE `steady` row (passed on one falling read of 0.069; step 10 stranded at 90 min, 2026-09-24)',
    mutate: function (P) { P.steps[8].accs = P.steps[8].accs.filter(function (e) { return e.op !== 'steady'; }); } },
  { id: 'no_latch_9a', route: 'typical_pass3', expect: 'flash',
    why: "9a without `latch` (a WITHDRAW tap un-ticked it, layman pass 2)",
    mutate: function (P) { delete P.steps[8].accs[0].latch; } },
  /* the PASS_S exemption must not swallow a band that ticks on a TRANSIENT PASS: step 6's Tavg
   * band narrowed to 581.5-583.5 degF, which the 35-step pull crosses at ~0.3 degF/s */
  /* RE-AIMED 2026-09-24 (b), load first: the stage steps are `accs_ordered` now, so the Tavg row
   * cannot latch until OUTPUT is in (~4.8 plant-min) and the old 581.5-583.5 degF band was never
   * crossed at a latchable moment — this injection went GREEN (measured). The mutation takes the
   * order off and narrows the band onto the 35-step pull's rise instead (564 -> 581.7 degF, about
   * 0.4 degF a second): crossed in ~5 s, under PASS_S. */
  /* LAYMAN PASS 4 (2026-09-25): the chained plant and the player's own reading, re-opened. */
  { id: 'chain_count_pulls', chain: true, leg: 'pwr_raise_power', route: 'chain', expect: 'complete',
    why: 'raise-power 4-8 as the OLD card read, LOAD then a fixed 20/20/35/25/20-step pull, on the plant the startup hands over (59 ppm of dilution, not 24)',
    override: {
      'cmd:set_load_target:1': { policy: 'seq', cmds: [{ action: 'set_load_target', mwe: 30 }, { action: 'rod_nudge', group_id: 'control', steps: 20, speed: 'normal' }] },
      'cmd:set_load_target:2': { policy: 'seq', cmds: [{ action: 'set_load_target', mwe: 50 }, { action: 'rod_nudge', group_id: 'control', steps: 20, speed: 'normal' }] },
      'cmd:set_load_target:3': { policy: 'seq', cmds: [{ action: 'set_load_target', mwe: 75 }, { action: 'rod_nudge', group_id: 'control', steps: 35, speed: 'normal' }] },
      'cmd:set_load_target:4': { policy: 'seq', cmds: [{ action: 'set_load_target', mwe: 90 }, { action: 'rod_nudge', group_id: 'control', steps: 25, speed: 'normal' }] },
      'cmd:set_load_target:5': { policy: 'seq', cmds: [{ action: 'set_load_target', mwe: 100 }, { action: 'rod_nudge', group_id: 'control', steps: 20, speed: 'normal' }] },
      '#9': { policy: 'default' } } },
  { id: 'chain_step10_bank', chain: true, leg: 'pwr_raise_power', route: 'chain', expect: 'complete',
    why: 'raise-power 10 graded on CONTROL ROD POSITION above 351 again (a bank number the chained plant reaches only as xenon builds, about 5 plant-hours)',
    mutate: function (P) { P.steps[9].accs[0] = { p: 'control_bank_steps', op: '>', v: 351, ask: P.steps[9].accs[0].ask, label: 'CONTROL ROD POSITION above 351' }; } },
  { id: 'cooldown_until_flat', leg: 'pwr_cooldown', route: 'typical', expect: 'stated',
    why: 'cooldown 4 as the OLD card read it: after each 50 psi, wait until the whole-degree tile reads the same twice, 5 plant-minutes apart',
    override: { 'cmd:set_steam_dump_setpoint': { policy: 'stair', from: 1020, to: 120, step: 50, read_s: 300, stated_max_min: 120 } } },
  { id: 'band_transient_pass', leg: 'pwr_raise_power', route: 'typical', expect: 'flash',
    why: "raise-power 6 unordered, its Tavg band narrowed to 569.5-571.5 degF (the pull crosses it in seconds)",
    /* RE-AIMED 2026-09-25: the typical player now follows the gauge a step at a time, which never
     * crosses a 2 degF band in under PASS_S (measured: the injection went GREEN). The fast crossing
     * is the old card's fixed 35-step pull, so this run makes it. */
    override: { 'cmd:set_load_target:3': { policy: 'seq', cmds: [{ action: 'set_load_target', mwe: 75 }, { action: 'rod_nudge', group_id: 'control', steps: 35, speed: 'normal' }] } },
    mutate: function (P) { P.steps[5].accs_ordered = false; var e = P.steps[5].accs[3]; e.v = (570.5 - 32) * 5 / 9; e.tol = 1 * 5 / 9; } },
];

/* ================================ THE CHILD: ONE RUN ==================================== */
function boot() {
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
  return globalThis.RD;
}

function cmdAction(c) { return !c ? null : (typeof c === 'string' ? c : c.action); }
/* resolve a step key to a 0-based index in the CURRENT pool (-1 if the port removed it) */
function resolveKey(proc, key) {
  var m = /^#(\d+)$/.exec(key);
  if (m) return (+m[1]) - 1 < proc.steps.length ? (+m[1]) - 1 : -1;
  m = /^(cmd|p):([a-z0-9_]+)(?::(\d+))?$/.exec(key);
  if (!m) return -1;
  var want = +(m[3] || 1), seen = 0;
  for (var i = 0; i < proc.steps.length; i++) {
    var st = proc.steps[i], hit;
    if (m[1] === 'cmd') hit = cmdAction(st.cmd) === m[2] || (st.accs || []).some(function (e) { return cmdAction(e.cmd) === m[2]; });
    else { var a0 = st.acc || (st.accs || []).filter(function (e) { return e.p; })[0]; hit = !!a0 && a0.p === m[2]; }
    if (hit && ++seen === want) return i;
  }
  return -1;
}

function runJob(legId, routeId, mutId, ctx) {
  var RD = boot();
  var IL = RD.InstructorLayer;
  var proc = RD.MANUAL_PROCEDURES.pwr2.filter(function (p) { return p.id === legId; })[0];
  var MUT = mutId ? MUTATIONS.filter(function (m) { return m.id === mutId; })[0] : null;
  if (MUT && MUT.mutate) MUT.mutate(proc);
  var table = ROUTES[legId];
  var byIdx = {};
  Object.keys(table.steps || {}).forEach(function (k) { var i = resolveKey(proc, k); if (i >= 0) byIdx[i] = table.steps[k]; });
  if (ctx && ctx.chain && table.chain_steps) Object.keys(table.chain_steps).forEach(function (k) {   // the literal player on the CHAINED plant
    var i = resolveKey(proc, k); if (i >= 0) byIdx[i] = table.chain_steps[k];
  });
  /* a ROUTE injection: the player the OLD card produced (a policy, not a pool edit) */
  if (MUT && MUT.override) Object.keys(MUT.override).forEach(function (k) { var i = resolveKey(proc, k); if (i >= 0) byIdx[i] = MUT.override[k]; });
  var typicalKind = routeId === 'typical' || routeId === table.base_route;
  if (routeId !== 'typical' && table.mistake_base) Object.keys(table.mistake_base).forEach(function (k) {
    var i = resolveKey(proc, k); if (i >= 0) byIdx[i] = table.mistake_base[k];
  });
  var mistake = null, mIdx = -1;
  if (!typicalKind) {
    mistake = table.mistakes.filter(function (m) { return m.id === routeId; })[0];
    mIdx = resolveKey(proc, mistake.at);
    if (mIdx < 0) return { leg: legId, route: routeId, result: { kind: 'unresolved', why: 'step key ' + mistake.at + ' not in the current pool' }, steps: [], flags: [] };
  }
  var entryMet = {};
  (table.entry_met || []).concat(ctx && ctx.chain ? (table.chain_entry_met || []) : []).forEach(function (k) { var i = resolveKey(proc, k); if (i >= 0) entryMet[i] = true; });
  if (!table.final) proc.steps.forEach(function (st, i) {   // provisional default: a step with no operator action
    if (!st.cmd && !(st.accs || []).some(function (e) { return e.cmd; })) entryMet[i] = true;
  });
  function specFor(i) {
    var base = byIdx[i] || { policy: 'default' };
    if (i !== mIdx) return base;
    var o = {}; Object.keys(base).forEach(function (k) { o[k] = base[k]; });
    Object.keys(mistake.set).forEach(function (k) { o[k] = mistake.set[k]; });
    return o;
  }
  var scriptsScram = IL.legScriptsScram(proc);

  var svc = ctx && ctx.svc;
  if (!svc) {
    svc = new RD.SimulationService({ seed: +(process.env.WR_SEED || 42) });   // WR_SEED: a measurement knob, never the gate
    svc.selectPlant('pwr2', proc.from, null, undefined);
    svc.running = true; svc.attentionStops = false; svc.speedHolds = false;
    svc.configurePacing({ warp: true });
    svc.timeAcceleration = 10;
  }
  var s = (ctx && ctx.s) || null;
  function tick() { var r = svc.tick(); if (r) s = r; return s; }
  function t() { return s.metadata.sim_time; }
  function pv(p) { return IL.paramValue(s, p); }
  function grp() { return (s.control_state.rod_groups || []).filter(function (g) { return g.function === 'control'; })[0]; }
  function bank() { return grp().steps; }
  function moving() { return !!grp().moving; }
  function tripCause() {
    var ts = s.true_state || {};
    var why = (s.rps_state && s.rps_state.last_trip_reason) || ts.trip_cause || 'unreported';
    var pt = svc.engine && svc.engine.eng && svc.engine.eng.pt;   // the SI signal's own cause, if any
    return why + (pt && pt.si_cause ? ' (SI on ' + pt.si_cause + ')' : '');
  }
  function send(c) { return svc.handleCommand(c); }
  function nudge(n, sp) { if (n) send({ action: 'rod_nudge', group_id: 'control', steps: n, speed: sp || 'normal' }); }
  function plot() {
    var m = RD.OneOverMCore.sample(s);
    if (m && m.ok) { send({ action: 'plot_1m_point', x: m.x, counts: m.counts, t: t() }); return true; }
    return false;
  }
  function press(c) {
    if (cmdAction(c) === 'plot_1m_point') return plot();
    send(typeof c === 'string' ? { action: c } : c); return true;
  }
  var speedNow = null;
  function setSpeed(v) { v = Math.max(1, Math.min(600, v || 10)); if (v !== speedNow) { send({ action: 'set_speed', value: v }); speedNow = v; } }

  for (var w = 0; w < 3; w++) tick();
  send({ action: 'start_checklist', procedure_id: legId });
  tick();
  /* a chained leg can START scrammed (the cooldown after the shutdown's scram): only a trip
   * that happens INSIDE the leg is one */
  var scrAtEntry = !!(ctx && ((s.rps_state && s.rps_state.scrammed) || (s.true_state && s.true_state.scrammed)));
  var T0 = t(), out = [], flags = [], result = null, rewound = false;
  var cur = -1, S = null, guard = 0;
  function readings() {
    var r = { power_pct: pv('power_pct'), tavg_F: pv('tavg_c') * 9 / 5 + 32, pressure_psia: pv('pressure_mpa') * 145.0377, mwe: pv('mwe_output') };
    if (grp()) r.bank = bank();
    var rate = pv('startup_rate_dpm'); if (rate != null && isFinite(rate)) r.sur_dpm = rate;
    var sr = pv('sr_counts_cps'); if (sr != null && isFinite(sr) && pv('sr_energized') > 0) r.sr_cps = sr;
    return r;
  }
  while (guard++ < 2e6) {
    tick();
    var c = s.instructor && s.instructor.checklist;
    if (!c) { result = { kind: 'strand', step: cur + 1, why: 'the walkthrough is gone' + (rewound ? ' after its own Rewind' : '') }; break; }
    if (c.complete) { result = { kind: 'complete' }; break; }
    var k = c.step_index, st = proc.steps[k];
    if (k !== cur) {                                     // step entry (forward or by Rewind)
      if (cur >= 0 && k > cur && out[cur]) {
        out[cur].by = c.done_by[cur]; out[cur].t_done_min = (t() - T0) / 60;
        out[cur].dur_min = (t() - S.t0) / 60; out[cur].at_done = S.lastReadings || readings();
      }
      if (k < cur) flags.push({ kind: 'rewind', step: k + 1, t_min: (t() - T0) / 60 });
      cur = k;
      var spec = specFor(k);
      S = { t0: t(), spec: spec, memo: {}, rowsMet: [], rowsMetAt: [], ack0: null, acts: 0, pressedAck: false,
            bound: spec.bound_s || Math.max(3 * (st.hold || 0), BOUND_FLOOR_S) };
      out[k] = { n: k + 1, policy: spec.policy || 'default', stated_max_min: spec.stated_max_min };
    }
    var el = t() - S.t0, rows = c.accs || [];
    /* --- flags: hollow / flash / row un-tick ---------------------------------------- */
    if (c.awaiting_ack) {
      if (S.ack0 == null) S.ack0 = t();
      if (el <= ENTRY_S && S.acts === 0 && !entryMet[k] && typicalKind && !S.hollow) {
        S.hollow = true; flags.push({ kind: 'hollow', step: k + 1, at_s: el });
      }
    } else if (S.ack0 != null) {
      flags.push({ kind: 'flash', step: k + 1, lit_s: t() - S.ack0, t_min: (t() - T0) / 60 });
      S.ack0 = null;
    }
    rows.forEach(function (r, i) {
      var e = (st.accs || [])[i] || {};
      if (!S.rowsMet[i] && r.met) S.rowsMetAt[i] = t();
      var band = e.op === '~' && !e.latch, heldS = t() - (S.rowsMetAt[i] == null ? t() : S.rowsMetAt[i]);
      if (S.rowsMet[i] && !r.met && !e.cont && !e.hidden && !(band && heldS >= PASS_S))
        flags.push({ kind: 'untick', step: k + 1, row: i + 1, label: e.label, t_min: (t() - T0) / 60, held_s: heldS });
      S.rowsMet[i] = !!r.met;
    });
    S.lastReadings = readings();
    var tF = S.lastReadings.tavg_F, pw = S.lastReadings.power_pct;   // the step's Tavg / power span (stepTable prints it)
    out[k].tlo = Math.min(out[k].tlo == null ? 1e9 : out[k].tlo, tF); out[k].thi = Math.max(out[k].thi == null ? -1e9 : out[k].thi, tF);
    out[k].plo = Math.min(out[k].plo == null ? 1e9 : out[k].plo, pw);
    /* --- invariant: trip / bound ------------------------------------------------------- */
    var scr = !!((s.rps_state && s.rps_state.scrammed) || (s.true_state && s.true_state.scrammed));
    if (scr && !scriptsScram && !scrAtEntry) {
      result = { kind: c.trip_notice ? 'trip_named' : 'trip_unnamed', step: k + 1, why: 'reactor trip, cause ' + tripCause() }; break;
    }
    if (el > S.bound && !c.awaiting_ack) {
      result = { kind: 'strand', step: k + 1, why: 'not met, not overtaken, no trip after ' + (el / 60).toFixed(1) +
        ' plant-min (bound ' + (S.bound / 60).toFixed(0) + ')', rows: rows.map(function (r) { return !!r.met; }) };
      break;
    }
    /* --- Continue -------------------------------------------------------------------- */
    if (c.awaiting_ack && t() - S.ack0 >= ACK_S) { S.ack0 = null; send({ action: 'checklist_check', index: k }); continue; }
    /* --- speed: the card's own rung for the first unmet drawn row ---------------------- */
    var rung = null;
    for (var ri = 0; ri < rows.length; ri++) { var ee = (st.accs || [])[ri] || {}; if (!rows[ri].met && !ee.hidden && ee.wait_speed) { rung = ee.wait_speed; break; } }
    /* no authored rung (an unported leg): a step whose settle is 30+ plant-minutes is one the
     * player rides at WARP, as the ported legs' rungs say; everything else at 10x. */
    setSpeed(rung || st.wait_speed || (st.acc && st.acc.wait_speed) || ((st.hold || 0) >= 1800 ? 600 : 10));
    if (el < Math.max(ENTRY_S, S.spec.delay_s || 0)) continue;   // the player reads (or dawdles) before acting
    /* --- Rewind mid-step (once per run) ---------------------------------------------- */
    if (S.spec.rewind_after != null && !rewound && el >= S.spec.rewind_after) {
      rewound = true;
      if (!c.rewind_ready) { flags.push({ kind: 'rewind_unavailable', step: k + 1 }); continue; }   // the button is dark
      S.acts++;
      var rr = send({ action: 'rewind', steps: 2, scope: 'full', exact: true });
      if (rr && rr.type === 'error') flags.push({ kind: 'rewind_refused', step: k + 1, why: rr.message });
      cur = -2;                                         // force re-entry bookkeeping
      continue;
    }
    policy(S.spec, st, c, rows, el);
  }
  if (!result) result = { kind: 'strand', why: 'guard' };
  if (out[cur] && result.kind !== 'complete') { out[cur].at_end = readings(); out[cur].t_end_min = (t() - T0) / 60; }
  if (result.kind === 'complete' && cur >= 0 && out[cur] && out[cur].t_done_min == null) {
    out[cur].by = (s.instructor.checklist.done_by || [])[cur]; out[cur].t_done_min = (t() - T0) / 60;
    out[cur].dur_min = (t() - S.t0) / 60; out[cur].at_done = readings();
  }
  result.t_min = (t() - T0) / 60;
  result.end = readings();
  var ret = { leg: legId, route: routeId, kind: mistake ? mistake.kind : 'typical', typical: typicalKind, result: result, steps: out.filter(Boolean), flags: flags };
  if (ctx) ret._ctx = { svc: svc, s: s, chain: true };
  return ret;

  /* ------------------------------ the policy vocabulary ------------------------------ */
  function pressRows(st2, c2, stopAt) {
    var accs = st2.accs || [];
    for (var i = 0; i < accs.length; i++) {
      if (c2.accs && c2.accs[i] && c2.accs[i].met) continue;
      var e = accs[i];
      if (e.cmd && !S.memo['r' + i]) {
        var reps = S.spec.repeat || 1, ok = true;
        for (var q = 0; q < reps && ok; q++) ok = press(e.cmd);
        if (ok) { S.memo['r' + i] = true; S.acts++; }
      }
      if (st2.accs_ordered || stopAt) return;            // only the first unmet row is live
    }
  }
  function issueStepCmd(st2, el2) {
    if (st2.ramp) {                                     // the player walks the setpoint at the card's rate
      var f = Math.min(1, el2 / Math.max(1, st2.hold || 600)), bucket = Math.floor(f * 40);
      if (S.memo.rampB !== bucket) {
        S.memo.rampB = bucket; S.acts++;
        st2.ramp.forEach(function (r) {
          var pts = r.points, x = f * (pts.length - 1), j = Math.min(pts.length - 2, Math.floor(x));
          var v = pts.length === 1 ? pts[0] : pts[j] + (pts[j + 1] - pts[j]) * (x - j);
          var cc = { action: r.action }; cc[r.arg] = v; send(cc);
        });
      }
      return;
    }
    if (st2.cmd && !S.memo.cmd) { S.memo.cmd = true; S.acts++; for (var q = 0; q < (S.spec.repeat || 1); q++) press(st2.cmd); }
  }
  function policy(spec, st2, c2, rows2, el2) {
    var P = spec.policy || 'default';
    if (P === 'observe') return;
    if (P === 'default') { issueStepCmd(st2, el2); pressRows(st2, c2); return; }
    if (P === 'final') {                                 // "lower X to N": the player types N once
      if (!S.memo.fin) {
        S.memo.fin = true; S.acts++;
        (st2.ramp || []).forEach(function (r) { var cc = { action: r.action }; cc[r.arg] = r.points[r.points.length - 1]; send(cc); });
        if (!st2.ramp && st2.cmd) press(st2.cmd);
      }
      pressRows(st2, c2); return;
    }
    if (P === 'rows_then_cmd') {
      pressRows(st2, c2);
      var cmdRows = (st2.accs || []).map(function (e, i) { return e.cmd ? i : -1; }).filter(function (i) { return i >= 0; });
      if (cmdRows.every(function (i) { return rows2[i] && rows2[i].met; })) issueStepCmd(st2, el2);
      return;
    }
    if (P === 'seq') {                                   // an explicit sequence, one per tick
      var list = spec.cmds || (spec.order || []).map(function (i) { return (st2.accs[i] || {}).cmd; });
      S.memo.q = S.memo.q || 0;
      if (S.memo.q < list.length) { press(list[S.memo.q++]); S.acts++; return; }
      pressRows(st2, c2);                                // recovery: keep following the step
      if (!spec.cmds) return;
      return;
    }
    if (P === 'pull_plot') {
      if (!S.memo.go) { S.memo.go = true; S.acts++; nudge(spec.to - bank(), spec.speed || 'normal'); }
      if (!moving() && bank() === (S.memo.at || spec.to) && S.memo.stop == null) S.memo.stop = t();
      /* `top`: counts row unmet once settled (rate at or under 0.03, 60 s still) -> one more step,
       * inside the window only (the owner's reading of the window, 2026-09-24 ruling above) */
      if (spec.top != null && S.memo.stop != null && !(rows2[0] && rows2[0].met) && t() - S.memo.stop >= 60 &&
          pv('startup_rate_dpm') <= 0.03 && (S.memo.at || spec.to) < spec.top) {
        S.memo.at = (S.memo.at || spec.to) + 1; S.memo.stop = null; nudge(1, 'slow'); S.acts++;
        out[cur].taps = (out[cur].taps || 0) + 1;
      }
      var plotRow = -1;
      (st2.accs || []).forEach(function (e, i) { if (cmdAction(e.cmd) === 'plot_1m_point') plotRow = i; });
      if (S.memo.stop != null && plotRow >= 0 && !S.memo.plotted && !(rows2[plotRow] && rows2[plotRow].met)) {
        var predOk = rows2.slice(0, plotRow).every(function (r) { return r.met; });
        if (predOk && pv('startup_rate_dpm') <= (spec.plot_rate != null ? spec.plot_rate : 0.03)) {
          var reps = spec.repeat || 1, ok = true;
          for (var q = 0; q < reps && ok; q++) ok = plot();
          if (ok) { S.memo.plotted = true; S.acts++; }
        }
      }
      return;
    }
    if (P === 'approach') {
      if (!S.memo.go) {
        S.memo.go = true; S.acts++;
        var pred = s.instructor.one_over_m && s.instructor.one_over_m.pred_steps;
        S.memo.goal = spec.to != null ? spec.to : (pred != null ? pred - (spec.short || 0) : bank());
        nudge(S.memo.goal - bank(), spec.speed || 'slow'); S.memo.lm = t(); S.memo.lb = bank();
        out[cur].pred = pred; out[cur].goal = S.memo.goal;
      }
      if (spec.to != null) return;                       // a straight pull: nothing to read after it
      if (bank() !== S.memo.lb) { S.memo.lb = bank(); S.memo.lm = t(); }
      if (!moving() && bank() === S.memo.goal && t() - S.memo.lm >= (spec.dwell || 300)) {
        var r = pv('startup_rate_dpm'), tap = spec.tap || 1;
        out[cur].reads = (out[cur].reads || []).concat([[bank(), +r.toFixed(3)]]);
        if (r < spec.min_rate) { S.memo.goal += tap; nudge(tap, 'slow'); S.acts++; }
        else if (r > spec.max_rate) { S.memo.goal -= 1; nudge(-1, 'slow'); S.acts++; }
        S.memo.lm = t();
      }
      return;
    }
    if (P === 'wait_tap') {
      if (spec.skip) return;
      if (pv('startup_rate_dpm') < spec.rate_below && pv('power_pct') < spec.power_below &&
          t() - (S.memo.lastTap || -1e9) >= (spec.dwell || 300)) {
        S.memo.lastTap = t(); nudge(1, 'slow'); S.acts++; out[cur].taps = (out[cur].taps || 0) + 1;
      }
      return;
    }
    /* "hold WITHDRAW / INSERT until AVG COOLANT TEMPERATURE is back in its band": the LITERAL
     * gauge-follower (layman pass 4). The step's own presses first (the LOAD), then the rods move
     * one step at a time while the tile reads more than `dead` degF off `tref` (the band value the
     * card names), in the directions `dir` allows, `pull` steps a press, `dwell` s between presses
     * (0 = held). It reads the INSTRUMENT channel, as the tile does, and so inherits its lag. */
    if (P === 'to_band') {
      if (!(spec.no_cmd)) { issueStepCmd(st2, el2); pressRows(st2, c2); }
      var tf = pv('tavg_c') * 9 / 5 + 32, far = spec.near != null && Math.abs(tf - spec.tref) > spec.near;   // `near`: held straight through until within it
      if (el2 < (spec.after_s || 0) || moving() || (!far && t() - (S.memo.lastPull || -1e9) < (spec.dwell || 0))) return;
      var pull = far ? 1 : (spec.pull || 1);
      if (spec.dir !== 'insert' && tf < spec.tref - (spec.dead != null ? spec.dead : 1)) {
        nudge(pull, spec.speed || 'normal'); S.acts++; S.memo.lastPull = t(); out[cur].withdrawn = (out[cur].withdrawn || 0) + pull;
      } else if (spec.dir !== 'withdraw' && tf > spec.tref + (spec.dead_hi != null ? spec.dead_hi : (spec.dead != null ? spec.dead : 1))) {
        nudge(-pull, spec.speed || 'normal'); S.acts++; S.memo.lastPull = t(); out[cur].inserted_n = (out[cur].inserted_n || 0) + pull;
      }
      return;
    }
    /* "Lower X `step` at a time from `from` to `to`, waiting between steps until Y stops falling":
     * the literal stair (layman pass 4, cooldown 4). After each entry the player reads the
     * WHOLE-DEGREE tile every `read_s` plant-seconds and takes the next step when two reads agree
     * (or after `wait_s` if given: a fixed wait). Setpoint in the card's psi, sent in MPa. */
    if (P === 'stair') {
      pressRows(st2, c2, true);
      if (!(c2.accs && c2.accs[0] && c2.accs[0].met)) return;              // AUTO first
      var rt = pv('tavg_rate_c_per_hr');
      if (rt != null && isFinite(rt) && S.memo.k) out[cur].peak_cool_F_hr = Math.min(out[cur].peak_cool_F_hr || 0, Math.round(rt * 9 / 5));
      var tfl = Math.round(pv('tavg_c') * 9 / 5 + 32);
      if (S.memo.k == null) S.memo.k = 0;
      var nextSp = Math.max(spec.to, spec.from - spec.step * (S.memo.k + 1));
      if (S.memo.k > 0 && spec.from - spec.step * S.memo.k <= spec.to) return;   // at the bottom
      var due = S.memo.k === 0 || (spec.wait_s != null ? t() - S.memo.at >= spec.wait_s
        : (t() - S.memo.lr >= (spec.read_s || 300) && (S.memo.lastRead === tfl || (S.memo.lr0 = S.memo.lastRead, S.memo.lastRead = tfl, S.memo.lr = t(), false))));
      if (S.memo.k === 0 || due) {
        send({ action: 'set_steam_dump_setpoint', mpa: nextSp / 145.0377 }); S.acts++;
        S.memo.k++; S.memo.at = t(); S.memo.lr = t(); S.memo.lastRead = tfl;
        out[cur].entries = S.memo.k;
      }
      return;
    }
    if (P === 'hold_below') {
      if (pv('power_pct') >= spec.p && !moving()) { nudge(-2, 'normal'); S.acts++; out[cur].inserted = true; }
      return;
    }
    if (P === 'hold_until') {                          // hold WITHDRAW until a reading passes p
      if (!S.memo.rel && pv('power_pct') >= spec.p) { S.memo.rel = true; out[cur].released_at = bank(); }
      if (!S.memo.rel && !moving()) { nudge(1, spec.speed || 'slow'); S.acts++; }
      return;
    }
    if (P === 'nudge') {
      if (!S.memo.go) { S.memo.go = true; S.acts++; nudge(spec.steps, spec.speed); }
      return;
    }
    if (P === 'block_when') {
      if (pv('power_pct') > spec.p && !(pv(spec.param) > 0) && t() - (S.memo.lp || -1e9) >= 5) {
        S.memo.lp = t(); S.acts++; send({ action: 'set_trip_block', trip_id: spec.trip_id, blocked: true });
        out[cur].presses = (out[cur].presses || 0) + 1;
      }
      return;
    }
    throw new Error('unknown policy ' + P);
  }
}

if (flag('job')) {
  var jp = flag('job').split(':'), t0w = Date.now(), res;
  try { res = jp[0] === 'chain' ? runChain(jp[2]) : runJob(jp[0], jp[1], jp[2]); } catch (e) { res = { leg: jp[0], route: jp[1], result: { kind: 'error', why: String(e && e.stack || e).slice(0, 400) }, steps: [], flags: [] }; }
  res.wall_s = (Date.now() - t0w) / 1000; res.mut = jp[2] || null;
  process.stdout.write('\nJOBRESULT ' + JSON.stringify(res) + '\n');
  process.exit(0);
}

/* ================================ THE PARENT: THE GATE ================================== */
var LEG_F = flag('leg'), ROUTE_F = flag('route');
var FILTERED = !!(LEG_F || ROUTE_F);
var JOBS = Math.max(1, +(flag('jobs') || 4));
var B = '\x1b[1m', G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', D = '\x1b[2m', X = '\x1b[0m';
var jobs = [];
Object.keys(ROUTES).forEach(function (leg) {
  if (LEG_F && LEG_F !== leg) return;
  ['typical'].concat(ROUTES[leg].base_route ? [ROUTES[leg].base_route] : []).concat(ROUTES[leg].mistakes.map(function (m) { return m.id; })).forEach(function (r) {
    if (ROUTE_F && ROUTE_F !== r && !(ROUTE_F === 'mistakes' && r !== 'typical')) return;
    jobs.push(leg + ':' + r);
  });
});
if ((!LEG_F || LEG_F === 'chain') && (!ROUTE_F || ROUTE_F === 'chain')) jobs.push('chain:chain');
if (!ROUTE_F && ARGV.indexOf('--no-mutations') < 0)
  MUTATIONS.filter(function (m) { return !LEG_F || LEG_F === (m.chain ? 'chain' : (m.leg || 'pwr_startup')); })
    .forEach(function (m) { jobs.push(m.chain ? 'chain:chain:' + m.id : (m.leg || 'pwr_startup') + ':' + m.route + ':' + m.id); });
/* TRACKED REDS — a known red on an unported leg, recorded rather than fixed here (the port
 * agents own the content). Key: 'leg:route:check'. Each carries its measured numbers in
 * BASELINES' note; this map only keeps the tally honest about which reds are expected. */
var TRACKED = {
  // RESOLVED 2026-09-24 (rp_start): 'pwr_startup:typical:complete' — step 9 passed on ONE read of
  // 0.069 DPM at bank 208 while the rate was still falling (to 0.024) and step 10 stranded at 90
  // min. Step 9 now carries a hidden STARTUP RATE `steady` row (5 % over 240 s): the typical route
  // taps on to 210 (read 0.084) and completes, 113.0 plant-min; mutation `no_settle_9` re-opens it.
  // measured 2026-09-24, both need the OWNER'S text, not a grading fix:
  // RESOLVED 2026-09-25 (layman pass 4): 'pwr_raise_power:overpull_60:invariant' — with stages 5-8 following the gauge
  // ("Above: insert") the 60-step first pull recovers: complete, 27.2 plant-min, bank 358.
  // RESOLVED 2026-09-24 (workbench-i): step 12's flash (steady hysteresis), raise-power 2's entry
  // tick (entry_met: a confirm step), the raise-power Tavg un-ticks (honest band re-grading, PASS_S)
};

var nPass = 0, nFail = 0, nTracked = 0, wall0 = Date.now();
function ck(name, cond, note, key) {
  var ok = !!cond;
  if (ok) nPass++; else { nFail++; if (key && TRACKED[key]) nTracked++; }
  console.log((ok ? G + '  PASS' : R + '  FAIL') + X + '  ' + name + (!ok && key && TRACKED[key] ? Y + ' [TRACKED: ' + TRACKED[key] + ']' + X : '') + (note ? D + '  — ' + note + X : ''));
}
function f(x, d) { return x == null || !isFinite(x) ? '-' : (+x).toFixed(d == null ? 1 : d); }
function rd(r) {
  if (!r) return '';
  return 'power ' + f(r.power_pct, 2) + ' %, Tavg ' + f(r.tavg_F) + ' °F, pressure ' + f(r.pressure_psia, 0) +
    ' psia, ' + f(r.mwe) + ' MWe' + (r.bank != null ? ', bank ' + r.bank : '') + (r.sur_dpm != null ? ', SUR ' + f(r.sur_dpm, 3) : '') +
    (r.sr_cps != null ? ', SR ' + f(r.sr_cps, 0) + ' cps' : '');
}

var results = [], running = 0, next = 0;
function launch() {
  while (running < JOBS && next < jobs.length) {
    (function (job) {
      running++;
      var p = cp.spawn(process.execPath, [__filename, '--job=' + job], { env: process.env });
      var buf = '';
      p.stdout.on('data', function (d) { buf += d; });
      p.stderr.on('data', function (d) { buf += d; });
      p.on('close', function () {
        var m = /JOBRESULT (.*)/.exec(buf), r;
        try { r = JSON.parse(m[1]); } catch (e) { r = { leg: job.split(':')[0], route: job.split(':')[1], result: { kind: 'error', why: buf.slice(-400) }, steps: [], flags: [] }; }
        results.push(r); running--;
        console.log(D + '  … ' + job + ' ' + r.result.kind + ' (' + f(r.wall_s, 0) + ' s wall)' + X);
        if (next < jobs.length) launch(); else if (running === 0) report();
      });
    })(jobs[next++]);
  }
}
console.log(B + '\nWALKTHROUGH ROUTES — each leg on a typical-player route and on scripted mistakes (live runtime)' + X);
console.log(D + '  ' + jobs.length + ' runs, ' + JOBS + ' at a time' + X);
if (!jobs.length) { console.log('no jobs match'); process.exit(1); }
launch();

function verdicts(r) {
  var res = r.result, fl = function (kind) { return (r.flags || []).filter(function (x) { return x.kind === kind; }); };
  var v = {};
  if (r.typical) {
    v.complete = { ok: res.kind === 'complete', name: 'the typical route completes (no strand, no trip)',
      note: res.kind + (res.step ? ' at step ' + res.step : '') + (res.why ? ': ' + res.why : '') + ' | ' + f(res.t_min) + ' plant-min | ' + rd(res.end) };
    var over = (r.steps || []).filter(function (st) { return st.stated_max_min != null && !(st.dur_min <= st.stated_max_min); });
    v.stated = { ok: over.length === 0, name: 'every step with a stated time finishes inside it (the card number, on the player route)',
      note: over.length ? over.map(function (st) { return 'step ' + st.n + ' ' + f(st.dur_min) + ' plant-min against a stated ' + st.stated_max_min; }).join('; ') : 'none over' };
    var h = fl('hollow');
    v.hollow = { ok: h.length === 0, name: 'no step checks off on entry before the player acts (hollow)',
      note: h.length ? h.map(function (x) { return 'step ' + x.step + ' lit at +' + f(x.at_s) + ' s'; }).join('; ') : 'none' };
  } else {
    var ov = (r.steps || []).filter(function (st) { return st.by === 'overtaken'; }).map(function (st) { return st.n; });
    v.invariant = { ok: res.kind === 'complete' || res.kind === 'trip_named',
      name: '[' + r.kind + ']: ends in completion, overtaken, or a named trip — never a silent strand',
      note: res.kind + (res.step ? ' at step ' + res.step : '') + (res.why ? ': ' + res.why : '') +
        (ov.length ? ' | overtaken ' + ov.join(',') : '') + ' | ' + f(res.t_min) + ' plant-min | ' + rd(res.end) };
    var ru = fl('rewind_unavailable');   // the button was dark: the mistake never happened, so say so
    if (ru.length) { v.invariant.ok = false; v.invariant.note = 'VACUOUS: Rewind dark on step ' + ru[0].step + ', move the mistake | ' + v.invariant.note; }
  }
  var fz = fl('flash').concat(fl('untick'));
  v.flash = { ok: fz.length === 0, name: 'Continue never lights and goes out again (flash), no drawn row un-ticks',
    note: fz.map(function (x) { return x.kind + ' step ' + x.step + (x.row ? ' row ' + x.row + ' (' + x.label + ')' : '') + (x.lit_s != null ? ' lit ' + f(x.lit_s) + ' s' : '') + (x.held_s != null ? ' after ' + f(x.held_s) + ' s met' : '') + ' @ ' + f(x.t_min) + ' min'; }).join('; ') || 'none' };
  var rf = fl('rewind_refused');
  if (rf.length) v.rewind = { ok: false, name: 'the walkthrough Rewind lands', note: rf[0].why };
  return v;
}
function stepTable(r, head) {
  console.log(D + '    ' + head + X);
  (r.steps || []).forEach(function (st) {
    console.log(D + '      ' + ('  ' + st.n).slice(-2) + ' ' + ('       ' + st.policy).slice(-13) + '  ' +
      (st.dur_min != null ? f(st.dur_min) + ' min, done_by ' + st.by + ' @ ' + f(st.t_done_min) + ' | ' + rd(st.at_done) : 'NOT DONE | ' + rd(st.at_end)) +
      (st.pred != null ? ' | pred ' + st.pred + ' goal ' + st.goal : '') + (st.reads ? ' | reads ' + JSON.stringify(st.reads) : '') +
      (st.taps ? ' | taps ' + st.taps : '') + (st.inserted ? ' | inserted' : '') + (st.withdrawn ? ' | withdrew ' + st.withdrawn : '') + (st.inserted_n ? ' | inserted ' + st.inserted_n : '') + (st.tlo != null ? ' | Tavg ' + f(st.tlo) + '-' + f(st.thi) + ' °F, power low ' + f(st.plo) + ' %' : '') + (st.entries ? ' | entries ' + st.entries + ', peak rate ' + st.peak_cool_F_hr + ' degF/hr' : '') + X);
  });
}
function report() {
  var order = {}; jobs.forEach(function (j, i) { order[j] = i; });
  var key = function (r) { return r.leg + ':' + r.route + (r.mut ? ':' + r.mut : ''); };
  results.sort(function (a, b) { return order[key(a)] - order[key(b)]; });
  var lastLeg = null;
  results.filter(function (r) { return !r.mut && r.leg !== 'chain'; }).forEach(function (r) {
    if (r.leg !== lastLeg) { lastLeg = r.leg; console.log(B + '\n  — ' + r.leg + (ROUTES[r.leg].final ? '' : '  (PROVISIONAL: port in flight)') + ' —' + X); }
    var tag = r.leg + ':' + r.route, v = verdicts(r);
    var anyRed = Object.keys(v).some(function (k) { return !v[k].ok; });
    if (r.typical) stepTable(r, r.route + ' route, per step (plant-minutes in the step, then the readings when Continue was pressed):');
    else if (anyRed) stepTable(r, r.route + ' (red), per step:');
    Object.keys(v).forEach(function (k) { ck(tag + ': ' + v[k].name, v[k].ok, v[k].note, tag + ':' + k); });
  });
  results.filter(function (r) { return r.leg === 'chain' && !r.mut; }).forEach(function (cr) {
    console.log(B + '\n  — chain: the six legs on ONE plant, each offered by the last one\'s Next —' + X);
    cr.chain.forEach(function (r) {
      var tag = 'chain:' + r.leg, v = verdicts(r);
      stepTable(r, r.leg + ' on the chained plant, per step:');
      Object.keys(v).forEach(function (k) { ck(tag + ': ' + v[k].name, v[k].ok, v[k].note, tag + ':' + k); });
    });
    if (cr.chain.length < CHAIN.length) ck('chain: every leg reached', false, 'stopped after ' + cr.chain[cr.chain.length - 1].leg, 'chain:reach');
  });
  var muts = results.filter(function (r) { return r.mut; });
  if (muts.length) console.log(B + '\n  — INJECTION PROOFS (pool mutated in the child, per leg) —' + X);
  muts.forEach(function (r) {
    var m = MUTATIONS.filter(function (x) { return x.id === r.mut; })[0];
    var rr = r.leg === 'chain' ? (r.chain.filter(function (x) { return x.leg === m.leg; })[0] || null) : r;
    var v = rr ? verdicts(rr)[m.expect] : { ok: false, note: 'the chain stopped before ' + m.leg };
    ck('INJECTION ' + m.id + ': ' + m.why + ' -> ' + r.route + ' "' + m.expect + '" goes RED', !!v && !v.ok,
       v ? v.note : 'check not produced');
  });
  console.log('\n' + '='.repeat(74));
  console.log('  run_walkthrough_routes: ' + nPass + ' passed, ' + nFail + ' failed  (' + (nPass + nFail) + ' checks)' +
    (nTracked ? '  [' + nTracked + ' tracked]' : '') + '  wall ' + f((Date.now() - wall0) / 1000, 0) + ' s');
  if (FILTERED) console.log('  FILTERED (--leg/--route): forced non-zero, never a baseline.');
  console.log('='.repeat(74) + '\n');
  process.exit(FILTERED ? 1 : (nFail > 0 ? 1 : 0));
}
