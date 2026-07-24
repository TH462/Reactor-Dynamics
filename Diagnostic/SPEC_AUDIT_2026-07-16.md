# Spec-Sheet & Architecture Audit — 2026-07-16

> **RESOLUTION (same day).** Owner ruling: turbine trips and relief-valve logic are control
> decisions — they live in the control layer, reading instruments; the learning diagram's
> physics numbers are the only sanctioned UI true-state display. **All findings below were
> fixed** in the follow-up pass (engines keep valve hydraulics; pop/reseat + turbine-trip
> actuations moved to per-plant control data with setpoints derived from engine config; engine
> suites emulate them via an instrument-reading autoM4 harness). Also fixed: §2.2 condition
> gates (instruments-only, M7-asserted), §2.3/§2.4 UI + ORM-annunciator instrument sourcing,
> §2.5 AFW hold senses the sg_level instrument, §2.6 imbalance annunciator reads indicated
> power, §3.1 severity mapping (+ the inverted degraded_hpi slider label), §3.2 inaction
> branch ordering, §3.3 test-runner automation/trip_blocks/condition checks, §3.4 BWR dead
> setpoints removed + RCIC 45 alignment, §3.6 degraded_hpi/afw_failure retyped
> physics_parameter, §4 hardcodes (charging-pump busyNote, recirc 48, RBMK void knee/ceiling,
> sync taus), §5 dead code and stale references (incl. the manual_procedures startup text and
> the stale `dhr-on` expectation in verify_e2e_ui). Deliberately left: §3.5 latched ESF
> actuations (intentional; RHR gained an ESF arm so its Auto button re-arms), the `clip()`
> duplication (closure-capture), `buildTraining` naming, and `dampInstruments` (display-only
> by design, documented in M8). Full battery green at/above baseline after the pass
> (campaign 36/36 · 1313, ops 53/66, synoptic 55/55, verify_e2e_ui PASS, M7 OK with teeth).

Full sweep of `Blueprint/` specs against the as-built code, plus an architecture-conformance
review (hard rules HR1–HR7). Eight parallel read-only audits (one per spec area + a dedicated
layering hunt), findings verified against source before recording. Doc fixes were applied in
the same pass; **code findings below are reported, not fixed** — each needs either a design
ruling or a deliberate change.

---

## 1. The question that prompted the audit: automation in the UI layer

**Resolved — no residual violation.** The stage 1–11 control-layer rework genuinely moved all
plant automation in-stack. `ui/app.js` and `ui/diagram/pwr_synoptic.js` contain no closed-loop
controllers, no PID math, no setpoint-comparison loops driving commands, and no direct engine
access. Every automation surface (Automate tab, rod AUTO/MAN, three-element feed, ESF arms)
renders from `snapshot.automation` / `control_state` and issues single commands through
`service.handleCommand` (HR5 path intact). The only UI-side "loops" are cosmetic: the SCRAM
two-step confirm timer, the RCP coastdown animation, a xenon-slope EMA for a teaching chip.
The 1/M panel does least-squares math but reads `instruments.source_range` (HR1) and issues no
commands — an operator scratchpad, which is what it should be.

One residue: `ui/shell.html:312-314` still carries the orphaned comment block for the deleted
UI-side `auto_control.js` (no `<script>` follows it). Cleanup, not a violation.

---

## 2. Confirmed layering / hard-rule findings (need a ruling or a fix)

### 2.1 In-engine turbine trips read true state — all three engines (HR2/HR1/HR7)
`pwr_steam_generator.js:135,149`, `bwr_vessel.js:122,134`, `rbmk_thermal.js:116,130` — the
engine autonomously trips the turbine on **true** `condenser_vacuum_kpa` / `turbine_rpm`
("if vacuum low / rpm high → trip"). HR7 names "tripped turbine" a command-level event that
belongs in the Control Layer; the operator-injected `turbine_trip` failure *is* routed through
M4, so the two paths are inconsistent. Mitigating: overspeed/loss-of-vacuum trips are
autonomous mechanical turbine protections — arguably analogous to the spring safety valves HR7
legitimately leaves in the engine — and the trip never scrams the reactor from the engine.
**Ruling needed:** declare them engine-side mechanical protections (document the exception in
CONTEXT/HR7), or move them to M4 actuations reading vacuum/rpm instruments.

