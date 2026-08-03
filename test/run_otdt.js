/*
 * test/run_otdt.js — Overtemperature ΔT / Overpower ΔT protection (#311).
 *
 * WHY THIS IS ITS OWN RUNNER
 * --------------------------
 * The two trips ship DEFAULT OFF (`protection_options.otdt_opdt_trips`), the #216
 * pattern: built off first so the blast radius is MEASURED by flipping one flag rather
 * than guessed at. `pwr_control.js` reads that flag at LOAD time, and Node caches
 * requires — so no existing suite can see the trips at all. This runner sets the flag
 * between loading the config and loading the control layer, which is the only way to
 * exercise them, and it is why the function needs a gate of its own rather than a
 * handful of probes bolted onto run_behavior.
 *
 * It therefore does BOTH halves:
 *   A. FLAG OFF  — the derived channels exist and read sensibly, and NOTHING is wired.
 *                  This is the half that guards the shipped plant.
 *   B. FLAG ON   — the trips, rod stops and annunciators do what they claim, the
 *                  normal-operations envelope stays clear of them, and the casualties
 *                  that have no trip today get one.
 *
 * HR10: these are not written from observed behaviour. Every band comes from either the
 * measured separation recorded in `otdt_opdt` (pwr_config.js) or from a stated property
 * of the design — the ride-out must survive, Mode 5 must not trip, the rod stop must sit
 * above the trip, insertion must always work. Where a check would pass equally on a
 * broken build it says so and asserts the discriminating number instead.
 *
 * REACHABILITY. Part B opens with eight "no scram" assertions, and CLAUDE.md's standing
 * rule is that such a claim "is worth exactly what the gauge can reach" (#249/#273). It is
 * NOT vacuous here, and the proof is in this same file rather than deferred: the casualty
 * block below drives both margin channels through zero and trips on each of them, so the
 * gauges demonstrably reach their own setpoints. `run_reachability` itself cannot cover
 * these while the flag ships off — its Part A iterates `PWR_PROTECTION.trips`, which does
 * not contain them. WHEN THE OWNER FLIPS THE FLAG, expect `run_reachability` to pick up
 * two trips and two alarms automatically and its baseline to move; that is the design, not
 * a regression.
 *
 *   node test/run_otdt.js
 */
'use strict';
var path = require('path');
function L(p) { require(path.join(__dirname, '..', p)); }

L('engines/load_mode.js');
L('engines/pwr/pwr_config.js');
var RD = globalThis.RD;

// ---- Part A is measured on the SHIPPED flag, whatever it is. Record it first. ----
var SHIPPED_FLAG = !!(RD.PWR_CONFIG.protection_options || {}).otdt_opdt_trips;
RD.PWR_CONFIG.protection_options.otdt_opdt_trips = true;     // <-- Part B needs them wired
L('layers/control/pwr_control.js');
['engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js',
 'engines/pwr/pwr_steam_generator.js', 'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
 'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js'
].forEach(L);

var G = '\x1b[32m', R = '\x1b[31m', D = '\x1b[2m', B = '\x1b[1m', X = '\x1b[0m';
var checks = 0, failed = 0;
function ck(name, observed, ok, expected) {
  checks++;
  if (ok) console.log('  ' + G + 'PASS' + X + '  ' + name + D + '  [' + observed + ']' + X);
  else { failed++; console.log('  ' + R + 'FAIL' + X + '  ' + name + D + '  [expected ' + expected + ', observed ' + observed + ']' + X); }
}
function F(c) { return c * 9 / 5 + 32; }
function dF(c) { return c * 9 / 5; }
function psi(m) { return m * 145.038; }

var CFG = RD.PWR_CONFIG, OT = CFG.otdt_opdt, STOP = OT.rod_stop_offset_pct;

