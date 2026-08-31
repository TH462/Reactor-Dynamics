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
/* The ANNUNCIATOR half needs the control layer's alarm table, which PWR2 keeps from the pwr
 * object by design — see the note above that section. */
require(path.join(__dirname, '..', 'engines', 'load_mode.js'));
require(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_config.js'));
require(path.join(__dirname, '..', 'layers', 'control', 'control_kernel.js'));
require(path.join(__dirname, '..', 'layers', 'control', 'pwr_control.js'));
/* the shell class REUSES the published instrument layer, so booting an engine needs it */
require(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_instruments.js'));
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_kinetics',
 'pwr2_fuel', 'pwr2_reactor', 'pwr2_sources', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
 'pwr2_condenser', 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_afw', 'pwr2_damage', 'pwr2_protection',
 'pwr2_pressurizer', 'pwr2_dumpctl', 'pwr2_break', 'pwr2_containment', 'pwr2_rhr',
 'pwr2_true_state', 'pwr2_instruments', 'pwr2_feedwater'
].forEach(function (f) { require(path.join(SRC, f + '.js')); });

var RD = globalThis.RD;
var P = RD.pwr2.protection;
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
  { m: /^SR re-energize block/,             narrative: true },

  /* ---- §3.0, ENGINEERED SAFETY & AUTOMATIC ACTUATIONS (added 2026-08-30, #532 phase 3b) -----
   * ⚠ THIS SECTION WAS OUTSIDE THE GATE UNTIL NOW, AND THAT IS THE WHOLE POINT. The runner
   * shipped covering §2.0 and §4.0, reported 9/9 on a chapter whose §3.0 still carried the
   * RETIRED plant's PORV and safety setpoints, an "ESF arm must be AUTO" instruction for arms
   * this plant does not have, an SI-on-low-level path that does not exist, and four containment
   * actuations the engine declares unmodeled — while OMITTING two of the three engineered-
   * safeguards entries the plant actually ships. A green gate over a section it does not read
   * is the hollow-check trap in its purest form: nothing was wrong with the checks, they were
   * pointed at two of the chapter's three tables.
   *
   * §3.0's columns are Function | Instrument | Direction | Setpoint | Notes — the direction is
   * the THIRD cell, not the second, which is why tableRows takes a dirCol. */
  { m: /^Open PORV/,                        narrative: true },   /* setpoint-RELATIVE (SP+100); no single figure to pin */
  { m: /^Open PZR safety/,                  want: RD.pwr2.pressurizer.RELIEF.safety_open_mpa * PSI, unit: 'psi', tol: 2 },
  { m: /^HPI start \(Safety Injection\)/,    want: P.ESFAS.si_lo_pzr_press_psia,   unit: 'psi', tol: 1 },
  { m: /^HPI start \(SI on low steam pressure\)/, want: P.ESFAS.si_lo_steam_press_psia, unit: 'psi', tol: 1 },
  { m: /^HPI start \(SI on high-high steam flow\)/, want: P.ESFAS.hi_hi_steam_flow_frac, unit: 'frac', tol: 0.01 },
  { m: /^HPI start \(SI on PZR level lo-lo\)/, absent: true, what: 'a safety injection on low pressurizer level' },
  { m: /^Letdown isolation/,                absent: true, what: 'an automatic letdown isolation' },
  { m: /^Feedwater isolation \(on SI\)/,     want: P.ESFAS.si_lo_pzr_press_psia,   unit: 'psi', tol: 1 },
  { m: /^\*\*Atmospheric dump \(ADV\)\*\*/,     want: RD.pwr2.relief.RELIEF.adv_setpoint_psig + 14.7, unit: 'psi', tol: 1 },
  { m: /^\*\*Main steam line isolation \(MSLI\)\*\*/, absent: true, what: 'any automatic main steam line isolation' },
  { m: /^\*\*MSLI \(containment leg\)\*\*/,      absent: true, what: 'a containment-pressure steam line isolation' },
  { m: /^\*\*SI backup \(containment\)\*\*/,     absent: true, what: 'a containment-pressure safety injection' },
  { m: /^\*\*Containment spray\*\*/,           absent: true, what: 'containment spray' },
  { m: /^\*\*Fan coolers/,                    absent: true, what: 'a containment fan-cooler safety realign' },
  { m: /recombiners/,                       absent: true, what: 'hydrogen recombiners' },
  { m: /flammability alarm/,                narrative: true },
  { m: /ignition \(the burn\)/,              absent: true, what: 'a hydrogen deflagration' },
  { m: /^AFW start$/,                       want: P.SGLL.lolo_frac * 100,         unit: '%',   tol: 0.5 },
  { m: /^AFW start \(loss of MFW/,           narrative: true },
  { m: /^MFW isolation \+ AFW start \(P-4\)/, narrative: true },
  { m: /^SR re-energize assist/,            narrative: true },
  { m: /^Open SG safety/,                   want: RD.pwr2.relief.RELIEF.safety_pop_psig + 14.7, unit: 'psi', tol: 1 },
  { m: /^Turbine trip \(vacuum\)/,           narrative: true },
  { m: /^Turbine trip \(overspeed\)/,        narrative: true },
  { m: /^Turbine trip \(SG hi-hi/,           want: P.SGLL.hi_hi_frac * 100,        unit: '%',   tol: 0.5 },
  { m: /^Steam dump \(pressure mode\)/,      narrative: true },
  { m: /^Steam dump \(trip-open mode\)/,     narrative: true },
  { m: /^Spray flow cap/,                   narrative: true },
  { m: /^Main feedwater isolation \(P-14\)/, want: P.SGLL.hi_hi_frac * 100,        unit: '%',   tol: 0.5 }
];

var MD_PATH = path.join(__dirname, '..', 'Manuals', '09_SETPOINTS_LIMITS.md');
var md = fs.readFileSync(MD_PATH, 'utf8').replace(/\r\n/g, '\n');

/* Parse the two tables between the reactor-trip heading and the section after the permissives.
 * Header/rule rows are dropped by requiring a NUMBER or the NOT MODELLED marker somewhere in the
 * row — a header has neither. */
function tableRows(startRe, endRe, dirCol) {
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
    /* Header and rule rows carry no digit, no NOT MODELLED marker and no lowercase_id first
     * cell. The third clause was added for the annunciator tables, whose STATE alarms
     * (`reactor_trip`, `porv_open`) have an em dash where a setpoint would be — nine rows that a
     * digit-only filter dropped, leaving their instrument and priority unchecked. */
    if (!/\d/.test(L) && !/NOT MODELLED/i.test(L) &&
        !/^\|\s*[a-z][a-z0-9_]*\s*\|/.test(L)) continue;
    out.push({ label: cells[0], cells: cells, raw: L,
               dir: (cells[dirCol === undefined ? 1 : dirCol] || '').toLowerCase() });
  }
  return out;
}
var rows = tableRows(/^\|\s*Instrument \/ condition/, /^### Permissives/)
   .concat(tableRows(/^\|\s*Name\s*\|\s*Value/, /^##\s/))
   /* §3.0 — Function | Instrument | Direction | Setpoint | Notes: the direction is cell 2. */
   .concat(tableRows(/^\|\s*Function\s*\|\s*Instrument/, /^### HPI pump curve/, 2));

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
    return r.dir === undefined || row.dir === r.dir;
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

/* ---- THE ANNUNCIATOR TABLES (§4.0) vs THE SHIPPED ALARM CONFIG ---------------------------
 * A second, much wider surface in the same chapter: 37 rows carrying id, instrument, direction,
 * setpoint and priority — a 1:1 map onto the alarm objects, which is unusually checkable prose.
 *
 * ⚠ THESE ALARMS ARE THE RETIRED PLANT'S TABLE, ON PURPOSE, and that is why they are checked
 * against `RD.PWR_CONFIG.protection.alarms` rather than against pwr2. `pwr2_shell.getProtection-
 * Config` keeps the pwr object's SHAPE — "alarms, permissives, labels ride along; annunciators
 * only READ instruments" — and empties only the ACTING parts. So the shipped annunciator setpoints
 * genuinely come from that table, and checking them against pwr2 would be the mirror of the
 * #579 trap: a gate pointed at the wrong plant, failing correct prose. Measured while writing
 * this: the `PZR PRESS LO LO` alarm really is 1800 psi even though the low-pressure TRIP is 1775. */
var alarms = (globalThis.RD.PWR_CONFIG.protection.alarms) || [];
var byId = {};
alarms.forEach(function (a) { byId[a.id] = a; });

var arows = tableRows(/^##\s+4\.0 Alarm setpoints/, /^##\s+5\./);
ck('the annunciator tables parse', arows.length >= 25,
   arows.length + ' rows parsed against ' + alarms.length + ' shipped alarms');

/* The manual quotes US-first, so the SI half in parentheses is the one that compares directly to
 * the config. Pulled from the parenthesis where there is one; otherwise the bare figure IS the
 * config's unit (percent, DPM, counts). */
function siFigure(cell) {
  var par = cell.match(/\(\s*(-?[−\d][\d.eE+-]*)/);
  if (par) return parseFloat(par[1].replace('−', '-'));
  var m = cell.match(/\*\*\s*(-?[−\d][\d.eE+-]*)/);
  return m ? parseFloat(m[1].replace('−', '-')) : null;
}
var aGhost = [], aWrong = [], aMeta = [];
arows.forEach(function (row) {
  var id = row.cells[0], a = byId[id];
  if (!a) { aGhost.push(id); return; }
  var instr = row.cells[2], dir = row.cells[3], sp = row.cells[4] || '', pri = (row.cells[5] || '');
  if (a.instrument !== instr) aMeta.push(id + ': instrument ' + instr + ' vs ' + a.instrument);
  /* STATE alarms are written in the Dir column as human shorthand — `true`, `false`, `open` for
   * the config's `is_true` / `is_false` / `open`. That is the column doing its job (it is read by
   * an operator, not a parser), so the shorthand is accepted rather than the manual bent to match
   * an internal spelling. Analog directions (`high`/`low`) must match exactly. */
  var STATE_DIR = { 'true': 'is_true', 'false': 'is_false', 'open': 'is_open' };
  var wantDir = STATE_DIR[dir] || dir;
  if (String(a.direction) !== wantDir)
    aMeta.push(id + ': direction ' + dir + ' vs ' + a.direction);
  if (pri.indexOf(a.priority) === -1) aMeta.push(id + ': priority "' + pri + '" vs ' + a.priority);
  if (a.setpoint === null || a.setpoint === undefined) return;   /* state alarms carry no figure */
  var got = siFigure(sp);
  if (got === null) { aWrong.push(id + ': no figure in "' + sp + '"'); return; }
  /* ⚠ A DEVIATION ALARM CARRIES ITS SIGN IN THE WORDING, NOT THE NUMBER. `PZR LVL LO` is written
   * "20 % below program" against a shipped -20 on the deviation channel — the manual is RIGHT and
   * a naive compare calls it wrong, which is exactly the false positive that would get a correct
   * row "fixed". Read the direction from the prose where the prose carries it. */
  if (/below/i.test(sp) && got > 0) got = -got;
  if (/above/i.test(sp) && got < 0) got = -got;
  var tol = Math.max(Math.abs(a.setpoint) * 0.005, 0.05);
  if (Math.abs(got - a.setpoint) > tol)
    aWrong.push(id + ': manual ' + got + ' vs shipped ' + a.setpoint);
});

ck('every documented annunciator EXISTS in the shipped alarm table',
   aGhost.length === 0,
   aGhost.length ? aGhost.join(' | ') : arows.length + ' rows, every id real');
ck('...and its SETPOINT matches what the plant will actually alarm at',
   aWrong.length === 0,
   aWrong.length ? aWrong.join('  |  ') : 'every documented setpoint agrees');
ck('...and so do its instrument, direction and priority — a row can be right about the number ' +
   'and wrong about which channel raises it',
   aMeta.length === 0,
   aMeta.length ? aMeta.join('  |  ') : 'instrument/direction/priority agree on every row');

/* ---- §11.0, NORMAL VALUES BY INITIAL CONDITION (#532 phase 3c) -----------------------------
 * The THIRD table in this chapter that nothing read, and the one a player is told to check a
 * fresh board against. Measured 2026-08-30 before this check existed: it carried a
 * `cold_shutdown` column for an initial condition THE ENGINE REFUSES BY NAME, a `5_percent`
 * column for another, and wrong figures throughout the columns that did exist — Tavg 579.2
 * against a measured 577.7 degF, subcooling 41 against 25 degC, boron 747 against 626 ppm.
 *
 * This check BOOTS THE PLANT rather than reading a config, because the table's claim is "what a
 * settled board reads" and only a settled board can answer it. That makes it much the slowest
 * work in this file, and it is worth it: a static read could not have caught the subcooling.
 *
 * ⚠ COVERAGE IS ASSERTED IN THE COLUMN DIRECTION TOO. The header's initial-condition names must
 * be exactly the ones the engine has. A column for an IC that does not exist is the defect this
 * found; a missing column for one that does is the same defect mirrored. The engine's list is
 * READ FROM THE ENGINE — pwr2_engine puts it in its own refusal message — never retyped here. */
require(path.join(SRC, 'pwr2_engine.js'));
require(path.join(SRC, 'pwr2_shell.js'));
require(path.join(__dirname, '..', 'layers', 'instructor_layer.js'));
require(path.join(__dirname, '..', 'layers', 'simulation_service.js'));

var shippedICs = [];
try { new RD.pwr2.shell.PWR2Engine({ initial_state: '__no_such_ic__' }); }
catch (e) {
  var m = /this engine has ([a-z0-9_ /]+)/i.exec(e.message);
  if (m) shippedICs = m[1].trim().split(/\s*\/\s*/);
}

/* ⚠ TWO tables in this chapter open with '| Parameter |' — §1.0's normal operating point is the
 * first of them, and picking it yielded an EMPTY column list, which made the coverage check
 * vacuous in exactly the direction it exists to assert. Require a backticked IC name. */
var icHeader = md.split('\n').filter(function (l) {
  return /^\| Parameter \|/.test(l) && /`[a-z0-9_]+`/.test(l);
})[0] || '';
var icCols = (icHeader.match(/`[a-z0-9_]+`/g) || []).map(function (x) { return x.replace(/`/g, ''); });

console.log('\n' + BOLD + 'THE INITIAL-CONDITION TABLE vs A BOOTED PLANT  (Manuals/09 §11.0)' + RST);

ck('the engine\'s own initial-condition list was read (not retyped)',
   shippedICs.length >= 3, shippedICs.join(', ') || 'REFUSAL MESSAGE DID NOT PARSE');
ck('the table\'s columns are EXACTLY the initial conditions the plant has — a column for one it ' +
   'refuses tells the player to load a state that does not exist',
   icCols.length === shippedICs.length &&
   icCols.every(function (c) { return shippedICs.indexOf(c) !== -1; }) &&
   shippedICs.every(function (c) { return icCols.indexOf(c) !== -1; }),
   'table [' + icCols.join(', ') + ']  ·  plant [' + shippedICs.join(', ') + ']');

/* label -> the true_state field it quotes, its tolerance, and the conversion into the manual's
 * unit. Prose rows (MSIV, SR detector, ECCS mode) are covered by the column check above, not
 * compared numerically. Tolerances are the manual's rounding, not a licence to drift. */
var IC_ROWS = {
  'Tavg':              { f: 'tavg_c',        tol: 1.0, cv: function (c) { return c * 9 / 5 + 32; } },
  'Primary pressure':  { f: 'pressure_mpa',  tol: 3.0, cv: function (x) { return x * PSI; } },
  'Subcooling margin': { f: 'subcooling_c',  tol: 2.0, cv: function (c) { return c * 9 / 5; } },
  'PZR level':         { f: 'pzr_level_pct', tol: 1.5 },
  'SG level':          { f: 'sg_level_pct',  tol: 1.5 },
  'Boron':             { f: 'boron_ppm',     tol: 20 }
};

var booted = {};
icCols.forEach(function (ic) {
  if (shippedICs.indexOf(ic) === -1) return;                 /* the column check already failed */
  var svc = new RD.SimulationService({ seed: 1 });
  svc.selectPlant('pwr2', ic, null, undefined);
  svc.running = true; svc.timeAcceleration = 10; svc.attentionStops = false;
  var s = null, n = 700;   /* uniform: the low-power ICs are still walking pressure up at 60 */
  for (var i = 0; i < n; i++) s = svc.tick();
  booted[ic] = s.true_state;
});

/* ⚠ SCAN §11.0's TABLE ONLY, and match the label by PREFIX. Two earlier tables in this chapter
 * (§7.5's estimated-critical-condition grids) also carry a `Tavg` row with five-plus cells, so a
 * whole-file scan compared this table's expectations against those — "manual 0, plant 577.7" was
 * a bank-position row. And the unit suffix cannot be stripped by cutting at the first bracket:
 * `Primary pressure psi (MPa)` becomes `Primary pressure psi`, which matched nothing at all, so
 * that row was silently unchecked while the runner reported cells compared. */
var icWrong = [], icChecked = 0;
var icLines = md.split('\n');
var icStart = icLines.indexOf(icHeader);
var icEnd = icLines.findIndex(function (l, i) { return i > icStart && /^##\s/.test(l); });
if (icEnd === -1) icEnd = icLines.length;
icLines.slice(icStart, icEnd).forEach(function (line) {
  if (line.charAt(0) !== '|') return;
  var cells = line.split('|').slice(1, -1).map(function (c) { return c.trim(); });
  var label = (cells[0] || '').trim();
  var key = Object.keys(IC_ROWS).filter(function (k) { return label.indexOf(k) === 0; })[0];
  var spec = key ? IC_ROWS[key] : null;
  if (spec) label = key;
  if (!spec || cells.length < icCols.length + 1) return;
  icCols.forEach(function (ic, k) {
    var T = booted[ic];
    if (!T) return;
    var mm = (cells[k + 1] || '').match(/(-?\d+(?:\.\d+)?)/);
    if (!mm) return;
    var want = spec.cv ? spec.cv(T[spec.f]) : T[spec.f];
    icChecked++;
    if (Math.abs(parseFloat(mm[1]) - want) > spec.tol) {
      icWrong.push(label + ' @ ' + ic + ': manual ' + mm[1] + ', plant ' + want.toFixed(1));
    }
  });
});

ck('the table was actually read — rows matched against booted plants',
   icChecked >= 20, icChecked + ' cells compared across ' + Object.keys(booted).length + ' booted ICs');
ck('every figure matches what that initial condition actually settles at',
   icWrong.length === 0,
   icWrong.length ? icWrong.join('  |  ') : 'all ' + icChecked + ' cells agree with the booted plant');

console.log(DIM + '  (numbers and existence only — the Notes prose and the chapter narrative are ' +
            'not machine-checkable; that is the rest of #532)' + RST);

console.log('\n' + '='.repeat(74));
console.log('  run_manual_setpoints: ' + nPass + ' passed, ' + nFail + ' failed  (' +
            (nPass + nFail) + ' checks)');
console.log('='.repeat(74) + '\n');
process.exit(nFail > 0 ? 1 : 0);
