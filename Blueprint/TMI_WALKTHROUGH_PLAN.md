# TMI-2 incident walkthrough — the plan

**Status: PLAN — rulings R1–R4 given 2026-09-08 ("Do as recommended, start phase 0"); Phase 2 done
(commit `c6601740`, 2026-09-09), Phase 3 (playthroughs) in progress; Phases 0 and 1 done
2026-09-08. Phase 4 open — issue #670. Not binding
until executed; expires when done (CLAUDE.md "plans expire when executed").**
**§2's post-30-minute "re-measure in Phase 2" flags are DISCHARGED** — the numbers were re-taken
full-stack on the crew's own clocks and are in `inbox/tmi_phase2/MEASURED.md`; where they disagree
with §2, the measurement wins and §10's Phase 2 row lists the five that changed a step.
Written 2026-09-08 by the coordinating session from
`inbox/tmi_walkthrough_inventory.md` (1,064 lines of file:line facts; local, not tracked). Revised
2026-09-08 against Phase 0: every clock now comes from `inbox/tmi_timeline_sourced.md`
(NUREG/CR-1250 Vol. II Pt 2, Appendix II.1) and every plant number from the full-stack ride in
`inbox/tmi_phase0/RESULTS.md`. `Blueprint/PWR2_VALIDATION.md` §86 is no longer the plant authority
for anything past 30 minutes — see §2.

