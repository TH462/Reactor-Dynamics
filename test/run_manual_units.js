/*
 * run_manual_units.js — the manual's dual-unit gate.
 *
 * The operator manuals quote **US customary first, SI in parentheses**
 * (`2235 psi (15.41 MPa)`, `579.2 °F (304 °C)`). This runner re-derives the US
 * value from the SI value in every such pair and fails on any that does not
 * check out, plus any SI quantity left without a US partner.
 *
 * WHY THIS EXISTS. The conversion is not one rule, it is three, and the third is
 * a trap:
 *
 *     pressure     MPa  → psi    × 145.038
 *     temperature  °C   → °F     × 9/5 + 32
 *     TEMPERATURE  °C   → °F     × 9/5          ← no offset
 *     DIFFERENCE
 *
 * Subcooling margin, leg ΔT, DNB margin, control deadbands and cooldown rates are
 * DIFFERENCES. A 41 °C subcooling margin is 73.8 °F, not 105.8 °F — and the wrong
 * one reads as a *healthier* margin than the plant has. When this pass was first
 * scripted with a line-level heuristic it mis-classified eight sites in exactly
 * this way, including two absolute leg temperatures converted as differences and
 * a Tavg setpoint 32 °F low. A human reading the tables would not have caught it;
 * arithmetic does.
 *
 * HOW IT DECIDES which rule applies: for most quantities it tries both and accepts
 * either. But every SI value listed in DIFF_ONLY below MUST resolve as a
 * difference **at every site where it appears** — an absolute conversion there is
 * a hard failure.
 *
 * That per-site rule is the important half, and it was not the first design. The
 * first version only checked that each difference quantity appeared as a
 * difference *somewhere in the corpus*, which let a margin be "corrected" to the
 * absolute rule at one site while other sites kept the list happy: rewriting the
 * full-power subcooling margin from 73.8 °F to 105.8 °F passed a green gate.
 * Verified by injecting exactly that; it now fails.
 *
 * WHAT THIS GATE IS SCORED ON: **failures only**, deliberately — not the number of
 * pairs it checked. That is the opposite of `run_hr3`, `run_contract` and
 * `run_inspect`, where the count IS part of the baseline on purpose.
 *
 * The difference is what a moving count MEANS. There, it moves when someone adds a
 * plant coupling, a `true_state` field or a board item — a decision that deserves a
 * second look, so the baseline bump is useful friction. Here it moves whenever
 * anyone edits any number in any sentence, including pure prose work. Scored that
 * way it bumped four times in the session that introduced it (182 → 186 → 215 →
 * 218 → 220), every one of them noise. A gate that cries during ordinary edits
 * teaches the next person to update the number without reading it, which is worse
 * than not having the gate.
 *
 * So the coverage counts are printed for a human to read and kept OFF the scraped
 * tally line. If you add checks here, the baseline does not move; if something is
 * actually wrong, it does.
 *
 *   node test/run_manual_units.js
 */
'use strict';
var fs = require('fs');
var path = require('path');

var DIR = path.join(__dirname, '..', 'Manuals');
// The packed operator set. The dev-only working logs are not operator docs.
var SKIP_FILE = /^(ISSUES_AND_FINDINGS|CAMPAIGN_MANUAL_DISCREPANCIES|CAMPAIGN_MODE_ALIGNMENT_SPEC)/;

// The manual is not the only operator-facing prose that quotes plant numbers.
// These two carry authored copy the player reads ON THE BOARD, and they drifted
// to a different convention than the manual — the inspector had one line reading
// "15.41 MPa (about 2235 psi)", i.e. the convention exactly backwards, while its
// neighbours were US-only and the checklists were SI-only. Same rule, same gate.
//
// COMMAND PAYLOADS ARE NOT PROSE. `cmd: { action: 'set_pressure_setpoint', mpa: 15.41 }`
// is an engine argument and stays SI — it carries no unit STRING, so the patterns
// below never see it. Do not "convert" those.
var SRC_FILES = [
  path.join(__dirname, '..', 'ui', 'manual_procedures.js'),
  path.join(__dirname, '..', 'ui', 'diagram', 'board', 'pwr_board_inspect.js'),
];
// The revision history quotes past values as a record of what changed ("Tavg
// 304→297 °C"). Those are history, not plant values an operator would act on, so
// they are exempt from the US-partner requirement — but any US (SI) pair written
// there is still arithmetic-checked like everywhere else.
var SKIP_ORPHANS = /^00_REVISION_HISTORY/;

