# Operations Test Suite — Findings & Tuning Report

**Date:** 2026-07-06
**Suites:** `test/ops_pwr.js` (19 scenarios) · `test/ops_rbmk.js` (29, pre+post) · `test/ops_bwr.js` (18) — 66 scenarios total
**Run:** `node test/run_ops.js [pwr|rbmk|bwr] [test_name]` — results JSON at `Diagnostic/ops_results.json`
**Scoreboard at time of writing:** 51/66 scenarios pass; every remaining FAIL is a deliberate tuning target listed below (no test-authoring failures, no NaN/instability anywhere).

> **Update 2026-07-19 (PWR ops-tuning pass).** PWR ops now **18/19** (total **56/66**). Resolved:
> **P6** (spray floor — spray tapers at Psat(Thot), no crash to the containment floor), **P2**
> (steam-dump capacity capped at ~50 %, a true cap on override + auto), **P1** (SGTR leak rescaled via a
> per-failure `leak_scale` → inventory holds >70 %), **SGTR subcooling** (pressure model now holds
> saturation on a violent depressurization: sat-pull engages on superheat and the subcooled-liquid
> `K_surge`/break terms are suppressed in two-phase; `ops_sgtr_managed`'s EOP was also made faithful —
> throttle the cooldown to hold subcooling margin), and **P3** (`ops_normal_shutdown` — CVCS AUTO now
> holds programmed PZR level, so the rampdown no longer stalls when the pressurizer shrinks). New HARD
> engine guards `cvcs_level_control` + `pressure_saturation_bounds` (run_pwr 26/26 → **28/28**).
> **P4/P5 (load-follow Tavg) DEFERRED** — the one remaining PWR failure. Partial-load Tavg settles
> 291.5 °C (need ≥293) because Tsec is flat while ΔT halves with load. A steam-pressure program to raise
> partial-load Tsec destabilizes load delivery (tried, reverted); the alternative recalibration is pinned
> to full-power Tavg=304 (widest blast radius). Left as a documented tuning gap — a defensible
> sliding-Tavg point — NOT weakened in the test. Details: `Blueprint/BUILD_DECISIONS.md` (2026-07-19) +
> `CHANGELOG.md`. The findings below are the original 2026-07-06 snapshot.

---

## 1. What these suites are

The engine acceptance suites (`run_pwr` etc.) prove the physics **engine-direct, with no
protection layer**. These new **operations suites** measure how the sim behaves **when
operated**: each engine runs UNDER the real Control & Failure Layer (M4), commands descend
through interlocks and interception exactly as from the UI, and protection evaluates at the
M5 broadcast cadence (including its scaling with time acceleration). Two scenario families:

- `ops_*` — evolutions a real plant sees, scripted as an operator following the manual would
  drive them: load-follow cycles, approach to criticality, normal shutdown, paced cooldown,
  xenon holds, LOFW/SGTR/turbine-trip/SBO/ATWS responses.
- `abuse_*` — how a player will actually treat it: yank the rods, open the PORV and walk
  away, slam recirc, spam contradictory commands, crank time acceleration, press the ADS
  button "to see what it does", try to un-scram.

Checks are generous by design; hard failures are reserved for corruption, fuel damage where
protection should prevent it, and grossly unphysical outcomes. `▸` info lines are
measurements captured for this report. **A failing check is a tuning target with its
acceptance test already written.**

## 2. Bugs found and FIXED during this work

1. **BWR: RCIC auto-actuation unit bug (critical — was breaking every assembled-stack BWR
   run).** `bwr_protection.js` actuation `{instrument:'fw_flow', direction:'low',
   setpoint:5.0}` compared a **normalized** (0–1.2) reading against **5.0** → always true →
   RCIC started within a second of every run, flooded the vessel to 100 %, dragged vessel
   pressure into the 5.52 MPa low trip, and made 100 % steady operation impossible. The
   companion level actuation (`vessel_level low 50.0`) also hair-triggered on σ=0.5 noise at
   the nominal 50.0 % level. **Fixed:** `0.05` and `45.0`. The engine suite never saw this
   because it bypasses M4 — exactly the gap the ops suites close. Manual reference
   regenerated; BWR 12/12, M4 11/11, M5 17/17, M7 16/16 after the fix.