// Drive the full stack. tick() directly, NEVER svc.start() — see measure_stack.js.
function run(ic, cmds, dur, opts) {
  opts = opts || {};
  var svc = new RD.SimulationService({ seed: opts.seed || 42 });
  svc.selectPlant('pwr', ic, undefined, undefined);
  svc.running = true; svc.timeAcceleration = 10; svc.attentionStops = false;
  var q = (cmds || []).map(function (x) { return { at: x[0], body: x[1], sent: false }; });
  var r = { scram_t: null, reason: null, minOT: 1e9, minOP: 1e9, maxPwr: -1e9, maxDT: -1e9,
            stop_t: null, alarm: {}, refusals: [], last: null };
  while (svc.simTime < dur) {
    for (var i = 0; i < q.length; i++) if (!q[i].sent && svc.simTime >= q[i].at) { q[i].sent = true; r.refusals.push(svc.handleCommand(q[i].body)); }
    var s = svc.tick(); if (!s) continue;
    var n = s.instruments;
    if (n.otdt_margin < r.minOT) r.minOT = n.otdt_margin;
    if (n.opdt_margin < r.minOP) r.minOP = n.opdt_margin;
    if (n.loop_delta_t > r.maxDT) r.maxDT = n.loop_delta_t;
    if (s.true_state.power_pct > r.maxPwr) r.maxPwr = s.true_state.power_pct;
    if (r.stop_t == null && (n.otdt_margin < STOP || n.opdt_margin < STOP)) r.stop_t = svc.simTime;
    (s.alarms || []).forEach(function (a) { if (a.state && a.state !== 'clear') r.alarm[a.id] = a.state; });
    if (r.scram_t == null && s.rps_state && s.rps_state.scrammed) { r.scram_t = svc.simTime; r.reason = s.rps_state.last_trip_reason; }
    r.last = s;
  }
  return r;
}

// ==============================================================  A. THE SHIPPED PLANT
console.log('\n' + B + 'A. The SHIPPED plant (flag as configured)' + X);
console.log(D + '  These guard what players get. The channels are always built; only the trips are gated.' + X);

// RE-AUTHORED 2026-08-03. This asserted the flag ships OFF, reasoning "turning it on is the
// owner's call while K1/K4 are unsourced". It was pinning a POLICY, and the policy has been
// ruled on — so the check follows the plant (HR9) rather than the plant waiting on the check.
//
// K1/K4 ARE STILL UNSOURCED. That has not changed and is not being hidden. The evidence pass
// on ML11223A301 RAN (#311): it settles the equation form, T' = 584.7 °F, P' = 2235 psig, the
// 3 % rod stop and "No Interlocks" — but it does NOT contain K1–K6 or the τ's. Those are
// "manually adjusted preset" plant Tech Spec values, and Table 12.2-1 lists both setpoints as
// "Variable (calculated)". The original condition was therefore waiting on something the
// document never had. What actually changed the answer was the OBSERVABILITY half —
// `bdDtMargin` now puts the binding margin on the board — plus #314 landing first, so
// `pwr_lof` is already re-authored around the RCP breaker trip and this flip cannot re-break
// it (breaker 23.0 s beats OPΔT's 24.5 s on that casualty).
ck('otdt_opdt_trips ships ON (OWNER RULING 2026-08-03, once the board readout landed)',
  String(SHIPPED_FLAG), SHIPPED_FLAG === true, 'true');

// The instrument SPECS are unconditional — the gauges exist whether or not the trips do,
// which is what lets the board show ΔT and its limit line without the protection wired.
['loop_delta_t', 'otdt_setpoint', 'opdt_setpoint', 'otdt_margin', 'opdt_margin'].forEach(function (id) {
  var sp = CFG.instruments[id];
  ck('instrument `' + id + '` is declared and derived', sp ? 'derived=' + sp.derived + ' range=[' + sp.range + ']' : 'MISSING',
    !!(sp && sp.derived && sp.range), 'a derived spec with a range');
});
// Derived means NO PRNG draw — the appended-instrument rule. A noise value here would
// shift every downstream instrument's noise stream and move marginal endpoints across
// the whole suite (see sg_steam_flow's comment in pwr_config.js).
ck('none of the five draws a PRNG number (noise 0)',
  ['loop_delta_t', 'otdt_setpoint', 'opdt_setpoint', 'otdt_margin', 'opdt_margin'].map(function (i) { return CFG.instruments[i].noise; }).join(','),
  ['loop_delta_t', 'otdt_setpoint', 'opdt_setpoint', 'otdt_margin', 'opdt_margin'].every(function (i) { return !CFG.instruments[i].noise; }), 'all 0');

