/*
 * run_hr3.js — HR3 guard for the shared control kernel (issue #227).
 *
 * HR3: "Plant-specific behavior is data, not hardcoded logic." `control_kernel.js`
 * is the GENERAL kernel — every plant runs through it — so it must not name any one
 * plant's instruments, control-state fields, true-state fields or commands. The
 * per-plant modules (`pwr_control.js` etc.) are exactly where those names belong.
 *
 * WHY THIS EXISTS. The rule was already stated inside the kernel, next to the fix
 * pattern for it — `_stepBang` carries "busyNote: optional per-plant status suffix
 * (HR3 — no plant fields here)". The violation still came back: the boron
 * batch-dose work re-created the identical leak in `_stepConc` (#156), about forty
 * lines below that comment, and it shipped. A rule with no gate holds only as long
 * as the next author happens to read the neighbouring comment.
 *
 * HOW IT DISCRIMINATES. The plant vocabulary is DERIVED FROM THE ENGINES, not
 * hand-listed, so it stays current as plants gain fields — and the test for
 * "plant-specific" falls out of the data:
 *
 *     a token that ALL THREE plants define is a shared concept, not a plant
 *     specific — `scrammed`, `rod_groups`, `power_pct`, `inject_failure`
 *
 * so those need no allow-list entry and never will. Only tokens fewer than three
 * plants define are candidates, and each of those must be listed in ALLOWED with a
 * reason. That list is the point of this gate: it converts couplings that were
 * accepted in passing comments into decisions someone actually wrote down.
 *
 * Substring matching would not work here — an early hand-written version matched
 * `orm` (the RBMK operating reactivity margin) inside the word "normal". Matching
 * is word-boundary, over comment-stripped source.
 *
 *   node test/run_hr3.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
function load(p) { require(path.join(__dirname, '..', p)); }
[
  'engines/load_mode.js',
  'engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js',
  'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js',
  'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
  'engines/rbmk/rbmk_config.js', 'layers/control/rbmk_control.js', 'engines/rbmk/rbmk_kinetics.js',
  'engines/rbmk/rbmk_thermal.js', 'engines/rbmk/rbmk_rods.js', 'engines/rbmk/rbmk_instruments.js',
  'engines/rbmk/rbmk_engine.js',
  'engines/bwr/bwr_config.js', 'layers/control/bwr_control.js', 'engines/bwr/bwr_vessel.js',
  'engines/bwr/bwr_recirculation.js', 'engines/bwr/bwr_safety_systems.js', 'engines/bwr/bwr_instruments.js',
  'engines/bwr/bwr_engine.js',
  'layers/control/control_kernel.js',
].forEach(load);
var RD = globalThis.RD;

var TARGET = 'layers/control/control_kernel.js';

// ---------------------------------------------------------------- allow-list
// Every plant-specific token the kernel is ALLOWED to name, with the reason. A
// token missing from here fails the gate. Adding one is deliberately a little
// uncomfortable: you are recording that the general kernel knows about one plant.
var ALLOWED = {
  // --- `valueFieldFor` (:60-75): a command -> parameter-field lookup. -----------
  // The kernel must know which field carries a value-bearing command's value in
  // order to apply a failure override to it, and that differs per command. This is
  // a data table, not logic, so it sits on the right side of HR3's letter — but it
  // is still every plant's command vocabulary living in shared code, and the
  // honest description is "accepted, and a candidate for relocation into the plant
  // control modules". Recorded rather than left implicit.
  set_afw: 'valueFieldFor lookup table',
  set_afw_flow: 'valueFieldFor lookup table',
  set_channel_flow: 'valueFieldFor lookup table',
  set_charging_flow: 'valueFieldFor lookup table',
  set_dhr: 'valueFieldFor lookup table',
  set_eps_bypass: 'valueFieldFor lookup table',
  set_feed_pump_speed: 'valueFieldFor lookup table',
  set_heater: 'valueFieldFor lookup table',
  set_hpci: 'valueFieldFor lookup table',
  set_hpi: 'valueFieldFor lookup table',
  set_letdown_flow: 'valueFieldFor lookup table',
  set_rcic: 'valueFieldFor lookup table',
  set_recirc_flow: 'valueFieldFor lookup table',
  set_rhr: 'valueFieldFor lookup table',
  set_rhr_hx: 'valueFieldFor lookup table',
  set_spray: 'valueFieldFor lookup table',
  set_steam_demand: 'valueFieldFor lookup table',
  set_turbine_load: 'valueFieldFor lookup table',
  feed_pump_nudge: 'valueFieldFor lookup table',

  // --- the boron cluster: the `bang` and `conc` channel kinds ------------------
  // These two automation-channel kinds ARE PWR boron machinery living in the
  // kernel — they issue set_boron_adjust/take_boron_sample and read the boron
  // sample instruments directly. The kernel's own comment (:1024-1025) calls this
  // "a conc-kind plant coupling", i.e. it was accepted; this list is where that
  // acceptance stops being a passing remark. Genuinely generalising it means
  // giving `conc` a plant-supplied command/instrument binding, the way the pump
  // gate got `pausedWhen` in #156.
  set_boron_adjust: 'conc/bang channel kinds are PWR boron machinery — accepted coupling',
  take_boron_sample: 'conc/bang channel kinds are PWR boron machinery — accepted coupling',
  boron_sample: 'conc channel re-baselines from the PWR lab sample — accepted coupling',
  boron_sample_seq: 'conc channel re-baselines from the PWR lab sample — accepted coupling',

  // --- known leaks, allowed ONLY so this gate can go green on today's code -----
  // Both were found BY this gate and are filed, not fixed. Delete the entry when
  // the issue closes — that is what makes the gate notice the fix.
  pump_flow_pct: 'KNOWN LEAK, filed as #228: the `__true_flow__` trip sentinel reads a PWR-only true_state field',
  reset_rps: 'KNOWN LEAK, filed as #228: the kernel sends reset_rps, which only the PWR engine handles',
};

// ---------------------------------------------------------------- vocabulary
var VOCAB = {};          // token -> { plant: true }
function add(tok, plant) { (VOCAB[tok] = VOCAB[tok] || {})[plant] = true; }

var ENGINES = [
  ['pwr', new RD.PWREngine({ initial_state: 'hot_full_power' })],
  ['rbmk', new RD.RBMKEngine({ design_version: 'pre_chernobyl' })],
  ['bwr', new RD.BWREngine({ initial_state: 'full_power' })],
];
ENGINES.forEach(function (e) {
  var plant = e[0], eng = e[1];
  Object.keys(eng.getInstruments()).forEach(function (k) { add(k, plant); });
  Object.keys(eng.getControlState()).forEach(function (k) { add(k, plant); });
  Object.keys(eng.getTrueState()).forEach(function (k) { add(k, plant); });
});
// Command names: every `case 'x':` in each plant's engine dispatcher. Same trick
// run_campaign.js's commandVocab() uses — over-permissive (a non-command switch
// case slips in) but never wrong for this purpose, since a false entry can only
// make the scan look for a token that is not plant-specific anyway.
['pwr', 'rbmk', 'bwr'].forEach(function (plant) {
  var src = fs.readFileSync(path.join(__dirname, '..', 'engines', plant, plant + '_engine.js'), 'utf8');
  var m, re = /case '([a-z0-9_]+)':/g;
  while ((m = re.exec(src))) add(m[1], plant);
});

// ---------------------------------------------------------------- scan
var raw = fs.readFileSync(path.join(__dirname, '..', TARGET), 'utf8');
var rawLines = raw.split(/\r?\n/);
// Comment-stripped copy, line numbering preserved: prose is allowed to name
// plants (":232  // e.g. close_porv -> open_porv" is documentation, not a leak).
var stripped = raw
  .replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ' '); })
  .split(/\r?\n/)
  .map(function (l) { return l.replace(/\/\/.*$/, ''); });

var findings = [];
Object.keys(VOCAB).forEach(function (tok) {
  if (Object.keys(VOCAB[tok]).length >= 3) return;        // shared by all plants — not a specific
  var re = new RegExp('\\b' + tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
  stripped.forEach(function (line, i) {
    if (!re.test(line)) return;
    findings.push({ token: tok, plants: Object.keys(VOCAB[tok]).join('+'), line: i + 1, text: rawLines[i].trim() });
  });
});
findings.sort(function (a, b) { return a.line - b.line; });

var violations = findings.filter(function (f) { return !ALLOWED[f.token]; });
var declared = findings.filter(function (f) { return ALLOWED[f.token]; });

// Stale allow-list entries are themselves a failure: an entry for a token the
// kernel no longer names is exactly how a list like this rots into fiction.
var seen = {};
findings.forEach(function (f) { seen[f.token] = true; });
var stale = Object.keys(ALLOWED).filter(function (t) { return !seen[t]; });

// ---------------------------------------------------------------- report
var G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', D = '\x1b[2m', B = '\x1b[1m', X = '\x1b[0m';
console.log(B + 'HR3 guard — ' + TARGET + X);
console.log(D + '  plant vocabulary: ' + Object.keys(VOCAB).length + ' tokens from 3 engines; ' +
  findings.length + ' plant-specific site(s) in the kernel' + X + '\n');

if (violations.length) {
  console.log(R + B + 'UNDECLARED plant-specific names (' + violations.length + ')' + X);
  violations.forEach(function (f) {
    console.log(R + '  ✗' + X + ' :' + f.line + '  ' + B + f.token + X + D + ' [' + f.plants + ']' + X);
    console.log(D + '      ' + f.text.slice(0, 110) + X);
  });
  console.log(D + '\n  Either remove the plant name from the kernel (see `busyNote` / `pausedWhen`\n' +
    '  for the hook pattern), or add it to ALLOWED in this file WITH a reason.' + X + '\n');
}
if (stale.length) {
  console.log(Y + B + 'STALE allow-list entries (' + stale.length + ') — the kernel no longer names these' + X);
  stale.forEach(function (t) { console.log(Y + '  ✗' + X + ' ' + t + D + '  — ' + ALLOWED[t] + X); });
  console.log(D + '\n  Delete them. An allow-list that outlives its couplings stops describing the code.' + X + '\n');
}
console.log(D + 'Declared couplings (' + declared.length + ' sites, ' +
  Object.keys(ALLOWED).length + ' tokens) — accepted, with reasons in ALLOWED:' + X);
var byTok = {};
declared.forEach(function (f) { (byTok[f.token] = byTok[f.token] || []).push(f.line); });
Object.keys(byTok).sort().forEach(function (t) {
  console.log(D + '  · ' + t + '  :' + byTok[t].join(', :') + '  — ' + ALLOWED[t] + X);
});

// The tally is deliberately shaped for run_all's score scraper, with every
// plant-specific SITE counted as a check. That makes the site count part of the
// recorded baseline, so adding a new coupling shifts it and trips drift even when
// the author dutifully allow-lists it — the gate should make growing this list
// slightly uncomfortable, not silently absorb it.
var bad = violations.length + stale.length;
console.log('\n' + B + '──────────────────────────────────────────' + X);
console.log(B + (bad ? R + 'HR3 GUARD: FAIL' : G + 'HR3 GUARD: OK') + X + '  ' +
  findings.length + ' checks, ' + bad + ' failed' +
  D + (bad ? '  (' + violations.length + ' undeclared, ' + stale.length + ' stale)' : '  (all declared)') + X);
process.exit(bad ? 1 : 0);
