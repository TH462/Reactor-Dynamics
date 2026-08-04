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

## 2. The Instrument/Truth Separation, In Depth

> **THIS IS AN ARCHITECTURE PRINCIPLE, NOT THE PRODUCT'S CENTRAL TEACHING IDEA** *(OWNER RULING,
> 2026-08-02, on the sentence this section opened with for most of the project's life — *"The
> single most important idea in this simulator is the separation between true physical state and
> instrument readings"*: **"This has never been the case for this sim… This is far from the most
> important idea in this sim. It's very far down the list. The most important ideas are plant
> dynamics followed by how to operate the plant."**)*
>
> The educational priority is **(1) plant dynamics — the couplings between components, and the
> physics behind them; (2) how to operate the plant — normal evolutions, in order, correctly
> lined up.** Instrument deception is a property of the observation layer that becomes the
> *subject* only in casualties and flagship scenarios. See `Blueprint/CURRICULUM.md`.
>
> **Nothing below is retracted as ARCHITECTURE.** The separation is real, non-negotiable, and
> load-bearing — it is what makes failure scenarios possible at all, and a healthy channel's lag
> shapes what the operator sees with nothing failed (measured: **4.00 s** behind the plant on
> `tavg` during A1 — `CURRICULUM.md` Tier A has the table, and the size belongs to the channel,
> not the transient). What was wrong was the claim of *primacy*, and
> the ordering reason is in `CURRICULUM.md` (Tier A): you cannot perceive a lying instrument
> without already knowing what the plant should be doing, so this idea depends on the dynamics
> rather than outranking them.

The simulator separates **true physical state** from **instrument readings**.

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
moment of cognitive dissonance. The simulator must not add a hint, a subtle warning, or make the
stuck indicator visually distinguishable from a normal one. The point is that it *wasn't*
distinguishable. Build something that can genuinely mislead an attentive user, and trust that the
experience of being misled, then understanding why, teaches more than any explanation.

