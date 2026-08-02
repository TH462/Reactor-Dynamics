# Changelog

All notable, user-visible changes to Reactor Dynamics are logged here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/); newest entries on top.

For the dense engineering rationale behind each change (spec deviations, tuning, gate
tallies) see `Blueprint/BUILD_DECISIONS.md` — this file is the skimmable summary.

> **Releasing:** at each `develop` → `main` merge, rename the `## [Unreleased]` heading
> below to the version being shipped (`## [Alpha X.Y.Z] — YYYY-MM-DD`) and open a fresh
> empty `## [Unreleased]` above it. The version must match the top entry of
> `changelog.html` and the string in `site/release.js`.
>
> **`node test/run_release.js` enforces that** (2026-07-31). This paragraph on its own did not:
> the roll was skipped for **Alpha 1.10.0 and again for 1.11.0**, and 434 lines covering two
> shipped releases sat below as unreleased while the newest version heading here read 1.9.0.
> It survives being skipped because nothing downstream reads these headings — the file renders
> and reads plausibly either way — and it compounds, because once two releases are merged into
> one block the boundaries can only be recovered by diffing this file at each tag. Which is
> what it took.

## [Unreleased]

### Changed
- **HR12 now covers control behaviour, and half of it is gated** *(OWNER RULING, 2026-08-01:
  "go with your recommendation.", on the recommendation to widen HR12 by one clause and add one
  narrow check rather than write an eleventh Hard Rule)*. Three times in two days a chapter
  asserted control behaviour that `Manuals/03` — the control inventory, which owns it — already
  had right: #303's *"selecting a load mode does not close the breaker"* (there is no breaker;
  `isOnLine()` is `load_mode !== 'disconnected'`), #304's *"shutdown bank … read-only to
  operator"* (it has Withdraw / Insert on the board and 03 §3.3 documents the full stroke), and
  #304's *"Follow (default)"* (the shipped lineup is MANUAL).

  **The diagnosis is what set the fix.** None of those was a skipped verification step — they
  were claims never *classified* as needing verification, because **HR12 read "an assertion about
  plant dynamics"** and its examples are all dynamics. A control-semantics claim felt like recall.
  So the rule's SCOPE was the hole, not compliance with it: HR12 is now *"about plant dynamics
  **or control behaviour**"*, which keeps the binding count at ten and respects the 2026-07-27
  ruling that this repo already has too many instructions. **Adding an eleventh rule was
  considered and rejected on evidence** — roughly eight "verify this" instructions were already
  loaded in context when #303 shipped, including HR12, HR10 and CLAUDE.md's own *"Verify a claim
  before you act on it"*.

  **`run_manual_controls.js` gains an inoperable-claim scan**: a manual may not call a named
  board control read-only / not operable / display-only while `pwr_board_wiring.js` gives it a
  press or hold handler. New `PwrBoardDriver.pressableIds()` reports the ~47 worked items
  (entries carrying only `active`/`warn`/`badge` are indication, not controls), and
  `PwrBoardInspect.parentOf` walks a button up to the card its label points at.

  **Three things learned building it, two of them only because it was injection-tested.**
  (1) **The first cut stayed GREEN on the real #304 text.** `CONTROL_LABEL_MAP` holds
  `Shutdown Bank`; the manual writes `Shutdown bank`; the match was case-sensitive. Reading the
  check would never have shown that — re-injecting the defect did.
  (2) **Case-insensitivity then produced a false positive**, and the fix is principled rather
  than a denylist: the map deliberately points several names at one card (`Mode`, `Load`,
  `Turbine Load`, `Main Breaker` are all the generator card) and the one-word ones are ordinary
  English here — matching `Mode` fires on *"Training display only; does not change plant MODE"*.
  A single-word label is now skipped **when a longer label shares its card**, which keeps
  `Turbine Load` and `Shutdown Bank`, drops `Mode`/`Load`/`Boron`/`Nudge`/`NIS`/`HPI`, keeps
  unambiguous singletons like `MSIV` and `SCRAM`, and is self-maintaining. 25 of 52 labels
  scanned. (3) The check's own local `D` **shadowed the dim-colour constant**, so its header
  printed a driver object.

  **Scope is deliberately narrow, and the limit is written into HR12 rather than left implied:**
  only the NEGATIVE claim is decidable. *"This control cannot be operated"* checks against the
  wiring; *"this control does X"* does not — #303's invented breaker would still get past it.
  Injection-verified both ways: the real #304 line fails exactly one check and nothing else;
  restored, 94/94.

  Gates: all **35 runners at baseline**, `board_check` **168/168** unchanged.

### Fixed
- **Turbine art froze on trip while the RPM readout coasted.** Blade/winding scroll is driven by
  `turbine_rpm` (not steam demand alone), so a trip or generator OFF shows the ~40 s coastdown
  instead of stopping the frame instantly. Steam fill/ports still track admission.

### Changed
- **Instructor minimize + right-column chrome tidy.** Explicit **−** minimize on the instructor
  header (top-right of the title row); Checklists picker moved from under the instructor card into
  **Operate**; **Contact** moved under Settings → About (duplicate "About" row label removed).

