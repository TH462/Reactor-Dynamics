/* run_pwr2_afw.js — Layer 5 gate: auxiliary feedwater. (#479)
 *
 * THE CLAIM THIS LAYER MAKES is the TMI one: a drying steam generator stops absorbing heat
 * whatever the dump does, and main feedwater alone can never demonstrate it because a plant that
 * still has main feed never gets there. AFW is the secondary heat sink of last resort, so the
 * gate's job is proving the flow is REAL (sourced, scaled, reaches `drivers.feed`) and REFUSES to
 * run when not lined up -- not proving a curve, because there is no sourced curve to check.
 *
 * Run: node test/run_pwr2_afw.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var MUT = require('./mut_flags.js');   /* --no-mutations / --mut= / --grp= (#602) */
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_afw.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable'].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, W = RD.water;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.afw;';
  return new Function('RD_ROOT', body)(root);
}

/* THE SOURCE, RETYPED INDEPENDENTLY -- Ginna UFSAR ch10/ch15 (ML20339A040 / ML20339A101):
 * "Two motor driven auxiliary feedwater (MDAFW) pumps start to pump 170 gpm to each steam
 * generator." "The turbine-driven auxiliary feedwater pump (TDAFW) can supply 200% of the
 * required feedwater and one motor-driven auxiliary feedwater pump (MDAFW) can supply 100%..."
 * "Auxiliary feedwater temperature (F) 70 100 100". */
var DOC = { mdafw_gpm: 170, tdafw_gpm: 340, ginna_mwt: 1775, afw_temp_f: 70.0 };
var RATED_MWT = 300;

