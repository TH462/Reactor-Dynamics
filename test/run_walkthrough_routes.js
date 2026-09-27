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
var ACK_S = +(process.env.WR_ACK_S || 3);   // the player notices a lit Continue after this many plant-seconds (WR_ACK_S: a measurement knob, never the gate)
var BOUND_FLOOR_S = 1800;
var CMDWAIT_S = 120;    // a rod row waited on with every graded row met (pass 7 S-1: 3 plant-min dark)
/* lower power: the alarms a load cut taken at once raised on the chain (layman pass 7; SG PRESS HIGH
 * at step 4, 2026-09-26) */
var LP_FORBID = ['pzr_pressure_high', 'high_tavg', 'heatup_rate_high', 'sg_press_high'];

/* ================================ THE ROUTE TABLES ====================================== */
/* Policies: default | final (a ramp step's end value, typed once) | pull_plot{to,speed,plot_rate,repeat} | approach{short,min_rate,max_rate,
 * dwell,tap,to} | wait_tap{rate_below,power_below,dwell,skip} | hold_below{p} | nudge{steps,speed} | hold_until{p,speed}
 * | block_when{p,trip_id,param} | rows_then_cmd | seq{cmds:[...]} | observe | to_band{tref,dead,dead_hi,dir,pull,dwell,near}
 * | stair{from,to,step,wait_s|read_s,bands:[{above,step,wait_s}]}. Any step may add `stated_max_min` (the card's own time: the
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
      /* SUPERSEDED FOR THE TYPICAL ROUTE 2026-09-26 (807f) — the COUNT is the target *(OWNER RULING
       * relayed via the workbench session, selected "Guide, count is the target"; supersedes his
       * 2026-09-24 "Rod window leads")*: the player holds WITHDRAW until the tile reads the count,
       * the window is only "about where this lands"; short at its top -> single taps. The window-led
       * route above survives as `mistake_base` (the reviewer's stops at 195 / 203). */
      /* #807 review item 2 (2026-09-26): `top` is the NOTE's window top, which is now the measured
       * landing range on this count-led route (the old window tops 110 / 175 were 30 and 20 past it) */
      '#5': { policy: 'pull_count', top: 80, tap_wait_s: 30 },    // note: lands 75 to 80; short at 80 -> taps, half a plant-minute apart
      '#6': { policy: 'pull_count', top: 155, tap_wait_s: 30 },   // lands 150 to 155
      '#7': { policy: 'pull_count', top: 192 },                   // lands 190 to 192; taps let STARTUP RATE settle
      '#8': { policy: 'pull_count', top: 205 },                   // about 205
      // 9 and 10 are slow by the card's own design (a tap, a read once the rate has stopped falling —
      // about 10 minutes — repeat; then 30 to 60 minutes of climb after a 0.06 to 0.10 read), so their
      // bound is the card's, not 3 x hold. Measured 2026-09-24: step 9 21.6 / 26.7 min, step 10
      // 31.1 / 45.5 min (seeds 42 / 7). The policy still reads every 300 s and taps under 0.06.
      '#9': { policy: 'approach', short: 3, min_rate: 0.15, max_rate: 1.0, dwell: 300, tap: 1, bound_s: 5400 },   // "five plant-minutes ... until +0.15" (#807 item 10)
      '#10': { policy: 'observe', bound_s: 5400, stated_max_min: 10 },   // card: "about 2 to 6 plant-minutes" after the +0.15 (#807; measured 1.8 / 5.5 / 2.6)
      '#11': { policy: 'wait_tap', rate_below: 0.005, power_below: 0.5, dwell: 300 },
      '#12': { policy: 'observe', stated_max_min: 5 },                            // "leave the rods alone until ... 1.0 % ... STARTUP RATE +0.10 or less" (#807 item 11)
      '#13': { policy: 'pulses', k: 2, rate_le: 0.105, until_p: 5.05, peak: true, stated_max_min: 8 },   // "tap WITHDRAW twice, wait for it to peak and fall back to +0.10 or less, repeat until above 5 %"
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
      // lets go of WITHDRAW at bank 69 on a noisy 7.0e2 flicker, at 1x (0.1 s gradings): the settled count
      // there is ~680, so 5a must NOT tick (807f). RECOVERY = 5a's note since #807 review item 1: "if it
      // only touches 7.0e2 now and then ... tap WITHDRAW one step and wait half a plant-minute"
      { id: 'flicker_release_5', kind: 'undershoot', at: '#5', set: { rel_at: 69, at_speed: 1 } },
      { id: 'window_overshoot', kind: 'overshoot', at: '#5', set: { policy: 'pull_plot', to: 120 } },   // the old window-led pull, held 10 past its top
      { id: 'plot_early', kind: 'press early', at: '#8', set: { plot_rate: 99 } },
      { id: 'double_plot', kind: 'double press', at: '#6', set: { repeat: 2 } },
      { id: 'fast_tap', kind: 'tap at speed', at: '#9', set: { tap: 8 } },
      /* 2026-09-26-develop-k (owner release blocker on 9a/9b): PAST the prediction (a slow hold let go
       * 2 steps beyond it — 9a must still tick, on arrival, and 9b's note corrects the rate), and a
       * Rewind two checkpoints back in the middle of the tap-and-wait */
      { id: 'past_pred_9', kind: 'overshoot', at: '#9', set: { short: -2 } },
      { id: 'rewind_mid_9', kind: 'rewind mid-step', at: '#9', set: { rewind_after: 600 } },
      { id: 'load_before_latch', kind: 'wrong order', at: '#14', set: { policy: 'seq', cmds: [
        { action: 'set_load_target', mwe: 10 }, { action: 'latch_turbine' }, { action: 'set_load_target', mwe: 10 }] } },
      // "hold CONTROL WITHDRAW for about 13 steps" read as "hold until REACTOR POWER passes 5 %":
      // power trails the rods, so the bank ends further out (pass 3: 19 steps from 209) and the
      // plant settles at LOAD 10 MWe with REACTOR POWER under 10 % — the route that made the old
      // 10.05 % step-17 floor unfinishable.
      { id: 'hold_to_5pct', kind: 'overshoot', at: '#13', set: { policy: 'hold_until', p: 5.05, speed: 'slow' } },
      // (hold_to_5pct is ALSO 13a's pulls taken back to back with no rate wait: measured identical,
      // bank 229, peak STARTUP RATE 0.46 DPM, completes — so no separate route, #807 item 11)
      // the second block pressed 20 plant-minutes late: step 17 is then graded on a plant that
      // has SETTLED at LOAD 10 MWe (layman pass 1's route to the 10.05 % strand, §2al)
      { id: 'late_second_block', kind: 'press late', at: '#16', set: { delay_s: 1200 } },
      { id: 'rewind_mid_11', kind: 'rewind mid-step', at: '#11', set: { rewind_after: 300 } },
      { id: 'never_tap_11', kind: 'skip optional', at: '#11', set: { skip: true } },
    ],
  },
  /* ---- the other legs: typical = default policy on every step unless `steps` names one ---- */
  pwr_heatup: {
    /* 15b's own recovery (2026-09-25): "If it does not, set SET PZR PRESSURE to 2235 psi." Inert
     * on a route that arrives in the band — the step is met on entry and Continue is pressed at
     * ACK_S, before the player's ENTRY_S read ends — and the way out for `pressure_sp_high`. */
    steps: { '#15': { policy: 'seq', cmds: [{ action: 'set_pressure_setpoint', mpa: 15.41 }] },
             // 6a's own recovery, "If AUTO is lit, press CLOSE." -- inert the same way when 6a is met on entry
             '#6': { policy: 'seq', cmds: [{ action: 'set_steam_dump', mode: 'closed' }] },
             // 13a then 13b as the card orders them: the box to 1020 psi (a no-op on the preset, 7.03 MPa), then AUTO
             '#13': { policy: 'seq', cmds: [{ action: 'set_steam_dump_setpoint', mpa: 7.03 }, { action: 'set_steam_dump', mode: 'auto' }] } },
    // the heatup AGAIN, from the cooldown's end (layman pass 5): SG FEED is still in AUTO and the
    // orifices still open, as cooldown step 16 leaves them, so 5 and 7 are met on arrival
    round_entry_met: ['#5', '#7'],
    mistakes: [
      { id: 'double_rcp', kind: 'double press', at: 'cmd:set_rcp', set: { repeat: 2 } },
      { id: 'pressure_sp_high', kind: 'overshoot', at: 'cmd:set_pressure_setpoint',
        set: { policy: 'seq', cmds: [{ action: 'set_pressure_setpoint', mpa: 15.9 }] } },
      { id: 'rewind_mid_heaters', kind: 'rewind mid-step', at: 'cmd:set_heater', set: { rewind_after: 600 } },
      /* 6a's inline recovery (2026-09-25, phase 2): "If AUTO is lit, press CLOSE." The dump pressed
       * to AUTO early — step 13's press, made at step 5 — so step 6 opens with 6a unmet, which is
       * also how a plant cooled down by `pwr_cooldown` arrives (dump in AUTO, measured). The
       * `steps['#6']` policy above is the card's recovery. A first draft put this mistake AT step 6
       * and was hollow: 6a is met on entry there, Continue goes at 3 s, and the presses never ran. */
      { id: 'dump_auto_early', kind: 'press early', at: 'cmd:set_feed_coupled', set: { policy: 'seq', cmds: [
        { action: 'set_feed_coupled', active: true }, { action: 'set_steam_dump', mode: 'auto' }] } },
    ],
  },
  pwr_raise_power: {
    /* LOAD FIRST since 2026-09-24 (b) (owner ruling, option selection "Load first"). Since
     * 2026-09-25 (layman pass 4) each `b` reads "Hold WITHDRAW at MED until AVG COOLANT
     * TEMPERATURE is back in its band, about K steps": the typical player follows the GAUGE —
     * one step at a time while the tile reads more than 0.5 degF under the band value the card
     * names, one step in when it is 5 degF over. The OLD card's fixed counts are the injection
     * `chain_count_pulls` below (on the chained plant they trip the reactor at step 10). */
    /* LAYMAN PASS 7 (2026-09-26): 4b-8b read "withdraw at MED in pulls of about 5 steps, one
     * plant-minute apart" -- `pull: 5, dwell: 60` on every gauge-follower below. */
    steps: {
      'cmd:set_load_target:1': { policy: 'to_band', tref: 556, dead: 0.5, dead_hi: 5, pull: 5, dwell: 60 },
      'cmd:set_load_target:2': { policy: 'to_band', tref: 562, dead: 0.5, dead_hi: 5, pull: 5, dwell: 60 },
      'cmd:set_load_target:3': { policy: 'to_band', tref: 570, dead: 0.5, dead_hi: 5, pull: 5, dwell: 60 },
      'cmd:set_load_target:4': { policy: 'to_band', tref: 575, dead: 0.5, dead_hi: 5, pull: 5, dwell: 60 },
      'cmd:set_load_target:5': { policy: 'to_band', tref: 578, dead: 0.5, dead_hi: 5, pull: 5, dwell: 60 },
      // 9a's note: "hold INSERT a few steps whenever it rises above its band" (the chained plant's dilution tail)
      '#9': { policy: 'to_band', tref: 578, dir: 'insert', dead: 3, pull: 3, dwell: 60 },
    },
    // "Make sure the turbine is on line and taking steam": a CONFIRM step — the ask is "Check the
    // TURBINE-GENERATOR card is on line", LATCH only "if it reads TRIP" — and the low_power start
    // arrives latched at 10 MWe. Added to the provisional no-action default, not replacing it.
    // (10 and 11 were CONDITIONAL entry-met steps until 2026-09-26, when the owner took the xenon
    // steps 10-12 out of this leg: "That's for a different walkthrough.")
    entry_met: ['cmd:latch_turbine'],
    /* LAYMAN PASS 6 (2026-09-26): on the CHAINED plant the literal player is the band-floor
     * reader of `band_floor` below -- pass 6's own route, which stalled step 10 at 570 degF. */
    chain_steps: {
      'cmd:set_load_target:1': { policy: 'to_band', tref_from_text: 'floor', dead: 0, dead_hi: 5, pull: 5, dwell: 60 },
      'cmd:set_load_target:2': { policy: 'to_band', tref_from_text: 'floor', dead: 0, dead_hi: 5, pull: 5, dwell: 60 },
      'cmd:set_load_target:3': { policy: 'to_band', tref_from_text: 'floor', dead: 0, dead_hi: 5, pull: 5, dwell: 60 },
      'cmd:set_load_target:4': { policy: 'to_band', tref_from_text: 'floor', dead: 0, dead_hi: 5, pull: 5, dwell: 60 },
      'cmd:set_load_target:5': { policy: 'to_band', tref_from_text: 'floor', dead: 0, dead_hi: 5, pull: 5, dwell: 60 } },
    settle_check: true,   // pass 6 S-7: a step that says "settle(s) on N degF" completes within 5.4 degF of N
    mistakes: [
      { id: 'double_boron', kind: 'double press', at: 'cmd:set_auto_setpoint', set: { repeat: 2 } },
      // the OLD order: the pull first, LOAD after it
      { id: 'rods_before_load', kind: 'wrong order', at: 'cmd:set_load_target:1', set: { policy: 'seq', cmds: [
        { action: 'rod_nudge', group_id: 'control', steps: 20, speed: 'normal' }, { action: 'set_load_target', mwe: 30 }] } },
      // LOAD, then a 60-step first pull, three times the card's "about 20"
      { id: 'overpull_60', kind: 'overshoot', at: 'cmd:set_load_target:1', set: { policy: 'seq', cmds: [
        { action: 'set_load_target', mwe: 30 }, { action: 'rod_nudge', group_id: 'control', steps: 60, speed: 'normal' }] } },
      { id: 'rewind_mid_stage3', kind: 'rewind mid-step', at: 'cmd:set_load_target:3', set: { rewind_after: 120 } },
      /* LAYMAN PASS 6 (2026-09-26) S-1/S-7: the player who stops pulling at the FIRST reading
       * inside the band the card NAMES (its "between A and B" / "A to B °F", read from the pool
       * text, so the route follows the card as it is now), then reads step 10 literally: pull
       * 3 to 6 steps whenever the tile reads under the number the card gives — or, where it says
       * only "below its band", under the band the previous step named. Pass 6 measured stages
       * ticking at 551/551/559/564/567 °F and step 10 unmet at 570 °F with the text saying leave
       * the rods. `settle_check` (below) is the other half: a step that says "settle on N °F". */
      /* LAYMAN PASS 7 (2026-09-26) S-1/S-3: stage 4 ends HOT (the pass-7 pull, 32 steps held, peak
       * 565 degF) and stage 5 is read literally against the tile's band, near 562 +/- 5 degF:
       * withdraw only below it, insert only above it. Pass 7's plant sat at 561-563 degF and the
       * OLD 5b ("Rods withdrawn", a press) never ticked -- injection `rods_row_5b` below. */
      { id: 'hot_stage4', kind: 'overshoot', at: 'cmd:set_load_target:1', set: { policy: 'seq', cmds: [
        { action: 'set_load_target', mwe: 30 }, { action: 'rod_nudge', group_id: 'control', steps: 32, speed: 'normal' }] },
        override: { 'cmd:set_load_target:2': { policy: 'to_band', tref: 562, dead: 5, dead_hi: 5, pull: 5, dwell: 60 } } },
      /* 2026-09-26: step 10 (the `cond_pull` half) left with the xenon steps; the band-floor stages stay. */
      { id: 'band_floor', kind: 'literal reading', at: 'cmd:set_load_target:1', set: { policy: 'to_band', tref_from_text: 'floor', dead: 0, dead_hi: 5, pull: 5, dwell: 60 },
        override: {
          'cmd:set_load_target:2': { policy: 'to_band', tref_from_text: 'floor', dead: 0, dead_hi: 5, pull: 5, dwell: 60 },
          'cmd:set_load_target:3': { policy: 'to_band', tref_from_text: 'floor', dead: 0, dead_hi: 5, pull: 5, dwell: 60 },
          'cmd:set_load_target:4': { policy: 'to_band', tref_from_text: 'floor', dead: 0, dead_hi: 5, pull: 5, dwell: 60 },
          'cmd:set_load_target:5': { policy: 'to_band', tref_from_text: 'floor', dead: 0, dead_hi: 5, pull: 5, dwell: 60 } } },
    ],
  },
  pwr_lower_power: {
    forbid_raise: { '#2': LP_FORBID, '#3': LP_FORBID, '#4': LP_FORBID, '#5': LP_FORBID, '#6': LP_FORBID },
    peak_check: true,   // 2026-09-26: "under about N °F" in a step's note is graded (verdict `peak`)
    /* 2026-09-25 (layman pass 4; pace ruled "about 3 steps, one plant-minute apart" the same day,
     * workbench-h): "insert at MED in pulls of about 3 steps, one plant-minute apart, until AVG
     * COOLANT TEMPERATURE is back in its band" — the player stops at the first
     * read inside the row's edge (1 degF under it), as the reviewer did. */
    steps: {
      /* LAYMAN PASS 7 (2026-09-26) S-5: 2a/2b walk LOAD down 5 MW a plant-minute with 3-step inserts
       * whenever the tile reads above 577 degF; the alarms that one 25 MW cut raised are forbidden */
      '#2': { policy: 'load_stair', from: 100, to: 75, step: 5, wait_s: 60, ins_above: 577, pull: 3, dwell: 60 },
      '#3': { policy: 'to_band', tref: 576, dead: 0, dir: 'insert', pull: 3, dwell: 60 },
      /* OWNER RULING 2026-09-26 ("Walk them too"): 4-6 walk LOAD the same way, 5 MW a plant-minute,
       * 3-step inserts whenever the tile reads above the band top the step's c row names, and the
       * inserts go on after the last cut until it reads under it (c). The OLD one-cut routes are
       * the injections `lower_load_step4/5/6` below. */
      '#4': { policy: 'load_stair', from: 75, to: 50, step: 5, wait_s: 60, ins_above: 569, pull: 3, dwell: 60 },
      '#5': { policy: 'load_stair', from: 50, to: 30, step: 5, wait_s: 60, ins_above: 562, pull: 3, dwell: 60 },
      '#6': { policy: 'load_stair', from: 30, to: 15, step: 5, wait_s: 60, ins_above: 557, pull: 3, dwell: 60 },
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
    /* OWNER RULING, 2026-09-25, selected "Re-pace to stay under": the card's own route must not raise
     * Cooldown Rate High; then "Middle ground" (thinner margin, less time): 95 = the -55.6 degC/hr
     * (100 degF/hr) setpoint less a 5 degF/hr margin. */
    rate_max_F_hr: 95,
    /* the tile MARGIN is graded from step 4, the first step that cools: on the chain the cooldown
     * opens on the shutdown's scram transient, tile -96.9 degF/hr during step 1 (boration only,
     * measured 2026-09-25, alarm not raised). A RAISED rate alarm fails at any step. */
    rate_from_step: 4,
    /* #807 review item 4 (2026-09-26): the leg ends under the RHR suction interlock, 2.76 MPa (400 psia).
     * MEASURED: typical 182-196 psia; the spray shut at step 11's entry and never reopened, 453.7 psia --
     * the leg still COMPLETES (the "step 15 strands" in the step's own record did not reproduce here) */
    end_psia_max: 400,
    /* LAYMAN PASS 6 (2026-09-26) S-5: a player who reads the board every 4 s of WALL at the
     * card's own speed (the `when` triggers below poll at 4 s x the rung) must catch step 11's
     * spray-off before the alarm. At 600x that is one read every 40 plant-minutes, and pass 6
     * pressed OFF at 19 °F, pressure 16 psi — which is also what handed the next heatup S-2. */
    forbid_raise: { '#11': ['subcooling_low'] },
    // 12 ("Press OFF under SPRAY ..., if step 11 has not already"): the typical route shut the spray in
    // step 11 on its SUBCOOLING MARGIN line (layman pass 5), so 12 is met on arrival
    entry_met: ['#12'],
    // "Lower SET PZR PRESSURE to 1900 psi": one entry, not the replay's ramp. Ramped, the step
    // ticks at 13.6 MPa with the setpoint still mid-ramp and the player moves on (measured
    // 2026-09-24: the SI low-steam-pressure trip at step 4, 1951 psia).
    // "Raise HX SPLIT to 12 %" (step 11): the player types 12 once, not the replay's 7 -> 12 ramp
    // across the whole hold (2026-09-24, the step 11 reword was measured on this route: COOLDOWN
    // RATE tile peak -106 degF/hr at +27 min, Mode 5 in 100 plant-min; the ramp peaks -83).
    steps: { 'cmd:set_pressure_setpoint': { policy: 'final' }, 'cmd:set_pressure_setpoint:2': { policy: 'final' },
             /* step 11 as its note reads since the re-pace (2026-09-25): HX SPLIT 9 % typed once
              * (`final`); if COOLDOWN RATE runs past 100 degF/hr (-55.6 degC/hr, the alarm), lower HX
              * SPLIT (never fires on this route: tile peak -83 to -90); if SUBCOOLING MARGIN falls below 20
              * degF (11.1 degC, the alarm), SPRAY OFF. */
             /* pass 6: the spray trigger's threshold is READ FROM THE CARD (`from_text`), and every
              * trigger is polled at 4 s of wall x the speed the card has set (`poll_wall_s`) */
             'cmd:set_rhr_hx:2': { policy: 'when', base_spec: { policy: 'final', no_rows: true }, poll_wall_s: 4, on: [
               { ins: true, p: 'tavg_rate', op: '<', v: -55.6, cmd: { action: 'set_rhr_hx', pct: 6 } },
               { ins: true, p: 'subcooling_margin', op: '<', from_text: /SUBCOOLING MARGIN[^.]*?below (\d+) °F/, cmd: { action: 'set_spray', open: false } }] },
             /* step 6 (2026-09-25 bring-down): the spray is no longer a row `cmd` (a press-latched
              * `~` row flashed off while the flow ramped), so the player's two presses are named:
              * HEATER OFF, then SPRAY MANUAL at 50 %, one per tick. */
             'cmd:set_heater': { policy: 'seq', cmds: [{ action: 'set_heater', power_pct: 0 }, { action: 'set_spray', open: true, pct: 50 }] },
             /* step 4 RE-PACED 2026-09-25 (the rate rulings above): "Steps of 50 psi down to 720, then
              * 25 psi down to 270, then 15 psi ... Wait about 6 plant-minutes between steps ... About
              * three and a half hours in all." Measured 201.7 plant-min, 34 entries, tile peak -87/-90
              * degF/hr (seeds 42/7). */
             'cmd:set_steam_dump_setpoint': { policy: 'stair', from: 1020, to: 120, step: 15, wait_s: 360, stated_max_min: 225,
               bands: [{ above: 720, step: 50, wait_s: 360 }, { above: 270, step: 25, wait_s: 360 }] } },
    mistakes: [
      { id: 'pressure_sp_ramped', kind: 'press early', at: 'cmd:set_pressure_setpoint', set: { policy: 'default' } },
      { id: 'hpi_before_blocks', kind: 'wrong order', at: 'cmd:set_trip_block', set: { policy: 'seq', order: [2, 0, 1] } },
      { id: 'double_rhr', kind: 'double press', at: 'cmd:set_rhr', set: { repeat: 2 } },
      { id: 'rewind_mid_dump_sp', kind: 'rewind mid-step', at: 'cmd:set_steam_dump_setpoint', set: { rewind_after: 1800 } },
      /* #807 review item 4 (2026-09-26): spray OFF pressed at step 11's ENTRY (what the old card's
       * pulsing OFF invited), then 11b's own note two plant-minutes later -- "If OFF is already lit
       * under SPRAY, press MANUAL under SPRAY with its box at 50 %" -- then the typical 30 degF shut.
       * Injection `spray_row_old_11` is the old one-row form on this same route. */
      { id: 'spray_off_at_entry', kind: 'press early', at: 'cmd:set_rhr_hx:2', set: {
        base_spec: { policy: 'seq', cmds: [{ action: 'set_spray', open: false }, { action: 'set_rhr_hx', pct: 9 }] },
        on: [{ ins: true, p: 'tavg_rate', op: '<', v: -55.6, cmd: { action: 'set_rhr_hx', pct: 6 } },
             { ins: true, p: 'subcooling_margin', op: '<', from_text: /SUBCOOLING MARGIN[^.]*?below (\d+) °F/, cmd: { action: 'set_spray', open: false } },
             { p: 'spray_flow_pct', op: '<', v: 1, after_s: 120, if_text: /If OFF is already lit under SPRAY/, cmd: { action: 'set_spray', open: true, pct: 50 } }] } },
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
/* THE ROUND TRIP (2026-09-25, layman pass 5 S-1): the heatup AGAIN, on the plant the cooldown
 * hands it. Pass 5 stranded there at step 3 -- the shutdown's scram was still latched, WITHDRAW did
 * nothing, and no route reached the seam because the chain stopped at the cooldown's end card. A
 * repeated leg reports as `<leg>#2`, takes `round_entry_met` on top of `chain_entry_met`, and a
 * chain injection names which pass it targets with `pass: 2` (default: the first). */
var CHAIN = ['pwr_heatup', 'pwr_startup', 'pwr_raise_power', 'pwr_lower_power', 'pwr_shutdown', 'pwr_cooldown', 'pwr_heatup'];
function runChain(mutId) {
  var legs = [], ctx = { chain: true }, M = mutId ? MUTATIONS.filter(function (m) { return m.id === mutId; })[0] : null;
  for (var i = 0; i < CHAIN.length; i++) {
    var round = CHAIN.indexOf(CHAIN[i]) < i;
    ctx.round = round;
    var r = runJob(CHAIN[i], 'typical', M && M.leg === CHAIN[i] && (M.pass || 1) === (round ? 2 : 1) ? mutId : null, ctx);
    ctx = r._ctx; delete r._ctx; r.route = 'chain'; if (round) r.leg = CHAIN[i] + '#2'; legs.push(r);
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
    /* RE-AIMED 2026-09-26 (#807): 9b now hands step 12 a plant at STARTUP RATE 0.12-0.14 (the +0.15
     * approach), so the reconstructed `< 0.1` no longer ticks on entry and this went BLIND. `< 0.2`
     * is the same defect (a rate-only row the entering plant already satisfies) on today's plant. */
    /* RE-AIMED 2026-09-26 (807f): step 12 is now "power 1 %, then STARTUP RATE +0.10 or less", ORDERED,
     * so a mutated rate row behind the power row is blind. The defect restated on the new step: the
     * power row and the order gone, a rate-only `< 0.2` row the entering plant (0.13) satisfies. */
    mutate: function (P) { delete P.steps[11].accs_ordered; P.steps[11].accs = [{ p: 'startup_rate_dpm', op: '<', v: 0.2, label: 'rate row' }]; } },
  /* #807 item 10 (2026-09-26): the settle row is gone and 9b latches on a TARGET (>= 0.145, first met
   * at 212-213). Put the old 0.055 floor back on that latching row and it ticks on the first
   * falling five-minute read low in the approach, and step 10 takes the slow climb the old card had. */
  { id: 'low_floor_9', route: 'typical', expect: 'stated',
    why: "9b's target back to the old 0.055 floor (latches on a falling five-minute read; step 10 runs far past its stated minutes — measured: the leg 147.0 plant-min against 85.8)",
    /* the route reads at 330 s, not 300: at exactly 300 the policy's tap and the hidden rods-still
     * row land on the same broadcast and the row never gets a still plant to grade (measured: the
     * mutation was BLIND at dwell 300 — the typical route finished identically, 85.8 plant-min) */
    override: { '#9': { policy: 'approach', short: 3, min_rate: 0.15, max_rate: 1.0, dwell: 330, tap: 1, bound_s: 5400 } },
    mutate: function (P) { P.steps[8].accs.forEach(function (e) { if (e.p === 'startup_rate_dpm' && e.op === '>=') e.v = 0.055; }); } },
  /* 807f: the count rows graded on five raw readings again (no `mean_s`) — the tile's noise (sigma 4.5 %)
   * ticks 5a at bank 69, where the count settles near 680 */
  { id: 'no_mean_counts', route: 'flicker_release_5', expect: 'early',
    why: "5a-8a's count rows without `mean_s` (a noisy flicker latches 5a with the settled count under 7.0e2)",
    mutate: function (P) { [4, 5, 6, 7].forEach(function (i) { delete P.steps[i].accs[0].mean_s; }); } },
  /* 2026-09-26-develop-k — the two shapes the owner's release blocker was filed against */
  { id: 'still_minute_9a', route: 'typical', expect: 'unlock',
    why: "9a back to `below_1m: 3` + the 60 s stop (ticked 595-641 broadcasts after the bank reached the mark, seeds 42/7/123)",
    mutate: function (P) { var a = P.steps[8].accs[0]; delete a.reach_1m; a.below_1m = 3; } },
  { id: 'hidden_still_9', route: 'typical', expect: 'unlock',
    why: "9b's rods-still wait back in a hidden ordered 300 s row in front of it (9b dark 2066-2682 plant-s of the step, re-locked by every tap)",
    mutate: function (P) { var b = P.steps[8].accs[1]; delete b.still_s;
      P.steps[8].accs.splice(1, 0, { p: 'control_bank_steps', op: 'stopped', v: 300, hidden: true, label: 'hold' }); } },
  /* RE-AIMED 2026-09-26-develop-k: with a prediction 9a is `reach_1m` — a tap moves the bank FURTHER past
   * the mark, so dropping `latch` un-ticks nothing on typical_pass3 (measured: BLIND, 'none'). `latch`
   * still carries the NO-PREDICTION fallback (60 s still), which a tap re-grades — `rewind_mid_9` lands
   * there (the rewind empties the 1/M table). */
  { id: 'no_latch_9a', route: 'rewind_mid_9', expect: 'flash',
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
  /* `chain_step10_bank` RETIRED 2026-09-26 with raise-power step 10 (owner directive: xenon is a
   * different walkthrough). Its subject no longer exists. */
  /* LAYMAN PASS 5 (2026-09-25), S-1: the round trip. The mutation is on the COOLDOWN (step 16's
   * PRESS TO RESET row deleted) and the check is on the heatup that follows it (`check`): with no
   * reset the shutdown's scram is still latched, the rod drive refuses WITHDRAW, and heatup 3
   * strands -- exactly what the layman met at 13 psi. */
  { id: 'round_trip_no_reset', chain: true, leg: 'pwr_cooldown', check: 'pwr_heatup#2', route: 'chain', expect: 'complete',
    why: "cooldown 16 without its SCRAM reset row (layman pass 5: the scram stayed latched into the next heatup, WITHDRAW refused at step 3)",
    mutate: function (P) { P.steps[15].accs = P.steps[15].accs.filter(function (e) { return !(e.cmd && e.cmd.action === 'reset_rps'); }); } },
  /* THE RE-PACE'S WITNESS (2026-09-25): the pacing the card carried before the ruling -- 50 psi every
   * 5 plant-minutes, HX SPLIT 12 % typed once (with that card's "lower to 10 %" response) -- raised
   * Cooldown Rate High at both steps (tile -240 degF/hr at step 4, -110 at step 11, measured). */
  { id: 'cooldown_old_pacing', leg: 'pwr_cooldown', route: 'typical', expect: 'rate',
    why: 'cooldown 4 and 11 at the pre-ruling pacing (50 psi every 5 plant-minutes; HX SPLIT 12 %)',
    override: { 'cmd:set_steam_dump_setpoint': { policy: 'stair', from: 1020, to: 120, step: 50, wait_s: 300 },
                'cmd:set_rhr_hx:2': { policy: 'when', base_spec: { policy: 'seq', cmds: [{ action: 'set_rhr_hx', pct: 12 }] }, on: [
                  { ins: true, p: 'tavg_rate', op: '<', v: -55.6, cmd: { action: 'set_rhr_hx', pct: 10 } },
                  { ins: true, p: 'subcooling_margin', op: '<', v: 11.1, cmd: { action: 'set_spray', open: false } }] } } },
  /* LAYMAN PASS 6 (2026-09-26) S-4: the spacing pass 6 actually achieved -- 34 entries in 139
   * plant-minutes, 4.1 apart, where the card said 6 and gave "6 seconds at 60x" as the way to time
   * it. The card now says to time it on the plant clock; this proves the rate check sees the
   * reviewer's spacing (MEASURED on the stair alone: tile -117 degF/hr, Cooldown Rate High raised;
   * a tile-reading hold at 60-85 degF/hr did NOT save it, the tile lags 600 s: -99 to -111). */
  { id: 'cooldown_4min_waits', leg: 'pwr_cooldown', route: 'typical', expect: 'rate',
    why: 'cooldown 4 at the spacing layman pass 6 achieved (4.1 plant-minutes, not 6)',
    override: { 'cmd:set_steam_dump_setpoint': { policy: 'stair', from: 1020, to: 120, step: 15, wait_s: 246,
      bands: [{ above: 720, step: 50, wait_s: 246 }, { above: 270, step: 25, wait_s: 246 }] } } },
  /* LAYMAN PASS 6 (2026-09-26): the two cards pass 6 met, re-opened on the pool in the child. */
  { id: 'cooldown11_old_watch', leg: 'pwr_cooldown', route: 'typical', expect: 'forbid',
    why: 'cooldown 11 as pass 6 met it: one row at 600x, the spray-off a note ("if it falls below 20 degF, press OFF under SPRAY now")',
    mutate: function (P) {
      var st = P.steps[10];
      st.note = 'Keep COOLDOWN RATE under 100 degF per hour: if the Cooldown Rate High alarm comes in, lower HX SPLIT. The spray is still running and keeps taking SUBCOOLING MARGIN down: if it falls below 20 °F, press OFF under SPRAY now.';
      st.accs = [{ p: 'tavg_c', op: '<', v: 92.5, ask: 'Raise HX SPLIT to 9 % and wait for AVG COOLANT TEMPERATURE to read below 199 °F.', label: 'AVG COOLANT TEMPERATURE below 199 °F' }];
    } },
  /* #807 review item 4 (2026-09-26): cooldown 11 back to its one-row spray form (ungated, met by a press
   * at entry, no way-back line) on the route that presses OFF at entry */
  { id: 'spray_row_old_11', leg: 'pwr_cooldown', route: 'spray_off_at_entry', expect: 'end_press',
    why: 'cooldown 11 as it shipped before the review: 11b "when it reads below 30 degF, press OFF", graded on the spray alone',
    mutate: function (P) {
      var st = P.steps[10]; delete st.accs_ordered;
      st.accs = [st.accs[0], { p: 'spray_flow_pct', op: '<', v: 1, ask: 'Watch SUBCOOLING MARGIN, and when it reads below 30 °F, press OFF under SPRAY on the PRESSURIZER (PZR) card.',
        note: 'The spray is still running and keeps taking SUBCOOLING MARGIN down; the Low Subcooling Margin alarm comes in at 20 °F. Shut it much earlier and pressure climbs back over the RHR limit.', wait_speed: 60, label: 'OFF lit under SPRAY' }, st.accs[3]];
    } },
  { id: 'raise_old_settle_band', chain: true, leg: 'pwr_raise_power', route: 'chain', expect: 'settle',
    why: 'raise-power 8 graded 563-592 degF again (pass 6: step 8 ticked at 567 degF)',
    mutate: function (P) {
      /* pass 7 moved the temperature row to 8b (accs[1]) */
      P.steps[7].accs[1].ask = 'Check AVG COOLANT TEMPERATURE is near 578 °F, between 563 and 592 °F.';
      P.steps[7].accs[1].label = 'AVG COOLANT TEMPERATURE between 563 and 592 °F';
      P.steps[7].accs[1].v = 303.2; P.steps[7].accs[1].tol = 8;
      /* #807 item 2: 8b latches and a cont under 8c re-asserts the band -- widen that one too, or this goes blind */
      P.steps[7].accs.forEach(function (e) { if (e.cont && e.p === 'tavg_c') { e.v = 303.2; e.tol = 8; } });
    } },
  { id: 'cooldown_until_flat', leg: 'pwr_cooldown', route: 'typical', expect: 'stated',
    why: 'cooldown 4 as the OLD card read it: after each 50 psi, wait until the whole-degree tile reads the same twice, 5 plant-minutes apart',
    override: { 'cmd:set_steam_dump_setpoint': { policy: 'stair', from: 1020, to: 120, step: 50, read_s: 300, stated_max_min: 120 } } },
  /* LAYMAN PASS 7 (2026-09-26) S-1: raise-power 5b back to the cmd-kind "Rods withdrawn" row, on
   * the route whose stage 5 never leaves its band. Measured on the old card: 0 steps withdrawn,
   * every graded row reading met, Continue dark until a rod press the text argued against. */
  /* RE-ARMED 2026-09-26 (#807 item 2, the boron makeup-path holdup): on route hot_stage4 stage 5 now dips to
   * 556.8-556.9 degF, 0.1-0.2 under the band's 557 edge, so that route's reader pulls 5 and the press-only row is
   * satisfied -- BLIND on seeds 42/7/123. A hotter stage 4 does not help (40 steps: stage 4 ends 562.5, stage 5
   * still dips to 556.9 as LOAD comes on). The pass-7 premise is a player whose stage 5 never READS below its band:
   * here the whole-degree reader (withdraws only when the tile, rounded, reads under 557 -- dead 5.5) on the same
   * 32-step hot stage 4, as a route override on typical (a mistake's own `set` would win over it). */
  { id: 'rods_row_5b', leg: 'pwr_raise_power', route: 'typical', expect: 'flash',
    override: { 'cmd:set_load_target:1': { policy: 'seq', cmds: [{ action: 'set_load_target', mwe: 30 }, { action: 'rod_nudge', group_id: 'control', steps: 60, speed: 'normal' }] },
                'cmd:set_load_target:2': { policy: 'to_band', tref: 562, dead: 5, dead_hi: 7, pull: 5, dwell: 60 } },
    why: 'raise-power 5b as a press-only "Rods withdrawn" row again (pass 7: stage 5 never sagged below its band, 3 plant-min dark)',
    mutate: function (P) {
      P.steps[4].accs.splice(1, 1, { cmd: { action: 'rod_nudge', group_id: 'control' }, ask: 'Hold WITHDRAW at MED as AVG COOLANT TEMPERATURE sags, until it is back in its band, about 15 steps.', wait_speed: 1, label: 'Rods withdrawn' });
    } },
  /* LAYMAN PASS 7 (2026-09-26) S-5: lower-power 2 as the old card read it, LOAD 100 -> 75 MW at once and
   * the rods left alone. MEASURED on the chain: tile 595.3 degF, Pressurizer Pressure High, High
   * Coolant Temperature and Heatup Rate High in steps 2-3. */
  /* OWNER RULING 2026-09-26 ("Walk them too"): lower-power 4/5/6 as the OLD card read them -- LOAD
   * straight to 50/30/15 MW, then 3-step inserts a plant-minute apart to the band top. MEASURED on
   * the chain (walked -> one cut): step 4 576.5 -> 585.4 degF with Pressurizer Pressure High and
   * SG Pressure High; step 5 568.0 -> 574.6 degF (card: "under about 572") with SG Pressure High;
   * step 6 561.5 -> 563.8 degF, no alarm -- the one cut does no measured harm at 15 MW and step 6
   * has NO old-card injection (none goes red honestly). The OTHER half of the change is proven on
   * step 4: its OUTPUT row back at +/-5, where the 55 MW tread (54.8 on the gauge) meets it and the
   * next reading (55.07) un-ticks it, MEASURED 6.5 s met. The same mutation on step 6 stayed green
   * (the 20 MW tread's noise did not cross 20.0 inside PASS_S), so it is not claimed there. */
  { id: 'lower_load_step4', chain: true, leg: 'pwr_lower_power', route: 'chain', expect: 'forbid',
    why: 'lower-power 4 as one 25 MW cut, then the trim (585 degF, two high-pressure alarms)',
    mutate: function (P) { delete P.steps[3].ramp; },   // the old card: LOAD typed once, no walk
    override: { '#4': { policy: 'to_band', tref: 567, dead: 0, dir: 'insert', pull: 3, dwell: 60 } } },
  { id: 'lower_load_step5', chain: true, leg: 'pwr_lower_power', route: 'chain', expect: 'peak',
    why: 'lower-power 5 as one 20 MW cut, then the trim (575 degF against the card, under about 572)',
    mutate: function (P) { delete P.steps[4].ramp; },   // the old card: LOAD typed once, no walk
    override: { '#5': { policy: 'to_band', tref: 561, dead: 0, dir: 'insert', pull: 3, dwell: 60 } } },
  /* lower_output_tol4 RETIRED 2026-09-26 (#807 item 2, exp/807e1): it pinned a NOISE BIFURCATION on the boron
   * makeup-path holdup plant. 4a at +/-5 MW: red on 2 of 6 seeds (7 and 2), BLIND on gate seed 42 -- the 55 MW tread
   * settles ON the edge and the band debounce holds the tick. 4a/5a/6a at +/-4.9: red on 4 of 6 (42, 2, 7, 1), then
   * BLIND on seed 42 again in the gate run after an unrelated grading change on step 1 moved the noise phase. At
   * +/-4.8: red on 0 of 6; slower 3-minute treads: 2 of 6. MEASURED, seeds 42/7/123/1/2/3, route runner --job. No
   * tolerance mutation makes the tread tick-then-release deterministic, so it cannot stand as a gate injection. The
   * +/-2 MW rows it defended are unchanged; the un-tick detector itself is still proven by no_latch_9a (expect flash). */
  { id: 'lower_load_step', chain: true, leg: 'pwr_lower_power', route: 'chain', expect: 'forbid',
    why: 'lower-power 2 as one 25 MW cut with the rods left alone (pass 7: 596 degF and four unwarned alarms)',
    override: { '#2': { policy: 'seq', cmds: [{ action: 'set_load_target', mwe: 75 }] } } },
  /* `band_transient_pass` RETIRED 2026-09-25 (exp/w6-raise, raise-power phase 2). It narrowed stage
   * 6's Tavg row to a 2 degF band and un-ordered the step, to prove a transient pass through the band
   * is flagged. On the xenon-free `low_power` the 35-step pull crosses that band faster than the
   * runtime's ACC_STABLE_N streak, so the row never ticks at all (MEASURED, four placements: tol 1,
   * 1.5, 2.5 degF, head and `cont`, before and after the rod row — never met, or met with the step
   * completing at once). The row is now a `cont` of 6c, graded after OUTPUT arrives and under
   * `accs_ordered`, so the transient tick it guarded cannot light Continue. The detector itself is
   * still proven by `no_latch_9a` (expect flash). */
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
  var MIS0 = (table.mistakes || []).filter(function (m) { return m.id === routeId; })[0];   // a mistake may re-route several steps (pass 6)
  if (MIS0 && MIS0.override) Object.keys(MIS0.override).forEach(function (k) { var i = resolveKey(proc, k); if (i >= 0) byIdx[i] = MIS0.override[k]; });
  /* WR_OVERRIDE='{"<leg>":{"<step key>":{spec}}}' on a --job run: a MEASUREMENT knob (the pacing
   * sweep behind the 2026-09-25 cooldown re-pace), never the gate. */
  if (process.env.WR_OVERRIDE) { var WO = JSON.parse(process.env.WR_OVERRIDE)[legId] || {};
    Object.keys(WO).forEach(function (k) { var i = resolveKey(proc, k); if (i >= 0) byIdx[i] = WO[k]; }); }
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
  (table.entry_met || []).concat(ctx && ctx.chain ? (table.chain_entry_met || []) : [])
    .concat(ctx && ctx.round ? (table.round_entry_met || []) : []).forEach(function (k) { var i = resolveKey(proc, k); if (i >= 0) entryMet[i] = true; });
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
  /* A REFUSED COMMAND IS THE PLAYER'S "Command error" LINE, NOT A HARNESS CRASH (layman pass 5
   * S-1): the rod drive THROWS on a latched trip, and uncaught it took the whole chain down with it
   * instead of reporting the strand the player met. Recorded on the step, then the run goes on. */
  function send(c) {
    try { return svc.handleCommand(c); }
    catch (e) {
      var msg = String((e && e.message) || e).slice(0, 60);
      if (cur >= 0 && out[cur]) (out[cur].errs = out[cur].errs || []).push((c && c.action) + ': ' + msg);
      return { type: 'error', message: msg };
    }
  }
  function activeAlarms() { var o = {}; (s.alarms || []).forEach(function (a) { if (a.state && a.state !== 'clear' && a.priority !== 'status') o[a.id] = 1; }); return o; }
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
  var T0 = t(), out = [], flags = [], result = null, rewound = false, rateArmed = false, ALON = {};
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
      /* pass 6: "settle(s) on N degF" (settle_check) and the alarms a step must not raise (forbid_raise) */
      var stx = [st.text].concat((st.accs || []).map(function (e) { return e.ask || ''; })).join(' '), sm = /settles? (?:the temperature )?on (\d{3}) °F/.exec(stx);
      if (table.settle_check && sm) out[k].settle = +sm[1];
      /* 2026-09-26 (lower-power 4-6 walked, owner ruling "Walk them too"): a note that says the tile
       * stays "under about N °F" is a peak claim, graded on the player route (`peak_check`) */
      var ntx = [st.note || ''].concat((st.accs || []).map(function (e) { return e.note || ''; })).join(' '), pk = /under about (\d{3}) °F/.exec(ntx);
      if (table.peak_check && pk) out[k].peak_max = +pk[1];
      Object.keys(table.forbid_raise || {}).forEach(function (fk) { if (resolveKey(proc, fk) === k) out[k].forbid = table.forbid_raise[fk]; });
      S.alarm0 = activeAlarms();
    }
    /* the step's pressure / subcooling floor and the alarms it RAISED (layman pass 5, S-4/S-5/S-6:
     * a stepped report of what the player's board did, printed by stepTable, asserted nowhere) */
    var pNow = pv('pressure_mpa') * 145.0377, scNow = pv('subcooling_c') * 9 / 5;
    if (isFinite(pNow)) out[k].prlo = Math.min(out[k].prlo == null ? 1e9 : out[k].prlo, pNow);
    if (isFinite(scNow)) out[k].sclo = Math.min(out[k].sclo == null ? 1e9 : out[k].sclo, scNow);
    /* the COOLDOWN RATE tile's own channel -- `instruments.tavg_rate`, indicated Tavg differentiated
     * and lagged 600 s, what `cooldown_rate_high` compares with -55.6 degC/hr -- and the engine's
     * truer rate (60 s filter) beside it, both in degF/hr (2026-09-25 re-pace) */
    var rIns = (s.instruments || {}).tavg_rate, rTru = pv('tavg_rate_c_per_hr');
    /* a chained leg can ARRIVE on a fast tile (the shutdown's scram): count the tile only once it
     * has read inside +/-100 degF/hr in this leg, so the verdict is the card's pacing, not the seam */
    if (rIns != null && isFinite(rIns) && Math.abs(rIns) < 55.6) rateArmed = true;
    if (rateArmed && rIns != null && isFinite(rIns)) out[k].ratelo = Math.min(out[k].ratelo == null ? 0 : out[k].ratelo, rIns * 9 / 5);
    if (rTru != null && isFinite(rTru)) out[k].truelo = Math.min(out[k].truelo == null ? 0 : out[k].truelo, rTru * 9 / 5);
    (s.alarms || []).forEach(function (a) {
      if (a.state && a.state !== 'clear' && !S.alarm0[a.id] && a.priority !== 'status') {
        S.alarm0[a.id] = 1; (out[k].raised = out[k].raised || []).push(a.id + '@' + f(pNow, 0) + 'psia/' + f(pv('tavg_c') * 9 / 5 + 32) + 'F');
        ALON[a.id] = t();
      }
    });
    /* how long a raised alarm stood (layman pass 7: PORV OPEN beside a diagram reading CLOSED) */
    Object.keys(ALON).forEach(function (id) {
      var live = (s.alarms || []).some(function (a) { return a.id === id && a.state && a.state !== 'clear'; });
      if (!live) { (out[k].cleared = out[k].cleared || []).push(id + ' after ' + f(t() - ALON[id], 0) + ' s'); delete ALON[id]; }
    });
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
      if (!S.rowsMet[i] && r.met) {
        S.rowsMetAt[i] = t();
        /* the reading the row ticked on, once per row (#807 review item 5: what the tile shows at the tick) */
        if (r.obs != null && isFinite(r.obs)) { out[k].ticks = out[k].ticks || {}; if (out[k].ticks[i] == null) out[k].ticks[i] = [+((t() - S.t0) / 60).toFixed(2), +(+r.obs).toFixed(3)]; }
      }
      var band = e.op === '~' && !e.latch, heldS = t() - (S.rowsMetAt[i] == null ? t() : S.rowsMetAt[i]);
      if (S.rowsMet[i] && !r.met && !e.cont && !e.hidden && !(band && heldS >= PASS_S))
        flags.push({ kind: 'untick', step: k + 1, row: i + 1, label: e.label, t_min: (t() - T0) / 60, held_s: heldS });
      S.rowsMet[i] = !!r.met;
    });
    /* --- THE SUBSTEP SEQUENCER AS THE PLAYER SEES IT (2026-09-26-develop-k, owner release blocker on
     * pwr_startup 9: "9a doesnt reliably check off when i put the rods to 3 steps away from the
     * prediction ... 9b just doesnt unlock ... then lockes again when i hit withdaraw").
     * (1) REACH: on a row graded against the 1/M prediction (`reach_1m` / `below_1m`), the plant-s and
     *     broadcasts from CONTROL ROD POSITION first reading within 3.9 steps of the printed prediction
     *     to the row's tick (`a_tick`). (2) LOCK: on an ordered step, a DRAWN row whose drawn
     *     predecessors are all met but which sits behind an unmet HIDDEN row is locked by something the
     *     card never shows — ui/app.js draws it muted (`ordWait`). Flagged `hidden_lock`, with the
     *     unlock lag and the re-locks (unlocked, then locked again) recorded on the step. */
    var dtT = S.prevT == null ? 0 : t() - S.prevT; S.prevT = t();
    if (grp() && (moving() || bank() !== S.lastBank)) { S.lastBank = bank(); S.lastMove = t(); }
    S.nTick = (S.nTick || 0) + 1;
    (st.accs || []).forEach(function (e, i) {
      var r = rows[i] || {};
      if ((e.reach_1m != null || e.below_1m != null) && grp()) {
        out[k].m1 = true;
        if (S.reachAt == null && r.pred_1m != null && bank() >= r.pred_1m - 3.9) { S.reachAt = t(); S.reachTick = S.nTick; out[k].reach_bank = bank(); out[k].reach_pred = r.pred_1m; }
        if (r.met && S.reachMet == null) {
          S.reachMet = t();
          out[k].a_tick = { at_min: +((t() - S.t0) / 60).toFixed(2), bank: bank(), moving: moving(), no_1m: !!r.no_1m,
            lag_s: S.reachAt == null ? null : +(t() - S.reachAt).toFixed(2), lag_bc: S.reachAt == null ? null : S.nTick - S.reachTick };
        }
      }
      if (!st.accs_ordered || e.hidden || e.cont || i === 0 || r.met) return;
      var eligible = true, blocker = -1;
      for (var q = 0; q < i; q++) {
        if (!st.accs[q].hidden && !(rows[q] || {}).met) eligible = false;
        if (blocker < 0 && !(rows[q] || {}).met) blocker = q;
      }
      if (!eligible) return;
      S.lk = S.lk || {};
      var L = S.lk[i] = S.lk[i] || { elig: t(), was: null, relocks: 0 };
      var locked = blocker >= 0;
      if (!locked && L.was !== false && L.unl == null) { L.unl = t(); (out[k].unlock = out[k].unlock || {})[i] = +(t() - L.elig).toFixed(2); }
      if (L.was === false && locked) { L.relocks++; out[k].relocks = L.relocks; }
      L.was = locked;
      if (locked && st.accs[blocker].hidden) {
        out[k].hidden_lock_s = +((out[k].hidden_lock_s || 0) + dtT).toFixed(1);
        if (!S.lkFlag) { S.lkFlag = true; flags.push({ kind: 'hidden_lock', step: k + 1, row: i + 1, label: e.label, t_min: (t() - T0) / 60 }); }
      }
    });
    /* the rods-still clock at a drawn rate row's tick (9b: five plant-minutes after the last tap) */
    (st.accs || []).forEach(function (e, i) {
      if (e.p === 'startup_rate_dpm' && !e.hidden && (rows[i] || {}).met && out[k].b_still_s == null && S.lastMove != null) out[k].b_still_s = +(t() - S.lastMove).toFixed(1);
    });
    /* A ROD ROW NOTHING ON THE BOARD CALLS FOR (layman pass 7, S-1): every graded row met, and the
     * step waits on a cmd-only rod row for CMDWAIT_S plant-seconds. The pass-7 player sat 3
     * plant-minutes dark at raise-power 5b, "Rods withdrawn", with the gauge in its band. */
    /* graded on the row's own reading (`obs`), not its latch: an ordered step blocks the later rows
     * from LATCHING behind the unpressed rod row, which is the soft lock itself */
    var predAll = rows.length && rows.every(function (r, i) {
      var e = (st.accs || [])[i] || {}, o = r.obs;
      if (!e.p || r.met) return true;
      if (o == null || typeof o !== 'number') return false;
      return e.op === '>' ? o > e.v : e.op === '<' ? o < e.v : e.op === '>=' ? o >= e.v : e.op === '<=' ? o <= e.v
        : e.op === '~' ? Math.abs(o - e.v) <= e.tol : false;
    });
    var rodWait = -1;
    rows.forEach(function (r, i) { var e = (st.accs || [])[i] || {}; if (rodWait < 0 && !r.met && !e.p && cmdAction(e.cmd) === 'rod_nudge') rodWait = i; });
    if (predAll && rodWait >= 0) {
      if (S.cw0 == null) S.cw0 = t();
      if (!S.cwFlag && t() - S.cw0 >= CMDWAIT_S) {
        S.cwFlag = true; flags.push({ kind: 'cmdwait', step: k + 1, row: rodWait + 1, label: (st.accs[rodWait] || {}).label, t_min: (t() - T0) / 60, held_s: t() - S.cw0 });
      }
    } else S.cw0 = null;
    S.lastReadings = readings();
    var tF = S.lastReadings.tavg_F, pw = S.lastReadings.power_pct;   // the step's Tavg / power span (stepTable prints it)
    out[k].tlo = Math.min(out[k].tlo == null ? 1e9 : out[k].tlo, tF); out[k].thi = Math.max(out[k].thi == null ? -1e9 : out[k].thi, tF);
    out[k].plo = Math.min(out[k].plo == null ? 1e9 : out[k].plo, pw);
    out[k].phi = Math.max(out[k].phi == null ? -1e9 : out[k].phi, pw);   // peak power / startup rate (#807 item 11)
    if (S.lastReadings.sur_dpm != null) out[k].surhi = Math.max(out[k].surhi == null ? -1e9 : out[k].surhi, S.lastReadings.sur_dpm);
    /* WR_TRACE=<step,step>: a measurement knob, never the gate — [min into step, bank, power %,
     * startup rate, source range] every 15 plant-seconds on the named steps */
    if (process.env.WR_TRACE && (',' + process.env.WR_TRACE + ',').indexOf(',' + (k + 1) + ',') >= 0 && t() - (S.trT == null ? -1e9 : S.trT) >= 15) {
      S.trT = t(); (out[k].trace = out[k].trace || []).push([+(el / 60).toFixed(2), S.lastReadings.bank, +pw.toFixed(3),
        S.lastReadings.sur_dpm != null ? +S.lastReadings.sur_dpm.toFixed(3) : null, S.lastReadings.sr_cps != null ? Math.round(S.lastReadings.sr_cps) : null]);
    }
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
    setSpeed(S.spec.at_speed || rung || st.wait_speed || (st.acc && st.acc.wait_speed) || ((st.hold || 0) >= 1800 ? 600 : 10));
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
  result.blocks = { lo_press: pv('lo_press_blocked'), si_trip: pv('si_trip_blocked') };   // pass 6: what the next leg inherits
  var ret = { leg: legId, route: routeId, kind: mistake ? mistake.kind : 'typical', typical: typicalKind, result: result, steps: out.filter(Boolean), flags: flags };
  if (ctx) ret._ctx = { svc: svc, s: s, chain: true };
  return ret;

  /* ------------------------------ the policy vocabulary ------------------------------ */
  /* `noRods` (layman pass 7, 2026-09-26, S-1): on a gauge-following step the rods are the
   * route's OWN pulls. Pressing a rod row's `cmd` here sent a bare `rod_nudge` the literal player
   * never makes -- a free tap -- and it latched raise-power 5b's cmd-kind "Rods withdrawn" on a
   * plant whose temperature never left its band, which is how the gate stayed green through the
   * soft lock pass 7 met. */
  function pressRows(st2, c2, stopAt, noRods) {
    var accs = st2.accs || [];
    for (var i = 0; i < accs.length; i++) {
      if (c2.accs && c2.accs[i] && c2.accs[i].met) continue;
      var e = accs[i];
      if (e.cmd && !S.memo['r' + i] && !(noRods && cmdAction(e.cmd) === 'rod_nudge')) {
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
      if (!spec.no_rows) pressRows(st2, c2);   // no_rows: the step's row presses are conditional (a `when` owns them)
      return;
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
    /* "Hold CONTROL WITHDRAW until SOURCE RANGE reads <target>" — THE COUNT LEADS (owner ruling
     * relayed 2026-09-26, "Guide, count is the target"). The player holds WITHDRAW while the TILE
     * reads under the row's target and lets go the broadcast it first reads the target. If the
     * row has not ticked once the rods have been still 60 s with STARTUP RATE at +0.03 or less,
     * they go back to WITHDRAW — one step at a time (`tap_top`) once the window top is reached,
     * the card's "keep tapping one step at a time and let the rate settle". Plots as pull_plot. */
    if (P === 'pull_count') {
      var row0 = (st2.accs || [])[0] || {}, rd = pv(row0.p), m0 = rows2[0] && rows2[0].met;
      if (S.memo.tickBank == null && m0) {
        S.memo.tickBank = bank(); out[cur].tick_bank = bank(); out[cur].tick_sr = Math.round(rd);
        /* THE EARLY TICK (807f): the tile's own mean over the 30 s before the tick, against the row */
        var w30 = (S.memo.sr || []).filter(function (x) { return x[0] >= t() - 30; });
        var m30 = w30.length ? w30.reduce(function (a, x) { return a + x[1]; }, 0) / w30.length : rd;
        out[cur].tick_sr30 = Math.round(m30);
        /* 1 % slack: the row's own 30 s ring and this one differ by a sample at each end (measured: 693
         * against 695, 1349 against 1350 on routes whose row IS mean-graded); the defect is 674 at bank 69 */
        if (m30 < row0.v * 0.99) flags.push({ kind: 'early_tick', step: cur + 1, bank: bank(), mean30: Math.round(m30), v: row0.v, t_min: (t() - T0) / 60 });
      }
      if (S.memo.lb2 !== bank() || moving()) { S.memo.lb2 = bank(); S.memo.still = t(); }
      if (!m0 && !moving()) {
        /* #807 review item 1 (2026-09-26): once the player has let go, EVERY way back is a single tap
         * -- the note's "if it only touches it now and then, or is still short at <top>, tap WITHDRAW
         * one step and wait half a plant-minute" (`tap_wait_s`, steps 5 and 6), or "let STARTUP RATE
         * settle between taps" (7 and 8: 60 s still and +0.03 or less). Before, a count release
         * resumed the HOLD after the settle, which no card line asks for. */
        var holding = !S.memo.rel, settled = S.memo.rel && (spec.tap_wait_s != null ? t() - S.memo.still >= spec.tap_wait_s
          : t() - S.memo.still >= (spec.wait_s || 60) && pv('startup_rate_dpm') <= 0.03);
        if (holding && (rd >= row0.v || (spec.rel_at != null && !S.memo.relAt && bank() >= spec.rel_at))) {
          if (spec.rel_at != null) S.memo.relAt = true; S.memo.rel = true; S.memo.tapOnly = !spec.resume_hold; S.memo.still = t(); out[cur].rel_bank = bank(); out[cur].rel_sr = Math.round(rd); }
        else if (holding && spec.top != null && bank() >= spec.top) { S.memo.rel = true; S.memo.tapOnly = true; S.memo.still = t(); out[cur].at_top = true; }   // "short at the window top": stop, then single taps
        else if (holding || settled) {
          if (settled) { out[cur].resumes = (out[cur].resumes || 0) + 1; if (spec.top != null && bank() >= spec.top) S.memo.tapOnly = true; }
          S.memo.rel = S.memo.tapOnly ? true : false; S.acts++;
          if (spec.cap == null || bank() < spec.cap) nudge(1, S.memo.tapOnly ? 'slow' : (spec.speed || 'normal'));
          S.memo.still = t();
        }
      }
      if (m0 && !S.memo.rel) { S.memo.rel = true; if (out[cur].rel_bank == null) { out[cur].rel_bank = bank(); out[cur].rel_sr = Math.round(rd); } }
      /* the settled count the point is taken on: the tile's mean over the 60 s before the press */
      (S.memo.sr = S.memo.sr || []).push([t(), rd]);
      while (S.memo.sr.length && S.memo.sr[0][0] < t() - 60) S.memo.sr.shift();
      var pRow = -1;
      (st2.accs || []).forEach(function (e, i) { if (cmdAction(e.cmd) === 'plot_1m_point') pRow = i; });
      if (m0 && !moving() && pRow >= 0 && !S.memo.plotted && !(rows2[pRow] && rows2[pRow].met) &&
          pv('startup_rate_dpm') <= (spec.plot_rate != null ? spec.plot_rate : 0.03)) {
        var okP = true; for (var qq = 0; qq < (spec.repeat || 1) && okP; qq++) okP = plot();
        if (okP) {
          S.memo.plotted = true; S.acts++; out[cur].plot_bank = bank(); out[cur].plot_sr = Math.round(rd);
          out[cur].plot_sr60 = Math.round(S.memo.sr.reduce(function (a, x) { return a + x[1]; }, 0) / S.memo.sr.length);
        }
      }
      return;
    }
    /* "Withdraw `k` steps at SLOW, wait for STARTUP RATE to fall to `rate_le` or less, repeat until
     * REACTOR POWER reads above `until_p`" (#807 item 11, the climb to 5 % from the startup rate). */
    if (P === 'pulses') {
      if (process.env.WR_PULSE) { var wp = process.env.WR_PULSE.split(','); spec = { k: +wp[0], rate_le: +wp[1], until_p: spec.until_p, speed: spec.speed }; }   // measurement knob
      /* `peak` (#807 review item 3, 2026-09-26): the card now reads "wait for it to PEAK and fall back
       * to +0.10 or less" -- the rate lags the taps, so a reader who pulls on the first +0.10 after a
       * tap is pulling on the rate BEFORE it rose. Next pull only once the rate has come off its
       * post-tap maximum by 0.005 DPM. */
      var surN = pv('startup_rate_dpm');
      if (S.memo.lastPull != null) S.memo.pk = Math.max(S.memo.pk == null ? -1e9 : S.memo.pk, surN);
      var fell = !spec.peak || S.memo.lastPull == null || (S.memo.pk != null && surN <= S.memo.pk - 0.005);
      if (!moving() && pv('power_pct') < spec.until_p && surN <= spec.rate_le && fell &&
          (S.memo.from == null || bank() >= S.memo.from + spec.k) &&
          t() - (S.memo.lastPull == null ? -1e9 : S.memo.lastPull) >= (spec.dwell || 0)) {
        S.memo.lastPull = t(); S.memo.pk = null; S.memo.from = bank(); nudge(spec.k, spec.speed || 'slow'); S.acts++; out[cur].pulls = (out[cur].pulls || 0) + 1;
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
      /* THE STEP'S OWN rod_nudge IS NOT THE PLAYER'S ACTION (2026-09-25, workbench-h). The live
       * checklist never issues `cmd`; on a to_band step the player's rods are the card's pulls
       * below. Sending the replay's `rod_nudge -40` too put 40 steps in at once on lower power 3
       * and, at bank ~250 (~0.6 degF/step), cooled the loop 18-19 degF/min: PRIMARY PRESSURE floors
       * 2067/1972/1915/1915 psia on the chain at the card's pace against 2001/1938/1936/1941 without it
       * (steps 3-6). A LOAD command (steps 4-6, raise power) is still the player's and is still sent. */
      if (!(spec.no_cmd)) { if (!(st2.cmd && cmdAction(st2.cmd) === 'rod_nudge')) issueStepCmd(st2, el2); pressRows(st2, c2, null, true); }
      if (spec.tref_from_text && S.memo.tref == null) {   // pass 6: the floor of the band the card names, +1 degF
        var btx = (st2.accs || []).map(function (e) { return (e.ask || '') + ' ' + (e.label || ''); }).join(' '), bm, blo = null, bre = /(\d{3}) (?:to|and) (\d{3}) °F/g;
        while ((bm = bre.exec(btx))) if (blo == null) blo = +bm[1];
        S.memo.tref = blo != null ? blo + 1 : 556; out[cur].tref = S.memo.tref;
      }
      if (S.memo.tref != null) spec = Object.assign({}, spec, { tref: S.memo.tref });
      var tf = pv('tavg_c') * 9 / 5 + 32, far = spec.near != null && Math.abs(tf - spec.tref) > spec.near;   // `near`: held straight through until within it
      /* the RISE AFTER RELEASE (layman pass 7, S-3): the tile at the last withdraw and its peak since */
      if (S.memo.relF != null && !moving()) { out[cur].rise_F = Math.max(out[cur].rise_F || 0, tf - S.memo.relF); out[cur].release_F = S.memo.relF; }
      if (el2 < (spec.after_s || 0) || moving() || (!far && t() - (S.memo.lastPull || -1e9) < (spec.dwell || 0))) return;
      var pull = far ? 1 : (spec.pull || 1);
      if (spec.dir !== 'insert' && tf < spec.tref - (spec.dead != null ? spec.dead : 1)) {
        nudge(pull, spec.speed || 'normal'); S.acts++; S.memo.lastPull = t(); out[cur].withdrawn = (out[cur].withdrawn || 0) + pull;
        S.memo.relF = tf; out[cur].rise_F = 0;
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
      if (S.memo.k == null) { S.memo.k = 0; S.memo.sp = spec.from; S.memo.pk = []; }
      /* `bands` (2026-09-25 re-pace): [{above, step, wait_s}], the first whose `above` is under the
       * setpoint now sets the next step's size and the wait before it; else `step` / `wait_s`. */
      var bd = (spec.bands || []).filter(function (b) { return S.memo.sp > b.above; })[0] || spec;
      var ri = (s.instruments || {}).tavg_rate;
      if (S.memo.k > 0 && ri != null && isFinite(ri)) { var pk = S.memo.pk[S.memo.k - 1]; if (ri * 9 / 5 < pk[1]) pk[1] = Math.round(ri * 9 / 5); }
      var nextSp = Math.max(spec.to, S.memo.sp - bd.step);
      if (S.memo.k > 0 && S.memo.sp <= spec.to) return;   // at the bottom
      var due = (S.memo.k === 0 || (bd.wait_s != null ? t() - S.memo.at >= bd.wait_s
        : (t() - S.memo.lr >= (spec.read_s || 300) && (S.memo.lastRead === tfl || (S.memo.lr0 = S.memo.lastRead, S.memo.lastRead = tfl, S.memo.lr = t(), false)))));
      if (S.memo.k === 0 || due) {
        send({ action: 'set_steam_dump_setpoint', mpa: nextSp / 145.0377 }); S.acts++;
        S.memo.k++; S.memo.at = t(); S.memo.lr = t(); S.memo.lastRead = tfl; S.memo.sp = nextSp;
        S.memo.pk.push([nextSp, 0]); out[cur].stair_pk = S.memo.pk;
        out[cur].entries = S.memo.k;
      }
      return;
    }
    /* `load_stair{from,to,step,wait_s}` (layman pass 7, S-5): LOAD typed down in `step` MWe
     * entries, `wait_s` plant-seconds apart, as a card that walks the load rather than steps it
     * reads; the step's other rows are pressed as they go live. */
    if (P === 'load_stair') {
      if (S.memo.lk == null) { S.memo.lk = 0; S.memo.lsp = spec.from; S.memo.lat = -1e9; }
      if (S.memo.lsp > spec.to && t() - S.memo.lat >= spec.wait_s) {
        S.memo.lsp = Math.max(spec.to, S.memo.lsp - spec.step); S.memo.lat = t(); S.memo.lk++; S.acts++;
        send({ action: 'set_load_target', mwe: S.memo.lsp }); out[cur].entries = S.memo.lk;
      }
      if (S.memo.lsp <= spec.to) pressRows(st2, c2, null, true);
      /* `ins_above`: rods in, `pull` steps `dwell` s apart, whenever the tile reads above it */
      if (spec.ins_above != null && !moving() && pv('tavg_c') * 9 / 5 + 32 > spec.ins_above && t() - (S.memo.lastPull || -1e9) >= (spec.dwell || 60)) {
        nudge(-(spec.pull || 3), 'normal'); S.acts++; S.memo.lastPull = t(); out[cur].inserted_n = (out[cur].inserted_n || 0) + (spec.pull || 3);
      }
      return;
    }
    /* `cond_pull` (pass 6, raise-power 10 read literally): pull `pull` steps whenever the tile
     * reads under the number the row's ask gives ("below N degF"), or -- when it says only "below
     * its band" -- under the floor of the band the PREVIOUS step's text named; `dwell` s apart. */
    if (P === 'cond_pull') {
      if (S.memo.thr == null) {
        var ask0 = ((st2.accs || [])[0] || {}).ask || '', m1 = /below (\d{3}) °F/.exec(ask0);
        if (m1) S.memo.thr = +m1[1];
        else {
          var prev = proc.steps[cur - 1] || {}, ptx = (prev.accs || []).map(function (e) { return e.ask || ''; }).join(' '), mm, lo = null, re = /(\d{3}) (?:to|and) (\d{3}) °F/g;
          while ((mm = re.exec(ptx))) lo = +mm[1];
          S.memo.thr = lo != null ? lo : -1e9;
        }
        out[cur].thr_F = S.memo.thr;
      }
      var tf2 = pv('tavg_c') * 9 / 5 + 32;
      if (!moving() && tf2 < S.memo.thr && t() - (S.memo.lastPull || -1e9) >= (spec.dwell || 300)) {
        nudge(spec.pull || 5, 'normal'); S.acts++; S.memo.lastPull = t(); out[cur].withdrawn = (out[cur].withdrawn || 0) + (spec.pull || 5);
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
    /* `when` (layman pass 5, 2026-09-25): the step's `base` policy, plus one-shot presses the card
     * makes CONDITIONAL on a reading -- "if COOLDOWN RATE runs over 100 degF/hr, lower HX SPLIT",
     * "if SUBCOOLING MARGIN falls below 20 degF, shut the spray". Each trigger fires once. */
    if (P === 'when') {
      policy(spec.base_spec || { policy: spec.base || 'default' }, st2, c2, rows2, el2);
      if (spec.poll_wall_s) {   // pass 6: the player looks every poll_wall_s of WALL, i.e. x the speed the card has set
        if (t() - (S.memo.lastPoll || -1e9) < spec.poll_wall_s * (speedNow || 1)) return;
        S.memo.lastPoll = t();
      }
      (spec.on || []).forEach(function (w, i) {
        if (S.memo['w' + i]) return;
        /* `if_text`: the trigger exists only if the CARD says it (a recovery line the old card did not
         * carry); `after_s`: the player notices no sooner than this far into the step (#807 review item 4) */
        if (w.after_s != null && t() - S.t0 < w.after_s) return;
        if (w.if_text && !w.if_text.test([st2.text, st2.note || ''].concat((st2.accs || []).map(function (e) { return (e.ask || '') + ' ' + (e.note || ''); })).join(' '))) return;
        if (w.from_text && S.memo['v' + i] === undefined) {
          var wtx = [st2.text, st2.note || ''].concat((st2.accs || []).map(function (e) { return (e.ask || '') + ' ' + (e.note || ''); })).join(' '), wm = w.from_text.exec(wtx);
          S.memo['v' + i] = wm ? (+wm[1]) * 5 / 9 : null; out[cur]['trig' + i + '_F'] = wm ? +wm[1] : null;
        }
        if (w.from_text) { if (S.memo['v' + i] == null) return; w = Object.assign({}, w, { v: S.memo['v' + i] }); }
        var v = w.ins ? (s.instruments || {})[w.p] : pv(w.p);   // `ins`: the TILE's instrument, what the player reads
        if (v != null && isFinite(v) && (w.op === '<' ? v < w.v : v > w.v)) {
          S.memo['w' + i] = true; S.acts++; press(w.cmd);
          (out[cur].fired = out[cur].fired || []).push(cmdAction(w.cmd) + '@' + f(t() - S.t0, 0) + 's');
        }
      });
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
  // RESOLVED 2026-09-26 (exp/807int merge of workbench 38b8049a): 'chain:pwr_heatup#2:flash' --
  // workbench-e's seed-42 flicker of heatup 16's SOURCE RANGE `steady` row (1.2 % over 600 s) on the
  // SECOND lap. That row no longer exists: #807 item 5 re-graded 16 to 90 s at 8 % plus 16c rods 0 and
  // 16d BORON STATUS HOLD. On the merged tree the chain carries no heatup#2 flash (gate seed 42, full run).
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
    /* THE CARD'S OWN ROUTE STAYS UNDER THE RATE LIMIT (OWNER RULING, 2026-09-25, selected "Re-pace
     * to stay under"): a leg with `rate_max_F_hr` fails if any step RAISES the rate alarm, or its
     * COOLDOWN RATE tile channel runs past the margin anywhere in the leg. */
    var lim = ROUTES[r.leg] && ROUTES[r.leg].rate_max_F_hr;
    if (lim) rateVerdict();
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
  function rateVerdict() {
      var worst = null, rz = [];
      (r.steps || []).forEach(function (st) {
        if (st.ratelo != null && st.n >= (ROUTES[r.leg].rate_from_step || 1) && (worst == null || st.ratelo < worst.v)) worst = { v: st.ratelo, n: st.n };
        (st.raised || []).forEach(function (a) { if (/^(cooldown|heatup)_rate_high@/.test(a)) rz.push('step ' + st.n + ' ' + a); });
      });
      v.rate = { ok: !rz.length && !!worst && worst.v >= -lim,
        name: 'the card\'s own pacing never raises the rate alarm (COOLDOWN RATE tile within ' + lim + ' degF/hr)',
        note: (rz.length ? 'RAISED ' + rz.join('; ') + ' | ' : '') + (worst ? 'tile peak ' + f(worst.v) + ' degF/hr at step ' + worst.n : 'no tile reading') };
  }
  /* pass 6 (2026-09-26): "settle on N degF" means N, not the band floor (S-7); an alarm a step's card
   * must not raise on the player's route (S-5); the SI blocks a cooldown sets are gone again when
   * the round trip's heatup reaches normal pressure (the ECCS seam). */
  var st8 = (r.steps || []).filter(function (st) { return st.settle != null && st.at_done && Math.abs(st.at_done.tavg_F - st.settle) > 5.4; });
  if ((r.steps || []).some(function (st) { return st.settle != null; }))
    v.settle = { ok: st8.length === 0, name: 'a step that says "settle on N degF" completes within 5.4 degF of N',
      note: st8.length ? st8.map(function (st) { return 'step ' + st.n + ' done at ' + f(st.at_done.tavg_F) + ' degF against ' + st.settle; }).join('; ') : 'all inside' };
  var pkx = (r.steps || []).filter(function (st) { return st.peak_max != null && st.thi != null && st.thi > st.peak_max; });
  if ((r.steps || []).some(function (st) { return st.peak_max != null; }))
    v.peak = { ok: pkx.length === 0, name: 'a step whose note says AVG COOLANT TEMPERATURE stays "under about N °F" stays under N on the player route',
      note: pkx.length ? pkx.map(function (st) { return 'step ' + st.n + ' peaked ' + f(st.thi) + ' degF against ' + st.peak_max; }).join('; ') : 'all under' };
  var epm = ROUTES[r.leg] && ROUTES[r.leg].end_psia_max;
  if (epm && res.kind === 'complete' && res.end)
    v.end_press = { ok: res.end.pressure_psia <= epm, name: 'the leg ends with PRIMARY PRESSURE under the RHR suction interlock (' + epm + ' psia)',
      note: f(res.end.pressure_psia) + ' psia at the end' };
  var fb = [];
  (r.steps || []).forEach(function (st) { (st.forbid || []).forEach(function (id) { (st.raised || []).forEach(function (a) { if (a.indexOf(id + '@') === 0) fb.push('step ' + st.n + ' ' + a); }); }); });
  if ((r.steps || []).some(function (st) { return st.forbid; }))
    v.forbid = { ok: fb.length === 0, name: 'no step raises an alarm its card is written to prevent (read every 4 s of wall at the card\'s speed)',
      note: fb.length ? 'RAISED ' + fb.join('; ') : 'none' };
  if (/#2$/.test(r.leg) && res.kind === 'complete' && res.blocks)
    v.blocks = { ok: !(res.blocks.lo_press > 0) && !(res.blocks.si_trip > 0), name: 'the round trip re-arms the SI blocks the cooldown set (PZR PRESS LO-LO, SI REACTOR TRIP)',
      note: 'lo_press_blocked ' + res.blocks.lo_press + ', si_trip_blocked ' + res.blocks.si_trip };
  var fz = fl('flash').concat(fl('untick')).concat(fl('cmdwait'));
  v.flash = { ok: fz.length === 0, name: 'Continue never lights and goes out again (flash), no drawn row un-ticks, no step waits on a rod press the gauge does not call for',
    note: fz.map(function (x) { return x.kind + ' step ' + x.step + (x.row ? ' row ' + x.row + ' (' + x.label + ')' : '') + (x.lit_s != null ? ' lit ' + f(x.lit_s) + ' s' : '') + (x.held_s != null ? ' after ' + f(x.held_s) + ' s met' : '') + ' @ ' + f(x.t_min) + ' min'; }).join('; ') || 'none' };
  /* 2026-09-26-develop-k: pwr_startup 9 as the owner played it — 9a ticks within ONE broadcast of
   * CONTROL ROD POSITION reaching prediction minus 3 (and ticks at all once it has), and no drawn
   * substep is ever held dark behind a hidden row or re-locked by a tap. */
  var m1s = (r.steps || []).filter(function (st) { return st.m1; });
  if (m1s.length || fl('hidden_lock').length) {
    var ub = [];
    m1s.forEach(function (st) {
      if (st.reach_bank != null && !st.a_tick) ub.push('step ' + st.n + ' reached bank ' + st.reach_bank + ' (prediction ' + st.reach_pred + ') and its 1/M row never ticked');
      else if (st.a_tick && !st.a_tick.no_1m && st.a_tick.lag_bc != null && st.a_tick.lag_bc > 1) ub.push('step ' + st.n + ' 1/M row ticked ' + st.a_tick.lag_bc + ' broadcasts (' + f(st.a_tick.lag_s) + ' plant-s) after the bank reached the mark');
    });
    (r.steps || []).forEach(function (st) {
      if (st.relocks) ub.push('step ' + st.n + ' re-locked ' + st.relocks + 'x');
      if (st.hidden_lock_s) ub.push('step ' + st.n + ' a drawn substep sat behind a hidden row ' + f(st.hidden_lock_s, 0) + ' plant-s');
    });
    v.unlock = { ok: ub.length === 0, name: 'a 1/M row ticks on the broadcast the bank reaches its mark, and no drawn substep is held dark by a hidden row or re-locked by a tap',
      note: ub.join('; ') || m1s.map(function (st) { return 'step ' + st.n + (st.a_tick ? ' 1/M row +' + st.a_tick.lag_bc + ' bc' + (st.a_tick.no_1m ? ' (no prediction)' : '') : ' 1/M row not ticked') + (st.unlock ? ', unlock lag ' + JSON.stringify(st.unlock) + ' s' : ''); }).join('; ') };
  }
  var et = fl('early_tick');
  v.early = { ok: et.length === 0, name: 'no count row ticks while the tile AVERAGES under its target (count is the target, 807f)',
    note: et.map(function (x) { return 'step ' + x.step + ' at bank ' + x.bank + ', 30 s mean ' + x.mean30 + ' against ' + x.v; }).join('; ') || 'none' };
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
      (st.a_tick ? ' | 1/M row ticked ' + JSON.stringify(st.a_tick) + ' (reach bank ' + st.reach_bank + ', pred ' + st.reach_pred + ')' : '') + (st.unlock ? ' | unlock lag ' + JSON.stringify(st.unlock) + ' s' : '') + (st.relocks ? ' | RE-LOCKS ' + st.relocks : '') + (st.hidden_lock_s ? ' | hidden-locked ' + st.hidden_lock_s + ' s' : '') + (st.b_still_s != null ? ' | rate row ticked ' + st.b_still_s + ' s after the last rod motion' : '') + (st.ticks ? ' | ticks ' + JSON.stringify(st.ticks) : '') +
      (st.taps ? ' | taps ' + st.taps : '') + (st.inserted ? ' | inserted' : '') + (st.withdrawn ? ' | withdrew ' + st.withdrawn : '') + (st.inserted_n ? ' | inserted ' + st.inserted_n : '') + (st.tlo != null ? ' | Tavg ' + f(st.tlo) + '-' + f(st.thi) + ' °F, power low ' + f(st.plo) + ' %' : '') + (st.entries ? ' | entries ' + st.entries + ', peak rate ' + st.peak_cool_F_hr + ' degF/hr' : '') +
      (st.prlo != null ? ' | P low ' + f(st.prlo, 0) + ' psia, subcool low ' + f(st.sclo) + ' degF' : '') + (st.ratelo != null && st.ratelo < -20 ? ' | rate tile ' + f(st.ratelo, 0) + ' (true ' + f(st.truelo, 0) + ') degF/hr' : '') + (st.raised ? ' | RAISED ' + st.raised.join(', ') : '') + (st.fired ? ' | fired ' + st.fired.join(', ') : '') + (st.errs ? ' | REFUSED ' + st.errs.length + 'x ' + st.errs[0] : '') + X);
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
    console.log(B + '\n  — chain: the six legs on ONE plant then the heatup again, each offered by the last one\'s Next —' + X);
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
    var rr = r.leg === 'chain' ? (r.chain.filter(function (x) { return x.leg === (m.check || m.leg); })[0] || null) : r;
    var v = rr ? verdicts(rr)[m.expect] : { ok: false, note: 'the chain stopped before ' + (m.check || m.leg) };
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
