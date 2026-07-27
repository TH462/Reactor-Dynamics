# Reactor⚛️Dynamics — Design Companion
### Vision, Rationale & Roadmap

> **What this document is.** This is the *human-facing* companion to the build blueprint
> (`CONTEXT.md` + the `modules/` specs). The blueprint tells the coding agent **what to build**;
> this document holds everything the coding agent does **not** need but the project does — the
> **why** (vision, philosophy, design intent), the **deliberately excluded** (non-goals, with
> reasoning), and the **planned later** (the v2 roadmap and the full simplifications catalog).
>
> Claude Code should not need to read this to build a module. Keep it out of the per-module build
> context to save tokens. Read it when making design decisions, writing scenario commentary,
> onboarding a collaborator, or planning v2 — it is the place the *intent* lives so it isn't lost.
>
> Source: distilled from the original blueprint's vision, architecture-rationale, plant-overview,
> and scope/exclusions material — the narrative and rationale that the build-oriented
> reorganization condensed out of `CONTEXT.md` and the module specs.

---

## 1. Product Vision & Intent

**What it is.** Reactor⚛️Dynamics is an educational nuclear power plant simulator that runs in a
web browser, inspired by the spirit of Kerbal Space Program: take a genuinely complex technical
domain and make it explorable, hands-on, and engaging, without sacrificing the real concepts that
make it worth learning. A user sits at a simulated control room — a live, animated schematic, real
gauges, real alarms, and the kinds of controls a real operator uses (rods, pressurizer heaters,
feedwater, emergency cooling). They run the plant normally, push it into abnormal conditions, and
watch the physics respond. The simulator can reproduce the conditions behind the three most
consequential nuclear accidents in history — and let the user operate the same familiar plant the
accident happens on.

**Who it's for — and what it is not.** The audience is learners: students, enthusiasts, and anyone
wanting to understand how nuclear plants work and why the famous accidents happened. It meets a
beginner with plain-language explanations and an advanced user with real industry terminology,
switchable at will. It is **not** a licensed operator-training simulator and makes no claim to
regulatory fidelity. It is accurate enough to teach correct mental models and reproduce real
phenomena, while staying approachable.

**Why generic plants, not replicas.** The three plants are representative, not exact copies of any
specific facility. This is intentional: it keeps the physics tractable, avoids implying false
precision, and frees the design from facility-specific data that is often unavailable. The famous
accidents are **scenarios**, not separate plants — the plant a user learns is the plant the
accident runs on; only the situation changes.

**What success looks like (v1).** v1 is successful when:
- A user can start the PWR, operate it at power, and understand what they see through both the
  diagram and the gauges.
- The three accident scenarios run and teach their intended lessons, including the Chernobyl
  pre/post comparison.
- The physics engines pass their full scenario-test suites, reproducing the accident sequences
  within the limits of the simplified models.
- Instruments visibly lag, carry noise, and can be made to fail — and a failed instrument produces
  the correct downstream behavior in alarms and protection.
- A beginner uses Learning mode to understand the plant with no prior nuclear knowledge, and an
  advanced user switches to Industry mode for realistic terminology.

---

## 2. The Defining Principle, In Depth

The single most important idea in this simulator is the separation between **true physical state**
and **instrument readings**.

In a real plant, operators never see reality directly. They see it through instruments — sensors
with response lag, electrical noise, finite ranges, and the capacity to fail or lie. The history of
nuclear accidents is in large part a history of operators making reasonable decisions based on
instruments that were not telling them the truth. At Three Mile Island, a valve indicator showed
"closed" while the valve was stuck open; operators acted on the indication, not the reality, and
the situation deteriorated.

The simulator models that gap as a **first-class feature**, not an inconvenience to smooth over.
The physics engine computes true state; a separate instrument layer produces the readings the
operator actually sees — with lag, with noise, and with the ability to be stuck, drifting, or dead.
Every automatic protective system reads the **instruments**, never the true state, exactly as in a
real plant. This is what makes sensor-failure scenarios meaningful and what lets the simulator
faithfully reproduce accidents that were, at heart, failures of *information* rather than failures
of physics. It is non-negotiable, and it drives the architecture (see §6).