### 2.2 Control-kernel condition gates fall back to true state (HR1)
`control_kernel.js:389-398` `_evaluateCondition` reads `lastInstruments` first (good) but on a
miss falls back to `engine.getTrueState()`, and derives `*_unavailable` conditions from true
`*_running` flags. Affected gates: BWR ADS `hpci_unavailable`, BWR LPCI `ads_open`, PWR trip
gate `sr_energized`. M4 §2 says the only sanctioned true-state exception is `__true_flow__`.
A stuck "HPCI running" indication would not fool the ADS gate the way HR1 demands. Also: the
`return true` permissive default means an unresolvable condition leaves a trip armed
unconditionally. **Fix direction:** expose these as status instruments and make the fallback
(or at least the default) conservative/explicit.

### 2.3 UI schematic colors driven by true state where failable instruments exist (HR1/HR4)
`ui/app.js:2484` (RBMK MCP status from `true_state.channel_flow_pct`) and `ui/app.js:2543`
(BWR recirc status from `true_state.recirc_flow_pct`). Both have lag/noise/failure-capable
instrument twins (`channel_flow`, `recirc_flow`) already used by the adjacent gauges — a stuck
flow instrument would leave gauge and schematic disagreeing in the direction that breaks the
deception lesson. One-line fixes: read `s.instruments.*`. (Many other status booleans in the
grid/schematics read `true_state` where the twin is an unfailable pass-through — letter-only
inconsistency, zero live impact; fix opportunistically.)

### 2.4 RBMK ORM alarm flag computed from true ORM (HR1)
`rbmk_engine.js:197`: `orm_alarm_active = orm_equiv_rods < orm_min` (true state), exported via
`_instrExtras()` as a status reading. The Chernobyl `orm_indicator_failure` corrupts only the
`orm_display` instrument, so a consumer of the status boolean would still alarm while the
operator's display reads safe — bypassing the very lie the scenario teaches. Ensure the
operator-facing annunciator is an M4 alarm on `instruments.orm_display` and treat
`orm_alarm_active` strictly as true-state (rename or stop exporting it as a reading).

