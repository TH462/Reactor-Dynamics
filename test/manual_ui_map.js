/* Plant Display control-bar labels per profile/view.
 * Source of truth for manual procedure ↔ on-screen control audit.
 *
 * PWR IS NOT MIRRORED HERE ANY MORE (#224). Its `primary`/`secondary` lists used to be a
 * hand copy of `ui/app.js` PD[].controls, and by 2026-07-31 they were a copy of a display
 * that no longer exists: the PWR plant display is the learning BOARD, with no view bar, and
 * app.js resolves a control through `RD.PwrBoard.revealControl`. Nine labels the authored
 * procedures use — `RCP Run/Stop`, `Dump SP`, `Pressure SP`, `Accumulator valve`,
 * `Trip Blocks`, `Boron control`, `1/M Plot`, `Turbine — Connect Grid`, `Rod AUTO` — were
 * absent from the copy while being perfectly reachable on the board, so the copy could only
 * ever produce false failures. `pwrLabels()` reads the board's own `CONTROL_LABEL_MAP`
 * instead, which is the authority `revealControl` resolves against and the one
 * `run_campaign` already validates campaign beat highlights against. One source, three
 * consumers.
 *
 * `view` is therefore decorative for PWR — recorded as `'board'`. `verify_manual_follow`
 * already ignored it on this plant, and the `&view=` URL parameter it used to navigate with
 * is read by nothing in `ui/app.js`. RBMK and BWR still have real view bars and are still
 * listed below; those are on hold and their procedures have not moved.
 */
'use strict';

var _pwrLabels = null;
function pwrLabels() {
  if (_pwrLabels) return _pwrLabels;
  var path = require('path');
  var ROOT = path.join(__dirname, '..');
  // Board scripts attach to window.RD; in Node the two are the same object. Same
  // preamble run_campaign.js uses to reach this vocabulary.
  if (!global.window) global.window = global;
  ['ui/diagram/board/pwr_board_data.js', 'ui/diagram/board/pwr_board_inspect.js',
   'ui/manual_md.js', 'ui/diagram/board/pwr_board_wiring.js'].forEach(function (p) {
    require(path.join(ROOT, p));
  });
  _pwrLabels = globalThis.RD.PwrBoardDriver.controlLabels();
  return _pwrLabels;
}

var VIEW_CONTROLS = {
  pwr: {
    // Derived — see pwrLabels(). Kept as getters so requiring this file stays cheap for
    // consumers that only want STEP_UI.
    get primary() { return pwrLabels(); },
    get secondary() { return pwrLabels(); },
    get board() { return pwrLabels(); },
    scram: 'SCRAM',
  },
  rbmk_pre: {
    primary: ['Control Bank', 'Rod Speed', 'Shutdown Bank', 'MCP / Channel Flow', 'Emergency Core Cooling (ECCS)', 'EPS'],
    secondary: ['Feedwater', 'Turbine Load', 'Steam Dump'],
    scram: 'AZ-5',
  },
  rbmk_post: {
    primary: ['Control Bank', 'Rod Speed', 'Shutdown Bank', 'MCP / Channel Flow', 'Emergency Core Cooling (ECCS)', 'EPS'],
    secondary: ['Feedwater', 'Turbine Load', 'Steam Dump'],
    scram: 'AZ-5',
  },
  bwr: {
    primary: ['Control Bank', 'Rod Speed', 'Shutdown Bank', 'Recirc Drive'],
    secondary: ['RCIC', 'Isolation Condenser (IC)', 'HPCI', 'ADS', 'LPCI', 'Core Spray (LPCS)', 'Manual SRV',
      'Standby Liquid Control (SLC)', 'Steam Dump', 'Turbine Load', 'Feedwater'],
    scram: 'SCRAM',
  },
};

/* Per-step: which view hosts the control group (scram = status-bar button, not pdCtlRow;
 * `board` = the PWR learning board, which has no view bar — see the header).
 *
 * THIS TABLE IS THE COVERAGE LIST FOR TWO GATES, not just a lookup, and that is why it
 * going stale mattered (#224). `verify_manual_follow.js` iterates THIS, not the procedure
 * steps — so a step with no entry here is not merely unmapped, it is **unverified**, and
 * nothing said so. When `pwr_heatup` and `pwr_startup` were re-authored (#197 1/M rebuild,
 * #202 Mode 3 → Mode 1, #206 heatup repairs) the table did not move with them: measured
 * 2026-07-31, it covered **17 of the 45 controlled PWR steps**, with `pwr_heatup` at zero,
 * and the browser gate reported a confident PASS over that slice.
 *
 * Filled below. Every one of the 45 was checked against the board vocabulary first, and
 * **all 45 resolve** — there was never a step pointing at a control the player cannot
 * reach. The 32 audit lines were the map's absence, not the plant's.
 *
 * Two entries were also positively WRONG, both from steps being inserted above them:
 * `pwr_startup` i:3 said `Control Bank` where the pill reads `1/M Plot`, and i:7 said
 * `SR detector` where it reads `Control Bank`. Corrected in place.
 *
 * MAINTENANCE: add an entry when you add a controlled step. `run_manual_controls.js`
 * fails until you do — it is in `run_all` as of #224, which is what stops this table
 * rotting a second time. */