---

## 3. Educational Philosophy

- **Experience over lecture.** The simulator teaches by letting people do things and observe
  consequences, not by presenting text to read. The instructor layer offers commentary and
  context, but the learning happens through interaction.
- **Two levels of language.** Every piece of instructional content exists in two registers — a
  **Learning** mode in plain English and an **Industry** mode in real plant terminology. The user
  chooses. A beginner is not drowned in jargon; an advanced user is not condescended to.
- **Honesty about simplification.** The models are simplified. Where a model understates reality
  (a lumped kinetics model cannot fully capture the spatial dynamics of the Chernobyl excursion),
  the instructor says so plainly. The goal is correct understanding, not false precision — and the
  educational truth is preserved even when exact magnitudes are not achievable.
- **Comparison as a teaching tool.** The most powerful lessons come from running the same
  conditions two ways: the same Chernobyl scenario on the pre- and post-1986 RBMK (catastrophe vs.
  safe shutdown); the same Fukushima blackout with and without a key intervention (core damage vs.
  a saved core). These side-by-side outcomes teach why design and decisions matter more effectively
  than any single run.

---

## 4. What It Should Feel Like to Use

*This is design intent for everyone making implementation and content choices — when a small
decision comes up, this is the gut-level sense of what the product is supposed to feel like.*

**Learning the plant feels like gaining real competence.** A user who spends twenty minutes with
the PWR starts to understand the relationships: raise the rods slightly, power comes up, temperature
follows, pressure nudges; throttle the turbine, the steam-generator level rises; trip the feedwater
and the alarms come in sequence — level dropping, then low, then critical — while the secondary side
degrades. None of this is gamified into button-pushing. The plant behaves like a plant. When the
user understands why something happened, it is because they understand the underlying process, not
because a tooltip told them.

**Being misled by an instrument feels genuinely unsettling — and must not be softened.** In the TMI
scenario the PORV indicator shows closed; the alarm that would fire on an open PORV stays silent,
because it reads the indicator. The pressure is falling, which fits a reseated valve — a coherent
story the instruments are telling. A user may not notice anything wrong for a minute or two. When
they do — when the subcooling margin falls in a way that does not fit the story — there is a real
moment of cognitive dissonance. **That dissonance is the lesson.** The simulator must not add a
hint, a subtle warning, or make the stuck indicator visually distinguishable from a normal one. The
point is that it *wasn't* distinguishable. Build something that can genuinely mislead an attentive
user, and trust that the experience of being misled, then understanding why, teaches more than any
explanation.

**The comparison scenarios are the emotional center of the product.** When Chernobyl runs on the
pre-1986 reactor, the user presses the emergency shutdown — and the power *goes up*. It briefly,
measurably gets worse before the reactor is destroyed. That is the lesson: the design was the
hazard, not the operators. Then the same scenario runs on the post-1986 reactor — same starting
conditions, same button at the same moment — and the power falls; the reactor shuts down safely;
nothing explodes. **Not either run individually — both, back to back, the same hands on the same
controls producing opposite outcomes.** This is the reason the RBMK engine exists; make the two runs
easy to do consecutively. The Fukushima comparison works the same way: same blackout, same failing
batteries, same moment injection stops — depressurize-and-inject and the core is saved; don't, and
it isn't.

**The simplifications do not undermine the product — but they must be honest.** A user who finishes
Chernobyl understands *why* the positive void coefficient and graphite-tipped rods made the pre-1986
reactor dangerous under those conditions. That understanding is complete and correct whether the
simulated peak was 10× or 100× rated. What matters is that the instructor acknowledges the limit:
"the real excursion was larger than what you are seeing, because the full three-dimensional physics
is beyond what this model can represent, but the mechanism and the outcome are faithful." A
simulator that says "this is exactly what happened" when it cannot be is *less* trustworthy, not
more impressive. Saying so plainly earns trust and teaches something true about the limits of
simplified models — itself a valuable lesson.

