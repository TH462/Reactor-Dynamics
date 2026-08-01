**Reactor⚛️Dynamics — Training & Gameplay Companion**  
**Version 1.1 — Gameplay vision + M6 bridge (not the implementation spec)**

This document defines **product vision** for the training and gameplay layer: philosophy, four paths, UX policy, and how gameplay maps onto the existing stack. It is read alongside `CONTEXT.md` when building M6.

**Implementation spec (authoritative for code):** `Blueprint/M6_instructor.md` — beat structure, triggers, gating, interface, flagship scenario outlines.  
**Procedure source of truth:** `ui/manual_procedures.js` (`RD.MANUAL_PROCEDURES`) + `test/run_procedures.js` per CONTEXT §12.  
**Manual plan (full procedure catalog):** `Blueprint/OPERATOR_MANUAL_PLAN.md`.

When this companion and `M6_instructor.md` disagree on mechanics, **M6_instructor.md wins**. When they disagree on tone or player experience, **this document wins**.

---

### 1. Design Philosophy (The Interactive Puzzle Strategy)

Reactor⚛️Dynamics is a **high-end strategy and puzzle game** whose victory condition is deep understanding of nuclear plant physics and operation.

**Core Principles (non-negotiable for tone and mechanics):**

- **Physics are the rules of the puzzle.** The UI provides the tools. Players learn by experimenting, failing safely, and retrying.
- **In Medias Res Hook:** New users are dropped into meaningful action within the first 30 seconds (press the Reactor Trip button and watch the dramatic response).
- **Constructive Failure via Rewind:** Mistakes are encouraged. The Rewind mechanic turns failure into the primary learning loop. Failure is never "Game Over" — it is data.
- **Interleaved Progression:** Never deliver long theory blocks. The loop is always: **Learn a rule → Apply it with a tool → Solve a small puzzle → Repeat**.
- **Micro-Scenarios:** Every learning objective is a self-contained 2–5 minute experience with clear "Level Complete" feedback.
- **Historical Boss Fights:** The emotional peak is accurate recreations of real accidents (TMI, Chernobyl, Fukushima). Players use Rewind and their learned skills to recognize historical errors and choose better actions.

**North Star:** We trick the player into mastering advanced reactor physics by disguising it as a deeply engaging, consequence-free puzzle game where curiosity and experimentation are rewarded.

This philosophy takes precedence over "traditional training software" instincts when making design trade-offs in M6.

---

### 2. What Already Exists (do not rebuild)

| Capability | Status | Location |
|------------|--------|----------|
| **M6 Instructor (beat engine)** | **Built, tested 16/16** | `layers/instructor_layer.js`, `test/run_m6.js` |
| Simulation Service + command path | Built (+ scenario/follow/rewind commands) | `layers/simulation_service.js` |
| Manual procedures + acceptance predicates | **21/21 validated** | `ui/manual_procedures.js`, `test/run_procedures.js` |
| Manual control-pill ↔ Plant Display audit | PASS | `test/run_manual_controls.js`, `test/manual_ui_map.js` |
| **Follow in Instructor** (Path 2) | **Instructor-driven: auto-advance, strict gating, instrument grading** | `start_follow`; `ui/app.js` `renderFollow` renders the snapshot `follow` block |
| Save state (file download) | Built | M5 `save_state` / `load_state` |
| **Rewind** (in-memory checkpoint ring) | **Built** (full + world scopes, cap 32) | M5 `rewind`; ⏪ button in the Instructor card |
| Command gating | **Built** (`block_actions` + `allow_actions`, follow strict gating) | `instructor_layer.js`; blocked shape `{type:'blocked'}` |
| Flagship accident scenarios (authored beats) | **TMI built + validated (both branches)**; Chernobyl/Fukushima pending | `scenarios/pwr_tmi.js`, `test/run_scenarios.js` |
| **The Hook** (first-run onboarding, prompted) | **Built** | `scenarios/pwr_hook.js`; `#hookPrompt`; `rd_progress` |
| **Training tab** (scenario picker + walkthroughs) | **Built** | `ui/app.js` `buildTraining`; `?scenario=` deep link |
| **Highlights + F8 auto-reveal** | **Built** (RBMK/BWR view switch; PWR synoptic reveal) | `renderHighlight`; `RD.PwrSynoptic.revealControl` |
| Engine flagship validation | Built | PWR/RBMK/BWR engine scenario suites |
| Narrative accident walkthroughs (manual) | Built | `manual_procedures.js` (`narrative: true`) |

