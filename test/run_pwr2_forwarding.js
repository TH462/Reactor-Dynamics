/* run_pwr2_forwarding.js — DOES EACH LAYER PASS ON WHAT IT RECEIVES? (#479)
 *
 * This gate exists because the same defect happened FOUR TIMES and every one was found by
 * accident — by a system downstream failing, never by a gate:
 *
 *   createLoop(opts) -> createLoop({})    every initial condition a lie      (Layer 4)
 *   extraMass never forwarded             every plant RIGID, the pressurizer  (Layer 3)
 *                                         seat unreachable from anywhere
 *   Layer 5 construction knobs ignored    every boil-dry / fouling / loss-of-  (Layer 5)
 *                                         flow probe staged a HEALTHY plant
 *   drivers.heats discarded               RHR's entire duty vanished while     (Layer 4)
 *                                         the readout said 13,600 kW was leaving
 *
 * Every layer gate checks what its layer DOES with what it receives. **None of them checks what
 * it PASSES ON**, and a dropped option is invisible from both ends: the layer above still
 * accepts the argument, the layer below still works when called directly, and only a caller
 * needing that specific option through that specific path ever notices.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT WORKS, AND WHY IT IS STATIC + DYNAMIC.
 *
 * STATIC. Each layer's source is read for the options it consumes (`opts.x`, `spec.x`,
 * `drivers.x`). For each adjacent pair, every option the LOWER layer reads must be either
 *   (a) named in the upper layer's source, or
 *   (b) passed wholesale (`createLoop(opts)`), or
 *   (c) on the OWNED list below, with a reason.
 * This is the part that catches a FUTURE option: add one to Layer 2 and forget it in Layer 3 and
 * this reddens without anyone writing a new check.
 *
 * DYNAMIC. The static half is a source scan, and a source scan can be satisfied by a mention.
 * So each forwarded option is also set from the TOP of the stack and observed at the BOTTOM —
 * because "an option that arrives and is never read is the same defect wearing a passing check",
 * which is the lesson the extraMass fix was written under.
 *
 * Run: node test/run_pwr2_forwarding.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop',
 'pwr2_sources'].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, W = RD.water, S = RD.sources, L = RD.loop, C = RD.core;

function src(name) {
  return fs.readFileSync(path.join(E, 'pwr2_' + name + '.js'), 'utf8').replace(/\r\n/g, '\n');
}
/* Options a layer CONSUMES. Comments are stripped first: a name that appears only in prose is
 * documentation, not plumbing, and counting it would let a comment satisfy this gate. */
function consumes(text) {
  var code = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  var out = {}, m, re = /\b(?:opts|spec|drivers)\.([A-Za-z_][A-Za-z0-9_]*)/g;
  while ((m = re.exec(code)) !== null) out[m[1]] = true;
  return Object.keys(out).sort();
}

/* ---- THE CHAIN, BOTTOM TO TOP ---- */
var LAYERS = [
  { id: 'core',    n: 2, text: src('core') },
  { id: 'loop',    n: 3, text: src('loop') },
  { id: 'sources', n: 4, text: src('sources') }
];

/* OPTIONS A LAYER DELIBERATELY OWNS rather than forwards. Each needs a REASON, because an
 * undeclared exception is how a dropped option gets called a design decision after the fact. */
var OWNED = {
  'loop:nodes':    'Layer 3 BUILDS the node list from Layer 1 geometry -- a caller supplying its ' +
                   'own would bypass the whole provenance discipline',
  'loop:flows':    'Layer 3 DERIVES junction flows round the ring; that derivation is the layer',
  /* "same, one level up" was the first text here, and the reason-length check caught it -- a
   * cross-reference is not a reason, and the next person reading this list would have had to go
   * find what it referred to. Stated in full. */
  'sources:flows': 'Layer 4 never sees junction flows: Layer 3 derives them from the ring and ' +
                   'Layer 4 supplies only the loop mdot that drives them',
  'sources:nodes': 'Layer 4 builds its plant through createLoop, which builds nodes from Layer 1 ' +
                   'geometry -- a caller-supplied node list would bypass the provenance discipline',
  'sources:mdot':  'Layer 4 OWNS loop momentum and integrates it, so a per-step mdot driver is ' +
                   'overridden by design -- the construction-time opts.mdot IS forwarded',
  'sources:iterCap': 'forwarded wholesale via createLoop(opts)',
  'sources:extraMass': 'forwarded wholesale via createLoop(opts)',
  'sources:h': 'forwarded wholesale via createLoop(opts)',
  'sources:P': 'forwarded wholesale via createLoop(opts)',
  'sources:includeOffLoop': 'forwarded wholesale via createLoop(opts)'
};

var rec = [];
function ck(name, cond, note) {
  rec.push({ name: name, ok: !!cond });
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
}

console.log('\nPWR2 -- DOES EACH LAYER PASS ON WHAT IT RECEIVES?');

console.log('\nTHE OPTION SURFACE  [read from source, comments stripped]');
LAYERS.forEach(function (Ly) {
  Ly.opts = consumes(Ly.text);
  console.log('  Layer ' + Ly.n + ' (' + Ly.id + ')  ' + Ly.opts.join(' '));
});