---

## 5. The Three Plants & Their Accidents — Background

*Conceptual background for content authors and newcomers. The buildable physics lives in M1–M3;
this is the narrative shape and the historical lesson behind each.*

### PWR — Pressurized Water Reactor (hosts Three Mile Island)
The most common commercial design worldwide. Water under high pressure carries heat from the core
without boiling, passes through a steam generator that boils a separate lower-pressure loop, and
that steam drives the turbine — an indirect cycle; the loops never mix. The PWR is **inherently
stable**: when power rises, the fuel heats and Doppler feedback suppresses the reaction, and the
water heats, thins, and suppresses it further. Push it and it pushes back toward stability — which
is why it is the reactor to learn first. **Three Mile Island (1979):** a relief valve sticks open,
draining coolant, but its indicator shows closed; operators act on "closed," coolant is lost, and
the subcooling margin is the parameter that reveals the truth. The purest demonstration of the
simulator's defining principle — and why instruments must be able to lie.

### RBMK — the Chernobyl-type reactor (hosts Chernobyl)
A Soviet design fundamentally different from Western reactors: graphite is the moderator, water is
only coolant, boiling in individual pressure tubes through a massive graphite core. Its defining
hazard is a **positive void coefficient** — when the water boils and forms steam voids, the reaction
gets *stronger* (the water was acting as an absorber; remove it and more neutrons sustain the
chain). More power → more steam → more power: the PWR's self-correction reversed. A second flaw: the
control rods had **graphite tips**, so beginning to insert fully-withdrawn rods displaced water at
the bottom of the core *before* the absorber arrived — a "positive scram effect" by which pressing
the emergency shutdown could briefly make things worse. A key operating parameter, the
**Operational Reactivity Margin (ORM)** — how much shutdown capacity is currently inserted — was at
Chernobyl driven far below the permitted minimum, removing the reactor's ability to respond and
amplifying the void feedback. **Chernobyl (April 26, 1986):** low power with xenon poisoning, most
rods withdrawn (low ORM), reduced flow; the emergency shutdown is initiated; on the pre-1986 reactor
the positive scram effect and runaway void feedback drive an excursion that destroys the core; on
the post-1986 reactor the same sequence shuts down safely. The two versions are one engine with
different parameters — running the identical scenario on each is the central teaching device.

### BWR — Boiling Water Reactor (hosts Fukushima)
A Western reactor in which the water boils directly in the core and the steam goes straight to the
turbine — a direct cycle, no steam generator. Despite boiling like the RBMK, it uses water as
moderator, giving it a **negative** void coefficient: more steam weakens the reaction. It is stable,
like the PWR. Power is controlled substantially by **core flow** — more flow sweeps away voids and
raises power; less flow allows voids and lowers it — a control mechanism the other plants lack. Its
most important teaching content is its **safety systems**: because the core boils directly, removing
decay heat after shutdown relies on systems specific to this design — notably steam-driven cooling
that runs *without* electrical power, plus a depressurization system that enables low-pressure
injection. **Fukushima Daiichi (2011):** the reactor scrams successfully, but all AC power is lost;
a steam-driven system keeps the core covered on battery-backed control power for several hours;
then the batteries deplete, cooling fails, and the level falls toward uncovery. The teaching centers
on the value *and the limits* of passive steam-driven cooling, and on a decision point — a parallel
run shows that deliberately depressurizing and injecting low-pressure water could have kept the core
covered.

### The pattern across all three
Each plant teaches a distinct reason accidents happen:
- **PWR / Three Mile Island — a failure of *information*.** The plant was physically recoverable;
  operators could not see the true situation.
- **RBMK / Chernobyl — a failure of *design*.** Under the wrong conditions the reactor's own physics
  worked against safety, and the act of shutting down made it worse.
- **BWR / Fukushima — a failure of *sustained support*.** The immediate shutdown succeeded, but the
  prolonged loss of power overwhelmed cooling — with a window in which different decisions changed
  the outcome.

