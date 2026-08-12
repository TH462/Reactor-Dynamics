# PWR Pressurizer — Phase-1 characterisation of the CURRENT plant (#472)

**What this is.** Method step 3 of the owner-approved pressurizer rebuild: measure what
the plant does **today** on every amended catalog row, so that during the rebuild each red
can be classified *correct-must-survive*, *vestigial-must-die*, or *v1-cannot-express*
instead of being argued. Acceptance rows are `Blueprint/PWR_BEHAVIOR_CATALOG.md` §13
(v4.0, ruled 2026-08-12).

**Layer and provenance.** Every number below is **full stack (M4+M5+M6)** through
`node test/measure_stack.js`, shipped free-play lineup, seed 4242, `--accel=10`. Rows
marked *(battery)* come from `test/run_behavior.js` at engine+M4 with seed 0xC0FFEE — a
different plant, and the difference is why the source is stamped per row. Nudged runs
carry `--nudge=` and are **not the shipped plant**; they are shown only to expose what a
term is masking.

**Manual mode means the `pzr_pressure` channel disengaged** —
`{"action":"set_auto_channel","channel_id":"pzr_pressure","engaged":false}` — which is the
bumpless disengage, so heaters and spray both sit at their delivered value (0 %) with the
selector where the operator left it. Verified in every table: `heater_power_pct` and
`spray_valve_pct` read 0 throughout.

---

## 1. The headline — and a correction to the dossier

`Blueprint/PWR_PRESSURIZER_REBUILD.md` §5 records the defect as *"2235 psi — never
moves"*. **That is a sampling artifact.** Measured at 20-second resolution, the surge →
pressure coupling is present and sizeable; what the `P_restore_rate_gain` term suppresses
is not the *response* but its *persistence*.

| | peak excursion | where it settles |
|---|---|---|
| **Load 100→70 MWe, manual** — as shipped | **+27 psi** (2235 → 2262) | **2235 psi — exactly the setpoint, 0 offset** |
| same, `P_restore_rate_gain ×0.001` | +48 psi (2235 → 2283) | **+30 psi** (2265) |
| **Reactor trip, manual** — as shipped | **−54 psi** (2235 → 2181) | **2235 psi — back to setpoint in ~6 min** |
| same, `P_restore_rate_gain ×0.001` | **−140 psi** (2235 → 2095) | **−136 psi** (2099), held |

**In both cases the shipped plant returns to the operator's setpoint with the heaters and
spray delivering 0 %.** Nothing physical restores it. That is the defect, stated precisely:
*the equilibrium is wrong, not the transient*. It also means the rebuild's target is not
"make pressure move" — it already moves — but **"make it stay where physics leaves it."**

**Why nothing caught it, measured.** Same trip with the channel **engaged**: pressure reads
**2235 psi at every one of 21 samples**, and the heaters peak at **1.77 %**. The automatic
channel is decorative on this transient — the restore term does the work and the
controller has nothing left to do. Every gate we have asserts endpoints with the channel
engaged, so all of them agree with this plant.

---

## 2. Row-by-row

### MO — manual-first pressure authority

