# Reactor⚛️Dynamics — Build Context

> **For humans:** vision, rationale, deliberate exclusions, simplifications catalog, and the v2 roadmap live in `DESIGN_COMPANION.md` — not here and not in the module files.

**This file is loaded into every build session.** To build any single module, read
**this file plus that one module's spec** (`modules/MX_*.md`) — and nothing else. This
file carries the shared interfaces, the non-negotiable rules, the data contract, the
scope boundaries, and the build map. Each module file carries the full implementation
spec for one buildable unit.

This document defines **what** the system is and **why** the load-bearing decisions are
what they are. It does **not** prescribe internal class structure, method signatures, or
file organization within a module — those are yours, subject to the hard rules and the
contract below. Where something is marked a **hard rule**, it is non-negotiable: break it
and an essential capability of the simulator is lost.

---

## 1. The Product, in Brief

Reactor⚛️Dynamics is an educational browser-based nuclear power plant simulator. It models
three reactor types — a **PWR** (Pressurized Water Reactor), an **RBMK** (Chernobyl-type),
and a **BWR** (Boiling Water Reactor) — accurately enough to teach real plant behavior and
to reproduce the conditions behind the three most famous nuclear accidents (Three Mile
Island, Chernobyl, Fukushima). It runs entirely in the browser as vanilla JavaScript — no
server, no downloads, no WebAssembly, no installation — so it works in restricted
institutional environments. A layered architecture separates pure physics from control
logic, scripted instructional content, and the UI.

**The single defining design principle:** operators interact with **instrument readings**
that can lag, drift, and fail — never with the true physical state. This gap between what
is true and what is indicated is what makes the accident scenarios meaningful (at Three
Mile Island a valve indicator read "closed" while the valve was stuck open). It is realized
by **Hard Rule 1** and the snapshot contract, and it drives much of the architecture.

**The audience is learners** — from curious beginners to knowledgeable enthusiasts. Every
piece of instructional content and every label exists in two registers: a **Learning**
register (plain language) and an **Industry** register (real plant terminology), switchable
at will.

### What it must feel like (for design judgment)

- **Operating a plant feels like gaining real competence** — the plant has its own physics
  and pushes back; nothing is gamified into button-pushing.
- **The couplings between components are the lesson** — power follows load, Tavg is what the
  rod controller trades against, level is not inventory, the SG is the only heat sink. The
  player should leave able to say *what moved and why*. See `DESIGN_CRITERIA.md` §6.
