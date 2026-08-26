# Reactor Dynamics — Independent Review, issue #507 waves 1-10

**Scope:** commit span `9f0ec43..HEAD` on `develop`; record under review `Blueprint/PWR2_VALIDATION.md` §67-74. Read-only; every dynamics claim below was reproduced by stepping the engine.

---

## 1. Verdict

The waves land real, mostly correct mechanism — the boron surface, the SGTR routing, the two-bus electrical model, the rod insertion limit and the RCP restart all do what §67-74 says they do, and the numeric assertions in the gates are honest where they exist. What did not keep pace is **containment of the new levers**: waves 4, 6 and 10 added an ATWS block, a station blackout and a depressurized Mode 4 preset, and none of the three was ridden long enough to find that they break the plant. Three high-severity defects sit exactly there — a dry steam generator turns into an infinite 211 °F heat sink that wedges the plant at 243 % rated power with a 46 °F cold leg, the shipped Mode 4 preset fills water-solid in 75 minutes untouched, and the RHR heat exchanger's size is frozen from whatever the plant happened to be doing on the engine's first step (96.00 vs 208.76 kW/K, a 2.17× spread on the same hardware). A second cluster is HR1/electrical: three loads that wave 4 was written to gate — auxiliary spray, the RHR pumps, the heater-shed latch's second signal — were missed, so a station blackout still buys the operator a full-authority depressurization tool and 26.6 MMBtu/hr of shutdown cooling. The gates are the weak link rather than the code: the shutdown-IC "HOLDS" check watches only Tavg for 300 s on a plant whose level goes 30 % → 100 %, the ATWS check runs 10 s and stops ~100 s before the failure begins, and wave 1's own headline shell fix is provably blind (I reverted it and the suite scored its full 69/0 baseline).

---

## 2. CONFIRMED findings, ranked by consequence

### H-1. A dry steam generator becomes an infinite 211 °F heat sink and wedges the plant
`engines/pwr2/pwr2_sg.js:161` — **high**

`stepSG` clamps secondary **mass** at 1 kg but keeps integrating **energy** into that clamped node, so `sg.h` runs negative, `sg.P` slams the bisection's low wall at 15 psia (Tsat 211 °F), and Q = U·A·(Tavg − 211 °F) strips heat from the primary forever. Measured a single step at **+1,875,792 kW (1.88 GW, 6.3× the 300 MWt rating)** out of the primary.

Both trigger combinations are new in this span (`scram_block` and `station_blackout` do not exist in `9f0ec43`), and both ship on the 21-row menu:

- **loss_of_feedwater + failure_to_scram** — normal at +110 s (2247 psia, 596 °F); the #499 beyond-model screen latches at 149 s and freezes the plant bit-identically for 2,500 s of sim at **304.52 % power, 1320.68 psia, sg.h = −11,594 kJ/kg**. The screen is a mitigation, not a defense: `beyond_model` is set on `sys` only, no `true_state` key matches it, and no consumer outside the core/sources modules reads it. The player gets a plant frozen at 304 % power with **no indication**.
- **station_blackout + failure_to_scram** — the screen never fires. `_dead=false, beyond_model=false` for the full 400 s probed while the engine publishes a live plant at **243.1 % rated power, cold leg 45.7 °F (7.6 °C) at 1186 psia**, hot leg 566 °F. Stable false equilibrium, unleavable.
- Control (loss_of_feedwater + afw_failure, normal scram): floor never reached, sane throughout — sg.mass 12,485 → 3,329 kg over 1,950 s. The trigger is specifically full fission power into a drying SG.

HR10: the wave-6 ATWS gate (`test/run_pwr2_shell.js:413`) runs 500 × 0.02 s = **10.0 s** and asserts `power_pct > 50` — it terminates ~100 s before the divergence starts.

**Fix:** clamp secondary energy with the mass (hold `h` at `h_f(P)` at the floor) and collapse `sg.U` toward 0 as mass fraction → 0, so a dry SG is a near-zero sink; add a dryout probe that rides the ATWS to 300 s.

---

### H-2. The shipped Mode 4 preset is not settled — it goes water-solid in 75 minutes untouched
`engines/pwr2/pwr2_engine.js:155` — **high**

The ICS header calls every initial condition "a SETTLED construction — every state variable placed at ITS OWN equilibrium", and line 267-271 declares "the bubble holds at its saturation without them, DECLARED". Measured on the untouched preset (player-facing at `ui/app.js:342`), no commands, dt 0.02 s:

| t | Tavg | pressure | pzr level |
|---|---|---|---|
| 0 | 250.0 °F | 364.0 psia | 30.0 % |
| 30 min | 239.4 °F | 221.0 psia | 40.7 % |
| 60 min | 229.4 °F | 93.2 psia | 52.4 % |
| **75 min** | 224.8 °F | **29.4 psia** | **100.0 % — WATER SOLID** |
| 85 min | 222.0 °F | 29.4 psia | 100.0 %, M_total +1,523 kg |

Root cause: `pwr2_cvcs.js:239` runs seal injection at the full 5 gpm whenever the charging pump is powered, with **no seal return path modelled and none in the DECLARED OMISSIONS list**. Worse than filed — `CVCS.letdown_backpressure_mpa` is 300 psia, so once the depressurizing plant falls below that (~13 min in) letdown is **identically zero** and the full 5 gpm has no removal path at all. The operator has no lever: letdown is already at 1.0, charging demand is driven to 0 by the level controller, and no command in the engine's door sets `cv.isolated`.