| Row | Measured today | Classification |
|---|---|---|
| **MO-1** normal-ops surge→pressure, manual | Load 100→70 MWe: level **55.00 → 65.38** peak → 61.49 settled; Tavg **304.5 → 311.7 °C** (+13.0 °F); subcooling **72.9 → 60.2 °F** (−12.7); pressure **+27 psi peak, 0 psi settled**. Return to 100 MWe: −18 psi transient, settles 2235 | **SPLIT.** Transient response *correct, must survive*. Settled offset of zero is **vestigial, must die** — the neutered run says physics wants **+30 psi** |
| **MO-2** trip outsurge, manual | Trip from 100 %: Tavg **304.5 → 286.2 °C** (−32.9 °F), level **55.0 → 28.0** (the program floor), pressure **trough 2181 psi at t+2 min (−54)**, back to **2235 by t+8 min** with 0 % heaters and 0 % spray | **SPLIT**, same shape. The −140 psi held response (neutered) is the physical one; recovery-to-setpoint-on-nothing is vestigial |
| **MO-2b** trip outsurge, auto | **2235 psi at every sample — no dip at all.** Heaters peak **1.77 %**, spray 0.05 % | **VESTIGIAL.** A real PWR drops several hundred psi on a trip before the heaters recover it. The row's acceptance must become *recovers on the CC-6 tempo*, never *never dips* |
| **MO-3** manual heater step | **There is no step response to measure — the plant reaches relief first.** 0→100 % at power: pressure **2235 → 2341 psi in 5 s** (0.55 MPa/s = 80 psi/s, the declared §12.15 departure). PORV lifts at t+5 s and **cycles ~9 times in 50 s**; pressurizer mass **0.0709 → 0.0613**, level **55.0 → 47.6**. At t+55 s the discharge has pressurized containment past the sourced 3.5 psig SI backup — **HPI actuates, heaters shed** (#447). **Button press to safety injection: 115 s** | **VESTIGIAL, MUST DIE.** At the sourced 1.586e-3 MPa/s the same 0.79 MPa rise takes **500 s (8.3 min)**, ~100× longer, with spray and the operator inside the loop the whole time |
| **MO-4** manual spray step | 0→100 % demand delivers at the **`spray_flow_max` 12 % cap** (indicated flow ~60 %): pressure **2235 → 1266 psi in 4 min** (−969 psi), Tavg 304.5 → 282.7 °C, level dips 55.0 → 33.6 then recovers | **Cap CORRECT (CC-5 rests on it); magnitude UNMEASURED against a source.** −969 psi from one valve is the spray-side twin of MO-3 |

**Band for MO-1 stays deferred** *(as ruled)*: +30 psi is what the current model gives once
the mask is removed, and that model is the one being replaced. It is a floor for
plausibility, not a target.

### TD — the TMI deception (computed from config, not transcribed)

| Row | Measured today | Classification |
|---|---|---|
| **TD-1** the difference | `−level_per_mass + void_gain·level_per_void` = `−776 + 3 × 375.33` = **+349.99 %/frac** | **CORRECT, MUST SURVIVE** |
| **TD-2** calibration point | void 0.2 on the deception line = **78.33 %** (row says 78.3 ± 0.2) | **CORRECT, MUST SURVIVE** |
| **TD-3** flagship episode | `run_pwr flagship_tmi` green at baseline — >25-point lift over 1200 s with inventory falling | **CORRECT, MUST SURVIVE** |
| **TD-4** mission crest | `run_campaign` 51/51 green — indicated level crosses the 65.0 trigger | **CORRECT, MUST SURVIVE** |
| **TD-5 / TD-6** relief fence, no-ratchet | asserted exactly by CA-18 legs B/D *(battery)*, green | **CORRECT, MUST SURVIVE** |

### HE / SB / SA / BD

| Row | Measured today | Classification |
|---|---|---|
| **HE-1** progressive authority loss | **v1 CANNOT EXPRESS** — authority is a 0-or-full cliff; there is no elevation band in the model | new capability |
| **HE-2** the 17/20 latch | CA-10 green *(battery)* — configured at the sourced setpoint, never fires in normal ops, defeated by a stuck transmitter | **CORRECT, MUST SURVIVE** (owner: keep both) |
| **HE-3** failed transmitter bounded by physics | **v1 CANNOT EXPRESS** — with the latch fooled there is nothing underneath it; #334's 2207-psi deadhead is the record of that | new capability |
| **SB-1** small-break lift | CA-18 leg B green *(battery)* — flow-form credit exact to 1e-9, w-split suppresses at LOCA leak | **CORRECT, MUST SURVIVE** |
| **SA-1** solid arrest | CA-15 green *(battery)* — arrests at **109.28 %** against a computed 109.3, clear of the 120 % clip | **CORRECT, MUST SURVIVE** |
| **SA-2** solid bulk-modulus / spray dead at solid | CA-12 green *(battery)* — pressure responds > 50 psi at solid; spray zeroed (#347) | **CORRECT, MUST SURVIVE** (mechanism should become structural, not a gate) |
| **BD-1** vented RCS equalises | CA-20 green *(battery)* — never below live backpressure | **CORRECT, MUST SURVIVE** |

### CA-20b — measured, out of scope *(owner ruling 2026-08-12)*

Current xfail values, re-read this pass from `Diagnostic/BEHAVIOR_GAP_REPORT.md`:
**leg A** primary **274 psi** below its own heat sink (band: < 51; healthy plant 5 psi) ·
**leg B** secondary floor **260 psi** (band: > 600) · at t+600 primary and secondary both
**260 psi** — they fell together · inventory 92.0 %, Tavg 403.5 °F · accumulator level 0.0 %.
**Baseline for the A/B**: the rebuild must not move these in either direction without
saying so. Its cause is the ECCS quench gain, not the pressurizer.

---

## 3. What this says about the rebuild

1. **The surge→pressure coupling is real and already in the model.** The rebuild inherits a
   working transient and must fix an equilibrium. That is a much narrower job than
   "rebuild the coupling", and it is the opposite of what §5 implied.
2. **`K_surge_level` produced a defensible transient** (+27 psi on a load swing, −54 on a
   trip) — but the dossier's caveat stands: it has never been validated *as an
   equilibrium*, because the restore term set the equilibrium. Treat the transient as
   evidence, the settling point as unmeasured.
3. **MO-2b is the row that changes.** Today the automatic channel is not doing the work its
   own probes credit it with. Once the mask goes, the heaters must actually recover a
   trip — and at the sourced authority (1.586e-3 MPa/s) a −140 psi excursion takes about
   **10 minutes** to recover, against CC-6's ~5-minute band. **That collision is what the
   §6.4 heater ruling has to settle**, and it is now a number rather than a worry.

4. **The §6.4 heater question is now answered by consequence, not by preference.** MO-3
   says the 347× authority converts a single operator button press into a PORV cycle, a
   1 %-of-RCS inventory loss and an automatic safety injection **inside two minutes** —
   with no failure injected and nothing broken. That is not a plant teaching pressure
   control; it is a plant where the pressure control is a trap. Meanwhile MO-2b says the
   *sourced* authority cannot recover a −140 psi trip excursion inside CC-6's ~5-minute
   band (it needs ~10 min). **Both ends of the departure are now measured, and they point
   in opposite directions** — which is exactly the trade the spec has to state and the
   owner has to rule, rather than inheriting 0.55 because it was there.

**MANUAL-FIRST paid for itself here.** Every one of these numbers is invisible with the
automatic channel engaged: MO-1 and MO-2 read flat 2235, and MO-3's excursion never
happens because the controller never asks for full heaters. The directive is three days
old and it has already produced the rebuild's central measurement.

**Still to measure before Phase 2 closes:** the pressurizer `perturb_sweep` set
(`DEFAULT_NUDGES` has zero pressurizer constants) — the load-bearing map of which existing
checks feel which constant, and therefore which of Phase 3d's reds will be real.