2. **`tools/gen_manual_reference.js` and `test/run_procedures.js` could not run at all**
   (crash on load) — they never loaded the newer `engines/load_mode.js`. Fixed. Note: with
   the runner working again, `bwr_sbo_rcic` shows 20/21 procedures passing — the one failure
   is finding **B3** below, not a regression.

## 3. Cross-cutting findings (all three engines)

### C1 — The PWR and BWR high-flux trips can never fire  ⚠ top priority
`crossed()` is strict (`value > setpoint`) and both plants' `power_range` instruments clip at
**exactly** the 120 % trip setpoint — a pegged meter never exceeds it. The RBMK had this same
bug and was fixed by widening its meter to `[0, 200]` (see the comment in `rbmk_config.js`);
the PWR and BWR were never given the same fix.
**Evidence:** PWR `abuse_startup_yank` reaches **529 % power / 1741 °C fuel** (clad damage
threshold 1200 °C) and only trips on lagging `tavg high`; BWR `abuse_rod_yank_at_power` holds
**143.8 % indefinitely with NO trip at all**.
**Fix:** widen `power_range` range to `[0, 200]` in `pwr_config.js` and `bwr_config.js`
(regen manual). Acceptance: those two tests' "capped by protection" checks.

### C2 — Protection latency grows with time acceleration
M5 evaluates M4 once per broadcast (fixed wall cadence), so at 256× the RPS checks the plant
every ~13 **sim**-seconds. RBMK `abuse_accel_latency`: identical rod runaway trips in
**2.0 s at 1× (peak 131 %) vs 16 s at 256× → steam explosion**. The same mechanism softens
PWR/BWR outcomes less only because their excursions are slower.
**Fix:** evaluate trips inside the physics-step loop (every N steps of *sim* time, e.g.
0.1 s), or auto-drop acceleration to 1× when any alarm is newly active. The first is a
small change in `simulation_service.tick()`.

### C3 — There is no way back from a scram (forgiveness gap)
`abuse_scram_then_recover` (all plants): rods relatch closed against withdrawal (good), but
M4's RPS latch and the engine `scrammed` flag never clear — after ANY trip the session is
effectively over except via full reset. Real plants reset the RPS once conditions clear.
**Suggestion:** a `reset_rps` command (allowed only with the tripping condition cleared +
all alarms acknowledged) so a player can recover from a trip and try again — probably the
single highest-value forgiveness feature these tests surfaced.

### C4 — Manual scram doesn't set `rps_state.scrammed`
Only trips set M4's latch, so after AZ-5/manual scram the snapshot reports
`rps_state.scrammed:false` while `true_state.scrammed:true`. UI/Instructor consumers reading
`rps_state` will mislabel a manually scrammed plant.

### C5 — RBMK EPS bypass is cosmetic above the engine
`set_eps_bypass` sets state (and alarms) but **M4 never consults it** — trips still fire
(`abuse_chernobyl_*`: `power_range high` fired with bypass active). The Chernobyl scenario
(M6) needs the bypass to actually inhibit auto-trips, or the historical sequence can't be
walked. Suggestion: honor `eps_bypassed` in `_evalTrips` for the RBMK (data-driven flag on
the trip entries, HR3).

### C6 — Numerical robustness is excellent (positive)
66 scenarios including command-spam, 0↔48 % recirc slams, full blowdowns, 8-h xenon holds
and 256× runs: **zero non-finite values**, no crashes, all state bounded. The fixed-dt
integrator strategy is holding.

## 4. PWR findings

### P1 — SGTR/LOCA leak scaling ~30× too fast; melts at full pressure with no auto-SI  ⚠
`sgtr` severity 0.4 (labelled "3.2 % rated flow") drains **100 % of primary inventory in
~60 s** (`leak_flow` is applied as inventory-fraction/s). The EOP-scripted response
(`ops_sgtr_managed`) still loses the core: the trip fires at 12.41 MPa but HPI only enters
at 11.03 MPa, and the heaters restore pressure in between — so inventory drains at high
pressure with **zero auto injection** (HPI is a trickle against 15 MPa by design).
**Fix (a):** rescale leak severity so 3 % SGTR ≈ tens of minutes to ECCS equilibrium (either
a leak-flow denominator or new `severity_meta`); **(b):** add an SI actuation on
`pzr_level` low-low (real ESFAS has one) — right now the only inventory-protecting trip
path is pressure, which the heaters actively defeat. Acceptance: `ops_sgtr_managed`.

