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
  // 32 → 36 on 2026-07-31 (#154 item 11): four engine surfaces that shipped with no
  // assertion anywhere — the pressurizer CODE SAFETIES (`s.safety_open` had zero
  // references in the whole test tree; only the SG safeties were ever asserted),
  // `porv_tailpipe_temp` (the TMI/Davis-Besse tell the flagship teaches), the
  // TMI-2 blocked-AFW device (only ever asserted FALSE), and the unknown-command
  // error path. save_migration also went from 8 asserted fields to 20 of the 29
  // _migrateState defaults, including the `rcp_secured` INFERENCE (#240), which is
  // the one judgement call in the migration and was unasserted both ways.
  // 237 → 240: #288 split the RHR suction-valve interlock into a 400 psi block-open
  // permissive and a separate 600 psig autoclose; rhr_valve_and_mode gained the
  // deadband pins. Injection-verified BOTH ways: pointing the autoclose back at the
  // open permissive reddens the load-bearing check, and deleting rhr_autoclose_mpa
  // outright reddens four.
  'run_pwr.js':            { code: 0, score: '36/36 240passed' },   // 200 → 201: #247 added the rcs_flow-follows-truth check to transient_rcp_trip
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
  // 39 since 2026-07-31 (#135): +TR-14, the SOURCED loss-of-feedwater drain rate. Ginna
  // UFSAR Table 15.2-4 (ADAMS ML20339A101) gives 35 s from feed loss to the lo-lo trip;
  // this plant did it in 12.9 s. `K_sg_level` 5.0 -> 1.37 fixes that, and the probe exists
  // because moving a physics constant by 3.6x left ALL 32 gates green — nothing in the
  // suite asserted how fast a steam generator empties, so the value could drift back with
  // nothing to say so. Fails at 13.0 s against its 25-60 s band on the old constant.
  // 40 since 2026-07-31 (#284): +TR-1e. Two turbine-model defects that shared a cause —
  // nothing in the suite ever compared what the turbine was ADMITTED against what the
  // reactor MADE, because every other check runs where the two agree. (a) The rated-speed
  // hold asked `generator_load > 0` rather than whether the BREAKER was shut, so a Manual
  // load target of 0 MWe while synchronised coasted the rotor 1800 -> 0 rpm with the unit
  // still on line; (b) `mwe_output` was derived from `power_pct`, ignoring the governor
  // and the dump, so a 50 MWe ask read 98.8 MWe indicated with the dump venting 48 %.
  // Fails 3 checks on the old engine (0 rpm end and minimum, 98.78 MWe vs a 50 ±3 band).
  // 41 since 2026-07-31 (#220): +TR-1f — the P-9 permissive is an INSTRUMENT reading. It
  // read true `power_pct`, so a permissive gating two reactor trips and the AFW start could
  // not be fooled by the channel it reads. Verified by injection: 4 checks red on the old
  // engine (a channel stuck at 40 % with the core at 100 % still scrammed at +0.5 s, and the
  // SG hi-hi leg scrammed at +0.2 s). Legs A/C are the calibration pins — with a healthy
  // channel NOTHING moves, which is what makes it a sensing fix rather than a protection one.
  // 42 since 2026-07-31: the steam dump went 1.05 -> 0.40, the PROTOTYPICAL Westinghouse
  // capacity *(OWNER RULING: "Let's change it to 40%.")*, and +TR-1g is the check that says
  // 40 % is ENOUGH — a 50 % loss of load with no trip and no relief lift, which is the case
  // the real capacity is sized for. Without it, lowering the dump further would go unnoticed
  // until someone drove a full rejection.
  //
  // FIVE probes were re-banded, not weakened: TR-1, TR-1d, TR-1e, TR-1f, PI-8 all carried
  // bands minted at the P4 freeze from a 105 % dump. TR-1 in particular asserted "dump
  // carries near-full power (90..103 %)" and "no PORV lift" — i.e. it pinned a NON-EVENT
  // (measured at 1.05: Tavg 305.3 °C, power 97.5 % through a total loss of load). It now
  // asserts the defence-in-depth ladder running in order — dump saturates, core sheds the
  // rest to 46 %, PORV lifts as the designed backstop, pressurizer safety does not — and
  // the PORV check is deliberately POSITIVE, so restoring enough capacity to suppress the
  // lift has to come and edit this line rather than sliding through a band.
  // 42 → 43 (#289, 2026-08-01): TR-1h, the FULL rejection on the SHIPPED lineup — rod control
  // is `defaultOn` at power now *(OWNER RULING, 2026-08-01: "Let's start the rods in auto.
  // Might as well, everything else starts in auto.")*, and nothing asserted what a player
  // actually gets from the event #289 was filed on. Five probes (EV-3, EV-11, TR-1, TR-1c,
  // TR-1e leg B) now stand the rod channel DOWN explicitly via `rodsManual()` — they are
  // rod-less BY NAME and intent, and inheriting the lineup would have quietly converted them
  // into something else. TR-1g was RE-AUTHORED against WTSM 11.2 (the dump is transient:
  // "until the power in the reactor is reduced to the same value as the secondary load"), not
  // re-banded — its old 85..93 % steady state was a rods-in-manual artefact. Injection-checked:
  // 7 of the new checks go red on the pre-#289 lineup.
  'run_behavior.js':       { code: 0, score: '44pass 0xfail' },
  // 9 since 2026-07-28 (#213): +MD-9 — partial uncovery HELD (inventory 50-70 %)
  // must damage the core on a TMI timescale; prompt reflood must not. Backed by the
  // new exposed-clad hot node (pwr_thermal.stepCladding).
  // 9 → 10 on 2026-07-31 (#154 item 9): MD-10, feed and bleed. MD-6 took the total
  // loss of the secondary heat sink to core damage; nothing anywhere exercised the
  // RECOVERY, so the suite proved only that the plant can be lost that way. Measured:
  // unmitigated damages at 4040 s peaking at 366 °C Tavg; with the PORV open and HPI
  // running, peak fuel 628 °C, no damage, inventory held above 100 %.
  'run_meltdown.js':       { code: 0, score: '10pass 0xfail' },
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
  // 29 -> 27 on 2026-07-31 (#228): RBMK and BWR now implement `reset_rps`, which the
  // kernel had always been sending to an engine that only the PWR handled. The token is
  // shared by all three plants now, so it stops being a finding — and the known-leak list
  // in run_hr3.js is EMPTY for the first time. Fewer checks means fewer leaks, not less
  // checking; the gate reddened on its own stale entry before anyone edited the list.
  'run_hr3.js':            { code: 0, score: '28checks 0failed' },
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
  // 40 since 2026-07-31 (#284): the fix itself moved nothing here — the BUILD_DECISIONS
  // write-up did, by quoting #230's "Planned offline, no trip." ruling to explain why the
  // new `isOnLine` predicate deliberately EXCLUDES `turbine_tripped`. Another worked example
  // of the warning above: re-run this after the docs, not after the code.
  // 40 -> 39 on 2026-07-31 (#153), and this one goes DOWN — the first time it has. Nothing
  // was un-ruled: CLAUDE.md's "Recent themes" list is capped at 5 bullets, "adding one means
  // deleting the oldest", and the bullet that aged out (#260/#263) carried a formally-marked
  // `OWNER RULING, 2026-07-30: "for 263 item 1 fit the measurement."`. This gate counts
  // OCCURRENCES of the uppercase marker, so a mandated rotation drops the count by one. The
  // ruling itself is intact in four other tracked files (BUILD_DECISIONS.md, TUNING_LOG.md
  // x2, Manuals/00 + 09), which is what was checked before accepting the drop. #153's own
  // owner quote ("You can fix RBMK too") uses the plain `OWNER,` form the themes list already
  // uses elsewhere, which this gate deliberately does not scan (see its SCOPE note).
  // 39 -> 48 on 2026-07-31 (#220). TWO movements, opposite signs, and the net is what is
  // baselined: +11 from a NEW HR1(b) block (code), then -2 when the CLAUDE.md themes list
  // rotated its oldest bullet out and took two OWNER RULING markers with it (prose — both
  // verified surviving in other tracked files before the drop was accepted, per the note
  // above). Same rotation cost recorded at #153. The +11 half, and this one is a code
  // check, not a prose count. The HR1 scan above declared in writing that "nothing that
  // DECIDES can reach truth by a path this misses" — false. A trip's `condition:` key is a
  // status word the ENGINE computes and hands over, so from inside layers/control/ it is
  // indistinguishable from an instrument and the scan cannot see it. `above_p9` was
  // computed from true `power_pct` and gated two reactor trips plus the loss-of-main-feed
  // AFW start. Every permissive key is now declared with its provenance, and the ones
  // declared instrument-derived are CHECKED against the engine line that defines them.
  // Verified by injection three ways: the pre-#220 engine line reddens 3 checks naming the
  // offending expression; an undeclared new permissive reddens 1; a declaration matching
  // nothing is STALE and reddens too. The count moves when a permissive is added, not when
  // a doc is written — unlike the HR11 half above.
  // 48 -> 53 on 2026-07-31: the steam-dump resize, and this is the gate's documented
  // prose behaviour rather than anything about the code — the OWNER RULING quote ("Let's
  // change it to 40%.") is carried, dated, at the constant and in the manual revision row,
  // and HR11 counts dated owner quotes wherever they are tracked. Re-run this AFTER the
  // docs, not after the code.
  // 40 -> 39 on 2026-07-31 (#286): the CLAUDE.md *Recent themes* list is capped at five
  // bullets, and adding this session's meant dropping the oldest (#260/#263) — which
  // carried the "for 263 item 1 fit the measurement." quote. That ruling is NOT lost; it
  // still stands in BUILD_DECISIONS.md, TUNING_LOG.md and Manuals/00_REVISION_HISTORY.md,
  // so this is one fewer CITATION SITE, not one fewer ruling. Worth knowing that the
  // themes cap and this gate pull against each other: rotating a bullet out can redden a
  // baseline with no change to the record. Check where else the quote lives before
  // restoring a bullet to chase the number.
  // 39 -> 41 on 2026-07-31 (#287): the gate counts dated owner quotes wherever they are
  // tracked, and "Keep it and enunciate" is cited at each site that acts on it — the
  // alarm definition, the probe that guards it, and the manual revision row.
  // 43 -> 57 on 2026-07-31, and this one is a merge artefact by construction. The gate
  // counts OCCURRENCES of dated owner quotes across tracked files, and the guaranteed
  // conflict list (CHANGELOG, CLAUDE.md, TUNING_LOG, BUILD_DECISIONS, the manual set) is
  // resolved by KEEPING BOTH SIDES — so merging two lanes that each cited a ruling adds
  // citation sites without adding rulings. Expect this number to jump on every lane merge;
  // it is not evidence that anything was decided.
  // 43 -> 47 on 2026-07-31 (#288): same mechanism again — "issue 288, split them." is
  // cited in the four tracked files that record the split (CHANGELOG, TUNING_LOG,
  // BUILD_DECISIONS, the manual revision row). The engine/config change itself moves
  // NOTHING here; writing it up is what moved the count.
  // 47 -> 48 on 2026-07-31: the A33 keep-it ruling, recorded in TUNING_LOG so the
  // "this alarm got rare, delete it" argument is not re-litigated from scratch.
  // MERGED 2026-08-01 (develop <- workbench): the two lines above are the SAME baseline
  // moved from 43 by two lanes independently — 57 on develop, 48 on workbench. Neither
  // survives the merge, because the merged tree carries BOTH sets of citation sites. The
  // number below is MEASURED on the merged tree, not arithmetic on the two: taking either
  // side whole, or adding the deltas, is precisely the "mechanical BASELINES resolution
  // silently takes the wrong number" failure CLAUDE.md warns about.
  // Measured on the merged tree: 62. Not 57, not 48, and not 57+5 or 48+14 either.
  // 62 -> 58 on 2026-08-01 (develop <- backshop): the pre-public revision reset collapsed
  // 00_REVISION_HISTORY's 27 rows into a Rev 0 baseline, and three of them carried OWNER
  // RULING citations ("for 263 item 1 fit the measurement.", "lets leave opening of the
  // accumulators to the procedure instead of auto opening them.", "Let's change it to 40%.").
  // CITATION SITES lost, not rulings — all three were confirmed still cited in other tracked
  // files before this number was lowered (3, 1 and 4 files respectively). The accumulator one
  // now survives in TUNING_LOG.md ALONE, which is thin; if that entry is ever rotated, the
  // ruling goes with it.
  // 58 -> 60 on 2026-08-01 (#289): two new dated owner-ruling citations for the
  // pressurizer level-program ceiling — CHANGELOG.md and BUILD_DECISIONS.md. Both are
  // recorded as a SELECTION ("selected 'Add the program ceiling' from four options put to
  // him"), not dressed as verbatim words, because that is what it was. This comment's
  // standing point again: the code change moved NOTHING here; the write-up moved it.
  // ---- run_hardrules: BOTH branches moved this, and NEITHER figure is right ----------
  // develop took it 58 -> 60 -> 63 (#289) and workbench 43 -> 77 -> 80 (#290, #238), so a
  // mechanical pick of either side ships a drift. The number below is MEASURED on the merged
  // tree, which is the rule CLAUDE.md states for exactly this entry. Both histories kept:
  //
  // [develop] 60 -> 63 (#289, 2026-08-01b): three more citation sites for the rods-in-auto
  // and ROD-AUTO-colour rulings. The CODE change moved nothing here; the write-up did. This
  // gate ALSO caught a real defect in that change: the first `defaultOn` read
  // `true_state.power_pct` and failed as an undeclared HR1 site, the #220 class exactly, so
  // it scored 61checks 1failed before it scored 63/0.
  //
  // [workbench] 60 -> 77 (#290): HR11 matched the literal string `OWNER RULING` only, so
  // ELEVEN in-scope `OWNER DIRECTIVE` citations were unguarded — including "never merge into
  // develop", "never push the lanes", and the US-customary-units rule — and one was already
  // malformed. NOT the usual write-up drift: no ruling was added, the guard grew to cover
  // markers that were always there. Decomposed: 43 baseline, +11 the widened marker, +4 the
  // corrected inline-code test (the marker sat BETWEEN two backtick spans rather than inside
  // one), +2 bringing `.claude/skills/` into scope.
  // [workbench] 77 -> 80 (#238): ordinary write-up drift — the SI display layer's code moved
  // nothing; the three sites citing the flow-unit selection are the whole delta. The fourth
  // copy, in the ui/diagram/board/ source comment, is NOT counted: this gate does not scan
  // ui/, so a citation living only there would be unguarded.
  //
  // [merged] MEASURED 83 — not 63, not 80, and not 63+80 arithmetic. The #290 guard also sees
  // develop's 2026-08-01b/c write-ups, which workbench's "measured on the merged tree" note
  // predates. Re-measured here. (The comment above this line read 84 for a while: that figure
  // was taken off a tree that STILL HAD THE CONFLICT MARKERS IN IT, so both sides' citations
  // were present at once and the duplicates were counted. Measure AFTER resolving, not during.)
  //
  // 83 -> 85 (#303, 2026-08-01d): the 04 NOP review. Pure write-up drift again — the manual
  // and checklist edits moved nothing here; the two sites citing the owner's dilute-step
  // directive (CHANGELOG, TUNING_LOG) are the whole delta. Re-run this AFTER the docs.
  //
  // 85 -> 88 (2026-08-01f): HR12 widened to cover CONTROL BEHAVIOUR, plus the two write-up
  // sites citing that ruling. Note the rule TEXT is one of the three — this gate counts
  // citation sites wherever they are tracked, and CONTEXT.md 3 is tracked, so editing a
  // Hard Rule to carry its own dated quote moves this number. The count of BINDING rules is
  // unchanged at ten, which was the point of widening one rather than adding an eleventh.
    // 88 → 89 on 2026-08-02 (#310): ONE new citation site — the ruling that kept the three
  // judgement calls. The three code-site citations that went with it moved NOTHING, because
  // this gate scans tracked MARKDOWN only; a ruling recorded in a .js comment is invisible
  // to it. Worth knowing before you go hunting for a missing delta.
  // 89 -> 90 on 2026-08-02 (#295 F1/F2): one new citation site, the TUNING_LOG entry
  // carrying the 2026-08-02 ruling. The KERNEL fix moved nothing here — this gate counts
  // dated owner-quote citations in tracked files, so writing the change up is what moves it.
  // 90 -> 95 on 2026-08-02: `Blueprint/DESIGN_CRITERIA.md` (the four inclusion criteria, its §6
  // per-plant curriculum, the priority ruling) plus the CLAUDE.md pointer and the
  // DESIGN_COMPANION §2 re-scope, each carrying the owner's verbatim words.
  'run_hardrules.js':      { code: 0, score: '95checks 0failed' },
  // New 2026-07-28 (#225) — static guard that the §6.3 true_state contract in
  // CONTEXT.md and `getTrueState()` agree EXACTLY, both directions. Nothing compared
  // them, so the gap grew to 41-of-82 undocumented before anyone noticed — and it was
  // noticed only because #144 was filed against a field that WAS documented. By the
  // time #225 was worked its own list had rotted (12 documented since, 2 new fields
  // added), which is the argument for a gate rather than a list. PWR only: RBMK/BWR
  // are on hold and their blocks were never audited, so they are registered `skip`.
  // Check count = every field name on either side, so adding a true_state field moves
  // this baseline — the intended nudge to document it in the same change.
  // 84 -> 138 on 2026-07-31 (#157): the same file now guards a SECOND contract — every
  // alarm on every plant must declare a `category` from a closed vocabulary. It used to
  // be keyword-matched off the alarm id in ui/app.js, wrong for 13 of the PWR's 33.
  // All three plants here, unlike the PWR-only §6.3 half.
  // 138 -> 139 on 2026-07-31 (#287): the new `rhr_not_aligned` annunciator, which
  // like every alarm must declare a `category` (#157).
  'run_contract.js':       { code: 0, score: '140checks 0failed' },
  // New 2026-07-29 (#253 phase 1) — the seam between the manual's 57 documented
  // procedures and the 10 executable checklists that run them. They referenced each
  // other NOWHERE until now, so nothing could answer "which documented procedures can
  // actually be run?" or "does this checklist still match its procedure?". Checks the
  // manual_ref resolves, is unique, and that no PWR-xxx cross-reference dangles.
  // COVERAGE (47 procedures with no checklist) is REPORTED, not enforced — the number
  // is the work item, and a gate that failed on it would sit permanently red. Watch
  // that line, not just the score.
  // 25 → 23 on 2026-07-31: nuclear-from-cold heatup checklist removed (not a commercial NOP).
  // 23 → 25 on 2026-08-02 (#310): PWR-N15 gained the `pwr_cooldown` checklist — 2 checks per
  // checklist (manual_ref present, manual_ref defined). COVERAGE 10 → 11 of 58 documented.
  'run_procdocs.js':       { code: 0, score: '25checks 0failed' },
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
  // 12 -> 13 on 2026-07-31: +'exactly one Set revision header line'. The existing check
  // matches the FIRST occurrence and the stamper rewrites the FIRST occurrence, so a second
  // line was invisible to both while contradicting the set-wide revision in the one document
  // whose job is to state it. Found carrying a stale 'Set revision: 20 (2026-07-30)' directly
  // under the live 23 — hand-added in 85264ad (#277), survived three stampings. Verified by
  // injection: restoring the second line reddens it.
  'run_manual_rev.js':     { code: 0, score: '13checks 0failed' },
  // NEW 2026-07-31 (#224) — was `test/audit_manual_controls.js`, which is exactly why it is
  // here: not a `run_*.js`, so auto-discovery never saw it, so it had no baseline, so it sat
  // at **32 mismatches / exit 1** through the #197 / #202 / #206 procedure re-authoring with
  // nothing to say so. #159 predicted this about manual-run harnesses and fixed the cosmetic
  // half; this is the half that mattered.
  //
  // It guards more than its name: `STEP_UI` is the COVERAGE LIST for verify_manual_follow,
  // which iterates the table rather than the steps — so an unmapped step is UNVERIFIED, not
  // merely unmapped. Count moves when a controlled procedure step is added or removed
  // (2 checks per step: the mapping, and the reverse entry-has-a-step check).
  // 128 → 94 on 2026-07-31: nuclear-from-cold heatup STEP_UI map removed (17 steps).
  // 94 → 122 on 2026-08-02 (#310): the PWR-N15 cooldown checklist adds 14 controlled steps.
  'run_manual_controls.js': { code: 0, score: '122checks 0failed' },
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
  // 292 → 289 on 2026-07-31: procedure:pwr_heatup_nuclear flag removed.
  // 289 → 292 on 2026-08-02 (#310): the PWR-N15 `pwr_cooldown` checklist needs a registry
  // entry (coverage + orphan + well-formed = 3 checks). The gate caught its absence, which
  // is the point — a procedure the player can open with no flag behind it ships ungated.
  'run_flags.js':          { code: 0, score: '16/16 292/292' },
  // New 2026-07-28 (#96) — the inspection copy behind the System Scanner block.
  // Every way this rots is silent: an item id changes and its entry describes
  // nothing; a new control inherits its card's summary and READS like a real
  // answer; a manual citation outlives the section it names. All three are
  // failures here. The check count moves with the board — a new control or
  // indication shifts it, which is the intended nudge to write its copy.
  // 35 -> 36 on 2026-08-01: the board renders SI since #238 and this copy cannot, so
  // an entry naming its display unit ("in °F") is contradicted the moment SI is picked.
  // The new check found two sites the hand pass had missed, and reddens on the old text.
  'run_inspect.js':        { code: 0, score: '8/8 36/36' },
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
  // Two increments landed together: #275 added the DOWNLOAD section (116 -> 123) and #259
  // packs legal.html + changelog.html into ui/site_docs.js, one more <script src> on the
  // shell, so Settings can open Disclaimer / License / Changelog offline in the portable
  // build. The merged figure is MEASURED, not 123 + 1 arithmetic.
  'run_portable.js':       { code: 0, score: '124checks 0failed' },
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
  // Unmoved at 58 by #287's annunciator, and that is correct: Part A audits NUMERIC
  // thresholds against their instrument's declared range, and `rhr_not_aligned` is a
  // status alarm (`rhr_active` is_false, setpoint null) with no range to sit inside.
  // It briefly read 59 while the alarm was drafted as a pressure threshold.
  'run_reachability.js':   { code: 0, score: '59checks 0failed' },
  // NEW 2026-07-31 — release bookkeeping: site/release.js, changelog.html and CHANGELOG.md
  // must say the same thing about what shipped. Written because the CHANGELOG.md roll (rename
  // "## [Unreleased]" to the version) was skipped for Alpha 1.10.0 AND 1.11.0 — 434 lines of
  // two shipped releases filed as unreleased, newest version heading reading 1.9.0. Nothing
  // downstream reads that heading, so nothing went red; the CLAUDE.md note and the release
  // skill's step are what failed, which is the argument for a gate rather than a louder note.
  // VERIFIED against the real pre-fix file, not a synthetic one: 3 checks red.
  // 18 -> 11 on 2026-07-31: the version was reset to Alpha 1.1.0 and changelog.html
  // collapsed to ONE published entry for the public launch, so there are far fewer
  // cross-checks to make. The count is a function of how many entries exist, not of how
  // much is checked — every rule still runs.
  // 11 -> 8 on 2026-07-31: PRE-RELEASE mode. RD_RELEASE is "Pre Alpha", the build is
  // identified by SHA, and changelog.html correctly has NO published entries — so the
  // released-state rules stand down. They re-arm on the FORMAT: set RD_RELEASE to
  // "Alpha 1.0.0" on launch day and this goes back up. Verified by injection — with a
  // version set and the changelog still empty it fails 3 ways.
  'run_release.js':        { code: 0, score: '8checks 0failed' },
  // 19/19 86passed → 23/23 117passed (2026-07-28, #240): four suites for
  // mode/lineup-dependent alarm classification.
  // 26 -> 28 on 2026-07-31 (#125): the PORV's operator switch is a SEPARATE command from
  // automatic relief (`open_porv_manual` vs `open_porv`), so a scenario can lock the
  // operator out — TMI-2 does — without touching overpressure protection. The third
  // check is the one that matters: relief must still lift while the switch is locked.
  // 28 → 32 on 2026-07-31 (#154 item 6): four kernel internals with no test at all —
  // actuation `reset_below` (a comment recorded the shipped PORV-flapping inversion
  // and nothing pinned the fix), numeric `override_value` interception (five PWR
  // failures use it; the intercepted-command path was never once observed),
  // interception PRECEDENCE (first-injected wins), and `acknowledge_all_alarms`,
  // which was only ever asserted as "the instructor gate does not block it". All four
  // verified red by injecting the defect they guard.
  // 32 -> 33 on 2026-07-31 (#287): losing shutdown cooling annunciates. Gated on the
  // MODE, not the RPS latch — measured, a Mode 5 plant reads `rps_scrammed = false`
  // (it was never tripped, it is simply cold), so the first cut of this alarm could
  // not fire in the one regime where losing RHR matters most. The probe also pins the
  // permissive staying ONE-SHOT, which is now ruled-on behaviour.
  // 33 -> 34 on 2026-08-01 (#294): the MODE 4 half of `COLD_MODES = [4, 5]` was tested
  // NOWHERE. Measured by injection — narrowing it to `[5]` left run_m4, run_pwr, run_ops,
  // run_contract, run_reachability and run_hardrules all green at 185/240/351/139/58/75,
  // so the Mode 4 half could have been deleted outright without a gate objecting. What it
  // suppresses is real: on a correctly depressurized cold plant the injected form gives a
  // spurious CRITICAL (`pzr_pressure_lolo`), three spurious warnings, and loses A33 — the
  // one alarm carrying news — entirely. The probe reaches Mode 4 the way the plant really
  // does, by losing the heat sink and heating on decay + pump heat, not by hand-setting a
  // temperature; 5 checks red on the injected config.
  // 34 -> 35 on 2026-08-02 (#295 F1/F2, the audit's headline): a reactor trip was
  // DEFEATABLE AT POWER. `setTripBlock` accepted a manual block on any blockable trip
  // whenever it was not already asserted, ignoring the permissive, and manual blocks were
  // exempt from auto-reinstate — so at 2235 psi (15.41 MPa) / 100 % power `lo_press`,
  // `si_trip` and `lo_flow` were all accepted, and a 20 %-of-max cold-leg LOCA rode 64 s of
  // unscrammed blowdown (scram at 68.1 s on `pzr_level high` at 130 psi (0.90 MPa)) against
  // a baseline 4.2 s on `primary_pressure low` at 1782 psi (12.28 MPa). Two of the 16 new
  // checks REPLACE checks that pinned the defect; the other 14 are the new suite. All 12
  // affected checks verified red against the pre-fix kernel.
  // 34 -> 36 on 2026-08-02 (#306 item 4, workbench, INDEPENDENTLY): the ROD LIMIT LO
  // approach annunciator and the kernel's published interlock state (`snapshot.interlocks`).
  // MERGED FIGURE MEASURED, not added up — both lanes moved this line from the same 34/194
  // base, so neither branch's number is right and arithmetic on them is how a drift ships.
  'run_m4.js':             { code: 0, score: '37/37 237passed' },
  // Green since 2026-07-25 (#151): the rewind red was lastInstruments not being
  // rebuilt on restore, so every blockable trip reported asserted=false.
  // 79 -> 83 checks 2026-07-31 (#137): the sandbox checkpoint cadence became REAL
  // time, so the free-play rewind ring covers the same slice of the PLAYER's life at
  // any acceleration. The added checks pile up 360 sim-s with the wall clock frozen
  // and require ZERO checkpoints — verified against the pre-fix service, where that
  // one alone lays 21 and 6 of the 8 checks in the suite go red.
  // 19 -> 20 suites, 83 -> 90 checks 2026-07-31 (#153): protection is now evaluated on
  // a SIM-time cadence (PROTECTION_DT 0.1 s) instead of once per broadcast, so trip
  // latency no longer scales with the UI speed button. The new suite drives a rod
  // runaway at 1x and 3600x and reads the RPS latch at PHYSICS rate — the snapshot
  // reporting a scram is still once per broadcast and always will be, so asserting the
  // reported latency would pin the board refresh, not the plant. Verified by injection
  // against the pre-fix service: 5 of its 7 checks go red, including 'trips at all'
  // (at 3600x the old service ran a 135.9 % excursion and NEVER tripped) and the
  // evaluation rate at 0.003/sim-s against its >=5 floor. BOTH 1x checks stay green on
  // the old body, which is the proof that 1x behaviour is unchanged.
  // 19 → 22 on 2026-07-31 (#154 item 7): the `_rewindCursor` walk-back (#137 narrowed
  // it to the beat path but did not remove it, and it had never had a test), world
  // rewind `exact` at THIS level (it was covered only end-to-end in the browser gate,
  // and this is where its semantics live), and `save_state` as a COMMAND — every
  // other caller reaches for svc.saveState() directly, so that dispatch line was
  // unexercised.
  // 22/22 96 -> 23/23 103 on 2026-07-31: NOT a new test, a CONFLICT RESOLUTION correction.
  // The `develop` <- `workbench` merge took this file's develop side, which predates the
  // #154 service tests the merge itself brought in, so the gate read DRIFT on a tree where
  // nothing was wrong. Re-measured on the merged tree. This is the exact failure CLAUDE.md
  // names ("a mechanical BASELINES resolution can silently take the wrong number") — the
  // instruction to re-run run_all AFTER resolving is what caught it.
  'run_m5.js':             { code: 0, score: '23/23 103passed' },
  // 16 -> 17 suites, 94 -> 102 checks 2026-07-27 (#142): a new save/restore test for
  // the instructor's operator-action memory and follow acc streak, both of which
  // saveState dropped. Verified against the PRE-fix instructor, where 5 of its 8
  // checks fail — including the softlock itself (an `operator_action` beat could
  // never be credited after a restore). Its legacy-save check passes on both
  // versions, which is the point: old saves keep their old behaviour.
  // 17 → 18 on 2026-07-31 (#154 item 7): chat-mode transcript mechanics. run_campaign
  // drives a chat scenario and asserts the log grows — the story clock, the time-skip
  // divider (first line of the beat only, or the UI repeats it down an ordinary
  // exchange) and the CHAT_LOG_CAP ring had no unit coverage. The cap matters: the
  // snapshot passes the log BY REFERENCE every broadcast.
  'run_m6.js':             { code: 0, score: '18/18 117passed' },
  'run_m6ph.js':           { code: 0, score: '8/8 18passed' },
  'run_m7.js':             { code: 0, score: null },   // prints "M7 OK", no tally

  // ---- control, campaign, procedures ----
  // 20 → 21 on 2026-07-31 (#214): a stand-down note is the only account of why a channel
  // switched itself off, and it is now on screen, so its LIFETIME is gated — it must be
  // retired when its cause clears, without re-engaging the channel.
  // 21 -> 24 on 2026-07-31 (#228): the RPS reset, run for ALL THREE plants. The defect
  // hid for months because every test that touched reset_rps was PWR-only.
  // 24 → 30 on 2026-07-31 (#154 item 10): six DISCRIMINATING per-channel probes.
  // The suite engaged SEVEN channels at once and asserted aggregate plant state —
  // power, Tavg, pressure, SG level — so a dead channel hid behind the others.
  // MEASURED by neutering the kernel (channel reports `engaged`, does nothing):
  // `cvcs_makeup`, `boron_trim`, `grid_follow`, `boron_conc` and the ENGAGE half of
  // `steam_dump` were each a complete no-op at a green 24/24, and `boron_conc` is
  // `defaultOn` — it shipped inert in every free-play preset lineup. Each new probe
  // engages ONE channel and was verified red by injection.
  'run_autoctl.js':        { code: 0, score: '30/30' },
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
  // 39 -> 59 on 2026-07-31 (#75): the RPS reset from the board. The SCRAM button drew
  // "PRESS TO RESET" with an empty handler, and the kernel's refusal used a `type:
  // 'refused'` shape that NOTHING read — so an early press did nothing, silently. 20
  // checks: the permissive as state, the refusal in the shape app.js flashes, operator
  // text with no instrument ids in it, and the rod-bottom window (~1-3 s) that the first
  // cut of these tests left uncovered — injection proved the whole permissive config
  // could be deleted with every other check still green.
  'run_e2e_controls.js':   { code: 0, score: '59/59' },
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
  // 23/23 115 → 22/22 99 on 2026-07-31: nuclear-from-cold heatup procedure removed.
  // 22/22 99 → 23/23 100 on 2026-08-02 (#310). PWR-N15 arrives as ONE check here, not
  // fifteen: it is `stack_only`, because the board's only boron control is the
  // `boron_conc` channel target and below M4 there is no channel — measured, the
  // engine-direct replay runs the cooldown UNBORATED, the MTC takes the core critical and
  // the plant heats back up to 558.7 °F (292.6 °C). The one check is that the flag is
  // JUSTIFIED (the procedure really does carry an M4-only command), so it cannot be
  // pinned onto something engine-direct could run. Full coverage is in the stack gate.
  'run_procedures.js':     { code: 0, score: '23/23 100/100' },
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
  // 23/23 196 → 22/22 176 on 2026-07-31: nuclear-from-cold heatup stack path removed.
  // 22/22 176 → 23/23 204 on 2026-08-02 (#310): the PWR-N15 `pwr_cooldown` checklist, 28
  // checks. It is also the first procedure to use RAMP steps — a setpoint walked along an
  // authored polyline across the step's hold rather than typed once. That schema addition
  // is REPLAY-SIDE ONLY (the live checklist never issues `cmd`), and it exists because a
  // discrete walk-down measures badly on this plant: an 18 °F (10 °C) Dump SP step bursts
  // at -1168.2 °F/hr (-649 °C/hr). Seven injections were run against the finished
  // checklist and all seven redden it — see Diagnostic/TUNING_LOG.md 2026-08-02.
  'run_procedures_stack.js': { code: 0, score: '23/23 204/204' },

  // ---- known reds (each is a tracked issue; do not "fix" by editing the number) ----
  'run_ops.js': {
    // 334 -> 335 passed on 2026-07-31 (#136): abuse_porv_walkaway now ASSERTS that an
    // overfilled RCS reads overfilled on both gauges. It used to end at inventory 120 %
    // (pinned at mass_max) with pressurizer level 7 %, and the probe printed both numbers
    // on an `info` line every run while asserting neither — which is exactly why it went
    // unnoticed. The defect itself was fixed by #249; this is the guard it never got.
    // 57/68 -> 58/68 on 2026-07-31 (#153): the deliberately-red C2 accel-latency probe
    // went GREEN because the defect it guarded was fixed, not because the test was
    // weakened — M5 now evaluates protection on a sim-time cadence (PROTECTION_DT) and
    // ops_harness's evalEvery mirrors it, so latency no longer scales with `accel` on
    // any plant. All THREE accel probes (PWR, RBMK [post], BWR) now report identical
    // trip delay at 1x and 256x. Owner lifted the RBMK hold for this fix ("You can fix
    // RBMK too", 2026-07-31).
    // 57/68 -> 58/69 on 2026-07-31 (#154 item 9): +ops_shutdown_dilution. Every other
    // reactivity probe in the file runs AT POWER, where the subcritical multiplication
    // it measures does not exist — so the regime that produced the owner's free-play
    // source-range trip (#260) had no probe at all. Measured: diluting Mode 5 at the
    // tuned 0.05 ppm/s makeup rate and walking away, the source-range high-flux trip
    // fires at 1248 s, 59 ppm removed, boron 857 -> 798. The failure count is unmoved.
    // 344 -> 350 passed on 2026-07-31: ops_cooldown_to_rhr's three INFO lines became
    // real checks. It is named 'toward RHR entry' and never got there — measured, it
    // cooled at 103 C/h against the 50 C/h its own driver paces to, and the check that
    // NAMED that ramp was `Tavg after 2 h < 275 C`, one-sided and landing at 90.7, so it
    // could not see a doubled rate in either direction. The driver now throttles the RHR
    // heat exchanger (the actual rate control below the interlock), isolates the
    // accumulators at 1000 psig per #273, and runs 3 h because a properly paced cooldown
    // only reaches the interlock at about two hours. Rate now 50 C/h exactly, RHR aligned
    // at 103 min, boron 2270 -> 623 ppm, inventory 120 -> 100 %. Failure count unmoved.
    // 58/69 350/12 -> 59/69 351/11 on 2026-07-31: same conflict-resolution correction as
    // run_m5 above. The merge kept develop's baseline while bringing in workbench's
    // `ops_cooldown_to_rhr` rework, which turns that probe green — a red going green is
    // still drift, and it has to be acknowledged rather than absorbed.
    code: 1, score: '59/69 351passed 11failed',
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
  // 84 -> 174 on 2026-07-31 (#224). NOT new assertions — the SAME assertions finally
  // applied to the steps they were always meant to cover. This gate iterates `STEP_UI` in
  // manual_ui_map.js rather than the procedure steps, so that table is its coverage list,
  // and the table had not moved through three procedure re-authorings: it named 17 of the
  // 45 controlled PWR steps, with `pwr_heatup` at ZERO, and this gate reported a confident
  // PASS over the slice that was left. Filling the table is what moved the number.
  //
  // Runtime is 115 s -> 132 s for 2.1x the checks, because the per-entry page loads went
  // with it: the bar loop re-navigated with `&view=`, a parameter ui/app.js does not read,
  // so every load rendered the identical page; and the follow loop reloaded and re-clicked
  // `next` i times per entry, O(n^2) in procedure length. Both walk once now. Filling the
  // table WITHOUT that would have added minutes for no extra assurance.
  // 174 -> 141 on 2026-08-01 (develop <- backshop): the commercial-NOP rewrite of
  // 04_NORMAL_OPERATIONS consolidated procedure steps, so there are fewer steps to walk.
  // Backshop updated run_procedures (102->99), run_procedures_stack (178->176) and
  // run_manual_controls (116->94) for the same change but not this one, because it is a
  // `slow: true` Playwright gate and --fast skips it. THE DROP WAS CHECKED, NOT ASSUMED:
  // #224's whole lesson is that this gate iterates STEP_UI, so a smaller number can mean
  // lost COVERAGE rather than less work. run_manual_controls is what tells the two apart
  // and it reports "controlled procedure steps: 47, mapped: 47, all covered" — nothing is
  // unmapped, so this is content shrink. Measured 141 on backshop at its own commit too,
  // so the merge carried it faithfully.
  // 141 → 183 on 2026-08-02 (#310): 14 controlled steps of the PWR-N15 cooldown checklist,
  // 3 checks each. Its STEP_UI map was written WITH the procedure, so unlike #224 this
  // number and run_manual_controls' 122 moved together in one change.
  'verify_manual_follow.js': { code: 0, score: '183checks', slow: true },
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
