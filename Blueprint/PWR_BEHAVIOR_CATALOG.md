# SLX-100 Behavior Catalog — v3.1 (feel-first, FROZEN-FINAL)

**Status: v3.1 FROZEN-FINAL — 2026-07-21, feel-plan Phase 7 complete. The plant is the
SLX-100** (Single-Loop eXperimental, 100 MWe — owner-named). **Every catalog gap is
closed: the battery runs 26 pass / 0 xfail / 0 fail, and its bands ARE the minted
character bands** — each probe was re-authored during the pass to this plant's own tuned
behavior (297→~304 °C program, ~13 % shrink, graceful ride-out, TR-3 dryout arc, ΔP-
killed SGTR). Changes require an owner ruling; owner playtest feedback
(Blueprint/PLAYTEST_CHECKLIST.md) is the standing re-tune channel — knobs are one-line.
Companion: `Blueprint/PWR_FEEL_TUNING_PLAN.md` (v1.0, all phases complete).**

**⚑ TEACHING GOAL (owner, 2026-07-21) — the plant's reason to exist: teach people how a
PWR works — the physics and how it acts.** When a tuning choice trades convenience against
physical honesty, honesty wins; every behavior should be *explainable* to the player in
plant-physics terms.

**⚑ TEMPO PRINCIPLE (owner, 2026-07-21) — governs every character band and demo:
the plant should react fast enough to be interesting, slow enough to be manageable.**
When a tuning choice trades speed for manageability, aim for the band where the operator
has time to recognize, decide, and act — but not time to get bored. Both P4 demos and the
Phase-7 band minting are judged against this line.

## 0. The plant

A **~100 MWe / ~300 MWt single-loop experimental PWR** — a compact, generously margined
research-prototype unit. One RCP, one U-tube SG, one steam line/MSIV (the engine's lumped
model, now the truth rather than an approximation). Primary operating point ~15.41 MPa /
Tavg ≈ 300 °C class with the existing setpoint ladder — those are **this plant's numbers**
now, not borrowed ones. Rating and all human-facing units arrive via the Phase-6 ratings
layer.

**Character in one line: an operator's plant.** Transients are manageable; the machine
gives you time and indications; protection trips are the last word, not the first. Scrams
are reserved for genuine limits. The TMI-2 sequence is canon — the one place where a
specific causal chain is the product.

## 1. Rules

- **Feel goals (FG-1…FG-7) are the spec.** Each entry states the *operator experience*
  required, plus the physics invariants that make it honest. Quantitative bands are
  **minted at the Phase-7 freeze from this plant's own tuned golden runs** — not inherited.
  Until then the battery pins direction/ordering, not numbers.
- **Two probe tiers** in `test/run_behavior.js` (strict xfail throughout):
  **[I] invariants** — plant-agnostic physics truths, written early, never move;
  **[C] character** — this plant's numbers, pinned only after the owner approves the feel.
- **Conflicts: physics wins; TMI canon wins over setpoint preferences.** Training beats,
  manuals, and campaign gates get updated to match tuned behavior (all 51 gates re-run at
  freeze).
- Status legend: `PASS` (green today) · `PASS?` (believed right, needs a pin) ·
  `XFAIL→Pn` (known gap, fixed in feel-plan Phase n) · `todo→Pn` (probe not yet written) ·
  `RETIRED` (see §8).

## 2. Design ratios — the feel knobs

Feel is set by capacity *ratios*, not absolute numbers. These are the levers the phases tune:

| Ratio | Today | Direction | Sets the feel of | Phase |
|---|---|---|---|---|
| Steam dump ÷ rated steam flow | **1.05 — SET (P4)** | ride-out enabler; vacuum/condenser-gated | Turbine trip = maneuver, not scram (FG-4) | done |
| Spray ÷ heat-sink-loss insurge | wins (K 1.7, uncapped) | **must lose** (flow cap) | PORV lifts in the TMI opener (FG-6) | P5 |
| Spray ÷ normal step insurge | wins | still wins | Step insurges stay arrested | P5 |
| Full-SGTR leak ÷ charging_max | **0.12 ÷ 0.06 — SET (P5)**, ΔP-scaled to zero at SG pressure | leak wins 2×; depressurization kills it | Full SGTR *forces* trip + SI; the EOP works (FG-6) | done |
| AFW cap ÷ post-trip decay heat | 0.15 (recovers ~5 min) | keep | Post-trip SG recovery tempo (FG-5) | P4 |
| No-load Tavg anchor | **297 °C — SET (P3, 2026-07-21)** | dump setpoint 8.23 MPa = Psat(297); shallow 7 °C program | Post-trip shrink bite; program span (FG-5/FG-2) | done |
| `K_sg_level` / dump rate | 5.0 | tune with anchor | Shrink depth/speed (FG-5) | P4 |
| Heater capacity ÷ outsurge | recovers ≤ ~5 min | keep | Post-trip pressure recovery tempo | P4 |

