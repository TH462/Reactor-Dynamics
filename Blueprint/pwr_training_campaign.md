# PWR Training Campaign — "Zero to Operator"

**Version 1.0 — plan + implementation spec.**
Read alongside `Gameplay_instructor_design.md` (product philosophy) and `M6_instructor.md`
(beat engine spec). This document is authoritative for campaign structure, mission content,
and the campaign wrapper implementation.

---

## 1. Goal & learner profile

Take a person who has **never seen a nuclear power plant** to the point where they can:

1. **Explain how a PWR works** — the energy journey from fission to the grid, and why the
   plant is built as two loops with a pressurizer standing guard.
2. **Explain the physics** — chain reaction and criticality, the neutron source and 1/M,
   startup rate and period, Doppler/MTC negative feedback, xenon poisoning, boron vs rods,
   saturation and subcooling, decay heat.
3. **Operate the plant** — start up to criticality, raise/lower power, control pressurizer
   pressure and SG level, follow grid load, shut down, and handle the classic upsets
   (loss of feedwater, RCP trip, stuck PORV) using instruments alone (HR1).
4. **Survive the boss fight** — recognize and beat Three Mile Island, then pass a
   no-hints qualification exam.

Assumed starting knowledge: none. Physics terms are introduced **only at the moment they
are needed by a task** (Interleaved Progression, Gameplay §1). No mission exceeds ~5
minutes of wall-clock attention (time acceleration handles slow physics like xenon).

## 2. Design rules (inherited, non-negotiable)

- **Extend what exists.** Campaign = a progression wrapper over the existing scenario
  (`RD.SCENARIOS`) and walkthrough (`RD.MANUAL_PROCEDURES`) machinery. No new content engine.
- **Learn a rule → apply it → small puzzle → repeat.** Every mission ends with a concrete
  player action proving the concept, and a `level_complete` card.
- **Failure is data.** Rewind is offered on every failure endpoint.
- **HR1 forever.** Grading and triggers read instruments wherever an instrument twin exists;
  `true_state` triggers only where documented (invisible hooks, e.g. xenon before the
  concept is revealed).
- **Both registers.** Every commentary beat ships `learning` and `industry` text.
- **Intellectual honesty.** Simplifications voiced in-beat at the moment they matter
  (point kinetics, single-sensor indications, no containment).

## 3. Curriculum — five acts, 18 missions

Legend: `[S]` = authored scenario (`scenarios/*.js`), `[P]` = walkthrough procedure
(`RD.MANUAL_PROCEDURES.pwr`), **NEW** = built by this plan. Sequential unlock, top to bottom.

### Act I — The Machine (how a nuclear plant works)
| # | Mission | Kind | Teaches |
|---|---------|------|---------|
| 1 | Welcome to the Control Room | [S] `pwr_hook` (exists) | The scram button; the plant reacts dramatically but safely; Rewind exists |
| 2 | The Energy Journey | [S] `pwr_tour` **NEW** | Fission heat → primary loop → SG boundary → steam → turbine → grid; two-loop design; why the primary must never boil (subcooling); reading the synoptic |
| 3 | The Chain Reaction | [S] `pwr_chain_reaction` **NEW** | Neutrons, fission, criticality as a balance; the neutron source & subcritical multiplication; startup rate (SUR) & period; rods as the throttle |

### Act II — The Physics (reactor behavior in your hands)
| # | Mission | Kind | Teaches |
|---|---------|------|---------|
| 4 | Critical! | [P] `pwr_startup` | The real approach-to-criticality procedure, end to end |
| 5 | The Reactor That Pushes Back | [S] `pwr_feedback` **NEW** | Doppler + moderator temperature coefficient; why a PWR is self-stabilizing; power follows steam demand |
| 6 | Poisoned | [S] `pwr_xenon` **NEW** | Xenon-135: builds after power drops, chokes the core, decays away; why plants can't always restart immediately |
| 7 | The Long Game | [S] `pwr_boron` **NEW** | Boron vs rods: coarse/slow chemistry vs fine/fast mechanics; CVCS borate/dilute |

