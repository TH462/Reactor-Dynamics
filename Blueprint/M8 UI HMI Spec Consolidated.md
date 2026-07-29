# UI / HMI Spec — Reactor⚛️Dynamics (Consolidated)

**Status**: Draft — June 27, 2026
**Version**: 3.0
**Supersedes**: `08_UI_HMI_Spec.md` (v2.3) and the layout section (§3) of `M8_user_interface.md`.
**Incorporates**: `M8_failures_tab_spec.md` (the Failures-tab addendum, still authoritative for the
`severity_meta` schema).
**Reads from**: `CONTEXT.md` (the snapshot/command contract §6, the hard rules §3, the two registers,
the units conventions §11). Those are **not re-derived here** — this document relies on them.

This is the single, current UI specification. Where prior documents disagreed, this file is the
resolution. The §20 changelog lists exactly what was retired and why.

---

## 1. Core Interaction Philosophy

**The user operates the plant through its instruments (HR1).** Gauges, readouts, the alarm panel,
and every value on screen show **instrument readings** — with their lag, noise, and capacity to fail
and mislead — never the true physical state. The truth is available only as an explicit, off-by-default
diagnostic overlay (§12). Softening this — showing truth by default, or adding any tell that
distinguishes a stuck gauge from a healthy one — dissolves the lessons the simulator exists to teach
(at Three Mile Island a valve indicator read "closed" while the valve was stuck open). Build an
interface that can genuinely mislead an attentive operator.

**The user acts through commands (HR5).** Every control issues a command to the Simulation Service
(M5), which routes it down the stack. A control never changes the plant directly — it issues the
command and waits for the next snapshot to reflect the result. This is why a stuck valve can visibly
refuse a close command, and why a gated scenario can hold the user at a teaching moment.

**Learner-first labelling.** The interface is usable by someone with no nuclear background. The house
style is **spelled-out term with the acronym in parentheses** — "Pressurizer (PZR)", "Steam Generator
(SG)", "Emergency Core Cooling (ECCS)" — so users learn the full concept and the shorthand at once.
This is the **Learning register, made the default**. An **Industry register** (acronym-only) is
available in Settings for users who are already fluent. See §13.

**Single defining test (restated, because it governs everything):** the gauges read instruments; the
alarms read instruments; both can be misled by a failed sensor exactly as a real operator would be. The
interface offers truth only as a deliberate overlay. Get this right and the accidents teach what they
must.

---

## 2. Layout

A **fixed plant-control area** (anchored top-left, fixed aspect ratio, never scales or squishes) and a
**responsive right column** (always full window height). The plant-control area sets the minimum usable
window size; everything else fills around it.

```
┌────────────────── PLANT CONTROL AREA (fixed aspect ratio) ──────────────────┐┌─ RIGHT COLUMN ─────┐
│ ┌Power┐┌Grid ┐┌Press┐┌Tavg ┐┌ PZR ┐┌ SG  ┐┌Subcl┐  ← VITAL-FEW GAUGE STRIP   ││ R⚛️D     T+00:12:34 │
│ │84.2%││99.1%││2100 ││583°F││ 65% ││ 25% ││18°F │     (acronyms OK here)     ││ [▶/⏸] 1x 10x 60x    │
│ └─────┘└─────┘└ psi ┘└─────┘└─────┘└─────┘└─────┘                  💾 Save    ││        600x 3600x    │
├──────────────┬───────────────┬───────────────┬─────────────────────────────┤├─────────────────────┤
│ REACTOR CORE │ PRIMARY       │ STEAM          │ TURBINE & GRID              ││ INSTRUCTOR          │
│              │ INVENTORY     │ GENERATORS     │                             ││ (always shown)      │
│  CONTROL SECTIONS (always visible — not tabs, not collapsible)              ││ ┌─────────────────┐ │
│                                                                             ││ │ persona·message │ │
├──────────────┴───────────────┴───────────────┴─────────────────────────────┤│ │ [Acknowledge]   │ │
│                                                                             ││ └─────────────────┘ │
│                       SYNOPTIC DIAGRAM                                       │├─────────────────────┤
│        animated SVG — v1 NUMERIC PLACEHOLDER until SVG ships                 ││ TOOLS BLOCK         │
│        Teaching / Realistic mode · true-state overlay toggle                ││ Failures│Automate    │
│        rod visualization = 2 bars (control + shutdown)                      ││ Graph│Sim│Settings│Dev│
│                                                                             ││ ┌─────────────────┐ │
│                                                                             ││ │ active tab      │ │
│                                                                             ││ └─────────────────┘ │
├──────────────────────────────────────────────┬──────────────────────────────┤├─────────────────────┤
│   STRIP CHART (single, wide)                  │  ALARM PANEL                 ││ SYSTEM SCANNER      │
│   multi-parameter trend · scrubber · replay   │  normally blank; active      ││ hover any element…  │
│   legend is the only label                    │  alarms stack vertically,    ││ (short, ≈3–4 lines) │
│                                               │  color-coded by system       │└─────────────────────┘
└──────────────────────────────────────────────┴──────────────────────────────┘
```

*(as built)* For the **PWR** the gauge strip remains, but the four control sections, the status bar,
and the 4-view switcher are replaced by the single full-plant synoptic (`ui/diagram/pwr_synoptic.js`)
whose margin cards and embedded panels are the sole control surface — see §5 and
`new_diagram_controls.md`. RBMK/BWR retain the layout above. The Tools tab set as built is
**Failures · Automate · Graph · Sim · Settings · Dev** (§10); the Training tab is retired in favor of
the Plant & Mission window (§10.7).

### 2.1 Region inventory

| Region | Location | Scaling |
|--------|----------|---------|
| Vital-few gauge strip | Top of plant-control area | Fixed with control area |
| Sim controls (logo, clock, play/pause, speed, save) | Top of right column | Fixed height, anchored top-right |
| Four control sections | Below gauge strip | Fixed with control area |
| Synoptic diagram | Center, below control sections | Fixed aspect ratio |
| Strip chart | Bottom-left of control area | Stretches vertically; width = control area minus alarm panel |
| Alarm panel | Bottom-right of control area | Fixed width (~⅓ control area); stretches vertically |
| Instructor panel | Upper right column | Grows vertically |
| Tools Block | Mid right column | Grows vertically |
| System Scanner | Lower right column, under Tools Block | Short, fixed height (≈3–4 text lines) |

### 2.2 Scaling behavior

- **Plant-control area** (gauge strip + control sections + synoptic diagram): fixed aspect ratio,
  anchored top-left, never scales or squishes. Sets minimum usable window size.
- **Right column** (sim controls + Instructor + Tools Block + Scanner): stretches vertically and
  horizontally as the window grows; always full height. The Instructor takes the upper portion, the
  Tools Block the middle, the Scanner a short fixed band at the bottom. Instructor and Tools Block share
  extra height; the Scanner does not grow.
- **Strip chart + alarm panel** fill the area below the synoptic diagram. The alarm panel holds its
  fixed width; the strip chart takes the rest. Both stretch vertically.
- **Window smaller than the plant-control area:** scroll or zoom-to-fit — the control area never
  squishes. Desktop is the v1 target; mobile is not.

---

## 3. Sim Controls (top of right column)

Visually continuous with the gauge strip (same height band), slightly lighter background.

