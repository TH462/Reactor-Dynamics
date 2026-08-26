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
var os = require('os');

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
  // 240 → 241 (2026-08-03, #321): "drifting pressure diverges" was measuring the DEPTH
  // of the code-safety blowdown its own drift triggered, at 22 % margin — not the drift.
  // Split into the offset it names (rate × elapsed, exactly 2.0000 MPa in every variant
  // tried) plus a POSITIVE assertion of the HR1 half it was accidentally covering:
  // protection acted on a reading the plant never had. Each half injection-verified and
  // they discriminate independently.
  'run_pwr.js':            { code: 0, secs: 53, score: '37/37 260passed' },   // 257 -> 260 (#447): save_migration pins the heater load shed — a pre-shed save restores UNSHED with offsite power available, its edge memory seeds from the LIVE signal, and stepping a mid-SI save fires no phantom shed   // 248 -> 257 (#398): +mode5_heatup_paced (7 checks, the EV-1 rate half nothing asserted) and the roundtrip's two rate report lines   // 246 -> 248 (#429): control_response pins the two no-op nudge forms (zero-step, clipped-at-the-stop)   // 245 -> 246 (#386 stage 3): save_migration pins the six hydrogen fields restoring empty/unburned   // 244 -> 245 (#421): the legacy-currency letdown-alias snap check   // 243 -> 244 (#418 B1): save_migration asserts the t_sg_c split-interpolation seed   // 242 -> 243 (#418 A2): the sg_mass_frac inverse-map round-trip   // 241 -> 242 (#386 stage 1): the five containment fields
  'run_rbmk.js':           { code: 0, score: '23/23 150passed' },
  'run_bwr.js':            { code: 0, secs: 27, score: '15/15 92passed' },
  // DELIBERATELY NOT MOVED at #346, and reading 1/3 on the backshop lane. Both red suites are
  // `flagship_tmi`, and the cause is #347: the TMI-2 decision point was resting on the very
  // discard #346 removes. With `_mass` pinned at the clip the surge could not push back, so
  // `K_porv_relief * porv_flow` ran unopposed and took the RCS to 52 psi (0.36 MPa) with the
  // inventory gauge reading 120 % — two bugs agreeing. Now a stuck-open PORV is matched by
  // unterminated ECCS (0.0035 vs 0.0038 frac/s), the plant goes solid at pressure, and
  // `subcooling_low` never fires, so `injection_decision` is unreachable. That is the TMI-2
  // counterfactual and it is right; what is missing is the crew's actual error, throttling HPI
  // back on the rising level. The baseline stays at 3/3 BECAUSE it must come back — marking it
  // an expected red would hide the next real regression here. Same root as run_campaign's
  // pwr_tmi2_p3, which was already 2 missions red from #337 before this change.
  'run_scenarios.js':      { code: 0, secs: 4, score: '3/3 36passed' },
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
  // 44 → 45 (2026-08-03, #315): TR-7b, post-trip leg ΔT against the energy balance.
  // The split read FISSION power, so a scrammed core removing 6.6 % of rated heat
  // through full flow computed a 0.0 °F ΔT — and INDICATED, that put the cold leg
  // above the hot leg in 48 % of samples. Fission and total heat are equal in steady
  // state, which is why 44 probes measuring near equilibrium all agreed with it.
  // 48 -> 49 on 2026-08-04 (#330): CA-9, loss of CVCS make-up. Injection-verified — the
  // pre-#330 `level_per_mass` of 100 reddens 6 of its 12 checks, including inventory
  // 62.35 % and a melted core. TR-15 leg E's ride went 90 -> 120 min in the same change;
  // it was a knife-edge timing pin (old plant 2180 °F at 90 min, new 2068 °F, BOTH
  // undamaged and both reaching damage at ~100 min), and the widened window passes on
  // both plants — which is what makes it a better test rather than a refit.
  // 49 -> 50 (2026-08-04c, #334): CA-10, the sourced 17 % low-level heater cutoff.
  // TWO EXISTING PROBES MOVED WITH IT, and both were pinning the old behaviour rather
  // than being broken by the new one. CA-7 leg C sampled the LOOP heater response at
  // 300 s, by which time the level interlock had fired and was masking the AC claim the
  // leg exists to make — re-sampled at 10 s (28.9 % level, real margin) and given a
  // positive check that the LATER cut-out is the level interlock with AC still up.
  // TR-13b's `leak > 0.01` was a magnitude fixture measured on a plant whose heaters ran
  // with the pressurizer empty; it now asserts the claim in its own title (the ΔP-scaled
  // BASE survives the round trip), which it never did, and passes on the old engine too.
  // 50 -> 51 (2026-08-04e, #334 item 2): CA-11, break discharge follows RCS pressure.
  // A LOCA used to flow at a CONSTANT rate set when the break opened, so the same break
  // discharged identically at 2235 psi and at 14.5 psi and an empty vessel went on
  // "leaking" at full rate. 10 CFR 50 App K I.C.1.b requires a critical-flow function of
  // the upstream state with "a discharge coefficient applied to the postulated break
  // AREA". Now the orifice law, flow ~ sqrt(dp) to containment.
  // CA-10 leg E was RE-AUTHORED in the same change and was not broken by it: it compared
  // the break rate against the ECCS capacity and required anything above that ceiling to
  // destroy the core — a valid STEADY-STATE argument only while the break was constant.
  // With discharge tracking pressure, a break that starts above the ceiling ends below
  // it, so the comparison decides nothing; the guard is re-pointed at ECCS being what
  // saves the core (same break, injection defeated, must still destroy it).
  // 51 -> 52 (2026-08-04, #346): CA-12, a water-solid RCS repressurizes. `_mass` clipped at
  // `primary.mass_max` and, since #337, the surge driver clipped with it — so an RCS held
  // solid by unterminated ECCS reported ZERO surge and sat flat at 2232 psi for 45 minutes
  // with no relief lift. Raising the ceiling is NOT the fix and was measured: at 3.0 the
  // plant runs to 300 % inventory with pressure still parked. The bubble is the only
  // compressible volume, so once the level line reaches 100 % the gain steps to the bulk
  // modulus of water (`solid_bulk_mpa`). Injection-verified — the pre-#346 gain reddens 4 of
  // CA-12's checks. Leg B computes the settling inventory FROM the level geometry rather than
  // transcribing it: 109.35 % measured against 109.28 % predicted.
  // TWO EXISTING PROBES MOVED, both pinning the old behaviour rather than broken by the new.
  // CA-4's `core_inventory_pct > 110` was a magnitude only reachable while the RCS accepted
  // unbounded mass; it asserts the FLOODING directly now (true level solid at > 103 %
  // inventory), which passes on the old engine too, plus a new check that the overfill shows
  // on the relief path — 0.0 % PORV duty before, 4.8 % after. TR-15 leg E now defeats ECCS:
  // the survival it was failing on is automatic feed-and-bleed, not circulation, and with
  // injection defeated the plant is lost at 94 min on BOTH engines.
  // THIS LANE READS 50, NOT 52 — CA-10 and CA-11 are the standing #337 cascade and predate
  // this change (verified unmoved by it, same observed values either side).
  // 52 -> 53 (2026-08-05-develop-a, #362): CA-13, a HEATUP fills the pressurizer solid.
  // `levelBase` carried an undocumented upper clip at 100 from v1, binding at Tavg 611.6 °F
  // (322.0 °C) — INSIDE the subcooled operating range at NOP, where Tsat is 653.2 °F
  // (345.1 °C). MEASURED incidence before the fix, per sample: 95.7 % of a loss of heat sink
  // and 87.9 % of a station blackout, against 0.0 % on hot_full_power idle, large LOCA 0.5,
  // small LOCA 0.05, SGTR 0.25, stuck-open PORV and both cold ICs — a LOCA drains and COOLS,
  // so its base line runs the other way. That is why removing it reddened NOTHING in the
  // suite and needed a probe written for it.
  // ITS SOLID IS NOT CA-12's, which is why it is a probe and not a leg there: CA-12 gates on
  // level-at-top AND OVERFILLED AND no void because its case is an ECCS fill, and this plant
  // goes solid at an inventory DEFICIT (94.39 %) with nothing added — the water expanded into
  // the bubble. CA-12's gate EXCLUDES this event.
  // Injection-verified (restore the clip): 4 checks red — base line 144.5 -> 100.0 %, peak
  // indicated level 100.00 -> 82.44 %, solid samples 790 -> 0, PORV duty 0.8 -> 0.0 %. Its
  // two remaining checks are calibration guards that pass on BOTH engines and say so.
  // A FIFTH CHECK WAS WRITTEN AND CUT, which is the trap worth keeping: it asserted #347's
  // no-bubble-no-spray gate, and that gate is UNOBSERVABLE on this path by construction — a
  // blackout stops the RCPs and spray takes its motive head from the loop, so spray is
  // 0.00 % on both engines. It "passed" on 0 of 0 samples. An earlier draft of the inventory
  // check was cut for the same class of reason: it passed on the old engine (3.49 points of
  // travel against a > 2.0 band), so it discriminated nothing.
  // 53 -> 54 (2026-08-05-develop-a, #363): CA-14, break flash-cooling is saturation-gated.
  // A break has two halves and only one knew its regime: stepPressure has always gated
  // `leak_depress` on `saturated`, while the TEMPERATURE half ran on `leak_flow > 0` alone and
  // went on "flash"-cooling a plant that had stopped boiling. Flashing removes LATENT heat and
  // subcooled liquid has none. MEASURED, ECCS defeated so the (correctly ungated) cold-injection
  // quench cannot mask it: the pre-fix engine ends a 2 % break 55.8 °F (31.0 °C) SUBCOOLED and
  // still falling, with the core already melted, and spends 1194 of 2358 late-drain samples more
  // than 9 °F (5 °C) subcooled against 0 of 2358 after.
  // Injection-verified: 3 checks red on the ungated term. The other 4 pass on BOTH engines by
  // design — leg B (the term is still LIVE when saturated, so the gate cannot be satisfied by
  // deleting the term) and leg D (the config's own two-point tuning criterion, re-measured and
  // unmoved: 8 % SGTR holds 2267 psi against its > 600 psi target, the 20 % LOCA lands at
  // 3.94 MPa against the 4.14 MPa accumulator setpoint — which is why neither `[tune]` constant
  // was retuned).
  // THREE DRAFTING TRAPS, all caught by A/B rather than by reasoning, all recorded at the site.
  // (1) Leg C's first datum was `tavg_c` 110 °C — exactly `blowdown_sink_c` — so the term
  // evaluated to gain x flow x (110 - 110) = 0 and the check PASSED ON THE UNGATED ENGINE. A
  // test state sitting on the sink of the term under test measures nothing. (2) Leg A first took
  // a run-wide max of subcooling, which is the `h.range()` trap: the plant STARTS 73.8 °F
  // (41.0 °C) subcooled and its first subcooled minutes are correct physics, so it failed on
  // both engines. (3) A void check was drafted on the strength of the full-stack final state
  // (pre-fix: void 0 at ZERO inventory, an empty core reading no void) and CUT — peak void is
  // 1.00 on both engines and the final value is 0.00 on both at this layer, because the void
  // line is gated `trueSubcooling <= 0` and a state a whisker either side of saturation reads
  // 1.00 or 0.00 on a coin toss.
  // 52 → 53 (2026-08-05, #369): new probe TR-16 — SG safeties are self-actuating on true
  // pressure; a dead steam_pressure channel must not defeat the lift (audit #297 F2).
  // MERGED 2026-08-05: 52 base + 2 (develop: CA-13 #362, CA-14 #363) + 1 (workbench:
  // TR-16 #369) = 55. Both lanes moved this from 52 independently, so NEITHER lane figure
  // survives and 54 + 53 is not the answer either — the count below is MEASURED on the
  // merged tree after every conflict was resolved, which is the standing rule this map has
  // warned about since #312.
  // 55 -> 56 (2026-08-05-develop-d, #361): CA-15, a LIQUID break goes solid clear of the
  // ceiling. #346's solid regime and #347's spray gate were both measured on ONE path — a
  // stuck-open PORV with the block valve isolated, i.e. a STEAM-SPACE vent where `leak_flow`
  // is 0 by construction — and the in-code arrest claim was generalised from it. It does not
  // generalise: `K_leak_depressurize` exists only when there is LIQUID break flow, and it
  // double-counted mass the surge driver already carries (`stepInventory` adds RELIEF back out
  // of `dm_surge` and deliberately does not add the leak back). 10 x leak = 0.938 MPa/s against
  // ~0.26 MPa/s of surge, so the plant never reached the ECCS shutoff head, injection never
  // terminated, and inventory hit 120.00 % — mass_max exactly, the fingerprint of a clip — at
  // 21 min and pinned there for the rest of the run with 274 F (152 C) of subcooling.
  // Injection-verified: 3 checks red, and the injected run reproduces 120.00 % exactly. The
  // other 2 pass on BOTH engines by design — a bubbled plant must still depressurize on the
  // same break (-13.05 psi), or the gate could be satisfied by deleting the term.
  // The settling point is COMPUTED from the level geometry rather than transcribed (CA-12 leg
  // B's idiom): 109.28 % measured against 109.28 % predicted.
  // NOTE THE ARREST MECHANISM IS NOT THE RELIEF LADDER on this path, which is what the fix
  // plan predicted: measured, `porv_open` is false throughout and pressure settles at 326 psi.
  // A plant with a hole in it does not repressurize — the equilibrium is injection = break
  // flow at low pressure. CA-12's isolated-PORV path is where the relief ladder arrests it.
  // 56 -> 58 (#386 stage 1): CA-16 (containment receives the discharge; SGTR bypasses)
  // + CA-17 (LIVE backpressure clone rig, red on the pre-#386 engine). Injection-verified
  // three ways: press_gain 0 reddens 4 of CA-16, dropping the _leak_to_sg gate reddens leg
  // B alone, reverting the live reads reddens all 3 of CA-17.
  // --- workbench lane, same base ---
  // 55 → 56 (2026-08-05, #370c): TR-12c — the steam line isolation's COINCIDENCE.
  // TR-12b proves it works on the casualty; TR-12c proves it stays out of a full
  // cooldown and a bottled SG with its safeties lifting, and that the operator
  // cannot reopen while it is sealed in. The half that is easiest to skip.
  // 56 → 57 (2026-08-05, #371): TR-17 — the atmospheric dump. Leg B opens it and the
  // plant cools 304.5 → 187.7 °C with no condenser at all.
  //   RE-AUTHORED 2026-08-06 (probe count unmoved; the CHECKS changed, which a
  //   probe-count baseline cannot see). Leg A was the null control on the grounds that
  //   the valve ships SHUT; the shipped lineup is AUTO now, so it measures what that
  //   bought — safeties never lift in an hour vs parked open at 9.00 MPa — and a new
  //   leg A2 forces the valve shut to keep reproducing audit F3. The "still holds hot"
  //   check is retained as a calibration guard and passes on BOTH engines: AUTO caps
  //   the pressure, it does not remove the heat, so leg B is still a real lever.
  //   TR-12b moved in the same change, for a reason worth keeping: TR-5 still lifts the
  //   code safeties because bottling from full power SPIKES past the ADV, while TR-12b's
  //   generator is re-pressurizing UP from a blown-down break, so there is no spike and
  //   the ADV catches it at 8.60. Same valve, different history, different relief path.
  // +1 xfail (2026-08-06, #378): TR-18 — load-change settling, shipped as a STRICT
  // XFAIL pinning an OPEN defect: the plant limit-cycles ~13 pts p2p forever after a
  // manual 100→50 MWe step. The fix that kills it (stop-exit rod-travel cancel) was
  // built, measured, and REJECTED — it takes TR-1i's sourced ramp duty 4.34 → 5.26 °F
  // vs the WTSM ≤ 5.00, i.e. the duty is currently met partly BY the defect. Strict:
  // if settling starts passing, the XFAIL entry must go in the same change.
  // MEASURED ON THE MERGED TREE (2026-08-06 lane merge): develop read 58pass 0xfail and
  // workbench 57pass 1xfail from the same 55pass base; neither figure survives and their
  // sum is not the answer. The standing rule since #312 — measure, never add up.
  // 60 → 61 (2026-08-06, #377): TR-1k — the arm cliff on the SHIPPED lineup, which no
  // probe measured while TR-1c's legs are deliberately rod-less. Measured: rod control in
  // AUTO does NOT keep the PORV shut on a sub-arm rejection (the audit's 12.9 psi margin
  // was eaten by #372), and the sub-arm cut undershoots ~15 pts deeper than the caught
  // one. TR-1c re-authored the same day: its backstop check sat exactly ON the PORV
  // setpoint (16.212 vs >= 16.20) and flipped under a 3 % coolant_heat_capacity nudge —
  // now the robust doorstep (>= setpoint - 0.15) + cliff-span (>= 0.5 MPa) pair, with the
  // knife-edge PORV sample carried as info. Injection-verified: severing the arm reddens
  // 5+4, forcing it always-armed reddens 4+5, and the capacity nudge that flipped the old
  // form leaves all 37 TR-1c/TR-1k checks green.
  // 65/1 -> 64/2 (2026-08-07, #419 wave 3): TR-1i joins TR-18 as a STRICT xfail (#420) —
  // the steep Ginna program runs the sourced ±5 °F ramp duty to 5.28 with the rod channel
  // already at the sourced WTSM speed thresholds; the ±5 band is sourced and NOT widened.
  // Coupled to #378 (whose fix was rejected FOR this duty at 5.26 — the trade-space
  // changed); fixing the duty must remove the XFAIL entry in the same change.
  // 67/2 -> 69/0 (2026-08-09, #394 + #378 + #420 bundle): BOTH strict xfails retire in one
  // change, and the cause was neither thing the two prior sessions were rejecting fixes for.
  // MEASURED: the limit cycle is a LOOP-GAIN instability. This plant lumps all 4068 pcm into
  // one control bank on the S-curve, so one fine step is worth 4.657 pcm at 74.8 % withdrawn
  // and 0.892 at the rails — a 5.2x range against a CONSTANT controller gain. The incidence
  // curve is monotone in bank position over six points (15.05 / 10.97 / 5.91 / 2.35 / 1.31 /
  // 0.78 pts p2p at 74.8 / 78.1 / 82.1 / 87.8 / 91.7 / 98.0 % withdrawn), and scaling the
  // gain by that same ratio kills it. `gainScale` schedules the gain on differential worth,
  // GATED on the program being parked (d(spEff)/dt 1.54e-2 °C/s through the ramp vs 1.07e-4
  // through the cycle, 144x) — ungated it cost TR-1i 5.28 -> 6.52 °F, gated it reads 5.28 to
  // the digit. TR-18 settles at 15.8 min / 1.76 pts (was: never / 13.4). TR-1i's band is now
  // the sourced duty SCALED by the declared 33.295/29 °F program-span departure = 5.74 °F
  // *(OWNER RULING, 2026-08-09: selected "Scale on the departure")* — the #311 precedent, not
  // a widening. The abandoned stop-exit travel is REAL (measured: 571 events in 2 h, mean
  // 1.59 steps, 75 pcm per half-cycle) but it is the amplitude-setting nonlinearity riding on
  // an already-unstable loop, not the cause — fixing the gain collapses it to 4 events.
  // 69 -> 70 (same bundle): SS-11 — a part-power steady state is STEADY, hands-off from the
  // authored 50 % IC with no command at all, over an EXPLICIT 60-90 min window. FG-2's headline
  // invariant, unasserted until now: SS-3 was carried by SS-2's single instant at t = 600 s,
  // which read comfortable by 0.36 °C through an 11-point cycle and was green for the whole
  // life of the defect. Injection-verified 13.31 pts (schedule off) vs 1.47 (on), with the
  // 100 % leg green at 0.16 on BOTH — the control that proves the 50 % leg measures the plant.
  // SPLIT (#513, owner-approved "2-3 siblings", 2026-08-25): the battery's 75 probes now ride
  // as THREE runners — run_behavior.js (part A, ids ≡ 0 mod 3) + run_behavior_b.js (B, ≡ 1) +
  // run_behavior_c.js (C, ≡ 2) — because the single 398.8 s process was the whole gate's
  // wall-time floor at 10-way parallel (halves still measured 256 s; thirds ~130). Interleaved
  // ids, no test change; the per-part tallies below sum to the old 74pass 1xfail.
  'run_behavior_b.js':     { code: 0, secs: 146, score: '25pass 0xfail' },
  'run_behavior_c.js':     { code: 0, secs: 125, score: '25pass 0xfail' },
  'run_behavior.js':       { code: 0, secs: 126, score: '24pass 1xfail' },   // 72pass -> 73pass (2026-08-18, #489): +TR-1m, pinning a DECLARED SIMPLIFICATION rather than a desired behaviour — an armed load rejection never stands down with the rods in MANUAL, which is the shipped lineup. Three legs: MANUAL sticks, AUTO clears (the control that names the cause as the lineup, not the arm threshold), and one MWe the other side of the arm pins the non-monotonicity as a SPAN (+11.7 pts). It is meant to RED when DESIGN_COMPANION 8.30's fix is built: injected a reachable reset window and the latch clears, the inversion collapsing to -0.1 pts. Injection-verified five ways.   // 71pass -> 72pass (#464): +TR-19, the first probe anywhere to assert a THERMAL consequence of AFW rather than its flow. It is the reason the #464 physics change reddened NOTHING: the SG energy balance was rewritten and all 47 runners held, because the regime it fixes — unthrottled AFW at decay heat — was the regime nothing exercised. run_m4 already drove AFW to full capacity and only ever checked afw_flow_normalized. | 70pass 0xfail -> 71pass 1xfail (#447): +CA-25 (the ESF load shed — SI and a LOOP take the pressurizer heaters off the bus; the post-LOCA plant settles instead of limit-cycling). The 1 xfail is CA-20b, leg B of CA-20 SPLIT OUT so its known gap does not suppress that probe's live legs — the small-break pressure plateau was HEATER-HELD and has no mechanism left once the shed removes the prop (#451). CA-7 leg C and CA-10 leg D were repaired (reload the heaters where an operator would); CA-15 was re-authored back to #361's original claim, which #408 had replaced using the defect itself as its reasoning.   // 67pass/3xfail -> 70pass 0xfail (#433 FIXED; '70pass 0xfail' is the string run_all observes — recorded as observed, not trimmed to the pre-#433 '70pass' shape): the MSLI pressure leg is rate-compensated (`lead_lag`, the sourced "(Rate sensitive)" channel) and TR-12b/TR-12c/PI-9 pass as written — isolation +2..3 s on a sev-0.8/1.0 downstream break, cooldown and bottle-reopen discriminators hold. The filed root cause was WRONG: `sg_steam_flow` sees the break (peaks 1.58 — it reads steam_out_total); the defect was a TIMING MISS (#408's sourced-deep 600 psig raw crossing at ~+103 s vs the 60 s flow latch). // 70pass/0xfail -> 67pass/3xfail (#433, exposed by #403): TR-12b, TR-12c and PI-9 were GREEN on a harness artifact — `held_within_s` ages off `_simT`, which only advances when evaluate() gets its dt, so with the dt omitted the MSLI's flow leg latched PERMANENTLY (age 0 <= 60 for ever) from t=0. Measured in production: a full-area SLB never isolates, 825 -> 212 psi with the MSIV open. The probes assert the right thing and the PLANT is wrong — do not weaken them; delete the XFAIL entries in the change that fixes #433. // 66 -> 67 (#386 stage 3): CA-24 — hydrogen: mitigated trace, the one-time burn above the hi-hi and under design, recombiner rig, the SGTR transport fence (clone rig). Injection-verified three ways with distinct signatures. 65 -> 66 (#385 node stage 1): CA-23 — the pressurizer inventory node is INERT (identity to the level line across three families + the migration seed). 64 -> 65 (#386 stage 2): CA-22 spray knockdown/auto-secure; CA-16 leg D re-authored on the active sinks, CA-21 window 0.90 -> 0.85 (stage-2 drained equilibrium parks at 0.88), PI-9 re-authored (SI correctly arrives on the sourced containment backup)   | MERGE 2026-08-18 (workbench->develop): 72pass -> 73pass (#472 phase 0): +CAT-1, the catalog<->COVERAGE parity lock — v3.1 "FROZEN-FINAL" had no mechanical meaning (39 probe IDs had no catalog row; the battery stamps read v2.0 for a year) and v4.0-DRAFT gives the freeze a gate. Injection-verified both directions: a fake COVERAGE key reddens A, a bogus catalog row reddens B. | 71pass -> 72pass (#464): +TR-19, the first probe anywhere to assert a THERMAL consequence of AFW rather than its flow. It is the reason the #464 physics change reddened NOTHING: the SG energy balance was rewritten and all 47 runners held, because the regime it fixes — unthrottled AFW at decay heat — was the regime nothing exercised. run_m4 already drove AFW to full capacity and only ever checked afw_flow_normalized. | 70pass 0xfail -> 71pass 1xfail (#447): +CA-25 (the ESF load shed — SI and a LOOP take the pressurizer heaters off the bus; the post-LOCA plant settles instead of limit-cycling). The 1 xfail is CA-20b, leg B of CA-20 SPLIT OUT so its known gap does not suppress that probe's live legs — the small-break pressure plateau was HEATER-HELD and has no mechanism left once the shed removes the prop (#451). CA-7 leg C and CA-10 leg D were repaired (reload the heaters where an operator would); CA-15 was re-authored back to #361's original claim, which #408 had replaced using the defect itself as its reasoning.   // 67pass/3xfail -> 70pass 0xfail (#433 FIXED; '70pass 0xfail' is the string run_all observes — recorded as observed, not trimmed to the pre-#433 '70pass' shape): the MSLI pressure leg is rate-compensated (`lead_lag`, the sourced "(Rate sensitive)" channel) and TR-12b/TR-12c/PI-9 pass as written — isolation +2..3 s on a sev-0.8/1.0 downstream break, cooldown and bottle-reopen discriminators hold. The filed root cause was WRONG: `sg_steam_flow` sees the break (peaks 1.58 — it reads steam_out_total); the defect was a TIMING MISS (#408's sourced-deep 600 psig raw crossing at ~+103 s vs the 60 s flow latch). // 70pass/0xfail -> 67pass/3xfail (#433, exposed by #403): TR-12b, TR-12c and PI-9 were GREEN on a harness artifact — `held_within_s` ages off `_simT`, which only advances when evaluate() gets its dt, so with the dt omitted the MSLI's flow leg latched PERMANENTLY (age 0 <= 60 for ever) from t=0. Measured in production: a full-area SLB never isolates, 825 -> 212 psi with the MSIV open. The probes assert the right thing and the PLANT is wrong — do not weaken them; delete the XFAIL entries in the change that fixes #433. // 66 -> 67 (#386 stage 3): CA-24 — hydrogen: mitigated trace, the one-time burn above the hi-hi and under design, recombiner rig, the SGTR transport fence (clone rig). Injection-verified three ways with distinct signatures. 65 -> 66 (#385 node stage 1): CA-23 — the pressurizer inventory node is INERT (identity to the level line across three families + the migration seed). 64 -> 65 (#386 stage 2): CA-22 spray knockdown/auto-secure; CA-16 leg D re-authored on the active sinks, CA-21 window 0.90 -> 0.85 (stage-2 drained equilibrium parks at 0.88), PI-9 re-authored (SI correctly arrives on the sourced containment backup)
  // 9 since 2026-07-28 (#213): +MD-9 — partial uncovery HELD (inventory 50-70 %)
  // must damage the core on a TMI timescale; prompt reflood must not. Backed by the
  // new exposed-clad hot node (pwr_thermal.stepCladding).
  // 9 → 10 on 2026-07-31 (#154 item 9): MD-10, feed and bleed. MD-6 took the total
  // loss of the secondary heat sink to core damage; nothing anywhere exercised the
  // RECOVERY, so the suite proved only that the plant can be lost that way. Measured:
  // unmitigated damages at 4040 s peaking at 366 °C Tavg; with the PORV open and HPI
  // running, peak fuel 628 °C, no damage, inventory held above 100 %.
  // 10 → 11 (2026-08-03, #238): MD-11, zirconium-steam oxidation. The whole battery
  // was green with the term ABSENT and green with it IN — the MD-* paths assert THAT
  // the core melts, never how fast or which way the rate is going. MD-11 asserts the
  // SECOND DERIVATIVE instead: each 400 °C band must be crossed faster than the one
  // below. Measured 184/172/86/40 s with oxidation, 218/334/378/428 s without.
  // 11 -> 12 (2026-08-04b, #326): MD-12, the post-melt freeze. Both core-material nodes
  // integrated past `melted`, the end of this model's declared validity — fuel as a pure
  // integrator (hFcEffective -> 0 on a dry core), clad on the #238 Arrhenius oxidation
  // feedback, which is the larger half and is NOT a follower of the fuel node above melt.
  // Injection-verified two ways: both freezes out -> 4 red, clad drift 312089 C; stepFuel's
  // freeze alone (the fix the issue's own investigation recommended) -> 3 STILL red, same
  // drift to three decimals. MD-11's bands are unmoved at 184/172/86/40 s, which is what
  // says the freeze did not reach below melt.
  'run_meltdown.js':       { code: 0, secs: 136, score: '12pass 0xfail' },
  // New 2026-07-26d (#209 last thread): the same casualties HANDS OFF through the
  // full stack. run_meltdown is engine-direct and does not load control_kernel at
  // all, so its MD-4/MD-8 PROTECTION claims are proven with the operator hand-
  // scramming and hand-starting HPI. This asserts the automatic chain actually
  // fires unprompted — scram without a manual scram, hpi_active without a set_hpi —
  // so a regression in an SI setpoint, an ESF arm or the P-11 permissive cannot
  // silently turn a documented-survivable path into a melt.
  'run_meltdown_stack.js': { code: 0, secs: 3, score: '3/3 21/21' },

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
  'run_hr3.js':            { code: 0, score: '31checks 0failed' },   // 30 -> 31 (#386 stage 3): set_ctmt_recombiners declared. 28 -> 30 (#386 stage 2): set_containment_spray/set_ctmt_fans declared in the valueFieldFor allow-list
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
  // 104 -> 108 (2026-08-03c, #314 the RCP breaker trip): four more citation sites, again all
  // write-ups — the trip itself is one row of data and moved this by zero.
  // 100 -> 104 (2026-08-03b, HR1 seam-vs-roster): four more citation sites for the ruling that
  // kept HR1 binding while handing the instrument ROSTER to DESIGN_CRITERIA. One of them is the
  // RULE TEXT itself in CONTEXT.md §3 — this gate scans tracked markdown, and §3 is tracked, so
  // editing a Hard Rule to carry its own dated quote moves the number. BINDING rules stay at ten.
  // 95 -> 100 (2026-08-03, the premise purge): the instruments-vs-truth *framing* was removed
  // from eleven documents and three player-facing surfaces, and every one of the five new
  // citation sites is a write-up carrying the owner's words — CLAUDE.md, CHANGELOG,
  // TUNING_LOG, BUILD_DECISIONS, PWR_CURRICULUM_REDESIGN. The behavioural change is ZERO:
  // HR1 did not move, and `DESIGN_CRITERIA.md` §6.3 is explicit that it must not. Note the
  // count was measured TWICE — 98 with the source/spec edits in and 100 after the logs — which
  // is the standing warning three comments up, arriving on schedule.
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
  // 95 -> 98 on 2026-08-03 (#311): write-up drift again, and cleanly. The engine, config,
  // instrument and control changes moved this by ZERO — the delta is entirely the three
  // tracked-markdown sites citing the 2026-08-02 ruling (TUNING_LOG, BUILD_DECISIONS,
  // DESIGN_COMPANION §8.23) plus the CLAUDE.md themes bullet. VERIFIED rather than assumed:
  // stripping the date and quote from the CLAUDE.md citation alone takes HR11 to 1 undeclared
  // and reddens the gate, so that site is genuinely seen and not silently skipped by the
  // markdown-wrap window.
  // 98 -> 100 on 2026-08-03 (#312): the Tier C ruling, cited in CLAUDE.md and TUNING_LOG.
  // THE ARITHMETIC IS WORTH READING BEFORE YOU TRUST THIS NUMBER. The total is the SUM of
  // per-rule sites (HR1 15 + HR5 0 + HR11 85), and a third citation — the one in
  // `Blueprint/CURRICULUM.md` itself — moved it by ZERO. Cause: HR11's marker regex matched
  // the PHRASE in that file's old header, `STATUS: PROPOSAL - NEEDS AN OWNER RULING`, which
  // is not a citation but counted as a site and PASSED, because the neighbouring real
  // citation supplied a date and a quote inside the same window. Rewriting the header
  // deleted the false positive and added a real ruling: a wash. So this gate over-reports
  // its site count, and a false positive can lend its window to a genuinely missing
  // citation. Do not infer "no citation was added" from a flat number here.
  // 100 -> 103 on 2026-08-03 (#312): the Tier A/B ruling, cited in CURRICULUM.md, CLAUDE.md and
  // the TUNING_LOG write-up. The third site is the standing lesson — WRITING THE CHANGE UP moves
  // this gate, so re-run it AFTER the docs, not after the code.
  // 103 → 106 (2026-08-03): write-up drift, and the net hides two moves. FOUR new
  // citation sites for the Physics-tab directive (CLAUDE.md, CHANGELOG,
  // BUILD_DECISIONS, TUNING_LOG) against ONE removed — the *Recent themes* cap
  // evicted the steam-dump bullet and its `"Let's change it to 40%."` with it.
  // The ruling still stands in three other tracked files; this is one fewer SITE.
  // MERGED 2026-08-03: both lanes moved this independently, so neither figure above is the
  // merged one. MEASURED on the merged tree, not added up — the standing warning in CLAUDE.md.
  // THREE lanes moved this independently: develop 103, backshop 106, workbench 108.
  // MEASURED 124 on the fully merged tree. Adding them up gives 317, which is
  // the arithmetic this comment exists to stop.
  // MEASURED 136 on the fully merged tree — develop 125, workbench 128, backshop 127.
  // Adding them up gives 380. Three lanes, one measurement.
  // 136 -> 137 on 2026-08-03: ONE citation site, and it is the usual shape — the code
  // changes (load rate limit off, ROD status word removed) moved this by ZERO, because this
  // gate scans tracked MARKDOWN only. The whole delta is CLAUDE.md's board_check line
  // carrying the owner's words for the removal. The `OWNER DIRECTIVE` quoted at the decision
  // site in pwr_config.js is invisible here, which is a property of the guard, not a gap.
  // 137 / 141 -> MEASURED ON THE MERGED TREE, 2026-08-04. develop took it to 137 and backshop
  // to 141 INDEPENDENTLY, so neither branch figure survives and their sum is not the answer
  // either — this is the exact trap this file has recorded three times (the 83-on-merge note
  // below). Measured after resolving every conflict, never during: a tree that still has
  // markers in it carries BOTH sides' citations at once and counts the duplicates.
  // ---- MERGED 2026-08-04: BOTH LANES MOVED THIS FROM 142, INDEPENDENTLY ----------------
  // develop took it 142 -> 149 -> 148 -> 157 and workbench 142 -> 144, so NEITHER branch
  // figure is the merged one and 157 + 2 is not it either — the arithmetic this file has
  // warned against four times. The number below is MEASURED on the fully merged tree, after
  // every conflict was resolved (never during: a tree with markers in it carries both sides'
  // citations at once and counts the duplicates). Both histories kept:
  //
  // 142 -> 144 on 2026-08-04: the two CLAUDE.md sites citing the lane-tag directive
  // *(OWNER DIRECTIVE, 2026-08-04: "Since that's done add an in process tag that shows
  // which worktree it's being worked on.")* — the Issue-tracking label section and the
  // session-start lane check. #330's own write-ups moved this by ZERO: they quote no owner
  // ruling, and the 2026-07-22 drain-rate request they DO quote lives in test/ops_pwr.js,
  // which this gate does not scan (tracked MARKDOWN only). Measured AFTER the docs, per the
  // standing note below.
  //
  // 142 -> 149 on 2026-08-04c (#282): the version-bump suspension LIFTED. Write-up drift, and
  // the biggest single move yet from a change with NO code in it at all — docs and one skill.
  // MEASURED net +7. Deliberately NOT decomposed per site: citations were added in six files
  // for the 2026-08-04 launch directive AND the 2026-07-31 suspension quotes were removed from
  // three of them, and a hand count of that does not reconcile to +7 — which the note above
  // already warns about, since this gate over-reports its site count and a false positive can
  // lend its window to a neighbour. Do not publish arithmetic here you have not measured.
  // The dated quote now in site/release.js is invisible to this gate — .js is not scanned,
  // same as #310 and #137.
  //
  // TWO TRAPS, both caught on this change rather than reasoned about:
  //   (1) The Rev 0 ruling was first quoted in the skill banner with NO DATE — exactly what
  //       HR11 exists to stop — so it scored 149checks 1failed before 149/0. A citation typed
  //       by hand is the likeliest place for a malformed one.
  //   (2) WRITING THE LITERAL MARKER IN PROSE *REMOVES* A SITE, even inside backticks. The
  //       CLAUDE.md write-up first read "the `OWNER DIRECTIVE` now in site/release.js is
  //       invisible here" and the gate went 149 -> 148: a backticked marker is not merely
  //       skipped, it swallows the guard on a real citation nearby (that line carries many).
  //       Verified by injection three ways — remove the paragraph: 149; keep it with the
  //       backticked marker: 148; keep it phrased as "the dated quote": 149. So refer to the
  //       markers by description in prose, never by typing them.
  // 149 -> 148 on 2026-08-04d (#282, the launch itself): a DROP, and the mechanism is the one
  // this entry has recorded twice for the themes cap — DELETING HISTORY DELETES CITATION SITES.
  // Zeroing the manual set to Rev 0 collapsed 26 revision rows, and several of them quoted owner
  // rulings ("issue 288, split them.", "Go with one B", "Let's go with your recommendations"),
  // which outweighed the new citations added for the three launch directives. CHECKED BEFORE
  // ACCEPTING, per the standing rule: every affected ruling still stands in other tracked files
  // (4, 5 and 2 files respectively), so this is fewer citation SITES, not fewer rulings. The
  // revision table and this gate pull against each other exactly as the themes cap does.
  //
  // IT READ 146 MID-CHANGE. That was measured after the code/data edits and BEFORE the
  // TUNING_LOG and BUILD_DECISIONS write-ups, which added two sites — the "re-run this AFTER
  // the docs" warning three comments up, arriving on the very entry that repeats it. And the
  // write-up itself first cited two of the directives with the DATE IN THE PROSE rather than
  // inside the citation, which HR11 scores as undeclared: 148checks 2failed before 148/0.
  // 148 -> 157 on 2026-08-04e: the three UI directives (board ALL-CAPS, Physics-tab contrast
  // + indication colours, failure groupings). NINE citation sites, and the split is the usual
  // one — the CSS/JS changes moved this by zero, and the delta is the write-ups plus the
  // directive quoted at each decision site in tracked markdown. The quotes in ui/app.js,
  // ui/shell.css, pwr_board_wiring.js, board_check.html and run_inspect.js are invisible here
  // (this gate scans tracked MARKDOWN only), which is a property of the guard, not a gap.
  // ---- backshop's own chain, kept: it also started from 142 ------------------------
  // 142 -> 149 (2026-08-04b, #328 + #326): write-up drift, the usual asymmetry. The CODE in
  // both changes moved this by ZERO — a rename touches no rule and `if (s.melted) return;`
  // cites nothing — and the entire delta is tracked markdown carrying the two dated owner
  // quotes for #328 (the rename directive and the 100-MWe unit ruling) across the manual
  // revision row, CHANGELOG, TUNING_LOG and BUILD_DECISIONS. MEASURED AFTER the docs, which
  // is the only order that gives the right number: an intermediate run mid-change read 143.
  // 165 -> 170 on 2026-08-04b, #330: five citation sites for *(OWNER RULING,
  // 2026-08-04: "A")* — the drain-rate ruling — across CLAUDE.md, CHANGELOG,
  // TUNING_LOG, BUILD_DECISIONS and the ops-probe write-up's heading. The CODE moved
  // this by ZERO, as usual: the ruling changed no constant, it only recorded a decision
  // about one already shipped. MEASURED AFTER the docs.
  // 170 -> 172 on 2026-08-04 (#339): the session-label ruling's citation sites. MEASURED, and
  // net +2 against SIX new sites — an intermediate run read 173 and the CHANGELOG citation took
  // it DOWN to 172, because CLAUDE.md's baselines paragraph is one enormous physical line and
  // inserting into it re-parses the parenthetical clipping for the citations already there.
  // Do not hand-reconcile this number; measure it after the docs, which is what happened here.
  // 172 -> 173 later the same day: the TUNING_LOG entry for the WIP-sweep fix cites the
  // lane-tag directive. The one-word `gh` fix it writes up moved this by ZERO — the usual
  // split, and the reason this number is measured after the docs rather than before.
  // 173 -> 175 at the 2026-08-04 three-lane merge: workbench's #337 F14 citation sites
  // arrive with its write-ups. MEASURED on the merged tree — neither parent's number
  // survives (develop 173, workbench 172) and they do not add up, as this entry has
  // warned five times.
  // 178 -> 177 (2026-08-04, #346): a DROP, and it is the themes-cap mechanism this entry has
  // recorded twice before, biting again. The #346 bullet took the *Recent themes* list over its
  // five-bullet cap, evicting #311 and taking its *(OWNER RULING, 2026-08-02: "311: a.")* with
  // it. CHECKED BEFORE ACCEPTING: that ruling still stands in BUILD_DECISIONS.md,
  // DESIGN_COMPANION.md §8.23 and TUNING_LOG.md (twice), so this is one fewer citation SITE, not
  // one fewer ruling. The engine, config and probe work of #346 moved this by ZERO and its
  // write-ups quote no owner ruling at all — the change was a bug fix, not a decision — so the
  // eviction is the entire delta. Measured AFTER the docs, which is the only order that gives
  // the right number.
  // 177 -> 176 (2026-08-04, #347): the themes cap biting a SECOND time in two sessions, and the
  // mechanism is now well enough established to expect it. The #347 bullet took the list over
  // five, evicting the Physics-tab entry and its *(OWNER DIRECTIVE, 2026-08-03: "Add a tab to
  // the tools block called Physics…")*. CHECKED BEFORE ACCEPTING: that directive still stands in
  // BUILD_DECISIONS.md, CHANGELOG.md and TUNING_LOG.md. One fewer citation SITE, not one fewer
  // directive. The scenario, engine and probe changes moved this by ZERO — #347's write-ups quote
  // no owner ruling, because it is a bug fix — so the eviction is again the entire delta.
  // **MEASURED 177 ON THE MERGED TREE (2026-08-04) — not backshop's 176, not develop's figure,
  // and not the two added up.** The #350 board work landed on develop while #346/#347/#348 were
  // landing here, and both sides wrote citations into CLAUDE.md; the merged file carries both at
  // once. Measured AFTER every conflict was resolved and AFTER the themes cap was brought back to
  // five (that eviction is itself worth −1 or so), never during — a tree with markers still in it
  // holds both sides' citations twice over and counts the duplicates. This entry has now warned
  // about hand-reconciling this number seven times.
  // 177 → 178 (2026-08-05, #370): the §8.28 deferral row carries a new dated owner
  // quote and the HR11 citation-format scan counts every one it tracks — by design,
  // so a directive added with the count unmoved would read as NOT LOOKED AT.
  // 178 -> 183 (2026-08-05-develop-f, #364 + #365): write-up drift, and the usual asymmetry —
  // the engine, config and probe work moved this by ZERO, and the entire delta is tracked
  // markdown carrying the two dated owner rulings (the decay refit and the #365 collapse)
  // across CLAUDE.md, CHANGELOG, TUNING_LOG, BUILD_DECISIONS and the manual revision row.
  // MEASURED AFTER the docs, which is the only order that gives the right number: an
  // intermediate run with the code done and the write-ups pending read 180.
  // 183 -> 189 (#386 stage 1) MEASURED AFTER THE DOCS: the code moved this by ZERO, the
  // delta is the tracked-markdown citation sites for the two dated rulings (Tier 3, the
  // TMI-2-style burn) across CLAUDE.md, CHANGELOG, TUNING_LOG and BUILD_DECISIONS -- net
  // of the #346 themes-bullet eviction, whose bullet carried no ruling.
  // --- workbench lane, same base ---
  // 178 → 179 (2026-08-05, #370c): the steam line isolation's numeric coincidence
  // term is the first OBJECT-form condition, and it gets its own HR1 check — the
  // string-only scan would have skipped it silently (see #370b).
  // MEASURED ON THE MERGED TREE (2026-08-06 lane merge), AFTER the write-ups and AFTER
  // the manual revision table collapsed six rows into one — that collapse DELETES
  // citation sites, the same mechanism the themes cap has bitten this number with twice.
  // develop read 189, workbench 179; the merged figure is neither and is not their sum.
  // The AFTER-the-docs rule earned its keep again: 192 with the merge resolved and the
  // write-ups still to come, 195 once CHANGELOG/TUNING_LOG/BUILD_DECISIONS were written.
  // Recording the 192 would have shipped a three-check drift. And HR11 caught a malformed
  // citation of the very directive this merge introduced — the collapsed revision row first
  // said `per OWNER DIRECTIVE 2026-08-06 the...` with no comma, colon or verbatim quote,
  // scoring 175 sites / 1 undeclared. A hand-typed citation is the likeliest bad one.
  // --- backshop lane, same base ---
  // 178 → 183 (2026-08-05, #382/#383): five new citation sites, all the same two rulings
  // written where they bind — the audit-lane ruling in CLAUDE.md's lane table, the
  // AUDIT_CHARTER.md header and its §11, plus the TUNING_LOG and BUILD_DECISIONS entries.
  // 0 failed throughout, i.e. every one is well-formed; the count moved, the compliance did not.
  // **A STANDALONE `node test/run_hardrules.js` CANNOT CATCH THIS** and that is how it nearly
  // shipped: the runner exits 0 on "0 failed" and says nothing about the count, so it printed
  // OK while sitting five checks above baseline. Only run_all compares the tally, because the
  // drift here is symmetric — MORE checks is drift too. Run the aggregate before you believe a
  // doc-only change moved nothing.
  // 200 -> 202 (2026-08-06): the workbench-is-not-an-audit-lane ruling, cited where it binds —
  // CLAUDE.md lane table, AUDIT_CHARTER.md header, tools/audit_preflight.js header (that last one
  // is INVISIBLE to this gate, which scans tracked MARKDOWN only, so the +2 is the two .md sites).
  // MEASURED ON THE MERGED TREE (2026-08-06-develop-b, backshop merge), AFTER the write-ups.
  // This key has now been a three-way combine in one day: base 178 → develop 189, workbench
  // 179, backshop 183, and none of those figures survives any of the merges. It is the one
  // baseline in this map that CANNOT be reasoned about, only measured, because it counts
  // citation SITES in tracked markdown — so writing a merge up moves it, and deleting history
  // (the manual revision collapse) moves it the other way.
  // 203 -> 208 on 2026-08-06-workbench-g (#395/#396) — write-up drift, the usual
  // split: the mechanism/harness/gate code moved this by ZERO, and the entire
  // delta is tracked markdown carrying the two dated owner rulings (warn-never-
  // block; defer PWR-N02) across TUNING_LOG, BUILD_DECISIONS, CHANGELOG and the
  // CLAUDE.md status line. Measured AFTER the docs, per the standing rule.
  // 208 -> 205 on 2026-08-06-workbench-i: the CLAUDE.md bloat pass cut 42,065 words to 13,455,
  // and deleting history deletes CITATION SITES — the mechanism this map already records for the
  // themes cap. Every one of the 30 dated owner citations in that file was checked against the
  // rest of the tracked tree FIRST: all 30 exist elsewhere, so this is fewer SITES and zero fewer
  // rulings. NET -3, not -5: the cut removed 5 and the write-ups put 2 back, which is why this is
  // MEASURED AFTER THE DOCS. An intermediate run with the file cut and the entries unwritten read
  // 203, and recording that would have shipped a 2-check drift — the standing rule landing on the
  // very change that shortened the paragraph stating it.
  // 205 -> 208 on 2026-08-06-workbench-j: three citation sites for the conciseness-shape ruling.
  // MEASURED after the write-ups; the entry that records it first predicted 206.
  // 208 -> 209 on 2026-08-06-workbench-k: ONE new citation site — the CHANGELOG.md entry for the
  // website pass cites the 2026-08-06 "changelog is strictly for simulator changes" directive as
  // its reason for adding no changelog.html entry. HR11 counts declared citation SITES, so writing
  // up a change against a ruling moves this score even when the change itself touches no rule;
  // 0 undeclared throughout. MEASURED by pulling that one citation back out (209 -> 208 -> 209),
  // not inferred from the diff — the count is the sum of two independent scans and "it must be my
  // line" is exactly the assumption that would hide a second, undeclared one arriving beside it.
  // 209 -> 210 on 2026-08-07-workbench-a: again ONE new declared citation site, the
  // changelog-page style directive quoted as the reason the host-migration entry adds no
  // changelog.html line. MEASURED as the marker count in CHANGELOG.md, 39 -> 40, against a
  // check delta of 1 — the `(#241: "…")` quote in the same entry is NOT an OWNER marker and
  // correctly counts for nothing. 0 undeclared throughout.
  // 208 -> 210 on 2026-08-07: two citation sites for the proportional-valve ruling
  // (BUILD_DECISIONS + the CLAUDE.md status). The engine/config/mission work moved this
  // by ZERO — write-up drift, the usual split; measured AFTER the docs.
  // MERGED 2026-08-07 (workbench -> develop): BOTH lanes independently took this key to 210
  // from different bases, so neither figure survives — the mechanism the paragraph above
  // describes, for the fourth time. MEASURED 218 on the merged tree AFTER the write-ups: the
  // merge carries both lanes' citation sites at once AND adds the merge entries' own, so it is
  // higher than either parent and than any arithmetic on them. 201 HR11 sites, 0 undeclared.
  // 218 -> 220 later the same session, with the Alpha 1.3.0 RELEASE write-ups: two more sites,
  // both the "changelog is strictly for simulator changes" directive quoted as the REASON the
  // website work gets no changelog.html entry. An intermediate run taken with the merge written
  // up and the release not yet written read 218 — recording that would have shipped a 2-check
  // drift, which is this key's own standing warning arriving twice in one session.
  // 220 -> 224 (2026-08-07-develop-c, #418 wave A1): four new dated-citation sites from the
  // tier-2 ruling write-ups — the content-follows-physics directive in CLAUDE.md's HR9 block,
  // the scope-ruling records in BUILD_DECISIONS/TUNING_LOG, and the K_steam_pressure
  // derivation's ruling reference in pwr_config. MEASURED after the write-ups, per this key's
  // standing warning (prose moves this score; run the aggregate after the docs, not before).
  // 224 -> 225 (2026-08-07-develop-c close): the tier-3 ruling citation in the TUNING_LOG
  // turnover — the same prose-moves-this-score trap as this morning's CI red, caught
  // LOCALLY this time by running the gate after the docs, which is what this key's own
  // comment says to do.
  // 225 -> 228 (2026-08-07, #419 wave 1): three new dated-citation sites — the pace/D-row
  // rulings quoted in the Manuals/00 Rev 14 item (g) and this session's TUNING_LOG and
  // BUILD_DECISIONS entries. Measured standalone on the final tree AFTER all docs were
  // written (the docs-move-the-score rule above, honored locally again).
  'run_hardrules.js':      { code: 0, score: '381checks 0failed' },   // 380 -> 381 (#518, 2026-08-26): the dated owner ruling "Canary + sub-step" in PWR2_VALIDATION §89 and CHANGELOG   // 379 -> 380 (#517, 2026-08-26): PWR2_VALIDATION §88's and CHANGELOG's dated owner ruling "Build the superheat wing anyway."   // 378 -> 379 (#515 Build 3, 2026-08-26): PWR2_VALIDATION §87's dated owner-ruling citation. Earlier: 371 -> 374 (#513 follow-up, 2026-08-25): the pwr-campaign-split ruling's citation sites (CLAUDE.md, TUNING_LOG, BUILD_DECISIONS) — counted BEFORE the push this time, in the same change. Same acknowledged class.   // 367 -> 371 (#513, 2026-08-25): the session's four new dated ruling citations (the two plan-question rulings in BUILD_DECISIONS/TUNING_LOG, and their echoes in the runner comments) are HR11 sites — CAUGHT BY CI, not locally: the full local gate ran before the doc entries were written, and the doc-gates spot check ran the runner solo, whose own exit code cannot see a count move. Same acknowledged class.   // 366 -> 367 (#514, 2026-08-25): the load-cut owner ruling cited in BUILD_DECISIONS is an HR11 site. Same acknowledged class.   // 365 -> 366 (#511, 2026-08-24): the owner's model-these-valves directive lands as a new dated HR11 citation site (350 sites scanned).   // 364 -> 365 (2026-08-23): the acceptance-windows owner directive ("Let's fix your acceptance windows first.") cited in TUNING_LOG and the endurance runner is an HR11 site. Same acknowledged class.   // 363 -> 364 (2026-08-22c): the #507 batch's dated ruling citations (the SGTR UNVERIFIED-area declaration in pwr2_shell.js, the LOOP row's "Full LOOP + clear") are HR11 sites. Same acknowledged class.   // 362 -> 363 (2026-08-22b): the #458 ruling citation the pwr2 shell's RHR refusal now carries is an HR11 site. Same acknowledged class.   // 360 -> 362 (2026-08-22a): the #506 bundle's two new dated ruling citations (the shutdown-bank directive, the boron-panel ruling) are HR11 sites. Same acknowledged class.   // 357 -> 360 (2026-08-21d): the #501-#504 bundle's three new dated ruling citations (the flat-seed reversal in BUILD_DECISIONS/CLAUDE.md/CHANGELOG) are HR11 sites. Same acknowledged class.   // 356 -> 357 (2026-08-21c): the merge session record's own directive citation is an HR11 site — and it went to origin ungated, because a 'docs-only' push skipped the static scan. The gate-the-exact-commit rule has no docs-only exemption; CI caught it in 40m11s. Same acknowledged class.   // MERGED TREE 2026-08-21 (develop 307 x backshop 334 — a STATIC SCAN carries the union; measured below, not picked — the 2026-08-17 trap).   // 332 -> 334 (2026-08-21b): the CVCS balance-point ruling cited in PWR2_VALIDATION.md sec 64 and TUNING_LOG. Same acknowledged class.   // 330 -> 332 (2026-08-21a): the feed-train ruling ("Due next as recommended") cited in PWR2_VALIDATION.md sec 63 and TUNING_LOG. Same acknowledged class.   // 328 -> 330 (2026-08-20i): the two AFAS rulings ("AFW auto-start" + "Include the trip rung too") cited in PWR2_VALIDATION.md sec 62 and TUNING_LOG. Same acknowledged class.   // 327 -> 328 (2026-08-20g): the A/B-pass ruling citation in PWR2_VALIDATION.md sec 60. Same acknowledged class.   // 325 -> 327 (2026-08-20e): the 'Next: option B' ruling cited in PWR2_VALIDATION.md secs 57-58 and in pwr2_shell.js, the class built under it. Same acknowledged class.   // 323 -> 325 (2026-08-20a): the 'Do option 1' ruling cited in PWR2_VALIDATION.md sec 54 AND in pwr2_instruments.js, the module built under it. Same acknowledged class.   // 322 -> 323 (2026-08-19g): PWR2_VALIDATION.md §49 carries the facade ruling citation. Same acknowledged class.   // 321 -> 322 (2026-08-19f): the ADV section in PWR2_VALIDATION.md §48 carries a ruling citation. Same acknowledged class.   // 319 -> 321 (2026-08-19e): the 'Defer. A.' ruling cited in PWR2_VALIDATION.md §47 and in pwr2_dumpctl.js, the module built under it. Same acknowledged class.   // 317 -> 319 (2026-08-18b): two more HR11 sites -- the "Option 1" pressurizer ruling cited in PWR2_VALIDATION.md §43 and in the module that was built under it. Same acknowledged class as every prior move.   // 316 -> 317 (2026-08-18): PWR2_VALIDATION.md §42 carries the #489 handoff's owner-ruling citation, and the HR11 provenance scan counts it — the turnover's warned-about baseline move, acknowledged same-change.   // 316 MEASURED ON THE MERGED TREE (2026-08-17, backshop<-develop). The merge conflicted here with backshop at 311 and develop at 286, and the answer is NEITHER: this runner is a STATIC SCAN of source files, so the merged tree carries the union of both lanes' HR11 sites. Taking either side would have silently certified a wrong count against a green gate -- the exact failure CLAUDE.md names for a mechanical BASELINES resolution. Run the runner; do not pick a number.
  // NEW 2026-08-06-workbench-i. Budgets the ONE document that is auto-loaded into every
  // agent's context on every turn. Its caps were prose INSIDE the file they governed, and both
  // were being broken: 42,065 words under a "Keep it SHORT" heading, a single physical line of
  // 5,310, and 13 bullets in a themes region documented as "max 5". Injection-verified against
  // the real pre-cut file at HEAD~1 — all 3 checks red, exit 1. Thresholds carry headroom over
  // the measured 13,455 / 164 / 5, so ordinary work cannot trip them; if a cut ever has to fight
  // this gate the answer is a pointer into TUNING_LOG, not a bigger number.
  'run_doc_budget.js':     { code: 0, score: '4checks 0failed' },   // 3 -> 4 (2026-08-10): the standing-procedure trap list gets a cap of 25, owner-ruled, evicting to Blueprint/TRAPS.md. It was the only unbounded list left in a file sitting exactly on its 15,000-word limit — 30 bullets growing about one a session, while Recent themes right above it had a cap and a ritual and had held. Gated rather than left in prose for this gate's own founding reason: every cap that lived as prose inside the document it governed had been broken for weeks. Injection-verified: a 26th bullet reddens it,

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
  // 140 → 141 (2026-08-03): `core_heat_pct` — TOTAL core heat (fission + decay
  // tail, the engine's `_Q_total`). Published for the Physics tab, which was
  // otherwise going to re-derive it from power_pct and a config constant, i.e.
  // keep a second copy of a formula that does not move itself.
  // 141 -> 143 (2026-08-03, #311 flag ON): the two OTdT/OPdT approach ALARMS arrive, and
  // this gate's second contract makes them declare a `category` — the design working, not
  // drift. Enabling protection is expected to move this and run_reachability together.
  // 143 -> 145 (2026-08-03): `core_uncovered_frac` and `zirc_heat_pct`, the two drivers
  // BEHIND clad_temp_c, published for the Physics tab's new Core damage group. Both were
  // locals inside stepCladding, so the panel could show the symptom (peak temperature) and
  // the verdict (fuel_damaged) but nothing of the mechanism between them.
  // 148 → 149 (2026-08-05, #373): new true_state field stop_valve_pct — the turbine trip
  // stop valves, spring-shut on a trip, documented in CONTEXT §6.3 with the change.
  // 149 → 151 (2026-08-05, #375): the two ±100 °F/hr rate annunciators are picked up by
  // the contract's per-alarm coverage automatically.
  // 151 -> 154 (#386 stage 1): containment_pressure_mpa / containment_temp_c /
  // containment_sump_pct, documented in CONTEXT.md §6.3 in the same change.
  // --- workbench lane, same base ---
  // 151 → 153 (2026-08-05, #371): two new true_state fields for the atmospheric dump
  // (adv_valve_pct, adv_flow_normalized), documented in CONTEXT §6.3 with the change.
  // MEASURED ON THE MERGED TREE (2026-08-06 lane merge): five new fields between the two
  // lanes, and this gate counts each name on BOTH sides of the diff, so it moves by more
  // than the field count. develop read 154, workbench 153 — neither survives.
  // 157 -> 158 (#418 A2) -> 159 (#418 B1): the sg_mass_frac ledger and t_sg_c tube-node
  // fields' §6.3 lines — the contract gate counts one check per documented true_state
  // field, both directions.
  // NEW 2026-08-09 (#432) — the bug-report recorder, which until now NOTHING in test/ had
  // ever touched. Not a coverage gap so much as its cause: the recorder lived inside
  // ui/app.js, which no Node runner can reach, so it shipped sampling once per BROADCAST —
  // one row per 180 s at 3600× — under a manifest hardcoded to `sample_hz: 1`, and the first
  // person to find out was the owner, whose 3600× LOCA report was TWO ROWS. The recorder is
  // now ui/diag_recorder.js and this drives it full-stack.
  // Injection-verified on the pre-fix data path (broadcast-only, no extremes): 4 checks red
  // — the 3600× spacing (360 s against the ≤6 s band) and all three TR-4 transient checks,
  // with `hi - lo` identically 0.0000 across the blowdown and 3 rows where there are now 131.
  // TR-8 is a SOURCE SCAN, because everything above drives the recorder directly and would
  // stay green if ui/app.js stopped calling it.
  'run_pwr2_board.js':     { code: 0, score: '28passed 0failed 28checks', secs: 14 },   // 26 -> 28 (#512, 2026-08-25, owner design): PER-SYSTEM UNLATCH — a securing click inside the sourced 45-60 s reset window refuses with the time remaining (WTSM 12.3.2.3's time-delay relay + P-4); after the relay ONE click resets the function and secures the pump SIGNAL PRESENT OR NOT (what keeps a deliberate TMI-style termination reachable — owner requirement), with automatic re-actuation blocked until the signal clears; the per-system ACTUATED lamps publish (si/afas/fwi/heater-shed); RPS RESET is trip-only. Mutations 5 -> 7 (delay-0, reset-click severed; the payload anchor re-pointed into the shared guard; the timer-accrual mutation deliberately ABSENT — the engine captures the protection module at load so a stepProtection mutation cannot reach the running plant, and the relay-met check's own fixture defends the timer wire).   // 24 -> 26 (#511, 2026-08-24): the item-11 check FLIPPED — all four clickable valves read OPERABLE (the disabled statics retired); the MSIV round-trips from the diagram and closing it at power trips the turbine (the mirror then reports cause "turbine_trip" — P-9); the accumulator valve refuses AT POWER with the sourced >1600 psig power-removed lock (B 3.5.1).   // 13 -> 24 (#509, 2026-08-24): THE TRIP RIDE — the kernel's rps latch LEARNS an engine-owned automatic trip (the evaluate mirror; before it resetRps returned null for ever and every SI/FWI seal-in was unreleasable), ECCS STOP / AFW STOP / MFW RESTORE refuse OUT LOUD against a standing seal-in (WTSM 12.3.2.3), a reset with rods seated is ACCEPTED (the stale-snapshot "rods not inserted" lie retired), reset under a standing LOCA re-latches rather than wedging, the AFW block valve round-trips BOTH ways off the board's own {open} payload with a live lamp, charging OFF zeroes the FLOW (not just the lamp), and MSIV/accumulator read disabled art (registered statics) while AFW stays operable. Mutations 2 -> 5 (scram mirror severed, reset snapshot patch severed, set_afw_block payload revert), all caught.   // 11 -> 13 (#507 wave 7): the engine-owned block surface merged through the kernel (standing at-power block, setpoint 35 on the snapshot) + the WHOLE button path in one check — unblocking the low-flux trip at 100 % scrams on the spot, cause hi_flux_lo, on a FRESH world (the sweep's own world is already lo_flow-scrammed and would satisfy it vacuously). The tile-presence mutation RETIRED as superseded (the merge makes it invisible on a live pwr2 ride; the class rides verify_board_check's TRIP-35 fixture + the shell setpoint mutation) and replaced by the merge-severed mutation.   // NEW (#506, 2026-08-22): the pwr board driver over a REAL pwr2 SimulationService, headless — the seam the playtest broke and no gate stood on. Pump props finite (the RCP froze on a NaN spin speed) · power tile authored bands (was "TRIP 25%" at 99.8 %) · the payload round trips (HPI STOP secures, heater MANUAL lands, letdown lamps latch, dump CLOSED reads, charging OFF reads, S/F rod speeds measurably differ) · THE NO-ORPHAN SWEEP: every button item handled+acknowledged, momentary, UI-local or disabled (DESIGN_CRITERIA Q4 as a check). 2 mutations (tile presence condition, set_hpi payload revert), both caught.
  'run_diag_bundle.js':    { code: 0, score: '35checks 0failed', secs: 8 },
  // #437, the sequence-of-events stream. Two defects were red here before the file landed
  // and are what the numbers are pinned against: the recorder's own first-pass alarm sweep
  // arriving as 46 `alarm_clear` events at t=0 (TR-1 measured "a steady 20 s at power"
  // producing 46 events; it now produces 0), and `safety_relief_active` in the watch table,
  // which is an INSTRUMENT with no true_state field behind it (TR-7). Both are observer
  // artefacts — the class of defect this runner exists for, since downstream they look like
  // a plant that did something.
  'run_events.js':         { code: 0, score: '40checks 0failed', secs: 1 },
  // #393, the extracted held-axis policy. It pins the TWO original implementations verbatim
  // and replays them against the shared one — 770 niceStep inputs and a 235-frame transient
  // with 50 re-fits, matching frame for frame. The pinned copies are dead code on purpose:
  // a check that only drove the new function would agree with whatever the new function does.
  'run_chart_math.js':     { code: 0, score: '8passed 0failed', secs: 1 },
  // PWR2 Layer 0 (#479) — water/steam properties for the NEW engine, built alongside the
  // current one. Asserts the correlations against PUBLISHED steam-table values, not
  // against themselves (HR10). It carries the check `engines/pwr/` cannot make in any
  // form: Q = m*dh on the plant's own ruled identity, which REJECTS the declared
  // rcs_flow_gpm 24000 at 1.53x. That rejection is a deliberate negative control — if it
  // ever passes, the property library has drifted enough to bless the defect #479 was
  // filed over. Additive: touches nothing in engines/pwr, so no existing baseline moves.
  // 56 -> 164 (2026-08-14, #479): Layer 0 REBUILT after the adversarial review measured the
  // first version against IAPWS-95. The old 56/56 was a could-not-fail instrument: deleting the
  // compressed-liquid term, deleting the compressibility term, or scaling cp_l by 1.5 each left
  // it fully green, and FOUR of its reference values were wrong by more than the tolerance
  // asserted against them (two were the 15.0 MPa steam-table row used at the plant's 15.41 MPa).
  // The new runner adds off-node references, cp_l assertions, superheat, and an INJECTION
  // SELF-TEST that re-runs the whole suite against 17 deliberately broken libraries and FAILS
  // if any mutation stays green. TRAP WORTH THE LINE: that self-test immediately reported one
  // BLIND SPOT in my own new gate -- restoring the h_l regime branch reddened nothing, because
  // every compressed-liquid check asserts a VALUE and the defect is a DERIVATIVE discontinuity.
  // Four slope-continuity checks close it. A score change here means the fits or the mutation
  // list moved; re-read the runner header before touching this number.
  // NEW 2026-08-14 (#479): Layer 1 geometry, unblocked by the vessel ruling. 29 checks + a
  // 13-mutation injection self-test, same rule as Layer 0 -- a mutation that stays green FAILS
  // the gate. It is also the first artifact that ENFORCES D1 sec 2's provenance rule rather than
  // declaring it: every entry must carry [ruled]/[sourced]/[derived], [tune] is forbidden, and
  // the single [recalled] family (form losses) is allow-listed BY NAME so a second cannot appear
  // quietly. TRAP WORTH THE LINE: the first draft counted node provenance tags but collected
  // [recalled] only from the keyed objects, so a recalled NODE was invisible while a recalled
  // ledger entry was caught -- the self-test found it immediately. Two containers, one rule.
  // NEW 2026-08-14 (#479): Layer 2, the conservation core -- the first thing in this rewrite
  // that actually steps a plant. 33 checks + a 12-mutation self-test. TWO FINDINGS ARE BAKED IN.
  // (1) A UNIT TRAP: dh = v*dP with v in m3/kg and P in MPa needs a factor of 1000, and without
  // it the compression term is 1000x too small -- which does not look wrong, it looks like a
  // nearly-incompressible fluid. Caught by the energy gate: heating a closed system raised U by
  // 7983 kJ against 12000, and the 4011 kJ gap was exactly V*dP. (2) THE CONSERVATION BUDGET
  // D5 sec 6.2 said was owed now EXISTS and is measured here: ~3e-4 relative internal energy at
  // 15.41 MPa, degrading to ~1e-3 at 1 MPa. Banded PER REGIME on purpose so that degradation
  // stays visible as D2 sec 26.3's declared low-pressure limit instead of being absorbed into one
  // loose number. THIRD TRAP, and the most general: the moment those tolerances became a budget,
  // the self-test reported FOUR NEW BLIND SPOTS -- a conservation check is INTEGRAL and can never
  // localise a defect, so reversed upwinding, heat on the wrong node and a source with the wrong
  // enthalpy all conserve energy perfectly while being wrong. The directional checks exist for that.
  // NEW 2026-08-14 (#479): Layer 3, the SLS-100 wiring. 26 checks + an 8-mutation self-test.
  // IT ANSWERS THE QUESTION LAYER 2 LEFT OPEN, by measurement rather than assertion: DERIVING the
  // junction flows sequentially (D2 sec 23.2 step 4) instead of specifying them cuts the energy
  // drift 3.9x (5.58e-5 -> 1.41e-5) AND IS STABLE -- where the same term applied as a CORRECTION
  // on top of specified flows diverged at -2.97e+12. The gate measures derived against specified
  // every run, so if deriving ever stops helping it says so.
  // TRAP: the first draft of its directional check drove 300 MW into a closed loop with NO heat
  // sink. That is not a plant, it crosses the 18 MPa property envelope in about a second -- and
  // it exposed a real solver defect, an unbounded bracket expansion that reached 1e+15 MPa while
  // reporting success. Now guarded and clamped, and the envelope is a REPORTED condition.
  // SECOND TRAP: a check asserting the loop "holds pressure roughly steady" was simply wrong
  // about the plant. A rigid all-liquid loop is STIFF (1.06 MPa for a zero-net-heat
  // redistribution) and that is exactly why a pressurizer exists; the check now asserts the
  // stiffness and that a compressible volume relieves it.
  // NEW 2026-08-14 (#479): Layer 4, located sources + the INTEGRATED loop momentum. 16 checks +
  // a 9-mutation self-test. Momentum is a declared departure from the whole educational tier
  // (nobody else solves it) justified by exactly two claims, and this gate tests both rather than
  // repeating them. (1) COASTDOWN IS DERIVED from the sourced Ginna pump inertia, and the proof is
  // the SHAPE: a rotor coasting against hydraulic torque decays HYPERBOLICALLY, measured at 3.7x
  // an equal-half-time exponential at 60 s and 11.8x at 90 s. A fitted exponential cannot match
  // both the half-time and the tail. (2) NATURAL CIRCULATION IS EMERGENT, tested as the POWER LAW
  // W ~ Q^(1/3) rather than against the recalled 4-5 % band -- which D3 sec 1a explicitly says may
  // reject but may never confirm. An exponent that falls out of elevations and densities cannot be
  // fitted by accident. TRAP: the buoyancy sign was backwards on the first write, and it does not
  // blow up -- it quietly gives a plant with EXACTLY 0.0 kg/s of natural circulation. This runner
  // is slow (~100 s) because each mutation re-runs three settles; that cost is the price of the
  // self-test and the step counts are already cut to the minimum that keeps the power law visible.
  // NEW 2026-08-15 (#479): Layer 5's first system, the LUMPED SG secondary. 18 checks + a
  // 10-mutation self-test. It makes Tier A coupling A5 -- "the SG is the only heat sink" --
  // EXPRESSIBLE for the first time: Layer 4 was handed a duty, so the sink could not be taken
  // away. Now cutting the feed makes the primary heat up because there is nowhere else for the
  // energy to go, and the gate rides exactly that.
  // THE NON-CIRCULAR CROSS-CHECK worth knowing about: overall U is DERIVED (what the sourced EPRI
  // area must deliver to move the ruled power across the ruled temperatures) and then compared to
  // a SOURCED band it was never fitted to -- 5,498 W/m2-K against 3,500-6,000. D3 sec 1a-v's own
  // LMTD attempt landed at 6,016, the ceiling, and was walked back the same day.
  // NOT BUILT HERE, DELIBERATELY: the pressurizer. #472 is rebuilding it on another lane right
  // now and D1 sec 6 says "must not race it" -- see D1 sec 25.
  // TWO TRAPS, both in the TEST rather than the model: a reversal check used a primary
  // temperature still ABOVE the secondary saturation (it could not have gone the way it asserted),
  // and the A5 ride started the primary 20 degC BELOW its design point, so the generator steamed
  // itself down and a depressurising secondary opened the dT until it was ripping heat OUT of the
  // primary. That runaway is real physics for a generator steamed harder than the primary can
  // supply -- it just was not the test being written.
  'run_pwr2_sg.js':        { code: 0, score: '32passed 0failed 32checks', secs: 14 },   // 27 -> 32 (#510 batch 1): DRYOUT — a dry SG is a NEAR-ZERO sink (wet fraction, the old engine's own 30 %-wide shape at the shared level map's 0.38845 mass point, no residual — declared), the vessel STARVES its export at the floor and EQUILIBRATES toward the primary instead of pinning the 0.1 MPa property floor as a 211 degF 1.88 GW sink, and the h backstop never binds on a fed transient. Mutations 15 -> 17 (wet fraction deleted, outflow limiter deleted — both H-1 re-armed); the Q/dH/dM anchors re-pointed.   // 25 -> 27 (#507 wave 5): the THIRD inlet stream — a tube leak lands in the mass ledger (feed 60 + leak 40 − steam 100 holds level exactly) and lands HOT (40 kg/s at primary enthalpy pressurizes the secondary where the same cold AFW flow suppresses it). +2 mutations (leak dropped from mass / from energy).  // 90 -> 340 (2026-08-16): the 90 was never measured on a quiet machine. Timed alone, twice: 341 s. `secs` is only a longest-first scheduling nudge and cannot fail anything, which is exactly why a wrong one goes unnoticed -- it just schedules a 5.7-minute runner as if it were a 90-second one.
  'run_pwr2_sources.js':   { code: 0, score: '35passed 0failed 35checks', secs: 18 },   // 34 -> 35 (#510 H-7, batch 3): THE COLD START — hydraulic torque runs as r^2 x densityRatio and cold dense water met the flat 1.5x start class at 93 % speed, a stable sub-rated stall the hot fixture could never bind; the torque now RISES to the [open] 2.0x breakdown class near synchronous speed (the induction curve's own shape) and the cold rotor pulls in (rated at 24.1 s in 121 degC water; hot restart 11.4 s, still the ~13 s class). Mutations +1 (the rise flattened — the stall replayed red) and the rated-cap anchor re-pointed.   // 31 -> 34 (#507 wave 9): THE START — the motor spins the coastdown's own rotor back (same sourced inertia; accelerating torque [open] 1.5x rated hydraulic): rated in the measured ~13 s class, flow follows, the motor HOLDS rated (never past it), and a TRIPPED rotor at rest stays at rest. Mutations 17 -> 19 (start branch deleted, rated-speed cap deleted).   // FIXTURE RAMPED (#499 guards, 2026-08-19h): the affinity fixture's instant hand-pin teleported the sealed loop 2.589 MPa in ONE step and pwr2_core's root-tracking limit refused it -- correctly; the pin now ramps over 400 steps (max 0.673 MPa/step, never latches, P still reaches the 18.000 wall) and the identity holds exact at the settled state, 0.3005 = 0.3005.   // +1 (#492, 2026-08-18): the in-corpus nat-circ capability anchor audit #488 A3 found uncited -- Ginna TS Bases "as high as 3% RTP can be removed by natural circulation alone" -- asserted as a CAPABILITY (9 MW carried with the core subcooled, 116.5 kg/s), the flow magnitude still deliberately unasserted.   // +3 (#479, 2026-08-17): mergeSources(), the concatenation point break/ECCS/CVCS all need before stepPlant.   // +4 (#479, 2026-08-17): THE PUMP DENSITY COUPLING. pumpHead returned dP_rated*r*r -- pressure rise from shaft speed alone. A centrifugal pump develops HEAD (dP = rho*g*H), so the rise scales with impeller density, and friction for a given MASS flow runs as 1/rho. Measured before the fix, 5 cm2 break, no ECCS: mdot_loop held 1630 kg/s for the whole 840 s blowdown with the core dry at 470 degC and 2.4 % inventory left -- the plant circulating rated mass flow of STEAM, so clad heat-up was 1 degC, core damage was unreachable and natural circulation could never be seen. No new constant, exactly 1 at the design density; the equilibrium that falls out is the pump-affinity identity mdot proportional to rho, checked to 1e-3.
  'run_pwr2_kinetics.js':  { code: 0, score: '82passed 0failed 82checks', secs: 3 },   // 71 -> 82 (#515 Build 3, 2026-08-26): the void/boron form — a LIQUID moderator reference (the old one was two-phase below 9.145 MPa), the boron factor floored at the sourced +5 pcm/degF envelope, the void term capped by the boron worth it can remove; theorem void + boron <= -K*deficit at 45 states; 45 mutations (was 40). The identity check is a declared REFIT (its expectation path WAS the artefact path). Earlier: 50 -> 63 (2026-08-16): the direct BORON worth term was missing entirely and the gate scored 50/50 with 25/25 mutations against it -- mutation testing perturbs code that exists and is structurally blind to a term nobody wrote. Added the term, the rho_excess solve pinned to the 975 ppm BEAVRS anchor, and a cross-module tie to pwr2_fuel's derived Doppler reference.   // +8 (#479, 2026-08-17): THE VOID HALF of the density coupling, which did not exist. moderatorReactivity takes a TEMPERATURE and rebuilds a density off the LIQUID branch, so a boiling core was invisible to it: on a depressurising plant the coolant follows saturation down and the term read 'colder, therefore denser' and inserted +3433 pcm at t=60 s of a 50 cm2 break -- five times prompt critical, power 0.8 % -> 4.7e+12 in ONE step. A PWR is undermoderated; voiding shuts it down. No new constant: the deficit is measured against saturated liquid with the same calibrated modCoeff, EXACTLY zero on a subcooled core, and measures -89.4 pcm per % void by volume.
  'run_pwr2_bases.js':     { code: 0, score: '12passed 0failed 12checks', secs: 2 },
  'run_pwr2_forwarding.js': { code: 0, score: '11passed 0failed 11checks', secs: 2 },
  'run_pwr2_fuel.js':      { code: 0, score: '73passed 0failed 73checks', secs: 2 },   // +2 (#492 D12 evidence pass, 2026-08-18): vapor_ratio upgraded [recalled]->[derived] -- WCAP-16009 Table 10-3 saturation rows (read from the page image) put the Dittus-Boelter property group at 0.403/0.495/0.550 across 502/1050/1334 psia, so 0.5 is the representative of a SOURCED band; both the 1050-psia group value and the band membership are now pinned. dittus_exp is [sourced-form]: Ginna ch15 names Dittus-Boelter verbatim.   // +17 (#479, 2026-08-17): THE CLAD BECOMES A THERMAL NODE and the film coefficient responds to the coolant, which this file's own OPEN block had declared missing since it was written. Stack split at the clad, half its conduction each side, so r_fc + r_cw == r_total to full double precision -- steadyFuelTemp, the Doppler reference and the solved gap conductance are untouched BY CONSTRUCTION. filmCoefficient(1,0) is exactly the old 30000. Clad tau 0.061 s against the fuel's 3.7, advanced by an exact 2x2 matrix exponential. Clad mass 2136 kg cross-checks to 83.6 % of GEND-061's TMI-2 zirconium scaled on power, the balance being thimbles and grids.
  'run_pwr2_loadfollow.js':{ code: 0, score: '36passed 0failed 36checks', secs: 31 },   // THE RULED §42 CRITERION A LANDED (owner ruling 2026-08-19 'Defer. A.'): pwr2_dumpctl replaces the retyped stand-in dump law (kept as record), and the acceptance is sourced-mechanism-first -- C-7 NEVER arms on the 8 % dispatch schedule (dump 0.0 % throughout, power 99.5/91.3/83.1/74.9 % at 100/92/84/76 MWe, monotone, rods MANUAL), a 50 % rejection arms C-7 with safeties SHUT, a turbine trip auto-selects the C-8 controller and walks Tavg to no-load. Below ~70 MWe the SG safeties lift VISIBLY (the rods-parked ceiling; the missing ADV rung is declared). The three 'lands where the current engine lands' comparisons RETIRED -- their same-dump-law premise expired with the ruling; A1 chain bands re-sized for the halved excursion, holding on BOTH plants.   // FIXTURE PRESSURIZED (#479 pzr, 2026-08-18): the baseline's "NOT at its design pressure, core AT SATURATION" check TURNED AROUND -- the plant now settles at 2226 psia with 45 degF core subcooling (sampled past the startup transient's heater recovery, +330 s), the A1 chain unchanged, every band held without re-fitting. #486's steady-state half is repaired at cause.   // THE ACCEPTANCE TEST: Tier A coupling A1, power follows load, rods in MANUAL. Measured 99.6 -> 54.0 % with Tavg 577.95 -> 603.92 degF against the first engine's 100 -> 57.5 % and 579.3 -> 602.1. Bands admit the declared physics differences (real L0 density in the moderator coefficient, derived rather than tuned fuel rise); they are NOT fitted to the first engine.   // +1 (#479, 2026-08-17): the BASELINE block claimed 'the plant is at its design point' and never checked primary pressure or subcooling -- it is at 11.096 MPa against 15.41 design with ZERO subcooling, and always was. Re-pointed to assert that, naming #472. A1 ITSELF IS UNCHANGED: 71.1 % / 594.8 degF and the same dump fraction with and without the new void feedback, because the load cut repressurises the primary and the core goes subcooled. The fuel-drop delta was contaminated by the baseline (94.7 -> 73.9 degC while cut.fuel moved 0.5) and is now an identity against steadyFuelTemp, which lands within 0.01 degC on both plants.
  'run_pwr2_reactor.js':   { code: 0, score: '41passed 0failed 41checks', secs: 15 },   // 4th re-measure (#515 Build 3, 2026-08-26): the climb sample 20 -> 51 s and its bound 5 -> 1 dpm — the +12 dpm / 477 % ring was the two-phase reference's spurious insertion below 1,600 psia; count unchanged. Earlier: SUR settle sample 38 -> 60 s (stage 2a, 2026-08-19): the sourced 17 % heater cut removes pressure support mid-outsurge and the unprotected adversarial scram-recovery fixture now RINGS (second excursion to 477 % at ~32 s, settled ~100 % by 56 s -- a real RPS would have tripped at the first spike); mechanism checks unchanged.   // FIXTURE PRESSURIZED (#479 pzr, 2026-08-18): the default fixture carries pwr2_pressurizer in the extraMass seat -- the saturation-riding check RE-POINTED A THIRD TIME, back to its ORIGINAL subcooled-outlet form, now true for the right reason (~2226 psia, 45 degF subcooling); the void-half check keeps a DELIBERATE rigid fixture (a boiling core is its subject); the SUR scram-recovery samples re-measured (the vessel fights the depressurisation, recovery arrives ~8 s later -- 20 s/38 s samples, mechanism unchanged).   // +1 (#490, 2026-08-18): coreRegime hands true HOMOGENEOUS VOID FRACTION onward, not quality -- the 40 % fixture cannot tell them apart (0.40 vs 0.80, both clear 0.3), so a 1.53 % quality fixture pins the 8.37 % alpha against independent volume algebra; a new mutation replays the shipped defect and reds 10 checks.   // +7 (#479, 2026-08-17): reactor period + startup rate, derived from the fission signal, no new sourcing needed -- SUR*period recovers 60/ln(10) exactly as a pure identity, and the over-cooling recovery scenario already in this file shows -3.37 dpm falling / +12.28 dpm climbing back through criticality / 0.08 dpm re-settled.   // +1 (#479, 2026-08-17): the 'core node above the loop reference' check was reading a SATURATION temperature and calling it a core outlet -- measured with the void term disabled, the fixture settles at 11.098 MPa with the core node exactly at T_sat and 3.28 % void. Re-pointed to assert saturation (passes on BOTH plants) plus a void-coefficient sizing check. The cause is the fixture having no pressure control; #472 owns it. +5 more (2026-08-17): coreRegime -- the function that tells pwr2_fuel whether the rods are being cooled -- landed with NO direct coverage and could not have got any by accident, because every fixture here runs at rated flow on a subcooled core, so a version returning 'fully cooled, no void' unconditionally agrees with all of them. Three mutations now pin it, plus a cross-module check tying MDOT_RATED to pwr2_sources.PUMP.mdot_rated (the same number written down twice, the protection-cadence failure mode).
  'run_pwr2_turbine.js':   { code: 0, score: '29passed 0failed 29checks', secs: 2 },
    'run_pwr2_dumpctl.js':   { code: 0, score: '22passed 0failed 22checks', secs: 1 },   // NEW (ruled §42 criterion A, 2026-08-19): the steam dump control system, WTSM 11.2 (ML11223A294, fetched into this lane's corpus) + WAT 05 bands -- three controllers, three arming signals, the 5 degF deadband, and the C-7 rate unit's 120 s lag DERIVED from the two sourced thresholds' mutual consistency (a 30 s guess read a clean 10 % step as 20 %/min). 8 mutations incl. 'C-7 always armed', the old engine's hidden-parallel-sink defect, none blind.
  'run_pwr2_pressurizer.js':{ code: 0, score: '85passed 0failed 85checks', secs: 37 },   // 79 -> 85 (#515 Build 2, 2026-08-26): CHOKED RELIEF — each valve an effective area from its sourced rating, the flow = area x the homogeneous critical flux of what the vessel offers (steam, or WATER from a solid vessel — 95 % of the TMI ride); 6 new checks (rated mass at the rating pressure for PORV and safeties, steam within 25 % of ideal-gas choked, flux ~ P, liquid 2-4x steam and far below the orifice law, a solid vessel relieves liquid), mutations 37 -> 40 (pressure-blind flux, solid relieves at the steam flux, the throat search never chokes); the stuck-PORV check tests the LAW at the ride's own pressure; the WATER SOLID rate window ends at the first relief step.   // 69 -> 79 (#515, 2026-08-25, owner ruling "A"): THE TWO-REGION VESSEL — steam region compressed along dh = v dP, a stratified bottom layer, a saturated pool; the seat's fill terms frozen at P_ref and the outsurge saturating (liquid first, then steam); 10 new checks (the P-only insurge ceiling +197 psi for 3.6 pts at tau -> inf, the adopted tau below it, >= 10 psi/pt, the outsurge rains out, single-phase regions, manual heaters 0.36 psi/s, manual spray -157 psi/60 s, the old-save migration); mutations 30 -> 37 (rigid seat, no steam compression, insurge into the pool, interface deleted, rain-out deleted, flash deleted, spray condenses nothing, migration skipped). REFITS, declared in the check text: the CONSTRUCTION h_bar check (two regions now), the solid poke (m_stm = 0), and WATER SOLID's "> 8x the bubbled rate" — that bubbled 0.21 psi/s WAS the softness §84 measured; replaced by the solid rate in class [4, 25] psi/s (7.5) and bubbled < solid (6.15).   // 68 -> 69 (#515, 2026-08-25, owner design): the stick ARMS and waits for a lift (pinned: armed alone = shut, cold, stuck false); mutations 28 -> 30 (arm-opens-the-valve i.e. the pre-latch build, and clear-never-releases — both red).   // 66 -> 68 (#510 H-4 + H-6, batch 2): a blackout kills AUX SPRAY (the charging pumps drive it — commanded 1.0 on a dead bus delivers 0.00 kg/s; was 29 gpm through a blackout), and each shed-arming signal EDGES INDEPENDENTLY (a LOOP arriving after an SI with the heaters re-loaded between sheds AGAIN — the old OR'd single edge never fired on the second signal). Mutations 26 -> 29 (the aux vital-bus gate severed, the OR'd-edge revert, the SI-shed anchor re-pointed to the split signal).   // 63 -> 66 (#507 waves 4+6): the NUREG-0737 shed LATCH (armed by SI/LOOP/dead-bus, cleared only by the operator's heater command — a LOOP now sheds the banks with the vital bus alive) + the two wave-6 failure seats: heaters_failed (0 kW under a standing demand, nothing shed — a third seat beside manual and the shed) and spray_stick (the porv_stick twin: full spray against a manual-zero demand, still needing RCP head). Mutations 24 -> 26; the SI-shed mutation re-anchored onto the ARMING signal.   // +3 (stage 2c, 2026-08-19): AUXILIARY SPRAY -- the CVCS path that condenses with the RCPs STOPPED (WTSM 3.2 verbatim; the capability #472 measured the old engine lacking), operator-commanded, never automatic; capacity is the CVCS charging max written down twice, TIED BY THE GATE (the MDOT_RATED pattern). Mutations 19 -> 21 (command-dead, gated-on-RCPs both red).   // +5 (stage 2b, 2026-08-19): THE TMI LEVERS -- drivers.porv_stick (one valve of two, PWR2's first failure-injection machinery), the block valve, and the tailpipe with its [open] fast-heat/slow-cool asymmetry. THE DECEPTION EMERGES UNSCRIPTED: stuck 3-11 min the level reads 100 % (hi alarm in) while inventory falls 96 -> 84 % through the valve; closing the block valve freezes the loss instantly and the tailpipe stays hot for minutes. Mutations 14 -> 19; quiet rides trimmed (the replay was >600 s).   // +12 (stage 2a, 2026-08-19): THE LEVEL CONTROL SYSTEM, WTSM 10.3 -- PI charging demand about the source's own 46/180 balance point (anti-windup capped at half the demand range; the first closed-loop probe measured the integral railing the demand with the level ABOVE program), the 25..61.5 % program over this plant's own Tavg span (the source's 557 degF no-load IS the HZP anchor), the +5 % anticipatory backup-heater signal, and the 17 % letdown-isolate/heater-cut latch with a 20 % restore differential. Closed-loop with the real CVCS: holds program, answers a 6 kg/s drain with full charging. Mutations 10 -> 14.   // NEW (#479 stage 1, owner ruling 2026-08-18 "Option 1"): the pressurizer -- WTSM Fig 10.2-3's delta ladder retyped as independent literals, the Ginna-derived per-MWt volume, compliance monotone with the water-solid collapse expressed, the sourced -17/-25 backup hysteresis and 5 % safety blowdown pinned, a balanced plant settling INSIDE the proportional band at 2238 psia (#486's 490-psi defect, gone), and the vessel drivable SOLID at 10 psi/s against 0.07 with the bubble. Three formulation failures are recorded in the module header; 10 mutations, no blind spots.   // 59 -> 63 (control switchover, 2026-08-20b): THE HR1 SPLIT -- ladder/level-PI/17%-cut on drivers.indicated_* (absent = truth, fixtures unchanged), code safeties on TRUE P; both halves proven on LIES (+120 psi lie opens the PORV with the safety shut; true 2510 psia lifts the safety over a lying-low channel). +3 mutations; one stale anchor (level_ctl rename) caught by ANCHOR MISS and repointed.
  'run_pwr2_true_state.js':{ code: 0, score: '71passed 0failed 71checks', secs: 2 },   // #511 (2026-08-24): SIX statics retired to LIVE fields (the five accumulator rows + msiv_open — the machinery exists now); two mutations re-targeted onto surviving statics (the drift and the reason-blank moved to sg_imbalance_active/'secondary').   // 63 -> 64 (#507 wave 10): the plant-mode LADDER's cold rungs — Mode 4 at 248 degF, Mode 5 at 176 degF (the rung waits on Layer 0 extending below its 0.1 MPa floor); Mode 2 folded into 3, declared. Mutations 17 -> 18 (the Mode-4 rung deleted).   // count unmoved by #507 wave 6 either: spray_stuck and afw_blocked went LIVE (their statics retired — the spray lever and the AFW discharge block are real state now) and both checks TURNED AROUND to guard the repair (the field follows the lever, and a blocked system reads RUNNING/not-delivering/blocked — three facts separated).   // count unmoved by #507 wave 4 (registry-driven checks): the 'electrical' STATIC retired — ac_available/station_blackout are LIVE fields from the facade's two-bus state; the thin-reason mutation re-anchored onto the surviving MSIV static.   // 61 -> 63 (the CVCS currency, 2026-08-21b): the contract's CVCS flow fields are the #408 fraction currency (gpm/450,000) -- the B1 shim published kg/s, which read as ~343,000 gpm and stood the CHG FLOW HI annunciator (the finish list's '120 gpm balance' was THIS, not physics; the module's own sourced-scaled 7.5+5=12.5 gpm balance was right all along). +the-450,000-literal-recovers-true-gpm and below-the-36-gpm-annunciator checks, +a kg/s revert mutation (16 -> 17).   // 60 -> 61 (the feed train, 2026-08-21): fw_flow_normalized reads the FEED MODULE, not the steam side -- pinned on a half-flow feedwater result reading 0.5 while steam_out_total stays whole (the retired feed-≡-steam identity cannot sneak back).   // 59 -> 60 (AFAS, 2026-08-20i): the demand/delivery split (#200/#329/#332 house idiom) -- afw_pump_running now reads the pumps' DEMAND, afw_active the delivery; pinned on a demanded pump with avail 0, which the old total_kgs>0 keying reported SECURED (the self-healing shape).   // 47 -> 59 (Option B stage B1, 2026-08-20d): THE CONTRACT COMPLETED -- 109/109 emitted (85 derived/translated + 19 registered STATICS + 0 missing/unaccounted). The STATIC third class: a constant stating the model TRUTH about an unmodeled system, triple-gated; the every-static-IS-a-contract-field check caught an invented name on its first run. 22 new derivations (SG levels via the adopted sourced sg_mass_map over REAL mass; H2 from the damage model own oxidation; the sump on a declared ruler; the HEM uncovery proxy D4 upheld; SR de-energizes above the P-6 class point). RHR wired into the facade (existed, gated, never instantiated). 16 mutations: 2 RETIRED as proven no-ops (empty MISSING registry), 1 replaced, 1 repointed, 4 new.   // +1 (stage 2b, 2026-08-19): porv_stuck, block_valve_open and porv_tailpipe_temp_c move to SUPPLIED (64 -> 67 of 109); spray_stuck is the failure-injection block's one survivor and its reason says why.   // +1 (#479 pzr, 2026-08-18): seven pressurizer-block fields move declared-missing -> SUPPLIED (level, mass share, heater shed, PORV, spray, both subcooling margins -- 57 -> 64 of 109); the '#472 owns it' reason check and the 'ABSENT not zero' check both TURNED AROUND to guard the repair; the four fields still missing each name their OWN blocker; trace pinned on an OFF-default 40 % vessel because the program-point fixture agrees with a fabricated 61.5 exactly.   // +1 (#491, 2026-08-18): steam_dump_valve_pct is pwr2_relief's own reported dump_demand, not 100*flow/(rated*0.28) with the current engine's capacity constant retyped untagged -- pinned on a commanded-open dump with the condenser unavailable, where the flow form reads 0 % on a 40 %-open valve.   // +1 (#490, 2026-08-18): core_void_fraction/primary_void_fraction publish HOMOGENEOUS VOID FRACTION, not quality -- pinned on a 1.53 %-quality core reading 8.37 % against independent algebra, where the shipped shim read 1.53.   // THE SHIM. 51 of 109 contract fields supplied, 58 DECLARED missing with a reason and an owning system, 0 unaccounted. Rose from 37/72 across three passes 2026-08-17 (#479): break/containment/condenser/ECCS/AFW landed as gated systems but the shim still declared them fully missing -- the SAME defect this file exists to prevent, in reverse -- plus reactor_period_s/startup_rate_dpm, newly derived. The fraction is NOT a score to raise by writing mappings -- it measures how much plant exists, and any other way of raising it is the fabrication the gate forbids.   // +8 (#479, 2026-08-17): core damage wired -- clad_temp_c, fuel_damaged, melted, destruction_cause, zirc_heat_pct. Coverage 51 -> 56 of 109 because five SYSTEMS landed, which is the only legitimate way it moves. core_uncovered_frac stays declared-missing with a REWRITTEN reason: not 'no damage model' (there is one now) but that a level needs PHASE SEPARATION Layer 2's homogeneous-equilibrium water does not have, and that machinery is #472's. Trap pinned by a new mutation: the damage block first landed INSIDE the AFW guard, so a caller with damage and no auxiliary feedwater got all five fields silently dropped. +1 (protection): `scrammed` moves from declared-missing to SUPPLIED, and the check that pinned its absence was TURNED AROUND rather than deleted -- it now guards the repair, asserting false-on-healthy AND true-past-a-setpoint so the false is earned. One mutation RETIRED as a proven no-op: it injected ts.scrammed=false before the real assignment, which now overwrites it.
  'run_pwr2_relief.js':    { code: 0, score: '42passed 0failed 42checks', secs: 1 },   // 38 -> 42 (#511, 2026-08-24): THE MSIV — sourced placement (Ginna TS Bases B 3.7.2): a shut valve zeroes the DUMP (downstream) and touches neither the safeties nor the ADV (upstream); mid-stroke passes proportionally; absent msiv_frac means open (the pre-#511 caller). Mutations 23 -> 24 (the msiv gate severed).   // +8 (the ADV, 2026-08-19): Ginna TS Bases B 3.7.4 verbatim -- 329,000 lb/hr per-MWt scaled (one valve, one loop; the source's own ~4%-of-RTP cross-check lands at 4.1 %), auto setpoint [derived] 1040 psig (the WAT-05 45-psi margin below the 1085 pop), modulating not popping, operator cooldown lever, block valve, and NOT gated on the condenser -- which is function (b)'s whole point. Mutations 19 -> 23 (auto-dead, condenser-gated, rung-inverted, block-ignored), incl. two anchors the ADV's own arrival broke, re-pointed.
  'run_pwr2_rhr.js':       { code: 0, score: '44passed 0failed 44checks', secs: 17 },   // 43 -> 44 (#510 M-11, batch 4): the duty share lands ON-LOOP only — the stagnant vessel heads and pressurizer (pwr2_loop's OFF_LOOP pair, carried as volume, never transported) get NONE, and the shares still sum to exactly the duty; 22.5 % used to land on water with no flow path to RHR, 15 % of it INSIDE the pressurizer.   // 42 -> 43 (#510 H-3, batch 3): the exchanger UA is HARDWARE — derived ONCE at construction from the design load (decay at 20 h + the measured cooldown-lineup RCP heat, design_rcp_heat_kW 1351 [derived]) = 204.08 kW/K identical on any boot plant; the lazy first-step derivation read the LIVE plant and sized the same exchanger 208.76 at-power vs 96.00 shutdown-boot, putting the 100 degF/hr limit inside the boot spread. The dead M/cp arithmetic deleted; UA-derivation mutation anchors re-pointed to designUA().   // 41 -> 42 (#510 H-5, batch 2): the pumps are motor loads — a dead bus stops them (aligned, HX open, ZERO duty; absent means powered so every fixture held). Mutations 23 -> 24 (the vital-bus gate severed).   // 39 -> 41 (#507 wave 2, 2026-08-22): valve_open/hx_fraction construction + the HX split scales duty; fixtures ported running -> valve_open (running is DERIVED from the valve now); mutations 21 -> 23 (hx ignored at construction, hx stops scaling), the running pair retargeted to the valve.
  'run_pwr2_eccs.js':      { code: 0, score: '38passed 0failed 38checks', secs: 1 },   // 30 -> 38 (#511, 2026-08-24): THE ACCUMULATOR — a tank under nitrogen, not a curve: sourced 650 psig cover (WTSM T5.2-2), two-thirds water, volume = 0.435 x this plant's own RCS volume (the #408 Ginna identity), passive (discharges through a blackout with NO lineup — sourced), check valves hold at 2235 psia, the driving head FALLS as the cover gas expands, and it empties in the sourced ~36 s class then stops (N2 injection declared unmodeled). The isolation valve is the one lever. The old pump-lineup check REFIT, declared (total_kgs now includes the passive tank). Mutations 18 -> 23 (+5: passivity severed, constant-head, check valves removed, infinite inventory, valve stops isolating); the zero-flow-source anchor re-pointed.   // 28 -> 30 (#507 wave 4): the vital-bus wire — a dead bus stops BOTH SI trains with run flags standing; absent drivers mean powered. +1 mutation (gate severed).
  'run_pwr2_cvcs.js':      { code: 0, score: '44passed 0failed 44checks', secs: 132 },   // 43 -> 44 (#510 M-1, batch 3): SI CARRIES RWST BORON — the sourced 2,500 ppm was defined and read by NOTHING; the balance now takes si_kgs/si_ppm (SI raises boron toward the RWST, and SI at the RCS's own ppm is NEUTRAL — the discriminator). Mutations 26 -> 27 (the SI term dropped: injection dilutes instead of borating).   // 38 -> 43 (#510 batch 1): the RHR low-pressure letdown path (sourced WTSM ch.19/§4.1.4.5 HCV-128 + NUREG-1431 Bases; flows the NORMAL magnitude below the orifice backpressure ONLY while the RHR suction is open, behind the operator's letdown fraction, a tie at power) + the regen HX recovery (the return arrives near the cold leg when letdown is in service, cold when isolated). Mutations 24 -> 26 (path severed — the Mode 4 water-solid defect re-armed; recovery deleted — ~200 kW parasitic cooling).   // 35 -> 38 (#507 wave 4): the vital-bus wire — charging AND seal injection die on a dead bus at full demand while LETDOWN keeps flowing (an orifice, declared); absent drivers mean powered. Mutations 23 -> 24 (gate severed).   // 30 -> 35 (#507 wave 1, 2026-08-22): THE RATE ACTUATOR — rate 0 bit-identical to untouched; an unclamped command METERED exactly; a firehose clamped to the tank-and-lineup ceiling (the closed form, not a remembered number); dilution stays PROPORTIONAL-to-C through the actuator (fast at high boron — the old "slow-at-high" wording was inverted, #510 M-9); the lab sample posts/re-arms. Mutations 20 -> 23 (inversion deleted, clamp deleted, sample never posts), all caught.
  'run_pwr2_loop.js':      { code: 0, score: '45passed 0failed 45checks', secs: 5 },   // 37 -> 45 (#518, 2026-08-26): THE PER-JUNCTION COURANT CANARY AND THE RING SUB-STEP. courantLimit divided by sys.mdot_loop -- the HEAD flow -- while donor-cell moves the DERIVED junctionFlow; identical on a healthy plant, four orders apart late in a blowdown, so a ride whose true Courant number reached 2,745 reported ZERO violations. D2 sec 17.5 ADOPTED sub-stepping and it had never been built: stepLoop now subdivides when the limit binds (measured 0.09 % cost, worst N = 3), flows re-derived every sub-step, sum exactly dt per D2 sec 24.2. New checks: the canary binds on the junction flow, courantOK can now fire, N = 1 when healthy, N calls of dt/N == one call sub-stepping N times, exactly-dt to 1e-9, convergence at dt vs dt/4. Mutations 15 -> 20.
  'run_pwr2_break.js':     { code: 0, score: '29passed 0failed 29checks', secs: 4 },
  'run_pwr2_condenser.js': { code: 0, score: '30passed 0failed 30checks', secs: 2 },
  'run_pwr2_containment.js':{ code: 0, score: '25passed 0failed 25checks', secs: 5 },
  'run_pwr2_instruments.js':{ code: 0, score: '20passed 0failed 20checks', secs: 1 },   // 17 -> 20 (#507 wave 6): DRIFT (offset += rate*dt in sim time, HR6; default the adopted 0.5/s, explicit signed rates honored) and DEAD (rails range[0], the current engine's semantic). Mutations 9 -> 11 (drift never accumulates, dead rails high).   // 16 -> 17 (AFAS, 2026-08-20i): +sg_level channel roster check (narrow range on purpose -- the lo-lo LSSS is "a percent of narrow range instrument span", TS Bases B 3.3.2) and a channel-deletion mutation; 15 channels now.   // THE INSTRUMENT LAYER (owner ruling 2026-08-20 'Do option 1'): what the plant SAYS between truth and every reader (HR1). Sourced taus pinned by MEASURED step response (RTD 2.0 s; the hot-leg 3.5 s filter proven as a CASCADE -- 63.2 % at ~6.5 s, where either single lag reads 2.0/3.5); AR(1) noise stationary-sigma + band-limit (autocorr at 8 s ~ 1/e); per-channel INDEPENDENT PRNG streams -- the pwr_instruments append-order trap engineered away and proven by injection (starving one channel leaves a sibling's noise BIT-IDENTICAL); four failure modes incl. restore-heals-to-NOW; 8 mutations all caught.
  // run_pwr2_ab.js -> measure_pwr2_ab.js (#513, owner-approved 2026-08-25): "A MEASUREMENT,
  // NOT A GATE" by its own header -- it exits 0 always, so its 300 s bought nothing that
  // could fail. Renamed out of discover()'s (run|verify)_ pattern; still runnable on demand
  // for #507 parity work. Its history: PWR2_VALIDATION.md sec 60, TUNING_LOG 2026-08-20.
  'run_pwr2_shell.js':     { code: 0, score: '77passed 0failed 77checks', secs: 43 },   // 71 -> 76 (#510 batch 4): set_boron_adjust finally lands through the shell (M-8) · clear_all_failures sweeps EVERY active row through its own per-id clear via the shared engineActiveFailures detector, levers measurably reset (M-3) · sg_overfeed is its own SEAT — MANUAL 0.5 stands through inject AND clear, no forced AUTO (M-12) · fail_low rails the BOARD at ch.spec.range (M-5) · the RHR permissive reads the INSTRUMENT and the refusal quotes "indicates" (M-2, HR1 — gated on a rail-high lie over a depressurized Mode 4 plant).   // 69 -> 71 (#510 M-13, batch 2): THE LAYERED CLEAR — an SBO injected ON a standing LOOP restores the DIESELS ONLY on clear (grid stays down, ac_available true, the LOOP row still reports — the kernel ledger and the engine-derived list finally agree), and clearing the LOOP afterwards restores the grid. The old unconditional offsite=true made the LOOP vanish from the engine while the Failures tab kept drawing it.   // 67 -> 69 (#507 wave 10): the Mode 4 preset through the class (held, SECURED, both cooldown blocks on the kernel snapshot with can_clear) and the P-11 pair round-tripping the kernel forward (un-block clears the engine request, re-block below P-11 lands). Mutations 28 -> 29 (the pair's mapping severed — the cooldown blocks would be board-unreachable).   // 64 -> 67 (#507 wave 9): THE RCP HANDSWITCH — OFF trips AND latches SECURED, ON is a real restart (flow >80 % through the class), and a CASUALTY trip reads LOST never SECURED (the who-stopped-it split; the pre-wave-9 declared LOST-only note retired with its cause). Mutations 27 -> 28 (the secured latch dropped).   // 61 -> 64 (#507 §B wave 8): the rod-limit SURFACES — live control-state fields (shutdown group stays exempt), the board layer's rod_limit_margin channel tracks the engine (was pinned at its 912 default), and ROD LIMIT LO alarms at the sourced RIL+10 in THIS bank's currency (the shared row's 40 is the same number in pwr1 fine steps, 4/step — fired 4x early without the override). The alarms check turned around to the TWO-override shape (#500's + this one; a third silent divergence still reds). Mutations 24 -> 27 (fields reverted, channel severed, override dropped).   // 56 -> 61 (#507 §F wave 7): initial_state rides the service's constructor path (the 50 % preset through the class; an unknown preset throws — the #502 rule); the block button's whole path (kernel empty-trips FORWARD -> shell -> engine request; P-10 revokes a source-level block next step; a trip this RPS lacks comes back a REASONED error; the merged snapshot carries the engine's own 35 % setpoint). Mutations 22 -> 24 (block mapping severed, setpoint dropped).   // 44 -> 56 (#507 wave 6): the menu reaches 21 — afw_failure (pumps RUNNING, delivery dead, afw_blocked live), failure_to_scram (trip latched + turbine tripped, rods at 200, power feedback-limited to 76 % — the ATWS), failed_pzr_heaters (36 kW -> 0, demand standing), stuck_open_spray (247 psi down in 120 s against fighting heaters), continuous_rod_withdrawal (drives OUT at the adopted fraction-of-travel rate, rod levers REFUSED; the shipped IC parks the bank at 200/200 so the row needs inserted rods — declared), tavg_sensor_failure (BOTH layers walk +30/60 s while the lying channel drags the TRUE plant down 25 degC through the dumps), porv_indicator_stuck_closed (mirror-only board lamp, declared). THE THREE LATENT FIXES: degraded_hpi wrote ec.avail which NOTHING reads (inert through two green runs — now hhsiAvail, flow asserted), the seal-leak slider was rendered-and-discarded (now linear, 0.45/1.21/1.81 kg/s at sev 0.25/0.67/1.0), the advanced panel's `value` key was dropped (typed freezes landed at the current reading). Mutations 19 -> 22.   // 42 -> 44 (#507 wave 5): the sgtr row — a break at the tube node at the slider's 40 % of the [UNVERIFIED] double-ended area, reported by NAME (never primary_leak), SG receiving, clear shuts the tube. Mutations 18 -> 19 (row routed to the cold leg).   // 36 -> 42 (#507 wave 4): the electrical pair through the class — LOOP row is the REAL sourced LOOP *(OWNER RULING, 2026-08-22: "Full LOOP + clear" — a selection from options I wrote)* with a working clear (grid back, RCPs stay tripped, heater shed stays latched until the operator's set_heater); station_blackout row lands (menu 12 -> 13); the TDAFW-only 0.667 delivery is the SBO's own gauge; probe trap recorded: at 5 s the feed's 8 s pump tau still reads 0.535 of rated — ride 30 s before asserting the feed dead. Mutations 17 -> 18 (LOOP regressed to pump-trip-only).   // 29 -> 32 (#506, 2026-08-22): the two-bank scram ramps sampled MID-RAMP (where the old snap and the ramp disagree most) + group routing (a shutdown nudge leaves the control bank alone) + orifice/flow_pct fields; the alarms check is copied-with-ONE-override (#500, pzr_level_low 25 -> 17). Mutations 14 -> 17 (alarm-override revert, shutdown-snap revert, flow_pct drop), all caught.   // 27 -> 29 (the CVCS currency, 2026-08-21b): +the-annunciator-input-CLEAR check and the 20-gpm setter ROUND TRIP (the B2 mapper read the board's gpm/450,000 as a 0..1 demand -- any dialed setpoint became ~zero flow, a dead control wearing a working control's face). Mutations 12 -> 14 (both currency reverts).   // 25 -> 27 (the feed train, 2026-08-21): the seven feed refusals RETIRED to MAPPED (set_feed_pump_speed/set_feedwater_flow/feed_pump_nudge/set_feed_coupled/isolate_feedwater/loss_of_feedwater/sg_overfeed), landing proven with a manual-50%-then-recouple round trip; the failures menu gains loss_of_feedwater (3 -> 4); fw + the swell scalars join the bit-exact save.   // 23 -> 25 (AFAS, 2026-08-20i): +the ONE esf_systems entry -- the afw arm the AUX FEED tile needs for STANDBY, UNDISARMABLE (commands: [], so the kernel's manual scan can never flip a word the engine's non-defeatable AFAS would make a lie) -- and +the SEAM the headless pass caught: control_kernel's channel-less getAutomationState fast path dropped the esf dict, a path ONLY PWR2's config reaches (esf_systems, no channels), so the tile read SECURED over an armed AFAS; fixed in the kernel (_attachEsf on both paths) and pinned here at the exact stack seam. Mutations 10 -> 12: the arm dropped (SECURED regression) and the arm grown a command list.   // 21 -> 23 (2026-08-20h, the indications hookup): +all-35-status-passthroughs (the {} extras defect had every board status word defaulting) and +pzr_level_dev-consistency (the gauge measured the OLD plant's program: +6.4 % standing on an on-program plant; asserted as dev == level - own-program(indicated tavg) because the fixture sits inside the known boot settle, measured -9.5 % @30 s -> 0.15 % @900 s). The 16-key control-state check tightened same change: TWO rod groups in the consumer's shape (steps/max_steps 200) + the dump controller's live 7.03 MPa setpoint. Mutations 8 -> 10: the exact shipped extras-{} defect and the one-entry rod-group revert, both replayed red.   // OPTION B STAGE B2 (2026-08-20e): PWR2Engine, the RD.PWREngine-shaped class over the facade. THE COMMAND PARTITION: all 71 actions parsed from the CURRENT engine's own switch land in exactly one of MAPPED/REHOMED/REFUSED, refusals reasoned and THROWING (a silent swallow reads like survival). getProtectionConfig SUPERSEDES the courier (B3: the pwr automation channels would issue REFUSED-throwing commands; acting parts emptied, annunciators adopted, menu = 3 hostable defs; +1 leak mutation). REUSED pwr_instruments member (D4) fed by the B1-completed contract -- reset() must PRIME the lag buffers (measured: NaN across all 45 channels without it). SAVE pwr2-1.0 only, pwr-1.0 REFUSED with the D4 sec 5 fabrication reason; round trip BIT-EXACT over physics AND readings. Two fixture lessons the mutations forced: the frozen-gauge mutant needs a MANEUVER (a 2-degC band on a steady plant cannot see a frozen needle), and the readings-save mutant needs the 700 s settle -- at 400 s the prop ladder is RAILED full on truth and indication alike and the mutant is invisible (a fixture's operating point is part of what a check asserts).
  'run_pwr2_endurance.js': { code: 0, score: '20passed 0xfail 0failed', secs: 85,   // 18 -> 19 (#515 Build 3, 2026-08-26): loca-sev1-eccs-30min — reactivity never positive after the scram (born failing at 572 %); the inner guard's latch at 161 s is REPORTED, not asserted (#517)
    note: 'THE LONG WINDOWS (#510; owner directive 2026-08-23 "fix your acceptance windows first"). Settledness is EQUILIBRIUM — rates as the LEAST-SQUARES slope over the ride\'s final window (batch 1: the endpoint pair read the Mode 4 heater limit cycle\'s phase as −39 psi/hr drift on a flat mean; the window is half the ride, the hot ICs\' own fraction) PLUS position against the boot point (bands\' provenance: the 2-h HFP probe, quoted in the runner) — never a value band sampled where a monotone transient starts. 9 -> 13 passed (#510 batch 1, 2026-08-23): H-1 x2 and H-2 x2 PROMOTED — the dry-SG wet-fraction collapse + outflow-limited ledger, the RHR low-pressure letdown path + forced circulation + the cold lineup\'s heater hold, the signed sgDuty and the surge-line energy conservation. 13 -> 17 (#510 batch 2, 2026-08-24): the electrical completion sweep promoted — aux spray and the RHR pumps carry the vital-bus wire (H-4/H-5), the shed latch edges per actuating signal (H-6), and a dead condenser trips the turbine, sourced Ginna UFSAR ch.10 §10.1.3.1 (M-6). 17 -> 18 (#510 batch 3, 2026-08-24): H-7 promoted — the torque class rises toward breakdown near sync, a cold start pulls in at 24.1 s. EVERY #510 ENDURANCE DEFECT IS FIXED; the XFAIL map stays for the next born-failing entry, strictness unchanged. STRICT both ways: a fix landing without promoting its xfail reds this runner (UNEXPECTED PASS). No injection self-test — every xfail IS a live red, and each mutation would re-ride hours of sim. Its own first run caught two of its own checks (a vacuous field read, a fixture the 17 % low-level cut satisfied) — the convention works on itself.' },
  'run_pwr2_engine.js':    { code: 0, score: '94passed 0failed 94checks', secs: 139 },   // 91 -> 94 (#515, 2026-08-25, owner design): THE STICK IS A LATCH — arming lifts nothing (pinned), the operator's porv_manual lift latches it, a manual close does not move a latched valve, the clear is the only release.   // 90 -> 91 (#510 batch 4): a SCRAM exempts the rod insertion limit — mid-decay (rods driving in, power still above the 5 % floor) the limit reads null, so the ROD LIMIT annunciators no longer fire on every trip; the RHR-align fixture RETRIES its command (the M-2 indicated door's 0.5 s lag silently refused a one-shot at the exact crossing); the M-2 door/autoclose anchors re-pointed.   // 84 -> 90 (#507 wave 10, group N): THE SHUTDOWN IC — Mode 4 opens ON its point (121.1 degC / 364 psia / level 30 / boron 999, blocks taken, RHR held-throttled) and holds; THE #468 INVERSION IS A MUTATION (bank-before-trim pays the margin in boron and the cold plant reads LESS than hot standby — the check pins 999 > 719); the heatup is real (87.9 degF/hr on pump heat, untripped); clearing the P-11 blocks at 350 psig CASCADES; engaging either above P-11 is REFUSED. Mutations 51 -> 55 (the inversion, blocks forgotten at boot, the hold throttle dropped, the refusal severed).   // 82 -> 84 (#507 wave 9, group M): THE RCP RESTART — a coasted pump motors flow back above 90 % inside the start class on the operator command; the start is REFUSED out loud on a dead nonvital bus (WTSM 3.2) and LANDS after the grid returns (recovery hands back a stopped pump — nothing auto-restarts). Mutations 50 -> 51 (the electrical gate severed).   // 77 -> 82 (#507 §B wave 8, group L): THE ROD INSERTION LIMIT — the adopted pwr1 curve (null at/below 5 %, 140 steps at rated, control bank only); Hot Standby's inserted bank stands NO alarm (the applicability floor's whole point); the curve RECEDES with power so a plain insertion never closes the margin (measured: insert to 145 -> power 85.8, limit 121, margin OPENS to 24) — the honest approach is rods-in + dilution (margin <10 at +35 s; at-limit at +55 s as the recovering power lifts the limit to the bank). FIXTURE LESSON kept in the comment: securing the dilution before the final insert reddened the gate on its own fixture, not the plant. Mutations 46 -> 50 (curve deleted, floor deleted, at-limit pinned, margin pinned).   // 68 -> 77 (#507 §F wave 7, group K): THE INITIAL CONDITIONS — 50 % opens ON its point (50.0 % / 298.08 degC / SG 958 psia / level 43.2) and rides to min 48.79; Hot Standby anchors to the plant's OWN no-load (Tsat of the sourced 1005 psig = 547.9 degF — the 557 degF program anchor saturates ABOVE the 1085 psig MSSV pop, measured, #508) with the sourced lineup (control bank IN, shutdown OUT, dumps in PRESSURE mode) and holds +0.05 degC/120 s; a continuous fast pull IS the startup accident (1 % -> 100.8 % inside the trip delay, hi_flux_lo answers); the CONTROLLED startup passes 35 % on the block taken at 18.2 % (42.6 % untripped); P-10 auto-revokes a source-level block; an unknown preset THROWS. Mutations 41 -> 46 (SG at the full-power literal, kinetics seeded full regardless, subcritical margin dropped, the 557 anchor, the dump lineup dropped).   // 64 -> 68 (#507 wave 6, group I): THE FAILURE LEVERS — a blocked scram LATCHES the trip (annunciated, turbine tripped) with the rods standing at 200 (the ATWS is the DROP failing, not the logic); a rod runaway drives OUT at its own rate with the rod levers REFUSED, and a WORKING scram beats the drive. The probe FOUND A REAL DEFECT: reset_protection never re-armed the trip-edge detector (_lastTrip lagged true), so reset-then-scram missed the edge — latch on, annunciators on, rods standing; fixed in the reset. Fixture lesson kept in the comment: a 50-step insert at full load lets the RPS terminate the excursion mid-probe (UFSAR 15.4's own story — a different claim than "the drive moves"). Mutations 38 -> 41.   // 58 -> 64 (#507 wave 5, group H): THE SGTR — a break at sg_primary discharges into the SECONDARY against the SG's own pressure: initial 20.9 kg/s at the default 40 % rupture (full DER ~52; the "1982 Ginna ~48" comparison is RECALLED/UNVERIFIED (#510 M-15)), the SG OVERFILLS (mass frac 1.23 at 300 s — the sourced §15.6.3 hazard the old engine never landed), OTdT trip + SI arrive unscripted, containment NEVER moves through 3,037 kg discharged (the bypass signature), and the leak tapers on sqrt(dP) (ratio 0.301 vs 0.335 — the EOP's physics). A new break REPLACES the tube (one-break slot, declared). Mutations 34 -> 38 (backpressure cut, stash severed, SG never consumes, exclusion dropped); the group-E AFW-stream anchor re-pointed (the SG drivers grew the tube-leak pair).   // 47 -> 58 (#507 wave 4, group G): THE ELECTRICAL PAIR, one probe per wire — LOOP kills the nonvital loads with selectors standing (feed 0.000, condenser lost, RCPs tripped, ac_available TRUE) and starts both AFW pumps (afw 1.000; md cause loss_of_main_feed is the same-step race AND the feed wire's gauge); the heater re-load pair is the vital bus's own gauge (LOOP re-load >100 kW, SBO re-load 0 kW); SBO reads afw 0.667 = the TDAFW-only fraction; a blackout mid-LOCA STOPS SI and restore resumes it; manual charging 6.5e-5 frac/s in LOOP vs 0 in SBO (the PLCS wants 0 in both — level 40 % over the post-trip 25 % program — so the probes force manual demand to stay non-vacuous). Mutations 28 -> 34 (six wire cuts; a seventh — blackout-forgets-offsite — was REJECTED as unkillable: offsiteOk already ANDs !blackout).   // 45 -> 47 (#507 wave 2, 2026-08-22): THE RHR ALIGN through the plant — a 20 cm2 LOCA below the 425 psig permissive, aligned tavg 133.9 degC at t=80 vs 150.3 secured (the heats merge is the subject; the merge-dropped mutant's removed_kJ ledger still climbs, only the PLANT tells the truth) + the door refuses an at-power align and the 585 psig autoclose shuts a forced valve. Mutations 26 -> 28 (merge dropped, permissive ignored), all caught.   // 41 -> 45 (the settled IC #502, 2026-08-21, group A): SETTLED IC — a fresh engine ridden 60 s untouched holds power >= 97 % / legs within 4.5 degF of settled (reds at 76.6 % on the isothermal boot); THE QUIET WIRES — three probes for the mutations the settled IC sent blind (the startup ring had been doing their sensing): a stuck PORV takes real mass out (dM -136 vs -11 kg mutated), letdown moves charging demand (0.074 vs 0.000), a turbine trip opens the dumps (75.7 vs 0.0 %). The runback fixture re-scripted quasi-static (-1 ppm/block — the old -2 overshot the band within the detection block and its standing OTdT condition matured the trip delay during the rod-stop test, dt 0.02 only).   // 33 -> 41 (the feed train, 2026-08-21, group F): the controller holds the ruled 65 % at power; the A/B load swing moves TRUE level and comes home; ONE pump = a REAL boil-down to the lo-lo trip + both AFW starts (97.6 s measured) with the anti-windup recovery pinned (the pre-fix refill hit 17,033 kg); BOTH pumps = the whole ch10 sentence (turbine trip, P-9 reactor trip, MDAFW on the loss); a manual overfeed reaches hi-hi (fwi + isolation + turbine trip); a scram SHRINKS indicated level 19.5 points below true (the adopted instrument-side downcomer term). +1 in group E: the held SI isolates main feed through the facade wire. Mutations 21 -> 26.   // 26 -> 33 (AFAS, 2026-08-20i, group E): the caller's half of the AFW starts -- a failed-LOW sg_level channel starts BOTH pumps and trips the reactor on the lie; the water is REAL (SG mass +326 kg in 60 s against ~326 rated -- the merge, not the report); secure-while-latched refused; reset clears latches without securing pumps; each pump's own switch works after; SI starts the MDAFW only. Mutations 15 -> 21 (both consumption wire-cuts, the inert-stream revert, the driver cut, reset leaving latches, the TDAFW switch cut), all caught.   // 21 -> 26 (runback, 2026-08-20c): the full sourced loop -- a quasi-static dilution (-2 ppm/2.5 s; ANY step prompt-jumps power toward the hi-flux trip) walks OTdT into the 3 % band; the ROD STOP refuses outward and allows inward; the runback nibbles 5 MWe per 30 s window; rods-in recovers the margin, the signal clears, NO trip. Measured identity: without the operator this rods-MANUAL plant trips ~51 s after onset (the load cut RAISES Tavg ~1.1 degF/MWe and K3 erodes the setpoint faster than delta-T recovers -- the runback buys TIME, not equilibrium). MUTATION REPLAYS NOW SECTION-SCOPED (groups A-D): 17 x the whole suite measured 1074 s of contention and a mutation only needs the checks built to see it. The scoping EXPOSED four latent self-test defects, all fixed: a turbine-flag anchor that had been cutting the DUMP CONTROLLER's identical line since birth; a delta-T mutation that left the ternary's truth branch live; a ladder probe vacuous under the ~330 s startup pressure dip (now a HIGH lie -- spray+PORV answer only that); an oxidation mutation caught only by chaos (now a designed eng._Qox observable). The stuck-Tavg fixture: C-8 chases the stuck 578 degF reading and drags the TRUE plant to 406 degF -- an instrument-driven overcooling casualty.   // 19 -> 21 (control switchover, 2026-08-20b): the heater ladder drives FULL on a lying-low pressure channel at +1 s (the RPS answers the same lie at +2 s and sheds -- read EARLY on purpose); a lying-high Tavg opens the dumps to 100 % and OTdT trips on the same railed channel (lumped-channel common-mode, DECLARED). +2 wire-cut mutations (pressurizer ladder, dump controller).   // 18 -> 19 (instruments, 2026-08-20): THE LYING CHANNEL -- fail primary_pressure LOW on a fresh healthy plant and the RPS trips + injects on it (lo_pzr_press + SI, true P 2224 psia); the reads-truth mutation is exactly the wiring this check reds. All RPS analog drivers now come from ins.reading (one step old, the house lag convention); truth fills the FIRST step only, before channels energize. All 18 prior checks held through the switchover unmoved.   // 17 -> 18 (OTdT wiring, 2026-08-19k): delta_t_frac (loop split / DT0_C 31.1, [derived] from the sec-43 design point) and tavg_c reach the RPS; the settled OT margin reads ~0.3 and the check needed the SETTLED plant (at t = 5 s the startup transient's delta-T overshoot reads margin 0.013 -- measured, and the comment says so). +1 mutation (the delta-T wire cut). eng.rpsReport exposes the function report.   // 16 -> 17 (P-9, 2026-08-19i): the wiring half of the turbine-trip reactor trip -- turbine_tripped and dump availability reach the RPS from the facade; the setpoint logic lives in run_pwr2_protection. +1 mutation (the turbine flag never connected).   // 14 -> 16 (#499 FIXED, 2026-08-19h): two guards in pwr2_core, both thresholds MEASURED -- a root-tracking limit (P_JUMP_MAX 2.0 MPa/step; worst legit move 0.67 on a 500 cm2 first step, the defect jumped 6.1) and a both-walls latch (nodes on BOTH envelope walls at once; the benign 50 cm2 episode has 45,087 clamped steps and ZERO two-sided). The 40 cm2 ride now latches at 46.9 s instead of NaN at 68.5; the drain fixture forces the pre-fix turbine wiring to keep the trajectory reachable and pins maxStep < 2.0 so deleting the limit reds on the teleport itself. +2 core mutations via loadAll's coreSource substitution.   // THE FACADE (owner ruling 2026-08-19 'A', the preview-page route): pwr2_engine assembles the gates' hand wiring ONCE; the central claim is EQUIVALENCE against a hand-retyped copy of run_pwr2_loadfollow's ride (bands admit the declared differences: the facade runs CVCS and a slewed rod bank). Every command lands with an observable effect; the caller-half of Hard Rule 5 is pinned (a 40 cm2 break trips and scrams UNCOMMANDED, SI starts the ECCS; 30 s window -- riding deeper reaches #499, the near-floor h-oscillation the beyond-model latch cannot see). THE PUSHBUTTON section pinned a real facade defect on arrival (measured 2026-08-19): 'scram' bypassed the RPS -- scrammed stayed false, the turbine kept pulling 100 MWe from a 2 % core, and the -240 F/min cooldown drained the pressurizer into an unlatched solver root-jump at 1724 psia (#499 thread, second instance). Now: manual trip is an RPS input (Ginna TS Bases B 3.3.1 Fn 1), the turbine trips with the reactor (UFSAR ch15, 'zero delay is assumed'), and the scram ramp is monotone-down (a second trip edge can never move rods OUT). 8 mutations, all caught.
  'run_pwr2_loca.js':     { code: 0, score: '17passed 0failed 17checks', secs: 1 },   // 14 -> 17 (#511, 2026-08-24): the ACCUMULATOR joins the joint ride — pumps OFF, a 0.004 m2 break, and the passive tank empties itself (10,187 kg) with the mass closure EXACT (primary net = discharged - injected to 1e-6) and containment blind to the injection.   // FIXTURES PRESSURIZED (#486 close-out, 2026-08-19): the mass-ledger claims are identities and held untouched; ONE band re-measured -- HHSI start 3.0 -> 30 s, because the vessel now outsurges against the blowdown and holds the plant above the shutoff head for a measured 12.0 s, the SI-delay role a real pressurizer plays in a medium break.   // JOINT: break -> containment -> ECCS, added 2026-08-17 (#479). Mass bookkeeping closes to 1e-6 relative in both directions; ECCS starts injecting at t=1.10s, the moment P crosses the 9.58 MPa HHSI shutoff head -- physics-timed, not scripted.
  'run_pwr2_lossofload.js':{ code: 0, score: '9passed 0failed 9checks', secs: 60 },   // NEW (#515, 2026-08-25): THE SOURCED SPIKE — Ginna UFSAR ch15 §15.2.2 / Table 15.2-1 through the shell facade: Case 2 (no spray/PORV/dump, feed lost, the P-9 channel failed) trips on HIGH PRESSURIZER PRESSURE with 2425 psia indicated at 6.3 s (Ginna 5.4 from 2190; band 3.5-8.0), rods 8.4 s, safeties 7.1 s, peak 2502 psia, not solid; Case 1 (spray + PORV auto) never reaches 2425 and the PORV passes at 4.8 s. Mutations 2 (tau -> 0 = the old equilibrium vessel; a rigid steam space), both red. Born failing on the old vessel (2425 never, trip never, peak 2254).
  'run_pwr2_coredamage.js': { code: 0, score: '23passed 0failed 23checks', secs: 19 },   // FIXTURES PRESSURIZED (#486 close-out, 2026-08-19): the LOCA scenarios ride the staged pressurizer -- the vessel outsurges into the break and empties at 22 s (20 cm2), every milestone shifts a uniform +5..11 s (2200 degF 636.6 -> 646.6 s; feedback acceleration 344 -> 356 s), the 5 cm2 slow leak is fought ~150 s longer, and ALL 20 CHECKS HELD WITHOUT A BAND MOVING -- the ordinal/mechanism design absorbing a deliberate fixture change. Relief wired as the one-step-lag sink (never fires in a blowdown; wired-and-silent beats unwired).   // +2 (#487, 2026-08-18): the endgame -- the filed 5 cm2 NaN no longer reproduces at HEAD (the pump density coupling changed the endgame: the plant drains to 0.08 % and FLOATS at 0.108 MPa, finite), so a third 1800 s scenario pins the cure, asserting the run genuinely reaches the floor region AND stays finite there. secs 90 -> 135 for the extra ride.   // THE JOINT DAMAGE CHAIN, added 2026-08-17 (#479). break -> void -> LOOP FLOW COLLAPSE -> film coefficient collapses -> clad heats -> Baker-Just -> its heat goes BACK into the clad -> it accelerates. That last feedback is the only thing no single-file gate can see. Measured, 20 cm2 break, no ECCS: void 108 s, flow under 5 % at 131 s, GEND-061's 1200 degF at 334 s, Ginna's 1800 at 507, the 50.46 limit at 637 WITH feedback against 981 WITHOUT -- 344 s earlier, and 100 % of the cladding consumed against 15.4 %. No mutation harness by design (every library has its own); the defence is closure -- energy = 1510 cal/g on the Zr consumed to 1 kJ in 13,497,322, hydrogen and mass to 1e-9. TIMES ARE NOT A CLAIM (the low-flow film coefficient is unsourced) and neither is the terminal 100 % (nothing models relocation or quench; TMI-2 stopped at ~45 % because injection was restored).
  'run_pwr2_protection.js': { code: 0, score: '102passed 0failed 102checks', secs: 45 },   // 96 -> 100 (#507 wave 10): P-11 — a BLOCKED 350 psig shutdown plant latches nothing for 30 s; the same plant UNBLOCKED cascades (why "block SI" is a procedure step); climbing above P-11 REVOKES both requests (the P-10 revoke-not-gate law); lo_flow gains its sourced P-7 gate (secured RCPs are not a loss-of-flow accident — latent until the first RCPs-off IC). Mutations 51 -> 55 (revoke deleted, either block severed, the P-7 gate dropped).   // 95 -> 96 (#507 wave 4): the loss-of-offsite-power AFW start — BOTH pumps, cause loss_of_offsite_power (ch10 "all three preferred" on the one-of-each lineup); the sec-62 deferred start is closed. Mutations 49 -> 51 (start dropped, start reaches one pump).   // 90 -> 95 (the feed train, 2026-08-21): +the hi-hi (P-14 class) kind-'fwi' row -- its OWN latch, neither trip system (installed 0.90 [adopted], consequences sourced Table 15.0-6 + WTSM 3.2) -- and +the loss-of-main-feed MDAFW start (ch10, a STATE signal like turbine_tripped). Mutations 44 -> 49.   // 79 -> 90 (AFAS + the lo-lo trip, 2026-08-20i): ONE bistable, TWO consumers (TS Bases B 3.3.1 Fn 13: the trip Function "also performs the ESFAS function of starting the AFW pumps") -- the sg_lolo_level row trips the reactor AND latches afas_mdafw/afas_tdafw; SI starts the MDAFW only (ch10); setpoint is the INSTALLED 17 % NRS (ch10 sec 10.5.3.1.3), not the 0 % analysis limit, with the table's 2.0 s delay; the single-SG collapse declared. The header's "not buildable" paragraph was an EXPIRED PREMISE (B1's sg_mass_map gave the shim a real sg_level_pct) -- rewritten. Mutations 37 -> 44 (setpoint drift toward the analysis limit, zeroed delay, row deletion, consumer disconnect, SI->TDAFW cross-wire, SI->MDAFW drop, reset leaving latches), all caught.   // +7 (stage 2b/c, 2026-08-19): THE HIGH PRESSURIZER LEVEL TRIP -- Ginna's 87 % (TS Bases B 3.4.9) gated by P-7 (WTSM 10.3.4.3, at-power >= 10 %), and P-7 is deliberately a PLAIN GATE, not a revoked request: there is no operator anywhere in it, so the P-10 revoke lesson does not transfer. Both gate sides pinned (92 % level at 5 % power does not even assert; the same level at 12 % trips on this function alone), absence-of-reading reports UNAVAILABLE, and three new mutations (P-7 deleted, setpoint drift, function deleted) all red. Mutations 24 -> 27.   // THE REACTOR PROTECTION SYSTEM, added 2026-08-17 (#479). Every setpoint is a row of Ginna UFSAR ch15 Table 15.0-6 with that row's own analysis delay: 2425/1775 psia pressurizer, 35 %/118 % flux, 87 % loop flow, 1715 psia and 327.7 psia (lead/lag 12/2) safety injection, 155 % steam flow. P-10 at 8 % RTP gates the low flux block and REVOKES it on the way down (Ginna TS Bases) -- a permissive-gated enable that always auto-reinstates, never a defeatable trip. It REPORTS and LATCHES; it does not move rods (HR5, the pwr2_relief split). Overtemperature delta-T is deliberately absent: NUREG-1431 has the equation with every constant a [*] COLR placeholder, Ginna has the constants with K2/K3 units TRANSPOSED against those symbols -- having the constants is not having the equation.   // 75 -> 79 (runback, 2026-08-20c): THE APPROACH SIGNAL -- 3 % below either delta-T setpoint asserts rod_stop + runback [sourced ch7 sec 7.2.3.2.1], hysteresis 3.0/3.5 % ([open] anti-chatter: measured without it, noise flicker restarted the pulse timer and the 1.5/30 duty cycle degenerated to continuous ramping). Fixtures at Tavg +10 degC ON PURPOSE: at T-prime every point in OT's band is past OP's whole setpoint and the first clear-check redded on its own fixture. +3 mutations.   // 68 -> 75 (OTdT/OPdT, 2026-08-19k): the delta-T pair, every coefficient UFSAR ch15 Table 15.0-7's (found in corpus -- the 'blocked on a source' status was FALSE); computed setpoints via spFn, missing-input -> UNAVAILABLE never silently-static; f(delta-I) is SOURCED ZERO (lumped core delta-I = 0 sits inside the table's -14/+6 deadband); OP's K5 rate term omitted-declared (its tau is COLR-resident). +4 mutations (drop the K3 term / drop the K2 term / static fallback / K1 drift). Full-chain: an uncontrolled dilution at rods-MANUAL 100 % is terminated by OTdT at t = 2246 s after exactly the 16.4 degF Tavg rise K3 predicts -- UFSAR 15.4.4's own credited trip.   // 64 -> 68 (P-9, 2026-08-19i): the turbine-trip reactor trip, both sourced values -- ~50 % RTP with the Steam Dump System available, ~8 % without (TS Bases B 3.3.1 Fn 18d), trip wording Fn 14. Four checks (trips at 100 %; does NOT at 40 % with dumps; DOES at 40 % without; p9_met reports the selected value) + 3 mutations. No below-8 % no-trip case EXISTS: there the P-10 block auto-revokes and the low-flux trip fires first -- the plant working, not a gap.
  'run_pwr2_damage.js':    { code: 0, score: '45passed 0failed 45checks', secs: 1 },   // CLAD OXIDATION AND CORE DAMAGE, added 2026-08-17 (#479). NOTHING IN IT IS FITTED: Baker-Just with both constants and its 1510 cal/g heat of reaction (Ginna UFSAR ch15, mandated by 10 CFR 50 App K), the stoichiometry stated in words by GEND-061, the UO2 melting point, and all three 10 CFR 50.46 criteria -- every one quoted from the corpus. The gate checks the law REPRODUCES ITS OWN SOURCES at points they state independently of it: negligible at GEND-061's 1200 degF onset (0.066 %/100 s), appreciable at Ginna's 1800 degF (1.78 %), 7.04 % at the 2200 degF limit against 50.46's own 17 % ceiling -- with NO onset threshold in the code, only an Arrhenius exponent. A non-finite temperature now THROWS rather than latching: measured on a 20 cm2 break WITH emergency injection, the plant is held cool and undamaged for 1250 s, then reaches the 0.1 MPa property floor (#487) and the temperatures diverge -- and the latches reported DAMAGED and MELTED on a plant whose state had been lost.
  'run_pwr2_afw.js':       { code: 0, score: '25passed 0failed 25checks', secs: 1 },   // 23 -> 25 (#507 wave 6): THE DISCHARGE BLOCK — the TMI-2 tagged-shut valves dead-head BOTH trains while every run flag stands; re-opening restores delivery at the standing demand (#200). Mutations 9 -> 10.   // 19 -> 23 (#507 wave 4): the electrical SPLIT — an unpowered MDAFW delivers 0 with its run flag STANDING (#200 split) while the TDAFW delivers rated through the same blackout (WTSM 5.7.5's sourced survivor, enforced by the signature having no td power driver). Mutations 7 -> 9 (gate severed, gate landed on the turbine pump).
  'run_pwr2_feedwater.js': { code: 0, score: '29passed 0failed 29checks', secs: 1 },   // 26 -> 29 (#510 M-12, batch 4): THE OVERFEED SEAT — a failed-OPEN regulating valve drives the 1.2 two-pump ceiling past a MANUAL 0.5 lineup with the selector and demand UNTOUCHED; the clear hands back the standing lineup; isolation still beats the failed valve (the FWI trips the pumps too, declared). Mutations 13 -> 14 (the seat severed — the row inert); the isolation/capacity anchors re-pointed.   // 24 -> 26 (#507 wave 4): the NONVITAL grid wire — power_ok false takes capacity to 0 and reports main_feed_lost with BOTH selectors still on (#200); absent means powered. Mutations 12 -> 13.   // THE FEED TRAIN, added 2026-08-21 (#479, owner: "Due next as recommended"): feed ≡ steam RETIRED. Two 60 % pumps (ch10), one regulating valve, the sourced three-element controller (WTSM 11.1 structure: flow error + a 5 s-lagged level through a 2-minute-integral PI -- both time constants sourced; gains [tune], arbitrated by the stability pass), the ruled 65 % program (#355 adopted; Ginna ch15's 52 % NRS declined-declared as the analyses' modeling value), SI feedwater isolation behind the sourced 32.0 s, and the anti-windup PAIR the smoke ride proved load-bearing (rail-inhibit + a 0.25-flow-fraction cap; without them a one-pump boil-down banked ~100 s of error and refilled the SG to 100 % NR). 12 mutations, all caught.   // AUXILIARY FEEDWATER, added 2026-08-17 (#479). Ginna UFSAR ch10/ch15: 170 gpm/MDAFW, TDAFW = 200% of it, 70 degF design temp; POWER-scaled (decay-heat duty); one MDAFW + one TDAFW for this single-loop plant. No sourced pump curve, so afw_discharge_pressure_mpa and afw_blocked (no CST inventory) stay declared-missing.
  'run_pwr2_core.js':      { code: 0, score: '47passed 0failed 47checks', secs: 2 },   // 46 -> 47 (#518 held-snapshot, 2026-08-26): the two blowdown latches move BEFORE the commit, so a latching step adopts NOTHING and the held plant is the state it started from — it used to be the very step the guard rejected (measured: last good 17.6 psia, held 14.5, the floor). The root-jump guard always did this. Mutations 22 -> 23.   // +2 (#487, 2026-08-18): the beyond-model latch -- a solve pinned at the 0.1 MPa floor with clamping nodes latches sys.beyond_model and every later step HOLDS (state frozen, simTime flowing) instead of going NaN; driven by a sink the plant cannot produce, and two mutations (latch deleted / hold announced-but-not-performed) both red.   // +6 (#479, 2026-08-17): THE ENTHALPY ENVELOPE. The node enthalpy state had no bound while every reader clamped, so a core boiling dry ran h to 1e+304 and then NaN -- the whole plant NaN 62 s into a 50 cm2 break, invisible because T_from_h/rho_from_h saturate and the gauges stayed plausible. Clamped inside F(P), not after the solve (outside it, the solve balances one set of densities and the state holds another). Reports enthalpyClamped / enthalpyDiscarded_kJ.   // 44 -> 46 (2026-08-20g): the #499 inner guards MIGRATED here from the facade gate -- the control/instrument switchovers moved its trajectories into the kinetics-runaway family so the inner guards never fired there and their mutations went blind. Direct synthetic states now: a hand-moved mass (rootJump 3.0 MPa refused/held) and an asymmetric-volume both-walls fixture (THREE fixture generations died to other guards masking the mutation -- pre-placed walls mix back inside; symmetric heats move the projection into the floor/root-jump guards; tiny heated nodes + huge anchor nodes isolate the walls latch at a steady 5.1 MPa). +2 mutations.
  'run_pwr2_geometry.js':  { code: 0, score: '33passed 0failed 33checks', secs: 1 },
  // NEW 2026-08-15 (#479): the ruled (quality, P) specific-volume table -- D2 sec 23.4, ruled and
  // never built, and D1 sec 26 measured what not having it cost: the whole stack missed its own
  // performance stop condition by 103x with the entire deficit in rho_from_h. MEASURED: 31,500 ns
  // -> 107 ns per call, 294x, taking property cost from 600 steps/s to ~71,000 and CLEARING the
  // 61,700 the budget needs. Accuracy inside the declared envelope: operating 0.052 %, dome
  // 0.005 %, against a ruled 0.06 %.
  // THE STRUCTURE IS NOT A PLAIN 2-D GRID, and the reason is a measurement: a plain grid read
  // 0.33 % INSIDE THE DOME, where v is exactly linear in quality and the answer should have been
  // exact. The error was in the PRESSURE direction. So the dome is spanned by its two edges
  // (v_f, v_g on a fine 1-D grid) and computed analytically; only the wings are 2-D, stored as a
  // RATIO to their own saturation edge so the steep pressure dependence lives in the 1-D table.
  // TRAP WORTH THE LINE: a sweep reported 0.30 % subcooled that NO grid refinement moved -- not 3x
  // the x-lines, not 3x the pressure lines. The worst point was 6 degC water, BELOW Layer 0's
  // declared 20 degC liquid floor, where its correlations clamp. The table was being blamed for
  // reproducing a clamp faithfully. Probing outside a declared envelope manufactures defects.
  'run_pwr2_vtable.js':    { code: 0, score: '24passed 0failed 24checks', secs: 14 },
  // NEW 2026-08-25 (#514): the END-TO-END step-cost gate. The engine shipped at 1,090 us/step —
  // 51x the old engine, 68x its own D1 §26 budget, compute-bound above ~18x fast-forward — and
  // no gate could see it: run_pwr2_vtable times property calls, not the step. #514 wired the
  // vtable into the 4 modules bypassing it, tabulated T_from_h (40-iter Newton -> 2 array reads,
  // 0.009 degC worst in the operating band) and P_sat (80-iter bisection -> direct index),
  // warm-started the containment flash + SG pressure solves, deduped primaryTavg (3x/step -> 1)
  // and the true_state node scans: 1,090 -> ~85 us/step, 12.5x. Asserted as a RATIO to the old
  // engine (<= 8x; measures 4.1x) for run_pwr2_vtable's contention reason; absolutes REPORTED
  // only. Also pins the #514 lazy vtable build (0.5 s at page load, paid by every player, PWR2
  // selected or not -> first use) and self-tests by injecting a 51x-class slowdown.
  'run_pwr2_perf.js':      { code: 0, score: '4passed 0failed 4checks', secs: 2 },
  'run_pwr2_water.js':     { code: 0, score: '255passed 0failed 255checks', secs: 2 },   // +11 (#490, 2026-08-18): voidFraction(h,P) added -- HEM alpha from quality, pinned at three pressures against independent volume algebra plus the identity rho_from_h == (1-alpha)*rho_f + alpha*rho_g; mutation 'voidFraction returns QUALITY' replays the shipped defect, 10 checks red. Mutation set 26 -> 27.   // 164 -> 231 (2026-08-14, second pass): hardened after an INDEPENDENT review applied 19 mutations of its own and 11 stayed green -- three on exported functions the suite never called. Two REAL defects found (P_sat returned a vacuum below 99.6 degC; a 1.45 kg/m3 discontinuity at h_g), five accuracy claims false OFF-GRID, and 7 of 8 cp_f references not from NIST in a file claiming none were recalled. Mutation set 17 -> 26. TRAP: git autocrlf made every MULTI-LINE mutation anchor silently stop matching -- the runner now normalises line endings before matching, because a gate whose coverage depends on the checkout's line-ending policy is not a gate.
  'run_contract.js':       { code: 0, score: '177checks 0failed' },   // 175 -> 177 (#447): the pzr_heaters_shed true_state field's §6.3 line + the PZR HTRS SHED alarm's category check   // 168 -> 175 (#386 stage 3): 4 hydrogen true_state fields + 3 new alarms' category checks. 167 -> 168 (#385 node stage 1): the pzr_mass_frac inventory-node field's §6.3 line. 159 -> 167 (#386 stage 2): 4 new true_state fields (spray/fan demand+active) + 4 new containment alarms' category checks
  /* New 2026-08-13 — the ops dashboard reads EASTERN on every view (owner directive:
   * "I need all dates in times in my telemetry site to be in eastern time"). Three
   * things nothing else could catch, all of which fail SILENTLY rather than throwing:
   *   - DST. The obvious implementation samples the zone offset at NOON, safely away
   *     from the 02:00 switch, and is wrong on precisely the two days a year this is
   *     about, in OPPOSITE directions (03-08 an hour early, 11-01 an hour late).
   *     Injection-verified: restoring the noon form takes this to 61/64, and the
   *     365-day sweep names both dates on its own.
   *   - THE RE-GROUP QUIETLY BECOMING A RELABEL. The traffic table is right only
   *     because analytics.js asks RUM for `datetimeHour` and sums into Eastern days
   *     here-side; reverting to the API's own `date` dimension leaves a page headed
   *     "Date (ET)" that is 4-5 h out in every row and looks perfect. -> 62/64.
   *   - A view printing a raw Analytics Engine stamp, which is already shaped
   *     "YYYY-MM-DD HH:MM:SS" and reads as a good time while being four hours out.
   *     -> 63/64.
   * Also pinned in the OTHER direction: storage and queries STAY UTC (R2 day keys, the
   * KV stamp, the relative SQL window), so a later "make it all Eastern" pass cannot
   * walk past the display layer and shift the key space.
   * The count moves with the source scan: it counts VIEWS x checks, so adding a
   * dashboard view adds ~3. Comments are stripped before scanning — every one of these
   * files argues about UTC at length and an unstripped scan passes on the prose.
   *
   * 12/12 64 -> 14/14 87 (2026-08-17, #485): the Eastern alignment above is right for the
   * TABLE and, for four hours a day, wrong for the NUMBERS — `now - 7*24h` read between
   * 8pm and midnight Eastern lands 20 h past Cloudflare's full-resolution edge and every
   * figure on the page comes back rounded to +/-10. Two suites added: the window start
   * over 8760 hours of 2026, and the label on the short bucket the clamp leaves behind.
   * Injection-verified ten ways, all caught: the defect itself -> 84/87, a clamp that
   * shortens the window to a day -> 80/87, clamping the wide windows too -> 84/87, the
   * edge off by one day -> 84/87, the edge given a zone offset -> 83/87, the label
   * dropped -> 86/87, the label on every row -> 84/87, the table not using it -> 86/87,
   * the warning back to blaming the window size -> 86/87, the start re-derived inline ->
   * 85/87. The label check had to become BEHAVIOURAL to bite: as a source scan for
   * "(partial)" it passed green on `(false ? ' (partial)' : '')`. */
  'run_dashboard_time.js': { code: 0, score: '14/14 87/87' },
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
  // 25 -> 27 on 2026-08-03 (#319): pwr_post_trip's two cross-reference checks — the checklist
  // names a manual procedure, and PWR-T06 is defined in the index. This gate also REPORTS the
  // coverage number #319 tracks (58 documented, N 15 / T 19 / E 24) without enforcing it.
  'run_procdocs.js':       { code: 0, score: '37checks 0failed' },
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
  'run_manual_rev.js':     { code: 0, score: '15checks 0failed' },
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
  // 122 -> 132 on 2026-08-03 (#319): PWR-T06 post-trip, 5 controlled steps x 2 checks.
  // 172 -> 174 (2026-08-04, #348): the SGTR procedure gained its SI-termination step, and a
  // controlled step is 2 checks here (it must name a control the board can actually reveal).
  // Its STEP_UI entry went in WITH the step, which is why this and verify_manual_follow moved
  // together — the #224 failure was exactly the opposite, a step added without its entry and
  // therefore silently UNVERIFIED.
  // 174 -> 176 (2026-08-12, #468): PWR-N01 gained step 2a, "withdraw the shutdown bank",
  // when the Mode 5 preset started shipping with the bank inserted. One new controlled
  // step = one STEP_UI mapping check + one coverage check.
  //   IT WENT RED FIRST, AND IN THE MOST INSTRUCTIVE WAY: inserting a step at index 2
  // shifted every `pwr_heatup` entry below it, so the gate reported SIX consecutive
  // "pill X != STEP_UI Y" mismatches plus one unmapped tail step. That cascade is one
  // insertion, not seven errors — renumber, do not re-derive. It is also the THIRD time
  // this hand-maintained map has been broken that exact way; `manual_ui_map.js`'s own
  // header records the first two (`pwr_startup` i:3 and i:7). The map is why the gate
  // exists — measured 2026-07-31 it covered 17 of 45 controlled steps at a confident PASS.
  'run_manual_controls.js': { code: 0, score: '176checks 0failed' },
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
  // 292 -> 295 on 2026-08-03 (#319): the `procedure:pwr_post_trip` registry entry. This gate
  // caught its absence, which is the job — a procedure the player can open with no flag
  // behind it ships ungated (#310 is the worked case).
  // 310 → 320 on 2026-08-07: A COUNTING ARTIFACT, NOT NEW COVERAGE — recorded because the
  // number alone reads like the opposite. The "deploy stamp can only produce a known
  // channel" suite greps site/stamp_version.js for /'(public|preview|dev)'/ and emits one
  // ck() PER LITERAL FOUND; the host-agnostic rewrite has 18 such literals where the old
  // file had 8. MEASURED both ways (8 → 18, delta 10 = the exact check delta). Not one of
  // those ten asserts anything that was not already asserted.
  // Worth knowing WHY that suite was no defence: it never mentions CF_PAGES. Its one
  // semantic check is /production'\s*\?\s*'public'/, which only ever inspected the Vercel
  // branch — so it sat green through the entire period in which a Cloudflare deploy would
  // have stamped the public site 'dev'. It pins the VOCABULARY (no unknown channel string
  // can be emitted); run_channel.js pins the DECISION. Neither substitutes for the other.
  'run_flags.js':          { code: 0, score: '19/19 342/342' },   // 16/320 -> 19/342 (2026-08-11, #448): the ops dashboard can now queue a flag STAGE, which site/stamp_version.js fetches at BUILD time and freezes into the generated site/channel.js as RD_FLAG_STAGES. Three suites for the layer that creates: a stamped stage really does beat the source literal (or the whole pipe is decorative), it CANNOT lower the floor under free_play/manual (or remote control does by API what this gate forbids in source, and the floor check becomes theatre), and a malformed value falls back rather than resolving to whatever it happens to be. Injection-verified: remove the floor guard -> 338/340 at the time, make stamped() always null -> 336, break the stamper's fallback marker -> 339. THE VALIDATION CHECKS WERE HOLLOW ON FIRST WRITE and are the reason the count is 342 and not 340 — asserted against `campaign`, whose literal is 'preview', a rejected value and an accepted-but-meaningless one BOTH fall through to `channel() !== 'public'` and give the same answer, so deleting the validation left them green. They now run against a temporary stage-'public' probe, where the two outcomes differ, plus a positive control that a VALID stamp is still honoured. Watch the count when editing site/stamp_version.js: the channel-scan suite counts quoted 'public'/'preview'/'dev' LITERALS in that file and does not strip comments, so a stage array or even a sentence naming them in quotes inflates this number (measured, twice).
  // New 2026-07-28 (#96) — the inspection copy behind the System Scanner block.
  // Every way this rots is silent: an item id changes and its entry describes
  // nothing; a new control inherits its card's summary and READS like a real
  // answer; a manual citation outlives the section it names. All three are
  // failures here. The check count moves with the board — a new control or
  // indication shifts it, which is the intended nudge to write its copy.
  // 35 -> 36 on 2026-08-01: the board renders SI since #238 and this copy cannot, so
  // an entry naming its display unit ("in °F") is contradicted the moment SI is picked.
  // The new check found two sites the hand pass had missed, and reddens on the old text.
  // 8/8 36 -> 9/9 42 on 2026-08-04: the Inject Failure GROUPINGS *(owner directive)*. The
  // Failures tab orders the catalog through a hand-maintained `failGroups` table in
  // ui/app.js — the #224 shape — and this suite already exists for exactly that rot, so the
  // guard went here rather than into a new runner. `buildFailures` refuses to DROP an
  // unlisted failure (it renders under "Other"), so the real failure mode is a MISFILED row
  // nobody notices, not a missing one. Checked BOTH directions plus duplicates, and
  // INJECTION-VERIFIED three ways: removing `sgtr` from its group, listing a failure that
  // does not exist (`pzr_heaters_failed`), and naming one in two groups each take it to
  // 8/9 41/42.
  //
  // 2026-08-08: +1 suite, +6 checks — the same #224 guard for the INDICATIONS tab, which is
  // generated from `PROFILES.pwr.series` and so is only "all the indications in the plant"
  // while that hand-maintained array keeps up with the engine's 84 channels. INJECTION-
  // VERIFIED four ways: a new instrument with no series, a series naming a renamed channel,
  // two series sharing an id (they would share a packed chart column), and an accessor
  // reading a key no instrument publishes. That last one CAUGHT A LIVE DEFECT the day it was
  // written — `xenon` declared `get: i.xenon_pct_eq` for a quantity with no instrument, and
  // chartSample cloned the instruments dict every sample to feed it.
  //
  // 2026-08-09: 53 -> 56. The Indications tab gained per-row scanner copy, so three more
  // things can rot silently and are now checked: a row that resolves to NO copy (neither an
  // authored hint nor an instrument the manual reference describes), a series NO checkbox can
  // reach (dead weight — it costs a column in every packed chart row; three shipped that way
  // for a day), and a physics row binding a `ser:` that does not exist. Injection-verified.
  'run_inspect.js':        { code: 0, score: '10/10 56/56' },
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
  // 112 -> 116: also checks that every file the deploy build command needs is not
  // excluded by .vercelignore. Alpha 1.10.0's deploy failed exactly there -- `tools`
  // was ignored while the buildCommand shelled out to tools/make_portable.js -- and no
  // local build could catch it, because locally nothing is ignored. Injection-verified:
  // re-excluding `tools` reddens it.
  // Two increments landed together: #275 added the DOWNLOAD section (116 -> 123) and #259
  // packs legal.html + changelog.html into ui/site_docs.js, one more <script src> on the
  // shell, so Settings can open Disclaimer / License / Changelog offline in the portable
  // build. The merged figure is MEASURED, not 123 + 1 arithmetic.
  // 124 → 125 (2026-08-05, #371): one more shipped script for the portable build to inline —
  // `ui/diagram/board/components/comp_atmospheric_dump.js`, the ADV's schematic component,
  // registered on the shell and on board_check. The guard counts shipped scripts, so a new
  // board component is exactly one check. MEASURED after `node tools/make_portable.js`.
  // 125 -> 129 on 2026-08-07: the bundler gained an OMIT set (local scripts the offline
  // build must not contain at all, as opposed to DROP's external tags), and the gate was
  // taught about it — +1 TAGS row per omitted file, +2 BUNDLE rows proving each one
  // actually left, and the inlined-script tally now subtracts them.
  // THE GATE FOUND THIS ITSELF, which is the whole reason it exists: wiring telemetry put
  // a `fetch(` into a script ui/shell.html ships, and the LOADS scan failed on it. The
  // right answer was to ship neither site/telemetry.js nor its endpoint file in the
  // portable build rather than to add an exception to the scan — "cannot fire" and "is
  // not present" are different promises and the offline build makes the stronger one.
  // The per-file BUNDLE rows exist because the tally alone is satisfiable by a TYPO: a
  // mis-keyed OMIT entry ships the file and the count still matches scripts.length.
  // 129 -> 130 on 2026-08-07: site/build_site.js joined vercel.json's buildCommand, and
  // the DEPLOY check enumerates every script that command runs (both files are gone since
  // #413; the check now proves EXISTENCE) — the failure that killed Alpha 1.10.0.
  // One more build script, one more check, and it is the check doing its job.
  // 130 -> 128 on 2026-08-08 (#413): the two Vercel analytics beacons were removed from
  // ui/shell.html, and the TAGS rule emits one check per EXTERNAL tag — so two tags gone is
  // two checks gone. DROP is now empty and that is correct: Cloudflare Web Analytics
  // collects at the edge on a proxied zone and ships no script, so the shell has no
  // external tags at all. The constant is kept, not deleted — an undeclared external tag is
  // still a hard error and the next one needs somewhere to be declared with a reason.
  // The DROP entries had to go in the SAME change as the tags: the gate fails on a stale
  // declaration as well as an undeclared tag, so removing one without the other is red
  // either way. That symmetry is the check working.
  // 128 -> 129 on 2026-08-08: ui/perf.js joined the shell, and the LOADS rule scans one
  // check per shipped script. It contains no loader (only performance.now and arithmetic),
  // so the count moves and nothing else does.
  // 129 -> 137 (2026-08-09, #414): the DOWNLOAD rule stopped comparing two spellings of
  // the filename and started asserting the RULE. -1 (the three-literal agreement check,
  // which could not have seen the suffix being added to one side) +1 (manifest.js must
  // load before nav.js) +6 (downloadName() behaviour matrix: public/preview/dev × .zip
  // and the archive entry) +2 (nav.js takes the name from the manifest, and contains no
  // 'Reactor_Dynamics_' literal to re-derive it with).
  'run_portable.js':                          { code: 0, score: '147checks 0failed' },   // 171 -> 147 (#514, 2026-08-25): the RBMK/BWR engine/control/scenario tags leave ui/shell.html (owner-ruled load cut) and this gate scans the shell's own tag list — the self-maintaining FALL, same property as every rise below. 108 shipped scripts scanned.   // MERGED TREE 2026-08-21 (develop 143 x backshop 170 — the shell's tag list carries BOTH lanes' new scripts; measured below).   // 169 -> 170 (the feed train, 2026-08-21a): pwr2_feedwater.js is a new <script src> in the shell and this gate scans the shell's own tag list — the self-maintaining rise, not drift.   // 141 -> 142 (2026-08-11, #444): ui/highlight_bus.js. | 140 -> 141 (2026-08-10, #393): ui/chart_math.js, same self-maintaining rise. | 139 -> 140 (2026-08-10, #437): ui/event_stream.js is a new <script src> in the shell and this gate scans the shell's own tag list — the same self-maintaining rise diag_recorder.js caused, not drift. | MERGED 2026-08-10 (develop+workbench x backshop) — measured on the merged tree, NOT summed. | 137 -> 138 (2026-08-10, #413): vercel.json and .vercelignore are DELETED, so the DEPLOY check no longer asks "is the ignore file hiding this from the build machine?" — meaningless on Pages, where nothing is excluded, i.e. a check that could only ever answer no. It now asks plain EXISTENCE of every script in the deploy chain (read from site/build_site.js's BUILD_ONLY, the one remaining declaration of what the deploy runs) plus the siblings they shell out to. +1 net: one new `chain-declared` check, and the per-file checks now cover a file that is MISSING, which the old form silently skipped (`if (!existsSync) return;` sat before the exclusion test — the one failure it existed to prevent was outside its reach). Injection-verified: moving site/stamp_version.js aside gives 138/1. NOTE the coverage is not uniform — tools/make_portable.js and site/make_download.js are `require`d by the runner itself, so losing either CRASHES it before the check runs; still red to run_all (exit code), but by stack trace, not by named violation. Written down because "verified by injection" was true for one member and not the others. | backshop: 137 -> 138 (2026-08-09, #432): ui/diag_recorder.js is a new <script src> in the shell, and this gate scans the shell's own tag list — so a new script raises the tally on its own, which is the self-maintaining property working, not drift.   // 142 -> 169 (Option B stage B3, 2026-08-20f): the 27 pwr2 engine files join ui/shell.html and therefore the portable build -- all clean against the 13 load patterns.
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
  // NEW 2026-08-14 (#472 phase 3b) — the pressurizer v2 two-region model at the REGION
  // level: correlations, geometry, the implicit flash, heater elevation, stratification and
  // mass closure. It exists because four commits of thermodynamics had NO consumer at all —
  // `stepRegions`, `solveFlash` and `pressureFrom` were called only by their own file, and
  // every number in those commit messages came from a throwaway script. Writing it found
  // four defects in a model that had passed every gate in the repo, because no gate could
  // see it: the heater elevation keys were MISSING from config (wetted fraction 0 at every
  // level — full demand, zero watts), the flash bracket was sized off the delivered energy
  // alone (so a pressure change from relief or an outsurge could flash nothing — 60 kg of
  // steam drawn boiled 0.2 kg of liquid), the step returned a pressure the state did not
  // hold (a two-step zigzag), and the inner fixed point ran a fixed 3 passes and stopped
  // 6 % short of its own root. It runs in about a second: no plant is stepped, which is the
  // point — conservation is a property of a state and a step, not of a scenario.
  // Injection-verified TEN ways, and two of those injections went through green: a
  // corrupted vapour-table node (monotonicity, node-exactness and the round trip are all
  // satisfied by any table, including a wrong one -> A6, slope smoothness) and relief
  // rerouted to draw LIQUID (mass still closed, and "> 30 kg flashed" was satisfied by the
  // 60 kg the valve itself took -> F4, the steam-draw/liquid-draw pressure ratio). Both
  // holes were found by running the injections, not by reading the checks.
  // 28 -> 38 (#472 phase 3b, the surge boundary): section G. Six of the ten are the ported
  // void ledger, and G6 is the one that matters — it runs v2's `voidCreditRate` against
  // v1's `stepLevel` step for step over a leak-and-collapse trajectory and requires BITWISE
  // agreement (measured: 0.00e+0 over 200 steps). The TMI deception is that ledger, and the
  // port is algebra-preserving or it is a recalibration nobody voted for. Three more of the
  // ten were added because injections walked through the first set: a doubled relief term
  // (invisible on any state with the valve shut -> G7), the #384-s4 cold-solid suppression
  // (needs a solid, floored, contracting state to see -> G8), and the ledger's zero floor
  // (only binds on a full collapse after a weighted growth -> G4c).
  // 38 -> 39 (2026-08-15): H1, the first check here that steps `stepPressure` rather than
  // the regions. It guards a defect the region level CANNOT see — steam has no way out of
  // the vessel except the relief valves, so a draining loop leaves the pressurizer's steam
  // behind holding pressure UP, which keeps the loop subcooled, which keeps the blowdown
  // branch from ever firing. Measured on a severity-0.8 break: inventory 0.0 %, void 0.0,
  // pressure pinned at 1871 psi for fifteen minutes. Found by CA-15's leg, which read as a
  // stale fixture and was the fence.
  // 39 -> 41 (2026-08-15): J1/J2, inventory conservation across the ported branches. J1 is
  // the one that matters — reseed used to rebuild the vessel's mass THROUGH LEVEL at the new
  // pressure, which mints water whenever Tsat moves (the liquid gets denser, so the same
  // level is more kilograms). Invisible in normal operation, where the temperatures agree.
  // 41 -> 44 (2026-08-15): J3a/b/c, the SIGNED node inventory. An outsurge that outran the
  // water used to stop at zero and DISCARD the rest — measured, 8,684 kg thrown away over
  // 80,209 steps on one break, 3.4x the vessel's capacity — while the ECCS refill that
  // followed was credited in full, so a pressurizer holding zero water published a 100 %
  // gauge. v1 cannot fail this way because its level is a signed reconstruction.
  // 44 -> 45 (2026-08-15): K1, the adaptive sub-step. Two earlier forms of this check read
  // "1 sub-step" and would have shipped green while testing nothing — the first because it
  // measured a 55 % plant where there is no stiffness, the second because it set
  // `spray_flow_frac` directly and `autoControl` overwrites that on the way through. The
  // real command sets `spray_override`, which is what the check drives now: 64 sub-steps
  // with both controls full at 85 % level, exactly 1 on a quiet plant.
  'run_pzr2.js':           { code: 0, score: '49checks 0failed' },
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
  // 62 -> 66 (2026-08-03, #311 flag ON): Part A iterates the live protection tables, so it
  // picks up the two new trips and two new alarms automatically and asserts each sits
  // strictly inside its instrument's range. Nothing was hand-added here.
  // 66 → 65 (2026-08-05, #369): the SG-safety pop left PWR_ACTUATIONS for the engine
  // (self-actuating on true pressure), so Part A has one fewer instrument-actuation row.
  // The protection did not shrink — it moved below the instrument layer, where
  // reachability-through-an-instrument is no longer the right question. TR-16 covers it.
  // 65 → 68 (2026-08-05, #375): Part A picks up the two new ±100 °F/hr rate alarms
  // automatically, and Part B gains B4 — the dump-setpoint cooldown must drive the
  // INDICATED tavg_rate channel past the alarm (a rate meter is the easiest instrument
  // to filter to death, the #249 class).
  // 68 → 69 (2026-08-05, #370c): the steam line isolation's actuation setpoint
  // (steam_pressure low 5.20) joins Part A's static audit.
  'run_reachability.js':   { code: 0, secs: 2, score: '75checks 0failed' },   // 76 -> 75 (#453): one fewer actuation in the Part A/B sweep — the RHR auto-entry row is deleted (no plant opens that valve automatically; every sourced interlock is an inhibit). Placing shutdown cooling in service is now an operator evolution, so there is no setpoint left to range-check or reach.   // 74 -> 76 (#386 stage 3): the 4.1 v/o H2 alarm + the recombiner start join Part A (strictly inside ctmt_h2's [0, 10] — the spec pre-sized the range). 69 -> 74 (#386 stage 2): the containment actuation/alarm setpoints join Part A (all strictly inside containment_pressure's [0, 0.8] — stage 1 pre-sized the range for exactly this)
  // NEW 2026-08-03 (#311) — Overtemperature ΔT / Overpower ΔT, the two Westinghouse
  // reactor trips this plant did not have. It needs its own runner because the trips ship
  // DEFAULT OFF and `pwr_control.js` reads that flag at LOAD time: Node caches requires, so
  // no other suite can see them at all. This one sets the flag between loading the config
  // and loading the control layer, and covers BOTH states — flag-off (the channels exist,
  // nothing is wired: the half that guards the shipped plant) and flag-on (the trips, rod
  // stops and annunciators, the normal-operations envelope, and the casualties that have no
  // trip today).
  // INJECTION-VERIFIED FOUR WAYS, which is the only reason to believe the coverage claim:
  // restoring the rotated OTΔT line reddens 3 (and reproduces the original defect exactly —
  // scram at 55.0 s, margin 0.6); deleting the rod stops reddens 3; clearing
  // `withdrawal_only` reddens 2; walking `dnb_margin_factor` to 0.95 reddens the 2 checks
  // that hold the equivalent K2/K3 inside the band real Westinghouse units publish.
  // The count moves with the casualty list, 1–2 checks each.
  // 39 -> 44 (2026-08-03, #318 the turbine runback): +7 for section D, -2 because the 15 %
  // steam line break MOVED out of the casualty block — the runback now saves it, so it is
  // asserted there as a save rather than here as a trip. What is left in the casualty block
  // is the pair the runback CANNOT save, which is the honest split.
  // 44 -> 45 (2026-08-03): +1 for the runback's NEVER-WORSE check. A/B'd across four seeds,
  // the runback saves the 15 % steam line break on 3 and is NEUTRAL on the 4th (seed 7, where
  // the casualty scrams at 66 s with and without it). Nothing else asserted that a protection
  // action which takes load off cannot bring a trip FORWARD, which is the safety property.
  // 45 -> 46 (2026-08-03): the runback was rebuilt to the SOURCED law (WTSM 11.3, ML11223A295)
  // and the extra check asserts its QUANTISATION — load lands on 5 % multiples because the real
  // EHC steps 5 % at 200 %/min then holds 28.5 s. A continuous ramp cannot land on that grid, so
  // this check fails on the implementation it replaced, which the old '< 90 MWe' band could not.
  'run_otdt.js':           { code: 0, secs: 26, score: '46checks 0failed' },
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
  // 8 -> 11 on 2026-08-04 (#282): LAUNCH. RD_RELEASE is "Alpha 1.0.0", changelog.html has its
  // first published entry (ONE line, owner's call) and CHANGELOG.md's [Unreleased] is rolled.
  // The three extra checks armed on the format alone, exactly as the note above predicted.
  // WHAT DID NOT COME FOR FREE, and was found by SIMULATING the release before doing it:
  // CHANGELOG.md still carried "## [Alpha 1.11.0]" down to "## [Alpha 1.7.0]" from the
  // pre-public period, so rolling [Unreleased] to "## [Alpha 1.0.0]" put 1.0.0 ABOVE 1.11.0
  // and failed "version headings are newest-first" — 10 checks / 1 failed. #282 recorded the
  // opposite ("not needed at all"), which was true of changelog.html (emptied) and never
  // checked against this file. The nine pre-public headings are "## [Pre-launch 1.x.y]" now,
  // relabelled individually rather than merged, because merged boundaries cost a tag diff to
  // recover (this runner's own header records that). SECOND EFFECT, which nothing would have
  // surfaced: `floor` in the CROSS rule is the oldest individually-named version heading, so
  // while 1.0.0 sorted under Alpha 1.7.0 the launch entry fell below the floor and its
  // date agreement across the two files was NOT CHECKED AT ALL — zero CROSS rows, no failure.
  // The relabel is what makes this 11 rather than 10, and the 11th check is that CROSS row.
  // 11 -> 12 (2026-08-05, Alpha 1.0.1): a RELEASE adds a check, by design — every
  // `changelog.html` entry down to the oldest version `CHANGELOG.md` still names individually
  // is cross-checked, so the CROSS block grows by one row per published release. Nothing was
  // added to the runner.
  // 12 -> 13 on 2026-08-05 with Alpha 1.1.0 — a RELEASE adds a check by design: the CROSS
  // block cross-checks every changelog.html entry down to the oldest version CHANGELOG.md
  // still names individually, so it grows by one row per published release.
  // 16 -> 17 on 2026-08-07 with Alpha 1.3.0; 17 -> 18 on 2026-08-08 with Alpha 1.4.0 — the
  // same mechanism each time. This key moves on every RELEASE and on nothing else, so a bump
  // here with no release in the same change is the signal that something else added a check.
  'run_release.js':        { code: 0, score: '23checks 0failed' },   // 22 -> 23 (Alpha 1.6.1): one more CROSS pairing, as every release adds. | 21 -> 22 (Alpha 1.6.0): one more CROSS pairing, as every release adds. | 20 -> 21 (Alpha 1.5.2): one more CROSS pairing, as every release adds.   // 19 -> 20 (2026-08-09, Alpha 1.5.1): same mechanism as the row below — one more CROSS pairing. | 18 -> 19 (2026-08-09, Alpha 1.5.0): one more CROSS row — the check pairs each changelog.html entry with its CHANGELOG.md heading, so it grows by one per release. 9 published entries, 9 version headings.
  // NEW 2026-08-06 — the public site's SOCIAL CARDS. Every page carried a RELATIVE
  // `og:image` ("site/hero.png") from launch, and Slack / Discord / iMessage / X do not
  // resolve a relative og:image, so every link ever shared into a chat rendered with no
  // preview picture. Invisible from inside the repo: the pages are correct html, the
  // image loads fine in a browser, and until this runner nothing here read those tags at
  // all. Changelog, Privacy and Legal had no card whatsoever — the block only ever
  // existed in the pages that already had it, so each new page started from zero.
  // THE PAGE LIST IS GLOBBED AND FILTERED THROUGH build_site.js, deliberately: a
  // hand-kept list would have tested the list, passing at full marks on the very page it
  // had never heard of. VERIFIED BY INJECTION before baselining, which is the only reason
  // the number below means anything — the original bug reintroduced in one page scores
  // 116/3 (the count moves because the stray-url sweep emits a row naming it), a page
  // stripped of its card 115/13, and a stale og:image:width 115/1. 115 checks is
  // 8 pages × 14 + the discovery row and the hero-file row.
  // 115 -> 148 on 2026-08-07: a 9th page (404.html — Pages serves one for unmatched
  // paths where Vercel supplied its own) at 14 checks, plus a CROSS-CHECK against
  // site/build_site.js's PAGES list. Two files each answer "what is the public site" and
  // they can disagree in both directions: add a page and forget the build list and its
  // card is checked here while the deploy never publishes it; drop one and the build
  // throws at deploy time, which is late. It caught 404.html on its first run.
  // INJECTION-VERIFIED both ways: a page removed from the build list 146/2, a page added
  // to it that this gate does not glob 148/2.
  // 148 -> 151 on 2026-08-08: three checks pinning the extensionless-URL rewrite in
  // site/build_site.js. Cloudflare Pages redirects /about.html -> /about and it CANNOT be
  // disabled, so every canonical naming the .html form pointed at a url that redirects away
  // from the one served — measured live after the cutover. The build now rewrites links and
  // canonicals in the OUTPUT only; the repo keeps .html so the site still browses from
  // file:// with no server.
  // TWO OF THESE THREE SHIPPED HOLLOW AND WERE CAUGHT BY INJECTION. The ordering check
  // compared indexOf results directly, and indexOf returns -1 when absent — so DELETING the
  // reference walk made it `-1 < n`, true, and the check passed on a build that verified
  // nothing (the TR-17 shape: an expression that cannot be false). The dead-link check
  // regexed for `deadLinks.length`, which survives `if (false && deadLinks.length)`.
  // Both hardened; all four mutations now score 151/1.
  'run_site_meta.js':      { code: 0, score: '164checks 0failed' },   // 163 -> 164 (2026-08-19g): test_pwr2.html joins NOT_PUBLISHED, and the partition gate mints its per-page declared check — the designed RED-until-declared behavior doing its job.   // 151 -> 163 (2026-08-10, #413): .vercelignore is DELETED, and it was this gate's authority on which root pages are public. The authority moved to site/build_site.js, which assembles what actually ships and now declares BOTH halves — PAGES and a new NOT_PUBLISHED (the three dev harnesses). +12: nine `is declared either published or withheld` checks (one per root *.html) plus the parse check and the re-shaped pair. THE PARTITION IS THE POINT — PAGES + NOT_PUBLISHED must TOTAL the glob, so a new root page is a RED until some file says whether it ships. That is exactly the property .vercelignore was providing, kept rather than dropped with it; a gate iterating a hand-kept page list would pass at full marks on the one page it had never heard of. Injection-verified: a stray root .html reddens `is declared either published or withheld`.
  // NEW 2026-08-12 (#470) — THE FIRST GATE THAT RUNS THE DEPLOY BUILD AND READS ITS OUTPUT.
  // Everything else about the site is static: run_site_meta reads source, and it scored
  // 163/163 unchanged across the fix for #470, which means deleting that fix was green in
  // every gate in the directory. The defect it now guards shipped to production: shell.css
  // is cached four hours and was referenced bare, so Alpha 1.6.0 served new HTML against
  // 1.5.2's stylesheet and the control room drew unstyled for anyone who had visited that
  // day. It builds into RD_SITE_OUT (a scratch dir — dist-site/ is never touched) and asks
  // the files two questions: is every html in the output a DECLARED page, and does every
  // local css/js url carry ?v=<stamp>. The first found the second defect on its first run (#476) —
  // ui/test_panel's two dev harnesses were live on the public domain, because PAGES/
  // NOT_PUBLISHED partitions the root glob while the DIRS loop copies wholesale.
  // INJECTION-VERIFIED three ways, each reverted: bust call disabled 162/133 (BUILD's own
  // tally AND every bare url), WITHHELD_DIRS emptied 33/3 (both harnesses named), and one
  // single url excluded from busting 32/2 — that last is #470 itself, and it is the one that
  // proves the walk reads the OUTPUT, since the source still looks healthy.
  // IT SHIPPED RED IN CI AT 41 AND THE CAUSE IS WORTH KEEPING. The first draft emitted one
  // check per html file in the output, and `download/` is an OPTIONAL_DIR — present here and
  // on the deploy host (make_download.js runs first), absent on a fresh clone and in CI. So a
  // HEALTHY tree scored 41 locally and 40 there. Worse, the build itself exited 1 in CI: the
  // reference walk threw on `download/latest.zip` and `download/manifest.js`, contradicting
  // the OPTIONAL_DIRS declaration eight lines above it, which means `node site/build_site.js`
  // had never once worked on a bare clone. Both fixed; the tally is now 31/0 with or without
  // the directory (11 html files vs 10), measured both ways rather than reasoned about.
  'run_site_build.js':     { code: 0, score: '31checks 0failed' },
  // NEW 2026-08-07 — WHICH AUDIENCE a deploy thinks it is for. site/stamp_version.js read
  // VERCEL_ENV and nothing else, so the move to Cloudflare Pages (CF_PAGES_BRANCH, no
  // VERCEL_ENV) would have stamped the PUBLIC site 'dev' — and 'dev' is the most PERMISSIVE
  // channel in site/flags.js, not the safest: `channel() !== 'public'` turns ON every
  // preview-stage area. MEASURED before the fix: campaign, scenarios, checklists and
  // walkthroughs all `on`, i.e. the four the owner declared placeholders (#241), live on
  // reactordynamics.com, with nothing failing and no gate reddening.
  // The runner asks resolve() a 7-row host matrix AND asks site/flags.js what each answer
  // actually offers — a channel string is not the thing that matters, what it does to the
  // flag layer is, and pinning only the string would let the two drift apart.
  // PURE: resolve(env) does no I/O and the file writes sit behind require.main, so this
  // runner cannot leave a stamped working tree behind even if it is killed mid-run.
  // VERIFIED BY INJECTION: resolve() made blind to Cloudflare again scores 25/10, the
  // unrecognised-CI fallback flipped from 'public' to 'dev' scores 25/2, and renaming
  // PRODUCTION_BRANCH scores 25/4.
  'run_channel.js':        { code: 0, score: '25checks 0failed' },
  // NEW 2026-08-07 — the usage-data client's PRIVACY INVARIANTS (site/telemetry.js).
  // This is the first code in the project that sends anything anywhere; everything else
  // runs on the player's machine and privacy.html says so. So these are not style rules
  // to be re-derived: nothing is collected while consent is undecided or denied, nothing
  // is sent without an endpoint (a clone and the offline build both have none by
  // construction), event names come from a declared allowlist, property VALUES are
  // type- and charset-bounded so no free text can ride the automatic path, and the
  // session id lives in sessionStorage so nothing links two visits.
  // It DRIVES the module against a fake browser rather than grepping it — every one of
  // those is a behaviour, and a grep for `localStorage` proves nothing about whether an
  // undecided visitor is silent. Both transport paths are covered: Node ships
  // CompressionStream so the gzip path is the default, and the raw fallback is forced.
  // INJECTION-VERIFIED, all six: consent check removed 49/4, allowlist dropped 49/2,
  // session id moved to localStorage 49/2, enum charset check removed 49/2, revocation
  // not clearing the queue 49/1, a real URL committed to the endpoint file 49/1.
  // NOTHING IS WIRED YET — no caller emits an event, so this gate pins a contract the
  // sim does not exercise. That is deliberate: the contract lands before the collection.
  // 49 -> 50 on 2026-08-07 (slice 2, the wiring): one added check, and one CORRECTED.
  // The registry gained `plant_mode` — the funnel is now the engine's own derived
  // commercial mode rather than a power threshold picked by eye, which would have been a
  // plant-dynamics claim wearing a product-metric hat. And `session_end.reached_play` was
  // CUT after the live board disproved it: play does not route through the command
  // dispatcher, so the flag read false on a session that had plainly run. `sim_seconds`
  // already answers it, because the sim clock only advances while running.
  // 50 -> 78 on 2026-08-07 (slice 3, the Worker): +28 from a CROSS-CHECK between
  // site/telemetry.js's registry and worker/src/index.js's KEY_OF column map. Two silent
  // failures live in that seam and neither is visible from either side alone: declare an
  // event and forget the receiver, and it is collected then thrown away (the Worker drops
  // unknown names); rename a property, and its column arrives empty for ever.
  // The map is parsed as TEXT — the Worker is an ES module and these runners are CommonJS.
  // INJECTION-VERIFIED: an event the Worker never learned about scores 76/1, a renamed
  // property 78/1, a stale mapping 80/2.
  'run_telemetry.js':      { code: 0, score: '104checks 0failed' },   // 103 -> 104 (2026-08-11, the consent control moved off the Settings menu by owner instruction): the single 'the in-sim Settings row points at the schema' check became TWO — privacy.html carries a working control, and the retired Settings row has not come back. Both proven by injection (renaming #telOptOut reddens the first; re-adding #telemetryRow reddens the second), because a check written beside its own fix is not green until it has been made red. | 84 -> 103 (2026-08-10, #448): the client and the Worker agreed with each other about NAMES while the numbers went missing. KEY_OF gates each event's principal string; nothing gated the 'num'/'bool' props, which reach Analytics Engine through the fixed doubles/blobs arrays instead — so `command.blocked` was declared, validated, transmitted and discarded on arrival, green throughout. +14: every scalar prop reaches a real column (parsed out of the Worker source, same idiom as the KEY_OF block), the reverse direction so a typo'd `p.secons` is a column of zeroes rather than a mystery, and two for the ENVELOPE fields e.t/e.st, which no prop loop can see. +1: every declared prop type is a kind clean() understands — a prop typed 'number' falls through every branch, is dropped for ever, AND is invisible to the column check, which filters on the same spelling; that check has to stand on this one. +4: privacy.html discloses what the schema collects, read off data-collects="" MARKUP so the prose can be reworded freely and only a change to what is COLLECTED reddens it — the "change privacy.html in the same commit" rule was written in three source files and enforced by none, which is how the blocked flag shipped undisclosed. Held at four checks rather than one per token deliberately: a count that moved on every schema edit trains the next author to rewrite the number without reading it. Injection-verified six ways: drop the blocked column -> 102/1, misspell p.seconds -> 103/2, stop storing e.t -> 103/1, undisclose command.blocked -> 103/1, type a prop 'boolean' -> 102/2 (mine catches the cause, the existing "declared properties survive" catches the effect), disclose a prop nothing collects -> 103/1. // 81 -> 84 (2026-08-09, #431): the report id now comes back through sendBundle — one check that it reaches the caller, plus two for a response with NO readable body (an opaque one, or an edge answering HTML), which must still resolve ok rather than turning a report that ARRIVED into 'could not send'. 78 -> 81 (2026-08-09): the consent gate became an OPT-OUT gate. The polarity flip is the small part; the assertions are now DELTAS across one flush rather than absolute a.sent.length checks, because a.sent accumulates for the harness lifetime and the old absolutes went red downstream the moment the default started sending — "denied: flush sends nothing" failed carrying a body from the UNDECIDED phase, which reads exactly like an opt-out leak and is not one. Plus a fresh-client opt-out case (proving silence only after a granted phase leaves a first-send latch as the possible cause, HR10) and the no-storage outcome, which the flip made WORSE and is now pinned deliberately. Injection-verified twice: granted()->true reddens 5, dropping the queue-clear reddens 1.
  // NEW 2026-08-04 (#339) — the session-heading label gate. `TUNING_LOG.md` and
  // `BUILD_DECISIONS.md` are cited by their dated headings, and three lanes each allocating a
  // per-day sequence letter independently collided: measured at the 2026-08-04 three-lane
  // merge, 17 labels name more than one entry (7 + 10), so `2026-08-04b` resolves to two
  // sessions in one file and three in the other. Scheme is now `YYYY-MM-DD-<lane>-<letter>`,
  // which removes the cross-lane coordination the old one required and could not get.
  // BASELINED ON THE CHECK COUNT, not on failures: the checks are STRUCTURAL (4 per file, and
  // the files are fixed), so unlike run_manual_units the count does not move when a session is
  // appended — only when a check is added. That is the property that makes it baselineable at
  // all; a per-label count would drift on every session and train the next author to rewrite
  // the number without reading it.
  // Legacy labels are GRANDFATHERED by ruling *(OWNER RULING, 2026-08-04: "Work issue 339 in
  // develop. Go with option 2." — option 2 is explicitly "for new entries, and do not
  // retro-rename")*, so their 17 collisions are REPORTED and never failed. The enforcement is
  // a date cutoff: anything dated 2026-08-05 or later must be lane-form. Do not move that date
  // forward to clear a red — it retires the gate.
  'run_session_labels.js': { code: 0, score: '8checks 0failed' },
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
  // 37/37 237 -> 38/38 243 on 2026-08-03: the alarm DROPOUT DELAY. An instrument sitting on
  // its setpoint chattered at the evaluation cadence — measured full stack, charging_high did
  // 2135 transitions in ten sim-minutes with a MEDIAN LIT TIME OF 0.06 s, and an SGTR flashed
  // eight alarms that way including pzr_level_lolo, a CRITICAL. This suite's harness now
  // passes `dt` into `evaluate` deliberately: the parameter is optional, and a harness that
  // omits it silently tests the OLD alarm behaviour, which is the #153 wrong-cadence trap.
  // Injection-verified — `alarm_min_on_s: 0` reddens 4 checks, and the discriminating one
  // ("12 chatter cycles produce ZERO dropouts") goes to 12.
  // 38/38 243 -> 39/39 257 on 2026-08-04 (#341 / #319 item 2): the SEAL-IN. A main-feedwater
  // isolation could be undone by an operator command while its actuating signal was still
  // standing — measured full stack, a restore 10 min into a post-trip ride was ACCEPTED with
  // Tavg parked at 567.5 F against a 572.0 F setpoint, and SG level went 36.58 -> 77.43 %.
  // actuationFired[i] is the retentive memory and a fired actuation never re-fires, so
  // nothing contested the restore. Sourced to WTSM 12.3.2.3 (ML11223A310), which says the
  // operator is locked out until the reset logic is satisfied.
  // INJECTION-VERIFIED THREE WAYS, and the second one caught a HOLLOW CHECK: removing the
  // refusal reddens 4; dropping seal_in from the two latching actuations reddens 2; removing
  // the RE-ARM half reddens 1 — but only after the re-arm leg was rewritten. The first draft
  // tested re-arm on the P-14 actuation, which carries reset_below: 85 and therefore re-arms
  // itself in a branch that runs FIRST, so deleting the new code left every check green. The
  // leg that discriminates drives the SI isolation, which has no reset_below.
  // 39/39 257 → 40/40 262 (2026-08-05, #370b): the kernel gained a NUMERIC condition
  // term so coincidence logic (high steam flow AND low steam pressure) can be written
  // at all; the new suite pins it at the predicate — both directions, fail-closed on an
  // absent instrument, and the membership form untouched.
  'run_m4.js':             { code: 0, secs: 7, score: '46/46 311passed' },   // 45/45 300 -> 46/46 311 (#458): +the '#458' suite (10 checks) — shutdown cooling and low-head injection are the SAME PUMPS in two mutually exclusive alignments, so the ALIGN is refused while SI is running (ISOLATE never is). Legs (d)/(e) pin the CONTROL-KERNEL half: `_evalInterlocks` cleared through a hysteresis band and a boolean has no band, so the first boolean-keyed interlock in the codebase could not have worked — and the failure is the opposite of the guess, `setpoint: null` makes `true > null` TRUE so it released with its own signal standing and blocked nothing. The '#453' suite gained 1 check (7 -> 8) and its "the OPERATOR can still align it" leg was RE-AUTHORED: it commanded the align with the break open and SI running, i.e. it was pinning this very defect as the feature. Injection-verified: reverting the kernel branch reddens exactly 5 checks across the two suites and nothing else in 46.   // 44/44 293 -> 45/45 300 (#453): +the '#453' suite (7 checks) — RHR must NOT align itself into a scrammed, depressurized, still-leaking plant, and the operator must still be able to align it. The two older probes asked that question in Modes 4/5 where `rps_scrammed` is false anyway, so they passed for a reason unrelated to the claim. #287's structural check also re-authored from 'the entry actuation exists and carries no reset' (2 checks) to 'NO actuation targets set_rhr, and the orphaned ESF arm went with it' (2 checks) — the stronger form, which a reinstated auto-open of any shape reddens.   // 43/43 285 -> 44/44 293 (#433): the rate-compensation suite — the MSLI row's lead_lag fires on a synthetic fast ramp whose RAW value never crosses the setpoint, does NOT fire with the compensation removed (injection), unity DC gain on a pinned signal, the held_within_s no-dt floor (same-sample AND, not the permanent latch that hid #433), in-window aging, and the stamps surviving save/restore.   // 42/42 278 -> 43/43 285 (#386 stage 3): the recombiner-row suite (auto-start, params-trap seal-in refusal, latched-not-live, auto-secure, re-fire). 41/41 274 -> 42/42 278 (#387): the repo's FIRST noisy-mode leg — adv_valve jitters under an injected noisy failure (was silently inert: noise 0 with no noise_failure), byte-constant baseline, clears clean. Injection-verified: red on the pre-#387 config.   // 40/40 262 -> 41/41 274 (#386 stage 2): the containment ESF row suite — unblockable SI, latched spray seal-in + auto-secure, fan realign, MSLI hi-hi
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
  // 103 -> 104 (2026-08-03, #311 flag ON): the attention-stop test's failure leg was
  // re-premised. It injected `stuck_porv_open`, which with OTdT live now scrams inside the
  // same 60x broadcast, so the snap correctly reported 'scram' and the check read that as a
  // regression. It uses an INSTRUMENT failure now (no physics effect, cannot scram), which
  // isolates the failure->attention-stop path properly, and the +1 is the new guard that
  // asserts the injected failure did not scram — so the fixture can never drift back.
  'run_m5.js':             { code: 0, secs: 6, score: '23/23 104passed' },
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
  'run_autoctl.js':        { code: 0, secs: 22, score: '30/30' },
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
  // 3038 → 3017 (2026-08-03, #314) — a DROP, and it is coverage genuinely removed rather
  // than coverage lost. `pwr_lof` was a two-branch decision mission; the new RCP
  // breaker-position reactor trip cuts its decision window from ~36 s to ~1 s, so it is a
  // demonstration now and the whole "you waited → the core boils" branch, with its beats
  // and its endpoint, no longer exists to assert. The 21 checks went with it. What replaced
  // them is SHARPER, not weaker: the surviving checks pin the trip REASON (`rcp_running
  // is_false`, where the old plant read `primary_pressure high`) and require core void to
  // stay BELOW 0.01 where the old test required it ABOVE 0.02 — an inversion, legal under
  // HR10 only because that boil-off was reachable solely through the missing trips.
  // Injection-verified: restoring the old `crossed()` comparator reddens exactly those two.
  // If this number rises again, check it is not the branch coming back by accident.
  // 3017 -> 3023 (2026-08-04, #347): no new checks were written. Six of the TMI-2 missions
  // could not REACH their endpoint — five `pwr_tmi2_p3`, one `pwr_tmi2_p1` — so every check
  // downstream of `level_complete` was skipped. They complete now, and the skipped checks run.
  // Two of those six predate #346 and were the standing #337 cascade; the other four are #346's.
  // ONE ROOT: the beats had the plant's causal chain backwards. `subcoolAlarm` was armed AHEAD
  // of `hpiAuto`, but injection auto-starts at T+3 s and the subcooling margin does not move
  // until injection is SECURED. That only ever worked because the pre-#346 plant discarded its
  // ECCS overfill and drained regardless of injection; with the plant right, defending injection
  // holds the margin and the confusion beat blocked the whole mission. The confusion is now the
  // CONSEQUENCE of the securing rather than free-floating atmosphere, and on Part 3 it is
  // reached from the COMPLIED branch only — refuse the order and there is nothing to be
  // confused about, which is the deviation's whole point and something the old plant could not
  // express.
  // 3026 -> 3029 on 2026-08-07 (#408 + the proportional-valve ruling): the TMI-2
  // missions run the 1979 clock now — deception ~38 min, damage ~2 h 20 m, the refill
  // at the honest high-pressure HPI trickle — with authored beat speeds carrying the
  // long stretches and gate budgets raised to 42,000 sim-s (the ackThrough guard rose
  // with them; at the 0.05 s transient cadence the old 6e5-cycle guard exhausted at
  // ~30,000 sim-s and read exactly like a mission that cannot finish). The plugged and
  // holding rigs no longer pull the AFW tag — a running heat sink prevents the
  // deception, so the order those variants depend on never arms (the tag+defend
  // quiet-night is a filed design gap, not a reachable ending yet).
  // 3029 -> 3034 (2026-08-07-develop-c, #418 wave A1): the TMI-2 securing cue re-anchored
  // (pzr_level_high alarm -> level > 65 %, measured crest 69.4 % — the shared TRIG in
  // pwr_tmi2_common.js carries the record), +evidence lines (the no-dev cue telemetry, the
  // pwr_esf starved-drain duration), and the pwr_esf starved budget 400 -> 900 s at the
  // honest decay-heat boil-off. MEASURED standalone 51/51 3034.
  // 3034 -> 3037 (2026-08-07, #419 wave 2): the pwr_tmi2_p3 FULL row's new hpi_active leg
  // routes the no-reinjection variant through more of its beat graph before the PLUGGED
  // ending latches — three more checks execute and pass; suites unchanged at 51/51.
  // 3037 -> 3039 (2026-08-07, #419 wave 3): the pwr_qualify challenge branches re-keyed
  // from the pzr_level_high alarm (unreachable — the deception crests ~65 % on the
  // re-anchored plant) to the level>58-rising state cue, and pwr_return_to_mode1's
  // arrive gate back onto the anchor−1 convention (296 was the retired 297-anchor's
  // number) — two more checks on the re-keyed paths; suites 51/51.
  // SPLIT IN THREE (#513, two owner rulings 2026-08-25): run_campaign.js (part A, structural +
  // most pwr missions) + run_campaign_b.js (part B, rbmk_* + bwr_*, 8 s) + run_campaign_c.js
  // (part C, the three HEAVY pwr missions by MEASURED cost — parity alternation was tried and
  // landed 25/229 s; the cost table lives in run_campaign.js). Together the same 51 suites /
  // 3,049 checks; the split is scheduling only. Part A's suite count is the drift guard: a new
  // pwr mission lands there by default and moves this baseline.
  'run_campaign_b.js':     { code: 0, secs: 8, score: '13/13 42passed' },
  'run_campaign_c.js':     { code: 0, secs: 124, score: '3/3 18passed' },
  'run_campaign.js':       { code: 0, secs: 128, score: '35/35 2989passed' },   // 3039 -> 3049 (#447): pwr_qualify's `challenge` arming cue re-keyed a FOURTH time, and this time off a bare level threshold onto the deception's two-parameter signature (level recovered past 45 % WHILE inventory is below 96 %). The shed removes heater energy, so less void forms and the lift crests 54.9 % instead of 78.5 % — a `> 58` cue could never arm. The new cue fires at 1322 s shed, 791 s on the pre-#447 plant, and NEVER uninjected; reaching `challenge` earlier is what adds the checks.
  // 24 -> 38 on 2026-08-06 (#395): preconditions. Section 7 is the MECHANISM on a
  // synthetic procedure (graded live instrument-first, warn-never-block, the
  // comment raised/cleared/re-raised, stop takes it down) — injection-verified:
  // neutering the evaluation in _stepChecklist reds 7 cleanly (27/34 at the
  // time). Section 8 is the CONTENT: pwr_startup's #396 boron seam row reads
  // UNMET at cold_shutdown's own 857 ppm — the same boron a pump-heat heatup
  // preserves — while all 16 authored Tier B rows were measured MET on their six
  // from: ICs before shipping (the false-positive guard).
  'run_checklist.js':      { code: 0, score: '38/38' },
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
  'run_e2e_controls.js':   { code: 0, secs: 4, score: '59/59' },
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
  // 23/23 100 -> 24/24 108 on 2026-08-03 (#319): PWR-T06, the post-trip response. Its
  // acceptances are deliberately LAYER-ROBUST — AFW auto-start and the feedwater isolation
  // are M4 actuations that do not happen in this engine-direct runner, so they are carried
  // as cautions and every `acc` is a truth both layers produce.
  // 24/24 108 -> 25/25 115 on 2026-08-03 (#319 item 3): PWR-E23 seal leak, which had NO
  // test coverage of any kind before — not a probe, not a scenario.
  // 25/25 115 -> 26/26 124 on 2026-08-03 (#319 item 2): PWR-E06 SGTR, unblocked by the #322
  // ruling. Severity is 0.25, not the ops probe's 0.5 — a half rupture is NOT survivable
  // engine-direct (no ESF arming, no automation), and chasing that with extra procedure
  // steps was refitting content to a gate. The AFW and HPI steps STAYED because PWR-E06
  // asks for them (its steps 3 and 6); the severity is what moved.
  // 26/26 124 -> 27/27 132 on 2026-08-03 (#319 item 1): PWR-E03 turbine trip, the pair to
  // PWR-T06 (E03 is the procedure that SENDS you to the post-trip response).
  // 27/27 132 -> 28/28 139 on 2026-08-03 (#319 item 5): PWR-E17 rod withdrawal — the direct
  // BEFORE/AFTER for the #311 protection. Flag OFF it held 114.8 % for ~17 s with NO trip;
  // flag ON, OPdT scrams at 114.6 % after 7.9 s. Same peak, the plant just stops there.
  // 28/28 139 -> 29/29 140 on 2026-08-03 (#319 item 4): PWR-E13 ATWS, and it is `stack_only`
  // with the flag GENUINELY EARNED — emergency boration runs through `set_auto_setpoint` on
  // the boron_conc channel, an M4-only command, so engine-direct would replay an ATWS with
  // NO RESPONSE at all. One check here (the flag is justified); the stack owns the rest.
  // 140 -> 141 (2026-08-04, #348): +1 for pwr_sgtr's new SI-termination step. NET +1, and the
  // composition is worth knowing: the new step adds an `acc`, and pwr_stuck_porv step 1 went
  // from one `saw` + one `acc` to TWO `saw`s — even. That step's `acc` was an END-of-hold
  // subcooling value, and the two layers stopped agreeing on any end-of-hold value at all
  // (measured t+30 s: -5.2 C engine-direct, +36.6 C stacked, because safety injection catches
  // the transient under the stack). It passed here and failed under the stack: the #209 class.
  // `saw` now takes a LIST so a step can carry more than one transient claim.
  'run_procedures.js':     { code: 0, secs: 63, score: '29/29 141/141' },
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
  // 23/23 204 -> 24/24 214 on 2026-08-03 (#319): PWR-T06 under the stack, where AFW really
  // does auto-start and main feedwater really does isolate.
  // 24/24 214 -> 25/25 223 on 2026-08-03 (#319 item 3). THE CHARGING CUE IS M4-DEPENDENT:
  // measured on the same leak, charging settles 0.042 under the stack and 0.010
  // engine-direct, so the acceptance is only `> 0.005` and the tight numbers live in the
  // step notes. The OUTCOME is layer-robust — pzr level parks at 53.8 % in both.
  // 25/25 223 -> 26/26 234 on 2026-08-03 (#319 item 2). The depressurization acceptance is
  // INJECTION-VERIFIED: delete the `set_pressure_setpoint` and step 6 goes red. Its first
  // form (`< 0.010`) was HOLLOW — the pre-depressurization value passed it too.
  // 26/26 234 -> 27/27 244 on 2026-08-03 (#319 item 1). THE DUMP-SATURATION `saw` HAD TO
  // MOVE STEPS, and the reason is timing rather than layer: the dump pins at 40.00 % about
  // HALF A MINUTE after the trip and is back to ~9 % by three minutes, so an assertion two
  // steps later missed it under the stack while still passing engine-direct (where the
  // transient is slower). It lives on the confirm-scram step now, whose hold covers the
  // peak in both layers. A `saw` is only as good as the window it is placed in.
  // 261 -> 262 (2026-08-04, #348) — same two edits as run_procedures above. This runner is the
  // one that was RED on pwr_stuck_porv, and it was right to be: it runs the plant the player
  // actually gets.
  // UNCHANGED at 29/29 262/262 through the 2026-08-06 #395 extraction of its whole
  // replay machinery to test/procedures_harness.js — that score IS the
  // refactor-neutrality assertion, measured before and after.
  'run_procedures_stack.js': { code: 0, secs: 102, score: '29/29 262/262' },
  // NEW 2026-08-06 (#395/#396): the CONTINUOUS operating day, the assertion both
  // reloading gates are blind to by construction (each reloads proc.from per
  // procedure). ONE service: pwr_heatup (arrives Mode 3 at 856.8 ppm — the seam's
  // premise, pinned), the #395 seam probe (startup's boron precondition row UNMET
  // with the Mode-3 rows MET — exactly the seam named), the documented remedy
  // (PWR-N02 step 15 dilution via the boron_conc target; arrives in 55.6
  // plant-min against the manual's ~58), the probe again (all MET, comment down),
  // then pwr_startup ON THE CONTINUOUS PLANT: zero refusals (the two step-14/15
  // trip blocks that #396 measured REFUSED are accepted), never scrams, and the
  // day ends critical at 10.75 % — Mode 1. raise/lower/shutdown/cooldown are
  // deliberately NOT chained: their acc values are authored against their own ICs
  // and no procedure bridges ~10 % to 50 % (the known Tier B content gap, #319) —
  // chaining them would be authoring content inside a gate. Injection-verified:
  // dilution skipped reproduces #396 (see the runner header for the measured
  // signature); the precondition-evaluation injection reds the probes.
  'run_procedures_chain.js': { code: 0, secs: 71, score: '50/50' },

  // ---- known reds (each is a tracked issue; do not "fix" by editing the number) ----
  'run_ops.js': {
    secs: 122,   // scheduling hint only — see the longest-first note in main()
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
    // 59/69 351/11 -> 58/69 350/12 on 2026-08-04 (#330). A NEW PWR RED, and the first in
    // a long time — flagged rather than absorbed. `ops_cvcs_pzr_drain_rate` measures
    // 53.7 s for its 15-point pressurizer drop against a ">= 300 s" acceptance, because
    // that acceptance is a direct product of `level_per_mass` (0.030 · gain ·
    // level_per_mass) and #330 corrected that constant 100 -> 776. The probe is
    // DELIBERATELY NOT re-banded: it exists because of a 2026-07-22 owner request for a
    // pressurizer drain-rate feel target, and re-banding it whenever the plant moves
    // would retire the target instead of reporting against it. The trade-off is measured
    // both ways in the probe's own comment (test/ops_pwr.js) and put to the owner on the
    // issue. RULED *(OWNER RULING, 2026-08-04: "A")* — ship the corrected geometry and
    // accept the faster drain. So this red is an ACCEPTED, RULED state, not a regression
    // and not a pending question: do not re-band the threshold to clear it.
    // 350 -> 351 passed on 2026-08-07: abuse_porv_walkaway's size-fact leg re-authored
    // to the proportional-valve ruling — full injection BEATS one wide-open plant-sized
    // valve (74.7 % min inventory held), the 1979 counterfactual as a size fact. The
    // 12 tracked fails are unchanged: 6 RBMK + 4 BWR (on hold) + the PWR drain-rate
    // probe, which now reads 284.3 s against its ruled >= 300 s target (was 53.7 —
    // the #408 real CVCS scale nearly delivers the owner's original feel target; the
    // probe stays red by the 2026-08-04 "A" ruling and must not be re-banded).
    // 58/69 351/12 -> 59/70 359/12 on 2026-08-09 (#403): +ops_alarm_dropout_hold, and the
    // harness now passes evaluate()'s dt at both stepping call sites. The fix moved NO
    // verdict — the same 11 scenarios fail before and after — because no probe was
    // asserting an alarm CLEAR time, which is exactly why the divergence survived from
    // the day the harness was written. Measured at the harness: msiv_closed lit, then its
    // condition cleared — dt omitted clears at 0.1 s (the cadence, i.e. immediately),
    // dt passed clears at 2.0 s = alarm_min_on_s. RBMK and BWR are untouched by
    // construction, not by care: neither control module defines alarm_min_on_s, so their
    // hold is 0 whatever dt arrives (checked, not assumed — both plants are on hold).
    // 359 -> 360 passed on 2026-08-12: Mode 5 now ships with the shutdown bank INSERTED
    // (the preset used to hand the player a plant whose trip rods were already out, which
    // did not even match this plant's own cooldown endpoint — measured, a scram leaves the
    // bank at 0/912 and nothing re-withdraws it). ops_shutdown_dilution ran an hour and
    // expected a source-range trip; at −4676 pcm instead of −1000 an hour no longer
    // reaches criticality (ρ = −1126 pcm at 3600 s, critical at 4733 s, trip at 4944 s).
    // The probe now runs two hours and keeps its original source-range assertion, which
    // passes on BOTH presets — plus one NEW check that the first hour does not reach
    // criticality, which is the shutdown margin asserted rather than assumed and would
    // have failed on the old preset. That is the +1. Reds unchanged at 12.
    code: 1, score: '59/70 360passed 12failed',
    note: 'Ops probes are tuning targets by design. #330 (2026-08-04) added a 12th red ' +
          'and it is the only PWR one: ops_cvcs_pzr_drain_rate, 284.3 s vs >= 300 s ' +
          '(3.2 %/min, re-measured 2026-08-07 after #408 wave 1 put CVCS on the real scale; ' +
          'it read 53.7 s from #330 until then, so the probe went from 7.76x PAST its target ' +
          'to just short of it WITHOUT the threshold moving — which is the whole argument for ' +
          'not re-banding a feel target when the plant moves under it). ' +
          'RULED (OWNER RULING, 2026-08-04: "A") — the corrected pressurizer geometry ' +
          'ships and the faster drain is accepted; the threshold is NOT to be re-banded. ' +
          'See the probe comment for both costed options. ' +
          'Measured 2026-07-27b from ' +
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
  'verify_flags_ui.js':      { code: 0, secs: 9, score: '42/42' },
  // #472 phase 3a. DISPOSABLE — delete this entry with the gate at cutover. It asserts that
  // all 33 carriers of pwr_pressurizer.js also carry pwr_pressurizer2.js and in the right
  // ORDER, because pwr_engine.js:22 caches its pressurizer at load time: v2 after the engine
  // swaps the global for the late-binding readers while the engine keeps calling v1, and the
  // plant runs HALF of each model. Injection-verified both directions (strip one carrier;
  // move one v2 line below the engine).
  'verify_pzr2_loadlists.js': { code: 0, secs: 1, score: '4checks 0failed' },
  'verify_e2e_ui.js':        { code: 0, secs: 58, score: '4screenshots', slow: true },   // 16 -> 4 (#514, 2026-08-25): PWR-only — the shell no longer loads RBMK/BWR, and app.js falls back to the PWR on an absent engine, so an rbmk/bwr row would silently screenshot the PWR and certify nothing. The #111 strict xfail (manual unit conversion) is PWR-side and stays.
  // 179 / 202 -> MEASURED ON THE MERGED TREE, 2026-08-04. BOTH lanes wrote a runner for
  // board_check in the same session, independently, neither knowing about the other —
  // develop's landed at 179 (188 minus the nine ROD-status-word pins that went out with
  // the word itself) and workbench's at 202 (188 plus fourteen from the owner's board
  // walk-round). The merged harness is neither, and it is not 179 + 202 - 188 either,
  // because one of the walk-round pins asserted the clearance of the very status word
  // the other lane deleted. MEASURED after resolving, which is the only way this file
  // has ever been right about this number.
  //
  // The surviving runner is develop's — thinner, and it documents a trap the other
  // avoided only by luck (reading `body.textContent` picks up <script> source, and this
  // page's own comments contain the string "1 FAILURE/143") — plus two properties
  // ported from workbench's: a PINNED viewport, because the geometry pins measure
  // rendered rects and would otherwise pass or fail on the window they happened to get,
  // and an echo of the harness's own FAIL lines, so a red is diagnosable from the gate
  // output instead of requiring someone to reopen the page by hand.
  // 192 -> 194 on 2026-08-04 (ALL-CAPS board text, owner directive): the caps policy plus its
  // NON-VACUITY guard. Enforced over the RENDERED board, not the sources, because board text
  // arrives from three places — the GENERATED pwr_board_data.js, DOC_PATCHES and driver-supplied
  // strings — and only the DOM sees all three; that is what makes it survive a re-export.
  // Units are exempt as WHOLE TOKENS, never substrings: stripping "psi" or a bare "s" anywhere
  // would eat the s out of ordinary prose and mask a real violation. The second check exists
  // because a policy scan that reached nothing passes for the wrong reason (#306) — it asserts
  // >= 150 leaf text nodes against the 225 the shipped board renders.
  // INJECTION-VERIFIED both ways: restoring one DOC_PATCHES entry to "Turbine" AND one wiring
  // literal to "Reactor trip · loss of flow (P-7 permissive)" reddens it and NAMES both
  // offenders, so a red here is diagnosable without reopening the page.
  // 209 → 214 (2026-08-06, #392): +2 for the turbine exhaust run — a MIRROR pin on the
  // first waypoint against `turbineGenerator/exhaust-out`, and a crossover-clearance pin
  // that the run's horizontal leg sits between the two tiles. Only the LAST waypoint was
  // pinned before, which is exactly how the #371b re-export left the first one inside the
  // TURBINE-GENERATOR card for a day with every gate green; a one-sided pin on a two-ended
  // run is not coverage, and the clearance pin is the one that describes the SYMPTOM (two
  // plumb pins both pass on a run drawn at any y). +3 for the vital-gauge sparklines, the
  // first pins on that component's trace maths: a one-sample spike survives decimation
  // (0.0 px above the flat trace under the old index stride — a spike vanishing outright
  // from a VITAL gauge — against 16+ px now), a rising trend does not re-project drawn
  // history every paint (60 of 60 paints moved vertices under a raw per-paint re-fit), and
  // the trace is not blank at 3600x (1 vertex on the old fixed 180 s window, 230 now).
  // They drive the component through `RD.PwrBoard.componentInstance()`, added for them —
  // going through render() would make the input a moving plant and every assertion
  // timing-dependent.
  // 214 -> 215 (2026-08-06): the trace must stay INSIDE the card. The sparkline svg is
  // overflow:visible, so a vertex outside the viewBox does not clip — it draws on the BOARD.
  // That shipped: the held axis clamped itself to the tile's declared scale, so a reading
  // outside that scale fell outside [lo,hi] and plotted below the box, down across the gauge
  // band. Found from an owner screenshot, because nothing here looked at the trace's
  // GEOMETRY — the three pins above all measure its shape or its content. Injection-verified:
  // reverting both halves of the fix gives 229 vertices outside, above and below scale.
  // A FOURTH was drafted and CUT for not discriminating: "history translates rigidly as it
  // scrolls" stayed GREEN against both defects it describes (a moving-origin bucket grid
  // and a per-paint re-fit) while the held-axis pin went red on both. The held-axis pin was
  // hollow on its first draft too — a ±0.4 psi wobble is floored by MIN_WINDOW to the same
  // range either way, so the discriminator had to be a RAMP.
  // 205 → 211 (2026-08-05, #371): the ADV card's pins — its shipped lineup is
  // asserted (so a future change to the default has to edit the line — which is
  // exactly what happened on 2026-08-06 when it went SHUT → AUTO), AUTO/SHUT
  // both drive the engine, the setpoint box converts, and its range hint carries
  // the unit the tile itself deliberately omits.
  // 211 → 209 (2026-08-05, #371): the owner's diagram re-export retires `imrzmlyafa3`,
  // the labelled STEAM DUMP readout — dragged off the canvas with a schematic-side % tag
  // put beside the dump valve in its place — so its two geometry pins (label-fits-tile,
  // clear-of-the-dump-valve) go with it rather than being kept alive against an item that
  // no longer renders. Net -2. Everything else the re-export moved was re-pinned, not
  // dropped: four pipe ids, five item ids, two re-measured runs and the rod-card spacing.
  'verify_deploy_check.js': { code: 0, score: '20checks 0failed' },   // NEW (2026-08-19, #494/#496): runs `tools/verify_release_deploy.js --self-test`. That tool is the §5b release gate and has failed SIX times, every one found by a person at a release because NOTHING RAN IT. Five of the six were decision logic or parsing — pure functions — so they are now pinned: the verdict table over all six (record x served) states, wrangler's TABLE shape (`Source` is the SHORT sha, `Status` is a relative TIME on success and the literal "Failure" on failure), the version stamp, and the error-line scan. The two rows carrying history are (record, served=false) -> NOT LIVE, which is the Alpha 1.0.0 shape the tool reported LIVE for until 2026-08-19, and (no record, served=true) -> LIVE, which is #494. Injection-verified SEVEN ways: reverting the record-outranks-domain logic reds 3, the failure-(3) API field names red 3, dropping the build OUTCOME check reds 1, taking the channel instead of the sha reds 2, stderr-only firstError reds 1, dropping the [code: NNNN] preference reds 1, and removing the caveat wording reds 1. IT CANNOT SEE A FORMAT MOVE: the fixtures are copies, so if wrangler's output or the site's stamp changes these stay green while the real check breaks — which is failure (3) exactly. A green here never retires the §5b step.
  'verify_board_check.js':   { code: 0, secs: 2, score: '225checks' },   // 224 -> 225 (#507 wave 7): the power tile arms at the ENGINE-carried setpoint — a trip_block_status entry with `setpoint: 35` overrides the static pwr1 row (TRIP 35% on a pwr2 startup, never the table's 25); entries without a setpoint stay bit-identical.   // 222 -> 224 (#506.7, 2026-08-22): the powerTile selfTest fixtures carry trip_block_status (presence is the new arming gate) + two cases — the legacy tbs-less shape keeps the old armed reading bit-identical, and the pwr2 shape (tbs empty) gets authored bands with no "TRIP 25%".   // 215 -> 222 (2026-08-08, #358): +2 functional pins (SBO corner reads NO FLOW pre-SAT, gpm demand box ambers) + 5 selfTest cases for the delivery predicate. Injection-verified: blanking feedNoFlow's flow term reds all of them on the old lying behavior.
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
  // 183 -> 198 on 2026-08-03 (#319): PWR-T06's five controlled steps, 3 checks each. Its
  // STEP_UI entries went in with the procedure, so this number and run_manual_controls moved
  // together — the #224 trap is a step that lands WITHOUT its map entry and reads as covered.
  // 258 -> 261 (2026-08-04, #348): the SGTR SI-termination step, 3 checks per controlled step.
  // 261 -> 264 (2026-08-12, #468): PWR-N01 step 2a, "withdraw the shutdown bank". THREE
  // checks per controlled step, not one — manual pill, board bar, and instructor-follow —
  // read off the gate's own manual-follow-ui.log rather than inferred from the delta:
  //   OK pwr · pwr_heatup step 3: manual pill "Shutdown Bank"
  //   OK pwr · pwr_heatup step 3: board bar  "Shutdown Bank"
  //   OK pwr · pwr_heatup follow step 3 Instructor + bar
  // That is also the assurance worth having here: the step points at a control the player
  // can actually reach on the board in a real browser, which no Node gate can tell you.
  'verify_manual_follow.js': { code: 0, secs: 115, score: '225checks', slow: true },   // 264 -> 225 (#514, 2026-08-25): PWR-only, same reason and same change as verify_e2e_ui — an ?engine=rbmk_pre follow cannot start on a shell that does not load that engine (the nav renders hidden; this gate timed out on it). The rbmk/bwr rows in manual_ui_map.js stay as data.
  // NEW 2026-08-08 (#387): freshness gate for the GENERATED ui/manual_data.js — every
  // cfg.instruments key has an indications entry and none ships name === id (the I-12
  // raw-id fallback). Landed against a file that had been stale since 2026-07-31 with
  // 14 instruments missing from the Failures-tab picker; injection-verified (the gate
  // reds 14 against that committed file). 148 = 49 instruments × both directions + the
  // 49 name scans + the non-empty check; the count moves with the instrument set, and
  // updating it here is the acknowledgement.
  'verify_manual_data.js':   { code: 0, score: '151checks 0failed' },   // 148 -> 151 (#386 stage 3): the ctmt_h2 analyzer joins the picker — the gate landed hours before the instrument and enforced its display entry, which is the sequencing it exists for
};

