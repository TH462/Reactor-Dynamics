/* run_pwr2_shell_b.js — part B of the shell-class gate, on the run_pwr2_engine_d precedent
 * (#637). The suite, the mutation table and the split's rationale all live in
 * run_pwr2_shell.js — this file only selects the second partition.
 *
 *   node test/run_pwr2_shell_b.js            the groups PART_B names
 *   node test/run_pwr2_shell.js --all        the unsplit whole, for local debugging
 *   node test/run_pwr2_shell.js --groups=E   one group, to re-measure the cost table
 */
'use strict';
globalThis.__PWR2_SHELL_PART = 1;
require('./run_pwr2_shell.js');
