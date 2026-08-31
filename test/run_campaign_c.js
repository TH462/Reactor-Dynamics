/* run_campaign_c.js — part C of the campaign gate (#513): the three HEAVY pwr missions
 * (mode5_to_mode3, tmi2_p1 "Fog of War", tmi2_p3 "no deviations" — ~116 s of the pwr
 * total), split out of run_campaign.js after the by-plant split left part A at 257 s —
 * the aggregate gate's new wall-time floor (owner-approved 2026-08-25: "I approve the
 * pwr campaign mission split."). The suites, the harness, the PART_C list and the
 * measured cost table all live in run_campaign.js — this file only selects that part.
 *
 *   node test/run_campaign_c.js              run part C
 *   node test/run_campaign.js <substring>    run any suite by name (ignores the split)
 */
'use strict';
globalThis.__CAMPAIGN_PART = 2;
require('./run_campaign.js');
