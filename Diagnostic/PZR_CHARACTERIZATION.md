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

---

## 4. The load-bearing map — first sweep of the pressurizer constants, ever

`node tools/perturb_sweep.js --suite=pwr` with nine pressurizer nudges. `DEFAULT_NUDGES`
has never contained one, so there is no prior to compare against.

| Nudge | moved | verdict |
|---|---|---|
| `K_heater ×1.03` | **18/260 (6.9 %)** | ok |
| `level_per_mass ×1.02` | 17/260 (6.5 %) | ok |
| `K_surge_level ×1.03` | 16/260 (6.2 %) | ok |
| `level_per_tavg ×1.02` | 15/260 (5.8 %) | ok |
| `P_restore_rate_gain ×1.03` | 8/260 (3.1 %) | weak |
| `K_sat_pull ×1.03` | 7/260 (2.7 %) | weak |
| `level_per_void ×1.02` | **1/260 (0.4 %)** | weak |
| `K_spray ×1.03` | **0/260** | **INERT** |
| `solid_bulk_mpa ×1.03` | **0/260** | **INERT** |

**Verdict flips across all nine: ZERO.**

### What this actually says

1. **The 37-scenario suite is nearly blind to pressurizer tuning.** Every band in it is
   wider than a 2–3 % move of any pressurizer constant. It will stay quiet through the
   rebuild — so **Phase 3d's A/B has to lean on the behaviour battery, not the scenarios**,
   and a green `run_pwr` will be weak evidence that the rebuild landed correctly.
2. **`K_spray` is INERT across 37 scenarios** — and `MO-4` measured that same constant
   driving the plant **2235 → 1266 psi** under a manual demand. The authority with the
   largest measured single-control excursion on the plant is invisible to the scenario
   suite. (INERT means *this suite cannot speak about it*, not that it does not matter —
   `CC-5`/`TR-11` hold spray in the battery.)
3. **`solid_bulk_mpa` is INERT** — no scenario reaches the solid regime. `CA-12`, `CA-15`
   and `CA-19` are battery probes, so the entire solid-plant regime rests on three probes
   in one suite.
4. **`level_per_void` moves exactly ONE check.** The TMI deception constant — the flagship's
   whole teaching payload — is felt by a single check in the scenario suite. `TD-2`/`TD-5`/
   `TD-6` live in `CA-18`, again in the battery.
5. **`K_heater`'s 18 movers are all in the Mode 5↔1 heatup/cooldown family** (verified by
   diffing the child outputs directly: heatup peak rate 375.9 → 364.7 °C/hr, cooldown
   −579.7 → −604.6 °C/hr, criticality timing, the paced-heatup worst hour). Heaters move
   what heaters do work on, and nothing else.

**The honest limit on point 5, stated because §7 leans on it:** a 3 % nudge identifies which
checks *feel* a constant. It does **not** predict behaviour under a 347× change. It rules
out "twenty unrelated probes redden at once"; it does not promise the heatup family will be
easy.

### A finding about the harness itself

The two-suite sweep was killed at 70 minutes. Measured cause: an unperturbed scenario-suite
child costs **53.0 s** and a `K_heater`-nudged one **53.3 s** — the scenario suite was never
the problem. The **behaviour-battery** children run **~14 min each against a 96 s
baseline**, a ~9× blowup, consistent with probes whose run loops terminate on a pressure or
level threshold and ride to their horizon when that threshold moves. **The behaviour
battery is effectively un-sweepable today**, which is part of why these constants have
never been swept. Worth its own issue; not part of this rebuild.

---

# Part 2 — the SAME rows measured on v2 (2026-08-14, phase 3b)

**What changed since Part 1.** v2 is on the engine path behind the flag: `stepPressure`
and `stepLevel` are the rebuilt model, `P_restore_rate_gain` does not exist in it, and
nothing replaces it. Same harness, same seed (4242), same manual lineup — the pressure
channel disengaged and heater/spray demand fixed by command — so the two columns are
comparable line for line. `--pzr2` stamps the model into the artifact header.

