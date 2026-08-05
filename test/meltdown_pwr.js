/*
 * meltdown_pwr.js — PWR CORE-DAMAGE / MELTDOWN PATH BATTERY
 * (spec layer, run by test/run_meltdown.js).
 *
 * Motivation: an owner playtest tried to reach a core melt by several routes and
 * found "all meltdown paths have major issues." This battery pins the *physically
 * correct endpoint* of each classic path to core damage in a PWR, so the ones that
 * are broken show up as concrete reds (strict XFAIL, same convention as
 * run_behavior / run_procedures) and flip green the moment the physics is fixed.
 *
 * The damage model (engines/pwr/pwr_thermal.js:checkDamage) is a pure fuel-temp
 * endpoint: fuel_temp_c > 1200 °C ⇒ fuel_damaged (clad failure); > 2800 °C ⇒
 * melted, destruction_cause = 'thermal_melt'. Every probe below drives the engine
 * to the point where a real plant would (or would not) reach those thresholds and
 * asserts the outcome.
 *
 * Level: engine-direct, via the same deterministic Harness that run_pwr's
 * flagship_tmi uses (RD.PWRScenarioTests.Harness) — autoM4 emulates the mechanical
 * protections (PZR/SG relief + turbine trip) but NOT the auto-ECCS actuation, so a
 * probe controls recovery explicitly (set_hpi, degraded_hpi, etc.). Deterministic,
 * no instrument noise in the control path — the right level for a physics endpoint.
 *
 * XFAIL (strict): a path whose CORRECT endpoint the engine does not yet produce.
 * The entry names the root cause (file:line). When the physics is fixed the probe
 * passes and the runner reddens (XPASS) until the entry is removed — so the list
 * can only shrink honestly.
 */