The §74 procedure does not rescue it: with `pzr_heaters_manual 1.0 + rcp_start` at t=0 the heatup is sane (89.0 °F/hr) but level still climbs 30.0 → 56.8 % in 40 min and reaches solid at ~105 min. Mass is conserved to 0.1 kg, so this is a real inflow, not a solver artifact. The two other new ICs **are** settled over 40 min (50 %: power 49.5-50.0 %; hot zero power: Tavg 286.11-286.34 °C), which isolates it to the depressurized preset.

**Fix:** model the seal return (or net leakoff) so seal injection is not a one-way RCS addition, and/or give the shutdown IC a letdown/charging balance that nulls at 350 psig; re-measure the untouched ride for 3 sim-hours, not 300 s.

---

### H-3. The RHR heat exchanger's UA is frozen from the boot state — 96.00 vs 208.76 kW/K on the same plant
`engines/pwr2/pwr2_rhr.js:246` — **high**

`if (rh.UA === null)` derives the exchanger size lazily on the first step, and line 256 feeds it `pumpHeat_kW(sys)` read from the **live** plant. Pump heat is ~1,410 kW with the reactor coolant pump running and 0 kW with it secured, so a hardware constant comes out 2.17× different by boot condition. Measured:

| IC | UA | pump heat |
|---|---|---|
| hot_full_power | 208.76 kW/K | 1,409.5 kW |
| 50_percent | 208.37 | 1,404.7 |
| hot_zero_power | 209.55 | 1,419.4 |
| **hot_shutdown** | **96.00** | **0** |

The one preset that ships with RHR aligned gets the **smallest** exchanger. Duty at the sourced 350 °F entry against the 95 °F sink: **29,574 kW (at-power boot) vs 13,600 kW (shutdown boot)**. Nothing re-derives it — UA is 208.76 at step 1 and 208.76 after 200 s; `rhr_align` and `rhr_hx` only move the valve and throttle. Player-visible: on the identical hot_shutdown plant with only UA swapped, cooldown at HX 0.05 reads **61.0 °F/hr vs 125.9 °F/hr** — the 100 °F/hr limit sits inside that spread, so one boot is compliant at a throttle setting where the other violates it.

HR10: `run_pwr2_rhr`'s design-basis section prints a **third** value (230.54 kW/K, from a hand-wired 425 psig / 350 °F fixture), and it is that exchanger the 16-hour cooldown check passes on. No shipped engine ever has it.

**Fix:** derive UA once at construction from a DESIGN cooldown lineup (design decay fraction at 20 h + the sourced RHR-entry pump heat) as a constant or an explicit `createRHR` argument.

---

### H-4. Auxiliary spray works in a full station blackout
`engines/pwr2/pwr2_pressurizer.js:401` — **high**

The file's own SPRAY block (lines 122-131) says aux spray is charging-pump driven — "charging pumps drive it, which is its whole reason to exist" — and `aux_max_kgs` 1.83 is annotated as "THE SAME PHYSICAL NUMBER pwr2_cvcs derives". `pwr2_cvcs.js:233` kills those pumps on `ac_available !== false`. `auxFrac` at line 401 takes no power term, and the driver **is** at the call site: `pwr2_engine.js:756` already passes `ac_available` in and lines 367/375 already consume it for the heater shed. An unread wire, not a missing one.

Measured, hot full power, blackout at t=20 s, 120 s ride:

- **Aux spray shut:** ac_available false, charging 0, AFW 0.667 (TDAFW only — the blackout is real), 2,221.2 → 2,051.2 psia, **−170 psi**.
- **Aux spray 100 %:** same dead plant, `aux_spray_kgs` **1.830 kg/s (29.0 gpm)**, duty 2,523 kW, 2,221.2 → 1,510.0 psia, **−711 psi**.

**541 psi of depressurization delivered by a pump reporting zero flow in the same step.** Main spray is correctly dead (RCPs tripped), so the aux path is the sole surviving spray authority and it is the ungated one. Wave 4's own record (§68, lines 3605-3606) enumerates the vital loads and aux spray is absent. The gate carries two aux-spray mutations, neither touching power.

**Fix:** one line — `auxFrac = drivers.ac_available === false ? 0 : clip(...)`, matching `pwr2_cvcs.js:237`; add a probe asserting `aux_spray_kgs === 0` under blackout.

---

### H-5. RHR removes 26.6 MMBtu/hr through a station blackout — the pumps have no power gate
`engines/pwr2/pwr2_rhr.js:270` — **high**

`rh.running = rh.valve_open` is the whole availability law. `stepRHR` takes no `ac_available` driver and the call site (`pwr2_engine.js:727`) passes none, while every other motor load in the same step function got its bus by name in wave 4. `rh.avail` is initialized to 1 and never assigned anywhere, so it is not a hidden power wire, and the module's DECLARED OMISSIONS list does not declare an ungated supply. WTSM 5.7.5 ML11223A229 — the source wave 4 itself quotes — says *"All decay heat removal systems, except the turbine-driven AFW pump, also fail."*

Measured, hot_shutdown, RHR aligned, HX 100 %, blackout injected, 60 s: `ac_available` **FALSE**, `rhr_active` **TRUE**, duty **7,785 kW (26.56 MMBtu/hr)**, while `afw_flow_normalized` reads 0.667 in the same run — the wired MDAFW gate working correctly beside the unwired one. Isolation at HX 0.30 over 300 s with the blackout standing: valve OPEN −13.23 °F, valve SHUT −4.93 °F — **8.30 °F of cooldown delivered by unpowered pumps**.

One qualification: the preset ships `hx_fraction 0`, so an untouched Mode 4 plant in a blackout reads duty 0. The failure is reachable the moment the operator opens the HX, which §74 names as the cooldown lever.

