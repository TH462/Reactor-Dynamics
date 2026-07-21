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
    if (p < targetPct - band) hh.cmd('rod_nudge', { group_id: 'control_rods', steps: 1 });
    else if (p > targetPct + band) hh.cmd('rod_nudge', { group_id: 'control_rods', steps: -1 });
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
        var lastAct = 0;
        h.run(1800, function (hh, t) {
          if (t - lastAct < 10) return;
          lastAct = t;
          holdPower(hh, Math.max(50, 100 - (t / 1500) * 50), 1.0);
        });
        h.run(600, function (hh, t) { if (t - lastAct >= 10) { lastAct = t; holdPower(hh, 50, 1.0); } });
        var mid = h.ts();
        ck('power near 50% at plateau', fmt(mid.power_pct, 1), near(mid.power_pct, 50, 5), '50 ±5');
        ck('turbine followed the reactor down', fmt(mid.mwe_output, 0) + ' MWe', near(mid.mwe_output, 500, 60), '500 ±60');
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
        h.cmd('set_load_target', { mwe: 550 });
        h.run(300);
        var mtcOnly = h.ts().power_pct;
        ck.info('reactor pickup on MTC alone at +5 min', fmt(mtcOnly, 1) + '% (real PWR: most of the step)');
        var lastAct = 0;
        h.run(600, function (hh, t) {
          if (t - lastAct >= 15) { lastAct = t; holdPower(hh, 55, 0.75); }
        });
        var t = h.ts();
        ck('power settles 55 ±2% with rod assist', fmt(t.power_pct, 1), near(t.power_pct, 55, 2), '55 ±2');
        ck('electrical output near demand', fmt(t.mwe_output, 0) + ' MWe', near(t.mwe_output, 550, 30), '550 ±30');
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
        // Phase 2: single-step nudges, checking the response every few seconds
        // (a startup is walked, not batch-run), until the power responds.
        var guard = 0;
        outer:
        while (h.ts().power_pct < 0.3 && guard++ < 200 && h.tripTime == null) {
          var r = h.cmd('rod_nudge', { group_id: 'control_rods', steps: 1, speed: 'slow' });
          if (r && r.type === 'blocked') { h.run(20); continue; }
          for (var w = 0; w < 4; w++) { h.run(5); if (h.ts().power_pct >= 0.3) break outer; }
        }
        ck('reached point of adding heat (0.3%)', fmt(h.ts().power_pct, 3) + '%', h.ts().power_pct >= 0.3, '>= 0.3%');
        // Phase 3: level the rise like an operator (a few steps back in), then
        // let Doppler carry it to a stable low-power point.
        h.cmd('rod_nudge', { group_id: 'control_rods', steps: -3, speed: 'slow' });
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
        var t0 = h.t(), T0 = h.ts().tavg_c;
        h.run(7200, function (hh, t) {
          var ts = hh.ts(), ins = hh.ins();
          // Real cooldown procedure: walk the PRESSURE SETPOINT down with the
          // temperature (heaters follow instead of fighting the capped spray —
          // the old fire-hose spray simply overpowered them, feel-plan P5).
          var psp = Math.max(Math.pow(Math.max(ts.tavg_c + 30, 1) / 179.47, 1 / 0.239), 2.0);
          hh.cmd('set_pressure_setpoint', { mpa: Math.min(psp, 15.41) });
          if (ts.hpi_active && ins.subcooling_margin > 25) hh.cmd('set_hpi', { active: false });
          var tavgTarget = T0 - 50 * ((t - t0) / 3600);
          hh.cmd('set_steam_dump', { pct: ins.tavg > tavgTarget ? 12 : 0 });
          if (ins.subcooling_margin > 40) hh.cmd('set_spray', { pct: 60 });   // walk pressure down with the temp
          else hh.cmd('set_spray', { pct: 0 });
        });
        var t = h.ts();
        ck('~50 °C/h ramp achieved (Tavg after 2 h)', fmt(t.tavg_c, 1), t.tavg_c < 275, '< 275 °C');
        ck('pressure walked down with the cooldown', fmt(t.pressure_mpa, 2), t.pressure_mpa < 10.0, '< 10 MPa');
        ck('subcooling never lost during a guarded cooldown', fmt(h.range('subcooling_c').min, 1),
          h.range('subcooling_c').min > 0, '> 0');
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
        // throttle HPI once subcooling is comfortable so it stops repressurizing
        // the primary against the leak. (The initial blowdown of a full-bore
        // rupture BRIEFLY touches saturation before SI catches it — physics;
        // the hold-subcooling requirement is on the MANAGED phase below.)
        // "Held" is measured from the moment SI first RESTORES the margin (>15) —
        // the blowdown tail overlaps the start of this window by a few seconds.
        var minSubEop = 1e9, eopArmed = false;
        h.run(2400, function (hh) {
          if (!eopArmed && hh.ts().subcooling_c > 15) eopArmed = true;
          if (eopArmed) minSubEop = Math.min(minSubEop, hh.ts().subcooling_c);
          var ins = hh.ins();
          var m = ins.subcooling_margin;
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
          if (m > 30 && hh.ts().hpi_active) hh.cmd('set_hpi', { active: false });
          else if (m < 15 && !hh.ts().hpi_active) hh.cmd('set_hpi', { active: true });
        });
        var t = h.ts();
        ck('no fuel damage under the EOP', t.melted, !t.melted, 'false');
        // In the deep-depressurization regime the model's sat-pull slaves P to
        // ~Psat(Tavg): a cooldown riding the saturation line down reads true
        // subcooling ≈ 0⁻ (a −2..−3 °C flashing band) by construction. The real
        // requirement is no SUSTAINED margin loss and no actual bulk voiding.
        ck('managed phase rides ≥ the sat-line band (min ≥ −3)', fmt(minSubEop, 1), minSubEop >= -3, '≥ −3');
        ck('no bulk voiding anywhere (peak void < 0.05)', fmt(h.range('primary_void_fraction').max, 3),
          h.range('primary_void_fraction').max < 0.05, '< 0.05');
        ck('primary walked down toward SG pressure', fmt(t.pressure_mpa, 2) + ' vs SG ' + fmt(t.steam_pressure_mpa, 2),
          t.pressure_mpa < t.steam_pressure_mpa + 2.5, '≤ SG + 2.5');
        ck('ΔP collapse killed most of the leak', fmt(t.leak_flow, 4) + ' vs initial ' + fmt(leak0, 3),
          t.leak_flow < leak0 * 0.35, '< 35 % of initial');
        ck('inventory stabilized (min ≥ 55 %)', fmt(h.range('core_inventory_pct').min, 1),
          h.range('core_inventory_pct').min > 55, '> 55%');
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
            else hh.cmd('rod_nudge', { group_id: 'control_rods', steps: 1 });
          } else if (p > 51.5) {
            hh.cmd('set_boron_adjust', { rate: 0 });
            hh.cmd('rod_nudge', { group_id: 'control_rods', steps: -1 });
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
        ck('no fuel damage hands-off (HPI carries it)', t.melted, !t.melted, 'false');
        ck('reactor tripped itself', h.tripReason || 'none', h.tripTime != null, 'tripped');
        ck('HPI auto-started', t.hpi_active, t.hpi_active === true, 'true');
        ck('core inventory floor', fmt(h.range('core_inventory_pct').min, 1) + '%',
          h.range('core_inventory_pct').min > 60, '> 60%');
        ck.info('min subcooling', fmt(h.range('subcooling_c').min, 1) + ' °C');
        ck.info('pressure floor', fmt(h.range('pressure_mpa').min, 2) + ' MPa');
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
  };

  OPS.runAll = function () {
    var out = [];
    for (var k in OPS) if (k !== 'runAll' && typeof OPS[k] === 'function') out.push(OPS[k]());
    return out;
  };

  RD.OpsTestsPWR = OPS;

})(globalThis.RD || (globalThis.RD = {}));