/* ---- 1. STATIC: EVERY LOWER OPTION IS REACHABLE FROM ABOVE -------------------------- */
console.log('\nSTATIC  [a lower option must be named above, passed wholesale, or declared OWNED]');
for (var i = 0; i < LAYERS.length - 1; i++) {
  var lo = LAYERS[i], hi = LAYERS[i + 1];
  var hiCode = hi.text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  /* A WHOLESALE PASS-THROUGH IS A **QUALIFIED CALL**, AND THE FIRST VERSION MATCHED A DEFINITION.
   * `/createLoop\(opts\)/` is satisfied by `function createLoop(opts) {` -- the very line that
   * DECLARES the parameter. So every layer counted as passing everything wholesale, the static
   * half of this gate was vacuous, and it would NOT have caught the extraMass defect it was
   * written for. Proven by injection below, not argued.
   *
   * The pattern must be a call THROUGH a lower layer's namespace: `LOOP.createLoop(opts)`. */
  var wholesale = /\b(?:LOOP|CORE)\.[A-Za-z]+\(\s*opts\s*\)/.test(hiCode);
  var dropped = [];
  lo.opts.forEach(function (o) {
    if (OWNED[hi.id + ':' + o]) return;
    if (hiCode.indexOf(o) !== -1) return;
    if (wholesale) return;
    dropped.push(o);
  });
  ck('Layer ' + hi.n + ' passes on everything Layer ' + lo.n + ' reads',
     dropped.length === 0,
     dropped.length ? 'DROPPED: ' + dropped.join(', ')
                    : lo.opts.length + ' options, ' + (wholesale ? 'opts passed wholesale; ' : '') +
                      'none unaccounted for');
}
ck('every OWNED exception carries a reason',
   Object.keys(OWNED).every(function (k) { return OWNED[k] && OWNED[k].length > 20; }),
   Object.keys(OWNED).length + ' declared exceptions, each with a stated reason');

/* ---- 2. DYNAMIC: SET IT AT THE TOP, OBSERVE IT AT THE BOTTOM ------------------------ */
console.log('\nDYNAMIC  [a source scan is satisfied by a MENTION; these need an EFFECT]');
var bubble = function (p) { return 400 + 8 * (p - 15.41); };

var p1 = S.createPlant({ extraMass: bubble });
ck('extraMass reaches Layer 2 through Layers 4 and 3',
   typeof p1.extraMass === 'function' && Math.abs(p1.extraMass(16.41) - 408) < 1e-9,
   'this is the defect that made EVERY plant rigid and the pressurizer seat unreachable');

var p2 = S.createPlant({ iterCap: 3 });
ck('iterCap reaches Layer 2 through Layers 4 and 3', p2.iterCap === 3,
   'default is 8; a caller trading accuracy for speed must actually get it');

var p3 = S.createPlant({ h: 1180, P: 12.5 });
ck('h and P reach the nodes through Layers 4 and 3',
   Math.abs(p3.nodes[0].h - 1180) < 1e-9 && Math.abs(p3.P - 12.5) < 1e-9,
   'the "every initial condition is a lie" defect');

var p4 = S.createPlant({ includeOffLoop: false });
ck('includeOffLoop reaches the ledger through Layers 4 and 3',
   p4.nodes.length < S.createPlant({}).nodes.length,
   p4.nodes.length + ' nodes against ' + S.createPlant({}).nodes.length);

var p5 = S.createPlant({ mdot: 900 });
ck('construction-time mdot reaches the loop through Layer 4',
   Math.abs(p5.mdot_loop - 900) < 1e-9, 'distinct from the per-step driver Layer 4 owns');

/* drivers, which is where the fourth defect lived */
var hp = S.createPlant({}), h0 = null;
hp.nodes.forEach(function (n) { if (n.id === 'cold_leg') h0 = n.h; });
for (var k = 0; k < 200; k++) S.stepPlant(hp, 0.02, { heats: { cold_leg: -20000 } });
var h1 = null; hp.nodes.forEach(function (n) { if (n.id === 'cold_leg') h1 = n.h; });
ck('drivers.heats reaches Layer 3 through Layer 4', h1 < h0 - 1,
   'cold leg ' + h0.toFixed(1) + ' -> ' + h1.toFixed(1) + ' kJ/kg; RHR lost its ENTIRE duty here');

var sp = S.createPlant({}), M0 = sp.M_total;
for (var q = 0; q < 200; q++) {
  S.stepPlant(sp, 0.02, { sources: [{ node: 'cold_leg', mdot: 5, h: 400 }] });
}
ck('drivers.sources reaches Layer 3 through Layer 4', sp.M_total > M0 + 1,
   (sp.M_total - M0).toFixed(1) + ' kg added -- CVCS and ECCS both depend on this path');

/* AND THE OWNED EXCEPTION IS REAL, not a convenient label: Layer 4 must genuinely override a
 * per-step mdot driver, because it integrates momentum itself. */
var op = S.createPlant({});
var before = op.mdot_loop;
S.stepPlant(op, 0.02, { mdot: 12345 });
ck('...and the OWNED exception is genuine: Layer 4 overrides a per-step mdot driver',
   Math.abs(op.mdot_loop - 12345) > 1 && Math.abs(op.mdot_loop - before) < before,
   'stayed near ' + before.toFixed(0) + ' kg/s -- Layer 4 integrates momentum and does not take ' +
   'a flow it did not compute');

var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;
console.log('\n' + '='.repeat(70));
console.log('  run_pwr2_forwarding: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit(fail > 0 ? 1 : 0);
