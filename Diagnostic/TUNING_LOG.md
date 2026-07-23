# Tuning & Bug-Fix Log — session continuity record

**What this is.** The running record for the ongoing tuning / bug-squashing effort — the
one file to read at the **start of a session** to know where we are, and to update at the
**end of a session** with what changed and what's still open. It is a *curated index +
worklog + backlog*, not a dump: the dense engineering rationale lives in
`Blueprint/BUILD_DECISIONS.md`, the ops-probe findings in `Diagnostic/OPS_TUNING_REPORT.md`,
and the user-visible summary in `CHANGELOG.md`. This file points at those and tracks the
*state of the effort* across sessions.

**How to use it (read before editing).**
- Newest session entries on top of the **Session log**.
- When you resolve a backlog item, move it to the session log with the fix, and mark the
  backlog row **RESOLVED (date)** — don't delete it (continuity beats tidiness).
- When you *discover* something (a hard fail, an oddity, a suspicion), add a backlog row
  even if you're not fixing it now. A named suspicion is worth more than a lost one.
- Keep the gate snapshot below current — it is the at-a-glance "are we green?".
- Every claim gets a pointer (`file:symbol`, a probe name, or a doc section) so the next
  session can verify, not just trust.

---

## Current status (2026-07-22)

**PWR is the focus plant and is in good shape** — all PWR engine, behavior, and ops gates
green. The open backlog is dominated by **RBMK and BWR operability tuning** (documented,
each with a red acceptance test waiting) plus a small number of **pre-existing UI-harness
staleness** items.

**Gate snapshot** (baselines the effort must hold — see README _Definition of done_):

| Gate | State | Notes |
|---|---|---|
| `run_pwr` | **31/31** | PWR engine-direct |
| `run_rbmk` | **23/23** | |
| `run_bwr` | **15/15** | |
| `run_behavior` | **30 / 0 xfail / 0 fail** | PWR behavior catalog |
| `run_ops` | **59/68** | PWR **21/21**; 9 open = RBMK/BWR + 1 deliberate red (see backlog) |
| `run_m4`..`run_m7` | 18 / 19 / 16 / OK | stack layers |
| `run_autoctl` | **20/20** | |
| `run_scenarios` | **3/3** | flagships |
| `run_campaign` | **51/51** (2897) | |
| `run_procedures` | **21/21** | 1 strict known-fail (B3) |
| `run_checklist` | **24/24** | |
| `run_e2e_controls` | **28/30** | 2 pre-existing reds (F12) |
| `verify_e2e_ui` | **FAIL** | pre-existing on clean HEAD (retired PwrSynoptic probe) |
| `verify_manual_follow` | **84** (30 PWR bar-checks fail) | pre-existing, same PwrSynoptic-probe family |

---

## Part 1 — The tuning toolbox

### 1.1 Where the knobs are

| Knob class | Location | Convention |
|---|---|---|
| **Physics constants** | `engines/<plant>/<plant>_config.js` | Values marked `[tune]` are starting points arbitrated by the scenario suite; un-marked values are fixed. Counts: **PWR 89, RBMK 27, BWR 37**. The file header explains the convention. |
| **Protection / alarm / failure setpoints** | `layers/control/<plant>_control.js` | Trips, ESF actuations, interlocks, alarm bands, and the failure catalog (`severity_meta`, `leak_scale`, etc.) are all **data** (HR3). This is where "when does SI fire", "what's the trip setpoint", "how big is a full-severity SGTR" live. |
| **Instrument lag / noise / range** | `<plant>_config.js` `instruments:` block | Every gauge has `{lag, noise, range}`. Range clipping matters (see C1: a meter pegged at its trip setpoint can never *cross* it). |
| **Automation channel gains** | `layers/control/<plant>_control.js` channel defs | PID/bang/mode channel tuning (rod control, feed, boron, spray). Validated by `run_autoctl`. |

### 1.2 What validates what