// =====================================================================  B. FLAG ON
console.log('\n' + B + 'B. With the trips wired' + X);

var P = RD.PWR_PROTECTION;
var otTrip = P.trips.filter(function (t) { return t.id === 'otdt'; })[0];
var opTrip = P.trips.filter(function (t) { return t.id === 'opdt'; })[0];
ck('OTΔT trip is wired, reads the margin channel, scrams low at 0',
  otTrip ? otTrip.instrument + ' ' + otTrip.direction + ' ' + otTrip.setpoint + ' → ' + otTrip.action : 'MISSING',
  !!(otTrip && otTrip.instrument === 'otdt_margin' && otTrip.direction === 'low' && otTrip.setpoint === 0 && otTrip.action === 'scram'),
  'otdt_margin low 0 → scram');
ck('OPΔT trip is wired, reads the margin channel, scrams low at 0',
  opTrip ? opTrip.instrument + ' ' + opTrip.direction + ' ' + opTrip.setpoint + ' → ' + opTrip.action : 'MISSING',
  !!(opTrip && opTrip.instrument === 'opdt_margin' && opTrip.direction === 'low' && opTrip.setpoint === 0 && opTrip.action === 'scram'),
  'opdt_margin low 0 → scram');
// NEITHER is blockable, and that is the P-9 lesson (#216): a power permissive is not an
// operator-selectable bypass, and these have no permissive at all — they are live in
// every mode. Nothing on the board may defeat them.
ck('neither trip is operator-blockable', 'otdt=' + !!otTrip.blockable + ' opdt=' + !!opTrip.blockable,
  !otTrip.blockable && !opTrip.blockable, 'both unblockable');

var stops = P.interlocks.filter(function (i) { return i.instrument === 'otdt_margin' || i.instrument === 'opdt_margin'; });
ck('two rod stops, both withdrawal-only', stops.length + ' stops, withdrawal_only=' + stops.map(function (s) { return !!s.withdrawal_only; }).join(','),
  stops.length === 2 && stops.every(function (s) { return s.withdrawal_only; }), '2, both withdrawal-only');
// SOURCED: WTSM 8.1 §8.1.7.3 (ML11223A252) — rod stop at (trip setpoint − 3 %).
ck('rod stops sit ' + STOP + ' % ABOVE the trip line (WTSM 8.1 §8.1.7.3)',
  stops.map(function (s) { return s.setpoint; }).join(','),
  stops.every(function (s) { return s.setpoint === STOP && s.setpoint > otTrip.setpoint; }), 'both ' + STOP + ', > 0');

// ---- the setpoint arithmetic, checked against the closed form, not against itself ----
var s0 = run('hot_full_power', [], 30).last.instruments;
var dt0 = CFG.thermal.delta_T_rated;
function Tsat(p) { return 179.47 * Math.pow(Math.max(p, 1e-6), 0.239); }
var expectOT = 100 * OT.dnb_margin_factor * 2 * (Tsat(s0.primary_pressure) - CFG.thermal.dnb_margin_c - s0.tavg) / dt0;
ck('OTΔT setpoint IS the scaled DNB surface at the indicated T and P',
  s0.otdt_setpoint.toFixed(2) + ' % vs closed form ' + expectOT.toFixed(2) + ' %',
  Math.abs(s0.otdt_setpoint - expectOT) < 0.05, 'agreement within 0.05 %');
