/*
 * run_manual_commands.js — DOES THE OPERATOR'S MANUAL DOCUMENT THE PLANT WE SHIP? (#570)
 *
 * `Manuals/03_CONTROLS_AND_INDICATIONS.md` §18 is the operator's command reference: one row per
 * control, naming the action and its payload. It is the closest thing the manual has to a machine-
 * readable claim about the plant, and nothing checked it. Measured when this runner was written:
 * **4 of 46 documented actions were REFUSED by the plant the site runs** —
 *
 *     open_porv (§6.1)              the operator path is open_porv_manual / close_porv (#547's
 *                                   action name, the one the control kernel used to rewrite into)
 *     set_sr_detector (§4.3)        the SR channel auto-energizes below the P-6 class point
 *     set_condenser_cw_temp (§13.1) the condenser model has CW pumps on/off only
 *     set_steam_demand (§12.2)      the turbine is dispatched by load target only
 *
 * — and a fifth row documented `set_steam_dump {mode | pct}` when `pct` was silently swallowed.
 *
 * THE CLASS. #562 shipped because three documents described an auxiliary-feedwater throttle the
 * engine did not have; #567 shipped because five board controls sent actions the plant refuses.
 * Both are the manual and the plant drifting apart with nothing in between. This is the cheapest
 * possible check on that seam: the doc names an action, the shell's registries say whether the
 * plant has it. **The DOC is the thing under test here** — that is the one case where reading a
 * hand-maintained table is the right thing to do rather than the trap (a gate that iterates a
 * hand-maintained map to test the CODE tests the map instead; here the map IS the claim).
 *
 * WHAT IT CANNOT DO, stated so nobody trusts it further than it goes: it checks that a documented
 * action EXISTS and is not refused. It cannot check the payload KEY (#562's `set_afw_flow {pct}`
 * row was correct while the shell read only `normalized`), and it cannot check that the prose
 * around the row is true. `run_pwr2_roundtrip` covers the first of those; nothing covers the
 * second, which is why #570 exists.
 *
 * Run: node test/run_manual_commands.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var SRC = path.join(__dirname, '..', 'engines', 'pwr2');
require(path.join(__dirname, '..', 'engines', 'load_mode.js'));
require(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_config.js'));
require(path.join(__dirname, '..', 'layers', 'control', 'control_kernel.js'));
require(path.join(__dirname, '..', 'layers', 'control', 'pwr_control.js'));
require(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_instruments.js'));
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_kinetics',
 'pwr2_fuel', 'pwr2_reactor', 'pwr2_sources', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
 'pwr2_condenser', 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_afw', 'pwr2_damage', 'pwr2_protection',
 'pwr2_pressurizer', 'pwr2_dumpctl', 'pwr2_break', 'pwr2_containment', 'pwr2_rhr',
 'pwr2_true_state', 'pwr2_instruments', 'pwr2_feedwater', 'pwr2_engine', 'pwr2_shell'
].forEach(function (f) { require(path.join(SRC, f + '.js')); });

var SH = globalThis.RD.pwr2.shell;
var RED = '[31m', GREEN = '[32m', BOLD = '[1m', DIM = '[2m', RST = '[0m';
var nPass = 0, nFail = 0;
function ck(name, cond, note) {
  var ok = !!cond;
  if (ok) nPass++; else nFail++;
  console.log((ok ? '  ' + GREEN + 'PASS' + RST + '  ' : '  ' + RED + 'FAIL' + RST + '  ') + name +
              (note ? '  -- ' + note : ''));
  return ok;
}

/* KERNEL-OWNED ACTIONS never reach the engine's registries — the control layer answers them, so
 * their absence from MAPPED/REHOMED/REFUSED is correct. Same list `run_pwr2_kernel` band 4 keeps,
 * and it is short on purpose: every addition is a claim that the KERNEL handles it. */
var KERNEL_OWNED = {
  set_auto_channel: 1, set_auto_setpoint: 1, set_esf_auto: 1, acknowledge_all_alarms: 1
};

/* A documented action the plant legitimately REFUSES, with the reason the manual gives for
 * documenting it anyway. Empty, deliberately: a manual that tells the operator to use a command
 * the plant refuses is the defect, and an exemption here needs a better argument than "the row
 * is old". */
var DOCUMENTED_REFUSALS = {};

var MD_PATH = path.join(__dirname, '..', 'Manuals', '03_CONTROLS_AND_INDICATIONS.md');
var md = fs.readFileSync(MD_PATH, 'utf8');

/* §18's rows are `| control (§x) | \`action\` [/ \`action\`] | payload |`. Parse the ACTION cell
 * only — the label and payload columns carry backticked prose that is not an action name. */
var TABLE_HEAD = '## 18.0';
var iTable = md.indexOf(TABLE_HEAD);
var section = iTable === -1 ? '' : md.slice(iTable, md.indexOf('\n## ', iTable + 5) + 1 || undefined);
var actions = {};
section.split('\n').forEach(function (line) {
  if (line.charAt(0) !== '|') return;
  var cells = line.split('|');
  if (cells.length < 4) return;
  var label = (cells[1] || '').trim(), cell = cells[2] || '';
  (cell.match(/`[a-z_]+`/g) || []).forEach(function (m) {
    actions[m.replace(/`/g, '')] = label;
  });
});

console.log('\n' + BOLD + 'THE OPERATOR MANUAL vs THE SHIPPED COMMAND SURFACE  (Manuals/03 §18)' + RST);

ck('the command table parses — §18 exists and carries rows',
   Object.keys(actions).length > 20,
   Object.keys(actions).length + ' actions found (a parse that silently found none would pass ' +
   'every check below)');

var refused = [], missing = [];
Object.keys(actions).sort().forEach(function (a) {
  if (KERNEL_OWNED[a]) return;
  if (SH.REFUSED[a] !== undefined) {
    if (!DOCUMENTED_REFUSALS[a]) refused.push(a + '  (' + actions[a] + ')');
    return;
  }
  if (!SH.MAPPED[a] && !SH.REHOMED[a]) missing.push(a + '  (' + actions[a] + ')');
});

ck('every documented action EXISTS on the shipped plant',
   missing.length === 0,
   missing.length ? missing.join(' | ')
                  : Object.keys(actions).length + ' actions, all in a registry or kernel-owned');
ck('...and none of them is one the plant REFUSES — the manual must not instruct an action the ' +
   'operator will be refused for',
   refused.length === 0,
   refused.length ? refused.join(' | ') : 'no documented action lands in REFUSED');

/* THE REVERSE DIRECTION is deliberately NOT asserted. Plenty of MAPPED actions have no board
 * control and no manual row — the instructor's casualty levers, the facade doors scenarios drive
 * — and requiring a row for each would push the manual toward a command dump, which is not what
 * an operator's manual is. The asymmetry is the point: the manual may say less than the plant
 * does, but nothing it says may be false. */
console.log(DIM + '  (the reverse — every action documented — is deliberately not asserted; see the ' +
            'note in this file)' + RST);

console.log('\n' + '='.repeat(74));
console.log('  run_manual_commands: ' + nPass + ' passed, ' + nFail + ' failed  (' +
            (nPass + nFail) + ' checks)');
console.log('='.repeat(74) + '\n');
process.exit(nFail > 0 ? 1 : 0);
