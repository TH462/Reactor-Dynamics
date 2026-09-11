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
  { m: /^Intermediate range$/, dir: 'high',   want: P.IR_TRIP.frac * 100,          unit: '%',   tol: 0.5 },
  /* --- permissives --- */
  { m: /^\*\*P-7\*\*/,                       want: P.P7.frac * 100,               unit: '%',   tol: 0.5 },
  { m: /^\*\*P-10\*\*/,                      want: P.P10.frac * 100,              unit: '%',   tol: 0.5 },
  { m: /^\*\*P-11\*\*/,                      want: P.P11.mpa * PSI,               unit: 'psi', tol: 2 },
  /* Rows with no single plant constant to check against. CLAIMED rather than omitted, so the
   * coverage assertion stays meaningful — an entry here says "looked at", not "unchecked". */
  /* Its own setpoint cell is "—" by design: the trip has no threshold of its own, it has a
   * PERMISSIVE, and that permissive's number is checked on the **P-9** row below. Narrative
   * here means "the figure lives one table down", not "nothing to check against". */
  { m: /^\*\*Turbine trip \(P-9\)\*\*/,      narrative: true },
  /* THE PLANT HAS NO SOURCE-RANGE REACTOR TRIP, and the row documented one at 1e5 cps (#642).
   * Nothing could catch it: 1e5 cps IS a real constant here — `pwr2_true_state`'s SR_SECURE_CPS,
   * where the channel DE-ENERGIZES — so the figure was right and the function was absent. The
   * de-energization is also what hid it, because a count rate that stops at 1e5 can never reach
   * a trip above it. Measured by removing the hiding place: with SR_SECURE_CPS forced to 1e12 the
   * channel stays live and publishes 1.285e11 cps at 50 % power, and the plant does not scram.
   * `pwr2_protection` has fourteen functions and none of them is source range; the RETIRED plant's
   * `sr_high` trip at 1.0e5 is in `pwr_control.js` and reaches PWR2 through a `trips: []`. */
  { m: /^Source range/,   absent: true, what: 'a source-range high-flux reactor trip' },
  /* NO LONGER NARRATIVE (#601). It was listed here as "no single plant constant to check
   * against", which was true only while the plant had no intermediate-range trip — and that is
   * precisely how the row came to carry 1.67e-3 A, the ROD STOP's setpoint, for the trip. The
   * constant exists now, so the row is checked like every other. */
  { m: /^\*\*Overtemperature/,              narrative: true },
  { m: /^\*\*Overpower/,                    narrative: true },
  /* NO LONGER NARRATIVE (#642). Both were listed as having "no single plant constant to check
   * against", and for both that was a statement about the ENGINE'S FILE LAYOUT, not about the
   * plant: P-6 was a local `var P6_A` inside `pwr2_true_state` and P-9 a local inside
   * `pwr2_protection`, so neither could be pointed at. That is exactly how the P-6 row came to
   * disagree with the engine by a factor of two, in the direction nobody expected — the row was
   * RIGHT and the engine's `[sourced]` marker was on the wrong sentence of the right document.
   * Both are exported now and both are checked. P-9's second value (8 % without steam dumps) is
   * prose in the row's Effect cell, not a figure, so `claimedNumber` takes the 50 %. */
  { m: /^\*\*P-6\*\*/,                       want: P.P6.amps,                      unit: 'A',   tol: 1e-12 },
  { m: /^\*\*P-9\*\*/,                       want: P.P9.frac_dumps * 100,          unit: '%',   tol: 0.5 },
  /* Ginna's numeric P-12 is in its TS proper, which is not in the corpus — the 532.4 °F here is
   * the plant's LO TAVG annunciator, and that alarm IS checked, by the §4.0 tables below. */
  { m: /^\*\*P-12\*\*/,                      narrative: true },
  /* ABSENT, same finding as the source-range trip row (#642): the block protects the counter
   * against being switched back on at high flux, and this plant has no switch — `set_sr_detector`
   * is REFUSED by the shell by name and the board button was deleted at #598 item 7. The 1e-6 A
   * is the retired plant's interlock, live there and dead here (measured: PWR2's kernel gets
   * `interlocks: []`, so ZERO rows block that command). */
  { m: /^SR re-energize block/,  absent: true, what: 'an SR re-energize interlock (there is no SR switch)' },

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
  /* NO LONGER ABSENT (#624 item 14). The row said NOT MODELLED while the engine had carried the
   * cut all along — the same shape as #601's rod-stop row: the chapter contradicted itself two
   * tables apart (§2.0's PZR-level row names "the 17 % letdown-isolation and heater cut" as the
   * only low-level action) and the gate agreed with the wrong half, because an `absent: true`
   * entry asserts the MARKER, never the plant. Now checked against the constant. */
  { m: /^Letdown isolation/,                want: RD.pwr2.pressurizer.LEVEL.low_cut_pct, unit: '%', tol: 0.5 },
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
  /* NO LONGER NARRATIVE (#635 item 2). The row was marked "no single plant constant to check
   * against" — false: it prints the Ginna no-load anchor, `RD.pwr2.sg.SG.P_noload` (7.03 MPa),
   * which is the pressure-mode dump's controller setpoint (`pwr2_shell`'s `steam_dump_setpoint`
   * defaults to this same 7.03 when the operator has never touched the box). ABSOLUTE, no
   * +14.7 psia offset: the manual quotes it as `Psat(546.8 °F)`, a saturation (absolute)
   * pressure, unlike the two gauge-quoted relief rows above it. */
  { m: /^Steam dump \(pressure mode\)/,      want: RD.pwr2.sg.SG.P_noload * PSI, unit: 'psi', tol: 1 },
  /* NO LONGER NARRATIVE (#647, 2026-09-06). The row printed a band — "full demand ~14.4 °F
   * above it" — and was marked narrative, so the figure was never checked against anything. It
   * was the RETIRED plant's, and it survived both the #508 re-anchor and the ruling that made
   * the band a derived quantity. It is now the derivation itself: `tt_full_c` is
   * `tavg_full_c - tavg_noload_c`, so this row goes red if either program knot moves and the
   * manual does not. Injection-verified: put the old 14.4 back and the row reds. */
  { m: /^Steam dump \(trip-open mode\)/,     want: RD.pwr2.dumpctl.DUMP.tt_full_c * 1.8,
                                            unit: '°F', tol: 0.1 },
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
    /* AMPS BROKE THE DIAGNOSTIC (#642): `toFixed(1)` renders 1e-10 as "0.0", so the one row
     * whose units are exponential would have reported "manual 5e-11 A, plant 0.0 A". A message
     * that cannot show the disagreement it found is the check going half-blind. */
    var fmt = Math.abs(spec.want) < 0.01 && spec.want !== 0
                ? spec.want.toExponential(2)
                : spec.want.toFixed(spec.unit === 'psi' ? 0 : 1);
    wrong.push(row.label + ': manual ' + got + ' ' + spec.unit +
               ', plant ' + fmt + ' ' + spec.unit);
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
  'Boron':             { f: 'boron_ppm',     tol: 20 },
  /* THE BANK ROW WAS UNCHECKED (#704). It read 627 / 627 / 227 and nothing compared it to a
   * booted plant — it fell through to the prose set with MSIV and SR detector, which the column
   * check covers and the number check does not. The row that names WHERE THE OPERATOR'S ONLY
   * REACTIVITY CONTROL SITS is not prose. Tolerance 1 step: the cell is an integer the plant
   * publishes directly, so there is no rounding to allow for. */
  'Control bank':      { f: 'rod_steps',     tol: 1 }
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