- **R⚛️D logo** — top-right corner, consistent branding.
- **Simulated-time clock** — `T+ HH:MM:SS` of `metadata.sim_time` (simulated, not wall, time). Subtle
  pulse when running; static when paused; amber tint when time-accelerated.
- **Play / Pause** — a **dedicated button, separate from the speed selector** (so "paused" is never a
  speed step). Large enough to hit quickly under stress. Issues `play` / `pause`.
- **Speed selector** — discrete steps **1× · 10× · 60× · 600× · 3600×**. Issues `set_speed { value }`.
  **The user sets speed manually; there is no automatic transient-detect fast-forward dropout** (see
  §20). *(as built)* One qualification: the **Instructor** can drive time acceleration — a scenario
  beat's `speed` field fast-forwards in and drops back out at a set point; the speed segment and the
  ⚡ FF badge track whatever `metadata.time_acceleration` reports (`syncSpeedUI`, `ui/app.js`).
  High-speed animation behavior is in §6.6.
- **Save** — quick `save_state` (downloads JSON). The full state operations (Load, Reset) live in the
  SIM tab (§10).
- **Operator's Manual (📖)** *(as built)* — top-bar button opening a full-screen reference overlay for
  the active plant: ten sections (Overview, Procedures, Accidents, Alarm Response, Controls,
  Indications, Setpoints & Limits, Normal Values, Failures, Glossary), register- and unit-aware,
  rendered from `RD.MANUAL` / `RD.MANUAL_PROCEDURES` (`ui/app.js` `openManual`; keyboard shortcut `M`).
- **Help (?)** *(as built)* — top-bar button toggling a one-screen guide to the board (quiet-board
  colors, why instruments can lie, where the missions live, keyboard shortcuts).
- **Mission status line** *(as built)* — an always-visible "what's running now" strip under the sim
  controls (`#simStatus`: plant · mode); clicking it opens the Plant & Mission window (§10.7).

---

## 4. Vital-Few Gauge Strip (top of plant-control area)

A horizontal row of the handful of headline gauges, embedded across the top of the control area, above
the four control sections. **Acronyms are acceptable here** — the strip is space-constrained, so gauges
use the short authentic label (e.g. "Tavg", "PZR Level", "Subcool"); the full "term (ACRONYM)" form is
available on hover and the Scanner (§11) carries a plain-language description for the unfamiliar.

Each gauge shows: current value + units, zone bands (normal / caution / danger), a trip marker, and a
trend indicator (rising/falling/steady with a short sparkline). Details in §16. Gauges read
`snapshot.instruments` (HR1) — a stuck gauge shows the stuck value, not visually distinguished from a
healthy one.

**Plant-specific vital few** (the strip reconfigures on plant change):

- **PWR:** Reactor Power · Grid Match · Primary Pressure · Tavg · Pressurizer (PZR) Level · Steam
  Generator (SG) Level · Subcooling Margin.
- **RBMK:** Reactor Power · Steam Pressure · Drum Level · Void Fraction · Operational Reactivity Margin
  (ORM).
- **BWR:** Reactor Power · Vessel Pressure · Vessel Level · Core Void · Recirculation Flow.

Reactor Power and Grid Match are the two most important operational metrics and lead the strip. Zone
bands and trip markers come from plant config (§16), never hard-coded.

---

## 5. Control Sections

Four horizontal sections spanning the width of the plant-control area, directly above the synoptic
diagram, organized left-to-right by plant energy flow. Always visible — not tabs, not collapsible. Each
control reflects `control_state` from the snapshot and issues commands from `CONTEXT.md §6.7`.

*(as built)* This four-section arrangement now applies only to the **RBMK and BWR** (legacy
status-bar + 4-view plant display). For the **PWR** the sole control surface is the synoptic
diagram's **margin cards and diagram-embedded panels**: `buildPlantDisplay` (`ui/app.js`) mounts
`RD.PwrSynoptic` and empties the status bar, view switcher, and control bar when `plant_id === 'pwr'`.
The card-by-card control inventory lives in `new_diagram_controls.md`; the individual controls
described below (SCRAM cover, rod drive, heaters/spray, ECCS, AFW, feed) survive on those cards with
the same commands. See also §5.6 for PWR controls added since that spec.

### 5.1 Reactor Core

- **REACTOR SCRAM** — the most prominent control, always reachable. Protected by a virtual safety cover:
  - **Covered (default):** muted red/gray diagonal hazard stripes, slightly raised 3D guard appearance,
    "REACTOR SCRAM" barely visible through the stripes, pointer cursor on hover.
  - **Click cover:** cover flips up, revealing the bright red (`#EF4444`) SCRAM button. A 3-second
    countdown shows as a depleting border/arc, with a subtle urgency pulse.
  - **Click SCRAM while exposed:** fires immediately — issues `scram`. Button becomes solid dim red,
    labeled "SCRAMMED", non-interactive until reset. Clearly distinct from the armed state.
  - **Timeout (3 s, no SCRAM):** cover animates closed; returns to default. The cover never auto-opens —
    always a deliberate two-step interaction.

