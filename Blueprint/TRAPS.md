# Traps — evicted from `CLAUDE.md`'s standing-procedure list

**Status: RECORD, not policy.** Every entry here is a real trap that cost a real session, and
none of it is wrong. It lives here rather than in `CLAUDE.md` because that file is paid for on
every turn by every agent and its standing list is capped at **25 bullets** *(OWNER RULING,
2026-08-10: selected "Cap at 25, evict to TRAPS.md" from options I wrote — a selection, not
verbatim words)*. Gated by `test/run_doc_budget.js`, for the reason the themes cap is gated: a
cap written in prose inside the file it governs decays, and this one had none until it was the
last unbounded thing in a file sitting exactly on its word limit.

## The eviction criterion — evict what a GATE already catches

The standing list's job is to warn about things **nothing can tell you**. So when the cap binds,
the entries to move here are the ones where getting it wrong turns a runner red — the trap
announces itself, and the full story is a `TUNING_LOG` search away. What stays in `CLAUDE.md` is
the class no gate can reach: process traps, prose claims, silent-wrongness idioms, and the
"a passing check can be hollow" family.

That is a criterion and not a rule; a plant-specific trap whose gate only fires in a regime
nobody probes belongs back in the file. **If you evict one and it bites someone anyway, that is
the evidence to put it back** — say so in the session log rather than quietly re-adding it.

---

## Evicted 2026-09-09 (a THEMES-rotation eviction — the #633/#508 relief-flow bullet, out for #670's arming-window trap)

A rotation eviction, not a standing-list one: the themes list is capped at five and this was the
oldest of them. **It meets the criterion in part.** The relief half is now pinned — the flow law
is pressure-dependent and its checks sample across the range, so a flat-flow regression reds a
runner — and the no-load Tavg half is pinned by the dump controllers' own probes at 547 °F
(559.3 K). What no gate reaches is the *habit*: choosing the state a fixture sits at. That one
line was rescued into the standing list, onto the #508 "reference moving, not the plant" bullet.