| Row | v1 (Part 1) | **v2** | Reading |
|---|---|---|---|
| **MO-1** load 100→70 MWe, manual | +27 psi peak, **0 psi settled** (exactly setpoint); level 55.00 → 65.38 → 61.49 | **+73 psi peak (2308), settles 2223 — 12 psi BELOW start**; level 55.00 → 67.69 → **61.48** | The transient roughly triples and, more importantly, the plant no longer returns to the operator's setpoint on its own. Settled LEVEL agrees with v1 to **0.01 points**, which is the ported surge law and the new geometry agreeing about inventory. |
| **MO-2** reactor trip, manual | trough 2181 (**−54 psi**), back to 2235 by t+8 min on **0 %** heaters | **trough 2004 psi (−231), and it stays down** (2004 at t+15 min, still drifting) | The row's stated intent — *"a real PWR drops several hundred psi on a trip before the heaters recover it"* — is now several hundred psi. Tavg −32.9 °F and level → 28.0 (the program floor) are unchanged from v1. |
| **MO-2b** same trip, channel ENGAGED | **2235 psi at all 21 samples**, heaters peak 1.77 % | dip to **2211 (−24 psi)**, recovered to 2235 in **~3 min** by the heaters | The automatic channel is doing the work it is named for, inside `CC-6`'s ~5 min band. In v1 the restore term did it and left the controller nothing to do — which is why every gate agreed with a decorative channel. |
| **MO-3** manual heater step 0→100 % | 2235 → 2341 **in 5 s** (80 psi/s), PORV lifts, **safety injection at t+115 s** | 2235 → 2345 in **~40 s** (≈2.7 psi/s), then the PORV **cycles** 2296–2349 and level drains 55.6 → ~49 | An operator button press is no longer a self-inflicted casualty. The rate matches the region-level measurement (2.89 psi/s at 55 %) and the outcome is the prototypical one: walk away with the heaters on and the valve eventually lifts. |
| **MO-4** manual spray step 0→100 % | 2235 → **1266 psi in 4 min** (−969); level **dips** 55 → 33.6 then recovers | 2235 → **1727 psi in 10 min** (−508); level **RISES** 55 → 67.9; plant trips at t+3 min on OTΔT margin | Direction reverses and it is the physical direction: spray is cold water ENTERING the vessel, so it adds liquid. v1's level dip was the level law reacting to pressure, not to the water. |

**Not yet measured on v2**: the TD (deception), HE (heater elevation), SB, SA and BD rows.
The ledger those TD rows ride is asserted bitwise against v1 at the region level
(`run_pzr2` G6), but that is not the same as measuring the flagship arc, and it is the
first thing 3b owes when it resumes.

**The band for MO-1 is still the owner's** and is now measurable: v2 gives **+73 psi peak
and a −12 psi offset**. Part 1 recommended deferring the band until v2's first
measurement; this is that measurement.

## Part 2b — what the flag-on battery says (2026-08-15)

Three probes driven on v2 with `RD_PZR2=1`, adjudicated one at a time (HR10) rather than
batched as "the rebuild moved things":

**`CA-20` blowdown — WAS A REAL DEFECT, now fixed.** Full-size break floored at 12.89 MPa
against v1's < 1.0. Root cause: steam has no way out of the vessel except the relief
valves, so a draining loop left the pressurizer's steam behind holding pressure up, which
kept the loop subcooled, which kept `primary_void_fraction` at 0, which kept the blowdown
branch from firing. `K_leak_depressurize` ported back into the bubbled branch. The same
break now blows down to 50 psi with ECCS reflooding to 73.8 %.

**`CA-15` solid arrest — A REAL DEFECT, OPEN.** On v2 inventory walks to the **120.00 %
`mass_max` clip** instead of arresting on the solid line at 109.3 %, which is #361's
signature by another road. Two causes, both mine and both stated so the next session does
not re-derive them:

