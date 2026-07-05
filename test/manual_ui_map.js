/* Plant Display control-bar labels per profile/view — mirrors ui/app.js PD[].primary/secondary.controls.
 * Source of truth for manual procedure ↔ on-screen control audit. */
'use strict';

var VIEW_CONTROLS = {
  pwr: {
    primary: ['Control Bank', 'Rod Speed', 'Shutdown Bank', 'Boron (Reactivity) — CVCS', 'Charging Pump (CVCS)', 'Letdown Valve (CVCS)',
      'CVCS Inventory Control', 'Pressurizer Heaters (PZR)', 'Pressurizer Spray (PZR)', 'Reactor Coolant Pumps (RCP)',
      'Relief Valve (PORV)', 'PORV Block Valve', 'Decay-Heat Removal (DHR)'],
    secondary: ['Feed Pumps', 'AFW', 'Feed Reg', 'Steam Dump', 'MSIV', 'Turbine Load', 'Main Breaker'],
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

/* Per-step: which view hosts the control group (scram = status-bar button, not pdCtlRow). */
var STEP_UI = {
  pwr_startup: [{ i: 1, view: 'primary', control: 'Control Bank' }],
  pwr_raise_power: [{ i: 0, view: 'primary', control: 'Rod Speed' }, { i: 1, view: 'secondary', control: 'Turbine Load' }],
  pwr_lower_power: [{ i: 0, view: 'secondary', control: 'Turbine Load' }, { i: 1, view: 'primary', control: 'Rod Speed' }],
  pwr_pressure_control: [{ i: 1, view: 'primary', control: 'Pressurizer Spray (PZR)' }],
  pwr_sg_level: [{ i: 1, view: 'secondary', control: 'Feed Reg' }],
  pwr_shutdown: [{ i: 0, view: 'secondary', control: 'Turbine Load' }, { i: 1, view: 'scram', control: 'SCRAM' }],
  pwr_loss_of_feedwater: [{ i: 1, view: 'scram', control: 'SCRAM' }, { i: 2, view: 'secondary', control: 'Turbine Load' }, { i: 3, view: 'secondary', control: 'AFW' }],
  pwr_rcp_trip: [{ i: 1, view: 'scram', control: 'SCRAM' }],
  pwr_stuck_porv: [{ i: 2, view: 'primary', control: 'PORV Block Valve' }],
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