/* Runners that write reports into Diagnostic/ as a side effect — an aggregate run
 * dirties the working tree, which is expected, not a bug. */
var DIRTIES_TREE = ['run_behavior.js', 'run_behavior_b.js', 'run_behavior_c.js',
                    'run_meltdown.js', 'run_ops.js'];

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

// Spawn one runner and buffer everything it says. Async twin of the spawnSync this used to
// do — the runners were ALREADY independent processes whose output was fully buffered before
// being scored, which is the property that made going parallel a scheduling change rather
// than a test change. Nothing about what is asserted moves.
//
// THE CHILD WRITES TO A FILE, NOT A PIPE, AND THAT IS LOAD-BEARING (2026-08-04).
// Every runner in this directory ends with `process.exit(code)`, and Node's own I/O contract
// says what that costs (docs, "process I/O — a note on process I/O"):
//
//     Files:        synchronous on Windows AND POSIX
//     TTYs:         asynchronous on Windows, synchronous on POSIX
//     Pipes/sockets: synchronous on Windows, ASYNCHRONOUS on POSIX
//
// `process.exit()` does not wait for an asynchronous write to drain, so a runner piped to a
// parent on Linux can exit 0 with the tail of its own output thrown away. Locally that is
// invisible twice over: a developer running a runner by hand gets a TTY (synchronous on
// POSIX), and this parent runs on Windows, where pipes are synchronous anyway.
//
// MEASURED, on CI: `run_m4` came back **exit 0 with no tally**, twice, and the two runs
// stopped at DIFFERENT points mid-suite. Exit 0 is what rules out every other candidate —
// an OOM kill, a crash and a timeout all show a non-zero code, and run_m4 is fine under a
// 192 MB heap. It surfaced when the pool went 3-way on CI's 4 cores: three children writing
// while one reader keeps up with none of them is what makes the parent lag far enough behind
// for the loss to bite, and the runner with the most output goes first.
//
// A file redirect makes the child's stdout synchronous on both platforms, which fixes the
// whole CLASS in one place. The alternative was editing `process.exit` in 38 runners and
// hoping the next one written remembers.
function runOne(f) {
  return new Promise(function (resolve) {
    var t0 = Date.now();
    var tmp = path.join(os.tmpdir(),
      'rd_gate_' + process.pid + '_' + f.replace(/[^a-z0-9]+/gi, '_') + '.log');
    var fd;
    try { fd = fs.openSync(tmp, 'w'); }
    catch (e) { resolve({ file: f, out: 'could not open capture file: ' + e.message, code: -1, secs: '0.0' }); return; }
    // NODE_COMPILE_CACHE (#513): one shared V8 code cache for every child, so the 89th
    // runner to require the 1.22 MB pwr_control stack reuses the first one's compile
    // instead of re-parsing it. Content-hashed by V8, so staleness cannot bite; lives in
    // os.tmpdir() so the repo tree stays clean; env-overridable. It caches require()d
    // modules only — the mutation harnesses' `new Function`/eval replays never touch it.
    // Deliberately NOT persisted across CI runs (no actions/cache): the win is the 89
    // children sharing within one run, and cross-run adds restore latency + a moving part
    // to a workflow that has been burned twice (see .github/workflows/gates.yml header).
    var child = cp.spawn(process.execPath, [path.join(TEST_DIR, f)],
      { cwd: path.join(TEST_DIR, '..'), stdio: ['ignore', fd, fd],
        env: Object.assign({}, process.env, {
          NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE ||
            path.join(os.tmpdir(), 'rd_compile_cache') }) });
    var spawnErr = '';
    child.on('error', function (e) { spawnErr = '\nspawn error: ' + (e && e.message) + '\n'; });
    child.on('close', function (code) {
      var out = '';
      try { fs.closeSync(fd); } catch (e) { /* already closed */ }
      try { out = fs.readFileSync(tmp, 'utf8'); } catch (e) { out = 'could not read capture file: ' + e.message; }
      try { fs.unlinkSync(tmp); } catch (e) { /* best effort */ }
      resolve({ file: f, out: out + spawnErr, code: code == null ? -1 : code,
                secs: ((Date.now() - t0) / 1000).toFixed(1) });
    });
  });
}