### Act III — The Craft (operating procedures)
| # | Mission | Kind | Teaches |
|---|---------|------|---------|
| 8 | Raise Power | [P] `pwr_raise_power` | Coordinated rod/boron power escalation |
| 9 | Holding the Pressure | [P] `pwr_pressure_control` | PZR heaters & spray; pressure = the subcooling guarantee |
| 10 | Feeding the Boilers | [P] `pwr_sg_level` | SG level control; shrink & swell |
| 11 | Follow the Grid | [S] `pwr_load_follow` **NEW** | Load mode (Follow/Manual/Off); turbine-reactor coupling; feed auto-tracking; SG balance |
| 12 | Coming Down | [P] `pwr_lower_power` | Controlled power reduction |
| 13 | Putting It to Bed | [P] `pwr_shutdown` | Normal shutdown to Hot Standby; decay heat is forever |

### Act IV — When Things Go Wrong (protection & upsets)
| # | Mission | Kind | Teaches |
|---|---------|------|---------|
| 14 | The Plant Protects Itself | [S] `pwr_protection` **NEW** | RPS: trip logic, setpoints, alarms; a deliberate turbine trip → reactor response; acknowledging and reading an alarm flood |
| 15 | Losing the Heat Sink | [P] `pwr_loss_of_feedwater` | LOFW response; AFW |
| 16 | Losing the Flow | [P] `pwr_rcp_trip` | RCP trip; natural circulation |
| 17 | The Hole That Lies | [P] `pwr_stuck_porv` | Stuck-open PORV (small-break LOCA) recovery — direct TMI rehearsal |

### Act V — The Reckoning (boss fight & qualification)
| # | Mission | Kind | Teaches |
|---|---------|------|---------|
| 18 | Three Mile Island | [S] `pwr_tmi` (exists) | The 1979 accident of information; believe the physics, not one light |
| 19 | Senior Operator Exam | [S] `pwr_qualify` **NEW** | Station blackout, no narration, instrument-graded: keep the core covered and cooled until power returns |

Bonus (unlocked with Act V, not required): `pwr_sg_flood` (exists) — "SG Flooded — What
Control Did You Forget?"

## 4. New scenario outlines (authoring spec)

All follow the `pwr_tmi.js` format: IIFE attaching to `RD.SCENARIOS`, beat vocabulary from
M6 (`time`, `delay`, `instrument`, `true_state`, `operator_action`, `inaction`, `alarm`,
`scram`, `manual`, `all`, `any`), `learning`/`industry` commentary, `level_complete`
endpoints with `advance:'end'`, `gate` to keep novices on the path, `highlight` to point
at synoptic controls/gauges, `speed` for slow physics.

### 4.1 `pwr_tour` — The Energy Journey (~4 min, from `hot_full_power`)
Beats walk the energy path with highlights: reactor (fission heat) → hot leg → SG
(boundary: two loops touch but never mix) → steam line → turbine/generator (grid) →
condenser → feed back to SG; then the pressurizer as the "guardian of the liquid state"
(subcooling margin gauge). Player actions: (a) throttle load to Manual 900 MW and watch
steam flow + Tavg respond (`operator_action set_load_mode/set_load_target`, instrument
trigger `mwe_output below 920`); (b) restore Follow. Complete when restored
(`load-follow` action + `mwe_output above 980`).

### 4.2 `pwr_chain_reaction` — The Chain Reaction (~4 min, from `hot_zero_power`)
Start subcritical. Teach: the core is quiet but not dead — a neutron **source** keeps a
measurable trickle (source-range instruments; the 1/M idea in plain words). Gate to rods
only. Player pulls rods; commentary narrates rising counts → sustained chain reaction
(criticality) → positive SUR; watch **startup rate** and **period** gauges; stop rods to
hold a gentle rise (`instrument startup_rate` bands). Then insert rods back below critical
— watch the source hold the floor (it never goes to zero). Complete on returning subcritical
(startup_rate below ~-0.2 dpm) with power still indicating. Honesty beat: real plants have
dedicated source/intermediate range detectors; this sim's power_range covers the whole span.

### 4.3 `pwr_feedback` — The Reactor That Pushes Back (~4 min, from `50_percent`)
(a) Gate to rod nudge. Player nudges rods OUT once: power rises then **self-arrests** —
Doppler (hot fuel absorbs more) + MTC (hot water moderates less). Instrument trigger
catches the stabilization (power settles). (b) Demonstration: instructor raises load
target +100 MW **without touching rods** — power climbs to meet it: colder cold-leg water
adds reactivity; "the reactor follows steam demand." Complete when power stabilizes at the
higher level. Honesty: lumped kinetics — real feedback has spatial structure.

