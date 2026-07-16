**Full Summary of the Animated Synoptic Diagram**

### Overall Concept & Goals

* **Purpose**: Teaching + direct control of the PWR simulator.
* **Replaces current UI**: This spec **supersedes** the existing plant-display layout — the **left 4-view switcher** (Diagram / Primary / Secondary / All), the per-view Primary/Secondary/Diagram split, the tabbed PD control lists, and `pwr_full_plant_diagram_v2.html` (and related partial-loop SVGs). The new UI is **one integrated schematic** as the sole plant-control surface: **margin cards** for major systems, **diagram-embedded panels** where controls belong on the equipment (CVCS box, accumulator tanks), plus vital-few strip, alarms, strip chart, instructor, and sim controls (M8).
* **Design philosophy**: **The user knows what they are controlling on sight.** Adjacency beats abstraction; leaders reinforce spatial connection when perfect adjacency is impossible. The whole plant stays visible so system interactions remain readable — especially for future **AUTO** modes where one role is in focus and the rest of the plant runs. Support **priority tiers** and **“what matters now”** (§ below) during transients and failures.
* **“What matters now”** (optional shell mode, instructor step, or scenario hook): temporarily emphasize the **few readouts and components the operator should watch next** — soft pulse on margin card border, embedded panel chrome, diagram node, and any linked leader. **Auto-expansion:** affected margin cards (and **sections inside** merged/tabbed cards) **expand or un-collapse** when their system is in the current priority tier or active transient/failure; collapse back when priority clears (user manual expand still allowed). Does **not** replace alarm colors or add truth the board lacks. **Example — TMI-class stuck PORV:** while `stuck_porv_open` + `porv_indicator_stuck_closed` are active, highlight **`pwSubcoolBar`** (eroding margin), **PZR Pressurizer card** (level section) + `pwPzrWater` (misleading rise), **Relief card** + `pwPorv` (lying indicator), and optionally **CVCS embedded panel** letdown/charging context — **not** the whole diagram. Instructor may drive the same set via `highlight` targets; alarms still read instruments only (HR1).
* **Style**: One integrated schematic diagram showing the full plant from reactor to cooling tower.
* **Flow Direction**: Primary left-to-right energy flow (reactor → primary loop → SG → turbine → condenser → cooling tower).
* **Contract alignment**: Indications and controls map to M1 (`pwr_instruments.js` §8.8, `CONTEXT.md` §6.7). Cards are the diagram-local home for parameters not given a dedicated gauge elsewhere. Engine pre-requisites in `Blueprint/pwr_synoptic_prerequisites.md` are **complete** — wire only `snapshot.instruments`, status booleans, and `control_state`. No grey placeholder hardware on the schematic.
* **Two Operating Modes** (Realistic vs Learning) plus **Physics Overlay** (Learning only):

  * **Realistic Mode**: “Quiet board” mimic — **indications and status only** (`snapshot.instruments` + §8.8 status booleans). No `true_state` numbers, no physics-only fields, **no animation driven by physics the board cannot see** (§ Animation HR1).
  * **Learning Mode**: Full color, rich teaching visuals, glows, strong failure call-outs. Shows **all board indications** plus **contextual** teaching cues (§ Contextual indicators) and § Deception duals. **Physics Overlay** toggle (one checkbox/button, Learning only): **off** = quiet teaching board (contextual cues only); **on** = full physics layer (§ Physics Overlay fields). Realistic mode hides the overlay control entirely.

### Core Visual Rules (Plant-Wide)

* **HR1 — Plant Indications**: Alarms and annunciation always read `snapshot.instruments` (and status booleans) in **both** modes — a failed sensor means wrong or missing alarms, identical to a real board.
  * **Realistic Mode**: Every numeric card/tap readout is **indication only**. If the plant has no instrument for a quantity, **do not show it** on the board — add the instrument in `pwr_synoptic_prerequisites.md` rather than falling back to `true_state`.
  * **Learning Mode**: Board indications always shown (same values as Realistic). **Additionally** show § Contextual indicators when operationally relevant (or via “What matters now”). **Additionally** show *Indicated* / *Actual* pairs **only** on § Deception duals. § Physics Overlay fields appear **only** when overlay is on. Switching to Realistic hides contextual cues, overlay, and dual *Actual* columns.
* **Animation HR1** (strict in Realistic): **Nothing** on the diagram or cards may read or animate from `true_state`, derived physics, or command setpoints pretending to be plant feedback — **only** `snapshot.instruments`, §8.8 status booleans, and `control_state` for **valve/pump commanded pose** where the plant has no position instrument (bow-tie rotation on command is OK; **flow dashes and spin speed are not**).
  * **Realistic Mode checklist**: relief spray ← `porv_indicator` or safety-relief status/instrument; pump impeller speed ← flow **instrument** or running **status**; pipe dashes ← flow **instrument** or active **status**; levels ← level **instrument**; accumulator injection ← `accumulators_discharging` + `instruments.accumulator_flow`; leaks ← break/ECCS status or flow **instrument** — never `porv_open`, `pump_flow_pct`, `leak_flow`, etc. from `true_state`.
  * **Learning Mode**: May **additionally** animate or overlay from `true_state` where it teaches (relief when `porv_open` true while indicator lies; faint true subcooling ghost on bar — **Physics Overlay on** and failed-P/T-sensor lesson — § Subcooling margin bar). Dual readouts name the gap.
* **Temperature coloring (liquids)**: Smooth continuous gradient (cool blue → cyan/green/yellow → hot red/orange). Static pools, plenums, and tanks use the proper local temperature color.
* **Steam**: Dry saturated steam = grayscale (light gray = hotter, medium gray = cooler). Wet steam (steam-water mix) = grayscale version of the temperature gradient.
* **Animated elements**: Flow lines (dashed, direction-aware), levels (match **indicated** level timing/speed in Realistic; true level acceptable in Learning for teaching), pump impellers, turbine blades, valve states, relief flow, leak spray — all subject to **Animation HR1** above.
* **Pause freeze** (`snapshot.metadata.running === false`): When the simulation is paused (M8 play/pause button or `pause` command), the synoptic stage is **frozen** — **no motion anywhere on the diagram** (flow dashes, impeller/turbine spin, level transitions, relief/leak spray, rod-bank motion, leader dash animation, “what matters now” pulse, subcooling bar cursor glide). Static colors, valve poses, and numeric readouts remain at their last snapshot values. Show a centered overlay on the diagram stage: **`SIMULATION PAUSED`** (legible at minimum scale; does not obscure vital controls). Hide the overlay when running resumes. Hover highlights and controls remain usable while paused.
* **Valve style** (consistent everywhere): Classic bow-tie symbol + circle behind it.

  * Open: bow-tie aligned with pipe + bright color.
  * Closed: bow-tie rotated 90°.
  * Throttled: open orientation + bar/fill showing % flow.
  * Animation + color change on state change.