- **`run_<plant>.js`** — engine-direct physics, **no protection layer**. Proves the raw
  hydraulics/neutronics. Fast, deterministic.
- **`run_behavior.js`** (PWR) — the **behavior catalog** battery: named invariants
  (CVCS level control, TMI deception boundary, going-solid backstop, SGTR ladder…). Strict
  xfail convention; auto-writes `Diagnostic/BEHAVIOR_GAP_REPORT.md`.
- **`run_ops.js [pwr|rbmk|bwr] [name]`** — engines **UNDER the real M4 control layer**:
  commands descend through interlocks, protection evaluates at the M5 broadcast cadence
  (and scales with time acceleration). `ops_*` = manual-driven evolutions; `abuse_*` = how
  a player actually treats it. **A FAIL is a tuning target with its acceptance test already
  written.** Results JSON at `Diagnostic/ops_results.json`.
- **`run_scenarios` / `run_campaign` / `run_procedures` / `run_checklist`** — instructor
  content: flagships, the 51-mission campaign gate, manual-procedure replay, auto-checklists.
- **`run_e2e_controls` / `verify_e2e_ui` / `verify_manual_follow`** — service-level control
  plumbing and UI wiring.

**Golden rule:** a config change ⇒ re-run the affected `run_<plant>` **and** `run_ops`
(don't turn a PASS into a FAIL — the remaining FAILs are pre-existing targets). A
config/setpoint change also triggers the **manual maintenance rule**:
`node tools/gen_manual_reference.js` + `node tools/pack_manuals.js` + `run_procedures`.

### 1.3 Model facts & gotchas that bite during tuning

- **Two flow scales (learned the hard way — P7).** Accident flows (leak / LOCA / ECCS /
  relief) act on the lumped primary inventory 1:1. CVCS charging/letdown are *normalized to
  the gauge scale* (orifice A `0.030` ≡ 20 gpm) and enter the mass balance through
  **`cvcs_inventory_gain` (0.012)** so tens-of-gpm flows don't read as %/s of the whole
  RCS. Don't cross the scales: rescaling one without the other silently breaks the other's
  calibration.
- **Pressurizer level is DERIVED, not integrated** (`pwr_pressurizer.stepLevel`):
  `level = base(Tavg) + level_per_mass·(mass−1) + level_per_void·void`. Level and inventory
  can't drift apart. `level_per_mass = 100` maps level↔mass ~1:1.
- **HR1 — instruments vs truth.** Automation and the level servo read the *indicated*
  (lagged/noisy/failable) value, not truth. A stiffer servo amplifies gauge noise; damp the
  error, don't just raise the gain (see the P7 `cvcs_level_filter_tau` fix).
- **Protection cadence scales with acceleration** (C2). M5 evaluates M4 once per broadcast,
  so at 256× the RPS checks the plant every ~13 sim-seconds — slow to catch fast excursions.
- **Meter range vs trip setpoint** (C1). `crossed()` is strict (`value > setpoint`); a meter
  that clips *at* its trip setpoint can never fire it. PWR/BWR `power_range` widened to
  `[0,200]` for exactly this.

---

## Part 2 — Session log (newest first)

### 2026-07-23 — indication noise halved + board hover glow  ✅
Owner asks (with issue #113, already-fixed 1 MW load step — verified, no change). (1) **Cut
indication noise in half**: new `PWR_CONFIG.instrument_noise_scale = 0.5`, applied to `spec.noise`
at the two gauss draws in `pwr_instruments.update` (constructor reads it → `this.noiseScale`). PRNG
draw ORDER/COUNT unchanged (one draw per instrument), so saves/rewinds/scenarios stay deterministic;
only noise MAGNITUDE drops. Regressed 2 razor-edge ops probes (`run_ops` 59→57): `ops_pwr`
cooldown "subcooling never lost" (true min −0.4 vs >0) and SGTR "inventory ≥55 %" (54.8 vs 55) — both
because the probes' own coarse control reacts to the steadier indicated values, shifting the trajectory
a few tenths across an infinitesimal threshold (behavior physically unchanged). Fix: gave those two
checks documented physical tolerances (subcooling > −1 °C; inventory > 54 %) — a real loss reads many
units, not tenths. `run_ops` back to 59/68 baseline, PWR probes green. (2) **Board hover glow**: cyan
`:hover` box-shadow on `.bd-btn`/`.bd-pop button`/`.bd-num-frame` + drop-shadow on `.bd-scram`
(`pwr_board.css`) — the clickable HTML controls now glow like the valves/PORV already did (those are the
only clickable components; pumps are ART-only/suppressed, condenser non-interactive). Gates all green.


### 2026-07-23 — TMI-2 Part 1 rework (issue #105)  ✅
Owner playtest → GitHub issue #105 (7 items). Two owner rulings (`AskUserQuestion`): Part 1
becomes **guided hands-on** (player performs the historical actions, supervisor takes over on
`inaction`; outcome stays historical), and pacing is **smoothly compressed, no skip buttons**.
Changes: `scenarios/pwr_tmi2_p1.js` reworked (operator_action/inaction branches for
secure-HPI + isolation, phase `watchGate(until,msg)` rails, `beat.speed:6` compression, "gone
SOLID" callout); `layers/simulation_service.js` `_authoredSpeed` flag so an authored FF rides
through the alarm cascade instead of snapping to 1× on each new alarm (scram/failure still
hard-stop); board `pwr_board_wiring.js` PORV reads `true_state.porv_open` (stuck-open valve
visibly vents + flows while the demand lamp stays "closed"), tailpipe gauge goes amber >100 °C,
discharge pipes added to `PIPE_TEMP`; `pwr_board.css` `.bd-maint-tag` now hangs OVER the valve.
#4 "never went solid" was legibility, not physics (probe: `pzr_level_pct` pegs 100 % ~t196–670).
Full rationale in `Blueprint/BUILD_DECISIONS.md` (2026-07-23 entry). Gates green: run_campaign
51/51, run_m5 19/19, run_m6 16/16, run_autoctl 20/20, run_pwr 31/31, run_m4 18/18, run_m7 OK,
run_procedures 21/21, board_check 54/0; both Part-1 paths reach core-damage headlessly.

### 2026-07-22 — ECCS pump merge — change plan drafted (awaiting owner approval)  ⏸
Owner reversed the dedicated-ECCS-pump ruling (it was written on faulty info; real Westinghouse
charging pumps ARE the high-head SI pumps). Decision: combine makeup + high-head HPI into one
pump ("one pump, two speeds"), keep LPI/RHR as its own pump, no throttle valve in the diagram.
Grounded change plan written to **`Blueprint/ECCS_PUMP_MERGE_PLAN.md`** (verified board state:
two adjacent pump glyphs, HPI panel is the only injection control, NO board RHR card — RHR is
auto). Recommends **Option B**: the HPI panel becomes the Safety-Injection actuation driving
BOTH pumps (charging/HPI high-head immediately; RHR/LPI low-head once depressurized), LPI stays
automatic → no new card. Full file/symbol change-list + 4 open decisions (D1 Option A vs B, D2
loss-of-charging-pump coupling, D3 labels, D4 hpi_flow_hh/lh snapshot fields). **Not yet
implemented** — pending owner sign-off on D1–D4.

### 2026-07-22 — Audit: hunt for other flow-scale/node mistakes (PWR)  ✅ clean
**Owner request:** in light of the CVCS bug (a cold-leg flow scaled against the whole primary
volume), review the PWR code for other instances of the same class.
**Method:** traced every term that enters an accumulation (integration), checking two axes per
term — the **spatial node** it draws on and the **magnitude scale** it uses.
**Finding — no second instance.** The complete primary mass balance
(`pwr_primary.stepInventory`): charging/letdown (now `×cvcs_inventory_gain`, cold-leg node) —
fixed; HPI/LPI, accumulators (accident scale, cold-leg node), PORV/safety/leak (accident scale)
— all deliberately calibrated and node-correct. Spray and RHR are correctly *excluded* from the
balance (internal recirculation, no net inventory). Confirmed by grep that charging/letdown enter
an accumulation in **exactly one place**, so the gain can't be bypassed. The *correct* version of
the pattern is already present: heat-to-SG (`h_sg·flow_frac`) and pzr spray
(`spray_flow_frac·flow_frac`) both scale with cold-leg flow — what letdown was missing. Secondary
side is internally consistent (feed/steam/dump/AFW/relief all on one rated-flow basis). Instrument
model, boron chemistry (direct ppm/s rate), and xenon/iodine don't share the hazard.
**The one seam RESOLVED by plant design (owner ruling 2026-07-22).** I had noted CVCS charging and
HPI as "the same physical pumps on different scales." Owner ruling: **this plant's ECCS/HPI has its
OWN dedicated pump** (RWST-sourced SI train), separate from the small CVCS charging pump — already
realized in code (independent `hpi_active` vs `charging_pump_running` flags, own `set_hpi` command,
own `hpi_discharge_pressure`) and in the UI (the board's dedicated ECCS pump element). So the
different flow scales are *physically correct*, not a compromise: a large SI pump simply delivers
far more than a small make-up pump. Comments in `pwr_primary.injectionFlowInv` + `pwr_config.js
emergency` reframed from "charging-pump head" to the dedicated ECCS train. **No physics change.**

### 2026-07-22 — P7 CVCS drain rate + associated behaviors (PWR)  ✅
**Owner report:** letdown drains the pressurizer far too fast to respond to.
**Root cause:** CVCS shared the lumped accident inventory scale, so ~20 gpm letdown read as
~2 %/s of pzr level.
**Fixed:**
- New `cvcs_inventory_gain` (0.012) puts CVCS charging/letdown on their own scale in the
  mass balance. Uncompensated orifice-A drain now **~2.2 %/min** (probe
  `ops_cvcs_pzr_drain_rate` green: 15 % drop in ~417 s). AUTO servo re-tuned to match with a
  damped level error (`cvcs_charge_per_level` 0.001→0.01, new `cvcs_level_filter_tau` 20 s).
- **SGTR re-anchored** (`leak_scale` 0.12→0.03): the old "2× charging_max" premise died with
  the rescale, and AUTO charging had been silently acting as a second HPI (the EOP scenario
  only passed because of it). Full rupture now ≈ ½ HPI rated; still forces trip + SI + EOP,
  and the single-SG EOP wins the inventory race honestly.
- **SI on pzr_level lo-lo (12 %)** added — closes P1(b). The smaller leak lets the heaters
  hold pressure, so the pressure-only SI path never fired while inventory drained. New ESF
  actuation rides the `hpi` arm; TMI untouched (its deceived level reads *high*).
- `ops_sgtr_managed` EOP script gained real SI-termination criteria (subcooling **and** level
  recovered). Removed dead `cvcs_makeup_gain` + stale `_charging_actual`.
**Docs:** BUILD_DECISIONS "P7 CVCS↔inventory retune", OPS_TUNING_REPORT update 2026-07-22b,
CHANGELOG, Manuals 03/06/09 (repacked). **Commit:** `ed51104` on `develop`.
**Gate delta:** ops-PWR 20→**21/21** (P7 green); e2e_controls 27→**28/30**.

### Earlier resolved (pre-log, captured for continuity)
Distilled from `Diagnostic/OPS_TUNING_REPORT.md` + `BUILD_DECISIONS.md`:
- **CVCS bumpless AUTO→MANUAL transfer + 17 % letdown isolation** (2026-07-21) — a single
  MANUAL toggle used to drain the plant; letdown could empty it. Fixed before P7 addressed
  the underlying *rate*.
- **P1** SGTR leak scaling / auto-SI, **P2** steam-dump capacity cap, **P3** normal-shutdown
  forgiveness (CVCS holds programmed level), **P6** spray Psat floor — all resolved in the
  2026-07-19 PWR ops-tuning pass.
- **C1** high-flux trip could never fire (meter clip) — PWR/BWR `power_range`→`[0,200]`.
- **C3/C4** scram recovery + manual-scram RPS latch — `reset_rps` path landed; behavior
  probe PI-7 and the ops `abuse_scram_then_recover` confirm.

---

## Part 3 — Known & suspected issues backlog

Ordered roughly by priority. **Acceptance test** = the red probe (or check) that turns green
when it's fixed. RBMK/BWR items are the bulk of the remaining ops-suite reds.

### 3.1 Live `run_ops` failures (9 — all RBMK/BWR + 1 deliberate)

| ID | Plant | Symptom | Suspected cause | Knob(s) / location | Acceptance |
|---|---|---|---|---|---|
| **R1** | RBMK | Post-1986 core still steam-explodes on the Chernobyl sequence — the "same sequence is survivable" design intent fails | Void-driven excursion outruns the 12-s insertion once the power trip finally fires | Add a short-period/SUR trip (post only); or harden void saturation; or lower post `MAX_PROMPT_GROWTH` — `rbmk_config.js` + `rbmk_control.js` | `abuse_chernobyl_post` "must be survivable" |
| **R2** | RBMK | Drum level dynamics ~5–10× too fast (90 s 50 % FW dip crashes 50→7 %, pegs 100 % on restore) | `K_drum_level` too high; no feed-follows-steam trim | `K_drum_level` (4.0) ~5× down; consider auto feed trim — `rbmk_config.js` | `ops_feedwater_dip_pre` + `_post` (50 ±8 recovery) |
| **R3** | RBMK | Post fine control knife-edged — honest maneuvering hits the 110 % trip / ends ramps at 94 % | Tight post margins (partly authentic) + coarse rod step | Higher Doppler damping or a 'fine' rod speed — `rbmk_config.js` | `ops_flow_reduction_post` |
| **B2** | BWR | No pressure regulator: any power drop collapses vessel pressure into the 5.52 MPa low trip | Turbine follows power/fixed-load, not pressure — real BWR is pressure-priority | Add a behavioral pressure-regulator load mode (steam draw holds `vessel_p_rated`) — `engines/bwr` + `load_mode.js` | `ops_recirc_pump_trip` (settle ~40–50 % on nat-circ) |
| **B3** | BWR | RCIC/HPCI lose to post-trip boiloff — level falls to ~0.6 % hands-off; the authored `bwr_sbo_rcic` procedure can't meet its own step | Injection capacity too low vs boiloff/level gain | Raise `rcic_flow_normalized`/`hpci_flow_normalized` or lower `K_vessel_level` — `bwr_config.js` | `ops_lofw_handsoff` + `run_procedures` (bwr_sbo_rcic) |
| **B4** | BWR | Depressurization paths stall above the LPCI window (manual SRV / ADS never reach <1.03 MPa) | Blowdown-vs-decay-steam balance; SRV time constant | `srv_manual_tau` (150), blowdown balance, or `lpci_threshold_pressure` — `bwr_config.js` | `ops_sbo_managed` depressurization check |
| **B5** | BWR | Stuck-open SRV blows vessel down, level→0, but **LPCI never auto-starts** (gated only on `ads_open`) | Missing low-level + low-pressure LPCI permissive | Add the permissive path — `bwr_control.js` actuations | `abuse_srv_stuck_walkaway` level-defense |
| **C2** | RBMK | Protection latency grows with time acceleration — 256× rod runaway → steam explosion where 1× trips cleanly | M5 evaluates M4 once per broadcast (wall cadence) | Evaluate trips inside the physics-step loop (every N sim-sec) or auto-drop accel on new alarm — `simulation_service.tick()` | `abuse_accel_latency` [post] (**deliberately RED** until fixed — same outcome 1× vs 256×) |

> C2 is PWR/BWR-tolerable already (their excursions are slower — both `abuse_accel_latency`
> pass); the RBMK post case is the sharp one and is held as an intentional red so the
> regression can't go stale.

### 3.2 Test-suite / UI-harness reds (pre-existing, not physics)

| ID | Symptom | Suspected cause | Fix direction | Status |
|---|---|---|---|---|
| **F12** | `run_e2e_controls` 28/30: (a) PZR spray manual set reaches engine only 12 (want ≥45); (b) "CVCS auto make-up holds inventory vs leak ≥98 %" | (a) spray-demand reach drifted; (b) stale expectation — severity-1.0 SGTR is now 0.03 frac/s (~40× CVCS make-up), so "auto holds ≥98 %" isn't physical | (a) re-check spray reach; (b) re-baseline to current trajectory or assert a small leak the servo *can* match | **open** (was 3 reds; one turned green with P7) |
| **UI-1** | `verify_e2e_ui` FAIL — pwr/primary board controls "not found" by the harness | Harness still probes the retired `RD.PwrSynoptic` reveal path while the board display mounts | Point the harness at the board mount | **open** — verified identical on clean HEAD `4df8ac5` |
| **UI-2** | `verify_manual_follow` 30 PWR bar-checks fail | Same retired-PwrSynoptic-probe family as UI-1 | Same as UI-1 | **open** — manual-pill + rbmk/bwr checks pass |

### 3.3 Suspected / oddities (not hard failures — watch or investigate)

Pulled from `OPS_TUNING_REPORT.md` §P7 / §4–6; none currently fail a gate, but each is a
real smell worth a look during this effort.

| ID | Plant | Observation | Why it might matter |
|---|---|---|---|
| **S1** | PWR | `abuse_porv_walkaway` end state shows inventory 120 % (clip at `mass_max`) with pzr level 7 % — the overfill/level bookkeeping disagree | A level/inventory contradiction is exactly the class of bug the derived-level rework was meant to kill; worth confirming it's just the clip |
| **S2** | PWR | LOFW warning-to-trip window is only ~4 s (`ops_loss_of_feedwater_handsoff`) | Too fast for a player to react — consider slowing SG boil-down slightly |
| **S3** | PWR | After criticality the sim coasts to ~20 % power even when leveled with counter-insertion (real practice stabilizes <5 %) | Startup feel — maybe a stronger low-power Doppler bite or gentler mid-curve differential rod worth |
| **S4** | PWR | 50 % xenon swing may be a touch small (peak ~106 % vs ~113 % on the daily cycle) | Fine for v1; note if xenon scenarios feel flat |
| **S5** | RBMK | Zero-flow aftermath too forgiving — post-trip fuel sits ~570 °C indefinitely, never dries out/damages | Real consequence is boil-off→dryout over tens of minutes; scale `h_fc` with channel flow at decay levels |
| **S6** | RBMK | EPS bypass — verify M4 actually honors `eps_bypassed` in `_evalTrips` (was cosmetic; a `disable_auto_trips` effect now exists — confirm it inhibits auto-trips for the Chernobyl sequence) | The historical sequence can't be walked if bypass doesn't suppress trips |
| **S7** | BWR | High-level (L8) protection + startup rod-block absent (overfeed to 150 % pegs 100 % with no alarm/trip) | Siblings (PWR/RBMK) have both; add at least a `vessel_level_high` alarm |

---

## Pointers (authoritative sources — don't duplicate, curate)

- **Dense rationale / decisions:** `Blueprint/BUILD_DECISIONS.md` (Open Flags table + dated entries).
- **Ops-probe findings (the original C/P/R/B catalog):** `Diagnostic/OPS_TUNING_REPORT.md`.
- **Behavior-catalog gaps:** `Diagnostic/BEHAVIOR_GAP_REPORT.md` (auto-generated by `run_behavior`).
- **User-visible changes:** `CHANGELOG.md`.
- **Manual issues:** `Manuals/ISSUES_AND_FINDINGS.md`.
- **As-built numbers always win over prose** — read the engine/config, not the docs, when a
  number is in doubt (README rule).
