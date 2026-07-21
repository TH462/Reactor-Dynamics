# PWR Behavior Catalog — Tuning-Pass Ground Truth (DRAFT for owner red-line)

**Status: v2.0 — FROZEN 2026-07-20. All §8 items decided (owner approved recommendations on
4, 5, and 9). This is the tuning-pass ground truth; changes require an owner ruling.**
Date: 2026-07-20

> **⚑ DIRECTION CHANGE (2026-07-20, owner): re-plan pending — do NOT execute this catalog
> as-is.** The owner has decided to treat this as its own unique plant and tune for desired
> behavior/feel, not the generic-Westinghouse target numbers below. **Fable to re-plan.**
> Item 1 (SS-2 Tavg program) was partially implemented then paused; the work is **uncommitted**.
> Read **`Diagnostic/ITEM1_TAVG_HANDOFF.md`** first — it records exactly what changed, the test
> status at pause, and three durable physics findings (Tavg is pinned by the boron/MTC trim, so
> the "feel" lever is the no-load anchor + Tref program; the SS-6 droop was a xenon-IC bug; and
> post-trip SG shrink is sensitive to the no-load Tavg). The bands below are now *reference*,
> not ground truth, until the owner re-freezes.

## Purpose and rules

This catalog is the external ground truth for the comprehensive PWR tuning pass. It exists
because the pre-launch review verified the sim against *its own tests* (regression gates), not
against *what a real PWR does* — so behavioral defects (spray masking the TMI pressure
excursion, no turbine/feedwater interlocks, primary draining on MSIV closure) passed review.

Rules agreed 2026-07-20:
- **Scope**: PWR only. RBMK/BWR get their own catalogs later using this template.
- **Fidelity**: generic Westinghouse 4-loop U-tube plant, quantitative bands ~±15 % unless
  tighter matters (setpoints are exact). Directional/ordering correctness is mandatory.
- **Authorship**: Claude drafts, owner red-lines. Entries marked ⚑ are the ones most worth
  owner attention (big ripple or judgment calls).
- **Conflicts**: physics wins. Training beats, manuals, scenario numbers, and campaign gates
  get updated to match tuned behavior; all 51 campaign gates re-validated after tuning.
- Every entry, once tuned, becomes a permanent probe in the behavior battery (`test/run_behavior.js`,
  to be created) so this class of defect cannot regress silently.

**Status legend**
- `PASS` — behavior correct today and covered by an existing green check.
- `PASS?` — believed correct, but no test pins it (needs a probe before we trust it).
- `FAIL` — known wrong (playtest or suite evidence).
- `GAP` — feature/interlock absent entirely.
- `UNREP` — reported in playtest, not yet reproduced.

Existing coverage referenced below: `run_pwr` (32 engine scenarios), `run_ops`/`ops_pwr`
(20 ops scenarios), `run_autoctl` (channel probes), `run_campaign` (51 gates), `run_m5`.
Open tasks folded in: #22 #23 #24(UI) #25 #26 #27, OPS report P4/P5, C2–C4.

---

## 1. Steady-state operating map

| ID | Behavior | Expected (band) | Sim today | Status |
|----|----------|-----------------|-----------|--------|
| SS-1 | 100 % snapshot | Tavg 303–309 °C, ΔT 30–36 °C, pzr 15.4–15.5 MPa, pzr level 55–60 %, SG 5.5–6.0 MPa, SG level ~65 % NR, steam≈feed within 2 % | Tavg ≈304, ΔT 33, 15.41 MPa, 55 %, 5.65 MPa | PASS (`steady_full_power`) |
| SS-2 ⚑ | **Tavg program** — Tavg rises with load | Monotonic no-load→full-power rise, ~1.3–1.5 °C per 10 % load. Target: **292 ±2 °C no-load → 306 ±3 °C full power** | **No program.** Flat ~303 no-load, ~304 full; 50 % load *sags* to ~291.5 (wrong direction) | **FAIL** (P4/P5, the single largest systemic gap) |
| SS-3 | 50 % snapshot | Tavg ~299 ±3 per program, ΔT ~16–17 °C, SG pressure between no-load and rated | Tavg ~291.5 (sag), ΔT halves ✓ | FAIL (couples to SS-2) |
| SS-4 | HZP / Mode 3 standby | Tavg = no-load program value; steam dump holds SG at Psat(no-load Tavg); pzr at 15.41 MPa, level low end of program; power < P-10 | Holds at Tsat(8.90 MPa) ≈ 303 °C | FAIL (couples to SS-2; dump setpoint moves with program, → ~7.7 MPa) |
| SS-5 ⚑ | Pzr **level program** — level rises with Tavg | ~25 % no-load → ~55–60 % full power (programmed on Tavg) | Constant setpoint 55 % at all conditions | GAP (medium priority; interacts with level/mass rework, see CC-10) |
| SS-6 | 5 % steady | Stable indefinitely; steam dump carries load; no channel hunting | Covered | PASS (`steady_five_percent`) |
| SS-7 | Mode 5 cold shutdown | RCS < 93 °C, RHR carrying decay heat, pressure per IC, boron at shutdown concentration | Covered | PASS (`cold_shutdown_hold`) |
| SS-8 | Heat-balance closure at any steady state | charging≈letdown, steam≈feed, primary power = secondary power ±2 % | Believed OK | PASS? (add explicit probe) |