## 3. FG-1 — Startup & shutdown discipline

*Feel: deliberate and procedural. Hours-scale evolutions, the instrument ladder respected,
nothing jumps the queue. Already the sim's strength — carried forward unchanged.*

| ID | Behavior | Probe | Status |
|----|----------|-------|--------|
| EV-9 | 1/M approach: doubling behavior, SR→IR→PR overlap, P-6/P-10 ladder, IR/PR backstops | campaign startup ×2, NIS suite | PASS |
| EV-10 | Turbine roll & sync: vacuum required, overspeed 1980 rpm, sync at rated rpm | run_pwr loss_vacuum, overspeed | PASS |
| EV-1 | Mode 5→1 heatup ≤ 28 °C/hr; bubble drawn before Mode 4→3; no spurious ESF (P-11) | run_pwr roundtrip, m5 suite | PASS |
| EV-2 | Cooldown ≤ 55 °C/hr; RHR interlock < 2.76 MPa; borate on cooldown | run_pwr rhr_valve, ops cooldown | PASS |
| SS-7 | Cold shutdown hold: RHR carries decay heat, shutdown boron | run_pwr cold_shutdown_hold | PASS |
| SS-4 | HZP/Mode 3 standby: Tavg = no-load anchor, dump holds SG at Psat(anchor) | probe:SS-2 | PASS (program) |

## 4. FG-2 — Steady state & maneuvering

*Feel: the plant holds itself. Any steady state is truly steady; Tavg rides its program up
with load; all-auto load-follow completes hands-off; manual dispatch works but shows you
its consequences instead of hiding them.*

| ID | Behavior | Tier | Probe | Status |
|----|----------|------|-------|--------|
| SS-2 | Tavg **monotonically rises** no-load → full power along this plant's program — **anchors SET: 297 → ~304 °C** (P3, 2026-07-21); level program rides the same line at 2.5 %/°C (~37.5 → 55 %) | I | probe | **PASS — anchors set** |
| SS-1 | 100 % snapshot self-consistent (steam≈feed, charging≈letdown, ΔT per power) | C | probe | PASS — band minted at freeze |
| SS-3 | 50 % point sits *on* the program (no sag) | I | probe:SS-2 | PASS |
| SS-6 | 5 % steady holds indefinitely (xenon at own-power equilibrium) | I | probe | PASS |
| SS-8 | Heat-balance closure ±2 % at any steady state | I | probe | PASS? — pin explicitly |
| EV-4 | All-auto load-follow 100→50→100 hands-off; Tavg tracks program | C | ops load follow | re-band → P3 |
| EV-3 | ±5 %/min ramps: no trip, power follows; rod-less Tavg carries the mismatch (engine pin), program-tracking version in run_autoctl | C | probe + autoctl | **PASS** (P3) |
| EV-5 | Boration/dilution: ~10 ppm step → clear response, −8..−12 pcm/ppm worth | I | campaign pwr_boron | PASS |
| EV-7 | Single rod step at 100 %: flux dip, auto recovery ~2 min, no trip | C | probe:EV-6 | PASS? |
| EV-8 | Xenon transient: peak hours after downpower, needs compensation | I | ops xenon 8h | PASS |
| EV-6 | Slow manual rod insertion, all-auto: walks down smoothly, no scram | C | probe | PASS (regression insurance) |
| **EV-11** | **Manual dispatch shows its costs** (owner-ruled character): a slider-only load drop settles above the ask with Tavg parked high of program (un-trimmed mismatch); the M5 fallback feed parks SG level low until minded (shift-exam gates) | C | probe + shift-exam gates | **PASS** (P3) |

## 5. FG-3 — Physical pressurizer level

*Feel: the level gauge is an honest instrument. It moves because inventory or temperature
moved — and it deceives (TMI) exactly and only when the primary actually voids.*

