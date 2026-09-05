/* run_pwr2_lossofload.js — THE SOURCED SPIKE: Ginna UFSAR ch15 §15.2.2, a complete loss of
 * steam load from full power with NO direct reactor trip, through the PWR2 shell facade (the
 * board's own command path). Built 2026-08-25 for #515 (the two-region pressurizer, OWNER
 * RULING 2026-08-25: "A. Then choked porv then void term.").
 *
 * THE SOURCE — Ginna UFSAR ch15 (ML20339A101), Table 15.2-1, verbatim times:
 *   Case 2 (peak RCS pressure: no spray, no PORV, no steam dump, minimum feedback, main feed
 *     lost at t = 0, initial 2190 psia): high pressurizer pressure reactor trip setpoint
 *     (2425 psia) reached at 5.4 s; rods begin to drop 7.4 s; safety valves open 7.4 s; peak
 *     RCS pressure 2748.5 psia at 8.5 s; MSSVs 9.4 s.
 *   Case 1 (DNBR: spray + PORVs credited, no dump): OT delta-T trip setpoint reached 11.6 s.
 *   §15.2.2.4.1 F: "Main feedwater flow to the steam generators is assumed to be lost at the
 *   time of the loss of steam load"; §15.2.2.4: "no credit taken for the direct reactor trip on
 *   turbine trip" — which on this plant is the `anticipatory_trip_failure` row (the P-9 channel).
 *
 * WHAT THIS PLANT IS NOT: the analysis starts at 2190 psia (Table 15.0-9) with BOL minimum
 * feedback and a 3 % PSV tolerance (2587 psia); this plant settles at ~2215 psia after a minute,
 * carries mid-cycle feedback (power droops ~10 % by 5 s) and nominal 2500 psia safeties. The
 * BANDS below carry those corrections and are stated with them: 2425 psia at 5.4 ± 1.5 s, the
 * peak above the safety setpoint and below the analysis' 2748.5.
 *
 * THE CLAIM THAT CARRIES THE BUILD: the reactor trips on HIGH PRESSURIZER PRESSURE, not on the
 * 87 % level trip that the equilibrium vessel reached first (D5 §84: +10 psi and +8 level points
 * at 5.4 s, high-level trip at 15 s). Measured on the old vessel by this runner's own fixture
 * before the build: 2425 never, trip never in 30 s, peak 2254 psia — every check below red.
 *
 * Run: node test/run_pwr2_lossofload.js
 */
'use strict';
var path = require('path'), fs = require('fs');
var MUT = require('./mut_flags.js');   /* --no-mutations / --mut= / --grp= (#602) */
var SRC = path.join(__dirname, '..', 'engines', 'pwr2');
var ORDER = ['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_sources',
  'pwr2_kinetics', 'pwr2_fuel', 'pwr2_reactor', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
  'pwr2_dumpctl', 'pwr2_condenser', 'pwr2_feedwater', 'pwr2_afw', 'pwr2_cvcs', 'pwr2_eccs',
  'pwr2_rhr', 'pwr2_pressurizer', 'pwr2_break', 'pwr2_containment', 'pwr2_damage',
  'pwr2_protection', 'pwr2_instruments', 'pwr2_true_state', 'pwr2_engine'];

/* the shell needs the old engine's config + instruments (run_pwr2_shell.js's own load list) */
['engines/load_mode.js', 'engines/pwr/pwr_config.js', 'layers/control/control_kernel.js',
 'layers/control/pwr_control.js', 'engines/pwr/pwr_instruments.js'].forEach(function (f) {
  require(path.join(__dirname, '..', f));
});

/* loadAll(pzSource) — the mutation-replay idiom: everything fresh except water + vtable (cached
 * as a pair, #513), the pressurizer optionally from a mutated source. */
function loadAll(pzSource) {
  ORDER.forEach(function (f) {
    var p = path.join(SRC, f + '.js');
    if (f !== 'pwr2_water' && f !== 'pwr2_vtable') delete require.cache[require.resolve(p)];
    if (f === 'pwr2_pressurizer' && pzSource !== undefined) { (0, eval)(pzSource); return; }
    require(p);
  });
  delete require.cache[require.resolve(path.join(SRC, 'pwr2_shell.js'))];
  require(path.join(SRC, 'pwr2_shell.js'));
  return globalThis.RD.pwr2;
}

var DT = 0.02, PSI = 145.037738;

/* ride(RD, opts) -> the sequence of events for one case. Settles 60 s first (the plant parks
 * inside its proportional band), then injects the case at t = 0 and watches 30 s. */