### P2 — Steam dump has unlimited capacity; heaters repressurize absurdly fast
Full dump from hot standby: **Tavg 304 → 105 °C in ~4 min** (real admin limit 55 °C/h; real
dump capacity ~40 % steam flow), SG pressure to 0.1 MPa; during the crash the primary
sat-pulled to 0.10 MPa and then the **heaters restored 15.41 MPa within ~1 min**.
**Fix:** cap `steam_dump_max` effect at partial capacity (~0.4–0.55 rated), floor secondary
pressure at condenser backpressure, and rate-limit heater repressurization. A paced
cooldown (12 % dump pulses) works fine — `ops_cooldown_to_rhr` passes with a beautiful
50 °C/h ramp — so the equipment model just needs its capacity honesty.

### P3 — A by-the-book normal shutdown cannot avoid a reactor trip  ⚠ forgiveness
`ops_normal_shutdown`: 4 %/min rod rampdown with CVCS auto make-up AND a script that pauses
whenever pzr level nears the alarm still ends in a `pzr_level low` scram — mid-power Tavg
sag (P4) shrinks the pressurizer from 55 % below the 12 % trip. Also visible in
`ops_load_follow_daily` (level bottoms at 22 %, `pzr_level_low` alarm on every deep
maneuver).
**Fix:** primarily P4 (the temperature sag is the driver); additionally make CVCS auto mode
hold programmed **level** (not just mass), which is what real CVCS does. Acceptance:
`ops_normal_shutdown` "no scram", `ops_load_follow_daily` level-band check.

### P4 — Partial-load Tavg/SG-pressure program is inverted
At 50 % power Tavg settles **287.6 °C** — *below* both the full-power (304) and no-load
(304) points; SG pressure sags 5.65 → 5.29 MPa. A real plant runs ~292 (no-load) → 304
(full) monotonically, and SG pressure is *higher* at partial load (~6.1–6.4 MPa). The
governor model draws `demand × pressure` so the secondary droops under it.
**Fix:** give the governor pressure-compensated flow (valve position × √ΔP against a
regulated header) or strengthen `K_steam_pressure` so SG pressure rises toward saturation
at reduced steam draw. This single fix likely resolves P3 and most of P5.

### P5 — Load-follow authority is ~25 % of real
+5 % net-demand step from 50 %: MTC alone delivers **+1.2 %**; even with scripted rod assist
the unit caps at **53 %** because achieved steam flow is pressure-droop-limited
(`ops_grid_step`). Real PWRs deliver most of a 5 % step on the reactor-follows-turbine
principle. Same root as P4.

### P6 — Spray can pull primary pressure to 0.1 MPa
`abuse_heater_spray_fight`: full spray beats full heaters and takes the primary to the
containment floor. Spray water is Tcold liquid — physically it cannot pull pressure below
~Psat(Tcold) ≈ 7 MPa. **Fix:** floor the spray term at `Psat(tcold_c)`. (Also shows in
`abuse_command_spam`.) Acceptance: the fight test's `6.5..18` band.

### P7 — Notes / positives
- `ops_loss_of_feedwater_handsoff` is a model response: SG-low alarm at +40 s, AFW
  auto-start, trip at +44 s, level recovery, subcooling held. (Warning-to-trip window is
  only ~4 s — consider slowing SG boil-down slightly to give a player a fighting chance.)
- `abuse_porv_walkaway` is TMI-with-honest-instruments and survives hands-off (trip → HPI).
  Oddity: end state shows inventory 120 % (clip at `mass_max`) with pzr level 7 % — the
  overfill/level bookkeeping disagree; worth a look.
- Startup: the SUR interlock works exactly as intended (267 blocks during a yank, 0–1
  during a careful approach), but after criticality the sim coasts to ~20 % power even when
  leveled with counter-insertion. Real practice stabilizes < 5 %. Consider a slightly
  stronger low-power Doppler bite or gentler mid-curve differential rod worth.
- 8-hour 50 % xenon hold: clean pass, xenon peak 106 %, rods+dilution controller held band
  with zero dilution needed — xenon swing at 50 % may be a touch small (peak ~113 % on the
  daily cycle), fine for v1.

## 5. RBMK findings

