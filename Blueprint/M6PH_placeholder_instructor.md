# M6·PH — Placeholder Instructor Layer (temporary scaffold)

**Build this module from `CONTEXT.md` + this file alone.** No other module is required.
This is a small, deliberately temporary module: a **transparent pass-through** that occupies
the Instructor's slot in the stack so the command path is complete end-to-end and the system
can be wired, run, and tested **before the real Instructor (M6) is designed**. It implements
exactly the interface the real M6 will implement, so M6 later drops into the same slot with no
changes above (the Simulation Service, M5) or below (the Control & Failure Layer, M4).

`CONTEXT.md` defines the layer model, the command contract, and the snapshot shape. This file
adds nothing to the physics or the contract — it adds *plumbing*.

---

## 1. Why This Exists

The Instructor sits **in the command path** (HR5): plant commands descend through it on their
way to the Control & Failure Layer and the engine. The Test Runner (M7) and the UI (M8) both
sit **above** it. So until something occupies that slot, the stack cannot be wired and the
command path is broken — you cannot drive a command from the top to the engine, and you cannot
integration-test anything.

The real Instructor (M6) is design-pending. Rather than block M5 → M7 → M8 on it, this
placeholder fills the slot with transparent behavior: commands pass straight through, nothing
is gated, no scenario runs, no commentary is delivered. The result is **pure free-play** — the
plant behaves exactly as if no Instructor were present — which is precisely the condition the
Test Runner needs (it wants to validate wiring without scripted content interfering) and the
condition the UI runs in until real scenarios exist.

When M6 is ready it replaces this module's internals; nothing else changes.

---

## 2. The Build Target

Per `CONTEXT.md §7`, this module provides `layers/instructor_layer.js` as a pass-through
implementation. The real M6 later replaces the internals of this same file (same filename, same
interface). It holds a handle to the Control & Failure Layer below it (to forward commands) and
tracks the selected register.

---

## 3. The Interface (the contract M5 calls and M6 will implement)

The Simulation Service (M5 §3, §5) drives the Instructor slot through this surface. The
placeholder implements every method; the real M6 will implement the same signatures with full
behavior. Names are illustrative; the **capabilities and call sites** are the contract.

| Method | Called by | Placeholder behavior |
|--------|-----------|----------------------|
| `handleCommand(command)` | M5 (forwarding plant commands) | Forward **straight down** to `controlFailureLayer.handleCommand(command)` — no gating. Return whatever the layer below returns. |
| `step(snapshot, simTime)` | M5, each broadcast cycle | **No-op.** No beats to evaluate, no commentary, no failure injection. |
| `getMessage()` | M5 (snapshot assembly) | Return `{ message: null, message_register: this.register }` — the empty `instructor` block (`CONTEXT.md §6.2`). |
| `setRegister(value)` | M5 (dispatching `set_register`) | Track `this.register` (`"learning"` \| `"industry"`), default `"learning"`. |
| `load(scenario)` | M5 (when a scenario would start) | **No-op** (accept and ignore — the placeholder runs no scenarios). |
| `saveState()` / `loadState(state)` | M5 (save/restore) | Trivial — serialize/restore just `{ register }`. |

---

## 4. Behavior in Full

```javascript
class InstructorLayer {                 // placeholder; real M6 replaces internals
    constructor(controlFailureLayer) {
        this.below = controlFailureLayer;
        this.register = "learning";
    }
    handleCommand(command) {
        // Transparent: no gating, no interception. Pass straight to the layer below.
        return this.below.handleCommand(command);
    }
    step(snapshot, simTime) {
        // No beats, no commentary, no injection. Intentionally empty.
    }
    getMessage() {
        return { message: null, message_register: this.register };
    }
    setRegister(value) { this.register = value; }
    load(scenario)     { /* no-op: placeholder runs no scenarios */ }
    saveState()        { return { register: this.register }; }
    loadState(state)   { this.register = state?.register ?? "learning"; }
}
```

---

## 5. What It Must NOT Do

Keeping the placeholder *transparent* is the whole point — anything it adds would contaminate
the free-play behavior the Test Runner and UI depend on:

- **No gating.** Every command passes through unaltered. (Command **interception** still happens
  below, in the Control & Failure Layer, for active command-override failures — that is correct
  and not the Instructor's concern.)
- **No commentary.** `instructor.message` is always `null`. The UI's instructor panel stays
  hidden in free-play (M8).
- **No failure injection or scenario logic.** Failures injected during this phase come only
  from the user / Test Runner via `inject_failure`, never from the placeholder.
- **No reading of true state.** It does not inspect the snapshot to make decisions; it forwards
  commands and reports an empty message. (The real M6 *will* read the snapshot to evaluate beat
  triggers — on instruments, per HR1 — but that is M6's job.)

---

## 6. The Swap to the Real Instructor

Because M5 forwards plant commands to "the Instructor slot" without caring which implementation
is there (M5 §5), and because this placeholder matches the interface M6 will implement, the
real M6 replaces this file's internals with **no changes** to M5, M4, M7, or M8. The
integration the Test Runner validated against the placeholder (command flow, interception,
alarms, the protection boundary) remains valid; M6 only *adds* scripted behavior (gating,
commentary, scenario-driven failure injection) on top of a stack already proven correct.