- **Control Bank** — this version has **one control bank and one shutdown bank** (per `CONTEXT.md §5`,
  the PWR's deliberate simplification; no A/B/C/D banks, no overlap sequencing, no Bank Overlap Unit, no
  core map). The control bank is the operable rod group.
  - **Movement:** RAISE | STOP | LOWER (hold to move) → `rod_start` / `rod_stop`; single-step nudge
    buttons (+1 / −1) → `rod_nudge { steps }` for fine control.
  - **Speed:** Slow | Normal | Fast → carried in `rod_start { speed }` (snapshot `speed` field is
    `"slow" | "normal" | "fast"`).
  - **Position:** a filled bar with step count for the control bank, colored cyan (normal) → amber
    (approaching insertion limit) → red (at or below insertion limit). Reads
    `control_state.rod_groups[control].position_pct` / `.steps`.
  - **Insertion Limit indicator** — shows the control bank's insertion limit at the current power level,
    from `control_state.rod_groups[control].insertion_limit_steps`; flags
    `at_insertion_limit`. In Learning mode, phrased plainly (e.g. "Control bank minimum position at 100%
    power: 215 steps"). The insertion-limit alarm fires if the bank is driven below its limit.

- **Shutdown Bank** — **shown but read-only.** It moves only on scram. Display: green when fully
  withdrawn (912/912); shows it driving in when scrammed. Red if not fully withdrawn during power
  operation (an abnormal condition). Reads `control_state.rod_groups[shutdown]`.

- **Chemical Shim (Boron)** — BORATE | OFF | DILUTE three-way control with an AUTO toggle. Concentration
  readout in Parts Per Million (PPM). (Maps to the charging/boron path; see `CONTEXT.md §6.7`.)

### 5.2 Primary Inventory

- **Coolant Pumps** — START | STOP (per pump or as a group, per the plant's loop count). Reads
  `control_state.pumps[]`.
- **Emergency Core Cooling (ECCS)** — three-way AUTO | ON | OFF. The full emergency core cooling
  actuation. (PWR also has HPI within this path; `set_hpi`.)
- **Pressurizer (PZR) Heaters** — AUTO | ON | OFF three-way → `set_heater`.
- **Pressurizer (PZR) Spray Valve** — AUTO toggle + manual position slider/readout → `set_spray`.

### 5.3 Steam Generators

- **Feed Pumps** — START | STOP → `set_feedwater_flow`.
- **Auxiliary Feed Water (AFW)** — START | STOP → `set_afw`. Separate from main feed; available after
  loss of main feedwater.
- **Feed Reg Valve** — AUTO toggle + manual setpoint with a SET button; shows current position.

### 5.4 Turbine & Grid

- **Main Breaker** — CLOSED | OPEN. Grid connection; **confirmation required to open**.
- **Diesel Generators (EDG)** — STBY | RUN. Available during station blackout.
- **Turbine Load Target (MW)** — numeric setpoint with SET button; shows current target and actual
  output → `set_steam_demand` (PWR) / `set_turbine_load` (BWR).

**Two-press "CONFIRM?" arming** *(as built)* — destructive controls never use native browser
confirms. The first click arms the button: its label changes to **CONFIRM?** and it highlights; a
second click within 3 seconds fires the command, otherwise it disarms back to its normal label
(`armedConfirm`, `ui/app.js`). Applied to: breaker open, PWR MSIV close, PORV block-valve close
(isolate), BWR ADS, and SLC injection. The SCRAM buttons use the same two-press arm/fire pattern with
their own arming timers (§5.1; `pwr_synoptic.js` for the synoptic card).

### 5.5 Per-plant control variation

The four sections are the PWR arrangement. For other plants the section contents follow the plant's
systems (`CONTEXT.md §6.7`):

- **RBMK:** channel flow (`set_channel_flow`), EPS bypass (`set_eps_bypass`), AZ-5 manual scram
  (`manual_scram`), with the **ORM prominently visible** (central to safe operation).
- **BWR:** recirculation flow (`set_recirc_flow`), feedwater, turbine load (`set_turbine_load`),
  emergency systems RCIC (`set_rcic`) / ADS (`trigger_ads`) / LPCI (`start_lpci`).

**Emergency systems are visually set apart** from normal controls in every plant.

### 5.6 PWR synoptic controls added since the diagram spec *(as built)*

Controls on the PWR synoptic cards beyond the `new_diagram_controls.md` v1 inventory
(`ui/diagram/pwr_synoptic.js`):

- **NIS startup section** (Power & Reactivity card) — a collapsible "NIS · startup ranges" block that
  auto-opens on a startup lineup (SR detector energized) and stays put once the user toggles it:
  Source Range counts (`instruments.source_range`, cps, log detector) with an **SR On | Off**
  high-voltage switch (P-6 interlocked both ways), Intermediate Range chamber current
  (`instruments.intermediate_range`, A), and **startup-trip blocks** for the IR high-flux and
  power-range low-setpoint (25 %) trips (permitted above P-10, auto-reinstate below).
- **1/M startup plot** (`ui/panels/one_over_m.js`) — a **draggable window** opened from the NIS
  section: the operator's inverse-multiplication scratchpad. PLOT captures the source-range
  **instrument** count (HR1) at the current rod position; a least-squares line through C0/C
  extrapolates to the predicted critical rod position. Session tool only — not in save files; clears
  on plant change, reset, or rewind past the last point.
- **Rod AUTO/MAN** (Rod Control card) — AUTO engages the in-stack `rods_tavg` automation channel,
  capturing **T-ref** from the current indicated Tavg and driving the bank to hold it (variable speed
  on the mismatch); any manual rod motion drops it back to MAN. The captured T-ref is displayed on
  the card.
- **MSIV Open | Close** (Steam & Flow card) — `close_msiv` / open; Close carries the two-press
  CONFIRM? arm (§5.4). Status readout shows SHUT and whether the SG safeties are lifting.
- **Feed pump speed** (Steam & Flow card) — nudge ▼/▲ (`feed_pump_nudge { delta_pct }`) and a
  numeric set (`set_feed_pump_speed { pct }`), plus a commanded-speed readout and a **"who's
  driving"** line (three-element controller AUTO via the Automate tab, load coupling, or manual
  speed).
- **ESF AUTO/MAN arms** (Emergency Cooling card) — the HPI/LPI and AFW AUTO buttons issue
  `set_esf_auto { system: 'hpi'|'afw', auto: true }` to re-arm the automatic actuation after a manual
  override disarms it.

---

## 6. Synoptic Diagram

The central animated schematic. Fixed aspect ratio, anchored below the control sections, left-to-right
energy flow matching the control-section order.

### 6.1 Implementation requirements

- **SVG-based, component architecture** — each component is an SVG group with state-driven animation,
  not a static image.
- **All displayed values read `snapshot.instruments`** by default; true values only via the overlay
  (§12).
- **Hover** — populates the System Scanner (§11) with a plain-language description of the element (the
  Scanner is wayfinding text, not live data).
- **Click** — opens a localized control popover for that component and highlights related trends in the
  strip chart.
- **`data-highlight-id` on every component** matching instrument/component IDs from the plant profile —
  used by the Instructor highlight system (§9.2) and as the lookup key for the Scanner manifest.

### 6.2 The v1 numeric placeholder (build this now)

The diagram SVGs are authored separately and delivered later (PWR first). **Until the SVG arrives, the
center region is not an empty box — it is a complete numeric readout of the plant**, so the whole
simulator is testable without any diagram. It occupies the same fixed region the SVG will later replace.

- **Organized by plant area, mirroring the control sections** in the same order, so each control reads
  straight across to its numbers. PWR: *Reactor / Core · Primary & Pressurizer · Steam Generators ·
  Turbine & Condenser · Emergency & Inventory*. (RBMK and BWR per `M8_user_interface.md §7`.)
- **Shows everything** — the full instrument set plus the status/boolean readings for the active plant
  (e.g. `Reactor Coolant Pump (RCP): running`, `PORV: OPEN`, `HPI: active`, `Battery: 41% (3:12
  remaining)`). Each line is a labeled `name : value units`.
- **Reads instruments (HR1)** — a stuck/failed instrument shows its stuck value here exactly as on the
  gauges. The true-state overlay (§12) applies here too.
- **Honors the toggles** — register labels, units, and the fraction/normalized display rules
  (`CONTEXT.md §11`: void as %, flows as % of rated).
- **A stand-in, not a parallel feature** — clarity and completeness only, no styling effort. When the
  SVG + manifest land, the animation layer replaces only this region; gauge strip, controls, strip
  chart, and alarm panel are untouched.

### 6.3 Component animation (when the SVG ships)

The animation layer is written against a **component manifest** delivered with each SVG: element IDs,
what each represents, and which snapshot field drives it. The layer reads the snapshot and updates
component states, starts/stops flow animations, and scales animation speed to flow rate.

- **Reactor Core:** Cherenkov blue glow (`#00C4FF` base), intensity/radius scaling with
  `instruments.power_range`; very bright cyan-white (`#A5F3FC`) with a ~0.5 Hz pulse above 110%; fades
  slowly to `#0E7490` on shutdown (decay heat, never instant). **Rod visualization: two physical bars —
  control and shutdown** — heights from `control_state.rod_groups`; dark metallic `#4B5563`, yellow tips
  `#FBBF24` when moving.
- **Pressurizer:** liquid/steam separation (lower fill from `instruments.pzr_level`); heater coils glow
  when `heater_power_pct > 0`; spray mist when `spray_valve_pct > 0`; PORV green (closed) / red (open
  with flow arrow), reading `instruments.porv_indicator` — **in overlay mode, true position shown if
  divergent** (the TMI tell must remain hidden in normal mode).
- **Steam Generator:** primary tube gradient hot→cold; secondary bubble formation scaling with heat
  transfer; steam speed from `instruments.steam_flow`; level from `instruments.sg_level`.
- **Pumps:** spinning impeller scaling with `true_state.pump_flow_pct`; green running / red tripped /
  flashing coasting; downstream flow halts on trip.
- **Pipes / flow:** hot leg `#C2410F→#F97316`, cold leg `#1E40AF`, steam `#E0E7FF` animated; flow halts
  and color mutes on pump trip or valve close.
- **Turbine / generator:** spin scaling with `true_state.mwe_output / rated`; output from
  `instruments.mwe_output`; governor position; condenser vacuum readout.

### 6.4 Two display modes (one SVG, CSS-class swap)

Teaching and Realistic differ **only in colors and labels**, switched by adding/removing a CSS class on
the SVG root. **No shapes move between modes; no elements appear or disappear.** All component colors are
CSS custom properties — mode switching requires no SVG changes.

*(as built)* The Settings labels are **Teaching (default) | Realistic** (`shell.html` `#modeSeg`); the
internal `data-mode` value for Teaching is `learning` — the same mode `new_diagram_controls.md` calls
Learning Mode. Earlier drafts said "Education"; that label is retired.

- **Teaching (default):** full heat-gradient coloring on pipes and fluids; Cherenkov glow scaling with
  power; temperature-driven color throughout. Makes the physics intuitive.
- **Realistic:** muted, desaturated colors during normal operation — things change color only when
  something is wrong, like a real control room. **Alarms and danger states always use full red/amber,
  never muted, regardless of mode.**

Both modes animate identically — pumps spin, levels move, flow animates. Color language is the only
difference. (Color tables in §15.)

### 6.5 Numeric placeholder honors the two modes trivially

The placeholder is text; mode affects only the diagram region's styling, so the placeholder is unaffected
by the toggle beyond inheriting register/units. The two-mode constraint is a property of the SVG layer.

### 6.6 Animation behavior at high speed

Two animation categories respond differently above 600×:

- **State animations** (`anim-state` class) — pump spin, turbine spin, valve position, rod movement,
  heater glow, PORV open/close, component state indicators. **Always animate at state-appropriate speed,
  regardless of time acceleration.** They communicate current plant state and must never be suppressed.
- **Flow-path animations** (`anim-flow` class) — fluid moving through pipes, steam rising, SG bubbles,
  condensate texture. **Freeze at 600× and above** (each snapshot represents hours of sim time, so flow
  velocity animation is physically meaningless).

At 600×+, a CSS class `ff-static` is added to the SVG root, pausing only `anim-flow`. A small badge
(`⚡ 600×`) appears bottom-right of the diagram with a faint amber edge vignette, more prominent at
3600×; both disappear at 60× and below.

---

## 7. Strip Chart

A **single wide trend chart** filling the bottom-left of the plant-control area (this replaces the
former two swappable MFD panels — see §20). The strip chart is pure display: no chrome beyond the chart
itself; the legend is the only label.

- Multi-parameter time-series. Parameter selection and time window come from the **Graph tab** (§10).
- **Time scrubber** at the bottom, video-player style. *(as built)* There is **no `seek` command and no
  Fork / Back-to-Live replay chrome** — the timeline is a **checkpoint rewind**, not a free seek.
  Clicking the scrubber track, or the ⏪ button beside it, opens **rewind-pick mode**: the sim pauses,
  the operator clicks a moment on the plot, and the UI rewinds to the **nearest checkpoint** by issuing
  `rewind { steps, exact: true }` (`toggleRewindPick` / `rewindPickClick`, `ui/app.js`; sandbox
  checkpoints every 15 sim-s in free play, authored checkpoints during instructed content — where the
  Instructor-card ⏪ steps back one checkpoint instead).
- Reads instruments by default; the overlay (§12) can add true values to plotted parameters where
  meaningful, in the same on-screen format.

(System Scanner content and Post-Mortem analytics, formerly MFD options, are no longer hosted here — the
Scanner is its own block in §11; Post-Mortem is deferred.)

---

## 8. Alarm Panel

Bottom-right of the plant-control area, fixed width, stretching vertically. **This is the only alarm
surface** — there is no ticker bar (§20). It is **normally blank**: an empty panel is itself information
(nothing is alarming). When alarms fire, they appear as a **vertical stack** of tiles.

Renders `snapshot.alarms`. The blank-normal model is a deliberate response to limited screen real estate
and is fully compatible with HR1 — see §8.4.

### 8.1 Color and severity are on separate channels

Color encodes **system**; severity is carried by **flash and a glyph** — the two must not share an axis.

- **System color** = the left edge bar (▌) of each tile, using the five failure categories already
  defined in the Failures-tab addendum: **reactivity · coolant · power · instrument · safety_system**.
  (Mapped from the alarm's system; see §8.5.)
- **Severity** = flash rate + a severity glyph/border:
  - **Critical** — fast flash (~2 Hz), filled glyph (e.g. ⚠ solid), heavier border.
  - **Warning** — slower flash (~1 Hz), outline glyph, lighter border.
  - **Caution / status** — steady, muted glyph.

A critical coolant alarm therefore reads as a coolant-colored tile, flashing fast, with a filled
critical marker.

### 8.2 Tile states (three, from the snapshot)

Each alarm reports `state ∈ active_unacknowledged | active_acknowledged | clear`:

- **Active, unacknowledged** — flashes (per §8.1) and sorts to the top. Higher priorities may carry an
  audible annunciation.
- **Active, acknowledged** — clicking the tile issues `acknowledge_alarm { alarm_id }`; the tile goes
  **steady (stops flashing) but remains in the stack** so the operator still sees what is active. Sound
  stops for that alarm.
- **Clear** — gives one brief return-to-normal pulse, then **drops out of the stack**.

A Master Acknowledge control is available but not prominent (`acknowledge_all_alarms`) — good alarm
management means acknowledging individually.

### 8.3 Ordering and overflow

- **Sort:** critical first, then by priority, then **newest-first within a priority**.
- **Overflow:** a cascade can throw 6–8 alarms at once — exactly when space runs out. Cap the visible
  height and either scroll or show a `+N more` overflow row. (Sort order is fixed so a cascade always
  reads top-down by importance.)

### 8.4 HR1 — the panel never reads truth, and silence is ambiguous by design

The panel reads instruments. A stuck sensor means an alarm that should fire **simply never appears**, and
the blank panel gives the operator no tell that anything is hidden. **This is the teaching, not a bug.**
The TMI scenario depends on it: the "valve open" alarm does not annunciate because the PORV indicator
reads closed. **The panel must never fall back to `true_state` to populate a missing alarm.**

### 8.5 The `panel: A|B` field and system mapping

The snapshot's `panel` field (A = reactor/primary, B = secondary/systems) is **not used for grouping**
in this single-stack design (it may serve as a tiebreaker in the sort if desired; default: ignore).
The system color (§8.1) is derived from the alarm's category — provided per-alarm in the plant profile
(alongside `tile_label`), so it is data-driven and reconfigures per plant.

### 8.6 Drawing the eye

With the ticker gone, the alarm cue moved from the top of the screen to the bottom-right. Lean on
**flash + audible annunciation** to pull attention; **optionally apply a faint tint to the headline
gauge strip** while any unacknowledged alarm is active.

### 8.7 Tile labels

Tiles use the spelled-out-with-acronym house style (e.g. "Steam Generator (SG) A — Level Critical Low",
"Reactor Coolant Pump (RCP) Trip"), wrapping to two lines in the narrow panel as needed. This is the
right trade for a teaching tool. Industry register (short codes like "SG LVL LO") remains available in
Settings. Both label forms are stored per-alarm in the plant profile (§13.3).

---

## 9. Instructor Panel

Upper portion of the right column. **Always shown** (it does not disappear in free-play). Large — the
Instructor needs real estate to be useful — and grows vertically with the window.

### 9.1 Layout and content

```
┌─────────────────────────────────────────┐
│  [persona icon]  SHIFT SUPERVISOR        │
│                                          │
│  Previous messages (muted, greyed)       │
│                                          │
│  Current active message (full contrast)  │
│                                          │
│  [◀ PREV] [▶ NEXT] [↺] [✕] [?]           │
│  [          Acknowledge          ]       │
└─────────────────────────────────────────┘
```

- Reads `instructor.message` in the register reported by `instructor.message_register`.
- Persona icon indicates who is speaking (Chief, Dyatlov, etc.).
- Previous messages shown above in muted text (not interactive); the current message is prominent.
- Acknowledge button is full-width and hard to miss under stress.

*(as built)* The panel starts **collapsed** (it expands when the Instructor has something to say, or on
click) and the button rows are **contextual** — there is **no persistent `PREV / NEXT / ↺ / ✕ / ?`
row**. A button that cannot act does not exist on screen (no false affordances, `syncInstrNav`,
`ui/app.js`): the walkthrough nav row (Prev / Next / Rewind / ↺ / ✕) appears only during a procedure
follow; the Acknowledge (+ Rewind) row only while a scenario's commentary is on screen; chat mode and
level-complete render their own buttons (§9.4).

### 9.2 Highlight system (inert infrastructure in v1)

The Instructor can highlight any UI element by its `data-highlight-id`. Highlight types:

| Type | Visual | Meaning |
|------|--------|---------|
| `alert` | Pulsing red/amber glow (matches alarm severity) | "This is the problem" |
| `action` | Pulsing bright cyan/white glow | "Do this — interact with this control" |
| `watch` | Steady soft muted-cyan glow | "Monitor this — background awareness" |

`action` highlights clear automatically when the operator interacts with the element (implicit
confirmation); `alert`/`watch` persist until `duration_seconds` expires or the Instructor clears them.
An optional Instructor pointer (animated arrow from the panel to the target) is specified per highlight,
not automatic. A published **ID registry** (auto-generated from the plant profile) lists every valid
`data-highlight-id` for content authoring — authors must not guess IDs.

**Built in v1 as inert infrastructure:** elements carry their IDs and the highlight rendering exists,
but nothing triggers it until the Instructor phase (M6).

### 9.3 v1 free-play state

With the placeholder Instructor (M6·PH), `instructor.message` is always `null`. The panel **stays
visible and shows "Standing by…"** in muted text, all buttons present, Acknowledge inactive. When a beat
waits for the user (M6), it shows Continue; when waiting for an action or physical condition, it shows a
subtle "waiting" indication — the panel only renders what the `instructor` block reports.

### 9.4 Chat-mode pane *(as built — TMI-2 scenarios)*

When a scenario reports `instructor.chat`, the single-slot commentary card is replaced by a scrolling
**multi-speaker transcript** (Shift Supervisor, Aux Operator, Chief, ANNUNCIATOR, You — `renderChat`,
`ui/app.js`):

- **In-fiction shift clock** — every line is stamped with a wall-clock time (the shift picks up at
  03:53) that runs on the **authored story timeline** (beat `story_min` anchors), so historical
  durations survive the sim's time compression.
- **One-line-at-a-time pacing** — lines reveal on a ~220 wpm reading cadence (conversation, not a
  dump); player-outgoing lines appear immediately. Display-only pacing — the engine's log is untouched.
- **Elapsed-time dividers** ("⏱ about 20 minutes pass") appear **only on authored `time_skip` beats**,
  never from ordinary clock drift.
- **Contextual buttons** — the pending beat's **acknowledge** or **fast-forward (skip)** button renders
  under the transcript and is held back until the conversation has fully played out (no acknowledging
  unread dialogue); level-complete renders inline in the same zone (`chatButtonAction`).

---

## 10. Tools Block

Mid right column, tab-based, grows vertically. **Tabs *(as built)*: Failures · Automate · Graph · Sim ·
Settings · Dev** (`ui/shell.html` `#tabbar`). The original five-tab starting set is superseded: the
**Training tab is retired** in favor of the Plant & Mission window (§10.7), and the **Automate** (§10.5)
and **Dev** (§10.6) tabs were added.

### 10.1 Tab: Failures

The injection surface for free-play. **Specified in full by `M8_failures_tab_spec.md`, which remains
authoritative** — especially the `severity_meta` engineering-unit schema. Summary of what this tab must
get right:

- **Data-driven, not hardcoded.** The list is built from M4's catalog-exposure surface for the active
  plant; adding a failure to a `*_FAILURES` config makes it appear with no UI change. It rebuilds on
  every `reset`/plant change.
- **Magnitude in engineering units.** Every failure that declares `severity_scales` shows a labeled
  slider in its own unit via `severity_meta` (e.g. "Leak Rate: 8 % of rated flow"); the command still
  carries severity `0–1`. The wire is always 0–1; the engineering unit is UI-only. Worked examples:

  | Failure | Label | Unit | min–max | default |
  |---|---|---|---|---|
  | `sgtr` | Leak Rate | % rated flow | 0–8 | 3 |
  | `large_loca` | Break Size | % rated flow | 0–50 | 20 |
  | `steam_line_break` / `channel_rupture` / `srv_stuck_open` | Break Size | % effective area | 0–100 | 30 |
  | `stuck_rod_on_scram` / `stuck_control_rod` | Rod Worth Held | % of total | 0–40 | 20 |
  | `continuous_rod_withdrawal` / `rod_withdrawal_runaway` | Withdrawal Rate | steps/s | 0–6 | 3 |
  | `partial_mcp_trip` | Pumps Lost | % of pumps | 0–75 | 50 |
  | `degraded_hpi` | HPI Capacity | % of rated | 0–100 | 50 *(invert)* |
  | `early_battery_failure` | Battery Life | % of 8 h | 100–25 | 60 *(invert)* |

- **Reflects truth of state.** Rows go active off `snapshot.active_failures` (post-snapshot, never
  optimistically), and a restored/loaded state repopulates sliders from the reported per-entry severity.
  Re-injecting an already-active failure updates its severity (idempotent on identity), not a second
  instance.
- **Instrument failures** appear as ordinary rows (`set_instrument_failure`, stuck-at-current by
  default); an optional collapsed **Advanced instrument failure** expander gives free-form injection
  (instrument × mode × parameter).
- **Free-play only.** Whenever a scenario is loaded, the Failures tab is **removed from the tab bar** —
  failures then come exclusively from the Instructor (M6). The gate is the same scenario state the SIM
  tab shows.
- **HR1 intact.** The tab injects; it never reveals true state. A failed instrument injected here
  misleads the gauges exactly as intended — the overlay (§12) remains the only window onto truth.

### 10.2 Tab: Graph

- Parameter checklist for the strip chart (§7).
- Time-window selector: 1 m | 5 m | 10 m | 30 m.
- Export data button (CSV download).

### 10.3 Tab: Sim

Speed is **not** here — the top-bar selector (§3) is the single, always-visible speed control. This tab
carries the mission status and the full state operations.

- **Current plant / mode:** plant and mode readouts, plus the **⚛️ Plant & Mission…** button opening
  the mission window (§10.7).
- **State operations:** Reset, Save State (download JSON), Load State (file picker → `load_state`).
  *(as built)* There is **no "Export Run History"** — data export lives elsewhere: CSV of the plotted
  parameters in the **Graph** tab (§10.2), the diagnosis JSON bundle in the **Dev** tab (§10.6).
- **Reactivity Computer** *(as built)* — net reactivity ρ (pcm) and reactor period readouts at the
  bottom of this tab (`shell.html` `#rxReactivity` / `#rxPeriod`), for use during approach to
  criticality.
- (No fast-forward auto-dropout and no waypoints in v1 — §20, with the Instructor qualification in §3.)

### 10.4 Tab: Settings

- **Diagram Mode** — Teaching (default) | Realistic (§6.4; internal `data-mode` value for Teaching is
  `learning` — the "Education" label is retired).
- **Values Display** — Instruments (default) | True Values | Both. This is the control for the true-state
  overlay (§12). Applies to gauges, diagram, numeric placeholder, and (where meaningful) the strip
  chart. Independent of Diagram Mode — any combination is valid.
- **Terminology Register** — Learning (default) | Industry (§13). Switches all labels and commentary
  immediately; no reload.
- **Unit preferences** — US Customary | SI (§14).
- **Audio** — on/off, volume (§17).
- (Instructor verbosity / "chatty level" is deferred to the Instructor phase.)

### 10.5 Tab: Automate *(as built — replaces the Training placeholder)*

A pure **face over `snapshot.automation`** — the operator-automation channel runtime that runs
**in-stack in the Control Layer** (`layers/control/`), not in the UI. The tab issues commands and
renders state, nothing more (HR5); control laws and interlocks live below the UI.

- **Master row** — **All auto / All manual** buttons (`set_auto_channel { channel_id: 'all',
  engaged }`; engaging captures setpoints from the current readings).
- **Per-channel rows**, grouped by system, built from the snapshot's channel list (data-driven —
  rebuilds per plant): a **MAN/AUTO toggle** (`set_auto_channel { channel_id, engaged }`), a live
  process-value → setpoint readout, and — where the channel declares `setpoint_meta` — a **setpoint
  input** issuing `set_auto_setpoint { channel_id, value }` (unit-converted for display, enabled only
  while engaged). (`buildAutomate` / `renderAutomate` / `bindAutomate`, `ui/app.js`.)
- **HR1 note (shown on the tab):** automation reads the **instruments** and issues normal commands —
  a failed sensor fools it, interlocks block it, and an engaged channel overrides manual input for its
  control.

### 10.6 Tab: Dev *(as built — supersedes the dev-only Test Panel)*

The development surface is an ordinary Tools tab named **Dev**, hosting **Session Diagnosis**: a 1 Hz
**true-state sampler** (per-plant field sets), an event log of alarm transitions, scram edges, and every
issued command, a free-text notes field, and a **Diagnosis JSON export** bundling timeseries + events +
commands with a full `service.saveState()` snapshot so a session can be replayed and analyzed
(`diagTick` / `exportDiag`, `ui/app.js`; schema matches the `Diagnostic/rd_diag_*.json` exports).

There is **no in-UI Test Panel running the M7 suites** — the M7 runner is driven by `test/run_m7.js`
under Node. The true-state overlay, by contrast, ships — it is a learning feature, not a dev tool.

### 10.7 Plant & Mission window *(as built — replaces the Training tab)*

The Training tab's role moved to a full-screen **Plant & Mission window** (`openMissionSelect`,
`ui/app.js`), opened from the Sim tab's **⚛️ Plant & Mission…** button, the mission status line (§3),
or `?missions=1` (the retired `?tab=training` deep link redirects here). Selection order — nothing
changes in the running sim until a start button is pressed:

