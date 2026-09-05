/* mut_flags.js — a way to SKIP the mutation replay while you are still fixing a check.
 *
 * WHY THIS EXISTS. The pwr2 runners re-run their whole suite once per mutation, so
 * `run_pwr2_engine` is 86 replays and costs ~1551 s unsplit — 1312 s of it the replays — which is
 * why #637 split it into three parts (325 / 330 / 835 s; the header said "75 replays, ~420 s"
 * for a file that had grown past both numbers); `run_pwr2_shell` is 50 and costs ~360 s.
 * That cost is what buys the "this check cannot fail" detection, and it has earned it — three
 * hollow checks were caught by it in one session (#602 phase 1). But the runners took NO
 * arguments at all, so iterating on a single assertion meant paying for every replay. Measured
 * that session: two wrong guesses at a sample point cost fourteen minutes to disprove, against
 * a ten-second probe that would have answered it outright *(OWNER, 2026-09-01: "Commit then add
 * the flag")*.
 *
 * ⚠ A FILTERED RUN CAN NEVER PASS, AND THAT IS THE WHOLE DESIGN.
 *
 * `run_all` scores a runner by scraping its tally line and comparing the string to a recorded
 * baseline. A partial run prints a smaller mutation count but the SAME `N passed, 0 failed`
 * tally — so without this guard, `node test/run_all.js --record` taken after a `--no-mutations`
 * run would record a green baseline for a gate whose coverage was never measured, and nothing
 * downstream could tell. That is the hollow-gate failure mode operating on the gate itself.
 *
 * So: the moment any filter is applied, `process.exit` is wrapped to force a NON-ZERO code, and
 * a banner says why. A human iterating does not care about the exit code. `run_all`, CI, and
 * `--record` all do, and every one of them will refuse it. **There is deliberately no flag to
 * suppress this.** If you want a green run, run the whole thing.
 *
 * FLAGS (argv or env, argv wins):
 *   --no-mutations            skip the replay entirely — the checks still run
 *   --mut=<substring>         replay only mutations whose DESCRIPTION contains this
 *   --grp=<tag>               replay only mutations tagged { grp: '<tag>' }
 *   RD_NO_MUTATIONS=1 / RD_MUT=<substring> / RD_GRP=<tag>   the same, for a shell that is
 *                             driving the runner without an argv (the MUTDBG precedent)
 *
 * USAGE, one line at each call site:
 *   MUTATIONS.forEach(...)   ->   MUT.select(MUTATIONS).forEach(...)
 * `select` is the only entry point; it filters, banners, and arms the exit guard.
 */
'use strict';

var argv = process.argv.slice(2);

function argOf(name) {
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === '--' + name) return true;
    if (argv[i].indexOf('--' + name + '=') === 0) return argv[i].slice(name.length + 3);
  }
  return null;
}

var NO_MUT = argOf('no-mutations') === true || process.env.RD_NO_MUTATIONS === '1';
var ONLY   = argOf('mut') || process.env.RD_MUT || null;
var GRP    = argOf('grp') || process.env.RD_GRP || null;

var armed = false;

/* Force a non-zero exit for the rest of this process, whatever the runner decides. Wrapping
 * `process.exit` rather than setting `process.exitCode` is deliberate: every runner in this
 * directory ends with an explicit `process.exit(fail > 0 ? 1 : 0)`, which would overwrite an
 * exit code set beforehand. This cannot be overwritten. */
function armExitGuard(reason) {
  if (armed) return;
  armed = true;
  var real = process.exit.bind(process);
  process.exit = function (code) { real(code ? code : 1); };
  process.on('exit', function () {
    /* printed LAST, after the tally, so it is the final thing on screen */
    console.log('\n' + '!'.repeat(70));
    console.log('  PARTIAL RUN — MUTATION COVERAGE WAS NOT MEASURED (' + reason + ')');
    console.log('  This run is FORCED NON-ZERO and can never be recorded as a baseline.');
    console.log('  Re-run with no flags before you commit.');
    console.log('!'.repeat(70));
  });
}

/* select(MUTATIONS) -> the subset to replay. Filters, explains, and arms the guard. */
function select(list) {
  if (!Array.isArray(list)) return list;

  if (NO_MUT) {
    armExitGuard('--no-mutations');
    console.log('  [--no-mutations] skipping all ' + list.length + ' replays');
    return [];
  }
  if (!ONLY && !GRP) return list;

  var out = list.filter(function (m) {
    var opts = m[m.length - 1];
    var tag = (opts && typeof opts === 'object' && opts.grp) || null;
    if (GRP && tag !== GRP) return false;
    if (ONLY && String(m[0]).indexOf(ONLY) < 0) return false;
    return true;
  });
  var why = [ONLY ? '--mut=' + ONLY : null, GRP ? '--grp=' + GRP : null]
    .filter(Boolean).join(' ');
  armExitGuard(why);
  console.log('  [' + why + '] replaying ' + out.length + ' of ' + list.length + ' mutations');
  return out;
}

/* Is any filter in force? For a runner that wants to say so in its own tally line. */
function partial() { return NO_MUT || !!ONLY || !!GRP; }

/* The --grp= tag, for a runner that is PARTITIONED by group (#637, run_pwr2_engine's parts).
 * There, filtering the mutation list is not enough on its own: a part that does not own the
 * group would replay nothing at all, so `--grp=X` has to scope the part as well. Read, never
 * written — the filter's own semantics stay in `select`. */
function grpTag() { return GRP; }

/* The --mut= substring, for the same reason: a PARTITIONED runner has to widen its own scope
 * to the whole file when you name a mutation, or `--mut=<something in another part>` replays
 * nothing and says so only in an arithmetic line nobody reads. */
function mutTag() { return ONLY; }

module.exports = { select: select, partial: partial, grpTag: grpTag, mutTag: mutTag };