function ride(RD, opts) {
  var SH = RD.shell, e = new SH.PWR2Engine({}), ts;
  for (var i = 0; i < 60 / DT; i++) ts = e.step(DT);
  var P0 = ts.pressure_mpa * PSI, L0 = ts.pzr_level_pct;
  e.applyCommand({ action: 'inject_failure', failure_id: 'anticipatory_trip_failure' });
  e.applyCommand({ action: 'set_steam_dump', mode: 'closed' });          /* no dump credit */
  if (!opts.pressureControl) {
    e.applyCommand({ action: 'set_spray', pct: 0 });                      /* no spray credit */
    e.applyCommand({ action: 'set_heater', pct: 0 });
    e.applyCommand({ action: 'close_block_valve' });                      /* no PORV credit */
  }
  e.applyCommand({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });   /* §15.2.2.4.1 F */
  e.applyCommand({ action: 'inject_failure', failure_id: 'turbine_trip' });
  var r = { P0: P0, L0: L0, t2425: null, tTrip: null, cause: null, tRods: null, tPSV: null,
            tPORV: null, Pmax: 0, tPmax: 0, Lmax: 0, solid: false, dead: false, P54: 0, L54: 0 };
  for (var t = 0; t < 30; t += DT) {
    ts = e.step(DT);
    var tt = t + DT, P = ts.pressure_mpa * PSI, Pi = e.eng.ins.reading.primary_pressure * PSI;
    if (r.t2425 === null && Pi >= 2425) r.t2425 = tt;
    if (r.tTrip === null && e.eng.pt.reactor_trip) { r.tTrip = tt; r.cause = e.eng.pt.trip_cause; }
    /* 'THE RODS HAVE VISIBLY STARTED TO MOVE' is 95 % OF TRAVEL, not 190 steps (#602 phase 2).
     * The literal was 95 % of a 200-step bank; on the sourced 627 it is 30 % withdrawn, so this
     * waited until the rods were nearly all the way IN and read the drop 3.8 s late (10.1 s
     * against a setpoint at 6.3 s, blowing a 2.6 s window). A detection THRESHOLD is as much a
     * fraction-spelled-as-an-absolute as a command is. */
    if (r.tRods === null && ts.rod_steps < 0.95 * RD.kinetics.RODS.max_steps) r.tRods = tt;
    if (r.tPSV === null && e.eng._pzr.safety_open) r.tPSV = tt;
    if (r.tPORV === null && ts.porv_open && e.eng._pzr.relief_kgs > 0) r.tPORV = tt;
    if (P > r.Pmax) { r.Pmax = P; r.tPmax = tt; }
    if (ts.pzr_level_pct > r.Lmax) r.Lmax = ts.pzr_level_pct;
    if (e.eng._pzr.water_solid) r.solid = true;
    if (Math.abs(tt - 5.4) < DT / 2) { r.P54 = P; r.L54 = ts.pzr_level_pct; }
    if (e.eng._dead) { r.dead = true; break; }
  }
  return r;
}

function fmt(x) { return x === null ? 'never' : x.toFixed(1) + ' s'; }