1. **Plant** — left-column cards (PWR · RBMK pre/post · BWR), the active plant marked.
2. **Mode** — **Free Play** (starting-condition picker), **Campaign** (the guided mission path with
   completion marks), **Scenarios** (instructor-led situations for the plant), **Walkthroughs**
   (procedure follows).
3. **The specific start** — initial state, mission, scenario, or procedure.

### 10.8 URL parameters — deep links and dev conveniences *(as built)*

Parsed once at `init` (`ui/app.js`); any deep link suppresses the first-run Hook prompt:

| Param | Effect |
|-------|--------|
| `?engine=pwr\|rbmk_pre\|rbmk_post\|bwr` | Start on that plant/design version |
| `?manual[=section]` | Open the Operator's Manual (optionally on a section) |
| `?view=diagram\|primary\|secondary\|all` | Select a plant-display view (legacy RBMK/BWR only) |
| `?mode=realistic\|learning` | Synoptic display mode |
| `?phys=1` | Physics Overlay on (Learning mode only) |
| `?inject=id,id` | Inject failures at severity 1 |
| `?ff=<sim s>` | Fast-forward that many sim seconds (capped 7200), then back to 1× |
| `?tab=<tools tab>` | Open a Tools tab (`?tab=training` → Plant & Mission window) |
| `?missions=1`, `?mmode=<mode>` | Open the Plant & Mission window (optionally on a mode) |
| `?help=1` | Open the Help overlay |
| `?auto=<id,id\|all>` | Engage automation channels |
| `?run=1` | Start the sim running |
| `?follow=<procId>` | Start a procedure walkthrough |
| `?scenario=<id>` | Start an M6 scenario directly |

