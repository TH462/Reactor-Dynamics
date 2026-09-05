/* run_pwr2_feedwater.js — Layer 5 gate: THE FEED TRAIN. (#479, 2026-08-21)
 *
 * Pure-module gate, run_pwr2_afw's class: the sourced constants retyped (DOC), the
 * three-element controller's sourced STRUCTURE proven by behavior (flow error acts, the level
 * lag delays, the 2-minute integral trims), the isolation's two doors (operator, SI + 32 s),
 * and the anti-windup that the 2026-08-21 smoke ride proved load-bearing (a one-pump
 * boil-down banked ~100 s of error and refilled the SG to 100 % NR without it).
 *
 * Run: node test/run_pwr2_feedwater.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var MUT = require('./mut_flags.js');   /* --no-mutations / --mut= / --grp= (#602) */
var LIB = path.join(__dirname, '..', 'engines', 'pwr2', 'pwr2_feedwater.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');

function loadFrom(src) {
  var root = {};
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.feedwater;';
  return new Function('RD_ROOT', body)(root);
}

/* THE SOURCE, RETYPED INDEPENDENTLY — the house discipline.
 *   Ginna UFSAR ch10 (ML20339A040): "the feedwater pump remaining in service will carry
 *     approximately 60% of full load feedwater flow"
 *   WTSM 11.1 (ML11223A293): the level PI integral time constant "is two minutes"
 *   WAT 05 (ML11216A094) 5.3.2: the level lag is 5 seconds
 *   Ginna UFSAR ch15 Table 15.0-6: "Feedwater Isolation Delay from SI ... 32.0"
 *   OWNER RULING #355 (2026-08-08): "Program to 65 %"
 */
var DOC = { pump_each: 0.60, ti_s: 120.0, lag_s: 5.0, si_delay_s: 32.0, program: 65.0 };
var DT = 0.02;