// The equivalent linearized gradients must stay inside the band real Westinghouse units
// publish (K2 0.015–0.028 /°F, K3 0.00079–0.00143 /psi). This is the check that catches a
// margin-factor retune quietly walking the shape out of the real family — which is exactly
// how the first cut of this design went wrong (see the pwr_config block comment).
var K2_perF = OT.dnb_margin_factor * 2 / dt0 / (9 / 5);
var K3_perPsi = OT.dnb_margin_factor * 2 * (0.239 * Tsat(CFG.pressurizer.P_equilibrium) / CFG.pressurizer.P_equilibrium) / dt0 / 145.038;
ck('equivalent K2 is inside the published real band', K2_perF.toFixed(4) + ' /°F', K2_perF >= 0.015 && K2_perF <= 0.028, '0.015–0.028 /°F');
ck('equivalent K3 is inside the published real band', K3_perPsi.toFixed(5) + ' /psi', K3_perPsi >= 0.00079 && K3_perPsi <= 0.00143, '0.00079–0.00143 /psi');
ck('OTΔT sits ABOVE OPΔT at nominal — the real ordering (K1 > K4)',
  s0.otdt_setpoint.toFixed(1) + ' % vs ' + s0.opdt_setpoint.toFixed(1) + ' %',
  s0.otdt_setpoint > s0.opdt_setpoint, 'OTΔT > OPΔT');
ck('indicated loop ΔT reads ~100 % of rated at rated power',
  s0.loop_delta_t.toFixed(2) + ' % (' + dF(dt0).toFixed(1) + ' °F rated)',
  s0.loop_delta_t > 96 && s0.loop_delta_t < 104, '96–104 %');

// ---- normal operation must stay clear. A trip here is a NUISANCE TRIP. ----
console.log('\n' + B + '  Normal operation — no trip, no rod stop' + X);
[['hot full power, 30 min', 'hot_full_power', [], 1800],
 ['hot full power, 30 min, seed 7', 'hot_full_power', [], 1800],
 ['50 % power, 30 min', '50_percent', [], 1800],
 ['hot zero power, 30 min', 'hot_zero_power', [], 1800],
 ['Mode 5 cold shutdown, 30 min', 'cold_shutdown', [], 1800],
 ['5 % power, 30 min', '5_percent', [], 1800],
 ['100 → 50 % load step', 'hot_full_power', [[20, { action: 'set_steam_demand', mwe: 50 }]], 900]
].forEach(function (c, i) {
  var r = run(c[1], c[2], c[3], { seed: /seed 7/.test(c[0]) ? 7 : 42 });
  ck(c[0] + ' — no scram', r.scram_t == null ? 'clear, min margins OT ' + r.minOT.toFixed(1) + ' / OP ' + r.minOP.toFixed(1)
    : 'SCRAM ' + r.scram_t + 's ' + r.reason, r.scram_t == null, 'no scram');
});

// THE RIDE-OUT. This plant's defining behaviour: a full load rejection is carried on the
// steam dump without a reactor trip (TR-1/TR-1g; the dump was resized to 40 % in 2026-07-31
// specifically to make it teachable). The FIRST cut of this design scrammed here at 55.0 s
// on otdt_margin — a rotated limit line instead of a scaled one. This check is what caught
// it, and it is written POSITIVELY (assert the margin, not merely "no trip") so restoring
// the rotated form has to fail a number rather than slide through a silent absence.
var rej = run('hot_full_power', [[20, { action: 'set_steam_demand', mwe: 0 }]], 900);
ck('FULL LOAD REJECTION rides out — no scram (the rotated-line defect scrammed at 55 s)',
  rej.scram_t == null ? 'no scram' : 'SCRAM ' + rej.scram_t + 's ' + rej.reason, rej.scram_t == null, 'no scram');
ck('  …and OTΔT margin never gets close (the rotated line reached 0.6)',
  rej.minOT.toFixed(1) + ' % of rated ΔT', rej.minOT > 10, '> 10 %');