---

## 11. System Scanner

A short block at the bottom of the right column, under the Tools Block (≈3–4 text lines). **A UI helper
/ wayfinding tool — not an instrument surface.** Hover any element, get a plain-language description of
*what it is and what it's for*. **It shows no live data** (live values live elsewhere on screen), which
sidesteps HR1 entirely — there is nothing here that can be stuck or misleading.

- **Works on any aspect of the UI**, not just the diagram: controls, gauges, the strip chart, alarm
  tiles, the Instructor panel, the SCRAM cover, the speed selector — anything worth explaining. This is
  what makes the whole interface self-describing for a newcomer.
- **Active-alarm tiles get a fuller description.** Hovering an active alarm gives a good plain-language
  account of the alarm — what the condition means and why it matters — sourced **per-alarm from the
  plant profile** (so it is data-driven and plant-specific), not a generic "click to acknowledge."
- **Mechanism:** a `data-scanner-hint` attribute on any hoverable element, read on `mouseover`. No
  manifest lookup, no snapshot fields, no per-plant wiring beyond what diagram components already carry.
  Diagram components may resolve their hint via the component manifest; everything else carries the
  attribute inline.
- **Persistence:** holds the last-hovered hint rather than blanking on mouse-out (so the text stays
  readable). Before any hover, shows an idle prompt ("Hover anything to see what it does").