### R1 — The post-1986 core can still steam-explode  ⚠ design intent
`abuse_chernobyl_post` (xenon pit + flow starvation + the yank + AZ-5, live protection):
peak **1835× rated**, energy deposition 7341 cal/g/s → `steam_explosion`. The same
mechanism appears at 256× acceleration (C2). The post design intent — "the SAME sequence is
survivable" — is the emotional core of the product, and it currently fails: the void-driven
excursion outruns the 12-s insertion once the power trip finally fires.
**Fix candidates (in preference order):** (a) a **short-period/SUR trip** for the post
version (real post-1986 RBMKs got exactly this class of protection), so the excursion is
caught while insertion still wins; (b) harder saturation of the post void coefficient at
high void (`alpha_void_high_void_gain` is 0.4 — the excursion suggests the *base* term at
low flow is what runs away); (c) post `MAX_PROMPT_GROWTH` 5.0 → lower. Acceptance:
`abuse_chernobyl_post` "must be survivable".

### R2 — Drum level dynamics ~5–10× too fast
`ops_feedwater_dip_*`: a 90-s, 50 % feedwater dip crashes drum level 50 → **7 %** (trip at
10), and after restore the level pegs **100 %**. Real drum time constants are minutes.
**Fix:** reduce `K_drum_level` (4.0) ~5×, and consider a simple feed-follows-steam auto
trim. Acceptance: the dip tests' `50 ±8` recovery check.

### R3 — Post-1986 fine control is knife-edged (only 10 % to the trip)
2-step nudges at full power ran into the 110 % trip during maneuvering; even a SUR-guarded
1-step controller ended a walked flow ramp at 94.3 % (`ops_flow_reduction_post`). Partly
authentic (tight post margins) — but consider slightly higher damping (Doppler) or a
'fine' rod speed so honest maneuvering isn't hair-trigger. All pre-version equivalents pass.

### R4 — Zero-flow aftermath too forgiving
`abuse_zero_flow_*`: MCP flow to zero at 100 % trips promptly (good) but the post-trip
plant sits at ~570 °C fuel indefinitely — decay heat with zero channel flow never dries
out or damages anything. Real consequence: boil-off → dryout → damage over tens of
minutes. Cheap fix: scale `h_fc` with channel flow at decay-heat levels too.

### R5 — Positives worth keeping
- Pre/post scram signatures are distinct and legible (power 2 s after AZ-5 from 100 %:
  **35.4 % pre vs 18.7 % post** — the tip effect visibly bites).
- The xenon pit teaches itself: AZ-5 from the pit **destroys the pre core**
  (`steam_explosion` — the historical trap) and is clean on post; the recorded
  slow-insertion escape gives scenario authors the "skilled path" beat.
- Turbine trip rides on the dump at 7.97 MPa (relief 8.0) both versions; ECCS saves a 30 %
  tube rupture; EPS-bypass yank from the pit only reaches ~10 % power in 15 min (the pit is
  genuinely deep — good).
- Endurance, load-follow (100→50→100), startup, MCP runback: all pass both versions.

## 6. BWR findings

### B1 — (FIXED) RCIC actuation unit bug — see §2.

### B2 — No pressure regulator: uncoordinated power reduction = spurious "LOCA" trip  ⚠
The real BWR control philosophy is **pressure-priority**: the turbine EHC throttles to hold
~7 MPa whatever the power. The sim's turbine follows *power* (with lag) or a *fixed manual
load*, so any meaningful power drop collapses vessel pressure into the 5.52 MPa low trip:
- `ops_recirc_pump_trip` (hands-off): pumps coast → power falls → **pressure-low trip → 0 %**
  (should settle stably at ~40–50 % on natural circulation).
