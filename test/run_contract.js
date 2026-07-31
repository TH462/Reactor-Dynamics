/*
 * run_contract.js — §6.3 true_state contract guard (issue #225).
 *
 * WHAT IT ASSERTS. `Blueprint/CONTEXT.md` §6.3 is the documented `true_state` data
 * contract — the block M6/M8 consume against, and the one an agent reads before
 * touching the snapshot. This gate asserts the block and the engine agree EXACTLY,
 * in both directions:
 *
 *     engine field not in the doc   → UNDOCUMENTED   (undiscoverable, or consumed
 *                                                     anyway with no stated meaning)
 *     doc field not in the engine   → STALE          (the contract promises something
 *                                                     the snapshot no longer carries)
 *
 * WHY IT EXISTS. Nothing compared the two, so the gap grew silently to 41 of 82
 * fields. It was found only because #144 was filed against `fuel_damaged` — a field
 * that was in fact documented — which is what an unanswerable "is X in the contract?"
 * costs. By the time #225 was worked the filed list of 41 was itself stale: 12 had
 * since been documented and 2 NEW fields (`clad_temp_c` #213, `cw_inlet_temp_c`) had
 * appeared, so the real number was 29 of 84. A hand-maintained list regrows with
 * every instrument added; only a gate holds.
 *
 * HOW IT DISCRIMINATES. The engine side is the union of `Object.keys(getTrueState())`
 * over EVERY initial condition, so a field only present in one plant state still
 * counts. The doc side is parsed from the fenced block under the plant's heading in
 * §6.3, with `//` comments stripped first — otherwise a field name mentioned in a
 * neighbouring comment would document itself.
 *
 * The parse is fail-loud: a renamed heading or a reshaped block yields zero
 * documented keys, and this errors rather than reporting a clean 0/0.
 *
 * SCOPE. PWR only — see PLANTS below. RBMK and BWR are on hold and their §6.3 blocks
 * were never audited; reopening them is one flag each.
 *
 *   node test/run_contract.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
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
  // The RBMK/BWR CONTROL modules only — for the alarm-category section at the bottom
  // (#157), which covers all three plants. Their ENGINES are deliberately not loaded:
  // the §6.3 half above is PWR-only and stays that way (see PLANTS `skip`).
  'engines/rbmk/rbmk_config.js', 'layers/control/rbmk_control.js',
  'engines/bwr/bwr_config.js',   'layers/control/bwr_control.js',
].forEach(load);

var RD = globalThis.RD;

// Per-plant registration. `heading` is the bold label that opens the plant's block
// inside §6.3; `engine` builds a fresh instance. Set `skip` to a REASON string to
// register a plant without gating it — RBMK/BWR are on hold (CLAUDE.md), and their
// blocks have never been diffed, so turning them on is expected to be red until
// someone documents them. Do that work when the plants reopen, not before.
var PLANTS = [
  {
    id: 'PWR', heading: '**PWR:**',
    engine: function () { return new RD.PWREngine(); },
    states: function () { return Object.keys(RD.PWR_CONFIG.initial_states); },
  },
  { id: 'RBMK', heading: '**RBMK:**', skip: 'on hold — block never audited (#225 scope)' },
  { id: 'BWR',  heading: '**BWR:**',  skip: 'on hold — block never audited (#225 scope)' },
];

var CONTEXT = path.join(__dirname, '..', 'Blueprint', 'CONTEXT.md');
var SECTION = '### 6.3 true_state fields, per plant';

// ---------------------------------------------------------------- doc parse
var md = fs.readFileSync(CONTEXT, 'utf8');
var secAt = md.indexOf(SECTION);
if (secAt < 0) {
  console.error('CONTRACT GUARD: cannot find "' + SECTION + '" in Blueprint/CONTEXT.md.\n' +
    'If the section was renumbered, update SECTION in this file — do not delete the gate.');
  process.exit(2);
}
// Everything from §6.3 to the next heading of the same or higher level.
var secEnd = md.slice(secAt + SECTION.length).search(/\n#{1,3} /);
var section = secEnd < 0 ? md.slice(secAt) : md.slice(secAt, secAt + SECTION.length + secEnd);

function documentedKeys(heading) {
  var at = section.indexOf(heading);
  if (at < 0) return null;
  var rest = section.slice(at + heading.length);
  // The block is the first fenced code block after the heading.
  var open = rest.indexOf('```');
  if (open < 0) return null;
  var body = rest.slice(open + 3);
  var close = body.indexOf('```');
  if (close < 0) return null;
  body = body.slice(0, close);

  var keys = {};
  body.split('\n').forEach(function (line) {
    var code = line.replace(/\/\/.*$/, '');           // comments never document a field
    var re = /"([A-Za-z0-9_]+)"\s*:/g, m;
    while ((m = re.exec(code))) keys[m[1]] = true;
  });
  delete keys.true_state;                             // the wrapper, not a field
  return keys;
}

// ---------------------------------------------------------------- compare
var G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', D = '\x1b[2m', B = '\x1b[1m', X = '\x1b[0m';
var totalChecks = 0, totalBad = 0;

console.log(B + '§6.3 true_state contract guard — Blueprint/CONTEXT.md' + X + '\n');

PLANTS.forEach(function (p) {
  if (p.skip) {
    console.log(Y + '  ○ ' + p.id + X + D + '  skipped — ' + p.skip + X);
    return;
  }

  var doc = documentedKeys(p.heading);
  if (!doc || !Object.keys(doc).length) {
    console.error(R + 'CONTRACT GUARD: no documented fields parsed for ' + p.id +
      ' under "' + p.heading + '".' + X + '\n' +
      'The block moved or changed shape. Fix the parse — a silent 0 would pass everything.');
    process.exit(2);
  }

  // Union over every initial condition: a field that only exists in one plant
  // state is still part of the contract.
  // NOTE the argument shape: `reset()` takes a COMMAND OBJECT, and `reset('cold_shutdown')`
  // silently falls back to hot_full_power (pwr_engine.js:1140) — so a string here would
  // make this loop five identical resets while claiming to cover five plant states.
  var eng = p.engine();
  var fields = {};
  p.states().forEach(function (ic) {
    eng.reset({ plant_id: p.id.toLowerCase(), initial_state: ic });
    Object.keys(eng.getTrueState()).forEach(function (k) { fields[k] = true; });
  });

  var undocumented = Object.keys(fields).sort().filter(function (k) { return !doc[k]; });
  var stale = Object.keys(doc).sort().filter(function (k) { return !fields[k]; });

  // Every field name on EITHER side is one check — so adding an undocumented field
  // and documenting a phantom both move the tally, not just the failure count.
  var names = {};
  Object.keys(fields).forEach(function (k) { names[k] = true; });
  Object.keys(doc).forEach(function (k) { names[k] = true; });
  var checks = Object.keys(names).length;
  var bad = undocumented.length + stale.length;
  totalChecks += checks;
  totalBad += bad;

  console.log((bad ? R + '  ✗ ' : G + '  ✓ ') + p.id + X + '  ' +
    Object.keys(fields).length + ' engine fields, ' +
    Object.keys(doc).length + ' documented' +
    D + '  (' + p.states().length + ' initial conditions)' + X);

  if (undocumented.length) {
    console.log(R + '    UNDOCUMENTED — in getTrueState(), absent from §6.3 (' + undocumented.length + ')' + X);
    undocumented.forEach(function (k) { console.log(R + '      ✗' + X + ' ' + k); });
    console.log(D + '      Add each to the ' + p.id + ' block with a one-line description, in the\n' +
      '      existing style. A field nobody documented is a field nobody can consume safely.' + X);
  }
  if (stale.length) {
    console.log(Y + '    STALE — documented in §6.3, not emitted by the engine (' + stale.length + ')' + X);
    stale.forEach(function (k) { console.log(Y + '      ✗' + X + ' ' + k); });
    console.log(D + '      Delete them, or restore the field. A contract that promises a field the\n' +
      '      snapshot does not carry is worse than one that omits it.' + X);
  }
});

// ============================================================ alarm category (#157)
// The SECOND contract this file guards — the same failure in a different place: a value
// the UI consumes that nobody declared. `alarmCategory()` used to infer an alarm's system
// family by keyword-matching its ID. Measured, that was wrong or arguable for 13 of the
// PWR's 33, because the words it looks for live in LABELS as often as in ids —
// `charging_high` (CHG FLOW HI) fell through every rule to 'safety_system' since "flow"
// is not in the id. It is authored data now, and this asserts every alarm on every plant
// declares one, from a closed vocabulary.
//
// ALL THREE PLANTS, unlike the §6.3 half above. The category is authored beside the alarm
// so there is nothing plant-specific to audit — and RBMK's `sur_high` carried exactly the
// same miscategorisation the PWR's did, which is the argument for not scoping it to PWR.
var CATEGORIES = { reactivity: 1, coolant: 1, power: 1, instrument: 1, safety_system: 1 };
var ALARM_SETS = [
  ['pwr',  function () { return RD.PWR_CONTROL.protection.alarms; }],
  ['rbmk', function () { return RD.RBMK_CONTROL.forVersion('post_chernobyl').alarms; }],
  ['bwr',  function () { return RD.BWR_CONTROL.protection.alarms; }],
];
console.log('\n' + B + 'Alarm system-category — authored, not inferred (#157)' + X);
ALARM_SETS.forEach(function (set) {
  var id = set[0], list;
  try { list = set[1]() || []; }
  catch (e) {
    console.log(R + '  ✗ ' + id + X + '  could not read alarms: ' + e.message);
    totalBad++; totalChecks++; return;
  }
  // Fail loud on an empty list. A reshaped profile that yields zero alarms would
  // otherwise report a clean pass over nothing at all — the same shape of lie the
  // §6.3 parse above is deliberately fail-loud about.
  if (!list.length) {
    console.log(R + '  ✗ ' + id + X + '  no alarms found — profile reshaped?');
    totalBad++; totalChecks++; return;
  }
  var missing = list.filter(function (a) { return !a.category; }).map(function (a) { return a.id; });
  var unknown = list.filter(function (a) { return a.category && !CATEGORIES[a.category]; })
                    .map(function (a) { return a.id + '=' + a.category; });
  var seen = {};
  list.forEach(function (a) { if (a.category) seen[a.category] = 1; });
  totalChecks += list.length;
  totalBad += missing.length + unknown.length;
  console.log(((missing.length || unknown.length) ? R + '  ✗ ' : G + '  ✓ ') + id + X + '  ' +
    list.length + ' alarms' + (missing.length || unknown.length ? '' : ', all categorised') +
    D + '  (' + Object.keys(seen).sort().join(', ') + ')' + X);
  if (missing.length) {
    console.log(R + '    NO CATEGORY (' + missing.length + ')' + X);
    missing.forEach(function (k) { console.log(R + '      ✗' + X + ' ' + k); });
    console.log(D + '      Add `category:` beside `panel:` in the plant control module. The UI\n' +
      '      renders a missing category as "—" and does NOT guess, by design (#157).' + X);
  }
  if (unknown.length) {
    console.log(R + '    NOT IN THE VOCABULARY (' + unknown.length + ')' + X);
    unknown.forEach(function (k) { console.log(R + '      ✗' + X + ' ' + k); });
    console.log(D + '      Allowed: ' + Object.keys(CATEGORIES).join(', ') + X);
  }
});

console.log('\n' + B + '──────────────────────────────────────────' + X);
console.log(B + (totalBad ? R + 'CONTRACT GUARD: FAIL' : G + 'CONTRACT GUARD: OK') + X + '  ' +
  totalChecks + ' checks, ' + totalBad + ' failed' +
  D + (totalBad ? '' : '  (§6.3 agrees exactly; every alarm declares a category)') + X);
process.exit(totalBad ? 1 : 0);
