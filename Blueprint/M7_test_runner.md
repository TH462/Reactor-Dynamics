# M7 — Test Runner Layer

**Build this module from `CONTEXT.md` + this file alone.** No other module is required.
This is the **acceptance gate for the assembled system** — a synthetic operator that drives the
entire stack (from the command entry point down through the Instructor slot, the Control &
Failure Layer, the instrument model, and the snapshot assembly) and asserts that the layers are
wired together correctly. It is **dev-only**: present in development builds, absent from shipped
builds (where the UI connects directly to the Instructor).

`CONTEXT.md` defines the two-gate correctness model (§9), the snapshot/command contract (§6),
the field vocabulary, and the hard rules. **Do not re-derive those; rely on them.** This file
specifies what the Test Runner checks and how it runs.

---

## 1. The Build Target

Per `CONTEXT.md §7`, this module produces `layers/test_runner.js` — the `TestRunner`. It is
activated on request (from a dev-only UI panel, M8 §11) and runs entirely in-browser. It drives
the simulation **through the same command interface the UI uses and reads the same snapshots**
(via the Simulation Service, M5 §10), so it exercises exactly what the UI would. It needs no
special access to simulation internals beyond what the snapshot exposes — which is itself a
useful confirmation that the snapshot exposes what consumers need. It is excluded from
production builds.

---

## 2. The Division of Responsibility

This is the principle governing the whole test system (`CONTEXT.md §9`):