- Recirc load-follow only passes when the script manually walks `set_turbine_load` down in
  step with power (that's how the now-passing test does it).
**Fix:** a behavioral pressure-regulator mode (steam draw slews to hold `vessel_p_rated`,
bounded by governor rate), as the default instead of power-follow. This is the single
biggest BWR operability improvement available. Acceptance: `ops_recirc_pump_trip`.

### B3 — RCIC/HPCI capacity loses to post-trip boiloff
`ops_lofw_handsoff`: hands-off LOFW → RCIC+HPCI both running, yet level falls to **0.6 %**
(full uncovery; no damage only because decay heat is mild). The authored procedure
`bwr_sbo_rcic` (step: level > 40 with RCIC) fails the same way — the engine cannot deliver
the manual's promise. **Fix:** raise `rcic_flow_normalized` (0.01) / `hpci_flow_normalized`
(0.03) or reduce the boiloff/level gain (`K_vessel_level` 5.0) so RCIC roughly balances
decay-heat boiloff a few minutes post-trip (that is its real design basis). Acceptance:
`ops_lofw_handsoff` + `node test/run_procedures.js` (bwr_sbo_rcic).

### B4 — Depressurization paths stall above the LPCI window
- Manual SRV (`ops_sbo_managed`, the Fukushima "do it right" path): 2 h of `open_srv_manual`
  never reaches < 1.03 MPa (stalls against decay steam) — the lesson can't be executed.
- ADS demanded at full-power decay levels stalls at ~2.1–2.3 MPa for 30+ min
  (`abuse_ads_at_full_power` — survivable, but LPCI never comes).
**Fix:** retune `srv_manual_tau` (150) and the blowdown-vs-decay-steam balance, or raise
`lpci_threshold_pressure`. Acceptance: `ops_sbo_managed` depressurization check.

### B5 — LPCI auto-start is gated ONLY on `ads_open`
`abuse_srv_stuck_walkaway`: a stuck-open SRV blows the vessel down to 0.13 MPa with level
→ 0 % and **LPCI never auto-starts** because ADS never opened. Add a low-level +
low-pressure permissive path (real LPCI initiates on level/pressure, not on ADS).
Acceptance: that test's level-defense check.

### B6 — RCIC-on-low-feedwater is non-prototypical
Even fixed, the `fw_flow < 5 %` actuation forces RCIC on during any deliberate low-feed
hold (`ops_scram_level_control` info line). Real RCIC starts on low level (L2) only. With
the level actuation now healthy at 45 %, consider deleting the fw_flow actuation.

### B7 — Missing high-level protection and rod-block
- Overfeed to 150 %: level pegs 100 %, **no alarm, no trip** (real: L8 alarm + feed/turbine
  trip). Add a `vessel_level_high` alarm at least.
- The BWR has no SUR/IRM withdrawal block (PWR and RBMK both have one) — `ops_startup`
  records 0 blocks by design. With C1 fixed the flux trip becomes the backstop; a startup
  rod-block would match its siblings.

### B8 — Positives
- The Isolation Condenser path is excellent: 2 h SBO, pressure held, battery 75 %, level
  stable (`ops_sbo_isolation_condenser`).
- ATWS + SLC + recirc runback shuts the core down cleanly from 128 % peak; turbine-trip
  void-collapse spike (126 %, trip in 2.5 s) is a textbook BWR pressurization transient.
- Recirc slams, command spam, 256× yanks: bounded, no damage, no NaN.

## 7. Suggested priority order

| # | Item | Size | Acceptance |
|---|------|------|-----------|
| 1 | C1 power_range ranges → [0,200] (PWR, BWR) | config | `abuse_startup_yank`, `abuse_rod_yank_at_power` |
| 2 | R1 post-RBMK short-period trip (or void saturation) | config+small | `abuse_chernobyl_post` |
| 3 | B2 BWR pressure-regulator load mode | medium | `ops_recirc_pump_trip` |
| 4 | P1 leak scaling + SI on pzr level lolo | small | `ops_sgtr_managed` |
| 5 | P4 secondary pressure/Tavg program at partial load | medium | `ops_normal_shutdown`, `ops_load_follow_daily`, `ops_grid_step` |
| 6 | B3 RCIC/HPCI vs boiloff rebalance | tune | `ops_lofw_handsoff`, `run_procedures` |
| 7 | C2 protection eval at fixed sim-time cadence | small | rbmk `abuse_accel_latency` |
| 8 | B4/B5 depressurization + LPCI permissive | tune | `ops_sbo_managed`, `abuse_srv_stuck_walkaway` |
| 9 | P2/P6 dump capacity cap, spray Psat floor, heater rate | tune | `ops_cooldown` rate info, `abuse_heater_spray_fight` |
| 10 | R2 drum level gain | tune | `ops_feedwater_dip_*` |
| 11 | C3 RPS reset command (forgiveness) | small feature | `abuse_scram_then_recover` (update) |
| 12 | C5 EPS bypass honored in M4 · C4 manual-scram latch · B6/B7 · R3/R4 · P8 polish | small | listed per finding |

Every fix has a red test waiting to turn green; re-run `node test/run_ops.js` after each.
Config changes trigger the manual maintenance rule: `node tools/gen_manual_reference.js` +
`node test/run_procedures.js`.
