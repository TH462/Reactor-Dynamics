/*
 * run_meltdown_stack.js — DOES THE PLANT SAVE ITSELF?
 *
 * The counterpart to run_meltdown.js. That battery is deliberately engine-direct
 * (see its header) and it is right to be: it pins the PHYSICS endpoint of each
 * core-damage path, deterministically, with no instrument noise in the control
 * path. But two of its probes are not physics claims at all — they are PROTECTION
 * claims:
 *
 *   MD-4  "small-break LOCA (stuck PORV) WITH HPI -> core protected"
 *   MD-8  "small/intermediate LOCA survivable via depressurize-to-flood (EOP)"
 *
 * and both are proven with the operator hand-setting everything, because
 * `run_meltdown.js` does not load the control layer at all — no RPS, no ESF
 * actuation. MD-4 hand-scrams and hand-starts HPI. MD-8 hand-scrams, hand-starts
 * HPI, hand-opens the accumulators, and hand-bleeds.
 *
 * In the shipped plant NOBODY hand-starts HPI. M4 scrams on the low-pressure /
 * low-level instruments and actuates SI at 12.4 MPa off the HPI ESF arm. So a
 * regression in an SI setpoint, an ESF arm, or the P-11 permissive would convert a
 * documented-survivable path into a melt for every real player while run_meltdown
 * stayed 8/8 — and nothing else would catch it either, since run_pwr's ECCS suites
 * also command injection by hand (issue #209).
 *
 * THIS runner therefore asserts the opposite thing: cause the casualty, then TAKE
 * YOUR HANDS OFF, and require that the automatic chain fires and produces the
 * correct endpoint. It checks not just the endpoint but that the protection
 * ACTUALLY ACTED unprompted — scram without a manual scram, `hpi_active` without a
 * `set_hpi`. An endpoint that comes out right for the wrong reason is the failure
 * mode this is built to catch.
 *
 *   node test/run_meltdown_stack.js            all paths
 *   node test/run_meltdown_stack.js MDS-1      one by id
 *
 * Level: FULL STACK (M4+M5+M6) on the shipped free-play lineup, via
 * SimulationService — the plant a player is actually handed. Runs at 10x so the
 * RPS/alarm evaluation granularity is ~1 s (the #153 acceleration-latency effect);
 * these casualties develop over minutes, so that is not material, but a probe that
 * ever depends on sub-second protection timing must say so.
 */