And in two of the three, the comparison run drives it home: the post-1986 RBMK survives Chernobyl's
conditions; the BWR with timely depressurization survives Fukushima's.

---

## 6. Architecture Rationale

*The hard rules themselves are in `CONTEXT.md §3`. This is the reasoning behind them — the why,
which the build blueprint states tersely.*

- **Why layered (engine → control/failure → instructor → UI).** Each layer has one job and a clean
  boundary, so the instrument-vs-truth separation can be enforced at exactly one seam and the
  accident scenarios remain faithful. The engine computes physics and makes **no control decisions**
  (HR2); the control/failure layer makes every protective decision from **instruments only** (HR1);
  the instructor scripts experience without touching physics; the UI shows the operator's view and
  reaches the engine only through commands (HR5).
- **Why instruments-vs-truth is the keystone.** It is the one rule whose violation makes the whole
  product pointless — break it (let a trip read true state) and the accidents become impossible to
  reproduce. Hence its prominence and the dedicated protection-boundary checks in the Test Runner.
- **Why data, not hardcoded logic (HR3/HR8).** Plant-specific numbers live as structured
  configuration *in code* so the three plants share one set of machinery, and so a future
  externalization is an *extraction*, not a redesign. v1 keeps parameters in JavaScript (no external
  config files) — the machinery to author, validate, store, and load external plant definitions is
  the deferred work, not the data organization.
- **Why determinism.** The same initial state and the same command sequence must produce the same
  result — this is what makes save/load and any future replay coherent, and what makes the scenario
  tests meaningful as a contract.
- **Why two gates (verification philosophy).** Physics correctness and wiring correctness are
  different questions answered at different layers. Engine scenario tests own physics (they call the
  engine directly, bypassing every layer); the Test Runner owns integration (it drives the assembled
  stack through the same interface the UI uses). Both green = correct. This is why the accidents are
  never re-run through the Test Runner — that would test the same thing twice.

---

## 7. Deliberate Exclusions — What We Are NOT Building in v1 (and Why)

*A blueprint is defined as much by its boundaries as its contents. Each item below is a reasonable
future addition, intentionally deferred — named explicitly so that the reasonable instinct to build
it is checked against the v1 plan. Do not build these unless they are explicitly brought into
scope.*

- **Plant configuration system.** No user-facing plant editor, no config *file* loader, no
  inheritance scheme beyond the RBMK's internal pre/post sharing, no custom plants. Parameters are
  structured in code so a future externalization is an extraction, not a redesign — but the authoring
  / validation / storage / loading machinery is deferred.
- **User-facing profile testing & a plant creator.** The Test Runner's reporting is built so a
  user-facing version could one day let users validate and tune their own plants — but the
  user-facing tool, the shareable validation report, the plant-creation wizard, and a community plant
  library are deferred. The v1 Test Runner serves the developer.
- **Multi-user, accounts, persistence beyond local save.** No accounts, authentication,
  identity-tied progress, cloud states, teacher accounts, or classroom infrastructure. One
  simulation runs; the connected interface controls it. Local save/restore only.
- **Browser-side physics is the target, not a deferral.** v1 runs the physics in vanilla JavaScript
  in the browser — no server, no downloads, no WebAssembly — so it opens in restricted institutional
  environments. There is nothing to defer here; this *is* the architecture.
- **Automatic *control* systems.** *(Superseded 2026-07 — brought into scope as the control-layer
  rework.)* Originally: automatic *protection* (trips) and *safety actuation* were in scope, but
  closed-loop automatic *control* holding setpoints during normal operation was deferred and the
  operator ran the plant manually. The build now includes **operator-selectable automation
  channels** (auto rod / T-avg hold, three-element feedwater, pressure and level controllers,
  the RBMK AR, and more) living in the Control Layer kernel as per-plant data, each individually
  switchable AUTO/MAN — the operator can still run everything by hand. See `CONTEXT.md §8` and
  `M4b_control_layer.md`.