- **Being misled by an instrument must not be softened** — no hint, no subtle warning, no
  visual tell that distinguishes a stuck indicator from a normal one. This is a **modelling
  requirement (HR1), not the product's premise**: instrument deception is a Tier C payoff of
  the dynamics curriculum, not a headline objective *(OWNER, 2026-08-02: "I don't want to
  focus on instruments lying. It will come up in failure scenarios but I dont know if it
  should be a major focus.")*. You cannot perceive a lying instrument without already knowing
  what the plant should be doing — so the couplings come first and this follows from them.
- **The comparison runs are the emotional center** — the same Chernobyl conditions on the
  pre- vs post-1986 RBMK, the same Fukushima blackout with vs without intervention, the
  same hands on the same controls producing opposite outcomes.
- **Simplifications are honest** — where a lumped model understates reality, the Instructor
  says so plainly. The goal is correct understanding, not false precision.

---

## 2. Architecture: The Layer Model

A stack of layers. Each layer talks only to the layer directly below it. **Snapshots flow
up; commands flow down.**

```
┌──────────────────────────────────────────────┐
│  User Interface (M8)                          │  diagram, gauges, alarms, controls
└───────────────────┬──────────────────────────┘
                    │  commands ↓     snapshots ↑
┌───────────────────┴──────────────────────────┐
│  Test Runner Layer (M7)   (dev/test only)     │  synthetic operator, full-stack tests
└───────────────────┬──────────────────────────┘
┌───────────────────┴──────────────────────────┐
│  Instructor Layer (M6)                        │  scenario engine, commentary, gating
└───────────────────┬──────────────────────────┘
┌───────────────────┴──────────────────────────┐
│  Control & Failure Layer (M4)                 │  trips, auto-actuation, alarms,
│                                               │  failure injection, command interception
└───────────────────┬──────────────────────────┘
┌───────────────────┴──────────────────────────┐
│  Physics Engines (M0–M3)                      │  kinetics, thermal-hydraulics,
│  shared foundations + PWR / RBMK / BWR        │  plant systems, instrument modeling
└──────────────────────────────────────────────┘
```

The **Simulation Service (M5)** is the orchestration that drives the step loop and
assembles the snapshot each cycle; it sits beneath the UI/Test Runner and runs the
engine + Control & Failure Layer. In a shipped build the Test Runner is absent and the UI
connects directly to the Instructor.

**Layer responsibilities:**

- **Physics Engine** — computes what physically happens given state + a time step. Models
  instruments (true state → lagged, noisy, fallible readings). Accepts direct controls.
  Makes no judgments about what *should* happen.
- **Control & Failure Layer** — the plant's automation and the scenario's failures.
  Evaluates protection trips, engineered-safety actuation, and alarms (all from
  instruments). Injects failures; intercepts commands when a failure dictates. Its rules
  are plant-specific **data**.
- **Instructor Layer** — scripted educational content. Runs scenarios (commentary, failure
  injections, optional action gating). Not a person, not a conversational AI; a content
  engine triggered by conditions in the running sim.
- **Test Runner Layer** — a synthetic operator (dev only) that drives commands down and
  reads snapshots back, asserting integration correctness.
- **User Interface** — renders the snapshot, translates user actions into commands. Shows
  instruments by default; true state only as an explicit diagnostic overlay.

---

## 3. The Hard Rules (non-negotiable)

**What belongs here.** A hard rule is a property this project may not trade away, and the
list is meant to stay short — **ten rules**. The test for admission is: *can this be violated
silently?* A convention you would notice breaking is a convention, not a hard rule.
Everything that failed that test lives elsewhere and is **advisory**: engine/layer
conventions in §11, v1 scope boundaries in §8, and how to *apply* these rules — the worked
cases, the failure modes, the procedure — in **`Blueprint/SOP.md`**.

**Every rule names its guard.** A rule with no gate holds only as long as the next author
happens to read the neighbouring comment. HR3 was stated *inside* the kernel, immediately
above the fix pattern for it, and was violated again forty lines below that comment (#156,
#227). Where a guard reads *none*, that is a known gap someone should close, not an
omission.

**The numbers are stable and retired numbers are never reused.** HR7 and HR8 were retired
2026-07-29 rather than renumbered: roughly 580 citations across the specs, manuals, tests
and tuning log point at these numbers, and `test/run_hr3.js` is named for one.

---

### Architecture — invariants the running system can violate

**HR1 — Protection and alarms read instruments, never true state.** Every automatic
decision a real plant makes from sensor data — every trip, every safety actuation, every
alarm — reads the **instrument reading**. Without it a stuck indicator cannot mask a real
condition, and TMI cannot be reproduced.

**HR1 governs the SEAM, not the ROSTER** *(OWNER RULING, 2026-08-03: "Apply the hr1
seam/roster sentence.")*. Which quantities have instruments, what their lag/noise/failure
characteristics are, and how many channels a trip votes are **plant design** — decided by
`DESIGN_CRITERIA.md`'s four questions, not by this rule. **A missing instrument is a design
gap to be filed, never an HR1 exception.** That distinction is written here because its
absence cost two years: the low-flow reactor trip read true pump flow while filed as *"the
one documented HR1 exception"*, and it was not an exception — it was an instrument nobody
had built (#247). The exception mechanism had absorbed a plant-design omission and made it
look settled. Where the control layer genuinely needs a quantity that has **no instrument
and should not have one**, that is a **declared exception**, not a licence.
**Guard:** `run_hardrules.js` — every true-state read in `layers/control/` must be listed
with a reason, in one of two categories. An **exception** is settled (snapshot plumbing,
command read-back). **Debt** is a real violation that is tracked and carries an issue
number. **A green run means "no undeclared reads", not "HR1 is satisfied"** — read the debt
line. The two categories exist because the first cut had one list and the debt was
indistinguishable from the exceptions, which is how a rule gets quietly retired by its own
guard. The split earned itself in four days: of the 5 debts it declared on 2026-07-29, the
**4 PWR ones were paid the same week (#247)** — the low-flow reactor trip now reads an
`rcs_flow` elbow-tap channel instead of true pump flow, and the feed channel's stand-down
reads MFIV position instead of a true-state field that never existed. **1 remains**, in
`rbmk_control.js`, unreviewed because that plant is on hold.

**HR2 — The physics engine makes no control decisions.** The engine computes physics and
exposes direct controls (insert rods, open this valve). The layer above decides when to use
them. No `if pressure high then open valve` inside the engine.
**Guard:** none — reviewed by hand. The nearest proxy is HR1's exception list growing.

**HR3 — Plant-specific behaviour is data, not hardcoded logic.** Trip setpoints, alarm
thresholds, gauge ranges, safety logic, instrument characteristics: configuration consumed
by general code. The code that evaluates a trip does not contain `2385`.
**Guard:** `run_hr3.js` — derives the plant vocabulary from all three engines and fails on
any plant-specific name in the shared kernel that is not declared with a reason.

**HR4 — Every snapshot carries both true state and instrument readings**, as distinct
sections, every cycle. The UI reads instruments; diagnostic overlays and the Test Runner
read truth. Never collapsed into one.
**Guard:** `run_contract.js` — partial. It gates that the §6.3 `true_state` block and
`getTrueState()` agree in both directions; nothing yet asserts both sections are present in
an assembled snapshot.

**HR5 — Commands flow down through the layers; the UI never reaches the engine directly.**
A command enters at the top and descends: Instructor (may gate) → Control & Failure (may
intercept) → engine. Gating and failure-interception depend on that path existing.
**Guard:** `run_hardrules.js` — no direct engine command call from `ui/`.

**HR6 — Instrument behaviour is computed inside the engine's time step**, using the same
time delta as the physics. Lag is a *simulated-time* constant: a 4-second sensor delay is
4 seconds of sim time at any acceleration. Applied outside the step, lag would distort
exactly when transients are being studied.
**Guard:** none. A behavioural probe (same transient at 1× and 10×, compare lag) would
close this.

---

### Practice — how the work is done

**HR9 — The plant is the ground truth. Content follows the plant, never the reverse.**
*(owner ruling, 2026-07-26.)* The only question that decides a tuning or behaviour change is
**"what should this plant actually do?"** — never "what keeps this mission green?"

Authority runs one way, highest first:

1. **Physics and prototypicality** — what a real plant of this type does. Err toward the
   real plant; a departure needs a reason beyond "it plays better".
2. **This plant's ruled-on identity** — named departures from prototypicality, legitimate
   only if explicitly ruled on, recorded with the reason, and declared as a simplification
   where they understate reality. An identity claim that cannot point at its ruling is an
   unexamined default, and prototypicality wins.
3. **The behaviour catalog and physics acceptance suites** (`run_behavior`, `run_pwr`,
   `run_ops`) — they *encode* 1 and 2, which is what earns them the right to arbitrate.
4. **Control and protection setpoints.**
5. **Authored content** — missions, procedures, checklists, manual prose.
6. **Gate expectations for that content** — `run_campaign`, `run_procedures*`, `run_checklist`.

**Nothing at 5–6 may cause a change at 1–4.** When authored content breaks after a plant
change, presume the content is stale. Broken content is **a canary, not an authority**:
read it, then settle it against 1–3 and say which behaviour you are treating as ground truth.
**Guard:** none possible — this is a judgement rule. `SOP.md` §1 carries the worked cases,
including the one where applying it wrongly nearly cost the plant a real protection function.

**HR10 — A passing test is not evidence the mechanism is right. Tests assert the claim,
never the current behaviour.** *(owner, 2026-07-27: "Tests should check to make sure the sim
does what it's INTENDED to do, not just check that it does what it already does.")*

A test written from observed behaviour can only confirm the behaviour it was written from,
including the parts that are wrong — it locks in the defect and reports coverage while doing
it. **If you cannot say why a mechanism is right without citing which tests pass, you have
not finished.** If you move a test, validate the new form against the OLD behaviour too:
passing on both makes it a better test; passing only on your change means you refitted it,
and you must say so.
**Guard:** none possible, and that is the point — a green gate reads as proof rather than as
a story someone wrote. `SOP.md` §2 has the three shapes this takes, each with a case from
this repo.

**HR11 — A ruling needs a DATE and the owner's VERBATIM WORDS, or it is advisory.**
*(owner, 2026-07-27: "Make the verbatim quote mandatory as you say".)* Extracted from HR9 on
2026-07-29 because it is cited constantly and was buried seventy lines inside a different
rule. All agent work is committed under the owner's name, so git blame proves nothing about
who decided what. Without a quote, an agent's own preference written in authoritative voice
("owner ruling:", "accepted — do not re-fix", "by design") becomes indistinguishable from the
owner's, and the next agent obeys it.

- Format: **`OWNER RULING (YYYY-MM-DD): "<their words>"`**. Anything else is *your*
  recommendation — label it as yours, including when the owner approved it: write *"Claude's
  reasoning, owner-approved 2026-07-27 ('Do as you suggest')"*, not "ruled".
- **An unattributed directive is advisory.** Weigh it on its merits, say you did, and do not
  propagate it as settled.

**Guard:** `run_hardrules.js` — every `OWNER RULING` in tracked markdown must carry a date
and a quotation.

**HR12 — An assertion about plant dynamics *or control behaviour* must be MEASURED. Run the
plant and quote the number.** *(OWNER RULING, 2026-07-29: "if you make assertions about plant
dynamics, you must back it up by testing them."; scope widened to control behaviour 2026-08-01
after #303/#304 — OWNER RULING, 2026-08-01: "go with your recommendation.", on the
recommendation to widen HR12 by one clause rather than add an eleventh rule.)*

If you write that flow coasts down in about ten seconds, that a trip fires before DNB, that a
transient is survivable, that a change "won't move anything" — **step the plant and read it**,
then put the measured value in the claim. Reasoning from the config, from a correlation, from
another agent's summary, or from what the code looks like it should do is **not** measurement.
This is the dynamics counterpart of HR9 (which sources *static* plant facts to real-plant
documents) and the mirror of HR10: HR10 says a passing test is not evidence the mechanism is
right; HR12 says an unmeasured assertion is not evidence of anything at all.

- **It applies to the claims you make while deciding, not just to what ships.** The reason for
  the rule is that a wrong intermediate claim silently steers the whole change — #247's
  strongest argument against a 90 % low-flow setpoint was that RCP cavitation would cause
  spurious trips during depressurizations. Measured: only the large LOCA reaches 90 %, and it
  has already scrammed three seconds earlier on low pressure. The objection was **wrong**, and
  nothing but running the plant would have said so.
- **Quote the number, not the verdict.** "Flow < 90 % at 1.8 s, DNB onset at 10.9 s" survives
  a later retuning by being checkable. "Trips well before DNB" does not.
- **A scratch probe is enough** to make a decision; a claim that outlives the session belongs
  in a gate. Say which one you did.
- **CONTROL BEHAVIOUR COUNTS, and this is the clause people skip.** "Selecting that mode does
  not close the breaker", "that bank is read-only", "Follow is the default lineup" — these are
  assertions about the plant, they are cheaper to check than any dynamics claim, and they were
  the whole of #303 and #304. Three shipped in two days, each contradicting `Manuals/03`, which
  had it right the whole time. The failure was **not** skipping a verification step; it was not
  classifying the claim as one that needed verifying, because the rule used to say *dynamics*
  and these felt like recall. They are not recall. **Drive the command and read the state**, or
  read the wiring — `ui/diagram/board/pwr_board_wiring.js` is the authority on what a control
  does, and `Manuals/03` is the authority on how it is documented.
- **Guarded, partially:** `run_manual_controls.js` fails if any manual says a *named board
  control* is inoperable while the wiring gives it a press handler. That catches the "read-only"
  class only — a wrong claim about what a control **does** is still on you.

**Guard:** none possible — a rule about honesty in prose cannot be gated, same as HR10, and
saying so is better than implying a green run covers it. `run_pwr` / `run_behavior` /
`run_ops` are where measured dynamics get pinned once a claim is worth keeping.

---

### Retired

- **HR7 — failure taxonomy** (physics failures in the engine, command-level failures in the
  control layer). Retired 2026-07-29: a **placement convention**, not an invariant, and one
  already amended once by the 2026-07-16 relief-valve ruling. Moved to §11 Conventions.
- **HR8 — v1 plant parameters live in code, not external files.** Retired 2026-07-29: a
  **scope boundary**, not an invariant — it says what not to build. Moved to §8.

**This is a demotion in binding force, and it should be read as one.** `CLAUDE.md` rule 1
makes §3 binding and the rest of this document advisory, so moving these two out of §3 moves
them out of "non-negotiable" and into "weigh it and say you did". That is the intent — both
are things you would notice breaking, which is the admission test above — but "no plant
config file system" went from non-negotiable to advisory in one change, and nobody should
discover that by inference.

Both retain their numbers, and **16 citations in the module specs (M1–M4, M6,
DESIGN_COMPANION) still point at HR7/HR8** — those resolve here and are then redirected, so
nothing dangles; they were deliberately not rewritten, because touching sixteen spec lines to
avoid one hop is the worse trade. Neither rule is deleted. Both remain in force as the
convention and the scope decision they always were.

---

## 4. The Time Step and Determinism

**Each step, in order:** advance the physics, then update the instruments from the new true
state. Then the Simulation Service assembles the snapshot from the post-step state and sends
it up.

- **Physics timestep:** `dt = 0.02 s` (50 Hz). **Integration:** first-order Euler
  throughout (`x_new = x_old + (dx/dt)·dt`). Do not use higher-order methods. *(As-built
  refinement, Flag F6: still first-order everywhere, but the neutron-kinetics update deviates
  where explicit Euler was numerically insufficient — the BWR uses an implicit prompt-jump
  form (explicit Euler diverges at its Λ = 5e-5), and the RBMK applies an exponential
  prompt-growth fast-path when ρ > β. The PWR and all non-kinetics physics remain plain
  explicit Euler.)*
- **Time acceleration:** realized as **more fixed-dt steps per broadcast** on the PLAY tier
  (1×–60×), never a larger dt. *(As-built deviation, Flag F6: the original rule handed the engine
  `dt_effective = dt · time_acceleration`, but explicit Euler is only proven stable at 0.02 s —
  60× gave dt = 1.2 s and blew up. The engine still does **not** know or apply the acceleration
  factor itself; HR6 holds because every time constant is sim-time.)* **Two tiers since #625
  (2026-09-04):** the **WARP** tier (600× and up) steps the **same physics at 0.5 s** — a
  *declared* fidelity departure *(OWNER RULING, 2026-09-04: "Yes")* bounded by
  `test/run_warp_tier.js` (measured inside instrument noise over a sim hour in five regimes; a
  1.0 s step trips the quiet plant, which the gate proves). WARP is refused or dropped to 60×
  inside the step loop on a trip, a new failure, a first alarm on a quiet board, a power or
  pressure rate above the transient thresholds, a Courant limit the ring would have to
  sub-step past half its ceiling to meet, or a model hold. Authored beat speeds never warp.
  Both tiers and the per-broadcast wall budget (40 ms; the loop stops early and credits only
  the sim time it stepped) are opt-in via `configurePacing()` — headless runners keep the
  PLAY-only service.
- **Snapshot cadence:** normally every 100 ms (10 Hz); during an active transient every
  50 ms (20 Hz). "Active transient" = power moving faster than 2 %/s, or pressure faster than
  40 psi/s (0.276 MPa/s), measured over the sim span the tick stepped, or any alarm newly firing
  *(rates per SIM second since #625 — the wall-scaled form read a quiet plant at 600× as a
  standing transient)*.
  Cadence affects how much sim-time passes between snapshots, never the integrity of a
  snapshot. *(Originally specified 500 ms / 200 ms; the build renders faster for a smoother
  live UI — same data, higher frame rate.)*

**Determinism:** given the same starting state and command sequence, the simulation produces
the same result. The only permitted variation is instrument noise, from a **seedable** PRNG
whose state is part of the saved state. The physics contains no hidden randomness.

---

## 5. The Three Plants (conceptual)

- **PWR — Pressurized Water Reactor.** The stable, intuitive reactor; the user's starting
  point. High-pressure primary water (no boiling) carries heat to steam generators that
  boil a separate secondary loop. Negative feedbacks (Doppler, moderator temperature) make
  it self-regulating. **One control rod group + one shutdown group** (a deliberate
  simplification). Hosts **Three Mile Island** — an accident of *information* (a stuck-open
  PORV with an indicator reading closed).
- **RBMK — Chernobyl-type.** The unstable reactor. Graphite-moderated, water-cooled in
  individual pressure tubes. Water acts as a neutron **absorber**, so boiling (voids)
  *increases* reactivity — a **positive void coefficient**. Pre-1986 rods had graphite tips
  causing a **positive scram effect** (insertion briefly adds reactivity). The **ORM**
  (Operational Reactivity Margin) governs how vulnerable it is. Carries **pre-1986 and
  post-1986 versions in one engine** via a flag. Hosts **Chernobyl** — an accident of
  *design*; the comparison (pre destroyed, post safe) is the core lesson.
- **BWR — Boiling Water Reactor.** Stable like the PWR but boils water directly in the core
  and sends steam straight to the turbine (direct cycle). Water-moderated → **negative void
  coefficient**. Power is controlled substantially by **recirculation flow**. Its **passive,
  steam-driven safety systems** (run without AC power) are the heart of **Fukushima** — an
  accident of *sustained support*; the comparison (with vs without depressurize-and-inject)
  is the lesson.

The famous accidents are **scenarios, not separate plants**. The plant a user learns is the
plant the accident happens on.

---

## 6. THE DATA CONTRACT (snapshot up, commands down)

This is the stable interface between the simulator and everything above it. **These names
are used everywhere — snapshot assembly, UI, Test Runner, Instructor — and must be
consistent. Use exactly these names. Do not invent new ones.** Equations and per-plant
config are *not* here; they live in the engine modules. What is here is the shared
vocabulary.

### 6.1 Why both truth and indication

The system must always be able to compare what is true against what is indicated — the UI to
optionally reveal truth as a teaching overlay, the Test Runner to verify instruments
correctly reflect (or correctly fail to reflect) reality, the Instructor to build lessons on
the divergence. Both views are present in every snapshot (HR4). Collapsing them makes the
defining principle unobservable and untestable.

### 6.2 Snapshot shape (top level)

```javascript
snapshot = {
    "type": "state",
    "schema_version": "1.0",
    "metadata": {
        "sim_time":          number,   // seconds of simulated time
        "running":           bool,
        "time_acceleration": number,   // 1.0 = real time
        "wall_time":         string,   // ISO 8601 UTC
        "plant_id":          string,   // "pwr" | "rbmk" | "bwr"
        "design_version":    string,   // "pre_chernobyl" | "post_chernobyl" | null
    },
    "true_state":      { ... },        // plant-specific, §6.3 — TRUE physics (never the operator's primary reading)
    "instruments":     { ... },        // keyed by instrument_id — lagged, noisy, possibly-failed readings (what the UI shows, what trips/alarms read)
    "control_state":   { ... },        // §6.5 — commanded positions/settings
    "alarms":          [ ... ],        // list of alarm objects, §6.6
    "active_failures": [ ... ],        // currently injected failure ids
    "rps_state": {
        "scrammed":          bool,
        "last_trip_reason":  string | null,
        "trip_blocks":       { "<trip_id>": true },   // manually blocked startup trips (PWR: ir_high, pr_low_setpoint; P-10 gated, auto-reinstated below it)
    },
    "automation": {                        // the Control Layer's channel runtime (per-plant channels as data)
        "channels": [ {
            "id": string, "group": string, "label": string, "hint": string,
            "kind": "mode" | "pid" | "rods" | "bang",
            "engaged": bool,               // mode channels derive this from control_state (the plant's truth)
            "setpoint": number | null,     // SI-internal; UI converts for display
            "setpoint_meta": { "min", "max", "unit", "dp", "step", "dim" } | absent,
            "pv": number | null,           // the channel's process variable (an instrument reading)
            "note": string,                // controller status ("holding", "off — reactor scrammed", …)
            "standby": bool
        } ],
        "esf": { "<system_id>": "auto" | "manual" } | absent,   // ESF AUTO/MAN arms (PWR: hpi, afw)
    },
    "instructor": {
        "message":           string | null,
        "message_register":  string | null,   // "learning" | "industry"
        // M6 extensions — emitted whenever the real Instructor occupies the slot
        // (fixed shape: keys always present, null when inactive). The message-only
        // two-key block above is the minimal contract (M6·PH / fallback / mocks).
        "ui_policy":  { "register": string, "highlights": bool } | null,
        "highlight":  {                        // control/gauge the current beat or follow step points at
            "view": string | null,             // owning view hint (RBMK/BWR plant display)
            "control_label": string | null,    // the on-screen control-group label
            "instrument_id": string | null     // gauge-strip highlight
        } | null,
        "follow": {                            // Path 2: active procedure walkthrough
            "procedure_id": string, "step_index": int, "step_total": int,
            "acc_met": bool,                   // acceptance graded instrument-first (HR1)
            "graded_by": "instrument" | "true_state" | null,
            "done": bool
        } | null,
        "level_complete": {                    // scenario / walkthrough finished
            "title": string, "outcome": string,           // outcome in the selected register
            "actions": [ "continue" | "retry" | "rewind" ]
        } | null,
    },
}
```

The `instruments` section is keyed by `instrument_id` and includes **derived** readings
(e.g. `subcooling_margin`) computed from *other instrument readings* — never from true
state (HR1), so they inherit the lag and error of their inputs. **The canonical per-plant
instrument-id list lives with each engine module** (the ids referenced by that plant's
trips, alarms, and scenario triggers); the `true_state` fields below are the parallel
physical-quantity vocabulary.

### 6.3 true_state fields, per plant

**PWR:**
```javascript
"true_state": {
    "power_pct": number, "tavg_c": number, "thot_c": number, "tcold_c": number,
    "pressure_mpa": number, "pzr_level_pct": number, "sg_level_pct": number,
    "pzr_mass_frac": number,          // Pressurizer liquid INVENTORY NODE (#385) — the pressurizer's SHARE of
                                      //   the RCS mass ledger, same fraction units as core_inventory_pct/100
                                      //   (a share, never a second inventory: loop share = _mass − pzr_mass_frac,
                                      //   implicit). `pzr_level_pct` above is this node through the geometry map
                                      //   (`level_per_mass` %-per-frac; nominal 55 % ≈ 0.0709, vessel full at
                                      //   100/776 ≈ 0.1289); UNCLIPPED both ways (overfull/deficit bookkeeping).
                                      //   Carries pzrNodeLevel: the reconstructed base+mass backbone + the
                                      //   flow-accreted void credit — bitwise the pre-node line on no-leak
                                      //   families, flow-split under a leak (#385 stage 2).
    "sg_level_wide_pct": number,      // WIDE-range SG level — the whole vessel column (tube sheet → separators).
                                      //   DERIVED since #418 wave A2 from `sg_mass_frac` below through the
                                      //   sg_mass_map geometry. `sg_level_pct` above is the narrow (working) range
                                      //   derived from it as an sg_wr_lo..sg_wr_hi window; narrow PEGS on an
                                      //   overfill or a dryout, wide keeps reading. Feeds the UI water column.
    "sg_mass_frac": number,           // SG secondary MASS LEDGER (#418 wave A2) — fraction of the nominal
                                      //   secondary mass (1.0 = 12,785 kg, Ginna 85,359 lbm per-MWt-scaled). THE
                                      //   inventory state; both level ranges derive from it, and it integrates
                                      //   (feed − steam_out)/sg_mass_boil_tau_s on the sourced 77.5-s boil-dry clock.
    "t_sg_c": number,                 // SG TUBE-BUNDLE node temperature (#418 wave B1) — the thermal buffer in
                                      //   the series conductance pair between the coolant (Tavg) and the boiling
                                      //   secondary (Tsat(P_sec)). Invariance rule at the pwr_config constant:
                                      //   1/h1 + 1/h2 = 1/h_sg with shared flow×dry factors, so steady-state
                                      //   crossing heat is exactly the legacy h_sg law; the node adds DYNAMICS only.
    "steam_flow_normalized": number, "fw_flow_normalized": number, "mwe_output": number,
    "steam_out_total": number,        // TOTAL steam leaving the SG (turbine + dump + safeties) — the source behind
                                      //   the `sg_steam_flow` main-steam-line instrument, and the flow feed regulation
                                      //   must actually match. TRAP: `steam_flow_normalized` above is TURBINE flow
                                      //   ALONE, and reads ~0 whenever the steam dump is carrying the plant.
    "subcooling_c": number,           // derived from TRUE P and T (diagnostic; the operator's value is the instrument)
    "core_inventory_pct": number,     // primary coolant mass
    "p_coldleg": number, "p_hotleg": number, "p_pumpsuction": number,   // loop pressure distribution (MPa). Cold leg =
                                      //   pump discharge (highest; the ECCS/letdown datum), pump suction = between SG
                                      //   and RCP (lowest; the cavitation datum), hot leg = pressurizer reference.
                                      //   There are no per-node GAUGES — the one primary_pressure instrument reads pressure_mpa.
    "suction_subcool_c": number,      // subcooling margin at the pump-suction node (°C) — the cavitation driver
    "rcp_cavitation_frac": number,    // RCP cavitation severity, 0–1
    "rcp_cavitating": bool,           // the annunciated cavitation flag — TMI-2's "the pumps are objecting" noise
    "core_void_fraction": number,     // FLUX-driven boiling in the core (DNB at power); 0 in TMI/normal ops
    "primary_void_fraction": number,  // INVENTORY-driven void (loop voiding, TMI) — the FG-3 deception gate.
                                      //   Distinct from core_void_fraction: different cause, different lesson.
    "fuel_temp_c": number, "decay_heat_pct": number, "xenon_pct_eq": number, "boron_ppm": float,
    "core_heat_pct": number,          // TOTAL core heat, % of rated = fission + the decay tail (the engine's
                                      //   `_Q_total`, which is what every thermal path burns). TRAP: this is NOT
                                      //   power_pct. power_pct is FISSION ALONE; the two are equal in steady
                                      //   state by construction, but after a scram power_pct falls straight
                                      //   through the decay floor while the core still makes ~7 % of rated.
                                      //   Anything that reads power_pct as "core thermal power" is wrong from
                                      //   the moment the rods drop. There is no gauge for either.
    "clad_temp_c": number,            // PEAK exposed-clad temperature — the partial-uncovery damage driver (#213).
                                      //   Above fuel/coolant temps whenever the core is partly uncovered.
    "core_uncovered_frac": number,    // 0..1 — the fraction of the core the hot node treats as steam-cooled.
                                      //   Ramps from 0 at core_top_uncover (70 % inventory) to 1 at
                                      //   significant_uncover (50 %). The DRIVER behind clad_temp_c: it is what
                                      //   exposes the hot node at all, and it has no instrument of any kind.
                                      //   PWR2 (#517): a DECLARED HEM PROXY with no water level. Void 0.5->1.0
                                      //   carries 0 -> 0.9 of the range and core_superheat_c 0 -> 150 C the last
                                      //   0.1, because the void half SATURATED an hour before anything was
                                      //   damaged and reported one number for 1,220 s of a drying core.
    "zirc_heat_pct": number,          // Zr + 2H2O oxidation heat, % of RATED (#238). The second heat source, and
                                      //   the one that makes core damage ACCELERATE rather than decay with the
                                      //   decay tail. Exactly 0 on a covered core — the OXIDE state behind it is
                                      //   monotonic and does not un-grow, but the heat release stops.
    "t_core_exit_c": number,          // CORE-EXIT temperature (#407) — the NUREG-0737 II.F.2 inadequate-core-
                                      //   cooling datum. EQUALS tavg_c on a covered core by construction; tracks
                                      //   the steam-cooled clad hot node as the core uncovers. subcooling_c (and
                                      //   the subcooling_margin instrument) read max(bulk, this), so the margin
                                      //   goes negative over a dry core instead of reporting the ECCS-chilled
                                      //   remnant's comfort. The core_exit_temp channel is its instrument.
    "porv_open": bool,                // actual valve position
    "spray_stuck": bool,              // pressurizer spray valve mechanically stuck open — beats the auto
                                      //   controller AND any operator demand, the way porv_stuck beats
                                      //   porv_demand. Note spray_auto can read TRUE while this is true:
                                      //   the controller really is in auto, the valve just isn't listening.
    "spray_flow_pct": float,          // DELIVERED pressurizer spray, % of the spray line's maximum flow —
                                      //   the valve demand (control_state.spray_valve_pct) AFTER the RCP-flow
                                      //   and Psat(Thot) authority terms. Reads 0 with the pumps stopped and
                                      //   the valve wide open. Feeds instruments.pzr_spray_flow (#350 item 1).
    "block_valve_open": bool,         // PORV block (isolation) valve position — the memory-free isolation-grading
                                      //   hook for scenarios; shutting it is what stops a stuck-open PORV
    "porv_stuck": bool, "hpi_active": bool, "hpi_flow_normalized": float, "afw_active": bool,   // hpi_* = the ONE merged HPI/LPI emergency-injection system (two-segment pump curve; flow normalized to combined rated)
    "hpi_discharge_pressure_mpa": float,   // HPI/charging pump discharge head — RCS pressure + the pump margin,
                                      //   clamped to shutoff head; 0 when HPI is not injecting
    "pzr_heaters_shed": bool,         // PRESSURIZER HEATERS OFF THE BUS — the ESF load shed (#447). Latched on
                                      //   the RISING EDGE of a safety injection (hpi_active) or a loss of offsite
                                      //   power, and cleared ONLY by an operator `set_heater` — the AUTO/MANUAL/
                                      //   OFF buttons and the % box ARE the manual reload. SOURCED: NUREG-0737
                                      //   II.E.3.1 Clarification (7), "the pressurizer heaters must be
                                      //   automatically shed from the emergency power sources upon the occurrence
                                      //   of a safety injection actuation signal"; Ginna TS Bases B 3.4.9 adds the
                                      //   LOOP half and the manual reload onto the diesels.
                                      //   SECURING SI DOES NOT CLEAR IT — that is the whole point of a latch, and
                                      //   it is what makes a post-LOCA cooldown owe the operator a reload step.
                                      //   TRAP: this is one of FOUR reasons delivered heater power reads zero.
                                      //   The others are a blackout (ac_available), the 17 % low-level cutoff
                                      //   (_heater_cut), and the failed_pzr_heaters casualty — and only this one
                                      //   has an indication, so do not read a zero as "shed" without checking it.
    "afw_pump_running": bool,         // AFW PUMP demand (run lights, honest) — distinct from delivered flow afw_active; the TMI-2 pumps-running/valves-shut split
    "afw_blocked": bool,              // AFW block/discharge valve SHUT — pumps can run against it (the TMI-2 tag-out)
    "afw_discharge_pressure_mpa": float,   // AFW discharge head: SG pressure + margin while delivering, pinned at
                                      //   SHUTOFF when demanded into a blocked discharge, 0 when not demanded.
                                      //   Deadheaded-at-shutoff is the tell that separates afw_blocked from afw_active=false.
    "afw_flow_normalized": float,     // TRUE delivered AFW flow (capacity × throttle; 0 when blocked or unpowered).
                                      //   WHERE THE LEVEL HOLD LIVES DIFFERS BY ENGINE, and this line used to say
                                      //   "capacity × throttle × level hold" for both, which was FALSE of PWR2 for
                                      //   the whole time it was the plant the site runs (#562): PWR2 had neither
                                      //   term, so a loss of offsite power reached 861.7 % of nominal inventory in
                                      //   five hours. The retired engine holds level INSIDE the engine
                                      //   (pwr_steam_generator, target pwr_config afw_level_target). PWR2 holds it
                                      //   in the CONTROL LAYER, as the `afw_level` automation channel the operator
                                      //   can take to MANUAL — because throttling auxiliary feed is the operator's
                                      //   own post-trip task (WAT 05 Transients, ML11216A094). Either way the
                                      //   number here is DELIVERED FLOW; the valve position is control_state's
                                      //   afw_throttle_pct, and the two disagreeing is a diagnosis, not a bug.
    "condensate_flow_normalized": float,   // TRUE main-feed / condensate flow (main feed only — excludes AFW)
    "condensate_pump_running": bool,  // condensate pump state — operator-controlled, and it GATES main feed
    "porv_tailpipe_temp_c": number,   // PORV discharge/quench-tank line temperature — warm baseline (seat leakage), hot while relief flows; feeds instruments.porv_tailpipe_temp (the TMI-2 tell)
    "fuel_damaged": bool,             // latched when fuel exceeds fuel_damage_c — scenario outcome-grading hook
    "pump_running": bool, "pump_flow_pct": number, "station_blackout": bool,
    "natural_circulation": bool,      // buoyancy-driven flow with the RCPs stopped (#325). W = C·√ΔT closed against the
                                      //   core rise ⇒ W ∝ Q^⅓; gated to zero by loop voiding (a voided loop has no liquid
                                      //   column — the TMI-2 case). Diagnostic only: no board lamp, because a real crew
                                      //   verifies it from loop ΔT + subcooling + stable SG pressure, which the board has.
    "ac_available": bool,             // Class 1E (vital) ac switchgear energized (#332). Today exactly !station_blackout —
                                      //   a plain LOOP KEEPS it (the diesels pick the 1E buses up). Every ac load reads THIS,
                                      //   not the casualty flag: RCPs, pressurizer heaters, the CVCS charging pump (and with it
                                      //   letdown and borate/dilute), the ECCS injection pump. AFW is turbine-driven and the
                                      //   accumulators are passive N2, so both deliberately survive it. See pwr_engine step 0a.
    "turbine_rpm": float, "condenser_vacuum_kpa": number,
    "turbine_tripped": bool,          // turbine trip LATCHED. Arms the P-9 anticipatory scram and is what the
                                      //   board's lit states key on. A planned `disconnect_grid` is NOT a trip (#230).
    "cw_inlet_temp_c": number,        // circulating-water inlet temperature (set_condenser_cw_temp) — the
                                      //   condenser's heat-sink boundary condition, hence backpressure and MWe
    "scrammed": bool, "melted": bool, "steam_demand_mwe": float,
    "destruction_cause": string,      // "none" | "thermal_melt" — outcome-grading hook, sibling of fuel_damaged/melted
                                      //   (same field as the RBMK/BWR blocks below, minus the steam-explosion case)
    "load_mode": string,              // "follow" | "manual" | "disconnected" — the TURBINE load mode.
                                      //   NOT a plant MODE; see plant_mode below.
    "load_target_mwe": float,         // commanded electrical load
    "load_imbalance_mwe": float,      // indicated MWe − load_target_mwe (signed: + = generating above target)
    "sg_imbalance_active": bool,      // |load_imbalance_mwe| past the 4 %-of-rated annunciator threshold
    "steam_pressure_mpa": number,     // secondary/SG pressure (surfaced for the UI loop diagram)
    "condenser_cooling_available": bool,   // condenser heat-sink availability (also §8.8 status)
    "reactivity_pcm": float, "startup_rate_dpm": float, "reactor_period_s": float,  // reactivity proxies — reactivity computer / SUR / period; display/derived only, NEVER fed to trips (HR1). The PWR carries a startup_rate INSTRUMENT (lagged/noisy twin of the SUR proxy) that feeds the rod-withdrawal interlock — an M4 command block with its own annunciator, not a protection trip.
    "plant_mode": number,             // DERIVED commercial plant MODE 1–6, from power, reactivity and Tavg
    "plant_mode_name": string,        // its name ("At Power", "Hot Shutdown", "Cold Shutdown", …) — write as *Mode N, Name*
    "tavg_rate_c_per_hr": float,      // RCS heatup/cooldown rate (°C/hr), signed — the Mode 5↔1 transition
                                      //   indication. The engine computes it every step; no engine limit is
                                      //   enforced on it (the Tech-Spec-style rate limit lives in procedures).
    "sr_counts_cps": float, "ir_amps": float, "sr_energized": bool,   // nuclear instrumentation: Source Range counts (0 when de-energized; feeds the log instrument source_range + the 1e5 cps startup trip), Intermediate Range chamber current (feeds intermediate_range), SR switch state
    "msiv_open": bool, "sg_safety_open": bool,   // main steam isolation valve + SG code safeties (upstream of the MSIV)
    // Synoptic additions (governor / ECCS / CVCS true flows — feed the §8.8 instruments; additive):
    "governor_valve_pct": number,     // turbine admission valve position, 0–100 %
    "stop_valve_pct": number,         // trip stop (throttle) valves — spring-shut on a trip, 0–100 % (#373)
    "charging_flow_actual": float,    // TRUE CVCS charging (0 with pump off; AUTO-modulated) — feeds instruments.charging_flow, ≠ setpoint
    "letdown_flow_actual": float,     // TRUE CVCS letdown — feeds instruments.letdown_flow
    "leak_flow": float,               // primary break flow, normalized (LOCA/SGTR) — feeds instruments.primary_leak_flow
    "steam_dump_valve_pct": number,   // steam-dump/bypass valve position, 0–100 % — feeds instruments.steam_dump_valve
    "adv_valve_pct": number,          // atmospheric dump valve position, 0–100 % — feeds instruments.adv_valve (#371)
    "adv_flow_normalized": float,     // steam vented to ATMOSPHERE, normalized to rated. Independent of the
                                      //   condenser and upstream of the MSIV — the cooldown path when the
                                      //   condenser is gone. Ships in AUTO (2026-08-06, was SHUT);
                                      //   see DESIGN_COMPANION §8.34
    "accumulators_discharging": bool, "accumulator_flow_normalized": float, "accumulator_volume_pct": number,  // passive accumulators (finite volume)
    "accumulator_pressure_mpa": number,   // N2 cover-gas pressure (the board's SIT pressure readout). INDICATION
                                      //   ONLY: injection is gated on cold-leg pressure vs the FIXED
                                      //   accumulator_trip_mpa setpoint, not on this. Falls as the tank empties
                                      //   (isothermal gas expansion), which is why real injection tails off.
    "accumulator_valve_open": bool,   // discharge isolation valve position (shut = the tank cannot inject at all)
    "rhr_active": bool, "rhr_valve_open": bool, "eccs_mode": string,   // RHR (formerly DHR) aligned = hot-leg suction valve open; eccs_mode = the ECCS card word. The RETIRED engine says "HPI"|"LPI"|"RHR"|"off"; PWR2 says "standby"|"armed"|"hhsi"|"lhsi"|"both"|"rhr" — "armed" is safety injection ACTUATED with the pumps above their shutoff heads and therefore delivering nothing (#603), which is a different state from the quiet "standby" and was reported as it until then
    "containment_pressure_mpa": float, // containment building pressure, ABSOLUTE (#386 stage 1 — the board's psig
                                      //   is a display conversion). Air partial at ambient + steam partial from
                                      //   break/relief discharge; the break and relief √Δp laws read it LIVE as
                                      //   their backpressure. An SGTR discharges to the SG and moves it not at all
                                      //   — the one break that BYPASSES containment, the diagnosis lesson.
    "containment_temp_c": float,      // containment atmosphere temperature — saturation at the steam partial
                                      //   pressure, floored at ambient (~38 °C)
    "containment_sump_pct": float,    // integrated liquid on the containment floor, % of the sump reference.
                                      //   INDICATION ONLY: no recirculation (no RWST inventory exists to swap
                                      //   from — declared, Manuals/12 §13.0). The leak-diagnosis indication
                                      //   Manuals/06 §PWR-A12 and 07 already told the operator to check.
    "ctmt_spray_demand": bool,        // containment spray DEMANDED (#386 stage 2 — the 30 psig hi-hi actuation
                                      //   or a command; AUTO-ONLY build, no board control yet). Demand persists
                                      //   through a blackout (#200/#329 split).
    "ctmt_spray_active": bool,        // …and DELIVERING (demand AND the 1E bus alive) — what the sink term and
                                      //   the annunciator read
    "ctmt_fan_safety": bool,          // CRFC safety realign demanded (SI-driven; normal-mode fan cooling is
                                      //   folded into passive_sink_tau_s by declaration)
    "ctmt_fan_active": bool,          // …and delivering (AC-gated, as above)
    "ctmt_h2_pct": float,             // containment hydrogen concentration, v/o of free volume (#386 stage 3).
                                      //   Generated by the Baker-Just oxidation term (exactly proportional to
                                      //   zirc_heat_pct — same reaction event), transported from the RCS only
                                      //   while a containment-side path EXISTS (geometry-keyed), so an SGTR's
                                      //   hydrogen goes to the SG and this stays 0. The RCS-side ledger is
                                      //   private — no real board carries a truth channel for it.
    "ctmt_h2_burned": bool,           // the one-time burn latch *(OWNER RULING, 2026-08-05: selected
                                      //   "TMI-2-style burn" — spike + latched event, containment holds; a
                                      //   selection, not verbatim words)*. Set when TRUE concentration crosses
                                      //   ignition; NEVER clears. Stands in for O2 depletion — H2 may
                                      //   re-accumulate afterward with no second burn.
    "ctmt_recomb_demand": bool,       // recombiners demanded (auto-start actuation row or command; AUTO-ONLY
                                      //   build, no board control). Demand persists through a blackout.
    "ctmt_recomb_active": bool,       // …and delivering (AC-gated) — what the removal term and A42 read
}
```

**RBMK:**
```javascript
"true_state": {
    "power_pct": float, "fuel_temp_c": float, "void_fraction_avg": number,
    "steam_pressure_mpa": float, "drum_level_pct": float, "channel_flow_pct": number,
    "graphite_temp_avg_c": float, "decay_heat_pct": float, "xenon_pct_eq": float,
    "orm_equiv_rods": number, "orm_alarm_active": bool, "eps_bypassed": bool,
    "scrammed": bool, "melted": bool,
    "destruction_cause": string,      // "none" | "thermal_melt" | "steam_explosion"
    "steam_explosion_occurred": bool, "energy_deposition_rate": number,  // cal/g/s
    "design_version": string,         // "pre_chernobyl" | "post_chernobyl"
    "reactivity_pcm": float, "startup_rate_dpm": float, "reactor_period_s": float,  // reactivity proxies; display/derived only, never fed to trips (HR1). Like the PWR, a startup_rate INSTRUMENT twin feeds the rod-withdrawal interlock (an M4 command block, not a trip).
    // Balance of plant (turbine / condenser / generator — full-scope operation):
    "steam_to_turbine": float,        // operator turbine steam load, normalized (1.0 = rated)
    "mwe_output": float, "turbine_rpm": float, "condenser_vacuum_kpa": number, "turbine_tripped": bool,
}
```

**BWR:**
```javascript
"true_state": {
    "power_pct": float, "fuel_temp_c": float, "core_void_fraction": number,
    "vessel_pressure_mpa": float, "vessel_level_pct": number,
    "steam_flow_normalized": float, "fw_flow_normalized": float, "recirc_flow_pct": float,
    "decay_heat_pct": float, "xenon_pct_eq": float,
    "rcic_running": bool, "hpci_running": bool, "ads_open": bool, "lpci_running": bool,
    "lpcs_running": bool,              // low-pressure core spray (D4)
    "srv_manual_open": bool,           // operator manual SRV depressurization (D6)
    "slc_active": bool, "slc_tank_pct": number,   // Standby Liquid Control — boron ATWS mitigation (D1)
    "station_blackout": bool, "battery_charge_pct": number,
    "scrammed": bool, "melted": bool, "destruction_cause": string,
    "reactivity_pcm": float, "startup_rate_dpm": float, "reactor_period_s": float,  // reactivity proxies; display/derived only, never fed to protection (HR1)
    // Balance of plant (turbine / condenser / generator — full-scope operation):
    "mwe_output": float, "turbine_rpm": float, "condenser_vacuum_kpa": number, "turbine_tripped": bool,
}
```

### 6.5 control_state shape

```javascript
"control_state": {
    "rod_groups": [
        {
            "id": string,            // "control_rods", "shutdown_rods", ...
            "name": string, "function": string,   // "control" | "shutdown"
            "steps": int, "max_steps": int,        // per plant config (PWR 912 fine steps; RBMK/BWR 228)
            "position_pct": number,  // 0–100, 100 = fully withdrawn
            "moving": bool, "direction": int,      // +1 withdraw, -1 insert, 0 stopped
            "speed": string,         // "slow" | "normal" | "fast"
            "scrammed": bool,
            "insertion_limit_steps": int | null, "at_insertion_limit": bool,
        }
    ],
    // PWR-specific:
    "porv_demand": string,           // "open" | "closed"
    "porv_block_open": bool,          // PORV block/isolation valve (B1 — TMI recovery)
    "heater_power_pct": float, "spray_valve_pct": float,
    "heater_auto": bool, "spray_auto": bool,   // pressurizer controls in engine auto (override null) — Automate tab state

    "charging_flow_normalized": float,   // CVCS charging SETPOINT (command) — under AUTO the true flow (instruments.charging_flow) modulates away from this
    "letdown_flow_normalized": float,    // CVCS letdown setpoint
    "feed_pump_speed_pct": float,        // PWR feed pump commanded speed (three-element channel / coupling / manual)
    "feedwater_flow_pct": float, "steam_demand_mwe": float,   // feedwater_flow_pct: deprecated PWR mirror of pump delivery
    "hpi_active": bool, "rhr_active": bool,   // operator-actuated ECCS / cooldown (set_hpi — the merged HPI/LPI — / set_rhr)
    "rhr_valve_open": bool, "rhr_hx_fraction": float, "eccs_mode": string,   // RHR hot-leg valve state; HX flow split 0–1; ECCS card mode — retired engine "HPI"|"LPI"|"RHR"|"off", PWR2 "standby"|"armed"|"hhsi"|"lhsi"|"both"|"rhr" (see the true_state block above for "armed")
    "afw_throttle_pct": float,                // AFW throttle position (set_afw_flow)
    "sr_energized": bool, "msiv_open": bool,  // SR detector switch; main steam isolation valve
    "governor_valve_pct": float,     // turbine admission valve % (engine-driven; read-only readout)
    "steam_dump_pct": float, "steam_dump_auto": bool,   // steam dump / turbine bypass (B2)
    "pumps": [ { "id": string, "running": bool, "flow_pct": float } ],
    // RBMK-specific:
    "channel_flow_setpoint_pct": number, "eps_bypassed": bool,
    // BWR-specific:
    "recirc_flow_setpoint_pct": number, "ads_armed": bool, "slc_active": bool,
    // RBMK + BWR balance-of-plant (turbine load + steam dump — full-scope operation):
    "turbine_load_mwe": float, "steam_dump_pct": float, "steam_dump_auto": bool,
    // Shared where applicable: "feedwater_flow_pct" (RBMK/BWR feedwater demand).
}
```

### 6.6 Alarm object

```javascript
{
    "id": string,
    "state": string,        // "clear" | "active_unacknowledged" | "active_acknowledged"
    "priority": string,     // "critical" | "warning" | "caution" | "status"
    "panel": string,        // "A" | "B"
    "tile_label": string,   // selected by current register (learning | industry)
}
```

### 6.7 Command catalog (descend the stack, HR5)

A command names an action and carries its parameters. The UI, Instructor, and Test Runner
all issue these by name.

**Simulation lifecycle:**
```
play
pause
reset               { plant_id, initial_state, design_version? }   // design_version for the RBMK (pre/post-1986); null/omitted otherwise
set_speed           { value }                 // time acceleration factor
save_state
load_state          { state }
set_register        { value: "learning" | "industry" }
```
**Instructor / training lifecycle (M6 — handled by M5's control plane):**
```
start_scenario      { scenario_id }           // resolve RD.SCENARIOS[id] → reset plant → instructor.load
stop_scenario                                  // unload; clears the rewind ring
start_follow        { procedure_id }          // Path 2: resets the plant to the procedure's `from` state,
                                               // then the Instructor runs the RD.MANUAL_PROCEDURES procedure
stop_follow                                    // unload; clears the rewind ring
rewind              { steps?: 1, scope?: "full" | "world" }   // restore an in-memory checkpoint
                                               // full = incl. instructor progress (retry a decision)
                                               // world = plant only; the Instructor narrates on
                                               // ring: authored checkpoints per beat/step while content is
                                               // loaded; every 15 sim-s in free play (sandbox rewind)
follow_nav          { dir: "next"|"prev"|"restart" }   // descends; consumed by the Instructor in a follow
instructor_continue                            // the "Continue" click for `manual` beat triggers; consumed by the Instructor
```
**Rod control (all plants):**
```
rod_nudge           { group_id, steps }        // +withdraw, -insert
rod_start           { group_id, direction, speed }
rod_stop            { group_id }
rod_stop_all
scram
```
**PWR plant control:**
```
set_steam_demand    { mwe }
set_feed_pump_speed { pct }                    // feed pump commanded speed, 0–120 (delivered flow follows via pump inertia)
feed_pump_nudge     { delta_pct }              // manual nudge of the pump speed (the ▲/▼ buttons)
set_feedwater_flow  { pct }                    // DEPRECATED PWR alias for set_feed_pump_speed (still a real command on RBMK/BWR)
set_heater          { power_pct }
set_spray           { open }
open_porv
close_porv
set_hpi             { active }                 // the merged HPI/LPI system; manual use disarms its ESF auto
set_afw             { active }                 // AFW pumps; manual use disarms the AFW ESF auto
set_afw_flow        { pct }                    // AFW throttle, 0–100 % of capacity (also disarms the AFW auto)
set_esf_auto        { system: "hpi"|"afw"|"rhr", auto }   // re-arm (or disarm) an ESF system's auto-actuation
set_rhr             { active }                 // RHR hot-leg suction VALVE (doubles as LPI cooldown) — open honored only < 2.76 MPa (400 psi), auto-closes above it (was DHR)
set_rhr_hx          { fraction | pct }         // RHR heat-exchanger flow split (0–1 / 0–100 %) — throttles cooldown RATE; total flow & inventory unchanged
set_dhr             { active }                 // deprecated one-release alias for set_rhr (save-file compatibility)
set_lpi             { active }                 // DEPRECATED alias for set_hpi (HPI+LPI merged into one system; save-file compatibility)
set_charging_flow   { normalized }             // CVCS charging SETPOINT (manual) — inventory in (cold leg); instruments.charging_flow shows the true flow
set_letdown_flow    { normalized }             // CVCS letdown setpoint (Isolate = set 0)
set_charging_pump   { running }                // CVCS charging pump on/off
set_cvcs_auto       { active }                 // CVCS auto make-up (holds inventory / compensates leakage)
set_boron_adjust    { rate }                   // CVCS boron: + borate, − dilute, 0 hold (ppm/s; needs charging pump)
open_block_valve                               // PORV block/isolation valve (B1)
close_block_valve                              // isolates a stuck-open PORV
set_sr_detector     { on }                     // Source Range detector high voltage (P-6 interlocked both ways)
set_trip_block      { trip_id, blocked }       // block/unblock a blockable startup trip (P-10 gated; auto-reinstates below)
open_msiv                                      // Main Steam Isolation Valve — restore the steam path
close_msiv                                     // isolate main steam (trips a loaded turbine; SG bottles to its code safeties)
set_steam_dump      { mode: "auto"|"open"|"closed" | pct }   // turbine bypass to condenser (B2)
open_pzr_safety                                // pressurizer spring safeties — issued by the control-layer
close_pzr_safety                               //   actuation (pop 17.13 / reseat 16.55 MPa); engine keeps hydraulics
                                               // (SG code safeties have NO command since #369 — engine-native,
                                               //  self-actuating on true steam pressure; pop 9.31 / reseat 9.0)
```
**RBMK plant control:**
```
set_channel_flow    { pct }                    // MCP flow setpoint
set_feedwater_flow  { pct }
set_eps_bypass      { active }
set_eccs            { active }                 // Emergency Core Cooling — channel make-up on a pressure-tube rupture
manual_scram                                   // AZ-5 equivalent
set_turbine_load    { mwe }                    // turbine steam load → electrical output (BOP)
set_steam_dump      { mode: "auto"|"open"|"closed" | pct }   // turbine bypass to condenser (BOP)
open_relief_valve                              // steam-drum relief — issued by the control-layer
close_relief_valve                             //   actuation (pop 8.0 / reseat 7.8 MPa); engine keeps hydraulics
```
**BWR plant control:**
```
set_recirc_flow     { pct }
set_feedwater_flow  { pct }
set_turbine_load    { mwe }
trigger_ads
start_lpci
set_rcic            { active }                 // manual override; auto-start is default
set_ic              { active }                 // Isolation Condenser — passive heat sink, no AC (Fukushima U1); DC-valve, lost on battery depletion
set_hpci            { active }                 // higher-capacity steam-driven injection; auto-actuated (no manual control in v1)
initiate_slc                                   // Standby Liquid Control — boron shutdown (ATWS mitigation, D1)
stop_slc
start_lpcs                                      // low-pressure core spray (D4)
stop_lpcs
open_srv_manual                                // operator manual SRV depressurization (D6)
close_srv_manual
set_steam_dump      { mode: "auto"|"open"|"closed" | pct }   // turbine bypass to condenser (BOP; gated on condenser availability)
open_relief_valve                              // SRV auto relief — issued by the control-layer
close_relief_valve                             //   actuation (pop 7.58 / reseat 7.44 MPa); engine keeps hydraulics
```
**Shared plant control (all plants):**
```
trip_turbine                                   // turbine protection — issued by the control-layer low-vacuum /
                                               // overspeed actuations (2026-07-16 ruling: relief pops and turbine
                                               // trips are CONTROL decisions reading instruments; the engines
                                               // keep valve state + flow hydraulics and expose these commands,
                                               // so the protections can be manipulated and failed)
set_feed_coupled    { active }                 // re-couple feedwater to load (the init default;
                                               // set_feedwater_flow uncouples).
set_auto_channel    { channel_id, engaged }    // engage/disengage a Control Layer automation channel
                                               // (channel_id "all" = every channel). Engaging captures
                                               // the setpoint from the current instrument reading.
set_auto_setpoint   { channel_id, value }      // edit an engaged channel's setpoint (SI-internal units)
```
**Failure injection:**
```
inject_failure      { failure_id, severity }   // severity 0.0–1.0
clear_failure       { failure_id }
clear_all_failures
set_instrument_failure   { instrument_id, mode, value }
clear_instrument_failure { instrument_id }
```
**Alarm control:**
```
acknowledge_alarm       { alarm_id }
acknowledge_all_alarms
```

### 6.8 Command interface mechanics

No HTTP, no WebSocket. Commands are direct JavaScript function calls down the stack:

```javascript
instructorLayer.handleCommand({ action: "rod_nudge", group_id: "control_rods", steps: -1 });
//   → controlFailureLayer.handleCommand(command)   (may gate / intercept)
//      → engine.applyCommand(command)              (executes as direct physical control)
```
Errors return as `{ type: "error", code: "COMMAND_ERROR", message, received }`.

### 6.9 Named initial states (each plant must support)

- **PWR:** `hot_full_power` (100%, equilibrium) · `hot_zero_power` (subcritical, hot, at
  operating T/P) · `50_percent`.
- **RBMK:** `full_power` (100%) · `50_percent` (stable partial-power maneuvering point,
  healthy ORM) · `hot_startup` (subcritical hot standby — approach-to-criticality start) ·
  `low_power_xenon` (~7% power, xenon ≈ 135% of equilibrium, ORM ≈ 7.5 — the Chernobyl
  precondition).
- **BWR:** `full_power` (100%) · `50_percent` (stable partial power at reduced recirc) ·
  `hot_startup` (subcritical hot standby — approach-to-criticality start) · `post_scram_sbo`
  (scrammed, station blackout active, RCIC just started — the Fukushima starting point).

---

## 7. Technology, File Structure, Deployment

**Browser-only. Vanilla JavaScript. No server, no build step, no WebAssembly, no
framework.** The physics, all layers, and the UI are vanilla JS in a single browser tab,
communicating by direct function calls and a shared snapshot object. (Any reference to
"server-side physics" in older prose is obsolete — there is no server.)

```
Physics engines:  Vanilla JavaScript (ES2020+)
UI:               HTML5, CSS3, Vanilla JavaScript
Diagrams:         hand-authored SVG manipulated by vanilla JS
No framework / no build step / no server / no WebAssembly / no database
Save/load:        JSON downloaded/uploaded via browser file APIs
```

**Canonical file structure** (the modules map onto this):

```
reactor_dynamics/
├── index.html
├── engines/                                                                  // no shared engine module
│   ├── pwr/      { pwr_engine.js, pwr_config.js, pwr_instruments.js,         ← M1
│   │              pwr_thermal.js, pwr_pressurizer.js, pwr_primary.js,
│   │              pwr_steam_generator.js }
│   ├── rbmk/     { rbmk_engine.js, rbmk_config.js, rbmk_instruments.js,      ← M2
│   │              rbmk_kinetics.js, rbmk_thermal.js, rbmk_rods.js }
│   └── bwr/      { bwr_engine.js, bwr_config.js, bwr_instruments.js,         ← M3
│                  bwr_vessel.js, bwr_recirculation.js, bwr_safety_systems.js }
├── layers/
│   ├── control/                                                              ← M4
│   │   ├── control_kernel.js   (generic trip/actuation/alarm/failure machinery)
│   │   ├── pwr_control.js      (PWR trips/actuations/alarms/failures/interlocks — data)
│   │   ├── rbmk_control.js     (RBMK, version-aware pre/post; loads before rbmk_config)
│   │   └── bwr_control.js      (BWR)
│   ├── simulation_service.js   (step loop, snapshot assembly, save/restore)  ← M5
│   ├── instructor_layer.js     (M6·PH pass-through stub now; real M6 later)  ← M6·PH → M6
│   └── test_runner.js          (dev only)                                    ← M7
├── scenarios/   { pwr_tmi.js, rbmk_chernobyl.js, bwr_fukushima.js }          ← M6 (real, with the engine)
└── ui/          { app.js, diagram/, panels/, test_panel/ }                   ← M8
```

Each engine carries `*ScenarioTests` alongside its engine (e.g. `PWRScenarioTests` in
`pwr_engine.js`). Diagrams are hand-authored SVGs delivered separately; the UI is built
around a fixed placeholder region and a component manifest (see M8). **Deployment** is
copying the static files to any web host (CDN, GitHub Pages, any static host).

**Development:** serve with any static server (`npx serve .`, `python3 -m http.server`) or
open `index.html` directly. No compilation, bundling, or transpilation in v1.

---

## 8. v1 Scope — and What NOT to Build

v1 is deliberately contained: **three plants with fixed configurations** (the RBMK carrying
its pre/post version switch), **single-session / single-user** with local save+load,
**manual-first operation** (automatic *protection* is in scope; operator-selectable
automatic *control* — the Control Layer's per-plant automation channels, an explicit
2026-07 scope extension — defaults off except each plant's normal lineup and always yields
to manual action), and **the three flagship scenarios plus a library of smaller ones**
(format defined; the full library grows over time).

**Do not build the following in v1** (each is a reasonable future addition, intentionally
deferred — resist the instinct to build outward before the core is solid):

- Plant configuration *file* system / loader / inheritance, a plant editor, or custom plants.
  **Plant parameters live in code** — structured configuration *objects* in JavaScript, one
  set per plant (beyond the RBMK's internal pre/post sharing). HR3 still applies: they are
  data, just expressed in JS, so a future externalization is an extraction, not a redesign.
  *(Was HR8; retired from §3 on 2026-07-29 — a scope boundary saying what not to build,
  which is what this section is for, rather than an invariant the code can violate.)*
- User-facing profile testing, shareable validation reports, a plant-creation wizard, or a
  community plant library. (The dev-only Test Runner serves the developer.)
- Multi-user, accounts, authentication, cloud persistence, classroom infrastructure.
- Server-side or WebAssembly physics. (v1 is browser-side vanilla JS — this is the target,
  nothing to defer here.)
- ~~Automatic *control* systems~~ — **built (2026-07 scope extension, user direction):**
  per-plant automation channels in the Control Layer (rod T-avg hold, three-element
  feedwater, AR power hold, recirc/pressure PIDs, ESF AUTO/MAN arms) — see
  `M4b_control_layer.md`.
- Multi-bank rod systems and sequencing, Bank Overlap Unit display, core map view. (All
  were TMI-2-specific; with one control group they have no place.)
- Pressurizer discharge tank and rupture disk. (The stuck PORV + lying indicator are fully
  modeled; the discharge tank is secondary.)
- Sensor redundancy / voting, fuel burnup, thermodynamic turbine/condenser detail.
  (PWR low-pressure injection was later merged into the one HPI/LPI system, and passive
  accumulators were built — both post-v1-plan extensions. **Containment modeling left this
  list 2026-08-05**: #386 stage 1 built the lumped building — pressure, temperature, sump,
  live break/relief backpressure — with heat removal and hydrogen staged behind it.)
- Automatic fast-forward dropout. (In v1 the user sets time acceleration manually.)

### Physics simplifications the Instructor must acknowledge

v1's physics is lumped and behavioral — correct in direction and rough magnitude, validated
by the scenario tests. The simplifications below are intentional; the ones marked
**[tell user]** must be voiced by the Instructor in the relevant scenario (this is part of
the product's honesty, see M6):

- **[tell user] Point kinetics — no spatial neutron distribution.** The whole core is one
  point. The Chernobyl excursion was a localized bottom-of-core runaway; the lumped model
  understates the peak (simulated peak « historical ~100× rated). *Mechanism and outcome are
  faithful; only magnitude is understated.* The Chernobyl scenario must say so.
- **[tell user] No sensor redundancy.** One instrument per parameter, so a single stuck
  sensor affects everything downstream — making failures more impactful than in a real
  (voted) plant. Acceptable and arguably more educational; optionally acknowledged.
- **[tell user] Levels are geometric fill, not calibrated instrument spans.** Level `%` is
  simple geometric fill (0 = empty, 100 = full); real plants display a calibrated **narrow-range**
  span around the operating point (plus a separate wide range). The shrink-and-swell *indication*
  effect is still modeled — it lives in the instrument, not the calibration — so the level reading
  can still move the wrong way on a pressure transient; only the narrow/wide-range calibration is
  simplified away.
- **[tell user] Containment is a lumped volume, and it ends at fuel damage.** Since #386
  stage 1 (2026-08-05) the PWR containment has pressure, temperature and a sump receiving
  break/relief discharge (`Manuals/12` §12.4d) — but no heat-removal systems or hydrogen
  inventory yet (staged), and the simulation still ends at fuel damage; consequence events
  (the Chernobyl explosion, Fukushima hydrogen explosions) are described in commentary,
  not modeled. RBMK/BWR have no containment model at all.
- Lumped decay heat (two-term exponential, ~20% accurate over hours), lumped single steam
  generator (PWR) / single channel (RBMK), gain-coefficient pressurizer, timed BWR battery
  depletion (not charge-tracked), fixed jet-pump M-ratio, no xenon spatial oscillations, no
  fuel burnup, behavioral turbine/condenser. These are not user-visible enough to require
  acknowledgment but are all candidates for v2.

---

## 9. How Correctness Is Defined (two gates)

Two non-overlapping test systems. Both must pass.

- **Engine scenario tests (own physics correctness).** Each engine carries a suite of
  self-contained routines that drive it through the behaviors it must exhibit — steady
  operation, control response, shutdown, transients, the **flagship accident**, and
  save/restore — and assert the results. They **call the engine directly, bypassing every
  layer above**. *When an engine's suite passes, its physics is done.* The physics
  parameters are best-estimate starting points (`[tune]` in the math); you bring the engine
  up, run the suite, read which behaviors are off, adjust the responsible parameter, repeat.
  The test output is written to make this loop fast (expected vs observed, likely cause).
  **The suites are the behavioral contract.** Each engine's flagship acceptance criteria
  live in that engine's module (M1/M2/M3).
- **The Test Runner (owns integration correctness).** A synthetic operator that drives
  commands down the full stack and reads snapshots back, asserting the layers are wired
  correctly: snapshot complete and well-shaped, instruments genuinely differ from truth,
  **trips/alarms read instruments not truth** (the highest-value checks — stick an
  instrument past a setpoint with truth safe → must trip; drive truth past a setpoint with
  the instrument safe → must not trip), commands route and intercept correctly, alarm
  lifecycle works, configuration is internally consistent. It exists **only in
  development**. Spec in M7.

**The accident sequences are NOT re-run through the Test Runner.** If the engine tests pass
and the wiring is confirmed correct, the accidents work. Re-running physics through a layer
that adds no physics is testing the same thing twice. The two gates are designed to be
non-overlapping: one owns physics, the other owns wiring.

---

## 10. The Module Map and Build Order

Read `CONTEXT.md` + one module file to build that module. **Each engine (M1–M3) is
completely self-contained** — it builds from `CONTEXT.md` and its own module file alone,
with no dependency on any other module. Each carries its **own copy of the point-kinetics
core** (six-group integrator, decay heat, xenon — authored identically across the three,
kept consistent by spec rather than by a shared file), its **own instrument model** (built
in as a plant system), its thermal-hydraulics, plant systems, config, save/restore, and
scenario tests. There is no shared engine module and no shared engine code.

| Module | Directory | What it builds |
|--------|-----------|----------------|
| **M1** | `engines/pwr` | The PWR engine end to end: point-kinetics core, **its own instrument model** (PWR instrument set + lag/noise/range/failure behavior + derived subcooling), PWR physics (feedbacks, pressurizer, primary loop + inventory, steam generators, turbine/condenser, emergency cooling), PWR protection/alarm/failure config, save/restore, and the **Three Mile Island** acceptance suite. |
| **M2** | `engines/rbmk` | The RBMK engine end to end: kinetics core + RBMK prompt-criticality fast-path, **its own instrument model** (incl. ORM as a computed reading), RBMK physics (nonlinear/amplified void coefficient, ORM, the pre-1986 positive scram effect, two destruction paths, pressure-tube TH + graphite), pre/post versions, config, save/restore, and the **Chernobyl** acceptance + comparison suite. |
| **M3** | `engines/bwr` | The BWR engine end to end: kinetics core, **its own instrument model** (incl. vessel-level swell), BWR physics (negative void feedback, vessel + boiling, recirculation/jet pumps/natural circulation, the steam-driven safety systems RCIC/HPCI/ADS/LPCI, the timed battery limit, uncovery timeline), config, save/restore, and the **Fukushima** acceptance + comparison suite. |
| **M4** | `layers/control` | The Control Layer: a general **kernel** (`control_kernel.js`) for reactor protection, engineered-safety actuation, alarms (lifecycle), failure injection, and **command interception** — reading instruments (HR1), routing failures by kind (HR7) — plus **per-plant control modules** (`pwr_control.js`, `rbmk_control.js`, `bwr_control.js`) carrying each plant's trips/actuations/alarms/failures/interlocks as data (HR3). |
| **M5** | `layers/simulation_service` | The step loop, snapshot assembly, lifecycle (play/pause/reset/speed), plant selection, and save/restore — including the per-engine instrument state (lag buffers, failure state, PRNG seed) for exact-fidelity restore and determinism. |
| **M6·PH** | `layers/instructor_layer.js` | **Placeholder Instructor — temporary scaffold.** A transparent pass-through occupying the Instructor's slot so the stack can be wired and tested before the real Instructor is designed. Passes commands straight down (no gating), runs no beats, emits no commentary, tracks the selected register, and writes an empty `instructor` block (`message: null`). Same interface the real M6 implements, so M6 replaces it with no changes above or below. Built right after M5. |
| **M6** | `layers/instructor` + `scenarios` | **The real Instructor (design pending).** The scenario engine (beats, triggers, branching, gating, two-register commentary) and the three flagship scenarios. Surfaces the **[tell user]** simplification acknowledgments. Drops into M6·PH's slot when ready. |
| **M7** | `layers/test_runner` | The full-stack validation harness and its specific checks (the protection-boundary checks above being the most important). Runs against the assembled stack with M6·PH in place. Dev only. |
| **M8** | `ui` | The control-room UI: the fixed screen layout, the plant diagram (placeholder + component manifest strategy), gauges (with trend + optional true-state overlay), the two-panel alarm annunciator, the controls, the two registers, simulation/time controls, and the dev Test Panel. Runs against the stack with M6·PH (free-play) until the real M6 lands. |

**Build order** (the acceptance gate makes physics provable in isolation before assembly):

1. **M1 → M2 → M3.** Build each engine; tune until its scenario suite passes. When M3
   passes, the physics layer is complete and proven.
2. **M4**, then **M5** — now there is an assembled stack to step and snapshot.
3. **M6·PH** — drop the placeholder Instructor into the command path so the stack is
   complete end to end (commands route all the way down; snapshots come all the way up).
4. **M7** — validate the wiring of the assembled stack.
5. **M8** — the UI, in free-play against the stack.
6. **M6** — the real Instructor and the flagship scenarios, replacing M6·PH, whenever its
   design is ready (it does not block 3–5).

### Cross-module dependencies (the only seams)

- **M4 consumes each plant's protection config.** The kernel holds the general machinery and
  the config *schema*; the concrete per-plant trip/alarm/actuation/failure definitions live
  in `layers/control/<plant>_control.js` (authored against each engine's instrument set, and
  attached onto that engine's config so `engine.getProtectionConfig()` serves them).
- **Instrument IDs are defined alongside each plant's protection config** (an alarm
  referencing `subcooling_margin` requires that id to exist). The `true_state` vocabulary and
  snapshot *shape* are here in CONTEXT; the per-plant instrument-id lists are in M1–M3.
  M6/M7/M8 reference the engine modules for those ids.

---

## 11. Conventions

- **Failure taxonomy — two kinds, two places** *(was HR7; retired from §3 on 2026-07-29 as a
  placement convention rather than an invariant — it had already been amended once, and a
  misplacement is caught by review, not silently)*. A failure that modifies a physical
  parameter with no operator control (leak, tube rupture, loss of offsite power) is
  **physics** and lives in the **engine**. A failure that overrides or ignores a command
  (stuck valve, failed rod, tripped turbine) is **command-level** and lives in the **Control
  & Failure Layer**, where commands pass through. *(As built — 2026-07-16 design ruling.)*
  Mechanical relief-valve pop/reseat and turbine protection (low vacuum, overspeed) are
  implemented as **control-layer actuations** reading instruments and issuing commands; the
  engine keeps only valve state and flow hydraulics. So "stuck valve / tripped turbine =
  command-level" applies **uniformly** — even the spring safeties are interceptable.

- **Flows (taxonomy).** *Actual* flows are **normalized to rated** (1.0 = rated) and carry the
  `_normalized` suffix — every flow in a mass/level balance uses this one scale, so the balance
  terms are dimensionally uniform (this is why `dm_dt` and `dVesselLevel_dt` can sum feedwater,
  injection, steam, and boil-off directly). *Control demands/positions* — what the operator sets —
  are in **% of rated** (`_pct`). Power `P` is normalized fission power (1.0 = rated). Flows are
  **displayed as % of rated** and are **unit-system-neutral** (like power and level): the units
  toggle does not touch them. Absolute mass-flow display (kg/s / gpm) is deferred to v2 — it would
  need a per-flow rated magnitude to denormalize.
- **Units — SI internal, everywhere.** The engine, the configs, the Control & Failure Layer,
  the snapshot, and every setpoint/threshold are **SI throughout**: pressure in **MPa**,
  temperature in **°C**, condenser vacuum in **kPa**, level/power as **%**, flows normalized to
  rated (see *Flows* above), reactivity coefficients per **K** (= per °C), MW for
  electrical/thermal power. (Two deliberate non-SI carve-outs, both below: reactivity in Δk/k
  fraction, and energy deposition in cal/g.) Match the §6.3 field suffixes exactly (`_mpa`,
  `_c`, `_kpa`, `_pct`, `_normalized`). The internal unit system is invisible to the player —
  see the display rule next — so it is chosen for consistency, not authenticity.
- **Units — display is the player's choice (UI only).** The UI carries a global units toggle
  (**SI** ↔ **US customary**), structurally like the register toggle: it converts values for
  display only and **never** touches the engine, the setpoints, or any protective decision
  (HR1), so determinism is unaffected. The default is whatever the player picks; there is no
  plant-imposed default. Because the authentic operating units differ by plant (a US PWR is read
  in psia/°F; the RBMK and BWR in MPa/°C), the UI shows a small note next to the affected
  readouts indicating which system is *authentic for the current plant* — informational only;
  the player may use either (UI: M8; the Instructor also voices this once per plant: M6). The
  toggle converts only the genuinely-dimensioned readouts — **pressure, temperature, condenser
  vacuum**; flows, power, level, and RPM are unit-system-neutral and render identically in both.
- **Reactivity (units).** Reactivity is **Δk/k fraction** internally everywhere — ρ, β, the
  feedback coefficients (per-K, i.e. Δk/k per K), and rod worths are all fractions, so the
  kinetics `((ρ−β)/Λ)·P + Σλᵢcᵢ` is dimensionally uniform across all three engines. **pcm** and
  **dollars** are *display/derived only* (1 pcm = 1e−5 Δk/k; 1 $ = β). Where a value is shown in
  pcm — M1's rod worth (`0.04068`, 4068 pcm since #260; was `0.085`) or M2's per-group `worth_pcm` (which feeds the ORM
  rod-equivalent **ratio**, where the unit cancels) — it is a presentation of the same fraction
  and is never fed back into the kinetics in pcm.
- **Energy deposition (units).** The prompt-excursion energy metric stays in **cal/g** (rate in
  cal/g/s) — the domain-standard unit for fuel-failure thresholds in reactivity accidents — and
  is the one deliberate numeric exception to SI-internal. Do not convert it.
- **Snapshot field presence.** At runtime the snapshot's `true_state` and `instruments` carry
  **only the active plant's** fields (the per-plant sets in §6.3 and the engine instrument
  lists), **not** a union across plants with nulls. Consumers (UI gauges M8, Instructor triggers
  M6) must read only the active plant's fields and must not assume another plant's fields exist.
- **Instrument ids vs value fields.** Instrument ids are **unit-neutral names** (`tavg`,
  `primary_pressure`, `vessel_pressure`, `steam_flow`); the snapshot/`true_state` *value* fields
  carry the representation suffix (`_mpa`, `_c`, `_kpa`, `_pct`, `_normalized`). Do not add a unit
  suffix to an instrument id, or drop the suffix from a value field — the units pass and the UI's
  display layer both depend on this split.
- **Display formatting (representation → screen).** `_pct` fields are stored 0–100 and shown
  directly as %. Fields stored as a **0–1 fraction or normalized value** — void
  (`void_fraction_avg` / `core_void_fraction`) and the `_normalized` flows — are shown **×100
  with a % sign** (e.g. "Core Void 42 %", feedwater "85 % of rated"). Dimensioned readouts
  (pressure, temperature, vacuum) are converted by the units toggle above. Every such transform
  is **display-only** — the stored value never changes — and the true-state overlay shows the
  true value in the **same on-screen format** as the indicated one, so indicated-vs-true stays a
  like-for-like comparison.
- **Tuning:** values labeled `[tune]` in a module's math are starting points; the **physics
  acceptance suites** are the final arbiter — `run_pwr` / `run_rbmk` / `run_bwr`,
  `run_behavior`, `run_ops`, which state intended plant behaviour independently of any story.
  **Campaign missions, procedures and checklists are NOT arbiters of tuning** (HR9): they
  observe the plant, and when one breaks after a plant change the presumption is that the
  content is stale. Values not labeled are fixed constants — do not change them.
- **Naming:** snapshot fields, command names, and instrument ids are a fixed contract — use
  the exact names in §6 (and the per-plant instrument ids in the engine modules). Do not
  invent variants.
- **Explicit coupling:** the kinetics use the reactivity computed at the start of the step
  (from the previous step's temperatures/states). Standard explicit coupling, stable at
  0.02 s.

---

## 12. The Operator's Manuals (and the rule that keeps them true)

Each plant has an **operator's manual** — one authoritative, **single-voice** document (technical
terms spelled out with their acronym, e.g. "Steam Generator (SG)", "Startup Rate (SUR)") that a
user follows to operate the plant through every phase, plus alarm-response, per-failure emergency
procedures, and the flagship accident walkthroughs. The manuals are **the source of truth for the
Instructor (M6)**: every procedure step carries a machine-checkable **acceptance predicate** that
both the validation harness and the Instructor gate/grade on — one artifact, no second copy.

**Where it lives:**
- `Blueprint/OPERATOR_MANUAL_PLAN.md` — the manual spec: content model, the procedure schema, the
  full per-plant procedure list, and build status.
- `tools/gen_manual_reference.js` → `ui/manual_data.js` (`RD.MANUAL`) — the **generated** reference
  half (controls, indications, setpoints/limits, normal-value baselines, glossary), extracted from
  the live engine configs + a settling run so it cannot drift.
- `ui/manual_procedures.js` (`RD.MANUAL_PROCEDURES`) — the **authored, engine-validated** procedures.
- `test/run_procedures.js` — validates every procedure step's acceptance against the engine.
- `ui/app.js` (+ `shell.html`/`shell.css`) — the in-sim manual panel.

**HARD MAINTENANCE RULE — if you change the sim, update the manuals.** Any change that affects what
the manual states MUST update the manual in the same change:
- Change a **config value** (setpoint, trip/alarm threshold, instrument range, operating point,
  named state, safety limit) → **re-run `node tools/gen_manual_reference.js`** so `RD.MANUAL`
  matches, and adjust any procedure target/acceptance that depended on it.
- Add/rename/remove a **control, command, instrument, failure, or initial state** → update the
  authored layer (control/indication/alarm text, glossary) in the generator and the affected
  procedures; re-run the generator and **`node test/run_procedures.js`** (must stay green).
- Change **physics/tuning** that moves a validated behavior (a procedure's target no longer
  achievable, a new hazard) → update the affected procedures and their acceptance predicates and
  re-validate.
- Add a term/acronym anywhere in the **UI** → add it to that plant's **glossary**.

A manual that disagrees with the running sim is a defect: the Instructor would gate on a false
premise. Treat the procedure suite and the generator as part of the acceptance gate for any
sim-facing change.
