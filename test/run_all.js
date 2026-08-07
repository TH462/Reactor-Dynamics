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
  'run_pwr.js':            { code: 0, secs: 22, score: '36/36 244passed' },   // 243 -> 244 (#418 B1): save_migration asserts the t_sg_c split-interpolation seed   // 242 -> 243 (#418 A2): the sg_mass_frac inverse-map round-trip   // 241 -> 242 (#386 stage 1): the five containment fields
  'run_rbmk.js':           { code: 0, score: '23/23 150passed' },
  'run_bwr.js':            { code: 0, secs: 29, score: '15/15 92passed' },
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
  'run_behavior.js':       { code: 0, secs: 80, score: '65pass 1xfail' },
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
  'run_meltdown.js':       { code: 0, secs: 48, score: '12pass 0xfail' },
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
  'run_hardrules.js':      { code: 0, score: '228checks 0failed' },
  // NEW 2026-08-06-workbench-i. Budgets the ONE document that is auto-loaded into every
  // agent's context on every turn. Its caps were prose INSIDE the file they governed, and both
  // were being broken: 42,065 words under a "Keep it SHORT" heading, a single physical line of
  // 5,310, and 13 bullets in a themes region documented as "max 5". Injection-verified against
  // the real pre-cut file at HEAD~1 — all 3 checks red, exit 1. Thresholds carry headroom over
  // the measured 13,455 / 164 / 5, so ordinary work cannot trip them; if a cut ever has to fight
  // this gate the answer is a pointer into TUNING_LOG, not a bigger number.
  'run_doc_budget.js':     { code: 0, score: '3checks 0failed' },

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
  'run_contract.js':       { code: 0, score: '159checks 0failed' },
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
  'run_manual_controls.js': { code: 0, score: '174checks 0failed' },
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
  'run_flags.js':          { code: 0, score: '16/16 320/320' },
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
  'run_inspect.js':        { code: 0, score: '9/9 47/47' },
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
  // 124 → 125 (2026-08-05, #371): one more shipped script for the portable build to inline —
  // `ui/diagram/board/components/comp_atmospheric_dump.js`, the ADV's schematic component,
  // registered on the shell and on board_check. The guard counts shipped scripts, so a new
  // board component is exactly one check. MEASURED after `node tools/make_portable.js`.
  'run_portable.js':       { code: 0, score: '125checks 0failed' },
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
  'run_reachability.js':   { code: 0, score: '69checks 0failed' },
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
  'run_otdt.js':           { code: 0, secs: 21, score: '46checks 0failed' },
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
  // 16 -> 17 on 2026-08-07 with Alpha 1.3.0 — the same mechanism a fourth time. This key
  // moves on every RELEASE and on nothing else, so a bump here with no release in the same
  // change is the signal that something else added a check.
  'run_release.js':        { code: 0, score: '17checks 0failed' },
  // NEW 2026-08-06 — the public site's SOCIAL CARDS. Every page carried a RELATIVE
  // `og:image` ("site/hero.png") from launch, and Slack / Discord / iMessage / X do not
  // resolve a relative og:image, so every link ever shared into a chat rendered with no
  // preview picture. Invisible from inside the repo: the pages are correct html, the
  // image loads fine in a browser, and until this runner nothing here read those tags at
  // all. Changelog, Privacy and Legal had no card whatsoever — the block only ever
  // existed in the pages that already had it, so each new page started from zero.
  // THE PAGE LIST IS GLOBBED AND FILTERED THROUGH .vercelignore, deliberately: a
  // hand-kept list would have tested the list, passing at full marks on the very page it
  // had never heard of. VERIFIED BY INJECTION before baselining, which is the only reason
  // the number below means anything — the original bug reintroduced in one page scores
  // 116/3 (the count moves because the stray-url sweep emits a row naming it), a page
  // stripped of its card 115/13, and a stale og:image:width 115/1. 115 checks is
  // 8 pages × 14 + the discovery row and the hero-file row.
  'run_site_meta.js':      { code: 0, score: '115checks 0failed' },
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
  'run_m4.js':             { code: 0, score: '40/40 262passed' },
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
  'run_m5.js':             { code: 0, score: '23/23 104passed' },
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
  'run_autoctl.js':        { code: 0, secs: 19, score: '30/30' },
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
  'run_campaign.js':       { code: 0, secs: 383, score: '51/51 3034passed' },
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
  'run_procedures.js':     { code: 0, secs: 41, score: '29/29 141/141' },
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
  'run_procedures_stack.js': { code: 0, secs: 70, score: '29/29 262/262' },
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
  'run_procedures_chain.js': { code: 0, secs: 55, score: '50/50' },

  // ---- known reds (each is a tracked issue; do not "fix" by editing the number) ----
  'run_ops.js': {
    secs: 96,   // scheduling hint only — see the longest-first note in main()
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
    code: 1, score: '58/69 351passed 12failed',
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
  'verify_flags_ui.js':      { code: 0, secs: 17, score: '42/42' },
  'verify_e2e_ui.js':        { code: 0, secs: 54, score: '16screenshots', slow: true },
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
  'verify_board_check.js':   { code: 0, score: '215checks' },
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
  'verify_manual_follow.js': { code: 0, secs: 158, score: '261checks', slow: true },
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
    var child = cp.spawn(process.execPath, [path.join(TEST_DIR, f)],
      { cwd: path.join(TEST_DIR, '..'), stdio: ['ignore', fd, fd] });
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
