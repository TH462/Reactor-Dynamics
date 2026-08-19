/* run_pwr2_relief.js — Layer 5 gate: secondary relief. (#479)
 *
 * THE THING MOST AT RISK IN THIS FILE IS THE LATCH, not the setpoints.
 *
 * A safety valve that opens on `P >= pop` and closes on `P < pop` is one character different from
 * a correct one and behaves completely differently: it chatters at the setpoint, passing a
 * time-average of its capacity instead of lifting cleanly, and the secondary rings. That failure
 * looks like noisy physics rather than a bug — the plant still balances, the pressure still gets
 * relieved, and the only tell is a valve that opens and shuts every timestep. So the gate walks
 * the pressure UP THROUGH the setpoint AND BACK DOWN, and requires the valve to still be open
 * between the reseat point and the pop point on the way down. Nothing else can distinguish a
 * latched valve from a stateless one.
 *
 * ⚠ AND ONE THING THIS GATE MUST NOT DO: check that the dump opens. It has no opinion about when
 * the dump should open — that is a control-layer decision by owner ruling, and a check asserting a
 * dump position would be this gate reaching into the layer above. What it checks instead is that a
 * COMMANDED position produces the sourced flow, and that the layer computes no position of its own.
 *
 * Run: node test/run_pwr2_relief.js
 */
'use strict';
var fs = require('fs'), path = require('path');
/* pwr2_water is loaded ONLY for the ADV's 4%-of-RTP cross-check (h_fg at the setpoint) --
 * relief itself carries fractions and needs no properties, which the sandbox loader preserves. */
require(path.join(__dirname, '..', 'engines', 'pwr2', 'pwr2_water.js'));
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_relief.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');

