# PWR Pressurizer — rebuild dossier

**Status: RESEARCH COMPLETE, SCOPE RULED, BUILD NOT PLANNED.** This document is the **harvest** —
step 1 of the owner-approved method below. It is deliberately *not* a plan. The plan is Fable's
to write, and **§0 is the ruled scope it must be written to.**

---

## 0. RULED SCOPE — read this first

*(OWNER RULINGS, 2026-08-12, given as numbered answers to a decision list: "1: B  2: A  3: A
4: A and then B after the pzr  5: yes, behind, rename")*

| # | Decision | Ruling |
|---|---|---|
| 1 | Rebuild scope | **B — THE WHOLE PRESSURIZER**, level *and* authority together. **This overrides my recommendation of A** (authority half only). See the risk note below — it is not an objection, it is the thing the plan must handle. |
| 2 | Pressurizer temperature node | **A — include it in the rebuilt structure.** Liquid region, steam region, saturation between. Not an add-on; the shape of the new model. |
| 3 | Heater elevation | **A — physical elevation with progressive authority loss** as the level falls through the bank. Replaces the 17 % cliff. |
| 4 | Spec audit (#471) | **A now, B after the pressurizer** — cheap manual-mode-row filter across all auto systems first; full 59-row + coupling audit once the pressurizer is the worked example. |
| 5 | Everything else | NOP findings 4–8 go **behind** this work · **do the SDM rename** · findings 2 and 8 proceed. |

### The risk that scope B carries, stated plainly

The level half is the half that has had **recent sourced work that landed well** — #385 (the
pressurizer inventory node), #424 (the small-break lift, IE Bulletins 79-06A/C), #337 (the surge
law), #362 (the clip removal). Rebuilding it means re-deriving all four rather than inheriting
them, and it puts **§6.5, the TMI deception, directly in the blast radius**: that behaviour is a
*difference* between three level constants, and it is the flagship's entire teaching payload.

**The plan must make the deception an explicit, measured acceptance row characterised BEFORE any
code is written** (method step 3), not a behaviour hoped to fall out of better physics. That is
the single highest-risk item in scope B and the one most likely to be discovered late.

### Two additions ruled in the same message