* **Pumps**: Classic snail-shell centrifugal shape with visible spinning impeller (speed from flow **instrument** or running **status** — Animation HR1).
* **Text & Scaling**: Minimum legible size. Diagram scales with screen size; at a threshold, diagram and text scale together.
* **Hover & highlight model** (interaction contract — every control and panel implements `data-highlight-id` links):

  * **Hover margin card** → that card’s **leader line(s) become prominent** (thicker, brighter, or subtle dash animation); paired diagram node(s) + leader endpoints highlight together.
  * **Hover diagram-embedded panel** (CVCS box, accumulator status strip) → same as card: emphasize leaders (if any) + host equipment + connected pipes/pumps.
  * **Hover control** (on a card or in an embedded panel) → highlight **physical component(s)** the control acts on (pump, valve, vessel, pipe segment). Also **lightly highlight related indications** that will move in response (e.g. charging flow setpoint → `pwCvcsChargeLeg`, `pwPzrWater`, cold-leg inventory path; letdown → letdown branch + PZR level context; heater → `pwPzrHeater`).
  * **Hover indication** (gauge, bar, tap label) → highlight **sensor location** on the diagram (tap pulse, pipe segment, vessel region).
  * **Hover alarm** → diagram component + margin card or embedded panel + active leader (see Alarm Integration).
  * **“What matters now”** (§ Design philosophy): priority-tier soft glow on the linked margin card, **embedded panel**, diagram node, and leader — see TMI example (subcooling bar + PZR level + PORV).
* **Click interactions** (fallback): Click a crowded or distant component to open a **popover** with the same controls as the embedded panel or nearest card.
* **Failure Visualization**: Leaks shown as dashed line + spray/particle animation from the leaking component. Visual strength depends on mode. Mapped failure sources:

  * `sgtr`, `large_loca` → primary leak spray from break location on loop.
  * `loss_of_feedwater` → feedwater path dries up; SG level falls.
  * `stuck_porv_open` → in **Learning Mode**, relief discharge may animate from true `porv_open` while `porv_indicator` reads closed; in **Realistic Mode**, no relief animation unless the indicator (or safety-relief instrument) says open.
  * `loss_of_condenser_vacuum` → condenser vacuum indication decays; turbine trip follows.
* **Card placement** (margin cards — spatial, not side-rails):

  * **Adjacency first**: Place each card **as close as possible** to the component it controls or indicates. High-priority cards (Rod, Power & Reactivity, PZR Pressurizer + Relief, Emergency) get the nearest clear margin.
  * **Adjacency is preference, not law**: Cards **must never overlap** vessels, valves, pipe runs, or flow animations. When tight, **slide along the margin** within a logical **anchor zone** (§ A.1b) or **cluster** related cards (PZR Pressurizer + Relief; SG Level + Steam).
  * **Card density:** Merged cards (PZR) and tabbed cards (Emergency) reduce margin clutter; **sections inside a card** may collapse by default and auto-expand per § “What matters now”.
  * **Leaders compensate**: When a card cannot sit adjacent, a **prominent-on-hover leader** (§ Hover & highlight) maintains the spatial link. Strong hover behavior is an accepted substitute for perfect placement.
  * Cards sit in **margin whitespace** only; compact ~200–260 px width; stack up to **2 deep** in one zone before sliding along the margin.
* **Diagram-embedded panels**: Some systems host controls **on the equipment** (§ CVCS, § Accumulators) via `foreignObject` or anchored HTML overlay inside `.synoptic-stage` — not margin cards. Same hover/highlight contract as cards.
* **Card leader lines** (behavioral): Dashed leader from card edge to `pw*Anchor`; minimize pipe crossings; **reconnect on resize**. Default: subtle stroke; **prominent on card/panel hover** (§ Hover & highlight). Embedded panels may use a short leader to the box/tank or rely on adjacency alone if the panel is on the component.
* **Sensor taps (on-diagram indications)**: Leg point measurements at the sensor on the SVG — **T-hot** / **T-cold** only on taps (not on cards). **Subcooling** uses the **bar gauge on the Power & Reactivity card** (§ Subcooling margin bar) as the primary readout; optional **`pwTapSubcool`** on the hot leg is a **hover anchor** (pulse + leg highlight) linking to that bar — no second numeric duplicate on the diagram. Vital-few strip remains the headline summary.
* **Subcooling margin bar** (Power & Reactivity card — primary TMI diagnostic):

  * **Layout**: Vertical **thermometer-style** bar beside T-avg / ΔT / power; **large numeric** `instruments.subcooling_margin` (°C) adjacent.
  * **Scale**: Bar spans at least **−10 °C → +40 °C** (clip to instrument range); **0 °C** = saturation / boiling line clearly marked.
  * **Zones** (top = healthy, indicator line moves **down** as margin erodes):
    * **Green**: above **11 °C** (above LO SUBCOOL alarm threshold).
    * **Yellow**: **11 °C down to 0 °C**.
    * **Red**: **below 0 °C** (saturation / boil-off).
  * **Indicator**: Thick horizontal **cursor line** on the bar at the indicated value; smooth motion with instrument lag.
  * **Realistic Mode**: Zones + cursor + numeric only — standard plant style (HR1).
  * **Learning Mode**: Same indicated bar; optional faint **ghost cursor** at true `subcooling_c` **behind** the indicated line when **Physics Overlay is on** and running a failed-P/T-sensor deception lesson (not shown in Realistic or overlay off).
* **Tap hover highlight**: Hover a tap label (or its value) → **pulse ring** on the tap circle + brighten the host pipe segment (`pwHotLeg`, `pwColdLeg`, etc.); hover a card → existing highlight on paired node + leader. Scanner text names the physical location (*“Hot-leg RTD, downstream of core outlet”*). This replaces always-on clutter while still teaching *where* the measurement is taken.
* **Emergency-system cards**: Distinct border/background; leaders use amber dashed stroke.
### Learning readouts (what Learning Mode adds beyond the board)

Four tiers — keeps card density manageable.

**§ Core teaching readouts** (Learning Mode — **always visible** on Power & Reactivity card):

| Field | Notes |
|-------|--------|
| `power_range` | Primary flux-linked indication. |
| `startup_rate_dpm` (SUR) | Operator-facing reactivity proxy — keep; no separate “reactivity computer” block by default. |
| `instruments.subcooling_margin` + § Subcooling margin bar | TMI diagnostic — always on card. |
| `tavg`, leg **ΔT** (`thot − tcold` from instruments) | Core thermal picture. |

**Hidden by default** (not on the quiet Learning board unless § Contextual or § Physics Overlay):

| Field | Rule |
|-------|------|
| `reactor_period_s`, `reactivity_pcm` | Detailed reactivity computer — **Physics Overlay only**. |
| Primary–secondary **ΔT** (SG card) | **Physics Overlay only** (derived from true leg temps + `steam_pressure_mpa`). |
| Raw `fuel_temp_c` | **Never** show numeric fuel temperature — use § Contextual fuel status only. |

**§ Contextual indicators** (Learning only — **hidden by default**; appear when operationally relevant **or** when “What matters now” / instructor highlights the parent card):

| Indicator | When to show | Presentation |
|-----------|--------------|----------------|
| **Xenon** (`xenon_pct_eq`, smoothed trend) | After significant power change, during xenon peak/transient, or priority tier names xenon | **Text chip only** — no bar gauge. Examples: *“Xenon: Building ↑”* (amber), *“Xenon: Peaking ↔”* (yellow), *“Xenon: Burning Off ↓”* (green). Optional one-line cause hint. Hide when xenon near equilibrium and no recent power maneuver. |
| **Fuel status** (`fuel_temp_c`, damage/melt flags — **no raw °C**) | Approaching damage threshold, active damage, or melt in progress; “What matters now” on core | Text only: *“Fuel damage imminent”*, *“Fuel damage occurring”*, *“Fuel melting in progress”*, or *“Fuel stable”* when teaching recovery context. **Hide** during nominal full-power operation. |

**§ Deception duals** (*Indicated* / *Actual* on the same row — Learning only):