function runSuite(F, rec, quiet) {
  function ck(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }
  function steady() {
    return { sg_level_pct: DOC.program, steam_flow_frac: 1.0, fw_flow_frac: 1.0, si_active: false };
  }
  function ride(fw, drivers, secs) {
    var r = null, n = Math.max(1, Math.round(secs / DT));
    for (var i = 0; i < n; i++) r = F.stepFeedwater(fw, DT, drivers);
    return r;
  }

  head('CONSTRUCTION  [the Hot Full Power lineup, stated not inherited]');
  var fw0 = F.createFeedwater({});
  ck('at power: both pumps, AUTO, un-isolated, delivering rated through a mid-load valve',
     fw0.pumpA === true && fw0.pumpB === true && fw0.auto === true && fw0.isolated === false &&
     Math.abs(fw0.feed_frac - 1.0) < 1e-9 && Math.abs(fw0.valve - 1.0 / 1.2) < 1e-9,
     'valve ' + fw0.valve.toFixed(3) + ' = 1/1.2 — rated flow through two 60 % pumps');
  ck('the level machinery primes ON PROGRAM — no boot kick from a zeroed lag',
     fw0.lvlLag === DOC.program && fw0.lvlInt === 0, '');

  head('SOURCED CONSTANTS  [retyped, not imported]');
  ck('one pump carries the ch10 60 %', F.FW.pump_frac_each === DOC.pump_each, '');
  ck('the level PI integral is WTSM 11.1\'s two minutes', F.FW.level_ti_s === DOC.ti_s, '');
  ck('the level lag is WAT 05\'s five seconds', F.FW.level_lag_s === DOC.lag_s, '');
  ck('the SI isolation delay is the table\'s 32.0 s', F.FW.si_fwi_delay_s === DOC.si_delay_s, '');
  ck('the program is the ruled 65 % narrow range', F.FW.program_pct === DOC.program, '');

  head('CAPACITY  [and the loss-of-both report the AFW start consumes]');
  var fwC = F.createFeedwater({});
  var rC = F.stepFeedwater(fwC, DT, steady());
  ck('two pumps: 1.2 of rated available, main feed NOT lost',
     Math.abs(rC.capacity_frac - 1.2) < 1e-9 && rC.main_feed_lost === false, '');
  fwC.pumpA = false;
  rC = F.stepFeedwater(fwC, DT, steady());
  ck('one pump: the ch10 60 % ceiling', Math.abs(rC.capacity_frac - 0.6) < 1e-9 &&
     rC.main_feed_lost === false, '');
  fwC.pumpB = false;
  rC = F.stepFeedwater(fwC, DT, steady());
  ck('both pumps SECURED: capacity 0 and main_feed_lost REPORTS (the caller trips the turbine, ' +
     'the protection starts the MDAFW — HR5, reported here, acted on there)',
     rC.capacity_frac === 0 && rC.main_feed_lost === true, '');
  /* SECURED AND UNAVAILABLE REPORT THE SAME (#605) — and that is deliberate. A real
   * breaker-position signal cannot tell the operator's intent from a pump failure, so this module
   * does not either; securing both pumps at power loses the heat sink exactly as surely as losing
   * them. WHERE THE MODE DISTINCTION LIVES: in the caller. pwr2_engine arms the sourced chain only
   * when the RCS is not on RHR, so the Mode 4/5 lineup does not fire a casualty response —
   * measured, run_pwr2_engine's "cold plant on RHR" check. The first cut of #605 put the split
   * HERE, availability-only, and run_pwr2_engine caught the cost: securing both pumps at 100 %
   * power stopped tripping the turbine. */
  fwC.pumpA = true; fwC.pumpB = true;
  fwC.pumpAAvail = 0; fwC.pumpBAvail = 0;
  rC = F.stepFeedwater(fwC, DT, steady());
  ck('both pumps UNAVAILABLE with the selectors still ON reports the same loss (the casualty ' +
     'seat is availability, so an injected loss cannot be cleared by a button press — #200)',
     rC.capacity_frac === 0 && rC.main_feed_lost === true &&
     fwC.pumpA === true && fwC.pumpB === true, '');
  /* THE NONVITAL BUS (#507 wave 4): the main feed pumps die with the grid, diesels or not */
  var fwP = F.createFeedwater({});
  var rP = F.stepFeedwater(fwP, DT, Object.assign(steady(), { power_ok: false }));
  ck('a dead grid takes capacity to 0 and reports main_feed_lost — with BOTH selectors ' +
     'still on (the #200 split: recovery re-energizes, never re-selects)',
     rP.capacity_frac === 0 && rP.main_feed_lost === true &&
     fwP.pumpA === true && fwP.pumpB === true, '');
  ck('absent power_ok means POWERED — the acAvailable convention, every fixture above holds',
     F.stepFeedwater(F.createFeedwater({}), DT, steady()).capacity_frac > 0, '');

  /* THE OVERFEED SEAT (#510 M-12): the regulating valve failed OPEN — its own seat, never a
   * rewrite of the operator's demand. The selector and manual_frac must stand untouched
   * through inject AND clear, and the clear releases the valve back to the standing lineup. */
  var fwO = F.createFeedwater({ auto: false, manual_frac: 0.5 });
  ride(fwO, steady(), 60);
  fwO.overfeed = true;
  var rO = ride(fwO, steady(), 60);
  ck('the overfeed SEAT drives the two-pump 1.2 ceiling past a MANUAL 0.5 lineup, with the ' +
     'selector and demand UNTOUCHED (#510 M-12)',
     rO.feed_frac > 1.15 && fwO.auto === false && fwO.manual_frac === 0.5,
     'delivered ' + rO.feed_frac.toFixed(2) + ' against manual 0.5');
  fwO.overfeed = false;
  var rO2 = ride(fwO, steady(), 60);
  ck('...and clearing the seat hands back the STANDING lineup — manual 0.5 delivers 0.5',
     Math.abs(rO2.feed_frac - 0.5) < 0.05 && fwO.auto === false,
     'delivered ' + rO2.feed_frac.toFixed(2) + ' after the clear');
  ck('...and isolation still beats a failed-open valve (the FWI trips the pumps too, declared)',
     (function () {
       var fwI = F.createFeedwater({});
       fwI.overfeed = true; fwI.isolated = true;
       return ride(fwI, steady(), 30).feed_frac < 0.05;
     })(), '');

  head('THE CONTROLLER  [three elements: flow error acts now, the lagged level trims later]');
  var fwS = F.createFeedwater({});
  var r0 = ride(fwS, steady(), 60);
  ck('at the program with matched flows the valve HOLDS — no drift over a minute',
     Math.abs(fwS.valve - 1.0 / 1.2) < 0.02 && Math.abs(r0.feed_frac - 1.0) < 0.02,
     'valve ' + fwS.valve.toFixed(3) + ', feed ' + r0.feed_frac.toFixed(3));
  /* element 2+3: a steam/feed mismatch opens the valve with the level still AT program —
   * WTSM's "(2) feed flow is less than steam flow" opening clause, isolated from element 1 */
  var fwF = F.createFeedwater({});
  var v0 = fwF.valve;
  ride(fwF, { sg_level_pct: DOC.program, steam_flow_frac: 1.0, fw_flow_frac: 0.8,
              si_active: false }, 5);
  ck('feed below steam OPENS the valve at on-program level (the flow error, element 2 minus 3)',
     fwF.valve > v0 + 0.05, 'valve ' + v0.toFixed(3) + ' -> ' + fwF.valve.toFixed(3));
  /* element 1 through its SOURCED lag: a level step is 63.2 % seen at ~5 s */
  var fwL = F.createFeedwater({});
  ride(fwL, { sg_level_pct: DOC.program - 10, steam_flow_frac: 1.0, fw_flow_frac: 1.0,
              si_active: false }, DOC.lag_s);
  var seen = DOC.program - fwL.lvlLag;
  ck('a -10 % level step reads ~63.2 % through the lag at t = 5 s — shrink/swell cannot yank ' +
     'the valve', Math.abs(seen - 6.32) < 0.7, 'lag has seen ' + seen.toFixed(2) + ' of 10 %');
  /* the 2-minute integral, seen through its MEMORY — a standing error rails the valve
   * through the proportional path alone (the valve is itself an integrator), so the term
   * open-loop-visible here is the BANK: preloaded, it must drive demand at zero
   * instantaneous error, which a P-only controller cannot do */
  var fwI = F.createFeedwater({});
  fwI.lvlInt = 600;                               /* 5 % NR held for 120 s, banked */
  var vB0 = fwI.valve;
  ride(fwI, steady(), 10);
  ck('a banked integral drives demand at ZERO instantaneous error — the 2-minute memory',
     fwI.valve > vB0 + 0.02,
     'valve ' + vB0.toFixed(3) + ' -> ' + fwI.valve.toFixed(3) + ' on the bank alone');
  var fwI2 = F.createFeedwater({});
  var low = { sg_level_pct: DOC.program - 5, steam_flow_frac: 1.0, fw_flow_frac: 1.0,
              si_active: false };
  ride(fwI2, low, 60);
  ck('...and the bank is CAPPED at a 0.25 flow-fraction trim (anti-windup half 2)',
     Math.abs(fwI2.lvlInt) <= 0.25 / F.FW.kp_lvl * F.FW.level_ti_s + 1e-6, '');
  /* anti-windup half 1: a RAILED valve stops integrating — the 2026-08-21 smoke defect */
  var fwW = F.createFeedwater({});
  ride(fwW, { sg_level_pct: 20, steam_flow_frac: 1.0, fw_flow_frac: 1.0, si_active: false }, 120);
  /* the inhibit's own observable is a bank far BELOW the cap: only what accumulated before
   * the rail. Asserting the cap here would let the cap mask a deleted inhibit (measured:
   * that exact mutation read blind against a <=cap assertion). */
  ck('with the valve RAILED open the integral bank stops growing (anti-windup half 1)',
     fwW.valve >= 0.98 && Math.abs(fwW.lvlInt) < 200,
     'valve ' + fwW.valve.toFixed(2) + ', bank ' + fwW.lvlInt.toFixed(0) +
     ' %*s — pre-rail accumulation only, nowhere near the ' +
     (0.25 / F.FW.kp_lvl * F.FW.level_ti_s).toFixed(0) + ' cap');

  head('MANUAL  [taking the lever IS leaving auto; capacity still rules]');
  var fwM = F.createFeedwater({});
  fwM.auto = false; fwM.manual_frac = 0.5;
  var rM = ride(fwM, steady(), 60);
  ck('manual 0.5 delivers 0.5', Math.abs(rM.feed_frac - 0.5) < 0.02,
     rM.feed_frac.toFixed(3));
  fwM.pumpB = false; fwM.manual_frac = 1.0;
  rM = ride(fwM, steady(), 60);
  ck('manual demand above one pump\'s 60 % is CAPACITY-limited, not granted',
     Math.abs(rM.feed_frac - 0.6) < 0.02, rM.feed_frac.toFixed(3));

  head('THE PUMP LAG  [a demand step takes the adopted 8 s, not a teleport]');
  var fwP = F.createFeedwater({});
  fwP.auto = false; fwP.manual_frac = 0.5;
  var rP = ride(fwP, steady(), F.FW.pump_tau_s);
  var moved = (1.0 - rP.feed_frac) / (1.0 - 0.5);
  ck('one tau moves ~63.2 % of a demand step', Math.abs(moved - 0.632) < 0.05,
     (100 * moved).toFixed(1) + ' % of the step at t = tau');

  head('ISOLATION  [two doors: the operator\'s latch, and SI behind the sourced 32 s]');
  var fwO = F.createFeedwater({});
  fwO.isolated = true;
  var rO = ride(fwO, steady(), 60);
  ck('isolated: the valve is DRIVEN shut (WTSM 11.1.4 — isolation overrides the SGWLCS) and ' +
     'delivery decays to zero', fwO.valve === 0 && rO.feed_frac < 0.01 && rO.demand_frac === 0,
     'feed ' + rO.feed_frac.toFixed(4));
  var fwSI = F.createFeedwater({});
  var siOn = { sg_level_pct: DOC.program, steam_flow_frac: 1.0, fw_flow_frac: 1.0, si_active: true };
  ride(fwSI, siOn, DOC.si_delay_s - 2);
  ck('SI held for LESS than 32 s has NOT isolated', fwSI.isolated === false,
     'held ' + fwSI._siHeld_s.toFixed(1) + ' s');
  ride(fwSI, siOn, 4);
  ck('...and isolates once the sourced delay elapses', fwSI.isolated === true, '');
  var fwSI2 = F.createFeedwater({});
  ride(fwSI2, siOn, DOC.si_delay_s - 2);
  ride(fwSI2, steady(), 10);
  ck('SI cleared before the delay CANCELS the count — held-time, not an edge timer',
     fwSI2.isolated === false && fwSI2._siHeld_s === 0, '');

  head('SANITY');
  var fwZ = F.createFeedwater({});
  var rZ = ride(fwZ, steady(), 120);
  ck('two minutes at the steady point: every output finite and in range',
     isFinite(rZ.feed_frac) && rZ.feed_frac >= 0 && rZ.feed_frac <= 1.2 &&
     fwZ.valve >= 0 && fwZ.valve <= 1 && isFinite(fwZ.lvlInt), '');
}