**Build status (2026-07-06):** priorities §8 steps 1–6 shipped and gated. Remaining: step 7
(Chernobyl + Fukushima flagships, Campaign progression wrapper) and step 8 (Qualification hint
ladder + quiet-board layout). Implementation decisions live in `BUILD_DECISIONS.md` → "M6".

**Rule:** Extend what exists. Do not create a parallel checklist or procedure system.

---

### 3. The Four Paths — Unified Gameplay Modes

All four paths share the same underlying snapshot, command system, and physics engines. They differ in **Instructor behavior**, **UI policy**, **progression rules**, and **failure tolerance**.

| Path | Name | Instructor Role | UI Policy | Progression | Failure Tolerance | Primary Use |
|------|------|-----------------|-----------|-------------|-------------------|-------------|
| **Path 1** | Sandbox | Toggleable observer (commentary optional) | User choice: register + layout | None (free play) | Full (Rewind when available) | Exploration & familiarization |
| **Path 2** | Walkthroughs | Active guide | Learning register; highlights on | Strict sequential steps | Low (gating + wrong-action commentary) | Procedural mastery |
| **Path 3** | Campaign | Narrator + time lord | Dynamic per beat | Narrative acts + micro-scenarios | High (Rewind is core) | Story-driven deep learning |
| **Path 4** | Qualification | Passive evaluator | Quiet Board layout; minimal commentary | Goal-oriented challenges | Medium (progressive hints) | Assessment & retention |

**Hard Rule for M6:** The Instructor Layer **never** bypasses HR1–HR5. It may gate commands, inject failures, or manipulate time, but it always respects the layer stack and the instrument-vs-truth distinction.

#### 3.1 Path ↔ M6 scenario mode ↔ UI mapping

Paths are **player-facing envelopes**. M6 scenarios use three **authoring modes** (`M6_instructor.md` §9). One path may load scenarios in different modes over time.

| Path | Typical M6 `mode` | Scenario source | UI entry |
|------|-------------------|-----------------|----------|
| Path 1 Sandbox | *(no scenario — M6·PH behavior)* | — | Default load |
| Path 2 Walkthroughs | `guided` | `RD.MANUAL_PROCEDURES[id]` | Manual → **Follow in Instructor** |
| Path 3 Campaign | `demonstration` → `guided` → `free_response` at decision points | `scenarios/*.js` flagships + micro-scenario chains | Training tab / scenario picker |
| Path 4 Qualification | `free_response` | Scenario or procedure with goal + hint policy | Training tab |

**UI policy fields** (to extend snapshot `instructor` block — see §5):

```javascript
ui_policy: {
  register: "learning" | "industry",      // commentary + board labels
  layout: "default" | "quiet_board",      // existing #uiVariant
  diagnostics_allowed: boolean,           // true-state overlay
  failures_tab_allowed: boolean,
  hint_level: 0 | 1 | 2 | 3               // Path 4 only; 0 = off
}
```

**Terminology note:** "Learning Mode" in early drafts means the **Learning register** (plain labels + commentary), not a separate app mode. "Quiet Board" is the existing `variant-quiet` layout — acronym-heavy, minimal chrome.

> ***(As built)*** the `ui_policy` fields actually shipped and consumed are **different from the
> set above**. The TMI-2 scenarios carry:
>
> ```javascript
> ui_policy: {
>   synoptic: "realistic" | "learning",   // drives the synoptic mode (quiet board vs full-color)
>   overlay: boolean,                     // physics overlay (honored only with synoptic:"learning")
>   tag: "afw_tag"                        // scenario prop: the maintenance tag over the AFW valve
> }
> ```
>
> consumed by `applyUiPolicy()` in `ui/app.js` (`ip.synoptic` / `ip.overlay` / `ip.tag`,
> app.js ~641): the player's own Settings are saved on scenario entry and restored on unload,
> and the tag prop hides once its interaction is granted. The original set above
> (`register` / `layout` / `diagnostics_allowed` / `failures_tab_allowed` / `hint_level`)
> remains the design intent for Path 4 hinting and layout policy but is **not yet consumed**.