| Pair | Why dual |
|------|----------|
| `porv_indicator` / `porv_open` | **Flagship TMI lesson** — indicator reports commanded, not actual (M1 §8.5). |
| `boron_analyzer` / `boron_ppm` | Sample lag and analyzer error vs core truth. |
| `instruments[id]` / `true_state[SOURCE[id]]` | **Only while** that instrument has an active `set_instrument_failure` (stuck/drift/dead). |

**Not routine duals:** `subcooling_margin` vs `subcooling_c` (overlay + failed-P/T lesson only); `sg_level` vs true level (shrink/swell — animate to **indicated** level).

**§ Physics Overlay fields** (Learning + **overlay toggle ON** — hidden when overlay off):

| Field | Teaches |
|-------|---------|
| `reactivity_pcm`, `reactor_period_s` | Full reactivity computer (M1 §8.9) — not protection inputs. |
| `core_inventory_pct`, `primary_void_fraction` | Inventory / void during relief, LOCA, boil-off. |
| Primary–secondary ΔT | SG heat-transfer intuition. |
| `decay_heat_pct` (numeric) | Post-scram decay context. |
| Subcooling ghost cursor, extra `porv_open` teaching animation | Deep deception lessons. |
| Cherenkov + amber fuel glow | Always allowed in Learning (visual, not numeric); may intensify when overlay on. |

### Diagram geometry (v2 layout)

**Reference:** `inbox/Schematic-diagram-of-a-pressurized-water-reactor.png` — classic textbook PWR proportions (reactor left, SG center, turbine/condenser right). **Condense vertically** vs legacy `pwr_full_plant_diagram_v2.html`:

| Change | Rationale |
|--------|-----------|
| **SG lowered** on canvas; shorter aspect ratio | Frees upper margin for PZR + steam header cards |
| **Steam outlet at SG top-right edge** (not center-top); header runs right then down to governor | Matches reference schematic; shorter vertical steam run |
| **Turbine directly over condenser** (stacked column on the right) | Compact BOP column; exhaust drops straight into condenser |
| **Condenser ≈ square** (not tall vertical shell) | Saves height; hotwell pool still decorative at bottom of box |
| **Generator beside turbine** with **short horizontal shaft** | Matches reference; Turbine-Generator card anchors to the pair |
| **Cooling tower** in remaining lower-right or far-right whitespace | No fixed tie-in — place where cards do not crowd |
| **Primary loop** | Reactor left; hot leg upper path to SG; cold leg lower path with RCP; PZR on hot leg (upper left) |
| **ViewBox target** | ~16:10 width-heavy; **~55–60 %** of plant-control column height reserved for diagram; **bottom ~35–40 %** fixed for strip chart + alarm panel (M8) |

**Shell structure**

```
.synoptic-panel (column, flex 1)
  .synoptic-stage (position relative; flex 1 1 auto; min-height 0)
    svg#pwLoop (100% width/height of stage, preserveAspectRatio xMidYMid meet)
    .card-overlay (position absolute; inset 0; pointer-events none)
      .plant-card × N (margin cards; pointer-events auto)
      .diagram-panel × M (e.g. pwCvcsPanel, pwAccumulatorPanel — anchored to SVG bbox)
    svg.card-leaders OR <g id="pwCardLeaders"> inside pwLoop (dashed lines card↔anchor)
  .synoptic-trends (flex 0 0 38%; chart + alarms — do not steal from stage)
```

### Major Sections & Cards

**Reactor Area**

* Central vessel with core.
* **Cherenkov glow** (faint cyan on edges, scales with `power_range`) — Learning Mode only.
* **Amber fuel glow** (heat + decay heat) — Learning Mode only.
* Two cards (+ on-diagram temperature taps — no Temperature card):

  * **Rod Control Card**

    * **Control bank** (operable): vertical bar + step readout (0–228 steps withdrawn); RAISE | STOP | LOWER (hold) + ±1 nudge; speed Slow | Normal | Fast; **SCRAM** (two-step safety cover).
    * **Shutdown bank** (read-only): bar + steps; green when fully withdrawn at power; drives in on scram only; red if not fully withdrawn during power operation.
    * **Insertion limit**: limit marker on control bank bar; amber/red when `rod_at_limit`; plain-language limit readout in Learning Mode.
    * **Scram status**: `rps_scrammed` / REACTOR TRIP indication.
  * **Power & Reactivity Card** (reactor-centric aggregates — leader to core; sections may auto-expand per § “What matters now”)

    * **Always (both modes on card):** **Reactor Power** (`power_range`, %); **T-avg** (`tavg`); leg **ΔT** (`thot − tcold`); § **Subcooling margin bar** + numeric `instruments.subcooling_margin` (M1 §8.6).
    * **Learning — core:** **Startup Rate** (`startup_rate_dpm`) — always shown; primary operator reactivity proxy. **No** reactor period or ρ (pcm) unless Physics Overlay on.
    * **Learning — contextual (hidden by default):** § **Xenon** text chip and § **Fuel status** text per § Contextual indicators. Auto-show when relevant or when this card is in “What matters now” priority.
    * **Learning — Physics Overlay on:** Full reactivity computer block (ρ pcm, period s); optional xenon ρ-holding line; subcooling ghost cursor in deception lessons.
    * Cherenkov glow scales with power (Learning only). **No** xenon bar gauge; **no** raw `fuel_temp_c` readout.
* **On-diagram taps (not cards):** **T-hot** (`thot`) on hot leg — `pwTapThot`; **T-cold** (`tcold`) on cold leg — `pwTapTcold`. Hover → highlight ring on that leg. No separate Temperature card.
* Coolant flow: Cold inlet (right, lower) → downcomer → bottom plenum → up through core (color transition) → hot pool in head → hot outlet (right, upper) with moving dashed lines.

**Pressurizer**

* Vertical vessel off hot leg with animated level (matches sim exactly, including TMI void surge — level can **rise** while core inventory **falls**).
* Spray line from cold leg (post-RCP) with control valve + internal spray nozzle; spray effectiveness scales with RCP flow (no flow → no spray).
* Relief paths at top → containment/discharge plenum (iconic, not a detailed containment model); animated relief flow when PORV or safety valves vent.
* Two margin cards above/at PZR (merged pressurizer + relief — reduces clutter):

  * **PZR Pressurizer Card** (`data-highlight-id="pzr-pressurizer"`) — **two stacked sections** (collapsible; level section auto-expands during inventory/void transients):

    * **Pressure section:** Primary pressure (`primary_pressure`) — **system reference pressure** (see § Primary pressure model); Heater AUTO | ON | OFF + manual % slider; Spray AUTO + manual % / open slider. Hover highlights heater coils and spray nozzle on vessel.
    * **Level section:** Pressurizer level (`pzr_level`) — animated bar matching sim timing; shrink/swell not modeled on PZR (SG only). TMI: level may **rise** while inventory falls — level section should auto-expand under “What matters now”.
  * **Relief Valves Card**

    * **PORV**: **indicator reads `porv_indicator` (commanded, not actual)** — the TMI deception; manual OPEN | CLOSE commands in addition to auto actuation; block/isolation valve OPEN | CLOSE (`porv_block_open`) upstream of PORV. **Learning Mode**: § Deception dual — indicator **and** `porv_open`. **Realistic Mode**: indicator only; relief animation **only** if indicator open (Animation HR1).
    * **Safety valves**: mechanical only — open/reseat per pressure setpoints; **no operator command**; classic relief symbol + status indication.
    * Relief-to-containment flow animation when venting.