function runSuite(A, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(56) +
      'got ' + got.toFixed(4) + ' want ' + want.toFixed(4) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }

  /* ---- CONSTRUCTION, WRITTEN FIRST (D1 §31) ---------------------------------------------- */
  head('CONSTRUCTION  [a caller argument that never arrives is invisible to a physics check]');
  ck('caller mdafwAvail reaches the plant', A.createAFW({ mdafwAvail: 0.5 }).mdafwAvail, 0.5,
     1e-12, '');
  ck('caller tdafwAvail reaches the plant', A.createAFW({ tdafwAvail: 0.7 }).tdafwAvail, 0.7,
     1e-12, '');
  ckT('the default lineup is BOTH TRAINS SECURED',
      A.createAFW({}).mdafwRunning === false && A.createAFW({}).tdafwRunning === false,
      'a default of running would make every probe that omits AFW get free feedwater');

  /* ---- SOURCED ------------------------------------------------------------------------ */
  head('SOURCED  [Ginna ch10/ch15, retyped independently of the engine copy]');
  ck('MDAFW rated point matches the source', A.AFW.mdafw_ginna_gpm, DOC.mdafw_gpm, 1e-9, 'gpm');
  ck('TDAFW rated point matches the source', A.AFW.tdafw_ginna_gpm, DOC.tdafw_gpm, 1e-9, 'gpm');
  ck('TDAFW is exactly double one MDAFW -- the sourced 200%/100% ratio, not a coincidence',
     A.AFW.tdafw_ginna_gpm, 2 * A.AFW.mdafw_ginna_gpm, 1e-9, 'gpm');
  ck('AFW temperature matches the sourced design point', A.AFW.afw_temp_f, DOC.afw_temp_f,
     1e-9, 'degF');
  ck('scaling is POWER, not volume -- AFW removes decay HEAT',
     A.AFW.POWER_SCALE, RATED_MWT / DOC.ginna_mwt, 1e-12, '');

  /* ---- RATED FLOW SCALES WITH THE PLANT, NOT A CONSTANT --------------------------------- */
  head('RATED FLOW SCALES  [a hardcoded value at this plant\'s rating would pass the design point alone]');
  ckT('MDAFW rated flow is plant-plausible', A.mdafwRatedKgs() > 0.5 && A.mdafwRatedKgs() < 5,
      A.mdafwRatedKgs().toFixed(3) + ' kg/s (' + (DOC.mdafw_gpm * RATED_MWT / DOC.ginna_mwt).toFixed(1) +
      ' gpm scaled)');
  ckT('TDAFW rated flow is exactly double MDAFW\'s', Math.abs(A.tdafwRatedKgs() - 2 * A.mdafwRatedKgs()) <
      1e-9, A.mdafwRatedKgs().toFixed(4) + ' -> ' + A.tdafwRatedKgs().toFixed(4) + ' kg/s');

  /* ---- THE STEP: FLOW ONLY WHEN LINED UP, AND IT IS THE RATED VALUE --------------------- */
  head('THE STEP  [flow only when lined up; MERGED sources; no curve to fake]');
  var af0 = A.createAFW({});
  var r0 = A.stepAFW(af0, 0.02);
  ck('secured AFW delivers exactly zero', r0.total_kgs, 0, 1e-12, 'kg/s');
  var af1 = A.createAFW({ mdafwRunning: true });
  var r1 = A.stepAFW(af1, 0.02);
  ck('MDAFW alone delivers its rated flow', r1.total_kgs, A.mdafwRatedKgs(), 1e-9, 'kg/s');
  ck('...and tdafw_kgs is exactly zero, not fabricated', r1.tdafw_kgs, 0, 1e-12, 'kg/s');
  var af2 = A.createAFW({ mdafwRunning: true, tdafwRunning: true });
  var r2 = A.stepAFW(af2, 0.02);
  ck('BOTH trains sum, not replace each other', r2.total_kgs, A.mdafwRatedKgs() + A.tdafwRatedKgs(),
     1e-9, 'kg/s');
  ckT('availability degrades flow proportionally',
      Math.abs(A.stepAFW(A.createAFW({ mdafwRunning: true, mdafwAvail: 0.5 }), 0.02).total_kgs -
               0.5 * A.mdafwRatedKgs()) < 1e-9, '');
  ck('afw_flow_normalized is total against BOTH trains rated, not just what is running',
     r1.afw_flow_normalized, A.mdafwRatedKgs() / (A.mdafwRatedKgs() + A.tdafwRatedKgs()), 1e-9, '');
  ckT('enthalpy is the sourced 70 degF design point, not a placeholder',
      Math.abs(r1.h_kJkg - W.h_l((DOC.afw_temp_f - 32) * 5 / 9, 0.1)) < 1e-9,
      r1.h_kJkg.toFixed(2) + ' kJ/kg');

  /* ---- CUMULATIVE LEDGER ----------------------------------------------------------------- */
  head('CUMULATIVE LEDGER  [delivered_kg integrates what was actually sent]');
  var af3 = A.createAFW({ mdafwRunning: true });
  for (var i = 0; i < 100; i++) A.stepAFW(af3, 0.02);
  ck('delivered_kg integrates the rated flow over the run', af3.delivered_kg,
     A.mdafwRatedKgs() * 2.0, 1e-6 * A.mdafwRatedKgs() * 2.0, 'kg');

  /* ---- THE FLOW CONTROL VALVES (#562) ---------------------------------------------------
   * The operator's continuous post-trip task, and until 2026-08-27 this layer had no lever at
   * all: `rated x avail`, an on/off, with no level input and nothing upstream tapering it.
   * Measured full-stack with the valves open, a loss of offsite power took the generator to
   * 861.7 % of its own nominal inventory in five hours. SOURCED — WAT 05 Transients
   * (ML11216A094): "It is necessary to throttle AFW flow to control RCS temperature at this
   * point." ---- */
  head('THE FLOW CONTROL VALVES  [#562 — throttling is DELIVERY, never demand]');
  var afT = A.createAFW({ mdafwRunning: true, tdafwRunning: true });
  var rated = A.mdafwRatedKgs() + A.tdafwRatedKgs();
  [1, 0.75, 0.5, 0.25, 0].forEach(function (t) {
    afT.throttle = t;
    ck('throttle ' + (t * 100).toFixed(0) + ' % delivers that fraction of BOTH trains',
       A.stepAFW(afT, 0.02).total_kgs, rated * t, 1e-9, 'kg/s');
  });
  afT.throttle = 0;
  var rT0 = A.stepAFW(afT, 0.02);
  ckT('...and a throttled-shut valve leaves both pumps RUNNING — the #200 demand/delivery ' +
      'split, the same law the power gate and the discharge block already obey',
      rT0.mdafw_running === true && rT0.tdafw_running === true && rT0.total_kgs === 0,
      'a shut valve that secured the pumps would heal itself on the next START press');
  ck('afw_flow_normalized follows the throttle, so the gauge and the valve agree',
     (function () { afT.throttle = 0.4; return A.stepAFW(afT, 0.02).afw_flow_normalized; })(),
     0.4, 1e-9, '');
  /* MIGRATION, and it is load-bearing: pwr2_shell saves `aw` whole, so a pwr2-1.0 save taken
   * before this change restores an AFW object with NO throttle key. Absent must read WIDE
   * OPEN or every pre-2026-08-27 save silently loses auxiliary feedwater. */
  ckT('an ABSENT throttle is WIDE OPEN — old saves and Layer-5 fixtures behave exactly as ' +
      'they did before this field existed',
      (function () {
        var old = A.createAFW({ mdafwRunning: true });
        delete old.throttle;
        return Math.abs(A.stepAFW(old, 0.02).mdafw_kgs - A.mdafwRatedKgs()) < 1e-12;
      })(), '');
  ckT('the throttle is CLAMPED to 0..1 at construction — a pct above 100 cannot manufacture ' +
      'flow above the sourced rating',
      A.createAFW({ throttle: 3 }).throttle === 1 && A.createAFW({ throttle: -2 }).throttle === 0, '');
  ckT('the discharge block still beats the throttle — a wide-open valve behind tagged-shut ' +
      'valves delivers nothing (the TMI-2 lineup)',
      A.stepAFW(A.createAFW({ mdafwRunning: true, tdafwRunning: true, blocked: true,
                              throttle: 1 }), 0.02).total_kgs === 0, '');

  /* ---- REFUSAL / SANITY ------------------------------------------------------------------ */
  head('SANITY  [negative availability cannot manufacture negative flow]');
  ckT('negative availability clamps to zero, not a negative flow',
      A.stepAFW(A.createAFW({ mdafwRunning: true, mdafwAvail: -1 }), 0.02).total_kgs === 0, '');

  /* ---- THE ELECTRICAL SPLIT (#507 wave 4) ------------------------------------------------ */
  head('THE ELECTRICAL SPLIT  [MDAFW is a vital motor load; TDAFW is the sourced SBO survivor]');
  var afB = A.createAFW({ mdafwRunning: true, tdafwRunning: true });
  var rB = A.stepAFW(afB, 0.02, { mdafw_power_ok: false });
  ck('an unpowered MDAFW delivers exactly zero', rB.mdafw_kgs, 0, 1e-12, 'kg/s');
  ckT('...while its run flag STANDS -- running with no flow, never secured (#200 split)',
      rB.mdafw_running === true, '');
  ck('the TDAFW pump delivers its rated flow through the same blackout -- steam-driven, ' +
     'the WTSM 5.7.5 survivor', rB.tdafw_kgs, A.tdafwRatedKgs(), 1e-9, 'kg/s');
  ck('absent drivers mean POWERED -- the acAvailable convention, so every fixture above holds',
     A.stepAFW(A.createAFW({ mdafwRunning: true }), 0.02).mdafw_kgs, A.mdafwRatedKgs(),
     1e-9, 'kg/s');

  /* ---- THE DISCHARGE BLOCK (#507 wave 6) -- the TMI-2 tagged-shut valves ------------------ */
  head('THE BLOCK  [downstream of BOTH pumps; demand persists; delivery is what dies]');
  var afK = A.createAFW({ mdafwRunning: true, tdafwRunning: true, blocked: true });
  var rK = A.stepAFW(afK, 0.02);
  ckT('tagged-shut discharge valves dead-head BOTH trains while every run flag stands',
      rK.total_kgs === 0 && rK.mdafw_running === true && rK.tdafw_running === true &&
      rK.blocked === true,
      'the TMI-2 shape: pumps RUNNING, water going nowhere');
  afK.blocked = false;
  var rK2 = A.stepAFW(afK, 0.02);
  ck('opening the valves restores delivery at the STANDING demand -- no re-start needed (#200)',
     rK2.total_kgs, A.mdafwRatedKgs() + A.tdafwRatedKgs(), 1e-9, 'kg/s');
}