### 4.4 `pwr_xenon` — Poisoned (~5 min, from `hot_full_power`)
The **post-shutdown** xenon transient — the arc the engine reproduces faithfully
(measured: crest ≈ +14% of equilibrium near +5 h, decaying after). The instructor scrams
deliberately, compresses time, and narrates the build (>106%), the crest (>113%, with the
Chernobyl xenon-pit foreshadow), and the onset of decay (<112% completes). Xenon has no
instrument twin (documented true_state hooks); commentary teaches how crews infer it.
Honesty beats: no post-trip restart is modeled (no RPS reset path — ops-report finding),
and the point-model xenon has no spatial sloshing.

> **Design note (2026-07-07):** originally a load-swing story (drop to 50%, build, restore
> to full power). Probing showed (a) a large manual load step trips the plant (load
> rejection), and (b) manual load targets couple weakly (power settles well above target),
> so the swing couldn't produce a teachable xenon arc. The post-trip transient is both the
> physically richer lesson and the one the engine already models well.

### 4.5 `pwr_boron` — The Long Game (~4 min, from `50_percent`)
Gate to CVCS + rod nudge. Task 1: raise power ~5% using **dilution only** (watch
boron_analyzer fall, power creep up on the minutes scale — speed 30×). Task 2: put it back
with **boration**. Commentary contrasts rods (fast, local, finite) vs boron (slow, uniform,
what actually compensates fuel burnup over months). Complete when power restored in-band
with boron trending back. Honesty: real boration/dilution moves ppm over hours; sim is
compressed.

### 4.6 `pwr_load_follow` — Follow the Grid (~4 min, from `hot_full_power`)
Evening grid ramp story. Player: Manual mode, slider to 800 MW; watch feed auto-couple
and SG balance annunciator; hold 5 sim-minutes (speed 10×, instrument band trigger); then
morning pickup back to 1000 MW; restore Follow mode. Complete on stable full power in
Follow. Teaches the Turbine-Generator card end to end (Grok's load-mode feature as
curriculum).

### 4.7 `pwr_protection` — The Plant Protects Itself (~4 min, from `hot_full_power`)
Tour the trip table conceptually (few beats, highlights on gauges with setpoints/trip
marks). Then: "the grid just vanished" — instructor injects `turbine_trip`; player watches
the automatic chain (trip → scram → decay heat → AFW/steam dump response) with commentary
pacing the alarm flood; player acknowledges alarms (`operator_action
acknowledge_all_alarms`), confirms shutdown board state. Complete at stable hot standby.
Teaches: the plant is designed to fail safe; alarms are a story, not noise.

### 4.8 `pwr_qualify` — Senior Operator Exam (~5 min, from `hot_full_power`)
`free_response`. One briefing beat ("something will fail; nobody will announce it"), then
silence. Fault: `stuck_porv_open` + `porv_indicator_stuck_closed` at power — the TMI
mechanism with no narrator, on the plant's most-validated upset physics (TMI scenario +
`pwr_stuck_porv` procedure). Branch graph: early isolation on the pressure trend →
verified pass; margin alarm opens the graded window → isolate + restore margin above the
alarm setpoint → "Qualified — Senior Reactor Operator"; inaction window (10 min) or core
inventory < 70% (documented true_state backstop) → failure endpoints with Rewind.

> **Design note (2026-07-07):** the exam was originally specified as a station blackout.
> Physics probing showed the current PWR engine cannot survive an SBO under **any**
> operator strategy (SG level pins at 20% with AFW active; inventory drains via PORV to
> zero by ~14 min). Logged as an engine tuning target with the ops-report findings; the
> exam was redesigned onto validated physics per §7 ("avoided, not fixed here").

## 5. Campaign wrapper (implementation)

### 5.1 Data — `ui/campaign_data.js` (new)
```javascript
RD.CAMPAIGNS = { pwr: {
  id: 'pwr', title: 'PWR — Zero to Operator',
  tagline: 'From your first scram to a senior operator qualification.',
  acts: [ { id: 'act1', title: 'Act I — The Machine', missions: [
      { kind: 'scenario',  id: 'pwr_hook',  teaches: '…' },
      { kind: 'scenario',  id: 'pwr_tour',  teaches: '…' }, … ] }, … ],
  bonus: [ { kind: 'scenario', id: 'pwr_sg_flood' } ],
} };
```
Mission titles/descriptions come from the scenario/procedure artifacts themselves (single
source of truth); `teaches` is the one-line curriculum hook shown in the campaign card.

