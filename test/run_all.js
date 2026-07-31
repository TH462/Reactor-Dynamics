/* run_all.js — the aggregate gate.
 *
 * Runs every gate runner in test/, compares each against a recorded baseline, and
 * exits non-zero on ANY drift from that baseline. Written because the gate used to
 * be a prose checklist in CLAUDE.md, which is how run_e2e_controls sat red unnoticed
 * (2026-07-19 review) and how the manual's units regression hid behind an already-red
 * verify_e2e_ui (#111 / #148).
 *
 * Run: node test/run_all.js [options]
 *   --fast        skip the two Playwright gates (minutes each)
 *   --only <a,b>  run just these (substring match on the script name)
 *   --record      print a BASELINES block reflecting what actually happened
 *   --quiet       suppress per-runner output (failures still dump their tail)
 *
 * Exit code is 0 only when every runner matches its baseline exactly.
 *
 * DRIFT IS SYMMETRIC — a runner scoring BETTER than baseline also fails the
 * aggregate. That is deliberate: a red that turns green is a real event, and it
 * must be acknowledged by updating the baseline (and usually closing an issue)
 * rather than silently absorbed. Same convention as the strict xfails in
 * run_meltdown / run_behavior.
 *
 * MAINTENANCE: when you legitimately move a number, update `expect` here AND the
 * gate baselines in CLAUDE.md in the same change.
 */
'use strict';
var path = require('path');
var fs = require('fs');
var cp = require('child_process');

var TEST_DIR = __dirname;

/* Baselines, verified 2026-07-25.
 *   code  — expected process exit code
 *   score — expected "n/m" tally scraped from the output, or null if the runner
 *           prints no tally (exit code alone is the signal)
 *   note  — why a red is expected; every non-zero `code` MUST carry one
 *   slow  — Playwright gate, skipped by --fast
 */
