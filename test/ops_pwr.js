/*
 * ops_pwr.js — PWR external operations suite (tuning probes, run by
 * test/run_ops.js on top of test/ops_harness.js).
 *
 * Two families:
 *   ops_*   — evolutions a real plant sees, scripted the way an operator
 *             (following the manual) would drive them.
 *   abuse_* — the ways a player will actually treat the sim: yank, spam,
 *             walk away, crank time acceleration.
 *
 * Checks are deliberately generous — the suite's job is to MEASURE behavior
 * (expected-vs-observed for the tuning report), with hard failures reserved
 * for corruption (NaN), fuel damage where protection should prevent it, and
 * grossly unphysical outcomes.
 */
;(function (RD) {
  'use strict';

  var T = RD.OpsTest, test = T.test, near = T.near, fmt = T.fmt;

  function H(initial, opts) {
    opts = opts || {};
    opts.plant = 'pwr';
    opts.initial = initial;
    return new RD.OpsHarness(opts);
  }

  // Manual-plant power control: the operator trims the control bank toward a
  // power target (v1 has no automatic rod control — CONTEXT §8); with the
  // turbine in load-follow mode the electrical side tracks the reactor.
  function holdPower(hh, targetPct, band) {
    var p = hh.ts().power_pct;
    if (p < targetPct - band) hh.cmd('rod_nudge', { group_id: 'control_rods', steps: 4 });
    else if (p > targetPct + band) hh.cmd('rod_nudge', { group_id: 'control_rods', steps: -4 });
  }

  var OPS = {

    // ================================================================ REALISTIC

    // A shift of steady full-power operation: nothing drifts, nothing alarms.
    ops_steady_endurance: function () {
      return test('OPS steady endurance — 2 h at 100%', function (ck) {
        var h = H('hot_full_power');
        h.run(7200);
        var t = h.ts();
        ck('power stays 100 ±2%', fmt(h.range('power_pct').min, 1) + '..' + fmt(h.range('power_pct').max, 1),
          h.range('power_pct').min > 98 && h.range('power_pct').max < 102, '98..102');
        ck('pressure band ±0.3 MPa', fmt(h.range('pressure_mpa').min, 2) + '..' + fmt(h.range('pressure_mpa').max, 2),
          h.range('pressure_mpa').min > 15.11 && h.range('pressure_mpa').max < 15.71, '15.11..15.71');
        ck('Tavg band ±3 °C', fmt(h.range('tavg_c').min, 1) + '..' + fmt(h.range('tavg_c').max, 1),
          h.range('tavg_c').min > 301 && h.range('tavg_c').max < 307, '301..307');
        ck('pzr level band', fmt(h.range('pzr_level_pct').min, 1) + '..' + fmt(h.range('pzr_level_pct').max, 1),
          h.range('pzr_level_pct').min > 45 && h.range('pzr_level_pct').max < 65, '45..65');
        ck('no trip', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('no alarms over the shift', Object.keys(h.alarmFirst).join(',') || 'none',
          Object.keys(h.alarmFirst).length === 0, 'none');
        T.checkSanity(ck, h);
      });
    },

    // Daily load-follow: 100 → 50% over ~30 min, hold, back up — driven the way
    // this manual plant is meant to be driven: rods set reactor power, the
    // turbine (load-follow mode) tracks the reactor.
    ops_load_follow_daily: function () {
      return test('OPS load follow — 100 → 50 → 100% daily cycle (rods, turbine follows)', function (ck) {
        var h = H('hot_full_power');
        // DECLARE THE LINEUP (#209). This probe's whole subject is "rods set reactor
        // power, the turbine follows" — but the SHIPPED board hands Mode 1 out in
        // MANUAL (engine.getStartupLineup()), which the harness now applies. In
        // MANUAL the governor sits at the operator's load target and never moves, so
        // driving the reactor down with rods alone leaves the turbine as an
        // unthrottled heat sink: measured, Tavg 304 → 247 °C with SG pressure at
        // 2.86 MPa. That is not this probe's subject — it is a real defect, filed
        // separately — so ask for FOLLOW explicitly rather than inheriting it.
        h.cmd('set_load_mode', { mode: 'follow' });
        var lastAct = 0;
        h.run(1800, function (hh, t) {
          if (t - lastAct < 10) return;
          lastAct = t;
          holdPower(hh, Math.max(50, 100 - (t / 1500) * 50), 1.0);
        });
        h.run(600, function (hh, t) { if (t - lastAct >= 10) { lastAct = t; holdPower(hh, 50, 1.0); } });
        var mid = h.ts();
        ck('power near 50% at plateau', fmt(mid.power_pct, 1), near(mid.power_pct, 50, 5), '50 ±5');
        ck('turbine followed the reactor down', fmt(mid.mwe_output, 0) + ' MWe', near(mid.mwe_output, 50, 6), '50 ±6');
        // Manual ROD-ONLY power reduction (holdPower nudges rods, boron fixed) sags Tavg
        // below the sliding Tavg program's 50 % point (~298 °C): inserting rods to drop
        // power needs positive reactivity from somewhere, and with boron held the MTC
        // supplies it by letting Tavg fall. Real load-follow coordinates boron so the rods
        // stay in band and Tavg tracks the program — that all-auto path (rods_tavg + boron_trim
        // holding Tref) is verified in run_autoctl. Here we only require Tavg stays in a safe,
        // subcooled operating band through the manual cycle.
        ck('Tavg still in a safe operating band', fmt(mid.tavg_c, 1), mid.tavg_c > 288 && mid.tavg_c < 306, '288..306');
        var t0up = h.t();
        h.run(2100, function (hh, t) {
          if (t - lastAct < 10) return;
          lastAct = t;
          holdPower(hh, Math.min(100, 50 + ((t - t0up) / 1800) * 50), 1.0);
        });
        h.run(600, function (hh, t) { if (t - lastAct >= 10) { lastAct = t; holdPower(hh, 100, 1.0); } });
        var end = h.ts();
        ck('power returns to 100 ±3%', fmt(end.power_pct, 1), near(end.power_pct, 100, 3), '100 ±3');
        ck('no trip through the cycle', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('pzr level swing stayed on-span', fmt(h.range('pzr_level_pct').min, 1) + '..' + fmt(h.range('pzr_level_pct').max, 1),
          h.range('pzr_level_pct').min > 25 && h.range('pzr_level_pct').max < 80, '25..80');
        ck.info('alarms during maneuver', Object.keys(h.alarmFirst).join(',') || 'none');
        ck.info('mwe at end', fmt(end.mwe_output, 0));
        T.checkSanity(ck, h);
      });
    },

    // A grid demand step (+5% from 50%): first measure what the plant gives on
    // moderator feedback alone, then let the operator close the gap with rods.
    ops_grid_step: function () {
      return test('OPS grid step — +5% demand from 50%: MTC alone, then rods', function (ck) {
        var h = H('50_percent');
        h.run(120);
        h.cmd('set_load_target', { mwe: 55 });
        h.run(300);
        var mtcOnly = h.ts().power_pct;
        ck.info('reactor pickup on MTC alone at +5 min', fmt(mtcOnly, 1) + '% (real PWR: most of the step)');
        var lastAct = 0;
        h.run(600, function (hh, t) {
          if (t - lastAct >= 15) { lastAct = t; holdPower(hh, 55, 0.75); }
        });
        var t = h.ts();
        ck('power settles 55 ±2% with rod assist', fmt(t.power_pct, 1), near(t.power_pct, 55, 2), '55 ±2');
        ck('electrical output near demand', fmt(t.mwe_output, 0) + ' MWe', near(t.mwe_output, 55, 3), '55 ±3');
        ck('no trip', h.tripReason || 'none', h.tripTime == null, 'none');
        ck.info('peak power during step', fmt(h.range('power_pct').max, 1));
        T.checkSanity(ck, h);
      });
    },

    // Approach to criticality from hot zero power, by the book: withdraw in
    // batches, watch the startup rate, settle, continue. Then stabilize in the
    // point-of-adding-heat band.
    ops_startup_approach: function () {
      return test('OPS startup — HZP approach to criticality (by the book)', function (ck) {
        var h = H('hot_zero_power');
        var t0 = h.ts();
        ck('starts subcritical', fmt(t0.reactivity_pcm, 0) + ' pcm', t0.reactivity_pcm < -500, '< -500');
        // Phase 0: the NIS lineup — confirm the source-range counter is alive
        // (counts at the source-driven floor), verify the intermediate range is
        // on scale (P-6), then SECURE the SR before the ascent: its high-flux
        // trip (1e5 cps ≈ 0.02 % power) would otherwise end the startup.
        ck('SR counting at the subcritical floor', fmt(t0.sr_counts_cps, 0) + ' cps', t0.sr_counts_cps > 100 && t0.sr_counts_cps < 2000, '~500 cps');
        ck('IR on scale (P-6 satisfied)', t0.ir_amps.toExponential(1) + ' A', t0.ir_amps > 1e-10, '> 1e-10 A');
        h.cmd('set_sr_detector', { on: false });
        ck('SR secured for the ascent (handoff to IR)', h.ts().sr_energized, h.ts().sr_energized === false, 'false');
        // Phase 1: bulk withdrawal toward criticality at normal speed.
        h.cmd('rod_start', { group_id: 'control_rods', direction: 1, speed: 'normal' });
        var t1 = h.runUntil(function (ts) { return ts.reactivity_pcm > -300; }, 600);
        h.cmd('rod_stop', { group_id: 'control_rods' });
        ck('reached -300 pcm on bulk withdrawal', t1 >= 0 ? fmt(t1, 0) + ' s' : 'timeout', t1 >= 0, '< 600 s');
        // Phase 2: small nudges (4 fine steps ≈ one pre-2026-07-23 coarse step),
        // checking the response every few seconds (a startup is walked, not
        // batch-run), until the power responds.
        var guard = 0;
        outer:
        while (h.ts().power_pct < 0.3 && guard++ < 200 && h.tripTime == null) {
          var r = h.cmd('rod_nudge', { group_id: 'control_rods', steps: 4, speed: 'slow' });
          if (r && r.type === 'blocked') { h.run(20); continue; }
          for (var w = 0; w < 4; w++) { h.run(5); if (h.ts().power_pct >= 0.3) break outer; }
        }
        ck('reached point of adding heat (0.3%)', fmt(h.ts().power_pct, 3) + '%', h.ts().power_pct >= 0.3, '>= 0.3%');
        // Phase 3: level the rise like an operator (a few steps back in), then
        // let Doppler carry it to a stable low-power point.
        h.cmd('rod_nudge', { group_id: 'control_rods', steps: -12, speed: 'slow' });
        h.run(300);
        var t = h.ts();
        // Even leveled, the sim coasts up to ~20% before Doppler turns it — a
        // forgiveness datum (real practice stabilizes < 5%); cap at 25%.
        ck('power stabilizes at a low-power point', fmt(t.power_pct, 2) + '%', t.power_pct < 25, '< 25%');
        ck('no scram during a careful startup', h.tripReason || 'none', h.tripTime == null, 'none');
        ck.info('withdrawal blocks encountered (SUR interlock)', h.blockedCount);
        ck.info('final rod position % withdrawn', fmt(h.ctl().rod_groups[0].position_pct, 1));
        ck.info('peak SUR alarm seen', h.alarmFired('sur_high') ? 'sur_high @ ' + fmt(h.alarmFirst.sur_high, 0) + 's' : 'none');
        T.checkSanity(ck, h);
      });
    },

    // Normal shutdown: ramp the turbine off, drive the reactor subcritical with
    // rods, hold hot standby on the steam dump. No scram anywhere.
    ops_normal_shutdown: function () {
      return test('OPS normal shutdown — ramp down, borate/insert, hot standby', function (ck) {
        var h = H('hot_full_power');
        // Turbine in FOLLOW so it ramps off with the reactor — see the lineup note in
        // ops_load_follow_daily. The shipped board starts in MANUAL (#209); left there,
        // this rod-only rampdown drags Tavg to 130 °C against a 0.25 MPa secondary.
        h.cmd('set_load_mode', { mode: 'follow' });
        h.cmd('set_cvcs_auto', { active: true });   // makeup holds inventory through the shrink
        // ~4%/min rod rampdown, turbine follows; PAUSE the ramp whenever the
        // pressurizer level shrinks near the low alarm (a real operator holds).
        // Threshold 26: with DERIVED level, rod-only reduction sags Tavg and level
        // rides the program down to its floor (28) — that's normal; only a genuine
        // mass shrink BELOW the floor should pause the ramp (old 30 was calibrated
        // to the flat-55 level and stalled the ramp mid-curve).
        var lastAct = 0, ramp = 100;
        h.run(2400, function (hh, t) {
          if (t - lastAct < 8) return;
          lastAct = t;
          if (hh.ins().pzr_level > 26) ramp = Math.max(3, ramp - 0.55);
          holdPower(hh, ramp, 1.0);
        });
        ck('power followed the rampdown', fmt(h.ts().power_pct, 1) + '%', h.ts().power_pct < 25, '< 25%');
        // Drive subcritical with the control bank (no scram).
        h.cmd('rod_start', { group_id: 'control_rods', direction: -1, speed: 'fast' });
        var tSub = h.runUntil(function (ts) { return ts.reactivity_pcm < -500; }, 600);
        h.cmd('rod_stop', { group_id: 'control_rods' });
        ck('subcritical on rods alone', tSub >= 0 ? fmt(tSub, 0) + ' s' : 'timeout', tSub >= 0, '< 600 s');
        // Take the generator OFFLINE — the real procedure's step this probe used to
        // skip. It never mattered before #229 because follow-mode draw tracked flux
        // (→ ~0 subcritical ≈ offline anyway); with decay heat now a separate source,
        // a still-synced follow governor keeps drawing the ~5 % decay steam and PINS
        // Tavg wherever the descent left it (any temperature is an equilibrium — no
        // restoring force), so "hot standby on the dump" needs the dump actually
        // carrying the plant. Passes on the pre-#229 physics too (draw was ~0 either
        // way) — validated both sides.
        h.cmd('set_load_mode', { mode: 'disconnected' });
        h.run(1200);   // hot standby on the dump
        var t = h.ts();
        ck('power at decay levels', fmt(t.power_pct, 2) + '%', t.power_pct < 3, '< 3%');
        ck('no scram in a normal shutdown', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('Tavg held near no-load by steam dump', fmt(t.tavg_c, 1), t.tavg_c > 285 && t.tavg_c < 315, '285..315');
        ck('primary pressure still in band', fmt(t.pressure_mpa, 2), t.pressure_mpa > 13.0 && t.pressure_mpa < 16.5, '13.0..16.5');
        ck.info('steam dump position at standby', fmt(t.steam_dump_valve_pct, 1) + '%');
        ck.info('alarms seen', Object.keys(h.alarmFirst).join(',') || 'none');
        T.checkSanity(ck, h);
      });
    },

    // Cooldown toward RHR entry conditions: dump steam, spray down pressure,
    // manage HPI per procedure. Measures whether a normal cooldown is achievable.
    ops_cooldown_to_rhr: function () {
      return test('OPS cooldown — hot standby toward RHR entry (2.76 MPa / 400 psi)', function (ck) {
        var h = H('hot_full_power');
        h.cmd('scram');   // end-of-cycle trip start for a clean cooldown test
        h.cmd('set_cvcs_auto', { active: true });
        h.run(120);
        // Paced cooldown: modulate a PARTIAL steam-dump opening against a
        // ~50 °C/h Tavg ramp (the real admin limit), walk pressure down with
        // spray inside a guarded subcooling band. (Full dump crash-cools the
        // sim in minutes — measured separately; that's a tuning finding.)
        var t0 = h.t(), T0 = h.ts().tavg_c, rhrAt = null, accumIsolatedAt = null;
        // THREE HOURS, not two (#154 follow-up). At a properly paced rate the plant
        // reaches the RHR interlock only at about the two-hour mark, so a 2 h run
        // ended just short of the entry this probe is named for — it went in at 99
        // min before only because it was cooling at 103 °C/h (185 °F/hr).
        h.run(10800, function (hh, t) {
          var ts = hh.ts(), ins = hh.ins();
          // Real cooldown procedure: walk the PRESSURE SETPOINT down with the
          // temperature (heaters follow instead of fighting the capped spray —
          // the old fire-hose spray simply overpowered them, feel-plan P5).
          var psp = Math.max(Math.pow(Math.max(ts.tavg_c + 30, 1) / 179.47, 1 / 0.239), 2.0);
          // Below ~3.5 MPa the saturation-following setpoint has to be capped UNDER
          // the 400 psi (2.76 MPa) RHR interlock, because at the temperature RHR
          // comes in (~200 °C / 392 °F) the formula asks for 2.82 MPa — above it.
          // Left uncapped the driver fights itself: RHR aligns, the pressure
          // controller pushes back over the interlock, the engine AUTO-CLOSES the
          // suction valve (by design, run_pwr rhr_valve_and_mode) and the M4
          // permissive never re-fires because it is one-shot. Measured: the plant
          // finished at 1.95 MPa (283 psi), scrammed, below the interlock, with RHR
          // shut and nothing saying so. Filed separately — a probe must not depend
          // on it either way.
          if (ts.pressure_mpa < 3.5) psp = Math.min(psp, 2.4);
          hh.cmd('set_pressure_setpoint', { mpa: Math.min(psp, 15.41) });
          if (ts.hpi_active && ins.subcooling_margin > 25) hh.cmd('set_hpi', { active: false });
          var tavgTarget = T0 - 50 * ((t - t0) / 3600);
          hh.cmd('set_steam_dump', { pct: ins.tavg > tavgTarget ? 12 : 0 });
          if (ins.subcooling_margin > 40) hh.cmd('set_spray', { pct: 60 });   // walk pressure down with the temp
          else hh.cmd('set_spray', { pct: 0 });
          // Below the 400 psi (2.76 MPa) interlock the ESF actuation aligns RHR on
          // its own (pwr_control PWR_ACTUATIONS, gated on rps_scrammed) — the probe
          // never commands it. Once on RHR the heat exchanger IS the cooldown-rate
          // control, and this driver used to leave it wide open: measured, the
          // dump-paced phase tracked its ramp to 201 °C (394 °F) by the time RHR
          // came in at 99 min, and the last 21 minutes then fell to 90.7 °C
          // (195 °F) — 315 °C/h (567 °F/hr), about 6× the admin limit being paced
          // to. Throttle the HX the way an operator holds a rate.
          if (ts.rhr_active) hh.cmd('set_rhr_hx', { fraction: ins.tavg > tavgTarget ? 0.25 : 0.02 });
          if (rhrAt === null && ts.rhr_active) rhrAt = t - t0;
          // Isolate the accumulators at 1000 psig (6.89 MPa), per 04/05 since #273.
          // Without it the cooldown walks straight past their 600 psi (4.14 MPa)
          // cover gas with the discharge valve open and empties all four into the
          // RCS — measured on the old form: boron 2270 ppm and inventory pinned at
          // 120 %. The procedure was fixed in #273; this probe was never taught it.
          if (accumIsolatedAt === null && ts.pressure_mpa < 6.89) {
            hh.cmd('close_accumulator_valve');
            accumIsolatedAt = t - t0;
          }
        });
        var t = h.ts();
        var rate = (T0 - t.tavg_c) / ((h.t() - t0) / 3600);
        // This used to read `Tavg after 2 h < 275 °C` — one-sided, and 330 °F clear
        // of the value it actually landed on, so it could not detect the plant
        // cooling at DOUBLE the rate its own driver was pacing to (measured 103 °C/h
        // against the 50 °C/h in the check's name). A rate check has to be two-sided.
        ck('cooldown held near the 50 °C/h (90 °F/hr) admin limit', fmt(rate, 0) + ' °C/h',
          rate > 42 && rate < 58, '42..58 °C/h');
        ck('pressure walked down with the cooldown', fmt(t.pressure_mpa, 2), t.pressure_mpa < 10.0, '< 10 MPa');
        // The evolution this probe is NAMED for. It used to be an info line, and it
        // reported `false` for the whole 2 h run without anything noticing.
        var interlock = h.eng.cfg.emergency.rhr_valve_interlock_mpa;
        ck('reached RHR entry — below the 400 psi (2.76 MPa) interlock', fmt(t.pressure_mpa, 2) + ' MPa',
          t.pressure_mpa < interlock, '< ' + fmt(interlock, 2) + ' MPa');
        ck('RHR aligned itself on the ESF permissive (never commanded here)', String(t.rhr_active),
          t.rhr_active === true, 'true');
        ck('…and it STAYED aligned to the end of the cooldown', String(h.eng.s.rhr_valve_open),
          h.eng.s.rhr_valve_open === true, 'true');
        ck('RHR came in during the run, not at the last sample',
          rhrAt == null ? 'never' : fmt(rhrAt / 60, 0) + ' min',
          rhrAt != null && rhrAt < (h.t() - t0) - 600, '> 10 min before the end');
        // #273: without isolating at 1000 psig the cooldown walks past the
        // accumulators' 600 psi (4.14 MPa) cover gas and empties all four. Measured
        // on the un-isolated form: boron 2270 ppm and inventory pinned at 120 %.
        ck('accumulators isolated on the way down (#273)',
          accumIsolatedAt == null ? 'never' : fmt(accumIsolatedAt / 60, 0) + ' min',
          accumIsolatedAt != null, 'isolated');
        ck('…so they did NOT dump into the RCS', fmt(t.boron_ppm, 0) + ' ppm, inventory ' + fmt(t.core_inventory_pct, 1) + ' %',
          t.boron_ppm < 1000 && t.core_inventory_pct < 110, '< 1000 ppm and < 110 % (un-isolated: 2270 ppm / 120 %)');
        // Tolerance −1 °C, not a hard 0: the probe's coarse bang-bang spray driver reacts to
        // the (indicated) subcooling margin, so the exact trajectory shifts a few tenths with
        // any instrument-noise/tuning change and can momentarily touch saturation. The intent
        // is "no gross loss of subcooling / no flashing" — a real loss reads many °C negative
        // (cf. the accident probes at ~−16), not a fraction of a degree.
        ck('subcooling held (no gross flash) during a guarded cooldown', fmt(h.range('subcooling_c').min, 1),
          h.range('subcooling_c').min > -1.0, '> -1 °C');
        ck('no fuel damage', t.melted, !t.melted, 'false');
        ck.info('RHR aligned by end', t.rhr_active);
        ck.info('final pressure MPa', fmt(t.pressure_mpa, 2));
        ck.info('final Tavg °C', fmt(t.tavg_c, 1));
        ck.info('effective cooldown rate °C/h', fmt((T0 - t.tavg_c) / ((h.t() - t0) / 3600), 0));
        T.checkSanity(ck, h);
      });
    },

    // Loss of main feedwater, hands off: the plant should save itself (AFW
    // auto-start, low SG level trip). Measures the forgiveness window.
    ops_loss_of_feedwater_handsoff: function () {
      return test('OPS loss of main feedwater — hands off, plant saves itself', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'loss_of_feedwater' });
        h.run(1800);
        var t = h.ts();
        ck('reactor tripped on low SG level', h.tripReason || 'none',
          h.tripTime != null && /sg_level/.test(h.tripReason || ''), 'sg_level low');
        ck('AFW started automatically', t.afw_active, t.afw_active === true, 'true');
        ck('no fuel damage', t.melted, !t.melted, 'false');
        ck('SG level recovering under AFW', fmt(t.sg_level_pct, 1), t.sg_level_pct > 10, '> 10%');
        ck('subcooling maintained after trip', fmt(h.ts().subcooling_c, 1), h.ts().subcooling_c > 0, '> 0');
        var warn = h.alarmFirst.sg_level_low, trip = h.tripTime;
        ck.info('warning-to-trip window (s)', warn != null && trip != null ? fmt(trip - warn, 0) : 'n/a');
        ck.info('alarms sequence', Object.keys(h.alarmFirst).map(function (k) { return k + '@' + fmt(h.alarmFirst[k], 0); }).join(' '));
        T.checkSanity(ck, h);
      });
    },

    // Steam generator tube rupture, managed per the EOP outline: recognize,
    // trip, let HPI carry inventory, stabilize.
    // Re-authored for the SINGLE-SG plant (catalog v3 TR-13, owner ruling): with
    // one steam generator there is no "isolate the faulted SG and steam the
    // others" — the EOP is DEPRESSURIZE THE PRIMARY TO SG PRESSURE so the
    // ΔP-driven tube leak stops, then cool down toward RHR. Radiological note
    // for the manual (P6): the SG being steamed IS the contaminated one.
    ops_sgtr_managed: function () {
      return test('OPS SGTR — single-SG EOP: depressurize to kill the leak', function (ck) {
        var h = H('hot_full_power');
        h.cmd('set_cvcs_auto', { active: true });
        h.run(60);
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: 0.5 });
        h.run(2);
        var leak0 = h.ts().leak_flow;
        // A half-severity rupture still exceeds charging — the plant trips and
        // SI comes in on its own (TR-13); the operator's job starts after.
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 600);
        ck('rupture overwhelms CVCS — auto trip', dt >= 0 ? fmt(dt, 0) + ' s — ' + (h.tripReason || '?') : 'no trip',
          dt >= 0, 'trips');
        h.cmd('set_letdown_orifices', { a: false, b: false });
        // EOP: subcooling-guarded depressurization — walk the pressure setpoint
        // down toward SG pressure (spray does the work below the setpoint),
        // throttle HPI per the REAL SI-termination criteria: subcooling
        // comfortable AND pressurizer level recovered. (The old script gated on
        // subcooling alone — that was survivable only while AUTO charging acted
        // as an unphysical second HPI on the accident inventory scale; post-P7-
        // retune, level/inventory is HPI's job and terminating SI while the pzr
        // is empty drains the plant, exactly as it would for a real crew.)
        // (The initial blowdown of a full-bore rupture BRIEFLY touches saturation
        // before SI catches it — physics; the hold-subcooling requirement is on
        // the MANAGED phase below. "Held" is measured from the moment SI first
        // RESTORES the margin (>15) — the blowdown tail overlaps the start of
        // this window by a few seconds.)
        var minSubEop = 1e9, eopArmed = false;
        // 3600 s, was 2400 (#408): the margin-guarded walk-down paces ~4.3 MPa per
        // 40 min on the real-flow plant and needs the extra leg to close on SG
        // pressure — the real Ginna analysis runs 62-95 min to termination.
        h.run(3600, function (hh) {
          if (!eopArmed && hh.ts().subcooling_c > 15) eopArmed = true;
          if (eopArmed) minSubEop = Math.min(minSubEop, hh.ts().subcooling_c);
          var ins = hh.ins();
          var m = ins.subcooling_margin, lvl = ins.pzr_level;
          var sgP = hh.ts().steam_pressure_mpa;
          // Depressurize only while the margin is comfortable; when it thins,
          // FREEZE the setpoint at current pressure (the restore term otherwise
          // keeps pulling pressure down after spray stops) and let the cooldown
          // reopen the margin before continuing the walk-down.
          // Staged guard: full spray only with a fat margin (one sample of
          // capped-spray depressurization eats ~15-18 °C of margin), taper in
          // the middle band, freeze below it.
          var target = m > 28 ? Math.max(sgP, 2.0) : hh.ts().pressure_mpa + 0.3;
          hh.cmd('set_pressure_setpoint', { mpa: Math.max(2.0, Math.min(target, 15.41)) });
          hh.cmd('set_spray', { pct: m > 40 ? 100 : (m > 28 ? 25 : 0) });
          // #408: COOL DOWN to reopen the margin — the real EOP's own order (Ginna
          // 15.6.3.3.3.1: cooldown, THEN depressonize). On the real-flow plant the
          // margin-frozen walk parks at ~11 MPa forever without it; a modest dump
          // pulls Tavg down, the margin reopens, and the walk closes on SG pressure.
          hh.cmd('set_steam_dump', { pct: m < 30 ? 10 : 0 });
          // SI termination: margin comfortable AND level back on span (recovering).
          // SI (re)initiation: margin thin OR level lost off the bottom of the span.
          if (m > 30 && lvl > 33 && hh.ts().hpi_active) hh.cmd('set_hpi', { active: false });
          else if ((m < 15 || lvl < 20) && !hh.ts().hpi_active) hh.cmd('set_hpi', { active: true });
        });
        var t = h.ts();
        ck('no fuel damage under the EOP', t.melted, !t.melted, 'false');
        // In the deep-depressurization regime the model's sat-pull slaves P to
        // ~Psat(Tavg): a cooldown riding the saturation line down reads true
        // subcooling ≈ 0⁻ (a −2..−3 °C flashing band) by construction. The real
        // requirement is no SUSTAINED margin loss and no actual bulk voiding.
        ck('managed phase rides ≥ the sat-line band (min ≥ −3)', fmt(minSubEop, 1), minSubEop >= -3, '≥ −3');
        // Split since #408: the INITIAL blowdown at the real scale drains further
        // before SI catches it (measured peak 0.176 — transient, physics), so the
        // transient band widens and the managed-phase claim moves to the END state.
        ck('transient voiding bounded during the initial blowdown', fmt(h.range('primary_void_fraction').max, 3),
          h.range('primary_void_fraction').max < 0.25, '< 0.25 transient');
        ck('…and the MANAGED plant ends with no bulk void', fmt(t.primary_void_fraction || 0, 3),
          (t.primary_void_fraction || 0) < 0.02, '< 0.02 at end');
        ck('primary walked down toward SG pressure', fmt(t.pressure_mpa, 2) + ' vs SG ' + fmt(t.steam_pressure_mpa, 2),
          t.pressure_mpa < t.steam_pressure_mpa + 2.5, '≤ SG + 2.5');
        ck('ΔP collapse killed most of the leak', fmt(t.leak_flow, 4) + ' vs initial ' + fmt(leak0, 3),
          t.leak_flow < leak0 * 0.35, '< 35 % of initial');
        // ~55 % with a 1 % band: the EOP depressurization reacts to the indicated pressure/
        // level, so the inventory floor shifts a few tenths with an instrument-noise/tuning
        // change. Holding the core in the mid-50s (far above the ~40 % uncovery concern) is
        // the point, not the exact 55.0.
        ck('inventory stabilized (min ≥ 54 %)', fmt(h.range('core_inventory_pct').min, 1),
          h.range('core_inventory_pct').min > 54, '> 54%');
        ck.info('final leak / pressure / inventory', fmt(t.leak_flow, 4) + ' / ' + fmt(t.pressure_mpa, 2) + ' / ' + fmt(t.core_inventory_pct, 1));
        T.checkSanity(ck, h);
      });
    },

    // Turbine trip from 100% WITHOUT operator action: does the steam dump ride
    // it out, does the RPS catch it, where does the plant settle?
    // P-14 high-high SG level: an overfeed at power must be CLOSED by the
    // automatics — SG LVL HI HI annunciates (88%), then at 90% the coordinated
    // protection fires: turbine trip + main-feedwater isolation + reactor trip
    // through the P-9 interlock (>50% power). Hands off throughout. HARD checks:
    // this is the acceptance test for the 1cc66ec protection package.
    ops_sg_overfeed_p14: function () {
      return test('OPS SG overfeed — P-14 trips turbine, isolates feed, scrams (hands off)', function (ck) {
        var h = H('hot_full_power');
        h.run(10);
        h.cmd('inject_failure', { failure_id: 'sg_overfeed', severity: 1.0 });
        var tIso = h.runUntil(function (ts, ins, hh) { return hh.eng.s.feedwater_isolated === true; }, 3600);
        ck('P-14 isolates main feedwater', tIso >= 0 ? fmt(tIso, 0) + ' s' : 'never', tIso >= 0, 'fires');
        h.run(30);
        ck('turbine tripped by P-14', h.eng.s.turbine_tripped, h.eng.s.turbine_tripped === true, 'true');
        ck('reactor tripped through P-9 (sg_level high)', h.tripReason || 'none',
          h.tripTime != null && /sg_level high/.test(h.tripReason || ''), 'sg_level high');
        ck('SG LVL HI HI annunciated first', h.alarmFirst.sg_level_hihi != null ? fmt(h.alarmFirst.sg_level_hihi, 0) + ' s' : 'never',
          h.alarmFirst.sg_level_hihi != null && (tIso < 0 || h.alarmFirst.sg_level_hihi <= 10 + tIso + 1),
          'before the isolation');
        ck('AFW path unaffected by the isolation (latch is main-feed only)',
          String(h.eng.s.afw_blocked), h.eng.s.afw_blocked === false, 'false');
        T.checkSanity(ck, h);
      });
    },

    // CVCS pressurizer drain-rate probe (owner request 2026-07-22): "how fast does
    // CVCS drain the pressurizer should be a test performed for tuning." Lines up one
    // letdown orifice (~20 gpm) with make-up secured (charging 0, no CVCS auto) and times
    // how fast the pressurizer walks down. Pressure is held by the heaters during the
    // drain, so there is no HPI confound — it is a clean letdown-out measurement.
    //
    // This is the acceptance test for the P7 retune (cvcs_inventory_gain): CVCS
    // charging/letdown no longer enter the mass balance 1:1 on the accident scale —
    // a ~20 gpm orifice now walks pzr level down ~2 %/min (0.030 · gain ·
    // level_per_mass), so an uncompensated drain takes minutes to matter and the
    // operator can respond. It also confirms the low-level letdown-isolation
    // interlock still bounds the (slower) drain before the primary empties.
    //
    // ---- RED SINCE 2026-08-04 (#330), AND DELIBERATELY LEFT RED — RULED, NOT DRIFTING.
    // *(OWNER RULING, 2026-08-04: "A")* — selected option A below (ship the corrected
    // geometry, accept the faster drain) from the two costed options put to him. So this
    // red is an ACCEPTED, RULED state: do not "fix" it by re-banding the threshold, and do
    // not quietly scale `cvcs_inventory_gain` to chase it. If the drain later proves too
    // fast in play, the cheap lever is the letdown ORIFICE size (0.030 ≡ 20 gpm), which
    // sets the drain independently of charging authority — UNMEASURED, and it moves the
    // gpm gauge calibration and the AUTO charging balance, so measure before touching it.
    // MEASURED: 53.7 s for the 15-point drop, against this probe's ">= 300 s". Nothing
    // here changed; `level_per_mass` did, 100 → 776, and the rate above is a DIRECT
    // product of it (0.030 · gain · level_per_mass), so this threshold was a hard-coded
    // consequence of the constant #330 found to be wrong. It is NOT re-banded, because
    // re-banding it would silently retire an owner-requested feel target — this probe
    // exists because of a 2026-07-22 owner request, and a tuning target that moves
    // whenever the plant moves is not a target.
    //
    // THE TRADE-OFF, measured both ways so the decision is a choice and not a guess:
    //   - keep `cvcs_inventory_gain` at 0.012 (shipped): drain 7.76× faster than the
    //     owner's target; run_e2e_controls 59/59.
    //   - scale it to 0.00154639 to restore the rate EXACTLY: loop tau (83 s) and the
    //     droop equilibrium are both preserved, and the sim's implied RCS volume goes
    //     1,389 → 10,779 gal (real: ~68,000) — but CVCS make-up authority shrinks 7.76×,
    //     and run_e2e_controls falls to 52/59 as leaks CVCS used to hold stop being held.
    // For scale: on a real plant this 15-point drop on one 20 gpm orifice takes ~79
    // minutes (1,400 ft³ pressurizer). BOTH sim values are far from prototypical — the
    // compressed RCS scale is why — so this is a choice between two game-feel numbers,
    // not between right and wrong. Recommendation on the issue: accept the faster drain.
    ops_cvcs_pzr_drain_rate: function () {
      return test('OPS CVCS pzr drain rate — letdown, no make-up (TUNING TARGET)', function (ck) {
        var h = H('hot_full_power');
        h.cmd('set_charging_flow', { normalized: 0 });        // MANUAL, charging secured
        h.cmd('set_letdown_orifices', { a: true, b: false });  // one orifice (~20 gpm)
        h.run(1);
        var lvl0 = h.ts().pzr_level_pct, p0 = h.ts().pressure_mpa;
        // Time to walk level down a fixed 15-point band, kept ABOVE the ~17 % letdown-
        // isolation setpoint so this measures the raw drain rate, not the interlock.
        var target = lvl0 - 15;
        var tDrop = h.runUntil(function (ts) { return ts.pzr_level_pct <= target; }, 1800);
        var ratePerMin = tDrop > 0 ? 15 / (tDrop / 60) : 0;
        ck.info('start pzr level', fmt(lvl0, 1) + ' %');
        ck.info('pressure across the drain (no HPI actuation)', fmt(p0, 2) + ' → ' + fmt(h.ts().pressure_mpa, 2) + ' MPa');
        ck.info('drain rate', fmt(ratePerMin, 1) + ' %/min (' + fmt(ratePerMin / 60, 3) + ' %/s)');
        // THE ACCEPTANCE: a 15 % pzr drop on an uncompensated ~20 gpm letdown should
        // take minutes. tDrop < 0 (never dropped 15 % in 30 min) also passes.
        ck('15% pzr drop is realistically slow', tDrop < 0 ? '> 1800 s' : fmt(tDrop, 1) + ' s',
          tDrop < 0 || tDrop >= 300, '>= 300 s (real: minutes)');
        // Protection still bounds it: keep draining until the low-level letdown-isolation
        // interlock (17 %) closes the orifices — at ~2 %/min that is ~10 more minutes —
        // and confirm the primary is NOT emptied (interlock added with the bumpless-
        // transfer fix; the retune only slowed the approach to it).
        h.runUntil(function (ts, ins, hh) {
          var c = hh.ctl(); return !c.letdown_orifice_a && !c.letdown_orifice_b;
        }, 3600);
        var cs = h.ctl(), massEnd = h.ts().core_inventory_pct / 100;
        ck('letdown isolated on low level (interlock held)',
          (cs.letdown_orifice_a || cs.letdown_orifice_b) ? 'still open' : 'isolated',
          !cs.letdown_orifice_a && !cs.letdown_orifice_b, 'isolated');
        ck('primary not drained to empty', fmt(massEnd, 3), massEnd > 0.35, '> 0.35');
        T.checkSanity(ck, h);
      });
    },

    ops_turbine_trip_ride: function () {
      return test('OPS turbine trip at 100% — ride-through behavior', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'turbine_trip' });
        h.run(900);
        var t = h.ts();
        ck('no fuel damage', t.melted, !t.melted, 'false');
        ck('primary pressure never reached the code safeties', fmt(h.range('pressure_mpa').max, 2),
          h.range('pressure_mpa').max < 17.13, '< 17.13');
        ck('steam dump opened', fmt(h.range('steam_dump_valve_pct').max, 1) + '%',
          h.range('steam_dump_valve_pct').max > 5, '> 5%');
        ck.info('did the RPS trip, and why', h.tripReason || 'no trip');
        ck.info('power settle point at +15 min', fmt(t.power_pct, 1) + '%');
        ck.info('peak Tavg', fmt(h.range('tavg_c').max, 1));
        ck.info('peak primary pressure', fmt(h.range('pressure_mpa').max, 2));
        T.checkSanity(ck, h);
      });
    },

    // All reactor coolant pumps trip: the low-flow trip must catch it fast.
    ops_rcp_trip: function () {
      return test('OPS RCP trip at 100% — low-flow protection', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'rcp_trip' });
        h.run(600);
        var t = h.ts();
        ck('reactor tripped', h.tripReason || 'none', h.tripTime != null, 'tripped');
        ck('trip was prompt (< 30 s after pump loss)', h.tripTime != null ? fmt(h.tripTime - 30, 1) + ' s' : 'n/a',
          h.tripTime != null && (h.tripTime - 30) < 30, '< 30 s');
        ck('no fuel damage (DNB avoided)', t.melted, !t.melted, 'false');
        ck.info('peak fuel temperature', fmt(h.range('fuel_temp_c').max, 0) + ' °C');
        ck.info('trip reason', h.tripReason);
        T.checkSanity(ck, h);
      });
    },

    // Down-power to 50% and hold through the xenon transient with rods + CVCS —
    // the classic reactivity-management shift.
    ops_xenon_hold: function () {
      return test('OPS xenon transient — hold 50% for 8 h after down-power', function (ck) {
        var h = H('hot_full_power');
        // Down-power with rods (turbine stays in follow mode, tracking the
        // reactor), then hold through the xenon transient with rods + CVCS.
        var lastRamp = 0;
        h.run(1200, function (hh, t) {
          if (t - lastRamp >= 8) { lastRamp = t; holdPower(hh, Math.max(50, 100 - (t / 1000) * 50), 1.0); }
        });
        var offBand = 0, samples = 0, dilutedFor = 0, lastAct = 0;
        h.run(8 * 3600, function (hh, t) {
          samples++;
          var p = hh.ts().power_pct;
          if (Math.abs(p - 50) > 3) offBand++;
          if (t - lastAct < 60) return;   // operator acts at most once a minute
          lastAct = t;
          var cs = hh.ctl();
          if (p < 48.5) {
            var atTop = cs.rod_groups[0].position_pct > 99;
            if (atTop) { hh.cmd('set_boron_adjust', { rate: -0.05 }); dilutedFor += 60; }
            else hh.cmd('rod_nudge', { group_id: 'control_rods', steps: 4 });
          } else if (p > 51.5) {
            hh.cmd('set_boron_adjust', { rate: 0 });
            hh.cmd('rod_nudge', { group_id: 'control_rods', steps: -4 });
          } else {
            hh.cmd('set_boron_adjust', { rate: 0 });
          }
        });
        var t = h.ts();
        ck('no trip across the xenon transient', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('power held 50 ±3% for ≥ 90% of the hold', fmt(100 * (1 - offBand / samples), 1) + '%',
          offBand / samples < 0.10, '>= 90%');
        ck.info('xenon peak (% of eq)', fmt(h.range('xenon_pct_eq').max, 1));
        ck.info('minutes of dilution used', fmt(dilutedFor / 60, 0));
        ck.info('final boron ppm', fmt(t.boron_ppm, 0));
        ck.info('final rod position % withdrawn', fmt(h.ctl().rod_groups[0].position_pct, 1));
        T.checkSanity(ck, h);
      });
    },

    // ================================================================== ABUSE

    // Player yanks the control bank fully out at 100% power.
    abuse_rods_full_out_at_power: function () {
      return test('ABUSE rods full out at 100% — what stops the player?', function (ck) {
        var h = H('hot_full_power');
        h.run(10);
        h.run(300, function (hh) {
          hh.cmd('rod_start', { group_id: 'control_rods', direction: 1, speed: 'fast' });
        });
        var t = h.ts();
        ck('no fuel damage', t.melted, !t.melted, 'false');
        ck('power bounded by physics/protection', fmt(h.range('power_pct').max, 1) + '%',
          h.range('power_pct').max < 135, '< 135%');
        ck.info('did it even trip', h.tripReason || 'no trip');
        ck.info('peak power', fmt(h.range('power_pct').max, 1) + '%');
        ck.info('rod position reached', fmt(h.ctl().rod_groups[0].position_pct, 1) + '% withdrawn');
        T.checkSanity(ck, h);
      });
    },

    // Player mashes withdraw from hot zero power, ignoring every block.
    abuse_startup_yank: function () {
      return test('ABUSE startup yank — continuous fast withdrawal from HZP', function (ck) {
        var h = H('hot_zero_power');
        h.run(1200, function (hh) {
          hh.cmd('rod_start', { group_id: 'control_rods', direction: 1, speed: 'fast' });
        });
        var t = h.ts();
        ck('no fuel damage', t.melted, !t.melted, 'false');
        ck('SUR interlock engaged at least once', h.blockedCount, h.blockedCount > 0, '> 0');
        ck('excursion capped by protection', fmt(h.range('power_pct').max, 1) + '%',
          h.range('power_pct').max < 200, '< 200%');
        ck.info('trip reason', h.tripReason || 'no trip');
        ck.info('peak power', fmt(h.range('power_pct').max, 2) + '%');
        ck.info('peak fuel temp', fmt(h.range('fuel_temp_c').max, 0) + ' °C');
        ck.info('withdrawal blocks', h.blockedCount);
        T.checkSanity(ck, h);
      });
    },

    // Player opens the PORV at full power and walks away for 45 minutes.
    abuse_porv_walkaway: function () {
      return test('ABUSE PORV open + walk away 45 min — TMI with honest instruments', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('open_porv');
        h.run(2700);
        var t = h.ts();
        // RE-AUTHORED TWICE IN TWO DAYS, and the second time is the RULING, not drift
        // *(OWNER RULING, 2026-08-07 — the proportional valve; see porv_flow_max)*.
        // Under the wave-1 FLEET-standard valve this leg asserted the inversion — full
        // HPI losing 6x to a 2,900 MWt plant's valve bolted onto a 300 MWt RCS. The
        // plant-sized valve restores the 1979 counterfactual as a SIZE FACT: full
        // injection + charging (~150 gpm) beats one wide-open plant-sized PORV
        // (~112 gpm), so a walked-away open valve on a plant with honest instruments
        // and automatic injection is SURVIVABLE — which is exactly why the TMI-2 crew
        // SECURING injection is what caused the accident. Measured: min inventory
        // 74.7 %, no damage, automation carries the whole event.
        ck('no melt — automatic injection carries the walked-away valve', t.melted, !t.melted, 'false');
        ck('reactor tripped itself', h.tripReason || 'none', h.tripTime != null, 'tripped');
        ck('HPI auto-started', t.hpi_active, t.hpi_active === true, 'true');
        ck('the size fact: full injection BEATS one wide-open plant-sized valve (the 1979 counterfactual)',
          fmt(h.range('core_inventory_pct').min, 1) + '% min inventory',
          h.range('core_inventory_pct').min > 60, '> 60% held (measured 74.7 on the proportional valve)');
        ck.info('min subcooling', fmt(h.range('subcooling_c').min, 1) + ' °C');
        ck.info('pressure floor', fmt(h.range('pressure_mpa').min, 2) + ' MPa');
        // THE TWO GAUGES MUST TELL THE SAME STORY (#136). This end state used to read
        // inventory 120 % (pinned at mass_max) with pressurizer level 7 % — an overfilled
        // RCS whose level gauge said nearly empty. Both cannot be right, and nothing caught
        // it because the line below was an `info`, not an assertion: the numbers were
        // printed on every run and asserted on none.
        //
        // Resolved by #249, not here — `level_per_mass_surplus` was an underived 300, so
        // `mass_max` clipped inventory before the gauge ran out of scale and indicated level
        // simply could not express a surplus. Fitting it to real pressurizer geometry (776)
        // is what made the overfill readable, and it is the same defect that was hiding a
        // full accumulator dump behind an "arrived UNscrammed" check.
        //
        // Measured now: inventory 120.0 %, level 100.0 % — solid, which is what a 45-minute
        // hands-off feed-and-bleed with HPI running against an open PORV should look like.
        // Threshold 95, not 90: the defect's signature is level PINNED at exactly 88.00 %
        // (level_prog_floor 28 + 300 × the clipped 0.20), so a 90 % bar would clear it by
        // two points. Healthy reads 100.0. 95 sits with margin on both sides — verified by
        // injection, restoring level_per_mass_surplus to its pre-#249 300 reddens this.
        // #136's one-story check survives with the inverted state: a drained RCS must
        // not read full. (The overfilled direction is CA-12/B1's territory now.)
        ck('drained RCS reads drained on BOTH gauges, not just one (#136, inverted by #408)',
          fmt(t.core_inventory_pct, 1) + '% inv / ' + fmt(t.pzr_level_pct, 1) + '% level',
          !(t.core_inventory_pct < 20 && t.pzr_level_pct > 50), 'inv lost ⇒ level not normal');
        ck.info('state at +45 min: P / pzr level / inv', fmt(t.pressure_mpa, 2) + ' / ' + fmt(t.pzr_level_pct, 0) + '% / ' + fmt(t.core_inventory_pct, 0) + '%');
        T.checkSanity(ck, h);
      });
    },

    // Heaters full on + spray full open, fighting each other.
    abuse_heater_spray_fight: function () {
      return test('ABUSE heaters 100% vs spray 100% — pressure control fight', function (ck) {
        var h = H('hot_full_power');
        h.cmd('set_heater', { power_pct: 100 });
        h.cmd('set_spray', { pct: 100 });
        h.run(600);
        // Spray water is Tcold-temperature: physically it cannot pull pressure
        // below ~Psat(Tcold) ≈ 7 MPa. The floor is the realism check here.
        ck('pressure floor stays above Psat(Tcold) ≈ 7 MPa', fmt(h.range('pressure_mpa').min, 2) + '..' + fmt(h.range('pressure_mpa').max, 2),
          h.range('pressure_mpa').min > 6.5 && h.range('pressure_mpa').max < 18, '6.5..18');
        ck('no fuel damage', h.ts().melted, !h.ts().melted, 'false');
        ck.info('outcome (trip?)', h.tripReason || 'no trip');
        ck.info('settle pressure', fmt(h.ts().pressure_mpa, 2));
        T.checkSanity(ck, h);
      });
    },

    // Player dilutes boron flat-out at 100% power.
    abuse_dilute_to_zero: function () {
      return test('ABUSE max dilution at 100% — reactivity insertion via CVCS', function (ck) {
        var h = H('hot_full_power');
        h.cmd('set_boron_adjust', { rate: -2.0 });
        h.run(1200);
        var t = h.ts();
        ck('protection caught the excursion', h.tripReason || 'none', h.tripTime != null, 'tripped');
        ck('no fuel damage', t.melted, !t.melted, 'false');
        ck('post-trip: stays shut down despite continued dilution', fmt(t.power_pct, 2) + '%',
          t.power_pct < 5, '< 5%');
        ck.info('peak power', fmt(h.range('power_pct').max, 1) + '%');
        ck.info('boron at end', fmt(t.boron_ppm, 0) + ' ppm');
        ck.info('trip reason', h.tripReason);
        T.checkSanity(ck, h);
      });
    },

    // Contradictory command spam — every control, every half second.
    abuse_command_spam: function () {
      return test('ABUSE command spam — contradictory inputs for 2 min', function (ck) {
        var h = H('hot_full_power');
        var flip = false;
        h.run(120, function (hh) {
          flip = !flip;
          hh.cmd(flip ? 'open_porv' : 'close_porv');
          hh.cmd('set_heater', { power_pct: flip ? 100 : 0 });
          hh.cmd('set_spray', { pct: flip ? 100 : 0 });
          hh.cmd('set_steam_dump', { mode: flip ? 'open' : 'closed' });
          hh.cmd('set_charging_flow', { normalized: flip ? 0.06 : 0 });
          hh.cmd('set_letdown_orifices', { a: !flip, b: !flip });
          hh.cmd('rod_nudge', { group_id: 'control_rods', steps: flip ? 3 : -3 });
          hh.cmd('set_afw', { active: flip });
          hh.cmd('set_hpi', { active: !flip });
          hh.cmd('set_feedwater_flow', { pct: flip ? 120 : 0 });
        });
        h.run(300);   // let it settle, hands off
        ck.info('pressure envelope under spam (spray-floor issue shows here too)',
          fmt(h.range('pressure_mpa').min, 2) + '..' + fmt(h.range('pressure_mpa').max, 2));
        ck('power remained physical', fmt(h.range('power_pct').max, 1) + '%', h.range('power_pct').max < 150, '< 150%');
        ck('no fuel damage', h.ts().melted, !h.ts().melted, 'false');
        ck.info('end state (trip?)', h.tripReason || 'no trip');
        T.checkSanity(ck, h);
      });
    },

    // The same reactivity transient at 1× and 256× time acceleration: protection
    // evaluates once per broadcast, so at high acceleration it reacts LATE in
    // sim time. Measures how much worse the outcome gets.
    abuse_accel_latency: function () {
      return test('ABUSE time-acceleration — rod runaway at 1× vs 256×', function (ck) {
        function runaway(accel) {
          var h = H('50_percent', { accel: accel });
          h.run(10);
          h.cmd('inject_failure', { failure_id: 'continuous_rod_withdrawal', severity: 1.0 });
          h.run(300);
          return h;
        }
        var h1 = runaway(1), h256 = runaway(256);
        // HARD: the high-flux trip must actually fire (C1 acceptance — the
        // power_range meter needs headroom above the 120% setpoint; pegged at
        // exactly 120 a strict crossed() never fires and the excursion rides free).
        ck('1×: protection tripped', h1.tripReason || 'no trip', h1.tripTime != null, 'tripped');
        ck('256×: protection tripped (late is C2, never is C1)', h256.tripReason || 'no trip', h256.tripTime != null, 'tripped');
        ck('1×: protection catches it, no damage', h1.ts().melted, !h1.ts().melted, 'false');
        ck('256×: no damage even with late protection', h256.ts().melted, !h256.ts().melted, 'false');
        ck.info('1× peak power', fmt(h1.range('power_pct').max, 1) + '%');
        ck.info('256× peak power', fmt(h256.range('power_pct').max, 1) + '%');
        ck.info('1× trip at (s after inject)', h1.tripTime != null ? fmt(h1.tripTime - 10, 1) : 'no trip');
        ck.info('256× trip at (s after inject)', h256.tripTime != null ? fmt(h256.tripTime - 10, 1) : 'no trip');
        ck.info('1× peak fuel temp', fmt(h1.range('fuel_temp_c').max, 0));
        ck.info('256× peak fuel temp', fmt(h256.range('fuel_temp_c').max, 0));
        T.checkSanity(ck, h1);
        T.checkSanity(ck, h256);
      });
    },

    // Scram, then try to "un-scram" by withdrawing — the latch holds until a
    // deliberate RPS reset (PI-7/C3, feel-plan P4): withdrawal stays blocked
    // while latched; reset_rps (refused while a trip signal stands, rods must
    // be fully inserted) re-closes the breakers; only then do rods move.
    abuse_scram_then_recover: function () {
      return test('ABUSE scram then withdraw — latch holds until a deliberate RPS reset', function (ck) {
        var h = H('hot_full_power');
        h.run(10);
        h.cmd('scram');
        h.run(30);
        h.run(120, function (hh) {
          hh.cmd('rod_start', { group_id: 'control_rods', direction: 1, speed: 'fast' });
          hh.cmd('rod_start', { group_id: 'shutdown_rods', direction: 1, speed: 'fast' });
        });
        var cs = h.ctl();
        ck('rods stay inserted despite withdraw attempts', fmt(cs.rod_groups[0].position_pct, 1) + '%',
          cs.rod_groups[0].position_pct < 5, '< 5% withdrawn');
        ck('power stays shut down', fmt(h.ts().power_pct, 2) + '%', h.ts().power_pct < 5, '< 5%');
        ck.info('engine scram latched', h.ts().scrammed);
        // Recovery leg (PI-7-reset): reset the RPS, then withdrawal is honored.
        h.cmd('reset_rps');
        h.run(5);
        ck('RPS reset clears the latch (no standing trip signal)', String(h.rps().scrammed),
          h.rps().scrammed === false, 'false');
        h.run(60, function (hh) {
          hh.cmd('rod_start', { group_id: 'control_rods', direction: 1, speed: 'fast' });
        });
        var cs2 = h.ctl();
        ck('after reset, rod withdrawal is honored', fmt(cs2.rod_groups[0].position_pct, 1) + '%',
          cs2.rod_groups[0].position_pct > 2, '> 2% withdrawn');
        T.checkSanity(ck, h);
      });
    },

    // An UNATTENDED BORON DILUTION in the shutdown regime (#154 item 9). This is
    // the evolution that actually bit the owner in free play and became #260: in
    // Mode 5 the plant is held subcritical by boron, dilution adds reactivity with
    // no rod motion and no power to watch, and the only thing between the operator
    // and an inadvertent criticality is the source-range instrumentation. Every
    // other reactivity probe in this file runs AT POWER, where the subcritical
    // multiplication measured here does not exist.
    ops_shutdown_dilution: function () {
      return test('OPS shutdown dilution — subcritical multiplication and the source-range catch', function (ck) {
        var h = H('cold_shutdown');
        h.run(60);
        var b0 = h.ts().boron_ppm, p0 = h.ts().power_pct;
        ck('starts subcritical and quiet', fmt(b0, 0) + ' ppm, ' + p0.toExponential(2) + ' % power',
          p0 < 0.01, '< 0.01 % power');
        // Dilute at the tuned makeup rate (0.05 ppm/s) and walk away — the free-play
        // mistake. Nothing is touched again; protection is the only actor.
        h.cmd('set_boron_adjust', { rate: -0.05 });
        h.run(3600);
        var t = h.ts();
        var removed = b0 - t.boron_ppm;
        // The plant must NOT quietly go critical: the source-range high-flux trip is
        // the design defence, and it is what fired in the real event.
        ck('protection acted before criticality', h.tripReason || 'none', h.tripTime != null, 'a trip');
        ck('…and it was the SOURCE RANGE that caught it', h.tripReason || 'none',
          /source[_ ]range/i.test(h.tripReason || ''), 'source_range high');
        ck('power rose measurably first — subcritical multiplication is modelled',
          p0.toExponential(2) + ' → ' + h.range('power_pct').max.toExponential(2) + ' %',
          h.range('power_pct').max > p0 * 2, '> 2× the starting count rate');
        ck('no fuel damage', t.melted, !t.melted, 'false');
        // The tuning-relevant number: how much dilution the shutdown margin absorbs
        // before protection acts. Informational — it moves with any boron-worth or
        // rod-worth change, and #260/#263 moved both. Derived from the trip TIME,
        // not from the endpoint: nothing stops the dilution when the trip fires, so
        // the boron at the end of the hour is far below the boron at the trip.
        ck.info('time to trip (s)', h.tripTime != null ? fmt(h.tripTime, 0) : 'none');
        ck.info('boron removed WHEN protection acted (ppm)',
          h.tripTime != null ? fmt(0.05 * (h.tripTime - 60), 0) : 'n/a');
        ck.info('boron at trip (ppm)', h.tripTime != null ? fmt(b0 - 0.05 * (h.tripTime - 60), 0) : 'n/a');
        ck.info('boron after the full hour, dilution never secured (ppm)', fmt(t.boron_ppm, 0));
        ck.info('total removed over the hour (ppm)', fmt(removed, 0));
        T.checkSanity(ck, h);
      });
    },
  };

  OPS.runAll = function () {
    var out = [];
    for (var k in OPS) if (k !== 'runAll' && typeof OPS[k] === 'function') out.push(OPS[k]());
    return out;
  };

  RD.OpsTestsPWR = OPS;

})(globalThis.RD || (globalThis.RD = {}));