- **Engine scenario tests** (each engine's own suite, M1 §14 / M2 §19 / M3 §18) own **physics**
  correctness. They call the engine directly, bypassing every layer. When they pass, the
  feedbacks, the accidents, the shutdown dynamics, and the physics-level failure mechanisms are
  correct.
- **The Test Runner** owns **integration** correctness — that the assembled layers are wired
  right: the snapshot is correctly shaped, instruments differ from truth in the right ways,
  trips and alarms read instruments not truth, commands route and intercept correctly, the
  alarm lifecycle works, and each plant's config is internally consistent.

These are different questions; both must be answered. **The accident sequences are NOT re-run
through the Test Runner** — if the engine tests pass and the wiring is confirmed correct, the
accidents work. Re-running physics through a layer that adds no physics is testing the same
thing twice. The two systems are designed to be **non-overlapping**: one owns physics, the
other owns wiring.

The Test Runner runs against the assembled stack with the placeholder Instructor (M6·PH) in the
slot — the wiring it validates does not depend on scripted content.

---

## 3. What the Test Runner Validates

### 3.1 The data contract
The snapshot is complete and correctly shaped: every section present every cycle (metadata,
true_state, instruments, control_state, rps_state, alarms, active_failures, automation,
instructor — HR4; *(as built — resolved)* the suite asserts the `automation` section
(`{channels: [...]}`) and `rps_state.trip_blocks` too, closing the gap noted after the
control-layer rework),
and for the active plant, every expected instrument, alarm, and control element accounted for
and correctly typed (against the field vocabulary in `CONTEXT.md §6.3`/§6.5 and the plant's
instrument set in its engine module). This catches assembly errors that would otherwise surface
as missing or malformed data in the UI.

### 3.2 The instrument-versus-truth separation
Instrument readings genuinely differ from true state in the right ways: a reading **lags** its
true value (after a step change in the truth, the instrument approaches over its lag constant,
not instantly), **noise** is present (the reading jitters around the lagged truth), and a
**stuck** instrument **holds** while the truth moves. This confirms HR1's defining separation is
actually realized in the assembled system, not merely intended.

### 3.3 The protection boundary — the most important checks
Two complementary assertions that, together, validate HR1 on the assembled system. They are the
**highest-value** checks in this layer, because HR1 is the rule most easily broken by a subtle
wiring mistake and the one whose violation most damages the simulator's purpose — the accident
scenarios become meaningless if trips and alarms read true state instead of instruments.

```
(a) Stick an instrument ABOVE a trip setpoint while the TRUE value stays safe.
        → the reactor MUST trip.            (because the trip reads the instrument)

(b) Drive the TRUE value ABOVE the trip setpoint while the instrument reads SAFE.
        → the reactor must NOT trip.        (because the trip does NOT read the truth)
```

Realize them through the same command interface the UI uses:
- For (a): `set_instrument_failure { instrument_id, mode:"stuck", value: <past setpoint> }` while
  keeping the true value safe; step; assert `rps_state.scrammed === true` with the expected
  `last_trip_reason`.
- For (b): stick the instrument at a safe value, then drive the true value past the setpoint
  (via commands or a physics-parameter failure); step; assert `rps_state.scrammed === false`.

A code path that *looks* like it reads instruments could quietly read true state without anyone
noticing until these specific checks run — which is exactly why they exist.

### 3.4 Command flow and interception
A command sent from the top reaches the engine and has effect, and a command-override failure
intercepts correctly end to end:
- Send a plant command from the top (through M5 → Instructor slot → Control & Failure → engine);
  assert it took effect (e.g. `rod_nudge` moved the group — check `control_state`).
- Inject a command-override failure (`stuck_porv_open`), send `close_porv`; assert the valve
  stays open (`true_state.porv_open === true`). This confirms the command path and the
  interception work end to end (including that automatic reclose commands are intercepted the
  same way — the TMI mechanism).

### 3.5 Alarm behavior
Driving an instrument reading across an alarm threshold produces the alarm in the snapshot with
the **right priority and labels (read from configuration, not hardcoded)**, and acknowledging it
transitions its state correctly:
- Drive an instrument past an alarm setpoint; assert the matching alarm appears in
  `snapshot.alarms` as `active_unacknowledged`, with the configured `priority`, `panel`, and
  register-appropriate `tile_label`.
- `acknowledge_alarm`; assert it transitions to `active_acknowledged`.
- Clear the condition; assert it returns to `clear`.
This confirms the alarm pipeline from condition → evaluation → the snapshot the UI reads.

### 3.6 Configuration consistency (no simulation run)
For each plant's config, confirm internal coherence by reading the config — no stepping needed.
These catch authoring mistakes before they manifest as confusing behavior:
- Every instrument referenced by an alarm, trip, or actuation **exists** in the plant's
  instrument set.
- Every numeric setpoint lies **within** its instrument's range.
- For a shared parameter, the **trip setpoint is more extreme than the matching alarm setpoint**
  (the alarm warns before the trip fires).
- `lo_lo` thresholds are more extreme than their `lo` siblings.
- *(as built)* Every trip/actuation **condition gate resolves to a status instrument**
  (directly, or via the `*_unavailable` → `*_running` derivation) — the kernel evaluates
  conditions from instruments ONLY, with no true-state fallback (M4 §2), so an unresolvable
  condition would never arm.

*(A gauge caution/danger-zone vs alarm-setpoint alignment check was originally listed here; it
is not implemented — the built suite covers the five checks above. Reading the config for §3.6
is the one sanctioned reach past the snapshot; see §6.)*

---

## 4. What the Test Runner Does NOT Validate

It does not re-run the accident sequences end to end. It does not re-test steady operation or
scram dynamics. It does not check whether the physics converges or the feedbacks have the right
magnitude. All of that is the engine scenario tests' job and has already been answered by the
time the Test Runner runs. If someone asks "does the Chernobyl scenario work?", the answer comes
from the RBMK engine suite (M2 §19), not from here; the Test Runner's answer is only "the wiring
is correct, so if the engine tests say the physics is right, the scenario will work."

---

## 5. How It Reports

Each check produces a structured result: **what was tested, pass/fail, and on failure what was
expected versus observed and what to fix** — pointing clearly at the cause (a configuration
inconsistency, a wiring error, an instrument-versus-true-state violation). Results **stream** as
the run proceeds and collect into a **summary**. Streaming is delivered via a callback the UI
test panel appends to (`CONTEXT.md §6.8` shape: `testRunner.runSuite(name, result => ...)`).

```javascript
result = {
    suite: string, check: string, passed: bool,
    expected?: any, observed?: any, fix_hint?: string,
};
```

---

## 6. How It Is Driven

Activated on request (in the build, `test/run_m7.js` is the Node driver; there is no in-browser
Test Panel — see the M8 notes). It drives the simulation through the **same command interface
the UI uses** (the Simulation Service's command entry, M5 §10) and reads the **same snapshots**
the UI receives. It does not reach into engine internals for behavioral assertions — every
behavioral check is made against the snapshot and the command interface, which is what makes it
a true full-stack test (and confirms the snapshot exposes everything a consumer needs). The one
sanctioned exception is §3.6: the config-consistency suite reads the plant's protection config
and instrument config directly (`service.layer.config`, `service.engine.cfg.instruments`),
since those checks are about the *data*, not the wiring. For checks that require a known
starting condition, it issues `reset { plant_id, initial_state }` first, then drives the
specific sequence.

### The wider test ecosystem (context, not part of this module)

`layers/test_runner.js` is one gate among many. The `test/` directory holds the Node CLI
harnesses that actually gate the build: the engine suites (`run_pwr` / `run_rbmk` / `run_bwr`),
the layer suites (`run_m4` / `run_m5` / `run_m6` / `run_m6ph` / `run_m7` — the last drives this
module), and the system suites (`run_ops` + `ops_*` operational probes, `run_autoctl` automation
channels, `run_campaign`, `run_scenarios`, `run_e2e_controls`, `run_procedures`,
`verify_e2e_ui` / `verify_manual_follow` headless-browser harnesses, `run_manual_controls`).
Those suites own physics, content, and UI verification; this module still owns only the
integration wiring described above.

---

## 7. The Two Gates Together

An engine passing its scenario tests while the assembled system has an integration wiring bug is
a real possibility — the tests operate at different layers and catch different things. Both must
pass:

- **Engine scenario tests pass** → the physics is correct.
- **Test Runner passes** → the system is correctly wired.
- **Both pass** → the simulator is correct.

Build the engines and run their suites (M1–M3). Once the physics is right, assemble the system
(M4, M5, the placeholder M6·PH) and run the Test Runner. That sequence, with both gates green,
is the complete acceptance path.