- **Register-aware (optional polish):** hint text may follow Learning vs Industry (fuller vs terser);
  not required for v1.

### 11.1 Two tiers — the inspection block (#96, built 2026-07-28)

The Scanner block **is** the inspection surface: clicking it expands it, and while expanded the
same hover gives a fuller description instead of the one-liner.

- **Collapsed** — `Title — one sentence`. What it is, what it does.
- **Expanded** — adds the detail paragraph, a note when the copy describes the enclosing **card**
  rather than the part under the cursor, and a **📖 Manual §x.y** button that opens the operator's
  manual on the section that documents the object (matched on the section number, so §9.1 cannot
  land on §9.10). The expanded/collapsed choice persists in `localStorage`.
- **Where the copy lives.** Two sources, deliberately split:
  - **The PWR board** resolves through `ui/diagram/board/pwr_board_inspect.js` (`RD.PwrBoardInspect`),
    keyed by diagram item id and reached via the driver (`inspectItem`) — plant knowledge belongs
    with the wiring, not the shell. An item with no entry of its own inherits the **smallest box
    that geometrically contains it**: board tiles are absolutely-positioned siblings, so "which card
    is this on?" is a geometry question, not a DOM one.
  - **Everything else** carries `data-scanner-hint` / `data-scanner-detail` (+ optional
    `data-scanner-doc` / `-sec`) inline — the mechanism above, unchanged. Gauge and alarm-tile detail
    is **generated** from the manual reference and the plant's protection table, never authored twice.