1. **`bulk_mod_eff_mpa` was never calibrated.** Its comment claims it reproduces v1's arrest;
   that claim was written from the intent, not from a measurement, and it is wrong. v1's
   stiffness is `solid_bulk_mpa / level_per_mass` per unit of LEVEL; v2 needs it per unit of
   vessel VOLUME FRACTION, and the conversion was assumed rather than solved.
2. **v2's solid predicate does not fire where v1's does.** v1 enters on `pzrNodeLevel >= 100`;
   v2 enters on `V_liq >= V_pzr_m3`. On a state built for v1 (`levelRaw` 110.3) v2 can still
   be in the bubbled branch, which is why the third leg sees a leak-depressurization term
   that the solid branch would have zeroed. **The seam, not the stiffness, is the first
   thing to fix** — an uncalibrated gain in a branch you are not entering explains nothing.

This is the same gap `run_pzr2` C4c pins from the other side (above ~75 % level the bubbled
path runs away and rails at the steam table's top). One defect, two symptoms, and the fix is
the handover.

**`CA-18` deception ledger — REFIT, not a physics change.** Its algebra legs read
`undefined` on v2 because the probe drives `stepLevel` and the ledger moved to the surge
BOUNDARY (`surgeDemand`), which `stepPressure` calls. The algebra itself is asserted bitwise
against v1 by `run_pzr2` G6 (0.00e+0 divergence over a 200-step ramp/leak/collapse), and the
flagship arc passes on v2 unchanged — `run_pwr flagship_tmi` is **9/9 with `RD_PZR2=1`**,
including the deception episode (level lifts to 100 % while inventory falls to 31 %). The
probe asserts a v1 CALL SITE, so it is 3d refit territory.

### Where the node/loop seam does and does not drift (2026-08-15, follow-up)

`CA-15`'s rig sets `_mass = 1.11` and nothing else, which is a **v1-shaped state**: v1
reconstructs level from `_mass`, so that is all it needs, while in v2 the node's own mass IS
the state. So the probe's "forced solid" plant is not solid to v2 and it takes the bubbled
branch — a refit for 3d, and NOT evidence about the solid regime either way.

The real question the rig raised is whether the node's mass and the loop's inventory drift
apart, since v2 integrates where v1 reconstructs. Measured on both models, same command
sequence:

| | v1 `pzr_mass_frac` | v2 `pzr_mass_frac` |
|---|---|---|
| MO-1 load swing, 30 min, settled | 0.0792 | **0.0794** (0.25 % apart; level 61.48 on both) |
| severity-0.09 break, 40 min post-trip | 0.08 → 0.11 | **0.03 → 0.20, swinging** |

**Normal regimes are fine; the divergence is confined to the heavily-voided post-LOCA
plant** — which is the ported saturated branch, where v2 sets pressure by v1's dP law and
then RESEEDS the regions from level every step. That reseed is the suspect, not the surge
integration, and it is inside the declared narrowing (spec §2.8: the saturated branch models
*loop* flashing and belongs to #474).

**So the open solid defect is narrower than it looked**: it is a seam between the two ported
branches and the rebuilt one, not a drift in the rebuild's own bookkeeping.

### The reseed was minting water — and fixing it exposed the real question (2026-08-15)

**Fixed.** `reseed` rebuilt the vessel's liquid mass *through level* at the branch's new
pressure: the caller computed a level from `m_liq / rho_l(T_liq_old)` and reseed rebuilt the
mass as `level × V_pzr × rho_l(Tsat(P_new))`. Those agree only while the two temperatures do
— and during a blowdown they do not, because Tsat falls with pressure and the liquid gets
**denser**, so the same level comes back as more kilograms. Every step of a depressurization
minted inventory. Normal operation hid it perfectly (`pzr_mass_frac` tracked v1 to 0.25 %).
Reseed now changes temperature and steam content only (`run_pzr2` J1), and the node is
fenced against holding more water than the plant has (J2, the #418 rule).

**And that is where it gets interesting.** With the mass no longer destroyed each step, the
post-LOCA pressurizer **fills to 100 % and pins there** — `pzr_mass_frac` 0.37 against v1's
0.08–0.11. The mass had to be going somewhere before; it was being thrown away by the very
bug that was hiding it.

**The finding: the void credit is an INDICATION artifact, not an inventory transfer.** In v1
the credit is a term in a LEVEL law — it inflates what the gauge reads (and `pzr_mass_frac`,
which is that level ÷ 776) to model loop steam displacing liquid up the surge line. v2's
boundary converts the credit's rate into **kg/s of real water crossing into the node**, and
integrating that on a voiding plant physically fills the vessel with water the plant does not
have. `run_pzr2` G6 says the port is bitwise faithful *as algebra*, and it is; what does not
carry across is the **currency** — level points of apparent displacement are not kilograms.

**This is the TMI deception's own mechanism**, i.e. the highest-risk item the ruled scope
named, so it is not a change to make quietly. Two candidate treatments, and the choice
belongs to the owner:

1. **Credit affects the derived LEVEL, not the node's mass** — v2 publishes
   `level = geometry + void credit`, and the credit never enters the surge. Closest to v1,
   keeps TD-1…TD-6 calibrated by construction, and costs the rebuild one honest wart: the
   published level is no longer purely geometric.
2. **Credit stays in the surge but the loop supplies it** — the displaced liquid is real
   water leaving the loop node, which is #474's work and cannot be done inside this rebuild.

**Recommendation: (1) now, with the wart declared, and (2) when #474 lands.** It preserves
the flagship's teaching payload today and leaves the physical version reachable.

### Option 1 built (2026-08-15) — deception intact, one defect left behind

*(OWNER RULING, 2026-08-15: "Option 1")*. The void credit no longer enters the surge. The
ledger still runs and is published through the LEVEL: `pzr_level_pct = geometry + credit`,
and `pzr_mass_frac` remains the UNCLIPPED level in mass-fraction units exactly as v1 defines
it — `ui/app.js`'s `pzrNodePct` multiplies it straight back by `level_per_mass` to draw the
off-scale reading, and that row's comment records the credit being inside it, so it is a
contract rather than an implementation detail. `ensureRegions` takes the credit back off
before seeding, or taking over a voided plant would hand v2 water the vessel does not hold.

**The declared wart, as ruled:** v2's published level is no longer purely geometric.

**It works where it matters** — `run_pwr flagship_tmi` is **9/9 on v2**, deception episode
included, and `run_pzr2` is 41/41.

**What is still wrong, measured rather than inferred.** On the severity-0.09 break the node's
UNCLIPPED level (`pzr_mass_frac × 776`) reads **~225 points against v1's ~78** on the same
transient, and the vessel is 100 points — so **the node holds more water than the vessel can
contain**, and the published level pegs at 100 % throughout. The credit is bitwise v1's
(G6), so the excess is in the geometric half, i.e. in the integrated inventory.

**Leading hypothesis, NOT yet confirmed and flagged as such:** an integrator ratchet at the
empty end. The surge is integrated, and the drain is clamped (`Math.max(1e-6, …)`), so
outsurge demand beyond an empty vessel is DISCARDED — while the ECCS refill that follows
(`_dmass_dt` turns positive as inventory recovers 68 → 83 %) is credited in full. v1 cannot
have this failure because it RECONSTRUCTS: its node reads honestly negative off-scale
(`app.js` records −105 at 100 s, −172 at 400 s on a sev-0.6 LOCA). If the hypothesis holds,
the fix is to let the node's inventory bookkeeping go signed the way v1's does, with the
region physics using the clipped-at-zero value — **which needs measuring first, not
assuming.**