### 2.5 AFW level-hold controller inside the engine, reading true level (HR1/HR2 borderline)
`pwr_steam_generator.js:35-40` modulates delivered AFW flow proportionally to **true**
`sg_level_pct` toward `afw_level_target`. It is closed-loop level control living in the engine
(the spec frames AFW actuation as M4's job reading the instrument). The old hard-cutoff form
had the same true-state read, so this is a pre-existing tension amplified into a full
controller. Candidate for relocation to a control-layer channel; at minimum document as a
sanctioned engine-side regulation like heater/spray.

### 2.6 `sg_imbalance_active` annunciator derived from true power (HR1, minor)
`load_mode.js:52-53` computes the imbalance from true `_P`; the UI shows a filling/draining
annunciator from it. A coaching indicator, not a protective alarm — minor, but inconsistent.

---

## 3. Correctness bugs (real behavior, not layering)

### 3.1 Failure-severity default mapping is wrong for inverted metas, and layer/engine diverge
`control_kernel.js:208`: fallback severity = `severity_meta.default / (severity_meta.max || 1)`.
For BWR `early_battery_failure` (`min:100, max:25, default:60, invert:true`) that yields
**2.4, unclamped** (correct ≈ 0.47). And the same call forwards `1.0` to the engine when no
severity was supplied (`:213`), so the layer's locally-held severity and the engine's applied
severity diverge. Fix: one severity-mapping function (respecting `invert`, clamped) used for
both the local record and the engine forward.

### 3.2 `inaction` trigger doesn't verify inaction
`instructor_layer.js:373-376` checks only elapsed time; it never confirms no relevant action
occurred. Works today only because sibling `operator_action` branches are listed first and win
in the same pass. A standalone `inaction` beat would fire on time regardless of operator
activity. Latent contract gap vs M6 §5.

### 3.3 Test runner cannot catch a dropped `automation` section
`test_runner.js:61-62` `data_contract` top-level list omits `automation`; `:75` checks
`rps_state` shape but not `trip_blocks`. Both are mandatory contract sections since the rework;
`simulation_service.js:284` could regress silently. (Flagged in the M7 doc as a known gap.)

### 3.4 Two sources of truth for BWR RCIC start level
Engine config `rcic_start_level: 50.0` is consumed only by the engine's own flagship test
harness, while the shipping actuation uses **45.0** (`bwr_control.js:32`). The acceptance suite
emulates RCIC start at a different threshold than the real control layer. Same pattern:
`ads_level`, `hpci_start_level`, `battery_low_pct` sit **dead** in `bwr_config.js` while the
live setpoints are control-layer data — dead duplicates that will silently drift.

### 3.5 One-shot latched actuations (confirm intent)
PWR AFW and SR-re-energize actuations declare no `reset_below`, so once fired they latch until
a `set_esf_auto` re-arm or MANUAL takeover (`control_kernel.js:328`). Likely intentional
(latching ESF); asymmetric with the reset-bearing PORV/HPI actuations — worth a confirming
comment in the data if intended.

### 3.6 `degraded_hpi` / `afw_failure` typed `command_override` but intercept nothing
`pwr_control.js:123-129`: `degraded_hpi` matches its intercept then falls through with no
transform (real effect comes from the generic engine forward of `hpi_flow_multiplier`);
`afw_failure` has no `intercepts` at all. The typing is fictitious — both are effectively
`physics_parameter`. (M4 §7 already self-flags this; still unresolved.)

---

## 4. Hardcoding (HR3) and duplication

- `control_kernel.js:786-787` `_stepBang` hardcodes the PWR-only field
  `control_state.charging_pump_running` inside the generic bang stepper — plant data leaked
  into kernel machinery. (Rod command literals in `_manualOverrideScan`/`_interlockBlocking`
  are the same class but defensible as shared vocabulary.)
- `bwr_engine.js:329` `set_recirc_flow` clamps to a literal 48 (duplicated as `uMax: 48` in
  the control channel) — unnamed ceiling, should be config.
- RBMK: literal `0.30` void-amplification onset in `rbmk_kinetics.js:26` (won't track a
  `void_ref` retune), `0.90` void ceiling repeated ×4, turbine sync tau `0.5` and SUR EMA tau
  `2.0` hardcoded.
- `clip()` defined in the kernel and re-defined in all three plant modules.

---

## 5. Dead code / stale references

| Where | What |
|---|---|
| `pwr_config.js:6-7` | Header comment claims protection data "lives in pwr_protection.js" — no such file; it's `layers/control/pwr_control.js` |
| `pwr_config.js:67` | `boron_rate: 5.0` marked legacy, never referenced |
| `pwr_engine.js:758` / `pwr_primary.js:76` | `safety_injection_flow` — permanent-zero hook, summed but never set |
| `bwr_config.js:61` | `reactivity.void_ref: 0.40` never read (engine pins 0.45) |
| `bwr_config.js:125-140` | `ads_level`, `hpci_start_level`, `battery_low_pct` dead (live values in `bwr_control.js`) |
| `rbmk_rods.js:53,59` / `rbmk_engine.js:64` | `'manual'` rod-function branches — no group has that function |
| `rbmk_rods.js:78` / `rbmk_engine.js:264` | `insertion_limit_steps` / `at_insertion_limit` initialized, exported, never updated |
| `control_kernel.js:198-202` | `_applyFailureEffect` non-block branch unreachable (no non-`block` override effect exists) |
| `control_kernel.js:62` / `pwr_control.js:252` | Vestigial `set_lpi` references after the HPI/LPI merge |
| `ui/shell.html:312-314` | Orphaned auto_control.js comment block (script deleted) |
| `ui/app.js:1204` | Comment references retired Training tab |
| `ui/app.js:1118` | `buildTraining()` misnomer (now the Plant & Mission refresh hook) |
| `ui/app.js:1740` | `rhr-auto` action is a `function () {}` no-op — a control that issues no command |
| `ui/app.js:1738` | Legacy `dhr-on/off` → `set_dhr` still wired alongside `set_rhr` |
| Kernel comments | Cite "§4b/§11/§12/§13" that matched neither doc (M4 §4b now added; M4b §12/§13 exist post-stage-11) |

**User-facing stale content:** `ui/manual_procedures.js:46,48` — PWR startup procedure text
tells the learner to use the "Primary view" and "Tools → Training (Reactivity Computer)".
Neither exists on the PWR anymore (synoptic-only; Reactivity Computer moved to the Sim tab).
This one is worth fixing promptly since trainees actually read it.

Minor consistency notes: campaign act keyed `id:'act5'` but titled "Act VI — The Reckoning"
(after `act5_tmi2` titled "Act V") — latent ordering/keying hazard; RBMK `set_turbine_load`
writes `steam_to_turbine` directly while `set_load_target` defers to LoadMode.step (transient
inconsistency depending on path); `dampInstruments` mutates `snapshot.instruments` in place
(display transform bleeding into the data the UI reasons about); `app.js:520` scram
view-switch reads `true_state.scrammed` where `instruments.rps_scrammed` exists; instructor
`PARAM_INSTRUMENT` hardcodes per-plant instrument ids (self-flagged, data-only).

---

## 6. Documentation updates applied in this pass

- **CONTEXT.md §4** — as-built integration notes (fixed-dt acceleration / Flag F6, per-engine
  kinetics forms, 10/20 Hz cadence). §6 was already current from stage 11.
- **M5_simulation_service.md** — as-built step loop (stepAutomation, fixed dt, cadence),
  snapshot shape (`automation`, `trip_blocks`, `active_failures` objects, extended instructor
  block), training-lifecycle command routing, new §6b (checkpoint/rewind ring), `engageDefaults`
  / `noDefaults`, save `metadata.register`, `selectPlant` opts + `advanceCycles`.
- **M7_test_runner.md** — §3.1 automation/trip_blocks known gap, §3.6 gauge-zone check marked
  not-implemented, §6 config-read exception honest, added the wider `test/` ecosystem map.
- **M1 pwr engine.md + load_mode_spec.md, M2 rbmk engine.md, M3 bwr engine.md** — stale tuning
  values corrected to as-built (dozens; the collected tables swept), moved protection data
  (`layers/control/*_control.js`) reflected in the file maps, superseded models rewritten
  (decay heat, AFW level-hold, feed pump, DNB criterion, implicit BWR kinetics, ramped recirc,
  …), missing systems added at summary level (NIS + 1/M, MSIV + SG safeties, RCP heat, governor,
  accumulators/HPI-LPI, tailpipe temp, AR group, source terms, load mode, …).
- **M4 control failure.md + M4b_control_layer.md** — kernel file/class names, generic failure
  forwarding, direction-aware actuation reset, evaluate() interlock pass, new §4b interlock
  subsystem, NIS trip net, `speeds` ladder, merged HPI/LPI + RHR permissive actuations,
  schema field fixes (`instrument`, `category`, `active`/`reset_active`), HR1 condition-gate
  gap flagged honestly.
- **M8 UI HMI Spec Consolidated.md + new_diagram_controls.md** — tab set (Automate/Dev, Training
  retired → Plant & Mission window), PWR synoptic-only control surface, rewind-pick scrubber,
  Dev tab Session Diagnosis, Teaching/Realistic labels, contextual instructor panel + chat
  mode, new synoptic controls (NIS, 1/M, MSIV, ESF arms, feed pump, rod T-avg AUTO), manual/help
  overlays, URL params, CONFIRM? arming idiom, display damping, renderer/ID-prefix reality.
- **M6_instructor.md + Gameplay_instructor_design.md + pwr_training_campaign.md + TMI2 specs** —
  IIFE registry form, real interface surface (getSnapshotBlock etc.), `advance:"end"`, missing
  beat fields, chat/dialogue subsystem, follow mode, converge idiom, ui_policy as-built shape,
  campaign 6 acts / 25 missions (TMI-2 act, pwr_automation/pwr_lof/pwr_slb, rbmk_ar), TMI2 open
  questions resolved, six-ending outcome model, Script.md marked historical scaffolding.
- **DESIGN_COMPANION.md** — §7 automatic-control exclusion marked superseded (2026-07 rework);
  §8.14 LPI/accumulators marked built.
- **OPERATOR_MANUAL_PLAN.md** — locked decision #4 updated (RCP pump heat now modeled; cold
  ops still narrative-only).