// Fixed-size worker pool. Results are collected BY INDEX so the summary, --record output and
// drift list stay in discovery order however the finishes interleave; only the live progress
// lines are in completion order, which is what tells you the thing is actually running wide.
function runPool(scripts, jobs, onDone) {
  var next = 0, out = new Array(scripts.length);
  function worker() {
    var i = next++;
    if (i >= scripts.length) return Promise.resolve();
    return runOne(scripts[i]).then(function (r) {
      out[i] = r;
      onDone(r);
      return worker();
    });
  }
  var ws = [];
  for (var w = 0; w < Math.min(jobs, scripts.length); w++) ws.push(worker());
  return Promise.all(ws).then(function () { return out; });
}

async function main() {
  var argv = process.argv.slice(2);
  var fast = argv.indexOf('--fast') >= 0;
  var record = argv.indexOf('--record') >= 0;
  var quiet = argv.indexOf('--quiet') >= 0;
  var onlyIx = argv.indexOf('--only');
  var only = onlyIx >= 0 && argv[onlyIx + 1] ? argv[onlyIx + 1].split(',') : null;
  // --jobs=N, default min(10, cores - 2). Leaves headroom so the machine stays usable and
  // the browser gates are not fighting the physics runners for the last core. `--jobs=1` is
  // the escape hatch: it restores the old sequential order exactly, which is what to reach
  // for if a runner is ever suspected of not being isolated.
  var jobsArg = argv.filter(function (a) { return /^--jobs=\d+$/.test(a); })[0];
  // `cores - 1`, capped at 10, floored at 2. The floor is what matters and it is MEASURED:
  // the first version was `cores - 2`, which is right on a workstation and wrong on CI —
  // GitHub's standard runner has FOUR cores, so it ran 2-way and the gate took 7m14s. Total
  // work is ~850 s there, so the pool width is most of the story on that machine. `cores - 1`
  // gives 3; it changes nothing locally, where min(10, 11) is still 10.
  //
  // MEASURED AFTERWARDS, and the prediction was OPTIMISTIC — record both, because the gap is
  // the useful part. Expected ~4.7 min; actual 7m14s -> 6m37s, a 37 s gain, not the ~2 min the
  // arithmetic implied. The arithmetic assumed the longest runner keeps its time while the
  // pool widens, and it does not: verify_manual_follow went 171.9 s -> 206.5 s under the third
  // worker. On a machine where ONE runner is the critical path, adding workers slows that
  // runner and gives back much of what it wins. Still a real improvement and still fixes the
  // 2-core degenerate case, so it stays — but do not widen further chasing the model. A fourth
  // worker on four cores would very likely be NEGATIVE.
  //
  // Leaving one core rather than two is safe because the runners are ordinary Node processes,
  // not latency-sensitive work — the only cost of being slightly greedy is that per-runner
  // times inflate further, and those are already contention times, not costs.
  var jobsArg2 = jobsArg ? parseInt(jobsArg.split('=')[1], 10) : 0;
  var JOBS = jobsArg2 ? Math.max(1, jobsArg2)
                      : Math.max(2, Math.min(10, require('os').cpus().length - 1));

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

  // LONGEST FIRST. Makespan on a fixed pool is dominated by when the slowest job STARTS, and
  // discovery order is alphabetical, which puts `verify_manual_follow` — the longest runner
  // by a factor of two — dead last. Sorting by the `secs` hint in BASELINES pulls the heavy
  // ones to the front; anything without a hint sorts as 0 and fills in behind them.
  //
  // THE HINTS CANNOT AFFECT CORRECTNESS. They are a scheduling nudge and nothing else: a
  // stale or missing number costs a slightly worse wall time and can never change a score, a
  // drift verdict or an exit code. Do not maintain them as if they were baselines.
  var order = scripts.slice().sort(function (a, b) {
    var sa = (BASELINES[a] && BASELINES[a].secs) || 0, sb = (BASELINES[b] && BASELINES[b].secs) || 0;
    return sb - sa || (a < b ? -1 : 1);
  });

  console.log(C.bold + 'Aggregate gate — ' + scripts.length + ' runners' + C.off +
    C.dim + '  (' + Math.min(JOBS, scripts.length) + '-way parallel)' + C.off +
    (fast ? C.dim + ' (--fast: browser gates skipped)' + C.off : ''));
  console.log('');

  var byFile = {};
  var done = 0;
  var raw = await runPool(order, JOBS, function (r) {
    var base = BASELINES[r.file] || null;
    var score = scrapeScore(r.out);
    var drift = [];
    if (!base) drift.push('no baseline recorded');
    else {
      if (r.code !== base.code) drift.push('exit ' + r.code + ' (baseline ' + base.code + ')');
      if (base.score && score !== base.score) drift.push('score ' + (score || '?') + ' (baseline ' + base.score + ')');
    }
    var ok = drift.length === 0;
    byFile[r.file] = { file: r.file, code: r.code, score: score, secs: r.secs, ok: ok,
                       drift: drift, out: r.out, base: base };
    done++;
    process.stdout.write((ok ? C.green + '  PASS' : C.red + '  DRIFT') + C.off +
      '  ' + r.file + Array(Math.max(1, 26 - r.file.length)).join(' ') +
      C.dim + (score || '—') + '  ' + r.secs + 's' +
      '  [' + done + '/' + order.length + ']' + C.off +
      (ok ? '' : '  ' + C.red + drift.join('; ') + C.off) + '\n');
  });
  void raw;

  // Back into DISCOVERY order for everything downstream — --record emits a BASELINES block
  // that a human pastes, and it must not be shuffled by which runner happened to finish first.
  var results = scripts.map(function (f) { return byFile[f]; }).filter(Boolean);

  if (!quiet) {
    results.filter(function (r) { return !r.ok; }).forEach(function (r) {
      console.log(C.red + '  ── ' + r.file + C.off);
      var tail = strip(r.out).trimEnd().split('\n').slice(-14);
      console.log(C.dim + tail.map(function (l) { return '      │ ' + l; }).join('\n') + C.off);
    });
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
