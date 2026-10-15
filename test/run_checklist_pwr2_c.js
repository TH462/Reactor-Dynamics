/* run_checklist_pwr2_c.js — part C of the checklist gate (CI run 38670341210, 2026-10-14: part B
 * alone measured 1789 s on CI against a 30-min shard step). The tables that say which section-2
 * group each part owns, the measured costs behind them and the startup check that every group is
 * claimed by exactly one part all live in run_checklist_pwr2.js.
 *
 *   node test/run_checklist_pwr2_c.js          part C (this file)
 *   node test/run_checklist_pwr2.js --all      the unsplit whole, for local debugging
 */
'use strict';
globalThis.__PWR2_CHECKLIST_PART = 2;
require('./run_checklist_pwr2.js');