**Primary Loop — Flow & Inventory**

* Diagram emphasis: hot leg / cold leg flow coloring; inventory context for voiding and uncovery teaching.
* One card (replaces prior “flagged for addition”):

  * **Primary Flow & Inventory Card** (no PZR level — **on PZR Pressurizer card**; no subcooling — **on Power & Reactivity**)

    * **RCP** running status (`rcp_running`) — loop flow animation keyed to this in Realistic.
    * **Physics Overlay on (Learning):** `core_inventory_pct`, `primary_void_fraction` numeric readouts. Hidden when overlay off (infer inventory from PZR level + CVCS + subcooling). Charging/letdown detail lives in **CVCS embedded panel** only.

**CVCS (Chemical & Volume Control System)** — **`pwCvcsPanel` embedded panel** on the box + **external charging pump** (not margin cards)

* **Diagram representation**: labeled **CVCS equipment enclosure** with an **embedded control panel** (`pwCvcsPanel` — `data-highlight-id="cvcs"`) mounted **inside or on** the box face when space allows. **Charging pump** (`pwCvcsChargePump`) stays **outside** the box as a snail-shell pump — impeller spin is a clear running/flow status cue.
* **Cold-leg topology** (fixed):

```
RPV cold outlet ── letdown branch ──► [CVCS box + panel]
                      │
                      ├── [RCP] ── charging branch ◄── [CVCS box]
                      │         └── [Charging pump] ──► rejoins cold leg ──► SG
```

  * **Letdown takeoff** — plain pipe from cold leg **upstream of RCP** into box. **No valve icon** on pipe (letdown regulating valve implied inside box). Branch dashes when `instruments.letdown_flow` > 0.
  * **RCP** — between letdown tap and charging rejoin.
  * **Charging pump** — on charging leg between box and cold-leg tie-in **downstream of RCP**. START | STOP on **panel**; impeller ∝ `instruments.charging_flow` (Animation HR1).
* **`pwCvcsPanel` contents** (primary CVCS UI — avoids “blank box” syndrome):

  | Control / indication | Notes |
  |---------------------|--------|
  | Charging pump START \| STOP | Links hover to `pwCvcsChargePump` |
  | Charging setpoint + `instruments.charging_flow` | Setpoint vs indicated under AUTO |
  | Letdown setpoint + `instruments.letdown_flow` + **Isolate** | `set_letdown_flow {0}` |
  | CVCS AUTO \| MANUAL (`set_cvcs_auto`) | Make-up mode |
  | Boron analyzer (+ § Deception dual in Learning) | `boron_analyzer` / `boron_ppm` |
  | BORATE \| HOLD \| DILUTE | Gated on charging pump running |

  * Compact layout (two-column or stacked). If the box is too small at minimum scale, **popover on box click** carries the same panel — identical controls, not a different command set.
  * Hover charging setpoint → highlight charge leg, pump, PZR level region, cold leg (§ Hover & highlight).
  * **Not margin cards** — all Charging / Letdown / Boron UI lives in **`pwCvcsPanel`** only. Optional short leader from panel corner to `pwCvcsBoxAnchor` if the panel sits offset from the box graphic.

**Emergency Cooling**

* Diagram paths (distinct dashed/emergency styling):

  * **HPI** — high-pressure injection line into primary (cold-leg injection point). *Implemented.*
  * **AFW** — auxiliary feedwater line to SG secondary. *Implemented.*
  * **RHR** (Residual Heat Removal) — low-pressure cooldown loop SG → condenser. *`pwr_synoptic_prerequisites.md`.*
  * **LPI** (Low-Pressure Injection) — pumped injection into primary when pressure permissives allow. *`pwr_synoptic_prerequisites.md`.*
  * **Accumulators** (`pwAccumulatorTanks`) — **tank vessel graphic** (not a box). **`pwAccumulatorPanel` — diagram-embedded only (not a margin card)** mounted on or beside the tanks: **discharging** annunciation + `instruments.accumulator_flow` **only when** `accumulators_discharging` (passive — no operator open/close). Discharge line → **check valve** (`pwAccumulatorCheckValve`) → **cold-leg tee** (`pwAccumulatorInjection`). Idle: static tanks, no flow UI. Active: dashes on discharge line per `instruments.accumulator_flow` (Animation HR1). ECCS **commands** for accumulators do not exist — status stays on the tanks, not the Emergency margin card.
* **Emergency Cooling card** (margin card — **tabbed or accordion** to save vertical space; amber emergency chrome):

  * **Tabs:** **HPI** | **AFW** | **RHR/LPI** (RHR and LPI share one tab with two sub-sections). Default tab = first system in “What matters now” priority, else last-used or HPI. *(as built: **HPI/LPI** | **AFW** | **RHR** — HPI and LPI are one merged injection system.)*
  * **HPI tab:** AUTO | ON | OFF (`set_hpi`); `hpi_active` status. *(as built)* The **AUTO** arm issues `set_esf_auto { system: 'hpi', auto: true }` — re-arming the automatic low-pressure actuation after a manual On/Off override disarmed it.
  * **AFW tab:** START | STOP (`set_afw`) + throttle. *(as built)* Its **AUTO** arm likewise issues `set_esf_auto { system: 'afw', auto: true }` to re-arm the low-SG-level auto-start.
  * **RHR/LPI tab:** RHR AUTO | ON | OFF (`set_rhr`); LPI AUTO | ON | OFF (`set_lpi`); `rhr_active` / `lpi_active` + flow instruments on diagram lines. *(as built)* The RHR **Auto** button issues `set_esf_auto { system: 'rhr', auto: true }`, re-arming the RHR cooldown-permissive actuation after a manual On/Off disarmed it (a new `rhr` ESF arm in `pwr_control.js` — the button was previously a documented no-op).
  * Active tab/section **auto-selects** when that ECCS path is in priority tier or actuated. Hover HPI control → `pwHpiLine`, cold leg, Primary Flow card region.

**RCP (Reactor Coolant Pumps)**

* Single representative snail-shell pump on the **cold leg between the letdown pipe tap (upstream) and the CVCS charging tap (downstream)** — see CVCS topology.
* **Reactor Coolant Pumps Card**: `rcp_running` status, flow %, START | STOP controls. Hover highlights pump + impeller + flow path. Coastdown animation on trip (impeller slowing, flow decaying). Spray (PZR) and charging effectiveness scale with RCP flow.

**Steam Generator (Single SG)**

* One U-tube SG — **lowered** on canvas (shorter vessel than legacy full-plant SVG).
* Animated secondary level (matches sim exactly) + explicit U-tube top reference height (shows uncovering).
* **Shrink-and-swell**: SG level indication can move the wrong way briefly on rapid power changes (instrument model §8.4) before lag/filter catches up — animate to indicated level, not raw true level.
* Narrow operating range bar to the left of the SG.
* Main feedwater inlet from condensate/feed path (from below); AFW branch joins here.
* **Steam outlet at top-right edge** of SG shell → horizontal steam header rightward (see Turbine-Generator).
* Two cards:

  * **SG Heat Transfer & Level Card**: SG level (`sg_level` — animate to **indicated** level); secondary steam pressure (`instruments.steam_pressure`). Primary–secondary ΔT — **Physics Overlay only** (hidden by default).
  * **Steam & Flow Card**: Steam flow (`steam_flow`); main feedwater flow (`fw_flow`); feedwater demand control (`set_feedwater_flow`). *(as built, additionally)*:
    * **MSIV Open | Close** — `open_msiv` / `close_msiv`; Close carries the two-press CONFIRM? arm (M8 §5.4). Status readout shows SHUT and whether the SG safeties are lifting (`msiv_open`, `sg_safety_open`).
    * **Feed pump speed** — nudge ▼/▲ (`feed_pump_nudge { delta_pct }`) and a numeric set (`set_feed_pump_speed { pct }`) alongside `set_feedwater_flow`; commanded-speed readout plus a **“who’s driving”** line (three-element controller AUTO via the Automate tab, load coupling, or manual speed).