/* ---- §1.0, NORMAL OPERATING POINT vs THE SAME BOOTED PLANT (#651) --------------------------
 * §11.0's own guard (`icHeader`, above) requires a backticked IC name in the header, because
 * picking the WRONG `| Parameter |` table once made the coverage check vacuous. That guard is
 * correct for §11.0 and it PERMANENTLY EXCLUDES §1.0 — §1.0's table has no IC column, because it
 * describes exactly one point (Hot Full Power), not a column per initial condition. So this
 * section is located by SECTION HEADING instead, leaving the §11.0 guard untouched, and reuses
 * the SAME booted `hot_full_power` plant §11.0 already settled 700 ticks ago — no second boot.
 *
 * ⚠ COVERAGE IS ASSERTED HERE TOO, same reasoning as the file header: all twelve rows of this
 * table turned out to have exactly one number a booted plant or a named plant constant can be
 * checked against, so none is `narrative` — an unclaimed row FAILS rather than going unchecked.
 * Two rows carry more than one figure per cell (the loop split, the control-bank percent/steps)
 * and are matched by label before the generic single-number lookup runs. */
var s1Lines = md.split('\n');
var s1Start = s1Lines.findIndex(function (l) { return /^## 1\.0 Normal operating point/.test(l); });
var s1End = s1Lines.findIndex(function (l, i) { return i > s1Start && /^#{2,3}\s/.test(l); });
var s1Rows = [];
s1Lines.slice(s1Start, s1End === -1 ? s1Lines.length : s1End).forEach(function (line) {
  if (line.charAt(0) !== '|') return;
  if (/^\|[\s:-]+\|/.test(line)) return;                        /* the --- rule row */
  var cells = line.split('|').slice(1, -1).map(function (c) { return c.trim(); });
  if (cells.length < 2 || cells[0] === 'Parameter') return;      /* the header row */
  s1Rows.push({ label: cells[0], cell: cells[1] || '' });
});

console.log('\n' + BOLD + 'THE NORMAL OPERATING POINT vs THE SAME BOOTED PLANT  (Manuals/09 §1.0)' + RST);

var hfp = booted['hot_full_power'];
var PZR_SP_PSI = RD.pwr2.pressurizer.CONTROL.setpoint_default_mpa * PSI;   /* the pressure ANCHOR
  — a config constant, not a settled reading; the plant runs a few psi off it by design (§3.0's
  psi-vs-psig note), so this row is checked against the constant it actually documents. */
var DECAY_H0 = RD.pwr2.kinetics.DECAY.H0;
var DECAY_PCT = (DECAY_H0[0] + DECAY_H0[1] + DECAY_H0[2] + DECAY_H0[3]) * 100;   /* the decay-heat
  groups are seeded AT EQUILIBRIUM with the initial power (pwr2_kinetics createKinetics), so this
  sum IS "decay heat after a long power run" — not merely close to it. */
var BANK_STEPS = RD.pwr2.kinetics.RODS.max_steps;

function s1Nums(text) { return (text.match(/-?\d+(?:\.\d+)?/g) || []).map(Number); }

var S1_ROWS = [
  { p: 'Reactor power',              tol: 1.0, want: function () { return hfp.power_pct; } },
  { p: 'Electrical output',          tol: 1.5, want: function () { return hfp.mwe_output; } },
  { p: 'Primary pressure',           tol: 3.0, want: function () { return PZR_SP_PSI; } },
  { p: 'Tavg',                       tol: 1.0, want: function () { return hfp.tavg_c * 9 / 5 + 32; } },
  { p: 'Pressurizer level',          tol: 1.5, want: function () { return hfp.pzr_level_pct; } },
  { p: 'Steam Generator level',      tol: 1.5, want: function () { return hfp.sg_level_pct; } },
  { p: 'Secondary steam pressure',   tol: 3.0, want: function () { return hfp.steam_pressure_mpa * PSI; } },
  { p: 'Subcooling margin',          tol: 2.0, want: function () { return hfp.subcooling_c * 9 / 5; } },
  { p: 'Core inventory',             tol: 1.5, want: function () { return hfp.core_inventory_pct; } },
  { p: 'Decay heat',                 tol: 0.5, want: function () { return DECAY_PCT; } }
];

var s1Wrong = [], s1Unclaimed = [];
s1Rows.forEach(function (row) {
  if (!hfp) { s1Unclaimed.push(row.label + '  (no booted hot_full_power plant)'); return; }
  if (row.label.indexOf('Thot / Tcold') === 0) {
    var n = s1Nums(row.cell);
    var wantThot = hfp.thot_c * 9 / 5 + 32, wantTcold = hfp.tcold_c * 9 / 5 + 32,
        wantDT = (hfp.thot_c - hfp.tcold_c) * 9 / 5;   /* a DIFFERENCE: x9/5, no +32 offset */
    if (n.length < 5) { s1Wrong.push(row.label + ': could not parse Thot / Tcold / split'); return; }
    if (Math.abs(n[0] - wantThot) > 1.0)
      s1Wrong.push('Thot: manual ' + n[0] + ' degF, plant ' + wantThot.toFixed(1));
    if (Math.abs(n[1] - wantTcold) > 1.0)
      s1Wrong.push('Tcold: manual ' + n[1] + ' degF, plant ' + wantTcold.toFixed(1));
    if (Math.abs(n[4] - wantDT) > 1.0)
      s1Wrong.push('loop split: manual ' + n[4] + ' degF, plant ' + wantDT.toFixed(1));
    return;
  }
  if (row.label.indexOf('Control bank position') === 0) {
    var n2 = s1Nums(row.cell);
    var wantPct = 100 * hfp.rod_steps / BANK_STEPS;
    if (n2.length < 3) { s1Wrong.push(row.label + ': could not parse percent / steps'); return; }
    if (Math.abs(n2[0] - wantPct) > 1.0)
      s1Wrong.push('control bank %: manual ' + n2[0] + ', plant ' + wantPct.toFixed(1));
    if (Math.abs(n2[1] - hfp.rod_steps) > 1)
      s1Wrong.push('control bank steps: manual ' + n2[1] + ', plant ' + hfp.rod_steps.toFixed(0));
    if (Math.abs(n2[2] - BANK_STEPS) > 1)
      s1Wrong.push('control bank max steps: manual ' + n2[2] + ', plant ' + BANK_STEPS);
    return;
  }
  var spec = S1_ROWS.filter(function (r) { return row.label.indexOf(r.p) === 0; })[0];
  if (!spec) { s1Unclaimed.push(row.label); return; }
  var n3 = s1Nums(row.cell);
  if (!n3.length) { s1Wrong.push(row.label + ': no figure found in the row'); return; }
  var want = spec.want();
  if (Math.abs(n3[0] - want) > spec.tol)
    s1Wrong.push(row.label + ': manual ' + n3[0] + ', plant ' + want.toFixed(1));
});

ck('every §1.0 row is claimed by a field or a named plant constant — an unmapped row would go ' +
   'unchecked',
   s1Unclaimed.length === 0,
   s1Unclaimed.length ? s1Unclaimed.join(' | ') : s1Rows.length + ' rows, all claimed');
ck('every §1.0 figure matches the same booted hot_full_power plant',
   s1Wrong.length === 0,
   s1Wrong.length ? s1Wrong.join('  |  ') : 'all ' + s1Rows.length + ' rows agree with the booted plant');

/* ---- §3.0, ADV CAPACITY vs THIS PLANT'S RATED STEAM FLOW (#659) ----------------------------
 * The Atmospheric dump (ADV) row's SETPOINT is already checked above (the `^\*\*Atmospheric
 * dump \(ADV\)\*\*` entry in ROWS); its CAPACITY percentage was not — the row used to quote
 * Ginna's PER-GENERATOR figure (10 %) directly onto this plant's single generator, and nothing
 * read it. `RD.pwr2.relief.RELIEF.adv_kgs` is 8.18 kg/s (329,000 lbm/hr per valve, scaled
 * 300/1520) — checked here against THIS plant's rated steam flow, which `pwr2_engine` freezes
 * at construction as `eng.rated_steam` (`TB.steamDemand` at the RATED dispatch and the DESIGN
 * steam pressure — the same expression regardless of which initial condition boots, confirmed
 * by measurement across all six rather than assumed from the comment that says so). 8.18 /
 * 164.25 kg/s = 4.98 %, the figure the row now quotes (OWNER RULING, 2026-09-08: "Keep 4.98 % —
 * scale by thermal power; fix the manual").
 *
 * A cheap boot suffices: `rated_steam` is frozen on both axes at construction (see the comment
 * beside it in `pwr2_engine.js`), so no ticking is needed — unlike the §1.0/§11.0 checks above,
 * which need a SETTLED plant to answer a different question. */
console.log('\n' + BOLD + 'THE ADV CAPACITY FIGURE vs THE SHIPPED VALVE  (Manuals/09 §3.0)' + RST);

var advEng = new RD.pwr2.shell.PWR2Engine({ initial_state: 'hot_full_power' });
var RATED_STEAM_KGS = advEng.eng.rated_steam;
var ADV_PCT = RD.pwr2.relief.RELIEF.adv_kgs / RATED_STEAM_KGS * 100;

ck('the rated steam flow used for the reconciliation was actually computed, not assumed',
   RATED_STEAM_KGS > 100 && RATED_STEAM_KGS < 300,
   RATED_STEAM_KGS.toFixed(2) + ' kg/s');

var advRow = md.split('\n').filter(function (l) {
  return /^\|\s*\*\*Atmospheric dump \(ADV\)\*\*/.test(l);
})[0] || '';
var advM = advRow.match(/capacity\s*(?:~|≈)?\s*(\d+(?:\.\d+)?)\s*%\s*of rated steam flow/i);
ck('the ADV row prints a capacity figure as "N % of rated steam flow"',
   !!advM, advM ? advM[1] + ' %' : 'no such phrase found in the row');
if (advM) {
  var advClaimed = parseFloat(advM[1]);
  /* 0.3 points: the row rounds to the nearest whole percent (4.98 -> "5"), so 0.3 comfortably
   * covers that rounding with margin to spare — and is nowhere near loose enough to also accept
   * the old 10 % figure it replaced (a 5-point miss), so a reversion still reds. */
  var ADV_TOL = 0.3;
  ck('...and it matches RELIEF.adv_kgs over this plant\'s rated steam flow',
     Math.abs(advClaimed - ADV_PCT) <= ADV_TOL,
     'manual ' + advClaimed + ' %, plant ' + ADV_PCT.toFixed(2) + ' %  (RELIEF.adv_kgs=' +
     RD.pwr2.relief.RELIEF.adv_kgs.toFixed(3) + ' kg/s / rated_steam=' +
     RATED_STEAM_KGS.toFixed(2) + ' kg/s)');
}

console.log(DIM + '  (numbers and existence only — the Notes prose and the chapter narrative are ' +
            'not machine-checkable; that is the rest of #532)' + RST);

console.log('\n' + '='.repeat(74));
console.log('  run_manual_setpoints: ' + nPass + ' passed, ' + nFail + ' failed  (' +
            (nPass + nFail) + ' checks)');
console.log('='.repeat(74) + '\n');
process.exit(nFail > 0 ? 1 : 0);