## 2. Normal evolutions

| ID | Behavior | Expected (band) | Status |
|----|----------|-----------------|--------|
| EV-1 | Mode 5→1 heatup | ≤ 28 °C/hr RCS heatup; bubble drawn before Mode 4→3; RCPs per lineup; no spurious ESF (P-11 handled) | PASS (`mode5_to_mode1_roundtrip`, m5 suite) |
| EV-2 | Cooldown to RHR entry | ≤ 55 °C/hr; RHR interlock opens < 2.76 MPa; borate on cooldown | PASS (`rhr_valve_and_mode`, ops cooldown) |
| EV-3 | Power ramp ±5 %/min | Rods+boron coordinate; Tavg tracks program within ±1.5 °C; no trip | PARTIAL — ramps work but track the *wrong* (flat) program; re-band after SS-2 |
| EV-4 | Load follow 100→50→100 | Completes without operator help in all-auto; Tavg per program | FAIL-ish — works but authority ~25 % of real (P4); retune with SS-2 |
| EV-5 | Boration/dilution response | ~10 ppm step → clear reactivity response; worth ≈ −8 to −12 pcm/ppm | PASS (`pwr_boron` campaign, eccs_boration) |
| EV-6 | **Slow manual rod insertion at 100 %**, all-auto | Power/Tavg walk down smoothly; turbine follow or dump compensates; **no SCRAM** from single steps with stabilization waits | RESOLVED 2026-07-20 — owner retried and could not reproduce (#25 closed); probe matrix stays in the battery as regression insurance |
| EV-7 | Single rod step at 100 % | Small flux dip, Tavg recovers via auto rods within ~2 min, no trip | PASS? (near `control_response`; pin explicitly) |
| EV-8 | Xenon transient after power change | Peak ~6–10 hr after downpower; magnitude enough to demand boron/rod compensation | PASS (`ops xenon 8h`, `pwr_xenon`) |
| EV-9 | Startup 1/M approach | Doubling behavior; SR→IR→PR overlap; P-6 SR cutout, P-10 at 10 %; IR 20 %/PR-low 25 % backstops | PASS (campaign startup ×2, NIS suite) |
| EV-10 | Turbine roll & sync | Requires vacuum > trip point; overspeed trip 1980 rpm enforced; sync only at rated rpm | PASS (`transient_loss_vacuum`, overspeed actuation) |

## 3. Anticipated transients (initiating event → required sequence)

| ID | Event @ IC | Required sequence (times from event) | Status |
|----|-----------|--------------------------------------|--------|
| TR-1 ⚑ | **Turbine trip @ 100 %** | Above P-9 (~50 %): **reactor trips directly on turbine trip** (anticipatory). Pressure/Tavg spike bounded by dump+PORV; PORV may lift briefly; no SI | **GAP — no turbine-trip→reactor-trip interlock.** Sim rides out on 50 % dump + spray, which real W plants do not above P-9. (`transient_turbine_trip` currently *asserts* ride-out — test itself must change) |
| TR-2 ⚑ | **Loss of main feedwater @ 100 %** (TMI opener) | SG levels fall → **lo-lo 17 % reactor trip ≤ ~60 s** → turbine trips (via reactor trip); **primary pressure spikes to PORV lift 16.20 MPa within ~10–30 s of turbine trip**, PORV cycles, recloses; AFW auto-starts at 20 %; spray must NOT be able to suppress the spike | **FAIL** (#22): turbine keeps running, spray (K=1.7, no flow cap) holds ~15.55 MPa, PORV never lifts. Fix = TR-1 interlock + spray capacity CC-5 |
| TR-3 ⚑ | Loss of feedwater **with AFW block valve shut** (TMI-2 proper) | As TR-2, then SG dryout ~15–30 min → primary heat-up/repressurization, PORV cycling; recovery when block valve found (matches TMI-2 module story clock) | FAIL upstream (needs TR-2 first); TMI module timing then re-validated |
| TR-4 ⚑ | **Trip of 1 of N RCPs @ 100 %** | Above P-8 (~30 %): **reactor trip on single-loop low flow**. Below P-8: run back, no trip | **GAP** — low-flow trip threshold 0.25 total flow ≈ all-pumps loss; single-pump trip rides out at 100 % (`transient_rcp_trip` asserts ride-out — test must change) |
| TR-5 | MSIV closure @ 100 % | Reactor trip (high pressure or via TR-1 path); SG pressure → safeties 9.31 MPa pop/9.0 reseat; primary stabilizes at safeties' Tsat; **pzr/RCS inventory retained** | PASS since #34 fix (`msiv_closure_at_power`); re-check after TR-1 exists |
| TR-6 | 50 % load rejection | Steam dump (≤50 % cap) + rods absorb it; no reactor trip; Tavg returns to program | PASS (`ops grid step`, dump-cap check); re-band after SS-2 |
| TR-7 | Manual reactor trip from 100 % | Turbine trips; Tavg → no-load value on dump; pzr outsurge: pressure dips (heaters recover), level drops ~20–30 % **not to zero**; no SI; rods_tavg channel self-disengages | PASS (`shutdown_scram`, autoctl scram probe) |
| TR-8 | Loss of condenser vacuum @ 100 % | Turbine trip at 74.5 kPa; steam dump to condenser unavailable → SG safeties/relief carry; reactor trip per TR-1 | PARTIAL — trip fires; dump-unavailable-on-vacuum needs a pin; TR-1 coupling |
| TR-9 | SG overfill | P-14 at 90 %: turbine trip + feedwater isolation; reset at 85 % | PASS (`ops_sg_overfeed_p14`, `feedwater_isolation`) |
| TR-10 | Stuck-open PORV @ 100 % (SBLOCA) | Depressurize → low-P trip 12.41 MPa → SI 11.03 MPa; subcooling shrinks; **indicated pzr level rises while inventory falls** (void deception); block valve closure terminates | PASS (`flagship_tmi`, PORV walkaway, TMI module) |
| TR-11 | Spray valve fails open @ 100 % | Slow depressurization; heaters fight and lose; low-pressure trip eventually; no SI if operator isolates | PASS? (`heaters vs spray fight` is close; pin end-state) |
| TR-12 | Steam line break | Faulted SG blows down, RCS cooldown → positive reactivity; trip + SI; MSIV isolation limits it | PASS (`pwr_slb` campaign gate) — re-validate after interlock work |
| TR-13 | SGTR @ 100 % | Primary→secondary leak; pzr level/pressure fall; trip + SI; stabilize, identify, isolate faulted SG; leak scales with ΔP | PASS (P1 fixed via `leak_scale`; `ops SGTR stabilize`) |
| TR-14 | Station blackout | Loss of all AC: RCPs coast down, natural circulation; no HPI/charging; known unsurvivable long-term (by design, teaching point) | PASS (campaign fact) — document as intended in manual |

## 4. Casualties & instrument deception (HR1)

| ID | Behavior | Expected | Status |
|----|----------|----------|--------|
| CA-1 | TMI-2 full sequence (module p1–p3) | Story-clock milestones remain achievable after TR-1/TR-2/CC-5 retuning: trip, PORV stuck, level deception, pumps cavitation, block valve save | PASS today; **must re-validate after tuning** (times will shift) |
| CA-2 | SBLOCA spectrum | Break → depressurize; accumulators inject at 4.14 MPa; RHR/LPI available < 2.76 MPa; Tavg pins near saturation during blowdown | PASS (`merged_injection_curve`, `accumulator_arming_boundary`, `eccs_cold_injection`) |
| CA-3 | Pzr level sensor fails HIGH | Auto charging backs off (reads instrument, not truth) → real inventory falls; operator must catch via other indications (charging/letdown mismatch, Tavg, subcooling) | PASS since cc0d390 — but drain depth capped by mass floor (see CC-10 ⚑) |
| CA-4 | Pzr level sensor fails LOW | Charging drives up → high level; P-14-analog? No — pzr high level *trip* at… (none modeled — see PI-8) | PARTIAL — servo response correct; missing high-pzr-level trip backstop |
| CA-5 | Tavg instrument failure w/ rods in auto | Rods misdrive; bounded by IR/PR trips, high/low pressure trips; rod channel dropout on operator take-over with note | PASS (autoctl HR1 probes) |
| CA-6 | Loss of NIS channels | SR re-energize at P-6 on down-range; startup ladder blocks honored | PASS (NIS suite) |

## 5. Control-channel behaviors (each = what it holds, how it fails)

| ID | Channel | Required behavior | Status |
|----|---------|-------------------|--------|
| CC-1 | rods_tavg | Holds indicated Tavg ±0.8 °C of captured ref; disengages on scram AND on operator rod action (with visible note); after SS-2, ref = *program* not captured value ⚑ | PASS today (autoctl); re-work with SS-2 |
| CC-2 | feed_sg (3-element) | Holds SG level ±~2 % at steady; ff on steam flow; drops to MAN only on operator feed commands (with note) | PASS (#32 was display bug, fixed) |
| CC-3 ⚑ | feed_sg **post-trip** | Real plant: MFW isolates on reactor trip w/ low Tavg (P-4); AFW feeds. Sim: PID stays engaged and keeps feeding through the trip | GAP — decide: add trip-time FW isolation + AFW handoff (recommended), or document sim behavior |
| CC-4 | boron_conc | Holds analyzer value ±8 ppm; survives scram (correct — boration continues) | PASS |
| CC-5 ⚑ | **Pzr spray sizing** | Spray sized for insurge transients only: can arrest a step insurge, **cannot suppress a loss-of-heat-sink repressurization** (TR-2 must reach PORV). Needs flow-capacity cap, not just gain | **FAIL** (#22): K_spray 1.7, uncapped — overwhelms TR-2 |
| CC-6 | Heaters | Restore pressure after outsurge within ~5 min band 0.207 MPa; proportional + backup behavior | PASS |
| CC-7 | Steam dump | No-load Tavg hold at HZP; 50 % capacity cap enforced; unavailable on lost vacuum (TR-8) | PASS (cap tested); vacuum-interlock pin needed |
| CC-8 | CVCS auto make-up | Holds pzr level at setpoint via charging vs letdown; leak shows up as level drop → make-up (real-plant leak indication = level/charging trend, NOT leak telepathy) | PASS (rebuilt this week, `cvcs_level_control`) |
| CC-9 | ESF arms | HPI/AFW/RHR arm-fire-disarm; manual disarm with note; re-arm rules | PASS |
| CC-10 ⚑ | **Pzr level ↔ RCS mass coupling** | Level and inventory are separate integrators (deliberate TMI deception machinery). Boundary must be explicit: deception active only in void-forming regimes; in normal ops level must track inventory closely enough that CA-3/CA-4 depths are physical. Mass floor (`_mass<=1.0` charging clamp) is a stopgap | ARCH item — the root cause behind two shipped bugs (#21, #34). Rework scope is a tuning-pass line item |

## 6. Protection & interlocks

Setpoint verification (all currently implemented, values vs Westinghouse-typical — all PASS unless noted):

| Trip/ESF | Sim | Real-typical | Verdict |
|---|---|---|---|
| High flux | 120 % | 118 % | OK |
| High pzr pressure trip | 16.44 MPa | ~16.5 (2385 psig) | OK |
| Low pzr pressure trip | 12.41 MPa (blockable, P-11 13.6) | ~12.9–13.1 | OK (band) |
| PORV | 16.20 / 15.86 MPa | 16.2 (2335 psig) | OK |
| Pzr safety | 17.13 / 16.55 MPa | ~17.2 (2485 psig) | OK |
| SI | 11.03 MPa | ~12.5 (1807 psig) | ⚑ low-ish; consider raising toward 12.4–12.5 (interacts with TMI module timing) |
| Lo-lo SG level trip | 17 % | lo-lo NR trip | OK |
| AFW start | 20 % | lo-lo/loss-of-MFW | OK (+ see PI-4) |
| P-14 SG hi-hi | 90 % → TT + FWI | same | OK |
| SG safeties | 9.31 / 9.0 MPa | ~8.3–9.0 | OK (band) |
| Steam dump setpoint | 8.90 MPa | tracks no-load Tavg | moves with SS-2 (→ ~7.7 MPa) ⚑ |
| Accumulators | 4.14 MPa | 4.14 (600 psi) | OK (restored) |
| RHR interlock | 2.76 MPa | ~2.5–3.0 | OK |
| High Tavg trip | 335 °C | (not a std W trip; harmless backstop) | keep |
| Turbine: vacuum 74.5 kPa, overspeed 1980 rpm, reactor-trip→turbine-trip | — | same | OK |

**Missing interlocks (the defect cluster behind TR-1…TR-4):**

| ID | Missing item | Required | Priority |
|----|--------------|----------|----------|
| PI-1 ⚑ | Reactor trip on turbine trip above P-9 (~50 %) | Add | HIGH — unlocks TR-1/TR-2 |
| PI-2 ⚑ | Turbine trip on reactor trip already exists; **turbine trip on lo-lo SG / loss-of-MFW (AMSAC-style)** | Add (or rely on PI-1 via lo-lo trip — decide) | HIGH |
| PI-3 ⚑ | Reactor trip on SI actuation | Add | MED |
| PI-4 | AFW auto-start on loss of both MFW pumps (not just lo-lo level) | Add | MED |
| PI-5 | Feedwater isolation on SI, and on reactor trip w/ low Tavg (P-4) | Add with CC-3 | MED |
| PI-6 | P-8 single-loop low-flow trip above ~30 % power | Add | MED (unlocks TR-4) |
| PI-7 | RPS reset / scram recovery path (C3) + manual scram sets `rps_state.scrammed` (C4) | Add | MED |
| PI-8 | High pzr level trip (~92 %) | Add (backstop for CA-4) | LOW |
| PI-9 | SI on low steam-line pressure (SLB protection) | Have SLB gate passing without it — verify path | LOW |

---

## 6b. Battery findings — first run, 2026-07-20 (status updates, not band changes)

The behavior battery (`test/run_behavior.js`, 20 probes) went live against this catalog.
Result: 11 pass, 8 known gaps (strict xfail), 0 unexpected. Discoveries:

- **SS-6 is a FAIL, newly discovered**: 5 % hands-off droops continuously to ~1 % in
  30 min (2.48 → 1.05 %/last 10 min) — the low-power equilibrium isn't held. The engine
  suite's `steady_five_percent` gate passes because it asserts a looser/shorter window —
  a textbook regression-gate-vs-spec miss. Tune with the SS-2 program work.
- **C4 is RESOLVED**: a manual scram DOES latch `rps_state.scrammed` now (fixed sometime
  during the control-layer rework; the OPS report note is stale). C3 (no RPS *reset*
  path) still stands — coverage id PI-7-reset.
- **CC-10 windup evidence pinned**: with CVCS in auto vs a small SGTR, pzr level holds
  55 % while TRUE inventory winds from 100 % to the 120 % tank cap — the decoupled-
  integrator defect demonstrated live (probe CC-10, xfail).
- **TR-13 SGTR scale — DECIDED (owner, 2026-07-20): raise it.** `sgtr` leak_scale 0.03 is
  smaller than charging capacity 0.06, so CVCS can out-pump even a full tube rupture. In a
  real plant a full SGTR (~400+ gpm) overwhelms charging (~100 gpm) — that is exactly why
  it forces a trip + SI. Tuning pass: raise the SGTR leak scale so a full-severity rupture
  clearly exceeds charging (target ~2× charging_max, i.e. leak_scale ≈ 0.12), re-band the
  ops SGTR scenario and the battery's CC-8/CC-10/CA-3 probes (which use small severities
  precisely to stay inside CVCS capacity — pick severities so their leaks stay ≈ 0.003–0.006
  normalized), and re-validate accumulator-plateau physics (config note: ≤8 % SGTR holds the
  plateau — that percentage shifts with the rescale). Interacts with the earlier P1 rescale.
- Measured baselines for the tuning targets: turbine trip @100 % → trip only at 46 s
  (high-Tavg backstop, peak 324.8 °C) — PI-1 will make this ≤ 5 s; loss-of-feed and
  heat-sink-loss both peak at **15.57 MPa** vs the required 16.20 PORV lift (CC-5).

## 7. Execution plan after red-line

1. **Freeze catalog** (owner red-line → v1.0).
2. **Behavior battery**: new `test/run_behavior.js` — one probe per catalog ID, engine+M5 level,
   quantitative bands from this doc; FAIL/GAP entries land as strict xfails (existing convention)
   so the gate is green-with-yellow until tuned, and any silent fix XPASSes red.
3. **Gap report** auto-generated from the battery run = the Fable tuning packet
   (replaces hand-stacked task list; #22, #25, P4/P5, C3/C4 all become catalog IDs).
4. **Tuning pass** in priority order: SS-2 Tavg program (+ SS-6 low-power hold) →
   PI-1/PI-2 interlock cluster → CC-5 spray capacity → CC-10 level/mass boundary →
   PI-3..8 → SS-5 level program → SI setpoint raise → TR-13 SGTR rescale → units layer.
5. **Re-validate downstream artifacts**: run_pwr/ops/autoctl/m5 bands re-tuned where the *test*
   asserted wrong behavior (TR-1, TR-4 explicitly); all 51 campaign gates re-run and beat text
   updated; TMI-2 module story clock re-timed (CA-1); manuals + procedure references regenerated;
   CHANGELOG entries per behavior change.
6. **Battery joins CI** — catalog IDs become the permanent spec layer above the regression gates.

## 8. Red-line decisions (owner rulings, 2026-07-20)

1. **SS-2 Tavg program — DECIDED: adopt sliding program 292 → 306 °C.**
   Physical basis: SG heat transfer needs a primary→secondary ΔT that grows with load. Holding
   Tavg flat forces steam pressure to collapse as load rises; holding steam pressure flat forces
   a huge Tavg swing. Westinghouse plants split the difference with a Tref program *linear in
   turbine load* (no-load ~292 °C → full-load ~306 °C); rods drive Tavg to Tref. Implementation:
   Tref(load) replaces the flat no-load anchor; rods_tavg tracks Tref, not a captured value;
   steam-dump setpoint becomes Psat(292 °C) ≈ 7.7 MPa. This erases the 50 %-sag defect (target
   there becomes ~299) and restores real load-follow authority (P4's root cause).
2. **PI interlock cluster — DECIDED: add all of PI-1 … PI-8** (reactor-trip-on-turbine-trip
   above P-9, turbine-trip on lo-lo SG/loss-of-MFW, reactor-trip-on-SI, AFW start on MFW loss,
   FW isolation on SI and on trip+low-Tavg, P-8 single-loop low-flow trip, RPS reset + manual-scram
   flag, high-pzr-level trip).
3. **CC-5 spray flow cap — DECIDED: yes.** Cap sized so TR-2 lifts the PORV but a normal step
   insurge is still arrested.
4. **CC-3 post-trip feedwater — DECIDED: implement real behavior.**
   On reactor trip with Tavg falling below no-load (P-4 analog): MFW isolates, feed_sg channel
   stands down with a visible note, AFW auto-starts and holds SG level at its 20 % target.
   Rationale: the current always-on PID pumps 40 °C feed against decay heat after every trip
   (overcooling that distorts all post-trip behavior), and the MFW→AFW handoff is itself a core
   TMI teaching point.
5. **CC-10 level/mass rework — DECIDED: physical-level middle path.**
   Pzr level becomes a *derived* quantity: f(RCS inventory, coolant thermal expansion) plus a
   void term that only activates when the primary actually reaches saturation (the TMI regime) —
   preserving the deception exactly where voids exist and nowhere else. The independent level
   integrator and the `_mass<=1.0` charging-floor stopgap are deleted. Not the full re-plumb;
   not the stopgap-tightening (which leaves the bug class alive).
6. **SI setpoint — DECIDED: raise 11.03 → ~12.4 MPa.** TMI/SBLOCA timing re-validated in step 5.
7. **SS-5 pzr level program — DECIDED: do it this pass**, bundled with item 1 (the level
   setpoint is a function of Tavg/Tref, so CVCS is touched once, not twice).
8. **EV-6 rod-insertion SCRAM — CLOSED.** Neither party can reproduce; probe stays in battery.
9. **Units boundary layer — DECIDED: keep normalized engine internals,
   add an engineering-units conversion block.** A single config ratings table (MWt, RCS flow,
   charging/letdown gpm, feed/steam flow, PORV/safety capacities) consumed by UI readouts,
   manuals, instructor text, and the behavior battery's band checks. Internals stay normalized
   (numerically stable, plant-agnostic); humans and the catalog never see a unitless flow again.
   Rationale: the unit-boundary is where real bugs happened (BWR RCIC unit bug, SGTR leak_scale,
   the `_mass<=1.0` floor); a named conversion layer shrinks that class without an engine re-plumb.
