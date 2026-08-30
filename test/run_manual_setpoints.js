/*
 * run_manual_setpoints.js — DOES THE SETPOINT CHAPTER DESCRIBE THE PLANT WE SHIP? (#532)
 *
 * `Manuals/09_SETPOINTS_LIMITS.md` is the chapter that tells a player what the plant TRIPS AT. It
 * is the most consequential numeric surface in the manual and, until this runner, nothing checked
 * a single figure in it against the running plant. Measured when this was written, against
 * `engines/pwr2/pwr2_protection.js`:
 *
 *     power range high        120 %      the plant trips at 118 %
 *     power range low          25 %      the plant trips at  35 %
 *     primary pressure high  2384 psi    the plant trips at 2425 psia
 *     primary pressure low   1800 psi    the plant trips at 1775 psia
 *     RCS loop flow low        90 %      the plant trips at  87 %
 *     PZR level high (PI-8)    97 %      the plant trips at  87 %
 *     SI trip (PI-3)         1798 psi    the plant injects at 1715 psia
 *     P-10                     10 %      the permissive is at   8 %
 *     Tavg high              635 degF    THERE IS NO SUCH TRIP
 *     PZR level low            12 %      THERE IS NO SUCH TRIP
 *
 * — nine of thirteen trip rows wrong, missing or mis-classified.
 *
 * THE CLASS is the one this repo keeps re-learning: PWR2 inherited the retired plant's tables by
 * reference and each is wrong until measured against THIS plant. #579 found it in the flow rates,
 * #528 in five chapters of rod-control prose, this in the trip table. `run_manual_units` could
 * never have caught it — it cross-checks the BOARD against `engines/pwr/pwr_config.js`, the
 * RETIRED plant, and never reads the manual's numbers at all.
 *
 * THE DOC IS THE THING UNDER TEST, which is the one case where iterating a hand-maintained table
 * is right rather than the trap (`run_manual_commands` makes the same argument for §18): a gate
 * that iterates a hand-maintained map to test the CODE tests the map, but here the map IS the
 * claim and the PLANT is the reference. Every plant-side value below is READ from
 * `pwr2_protection`'s own objects, never retyped — move a setpoint and this file follows it.
 *
 * ⚠ THE RISK IN THIS DESIGN IS AN UNMAPPED ROW, not a wrong one. If `ROWS` below simply omitted a
 * manual row, that row would go unchecked and the gate would report green over it. So COVERAGE IS
 * ASSERTED: every row parsed out of the two tables must be claimed by exactly one entry, and an
 * unclaimed row FAILS. Adding a row to the manual without adding it here reddens this runner.
 *
 * WHAT IT CANNOT DO: it checks NUMBERS and existence. It cannot check the prose in the Notes
 * column, the direction, or whether the surrounding chapter's narrative is true — that is the rest
 * of #532 and is not machine-checkable.
 *
 * Run: node test/run_manual_setpoints.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var SRC = path.join(__dirname, '..', 'engines', 'pwr2');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_kinetics',
 'pwr2_fuel', 'pwr2_reactor', 'pwr2_sources', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
 'pwr2_condenser', 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_afw', 'pwr2_damage', 'pwr2_protection',
 'pwr2_pressurizer', 'pwr2_dumpctl', 'pwr2_break', 'pwr2_containment', 'pwr2_rhr',
 'pwr2_true_state', 'pwr2_instruments', 'pwr2_feedwater'
].forEach(function (f) { require(path.join(SRC, f + '.js')); });

var P = globalThis.RD.pwr2.protection;
var PSI = P.PSIA_PER_MPA;
var RED = '[31m', GREEN = '[32m', BOLD = '[1m', DIM = '[2m', RST = '[0m';
var nPass = 0, nFail = 0;
function ck(name, cond, note) {
  var ok = !!cond;
  if (ok) nPass++; else nFail++;
  console.log((ok ? '  ' + GREEN + 'PASS' + RST + '  ' : '  ' + RED + 'FAIL' + RST + '  ') + name +
              (note ? '  -- ' + note : ''));
  return ok;
}

/* THE MAP. `match` finds the manual row by its first cell; `want` is the plant's own value, read
 * from pwr2_protection; `unit` is what the manual quotes it in; `tol` allows for the manual's
 * rounding. `absent: true` means THE PLANT HAS NO SUCH FUNCTION — such a row must be marked
 * NOT MODELLED in the manual (see the convention check below) and carries no value comparison. */