var BASELINES = {
  // ---- engines & scenarios ----
  // 32/32 since 2026-07-25: +load_above_rated_hold (the #130 regression pin), and
  // load_mode_follow gained a real load-tracks-power check where a vacuous
  // "< 950 MWe" literal used to sit.
  // 199 checks since 2026-07-25 (#199): save_migration also pins the new
  // _fail.steam_break.upstream default (legacy saves → downstream/isolable).
  // 200 checks since 2026-07-27 (#200): save_migration also pins the stuck-open
  // spray conversion — the failure used to be encoded as `spray_override = true`
  // (a boolean in the OPERATOR'S demand field, which is why any set_spray cleared
  // it); it is now s.spray_stuck, and a legacy save carrying the old encoding must
  // keep the failure rather than silently healing on load.
  // 201 -> 202 (#263): control_response now also pins Tavg rising on a withdrawal. The
  // power-rise margin shrank to ~0.03 % when the moderator coefficient was fitted to the
  // BEAVRS measurement (-20 -> -26.8 pcm/degC), under the old 0.05 floor. Lowering that
  // floor would just need lowering again next retune; at power the turbine sets power and
  // the rods set temperature, so Tavg rising is the signature that STRENGTHENS as the
  // coefficient does. Both are pinned now.
  'run_pwr.js':            { code: 0, score: '32/32 202passed' },   // 200 → 201: #247 added the rcs_flow-follows-truth check to transient_rcp_trip
  'run_rbmk.js':           { code: 0, score: '23/23 150passed' },
  'run_bwr.js':            { code: 0, score: '15/15 92passed' },
  'run_scenarios.js':      { code: 0, score: '3/3 36passed' },
  // 34 since 2026-07-25 (#131): PI-3, PI-8, PI-9 and the TR-11 end-state pin were
  // catalogued behaviours the battery never probed — the coverage todo list is now empty.
  // 35 since 2026-07-25 (#199): +TR-12b, the MSIV isolating a downstream steam line break.
  // 36 since 2026-07-26 (#216): TR-1 was injecting a TURBINE TRIP while asserting the
  // ride-out. Those are different events in a real plant — a LOAD REJECTION rides out,
  // a turbine trip above P-9 scrams. Split: TR-1 now drives the ride-out with a real
  // load rejection, new TR-1b pins the P-9 anticipatory scram. No band was relaxed.
  // 37 since 2026-07-27 (#219): +TR-1c. The steam-dump C-7 arm is a bistable, so a
  // rejection just under it gets no fast dump and ends at the PORV. Owner ruled to KEEP
  // the threshold and DECLARE the cliff (DESIGN_COMPANION §8.8), so the probe pins BOTH
  // sides — 39 MWe lifts, 41 MWe is caught — and the declared behaviour cannot drift.
  // 38 since 2026-07-28 (#230): +TR-1d. `disconnect_grid` — the operator's own take-it-
  // off-line control — called the TURBINE TRIP path, so a planned offline latched a trip
  // flag and armed P-9 for the rest of the evolution; measured, a disconnect at 100 %
  // scrammed instantly and one during a heatup scrammed at the later P-9 crossing. Owner
  // ruled it a planned offline (no trip). TR-1d pins that, and fails on the old mapping.
  'run_behavior.js':       { code: 0, score: '38pass 0xfail' },
  // 9 since 2026-07-28 (#213): +MD-9 — partial uncovery HELD (inventory 50-70 %)
  // must damage the core on a TMI timescale; prompt reflood must not. Backed by the
  // new exposed-clad hot node (pwr_thermal.stepCladding).
  'run_meltdown.js':       { code: 0, score: '9pass 0xfail' },
  // New 2026-07-26d (#209 last thread): the same casualties HANDS OFF through the
  // full stack. run_meltdown is engine-direct and does not load control_kernel at
  // all, so its MD-4/MD-8 PROTECTION claims are proven with the operator hand-
  // scramming and hand-starting HPI. This asserts the automatic chain actually
  // fires unprompted — scram without a manual scram, hpi_active without a set_hpi —
  // so a regression in an SI setpoint, an ESF arm or the P-11 permissive cannot
  // silently turn a documented-survivable path into a melt.
  'run_meltdown_stack.js': { code: 0, score: '3/3 21/21' },

  // ---- stack layers ----
  // 19/19 since 2026-07-25 (#151): +a save/restore round-trip test for trip blocks
  // and the derived `asserted` flags.
  // NEW 2026-07-27b (#227) — static HR3 guard over control_kernel.js. Not a sim
  // gate: it derives the plant vocabulary from all three engines and fails on any
  // plant-specific name in the shared kernel that is not in its ALLOWED list with a
  // reason. Exists because the leak #156 reported had ALREADY been fixed once in
  // that file and was then re-created ~40 lines below the comment warning against
  // it. The site count is part of the score on purpose: a NEW coupling shifts it
  // and trips drift even when the author allow-lists it properly.
  // 32 → 29 checks (#247): the `__true_flow__` sentinel was the kernel's only reference to
  // a PWR-only true_state field, so retiring it removed three plant-token couplings and
  // paid half of #228. Fewer checks here means fewer leaks to check, not less checking.
  'run_hr3.js':            { code: 0, score: '29checks 0failed' },
  // New 2026-07-29 — the guards for the OTHER hard rules. CONTEXT.md §3 now requires
  // every rule to name its guard, and three had none: HR1 (protection reads
  // instruments), HR5 (commands descend; the UI never touches the engine) and HR11 (a
  // ruling needs a date and verbatim words). Same declared-exception idiom as run_hr3:
  // a true-state read in layers/control/ is legal only if listed with the reason no
  // instrument exists for it, so the count moving means a NEW coupling — allow-listing
  // one properly still trips drift, which is the intent. HR2, HR6 and half of HR4 are
  // still unguarded and §3 says so out loud.
  // 18 → 14 checks (#247): four of the five declared HR1 debts were PAID — three
  // `__true_flow__` reads in the kernel plus the feed channel's `feedwater_isolated`
  // read — so there are four fewer true-state reads in layers/control/ to declare. The
  // one that remains is the unreviewed RBMK entry. Watch the DEBT line, not just the
  // score: a green run still only means "no undeclared reads".
  // 14 → 18 checks (#248): HR12 was added to §3 (an assertion about plant dynamics must
  // be MEASURED), and its OWNER RULING quote appears in FOUR tracked files — CONTEXT.md,
  // CLAUDE.md, and twice in TUNING_LOG.md's write-up. All declared (date + verbatim words).
  //
  // HEADS UP, this will bite you: the HR11 half of this gate scans `Diagnostic/` and
  // `Blueprint/` as well as source, so **writing up your change moves the score after you
  // ran the gate**. Quote an owner ruling in the tuning log and the count goes up. Run
  // run_hardrules once more AFTER the docs are written, not just after the code.
  // 18 → 19 checks (#251): one new OWNER RULING citation for the turbine-extraction fix.
  // 19 → 22 checks (#252): three more, all in CLAUDE.md and all CLAUDE.md-only process
  // rules with no code behind them — the warn-and-ask worktree occupancy check, its
  // no-reply default (ruled read-only-and-wait after the first draft shipped an unratified
  // agent proposal), and the First Principles section. This comment's point, twice over:
  // prose moves this score. 22 is MEASURED on the merged tree, not 19+3 arithmetic — the
  // two branches each moved this number and a mechanical conflict resolution would have
  // shipped one side's.
    // 22 -> 24 checks (#260): the reactivity recalibration's OWNER RULING ("do the full
  // reactivity calibration for fidelity") is quoted with its date in TUNING_LOG.md and
  // BUILD_DECISIONS.md, and the HR11 half of this gate scans tracked docs for exactly that
  // shape. Two new declared quotes = two new checks. This is the gate working, not drift to
  // paper over -- but it does mean quoting a ruling in a tracked doc moves this number.
  // 24 -> 25 (#263): the 2026-07-30 "fit the measurement" ruling is quoted with its date
  // in a tracked file, and the HR11 half of this gate counts exactly that.
  // 25 -> 28 (#263 records): the 2026-07-30 ruling is quoted with its date in
  // TUNING_LOG.md, BUILD_DECISIONS.md and CLAUDE.md. Writing the record moves this
  // number, by design -- HR11 counts dated owner quotes wherever they are tracked.
  // 28 -> 29: Manuals/00's Rev 14 row quotes the 2026-07-30 ruling with its date, and the
  // HR11 half of this gate counts dated owner quotes wherever they are tracked.
  // 29 -> 30 (2026-07-30, #262): the TUNING_LOG entry for the small-leak alarm pair quotes the
  // "Add the alarm as you suggest" ruling. WRITING UP a change moves this score, not just making
  // it — re-run this gate after the docs, which is why the code-only run came back at baseline.
  // 29 -> 32 (2026-07-30, #249): three more sites carrying "249 - fit it." — CLAUDE.md,
  // BUILD_DECISIONS.md, TUNING_LOG.md.
  // 33 MEASURED ON THE MERGED TREE (2026-07-30), not 30 and not 32: `develop` and `workbench`
  // BOTH moved this number from 29, and the merge carries both sides' quotes. Taking either
  // side's figure would have shipped a drift. This is the second time this exact trap has been
  // recorded here — see the "22 is MEASURED on the merged tree" note above.
  'run_hardrules.js':      { code: 0, score: '39checks 0failed' },
  // New 2026-07-28 (#225) — static guard that the §6.3 true_state contract in
  // CONTEXT.md and `getTrueState()` agree EXACTLY, both directions. Nothing compared
  // them, so the gap grew to 41-of-82 undocumented before anyone noticed — and it was
  // noticed only because #144 was filed against a field that WAS documented. By the
  // time #225 was worked its own list had rotted (12 documented since, 2 new fields
  // added), which is the argument for a gate rather than a list. PWR only: RBMK/BWR
  // are on hold and their blocks were never audited, so they are registered `skip`.
  // Check count = every field name on either side, so adding a true_state field moves
  // this baseline — the intended nudge to document it in the same change.
  'run_contract.js':       { code: 0, score: '84checks 0failed' },
  // New 2026-07-29 (#253 phase 1) — the seam between the manual's 57 documented
  // procedures and the 10 executable checklists that run them. They referenced each
  // other NOWHERE until now, so nothing could answer "which documented procedures can
  // actually be run?" or "does this checklist still match its procedure?". Checks the
  // manual_ref resolves, is unique, and that no PWR-xxx cross-reference dangles.
  // COVERAGE (47 procedures with no checklist) is REPORTED, not enforced — the number
  // is the work item, and a gate that failed on it would sit permanently red. Watch
  // that line, not just the score.
  'run_procdocs.js':       { code: 0, score: '23checks 0failed' },
  // New 2026-07-29 — the manual quotes US customary first with SI in parentheses
  // (owner request). This re-derives the US value from the SI value in every pair
  // and fails on bad arithmetic, on an SI quantity with no US partner, and on a
  // temperature DIFFERENCE converted with the absolute rule. That last class is
  // the reason it exists: a 41 °C subcooling margin is 73.8 °F, and the absolute
  // rule prints 105.8 °F — a thin margin reading comfortable. The first scripted
  // pass mis-classified eight sites exactly that way.
  //
  // SCORED ON FAILURES ONLY — deliberately unlike run_hr3 / run_contract /
  // run_inspect above, where the moving count IS the point. Theirs moves when
  // someone adds a coupling, a true_state field or a board item: a decision worth a
  // second look. This one's moves whenever any number in any sentence is edited,
  // including pure prose work — it bumped four times in the session that added it
  // (182 → 186 → 215 → 218 → 220), all noise. Baselining that would train the next
  // author to rewrite the number without reading it. Coverage is printed on the
  // line above the tally, out of the scraper's reach.
  'run_manual_units.js':   { code: 0, score: '0failed' },
  // New 2026-07-30 — the manual set's revision history. UNLIKE run_manual_units above,
  // this one IS baselined on its check count: the checks are structural (table shape,
  // stamp agreement, digest seal, pack currency), so the count moves only when a check
  // is added, never on prose. Written because the revision history had stopped being
  // written: SIX content changes (#247, #248, #251, #260 twice, the gpm display-scale
  // fix, #263 — revs 9–13) landed in the chapters with no row in the table, over two
  // weeks, while ten of thirteen chapters still read "Revision: 0" and README.md read
  // "Revision: 2, 2026-07-16". The load-bearing check is the CONTENT DIGEST one: a
  // chapter edited with no revision row reddens this gate, which is the only check here
  // that catches the failure that actually happened. The other three catch bookkeeping
  // that disagrees with itself — necessary, but a set can be perfectly self-consistent
  // and still describe last week's plant. What it CANNOT check is whether a row's prose
  // is true; that is HR10/HR12 territory and the runner header says so.
  'run_manual_rev.js':     { code: 0, score: '12checks 0failed' },
  // New 2026-07-28 (#241) — the feature-flag registry that decides what the PUBLIC
  // website offers vs what is still being vetted on `develop`. Coverage half: every
  // scenario, procedure and campaign mission has an entry and every entry still points
  // at real content, so new content cannot ship unconsidered and a rename cannot
  // silently drop a feature from production. Resolution half: the public/preview/dev
  // rules asserted from BOTH sides, because a resolver stuck at "true" does not throw —
  // it publishes. Check count moves with the content count (57 items today): adding a
  // scenario shifts this baseline, which is the intended nudge to decide its stage.
  // 290 -> 289 (bf41f67, the leaner control chrome): one flag-gated element left the board.
  // Verified as theirs by running this gate on backshop at its own commit before merging.
  'run_flags.js':          { code: 0, score: '16/16 289/289' },
  // New 2026-07-28 (#96) — the inspection copy behind the System Scanner block.
  // Every way this rots is silent: an item id changes and its entry describes
  // nothing; a new control inherits its card's summary and READS like a real
  // answer; a manual citation outlives the section it names. All three are
  // failures here. The check count moves with the board — a new control or
  // indication shifts it, which is the intended nudge to write its copy.
  'run_inspect.js':        { code: 0, score: '7/7 35/35' },
  // New 2026-07-29 — guards the OFFLINE / single-file build (tools/make_portable.js).
  // The sim runs from file:// with no server only because nothing in the runtime loads
  // anything at runtime: no fetch, no ES module, no worker, no web font, no CDN tag, no
  // image. Every other gate is blind to that. A `fetch('Manuals/12.md')` added for a good
  // reason keeps the deployed site perfect and breaks the EMAILED file — on a recipient's
  // machine, silently, with nobody to report it. Scans exactly the 94 scripts + 2
  // stylesheets ui/shell.html ships (read from the file, so it widens itself), then BUILDS
  // the bundle and asserts the deliverable has no loading attribute left. Verified by
  // injection: a fetch, a CDN <script>, an @font-face, an <img src> and an `export` each
  // turn it red on the matching check. Check count moves with the shipped asset list — a
  // new <script src> shifts this baseline, which is the intended nudge to re-verify that
  // the portable build still builds.
  // 112 -> 116: also checks that every file vercel.json's buildCommand needs is not
  // excluded by .vercelignore. Alpha 1.10.0's deploy failed exactly there -- `tools`
  // was ignored while the buildCommand shelled out to tools/make_portable.js -- and no
  // local build could catch it, because locally nothing is ignored. Injection-verified:
  // re-excluding `tools` reddens it.
  'run_portable.js':       { code: 0, score: '123checks 0failed' },
  // #260: every number in the PWR reactivity block is either SOURCED to a real-plant
  // document or SOLVED from one, and this pins the sourced anchors — the WTSM 2.1
  // -17 pcm/°F point, the 1400 ppm MTC crossover, monotonic steepening with
  // temperature, the three WTSM 2.2 rod worths, and BEAVRS HZP ARO 975 ppm.
  // `rho_excess` has NO direct observable: it is solved so HZP ARO lands on 975. If you
  // move alpha_D, either rod worth or boron_worth_per_ppm without re-solving it, the
  // 975 ppm check is what goes red instead of the plant drifting quietly.
  // 13 -> 16 checks: the gate now also parses Manuals/09 §7.5's published ECC
  // critical-boron table and compares all 50 cells against the engine. That table is
  // what an operator dilutes against, and NOTHING covered prose numbers before —
  // run_manual_units checks unit conversions, run_campaign checks mission behaviour,
  // and #260 sat wrong in the prose for weeks with both green. Verified by injection:
  // putting the old 629 ppm back into one cell reddens it (table 629 vs plant 834.2).
  // 16 -> 21 checks (#263): a SECOND anchor. The curve was fit at one temperature and
  // validated at none, and the boron crossover came from a WTSM 2.1 statement its own
  // figure contradicted. BEAVRS Cycle 1 HZP measured ITCs at three boron concentrations
  // settle it at 986 ppm -- the 1400 we briefly shipped was 4.3x too negative at ARO.
  // Two stale checks here were REPLACED, not relaxed: the -17 pcm/degF WTSM anchor is no
  // longer what sets the scale (the owner's at-power ruling is), and the cold/hot
  // separation check is now a GAP test rather than an absolute ppm threshold, because the
  // absolute one needed bumping every recalibration -- a check tracking the plant instead
  // of the claim.
  // 21 -> 23 (#263 item 3): HFP boron has NO measured anchor of its own, so what is
  // gated is its DERIVATION from the HZP anchor plus the power defect and xenon, and
  // the declared departure from the real 750 ppm comparable being xenon-dominated.
  // 23 → 27 (2026-07-30, #263 item 2): the four inputs `pwr_startup`'s 26-step creep is
  // DERIVED from — startup-IC boron, the critical position, differential bank worth through
  // the band, and the excess the creep leaves. Injection-verified: a 3.2 % rod-worth retune
  // reddens all four. Before this the 26 was a swept number with nothing holding its inputs.
  'run_reactivity.js':     { code: 0, score: '27checks 0failed' },
  // NEW 2026-07-30 (#249/#273) — "can the plant reach its own setpoints?" Part A is static
  // and total: all 50 PWR trip/actuation/alarm thresholds must sit STRICTLY inside their
  // instrument's declared range, because `crossed()` is strict and a setpoint on the edge
  // can never fire (the C1 lesson, finally a gate). Part B is dynamic and deliberately
  // small: it DRIVES the plant and watches the indicated channel cross, which is the only
  // way to catch a clamp — pzr_level's range is [0,100] and its trip is 97, so Part A was
  // perfectly happy while the level physically could not exceed 88.00 %. That is what let
  // `pwr_mode3_to_mode5`'s "arrived UNscrammed" pass for months over a full accumulator
  // dump. Injection-verified: B1 goes red (peak 89.01 %) on the pre-#249
  // `level_per_mass_surplus` of 300. ADD A CASE HERE whenever you write an assertion that
  // a trip did NOT fire — that claim is worth exactly what the gauge can reach.
  // 55 → 57 on the develop+workbench merge (2026-07-30): #262's two `pzr_level_dev` alarm
  // thresholds were picked up by Part A automatically, without anyone adding a case. That is
  // the design — a new setpoint gets range-checked for free, and the count moving is the
  // nudge to notice it. 50 → 52 thresholds audited.
  'run_reachability.js':   { code: 0, score: '58checks 0failed' },
  // NEW 2026-07-31 — release bookkeeping: site/release.js, changelog.html and CHANGELOG.md
  // must say the same thing about what shipped. Written because the CHANGELOG.md roll (rename
  // "## [Unreleased]" to the version) was skipped for Alpha 1.10.0 AND 1.11.0 — 434 lines of
  // two shipped releases filed as unreleased, newest version heading reading 1.9.0. Nothing
  // downstream reads that heading, so nothing went red; the CLAUDE.md note and the release
  // skill's step are what failed, which is the argument for a gate rather than a louder note.
  // VERIFIED against the real pre-fix file, not a synthetic one: 3 checks red.
  'run_release.js':        { code: 0, score: '18checks 0failed' },
  // 19/19 86passed → 23/23 117passed (2026-07-28, #240): four suites for
  // mode/lineup-dependent alarm classification.
  'run_m4.js':             { code: 0, score: '26/26 147passed' },
  // Green since 2026-07-25 (#151): the rewind red was lastInstruments not being
  // rebuilt on restore, so every blockable trip reported asserted=false.
  'run_m5.js':             { code: 0, score: '19/19 79passed' },
  // 16 -> 17 suites, 94 -> 102 checks 2026-07-27 (#142): a new save/restore test for
  // the instructor's operator-action memory and follow acc streak, both of which
  // saveState dropped. Verified against the PRE-fix instructor, where 5 of its 8
  // checks fail — including the softlock itself (an `operator_action` beat could
  // never be credited after a restore). Its legacy-save check passes on both
  // versions, which is the point: old saves keep their old behaviour.
  'run_m6.js':             { code: 0, score: '17/17 102passed' },
  'run_m6ph.js':           { code: 0, score: '8/8 18passed' },
  'run_m7.js':             { code: 0, score: null },   // prints "M7 OK", no tally

  // ---- control, campaign, procedures ----
  // 20 → 21 on 2026-07-31 (#214): a stand-down note is the only account of why a channel
  // switched itself off, and it is now on screen, so its LIFETIME is gated — it must be
  // retired when its cause clears, without re-engaging the channel.
  'run_autoctl.js':        { code: 0, score: '21/21' },
  // Back to 51/51 2026-07-26 (#218): pwr_msiv re-authored for P-9. The mission had been
  // a RACE — reopen before an automatic low-SG trip — and with the scram now landing at
  // closure that race is gone; worse, the decision beat's `scram` branch fired instantly
  // and railroaded every run to the bottled ending in 14 s, so the player had no decision
  // at all. It is now the post-trip EOP question: decay heat is on the code safeties, do
  // you restore the dump path? Check count 2931 -> 2930: one assertion merged, none lost.
  // Check count 2930 -> 3024 2026-07-27 (#189), suites unchanged at 51: the four static
  // passes now walk RD.SCENARIOS directly instead of the campaign tree, so a scenario
  // that is unwired (zero validation before) or bonus-only (two of the four passes
  // skipped it) is graded like any other. +94 checks, none red. Measured against the
  // pre-fix runner: a dangling goto in an unwired scenario and a typo'd trigger type on
  // a `gate.until` both passed silently; both now fail.
  // 3024 → 3025 (#248): pwr_lof's automatics branch gained a check that the low-flow
  // trip did NOT actuate and a backup caught the event. Asserting only "something
  // scrammed" cannot tell "the assigned protection worked" from "a backstop caught a
  // consequence", which is the entire lesson after the stuck-channel rewrite.
  // 3026 → 3038 (2026-07-30, #273): the Mode 3 → Mode 5 cooldown gained an
  // accumulator-isolation beat (+9 structural checks from the campaign validator) and
  // THREE endpoint assertions. The cooldown had been dumping all four accumulators —
  // measured endpoint accum_vol 0.0 %, boron 2310 ppm against a 2500 ppm SIT charge,
  // inventory pegged at the mass clip — and the suite's "arrived UNscrammed" check did
  // not catch it, because indicated pzr level could not reach its 97 % trip (#249). The
  // new checks assert the ENDPOINT STATE rather than the absence of a trip; all three
  // go red with the isolation removed.
  'run_campaign.js':       { code: 0, score: '51/51 3038passed' },
  'run_checklist.js':      { code: 0, score: '24/24' },
  // Green since 2026-07-25 (#150): both F12 reds were stale expectations, not
  // regressions. 30 -> 35 checks; the replacements are differential, so they
  // discriminate where the originals could not.
  'run_e2e_controls.js':   { code: 0, score: '39/39' },
  // 96 → 100 checks, both from the pwr_startup rebuild:
  //   +1 (#134) the level-off now holds the point of adding heat at 1–3 %, and
  //      crossing the 5 % boundary into Mode 1 is its own deliberate step
  //      instead of something the ascent does to you;
  //   +3 (#197) the approach plots SIX 1/M points instead of three — three
  //      predicts criticality 79 steps late, which is not close enough to
  //      withdraw against.
  //   +1 (#211) the startup now TAKES LOAD CONTROL after synchronising — it picked up
  //      load in FOLLOW, which is right for getting on line, then goes to MANUAL so both
  //      routes into Mode 1 leave the same lineup (the free-play preset was already
  //      MANUAL, so a player who learned via the checklist used to get a different board).
  //   +1 (#245) `pwr_stuck_porv` step 1 gained a `saw core_inventory_pct < 100`
  //      alongside its `acc`, which became a subcooling check — see the note on that
  //      step in ui/manual_procedures.js.
  'run_procedures.js':     { code: 0, score: '22/22 102/102' },
  // New 2026-07-26 (#202/#206): the same procedures driven through the FULL STACK
  // (M4+M5+M6) rather than engine-direct. Same acc/saw/guard predicates, plus four
  // assertions only the stack can make (command accepted, no unexpected scram, no
  // critical alarm standing, declared auto_channels engaged). Strict xfails 13 → 9 → 6
  // (2026-07-26c, #210) → 9 again when P-9 was adopted (#218) → **6** (2026-07-27b, #218
  // resolved). The remaining 6 are all RBMK/BWR (#208, plants on hold) → **5**
  // (2026-07-29, #240 follow-up): `bwr_startup` step 2 was never a BWR defect, it was
  // this harness losing 90 % of its sim time when a `status` annunciator snapped the
  // service's fast-forward dropout at t=2 s. See the note in run_procedures_stack.js.
  //
  // → **2** (2026-07-29, #245): the dropout above was not a one-off. `attentionStops`
  // is now OFF for this harness, and 11 of the 22 procedures turn out to have been
  // running below their declared 10× — up to 416 ticks of a single run. Three more
  // "#208 RBMK/BWR plant defects" cleared on the sim time alone (rbmk_mcp_trip ×2,
  // bwr_sbo_rcic), making four in total that were one harness bug.
  //
  // Check count DOES move this time: 155 → 178. +22 is the new per-procedure
  // assertion that the run held its declared acceleration throughout (#245's guard —
  // the defect's whole character was that the header kept claiming 10× while the runs
  // did not), and +1 is the `pwr_stuck_porv` split above. Otherwise the rule still
  // holds — an xfail is a check either way, so clearing one moves no number here,
  // which is why the 2026-07-27b #218 fix cleared three and shifted nothing.
  'run_procedures_stack.js': { code: 0, score: '22/22 178/178' },

  // ---- known reds (each is a tracked issue; do not "fix" by editing the number) ----
  'run_ops.js': {
    code: 1, score: '57/68 334passed 12failed',
    note: 'Ops probes are tuning targets by design. Measured 2026-07-27b from ' +
          'Diagnostic/ops_results.json: PWR 21/21 with ZERO fails; all 11 reds are ' +
          '7 RBMK + 4 BWR, and the deliberately-red C2 accel-latency probe (#153, ' +
          'status-deliberate) is one of the RBMK seven ("ABUSE [post] time-acceleration"), ' +
          'not a twelfth item. The old wording here named "P4" among the open targets — ' +
          'a P-prefixed probe is PWR and P4 has passed since 2026-07-22 (#161(b)). It was ' +
          'wrong in CLAUDE.md and got copied into this note; both corrected together. ' +
          'See Diagnostic/OPS_TUNING_REPORT.md. ' +
          '2026-07-26c (#209): 59/68 -> 57/68 when ops_harness was wired to the SHIPPED ' +
          'lineup (engageDefaults + startup lineup + stepAutomation, mirroring M5). The ' +
          'two PWR probes it broke were repaired (they silently assumed load-follow; the ' +
          'shipped board is MANUAL -> #211). The two NEW reds are RBMK, which is ON HOLD: ' +
          '[post] load follow returns to 95.2 % vs 100 +/-3, and [pre] flow reduction holds ' +
          '94.0 % vs 100 +/-4 — both are the AR channel now actually running. Recorded in ' +
          '#208, not chased.',
  },

  // ---- browser gates (slow: Playwright + a throwaway http server) ----
  // New 2026-07-28 (#241). Fast for a browser gate (~15 s, no http server — file://),
  // so it is NOT marked slow. run_flags.js proves the registry and the resolver;
  // this proves the CONTROL ROOM obeys them, which is where both defects found
  // during the build actually were: a Features row that stayed on screen because
  // .set-row's display:flex beats the `hidden` attribute (the DOM property read
  // back true throughout — hence every assertion here is on VISIBILITY), and a
  // second entry point to checklists in the instructor card that the first pass
  // gated nowhere. It pins RD_CHANNEL to reproduce a real `main` deploy.
  // 48 -> 47 (#263 item 6): one VACUOUS negative assertion DELETED, not repaired --
  // `!/The full experience/` on a phrase the site rewrite removed, so it could never fail.
  // A check that cannot fail is worse than no check, because it reads as coverage. The
  // over-promise guard it was part of now lives where the promise does (the hero negative
  // and the features coming-soon check), both re-pointed and verified by injection.
  // 47 -> 42 (owner ruling 2026-07-30): the training campaign help copy is being replaced
  // by a short tour, so TWO PAIRED channel-honesty guards lost their subject. In each pair
  // the dev half failed and the public half went VACUOUS -- passing because its pattern no
  // longer appears anywhere. Retired rather than re-pointed at #tourOverlay: the tour has no
  // data-flag, so it shows on both channels and the distinction they guarded is gone.
  'verify_flags_ui.js':      { code: 0, score: '42/42' },
  'verify_e2e_ui.js':        { code: 0, score: '16screenshots', slow: true },
  'verify_manual_follow.js': { code: 0, score: '84checks', slow: true },
};

