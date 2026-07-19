/*
 * ops_rbmk.js — RBMK external operations suite (tuning probes, run by
 * test/run_ops.js on top of test/ops_harness.js). Most scenarios run for BOTH
 * design versions (pre_chernobyl / post_chernobyl) — the pre-vs-post contrast
 * under the REAL protection layer is the point.
 *
 * ops_*   — realistic plant evolutions (power maneuvering is rods + the flow
 *           program; the turbine follows in load-follow mode).
 * abuse_* — the player: yanking rods, killing flow, bypassing EPS, cranking
 *           time acceleration, and the full Chernobyl sequence as a player
 *           would blunder into it.
 */
;(function (RD) {
  'use strict';

  var T = RD.OpsTest, test = T.test, near = T.near, fmt = T.fmt;

  function H(version, initial, opts) {
    opts = opts || {};
    opts.plant = 'rbmk';
    opts.version = version;
    opts.initial = initial;
    return new RD.OpsHarness(opts);
  }
  function vtag(v) { return v === 'post_chernobyl' ? 'post' : 'pre'; }
  function destroyed(ts) { return ts.melted || ts.steam_explosion_occurred; }

  // Simple rod-based power controller: 1 step per action toward target
  // (2 steps only when far off), and never withdraw while the startup rate is
  // already high — the touch a real RBMK operator uses near the trip line.
  function holdPower(hh, targetPct, band) {
    var ts = hh.ts(), p = ts.power_pct, err = p - targetPct;
    if (err < -band) {
      if (ts.startup_rate_dpm > 1.5) return;   // already rising briskly — wait
      hh.cmd('rod_nudge', { group_id: 'control_rods', steps: err < -10 ? 2 : 1 });
    } else if (err > band) {
      hh.cmd('rod_nudge', { group_id: 'control_rods', steps: err > 10 ? -2 : -1 });
    }
  }

  // ---------------------------------------------------------------- realistic

  function steadyTest(v) {
    return test('OPS [' + vtag(v) + '] steady endurance — 1 h at 100%', function (ck) {
      var h = H(v, 'full_power');
      h.run(3600);
      ck('power stays 100 ±2%', fmt(h.range('power_pct').min, 1) + '..' + fmt(h.range('power_pct').max, 1),
        h.range('power_pct').min > 98 && h.range('power_pct').max < 102, '98..102');
      ck('drum pressure band', fmt(h.range('steam_pressure_mpa').min, 2) + '..' + fmt(h.range('steam_pressure_mpa').max, 2),
        h.range('steam_pressure_mpa').min > 6.7 && h.range('steam_pressure_mpa').max < 7.3, '6.7..7.3');
      ck('drum level band', fmt(h.range('drum_level_pct').min, 1) + '..' + fmt(h.range('drum_level_pct').max, 1),
        h.range('drum_level_pct').min > 42 && h.range('drum_level_pct').max < 58, '42..58');
      ck('no trip', h.tripReason || 'none', h.tripTime == null, 'none');
      ck('no alarms', Object.keys(h.alarmFirst).join(',') || 'none', Object.keys(h.alarmFirst).length === 0, 'none');
      ck.info('ORM held (equiv rods)', fmt(h.ts().orm_equiv_rods, 1));
      T.checkSanity(ck, h);
    });
  }

  function loadFollowTest(v) {
    return test('OPS [' + vtag(v) + '] load follow — 100 → 50 → 100% with rods + flow program', function (ck) {
      var h = H(v, 'full_power');
      var lastAct = 0, flowSet = false;
      // Down: walk the target from 100 to 50 over ~25 min; rods do the work.
      h.run(1500, function (hh, t) {
        if (t - lastAct < 5) return;
        lastAct = t;
        var target = Math.max(50, 100 - (t / 1500) * 50);
        holdPower(hh, target, 1.0);
        if (!flowSet && hh.ts().power_pct < 62) { hh.cmd('set_channel_flow', { pct: 80 }); flowSet = true; }
      });
      h.run(600, function (hh, t) { if (t - lastAct >= 5) { lastAct = t; holdPower(hh, 50, 1.0); } });
      var mid = h.ts();
      ck('holds 50 ±3% at plateau', fmt(mid.power_pct, 1), near(mid.power_pct, 50, 3), '50 ±3');
      ck('ORM above the version minimum on the way down', fmt(h.range('orm_equiv_rods').min, 1),
        h.range('orm_equiv_rods').min > (v === 'post_chernobyl' ? 43 : 15), '> min');
      // Up: back to 100.
      var t0 = h.t();
      h.cmd('set_channel_flow', { pct: 100 });
      h.run(1800, function (hh, t) {
        if (t - lastAct < 5) return;
        lastAct = t;
        var target = Math.min(100, 50 + ((t - t0) / 1500) * 50);
        holdPower(hh, target, 1.0);
      });
      h.run(300, function (hh, t) { if (t - lastAct >= 5) { lastAct = t; holdPower(hh, 100, 1.0); } });
      var end = h.ts();
      ck('returns to 100 ±3%', fmt(end.power_pct, 1), near(end.power_pct, 100, 3), '100 ±3');
      ck('no trip through the maneuver', h.tripReason || 'none', h.tripTime == null, 'none');
      ck('not destroyed', destroyed(end), !destroyed(end), 'false');
      ck.info('void range across maneuver', fmt(h.range('void_fraction_avg').min, 2) + '..' + fmt(h.range('void_fraction_avg').max, 2));
      ck.info('ORM at end', fmt(end.orm_equiv_rods, 1));
      ck.info('alarms', Object.keys(h.alarmFirst).join(',') || 'none');
      T.checkSanity(ck, h);
    });
  }

  function startupTest(v) {
    return test('OPS [' + vtag(v) + '] startup — approach to criticality from hot standby', function (ck) {
      var h = H(v, 'hot_startup');
      var t0 = h.ts();
      ck('starts subcritical', fmt(t0.reactivity_pcm, 0) + ' pcm', t0.reactivity_pcm < -100, '< -100');
      var guard = 0;
      while (h.ts().power_pct < 1.0 && guard++ < 150 && h.tripTime == null && !destroyed(h.ts())) {
        var r = h.cmd('rod_nudge', { group_id: 'control_rods', steps: 2, speed: 'slow' });
        h.run(20);
        if (r && r.type === 'blocked') h.run(20);
      }
      ck('reached 1% power', fmt(h.ts().power_pct, 3) + '%', h.ts().power_pct >= 1.0, '>= 1%');
      // Level the rise like an operator, then hands off.
      h.cmd('rod_nudge', { group_id: 'control_rods', steps: -3, speed: 'slow' });
      h.run(300);
      var t = h.ts();
      ck('stabilizes below 25% after leveling', fmt(t.power_pct, 2) + '%', t.power_pct < 25, '< 25%');
      ck('no scram during careful startup', h.tripReason || 'none', h.tripTime == null, 'none');
      ck('not destroyed', destroyed(t), !destroyed(t), 'false');
      ck.info('withdrawal blocks (SUR interlock)', h.blockedCount);
      ck.info('ORM after pull to critical', fmt(t.orm_equiv_rods, 1));
      T.checkSanity(ck, h);
    });
  }

  function flowReductionTest(v) {
    return test('OPS [' + vtag(v) + '] flow reduction at power — void feedback compensation', function (ck) {
      var h = H(v, 'full_power');
      h.run(30);
      var rodsBefore = h.ctl().rod_groups[0].steps;
      // Ramp the flow down in 5% steps a minute apart (a real flow program
      // change is walked, not slammed), holding power with rods throughout.
      var lastAct = 0, flowNow = 100;
      h.run(900, function (hh, t) {
        var wantFlow = Math.max(75, 100 - Math.floor(t / 60) * 5);
        if (wantFlow !== flowNow) { flowNow = wantFlow; hh.cmd('set_channel_flow', { pct: wantFlow }); }
        if (t - lastAct >= 10) { lastAct = t; holdPower(hh, 100, 1.0); }
      });
      var t = h.ts();
      var rodsAfter = h.ctl().rod_groups[0].steps;
      ck('power held 100 ±4% through the flow change', fmt(t.power_pct, 1), near(t.power_pct, 100, 4), '100 ±4');
      ck('no trip', h.tripReason || 'none', h.tripTime == null, 'none');
      ck('not destroyed', destroyed(t), !destroyed(t), 'false');
      ck.info('peak power during transient', fmt(h.range('power_pct').max, 1) + '%');
      ck.info('void before→after', fmt(h.range('void_fraction_avg').min, 2) + '→' + fmt(t.void_fraction_avg, 2));
      ck.info('net rod steps inserted to compensate (withdrawn-steps delta)', rodsBefore - rodsAfter);
      ck.info('ORM after compensation', fmt(t.orm_equiv_rods, 1));
      T.checkSanity(ck, h);
    });
  }

  function feedwaterDipTest(v) {
    return test('OPS [' + vtag(v) + '] feedwater dip — 50% FW for 90 s, then restore', function (ck) {
      var h = H(v, 'full_power');
      h.run(30);
      h.cmd('set_feedwater_flow', { pct: 50 });
      h.run(90);
      h.cmd('set_feedwater_flow', { pct: 100 });
      h.run(600);
      var t = h.ts();
      ck('drum level recovered to band', fmt(t.drum_level_pct, 1), near(t.drum_level_pct, 50, 8), '50 ±8');
      ck('no destruction', destroyed(t), !destroyed(t), 'false');
      ck.info('drum level floor during dip', fmt(h.range('drum_level_pct').min, 1) + '%');
      ck.info('tripped?', h.tripReason || 'no trip');
      ck.info('alarms', Object.keys(h.alarmFirst).join(',') || 'none');
      T.checkSanity(ck, h);
    });
  }

  function turbineTripTest(v) {
    return test('OPS [' + vtag(v) + '] turbine trip at 100% — dump vs relief', function (ck) {
      var h = H(v, 'full_power');
      h.run(30);
      h.cmd('inject_failure', { failure_id: 'turbine_trip' });
      h.run(900);
      var t = h.ts();
      ck('drum pressure held below relief setpoint region', fmt(h.range('steam_pressure_mpa').max, 2),
        h.range('steam_pressure_mpa').max < 8.3, '< 8.3');
      ck('not destroyed', destroyed(t), !destroyed(t), 'false');
      ck.info('did the RPS trip, and why', h.tripReason || 'no trip');
      ck.info('peak drum pressure', fmt(h.range('steam_pressure_mpa').max, 2));
      ck.info('power settle at +15 min', fmt(t.power_pct, 1) + '%');
      ck.info('alarms', Object.keys(h.alarmFirst).join(',') || 'none');
      T.checkSanity(ck, h);
    });
  }

  function mcpRunbackTest(v) {
    return test('OPS [' + vtag(v) + '] partial MCP trip — operator runs power back', function (ck) {
      var h = H(v, 'full_power');
      h.run(30);
      h.cmd('inject_failure', { failure_id: 'partial_mcp_trip', severity: 0.5 });
      var lastAct = 0;
      h.run(1200, function (hh, t) {
        if (t - lastAct >= 8) { lastAct = t; holdPower(hh, 60, 1.5); }
      });
      var t = h.ts();
      ck('power run back to 60 ±6%', fmt(t.power_pct, 1), near(t.power_pct, 60, 6), '60 ±6');
      ck('fuel temperature bounded (no dryout runaway)', fmt(h.range('fuel_temp_c').max, 0),
        h.range('fuel_temp_c').max < 1200, '< 1200 °C');
      ck('not destroyed', destroyed(t), !destroyed(t), 'false');
      ck.info('tripped?', h.tripReason || 'no trip');
      ck.info('peak void', fmt(h.range('void_fraction_avg').max, 2));
      T.checkSanity(ck, h);
    });
  }

  function scramDecayTest(v) {
    return test('OPS [' + vtag(v) + '] manual scram from 100% — insertion character', function (ck) {
      var h = H(v, 'full_power');
      h.run(10);
      var pPre = h.ts().power_pct;
      h.cmd('manual_scram');
      h.run(2.0);
      var p2s = h.ts().power_pct;
      h.run(28);
      var p30 = h.ts().power_pct;
      h.run(600);
      var t = h.ts();
      ck('shut down by +30 s', fmt(p30, 1) + '%', p30 < 15, '< 15%');
      ck('settled to decay levels', fmt(t.power_pct, 2) + '%', t.power_pct < 8, '< 8%');
      ck('not destroyed by its own scram at healthy ORM', destroyed(t), !destroyed(t), 'false');
      ck.info('power 2 s after AZ-5 (tip-effect signature)', fmt(p2s, 1) + '% (from ' + fmt(pPre, 1) + '%)');
      ck.info('peak power in first 2 s', fmt(h.range('power_pct').max, 1) + '%');
      ck.info('decay heat at +10 min', fmt(t.decay_heat_pct, 2) + '%');
      T.checkSanity(ck, h);
    });
  }

  function xenonPitTest(v) {
    return test('OPS [' + vtag(v) + '] xenon pit — shutting down from the pit', function (ck) {
      var h = H(v, 'low_power_xenon');
      var t0 = h.ts();
      ck('starts in the danger zone (ORM alarm)', fmt(t0.orm_equiv_rods, 1) + ' rods',
        t0.orm_alarm_active === true, 'orm_alarm_active');
      // The book answer is to shut down and wait out the xenon. On the
      // post-1986 core that is safe. On the pre-1986 core AZ-5 from a
      // low-ORM pit IS the Chernobyl trap — destruction is the design lesson.
      h.cmd('manual_scram');
      h.run(1800);
      var t = h.ts();
      if (v === 'post_chernobyl') {
        ck('post-1986: safe shutdown from the pit', fmt(t.power_pct, 3) + '%',
          t.power_pct < 2 && !destroyed(t), '< 2%, intact');
      } else {
        ck('pre-1986: AZ-5 from the pit is the trap (design lesson)', t.destruction_cause,
          destroyed(t), 'destroyed');
        // The skilled escape: SLOW insertion instead of the button — record
        // whether careful play can survive the same pit.
        var h2 = H(v, 'low_power_xenon');
        var done = 0;
        h2.run(600, function (hh, tt) {
          if (tt - done >= 15) { done = tt; hh.cmd('rod_nudge', { group_id: 'control_rods', steps: -2, speed: 'slow' }); }
        });
        h2.run(600);
        ck.info('pre: slow-insertion escape instead of AZ-5 — outcome',
          (destroyed(h2.ts()) ? h2.ts().destruction_cause : 'intact') + ' / power ' + fmt(h2.ts().power_pct, 2) + '%');
      }
      ck.info('xenon at +30 min (% eq)', fmt(t.xenon_pct_eq, 1));
      ck.info('destruction cause', t.destruction_cause);
      T.checkSanity(ck, h);
    });
  }

  // -------------------------------------------------------------------- abuse

  // The full Chernobyl blunder as a PLAYER would produce it, identical script on
  // both versions, with the real protection stack active: low-power/high-xenon
  // start, flow starved, rods yanked, then AZ-5.
  function chernobylSequenceTest(v) {
    return test('ABUSE [' + vtag(v) + '] Chernobyl sequence — starve flow, yank rods, AZ-5', function (ck) {
      var h = H(v, 'low_power_xenon');
      h.run(10);
      h.cmd('set_channel_flow', { pct: 60 });
      // Yank: reissue continuous fast withdrawal despite interlock refusals.
      h.run(240, function (hh) {
        hh.cmd('rod_start', { group_id: 'control_rods', direction: 1, speed: 'fast' });
      });
      // The button.
      h.cmd('manual_scram');
      h.run(120);
      var t = h.ts();
      if (v === 'pre_chernobyl') {
        // With the live protection stack the auto-trip changes the accident's
        // timing (the engine-direct flagship owns the canonical sequence), so
        // the pre outcome is recorded, not asserted.
        ck.info('pre-1986 outcome under live protection', t.destruction_cause + ' / peak ' + fmt(h.range('power_pct').max, 0) + '%');
      } else {
        ck('post-1986: the sequence must be survivable (design intent)', t.destruction_cause,
          !destroyed(t), 'intact');
        ck.info('post outcome / peak power', t.destruction_cause + ' / ' + fmt(h.range('power_pct').max, 0) + '%');
      }
      ck.info('trip fired (reason)', h.tripReason || 'none');
      ck.info('ORM floor reached', fmt(h.range('orm_equiv_rods').min, 1));
      ck.info('peak energy deposition (cal/g/s)', fmt(h.range('energy_deposition_rate').max, 1));
      T.checkSanity(ck, h);
    });
  }

  function yankAllRodsTest(v) {
    return test('ABUSE [' + vtag(v) + '] yank all rods at 100% — protection response', function (ck) {
      var h = H(v, 'full_power');
      h.run(10);
      h.run(300, function (hh) {
        hh.cmd('rod_start', { group_id: 'control_rods', direction: 1, speed: 'fast' });
      });
      var t = h.ts();
      ck('protection tripped', h.tripReason || 'none', h.tripTime != null, 'tripped');
      if (v === 'post_chernobyl') {
        ck('post-1986: no destruction from a full-power yank', destroyed(t), !destroyed(t), 'intact');
      } else {
        ck.info('pre-1986 outcome', t.destruction_cause);
      }
      ck.info('peak power', fmt(h.range('power_pct').max, 1) + '%');
      ck.info('ORM floor', fmt(h.range('orm_equiv_rods').min, 1));
      ck.info('trip reason', h.tripReason || 'none');
      T.checkSanity(ck, h);
    });
  }

  function zeroFlowTest(v) {
    return test('ABUSE [' + vtag(v) + '] channel flow to zero at 100% — hands off', function (ck) {
      var h = H(v, 'full_power');
      h.run(10);
      h.cmd('set_channel_flow', { pct: 0 });
      h.run(900);
      var t = h.ts();
      ck.info('outcome', t.destruction_cause + (t.melted ? ' (melted @' + fmt(h.meltTime, 0) + 's)' : ' (intact)'));
      ck.info('tripped (reason/time)', (h.tripReason || 'none') + (h.tripTime != null ? ' @' + fmt(h.tripTime, 0) + 's' : ''));
      ck.info('peak power', fmt(h.range('power_pct').max, 0) + '%');
      ck.info('peak void', fmt(h.range('void_fraction_avg').max, 2));
      ck.info('peak fuel temp', fmt(h.range('fuel_temp_c').max, 0) + ' °C');
      ck('protection at least fired before any destruction',
        h.tripTime != null ? 'tripped @' + fmt(h.tripTime, 0) : 'no trip',
        h.tripTime != null, 'tripped');
      T.checkSanity(ck, h);
    });
  }

  function epsBypassYankTest() {
    var v = 'pre_chernobyl';
    return test('ABUSE [pre] EPS bypassed + yank from the xenon pit — does anything stop it?', function (ck) {
      var h = H(v, 'low_power_xenon');
      h.run(10);
      h.cmd('set_eps_bypass', { active: true });
      h.cmd('set_channel_flow', { pct: 60 });
      h.run(900, function (hh) {
        hh.cmd('rod_start', { group_id: 'control_rods', direction: 1, speed: 'fast' });
      });
      var t = h.ts();
      ck.info('outcome without AZ-5', t.destruction_cause + ' / peak ' + fmt(h.range('power_pct').max, 0) + '%');
      ck.info('did the RPS trip DESPITE the bypass', (h.tripReason || 'no trip') + (h.tripTime != null ? ' @' + fmt(h.tripTime, 0) : ''));
      ck.info('eps_bypassed state honored in true_state', t.eps_bypassed);
      ck.info('ORM floor', fmt(h.range('orm_equiv_rods').min, 1));
      T.checkSanity(ck, h);
    });
  }

  function commandSpamTest() {
    var v = 'post_chernobyl';
    return test('ABUSE [post] command spam — contradictory inputs for 2 min', function (ck) {
      var h = H(v, 'full_power');
      var flip = false;
      h.run(120, function (hh) {
        flip = !flip;
        hh.cmd('set_channel_flow', { pct: flip ? 120 : 40 });
        hh.cmd('set_feedwater_flow', { pct: flip ? 150 : 0 });
        hh.cmd('set_turbine_load', { mwe: flip ? 1200 : 0 });
        hh.cmd('set_steam_dump', { mode: flip ? 'open' : 'closed' });
        hh.cmd('rod_nudge', { group_id: 'control_rods', steps: flip ? 3 : -3 });
        hh.cmd('set_eccs', { active: flip });
      });
      h.run(300);
      ck('power remained physical', fmt(h.range('power_pct').max, 1) + '%', h.range('power_pct').max < 150, '< 150%');
      ck('drum pressure remained physical', fmt(h.range('steam_pressure_mpa').min, 2) + '..' + fmt(h.range('steam_pressure_mpa').max, 2),
        h.range('steam_pressure_mpa').min > 3 && h.range('steam_pressure_mpa').max < 9.5, '3..9.5');
      ck.info('end state', (h.tripReason || 'no trip') + ' / ' + h.ts().destruction_cause);
      T.checkSanity(ck, h);
    });
  }

  function accelLatencyTest() {
    var v = 'post_chernobyl';
    return test('ABUSE [post] time-acceleration — rod runaway at 1× vs 256×', function (ck) {
      function runaway(accel) {
        var h = H(v, '50_percent', { accel: accel });
        h.run(10);
        h.cmd('inject_failure', { failure_id: 'continuous_rod_withdrawal', severity: 1.0 });
        h.run(300);
        return h;
      }
      var h1 = runaway(1), h256 = runaway(256);
      ck('1×: protection catches it before destruction', destroyed(h1.ts()), !destroyed(h1.ts()), 'intact');
      // C2 ACCEPTANCE (2026-07-19 review): protection latency scales with time
      // acceleration (M4 evaluates once per broadcast → ~13 sim-s at 256×), so
      // the identical runaway that trips cleanly at 1× destroys the core at
      // 256×. This is the finding's hard check — expected RED until C2 is fixed
      // (evaluate trips on sim-time cadence, or auto-drop accel on new alarms).
      ck('256×: same protection outcome as 1× (C2 tuning target)',
        destroyed(h256.ts()) ? h256.ts().destruction_cause : 'intact', !destroyed(h256.ts()), 'intact');
      ck.info('1× peak power', fmt(h1.range('power_pct').max, 1) + '%');
      ck.info('256× peak power', fmt(h256.range('power_pct').max, 1) + '%');
      ck.info('1× trip delay after inject (s)', h1.tripTime != null ? fmt(h1.tripTime - 10, 1) : 'no trip');
      ck.info('256× trip delay after inject (s)', h256.tripTime != null ? fmt(h256.tripTime - 10, 1) : 'no trip');
      T.checkSanity(ck, h1);
      T.checkSanity(ck, h256);
    });
  }

  function scramRecoverTest() {
    var v = 'post_chernobyl';
    return test('ABUSE [post] scram then withdraw — recovery path?', function (ck) {
      var h = H(v, 'full_power');
      h.run(10);
      h.cmd('manual_scram');
      h.run(30);
      h.run(120, function (hh) {
        hh.cmd('rod_start', { group_id: 'control_rods', direction: 1, speed: 'fast' });
      });
      var cs = h.ctl();
      ck('rods stay in despite withdraw attempts', fmt(cs.rod_groups[0].position_pct, 1) + '% withdrawn',
        cs.rod_groups[0].position_pct < 5, '< 5%');
      ck('power stays shut down', fmt(h.ts().power_pct, 2) + '%', h.ts().power_pct < 5, '< 5%');
      ck.info('RPS latched (no reset path in v1)', h.rps().scrammed);
      T.checkSanity(ck, h);
    });
  }

  function eccsRuptureTest() {
    var v = 'post_chernobyl';
    return test('OPS [post] pressure-tube rupture — ECCS saves the core', function (ck) {
      var h = H(v, 'full_power');
      h.run(30);
      h.cmd('inject_failure', { failure_id: 'pressure_tube_rupture', severity: 0.3 });
      h.run(60);
      h.cmd('set_eccs', { active: true });
      h.run(1200);
      var t = h.ts();
      ck('no destruction with ECCS aligned', destroyed(t), !destroyed(t), 'intact');
      ck('drum level recovered above the trip floor', fmt(t.drum_level_pct, 1), t.drum_level_pct > 20, '> 20%');
      ck.info('tripped (reason)', h.tripReason || 'no trip');
      ck.info('drum level floor', fmt(h.range('drum_level_pct').min, 1) + '%');
      ck.info('peak fuel temp', fmt(h.range('fuel_temp_c').max, 0) + ' °C');
      T.checkSanity(ck, h);
    });
  }

  var OPS = {
    ops_steady_pre:        function () { return steadyTest('pre_chernobyl'); },
    ops_steady_post:       function () { return steadyTest('post_chernobyl'); },
    ops_load_follow_pre:   function () { return loadFollowTest('pre_chernobyl'); },
    ops_load_follow_post:  function () { return loadFollowTest('post_chernobyl'); },
    ops_startup_pre:       function () { return startupTest('pre_chernobyl'); },
    ops_startup_post:      function () { return startupTest('post_chernobyl'); },
    ops_flow_reduction_pre:  function () { return flowReductionTest('pre_chernobyl'); },
    ops_flow_reduction_post: function () { return flowReductionTest('post_chernobyl'); },
    ops_feedwater_dip_pre:   function () { return feedwaterDipTest('pre_chernobyl'); },
    ops_feedwater_dip_post:  function () { return feedwaterDipTest('post_chernobyl'); },
    ops_turbine_trip_pre:    function () { return turbineTripTest('pre_chernobyl'); },
    ops_turbine_trip_post:   function () { return turbineTripTest('post_chernobyl'); },
    ops_mcp_runback_pre:     function () { return mcpRunbackTest('pre_chernobyl'); },
    ops_mcp_runback_post:    function () { return mcpRunbackTest('post_chernobyl'); },
    ops_scram_pre:           function () { return scramDecayTest('pre_chernobyl'); },
    ops_scram_post:          function () { return scramDecayTest('post_chernobyl'); },
    ops_xenon_pit_pre:       function () { return xenonPitTest('pre_chernobyl'); },
    ops_xenon_pit_post:      function () { return xenonPitTest('post_chernobyl'); },
    ops_eccs_rupture_post:   eccsRuptureTest,

    abuse_chernobyl_pre:     function () { return chernobylSequenceTest('pre_chernobyl'); },
    abuse_chernobyl_post:    function () { return chernobylSequenceTest('post_chernobyl'); },
    abuse_yank_rods_pre:     function () { return yankAllRodsTest('pre_chernobyl'); },
    abuse_yank_rods_post:    function () { return yankAllRodsTest('post_chernobyl'); },
    abuse_zero_flow_pre:     function () { return zeroFlowTest('pre_chernobyl'); },
    abuse_zero_flow_post:    function () { return zeroFlowTest('post_chernobyl'); },
    abuse_eps_bypass_yank:   epsBypassYankTest,
    abuse_command_spam:      commandSpamTest,
    abuse_accel_latency:     accelLatencyTest,
    abuse_scram_recover:     scramRecoverTest,
  };

  OPS.runAll = function () {
    var out = [];
    for (var k in OPS) if (k !== 'runAll' && typeof OPS[k] === 'function') out.push(OPS[k]());
    return out;
  };

  RD.OpsTestsRBMK = OPS;

})(globalThis.RD || (globalThis.RD = {}));