// ---- the casualties. This is what the function is FOR. ----
console.log('\n' + B + '  Casualties that have NO reactor trip without these functions' + X);
console.log(D + '  Measured on the un-flagged plant: each ran the full 30 min with no scram at all.' + X);
// RE-AUTHORED 2026-08-03 when the turbine runback landed (#318). The 15 % break USED to
// belong here — it scrammed on `opdt_margin` at ~200 s. The runback now saves it, which is
// the feature working, so it moved to section D where the save is asserted positively. What
// is left here is the pair the runback CANNOT save, and that is the honest split: the
// runback works through A1, and a transient faster than the moderator feedback outruns it.
[['30 % steam line break — 114 % power, held', 'steam_line_break', 0.30, 60, 'opdt'],
 ['continuous rod withdrawal at full power', 'continuous_rod_withdrawal', 1.0, 40, 'opdt']
].forEach(function (c) {
  var r = run('hot_full_power', [[5, { action: 'inject_failure', failure_id: c[1], severity: c[2] }]], 900);
  ck(c[0] + ' — now trips', r.scram_t == null ? 'NO SCRAM' : 'SCRAM ' + r.scram_t.toFixed(1) + 's on ' + r.reason,
    r.scram_t != null && r.scram_t < c[3] && /^opdt_margin/.test(r.reason || ''), 'scram on opdt_margin before ' + c[3] + ' s');
  // The rod stop and the annunciator must arrive BEFORE the breakers, or they teach nothing.
  ck('  …rod stop and OPΔT annunciator lead the trip',
    'stop ' + (r.stop_t == null ? '-' : r.stop_t.toFixed(1)) + 's, alarm ' + (r.alarm.opdt_approach || 'none') + ', trip ' + r.scram_t.toFixed(1) + 's',
    r.stop_t != null && r.stop_t < r.scram_t && !!r.alarm.opdt_approach, 'stop < trip, annunciator raised');
});

// OTΔT's own case. It is NOT the same as OPΔT's and the asymmetry is the honest finding:
// measured, no casualty on this plant reaches DNB while un-scrammed, and the ones that
// reach it at all get there by DEPRESSURIZING. A stuck-open PORV is where OTΔT genuinely
// arrives first, because the collapsing pressure collapses the DNB line with it.
var porv = run('hot_full_power', [[5, { action: 'inject_failure', failure_id: 'stuck_porv_open' }]], 900);
ck('stuck-open PORV — OTΔT trips on the collapsing DNB line',
  porv.scram_t == null ? 'NO SCRAM' : 'SCRAM ' + porv.scram_t.toFixed(1) + 's on ' + porv.reason,
  porv.scram_t != null && /^otdt_margin/.test(porv.reason || ''), 'scram on otdt_margin');
ck('  …and it beats the low-pressure trip that used to catch it at 12.5 s',
  porv.scram_t.toFixed(1) + ' s', porv.scram_t < 12.5, '< 12.5 s');

// HR1, and the reason these read INDICATED Tavg: a drifting transmitter moves the trip
// LINE, not just the gauge. Single-channel protection believes it — the #220 lesson made
// concrete. This asserts the deception is live rather than that it is harmless.
var drift = run('hot_full_power', [[5, { action: 'inject_failure', failure_id: 'tavg_sensor_failure' }]], 900);
ck('a drifting Tavg transmitter moves the OTΔT setpoint and trips the plant (HR1)',
  drift.scram_t == null ? 'NO SCRAM' : 'SCRAM ' + drift.scram_t.toFixed(1) + 's on ' + drift.reason,
  drift.scram_t != null && /^otdt_margin/.test(drift.reason || ''), 'scram on otdt_margin');