### 5.2 UI — Training tab (app.js `buildTraining`)
- Campaign section renders **above** the existing flat lists (which remain, labeled
  "All scenarios" / "Walkthroughs", for sandbox users).
- Act header + mission rows: `✓ done` / `▶ up next` (first incomplete; the only enabled
  start) / `🔒 locked`. Completed missions stay replayable. Progress line
  "7 / 19 missions" + a thin bar.
- **Continue button** at top: starts the first incomplete mission (scenario via
  `startScenario`, procedure via `followProcedure`).
- `levelCompleteAction('continue')`: when the finished mission is the campaign's current
  frontier, launch the next mission directly (the Learn→Apply loop stays unbroken).
  Otherwise behave as today (dismiss to free play).
- Locked missions: row visible with title + teaches line (the syllabus is browsable),
  start disabled.

### 5.3 Progression
Existing `rd_progress` localStorage (`completed_scenarios`, `completed_procedures`) is
already written by `recordCompletion()` — the campaign **derives** state from it; no new
persistence. Unlock rule: mission N unlocks when missions 1…N-1 are complete. Bonus
missions unlock with Act V. Dev override: `?campaign=unlock` query param unlocks all
(testing).

### 5.4 Files touched
| File | Change |
|------|--------|
| `ui/campaign_data.js` | **new** — campaign definition |
| `scenarios/pwr_{tour,chain_reaction,feedback,xenon,boron,load_follow,protection,qualify}.js` | **new** — 8 scenarios |
| `ui/shell.html` | script tags + `#trainingCampaign` container |
| `ui/app.js` | campaign render + unlock + continue-chaining |
| `ui/shell.css` | locked/next/act styles (reuse `.tr-card` family) |
| `test/run_campaign.js` | **new** — see §6 |

## 6. Test plan — `test/run_campaign.js`
1. **Structural:** every campaign mission resolves to a real scenario/procedure of the
   right plant; ids unique; every scenario beat uses legal trigger vocabulary; every
   commentary has both registers; every new scenario has ≥1 `level_complete` endpoint
   reachable by `advance` graph (no orphan beats).
2. **Functional (headless, full M5 stack like `run_scenarios.js`):** each new scenario is
   driven to `level_complete` with a scripted operator: tour (load manual → follow),
   chain reaction (rod pull to critical → reinsert), feedback (nudge, stabilize), xenon
   (ride the transient), boron (dilute/borate), load follow (800 MW hold → return),
   protection (ack alarms → stable), qualify (AFW + PORV management through SBO → win),
   plus one failure endpoint spot-check (qualify: inaction → failure beat).
3. **Regression gates stay green:** `run_m6` 16/16, `run_scenarios`, `run_procedures`
   21/21, PWR engine suite, `verify_manual_follow`.
4. **Headless UI check:** Training tab DOM shows campaign acts, lock states, progress
   line; `?campaign=unlock` reveals all.

## 7. Out of scope (v1 campaign)
- RBMK / BWR campaigns (same wrapper will host them later — data-driven by design).
- Quiz/knowledge-check overlays — the *task is the test* (philosophy §1). May revisit.
- Server-side progress, accounts, certificates beyond the final `level_complete` card.
- New engine physics. All missions run on current, ops-validated behavior. Known tuning
  gaps (ops report: SGTR speed, high-flux trip cap) are **avoided**, not fixed here.
- Cold startup / turbine roll (no cold states in engine — Gameplay §9).

## 8. Success criteria
- A novice can click **Continue** nineteen times and arrive at "Qualified", having
  personally: taken a reactor critical, watched it push back, fought xenon, traded boron
  for rods, followed the grid, survived LOFW/RCP-trip/stuck-PORV, beaten TMI, and passed
  a blind station blackout.
- Each mission ≤ ~5 min wall clock; every physics term introduced by a task, not a lecture.
- `run_campaign.js` proves every mission completable on current physics, in CI, forever.