**But read what actually resolves that moment, because it is not distrust — it is the dynamics.**
The user notices *"the subcooling margin falls in a way that does not fit the story"*, and **the
story is the coupling between pressure, temperature and margin**. Instrument deception is therefore
a **Tier C payoff of the dynamics curriculum, not the product's premise** *(OWNER, 2026-08-02: "I
don't want to focus on instruments lying. It will come up in failure scenarios but I dont know if
it should be a major focus.")*. Taught before the couplings it yields generalised distrust of gauges
instead of diagnosis by cross-check. This section is a requirement on **fidelity** — do not soften a
failed channel — not a statement about what the simulator is for. See `DESIGN_CRITERIA.md` §6.3.

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
- **Why instruments-vs-truth is load-bearing (HR1) — a rule about the MODEL, not the premise.**
  Break it (let a trip read true state) and the accident scenarios become impossible to reproduce,
  and **a healthy channel's lag is itself part of the dynamics** — measured, `tavg` (lag 4.0 s)
  puts the gauge **4.00 s behind the plant during A1 itself**, with no failure injected anywhere.
  The size of that belongs to the channel, not the transient: `power_range` (0.1 s) and
  `primary_pressure` (0.5 s) stay within a sample even through a scram and a LOCA
  (`DESIGN_CRITERIA.md` §6.3 has the table). That is why it earns dedicated protection-boundary
  checks in the Test Runner. And it governs the **seam, not the roster** — which instruments exist
  and what they are like is plant design (`CONTEXT.md` §3 HR1). It is **not** the product's educational premise:
  the premise is plant dynamics (§2, `DESIGN_CRITERIA.md` §6). An earlier revision of this bullet
  called it "the keystone… the one rule whose violation makes the whole product pointless", which
  inverted the two.
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
| 8.6 | **~~No natural circulation — PWR~~** *(RETIRED 2026-08-04, #325 — the departure was CLOSED rather than justified. Owner ruling: "Go with one B". Kept as a row because its "slightly more severe" impact line was quoted for months and was measurably wrong.)* | ~~Real PWRs establish 2–5% natural-circulation flow on pump loss, removing decay heat.~~ **The old impact line said "slightly more severe (conservative)". Measured, it was TERMINAL**: a loss of offsite power reached fuel damage at 30 min and melt at 45 min, and starting AFW moved melt to 50 min and changed nothing else — there was no core→SG heat path at all. | **Closed, and the reason is Q2.** Losing the RCPs removed the ONLY heat-transport path, so two Tier C **Core** casualties (E04/E05, coupling **A6**) were evolutions in which nothing the player did mattered. Built as W = C·√ΔT closed against the core rise ⇒ **W ∝ Q^⅓**, gated to zero on loop voiding. Measured after: the same LOOP parks Tavg at 567 °F (297 °C) indefinitely, and an SBO squeezes to 9.2 °F (5.1 °C) of subcooling at 30 min then recovers. Mechanism sourced to WTSM 3.2.6.3 (ML11223A213); **the MAGNITUDE is fitted and declared as such** — see `Manuals/12` §12.4, which is the row that replaces this one. Pinned by **TR-15**. | — |
| 8.21 | **Steam-dump load-rejection arm is a bistable — so there is a cliff** (ruled 2026-07-27, #219) | A rejection just UNDER the arm threshold (`dump_load_reject_mwe`, 40 MWe) gets no fast dump at all: 39 MWe rejected reaches Tavg 318.9 °C and lifts the PORV, while 41 MWe is caught at 304.5 °C. It is also blind to staircases — 60 MWe delivered as four 15 MWe steps never arms. A real C-7 interlock is a bistable too, but a real plant has rod control and a turbine runback covering the gap. | **Deliberate.** The sub-threshold rejection is a manoeuvre the operator is expected to handle, and the PORV is the honest backstop when they don't. Lowering the arm is not the fix: an arm low enough to catch an ordinary 15 MWe dispatch cut leaves the dump venting forever, holding the reactor at 100 % and destroying the load-follow lesson (EV-11). Both sides of the cliff are pinned by probe **TR-1c**. | A second, slower arm path — e.g. Tavg sustained above the programmed reference — to cover staircased and sub-threshold rejections without re-creating the dispatch problem. |
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
| 8.17 | **~~Steam dump sized at 105 % of rated steam flow, not the prototypical 40 %~~** *(RETIRED 2026-07-31 — the departure was closed rather than justified. Owner ruling: "Let's change it to 40%." The dump is now **0.40**, the value WTSM §11.2 (ML11223A294) gives for most Westinghouse units, so there is nothing here to declare. Kept as a row because four months of comments, probes and manual text cited this number.)* | ~~A real plant of this class cannot ride out a full load rejection, and ours could.~~ Measured at 0.40 the plant reproduces the documented **40 % dump + ~10 % reactor step** split on a 50 % loss of load (dump saturates, core settles 89.3 %) — pinned by **TR-1g**. | **Closed, and the reason is the teaching goal.** At 105 % the P-9 trip's own premise — *"a turbine trip will cause a load rejection beyond the capacity of the Steam Dump System"* — was false for this plant, so the interlock was something a student had to be TOLD. At 40 % it is demonstrable, and the dump is a finite resource that can be driven to its stop. The full 100 % rejection now runs the ladder (dump → core runback to 46 % → PORV at 16.37 → SG safeties graze 9.32) and still does **not** scram, so FG-4 ride-out is intact — **TR-1**. | — |
| 8.18 | **Rod-withdrawal block at 1.5 DPM startup rate — a teaching aid with no real analog** (sourced 2026-07-31, #220) | Real plants have **no automatic SUR trip and no rate-based rod stop**. ≤1 DPM is an *administrative* limit the crew enforces (*"Do not exceed a stable startup rate of 1 DPM"* — Duke McGuire OP/1/A/6100/05 §2.1, ML20077E732); the automatic backstop is a **flux level**, not a rate. Turkey Point 2020 is the worked case: the crew reached 3.0 DPM indicated against the 1.0 limit and the plant tripped on **source-range high flux at 1e5 cps** (NRC Special Inspection, ML20344A126). | **Deliberate.** The `sur_high` alarm at 1.0 DPM *is* the prototypical administrative limit, and the SR high-flux trip at 1e5 cps *is* the prototypical backstop — both are modelled. The block between them makes the administrative limit enforceable by a lone trainee who has no shift behind them, and it refuses withdrawal only, never insertion. | Drop the block and let the procedure + the flux backstop carry it, once the instructor layer can play the role the real shift plays. |
| 8.19 | **AFW auto-start is offset 3 points above the SG lo-lo reactor trip (20 % vs 17 %)** (sourced 2026-07-31, #220) | The real plant uses **one signal at one setpoint** for both: SG low-low level is the first of the five AFW auto-start conditions (WTSM §5.7, ML11223A229) and is the same low-low function that trips the reactor (NUREG-1431 Tables 3.3.1-1 / 3.3.2-1, ~30–32 % NR span). The offset is ours. | **Deliberate.** It buys a visible *"AFW started — level still falling"* window that a single-setpoint plant does not give a lone operator, which is the whole of the TR-8 / loss-of-feedwater lesson. Our other two starts are prototypical: loss of main feed above P-9 is the real condition 3, and the SI start is condition 4. | One signal at one setpoint, with the window provided by the instructor rather than by the setpoint ladder. |
| 8.22 | **Manual MSIV closure trips the turbine outright, and there is no generator reverse-power trip** (sourced 2026-07-31, #284) | A real Westinghouse plant does **not** trip the turbine on MSIV position. WTSM §7.1 *Main and Auxiliary Steam Systems* (ML11223A244) describes manual MSIV operation from a control-room switch with no turbine interlock attached, and **neither** turbine-trip path in WTSM §11.3 (ML11223A295) lists it: the emergency trip solenoid opens on *"Manual turbine trip (from the control board), Reactor trip signal (train B), High-high level in any steam generator, and Low auto-stop oil pressure"*, and the auto-stop oil block carries the bearing / vibration / EH-fluid faults plus *"Generator reverse power (with a 30-sec delay)"*. What a real machine does when steam is cut with the breaker still closed is **motor** — and the reverse-power relay ends it 30 s later. The real plant also declines to sit near zero load at all: on breaker closure the EHC *"sets the reference load at 5%, with a load rate of 1%/min. Increasing the load of the turbine to 5% ensures that the generator does not motorize."* | **Acceptable and conservative in direction** — we trip immediately where the real machine motors for 30 s, so the sim never *displays* a state the real plant would have cleared anyway. But it is a **departure, not prototypicality**, and it is declared here because the handler's own comment used to assert the opposite (*"real plants: MSIV closure = turbine trip"*). That is the #220 drift class exactly: a real-plant premise recited for behaviour this plant departs from. | Model the **generator reverse-power trip** (30-s delay) and let *that* end a motoring machine, then drop the MSIV coupling entirely. The same protection resolves **#289**: a zero-load synchronised plant becomes self-clearing instead of permanent, which is what the real 5 % floor plus the relay achieve together. |
| 8.25 | **No turbine roll and no no-load speed hold — so the 1980 RPM overspeed trip is UNREACHABLE** (ruled 2026-08-03, #307; parked in #238) | A real unit rolls the machine off the turning gear on no-load steam, holds rated speed **off line** under the EHC, and synchronises before the breaker closes. Sourced, that roll is a **setpoint-and-rate evolution, not a synchroscope one**: the operator selects a discrete speed setpoint by pushbutton — *CLOSE VALVES, 100 RPM, 800 RPM, 1500 RPM, 1800 RPM, OVERSPEED TEST* — plus an acceleration rate (**SLOW ≈ 30 min** to 1800 rpm; MEDIUM, FAST); the EHC's speed control section takes over near rated and holds no-load speed **automatically**; synchronising itself *"can be carried out by the operator, or in the coordinated control mode … automatically initiated and implemented"*; and after breaker closure the system *"automatically shifts to load control"* (WTSM §11.3 ML11223A295 / §19.0 ML11223A342; the discrete setpoint list is **GE** EHC, ML11258A318 — **weaker citation class: nrc.gov 403s every direct fetch, so these are search-index snippets, the ML11223A219 precedent**). Here synchronisation is **atomic** and the breaker is not a separate thing: `isOnLine()` *is* `load_mode !== 'disconnected'`. | **Deliberate, and the measurements are why.** (a) The evolution's *outcome* is already right and thermally a **non-event** — measured full stack from `5_percent`, `connect_grid` puts the rotor at **1800 rpm** and **4.68 MWe** inside one 30 s sample, the dump hands off **5.13 % → 0.54 %**, Tavg moves **0.1 °F** and steam pressure **1196 → 1194 psi (8.24 → 8.23 MPa)**. (b) It earns **no Tier A credit** (`DESIGN_CRITERIA` §6.3): the one coupling it would add — no-load steam as a heat sink at zero MWe — is the *"steam flow ≠ electrical output"* lesson the dump and #284 already carry. It is a **Tier B** procedure skill, and the ruled priority is dynamics first. (c) The cost is a **replacement, not a retune**: rated flow buys **0.8 rpm** (0.044 % of rated), holding 1800 needs **2250× rated** admission, and the `if (rpm < 1) rpm = 0` floor needs **> 2500×** at the shipped 0.02 s `PHYSICS_DT` — so the first admission that can start the rotor from rest settles it at **2000 rpm**, past this very trip. There is no operating point between "will not turn" and "overspeed". Off line the governor is commanded shut by construction (`load_target_mwe = 0` → measured `governor_valve_pct 0.000`), so "no-load admission" and "a speed controller" are **one change, not two**. Pinned by **`run_reachability` B3**, written inverted so it goes RED when the roll is built. | Drive the governor from a **speed controller** when the breaker is open, add a **Turbine Speed SP** box (same idiom as Pressure SP / Dump SP) and gate `connect_grid` on a **synchronising permissive** (speed in band + vacuum healthy), refused with a reason like `reset_rps`'s `RODS_NOT_INSERTED`. **Do NOT add a `breaker_closed` field** — that is the #284 shape (two ways to ask one question) and #307 declines it. Blast radius measured at **17 `connect_grid` sites**. Takes #238's overspeed item with it for free. **Widen `turbine_rpm`'s range when you do**: it is [0, 2000] against a 1980 setpoint, and an injected 2100 rpm rotor reads a clamped **2000.00**. |
| 8.26 | **An SGTR delivers neither mass nor energy to the steam generator** *(ruled 2026-08-03, #322)* | A real tube rupture raises level and activity in the **affected** generator — the classic signature, and how the crew identifies *which* one. Here the leak is a primary-side mass sink with ΔP modulation only: `leak_to_sg` names the ΔP dependence and routes nothing, the SG level integrator is `(feedwater_flow − steam_out)` with no leak term, and SG pressure is capped at Psat(Tavg) so it follows primary *temperature* rather than steam inventory. Measured: with the leak at 0.011–0.015 frac/s and feed, AFW and steam flow all zero, SG level held **67.98 % constant for four minutes**; closing the MSIV moved secondary pressure by 0.4 % (134.6 → 134.0 psi). | **Q2 lost to scope, not to Q1.** This plant models **ONE** steam generator, so the lesson the level rise exists to teach — *which* generator is leaking — cannot exist here at whatever fidelity. Building the term would cost a new fitted constant on the secondary mass balance (SG flows are normalized 0–1; `leak_flow` is primary-inventory-frac/s) and buy a cue that teaches materially less than it does on a real plant. The primary-side diagnosis it forces — inventory falling with charging saturated, level through the trip, subcooling eroding — is real and is what PWR-E06 now teaches. **Revisit if a second steam generator is ever modelled**; the level term arrives with it and earns its constant then. | Multi-SG secondary with per-generator level, activity and isolation. |
| 8.24 | **Two of the four real loss-of-flow reactor trips are not modelled — RCP bus under-voltage and under-frequency** (sourced 2026-08-03, #314) | WTSM 12.2 §12.2.3.12 (ML11223A301) lists **four** diverse ways a real Westinghouse plant detects a loss of forced flow: low loop flow (2/3 per loop), **RCP breaker position** (*"The reactor trips if at least two reactor coolant pump breakers open"*), **RCP bus under-voltage** (1/2 sensors on 2/2 busses) and **RCP bus under-frequency** (same logic, and it *"also trips the RCPs"*, because under-frequency *"reduces the coastdown time of the pumps if power is lost to the busses"*). This plant now models the first two. | **Deliberate, and the reason is HR1 rather than effort.** Both missing trips sense an **RCP electrical bus** — voltage and frequency — and this plant has no bus model at all. Building them would mean inventing the signal and presenting it as an instrument, which is the #220 defect class. The breaker trip was built because its signal is genuinely present: `rcp_running` is an existing instrument that already drives the RCP TRIP annunciator. **Coincidence is a declared adaptation too** — 1/1, not the real 2-of-4, because the real rule means *half the pumps are gone* and this single-loop plant has one RCP; inventing a second pump to vote with would be the same defect. Measured: the breaker trip ends the `pwr_lof` casualty at **23.0 s** (1 s after the pump) with peak core void **0.000**, against 58.5 s and 0.628 when `lo_flow` was the only loss-of-flow trip and its channel was stuck. | An RCP bus model (voltage, frequency) — which would also let the under-frequency trip do its real second job of tripping the pumps, and would make a degraded-grid casualty reachable at all. |
| 8.20 | **P-9 and the turbine trip are sensed at status level, not from the real transmitters** (sourced 2026-07-31, #220) | Real Reactor Trip on Turbine Trip is sensed from **4/4 turbine stop valves fully closed** or **2/3 low autostop oil pressure** (~45 psig / 3.1 bar); the real P-9 comes from **two-out-of-four NIS power range detectors** (NUREG-1431 Rev 4 Bases B 3.3.1, ML12100A228). Ours keys on a `turbine_tripped` status word and a single power-range channel. | **Acceptable at this abstraction.** There is no stop-valve or autostop-oil model to read, and the status word is equivalent at the level the plant is built at. The P-9 half is **not** waived, though: it reads the power-range **instrument** as of #220 (it read true power before), so it can be fooled by the channel it is supposed to be reading — pinned by probe **TR-1f**. Combined with §8.11 (no voting), a *single* failed channel defeats the permissive here where a real plant would out-vote it, which makes instrument failure more teachable, not less. | Stop-valve position and autostop oil pressure as modelled instruments, with the 2/4 and 4/4 voting of §8.11. |
| 8.23 | **Overtemperature ΔT and Overpower ΔT carry no axial-offset term, no lead-lag and no rate term** *(ruled 2026-08-02, #311; built 2026-08-03, shipped DEFAULT OFF)* | The real equations are ΔT ≤ ΔT₀[K₁ − K₂·((1+τ₁s)/(1+τ₂s))(T−T′) + K₃(P−P′) − f₁(ΔI)] and ΔT ≤ ΔT₀[K₄ − K₅·(τ₃s/(1+τ₃s))T − K₆(T−T″) − f₂(ΔI)]. Ours drop **f(ΔI)** entirely and apply the Tavg/pressure compensation **statically** — no lead-lag on (T−T′), no rate term on OPΔT. | **Two different reasons, and only the first is a design choice.** The ΔI term is the OWNER'S RULING *(2026-08-02: "311: a.")*: a one-node core cannot produce an honest axial offset, and synthesising one would be a fabricated signal presented as an instrument — the thing HR1 and HR9 exist to stop. The **missing τ's are a PERMANENT gap, not a pending fetch** — this row used to say their values "are in WTSM 12.2 (ML11223A301), which could not be fetched", and **ML11223A301 has been read since (2026-08-03) and that was wrong on both halves**. The document names τ₁/τ₂/τ₃ and never values them; Table 12.2-1 lists both setpoints as *"Variable (calculated)"* and K₁–K₆ as *"manually adjusted preset"*. They are plant Tech Spec / COLR numbers, so no amount of fetching that document will produce them, and an invented time constant on a protection channel is worse than a declared absence. **What the primary DOES settle decided #315 §6:** both compensations are on **Tavg** — *"the lead-lag controller for Tavg dynamic compensation"* and *"the rate-lag controller for Tavg dynamic compensation"* — **nothing compensates the measured ΔT**, and the document carries no RTD, thermowell or transport-lag term at all. It calls loop ΔT *"a measure of reactor power"* and reads it directly, which is why this plant's leg split is driven by total core heat rather than by the lagging fuel→coolant flux. The cost is real and is not hidden: OTΔT **responds to** a fast Tavg ramp where the real one **anticipates** it. OTΔT is also one channel, not 2/4 — consistent with §8.11 and with the low-flow trip. | ~~Fetch ML11223A301~~ — done, and it does not carry the numbers. Adding τ₁/τ₂ lead-lag and OPΔT's rate term now needs a **plant-specific Tech Spec / COLR** source for the τ values, or it does not happen. K₁-equivalent and K₄ can still be re-checked against the document's equation form. ΔI stays out until the core is nodalised axially. |

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

v1's job is to prove the concept thoroughly: three real reactor types, each behaving correctly — the
couplings between their components legible and demonstrable (`DESIGN_CRITERIA.md` §6.3) — each
hosting its famous accident faithfully, with the instrument layer (HR1) modelled honestly enough
that those accidents reproduce, wrapped in an interface that teaches both beginners and
enthusiasts. Everything deferred here is an extension of a system that v1 establishes. **Build the
core completely and well; resist the pull to build outward before the core is solid.** The deferred
items will be far easier to add to a finished, coherent v1 than to a v1 that tried to do everything
at once and finished none of it.