*(OWNER, 2026-08-12: "We need the heater in the diagram to visually match the height the heater
is located in reality. We should think about making the primary loop pipes a physics node or
nodes. Same with the RCP.")*

- **The board's heater must sit at the real elevation** — §6.1a. Tracked separately because it is
  `system-hmi`, but it is the *same* fact as decision 3 and the two must agree: if the model
  loses authority as the level falls through the bank, the player has to be able to **see** the
  bank the level is falling through.
- **Loop piping and RCP as physics nodes** — §6.6. **Not part of this rebuild**, but the
  pressurizer node's interface has to be designed so it does not block them.

**Why it exists.** `engines/pwr/pwr_pressurizer.js` is 794 lines of which **599 are comment**
(75 %). Those comments carry thirteen sourced citations and a dozen recorded failed attempts,
each with the measurement that killed it. A rebuild that starts by deleting the file loses every
one of those reasons and re-earns the mistakes. This document lifts them out first.

*(OWNER, 2026-08-12: "What if we strip the current pressurizer physics and rebuild it from the
ground up so we don't end up with any vestigial odd behaviors. Should we first decide what the
correct behaviors should look like?" — and, on the method proposed in reply, "I like your
suggested method to fix the pressurizer.")*

---

## 1. The method (owner-approved)

1. **Harvest before you strip** — this document.
2. **Amend the behaviour catalog.** `Blueprint/PWR_BEHAVIOR_CATALOG.md` is **v3.1 FROZEN-FINAL**
   with 59 rows, **14 of them pressurizer-related**. It is the acceptance target and it is
   *wrong*: nothing in it asserts the normal-operations surge → pressure coupling, which is
   exactly why the defect in §5 survived. **Unfreeze, audit, amend, owner rules.**
3. **Characterise the CURRENT plant against the amended set.** Measure what it does today on
   every behaviour, so the rebuild can tell **"correct, must survive"** from **"vestigial, must
   die."** Skipping this makes every red during the rebuild ambiguous.
4. **Build alongside, not in place.** New module, switchable, A/B against the old on the same
   scenarios. 23 runners and 11 scenarios are downstream; a big-bang cutover produces dozens of
   simultaneous reds, which is the condition under which real defects hide.

### 1.1 Testing order — MANUAL FIRST, THEN AUTO

> *(OWNER DIRECTIVE, 2026-08-12: "Testing of systems should happen without automatic mode first.
> Once proper manual behavior is established we test auto mode. This goes for all systems with an
> auto mode.")*

**This is general, not pressurizer-specific** — it is recorded in `CLAUDE.md` because it binds
every system with an auto mode. It is also the directive that would have caught §5 years ago: the
masking term is *indistinguishable from the physics* whenever the controllers are on, and every
existing gate asserts endpoints with them on.

For this rebuild it means the acceptance order is: **heaters and spray in MANUAL (or off)** →
establish that surge, relief, saturation and inventory behave correctly on their own → *then*
engage the automatic pressure channel and test that it holds what manual proved.

---

## 2. Sourced claims that MUST SURVIVE the rebuild

Thirteen citations are embedded in the current model. Losing any of them means re-running an
evidence pass that has already been paid for.

| # | Claim | Source |
|---|---|---|
| S1 | **Heater cutoff at 17 % level**, restoring at 20 % — *"This bistable provides a low level interlock at 17% level … turns off all pressurizer heaters. … the heater cutoff protects the heaters which would be damaged if operated in a steam environment."* | WTSM 10.3 §10.3.4.1, **ML11223A290** |
| S2 | **Heaters are physically low in the vessel** — *"replaceable, direct-immersion, tubular-sheath type heaters … located in the lower portion of the pressurizer vessel."* **This is the source for the owner's heater-elevation question (§6.1).** | WTSM 3.2, **ML11223A213** |
| S3 | **The surge law, stated without reference to cause** — *"Temperature changes produces changes in coolant density, which force water into (insurge) or out of (outsurge) the pressurizer. … the contraction of the coolant produces an outsurge … accommodated by an expansion of the steam bubble and a corresponding decrease in steam density and pressure."* | WTSM 3.2 p. 3.2-8, **ML11223A213** |
| S4 | **Level program limits 25 % / 61.5 %** — *"both minimum and maximum level limitations are placed on the level program."* | WTSM 10.3, **ML11223A290** |
| S5 | **Station blackout kills the heaters; loss of offsite power does NOT.** SBO is *"the complete loss of alternating current … does not include the loss of available ac power to buses fed by station batteries through inverters."* Minimum heater group is on diesel-backed buses precisely so it survives a LOOP. | 10 CFR 50.2; NUREG-0578 2.1.1; NUREG-0737 II.E.3.1 |
| S6 | **Heaters shed on a safety injection signal** | NUREG-0737 II.E.3.1 (7); Ginna TS Bases B 3.4.9 |
| S7 | **A vented RCS equalises with containment** — *"In a short time the reactor coolant system has flashed to steam and the pressure has equalized with the pressure inside the containment. At this time the blowdown phase … has ended."* | WTSM 5.0 §5.0.1.1 |
| S8 | **Small-break pressurizer level LIFT is real** (level rises while inventory falls) | IE Bulletins **79-06A / 79-06C** (#424) |
| S9 | **Heater authority ceiling** — 78 heaters, 1794 kW total ⇒ **1.586e-3 MPa/s** of real-time full-heater pressure authority | WTSM, quoted at `K_heater` in `pwr_config.js` |
| S10 | **Spray capacity** — *"the total spray capacity was 52.2 lbm/sec"* = 23.68 kg/s | quoted at `K_spray` in `pwr_config.js` |
| S11 | Rate-sensitive setpoints, PORV/safety setpoints, spray start/full-open bands (2260 / 2310 psig, PORV 2335 psig) | WTSM 10.2, **ML11223A287** |
| S12 | Heatup/cooldown rate limit **100 °F/hr** | ML11223A342 App 19-1; ML11223A213 Table 3.2-10 |
| S13 | Two level channels, one for control + letdown isolation + heater cutoff, the other backup | WTSM 10.3, **ML11223A290** |

---

## 3. The DO-NOT-REPEAT list — every recorded failure, with its measurement

**These are not hypotheticals.** Each was built, measured, and reverted or fixed. A ground-up
rebuild is free to solve them differently — it is *not* free to re-introduce them unknowingly.

| # | What was tried / missing | What it measured |
|---|---|---|
| #337 | Surge driven by **thermal expansion only** | An SGTR took pzr level 55.0 → 15.7 % and moved pressure **5 psi**, subcooling **0.2 °F** |
| #334 | **No low-level heater cutoff** | Heaters at 92 % with level reading a flat 0 drove the RCS to **2207 psi with the coolant 240 °C subcooled**; ECCS deadheaded (0.0034 frac/s against a 0.050 leak); core drained and stayed dry; outcome **non-monotonic in break size** (10 % and 15 % breaks survived, 5 % did not) |
| #348 | Cutoff as a bistable **with no reset differential** | Heater bank flickered on for **35 % of every sample below setpoint**, runs of up to 8, all between 16.3 % and 17.0 % — ~1 MW cycling at the evaluation cadence |
| #447 | Cutoff as a **bare threshold** | ~40 s limit cycle after **every** LOCA: heaters cut → pressure floors at containment → ECCS refills past 20 % → heaters return at **full demand** → 0.29 MPa/s takes pressure **15 → 163 psia in 3 s**. 134 cycles at sev 0.05 (839 psia excursion), up to 936 at sev 1.0 |
| #346 | **No solid-plant surge gain** (mass discarded at the clip) | A solid RCS taking 0.024 frac/s of SI with no relief path reported **zero surge** and sat flat at 15.39 MPa for 45 minutes while ECCS never terminated |
| #347 | **Spray retained authority at water-solid** | Spray pinned at its 0.120 cap held pressure at **2320 psi — 164 psi BELOW the code safeties**, so they never lifted, the fill was arrested by nothing, and inventory walked to the 120.00 % `mass_max` clip |
| #361 | `leak_depress` **double-counted** against the surge | 0.938 MPa/s of leak_depress against ~0.26 MPa/s of surge: pressure sat at **327 psi**, never reached ECCS shutoff head, inventory walked to the clip at 21 min and pinned there with **274 °F of subcooling** |
| #384 s4 | **Saturation pin with no vent term** on an open break | A full-size break **floored at 9.4× saturation** with the hole open |
| #384 s4 | Surge reading `_dTavg_dt` raw while `levelBase` **floored** | Phantom contraction room (**−2.9 %/s**) out-credited the insurge (**+2.4 %/s**), solid arrest never fired, inventory rode to the clip — *"#361's signature by a THIRD road"* |
| 2026-08-07 | Relief keeping **steam-space gains at solid** | Bubble-gain K parked pressure at the PORV band; the valve's real 2.5e-4 frac/s could not pass 3.3e-4 of unterminated ECCS — the clip again, *"a fourth road"* |
| #408 w1 | **Restore term active with a hole open** | It balanced `leak_depress` at **6.9 MPa** and held a drained sev-0.1 RCS there **until clad damage** |
| #408 w1 | **Restore term active with heaters cut** | Parked a TMI-fraction stuck-PORV plant at **10.93 MPa, 21 °F subcooled, FOREVER** — the deception arc could never reach saturation |
| 2026-08-07 | **Restore term active at solid** | At P 16.15 it soaked **−0.015 MPa/s**, the PORV under-cycled ~50 %, inventory crept to the clip |
| #362 | `levelBase` **clipped at 100 %** | Contradicted the stated design; the clip bound on **95.7 % of loss-of-heat-sink samples and 0.0 % of every other IC**, so removing it reddened nothing — no probe stood where it bound |
| #365 | Claim that a mass **surplus reads ~3× steeper** | **False** — both slopes are 776 %/frac and have been equal since #330 |

**The meta-lesson in that table.** Six separate entries are the *same defect* — inventory walking
to the `mass_max` clip — reached by six different roads, each fixed by a local gate. That is the
signature of a model being re-dressed rather than re-derived, and it is the argument for the
rebuild. The comments say so themselves: *"the #334 heater-deadhead shape, third clothing"* and
*"the fourth clothing."*

---

## 4. The accretion map — four pressure authorities, four different gates

`dP` (line 446) sums these. **Each was added for a real measured reason. The problem is the
ensemble, not any one of them.**

| Authority | Constant | Gated off when |
|---|---|---|
| **Heaters** | `K_heater` **0.55** — ~**27× the sourced 1.586e-3 ceiling** (S9). A *declared* departure, `Manuals/12` §12.15 | `ac_available === false` (S5) · `_heater_cut` latch 17 %/20 % (S1) · `_heater_shed` on SI (S6) |
| **Spray** | `K_spray`, capped by `spray_flow_max` 0.12 | scaled by `flow_frac` (no RCP, no spray) · tapered to zero across a band above Psat(Thot) · **zeroed at water-solid** (#347) |
| **Saturation pin** | `K_sat_pull` — flashing pins P at Psat(Tavg) | weakened by void when a loop break vents (#384 s4), plus a `K_break_vent` term |
| **Restore stand-in** | `P_restore_rate_gain` — *"a stand-in for heater/charging authority"* | `loopBreak` · `_heater_cut` · `solid` — **but NOT on whether the operator has the controllers in AUTO. This is the §5 defect.** |
| *(relief)* | `K_porv_relief` / `K_safety_relief`, switching to `solid_bulk_mpa` at solid | — |

Surge gain switches too: `K_surge_level` in a bubbled vessel, `solid_bulk_mpa / level_per_mass`
when solid.

**22 `[tune]` constants** live in the pressurizer config block.

---

## 5. The defect that started this — MEASURED

Full stack, `hot_full_power`, **pressure channel disengaged** (heaters 0.0018 %, spray 0), load
100 → 70 MWe and back:

| | Level | Pressure | Subcooling |
|---|---|---|---|
| As shipped | 55.0 → **63.2 %** | **2235 psi — never moves** | 72.9 °F |
| `P_restore_rate_gain × 0.001` | 55.0 → **61.5 %** | **2235 → 2266 psi (+31)** | **62.2 °F (−10.7)** |

**The surge → pressure coupling exists and works. The restore term masks it.** With the
controllers off, the plant still drags pressure to the operator's setpoint.

**Caveat that matters for the rebuild:** `K_surge_level` has therefore **never been validated in
normal operations**, because nothing could see it. The +31 psi is the right sign and order and is
*not* a calibrated number. Same family as the standing trap *"a term that is an IDENTITY in the
regime you test in is a term nothing tests."*

---

## 6. Open questions the spec (step 2) must answer

### 6.1 Heater elevation — the owner's proposal
*(OWNER, 2026-08-12: "We might also consider the height of the heaters and then losing authority
if the water level is below them.")*

**Sourced and well-founded** — S2 puts the heaters *"in the lower portion of the pressurizer
vessel"*, and S1's 17 % bistable exists precisely because they can be uncovered. Today it is a
**cliff** (0 or full), and #348 and #447 are both records of what a cliff does. A physical
elevation with authority falling off as the bank uncovers would replace two patches with one
mechanism. **Recommended for the spec.**

### 6.1a The BOARD must show the heaters where they physically are
*(OWNER, 2026-08-12: "We need the heater in the diagram to visually match the height the heater
is located in reality.")* **RULED IN.**

This is the visual half of §6.1 and the two are one fact. S2 puts the bank *"in the lower portion
of the pressurizer vessel"*; if the model loses heater authority progressively as the level falls
through the bank, the player must be able to see the bank the level is falling through — an
authority that changes at an invisible elevation is an orphan control by the DESIGN_CRITERIA Q4
test.

**Board editing is not free-form — read the trap before touching it.** `pwr_board_data.js` is
**GENERATED**; never hand-edit it. Re-export-safe changes go through `EXTRA_ITEMS` /
`extraItems()` / `DOC_PATCHES`, a re-export changes PIPE ids, and
`node test/verify_board_check.js` must be run after any board change. `RD.PwrBoard.ports()`
turns an alignment claim into a subtraction — **measure the board, do not eyeball it** — and
screenshot it, because art overlap is invisible to an item-vs-item scan. Full list: `CLAUDE.md`
standing procedure.

Tracked as its own `system-hmi` issue because it lands in a different subsystem, but **it must
ship agreeing with whatever decision 3 builds.**

### 6.2 Does the rebuild need a pressurizer temperature node?
A properly structured pressurizer has a liquid region, a steam region and saturation between
them — the node is the natural shape of the rebuilt model, **not an add-on to the current one**.
It is also the prerequisite for a solid-plant bubble draw (`Manuals/04` PWR-N01 has no bubble
step; WTSM 19.2.2 makes drawing it the first evolution of a heatup). **It should be decided as
part of the structure, not as a separate feature.**

### 6.3 What replaces `P_restore_rate_gain`?
Its own comment says it stands in for heater **and charging** authority. Charging is a separate
channel (`cvcs_makeup`). So "gate it on the controllers being engaged" needs *which* controllers
defined before anyone touches it.

### 6.4 What is `K_heater` for?
0.55 against a sourced 1.586e-3 ceiling, declared in `Manuals/12` §12.15 as *"heater authority is
far above the real one, so pressure droops LESS than it should during a loss of inventory."* A
rebuild either honours the source or re-declares the departure with a reason.

### 6.5 The TMI deception — a NAMED PRESERVED BEHAVIOUR
The deception is a **difference between three level constants** (`level_per_mass` 776,
`level_per_void` 375.33, `level_per_tavg` 1.62). The flagship's entire teaching payload rests on
that calibration. It must be an explicit acceptance row, not something hoped to fall out of
better physics.

---

### 6.6 Loop piping and the RCP as physics nodes — NOT this rebuild, but do not block it
*(OWNER, 2026-08-12: "We should think about making the primary loop pipes a physics node or
nodes. Same with the RCP.")*

**The plant is already partly nodalised, which is the argument that this is a continuation rather
than a new direction.** It has loop *pressure* nodes (`p_coldleg`, `p_hotleg`, `p_pumpsuction`,
`computeNodePressures()`), an SG tube node (#418, the `C_tube` capacity rule), and a pressurizer
inventory node (#385). What is still lumped is loop **thermal and inventory** state — one Tavg
with a hot/cold split, and transport modelled as a time constant scaled by flow
(`tau / flow_frac`) rather than as mass moving between nodes.

**What node-ifying the legs and the RCP would buy** (unmeasured — this is a design argument, not
a measurement):

- **Transport becomes structural**, not a fitted τ. Loop transit time falls out of node volumes
  and flow instead of being a constant that has to be re-tuned whenever flow changes meaning.
- **Cold-water addition becomes reachable.** WTSM App 19-1 caps RCS temperature at 160 °F during
  the early heatup *"based on cold water addition accident … the ΔT between seal injection water
  accumulating in the intermediate leg and the remainder of the RCS."* That is a real prototypical
  limit we currently cannot express, because there is no intermediate leg to accumulate in.
- **Natural circulation and stratification** get somewhere to live. Today the natural-circulation
  magnitude is fitted and declared (`Manuals/12` §12.4).
- **The RCP as a node** makes pump heat a located source rather than a fraction of core heat
  (`pump_heat_frac` 0.55 %) — and pump heat is the entire heat source of PWR-N01.

**Why it is NOT in this rebuild.** It is a larger change than the pressurizer and it touches every
system; doing both at once compounds two large blast radii and makes every red ambiguous, which is
the failure mode method step 4 exists to avoid. `Manuals/12` §12.2 also currently *declares* one
lumped loop as adequate for this plant's goals — that declaration should be re-argued on its own
evidence, not quietly overturned inside a pressurizer commit.

**What this rebuild owes it: an interface, not an implementation.** The pressurizer node connects
to the loop somewhere. Design that connection as a **node boundary** — a surge line between the
pressurizer and a hot-leg *node*, even if that node is initially the existing lumped loop wearing
a node's interface — so leg nodalisation later is a substitution rather than a re-write. Getting
this wrong is the one way the pressurizer rebuild could make the loop work harder later.

**Recommended as a separate spec**, informed by whatever the pressurizer rebuild learns about
node interfaces.

## 7. Blast radius

```
engines/pwr/pwr_pressurizer.js   794 lines (599 comment)
pressurizer [tune] constants     22
sourced citations                13
dependent runners                23
dependent scenarios              11
behaviour catalog rows           59 total, 14 pressurizer
```

The **level/inventory half is in better shape than the authority half** — it has had recent
sourced work that landed well (#385 node stages, #424 IE Bulletin lift, #337 surge law, #362 clip
removal). The accretion is concentrated in the **pressure-authority** half. A defensible scoping
is: spec *all* of it in step 2, rebuild the **authority half** first, and let step 3's
characterisation say whether the level half needs it too.

---

## 8. Where to look

| | |
|---|---|
| The model | `engines/pwr/pwr_pressurizer.js` — read the comments, they are the record |
| Constants | `engines/pwr/pwr_config.js`, `pressurizer:` block |
| Acceptance target | `Blueprint/PWR_BEHAVIOR_CATALOG.md` (v3.1 FROZEN-FINAL — **unfreeze it**) |
| Declared departures | `Manuals/12` §12.4c, §12.5, §12.15 |
| Level constants trap | `CLAUDE.md` standing list — *"the pressurizer's level constants are ONE object … touch one, re-solve the set"* |
| History | `Diagnostic/TUNING_LOG.md`, search the issue numbers in §3 |
| Measurement harness | `node test/measure_stack.js` — full stack, `--nudge=<path*factor>` overrides one config constant, which is how §5 was proved |
