# PWR curriculum redesign — assessment and proposal

**Status: PROPOSAL, awaiting owner decisions.** Nothing here binds. It exists to be argued
with, and §5 lists the calls that are the owner's to make.

> **§5.4 IS OVERTAKEN — "The Instruments Lie" was RULED AGAINST, 2026-08-02/03.** This document
> calls that act "the one most aligned with what the project is *for*" and makes it its strongest
> recommendation. That premise is retired: the educational goal is **plant dynamics**, and
> instrument deception is explicitly **not** a Tier A objective *(OWNER, 2026-08-02: "I don't
> want to focus on instruments lying. It will come up in failure scenarios but I dont know if it
> should be a major focus."; OWNER DIRECTIVE, 2026-08-03: "THR STATED PREMIS IS NOT INSTRUMENT VS
> TRUTH THE PREMIS IS TO TEACH PLANT DYNAMICS!!! We must purge the idea of the instruments vs
> truth premise from all documents.")*. See `DESIGN_CRITERIA.md` §6. The individual failure
> lessons may still have a home under Act V; **a dedicated act built on the premise does not.**
> The rest of this document (acts, gating, the Mode 5↔1 restructure, §5.5) is unaffected.

*(OWNER DIRECTIVE, 2026-07-29: "We need to redo all the lessons. They are all out of date and
have a lot of issues." Scope chosen by the owner the same day: a full rethink of content **and**
structure, not only a correctness sweep.)*

Tracking issue: **#253**. Companion record: `Diagnostic/TUNING_LOG.md` 2026-07-29.

---

## 1. What exists today

**34 campaign missions** in 6 acts (`ui/campaign_data.js`) — 26 scenarios + 8 procedures — plus
1 bonus scenario, drawing on **27 PWR scenarios** (`scenarios/`) and **11 PWR procedures**
(`ui/manual_procedures.js`).

| Act | Missions |
|---|---|
| I — The Machine | 3 |
| II — The Physics | 6 |
| III — The Controls | **12** |
| IV — When Things Go Wrong | 8 |
| V — Three Mile Island | 3 |
| VI — The Reckoning | 2 |

Every PWR scenario is placed. One procedure, **`pwr_heatup`**, is not — it is reachable from
the checklist menu but never sequenced, and it is the *only* lesson that commands the
accumulators, the pressure setpoint, the steam-dump setpoint, or RCP start/stop.

---

## 2. The structural problem: six "guided" lessons do not guide

`M6_instructor.md` §9 defines the mode: *"**Guided operation** — lead the operator through a
sequence using commentary to instruct **and gating to keep them on the path**."* Gating is
definitional.

Counting `operator_action` triggers per scenario — the only mechanism that makes a beat wait
for the player — **six scenarios declare `guided` and carry zero**:

| Scenario | Act | Beats | Gates |
|---|---|---|---|
| `pwr_hook` | I | 5 | **0** |
| `pwr_chain_reaction` | I | 5 | **0** |
| `pwr_mode5_to_mode3` | II | 5 | **0** |
| `pwr_mode3_to_mode5` | III | 5 | **0** |
| `pwr_return_to_mode1` | III | 4 | **0** |
| `pwr_tmi2_p2` | V | 10 | **0** |

They advance on timers and plant state, identically whether the player acts correctly, acts
wrongly, or does nothing. Compare `pwr_rod_auto` (6 gates) or `pwr_feed_pump` (5), which
genuinely will not proceed until the player does the thing.

Three consequences worth being blunt about:

- **`pwr_hook` is the first lesson anyone plays**, and it cannot tell whether they pressed
  anything.
- **All three Mode-transition missions are in this set** — the longest, hardest evolutions in
  the game (Mode 5 → 3, Mode 3 → 5, and the full return to Mode 1), each narrated over an
  unassisted free-play task with no checkpoint and no correction.
- `run_campaign` cannot catch this. Its `pwr_mode5_to_mode3` test drives the heatup with a
  **test-side autopilot** (`heatupStep`), so the gate proves the *plant* can be flown Mode 5 →
  Mode 3 by something competent. It says nothing about whether the *lesson* teaches a person to
  do it.

Ungated is correct for `free_response` (`pwr_startup_challenge`, `pwr_shift_exam`,
`pwr_qualify`) and for `demonstration` (`pwr_xenon`) — those are graded or watched by design.
The six above are not those.

---

## 3. Coverage gaps — plant systems no lesson teaches

Measured by scanning every PWR scenario and procedure for the commands that operate each system.

| System | Taught by |
|---|---|
| **Instrument failure** | **1 lesson** — `pwr_lof`, and only since 2026-07-29 |
| **RHR / decay-heat removal** | **nothing** |
| **Main feedwater isolation** | **nothing** |
| Accumulators | `pwr_heatup` only — the unsequenced procedure |
| Pressure setpoint · steam-dump setpoint · RCP start/stop | `pwr_heatup` only |
| Trip blocks (P-10 / P-11) | 2 procedures only |

Three of these deserve emphasis:

**Instrument failure is the premise of the whole simulator.** HR1 exists so a stuck indicator
can mask a real condition; the TMI-2 module is built on exactly that; `Manuals/07` documents
three sensor drills (**PWR-E20** Tavg drifting, **PWR-E21** pressurizer level stuck, **PWR-E22**
level failed low). No lesson teaches any of them. Until this week the count was **zero**.

**RHR is promised and not delivered.** `pwr_mode3_to_mode5`'s own description says the mission
teaches *"borate, cool the secondary, depressurize, **place RHR**, secure the pumps"*. The
scenario never issues `set_rhr` and never gates on the player doing so. It narrates the approach
to the 400 psi (2.76 MPa) permissive and then simply ends. RHR is how this plant removes decay
heat in Mode 5; nothing teaches it.

**Feedwater isolation** has no lesson at all, despite being the P-14/SI mechanism whose
indication was just built (#247).

---

## 4. Content staleness

Partly fixed on 2026-07-29 (commit `aa374bf`); listed so the pattern is visible, because it
recurs — `Manuals/00` Rev 3 already records one "rated 1000→100 MWe leftovers" pass that missed
everything below.

| Class | State |
|---|---|
| Pre-rescale MWe in player-facing prose (6 files; *"take the grid down to 850 MW"* on a 100 MW plant) | **fixed** |
| A dead branch — `mwe_output > 985` against a `[0, 130]` gauge, masked by a `delay: 420` fallback, costing the player 7 minutes of dead air | **fixed** |
| Lessons promising mechanisms the sim lacks (natural circulation, ×2) | **fixed** |
| `teaches:` lines that no longer match the scenario | 2 found, 2 fixed; **32 unaudited** |
| **Units — `run_manual_units` does not scan `scenarios/`; 15 of 27 PWR scenario files carry SI-only plant numbers** | **open, largest item** |

---

## 5. Proposal

### 5.1 Sequencing — design before sweep

The units conversion (15 files) is the single largest mechanical job, and it is **wasted on any
lesson that gets cut or re-authored**. So: settle structure first, convert the survivors last.
This reverses what was proposed in #253 before the scope was set.

### 5.2 Fix the guided-mode contradiction

Either gate the six lessons or re-label them. **Recommendation: gate them**, because the two
that matter most (`pwr_hook`, and the Mode transitions) are precisely where a player needs to
know they did the right thing. `pwr_tmi2_p2` is a replay-with-commentary and should simply be
re-labelled `demonstration`.

### 5.3 Restructure the acts

Act III carries 12 missions and mixes three unrelated jobs: at-power control surfaces, power
manoeuvring, and the Mode 5↔1 round trip. The round trip is split across Act II and the tail of
Act III with ten missions in between. Proposed:

| Act | Theme | Change |
|---|---|---|
| I — The Machine | orientation, the scram, the energy path | unchanged (3) |
| II — The Physics | criticality, feedback, xenon, boron | drop `pwr_mode5_to_mode3` (moves to new Act) |
| III — The Controls | pressure, level, feed, rods, load, automation | at-power only (~9) |
| **IV — Cold to Hot and Back (new)** | the full Mode 5 ↔ Mode 1 round trip, **incl. RHR** | gathers the 3 transition missions + `pwr_heatup`, finally sequenced |
| V — When Things Go Wrong | protection, ESF, casualties | unchanged (8) |
| ~~VI — The Instruments Lie (new)~~ | PWR-E20/E21/E22, the stuck flow channel | **RULED AGAINST 2026-08-02/03** — fold into Act V; see §5.4 |
| VII — Three Mile Island | the 3-part module | unchanged |
| VIII — The Reckoning | qualification | see §5.5 |

### 5.4 ~~Add the missing act — "The Instruments Lie"~~ — RULED AGAINST, see the banner at the top

**Superseded 2026-08-02/03.** The claim below — that this is "the one most aligned with what the
project is *for*" — is exactly the premise the owner retired. Instrument deception is a Tier C
payoff, not a Tier A objective, because you cannot perceive a lying instrument without already
knowing what the plant should be doing (`DESIGN_CRITERIA.md` §6.3). **Do not build this act.**
The failure material (drifting Tavg, stuck pzr level, failed-low level, the stuck-high flow
channel) is still legitimate content and belongs under **Act V — When Things Go Wrong**, taught
as *"here is the coupling, and here is what it looks like when one channel stops reporting it"*.
Original text, kept for the record:

> This is the biggest content gap and the one most aligned with what the project is *for*. The
> material already exists in the plant and is documented in `Manuals/07`; only the lessons are
> missing. Three or four missions: a drifting Tavg sensor, a stuck pressurizer level, the
> failed-low level sensor, and the stuck-high flow channel that `pwr_lof` now demonstrates. It
> also gives Act VII (TMI) its proper set-up — TMI *is* this lesson, at full scale.

### 5.5 Resolve the TMI duplication

TMI is taught twice: the 3-part Act V module, and `pwr_tmi` ("Three Mile Island, compressed")
in Act VI. **Recommendation: retire `pwr_tmi`** and leave Act VIII as `pwr_qualify` alone, or
promote a new free-response casualty to sit beside it. Two tellings of the same accident, one
immediately after the other, is the clearest redundancy in the campaign.

---

## 6. Decisions needed from the owner

1. **Gate the six ungated `guided` lessons** (§5.2) — or re-label them as demonstrations and
   accept that the Mode transitions are unassessed?
2. **The act restructure** (§5.3) — in particular pulling the Mode 5↔1 round trip into its own
   act and finally sequencing `pwr_heatup`.
3. ~~**Add "The Instruments Lie"** (§5.4)~~ — **ANSWERED, and against**: the owner ruled the
   premise out on 2026-08-02/03. Fold the failure lessons into Act V instead. No longer a
   decision needed.
4. **Retire `pwr_tmi`** in favour of the Act V module (§5.5)?
5. Anything here that is wrong about intent rather than about the code — this is an assessment
   of what the lessons *do*, not of what they were meant to do.