var STEP_UI = {
  pwr_startup: [
    { i: 2,  view: 'board', control: 'Feed Pumps' },
    { i: 3,  view: 'board', control: '1/M Plot' },
    { i: 4,  view: 'board', control: 'Control Bank' },
    { i: 5,  view: 'board', control: 'Control Bank' },
    { i: 6,  view: 'board', control: 'Control Bank' },
    { i: 7,  view: 'board', control: 'Control Bank' },
    { i: 8,  view: 'board', control: 'Control Bank' },
    { i: 9,  view: 'board', control: 'SR detector' },
    { i: 10, view: 'board', control: 'Control Bank' },
    { i: 11, view: 'board', control: 'Control Bank' },
    { i: 12, view: 'board', control: 'Control Bank' },
    { i: 13, view: 'board', control: 'Trip Blocks' },
    { i: 14, view: 'board', control: 'Trip Blocks' },
    { i: 15, view: 'board', control: 'Turbine — Connect Grid' },
    { i: 16, view: 'board', control: 'Turbine Load' },
  ],
  // PWR-N01 pump-heat heatup (#255) — six controlled steps, then a long observe ride.
  pwr_heatup: [
    { i: 1,  view: 'board', control: 'RCP Run/Stop' },
    { i: 2,  view: 'board', control: 'Turbine Load' },
    { i: 3,  view: 'board', control: 'Feed Pumps' },
    { i: 4,  view: 'board', control: 'Dump SP' },
    { i: 5,  view: 'board', control: 'Pressure SP' },
    { i: 6,  view: 'board', control: 'Accumulator valve' },
  ],
  // PWR-N15 controlled cooldown (#310) — fourteen controlled steps. The four cooling
  // legs are RAMP steps, but a ramp is still one control on the board: the player is
  // walking the Dump SP box down, so the pill (and the browser gate's reachability
  // check) is the same as for a stepped setpoint.
  pwr_cooldown: [
    { i: 1,  view: 'board', control: 'Boron control' },
    { i: 2,  view: 'board', control: 'Pressure SP' },
    { i: 3,  view: 'board', control: 'Trip Blocks' },
    { i: 4,  view: 'board', control: 'Trip Blocks' },
    { i: 5,  view: 'board', control: 'HPI/LPI' },
    { i: 6,  view: 'board', control: 'Dump SP' },
    { i: 7,  view: 'board', control: 'Dump SP' },
    { i: 8,  view: 'board', control: 'Accumulator valve' },
    { i: 9,  view: 'board', control: 'Dump SP' },
    { i: 10, view: 'board', control: 'Dump SP' },
    { i: 11, view: 'board', control: 'Residual Heat Removal (RHR)' },
    { i: 12, view: 'board', control: 'Residual Heat Removal (RHR)' },
    { i: 13, view: 'board', control: 'RCP Run/Stop' },
    { i: 14, view: 'board', control: 'Residual Heat Removal (RHR)' },
  ],
  pwr_raise_power: [{ i: 0, view: 'primary', control: 'Rod Speed' }, { i: 1, view: 'secondary', control: 'Turbine Load' }],
  pwr_lower_power: [{ i: 0, view: 'secondary', control: 'Turbine Load' }, { i: 1, view: 'primary', control: 'Rod Speed' }],
  pwr_pressure_control: [{ i: 1, view: 'primary', control: 'Pressurizer Spray (PZR)' }],
  pwr_sg_level: [{ i: 1, view: 'secondary', control: 'Feed Pump' }],
  pwr_shutdown: [{ i: 0, view: 'secondary', control: 'Turbine Load' }, { i: 1, view: 'scram', control: 'SCRAM' }],
  pwr_loss_of_feedwater: [{ i: 1, view: 'scram', control: 'SCRAM' }, { i: 2, view: 'secondary', control: 'Turbine Load' }, { i: 3, view: 'secondary', control: 'AFW' }],
  pwr_rcp_trip: [{ i: 1, view: 'scram', control: 'SCRAM' }],
  pwr_stuck_porv: [{ i: 2, view: 'primary', control: 'PORV Block Valve' }],
  // PWR-T06 post-trip (#319). Steps 1 and 2 are the SAME control in its two states —
  // the dual SCRAM / PRESS-TO-RESET button (#75). Step 2 is the first authored content
  // anywhere to name `reset_rps`, which has been board-reachable and taught by nothing.
  pwr_post_trip: [{ i: 0, view: 'scram',  control: 'SCRAM' },
                  { i: 1, view: 'scram',  control: 'SCRAM' },
                  { i: 2, view: 'board',  control: 'Main Breaker' },
                  { i: 3, view: 'board',  control: 'AFW' },
                  { i: 4, view: 'board',  control: 'Plant Pressure' }],
  rbmk_startup: [{ i: 1, view: 'primary', control: 'Control Bank' }],
  rbmk_raise_power: [{ i: 0, view: 'primary', control: 'MCP / Channel Flow' }],
  rbmk_shutdown: [{ i: 0, view: 'scram', control: 'AZ-5' }],
  rbmk_mcp_trip: [{ i: 1, view: 'scram', control: 'AZ-5' }],
  bwr_startup: [{ i: 1, view: 'primary', control: 'Control Bank' }],
  bwr_raise_power: [{ i: 0, view: 'primary', control: 'Recirc Drive' }],
  bwr_shutdown: [{ i: 0, view: 'scram', control: 'SCRAM' }],
  bwr_sbo_rcic: [{ i: 1, view: 'scram', control: 'SCRAM' }, { i: 2, view: 'secondary', control: 'RCIC' }],
};

function controlOnView(prof, view, control) {
  var vc = VIEW_CONTROLS[prof];
  if (!vc) return false;
  if (view === 'scram') return vc.scram === control;
  return (vc[view] || []).indexOf(control) >= 0;
}

module.exports = { VIEW_CONTROLS: VIEW_CONTROLS, STEP_UI: STEP_UI, controlOnView: controlOnView };