**Fix:** `drivers.ac_available` (absent = powered, house convention), `rh.running = rh.valve_open && powered`, pass `acAvail` from the call site; probe a Mode 4 blackout for `duty_kW === 0`.

---

### H-6. The heater-shed latch edges on the OR of two independent signals — a LOOP after an SI never sheds
`engines/pwr2/pwr2_pressurizer.js:367` — **high**

`shedSig` is the OR of `si_active`, `ac_available === false` and `offsite_ok === false`, and the latch arms only on that combined signal's rising edge (line 369). NUREG-0737 II.E.3.1 (7) makes SI and loss of offsite power two **separate** actuating signals. `pwr2_engine.js:389` clears the latch on any manual heater command, and `:564-565` keeps `acAvail` true through a plain LOOP (diesels), so the direct term does not cover it.

Module probe: SI → shed (0.0 kW); operator re-load with SI standing → 157.8 kW; then `offsite_ok = false` → **shed FALSE, latch false, 157.8 kW held**. Control: the same LOOP on a healthy plant sheds correctly. Facade probe reproduces it end to end (0.0005 m² break → SI latched → break closed → recovered to 30.5 % level → heaters 157.8 kW → offsite lost → still 157.8 kW).

The **reverse ordering is worse and is set up by a shipped gate**: `run_pwr2_engine.js:747-750` deliberately re-loads the heaters during a LOOP and asserts >100 kW; from that state an SI arrives with the latch still false, and once the 17 % low-level cut clears past the 20 % restore point the heaters return to 157.8 kW **indefinitely with both signals standing**. That is the design-basis LOCA-plus-LOOP sequence, and 157.8 kW of pressurizer heaters ride the emergency diesels through it. Contradicts §68's own stated intent (line 3625: "armed by SI or a LOOP, vital bus notwithstanding"), so it stands regardless of how NUREG-0737 is read. Coverage: `run_pwr2_pressurizer.js:491-493` mutates the signal only by deleting SI outright; every offsite probe runs on a healthy no-SI plant.

**Fix:** track `_siPrev` and `_offsitePrev` separately — `if ((si && !siPrev) || (loopLost && !loopPrev)) shedLatch = true` — and add the LOOP-after-SI probe.

---

### H-7. The RCP motor is constant-torque, so it never reaches rated speed in a cold loop — and that sets wave 10's heatup number
`engines/pwr2/pwr2_sources.js:233` — **high**

The start branch integrates a **fixed** accelerating torque (1.5 × rated hydraulic) capped only by `Math.min(w_rated, ...)`. No running characteristic, so the rotor settles where hydraulic torque = 1.5 × T_rated, i.e. speed ratio √1.5 / densityRatio. Cold water is exactly that case — and it is the state wave 10 ships.

Measured: T_rated 10,884 N·m, motor 16,325 N·m. From hot_shutdown (densityRatio 1.306), `rcp_start` gives 11.09 % @ +1 s, 86.09 % @ +13 s, then **stalls at 92.97 % of 1185 rpm** at +60 s, creeping only with density to 93.60 % (1,109 rpm) at +600 s. The source comment at line 229 and §73's identical sentence — *"the motor HOLDS rated speed thereafter (slip regulation unmodeled, declared)"* — are **false in the shipped Mode 4 plant, and the sub-rated speed is nowhere declared**.