### Fixed
- **01's numbers were all right and five of its control claims were wrong** (#304, review of
  `Manuals/01_GENERAL_DESCRIPTION.md`; manual set **Rev 9 → Rev 10**). Measured full stack, every
  row of the §2.0 parameter table lands — 100.0 MWe, 2235 psi (15.41 MPa), Tavg 579.3 °F
  (304.1 °C), hot/cold leg **609.0 / 549.6 °F (320.6 / 287.6 °C)** with ΔT exactly **59.4 °F
  (33 °C)**, PZR 55.00 %, SG 65.00 %, steam **819.5 psi (5.65 MPa)**, subcooling 73.75 °F
  (40.97 °C) — as do both ratings, the ~7 % decay heat and the no-natural-circulation claim.
  `PWR-X01` resolves too (it is defined in **08** §6.0, not in 04's N/T/E index).

  **Every defect was a control-surface claim that `03` already documented correctly**, which is
  the same failure as #303's N05 caution and makes three in two days. (1) §4.1 called the
  **shutdown bank "read-only to operator"** and SCRAM-only. It is a full operator control —
  Withdraw / Insert on the board (`pwr_board_wiring.js:438-439`), the `Shutdown Bank` control
  label, a `SHUTDOWN_DRIVE` group in `ui/app.js` — and **03** §3.3 describes its full-stroke
  behaviour and cautions against parking it in at power. **PWR-N02 step 7** asks the operator to
  confirm its position precisely because it can be moved. (2) §6.0 called **Follow the default**
  load mode; measured, `getStartupLineup` puts `hot_full_power` and `50_percent` in **MANUAL**,
  which is what 03 §12.1 and the startup checklist both say the board hands you. Follow is the
  bare-engine fallback. (3) §6.0's **coupled-feedwater** rows describe a state that lasts under
  three plant-minutes — measured, `feed_auto_coupled` is true at t=0 and false by 3 min, because
  the three-element `feed_sg` channel is `defaultOn` and takes SG level as soon as it acts. That
  is the engine-direct-vs-full-stack trap appearing in the manual rather than in a test.
  (4) §5.0 defined **Mode 3 as "RCS hot at NOP T/P"** when the trainer decides Modes 3/4/5 by
  **temperature alone**; the table now carries the real boundaries — **199.4 °F (93 °C)** and
  **350.6 °F (177 °C)** — with a note that pressure is not part of the definition. (5) §5.0's
  Mode 1 row omitted **`5_percent`**, which measures Mode 1 at 6.00 %.

  Also tightened: §4.3 described the **steam dump** as load-rejection-only, omitting the
  continuous AUTO pressure mode that heatup, cooldown and hot standby all run on; §6.0's
  Disconnected row conflated a **planned offline with a turbine trip** (#230 — two events, one
  lamp); and §8.0's *"the simulation ends at fuel damage"* now says what actually ends there —
  **consequences**, not the model, which simulates cladding failure at 2192 °F (1200 °C) and melt
  at 5072 °F (2800 °C) across ten green meltdown paths.

  Gates: all **35 runners at baseline**; `run_manual_units` 0 failed, `run_manual_rev` 13/13 at
  Rev 10, `run_procdocs` 23/23, `run_manual_controls` 94/94.

### Fixed
- **The documented startup path did not join up — PWR-N01 hands PWR-N03 a plant it cannot
  start** (#303, review of `Manuals/04`; manual set **Rev 8 → Rev 9**). The pump-heat heatup
  arrives at **856.8 ppm** and nothing in the path dilutes, but PWR-N02 and PWR-N03 both
  assumed **~683 ppm** — which is the *shortcut* `hot_zero_power` lineup, not the heatup's own
  arrival. **Measured full stack:** from the N01 end state the control bank reaches 456 steps
  still at ρ = −794 pcm and goes critical near **561 steps**, against the **319** N03 states —
  **242 steps / ~1830 pcm outside** the ±750 pcm acceptance band 09 §7.5.1 tells you to stop
  and re-work the estimate at. Nothing caught it because the two legs are only ever exercised
  separately: `pwr_heatup` starts cold and `pwr_startup` starts at `hot_zero_power`, so no
  gate has ever crossed the seam.

  **The fix is a dilution step, not a moved initial condition** *(OWNER DIRECTIVE, 2026-08-01:
  "Add the dilute step in n02", refined moments later to "In n02/n03.")*. New **PWR-N02 step
  15** works the ECC and adjusts boron to it — measured, 857 → 683 ppm takes ~58 plant-minutes
  at the ~3 ppm/min make-up rate and lands ρ = −1006 pcm; the bank at 319 steps then reads
  **ρ = −2.3 pcm**, critical on the reference position. Moving the boron the other way, at the
  end of the heatup, would have been less writing and would have taught a **cold dilution** —
  the one thing 09 §7.5.1 spends a WARNING forbidding, since critical boron with the bank in is
  806 ppm cold against 588 ppm hot. N02 step 8 now *samples and records* boron as the ECC input
  instead of asserting a figure, and N03's 683 ppm / 319 step / 1/M burst sizes are labelled
  **the worked example for one boron**.

  **Five more defects in the same chapter, all measured.** (1) **N01 aligned the SI
  accumulators after the LCO deadline it cites** — step 7 followed a step whose acceptance is
  P > 2176 psi, while the compliant 600–1000 psi window is only **~100 s wide** (600 psi at
  +24 s from the Pressure SP command, 1000 psi at +122 s, NOP at +3.5 min); the alignment is
  now an action *inside* the pressurization, here and in 05 Phase A and the executable
  checklist. (2) **PWR-N05 is named for synchronizing the generator and had no step that did it.**
  The first fix was wrong and is corrected here: it asserted that selecting a load mode does
  not close the breaker. **There is no breaker in the engine** — `RD.LoadMode.isOnLine()` is
  `load_mode !== 'disconnected'`, so on/off line *is* the selector, and the board's FOLLOW and
  MAN both route through `connect_grid` (which also clears a prior trip). N05 now matches
  **03** §12.1: FOLLOW takes the machine from at-rest to synchronized and loaded in one action
  (measured, 1800 rpm and 5.26 MWe matched on a 4.7 % plant), and a slider move will not
  recover a tripped machine (measured after a scram: 0 rpm, 0 MWe, trip still latched). A new
  **scope note** records the real gap — this plant has **no turbine roll and no no-load speed
  hold**, so the roll-and-synchroscope skill the procedure is named for is not modelled.
  (3) **PWR-N15 never blocked SI** — the cooldown crosses the 1798 psi (12.4 MPa) actuation
  setpoint, and measured with SI armed the pumps inject, boron ends at **2500 ppm** instead of
  857, and the plant cools **~10× faster than programmed** (566.6 → 199.4 °F in 23
  plant-minutes); new step 1a. (4) Three stale numbers: the 5 % steam-dump demand reverses the
  heatup at **−263 °F/hr (−146 °C/hr)**, not −83 — a figure inconsistent with its own sentence,
  since 9× a +32.7 °F/hr heatup is ≈ −260 — and below ~219 °F it only *arrests* the climb; NOP
  arrives in **~3.5 plant-minutes**, not ~20; and the milestone row calling 350 °F "Mode 4 /
  Mode 3 entry" was wrong about Mode 4, whose boundary is **199.4 °F (93 °C)**, reached at ~18
  plant-minutes. (5) **05 Phase A carried a stale −3377 pcm / 907 ppm heatup endpoint**
  predating the second moderator re-fit, contradicting N01's own correct figures.

  **N15's performance table is now MEASURED with its cadence stated**, which is what made the
  old one unfalsifiable: accumulators isolated **1.9 h**, RHR placed **3.05 h**, Mode 5
  **5.0 h**, ending on the `cold_shutdown` IC exactly — at a programmed −90 °F/hr with 63 °F of
  subcooling held and the RHR HX split trimmed to the ramp. Two traps went in with it. **Step 2
  is a ramp, not a chase**: walking the setpoints to track *present* Tavg in ~1-minute steps
  gives a 55 psi error against a 36 psi proportional band, the dump saturates and the plant
  free-falls — measured, 566.6 → 199.4 °F in **six plant-minutes**. And **the ~90 °F/hr cooldown
  limit is now marked UNVERIFIED** in the procedure and the references table: no source for a
  real-plant cooldown rate exists anywhere in this manual set and the previous "commercial
  class" wording was recall, which the evidence-pass SOP does not accept.

  Gates: all **35 runners at baseline**; `run_manual_units` 0 failed (334 pairs),
  `run_manual_rev` 13/13 at Rev 9, `run_procdocs` 23/23, `run_manual_controls` 94/94.
  **Still open:** 9 of the 15 normal procedures have no executable checklist (N02–N06, N09,
  N11, N13, **N15**) — authoring one is a feature and belongs with #244 / #254.

### Added
- **The PWR board reads SI now — the Settings units toggle works on it** (#238)
  *(OWNER RULING, 2026-08-01: selected "m³/h" from three options put to him for the SI flow
  unit — m³/h, L/min and kg/s. A selection, not verbatim words.)* The board was authored in
  US customary at every readout, so #237 had to **disable the SI position while the PWR was
  active**: a global SI selection put SI chart chips beside US board readouts, the one
  indefensible state. Both halves move together now.

  The board driver has a **display-unit layer** — one table of unit families
  (`UNIT_FAMILIES` in `ui/diagram/board/pwr_board_wiring.js`), each declaring per mode its
  conversion, unit string, display decimals, ▲▼ step and band quantum — and everything that
  shows a number goes through it: **19 readouts**, the **6 vital tiles** (reading, unit,
  decimals AND band edges) and all **5 unit-bearing setpoint boxes** (value, unit span,
  decimals, step, valid range and range hint). `ui/app.js` passes `ctx.units` as an
  **accessor**, so a units change is a re-render, not a remount.

  Four things worth knowing.

  **US mode is unchanged by construction, and that is measured rather than asserted.** Every
  US entry reproduces the arithmetic and the rounding that was inline before, and the unit
  STRING in US comes from the authored item rather than from the table — so the board's three
  spelling quirks (`F` not `°F`, `GPM` uppercase on two items, `psig` on the accumulator)
  survive, and switching back restores them. `board_check` renders **166 items** identically
  before and after a round trip through SI, and its pre-existing check list is byte-identical
  to the pre-change run.

  **The band QUANTUM had to become per-unit, and the first cut of the new checks did not
  catch it.** Tile band edges are rounded so the strip does not flicker at the render rate,
  and the quantum was a whole display unit — fine at 1 psi, catastrophic at 1 MPa, which is
  145 of them: the pressurizer's 15.20–15.76 control band and its 14.82/15.86 alarms all
  collapse onto 15 and 16. Pressure quantises at **0.01 MPa**, temperature at **0.5 °C**.
  Injecting the whole-unit quantum left every new check green, so one more was added that
  asserts the seven regions stay nested — the coverage claim was worth more than the fix.

  **Tile DECIMALS are a property of the unit, not of the instrument.** The measured sigma is
  0.56 psi and 0.0039 MPa — the same noise — and it wants 0 decimals in one and 2 in the
  other. Same for the charging box: 0–60 gpm becomes 0–13.6 m³/h, where a whole-unit ▲▼ would
  nudge 4.4 gpm, so it gets 1 decimal and a 0.1 step.

  **The unit trap is in here too.** Subcooling margin and leg ΔT are temperature
  DIFFERENCES: 41 °C is 73.8 °F, not 105.8, and the absolute rule reads as a *healthier*
  margin than the plant has. That is what `run_manual_units` gates in prose; the board can
  make the same error, and two checks now say it does not.

  Also: the dump-setpoint **range hint is derived from the bounds** in SI so it cannot drift
  from them (US keeps its authored string, including its known 29-vs-30 psi off-by-one — a
  board-data defect, not this layer's to fix), and the TRIP BLOCKS popover's `1800 psi`
  caption reads the protection table instead of a hand-copied literal.

  `board_check` **143 → 162** (+19; **18 new units checks, all injection-verified** against
  seven separate faults — an absolute conversion on a difference, a missing inverse on
  command, a one-way unit write, a dead unit span, a unit-blind quantum, unit-blind decimals,
  and the seam itself removed). It is not in `run_all`; run it after any board change. Its
  own ctx also stopped lying: it passed `unit: 'si'`, a string nothing has ever read, so it
  claimed to test SI and rendered US for its whole life.

### Fixed
- **`board_check` had a red nobody had run** — 1 failure / 143 while CLAUDE.md claimed
  143/143. Two independent harness bugs, both pre-existing, neither a plant defect. The
  TRIP BLOCKS check **unblocked `ir_high` at full power and never put it back**: the IR
  channel reads 2.0e-3 against a 1.67e-3 setpoint, so the trip condition is standing and the
  block is the only thing holding it off — the plant scrammed immediately and every check
  below ran on a dead reactor at ~3 % power. And the **SCRAM two-step ran on an already-
  scrammed plant**, where the same two clicks are the #75 RESET half, so it un-scrammed the
  reactor and then asserted a scram. The plant was correct at every step. Now **149/149**.
- **Mode 4 alarm behaviour was tested nowhere** (#294). `COLD_MODES = [4, 5]` in
  `layers/control/pwr_control.js` gates six alarm behaviours — the #287 RHR alarm's
  `condition`, plus four reclassify rules that turn expected cold-plant indications into
  `status` instead of leaving them as warnings. Every existing probe exercised **Mode 5
  only**. Measured by injection: narrowing it to `[5]` left `run_m4`, `run_pwr`, `run_ops`,
  `run_contract`, `run_reachability` and `run_hardrules` **all green** at 185/240/351/139/58/75
  — the Mode 4 half could have been deleted outright without a gate objecting.
  - **What it suppresses is not cosmetic.** On a correctly depressurized cold plant the
    injected form raises a spurious **CRITICAL** (`pzr_pressure_lolo`) — a casualty alarm on
    a plant depressurized exactly as the procedure intends — plus three spurious warnings,
    **and loses `rhr_not_aligned` (06 PWR-A33) entirely**, the one alarm carrying real news,
    because its condition stops matching.
  - **Three of the five deltas are priority-only**, on alarms that still appear either way.
    A presence check cannot see those, so the probe asserts the priority.
  - **Mode 4 is where a plant spends most of a cooldown from power**, and where the #287
    sequence actually lands (measured: that cooldown ends Mode 4 at 147.5 °C / 297 °F,
    280 psi / 1.93 MPa). The existing #287 probe reaches its loss with an operator
    `set_rhr active:false` in Mode 5; the new one reaches Mode 4 the way the plant really
    does — **losing the heat sink and heating on decay + pump heat**, Mode 4 at 1000 sim s
    for about a second of wall — so the mechanism under test is the engine's, not the
    probe's, and no temperature is hand-set.
  - No behaviour changed: the plant was already correct. `run_m4` **33/33 (185) → 34/34
    (194)**; 5 checks red on the injected config.

- **A load rejection no longer scrams the plant on the going-solid trip** (#289)
  *(OWNER RULING, 2026-08-01: selected "Add the program ceiling" from the options put to
  him — a selection, not a verbatim instruction)*. The pressurizer **level program had no
  maximum**. It is `55 % + 2.5 %/°C × (Tavg − 304.1 °C)`, and with rod control in **manual** —
  the shipped free-play lineup — the core can only run back on the moderator coefficient,
  which *requires* Tavg to rise. Tavg parked at **319.6–321.3 °C (607.3–610.3 °F)**, the
  program followed it to **~94 %**, and the plant tripped on the **97 %** going-solid
  reactor trip **with inventory correct** — `pzr_level_dev` was **negative**, i.e. the
  pressurizer was holding *less* water than its own program demanded. The trip that exists
  to catch an overfill was being fired by the control program.

  Measured, free-play lineup, `hot_full_power`, load ask at t+60 s, six instrument-noise
  seeds: a **6–11 MWe** ask scrammed **6/6 seeds**, 5 MWe scrammed **1/6** (decided by
  noise), while **0 MWe and 12 MWe did not scram at all** — a *smaller* load rejection
  tripping when a larger one did not. After the fix: **0 trips in 42 runs**, peak level
  89.7–95.1 % against the 97 % trip.

  The program is now clamped at both ends via a new `level_prog_ceiling` (**61.5 %**) and a
  single `pwrPressurizer.levelProgram()` that the CVCS setpoint and the deviation gauge both
  read. Physics (`levelBase`) is deliberately **not** clamped — the coolant really does
  expand, and the resulting level-above-program is exactly what the CVCS is meant to let
  down. Sourced to **WTSM 10.3 Pressurizer Level Control System (ML11223A290)**: *"both
  minimum and maximum level limitations are placed on the level program"* (low 25 %, high
  61.5 %), whose stated purpose is our exact case — *"low enough to ensure that the
  pressurizer does not go solid following a turbine trip from 100% power … assuming no
  operator action and **no response by the automatic control systems (the rod control and
  steam dump control systems)**."*

  `pzr_level_dev` now reads against the **program**, not the physics line: it peaks at
  **+29.3 %** on the insurge and decays to ~0 as make-up lets down. Reading the physics line
  would have pegged `PZR LVL DEV LO` at ~−39 % for the whole transient while the controller
  sat exactly on setpoint. All **35 runners at baseline**; no baseline moved.

  Two things this does **not** fix, both deliberate. The **SG code safeties still pass steam**
  in the 0–5 MWe band — that is the rods-in-manual consequence #289 was filed on, and whether
  `rods_tavg` belongs in the free-play lineup is still open (auto rod control already exists
  and is reachable: **ROD AUTO** on the board, `board_check`-pinned, Manuals 02/03/04). And
  the going-solid trip is still **97 %, single channel, with no power permissive**, where the
  real one is **92 %, 2/3, P-7 gated (≥10 % power)** — aligning it only makes sense after
  this ceiling, since 92 alone is *lower* and would scram more.

- **HR11's guard checked one of the two markers the repo uses** (#290). `run_hardrules.js`
  requires every ruling citation to carry a date *and* the owner's verbatim words —
  otherwise it is indistinguishable from an agent's own preference in authoritative voice.
  It matched the literal string `OWNER RULING`. The repo also uses **`OWNER DIRECTIVE`**, and
  all eleven in-scope occurrences were unguarded: *never merge into `develop`*, *never push
  the lanes*, the brevity and STILL OUTSTANDING directives, and the US-customary-units rule
  among them. One (`CLAUDE.md`'s `status-owner-review` / `status-work-next` labels) was
  already malformed — a quote with no date — and nothing said so.
  - **A second, quieter defect the issue had not found.** The skip for prose *about* the
    marker was ``/`[^`]*OWNER RULING[^`]*`/``. That also matches when the marker merely sits
    **between** two inline code spans, because the `[^`]*` gap is the text after one span
    closes and before the next opens — which in this repo's heavily backticked prose is the
    normal case. Measured: **four genuine citations silently skipped**, three `OWNER RULING`
    (`RETIRED.md`'s retirement of the ship-review plan, `TUNING_LOG.md`'s *"249 - fit it."*,
    `CLAUDE.md`'s steam-dump 40 %) and the US-customary-units directive. Worse than the
    filed defect: an unmatched marker at least *looks* unmatched, whereas these read as
    checked. The gate now tests the marker's own backtick parity — odd means genuinely
    inside a span — and still excludes the three real `` `OWNER RULING` `` prose mentions.
    Backtick **runs**, per CommonMark, not individual backticks: a run of N opens a span only
    a run of exactly N closes. Counting singly was a third wrong answer, and this changelog
    entry is what exposed it — quoting the old regex puts the marker inside a *double*-
    backtick span, parity read even, and the gate flagged the paragraph explaining itself.
  - **The lookahead window is bounded on both sides now.** It existed because a citation
    routinely wraps its date onto the next line, but it accepted *any* quote mark within
    three lines, so `release-to-main/SKILL.md`'s date-only citation passed by borrowing the
    quote from the sentence after it. The window now stops where the citation's own
    parenthetical closes. **Two wrong versions of that rule measured green first**: counting
    depth from the marker sees the opening `(` behind it and reddens all nine legitimately
    wrapped citations, and counting *absolute* depth never fires on a nested citation — so
    deleting the date from `CLAUDE.md`'s steam-dump ruling, which sits inside
    `(41 -> 42 on 2026-07-31: ...)`, changed nothing. Depth **relative to the marker** holds.
  - **Scope widened to `.claude/skills/`.** Skill files cite rulings as authority exactly as
    the docs do, and being outside the scanned list is why the malformed citation there
    survived a gate believed to cover it.
  - **Both malformed citations repaired**, neither invented: `CLAUDE.md`'s date is in its own
    lead-in sentence, and `SKILL.md`'s missing quote is recorded in full at `CLAUDE.md`'s
    versioning section.
  - **Injection-verified against the pre-fix runner**, per the standing rule that a check
    written beside its own fix proves nothing. Three malformations — an `OWNER DIRECTIVE`
    losing its date, a backtick-flanked `OWNER RULING` losing its date, and the `SKILL.md`
    citation losing its quote — each redden exactly one site now, and the pre-fix gate stayed
    green at **43 sites / 0 undeclared** through all three.
  - `run_hardrules` **58 → 75 checks** (HR11 43 → 60 sites: **+11** widened marker, **+4**
    corrected span test, **+2** new scope). **This is not the usual write-up drift** that
    moves this runner on every merge — no ruling was added; the guard grew to cover markers
    that were always there.

### Changed

- **The trend graphs open on a real 30 minutes, not a flat line** *(OWNER, 2026-08-01: "when
  you make preset starts, run them for 30 minutes to fill up the graph with real data before
  saving")*. A preset start seeded the chart's 30-minute record window with **360 identical
  samples**, so a fresh plant showed a ruler-straight trace where a running plant shows
  instrument texture. It now seeds flat instantly and swaps in a genuinely-run trace computed
  in background slices, cached per plant + design version + initial state for the session.

  **Flat-first is deliberate**: a 30-plant-minute full-stack run measures **1874 ms**, and a
  fresh chart buffer happens on boot, reset, plant switch *and* every mission start — paying
  that synchronously would freeze all four. Slices are 40 ticks (~42 ms) rather than 120
  (~125 ms), which is the difference between smooth and visibly janky.

  **What it does not do**: change the *shape*. The initial conditions are constructed as true
  steady states, so 30 real minutes is a noisy flat line — measured at `hot_full_power`, power
  99.78–100.2 %, Tavg 304.0–304.2 °C, pzr level 54.6–55.3 %. The gain is instrument texture
  and the genuine slow drifts (xenon, boron) a synthetic seed cannot have.

  Guarded by a new `verify_e2e_ui` section. A/B on the real page: with the swap the busiest
  plotted series has **28 distinct y-values** across its 61 points; with the call neutered,
  **exactly 1**. Injection-verified — the gate fails with that number in the message.

- **Rod control starts in AUTO** (#289) *(OWNER RULING, 2026-08-01: "Let's start the rods in
  auto. Might as well, everything else starts in auto.")*. `rods_tavg` is `defaultOn` at
  power, joining `boron_conc`, `cvcs_makeup` and `feed_sg` in the free-play lineup. Instructed
  content (`noDefaults`) is unaffected.
  **At-power only, and that half is measured, not decorative.** A blanket default engages the
  channel in Mode 5 and during `pwr_heatup`, where Tavg is hundreds of degrees below the
  no-load Tref the load program asks for — so the channel withdraws rods to close the error
  and takes the plant critical. `pwr_heatup` **scrammed at step 6 on `source_range high`** and
  `run_behavior` SS-9 tripped the same way. Gated on the **power-range instrument** above
  10 % (the P-10 analogue) it costs neither. The first cut read `true_state.power_pct` and
  `run_hardrules` failed it — **the same defect class as #220**, where the P-9 permissive read
  the plant instead of the gauge.
  **This completes #289.** With rod control acting, a full load rejection no longer parks the
  plant at 46 % with the dump saturated and the SG code safeties passing to atmosphere
  indefinitely: the dump reaches its 40 % stop, comes back off it, the safeties reseat, the
  core is run back and Tavg returns to the no-load anchor. Relief still *occurs* briefly on a
  full rejection — prototypical, since a real Westinghouse plant's design case is the 50 %
  loss of load — but it no longer **persists**, which was the filed defect.
- **The ROD AUTO button lights green like every other AUTO control** *(OWNER, 2026-08-01:
  "the auto rod button doesn't follow the color convention. Auto on it should be green not
  white.")*. It was authored `#9fb3c4` (pale grey) against `#5aad7c` on all **8** other AUTO
  buttons — and the board uses the authored item colour *as* the lit colour, so the mismatch
  was invisible until the control was engaged. It now comes up engaged on every Mode 1 start,
  so it is lit every session. Applied via `DOC_PATCHES` (re-export-safe, idempotent) and
  pinned two ways in `board_check`: the patched value, and the **convention itself**, so a
  re-export that recolours any AUTO button fails instead of shipping two meanings for green.

- **The RHR suction valve has two interlock setpoints now, not one** (#288)
  *(OWNER RULING, 2026-07-31: "issue 288, split them.")*. One config constant,
  `rhr_valve_interlock_mpa`, was doing two different jobs: blocking the valve **open** and
  forcing it **closed** on repressurization. The deadband between them was therefore
  **zero**, and the valve chattered across a single boundary. The autoclose now runs off a
  new **600 psi (4.14 MPa)** `rhr_autoclose_mpa`, about 200 psi (1.38 MPa) above the
  **unchanged** 400 psi (2.76 MPa) block-open permissive.
  - **Both setpoints are sourced.** NUREG-0933 Issue 99, *"RCS/RHR Suction Line Valve
    Interlock on PWRs"* (Rev. 3): *"Two basic features are incorporated in the interlock
    design: (1) an automatic closure signal on high RCS pressure (typically 600 psig), and
    (2) a block of the manual open signal at a lower RCS pressure (typically 425 psig)."*
    The Westinghouse Technology Systems Manual §5.1 (ADAMS **ML11223A219**) gives the same
    structure for valves 8701/8702 — 425 psig open block, ~585 psig autoclose.
  - **What it fixes for the player.** Paired with the one-shot entry permissive kept by
    #287, the first chatter was **permanent**. Measured engine-direct from the
    `cold_shutdown` IC: before the split, *every* rebound above 400 psi shed the valve —
    including the **409 psi (2.82 MPa)** case #287 documents, a cooldown whose own
    pressure-control setpoint sat nine psi over the interlock. After it, rebounds to 409 /
    435 / 508 / 580 / 595 psi all hold, and the valve lets go between 595 and 609 psi — its
    setpoint. Losing RHR now takes a genuine excursion, not a hunt. **Heatup is
    unaffected**: RHR isolates 6 s later, at 605 psi instead of 413 psi, Tavg unmoved
    (122 → 124 °F).
  - The open permissive was deliberately **not** moved to widen the band: 400 psi is what
    `04`, `05`, `09` and the campaign all quote, and it is inside the sourced range for a
    block-open setpoint. The autoclosure was deliberately **not** removed either, though
    GI-99's resolution called removal *"recommended, but not required"* — that is a
    licensee's design decision, and this plant's is pinned by `rhr_valve_and_mode`.
  - Manuals **Rev 25**: `09` gained a **§ RHR** note carrying both setpoints and the
    sources; `03 §11.2`, `04` (×2), `06 PWR-A33` (three rows) and `12 §6.4 / §14` updated.
  - `run_pwr` **237 → 240 checks**. Injection-verified both ways: pointing the autoclose
    back at the open permissive reddens the load-bearing deadband check, and deleting
    `rhr_autoclose_mpa` outright reddens four.

### Added
- **Losing shutdown cooling now annunciates — `RHR NOT IN SERVICE` (06 PWR-A33)** (#287)
  *(OWNER RULING, 2026-07-31: "Keep it and enunciate")*. The RHR auto-entry permissive is
  **one-shot** — it fires on the first crossing below 400 psi (2.76 MPa) and never re-arms —
  while the engine **auto-closes** the suction valve on any repressurization back above the
  interlock. Both halves are right on their own, and a real plant re-opens that valve
  deliberately rather than automatically, so the permissive **stays one-shot**; what was
  missing was any indication that RHR had gone. Measured before this: a cooldown whose
  pressure-control setpoint sat just above the interlock finished **scrammed at 283 psi
  (1.95 MPa), below the entry pressure, with the arm still in AUTO, its permissive condition
  still true and RHR shut** — the only board tell being the ECCS card quietly reading LPI
  instead of RHR.

  The tile is gated on **Mode 4/5 plus the valve position**. Not on pressure: RHR is correctly
  unaligned through all of Modes 1–3, so a pressure gate would stand in through every cooldown.
  And **not on the reactor-trip latch** — measured, a Mode 5 plant reads `rps_scrammed = false`
  because it was never scrammed, it is simply cold, which made the first cut of this alarm
  impossible to raise in the one mode where losing RHR matters most. Alarm `condition` gained
  two generic forms to express it (an array is an AND, a leading `!` negates, and
  `{instrument, in:[…]}` matches the shape the #240 reclassify rules already use); the kernel
  still names no instrument. `run_m4` 32 → 33, manual set **Rev 23**.

### Testing
- **`ops_cooldown_to_rhr` now performs the evolution it is named for.** The probe is titled
  *"hot standby toward RHR entry (400 psi / 2.76 MPa)"* and never got there: its RHR check was
  an `info` line reading `false`, and the check that *named* its 90 °F/hr (50 °C/h) ramp was
  `Tavg after 2 h < 527 °F (275 °C)` — one-sided and landing at **195 °F (90.7 °C)**, so it
  could not detect the plant cooling at **185 °F/hr (103 °C/h)**, double the rate its own
  driver paces to. Three defects behind that, all in the driver rather than the plant: it never
  throttled the **RHR heat exchanger**, which is the cooldown-rate control below the interlock
  (the last 21 minutes ran at 567 °F/hr / 315 °C/h at full HX flow); it never isolated the
  **accumulators** at 1000 psig, so all four dumped into the RCS (#273's signature — boron
  2270 ppm, inventory pinned at 120 %); and its saturation-following pressure setpoint asks for
  **409 psi (2.82 MPa)** at the temperature RHR comes in, *above* the 400 psi interlock. Now:
  rate held at exactly 50 °C/h, RHR aligns at 103 min and stays aligned, accumulators isolated
  at 51 min, boron **623 ppm**, inventory **100.0 %**. Six info lines became real checks, all
  verified red by injection; `run_ops` 344 → 350 passed with the failure count unmoved at 12.
- **#154's remaining coverage gaps closed — sixteen kernel, service, instructor and engine
  surfaces that shipped with no assertion at all.** The omnibus was re-verified first, and
  about half of it was already dead (all five TMI-2 Part-3 endings, the follow-mode
  save/restore branch, cold-init trip blocks, the PORV block valve, most of the "missing ops
  evolutions"). One filed item was **stale in the other direction**: the RHR 400 psi
  (2.76 MPa) interlock is fully covered in `run_pwr` — refuse above, open below, autoclose on
  repressurization — it is only the *ops probe* that never issues `set_rhr`.

  What was actually missing, now closed:

  - **M4 kernel** (`run_m4` 28 → 32): actuation **`reset_below`** — a comment recorded the
    shipped PORV-flapping inversion and nothing pinned the fix; numeric **`override_value`**
    interception, used by five PWR failures with the intercepted-command path never once
    observed; interception **precedence** (first-injected wins, and the probe distinguishes
    that from last-wins rather than merely detecting *an* override); and
    **`acknowledge_all_alarms`**, previously asserted only as "the instructor gate does not
    block it".
  - **M5 / M6** (`run_m5` 19 → 22, `run_m6` 17 → 18): the **`_rewindCursor`** walk-back that
    stops consecutive rewinds restoring the same checkpoint for ever; world rewind
    **`exact`** at service level, where its semantics live (it was covered only end-to-end in
    the browser gate); **`save_state` as a command**, whose dispatch line had no caller; and
    the chat transcript's **story clock**, **time-skip divider** and **`CHAT_LOG_CAP`** ring.
  - **PWR engine** (`run_pwr` 32 → 36): the pressurizer **code safeties** — `s.safety_open`
    had zero references in the entire test tree, so the last mechanical line of primary
    overpressure protection was unproven; **`porv_tailpipe_temp`**, the TMI-2 / Davis-Besse
    tell the flagship scenario teaches, which heats 98 % in two minutes and cools 12 % in the
    same span — that asymmetry *is* the lesson; the TMI-2 **blocked-AFW** device, previously
    only ever asserted false; and the **unknown-command** error path. `save_migration` went
    from **8 to 20** of the 29 fields `_migrateState` defaults, including the `rcp_secured`
    inference (#240) — the one judgement call in the migration, unasserted in both directions.
  - **Casualty and ops** (`run_meltdown` 9 → 10, `run_ops` 57/68 → 58/69): **MD-10, feed and
    bleed** — MD-6 took the total loss of the secondary heat sink to core damage and nothing
    exercised the *recovery*, so the suite proved only that the plant can be lost that way
    (measured: unmitigated damages at 4040 s peaking at 691 °F (366 °C) Tavg; with the PORV
    open and HPI running, peak fuel 1162 °F (628 °C) and no damage). And
    **`ops_shutdown_dilution`**, the regime that produced the owner's free-play source-range
    trip (#260): every other reactivity probe runs at power, where the subcritical
    multiplication it measures does not exist. Diluting Mode 5 at the tuned 0.05 ppm/s makeup
    rate and walking away, the source-range trip fires at 1248 s with 59 ppm removed.

  Worth carrying from writing them: the code safeties **cannot be reached by a plant
  transient** — the high-pressure reactor trip caps indicated pressure at 2460 psi
  (16.96 MPa), below the 2484 psi (17.13 MPa) pop — so only an ATWS or a failed instrument
  gets there, and the probe drives them directly. Two first drafts also passed for the wrong
  reason: the engine harness emulates M4's protections *including the reseat*, and left on it
  shut the valve inside the measurement window (relief flow read 0 one second after an
  explicit pop).

- **Five automation channels could have been doing nothing, and the gate would still have
  read 24/24** (#286, split out of #154 item 10). `run_autoctl` engaged **seven channels at
  once** and asserted **aggregate** plant state — power, Tavg, pressure, SG level — so any
  band could be held by a channel other than the one under test, and a dead channel hid
  behind its neighbours.

  **Measured**, by neutering the kernel so a channel reports `engaged` and does nothing:
  `cvcs_makeup`, `boron_trim`, `grid_follow`, `boron_conc` and the *engage* half of
  `steam_dump` were each a complete no-op at a green **24/24**. Two of those matter beyond
  the gate: **`boron_conc` is `defaultOn`**, so it is in every free-play preset lineup and
  could have shipped inert; and `steam_dump`'s single incidental red came from a *different
  feature's* test (#228's RPS reset) catching only the scram stand-down, so engaging the
  channel could have done nothing at all.

  Six probes added, each engaging **one** channel plus only what it `requires` and asserting
  what nothing else in the lineup can produce — `cvcs_makeup` holds pressurizer level against
  an open letdown orifice (**54.9 %** vs **22.5 %** dead); `boron_trim` answers rods driven
  past 96 % with a dilute and recovers them to **88.6 %** instead of letting them park at
  **100 %**, out of travel; `boron_conc` lands a 40 ppm Mode 5 batch dose on target and
  *stops* (the totalizer is spent, it is not a servo); `grid_follow` walks turbine demand off
  a pinned **100.0 MWe** ask onto reactor power; `steam_dump` carries a turbine trip at
  **1121 psi (7.73 MPa)** with the code safeties shut, against **1368 psi (9.43 MPa)** and
  safeties lifting when dead; `pzr_pressure` restores **2235 psi (15.41 MPa)** exactly, where
  a dead channel lets the plant drift to **2323 psi (16.02 MPa)**.

  Every check was verified **red by injection** before counting as green. Worth carrying:
  when injecting against a `mode` channel, neuter the **engage direction only** — the rig
  stands every channel down at t=0, and blanking that *disengage* too leaves the plant in
  whatever AUTO the initial condition shipped with, where it holds itself. With both
  directions blanked the `steam_dump` and `pzr_pressure` probes **pass against a dead
  channel**. `run_autoctl` **24 → 30**.
### Changed
- **Dropped the nuclear-from-cold heatup path** (was training-only N01a /
  `pwr_heatup_nuclear`). Not a commercial NOP — heatup is subcritical (**N01**);
  approach to criticality is hot (**N03**).

- **04 Normal Operating Procedures rewritten in commercial NOP format (Rev 1).** Every
  N01–N15 procedure now has purpose / applicability / prerequisites / precautions /
  stepped acceptance / outcome. Heatup and approach aligned to WTSM / NUREG-1431 shape
  and plant-tested checklists. HFP electrical band corrected to **100 MWe**.

- **Manual set revision counter reset to Rev 0.** Pre-public history zeroed; public
  counting starts after go-public. Development rows remain in git.

- **Normal operating procedures renumbered to plant sequence** (manual redesign baseline).
  IDs now follow cold → power → continuous control → cold: **N01** heatup, **N01a** nuclear
  training heatup, **N02** Mode 3 lineup, **N03** approach to criticality; **N04–N15**
  unchanged. **04** regrouped (A/B/C/D) and body reordered. Cross-refs in **02/03/05/06/11**
  and live `manual_ref`s updated. (Former N01/N02/N03/N03a map is in manual Rev 25.)

- **PWR-N01 is the pump-heat heatup; the nuclear path is PWR-N01a** (#255). The live
  checklist `pwr_heatup` was still the 18-step nuclear ride from before pump heat worked.
  It is now the commercial heatup: start the RCPs, confirm the grid off, Feed AUTO, Dump SP
  to the no-load anchor, raise Pressure SP, re-align the SI accumulators, and ride Tavg up
  with **zero rod motion**. The old nuclear sequence is kept as **PWR-N01a** /
  `pwr_heatup_nuclear` for approach-to-criticality and trip-blocking practice. Measured
  full-stack: settles **567.0 °F (297.2 °C)** at **11.3 plant-h**, **ρ = −2828 pcm** on
  **856.8 ppm**, power **3.5e-5 %**. Both procedures green under `run_procedures` and
  `run_procedures_stack`.

- **The steam dump is 40 % of rated steam flow — the real Westinghouse capacity.** It was
  105 %, which meant the plant could swallow a total loss of load without noticing:
  measured, average coolant temperature rose to 305 °C (581 °F) and power held at 97.5 %.
  Nothing was learned from that, and the reactor trip on turbine trip could not be
  demonstrated, only asserted — its whole premise is that the dump *cannot* absorb a
  turbine trip from high power.

  **What you will see now.** A **50 % loss of load** — the case the real capacity is sized
  for — still needs no trip and lifts nothing: the dump goes to its stop and the reactor
  runs itself back about 10 %, which is exactly the division of labour a real plant is
  designed around. Beyond that the dump is at its limit and the plant has to shed the rest
  itself. A **full** load rejection from 100 % still does not scram, but it is an event
  now: the dump saturates, the core runs back to ~46 % on moderator feedback, temperature
  peaks near 608 °F (320 °C), the pressurizer level climbs to within a point and a half of
  its going-solid trip with the level alarm sounding, and the **PORV lifts** as the
  designed backstop. Then you walk it down at your own pace, as before.

  A real plant of this class does not ride out a full rejection either — its design case is
  50 % — so the relief valve doing its job is the plant being honest about where its margins
  end, not a fault. The dump is still lost with the condenser (vacuum, blackout).

  Manuals **01**, **09** and **12** updated (set Rev 23); **12** gains a description of what
  happens past the dump's limit.

### Fixed
- **Isolating main steam trips the turbine even at zero load** (#284 follow-up). The
  `close_msiv` handler decided whether to trip by asking whether the generator was carrying
  **load**, not whether the **breaker** was closed — the same shortcut #284 removed from the
  rotor model, left standing six lines away in a sibling file. Consequence: shut the MSIVs
  while synchronised with the load target at 0 MWe and the turbine did not trip, the breaker
  stayed closed, and #284's rated-speed hold then parked the machine at **1800 rpm with zero
  admission steam** — a generator motoring on the grid. Measured at hot full power, that state
  ran **77 s**, until an unrelated `sg_level low` scram ended it. It now trips on
  `RD.LoadMode.isOnLine`, and the breaker opens with it.

  Cold Modes 3 and 5 are unaffected: they are authored `load_mode: 'disconnected'`, so
  isolating steam on a cold plant still does not trip a turbine that was never on line. The
  one behaviour that changes in the other direction is an MSIV closure in the seconds after
  `disconnect_grid`, while the load is still decaying — the breaker is already open, so the
  turbine is no longer tripped, which is the #230 distinction rather than an exception to it.

  `run_behavior` **TR-1e gains a fifth leg** and the probe count is unmoved at 42.
  Injection-verified against the old predicate: 3 checks red (`turbine_tripped` false,
  `load_mode` manual, 1800 rpm), while the *"no steam past the MSIV"* check stays green — so
  the leg asserts the **trip**, not the valve. A sweep of the whole tree now finds no
  remaining `generator_load` read that decides anything; the only one left is the braking
  torque term in `stepTurbine`, which is what that field is for.
- **The startup and heatup procedures are checked against the board again** (#224). The
  table that pins each procedure step to the control it names had not been updated through
  three rounds of procedure re-authoring — and that table is what the browser gate walks, so
  an unlisted step was not merely unmapped, it was **unverified**. Measured: 17 of the 45
  controlled PWR steps were covered, with the whole of *Plant Heatup* at zero, and the gate
  reported a clean pass over what was left.

  All 45 were then checked against the board's own control vocabulary and **all 45 resolve** —
  no procedure has ever pointed at a control the player cannot reach. Two entries were
  pointing at the wrong step, both from steps having been inserted above them.

  Coverage is now 58 steps and the browser gate runs **174 checks**, up from 84, in about the
  same time as before.

- **A failed power-range channel no longer leaves the P-9 permissive armed** (#220). The
  P-9 interlock — ~50 % power, and the thing that arms the SG hi-hi reactor trip, Reactor
  Trip on Turbine Trip, and the loss-of-main-feed AFW start — was computed from **true**
  reactor power rather than from the nuclear instrument. The real one comes off the NIS
  power-range detectors and nothing else, so ours could not be fooled by the channel it is
  supposed to be reading.

  **Measured** (hot full power, seed 42): with the power-range channel stuck at 40 % and
  the core genuinely at 100 %, a turbine trip still scrammed at **+0.5 s** and an SG
  overfeed still scrammed at **+0.2 s**. It now de-arms: the turbine trip is ridden out on
  the steam dump, and the SG hi-hi still isolates feed and trips the turbine but does not
  scram — the plant trips **59 s later on SG level low**, a real limit rather than an
  anticipated one.

  **Nothing changes with a healthy instrument** — that is the point, and it is why 34 green
  runners never saw it. New probe **TR-1f** fails the channel deliberately, because that is
  the only state in which the difference exists (4 checks red on the old engine).

  A **single** failed channel defeats the permissive here, where a real plant out-votes it
  two-of-four; that follows from the existing no-voting simplification and is now declared
  (`DESIGN_COMPANION` §8.20) rather than implied.

### Changed
- **Four departures from real-plant practice are now written down instead of implied**
  (#220, from the evidence pass against NRC primaries): the steam dump at 105 % of rated
  flow where most Westinghouse units are at 40 % (§8.17); the 1.5 DPM rod-withdrawal block,
  which has no real analog — the 1.0 DPM alarm and the source-range flux trip either side of
  it do (§8.18); the AFW auto-start sitting 3 points above the SG lo-lo trip where the real
  plant uses one signal at one setpoint (§8.19); and P-9 / turbine-trip sensing at status
  level rather than from stop-valve position and autostop oil pressure (§8.20).
- **Board copy: the boron reading.** It said real plants "do not trust an online
  boronometer". The sourced position is narrower — boron is determined by chemistry grab
  sample and titration and tech specs require periodic verification, and while online
  boronometers do exist at some plants, nothing relies on one. Corrected to match.

- **The reactor is protected the same at 3600× as at 1×** (#153). Trips, actuations,
  interlocks and alarms were evaluated exactly **once per broadcast**, so the interval
  between two protection evaluations was `timeAcceleration × broadcastMs` — how well the
  plant was protected depended on which speed button you had pressed.

  **What that cost.** Measured full stack (PWR `50_percent`, `continuous_rod_withdrawal`
  severity 1.0, seed 42): indicated flux sits above its 120 % setpoint for only **8.74 sim
  seconds**. At 1×/10×/60× the plant tripped on `power_range high` at **9.1 s**. At **256×
  and 600× that trip was never evaluated at all** — the plant tripped 16.5 s and 50.9 s
  late on `primary_pressure high`, a slower parameter that merely happened to still be
  above its setpoint when the next evaluation landed, so the board named the wrong cause.
  At **700× and above — including the 3600× the speed selector ships** — nothing fired: one
  evaluation every 360 sim s, a **135.9 %** power excursion beginning and ending inside a
  single broadcast, and `scrammed` still false on the far side of it.

  **The fix.** Protection now runs on a **sim-time cadence** capped at `PROTECTION_DT`
  (0.1 s) inside the substep loop. Measured 1× → 3600×, the scram lands at **9.14 → 9.32 s**,
  always on `power_range high`, with peak power **121.6 → 121.9 %** and peak fuel
  **1012 → 1012 °F (544 → 544 °C)**. **1× is byte-identical** to the old path by
  construction: a 1× broadcast is exactly `PROTECTION_DT`, so the in-loop guard hands that
  evaluation to the existing post-loop call.

  **What this does not change.** The *snapshot* reporting a scram is still one per
  broadcast, and always will be — you cannot render faster than you broadcast. What no
  longer varies is when the plant actually acts. The attention-stop dropout was never a
  substitute: it is computed from the snapshot assembled *after* the cycle has run, so at
  3600× it dropped the clock six plant-minutes after the excursion it was meant to catch.

  Applies to all three plants — the owner lifted the RBMK hold for this fix *(OWNER,
  2026-07-31: "You can fix RBMK too")*. `test/ops_harness.js` moved with it: its
  `evalEvery` was an independent copy of the M5 cadence, and leaving it would have left the
  ops suites certifying a plant no player can produce (the inverse of #209).

  Gates: `run_m5` 83 → **90 checks** (new suite, 5 of its 7 checks red by injection on the
  pre-fix service); `run_ops` 57/68 → **58/68**, the deliberately-red C2 accel-latency probe
  going green because the defect was fixed, not because the test was weakened. All three
  accel probes (PWR, RBMK, BWR) now report identical trip delay at 1× and 256×.
  `run_campaign` 51/51 and `run_procedures_stack` 22/22 are unmoved.

- **A synchronised turbine no longer coasts to a stop, and the MWe gauge now reads the
  turbine instead of the reactor** (#284). Two defects in one file, with one cause: nothing
  in the plant model ever asked what the turbine was *admitted* as opposed to what the core
  *made*.

  **The rotor.** The rated-speed hold was gated on `generator_load > 0` — on the **load**,
  not on the **breaker**. So sliding the Manual load target to **0 MWe while synchronised**
  dropped the machine into the offline coastdown branch: measured, **1800 → 0 rpm over ~5
  plant-minutes**, with `turbine_tripped` false, `load_mode` still `manual`, and the breaker
  never opened. A synchronous machine tied to the grid spins at rated at any load, including
  zero — it motors rather than decelerates. The test is now the breaker
  (`RD.LoadMode.isOnLine`, new and shared), so the on-line case holds 1800 rpm and the
  offline case is untouched. That matters: the coastdown branch is load-bearing for **#235**,
  where cold Modes 3/5 spawn untripped with no load and no steam and used to pin 1800 rpm on
  a cold plant. Those ICs are authored `disconnected`, so they keep the coastdown and #235
  stays fixed — pinned from both sides by the new probe.

  **The gauge.** `mwe_output` was computed from `power_pct`, which ignores the governor and
  the steam dump entirely. During a load rejection the dump vents the difference to the
  condenser while the reactor stays up — so the board read **full electrical output for
  steam that never reached the turbine**. Measured, a `set_load_target 50 MWe` ask at hot
  full power settled at **98.8 MWe indicated with the dump at 48 %**: the operator asked for
  50 and the gauge said 99. It now follows `steam_flow_normalized` (turbine admission), and
  the same case reads **50.02 MWe**.

  **Calibration is preserved exactly.** `steam_flow_rated` is 1.0 in these normalized units
  and the governor sits at 100 % at rated pressure, so the new form is identical to the old
  at full power. Verified across every shipped initial condition — `hot_full_power` 100.0,
  `50_percent` 50.00, `5_percent` 6.36, `hot_zero_power` 0, `cold_shutdown` 0 — which is the
  table `Manuals/09` §12 publishes, unchanged. What moves is only the states where flux and
  turbine admission **disagree**: a rejection ride-out, an MSIV closure, and the decay-heat
  tail after a trip.

  Found while investigating **#138**, which is closed as stale in the same batch — no manual
  load step of any magnitude trips this plant (cuts of 10/35/39/50/80/100 MWe: no scram, no
  PORV lift).

- **The overfill/level contradiction in `abuse_porv_walkaway` is gone, and is now asserted**
  (#136, closing it). The probe used to end at **120 % primary inventory with 7 % pressurizer
  level** — an overfilled RCS whose level gauge read nearly empty. Re-measured: **120.0 %
  inventory / 100.0 % level**, solid, and the two gauges agree.

  **Fixed by #249, not by this issue.** `level_per_mass_surplus` was an underived 300, so
  `mass_max` clipped inventory *before* the gauge ran out of scale — indicated level could
  not express a surplus at all. Fitting it to real pressurizer geometry (776, the steam
  space as 5.8 % of RCS volume) is what made the overfill readable, and it is the same
  defect that was hiding a full accumulator dump behind an "arrived UNscrammed" check.

  **What this issue contributes is the guard it never had.** Both numbers were printed on
  an `info` line every single run and asserted on none, which is exactly how a
  contradiction that obvious survived three months. The probe now asserts that an
  overfilled RCS reads overfilled on *both* gauges (`run_ops` 334 → 335 passed). Verified
  by injection: restoring the pre-#249 gain reddens it at the defect’s own signature
  value — level pinned at **88.0 %**.

### Changed
- **Rewind is a checkpoint picker on a real-time cadence** (#137, closing it)
  *(OWNER, 2026-07-31: "I don't think there should be a rewind one step button. Make the user
  pick from the checkpoints on the graph. For long fast forwards we need a way to go back far
  enough. The rewind cadence should be 20 seconds real time not sim time.")*.

  **The cadence UNIT was the bug, not the interval.** Free-play checkpoints were laid every
  15 *sim* seconds, so the 32-slot ring always spanned the same amount of the plant's life and
  progressively less of yours. Measured, ring saturated: **465.9 real seconds at 1×, 46.5 at
  10×, 9.3 at 60×, 3.1 at 600×** — it evaporated in exactly the case (a long fast-forward)
  where reaching back is the point. On a 20-second wall clock the ring now spans **620.0 real
  seconds at every acceleration** (measured at 1×, 10× and 60×), and each slot simply covers
  more sim the faster you run — 12,000 sim s per slot at 600×, so ~103 plant-hours are
  reachable instead of 31 minutes. Measured off `tick()` rather than a timer, so a throttled or
  backgrounded tab lays its checkpoint on the first tick after the interval instead of losing
  it.

- **The ⏪ button no longer rewinds — it opens the picker, everywhere.** Free play already
  picked from the graph; the walkthrough, scenario and failure-card buttons still stepped back
  one checkpoint. All four now open pick mode, so the marks are the authored beat/step
  checkpoints inside instructed content and the periodic ones in free play. Escaping a failure
  card is a click on the decision point rather than repeated presses walking backwards. A
  rewind still discards everything after the moment you pick — deliberate, and now said in the
  timeline's scanner text: it is a teaching tool, not an undo.

### Fixed
- **Clicking the graph in rewind-pick mode landed on the wrong moment** (#137). The picker
  inverted `chartBuf`'s full 30-minute record while the plot drew only the selected window, so
  a click resolved against a time base up to 6× too wide. Measured in headless Edge: clicking
  the mark at **T+19 s** landed the plant at **T+0**. Both now read one `chartExtent()`, and
  the same click lands with **0.0 s** of error.
- **In pick mode the plot widens to cover the whole checkpoint ring** (#137). With a real-time
  cadence a fast-forward lays its checkpoints hours of sim apart while the widest window is 30
  minutes — every reachable checkpoint sat off the left edge and the picker had nothing to
  click. The x-axis switches to `h:mm:ss` past ten minutes so the widened span is readable.

- **The steam generator drains at a real plant's rate now** (#135, closing it). `K_sg_level`
  **5.0 → 1.37**. A total loss of main feedwater at full power used to take the plant from
  64.5 % steam generator level to the low-low trip in **12.9 s**, leaving **2.9 s** between
  the SG LVL LO warning and the scram. Now: warning at ~29 s, AFW auto-start at ~37 s, trip
  at ~40 s — about **11 s** of warning.

  **Fitted to a real transient, not chosen.** Ginna UFSAR Chapter 15, Table 15.2-4, *"TIME
  SEQUENCE OF EVENTS FOR LOSS OF NORMAL FEEDWATER FLOW"* (NRC ADAMS ML20339A101, Rev 29
  11/2020): main feedwater stops at 20 s, low-low level trip setpoint reached at 55 s — **35
  s**. This plant runs 65 % nominal and trips at 17 %, so 48 points of span over 35 s =
  1.37 %/s. What is fitted is the **time**, not the geometry.

  **The issue's own proposed fix could not have worked.** #135 filed this as "a setpoint/lag
  question… not a physics change". The setpoints are 13 points apart on a level that was
  falling at 4.7 %/s, so no spacing change buys more than a few seconds. The cause was that
  the entire narrow range held **twenty seconds of full-power steaming**.

  **Control got better, not worse** — measured, before/after: steady hold over 30 min 2.35 →
  2.11 points of band; a 100 → 80 MWe ramp swings 9.8 → 5.4 points and settles closer to
  nominal. A lower level-per-imbalance gain swings less for the same flow mismatch, so the
  three-element feed controller needed no retuning.

  **You still cannot save the transient, and that is correct.** Restoring feed the instant
  the alarm arrives still trips, at 40.6 s — a real loss of normal feedwater trips the
  reactor on low-low level, and that is the credited protection for the event. The window is
  for reading the board, not for chasing the trip. Manual set **Rev 22**: **07 PWR-E01** now
  carries a *Timing — what to expect* section saying exactly that.

  **The finding behind the finding:** a 3.6× change to a physics constant left **all 32
  gates green**. Nothing asserted how fast a steam generator empties. New probe **TR-14**
  (`run_behavior` 38 → 39) pins the sourced anchor and fails at 13.0 s on the old value. One
  gate did move — `verify_e2e_ui`'s post-trip sample time, a fixture calibrated to the old
  drain rate — and the new sample point was validated against the **old** behaviour too, so
  it is a better test rather than a refit.

- **Settings tab trimmed** (#277). Removed **Values**, **Terminology**, and **Physics
  Overlay** — unused on the shipping PWR board. Units, fast-forward dropout, and About
  remain.

### Added
- **You can reset the SCRAM now, and the board tells you what is holding it** (#75, closing
  it). After a trip the SCRAM control reads **SCRAMMED** and becomes the RPS reset: press it
  and the reactor trip breakers re-close. It does **not** withdraw rods or restart the
  reactor — the rods stay where they are until you deliberately withdraw them under the
  startup net.
- **You can click the pressuriser relief valve open and shut** (#125).

  The PORV on the board has always looked clickable — it highlights under the pointer
  and shows a hand cursor — but nothing was wired behind it, so the click did nothing.
  It now works: click to lift the valve, click again to shut it.

  Giving the operator that switch needed care, because the same command was doing two
  unrelated jobs. A real relief valve has two separate inputs to one solenoid: the
  automatic signal that lifts it on high pressure, and the operator's switch on the
  panel. Here they were the same command, so there was no way to hand the operator a
  switch without also handing them the automatic protection — and no way for a training
  scenario to take the switch away without disabling relief along with it.

  They are separate now. **Scenarios can lock out the manual switch**, and the Three Mile
  Island scenarios do: that accident turns on not being able to tell an open valve from a
  shut one, and it stops teaching anything if you can sit on the switch and work the valve
  yourself. Locking the switch does **not** disable relief — the valve still lifts on high
  pressure exactly as before, which is measured and gated rather than assumed. Closing is
  never locked, because closing it is the Three Mile Island action itself, and watching
  that fail against a stuck valve is the entire lesson.

### Fixed
- **Alarm tiles told you the wrong system for a third of the alarms** (#157).

  Every alarm tile carries a system family on its second line — *coolant · warning ·
  unacknowledged*. That family was never recorded anywhere; the interface guessed it by
  looking for keywords in the alarm's internal name. Measured, it was wrong or arguable
  for **13 of the pressurised-water reactor's 33 alarms**.

  The guesses failed in ways nobody could see. *CHG FLOW HI* was filed under safety
  systems rather than coolant, because the word "flow" is in the label an operator reads
  and not in the internal name the guesswork read. *SUR HI* — a reactivity alarm on both
  the pressurised-water reactor and the RBMK — matched nothing at all and fell through to
  safety systems. *SG PRESS HI* matched "press" and was filed as coolant even though it is
  secondary steam. Renaming any alarm could silently re-file it.

  Each alarm now states its own family, next to the panel it annunciates on. There is
  deliberately no fallback guess: an alarm that fails to state one shows a dash and fails
  the build, rather than quietly showing a plausible answer that happens to be wrong.

- **Resetting the reactor protection system on the RBMK or the BWR blamed the rods for
  something that was not their fault** (#228).

  After a scram, the trip breakers reset only once the rods are fully in — a real
  interlock, and the simulator models it. On those two plants the reset was refused with
  *"trip breakers reset only with all rods inserted"* **while every rod read 0.0 %**, fully
  inserted. There was no way to clear the scram, and the message pointed at the one thing
  that was already correct.

  The cause was two layers deep. The shared control system had always sent the reset
  command to the reactor, but only the pressurised-water reactor knew what to do with it;
  the other two answered "I do not understand that", the control system discarded the
  reply, and then inferred a reason from the fact that the plant was still tripped. Both
  reactors now implement the reset, and a reply the control system cannot act on is passed
  back to you instead of being replaced by a guess.

  Filed as a latent problem on the grounds that those plants have no control panel yet.
  Measuring it showed it was not latent in the way the report assumed — the refusal was
  already reachable, and already wrong.

### Added
- **The board now tells you to isolate the accumulators — SI ACCUM ALIGNED < 1000 PSI**
  (#273, closing it). A caution annunciator on panel B at **1000 psi (6.895 MPa)**, and the
  first alarm in the plant **gated on a lineup as well as a reading**: it also requires the
  discharge isolation valve indication to read *open*, so a correctly-isolated Mode 5 plant —
  which sits below that pressure all day — never sees it. Isolate and it clears; isolate on
  schedule and it never comes in.

  **The button had said "PRESS TO RESET" since the day it was built, and it did nothing.**
  Not "did nothing useful" — the handler was an empty stub carrying a comment claiming no
  engine reset command existed. One did: the engine has had `reset_rps` with its rods-in
  interlock, and the control layer its permissive, for as long as the button has drawn that
  caption. The three had simply never been joined. An operator pressed it and got no reset,
  no refusal and no message at all.

  **The refusal was invisible even in code.** The kernel returned a `type: 'refused'` shape
  that *nothing in the repository read* — not the service, not the UI, not a test, not the
  spec. Measured: an early press returned a perfectly good labelled refusal straight into a
  branch that does not exist. It now returns the same `blocked` + `INTERLOCK` shape every
  other plant interlock uses, so the reason reaches the scanner bar through the path that
  was already there.

  **The permissive is now readable BEFORE you press.** Two conditions gate the reset — no
  trip signal standing (a breaker will not hold in against a live trip signal) and rods at
  bottom — and the caption under SCRAMMED names whichever is holding: *TRIP SIGNAL STANDING*,
  *RODS NOT AT BOTTOM*, or *PRESS TO RESET* when it will take. One evaluator answers both the
  caption and the press, so the board cannot promise a reset the plant will refuse. Measured
  on a hot-full-power scram: the turbine trip holds it for the first second, rod bottom for
  about two more, and it is available from roughly t+4 s.

  **The teaching case is the point.** A trip you have not actually fixed keeps the plant
  latched — after a loss of feedwater the reset stays blocked on *low steam generator level*
  until the heat sink is restored, and after a large LOCA on *low reactor coolant pressure*.
  Recovery is procedural, not a button. Documented as a control in **03 §3.5.1** (manual set
  **Rev 20**), with **06 PWR-A01** Recovery pointing at it.

  Three things worth knowing. Rod bottom is a new **`rods_fully_in` status word**, so the
  permissive reads an indication rather than engine truth (HR1) and shares one threshold
  constant with the engine's own interlock — they cannot drift apart. The permissive itself
  is **plant config** (`rps_reset_permissive` in `pwr_control.js`), so the shared kernel
  stays plant-agnostic and #228's existing `reset_rps` leak was not widened — `run_hr3` is
  unmoved at 29. And the first cut of the tests **missed the rod-bottom window entirely**:
  injection proved the whole permissive config could be deleted with every check still
  green, because the standing turbine trip covers the first half-second and the rods are
  down before the later checks run. A check now sits inside that window.

  Gated: `run_e2e_controls` **39 → 59**, `board_check` **138 → 143**. All 25 new checks
  driven red by injection, including the original defect — restoring the empty handler
  reddens the board harness.

### Fixed
- **Two shipped releases were still filed as unreleased, and the roll is now gated.** Alpha
  **1.10.0** and **1.11.0** both merged to `main` without their `## [Unreleased]` heading being
  renamed, so 434 lines covering two releases sat in this file as work-in-flight and the newest
  version heading read **1.9.0** — two versions behind the site. Both are now rolled, dated
  **2026-07-30** to match `changelog.html`.

  **The boundaries were not guessed.** Entries had been inserted at the top of existing
  `### Added` / `### Fixed` subsections rather than appended, so the two releases were
  interleaved, not stacked. The split comes from diffing this file's `[Unreleased]` block as it
  stood at tags `v1.10.0` and `v1.11.0` against `HEAD`, which puts the seam between #271
  (armed-protection alarm bands, 1.11.0) and #263 (the moderator re-fit, 1.10.0) — and
  `changelog.html`'s own two entries, written at the time and never touched since, split at
  exactly the same place. Verified content-neutral: sorted non-blank lines before and after
  differ by precisely the four heading lines added, nothing moved between releases.

  **Gated by the new `test/run_release.js` (18 checks).** `site/release.js`, `changelog.html`
  and this file must agree on what shipped: the newest version heading here must be the string
  in `release.js`, dates must match across both changelogs, both must be newest-first, and
  `[Unreleased]` must exist exactly once and sit above everything. It survives being skipped
  precisely because **nothing downstream reads these headings** — the file renders and reads
  plausibly either way — so a note was never going to be enough; CLAUDE.md and the release
  skill both already said to do it. Proven against the **real** pre-fix file rather than a
  synthetic one: 3 checks red, naming both missing versions. All 18 driven red by injection.

- **The offline download arrives with a NAME on it** (#275, closing it). The Download page's
  button saved the file as **`latest.zip`** — no product, no *Alpha*, no version, and
  indistinguishable from the copy you pulled three releases ago once it is sitting in a
  downloads folder. It now saves as **`Reactor_Dynamics_Alpha_1.11.0.zip`**, which is the
  same name `site/make_download.js` gives the versioned copy it writes at every deploy.
  Measured in headless Edge from `file://`: `download="Reactor_Dynamics_Alpha_1.11.0.zip"`.

  The `href` deliberately still points at the stable `download/latest.zip`, so **no
  per-release edit was added** — the saved name is stamped from `site/release.js` (the one
  hand-edited version string) by `site/nav.js`, which already does exactly this for the
  footer's build stamp. With JS off the bare `download` attribute in the markup still saves,
  as `latest.zip`, i.e. today's behaviour: the failure mode is *no worse than before*, not
  *a wrong version number*. The zip's **contents** were always named correctly
  (`Reactor_Dynamics_Alpha_1.11.0.html`); only the wrapper was anonymous.

  **`test/run_portable.js` gained a DOWNLOAD section (116 → 123 checks)** because every part
  of this fails silently — drop the `release.js` tag, rename the anchor, or change the
  filename prefix in one of the two places that spell it, and the button still works, still
  downloads, and quietly hands out the wrong name. It pins the id, the stable href, the no-JS
  fallback, the script *order* (nav.js reads `RD_RELEASE` at `DOMContentLoaded`), the stamp
  itself, that `nav.js` and `make_download.js` build the identical name, and that
  `RD_RELEASE` is a full `Alpha X.Y.Z`. All seven were proven to go **red by injection**
  before being counted green.

## [Alpha 1.11.0] — 2026-07-30

### Added
- **Settings → About: Disclaimer, License, and Changelog popups** (#259). The portable
  single-file build is only the control room, so a recipient offline had no route to the
  alpha disclaimer, the licence, or the player-facing changelog. Those three open as
  in-app modals; content is packed from `legal.html` / `changelog.html` by
  `node tools/pack_site_docs.js` into `ui/site_docs.js` (same pattern as the manuals).
  The logo version chip also opens the changelog.

- **The board now tells you to isolate the accumulators — SI ACCUM ALIGNED < 1000 PSI**
  (#273, closing it). A caution annunciator on panel B at **1000 psi (6.895 MPa)**, and the
  first alarm in the plant **gated on a lineup as well as a reading**: it also requires the
  discharge isolation valve indication to read *open*, so a correctly-isolated Mode 5 plant —
  which sits below that pressure all day — never sees it. Isolate and it clears; isolate on
  schedule and it never comes in.

  **There is no autoclose interlock, and that is the decision, not an omission.** Real plants
  power these valves *open* and remove control power to prevent inadvertent closure; the
  closure is the operator's, made off RCS pressure indication. An automatic closure keyed on
  falling pressure would also shut the accumulators during a LOCA, which is exactly when they
  must inject. The tile therefore states a lineup rather than an order — on a LOCA the same
  annunciation means the opposite thing.

  **Measured, and worth knowing before you rely on it:** on a brisk cooldown the cue precedes
  the first discharge by about **one minute of plant time** — under two seconds of wall clock
  at 30×. The procedure step is the defence; the annunciator is the backstop and the
  post-mortem. Both compressed rates behind that number, and the 22–440× ECCS injection
  pacing, are now declared in **12 §14.1**.

### Fixed
- **The heatup procedure re-aligns the accumulators** (#276) — `04` PWR-N03 step 4. The cold
  lineup ships with them isolated and **nothing opens them automatically**: re-alignment is
  procedural by design *(OWNER RULING, 2026-07-30: "lets leave opening of the accumulators to
  the procedure instead of auto opening them.")*, so the procedure is the only thing that
  catches it. Skip the step and you reach Mode 1 with no passive injection. The **SI ACCUM
  ALIGNED** annunciator does **not** cover this — it clears on shut tanks, so it is silent on
  exactly this case, and its card now says so.

- **The cooldown procedures now tell you to isolate the accumulators** (#273) — manual set
  **Rev 17**. `04` PWR-N15 and `05` Phase C both descended past the accumulators' 600 psi
  (4.14 MPa) cover gas without a word about them; neither chapter contained the term. Both
  now carry an isolation step at **1000 psi (6.895 MPa)** (NUREG-1431 LCO 3.5.1
  applicability; LTOP SR 3.4.12.3), with the note that these are passive tanks and that the
  SI block set entering the cooldown blocks *pumps*, not them. `05` Phase A gained the
  matching **re-align** step — the cold lineup ships with the accumulators isolated and
  nothing in the manual set had ever opened them again. The isolation pressure is now one
  number across the manual, the scenario trigger and the campaign driver.

- **When an automatic controller switched itself off, the board never said why** (#214).

  Every automatic control carries a one-line account of what it is doing — and, when it
  stands itself down, the reason. None of it was on screen anywhere. The panel that used
  to print it was removed when the automatic controls moved onto the board diagram, and
  nothing replaced it, so the explanations had been written into a dead end.

  This matters most in the case it was written for. Isolate main feedwater and the
  three-element level controller drops out on its own — correctly, auxiliary feedwater
  now has the steam generators — but all you saw was the AUTO light going dark and the
  MANUAL light coming on, with nothing to say why your level control had just abandoned
  you. Hovering any automatic control now reports what its channel is doing, in the
  System Scanner block, under the description: **MANUAL — off — main feedwater isolated
  (AFW has the SGs)**.

  The feed card also carries a permanent status word in its top-right corner —
  **HOLDING** in green when the controller is actually regulating, amber for everything
  else: **ISOLATED**, **MANUAL**, **OFF**, and **SAT HI / SAT LO**. That last pair is the
  one worth knowing about. It means the controller is still in AUTO and still trying, but
  the feed pump is against a stop and there is nothing left to correct with — the AUTO
  light says you are covered when you are not. The card title was shortened to *SG FEED*
  to make room, the way the steam dump status already sits in its corner.

  Two things had to be true for that to be worth showing. The line follows the plant
  while you hold the pointer still — the scanner otherwise only repaints when the pointer
  moves, so a controller that tripped out while you were reading about it would have gone
  on reporting the state it was in when you arrived. And the reason is now retired when it
  stops being true: restore feedwater and the message clears instead of insisting the
  plant is still isolated. The controller stays off either way — standing it back up is
  the operator's call, which is the entire point of a stand-down.

- **Continuous integration had been red on every run for three days, across two releases**
  (#191).

  The GitHub Actions gate ran `run_all.js --fast`, which skips the runners marked slow so
  that no browser has to be downloaded. Three test runners need a browser, not two — and
  the third, `verify_flags_ui`, is not marked slow because it only takes 8 seconds. So it
  ran, found no browser, and failed. Every run from **2026-07-28 20:49 UTC** — one hour
  after that runner was added — to 2026-07-31 was red: **32 consecutive failures**,
  including the push to `main` for Alpha 1.10.0 and the #272 release pull request. Every
  other runner passed on every one of them; the gate was correctly reporting a real drift,
  and the drift was in the workflow.

  It now runs the **full 33-runner gate with all three browser gates**, in about 8 minutes.
  The reason it did not before was the belief that a browser in continuous integration
  requires adding an npm manifest to a project that has deliberately never had one. It does
  not: the browser is installed into a scratch directory outside the checkout and copied
  into the ignored `node_modules/`, which is exactly how the local machines are already set
  up. A step in the workflow fails the build if a manifest ever appears in the repository
  root, so that property cannot be given up by accident.

- **The pressurizer could not go water-solid on injection — the exact thing Three Mile
  Island is about** (#249) — and the clamp that caused it was hiding a second bug.

  Emergency injection into an intact reactor coolant system pinned indicated pressurizer
  level at exactly **88.00 %** and left it there forever. Not a slow fill: a hard stop. The
  level term for surplus inventory was set to a number nobody had ever derived, so the
  model ran out of inventory headroom before the gauge ran out of scale. It is now fitted to
  real geometry — the pressurizer steam space is **5.8 %** of reactor coolant system volume
  (Beaver Valley 2 UFSAR Tables 5.1-1/5.4-12, plus the Westinghouse systems manual's
  full-power steam fraction), and that is the whole distance between normal level and solid.
  Measured, injection now carries the level to **100 %**, through the 97 % high-level trip,
  the way the procedure's own caution says it will.

- **The by-the-book cooldown dumped all four safety-injection accumulators** (#273).

  Taking the plant from Hot Standby to Cold Shutdown walked straight past the accumulators'
  **600 psi (4.14 MPa)** nitrogen cover pressure with their discharge valve still open, so
  every tank emptied itself into the reactor coolant system. The plant arrived at Cold
  Shutdown with **no passive injection left**, boron dragged to **2,310 ppm**, and the
  coolant system overfilled. Nothing on the board was wrong — but nothing told you to
  isolate them, and blocking Safety Injection at the start of the cooldown does not cover
  them (that blocks pumps; these are pressure and a check valve).

  The cooldown now has an isolation step at **1000 psig (6.89 MPa)**, which is where a real
  plant stops requiring the accumulators available (NRC Standard Technical Specifications
  LCO 3.5.1, and the low-temperature overpressure lineup that requires them isolated).

### Added
- **A gate that asks whether the plant can reach its own trip setpoints.** The two bugs
  above went unseen because a test asserted the reactor "never tripped" on a gauge that
  could not physically get to the trip point. `test/run_reachability.js` checks both halves:
  every one of the 50 protection and alarm thresholds sits inside its instrument's range,
  and the ones that matter are driven on the real plant until the needle actually crosses.
- **A cold plant read as a scram on the pressure gauge, and the nuclear instruments never
  showed their trip points** (#270, #271) — the rest of the work #267 started. Every board
  indication now follows the protection that is **actually armed**, not the setpoint table.

  On a depressurized plant the P-11 permissive blocks the low-pressure reactor trip and the
  safety-injection signal with it. PRIMARY PRESSURE painted the red band anyway, and the
  damage went further than a stale colour: at Cold Shutdown the marker sat **off the gauge
  entirely** and the normal band inverted itself, so a perfectly correct **363 psi
  (2.50 MPa)** read as **trip red** while the alarm list beside it said *"Pressurizer
  Pressure Low — expected, plant depressurized"*. The tile now collapses the low band, reads
  `LO TRIP BLKD`, and rescales to the pressure you are actually holding on heaters —
  pressurize past **1972 psi (13.60 MPa)** and the block reinstates itself and the red band
  comes back. A LOCA is unaffected: those trips stay armed all the way down, so a hot plant
  losing pressure still reads hard red. Same number, opposite meanings.

  The **source range, intermediate range and startup rate** readouts were bare numbers. Two
  of the three rungs of the startup net lived there and neither was visible — the source
  range went amber at its handoff caution but marked its **1e5 cps** trip no differently, and
  the intermediate range's trip, the one that catches a missed block, showed nothing at all.
  All three now colour against their live limits: amber approaching, red at the limit, and
  **grey once the trip is blocked or the detector is secured** — because a defeated trip is
  not something you can run into, and saying otherwise would teach the opposite of what
  blocking it accomplished.
- **The reactor power gauge showed a 120 % trip while the plant was set to trip at 25 %**
  (#267). Through a startup the power-range **low setpoint** reactor trip is armed at
  **25 %**, and it can only be blocked once you are above the P-10 permissive at **10 %**.
  The gauge never showed it: the tile took the *first* power trip in the protection table,
  which happens to be the 120 % backstop, so an operator climbing out of Mode 3 read green
  all the way to a scram at a fifth of the indicated limit. Measured — with the low setpoint
  armed, **26 % scrams and 24 % does not**.

  The tile now follows whichever power trip is actually armed. While the low setpoint is
  live the meter reads to 27 % and lays out the startup ladder: **green to P-10 (10 %),
  amber from there up to the trip — that amber band is the window in which blocking is
  permitted — and red above 25 %**, with a red `TRIP 25%` annotation naming the limit. Block
  the trip and the meter reopens to the at-power scale with 120 % at the top and the
  annotation clears; drop back below P-10 and the block reinstates itself and the band comes
  back with it. **At power nothing changed** — the bands are identical to before.

## [Alpha 1.10.0] — 2026-07-30

### Fixed
- **The moderator model was re-fitted to measured plant data, and the reactor is more
  self-regulating than it was yesterday** (#263). The previous fix (#260) took the
  boron dependence of the moderator coefficient from a written statement in a training
  manual; that manual's own figure disagreed with it. The **BEAVRS / Watts Bar Unit 1
  Cycle 1 startup physics tests** publish three *measured* temperature coefficients at
  three boron concentrations, and they settle it — #260's value was **4.3× too negative**
  at the all-rods-out condition.

  Both parameters are now least-squares fitted to those measurements, reproducing all
  three to within 0.09 pcm/°F. **The coefficient at full power is 34 % stronger**
  (−20 → −26.8 pcm/°C), which supersedes an earlier tuning ruling: the core now fights a
  rod withdrawal harder, so a small withdrawal at power shows up as **temperature rather
  than power** — which is what a real plant does, since the turbine sets power and the
  rods set temperature.

  For an operator: critical boron runs **806 → 587 ppm** across a heatup with the control
  bank in (spread 556 → 219 ppm since #260 began), differential boron worth is
  **19.9 pcm/ppm cold against 10.5 at power**, and a runaway on the startup challenge
  self-limits more, so overshooting the band takes more banked reactivity than it did.
  Nothing in the reactivity curve is set by preference any more.
- **The operator manuals' revision history was two weeks and six changes out of date.** Five
  entries were missing — the low-flow trip's new instrument and setpoint, the pump-heat heatup
  that re-authored two chapters, the reactivity recalibration and its new Estimated Critical
  Condition table, the charging/letdown flow correction, and the reactivity curve's second
  anchor. Every one of those changed numbers an operator reads. Ten of the thirteen documents
  also still said "Revision 0", and the contents page said Revision 2 from two weeks earlier.
  All five entries are now written, the revision is a single set-wide number carried by every
  document, and the history table reads newest-first throughout — it had been half ascending
  and half descending, so there was no clear place to add a new entry. A gate now fails if a
  chapter is edited without recording it.
- **The manual quoted a charging and letdown flow the board never showed.** Section 12 said
  **40 gpm** maximum charging and **20 gpm** normal letdown, where the board's charging box tops
  out at **60 gpm** and its orifice-A letdown reads **30 gpm**. Two conversion scales were being
  kept in two separate files and had drifted 1.5 × apart, with the manual quoting the one no code
  reads. The manual now matches the board, and a gate cross-checks the two so they cannot
  separate again. **No displayed value changed** — only the documentation that was wrong about it.
  Section 12 also now says plainly that these gallons-per-minute figures are display flavour for
  pacing, not physical flow rates to be measured against a real plant.
- **The moderator temperature coefficient is no longer a constant, and the reactor no longer
  goes critical cold at 600 ppm** (#260). A single MTC of −11.1 pcm/°F (−20 pcm/°C) was
  applied from 122 °F (50 °C) all the way to 579 °F (304 °C). Over a Mode 5 → Mode 3 heatup
  that integrates to a **−4944 pcm** moderator defect — 494 ppm of dilution to buy back, a
  third of it charged below 274 °F (134 °C) — and it collapsed critical boron from 819 ppm
  cold to 263 ppm hot. Found in free play: at **2235 psi (15.41 MPa) and 274 °F (134.4 °C)**,
  diluting toward **600 ppm** — a number that looks safe next to the hot end — took the
  reactor critical and tripped it on source-range high flux. The trip was correct; the reason
  600 ppm was critical was not.

  Moderator reactivity now tracks moderator **density**, so the coefficient steepens as the
  plant heats and weakens as boron rises, both sourced to WTSM 2.1 *Reactor Physics Review*
  (ML11223A207) Figure 2.1-8. Rod worths went to the measured values in WTSM 2.2
  (ML11216A051) Table 2.2-1 — control banks **8500 → 4068 pcm**, shutdown **10 000 →
  3676 pcm** (all RCCAs 7744; the old 18 500 was 2.4× anything sourceable). Core excess
  reactivity is now **solved**, not tuned, so hot-zero-power all-rods-out critical boron lands
  on the **975 ppm** measured in the BEAVRS / Watts Bar Unit 1 Cycle 1 physics tests.

  For an operator: critical boron now runs **834 → 575 ppm** across a heatup with the control
  bank in (was 819 → 263), and **1130 → 975 ppm** all-rods-out. Boron is held roughly
  constant through the heatup and the dilution is done hot, which is what a real startup does.
  Differential boron worth is now larger cold (13.8 pcm/ppm at 122 °F against 10.0 at power),
  which falls out of the density model rather than being tuned in.

  **Two procedures were re-authored** because the plant changed under them (HR9). `pwr_startup`:
  the 1/M withdrawal bursts are now 138/90/44/22/12 steps (criticality moved from step 224 to
  318). `pwr_heatup`: the authored dilution drove a runaway to 119 % power and 638 °F on the
  new model, so it is gentler — the ride now tops out near 7 % instead of 10–30 %, which is
  the prototypical shape for a nuclear heatup, and the two startup-trip blocking steps became
  precautionary rather than load-bearing.

### Changed
- **The plant can now heat itself up from cold on pump heat alone, with the reactor never
  started** (#251). The steam generator used to subtract reactor-coolant-pump heat out of its
  own steam balance — a correction term sized to cancel pump heat exactly, because the turbine
  drew steam for core power only and the extra 0.55 % had nowhere to go. The side effect nobody
  had costed: a heatup on pump heat was *mathematically impossible*, stalling dead at
  **218.69 °F (103.72 °C)** forever. The turbine's demand now includes pump heat and the SG
  boils off everything that crosses it, with rated steam flow defined against NSSS rated heat
  (core + pump) the way a real plant rates its generators. Measured: Mode 5 → Mode 3 in
  **10.71 plant-hours** at an average **39.8 °F/hr (22.1 °C/hr)** with **no rod motion at all**,
  arriving at 548 °F (286.7 °C) and −6287 pcm. Full-power behaviour is unchanged to two
  decimal places.
- **A cold plant is no longer synchronised to the grid.** The Mode 3 and Mode 5 initial
  conditions spawned with the turbine in load-follow and the generator carrying 1e-6 of load,
  while the rotor sat at rest — half-fixed in an earlier change. They now spawn properly off
  line (breaker open, planned offline, not tripped). This mattered the moment pump heat became
  real: a following governor cracks open and drains the heatup.
- **"The Big Warm-Up" (Mode 5 → Mode 3) has been re-authored around the real evolution.** It no
  longer takes the reactor critical to warm the plant up. Pressurize, start the pumps, bottle
  the steam generator, and ride the temperature up on pump heat — arriving hot and *still
  subcritical*, which is what Hot Standby actually means. The approach to criticality moved out
  to the missions that already teach it.
- **The low-flow reactor trip now fires at 90 % of rated flow, not 25 %** (#248). This is the
  real Westinghouse setpoint, and the block permissive moved to the real P-7 (10 % power).
  Measured on an RCP trip from full power: the trip now fires at **1.8 s**, where DNB onset
  is at **10.9 s** — it protects the core about nine seconds before the hot channel can boil.
  The old 25 % fired at 16.2 s, roughly five seconds *after* DNB began; its entire practical
  effect was to let the core boil first. Scanned for spurious trips: small LOCA, stuck-open
  PORV and SGTR never drop flow below 90 % at all, and the large LOCA has already scrammed on
  low pressure three seconds before it gets there. The TMI flagship is untouched.
- **"Loss of Coolant Flow" has been re-authored around a stuck flow transmitter.** With the
  faster trip a healthy plant simply trips in under two seconds and nothing happens — the old
  lesson (*hesitate and it boils*) became unreachable, correctly, because no real plant lets
  flow coast to a quarter of rated. So the scenario now trips the pump **and** sticks its flow
  channel at 100 %. The low-flow trip never fires at all; the core boils, and the reactor is
  finally caught 35 s later by the **high-pressure** trip — a different instrument catching a
  consequence. Subcooling margin is the indication still telling the truth. The lesson is no
  longer "trip fast", it is **"a single-channel trip is exactly as trustworthy as its one
  transmitter"**, which is what real plants answer with three detectors per loop and 2-of-3
  coincidence.

### Added
- **A portable single-file build — the whole control room as one `.html` you can email.**
  `node tools/make_portable.js` inlines all **94 scripts and 2 stylesheets** that
  `ui/shell.html` loads, in document order, into one **2.55 MB** self-contained file that
  runs by double-clicking: no server, no install, no network, no unzipping into the right
  folder. Measured in headless Edge: the bundle issues **1 network request — itself** — and
  reaches a state identical to the multi-file build across all 60 sampled board values
  (reactor power 0.8 %, T-avg 558 °F (292 °C), primary 1068 psi (7.36 MPa), 8 alarms) after
  the same stuck-PORV injection, with **zero page errors**.
  Nothing about the simulator had to change to make this work: every runtime file is
  already a plain global-namespace script, there is no `fetch` anywhere in the codebase, the
  operator's manual is pre-packed into `ui/manual_md.js`, and there are **no images and no
  web fonts at all**. The sim could always run from `file://` — what it could not do was
  travel as a single attachment. Three fixups are all the bundler adds: the two Vercel
  analytics beacons are dropped (declared, with reasons — an undeclared external tag is a
  hard build error, never a warning), the logo's `../index.html` link is repointed at the
  public site since a single file has no sibling landing page, and the ⚛️ favicon is
  embedded as a `data:` URI so an emailed file still gets a labelled browser tab.
  The build is **not minified** — the source stays readable, which is also what keeps
  AGPL §13 honest when the file is handed to someone. Output goes to the gitignored `dist/`.
  *Emailing it: ZIP it first — several mail providers silently strip `.html` attachments.*
- **`test/run_portable.js` guards the offline build** (**112 checks**). The single-file build
  works only because of a property no other gate asserted: **nothing in the runtime loads
  anything at runtime.** That is the kind of property that dies quietly — a
  `fetch('Manuals/12.md')` added for an excellent reason leaves every other gate green and
  the deployed site perfect, and breaks the *emailed* file on a stranger's machine where
  nobody will ever report it. The gate scans exactly the assets `ui/shell.html` ships (read
  out of the file, so it widens itself when a script is added) for 13 load patterns, checks
  the stylesheets for web fonts and for relative `url()`s that would break once inlined,
  then **builds the bundle and asserts the deliverable itself** has no loading attribute
  left. Verified by injection rather than by passing: a `fetch`, a CDN `<script>`, an
  `@font-face`, an `<img src>` and an ES `export` each turn it red on the matching check.
- **RCS Loop Flow is now an instrument, and the low-flow reactor trip reads it** (#247).
  The trip that protects the core against a loss of forced flow used to read **true**
  coolant flow directly — it could not lag, could not drift, and could not be fooled by a
  failed transmitter. On a simulator built around the premise that instruments lie, that
  made the single most safety-significant trip on the plant **impossible to train on**. It
  was carried for two years as "the one documented HR1 exception"; it was not an exception,
  it was an instrument nobody had built.
  `rcs_flow` models the real measurement — **elbow taps** on the crossover-leg 90° elbow,
  reading differential pressure across the bend (ΔP ∝ flow²), nothing inserted into the flow
  path. It reads in **% of rated**, lags 1 s, appears as an **RCS Flow** trend, and accepts
  the full failure set. The setpoint is unchanged at **25 % of rated**.
  What this buys, measured end to end: inject a **stuck-high** flow transmitter, trip the
  RCP, and the flow indication sits at 100 % while the true flow reaches zero — **the
  low-flow trip never fires**, and the reactor is eventually caught by high primary pressure
  instead, several seconds later and for a different reason. That is a genuine new event to
  train on, and it was unreachable before.
- **Main feedwater isolation valve position indication** (#247). The three-element feed
  channel is supposed to stand down when main feed isolates, handing the steam generators to
  AFW. It read a true-state field that **`getTrueState()` has never exposed**, so the value
  was always undefined and the stand-down had **never once fired** in any session. It now
  reads MFIV position, and the channel drops out with the note *"off — main feedwater
  isolated (AFW has the SGs)"*.
- **Feedback (💬) is now an email address, not a form** *(owner, 2026-07-29)*. The overlay used to
  collect a category, a description and an optional reply address, then package the lot as a JSON
  file the player downloaded — against a planned `POST /api/feedback` that was never built, so the
  report landed in their downloads folder and nowhere anyone reads. It now shows
  **reactordynamics@gmail.com** as a `mailto:` link with a copy button, a line on what makes a
  report easy to act on, and the build stamp to quote.
  The **session diagnostics download stays**, as a single button. It is the only place that bundle
  is reachable from — the `export-diag` action has no button of its own — and it is worth attaching
  to a bug report. Same rule as before: telemetry comes only from the live session recorder, never
  from a user-supplied file.

### Fixed
- **The full-stack procedure gate was running half its procedures at a tenth of their declared
  speed (#245).** `test/run_procedures_stack.js` set `timeAcceleration = 10` once at setup.
  `SimulationService._attentionStop` then did its job — the first alarm or scram on a quiet
  board snaps fast-forward back to real time so a human is not left behind the plant — and
  nothing put it back. Measured: **11 of the 22 procedures** ran below 10× from as early as
  **t = 2 s**, one of them for 416 consecutive ticks. Every step assertion downstream of that
  point was being judged on a tenth of the sim time its author declared.
  Fixed with `svc.attentionStops = false` — the dropout is a comfort feature for a human at
  the board and a headless gate has no one to protect; `run_autoctl` had already reached the
  same conclusion by another route — plus a new per-procedure assertion that the run actually
  held its declared acceleration, so the harness can no longer claim 10× in its header while
  the runs underneath it disagree. The mechanism itself stays covered by `run_m5`.
  **Four "RBMK/BWR plant defects" were this bug.** `bwr_startup` step 2 was already known
  (#240 follow-up); `rbmk_mcp_trip` step 2 on both RBMK versions and `bwr_sbo_rcic` step 3
  (vessel level 25.4 % vs a required 40) join it — power had a tenth of the time to fall after
  the pump trip, RCIC a tenth of the time to refill. All three pass on the sim time alone.
  That is a green establishing the *mechanism*, not a clean bill of health for either plant:
  both are on hold and nobody has re-derived those steps from the plant.
  It also caught a stale PWR assertion. `pwr_stuck_porv` step 1 asserted `core_inventory_pct
  < 100` at the end of a 30 s hold. Inventory does fall — 99.65 → 98.01 % by t = 6 s — but
  automatic HPI actuates at 10.5 MPa and refills past nominal (117.6 % by t = 16 s, pressurizer
  at 88 %, subcooling gone). That is the plant doing the right thing; it is TMI's own trap, the
  solid pressurizer that invites throttling injection, which this procedure's caution warns
  about. The step now asserts the leak was *seen* and checks subcooling — the diagnosis signal
  its own text points the player at — at the end.
  Baselines move with the fix: `run_procedures_stack` **22/22 155/155 → 178/178** (+22 the new
  acceleration assertion, +1 the split above), strict xfails **5 → 2**; `run_procedures`
  **101/101 → 102/102**.

### Removed
- **The V1 PWR board is gone (#246).** `ui/diagram/pwr_synoptic.js` (~100 KB) and
  `pwr_synoptic.css` were superseded by the V2 board in `ui/diagram/board/` months ago, but
  they were still parsed on every control-room load and never mounted. Deleted, along with
  their dev harness `ui/test_panel/synoptic_check.html`, which could only exercise the
  deleted module. The three `RD.PwrBoard || RD.PwrSynoptic` fallbacks in `ui/app.js`
  collapse to `RD.PwrBoard` — the only PWR display there has been for some time.
  Two pieces did **not** go with it. The four `.app.pwr-synoptic` rules at the top of the
  V1 stylesheet were shell hooks keyed on the `.app` class, not V1 board styling, and the
  V2 board needs them (`.view-area { padding: 0 }` in particular) — they moved into
  `ui/shell.css`; the class name is unchanged. And `run_campaign` validated every PWR beat
  highlight against the V1 module's `SYN_CONTROL_MAP`, which was already the wrong
  authority: `app.js` resolves highlights through `RD.PwrBoard.revealControl`. It now
  checks the board driver's `CONTROL_LABEL_MAP` (51 labels to V1's 34, a strict superset,
  so nothing that used to resolve can now be hidden). Gates unchanged at baseline:
  `run_campaign` 51/51 (3024 checks), `verify_manual_follow` PASS (84), `verify_e2e_ui`
  PASS (16 screenshots), `run_inspect` 7/7, `board_check` 106/106.

### Changed
- **The board now speaks the same units as the manual.** The dual-unit convention reached the
  manual last release but stopped at the board, leaving three conventions live at once: the
  **live checklist / procedure steps** were SI-only (*"Set the Steam Dump Setpoint back to the
  no-load anchor (8.23 MPa)"*), the **System Scanner's inspection copy** was a mix of US-only
  and SI-only, and one Scanner entry had the convention exactly backwards (*"15.41 MPa (about
  2235 psi)"*). A player reading a step target in MPa and a gauge in psi had to convert in
  their head, on a board that is US everywhere else.
  All 28 sites converted. A checklist step target now reads **1194 psi (8.23 MPa)**, the PORV
  entry opens near **2350 psi (16.20 MPa)** and reseats about **2300 psi (15.86 MPa)**, HPI
  arms at **1799 psi (12.4 MPa)**, the RHR suction valve is interlocked at **400 psi
  (2.76 MPa)**, and the rod-AUTO deadband is **±1.4 °F (±0.8 °C)** — a temperature difference,
  so no offset.
  `test/run_manual_units.js` now covers both source files as well as the manual, so the three
  surfaces cannot drift apart again. **Engine command payloads stay SI** — `cmd: { mpa: 8.23 }`
  is an argument, not a reading — as do developer comments.
- **The units gate is scored on failures, not on how much it checked.** Its coverage count moves
  whenever any number in any sentence is edited, so baselining it produced four meaningless
  drift bumps in one session and would have trained the next author to rewrite the number
  without reading it. It now reports coverage for a human and is graded only on whether
  anything is wrong. `run_hr3`, `run_contract` and `run_inspect` keep their counts in the
  baseline on purpose — theirs move when a real decision is made.

## [Alpha 1.9.0] — 2026-07-29

### Changed
- **The manual now reads in both unit systems — US customary first, SI in parentheses.**
  `2235 psi (15.41 MPa)`, `579.2 °F (304 °C)`, `28.5 inHg (96.5 kPa)`, across all 14 operator
  documents. US first because that is what the PWR board reads; SI alongside because that is
  what the engine computes in and what every setpoint in the source is written in. Conversions
  and rounding match the product's own `conv()` / `fmtInstrValue()`, so a number in the manual
  is the number on the gauge.
  **Temperature differences convert without the +32 offset**, and that distinction is the
  reason this needed care: subcooling margin, leg ΔT, DNB margin, control deadbands and
  cooldown rates are differences, so full-power subcooling is **73.8 °F (41 °C)** — applying
  the absolute rule would print 105.8 °F and make a thin margin look comfortable.
  New gate **`test/run_manual_units.js`** (182 checks) re-derives every US value from its SI
  partner and fails three ways: bad arithmetic, an SI quantity left without a US partner, and
  a difference converted with the absolute rule. The convention itself is documented in
  `Manuals/README.md` §Units.
  This also resolves the long-standing gap behind the `verify_e2e_ui` units xfail — the manual
  is now correct at either toggle setting rather than needing to re-render on it.

### Fixed
- **Manual currency audit — the manual now matches the plant it documents.** Every trip,
  actuation, alarm, failure, automation channel, instrument, engine command, initial condition
  and campaign mission was dumped from the live plant and diffed against the manual set. What
  the diff found:
  - **A protection function the manual never documented.** This plant adopted **Reactor Trip
    on Turbine Trip (P-9, ≥ 50 % power)**, and the manual still told the operator to ride a
    turbine trip out — **09 §2.0** had no row for it, **06 PWR-A22** said "verify SCRAM if
    required by plant", and **07 PWR-E03** said "possible reactor trip depending on
    severity/response". All three corrected, with the distinction that matters spelled out:
    a **load rejection** is ridden out, a **turbine trip above P-9 scrams**, and a **planned
    offline is neither**. Permissives **P-9, P-11, P-12** added to the permissives table.
  - **The cold end of the plant was still documented as narrative.** Six documents — **01**,
    **02**, **08**, **09**, **10** and the **README** — still said Mode 4/5 were `[narr]` and
    that there is no cold initial condition, long after the Mode 5 ↔ 1 path shipped on
    integrated physics. Cleared everywhere, with `cold_shutdown` added to the Free Play
    initial-condition tables and its board lineup described.
  - **Two board controls the manual never mentioned.** **Circulating-water inlet temperature**
    (new **03 §13.1** — the summer derate, the winter uprate, and the floor it puts under an
    RHR cooldown) and the generator **FOLLOW / MAN / OFF** selector (**03 §12.1**), including
    why selecting a load mode does not un-trip a tripped machine.
  - **A command reference that named a command no control issues.** `set_letdown_flow` →
    `set_letdown_orifices`; added the grid, CW-temperature, AFW-block and accumulator-valve
    commands.
  - **UI drift.** The **System Scanner** was still described as one-line hover text (**02
    §3.4** now documents both tiers and the 📖 deep link), **02 §9.0** still described the
    retired generated manual, and a `900 MWe` load target survived on a 100 MWe plant.
  - **03 §16.0** gained `sg_steam_flow` and `cw_inlet_temp`, plus the trap that
    `steam_flow` is turbine flow alone and reads ~0 while the dump carries the plant.

  Verified unchanged and correct: all 30 alarm setpoints, the 17 automatic actuations, all 23
  failures, the 34 campaign missions, the per-initial-condition normal values in 09 §11.0, and
  the rod-drive, pressurizer-band and damage-limit tables.

### Added
- **The manual now says what the simulator actually computes — `12_SIM_PHYSICS.md` (#203).** A new
  chapter, **Simulation Physics & Model Scope**, in the in-app manual between the crosswalk and the
  revision history. It covers the model class and the fixed 0.02 s step (and what time acceleration
  really does — more steps, never a bigger step), the per-step computation order, point kinetics and
  the six-term reactivity balance, the thermal nodes and the **four ways heat transfer degrades**
  (DNB at the core exit, uncovery, the exposed-cladding hot node, SG tube-bundle dryout *and its
  depletion*), the one-pressure-state primary with its quasi-static node ΔPs, the derived pressurizer
  level that makes the TMI deception arithmetic rather than a trick, the secondary and its declared
  steam-dump cliff, and the instrument layer that sits between truth and the operator.
  Three sections are the point of the chapter: **§11** the engine ↔ control-layer boundary (the
  engine models hydraulics and decides nothing — even code-safety logic reads an instrument);
  **§12** the deliberate simplifications, each answering *does this change what I should do?*; and
  **§13** what is not modelled at all, so an indication you expect and cannot find is understood as
  absent rather than hidden. **§14** grades numbers by how much to trust them — structural,
  calibrated, deliberately time-compressed, or display flavour.
  Written from the as-built engine and config rather than from prose, and it names the places the
  trainer is *harsher* than reality: **no natural circulation** (flow decays to zero on pump loss)
  and **no sensor voting** (one failed transmitter is decisive).
  Also corrected `01_GENERAL_DESCRIPTION.md` §8.0, whose cold-ops row still said Mode 5/4 was
  narrative-only and that Free Play starts in Mode 3 — both stale since the Mode 5↔1 transition
  shipped on integrated physics.
- **The `true_state` contract is now documented in full, and gated (#225).** All **29**
  PWR fields that `getTrueState()` emits but `Blueprint/CONTEXT.md` §6.3 never described
  are documented — the loop pressure distribution (`p_coldleg`/`p_hotleg`/`p_pumpsuction`),
  RCP cavitation (`suction_subcool_c`, `rcp_cavitation_frac`, `rcp_cavitating`), the two
  distinct void fractions, wide-range SG level, `steam_out_total`, `clad_temp_c`, the AFW
  block/discharge state, plant MODE and heatup rate, load mode, `turbine_tripped`,
  `destruction_cause` and the accumulator/condensate/discharge-pressure indications. Several
  carry the trap that made them worth documenting — `steam_flow_normalized` is TURBINE flow
  alone and reads ~0 whenever the dump is carrying the plant, `sg_level_pct` pegs on an
  overfill while `sg_level_wide_pct` keeps reading, and `accumulator_pressure_mpa` is
  indication only (injection is gated on the fixed setpoint, not on it).
  New gate **`test/run_contract.js`** diffs `Object.keys(getTrueState())` against the §6.3
  block and fails in **both** directions: an undocumented field, or a documented field the
  engine no longer emits. Nothing had ever compared the two, which is how the gap reached
  41-of-82 — and how #144 came to be filed against a field that *was* documented. PWR only;
  the RBMK/BWR blocks are registered `skip` (on hold, never audited).
- **The board explains itself — the inspection system (#96, merges #69).** The **System
  Scanner** block on the right column is now a two-tier inspection surface. Point at
  anything and it names the object and says what it does in one line; **click the block to
  expand it** and the same hover gives the full account — how the thing behaves, what it is
  wired to, and the trap that catches people — plus a **📖 Manual** link that opens the
  operator's manual at the exact section documenting it. The choice is remembered between
  sessions. Coverage is the whole PWR board: **160 authored entries** across every card,
  control, component and indication, sourced from `Manuals/03` + `09` rather than written
  from memory, with a containment fallback so an unlabelled caption answers with its card
  (and says that it is doing so). The shell chrome, the gauges and the **active alarm tiles**
  carry the same two tiers — a tile's detail is generated from the plant's own protection
  table ("Comes in when Average Coolant Temp falls to 552.2 °F"), including the #240
  reclassification note, so it cannot drift from a retune.
  **No hover highlight** (owner, 2026-07-28): an early cut ringed whatever the cursor was
  over and it read as noise. The Instructor's blue glow and the checklist's green preview
  glow are untouched — those point at something you did not choose.

### Changed
- **A cold plant no longer annunciates its own lineup as a casualty (#240).** A fresh Cold
  Shutdown (Mode 5) run spawned with **five standing unacknowledged alarms, two of them
  critical** — Pressurizer Pressure Very Low, RCP Trip, Pressurizer Pressure Low, Low
  Coolant Temperature, Turbine Trip. Every one of those conditions is *true*, and every one
  is what a planned cold shutdown is supposed to look like: the RCS is deliberately cold and
  depressurized, and the reactor coolant pumps are deliberately stopped. Annunciating that as
  a depressurization event with tripped pumps teaches the operator that a board full of
  standing criticals is normal — the exact habit this simulator exists to break. Those five
  now **reclassify to Status and reword to say why** ("expected, plant is cold";
  "Reactor Coolant Pumps **Secured**"), and a reclassified tile shows what it is normally
  classed as (`status (normally critical)`). **Nothing is hidden**: the alarm still comes in,
  still reads its instrument, still acknowledges. Two deliberate limits — **Mode 3, Hot
  Standby is excluded**, so a real depressurization or loss of the pumps post-trip reads at
  full severity; and the RCP annunciator keys on the **handswitch**, not the mode, so pumps
  lost to a trip, coastdown or blackout read **RCP TRIP, critical** in any mode, including
  Mode 5. Manual: new **06 §2.0** table with the exclusions, cross-referenced from **09 §4.0**.
  Owner ruling 2026-07-28; the design is sourced to NRC **NUREG-0700 Rev 4** (ML26022A094)
  §4.1.2-7 *Mode-Dependence Processing* and Table 4.1, whose own worked example is a
  low-pressure signal expected in cold shutdown.
- **Status-class annunciators arrive pre-acknowledged (#240, owner ruling 2026-07-29).** A
  **Status** tile reports a lineup, not a demand for action, so the board now acknowledges it
  as it raises it: it comes in lit and steady instead of flashing with an ACK outstanding, it
  is not counted in the Alarms header, and it no longer drops fast-forward back to real time.
  A healthy Cold Shutdown spawn therefore presents its five standing annunciators and **asks
  nothing of you** — while every condition is still on the board, still reading its own
  instrument, and still clearing itself when it goes away. This is the whole Status tier, not
  only the reclassified tiles: **HPI/LPI ACTIVE** and the BWR's **RCIC RUNNING** have never
  required action either and demanded an acknowledgment anyway. Critical, Warning and Caution
  are untouched.
  If a Status tile's condition stops being planned — you heat past Mode 4, or a pump you had
  secured actually trips — the annunciator **escalates to its normal priority and
  un-acknowledges itself**, so it flashes then; an acknowledgment the *operator* made is never
  taken back. Same source: NUREG-0700 Rev 4 Table 4.1 *Status-Alarm Separation*, "separates
  status annunciators from alarms that require operator action."
  This also cleared a filed **BWR** defect that was never a BWR defect: `bwr_startup` step 2
  failed the full-stack procedure gate (#208) because at t = 2 s the RCIC RUNNING status tile
  arrived on a quiet board, snapped the harness's declared 10× acceleration to 1×, and left
  the procedure covering a tenth of the sim time its steps assume. Ten other dropouts in that
  gate still do this — filed as a harness defect, not fixed here.
- **Two annunciators the manual never documented are now written up** — **LO TAVG (P-12)**
  gains a full response procedure (**PWR-A29**) and **RCP CAVITATION** its setpoint row. Both
  were modelled and both were missing from the alarm index.
- **Taking the generator off line is no longer a turbine trip (#230).** `disconnect_grid`
  — the OFF position of the generator selector, and the command every "take it off line"
  step issues — called the turbine-trip path. The stop valves slammed, `turbine_tripped`
  latched, and above the P-9 power permissive (50 %) that trips the reactor. Measured: a
  planned disconnect at full power scrammed the plant instantly, and one during a heatup
  latched a trip at 5 % power that sat armed for the whole evolution and scrammed the
  reactor the moment power later crossed 50 %. Opening the generator breaker is now what
  it says it is — load to zero, the unit off line, **nothing tripped and nothing latched**,
  and `connect_grid` re-synchronises. A real turbine trip still arrives by its own routes:
  the low-vacuum and overspeed protection, the turbine-trip failure, a reactor trip, or
  closing the MSIVs at load. The plant already modelled the ride-out separately (a full
  load rejection with the turbine on line), so this was a mis-wired command, not a missing
  behaviour. The board's OFF lamp now reads the unit's online/offline state rather than the
  trip flag, so it lights either way. New behaviour probe **TR-1d** pins it, and
  `board_check` gained 11 checks over the FOLLOW/MAN/OFF selector.
- **The six vital tiles open with their trend line already drawn** (owner-directed). Each
  tile plots the last three minutes, and it used to start from nothing — so for the first
  three minutes of every session the trace was a short stub against the right-hand edge,
  with the area fill's vertical riser stranded in the middle of an otherwise empty card.
  It read as a rendering fault rather than as an empty buffer. The tiles now preload a
  full three-minute window, **flat at the first reading**, the same steady-state preload
  the strip chart below already takes: the board opens looking like a plant that has been
  running at a stable operating point, which is the condition it is actually handed to you
  in. The preload is flat by design — it asserts only that the reading was steady, and
  never invents an excursion the plant did not have. Live data continues from it and
  scrolls the preload out over the following three minutes.

### Added
- **Feature flags: what the public site offers vs what is still being vetted (#241).**
  Content ships in one bundle with the sim, so anything half-checked went live the moment
  `develop` merged to `main`. There is now a registry — `site/flags.js` — that says, per
  feature and per piece of content, whether it is `public` (shipped) or `preview` (in the
  build, offered only on the development channel). The channel is stamped at deploy from
  Vercel's environment (`site/channel.js`: production = `main` = `public`, preview =
  `develop`), so the same file gives a different answer on either side of a merge and
  nothing is hand-edited per branch. **A gated area shows a COMING SOON panel** in the
  Plant & Mission window rather than an empty tab, gated items are simply not listed, and
  landing-page copy that promises a gated feature swaps to an honest sentence
  (`data-flag` / `data-flag-off`). A 🧪 **Features window** (Sim tab, development builds;
  `?flags=1` anywhere) lists every flag with its stage and a switch, and a **view as
  public/preview/dev** control re-resolves the whole app so you can look at `develop`
  exactly as a visitor will. Overrides are per-browser and never change what ships.
  **Initial state, by owner decision:** Free Play and the operator's manual are public;
  the training campaign, scenarios, walkthroughs and live checklists are `preview` until
  each has been played through and its line moves to `public`.
  New gates: `test/run_flags.js` (registry coverage + resolution rules — new content
  cannot ship unconsidered, a rename cannot silently drop a feature) and
  `test/verify_flags_ui.js` (the control room actually obeys the flags, asserted on
  visibility against a pinned production build).
- **UI/UX pass from the #237 review** (owner-directed). The instructor card no longer
  steals the column on a message — new content while it is collapsed cues a count badge
  and a brief glow on its header instead, and the player owns the layout: the persona
  header (now visible in chat mode too, showing the scenario title) collapses/expands the
  card in every mode, re-clicking the active tools tab collapses the tools, and all three
  layouts (instructor max / split / tools max) are reachable during a scenario — the old
  model locked a permanent 50/50 after one tab click. Alarm tiles carry a `T+hh:mm:ss`
  annunciation stamp (newest-first within each severity) so post-event sequence diagnosis
  reads off the panel, and Ack All reports how many alarms it silenced. Vital-tile trend
  arrows gained a deadband with hysteresis — an arrow only lights when the displayed value
  has actually moved a display digit over the trend window, so steady state shows steady.
  Authored scenarios can now lock the Failures tab (`ui_policy.failures: 'locked'` — the
  TMI-2 chat scenarios do), a transcript-level "⏩ reveal all" catches up re-paced dialogue
  after a rewind, and the Help overlay finally explains how to aim the free-play rewind.
  **ROD AUTO is now on the board**: the rods_tavg channel had no control anywhere in the
  shipped UI — a toggle on the rod-control card fixes the campaign's unplayable directive.
- **Owner-directed board polish (#237 comments).** Presets start with **30 minutes of
  steady-state trend history** — the strip chart and gauge sparklines are populated from
  the first frame instead of looking like the plant just appeared. The pressurizer gained
  a **temperature indication** and a **live heater-power indication** (reads the actual
  auto-controller output, not the commanded setting). **Hot/cold color contrast is
  retuned**: the at-power RCS band now owns most of the temperature ramp, so the cold leg
  reads green against an orange-red hot leg (they were adjacent yellows). The
  pressurizer's internal spray pipework follows the live cold-leg temperature instead of
  a fixed blue; the SG feed nozzle moved down so the feed line runs level with its tee;
  and clicking the **SIMULATION PAUSED** box now resumes the sim.
- **The SI units toggle is scoped instead of mixed** (owner call): the PWR board renders
  US customary throughout, so the SI position is disabled with an explanatory tooltip
  while the PWR is active (full SI board support is tracked in #238). The stale "Automate
  tab" phrasing (~30 player-facing directives pointing at a removed tab) is swept — every
  procedure, scenario, campaign line, and manual section now names the board control that
  exists (STEAM GEN FEED → AUTO, ROD AUTO, BORON → ON), and the manuals are repacked.

### Fixed
- **The board no longer shows flow that isn't happening** (#236). Pipe dash animation now
  follows the plant everywhere: a Cold Shutdown plant reads still (previously 23 of 37
  pipes animated — the whole primary loop, main steam, and the feed train "circulated" on
  a dead plant), a pump that spawns stopped stops its pipes from the first frame, the
  PORV relief line no longer streams steam into a shut valve in every state (it only flows
  when the PORV is actually relieving — the TMI tell the tailpipe temperature already told
  honestly), the AFW line agrees with itself (both halves gate on measured flow), the MSIV
  goes still with no steam, and an unloaded turbine stops its inlet and exhaust lines. The
  Mode 5 → Mode 1 missions now *show* what starting the RCPs, feed, and steam changes.
  Also: the RCP was plumbed backwards (loop entered at the discharge nozzle, patched into
  looking right) — its suction/discharge semantics are now correct via an idempotent doc
  patch, so anything future keyed on port meaning renders true.
- **V2 board defects from the #235 verification sweep.** The ECCS card's MODE readout was
  dead (wired to a snapshot section that never carried it — it now reads the control state
  and shows **RHR** in the shipped Mode 5 lineup from t = 0); the turbine no longer holds
  1800 rpm on a cold steamless plant (the unloaded rotor branch gained the windage term it
  was missing, and zero-load states spawn with the rotor at rest); the strip-chart legend
  prints ranges in the display unit with proper separators (it printed raw internal SI
  beside imperial chips); the STEAM DUMP readout no longer clips its label or sits under
  the dump valve tile; the DUMP SETPOINT range hint fits its box; the NIS caption reads
  "Δ TEMP AVG". `board_check` grew from 59 to **79** checks and now pins pipe animation
  against plant state in three states, so none of this can regress silently.
- **Decay heat no longer vanishes through an un-scrammed power reduction** (#229, #132).
  Total core heat is now prompt fission power plus the tracked decay-heat inventory,
  unconditionally (`Q = 0.93·P + decay`) — exactly identical at every steady state and
  post-scram, but through a fast runback the ~5 % residual above the new power level now
  persists on its real ~33-minute tail instead of disappearing the instant the rods move.
  This also removes a step discontinuity in the old form's power-vs-decay switch. With the
  residual real, turbine **follow mode now draws the reactor's thermal output rather than
  its flux** (like a real pressure-mode follow governor): during a down-power the turbine
  carries the decay residual — grid output briefly reads above nuclear indication, which is
  true of real plants — and the return to power runs slightly cool while the decay
  inventory rebuilds. A daily 100→50→100 % load-follow cycle completes cleanly where it
  would otherwise bank the residual into a pressurizer-level trip. The normal-shutdown ops
  probe now takes the generator offline before hot standby — the real procedure step it
  could previously skip because a flux-tracking governor stopped drawing on its own.
- **A core held partially uncovered is now damaged, as it must be** (#213). Previously the
  fuel model averaged the whole core, so with inventory anywhere above 50 % the fuel read
  fully cooled — a plant could sit at 60 % inventory (top of core exposed) indefinitely
  with no consequence, when that exact condition destroyed the TMI-2 core in under an
  hour. The engine now tracks a **peak exposed-cladding temperature** (`clad_temp_c`):
  between top-of-core uncovery (70 %) and significant uncovery (50 %) the exposed clad is
  steam-cooled only and heats at decay-heat rates; damage and melt are judged at the peak
  of clad and bulk fuel temperature. Held at 60 % inventory, clad failure now arrives in
  ~34 minutes; a prompt reflood still quenches the node with no damage, and all existing
  meltdown paths and LOCA recoveries are unchanged (`run_meltdown` 8 → **9** with the new
  MD-9 partial-uncovery path).
  *Migration note:* the new `clad_temp_c` state field is lazily initialized on the first
  step (to the hot-leg temperature), so saves written before this change load unchanged.

## [Alpha 1.8.2] — 2026-07-28

### Fixed
- **The vital-parameter tiles no longer flicker at all.** The previous fix stopped their
  coloured bands changing every frame, but the tiles still tore down and rebuilt their band
  rectangles and trend polylines from scratch on every repaint — about ten times a second —
  which lets the compositor present a half-built frame. Those elements are now reused and
  updated in place: measured over five seconds of steady running, the tile adds and removes
  **zero** DOM nodes where it previously churned continuously.
- **The tile trend lines are properly smooth.** They now take a sample on every plant step
  (~10 a second, up from 2) and are plotted against **time** rather than sample number, so the
  line scrolls at a constant rate instead of stretching and compressing while its buffer fills.
  The window is still a true three minutes at any time-acceleration.
- **The numbers beside the bottom graph no longer overlap.** They are spread apart when traces
  converge, but the minimum spacing was a fixed percentage that worked out to 19 px against a
  21 px number — so the spreading left them two pixels short of clearing each other. The gap is
  now measured from the number's real height, and if the column ever cannot fit it distributes
  evenly instead of piling up at the top edge.

## [Alpha 1.8.1] — 2026-07-28

### Fixed
- **The vital-parameter tiles no longer flicker**, especially during a transient. Their
  coloured bands are recomputed live from the plant (the Tavg band follows load, the pressure
  band follows your setpoint), and the un-rounded edges were changing on every frame, so the
  tile rebuilt its gauge about ten times a second. The edges are now rounded to whole display
  units, so a band steps once when it means something instead of shimmering continuously.
- **Readings no longer overlap their own captions.** A units bug in the board's DOM helper
  emitted `line-height: 1.1` as `1.1px`, which collapsed each tile's caption to a 1-pixel line
  box and let the reading paint on top of it. The same bug silently dropped every numeric
  `font-weight`, so text meant to be bold was not.
- **The tile trend lines are smooth.** They were sampling once per *frame* rather than once
  per plant step, which covered barely thirty seconds of plant history as a coarse staircase.
  They now sample on simulated time, so the trace is a true three-minute window at any
  time-acceleration and reads like the strip chart underneath it.

### Added
- **Low coolant temperature alarm (P-12).** The board annunciated high Tavg and tripped on it,
  but had nothing at all on the cold side — so an overcooling transient lit no warning, and the
  temperature tile's scale ran unbounded to the bottom of the meter, leaving the operating band
  an unreadable sliver. There is deliberately no low-Tavg *trip*: a PWR does not scram on low
  coolant temperature, and the real cold-side protections are this interlock and low-temperature
  overpressure protection.

### Changed
- **The average-coolant-temperature tile is scaled to the mode you are in** — the hot operating
  window when the plant is hot, and a cold-shutdown window below Mode 3 — instead of always
  spanning the meter's full 50–660 °F. The green programme band is now a readable width rather
  than a hairline in a field of grey.

## [Alpha 1.8.0] — 2026-07-28

### Added
- **New control-room diagram (V2).** The PWR board was re-authored in the Claude Design
  "PWR Reactor" builder and rebuilt here: 189 items, 37 pipes. What changed for you:
  - **A vital-parameter strip across the top** — reactor power, Tavg, subcooling margin,
    primary pressure, pressurizer level and SG narrow-range level, each with a live trend
    sparkline and a full-scale band. The bands are the plant's own trip and alarm
    setpoints, read live from the protection tables, so a tile agrees with the annunciator
    rather than approximating it. This replaces the old gauge strip in the shell, which
    showed the same six readings a second time.
  - **RHR has its own card** — `ALIGN` / `ISOLATE` / `AUTO` plus an `HX FLOW %` knob. RHR
    is a suction alignment on the shared ECCS pump, not a pump of its own, which is why it
    aligns rather than starts. The hot-leg suction valve is interlocked at 400 psi: press
    ALIGN above that and the button visibly refuses to latch. The HX knob is your
    cooldown-rate control and stays live under AUTO.
  - **Steam dump setpoint is now a control** (29–1350 psi), sitting under the steam-pressure
    reading so the gap between them is legible — at power the SG runs ~819 psi against a
    1194 psi setpoint, which is *why* the dump is shut. Lowering it is how you cool the
    plant down through the steam generator.
  - **ECCS alignment readout** (`off` / `HPI` / `LPI` / `RHR`) — one pump, and this says
    which of its two suctions it is drawing from.
  - **AFW now reports RUNNING / STANDBY / SECURED.** STANDBY means armed and waiting for a
    low-level signal; SECURED means you stopped it and disarmed the auto-start. Note the
    run indication reads pump *demand*: with the discharge valve shut it will say RUNNING
    while flow reads zero and discharge pressure pins at shutoff. That divergence is real,
    and it is how TMI-2 went wrong.
  - **Trend and alarms moved under the diagram**, freeing the middle column so the board
    gets the width it needs.
- **Circulating-water temperature is now a control** (40–100 °F, on the condenser cooling
  card next to the vacuum reading). Warmer cooling water means the condenser can only pull
  down to a warmer saturation temperature, so you lose vacuum, lose output at the same
  steam flow, and sit closer to the low-vacuum turbine trip — the summer derate. It also
  raises the RHR heat exchanger's sink, so a cooldown bottoms out warmer: ~28 °C on cold
  water against ~61 °C on hot. At the default 80 °F the plant behaves exactly as before.

### Added
- **The core glows.** The reactor vessel now renders Cherenkov radiation — the blue light a
  real core gives off underwater. It is driven by **fission rate, not by the rod position or
  the reactivity**, so it is completely dark on a shutdown reactor and grows and widens as you
  bring power up. Watching it come in as you pull rods is the point.
- **You can resize the panels.** Drag the inner edge of the simulator panel, or the top edge of
  the trend/alarm strip, to trade space with the diagram. Your sizing is remembered.

### Changed
- **The diagram is much bigger by default.** The trend strip and the simulator panel were both
  set to absorb whatever space the diagram did not need — but a shorter diagram needs less
  width, which freed more width for the panel, which shortened the diagram again. Both panels
  now start at a sensible fixed size and the diagram keeps the rest; the panels still take up
  spare space when your window shape leaves some, which was the intent all along.
- **The board sits still unless something is happening.** Three separate causes:
  - Every indication is now **damped the way a real panel meter is**, so a reading drifts
    across its band instead of snapping limit-to-limit between samples. Measured at steady
    full power, the last digit on the average-coolant-temperature tile now changes about
    **3 times a minute instead of 218**, and reactor power — deliberately the liveliest
    indication on the board, because excore power genuinely wanders — about 35 instead of 213.
    The damping is per-indication: RTDs are heaviest, steam-generator level lightest, because
    its bounce is the water really moving rather than the sensor wobbling.
  - **An indication that is off now reads zero.** Noise scales with signal, so a stopped ECCS
    pump indicates a still 0 gpm rather than hunting around 1, and a shut-down reactor's power
    meter sits on zero. This also means excore power can be lively at 100 % and quiet at 1 %,
    which it could never be with one fixed number.
  - A damped meter never hides a real event: past a few sigma of change in one step the
    damping is bypassed, so a scram or a break still reads instantly.
  - The **ECCS pipework no longer animates with the pump stopped** — it was reading that 1 gpm
    of noise as real flow.
- **The vital-parameter bands follow the plant.** The green band on average coolant temperature
  is now the *sliding Tavg program* — the same reference the rod controller is driving to — so
  in Mode 1 you can see the band you are actually holding, and it slides as load changes. Below
  Mode 3 it becomes the cold-shutdown band instead. Primary pressure's green band follows your
  live pressurizer setpoint rather than the rated one, so it stays meaningful in Mode 5.
- **Shutdown rod buttons latch.** One click drives the bank fully in or fully out on its own;
  the button holds a yellow in-motion light while it travels; a second click stops it where it
  is. It was press-and-hold, which is the wrong control for a bank that is only ever parked at
  one end or the other.

### Fixed
- **Flow dashes in the tees and cross now flow.** They were jittering back and forth instead of
  moving along the pipe: the fittings were being rebuilt from scratch on every update, which
  restarted the animation about as often as one dash-length took to travel. They also now share
  one dash grid anchored to the diagram, so dashes cross a joint without stepping.
- **Two crooked pipes straightened** — the PORV discharge now drops straight down into its box,
  and the turbine-to-condenser run is square instead of leaning (issue #232).
- **Board polish from the V2 playtest** (issue #231). Three things you can see:
  - **The pressurizer no longer sits off its own pipework.** Its centreline was 6 px left of
    the surge tee below it and the PORV block valve above it, so the surge line and the relief
    tap each ran slightly out of plumb between two horizontal flanges. Both now line up.
  - **Fittings flow at the same speed as the pipes they join.** Tees and the cold-leg cross
    animated their dashes 55 % faster than the runs either side, so the flow visibly stepped at
    every joint. Both now read their speed from one shared rule.
  - **The vital-parameter tiles sit still.** Average coolant temperature, subcooling margin and
    pressurizer level were jittering roughly three times a second — Tavg by 2.5 °F peak to peak,
    which is not what those instruments do. Tavg comes from RTDs in a damped bypass manifold and
    barely moves; pressurizer level is a steady differential-pressure reading. Both are now ~3x
    quieter (Tavg ±0.2 °F). Reactor power and steam-generator level are **unchanged and still
    lively on purpose** — excore power genuinely wanders, and narrow-range SG level really does
    bounce with boiling and shrink/swell. That contrast is now a real reading, not an artefact.
- **Saving mid-scenario could strand you on a step you had already done** (issue #142). Some
  scenario beats wait for you to *do* something — open a valve, switch load mode. The record
  of having done it was not written into the save, so if you saved (or hit an automatic
  checkpoint, or rewound) between the action and the beat reacting to it, the instructor came
  back believing you had done nothing. On a one-shot action there is nothing to repeat, and
  the scenario had no way forward. The same save also reset how far a walkthrough step had
  progressed toward its acceptance check, quietly costing you up to five evaluations of
  credit. Both now survive a save. Older save files still load and behave exactly as they did.

## [Alpha 1.7.1] — 2026-07-27

### Changed
- **The steam dump's temperature reference now slides with turbine load** (issue #219). It was
  pinned to the no-load anchor, which meant that at full power the dump's error signal was
  already saturated — the demand carried no information about how big the event was, so a
  load-mismatch cap had been added on top to put that information back. The reference is now
  the same sliding Tavg program the rod controller already runs, so the demand is proportional
  to the size of the rejection on its own and the cap is gone. On a 41 MWe rejection the plant
  now settles at 99.2 % power instead of overshooting to 102.7 %; a full rejection peaks at
  Tavg 305.3 °C. A turbine trip is unchanged by construction — at zero load the program
  collapses onto the old no-load anchor.

- **The steam dump's load-rejection arm is a declared simplification, not a hidden edge**
  (#219, owner ruling). A rejection just below the arm threshold gets no fast dump and, left
  alone, ends at the PORV — that is the operator's manoeuvre to handle, and the relief valve
  is the honest backstop. Written up as simplification §8.8 and pinned on both sides by a new
  behaviour probe, so the boundary cannot move without the gate saying so.

### Fixed
- **A pressurizer spray valve stuck open healed itself the moment you touched the spray
  controls** (issue #200). The failure was encoded by writing `spray_override = true` — a
  boolean shoved into the *operator's own demand field* — so pressing SPRAY AUTO or moving
  the spray % slider simply overwrote the failure and the stuck valve un-stuck. A stuck
  valve is mechanical, and now behaves like one: `s.spray_stuck` in the engine, with the
  pressurizer forcing the valve open past both the auto controller and any operator demand,
  exactly as `porv_stuck` already beat `porv_demand`. Note the controller still reads AUTO
  while the valve sits open — the controller genuinely *is* in auto, the valve just isn't
  listening, and that gap is the lesson.
  *Save migration:* a save carrying the old encoding keeps its failure instead of silently
  healing on load.
- **The residual-heat-removal system is called RHR everywhere** (issue #145, owner ruling). It
  was named both ways: the tab said RHR, the control label said "Decay-Heat Removal (DHR)", and
  the glossary hedged with "DHR / RHR". The control label, the manuals and the glossary now all
  read **RHR**. The `set_dhr` *command* still works — old saves depend on it — and is documented
  as a deprecated alias.
- **Fifteen instruments printed their raw internal id as their name in the reference
  manual** (issue #145). `startup_rate`, `charging_flow`, `sg_steam_flow`, `sg_level_wide`,
  `hpi_flow` and ten more fell through the generator's display-name table and were listed as
  e.g. "startup_rate — startup_rate". They now read as "Startup Rate (SUR) — how fast power
  is changing, in decades per minute". The boron entry is now explicit that it is a
  chemistry *sample*, not a live board indication.
- **The in-sim plant picker offered plants that have no control room** (issue #119). The
  Plant & Mission window listed all four engines as live, selectable cards: picking RBMK or
  BWR switched the plant and dropped you onto a board that was never extended to it. The
  landing page had said "COMING SOON" for months; the picker one click inside had not. The
  three held plants now render greyed with a COMING SOON badge and are inert. The `?engine=`
  URL override still reaches them deliberately — it is the dev/test route into those engines.
- **The front page described a different reactor than the one you operate.** The PWR card
  read "Westinghouse-style four-loop plant"; this plant is the **SLX-100 — a single-loop,
  single-SG, single-RCP 100 MWe unit** (`pwr_config.js` identity block, owner ruling
  2026-07-21). Retiring stale four-loop copy was already on the feel-plan's cleanup list.
- **The landing page now says the control room needs a desktop.** It renders on a phone but
  is not operable on one, and nothing said so (issue #127).
- `test/audit_manual_controls.js` wrote its report into a dead agent scratch directory under
  the OS temp dir (a hardcoded session id). It now writes to `Diagnostic/`, with an optional
  argv override (issue #159).

## [Alpha 1.7.0] — 2026-07-27

### Added
- **Reactor Trip on Turbine Trip (P-9).** Above ~50 % power a turbine trip now trips the reactor,
  as a real Westinghouse plant does — the stop valves slam, the heat sink is gone, and protection
  anticipates rather than waiting for a process limit. Below 50 % it is bypassed automatically
  (that is what the P-9 permissive *is*), because there the plant genuinely can ride a turbine
  trip out on the steam dump. The behaviour catalog had been pinning the wrong event entirely:
  its ride-out probe injected a **turbine trip** while describing a **load rejection**. Those are
  different events, and both are now covered — a load rejection rides out at power, a turbine
  trip scrams.
- **The steam dump now catches a load rejection, not just a turbine trip.** Its fast-open mode
  only ever armed on a turbine trip, so a rejection with the turbine still on line waited on SG
  pressure and spiked the primary. On a full load rejection: peak Tavg **319.5 → 305.2 °C**, the
  PORV no longer lifts, and the dump carries 98 % — the plant's ride-out character now holds for
  the event it was always claimed for.
- **STEAM FLOW indication on the board** (issue #206, owner ruling). The board showed feed
  flow and SG level but **no steam flow of any kind** — so a player holding feedwater in
  MANUAL was asked to match a number that was not displayed anywhere. The feed pump is a
  fixed-demand device: set it to steam flow and level holds indefinitely, set it wrong and
  level ramps to a trip in whichever direction the error points. All the board offered was
  level — the *integral* of the error, and therefore always a late cue. The new readout sits
  directly above SG FEED RATE, right-aligned in the same column and on the same gpm scale,
  so matching is a visual comparison rather than arithmetic. Together with level these are
  the *three elements* the feedwater controller regulates on, which is the prototypical
  arrangement — "three-element" **is** steam flow, feed flow and level read together.
  - It reads **`sg_steam_flow`** (total main-steam-line draw: turbine + dump + safeties),
    **not** the older `steam_flow` (governor/turbine only). That distinction is the whole
    point: with the turbine tripped and the dump carrying the plant, governor flow is ~0
    while the generator still boils hard. Measured through a turbine trip — governor 0 %,
    dump 98 %, **STEAM FLOW 983 gpm**, feed tracking it at 984. Wired the other way the
    board would have read "no steam" during exactly the casualty it matters most in.
  - Guarded by a new assertion in `verify_e2e_ui.js` that trips the turbine and fails with
    a pointed message if the number collapses with the governor.
- **New hands-off protection gate (`node test/run_meltdown_stack.js`).** The same core-damage
  casualties as `run_meltdown.js`, but driven through the **full stack** on the shipped lineup
  with the operator taking their hands off. `run_meltdown` is deliberately engine-direct and
  does not load the control layer at all — so its MD-4 (*"stuck PORV **with HPI** → core
  protected"*) and MD-8 (*"depressurize-to-flood → survivable"*) are **protection** claims
  proven with the operator hand-scramming and hand-starting HPI. In the shipped plant nobody
  hand-starts HPI: M4 scrams on the instruments and actuates SI at 12.4 MPa. This gate asserts
  the automatic chain actually fires **unprompted** — scram without a manual scram,
  `hpi_active` without a `set_hpi` — so a regression in an SI setpoint, an ESF arm or the P-11
  permissive cannot silently turn a documented-survivable path into a melt. **3/3 · 21/21.**
  Measured: the plant trips itself on SG level at 120 s and injects at 121 s; the LOCA band
  0.05–0.20 all scram on low pressure within 19–55 s and inject 1–2 s later.

### Changed
- **Indication noise is now set per indication, not by a global multiplier.** Gauges were
  jittering more than wanted, and the previous fix scaled *every* instrument down to a quarter.
  Measured, only about nine indications were actually misbehaving — feed and steam flow were
  jittering ten times their display step — while pressurizer and SG level, T-avg and the valve
  positions were already right, and reactor power, generator output and condenser vacuum were
  already too *quiet* to move at all. Noise is now sized per indication against what each readout
  can actually show, so the last digit moves occasionally, like a live instrument, instead of
  churning or sitting frozen. The board's separate display smoothing has been removed: the
  instruments already model their own lag, and the extra filter both duplicated it and made the
  underlying numbers meaningless.
- **The startup checklist now takes load control after synchronising** (owner ruling, #211).
  The generator picks up load in FOLLOW — right for getting on line, where the turbine chases
  the reactor — and the checklist then puts it in **MANUAL**, leaving the setpoint where FOLLOW
  put it, already matched to the power being made. This resolves a split nobody had noticed:
  the two routes into Mode 1 disagreed. A player starting from the free-play `hot_full_power`
  preset got **manual** with a matched 100 MWe setpoint; a player who ran the startup checklist
  ended in **follow**. Same plant state, two different load-control lineups depending on how you
  arrived, with nothing explaining why. Both are MANUAL now — measured, both leave an imbalance
  under 1 MWe and no alarms. MANUAL is deliberate, not incidental: it keeps the reactor/turbine
  coupling in the operator's hands, and the new LOAD IMBAL annunciator means the consequence of
  ignoring it is no longer silent.

### Fixed
- **The board now tells you when the reactor and turbine have diverged** (issue #211). A new
  **LOAD IMBAL** annunciator (Panel B, caution) fires when indicated reactor power and turbine
  load differ by more than 4 % of rated — the steam generator is filling or draining.
  `Manuals/09` had documented this annunciator all along and the engine had computed the
  signal all along, but it never reached the instrument layer, so no alarm could read it and
  the control layer never implemented one. The consequence was severe and completely silent:
  in the shipped MANUAL lineup the governor sits at the operator's load setpoint and never
  moves, so reducing reactor power on rods alone leaves the turbine as an unthrottled heat
  sink — measured, Tavg **304 → 247 °C** on a daily load cycle and **304 → 130 °C** (still
  falling) on a normal shutdown, with **no alarm and no trip at any point**. The annunciator
  now comes in at the 4 MWe threshold while Tavg is still 303 °C — about 50 degrees before
  the plant is in trouble. New alarm-response entry **PWR-A28**.
- **Auxiliary feedwater no longer parks the plant in a standing alarm** (issue #207, owner
  ruling). AFW **latches** — once it auto-starts on low steam-generator level it keeps
  feeding until an operator secures it, as in a real plant. Its proportional level hold ran
  full flow below 20 % tapering to zero at 28 %, a control band lying **entirely inside the
  amber 17–30 % caution zone**, so an AFW-only generator settled at **25.1 %** with SG LVL LO
  standing indefinitely — the plant was latched into a permanent alarm by design. The hold is
  now 32 % / 8 % band, settling at **37.1 %**: comfortably green, 7 points clear of the
  boundary, far below the 75 % caution. `run_meltdown` MD-6 (the feed-keyed dryout depletion)
  and `run_behavior` TR-2 both hold.
- **A stranded PID output could feed a steam generator forever** (issue #210). `minDelta`, the
  output deadband that suppresses chatter, was also suppressing the last small step onto a
  **rail**: a channel wanting `u = 0` after last sending 0.13 % never sent again, so a 0.13 %
  feed demand stood for the rest of the run against **zero** steam leaving the generator.
  Measured on `pwr_heatup`: true level 65.0 → 75.8 % across the low-power holds, climbing to
  ~90 %, then collapsing through the 17 % lo-lo when the dump opened. Reaching a bound is a
  state change, not chatter, so it is now always sent. Channels also stopped reporting a stale
  `holding` while sitting 25 points off setpoint with no authority to correct — they now say
  *"at minimum output — no authority to correct"*, the honest answer for a feed controller
  that cannot pump water out. Same family as the anti-windup ratchet fixed earlier, returning
  by a different mechanism.
- **The three-element feedwater controller was blind to the steam dump** — the most
  consequential fix in this batch. `feed_sg`'s feedforward and mismatch trim read the
  `steam_flow` instrument, which is **governor (turbine) flow only**. Whenever the turbine
  is offline or tripped and the dump is carrying the plant, that reads ~0, so the controller
  commanded **zero feed while the generator boiled down**. The engine's own comment
  (`pwr_steam_generator.js:139-143`) had named this exact hazard — *"after a turbine trip the
  dump still draws, and feed must follow THAT or the ride-out silently drains the SG"* — and
  the engine's coupled-feed fallback was fixed for it long ago; the M4 channel never was.
  New **`sg_steam_flow`** instrument (main-steam-line transmitter: turbine + dump + safeties)
  now drives both elements. Measured on a full-load turbine trip: SG level holds **62–67 %
  for 20 minutes** with feed tracking the dump (0.971 vs 0.973) and **no follow-on alarms**;
  previously it drained to **0 %** and scrammed on level lo-lo within 28 s.
- **`pwr_heatup` now actually heats the plant** (issue #206): Tavg **50 → 297 °C**, secondary
  bottled up to the 8.20 MPa no-load anchor, Mode 3 reached. Three procedure defects, all
  invisible below M4: it never blocked the startup net it deliberately walks into (scrammed
  on INTERMEDIATE RANGE HIGH at ~20 % with the plant barely past 100 °C — the same defect as
  the startup checklist's, in the procedure that runs immediately before it); it set a
  standing 30 % manual feed-pump demand instead of engaging Feed AUTO (SG flooded to 94.5 %,
  SG LVL HI HI standing); and it left the turbine in FOLLOW, so once the SG could finally
  make steam the governor took ~46 % of it and the heatup stalled at 240 °C. A residual
  slow SG fill on trickle feed remains, tracked in #206.

### Added
- **New full-stack procedure gate (`node test/run_procedures_stack.js`).** The same authored
  procedures as `run_procedures.js`, but driven through `SimulationService` — M4 + M5 + M6 —
  instead of engine-direct. It asserts the *same* `acc`/`saw`/`guard` predicates, so any
  divergence is attributable to the stack alone, plus four assertions only the stack can
  make: every step command **accepted** (not rejected as unknown, not refused by an
  interlock), **no unexpected scram**, **no critical alarm standing at the end**, and any
  declared `auto_channels` actually engaged. Deliberate scrams (a shutdown procedure) and
  emergency/accident categories are exempted. **22/22 · 154/154 with 13 strict xfails**,
  4.1 s. Built because `run_procedures.js` had been structurally blind twice: it cannot see
  anything the control layer decides.
- **The startup checklist now sets up its heat sink, and blocks its own trips**
  (issue #202, owner playtest). Three new steps in `pwr_startup`: **engage the
  three-element Feed AUTO channel at step 3**, while SG level is still at its nominal
  65 % (the channel captures level as its setpoint, so engaging it late captures a bad
  number); and, once above P-10, **block the IR HIGH and PR 25 % trips as explicit
  steps** rather than discovering the startup net at 20 % power. `run_procedures`
  22/22 · 100/100 checks, unchanged — the three commands are M4/UI actions the
  engine-only harness skips (new `NON_ENGINE_ACTIONS` list).
- **The 1/M "Plot point" button is now visible to the instructor.** Pressing it emits
  `plot_1m_point`, an operator action with no plant effect that the instructor layer
  consumes (M4 never sees it), so the checklist's *"set the 1/M baseline"* step checks
  itself off when the point is actually taken. The plot's points stay UI-side.
- **The release version is shown next to the logo in the control room** (issue #201),
  from a new hand-edited `site/release.js` (`window.RD_RELEASE`). Distinct from the
  `RD_VERSION` git-SHA deploy stamp; bump it with the `changelog.html` entry.

### Fixed
- **The rod insertion limit is now power-dependent, as its own config comment always
  claimed** (issue #202 item 4). `insertion_limit_pct: 30` was a flat % withdrawn floor,
  so ROD INS LIMIT annunciated continuously through every startup — the control bank
  crosses Mode 2 at ~27 % withdrawn and only reaches 92 % at power. The limit now does
  not apply below 5 % power and ramps linearly from 5 % to **70 % withdrawn at 100 %
  power** (three new `[tune]` constants). Measured margin: null at hot standby, 6 % vs a
  62 % bank at the `5_percent` preset, 70 % vs 92 % at full power — so the alarm now
  means "the bank is abnormally deep for this power", which is what it is for. It also
  stops the automatic rod channel inserting past a limit that no longer moves with load.
- **Steam-generator level no longer decays through the whole startup** (issue #202 item
  5). `pwr_startup` never commanded feedwater at all, so nothing regulated level: AFW
  picked it up around 20 % and its proportional hold (band 20–28 %) parked the plant at
  **21.4 % narrow — inside the amber band — indefinitely**. With the new Feed AUTO step,
  measured end-of-procedure level is 65.7 % on a `noDefaults` board (was 46.8 %), 65.0 %
  in free play, and 70.9 % even if the feed pump was manually poked first (was 21.4 %).
- **Checklist hover no longer restacks the PWR board** (issue #202 item 2). The shared
  `.ckl-glow` / `.instr-glow` rules lift the glowed element to `z-index: 5`, which pulled
  a hovered panel in front of the reactor vessel authored to sit over it, obscuring its
  neighbours. Board tiles now keep their authored stacking layer.
- **The startup checklist no longer points the operator at reactivity** (issue #202 item
  3, owner ruling). Reactivity in pcm is truth, not an instrument (HR1), but six approach
  steps graded on `reactivity_pcm` — and the live checklist prints its acceptance
  predicate, so the player was told to watch a reading that does not exist on the board.
  The six approach steps now grade on **source-range count rate** (620 / 1 000 / 1 800 /
  3 300 / 6 200 cps, measured), step 1 on Tavg, and no step's hover-highlight names
  Reactivity any more.
- **The pressurizer cutaway uses the full height of the vessel internals** (issue #192).
  The water band was mapped onto the LVL strip's 160–470 pixel span, so the cutaway read
  as a copy of the gauge beside it; it now spans the inner dome apex to the inner dish
  floor, and the strip keeps its own instrument span.
- **A checklist step is no longer checked off by a different step's trip block.** Command
  evidence matching now discriminates `set_trip_block` by `trip_id` (as it already did
  `inject_failure` by `failure_id`), so blocking the power-range trip does not also tick
  the intermediate-range step.

## [Alpha 1.6.1 and earlier] — up to 2026-07-24

_Everything below this line predates the convention above: it was kept as one running
`[Unreleased]` log and was never cut per release, so it is not separated by version.
`changelog.html` is the authoritative per-version record for these._

### Added
- **Vercel Web Analytics on every shipped page.** A one-line first-party beacon
  (`/_vercel/insights/script.js`) in the `<head>` of `index`, `about`, `changelog`,
  `feedback`, `legal`, `privacy` and `ui/shell.html`. No npm package and no build step —
  Vercel serves the script at the edge for static sites, so `@vercel/analytics` would only
  add a bundler this project doesn't have. The path is root-relative so it resolves the same
  from `/ui/shell.html` as from the top level. Off Vercel (local `npx serve .`) it 404s
  harmlessly. **Requires the Web Analytics toggle to be enabled in the Vercel project
  dashboard — the tag alone records nothing.**
- **Vercel Speed Insights on the control room only** (`/_vercel/speed-insights/script.js`,
  `ui/shell.html`). Real-user load timings for the one page that pulls in the full engine +
  layer + UI script set. Separate Vercel product with its own dashboard toggle.

- **The PWR behavior battery now probes the four protections it had been skipping**
  (`run_behavior` 30 → **34 pass / 0 xfail**, coverage-todo list empty). `PI-3` (reactor trip
  on safety injection — provable only with `lo_press` blocked, since the two setpoints are
  0.01 MPa apart and report the same reason string; plus the P-11 auto-block/auto-reinstate
  legs), `PI-8` (the 97 % going-solid backstop read off the *indicated* level, with the 75 %
  caution 102 s ahead of it and the ride-out swell well clear), `PI-9` (verified — see
  Changed), and the `TR-11` end-state pin (a spray valve stuck fully open is a nuisance, not
  a casualty: under the P5 capacity cap the heaters hold pressure at 15.33 MPa on 37 % duty,
  no trip in 30 min). Two defects found writing them, both filed rather than fixed here: no
  SI on low steam-line pressure exists at all, and `stuck_open_spray` is silently cleared by
  the SPRAY AUTO button or the spray % slider.
- **New meltdown-path test gate (`node test/run_meltdown.js`).** A strict-xfail battery
  (`test/meltdown_pwr.js`) that drives the classic routes to core damage — large-break LOCA,
  TMI small-break, station blackout, ATWS+LOCA, total loss of heat sink, ECCS recovery — and
  asserts the physically correct endpoint (damage / melt / protected). Discovered four
  core-damage-side defects; see Fixed. Now 8/8 — every meltdown path reaches its correct
  endpoint.
- **Live checklists now highlight the controls and indications a step points at — just hover it.**
  Mousing over any step in a running checklist glows the relevant board controls *and* readouts
  (a green preview glow, distinct from the blue "do this now" Instructor glow). Steps carry an
  explicit highlight list where a control alone isn't enough — e.g. the startup steps glow the
  1/M PLOT tool, the Source Range counts, and the Reactivity/Startup-Rate readouts together — and
  otherwise fall back to the step's named control. Works on the checklist bubble list.

### Fixed
- **Closing the MSIV now actually stops a steam line break — it used to do nothing.** The break
  blew the secondary down regardless of valve position, so the one lever an operator has on the
  casualty was decorative, while the manual told you to reach for it ("MSIV Close *if it
  terminates break (as modeled)*") and the behavior catalog claimed "MSIV limits". Break
  **location** is now modelled, which is the distinction a real crew is trained on:
  **Main Steam Line Break (Downstream — MSIV Isolable)** is the turbine-hall break, and shutting
  the MSIV puts the valve between the generator and the break — the blowdown stops, the bottled
  generator re-pressurizes to its code safeties, and you are in the familiar MSIV-closure
  condition. The new **Main Steam Line Break (Upstream of MSIV — Not Isolable)** is inside
  containment, between generator and valve, where nothing on a single-generator plant can reach
  it: you trip and ride the cooldown out. A multi-loop plant would isolate the faulted generator
  and keep steaming the intact ones; this plant has one, and now says so instead of pretending.
  The **Steam Line Break** scenario uses the upstream variant, so its "you cannot stop this"
  story is true rather than accidental, and its ending explains why. With the MSIV left alone,
  both variants behave exactly as the old model did.
  **Save migration:** `_fail.steam_break` gains an `upstream` flag; saves written before this
  default to *downstream*, so a save restored mid-break gains a working MSIV.
- **The startup checklist now plots enough 1/M points to actually find criticality.**
  It asked for three, which puts the predicted critical rod position **79 steps past**
  where the reactor really goes critical — no use at all when the whole method is
  "stop short of the prediction and creep up on it". The early points sit in the flat
  toe of the rod-worth curve, so the trend is too shallow and always extrapolates long
  (two points predict step 409 against a true 224). The approach now takes **six**
  points with the withdrawal bursts shrinking as you close in, which walks the estimate
  down 409 → 329 → 247 → 235 → 232 and lands within about eight steps — still reading
  slightly high, which is the safe side. Each approach step is now one self-contained
  *withdraw, settle, plot*, and tells you what the prediction should read at that point
  so you can watch it converge instead of trusting the first number.
- **The startup no longer coasts to ~15–20 % power when you try to level off in the
  low-power band.** The plant was never the problem — measured, it parks at 1.8–3.5 %
  when you take the excess reactivity out in *one* decisive inward drive released as the
  startup rate nulls, and at 10–20 % (and eventually a trip) when you tap it out a step
  at a time, because the plant keeps running while you tap. Three things were teaching
  the wrong reflex: the startup checklist withdrew ~+430 pcm and took back only ~76,
  named "~5–15 %" as the target, and *passed* on landing above 5 %; a caution blamed the
  overshoot on the trainer's lumped rod group, which the measurement disproves; and the
  startup-rate protection was set where a real startup never reaches it (peak 1.82 DPM
  against a 2.0 DPM alarm and a 2.5 DPM withdrawal block — so on the run that coasted to
  19.8 % and tripped, nothing warned and nothing stopped you). Now: **SUR HI alarm at
  1.0 DPM, rod withdrawal blocked at 1.5 DPM** (clearing below 0.8, insertion never
  blocked); the checklist creeps to criticality at ≤1 DPM, levels off at the point of
  adding heat with one Norm-speed drive, and **crossing the 5 % boundary into Mode 1 is
  now its own deliberate step** rather than something the ascent does to you. Following
  it lands 1.5 % in Mode 2, then 12.4 % and the generator on line — with every phase of
  the ascent peaking below 0.92 DPM.
- **Asking the turbine for more than the plant can make no longer floods the steam
  generator and trips the reactor.** The governor has always capped steam at rated
  output, but the automatic feedwater coupled to the *ask* rather than to that cap —
  so any load target above 100 % fed the SG faster than it could boil, level climbed
  65 % → 89 %, and the plant scrammed on high SG level a minute or two later, with
  nothing on the board connecting the trip back to the slider that caused it. The
  coupling now saturates at rated. Below rated nothing changes, including the
  deliberate feed-vs-steam mismatch you see while a load change is in progress, and
  you can still overfeed by hand on purpose.

### Changed
- **The behavior catalog's last two open interlock rows are settled.** `PI-9` ("SI on low
  steam-line pressure") is **retired** — the signal does not exist, and the measurements say
  it should not: this core cannot return to power on an overcooling even with the most
  reactive rod stuck out of it (better than 9,600 pcm of margin left), a prototype of the
  interlock injected into an intact primary until inventory pegged at its cap, and the one
  case where injection could matter already gets borated water from the accumulators. Real
  plants carry the interlock; this one has no job for it, and the manual now says so plainly
  — along with the fact that pressurized thermal shock is a real concern the model does not
  represent. `TR-11`'s row is **superseded by the earlier spray-capacity-cap ruling** — it
  still predicted "heaters lose, low-P trip unless isolated", which the cap reversed.
- **The AGPL offer of source now resolves.** `legal.html` §5 and `README.md` carried
  commented-out placeholders where the source-repository URL belongs; both now link
  **https://github.com/TH462/Reactor-Dynamics**. AGPL-3.0 section 13 requires a network
  service to offer its complete corresponding source, so an unresolved placeholder was a
  release blocker for going public.
- **Fast-forward no longer collapses the moment a casualty starts.** Acceleration dropped
  back to real time on *every* newly-annunciating alarm, and a casualty annunciates in
  cascades — a large-break LOCA dropped the clock **5 times in its first 3 minutes**, a
  loss of feedwater 6 times, each one needing a manual re-engage. An alarm now drops the
  clock only on an **otherwise quiet board**, which is what an annunciator is actually for:
  drawing the eye to a new condition on a normal board. Once the board is lit and you are
  working procedures, the alarms that follow are the consequences you are already handling.
  A **reactor trip** or a **new equipment failure** still stops the clock regardless. The
  same LOCA now stops once, on the scram; measured in the control room, engaging 60x through
  a loss of feedwater went from **3 manual re-engages to 1**. Standing alarms also mean a
  long cooldown or a Mode 5 heatup — exactly where a long fast-forward is the point — runs
  uninterrupted.
- **New setting: Fast-forward dropout (On / Off).** Turns the behavior above off entirely,
  for running a casualty through at speed. Events still annunciate normally; they just never
  touch the clock. Settings tab; On by default. It is a preference, not plant state, so a
  rewind or a state restore will not change it under you.
- **Strip-chart traces no longer stack on top of each other.** Each series auto-ranges
  independently onto the same plot height, so a steady plant centred all of them and drew
  four flat lines in one place — while leaving the top and bottom of the chart unused.
  Each series now has a **fixed vertical lane**, taken from its position in the list, and
  its band is slid onto that lane whenever the band is fitted. Lanes come out evenly
  spaced across the full height, top-to-bottom in the order the series are listed. Because
  the lane is fixed there is nothing to search and nothing to re-shuffle: two traces can
  never trade places, and a line cannot move unless its own axis re-fits. The slide is
  clamped so the data never leaves its band, which also means a trace with real excursion
  keeps every bit of its zoom and simply doesn't move — it has no room to spare, and its
  shape already tells it apart. On a steady plant the closest approach between any two
  traces goes from **0 px to 20.6 px**, spread evenly from the top of the chart to the
  bottom, with no lane movement at all over 45 seconds of running.
- **Fixed: clicking a simulation-speed chip (1× / 10× / 60× …) threw an error every time.**
  The handler set the ⚡ fast-forward badge directly and the PWR control room has no such
  badge, so it hit a null. The speed still changed (that happened first), but the exception
  aborted the rest of the handler on every click. The badge already had a correct,
  null-guarded owner elsewhere; the duplicate is gone.
- **The strip chart traces the physics, holds still, and stopped turning white.** Three
  separate complaints, three causes. (1) It plotted the **instrument** readings, so every
  trace carried sensor noise that teaches nothing. In **Teaching** mode it now plots the
  true physics; in **Realistic** mode it still plots the instruments — lightly denoised —
  so the sensor-failure drills (PWR-E20/E21/E22: drifting Tavg, stuck PZR level) still
  have to be caught by cross-checking, exactly as the procedures say. This falls out
  neatly on TMI-2, which runs Realistic for the deception (p1/p3) and Teaching for the
  reveal (p2). Alarms and protection read instruments in both modes, unchanged (HR1).
  (2) **Traces kept wriggling and reshaping after they were drawn** — the auto-range eased
  its limits toward the data every single frame, re-projecting the *whole* trace each time.
  The axis now sits on round 1-2-5 numbers and is *held*: it re-fits only when the data
  leaves the band, or after the trace has sat well inside it for several seconds. Once a
  point is drawn it stays put. Axis labels are readable numbers now (`0–120`, `14.5–16.0`)
  instead of `-7–107` and `15.22–15.54`, and they no longer run past a quantity's physical
  limits. (3) **Traces sometimes turned white** — the alarm highlight washed the colour
  60 % toward white, which destroyed the series identity, and it was driven by the raw
  noisy reading so a value sitting on its setpoint strobed the line every frame. The
  highlight is gentler (28 %, hue preserved) and latches with a release deadband.
  Side effect: the trend buffer now records one value per plotted series instead of a copy
  of the whole instrument set, so it holds **both** sources in ~40 % *less* memory than it
  used for one. The CSV export follows whatever the chart is showing.
- **The control room fills the window: a bigger diagram and no dead space beside it.**
  Two independent wastes of page, both worst on wide-but-short windows (2560×1080, any
  un-maximized landscape window). First, the board reserved phantom width: the
  right-anchored, auto-width indication tiles were measured as `left + width` — their
  builder width, not their footprint — so the diagram was scaled to fit a box ~12 % wider
  than it draws. Fitting is now measured from the rendered tiles, and **the diagram is
  ~15 % larger at every window size**. Second, whenever the diagram fits to *height* the
  leftover width was simply blank: the alarms/trend and simulator columns stayed pinned at
  340/360 px with hundreds of px of nothing between them and the board. Those two columns
  now stretch into that space (to 860 px and 520 px; 1200 px for alarms/trend when ⛶ hides
  the simulator panel) and give it back when the diagram needs it. At 2560×1080 the dead
  strip beside the board goes from **676 px to ~40 px**. Narrow/stacked layouts are
  unaffected. (`ui/diagram/board/pwr_board.js` `contentBounds`/`fitColumns`, `ui/shell.css`
  `--midcol-w`/`--simcol-w`.)
- **`privacy.html` now describes what is actually collected.** It previously stated the site
  collects "**nothing**", which the analytics beacon makes false. The *Right now* section now
  names the page-view data (path, referrer, country, device/browser/OS), states that no cookies
  or persistent identifiers are set, and that nothing *inside* the simulator is recorded. The
  lede's "no third-party trackers" became "no cross-site tracking" — the beacon is same-origin,
  but Vercel is a processor, and the weaker claim is unambiguously true. The *Planned: anonymous
  usage telemetry* section (the separate Supabase work, `WEBSITE_SPEC.md` §5) is unchanged.
- **The Mode 3 → Mode 1 startup checklist is rebuilt around the 1/M plot.** The old walkthrough
  jumped from "check the instruments" straight to a single big rod pull with no approach-to-
  criticality method. It now walks the real thing: set the **1/M baseline** before touching the
  rods, withdraw in **small bursts** and **re-plot** between them to watch the predicted critical
  position tighten, perform the **SR→IR handoff** at the right moment (secure the Source Range
  before its high-flux trip), then creep to criticality on Slow, arrest the overshoot, and put the
  turbine on line. Twelve concise steps, each written so an operator who doesn't know the plant by
  heart can follow it — and each hover-highlights its controls and gauges. The ascent now settles
  in the low-power band (~15 %) instead of overshooting to ~50 %.
- **The Procedures (live) menu is a scannable list again.** Each procedure card used to dump its
  full step list inline, so the page was a wall of text. Steps are now tucked behind a
  "▸ Show the N steps" expander — the menu reads as a list of checklists to pick from; the steps
  appear when you Follow or run one (or expand a card). Accident walkthroughs still show their
  steps inline (there the steps are the content).

### Fixed
- **Four board readouts were showing fiction; they now read the plant.** An indication audit
  found four displays wired to constants or to the wrong field:
  - **SIT (accumulator) pressure** was pinned at a hard-coded `640 psig` forever — the board
    asked the engine for a tank pressure the engine never exported. The accumulators now model
    their **nitrogen cover gas**, which expands isothermally as water discharges, so the gauge
    falls from its 600 psi charge toward ~156 psi as the tank empties. That is *why* a real
    accumulator's injection tails off as it drains, and the board now shows it.
  - **SG feed rate** displayed the feed-pump *demand* rather than measured feed flow, so the
    indication stayed pegged at what you asked for even through a feed-pump trip. It now reads
    the feed-flow instrument.
  - **Condensate polisher** always read `NORMAL` — a hard-coded string wired to nothing. It now
    reports whether condensate is actually flowing through it (`IN SERVICE` / `STANDBY`).
  - **Net reactivity** printed `+-0 pcm` whenever ρ was a hair below zero.

- **Rod speed is honoured on the first step again — a SLOW drive no longer jumps instantly.**
  The rod drive carries a fractional-step accumulator between physics ticks, and a new rod
  command never cleared it. A bank left mid-step by a previous move (a fast hold-drive can
  strand it at 0.96 of a step) would take its *next* step almost immediately no matter which
  speed was selected — so a single tap at SLOW moved the bank, and stepped reactivity, in
  0.08 s instead of the 1.88 s the slow drive calls for. A command to a bank **at rest** now
  starts from a clean fraction; a command redirecting a bank that is still **in motion** keeps
  its fraction, since it is genuinely mid-step (this matters — the automatic rod channel
  re-issues its nudge every 5 s while an 8-step slow move is still travelling, and clearing
  the fraction there would throw away real progress). Fixed identically in all three plants
  (`pwr_engine.js`, `bwr_engine.js`, `rbmk_engine.js` `rod_nudge`/`rod_start`). Rod position
  was always integrated at the selected speed and reactivity was always read from the *actual*
  bank position — the speed setting itself was never broken, only its first step.

- **A total loss of feedwater is now the accident it should be.** A steam generator that boiled
  dry used to stay a perfect heat sink forever — the steam dump kept "venting" and the primary
  parked at ~297 °C indefinitely, so losing all feed *and* aux feed with no makeup was survivable
  by doing nothing. The tube bundle now **depletes** when it is dry *and unfed*: over minutes its
  residual heat transfer boils away, decay heat has nowhere to go, and the primary heats to the
  pressurizer safeties, boils off its inventory, uncovers, and damages the core — TMI-2 without
  the recovery. Any feedwater reaching the SG (auxiliary feed included) rewets the bundle, so the
  *recoverable* loss-of-feed transient — AFW auto-starts and carries the plant through a brief
  dry spell — behaves exactly as before, to the decimal. (Engine: new `sg_dry_deplete` state in
  `pwr_steam_generator.js` scaling the dryout residual in `pwr_thermal.js`; old saves load
  unchanged.)
- **An ATWS during a LOCA is no longer benign.** Decay heat was switched on only by a scram, so
  an unscrammed core that lost coolant (fission collapsing from moderator loss, not a rod
  insertion) *froze* at its current temperature instead of heating to melt — the worst real
  accident produced *less* damage than a clean shutdown. Decay heat now persists whenever fission
  power collapses for any reason (scram-agnostic). Post-scram cooldown and normal operation are
  unchanged.
- **A core melt now reports its cause.** The `destruction_cause` outcome flag (`thermal_melt`) was
  tracked internally but not exposed in the plant's true-state readout; scenario grading read
  `undefined` on a confirmed melt. It is now surfaced.

### Changed
- **The boron analyzer is gone from the panels — chemistry sampling is how you know boron now.**
  Real plants sometimes fit online boronometers but don't rely on them; the concentration of
  record comes from grab samples and dose bookkeeping. The board's `ACTUAL <ppm>` analyzer
  readout, the synoptic CVCS ppm readout, the boron trend series, and the Automate-tab pv are
  all removed (code retained behind dated comments for an easy restore — the instrument itself
  is untouched, and the makeup channel still uses it internally to seed its books). The CHEM
  sample readout takes the analyzer's place on the panel. Manuals 03/04 rewritten
  chemistry-first. Training content still narrates the analyzer in places — a full training
  overhaul is planned (worklist: `Diagnostic/TUNING_LOG.md` backlog S12).

### Added
- **Boron CHEM SAMPLE — the lab is now on the board.** A new `take_boron_sample` command draws
  an RCS grab sample; the lab posts the authoritative concentration after a compressed ~60 s
  turnaround (real labs: 30–60 min). Chemistry **confirms every completed dose automatically**
  (the "sample after every planned boron change" ritual), and a **CHEM SAMPLE button** (board
  BORON CONTROL panel + CVCS synoptic) covers the recovery case: after ECCS/accumulator boration
  or freehand Borate/Dilute, a fresh result **re-baselines the panel** — dose books and displayed
  target snap to the lab number so the next dose computes from reality. The board's boron status
  now shows the dose countdown (`DILUTING 12→`), and the panel carries the lab readout
  (`SAMPLING…` → `705 PPM`). Result is deterministic (mixed concentration, 1 ppm resolution — no
  PRNG shift); old saves migrate (never sampled, no lab pending).
- **Free-play startups open with a boron CHEM SAMPLE already in hand.** Every starting condition
  now posts an initial grab-sample result at reset (the settled concentration, 1 ppm resolution),
  so the CHEM readout shows the current boron from the first frame instead of `—` (never sampled) —
  a real board always carries a last lab number. The makeup channel latches this result without
  treating it as a fresh (re-baselining) sample.

### Changed
- **Followable procedures + remaining manual sections aligned to the batch-dose / CHEM model.**
  The `pwr_heatup` procedure and manuals 02/03/04/10 now describe boron the way the board works:
  set a **target** (borate = raise, dilute = lower), confirm concentration with a **CHEM SAMPLE**
  (no live meter), and `take_boron_sample` is listed in the command reference. (Scenario training
  narration still names the analyzer — tracked as backlog S12.)
- **Boron target control is now a metered BATCH DOSE (real makeup-panel semantics).** The board's
  BORON CONTROL target used to *seek* the boron analyzer — but that sample lags ~45 s, so a dose
  over-delivered by ~50 % (a 10 ppm ask injected ~15 ppm, spiking power to ~110 %; a 30 ppm ask
  scrammed on high flux), while its ±8 ppm deadband silently swallowed the board's 1 ppm arrow
  nudges entirely. Now a new target computes the change and **meters it feedforward, stopped by a
  flow totalizer** — exactly the ppm asked, no analyzer chase, no deadband (1 ppm nudges execute),
  at a realistic **0.05 ppm/s** (was 0.5 — a ~5 pcm/s firehose). The dose pauses with the charging
  pump, survives save/load and rewind, and a spent totalizer no longer fights ECCS boration back
  toward a stale target. Manual Borate/Dilute buttons are unchanged (and still force the channel
  to MAN). Manuals §7.5 now documents the batch behavior — including why dilution at full power
  moves **Tavg, not steady-state power** (that part is real PWR physics).

### Added
- **Mode 5 → Mode 3 live checklist (`pwr_heatup`).** A full plant-heatup checklist from the cold
  board: RCP start, slewed pressurization, accumulator re-alignment, SR→IR handoff, a gentle
  fine-step approach to criticality, a **dilution-driven nuclear heatup ride** to the no-load
  point, then rods-in + boration to settle at Mode 3, Hot Standby. Engine-validated end-to-end
  (lands Tavg ≈ 297 °C, subcritical, Mode 3) and available from the 📋 Checklists picker.

### Changed
- **Pressurizing to a raised setpoint now takes real time.** The pressurizer heaters' control
  authority (sized for holding pressure through transients) also applied to operator setpoint
  steps — raising the Mode-5 setpoint 350 → 600 psi completed in ~3 seconds. The **effective
  control target now walks up at ~0.02 MPa/s** (the plant's deliberate heatup pace: that step
  now takes ~80 s, full cold → NOP ≈ 11 min sim) while the heaters honestly indicate full
  output. Lowering the setpoint, and disturbance response at a fixed setpoint (SGTR plateau,
  pressure dips), are unchanged. Old saves are unaffected on load.
- **The startup checklist now goes all the way to Mode 1.** `pwr_startup` ("Mode 3 → Mode 2 —
  approach to criticality") is now **"Mode 3, Hot Standby → Mode 1, At Power — startup to
  power"**: after criticality it confirms the 5 % Mode-1 boundary and puts the generator on
  line (Connect Grid). The campaign walkthrough entry follows suit.
- **`pwr_return_to_mode1` completion gate un-razored.** The final "arrived at Mode 1" beat
  required true Tavg > 298 °C while the no-load dump anchor is ~297 °C — completion depended on
  power-spike flicker. Now gates at 296 °C, matching the "hot" criterion the other Mode-5
  missions use.
- **Fine-step rod drive (PWR) — real granularity at criticality.** The control bank now travels
  **912 steps** (was 228) at ×4 the steps/s, so every rate in fraction-of-travel per second — and
  every tuned evolution — is unchanged, but one step is now **~9 pcm (~1.4 ¢)** in the startup
  critical band instead of ~36 pcm (~5.5 ¢). Rationale: the single lumped bank carries the full
  ~8500 pcm a real plant spreads over ~4 banks × 228 steps of travel, so 912 is the real
  total-travel equivalent — and one UI tap now matches real bank-D differential worth (~5–15
  pcm/step) instead of jolting power several percent at the point of adding heat. Board step
  readouts show `/912`; the 1/M plot axis follows automatically; **old saves rescale rod position
  on load** (same fraction of travel — reactivity unchanged). Manuals (§3.1, §7.0, PWR-N02
  cautions) and the PWR startup procedure step counts updated to the fine scale.

### Added
- **Xenon strip-chart series (PWR).** Xenon (% of equilibrium, from `true_state.xenon_pct_eq`) is
  now a selectable plot trend — the chart buffer carries it alongside the instrument readings.
- **Website version tracking.** The public changelog (`changelog.html`) now carries a per-release
  version number (`Alpha MAJOR.MINOR.PATCH`, starting **Alpha 1.0.1**). Adding a `changelog.html`
  entry with the next version is now a required step *before* each `develop`→`main` merge — the
  workflow is documented in `README.md` (_Branching & workflow → Website changelog & version
  numbers_) so every coding agent follows it.

### Changed
- **Vital-few gauge colors match the plant diagram.** The six top indications now use the board's
  readout palette — green normal, amber caution, red alarm (`#5aad7c`/`#ffd166`/`#ff6a4d`) — instead
  of the old dim blue-white. Cyan stays reserved for user-editable inputs, on the gauges and board alike.
- **PWR board — auto-driven number boxes read grey.** A setpoint/input box turns grey while its
  controller is on AUTO (load in FOLLOW, feed on the feed_sg channel, spray/heater AUTO, CVCS auto
  make-up) — the operator can't type into it then. Cyan = editable. The two operator setpoints (boron
  target, pressure setpoint) stay cyan. (driver `numberAuto` + a render-time recolor.)
- **PWR board — boron target ▲/▼ now nudges 1 ppm** (was 20) for fine reactivity-chemistry trimming
  (matches the 1 MW generator-load step).
- **Site — About and Feedback links disabled site-wide** (pages kept, links greyed/non-clickable on
  every page's nav, footer, and inline references); removed the "SI units under the hood" line from
  the front-page feature copy.
- **Boron now moves power at the speed of the *actual* concentration, not the input.** Borating
  or diluting used to swing power almost instantly while the boron indication crept up slowly —
  because reactivity keyed off the injected concentration while the analyzer sample lagged. The
  boron that drives reactivity now follows a **mixing/transport lag** (the borated water has to
  circulate and homogenize before it changes the core), so power responds gradually and in step
  with the indicated level instead of leading it. The "boron vs rods" training mission was
  re-paced to steer on the (now-realistic) boron inertia.
- **Gentler control rods at low power.** The control-rod integral-worth curve was flattened
  toward its average, trimming the peak differential worth so a small rod move near the startup
  critical point is less of a jolt — startup is a little more forgiving. (Total rod worth is
  unchanged, so shutdown margin and the cold→hot startup are unaffected.)
- **Indication noise cut in half.** Every gauge/indication jitters half as much (a global
  `instrument_noise_scale` on the instrument model), so the board reads calmer while the
  instruments still lag, drift, and can fail (HR1 intact).
- **Hover glow on every clickable control.** Board buttons, the SCRAM button, and the
  number-entry spinners now light up with a cyan glow on mouse-over — the same affordance
  the valves already had — so it's obvious at a glance what's actionable.

### Fixed
- **Control-room UI no longer strobes/flickers after playing a while.** The changing
  readouts (top indications, strip chart, and the clock) could start "dispersing and
  reappearing" a couple minutes into a session (most visible on the hosted build). Two
  causes: (1) the strip chart rebuilt a polyline over its *entire* sample buffer every
  frame — thousands of points as the 5-minute window filled — so the render grew heavier
  until it blew the frame budget; the chart now decimates to about one point per pixel, so
  its cost is bounded regardless of how long you play. (2) The UI rendered from inside the
  simulation's broadcast timer; rendering is now coalesced onto `requestAnimationFrame` so
  the browser always composites one complete frame. (The plant diagram was never affected —
  it updates surgically.)
- **Keyboard rod drive no longer sticks.** Holding **↑**/**↓** to drive the rods could, in
  some environments, leave the rods driving to their limit long after the key was released.
  The tap-or-hold state machine now ignores repeat/echo key events while a press is already
  active, so a release always issues the stop; a window-blur (alt-tab) safety net also
  releases the drive in case a key-up is lost.

### Added
- **PWR board — keyboard control-rod drive.** **↑** withdraws and **↓** inserts the
  control rods, mirroring the WITHDRAW/INSERT buttons: a quick tap moves one step, hold
  drives continuously at the selected S/M/F speed. Ignored while typing in a field.

### Changed
- **UI cleanup (issue #115).** The control room opens on the **Sim** tab (moved to the
  left and made the default); the **Dev** tab was removed (session telemetry still rides
  along with 💬 Feedback), and the Automate tab is gone (operator automations live on the
  board). The **Reactor⚛️Dynamics** wordmark in the control room now links back to the home
  page, and a collapsed Instructor panel maximizes when you click anywhere on it (it could
  previously get stuck minimized during chat scenarios, where its header is hidden).
- **First-run cue (issue #115).** The "SIMULATION PAUSED" board overlay now adds "Press ▶
  Play to start", and the Play button pulses until you start the sim for the first time.
- **Home page (issue #115).** An **ALPHA** badge and a "work in progress" banner make the
  build status clear up front. The "instruments can lie" feature card was replaced with two
  reactor-physics blurbs (point-kinetics reactivity feedback; the coupled whole-plant model).
- **TMI-2 Part 1 is now hands-on (issue #105).** "The Fog of War" no longer plays itself
  while you watch — the Shift Supervisor *orders* the two pivotal historical actions and
  **you** perform them on the board: securing High-Pressure Injection (the fatal mistake)
  and, at the end, closing the PORV block valve and restoring injection (the recovery). If
  you hesitate, the supervisor makes the call himself, so the ending is always the
  historical one — but the trigger is yours. Between the two decisions the board is gated to
  on-order actions so the trap can't be undone mid-event.
- **TMI-2 Part 1 pacing — no more long fast-forwards.** The uneventful two-hour draindown is
  now run at a smooth authored acceleration that snaps back to real time at each reveal,
  instead of the "Wait/Skip" fast-forward buttons that kept dropping back to 1× on every new
  alarm. The historical elapsed-time labels (~2 h 20 m) are kept.
- **Fast-forward no longer stutters through a scripted transient.** A scenario-authored
  fast-forward now rides *through* an alarm cascade instead of snapping back to real time on
  each new annunciator; a genuine reactor trip or new failure still hard-stops it. (Fixes the
  TMI-2 "fast forward keeps dropping out" report.)
- **PWR board — the PORV now shows the *real* valve, not just the demand light.** A
  stuck-open PORV visibly vents and drives flow down its discharge line even while the
  control-room demand indicator reads "closed" (the TMI-2 lie) — the board depicts the plant,
  the lamp depicts the signal. The PORV **outflow-pipe temperature** reads live and turns
  amber as the tailpipe heats, and the discharge pipe warms with it — the one honest tell the
  1979 crew had. (Issue #105: stuck PORV / no flow / tailpipe temp not visible.)
- **PWR board — the maintenance tag now hangs *over* the tagged valve.** The TMI-2 clearance
  tag was a small badge floating above the AFW discharge valve; it now hangs across the valve
  body like a real danger tag, occluding the indication behind it. (Issue #105.)
- **PWR board — turbine Load ▲/▼ now nudges 1 MW** (was 20 MW) for fine load trimming.
- **PWR board — strip-chart value chips moved to the right of the traces.** The traces now
  stop short of the right edge and each line's live value indication sits in the reserved
  gutter to its right (it used to overlap at the left edge); the time axis "now" tick lines
  up with the trace ends.
- **PWR board — more vertical room for the plant diagram.** The chart + alarm band was
  trimmed ~20 % (34 %→27 % of the plant column, min 200→160 px), and the six vital-few
  gauges now carry their mini strip
  chart *beside* the number instead of under it — a shorter gauge row. Those mini charts
  are smaller and now show a rolling **1 minute** of history (sim-time window, so they
  span the same minute at any time-accel). The reactor vessel was also lifted to sit **in
  front of** the CONTROL/SHUTDOWN GROUP rod panels it overlaps (it was authored that way);
  the vessel is click-through so the rod hold-buttons beneath it stay reachable.

- **PWR — CVCS now moves inventory at a realistic pace.** Letdown and charging (tens of
  gpm) used to act on the primary at the same lumped "accident" scale as a LOCA, so an
  uncompensated 20 gpm letdown drained the pressurizer ~2 %/**second** — far too fast for
  any operator to respond. A new engine coupling (`cvcs_inventory_gain`) puts CVCS on its
  own scale: orifice A now walks pressurizer level down **≈ 2 %/minute** (A+B ≈ 5 %/min;
  max charging fills ≈ 13 %/min), so mistakes take minutes to matter and the 17 % letdown
  isolation / low-level protections have honest time to backstop you. The AUTO make-up
  servo was re-tuned to match (a damped level error lets it hold a small leak ~2 % below
  program without chasing gauge noise).
- **PWR — SGTR rescaled onto its ESF yardstick.** A full-severity tube rupture is now
  ~½ of HPI's rated high-head flow (≈ 2× what SI delivers at pressure): it still
  overwhelms CVCS and forces the trip + SI + EOP, but the single-SG EOP's
  subcooling-guarded depressurization can now actually win the inventory race (the old
  scale only looked survivable because AUTO charging was acting as an unphysical second
  HPI — a side effect removed by the CVCS retune). Severity is still an honest 0–100 % of
  a full rupture.

### Added
- **PWR — Safety Injection on pressurizer level LO-LO (12 %).** Real ESFAS protects
  inventory, not just pressure: HPI now auto-starts when pressurizer level falls to 12 %
  (with the low-level reactor trip), even when the heaters are holding pressure up. It
  rides the existing HPI AUTO arm (cold/depressurized lineups stay blocked per P-11;
  taking manual SI control disarms it), re-arms above 20 %, and never fires during the
  TMI deception (the failed level channel reads *high* — which is the lesson).
  Documented in Manuals 09 §3.0 (along with the previously undocumented 17 % letdown
  isolation row) and 06 (PZR LVL LO LO response).

### Fixed
- **PWR board — every setpoint box now clamps to its valid range and auto-corrects
  out-of-range entries.** Typing a number above the max (or below the min) snaps the box
  to the nearest acceptable value on Enter/blur, and an empty or non-numeric entry reverts
  to the previous value instead of committing garbage. The step arrows (▲▼) respect the
  bounds too. Ranges (board is US-only): Generator Load 0–100 MW, SG Feed 0–1200 gpm,
  Spray 0–100 %, Heater 0–100 %, Boron target 0–2500 ppm, Charging 0–60 gpm, Pressure
  setpoint 15–2484 psi. Bounds derive from the engine limits (e.g. charging = the make-up
  band `charging_max`; pressure = 0.1 MPa up to the pressurizer safety) so a retune keeps
  the UI in sync. The **charging box's range marking was corrected from a wrong "0-150" to
  "0-60"** (max charging = `charging_max` 0.06 on the board's 1000 gpm/normalized scale).
- **PWR — CVCS make-up no longer drains the reactor when you switch it to MANUAL, and
  letdown can no longer empty the plant.** Two CVCS fixes:
  - **Bumpless AUTO→MANUAL transfer.** Under AUTO make-up the charging *setpoint* sat
    frozen at its start value (0), so toggling CVCS make-up to MANUAL snapped charging
    to zero while letdown kept running — the pressurizer, then the whole RCS, drained in
    a couple of minutes from a single click. Now, exactly like a real manual/auto station,
    the manual setpoint **tracks the live auto flow**, so dropping to MANUAL holds
    inventory where it was (the operator then trims from there).
  - **Letdown isolation on low pressurizer level (~17 %).** A real Westinghouse interlock:
    letdown is a bleed *out* of the RCS, so if level keeps falling it isolates both
    orifices before the plant can be drained (and before the 12 % low-level reactor trip).
    Over-letdown — including the max A+B lineup, whose flow exceeds charging capacity —
    now self-arrests at ~17 % instead of running the primary dry. Letdown stays isolated
    until the operator re-opens an orifice.
- **PWR — the board rod-drive buttons are now momentary (tap-or-hold).** WITHDRAW/INSERT
  (control and shutdown banks) used to fire a fixed 4-step nudge on release, so a click
  moved the bank several steps regardless of hold time. Now a quick **tap moves exactly
  one step**, and **holding drives the bank continuously at the selected speed until you
  let go** (`rod_start`/`rod_stop`). On release the bank **coasts to a stop** — a realistic
  slight overrun (time-based `rods.stop_coast_s`: ~1–2 steps at fast, negligible at slow)
  rather than an abrupt halt. Matches the classic control strip's rod drive; keyboard
  (Space/Enter hold) works too.
- **PWR — the accumulator (SI) isolation valve on the board is clickable again.** Clicking
  the accumulator discharge-isolation valve now actually opens/closes it, and the
  ARMED/ISOLATED status follows. The valve's position was published only in `true_state`
  while the board reads the operator command surface from `control_state`, so the click
  fired but the drawing never moved (it read a permanently-open default). It is a plain
  block valve — independent of the ECCS/HPI buttons in both directions.
- **PWR — the steam-generator U-tubes now line up with the wide-range level.** The drawn
  U-tube bundle used to top out around 47 % wide-range, but the engine begins tube-bundle
  dryout at 30 % wide (`sg_dryout_wide_pct`, which is also narrow-range 0 %). The tube
  apexes are now pinned to that 30 % mark, so the animated water surface reaches the tube
  tops exactly as the engine starts collapsing SG heat transfer — what you see is what the
  physics is doing.

### Added
- **Auto-checklists in the Instructor chat.** Any operator procedure can now run as a
  passive checklist against the live plant: call it up from the 📋 Checklists button on the
  Instructor card (or the 📋 button next to any procedure in the manual / walkthrough
  lists), and each step appears as a chat bubble that **checks itself off the instruments**
  as you operate — no plant reset, no gated controls, unlike a walkthrough. Steps with an
  acceptance reading auto-check when it holds; pure observation steps take a hand-tick,
  which also serves as the manual override. Checklists survive save/load and end the moment
  instructed content (a mission or walkthrough) takes the card.
- **The in-app PWR manual is now the real manual.** The 📖 Manual for the PWR renders the
  full `Manuals/*.md` operator set — 13 documents (general description → glossary,
  including the TMI accident study and the campaign crosswalk) — instead of the old
  generated reference pages. Procedures and accident walkthroughs remain live sections
  with their Follow and Checklist buttons. RBMK/BWR keep the generated reference until
  they get manual sets of their own.

### Changed
- **PWR manuals enhanced before the old web manual was retired** (everything worth keeping
  was ported, everything stale was not): per-initial-condition normal-values tables
  (09 §11.0), indication ranges + linked annunciators (03 §16.0), an engine command
  reference (03 §18.0), the previously undocumented RHR Cooldown Rate / heat-exchanger
  split control and its ~50 °C/h limit (03 §11.2, 05), failure severity sliders and the
  new **PWR-E22** failed-low pressurizer-level-sensor procedure (07). Stale numbers fixed
  across the set: Mode 3 Tavg is the 297 °C no-load anchor (was shown as 304), the load
  imbalance cue is ~4 MWe (was 40), rated output 100 MWe leftovers, and the procedures'
  turbine-load steps now command 60/70 MWe instead of 1000-MWe-era values. The MWe output
  gauge instrument also had a 10× stale range (0–1300 → 0–130).
- **PWR — a full tube rupture is now a real emergency, and its procedure really works.**
  The SGTR leak scaled up ~4× (a full-severity rupture is twice what charging can make
  up, so it forces the trip and safety injection instead of being quietly out-pumped) and
  now scales with the pressure difference across the ruptured tube — so the single-SG
  EOP, *depressurize the primary to steam-generator pressure*, physically stops the leak.
  Safety injection also actuates earlier (12.4 MPa, up from 11.03), arriving together
  with the low-pressure reactor trip.
- **PWR — a turbine trip no longer scrams the reactor: this plant rides it out.** The
  steam dump is sized at 105 % of rated steam flow, so losing the turbine is a transient
  the operator manages — the dump catches the load, the plant self-stabilizes at partial
  power (temperature and pressurizer level parked high, asking for rod trim), and you walk
  it down to hot standby at your own pace. Reactor trips are reserved for genuine limits.
- **PWR — real post-trip feedwater handoff.** On a reactor trip, once coolant temperature
  reaches the no-load point, main feedwater isolates (no more cold feed pumped against
  decay heat), the feed control channel visibly stands down, and auxiliary feedwater takes
  the steam generator. AFW also auto-starts the moment main feed is lost at power.
- **PWR — the heat-sink chain is physical end-to-end.** The steam dump needs the condenser
  (lost vacuum or blackout removes it), main feed needs the condenser hotwell AND the main
  steam line (steam-driven feed pumps — closing the MSIV starves them), and safety
  injection now also trips the reactor and isolates feed. Loss of vacuum untended plays
  out as: turbine trip → no dump → feed dies → SG drains → trip on the real limit.
- **PWR — scram recovery exists.** `reset_rps` re-closes the trip breakers — refused while
  any trip signal stands, and only with all rods inserted; then a normal startup ladder
  brings the plant back. (The "Plant Protects Itself" mission now teaches protection with
  a loss-of-feedwater casualty, since a turbine trip no longer scrams this plant.)
- **PWR — the plant got its own temperature program: 297 → ~304 °C.** The no-load anchor
  is now 297 °C (steam dump setpoint 8.23 MPa), a deliberately shallow 7 °C program that
  fits a small plant with a generously-sized steam generator — and roughly halves the
  stored heat a reactor trip dumps into the SG, for a gentler post-trip shrink. Hot
  standby, heatup targets, and the pressurizer level program (now ~37 % no-load → 55 %
  full power) all follow the anchor automatically; Mode-transition scenarios and drivers
  derive it from config instead of hardcoding it.
- **PWR — the pressurizer level gauge is now physical.** Level is derived from what's
  actually in the plant — inventory, coolant thermal expansion, and (only when the primary
  really saturates) void displacement — instead of drifting on its own integrator. What
  this means at the panel: level rises with load because hot water expands (the level
  program comes free); draining genuinely lowers it; over-filling packs the steam space
  and reads steeply toward solid; and the TMI deception (level rising while inventory
  leaves) happens exactly when voids exist and nowhere else. The CVCS setpoint follows the
  same expansion line, so a heat-up can no longer trick auto-charging into draining the
  reactor. Cold-shutdown states now carry a modest real mass surplus (level 30 %).
- **PWR — the plant is now officially its own plant.** Direction change (owner, 2026-07-20):
  the PWR is a ~100 MWe single-loop experimental unit tuned for behavior and feel, no longer
  chasing generic Westinghouse 4-loop numbers. Full plan: `Blueprint/PWR_FEEL_TUNING_PLAN.md`.
- **PWR — coolant temperature now follows a sliding program with load.** Average coolant
  temperature rises from a no-load anchor to its full-power value as load increases (it used
  to sit flat and even sag at mid-load), every startup state initializes as a true steady
  state, and the steam-dump setpoint anchors the no-load end (8.90 → 7.67 MPa). Current
  anchor numbers are placeholders until the feel pass picks this plant's own map.
- **PWR — partial-power states now start with the right xenon.** Low-power initial conditions
  used to seed full-power iodine/xenon, so a 5 % steady state slowly drooped to ~1 % as the
  excess iodine decayed in. States now initialize at their own power's equilibrium — 5 %
  holds indefinitely.
- **PWR — Evening Shift exam re-calibrated for the new load coupling.** Under the temperature
  program a slider-only 850 MWe ask settles ~895 (no more undershoot through 870), and the
  down-leg shrink parks SG level near 31 % until the feed is minded — the exam's phase
  markers moved accordingly (reduction credit < 905, hold line < 910), and feed vigilance is
  now genuinely required for full marks on the manual route.

### Fixed
- **PWR — the automatic charging control now senses the pressurizer-level *instrument*, not the
  true level.** Every automatic control now reads the same (lagged/failable) sensors the operator
  sees — so a stuck or failed pressurizer-level sensor fools the charging control just as it fools
  you, instead of the controller secretly working off perfect truth.
- **PWR — the reactor coolant system no longer empties when it shouldn't.** A high pressurizer
  level from thermal expansion (e.g. after closing the MSIV, which heats the primary) could make
  the automatic charging drain the whole RCS to zero chasing a level it can't lower that way.
  Charging-in-AUTO now never lets the primary fall below its nominal inventory — it only lets down
  genuine *excess* mass — so a heat-up raises the level without emptying the reactor.

### Changed
- **PWR board — heat-map temperature colors for easy transient reading.** Water uses a
  continuous blue→cyan→green→yellow→orange→red heat-map, with the scale expanded over the
  operating band (200–345 °C) the way a plant HMI is — so the hot leg reads orange and the cold
  leg green (their ~30 °C split is now obvious), and a heat-up/cool-down sweeps the full spectrum.
  Drops the old purple/pink. Steam keeps its grey scale.
- **PWR board — AFW block valve is now an independent operator valve (TMI-2).** The auxiliary-
  feedwater block/discharge valve no longer just mirrors the AFW start/stop buttons. You can run
  the AFW pumps (run lights on, discharge pressure at shutoff) while the block valve is shut and
  **no water reaches the steam generator** — the exact trap that caught TMI-2.
- **PWR board — SG FEED AUTO now shows AUTO when the feed control is actually running.** The
  SG-feed panel read a legacy flag, so it displayed MAN even though the three-element feedwater
  controller was in automatic; it now reflects and engages the real feed channel.
- **PWR board — the turbine-inlet steam pipe stops when the turbine is offline.** A tripped/
  unloaded turbine no longer shows steam still flowing to it.

### Added
- **PWR board — 1/M startup-plot button.** A **1/M PLOT** button (under TRIP BLOCKS, with the
  startup net) opens the inverse-count-rate approach-to-criticality plot directly from the board.

### Changed
- **PWR — automatic pressurizer level control works like a real plant.** Charging in AUTO now
  modulates above *and below* letdown to hold the programmed pressurizer level — a high level is
  actively brought back down (previously charging never dropped below letdown, so a high level just
  sat there). A primary leak now correctly lowers the pressurizer level, so the level controller
  makes the leak up on its own, the way a real CVCS does — without the simulator "knowing" a leak
  exists.
- **PWR board — feed-pump fluid color matches its pipes, and pipes stop when a pump is off.** The
  feed pump and the feedwater pipes into and out of it now read the same temperature. Turning any
  pump off (feed, RCP, charging, …) now stops the flow animation in its connected pipes.
- **PWR board — all water shares one temperature color scale.** Every body of water on the
  diagram — reactor coolant, steam-generator water, pressurizer, condenser hotwell and its
  circulating cooling water, and the cooling-tower basin — now uses the same aqua→blue→purple→red
  temperature ramp, driven by its actual temperature. The cooling tower and condenser cooling water
  previously used a separate blue/red blend. Steam keeps its own grey scale.
- **PWR board — accumulators no longer show flow into the reactor during normal operation.**
  The safety-injection accumulators are passive: they only inject once RCS pressure falls below
  their 600 psi check-valve setpoint. The board now shows the accumulator discharge as still (open,
  water-filled, but not flowing) at power, and animates it only when the accumulators actually
  discharge. The accumulator isolation valve is also reliably clickable (it no longer sits under
  the reactor-vessel tile).
- **PWR board — steam-generator U-tubes and channel heads, and the feed-pump temperature, read
  true.** The SG tube bundle and the hot/cold coolant reservoirs at its base take the primary
  hot-leg / cold-leg temperatures (they carry reactor coolant), not power. The feed pump's fluid
  color now follows feedwater temperature by load (cold when shut down, ~220 °C at full power)
  instead of steam pressure, and the condenser hotwell reads a cool, load-dependent temperature.
- **PWR board — reactor vessel water is colored by temperature, not power.** The coolant in the
  downcomer, lower plenum, and core channel now takes its color from the live cold-leg / hot-leg
  temperatures (cool at the inlet, warming up through the core), while the **fuel rods and core
  glow stay power-driven**. So at hot standby (hot but zero power) the water reads hot with dark
  fuel; at full power the fuel glows inside hot water — glow = heat generated, water color = fluid
  temperature.
- **PWR board — every fluid pool now tracks live conditions.** The **pressurizer** water/steam
  color follows the real saturation temperature of RCS pressure (red hot at operating pressure,
  cooling as the plant depressurizes) instead of a fixed hot color. The **steam generator** boils
  as hard as it is actually making steam — vigorous at power, calm at hot standby / cold shutdown —
  instead of a constant simmer. The **reactor core** bubbles track the engine's real coolant void
  fraction, so boiling shows up when the core actually starts to void in a transient (and stays
  quiet during normal subcooled operation).
- **PWR board — TRIP BLOCKS button is now grey, not yellow.** Blocking startup trips is a normal
  part of a shutdown/startup lineup, not an alarm, so the button uses a neutral grey (with its
  count badge) — keeping green/yellow/red for real normal / attention / alarm severity.
- **PWR board — pipes now show real fluid temperature.** The reactor-coolant pipes (hot leg, both
  cold-leg runs, pressurizer spray and surge lines) and the main steam header were previously painted
  a fixed color — the hot leg stayed red even in cold shutdown. They now take the plant's live leg /
  saturation temperatures each update, so the whole loop runs cool blue when the plant is cold and
  warms to red as it heats up, matching the pumps (which already colored to the fluid they move).
- **PWR board — real ECCS/feedwater indications, a modeled condensate pump, and boron-in-the-loop.**
  The AFW and HPI/charging flow + discharge-pressure gauges, and the condensate flow gauge, now read
  true engine quantities instead of derived placeholders. The **condensate pump** is a real control:
  securing it collapses main feedwater to zero (auxiliary feedwater is a separate train and keeps
  feeding). **Boron control** (the board's ON/OFF + target-ppm) now runs as a proper automatic control
  channel in the controls layer — it borates below the target and dilutes above, holding within a
  deadband, and drops to manual the moment you touch the boron controls yourself. The turbine runs at
  **1800 rpm** at full power (a large PWR's half-speed generator), which the board now displays live.
- **Instructor highlight on the new board.** Guided-scenario steps and procedures can now make the
  relevant control on the board glow (and hang a maintenance tag on the aux-feedwater valve), the same
  as the old plant display.
- **New PWR plant board (data-driven learning synoptic).** The PWR plant display is now a
  single integrated schematic authored in a diagram builder and exported as data
  (`ui/diagram/board/pwr_board_data.js`), replacing the procedurally-drawn synoptic. It
  carries its controls on the equipment — rod control + SCRAM, pressurizer spray/heater,
  CVCS charging & letdown orifices, boron control, HPI/AFW/steam-dump, feed pump, turbine
  load — plus every indication (temps, pressures, flows, NIS, boron, PORV tailpipe temp).
  A new **TRIP BLOCKS** menu lists the reactor trips that can be blocked for a normal
  shutdown (low-pressure, low-flow, and the two startup high-flux trips), each gated by its
  permissive. The **Realistic** diagram-mode toggle is disabled for now — the realistic
  (quiet-board) version of this diagram is still in design.

### Added
- **Public changelog page (`changelog.html`).** A player-facing "what changed" page, linked
  from the footer of every site page. **Its log starts at the public launch** — the
  pre-launch development history stays in this file and `BUILD_DECISIONS.md`, which remain
  the engineering record. Ships with an empty state; entries are added by hand from a
  template in the page source (tagged Added / Changed / Fixed, newest first).
- **Vercel deploy config (`vercel.json`).** `/sim` now works as a clean entry URL
  (rewrites to `ui/shell.html`, query strings preserved — `/sim?engine=pwr`), and the deploy
  build stamps `site/version.js` with the commit sha, so the version shown in page footers
  and carried on feedback reports identifies an actual build instead of reading "dev build".
  In-page links stay relative so the pages still open straight off the filesystem.
- **Public website, Phase W1 (`Blueprint/WEBSITE_SPEC.md`).** The root `index.html` is now the
  ReactorDynamics.com landing page (hero + plant picker: PWR live via `?engine=pwr`, BWR/RBMK
  "coming soon") instead of a bare redirect; `ui/shell.html` is unchanged and still directly
  openable. New `about.html`, `privacy.html`, and `feedback.html` (form packages a
  `rd_feedback_*.json` bundle — with optional `rd_diag_*.json` attachment, validated ≤2 MB —
  until the W2 backend lands), shared `site/site.css` in the quiet-board palette, and
  `.vercelignore`. Verified with a headless-Edge harness (links, coming-soon cards,
  package/validation flows, shell reachability, zero console errors).
- **In-sim feedback (💬) with session telemetry — owner ruling: no player file uploads.**
  A 💬 button in the sim-controls row opens a feedback overlay (category, description,
  optional email) with a pre-checked *"Attach this session's telemetry"* box — the attachment
  is the live diag recorder's bundle (same payload as the Dev-tab **Diagnosis JSON** export,
  now split into `buildDiagBundle()` + download). Telemetry can ONLY come from the live
  session: the site feedback form has **no file input** and always submits `diag: null`.
  W1 packages the report as a `rd_feedback_<category>_<plant>.json` download; W2 swaps in
  `POST /api/feedback`. Harness now 20 checks; `verify_e2e_ui` + `run_e2e_controls` hold.
- **PWR pressurizer pressure-setpoint + steam-dump pressure-setpoint controls (Mode-5 playability).**
  The Mode-transition missions instruct raising the pressurizer setpoint to NOP (15.41 MPa) on a
  heatup and lowering the steam-dump setpoint on a cooldown, but the UI had no control for either —
  so `pwr_mode5_to_mode3` and `pwr_return_to_mode1` could not be pressurized past their `heat_up`
  gate, and the cooldown lacked its authored dump-setpoint step. Added a **Pressure SP** box to the
  PZR card and a **Dump SP** box to the Turbine-Generator card (both MPa-fixed with a live readout);
  the `set_pressure_setpoint`/`set_steam_dump_setpoint` engine commands already existed. Gated in
  `verify_e2e_ui` REQUIRED_ACTS.

### Fixed
- **PWR RCP Run/Stop buttons now start/stop the pumps (`set_rcp`) — Mode-5 ship-blocker.** The RCP
  **Run** button issued `clear_failure rcp_trip`, which cannot start a pump secured in cold shutdown
  (nothing sent `set_rcp{running:true}`; clearing a `stop_pump` failure is a no-op — "pumps stay off
  until restarted"). The first operator action of the two heatup missions ("start the RCPs") was a
  dead no-op, making them unplayable from the UI. Run now clears any RCP-trip failure *and* starts the
  pumps; Stop is a clean operator stop. Every RCP indicator keys off the `rcp_running` instrument, so
  the board stays truthful; no test or lesson used the old failure-path buttons.
- **A manual (operator) reactor trip now latches the RPS (`rps_state.scrammed`) — finding C4.**
  A manual `scram` command scrammed the engine (`true_state.scrammed` and the `rps_scrammed`
  instrument both went true) but left the control layer's `rps_state.scrammed` bookkeeping flag
  false — only automatic trips set it. The mislabel was masked because every consumer dual-reads
  `rps_state.scrammed || true_state.scrammed` (simulation_service, instructor, kernel automation
  stand-down), but any future consumer reading `rps_state.scrammed` alone would have been wrong.
  `control_kernel.handleCommand` now latches the RPS on an operator scram (before interception,
  matching the automatic path: an ATWS that blocks the rods still shows the asserted trip signal).
  With the latch authoritative, the automation stand-down collapses its dual-read to
  `this.rps.scrammed` (the snapshot-level dual-reads in simulation_service/instructor are kept as
  defensive belt-and-suspenders). No gate moved (full battery green across all three plants).
- **Beat-driven world rewind no longer double-steps the Instructor or double-broadcasts (P3-3).**
  An instructor `beat.rewind` (used by `pwr_hook`) called `_restore` mid-`tick`, and `_restore` —
  shared with file-load — re-ran `_assembleWithInstructor` (a second `instructor.step`) and
  `_broadcast`, while the outer tick also reassembled and rebroadcast. Two snapshots per tick and a
  post-rewind beat evaluated against the rolled-back state. The in-tick rewind path is now `silent`
  (assemble without stepping, let the outer tick broadcast once); operator-button and file-load
  restores are unchanged.
- **Latent control-layer fixes (P3-4/5/6).** `_initialEsfArms` evaluated a conditioned actuation's
  gate against the still-empty `lastInstruments` at init (`_evaluateCondition` now takes an explicit
  instrument map; both call sites pass the live `ins`); a channel `requires`-note dereferenced a
  possibly-undefined channel (null-guarded). None had a live trigger in the shipped configs.
- **`p_pumpsuction` node pressure floored at 0 (P3-7).** A deep depressurization with RCPs running
  could expose a negative absolute pressure in `true_state`; floored (dynamics-identical — cavitation
  already floors into `T_sat`'s guard).
- **High-flux reactor trips can actually fire (PWR + BWR).** The `power_range` meters clipped at
  exactly the 120 % trip setpoint; `crossed()` is strict, so a pegged meter never fired the trip
  (the RBMK was fixed for this long ago; the other two plants never got the parallel change —
  finding C1). Evidence: the BWR held 175 % true power indefinitely with no trip; the PWR rode a
  198 % excursion trip-free inside a passing ops check. Both meters now `[0, 200]`. BWR
  `abuse_rod_yank_at_power` passes; PWR `abuse_accel_latency` gains hard "protection tripped"
  checks at 1× and 256× (the C1 acceptance, re-pointed after the old `abuse_startup_yank`
  acceptance went dead under the newer source-range trip).
- **`inject_failure` with an unknown id is now a COMMAND_ERROR (all three engines).** The silent
  no-op let a run_pwr test inject the effect-name `primary_leak` for months — its "LOCA" never ran.
- **Four missions showed no message on a gated click** (`pwr_chain_reaction`, `pwr_boron`,
  `rbmk_void`, `bwr_recirc`): `gate.message` was authored as a plain string, but the instructor
  renders `msg[register]` — players got a block with no explanation. Now both-register objects,
  and the campaign gate statically validates the shape.
- **`pwr_mode3_to_mode5` cooldown script scrammed the plant en route** (caught by the new
  arrived-UNscrammed assertion): at 120× a broadcast is 30 sim-s, so the script's full-spray
  depressurization crashed through the P-11 permissive AND the 12.41 MPa lo-press trip between
  operator samples, and the subcritical plant still coasted to the Cold Shutdown card. The driver
  now walks the pressure setpoint down 0.5 MPa/sample until the P-11 block is placed (the real
  procedure sequencing), then releases full spray.

### Added
- **Test-suite review + hardening pass (2026-07-19)** — full findings in
  `Diagnostic/TEST_SUITE_REVIEW_2026-07-19.md`. Repairs to checks that could not fail (run_m6
  literal-`true` tautologies + a self-defeating consume-flag check; run_m4 vacuous safety-lift
  disjunction; run_pwr loss-of-feedwater trip tautology + a dead loss-of-vacuum predicate;
  run_e2e_controls CVCS pair stale since the SGTR leak rescale — now asserts the servo's real
  contract: charging converges to match the leak). New coverage:
  - **run_pwr 28→31**: `feedwater_isolation` (P-14 latch gates main feed, AFW passes through,
    operator restore), `accumulator_arming_boundary` (the restored 4.14 MPa setpoint pinned at
    ±0.3 MPa; full SGTR never arms the tanks, large LOCA dumps them — the break-size
    discrimination the restore was for), `steam_dump_capacity_cap` (the ~50 % cap on manual
    full-open, previously deletable without failing anything).
  - **run_bwr 12→15**: `protection_trips` (the suite's FIRST trip assertions — negative control,
    trip-table shape pin, fireable high-flux trip), `atws_slc` (failure_to_scram blocks rods,
    SLC borates down, stop/resume semantics), `hpci_injection` (HPCI actually runs, recovers
    level, hpci_failure kills it). Conditional-vacuous SBO/actuation checks now assert their
    preconditions.
  - **run_rbmk**: eps_bypass check gains its missing positive control (a past-setpoint state
    trips un-bypassed, silenced bypassed) + post-1986 void-trip fireability; flagship-post peak
    bound (final-power-only would have passed a transient excursion); stuck-rod melts-SOONER
    discriminator; low-power ORM pinned to ≈7.5.
  - **run_m4 17→18**: P-11/P-7 trip-bypass lifecycle — cold init auto-blocks, lo_press
    auto-reinstates on repressurization (the safety-critical direction), re-armed trip fires.
  - **run_campaign 47→51**: static "references resolve" pass (branch goto targets,
    instrument/true_state/alarm/command names, direction + advance vocabulary, gate shapes,
    inject_failures ids — a typo'd reference previously soft-locked or silently never fired);
    the three untested TMI-2 Part 3 endings (Plugged-Not-Refilled, Caught-Late, Holding-Not-Won);
    arrived-UNscrammed assertions on all three Mode 5↔1 missions.
  - **ops_pwr**: `ops_sg_overfeed_p14` — hands-off P-14 acceptance under the real control layer
    (HI HI alarm at 88 % precedes the 90 % actuation; turbine trip + feed isolation + P-9 scram).
  - **ops_rbmk**: hard C2 acceptance check (256× accel destroys what 1× survives), deliberately
    RED until C2 is fixed.
  - **run_procedures**: strict expected-fail mechanism — B3 reports as `✗(known B3)` without
    reddening the gate; an XPASS turns the gate red so the annotation cannot go stale.
- **CVCS charging now controls pressurizer level; AUTO make-up holds level (PWR).** Charging/letdown
  gain real authority over indicated PZR level: a bounded net-make-up insurge term (`(charging − letdown)
  · K_cvcs_level`) is added to the level model, so charging raises level and letdown lowers it — as in a
  real plant. **CVCS AUTO make-up now holds programmed level** (not just mass): charging modulates
  above/below letdown to drive level toward `pzr_level_nominal`, while still compensating a gross
  inventory deficit (`max(level-servo, inventory-makeup)`) so a leak that has not yet shown as a level
  drop is still caught. The term is small and bounded (`charging_max`/letdown ≈ 0.07), far below the
  fast `K_void_surge` that drives the **TMI level-vs-inventory deception** — which is verified intact
  (level still rises as inventory falls; charging is isolated in that path anyway). This fixes the
  `ops_normal_shutdown` probe (the operator's rampdown no longer stalls at 45 % power when the
  pressurizer shrinks below the 30 % hold — AUTO make-up restores level so the ramp continues to hot
  standby). New config `reactivity.cvcs_charge_per_level` (0.006), `pressurizer.K_cvcs_level` (6.0).
  Gates: run_pwr 26/26, campaign 47/47, m4/m5/m6, autoctl 20/20, ops now 55/66 (PWR 17/19).

### Changed
- **PWR pressure model holds saturation on a violent depressurization (SGTR).** Two coupled fixes so a
  fast depressurization (e.g. an SGTR EOP on HPI) tracks saturation instead of reporting impossible
  negative subcooling. **(1)** The pressurizer sat-pull (pressure → Psat(Tavg)) now engages whenever the
  coolant is superheated (Tavg above Tsat(P)), not only when the void bookkeeping has flagged two-phase —
  so a depressurization at full/overfilled inventory still pins pressure at saturation without touching
  `primary_void_fraction` (the calibrated TMI void-surge is untouched, verified). **(2)** The subcooled-
  liquid terms — break-depressurization and the thermal expansion/contraction surge (`K_surge`) — are now
  suppressed in the saturated regime, so an HPI cold quench dropping Tavg fast no longer crashes pressure
  below saturation via a thermal-outsurge term that is meaningless in two-phase. `ops_sgtr_managed`
  subcooling held **+27 °C** (was −152 °C, core-loss); the scenario's EOP was also made faithful to the
  #1 EOP rule — throttle the cooldown/dump to hold subcooling margin rather than crash-cool on a full
  dump. PWR ops 17/19 → 18/19. No regressions across run_pwr/campaign/m4/m5/m6/autoctl.
- **PWR pressure/secondary realism (ops-tuning).** Three physics-honesty fixes surfaced by the ops
  probes. **(1) Spray floor:** pressurizer spray can no longer pull primary pressure to the containment
  floor — it tapers to zero as pressure approaches the saturation pressure of the hottest coolant (Thot,
  the core exit), self-limiting at the onset of core-exit boiling (real spray water is cold-leg liquid).
  Full-heaters-vs-full-spray now floors ~8 MPa instead of 0.1 MPa (`abuse_heater_spray_fight` passes). On
  a real cooldown Thot falls too, so the floor tracks down and spray still depressurizes as fast as the
  plant cools. **(2) Steam-dump capacity:** the turbine-bypass dump is capped at a realistic ~50 % of
  rated steam flow (`steam_dump_max` now a true cap on both the manual override and the auto demand), so a
  full load rejection lifts the SG safeties and slamming the dump open gives a rate-limited cooldown
  instead of a Tavg crash. **(3) SGTR leak scaling:** a tube rupture no longer drains the whole primary in
  ~30 s — a per-failure `leak_scale` converts the "% rated flow" rating to a realistic slow drain (tens of
  minutes) the EOP can out-inject (SGTR inventory now holds >70 %; a large-break LOCA is unscaled and
  still fast). Gates unchanged: run_pwr 26/26, campaign 47/47, m4/m5/m6, autoctl 20/20, ops now 54/66.

### Added
- **High-high SG level protection (P-14) + realistic low-low reactor trip (PWR).** The steam-generator
  level ladder gains its high-side protection and the low-low reactor trip is moved to a more realistic
  setpoint. **(1) High-high SG level (P-14) at 90 %** now fires a coordinated protection: **turbine trip**
  + **main-feedwater isolation** (new `isolate_feedwater` command / `feedwater_isolated` latch — stops
  MAIN feed only; AFW is downstream of the gate and keeps feeding) + **reactor trip**. The reactor-trip
  half is the P-9 interlock (lost heat sink at power → heatup/overpressure), gated by a new `above_p9`
  status instrument (≥50 % power) and **scoped to the SG-level cause** so a turbine trip from another
  source (MSIV closure, overspeed, vacuum) still does *not* scram. A new **`SG LVL HI HI`** critical
  alarm annunciates at 88 %. **(2) The low-low SG-level reactor trip moves 12 % → 17 %** (with its
  `SG LVL LO LO` alarm), giving the heat sink more margin and sitting just below the 20 % AFW auto-start
  (real Westinghouse practice: AFW is established as the post-trip heat sink at ~the same low-low signal,
  not to prevent the trip). A steam-line break now trips early on the SG swell (P-14 → turbine trip +
  feed isolation + scram) instead of riding to a late low-pressurizer-level trip — the automatics close
  the previously-unprotected high-SG-level condition. Gates: **`run_pwr` 26/26**, campaign **47/47**,
  ops **53/66** (identical fail set), m4 **15/15**, m5 **19/19**, m6 **16/16**, autoctl **20/20**.

- **Physical break-depressurization model + realistic accumulator setpoint (PWR).** The accumulator
  arming pressure is restored from the detuned **1.5 MPa** to the real B&W core-flood-tank /
  Westinghouse SIT cover-gas pressure **4.14 MPa (600 psi)**. This is now physically meaningful because
  break depressurization was reworked. **Before:** `tavg` pinned near ~300 °C for *every* break size (no
  term removed the break's enthalpy), so the saturation plateau was fixed and break size was set only by
  `K_leak_depressurize` — a direct pressure sink that ran even two-phase, forcing pressure far below
  saturation while the coolant stayed hot (impossible superheat), and never actually reaching the old
  1.5 MPa setpoint, so the accumulators were dead code. **Now:** a **break blowdown flash-cooling** term
  in `pwr_thermal.stepCoolant` (`dTavg += blowdown_gain · leak_flow · (blowdown_sink_c − tavg)`, same
  self-limiting form as the ECCS quench, keyed on `leak_flow` only) makes the plateau respond to break
  size — a **small break** stays hot and pins pressure on the plateau *above* 600 psi (the SGTR/TMI
  inventory-and-void lesson intact), a **large break** cools the RCS toward containment so pressure falls
  below 600 psi and arms the accumulators + cold quench. `K_leak_depressurize` is gated to the subcooled
  regime so two-phase pressure tracks saturation consistently (no superheat). Tuned so ≤8 % SGTR holds
  ~5.9 MPa (854 psi) while the 20 % large-LOCA default drops to ~3.2 MPa (462 psi) and dumps the
  accumulators. New config `thermal.blowdown_gain` (0.02), `thermal.blowdown_sink_c` (110 °C). The
  **Mode 5 cold-shutdown** state now **isolates the SI accumulators** (it sits at 2.5 MPa, below the
  restored setpoint — the real shutdown lineup); heatup re-aligns them once pressurized and cooldown
  re-isolates before depressurizing into their band. The flagship TMI scenario is untouched (its
  stuck-open PORV leaves `leak_flow=0`). Gates: **`run_pwr` 26/26**, campaign **47/47**, ops **53/66**
  (identical fail set), m4 **15/15**, m5 **19/19**, autoctl **20/20**.

- **Accumulator cold-water quench + discharge isolation valve (PWR).** Two gaps in the accumulator
  model, both raised in review. **(1) The cold injection had no thermal effect.** HPI/LPI and the
  accumulators added borated inventory (and, recently, boron) but their water carried no *temperature* —
  blasting thousands of gallons of cold RWST/SIT water into the cold leg did nothing to `tavg`. Now
  `pwr_thermal.stepCoolant` includes a **cold-injection quench**: injected water enters at
  **`eccs_temp_c` (40 °C)** and removes sensible heat by perfect-mixing, `dTavg += eccs_cooling_gain ·
  q_inj · (eccs_temp_c − tavg)`, where `q_inj` is the HPI/LPI+accumulator throughput stashed by
  `stepInventory`. It is **self-limiting** (cools no further than the RWST temperature) and **excludes
  RHR** (recirculation, not cold make-up). `eccs_cooling_gain` (0.08) decouples the thermal coupling
  from the mass/void tuning so the quench is dramatic-but-observable (~°C/s) rather than a single-step
  crash. **(2) No isolation valve.** The accumulators were purely pressure-driven with no way to isolate
  them. Added the motor-operated **discharge isolation valve** (`accumulator_valve_open`, default
  aligned) with **`open_accumulator_valve` / `close_accumulator_valve`** commands; a shut valve
  hard-gates discharge at any pressure, so a normal cooldown can depressurize below the check-valve
  setpoint without a spurious dump. Old saves migrate to *valve open* (unchanged behavior). (The
  accumulator setpoint was left at 1.5 MPa in this change and **subsequently restored to the real
  4.14 MPa** — see the "Physical break-depressurization model" entry above.)
  Verified new `run_pwr` guard `eccs_cold_injection` (quench magnitude matches the mixing rate, no-
  injection control stays flat, self-limit holds; valve blocks discharge/boration and preserves the
  tank). Gates: **`run_pwr` 26/26**, campaign **47/47**, ops **53/66** (unchanged — no new failures).

- **Regression tests for the recent PWR reworks.** An audit found several recently-added features were
  exercised but never *asserted*, so a regression would have passed silently. Added dedicated guards:
  - **§14 engine suite (`run_pwr` 20→25):** `eccs_boration` (injection raises core boron toward the
    RWST source; no-injection control stays flat; accumulators borate; no overshoot), `loop_pressure_nodes`
    (node ordering, flow² offset scaling, coastdown collapse to a single pressure), `letdown_orifice_lineup`
    (the four-state lineup ≈0/3/4/7 %, √ΔP pressure-driven tail-off, deprecated `set_letdown_flow` alias),
    `save_migration` (a pre-rework save gains `pressure_setpoint`/`steam_dump_setpoint` defaults, migrates a
    legacy `letdown_flow` to an orifice lineup, folds `lpi_active`→`hpi_active`, seeds the loop nodes), and
    `mode5_controls` (pressure-setpoint tracking, RCP start/stop, steam-dump-setpoint secondary cooldown).
  - **`run_m5` attention stops:** added the **alarm** trigger and the crucial **non-trigger** case — a
    commanded power/load maneuver must *not* snap fast-forward (only unbidden events do), guarding
    fast-forward from being made useless during normal maneuvering.
  - **Shared `checkSanity` (every ops probe):** loop-pressure-node ordering, `boron_ppm ≥ 0`, and primary
    inventory bounds now hold as passive invariants across all PWR ops scenarios (guarded so RBMK/BWR skip).
  - Gates: `run_pwr` **25/25**, `run_m5` **19/19** (72 checks), ops **53/66** (unchanged scenarios, +60
    invariant checks), `run_m7` **OK**, campaign **47/47**, RBMK **23/23** / BWR **12/12** unaffected.

- **Borated emergency injection (PWR) — ECCS and accumulators now carry boron into the core.** The
  emergency-injection water was pure inventory: HPI/LPI and the accumulators added coolant mass but
  never changed core boron, so the negative-reactivity **shutdown-margin** role of borated safety
  injection was absent. Now every emergency-injection source delivers water at **`eccs_boron_ppm`
  (2500 ppm, the RWST/SIT concentration)** and it **mixes into `boron_ppm`** by perfect-mixing
  transport — `dC/dt = q_inj·(C_eccs − C)/m` in `pwr_primary.stepInventory` — so injection **raises
  core boron and adds negative reactivity**, exactly as borated ECCS/accumulator water holds a
  reflooded core subcritical during a LOCA. The `boron_analyzer` readout now reflects this. Losses
  (letdown/break/relief) leave at the current concentration and don't change it. CVCS borate/dilute
  stays a separate idealized direct-rate channel. **Not modeled:** boil-off boron concentration (the
  lumped loss term doesn't distinguish boil-off from leakage). Verified: a large-break LOCA with SI
  drives boron 747 → ~2050 ppm (≈ −13000 pcm); no-injection control stays flat. PWR engine **20/20**,
  scenarios **3/3**, campaign **47/47**, `run_autoctl` **20/20**, `run_m5` **19/19**, ops probes at
  **53/66** baseline (no regressions).

- **RCP cavitation (PWR) — the reactor coolant pumps now cavitate when the loop voids.** A running
  RCP degrades when its **suction node** approaches saturation: `suction_subcool_c = Tsat(p_pumpsuction)
  − tcold` (the lowest-pressure node, distinct from the bulk subcooling margin). Below an 8 °C onset the
  pump cavitates, severity ramping to full over 8 °C more, and **loses up to 70 % of delivered flow**
  (`flow_frac`) — a real mechanical effect, not just an indication. This is the physics behind the
  TMI-2 control room's "the pumps are objecting" cavitation noise: as the stuck-PORV LOCA drives the
  RCS to saturation, the suction margin collapses, the pumps cavitate, and coolant flow falls. A new
  **"RCP CAVITATION"** alarm annunciates, the synoptic RCP reads **CAVITATING**, and true state exposes
  `suction_subcool_c` / `rcp_cavitation_frac` / `rcp_cavitating`. Only a running pump cavitates. PWR
  engine **20/20** (new acceptance test), campaign **47/47**, `verify_e2e_ui` PASS.

- **Two-orifice letdown (PWR) — CVCS letdown is now a pressure-driven orifice lineup.** Letdown was a
  commanded normalized setpoint; it is now **two fixed orifices, each independently in/out** — four
  states **off / A / B / A+B** (`set_letdown_orifices {a, b}`). Flow is **pressure-driven** off the
  cold-leg node — `C·√(p_coldleg − 2.4 MPa)`, the 2.4 MPa being the letdown-backpressure-control-valve
  setpoint — so it **tails off as RCS pressure falls** toward that value on a cooldown, instead of
  holding a commanded constant. Nominal at NOP: A ≈ 3 %, B ≈ 4 %, A+B ≈ 7 % of rated (A+B is a net
  drain, exceeding charging, for level reduction / depressurization). The synoptic CVCS panel gains
  two orifice toggles (A / B) replacing the letdown setpoint box; the manual renames "Letdown Valve"
  → **"Letdown Orifices (CVCS)."** `set_letdown_flow {normalized}` is kept as a **deprecated alias**
  (maps to the nearest lineup) and old saves migrate (`letdown_flow` → orifice lineup by NOP-flow).
  PWR **19/19**, campaign **47/47**, `run_m5` **19/19**, synoptic **55/55**, `verify_e2e_ui` PASS.

- **Loop pressure distribution (PWR) — three primary-loop pressure nodes.** The RCS is
  incompressible liquid outside the pressurizer bubble, so pressure stays ONE dynamic state
  (`pressure_mpa`, the pressurizer/hot-leg reference) plus a **quasi-static ΔP field** set by
  pump head vs. friction — no new integration, no stiffness. `pwr_primary.computeNodePressures`
  now exposes `p_hotleg` (= `pressure_mpa`), `p_pumpsuction` (between SG and RCP — lowest), and
  `p_coldleg` (RCP→RX pump discharge — highest); both offsets scale with `flow_frac²` and collapse
  to a single pressure when the RCPs coast down. The systems tied into the loop now read the node
  they physically connect to: **ECCS/accumulator injection works against the cold-leg node** (pump
  discharge, higher than the pressurizer reference at power; converging on it as a LOCA trips the
  pumps), while RHR suction stays on the hot leg. Node pressures are true state only — the single
  `primary_pressure` instrument is unchanged (real plants have one wide-range RCS gauge, not three).
  PWR engine **19/19**, campaign **47/47**, `run_m5` **19/19**.

- **Fast-forward attention stops — the clock snaps back to real time when the operator must
  act.** Time acceleration lives in the Simulation Service (M5); it now auto-decelerates to 1×
  the moment a genuine plant event appears on the broadcast the event lands on — a **reactor
  trip / SCRAM**, a **newly injected or latched failure**, or a **newly annunciating alarm**. It
  applies to *any* fast-forward — operator-selected or beat-driven — so an authored fast-forward
  can no longer blow past a trip. (A *commanded* power/load maneuver is deliberately **not** a
  trigger: an excursion that genuinely needs attention already annunciates an alarm, which the
  alarm trigger catches, whereas an operator- or auto-channel-commanded ramp is expected change
  and must remain fast-forwardable.) The snapshot that carries the event also carries
  `metadata.speed_snap = { reason }`, and the UI toasts *why* the clock changed
  ("Dropped to real time — reactor trip"). Authored *soft* stops (pausing just before an
  operator action during a mode change) remain a content pattern: a beat with `speed: 1`.
  `run_m5` **19/19**, `run_autoctl` **20/20**.

- **Three Mode 5 ↔ Mode 1 campaign missions (PWR).** The training campaign now teaches the
  full commercial heatup/cooldown loop on the board, using the cold initial condition below:
  - **`pwr_mode5_to_mode3` — "The Big Warm-Up"** (Act II): the cold heatup — pressurize, start
    RCPs, SR→IR handoff, take the core critical, and ride a low power up to NOP, settling at
    subcritical Hot Standby.
  - **`pwr_mode3_to_mode5` — "Cooling Down"** (Act III): the controlled cooldown — borate for
    margin, cool the secondary, depressurize on subcooling, place RHR, secure the pumps.
  - **`pwr_return_to_mode1` — "Cold to Power"** (Act III): the full startup Mode 5 → Mode 1,
    closing the round trip.
  - Each mission's intro carries the honesty banner (compressed rate; controlled nuclear heat).
  - **P-7 / P-11 RPS trip bypass** (control layer): the low-pressure and low-flow reactor trips
    are now bypassable in the cold/shutdown regime (a plant that inits depressurized loads with
    them blocked; they auto-reinstate as pressure/power come up) — the real startup/shutdown
    permissives, without which a cold plant loads scrammed and can't be heated. Neutral for
    every hot initial state (a LOCA/TMI depressurization still trips).
  - PWR campaign is now **34 missions**; `run_campaign` **47/47** with a scripted-operator drive
    for each new mission.

- **Cold Shutdown (Mode 5) initial condition + full Mode 5 ↔ Mode 1 transition (PWR).** The
  engine now models a genuinely cold, depressurized plant and can be driven all the way up to
  power and back down on integrated physics — the path the manuals previously marked *"[narr]
  only — no cold IC."*
  - **New `cold_shutdown` initial state (Mode 5).** RCS cold (~50 °C) and depressurized
    (~2.5 MPa, below the 400 psi RHR interlock), subcritical with shutdown-margin boron, RHR in
    service holding the cold sink, RCPs secured (RHR provides forced circulation), SR energized,
    ~0 decay heat. Holds stably.
  - **Operator pressure setpoint.** New `set_pressure_setpoint {mpa}` — the heaters/spray now
    hold an operator-adjustable target across the full 0.1–17 MPa range (default NOP), so
    pressure holds where it is placed during heatup/cooldown instead of snapping to NOP.
  - **Secondary cooldown.** New `set_steam_dump_setpoint {mpa}` lets the operator lower the
    no-load steam-dump target so the secondary — and with it the primary, through the SG —
    cools during a cooldown.
  - **Reactor coolant pump control.** New `set_rcp {running}` starts/stops the RCPs (secured in
    cold shutdown; started for pump heat and SG coupling during heatup).
  - **Plant MODE indicator + heatup/cooldown rate.** True-state now exposes `plant_mode` (1–6)
    and `plant_mode_name` (per manual 05 §2), plus `tavg_rate_c_per_hr`.
  - **New `5_percent` initial state** — low-power Mode 1, At Power (~6 %, just above the 5 %
    Startup/At-Power boundary).
  - **Full-stack cold lineup.** A plant that initializes depressurized starts with the
    low-pressure Safety Injection ESF **disarmed** (the real P-11 SI-block lineup), so loading
    Cold Shutdown no longer spuriously floods the core. Behaviour is unchanged for every hot
    initial state (TMI included).
  - New snapshot/state fields: `pressure_setpoint`, `steam_dump_setpoint`, `plant_mode`,
    `plant_mode_name`, `tavg_rate_c_per_hr`. Save-compatible: older saves migrate
    (`pressure_setpoint ← 15.41`, `steam_dump_setpoint ← 8.90`).
  - Tests: engine `cold_shutdown_hold`, `steady_five_percent`, and `mode5_to_mode1_roundtrip`
    (drives cold→hot→cold on integrated physics); full-stack cold-IC guard in `run_m5`.

- **RHR / LPI system rework (PWR).** The Residual Heat Removal system is now modeled as
  the real shutdown-cooling loop that doubles as Low-Pressure Injection:
  - **Hot-leg suction valve with a 400 psi interlock.** `set_rhr {active}` opens/closes the
    RHR hot-leg suction valve. The valve can be opened only below **400 psi (2.76 MPa)** and
    **auto-closes** if primary pressure climbs back above it — the operator must depressurize
    into the RHR band first.
  - **Adjustable cooldown rate via the heat-exchanger flow split.** New command
    `set_rhr_hx {fraction | pct}` routes more or less of the constant RHR loop flow through
    the heat exchanger vs. the bypass, throttling cooldown *rate* without changing total flow
    or coolant inventory.
  - **Single ECCS card mode indicator.** New `eccs_mode` field (`HPI` / `LPI` / `RHR` /
    `off`) is computed engine-side each step to drive one Emergency Cooling card. **RHR** is
    indicated whenever the suction valve is open.
  - **Automated LPI on LOCA.** LPI remains the low-head/high-flow regime of the merged
    HPI/LPI pump curve, armed automatically by the 11.03 MPa Safety Injection signal (the
    LOCA signal) and delivering as the plant depressurizes — no separate operator action.
  - New snapshot fields: `rhr_valve_open`, `rhr_hx_fraction`, `eccs_mode`.

### Changed
- RHR alignment permissive moved from 3.45 MPa to the 2.76 MPa (400 psi) valve interlock;
  the control-layer auto-align setpoint tracks it.
- `set_rhr` now drives the interlocked suction valve rather than a bare active flag; RHR
  heat removal scales with the HX flow split.
- Operator manual reference regenerated; Blueprint docs updated (`M1` §6.9, `CONTEXT.md`
  §6.5/§6.7, `M4b` §3b, `pwr_synoptic_prerequisites.md`).

### Notes
- UI card layout is intentionally left as an open task; the field/command binding contract
  for the ECCS card is documented in `Blueprint/pwr_synoptic_prerequisites.md` §6.2a.
- Save-file compatible: older saves migrate (`rhr_valve_open ← rhr_active`,
  `rhr_hx_fraction ← 1.0`). `set_dhr` / `set_lpi` remain as deprecated aliases.
