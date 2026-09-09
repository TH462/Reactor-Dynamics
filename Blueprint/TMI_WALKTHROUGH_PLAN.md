# TMI-2 incident walkthrough — the plan

**Status: PLAN, awaiting four owner rulings (§9) — issue #670. Not binding until executed; expires when done
(CLAUDE.md "plans expire when executed").** Written 2026-09-08 by the coordinating session from
`inbox/tmi_walkthrough_inventory.md` (1,064 lines of file:line facts; local, not tracked — the
numbers it cites are in `Blueprint/PWR2_VALIDATION.md` §86 and the files named below).

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

Measured, on PWR2, from Hot Full Power (`PWR2_VALIDATION.md` §86, re-run §87 within 14 psi):

| clock (elapsed) | historical | PWR2, measured |
|---|---|---|
| 0:00 | condensate polisher trips → main feed lost → turbine trips | `loss_of_feedwater` (no polisher model; the initiator is told, not injected) |
| 0:00:03–06 | pressure spikes, PORV lifts | lifts at **5 s, 2346 psia** — only with the P-9 anticipatory trip defeated (§9 R3) |
| 0:00:08 | reactor trips on high pressure | trips at **43 s on over-temperature ΔT** — this plant's PORV is 3.6× TMI-2's per MWt and turns the pressure first |
| 0:00:13 | PORV fails to reseat; lamp says closed | `stuck_porv_open` (latches on the lift) + `porv_indicator_stuck_closed` |
| 0:02 | HPI starts automatically | SI on low pressurizer pressure |
| 0:04:30 | level climbs to the top; crew throttles HPI ("never let it go solid") | **level 100 % on 96.6 % mass at 4.5 min, 1077 psia** — the deception is emergent |
| 0:08 | AFW block valves found shut | `afw_failure`: pumps running, delivery dead |
| 0:30–1:40 | saturation; RCPs cavitate; crew secures B then A loop | cavitation is **indication only** (no damage, no auto-trip); securing is a real handswitch |
| 1:40–2:20 | core uncovers, cladding heats, oxidation, hydrogen | **core uncovery is a void proxy; the cladding does NOT heat** (555 °F at 66 % uncovered). No hydrogen on this ride |
| 2:22 | block valve closed | the loss ends at 142 min, 64 % mass |
| 3:20 | HPI restored | refill to 121 % of boot mass; **1666 psia at 260 min, alive** |
| ~0:55 | — | **accumulators dump** — a divergence from history, declared plant identity |
| 9:50 | hydrogen burn in containment | **not modelled** (`ctmt_h2_burned` is a static 0) |

So the walkthrough can **simulate** the initiator, the stuck valve and its lamp, the deception,
the throttled HPI, the found AFW valves, the saturation and the pump securing, the block valve and
the recovery — everything the crew did in the control room — and must **narrate** the fuel damage
and the burn. It says so to the player, in one step, in the plant's own words (§5 step 15). This
is the declared departure Design Criteria Q3 requires; the physics gap is #515 gap 1 and is not
this plan's to close (§9 R2).

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
(`Step 6 of 15 · 04:05`). Nothing else; Continue/Rewind/status line are as built.

## 5. The steps (draft — the authoring pass will re-measure every number)

Historical clocks from the sourced timeline (§7). "DO" steps are graded on the **effect**, never
on the press (guide R7, P15). The player's actions marked **crew** are the historical mistakes.