// SI °C values that are ALWAYS a temperature difference in this manual set, at
// every site. Converting one of these with the absolute rule overstates a margin
// — 41 °C of subcooling is 73.8 °F, and "105.8 °F" would read as a comfortable
// plant. Enforced per site, not corpus-wide.
//
// If a genuinely ABSOLUTE use of one of these numbers is ever added, this gate
// will flag it. That is the intended outcome: go and look, then split the entry.
var DIFF_ONLY = {
  41: 'subcooling margin at full power',
  11: 'LO SUBCOOL green boundary',
  11.1: 'LO SUBCOOL setpoint',
  33: 'leg ΔT at rated',
  8: 'DNB margin / cavitation onset / steam-dump band',
  0.8: 'rod AUTO deadband',
  2: 'saturation-correlation tolerance',
  389: 'fuel temperature above coolant',
  0.5: '°C per ppm boron worth',
  // NOT 50. It was listed here for the RHR cooldown RATE (50 °C/h → 90 °F/h) and
  // the gate immediately caught the conflict: 50 °C is also an absolute
  // temperature in this plant — the Mode 5 RCS (~122 °F) and the RHR sink. The
  // rate sites carry a `/h` suffix and validate as differences on their own, so
  // the bare number needs no entry. Left as a worked example of the split this
  // list's header asks for.
};

var NUM = '-?\\d+(?:\\.\\d+)?';
function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 0.06 : tol); }

var RULES = [
  { si: 'MPa', us: 'psi', modes: [{ name: 'abs', f: function (v) { return v * 145.038; }, tol: 0.6 }] },
  { si: 'kPa', us: 'inHg', modes: [{ name: 'abs', f: function (v) { return v * 0.2953; } }] },
  // Tolerance 0.1 °F: an SI value quoted to 1 dp is itself only good to ±0.05 °C,
  // which is ±0.09 °F once converted. Tighter than that fails honest roundings
  // (176.7 °C → 350.06 °F, written 350 °F for a Tech-Spec-class boundary).
  { si: '°C', us: '°F', modes: [
      { name: 'abs', f: function (v) { return v * 9 / 5 + 32; }, tol: 0.1 },
      { name: 'diff', f: function (v) { return v * 9 / 5; }, tol: 0.1 },
  ] },
];