console.log('\nPWR2 Layer 5 -- AUXILIARY FEEDWATER');
var A = loadFrom(SRC), rec = [];
runSuite(A, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['default lineup starts RUNNING instead of secured (every probe gets free feedwater)',
   'mdafwRunning: opts.mdafwRunning === undefined ? false : !!opts.mdafwRunning,',
   'mdafwRunning: opts.mdafwRunning === undefined ? true : !!opts.mdafwRunning,'],
  ['TDAFW train silently dropped from the total (a real train vanishes)',
   'var total = md + td;', 'var total = md;'],
  /* THE THREE ANCHORS BELOW WERE RE-POINTED FOR #562 (2026-08-27): the throttle multiplies
   * both trains, so every `... * Math.max(0, af.xAvail) : 0;` gained a ` * thr`. A mutation
   * whose anchor a refactor moved goes BLIND, which the runner reports and which is easy to
   * scroll past — read the self-test line, not just the checks tally. */
  ['availability ignored (a degraded pump reports full flow)',
   'af.mdafwAvail) * thr : 0;', 'af.mdafwAvail) * thr : 0; md = af.mdafwRunning ? mdafwRatedKgs() : 0;'],
  ['rated flow stops scaling with plant rating (a hardcoded gpm masquerading as derived)',
   'function mdafwRatedKgs() { return gpmToKgs(AFW.mdafw_ginna_gpm * AFW.POWER_SCALE, 1000); }',
   'function mdafwRatedKgs() { return gpmToKgs(28.7, 1000); }'],
  ['TDAFW ratio to MDAFW silently changed (breaks the sourced 200%/100% relationship)',
   'tdafw_ginna_gpm: 340,', 'tdafw_ginna_gpm: 300,'],
  ['negative availability produces negative flow instead of clamping',
   '(open && af.mdafwRunning && mdPowered) ? mdafwRatedKgs() * Math.max(0, af.mdafwAvail) * thr : 0;',
   '(open && af.mdafwRunning && mdPowered) ? mdafwRatedKgs() * af.mdafwAvail * thr : 0;'],
  ['the MDAFW power gate is severed (a blacked-out motor pump keeps pumping)',
   'var mdPowered = !drivers || drivers.mdafw_power_ok !== false;',
   'var mdPowered = true;'],
  ['the discharge block is severed (tagged-shut valves pass water) -- #507 wave 6',
   'var open = !af.blocked;',
   'var open = true;'],
  ['the power gate lands on the TURBINE pump (the do-not-gate note violated)',
   'var td = (open && af.tdafwRunning) ? tdafwRatedKgs() * Math.max(0, af.tdafwAvail) * thr : 0;',
   'var td = (open && af.tdafwRunning && mdPowered) ? tdafwRatedKgs() * Math.max(0, af.tdafwAvail) * thr : 0;'],

  /* ---- #562: THE FLOW CONTROL VALVES ---------------------------------------------------- */
  ['the throttle is ignored on the MOTOR-driven train (the operator valve does nothing)',
   'mdafwRatedKgs() * Math.max(0, af.mdafwAvail) * thr : 0;',
   'mdafwRatedKgs() * Math.max(0, af.mdafwAvail) : 0;'],
  ['the throttle is ignored on the TURBINE-driven train (half the fill is un-throttleable)',
   'tdafwRatedKgs() * Math.max(0, af.tdafwAvail) * thr : 0;',
   'tdafwRatedKgs() * Math.max(0, af.tdafwAvail) : 0;'],
  ['a throttled-shut valve SECURES the pumps instead of stopping the flow (the #200 split)',
   'var thr = af.throttle === undefined ? 1 : Math.min(1, Math.max(0, af.throttle));',
   'var thr = af.throttle === undefined ? 1 : Math.min(1, Math.max(0, af.throttle));' +
   ' if (thr <= 0) { af.mdafwRunning = false; af.tdafwRunning = false; }'],
  ['the throttle is not clamped (a pct > 100 manufactures flow above the sourced rating)',
   'throttle: opts.throttle === undefined ? 1 : Math.min(1, Math.max(0, +opts.throttle)),',
   'throttle: opts.throttle === undefined ? 1 : +opts.throttle,'],
  ['an ABSENT throttle reads as SHUT (every old save and every Layer-5 fixture loses AFW)',
   'var thr = af.throttle === undefined ? 1 : Math.min(1, Math.max(0, af.throttle));',
   'var thr = af.throttle === undefined ? 0 : Math.min(1, Math.max(0, af.throttle));'],
  ['afw_flow_normalized divides by only the running trains instead of both rated',
   'var rated = mdafwRatedKgs() + tdafwRatedKgs();',
   'var rated = md + td;']
];

console.log('\n' + '='.repeat(70));
console.log('  INJECTION SELF-TEST -- every mutation MUST redden at least one check');
console.log('='.repeat(70));
var blind = 0;
if (fail > 0) {
  console.log('  ' + require('path').basename(__filename, '.js') + ': ' + pass +
              ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
  console.log('  MUTATION SELF-TEST SKIPPED -- ' + fail + ' check(s) failed in the CLEAN run.');
  process.exit(1);
}
MUT.select(MUTATIONS).forEach(function (m) {
  if (SRC.indexOf(m[1]) === -1) { console.log('  ERROR   anchor not found: ' + m[0]); blind++; return; }
  var r2 = [];
  try { runSuite(loadFrom(SRC.split(m[1]).join(m[2])), r2, true); }
  catch (e) { r2.push({ name: 'threw', ok: false }); }
  var f2 = r2.filter(function (r) { return !r.ok; }).length;
  if (f2 === 0) { blind++; console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); }
  else console.log('  caught    ' + m[0].padEnd(74) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_afw: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