> **A GATE WRITTEN WHERE THE DEFECT CANNOT BE SEEN IS 56 GREEN CHECKS OVER NOTHING** (2026-09-06,
> #633/#508). Every relief path passed a FLAT mass flow, so a 100 % atmospheric dump valve drove the
> steam generator to **−14 psig** still passing its full rating. Ten of the twelve reds sampled at an
> ARBITRARY pressure (6.0 MPa) — right only BECAUSE flow ignored pressure. Sibling: the no-load Tavg
> anchor was another plant's 557 °F while the engine boots no-load at 547 °F, so **both Tavg-mode dump
> controllers were dead at this plant's own no-load point** and a routine trip vented **18,813 lbm**
> to atmosphere. **Ask what pressure/state your fixture sits at, and whether the claim survives moving it.**

**The half worth carrying, if you only read one line:** ask what pressure or state your fixture
sits at, and whether the claim survives moving it — a check can be right only because the model
ignores the very quantity the check is about.

---

## Evicted 2026-09-06a (a STANDING-LIST eviction — the board-data bullet, out for #633/#508's reference-vs-plant trap)

**Why this one.** It is the clearest case the criterion above describes. The bullet's own
load-bearing line was *"run `node test/verify_board_check.js` after any board change"* — and
`run_all` now auto-discovers `verify_*` runners and fails on any it has no baseline for, so **the
gate catches it whether or not anyone remembers the prose**. One sentence stayed in `CLAUDE.md`:
never hand-edit the file, ask the owner to export. That half is a *process* instruction no runner
can issue — the builder's live state is in the owner's browser localStorage, so no gate can
produce the input.

**⚠ If a board change goes wrong in a way `verify_board_check` does NOT catch, that is the
evidence to put this back.** Say so in the session log rather than quietly re-adding it.

### The evicted text, verbatim

> **`pwr_board_data.js` is GENERATED** — never hand-edit it; the round trip is in
> `tools/gen_board_data.js`'s header, and the builder's live state is in browser localStorage, so
> **ask the owner to export**. **A re-export changes PIPE ids**, silently orphaning `PIPE_TEMP`
> and undoing geometry fixes — **run `node test/verify_board_check.js` after any board change**
> (this file twice claimed a green tally while the harness sat at 1 FAILURE). Editing traps: a
> card TITLE is not an item; `DOC_PATCHES.items` is an object literal so a repeated id silently
> replaces the first; `Pump`/`Valve`/`Tee` ports quantise to the 5 px grid; exclude
> `kind: 'component'` tiles from a free-slot scan or the instrument column reads as full.
> **Measure the board, don't eyeball it** — `RD.PwrBoard.ports()` makes an alignment claim a
> subtraction. **Screenshot it** — art overlap is invisible to an item-vs-item scan.

**The four editing traps are the part no gate reaches**, and they are why this section keeps the
full text rather than a pointer: a repeated `DOC_PATCHES` id replacing the first *silently*, a card
title mistaken for an item, port quantisation to the 5 px grid, and a free-slot scan that counts
`kind: 'component'` tiles and reads the instrument column as full. Read them before authoring board
data — `verify_board_check` will tell you the board is broken, not which of these four did it.

---

## Evicted 2026-09-04b (a THEMES-rotation eviction — the #600/#601 trip-blocks bullet, out for #627's)

The oldest of five. **It meets the criterion in part**: the P-7 rows and the intermediate-range trip
are now pinned by `run_manual_setpoints` and the TRIP BLOCKS checks, so a regression reds a runner.
The second half — a shared boolean that two wirings satisfy identically — is the #295/#545 "plant
the demand PAST the half you are not testing" idiom, which the standing list already carries.

> **A `blockable` FLAG IS NOT EVIDENCE AN OPERATOR BLOCKS IT — AND A SHARED BOOLEAN CANNOT BE
> TESTED FOR WHICH CONSUMER IT BELONGS TO** (2026-09-01, #600/#601, from the owner's question about
> the dark TRIP BLOCKS rows). Two rows offered a P-7 block WTSM 12.2 calls *automatic*; #564 made
> them politely dark without asking what the source says the operator does. A third was dark because
> the 25 % intermediate-range TRIP did not exist — the retired plant wrote the ROD STOP's 20 % into
> the trip's row and `Manuals/09` shipped it. #572 then hung the C-1 stop on the power-range lever
> and **its check asserted that and passed**: with one lever, both wirings look identical.

**The half worth carrying, if you only read one line:** a flag that says a thing CAN be done is not
a source saying an operator DOES it — go and read what the source says the operator does.

---

## Evicted 2026-09-04 (a THEMES-rotation eviction — the #606 cache-key bullet, out on the workbench<-develop merge)

A rotation eviction, not a standing-list one: the merge brought the themes list to six (#625's
bullet from the workbench lane and #619/#621's from develop), and the oldest is this one. **It
meets the criterion** — the greyed-checklist case is pinned by the #606 browser check, so getting
it wrong again reds a runner.

> **A CACHE KEY THAT OMITS WHAT THE CACHE DESCRIBES READS AS A WORKING FEATURE — AND ITS
> CONTENT IS CORRECT, FOR A PLANT THE PLAYER HAS LEFT** (2026-09-02, #606). The Checklists tab
> greyed the Mode 5 heatup on a Mode 5 board. Ranker, CSS and gate sentences were all right;
> `cklMenuKey` was `engine | running checklist`, and neither changes on an initial-condition
> reset, so the Hot Full Power list survived **byte-identical**. No source read sees it, and no
> Node harness calling the ranker — the ranker is not where the bug is.

**The half worth carrying, if you only read one line:** when a memoized render is wrong, the
defect is in the KEY, and no read of the renderer will find it.

---

## Evicted 2026-09-02b (a THEMES-rotation eviction — the #244/#526 checklist-replay bullet, out for #608's)

Not a standing-list eviction: the standing list is at its 25-bullet cap and `CLAUDE.md` sits one
word inside its 15,000. **This one is a REPLACEMENT rather than a plain eviction** — #608's bullet
is about the same subject and corrects a limit in this one, so keeping both would have said the
replay is the authority twice and the exception once.

> **A CHECKLIST'S REPLAY IS THE AUTHORITY ON WHETHER IT FITS THE PLANT — AND A STEP WHOSE COMMAND
> NEEDS A MID-STEP STATE CANNOT BE ONE STEP** (2026-08-31, #244/#526). Aliasing the retired pool
> onto pwr2 was refuted by riding it: the 912-currency rod bursts overrun the 200-step bank, four
> commands are REFUSED, and the cooldown's dialed depressurization parks at the Pressure SP's
> 1700 psig floor. The harness issues a step's command at step START, so the accumulator-window and
> align-under-spray steps split into ride-then-act pairs — also the honest operator order (shutting
> spray first bounces pressure back over the RHR permissive).

**Both halves survive.** The ride-then-act idiom is now built into the shipped pool and gated by
`run_checklist_pwr2`, which replays all six chain checklists end to end — get it wrong and a runner
reds, which is the eviction criterion exactly. The "replay is the authority" half is carried
forward in the #608 bullet **with its limit attached**: it is the authority on whether a checklist
FITS the plant, and it is structurally blind to whether a step's tick is safe permission for the
next step, because a `hold:` long enough to be realistic always masks the acceptance underneath it.

**The half worth carrying, if you only read one line:** a harness that issues each step's command
at step START can only ever test the commands, never the gaps between them — and the gaps are where
a human operator actually lives.

---

## Evicted 2026-09-02 (a THEMES-rotation eviction — the #596 flicker bullet, out for #606's)

Not a standing-list eviction, and for the same reason as the two entries below: the standing list
is at its **25-bullet cap** and `CLAUDE.md` sits within a handful of words of its 15,000, so
rescuing a line out of this would have cost a slot doing more work. The mechanism is FIXED and
gated in the rendering path itself, the open follow-up is tracked on **#596**, and the full
measurement — the A/B that put animations at 6x of raster — is in `Diagnostic/TUNING_LOG.md`
2026-08-31.

> **A RENDER-BOUND FLICKER IS MEASURED IN THE BROWSER'S PIPELINE, NOT OUR JS — AND PER-ELEMENT
> THROTTLING OF ANIMATIONS CUTS NOTHING** (2026-08-31, #596, the in-sim report: 4.7 fps). Two
> 60 Hz wastes behind a 10 Hz display: the chart rebuilt an IDENTICAL SVG every paint, and ~100
> dash strokes each ran their own CSS animation (`stroke-dashoffset` never composites; A/B
> measured, animations were 6x of raster). Per-element `steps()` still commits at 60 Hz; **only a
> SHARED clock (std_pipe.js, ~12 Hz batch) aligns the writes**. Follow-up in #596; a Paint event's
> clip rect is the LAYER, not damage.

**The half worth carrying, if you only read one line:** you cannot throttle a compositing problem
per element — the browser commits on ITS clock, so the only lever is one shared clock that batches
every write. And profile the browser's pipeline, not our JavaScript: our JS was never the cost.

---

## Evicted 2026-08-31 (a THEMES-rotation eviction — the #516 Group A bullet, out for #591's)

Not a standing-list eviction, and for the same reason as the 2026-08-24 entry below: the standing
list was already **at its 25-bullet cap** and `CLAUDE.md` was sitting on **exactly** its 15,000
words, so rescuing a line out of this would have cost a slot that is doing more work. Both halves
of the bullet are carried elsewhere — the grep-every-surface half by the standing
`THREE RUNNERS now gate the manual's NUMBERS` bullet ("grep the manual for the subject of every
ruling and board change"), and the setpoint half by `Blueprint/PWR2_VALIDATION.md` §120, where the
measurement lives. The mechanism itself is FIXED (the level program carries a 25 s reference lag),
so it cannot recur in the place it was found.

> **NOISE ON A SETPOINT IS NOISE NO CONTROLLER CAN REJECT — and a RULING that corrects a number
> must be grepped for every SURFACE that states it** (2026-08-29, #516 Group A §120, the owner's
> own playtest, 11 items filed and never worked). The pressurizer level program read its Tavg
> channel RAW at **2.845 %/°C**: true Tavg spans 0.022 °C, indicated 0.63, program **1.77 %**,
> charging hunting 0→17 gpm — the PI ignores noise on the MEASUREMENT, and this arrived on the
> SETPOINT. And #579 derived charging at 30.1 gpm, fixed the MANUAL, and left the board bounded
> at the retired plant's 60 — exactly 2×, so half the box was one value.

**The half worth carrying, if you only read one line:** a proportional-integral controller's whole
justification for ignoring measurement noise says nothing about noise arriving on its REFERENCE.
When a program is a function of an instrument, ask what the instrument's noise does to the
program before you ask what the controller does with it.

---

## Evicted 2026-08-24 (a THEMES-rotation eviction — the #460 bullet, out for #509's)

Not a standing-list eviction: the themes list turned over and this bullet's rescued trap —
**a ruling's premise ages independently of the ruling, and nothing re-checks it** — is
already carried by the `question-owner-rulings` agent memory and Hard Rule 11's
date-plus-quote discipline, so it lands here whole rather than costing a standing-list slot.
If it bites again, that is the evidence to promote the one-liner into `CLAUDE.md`.

- **The rods ship in MANUAL, and every probe that broke was INHERITING the lineup instead of
  stating it** (2026-08-11, #460). `rods_tavg` loses `defaultOn`, reversing #289 — whose
  premise, *"everything else starts in auto"*, had expired when the Mode 1 lineup put generator
  load in MANUAL. Measured, the plant load-follows WITHOUT the rods (100 → 81.8 %, parked in
  3 min 30 s, monotone) where AUTO rings 62 → 88 % for ten minutes; 60 fine steps move Tavg
  −6.2 °F and generator load **0.8 points** — rods set temperature, the turbine sets power,
  and AUTO was performing that Tier A coupling on the player's behalf. All five reds had the
  rod controller as their SUBJECT, not the preset; `rodsAuto()` mirrors the `rodsManual()`
  helper #289 was forced to write in the other direction — **both directions of one defect,
  ten days apart.**

## Evicted 2026-08-22 (#507 waves 4–6 — one out for the #468 bullet's rescued trap)

Gate-covered in the direction that matters: HR1(b) — every permissive key declared — is what
`run_hardrules` enforces, which is exactly this bullet's own "hence" clause. The comment-rot
tail is real but unactionable as a standing warning; the sensing-bug core announces itself the
moment the scan runs.

- **A SENSING bug is invisible while the instrument is healthy** — to test an HR1 fix you have to
  FAIL the channel (#220). A trip's `condition:` key is a status word the ENGINE computes, so the
  `run_hardrules` scan cannot see it; hence HR1(b), every permissive key declared. **A comment
  carrying the real plant's premise rots when this plant departs from it.**

## Evicted 2026-08-17 (#472 — one out for the pressure-rail bullet's trap)

Board-specific and loud in the direction that matters: a unit read on the wrong side of the
identity shows on the board, and `test/run_manual_units.js` enforces US-first across the
board-facing copy while `verify_board_check.js` reads the tiles. The ACCESSOR half is the
subtler part and is the reason this is a criterion and not a rule — if a frozen `units()` ever
ships again, this belongs back in `CLAUDE.md`.

- **The board's FLOW family is the one where US is the base unit** — gpm is the identity side and
  m3/h the converted one, backwards from every other family. The units key is an ACCESSOR
  (`ctx.units()`); a frozen value pins the board in whichever mode it mounted in.

---

## Evicted 2026-08-11 (#460 — one out for the hydrogen bullet's rescued trap)

Plant-specific and loud: calling the wrong one produces a level that is tens of percent wrong
with the controller sitting exactly on setpoint, which the level probes redden on.

- **The pzr level PROGRAM and the level PHYSICS are two different lines** (#289): every consumer
  of "the program" must call `levelProgram`, not `levelBase` — the latter read −38.5 % with the
  controller exactly on setpoint. A program maximum is a limit, not part of the control law.

---

## Evicted 2026-08-10 (the first application of the cap: 30 → 25)

All five are PLANT-SPECIFIC and all five are pinned by a suite that reddens if the number moves.

- **A physically-derived constant can be RIGHT and unshippable, and a solve can conflate the
  MEASUREMENT's temperature with the PLANT's** (from the #419 themes bullet, 2026-08-08):
  K_phys ≈ 304 validates against TMI-2's own clock but inverts the stuck-PORV race under the
  ruled 347× F14 heater, so the shipped K = 2500 is the physical NET under F14 — one pair,
  re-solve together. And `rho_excess` quoted 975 ppm at "the anchor" was benign 5 °C away and
  wrong at 286. Ghost constants: check the CONSUMER first.

- **A new node's capacity must come OUT of the node it split from** (from the #418 themes
  bullet, 2026-08-08): C_tube added on top of coolant 20 silently reopened the RULED heatup
  pace — the chain caught it at 260.7 °C. Splitting a lump conserves its total.

- **A component can sit on a TWO-CLOCK seam** (from the #408 themes bullet, 2026-08-08): the
  relief valve's mass flow runs the real accident clock while its pressure authority keeps the
  transient duty — re-clocking either side alone breaks the other, so preserve the product (the
  F15 K re-solves, twice now). And the terminal melt verdict asks whether the water is COMING
  BACK — a reflooded TMI-style core rewets.

- **A closed-form limit line must be SCALED, never RE-ANCHORED** (#311). Pairing this plant's own
  DNB slope with a fitted intercept ROTATES the line and scrammed the plant at 55.0 s, killing
  the ride-out the 40 % dump exists to teach. Scaling by a margin factor puts the equivalent
  gradients inside the published real bands — the unscaled ones were 1.5–2× steeper than any
  real value, and **that steepness was the tell, visible before the measurement**.

- **Containment's flash gate decides what it sees** (#386, 2026-08-07): a stuck-open PORV
  pressurizes the building MORE than a 10 % break (relief is steam at weight 1.0; break liquid
  is flash-gated), and an SGTR reads NOTHING — it discharges into the SG, and since stage 3 that
  fence extends to hydrogen (geometry-gated transport). `press_gain` is fitted and says so.

## Evicted 2026-08-10b (the cap bound again at 26, adding #437/#439/#393's trap)

- **The two Hot Standby starting points are DIFFERENT PLANTS for a startup** (from the standing
  list, #303): `cold_shutdown` arrives at Mode 3 at **857 ppm**, `hot_zero_power` ships **683** —
  ~561 critical rod steps against 319, and the manual is written for the latter. Only
  `run_procedures_chain` crosses that seam, which is what makes this evictable under the
  criterion above: every number in it is pinned by a suite that reddens if it moves, and the
  seam has a named gate standing on it. **`boron_ppm` ending at 2500 is the fingerprint of an
  unintended ECCS injection.** The moderator model was re-done twice — a **1400 ppm crossover**
  or **−20 pcm/°C** in any document is stale (#260/#263).

  *If a startup goes wrong in a way this would have warned about, that is the evidence to put it
  back — say so in the session log rather than quietly re-adding it.*

## Evicted 2026-08-11 (the develop x backshop merge put both lists over their caps)

Two lanes each added a themes bullet the same night, so the rotation went to 6 against its 5,
and rescuing the evicted one's trap took the standing list to 26 against its 25. Both caps
bound at once; this is what came out.

- **New PWR instruments ship `noise: 0`, and that silently kills their `noisy` failure**
  (from the standing list): the instrument PRNG is one cross-step stream, so an appended
  instrument must declare `noise_failure` or the injected failure has nothing to scale.
  Evictable under the criterion above because **`test/run_m4.js` covers it** — an
  undeclared `noise_failure` shows up there as a `noisy` injection that changes nothing.

- **The bug report's RECORDING was the broken instrument** (the whole #432/#431 themes
  bullet, 2026-08-09). Sampling ran once per BROADCAST, so a 3600x LOCA was two rows under
  a manifest hardcoded to `sample_hz: 1`. Its trap — the fine drain sitting inside the rAF
  paint, one frame late, 1475 rows in and 35 recorded — is **rescued to the standing list**
  rather than retired, because no gate reaches it. The rest is `run_diag_bundle`'s subject
  and is pinned by its 31 checks.

## Evicted 2026-08-27 (the turbine cluster's themes bullet took the rotation over)

- **An acceptance WINDOW that ends before the failure begins is a green gate over a defect**
  (the #510 waves 1–10 themes bullet, 2026-08-23, on its rotation out). Every #510 high shipped
  under one: the Mode 4 "HOLDS" check sampled the first 6 % of a 75-minute monotone fill, and the
  ATWS check rode 10 s of a divergence that starts at ~110 s. The law it produced — settledness is
  equilibrium DERIVATIVES at the measured wander floor over a long ride's FINAL window, plus
  position against the boot point, never a sampled value inside a band fitted to the first minutes
  — is **evictable under the criterion above because `test/run_pwr2_endurance.js` IS that law**.
  The runner exists for nothing else, it rides past the horizons, and every known defect in it is
  a born-failing strict xfail, so a fix that lands without promoting its entry reds it.

  What the runner does NOT enforce, and what the bullet also said: **assert PRECONDITIONS, not
  just claims** — its own first run caught two of its own checks, one reading a field the contract
  does not publish (`undefined || 0` sailing over 26.6 MMBtu/hr) and one whose fixture was
  satisfied by the 17 % low-level cut rather than by the latch under test. That half is covered by
  the standing hollow-check bullet, which already carries the unpublished-field case.

## Evicted 2026-08-28 (a THEMES-rotation eviction — the #523 bullet, out for #545's)

Not a standing-list eviction, and for the same reason as the 2026-08-24 one above: the standing
list stood at its 25-bullet cap and `CLAUDE.md` at **68 words of headroom**, so rescuing this
trap into that list would have cost a second eviction and a net gain of nothing. It lands here
whole. **If it bites someone anyway, that is the evidence to put it back.**

- **A shared artifact keyed by the ENGINE goes silently EMPTY when the engine key changes, and
  the neighbouring lookup that got it right is no warning** (the #523 §94 themes bullet,
  2026-08-26, on its rotation out). Making PWR2 the plant the site runs broke two:
  `mdManual()` read `RD.MANUAL_MD[ui.engineKey]` with no `|| [ui.plant]`, so the **operator's
  manual rendered empty** — one of only TWO areas `site/flags.js` stages `public` — while
  `manualDoc()` fifty lines away had the fallback and had disagreed for days; and
  `afterPlantChange()` derived the engine key from `ui.plant`, which `uiPlantOf()` deliberately
  folds `pwr2` onto, so a PWR2 save installed the RETIRED engine's key and the next Reset would
  ask for a constructor a published build does not contain. Neither was reachable while PWR2 was
  a second card.

  The instruction it produced — **when a plant's key changes, grep every `[ui.engineKey]` in the
  tree, not the ones you remember** — is narrower than it looks now that the key change has
  happened and PWR2 *is* the plant. What generalizes is the shape, and that is the half worth
  carrying: **a lookup keyed by a value that can change goes silently empty rather than loudly
  wrong, and a correct neighbour doing the same lookup is not a warning — it is the thing that
  makes the wrong one look fine.**

## Evicted 2026-08-28 (a THEMES-rotation eviction — the #509 bullet, out for #571's)

Not a standing-list eviction; the standing list is at its 25-bullet cap and `CLAUDE.md` was
**11 words OVER** its own limit when the rotation was applied, so this lands here whole and the
incoming bullet was cut to fit rather than the number being raised. **Half of it was already
duplicated** in the file — see below, which is the honest reason this was the one to go rather
than the oldest by date.

- **An engine-owned latch the kernel cannot see makes every reset a permanent no-op — and the
  seal-ins it guards read as dead buttons** (the #509 §79 themes bullet, 2026-08-24, on its
  rotation out). PWR2's automatic trips never set the kernel's `rps.scrammed`, so `resetRps`
  returned null FOR EVER and ECCS/AFW/feed stops were ACCEPTED then re-asserted next step,
  silently — the #506 dead-button class one layer deeper. Same seam: the kernel judged a good
  reset against the facade's previous-step snapshot and told the operator "rods not inserted".

  **Its instruction — *an accepted-then-overwritten command must REFUSE at the layer that
  re-asserts it* — is NOT lost**: the #551/#559 bullet in the standing rotation carries it in
  its sharper form (*"an ACCEPTED command the next step overwrites is worse than a missing
  one"*), which is why this one could go while newer-by-date bullets stayed.

  What is genuinely this entry's own, and worth keeping findable: **the seam it names is the
  ENGINE/KERNEL one, and it has now produced three defects in five days** — #509 (the latch the
  kernel could not see), #545 (the facade reset with no rods-in guard, only the kernel
  permissive) and #571 (the kernel's own trip-signal permissive iterating a table this plant
  hands over empty). The shape they share: **the kernel's code is right for the architecture it
  was written for, and the DATA the seam hands across is empty or absent.** A grep for
  `config.trips`, `config.interlocks`, `config.actuations` and `config.runbacks` — all four
  emptied for PWR2 by `getProtectionConfig` — is the cheap way to find the rest.

## Evicted 2026-08-28b (a THEMES-rotation eviction — the #557 bullet, out for #572's)

Not a standing-list eviction; the standing list is at its 25-bullet cap. The incoming #572
bullet is an INSTANCE of this one — a board reading a constant that is right for a different
plant — so the lesson is not lost by the rotation, only its three worked measurements are, and
they are here.

- **A constant that is RIGHT for one plant is a second copy, and it goes wrong silently the
  day the plant changes** (2026-08-27, #557/#556/#561). Three board indications were still the
  retired engine's: the AFW gauge read **7.40×** the delivered flow, the pressurizer tile drew
  its scram edge at 100 % on a plant that trips at **87 %** and a second red band at 12 % for a
  trip it does not carry, and the DNB gauge went red **356 s** before the trip with 13.70 margin
  points standing. Fix: the plant publishes the number, the consumer reads it — an engine-key
  branch would have re-armed the same rot. Two of the three were invisible because the board is
  engine-agnostic by design and nothing cross-checked a RENDERED value against the plant.
**Standing procedure — not part of the rotation above; these do not expire.** One trap per entry.

  **Its instruction is carried forward by #572's bullet**, which is the fourth instance of the
  same shape: `_PROT` in `pwr_board_wiring` resolves at module load to the pwr protection table
  WHICHEVER plant is running, so the startup-rate readout drew the retired plant's 1.5 DPM
  rod-withdrawal band on a plant with no such interlock. Fixed the way this bullet prescribes —
  the plant publishes the number (the kernel's interlock state now carries each setpoint) and
  the consumer reads it, with no band at all where the plant has no interlock.

  **What is still open and is this entry's own**: `_PROT.trips` and `_PROT.alarms` have the same
  module-load shape and have NOT been audited. #572 fixed the one consumer that was measured
  wrong.

### Provenance matters more than it looks — evicted 2026-08-28

**Evicted under the 25-bullet cap** to make room for the bifurcation trap (#543 fallout), and it
is the right one to move because it is the rare standing bullet that **names its own gates**:
`test/run_hr3.js` guards Hard Rule 3, and `test/run_hardrules.js` guards Hard Rules 1, 5 and 11
— 400 checks as of this date. The criterion for eviction is "move what a GATE already catches",
and HR11's own form (a ruling needs a date and the owner's verbatim words) is exactly what
`run_hardrules` enforces.

The bullet, verbatim as it stood:

> **Provenance matters more than it looks.** Many "owner rulings" here were written by agents, and
> all agent work commits under the owner's name, so git blame proves nothing. A ruling without a
> date and a verbatim owner quote is advisory — `CONTEXT.md` §3. **`test/run_hr3.js` guards HR3;
> `test/run_hardrules.js` guards HR1, HR5 and HR11.**

**The half no gate covers, and why it is still worth reading**: the gate can check that a ruling
*carries* a date and a quote; it cannot check that the quote is the owner's. Agent-authored
"rulings" that were never said are invisible to it, and `git blame` cannot tell them apart
because every agent commit lands under the owner's name. When a decision looks load-bearing and
its provenance is a bare assertion, treat it as advisory and say so — that judgement is the
part that does not automate. See also the `agent-authored-rulings` memory.

---

## An approved plan's sizing target can be measured on a RETIRED scale

*Evicted from `CLAUDE.md`'s standing list 2026-08-28, at its 25-bullet cap, to make room for the
#572 ruling-vs-thing trap. It goes because another BINDING rule already carries its instruction:
`DESIGN_CRITERIA.md` Q0 — "what are the tested numbers?" — is described in `CLAUDE.md` itself as
"a GATE, not a vote: no measurement, no decision (HR12)", and re-deriving a sizing target from the
measurement rather than from the plan IS Q0. What follows is the worked case.*

#385 asked for a pressurizer flash term. The sizing target inside its approved plan had been
measured BEFORE the #408 slider re-map, on a scale that no longer existed by the time the plan was
executed. Re-measured against the current plant, the term came out unnecessary — so it was never
built, and the plan that approved it had been carrying a number nobody re-checked.

**The trap is that an APPROVED plan reads as settled.** A measurement inside it is a fact that has
been signed off, which is exactly the shape that stops getting re-run. Re-derive the sizing from a
fresh Q0 at the moment you build, not from the figure the plan carries — a plan is a claim like
any other and this repo moves faster than one ages well.

---

## A metal mass is half this plant's heat capacity, and the FILM decides whether it is felt

*Evicted from `CLAUDE.md`'s **Recent themes** rotation 2026-08-29, at its 5-bullet cap, to make
room for the #516 setpoint-noise trap. It goes rather than being rescued to the standing list
because a GATE now catches it — `run_pwr2_pressurizer` and `run_pwr2_engine` both assert the wall
term directly, and the dead-data half (a specified field with zero consumers) is already covered
by the standing bullet on proving coverage by injection. What follows is the worked case, kept
because the FILM half of it is a modelling lesson no gate states.*

#574 (`PWR2_VALIDATION.md` §109). PWR2 carried `wallLumps` on all eleven nodes with **zero
consumers** — specified, shipped, and inert. The ring's metal measures **43,484 kJ/K against
93,855 kJ/K of fluid**, and the VESSEL holds a quarter of it where the request had named the
tubes.

**Both defects the change introduced were in the wall FILM, not in the mass**, and both surfaced
through ONE red: with no phase term the wall absorbed **1,100 MJ** into a voided core, and the
repair for that then put the FORCED-convection vapour ratio on a FREE-convection floor, which left
an unmitigated break unable to reach the 10 CFR 50.46 clad limit at all.

**The trap: adding a correctly-sized thermal mass is the easy half.** How it couples — the film
coefficient, and which convection regime that film is in — decides whether the mass is felt at
all, and gets the sign of the error wrong in both directions if you guess. **Four of the five reds
that change produced were not about the change**, which is the other half of the lesson: adjudicate
a physics change's reds one at a time.

## Evicted 2026-09-05 (a THEMES-rotation eviction — the #605 "a click that misses a text field is a keyboard shortcut" bullet, out for #641's)

The oldest of five, and it **meets the criterion**: `verify_ckl_relevance` now clicks a number tile
OUTSIDE its input's frame and asserts the digits land in the box (#615), so a regression reds a
runner. The bullet, verbatim:

- **A CLICK THAT MISSES A TEXT FIELD IS NOT A NO-OP — IT IS A KEYBOARD SHORTCUT** (2026-09-02,
  #605). Both "can't type" blockers were this, and neither was the text box. The Pressure SP
  `<input>` is **30 x 17 px of an 85 px frame** (a `psi` span and the arrows fill the rest, inside
  the same border); a miss leaves focus on BODY and the global keys eat the digits — 2/3/5 are TIME
  ACCELERATION, so "2235" ended at 3600x. Feedback form: 32 chars typed, **0 in the box**, focus on
  `#playBtn`. **Make the whole affordance the target; the handler looks correct either way.**

## Evicted 2026-09-08 (a THEMES-rotation eviction at the workbench merge — the #625 pacing bullet, out for #633/#508's)

The oldest of six after the merge (develop had rotated in #653, workbench #633/#508, and the
list is capped at five), and it **meets the criterion**: the two things it warned about are both
gated now — `run_warp_tier` proves the 0.5 s WARP step stays inside instrument noise and that the
1.0 s step trips the quiet plant (claims 1 and 2), and its claim 4 proves the per-broadcast step
budget stops the loop and credits only what it stepped. What the bullet said, verbatim:

- **A SPEED BUTTON IS A REQUEST THE LOOP NEVER REFUSED — AND "THE SAME PHYSICS AT A COARSER STEP"
  WAS THE WHOLE SECOND MODEL** (2026-09-04, #625). There was no cap on steps per broadcast: 600×
  blocked the main thread **350 ms per 100 ms broadcast** (3600×: 2.5 s), the page froze, and the
  transient detector — scaled by WALL cadence — read a quiet plant at 600× as a standing transient.
  Measured before designing anything: PWR2 at a **0.5 s** step stays inside instrument noise over
  2 h in three regimes (~2,700×); at **1.0 s** the quiet plant trips itself. Kinetics is exact and
  the loop sub-steps, so the "simplified physics tier" needed no physics. `run_warp_tier`.

- **A FIGURE ARRIVED AT BY ARITHMETIC OVER TWO MEASUREMENTS IS NOT A MEASUREMENT** (2026-09-12,
  #713 changelog copy). The 1/M dock grew **58 %** in pass 1 and **a further 48 %** in pass 2, and
  compounding them into a tidy **~134 %** would have published a number nobody measured and no
  viewport reproduces: pass 1 was taken at 1600 px against the original box, pass 2 at 1500 px
  against a re-measured pass-1 rect — different baselines, different viewports, different rects.
  Two honest numbers with their own provenance beat one impressive number with none. **Same class
  as a `BASELINES` score derived by adding one side's delta to the other's map instead of reading
  the merged tree's own gate output** — which two lanes each hit once on the same day. Hard Rule 12
  says *step the plant and quote the number*; a number you computed from two other numbers has not
  been stepped. **If you cannot name the single run that produced a figure, do not publish it.**

- **READ THE RED, NOT THE COUNT — an injection that does not land is indistinguishable from a robust
  check.** Both print `0 failed`. FOUR TIMES IN ONE CYCLE (2026-09-12/13) an injection meant to prove
  a check reported zero reds because the INJECTION had missed: it patched a comment instead of the
  list it meant to edit; it named a source anchor a refactor had moved (`run_pwr2_board` said
  `ANCHOR MISS` and failed the gate, which is the only reason that one was visible); it settled a
  plant ABOVE the permissive so the block under test never took hold and 3,000 ticks of zero proved
  nothing; and it removed a WHOLE override when the defect it needed to simulate removes only part
  of one. **Always name which check went red and confirm it is the one you aimed at.** The
  neighbouring rule: an injection that removes more than a real edit would is not a proof — four
  injections that each deleted an entire CSS override left a gate green against the geometry-only
  deletion that a real future edit actually looks like.

- **A STRAY `}` IN CSS DELETES THE NEXT RULE, SILENTLY, AND NO GATE HERE SAW IT UNTIL #740.** Error
  recovery does not skip a top-level `}` — it opens a qualified rule whose prelude runs to the next
  `{`, swallowing the rule that follows. MEASURED: one extra brace in `pwr_board.css` removed
  `.bd-num-frame` (72 rules parsed instead of 73), eleven number-input tiles lost `display:flex` and
  their border, and the `<input>` rendered **169.6 px wide inside an 80.8 px frame**, painting over
  its neighbour. `verify_board_check`, `run_glow_stacking`, `run_style`, `run_hardrules` and the
  accessibility runner shipped in the same commit were ALL green. `test/verify_stylesheets.js` now
  compares each sheet's source top-level rule count against the CSSOM's. **The general lesson is
  bigger than CSS: that commit spent ninety lines on a cascade trap it had caught, and shipped a
  one-character error ten lines away. The lesson filed was "rules that must win go last"; the lesson
  available was "nobody parsed the file after editing it."**

- **A command-kind check-off is only satisfiable while the plant still lets the player produce the
  command** (evicted from CLAUDE.md's Recent themes 2026-09-25; #641, 2026-09-05). Six 1/M steps
  waited for `plot_1m_point` after the source range had secured and the tool refused the press — a
  soft lock. Steps now author `overtaken`. **Grep every `{cmd:…}` acceptance for the plant state
  that makes its control refuse.**

---

## Standing list, compressed 2026-10-18 — the worked detail behind each one-line bullet

Not an eviction: on 2026-10-18 `CLAUDE.md` was pruned from 14,998 words to under 5,000 and every
standing-procedure bullet was cut to one line. The text each line used to carry is here, verbatim
as it stood that day, in the same order as the list. The lines in `CLAUDE.md` are the rule; this is
the record of why. Also here: the two *Recent themes* bullets at their pre-prune length.

### Recent themes (pre-prune text)

- **AN ACCEPTANCE THRESHOLD AT THE CENTRE OF ITS OWN RENDER BAND IS A STEP THE BOARD CANNOT TELL
  THE PLAYER IS MET** (2026-09-18, #749). `fmtExp` is `toFixed(1)`, so `1.4e3` draws for
  [1350, 1450) while `> 1400` refused the whole lower half; REACTOR POWER's `digits: 1` did the
  same at 0.1 — **107.4 s of dark Continue beside a tile already reading the target**. Grade the
  band FLOOR, on the channel the tile DRAWS: the map's "PWR2 has no SR/IR channels" was stale, 88
  reused channels. **Measure the PLAYER's route — the same fix buys 1 s on the replay, 127 on
  theirs.**
- **A LATCHING FAILURE ARMED AFTER THE EVENT IT LATCHES ON IS A NO-OP THAT READS AS A WORKING
  INJECTION** (2026-09-09, #670 Phase 2): `stuck_porv_open` latches on the first lift; the lift is
  at 5.5 s and the reseat near 25 s, so armed at 0–20 s the accident follows, at 30–60 s the valve
  reseats at 1985 psia (13.69 MPa) and nothing happens. A step's `inject` must fire before the
  event its failure waits for — **measure the window.**

### Standing procedure (pre-prune text)

- **A check can pin a BIFURCATION, not a claim** (#543, 2026-08-28; #588, 2026-08-30). One bit
  picks the branch — green here, red on CI. **Assert the invariant the defect violated.**
  **It also reads as a one-platform defect** (#588: **+1 ulp reproduced the other platform's
  branch**, Math bit-identical). Move the FIXTURE off the cliff, not the budget; **sweep five ulps
  before trusting a blowdown check**. `playwright:v1.61.1-noble` reproduces CI's MATH, **not its
  FONTS** (no DejaVu): CI is `ubuntu:24.04` + `install-deps chromium`. **A geometry bound from a
  local render dates your FONT STACK** — 179.34 px on Windows is **206.38** there, eating a
  14.5 px margin (2026-09-12, #713).
- **A pre-declared reject criterion can outlive its measurement** (rescued from the #394
  limit-cycle bullet on eviction, 2026-08-10): #378's was void the next day. Re-measure the
  criterion, not just the result, before you let it reject anything. **So does a FIXTURE BUILT AT
  AN ENVELOPE WALL** (#524, rescued 2026-09-02): `P_MIN = 0.1` was `PLow=0.1` in a NIST fetch URL.
  Move the wall and every probe standing on it reddens — adjudicate per-probe, refit inside it.
- **A bracketed TEMPLATE placeholder cites like a number** (rescued from the #380 bullet on
  eviction, 2026-08-09): NUREG-1431's "~30–32 %" SG lo-lo survived two evidence passes because
  both verdicted the mechanism and inherited the figure. Ginna, the anchor plant, says 17 %.
- **A ruling names the WORK, not the THING — read it as "build it, having found out what it is"**
  (rescued from the #572 bullet on eviction, 2026-08-28): "build the 1.5 DPM startup-rate rod block"
  named a stop that exists in no source, and `Manuals/09` was CITING the document that lists the four
  real ones beside the row contradicting it. A citation can sit three lines from what it refutes.
- **Before you declare anything UNSOURCED, run `node tools/find_source.js <regex>`.** The corpus is
  three lanes' `inbox/sources` and they cannot see each other, so a one-lane grep has now shipped
  two wrong claims — #315 §6 (an OTΔT argument built and reverted while the primary sat in another
  lane) and `DESIGN_COMPANION` §8.34, which declared *"no document in any lane's corpus"* two days
  after the refuting document landed in develop's. It exits **1** on a genuine zero, so "not in the
  corpus" is a command's verdict rather than your claim.
- **A claim about COVERAGE OR ABOUT WHAT IS BUILT is an unmeasured claim — prove it by injection**
  *(my call, 2026-07-31; broadened from tests to the PLANT 2026-08-27, #570)*. HR12 binds
  plant-dynamics claims; the class that keeps going wrong is the neighbouring one — *"X is
  untested"*, *"the gate covers Y"*, **and *"X is not built"***. **To prove something is untested or
  unbuilt, BREAK IT AND SEE WHAT NOTICES.** That is how #286 found five inert automation channels
  behind a green 24/24 — and skipping it is how #562 reported a protection half as newly built when
  the engine had carried it all along (deleting the one line it "lacked" would have changed nothing;
  deleting the FWI line's `tb.tripped` changes everything). **Inherited claims are the risky ones,
  and A MODULE HEADER IS ONE**: a sentence from a review, an issue, a file header or this file has
  usually aged, and repeating it in your own voice launders it into a fresh assertion. **AND THE
  SPECIFICATION CAN BE THE STALE SECOND COPY** (rescued from the #562 themes bullet on eviction,
  2026-08-28): `CONTEXT.md` defined AFW flow as *"capacity × throttle × level hold"* and the manual
  documented the throttle box while PWR2 had none of the three — a spec is what you check code
  against, so nothing could catch it. Same shape as a ruling that was executed on the RETIRED
  engine and never reached the shipped one (#573). **Grep for the EFFECT, never the name you
  expected it to have.**
- **Verify a claim before you act on it.** Roughly half the issues touched on 2026-07-27 were stale
  or mis-framed. An issue's own investigation comment is a claim like any other, and this repo
  merges faster than one ages well (#326 — both comments were correct when written and wrong hours
  later). Re-measure on the tree you are standing in, including your own lane's. **A filed root
  cause repeated in four documents was still never re-measured** (rescued from the #403/#433
  bullet on eviction, 2026-08-12): "MSLI flow reads 0" came from watching the turbine-only
  variable, and repetition is not corroboration — neither is a sourced number being the WHOLE
  source ("600 psig" was adopted and "(Rate sensitive)" dropped from the same cell).
- **Declare a simplification only after you have MEASURED the regime it lives in** (rescued from
  the #347 themes bullet on eviction, 2026-08-07). "Optimistic" and "defeats the relief ladder"
  look identical from outside: spray-at-solid was declared harmless and held pressure 164 psi
  under the code safeties on the one path #346 never exercised. Corollary from the same change —
  the TMI-2 securing beat sits BEFORE the decision, on its historical cue, and the decision is
  RESTORE injection or not; re-litigating that order re-breaks nine missions.
- **A passing check can be HOLLOW — the failure modes seen here.** A `range()` call on a BOOLEAN
  returns NaN, so `!range(x).max` is `!NaN`, true always (TR-17, shipped #392, could never fail). A
  check asserting an ABSENCE can be pinning a NON-EVENT (`run_reachability` exists for the
  instrument half). `h.range()` spans the WHOLE run, the wrong window for a loss on an event that
  recovers — take the ends and assert the SPAN. A gate that iterates a hand-maintained MAP tests
  the map (`verify_manual_follow` covered 17 of 45 steps at a confident PASS). **ASK WHAT A GATE
  READS, not only what it asserts** — `run_manual_setpoints` scored 9/9 over a chapter-09 §3.0 it
  never opened (#532), and marked a row `narrative` *because the plant lacked the constant*, which
  is how a rod stop's setpoint lived in a trip's row (#601). A SOURCE SCAN for a
  rendered string cannot tell you the string is REACHABLE — `/\(partial\)/` passed green on
  `(false ? ' (partial)' : '')` (#485); make it a function and test the claim, don't spell it. And
  a term that is an IDENTITY in the regime you test in is a term nothing tests — 44 green probes
  agreed with a leg-split formula that computed 0.0 °F on a scrammed core. **A check can SAMPLE THE
  DEFECT and call it the claim**: "flow RAMPS, it does not step" took both samples BELOW the
  setpoint, where the mis-anchored ramp lived — certifying a 60 %-of-rated step for as long as it
  existed (#542). **A DEGENERATE LATCH reads exactly like a working feature** (rescued from the
  #403/#433 bullet on eviction, 2026-08-12): a no-dt harness left `held_within_s` permanently
  satisfied (age `0 <= 60` for ever) and three green probes certified an isolation that never once
  fired. **And the OBSERVER is where the defect can be, invisible to any source read** (rescued
  from the #436 bullet on eviction, 2026-08-26): a paired list comparing FORMATTED strings lit five
  rows on a healthy plant (`-0.0` vs `0.0`), a recorder emitted 46 `alarm_clear` events at t=0, and
  a lane-height check measuring `plot ÷ lanes` certified 56 px while 38 px was drawn.
  **`isFinite(null)` is TRUE and `Number.isFinite` is used NOWHERE in this tree** — a JSON round
  trip writes NaN out as null, so a dead channel comes back a plausible ZERO that every guard in
  `engines/` accepts (#555; fix at the save boundary, not by sweeping ~20 guards). **A row's gate
  must assert the EFFECT — flow, area, the landed value — never the WRITE**, or a DARK WIRE (a
  driver documented, read, and never passed; a field read off a channel nothing publishes) reads as
  a working feature: #507 wave 6 shipped three that way, #540 shipped a fourth for six days.
  **And a MUTATION goes blind when the defect it needs is FIXED, or when a refactor moves the line
  its anchor names** (rescued from the #501–#504 bullet on eviction, 2026-08-27): settling the
  startup ring sent three caught mutations blind; rewriting four protection gates orphaned four
  anchors — and a NEIGHBOUR's fix blinds too: #544's air term fixed the initial condition that was
  exposing the unbounded-bisection mutation (2026-08-28). Fix a defect, then re-run the
  INJECTIONS — the whole file's, not just yours.
- **A tolerance band is a claim that what it excludes is harmless — measure that** (rescued
  from the #348 themes bullet on eviction, 2026-08-07). CA-10's 1-point "coupling lag" band
  hid an interlock with no reset differential chattering at 35 % duty. **And CHECK THE BAND'S
  PROVENANCE before you retune what sits inside it** (#598, rescued 2026-09-03): AUTO charging
  held its program to 0.11 % while the tile's hard-coded 40–70 % painted an on-program Mode 5
  level 15 points below normal.
- **Adjudicate a physics change's red probes ONE AT A TIME** (rescued from the #364/#365
  themes bullet on eviction, 2026-08-08). Batch-judging 11 reds as "the retune moved things"
  would have hidden two real defects — each red is the fix working, a stale fixture, or a new
  defect, and only per-probe adjudication (HR10) tells which.
- **Know which LAYER owns the effect you are asserting** (the table now lives in the
  `gate-layers` skill). A multi-part fix whose parts are each sufficient makes a one-sided
  injection lie — revert BOTH to reproduce (#295; #545 shipped it again with a level hold AND a
  door that refuses by name, and `run_pwr2_engine` came back 59/60 — **plant the demand PAST the
  half you are not testing**). Neutering an automation channel: blank the ENGAGE direction ONLY,
  or the plant sits in the IC's own AUTO and the probe passes against a dead channel (#286).
- **A de-energization written into the operator's DEMAND heals itself on the next button press.**
  Take away the delivered power/flow/head; leave the selector and the latched demand where the
  operator put them (#200, #329, #332). The `afw_pump_running` vs `afw_flow_normalized` split is
  the house idiom. Relatedly `true_state.ac_available` is the question every motor load must ask —
  today exactly `!station_blackout`, and the point is that the question has a NAME; a plain LOOP
  KEEPS it, and **AFW carries a do-not-gate note** (WTSM 5.7.5).
- **`power_pct` is FISSION power, not core thermal power** — total is `true_state.core_heat_pct`.
  Equal by construction at steady power, which is why no gate caught it; seconds into a LOCA it is
  11.0 MWt against 21.0 MWt of decay heat. Anything reading `power_pct` as core heat is wrong from
  the moment the rods drop. **Decimals belong to the UNIT**: `toFixed(0)` on MPa printed three
  different pressures as "15 MPa" and collapsed the loop split that panel exists to show.
- **The pressurizer's level constants are ONE object** — `level_per_mass` (776), `level_per_void`
  (375.33), `level_per_tavg` (1.62); the pressure surge reads the same geometry (#337) and since
  #385 the NODE's credit does too (`level_per_mass_surplus` retired at #365). The TMI deception
  is a DIFFERENCE between two of them, so moving one inverts it. **Touch one, re-solve the set.**
  And a SINGLE TERM of a coupled pressure/inventory regime is worse than none — three independent
  measurements say so (#346, `Manuals/12` §12.4c, the #384 attempt).
- **Measure a limit's INCIDENCE before trusting a green suite about it** (#362, rescued
  2026-08-08): the `levelBase` clip bound on 95.7 % of loss-of-heat-sink samples, 0.0 % of every
  other IC — removing it reddened nothing because no probe stood where it bound. Corollary:
  **this plant goes solid at an inventory DEFICIT** (thermal expansion), not overfilled.
- **Natural circulation: the SHAPE is sourced (W ∝ Q^⅓), the SCALE is this plant's** and is fitted
  — do not quote our percentage as a real-plant figure (`Manuals/12` §12.4). The board's dash-speed
  ladder needs a step BELOW that flow or a blackout paints a STOPPED loop; #364 moved it under the
  floor once already.
- **Protection cadence is written down TWICE** — `PROTECTION_DT` 0.1 s and an independent copy in
  `test/ops_harness.js`. Move one and not the other and the ops suites certify a plant no player
  can produce. 1× is byte-identical by construction, which is why a divergence hides at the speed
  you are most likely to test at.
- **A sourced anchor can be the WRONG FORM of the measurement for your model** (rescued from the
  #386 hydrogen bullet on eviction, 2026-08-11): GEND-061's burn ΔP is real, and the adiabatic
  form vs the measured 27.5 psi form decides whether the drained family lands over or under the
  ruled 30 psig hi-hi. Having the document is not having the number.
- **"Block SI" is THREE actions on a cooldown** and the procedure named one: `lo_press` and
  `si_trip` both watch pressure downward and neither auto-blocks on the way down; both need P-11,
  so the Pressure SP comes down first. **The live checklist NEVER issues the step's `cmd`** — it
  draws text, grades off `acc`, `cmd`/`hold`/`ramp` stay replay-side (it DOES fire
  `inject_failure`/`clear_failure` behind the scenes since #670 — #694). **Only a rate
  guard can tell a ramp from a staircase.**
- **A red probe can be the REFERENCE moving, not the plant — adjudicate at BOTH values** (#508,
  2026-09-06). Three of six pre-adjudicated probes had their filed reading inverted: a dump check
  read 18.5 °F against an 18.4 °F bound because **Tref fell 4.0 °F while Tavg fell 1.14 °F** — the
  better-controlled plant read as the regression. **Run the fixture at the old constant AND the new
  one and ask which quantity moved.** And a fix that reddens something DISTANT may have been
  **cancelling against it**: a 4.9 % ΔT head start and an equal, opposite K3 credit read as a
  healthy plant for three weeks (#647/#650). Ask *"what was this cancelling?"* before writing the
  red off as stale. **And a fixture pinned at an ARBITRARY state can be right only because the
  model IGNORES that state** (rescued on eviction, 2026-09-09): 56 relief checks green over a FLAT
  mass flow, ten sampled at 6.0 MPa (#633).
- **An unmeasured claim in PLAYER-FACING COPY is still an unmeasured claim** (rescued from the
  Indications-tab bullet on eviction, 2026-08-17): a "pressurizer mass-only level" row promised
  a TMI divergence that measures 0.0 everywhere, because `pzr_level_pct` is `clip(that,0,100)`
  of the very same number. HR12 does not stop at engine prose.
- **THREE runners now gate the manual's NUMBERS against the engine, and NOTHING gates its PROSE**
  (rewritten 2026-08-30, #532; was "nothing gates manual prose", #468 via 2026-08-22).
  `run_manual_setpoints` checks chapter 09's three tables and BOOTS all four initial conditions;
  `run_manual_commands` checks §18 and the ESF arm payload. **A setpoint, action or IC that drifts
  now reddens a gate — a described BEHAVIOUR or a procedure's reasoning still does not**, and #532
  found six sites teaching an ESF arm that never existed. **Grep the manual for the subject of every
  ruling and board change**, and add the map entry when you add a row: coverage is asserted.
- **A subscriber that reads inside the rAF paint is ONE FRAME LATE, and only a browser
  can see it** (rescued from the #432 themes bullet on eviction, 2026-08-11): the
  recorder's drain sat in the paint and logged **1475 rows in, 35 recorded** — call sites
  all correct to a source scan, and green to a Node gate that hands it the rows itself.
  `drainFine()` is the single `takeFine()` caller and is called synchronously from
  `render()`; keep it there.
- **On a board issue, read `git log develop`, not just the lane TAGS.** A tag says someone is
  THERE; the log says what they have already DONE. Four #357 items were worked against a
  convention #350 had already inverted.