var G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', D = '\x1b[2m', B = '\x1b[1m', X = '\x1b[0m';
var checked = 0, bad = [], orphans = [], diffSites = 0, seenDiff = {};

// One list: the packed manual set, then the board-facing source files.
var TARGETS = fs.readdirSync(DIR).filter(function (f) {
  return /\.md$/.test(f) && !SKIP_FILE.test(f);
}).map(function (f) { return { label: f, path: path.join(DIR, f), js: false }; })
  .concat(SRC_FILES.map(function (p) {
    return { label: path.basename(p), path: p, js: true };
  }));

TARGETS.forEach(function (target) {
  var file = target.label;
  var lines = fs.readFileSync(target.path, 'utf8').split('\n');
  var inFence = false;

  // In a JS source only AUTHORED PROSE counts. A `//` comment is a note to the
  // next developer, not something a player reads; holding it to the operator
  // convention would add noise without protecting anyone.
  function isProse(line) { return !target.js || !/^\s*(\/\/|\*|\/\*)/.test(line); }

  lines.forEach(function (line, i) {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    if (inFence || !isProse(line)) return;

    RULES.forEach(function (rule) {
      // "<us>[ – <us2>] UNIT_US (<si>[ – <si2>] UNIT_SI)" — also accepts "US / SI",
      // markdown emphasis around the unit (`**20 °F** (11.1 °C)`), a per-hour
      // suffix (`90 °F/h (50 °C/h)`), and ~ / ± qualifiers on either side.
      var re = new RegExp(
        '(' + NUM + ')(?:\\s*[–—/-]\\s*[~±]?(' + NUM + '))?\\s*' + rule.us +
        '(?:/(?:h|hr|s|min))?[*\\s]*[(/][*\\s~±]*(' + NUM + ')' +
        '(?:\\s*[–—/-]\\s*[~±]?(' + NUM + '))?\\s*' + rule.si, 'g');
      var m;
      while ((m = re.exec(line))) {
        var pairs = [[+m[1], +m[3]]];
        if (m[2] != null && m[4] != null) pairs.push([+m[2], +m[4]]);
        pairs.forEach(function (p) {
          checked++;
          var hit = null;
          rule.modes.forEach(function (mode) {
            if (hit) return;
            if (near(mode.f(p[1]), p[0], mode.tol)) hit = mode.name;
          });
          var mustDiff = rule.si === '°C' && Object.prototype.hasOwnProperty.call(DIFF_ONLY, String(p[1]));
          if (!hit) {
            bad.push({ file: file, line: i + 1, text: m[0], us: p[0], si: p[1],
                       want: rule.modes.map(function (md) {
                         return md.name + ' ' + md.f(p[1]).toFixed(2);
                       }).join(' | '), unit: rule.us });
          } else if (mustDiff && hit !== 'diff') {
            bad.push({ file: file, line: i + 1, text: m[0], us: p[0], si: p[1],
                       want: 'DIFFERENCE ' + (p[1] * 9 / 5).toFixed(1) +
                             ' — ' + DIFF_ONLY[String(p[1])] + ' is a temperature DIFFERENCE, ' +
                             'converted here with the absolute rule', unit: rule.us });
          } else if (hit === 'diff') {
            diffSites++;
            if (mustDiff) seenDiff[String(p[1])] = true;
          }
        });
      }
    });
  });

  // Any SI quantity with no US partner anywhere on its line.
  var inFence2 = false;
  if (SKIP_ORPHANS.test(file)) return;
  lines.forEach(function (line, i) {
    if (/^\s*```/.test(line)) { inFence2 = !inFence2; return; }
    if (inFence2 || !isProse(line)) return;
    // Prose that names a unit without quoting a plant value, and the one table
    // whose whole point is to define the conversions.
    if (/T_sat\(°C\)|not raw °C|tens of °C|× 145\.038|× 9\/5|× 0\.2953/.test(line)) return;
    ['MPa', '°C', 'kPa'].forEach(function (u) {
      var re = new RegExp('(' + NUM + ')\\s*' + u, 'g'), m;
      while ((m = re.exec(line))) {
        var pre = line.slice(0, m.index);
        // It IS the SI half of a pair: "<n> psi (" / "<n> °F / " / "<n> inHg (",
        // tolerating markdown emphasis after the unit (`**20 °F** (11.1 °C)`) and
        // a range or a second number already inside the parenthetical.
        if (/(psi|°F|inHg)[*\s]*[(\/][^)]*$/.test(pre)) continue;
        orphans.push({ file: file, line: i + 1, text: m[0],
                       ctx: line.trim().slice(0, 100) });
      }
    });
  });
});

console.log(B + 'Manual dual-unit gate — US first, SI in parentheses' + X + '\n');

if (bad.length) {
  console.log(R + B + 'BAD CONVERSIONS (' + bad.length + ')' + X);
  bad.forEach(function (b) {
    console.log(R + '  ✗' + X + ' ' + b.file + ':' + b.line + '  ' + B + b.text + X);
    console.log(D + '      ' + b.si + ' should give ' + b.want + ' ' + b.unit + ', found ' + b.us + X);
  });
  console.log('');
}
if (orphans.length) {
  console.log(Y + B + 'SI VALUES WITH NO US PARTNER (' + orphans.length + ')' + X);
  orphans.forEach(function (o) {
    console.log(Y + '  ✗' + X + ' ' + o.file + ':' + o.line + '  ' + B + o.text + X);
    console.log(D + '      ' + o.ctx + X);
  });
  console.log(D + '\n  Quote US first with SI in parentheses — see Manuals/README.md "Units".' + X + '\n');
}

// Every DIFF_ONLY quantity must actually be present — an entry that matches
// nothing is an allow-list outliving its text, and would silently stop guarding.
var unusedDiff = Object.keys(DIFF_ONLY).filter(function (k) { return !seenDiff[k]; });
if (unusedDiff.length) {
  console.log(Y + B + 'STALE DIFF_ONLY ENTRIES (' + unusedDiff.length + ') — no site uses these' + X);
  unusedDiff.forEach(function (k) { console.log(Y + '  ✗' + X + ' ' + k + ' °C — ' + DIFF_ONLY[k]); });
  console.log(D + '\n  Delete them, or restore the text they guarded.' + X + '\n');
}

// ---------------------------------------------------------------- gpm display scale
// The gpm figures the manual quotes must match the scale the BOARD actually renders.
//
// There are two places a normalized flow becomes gpm: `GPM_CHARGING`/`GPM_LETDOWN` in
// `ui/diagram/board/pwr_board_wiring.js` (LIVE — this is what the player reads), and the
// `identity` display block in `engines/pwr/pwr_config.js` (documentation, zero code
// consumers, and what `Manuals/12` §Fidelity quotes). They drifted 1.5×: the config block
// and the manual said 40 gpm charging / 20 gpm letdown on a 666.7-per-normalized-unit
// scale, while the board has always used a single 1000 full-scale — a 0–60 gpm charging box
// and a 30 gpm orifice-A letdown. Nothing compared them, so a number the player can read in
// two places disagreed with itself.
//
// This lives in the units gate because that is what it is: the manual quoting a number the
// plant does not display. It is NOT a physical-fidelity check — these gpm are pacing
// flavour and `Manuals/12` says so.
var gpmBad = [];
(function () {
  var wiring = fs.readFileSync(path.join(__dirname, '..', 'ui', 'diagram', 'board',
    'pwr_board_wiring.js'), 'utf8');
  var cfgSrc = fs.readFileSync(path.join(__dirname, '..', 'engines', 'pwr',
    'pwr_config.js'), 'utf8');
  function grab(src, name, re) {
    var m = src.match(re);
    if (!m) { gpmBad.push(name + ' — could not be read (renamed or reformatted?)'); return null; }
    return parseFloat(m[1]);
  }
  var gpmCharging = grab(wiring, 'GPM_CHARGING (board)', /GPM_CHARGING\s*=\s*(\d+(?:\.\d+)?)/);
  var gpmLetdown  = grab(wiring, 'GPM_LETDOWN (board)',  /GPM_LETDOWN\s*=\s*(\d+(?:\.\d+)?)/);
  // Regex accepts scientific notation since #408 (charging_max is 1.33333e-4 now).
  var chgMax      = grab(cfgSrc, 'reactivity.charging_max', /charging_max:\s*(\d+(?:\.\d+)?(?:e-?\d+)?)/);
  var chgGpm      = grab(cfgSrc, 'identity.charging_max_gpm', /charging_max_gpm:\s*(\d+(?:\.\d+)?)/);
  var ldGpm       = grab(cfgSrc, 'identity.letdown_normal_gpm', /letdown_normal_gpm:\s*(\d+(?:\.\d+)?)/);
  if (gpmCharging == null || gpmLetdown == null || chgMax == null ||
      chgGpm == null || ldGpm == null) return;

  // The board deliberately uses ONE full-scale constant for CVCS (and feed). If these ever
  // diverge, "gpm" stops meaning one thing on the board and the checks below are moot.
  if (gpmCharging !== gpmLetdown) {
    gpmBad.push('board GPM_CHARGING (' + gpmCharging + ') != GPM_LETDOWN (' + gpmLetdown +
      ') — the board is meant to share one CVCS full-scale');
  }
  // charging: exactly derivable, so assert it exactly.
  var wantChg = chgMax * gpmCharging;
  if (Math.abs(chgGpm - wantChg) > 0.5) {
    gpmBad.push('identity.charging_max_gpm is ' + chgGpm + ' but the board renders charging_max ' +
      chgMax + ' x GPM_CHARGING ' + gpmCharging + ' = ' + wantChg + ' gpm');
  }
  // letdown: orifice A is pressure-driven, so its normalized flow is not a bare constant —
  // 0.030 at NOP is the nominal pwr_config's own letdown comment states and the board's
  // 30 gpm readout reflects. If a coefficient retune moves that nominal, update both sides
  // and this number together.
  // Derived from the coefficient since #408 (the 0.030 literal was the old
  // currency): nominal = coeff x sqrt(15.17 - letdown_backpressure).
  var ldCoeff = grab(cfgSrc, 'reactivity.letdown_orifice_a_coeff', /letdown_orifice_a_coeff:\s*(\d+(?:\.\d+)?(?:e-?\d+)?)/);
  var ldBack  = grab(cfgSrc, 'reactivity.letdown_backpressure_mpa', /letdown_backpressure_mpa:\s*(\d+(?:\.\d+)?)/);
  if (ldCoeff == null || ldBack == null) return;
  var LETDOWN_A_NOMINAL = ldCoeff * Math.sqrt(15.17 - ldBack);
  var wantLd = LETDOWN_A_NOMINAL * gpmLetdown;
  if (Math.abs(ldGpm - wantLd) > 0.5) {
    gpmBad.push('identity.letdown_normal_gpm is ' + ldGpm + ' but orifice A nominal ' +
      LETDOWN_A_NOMINAL + ' x GPM_LETDOWN ' + gpmLetdown + ' = ' + wantLd + ' gpm');
  }
  // ...and the manual must quote the same two numbers it documents.
  var fid = fs.readFileSync(path.join(DIR, '12_SIM_PHYSICS.md'), 'utf8')
    .split('\n').filter(function (l) { return /\*\*Indicative\*\*/.test(l); })[0];
  if (!fid) {
    gpmBad.push('Manuals/12 §Fidelity "Indicative" row not found — the manual side is unguarded');
  } else {
    [[chgGpm, 'charging'], [ldGpm, 'letdown']].forEach(function (p) {
      var re = new RegExp('(\\d+(?:\\.\\d+)?)\\s*gpm\\s+' + p[1]);
      var m = fid.match(re);
      if (!m) gpmBad.push('Manuals/12 §Fidelity does not quote a "N gpm ' + p[1] + '" figure');
      else if (Math.abs(parseFloat(m[1]) - p[0]) > 0.5) {
        gpmBad.push('Manuals/12 §Fidelity says ' + m[1] + ' gpm ' + p[1] +
          ', config/board say ' + p[0]);
      }
    });
  }
})();
if (gpmBad.length) {
  console.log(R + B + 'GPM DISPLAY-SCALE MISMATCH (' + gpmBad.length + ')' + X);
  gpmBad.forEach(function (m) { console.log(R + '  ✗' + X + ' ' + m); });
  console.log(D + '\n  The board wiring is the LIVE scale; pwr_config identity + Manuals/12 follow it.' + X + '\n');
}

// SCORED ON FAILURES ONLY — the coverage counts are printed on the line ABOVE, where
// run_all's scraper will not reach them. See the "what this gate is scored on" note in
// the header for why this one differs from run_hr3 / run_contract.
var fails = bad.length + orphans.length + unusedDiff.length + gpmBad.length;
console.log(B + '──────────────────────────────────────────' + X);
console.log(D + checked + ' pairs · ' + diffSites + ' temperature-difference sites · ' +
  TARGETS.length + ' files' + X);
console.log(B + (fails ? R + 'MANUAL UNITS: FAIL' : G + 'MANUAL UNITS: OK') + X +
  '  ' + fails + ' failed' + X);
process.exit(fails ? 1 : 0);
