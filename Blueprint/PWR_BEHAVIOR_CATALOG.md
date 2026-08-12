# SLS-100 Behavior Catalog — v4.0-DRAFT (feel-first; unfrozen 2026-08-12 for #472)

**Status: v4.0-DRAFT — UNFROZEN 2026-08-12 for the #472 pressurizer rebuild; owner ruling
on the amended set pending.** The plant is the **SLS-100** (Single Loop Simulated, 100 MWe
— owner-named; SLX-100 until 2026-08-04, #328). v3.1 was declared FROZEN-FINAL 2026-07-21,
but the freeze had no mechanical lock: nine in-place amendments landed after it, the
battery's own stamps still read v2.0, this header's tally claim ("26 pass / 0 xfail") had
rotted against a live **72 pass / 1 xfail**, and **39 probe IDs asserted behaviour with no
catalog row at all** (mostly the CA-7…CA-25 pressurizer block). v4.0 absorbs them (§13,
§14), adds the #472 rebuild acceptance rows (§13.2), and puts a **mechanical parity lock**
on the freeze: the `CAT-1` probe in `test/run_behavior.js` fails if the catalog's row IDs
and the battery's `COVERAGE` keys ever diverge again. Bands remain minted from this
plant's own tuned golden runs; changes still require an owner ruling; owner playtest
feedback (Blueprint/PLAYTEST_CHECKLIST.md) is the standing re-tune channel.
Companion: `Blueprint/PWR_FEEL_TUNING_PLAN.md` (v1.0, all phases complete).

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

  **The tier describes what the PROBE ASSERTS, not what the row's sentence sounds like**
  *(corrected 2026-08-09, #399)*. A row is `[I]` only if you could carry its assertion to a
  different PWR and expect it to hold. If the check is a numeric band minted from this
  plant's golden runs, the row is `[C]` however universal the English above it reads —
  "Tavg rises monotonically with load" is an invariant, `299…303 °C` is not.

  This was not a labelling nicety. The audit (#344 F6) measured **zero of the seven `[I]`
  rows meeting the definition**: five asserted minted numbers and two asserted nothing
  resembling their claim. `[I]` rows are by construction the ones nobody re-bands after a
  plant change, so a mislabelled one carries an extra layer of protection from exactly the
  review that would catch it — **HR10 with a lock on it**. Rows re-tiered on that basis
  carry `re-tiered #399` in their status.

  **A row whose probe does not assert its claim at all gets neither tier** — it gets
  `NOT ASSERTED`, because picking either one would be answering a question the probe has
  never been asked.
- **Conflicts: physics wins; TMI canon wins over setpoint preferences.** Training beats,
  manuals, and campaign gates get updated to match tuned behavior (all 51 gates re-run at
  freeze).
- Status legend: `PASS` (green today) · `PASS?` (believed right, needs a pin) ·
  `XFAIL→Pn` (known gap, fixed in feel-plan Phase n) · `todo→Pn` (probe not yet written) ·
  `RETIRED` (see §10) · `[NEW-UNMEASURED]` (v4.0: row authored for the #472 rebuild,
  characterisation measurement pending — HR12 says so out loud).

## 2. Design ratios — the feel knobs

Feel is set by capacity *ratios*, not absolute numbers. These are the levers the phases tune:

| Ratio | Today | Direction | Sets the feel of | Phase |
|---|---|---|---|---|
| Steam dump ÷ rated steam flow | **0.40 — SET (2026-07-31)** | the PROTOTYPICAL Westinghouse capacity (WTSM §11.2, ML11223A294); vacuum/condenser-gated | Sized for a 50 % loss of load (40 % dump + a ~10 % core step — **TR-1g**). Past that the ladder runs and the dump is a finite resource you can drive to its stop — which is what makes the P-9 trip demonstrable instead of declared | done |
| Spray ÷ heat-sink-loss insurge | wins (K 1.7, uncapped) | **must lose** (flow cap) | PORV lifts in the TMI opener (FG-6) | P5 |
| Spray ÷ normal step insurge | wins | still wins | Step insurges stay arrested | P5 |
| Full-SGTR leak ÷ charging_max | **0.12 ÷ 0.06 — SET (P5)**, ΔP-scaled to zero at SG pressure | leak wins 2×; depressurization kills it | Full SGTR *forces* trip + SI; the EOP works (FG-6) | done |
| AFW cap ÷ post-trip decay heat | 0.15 (recovers ~5 min) | keep | Post-trip SG recovery tempo (FG-5) | P4 |
| No-load Tavg anchor | **286.0 °C (546.9 °F) — RE-ANCHORED at #419 wave 3** (was 297, the retired P3 feel-plan value) | dump setpoint 7.03 MPa (1020 psi) = Psat(286.0), Ginna's sourced 1005 psig no-load point; program spans 18.5 °C (33.3 °F) | Post-trip shrink bite; program span (FG-5/FG-2) | done |
| `K_sg_level` / dump rate | 5.0 | tune with anchor | Shrink depth/speed (FG-5) | P4 |
| Heater capacity ÷ outsurge | recovers ≤ ~5 min | keep | Post-trip pressure recovery tempo | P4 |

## 3. FG-1 — Startup & shutdown discipline

*Feel: deliberate and procedural. Hours-scale evolutions, the instrument ladder respected,
nothing jumps the queue. Already the sim's strength — carried forward unchanged.*

**The Tier column was added 2026-08-09 (#399).** This table shipped without one, so its six
rows could not carry provenance *even in principle* — which is how EV-1's rate half sat at
`PASS` for months against a driver that measured no rate (#398).

| ID | Behavior | Tier | Probe | Status |
|----|----------|------|-------|--------|
| EV-9 | 1/M approach: doubling behavior, SR→IR→PR overlap, P-6/P-10 ladder, IR/PR backstops | I | campaign startup ×2, NIS suite | PASS |
| EV-10 | Turbine roll & sync: vacuum required, overspeed 1980 rpm, sync at rated rpm | C | run_pwr loss_vacuum, overspeed | PASS — 1980 rpm is this plant's |
| EV-1 | Mode 5→1 heatup **≤ 55.6 °C/hr (100 °F/hr)** — the sourced Technical Specification limit, evaluated as a **rolling hour**, not an instantaneous derivative (*OWNER RULING, 2026-08-09*, choosing "100 F/hr TS + 50 admin" — "Adopt the sourced Tech Spec limit as the hard number … Keep ~50 F/hr as a separate soft administrative target, which is normal practice under a 100 F/hr TS"; sourced ML11223A342:648, ML11223A213:1801). A ~50 °F/hr administrative target is the soft goal and is **not** gated. Bubble drawn before Mode 4→3; no spurious ESF (P-11) | I | **run_pwr `mode5_heatup_paced`** (rate half) + roundtrip, m5 suite | **PASS — rate half asserted 2026-08-09** (49.8 °C/hr worst hour) |
| EV-2 | Cooldown **≤ 55.6 °C/hr (100 °F/hr)**, same limit and same rolling-hour reading; RHR interlock < 2.76 MPa; borate on cooldown | I | ops `cooldown_to_rhr` (paces to 50 °C/hr) + run_pwr rhr_valve | PASS |
| SS-7 | Cold shutdown hold: RHR carries decay heat, shutdown boron | I | run_pwr cold_shutdown_hold | PASS |
| SS-4 | HZP/Mode 3 standby: Tavg = no-load anchor, dump holds SG at Psat(anchor) | C | probe:SS-2 | PASS (program) — anchor is this plant's 286.0 °C |

## 4. FG-2 — Steady state & maneuvering

*Feel: the plant holds itself. Any steady state is truly steady; Tavg rides its program up
with load; all-auto load-follow completes hands-off; manual dispatch works but shows you
its consequences instead of hiding them.*

| ID | Behavior | Tier | Probe | Status |
|----|----------|------|-------|--------|
| SS-2 | Tavg **monotonically rises** no-load → full power along this plant's program — **anchors RE-SET at #419 wave 3: 286.0 → 304.5 °C** (546.9 → 580.2 °F; the 297 → ~304 pair was the retired P3 feel-plan program); level program rides the same line at 1.62 %/°C (`level_per_tavg`, was 2.5) | **C** | probe | **PASS — anchors set** · re-tiered #399: the probe asserts `295…299` / `299…303 °C` and its own comment says *"the anchor numbers are this plant's character"* |
| SS-1 | 100 % snapshot self-consistent (steam≈feed, charging≈letdown, ΔT per power) | C | probe | PASS — band minted at freeze |
| SS-3 | 50 % point sits *on* the program (no sag) — **"sits on" is a claim about a STEADY STATE**, so it needs the steadiness half too (#394: SS-2's single instant read comfortable by 0.36 °C through an 11-point limit cycle) | **C** | probe:SS-11 + probe:SS-2 | PASS · re-tiered #399: it delegates to SS-2's minted `299…303 °C`, so it inherits SS-2's tier and cannot be stronger than it |
| **SS-11** | **A part-power steady state is truly steady** — hands-off from the authored 50 % IC with no command at all, power holds inside 4 pts over an explicit 60–90 min window; the 100 % leg is the calibration control. **This is FG-2's headline invariant, and it was unasserted until #394.** | **C** | probe | **PASS** (1.47 pts; 13.31 pre-fix) · re-tiered #399: *"a steady state is steady"* is an invariant but `4 pts` is this plant's, and the rule is that the tier follows what the probe asserts — including here, where the row calls itself an invariant in its own sentence |
| SS-6 | 5 % steady holds indefinitely (xenon at own-power equilibrium) | **C** | probe | PASS · re-tiered #399: asserts `3…7 %` and flat to `±0.5`, both minted |
| SS-8 | Heat-balance closure **±2 %** between core thermal output and secondary heat removal, at **more than one** steady state | **I** | probe | **PASS — energy term written 2026-08-09 (#397)**; was `PASS?` against two mass balances and a rating check |
| EV-4 | All-auto load-follow 100→50→100 hands-off; Tavg tracks program | C | ops load follow | re-band → P3 |
| EV-3 | ±5 %/min ramps: no trip, power follows; rod-less Tavg carries the mismatch (engine pin), program-tracking version in run_autoctl | C | probe + autoctl | **PASS** (P3) |
| EV-5 | Boration/dilution: ~10 ppm step → clear response, −8..−12 pcm/ppm worth | **NOT ASSERTED** | campaign pwr_boron | **#399: the probe checks INSTRUCTOR CARDS** — *"dilution beat arms"*, *"borate prompt"*, *"Long Game — Played"*. The −8..−12 pcm/ppm worth is asserted nowhere; the row's PASS was the campaign's, not the claim's |
| EV-7 | Single rod step at 100 %: flux dip, auto recovery ~2 min, no trip | C | probe:EV-6 | PASS? |
| EV-8 | Xenon transient: peak hours after downpower, needs compensation | **NOT ASSERTED** | ops xenon 8h | **#399: the probe asserts `'no trip'`** and the peak is an `info` line — logged, never checked. #402's measurement (peak 104.50 % eq at 4.5 h, hands-off OTΔT scram at 13.77 h with 48 min of warning) is the one that could carry this row |
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
| SS-5 | Level rises with load — **emergent** from thermal expansion (+ CVCS setpoint curve on the same line) | **C** | probe | **PASS** (P2) · re-tiered #399: asserts `<= 40 %`, `50…62 %`, `>= 15 %` — three minted numbers |
| CC-8 | CVCS auto make-up holds the level curve; a leak reads as level-trend + charging-trend divergence (no leak telepathy). Servo settles at charging = letdown + leak *exactly* (the old margin was windup drift) | C | cvcs_level_control + probe | PASS — re-band P3 |
| CA-3 | Level sensor fails HIGH → auto charging backs off, real inventory falls physically deep; caught via trends/subcooling | C | probe | PASS — depth now unbounded (honest) |
| CA-4 | Level sensor fails LOW → charging drives level up; PI-8 high-level trip backstops | C | todo | todo → P4 (needs PI-8) |

## 6. FG-4 — The ride-out signature

*Feel: losing the turbine is a bad afternoon, not a scram. The dump catches the whole load,
the plant settles at no-load, the operator recovers on their own schedule. Trips happen when
a real limit is reached — and then they mean it.*

| ID | Behavior | Tier | Probe | Status |
|----|----------|------|-------|--------|
| TR-1 | **FULL load rejection @100 %: NO reactor trip, and the ladder runs in order.** The dump goes to its 40 % stop and STAYS there, so the core sheds the rest through MTC — self-parks ~46 % with Tavg 320.1 °C — the **PORV lifts at 16.37 MPa as the designed backstop** and the pressurizer safety does not; SG safeties graze 9.32. The operator then walks it to the no-load anchor at their own pace. A real Westinghouse plant does not ride a full rejection either (its design case is 50 %), so the relief lifts are prototypical. Contrast **TR-1g** (the 50 % case, which must stay clean) | C | probe | **PASS** (re-banded 2026-07-31 for the 40 % dump) |
| TR-1g | **50 % loss of load: no trip, no relief lift — THE case the 40 % capacity is sized for.** *"designed for 40 percent of rated steam flow… in conjunction with a 10 percent reactor power decrease, of 50 percent rated steam flow without a trip"* (STPEGS UFSAR §10.4.4, ML22140A078). Measured, this plant reproduces the documented SPLIT: dump saturates at 40 %, core takes a 10.7 % step to 89.3 %, Tavg peaks 307.4 °C, nothing lifts. Ours comes from MTC rather than rod control — same division of labour, different mechanism. This is the check that says 40 % is ENOUGH | C | probe | **PASS** (NEW 2026-07-31) |
| TR-1c | **Sub-threshold load rejection: operator-managed, and since #418 the cliff is THERMAL.** Below the C-7 arm (`dump_load_reject_mwe` 40 MWe) the fast dump does not arm at all — on the derived secondary clock (#418 wave A1) 39 MWe rejected hands-off peaks Tavg 315.6 °C with spray holding pressure 0.66 MPa clear of the PORV, while 41 MWe arms and is caught at 305.8 °C on program: a ~10 °C cliff read on the Tavg/Tref deviation, no valve lift. (Pre-#418 the compressed SG bottled in seconds and the uncaught side ran pressure to the PORV setpoint — that was the clock's rendering, not the plant's.) **Declared simplification** (DESIGN_COMPANION §8.21), not a defect: any armed system has a threshold, and lowering it destroys the EV-11 load-follow lesson. Probe pins BOTH sides so the cliff cannot move silently | C | probe | **PASS** (ruled 2026-07-27, #219; re-measured 2026-08-07, #418) |
| TR-1d | **Planned offline is NOT a turbine trip.** `disconnect_grid` opens the generator breaker: load → 0, the stop valves stay open, `turbine_tripped` never sets, so **P-9 is never armed** and the evolution is reversible (`connect_grid` re-synchronises). At 100 % the dump catches the rejected load exactly as in TR-1; at 5 % nothing latches, so a later P-9 crossing is not carrying a trip from the start of the heatup. A real turbine trip still arrives by its own routes — `trip_turbine` (low-vacuum/overspeed actuation, `turbine_trip` failure), a reactor trip, or MSIV closure at load. Contrast TR-1 (load rejection) and TR-1b (turbine trip → P-9 scram) | C | probe | **PASS** (ruled 2026-07-28, #230) |
| TR-1f | **P-9 is an INSTRUMENT reading, and a failed power-range channel defeats it.** The real permissive comes off the nuclear instrumentation and nothing else — *"actuated at approximately 50% power as determined by two-out-of-four NIS power range detectors"* (NUREG-1431 Rev 4 Bases B 3.3.1, ML12100A228). Ours read true `power_pct`, so the permissive gating **two reactor trips and the loss-of-main-feed AFW start** could not be fooled by the channel it reads (HR1). Measured: channel stuck at 40 % with the core at 100 % still scrammed on a turbine trip at +0.5 s; de-armed, the plant rides the trip out on the 105 % dump instead, and the SG hi-hi does its un-gated half (isolate feed, trip the turbine) without scramming — trips 59 s later on `sg_level low`, a genuine limit. **Declared departure** (DESIGN_COMPANION §8.11): one channel, not 2/4, so a single failure defeats it here where a real plant out-votes it | C | probe | **PASS** (2026-07-31, #220) |
| TR-6 | 50 % load rejection: a non-event — dump + rods absorb, Tavg returns to program | C | ops grid step | PASS — re-band P3/P4 |
| CC-7 | Steam dump: holds no-load Tavg at HZP; capacity **0.40×**, the prototypical Westinghouse value; **unavailable on lost vacuum/condenser** (engine gate) | C | dump-cap probe + TR-8 | **PASS** (capacity re-set 2026-07-31) |
| TR-8 | Loss of vacuum @100 %: turbine trips, dump unavailable, **feed dies with the hotwell** (condensate needs the condenser) → SG drains → **genuine-limit trip (SG lo-lo), not anticipation**; tended, the operator runs back | C | probe | **PASS** (P4) |
| TR-9 | SG overfill: P-14 at 90 % → turbine trip + FW isolation, reset 85 % | C | ops p14 + run_pwr | PASS |

## 7. FG-5 — Reactor trip feel

*Feel: dramatic but fair. The board lights up, the SG shrinks visibly, the dump barks, the
handoff to AFW is watchable — and five minutes later the plant is quietly at no-load with
pressure recovered. Nothing about a clean trip should require heroics.*

| ID | Behavior | Tier | Probe | Status |
|----|----------|------|-------|--------|
| TR-7 | Manual trip from 100 %: turbine follows, Tavg → no-load on dump, pzr outsurge dips pressure (heaters recover ≤ ~5 min), level drops but **not to zero**, no SI, rods_tavg self-disengages | C | run_pwr scram + autoctl | PASS — bands at freeze |
| **TR-7b** | **Post-trip leg ΔT — decay heat still leaves through the legs.** Heat removed = flow × leg ΔT, and that does not stop holding when the rods drop: a core rejecting X % of rated heat through Y of rated flow develops **(X / Y) of the rated split**. Measured post-scram at full flow, **3.93 °F at t+3 min** (6.61 % decay heat) and **2.35 °F at t+30 min**; lose the pumps and the same heat through `flow_floor` opens it to **37.4 °F**. **The operator-facing half is the point** — the indicated split must stay positive and clear instrument noise, or the board shows a hot leg colder than the cold leg | C | probe | **PASS** (#315, 2026-08-03 — the split read FISSION power, so post-trip ΔT was **0.0 °F** and the indicated sign was a coin flip, 48 % inverted) |
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
| Steam dump setpoint | 7.03 MPa (1020 psi) = Psat(286.0 °C) | Ginna's sourced 1005 psig no-load point (#419 wave 3; was 8.23 = Psat(297), the retired P3 anchor); consumers derive from config |
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
| PI-9 | SI on low steam-line pressure | **Owner ruling 2026-07-25 (#199), on measurement, not preference.** The interlock's job in a real plant is *reactivity* — get boron in before an overcooled core with a strong negative MTC walks back to criticality, with the most reactive rod stuck out. Measured here (pre-#260): an SLB against the **maximum** stuck rod (`STUCK_ROD_MAX_FRAC` 0.4 × 8500 = 3400 pcm held out) ended at **ρ = −9,604 pcm**, power 0.000 % — nearly 3× the held worth in spare margin. The job does not exist. **Re-measured at engine+M4 after #260, and the margin is LARGER, not smaller.** Rod worth went to the real measured 4068 pcm, so the maximum held worth is **0.4 × 4068 = 1627 pcm**. Measured at engine+M4 (`OpsHarness`, the same layer as the −9,604 pcm above), SLB severity 1.0 against the maximum stuck rod: scram at 0.3 s, end power **0.000 %**, end **ρ = −27,458 pcm** — **16.9×** the held worth. Safety injection *does* fire in this case and carries the primary to **2500 ppm** (RWST boron), which is most of where that margin comes from; the recalibrated differential boron worth being larger cold (≈13.4 pcm/ppm at 218.8 °F / 103.8 °C) supplies the rest. **The job still does not exist, and the cushion is not in question.**

  **A correction worth reading, because it is the layer trap in CLAUDE.md's own table.** An earlier revision of this entry (2026-07-29, #260) claimed the premise had fallen to **1.26×** and that "the cushion it was argued from is largely gone". That came from an **engine-direct** probe measuring −2049 pcm — a layer with **no HPI at all**, so the 2500 ppm injection that dominates the real answer never happened. The caveat was stated at the time; the conclusion drawn next to it was not entitled to that number anyway. Withdrawn. Note also that the exact configuration behind the original −9,604 pcm is not fully reconstructible (the `PI-9` probe itself runs severity **0.8** and injects **no** stuck rod, and asserts SI never fires — which holds at that severity), so treat −27,458 pcm as the worst-case number and −9,604 as historical. Prototyped anyway (`steam_pressure` low @ 4.14 → `set_hpi`): SI fires at 47 s into a primary that never lost a drop and pegs **inventory at the 120 % tank cap** with PZR LVL HI annunciated — an automatic that floods an intact plant. And the one case where injection could matter is already covered: at full break severity the primary does crash and the **accumulators fire at 243 s**, boron 734 → 2500 ppm. Pinned permanently by the `PI-9` probe, which asserts the absence — adding the interlock reddens it and re-opens this ruling deliberately. **The effort went to `TR-12b` instead**, making the MSIV genuinely isolate a downstream break |
| v2.0 fidelity rule | "±15 % of generic Westinghouse" | Bands are minted from this plant's own golden runs at freeze |

## 11. Red-line hotspots — RULED (owner, 2026-07-21)

1. **TR-1/CC-7 dump capacity — SUPERSEDED 2026-07-31.** The P4 decision was
   **1.05 x rated steam flow** (Claude's call, playtest-adjustable, "revisit after
   playtesting"). Revisited: **0.40** *(OWNER RULING, 2026-07-31: "Let's change it to
   40%.")*, the prototypical Westinghouse capacity (WTSM 11.2, ML11223A294). The 1.05
   figure was never sourced, and measured it produced a NON-EVENT - a total loss of load
   reached Tavg 305.3 C with power holding 97.5 %, i.e. the plant barely noticed, which is
   the opposite of the tempo principle it was chosen to serve. See DESIGN_COMPANION 8.17
   (retired) and #220.
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
  and **power defect recalibrated** per ruling on the PI-8 conflict (`alpha_MTC` was replaced by a density-shaped moderator model in #260, which reproduces this value to within 9 % at the operating point): `alpha_MTC`
  −3.3e-5 → −2.0e-4 (real-PWR range). Un-trimmed mismatch +18 → ~+7 °C; slider asks now
  delivered almost exactly; PI-8 implemented at 97 %; EV-11 re-worded to the honest
  character. All 51 campaign gates re-validated green on the new coefficient.
- **2026-08-12 (Fable, DRAFT — awaiting owner ruling; #472):** v3.1 unfrozen → **v4.0-DRAFT**
  per the approved #472 pressurizer-rebuild plan (method step 2). Findings that forced it:
  the freeze had no mechanical lock (nine in-place amendments since FROZEN-FINAL; the
  battery stamps read v2.0; the header tally claimed 26 pass against a live 72 pass /
  1 xfail), and **39 probe IDs had no catalog row** — the CA-7…CA-25 block, i.e. most of
  the pressurizer's real acceptance surface, was asserted in code with no owner ruling
  behind it. Amendment: **§13** (FG-8, the pressurizer — 13 absorbed rows + 18 rebuild
  acceptance rows marked `[NEW-UNMEASURED]`), **§14** (26 absorbed non-pressurizer rows),
  and the **CAT-1 parity probe** locking catalog IDs ↔ battery `COVERAGE` keys. Absorbed
  rows document what the probes already assert (status unchanged); nothing was re-banded.
  **The owner rules this amended set before Phase-1 characterisation begins.**

## 13. FG-8 — The pressurizer as a machine (v4.0, #472)

*Feel: the pressurizer is an honest machine with visible authorities. Pressure moves
because surge, heaters, spray or relief moved it — never because a hidden term holds the
operator's setpoint. The gauge deceives (TMI) exactly and only when the primary voids.*

**This section is the acceptance surface for the #472 rebuild.** §13.1 absorbs the
pressurizer probes that were asserted in the battery without catalog rows (the v4.0
finding); their claims document what the probes already check — status unchanged, nothing
re-banded. §13.2 is the rebuild's new acceptance set, `[NEW-UNMEASURED]` until Phase-1
characterisation supplies the numbers. **The MANUAL-FIRST directive (owner, 2026-08-12,
CLAUDE.md) governs the MO rows**: manual-mode behaviour is established first; the auto
rows then assert the controller holds what manual proved.

### 13.1 Absorbed pressurizer rows (probes existed; rows did not)

| ID | Behavior | Tier | Probe | Status |
|----|----------|------|-------|--------|
| CA-7 | SBO delivers 0 % heater power against both a full manual demand and an AUTO demand, selector untouched, no phantom-heat pressurization; a plain LOOP is NOT a blackout — heaters are SHED (B 3.4.9) with demand standing, and a manual reload onto the diesels answers at full power | I | probe | PASS — absorbed v4.0 |
| CA-9 | Loss of CVCS make-up never uncovers the core and parks the gauge deep in alarm (< 25 %); a deficit moves level as far as an equal surplus on ONE slope, and that slope is the sourced 776 ± 20 %/frac geometry; the low-level letdown isolation fires with the core still covered; a beyond-capacity leak scrams on an inventory path | I | probe | PASS — absorbed v4.0 |
| CA-10 | The 17 % low-level heater cutoff (WTSM 10.3 §10.3.4.1), 20 % restore latch: never fires in normal ops; below the cutoff no SUSTAINED heater power under a standing demand; a transmitter stuck at 20 % DEFEATS it (HR1 — instrument-driven); SI shed reloads first (#447) | I | probe | PASS — absorbed v4.0 |
| CA-12 | A water-solid RCS repressurizes: pressure RESPONDS (> 50 psi swing), the PORV terminates the fill, inventory settles ON the config-computed solid point and never reaches the mass_max clip; a bubbled plant is untouched | I | probe | PASS — absorbed v4.0 |
| CA-13 | A heatup fills the pressurizer solid — the level LINE is unbounded upward (> 105 % peak) while the level PROGRAM stays clamped at its ceiling; hands-off, the casualty is relief-ladder boiloff | I | probe | PASS — absorbed v4.0 |
| CA-15 | A LIQUID break fills to SOLID and arrests THERE — on the config-computed solid line (109.28 % vs 109.3 predicted), never at the 120 % mass_max clip; a solid plant's break adds NO separate leak_depress term | C | probe | PASS — absorbed v4.0 |
| CA-17 | Break and relief read the LIVE containment backpressure (exact-formula clone pairs through the real stepInventory/stepPressure) | C | probe | PASS — absorbed v4.0 |
| CA-18 | A loop break DRAINS the pressurizer (TRUE level < 25 at core-top uncovery; indicated never re-rises past 75); the RELIEF path keeps the FULL lift (the TMI fence, exact); void 0.2 on the deception line reads 78.3 ± 0.2 %; boundary flicker can only ratchet the credit DOWN | C | probe | PASS — absorbed v4.0 |
| CA-19 | A refilled solid RCS with a break settles at injection = discharge (mass frozen on the solid line, both streams flowing, pressure at the config-solved balance); injection defeated, the same state DRAINS | I | probe | PASS — absorbed v4.0 |
| CA-20 | A loop break vents the RCS toward containment — falls past Psat of the hot remnant and never below the LIVE backpressure; SGTR and relief keep the saturation pin (clone-triplet algebra) | I | probe | PASS — absorbed v4.0 |
| CA-20b | A small break holds its plateau — the STEAM GENERATORS hold the primary up: never > 51 psi below its own heat sink AND the secondary not drained through the tubes | I | probe | **XFAIL** (#451; the plateau was HEATER-HELD, #447 shed removed the prop — **do NOT re-band green**) — absorbed v4.0 |
| CA-23 | The pressurizer node: no-leak families BITWISE the frozen levelRaw line (< 1e-9); the node IS its law; credit ∈ [0, level_per_void·void]; pre-node saves seed bitwise | C | probe | PASS — absorbed v4.0 · **dies with v1 at #472 cutover → CV-1…4** |
| CA-25 | Safety injection SHEDS the heaters (NUREG-0737 II.E.3.1 (7)); the post-LOCA plant SETTLES instead of limit-cycling (0 heater samples in the settled tail, ≤ 2 reversals); HEATER AUTO clears the shed and answers; the operator's manual demand is never overwritten | I | probe | PASS — absorbed v4.0 |

### 13.2 Rebuild acceptance rows (#472) — `[NEW-UNMEASURED]` until Phase 1

**MO — manual-first pressure authority** (the §5 defect class; today ZERO probes at any
layer run with the pressure channel disengaged):

| ID | Behavior | Tier | Probe | Status |
|----|----------|------|-------|--------|
| MO-1 | Normal-ops surge → pressure coupling with the pressure channel DISENGAGED (heaters + spray manual-fixed): a 100→70→100 MWe swing moves pressure with the insurge — correct sign, order tens of psi. v1 measured: **0 psi** as shipped, **+31 psi** with the restore term ×0.001 (dossier §5). **Band deliberately deferred to v2's first measurement** — v1's number is sign-and-order only | C | todo→#472-P3 | [NEW-UNMEASURED] |
| MO-2 | Reactor-trip outsurge, MANUAL: with heaters/spray fixed, a ~30 °F Tavg collapse DROPS pressure and it STAYS down — no hidden restore. v1 measured: 2235 → 2234 → 2235 psi, a 1 psi response (#471 pass A — not credible; real plants drop several hundred psi) | C | todo→#472-P3 | [NEW-UNMEASURED] |
| MO-2b | Reactor-trip outsurge, AUTO: the heaters recover pressure to setpoint on the CC-6 tempo (~5 min / 0.207 MPa band) — the controller holds what MO-2 proved manual | C | todo→#472-P3 | [NEW-UNMEASURED] |
| MO-3 | Manual heater step authority: from a steady manual lineup, a heater step raises pressure at the DECLARED authority (sourced ceiling 1.586e-3 MPa/s × the §6.4-ruled departure multiplier) | C | todo→#472-P3 | [NEW-UNMEASURED] |
| MO-4 | Manual spray step authority: a spray step lowers pressure at its declared authority, capped (CC-5's cap still binds) | C | todo→#472-P3 | [NEW-UNMEASURED] |

**TD — the TMI deception, named and numbered** (the flagship's teaching payload; scope
B's highest-risk preserved behaviour):

| ID | Behavior | Tier | Probe | Status |
|----|----------|------|-------|--------|
| TD-1 | The deception is a DIFFERENCE: d(level)/d(1−m) on the relief path = −level_per_mass + void_gain·level_per_void = **+350 %/frac**, computed from config, not transcribed | C | todo→#472-P3 | [NEW-UNMEASURED] |
| TD-2 | Calibration point: void 0.2 on the deception line reads **78.3 ± 0.2 %** — past the 75 % high alarm (today CA-18 leg C) | C | CA-18 today · todo→#472-P3 | [NEW-UNMEASURED] |
| TD-3 | Flagship episode: > 25-point indicated lift over 1200 s with inventory FALLING (measured shape: 0 → 66 % at ~22 min through 92 % inventory) | C | run_pwr flagship_tmi | PASS today — preserved |
| TD-4 | Mission crest: full-stack indicated pzr_level crosses **65.0** and crests ~69.4 % at ~50 min — the TMI-2 story clock rides this number | C | campaign tmi2 | PASS today — preserved |
| TD-5 | Relief is NOT surge: PORV/safety flow moves the level law by exactly NOTHING (w = 1 on the relief path); a LOOP break suppresses the lift | I | CA-18 today · todo→#472-P3 | [NEW-UNMEASURED] |
| TD-6 | No-ratchet: the void credit stays in [0, calibration·void]; saturation-boundary flicker can only ratchet DOWN | I | CA-18/CA-23 today · todo→#472-P3 | [NEW-UNMEASURED] |

**HE — heater elevation** (ruled decision 3: physical elevation with progressive
authority loss replaces the 17 % cliff; the S1 bistable survives ON TOP as protection):

| ID | Behavior | Tier | Probe | Status |
|----|----------|------|-------|--------|
| HE-1 | Delivered heater power falls PROGRESSIVELY as TRUE level falls through the bank (wetted fraction over the elevation band) — replacing the 0-or-full cliff (#348/#447 are what a cliff does) | C | todo→#472-P3 | [NEW-UNMEASURED] |
| HE-2 | The S1 bistable survives on top: 17 % cut / 20 % restore latch on INDICATED level (HR1) — protection independent of the physics (today CA-10) | I | CA-10 today | PASS today — preserved |
| HE-3 | Failed transmitter: the latch is fooled exactly as the operator is (CA-10 leg), and the PHYSICS now bounds the damage — #334's 2207-psi steam-heating deadhead becomes unreachable | C | todo→#472-P3 | [NEW-UNMEASURED] |

**SB / SA / BD — small-break lift, solid plant, blowdown:**

| ID | Behavior | Tier | Probe | Status |
|----|----------|------|-------|--------|
| SB-1 | Small-break lift (S8, IE Bulletins 79-06A/C): at seal-leak severities the w-split preserves the lift (the ~65 % magnitude is this plant's — shape sourced, scale fitted); at board-LOCA leak the lift is suppressed (w ≈ 0.12) | C | CA-18 leg B today · todo→#472-P3 | [NEW-UNMEASURED] |
| SA-1 | Solid arrest: a filling casualty arrests ON the geometry (~109.3 % inventory), never at the 120 % numerical clip (CA-15, preserved through the rebuild) | C | CA-15 today | PASS today — preserved |
| SA-2 | Solid bulk-modulus response: at solid, dP follows the bulk law (v1 effective 1300 MPa per RCS-mass-frac); spray has NO pressure authority at solid (`Manuals/12` §12.4c is load-bearing) | C | todo→#472-P3 | [NEW-UNMEASURED] |
| BD-1 | A vented RCS equalises with containment (S7, WTSM 5.0 §5.0.1.1): the blowdown ends AT live backpressure, never below (CA-20, preserved through the rebuild) | I | CA-20 today | PASS today — preserved |

**CAT — the catalog's own lock:**

| ID | Behavior | Tier | Probe | Status |
|----|----------|------|-------|--------|
| CAT-1 | Catalog ↔ battery parity: every `COVERAGE` key in test/behavior_pwr.js has a catalog row; every catalog row's probe pointer resolves (todo/existing allowed); the battery's printed catalog version matches this file's header | I | probe | PASS (new, v4.0) |

## 14. Absorbed coverage — non-pressurizer probes that predate v4.0 rows

**Same finding as §13.1, outside the pressurizer.** These rows document what the battery
already asserts; status unchanged, nothing re-banded. They may migrate into their FG
tables at the next ruled amendment — the point today is that every asserted behaviour has
a row an owner ruling can reach.

| ID | Behavior | Tier | Probe | Status |
|----|----------|------|-------|--------|
| CA-8 | SBO AC-load roster: letdown isolates, charging delivers nothing (demand latched, selector in RUN), demanded SI makes no flow and no head; turbine-driven AFW still makes head and accumulators still dump; a LOOP leaves CVCS + SI working | I | probe | PASS — absorbed v4.0 |
| CA-11 | Break discharge follows RCS pressure — a break is a hole, not a pump: App K orifice law, √Δp within 2 % across the blowdown with LIVE backpressure, exponent 0.5 ± 0.05; SGTR scales on primary−secondary ΔP | I | probe | PASS — absorbed v4.0 |
| CA-14 | Break flash-cooling stops when the flashing does — a drained core is never driven subcooled while the break flows; the flash term is live when saturated and EXACTLY zero when subcooled | I | probe | PASS — absorbed v4.0 |
| CA-16 | Containment receives the discharge: a LOCA pressurizes past the sourced 3.5 psig SI backup, an SGTR BYPASSES (ambient), a stuck PORV pressurizes too; source removed, pressure decays on the running sinks | I | probe | PASS — absorbed v4.0 |
| CA-21 | Subcooling margin goes NEGATIVE over a dry core (core-exit datum, NUREG-0737 II.F.2); covered, the exit datum IS the bulk exactly; a TC failed LOW degrades the gauge to the bulk datum exactly (HR1) | I | probe | PASS — absorbed v4.0 |
| CA-22 | Containment spray auto-actuates inside 3 min past the sourced 30 psig hi-hi, fans realign on SI, spray SECURES ITSELF on recovery (AUTO-ONLY, owner-ruled 2026-08-08) | I | probe | PASS — absorbed v4.0 |
| CA-24 | Hydrogen: mitigated stays cold (< 0.5 v/o vs 4.1 flammability); unmitigated burns ONCE (~85 % consumed, GEND-061), spikes above the 30 psig hi-hi and under 60 psig design; recombiners work the tail and die in a blackout; SGTR H2 never reaches the building | C | probe | PASS — absorbed v4.0 |
| CC-1 | Rod auto-control behaviour — held externally by run_autoctl's rod probes. Claim not audited this pass; the "(re-work with SS-2)" note in COVERAGE looks stale | — | existing:run_autoctl | absorbed v4.0 — **claim held externally, needs an audit pass** |
| CC-2 | Automation channels stay engaged (no silent PID drop-out) — held externally by run_autoctl | — | existing:run_autoctl | absorbed v4.0 — claim held externally |
| CC-4 | Control-layer behaviour, bare pointer — held externally by run_autoctl; the COVERAGE entry names no specific test | — | existing:run_autoctl | absorbed v4.0 — **bare pointer, needs an audit pass** |
| CC-9 | ESF actuation behaviour — held externally by run_pwr + run_campaign pwr_esf | — | existing:run_pwr + campaign | absorbed v4.0 — claim held externally |
| SS-9 | Cold shutdown hands-off stays thermally quiet 30 min (drift ≤ ±5 °C, no trip/spurious ESF, pressure < 4 MPa) — pins the 5 % sg_reverse_frac damping | C | probe | PASS — absorbed v4.0 |
| SS-10 | Severity clamp: out-of-range `inject_failure` severity clamps to ≤ 1.05× one full rupture, not 40 of them | C | probe | PASS — absorbed v4.0 |
| TR-1b | Turbine trip @100 %: P-9 scrams within 5 s, dump carries decay heat, SG safeties never lift, stop-valve leak-through bounded as flow-seconds, PORV holds the burst below its setpoint | I | probe | PASS — absorbed v4.0 |
| TR-1e | Synchronised at zero load: the grid holds the rotor (1800 ± 20 rpm, < 1 MWe); on a 50 % rejection with rods MANUAL the MWe gauge reads the TURBINE while the core stays > 75 %; off line the rotor coasts | I | probe | PASS — absorbed v4.0 |
| TR-1h | Full rejection, rods in AUTO: no scram, dump reaches its stop then comes back off, SG safeties RESEAT, core runs back < 5 %, level-program ceiling holds the peak < 95 % against the 97 % trip | C | probe | PASS — absorbed v4.0 |
| TR-1i | Load-follow tracking: the WTSM ±5 °F duty (scaled by the declared program-span departure to ≤ 5.74 °F, owner-ruled 2026-08-09) on a 10 % step and a 5 %/min ramp; 2 h soak settles inside ±1.5 °F | I | probe | PASS — absorbed v4.0 |
| TR-1k | Sub-threshold rejection, rods AUTO: both lineups end at the backstop; the arm cliff spans ≥ 4 °C; the declared §8.21 non-monotonicity is PINNED (the smaller rejection undershoots deeper — reddening it means revisiting §8.21) | C | probe | PASS — absorbed v4.0 |
| TR-4 | Total loss of forced flow trips the reactor ≤ 15 s on coastdown; no fuel damage in 5 min (natural circulation carries decay heat). Lumped single-RCP model — P-8 selectivity out of scope (PI-6 retired) | I | probe | PASS — absorbed v4.0 |
| TR-12b | The MSIV ends a DOWNSTREAM steam break (self-isolates ≤ 180 s, SG re-pressurizes, overcooling arrests) and cannot touch an UPSTREAM one (same actuation, nothing changes); neither damages fuel | I | probe | PASS — absorbed v4.0 |
| TR-12c | Steam-line isolation fires on the BREAK, not on the plant: a full cooldown does NOT isolate (flow term), a bottled SG at full safety lift does NOT re-isolate (pressure term), and while sealed in `open_msiv` is BLOCKED (WTSM §12.3.5.1) | I | probe | PASS — absorbed v4.0 |
| TR-13b | SGTR save/load: the ΔP-scaled leak survives a restore — same `_leak_base` to 1e-9, `_leak_to_sg` intact | C | probe | PASS — absorbed v4.0 |
| TR-16 | SG code safeties are SELF-ACTUATING: a transmitter stuck below the pop cannot defeat them — they lift anyway and regulate under 9.6 MPa | I | probe | PASS — absorbed v4.0 |
| TR-17 | Atmospheric dump: a cooldown exists WITHOUT the condenser — shipped AUTO ADV modulates and the safeties RESEAT; AUTO only caps pressure, the OPERATOR opening it cools < 230 °C | I | probe | PASS — absorbed v4.0 |
| TR-18 | A manual load step ENDS: no trip, settles at the ask (±2 pts held 5 min, ≤ 25 min), stays settled — the plant does not hunt forever (#378/#394 loop-gain fix) | C | probe | PASS — absorbed v4.0 |
| TR-19 | Unthrottled AFW OVERCOOLS: SG pressure falls, the primary cools with it, ΔT never inverts, and the cooldown DECELERATES hour-over-hour (self-limiting) | I | probe | PASS — absorbed v4.0 |