**The ask** *(OWNER, 2026-09-08: "plan the building of a three mile island incident walkthrough.
This walkthrough should have enough context in it so the user learns what happened during the
incident. It should include things like the operators actions and their reasoning behind them and
what they knew. These walkthroughs will include another element the last walkthroughs don't have,
these ones will automatically trigger failures behind the scenes.")*

---

## 1. What it is

A seventh walkthrough in the shipped plant's pool, `RD.MANUAL_PROCEDURES.pwr2`, id
`pwr_tmi2_incident`, kind **incident**. It starts from Hot Full Power and walks the player through
the first **four hours** of 28 March 1979 as the crew lived them: each step says what time it is,
what the crew saw on their board, what they knew and did not know, what they did and why — and
then has the player **do the same thing on this board**, including the three actions that made
the accident. The plant answers as PWR2 answers. Failures arrive behind the scenes, on the step
that needs them, without the player pressing anything in the Failures tab.

It runs in the walkthrough runtime as it stands after #660: one step at a time in the Instructor
tab, details always open, Continue lit only when the instruments say the step is done, Rewind
step available. Nothing about the runtime's grading changes; two things are added to the
**schema** (§3) and one to the **renderer** (§4).

It is NOT the chat-mode campaign module `scenarios/pwr_tmi2_p1/p2/p3` — that is authored
against the retired `pwr` engine and fenced off the shipped plant (`freePlayOnly`, #525). The
narrative in those 66 beats is good and gets **reused as text**; the beat engine does not.

## 2. What the plant can and cannot show — the honest envelope

Two authorities side by side, and neither is recall any more.

**Historical** — NUREG/CR-1250 Vol. II Part 2, Appendix II.1 (Rogovin), extracted into
`inbox/tmi_timeline_sourced.md` with a verbatim quote per row. The appendix quotes a **wall clock
for events 1 and 2 only** (04:00:36, 04:00:37) and gives *elapsed after initiation* for everything
else, so **every other wall clock below is DERIVED** by adding elapsed to 04:00:37 — arithmetic on
the source, not a quote from it.

**PWR2, full-stack, measured** — the Phase 0 ride of 2026-09-08 on `edaf8154`
(`inbox/tmi_phase0/RESULTS.md`, filed at
<https://github.com/TH462/Reactor-Dynamics/issues/670#issuecomment-5595332218>): service → control
layer → engine, from `hot_full_power`, driven exactly as `run_checklist_pwr2` drives a leg. All
nine scheduled commands were accepted, and the ride never latched `beyond_model` / `model_held`
(0 of 1,557 samples), so every step of §5 is reachable on one continuous plant.

| elapsed | clock | historical (sourced) | PWR2, full-stack, measured |
|---|---|---|---|
| −1 s | **04:00:36** *(quoted)* | condensate pump trips — the polisher | no polisher model; the initiator is **told**, not injected |
| 0 s | **04:00:37** *(quoted)* | main feed pumps trip; turbine trips; AFW pumps start into block valves already shut | `loss_of_feedwater` + `afw_failure` (hidden) |
| 3 s | 04:00:40 | PORV opens (setpoint 2255 psig / 15.55 MPa) | lifts at **5 s, 2346 psia (16.18 MPa)** — only with the anticipatory trip defeated (§9 R3, ruled). *(The digits coincide with the historical reactimeter peak below; different plants, different units — not a copy error.)* |
| 8 s | 04:00:45 | reactor trips on high pressure (setpoint 2355 psig; reactimeter peak 2346 psig) | trips at **43 s on over-temperature ΔT** — this plant's PORV is 3.6× TMI-2's per MWt and turns the pressure first. A **declared divergence**, carried in §5 step 3's `why` |
| 13 s | 04:00:50 | PORV fails to close; the lamp shows the solenoid de-energised — *"There is no actual position indicator."* | `stuck_porv_open` (latches on the lift) + `porv_indicator_stuck_closed` |
| 15 s | 04:00:52 | pressurizer level peaks at 255 in; *"RCS parameters are normal."* | — |
| 30 s | 04:01:07 | PORV tailpipe high-temperature alarm (239 °F / 115 °C) — dismissed | tailpipe temperature above hot-leg temperature; the §5 step 4 cue |
| 1 min 18 s | 04:01:55 | both steam generators dry out | at 1 min: **1705 psia (11.76 MPa), level 67 %, 98.5 % mass** |
| 2 min 2 s | 04:02:39 | HPI starts automatically on low RCS pressure (1600 psig / 11.03 MPa) | SI actuates at **65.5 s** on low pressurizer pressure |
| 3 min 13 s | 04:03:50 | **operator bypasses the safety-injection actuation signal** | the trip-block **BLOCK** row for `si_trip` (`pwr2_shell.js` `set_trip_block` → `si_block`), permissive **P-11**, ~1970 psig (13.6 MPa). **Acceptance at this clock: re-measure full-stack in Phase 2** |
| 4 min 30 s | 04:05:07 | HPI throttled — on a level still *rising*, not pegged | **ECCS STOP first accepted at 2.09 min** and accepted on the ride itself at **4.50 min**; plant at 4.5 min **1045 psia (7.21 MPa), level 100 %, 97.2 % mass** — the deception is emergent |
| 4 min 52 s – 4 min 58 s | 04:05:29 | letdown raised to its high limit, part of the *same* action; alarms above 160 gpm | — |
| 5 min 0 s | 04:05:37 | pressurizer level peaks at 377 in | level is already pegged at 100 % here |
| 5 min 50 s | 04:06:27 | RCS reaches saturation | board subcooling margin **0.0 at 5 min**; hot leg first reads above saturation at **2.7 min** |
| 5 min 51 s | 04:06:28 | level goes **off scale high** (> 400 in) | — |
| 8 min | 04:08:37 | AFW block valves found shut and opened | the player's own `set_afw_block` takes flow 0.000 → **1.000 within 30 s**; plant **1049 psia (7.23 MPa), 90.8 % mass** |
| 10 min | 04:10:37 | first RCP high-vibration alarm — *"Indication of voids in system. Apparently not recognized."* | `rcp_cavitating` TRUE from **2.6 min** — indication only, no damage, no auto-trip |
| 30 min | 04:30:37 | RCS near saturation, and stays there | **967 psia (6.67 MPa), 53.8 % mass** — the **last row that agrees with §86** (3.4 % on pressure, 4.2 points on mass) |
| 57 min | 04:57 | — | **subcooling margin pegs on its −50.4 °F (−28 °C) floor** and stays there to ~150 min (526 of 1,557 samples) |
| 1 h 13 min | 05:13:37 | loop B reactor coolant pumps secured | a real handswitch. **Re-measure full-stack in Phase 2** |
| 1 h 41 min | 05:41:37 | loop A pumps secured — all forced flow stops | a real handswitch. **Re-measure full-stack in Phase 2** |
| 2 h 11 min | 06:11:37 | loop A hot leg **off the top of the scale** — *"TAVE will not be correctly shown."* | **the hot leg never pegs on PWR2** (see below); the pegged instrument here is the **subcooling margin**. **Re-measure full-stack in Phase 2** |
| 2 h 18 min | 06:18:37 | PORV block valve closed — then reopened 3 h 12 min, shut ~3 h 30 min, reopened 3 h 41 min. **The 3 h 56 min event is NOT a fourth closure: it is a safety-injection actuation, injection at maximum** (§II.A; `Manuals/08_ACCIDENT_TMI.md` §5.0) | the loss ends when the player shuts it. Re-measured Phase 2: the close is accepted at its clock and pressure is past 750 psia (5.17 MPa) at 139.8 min |
| 2 h 45 min | 06:45:37 | radiation alarms — *"indicative of extensive fuel damage"* | **not modelled.** Core uncovery is a void proxy and the cladding does not heat — measured **555 °F (290.6 °C) at 94 % uncovered** (`Blueprint/PWR2_VALIDATION.md` §83; the homogeneous core credits residual steam flow with cooling every rod) |
| 3 h 20 min | 07:20:37 | HPI restored manually — **not sustained**; injection rationed from the BWST low-level alarm | at 260 min the plant is **1505 psia (10.38 MPa), 78.0 % mass, alive**. **Re-measure full-stack in Phase 2** |
| 9 h 50 min | 13:50:37 | hydrogen burn in containment, 28 psig (1.93 barg) peak | **not modelled** (`ctmt_h2_burned` is a static 0) |
| 15 h 50 min | 19:50:37 | RCP restarted; forced circulation restored | a real handswitch |

**Everything past 30 minutes is provisional and must be re-measured in Phase 2.** To 15 minutes the
full stack, today's engine-direct ride and §86 agree within 3 %; at 30 minutes within 3.4 %. **From
50 minutes the shipped stack leaves both engine-direct rides, and the cause is measured, not
inferred: the auxiliary-feed level-hold channel** — a control-layer automation channel that only
`simulation_service.js` ever ticks. It throttles auxiliary feed to 0.18 of rated at 30 min and 0.15
at 50 min (engine-direct it runs wide open for ever and floods the steam generator to 231 % of
nominal), so on the shipped plant the primary **holds ~1020 psia (7.03 MPa)** instead of falling to
649 psia (4.48 MPa).

**The "accumulators dump at ~0:55" row is DELETED as false for the shipped stack.** Measured on the
full stack the accumulators are **100 % full at 60 min** and have bled only to 86 % by 120 min; they
never dump. That row was inherited from §86, which is engine-direct — the house trap, an inherited
number that is wrong until measured against the plant the player actually gets.

**The hot leg never reads off scale on PWR2.** Its detector spans 32–752 °F (0–400 °C) and the whole
ride's peak reading is **632.0 °F (333.3 °C)** at 232 min, 120 °F (67 °C) below the top of scale.
TMI-2's hot legs pegging their meters cannot be shown by this instrument. What **can** peg is the
**subcooling margin**: derived, clipped to −50.4…+149.4 °F (−28…+83 °C), datumed on the hotter of
bulk Tavg and the core-exit thermocouple (NUREG-0737 II.F.2), and sitting hard on its −50.4 °F
(−28 °C) floor **from 57 min**. That is this plant's "the instrument has run out of scale", and it
is what §5 step 13 is graded on.

So the walkthrough can **simulate** the initiator, the stuck valve and its lamp, the safety-injection
bypass, the deception, the throttled HPI and the letdown, the found AFW valves, the saturation and
the pump securing, the block valve and the recovery — everything the crew did in the control room —
and must **narrate** the fuel damage and the burn. It says so to the player, in one step, in the
plant's own words (§5 step 16). This is the declared departure Design Criteria Q3 requires; the
physics gap is #515 gap 1 and is not this plan's to close (§9 R2, ruled).

## 3. Two schema additions

Both are step fields in `ui/manual_procedures.js`, graded by `layers/instructor_layer.js`, and
both must be issued by the replay harness so `run_checklist_pwr2` keeps driving the leg end to end.

**`inject`** — failures that fire behind the scenes.
```js
inject: [
  { failure: 'stuck_porv_open' },                              // at the step's first tick
  { failure: 'afw_failure', when: { p: 'turbine_tripped', op: '>', v: 0 } },   // when a condition holds
],
clear: ['porv_indicator_stuck_closed'],                        // same shapes, descending as clear_failure
```
Fires once per step entry (re-entry after Rewind fires again — the checkpoint restored the plant to
before the injection, so it must). Hook: the first tick of a step in `_stepChecklist`
(`instructor_layer.js` ~:665, the `stepAt == null` branch) plus a per-tick `when` check, both
descending through `this.below.handleCommand({ action: 'inject_failure', … })` exactly as the
beat engine's `beat.inject_failures` does (`:294-300`). Harness: one `issue()` call at
`test/procedures_harness.js:186-200` and the two sites in `test/run_checklist_pwr2.js`
(`:125-132`, `:390-394`).

**`story`** — the narrative block.
```js
story: { clock: '04:00:37', saw: '…', knew: '…', did: '…' }
```
Four short fields, each ≤ 2 sentences, rendered as one block ABOVE the numbered instruction
("What the crew saw / knew / did"). `why` keeps its job — the plant lesson of the step — and its
4-sentence cap. Long-form narrative lives in `Manuals/08_ACCIDENT_TMI.md`, rewritten against
PWR2 (it currently names retired ids and a hydrogen burn this plant does not have), and each step
cites its section. The style gates (`checklist_no_si`, `checklist_why_length`,
`run_style`'s banned words) bind `story` exactly as they bind `text`/`why`.

A third, optional: **`crew`** on a DO step — `crew: true` draws the tag *"the crew's action, as
taken — not a recommendation"* on the card. It is what lets a step tell the player to press ECCS
STOP without the walkthrough endorsing it.

## 4. Renderer

One addition to `renderChecklist` in `ui/app.js`: the `story` block above the instruction, and
the `crew` tag. The "Step X of N" header prints the historical clock beside it
(`Step 7 of 16 · 04:05`). Nothing else; Continue/Rewind/status line are as built.

## 5. The steps (draft — the authoring pass re-measures every plant number)

**Every clock is now sourced** to NUREG/CR-1250 Vol. II Pt 2 Appendix II.1 via
`inbox/tmi_timeline_sourced.md`; 04:00:36 and 04:00:37 are quoted from the appendix and the rest are
derived from its elapsed times. "DO" steps are graded on the **effect**, never on the press (guide
R7, P15). The player's actions marked **crew** are the historical mistakes. Quote fragments in the
one-line cells are the appendix's or Volume I's own words, for the authoring pass to start from.

| # | clock | kind | the step, in one line | acceptance (draft) | inject |
|---|---|---|---|---|---|
| 1 | 04:00 | VERIFY | 97 % power, a routine night. The setup, said out loud: this plant's anticipatory trip is taken out of service so the relief valve can lift as TMI-2's did (§9 R3, ruled). | power > 90 % | `anticipatory_trip_failure` |
| 2 | 04:00:37 | VERIFY | The condensate pump trips one second earlier (04:00:36, told); main feed and the turbine follow. Verify FEED FLOW 0, TURBINE TRIP lit. | feed flow ≈ 0, turbine tripped | `loss_of_feedwater`, `afw_failure` (hidden), **`stuck_porv_open` + `porv_indicator_stuck_closed` — armed HERE, not on step 3**: the valve lifts at 5.5 s and reseats near 25 s, so the arm has a **20-second window** (measured at nine arm times: 0/2/5/10/15/20 s → the accident; 30/45/60 s → the valve reseats at 1985 psia (13.69 MPa) and there is no accident at all) |
| 3 | 04:00:40–45 | VERIFY | The relief valve lifts at 3 s; the reactor trips at 8 s on high pressure. **On this plant the trip comes at 43 s on over-temperature ΔT** — the declared divergence, and it lives in this step's `why`. | scrammed | **nothing** — both PORV failures are armed on step 2, inside the 20-second window |
| 4 | 04:00:50 / 04:01:07 | VERIFY | The lamp says closed and the tailpipe is hot: *"Light 'off' indicates solenoid deenergized. There is no actual position indicator."* | tailpipe temp > hot-leg temp | — |
| 5 | 04:02:39 | VERIFY | Safety injection starts on its own, on low pressure. Verify ECCS running. *(PWR2 actuates at 65 s.)* | hhsi running | — |
| 6 | 04:03:50 | **DO, crew** | Before touching a valve, the crew **bypasses the safety-injection actuation signal**. | the BLOCK row for `si_trip` requested (`set_trip_block` → `si_block`), permissive P-11 — **measure in Phase 2: is the block accepted at the pressure of 04:03?** | — |
| 7 | 04:05:07 – 04:05:29 | **DO, crew** | Level is *rising fast*, not pegged: throttle injection and open letdown to its high limit in one action — *"the condition to avoid at all costs is 'going solid'"*. | ECCS STOP accepted (measured accepted at 4.50 min; window opens 2.09 min) **and** letdown at max | — |
| 8 | 04:06:28 | VERIFY | A minute and a half later the level goes off the top of the scale — *"the only credible check on the amount of coolant… is the pressurizer level"*. The deception. | pzr level pegged high | — |
| 9 | 04:06:27 / 04:10:37 | VERIFY | The RCS reaches saturation; the first pump high-vibration alarm follows — *"Indication of voids in system. Apparently not recognized."* | subcooling ≤ 0, `rcp_cavitating` | — |
| 10 | 04:08:37 | DO | The AFW pumps have run eight minutes delivering nothing — *"low OTSG level, low steam pressure, high emergency feedwater discharge pressure"*. Open the block valves. | AFW flow > 0 *(the player's own valve restores flow — measured; no `clear` needed, one cosmetic `clear: ['afw_failure']` optional)* | — |
| 11 | 05:13:37 | **DO, crew** | Loop B pumps shaking — *"The pump has been operating without adequate suction head."* Secure them. | loop B RCPs secured | — |
| 12 | 05:41:37 | VERIFY | Loop A the same, and now — *"circulation of coolant decreased drastically, because natural circulation was blocked by steam"*. **No `crew` tag: this plant has ONE reactor-coolant-pump handswitch (`sys.pumpTripped`, a single boolean), so loop A is not a second press — step 12 is the consequence at loop A's clock and asks the player for nothing. THREE crew-tagged steps in the leg, not four (6, 7, 11).** | all RCPs secured | — |
| 13 | 06:11:37 | VERIFY | The loop A hot leg goes off the top of its scale — *"TAVE will not be correctly shown."* **This board's version is the SUBCOOLING MARGIN hard on its floor.** | subcooling margin at its −50.4 °F (−28 °C) floor *(needs `subcooling_c` mapped in `PARAM_INSTRUMENT.pwr2` — Phase 1; floor timing **re-measure in Phase 2**)* | — |
| 14 | 06:18:37 | DO | A relieving shift supervisor asks the question nobody had — *"Mehler dismisses the pressurizer level reading and moves to a fresh conclusion"*. Close the block valve. Narrate that the crew reopened it at 3 h 12 min, shut it again ~3 h 30 min and reopened it at 3 h 41 min. **Do not write 3 h 56 min as a fourth closure — that event is a safety-injection actuation with injection at maximum** (§II.A). | PORV flow 0, pressure rising | — |
| 15 | 07:20:37 | DO | Restore injection by hand. It was **not sustained** historically — *"There was thus an inclination to use ES as little as possible."* | hhsi running, pressure rising **(re-measure in Phase 2)** | — |
| 16 | 13:50:37 / 19:50:37 | VERIFY | Epilogue, narrated: the 13:50 hydrogen burn heard as a thump, the 19:50 pump restart that re-established core cooling, and the core found damaged — *"all will grope in bewilderment for another whole day before the truth strikes."* | read-and-continue; the model's **declared gap** (§2) | — |

Sixteen steps, ~260 minutes of plant time plus the epilogue. Steps 9 and 10 straddle each other on
the clock (04:06/04:10 against 04:08:37) because the cue and the discovery interleaved; the
authoring pass places 10's action after 9's observation and says so. Each step's `story` names what
the crew could see on THEIR board, so the player learns the deception from the same instruments.

Three things Phase 0 settled about this table, so the authoring pass does not re-litigate them:
**step 7's ECCS STOP is accepted** at its clock (the window opens at 2.09 min; pressing it before
1.09 min is accepted and does nothing, because injection has not started) · **step 10 needs no
`clear`** — the player's own valve takes AFW flow to rated inside 30 s · **step 9's cues stand from
2.6 min**, so its `why` must carry the 71-minute wait rather than present them as fresh, which is
the better lesson anyway: why a crew watches a shaking pump for an hour.

## 6. Time and the clock

An incident walkthrough spends its life in alarm, which the clock rules were written against:
- A **standing** alarmed board is favourable: `_boardQuiet` is false once any warning stands, so
  the cascade does not drop the tier alarm by alarm.
- Every **injection** drops the clock to 1× (`'failure'`), and every **step check-off** drops it
  (`'step'`). Both are the step's own event — the player is meant to look. Accepted as built.
- **WARP is available everywhere on this ride — measured, not assumed.** `_warpBlocked()` sampled
  every 10 plant-seconds across 1,557 samples: **≥ 99 % eligible in every window** and **100 % from
  5 min to 200 min**; the only refusals are `plant in transient`, ×1 in 0–5 min and ×3 in
  200–260 min. **60× is never refused** — `_setSpeed` refuses only the WARP rungs (≥ 600×) and
  anything above 1× while the plant declares `speed_hold`, and `speed_hold` was **null at all 1,557
  samples**. So `wait_hint` can promise the fast clock through the long waits.
- **The clock dropped to 1× exactly twice in four hours**, both by design: the injection at 2 s
  (`equipment failure`) and the reactor trip at 55 s. Nothing else — the standing alarmed board
  suppresses the rest, as this section predicted. Phase 0 fired all four initiators in one broadcast
  and paid one drop between them; the authored walkthrough fires them on three steps and will pay
  one drop each.
- **3600× holds, with two honest caveats.** Forked at six phase midpoints with WARP enabled, 3600×
  was **accepted every time** and held **12 plant-minutes** at four of the six. It self-dropped at
  **105 min** (after 3 s, `pressure moving 122 psi/s`) and at **230 min** (after 100 s, `pressure
  moving 55 psi/s`) on its own pressure-rate watch, landing at 60×. That is the in-loop watch doing
  its job during the pumps-off boiling and the injection recovery; the text should say so rather
  than promise a tier the plant will take back.

## 7. Sources — an evidence pass BEFORE authoring (CLAUDE.md, HR11)

**DONE 2026-09-08 — the timeline is sourced and on disk.** `inbox/sources/` now carries
**NUREG/CR-1250 Vol. II Part 2** (Rogovin, §II.A + Appendix II.1, the minute-by-minute event table)
and **Volume I** (the narrative, which is where the report states what the operators believed).
Both fetched from OSTI by `servlets/purl/6881334` and `.../5395798` — the nrc.gov workaround was not
needed — and both indexed by `node tools/find_source.js`. `inbox/tmi_timeline_sourced.md` is the
extraction: 42 rows, each with its event number, page and verbatim quote, plus a "what the crew knew
and did not know" section quoting the report on each decision. **No clock in §5 is `[recalled]` any
more.** Appendix II.1 is a *reconciliation of* NUREG-0600 and NSAC-1 and cites both as its
references, so it supersedes them for this purpose; neither is obtainable (OSTI 404s NUREG-0600's
full text, EPRI's report is not open-access) and the Kemeny report was not reached.

Also in the corpus: GEND-061 (core damage — its "almost 30 lb/in² gage" burn pressure is
corroborated by Appendix II.1's 28 psig), NUREG-0737, IE Bulletins 79-06A and 79-06C (`.html`,
invisible to `find_source.js` — grep `inbox/sources` by name).

**A trap for the authoring pass:** `pdftotext -layout` mis-assigns Appendix II.1's Event column by
one row and prints *"Reactor trips on high pressure"* against the 3 s event instead of the 8 s one —
exactly the distinction step 3 turns on. The `.txt` in the corpus was rendered from PyMuPDF word
coordinates instead. Both documents are column-laid-out, so **grepping the `.txt` for a quote
returns zero even when the quote is right**; read down the column, with the x-offsets recorded in
`inbox/tmi_timeline_sourced.md`.

## 8. Phase 0 measurements — DONE 2026-09-08

All six taken full-stack on `edaf8154` from `hot_full_power`; scripts and tables in
`inbox/tmi_phase0/RESULTS.md`, filed at
<https://github.com/TH462/Reactor-Dynamics/issues/670#issuecomment-5595332218>.

1. **Replay cost.** 15,696 broadcast ticks / 780,000 physics steps to 260 plant-minutes;
   **248.5 s / 321.7 s / 437.4 s** of wall across three runs (36×–63× real time; shared machine).
   That is **+21 % to +37 %** on `run_checklist_pwr2`'s `secs: 1180` — **budget 1,600 s** and replay
   the whole four hours, because a leg the gate cannot drive to the end is a menu that lies.
2. **WARP eligibility.** ≥ 99 % of samples in every window, 100 % from 5 to 200 min; **60× never
   refused**; the clock drops to 1× exactly twice in four hours (the injection at 2 s, the trip at
   55 s); 3600× held 12 plant-minutes at four of six midpoints and self-dropped at 105 min and
   230 min on a pressure rate. Full numbers in §6.
3. **Hot leg versus saturation.** The hot leg reads above saturation in **1,098 of 1,557 samples**,
   first at **2.7 min**, peak exceedance **114 °F (63.3 °C)** at 122 min — so the old step-12
   acceptance *is* satisfiable. But **the hot-leg detector never goes off scale** (peak 632.0 °F /
   333.3 °C against a 32–752 °F / 0–400 °C range), and what pegs instead is the **subcooling
   margin**, on its −50.4 °F (−28 °C) floor from **57.0 min** for 526 samples. Step 13 is rewritten
   around that.
4. **ECCS STOP window.** SI actuates at **65.5 s**; the stop is refused from 69 s to 120.5 s by the
   reset time-delay relay (`RESET.delay_s = 60`) and **first accepted at 125.5 s (2.09 min)**. The
   story's 4.5-minute press was **accepted on the ride itself**, so step 7 stands where the sourced
   clock puts it.
5. **Cavitation timing.** `rcp_cavitating` goes TRUE at **2.58 min** — a step, not a ramp, crossing
   its 0.5 threshold 20 s after the margin reaches zero and saturating 20 s later. History secured
   loop B at 74 min, so **the cue has stood for 71 minutes** by the time the crew acts.
6. **The AFW clear path.** The player's own `set_afw_block {open:true}` takes flow 0.000 → **1.000
   within 30 s** and `true_state.afw_blocked` to false, same engine lever as `clear_failure`, so
   **step 10 needs no `clear` field**. The only wart is cosmetic: the kernel's `activeFailures` list
   is emptied only by `clear_failure`, so the Failures tab keeps showing a row that is no longer
   acting.

### 8b. Phase 2 must re-measure

Phase 0 measured the plant; it did not measure the authored leg, and three classes of number in this
plan are still provisional.

- **Every plant number past 30 minutes, full-stack.** The §2 table's post-30-minute rows carry a
  "re-measure" flag for exactly this reason: §86 is engine-direct, the shipped stack's auxiliary-feed
  level hold changes the ride from 50 min on, and the accumulator row was already false. Re-take the
  pressures, levels, inventories and the block-valve/recovery clocks **on the authored leg**, not on
  Phase 0's scripted ride — the player's route is not the replay's fixed holds.
- **The safety-injection block acceptance at 04:03:50** (§5 step 6). P-11 is a pressure permissive
  at ~1970 psig (13.6 MPa) and the block is an operator *request* that the plant revokes on the way
  back up. Whether `set_trip_block {trip_id:'si_trip'}` is accepted at the plant state of 3 min 13 s
  is unmeasured; if it is refused, the step moves to when it is accepted and says so.
- **Step 13's subcooling floor timing on the full stack.** The −50.4 °F (−28 °C) floor from 57.0 min
  is Phase 0's scripted ride. On the authored leg the player's own clocks differ, so the step's
  acceptance window has to be re-taken there — and the instrument must be mapped first (Phase 1).

## 9. Rulings — all four given 2026-09-08

*(OWNER RULING, 2026-09-08: "Do as recommended, start phase 0.")* — every recommendation below is
ruled as written. Kept for the reasoning, not as an open question; record at
<https://github.com/TH462/Reactor-Dynamics/issues/670#issuecomment-5595163199>.

**R1 — Does the player perform the crew's mistakes, or watch them?** *Options:* (a) the player
presses ECCS STOP, opens letdown, secures the pumps, tagged *crew's action*; (b) the walkthrough
injects those as behind-the-scenes commands and the player only observes. **Recommend (a)**: the
lesson is that each action was reasonable on the instruments they had, and a player who presses
the button on the same reading learns that in the hand. The `crew` tag keeps it from reading as
procedure.

**R2 — Ship inside the plant's envelope, or wait for the physics?** *Options:* (a) ship the four
control-room hours, narrate the fuel damage and the burn as a declared gap; (b) hold until #515
gap 1 (cladding heat-up while uncovered) lands. **Recommend (a)**; (b) is a physics programme with
no date, and the control-room story is the educational payload the ask names.

**R3 — Defeat the anticipatory trip behind the scenes so the PORV lifts as at TMI-2?** *Options:*
(a) inject `anticipatory_trip_failure` on step 1 and tell the player in one sentence; (b) let this
plant trip first (its sourced, prototypical Westinghouse behaviour) and lose the lift. **Recommend
(a)**: the whole accident hangs on the valve lifting, and the divergence is honest when stated.

**R4 — Channel.** *Options:* (a) preview-only (`site/flags.js` has no pwr2 rows; unregistered ids
are off in public) until a layman playthrough (`/layman-playthrough`) and an operator playthrough
both complete it; (b) public with the release that carries it. **Recommend (a)**.

## 10. Work order (each phase one Opus agent; the coordinator verifies numbers between phases)

| phase | deliverable | gates |
|---|---|---|
| 0 | **DONE 2026-09-08** — evidence pass (§7) + the six measurements (§8) filed on the issue with numbers | none (report) |
| 1 | runtime: `inject`/`clear`/`story`/`crew` fields, instructor hook, harness `issue()`, renderer block + clock in header; **map subcooling margin into `PARAM_INSTRUMENT.pwr2`** (`subcooling_c: 'subcooling_margin'` — §5 step 13's acceptance); **raise `run_checklist_pwr2`'s `secs` hint to 1600 when the leg lands** | run_checklist (+probes made red by injection), run_checklist_pwr2 unchanged, run_m6, verify_e2e_ui |
| 2 | **DONE 2026-09-09, commit `c6601740`** — `pwr_tmi2_incident` authored, 16 steps, `hot_full_power` → 4 h 20 min of plant time; the §8b re-measurements taken full-stack on the crew's own clocks (`inbox/tmi_phase2/MEASURED.md`); `manual_ui_map.js` block (7 mapped steps); `procedure:pwr_tmi2_incident: 'preview'`. **NO CLOCK MOVED** — all seven crew commands accepted at their sourced second, `beyond_model` 0 of 1,558 samples. Five plan assumptions measured otherwise, listed below. `Manuals/08_ACCIDENT_TMI.md` is a **concurrent lane's** work and is not this phase's. | run_style 10/10 · run_checklist 78/78 · run_manual_controls 590 · run_checklist_pwr2 **177/177** (secs 1180 → 1600) · run_flags 342 -> 345 · run_hardrules 511 · verify_ckl_relevance 17 · verify_flags_ui 50 |
| 3 | **IN PROGRESS 2026-09-09** — playthroughs: `/layman-playthrough` on the leg, then the operator persona; every finding re-measured; fixes | the same, plus verify_ckl_relevance (ordering: the incident lists after the six legs) |
| 4 | ship: changelog, TUNING_LOG, #660-style comment, owner review on the tester site | run_all |

**What Phase 2 measured that this plan had wrong** (full detail and the tables:
`inbox/tmi_phase2/MEASURED.md`; the authoring rules that came out of it: `CHECKLIST_WRITING_GUIDE`
§14). None of it moved a clock — every one is an ACCEPTANCE or a step's placement.

1. **The stuck PORV has a 20-second arming window.** §5 armed it on step 3 (corrected above); the valve lifts at
   5.5 s and reseats near 25 s, so armed at 30 s the plant sits at 1985 psia with **no accident**.
   Measured at nine arm times. It is authored on **step 2**, with the feed loss; step 3 injects
   nothing.
2. **§5 step 4's acceptance is unsatisfiable.** The tailpipe never exceeds the hot leg — 0 of
   1,558 samples; it saturates at 482 °F. Graded on the sourced 240 °F alarm point (crossed 22 s).
3. **Letdown is already at its high limit** at power (both orifices in service, nothing above
   A+B 7 %): `set_letdown_orifices {a,b}` moves flow 12.7 → 12.7 gpm. §5 step 7's second half is
   narrated, not performed.
4. **One RCP handswitch**, so §5 steps 11 and 12 cannot be two securings. Step 11 is the press at
   loop B's clock; step 12 is the consequence at loop A's clock and takes **no `crew` tag** —
   **three crew-tagged steps in the leg, not four** (corrected above).
5. **RCP FLOW does not move at the securing** (16.4 → 16.3 %), so §5 step 11's acceptance is the
   cavitation alarm clearing plus PRESSURIZER LEVEL below 80 %.

Known traps to carry into every phase: `STEP_UI` in `manual_ui_map.js` is positional (four
breakages); every step needs an instrument-satisfiable acceptance (guide R7); no SI in any
player-facing string; a `cmd`-kind acceptance needs `overtaken`; three registry defects the
inventory found (`rcp_trip` has no clear or detector, `large_loca` reports as `primary_leak`,
`failGroups` lists filtered ids) are filed separately and not this plan's.
