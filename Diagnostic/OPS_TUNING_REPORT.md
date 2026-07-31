# Operations Test Suite — Findings \& Tuning Report

**Date:** 2026-07-06
**Suites:** `test/ops\_pwr.js` (19 scenarios) · `test/ops\_rbmk.js` (29, pre+post) · `test/ops\_bwr.js` (18) — 66 scenarios total
**Run:** `node test/run\_ops.js \[pwr|rbmk|bwr] \[test\_name]` — results JSON at `Diagnostic/ops\_results.json`
**Scoreboard at time of writing:** 51/66 scenarios pass; every remaining FAIL is a deliberate tuning target listed below (no test-authoring failures, no NaN/instability anywhere).

> \*\*Update 2026-07-19 (PWR ops-tuning pass).\*\* PWR ops now \*\*18/19\*\* (total \*\*56/66\*\*). Resolved:
> \*\*P6\*\* (spray floor — spray tapers at Psat(Thot), no crash to the containment floor), \*\*P2\*\*
> (steam-dump capacity capped at \~50 %, a true cap on override + auto), \*\*P1\*\* (SGTR leak rescaled via a
> per-failure `leak\_scale` → inventory holds >70 %), \*\*SGTR subcooling\*\* (pressure model now holds
> saturation on a violent depressurization: sat-pull engages on superheat and the subcooled-liquid
> `K\_surge`/break terms are suppressed in two-phase; `ops\_sgtr\_managed`'s EOP was also made faithful —
> throttle the cooldown to hold subcooling margin), and \*\*P3\*\* (`ops\_normal\_shutdown` — CVCS AUTO now
> holds programmed PZR level, so the rampdown no longer stalls when the pressurizer shrinks). New HARD
> engine guards `cvcs\_level\_control` + `pressure\_saturation\_bounds` (run\_pwr 26/26 → \*\*28/28\*\*).
> \*\*P4/P5 (load-follow Tavg) DEFERRED\*\* — the one remaining PWR failure. Partial-load Tavg settles
> 291.5 °C (need ≥293) because Tsec is flat while ΔT halves with load. A steam-pressure program to raise
> partial-load Tsec destabilizes load delivery (tried, reverted); the alternative recalibration is pinned
> to full-power Tavg=304 (widest blast radius). Left as a documented tuning gap — a defensible
> sliding-Tavg point — NOT weakened in the test. Details: `Blueprint/BUILD\_DECISIONS.md` (2026-07-19) +
> `CHANGELOG.md`. The findings below are the original 2026-07-06 snapshot.

