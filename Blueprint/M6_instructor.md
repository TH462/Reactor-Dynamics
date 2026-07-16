# M6 — Instructor Layer (the real Instructor)

**Build this module from `CONTEXT.md` + this file alone.** No other module is required.
This is the scripted educational content engine — the layer that turns the simulator from a
sandbox into a teaching tool. It runs **scenarios**: authored sequences that deliver commentary,
inject failures on cue, and optionally gate operator actions to guide learning. This module
builds the **engine** (built once) **and** the flagship scenarios (authored content);
the library of scenarios grows over time without touching the engine. *(As built, that growth
has happened: `scenarios/` now holds ~28 files — the full PWR/RBMK/BWR training campaigns plus
the three-part TMI-2 module — all running on the one engine, exactly per the authoring boundary
in §16.)*

This module **replaces the placeholder M6·PH** in the same slot (`layers/instructor_layer.js`).
It implements the same interface M5 calls and M6·PH established (§3), so nothing above (M5/M8)
or below (M4) changes — M6 only *adds* scripted behavior on top of a stack already proven
correct by the Test Runner (M7). The Instructor is **not a person and not a conversational AI**;
it is a content engine that delivers pre-authored material triggered by conditions in the
running simulation. *(Chat-mode scenarios, §19, present scripted multi-speaker dialogue — still
pre-authored content, never generative.)*

> **Format note *(as built)*:** the scenario code samples in this document use an
> `export const scenario` ES-module shorthand for readability. The shipped scenarios are
> IIFEs attaching to a global registry (no bundler):
> `;(function (RD) { RD.SCENARIOS.<id> = { ... }; })(globalThis.RD || (globalThis.RD = {}));`
> — see `scenarios/pwr_tmi.js` and Gameplay §4.3, which documents the as-built convention.

`CONTEXT.md` defines the layer model, the command contract, the snapshot shape, HR5 (commands
descend through the Instructor), HR7 (failures routed by the Control & Failure Layer), the two
registers, and the `[tell user]` simplifications the Instructor must voice. **Rely on those.**

---

## 1. The Build Target

Per `CONTEXT.md §7`, this module produces:

| Path | Contents |
|------|----------|
| `layers/instructor_layer.js` | The `InstructorEngine` (built once): loads a scenario, evaluates beat triggers each step, delivers commentary, injects failures, issues commands, and gates operator actions. Replaces the M6·PH internals. |
| `scenarios/pwr_tmi.js` | The Three Mile Island scenario (authored content) — §14.1 |
| `scenarios/rbmk_chernobyl.js` | The Chernobyl scenario — §14.2 *(as built: a single pre-1986 witnessing; the post-1986 rematch is the separate mission `scenarios/rbmk_az5_fixed.js`)* |
| `scenarios/bwr_fukushima.js` | The Fukushima scenario (with the intervention decision point) — §14.3 |
| `scenarios/*.js` *(as built)* | The grown library: campaign scenarios for all three plants (tours, physics drills, upsets, qualification exams) and the three-part TMI-2 module (`pwr_tmi2_p1/p2/p3` + `pwr_tmi2_common`) — see `Blueprint/pwr_training_campaign.md` |

**Engine and content are separate** (the authoring boundary, §16): the engine is built once; the
scenarios are data it reads and grow over time. A scenario author needs to understand the plant
and the lesson, not the simulator's internals.

---

## 2. What a Scenario Is

A scenario is an authored experience built on one of the three plants, with a beginning state,
an ordered list of **beats**, and an educational purpose — ranging from a gentle familiarization
to a full accident reenactment. As **data** (a JS module exporting one `scenario` object):

```javascript
// scenarios/pwr_tmi.js
export const scenario = {
    id: "pwr_tmi",
    title: "Three Mile Island",
    plant_id: "pwr",
    design_version: null,              // or "pre_chernobyl" / "post_chernobyl" for the RBMK
    initial_state: "hot_full_power",   // a named initial state the engine supports (CONTEXT §6.9)
    mode: "demonstration",             // "demonstration" | "guided" | "free_response"  (§10)
    description: "The 1979 partial meltdown — a failure of information.",
    beats: [ /* ordered beat objects — §3 */ ],
};
```