function runSuite(RD, rec, quiet) {
  function ck(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }

  head('CASE 2  [no spray, no PORV, no dump, feed lost, no anticipatory trip — Table 15.2-1: 2425 psia at 5.4 s]');
  var c2 = ride(RD, { pressureControl: false });
  if (!quiet) {
    console.log('  start ' + c2.P0.toFixed(0) + ' psia / ' + c2.L0.toFixed(1) + ' % | at 5.4 s: ' +
      c2.P54.toFixed(0) + ' psia (+' + (c2.P54 - c2.P0).toFixed(0) + '), level +' +
      (c2.L54 - c2.L0).toFixed(1) + ' pts | 2425 indicated ' + fmt(c2.t2425) + ' | trip ' +
      fmt(c2.tTrip) + ' ' + (c2.cause || '') + ' | rods ' + fmt(c2.tRods) + ' | PSV ' + fmt(c2.tPSV) +
      ' | peak ' + c2.Pmax.toFixed(0) + ' psia at ' + c2.tPmax.toFixed(1) + ' s | level max ' +
      c2.Lmax.toFixed(1) + ' %' + (c2.solid ? ' SOLID' : '') + (c2.dead ? ' DEAD' : ''));
  }
  ck('the plant settles inside its design band before the event (2200-2245 psia)',
     c2.P0 > 2200 && c2.P0 < 2245, c2.P0.toFixed(0) + ' psia');
  ck('THE CRUX: the reactor trips on HIGH PRESSURIZER PRESSURE — not on the 87 % level trip',
     c2.cause === 'hi_pzr_press', 'cause ' + (c2.cause || 'none') + ' at ' + fmt(c2.tTrip) +
     ' — the equilibrium vessel tripped on hi_pzr_level at 15 s, or never');
  ck('the 2425 psia setpoint is reached on the INDICATED channel within 5.4 +/- 1.5 s (Ginna 5.4 ' +
     'from 2190 psia; this plant starts ~25 psi higher, droops ~10 % power by 5 s, and carries a ' +
     '0.5 s channel lag)',
     c2.t2425 !== null && c2.t2425 >= 3.5 && c2.t2425 <= 8.0, fmt(c2.t2425));
  ck('the rods drop within 2.6 s of the setpoint (2.0 s sourced hold + the drop\'s first step)',
     c2.tRods !== null && c2.t2425 !== null && c2.tRods - c2.t2425 > 1.5 && c2.tRods - c2.t2425 <= 2.6,
     'rods ' + fmt(c2.tRods) + ', setpoint ' + fmt(c2.t2425));
  ck('the CODE SAFETIES lift (true P >= 2500 psia) before the peak, as in the analysis (7.4 s)',
     c2.tPSV !== null && c2.tPSV <= c2.tPmax + DT, 'PSV ' + fmt(c2.tPSV) + ', peak at ' + c2.tPmax.toFixed(1) + ' s');
  ck('the peak sits above the safety setpoint and below the analysis\' 2748.5 psia (nominal ' +
     'safeties here, +3 % tolerance and a 0.8 s loop seal there)',
     c2.Pmax >= 2500 && c2.Pmax <= 2750, c2.Pmax.toFixed(0) + ' psia');
  ck('the pressurizer does NOT go water-solid (Ginna\'s own acceptance criterion, §15.2.2.4.3)',
     !c2.solid, 'level max ' + c2.Lmax.toFixed(1) + ' %');
  ck('the plant stays representable through the spike (no beyond-model latch)', !c2.dead, '');

  head('CASE 1  [spray + PORVs in AUTO, no dump, feed lost — the pressure control limits the spike]');
  var c1 = ride(RD, { pressureControl: true });
  if (!quiet) {
    console.log('  start ' + c1.P0.toFixed(0) + ' psia | 2425 indicated ' + fmt(c1.t2425) + ' | trip ' +
      fmt(c1.tTrip) + ' ' + (c1.cause || '') + ' | PORV passes ' + fmt(c1.tPORV) + ' | peak ' +
      c1.Pmax.toFixed(0) + ' psia at ' + c1.tPmax.toFixed(1) + ' s' + (c1.dead ? ' DEAD' : ''));
  }
  ck('with the pressure control credited the high-pressure trip is NOT reached and the PORV passes',
     c1.t2425 === null && c1.cause !== 'hi_pzr_press' && c1.tPORV !== null && !c1.dead,
     '2425 ' + fmt(c1.t2425) + ', PORV ' + fmt(c1.tPORV) + ', peak ' + c1.Pmax.toFixed(0) + ' psia');
  /* Ginna's Case 1 trips on OT delta-T at 11.6 s under MINIMUM (BOL) feedback; on this plant's
   * mid-cycle IC the power droops and delta-T falls, so OTdT cannot arrive — REPORTED, not
   * asserted (D5 §84 item 3: the BOL initial-condition option is the follow-up). */
  if (!quiet) console.log('  (Ginna Case 1 OTdT at 11.6 s needs the BOL minimum-feedback IC — reported, not gated: trip ' + fmt(c1.tTrip) + ')');
}

/* ---- run ---------------------------------------------------------------------------------- */
console.log('\nPWR2 -- THE SOURCED SPIKE: Ginna UFSAR ch15 §15.2.2 loss of load through the shell (#515)');
var rec = [];
runSuite(loadAll(), rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

/* ---- injection self-test: pwr2_pressurizer mutations that must red this runner ------------- */
var PZSRC = fs.readFileSync(path.join(SRC, 'pwr2_pressurizer.js'), 'utf8').replace(/\r\n/g, '\n');
var MUTATIONS = [
  ['tau_int -> 0 (the equilibrium vessel: every insurge condensed instantly — the old plant)',
   'if (isFinite(tau) && tau > 0) {',
   'if (true) { tau = 1e-9;'],
  ['the steam region is not compressed (a rigid steam space)',
   'var V_stm = pz.m_stm > 0 ? pz.m_stm / RHO(pz.h_stm + pz.v_stm * dP, P) : 0;',
   'var V_stm = pz.m_stm > 0 ? pz.m_stm / RHO(pz.h_stm, pz.P_ref) : 0;']
  /* NOT here: "the insurge lands in the POOL" (formulation 2) — invisible at plant level on a
   * 5 s spike (the pool's densification is small on that window); run_pwr2_pressurizer's
   * duty-step and P-only checks own it. A runner lists only the mutations it can see. */
];
console.log('\ninjection self-test (' + MUTATIONS.length + ' mutations):');
var blind = 0;
MUT.select(MUTATIONS).forEach(function (m) {
  var mutated = PZSRC.replace(m[1], m[2]);
  if (mutated === PZSRC) { console.log('  ANCHOR MISS ' + m[0] + '   <-- mutation did not apply'); blind++; return; }
  var rec2 = [];
  try { runSuite(loadAll(mutated), rec2, true); } catch (e) { /* a crash is caught too */ }
  var f2 = rec2.length ? rec2.filter(function (r) { return !r.ok; }).length : 1;
  if (f2 === 0) { console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); blind++; }
  else console.log('  caught    ' + m[0].padEnd(78) + f2 + ' checks red');
});
loadAll();   /* restore the real module for whoever requires after us */

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_lossofload: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
process.exit(fail === 0 && blind === 0 ? 0 : 1);
