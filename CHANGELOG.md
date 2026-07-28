# Changelog

All notable, user-visible changes to Reactor Dynamics are logged here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/); newest entries on top.

For the dense engineering rationale behind each change (spec deviations, tuning, gate
tallies) see `Blueprint/BUILD_DECISIONS.md` — this file is the skimmable summary.

> **Releasing:** at each `develop` → `main` merge, rename the `## [Unreleased]` heading
> below to the version being shipped (`## [Alpha X.Y.Z] — YYYY-MM-DD`) and open a fresh
> empty `## [Unreleased]` above it. The version must match the top entry of
> `changelog.html` and the string in `site/release.js`.

## [Unreleased]

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