| # | clock | kind | the step, in one line | acceptance (draft) | inject |
|---|---|---|---|---|---|
| 1 | 04:00 | VERIFY | At 97 % power, a routine night. The setup: this plant's anticipatory trip is taken out of service so the valve can lift as TMI-2's did — say so. | power > 90 % | `anticipatory_trip_failure` |
| 2 | 04:00:37 | VERIFY | Main feed stops (the polisher, told). Verify FEED FLOW 0, TURBINE TRIP lit. | feed flow ≈ 0, turbine tripped | `loss_of_feedwater`, `afw_failure` (hidden) |
| 3 | 04:00:40 | VERIFY | Pressure spikes; the PORV lifts; the reactor trips. Verify SCRAM, PRIMARY PRESSURE falling. | scrammed | `stuck_porv_open` (armed before the lift), `porv_indicator_stuck_closed` |
| 4 | 04:01 | VERIFY | The PORV lamp reads CLOSED. The crew believed it. Verify PZR TAILPIPE temperature rising while the lamp says closed. | tailpipe temp > hot-leg temp | — |
| 5 | 04:02 | VERIFY | HPI starts on its own. Verify ECCS running. | hhsi running | — |
| 6 | 04:04:30 | **DO, crew** | Level reaches the top of the scale. The rule they were trained on: never let the pressurizer go solid. Press ECCS STOP. | hhsi not running | — |
| 7 | 04:08 | DO | AFW pumps have run for eight minutes delivering nothing: the discharge valves were tagged shut after a test. Open them. | AFW flow > 0 | — (the step CLEARS `afw_failure` via the player's action) |
| 8 | 04:10 | **DO, crew** | Level still high: the crew opens letdown to maximum to "drain" a full pressurizer that is not full. | letdown flow at max | — |
| 9 | 04:30 | VERIFY | Pressure is down near 1000 psi at 550 °F: the water is boiling in the loops. Verify SUBCOOLING MARGIN 0 and RCP vibration (cavitation) indicated. | subcooling ≤ 0, rcp_cavitating | — |
| 10 | 05:14 | **DO, crew** | Loop B pumps shaking: secure them to save the pumps. | RCP B secured | — |
| 11 | 05:41 | **DO, crew** | Loop A the same. Now nothing moves the water but its own heat. | all RCPs secured | — |
| 12 | 06:00 | VERIFY | The hot legs read off the top of the scale; the level says the vessel is fine. There is no vessel level instrument. Verify hot-leg temperature above the saturation line. | hot-leg T > Tsat(P) *(UNMEASURED on PWR2 — see §8)* | — |
| 13 | 06:22 | DO | A new shift supervisor asks the one question nobody had: what if the PORV is open? Close the block valve. | PORV flow 0, pressure rising | — |
| 14 | 07:20 | DO | Restore HPI. Watch the vessel refill and pressure recover. | hhsi running, pressure > 1500 psi | — |
| 15 | 19:50 / epilogue | VERIFY | Restart one RCP; forced flow returns. Then the part this plant cannot show: the cladding, the hydrogen, the 13:50 burn, the core found molten five years later. | RCP flow > 80 % | — |

Fifteen steps, ~260 minutes of plant time plus the epilogue. Each step's `story` names what the
crew could see on THEIR board, so the player learns the deception from the same instruments.

## 6. Time and the clock

An incident walkthrough spends its life in alarm, which the clock rules were written against:
- A **standing** alarmed board is favourable: `_boardQuiet` is false once any warning stands, so
  the cascade does not drop the tier alarm by alarm.
- Every **injection** drops the clock to 1× (`'failure'`), and every **step check-off** drops it
  (`'step'`). Both are the step's own event — the player is meant to look. Accepted as built.
- WARP (600×/3600×) is refused while the plant is in transient. The long waits (steps 9–12,
  ~90 min of saturation and boiling) are the only places WARP is wanted; whether they are
  WARP-eligible is **UNMEASURED** and is Phase 0's first number. If not, 60× makes 90 plant-minutes
  a 90-second wait, which is acceptable; `wait_hint` says so.

## 7. Sources — an evidence pass BEFORE authoring (CLAUDE.md, HR11)

In the corpus today: GEND-061 (core damage), NUREG-0737, IE Bulletins 79-06A and 79-06C (`.html`,
invisible to `find_source.js` — grep `inbox/sources` by name). **Not in the corpus: the Kemeny
Commission report, NUREG/CR-1250 (Rogovin), NUREG-0600, NSAC-80-1.** The minute-by-minute
timeline every `story.clock` needs is nowhere sourced in this repo. Phase 0 fetches one primary
timeline (NUREG-0600 or NSAC-80-1 via the nrc.gov workaround in the `pwr-prototypicality-sources`
memory) and cites it per step; until then every clock in §5 is `[recalled]`.

## 8. Phase 0 measurements (Design Criteria Q1 — no number, no step)

1. The §86 ride replayed through the walkthrough harness from `hot_full_power`: wall-clock cost at
   `SEC_PER_TICK`, so the gate budget is known before the leg exists.
2. WARP-eligible fraction of the ride, per phase (`_warpBlocked` reasons sampled every 10 s).
3. Hot-leg indicated temperature versus saturation through the ride (step 12's acceptance).
4. The ECCS STOP reset-delay window (45–60 s) against the 4.5-min throttle: is the press accepted
   when the story needs it? If refused, step 6 moves to when it is accepted, and says so.
5. Cavitation indication timing versus the 1:14 / 1:40 securing clocks.
6. Whether `afw_failure` can be cleared by the player's own AFW valve action (step 7) or needs the
   step's `clear`.

## 9. Rulings needed — the decision, the options, my recommendation

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
| 0 | evidence pass (§7) + the six measurements (§8) filed on the issue with numbers | none (report) |
| 1 | runtime: `inject`/`clear`/`story`/`crew` fields, instructor hook, harness `issue()`, renderer block + clock in header | run_checklist (+probes made red by injection), run_checklist_pwr2 unchanged, run_m6, verify_e2e_ui |
| 2 | authoring: the 15 steps; `Manuals/08_ACCIDENT_TMI.md` rewritten for PWR2 with the timeline cited; `manual_ui_map.js` rows; flags row (preview) | run_style, run_manual_units, run_manual_rev, run_manual_controls, run_checklist_pwr2 (+1 leg, budget from Phase 0) |
| 3 | playthroughs: `/layman-playthrough` on the leg, then the operator persona; every finding re-measured; fixes | the same, plus verify_ckl_relevance (ordering: the incident lists after the six legs) |
| 4 | ship: changelog, TUNING_LOG, #660-style comment, owner review on the tester site | run_all |

Known traps to carry into every phase: `STEP_UI` in `manual_ui_map.js` is positional (four
breakages); every step needs an instrument-satisfiable acceptance (guide R7); no SI in any
player-facing string; a `cmd`-kind acceptance needs `overtaken`; three registry defects the
inventory found (`rcp_trip` has no clear or detector, `large_loca` reports as `primary_leak`,
`failGroups` lists filtered ids) are filed separately and not this plan's.