**DELIVERED 2026-07-21 (feel-plan P2).** Level is now `base(Tavg) + mass term + void term`:
the thermal-expansion base line (2 %/°C, floored at 28 % below the program band, anchored
55 % at full-power Tavg) plus a piecewise mass term (−100 %/frac deficit; +300 %/frac
surplus — surplus packs the pressurizer steam space, the "going solid" regime) plus the
saturation-gated void lift (+150 %/frac — the TMI deception). The CVCS setpoint tracks the
same base line (HR1: indicated Tavg), so expansion never reads as a leak — the #34 bug
class is structurally dead, and the `_mass<=1.0` floor is deleted.

| ID | Behavior | Tier | Probe | Status |
|----|----------|------|-------|--------|
| CC-10 | Level = f(RCS inventory, thermal expansion) + void term **gated on saturation**. Independent level integrator and `_mass<=1.0` charging floor deleted. Level↔inventory track closely outside void regimes (no silent windup) | I | probe | **PASS** (P2, 2026-07-21) |
| CC-10b | Deception boundary: a subcooled loss LOWERS true level; only voiding raises it | I | probe | **PASS** (new fence) |
| SS-5 | Level rises with load — **emergent** from thermal expansion (+ CVCS setpoint curve on the same line) | I | probe | **PASS** (P2) |
| CC-8 | CVCS auto make-up holds the level curve; a leak reads as level-trend + charging-trend divergence (no leak telepathy). Servo settles at charging = letdown + leak *exactly* (the old margin was windup drift) | C | cvcs_level_control + probe | PASS — re-band P3 |
| CA-3 | Level sensor fails HIGH → auto charging backs off, real inventory falls physically deep; caught via trends/subcooling | C | probe | PASS — depth now unbounded (honest) |
| CA-4 | Level sensor fails LOW → charging drives level up; PI-8 high-level trip backstops | C | todo | todo → P4 (needs PI-8) |

## 6. FG-4 — The ride-out signature

*Feel: losing the turbine is a bad afternoon, not a scram. The dump catches the whole load,
the plant settles at no-load, the operator recovers on their own schedule. Trips happen when
a real limit is reached — and then they mean it.*

| ID | Behavior | Tier | Probe | Status |
|----|----------|------|-------|--------|
| TR-1 | **Turbine trip @100 %: NO reactor trip.** Dump (1.05×) picks up the load; the rod-less core self-parks ~75 % with Tavg/level high (asking for trim); the operator walks it to the no-load anchor at their own pace. Probe drives both phases | C | probe | **PASS** (P4, 2026-07-21) |
| TR-6 | 50 % load rejection: a non-event — dump + rods absorb, Tavg returns to program | C | ops grid step | PASS — re-band P3/P4 |
| CC-7 | Steam dump: holds no-load Tavg at HZP; capacity 1.05× (ride-out); **unavailable on lost vacuum/condenser** (engine gate) | C | dump-cap probe + TR-8 | **PASS** (P4) |
| TR-8 | Loss of vacuum @100 %: turbine trips, dump unavailable, **feed dies with the hotwell** (condensate needs the condenser) → SG drains → **genuine-limit trip (SG lo-lo), not anticipation**; tended, the operator runs back | C | probe | **PASS** (P4) |
| TR-9 | SG overfill: P-14 at 90 % → turbine trip + FW isolation, reset 85 % | C | ops p14 + run_pwr | PASS |

## 7. FG-5 — Reactor trip feel

*Feel: dramatic but fair. The board lights up, the SG shrinks visibly, the dump barks, the
handoff to AFW is watchable — and five minutes later the plant is quietly at no-load with
pressure recovered. Nothing about a clean trip should require heroics.*

| ID | Behavior | Tier | Probe | Status |
|----|----------|------|-------|--------|
| TR-7 | Manual trip from 100 %: turbine follows, Tavg → no-load on dump, pzr outsurge dips pressure (heaters recover ≤ ~5 min), level drops but **not to zero**, no SI, rods_tavg self-disengages | C | run_pwr scram + autoctl | PASS — bands at freeze |
| CC-3 | Post-trip feedwater: MFW isolates on trip + low Tavg (P-4 analog), feed_sg stands down with a visible note ("off — main feedwater isolated"), AFW auto-starts and holds its target | C | probe | **PASS** (P4) |
| **TR-15** | **Post-trip SG shrink depth** — current tuning: NR dips to ~13 % min, AFW recovery over minutes. **Owner picks depth via the playtest checklist** (Blueprint/PLAYTEST_CHECKLIST.md); knobs: anchor + `K_sg_level` + `afw_flow_frac` | C | probe:CC-3 | tuned — owner taste pending |
| CC-6 | Heaters restore pressure after outsurge within the ~5 min / 0.207 MPa band | C | probe | PASS |
| PI-7 | Manual scram latches RPS (done); **RPS reset path** exists so a trip is recoverable without restart | C | probe (reset: todo) | latch PASS · reset todo → P4 |