**Starting a scenario** coordinates with the Simulation Service: selecting a scenario resets the
sim to `(plant_id, initial_state, design_version)` (M5's `reset`, M5 §6) and then calls
`instructor.load(scenario)`. From there the Instructor drives it each step.

---

## 3. The Interface (must match M6·PH and M5's call sites)

| Method | Called by | Real M6 behavior |
|--------|-----------|------------------|
| `handleCommand(command)` | M5 (forwarding plant commands) | **Apply gating** — if an active gate blocks `command.action`, the command is blocked and does **not** descend (HR5). Otherwise forward to `controlFailureLayer.handleCommand(command)`. Instructor-internal commands (`instructor_continue`, `instructor_interact`, `follow_nav`) are consumed here and never descend (§19). |
| `step(snapshot, simTime)` | M5, each broadcast cycle | Evaluate the current beat's trigger (or branch triggers); fire beats; update gates (§11). |
| `getSnapshotBlock()` *(as built)* | M5 (snapshot assembly) | The extended instructor block: `message`/`message_register` plus `scenario_id`, `current_beat_id`, `ui_policy`, `highlight`, `follow`, `level_complete`, and `chat` — every key present, `null` when inactive (Gameplay §5). |
| `getMessage()` | M5 (fallback when `getSnapshotBlock` is absent) | Return `{ message, message_register }` — the current commentary in the selected register, or `null` when none is pending. |
| `setRegister(value)` | M5 (`set_register`) | Track `"learning"` \| `"industry"`. |
| `load(scenario)` | M5 (scenario start) | Load the scenario, reset progress (§11). |
| `loadProcedure(proc, meta)` *(as built)* | M5 (`start_follow`) | Load a manual procedure for a Path 2 walkthrough (§20). `meta` carries `{ procedure_id, profile_key }` for save/restore. |
| `unload()` *(as built)* | M5 (`stop_scenario` / `stop_follow` / plain reset) | Back to free-play; preserves the register, clears everything else. |
| `connect(controlFailureLayer)` *(as built)* | M5 (every plant rebuild) | Re-point `below` without clearing progress (loadState restores after). |
| `consumeCheckpointRequest()` / `consumeRewindRequest()` / `consumeSpeedRequest()` *(as built)* | M5, polled right after `step()` | One-shot flags: beat-driven checkpoint pushes, world-scope rewinds (`{steps, scope}`), and time-acceleration requests — layering stays snapshots-up / commands-down, no upward callbacks. |
| `rebaseTime(newSimTime)` *(as built)* | M5, after a world-scope rewind | Clamp `scenarioStartTime` / `lastBeatFireTime` so time/delay triggers don't wait for time to re-elapse. |
| `saveState()` / `loadState(state)` | M5 (save/restore) | Serialize/restore scenario progress (§17). |

The Instructor holds a handle to the Control & Failure Layer below it (to forward and to issue
its own scenario commands) and tracks the selected register.

---

## 4. The Beat Structure

Each beat is a moment in the scenario: a trigger, content, optional actions, optional gating, and
flow control.

```javascript
{
    id: "feedwater_lost",

    // TRIGGER — when this beat fires. Exactly one trigger per beat (§5).
    trigger: { type: "time", value: 30.0 },

    // CONTENT — both registers required (§9).
    commentary: {
        learning: "The pumps feeding water to the steam generators have stopped. Without this water, the reactor can't get rid of its heat.",
        industry: "Loss of main feedwater. SG heat sink degrading. Expect reactor trip on low SG level.",
    },

    // ACTIONS — all optional. Failures are injected by issuing commands down to the C&F layer (HR7).
    inject_failures: ["loss_of_feedwater"],   // → inject_failure commands, descend the stack
                                              // (as built, an entry may also be an object: {failure_id, severity})
    clear_failures:  [],                       // → clear_failure commands
    commands:        [],                       // commands to issue automatically (e.g. {action:"manual_scram"})

    // GATING — restrict operator actions (optional). The gate persists until its 'until' trigger fires.
    gate: { block_actions: [], until: null },
    // As built a gate also supports: allow_actions (a whitelist — anything NOT listed is blocked)
    // and message ({learning, industry} voiced when a command is blocked).

    // FLOW CONTROL
    advance: "wait_for_trigger",   // "auto" = next beat may fire immediately; "wait_for_trigger" = next waits for its own trigger
                                   // "end" (as built) = terminate the flat beat list here — used by every
                                   // branch endpoint so a finished branch never falls through into the other's beats
}
```

A decision-point beat replaces linear `advance` with `branches` (§6).

### 4.1 Additional beat fields *(as built)*

The shipped engine (`layers/instructor_layer.js`) honors these optional beat fields beyond the
core set above:

| Field | Effect |
|-------|--------|
| `highlight` | `{ view, control_label, instrument_id }` — points the UI at a control or gauge; surfaced in the snapshot block. |
| `level_complete` | End-of-mission card: `{ title, outcome_learning, outcome_industry, actions }` (`actions` defaults to `["continue","retry"]`; may include `"rewind"`). Both-register outcomes follow the §7 rule. |
| `speed` | Beat-driven time acceleration (a number, e.g. `30`): fast-forward a slow phase, and — the key device — drop back to `1` on a beat whose trigger is the condition you were waiting for. Requested via the consume-flag API (§3). |
| `rewind` | `{ steps }` — asks M5 to roll the *world* back while the Instructor keeps its progress (the "watch that again" device). A rewind beat does not also checkpoint. |
| `dialogue`, `chat_button`, `story_min`, `time_skip` | Chat-mode fields — §19. |

Every non-rewind beat fire also requests a checkpoint, so Rewind lands on beat boundaries.

---

## 5. Trigger Types

Exactly one trigger per beat (or per branch). **Triggers read instruments** (HR1) — consistent
with the whole system — except the `true_state` trigger, which is the author's deliberate hook
for events the operator cannot see.

```javascript
{ type: "time",   value: 30.0 }                                           // seconds since scenario start
{ type: "delay",  value: 15.0 }                                           // seconds since the previous beat fired
{ type: "instrument", instrument: "sg_level", direction: "below", value: 30.0 }   // reads an INSTRUMENT (HR1)
{ type: "true_state", field: "core_inventory_pct", direction: "below", value: 70.0 }   // author-keyed true_state field (CONTEXT §6.3); truth the operator can't see
{ type: "operator_action", command: "set_hpi", params: { active: true } }         // the operator issues a particular command
{ type: "inaction", window: 60.0 }                                        // fires if no relevant action within the window
{ type: "alarm", alarm_id: "subcooling_lost", state: "active_unacknowledged" }     // an alarm reaches a state
{ type: "scram" }                                                          // the reactor trips
{ type: "manual" }                                                         // the user clicks "Continue" (demonstration)
{ type: "all", triggers: [ /* ... */ ] }                                   // composite — all sub-triggers true
{ type: "any", triggers: [ /* ... */ ] }                                   // composite — any sub-trigger true
```

**Direction vocabulary.** Numeric triggers use `"below"` / `"above"` — the same meaning as the
`"low"` / `"high"` used by trips and alarms (M4), just the trigger subsystem's wording. Boolean
fields and status readings use `"is_true"` / `"is_false"` (and `"is_open"` for a position
indicator), with `value` set to match. `instrument` triggers read instrument readings (HR1);
`true_state` triggers read the snapshot's `true_state` fields — the author's deliberate hook for
truth the operator cannot see.

---

## 6. Decision Points and Branching

A decision point is a beat whose next beat depends on what the operator does. Use `branches`
instead of a single `advance`; the engine watches **all** branch triggers simultaneously and
jumps to the `goto` beat of whichever fires first. Beats are addressable by `id`.

```javascript
{
    id: "injection_decision",
    trigger: { type: "alarm", alarm_id: "subcooling_low", state: "active_unacknowledged" },
    commentary: {
        learning: "Your subcooling margin is falling — the coolant is getting close to boiling. You can start emergency injection to add water. What will you do?",
        industry: "Subcooling margin eroding. HPI is available. Decision point.",
    },
    branches: [
        { trigger: { type: "operator_action", command: "set_hpi", params: { active: true } }, goto: "recovery_path" },
        { trigger: { type: "inaction", window: 120.0 },                                       goto: "damage_path" },
    ],
}
```

**The converge idiom *(as built)*.** Because beats are one flat ordered list, a side-branch beat
that should re-merge into the main chain uses a single `{ type: "delay" }`-triggered branch as an
unconditional jump: `branches: [{ trigger: { type: "delay", value: 2.5 }, goto: "main_chain_beat" }]`.
The TMI-2 Part 3 scenario documents and uses this idiom (`scenarios/pwr_tmi2_p3.js` header — its
`jump(target)` helper); side beats are placed after the endings so the linear chain never falls
into them.

---

## 7. Commentary and the Two Registers

The Instructor's primary output is commentary — explanatory text delivered at the right moments.
**Every piece of commentary exists in two registers, authored together**, and the user chooses
which they see:

- **Learning** — plain language, assuming no prior nuclear knowledge; explains concepts as it
  goes (what subcooling margin means, why losing coolant is dangerous, what a scram does).
- **Industry** — real plant terminology, for users who want authentic language and already grasp
  the concepts; the same moment as an operator or engineer would describe it.

The engine delivers whichever the user has selected (`setRegister`); `getMessage()` returns that
register's text. This is how the simulator meets both a curious beginner and a knowledgeable
enthusiast without compromising for either. (The register choice also switches the UI's labels,
M8 §8 — but that is the UI's job; the Instructor only picks the commentary register.)

---

## 8. (commentary covered in §7)

---

## 9. The Three Modes

Scenarios give the operator different degrees of freedom. The mode is an authoring stance the
same beat/gate/branch machinery serves — not a separate code path:

- **Demonstration** — set up a situation and let it unfold with commentary while the operator
  mostly watches (limited or no control). For showing a phenomenon or walking through an accident
  the first time. (Heavier gating; `manual`/`time`/`delay` triggers advance it.)
- **Guided operation** — lead the operator through a sequence using commentary to instruct and
  gating to keep them on the path. For teaching a procedure. (The operator acts, within a guided
  structure.)
- **Free response** — establish a condition then let the operator respond as they choose, without
  guidance, to see what they do. For assessment and the "what would you do?" moments that make
  the accident scenarios powerful. (Light or no gating; the scenario observes via
  `operator_action` / `inaction` triggers and branches.)

A single scenario may move between modes — demonstrating a phenomenon, then handing control to the
operator at a decision point.

---

## 10. (modes covered in §9)

---

## 11. How the Engine Runs a Scenario

```javascript
class InstructorEngine {
    load(scenario) {
        this.scenario = scenario;
        this.currentBeatId = scenario.beats[0]?.id ?? null;
        this.scenarioStartTime = null;
        this.lastBeatFireTime = null;
        this.activeGates = [];
        this.firedBeats = new Set();    // beat ids already fired — guards against re-firing on a goto loop
        this.pendingMessage = null;     // { learning, industry } of the last fired beat
    }

    step(snapshot, simTime) {
        if (this.scenarioStartTime === null) this.scenarioStartTime = simTime;
        const beat = this.currentBeat();
        if (beat && !this.firedBeats.has(beat.id)) {
            if (beat.branches) {
                for (const br of beat.branches) {
                    if (this.evaluateTrigger(br.trigger, snapshot, simTime)) { this.fireBranch(beat, br); break; }
                }
            } else if (this.evaluateTrigger(beat.trigger, snapshot, simTime)) {
                this.fireBeat(beat, snapshot, simTime);
            }
        }
        this.updateGates(snapshot, simTime);   // lift any gate whose 'until' trigger has fired
    }

    fireBeat(beat, snapshot, simTime) {
        this.pendingMessage = beat.commentary;                    // shown via getMessage() in the current register
        for (const f of (beat.inject_failures ?? [])) this.below.handleCommand({ action: "inject_failure", failure_id: f });
        for (const f of (beat.clear_failures  ?? [])) this.below.handleCommand({ action: "clear_failure",  failure_id: f });
        for (const c of (beat.commands        ?? [])) this.below.handleCommand(c);          // e.g. {action:"manual_scram"}
        if (beat.gate && beat.gate.block_actions.length) this.activeGates.push(beat.gate);
        this.firedBeats.add(beat.id);
        this.lastBeatFireTime = simTime;
        this.advanceFrom(beat);                                   // next beat, honoring 'advance'
    }

    // Gating in the command path (HR5): called from handleCommand for descending operator commands.
    // Blocked shape (as built): distinguishable from M4's success (null) and error shapes.
    handleCommand(command) {
        for (const gate of this.activeGates)
            if (gate.block_actions.includes(command.action))                             // does not reach the engine
                return { type: 'blocked', code: 'GATED_BY_INSTRUCTOR', message: text };
        return this.below.handleCommand(command);
    }

    getMessage() {
        return this.pendingMessage
            ? { message: this.pendingMessage[this.register], message_register: this.register }
            : { message: null, message_register: this.register };
    }
}
```

The Instructor **sits in the command path** (HR5): operator commands pass through `handleCommand`
so gating can block them; the Instructor's own scenario actions (failure injection, auto-commands)
also descend through the Control & Failure Layer, which **places failures correctly per HR7** and
applies command interception. The Instructor **does not compute physics, evaluate protection, or
manage alarms** — those belong below it. It orchestrates the scripted experience on top of a plant
that is already fully simulated and already protecting and alarming itself.

---

## 12. What the Instructor Reads and Does

- **Reads the snapshot** to evaluate beat triggers — on the **instrument readings** the operator
  sees (HR1), except where a scenario deliberately keys on a `true_state` field only the author
  would know (an explicit, intentional exception).
- **Delivers commentary** to the UI via the snapshot's `instructor` block.
- **Injects failures** by requesting them through the layer below (HR7).
- **Gates actions** by intercepting operator commands when a beat restricts them (HR5).

---

## 13. The Honesty Acknowledgments It Must Voice

Part of the product's integrity is being honest about simplification (`CONTEXT.md §8`,
`[tell user]` items). The flagship scenarios must voice these in commentary, in whichever register
is selected:

- **Chernobyl — magnitude.** The lumped point-kinetics model understates the excursion (the
  historical ~100× peak required three-dimensional spatial behavior). The scenario says so plainly:
  the *mechanism and outcome* are faithful; only the magnitude is understated. (§14.2 closing.)
- **Fukushima / Chernobyl — no containment model.** The simulation ends at fuel damage; the
  containment events that followed (the Chernobyl explosion, the Fukushima hydrogen explosions)
  are described in commentary, not modeled. (§14.2 / §14.3 damage paths.)
- **No sensor redundancy** (optional) — a single stuck sensor affects everything downstream,
  making failures more impactful than in a real voted plant; acknowledge where relevant.

The principle: a simulator that says "this is exactly what happened" when it cannot be is less
trustworthy, not more impressive. Saying "the real excursion was larger than what you are seeing,
because the full physics is beyond this model, but the mechanism and the outcome are faithful"
earns trust and teaches something true about the limits of simplified models.

### 13.1 The authentic-units note (once per plant)

The Instructor must also voice, **once per plant**, a brief orientation about units. All readouts
display in whichever system the player chose (the Units toggle, M8 §4) — comfort comes first — but
each plant has an *authentic* operating-unit convention, and the Instructor names it so the player
knows what a real operator at that plant would have read:

- **PWR (Three Mile Island)** — a US plant; authentically read in **US customary** (psia, °F).
- **RBMK (Chernobyl)** and **BWR (Fukushima)** — authentically read in **SI** (MPa, °C).

Deliver it early — in the scenario's familiarization / intro beat — in both registers, framed as
information, never a correction: the player is free to keep either system. It pairs with the UI's
own authentic-units note (M8 §5.4); the Instructor states it in words, the UI marks it on the
gauges. Fire it once per plant (e.g., gate it to the intro beat of each scenario, or guard it with
a per-plant `unitsNoteVoiced` flag in the same spirit as `firedBeats`).

**Authoring consequence — keep numeric commentary unit-aware.** Because the player may be viewing
*either* system, scenario commentary should prefer **qualitative, relative phrasing** over
hardcoded numbers in one unit system: "pressure is falling toward the relief setpoint,"
"subcooling margin is almost gone," "you are well above the scram point" — not "pressure is 15.4
MPa." When a specific figure is genuinely instructive, state it in the **plant's authentic units**
(the ones this note just named) and, where it helps, anchor it to a setpoint the gauge already
marks. This keeps the commentary correct regardless of the player's display choice.


---

## 14. The Flagship Scenarios (authored content)

### 14.1 Three Mile Island — `scenarios/pwr_tmi.js`
Establishes a normal PWR, then runs the sequence: feedwater lost → reactor trips → PORV opens and
sticks while its indicator reads closed → subcooling erodes while the indicator lies → a decision
point: run injection (recovery) or not (damage). It teaches the operator to distrust a single
indication and read the parameters that reveal the true state.

> ***(As built)*** the shipped `scenarios/pwr_tmi.js` supersedes the inline sketch below. It keeps
> the same arc but adds the historical AFW blockage (injects `afw_failure` alongside
> `loss_of_feedwater`, cleared at the ~8-minute discovery), isolation via `close_block_valve`,
> beat-driven time acceleration (`speed: 30/10/1`) through the slow stretches, `level_complete`
> cards on both endpoints with `advance: "end"`, and the §13 honesty/units notes. Read the file
> for the authoritative beats; the sketch remains as the authoring illustration.

```javascript
export const scenario = {
    id: "pwr_tmi", title: "Three Mile Island", plant_id: "pwr", design_version: null,
    initial_state: "hot_full_power", mode: "demonstration",
    description: "The 1979 partial meltdown — a failure of information.",
    beats: [
        { id: "intro", trigger: { type: "time", value: 2.0 },
          commentary: {
            learning: "This is a pressurized water reactor running normally at full power. Take a moment to look at the gauges.",
            industry: "PWR at 100% power, steady state. Note your key parameters." },
          advance: "wait_for_trigger" },
        { id: "feedwater_lost", trigger: { type: "time", value: 30.0 },
          commentary: {
            learning: "The pumps feeding water to the steam generators have stopped. Without this water, the reactor can't shed its heat.",
            industry: "Loss of main feedwater. SG heat sink degrading. Expect reactor trip on low SG level." },
          inject_failures: ["loss_of_feedwater"], advance: "wait_for_trigger" },
        { id: "reactor_trips", trigger: { type: "scram" },
          commentary: {
            learning: "The reactor shut itself down automatically — a scram. But it's still very hot and still making heat.",
            industry: "Reactor trip on low SG level. Decay heat is now the concern." },
          advance: "wait_for_trigger" },
        { id: "porv_sticks", trigger: { type: "delay", value: 10.0 },
          commentary: {
            learning: "A relief valve opened to let off pressure — but it's stuck open. Worse, its indicator light shows CLOSED. Watch carefully.",
            industry: "PORV opened on high pressure and failed to reseat. Position indicator reads closed. This is the trap." },
          inject_failures: ["stuck_porv_open", "porv_indicator_stuck_closed"], advance: "wait_for_trigger" },
        { id: "injection_decision", trigger: { type: "alarm", alarm_id: "subcooling_low", state: "active_unacknowledged" },
          commentary: {
            learning: "Your subcooling margin is falling — coolant is nearing a boil. The valve indicator still says closed, but THIS number is the truth. You can start emergency injection. What will you do?",
            industry: "Subcooling eroding despite 'closed' PORV indication. HPI available. Decision point." },
          branches: [
            { trigger: { type: "operator_action", command: "set_hpi", params: { active: true } }, goto: "recovery_path" },
            { trigger: { type: "inaction", window: 120.0 },                                        goto: "damage_path" },
          ] },
        { id: "recovery_path", trigger: { type: "manual" },
          commentary: {
            learning: "You started injection in time. Water replaces what was lost, and the core stays covered. This is the decision the 1979 operators didn't make — because their indicator lied.",
            industry: "HPI restored inventory; core remains covered. The recovery the 1979 crew missed by trusting the PORV indication." },
          advance: "wait_for_trigger" },
        { id: "damage_path", trigger: { type: "manual" },
          commentary: {
            learning: "Without injection, water kept draining through the stuck valve. The core is uncovering and overheating — what happened in 1979. The information to prevent it was there, in the subcooling margin, all along.",
            industry: "Inventory loss continued through the stuck PORV. Core uncovery and damage — the 1979 outcome. The subcooling margin held the truth the whole time." },
          advance: "wait_for_trigger" },
    ],
};
```

### 14.2 Chernobyl — `scenarios/rbmk_chernobyl.js` *(as built: a witnessing, plus a separate rematch)*
The pre/post comparison is still **two scenario instances on the same plant** with different
`design_version` — but as built they are two separate campaign missions, not a paired export in
one file:

- **`rbmk_chernobyl`** (`design_version: "pre_chernobyl"`, from `low_power_xenon`) — the 01:23:40
  reconstruction. Physics probing showed the validated `low_power_xenon` state is beyond saving on
  the pre-1986 design: the engine runs away within seconds whether or not AZ-5 is pressed. The
  scenario embraces that truth — **this is a WITNESSING, not a puzzle.** Four beats: the intro
  reads the trap off the board (7% power, deep xenon, ORM under eight rods, AR saturated, manual
  control); `runaway` and `az5` fire on `true_state.power_pct` thresholds (the AZ-5 beat issues
  the `scram` command itself); and the `destruction` beat triggers on
  `{ type: "true_state", field: "melted", direction: "is_true" }` — **not** a
  `steam_explosion_occurred` field. The full teaching (graphite tips, the six hours of decisions,
  the honesty notes below) is carried by the aftermath commentary on the destruction beat, which
  stays on screen; it ends in a `level_complete` card ("Chernobyl — Witnessed") with
  `advance: "end"`.
- **`rbmk_az5_fixed`** (the next mission in the RBMK campaign, `ui/campaign_data.js`) — the
  playable rematch on the `post_chernobyl` design: the identical trap state, but a prompt AZ-5
  shuts the rebuilt machine down cleanly, and hesitation still loses. The contrast the original
  pre/post pairing wanted is drawn across the two missions.

The §13 honesty acknowledgments survive intact in the aftermath commentary: point kinetics
understates the localized excursion (the real event began in one corner of a 7-meter core —
worse), and the simulation ends at the destruction — fire, releases, and human cost are history's
to tell, not this trainer's.

### 14.3 Fukushima — `scenarios/bwr_fukushima.js`
Establishes the station blackout after a successful scram; RCIC holds the core covered for hours
without AC; the batteries deplete and cooling fails; a decision point: depressurize and inject
(saved) or not (damage). Modeled with an in-scenario branch (like TMI). Runs over hours — the user
accelerates time; triggers are condition-based so they fire whenever the condition is met.

```javascript
export const scenario = {
    id: "bwr_fukushima", title: "Fukushima Daiichi", plant_id: "bwr", design_version: null,
    initial_state: "post_scram_sbo", mode: "demonstration",
    description: "2011 station blackout — a failure of sustained support.",
    beats: [
        { id: "intro", trigger: { type: "time", value: 2.0 },
          commentary: {
            learning: "This reactor has already shut down safely — the scram succeeded. But all electrical power is gone, and decay heat is still being produced. One cooling system, RCIC, is keeping the core covered using the reactor's own steam — no electricity needed. It runs on battery-backed controls.",
            industry: "Post-scram, station blackout. RCIC injecting on steam + DC control power, no AC. Core covered. Decay heat is the load." },
          advance: "wait_for_trigger" },
        { id: "grace_window", trigger: { type: "delay", value: 10.0 },
          commentary: {
            learning: "Hours are passing. RCIC is holding the water level. But the batteries that power its controls are finite — about eight hours. Use the speed control to move through the grace window.",
            industry: "Grace window in progress. RCIC sustained on battery control power; ~8 h limit. Accelerate time to traverse." },
          advance: "wait_for_trigger" },
        { id: "batteries_deplete", trigger: { type: "instrument", instrument: "rcic_status", direction: "is_false", value: false },
          commentary: {
            learning: "The batteries are depleted. RCIC has stopped. Injection has ceased, and the water level is now falling. The core is heading toward uncovery.",
            industry: "Battery depletion → RCIC trip. Injection lost. Vessel level falling on decay-heat boiloff." },
          advance: "wait_for_trigger" },
        { id: "injection_decision", trigger: { type: "alarm", alarm_id: "vessel_level_low", state: "active_unacknowledged" },
          commentary: {
            learning: "You can still save the core: depressurize the vessel with ADS, then inject low-pressure water with LPCI. But you must act before the core uncovers. What will you do?",
            industry: "Decision point. ADS depressurization + LPCI available before uncovery. Act or lose the core." },
          branches: [
            { trigger: { type: "operator_action", command: "trigger_ads" }, goto: "depressurizing" },
            { trigger: { type: "inaction", window: 180.0 },                goto: "damage_path" },
          ] },
        { id: "depressurizing", trigger: { type: "instrument", instrument: "vessel_pressure", direction: "below", value: 1.03 },
          commentary: {
            learning: "The vessel is depressurizing. Once the pressure is low enough, start the low-pressure injection.",
            industry: "Vessel below LPCI threshold. Initiate LPCI." },
          advance: "wait_for_trigger" },
        { id: "saved_path", trigger: { type: "operator_action", command: "start_lpci" },
          commentary: {
            learning: "You depressurized and injected in time. The level stabilizes; the core stays covered. This is the action that could have changed Fukushima — the eight-hour grace window existed, and what happened inside it determined everything.",
            industry: "LPCI restored vessel level post-depressurization. Core covered. The decision that stood between recovery and damage." },
          advance: "wait_for_trigger" },
        { id: "damage_path", trigger: { type: "manual" },
          commentary: {
            learning: "Without depressurizing and injecting, decay heat boiled the water away. The core has uncovered and begun to overheat. One honest note: this simulation ends at fuel damage — the hydrogen explosions that followed at Fukushima are beyond what it models, but the path to them began right here.",
            industry: "No intervention: continued boiloff → core uncovery and damage. Containment-stage consequences (hydrogen generation, explosions) are not modeled; the path to them begins here." },
          advance: "wait_for_trigger" },
    ],
};
```

---

## 15. Smaller Scenarios

Beyond the flagships, the Instructor runs smaller teaching scenarios that build the understanding
the flagships assume: a first familiarization with each plant, drills on individual transients,
exercises in reading particular parameters. They share the **same beat structure and the same
two-register commentary** and are authored as content over time. The engine supports them from the
start; no engine change is needed to add them. (A familiarization is typically `mode: "guided"`
or `"free_response"` with light gating and `time`/`delay`/`operator_action` triggers.)

---

## 16. The Authoring Boundary

The Instructor **engine** and the scenario **content** are separate. The engine is built once: it
reads scenarios, evaluates triggers, delivers commentary, injects failures, gates actions. The
scenarios are authored as content and grow over time **without changing the engine**. This means
the marquee accident scenarios and the library of smaller ones are written and refined as content
work, not engineering work — and a scenario author needs to understand the plant and the lesson,
not the simulator's internals. Keep the engine free of any scenario-specific logic; everything
plant- or lesson-specific lives in the scenario data.

---

## 17. Save and Restore

The Instructor's state is small but real: the loaded scenario id, the current beat (`currentBeatId`),
which beats have fired, the scenario start time and last-beat-fire time, the active gates, the
pending message, and the selected register. `saveState()` captures these so a restored run resumes
the scenario at the same beat with the same gates in force; `loadState(state)` restores them. (The
heavy state — the physics and instruments — is the engine's, M5 §8; the Instructor's is just its
scenario progress.)

---

## 18. The Swap from M6·PH

Because M5 forwards plant commands to "the Instructor slot" without caring which implementation is
present (M5 §5), and because this module implements exactly the interface M6·PH established (§3),
the real Instructor replaces M6·PH with **no changes** to M5, M4, M7, or M8. Everything the Test
Runner validated against the placeholder (command flow, interception, alarms, the protection
boundary) remains valid — M6 only *adds* gating, commentary, and scenario-driven failure injection
on top of a stack already proven correct. In free-play (no scenario loaded) the engine behaves
exactly like the placeholder: it forwards commands, gates nothing, and reports a null message.

---

## 19. Chat Mode and Dialogue *(as built — the TMI-2 module)*

Developed under the M5 TMI-2 module specs (`Blueprint/M5 TMI2 Scenario Spec.md`), chat mode turns
the single-slot commentary card into a persistent, multi-speaker transcript. It is scenario data
run by the same engine (`layers/instructor_layer.js`) — the authoring boundary (§16) holds.

- **`chat: true`** at scenario level enables it; the snapshot block (§3) then carries
  `chat: { log, rev, interactions }` (log capped at 300 lines; `rev` is the UI's cheap re-render
  key). Non-chat scenarios carry `chat: null`.
- **`dialogue` beats** — a beat may carry an array of lines
  `{ speaker, learning, industry }`; lines land in the chat log. Speaker roles: `sup` (shift
  supervisor, scripted), `supx` (supervisor reacting — visually distinct), `aux` (aux operator),
  `sys` (annunciator callouts), `player` (contextual outgoing bubbles — the player never types),
  `chief` (the out-of-fiction teaching voice). `commentary` remains the single-slot fallback for
  non-chat scenarios and gate feedback; gate denials in chat scenarios are voiced in-transcript
  (deduped, in-character).
- **`interactions` table + instructor-internal commands** — a scenario-level table maps
  `interaction_id` → `{ request, responses, repeat, request_repeat, clear_failures, commands }`.
  The UI sends `instructor_interact { interaction_id }` on a click of a scenario object (e.g. the
  TMI-2 maintenance tag): first activation posts the scripted request/response exchange and may
  act on the plant (clear failures, issue commands — a granted request); repeats cycle authored
  variants. `instructor_continue` is the Continue click behind the `manual` trigger. Both are
  **consumed in the Instructor and never descend to M4** — they are not plant commands.
  Interactions are visible to `operator_action` triggers as
  `{ command: "instructor_interact", params: { interaction_id } }`.
- **`setup_commands`** — scenario-level commands applied by the Simulation Service at scenario
  start (before any beat fires), e.g. TMI-2's pre-existing `afw_failure`.
- **Story clock** — per-beat `story_min` anchors (minutes since the story's opening) keep the
  HISTORICAL durations visible while the sim compresses hours into minutes; `time_skip: true`
  marks the deliberately compressed beats, and the UI draws its elapsed-time divider **only** on
  those.
- **`chat_button`** — the beat's outgoing pacing button:
  `{ style: 'ack' | 'skip', label_learning, label_industry, speed }`. `ack` is the plain
  acknowledge gate ("Ready" / "Go ahead"); `skip` is the diegetic fast-forward (its `speed`
  applies until the next beat drops back to 1×).

---

## 20. Follow Mode *(as built — Path 2 procedures)*

The same engine runs manual-procedure walkthroughs — Gameplay §§3–4 and §6 cover the concept;
these are the shipped mechanisms (`layers/instructor_layer.js`):

- **`loadProcedure(proc, meta)`** loads a `RD.MANUAL_PROCEDURES` procedure directly (started via
  M5's `start_follow`) — procedures are **not** converted to beats; there is no second copy of the
  content.
- **Strict gating:** only the current step's command is allowed, expanded to its family so every
  UI path to the same intent counts (`ROD_FAMILY` = rod_nudge/rod_start/rod_stop/rod_stop_all),
  plus the always-allowed safety set (`ALWAYS_ALLOWED` = scram, manual_scram, acknowledge_alarm,
  acknowledge_all_alarms). Observation steps (no cmd/acc/saw) allow nothing — look, don't touch.
  Off-procedure commands return the §11 blocked shape with wrong-action commentary (a per-step
  authored `wrong: {learning, industry}` overrides the generic template).
- **Auto-advance with debounce:** a step completes when its obligations are met — `cmd` seen,
  `saw` latched, and `acc` held for `ACC_STABLE_N` (= 5) consecutive broadcast evaluations, so a
  parameter sweeping through its target band doesn't advance the procedure in passing.
- **Instrument-first grading (HR1):** the `PARAM_INSTRUMENT` map (per plant) translates each
  predicate's `true_state` param to the instrument the operator actually reads; grading falls back
  to `true_state` only for params with no instrument twin (the documented Gameplay §6 exception).
  The snapshot `follow` block reports `graded_by`.
- **Navigation:** the UI's `follow_nav { dir: 'next' | 'prev' | 'restart' }` is instructor-internal
  (never descends); auto-advance pushes a checkpoint so Rewind lands on step boundaries;
  completion raises a `level_complete` card.