- **Multi-bank rod system & sequencing.** The PWR has one control group and one shutdown group. Real
  multi-bank systems (banks A/B/C/D in programmed overlap) are deferred, and with them the associated
  displays: the **Bank Overlap Unit (BOU)** readout, automatic bank-sequencing enforcement, and the
  top-down **core-map view**. These were TMI-2-specific; with TMI-2 as a scenario rather than a
  separate plant and a single control group, they have no place in v1.
- **Pressurizer discharge tank & rupture disk.** Adds fidelity to the TMI sequence but isn't needed:
  the stuck PORV draining coolant and the lying indicator are the lesson, and both are fully modeled.
  The discharge tank filling and rupturing is a secondary detail. Deferred.
- **Content beyond the initial set.** The instructor engine, the scenario format, the three flagship
  scenarios, and an initial set of smaller teaching scenarios are v1. A large comprehensive library
  (many transients, procedures, structured courses) is content work that grows over time — the
  structure supports it; the full library is not a v1 deliverable. Audio/voice/media production
  beyond what the core needs is likewise deferred.
- **Fast-forward dropout logic.** The sim does not auto-detect a developing transient and drop back
  to normal speed. The user sets time acceleration manually and reduces it when they want to watch.
  A UX refinement, not required for any scenario or lesson. Deferred.

---

## 8. The Simplifications Catalog