- **Hit targets.** `[data-item]` on the board; a **geometric fallback** covers tiles the pointer can
  never reach (the reactor vessel is `pointer-events:none` so the rod buttons it overlaps stay
  clickable). It honours the stage's paint order, so a lifted control beats the card beneath it.
- **No hover highlight.** *(OWNER DIRECTIVE, 2026-07-28: "when mousing over something to have it show
  in the system scanner it should not highlight the object being moused over. the white box that now
  appears around objects the mouse is over is very annoying.")* The merged issue text (#69) asked for
  a subtle glow on the hovered object; in use it is noise. `.instr-glow` (Instructor) and `.ckl-glow`
  (checklist preview) stay — those mark something the player did **not** choose.
- **The block never describes itself.** Hovering it would wipe the text being read, and the pointer
  crossing it on the way to the Manual link detached the button mid-click.
- **Gate:** `test/run_inspect.js` (orphaned keys, coverage, dead manual citations, duplicate copy)
  plus resolution pins in `ui/test_panel/board_check.html`.

Examples:

```
SYSTEM SCANNER
Pressurizer (PZR) — keeps the primary loop
at the right pressure so the coolant stays
liquid. Heaters raise it; spray lowers it.
```
```
SYSTEM SCANNER
Steam Generator (SG) A — Level Critical Low.
Water level in this steam generator has
fallen far enough to risk losing heat
removal from the primary loop. Restore feed.
```

This **supersedes the old Scanner definition** in `08_UI_HMI_Spec.md §7.1` and `M8_user_interface.md
§5.2` (both described it as physics/tutorial content tied to diagram components with live readings); that
version is retired.

---

## 12. True-State Diagnostic Overlay (carried from M8)

Gauges, the diagram, and the numeric placeholder read instruments by default. The user can call up the
**true value** as an explicit diagnostic overlay, to learn from the comparison between what is indicated
and what is real. It reads `snapshot.true_state`.

- **Off by default** — the operator's normal condition is to see only instruments. This is what makes a
  failed instrument able to mislead, which is the point.
- **Ships in production** (unlike the dev-only Dev-tab tooling, §10.6) — comparing indication to
  reality is part of the education.
- When on (Settings → Values Display = Both, or True Values), each gauge/readout shows the true value
  **alongside** the indicated one, in the **same on-screen format** (true PORV position next to the lying
  indicator; true subcooling next to indicated; true void as a %, true level as a %), so the divergence
  is a like-for-like comparison. Significant divergence is visually flagged.

---

## 13. Terminology and Labels

### 13.1 House style: spell it out, with the acronym

The default is the **Learning register**: every label, control, alarm tile, and gauge name uses the full
plain-English term with the industry acronym in parentheses — "Pressurizer (PZR)", "Emergency Core
Cooling (ECCS)", "Reactor Coolant Pumps (RCP)". Users learn the concept and the shorthand simultaneously.

**Two deliberate carve-outs:**

- **Vital-few gauge strip (§4):** acronyms are acceptable on their own here (space-constrained); the
  full form is available on hover and via the Scanner.
- **SCRAM** is the real term, not an expanded acronym, and appears identically in both registers.

### 13.2 The Industry register

Settings → Terminology Register = Industry switches all labels to standard acronyms/shorthand (PZR,
ECCS, RCP, AFW, EDG, PORV, …) and alarm tiles to authentic short codes ("PZR PRESS HI"). Appropriate
once the user is fluent. Switching registers re-renders all labels immediately (`set_register`); it is
display-only. **Internal IDs, snapshot keys, and profile fields always use industry shorthand regardless
of register.**

### 13.3 Implementation

A UI-side lookup table: every label references a terminology key; the active register's table supplies
the display string. Alarm tile labels arrive register-selected from M4, and the profile stores both
forms per alarm (`tile_label_learning` / `tile_label_industry`) — and now also a per-alarm
`scanner_hint` for the Scanner (§11). **Note:** the Learning alarm labels are the parenthetical form
("Steam Generator (SG) Level Low"), updating the bare-word form that appeared in `08 §16.3`.

The terminology reference table (key → Learning → Industry, e.g. `pzr` → "Pressurizer (PZR)" → "PZR")
carries over unchanged from `08_UI_HMI_Spec.md §16.2`.

---

## 14. Units

A global display-side toggle (Settings → Unit preferences), structurally like the register toggle: it
converts values for display only and **never touches the engine, setpoints, or any protective decision
(HR1)** — determinism is unaffected.

- Converts only the genuinely-dimensioned readouts: **pressure** (MPa↔psia), **temperature** (°C↔°F,
  absolute and for differences/margins), **condenser vacuum** (kPa↔inHg). **Flows, power, level, and RPM
  are unit-system-neutral** and render identically in both.
- **No plant-imposed default** — the toggle starts on whatever the player chose and may be kept on any
  plant. Next to affected readouts, a small non-intrusive note indicates which system is *authentic for
  the current plant* (US customary for the PWR; SI for the RBMK and BWR) — informational only, updates
  on plant change, disappears when the chosen system already matches.
- The conversion table lives in one units module (consistent and testable). Dimensioned values the user
  *enters* are converted back to internal SI before the command is issued.
- Display formatting follows `CONTEXT.md §11`: `_pct` shown directly as %; fractions/normalized values
  (void, `_normalized` flows) shown ×100 with a % sign; the overlay shows true values in the same format
  as indicated.

---

## 15. Color Scheme

### Backgrounds (darkest → lightest)

| Element | Color |
|---------|-------|
| Strip chart | `#181B1F` (darkest — maximizes contrast) |
| Plant control area | `#1C1F24` |
| Right column | `#252A31` |
| Elevated popovers | `#2F353D` |
| Borders / dividers | `#3A4049` |

### Text

| Element | Color |
|---------|-------|
| Primary | `#E8ECF1` |
| Secondary / units | `#A8B0BB` |
| Muted / previous Instructor messages | `#6B7280` |
| Disabled | `#4B5563` |

### Semantic state colors

| State | Color |
|-------|-------|
| Normal / good | `#22D3EE` (cyan) |
| Caution | `#F59E0B` (amber) |
| Alarm / critical | `#EF4444` (red) |
| Running / active | `#22C55E` (green) |
| Stopped / inactive | `#6B7280` (gray) |
| Trend up | `#FB923C` |
| Trend down | `#67E8F9` |

### Alarm system-category colors (left-bar of alarm tiles, §8.1)

Reuse the five Failures-tab categories: **reactivity · coolant · power · instrument · safety_system.**
Assign one distinct, legible hue per category in the palette (kept consistent with the Failures-tab
color language). Severity is **not** carried by these colors — it is flash + glyph (§8.1).

### Diagram color modes

Education and Realistic palettes (cold water, hot water, steam, core, rods) carry over from
`08_UI_HMI_Spec.md §12`. Realistic mutes normal-operation colors; alarms/danger states are always full
red/amber in both modes.

---

## 16. Gauges

Gauges appear in the vital-few strip (§4) and in localized control popovers. Configuration from the plant
profile `gauges` list.

- Analog arc + digital numeric readout.
- Zone coloring: normal (cyan) / caution (amber) / danger (red); a distinct scram-marker line.
- Trend arrow (↑ ↓ →) from the last 5 snapshots; a 60-second sparkline.
- Reads `snapshot.instruments[gauge.reads]`. In overlay mode, the true value is shown as a secondary
  indicator (§12).
- **Zone thresholds and trip markers are never hard-coded** — always from the plant profile, so they
  align with the alarms.
- **Display damping** *(as built)* — a display-only low-pass (`dampInstruments`, `ui/app.js`;
  k = 0.18 per broadcast) smooths every numeric instrument value before rendering so readouts don't
  chatter at 1×; **disabled at ≥60× time acceleration** (values jump too far per snapshot to smooth
  meaningfully). Strictly display-side: alarms, automation, and the layers below all see the raw
  instrument values.

---

## 17. Audio

Deferred to a polish pass. **Hook points are built in v1** (event-driven trigger points in code), silent
by default; assets wired later. Hook points: new unacknowledged alarm, alarm acknowledged, scram, first
criticality, simulation reset, Instructor message delivered.

---

## 18. Data Integration (how the UI connects)

**No HTTP, no WebSocket, no server.** Per `CONTEXT.md §6.8 / §7`, the simulator is browser-only vanilla
JS in a single tab; the UI, all layers, and the engine communicate by **direct in-process function
calls** and a shared snapshot object.

```
UI (this) ── commands ↓ ──► SimulationService.handleCommand ──► Instructor slot ──► C&F ──► Engine
   ▲ subscribe(render) ◄───────────────────── snapshots ─────────────────────────────────────┘
```

- **Render from the snapshot.** The UI subscribes to M5's broadcast and renders each snapshot — reading
  `instruments`, `control_state`, and `alarms` for the operator view; `metadata` for the top strip and
  clock; `instructor` for the Instructor panel; and `true_state` **only** for the overlay (§12). Render
  every received snapshot (no throttling).
- **On plant/profile change** (a `reset` to a new plant), the UI reconfigures the vital-few strip,
  control sections, alarm system mapping, rod displays, gauge configs, and the Failures tab from the new
  plant's data.
- **Act through commands.** Every user action becomes a command issued to `SimulationService`
  (`CONTEXT.md §6.7`), which routes lifecycle commands itself and forwards plant commands down the stack
  — so scenario gating and failure interception always apply. A control issues the command and waits for
  the next snapshot; it never changes the plant directly. (This is why a stuck valve can visibly refuse
  a close command.)

(The `08 §17` "WebSocket /ws, reconnect every 2 s" section is obsolete prose from an earlier
server-based assumption and is retired — see §20.)

---

## 19. Build Target and File Structure

Per `CONTEXT.md §7`, this module produces `ui/`:

| Path | Contents |
|------|----------|
| `app.js` | Wires the UI to the Simulation Service (M5): subscribes to snapshots, renders, issues commands. Owns top-level layout and register/overlay/units state. |
| `diagram/` | The diagram region: the fixed numeric **placeholder** (§6.2), the SVG mount, and the animation layer written against the component manifest (§6.3). |
| `panels/` | The vital-few gauge strip, control sections, strip chart, alarm panel, Instructor panel, Tools Block, System Scanner. |
| `test_panel/` | *(as built)* Dev-only harness pages (e.g. `synoptic_check.html`). The in-UI M7 Test Panel was not built — dev tooling is the Dev tab (§10.6) plus the Node runners (`test/run_m7.js`). |

Plain `index.html` + CSS + vanilla JS; no framework, no build step. DOM manipulation throughout; all
complexity lives below the UI.

**Implementation invariants:**
- No hard-coded setpoints, alarm lists, gauge ranges, or parameter lists — all from the plant profile /
  `reset`.
- Every `data-highlight-id` matches an instrument/component ID from the plant profile schema.
- Plant-control-area aspect ratio is fixed in CSS (a wrapper with a fixed `aspect-ratio`); the strip
  chart, alarm panel, and right column use `flex-grow` to fill remaining space. No blank space around
  the control area.
- The old `ui_in_testing.html` is retired; do not reference it.

---

## 20. Changelog — what this consolidation retired and why

| Retired | Source | Reason |
|---------|--------|--------|
| **Alarm ticker bar** | `08 §4` | Removed for screen real estate; the alarm panel (§8) is now the only alarm surface (normally blank, dynamic stack). |
| **Multi-bank rods (A/B/C/D), shutdown banks SA/SB, overlap sequencing, PDIL-per-bank, Bank Overlap Unit, core map** | `08 §5.1` | This version has **one control bank + one shutdown bank** (`CONTEXT.md §5`, §8). The single control bank keeps a simple insertion limit. |
| **WebSocket transport (`/ws`, reconnect)** | `08 §17` | No server in v1; the UI subscribes to M5's in-process broadcast via direct function calls (`CONTEXT.md §6.8`). |
| **Fast-forward auto-dropout (drop triggers, waypoints, Instructor FF suppression)** | `08 §11` | No **transient auto-detect** dropout; the user sets speed manually (`CONTEXT.md §8`). *(as built)* One qualification: the **Instructor** drives acceleration with automatic drop-out at set points (beat `speed`; §3). |
| **Two swappable MFD panels + MFD content-selection (incl. Post-Mortem option)** | `08 §7`, `M8 §5.4` | Collapsed into a **single wide strip chart** (§7). Post-Mortem deferred. The Scanner is now its own block. |
| **Old System Scanner (live physics/tutorial content on diagram components)** | `08 §7.1`, `M8 §5.2` | Replaced by the lightweight **UI-wide wayfinding helper** (§11): static description text, no live data, works on any element. |
| **"MRS / Megawatt: Reactor Simulator" branding** | concept scan | Branding is **Reactor⚛️Dynamics (R⚛️D)**. |
| **Speed sets `1x/5x/10x/50x/MAX` and `1x/2x/5x/10x/60x`** | `08 §3`, `M8 §4` | Canonical set is **1× / 10× / 60× / 600× / 3600×**; play/pause is a separate button (no MAX in v1). |
| **Instructor panel hidden in free-play** | `M8 §5.5` | The panel is **always shown**; free-play shows "Standing by…" (§9.3). |
| **Bare-word Learning alarm labels** | `08 §16.3` | Updated to the parenthetical house style ("Steam Generator (SG) Level Low"). |

**Carried forward intact from `M8_user_interface.md`:** the numeric placeholder strategy (§6.2), the
true-state overlay mechanics (§12), and the two display modes (§6.4). **Incorporated by reference:** the
Failures-tab addendum (`M8_failures_tab_spec.md`) remains authoritative for the `severity_meta` schema
(§10.1).

---

*Architecture & contract reference: `CONTEXT.md`. Failures-tab detail: `M8_failures_tab_spec.md`.*