// Rods may ALWAYS be inserted — WTSM 8.1 §8.1.7.3: "These interlocks or rod stops only
// prevent outward rod motion." Asserted by ISSUING both directions into a live rod stop.
console.log('\n' + B + '  The rod stop blocks withdrawal ONLY' + X);
var live = new RD.SimulationService({ seed: 42 });
live.selectPlant('pwr', 'hot_full_power', undefined, undefined);
live.running = true; live.timeAcceleration = 10; live.attentionStops = false;
live.handleCommand({ action: 'inject_failure', failure_id: 'steam_line_break', severity: 0.30 });
var engaged = false, outRes = null, inRes = null;
while (live.simTime < 60 && !engaged) {
  var sn = live.tick();
  if (sn && sn.instruments.opdt_margin < STOP && !(sn.rps_state && sn.rps_state.scrammed)) {
    engaged = true;
    outRes = live.handleCommand({ action: 'rod_nudge', group_id: 'control_rods', steps: 4, speed: 'normal' });
    inRes = live.handleCommand({ action: 'rod_nudge', group_id: 'control_rods', steps: -4, speed: 'normal' });
  }
}
ck('the rod stop engaged before the trip, so both directions could be tried', String(engaged), engaged, 'true');
// The refusal shape is `blocked` + INTERLOCK, not `error` — the kernel's documented
// contract (control_kernel.js:441, where the old orphan `type: 'refused'` was retired).
ck('WITHDRAWAL is refused as an INTERLOCK block', outRes ? (outRes.type + ' ' + (outRes.code || '')) : 'accepted (null)',
  !!(outRes && outRes.type === 'blocked' && outRes.code === 'INTERLOCK'), 'blocked / INTERLOCK');
// …and the refusal must NAME the OPΔT stop. Without this the check passes on ANY
// interlock — the SUR withdrawal block would satisfy it just as well, and this probe
// would then be pinning the wrong mechanism (the TR-1 failure mode, #216). The message
// is REGISTER-DEPENDENT (control_kernel.js:274) and the default register is `learning`,
// so this matches the learning wording; `overpower` is what separates it from both the
// OTΔT stop ("overtemperature") and the SUR block ("speeding up too fast").
ck('  …and the refusal names the OPΔT rod stop, not some other interlock',
  outRes ? String(outRes.message || outRes.reason).slice(0, 72) + '…' : 'no reply',
  !!(outRes && /overpower/i.test(String(outRes.message))), 'the learning message naming "overpower"');
// An ACCEPTED command returns null (SimulationService.handleCommand). So "insertion is
// accepted" is exactly "no block came back" — which is only meaningful paired with the
// refusal above, both issued into the same live interlock one tick apart.
ck('INSERTION is accepted — "the rods can always be inserted"', inRes ? (inRes.type + ' ' + (inRes.code || '')) : 'accepted (null)',
  inRes == null, 'accepted (null)');

// ======================================================= D. THE TURBINE RUNBACK (#318)
console.log('\n' + B + 'D. The turbine runback — the other half of C-3/C-4' + X);
console.log(D + '  Full stack only: it is driven from stepAutomation, which has one caller (the service).' + X);

// A runback run reports the load TARGET, because that is the thing it drives and the thing
// the player watches move. `load_target_mwe` is a commanded setpoint (read-back), not a
// sensed quantity — see the HR1 note over _stepRunbacks.
function runback(ic, cmds, dur) {
  var svc = new RD.SimulationService({ seed: 42 });
  svc.selectPlant('pwr', ic, undefined, undefined);
  svc.running = true; svc.timeAcceleration = 10; svc.attentionStops = false;
  var q = (cmds || []).map(function (x) { return { at: x[0], body: x[1], sent: false }; });
  var r = { minLoad: 1e9, minMargin: 1e9, scram_t: null, injected_at: null, loadAtInject: null };
  while (svc.simTime < dur) {
    for (var i = 0; i < q.length; i++) if (!q[i].sent && svc.simTime >= q[i].at) {
      q[i].sent = true; svc.handleCommand(q[i].body);
      if (r.injected_at == null) r.injected_at = svc.simTime;
    }
    var s = svc.tick(); if (!s) continue;
    var lt = s.true_state.load_target_mwe;
    if (r.injected_at != null && r.loadAtInject == null) r.loadAtInject = lt;
    if (r.injected_at != null && lt < r.minLoad) r.minLoad = lt;
    var m = Math.min(s.instruments.otdt_margin, s.instruments.opdt_margin);
    if (m < r.minMargin) r.minMargin = m;
    if (r.scram_t == null && s.rps_state && s.rps_state.scrammed) r.scram_t = svc.simTime;
  }
  return r;
}

