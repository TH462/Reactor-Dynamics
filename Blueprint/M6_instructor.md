# M6 — Instructor Layer (the real Instructor)

**Build this module from `CONTEXT.md` + this file alone.** No other module is required.
This is the scripted educational content engine — the layer that turns the simulator from a
sandbox into a teaching tool. It runs **scenarios**: authored sequences that deliver commentary,
inject failures on cue, and optionally gate operator actions to guide learning. This module
builds the **engine** (built once) **and** the **three flagship scenarios** (authored content);
the library of smaller scenarios grows over time without touching the engine.

This module **replaces the placeholder M6·PH** in the same slot (`layers/instructor_layer.js`).
It implements the same interface M5 calls and M6·PH established (§3), so nothing above (M5/M8)
or below (M4) changes — M6 only *adds* scripted behavior on top of a stack already proven
correct by the Test Runner (M7). The Instructor is **not a person and not a conversational AI**;
it is a content engine that delivers pre-authored material triggered by conditions in the
running simulation.

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
| `scenarios/rbmk_chernobyl.js` | The Chernobyl scenario, **two instances** (pre / post) — §14.2 |
| `scenarios/bwr_fukushima.js` | The Fukushima scenario (with the intervention decision point) — §14.3 |

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
| `handleCommand(command)` | M5 (forwarding plant commands) | **Apply gating** — if an active gate blocks `command.action`, the command is blocked and does **not** descend (HR5). Otherwise forward to `controlFailureLayer.handleCommand(command)`. |
| `step(snapshot, simTime)` | M5, each broadcast cycle | Evaluate the current beat's trigger (or branch triggers); fire beats; update gates (§11). |
| `getMessage()` | M5 (snapshot assembly) | Return `{ message, message_register }` — the current commentary in the selected register, or `null` when none is pending. |
| `setRegister(value)` | M5 (`set_register`) | Track `"learning"` \| `"industry"`. |
| `load(scenario)` | M5 (scenario start) | Load the scenario, reset progress (§11). |
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
    clear_failures:  [],                       // → clear_failure commands
    commands:        [],                       // commands to issue automatically (e.g. {action:"manual_scram"})

    // GATING — restrict operator actions (optional). The gate persists until its 'until' trigger fires.
    gate: { block_actions: [], until: null },

    // FLOW CONTROL
    advance: "wait_for_trigger",   // "auto" = next beat may fire immediately; "wait_for_trigger" = next waits for its own trigger
}
```

A decision-point beat replaces linear `advance` with `branches` (§6).

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
    handleCommand(command) {
        for (const gate of this.activeGates)
            if (gate.block_actions.includes(command.action)) return { blocked: true };   // does not reach the engine
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

### 14.2 Chernobyl — `scenarios/rbmk_chernobyl.js` (two instances: pre / post)
The pre/post comparison is run as **two scenario instances on the same plant** with different
`design_version` (`CONTEXT.md` / doc-format: comparisons are two instances, not a special
structure). The Instructor presents them back to back; the closing commentary of the second draws
the contrast. The export provides both.

```javascript
const sharedPreconditions = [
    { id: "intro", trigger: { type: "time", value: 2.0 },
      commentary: {
        learning: "This RBMK reactor is in a dangerous state: very low power, xenon poisoning suppressing the reaction, most control rods withdrawn to compensate, and cooling flow reduced. The automatic protection has been switched off for a test. Every safeguard is compromised.",
        industry: "RBMK at low power, peak xenon, ORM far below minimum, reduced coolant flow, EPS bypassed. Accident preconditions established." },
      commands: [{ action: "set_eps_bypass", active: true }], advance: "wait_for_trigger" },
    { id: "shutdown_initiated", trigger: { type: "manual" },
      commentary: {
        learning: "The operator presses AZ-5 — the emergency shutdown. In any safe reactor this ends the chain reaction. Watch what happens here.",
        industry: "AZ-5 initiated. Full rod insertion begins." },
      commands: [{ action: "manual_scram" }], advance: "wait_for_trigger" },
];

export const scenarioPre = {
    id: "rbmk_chernobyl_pre", title: "Chernobyl (1986 reactor)", plant_id: "rbmk",
    design_version: "pre_chernobyl", initial_state: "low_power_xenon", mode: "demonstration",
    description: "April 26, 1986 — a failure of design.",
    beats: [
        ...sharedPreconditions,
        { id: "the_excursion", trigger: { type: "true_state", field: "power_pct", direction: "above", value: 20.0 },
          commentary: {
            learning: "The shutdown is making it WORSE. The graphite tips on the rods are adding reactivity at the bottom of the core, and the boiling is running away. Power is rising, not falling.",
            industry: "Positive scram effect plus amplified void feedback at low ORM. Reactivity approaching prompt critical; power excursing." },
          advance: "wait_for_trigger" },
        { id: "destruction", trigger: { type: "true_state", field: "steam_explosion_occurred", direction: "is_true", value: true },
          commentary: {
            learning: "The core has been destroyed by a steam explosion. One honest note: the real excursion was larger and faster than this simplified model can show — the full three-dimensional physics is beyond what it represents. But the mechanism and the outcome are faithful. The shutdown action triggered the disaster. And the explosion and fire that followed in 1986 are beyond what this simulation models.",
            industry: "Prompt energy excursion → steam explosion → core destruction. Note: lumped point-kinetics understates the historical magnitude; mechanism and outcome are faithful. Containment-breach consequences are not modeled." },
          advance: "wait_for_trigger" },
    ],
};

export const scenarioPost = {
    id: "rbmk_chernobyl_post", title: "Chernobyl (post-1986 reactor)", plant_id: "rbmk",
    design_version: "post_chernobyl", initial_state: "low_power_xenon", mode: "demonstration",
    description: "The same conditions, the same action — on the fixed design.",
    beats: [
        ...sharedPreconditions,
        { id: "safe_shutdown", trigger: { type: "true_state", field: "scrammed", direction: "is_true", value: true },
          commentary: {
            learning: "The same conditions. The same button, AZ-5, pressed at the same moment. But this is the post-1986 reactor — the rod tips fixed, the void coefficient reduced, more absorbers added. Power falls. The reactor shuts down safely. Nothing explodes. The same action, two outcomes — because the design was fixed. That is the lesson.",
            industry: "Identical preconditions and AZ-5 initiation, post-1986 configuration: no positive scram effect, reduced void feedback. Controlled shutdown, no excursion. The design change is the entire difference." },
          advance: "wait_for_trigger" },
    ],
};
```

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