---

### 4. Content Architecture (one artifact, two containers)

#### 4.1 Procedures = walkthrough steps (not a separate checklist engine)

Per CONTEXT §12 and `OPERATOR_MANUAL_PLAN.md`, **`RD.MANUAL_PROCEDURES` is the single source of truth** for step-followable training. Each step carries `text`, `control`, `target`, and machine-checkable `acc` / `saw` / `guard` predicates. The harness and Instructor consume the **same** predicates.

**Path 2 does not need a new checklist engine.** It needs M6 to:

1. `load()` a procedure from `MANUAL_PROCEDURES` (or reference it by `id`).
2. Gate commands to the current step's allowed actions.
3. **Auto-advance** when `acc` / `saw` is met (today the user clicks Next manually in `renderFollow`).
4. Emit wrong-action commentary without breaking HR5.

v1 walkthrough scope: the **21 shipped `[sim]` procedures** (startup, power, control, shutdown, emergency per plant). Do not author parallel "6 Standard Operations checklists."

#### 4.2 Flagship scenarios = authored beats (accidents + campaign)

Full accident experiences and campaign narrative use **`scenarios/<id>.js`** modules per `M6_instructor.md` §2–§4. Manual accident pages (`category: 'accident'`, `narrative: true`) are **entry points** that call `instructor.load(scenario)` — not a second script.

**Avoid three divergent accident pipelines.** Content flows:

```
Engine flagship suites  →  physics truth (validation)
scenarios/*.js beats    →  M6 drives commentary, injection, branching
manual accident page    →  short setup prose + "Start scenario" button
```

#### 4.3 Scenario file format (match M6 spec + repo conventions)

Use the beat structure in `M6_instructor.md` §4. Attach via IIFE (no bundler):

```javascript
// scenarios/pwr_tmi.js
;(function (RD) {
  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_tmi = {
    id: "pwr_tmi",
    title: "Three Mile Island",
    plant_id: "pwr",
    design_version: null,
    initial_state: "hot_full_power",
    mode: "demonstration",   // "demonstration" | "guided" | "free_response"
    description: "The 1979 partial meltdown — a failure of information.",
    beats: [ /* per M6_instructor.md §4 — triggers, commentary, inject_failures, gate, branches */ ],
  };
})(globalThis.RD || (globalThis.RD = {}));
```

**Trigger vocabulary:** use M6's set only (`time`, `delay`, `instrument`, `true_state`, `operator_action`, `inaction`, `alarm`, `scram`, `manual`, `all`, `any`). Map legacy names: `immediate` → first beat `trigger: { type: "time", value: 0 }`; `variable_threshold` → `instrument`; `command_received` → `operator_action`. **No `custom_function`** — breaks determinism.

---

### 5. Snapshot & M8 Extensions

**Today (CONTEXT §6.2):**

```javascript
"instructor": {
  "message": string | null,
  "message_register": "learning" | "industry" | null
}
```

**v1 M6 extensions** (add to CONTEXT + M8 when implementing Path 2+):

```javascript
"instructor": {
  "message": string | null,
  "message_register": "learning" | "industry" | null,
  "ui_policy": { /* §3.1 */ },
  "highlight": {                    // null when none
    "view": "primary" | "secondary",
    "control_label": string,        // Plant Display .cg-l label
    "instrument_id": string | null  // gauge strip / diagram element
  },
  "follow": {                       // Path 2 active procedure
    "procedure_id": string,
    "step_index": number,
    "step_total": number,
    "acc_met": boolean
  } | null,
  "level_complete": {               // micro-scenario / scenario end
    "title": string,
    "outcome": string,
    "actions": ["continue", "retry", "rewind"]  // UI button set
  } | null
}
```

M8 must resolve **Flag F8** (tabbed Plant Display controls) before `highlight.control_label` is reliable: auto-switch to the correct view tab when a highlight is active.

---

### 6. Acceptance & Grading Policy

| Consumer | Reads | Purpose |
|----------|-------|---------|
| `test/run_procedures.js` | `true_state` | Engine validation; proves procedure is achievable |
| Instructor **operator grading** (Path 2, 4) | **`instruments`** (HR1) | What the trainee can actually see |
| Scenario **triggers** (M6) | `instruments` default; `true_state` only when author documents deliberate invisible hook | Beat firing |

