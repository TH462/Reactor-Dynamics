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