function loadFrom(src) {
  var root = { RD: { pwr2: {} } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.relief;';
  return new Function('RD_ROOT', body)(root);
}

/* THE SOURCES, RETYPED INDEPENDENTLY of the engine's copy — the ECCS discipline.
 *   Ginna TS Bases (ML20339A221): MSSVs hold secondary at "approximately 1085 psig"
 *   Ginna UFSAR ch10 §10.4 (ML20339A040): eight dump valves passing "approximately 28% rated
 *   steam flow"  */
var DOC = { safety_pop_psig: 1085.0, dump_frac: 0.28, safety_flow_frac: 0.84, blowdown: 0.033 };
var RATED = 164.25;      /* kg/s — this plant's rated steam flow (D4 §21.2, §22.2) */

function runSuite(R, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(58) +
      'got ' + got.toFixed(4) + ' want ' + want.toFixed(4) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }
  function step(rl, P, d) {
    return R.stepRelief(rl, P, 1, Object.assign({ rated_steam_kgs: RATED }, d || {}));
  }

  /* ---- CONSTRUCTION, WRITTEN FIRST (D1 §31) ---------------------------------------------- */
  head('CONSTRUCTION  [a caller argument that never arrives is invisible to a physics check]');
  ckT('caller safety state reaches the plant', R.createRelief({ safety_open: true }).safety_open === true, '');
  ck('caller relieved total reaches the plant', R.createRelief({ relieved_kg: 55 }).relieved_kg,
     55, 1e-12, 'kg');
  ckT('the default lineup is SHUT and unlifted',
      R.createRelief({}).safety_open === false && R.createRelief({}).relieved_kg === 0,
      'a default of lifted would make every probe that omits it relieve a plant nobody overpressured');

  /* ---- SOURCED CONSTANTS ------------------------------------------------------------------ */
  head('SOURCED  [Ginna, this plant\'s own anchor -- nothing needed re-anchoring]');
  ck('the safety pop setpoint matches the source', R.RELIEF.safety_pop_psig, DOC.safety_pop_psig,
     1e-12, 'psig');
  ck('...and its MPa form is DERIVED from the psig figure, not typed beside it',
     R.RELIEF.safety_pop_mpa, (DOC.safety_pop_psig + 14.7) / R.PSI_PER_MPA, 1e-12, 'MPa');
  ck('the dump capacity matches the source', R.RELIEF.dump_capacity_frac, DOC.dump_frac,
     1e-12, 'frac');
  ck('the safety full-lift capacity matches the source', R.RELIEF.safety_flow_frac,
     DOC.safety_flow_frac, 1e-12, 'frac');
  ck('the blowdown fraction is the derived valve-class figure', R.RELIEF.safety_blowdown,
     DOC.blowdown, 1e-12, '');
  ckT('the pop setpoint is ABOVE this plant\'s no-load secondary pressure',
      R.RELIEF.safety_pop_mpa > 7.03,
      R.RELIEF.safety_pop_mpa.toFixed(3) + ' MPa against Ginna no-load 7.03 — a safety that lifted ' +
      'below no-load would be open at every hot shutdown');

  /* ---- THE LATCH. The load-bearing check in this file. ------------------------------------- */
  head('THE LATCH  [a stateless valve chatters, and chattering looks like noisy physics]');
  var pop = R.RELIEF.safety_pop_mpa, reseat = R.safetyReseatMpa();
  ckT('reseat sits BELOW pop by the blowdown fraction',
      Math.abs(reseat - pop * (1 - DOC.blowdown)) < 1e-12 && reseat < pop,
      pop.toFixed(4) + ' -> ' + reseat.toFixed(4) + ' MPa');
  var rl = R.createRelief({});
  ckT('below the setpoint it stays shut', step(rl, pop - 0.01).safety_kgs === 0, '');
  ckT('at the setpoint it lifts', step(rl, pop + 0.001).safety_open === true, '');
  /* THE ONE THAT MATTERS: on the way DOWN, between reseat and pop, a latched valve is still open
   * and a stateless one has already shut. */
  var mid = (pop + reseat) / 2;
  ckT('...and STAYS open between reseat and pop on the way down', (function () {
        var o = step(rl, mid);
        return o.safety_open === true && o.safety_kgs > 0;
      })(), 'a stateless "open if P >= pop" valve is SHUT here — this is the only check that ' +
            'separates them, and the difference is chatter at the setpoint');
  ckT('it reseats only once pressure falls through the blowdown point',
      step(rl, reseat - 0.001).safety_open === false, '');
  ckT('...and having reseated, it does NOT re-open at the same mid pressure',
      step(rl, mid).safety_open === false,
      'the hysteresis works in both directions, or it is not hysteresis');

  /* ---- SAFETY FLOW ------------------------------------------------------------------------- */
  head('SAFETY FLOW  [a bank of staggered valves, lumped into one ramp]');
  var rl2 = R.createRelief({});
  step(rl2, pop + 0.001);                                       /* lift it */
  var full = step(rl2, reseat + R.RELIEF.safety_full_lift_mpa + 0.5);
  ck('at full lift it passes the sourced fraction of rated flow', full.safety_kgs,
     DOC.safety_flow_frac * RATED, 1e-9, 'kg/s');
  ckT('...and it CLAMPS there rather than growing without bound',
      Math.abs(step(rl2, 20).safety_kgs - full.safety_kgs) < 1e-9,
      'at 20 MPa it still passes ' + full.safety_kgs.toFixed(2) + ' kg/s');
  ckT('flow RAMPS between first lift and full lift, it does not step', (function () {
        var a = step(rl2, reseat + 0.05).safety_kgs, b = step(rl2, reseat + 0.20).safety_kgs;
        return a > 0 && b > a && b < full.safety_kgs;
      })(), 'a single valve popping to full flow at one pressure would make the secondary ring');

  /* ---- THE DUMP: HYDRAULICS ONLY ----------------------------------------------------------- */
  head('THE DUMP  [hydraulics here; the POSITION is the control layer\'s, by ruling]');
  var rl3 = R.createRelief({});
  ck('a fully commanded dump passes the sourced 28 % of rated',
     step(rl3, 6.0, { dump_demand: 1.0 }).dump_kgs, DOC.dump_frac * RATED, 1e-9, 'kg/s');
  ck('half a command passes half of that',
     step(rl3, 6.0, { dump_demand: 0.5 }).dump_kgs, 0.5 * DOC.dump_frac * RATED, 1e-9, 'kg/s');
  ckT('no command means no dump flow', step(rl3, 6.0, {}).dump_kgs === 0,
      'this layer has no setpoint and no Tavg error — it opens nothing on its own');
  ckT('the dump does not open itself at ANY pressure', (function () {
        var any = false;
        for (var P = 4; P <= 12; P += 0.25) if (step(R.createRelief({}), P, {}).dump_kgs > 0) any = true;
        return !any;
      })(), 'swept 4-12 MPa with no command: a layer that opened its own dump would be deciding a ' +
            'position, which is the control layer\'s job');
  ckT('a command outside 0..1 is clamped, not trusted',
      step(rl3, 6.0, { dump_demand: 5 }).dump_kgs === DOC.dump_frac * RATED &&
      step(rl3, 6.0, { dump_demand: -2 }).dump_kgs === 0, '');

  /* ---- CONDENSER AVAILABILITY -------------------------------------------------------------- */
  head('THE CONDENSER  [the dump discharges to it, so losing it removes the path]');
  ckT('with no condenser a commanded dump passes nothing',
      step(R.createRelief({}), 6.0, { dump_demand: 1.0, condenser_available: false }).dump_kgs === 0, '');
  ckT('...but the COMMAND is still reported, so the two states do not look alike', (function () {
        var o = step(R.createRelief({}), 6.0, { dump_demand: 1.0, condenser_available: false });
        return o.dump_demand === 1.0 && o.dump_available === false;
      })(), 'a commanded-open dump with no condenser is a different plant state from a shut one');
  ckT('the safety valves do NOT need the condenser', (function () {
        var o = step(R.createRelief({}), pop + 0.5, { condenser_available: false });
        return o.safety_kgs > 0;
      })(), 'they discharge to atmosphere — losing the condenser must not disable the last resort');

  /* ---- TOTALS ------------------------------------------------------------------------------ */
  /* ---- THE ADV (the middle rung, 2026-08-19) — Ginna TS Bases B 3.7.4 ------------------- */
  head('THE ADV  [below the safeties, above the dump — and it does NOT need the condenser]');
  ck('the auto setpoint sits BELOW the safety pop, [derived] at the WAT-05 margin',
     (R.RELIEF.safety_pop_mpa - R.RELIEF.adv_setpoint_mpa) * 145.0377, 45, 0.5, 'psi');
  ck("capacity is Ginna's 329,000 lb/hr per-MWt scaled, one valve on one loop",
     R.RELIEF.adv_kgs, 329000 / 7936.64 * 300 / 1520, 1e-9, 'kg/s');
  ckT('...which is the source own "approximately 4% of RTP" cross-check',
      (function () {
        var W2 = globalThis.RD.pwr2.water;
        var rtp = R.RELIEF.adv_kgs * W2.h_fg(R.RELIEF.adv_setpoint_mpa) / 300000;
        return rtp > 0.035 && rtp < 0.05;
      })(), 'capacity x h_fg at the setpoint, over 300 MWt');
  var rlA = R.createRelief({});
  var below = step(rlA, R.RELIEF.adv_setpoint_mpa - 0.05);
  var mid = step(rlA, R.RELIEF.adv_setpoint_mpa + R.RELIEF.adv_band_mpa / 2);
  var full = step(rlA, R.RELIEF.adv_setpoint_mpa + R.RELIEF.adv_band_mpa + 0.02);
  ckT('shut below the setpoint, HALF at mid-band, FULL above it — a modulating valve, not a pop',
      below.adv_kgs === 0 && Math.abs(mid.adv_frac - 0.5) < 0.01 &&
      Math.abs(full.adv_kgs - R.RELIEF.adv_kgs) < 1e-9,
      "the pneumatic controller's shape; the SAFETIES are the latching pop, not this");
  ckT('...and FULL before the safeties lift — the rung ordering is the point',
      full.safety_open === false && full.adv_kgs > 0,
      (R.RELIEF.adv_setpoint_mpa * 145.04 - 14.7).toFixed(0) + ' + band < 1085 psig pop');
  ckT('the OPERATOR can open it at ANY pressure — function (b), the condenser-less cooldown',
      step(R.createRelief({}), 6.0, { adv_demand: 0.7 }).adv_frac === 0.7,
      'adv_demand is the cooldown lever; auto and manual take the max');
  ckT('...and it flows with the condenser GONE, which is its whole reason to exist',
      step(R.createRelief({}), 6.0, { adv_demand: 1.0, condenser_available: false }).adv_kgs > 0 &&
      step(R.createRelief({}), 6.0, { dump_demand: 1.0, condenser_available: false }).dump_kgs === 0,
      'same step: the dump dies with the condenser, the ADV does not — atmospheric discharge');
  ckT('the BLOCK VALVE isolates it, auto and manual alike — the failed-open ARV lever',
      step(R.createRelief({}), full ? R.RELIEF.adv_setpoint_mpa + 1 : 8,
           { adv_demand: 1.0, adv_block: false }).adv_kgs === 0,
      '"upstream block valves ... to isolate a failed open ARV" (B 3.7.4)');

  head('TOTALS AND REPORTING');
  var rl4 = R.createRelief({});
  var both = step(rl4, pop + 0.5, { dump_demand: 1.0 });
  ck('the total is the sum of the paths', both.total_kgs,
     both.safety_kgs + both.dump_kgs + both.adv_kgs,
     1e-12, 'kg/s');
  ck('...reported as a fraction of rated', both.total_frac, both.total_kgs / RATED, 1e-12, '');
  ckT('relieved mass accumulates over time', (function () {
        var r5 = R.createRelief({});
        R.stepRelief(r5, 6.0, 10, { rated_steam_kgs: RATED, dump_demand: 1.0 });
        return Math.abs(r5.relieved_kg - DOC.dump_frac * RATED * 10) < 1e-9;
      })(), '');

  /* ---- REFUSAL ----------------------------------------------------------------------------- */
  head('REFUSAL  [every capacity here is a FRACTION of a plant this layer does not know]');
  ckT('omitting the rated steam flow throws rather than assuming one', (function () {
        try { R.stepRelief(R.createRelief({}), 6.0, 1, { dump_demand: 1 }); return false; }
        catch (e) { return /rated_steam_kgs/.test(e.message); }
      })(), '');
}