> \*\*Update 2026-07-19 (test-suite review pass — see `Diagnostic/TEST\_SUITE\_REVIEW\_2026-07-19.md`).\*\*
> \*\*C1 is FIXED\*\*: `power\_range` widened to `\[0,200]` in BOTH `pwr\_config.js` and `bwr\_config.js`
> (the RBMK fix, applied to the other two plants). BWR `abuse\_rod\_yank\_at\_power` now PASSES
> (trips on `power\_range high`). The acceptance tests were re-pointed first — the old PWR
> acceptance (`abuse\_startup\_yank` "capped by protection") went dead when the SR trip started
> catching the yank at 0.02 %: C1's PWR acceptance is now HARD "protection tripped" checks in
> `abuse\_accel\_latency` (pass at 1× AND 256×), and the BWR engine suite gained `protection\_trips`
> (steady-state negative control + trip-table shape pin + overpower excursion that asserts the
> meter reads past 120 and the trip fires — the BWR suite previously had zero trip assertions).
> \*\*C2 now has a hard acceptance check\*\*, deliberately RED: RBMK `abuse\_accel\_latency`
> "256×: same protection outcome as 1×" (currently steam\_explosion — the finding's exact
> signature). New PWR ops scenario `ops\_sg\_overfeed\_p14` (P-14 acceptance, passes). Scoreboard
> after this pass: \*\*57/67\*\* (PWR 19/20 — P4 only; RBMK 24/29 — R1/R2/R3 + the new C2 red;
> BWR 14/18 — B2/B3/B4/B5). `run\_procedures` now carries B3 as a strict expected-fail
> (`✗(known B3)`, gate exits 0; an XPASS turns the gate red so the annotation can't go stale).

> **Update 2026-07-22 (CVCS pressurizer drain-rate tuning target — owner request).** New PWR ops
> probe `ops_cvcs_pzr_drain_rate` measures how fast an uncompensated letdown orifice (~20 gpm, with
> charging and CVCS-auto secured) walks the pressurizer down — the "you shouldn't be able to drain the
> plant in 30 s" concern. **Deliberately RED (P7):** a 15 % pzr drop takes ~5 s (~179 %/min) where a
> real ~20 gpm bleed against a real pressurizer + RCS inventory needs MINUTES. The cause is structural,
> not a knob: letdown/charging share the lumped inventory scale with LOCA/leak/ECCS and
> `level_per_mass = 100` maps pzr level to RCS mass 1:1 (`pwr_primary`), so ~20 gpm reads as ~3 %/s of
> inventory. The fix is a coupled retune — rescale the CVCS↔inventory coupling off the LOCA scale
> without breaking leak/LOCA make-up calibration (see `Blueprint/BUILD_DECISIONS.md` "CVCS make-up —
> bumpless transfer + letdown isolation", 2026-07-21). Pressure holds on the heaters through the drain,
> so there is no HPI confound — a clean letdown-out measurement. The probe's other checks PASS (the
> low-level letdown-isolation interlock holds; the primary is not drained to empty). Scoreboard:
> **58/68** — PWR adds this one RED; all prior tallies unchanged.

> **Update 2026-07-22b (P7 RESOLVED — CVCS↔inventory retune; P1(b) closed; SGTR re-anchored).**
> Owner-requested tuning pass, superseding the 2026-07-21 "do not rescale" ruling. New
> `cvcs_inventory_gain = 0.012` converts CVCS normalized flows (gauge scale: orifice A 0.030 ≡ 20 gpm)
> into inventory-fraction/s in `pwr_primary.stepInventory`; leak/ECCS/relief keep the fast accident
> scale. Uncompensated orifice-A drain is now **~2.2 %/min** of pzr level (15 % in ~7 min — the probe's
> ≥300 s acceptance passes with margin); max charging fills ~13 %/min in the going-solid regime (CA-4's
> PI-8 backstop still trips inside its window). The AUTO level servo was re-tuned to match
> (`cvcs_charge_per_level` 0.001 → 0.01 through a new first-order **error damping**,
> `cvcs_level_filter_tau = 20 s` — stiff enough to park a 2.4e-4 leak ~2 % below program (CC-8/CC-10)
> without amplifying gauge noise into a charging chase (CA-3)). Knock-ons, both fixed as part of the
> pass: **(1) SGTR re-anchored** — the FG-6 "full rupture = 2× charging_max" premise died with the
> rescale (AUTO charging had been acting as an unphysical second HPI at 0.06 frac/s); `leak_scale`
> 0.12 → **0.03** (full rupture ≈ ½ HPI high-head rated ≈ 2× SI-at-pressure — still forces trip + SI
> + EOP, and the single-SG EOP now WINS the inventory race; behavior severities ×4 to hold the same
> absolute leak sizes). **(2) P1(b) closed** — new ESF actuation **SI on pzr_level lo-lo (12 %)**,
> riding the `hpi` arm (cold P-11 disarm and operator-manual both gate it; TMI untouched — its
> deceived level reads HIGH). Without it, a leak the heaters can out-muscle drained the RCS at full
> pressure with zero auto injection. `ops_sgtr_managed`'s scripted EOP also gained the REAL
> SI-termination criteria (subcooling **and** pzr level recovered — the old subcooling-only throttle
> survived only on the phantom charging). Dead config `cvcs_makeup_gain` and the stale
> `_charging_actual` stash were removed. Scoreboard: **59/68** — PWR **21/21**, zero PWR fails;
> the 9 remaining are the documented RBMK/BWR targets + the deliberate C2 red. `run_e2e_controls`
> 27 → **28/30** (one F12 stale red — "AUTO charging converged to match the leak" — turned green;
> the other two F12 reds stand).

\---

## 1\. What these suites are

The engine acceptance suites (`run\_pwr` etc.) prove the physics **engine-direct, with no
protection layer**. These new **operations suites** measure how the sim behaves **when
operated**: each engine runs UNDER the real Control \& Failure Layer (M4), commands descend
through interlocks and interception exactly as from the UI, and protection evaluates at the
M5 broadcast cadence (including its scaling with time acceleration). Two scenario families:

* `ops\_\*` — evolutions a real plant sees, scripted as an operator following the manual would
drive them: load-follow cycles, approach to criticality, normal shutdown, paced cooldown,
xenon holds, LOFW/SGTR/turbine-trip/SBO/ATWS responses.
* `abuse\_\*` — how a player will actually treat it: yank the rods, open the PORV and walk
away, slam recirc, spam contradictory commands, crank time acceleration, press the ADS
button "to see what it does", try to un-scram.

Checks are generous by design; hard failures are reserved for corruption, fuel damage where
protection should prevent it, and grossly unphysical outcomes. `▸` info lines are
measurements captured for this report. **A failing check is a tuning target with its
acceptance test already written.**

## 2\. Bugs found and FIXED during this work

1. **BWR: RCIC auto-actuation unit bug (critical — was breaking every assembled-stack BWR
run).** `bwr\_protection.js` actuation `{instrument:'fw\_flow', direction:'low', setpoint:5.0}` compared a **normalized** (0–1.2) reading against **5.0** → always true →
RCIC started within a second of every run, flooded the vessel to 100 %, dragged vessel
pressure into the 5.52 MPa low trip, and made 100 % steady operation impossible. The
companion level actuation (`vessel\_level low 50.0`) also hair-triggered on σ=0.5 noise at
the nominal 50.0 % level. **Fixed:** `0.05` and `45.0`. The engine suite never saw this
because it bypasses M4 — exactly the gap the ops suites close. Manual reference
regenerated; BWR 12/12, M4 11/11, M5 17/17, M7 16/16 after the fix.
2. **`tools/gen\_manual\_reference.js` and `test/run\_procedures.js` could not run at all**
(crash on load) — they never loaded the newer `engines/load\_mode.js`. Fixed. Note: with
the runner working again, `bwr\_sbo\_rcic` shows 20/21 procedures passing — the one failure
is finding **B3** below, not a regression.

## 3\. Cross-cutting findings (all three engines)

### C1 — The PWR and BWR high-flux trips can never fire  ⚠ top priority

`crossed()` is strict (`value > setpoint`) and both plants' `power\_range` instruments clip at
**exactly** the 120 % trip setpoint — a pegged meter never exceeds it. The RBMK had this same
bug and was fixed by widening its meter to `\[0, 200]` (see the comment in `rbmk\_config.js`);
the PWR and BWR were never given the same fix.
**Evidence:** PWR `abuse\_startup\_yank` reaches **529 % power / 1741 °C fuel** (clad damage
threshold 1200 °C) and only trips on lagging `tavg high`; BWR `abuse\_rod\_yank\_at\_power` holds
**143.8 % indefinitely with NO trip at all**.
**Fix:** widen `power\_range` range to `\[0, 200]` in `pwr\_config.js` and `bwr\_config.js`
(regen manual). Acceptance: those two tests' "capped by protection" checks.

### C2 — Protection latency grows with time acceleration

M5 evaluates M4 once per broadcast (fixed wall cadence), so at 256× the RPS checks the plant
every \~13 **sim**-seconds. RBMK `abuse\_accel\_latency`: identical rod runaway trips in
**2.0 s at 1× (peak 131 %) vs 16 s at 256× → steam explosion**. The same mechanism softens
PWR/BWR outcomes less only because their excursions are slower.
**Fix:** evaluate trips inside the physics-step loop (every N steps of *sim* time, e.g.
0.1 s), or auto-drop acceleration to 1× when any alarm is newly active. The first is a
small change in `simulation\_service.tick()`.

### C3 — There is no way back from a scram (forgiveness gap)

`abuse\_scram\_then\_recover` (all plants): rods relatch closed against withdrawal (good), but
M4's RPS latch and the engine `scrammed` flag never clear — after ANY trip the session is
effectively over except via full reset. Real plants reset the RPS once conditions clear.
**Suggestion:** a `reset\_rps` command (allowed only with the tripping condition cleared +
all alarms acknowledged) so a player can recover from a trip and try again — probably the
single highest-value forgiveness feature these tests surfaced.

### C4 — Manual scram doesn't set `rps\_state.scrammed`

Only trips set M4's latch, so after AZ-5/manual scram the snapshot reports
`rps\_state.scrammed:false` while `true\_state.scrammed:true`. UI/Instructor consumers reading
`rps\_state` will mislabel a manually scrammed plant.

### C5 — RBMK EPS bypass is cosmetic above the engine

`set\_eps\_bypass` sets state (and alarms) but **M4 never consults it** — trips still fire
(`abuse\_chernobyl\_\*`: `power\_range high` fired with bypass active). The Chernobyl scenario
(M6) needs the bypass to actually inhibit auto-trips, or the historical sequence can't be
walked. Suggestion: honor `eps\_bypassed` in `\_evalTrips` for the RBMK (data-driven flag on
the trip entries, HR3).

### C6 — Numerical robustness is excellent (positive)

66 scenarios including command-spam, 0↔48 % recirc slams, full blowdowns, 8-h xenon holds
and 256× runs: **zero non-finite values**, no crashes, all state bounded. The fixed-dt
integrator strategy is holding.

## 4\. PWR findings

### P1 — SGTR/LOCA leak scaling \~30× too fast; melts at full pressure with no auto-SI  ⚠

`sgtr` severity 0.4 (labelled "3.2 % rated flow") drains **100 % of primary inventory in
\~60 s** (`leak\_flow` is applied as inventory-fraction/s). The EOP-scripted response
(`ops\_sgtr\_managed`) still loses the core: the trip fires at 12.41 MPa but HPI only enters
at 11.03 MPa, and the heaters restore pressure in between — so inventory drains at high
pressure with **zero auto injection** (HPI is a trickle against 15 MPa by design).
**Fix (a):** rescale leak severity so 3 % SGTR ≈ tens of minutes to ECCS equilibrium (either
a leak-flow denominator or new `severity\_meta`); **(b):** add an SI actuation on
`pzr\_level` low-low (real ESFAS has one) — right now the only inventory-protecting trip
path is pressure, which the heaters actively defeat. Acceptance: `ops\_sgtr\_managed`.
*(2026-07-22b: **(b) DONE** — SI on pzr\_level 12 % lo-lo shipped with the P7 CVCS retune;
(a) re-anchored twice, final `leak\_scale` 0.03. See the update block above.)*

### P2 — Steam dump has unlimited capacity; heaters repressurize absurdly fast

Full dump from hot standby: **Tavg 304 → 105 °C in \~4 min** (real admin limit 55 °C/h; real
dump capacity \~40 % steam flow), SG pressure to 0.1 MPa; during the crash the primary
sat-pulled to 0.10 MPa and then the **heaters restored 15.41 MPa within \~1 min**.
**Fix:** cap `steam\_dump\_max` effect at partial capacity (\~0.4–0.55 rated), floor secondary
pressure at condenser backpressure, and rate-limit heater repressurization. A paced
cooldown (12 % dump pulses) works fine — `ops\_cooldown\_to\_rhr` passes with a beautiful
50 °C/h ramp — so the equipment model just needs its capacity honesty.

### P3 — A by-the-book normal shutdown cannot avoid a reactor trip  ⚠ forgiveness

`ops\_normal\_shutdown`: 4 %/min rod rampdown with CVCS auto make-up AND a script that pauses
whenever pzr level nears the alarm still ends in a `pzr\_level low` scram — mid-power Tavg
sag (P4) shrinks the pressurizer from 55 % below the 12 % trip. Also visible in
`ops\_load\_follow\_daily` (level bottoms at 22 %, `pzr\_level\_low` alarm on every deep
maneuver).
**Fix:** primarily P4 (the temperature sag is the driver); additionally make CVCS auto mode
hold programmed **level** (not just mass), which is what real CVCS does. Acceptance:
`ops\_normal\_shutdown` "no scram", `ops\_load\_follow\_daily` level-band check.

### P4 — Partial-load Tavg/SG-pressure program is inverted

At 50 % power Tavg settles **287.6 °C** — *below* both the full-power (304) and no-load
(304) points; SG pressure sags 5.65 → 5.29 MPa. A real plant runs \~292 (no-load) → 304
(full) monotonically, and SG pressure is *higher* at partial load (\~6.1–6.4 MPa). The
governor model draws `demand × pressure` so the secondary droops under it.
**Fix:** give the governor pressure-compensated flow (valve position × √ΔP against a
regulated header) or strengthen `K\_steam\_pressure` so SG pressure rises toward saturation
at reduced steam draw. This single fix likely resolves P3 and most of P5.

### P5 — Load-follow authority is \~25 % of real

+5 % net-demand step from 50 %: MTC alone delivers **+1.2 %**; even with scripted rod assist
the unit caps at **53 %** because achieved steam flow is pressure-droop-limited
(`ops\_grid\_step`). Real PWRs deliver most of a 5 % step on the reactor-follows-turbine
principle. Same root as P4.

### P6 — Spray can pull primary pressure to 0.1 MPa

`abuse\_heater\_spray\_fight`: full spray beats full heaters and takes the primary to the
containment floor. Spray water is Tcold liquid — physically it cannot pull pressure below
\~Psat(Tcold) ≈ 7 MPa. **Fix:** floor the spray term at `Psat(tcold\_c)`. (Also shows in
`abuse\_command\_spam`.) Acceptance: the fight test's `6.5..18` band.

### P7 — Notes / positives

* `ops\_loss\_of\_feedwater\_handsoff` is a model response: SG-low alarm, AFW auto-start,
trip, level recovery, subcooling held.
**RESOLVED 2026-07-31 (#135) — and the diagnosis in this line was wrong.** It read "warning-to-trip
window is only ~4 s — consider slowing SG boil-down slightly". Two corrections. The window was
**2.9 s**, not 4 (measured full-stack; the +40/+44 s figures above were engine+M4 and included the
feed-pump coastdown). And "slightly" understated it by a factor of three: the cause was
`K_sg_level` at **5.0**, i.e. the entire narrow range holding **twenty seconds** of full-power
steaming — measured, true level 64.5 → 3.1 % in 13 s. Now **fitted to a real transient**:
Ginna UFSAR Table 15.2-4 (ADAMS ML20339A101) gives **35 s** from feed loss to the lo-lo trip, so
48 points of span / 35 s = **1.37 %/s**. Trip now at 40.5 s, window **11.6 s**. GitHub #135 filed
this as "a setpoint/lag question, not a physics change" — that was **arithmetically impossible**:
the setpoints are 13 points apart, so at the old drain rate no spacing change could buy more than
a few seconds. This backlog line had it right and the issue did not. Pinned by **TR-14** in
`run_behavior`, which nothing did before — the 3.6× change left all 32 gates green.
* `abuse\_porv\_walkaway` is TMI-with-honest-instruments and survives hands-off (trip → HPI).
Oddity: end state shows inventory 120 % (clip at `mass\_max`) with pzr level 7 % — the
overfill/level bookkeeping disagree; worth a look.
* Startup: the SUR interlock works exactly as intended (267 blocks during a yank, 0–1
during a careful approach), but after criticality the sim coasts to \~20 % power even when
leveled with counter-insertion. Real practice stabilizes < 5 %. Consider a slightly
stronger low-power Doppler bite or gentler mid-curve differential rod worth.
* 8-hour 50 % xenon hold: clean pass, xenon peak 106 %, rods+dilution controller held band
with zero dilution needed — xenon swing at 50 % may be a touch small (peak \~113 % on the
daily cycle), fine for v1.

## 5\. RBMK findings

### R1 — The post-1986 core can still steam-explode  ⚠ design intent

`abuse\_chernobyl\_post` (xenon pit + flow starvation + the yank + AZ-5, live protection):
peak **1835× rated**, energy deposition 7341 cal/g/s → `steam\_explosion`. The same
mechanism appears at 256× acceleration (C2). The post design intent — "the SAME sequence is
survivable" — is the emotional core of the product, and it currently fails: the void-driven
excursion outruns the 12-s insertion once the power trip finally fires.
**Fix candidates (in preference order):** (a) a **short-period/SUR trip** for the post
version (real post-1986 RBMKs got exactly this class of protection), so the excursion is
caught while insertion still wins; (b) harder saturation of the post void coefficient at
high void (`alpha\_void\_high\_void\_gain` is 0.4 — the excursion suggests the *base* term at
low flow is what runs away); (c) post `MAX\_PROMPT\_GROWTH` 5.0 → lower. Acceptance:
`abuse\_chernobyl\_post` "must be survivable".

### R2 — Drum level dynamics \~5–10× too fast

`ops\_feedwater\_dip\_\*`: a 90-s, 50 % feedwater dip crashes drum level 50 → **7 %** (trip at
10), and after restore the level pegs **100 %**. Real drum time constants are minutes.
**Fix:** reduce `K\_drum\_level` (4.0) \~5×, and consider a simple feed-follows-steam auto
trim. Acceptance: the dip tests' `50 ±8` recovery check.

### R3 — Post-1986 fine control is knife-edged (only 10 % to the trip)

2-step nudges at full power ran into the 110 % trip during maneuvering; even a SUR-guarded
1-step controller ended a walked flow ramp at 94.3 % (`ops\_flow\_reduction\_post`). Partly
authentic (tight post margins) — but consider slightly higher damping (Doppler) or a
'fine' rod speed so honest maneuvering isn't hair-trigger. All pre-version equivalents pass.

### R4 — Zero-flow aftermath too forgiving

`abuse\_zero\_flow\_\*`: MCP flow to zero at 100 % trips promptly (good) but the post-trip
plant sits at \~570 °C fuel indefinitely — decay heat with zero channel flow never dries
out or damages anything. Real consequence: boil-off → dryout → damage over tens of
minutes. Cheap fix: scale `h\_fc` with channel flow at decay-heat levels too.

### R5 — Positives worth keeping

* Pre/post scram signatures are distinct and legible (power 2 s after AZ-5 from 100 %:
**35.4 % pre vs 18.7 % post** — the tip effect visibly bites).
* The xenon pit teaches itself: AZ-5 from the pit **destroys the pre core**
(`steam\_explosion` — the historical trap) and is clean on post; the recorded
slow-insertion escape gives scenario authors the "skilled path" beat.
* Turbine trip rides on the dump at 7.97 MPa (relief 8.0) both versions; ECCS saves a 30 %
tube rupture; EPS-bypass yank from the pit only reaches \~10 % power in 15 min (the pit is
genuinely deep — good).
* Endurance, load-follow (100→50→100), startup, MCP runback: all pass both versions.

## 6\. BWR findings

### B1 — (FIXED) RCIC actuation unit bug — see §2.

### B2 — No pressure regulator: uncoordinated power reduction = spurious "LOCA" trip  ⚠

The real BWR control philosophy is **pressure-priority**: the turbine EHC throttles to hold
\~7 MPa whatever the power. The sim's turbine follows *power* (with lag) or a *fixed manual
load*, so any meaningful power drop collapses vessel pressure into the 5.52 MPa low trip:

* `ops\_recirc\_pump\_trip` (hands-off): pumps coast → power falls → **pressure-low trip → 0 %**
(should settle stably at \~40–50 % on natural circulation).
* Recirc load-follow only passes when the script manually walks `set\_turbine\_load` down in
step with power (that's how the now-passing test does it).
**Fix:** a behavioral pressure-regulator mode (steam draw slews to hold `vessel\_p\_rated`,
bounded by governor rate), as the default instead of power-follow. This is the single
biggest BWR operability improvement available. Acceptance: `ops\_recirc\_pump\_trip`.

### B3 — RCIC/HPCI capacity loses to post-trip boiloff

`ops\_lofw\_handsoff`: hands-off LOFW → RCIC+HPCI both running, yet level falls to **0.6 %**
(full uncovery; no damage only because decay heat is mild). The authored procedure
`bwr\_sbo\_rcic` (step: level > 40 with RCIC) fails the same way — the engine cannot deliver
the manual's promise. **Fix:** raise `rcic\_flow\_normalized` (0.01) / `hpci\_flow\_normalized`
(0.03) or reduce the boiloff/level gain (`K\_vessel\_level` 5.0) so RCIC roughly balances
decay-heat boiloff a few minutes post-trip (that is its real design basis). Acceptance:
`ops\_lofw\_handsoff` + `node test/run\_procedures.js` (bwr\_sbo\_rcic).

### B4 — Depressurization paths stall above the LPCI window

* Manual SRV (`ops\_sbo\_managed`, the Fukushima "do it right" path): 2 h of `open\_srv\_manual`
never reaches < 1.03 MPa (stalls against decay steam) — the lesson can't be executed.
* ADS demanded at full-power decay levels stalls at \~2.1–2.3 MPa for 30+ min
(`abuse\_ads\_at\_full\_power` — survivable, but LPCI never comes).
**Fix:** retune `srv\_manual\_tau` (150) and the blowdown-vs-decay-steam balance, or raise
`lpci\_threshold\_pressure`. Acceptance: `ops\_sbo\_managed` depressurization check.

### B5 — LPCI auto-start is gated ONLY on `ads\_open`

`abuse\_srv\_stuck\_walkaway`: a stuck-open SRV blows the vessel down to 0.13 MPa with level
→ 0 % and **LPCI never auto-starts** because ADS never opened. Add a low-level +
low-pressure permissive path (real LPCI initiates on level/pressure, not on ADS).
Acceptance: that test's level-defense check.

### B6 — RCIC-on-low-feedwater is non-prototypical

Even fixed, the `fw\_flow < 5 %` actuation forces RCIC on during any deliberate low-feed
hold (`ops\_scram\_level\_control` info line). Real RCIC starts on low level (L2) only. With
the level actuation now healthy at 45 %, consider deleting the fw\_flow actuation.

### B7 — Missing high-level protection and rod-block

* Overfeed to 150 %: level pegs 100 %, **no alarm, no trip** (real: L8 alarm + feed/turbine
trip). Add a `vessel\_level\_high` alarm at least.
* The BWR has no SUR/IRM withdrawal block (PWR and RBMK both have one) — `ops\_startup`
records 0 blocks by design. With C1 fixed the flux trip becomes the backstop; a startup
rod-block would match its siblings.

### B8 — Positives

* The Isolation Condenser path is excellent: 2 h SBO, pressure held, battery 75 %, level
stable (`ops\_sbo\_isolation\_condenser`).
* ATWS + SLC + recirc runback shuts the core down cleanly from 128 % peak; turbine-trip
void-collapse spike (126 %, trip in 2.5 s) is a textbook BWR pressurization transient.
* Recirc slams, command spam, 256× yanks: bounded, no damage, no NaN.

## 7\. Suggested priority order

|#|Item|Size|Acceptance|
|-|-|-|-|
|1|C1 power\_range ranges → \[0,200] (PWR, BWR)|config|`abuse\_startup\_yank`, `abuse\_rod\_yank\_at\_power`|
|2|R1 post-RBMK short-period trip (or void saturation)|config+small|`abuse\_chernobyl\_post`|
|3|B2 BWR pressure-regulator load mode|medium|`ops\_recirc\_pump\_trip`|
|4|P1 leak scaling + SI on pzr level lolo|small|`ops\_sgtr\_managed`|
|5|P4 secondary pressure/Tavg program at partial load|medium|`ops\_normal\_shutdown`, `ops\_load\_follow\_daily`, `ops\_grid\_step`|
|6|B3 RCIC/HPCI vs boiloff rebalance|tune|`ops\_lofw\_handsoff`, `run\_procedures`|
|7|C2 protection eval at fixed sim-time cadence|small|rbmk `abuse\_accel\_latency`|
|8|B4/B5 depressurization + LPCI permissive|tune|`ops\_sbo\_managed`, `abuse\_srv\_stuck\_walkaway`|
|9|P2/P6 dump capacity cap, spray Psat floor, heater rate|tune|`ops\_cooldown` rate info, `abuse\_heater\_spray\_fight`|
|10|R2 drum level gain|tune|`ops\_feedwater\_dip\_\*`|
|11|C3 RPS reset command (forgiveness)|small feature|`abuse\_scram\_then\_recover` (update)|
|12|C5 EPS bypass honored in M4 · C4 manual-scram latch · B6/B7 · R3/R4 · P8 polish|small|listed per finding|

Every fix has a red test waiting to turn green; re-run `node test/run\_ops.js` after each.
Config changes trigger the manual maintenance rule: `node tools/gen\_manual\_reference.js` +
`node test/run\_procedures.js`.