**Turbine-Generator**

* **BOP column (right):** turbine housing **centered over** square condenser; steam enters from the left (from SG header).
* **Generator** immediately to the right of turbine with a **short shaft** (no long extension).
* Animated blade lines (move proportional to RPM).
* **Main steam path (diagram hardware)**:

  1. **Turbine governor / control valve** — bow-tie + circle on the main steam line **between SG outlet and turbine inlet**. Throttle position driven by engine state (see Engine note below); animates with load changes. This is how real plants modulate steam admission to match generator load.
  2. **Steam dump / bypass valve** — bow-tie + circle on a **branch from the main steam header** (before or after the governor — downstream of SG, typically before turbine inlet) to the condenser. Position from `steam_dump_frac` / `set_steam_dump`; AUTO opens on high SG pressure (engine B2). Animated bypass flow when open.
* **Governor** (`pwr_synoptic_prerequisites.md`): `governor_valve_pct` in engine + lagged `governor_valve` instrument for Realistic board; diagram bow-tie animates from **instrument** in Realistic, may use true position in Learning.
* **Turbine-Generator Card**

  * Turbine RPM (`turbine_rpm`), electrical output (`mwe_output`).
  * Load setpoint (`set_steam_demand` {mwe}) with target vs actual.
  * **Governor valve** position % (once engine exposes it).
  * **Steam dump** AUTO | OPEN | CLOSED | % (`set_steam_dump`).
  * Turbine trip / low steam demand status (`steam_demand_low`, `turbine_tripped`).

**Condenser & Feed Return**

* **Square** condenser vessel directly under turbine (combined stack); steam inlet at top center (turbine exhaust + steam dump bypass).
* **Hotwell** — decorative water pool at the bottom of the condenser vessel (static or lightly animated water surface for realism). **No level indication, no sim state, not on Planned Additions list** — condenser is behavioral (DESIGN_COMPANION §8.15); a hotwell level would need inventory balance, feed-pump NPSH, and level control to teach anything `sg_level` + `fw_flow` do not already cover. Decorative only.
* Horizontal U-shaped cooling water path (in/out from right side, to/from cooling tower).
* **Condensate pump** — snail-shell pump, hotwell outlet → feed rail.
* **Feed pump** — snail-shell pump on feed rail to SG inlet (both pumps: impeller ∝ `fw_flow`; loss of feedwater stops animation).
* **Condenser Card**: Condenser vacuum (`condenser_vacuum`), cooling availability (`condenser_cooling_available`), vacuum trip threshold context.

**Cooling Tower**

* Small iconic representation (far right/bottom-right) showing source/sink of cooling water loop.

**Plant Status (compact strip or corner card)**

* `station_blackout` — SBO annunciation context.
* Battery charge % and time remaining when modeled.
* Scrammed / melted / destruction cause when applicable (Learning Mode shows true cause alongside trip annunciation where they differ).

### Alarm Integration (M1 §9 → diagram)

Alarms read instruments (HR1) — a failed sensor means a missing or wrong annunciation, identical to a real board. Hover on an active alarm tile highlights the diagram component and linked margin card or embedded panel (§ Hover & highlight).

|Alarm (representative)|Instrument / status|Highlights on diagram|
|-|-|-|
|REACTOR TRIP|`rps_scrammed`|Rods driving in, reactor card|
|HI FLUX|`power_range`|Core, Power card|
|HI TAVG|`tavg`|Core outlet / hot leg|
|PZR PRESS HI / LO / LO LO|`primary_pressure`|Pressurizer, Pressure card|
|PORV OPEN|`porv_indicator`|PORV — **may NOT annunciate when indicator stuck closed (TMI)**|
|LO SUBCOOL / SUBCOOL LOST|`subcooling_margin`|Core — `pwSubcoolBar` on Power & Reactivity card (+ `pwTapSubcool` hover)|
|PZR LVL HI / LO / LO LO|`pzr_level`|Pressurizer level|
|ROD INS LIMIT|`rod_at_limit`|Control bank bar|
|SG LVL HI / LO / LO LO|`sg_level`|SG secondary|
|RCP TRIP|`rcp_running`|RCP impeller|
|HPI ACTIVE|`hpi_active`|HPI injection path|
|SBO|`station_blackout`|Plant status|
|TURB TRIP|`steam_demand_low`|Turbine / steam path|
|COND VAC LO / TRIP|`condenser_vacuum`|Condenser|

**TMI teaching note**: During stuck-open PORV + stuck-closed indicator, PORV OPEN alarm stays clear, pressurizer level rises, inventory falls, and **subcooling margin** erodes — **`pwSubcoolBar`, PZR Pressurizer card** (level section expanded), and **Relief / `pwPorv`** must be visible together (§ “What matters now” drives the same trio). **Realistic Mode**: lying indicator, **no relief animation**, no `porv_open` readout. **Learning Mode**: § Deception dual on PORV **plus** optional relief animation from true `porv_open`.

### Scope Notes (relationship to M8)

* **Vital-few gauge strip**, **alarm panel**, **strip chart**, and **instructor** remain in the shell per M8 but are wired to this single diagram; the old four **control sections** above the synoptic and per-view PD control rows are **retired**.
* **PWR — retire legacy plant display:** When `plant_id === 'pwr'`, **remove** the left **4-view switcher**, all legacy `fp*` / `sec*` / `loop` partial-loop SVG render paths (`pwr_full_plant_diagram_v2.html`, primary/secondary loop SVGs), and per-view PD control rows. One synoptic stage fills the plant-display area. **RBMK/BWR** keep the existing plant-display until their own diagram specs exist.
* Parameters duplicated in the vital-few strip (Power, Pressure, Tavg, PZR Level, SG Level, Subcooling) need not be repeated on cards unless the diagram is shown standalone.
* **Learning Mode** here = M8 **Education** mode (terminology alias). **Realistic / Learning** mode switch is separate from **Physics Overlay** (Learning only). Overlay off = contextual cues + deception duals; overlay on = full § Physics Overlay fields.
* **Pause** follows M8 shell play/pause (`metadata.running`). Diagram obeys § Pause freeze; sim clock stops pulsing per M8.
* Click/hover `data-highlight-id` on every major component, margin card, and embedded panel for instructor highlight lookup.

### Modes Summary

* **Realistic Mode**: **Indications and status only**; Animation HR1; no contextual cues, overlay, or physics teaching; boron from **analyzer**; alarms always full red/amber.
* **Learning Mode (overlay off)**: Indications + § Core teaching readouts (power, SUR, subcooling, T-avg, leg ΔT) + § Contextual indicators when relevant + § Deception duals; glows; minimal clutter.
* **Learning Mode (overlay on)**: Above plus § Physics Overlay fields (ρ, period, inventory, void, P–S ΔT, ghosts, extra teaching animation).