/* Runners that write reports into Diagnostic/ as a side effect — an aggregate run
 * dirties the working tree, which is expected, not a bug. */
var DIRTIES_TREE = ['run_behavior.js', 'run_meltdown.js', 'run_ops.js'];

var C = {
  red: '[31m', green: '[32m', yellow: '[33m',
  dim: '[2m', bold: '[1m', off: '[0m',
};
function strip(s) { return String(s).replace(/\[[0-9;]*m/g, ''); }

/* Scrape the tally off the end of a runner's output.
 *
 * There is no shared format — runners print "Suites: 31/31", "20/20 suites passed",
 * "Probes: 30 pass, 0 xfail", "PASS (16 screenshots)". So: walk backwards over the
 * last few lines, and take the first one that yields any tally token. Bounded to
 * TAIL lines so a runner with no tally returns null instead of matching some stray
 * number from its body.
 *
 * Every token on that line is captured, not just the first — run_procedures prints
 * "Procedures: 22/22   Checks: 96/96", and the check count catches a regression that
 * leaves the suite count untouched. */
var TAIL = 8;
var PATTERNS = [
  /(\d+)\s*\/\s*(\d+)/g,                                              // 31/31
  // The (^|\s) guard stops "15/15   Checks:" contributing a bogus "15 Checks" —
  // the count must be a standalone word, not the tail of a fraction.
  /(^|[\s(])(\d+)\s+(pass|xfail|passed|failed|checks|screenshots)\b/gi,  // 30 pass, (84 checks)
];
function scrapeScore(out) {
  var lines = strip(out).trimEnd().split('\n').filter(function (l) { return l.trim(); });
  for (var i = lines.length - 1; i >= Math.max(0, lines.length - TAIL); i--) {
    var toks = [];
    PATTERNS.forEach(function (re) {
      re.lastIndex = 0;
      var m;
      // Drop the leading delimiter the (^|[\s(]) guard captures, then close up spaces.
      while ((m = re.exec(lines[i])) !== null) toks.push(m[0].replace(/^\D*/, '').replace(/\s+/g, ''));
    });
    if (toks.length) return toks.join(' ');
  }
  return null;
}

function discover() {
  return fs.readdirSync(TEST_DIR)
    .filter(function (f) { return /^(run|verify)_.*\.js$/.test(f) && f !== 'run_all.js'; })
    .sort();
}

function main() {
  var argv = process.argv.slice(2);
  var fast = argv.indexOf('--fast') >= 0;
  var record = argv.indexOf('--record') >= 0;
  var quiet = argv.indexOf('--quiet') >= 0;
  var onlyIx = argv.indexOf('--only');
  var only = onlyIx >= 0 && argv[onlyIx + 1] ? argv[onlyIx + 1].split(',') : null;

  var found = discover();

  // A runner with no baseline is itself a failure — otherwise a new gate can be
  // added and quietly never checked.
  var unknown = found.filter(function (f) { return !BASELINES[f]; });
  var missing = Object.keys(BASELINES).filter(function (f) { return found.indexOf(f) < 0; });

  var scripts = found.filter(function (f) {
    if (only) return only.some(function (o) { return f.indexOf(o) >= 0; });
    if (fast && BASELINES[f] && BASELINES[f].slow) return false;
    return true;
  });

  console.log(C.bold + 'Aggregate gate — ' + scripts.length + ' runners' + C.off +
    (fast ? C.dim + ' (--fast: browser gates skipped)' + C.off : ''));
  console.log('');

  var results = [];
  for (var i = 0; i < scripts.length; i++) {
    var f = scripts[i];
    var base = BASELINES[f] || null;
    process.stdout.write(C.dim + '  running ' + f + '…' + C.off);
    var t0 = Date.now();
    var r = cp.spawnSync(process.execPath, [path.join(TEST_DIR, f)], {
      cwd: path.join(TEST_DIR, '..'),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    var secs = ((Date.now() - t0) / 1000).toFixed(1);
    var out = (r.stdout || '') + (r.stderr || '');
    var code = r.status == null ? -1 : r.status;
    var score = scrapeScore(out);

    var drift = [];
    if (!base) drift.push('no baseline recorded');
    else {
      if (code !== base.code) drift.push('exit ' + code + ' (baseline ' + base.code + ')');
      if (base.score && score !== base.score) drift.push('score ' + (score || '?') + ' (baseline ' + base.score + ')');
    }
    var ok = drift.length === 0;
    results.push({ file: f, code: code, score: score, secs: secs, ok: ok, drift: drift, out: out, base: base });

    process.stdout.write('\r' + (ok ? C.green + '  PASS' : C.red + '  DRIFT') + C.off +
      '  ' + f + Array(Math.max(1, 26 - f.length)).join(' ') +
      C.dim + (score || '—') + '  ' + secs + 's' + C.off +
      (ok ? '' : '  ' + C.red + drift.join('; ') + C.off) + '\n');

    if (!quiet && !ok) {
      var tail = strip(out).trimEnd().split('\n').slice(-14);
      console.log(C.dim + tail.map(function (l) { return '      │ ' + l; }).join('\n') + C.off);
    }
  }

  if (record) {
    console.log('\n' + C.bold + '--record — observed:' + C.off);
    results.forEach(function (r) {
      console.log("  '" + r.file + "': { code: " + r.code + ', score: ' +
        (r.score ? "'" + r.score + "'" : 'null') + ' },');
    });
  }

  var drifted = results.filter(function (r) { return !r.ok; });
  var reds = results.filter(function (r) { return r.ok && r.base && r.base.code !== 0; });

  console.log('');
  if (reds.length) {
    console.log(C.yellow + 'Expected reds (' + reds.length + ') — tracked, not regressions:' + C.off);
    reds.forEach(function (r) {
      console.log(C.dim + '  ' + r.file + ' @ ' + r.score + C.off);
      console.log(C.dim + '    ' + (r.base.note || 'NO NOTE — add one').replace(/(.{86})\s/g, '$1\n    ') + C.off);
    });
    console.log('');
  }
  if (unknown.length) console.log(C.red + 'Runners with no baseline: ' + unknown.join(', ') + C.off);
  if (missing.length) console.log(C.red + 'Baselines with no runner: ' + missing.join(', ') + C.off);
  if (fast) console.log(C.dim + 'Skipped (--fast): verify_e2e_ui.js, verify_manual_follow.js' + C.off);
  console.log(C.dim + 'Wrote reports into Diagnostic/ (expected): ' + DIRTIES_TREE.join(', ') + C.off);

  var bad = drifted.length || unknown.length || missing.length;
  console.log('');
  if (bad) {
    console.log(C.red + C.bold + 'AGGREGATE GATE: DRIFT (' + drifted.length + ' runner(s))' + C.off);
    console.log(C.dim + 'A runner scoring BETTER than baseline also drifts — update BASELINES in\n' +
      'test/run_all.js and the gate baselines in CLAUDE.md, and close the issue it fixes.' + C.off);
  } else {
    console.log(C.green + C.bold + 'AGGREGATE GATE: OK' + C.off +
      C.dim + ' (' + results.length + ' runners at baseline)' + C.off);
  }
  process.exit(bad ? 1 : 0);
}

main();