*v1's physics is lumped and behavioral — correct in direction and rough magnitude, validated by the
scenario tests. Each simplification below is intentional and acceptable for the educational purpose,
and each is a candidate for v2. The ones marked **[tell user]** are visible enough that the
instructor must acknowledge them in commentary (these are wired into M6's scenarios).*

| # | Simplification | What it misses | Educational impact | v2 upgrade |
|---|----------------|----------------|--------------------|------------|
| 8.1 | **Point kinetics — no spatial neutron distribution** **[tell user]** | Localized behavior in large cores; the Chernobyl bottom-of-core runaway. Simulated peak « historical ~100× rated. | Mechanism faithful (positive void, positive scram, destruction all reproduced); only **magnitude** understated. | Multi-region (nodal) kinetics, or at minimum a two-region axial model capturing the bottom-of-core scram effect. |
| 8.2 | **Single lumped channel — RBMK** | Channel-by-channel dryout; spatial power peaking across the 1661 tubes. | Negligible for Chernobyl (driven by the prompt excursion, not channel dryout). | A few representative channel groups (hot/average/cold). |
| 8.3 | **Single lumped steam generator — PWR** | Loop-to-loop asymmetry, individual SG isolation, single-loop transients. | None for TMI (a whole-plant event). | Two- or four-loop model for single-loop scenarios (e.g. isolated SGTR). |
| 8.4 | **Lumped decay heat — two-term exponential** | Full ANS 23-group accuracy; the two-term form is ~20% accurate over hours–days. | Negligible: decay heat exists, demands cooling for hours, drove TMI and Fukushima — all conveyed. | ANS 5.1 standard decay-heat curve with fission-product group data. |
| 8.5 | **Xenon — no spatial oscillations** **[tell user, optional]** | Xenon power tilts that swing around a large core over hours (a real RBMK low-power difficulty). | Total xenon inventory suppressing the reaction is modeled (the Chernobyl precondition); the spatial oscillation is not. | Two-region axial xenon model (top/bottom split). |
| 8.6 | **No natural circulation — PWR** | Real PWRs establish 2–5% natural-circulation flow on pump loss, removing decay heat. | TMI doesn't depend on it; makes pump-trip slightly more severe (conservative); not visible in flagships. | Natural-circulation flow as a function of core ΔT and loop geometry. |
| 8.8 | **Steam-dump load-rejection arm is a bistable — so there is a cliff** (ruled 2026-07-27, #219) | A rejection just UNDER the arm threshold (`dump_load_reject_mwe`, 40 MWe) gets no fast dump at all: 39 MWe rejected reaches Tavg 318.9 °C and lifts the PORV, while 41 MWe is caught at 304.5 °C. It is also blind to staircases — 60 MWe delivered as four 15 MWe steps never arms. A real C-7 interlock is a bistable too, but a real plant has rod control and a turbine runback covering the gap. | **Deliberate.** The sub-threshold rejection is a manoeuvre the operator is expected to handle, and the PORV is the honest backstop when they don't. Lowering the arm is not the fix: an arm low enough to catch an ordinary 15 MWe dispatch cut leaves the dump venting forever, holding the reactor at 100 % and destroying the load-follow lesson (EV-11). Both sides of the cliff are pinned by probe **TR-1c**. | A second, slower arm path — e.g. Tavg sustained above the programmed reference — to cover staircased and sub-threshold rejections without re-creating the dispatch problem. |
| 8.7 | **HPI flow model** | *(Note: an early scope draft called this binary on/off; the PWR engine spec specifies flow that falls as pressure rises, and **the build follows that pressure-dependent form** — see M1.)* | TMI lesson is "use HPI or don't"; either form serves it. | HPI flow-vs-pressure curve from pump characteristic data. |
| 8.8 | **Pressurizer — effective coefficients, not two-phase thermodynamics** | Flash evaporation, condensation, two-phase steam-water behavior; subcooled surge into a steam space. | Pressure directions/magnitudes correct; the **TMI-critical misleading level rise during voiding** is captured via surge-line coupling. | First-principles two-phase pressurizer with enthalpy-based energy balance. |
| 8.9 | **BWR battery depletion — timed, not physics** | Depletion rate depends on DC load, which varies with operating choices. | Lesson — RCIC buys hours, batteries are finite, the window closes — fully conveyed; duration tunes to the historical ~8 h. | Battery charge as a depleting state variable; duration becomes an emergent consequence of operator choices. |
| 8.10 | **BWR recirculation — fixed jet-pump M-ratio (1.5)** | M-ratio varies with drive flow; efficiency changes at low flow. | Negligible: flow-controlled power and natural circulation don't depend on the exact curve. | M-ratio as a function of drive flow from jet-pump characteristic curves. |
| 8.11 | **No sensor redundancy / voting** **[tell user, optional]** | Real plants use ~3 channels with 2-of-3 voting; one failed sensor can't trip or block a trip alone. | Makes instrument failures **more** impactful — acceptable and arguably more educational; the fallibility lesson is strengthened. | Three-channel redundancy with 2-of-3 voting; failures requiring two channels to fail. |
| 8.12 | **No containment model** **[tell user]** | Containment pressure, hydrogen generation, fission-product release; the Chernobyl explosion and Fukushima hydrogen explosions. | Scenarios teach causes and core physics; containment consequences are **described in commentary**, not simulated (sim ends at fuel damage). | Simplified containment pressure + hydrogen model, enough to show the challenge. |
| 8.13 | **No fuel burnup** | Cores age over a cycle — reactivity drifts, fission products build. | None for the flagships (all three accidents occurred during normal operation, not end-of-cycle). | Simple burnup tracking with cycle-averaged parameters that shift over a modeled cycle. |
| 8.14 | **~~No low-pressure injection / accumulators — PWR~~** *(superseded 2026-07: the control-layer rework built both — a merged two-segment **HPI/LPI** injection curve and passive pressure-triggered **accumulators**; see `M4b_control_layer.md` and `engines/pwr/pwr_primary.js`)* | ~~Full ECCS for a large-break LOCA; HPI alone can't hold the core on a large break.~~ | The original rationale (TMI is a small-break LOCA where HPI suffices) still explains why v1 shipped without them. | Done — was: accumulators (passive, pressure-triggered) + LPI. |
| 8.15 | **Turbine & condenser — behavioral, not thermodynamic** | Stage efficiencies, feedwater-heater trains, hotwell level, circulating-water temperature. | None: turbine trip and loss of condenser vacuum reproduced correctly; the thermodynamic detail isn't part of any lesson. | Multi-stage turbine with feedwater-heater extraction and detailed heat rejection. |
| 8.16 | **Levels are geometric fill, not calibrated spans** **[tell user]** | Real plants display a calibrated **narrow-range** level (a band around the operating point) plus a separate wide range, with differential-pressure reference legs. v1 uses straight geometric fill (0 = empty, 100 = full). | The lessons that hinge on level read directly — the pressurizer rising during voiding (TMI), the vessel uncovering the core (Fukushima). **Shrink-and-swell is still modeled** (it lives in the instrument indication, not the calibration), so the reading can still move the wrong way on a pressure transient; only the narrow/wide-range calibration is simplified. | Calibrated narrow- and wide-range level instruments with reference-leg behavior. |

*Representation decision (not a simplification — nothing is lost): some quantities are stored in
the form that keeps the physics clean and displayed in the form that reads best. **Void fraction**
and the **normalized flows** are stored as a 0–1 fraction (so the reactivity and mass-balance
equations stay dimensionally uniform across all three engines) and shown on gauges ×100 with a %
sign, consistent with the level gauges. **Reactivity** is Δk/k fraction internally with pcm/dollars
as display forms, and **energy deposition** stays in cal/g (the domain-standard for prompt
excursions). All are display-only transforms; the stored values never change. (Full rules:
`CONTEXT.md §11`.)*

*Related consolidation note: the original blueprint described the BWR/RBMK void fraction two ways
(a thermodynamic quality/density derivation and a tuned power-over-flow form); these were the same
model — the derivation explaining the tuned formula — and the build uses the tuned power/flow form
with a short response lag.*

---

## 9. The v2 / Future Roadmap (consolidated)

A single place to see where v2 could go, drawn from the catalog above and the exclusions in §7.

**Physics fidelity**
- Multi-region / nodal (or two-region axial) kinetics — most faithful Chernobyl excursion and a
  more honest bottom-of-core scram effect (8.1).
- Two-region axial xenon (top/bottom) for spatial oscillations (8.5).
- ANS 5.1 decay-heat standard (8.4).
- Representative multi-channel RBMK (hot/average/cold) (8.2).
- Two-/four-loop PWR for single-loop transients and isolated SGTR (8.3).
- First-principles two-phase pressurizer (8.8).
- Natural circulation for the PWR on pump loss (8.6).
- Pressure-dependent ECCS: accumulators + low-pressure injection, enabling large-break LOCA (8.14).
- Battery charge as a depleting state variable on the BWR (8.9).
- Variable jet-pump M-ratio (8.10).
- Fuel burnup / core aging (8.13).
- Multi-stage thermodynamic turbine & condenser (8.15).
- Containment model — pressure, hydrogen, release — to extend scenarios past fuel damage (8.12).
- Three-channel sensor redundancy with 2-of-3 voting, and failures requiring multiple channels
  (8.11).

**Features & platform**
- External plant-configuration system: authoring, validation, storage, loading of plant definitions
  (extraction of the in-code config) — and from it, user-created plants.
- User-facing Test Runner: shareable validation reports and a guided plant-creation/tuning wizard;
  a community plant library.
- Multi-user: accounts, identity-tied progress, cloud-saved states, teacher/classroom roles.
- Multi-bank PWR rod system with sequencing, the Bank Overlap Unit display, and a core-map view.
- Pressurizer discharge tank and rupture disk (TMI fidelity).
- Automatic control loops (auto rod/level/pressure control) for normal operation.
- Fast-forward dropout: auto-detect a developing transient and drop to normal speed.

**Content**
- A large scenario library: many transients, procedures, structured courses (the format already
  supports it).
- Audio/voice and richer media (e.g. pre-rendered instructor narration).

---

## 10. The Principle Behind the Boundary

v1's job is to prove the concept thoroughly: three real reactor types, each behaving correctly, each
hosting its famous accident faithfully, with the instrument-versus-truth principle that makes those
accidents meaningful fully realized, wrapped in an interface that teaches both beginners and
enthusiasts. Everything deferred here is an extension of a system that v1 establishes. **Build the
core completely and well; resist the pull to build outward before the core is solid.** The deferred
items will be far easier to add to a finished, coherent v1 than to a v1 that tried to do everything
at once and finished none of it.