### Engine pre-requisites (Opus — not in this file)

All engine, instrument, and command work required before UI implementation lives in **`Blueprint/pwr_synoptic_prerequisites.md`**: §8.8 additions, RHR/LPI/accumulators/governor physics, AUTO paths, acceptance gates, and Fable handoff checklist. **Fable:** assume that gate has passed; wire only `snapshot.instruments`, status booleans, and `control_state`.

### Primary pressure model (v1 — engine truth)

The sim uses **one primary pressure** (`pressure_mpa` → `instruments.primary_pressure`) for the whole liquid-filled loop, evolved via the **pressurizer** energy balance (heaters, spray, relief, surge). It does **not** compute pressure in individual pipes or before/after the RCP.

| Question | v1 answer |
|----------|-----------|
| Pressure on hot leg vs cold leg? | **Same** (uniform primary reference). |
| RCP suction/discharge ΔP? | **Not modeled** — RCP affects **`flow_frac`** and coastdown, not line pressure. |
| Spray effectiveness? | Scales with **`spray_flow_frac × flow_frac`** — no flow, no spray from cold leg. Not a local pressure at the takeoff. |
| CVCS charging/letdown? | Affects **inventory** (`dm_dt`); not driven by leg pressure differential in v1. |

**Teaching implication:** PZR pressure on the **PZR Pressurizer card** (pressure section) is the **RCS reference**. Do **not** show leg or RCP pressure taps in v1. Leg **temperature** taps are the right spatial detail for now.

**Large LOCA:** In scope once `pwr_synoptic_prerequisites.md` §1 gate passes (LPI + accumulators live).

---

## Appendix A — PWR Implementation Pack (v1)

**Scope:** PWR only. RBMK/BWR keep the existing plant-display until their own diagram specs exist. Do not regress multi-plant tests when `plant_id === 'pwr'`.

### A.1 Card placement — spatial layout (reference schematic)

**Reference image:** `inbox/Schematic-diagram-of-a-pressurized-water-reactor.png`

**Spatial sketch** (margin cards in whitespace; **embedded panels on diagram**; chart/alarms below):

```
┌─ Vital-few strip ─────────────────────────────────────────────────────────────┐
│  [Rod Control]──────┐                              ┌────[Plant Status]       │
│  [Power/Rx]─────────┤    ┌PZR┐  steam header ──►  │      ┌──[Turb-Gen]──┐   │
│  (subcool BAR on Power card; T-hot/T-cold taps)    │      │ Turb │ Gen │    │
│                     │    └───┘    [SG]┘           │      └──┬───┴──┬──┘   │
│  [Primary Inv]──────┼──►[RPV]════════╪═══════════╪═════════│ Cond │      │
│  [Emergency]────────┤    cold leg [RCP]           │         └──────┘      │
│                     │    ┌──────────────┐  (Chg)   │    [Condenser]─[Twr]  │
│                     │    │ CVCS │panel│──┼──pump───┤                       │
│                     │    └──────────────┘          │                       │
│                     │    (Acc tanks + embed panel)   │  [SG Level][Steam]  │
│                     │  [PZR Press+Lvl][Relief]       [RCP card]           │
└─────────────────────┴───────────────────────────────────────────────────────┘
  Legend: [brackets] = margin cards; (Chg pump) = pwCvcsChargePump on pipe;
           CVCS │panel│ = pwCvcsPanel inside/on box — NOT margin cards.
┌─ Strip chart (~62% width) ─────────────────────┬─ Alarm panel (~38%) ──────┐
```

**Placement rules**

| Rule | Detail |
|------|--------|
| **Adjacency first** | Cards as **close as possible** to their component; high-priority systems win contested margin space (§ Design philosophy). |
| **Anchor zones** | Each margin card has `data-highlight-id`, preferred `data-anchor` side, and a **slide range** along that margin (§A.1b % are zone centers — nudge within ~±5–8 % when crowded). |
| **No overlap** | Never cover vessels, valves, pipes, embedded panels, or flow animation. Stack max **2 deep** in a zone, then slide. |
| **Clustering** | Group related **margin** cards (PZR ×2: Pressurizer + Relief; SG ×2) in the same zone. CVCS and accumulators use **embedded panels** — never clustered as margin cards. |
| **Leaders** | Margin cards use dashed leaders; **prominent on hover** (§ Hover & highlight). Embedded panels may omit leaders if mounted on the component. |
| **Embedded panels** | **Not margin cards.** `pwCvcsPanel` on CVCS box; `pwAccumulatorPanel` on tank graphic — anchored to SVG bbox / `foreignObject`. |
| **Sensor taps** | §A.2c — T-hot, T-cold, PORV; subcooling on Power card bar. |
| **Chart reservation** | `.synoptic-stage` minus vital-few minus `.synoptic-trends` (min **220 px**). |
| **SCRAM** | Rod card + shell header (M8). |
| **What matters now** | Soft pulse + **auto-expand** linked card/section + contextual cues (e.g. TMI → subcool bar, PZR level section, PORV). |

#### A.1b Card anchor table (PWR v1 — tune % in implementation)

Percentages are **approximate** relative to `.synoptic-stage`; adjust in CSS/JS until leaders look clean at 1280×800.

| Surface | Type | `data-highlight-id` | Placement | Leader target |
|---------|------|---------------------|-----------|---------------|
| Rod Control | margin card | `reactor-rods` | left ~(2, 38) | `pwRpvAnchor` |
| Power & Reactivity | margin card | `reactor-power` | left ~(2, 22) | `pwCoreAnchor` |
| Primary Flow & Inventory | margin card | `primary-inventory` | bottom-left ~(18, 72) | `pwColdLegAnchor` |
| **`pwCvcsPanel`** | **embedded** | `cvcs` | on/in `pwCvcsBox` face | `pwCvcsBoxAnchor` (optional) |
| **`pwCvcsChargePump`** | **diagram** | `cvcs` | charging leg, outside box | `pwCvcsChargePumpAnchor` |
| **`pwAccumulatorPanel`** | **embedded** | `accumulators` | on `pwAccumulatorTanks` | `pwAccumulatorsAnchor` |
| Emergency Cooling | margin card (tabbed) | `emergency-cooling` | left ~(2, 72) | `pwHpiLineAnchor` |
| PZR Pressurizer | margin card (2 sections) | `pzr-pressurizer` | top ~(36, 3) | `pwPzrAnchor` |
| Relief Valves | margin card | `pzr-relief` | top-right ~(48, 3) | `pwPorvAnchor` |
| RCP | margin card | `rcp` | bottom ~(36, 82) | `pwRcpAnchor` |
| SG Heat Transfer & Level | margin card | `sg-level` | left ~(48, 42) | `pwSgAnchor` |
| Steam & Flow | margin card | `sg-steam` | top ~(52, 8) | `pwSgSteamOutletAnchor` |
| Turbine-Generator | margin card | `turbine-generator` | right ~(88, 28) | `pwTurbineAnchor` |
| Condenser | margin card | `condenser` | right ~(88, 52) | `pwCondenserAnchor` |
| Plant Status | margin card | `plant-status` | top-right ~(92, 4) | `pwPlantStatusAnchor` |

**Counts:** **12 margin cards** only. **`pwCvcsPanel`** + **`pwAccumulatorPanel`** are **embedded** (excluded from the 12). **`pwCvcsChargePump`** is diagram hardware, not a card.

---

### A.2 Component ID manifest (template)

**Conventions**