console.log('\nPWR2 Layer 5 -- RELIEF: the steam paths that are not the turbine');
var R = loadFrom(SRC), rec = [];
runSuite(R, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['the ADV auto function is dead (overpressure rides straight to the safeties)',
   'var advAuto = (P_mpa - RELIEF.adv_setpoint_mpa) / RELIEF.adv_band_mpa;',
   'var advAuto = 0 * (P_mpa - RELIEF.adv_setpoint_mpa) / RELIEF.adv_band_mpa;'],
  ['the ADV is gated on the condenser (function (b) deleted)',
   'var advFrac = advBlock ? Math.max(advAuto, advMan) : 0;',
   'var advFrac = advBlock && avail ? Math.max(advAuto, advMan) : 0;'],
  /* the mutation must hit the DERIVED MPa, not the display psig — the two are separate
   * literals (the safety pop has the same shape), and mutating the label moves nothing */
  ['the ADV setpoint drifts ABOVE the safety pop (the rung ordering inverts)',
   'adv_setpoint_mpa:    (1040.0 + 14.7) / PSI_PER_MPA,',
   'adv_setpoint_mpa:    (1100.0 + 14.7) / PSI_PER_MPA,'],
  ['the block valve is ignored',
   'var advBlock = drivers.adv_block === undefined ? true : !!drivers.adv_block;',
   'var advBlock = true;'],
  ['THE LATCH IS LOST — a stateless valve that chatters at the setpoint',
   '    if (!rl.safety_open && P_mpa >= RELIEF.safety_pop_mpa) rl.safety_open = true;\n    else if (rl.safety_open && P_mpa <= reseat) rl.safety_open = false;',
   '    rl.safety_open = P_mpa >= RELIEF.safety_pop_mpa;'],
  ['the valve reseats at the POP pressure (no blowdown, so no hysteresis)',
   'else if (rl.safety_open && P_mpa <= reseat) rl.safety_open = false;',
   'else if (rl.safety_open && P_mpa <= RELIEF.safety_pop_mpa) rl.safety_open = false;'],
  ['blowdown inverted — reseat ABOVE pop', 'return RELIEF.safety_pop_mpa * (1 - RELIEF.safety_blowdown);',
   'return RELIEF.safety_pop_mpa * (1 + RELIEF.safety_blowdown);'],
  ['the safety pop setpoint moves off the sourced Ginna figure',
   'safety_pop_psig:     1085.0,', 'safety_pop_psig:     1234.0,'],
  ['the MPa setpoint is typed instead of derived from the psig figure',
   'safety_pop_mpa:      (1085.0 + 14.7) / PSI_PER_MPA,', 'safety_pop_mpa:      7.5,'],
  ['the dump capacity moves off the sourced 28 % to the fleet-typical 40 %',
   'dump_capacity_frac:  0.28,', 'dump_capacity_frac:  0.40,'],
  ['the safety full-lift capacity moves off its sourced fraction',
   'safety_flow_frac:    0.84,', 'safety_flow_frac:    0.50,'],
  ['safety flow no longer clamps at full lift (unbounded with pressure)',
   '      if (lift > 1) lift = 1;', ''],
  ['safety flow STEPS to full capacity instead of ramping',
   '      var lift = (P_mpa - reseat) / RELIEF.safety_full_lift_mpa;', '      var lift = 1;'],
  ['THE LAYER DECIDES ITS OWN DUMP POSITION (control logic in the engine)',
   '    var demand = drivers.dump_demand === undefined ? 0 : drivers.dump_demand;',
   '    var demand = drivers.dump_demand === undefined ? (P_mpa > 7.03 ? 1 : 0) : drivers.dump_demand;'],
  ['the dump command is trusted unclamped',
   '    if (demand > 1) demand = 1;', ''],
  ['losing the condenser stops the SAFETY valves too',
   '      safety = lift * RELIEF.safety_flow_frac * rated;',
   '      safety = avail ? lift * RELIEF.safety_flow_frac * rated : 0;'],
  ['the dump ignores condenser availability',
   '    var dump = avail ? demand * RELIEF.dump_capacity_frac * rated : 0;',
   '    var dump = demand * RELIEF.dump_capacity_frac * rated;'],
  ['the commanded position stops being reported when the condenser is lost',
   '      dump_demand: demand,', '      dump_demand: avail ? demand : 0,'],
  ['relieved mass stops accumulating', '    rl.relieved_kg += total * dt;', ''],
  ['the total drops the dump path', '    var total = safety + dump + adv;', '    var total = safety + adv;'],
  /* CONSTRUCTION */
  ['caller safety state ignored at construction',
   'safety_open:  opts.safety_open === undefined ? false : !!opts.safety_open,',
   'safety_open:  false,'],
  ['caller relieved total ignored at construction',
   'relieved_kg:  opts.relieved_kg === undefined ? 0 : opts.relieved_kg',
   'relieved_kg:  0'],
  ['the default lineup ships LIFTED',
   'safety_open:  opts.safety_open === undefined ? false : !!opts.safety_open,',
   'safety_open:  opts.safety_open === undefined ? true : !!opts.safety_open,']
];

if (fail > 0) {
  console.log('  ' + require('path').basename(__filename, '.js') + ': ' + pass +
              ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
  console.log('  MUTATION SELF-TEST SKIPPED -- ' + fail + ' check(s) failed in the CLEAN run.');
  console.log('  A failing check fails in every mutant too, so every mutation would report as');
  console.log('  caught and the coverage number would be a lie. Fix the check first.');
  process.exit(1);
}

console.log('\n' + '='.repeat(70));
console.log('  INJECTION SELF-TEST -- every mutation MUST redden at least one check');
console.log('='.repeat(70));
var blind = 0;
MUTATIONS.forEach(function (m) {
  if (SRC.indexOf(m[1]) === -1) { console.log('  ERROR   anchor not found: ' + m[0]); blind++; return; }
  var r2 = [];
  try { runSuite(loadFrom(SRC.split(m[1]).join(m[2])), r2, true); }
  catch (e) { r2.push({ name: 'threw', ok: false }); }
  var f2 = r2.filter(function (r) { return !r.ok; }).length;
  if (f2 === 0) { blind++; console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); }
  else console.log('  caught    ' + m[0].padEnd(72) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_relief: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