// 1. IT MUST NOT FIRE IN NORMAL OPERATION. The load target is the operator's control; a
//    runback that nudges it during ordinary work would be indistinguishable from a bug.
//    Asserted on the load TARGET rather than on the margin, because "margin stayed high" is
//    a weaker claim than "the plant never touched the number".
var quiet = runback('hot_full_power', [[60, { action: 'set_steam_demand', mwe: 100 }]], 600);
ck('steady HFP — the runback never touches the load target',
  quiet.minLoad.toFixed(1) + ' MWe (min after t=60)', quiet.minLoad > 99.9, '100 MWe, untouched');

// 2. THE RIDE-OUT IS UNTOUCHED. This plant's defining behaviour, and the runback triggers on
//    the same 3 % line as the rod stop — so the check that matters is that a full rejection
//    never gets near it. MEASURED: margin bottoms at 6.5, more than double the trigger.
var rej = runback('hot_full_power', [[60, { action: 'set_steam_demand', mwe: 0 }]], 900);
ck('FULL load rejection — margin never reaches the runback line',
  rej.minMargin.toFixed(1) + ' vs trigger ' + STOP.toFixed(1), rej.minMargin > STOP * 1.5, '> ' + (STOP * 1.5).toFixed(1));
ck('  …and it rides out without a scram', rej.scram_t == null ? 'no scram' : 'SCRAM ' + rej.scram_t + 's',
  rej.scram_t == null, 'no scram');

// 3. IT SAVES THE SLOW CASUALTY. This is the whole point of the feature, and it is the check
//    that fails if the runback is removed: WITHOUT it the 15 % steam line break scrams at
//    ~200 s on opdt_margin. Two assertions, because "no scram" alone would also pass on a
//    plant where the trips were simply deleted — the load having been DRIVEN DOWN is what
//    says the runback specifically did it.
var slb15 = runback('hot_full_power', [[30, { action: 'inject_failure', failure_id: 'steam_line_break', severity: 0.15 }]], 500);
ck('15 % steam line break — the runback drove load DOWN',
  slb15.loadAtInject.toFixed(0) + ' → ' + slb15.minLoad.toFixed(0) + ' MWe', slb15.minLoad < 90, '< 90 MWe');
ck('  …and that converts a scram into a ride-out (was SCRAM ~200 s)',
  slb15.scram_t == null ? 'no scram' : 'SCRAM ' + slb15.scram_t.toFixed(0) + 's', slb15.scram_t == null, 'no scram');
ck('  …margin RECOVERS rather than hunting (stays above the trip line)',
  slb15.minMargin.toFixed(1), slb15.minMargin > 0, '> 0');

// 4. IT CANNOT SAVE THE FAST ONE, AND THAT IS THE DYNAMICS LESSON — not a tuning failure.
//    The runback works THROUGH A1 (power follows load), and A1 has a thermal time constant,
//    so a transient faster than the moderator feedback outruns any runback. Measured: a
//    5 %/2 s runback is no better than 2 %/2 s here. Pinned POSITIVELY so that "we made the
//    runback faster and it started saving this" has to edit the line rather than slide past.
var slb30 = runback('hot_full_power', [[30, { action: 'inject_failure', failure_id: 'steam_line_break', severity: 0.30 }]], 400);
ck('30 % steam line break — still scrams; the runback cannot outrun A1\'s lag',
  slb30.scram_t == null ? 'no scram' : 'SCRAM ' + slb30.scram_t.toFixed(0) + 's',
  slb30.scram_t != null && slb30.scram_t < 120, 'SCRAM, < 120 s');

// ---------------------------------------------------------------------------- tally
// Matches the run_reachability / run_reactivity / run_contract convention so run_all's
// score parser reads it as "Nchecks Mfailed", not a shape of my own invention. The first
// cut printed "ALL 39 CHECKS PASS", which parsed as the score `39CHECKS` and drifted
// against its own baseline — a green runner reported red by the aggregate gate.
console.log('\n' + B + '──────────────────────────────────────────' + X);
console.log(B + (failed ? R : G) + (checks - failed) + ' checks passed / ' + failed + ' failed' + X + '\n');
process.exit(failed ? 1 : 0);