* **Prefix** *(as built)*: **two prefixes**, not one. Component **group wrappers** use a `g*` prefix
  (`gCore`, `gRods`, `gHotLeg`, `gColdLeg`, `gSpray`, `gPzr`, `gRelief`, `gSg`, `gSteamHeader`, `gGov`,
  `gDump`, `gTurbine`, `gCondenser`, `gTower`, `gFeed`, `gAfw`, `gRhr`, `gHpi`, …); `pw*` is kept for
  the **SVG root** (`pwLoop`) and the **inner animated/addressable elements** (`pwRodFill`,
  `pwPzrWater`, `pwPorv`, `pwSgWater`, `pwHotLegFlow`, `pw*Anchor`, taps, …). Both replace the legacy
  `fp` / PD partial-SVG IDs.
* **Root:** `<svg id="pwLoop" data-plant="pwr">` inside the synoptic stage.
* **Groups** *(as built)*: Each major component is a `<g id="g…" data-highlight-id="…" class="diagram-node">` wrapper.
* **Renderer** *(as built)*: `ui/diagram/pwr_synoptic.js` — `ui/app.js` mounts it via
  `RD.PwrSynoptic.mount(host, ctx)` and forwards every snapshot to `RD.PwrSynoptic.render(s)` — the
  sole writer of diagram DOM state; respects **Animation HR1** and mode. (The earlier
  `renderPwDiagram` / `pwr_diagram.js` naming was not built.)

**Manifest table** — all rows **live** after `pwr_synoptic_prerequisites.md`; no placeholder styling.

|highlight_id|SVG group / element IDs|Snapshot source (HR1 unless noted)|Animation / driver|Card(s)|Status|
|-|-|-|-|-|-|
|`reactor-rods`|`pwRodFill`, `pwRodCap`, `pwRodShutdown` (optional)|`control_state.rod_groups[]`|`pwRodFill` height ∝ control bank inserted %; shutdown bar on scram|Rod Control|**live**|
|`reactor-power`|`pwCoreGlow`, `pwSubcoolBar`, `pwTapSubcool`, `pwXenonChip`, `pwFuelStatus` (contextual)|`instruments.power_range`, `tavg`, leg ΔT, `subcooling_margin`, SUR; contextual xenon/fuel from `true_state`; ρ/period overlay-only|Cherenkov Learning; xenon/fuel chips contextual; bar HR1 in Realistic|Power & Reactivity|**live**|
|`reactor-temperature`|`pwHotLeg`, `pwColdLeg`, `pwTapThot`, `pwTapTcold`|`instruments.thot`, `tcold` on taps; `tavg`, ΔT on Power card|Leg gradient + tap hover ring|On-diagram taps only|**live**|
|`primary-inventory`|`pwHotLeg`, `pwColdLeg` flow classes|`instruments.rcp_running`; void + inventory **overlay-only**|Loop dashes from `rcp_running`|Primary Flow & Inventory|**live**|
|`pzr-pressurizer`|`pwPzrHeater`, `pwPzrSprayValve`, `pwPzrSprayMist`, `pwPzrWater`, `pwPzrSurface`|`instruments.primary_pressure`, `instruments.pzr_level`, heater/spray commands|Heater glow; spray mist; level animation|PZR Pressurizer (pressure + level sections)|**live**|
|`pzr-relief`|`pwPorv`, `pwPorvBlock`, `pwSafetyValve`, `pwReliefFlow`|`instruments.porv_indicator`; § Deception dual `porv_open` (Learning); `control_state.porv_block_open`|PORV bow-tie per **indicator**; relief anim: Realistic per indicator only; Learning may use `porv_open`|Relief Valves|**live**|
|`cvcs`|`pwCvcsBox`, `pwCvcsPanel`, `pwCvcsChargePump`, `pwCvcsChargeLeg`, `pwCvcsLetdownBranch`|Panel: charging/letdown setpoints + indications, AUTO, boron; pump START/STOP on panel|Spin/dashes ∝ `instruments.charging_flow` / `letdown_flow`; panel on box face|**embedded panel**|**live**|
|`emergency-cooling`|`pwHpiLine`, `pwHpiFlow`, `pwAfwLine`, `pwAfwFlow`, `pwRhrLoop`, `pwLpiLine`|HPI/AFW/RHR/LPI status + flow instruments|Tabbed **Emergency card** (HPI \| AFW \| RHR/LPI)|Emergency Cooling|**live**|
|`accumulators`|`pwAccumulatorTanks`, `pwAccumulatorPanel`, `pwAccumulatorCheckValve`, `pwAccumulatorInjection`, `pwAccumulatorFlowLbl`|`accumulators_discharging`, `instruments.accumulator_flow`|Status strip on tanks; discharge UI only when active|**embedded panel**|**live**|
|`rcp`|`pwRcpRotor`|`instruments.rcp_running` (+ `rcp_flow` if instrument added)|Spin/coastdown from status/flow instrument only|RCP|**live**|
|`sg-level`|`pwSgWater`, `pwSgSurface`, `pwSgUtubeRef`|`instruments.sg_level`, `instruments.steam_pressure`; P–S ΔT overlay-only|Level to **indicated** SG level (shrink/swell)|SG Heat & Level|**live**|
|`sg-steam`|`pwSgSteamHeader`, `pwSgSteamOutletAnchor` (top-right nozzle)|`instruments.steam_flow`, `instruments.fw_flow`|Steam dash ∝ `steam_flow`; header exits SG **top-right**|Steam & Flow|**live**|
|`turbine-generator`|`pwGovValve`, `pwSteamDump`, `pwTurbineRotor`, `pwGenerator`, `pwShaft`|`instruments.governor_valve`, `control_state.steam_dump_pct`, `instruments.turbine_rpm`, `instruments.mwe_output`, `control_state.steam_demand_mwe`|Gov bow-tie from **instrument** in Realistic|Turbine-Generator|**live**|
|`condenser`|`pwCondenser` (square), `pwCondWater` (decorative), `pwCondPump`, `pwFeedPump`|`instruments.condenser_vacuum`, `instruments.condenser_cooling_available` (or status), `instruments.fw_flow`|Hotwell **no level**; pumps ∝ `fw_flow` instrument|Condenser|**live**|
|`cooling-tower`|`pwCoolingTower`, `pwCwFlow`|`instruments.condenser_cooling_available` (or status)|CW dashes when cooling **indicated** available|Condenser (readout)|**live**|
|`plant-status`|—|`instruments.station_blackout`, `rps_scrammed`|—|Plant Status|**live**|

**Add rows** when new hardware ships; never reuse IDs from legacy `fp*` / `sec*` diagrams in the new renderer.

#### A.2b Anchor points (`pw*Anchor` — leader targets)

Each anchor is a `<circle class="anchor">` on the diagram node (not inside card HTML). Card leaders and resize logic use these IDs.