;(function (RD) {
  'use strict';

  var T = RD.OpsTest, test = T.test, fmt = T.fmt;
  var Harness = RD.PWRScenarioTests.Harness;

  var DMG = 1200, MELT = 2800;

  // Drive a set-up harness up to maxSec (coarse 5 s steps), tracking the peaks a
  // damage endpoint cares about. Stops early on melt. Returns a summary.
  function driveDamage(h, maxSec) {
    var maxFuel = 0, minInv = 1e9, maxTavg = 0, damagedAt = -1, meltAt = -1, t, elapsed = 0;
    var n = Math.round(maxSec / 5);
    for (var i = 0; i < n; i++) {
      h.run(5); elapsed += 5;
      t = h.ts();
      if (t.fuel_temp_c > maxFuel) maxFuel = t.fuel_temp_c;
      if (t.core_inventory_pct < minInv) minInv = t.core_inventory_pct;
      if (t.tavg_c > maxTavg) maxTavg = t.tavg_c;
      if (damagedAt < 0 && t.fuel_damaged) damagedAt = elapsed;
      if (meltAt < 0 && t.melted) meltAt = elapsed;
      if (t.melted) break;
    }
    return {
      maxFuel: maxFuel, minInv: minInv, maxTavg: maxTavg,
      damagedAt: damagedAt, meltAt: meltAt, elapsed: elapsed,
      t: t, s: h.eng.s,
    };
  }

  // Record the standard set of endpoint measurements (never fail — for the report).
  function recordEndpoint(ck, r) {
    ck.info('peak fuel temp (°C)', fmt(r.maxFuel, 0));
    ck.info('min core inventory (%)', fmt(r.minInv, 1));
    ck.info('peak Tavg (°C)', fmt(r.maxTavg, 0));
    ck.info('fuel damaged at (s)', r.damagedAt < 0 ? 'never' : r.damagedAt);
    ck.info('melted at (s)', r.meltAt < 0 ? 'never' : r.meltAt);
    ck.info('destruction_cause (getTrueState)', String(r.t.destruction_cause));
    ck.info('destruction_cause (engine.s)', String(r.s.destruction_cause));
  }

  // ------------------------------------------------------------- XFAIL (strict)
  // id → root cause of the wrong endpoint (the fix that will re-green it).
  // MD-5 fixed 2026-07-24 (decay-heat term made scram-agnostic, pwr_engine.js:248).
  // MD-7 fixed 2026-07-24 (destruction_cause exposed in getTrueState).
  // MD-8 reframed 2026-07-24 to assert the intended depressurize-to-flood recovery
  //   (it was a test-premise issue + a documented simplification, not a bug).
  // MD-6 fixed 2026-07-24: time-dependent dryout DEPLETION — a dry AND UNFED bundle
  //   boils its residual film off (sg_dryout_deplete_tau), so a sustained total loss
  //   of feed+AFW genuinely loses the heat sink; any feed (AFW) rewets, which keeps
  //   the recoverable-MFW-loss dip (TR-2) at the full residual. Structural fix in
  //   pwr_steam_generator.stepSecondary + pwr_thermal.stepCoolant.
  var XFAIL = {};

  var PROBES = {

    // ============================================================ working paths

    // MD-1 — Large-break cold-leg LOCA with no ECCS. The core uncovers, heat
    // transfer collapses, decay heat drives the fuel to melt. This path WORKS.
    'MD-1': function () {
      return test('MD-1 Large-break LOCA, no ECCS → core melt', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(10);
        h.cmd({ action: 'scram' });
        h.cmd({ action: 'inject_failure', failure_id: 'large_loca', severity: 1.0 });
        h.cmd({ action: 'inject_failure', failure_id: 'degraded_hpi', severity: 1.0 });
        h.cmd({ action: 'set_hpi', active: false });
        var r = driveDamage(h, 3000);
        recordEndpoint(ck, r);
        ck('core uncovers (min inventory < 50 %)', fmt(r.minInv, 1), r.minInv < 50, '< 50');
        ck('fuel is damaged (> 1200 °C)', fmt(r.maxFuel, 0), r.damagedAt >= 0, '> 1200 °C');
        ck('core melts (> 2800 °C)', fmt(r.maxFuel, 0), r.t.melted === true, 'melted');
      });
    },

    // MD-2 — Small-break LOCA (the TMI-2 signature: stuck-open PORV) with failed
    // HPI recovery. Slow inventory bleed → uncovery → damage → melt. This path
    // WORKS (it is the flagship). Here we drive it all the way to melt.
    'MD-2': function () {
      return test('MD-2 Small-break LOCA (stuck PORV), no HPI → core melt', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(10);
        h.cmd({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
        h.runUntil(function (ts, ins) { return ins.sg_level <= 12; }, 600);
        h.cmd({ action: 'scram' });
        h.runUntil(function (ts, ins) { return ins.primary_pressure >= 16.20; }, 60);
        h.cmd({ action: 'open_porv' });
        h.cmd({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
        h.cmd({ action: 'set_hpi', active: false });
        var r = driveDamage(h, 6000);
        recordEndpoint(ck, r);
        ck('PORV truly stuck open', String(r.t.porv_open), r.t.porv_open === true, 'true');
        ck('core uncovers (min inventory < 50 %)', fmt(r.minInv, 1), r.minInv < 50, '< 50');
        ck('fuel is damaged (> 1200 °C)', fmt(r.maxFuel, 0), r.damagedAt >= 0, '> 1200 °C');
        ck('core melts (> 2800 °C)', fmt(r.maxFuel, 0), r.t.melted === true, 'melted');
      });
    },

    // MD-3 — Station blackout: loss of all AC (pumps coast, no feed, no ECCS).
    // Decay heat with no removal → slow boil-off → uncovery → melt. WORKS.
    'MD-3': function () {
      return test('MD-3 Station blackout → core melt', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(10);
        h.cmd({ action: 'scram' });
        h.cmd({ action: 'inject_failure', failure_id: 'station_blackout' });
        // HORIZON 7000 -> 15000 s for the #364 decay refit (2026-08-05). NOT a re-band to
        // fit a change: the CLAIM (this casualty destroys the core) is unaltered and still
        // true — what moved is how long the plant takes, because it no longer carries ~2.4x
        // the real decay heat. MEASURED on the corrected curve: damage at 9510 s (2.6 h),
        // melt at 12340 s (3.4 h), against the old plant's sub-2 h. The new timing is the
        // MORE prototypical one — TMI-2's core damage began around 2.5 h — so this is the
        // window catching up to a better plant, not a weakened assertion.
        var r = driveDamage(h, 15000);
        recordEndpoint(ck, r);
        ck('fuel is damaged (> 1200 °C)', fmt(r.maxFuel, 0), r.damagedAt >= 0, '> 1200 °C');
        ck('core melts (> 2800 °C)', fmt(r.maxFuel, 0), r.t.melted === true, 'melted');
      });
    },

    // MD-4 — Negative control (known good): the TMI small-break, but HPI runs to
    // make up the bleed. ECCS keeps the core covered → no damage. Proves the damage
    // model is not one-way and the recovery path works for a break HPI can match.
    // (This mirrors the flagship_tmi recovery branch in run_pwr.)
    'MD-4': function () {
      return test('MD-4 Small-break LOCA (stuck PORV) WITH HPI → core protected', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(10);
        h.cmd({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
        h.runUntil(function (ts, ins) { return ins.sg_level <= 12; }, 600);
        h.cmd({ action: 'scram' });
        h.runUntil(function (ts, ins) { return ins.primary_pressure >= 16.20; }, 60);
        h.cmd({ action: 'open_porv' });
        h.cmd({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
        h.cmd({ action: 'set_hpi', active: true });   // the recovery HPI makes up the bleed
        var r = driveDamage(h, 3000);
        recordEndpoint(ck, r);
        ck('HPI holds the core covered (min inventory > 50 %)', fmt(r.minInv, 1), r.minInv > 50, '> 50');
        ck('fuel stays intact (< 1200 °C)', fmt(r.maxFuel, 0), r.t.fuel_damaged === false, '< 1200 °C');
        ck('core does not melt', String(r.t.melted), r.t.melted === false, 'false');
      });
    },

    // ============================================================= broken paths

    // MD-5 — ATWS (failure to scram) coincident with a large LOCA. The reactor is
    // never scrammed; fission collapses only when the core uncovers and loses its
    // moderator. This is the WORST real accident (full-power core + no coolant).
    // Was benign (fuel froze at ~1250 °C) because decay heat was gated on the scram
    // flag; FIXED 2026-07-24 (decay term made scram-agnostic, pwr_engine.js:248) —
    // the uncovered core now heats to melt as it must. Correct endpoint: melt.
    'MD-5': function () {
      return test('MD-5 ATWS + large LOCA (no scram, no ECCS) → core melt', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(10);
        h.cmd({ action: 'inject_failure', failure_id: 'failure_to_scram' });
        h.cmd({ action: 'inject_failure', failure_id: 'large_loca', severity: 1.0 });
        h.cmd({ action: 'inject_failure', failure_id: 'degraded_hpi', severity: 1.0 });
        h.cmd({ action: 'set_hpi', active: false });
        var r = driveDamage(h, 4000);
        recordEndpoint(ck, r);
        ck('core uncovers (min inventory < 50 %)', fmt(r.minInv, 1), r.minInv < 50, '< 50');
        ck('fuel is damaged (> 1200 °C)', fmt(r.maxFuel, 0), r.damagedAt >= 0, '> 1200 °C');
        // The bug: fuel plateaus (decay heat switched off with no scram) instead of
        // continuing to heat to melt. This is the assertion that documents it.
        ck('core melts (> 2800 °C) — worst case must not be benign', fmt(r.maxFuel, 0),
          r.t.melted === true, 'melted');
      });
    },

    // MD-6 — Total loss of the secondary heat sink: main feed AND aux feed lost,
    // no makeup, PORV/safeties intact. A real plant heats to the PZR safeties,
    // relieves, boils the primary down, uncovers, and damages the core (TMI-2
    // without the recovery). The engine parks the primary at ~297 °C indefinitely
    // because a fully dry SG still removes the whole decay-heat load. Correct
    // endpoint: the primary heats toward saturation and the core is eventually
    // damaged. (XFAIL MD-6.)
    'MD-6': function () {
      return test('MD-6 Total loss of heat sink (MFW+AFW), no makeup → core damage', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(10);
        h.cmd({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
        h.cmd({ action: 'inject_failure', failure_id: 'afw_failure' });
        h.cmd({ action: 'scram' });
        h.cmd({ action: 'set_hpi', active: false });
        // HORIZON 8000 -> 15000 s, #364 decay refit. Same reasoning as MD-3: the claim is
        // unchanged and MEASURED damage moved to 8635 s (2.4 h), melt 11405 s.
        var r = driveDamage(h, 15000);
        recordEndpoint(ck, r);
        // A dry SG is not a heat sink: with decay heat and no removal the primary
        // must climb toward saturation (Tsat(15.41 MPa) ≈ 345 °C), not sit at 297.
        ck('primary heats toward saturation (peak Tavg > 320 °C)', fmt(r.maxTavg, 0),
          r.maxTavg > 320, '> 320 °C');
        ck('core is eventually damaged (> 1200 °C)', fmt(r.maxFuel, 0),
          r.damagedAt >= 0, '> 1200 °C');
      });
    },

    // MD-7 — Outcome hook: on a confirmed melt the operator-facing true-state must
    // report WHY the core was lost. destruction_cause was set on the engine state
    // but not surfaced by getTrueState (scenario grading read undefined); FIXED
    // 2026-07-24 (exposed in the getTrueState return).
    'MD-7': function () {
      return test('MD-7 melt reports destruction_cause via getTrueState', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(10);
        h.cmd({ action: 'scram' });
        h.cmd({ action: 'inject_failure', failure_id: 'large_loca', severity: 1.0 });
        h.cmd({ action: 'inject_failure', failure_id: 'degraded_hpi', severity: 1.0 });
        h.cmd({ action: 'set_hpi', active: false });
        var r = driveDamage(h, 3000);
        recordEndpoint(ck, r);
        ck('the core actually melted (precondition)', String(r.t.melted), r.t.melted === true, 'true');
        ck('engine.s records the cause', String(r.s.destruction_cause),
          r.s.destruction_cause === 'thermal_melt', 'thermal_melt');
        ck('getTrueState surfaces the cause', String(r.t.destruction_cause),
          r.t.destruction_cause === 'thermal_melt', 'thermal_melt');
      });
    },

    // MD-8 — a small/intermediate LOCA must be SURVIVABLE with the correct operator
    // response. This plant deliberately holds a small break at high pressure (the
    // blowdown-cooling-vs-break-size model keeps decay heat pinning Psat above the
    // 4.14 MPa accumulator arming point — the TMI-2 inventory/void lesson), so HPI
    // alone can't quite hold it (delivers ~0.020 frac/s vs a ~0.025 leak): the core
    // slowly uncovers over ~19 min UNLESS the operator DEPRESSURIZES to arm the
    // accumulators/LPI (feed-and-bleed — exactly the EOP TMI operators missed). This
    // probe drives that intended recovery and asserts the core is protected across
    // the small→intermediate band. The PASSIVE outcomes are recorded as info: they
    // are NON-MONOTONIC (a small break damages while a medium one self-depressurizes
    // and refloods) — a known simplification of the lumped HPI curve, flagged for
    // owner review (TUNING_LOG §3.4 MD-8 note), not asserted here.
    'MD-8': function () {
      return test('MD-8 Small/intermediate LOCA survivable via depressurize-to-flood (EOP)', function (ck) {
        function run(sev, cap, depressurize) {
          var h = new Harness('hot_full_power');
          h.run(10);
          h.cmd({ action: 'scram' });
          h.cmd({ action: 'inject_failure', failure_id: 'large_loca', severity: sev });
          h.cmd({ action: 'set_hpi', active: true });
          h.cmd({ action: 'open_accumulator_valve' });
          var maxFuel = 0, minInv = 1e9, t, elapsed = 0, n = Math.round(cap / 5);
          for (var i = 0; i < n; i++) {
            if (depressurize) h.cmd({ action: 'open_porv' });   // operator bleeds to arm ECCS
            h.run(5); elapsed += 5; t = h.ts();
            if (t.fuel_temp_c > maxFuel) maxFuel = t.fuel_temp_c;
            if (t.core_inventory_pct < minInv) minInv = t.core_inventory_pct;
            if (t.melted) break;
          }
          return { maxFuel: maxFuel, minInv: minInv, t: t };
        }
        // The assertion: with the depressurize-to-flood EOP, the small→intermediate
        // band is protected (accumulators + low-pressure injection carry it).
        [0.05, 0.10, 0.20].forEach(function (sev) {
          var r = run(sev, 2500, true);
          ck('sev ' + sev.toFixed(2) + ' survivable with depressurization (< 1200 °C)',
            fmt(r.maxFuel, 0), r.t.fuel_damaged === false, '< 1200 °C');
        });
        // Recorded (not asserted): the passive band — the known non-monotonic artifact.
        [0.05, 0.20, 1.00].forEach(function (sev) {
          var rr = run(sev, 1500, false);
          ck.info('PASSIVE sev ' + sev.toFixed(2) + ' → peak fuel / damaged',
            fmt(rr.maxFuel, 0) + ' °C / ' + rr.t.fuel_damaged);
        });
      });
    },

    // MD-9 — PARTIAL core uncovery, held (#213). The TMI-2 core was destroyed with
    // roughly its top half uncovered for under an hour: exposed cladding is steam-
    // cooled only and heats at decay-heat rates to clad failure (>1200 °C) while the
    // still-covered lower core keeps the BULK coolant unremarkable. The model's own
    // contract puts top-of-core uncovery at inventory < 70 % (core_top_uncover) —
    // so a core HELD between 50 % and 70 % must be damaged in tens of minutes, not
    // sit indefinitely at coolant temperature. Both branches stay strictly above
    // 50 % the whole way, so the pre-existing bulk heat-transfer collapse
    // (significant_uncover) can play no part in the outcome.
    'MD-9': function () {
      return test('MD-9 Partial uncovery held (inventory 50-70 %) → clad damage; prompt reflood → protected', function (ck) {
        function bleedTo(inv) {
          var h = new Harness('hot_full_power');
          h.run(10);
          h.cmd({ action: 'scram' });
          h.cmd({ action: 'open_porv' });
          h.cmd({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
          h.cmd({ action: 'set_hpi', active: false });
          var t = h.runUntil(function (ts) { return ts.core_inventory_pct <= inv; }, 20000);
          h.cmd({ action: 'close_block_valve' });   // isolate the bleed — inventory now holds
          return { h: h, reachedAt: t };
        }
        // Damage branch: hold at ~60 % (top of core uncovered, bottom covered) for 2 h.
        var b = bleedTo(60);
        ck('bleed reaches the partial band (precondition)', fmt(b.h.ts().core_inventory_pct, 1),
          b.reachedAt >= 0, '≤ 60 %');
        var r = driveDamage(b.h, 7200);
        recordEndpoint(ck, r);
        ck('inventory stays PARTIAL throughout (> 50 %)', fmt(r.minInv, 1), r.minInv > 50, '> 50');
        ck('held partial uncovery damages the core (> 1200 °C)',
          r.damagedAt < 0 ? 'never' : r.damagedAt + ' s', r.damagedAt >= 0, 'damaged in tens of minutes');
        ck('damage arrives on a TMI timescale (< 90 min)',
          r.damagedAt < 0 ? 'never' : r.damagedAt + ' s', r.damagedAt >= 0 && r.damagedAt < 5400, '< 5400 s');
        // Recovery branch: same bleed, but HPI restored immediately — the core
        // refloods above top-of-core before the exposed clad can fail.
        var g = bleedTo(65);
        g.h.cmd({ action: 'set_hpi', active: true });
        var rr = driveDamage(g.h, 3600);
        recordEndpoint(ck, rr);
        ck('reflood recovers the core (inventory back > 70 %)', fmt(rr.t.core_inventory_pct, 1),
          rr.t.core_inventory_pct > 70, '> 70');
        ck('prompt reflood → no damage', fmt(rr.maxFuel, 0), rr.t.fuel_damaged === false, '< 1200 °C');
      });
    },

    // MD-10 — FEED AND BLEED, the recovery MD-6 does not have (#154 item 9). MD-6
    // is the total loss of the secondary heat sink taken to core damage; the
    // trained response is to make a heat sink out of the PRIMARY — open the PORV
    // (bleed) and run high-pressure injection (feed), carrying decay heat away as
    // subcooled water in and hot water out. Same shape as MD-4's negative control:
    // identical casualty, correct operator action, core saved. Without it the
    // suite proved only that the plant CAN be lost this way.
    'MD-10': function () {
      return test('MD-10 Total loss of heat sink WITH feed and bleed → core protected', function (ck) {
        function lossOfHeatSink() {
          var h = new Harness('hot_full_power');
          h.run(10);
          h.cmd({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
          h.cmd({ action: 'inject_failure', failure_id: 'afw_failure' });
          h.cmd({ action: 'scram' });
          return h;
        }
        // Control: the MD-6 casualty with no operator action. Re-established here
        // rather than assumed, so the comparison below is against a MEASURED
        // outcome on today's plant, not against MD-6's recorded numbers.
        var lost = lossOfHeatSink();
        lost.cmd({ action: 'set_hpi', active: false });
        // 8000 -> 15000 s, #364: this is MD-6's casualty, damaged at 8635 s on the
        // corrected decay curve.
        var rl = driveDamage(lost, 15000);
        ck('control — no action, the core is damaged (the MD-6 endpoint)',
          rl.damagedAt < 0 ? 'never' : rl.damagedAt + ' s', rl.damagedAt >= 0, 'damaged');
        // Recovery: bleed through the PORV, feed with HPI. The block valve stays
        // OPEN — closing it is the TMI-2 recovery for a STUCK valve and exactly the
        // wrong action here, where the open path IS the heat sink.
        var h = lossOfHeatSink();
        h.cmd({ action: 'open_porv' });
        h.cmd({ action: 'set_hpi', active: true });
        // 8000 -> 15000 s with the control leg, so "protected" is asserted over the same
        // window the unmitigated case is destroyed in — otherwise the comparison shortens.
        var r = driveDamage(h, 15000);
        recordEndpoint(ck, r);
        ck('feed and bleed protects the core', fmt(r.maxFuel, 0) + ' °C peak fuel',
          r.t.fuel_damaged === false, 'no damage (< 1200 °C)');
        ck('…and it never melts', r.meltAt < 0 ? 'never' : r.meltAt + ' s', r.meltAt < 0, 'never');
        ck('inventory is HELD by the injection, not merely drained slower',
          fmt(r.minInv, 1) + ' % minimum', r.minInv > 50, '> 50 %');
        ck('the bleed path carried heat — primary stayed below the unmitigated peak',
          fmt(r.maxTavg, 0) + ' vs ' + fmt(rl.maxTavg, 0) + ' °C unmitigated',
          r.maxTavg < rl.maxTavg, '< ' + fmt(rl.maxTavg, 0) + ' °C');
      });
    },


    /* MD-11 — ZIRCONIUM-STEAM OXIDATION: the escalation must ACCELERATE (#238).
     *
     * This is the character claim, and it is the one that was wrong. With decay heat as
     * the only source the hot node heats MORE SLOWLY as it climbs, because decay heat is
     * falling: measured before the term was added, MD-1 crossed 1200 → 2800 °C in 22.7 min
     * while decay heat fell 6.7 % → 4.5 %, and every 500 °C band took LONGER than the one
     * below it. Real severe accidents do the opposite — above ~2200 °F the oxidation heat
     * takes over and the core makes its own escalation.
     *
     * WHY THIS PROBE AND NOT A TIMING BAND: the whole suite was green with the term absent
     * and green with it in, because the MD-* paths assert THAT the core melts, never how
     * fast or in what direction the rate is going. A band on damage→melt would pin one
     * tuning; asserting the SECOND DERIVATIVE pins the mechanism.
     *
     * The anchor check is computed from config, not transcribed, so it follows a re-fit of
     * the decay groups instead of silently going stale.
     */
    'MD-11': function () {
      return test('MD-11 Zr-steam oxidation — the escalation ACCELERATES, and the anchor is sourced', function (ck) {
        var T = RD.PWR_CONFIG.thermal, z = T.zirc || {}, d = RD.PWR_CONFIG.kinetics.decay;
        ck('the oxidation term is configured at all', z.q_ref ? 'yes' : 'MISSING', !!z.q_ref, 'present');

        // ---- the sourced anchor: at 2200 °F the oxidation heat equals the 8-hour decay heat.
        // q_ox at the reference oxide (w = 1) and the reference temperature is q_ref by
        // construction, so what this really checks is that q_ref still MATCHES this plant's
        // own decay curve — the thing that breaks if the decay groups are re-fitted.
        // SUMS EVERY GROUP THE CONFIG DECLARES, discovered by key rather than transcribed.
        // This was a hardcoded TWO-group copy of the decay law until 2026-08-05, and #364's
        // refit to four groups walked straight into it: groups 3 and 4 were simply not in the
        // sum, so the check read this plant's 8-hour decay heat as 0.0000 % and failed against
        // a q_ref that was in fact correct. A formula copied into a consumer does not move
        // when the source does (#315) — and the comment three lines above promises this
        // "tracks the decay groups instead of silently going stale", which is precisely what
        // it stopped doing. Written so a fifth group needs no edit here.
        var decay8h = 0;
        for (var gi = 1; d['H' + gi + '_0'] != null; gi++) {
          decay8h += d['H' + gi + '_0'] * Math.exp(-d['lambda_' + gi] * 8 * 3600);
        }
        ck('anchor: oxidation heat at ' + z.ref_temp_c + ' °C = this plant\'s 8-hour decay heat',
          fmt(z.q_ref * 100, 4) + ' % vs ' + fmt(decay8h * 100, 4) + ' %',
          Math.abs(z.q_ref - decay8h) / decay8h < 0.02, 'within 2 %');
        ck('the reference temperature is the 10 CFR 50.46 limit (2200 °F)',
          z.ref_temp_c + ' °C = ' + fmt(z.ref_temp_c * 9 / 5 + 32, 0) + ' °F',
          Math.abs(z.ref_temp_c * 9 / 5 + 32 - 2200) < 10, '2200 °F ± 10');

        // ---- the character. Deeply-uncovered core, no ECCS: time each 400 °C band and
        // require the LATER bands to be SHORTER. On decay heat alone they lengthen.
        var h = new Harness('hot_full_power');
        h.run(10);
        h.cmd({ action: 'set_eccs_armed', armed: false });
        h.cmd({ action: 'inject_failure', failure_id: 'large_loca', severity: 1.0 });
        var MARKS = [1200, 1600, 2000, 2400, 2800], at = {}, t = 0;
        for (var i = 0; i < 3000 && t < 12000; i++) {
          h.run(2); t += 2;
          var c = h.eng.s.clad_temp_c;
          for (var m = 0; m < MARKS.length; m++) if (at[MARKS[m]] == null && c >= MARKS[m]) at[MARKS[m]] = t;
          if (at[2800] != null) break;
        }
        var reached = MARKS.filter(function (x) { return at[x] != null; });
        ck('the core reaches melt on an unmitigated large break',
          reached.length + '/' + MARKS.length + ' marks', at[2800] != null, 'all 5');
        if (at[2800] == null) return;
        var b1 = at[1600] - at[1200], b2 = at[2000] - at[1600], b3 = at[2400] - at[2000], b4 = at[2800] - at[2400];
        ck('bands (s): 1200→1600, →2000, →2400, →2800',
          [b1, b2, b3, b4].map(function (x) { return fmt(x, 0); }).join(' / '), true, 'recorded');
        // The mechanism: once oxidation is in control, each successive 400 °C band is crossed
        // FASTER than the last. Asserted from band 2 on, and the exclusion of band 1 is a
        // finding rather than a concession.
        //
        // RE-AUTHORED FOR #364 (2026-08-05), which is an HR10 adjudication and not a re-band
        // to fit a change. The old form required all four bands to decrease strictly, and on
        // the corrected decay curve they read 362 / 404 / 182 / 84 — band 2 SLOWER than
        // band 1. That is the real shape of a two-source heat balance: the bottom band still
        // gets substantial help from decay heat, the next one has less decay heat while
        // oxidation has not yet taken over, and only then does the Arrhenius term run away.
        // The old plant hid the dip because it carried ~2.4x the decay heat (#364), so the
        // decay term dominated far enough up the ladder to keep the sequence monotonic —
        // i.e. the strictly-decreasing form was PINNING THE OLD DEFECT, not the mechanism.
        // The claim in this probe's title is unchanged and is still what is tested.
        // It also holds on the pre-#364 plant: the bands recorded for it are 184 / 172 / 86 /
        // 40, which decrease from band 2 as well — so this is a better test rather than a
        // refitted one. And the no-oxidation case still reddens it: MEASURED on this curve,
        // q_ref = 0 gives 434 / 932 / 1230 / 1396, INCREASING across exactly the bands now
        // under assertion. (The pre-#364 no-oxidation figures were 218 / 334 / 378 / 428 —
        // same direction, different magnitudes, because the decay curve underneath moved.)
        ck('the escalation ACCELERATES once oxidation is in control (bands 2→3→4)',
          b1 + ' | ' + b2 + ' > ' + b3 + ' > ' + b4,
          b3 < b2 && b4 < b3, 'strictly decreasing from band 2');
        // …and by a margin that could not come from decay heat drifting.
        ck('the top band is far faster than the bottom one, not marginally',
          fmt(b1 / Math.max(b4, 1e-9), 1) + '×', (b1 / Math.max(b4, 1e-9)) > 3, '> 3×');

        // ---- self-limiting: the oxide is monotonic, so a re-wetted node that dries again
        // oxidises more slowly. This is what the parabolic law buys and why there is a state.
        ck('the oxide layer only ever grows (it cannot un-oxidise)',
          fmt(h.eng.s._zr_ox2, 2), h.eng.s._zr_ox2 > 0, '> 0');
      });
    },

    /* MD-12 — PAST MELT, THE CORE-MATERIAL NODES STOP INTEGRATING (#326).
     *
     * `melted` is the end of this model's declared validity. Before the fix both nodes
     * kept integrating past it, in two DIFFERENT ways, and neither had a termination
     * condition — measured full stack on this same path, at 2 plant-hours:
     *
     *   fuel_temp_c  5032 °C (9089 °F)      — pure integrator: hFcEffective returns 0 on a
     *                                          fully uncovered core, so dTf loses its sink
     *   clad_temp_c  355 618 °C (640 144 °F) — Arrhenius oxidation feedback, q_ox reaching
     *                                          1095 % OF RATED on a 4 % decay tail
     *
     * WHY THIS PROBE AND NOT A CEILING: a clamp would hide the runaway at whatever number
     * the clamp is, and the suite would then be pinning the clamp. What is actually being
     * asserted is that nothing MOVES once the run is over — which is falsifiable in one
     * direction only and cannot be satisfied by a tuning.
     *
     * The clad leg is the load-bearing one. Before #326 the clad node was a FOLLOWER of
     * the fuel node (the lower clamp at pwr_thermal.js) and freezing stepFuel alone would
     * have looked sufficient; with the #238 oxidation term it runs away on its own and
     * sits ABOVE the fuel node — measured 2308 °C against 1852 °C at 20 min. So a fix on
     * stepFuel alone leaves the larger half of the defect standing, and this probe says so.
     */
    'MD-12': function () {
      return test('MD-12 past melt, the thermal nodes stop integrating (#326)', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(10);
        h.cmd({ action: 'set_eccs_armed', armed: false });
        h.cmd({ action: 'inject_failure', failure_id: 'large_loca', severity: 1.0 });

        // Run to melt, then capture the endpoint the model is entitled to reach.
        var t = 0;
        for (var i = 0; i < 4000 && t < 16000; i++) {
          h.run(2); t += 2;
          if (h.eng.s.melted) break;
        }
        ck('the core melts on an unmitigated large break', h.eng.s.melted ? 'melted' : 'no',
          h.eng.s.melted === true, 'melted');
        if (!h.eng.s.melted) return;

        var atMeltFuel = h.eng.s.fuel_temp_c, atMeltClad = h.eng.s.clad_temp_c;
        var meltT = t;
        ck('endpoint at melt (°C): fuel / clad',
          fmt(atMeltFuel, 0) + ' / ' + fmt(atMeltClad, 0), true, 'recorded');
        // The endpoint must still be a sane core temperature — i.e. the freeze happens AT
        // melt and not after a decade of runaway. fuel_melt_c is 2800; allow the overshoot
        // of a single step plus the clamp, not an order of magnitude.
        ck('melt is declared at a physical temperature, not after a runaway',
          fmt(Math.max(atMeltFuel, atMeltClad), 0) + ' °C',
          Math.max(atMeltFuel, atMeltClad) < 4000, '< 4000 °C');

        // ---- ride a further plant-hour past melt. NOTHING may move.
        h.run(3600);
        var dFuel = Math.abs(h.eng.s.fuel_temp_c - atMeltFuel);
        var dClad = Math.abs(h.eng.s.clad_temp_c - atMeltClad);
        ck('one plant-hour past melt: fuel node has not moved',
          fmt(dFuel, 3) + ' °C drift', dFuel < 0.01, '< 0.01 °C');
        // THE LOAD-BEARING LEG. Pre-#326 this drifted by ~350 000 °C; freezing stepFuel
        // alone still leaves it drifting, because the oxidation term is this node's own.
        ck('one plant-hour past melt: clad node has not moved',
          fmt(dClad, 3) + ' °C drift', dClad < 0.01, '< 0.01 °C');
        ck('the clad node is still a physical number an hour later',
          fmt(h.eng.s.clad_temp_c, 0) + ' °C (' + fmt(h.eng.s.clad_temp_c * 9 / 5 + 32, 0) + ' °F)',
          h.eng.s.clad_temp_c < 4000, '< 4000 °C');
        // The oxidation heat is a published true_state field (Physics tab) — it must not
        // be left reading a four-digit percentage of rated on a frozen core either.
        ck('published oxidation heat stays a plausible fraction of rated',
          fmt(h.eng.s.zirc_heat_pct, 1) + ' % of rated',
          h.eng.s.zirc_heat_pct < 100, '< 100 %');
        ck('the run is still flagged melted an hour on (the freeze does not clear it)',
          String(h.eng.s.melted), h.eng.s.melted === true, 'true');
        ck('melt was reached in a plausible time, so the freeze did not pre-empt the path',
          fmt(meltT / 60, 1) + ' min', meltT > 60 && meltT < 14400, '1 min .. 4 h');
      });
    },

  };

  function runAll() {
    return Object.keys(PROBES).map(function (id) {
      var r = PROBES[id](); r.id = id; return r;
    });
  }

  RD.MeltdownPWR = { probes: PROBES, XFAIL: XFAIL, runAll: runAll };

})(globalThis.RD || (globalThis.RD = {}));