var ROWS = [
  /* ⚠ SEVERAL ROWS SHARE A LABEL AND DIFFER ONLY BY DIRECTION (`Primary pressure` appears three
   * times, `PZR level` and `SG level` twice each), so a label-only matcher claimed the wrong row
   * or none. `dir` disambiguates against the second cell and is required wherever the label
   * repeats. */
  { m: /^Power range \(high\)/,             want: P.RPS.hi_flux_hi_frac * 100,   unit: '%',   tol: 0.5 },
  { m: /^Power range \(low setpoint\)/,     want: P.RPS.hi_flux_lo_frac * 100,   unit: '%',   tol: 0.5 },
  { m: /^Tavg$/,                            absent: true, what: 'a high-Tavg reactor trip' },
  { m: /^Primary pressure$/, dir: 'high',    want: P.RPS.hi_pzr_press_psia,       unit: 'psi', tol: 1 },
  { m: /^Primary pressure$/, dir: 'low',     want: P.RPS.lo_pzr_press_psia,       unit: 'psi', tol: 1 },
  { m: /^PZR level$/,        dir: 'low',     absent: true, what: 'a low-pressurizer-level reactor trip' },
  { m: /^SG level$/,         dir: 'low',     want: P.SGLL.lolo_frac * 100,        unit: '%',   tol: 0.5 },
  { m: /^SG level \(P-14\)/,                want: P.SGLL.hi_hi_frac * 100,       unit: '%',   tol: 0.5 },
  { m: /^RCS loop flow/,                    want: P.RPS.lo_flow_frac * 100,      unit: '%',   tol: 0.5 },
  { m: /^Primary pressure \(SI trip/,        want: P.ESFAS.si_lo_pzr_press_psia,  unit: 'psi', tol: 1 },
  { m: /^PZR level \(PI-8\)/,               want: P.RPS.hi_pzr_level_frac * 100, unit: '%',   tol: 0.5 },
  /* --- rod stops (§2.0). Already PWR2's since #572, and checked so they stay that way. --- */
  { m: /^\*\*Power range high flux\*\*/,     want: P.ROD_STOP.pr_frac * 100,      unit: '%',   tol: 0.5 },
  { m: /^\*\*Intermediate range high flux\*\*/, want: P.ROD_STOP.ir_frac * 100,  unit: '%',   tol: 0.5 },
  /* --- permissives --- */
  { m: /^\*\*P-7\*\*/,                       want: P.P7.frac * 100,               unit: '%',   tol: 0.5 },
  { m: /^\*\*P-10\*\*/,                      want: P.P10.frac * 100,              unit: '%',   tol: 0.5 },
  { m: /^\*\*P-11\*\*/,                      want: P.P11.mpa * PSI,               unit: 'psi', tol: 2 },
  /* Rows with no single plant constant to check against. CLAIMED rather than omitted, so the
   * coverage assertion stays meaningful — an entry here says "looked at", not "unchecked". */
  { m: /^\*\*Turbine trip \(P-9\)\*\*/,      narrative: true },
  { m: /^Source range/,                     narrative: true },
  { m: /^Intermediate range$/,              narrative: true },
  { m: /^\*\*Overtemperature/,              narrative: true },
  { m: /^\*\*Overpower/,                    narrative: true },
  { m: /^\*\*P-6\*\*/,                       narrative: true },
  { m: /^\*\*P-9\*\*/,                       narrative: true },
  { m: /^\*\*P-12\*\*/,                      narrative: true },
  { m: /^SR re-energize block/,             narrative: true }
];

var MD_PATH = path.join(__dirname, '..', 'Manuals', '09_SETPOINTS_LIMITS.md');
var md = fs.readFileSync(MD_PATH, 'utf8').replace(/\r\n/g, '\n');

/* Parse the two tables between the reactor-trip heading and the section after the permissives.
 * Header/rule rows are dropped by requiring a NUMBER or the NOT MODELLED marker somewhere in the
 * row — a header has neither. */
function tableRows(startRe, endRe) {
  var lines = md.split('\n'), out = [], on = false;
  for (var i = 0; i < lines.length; i++) {
    if (!on && startRe.test(lines[i])) { on = true; continue; }
    if (on && endRe.test(lines[i])) break;
    if (!on) continue;
    var L = lines[i];
    if (L.charAt(0) !== '|') continue;
    if (/^\|[\s:-]+\|/.test(L)) continue;                       /* the --- rule row */
    var cells = L.split('|').slice(1, -1).map(function (c) { return c.trim(); });
    if (cells.length < 2) continue;
    if (!/\d/.test(L) && !/NOT MODELLED/i.test(L)) continue;    /* header rows carry neither */
    out.push({ label: cells[0], cells: cells, raw: L });
  }
  return out;
}
var rows = tableRows(/^\|\s*Instrument \/ condition/, /^### Permissives/)
   .concat(tableRows(/^\|\s*Name\s*\|\s*Value/, /^##\s/));

console.log('\n' + BOLD + 'THE SETPOINT CHAPTER vs THE SHIPPED PLANT  (Manuals/09 vs pwr2_protection)' + RST);

ck('the setpoint tables parse — the trip and permissive rows are found',
   rows.length >= 15,
   rows.length + ' rows parsed (a parse that silently found none would pass every check below)');

/* THE NUMBER a row claims: the first bold figure in any cell after the label. `2384 psi (16.44
 * MPa)` yields 2384 — the SI half is `run_manual_units`' business, not this file's. */
function claimedNumber(row) {
  for (var i = 1; i < row.cells.length; i++) {
    var m = row.cells[i].match(/\*\*\s*≈?\s*(-?\d+(?:\.\d+)?(?:e-?\d+)?)/i);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

var unclaimed = [], wrong = [], unmarked = [], marked = [];
rows.forEach(function (row) {
  var hits = ROWS.filter(function (r) {
    if (!r.m.test(row.label)) return false;
    return r.dir === undefined || (row.cells[1] || '').toLowerCase() === r.dir;
  });
  if (hits.length !== 1) { unclaimed.push(row.label + (hits.length > 1 ? '  (AMBIGUOUS)' : '')); return; }
  var spec = hits[0];
  var isMarked = /NOT MODELLED/i.test(row.raw);
  if (spec.absent) {
    if (!isMarked) unmarked.push(row.label + '  — ' + spec.what + ' does not exist on this plant');
    return;
  }
  if (isMarked) { marked.push(row.label + '  — marked NOT MODELLED but the plant HAS it'); return; }
  if (spec.narrative) return;
  var got = claimedNumber(row);
  if (got === null) { wrong.push(row.label + '  — no figure found in the row'); return; }
  if (Math.abs(got - spec.want) > spec.tol) {
    wrong.push(row.label + ': manual ' + got + ' ' + spec.unit +
               ', plant ' + spec.want.toFixed(spec.unit === 'psi' ? 0 : 1) + ' ' + spec.unit);
  }
});

/* COVERAGE FIRST — see the header. An unmapped row is the failure this design is exposed to, so
 * it is asserted before the values are. */
ck('every parsed row is CLAIMED by exactly one entry — an unmapped row would go unchecked',
   unclaimed.length === 0,
   unclaimed.length ? unclaimed.join(' | ') : rows.length + ' rows, all claimed');

ck('every documented setpoint matches the plant that ships',
   wrong.length === 0,
   wrong.length ? wrong.join('  |  ') : 'all checked figures agree with pwr2_protection');

/* THE NOT-MODELLED CONVENTION, both directions (OWNER RULING, 2026-08-30: selected "Keep the row,
 * mark it NOT MODELLED, say why" from options I wrote — a selection, not verbatim words). Keeping
 * such a row is the §8.36 ROD AUTO precedent: a real plant has it, ours does not, and the contrast
 * teaches. BOTH directions are asserted, because a marker that can be applied to anything is a
 * place to hide a stale row rather than a way to declare one. */
ck('a trip the plant does NOT have is marked NOT MODELLED, so it cannot read as one that acts',
   unmarked.length === 0,
   unmarked.length ? unmarked.join('  |  ') : 'every absent function is declared');
ck('...and nothing the plant DOES have is marked that way — the marker is not a hiding place',
   marked.length === 0,
   marked.length ? marked.join('  |  ') : 'no live function is declared absent');

console.log(DIM + '  (numbers and existence only — the Notes prose and the chapter narrative are ' +
            'not machine-checkable; that is the rest of #532)' + RST);

console.log('\n' + '='.repeat(74));
console.log('  run_manual_setpoints: ' + nPass + ' passed, ' + nFail + ' failed  (' +
            (nPass + nFail) + ' checks)');
console.log('='.repeat(74) + '\n');
process.exit(nFail > 0 ? 1 : 0);
