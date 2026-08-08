/*
 * verify_manual_data.js — freshness gate for the GENERATED ui/manual_data.js (#387).
 *
 * The Failures-tab instrument picker is built from RD.MANUAL.pwr.indications, which
 * `tools/gen_manual_reference.js` generates from the live engine config — and nothing
 * re-runs the generator automatically (the repack hook covers Manuals/*.md only). It
 * went stale twice: cw_inlet_temp landed as a raw id (I-12), and by 2026-08-08 the
 * shipped file was missing 14 instruments, so their failures were un-injectable from
 * the UI however correct the engine was. This gate makes that drift a red instead of
 * a discovery:
 *
 *   1. Every instrument in cfg.instruments has an indications entry (else the picker
 *      cannot offer it) — and every indications entry still exists in the config
 *      (else the shipped file predates a removal). Both directions, like run_contract.
 *   2. No entry ships name === id — the IND-table fallback that produced I-12; a raw
 *      id in the picker means the generator's table lacks a display entry.
 *
 * PWR only by design: RBMK/BWR are on hold and their profiles are full manuals, not
 * the reference-only stub this gate exists to keep honest.
 *
 * Fix for a red: author the IND entry in tools/gen_manual_reference.js, then
 * `node tools/gen_manual_reference.js`, and commit the regenerated ui/manual_data.js.
 *
 *   node test/verify_manual_data.js
 */
'use strict';
var path = require('path');
function load(p) { require(path.join(__dirname, '..', p)); }
load('engines/pwr/pwr_config.js');
load('ui/manual_data.js');
var RD = globalThis.RD;

var GREEN = '\x1b[32m', RED = '\x1b[31m', RST = '\x1b[0m', BOLD = '\x1b[1m';
var pass = 0, fail = 0;
function ck(desc, ok, detail) {
  if (ok) { pass++; return; }
  fail++;
  console.log(RED + '  ✗ ' + RST + desc + (detail ? '  [' + detail + ']' : ''));
}

var specs = (RD.PWR_CONFIG && RD.PWR_CONFIG.instruments) || {};
var profile = (RD.MANUAL || {}).pwr || {};
var inds = profile.indications || [];
var byId = {};
inds.forEach(function (i) { byId[i.id] = i; });

var specIds = Object.keys(specs).filter(function (k) { return k !== 'status'; });
ck('PWR profile exists with a non-empty indications list', inds.length > 0,
  'ui/manual_data.js has no PWR indications — regenerate it');

// Direction 1: config → shipped file (staleness = un-injectable failures).
specIds.forEach(function (id) {
  var entry = byId[id];
  ck('indications carries `' + id + '`', !!entry,
    'missing — regenerate ui/manual_data.js (tools/gen_manual_reference.js)');
  if (entry) ck('`' + id + '` has an authored display name', entry.name !== id,
    'raw id shipped as name — add an IND entry to tools/gen_manual_reference.js (I-12)');
});

// Direction 2: shipped file → config (staleness = the file predates a removal/rename).
inds.forEach(function (i) {
  ck('config still declares `' + i.id + '`', !!specs[i.id],
    'shipped indication has no instrument — regenerate ui/manual_data.js');
});

console.log(BOLD + 'verify_manual_data' + RST + ' — ' + specIds.length + ' instruments both ways, raw-id scan');
console.log((fail ? RED : GREEN) + pass + ' checks ' + fail + ' failed' + RST);
process.exit(fail ? 1 : 0);