**Fix required:** `renderFollow` today checks `st.acc` against `true_state`. M6 grading must use instrument readings (e.g. TMI: subcooling margin and alarms, not `core_inventory_pct` alone).

Exception: predicates on parameters with no instrument twin may use `true_state` only in the harness, with Instructor copy that tells the user what indication to watch instead.

---

### 7. Core Mechanics

#### 7.1 The Hook (In Medias Res Onboarding)

**First run only** (not every Sandbox session).

1. `localStorage` key `rd_hook_completed` — skip if set.
2. Skip if `?follow=`, `?scenario=`, or any scenario already loaded.
3. Load PWR `hot_full_power`.
4. Instructor (Learning): *"Something is about to go wrong. Press the big red Reactor Trip button — now."*
5. On `scram`: dramatic response; brief pause.
6. **Rewind** ~60–90 s (once §7.2 exists) → explain what the trip protects.
7. Offer path choice or first micro-scenario; set `rd_hook_completed`.

#### 7.2 Rewind (M5 + M6 — **must build before Campaign**)

File-based `save_state` / `load_state` is insufficient for gameplay. Spec:

**M5 rewind ring:**

```javascript
// New command (CONTEXT §6.7)
rewind { steps: 1 }    // restore previous in-memory checkpoint; default steps = 1

// M5 maintains:
checkpoints: [ saveState(), ... ]   // ring buffer, cap e.g. 32
// Each checkpoint = full M5 saveState(): engine + M4 + instructor progress
```

- M6 (or M5 on beat `save_checkpoint: true`) pushes a checkpoint at scenario beats and procedure step boundaries.
- `rewind` pops and `loadState()` — restores instrument lag buffers and PRNG (determinism).
- UI: **Rewind** button in Instructor card + optional strip-chart scrub animation.
- Distinct from **Save** (JSON download for persistence across sessions).

***(As built)*** the Instructor↔M5 coupling is a **consume-flag API, polled by the Simulation
Service right after each `step()`** — snapshots-up / commands-down holds; there are no upward
callbacks:

- `consumeCheckpointRequest()` — one-shot; every non-rewind beat fire (and follow-mode
  auto-advance) sets it, so Rewind lands on beat/step boundaries.
- `consumeRewindRequest()` — returns `{ steps, scope }` for beat-driven world-scope rewinds
  (the "watch that again" device: the world rolls back, the Instructor keeps its progress).
- `consumeSpeedRequest()` — beat-driven time acceleration (`speed` beat field).
- `rebaseTime(newSimTime)` — called by M5 after a world-scope rewind so time/delay triggers
  don't wait for time to re-elapse.

#### 7.3 Micro-Scenarios

2–5 minute experiences chained in Campaign. Each is either:

- A **procedure** from `MANUAL_PROCEDURES` run in `guided` mode, or
- A **short scenario** (1–4 beats) in `scenarios/`.

Success = beat `branches` / procedure `acc` met. **Level Complete** UI (§5 `level_complete`) shows outcome + Continue / Retry / Rewind.

#### 7.4 Progressive Hinting (Path 4)

Three levels, instrument-only nudges:

1. **Nudge** — highlight a gauge / alarm (no procedure name).
2. **Procedure hint** — name the system ("check subcooling margin").
3. **Hand-hold** — exact control label + auto tab-switch (requires §5 highlight + F8 fix).

Auto-escalate on timer or deviation from goal. Manual "hint" button always available in Qualification.

#### 7.5 Progression persistence (Campaign)

Browser `localStorage` schema:

```javascript
RD.PROGRESS = {
  hook_done: boolean,
  completed_scenarios: string[],   // scenario ids
  completed_procedures: string[],  // procedure ids (Path 2 / 4)
  unlocked_paths: [1, 2]           // expand as content ships
}
```

No server in v1.

---

### 8. Implementation Priorities (revised)