console.log('\nPWR2 Layer 5 -- THE FEED TRAIN: two pumps, one valve, the sourced three elements');
var F = loadFrom(SRC), rec = [];
runSuite(F, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['the grid gate is severed (blacked-out feed pumps keep pumping) -- #507 wave 4',
   'var capacity = drivers.power_ok === false ? 0 :',
   'var capacity = false ? 0 :'],
  ['the per-pump 60 % moved off its sourced value',
   '    pump_frac_each: 0.60,', '    pump_frac_each: 0.30,'],
  ['the program moved off the ruled 65 %',
   '    program_pct: 65.0,', '    program_pct: 50.0,'],
  ['the level lag is deleted (shrink/swell yanks the valve immediately)',
   '        fw.lvlLag += (dt / FW.level_lag_s) * (lvl - fw.lvlLag);',
   '        fw.lvlLag = lvl;'],
  ['the 2-minute integral is deleted (a standing error never trims out)',
   '        var pi = FW.kp_lvl * (lvlErr + fw.lvlInt / FW.level_ti_s);    /* flow-fraction */',
   '        var pi = FW.kp_lvl * lvlErr;'],
  ['the flow error is dropped (the controller is single-element)',
   '        var flowErr = (wS !== undefined && wF !== undefined && isFinite(wS) && isFinite(wF))\n                      ? (wS - wF) : 0;',
   '        var flowErr = 0;'],
  ['anti-windup half 1 removed (a railed valve keeps banking demand — the smoke-ride defect)',
   '        if (fw.valve > 0.02 && fw.valve < 0.98) {',
   '        if (true) {'],
  /* anchors re-pointed #510 M-12: the isolation comment grew the overfeed clause and the
   * demand ternary grew the failed-open branch */
  ['isolation no longer drives the valve shut (the SGWLCS override lost)',
   '      fw.valve = 0;\n    } else if (fw.overfeed) {',
   '    } else if (fw.overfeed) {'],
  ['the SI delay is zeroed (isolation on the first SI step)',
   '    si_fwi_delay_s: 32.0,', '    si_fwi_delay_s: 0.0,'],
  ['the SI hold never cancels (an edge timer wearing a held-time\'s name)',
   '    } else fw._siHeld_s = 0;', '    }'],
  ['main_feed_lost never reports (the AFW start and the turbine trip lose their input)',
   '      main_feed_lost: lost', '      main_feed_lost: false'],
  ['the pump lag is deleted (demand teleports)',
   '    if (dt > 0) fw.feed_frac += (demand - fw.feed_frac) * (dt / FW.pump_tau_s);',
   '    fw.feed_frac = demand;'],
  ['manual demand ignores capacity',
   '                      * 2 * FW.pump_frac_each, 0, capacity);',
   '                      * 2 * FW.pump_frac_each, 0, 1.2);'],
  ['the overfeed seat is severed (#510 M-12 re-armed: the row is inert)',
   'var demand = fw.isolated ? 0\n               : clip((fw.overfeed ? 1\n                       : fw.auto ? fw.valve',
   'var demand = fw.isolated ? 0\n               : clip((false ? 1\n                       : fw.auto ? fw.valve']
];

if (fail > 0) {
  console.log('  ' + path.basename(__filename, '.js') + ': ' + pass + ' passed, ' + fail +
              ' failed  (' + rec.length + ' checks)');
  console.log('  MUTATION SELF-TEST SKIPPED -- fix the clean run first.');
  process.exit(1);
}

console.log('\n' + '='.repeat(70));
console.log('  INJECTION SELF-TEST -- every mutation MUST redden at least one check');
console.log('='.repeat(70));
var blind = 0;
MUT.select(MUTATIONS).forEach(function (m) {
  var mutated = SRC.replace(m[1], m[2]);
  if (mutated === SRC) { console.log('  ANCHOR MISS ' + m[0]); blind++; return; }
  var rec2 = [];
  try { runSuite(loadFrom(mutated), rec2, true); } catch (e) { rec2.push({ ok: false }); }
  var red = rec2.filter(function (r) { return !r.ok; }).length;
  if (red > 0) console.log('  caught    ' + m[0].padEnd(70) + red + ' red');
  else { console.log('  BLIND     ' + m[0]); blind++; }
});
console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
            ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_feedwater: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70));
process.exit(fail > 0 || blind > 0 ? 1 : 0);