## 8. FG-6 — The casualty ladder

*Feel: graduated severity with honest indications. Small leaks hide inside CVCS capacity and
teach trend-reading; a full SGTR overwhelms charging and forces the EOP; the TMI sequence
runs exactly as canon. Deception lives only where physics puts it.*

**Ladder invariant [I] (new probe): seal leak < small SGTR < charging capacity < full SGTR
< SBLOCA — each rung's response escalates (trend → make-up → trip+SI → ECCS).**

| ID | Behavior | Tier | Probe | Status |
|----|----------|------|-------|--------|
| TR-2 ⚑ | **TMI opener (canon):** loss of MFW → SG lo-lo trips reactor ≤ ~60 s → turbine trips → decay + stored heat repressurize the primary to **PORV lift 16.20 MPa**; spray must lose; AFW starts at 20 % | C | probe | XFAIL → P5 (spray cap) |
| CC-5 | Spray flow cap: arrests a normal step insurge, **cannot** suppress loss-of-heat-sink repressurization | I | probe | XFAIL → P5 |
| TR-3 | TMI-2 proper: TR-2 with AFW blocked → SG dryout ~15–30 min → sustained repressurization/PORV cycling → recovery on block-valve discovery (story clock) | C | todo | todo → P5 (after TR-2) |
| TR-10 | Stuck-open PORV (SBLOCA): depressurize → low-P trip → SI; **indicated level rises while inventory falls** (void deception, canon); block valve terminates | C | run_pwr flagship_tmi + module | PASS |
| CA-1 | TMI-2 module p1–p3 milestones achievable; story clock re-timed after P5 tuning | C | campaign tmi2 | PASS — re-time P5 |
| CA-2 | SBLOCA spectrum: accumulators at 4.14 MPa, RHR/LPI < 2.76 MPa, Tavg pins near saturation on blowdown | C | run_pwr eccs probes | PASS |
| TR-13 | **SGTR, single-SG EOP — DELIVERED (P5):** full severity = 0.12 normalized ≈ 2× charging (leak_scale 1.5), **ΔP-scaled** through the ruptured tube — trip + SI forced (battery pin), and the EOP *depressurize to SG pressure* physically kills the leak (ops scenario: 0.056 → 0.006, inventory recovers, rides the sat-line band on the way down). Steaming the contaminated SG = P6 manual note | C | probe + ops EOP | **PASS** (P5) |
| TR-5 | MSIV closure @100 %: SG safeties pop 9.31/reseat 9.0, primary stabilizes at safeties' Tsat, inventory retained | C | run_pwr msiv | PASS |
| TR-12 | Steam line break: blowdown cooldown → positive reactivity → trip. **"trip + SI" corrected 2026-07-25 (#199): there is no SI on this path and none is needed** — the scrammed core holds ≥ 9,600 pcm subcritical even with the maximum stuck rod (PI-9, §10). **"MSIV limits" was fiction until 2026-07-25** — the break sink ignored valve position; it now depends on break LOCATION: downstream of the MSIV is isolable (shutting it ends the blowdown, SG re-pressurizes to its safeties), upstream is not | C | probe + TR-12b + campaign pwr_slb | **PASS** |
| TR-11 | Spray valve fails open: ~~slow depressurization, heaters lose, low-P trip unless isolated~~ — **row superseded by the P5 spray-capacity-cap ruling** (§12, 2026-07-20). Measured under the cap the heaters WIN: the valve sits at its ~12 % cap, pressure droops 15.41 → 15.33 MPa and parks, heaters hold at ~37 % duty, no trip and no alarm for 30 min. A stuck-open spray valve is a **nuisance, not a casualty** | C | probe + ops heaters-vs-spray | **PASS** — end-state pinned 2026-07-25 (#131) |
| TR-14 | Station blackout: natural-circ-less coastdown, no HPI — **unsurvivable long-term by design** (teaching point; sharper on a single-loop plant — document in manual) | — | campaign fact | PASS — document P6 |
| CA-5 | Tavg instrument failure w/ rods in auto: bounded misdrive, operator takeover note | C | autoctl HR1 | PASS |
| CA-6 | NIS channel loss: SR re-energize at P-6 down-range, ladder blocks honored | C | NIS suite | PASS |

## 9. FG-7 — Protection & interlocks (minimal and legible)

*Feel: every trip traceable to an indication the operator can see. No anticipatory trips —
that is the big-plant compromise this plant doesn't need.*

**This plant's ladder** (adopted from the v2.0 verification — all implemented and PASS;
pressure ordering is an [I] probe: operating 15.41 < PORV 16.20 < high-P trip 16.44 <
safety 17.13 MPa, with reseats ordered below lifts):

| Trip/ESF | Setpoint | Note |
|---|---|---|
| High flux | 120 % | |
| High pzr pressure trip | 16.44 MPa | PORV lifts *first* (tries to save the trip) |
| Low pzr pressure trip | 12.41 MPa | blockable below P-11 (13.6) |
| PORV | 16.20 / 15.86 MPa | |
| Pzr safety | 17.13 / 16.55 MPa | |
| SI | 11.03 MPa | ⚑ raise toward ~12.4 in P5, **TMI clock wins on conflict** |
| Lo-lo SG level trip | 17 % | the heat-sink-loss trip (does TR-2's work — no AMSAC needed) |
| AFW start | 20 % + on loss of both MFW (PI-4, P4) | |
| P-14 SG hi-hi | 90 % → TT + FWI, reset 85 % | |
| SG safeties | 9.31 / 9.0 MPa | |
| Steam dump setpoint | 8.23 MPa = Psat(297 °C) | this plant's anchor, set in P3; consumers derive from config |
| Accumulators | 4.14 MPa | |
| RHR interlock | 2.76 MPa | |
| High Tavg trip | 335 °C | ⚑ keep as harmless legible backstop (owner confirm) |
| Turbine | vacuum 74.5 kPa, overspeed 1980 rpm, trips on reactor trip | |

**Interlock work list (all physical, none anticipatory):**

| ID | Item | Status |
|----|------|--------|
| PI-3 | Reactor trip on SI actuation (`si_trip` @ 11.03, P-11-blockable like lo_press; cooldown procedure blocks BOTH) | **DONE** (P4) |
| PI-4 | AFW auto-start on loss of both MFW (fw_flow < 0.10 above P-9) and on the P-4 handoff | **DONE** (P4) |
| PI-5 | FW isolation on SI (rides the hpi arm), and on trip + low Tavg (P-4) — with CC-3 | **DONE** (P4) |
| PI-7 | RPS reset path: `reset_rps` — refused while a trip signal stands; engine enforces rods-in; ops abuse test drives the recovery leg | **DONE** (P4) |
| PI-8 | High pzr level trip **97 %** — enabled by the power-defect recalibration (owner ruling: `alpha_MTC` → −2.0e-4, real-PWR range; un-trimmed mismatch now ~+7 °C, ride-out swell peaks ~94). CA-4 probe pins both legs: sensed overfill trips; a stuck-low sensor defeats the single channel (teaching point) | **DONE** (P4/P5) |
| PI-9 | SI on low steam-line pressure — verify the SLB gate's path | **RETIRED 2026-07-25 (owner ruling, #199) — see §10.** Verified absent, measured, and ruled not worth adding: the reactivity job does not exist on this plant and adding it does harm |

## 10. Retired (v3 rulings — do not resurrect)

| Item | Was | Why retired |
|---|---|---|
| PI-1 | Reactor trip on turbine trip above P-9 | Ride-out plant; ~100 % dump removes the reason |
| PI-2 | AMSAC turbine trip on lo-lo SG | Lo-lo trips the *reactor*; turbine follows via the existing link |
| PI-6 / TR-4 | P-8 single-loop low-flow trip / "1-of-N pump" transient | Single loop — no partial-flow state exists; loss of *the* RCP hits the total low-flow trip (probe re-labeled, kept) |
| PI-9 | SI on low steam-line pressure | **Owner ruling 2026-07-25 (#199), on measurement, not preference.** The interlock's job in a real plant is *reactivity* — get boron in before an overcooled core with a strong negative MTC walks back to criticality, with the most reactive rod stuck out. Measured here: an SLB against the **maximum** stuck rod (`STUCK_ROD_MAX_FRAC` 0.4 × 8500 = 3400 pcm held out) ends at **ρ = −9,604 pcm**, power 0.000 % — nearly 3× the held worth in spare margin. The job does not exist. Prototyped anyway (`steam_pressure` low @ 4.14 → `set_hpi`): SI fires at 47 s into a primary that never lost a drop and pegs **inventory at the 120 % tank cap** with PZR LVL HI annunciated — an automatic that floods an intact plant. And the one case where injection could matter is already covered: at full break severity the primary does crash and the **accumulators fire at 243 s**, boron 734 → 2500 ppm. Pinned permanently by the `PI-9` probe, which asserts the absence — adding the interlock reddens it and re-opens this ruling deliberately. **The effort went to `TR-12b` instead**, making the MSIV genuinely isolate a downstream break |
| v2.0 fidelity rule | "±15 % of generic Westinghouse" | Bands are minted from this plant's own golden runs at freeze |

## 11. Red-line hotspots — RULED (owner, 2026-07-21)

1. **TR-1/CC-7 dump capacity — RULED: Claude's call, playtest-adjustable.** Decision:
   **1.05 × rated steam flow** — full ride-out with a small margin, but the stored-heat
   burst at trip still swings Tavg visibly before settling (tempo principle: interesting,
   then manageable). Revisit after playtesting.
2. **TR-15 shrink demo — RULED: yes**, owner picks from the two-tuning demo in P4.
3. **TR-8 untended endpoint — RULED: yes** — high-pressure trip by physics.
4. **TR-13 single-SG EOP — RULED: yes**, with a required manual/instructor note that
   multi-loop plants differ (isolate the faulted SG, steam the intact ones) — added to
   the P6 manual work.
5. **High-Tavg 335 °C backstop — RULED: keep.**
6. **SI raise toward ~12.4 — RULED: yes**, TMI story clock has precedence on conflict.
7. **EV-11 manual-dispatch character — RULED: try it** — pinned as intended behavior;
   revisit if playtesting reads it as annoyance rather than teaching.

## 12. Rulings log

- **2026-07-20 (owner):** own plant — 100 MWe single-loop experimental; keep primary
  thermo; ride-out character (dump → ~100 %); Item-1 machinery committed, anchors
  placeholder; TMI-2 canon. (Feel plan v1.0 approved.)
- **2026-07-20 (owner, v2.0 era, still standing):** SGTR leak-scale raise to ~0.12;
  CC-10 physical-level middle path; CC-3 real post-trip feedwater; spray flow cap;
  units/ratings boundary layer; EV-6 closed (unreproducible).
- **2026-07-21 (owner): v3.0 red-line complete** — all seven §11 hotspots ruled (dump
  1.05 delegated, demos yes, TR-8 physics trip, single-SG EOP + multi-loop manual note,
  335 °C backstop kept, SI raise TMI-gated, EV-11 provisional) **plus the tempo
  principle**: fast enough to be interesting, slow enough to be manageable. **v3.0 FROZEN.**
- **2026-07-25 (owner): PI-9 retired, and the MSIV made real (#199).** Two rulings from one
  investigation. **(1) No SI on low steam-line pressure** — decided on measurement, not taste:
  the core cannot return to power even with the maximum stuck rod (ρ ≤ −9,604 pcm), a prototype
  actuation floods an intact primary to the 120 % tank cap, and the severe case already gets
  borated accumulator water. Moved to §10; the `PI-9` probe fences the absence. **(2) The MSIV
  now isolates a DOWNSTREAM steam line break** — the break sink previously ignored valve
  position, so the operator's one lever on the casualty did nothing while the manual and the
  TR-12 row both claimed it did. Break location is now modelled: `steam_line_break` is the
  turbine-hall break (shut the MSIV, blowdown ends, SG re-pressurizes to its code safeties);
  the new `steam_line_break_upstream` is inside containment and unisolable — the honest answer
  for a single-generator plant, which cannot "isolate the faulted SG and steam the intact ones".
  `pwr_slb` uses the upstream variant so its ride-it-out arc stays true. Pinned by `TR-12b`.
- **2026-07-21 (owner): teaching goal declared** (the plant exists to teach PWR physics)
  and **power defect recalibrated** per ruling on the PI-8 conflict: `alpha_MTC`
  −3.3e-5 → −2.0e-4 (real-PWR range). Un-trimmed mismatch +18 → ~+7 °C; slider asks now
  delivered almost exactly; PI-8 implemented at 97 %; EV-11 re-worded to the honest
  character. All 51 campaign gates re-validated green on the new coefficient.
