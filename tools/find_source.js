/*
 * tools/find_source.js — search the SOURCE CORPUS ACROSS ALL THREE LANES.
 *
 * WHY THIS EXISTS (2026-08-06)
 * ---------------------------
 * The evidence-pass SOP says prototypicality claims are sourced, never recalled. It does
 * not say WHERE the sources are, and the answer is: in three different gitignored
 * directories that cannot see each other —
 *
 *   C:/grok_build/Reactor_Dynamics/inbox/sources   (develop)
 *   C:/grok_build/RD_workbench/inbox/sources       (workbench)
 *   C:/grok_build/RD_backshop/inbox/sources        (backshop)
 *
 * An agent standing in one lane greps its own and concludes the corpus does not have the
 * document. That has now cost two evidence passes:
 *
 *   #315 §6 (2026-08-03) — went sourcing for the OTΔT equations, built a whole argument on
 *     an open-access restatement, and had to revert all of it: ML11223A301 had been fetched
 *     into another lane's inbox THAT MORNING and said so in TUNING_LOG.
 *   §8.34 (2026-08-05) — declared "No document in any lane's corpus contains 'atmospheric'
 *     in a steam-relief sense" and shipped a departure on it. FALSE WHEN WRITTEN:
 *     ML11223A293 had been in develop's inbox since 2026-08-04 naming "the steam generator
 *     atmospheric relief valve". A whole declared departure rested on a one-lane grep.
 *
 * The fix is not another paragraph telling people to check three directories — the SOP
 * already implies it and it failed twice anyway. It is one command that cannot check fewer.
 *
 * USAGE
 * -----
 *   node tools/find_source.js atmospheric          # case-insensitive regex, all lanes
 *   node tools/find_source.js "hotwell|hot well"
 *   node tools/find_source.js --list               # what IS in the corpus, by lane
 *
 * Exit 1 if a term matched nothing — so "not in the corpus" is a command's verdict rather
 * than a claim. BEFORE you declare anything unsourced, run this and paste the zero.
 */
'use strict';
var fs = require('fs');
var path = require('path');

var LANES = [
  ['develop  ', 'C:/grok_build/Reactor_Dynamics/inbox/sources'],
  ['workbench', 'C:/grok_build/RD_workbench/inbox/sources'],
  ['backshop ', 'C:/grok_build/RD_backshop/inbox/sources'],
];
var CTX = 1;   // lines of context either side

function filesIn(dir) {
  try { return fs.readdirSync(dir).filter(function (f) { return /\.txt$/i.test(f); }).sort(); }
  catch (e) { return null; }          // null = lane absent, distinct from empty
}

var args = process.argv.slice(2);
if (!args.length) { console.error('usage: node tools/find_source.js <regex> | --list'); process.exit(2); }

if (args[0] === '--list') {
  LANES.forEach(function (l) {
    var fs_ = filesIn(l[1]);
    if (fs_ === null) { console.log(l[0] + '  (lane not present on this box)'); return; }
    console.log(l[0] + '  ' + fs_.length + ' extracted document(s)');
    fs_.forEach(function (f) { console.log('             ' + f); });
  });
  process.exit(0);
}

var re;
try { re = new RegExp(args.join(' '), 'i'); }
catch (e) { console.error('bad regex: ' + e.message); process.exit(2); }

var hits = 0, scanned = 0, lanesMissing = [];
LANES.forEach(function (l) {
  var names = filesIn(l[1]);
  if (names === null) { lanesMissing.push(l[0].trim()); return; }
  names.forEach(function (name) {
    scanned++;
    var lines = fs.readFileSync(path.join(l[1], name), 'utf8').split(/\r?\n/);
    lines.forEach(function (line, i) {
      if (!re.test(line)) return;
      hits++;
      console.log('\n' + l[0] + ' ' + name + ':' + (i + 1));
      for (var j = Math.max(0, i - CTX); j <= Math.min(lines.length - 1, i + CTX); j++) {
        console.log((j === i ? '  > ' : '    ') + lines[j].trim());
      }
    });
  });
});

console.log('\n' + hits + ' hit(s) across ' + scanned + ' document(s) in '
  + (LANES.length - lanesMissing.length) + ' lane(s).');
if (lanesMissing.length) console.log('NOT SCANNED (lane absent): ' + lanesMissing.join(', ')
  + ' — a missing lane is not an empty one; say so if you report a zero.');
process.exit(hits ? 0 : 1);