'use strict';
var path = require('path');
var C = '\x1b[36m', G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', Y = '\x1b[33m', X = '\x1b[0m';

function load(p) { require(path.join(__dirname, '..', p)); }
[
  'engines/load_mode.js',
  'engines/pwr/pwr_config.js',
  'layers/control/pwr_control.js',
  'engines/pwr/pwr_thermal.js',
  'engines/pwr/pwr_pressurizer.js',
  'engines/pwr/pwr_primary.js',
  'engines/pwr/pwr_steam_generator.js',
  'engines/pwr/pwr_instruments.js',
  'engines/pwr/pwr_engine.js',
  'layers/control/control_kernel.js',      // <- the whole point: run_meltdown omits this
  'layers/instructor_layer.js',
  'layers/simulation_service.js',
].forEach(load);
var RD = globalThis.RD;

var DMG = 1200;
var ACCEL = 10, SEC_PER_TICK = 1.0;   // 10x * 100 ms broadcast = 1 s of sim per tick

function mkSvc(initial) {
  var svc = new RD.SimulationService({ seed: 42 });
  svc.selectPlant('pwr', initial || 'hot_full_power', null);   // shipped lineup: defaults engaged
  svc.running = true;
  svc.timeAcceleration = ACCEL;
  return svc;
}

/* Drive hands-off for `seconds`, recording what the PLANT did on its own.
 * onTick may issue the one operator action a probe is deliberately testing
 * (e.g. the MD-8 bleed); everything else must stay untouched. */
function drive(svc, seconds, onTick) {
  var r = { maxFuel: 0, minInv: 1e9, damaged: false, melted: false,
            scramAt: -1, scramReason: null, hpiAt: -1, afwAt: -1, t: 0 };
  var n = Math.round(seconds / SEC_PER_TICK), snap = null;
  for (var i = 0; i < n; i++) {
    if (onTick) onTick(svc, r.t);
    snap = svc.tick();
    r.t += SEC_PER_TICK;
    if (!snap) continue;
    var ts = snap.true_state, ins = snap.instruments;
    if (ts.fuel_temp_c > r.maxFuel) r.maxFuel = ts.fuel_temp_c;
    if (ts.core_inventory_pct < r.minInv) r.minInv = ts.core_inventory_pct;
    if (ts.fuel_damaged) r.damaged = true;
    if (ts.melted) { r.melted = true; r.snap = snap; break; }
    if (r.scramAt < 0 && snap.rps_state && snap.rps_state.scrammed) {
      r.scramAt = r.t; r.scramReason = snap.rps_state.last_trip_reason || '?';
    }
    if (r.hpiAt < 0 && ins.hpi_active) r.hpiAt = r.t;
    if (r.afwAt < 0 && ts.afw_active) r.afwAt = r.t;
    // How long the core reports FULLY uncovered (no standing inventory). See MDS-3.
    if (ts.core_inventory_pct <= 0.05) r.uncoveredS = (r.uncoveredS || 0) + SEC_PER_TICK;
  }
  r.snap = snap || svc._assembleWithInstructor();
  r.ts = r.snap.true_state;
  return r;
}

var total = 0, passed = 0, xfails = 0, xpassBad = 0, suites = 0, suitesPass = 0;
var curChecks;
function ck(desc, obs, pass, expect) {
  curChecks.push({ d: desc, obs: obs, pass: !!pass, exp: expect });
}

/* Strict xfail: same convention as run_meltdown / run_behavior / run_procedures_stack.
 * An entry reports yellow and does not redden the gate; if the underlying defect is
 * FIXED the check XPASSes and the gate goes RED so the entry cannot rot. */
var KNOWN_FAILS = {
};

var PATHS = {

  /* MD-4's protection claim, hands off. The operator causes the casualty and then
   * does NOTHING: no scram, no HPI, no AFW. The plant must trip itself on the
   * instruments and inject on the low-pressure SI signal. */
  'MDS-1': function () {
    var svc = mkSvc();
    var cmds = 0, send = function (c) { cmds++; return svc.handleCommand(c); };
    drive(svc, 10);
    send({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
    // Let the SG boil down far enough that the level trip is the thing that scrams
    // it — hands off from here.
    var pre = drive(svc, 900);
    send({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
    var r = drive(svc, 3000);
    var setupCmds = cmds;

    ck('the plant scrammed ITSELF (no manual scram)',
       pre.scramAt >= 0 ? 'at ' + pre.scramAt.toFixed(0) + ' s — ' + pre.scramReason
                        : (r.scramAt >= 0 ? 'at ' + r.scramAt.toFixed(0) + ' s — ' + r.scramReason : 'never'),
       pre.scramAt >= 0 || r.scramAt >= 0, 'scrammed');
    ck('AFW started ITSELF on low SG level',
       pre.afwAt >= 0 ? 'at ' + pre.afwAt.toFixed(0) + ' s' : 'never', pre.afwAt >= 0, 'started');
    ck('SI/HPI actuated ITSELF on the depressurization (no set_hpi)',
       r.hpiAt >= 0 ? 'at ' + r.hpiAt.toFixed(0) + ' s' : 'never', r.hpiAt >= 0, 'actuated');
    ck('core stayed covered (min inventory > 50 %)', fmtN(r.minInv, 1), r.minInv > 50, '> 50');
    ck('fuel intact (< 1200 °C)', fmtN(r.maxFuel, 0), !r.damaged, '< 1200 °C');
    ck('core did not melt', String(r.melted), r.melted === false, 'false');
    ck('operator issued ONLY the casualty injections', String(setupCmds), setupCmds === 2, '2');
  },

  /* MD-8's protection claim with a real control layer: the operator performs ONLY
   * the EOP action the path is about — bleeding to depressurize so low-head
   * injection can take. Scram and SI must come from the plant. */
  'MDS-2': function () {
    [0.05, 0.10, 0.20].forEach(function (sev) {
      var svc = mkSvc();
      drive(svc, 10);
      svc.handleCommand({ action: 'inject_failure', failure_id: 'large_loca', severity: sev });
      var r = drive(svc, 2500, function (s, t) {
        // The one authored operator action: bleed. Nothing else is touched — no
        // scram, no set_hpi, no accumulator command.
        if (t % 5 < 1e-9) s.handleCommand({ action: 'open_porv' });
      });
      ck('sev ' + sev.toFixed(2) + ': plant scrammed itself',
         r.scramAt >= 0 ? 'at ' + r.scramAt.toFixed(0) + ' s — ' + r.scramReason : 'never',
         r.scramAt >= 0, 'scrammed');
      ck('sev ' + sev.toFixed(2) + ': SI actuated itself (no set_hpi)',
         r.hpiAt >= 0 ? 'at ' + r.hpiAt.toFixed(0) + ' s' : 'never', r.hpiAt >= 0, 'actuated');
      ck('sev ' + sev.toFixed(2) + ': survivable with depressurization (< 1200 °C)',
         fmtN(r.maxFuel, 0), !r.damaged, '< 1200 °C');
    });
  },

  /* The unattended baseline: a small LOCA with NOBODY doing anything at all, not
   * even the EOP. This is the honest control for MDS-2 — if the plant survives a
   * total walkaway, MDS-2's depressurization proves nothing. Whatever the endpoint
   * is, it is pinned here so a change in it has to be acknowledged. */
  'MDS-3': function () {
    var svc = mkSvc();
    var cmds = 0;
    drive(svc, 10);
    cmds++; svc.handleCommand({ action: 'inject_failure', failure_id: 'large_loca', severity: 0.10 });
    var r = drive(svc, 2500);
    ck('walkaway: the plant still scrammed itself',
       r.scramAt >= 0 ? 'at ' + r.scramAt.toFixed(0) + ' s — ' + r.scramReason : 'never',
       r.scramAt >= 0, 'scrammed');
    ck('walkaway: SI still actuated itself',
       r.hpiAt >= 0 ? 'at ' + r.hpiAt.toFixed(0) + ' s' : 'never', r.hpiAt >= 0, 'actuated');
    ck('operator issued ONLY the casualty injection', String(cmds), cmds === 1, '1');
    // Endpoint deliberately RECORDED, not demanded: this probe exists to make the
    // walkaway outcome VISIBLE and stable, not to claim it is right.
    ck('endpoint pinned: fuel ' + (r.damaged ? 'DAMAGED' : 'intact') +
       ', melt ' + String(r.melted),
       'peak ' + fmtN(r.maxFuel, 0) + ' °C, min inv ' + fmtN(r.minInv, 1) + ' %',
       true, 'recorded');
    /* A LUMPED-MODEL SIMPLIFICATION, pinned so a change to it is visible.
     * The core reports fully uncovered (inventory 0 %, primary void fraction 1.0)
     * for a sustained stretch, and fuel temperature does NOT run away — it sits
     * around 650 °C and even drifts down. That is HPI throughput carrying decay
     * heat: water enters, takes heat, and leaves through the break as fast as it
     * arrives, so there is no standing inventory but there IS cooling. Feed-and-
     * bleed, essentially, and defensible.
     * What the model cannot represent is PARTIAL uncovery: there is one fuel node,
     * so it cannot have a hot uncovered top half and a cooled bottom half. A real
     * vessel with level below the top of active fuel damages the exposed portion
     * regardless of flow at the bottom. So this endpoint is the model behaving as
     * built, not a claim that an uncovered core is safe — do NOT cite this probe as
     * evidence for that. Recorded, not asserted. */
    ck('recorded: time reported fully uncovered, and whether fuel ran away',
       fmtN(r.uncoveredS || 0, 0) + ' s uncovered, peak fuel ' + fmtN(r.maxFuel, 0) + ' °C' +
       ' (single fuel node — no partial uncovery)', true, 'recorded');
  },
};

function fmtN(v, dp) { return (typeof v === 'number' && isFinite(v)) ? v.toFixed(dp) : String(v); }

var only = process.argv[2] && process.argv[2].charAt(0) !== '-' ? process.argv[2] : null;
console.log(B + 'Meltdown paths — hands off, through the full stack' + X +
  D + '  (shipped lineup, ' + ACCEL + '× accel)' + X + '\n');

Object.keys(PATHS).forEach(function (id) {
  if (only && id !== only) return;
  curChecks = [];
  PATHS[id]();
  var known = KNOWN_FAILS[id] || {};
  var effective = true;
  curChecks.forEach(function (c) {
    var tag = known[c.d];
    if (tag && !c.pass) c.xfail = tag;
    else if (tag && c.pass) { c.xpass = tag; effective = false; }
    else if (!c.pass) effective = false;
  });
  suites++; if (effective) suitesPass++;
  console.log((effective ? G + 'PASS' : R + 'FAIL') + X + '  ' + B + id + X);
  curChecks.forEach(function (c) {
    total++;
    if (c.xfail) { xfails++; passed++;
      console.log(Y + '  ✗(known ' + c.xfail + ')' + X + ' ' + c.d + D + '  (' + c.obs + ')' + X); return; }
    if (c.xpass) { xpassBad++;
      console.log(R + '  ✓(XPASS ' + c.xpass + '!)' + X + ' ' + c.d + D + '  (defect fixed — remove the entry)' + X); return; }
    if (c.pass) passed++;
    console.log((c.pass ? G + '  ✓' : R + '  ✗') + X + ' ' + c.d + D + '  (' + c.obs + ')' + X);
  });
});

console.log('\n' + B + '──────────' + X);
console.log(B + 'Paths: ' + suitesPass + '/' + suites + X + '   Checks: ' + (passed === total ? G : R) + passed + '/' + total + X +
  (xfails ? '   (' + xfails + ' known-fail)' : '') + (xpassBad ? '   ' + R + xpassBad + ' STALE XFAIL' + X : ''));
process.exit(suitesPass === suites ? 0 : 1);