Consequence for the wave-10 headline: heatup on pump heat alone measures **87.9 °F/hr as shipped** (matching §74's published figure and its 1,996 kg/s flow), but **111.3 °F/hr with the rotor held at rated** — i.e. **over** the 100 °F/hr limit §74 claims the plant is just under. A 23 °F/hr swing set by an artifact of a fitted constant.

HR10: the only gate on the claim (`test/run_pwr2_sources.js:232-236`) uses `createPlant({h: 1250, P: 15.41})` — densityRatio 1.058, hydraulic torque 1.12 × T_rated, so the 1.5× margin **cannot bind**. The "HOLDS rated" half is an identity in the regime it is tested in.

**Fix:** separate start from run — once ω reaches ω_rated, hold it (or supply load torque up to a declared breakdown torque ~2.5×); add a COLD fixture to the sources gate and re-measure the wave-10 heatup against the limit.

---

### M-1. Safety injection adds no boron — `rwst_boron_ppm: 2500` is marked [sourced] and read by nothing
`engines/pwr2/pwr2_eccs.js:142` — **medium**

Repo-wide grep: `rwst_boron_ppm` has **exactly one occurrence — its own declaration**. `stepECCS` returns `{node, mdot, h}` with no concentration field; `pwr2_sources.js` contains the string "boron" zero times. The only concentration writer is `pwr2_cvcs.js:273-277`, whose terms are charging + seal and letdown only — neither injection, break outflow nor relief touches it.

Measured, 0.002 m² (3.1 in²) cold-leg break from settled hot full power, 200 s: HHSI and LHSI both running, **2,432.7 kg (5,363 lb) injected**, RCS node mass 17,229 → 6,026 kg (~40 % of remaining inventory replaced by nominally 2,500 ppm water). Boron **625.7841 → 625.7841 ppm, unchanged to seven significant figures.** Perfect mixing would give ~1,376 ppm — **~750 ppm / ~6,000 pcm of shutdown reactivity that safety injection does not deliver**, at the module's own sourced 8.0 pcm/ppm.

This is a PWR1 → PWR2 parity regression, not just a gap: `pwr_primary.js:401-418` mixes `eccs_boron_ppm` in by perfect mixing, and `CURRICULUM.md:281` teaches off it ("2500 ppm RWST injection instead of 857"). The CVCS declared-omissions list does not mention it.

**Fix:** return the delivered flow + `rwst_boron_ppm` from `stepECCS` and mix into `cv.boron_ppm` (`dC += q_inj*(C_rwst − C)/M`), crediting break outflow at RCS concentration and relief steam at ~0 ppm; gate the **ppm rise**, not the constant's existence.

---

### M-2. The RHR permissive and its refusal message read TRUE pressure, not the instrument
`engines/pwr2/pwr2_shell.js:146` — **medium**

`var psig = e.sys.P * 145.038 - 14.7` feeds the operator-facing refusal; the engine's guard (`pwr2_engine.js:380`) and the 585 psig autoclose (`:726`) do the same. The 425/585 psig interlock is a pressure-switch function and HR1 puts it on the instrument. **The same wave got this right 40 lines earlier**: `pwr2_engine.js:337/347` read `eng.ins.reading.primary_pressure` under the comment *"the permissive reads the INDICATED pressure like the RPS does"*.

Measured with a stuck primary-pressure channel (wave 3's mirror lands it on both layers):

- **Stuck low, SI secured** — board 406 psig, internal RPS channel 406 psig, TRUE 2,189 psig. The operator correctly concludes he is below the permissive, commands the align, and gets: *"RHR ALIGN BLOCKED: RCS pressure **2189 psig** is above the 425 psig suction-valve permissive."* **Truth quoted verbatim to the operator** while every indication reads 406 psig.
- **Mirror case** — genuinely depressurized plant (TRUE 30 psig) with the channel stuck at 2,190 psig: the align is **ACCEPTED** while the only visible pressure is 1,765 psig above the permissive.
- **Same instant, one failed transmitter, two answers:** `set_trip_block lo_press` and `si_trip` both ACCEPTED (they read indicated, P-11); `set_rhr` REFUSED quoting 2,189 psig (reads true).

§67's wave-2 record documents the 425/585 pair and the "refuses out loud" behavior but nowhere declares it reads truth.

**Fix:** read `eng.ins.reading.primary_pressure` (truth fallback only on the pre-reading first step) at all three sites, and print the indicated figure.

---

### M-3. `clear_all_failures` clears two of eleven casualties, and its gate check is vacuous
`engines/pwr2/pwr2_shell.js:228` — **medium**

The action issues exactly three engine commands (instrument restore, PORV unstick, break close). It touches none of `scramBlocked`, `runaway`, `aw.blocked`, `heaters_failed`, `spray_stick`, `hhsiAvail`, `cwPumps`, `elec.offsite/blackout`, `fw.pumpA/pumpB` — every lever waves 3-6 added. The per-id `clear_failure` at `:391-423` reverses all of them, so the code to do this already exists.

Measured: 12 rows injected, ledger 10 rows before, **9 rows after** — only the break cleared. Raw state after "clear all": `scramBlocked true, runaway 2.63 steps/s, aw.blocked true, heaters_failed true, spray_stick true, hhsiAvail 0.5, cwPumps false, elec.blackout true, fw.pumpA/B false`.

The guard is hollow: every `inject_failure` in `run_pwr2_shell.js` uses a **separate engine instance**; the only failure ever applied to `eng` before line 722 is line 715's instrument fail_low, which **is** covered by instrument restore — so `getActiveFailures().length === 0` passes without a single wave-3/4/6 lever ever being set. PWR1 does it correctly (`pwr_engine.js:1485-1487` iterates its own list). Mitigation: `control_kernel.js:231` intercepts and iterates per-id, so the board path is unaffected; the shell API and direct-engine callers get the lie.

**Fix:** have `clear_all_failures` iterate `getActiveFailures()` and dispatch `clear_failure` per id; rebuild the check on a plant carrying a non-instrument lever.

---

### M-4. The SGTR overfill has no physical consequence — the secondary has no volume
`engines/pwr2/pwr2_sg.js:82` — **medium**

`updatePressure()` inverts h_f(P) = sg.h, so secondary pressure is a function of **enthalpy only**; mass enters solely as the mixing denominator and is bounded only from below. Direct test: freezing the SG mid-accident and **tripling** `sg.mass` changes pressure by **0.0 psi** (959.0 psia both ways). No steam space, no water-solid state, no upper bound.

Measured SGTR (sev 0.4, 1.73e-4 m², hot full power): SG fills monotonically 28,238 → **77,547 lbm (35,175 kg) at 3,600 s = 2.75× the sourced 28,186 lbm design inventory** while pressure **falls** 1,064 → 959 psia. `sg_safety_kgs` reads **0.00 for the whole ride** (MSSV pop 1,085 psig never approached), and the ADV setpoint is crossed downward so the ruptured SG's only steam path shuts as it floods. Narrow range pins 100 % by 600 s, wide range by 3,600 s.

The hi-hi FWI **does** fire as §69 claims (and correctly trips the turbine for carryover) — but it closes main feed only; the leak and the fill continue unchecked. §69's "Declared limits" block declares only the one-break slot and the missing radiological path. CLAUDE.md requires a simplification that understates reality to be said plainly; this one understates the accident's defining consequence.

**Fix:** declare it in the SG header and §69 (secondary volume unmodelled: pressure enthalpy-only, no water-solid state, safeties pass steam at any inventory), or give the lumped secondary a sourced total volume so mass fraction above ~1.3 compresses the steam space.

---

### M-5. `fail_low` / `fail_high` never rail the board layer — the range lives on `ch.spec.range`
`engines/pwr2/pwr2_shell.js:821` — **medium**

The mirror reads `ch.range`, which is `undefined` for every channel (`createInstruments` puts it at `.spec.range`), so `rail` is undefined and `setFailure(id,'stuck',undefined)` falls through to the **current healthy reading**. §67's load-bearing claim — *"low/high rail to the internal channel's own range bound so both show the same rail"* — is false for **all 14 shared channels**.

Measured: `primary_pressure` fail_low → internal **0 psia**, board **2,220 psia** (the RPS trips on low pressure while the gauge reads healthy). tavg → 32 °F vs 578 °F. sg_level fail_high → 100 % vs frozen 65.5 %. Every `shell.failed` entry reads `{mode:'stuck', value:<the healthy reading>}`. Counterfactual with `ch.spec.range[0]` passed explicitly: board reads 0 psia as intended. Stuck-at-value and dead mirror correctly, so the break is confined to the rail modes.

The gate (`run_pwr2_shell.js:715-721`) injects fail_low and asserts only the internal layer trip plus a non-empty ledger — it never reads `instruments.reading` after a rail. Reachability is limited (no production caller emits the rail modes today; `ui/app.js:2066` offers stuck/drift/noisy/dead), so the harm is the false record and the hollow gate.

**Fix:** `ch.spec && ch.spec.range` at line 821; assert the board reading equals the internal rail in the gate.

---

### M-6. `loss_of_condenser_vacuum` is inert at power — 100.0000 MWe at zero vacuum
`engines/pwr2/pwr2_shell.js:340` — **medium**

The row writes `cw_pumps false` and the condenser correctly collapses (27.52 → 0.00 inHg, `condenser_cooling_available` true → false), but nothing downstream consumes it: `pwr2_turbine.js` computes W = m_steam·(h_g − h_feed)·η with **no backpressure term**, and the shell empties the M4 tables (`pwr2_shell.js:552`) where PWR1's 74.5 kPa low-vacuum turbine trip lives (`pwr_control.js:434`).

Measured: 100.0000 MWe at +30 s, +90 s, +180 s **and +600 s** — unchanged to five figures; steam 809 → 808 psia; no trip, no scram. Both sourced C-9 alarms light (`cond_vac_low` 84.7 kPa, `cond_vac_trip` 74.5 kPa, industry label "COND VAC TRIP"), so **the board says TRIP while the unit makes rated power**. Parity regression: `pwr_steam_generator.js:576` scales `mwe_output` by `condenser_vacuum_kpa / vacuum_rated`. The gate asserts `e5.eng.cwPumps === false` — the write, not the effect, the exact trap CLAUDE.md's own wave-4-to-6 theme names.

**Fix:** a backpressure term in `pwr2_turbine`, or a sourced low-vacuum turbine trip in `pwr2_protection`; failing that, re-declare the row post-trip-only in §67 and assert an effect (dump unavailability).

---

### M-7. The shutdown-IC "HOLDS" check watches only Tavg for 300 s
`test/run_pwr2_engine.js:1128` — **medium**

The check rides 300 s and asserts four things: |Tavg − 121.1| < 2.5 °C, not scrammed, no SI, Mode 4. It reads no level, no pressure, no inventory. The band is fitted to the observed drift and reddens **inside the same evolution**: −1.07 °C at 300 s (passes), −1.97 at 600 s (passes), −2.93 at 900 s (**fails**). Over the same ride the quantities it never reads run away to water-solid at 29.4 psia (H-2). Mode stays 4, scram false, SI false, `beyond_model` never set for 90 min — so every clause it does assert stays true.

The record's own figure is the 5-minute sample of a monotone ramp: §74's "Hold: −1.07 °C over 300 s" measured the first 6 % of the transient and declared the rest. Direction argues defect, not intent: `PZ.levelProgram(121.1)` returns 25.0 % against an actual 30.0 %, so the controller's error points **down** the whole ride while level rises to 100 % — bubble condensation, not a controller chasing a program. Of the four group-N mutations, three are pure construction wiring; only the `hx_fraction` one perturbs the balance, and nothing in the group can see an inventory or pressure runaway.

**Fix:** assert equilibrium, not a Tavg band — bound d(level)/dt and d(P)/dt, or assert `cvr.net_kgs ≈ 0` directly, and extend past the failure horizon.

---

### M-8. Wave 1's headline shell fix has no check and no mutation — proven blind
`test/run_pwr2_shell.js:78` — **medium**

Wave 1's stated defect was that `set_boron_adjust` read `c.mode` (always undefined from the kernel and every real caller), landing every dose as a no-shift lineup. The repair (`pwr2_shell.js:128-131`) is ungated: no pwr2 test issues `set_boron_adjust` through the shell, and the 29-mutation list has no entry for the mapper.

**Measured by injection:** I appended one mutation reverting the handler to `EN.command(e,'makeup', c.mode)` and ran the suite's own self-test — `BLIND TO AUDIT PROBE`, **69 passed / 0 failed**, the full clean baseline with the wave-1 defect restored. All 29 shipped mutations were caught in the same run.

The defect is load-bearing on the product path (`ui/app.js:5795` and `control_kernel.js:1420` both send `{rate}`) and silent. Plant effect measured: a BORATE press for 10 minutes moves boron **625.8 → 651.9 ppm as shipped**, and **625.8 → 625.8 ppm reverted**, with nothing thrown.

**Fix:** a shell check issuing `set_boron_adjust {rate: 0.02}` asserting both `cv.boron_rate_cmd` and that boron moves at that rate over a ride; register the `c.mode` revert as a mutation.

---

### M-9. "Dilution is slow at high boron" is exactly backwards, in six places
`engines/pwr2/pwr2_cvcs.js:249` — **medium**

With C_in clamped to 0 the balance is dC/dt = −inFlow·C/M, whose magnitude is **proportional to C**. Dilution is fast at high boron; it is **boration** that saturates near the tank concentration. Measured ceilings (ppm/s, fixed lineup):

| boron | dilute | borate |
|---|---|---|
| 200 ppm | −0.01462 | +0.16813 |
| 700 | −0.05117 | +0.13158 |
| 1400 | −0.10234 | +0.08041 |
| 2400 | −0.17544 | +0.00731 |

Dilution is **12.0× faster** at 2,400 ppm than at 200; boration is **23.0× slower**. The code is right; the prose is inverted at `pwr2_cvcs.js:249`, `:193` (which also asserts a source the header never gives — the Ginna UFSAR quote concerns blend flow rates, not rate-vs-concentration), `PWR2_VALIDATION.md:3535`, `CHANGELOG.md:127`, `test/run_all.js:1002`, and three check **names** in `run_pwr2_cvcs.js` (:14, :197, :227) sitting on assertions that correctly require fast-at-high (:149 asserts hi/lo = 4.0; measured 4.000). No plant behavior is wrong — the risk is a future agent "fixing" the code to match the comment.

**Fix:** correct the six sites; drop the "sourced" tag (the shape is a derivation, not a citation).

---

### M-10. `true_state.rhr_active` and `controlState.rhr_active` disagree on the shipped Mode 4 preset
`engines/pwr2/pwr2_true_state.js:296` — **medium**

true_state defines it as `duty_kW > 0`; the shell defines it as the valve. Wave 10 boots hot_shutdown with `valve_open true, hx_fraction 0` — a deliberate hold — so the board paints **"RHR Active: no"** (`ui/app.js:699`) directly above **"RHR Suction Valve: OPEN"** (`:700`) with `eccs_mode` already `rhr`. Cracking the HX to 30 % makes them agree.

Two authorities say the field means the alignment: `CONTEXT.md:623` defines the §6.3 contract field as *"RHR aligned = hot-leg suction valve open"*, and the in-app glossary says the same. PWR1 honours it (`pwr_engine.js:536` `s.rhr_active = !!s.rhr_valve_open`), and the board wiring's own comment (`pwr_board_wiring.js:515`) asserts `rhr_active === rhr_valve_open` — which PWR2 silently falsifies. Downstream: `ui/event_stream.js:71` will log a spurious "RHR secured" when the HX is throttled on a still-aligned system, and `ui/manual_procedures.js:525` grades the cooldown ALIGN step on `rhr_active > 0`, satisfying it with HX flow rather than the alignment the step commands. `run_contract` is static, so nothing gates the drift.

**Fix:** publish `rh.valve_open`; expose duty separately as `rhr_duty_kw` for the heat-sink summary that legitimately wants it.

---

### M-11. RHR duty is spread onto the two off-loop stagnant nodes — 15 % goes into the pressurizer
`engines/pwr2/pwr2_rhr.js:175` — **medium**

`shareOut` distributes duty across every node in `sys.nodes` by volume fraction with no topology filter, and `pwr2_loop.js:52` declares `pressurizer` and `vessel_heads` OFF_LOOP with no transport at any flow. The module's justification for spreading — *"the loop MIXES that back over a transit time"* — is a circulation argument that cannot apply to a stagnant surge volume RHR flow never reaches. Wave 2 made it live (`pwr2_engine.js:737-740`); before the reorder the heats map fed only true_state.

Measured (hot_shutdown, HX 1.0): duty 8,265.6 kW split `pressurizer` **−1,238.4 kW (14.98 %)** and `vessel_heads` **−622.1 kW (7.53 %)** — **22.5 % of shutdown-cooling duty on nodes with no flow path to RHR**. The shares are exactly the geometry volume fractions, so it is analytic, not noise. Sizing it: re-normalizing the same duty onto the nine ring nodes only takes the 300 s cooldown to 106.9 °F instead of 124.8 °F (**17.9 °F**) and pressure to 206.5 psig instead of 270.7 (**64 psi**) — about 14 % and 24 % of the excursions. Energy is conserved exactly, so this is distribution, not leakage. The real-plant lesson runs the other way: shutdown cooling **cannot** cool the pressurizer, which is why the module carries auxiliary spray at all.

**Fix:** restrict `shareOut` to the ring nodes, renormalise, and note it in declared omissions.

---

### M-12. `sg_overfeed` is a rewritten demand — it self-heals, is never reported, and its clear force-selects AUTO
`engines/pwr2/pwr2_shell.js:410` — **medium**

The engine comment at `pwr2_engine.js:471` states these levers are "each a persistent physical state, never a rewritten demand (#200)". `sg_overfeed` writes the operator's own actuator (`feed_manual_frac 1.2`, which also clears `fw.auto`). Measured through the full control_kernel stack:

1. Operator takes MANUAL 80 % → `fw.auto false, manual_frac 0.80`.
2. Inject overfeed → `manual_frac 1.20`, kernel ledger has the row, **engine ledger empty** (`getActiveFailures` has no branch for it).
3. Operator commands 100 % during the casualty → held at 1.20 (the kernel's `command_override` seals this half for a board player; at the engine door it wipes the casualty with no clear).
4. `clearFailure` → **`fw.auto` force-flipped to TRUE and `manual_frac` left latched at the casualty's 1.20**.

So the clear destroys the operator's MANUAL selection *and* leaves the casualty's own demand sitting behind the selector, ready to reappear the moment he retakes manual. Worse than filed. The gate asserts only that the menu row exists. `getActiveFailures` has no production caller, so (b) is low consequence on its own.

**Fix:** give the overfeed its own seat (`fw.overfeed_frac` read downstream of the demand), report it, and make the clear drop the seat without touching `fw.auto` or `manual_frac`.

---

### M-13. Clearing a station blackout unconditionally restores offsite power and desyncs the kernel ledger
`engines/pwr2/pwr2_engine.js:455` — **medium**

`case 'station_blackout'` with `false` sets `elec.offsite = true` regardless of how offsite got there. The shell exposes LOOP and blackout as two independently injectable/clearable rows, so the instructor **cannot model the sourced case the two rows exist to separate** — the diesels answering with the grid still down.

Measured through the real ControlLayer: inject LOOP → ledger `[loss_of_offsite_power]`; inject blackout → both; clear blackout → **offsite TRUE, kernel ledger still `[loss_of_offsite_power]`, engine-derived `[]`, `ac_available` true, `set_rcp` accepted**. Unchanged after a further 120 s. The Failures tab (`ui/app.js:4381` off `SimulationService:555`) keeps drawing an active LOOP on a plant whose grid the engine restored, and the operator's only way to clear the orphaned row is to click clear on a row whose effect is already gone. The shape is inherited from PWR1 (`pwr_engine.js:1650`) and the engine comment declares the restore-both behavior — but that declaration covers only the engine half, not the ledger divergence.

**Fix:** remember whether offsite was already lost at injection (or leave offsite where it was and require a separate `offsite_power true`), and re-assert the LOOP row on the shell's clear when the kernel still lists it.

---

### M-14. `boron0 += 0.01 / worth_per_ppm` — the cold IC ships 4,348 pcm of boron margin where 1,000 is declared
`engines/pwr2/pwr2_engine.js:214` — **medium**

The line adds a flat +100 ppm; the comment (`:209-211`) and the ICS header (`:130-131`) declare that as "the adopted 1000 pcm (+100 ppm at the module's 10 pcm/ppm)". But boron reactivity here is the sum of a direct term **and** the density coupling inside `moderatorReactivity`, so 10 pcm/ppm is nominal and only near the reference temperature.

Measured at the hot_shutdown IC's own state (250 °F / 364 psia): `criticalBoron` = 899.48 ppm, IC ships 999.48 ppm; reactivity at 899.5 ppm = 0 pcm, at 999.5 ppm = **−4,348 pcm**. Local cold worth **43.48 pcm/ppm** against the 10.0 assumed — a factor of 4.35. End to end, `reactivity_pcm` at step 1: hot_full_power −0, 50_percent −0, hot_zero_power −1,137 (declared 1,000, hot, close enough), **hot_shutdown −8,024 against the declared 4,676** — 3,348 pcm excess, all in boron. The batch already knew: `run_pwr2_engine.js:1111` measures the shutdown bank's cold equivalent at "~84 ppm" for 3,676 pcm (I measure 84.54 ppm = 43.48 pcm/ppm) while the engine converts at 10.

Nothing misbehaves — the margin is conservative — and §74 states the IC only as "boron 999 ppm". The wrong declaration lives in the engine comment and §73's hot-standby line.

**Fix:** solve the margin in reactivity (find the boron adder making the model's own reactivity −0.01 at the IC's T/P) rather than dividing by the nominal worth.

---

### M-15. The `~48 kg/s` 1982 Ginna anchor is in no lane's source corpus
`Blueprint/PWR2_VALIDATION.md:3691` — **medium**

The SGTR tube area is honestly declared [UNVERIFIED] and the break-location quote is genuinely sourced (Ginna UFSAR ch.15 ML20339A101:7376/7341/7345 all check out). But the number that makes the declared area look right — *"Full severity: 52.2 kg/s initial vs the 1982 Ginna event's ~48 kg/s"* — is **recalled, unmarked, and used as corroboration**.

`node tools/find_source.js` across all 3 lanes / 39 documents: 0 hits for the 1982 Ginna event, 0 for any SGTR break-flow magnitude. The corpus's only SGTR flow figure is the design-basis **integrated** 175,870 lbm over 5,684 s = 30.9 lbm/s (14.0 kg/s) **average** — not an initial rate. It is repeated in **8 places**, not 4: `PWR2_VALIDATION.md:3691`, `pwr2_shell.js:382`, `run_pwr2_engine.js:824` (a gate's PASS text), `CHANGELOG.md:101`, `TUNING_LOG.md:128`, `run_all.js:1010`, the `d14c533` commit body, and `inbox/507_waves456_comment.md:5`.

**Additional defect found while verifying:** `pwr2_shell.js:381` states *"MEASURED at full severity: ~47 kg/s initial"* where the plant measures **51.80 kg/s (114.2 lbm/s)** — a 9 % understatement that happens to make the unsourced anchor look like a near-exact hit when the true gap is ~8 % high.

**Fix:** mark the comparison `[recalled — no corpus document]` in all eight places or drop it, and correct the stated measurement at `pwr2_shell.js:381`.

---

## 3. UNCERTAIN — worth a human look (reported unverified, low severity)

These were not run to ground; each is a single-line claim with a file:line.

| Site | Claim |
|---|---|
| `pwr2_shell.js:142` | The #458 refusal fires on the **high-head** pumps and tells the player "(SI actuated)" when no ESFAS signal exists; #458's fact is that RHR pumps are the *low*-head machines, and `set_hpi {active:true}` sets the flag by hand. |
| `pwr2_rhr.js:196` | `createRHR({running})` is now dead (overwritten every step); its comment documents fraction semantics belonging to `avail`, which no command can set — so the sourced half-lineup case is unreachable. The old mutation was deleted rather than re-pointed. |
| `PWR2_VALIDATION.md:3645` | §68's LOOP figure (2119.9 psia) does not reproduce, and its attribution ("the dead heaters") cannot be right — §68 says two paragraphs earlier that a LOOP arms the shed, so heaters are 0 kW in both cases. The real difference is seal injection. |
| `pwr2_shell.js:669` | `getActiveFailures` reports the break family by **node**, so `large_loca` returns as `primary_leak` (no menu row) while the injected row reads inactive; `sg_overfeed`, `rcp_trip`, `turbine_trip` are in the keep-list with no branch at all. |
| `pwr2_true_state.js:375` | The mode-ladder comment declares Mode 5 unreachable (it is reachable — see H-2) and Mode 2 folded into 3; the boundary is `power_pct > 2`, so the 2-5 % band prints **"At Power"**. |
| `pwr2_engine.js:868` | ROD LIMIT LO and LO-LO annunciate on **every** reactor trip — the RIL is gated on power > 5 % but not on scram state, so the tech-spec-violation row comes in on a scrammed core and self-clears. |
| `pwr_config.js:2719` | The rod-limit channel's currency is half converted: setpoint rebased to 200-step, declared range and full-scale left at pwr1's 912 fine steps — the manual's "Reads full scale when the limit does not apply" is false (the shell writes 200 = 22 % of scale). |
| `PWR2_VALIDATION.md:3900` | §73's "~4 % momentum overshoot" is the gap to the `mdot_rated` **constant**, which the running plant already exceeds by 5 %; against the settled value the overshoot is 0.47 %. |
| `run_pwr2_cvcs.js:200` | "rate 0 is bit-identical to a never-commanded lineup" compares two byte-identical objects (0 is the constructor default) — it can only detect a change to the default, never to the actuator. |
| `run_pwr2_engine.js:368` | One group-B mutation's "caught" verdict rides a `TypeError` in a check's own note string with **zero checks recorded**; the suite aborts and every later group-B check is skipped. The identical trap this file documents at its own mutation loop, fixed in the accounting rather than at the probe. |
| `run_pwr2_shell.js:354` | The wave-4 SBO/AFW check proves the module, not the plant: `stepAFW(aw, 0, {mdafw_power_ok: false})` at dt = 0 with the driver hand-forced — it would pass unchanged if the shell stopped wiring `acAvail` in. |
| `ui/app.js:332` | The pwr2 card's two `initStates` comments claim three presets and a deferred cold shutdown; four ship, in the array directly beneath them. |
| `PWR2_VALIDATION.md:3809` | "547.9 °F = Tsat of the sourced 1005 psig" measures **547.00 °F** by the plant's own water library; the error is copied into four files including a gate's assertion text. |
| `PWR2_VALIDATION.md:3858` | The ROD LIMIT LO setpoint is tagged [sourced] to WTSM 8.4 ML11223A256, which is in no lane's corpus — the quote is inherited from pwr1's own comments. The number may be right; the tag is unsupported. |
| `PWR2_VALIDATION.md:3664` | §68 closes "run_hardrules holds 363"; commit `49a8d30` **inside this span** moved it to 364. The record states a superseded count for work it is the record of. |
| `CLAUDE.md:649` / `:714` | The status paragraph says 86 runners; the command block every agent copies still says 52. Pre-existing rot, but inside the audited region and read every turn. |

**One additional gate finding, verified but downgraded** (`test/run_pwr2_shell.js:501`): the `porv_indicator_stuck_closed` check's central clause is healthy-plant-true and nothing in the fixture opens the valve, so the deception is unasserted — deleting the lie itself (`pwr_instruments.js:349`) leaves the check **PASS**. But the reviewer's supporting evidence was wrong: the feature *works*. Stepping the pressurizer setpoint down 145 psi so the controller demands the PORV open gives lamp "open" healthy and lamp **"closed"** with the failure while pressure falls 2,230 → 2,168 psia — the TMI-2 lie, correct. Their sweep saw 0 diffs because `stuck_porv_open` latches the *disc*, not the demand, and a stuck disc reading "closed" **is** the deception by design. Net: coverage gap, severity low.

---

## 4. What the refutations say about where the work is solid

One filed high-severity finding was refuted outright, and it is instructive: the claim that letdown is unisolable and drains the RCS through a station blackout was **false** — `pwr2_engine.js:765` wires `pzr.letdown_isolated` to `cv.letdownOpen = 0`, driven by the sourced 17 % low-pressurizer-level latch (`LEVEL.low_cut_pct = 17`, WTSM 10.3). The reviewer searched for the construction flag `cv.isolated` and missed the runtime lever. Reproducing the ride shows the drain is **bounded by that isolation**: the plant parks flat at 17.27 % level, 1,797 psig, 58.6 °F subcooling with letdown flow exactly 0.0000, and the figure filed as a 20-minute endpoint *is* the setpoint acting. The sourced protection worked, and worked silently enough that an auditor mistook its endpoint for a runaway. Several other sub-claims collapsed the same way under measurement — the RHR duty spread turned out to conserve energy exactly to the volume fractions, the SGTR hi-hi feedwater isolation does fire and does trip the turbine for carryover as §69 says, and the mass balance in the shutdown IC closes to 0.1 kg, proving the fill is real physics rather than a solver defect. The pattern is consistent: **where waves 1-10 built a mechanism against a cited document, it is right and it holds up to a probe.** The failures are all at the edges the source did not cover — an exchanger sized from the wrong lineup, a bus wire not carried to the third and fourth load, an energy balance with no floor beneath its mass floor, and gates whose windows stop before the interesting part. That is a maturity problem in the harness, not a physics problem in the model.