| Anchor ID | On component |
|-----------|----------------|
| `pwRpvAnchor` | Reactor vessel, mid-left |
| `pwCoreAnchor` | Core / flux reference |
| `pwHotLegAnchor` | Hot-leg pipe at vessel outlet |
| `pwColdLegAnchor` | Cold-leg pipe at vessel inlet |
| `pwPzrAnchor` | Pressurizer shell center |
| `pwPorvAnchor` | PORV body on relief line |
| `pwCvcsBoxAnchor` | CVCS box center |
| `pwCvcsLetdownBranchAnchor` | Letdown tap on cold leg |
| `pwCvcsChargePumpAnchor` | Charging pump impeller (on diagram — charging leg between CVCS box and cold-leg tie-in) |
| `pwRcpAnchor` | RCP impeller center |
| `pwSgAnchor` | SG shell center-left |
| `pwSgSteamOutletAnchor` | **Top-right** steam nozzle |
| `pwGovValveAnchor` | Governor valve on steam line |
| `pwTurbineAnchor` | Turbine center |
| `pwGeneratorAnchor` | Generator center |
| `pwCondenserAnchor` | Square condenser center |
| `pwHpiLineAnchor` | HPI injection tee |
| `pwAccumulatorsAnchor` | Accumulator tank group center |
| `pwAccumulatorInjectionAnchor` | Cold-leg tee (downstream of check valve) |
| `pwLpiLineAnchor` | LPI injection tee |
| `pwPlantStatusAnchor` | Top-right margin (optional) |

#### A.2c On-diagram sensor taps (physical location)

Small `.sensor` groups on the SVG (tap circle + dashed leader + compact label). **Hover** tap → pulse ring on circle + pipe segment highlight (§ Core Visual Rules). Consider moving more indications off cards onto taps over time; v1 minimum set:

| Tap ID | Location on plant | Reading | On card? |
|--------|-------------------|---------|----------|
| `pwTapThot` | Hot leg (core outlet) | `instruments.thot` | **No** — tap only |
| `pwTapTcold` | Cold leg (core inlet) | `instruments.tcold` | **No** — tap only |
| `pwTapSubcool` | Hot leg (core outlet) | *(hover anchor only — links to `pwSubcoolBar`)* | Subcooling bar on Power & Reactivity card |
| `pwTapPorv` | PORV body | `instruments.porv_indicator`; § Deception dual `porv_open` (Learning) | Also on Relief card |
| `pwTapSteamFlow` | Main steam header | `instruments.steam_flow` | Optional — else Steam & Flow card only |
| `pwTapVac` | Condenser | `instruments.condenser_vacuum` | Optional — else Condenser card only |

**Power & Reactivity card** holds **power**, **SUR**, **T-avg**, leg **ΔT**, **§ Subcooling margin bar**; contextual **xenon** / **fuel** text chips; ρ/period only with Physics Overlay. **T-hot** / **T-cold** leg taps only. **`pwTapSubcool`** highlights hot leg and bar together on hover.

---

### A.3 Acceptance bullets (PWR diagram + cards v1)

Gate before retiring legacy PD views for PWR. Run with `plant_id: pwr`, `initial_state: hot_full_power`, unless noted.

1. **Spatial layout:** At 1280×800, chart + alarms **bottom ~38–40 %**; diagram stage above. **12 margin cards**; **`pwCvcsPanel`** + **`pwAccumulatorPanel`** embedded on diagram (§A.1b); **`pwCvcsChargePump`** on pipe; no overlap; leaders prominent on hover.
2. **Legacy PD retirement (PWR):** Single full-plant synoptic only — **no** left 4-view switcher (Diagram / Primary / Secondary / All); **no** legacy `fp*` / `sec*` / `loop` SVG paths; **no** per-view PD control rows. Delete or bypass dead PWR plant-display code in `ui/app.js` (and related partials). RBMK/BWR legacy PD unchanged.
3. **Geometry:** SG steam leaves **top-right**; turbine **over** square condenser; generator **beside** turbine on short shaft; cooling tower in open margin — matches § Diagram geometry v2.
4. **HR1 — Realistic Mode:** Every readout matches `snapshot.instruments` or status. **Zero** `true_state` in numbers or motion (Animation HR1 checklist) — spot-check: stuck PORV + closed indicator → **no relief animation**; accumulator idle → **no** discharge dashes or flow label.
5. **Subcooling bar:** Zone colors (green > 11 °C, yellow 11–0, red < 0); cursor tracks `instruments.subcooling_margin`; large numeric beside bar; ghost at `subcooling_c` only with **Physics Overlay on** + deception lesson.
6. **HR1 — Learning Mode:** § Deception duals (PORV, boron, active instrument failures). **No** always-on physics clutter — contextual xenon/fuel only when relevant. PORV dual + relief animation from `porv_open` during TMI (overlay may add ghost animation).
7. **Commands:** Every margin-card and **embedded-panel** control issues the correct `CONTEXT.md` §6.7 command and reflects in the next snapshot (`test/run_e2e_controls.js` PWR paths, or equivalent).
8. **SCRAM:** Two-step cover on Rod card (and header SCRAM if present) trips reactor; shutdown bank animates in; `rps_scrammed` true.
9. **CVCS:** **`pwCvcsPanel`** embedded on box (not margin cards); **`pwCvcsChargePump`** on charging leg outside box; animation from flow instruments only.
10. **CVCS isolate:** Letdown **Isolate** sets flow to 0; branch animation stops; inventory response unchanged vs slider to 0.
11. **Charging pump:** OFF stops charge flow animation and blocks borate/dilute effect on `boron_ppm`.
12. **PZR spray:** With RCP stopped, spray command produces **no** mist animation (spray scales with flow).
13. **TMI deception:** **Realistic** — closed indicator, silent alarm, **no relief animation**, **subcooling bar** erodes, PZR level may rise. **Learning** — PORV dual + optional relief from `porv_open`.
14. **Steam dump:** Bypass path animates from steam-dump **instrument/status** only in Realistic.
15. **Learning vs Realistic:** Realistic = indications/status only. Learning (overlay off) = core readouts + contextual cues + deception duals. Learning (overlay on) = full § Physics Overlay layer.
16. **Physics Overlay:** Toggle visible **only in Learning**; off hides inventory, void, ρ, period, P–S ΔT, ghosts; on shows them.
17. **Contextual xenon/fuel:** No xenon bar; text chips only when xenon/fuel operationally relevant or “What matters now”; **no** raw `fuel_temp_c`.
18. **PZR merge:** Single **PZR Pressurizer** card with pressure + level sections (not separate margin cards).
19. **Emergency tabs:** HPI \| AFW \| RHR/LPI accordion/tabs; active tab follows ECCS priority/actuation.
20. **What matters now — auto-expand:** Priority tier expands affected cards/sections (e.g. PZR level section, Emergency HPI tab) and shows contextual xenon/fuel when linked.
21. **Engine gate:** `pwr_synoptic_prerequisites.md` §1 complete — snapshot has all instruments/status listed there; diagram rows below are live.
22. **Accumulators:** **`pwAccumulatorPanel` embedded** on tanks (not margin card); discharge line + check valve + tee; flow UI **only while** `accumulators_discharging`.
23. **Hover & highlight:** Card/**embedded panel** hover → **prominent leader** + node; control hover → physical components + related indications; `pwPorv` ↔ Relief card; `pwTapSubcool` ↔ `pwSubcoolBar`.
24. **What matters now (TMI):** With stuck PORV failures active, soft pulse on **`pwSubcoolBar`**, **PZR Pressurizer card** (level section expanded) + `pwPzrWater`, **Relief** margin card + `pwPorv` — not full-diagram flash.
25. **Regression:** `PWRScenarioTests` **11/11**; RBMK/BWR legacy PD unchanged.
26. **Save/restore:** Mid-transient save/restore within instrument lag tolerance.
27. **Pause:** With `metadata.running === false`, centered **`SIMULATION PAUSED`** overlay visible on the synoptic stage; **zero** diagram motion (flow, spin, levels, spray, leaks, pulses) until play resumes.

---

