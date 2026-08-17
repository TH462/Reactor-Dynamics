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

### The signed inventory did NOT fix the solid arrest (2026-08-15)

Worth recording because it was my own prediction and it is wrong. `CA-15` was re-measured on
v2 straight after the signed-inventory fix, on the expectation that the solid arrest and the
discarded outsurge shared a root. They do not: inventory still reaches the **120.00 %
`mass_max` clip** and still fails to arrest on the solid line at 109.3 %.

One leg changed direction, which is the new information: *"the break is still flowing at
settle"* now reads **0.000000** where it previously read 0.000456. The break has stopped
flowing, so the probe's own precondition — the one that exists so the other legs cannot pass
vacuously — is no longer met. **The arrest legs are therefore not currently saying anything
about the arrest**, and re-reading them as evidence would be reading a vacuous probe (the
`run_reachability` lesson, and CA-10 leg B's).

So the solid work is still open and still starts where it did: with the PREDICATE (v1 enters
on `pzrNodeLevel >= 100`, v2 on `V_liq >= V_pzr_m3`), not with `bulk_mod_eff_mpa`.

### The floor is ruled out, and the heatup family verified (2026-08-15)

*(OWNER RULING, 2026-08-15: "Go with b")* — no `level_prog_floor` in v2; level is what the
vessel holds. The ruling rests on a measurement rather than a preference: v2 holds the Mode 5
preset at **55.04 → 55.25 %** over 30 minutes at **122 °F (50 °C)** with no floor, because
the node integrates real charging flow and CVCS actually holds the level where v1 needed a
constant to stand in for it (#289). Accepted consequence: a drained plant reads off-scale low
where v1 reads about +78 points, and the gauge clips to 0 % — which is true.

**Verification, as promised before treating it as settled.** Flag-on `run_pwr` is now
**31/37, 9 checks red** — from 28/37 and 19 red when v2 first took the engine path. Nothing
in the remaining set is level-banded, so the missing floor did not bite the heatup family.

**The 9 are one signal, not nine.** Subcooling goes impossibly negative — **−56 °F on the
heatup, −224 °F on the cooldown, −114.7 °F** on the bound check — i.e. pressure is falling
BELOW saturation for the coolant temperature. That is exactly what the saturated branch's
`K_sat_pull` pin exists to prevent (a liquid cannot superheat; flashing pins pressure AT
Psat(Tavg)), and the predicate that arms it is carried over from v1 unchanged. So the
question is whether the branch is being ENTERED and losing authority, or not being entered —
the #384-class seam risk the plan listed, now with a measurement attached.

**That is the next defect and it should be measured before it is touched**: instrument the
predicate through a cooldown and see whether it flips, flickers, or never fires.

### The subcooling cluster is NOT the saturated pin failing to arm (2026-08-15)

Instrumented the predicate through a full cooldown on v2 — scram, dumps open, pressure
setpoint walked 15.4 → 10 → 4 MPa, 90 plant-minutes, 270,000 steps:

| t (s) | P (psia) | Psat(Tavg) (psia) | Tavg (°F) | subcooling (°F) | saturated? |
|---|---|---|---|---|---|
| 600 | 1453 | 377 | 437.8 | +154.6 | no |
| 1800 | 1198 | 107 | 332.5 | +234.5 | no |
| 3600 | 558 | 51 | 283.1 | +194.7 | no |
| 5400 | 527 | 21 | 234.6 | +237.2 | no |

**Subcooling stays strongly positive the whole way and the predicate correctly never arms.**
So the branch is not failing to fire on an ordinary cooldown, and the seam hypothesis in its
first form is wrong — worth recording, because "the pin never arms" was the obvious reading
and it is not what the plant does.

**Where the signal actually points**: `full spray does not crash pressure to the containment
floor` reads **1.24 MPa against a > 6.0 MPa bound**, and the remaining subcooling reds are on
paths where spray is the pressure control. In v1 spray is a RATE (`K_spray` × demand), so its
authority is bounded per step; in v2 it is condensation — a mass and an enthalpy — and
condensing into a small bubble can take pressure down far faster than a gain would. The
`Psat(Thot)` taper is ported and it scales DELIVERED FLOW, which is not the same as bounding
the pressure the flow can remove.

**Not yet localised, and deliberately not guessed at.** The next step is the same
instrumentation pointed at the failing spray scenario rather than at a generic cooldown:
whether the saturated branch arms and is then out-run, or the crash happens inside the
bubbled branch within a step, decides whether this is a spray-authority question or a seam
one — and those have different fixes.

### Full spray is clean full-stack — the red is a different LAYER (2026-08-15)

Manual full spray on v2, full stack, pressure channel disengaged, heaters at 0:

| t (s) | P (psia) | subcooling (°F) | delivered spray (%) | pzr level (%) |
|---|---|---|---|---|
| 60 | 2235 | +72.9 | 0 | 55.0 |
| 300 | 1896 | +76.4 | 100 | 43.5 |
| 720 | 1678 | +64.8 | 100 | 81.6 |
| 900 | 1053 | +5.5 | **4.8** | 87.8 |

**Subcooling never goes negative, and the `Psat(Thot)` taper visibly does its job** —
delivered spray closes from 100 % to 4.8 % as pressure approaches the floor. 45,000 steps,
all in the bubbled branch. So "v2's spray authority is unbounded" is not supported either;
that is the third hypothesis this cluster has produced and the third the measurement has
refuted.

**The red lives at a different LAYER, which is the standing trap.**
`pressure_saturation_bounds` (`pwr_engine.js:3852`) is **engine-direct** —
`new Harness('hot_full_power')` stepping `h.eng.step(0.5)` — so `stepAutomation` never ticks
and no channel is ever engaged. It also drives **heaters at 100 % AND spray at 100 %
simultaneously**, which is the case v1's taper comment is explicitly written about ("full
heaters vs. full spray floors just at the onset of core-exit boiling"), and it steps at
**dt = 0.5 s** against the plant's 0.1 s.

So the next measurement is that exact lineup, and the three things that differ from the clean
run are the candidates in order: **both controls at full**, **engine-direct**, **dt 0.5 s**.
v2's solid branch sub-steps; the bubbled branch does not, and a condensation term at half-
second resolution is the kind of thing that overshoots where a rate-limited gain would not.

### Sub-stepping did not move CA-15 (2026-08-15)

Re-measured straight after the adaptive sub-step landed, on the expectation that it touched
the same stiff near-solid regime. It does not: inventory still reaches the **120.00 %
`mass_max` clip** and the arrest still does not happen. **Fifth prediction on this cluster to
be refuted by its own measurement** — the running score is worth stating plainly, because
every one of the five looked reasonable from the code and only the number settled it.

What the probe actually drives (`behavior_pwr.js:3936`): `hot_full_power`, a **severity-0.5
`large_loca`** at t+30 s, 4700 s of run, expecting ECCS overfill to arrest on the solid line
at 109.3 % against the 120 % ceiling.

The failing precondition is the lead: *"the break is still flowing at settle"* reads
**0.000000** where v1 reads 0.000456. **A break stops flowing when pressure reaches
containment backpressure** (the √Δp law), and if ECCS keeps injecting into a plant whose
relief path has closed, inventory rides to the clip — which is exactly the shape observed.
Before the `K_leak_depressurize` port v2 pinned a large break HIGH at 1871 psi; the question
now is whether it goes too LOW, i.e. whether the blowdown branch's vent term and pin are
balanced or just differently wrong.

**Next measurement, and it is NOT a diagnosis**: trace pressure and `leak_flow` against
containment through a sev-0.5 break on both models. If v2 equalises with containment where
v1 holds above it, the arrest failure and the precondition failure are one thing.

### The blowdown itself is faithful — CA-15's divergence needs ECCS (2026-08-15)

Traced CA-15's own lineup (`hot_full_power`, sev-0.5 `large_loca`) on both models
engine-direct, pressure against containment:

| t (s) | v1 P / ctmt (psia) | v2 P / ctmt (psia) | leak_flow v1 / v2 | inventory |
|---|---|---|---|---|
| 600 | 21.9 / 16.2 | 21.9 / 16.2 | 1.02e-3 / 1.02e-3 | 63.6 % both |
| 1800 | 15.4 / 14.9 | 15.4 / 14.9 | 3.00e-4 / 3.00e-4 | 60.5 % both |
| 4200 | 46.9 / 41.4 | 46.8 / 40.5 | 9.96e-4 / 1.07e-3 | 58.1 % both |

**Identical to three significant figures, and the break never goes dry** — it keeps flowing
on a small positive Δp all the way out. So the ported blowdown branch is faithful and "v2
equalises with containment where v1 holds above it" is refuted. Sixth hypothesis, sixth
refutation.

**What the reproduction was missing**: `Harness` sets `autoM4 = true`, emulating M4's
mechanical protections so **ECCS actuates**; a raw `PWREngine` has none, so nothing injects
and nothing overfills. CA-15's 120 % clip is an ECCS overfill, which this trace could not
produce.

**So the divergence is downstream of the blowdown, in what happens once injection starts** —
and the next trace must run under the same M4 emulation the probe uses, or it will keep
agreeing with itself. That is the third time on this cluster that a LAYER difference, not a
physics difference, explained a disagreement.

### CA-15 localised: the signed deficit does not recover (2026-08-15)

Run at CA-15's own layer at last — `RD.OpsHarness` (engine + M4, shipped lineup), which is
what makes ECCS actuate. Same lineup, both models, 4700 s after a sev-0.5 break:

| | core inventory | pzr level | leak_flow |
|---|---|---|---|
| **v1** | **109.28 %** — arrests on the solid line | 100.0 % (solid) | 6.5e-4, still flowing |
| **v2** | **120.00 %** — rides to the `mass_max` clip | **0.0 %** | 0.0 — dry |

**v2's plant is overfilled to 120 % while its pressurizer reads EMPTY.** The vessel never
refills, so it never goes solid, never relieves, and inventory has nowhere to stop. That is
the whole failure, and both broken legs are one thing: the break "goes dry" because pressure
has equalised with a plant that cannot relieve, not because the blowdown is wrong (the
blowdown traces bit-comparable to v1 — previous entry).

**The cause is the signed deficit added earlier today.** During the blowdown the loop demands
far more outsurge than the vessel holds, and `applySurge` banks the remainder as debt that a
refill must repay BEFORE the vessel fills. v1 cannot behave this way because its level is a
FUNCTION of current mass — `base + level_per_mass·(m−1) + credit` recovers the instant mass
returns, with no memory. v2's deficit is an INTEGRAL, and an integral remembers.

**Recommendation for the fix**: the deficit must be bounded by what the loop can actually owe
rather than accumulating without limit — the same #418 rule `reconcile` already applies to
the upper bound (the node cannot hold more than the plant has) applied to the lower one (the
node cannot be owed more than the plant is short). That keeps the signed semantics that fixed
the 100 %-gauge-on-an-empty-vessel defect, while letting the node recover with the loop the
way v1's reconstruction does.

**Not built**: this is the same class of change as the void-credit currency question, it is
mine to have caused, and the honest sequence is to measure the bound against v1's
reconstruction before writing it rather than after.

### The bound, measured then built — and CA-15 splits into two defects (2026-08-16)

**The bound was measured against v1's reconstruction first**, as the previous entry promised.
Both models at CA-15's own layer (`OpsHarness`, sev-0.5 `large_loca`), reading the SIGNED
non-credit half of each node level — v1's `levelBase + 776·(m−1)` against v2's
`geometric − deficitPoints` — beside the plant's own shortfall `(1 − _mass)·M_rcs`:

| t (s) | plant short (kg) | **v1** implied debt (kg) | v1 under the bound | **v2** banked debt (kg) |
|---|---|---|---|---|
| 300 | 5581 | 4876 | **712** | 9188 |
| 1200 | 4880 | 4164 | **714** | 10484 |
| 1800 | 4235 | 3519 | **713** | 10623 |
| 2400 | 2410 | 2257 | **713** | 9334 |
| 2700 | **0** | — (positive) | — | 5212 |
| 4500 | **0** | — (positive) | — | **3573** |

v1 sits under `(1 − m)·M_rcs` by a **constant 712–714 kg** — exactly `level_prog_floor`
(28 points × 25.5 kg/point), because its implied debt is `776·(1 − m) − levelBase` and
`levelBase` cannot go below its floor. **So the bound is one v1 satisfies structurally at
every instant**, which is what makes it a fence rather than a fitted number. It is
deliberately the LOOSE version: trimming to v1's exact figure would re-import v1's level law
as the authority, the same thing the upper fence explicitly refuses to do.

The bottom row is the defect stated as a number: **v2's node was owed 3,573 kg by a plant
sitting 20 % OVERFILLED.** Built into `reconcile` (one clamp, mirroring the upper one),
gated by `run_pzr2` J4, injection-verified.

**What it fixed, and it is half of CA-15.** Same lineup at 4500 s:

| | deficit | node water | published level | break |
|---|---|---|---|---|
| before | 3573 kg | 0 kg | **0.0 %** | dry |
| after | **0 kg** | **3520 kg** | **85.8 %** | dry |

Peak debt 10,657 → 7,214 kg against a shortfall peaking at 7,481 (ratio 1.42 → 0.96). The
"100 % overfilled plant with an EMPTY pressurizer" is gone.

**The other half is a DIFFERENT defect, and it is about temperature.** Inventory still rides
to the clip, so the arrest still does not happen — but the cause is no longer the deficit.
With `mass_max` lifted to 1.6 (**not the shipped plant**; the run is shown only to let the
model state its own answer) v2 makes a **clean solid arrest**: node 4,101 kg, level 100.0 %,
flat from t=3000 to t=6900, inventory **119.4 %** and drifting −0.2 points per 40 min.

So v2's solid line is **119.4 %** where v1's is **109.28 %**, and the whole 10 points are
`level_per_mass` being **temperature-blind**. Measured on v1's own settled state
(`inbox/_solidline.js`): at 17.1 psia the node's water is at Tsat **107.6 °C (225.7 °F)**,
density **952 kg/m³**, and v1's declared-solid share of 0.1289 RCS-frac is **2,550 kg =
2.678 m³ in a 4.292 m³ vessel — 62.4 % FULL BY VOLUME**. A genuinely full vessel at that
density is **4,086 kg = 20.65 % of nominal RCS mass**, which is where v2 goes solid (4,101 kg
measured) and it lands **on top of a clip the config's own comment calls "keep unreachable"**.

**v2 is the physical one here** — cold water is denser, so filling the same vessel takes more
kilograms, and v1 calls a 62 %-full pressurizer solid because 100 points is 100 points to it.
That makes the remaining half of CA-15 an **HR9 question about which solid line is the
plant's**, with a consequence attached (the 120 % clip is sized against v1's answer), and
therefore **an owner ruling rather than a fix**. It is not built.

**A limitation of the fence, declared rather than discovered later.** `(1 − m)·M_rcs` is a
MASS-fraction statement, so it says the loop stops accepting water at nominal mass regardless
of temperature. A cold loop holds denser water and could legitimately accept more, which
would push the honest solid line *higher* still, not lower. Stating the loop's capacity as a
VOLUME needs a loop node — #474 — and is outside this rebuild. Consequence to watch: the
fence BINDS continuously for ~2,400 s on this transient (v2's debt tracks the bound exactly
from t=300 to t=2400), so on a deep-shortfall plant v2's level is effectively
`credit − 776·(1 − m)`, i.e. v1's law without the base term. That is a real re-import of the
reconstruction in that one regime, and it is the price of keeping the node's water
non-negative without a loop node to allocate against.

### The seven flag-on reds, adjudicated one at a time — with the LAYER stated first (2026-08-16)

**The layer, because it decides most of them.** `run_pwr`'s `Harness` (`pwr_engine.js:2400`)
is **engine-direct plus M4's MECHANICAL protections only** — it emulates the pressurizer
relief and the turbine trips, and nothing else. `stepAutomation` never ticks, so the
`pzr_pressure` channel **never engages**: heaters and spray read 0.0 % at every sample of
every run below. In **v1 that does not matter, because `P_restore_rate_gain` drags pressure
onto the setpoint by itself** — measured over a 16,000 s heatup, v1 publishes **2235.1 psia
at every single sample** with both controls at zero. The rebuild deletes that term by design
(spec §5). So every probe that leaned on it is now standing on nothing, and that is what six
of the seven are.

| # | probe · check | layer | verdict |
|---|---|---|---|
| 1 | `cold_shutdown_hold` · pressure holds | engine+M4mech | **v2 DEFECT — fixed.** The IC never reached the node |
| 2 | `mode5_heatup_paced` · stayed subcooled | engine+M4mech | **same defect — fixed.** Downstream of 1 |
| 3–6 | `mode5_to_mode1_roundtrip` · 4 checks | engine+M4mech | **probe fixture + a new v2 defect** (below) |
| 5 | `rcp_cavitation` · severity, flow | engine+M4mech | **PROBE FIXTURE.** Its own comment: *"hold it low via the setpoint so it can't recover"* — only `P_restore_rate_gain` can do that |
| 7 | `mode5_controls` · pressure recovers to a raised setpoint | engine+M4mech | **PROBE FIXTURE.** Its own comment: *"heaters/spray hold the operator's target"* — at this layer they are not running |

**#1 and #2, root-caused and fixed. `_buildState` computes the derived init level BEFORE the
per-state overrides**, and its comment promises those overrides "still win, exactly as they
did when this was inline". True of v1's reconstruction; false of a node that seeds once. The
Mode 5 preset came up published at 363 psia / 122 °F **with the node already on the HOT
saturation line at 653 °F**, and one 0.02 s step took pressure to **2235 psia**. Consequences,
measured on the heatup that starts from it:

| | v1 | v2 (before) |
|---|---|---|
| code-safety lifts, one heatup | **0** | **1,369** |
| core inventory, start → end | 101.2 % held | **100.3 → 55.3 %** |
| core exit vs Tavg at the end | 549 / 549 °F | **1,119 / 549 °F — uncovered** |
| `subcooling_c` | +103 °F | **−685 °F** |

**So the subcooling number was never about saturation.** With the core uncovered
`pwr_thermal.js:501` switches `subcooling_c` to `T_sat(P) − max(tavg, t_core_exit)`, and that
is what printed −380 °C. This cluster has now produced four hypotheses — the saturated pin
failing to arm, unbounded spray authority, a branch seam, and this — and only the fourth
survived its own measurement. `seedFromState` is the fix (`run_pzr2` J5); flag-on `run_pwr`
went **32/37 → 34/37**.

**#3–6, and this is where the next defect is.** The roundtrip's heatup is UNPACED with a
6,000 s budget. On v2 the node fills 1,074 → 3,808 kg, goes **solid at t≈2,500 s**, and the
heatup then crawls: Tavg 143 °C at 6,000 s against v1's 285 °C. The same driver *with* pacing
and a 20,000 s budget is green. Two things are true and only one of them is the probe's:

- **The budget was sized against the mask.** v1's unpaced heatup peaks at 435.8 °C/hr, ~8×
  the TS limit — the probe's own comment says so. A heatup with nobody on the pressurizer is
  not an evolution; under MANUAL-FIRST the driver owes explicit heater/spray commands, and
  the auto-mode row then belongs at a layer where the channel actually runs.
- **THE SOLID BRANCH RAILS, and every check is green through it.** Instrumented per 0.02 s
  step over the *passing* paced heatup: published pressure peaks at **188,432 psia
  (1,299 MPa) at t = 2,770.78 s, at level 100.0 %, node 3,553 kg, Tavg 250 °F.** The adaptive
  sub-step is not missing it — it is **saturated**: `nSub = min(64, ceil(excursion/0.05))`
  hits the **64 cap on 335,917 steps** of that one run. The criterion detects the excursion
  correctly and the CAP silently truncates the response, which is the repo's own "no silent
  caps" failure wearing a guard's clothes. It is also why the plant lifts its code safeties
  273 times and bleeds 20 points of inventory while passing.

**Recommended next**, and it is a measurement before a fix: find what `nSub` the solid branch
actually needs at that state. If the answer is thousands, the branch wants an implicit or
analytic treatment rather than more subdivision — its own comment already says a ringing
branch is the integrator's problem, and 64 sub-steps of 0.0016 s not being enough is evidence
about which integrator, not about the gain. C4c pins the same regime from the synthetic side
("driven directly, `stepRegions` still rails above ~75 % level"); this is the first time it
has been caught **on a plant evolution, inside a green suite**.

### The rail is NOT a stiffness problem — it converges, to 1000 °C water (2026-08-16)

**This overturns the recommendation in the entry above, which was mine and was wrong.** That
entry said: *"if the answer is thousands, the solid branch wants an implicit treatment rather
than more subdivision"* — reasoning from the saturated sub-step guard. Measured, subdivision
is not the issue at all.

**What the guard demands, first.** Publishing the UNCAPPED `nWant` over the passing paced
heatup: peak **21,116** sub-steps, and of the 335,917 steps that hit the 64 cap, **335,916
want between 4,096 and 65,536** — one wants 512–4k, none want less. So raising the cap was
never going to be the fix; the demand is uniformly two to three orders of magnitude above it.

**Then the step that actually blows up, captured entering** (`inbox/_rail1.json`):

| entering the step | |
|---|---|
| pressure | **1.554 MPa (225 psia)** |
| liquid / steam | 3,546.5 kg / **1.523 kg** — the bubble is nearly gone |
| node liquid T | 196.1 °C · level **95.42 %** · plant Tavg **68.1 °C** |
| surge in | **125.3 kg/s** at 68.2 °C, heaters full, no spray, no relief |
| **the guard's trial predicted** | **1.428 MPa — a FALL. So `nWant` = 3.** |
| **what the step delivered** | **1,323.6 MPa (191,970 psia)** |

The guard mispredicted by four orders of magnitude **and in the wrong direction**, at exactly
the state it exists to catch. It trials in the same explicit scheme, so a step that crosses
into a liquid-full vessel is invisible to the probe meant to detect it.

**Replaying that one step at increasing subdivision (`inbox/_converge.js`) settles it:**

| nSub | 1 | 3 | 8 | 64 | 1024 | 65536 |
|---|---|---|---|---|---|---|
| P_out (MPa) | 1314.0 | 1319.5 | 1321.2 | 1322.1 | 1322.3 | **1322.3** |
| node T_liq (°C) | 998.5 | 999.5 | 999.8 | 999.9 | 1000.0 | **1000.0** |

**It converges from nSub = 1.** The integrator is fine. The converged answer is liquid water
at **1,000 °C and 1,322 MPa**, and the model reaches it without complaint.

**Why, and it is two dead feedbacks either side of 370 °C.** Water's critical point is
373.95 °C / 22.064 MPa; the model has no notion of it.

| P (MPa) | `T_sat_from_P` (°C) | `rho_l_sat(T_sat)` |
|---|---|---|
| 1.55 | 199.3 | 865.4 |
| 22.064 | 376.0 | 451.4 |
| 50 | 457.1 | **451.4** |
| 1322.3 | **1000.0** | **451.4** |

- **`T_sat_from_P` is `179.47·P^0.239` — a power law with NO ceiling.** The observed 1000.0 °C
  is not a clamp; it is this correlation evaluated at 1,322 MPa. There is no saturation
  temperature there to return.
- **`rho_l_sat` CLAMPS at 451.4 kg/m³ for every T ≥ 370 °C.** Below that, heating the liquid
  expands it, which relieves an over-full vessel and arrests the pressure rise. Above it,
  expansion buys no volume at all.

So past 370 °C both restoring forces are switched off simultaneously: pressure has nothing to
push against and temperature has no ceiling. The vessel in the captured state needs
827 kg/m³ to hold its 3,549 kg, which `rho_l_sat` reaches at about **228 °C** — comfortably
inside the table. The runaway is not that the state is unreachable; it is that once a step
overshoots past 370 °C **nothing brings it back**.

**So the fix is a DOMAIN question, not an integrator one**, and it is the first defect in this
rebuild that is about the correlations rather than the physics built on them. Both functions
need to say what they do at and above the critical point, and the flash solve needs to be
unable to walk the state there. Sizing that is the next measurement; **do not raise the
sub-step cap** — it is a symptom, and 65,536 slices give the same 1,322 MPa as one.

### The rail, finally: 0.65 °C of superheat flashed in one step (2026-08-16)

**This corrects the entry above, which corrected the one above that.** Both of my published
diagnoses were one layer too shallow, and the pattern is the finding: every diagnosis on this
cluster that reasoned from the code was wrong, and the one that found it removed variables
instead — set `dt` to zero and every input to zero and see what is left.

**The measurement that settled it.** Replaying the captured step with **all inputs zero and
dt = 1e-12 s**:

| dt | 1e-2 | 1e-4 | 1e-6 | 1e-9 | **1e-12** |
|---|---|---|---|---|---|
| P out (MPa) | 1322.3 | 1322.3 | 1322.3 | 1322.3 | **1322.3** |
| T_liq out (°C) | 1000.0 | 1000.0 | 1000.0 | 1000.0 | **1000.0** |

Zeroing `surge`, `spray`, `relief` and `heater` individually changes nothing either. **A step
of zero duration with zero inputs is not the identity**, so this was never about integration,
subdivision, or a regime crossing inside a step.

**Layer 1 — `settle` does not converge at a small bubble.** It is a Picard iteration
`T_liq = Tsat(P(T_liq))`, and its own comment justifies the bound: *"rho_l varies slowly with
T, so it converges in three passes to ~1e-9 °C"*. True at a normal bubble; false at a small
one, because the loop gain scales as V_liq/V_stm. Traced by hand:

| pass | 0 | 3 | 6 | 9 | 12 |
|---|---|---|---|---|---|
| **captured node** (95.1 % level, 0.21 m³ bubble) | 196.082 | 193.891 | 191.202 | 188.569 | **186.492 — still moving** |
| **normal node** (55 % level, 1.93 m³ bubble) | 345.000 | 260.496 | 260.367 | converged | — |

The small-bubble case exits its 20-pass bound still drifting, so **the state is left off its
own saturation line.**

**Layer 2 — the next step flashes that residual in ONE step, with no rate limit.**

| | |
|---|---|
| the state's own saturation pressure | 1.4282 MPa → Tsat **195.429 °C** |
| the node's liquid is at | **196.082 °C** |
| **superheat** | **0.653 °C (1.18 °F)** |
| node heat capacity C | 27,005 kJ/°C |
| **E = C·ΔT** | **17,643 kJ — a STATE departure, with no dt in it** |
| flash mass at h_fg = 1961 kJ/kg | **9.00 kg of steam, in one step** |
| into a bubble of | 0.2099 m³ holding 1.523 kg |
| resulting steam density | 7.26 → **50.11 kg/m³ — 6.9×** |

**The same 0.65 °C on a normal 55 % node is a 15.8 % density change.** One and a fifth degrees
Fahrenheit is harmless at 55 % level and catastrophic at 95 %, and nothing in the model knows
the difference.

**Layer 3 — and then it cannot come back.** Past 370 °C `rho_l_sat` clamps flat at
451.4 kg/m³ so expansion stops relieving the vessel, `T_sat_from_P` (`179.47·P^0.239`) has no
ceiling, and `pressureFrom` floors `V_stm` at **1e-6 m³** when the liquid over-fills — measured
after the step, V_liq is **7.862 m³ in a 4.292 m³ vessel**, a true steam volume of **−3.570 m³**
presented as one millilitre. Those three together make **1,000.0 °C / 1,322.3 MPa a STABLE
fixed point of `settle`**, which is why the answer is that exact number every time and why
65,536 sub-steps give the same one as a single step.

**Recommendation, and it is a design call rather than a fix — it is not built.** Layer 3 is
the cheapest and the least controversial: no saturation correlation should return a state past
the critical point (373.95 °C / 22.064 MPa), and a negative steam volume is the SOLID
condition, not a millilitre. But bounding layer 3 alone converts a runaway into a pin, which
is the #334 mistake (a cutoff that turned a stable wrong equilibrium into an oscillation)
wearing new clothes. **The real repair is layer 1** — `settle` needs a method that converges
at low bubble fraction, because layer 2 is only dangerous when it is fed a residual. Sizing
that, and deciding whether the flash also owes a volume constraint, is the same open
solid-regime question this document has been circling, now with a mechanism attached.

**The trap, for whoever picks this up:** a state departure is not a rate, so it does not shrink
when you shrink the step. Three sessions of sub-step reasoning went past that.

### The rail is fixed; decision 1 is refused on its own evidence (2026-08-16)

*(OWNER RULING, 2026-08-16: "Do them as you recommend")*, on three decisions. Two are
built. **The first is not, and the reason is that my own recommendation rested on a premise
the config had already disproved** — which is the standing trap about inherited claims,
committed here by me, one turn after writing it up.

**Decision 2 — settle solves instead of iterating. BUILT.** The measurement that had to come
first: scanning `f(T) = T − Tsat(P(T))` showed the failing state **has** consistent roots
(183.361 °C and 199.397 °C), and the upper one sits at **1.5535 MPa — exactly the pressure
the state was already carrying.** Picard was walking away from a correct answer, so this was
a method question, not the solid-regime design work. Bracket-and-bisect, the idiom
`solveFlash` already uses.

| the captured railing step | before | after |
|---|---|---|
| published pressure | **191,970 psia** | **206.8 psia** |
| node liquid | 1000.0 °C | 195.4 °C |
| converged? | to a spurious fixed point | **from one sub-step** |

Heater authority at 20 / 55 / 70 % is unchanged at 3.017 / 2.893 / 2.858 psi/s.

**Two wrong turns inside the fix, both caught by measurement and neither by review** —
recorded because each looked obviously right:

1. **Taking the NEAREST root** snapped the node back past the equilibrium the physics had
   just pushed it off, **discarding the heater energy entirely** — 0.000 psi/s at 85, 90, 95
   and 99 % level. The rule has to be the direction of travel, `−sign(f0)`.
2. **Holding at the liquid-full BOUNDARY** when no root exists re-created the singularity from
   the other side (1.2e6 psi/s), because that boundary is precisely where `pressureFrom`'s
   1e-6 floor manufactures it. Holding the *incoming* state is bounded.

**Two gates rewritten, both HR10-validated by running the NEW form against the OLD code:**

| | asserted | old code |
|---|---|---|
| **C4c** | the handover: bounded, dt-independent, flagged at 85 % / not at 55 % | 1.06e6 psi/s at dt 1.0 and 1.06e8 at dt 0.01, flag undefined — **fails** |
| **K1** | convergence: the two finest refinements < 1 psi apart | 1 / 256 / 4096 sub-steps gave 1531 / 1907 / **1,074,635** psia — **fails** |

K1's old form asserted that the sub-step guard FIRED. Measured, **more subdivision made the
old model worse**, so that check was certifying that a broken guard was being fed.

**Decision 3 — `_pzrTrim` in the heatup driver. BUILT (the half that was mechanical).** It has
always run in the cooldown and never in the heatup. Flag-off `run_pwr` is **37/37** with it,
so it passes on both models, which is HR10's condition for moving a test.

**Decision 1 — raising `mass_max`. NOT DONE, and I was wrong to recommend it.** The constant's
own comment records a measurement I had not read: *"RAISING IT IS NOT A FIX AND WAS MEASURED:
at 3.0 the plant runs to 300 % inventory with pressure still parked in the PORV band (#346)"*,
and CA-12's header adds *"THE FIX IS A REGIME, NOT A CEILING … `mass_max` then stops being
reachable on this path"*. The ceiling becomes unreachable **because a solid regime exists** —
and v2's is exactly what is exhausted above 75 % level. Raising it there would be removing the
guard that is currently the only thing bounding a regime the model cannot express.

*(CA-12 leg C turned out not to be the obstacle I feared: its band is `< mass_max·100 − 1.0`,
relative, so it follows the constant. The obstacle is #346's measurement, not that leg.)*

**What the heatup family is now blocked on, measured rather than asserted.** With level control
running, a 100 °F/hr heatup still fills the pressurizer solid by t ≈ 1000 s of a 20,000 s ride
and the flag stays set for the remainder. The insurge is **not** a modelling error — the
model's thermal term is within 0.4–2.0× of a first-principles expansion computed from its own
density table:

| Tavg | 150 °C | 200 °C | 250 °C | 300 °C | 340 °C |
|---|---|---|---|---|---|
| first principles (kg/s) | 0.312 | 0.416 | 0.561 | 0.882 | 1.570 |
| the model (kg/s) | 0.638 | 0.638 | 0.638 | 0.638 | 0.638 |

**Letdown removes 0.120 kg/s.** Against a displacement of 0.31–1.57 kg/s, an unmatched insurge
fills the vessel in about **82 minutes** — and then v2 has no solid regime to hand over to.
So the heatup reds are no longer about the rail, the seam, the correlations or the sub-step
guard. **They are the solid regime, and behind it a real plant question this rebuild has
surfaced and v1 could never show: whether this plant's letdown can accommodate a
Tech-Spec-rate heatup at all.** That is a Q0 measurement and an owner question, not a fix.

### Neither remaining probe is a restore-term fixture — I inherited that from their comments (2026-08-16)

I told the owner that six of the seven flag-on reds were "probes standing on the deleted
`P_restore_rate_gain`, and two of them say so in their own comments." **The comments do say
it. The measurement says otherwise.** Both probes were run on both models at their own layer.

**`mode5_controls` leg 2 — "pressure recovers to a raised setpoint".** The probe's comment is
*"heaters/spray hold the operator's target"*, which I read as a controller claim at a layer
with no controller. Wrong: `V1.autoControl` runs INSIDE `stepPressure`, so proportional
heater/spray control is present engine-direct — it is the M4 *channel* that never engages,
not the pressurizer's own controller.

| after depressurizing to 13.0 MPa, then SP → 15.41 | v1 | v2 |
|---|---|---|
| pzr level | **55.0 %** throughout | **55.0 → 78.9 %** |
| exhausted flag | false | **true** |
| pressure at +900 s, heaters 100 % | 1908 → **2046 psia** | **1855.6 → 1855.6 psia** |
| forced MANUAL full heaters | → **2380 psia**, level drains 55 → 17 % | **no movement at all** |

v1 recovers on **real heater authority**, not the restore term. So this red is not a fixture —
**it is the exhausted near-solid band**, the same blocker as the heatup family. And the reason
v2 gets there is itself physical: `autoControl` sprays to make the depressurization, v2's spray
is REAL WATER joining the liquid region, and 300 s of it fills the node from 55 to 79 %. v1's
spray is a pressure rate and moves no mass, which is why its level never budges.

**`rcp_cavitation`.** Its comment says the setpoint is used to *"hold it low via the setpoint so
it can't recover"*. **That is not true of v1 either** — measured, v1 recovers 1160 → 1211 psia
in the probe's 15 seconds. The claim was wrong when it was written and I repeated it.

| the probe's own 15 s | v1 | v2 |
|---|---|---|
| pressure after | 1211.5 psia | **1247.9 psia** |
| suction subcooling | **4.3 °F** | **12.7 °F** |
| cavitating | true | **true** |
| severity / flow | 0.70 / 50 % | **0.12 / 80 %** |
| exhausted flag | false | **false** |

**The mechanism fires on both.** v2 simply repressurizes 73 % further in the same 15 s, so the
suction margin never collapses as far and the severity band — set on v1's 0.70 — is missed.
That is a v2-moved-the-number case for 3d's A/B, not a driver rewrite.

**So no driver rewrite was warranted for either, and none was made.** The correction that
matters: **every remaining flag-on red is now either the missing solid regime or a band to
re-adjudicate — none of them is waiting on a probe fixture.** And the trap, which is this
document's own standing rule caught in the act: *a load-bearing claim in a code comment is an
inherited claim.* Two comments asserted a mechanism, I repeated both in my own voice to the
owner, and neither survived being run.

### Scoping the solid regime: the trigger is a GAIN, not a geometry (2026-08-16)

Promised before building, and it makes the job smaller and different from how I described it.

**The frozen `mode5_controls` state is not solid.** Reproduced and measured: 79 % level,
`V_liq/V_pzr = 0.7892`, and `f(330.040) = −0.0001` — the node is sitting **on** a root, in a
0.1 psi two-step limit cycle, with heaters at 100 % and pressure going nowhere. The vessel has
0.9 m³ of bubble left. So "the node is water-solid" was the wrong picture.

**What is actually true: there is no equilibrium ABOVE the current root.** Every temperature
above 330.04 has `f < 0` out to the liquid-full boundary (−1.13 at 340 °C, −41.5 at 360 °C).
The heaters push the state where no equilibrium exists, `settle` reports exhaustion, and the
fallback returns it to the root it came from — energy in, nothing out.

**The discriminator is one number: `gain = d[Tsat(P(T))]/dT_liq`.** Heating a saturated node in
a FIXED volume expands the liquid, squeezes the bubble, raises P and therefore Tsat. When Tsat
rises faster than T_liq, the node cannot settle anywhere above and is thermodynamically
committed to going solid. Measured across the band:

| level | bubble (m³) | **gain** | equilibrium above? | heater authority |
|---|---|---|---|---|
| 20 % | 3.434 | 0.082 | yes | 3.017 psi/s |
| 55 % | 1.931 | 0.403 | yes | 2.893 |
| 70 % | 1.288 | 0.770 | yes | 2.858 |
| 74 % | 1.116 | 0.939 | yes | 4.062 |
| **75 %** | **1.073** | **0.990** | yes | 2.958 |
| **78 %** | **0.944** | **1.170** | **no** | **−0.124** |
| 85 % | 0.644 | 1.870 | no | −0.000 |

**Heater authority falls off a cliff exactly where the gain crosses 1.0**, at about 75.2 %
level. It is the same gain that made the Picard iteration diverge — one quantity explaining
both failures.

**And this is correct physics, not a modelling artifact.** A nearly-full pressurizer with the
heaters on *does* go solid; that is why level control exists. The model is telling the truth
and has nowhere to hand over to. So `pzr_solid_unresolved` turns out to be named right after
all — it is the solid condition, detected **thermodynamically** rather than geometrically.

**THE SCOPE, then, in one sentence: `stepPressure`'s solid predicate asks the wrong question.**
It asks `V_liq >= V_pzr_m3` — is the vessel full *now* — which at the transition is **false**,
because the vessel is only 75 % full. The physics asks whether an equilibrium exists above the
current state. That is why the handover never happens and the node sits in a limit cycle
instead: **two predicates, both live, and neither of them the right one.**

What building it needs, and none of it is guesswork any more: (1) the solid branch triggers on
the thermodynamic condition rather than the geometric one; (2) `stepRegions` returns the
exhaustion so `stepPressure` can switch branch **within** the step rather than one step late;
(3) the existing bulk-modulus branch then owns pressure, which it already knows how to do.
Open question for the owner rather than for me: whether the geometric predicate stays as a
second, later trigger or is replaced outright — they disagree by about 25 points of level, and
that gap is where every remaining flag-on red lives.

### The conservative solve is well-posed — the caveat on the recommendation is cleared (2026-08-16)

The recommended rewrite replaces flash-then-settle with a single solve: given total mass M,
vessel volume V and internal energy U, find the saturated state. I said it was only a clean
1-D root find if **(a)** quality crosses zero exactly once and **(b)** energy is monotone in
temperature along the volume constraint — and that if (b) failed, the cheap interim patch
would be the better first step. Measured on the model's own correlations and its own energy
accounting, at 0.25 °C resolution:

| node seeded at | total mass | solid point (x = 0) | zero crossings | E monotone where x > 0 |
|---|---|---|---|---|
| **55 %** | 1596.9 kg | none below 373 °C | 0 | **0 of 1013 steps decreasing** |
| **78 %** | 2083.4 kg | **365.75 °C** | 1 | **0 of 983** |
| **95 %** | 2442.9 kg | **351.25 °C** | 1 | **0 of 925** |

**Both conditions hold.** The earlier reading that energy was non-monotone at 95 % was an
artifact of scanning past the solid point: those two decreasing steps are at x < 0, which is
not a state at all. Restricted to the valid two-phase domain the energy curve is strictly
increasing everywhere, and `dE/dT` falls smoothly from ~20.8 to ~15.9 MJ/°C without turning.

**The solid point is unique, well-defined, and well below the critical point** — 365.75 °C at
78 % level, 351.25 °C at 95 %, and a 55 % node never reaches one inside the table. So the
bracket for the solve is `[T_lo, T_solid]`, both ends computable, with a single root inside.

**So the recommendation stands unqualified, and the interim patch is not needed.** The only
way the solve can fail is quality reaching zero — which *is* the vessel being full of liquid,
i.e. the geometric predicate, reached by the physics rather than asserted alongside it. The
two conditions stop disagreeing by construction, which was the whole point: `gain > 1` was
never a second solid condition, it was the operator split failing to have an answer.

### The conservative solve is BUILT and MEASURED — and it cannot ship yet (2026-08-17)

*(OWNER RULING, 2026-08-17: "Go")*. Written, exported, A/B'd against the shipped path, and
**deliberately not wired in.** Both halves of that are results.

**Where it is a strict improvement.** It is a fixed point of an already-settled state to
**1e-11 °C** at every level from 20 to 95 %, and heater authority becomes **continuous across
the whole band**:

| level % | 20 | 55 | 70 | 75 | 78 | 85 | 95 |
|---|---|---|---|---|---|---|---|
| **shipped** (flash + settle) | 3.017 | 2.893 | 2.858 | 2.958 | **−0.124** | **−0.000** | **−0.000** |
| **conservative solve** | 2.563 | 2.843 | 2.835 | 2.826 | **2.818** | **2.799** | **2.765** |

and it reports `solid` **false** at every one of them. So the scoping call was right: **the
"no equilibrium above 75 %" cliff is an artifact of the operator split, not a property of the
plant.** On the captured railing step it returns 210.1 psia against the shipped path's 176.0,
both bounded, neither railing.

**Why it cannot ship: the model has no state function for energy.** Wired in, a heater step
**leaks 9.79 % at 55 % level** — the node gains **1618.5 kJ of a delivered 1794.0**, with no
surge in the case to defer any of it through the mixing bank. The fault is not in the solve.
Heat is injected as `T += Q/C` against the **liquid + metal** capacity, while any (M, V, U)
solve must account the **whole mass**; the two disagree by exactly the steam's share. Measured
across cases: −9.79 % (heaters at 55 %), −2.46 % (heaters at 85 %), +1.85 % (spray), +10.64 %
(insurge — that one *is* the mixing bank and is expected), 0.00 % (quiet).

**So the job is bigger than "replace the solve", and this is the finding.** The injection side
has to be converted with it: heater, spray and surge enthalpy added to U directly rather than
as a temperature step against a partial capacity. Until then `solveFlash` + `settle` stays,
and the functions sit exported and unused with the measurement in their header.

**Four checks it would move, none of them adjudicated** — recorded so the next session does
not discover them as surprises: **C1b** measures the OLD decomposition's own identity
(`E = mf·h_fg + C·ΔTsat`) and is stale by construction once the split goes — it should become
a *total energy* check, which is strictly stronger. **E1**'s stratification contrast weakens:
instant-mix peaks **+6.578 psi** where it used to fall, and whether that is the conservative
answer or a defect is unsettled. **C4b**'s "gently decreasing" ordering inverts (2.563 / 2.843
/ 2.835 at 20 / 55 / 70 — inside the 10 % spread but no longer monotone). **C4c** would need
rewriting a third time, because the gap it pins would be closed.

**The discipline note, since it is the whole reason this entry exists:** the rewrite made the
rail better and the authority cliff disappear, and it would have been easy to land it and
re-band the four checks around it. That is precisely the refit HR10 names. The energy
measurement was taken *because* two of those four are conservation checks, and it found a
9.79 % leak that no amount of re-banding would have made honest.

### The injection side converted — conservation is now EXACT, and the solid branch is the next gap (2026-08-17)

*(OWNER RULING, 2026-08-17: "Next")*. `stepRegions` no longer injects heat as a temperature
step and infers energy from it. Every term adds or removes a known quantity of energy and the
state is solved once from (mass, volume, energy).

| one 1.0 s step | before | after |
|---|---|---|
| heaters full, 55 % | **−9.79 %** | **0.00 %** (residual 3.7e-7 kJ of 1794) |
| heaters full, 85 % | −2.46 % | **0.00 %** |
| spray 2 kg/s @ 290 °C | +1.85 % | **0.00 %** (−5.5e-7 kJ) |
| insurge 4.4 kg/s @ 311.7 °C | +10.64 % | **875.464 kJ — and the bank holds 875.464** |
| quiet | 0.00 % | 0.00 % |

**Stratification survives, and that was the risk.** A single (M, V, U) node is by definition
well mixed, so the deferred enthalpy cannot live inside U. It is now an **energy account**
rather than a temperature offset: the bulk is credited as if the water arrived at the node's
own temperature, and the shortfall is banked and released on the same `dt/(tau+dt)`.
Algebraically identical to the old form, and `E1` — the check that exists to demonstrate
stratification — **passes unchanged**, where a first attempt at the solve had weakened it.

**Four checks moved, all HR10-validated by running the NEW form against the OLD model:**

| | now asserts | on the old model |
|---|---|---|
| **C1a/C1b** | energy IN equals energy STORED, to 1e-6 | **FAIL** — 8.2 % and 0.62 % |
| **C1c** (new) | an insurge's shortfall is BANKED, not lost | **FAIL** — 803.9 kJ residual vs 875.5 banked |
| **C4c** | the near-solid band is CONTINUOUS | **FAIL** — 0 psi/s at 85 and 95 %, flag set |
| **C4b** | same family, monotone decreasing, spread < 25 % | passes on both — a declared widening |

C1a/C1b previously measured the residual of the OLD split's own identity
(`E = mf·h_fg + C·ΔTsat`), which is not a claim the model makes any more. Replacing a proxy
with the thing it was a proxy for is why three of these now fail on the old code.

**THE NEXT GAP, found by fixing the one before it.** With no bubble, `pressureFrom` reads the
steam density and returns ~0 — measured, a full-spray ride filled the vessel (steam
191.6 → 0.000 kg) and published **0.0 psia**, a formula being asked a question it cannot
answer. Fixed by holding pressure and handing over, and the solid predicate now reads
`V_liq >= V_pzr **or** the solve found no two-phase state` — the second being the same
statement reached by the physics. *(This is not the rejected `gain > 1` trigger: that fires at
78 % level with 0.944 m³ of bubble left, where bulk modulus overstates the response 30×. This
fires only when there is no steam at all.)*

**But `stepPressure`'s solid branch does not advance the node's masses** — it was written when
the pressurizer had no state of its own. So a genuinely solid node now FREEZES: measured, m_liq
pinned at 2143.9 kg and T_liq at 363.71 °C while spray kept running. Bounded and obvious rather
than a rail, but wrong, and it is the next piece.

**Where this leaves the flagged model.** `run_pzr2` **49/49**. Flag-off `run_all` at baseline —
the shipped plant is untouched. Flag-on `run_pwr` **33/37, the same suite count as before the
conversion**, with the reds redistributed: the spray crash to containment and the −280 °C
superheat are gone; the cooldown family has picked up four (RHR alignment, the RHR interlock
depressurization, cold-shutdown arrival, and its subcooling leg) and `pressure tracks a lowered
setpoint` still misses at 14.21 MPa against 13.0 ± 1. **Parity on suites with conservation now
exact is a real gain, but the cooldown regression is not adjudicated and must be** — it is the
first thing to look at, not the freeze.

### The cooldown reds adjudicated — one chain, and one of the old passes was hollow (2026-08-17)

*(OWNER RULING, 2026-08-17: "Next")*. Five checks changed state across the energy conversion.
Measured on both models at the same layer, one at a time.

**`pressure tracks a lowered setpoint` — the OLD PASS WAS HOLLOW.** Setpoint to 13.0 MPa, 300 s,
traced step by step:

| t (s) | 0 | 100 | 200 | **250** | 300 |
|---|---|---|---|---|---|
| **before** (psia) | 2235.0 | 2173.5 | 2081.7 | **1855.6 — `solid=true`, spray → 0.0 %** | 1855.7 |
| **after** (psia) | 2235.0 | 2169.3 | 2111.2 | 2084.8 | 2060.9 |

The old model reached 12.79 MPa — inside the probe's 13.0 ± 1 band — **by falling into the
exhausted state and freezing there**, with the spray shut off and nothing moving for the last
50 s. That is a pass produced by the very defect the conversion removes. The new model
depressurizes continuously and honestly; it simply does not reach the band in 300 s.
**Not a regression. The check needs a longer window, once the freeze below is fixed.**

**The four cooldown reds are ONE CHAIN, and it is the freeze.** Instrumented over the whole
roundtrip:

| | steps | **exhausted** | **pressure frozen** | lowest P reached |
|---|---|---|---|---|
| **before** | 397,000 | **95.4 %** | **17.9 %** | 0.086 MPa |
| **after** | 927,000 | **98.0 %** | **2.4 %** | 0.100 MPa |

**The exhaustion is not new** — the pre-conversion model already spent 95.4 % of the roundtrip
there, so the conversion did not cause it. What the conversion did is cut *freezing* from
17.9 % to 2.4 %: the node now moves where it used to be stuck, which is why
`pressure recovers to a raised setpoint` went **green** (12.79 → 12.79 before).

The chain, end to end: the heatup fills the node solid at t ≈ 1000 s (letdown removes
0.120 kg/s against 0.31–1.57 kg/s of thermal displacement) → the node stays solid for the rest
of the run → **`stepPressure`'s solid branch does not advance the node's masses**, so spray has
no bubble to condense and no way to make one → the cooldown cannot get below **4.06 MPa**
against the 2.76 MPa RHR interlock → RHR never aligns → cold shutdown is never reached → the
subcooling leg follows. **Four reds, one cause.**

**So the freeze is not a corner case.** It was found on a synthetic full-spray probe and looked
like one; measured here it governs 98 % of the plant's longest evolution. It is the next thing,
ahead of everything else on this issue — and the fix is specific: the solid branch predates the
pressurizer having state, and has to advance `pzr_m_liq_kg` / `pzr_m_stm_kg` with the surge
while bulk modulus owns pressure.
