/*
 * ops_bwr.js — BWR external operations suite (tuning probes, run by
 * test/run_ops.js on top of test/ops_harness.js).
 *
 * ops_*   — realistic evolutions: recirc-flow power maneuvering (the BWR way),
 *           startup, scram recovery, station-blackout management (both the
 *           depressurize-and-inject and the Isolation Condenser paths), ATWS.
 * abuse_* — the player: rod yanks (Λ = 5e-5 s — the twitchiest core of the
 *           three), the "what does the ADS button do" experiment, recirc
 *           slamming, overfeeding, command spam, time acceleration.
 */
;(function (RD) {
  'use strict';

  var T = RD.OpsTest, test = T.test, near = T.near, fmt = T.fmt;

  function H(initial, opts) {
    opts = opts || {};
    opts.plant = 'bwr';
    opts.initial = initial;
    return new RD.OpsHarness(opts);
  }
  function destroyed(ts) { return ts.melted; }

  var OPS = {

    // ================================================================ REALISTIC

    ops_steady_endurance: function () {
      return test('OPS steady endurance — 1 h at 100%', function (ck) {
        var h = H('full_power');
        h.run(3600);
        ck('power stays 100 ±2%', fmt(h.range('power_pct').min, 1) + '..' + fmt(h.range('power_pct').max, 1),
          h.range('power_pct').min > 98 && h.range('power_pct').max < 102, '98..102');
        ck('vessel pressure band', fmt(h.range('vessel_pressure_mpa').min, 2) + '..' + fmt(h.range('vessel_pressure_mpa').max, 2),
          h.range('vessel_pressure_mpa').min > 6.7 && h.range('vessel_pressure_mpa').max < 7.4, '6.7..7.4');
        ck('vessel level band', fmt(h.range('vessel_level_pct').min, 1) + '..' + fmt(h.range('vessel_level_pct').max, 1),
          h.range('vessel_level_pct').min > 42 && h.range('vessel_level_pct').max < 58, '42..58');
        ck('no trip', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('no alarms', Object.keys(h.alarmFirst).join(',') || 'none', Object.keys(h.alarmFirst).length === 0, 'none');
        T.checkSanity(ck, h);
      });
    },

    // Power maneuvering the BWR way: recirculation flow only, rods untouched.
    ops_load_follow_recirc: function () {
      return test('OPS load follow — 100 → ~75 → 100% on recirculation flow alone', function (ck) {
        var h = H('full_power');
        var rods0 = h.ctl().rod_groups[0].steps;
        h.run(60);
        // Walk the drive flow down 2%/min WITH the turbine load coordinated to
        // the falling reactor power (real BWR practice; the sim has no pressure
        // regulator, so an uncoordinated flow maneuver collapses vessel
        // pressure into the 5.52 MPa LOCA trip — measured tuning finding).
        var flowNow = 40;
        function coordinate(hh) { hh.cmd('set_turbine_load', { mwe: Math.round(hh.ts().power_pct / 100 * 1100) }); }
        h.run(600, function (hh, t) {
          var want = Math.max(30, 40 - Math.floor(t / 60) * 2);
          if (want !== flowNow) { flowNow = want; hh.cmd('set_recirc_flow', { pct: want }); }
          coordinate(hh);
        });
        h.run(600, coordinate);
        var mid = h.ts();
        ck('power came down on flow alone', fmt(mid.power_pct, 1) + '%', mid.power_pct < 90, '< 90%');
        ck.info('power at recirc 30% drive', fmt(mid.power_pct, 1) + '%');
        h.run(600, function (hh, t) {
          var want = Math.min(40, 30 + Math.floor((hh.t() - 1260) / 60) * 2);
          if (want !== flowNow) { flowNow = want; hh.cmd('set_recirc_flow', { pct: want }); }
          coordinate(hh);
        });
        h.run(600, coordinate);
        var end = h.ts();
        ck('power returns to 100 ±4%', fmt(end.power_pct, 1), near(end.power_pct, 100, 4), '100 ±4');
        ck('rods never moved', h.ctl().rod_groups[0].steps, h.ctl().rod_groups[0].steps === rods0, rods0);
        ck('no trip', h.tripReason || 'none', h.tripTime == null, 'none');
        ck.info('void range', fmt(h.range('core_void_fraction').min, 2) + '..' + fmt(h.range('core_void_fraction').max, 2));
        ck.info('level swing', fmt(h.range('vessel_level_pct').min, 1) + '..' + fmt(h.range('vessel_level_pct').max, 1));
        T.checkSanity(ck, h);
      });
    },

    ops_startup_approach: function () {
      return test('OPS startup — approach to criticality from hot standby', function (ck) {
        var h = H('hot_startup');
        var t0 = h.ts();
        ck('starts subcritical', fmt(t0.reactivity_pcm, 0) + ' pcm', t0.reactivity_pcm < -100, '< -100');
        var guard = 0;
        while (h.ts().power_pct < 1.0 && guard++ < 150 && h.tripTime == null && !destroyed(h.ts())) {
          var r = h.cmd('rod_nudge', { group_id: 'control_rods', steps: 2, speed: 'slow' });
          h.run(20);
          if (r && r.type === 'blocked') h.run(20);
        }
        ck('reached 1% power', fmt(h.ts().power_pct, 3) + '%', h.ts().power_pct >= 1.0, '>= 1%');
        h.run(300);
        var t = h.ts();
        ck('stabilizes below 25% hands-off', fmt(t.power_pct, 2) + '%', t.power_pct < 25, '< 25%');
        ck('no scram during careful startup', h.tripReason || 'none', h.tripTime == null, 'none');
        ck.info('withdrawal blocks encountered (BWR has NO SUR interlock — expect 0)', h.blockedCount);
        ck.info('min reactor period seen (s)', fmt(h.range('reactor_period_s').min, 1));
        T.checkSanity(ck, h);
      });
    },

    // Post-scram level control by hand. NOTE: dropping feedwater below 5% of
    // rated auto-starts RCIC via the fw_flow actuation, so a low-feed hold is
    // impossible without RCIC — recorded here as a tuning datum (real RCIC
    // starts on LOW LEVEL only).
    ops_scram_level_control: function () {
      return test('OPS scram recovery — manual level control after trip', function (ck) {
        var h = H('full_power');
        h.run(10);
        h.cmd('scram');
        var lastAct = 0;
        h.run(1800, function (hh, t) {
          if (t - lastAct < 5) return;
          lastAct = t;
          var lvl = hh.ins().vessel_level;   // operate on the INDICATED level
          if (lvl < 48) hh.cmd('set_feedwater_flow', { pct: 10 });
          else if (lvl > 58) {
            hh.cmd('set_feedwater_flow', { pct: 0 });
            hh.cmd('set_rcic', { active: false });   // secure ECCS once recovered
            hh.cmd('set_hpci', { active: false });
          }
        });
        var t = h.ts();
        ck('level held in a workable band', fmt(h.range('vessel_level_pct').min, 1) + '..' + fmt(h.range('vessel_level_pct').max, 1),
          h.range('vessel_level_pct').min > 35 && h.range('vessel_level_pct').max < 90, '35..90');
        ck('ADS never demanded', t.ads_open, t.ads_open === false, 'false');
        ck('no fuel damage', destroyed(t), !destroyed(t), 'false');
        ck('pressure held by the bypass/relief', fmt(h.range('vessel_pressure_mpa').max, 2),
          h.range('vessel_pressure_mpa').max < 7.7, '< 7.7');
        ck.info('RCIC ran (fw_flow actuation forces it on any low-feed hold)', t.rcic_running);
        ck.info('HPCI ran', t.hpci_running);
        T.checkSanity(ck, h);
      });
    },

    // Turbine trip: the classic BWR pressurization transient — void collapse
    // adds reactivity, the spike must be caught.
    ops_turbine_trip_spike: function () {
      return test('OPS turbine trip at 100% — pressurization/void-collapse spike', function (ck) {
        var h = H('full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'turbine_trip' });
        h.run(600);
        var t = h.ts();
        ck('protection caught the transient', h.tripReason || 'none', h.tripTime != null, 'tripped');
        ck('no fuel damage', destroyed(t), !destroyed(t), 'false');
        ck('pressure bounded by relief', fmt(h.range('vessel_pressure_mpa').max, 2),
          h.range('vessel_pressure_mpa').max < 8.1, '< 8.1');
        ck.info('peak power during void collapse', fmt(h.range('power_pct').max, 1) + '%');
        ck.info('trip reason / time after trip inject', (h.tripReason || '-') + ' / ' + (h.tripTime != null ? fmt(h.tripTime - 30, 1) + 's' : '-'));
        ck.info('peak fuel temp', fmt(h.range('fuel_temp_c').max, 0) + ' °C');
        T.checkSanity(ck, h);
      });
    },

    // Loss of feedwater, hands off — the auto systems should carry it.
    ops_lofw_handsoff: function () {
      return test('OPS loss of feedwater — hands off, auto systems carry it', function (ck) {
        var h = H('full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'loss_of_feedwater' });
        h.run(2400);
        var t = h.ts();
        ck('reactor tripped (low level)', h.tripReason || 'none', h.tripTime != null, 'tripped');
        ck('RCIC or HPCI started automatically', 'rcic=' + t.rcic_running + ' hpci=' + t.hpci_running,
          t.rcic_running || t.hpci_running || h.range('vessel_level_pct').min > 45, 'injection running');
        ck('core never uncovered', fmt(h.range('vessel_level_pct').min, 1) + '%',
          h.range('vessel_level_pct').min > 20, '> 20%');
        ck('no fuel damage', destroyed(t), !destroyed(t), 'false');
        ck.info('level floor', fmt(h.range('vessel_level_pct').min, 1) + '%');
        ck.info('ADS demanded?', t.ads_open);
        ck.info('alarm/system sequence', Object.keys(h.alarmFirst).map(function (k) { return k + '@' + fmt(h.alarmFirst[k], 0); }).join(' '));
        T.checkSanity(ck, h);
      });
    },

    // Station blackout, managed: ride RCIC, then depressurize and inject before
    // the batteries die — the Fukushima lesson, done right.
    ops_sbo_managed: function () {
      return test('OPS SBO managed — depressurize and inject before battery death', function (ck) {
        var h = H('post_scram_sbo');
        h.run(1800);                       // ride RCIC for 30 min
        h.cmd('open_srv_manual');          // controlled depressurization
        var tDep = h.runUntil(function (ts) { return ts.vessel_pressure_mpa < 1.03; }, 7200);
        ck('depressurized into the LPCI window', tDep >= 0 ? fmt(tDep / 60, 0) + ' min' : 'timeout', tDep >= 0, 'reached < 1.03 MPa');
        h.cmd('start_lpci');
        h.cmd('close_srv_manual');
        h.run(3600 * 2);
        var t = h.ts();
        ck('no fuel damage through +2 h of LPCI', destroyed(t), !destroyed(t), 'false');
        ck('level recovered', fmt(t.vessel_level_pct, 1) + '%', t.vessel_level_pct > 30, '> 30%');
        ck.info('level floor during blowdown', fmt(h.range('vessel_level_pct').min, 1) + '%');
        ck.info('peak fuel temp', fmt(h.range('fuel_temp_c').max, 0) + ' °C');
        ck.info('battery remaining at end', fmt(t.battery_charge_pct, 0) + '%');
        T.checkSanity(ck, h);
      });
    },

    // Station blackout with the Isolation Condenser (Fukushima Unit 1's tool).
    ops_sbo_isolation_condenser: function () {
      return test('OPS SBO — Isolation Condenser holds the fort', function (ck) {
        var h = H('post_scram_sbo');
        h.run(60);
        h.cmd('set_ic', { active: true });
        h.run(2 * 3600);
        var t = h.ts();
        ck('no fuel damage at +2 h', destroyed(t), !destroyed(t), 'false');
        ck('pressure held below SRV banging range', fmt(h.range('vessel_pressure_mpa').max, 2),
          h.range('vessel_pressure_mpa').max < 7.8, '< 7.8');
        ck('level above uncovery', fmt(h.range('vessel_level_pct').min, 1) + '%',
          h.range('vessel_level_pct').min > 20, '> 20%');
        ck.info('IC condensing at end', t.ic_condensing);
        ck.info('battery remaining', fmt(t.battery_charge_pct, 0) + '%');
        ck.info('pressure at end', fmt(t.vessel_pressure_mpa, 2) + ' MPa');
        T.checkSanity(ck, h);
      });
    },

    // ATWS: rods refuse — Standby Liquid Control is the answer.
    ops_atws_slc: function () {
      return test('OPS ATWS — failure to scram, SLC + recirc runback shuts it down', function (ck) {
        var h = H('full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'failure_to_scram' });
        h.cmd('inject_failure', { failure_id: 'turbine_trip' });   // the initiating event
        h.run(30);
        h.cmd('scram');                                            // fails (blocked)
        h.cmd('set_recirc_flow', { pct: 0 });                      // runback: void up, power down
        h.cmd('initiate_slc');                                     // boron
        h.run(1200);
        var t = h.ts();
        ck('power driven below 5% by boron + runback', fmt(t.power_pct, 1) + '%', t.power_pct < 5, '< 5%');
        ck('no fuel damage', destroyed(t), !destroyed(t), 'false');
        ck('rods indeed never moved (ATWS honored)', t.scrammed, t.scrammed === false, 'false');
        ck.info('peak power during ATWS', fmt(h.range('power_pct').max, 1) + '%');
        ck.info('peak pressure', fmt(h.range('vessel_pressure_mpa').max, 2) + ' MPa');
        ck.info('SLC tank remaining', fmt(t.slc_tank_pct, 0) + '%');
        T.checkSanity(ck, h);
      });
    },

    // Both recirc pumps trip: natural circulation should carry a stable
    // reduced-power state.
    ops_recirc_pump_trip: function () {
      return test('OPS recirc pump trip — natural circulation stability', function (ck) {
        var h = H('full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'recirc_pump_trip' });
        h.run(900);
        var t = h.ts();
        ck('power settled at a stable natural-circ point', fmt(t.power_pct, 1) + '%',
          t.power_pct > 20 && t.power_pct < 70, '20..70%');
        ck('no fuel damage', destroyed(t), !destroyed(t), 'false');
        ck.info('tripped?', h.tripReason || 'no trip');
        ck.info('core flow at natural circ', fmt(t.recirc_flow_pct, 1) + '%');
        ck.info('void at settle', fmt(t.core_void_fraction, 2));
        T.checkSanity(ck, h);
      });
    },

    // ================================================================== ABUSE

    // Rod yank at power in the fastest core of the three.
    abuse_rod_yank_at_power: function () {
      return test('ABUSE rod yank at 100% — Λ=5e-5 s core, protection race', function (ck) {
        var h = H('full_power');
        h.run(10);
        h.run(240, function (hh) {
          hh.cmd('rod_start', { group_id: 'control_rods', direction: 1, speed: 'fast' });
        });
        var t = h.ts();
        ck('no fuel damage', destroyed(t), !destroyed(t), 'false');
        ck('protection tripped', h.tripReason || 'none', h.tripTime != null, 'tripped');
        ck.info('peak power', fmt(h.range('power_pct').max, 1) + '%');
        ck.info('peak fuel temp', fmt(h.range('fuel_temp_c').max, 0) + ' °C');
        ck.info('trip reason', h.tripReason || 'none');
        T.checkSanity(ck, h);
      });
    },

    // "What does THIS button do?" — ADS at full power.
    abuse_ads_at_full_power: function () {
      return test('ABUSE ADS at 100% — the big red button experiment', function (ck) {
        var h = H('full_power');
        h.run(10);
        h.cmd('trigger_ads');
        h.run(1800);
        var t = h.ts();
        ck('no fuel damage from the blowdown', destroyed(t), !destroyed(t), 'false');
        ck('reactor tripped itself during the blowdown', h.tripReason || 'none', h.tripTime != null, 'tripped');
        ck.info('trip reason', h.tripReason);
        ck.info('pressure at +30 min', fmt(t.vessel_pressure_mpa, 2) + ' MPa');
        ck.info('level floor', fmt(h.range('vessel_level_pct').min, 1) + '%');
        ck.info('LPCI auto-started?', t.lpci_running);
        ck.info('peak power (void collapse/flash)', fmt(h.range('power_pct').max, 1) + '%');
        T.checkSanity(ck, h);
      });
    },

    // Slamming recirculation between min and max.
    abuse_recirc_slam: function () {
      return test('ABUSE recirc slam — 0 ↔ 48% drive every minute for 10 min', function (ck) {
        var h = H('full_power');
        var hi = false, lastFlip = -60;
        h.run(600, function (hh, t) {
          if (t - lastFlip >= 60) { lastFlip = t; hi = !hi; hh.cmd('set_recirc_flow', { pct: hi ? 0 : 48 }); }
        });
        h.run(300);
        var t = h.ts();
        ck('power bounded through the slams', fmt(h.range('power_pct').max, 1) + '%',
          h.range('power_pct').max < 130, '< 130%');
        ck('no fuel damage', destroyed(t), !destroyed(t), 'false');
        ck.info('power swing seen', fmt(h.range('power_pct').min, 1) + '..' + fmt(h.range('power_pct').max, 1) + '%');
        ck.info('tripped?', h.tripReason || 'no trip');
        T.checkSanity(ck, h);
      });
    },

    // Feedwater at 150% of rated at full power — overfeed/carryover territory.
    abuse_overfeed: function () {
      return test('ABUSE overfeed — feedwater to 150% at full power', function (ck) {
        var h = H('full_power');
        h.run(10);
        h.cmd('set_feedwater_flow', { pct: 150 });
        h.run(900);
        var t = h.ts();
        ck('no fuel damage', destroyed(t), !destroyed(t), 'false');
        ck.info('vessel level reached', fmt(h.range('vessel_level_pct').max, 1) + '%');
        ck.info('any high-level protection? (real BWR: L8 trips feed/turbine)', h.tripReason || 'no trip');
        ck.info('power response (cold water adds reactivity)', fmt(h.range('power_pct').max, 1) + '%');
        T.checkSanity(ck, h);
      });
    },

    // A relief valve sticks open and the player does nothing.
    abuse_srv_stuck_walkaway: function () {
      return test('ABUSE stuck-open relief valve + walk away', function (ck) {
        var h = H('full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'srv_stuck_open', severity: 1.0 });
        h.run(3600);
        var t = h.ts();
        ck('no fuel damage hands-off', destroyed(t), !destroyed(t), 'false');
        ck('level defended (injection or intact inventory)', fmt(h.range('vessel_level_pct').min, 1) + '%',
          h.range('vessel_level_pct').min > 20, '> 20%');
        ck.info('did it ever trip (real plant: suppression-pool heat forces manual scram — pool not modeled)',
          h.tripReason || 'no trip in 1 h');
        ck.info('injection running at +1 h', 'rcic=' + t.rcic_running + ' hpci=' + t.hpci_running + ' lpci=' + t.lpci_running);
        ck.info('pressure at +1 h', fmt(t.vessel_pressure_mpa, 2) + ' MPa');
        T.checkSanity(ck, h);
      });
    },

    abuse_command_spam: function () {
      return test('ABUSE command spam — contradictory inputs for 2 min', function (ck) {
        var h = H('full_power');
        var flip = false;
        h.run(120, function (hh) {
          flip = !flip;
          hh.cmd('set_recirc_flow', { pct: flip ? 48 : 0 });
          hh.cmd('set_feedwater_flow', { pct: flip ? 150 : 0 });
          hh.cmd('set_turbine_load', { mwe: flip ? 1300 : 0 });
          hh.cmd('set_steam_dump', { mode: flip ? 'open' : 'closed' });
          hh.cmd('rod_nudge', { group_id: 'control_rods', steps: flip ? 3 : -3 });
          hh.cmd(flip ? 'open_srv_manual' : 'close_srv_manual');
          hh.cmd('set_rcic', { active: flip });
        });
        h.run(300);
        ck('power remained physical', fmt(h.range('power_pct').max, 1) + '%', h.range('power_pct').max < 150, '< 150%');
        ck('pressure remained physical', fmt(h.range('vessel_pressure_mpa').min, 2) + '..' + fmt(h.range('vessel_pressure_mpa').max, 2),
          h.range('vessel_pressure_mpa').min > 0.05 && h.range('vessel_pressure_mpa').max < 9.5, '0.05..9.5');
        ck('no fuel damage', h.ts().melted, !h.ts().melted, 'false');
        ck.info('end state', (h.tripReason || 'no trip'));
        T.checkSanity(ck, h);
      });
    },

    // Same manual rod yank at 1× and 256× — protection evaluates per broadcast,
    // so acceleration delays the trip in sim time.
    abuse_accel_latency: function () {
      return test('ABUSE time-acceleration — rod yank at 1× vs 256×', function (ck) {
        function yank(accel) {
          var h = H('full_power', { accel: accel });
          h.run(10);
          h.run(180, function (hh) {
            hh.cmd('rod_start', { group_id: 'control_rods', direction: 1, speed: 'fast' });
          });
          return h;
        }
        var h1 = yank(1), h256 = yank(256);
        ck('1×: no damage', destroyed(h1.ts()), !destroyed(h1.ts()), 'false');
        ck.info('256×: intact?', destroyed(h256.ts()) ? 'MELTED @' + fmt(h256.meltTime, 0) + 's' : 'intact');
        ck.info('1× peak power', fmt(h1.range('power_pct').max, 1) + '%');
        ck.info('256× peak power', fmt(h256.range('power_pct').max, 1) + '%');
        ck.info('1× trip delay (s)', h1.tripTime != null ? fmt(h1.tripTime - 10, 1) : 'no trip');
        ck.info('256× trip delay (s)', h256.tripTime != null ? fmt(h256.tripTime - 10, 1) : 'no trip');
        T.checkSanity(ck, h1);
        T.checkSanity(ck, h256);
      });
    },

    abuse_scram_recover: function () {
      return test('ABUSE scram then withdraw — recovery path?', function (ck) {
        var h = H('full_power');
        h.run(10);
        h.cmd('scram');
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
    },
  };

  OPS.runAll = function () {
    var out = [];
    for (var k in OPS) if (k !== 'runAll' && typeof OPS[k] === 'function') out.push(OPS[k]());
    return out;
  };

  RD.OpsTestsBWR = OPS;

})(globalThis.RD || (globalThis.RD = {}));