| Order | Deliverable | Unblocks |
|-------|-------------|----------|
| 1 | **M6 beat engine** per `M6_instructor.md` (triggers, commentary, gating, failure injection) | All paths |
| 2 | **Path 2: Follow → M6** — auto-advance on `acc`, optional per-step gating, instrument-based grading | Walkthroughs |
| 3 | **One flagship scenario** (PWR TMI) end-to-end in `scenarios/pwr_tmi.js` | Campaign template |
| 4 | **M5 rewind ring** + UI Rewind button | Constructive failure loop |
| 5 | **Snapshot extensions** (§5) + **F8 control-tab fix** + highlight rendering | Hints, walkthroughs |
| 6 | **The Hook** (§7.1, with opt-out) | Onboarding |
| 7 | Chernobyl + Fukushima flagships; Campaign progression wrapper | Path 3 |
| 8 | Qualification hint ladder + goal scenarios | Path 4 |

M6·PH stays until step 1 lands. Steps 1–4 constitute a shippable **M6 alpha**.

---

### 9. v1 Out of Scope

Do not block M6 alpha on these; document as `[narr]` or future physics:

- **Cold startup, heatup, RCP warmup, controlled cooldown** — no cold states in engines (`OPERATOR_MANUAL_PLAN.md` §4).
- **Turbine roll & generator synchronization** as step-followable procedures — not fully modeled.
- **Separate checklist / SOP content system** — use `MANUAL_PROCEDURES`.
- **Conversational / LLM Instructor** — scripted beats only (`M6_instructor.md`).
- **Server-side progression, accounts, leaderboards**.
- **Containment / hydrogen explosions** beyond fuel damage — voice in commentary, not simulated.
- **`custom_function` triggers** — use composed `all` / `any` instead.

Full procedure catalog in `OPERATOR_MANUAL_PLAN.md` (~15 normal + emergencies per plant) grows **after** M6 alpha, using the same schema and harness — not a parallel format.

---

### 10. Intellectual Honesty (`[tell user]`)

In relevant scenario beats, the Instructor **must** voice intentional simplifications (see `M6_instructor.md` §14 templates):

- Point kinetics understates localized excursions (especially Chernobyl).
- No sensor redundancy (single instrument failure has outsized effect).
- Level % is geometric fill, not calibrated narrow-range.
- No containment modeling (simulation ends at fuel damage).

Embed these in `commentary.learning` at the moment they matter — not as a separate lecture.

---

### 11. Acceptance Gates (regression)

Any M6 or Instructor-facing change must keep green:

| Gate | Command |
|------|---------|
| Procedures | `node test/run_procedures.js` → 21/21 |
| Control pills | `node test/run_manual_controls.js` |
| UI follow | `node test/verify_manual_follow.js` |
| Engine suites | PWR / RBMK / BWR scenario suites per CONTEXT §9 |
| M6·PH / M5 / M7 | existing layer tests |

Config or control changes that touch the manual: re-run `node tools/gen_manual_reference.js` per CONTEXT §12.

---

### 12. Success Criteria for M6

When M6 is complete:

- All four paths are playable end-to-end.
- The first-run hook works and feels dramatic (skippable thereafter).
- Rewind feels like a core, rewarding mechanic — not a file-picker undo.
- Players complete micro-scenarios in 2–5 minutes with **Level Complete** feedback.
- Walkthroughs use **one procedure artifact** — no duplicate checklist content.
- Historical scenarios reproduce information failures, design flaws, and support failures of TMI, Chernobyl, and Fukushima; comparison runs and Rewind teach the correct lessons.
- The experience feels like a puzzle game, not training software.

---

### 13. Related Documents

| Document | Role |
|----------|------|
| `Blueprint/CONTEXT.md` | Hard rules, contracts, §12 manual maintenance |
| `Blueprint/M6_instructor.md` | **M6 implementation spec** |
| `Blueprint/OPERATOR_MANUAL_PLAN.md` | Full procedure catalog & schema |
| `Blueprint/M8 UI HMI Spec Consolidated.md` | UI regions, registers, layout |
| `inbox/Manual_Playthrough_Findings.md` | Procedure ↔ UI alignment evidence |
| `Blueprint/BUILD_DECISIONS.md` | Flag F8 (tabbed controls), open items |

**This companion + `M6_instructor.md` + `CONTEXT.md`** is what a coding agent needs to implement the training and gameplay layer without rebuilding solved problems.